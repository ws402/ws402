require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { WS402, SolanaPaymentProvider } = require('ws402');
const { Connection } = require('@solana/web3.js');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws402' });

// =============================
// RESOURCES WITH DIFFERENT PRICES
// =============================
const RESOURCES = {
  'pdf-report-2024': {
    type: 'pdf',
    path: './public/report-2024.pdf',
    filename: 'Premium Report 2025.pdf',
    contentType: 'application/pdf',
    estimatedReadTime: 600,
    pricePerSecond: 10,
  },
  'pdf-basic-guide': {
    type: 'pdf',
    path: './public/basic-guide.pdf', 
    filename: 'Basic Guide.pdf',
    contentType: 'application/pdf',
    estimatedReadTime: 300,
    pricePerSecond: 50,
  },
  'video-premium-course': {
    type: 'video',
    path: './public/course.mp4',
    filename: 'Premium Course.mp4',
    contentType: 'video/mp4',
    estimatedReadTime: 3600,
    pricePerSecond: 30,
  }
};

const sessionToResource = new Map();
const httpSessions = new Map();

// Initialize Solana Payment Provider
const solanaProvider = new SolanaPaymentProvider({
  rpcEndpoint: process.env.SOLANA_RPC || 'https://api.devnet.solana.com',
  merchantWallet: process.env.MERCHANT_WALLET,
  merchantPrivateKey: process.env.MERCHANT_PRIVATE_KEY,
  network: process.env.SOLANA_NETWORK || 'devnet',
  conversionRate: 1,
  label: 'WS402 Payment',
  message: 'Pay for resource access',
  autoRefund: true,
});

// =============================
// WS402 CONFIGURATION
// =============================
const ws402 = new WS402(
  {
    updateInterval: 3000,
    pricePerSecond: 1000000,
    currency: 'lamports',
    maxSessionDuration: 3600,

    userIdExtractor: (req) => {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const userId = url.searchParams.get('userId') || 'anonymous';
        const resourceId = url.searchParams.get('resourceId');
        if (resourceId) req._resourceId = resourceId;
        return userId;
      } catch {
        return 'anonymous';
      }
    },

    onPaymentVerified: (session) => {
      const resourceId = session._resourceId;
      const resource = RESOURCES[resourceId];
      
      console.log(`✅ Payment verified: ${session.sessionId}`);
      console.log(`   User: ${session.userId.slice(0, 8)}...`);
      console.log(`   Resource: ${resourceId}`);
      console.log(`   Amount: ${(session.paidAmount / 1e9).toFixed(6)} SOL`);
      console.log(`   Price: ${(resource.pricePerSecond / 1e9).toFixed(9)} SOL/sec`);

      sessionToResource.set(session.sessionId, resourceId);
      
      // Override session price with resource-specific price
      session.pricePerSecond = resource.pricePerSecond;

      const httpToken = `token_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      httpSessions.set(httpToken, {
        sessionId: session.sessionId,
        resourceId,
        userId: session.userId,
        pricePerSecond: resource.pricePerSecond,
      });

      const clientWs = userIdToWs.get(session.userId);
      if (clientWs && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'http_access_granted',
          sessionId: session.sessionId,
          httpToken,
          resourceUrl: `https://demo-solana-http.ws402.org/api/resource/${resourceId}?token=${httpToken}`,
          resourceInfo: {
            name: resource.filename,
            type: resource.type,
            pricePerSecond: resource.pricePerSecond,
          }
        }));
      }
    },

    onRefundIssued: (session, refund) => {
      console.log(`💰 Refund: ${(refund.amount / 1e9).toFixed(6)} SOL`);
    },

    onSessionEnd: (session) => {
      const resourceId = sessionToResource.get(session.sessionId);
      console.log(`🔚 Session ended: ${session.sessionId.slice(0, 16)}...`);
      console.log(`   Duration: ${session.elapsedSeconds}s`);
      console.log(`   Consumed: ${(session.consumedAmount / 1e9).toFixed(6)} SOL`);

      sessionToResource.delete(session.sessionId);
      for (const [token, data] of httpSessions.entries()) {
        if (data.sessionId === session.sessionId) {
          httpSessions.delete(token);
          break;
        }
      }
      userIdToWs.delete(session.userId);
    },
  },
  solanaProvider
);

const userIdToWs = ws402.attach(wss);

// =============================
// HTTP ENDPOINTS
// =============================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'solana-http-tracker-client.html'));
});

app.get('/api/resources', (req, res) => {
  const resourceList = Object.entries(RESOURCES).map(([id, resource]) => ({
    id,
    name: resource.filename,
    type: resource.type,
    estimatedTime: resource.estimatedReadTime,
    pricePerSecond: resource.pricePerSecond,
    totalPrice: resource.pricePerSecond * resource.estimatedReadTime,
    priceInSOL: (resource.pricePerSecond * resource.estimatedReadTime / 1e9).toFixed(6),
  }));
  
  res.json({ resources: resourceList });
});

app.get('/api/resource/:resourceId/schema', (req, res) => {
  const resourceId = req.params.resourceId;
  const resource = RESOURCES[resourceId];
  
  if (!resource) {
    return res.status(404).json({ error: 'Resource not found' });
  }

  const schema = ws402.generateSchema(
    resourceId, 
    resource.estimatedReadTime,
    resource.pricePerSecond
  );
  
  schema.websocketEndpoint = `wss://demo-solana-http.ws402.org/ws402?resourceId=${resourceId}&userId=`;
  schema.resourceInfo = {
    name: resource.filename,
    type: resource.type,
    estimatedTime: resource.estimatedReadTime,
  };

  res.json({ ws402Schema: schema });
});

app.get('/api/resource/:resourceId', (req, res) => {
  console.log('Resource access request:', req.params.resourceId);
  const token = req.query.token;
  const requestedResourceId = req.params.resourceId;
  const session = httpSessions.get(token);

  if (!session || session.resourceId !== requestedResourceId) {
    return res.status(403).json({ 
      error: 'Invalid or expired token',
      message: 'Please obtain a valid access token by completing payment'
    });
  }

  const resource = RESOURCES[requestedResourceId];
  if (!resource) {
    return res.status(404).json({ error: 'Resource not found' });
  }

  res.header('Content-Type', resource.contentType);
  res.header('X-Frame-Options', 'ALLOWALL');
  res.header('Content-Security-Policy', "frame-ancestors 'self' https://demo-solana-http.ws402.org");
  res.header('Content-Disposition', `inline; filename="${resource.filename}"`);

  const filePath = path.resolve(resource.path);
  console.log('Serving resource from:', filePath);
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    if (resource.type === 'pdf') {
      res.send(generateDemoPDF(resource, session));
    } else {
      res.status(404).json({ error: 'Resource file not found on server' });
    }
  }
});

function generateDemoPDF(resource, session) {
  const priceSOL = (resource.pricePerSecond * resource.estimatedReadTime / 1e9).toFixed(6);
  
  return `%PDF-1.4
1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj
2 0 obj <</Type/Pages/Kids[3 0 R]/Count 1>> endobj
3 0 obj <</Type/Page/MediaBox[0 0 600 800]/Parent 2 0 R/Contents 4 0 R>> endobj
4 0 obj <</Length 400>> stream
BT /F1 24 Tf 100 700 Td (WS402 + Solana Pay-Per-Use) Tj
0 -50 Td /F1 18 Tf (Resource: ${resource.filename}) Tj
0 -40 Td (Price: ${resource.pricePerSecond} lamports/sec) Tj
0 -40 Td (Total: ${priceSOL} SOL for ${resource.estimatedReadTime}s) Tj
0 -60 Td /F1 16 Tf (Session ID: ${session.sessionId.slice(0, 20)}...) Tj
0 -50 Td /F1 14 Tf (Close this tab to trigger automatic refund!) Tj
0 -40 Td (You only pay for actual time used) Tj
0 -60 Td (Powered by Solana blockchain) Tj ET
endstream endobj
xref 0 5
0000000000 65535 f 
0000000010 00000 n 
0000000074 00000 n 
0000000128 00000 n 
0000000258 00000 n 
trailer <</Size 5/Root 1 0 R>> startxref 650 %%EOF`;
}

app.get('/blockhash', async (req, res) => {
  try {
    const connection = new Connection(
      process.env.SOLANA_RPC || 'https://api.devnet.solana.com',
      'confirmed'
    );
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    res.json({ blockhash, lastValidBlockHeight });
  } catch (error) {
    console.error('Blockhash error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeResources: Object.keys(RESOURCES).length,
    activeSessions: sessionToResource.size,
    network: process.env.SOLANA_NETWORK || 'devnet',
  });
});

// =============================
// START SERVER
// =============================
const PORT = process.env.PORT || 4029;
server.listen(PORT, () => {
  console.log('========================================');
  console.log('🚀 WS402 + Solana Multi-Resource Server');
  console.log('========================================');
  console.log(`Frontend:  http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws402`);
  console.log(`Network:   ${process.env.SOLANA_NETWORK || 'devnet'}`);
  console.log('');
  console.log('📦 Resources:');
  Object.entries(RESOURCES).forEach(([id, resource]) => {
    const priceSOL = (resource.pricePerSecond * resource.estimatedReadTime / 1e9).toFixed(6);
    console.log(`   ${id}: ${priceSOL} SOL (${resource.estimatedReadTime}s)`);
  });
  console.log('========================================');
});