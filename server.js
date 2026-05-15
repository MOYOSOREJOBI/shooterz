const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const compression = require('compression');
const path       = require('path');
const C          = require('./src/shared/constants');
const RoomManager = require('./src/server/RoomManager');
const leaderboard = require('./src/server/Leaderboard');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
  pingInterval: 10000,
  pingTimeout: 5000,
});

const PORT = process.env.PORT || 3000;
const rooms = new RoomManager(io);

app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

// Health check for Fly.io
app.get('/health', (_, res) => res.json({ ok: true, rooms: rooms.rooms.size }));

// Leaderboard REST endpoints
app.use(express.json({ limit: '4kb' }));
app.get('/api/leaderboard', async (_, res) => {
  const scores = await leaderboard.getTop(50);
  res.json(scores);
});
app.post('/api/leaderboard', async (req, res) => {
  const { name, kills, wave, time, mode, ts } = req.body || {};
  if (!name || typeof wave !== 'number') return res.status(400).json({ ok: false });
  await leaderboard.submit({ name: String(name).slice(0, 20), kills: Number(kills) || 0, wave: Number(wave) || 0, time: Number(time) || 0, mode: String(mode || 'solo'), ts: ts || new Date().toISOString() });
  res.json({ ok: true });
});

// Room list
app.get('/api/rooms', (_, res) => res.json(rooms.list()));

// ── Socket.io ─────────────────────────────────────────────────────────────
io.on('connection', socket => {
  let currentRoom = null;
  let playerName  = 'Player';

  socket.on(C.EVT.JOIN, async ({ mode, name, roomId } = {}) => {
    try {
      playerName = (name || '').trim().slice(0, 16) || C.AVATAR_NAMES[Math.floor(Math.random() * C.AVATAR_NAMES.length)];
      const safeMode = Object.values(C.MODES).includes(mode) ? mode : C.MODES.SOLO;

      let room;
      if (roomId) {
        room = rooms.joinById(roomId);
        if (!room) { socket.emit('error', { msg: 'Room not found' }); return; }
        if (room.isFull()) { socket.emit('error', { msg: 'Room is full' }); return; }
      } else {
        room = rooms.findOrCreate(safeMode);
      }

      currentRoom = room;
      socket.join(room.id);
      const player = room.addPlayer(socket.id, playerName, null);

      const lb = await leaderboard.getTop(20);
      socket.emit(C.EVT.ROOM_JOINED, {
        roomId:    room.id,
        playerId:  socket.id,
        mode:      room.mode,
        players:   [...room.players.values()].map(p => ({ id: p.id, name: p.name, colorIdx: p.colorIdx, team: p.team })),
        leaderboard: lb,
      });

      socket.to(room.id).emit('player_joined', { id: socket.id, name: player.name, colorIdx: player.colorIdx });
    } catch (err) {
      console.error('join error', err);
    }
  });

  socket.on(C.EVT.INPUT, input => {
    if (currentRoom) currentRoom.applyInput(socket.id, input);
  });

  socket.on(C.EVT.LEADERBOARD, async () => {
    const lb = await leaderboard.getTop(50);
    socket.emit(C.EVT.LEADERBOARD, lb);
  });

  socket.on(C.EVT.ROOM_LIST, () => {
    socket.emit(C.EVT.ROOM_LIST, rooms.list());
  });

  socket.on(C.EVT.PING, () => socket.emit(C.EVT.PONG, Date.now()));

  socket.on('disconnect', () => {
    if (currentRoom) {
      currentRoom.removePlayer(socket.id);
      socket.to(currentRoom.id).emit('player_left', { id: socket.id });
      if (currentRoom.players.size === 0) rooms.removeRoom(currentRoom.id);
      currentRoom = null;
    }
  });
});

// Periodic cleanup every 60s
setInterval(() => rooms.cleanup(), 60000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SHOOTERZ server running on :${PORT}`);
});
