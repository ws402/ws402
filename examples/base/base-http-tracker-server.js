require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { WS402, BasePaymentProvider } = require('../../dist/index');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws402' });

// =============================
// RESOURCE
// =============================
const RESOURCES = {
  'pdf-report-2024': {
    type: 'pdf',
    path: './files/report-2024.pdf',
    filename: 'Premium Report 2025.pdf',
    contentType: 'application/pdf',
    estimatedReadTime: 600,
    pricePerSecond: 5,
  }
};

const httpSessions = new Map();

const baseProvider = new BasePaymentProvider({
  rpcEndpoint: process.env.BASE_RPC || 'https://sepolia.base.org',
  merchantWallet: process.env.MERCHANT_WALLET,
  merchantPrivateKey: process.env.MERCHANT_PRIVATE_KEY,
  network: process.env.BASE_NETWORK || 'base-sepolia',
  autoRefund: true,
});


const ws402 = new WS402(
  {
    updateInterval: 3000,
    pricePerSecond: 5,
    currency: 'wei',
    maxSessionDuration: 600,

    userIdExtractor: (req) => {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        return url.searchParams.get('userId') || 'anonymous';
      } catch {
        return 'anonymous';
      }
    },

    onPaymentVerified: (session) => {
      console.log(`Payment verified: ${session.sessionId}`);
      console.log(`   User ID: ${session.userId}`);
      console.log(`   Amount: ${session.paidAmount} wei`);

      const resourceId = 'pdf-report-2024';
      const httpToken = `token_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      httpSessions.set(httpToken, {
        sessionId: session.sessionId,
        resourceId,
        userId: session.userId,
      });

      const clientWs = userIdToWs.get(session.userId);

      if (clientWs && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'http_access_granted',
          sessionId: session.sessionId,
          httpToken,
          resourceUrl: `http://localhost:4029/api/resource/${resourceId}?token=${httpToken}`,
        }));
        console.log("http_access_granted SENT SUCCESSFULLY");
      } else {
        console.log("Client not found or WebSocket closed");
      }
    },

    onSessionEnd: (session) => {
      console.log(`Session ended: ${session.elapsedSeconds}s`);
      console.log(`   Refunded: ${session.paidAmount - session.consumedAmount} wei`);

      for (const [token, data] of httpSessions.entries()) {
        if (data.sessionId === session.sessionId) {
          httpSessions.delete(token);
          break;
        }
      }
      userIdToWs.delete(session.userId);
    },
  },
  baseProvider
);


const userIdToWs = ws402.attach(wss); 

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'base-http-tracker-client.html'));
});

app.get('/api/resource/:resourceId/schema', (req, res) => {
  const resourceId = req.params.resourceId;
  const resource = RESOURCES[resourceId];
  if (!resource) return res.status(404).json({ error: 'Resource not found' });

  const schema = ws402.generateSchema(resourceId, resource.estimatedReadTime);
  schema.pricing.pricePerSecond = resource.pricePerSecond;
  schema.pricing.totalPrice = resource.pricePerSecond * resource.estimatedReadTime;
  schema.websocketEndpoint = `ws://localhost:4029/ws402?resourceId=${resourceId}&userId=`;

  res.json({ ws402Schema: schema });
});

app.get('/api/resource/:resourceId', (req, res) => {
  const token = req.query.token;
  const session = httpSessions.get(token);

  if (!session || session.resourceId !== 'pdf-report-2024') {
    return res.status(403).send('Invalid or expired token');
  }

  res.header('Content-Type', 'application/pdf');
  res.header('X-Frame-Options', 'ALLOWALL');
  res.header('Content-Security-Policy', "frame-ancestors 'self' http://localhost:4029");

  const filePath = path.resolve('./files/report-2024.pdf');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.send(`%PDF-1.4
1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj
2 0 obj <</Type/Pages/Kids[3 0 R]/Count 1>> endobj
3 0 obj <</Type/Page/MediaBox[0 0 600 800]/Parent 2 0 R/Contents 4 0 R>> endobj
4 0 obj <</Length 200>> stream
BT /F1 24 Tf 100 700 Td (WS402 + Base - PREMIUM REPORT 2025) Tj
0 -40 Td (You paid 3000 wei) Tj
0 -40 Td (Close tab → automatic refund) Tj ET
endstream endobj
xref 0 5
0000000000 65535 f 
0000000010 00000 n 
0000000074 00000 n 
0000000128 00000 n 
0000000258 00000 n 
trailer <</Size 5/Root 1 0 R>> startxref 400 %%EOF`);
  }
});

// =============================
// START SERVER
// =============================
const PORT = 4029;
server.listen(PORT, () => {
  console.log('========================================');
  console.log('WS402 + Base • Pay-Per-Use Server - FINAL & CLEAN');
  console.log('========================================');
  console.log(`Frontend: http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws402`);
  console.log(`Price: 5 wei/sec → 3000 wei total`);
  console.log(`PDF appears in iframe • Auto refund on close`);
  console.log(`Using clean attach() → userIdToWs map`);
  console.log('========================================');
});