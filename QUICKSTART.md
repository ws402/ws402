# WS402 - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Install

```bash
npm install ws402
```

### Step 2: Create Server

Create `server.js`:

```javascript
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { WS402, MockPaymentProvider } = require('ws402');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize WS402
const ws402 = new WS402(
  {
    pricePerSecond: 10,           // 10 wei/second
    updateInterval: 3000,         // Update every 3s
    currency: 'wei',
    
    onPaymentVerified: (session) => {
      console.log('✅ Payment verified:', session.sessionId);
    },
    
    onRefundIssued: (session, refund) => {
      console.log('💰 Refund:', refund.amount);
    },
  },
  new MockPaymentProvider()  // Replace with real provider in production
);

// Attach to WebSocket server
ws402.attach(wss);

// Serve WS402 schema
app.get('/schema', (req, res) => {
  const schema = ws402.generateSchema('my-resource', 300);
  res.json(schema);
});

server.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});
```

### Step 3: Create Client

Create `client.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>WS402 Client</title>
</head>
<body>
  <h1>WS402 Demo</h1>
  <button onclick="connect()">Connect</button>
  <div id="status"></div>
  
  <script>
    let ws;
    
    async function connect() {
      // Get schema
      const response = await fetch('/schema');
      const schema = await response.json();
      
      // Connect WebSocket
      ws = new WebSocket('ws://localhost:3000?userId=alice');
      
      ws.onopen = () => {
        // Send payment proof
        ws.send(JSON.stringify({
          type: 'payment_proof',
          proof: {
            amount: schema.pricing.totalPrice,
            userId: 'alice',
            txId: 'mock_' + Date.now(),
          }
        }));
      };
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        document.getElementById('status').textContent = JSON.stringify(data, null, 2);
      };
    }
  </script>
</body>
</html>
```

### Step 4: Run

```bash
node server.js
```

Open http://localhost:3000/client.html

## 🔧 Next Steps

### Replace Mock Payment Provider

```javascript
const { BasePaymentProvider } = require('ws402');

const provider = new BasePaymentProvider({
  apiKey: process.env.PAYMENT_API_KEY,
  apiEndpoint: 'https://payment-api.com',
  walletAddress: process.env.WALLET_ADDRESS,
});

const ws402 = new WS402(config, provider);
```

### Add Express Middleware

```javascript
const { createWS402Middleware } = require('ws402');

app.get('/ws402/schema/:resourceId', 
  createWS402Middleware(ws402)
);
```

### Track Active Sessions

```javascript
// Get all active sessions
const sessions = ws402.getActiveSessions();

// Get specific user session
const session = ws402.getSessionByUserId('alice');
```

### Listen to Events

```javascript
ws402.on('session_end', (session) => {
  console.log('Session ended:', session);
});

ws402.on('refund', ({ session, refund }) => {
  console.log('Refund issued:', refund);
});

ws402.on('error', (error) => {
  console.error('Error:', error);
});
```

## 📚 Full Documentation

- [README.md](./README.md) - Complete documentation
- [examples/](./examples/) - Working examples
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guide

## 🆘 Need Help?

- Open an issue on GitHub
- Join us on X: [@ws402org](https://x.com/ws402org)
- Check [ws402.org](https://ws402.org)

## 🔗 Links

- GitHub: https://github.com/ws402/ws402
- NPM: https://npmjs.com/package/ws402
- Website: https://ws402.org
