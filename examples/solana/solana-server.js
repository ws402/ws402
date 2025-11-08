// examples/solana-server.js
// WS402 Server with Solana Payments

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { WS402, SolanaPaymentProvider } = require('../../dist/index');
const { LAMPORTS_PER_SOL } = require('@solana/web3.js');

// Load environment variables
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Initialize Solana Payment Provider
let merchantPrivateKey = undefined;

if (process.env.MERCHANT_PRIVATE_KEY) {
  try {
    const pkString = process.env.MERCHANT_PRIVATE_KEY.trim();
    
    // Check if it's a JSON array format [1,2,3,...]
    if (pkString.startsWith('[')) {
      merchantPrivateKey = JSON.parse(pkString);
      console.log('✅ Merchant private key loaded (array format)');
    } 
    // Otherwise assume it's base58 string from Phantom/Solflare
    else {
      // Simple base58 decoder (Bitcoin alphabet)
      const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      
      function base58Decode(str) {
        const bytes = [0];
        for (let i = 0; i < str.length; i++) {
          const c = str[i];
          const value = ALPHABET.indexOf(c);
          if (value === -1) throw new Error('Invalid base58 character');
          
          for (let j = 0; j < bytes.length; j++) {
            bytes[j] *= 58;
          }
          bytes[0] += value;
          
          let carry = 0;
          for (let j = 0; j < bytes.length; j++) {
            bytes[j] += carry;
            carry = bytes[j] >> 8;
            bytes[j] &= 0xff;
          }
          while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
          }
        }
        
        // Add leading zeros
        for (let i = 0; i < str.length && str[i] === '1'; i++) {
          bytes.push(0);
        }
        
        return new Uint8Array(bytes.reverse());
      }
      
      merchantPrivateKey = Array.from(base58Decode(pkString));
      console.log('✅ Merchant private key loaded (base58 format)');
    }
    
    if (merchantPrivateKey.length !== 64) {
      throw new Error(`Invalid private key length: ${merchantPrivateKey.length} (expected 64)`);
    }
    
  } catch (error) {
    console.error('❌ Error loading MERCHANT_PRIVATE_KEY:', error.message);
    console.error('');
    console.error('Supported formats:');
    console.error('  1. Base58 string (from Phantom): MERCHANT_PRIVATE_KEY=4p8Qsp4esg...');
    console.error('  2. JSON array (from wallet file): MERCHANT_PRIVATE_KEY=\'[1,2,3,...]\'');
    console.error('');
    console.error('⚠️  Continuing without automatic refunds...');
    merchantPrivateKey = undefined;
  }
}

console.log('\n🔍 Debug: Private Key Status');
console.log('  - merchantPrivateKey exists:', !!merchantPrivateKey);
console.log('  - merchantPrivateKey type:', typeof merchantPrivateKey);
console.log('  - merchantPrivateKey length:', merchantPrivateKey?.length);
if (merchantPrivateKey) {
  console.log('  - First 3 bytes:', merchantPrivateKey.slice(0, 3));
}
console.log('');

const solanaProvider = new SolanaPaymentProvider({
  rpcEndpoint: process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
  merchantWallet: process.env.MERCHANT_WALLET || 'YOUR_SOLANA_WALLET_ADDRESS_HERE',
  merchantPrivateKey: merchantPrivateKey,
  network: process.env.SOLANA_NETWORK || 'mainnet-beta',
  conversionRate: 1,
  paymentTimeout: 300000,
  label: 'WS402 Payment',
  message: 'Pay for WebSocket resource access',
  memo: 'WS402',
  autoRefund: true,
});

// Helper function to format SOL amounts
function formatSOL(lamports) {
  return (lamports / LAMPORTS_PER_SOL).toFixed(9) + ' SOL';
}

// Initialize WS402 with Solana provider
const ws402 = new WS402(
  {
    updateInterval: 3000, // 3 seconds
    pricePerSecond: 100000, // 0.0001 SOL per second (100,000 lamports)
    currency: 'lamports',
    maxSessionDuration: 60, // 60 seconds max
    
    onPaymentVerified: (session) => {
      console.log(`✅ Payment verified for session ${session.sessionId}`);
      console.log(`   User: ${session.userId}`);
      console.log(`   Amount: ${formatSOL(session.paidAmount)}`);
      console.log(`   Transaction: https://solscan.io/tx/${session.paymentProof?.signature}`);
    },
    
    onRefundIssued: (session, refund) => {
      console.log(`💰 Refund issued: ${formatSOL(refund.amount)}`);
      console.log(`   Session: ${session.sessionId}`);
      console.log(`   Reason: ${refund.reason}`);
    },
    
    onSessionEnd: (session) => {
      console.log(`📊 Session ended: ${session.sessionId}`);
      console.log(`   Duration: ${session.elapsedSeconds}s`);
      console.log(`   Consumed: ${formatSOL(session.consumedAmount)}`);
      console.log(`   Refund: ${formatSOL(session.paidAmount - session.consumedAmount)}`);
    },
    
    onError: (error) => {
      console.error('❌ WS402 Error:', error.message);
    },
  },
  solanaProvider
);

// Attach WS402 to WebSocket server
ws402.attach(wss);

// Serve HTML client
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/public/solana-client.html'));
});

// HTTP endpoint to get WS402 schema with Solana payment details
app.get('/ws402/schema/:resourceId', (req, res) => {
  const resourceId = req.params.resourceId;
  const duration = parseInt(req.query.duration) || 10;
  
  try {
    console.log(`📝 Schema requested: resourceId=${resourceId}, duration=${duration}`);
    
    const schema = ws402.generateSchema(resourceId, duration);
    
    console.log('✅ Schema generated successfully');
    console.log('   Has paymentDetails:', !!schema.paymentDetails);
    console.log('   Has pricing:', !!schema.pricing);
    
    if (schema.paymentDetails) {
      console.log('   Payment type:', schema.paymentDetails.type);
      console.log('   Network:', schema.paymentDetails.network);
      console.log('   Amount:', schema.paymentDetails.amountSOL, 'SOL');
    }
    
    res.json(schema);
  } catch (error) {
    console.error('❌ Schema generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate schema',
      message: error.message 
    });
  }
});

// Blockhash endpoint - provides recent blockhash for transactions
app.get('/blockhash', async (req, res) => {
  try {
    const { Connection } = require('@solana/web3.js');
    const connection = new Connection(
      process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );
    
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    
    res.json({
      blockhash,
      lastValidBlockHeight,
    });
  } catch (error) {
    console.error('Blockhash fetch error:', error);
    res.status(500).json({
      error: 'Failed to get blockhash',
      message: error.message,
    });
  }
});

// Blockhash endpoint - provides recent blockhash without exposing RPC
app.get('/blockhash', async (req, res) => {
  try {
    const { Connection } = require('@solana/web3.js');
    const connection = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com');
    
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    
    res.json({
      blockhash,
      lastValidBlockHeight,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get blockhash',
      message: error.message,
    });
  }
});

// Get pending payment info (for debugging)
app.get('/debug/pending/:reference', (req, res) => {
  const pending = solanaProvider.getPendingPayment(req.params.reference);
  
  if (!pending) {
    return res.status(404).json({ error: 'Payment not found' });
  }
  
  res.json({
    reference: req.params.reference,
    amount: formatSOL(pending.amount),
    amountLamports: pending.amount,
    recipient: pending.recipient.toBase58(),
    timestamp: new Date(pending.timestamp).toISOString(),
    expiresAt: new Date(pending.timestamp + 300000).toISOString(),
  });
});

// Cleanup expired payments periodically (every minute)
setInterval(() => {
  const cleaned = solanaProvider.cleanupExpiredPayments();
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} expired pending payments`);
  }
}, 60000);

// Start server
const PORT = process.env.PORT || 4028;
server.listen(PORT, () => {
  const connectionInfo = solanaProvider.getConnectionInfo();
  
  console.log('===========================================');
  console.log('🚀 WS402 Server with Solana Payments');
  console.log('===========================================');
  console.log(`\n🌐 Server: http://localhost:${PORT}`);
  console.log(`📊 Status: http://localhost:${PORT}/status`);
  console.log(`🔗 Schema: http://localhost:${PORT}/ws402/schema/test-resource?duration=10`);
  console.log(`💚 Health: http://localhost:${PORT}/health`);
  console.log(`\n💳 Payment Network: ${connectionInfo.network}`);
  console.log(`🏦 RPC Endpoint: ${connectionInfo.rpcEndpoint}`);
  console.log(`💰 Merchant Wallet: ${connectionInfo.merchantWallet}`);
  
  if (connectionInfo.splToken) {
    console.log(`🪙  SPL Token: ${connectionInfo.splToken}`);
  } else {
    console.log(`🪙  Currency: Native SOL`);
  }
  
  console.log(`\n💵 Price: ${formatSOL(ws402.config.pricePerSecond)}/second`);
  console.log(`⏱️  Update Interval: ${ws402.config.updateInterval / 1000}s`);
  console.log(`⏳ Max Duration: ${ws402.config.maxSessionDuration}s`);
  
  console.log(`\n🔄 Auto-Refund: ${connectionInfo.autoRefundEnabled ? '✅ Enabled' : '❌ Disabled'}`);
  
  if (!connectionInfo.autoRefundEnabled) {
    console.log('⚠️  Set MERCHANT_PRIVATE_KEY to enable automatic refunds');
    console.log('   Format: MERCHANT_PRIVATE_KEY=\'[1,2,3,...]\'');
    console.log('   Get from: cat ~/your-wallet.json');
  } else {
    console.log('✅ Automatic refunds will be issued on session end');
  }
  
  console.log(`\n💡 Open http://localhost:${PORT} in your browser`);
  console.log(`📱 Use Phantom, Solflare, or any Solana wallet to pay`);
  console.log('===========================================');
  
  // Log warning if using devnet
  if (connectionInfo.network === 'devnet') {
    console.log('\n⚠️  WARNING: Running on DEVNET - for testing only!');
    console.log('   Get devnet SOL at: https://faucet.solana.com/');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});