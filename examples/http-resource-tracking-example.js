// server.js
// WS402 Server - HTTP Resources with WebSocket Time Tracking

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { WS402, MockPaymentProvider } = require('ws402');

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws402' });

// ===== RESOURCES DATABASE =====
const RESOURCES = {
  'pdf-report-2024': {
    type: 'pdf',
    path: './files/report-2024.pdf',
    filename: 'Annual Report 2024.pdf',
    contentType: 'application/pdf',
    estimatedReadTime: 600, // 10 minutes
    pricePerSecond: 5,
  },
  'ebook-guide': {
    type: 'pdf',
    path: './files/guide.pdf',
    filename: 'Complete Guide.pdf',
    contentType: 'application/pdf',
    estimatedReadTime: 1800, // 30 minutes
    pricePerSecond: 3,
  },
  'image-premium': {
    type: 'image',
    path: './images/premium.jpg',
    filename: 'premium-image.jpg',
    contentType: 'image/jpeg',
    estimatedReadTime: 300, // 5 minutes
    pricePerSecond: 2,
  }
};

// HTTP sessions manager
const httpSessions = new Map();

// ===== INITIALIZE WS402 =====
const ws402 = new WS402(
  {
    updateInterval: 3000,
    
    userIdExtractor: (req) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      return url.searchParams.get('userId') || 'anonymous';
    },
    
    onPaymentVerified: (session) => {
      console.log(`✅ Payment verified for session ${session.sessionId}`);
    },
    
    onSessionEnd: (session) => {
      console.log(`🔚 Session ended: ${session.sessionId}`);
      console.log(`   Time used: ${session.elapsedSeconds}s`);
      console.log(`   Amount: ${session.consumedAmount} wei`);
      
      // Remove HTTP session
      for (const [token, httpSession] of httpSessions.entries()) {
        if (httpSession.sessionId === session.sessionId) {
          httpSessions.delete(token);
          console.log(`🗑️  Removed HTTP token`);
          break;
        }
      }
    },
  },
  new MockPaymentProvider()
);

// ===== WEBSOCKET CONNECTION HANDLER =====
const wsConnections = new Map();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const resourceId = url.searchParams.get('resourceId');
  const userId = url.searchParams.get('userId');

  console.log(`🔌 WebSocket connection: userId=${userId}, resourceId=${resourceId}`);

  const connectionId = `${userId}_${Date.now()}`;
  wsConnections.set(connectionId, { ws, resourceId });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'payment_proof') {
        // Wait for WS402 to process payment
        setTimeout(() => {
          const sessions = ws402.getActiveSessions();
          const userSession = sessions.find(s => s.userId === userId);
          
          if (userSession) {
            // Generate HTTP access token
            const httpToken = generateHTTPToken();
            
            httpSessions.set(httpToken, {
              sessionId: userSession.sessionId,
              resourceId: resourceId,
              startTime: Date.now(),
            });
            
            // Send HTTP token to client
            ws.send(JSON.stringify({
              type: 'http_access_granted',
              sessionId: userSession.sessionId,
              httpToken: httpToken,
              resourceUrl: `https://demo-http.ws402.org/api/resource/${resourceId}?token=${httpToken}`,
              message: 'You can now access the resource via HTTP',
            }));
            
            console.log(`✅ HTTP access granted`);
          }
        }, 1500);
      }
    } catch (e) {
      // Ignore parse errors
    }
  });

  ws.on('close', () => {
    wsConnections.delete(connectionId);
  });
});

// ===== ATTACH WS402 =====
ws402.attach(wss);

// ===== HTTP ROUTES =====

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/public/pdf.html'));
});

// Get resource schema
app.get('/api/resource/:resourceId/schema', (req, res) => {
  const resourceId = req.params.resourceId;
  const resource = RESOURCES[resourceId];
  
  if (!resource) {
    return res.status(404).json({ error: 'Resource not found' });
  }
  
  const schema = ws402.generateSchema(resourceId, resource.estimatedReadTime);
  schema.pricing.pricePerSecond = resource.pricePerSecond;
  schema.pricing.totalPrice = resource.pricePerSecond * resource.estimatedReadTime;
  schema.websocketEndpoint = `wss://demo-http.ws402.org/ws402?resourceId=${resourceId}`;
  
  res.json({
    resource: {
      id: resourceId,
      type: resource.type,
      filename: resource.filename,
      estimatedTime: resource.estimatedReadTime,
    },
    ws402Schema: schema,
  });
});

// Access HTTP resource (protected)
app.get('/api/resource/:resourceId', (req, res) => {
  const resourceId = req.params.resourceId;
  const token = req.query.token;
  
  // Verify token
  const httpSession = httpSessions.get(token);
  
  if (!httpSession) {
    return res.status(403).json({
      error: 'Access Denied',
      message: 'Invalid or expired token. Establish WS402 session first.',
    });
  }
  
  if (httpSession.resourceId !== resourceId) {
    return res.status(403).json({
      error: 'Access Denied',
      message: 'Token is for a different resource',
    });
  }
  
  const resource = RESOURCES[resourceId];
  
  if (!resource) {
    return res.status(404).json({ error: 'Resource not found' });
  }
  
  console.log(`📄 Serving ${resource.type}: ${resource.filename}`);
  console.log(`   Session: ${httpSession.sessionId}`);
  
  // Set headers
  res.setHeader('Content-Type', resource.contentType);
  res.setHeader('Content-Disposition', `inline; filename="${resource.filename}"`);
  res.setHeader('X-WS402-Session', httpSession.sessionId);
  res.setHeader('Cache-Control', 'no-store');
  
  // Serve file
  if (fs.existsSync(resource.path)) {
    res.sendFile(path.resolve(resource.path));
  } else {
    console.log(`⚠️  File not found: ${resource.path}, sending mock PDF`);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(generateMockPDF(resource.filename));
  }
});

// List resources
app.get('/api/resources', (req, res) => {
  const resourceList = Object.entries(RESOURCES).map(([id, resource]) => ({
    id,
    type: resource.type,
    filename: resource.filename,
    estimatedTime: resource.estimatedReadTime,
    pricePerSecond: resource.pricePerSecond,
    totalPrice: resource.pricePerSecond * resource.estimatedReadTime,
  }));
  
  res.json({ resources: resourceList });
});

// Active sessions
app.get('/api/admin/sessions', (req, res) => {
  const wsSessions = ws402.getActiveSessions();
  const httpSessionsList = Array.from(httpSessions.entries()).map(([token, session]) => ({
    token: token.substring(0, 20) + '...',
    sessionId: session.sessionId,
    resourceId: session.resourceId,
    elapsedTime: Math.floor((Date.now() - session.startTime) / 1000),
  }));
  
  res.json({
    websocketSessions: wsSessions.length,
    httpSessions: httpSessionsList.length,
    details: {
      websocket: wsSessions.map(s => ({
        sessionId: s.sessionId,
        userId: s.userId,
        elapsedSeconds: s.elapsedSeconds,
        remainingBalance: s.paidAmount - s.consumedAmount,
      })),
      http: httpSessionsList,
    }
  });
});

// ===== HELPER FUNCTIONS =====

function generateHTTPToken() {
  return `http_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateMockPDF(filename) {
  return `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources 4 0 R /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>
endobj
5 0 obj
<< /Length 80 >>
stream
BT
/F1 24 Tf
100 700 Td
(Mock PDF: ${filename}) Tj
0 -30 Td
(WS402 Demo - Time tracking via WebSocket) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 
0000000304 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
434
%%EOF`;
}

// ===== START SERVER =====
const PORT = process.env.PORT || 4029;

server.listen(PORT, () => {
  console.log('===========================================');
  console.log('🚀 WS402 HTTP Resource Tracking Server');
  console.log('===========================================');
  console.log(`\n📍 Frontend: http://localhost:${PORT}`);
  console.log(`\n🔗 Available resources:`);
  Object.keys(RESOURCES).forEach(id => {
    console.log(`  - ${id} (${RESOURCES[id].type})`);
  });
  console.log(`\n💡 The PDF is served via HTTP`);
  console.log(`   Time tracking via WebSocket in background`);
  console.log(`   Automatic refund when session ends`);
  console.log('===========================================');
});
