// examples/payment-gateway-server.js
// Centralized Payment Gateway Server for WS402
// Handles payment verification and refunds for multiple WS402 servers

const express = require('express');
const { BasePaymentProvider } = require('../dist/index');
require('dotenv').config();

const app = express();
app.use(express.json());

// Initialize payment provider with private key (centralized)
const baseProvider = new BasePaymentProvider({
  rpcEndpoint: process.env.BASE_RPC || 'https://mainnet.base.org',
  merchantWallet: process.env.MERCHANT_WALLET,
  merchantPrivateKey: process.env.MERCHANT_PRIVATE_KEY, // Only gateway has this!
  network: process.env.BASE_NETWORK || 'base',
  autoRefund: true,
});

// API Key authentication middleware
const authenticateApiKey = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const apiKey = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  const validApiKey = process.env.GATEWAY_API_KEY || 'your-secret-api-key';

  if (!apiKey || apiKey !== validApiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing API key',
    });
  }

  next();
};

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ===== PAYMENT GATEWAY ENDPOINTS =====

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    provider: 'Base',
    timestamp: Date.now(),
  });
});

/**
 * Generate payment details
 * POST /api/payment/generate
 * Body: { amount, resourceId, estimatedDuration }
 */
app.post('/api/payment/generate', authenticateApiKey, (req, res) => {
  try {
    const { amount, resourceId, estimatedDuration } = req.body;

    if (!amount || !resourceId || !estimatedDuration) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: amount, resourceId, estimatedDuration',
      });
    }

    console.log(`💳 Generating payment details:`, {
      amount,
      resourceId,
      estimatedDuration,
    });

    // Generate payment details using Base provider
    const paymentDetails = baseProvider.generatePaymentDetails(amount);

    // Add additional metadata
    const response = {
      ...paymentDetails,
      resourceId,
      estimatedDuration,
      gateway: 'ws402-payment-gateway',
      timestamp: Date.now(),
    };

    res.json(response);

  } catch (error) {
    console.error('❌ Error generating payment:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * Verify payment on blockchain
 * POST /api/payment/verify
 * Body: { proof: { txHash, reference, senderAddress } }
 */
app.post('/api/payment/verify', authenticateApiKey, async (req, res) => {
  try {
    const { proof, timestamp } = req.body;

    if (!proof) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing payment proof',
      });
    }

    console.log(`🔍 Verifying payment:`, {
      txHash: proof.txHash,
      reference: proof.reference,
    });

    // Verify payment on blockchain
    const verification = await baseProvider.verifyPayment(proof);

    console.log(`${verification.valid ? '✅' : '❌'} Verification result:`, {
      valid: verification.valid,
      amount: verification.amount,
      reason: verification.reason,
    });

    res.json(verification);

  } catch (error) {
    console.error('❌ Error verifying payment:', error.message);
    res.status(500).json({
      valid: false,
      amount: 0,
      reason: `Verification error: ${error.message}`,
    });
  }
});

/**
 * Issue refund on blockchain
 * POST /api/payment/refund
 * Body: { proof: { txHash, senderAddress }, amount }
 */
app.post('/api/payment/refund', authenticateApiKey, async (req, res) => {
  try {
    const { proof, amount, timestamp } = req.body;

    if (!proof || !amount) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing proof or amount',
      });
    }

    console.log(`💸 Processing refund:`, {
      amount,
      recipient: proof.senderAddress,
    });

    // Issue refund on blockchain
    await baseProvider.issueRefund(proof, amount);

    console.log(`✅ Refund completed successfully`);

    res.json({
      status: 'success',
      amount,
      recipient: proof.senderAddress,
      message: 'Refund processed successfully',
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('❌ Error processing refund:', error.message);
    res.status(500).json({
      error: 'Refund Failed',
      message: error.message,
    });
  }
});

/**
 * Get gateway statistics
 * GET /api/stats
 */
app.get('/api/stats', authenticateApiKey, (req, res) => {
  const connectionInfo = baseProvider.getConnectionInfo();
  
  res.json({
    gateway: 'ws402-payment-gateway',
    provider: 'Base',
    network: connectionInfo.network,
    chainId: connectionInfo.chainId,
    merchantWallet: connectionInfo.merchantWallet,
    autoRefundEnabled: connectionInfo.autoRefundEnabled,
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

/**
 * Admin endpoint - get pending payments
 * GET /api/admin/pending
 */
app.get('/api/admin/pending', authenticateApiKey, (req, res) => {
  // Note: BasePaymentProvider doesn't expose all pending payments
  // In production, you'd want to track this separately
  res.json({
    message: 'Pending payments tracking not implemented',
    suggestion: 'Implement database tracking for production',
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

// Start server
const PORT = process.env.GATEWAY_PORT || 4029;

app.listen(PORT, () => {
  const connectionInfo = baseProvider.getConnectionInfo();
  
  console.log('===========================================');
  console.log('🏦 WS402 Payment Gateway Server');
  console.log('===========================================');
  console.log(`\n🌐 Gateway URL: http://localhost:${PORT}`);
  console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`📊 Stats: http://localhost:${PORT}/api/stats`);
  console.log(`\n🔐 Authentication: Bearer token required`);
  console.log(`🔑 API Key: ${process.env.GATEWAY_API_KEY ? '✅ Configured' : '⚠️  Using default'}`);
  console.log(`\n💳 Payment Network: ${connectionInfo.network}`);
  console.log(`💰 Chain ID: ${connectionInfo.chainId}`);
  console.log(`💰 Merchant Wallet: ${connectionInfo.merchantWallet}`);
  console.log(`\n🔄 Auto-Refund: ${connectionInfo.autoRefundEnabled ? '✅ Enabled' : '❌ Disabled'}`);
  if (!connectionInfo.autoRefundEnabled) {
    console.log('⚠️  Set MERCHANT_PRIVATE_KEY to enable automatic refunds');
  }
  console.log('\n===========================================');
  console.log('📋 Available Endpoints:');
  console.log('   POST /api/payment/generate');
  console.log('   POST /api/payment/verify');
  console.log('   POST /api/payment/refund');
  console.log('   GET  /api/health');
  console.log('   GET  /api/stats');
  console.log('===========================================');
});
