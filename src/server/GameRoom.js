const { v4: uuid } = require('uuid');
const C = require('../shared/constants');
const leaderboard = require('./Leaderboard');

const TWO_PI = Math.PI * 2;
const TICK_DT = 1 / C.TICK_RATE;

function rand(min, max) { return Math.random() * (max - min) + min; }
function randEdge() {
  const e = (Math.random() * 4) | 0;
  if (e === 0) return { x: rand(-C.ARENA_HW, C.ARENA_HW), y:  C.ARENA_HH + 30 };
  if (e === 1) return { x: rand(-C.ARENA_HW, C.ARENA_HW), y: -C.ARENA_HH - 30 };
  if (e === 2) return { x:  C.ARENA_HW + 30, y: rand(-C.ARENA_HH, C.ARENA_HH) };
               return { x: -C.ARENA_HW - 30, y: rand(-C.ARENA_HH, C.ARENA_HH) };
}

class Entity {
  constructor(type, x, y, extra = {}) {
    this.id   = uuid();
    this.type = type;
    this.x    = x;
    this.y    = y;
    this.vx   = extra.vx || 0;
    this.vy   = extra.vy || 0;
    this.r    = extra.r  || 10;
    this.hp   = extra.hp || 0;
    this.maxHp= extra.maxHp || extra.hp || 0;
    this.rotation = extra.rotation || 0;
    this.ownerId  = extra.ownerId  || null;
    this.life     = extra.life     || 0;
    this.maxLife  = extra.maxLife  || 0;
    this.dead     = false;
    this.hitTimer = 0;
    this.w        = extra.w || (extra.r ? extra.r * 2 : 20);
    this.h        = extra.h || (extra.r ? extra.r * 2 : 20);
  }
}

class GameRoom {
  constructor(id, mode, io) {
    this.id      = id;
    this.mode    = mode;
    this.io      = io;
    this.players = new Map(); // socketId → PlayerState
    this.enemies = new Map();
    this.projs   = new Map();
    this.pickups = new Map();

    this.wave         = 0;
    this.enemiesLeft  = 0;
    this.graceTimer   = 1.5; // brief startup delay
    this.gameStarted  = false;
    this.gameOver     = false;
    this.startTime    = Date.now();

    this._interval = null;
    this._sendAccum = 0;
    this._tickAccum = 0;
    this._lastTs    = Date.now();

    this._start();
  }

  // ── Mode helpers ──────────────────────────────────────────────────────────
  maxPlayers() {
    const m = this.mode;
    if (m === C.MODES.SOLO) return 1;
    if (m === C.MODES.V1V1 || m === C.MODES.COOP) return 2;
    if (m === C.MODES.V1V1V1) return 3;
    return 4;
  }

  isFull() { return this.players.size >= this.maxPlayers(); }

  teamOf(socketId) {
    const p = this.players.get(socketId);
    return p ? p.team : -1;
  }

  friendlyFire() {
    return this.mode !== C.MODES.COOP && this.mode !== C.MODES.SOLO;
  }

  // ── Player lifecycle ──────────────────────────────────────────────────────
  addPlayer(socketId, name, color) {
    const idx  = this.players.size;
    let team;
    if (this.mode === C.MODES.V2V2) team = idx < 2 ? 0 : 1;
    else if (this.mode === C.MODES.COOP) team = 0;
    else team = idx;

    const spawnPos = this._playerSpawn(idx);
    const p = {
      id:         socketId,
      name:       name || C.AVATAR_NAMES[Math.floor(Math.random() * C.AVATAR_NAMES.length)],
      colorIdx:   idx,
      team,
      x:          spawnPos.x,
      y:          spawnPos.y,
      vx:         0,
      vy:         0,
      rotation:   0,
      hp:         C.PLAYER_HP,
      maxHp:      C.PLAYER_HP,
      alive:      true,
      hitTimer:   0,
      fireTimer:  0,
      // Stats
      kills:      0,
      deaths:     0,
      bulletsUsed:0,
      distanceTraveled: 0,
      timeAlive:  0,
      // Input (latest received)
      input: { left:false, right:false, up:false, down:false, aimX:0, aimY:0, shooting:false },
    };
    this.players.set(socketId, p);
    return p;
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    if (this.players.size === 0) this._stop();
  }

  _playerSpawn(idx) {
    const spots = [
      { x: 0, y: 0 },
      { x: -120, y: -80 },
      { x:  120, y: -80 },
      { x:    0, y:  120 },
    ];
    return spots[idx] || { x: 0, y: 0 };
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  applyInput(socketId, input) {
    const p = this.players.get(socketId);
    if (p && p.alive) p.input = input;
  }

  // ── Game loop ─────────────────────────────────────────────────────────────
  _start() {
    this._interval = setInterval(() => this._tick(), 1000 / C.TICK_RATE);
  }

  _stop() {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  }

  _tick() {
    const now = Date.now();
    const dt  = Math.min((now - this._lastTs) / 1000, 0.05);
    this._lastTs = now;
    if (this.gameOver) return;

    this._updatePlayers(dt);
    this._updateEnemies(dt);
    this._updateProjs(dt);
    this._updatePickups(dt);
    this._updateWave(dt);
    this._checkDeaths();

    this._sendAccum += dt;
    if (this._sendAccum >= 1 / C.SEND_RATE) {
      this._sendAccum = 0;
      this._broadcast();
    }
  }

  // ── Player update ─────────────────────────────────────────────────────────
  _updatePlayers(dt) {
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      p.timeAlive += dt;
      p.hitTimer   = Math.max(0, p.hitTimer - dt);
      p.fireTimer  = Math.max(0, p.fireTimer - dt);

      const { left, right, up, down, aimX, aimY, shooting } = p.input;
      let mx = (right ? 1 : 0) - (left ? 1 : 0);
      let my = (down  ? 1 : 0) - (up   ? 1 : 0);
      const len = Math.hypot(mx, my);
      if (len > 0.01) { mx /= len; my /= len; }

      const prevX = p.x, prevY = p.y;
      p.vx = mx * C.PLAYER_SPEED;
      p.vy = my * C.PLAYER_SPEED;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.distanceTraveled += Math.hypot(p.x - prevX, p.y - prevY);

      // Clamp to arena
      p.x = Math.max(-C.ARENA_HW + C.PLAYER_R, Math.min(C.ARENA_HW - C.PLAYER_R, p.x));
      p.y = Math.max(-C.ARENA_HH + C.PLAYER_R, Math.min(C.ARENA_HH - C.PLAYER_R, p.y));

      // Aim rotation
      const dx = aimX - p.x, dy = aimY - p.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) p.rotation = Math.atan2(dy, dx);

      // Shoot
      if (shooting && p.fireTimer <= 0 && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
        const d = Math.hypot(dx, dy);
        this._spawnProj(p.id, p.x, p.y, dx / d, dy / d);
        p.fireTimer  = C.FIRE_CD;
        p.bulletsUsed++;
      }
    }
  }

  // ── Enemy update ──────────────────────────────────────────────────────────
  _updateEnemies(dt) {
    for (const e of this.enemies.values()) {
      if (e.dead) continue;
      e.hitTimer = Math.max(0, e.hitTimer - dt);

      // Chase nearest living player
      let nearX = 0, nearY = 0, nearDist = Infinity;
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x - e.x, p.y - e.y);
        if (d < nearDist) { nearDist = d; nearX = p.x; nearY = p.y; }
      }
      if (nearDist < Infinity) {
        const dx = nearX - e.x, dy = nearY - e.y;
        const d  = Math.hypot(dx, dy) || 1;
        const spd = e.type === C.TYPE.TANK ? C.TANK_SPEED : C.CHASER_SPEED;
        e.vx = (dx / d) * spd;
        e.vy = (dy / d) * spd;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.x = Math.max(-C.ARENA_HW - 40, Math.min(C.ARENA_HW + 40, e.x));
      e.y = Math.max(-C.ARENA_HH - 40, Math.min(C.ARENA_HH + 40, e.y));

      // Collide with players
      for (const p of this.players.values()) {
        if (!p.alive || p.hitTimer > 0) continue;
        const d = Math.hypot(p.x - e.x, p.y - e.y);
        if (d < C.PLAYER_R + e.r) {
          const dmg = e.type === C.TYPE.TANK ? C.TANK_DAMAGE : C.CHASER_DAMAGE;
          p.hp -= dmg;
          p.hitTimer = C.HIT_CD;
          this._emitEvent('hit', { x: p.x, y: p.y, color: '#ff4455' });
        }
      }
    }
  }

  // ── Projectile update ─────────────────────────────────────────────────────
  _updateProjs(dt) {
    for (const proj of this.projs.values()) {
      if (proj.dead) continue;
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      proj.life -= dt;
      if (proj.life <= 0) { proj.dead = true; continue; }

      // Out of arena
      if (Math.abs(proj.x) > C.ARENA_HW + 60 || Math.abs(proj.y) > C.ARENA_HH + 60) {
        proj.dead = true; continue;
      }

      // vs enemies
      for (const e of this.enemies.values()) {
        if (e.dead) continue;
        if (Math.hypot(proj.x - e.x, proj.y - e.y) < e.r) {
          proj.dead = true;
          e.hp -= C.PROJ_DAMAGE_ENEMY;
          if (e.hp <= 0) {
            e.dead = true;
            this.enemiesLeft = Math.max(0, this.enemiesLeft - 1);
            this._emitEvent('kill_enemy', { x: e.x, y: e.y, color: e.type === C.TYPE.TANK ? '#a040c0' : '#e03030' });
            // Credit kill to shooter
            const shooter = this.players.get(proj.ownerId);
            if (shooter) shooter.kills++;
            // Pickup drop
            if (Math.random() < C.PICKUP_CHANCE) this._spawnPickup(e.x, e.y);
          } else {
            this._emitEvent('hit_enemy', { x: e.x, y: e.y });
          }
          break;
        }
      }
      if (proj.dead) continue;

      // vs players (friendly fire / PvP)
      if (this.friendlyFire()) {
        for (const p of this.players.values()) {
          if (!p.alive || p.id === proj.ownerId || p.hitTimer > 0) continue;
          // Same team → no damage in 2v2/coop
          if (this.mode === C.MODES.V2V2 && this.teamOf(proj.ownerId) === p.team) continue;
          if (Math.hypot(proj.x - p.x, proj.y - p.y) < C.PLAYER_R) {
            proj.dead = true;
            p.hp -= C.PROJ_DAMAGE_PLAYER;
            p.hitTimer = 0.15;
            this._emitEvent('hit', { x: p.x, y: p.y, color: C.TEAM_COLORS[p.colorIdx] });
            break;
          }
        }
      }
    }
    // Clean dead projectiles
    for (const [id, p] of this.projs) if (p.dead) this.projs.delete(id);
  }

  // ── Pickups ───────────────────────────────────────────────────────────────
  _updatePickups(dt) {
    for (const [id, pu] of this.pickups) {
      pu.life -= dt;
      if (pu.life <= 0) { this.pickups.delete(id); continue; }
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        if (Math.hypot(p.x - pu.x, p.y - pu.y) < C.PLAYER_R + C.PICKUP_R) {
          p.hp = Math.min(p.hp + C.PICKUP_HEAL, p.maxHp);
          this.pickups.delete(id);
          this._emitEvent('pickup', { x: pu.x, y: pu.y });
          break;
        }
      }
    }
  }

  // ── Wave management ───────────────────────────────────────────────────────
  _updateWave(dt) {
    if (this.enemiesLeft > 0) return;
    this.graceTimer -= dt;
    if (this.graceTimer > 0) return;

    this.wave++;
    this._spawnWave();
    this.graceTimer = C.WAVE_GRACE;
    this._emitEvent('wave_start', { wave: this.wave });
  }

  _spawnWave() {
    const chasers = 3 + this.wave * 2;
    const tanks   = this.wave >= 2 ? this.wave - 1 : 0;
    this.enemiesLeft = chasers + tanks;

    for (let i = 0; i < chasers; i++) {
      const pos = randEdge();
      const e = new Entity(C.TYPE.CHASER, pos.x, pos.y, { r: C.CHASER_R, hp: C.CHASER_HP, maxHp: C.CHASER_HP });
      this.enemies.set(e.id, e);
    }
    for (let i = 0; i < tanks; i++) {
      const pos = randEdge();
      const e = new Entity(C.TYPE.TANK, pos.x, pos.y, { r: C.TANK_R, hp: C.TANK_HP, maxHp: C.TANK_HP });
      this.enemies.set(e.id, e);
    }
    // Clean dead enemies
    for (const [id, e] of this.enemies) if (e.dead) this.enemies.delete(id);
  }

  // ── Spawners ──────────────────────────────────────────────────────────────
  _spawnProj(ownerId, x, y, dx, dy) {
    const angle = Math.atan2(dy, dx);
    const p = new Entity(C.TYPE.PROJECTILE, x, y, {
      vx: dx * C.PROJ_SPEED, vy: dy * C.PROJ_SPEED,
      w: C.PROJ_W, h: C.PROJ_H,
      rotation: angle,
      ownerId,
      life: 1.4, maxLife: 1.4,
    });
    this.projs.set(p.id, p);
    this._emitEvent('shoot', { x, y, dx, dy, ownerId });
  }

  _spawnPickup(x, y) {
    const id = uuid();
    this.pickups.set(id, { id, x, y, life: 8.0 });
  }

  // ── Death check ───────────────────────────────────────────────────────────
  _checkDeaths() {
    let allDead = true;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (p.hp <= 0) {
        p.alive  = false;
        p.hp     = 0;
        p.deaths++;
        this._emitEvent('player_death', { id: p.id, x: p.x, y: p.y, name: p.name });
        this._checkGameOver();
      } else {
        allDead = false;
      }
    }
  }

  _checkGameOver() {
    const alive = [...this.players.values()].filter(p => p.alive);
    let over = false;

    if (this.mode === C.MODES.SOLO && alive.length === 0) over = true;
    else if (this.mode === C.MODES.COOP && alive.length === 0) over = true;
    else if (this.mode === C.MODES.V2V2) {
      const teams = new Set(alive.map(p => p.team));
      if (teams.size <= 1) over = true;
    } else {
      if (alive.length <= 1 && this.players.size > 1) over = true;
      else if (alive.length === 0) over = true;
    }

    if (!over) return;
    this.gameOver = true;

    const scores = [...this.players.values()].map(p => ({
      name: p.name, kills: p.kills, deaths: p.deaths,
      wave: this.wave, time: Math.floor(p.timeAlive),
      bullets: p.bulletsUsed,
      distance: Math.floor(p.distanceTraveled),
      mode: this.mode,
      ts: new Date().toISOString(),
    }));

    this.io.to(this.id).emit(C.EVT.GAME_OVER, { scores, wave: this.wave });
    scores.forEach(s => leaderboard.submit(s));

    setTimeout(() => this._stop(), 5000);
  }

  // ── Broadcast ─────────────────────────────────────────────────────────────
  _broadcast() {
    const state = {
      players:  [...this.players.values()].map(p => ({
        id: p.id, name: p.name, colorIdx: p.colorIdx, team: p.team,
        x: p.x, y: p.y, rotation: p.rotation,
        hp: p.hp, maxHp: p.maxHp, alive: p.alive,
        kills: p.kills, hitFlash: p.hitTimer > 0,
      })),
      enemies:  [...this.enemies.values()].filter(e => !e.dead).map(e => ({
        id: e.id, type: e.type, x: e.x, y: e.y, r: e.r, hp: e.hp, maxHp: e.maxHp,
      })),
      projs: [...this.projs.values()].map(p => ({
        id: p.id, x: p.x, y: p.y, rotation: p.rotation, ownerId: p.ownerId,
      })),
      pickups:  [...this.pickups.values()].map(p => ({ id: p.id, x: p.x, y: p.y })),
      wave: this.wave,
      graceTimer: Math.max(0, this.graceTimer),
      enemiesLeft: this.enemiesLeft,
    };
    this.io.to(this.id).emit(C.EVT.STATE, state);
  }

  _emitEvent(type, data) {
    this.io.to(this.id).emit(C.EVT.EVENT, { type, ...data });
  }

  serialize() {
    return {
      id: this.id,
      mode: this.mode,
      players: this.players.size,
      maxPlayers: this.maxPlayers(),
      wave: this.wave,
      gameOver: this.gameOver,
    };
  }
}

module.exports = GameRoom;
