// examples/basic-server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { WS402, MockPaymentProvider } = require('ws402');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Initialize payment provider (using mock for demo)
const paymentProvider = new MockPaymentProvider();

// Initialize WS402
const ws402 = new WS402(
  {
    updateInterval: 3000,        // Update every 3 seconds
    pricePerSecond: 10,          // 10 wei per second
    currency: 'wei',
    maxSessionDuration: 600,     // Max 10 minutes
    
    // Callbacks
    onPaymentVerified: (session) => {
      console.log(`✅ Payment verified for session ${session.sessionId}`);
    },
    
    onRefundIssued: (session, refund) => {
      console.log(`💰 Refund issued: ${refund.amount} for session ${session.sessionId}`);
    },
    
    onSessionEnd: (session) => {
      console.log(`🔚 Session ended: ${session.sessionId}`);
      console.log(`   Duration: ${session.elapsedSeconds}s`);
      console.log(`   Consumed: ${session.consumedAmount}`);
      console.log(`   Bytes: ${session.bytesTransferred}`);
    },
  },
  paymentProvider
);

// Attach WS402 to WebSocket server
ws402.attach(wss);

// HTTP endpoint to get WS402 schema
app.get('/ws402/schema/:resourceId', (req, res) => {
  const resourceId = req.params.resourceId;
  const duration = parseInt(req.query.duration) || 300; // 5 minutes default
  
  const schema = ws402.generateSchema(resourceId, duration);
  res.json(schema);
});

// Status endpoint
app.get('/status', (req, res) => {
  const sessions = ws402.getActiveSessions();
  res.json({
    activeSessions: sessions.length,
    sessions: sessions.map(s => ({
      sessionId: s.sessionId,
      userId: s.userId,
      elapsedSeconds: s.elapsedSeconds,
      remainingBalance: s.paidAmount - s.consumedAmount,
    })),
  });
});

const PORT = process.env.PORT || 4028;
server.listen(PORT, () => {
  console.log(`🚀 WS402 Server running on http://localhost:${PORT}`);
  console.log(`📊 Status: http://localhost:${PORT}/status`);
  console.log(`🔗 Schema: http://localhost:${PORT}/ws402/schema/test-resource?duration=300`);
  console.log(`\n🧪 Test with: wscat -c "ws://localhost:${PORT}?userId=alice"`);
});
