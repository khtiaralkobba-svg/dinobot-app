const { WebSocketServer, WebSocket } = require('ws');
 
let wss = null;
 
/**
 * Attach the WebSocket server to an existing HTTP server.
 * Call once from server.js after httpServer is created.
 */
function init(httpServer) {
  wss = new WebSocketServer({ server: httpServer });
 
  wss.on('connection', (ws, req) => {
    console.log(`[ws] client connected  (total: ${wss.clients.size})`);
 
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
 
    ws.on('close', () => {
      console.log(`[ws] client disconnected (total: ${wss.clients.size})`);
    });
 
    ws.on('error', (err) => {
      console.error('[ws] client error:', err.message);
    });
 
    // Send a welcome ping so the client knows the socket is live
    safeSend(ws, { type: 'connected' });
  });
 
  // Heartbeat — drop zombies every 30 s
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);
 
  wss.on('close', () => clearInterval(heartbeat));
 
  console.log('✓ WebSocket server ready');
  return wss;
}
 
/**
 * Broadcast a typed event to every connected client.
 *
 * broadcast('order:updated', { order_ref: 'ORD-123', status: 'prep', ... })
 */
function broadcast(type, payload = {}) {
  if (!wss) return;
 
  const message = JSON.stringify({ type, payload });
 
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}
 
function safeSend(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}
 
module.exports = { init, broadcast };