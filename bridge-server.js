const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 9876, host: '0.0.0.0', path: '/status' });
const clients = new Set();

server.on('connection', (ws, req) => {
  clients.add(ws);
  console.log('client connected', req.socket.remoteAddress);

  ws.on('message', (msg) => {
    console.log('recv:', msg.toString());
    // Broadcast to all clients (including sender) so phone sees it
    for (const c of clients) {
      if (c.readyState === WebSocket.OPEN) {
        c.send(msg.toString());
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('client disconnected');
  });

  ws.on('error', (e) => {
    clients.delete(ws);
    console.error('ws error', e);
  });
});

console.log('Bridge server listening on ws://0.0.0.0:9876/status');
