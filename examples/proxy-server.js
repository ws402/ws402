// examples/proxy-server.js
// WS402 Server using ProxyPaymentProvider
// This server delegates all payment operations to a centralized gateway

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { WS402, ProxyPaymentProvider } = require('../dist/index');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Initialize Proxy Payment Provider
const proxyProvider = new ProxyPaymentProvider({
  // Gateway server URL (can be on different machine/cloud)
  gatewayUrl: process.env.GATEWAY_URL || 'http://localhost:4029',
  
  // API key to authenticate with gateway
  apiKey: process.env.GATEWAY_API_KEY || 'your-secret-api-key',
  
  // Request timeout
  timeout: 30000,
  
  // Retry failed requests
  retryAttempts: 3,
});

// Check gateway health on startup
proxyProvider.healthCheck().then(healthy => {
  if (healthy) {
    console.log('✅ Payment gateway is healthy');
  } else {
    console.log('⚠️  Warning: Payment gateway health check failed');
  }
});

// Initialize WS402 with proxy provider
const ws402 = new WS402(
  {
    updateInterval: 3000,
    pricePerSecond: 10,
    currency: 'wei',
    maxSessionDuration: 600,
    
    onPaymentVerified: (session) => {
      console.log(`✅ Payment verified (via gateway) for session ${session.sessionId}`);
      console.log(`   User: ${session.userId}`);
      console.log(`   Amount: ${session.paidAmount} wei`);
    },
    
    onRefundIssued: (session, refund) => {
      console.log(`💰 Refund issued (via gateway): ${refund.amount} wei`);
      console.log(`   Session: ${session.sessionId}`);
    },
    
    onSessionEnd: (session) => {
      console.log(`🔚 Session ended: ${session.sessionId}`);
      console.log(`   Duration: ${session.elapsedSeconds}s`);
      console.log(`   Consumed: ${session.consumedAmount} wei`);
    },
  },
  proxyProvider
);

// Attach WS402 to WebSocket server
ws402.attach(wss);

// Serve HTML client
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'proxy-client.html'));
});

// HTTP endpoint to get WS402 schema with payment details from gateway
app.get('/ws402/schema/:resourceId', async (req, res) => {
  try {
    const resourceId = req.params.resourceId;
    const duration = parseInt(req.query.duration) || 300;
    
    console.log(`📋 Fetching payment schema for ${resourceId} (${duration}s)`);
    
    // Calculate total amount
    const pricePerSecond = 10; // Should match WS402 config
    const totalAmount = pricePerSecond * duration;
    
    // Request payment details from gateway
    const paymentDetails = await proxyProvider.requestPaymentDetails(
      totalAmount,
      resourceId,
      duration
    );
    
    // Build WS402 schema
    const schema = {
      protocol: 'ws402',
      version: '0.1.0',
      resourceId,
      websocketEndpoint: `ws://localhost:${process.env.PORT || 4030}?resourceId=${resourceId}`,
      pricing: {
        pricePerSecond,
        currency: 'wei',
        estimatedDuration: duration,
        totalPrice: totalAmount,
      },
      paymentDetails,
      maxSessionDuration: 600,
    };
    
    res.json(schema);
    
  } catch (error) {
    console.error('❌ Error fetching schema:', error.message);
    res.status(500).json({
      error: 'Failed to fetch payment schema',
      message: error.message,
    });
  }
});

// Status endpoint
app.get('/status', (req, res) => {
  const sessions = ws402.getActiveSessions();
  const gatewayInfo = proxyProvider.getGatewayInfo();
  
  res.json({
    provider: 'Proxy',
    gatewayUrl: gatewayInfo.gatewayUrl,
    activeSessions: sessions.length,
    sessions: sessions.map(s => ({
      sessionId: s.sessionId,
      userId: s.userId,
      elapsedSeconds: s.elapsedSeconds,
      remainingBalance: s.paidAmount - s.consumedAmount,
    })),
  });
});

// Gateway health check endpoint
app.get('/gateway-health', async (req, res) => {
  try {
    const healthy = await proxyProvider.healthCheck();
    res.json({
      status: healthy ? 'ok' : 'unhealthy',
      gatewayUrl: proxyProvider.getGatewayInfo().gatewayUrl,
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: error.message,
    });
  }
});

const PORT = process.env.PORT || 4030;
server.listen(PORT, () => {
  const gatewayInfo = proxyProvider.getGatewayInfo();
  
  console.log('===========================================');
  console.log('🚀 WS402 Server with Proxy Payment Provider');
  console.log('===========================================');
  console.log(`\n🌐 Frontend: http://localhost:${PORT}`);
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`📊 Status: http://localhost:${PORT}/status`);
  console.log(`🔗 Schema: http://localhost:${PORT}/ws402/schema/test-resource?duration=300`);
  console.log(`\n🏦 Payment Gateway: ${gatewayInfo.gatewayUrl}`);
  console.log(`⏱️  Timeout: ${gatewayInfo.timeout}ms`);
  console.log(`🔄 Retry Attempts: ${gatewayInfo.retryAttempts}`);
  console.log(`\n💡 This server does NOT have private keys`);
  console.log(`💡 All payments are processed by the gateway`);
  console.log(`\n💡 Open http://localhost:${PORT} in your browser to start`);
  console.log('===========================================');
});
