// lib/ResourceTracker.js
const { OPEN, CLOSING, CLOSED } = require('ws'); // Import WebSocket states

class ResourceTracker {
  constructor(options = {}) {
    this.clients = new Map();
    this.updateInterval = options.updateInterval || 5000;
    this.byteThreshold = options.byteThreshold || Infinity;
    this.userIdKey = options.userIdKey || 'userId';
  }

  attach(wss) {
    wss.on('connection', (ws, req) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const userId = url.searchParams.get(this.userIdKey) || 'anonymous';

      const session = {
        userId,
        startTime: Date.now(),
        bytesReceived: 0,
        messageCount: 0,
      };
      this.clients.set(ws, session);

      // Wrap message handler to count bytes
      const originalOnMessage = ws.onmessage;
      ws.onmessage = (event) => {
        const data = event.data;
        const byteLength = Buffer.byteLength(
          typeof data === 'string' ? data : data,
          'utf8'
        );
        session.bytesReceived += byteLength;
        session.messageCount++;

        // Call original handler if exists
        if (originalOnMessage) originalOnMessage.call(ws, event);

        // Enforce limit
        if (session.bytesReceived > this.byteThreshold) {
          ws.send(
            JSON.stringify({
              type: 'limit_exceeded',
              message: 'Byte limit reached',
              bytes: session.bytesReceived,
            })
          );
          ws.close(1013, 'Usage limit exceeded');
        }
      };

      // Send periodic updates
      const interval = setInterval(() => {
        this.sendUpdate(ws, session);
      }, this.updateInterval);

      // Initial update
      this.sendUpdate(ws, session);

      // Cleanup
      ws.on('close', () => {
        clearInterval(interval);
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        clearInterval(interval);
        this.clients.delete(ws);
      });
    });
  }

  sendUpdate(ws, session) {
    if (ws.readyState !== OPEN) return; // Fixed: Use OPEN from 'ws'

    const elapsed = Math.floor((Date.now() - session.startTime) / 1000);

    ws.send(
      JSON.stringify({
        type: 'usage_update',
        userId: session.userId,
        seconds: elapsed,
        bytesReceived: session.bytesReceived,
        messageCount: session.messageCount,
        limit: this.byteThreshold,
      })
    );
  }

  // Optional: Get usage by user ID
  getUsage(userId) {
    for (const [ws, session] of this.clients) {
      if (session.userId === userId) {
        const elapsed = Math.floor((Date.now() - session.startTime) / 1000);
        return {
          userId,
          seconds: elapsed,
          bytesReceived: session.bytesReceived,
          messageCount: session.messageCount,
        };
      }
    }
    return null;
  }
}

module.exports = ResourceTracker;