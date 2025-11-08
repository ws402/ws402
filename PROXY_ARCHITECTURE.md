# 🔄 ProxyPaymentProvider Architecture

## Overview

The **ProxyPaymentProvider** implements a centralized payment gateway architecture where multiple WS402 servers delegate all payment operations to a single, secure gateway server.

## 🏗️ Architecture

```
┌─────────────────┐
│   Client A      │
└────────┬────────┘
         │
    ┌────▼──────┐          ┌──────────────────┐
    │ WS402     │          │                  │
    │ Server A  │◄────────►│  Payment Gateway │
    └───────────┘          │     Server       │
                           │                  │
┌─────────────────┐        │  - Verifies      │       ┌──────────────┐
│   Client B      │        │  - Has Keys      │◄─────►│ Blockchain   │
└────────┬────────┘        │  - Refunds       │       │ (Base/Solana)│
         │                 │  - Logs          │       └──────────────┘
    ┌────▼──────┐          │                  │
    │ WS402     │          └──────────────────┘
    │ Server B  │◄────────►
    └───────────┘


┌─────────────────┐
│   Client C      │
└────────┬────────┘
         │
    ┌────▼──────┐
    │ WS402     │
    │ Server C  │
    └───────────┘
```

## ✨ Benefits

### 🔐 Security
- **Private keys never leave the gateway** - WS402 servers don't need private keys
- **Single point of security** - easier to audit and secure
- **Reduced attack surface** - fewer servers with sensitive data

### 📈 Scalability
- **Horizontal scaling** - add more WS402 servers without managing keys
- **Load balancing** - distribute WS402 servers, gateway handles payments
- **Geographic distribution** - WS402 servers worldwide, one gateway

### 🛠️ Operational
- **Centralized logging** - all payments in one place
- **Easier compliance** - single point for regulatory requirements
- **Simplified deployment** - WS402 servers are stateless regarding payments
- **Cost effective** - fewer blockchain nodes needed

### 🔄 Flexibility
- **Multiple blockchains** - gateway can support Base, Solana, etc.
- **Easy upgrades** - update payment logic in one place
- **A/B testing** - test new payment features on gateway

## 📦 Components

### 1. ProxyPaymentProvider (WS402 Server Side)

```typescript
import { ProxyPaymentProvider } from 'ws402';

const proxyProvider = new ProxyPaymentProvider({
  gatewayUrl: 'https://payment-gateway.example.com',
  apiKey: process.env.GATEWAY_API_KEY,
  timeout: 30000,
  retryAttempts: 3,
});
```

**Responsibilities:**
- Forward payment requests to gateway
- Handle network retries
- Maintain WebSocket sessions
- Track usage and time

### 2. Payment Gateway Server

```bash
node examples/payment-gateway-server.js
```

**Responsibilities:**
- Verify payments on blockchain
- Process refunds with private keys
- Generate payment details
- Centralized logging
- API authentication

### 3. WS402 Server

```bash
node examples/proxy-server.js
```

**Responsibilities:**
- Handle WebSocket connections
- Track resource usage
- Delegate payments to gateway
- Serve resources

## 🚀 Setup

### Step 1: Start Payment Gateway

```bash
# Set environment variables
export MERCHANT_PRIVATE_KEY=0xYourPrivateKey
export MERCHANT_WALLET=0xYourWallet
export GATEWAY_API_KEY=super-secret-key
export GATEWAY_PORT=4029

# Start gateway
node examples/payment-gateway-server.js
```

### Step 2: Start WS402 Server(s)

```bash
# Set environment variables
export GATEWAY_URL=http://localhost:4029
export GATEWAY_API_KEY=super-secret-key
export PORT=4030

# Start WS402 server
node examples/proxy-server.js
```

### Step 3: Add More WS402 Servers

```bash
# Server 2
export PORT=4031
node examples/proxy-server.js

# Server 3
export PORT=4032
node examples/proxy-server.js
```

All servers use the same gateway!

## 🔌 API Endpoints

### Gateway Server (Port 4029)

#### Health Check
```bash
GET /api/health
```

#### Generate Payment Details
```bash
POST /api/payment/generate
Authorization: Bearer YOUR_API_KEY

{
  "amount": 3000,
  "resourceId": "premium-video",
  "estimatedDuration": 300
}
```

#### Verify Payment
```bash
POST /api/payment/verify
Authorization: Bearer YOUR_API_KEY

{
  "proof": {
    "txHash": "0x123...",
    "reference": "base_123_abc",
    "senderAddress": "0xUser..."
  }
}
```

#### Issue Refund
```bash
POST /api/payment/refund
Authorization: Bearer YOUR_API_KEY

{
  "proof": {
    "txHash": "0x123...",
    "senderAddress": "0xUser..."
  },
  "amount": 1000
}
```

#### Get Stats
```bash
GET /api/stats
Authorization: Bearer YOUR_API_KEY
```

## 🔒 Security

### API Key Management

**Gateway Server:**
```bash
GATEWAY_API_KEY=super-secret-key-change-this
```

**WS402 Servers:**
```bash
GATEWAY_API_KEY=super-secret-key-change-this
```

**Best Practices:**
- Use strong, random API keys (32+ characters)
- Rotate keys regularly
- Use different keys per environment
- Store in secure secret management (AWS Secrets Manager, Vault)

### Network Security

**Production Setup:**
```
[Internet] 
    ↓
[Load Balancer] → [WS402 Server 1]
                → [WS402 Server 2]
                → [WS402 Server 3]
    ↓ (internal network only)
[Payment Gateway] ← Private subnet, no public access
    ↓
[Blockchain]
```

**Recommendations:**
- Gateway should be on private subnet
- Only WS402 servers can reach gateway
- Use VPN/VPC for communication
- TLS/HTTPS for all connections
- Firewall rules to restrict access

### Private Key Security

**Only the gateway needs private keys:**
- Store in HSM (Hardware Security Module) in production
- Use AWS KMS, Google Cloud KMS, or Azure Key Vault
- Never log or expose private keys
- Implement key rotation
- Use multi-sig wallets for high-value operations

## 📊 Monitoring

### Gateway Metrics to Track

```javascript
// Track payment operations
const metrics = {
  paymentsVerified: 0,
  paymentsRejected: 0,
  refundsIssued: 0,
  refundsFailed: 0,
  totalVolume: 0,
  averageResponseTime: 0,
};
```

### Recommended Tools

- **Prometheus** + **Grafana** - metrics and dashboards
- **Sentry** - error tracking
- **CloudWatch** / **Datadog** - logs and monitoring
- **PagerDuty** - alerting

### Health Checks

```bash
# Gateway health
curl http://localhost:4029/api/health

# WS402 server gateway connectivity
curl http://localhost:4030/gateway-health
```

## 🧪 Testing

### Test with Mock Gateway

```javascript
// Create a mock gateway for testing
const mockGateway = {
  verify: () => ({ valid: true, amount: 1000 }),
  refund: () => ({ status: 'success' }),
};
```

### Integration Tests

```bash
# 1. Start gateway
npm run start:gateway

# 2. Start WS402 server
npm run start:proxy

# 3. Run tests
npm test
```

## 🌐 Production Deployment

### Option 1: Single Region

```
Region: US-East

[WS402 Servers] → [Gateway] → [Blockchain RPC]
```

### Option 2: Multi-Region

```
Region: US-East
[WS402 Servers] ───┐
                   │
Region: EU-West    ├─→ [Gateway US-East] → [Blockchain]
[WS402 Servers] ───┤
                   │
Region: Asia       │
[WS402 Servers] ───┘
```

**Note:** Latency to gateway affects payment verification time

### Option 3: Multi-Gateway (Advanced)

```
Region: US
[WS402] → [Gateway US] → [Blockchain]

Region: EU
[WS402] → [Gateway EU] → [Blockchain]
```

**Requires:**
- Distributed payment tracking
- Database synchronization
- More complex but lower latency

## 💰 Cost Analysis

### Traditional (Each Server Has Keys)

```
3 WS402 Servers × (RPC cost + key management) = High cost
```

### Proxy Architecture

```
3 WS402 Servers (minimal) + 1 Gateway (RPC + keys) = Lower cost
```

**Savings:**
- Fewer RPC connections needed
- Centralized rate limiting
- Shared blockchain node
- Reduced security overhead

## 🔄 Migration Path

### From Direct → Proxy

**Phase 1: Add Gateway**
1. Deploy payment gateway
2. Keep existing WS402 servers running

**Phase 2: Migrate Servers**
1. Update one WS402 server to use ProxyProvider
2. Test thoroughly
3. Migrate remaining servers
4. Remove private keys from old servers

**Phase 3: Optimize**
1. Add more WS402 servers
2. Fine-tune gateway performance
3. Add monitoring and alerting

## 📚 Related Documentation

- [BasePaymentProvider](./PROVIDERS_README.md#basepaymentprovider) - Direct blockchain integration
- [Security Guide](./SECURITY.md) - Private key management
- [Development Guide](./DEVELOPMENT.md) - Local setup

## 🤝 Support

- **Issues**: https://github.com/ws402/ws402/issues
- **Discord**: https://discord.gg/ws402
- **Email**: support@ws402.org
