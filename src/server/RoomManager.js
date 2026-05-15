const { v4: uuid } = require('uuid');
const GameRoom = require('./GameRoom');
const C = require('../shared/constants');

class RoomManager {
  constructor(io) {
    this.io    = io;
    this.rooms = new Map();
  }

  createRoom(mode) {
    const id = uuid().slice(0, 8).toUpperCase();
    const room = new GameRoom(id, mode, this.io);
    this.rooms.set(id, room);
    return room;
  }

  findOrCreate(mode) {
    // Find open non-full room of this mode
    for (const room of this.rooms.values()) {
      if (room.mode === mode && !room.isFull() && !room.gameOver) return room;
    }
    return this.createRoom(mode);
  }

  joinById(roomId) {
    return this.rooms.get(roomId) || null;
  }

  removeRoom(id) {
    this.rooms.delete(id);
  }

  cleanup() {
    for (const [id, room] of this.rooms) {
      if (room.players.size === 0) this.rooms.delete(id);
    }
  }

  list() {
    return [...this.rooms.values()]
      .filter(r => !r.gameOver && !r.isFull())
      .map(r => r.serialize());
  }
}

module.exports = RoomManager;
