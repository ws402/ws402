// examples/base-server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { WS402 } = require('ws402');
const { BasePaymentProvider } = require('ws402/providers/BasePaymentProvider');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize Base Payment Provider
const baseProvider = new BasePaymentProvider({
  // Use your Base RPC endpoint
  rpcEndpoint: process.env.BASE_RPC || 'https://mainnet.base.org',
  
  // Your merchant wallet to receive payments
  merchantWallet: process.env.MERCHANT_WALLET || '0xYOUR_WALLET_ADDRESS_HERE',
  
  // Network configuration
  network: 'base', // 'base' | 'base-goerli' | 'base-sepolia'
  
  // Conversion rate: 1 wei = X wei on Base
  // Example: if price is 1000 wei per second, it's 1000 wei of ETH on Base
  conversionRate: 1, // 1:1 by default
  
  // Optional: ERC20 token address for token payments
  // erc20Token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base example
  
  // Payment timeout (5 minutes)
  paymentTimeout: 300000,
  
  // Chain ID is set automatically based on network
});

// Initialize WS402 with Base provider
const ws402 = new WS402(
  {
    updateInterval: 3000,        // Update every 3 seconds
    pricePerSecond: 10,          // 10 wei per second
    currency: 'wei',
    maxSessionDuration: 600,     // Max 10 minutes
    
    onPaymentVerified: (session) => {
      console.log(`✅ Base payment verified for session ${session.sessionId}`);
      console.log(`   User: ${session.userId}`);
      console.log(`   Amount: ${session.paidAmount} wei`);
    },
    
    onRefundIssued: (session, refund) => {
      console.log(`💰 Base refund issued: ${refund.amount} wei`);
      console.log(`   Session: ${session.sessionId}`);
    },
    
    onSessionEnd: (session) => {
      console.log(`🔚 Session ended: ${session.sessionId}`);
      console.log(`   Duration: ${session.elapsedSeconds}s`);
      console.log(`   Consumed: ${session.consumedAmount} wei`);
    },
  },
  baseProvider
);

// Attach WS402 to WebSocket server
ws402.attach(wss);

// HTTP endpoint to get WS402 schema with Base payment details
app.get('/ws402/schema/:resourceId', (req, res) => {
  const resourceId = req.params.resourceId;
  const duration = parseInt(req.query.duration) || 300; // 5 minutes default
  
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
    erc20Token: connectionInfo.erc20Token,
    activeSessions: sessions.length,
    sessions: sessions.map(s => ({
      sessionId: s.sessionId,
      userId: s.userId,
      elapsedSeconds: s.elapsedSeconds,
      remainingBalance: s.paidAmount - s.consumedAmount,
    })),
  });
});

// Payment verification endpoint (optional - for testing)
app.post('/verify-payment', express.json(), async (req, res) => {
  try {
    const { txHash, reference, senderAddress } = req.body;
    
    const verification = await baseProvider.verifyPayment({
      txHash,
      reference,
      senderAddress,
    });
    
    res.json(verification);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cleanup expired payments periodically
setInterval(() => {
  baseProvider.cleanupExpiredPayments();
}, 60000); // Every minute

const PORT = process.env.PORT || 4028;
server.listen(PORT, () => {
  console.log('===========================================');
  console.log('🚀 WS402 Server with Base Payments');
  console.log('===========================================');
  console.log(`\n📡 Server: http://localhost:${PORT}`);
  console.log(`📊 Status: http://localhost:${PORT}/status`);
  console.log(`🔗 Schema: http://localhost:${PORT}/ws402/schema/test-resource?duration=300`);
  console.log(`\n💳 Payment Network: ${baseProvider.getConnectionInfo().network}`);
  console.log(`💰 Chain ID: ${baseProvider.getConnectionInfo().chainId}`);
  console.log(`💰 Merchant Wallet: ${baseProvider.getConnectionInfo().merchantWallet}`);
  console.log('\n===========================================');
});
