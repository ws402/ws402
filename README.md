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

```javascript
const { WS402, SolanaPaymentProvider } = require('ws402');

const solanaProvider = new SolanaPaymentProvider({
  rpcEndpoint: 'https://api.mainnet-beta.solana.com',
  merchantWallet: 'YourSolanaPublicKey',
  network: 'mainnet-beta',
  conversionRate: 1000000000, // wei to lamports
  label: 'WS402 Payment',
  message: 'Pay for WebSocket access',
});

const ws402 = new WS402(config, solanaProvider);
```

**Features:**
- ✅ Native SOL payments
- ✅ SPL token support (USDC, USDT, etc.)
- ✅ Solana Pay QR codes
- ✅ ~$0.0001 transaction fees
- ✅ Sub-second confirmations
- ✅ Automatic on-chain refunds

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
- `solana-server.js` - Solana blockchain integration
- `proxy-server.js` - Proxy architecture with gateway
- `payment-gateway-server.js` - Centralized payment gateway

### Clients
- `base-client.html` - Web client with MetaMask integration
- `solana-client.html` - Web client with Solana Pay
- `proxy-client.html` - Web client for proxy architecture

### Run Examples

```bash
# Development with mock payments
npm run example

# Base blockchain
npm run example:base

# Solana blockchain
npm run example:solana

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
- `generateSchema(resourceId, estimatedDuration)` - Generate WS402 schema
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
SOLANA_WALLET=YourSolanaPublicKey

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
- 📚 Documentation: https://docs.ws402.org

## Support

- 💬 GitHub Issues: https://github.com/ws402/ws402/issues
- 📧 Email: support@ws402.org
- 💬 Discord: https://discord.gg/ws402
- 🐦 Twitter/X: https://x.com/ws402org

## Acknowledgments

Inspired by the X402 protocol and the need for fair, pay-as-you-go pricing for WebSocket resources.

---

Built with ❤️ for the open web and blockchain ecosystem