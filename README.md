# WS402

> WebSocket implementation of X402 protocol for pay-as-you-go digital resources with automatic refunds

[![npm version](https://badge.fury.io/js/ws402.svg)](https://www.npmjs.com/package/ws402)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

WS402 extends the X402 protocol to WebSocket connections, enabling true pay-as-you-go pricing for streaming resources. Users pay upfront for estimated usage, the backend tracks actual consumption in real-time, and unused balance is automatically refunded when the session ends.

**Perfect for:**
- 🎥 Video/audio streaming
- 🔌 API access with metered billing
- 📊 Real-time data feeds
- ☁️ Cloud computing resources
- 🤖 AI model inference
- 🎮 Gaming servers
- 🔐 VPN services

## Features

- ✅ **Automatic refunds** - Users only pay for what they actually consume
- ⚡ **Real-time metering** - Track usage by time, bytes, or custom metrics
- 🔒 **Payment verification** - Built-in blockchain payment verification
- 🌐 **Multi-blockchain support** - Base, Solana, and custom providers
- 🏦 **Centralized gateway** - Optional proxy architecture for enterprise
- 📊 **Usage tracking** - Detailed session metrics and callbacks
- 🎯 **Simple integration** - Similar to X402, easy to add to existing apps
- 🔌 **Payment provider agnostic** - Works with any payment system

## Installation

```bash
npm install ws402
```

**Additional dependencies for blockchain providers:**

```bash
# For Base blockchain
npm install ethers

# For Solana blockchain
npm install @solana/web3.js @solana/pay bignumber.js
```

## Quick Start

### Basic Server (Mock Provider)

```javascript
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { WS402, MockPaymentProvider } = require('ws402');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize payment provider (mock for development)
const paymentProvider = new MockPaymentProvider();

// Create WS402 instance
const ws402 = new WS402(
  {
    updateInterval: 3000,      // Send updates every 3 seconds
    pricePerSecond: 10,        // Price per second in wei
    currency: 'wei',
    maxSessionDuration: 600,   // Max 10 minutes per session
    
    onPaymentVerified: (session) => {
      console.log(`✅ Payment verified: ${session.sessionId}`);
    },
    
    onRefundIssued: (session, refund) => {
      console.log(`💰 Refund issued: ${refund.amount} wei`);
    },
    
    onSessionEnd: (session) => {
      console.log(`🔚 Session ended: ${session.sessionId}`);
    },
  },
  paymentProvider
);

// Attach to WebSocket server
ws402.attach(wss);

// Serve WS402 schema
app.get('/ws402/schema/:resourceId', (req, res) => {
  const schema = ws402.generateSchema(
    req.params.resourceId,
    300 // estimated duration in seconds
  );
  res.json(schema);
});

server.listen(4028);
```

### Client Integration

```javascript
// 1. Fetch WS402 schema
const response = await fetch('/ws402/schema/my-resource?duration=300');
const schema = await response.json();

// 2. Make payment (using blockchain or other method)
// ... payment process ...

// 3. Connect to WebSocket
const ws = new WebSocket(`wss://your-server.com?userId=alice`);

// 4. Send payment proof
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'payment_proof',
    proof: {
      txHash: '0x123...', // Blockchain transaction hash
      reference: schema.paymentDetails.reference,
      senderAddress: '0xYourAddress...',
      amount: schema.pricing.totalPrice,
    }
  }));
};

// 5. Receive usage updates
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'session_started') {
    console.log('✅ Session active!', data.sessionId);
  }
  
  if (data.type === 'usage_update') {
    console.log(`⏱️  Time: ${data.elapsedSeconds}s`);
    console.log(`💰 Remaining: ${data.remainingBalance} wei`);
  }
  
  if (data.type === 'balance_exhausted') {
    console.log('⚠️  Balance exhausted');
  }
};

// 6. Disconnect to trigger automatic refund
ws.close();
```

## Payment Providers

WS402 supports multiple payment architectures:

### 1. Base Blockchain (Direct Integration)

```javascript
const { WS402, BasePaymentProvider } = require('ws402');

const baseProvider = new BasePaymentProvider({
  rpcEndpoint: 'https://mainnet.base.org',
  merchantWallet: '0xYourWalletAddress',
  merchantPrivateKey: process.env.MERCHANT_PRIVATE_KEY, // For automatic refunds
  network: 'base', // 'base' | 'base-goerli' | 'base-sepolia'
  autoRefund: true,
});

const ws402 = new WS402(config, baseProvider);
```

**Features:**
- ✅ Native ETH payments on Base L2
- ✅ ERC20 token support
- ✅ ~$0.01 transaction fees
- ✅ 2-5 second confirmations
- ✅ Automatic on-chain refunds

### 2. Solana Blockchain (Direct Integration)

The Solana Payment Provider enables ultra-fast, low-cost payments on the Solana blockchain with automatic refunds.


#### 🎬 See it in Action

**WebSocket Real-Time Streaming**
![Solana WebSocket Demo](solana-ws.gif)
Connect to WebSocket, pay with Solana...

---

**HTTP Resource Protection**
![Solana HTTP Resource Demo](solana-http.gif)
Access protected files through a WebSocket session...



#### Quick Setup

```javascript
const { WS402, SolanaPaymentProvider } = require('ws402');

const solanaProvider = new SolanaPaymentProvider({
  rpcEndpoint: 'https://api.mainnet-beta.solana.com',
  merchantWallet: 'YourSolanaPublicKey',
  merchantPrivateKey: [1, 2, 3, ...], // Array from wallet JSON
  network: 'mainnet-beta',
  conversionRate: 1, // 1:1 lamports
  label: 'WS402 Payment',
  message: 'Pay for WebSocket access',
  autoRefund: true,
});

const ws402 = new WS402(config, solanaProvider);
```

#### Configuration Options

```typescript
interface SolanaPaymentProviderConfig {
  // Required
  rpcEndpoint: string;           // Solana RPC endpoint
  merchantWallet: string;        // Your wallet address (base58)
  
  // Optional - for automatic refunds
  merchantPrivateKey?: number[]; // Wallet private key as array
  
  // Optional settings
  network?: 'mainnet-beta' | 'devnet' | 'testnet';
  conversionRate?: number;       // wei/lamports conversion (default: 1)
  splToken?: string;             // SPL token mint address
  paymentTimeout?: number;       // Payment timeout in ms (default: 300000)
  label?: string;                // Solana Pay QR label
  message?: string;              // Solana Pay message
  memo?: string;                 // Transaction memo
  autoRefund?: boolean;          // Enable auto-refunds (default: true if privateKey exists)
}
```

#### Getting Your Private Key

Your Solana private key is required for automatic refunds. Here's how to get it:

**From Phantom/Solflare Wallet:**
```bash
# Export private key from wallet settings
# It will be in base58 format like: 4p8Qsp4esg...
MERCHANT_PRIVATE_KEY=4p8Qsp4esg...
```

**From Solana CLI:**
```bash
# Generate new keypair
solana-keygen new -o my-wallet.json

# View the keypair as array
cat my-wallet.json
# Output: [1,2,3,4,...,64]
```

**In your code:**
```javascript
// From base58 string (Phantom export)
const privateKey = bs58.decode('4p8Qsp4esg...');

// Or from JSON array
const privateKey = [1, 2, 3, ..., 64];

// Use in provider
const solanaProvider = new SolanaPaymentProvider({
  // ...other config
  merchantPrivateKey: Array.from(privateKey),
});
```

#### Use Cases

##### **WebSocket Real-Time Streaming**

Perfect for real-time data streams where users pay for connection time:

![Solana WebSocket Demo](./docs/images/solana-ws.gif)

```javascript
const ws402 = new WS402(
  {
    updateInterval: 3000,          // Update every 3 seconds
    pricePerSecond: 100000,        // 0.0001 SOL per second
    currency: 'lamports',
    maxSessionDuration: 3600,      // 1 hour max
    
    onPaymentVerified: (session) => {
      console.log(`✅ Payment verified: ${session.sessionId}`);
      console.log(`   Amount: ${session.paidAmount / 1e9} SOL`);
    },
    
    onRefundIssued: (session, refund) => {
      console.log(`💰 Refund: ${refund.amount / 1e9} SOL`);
    },
  },
  solanaProvider
);
```

##### **HTTP Resource Protection**

Protect HTTP resources (PDFs, videos, images) with time-based billing via WebSocket:

![Solana HTTP Resource Demo](./docs/images/solana-http.gif)

```javascript
const { WS402HTTPMiddleware } = require('ws402');

// Initialize HTTP middleware
const httpMiddleware = new WS402HTTPMiddleware(ws402);

// Different resources can have different prices
const RESOURCES = {
  'premium-report': {
    type: 'pdf',
    path: './reports/premium.pdf',
    pricePerSecond: 500000,      // 0.0005 SOL/sec
    estimatedTime: 600,          // 10 minutes
  },
  'basic-guide': {
    type: 'pdf',
    path: './guides/basic.pdf',
    pricePerSecond: 100000,      // 0.0001 SOL/sec
    estimatedTime: 300,          // 5 minutes
  },
};

// Schema endpoint with resource-specific pricing
app.get('/api/resource/:resourceId/schema', (req, res) => {
  const resource = RESOURCES[req.params.resourceId];
  
  const schema = ws402.generateSchema(
    req.params.resourceId,
    resource.estimatedTime,
    resource.pricePerSecond  // Custom price per resource
  );
  
  res.json({ ws402Schema: schema });
});

// Protected resource endpoint
app.get('/api/resource/:resourceId',
  httpMiddleware.protectHTTPResource(),
  (req, res) => {
    const resource = RESOURCES[req.params.resourceId];
    res.sendFile(resource.path);
  }
);

// Register HTTP session after WS402 payment
ws402.on('payment_verified', (session) => {
  const token = httpMiddleware.registerHTTPSession(
    session.sessionId,
    session._resourceId
  );
  
  // Send token to client for HTTP access
  clientWs.send(JSON.stringify({
    type: 'http_access_granted',
    httpToken: token,
    resourceUrl: `/api/resource/${session._resourceId}?token=${token}`,
  }));
});
```

**How it works:**
1. Client requests resource schema → Gets price and payment details
2. Client pays via Solana → Gets session token
3. Client opens HTTP resource → Server validates session via WS402
4. Timer runs via WebSocket → Tracks actual usage time
5. Client closes → Automatic refund for unused time

#### Features

- ✅ **Native SOL payments** - No token wrapping needed
- ✅ **SPL token support** - USDC, USDT, and custom tokens
- ✅ **Solana Pay integration** - QR codes for mobile wallets
- ✅ **Sub-second confirmations** - Typically < 1 second
- ✅ **Ultra-low fees** - ~$0.0001 per transaction
- ✅ **Automatic on-chain refunds** - Unused balance returned instantly
- ✅ **Mobile wallet support** - Phantom, Solflare, Backpack
- ✅ **Reference tracking** - Unique payment IDs for verification

#### Payment Flow

```
┌─────────┐                    ┌─────────┐                    ┌──────────┐
│ Client  │                    │ WS402   │                    │  Solana  │
│         │                    │ Server  │                    │  Chain   │
└────┬────┘                    └────┬────┘                    └────┬─────┘
     │                              │                              │
     │ 1. Request Schema            │                              │
     │────────────────────────────>│                              │
     │                              │                              │
     │ 2. Schema + Payment Details  │                              │
     │<────────────────────────────│                              │
     │   (QR code, address, amount) │                              │
     │                              │                              │
     │ 3. Sign & Send Transaction   │                              │
     │──────────────────────────────────────────────────────────>│
     │                              │                              │
     │                              │ 4. Verify Transaction        │
     │                              │<─────────────────────────────│
     │                              │                              │
     │ 5. Connect WebSocket         │                              │
     │────────────────────────────>│                              │
     │                              │                              │
     │ 6. Send Payment Proof        │                              │
     │    (signature + reference)   │                              │
     │────────────────────────────>│                              │
     │                              │                              │
     │                              │ 7. Verify On-Chain           │
     │                              │────────────────────────────>│
     │                              │                              │
     │                              │ 8. Confirmation              │
     │                              │<────────────────────────────│
     │                              │                              │
     │ 9. Session Started           │                              │
     │<────────────────────────────│                              │
     │                              │                              │
     │ 10. Usage Updates (periodic) │                              │
     │<────────────────────────────│                              │
     │                              │                              │
     │ 11. Disconnect               │                              │
     │────────────────────────────>│                              │
     │                              │                              │
     │                              │ 12. Send Refund (if any)     │
     │                              │────────────────────────────>│
     │                              │                              │
     │ 13. Session Ended            │ 14. Refund Confirmed         │
     │<────────────────────────────│<────────────────────────────│
     │                              │                              │
```

#### Payment Details Structure

When you call `generateSchema()`, the Solana provider returns:

```json
{
  "protocol": "ws402",
  "version": "0.1.2",
  "resourceId": "video-stream-123",
  "websocketEndpoint": "wss://api.example.com/ws402",
  "pricing": {
    "pricePerSecond": 100000,
    "currency": "lamports",
    "estimatedDuration": 300,
    "totalPrice": 30000000
  },
  "paymentDetails": {
    "type": "solana",
    "network": "mainnet-beta",
    "recipient": "YourWalletPublicKey",
    "amount": 30000000,
    "amountSOL": "0.03",
    "currency": "SOL",
    "reference": "UniqueReferencePublicKey",
    "solanaPayURL": "solana:YourWallet?amount=0.03&reference=...",
    "qrCode": "solana:...",
    "expiresAt": 1234567890000,
    "instructions": {
      "step1": "Scan QR code with Solana-compatible wallet",
      "step2": "Or use Phantom, Solflare, or other Solana wallet",
      "step3": "Approve transaction",
      "step4": "Connection will be established automatically"
    }
  },
  "maxSessionDuration": 3600
}
```

#### Client Implementation

**Web App with Phantom Wallet:**

```javascript
// 1. Get schema
const response = await fetch('/ws402/schema/my-resource?duration=300');
const schema = await response.json();

// 2. Connect to Phantom wallet
if (!window.solana || !window.solana.isPhantom) {
  alert('Please install Phantom wallet');
  return;
}

await window.solana.connect();
const provider = window.solana;

// 3. Create payment transaction
const { Connection, PublicKey, Transaction, SystemProgram } = window.solanaWeb3;

const connection = new Connection('https://api.mainnet-beta.solana.com');
const { blockhash } = await connection.getLatestBlockhash();

const transaction = new Transaction({
  feePayer: provider.publicKey,
  recentBlockhash: blockhash,
});

// Add transfer instruction
transaction.add(
  SystemProgram.transfer({
    fromPubkey: provider.publicKey,
    toPubkey: new PublicKey(schema.paymentDetails.recipient),
    lamports: schema.paymentDetails.amount,
  })
);

// Add reference as read-only account (for tracking)
transaction.add({
  keys: [{ 
    pubkey: new PublicKey(schema.paymentDetails.reference), 
    isSigner: false, 
    isWritable: false 
  }],
  programId: SystemProgram.programId,
  data: Buffer.alloc(0),
});

// 4. Sign and send transaction
const { signature } = await provider.signAndSendTransaction(transaction);
console.log('Payment sent:', signature);

// 5. Connect to WebSocket
const ws = new WebSocket(schema.websocketEndpoint);

ws.onopen = () => {
  // Send payment proof
  ws.send(JSON.stringify({
    type: 'payment_proof',
    proof: {
      signature: signature,
      reference: schema.paymentDetails.reference,
      senderAddress: provider.publicKey.toBase58(),
      amount: schema.paymentDetails.amount,
    }
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'session_started') {
    console.log('✅ Session started!');
    console.log('Balance:', data.balance / 1e9, 'SOL');
  }
  
  if (data.type === 'usage_update') {
    console.log('Time:', data.elapsedSeconds, 's');
    console.log('Remaining:', data.remainingBalance / 1e9, 'SOL');
  }
};

// 6. Close to trigger refund
ws.close();
```

**React Example:**

```jsx
import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, Transaction, SystemProgram, PublicKey } from '@solana/web3.js';

function PayPerUseStream() {
  const { publicKey, signTransaction } = useWallet();
  const [session, setSession] = useState(null);
  const [ws, setWs] = useState(null);

  const startSession = async () => {
    // 1. Fetch schema
    const res = await fetch('/ws402/schema/stream?duration=600');
    const schema = await res.json();

    // 2. Create payment
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    const { blockhash } = await connection.getLatestBlockhash();

    const tx = new Transaction({ 
      feePayer: publicKey, 
      recentBlockhash: blockhash 
    });

    tx.add(
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey(schema.paymentDetails.recipient),
        lamports: schema.paymentDetails.amount,
      })
    );

    const signed = await signTransaction(tx);
    const signature = await connection.sendRawTransaction(signed.serialize());

    // 3. Connect WebSocket
    const websocket = new WebSocket(schema.websocketEndpoint);
    
    websocket.onopen = () => {
      websocket.send(JSON.stringify({
        type: 'payment_proof',
        proof: {
          signature,
          reference: schema.paymentDetails.reference,
          senderAddress: publicKey.toBase58(),
          amount: schema.paymentDetails.amount,
        }
      }));
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'session_started') {
        setSession(data);
      }
      if (data.type === 'usage_update') {
        setSession(prev => ({ ...prev, ...data }));
      }
    };

    setWs(websocket);
  };

  const endSession = () => {
    if (ws) {
      ws.close(); // Triggers automatic refund
    }
  };

  return (
    <div>
      <button onClick={startSession}>Start Session</button>
      {session && (
        <div>
          <p>Time: {session.elapsedSeconds}s</p>
          <p>Remaining: {session.remainingBalance / 1e9} SOL</p>
          <button onClick={endSession}>End & Refund</button>
        </div>
      )}
    </div>
  );
}
```

#### Environment Variables

```bash
# Solana Configuration
SOLANA_RPC=https://api.mainnet-beta.solana.com
SOLANA_NETWORK=mainnet-beta

# Merchant Wallet (public key)
MERCHANT_WALLET=YourSolanaPublicKeyHere

# Merchant Private Key (for automatic refunds)
# Option 1: JSON array from wallet file
MERCHANT_PRIVATE_KEY='[1,2,3,4,...,64]'

# Option 2: Base58 string from Phantom/Solflare
# MERCHANT_PRIVATE_KEY=4p8Qsp4esg...

# Optional: SPL Token (for USDC, USDT, etc.)
# SPL_TOKEN_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# Server
PORT=4028
```

#### Testing on Devnet

```bash
# Use devnet for testing
SOLANA_RPC=https://api.devnet.solana.com
SOLANA_NETWORK=devnet

# Get free devnet SOL
# Visit: https://faucet.solana.com
# Or use CLI: solana airdrop 2 YourWalletAddress --url devnet
```

#### SPL Token Payments (USDC, USDT, etc.)

```javascript
const solanaProvider = new SolanaPaymentProvider({
  rpcEndpoint: 'https://api.mainnet-beta.solana.com',
  merchantWallet: 'YourSolanaPublicKey',
  merchantPrivateKey: privateKeyArray,
  splToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mint
  network: 'mainnet-beta',
  conversionRate: 1000000, // 1 USDC = 1,000,000 units (6 decimals)
});
```

#### Security Best Practices

**1. Private Key Management:**
```javascript
// ❌ NEVER hardcode private keys
const provider = new SolanaPaymentProvider({
  merchantPrivateKey: [1, 2, 3, ...],
});

// ✅ ALWAYS use environment variables
const provider = new SolanaPaymentProvider({
  merchantPrivateKey: process.env.MERCHANT_PRIVATE_KEY 
    ? JSON.parse(process.env.MERCHANT_PRIVATE_KEY) 
    : undefined,
});
```

**2. Network Validation:**
```javascript
// Verify you're on the correct network
const info = solanaProvider.getConnectionInfo();
console.log('Network:', info.network);
console.log('Auto-refund:', info.autoRefundEnabled);

if (info.network === 'devnet' && process.env.NODE_ENV === 'production') {
  throw new Error('Cannot use devnet in production!');
}
```

**3. Balance Monitoring:**
```javascript
// Monitor merchant wallet balance
const { Connection, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const connection = new Connection(process.env.SOLANA_RPC);
const balance = await connection.getBalance(
  new PublicKey(process.env.MERCHANT_WALLET)
);

console.log('Merchant balance:', balance / LAMPORTS_PER_SOL, 'SOL');

// Alert if balance is low
if (balance < 0.1 * LAMPORTS_PER_SOL) {
  console.warn('⚠️  Low balance! May affect refunds.');
}
```

**4. Error Handling:**
```javascript
ws402.on('refund_error', ({ session, error }) => {
  console.error('Refund failed:', error);
  
  // Log to monitoring service
  monitoringService.logError({
    type: 'refund_failed',
    sessionId: session.sessionId,
    userId: session.userId,
    amount: session.paidAmount - session.consumedAmount,
    error: error.message,
  });
  
  // Queue for manual processing
  refundQueue.add({
    senderWallet: session.paymentProof.senderAddress,
    amount: session.paidAmount - session.consumedAmount,
    reason: 'automatic_refund_failed',
  });
});
```

#### Advanced Features

**Payment Verification with Retries:**

The Solana provider automatically retries payment verification:

```javascript
// Automatic retry logic (built-in):
// - Max 10 retries
// - 2 second delay between retries
// - Handles network delays and finalization

// Transaction typically confirms in < 1 second
// Provider waits up to 20 seconds for confirmation
```

**Refund Confirmation Tracking:**

```javascript
ws402.on('refund', ({ session, refund }) => {
  console.log('💰 Refund processing...');
  console.log('   Amount:', refund.amount / 1e9, 'SOL');
  console.log('   Session:', session.sessionId);
  
  // Check on Solscan
  const explorerUrl = `https://solscan.io/tx/${refund.signature}`;
  console.log('   Explorer:', explorerUrl);
});
```

**Cleanup Expired Payments:**

```javascript
// Run cleanup periodically
setInterval(() => {
  const cleaned = solanaProvider.cleanupExpiredPayments();
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired payments`);
  }
}, 60000); // Every minute
```

#### Monitoring & Debugging

**Health Check Endpoint:**

```javascript
app.get('/health', async (req, res) => {
  const info = solanaProvider.getConnectionInfo();
  const connection = new Connection(info.rpcEndpoint);
  
  try {
    // Check RPC connection
    const blockHeight = await connection.getBlockHeight();
    
    // Check merchant balance
    const balance = await connection.getBalance(
      new PublicKey(info.merchantWallet)
    );
    
    res.json({
      status: 'ok',
      network: info.network,
      blockHeight,
      merchantBalance: balance / LAMPORTS_PER_SOL,
      autoRefund: info.autoRefundEnabled,
      activeSessions: ws402.getActiveSessions().length,
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      error: error.message,
    });
  }
});
```

**Debug Endpoints:**

```javascript
// Get pending payment info
app.get('/debug/pending/:reference', (req, res) => {
  const pending = solanaProvider.getPendingPayment(req.params.reference);
  if (!pending) {
    return res.status(404).json({ error: 'Payment not found' });
  }
  
  res.json({
    reference: req.params.reference,
    amount: pending.amount,
    amountSOL: pending.amountSOL.toString(),
    recipient: pending.recipient.toBase58(),
    timestamp: new Date(pending.timestamp).toISOString(),
    expiresAt: new Date(pending.timestamp + 300000).toISOString(),
  });
});
```

#### Comparison: Solana vs Base

| Feature | Solana | Base |
|---------|--------|------|
| Transaction Fee | ~$0.0001 | ~$0.01 |
| Confirmation Time | < 1 sec | 2-5 sec |
| Finality | ~13 sec | ~1 min |
| Native Currency | SOL | ETH |
| Token Standard | SPL | ERC20 |
| QR Code Support | ✅ Solana Pay | ❌ |
| Mobile Wallets | Phantom, Solflare, Backpack | MetaMask, Coinbase |
| Best For | High-volume, low-value | EVM ecosystem |

### 3. Proxy Architecture (Enterprise/Multi-Server)

Perfect for scaling and security:

```javascript
const { WS402, ProxyPaymentProvider } = require('ws402');

// WS402 Server (no private keys needed!)
const proxyProvider = new ProxyPaymentProvider({
  gatewayUrl: 'https://payment-gateway.example.com',
  apiKey: process.env.GATEWAY_API_KEY,
  timeout: 30000,
  retryAttempts: 3,
});

const ws402 = new WS402(config, proxyProvider);
```

**Architecture:**
```
[Client] → [WS402 Server A] ⎤
[Client] → [WS402 Server B] ⎥→ [Payment Gateway] → [Blockchain]
[Client] → [WS402 Server C] ⎦     (has private keys)
```

**Benefits:**
- 🔐 Private keys only on gateway (more secure)
- 📈 Easy horizontal scaling
- 🌍 Multiple WS402 servers, one gateway
- 📊 Centralized payment logging
- 🛠️ Easier compliance and auditing

**Gateway Server:**
```javascript
// Centralized gateway with private keys
node examples/payment-gateway-server.js
```

**See:** [PROXY_ARCHITECTURE.md](./PROXY_ARCHITECTURE.md) for details

### 4. Custom Payment Provider

Implement the `PaymentProvider` interface:

```typescript
interface PaymentProvider {
  generatePaymentDetails(amount: number): any;
  verifyPayment(proof: any): Promise<PaymentVerification>;
  issueRefund(proof: any, amount: number): Promise<void>;
}
```

Example:

```javascript
class MyPaymentProvider {
  async generatePaymentDetails(amount) {
    return {
      invoiceUrl: 'https://pay.me/invoice-123',
      amount,
      currency: 'USD',
    };
  }

  async verifyPayment(proof) {
    const isValid = await this.checkWithAPI(proof);
    return {
      valid: isValid,
      amount: proof.amount,
    };
  }

  async issueRefund(proof, amount) {
    await this.refundAPI(proof, amount);
  }
}
```

## Configuration Options

```typescript
interface WS402Config {
  updateInterval?: number;           // Update frequency (ms) - default: 3000
  pricePerSecond?: number;           // Price per second - default: 1
  currency?: string;                 // Currency unit - default: 'wei'
  maxSessionDuration?: number;       // Max session time (seconds) - default: 3600
  userIdExtractor?: (req) => string; // Extract user ID from request
  onPaymentVerified?: (session) => void;
  onRefundIssued?: (session, refund) => void;
  onSessionEnd?: (session) => void;
}
```

## WS402 Schema

When a client requests a protected resource, return a WS402 schema:

```json
{
  "protocol": "ws402",
  "version": "0.1.0",
  "resourceId": "video-123",
  "websocketEndpoint": "wss://api.example.com/ws402/video-123",
  "pricing": {
    "pricePerSecond": 10,
    "currency": "wei",
    "estimatedDuration": 300,
    "totalPrice": 3000
  },
  "paymentDetails": {
    "type": "base",
    "network": "base",
    "chainId": 8453,
    "recipient": "0x...",
    "amountETH": "0.000003",
    "reference": "base_123_abc"
  },
  "maxSessionDuration": 600
}
```

## Message Types

### Client → Server

**Payment Proof**
```json
{
  "type": "payment_proof",
  "proof": {
    "txHash": "0x123...",
    "reference": "base_123_abc",
    "senderAddress": "0xUser...",
    "amount": 3000
  }
}
```

### Server → Client

**Session Started**
```json
{
  "type": "session_started",
  "sessionId": "ws402_123_abc",
  "balance": 3000,
  "pricePerSecond": 10
}
```

**Usage Update**
```json
{
  "type": "usage_update",
  "sessionId": "ws402_123_abc",
  "elapsedSeconds": 45,
  "consumedAmount": 450,
  "remainingBalance": 2550,
  "bytesTransferred": 1024000,
  "messageCount": 15
}
```

**Balance Exhausted**
```json
{
  "type": "balance_exhausted",
  "message": "Prepaid balance has been fully consumed"
}
```

**Payment Rejected**
```json
{
  "type": "payment_rejected",
  "reason": "Invalid payment proof"
}
```

## Examples

See the `/examples` directory for complete working examples:

### Development
- `basic-server.js` - Mock payment provider for testing
- `base-server.js` - Base blockchain integration
- `solana-server.js` - Solana blockchain integration (WebSocket)
- `solana-http-tracker.js` - Solana with HTTP resource protection
- `proxy-server.js` - Proxy architecture with gateway
- `payment-gateway-server.js` - Centralized payment gateway

### Clients
- `base-client.html` - Web client with MetaMask integration
- `solana-client.html` - Web client with Solana Pay
- `solana-http-tracker-client.html` - Web client for HTTP resource protection
- `proxy-client.html` - Web client for proxy architecture

### Run Examples

```bash
# Development with mock payments
npm run example

# Base blockchain
npm run example:base

# Solana blockchain (WebSocket)
npm run example:solana

# Solana with HTTP resources
node examples/solana-http-tracker.js

# Proxy architecture (run gateway first)
node examples/payment-gateway-server.js  # Terminal 1
node examples/proxy-server.js            # Terminal 2
```

Then open http://localhost:4028 in your browser.

## Session Lifecycle

```
1. Client requests resource → Server returns WS402 schema
2. Client makes payment → Blockchain transaction
3. Client connects via WebSocket → Sends payment proof
4. Server verifies payment on-chain → Starts session
5. Real-time metering → Server sends periodic updates
6. Client disconnects → Server calculates consumed amount
7. Automatic refund → Unused balance returned on-chain
```

## Comparison

### WS402 vs X402

| Feature | X402 | WS402 |
|---------|------|-------|
| Protocol | HTTP | WebSocket |
| Payment timing | Pay-per-request | Pay upfront, refund unused |
| Connection | Stateless | Stateful |
| Real-time updates | No | Yes |
| Refunds | No | Automatic |
| Use case | API endpoints | Streaming resources |

### Payment Provider Comparison

| Provider | Fees | Speed | Best For |
|----------|------|-------|----------|
| **Base** | ~$0.01 | 2-5 sec | Ethereum users, DeFi apps |
| **Solana** | ~$0.0001 | <1 sec | High volume, low fees |
| **Proxy** | Provider dependent | Provider dependent | Enterprise, multi-server |
| **Mock** | Free | Instant | Development, testing |

## API Reference

### `WS402`

Main class for WS402 protocol implementation.

#### Constructor
```javascript
new WS402(config: WS402Config, paymentProvider: PaymentProvider)
```

#### Methods

- `attach(wss: WebSocket.Server)` - Attach to WebSocket server
- `generateSchema(resourceId, estimatedDuration, pricePerSecond?)` - Generate WS402 schema
- `getSessionByUserId(userId)` - Get active session by user ID
- `getActiveSessions()` - Get all active sessions

#### Events

- `session_end` - Emitted when session ends
- `refund` - Emitted when refund is issued
- `refund_error` - Emitted when refund fails
- `error` - Emitted on errors

### Payment Providers

See detailed documentation:
- [Payment Providers Guide](./docs/PROVIDERS_README.md)
- [Proxy Architecture](./docs/PROXY_ARCHITECTURE.md)
- [Security Guide](./docs/SECURITY.md)

## Environment Variables

```bash
# Base Blockchain
BASE_RPC=https://mainnet.base.org
MERCHANT_WALLET=0xYourWalletAddress
MERCHANT_PRIVATE_KEY=your_private_key_here

# Solana Blockchain
SOLANA_RPC=https://api.mainnet-beta.solana.com
SOLANA_NETWORK=mainnet-beta
MERCHANT_WALLET=YourSolanaPublicKey
MERCHANT_PRIVATE_KEY='[1,2,3,4,...,64]'

# Optional: SPL Token
SPL_TOKEN_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# Proxy Gateway
GATEWAY_URL=https://payment-gateway.example.com
GATEWAY_API_KEY=your-secret-api-key

# Server
PORT=4028
```

See [`.env.example`](./.env.example) for full configuration.

## Security

### Private Key Management

⚠️ **CRITICAL**: Never expose private keys in code or repositories!

```javascript
// ❌ NEVER DO THIS
const provider = new BasePaymentProvider({
  merchantPrivateKey: '0x123abc...'
});

// ✅ ALWAYS USE ENVIRONMENT VARIABLES
const provider = new BasePaymentProvider({
  merchantPrivateKey: process.env.MERCHANT_PRIVATE_KEY
});
```

**Best Practices:**
- Use environment variables
- Store keys in secure vaults (AWS Secrets Manager, HashiCorp Vault)
- Use different wallets for dev/test/prod
- Consider proxy architecture for production
- Enable automatic refunds only on secure servers

See [SECURITY.md](./docs/SECURITY.md) for complete security guide.

## Production Deployment

### Option 1: Direct Integration (Small Scale)
```
[WS402 Server] → [Blockchain]
```
- Simple setup
- Good for single server
- Requires private key on server

### Option 2: Proxy Architecture (Enterprise)
```
[Load Balancer]
   ↓
[WS402 Servers] → [Payment Gateway] → [Blockchain]
                   (private keys here)
```
- Highly scalable
- Centralized security
- Multiple WS402 servers
- Recommended for production

See [PROXY_ARCHITECTURE.md](./docs/PROXY_ARCHITECTURE.md) for deployment guide.

## Contributing

Contributions welcome! This is an open-source project.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

## Roadmap

- [x] Base blockchain integration
- [x] Solana blockchain integration
- [x] Proxy payment architecture
- [x] Automatic refunds
- [x] HTTP resource protection with time tracking
- [ ] Bitcoin Lightning Network support
- [ ] Distribution pool for maintainer rewards
- [ ] WebRTC support
- [ ] Advanced metering strategies
- [ ] Rate limiting
- [ ] Session resumption
- [ ] Client SDKs (JavaScript, Python, Go)

## License

MIT License - see [LICENSE](LICENSE) file

## Links

- 🌐 Website: https://ws402.org
- 📦 NPM: https://npmjs.com/package/ws402
- 💬 X: https://x.com/ws402org
- 🔗 Farcaster: https://farcaster.xyz/ws402
- 💻 GitHub: https://github.com/ws402/ws402

## Support

- 💬 GitHub Issues: https://github.com/ws402/ws402/issues
- 🐦 Twitter/X: https://x.com/ws402org

## Acknowledgments

Inspired by the X402 protocol and the need for fair, pay-as-you-go pricing for WebSocket resources.

---

Built with ❤️ for the open web and blockchain ecosystem