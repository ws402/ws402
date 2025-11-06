# 📄 WS402: HTTP Resources with WebSocket Time Tracking

## 🎯 Use Case: PDF and HTTP Resources

### The Problem
You want to serve a PDF (or image, document, etc.) via regular HTTP, but charge based on the time the user has it open/consuming.

### The Solution
**Two separate channels:**
1. **HTTP** → Serves the complete resource (PDF)
2. **WebSocket** → Tracks usage time

## 🔄 Complete Flow

```
┌──────────────────────────────────────────────────────────────┐
│ PHASE 1: REQUEST AND PAYMENT                                 │
└──────────────────────────────────────────────────────────────┘

Client                            Server
  │
  │ 1. HTTP GET /api/resource/pdf-report-2024/schema
  ├──────────────────────────────────────────────────►
  │                                  └─► Returns WS402 Schema
  │                                      {
  │                                        websocketEndpoint: "ws://...",
  │                                        pricing: {
  │ 2. Schema received                      pricePerSecond: 5,
  │◄────────────────────────────────────    estimatedTime: 600s,
  │                                          totalPrice: 3000 wei
  │                                        }
  │                                      }
  │
  │ 3. WebSocket connect ws://server/ws402?resourceId=pdf-report-2024
  ├──────────────────────────────────────────────────►
  │                                  └─► Connection established
  │
  │ 4. Send payment_proof (3000 wei total)
  ├──────────────────────────────────────────────────►
  │                                  └─► Verify payment ✅
  │                                  └─► Create session
  │                                  └─► Generate HTTP token
  │
  │ 5. session_started + http_access_granted
  │    {
  │      type: "http_access_granted",
  │      httpToken: "http_123abc...",
  │      resourceUrl: "http://server/api/resource/pdf-report-2024?token=http_123abc"
  │    }
  │◄────────────────────────────────────────────────

┌──────────────────────────────────────────────────────────────┐
│ PHASE 2: RESOURCE DOWNLOAD (HTTP)                           │
└──────────────────────────────────────────────────────────────┘

Client                            Server
  │
  │ 6. HTTP GET /api/resource/pdf-report-2024?token=http_123abc
  ├──────────────────────────────────────────────────►
  │                                  └─► Verify token ✅
  │                                  └─► Check session active ✅
  │                                  └─► Serve PDF file
  │
  │ 7. PDF file received (COMPLETE!)
  │    [binary PDF data...]
  │◄────────────────────────────────────────────────
  │
  │ [Client opens PDF in browser]
  │ [WebSocket remains active in background]

┌──────────────────────────────────────────────────────────────┐
│ PHASE 3: TIME TRACKING (WebSocket in background)            │
└──────────────────────────────────────────────────────────────┘

Client                            Server
  │
  │ [WebSocket connection remains open]
  │
  │ 8. usage_update (every 3 seconds)
  │    {
  │      elapsedSeconds: 3,
  │      consumedAmount: 15 wei (3s × 5wei),
  │      remainingBalance: 2985 wei
  │    }
  │◄────────────────────────────────────────────────
  │
  │ 9. usage_update
  │    {
  │      elapsedSeconds: 6,
  │      consumedAmount: 30 wei,
  │      remainingBalance: 2970 wei
  │    }
  │◄────────────────────────────────────────────────
  │
  │ [User reads PDF for 2 minutes...]
  │
  │ 10. usage_update
  │    {
  │      elapsedSeconds: 120,
  │      consumedAmount: 600 wei (2min),
  │      remainingBalance: 2400 wei
  │    }
  │◄────────────────────────────────────────────────

┌──────────────────────────────────────────────────────────────┐
│ PHASE 4: CLIENT FINISHES AND DISCONNECTS                    │
└──────────────────────────────────────────────────────────────┘

Client                            Server
  │
  │ [User closes PDF or page]
  │
  │ 11. WebSocket close
  ├──────────────────────────────────────────────────►
  │                                  └─► Detect disconnect
  │                                  └─► Calculate usage:
  │                                      • Paid: 3000 wei
  │                                      • Used: 600 wei (2 min)
  │                                      • Refund: 2400 wei ✅
  │                                  └─► Issue refund
  │                                  └─► Remove HTTP token
  │                                  └─► End session
  │
  │ [Refund processed automatically]
```

## 💡 Key Features

### 1. Two Independent Channels

```javascript
// HTTP Channel - To serve the resource
GET /api/resource/pdf-123?token=abc
→ Downloads complete PDF

// WebSocket Channel - For time tracking
ws://server/ws402?resourceId=pdf-123
→ Tracks usage time
→ Sends updates every 3 seconds
→ Processes refund on disconnect
```

### 2. HTTP Access Token

```javascript
// After payment, you receive an HTTP token:
{
  type: "http_access_granted",
  httpToken: "http_1699123456_abc123",
  resourceUrl: "http://server/api/resource/pdf-123?token=http_1699123456_abc123"
}

// This token:
// ✅ Only valid while WebSocket session is active
// ✅ Linked to a specific resource
// ✅ Allows downloading the resource via HTTP
// ✅ Becomes invalid when WebSocket closes
```

### 3. Continuous Tracking

While the WebSocket is open:
- **Time is tracked automatically**
- **Updates every 3 seconds**
- **Balance deducted in real-time**
- **Client can see usage**

## 📊 Method Comparison

### Method 1: Resource via WebSocket (previous)
```
✅ Pros:
   - Single channel
   - Full streaming control
   
❌ Cons:
   - More complex for large files
   - Doesn't use HTTP cache
   - More client-side code
```

### Method 2: Resource via HTTP + Tracking via WebSocket (new)
```
✅ Pros:
   - Uses regular HTTP (easy for PDFs, images)
   - Leverages HTTP cache if desired
   - Client can use <iframe>, <img>, etc.
   - Simpler for static documents
   
❌ Cons:
   - Two connections (HTTP + WebSocket)
   - Need to manage tokens
```

## 🔧 Implementation

### Server

```javascript
// 1. Client pays via WebSocket
ws402.attach(wss);

ws402.on('paymentVerified', (session) => {
  // 2. Generate HTTP token
  const httpToken = generateToken();
  
  // 3. Save token (linked to session)
  httpSessions.set(httpToken, {
    sessionId: session.sessionId,
    resourceId: session.resourceId,
  });
  
  // 4. Send token to client
  ws.send({
    type: 'http_access_granted',
    httpToken: httpToken,
    resourceUrl: `/api/resource/${resourceId}?token=${httpToken}`
  });
});

// 5. Protected HTTP route
app.get('/api/resource/:id', (req, res) => {
  const token = req.query.token;
  
  // Verify token
  const session = httpSessions.get(token);
  if (!session) {
    return res.status(403).json({ error: 'Invalid token' });
  }
  
  // Serve resource
  res.sendFile(pdfPath);
  
  // WebSocket continues tracking time in background!
});

// 6. On WebSocket close → automatic refund
ws402.on('sessionEnd', (session) => {
  // Remove HTTP token
  removeTokenBySession(session.sessionId);
  
  // Refund processed automatically by WS402
});
```

### Client

```javascript
// 1. Get schema
const schema = await fetch('/api/resource/pdf-123/schema').then(r => r.json());

// 2. Connect WebSocket and pay
const ws = new WebSocket(schema.websocketEndpoint);
ws.send({ type: 'payment_proof', proof: {...} });

// 3. Receive HTTP token
ws.onmessage = (msg) => {
  if (msg.type === 'http_access_granted') {
    // 4. Load PDF via HTTP
    const iframe = document.createElement('iframe');
    iframe.src = msg.resourceUrl; // With token included
    document.body.appendChild(iframe);
    
    // WebSocket remains open tracking time!
  }
  
  if (msg.type === 'usage_update') {
    // Display real-time consumption
    console.log('Used:', msg.consumedAmount);
  }
};

// 5. When finished, close WebSocket
window.onbeforeunload = () => {
  ws.close(); // Trigger refund
};
```

## 🎯 Real Use Case: PDF Report

```javascript
Configuration:
- PDF: 50 pages
- Estimated reading time: 10 minutes (600 seconds)
- Price: 5 wei/second
- Initial payment: 3000 wei

Flow:
1. User pays 3000 wei
2. User downloads complete PDF (HTTP)
3. User reads for 3 minutes (WebSocket tracks)
4. User closes PDF
5. Time used: 180 seconds = 900 wei
6. Refund: 2100 wei (70% returned!)

User only paid for 3 minutes of reading ✅
```

## ✅ Design Advantages

1. **Simple for client**
   - PDF loads normally in `<iframe>`
   - No special JavaScript needed for PDF
   
2. **Flexible**
   - Works with PDFs, images, HTML5 videos
   - Uses native browser capabilities
   
3. **Fair**
   - Real-time tracking
   - Automatic refund
   - User pays only what they use

4. **Secure**
   - HTTP token linked to WebSocket session
   - Token invalidated on WebSocket close
   - Cannot reuse token

## 📝 Compatible Resource Types

```javascript
✅ PDFs (iframe or download)
✅ Images (img tag)
✅ Videos (video tag with HTTP)
✅ Documents (Word, Excel via download)
✅ Audio (audio tag)
✅ ZIP files (download)
✅ Anything servable via HTTP!
```

## 🚀 How to Use

1. **Install** (when published):
```bash
npm install ws402
```

2. **Import**:
```javascript
const { WS402, MockPaymentProvider } = require('ws402');
```

3. **Use the example**:
```bash
node http-resource-tracking-example.js
```

4. **Visit**:
```
http://localhost:3000
```

Complete example ready to use! 🎉

## 💰 Payment Flow Summary

```
┌─────────────────────────────────────────────────┐
│ TRANSACTION SUMMARY                             │
├─────────────────────────────────────────────────┤
│ Paid initially:      3000 wei (10 minutes)      │
│ Actually consumed:    600 wei (2 minutes)       │
│ Automatic refund:    2400 wei (80% returned)    │
│                                                 │
│ User only paid for what they used! ✅            │
└─────────────────────────────────────────────────┘
```

## 🔑 Key Concepts

### Session Lifecycle

```javascript
1. WebSocket connects → Session created
2. Payment verified → HTTP token generated
3. Resource accessed via HTTP → Token validated
4. Time tracked via WebSocket → Updates sent
5. WebSocket closes → Refund processed
6. HTTP token invalidated → Session ended
```

### Token Security

```javascript
✅ Token only valid while session active
✅ Token tied to specific resource
✅ Token cannot be shared/reused
✅ Token expires on disconnect
✅ One token per session
```

## 📈 Usage Scenarios

### Scenario 1: Quick Preview
```
User wants to preview a document
→ Pays for 10 minutes
→ Views for 30 seconds
→ Disconnects
→ Gets 98% refund ✅
```

### Scenario 2: Full Consumption
```
User wants to read entire document
→ Pays for 10 minutes
→ Reads for full 10 minutes
→ Disconnects
→ No refund (used everything) ✅
```

### Scenario 3: Interrupted Session
```
User starts reading
→ Pays for 10 minutes
→ Connection drops after 2 minutes
→ Automatic refund for 8 minutes ✅
```

## 🛡️ Security Features

- ✅ Payment verified before resource access
- ✅ Token-based HTTP protection
- ✅ Session validation on each request
- ✅ Automatic token cleanup
- ✅ No token reuse possible
- ✅ Time tracking cannot be manipulated

## 🎨 Client UI Integration

### Example: PDF Viewer
```html
<iframe id="pdfViewer" style="width:100%; height:600px;"></iframe>
<div id="tracking">
  Time used: <span id="time">0</span>s
  Balance: <span id="balance">0</span> wei
</div>

<script>
ws.onmessage = (msg) => {
  if (msg.type === 'http_access_granted') {
    document.getElementById('pdfViewer').src = msg.resourceUrl;
  }
  if (msg.type === 'usage_update') {
    document.getElementById('time').textContent = msg.elapsedSeconds;
    document.getElementById('balance').textContent = msg.remainingBalance;
  }
};
</script>
```

## 📚 Additional Resources

- See `http-resource-tracking-example.js` for complete working example
- See `middlewareHTTP.ts` for middleware implementation
- See main README.md for general WS402 documentation

---

**Built for fair, transparent, pay-as-you-go access to digital resources** 🚀
