# WS402

> WebSocket implementation of X402 protocol for pay-as-you-go digital resources with automatic refunds

[![npm version](https://badge.fury.io/js/ws402.svg)](https://www.npmjs.com/package/ws402)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

WS402 extends the X402 protocol to WebSocket connections, enabling true pay-as-you-go pricing for streaming resources. Users pay upfront for estimated usage, the backend tracks actual consumption in real-time, and unused balance is automatically refunded when the session ends.

**Perfect for:**
- Video/audio streaming
- API access with metered billing
- Real-time data feeds
- Cloud computing resources
- AI model inference
- Gaming servers
- VPN services

## Features

- ✅ **Automatic refunds** - Users only pay for what they actually consume
- ⚡ **Real-time metering** - Track usage by time, bytes, or custom metrics
- 🔒 **Payment verification** - Built-in hooks for payment provider integration
- 🌐 **BASE blockchain ready** - Designed for BASE blockchain payments
- 📊 **Usage tracking** - Detailed session metrics and callbacks
- 🎯 **Simple integration** - Similar to X402, easy to add to existing apps
- 🔌 **Payment provider agnostic** - Works with any payment system

## Installation

```bash
npm install ws402
```

## Quick Start

### Server Setup

```javascript
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { WS402, MockPaymentProvider } = require('ws402');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize payment provider
const paymentProvider = new MockPaymentProvider();

// Create WS402 instance
const ws402 = new WS402(
  {
    updateInterval: 3000,      // Send updates every 3 seconds
    pricePerSecond: 10,        // Price per second in your currency
    currency: 'wei',
    maxSessionDuration: 600,   // Max 10 minutes per session
    
    onPaymentVerified: (session) => {
      console.log(`Payment verified: ${session.sessionId}`);
    },
    
    onRefundIssued: (session, refund) => {
      console.log(`Refund issued: ${refund.amount}`);
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

server.listen(3000);
```

### Client Integration

```javascript
// 1. Fetch WS402 schema
const response = await fetch('/ws402/schema/my-resource?duration=300');
const schema = await response.json();

// 2. Connect to WebSocket
const ws = new WebSocket(`wss://your-server.com?userId=alice`);

// 3. Send payment proof
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'payment_proof',
    proof: {
      amount: schema.pricing.totalPrice,
      txHash: '0x...', // Your payment transaction
      // ... other payment details
    }
  }));
};

// 4. Receive usage updates
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'session_started') {
    console.log('Session active!', data.sessionId);
  }
  
  if (data.type === 'usage_update') {
    console.log(`Used: ${data.consumedAmount}, Remaining: ${data.remainingBalance}`);
  }
};

// 5. Disconnect to trigger automatic refund
ws.close();
```

## Payment Provider Integration

### Using BASE Blockchain

```javascript
const { BasePaymentProvider } = require('ws402');

const provider = new BasePaymentProvider({
  apiKey: 'your-api-key',
  apiEndpoint: 'https://payment-provider-api.com',
  walletAddress: '0xYourWalletAddress',
});

const ws402 = new WS402(config, provider);
```

### Custom Payment Provider

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
    // Verify with your payment API
    const isValid = await this.checkWithAPI(proof);
    return {
      valid: isValid,
      amount: proof.amount,
    };
  }

  async issueRefund(proof, amount) {
    // Process refund via your payment API
    await this.refundAPI(proof, amount);
  }
}
```

## Configuration Options

```typescript
interface WS402Config {
  updateInterval?: number;           // Update frequency (ms)
  pricePerSecond?: number;           // Price per second
  currency?: string;                 // Currency unit
  maxSessionDuration?: number;       // Max session time (seconds)
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
    "walletAddress": "0x...",
    "invoiceId": "inv_123"
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
    "amount": 3000,
    "txHash": "0x...",
    "timestamp": 1234567890
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

- `basic-server.js` - Simple WS402 server
- `public/index.html` - Web client implementation

Run the example:

```bash
npm run example
```

Then open http://localhost:3000 in your browser.

## Session Lifecycle

1. **Client requests resource** → Server returns WS402 schema
2. **Client connects via WebSocket** → Sends payment proof
3. **Server verifies payment** → Starts session and usage tracking
4. **Real-time metering** → Server sends periodic usage updates
5. **Client disconnects** → Server calculates consumed amount
6. **Automatic refund** → Unused balance returned to client

## API Reference

### `WS402`

Main class for WS402 protocol implementation.

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

## Differences from X402

| Feature | X402 | WS402 |
|---------|------|-------|
| Protocol | HTTP | WebSocket |
| Payment timing | Pay-per-request | Pay upfront, refund unused |
| Connection | Stateless | Stateful |
| Real-time updates | No | Yes |
| Use case | API endpoints | Streaming resources |

## Contributing

Contributions welcome! This is an open-source project.

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## Roadmap

- [ ] Distribution pool for maintainer rewards
- [ ] Additional payment provider integrations
- [ ] WebRTC support
- [ ] Advanced metering strategies
- [ ] Rate limiting
- [ ] Session resumption

## License

MIT License - see [LICENSE](LICENSE) file

## Links

- 🌐 Website: https://ws402.org
- 📦 NPM: https://npmjs.com/package/ws402
- 💬 X: https://x.com/ws402org
- 🔗 Farcaster: https://farcaster.xyz/ws402
- 💻 GitHub: https://github.com/ws402/ws402

## Support

- Open an issue on GitHub
- Join our community on X or Farcaster
- Check the documentation at ws402.org

---

Built with ❤️ for the open web
