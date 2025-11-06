const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const ResourceTracker = require('./lib/ResourceTracker');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static frontend
app.use(express.static('public'));

// Initialize tracker: update every 3s, 1MB limit
const tracker = new ResourceTracker({
  updateInterval: 3000,
  byteThreshold: 1024 * 1024, // 1 MB
  userIdKey: 'user' // from ?user=alice
});

tracker.attach(wss);

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Open: http://localhost:${PORT}/?user=alice`);
});