// examples/base-server.js
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
  // Use your Base RPC endpoint
  rpcEndpoint: process.env.BASE_RPC || 'https://mainnet.base.org',
  
  // Your merchant wallet to receive payments
  merchantWallet: process.env.MERCHANT_WALLET || '0xYOUR_WALLET_ADDRESS_HERE',
  
  // IMPORTANT: Private key for automatic refunds
  // Store this securely - use environment variables!
  merchantPrivateKey: process.env.MERCHANT_PRIVATE_KEY, // Optional but recommended
  
  // Network configuration
  network: 'base', // 'base' | 'base-goerli' | 'base-sepolia'
  
  // Conversion rate: 1 wei = X wei on Base
  // Example: if price is 1000 wei per second, it's 1000 wei of ETH on Base
  conversionRate: 1, // 1:1 by default
  
  // Optional: ERC20 token address for token payments
  // erc20Token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base example
  
  // Payment timeout (5 minutes)
  paymentTimeout: 300000,
  
  // Enable automatic refunds (with fallback to manual if it fails)
  autoRefund: true,
  
  // Chain ID is set automatically based on network
});

// Track failed refunds for manual processing
const failedRefunds = [];

// Initialize WS402 with Base provider
const ws402 = new WS402(
  {
    updateInterval: 3000,        // Update every 3 seconds
    pricePerSecond: 30000000000000,  // 0.00003 ETH per second (~$0.09/sec at $3000 ETH)
    // 10 seconds = 0.0003 ETH (~$0.90)
    // 30 seconds = 0.0009 ETH (~$2.70)
    currency: 'wei',
    maxSessionDuration: 60,      // Max 1 minute
    
    onPaymentVerified: (session) => {
      console.log(`✅ Base payment verified for session ${session.sessionId}`);
      console.log(`   User: ${session.userId}`);
      console.log(`   Amount: ${session.paidAmount} wei`);
      console.log(`   Amount: ${ethers.formatEther(session.paidAmount)} ETH (~$${(parseFloat(ethers.formatEther(session.paidAmount)) * 3000).toFixed(2)} USD)`);
    },
    
    onRefundIssued: (session, refund) => {
      console.log(`✅ Refund processed successfully!`);
      console.log(`   Amount: ${ethers.formatEther(refund.amount)} ETH (~$${(parseFloat(ethers.formatEther(refund.amount)) * 3000).toFixed(2)} USD)`);
      console.log(`   Recipient: ${session.paymentProof.senderAddress}`);
      console.log(`   Session: ${session.sessionId}`);
    },
    
    onSessionEnd: (session) => {
      console.log(`🔚 Session ended: ${session.sessionId}`);
      console.log(`   Duration: ${session.elapsedSeconds}s`);
      console.log(`   Consumed: ${session.consumedAmount} wei (${ethers.formatEther(session.consumedAmount)} ETH)`);
      console.log(`   Paid: ${session.paidAmount} wei (${ethers.formatEther(session.paidAmount)} ETH)`);
      console.log(`   Refund: ${session.paidAmount - session.consumedAmount} wei (${ethers.formatEther(session.paidAmount - session.consumedAmount)} ETH)`);
    },
  },
  baseProvider
);

// Listen for refund errors and track them for manual processing
ws402.on('refund_error', (data) => {
  console.log(`⚠️  Automatic refund failed - tracking for manual processing`);
  
  try {
    // Calculate refund amount from session data (WS402 doesn't pass refundAmount)
    const refundAmount = data.session.paidAmount - data.session.consumedAmount;
    
    const refundData = {
      sessionId: data.session.sessionId,
      userId: data.session.userId,
      amount: refundAmount,
      amountETH: ethers.formatEther(refundAmount.toString()),
      recipient: data.session.paymentProof?.senderAddress || 'unknown',
      timestamp: Date.now(),
      error: data.error?.message || 'Unknown error',
      attempts: 1,
    };
    
    failedRefunds.push(refundData);
    
    console.log(`   Amount: ${refundData.amountETH} ETH (~$${(parseFloat(refundData.amountETH) * 3000).toFixed(2)} USD)`);
    console.log(`   Recipient: ${refundData.recipient}`);
    console.log(`   Error: ${refundData.error}`);
    console.log(`   Total failed refunds: ${failedRefunds.length}`);
  } catch (error) {
    console.error('❌ Error processing refund_error event:', error.message);
  }
});

// Attach WS402 to WebSocket server
ws402.attach(wss);

// Serve HTML client
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/public/base-complete-client.html'));
});

// HTTP endpoint to get WS402 schema with Base payment details
app.get('/ws402/schema/:resourceId', (req, res) => {
  const resourceId = req.params.resourceId;
  const duration = parseInt(req.query.duration) || 10; // 10 seconds default for demo
  
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
    autoRefundEnabled: connectionInfo.autoRefundEnabled,
    walletConnected: connectionInfo.walletConnected,
    activeSessions: sessions.length,
    failedRefunds: failedRefunds.length,
    totalFailedRefundAmount: failedRefunds.reduce((sum, r) => sum + r.amount, 0),
    sessions: sessions.map(s => ({
      sessionId: s.sessionId,
      userId: s.userId,
      elapsedSeconds: s.elapsedSeconds,
      remainingBalance: s.paidAmount - s.consumedAmount,
    })),
  });
});

// Get failed refunds
app.get('/refunds/failed', (req, res) => {
  res.json({
    count: failedRefunds.length,
    totalAmount: failedRefunds.reduce((sum, r) => sum + r.amount, 0),
    totalAmountETH: ethers.formatEther(
      failedRefunds.reduce((sum, r) => sum + r.amount, 0).toString()
    ),
    refunds: failedRefunds.map(r => ({
      ...r,
      amountUSD: (parseFloat(r.amountETH) * 3000).toFixed(2),
    })),
  });
});

// Retry a specific failed refund
app.post('/refunds/retry/:sessionId', express.json(), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const refund = failedRefunds.find(r => r.sessionId === sessionId);
    
    if (!refund) {
      return res.status(404).json({ error: 'Failed refund not found' });
    }
    
    console.log(`\n🔄 Retrying failed refund for session ${sessionId}...`);
    console.log(`   Attempt #${refund.attempts + 1}`);
    
    try {
      // Try to process the refund again
      await baseProvider.issueRefund(
        { senderAddress: refund.recipient },
        refund.amount
      );
      
      // Remove from failed if successful
      const index = failedRefunds.findIndex(r => r.sessionId === sessionId);
      if (index > -1) {
        failedRefunds.splice(index, 1);
      }
      
      console.log(`✅ Refund retry successful!`);
      res.json({ success: true, message: 'Refund processed successfully' });
      
    } catch (error) {
      // Update attempt count
      refund.attempts++;
      refund.lastAttempt = Date.now();
      refund.lastError = error.message;
      
      console.log(`❌ Refund retry failed: ${error.message}`);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        attempts: refund.attempts 
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Retry all failed refunds
app.post('/refunds/retry-all', async (req, res) => {
  console.log(`\n🔄 Retrying all ${failedRefunds.length} failed refunds...`);
  
  const results = {
    total: failedRefunds.length,
    successful: 0,
    failed: 0,
    errors: []
  };
  
  // Make a copy to iterate (since we modify the array on success)
  const refundsToRetry = [...failedRefunds];
  
  for (const refund of refundsToRetry) {
    try {
      console.log(`   Retrying session ${refund.sessionId}...`);
      
      await baseProvider.issueRefund(
        { senderAddress: refund.recipient },
        refund.amount
      );
      
      // Remove from failed list
      const index = failedRefunds.findIndex(r => r.sessionId === refund.sessionId);
      if (index > -1) {
        failedRefunds.splice(index, 1);
      }
      
      results.successful++;
      console.log(`   ✅ Success`);
      
    } catch (error) {
      refund.attempts++;
      refund.lastAttempt = Date.now();
      refund.lastError = error.message;
      
      results.failed++;
      results.errors.push({
        sessionId: refund.sessionId,
        error: error.message
      });
      console.log(`   ❌ Failed: ${error.message}`);
    }
  }
  
  console.log(`\n📊 Retry complete: ${results.successful} successful, ${results.failed} failed`);
  
  res.json(results);
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
  const connectionInfo = baseProvider.getConnectionInfo();
  
  console.log('===========================================');
  console.log('🚀 WS402 Server with Base Payments');
  console.log('===========================================');
  console.log(`\n🌐 Frontend: http://localhost:${PORT}`);
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`📊 Status: http://localhost:${PORT}/status`);
  console.log(`🔗 Schema: http://localhost:${PORT}/ws402/schema/test-resource?duration=10`);
  console.log(`\n💳 Payment Network: ${connectionInfo.network}`);
  console.log(`💰 Chain ID: ${connectionInfo.chainId}`);
  console.log(`💰 Merchant Wallet: ${connectionInfo.merchantWallet}`);
  console.log(`\n🔄 Auto-Refund: ${connectionInfo.autoRefundEnabled ? '✅ Enabled (with fallback)' : '❌ Disabled'}`);
  if (!connectionInfo.autoRefundEnabled) {
    console.log('⚠️  Set MERCHANT_PRIVATE_KEY env var to enable automatic refunds');
  } else {
    console.log('💡 Failed refunds will be tracked for manual retry');
  }
  console.log(`\n📋 Refund Management:`);
  console.log(`   GET  http://localhost:${PORT}/refunds/failed`);
  console.log(`   POST http://localhost:${PORT}/refunds/retry/:sessionId`);
  console.log(`   POST http://localhost:${PORT}/refunds/retry-all`);
  console.log(`\n💡 Open http://localhost:${PORT} in your browser to start`);
  console.log('===========================================');
});