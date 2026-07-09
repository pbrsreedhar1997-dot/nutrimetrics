const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');

// Real-time push layer. Writes always go through REST (auth/validation stays
// in one place); after a successful DB write, route handlers call pushToUser()
// to notify the target user's connected socket(s) — a pure notification
// channel, not a second way to mutate data.
function createSocketServer(server, JWT_SECRET) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const userSockets = new Map(); // userId -> Set<ws>

  wss.on('connection', (ws) => {
    let userId = null;

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.type === 'auth') {
        try {
          const decoded = jwt.verify(msg.token, JWT_SECRET);
          userId = decoded.id;
          if (!userSockets.has(userId)) userSockets.set(userId, new Set());
          userSockets.get(userId).add(ws);
          ws.send(JSON.stringify({ type: 'auth_ok' }));
        } catch {
          ws.send(JSON.stringify({ type: 'auth_error' }));
        }
      }
    });

    ws.on('close', () => {
      if (userId && userSockets.has(userId)) {
        userSockets.get(userId).delete(ws);
        if (userSockets.get(userId).size === 0) userSockets.delete(userId);
      }
    });
  });

  function pushToUser(userId, event) {
    const sockets = userSockets.get(userId);
    if (!sockets || !sockets.size) return;
    const payload = JSON.stringify(event);
    for (const sock of sockets) {
      if (sock.readyState === sock.OPEN) sock.send(payload);
    }
  }

  function pushToUsers(userIds, event) {
    for (const id of userIds) pushToUser(id, event);
  }

  return { pushToUser, pushToUsers };
}

module.exports = { createSocketServer };
