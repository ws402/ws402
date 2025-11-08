
// examples/base-server-simple.js
// Simple WS402 Server with Base Payments (no manual refund tracking)

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { WS402, BasePaymentProvider } = require('../../dist/index');
const { ethers } = require('ethers');

// Load environment variables
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files (HTML client)
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Initialize Base Payment Provider
const baseProvider = new BasePaymentProvider({
  rpcEndpoint: process.env.BASE_RPC || 'https://mainnet.base.org',
  merchantWallet: process.env.MERCHANT_WALLET || '0xYOUR_WALLET_ADDRESS_HERE',
  merchantPrivateKey: process.env.MERCHANT_PRIVATE_KEY,
  network: 'base',
  conversionRate: 1,
  paymentTimeout: 300000,
  autoRefund: true,
});

// Initialize WS402 with Base provider
const ws402 = new WS402(
  {
    updateInterval: 3000,
    pricePerSecond: 30000000000000,  // 0.00003 ETH per second (~$0.09/sec at $3000 ETH)
    currency: 'wei',
    maxSessionDuration: 60,
    
    onPaymentVerified: (session) => {
      console.log(`✅ Payment verified for session ${session.sessionId}`);
      console.log(`   User: ${session.userId}`);
      console.log(`   Amount: ${ethers.formatEther(session.paidAmount)} ETH`);
    },
    
    onRefundIssued: (session, refund) => {
      console.log(`💰 Refund issued: ${ethers.formatEther(refund.amount)} ETH`);
      console.log(`   Session: ${session.sessionId}`);
    },
    
    onSessionEnd: (session) => {
      console.log(`🔚 Session ended: ${session.sessionId}`);
      console.log(`   Duration: ${session.elapsedSeconds}s`);
      console.log(`   Consumed: ${ethers.formatEther(session.consumedAmount)} ETH`);
      console.log(`   Refund: ${ethers.formatEther(session.paidAmount - session.consumedAmount)} ETH`);
    },
  },
  baseProvider
);

// Attach WS402 to WebSocket server
ws402.attach(wss);

// Serve HTML client
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/public/base-client.html'));
});

// HTTP endpoint to get WS402 schema with Base payment details
app.get('/ws402/schema/:resourceId', (req, res) => {
  const resourceId = req.params.resourceId;
  const duration = parseInt(req.query.duration) || 10;
  
  const schema = ws402.generateSchema(resourceId, duration);
  
  res.json(schema);
});

// Status endpoint
app.get('/status', (req, res) => {
  const sessions = ws402.getActiveSessions();
  const connectionInfo = baseProvider.getConnectionInfo();
  
  res.json({
    provider: 'Base',
    network: connectionInfo.network,
    chainId: connectionInfo.chainId,
    merchantWallet: connectionInfo.merchantWallet,
    autoRefundEnabled: connectionInfo.autoRefundEnabled,
    activeSessions: sessions.length,
    sessions: sessions.map(s => ({
      sessionId: s.sessionId,
      userId: s.userId,
      elapsedSeconds: s.elapsedSeconds,
      remainingBalance: s.paidAmount - s.consumedAmount,
    })),
  });
});

// Cleanup expired payments periodically
setInterval(() => {
  baseProvider.cleanupExpiredPayments();
}, 60000);

const PORT = process.env.PORT || 4028;
server.listen(PORT, () => {
  const connectionInfo = baseProvider.getConnectionInfo();
  
  console.log('===========================================');
  console.log('🚀 WS402 Server with Base Payments');
  console.log('===========================================');
  console.log(`\n🌐 Server: http://localhost:${PORT}`);
  console.log(`📊 Status: http://localhost:${PORT}/status`);
  console.log(`🔗 Schema: http://localhost:${PORT}/ws402/schema/test-resource?duration=10`);
  console.log(`\n💳 Payment Network: ${connectionInfo.network}`);
  console.log(`💰 Chain ID: ${connectionInfo.chainId}`);
  console.log(`💰 Merchant Wallet: ${connectionInfo.merchantWallet}`);
  console.log(`\n🔄 Auto-Refund: ${connectionInfo.autoRefundEnabled ? '✅ Enabled' : '❌ Disabled'}`);
  
  if (!connectionInfo.autoRefundEnabled) {
    console.log('⚠️  Set MERCHANT_PRIVATE_KEY to enable automatic refunds');
  }
  
  console.log(`\n💡 Open http://localhost:${PORT} in your browser`);
  console.log('===========================================');
});