// Main game client — socket management, game loop, state handling
const Game = (() => {
  let socket    = null;
  let selfId    = null;
  let roomId    = null;
  let mode      = C.MODES.SOLO;
  let gameState = null;
  let running   = false;
  let rafId     = null;
  let pingStart = 0;
  let pingMs    = 0;
  let inputSeq  = 0;

  // Solo (offline) state — mirrors server state shape
  let soloState = null;
  let soloLogic = null;

  // ── Connect & Join ───────────────────────────────────────────────────────
  function connect(playerName, gameMode, joinRoomId) {
    mode = gameMode;
    document.getElementById('connecting').classList.remove('hidden');

    socket = io({ transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      selfId = socket.id;
      document.getElementById('connecting').classList.add('hidden');

      socket.emit(C.EVT.JOIN, {
        mode: gameMode,
        name: playerName,
        roomId: joinRoomId || undefined,
      });
    });

    socket.on(C.EVT.ROOM_JOINED, data => {
      roomId = data.roomId;
      selfId = data.playerId;
      UI.onRoomJoined(data);
      startGameLoop();
    });

    socket.on(C.EVT.STATE, state => {
      gameState = state;
      UI.updateHUD(state, selfId);
    });

    socket.on(C.EVT.EVENT, evt => {
      Renderer.handleEvent(evt);
      UI.onGameEvent(evt);
    });

    socket.on(C.EVT.GAME_OVER, data => {
      UI.showGameOver(data);
      stopGameLoop();
    });

    socket.on(C.EVT.LEADERBOARD, lb => {
      UI.renderLeaderboard(lb);
    });

    socket.on(C.EVT.ROOM_LIST, list => {
      UI.renderRoomList(list);
    });

    socket.on(C.EVT.PONG, () => {
      pingMs = Date.now() - pingStart;
      document.getElementById('ping-display').textContent = pingMs + ' ms';
    });

    socket.on('player_joined', data => {
      UI.onPlayerJoined(data);
    });

    socket.on('player_left', data => {
      UI.onPlayerLeft(data);
    });

    socket.on('connect_error', () => {
      document.getElementById('connecting').classList.add('hidden');
      // Fall back to solo offline
      if (mode === C.MODES.SOLO) startSolo(playerName);
    });

    socket.on('error', data => {
      alert(data.msg || 'Server error');
      document.getElementById('connecting').classList.add('hidden');
      UI.showMenu();
    });

    // Ping every 2s
    setInterval(() => {
      if (socket && socket.connected) {
        pingStart = Date.now();
        socket.emit(C.EVT.PING);
      }
    }, 2000);
  }

  // ── Solo offline mode ────────────────────────────────────────────────────
  function startSolo(playerName) {
    selfId = 'local';
    mode   = C.MODES.SOLO;
    soloLogic = createSoloLogic(playerName);
    startGameLoop();
    UI.onRoomJoined({ roomId: 'local', playerId: 'local', mode: C.MODES.SOLO, players: [{ id: 'local', name: playerName, colorIdx: 0, team: 0 }], leaderboard: [] });
  }

  // ── Game loop ─────────────────────────────────────────────────────────────
  function startGameLoop() {
    running = true;
    UI.showGame();
    let lastSend = 0;
    const SEND_INTERVAL = 1000 / 30; // 30Hz input send

    function loop(ts) {
      if (!running) return;
      rafId = requestAnimationFrame(loop);

      const input = Input.getState(Renderer.getScale(), Renderer.getOffX(), Renderer.getOffY());

      // Send input to server
      if (socket && socket.connected && ts - lastSend > SEND_INTERVAL) {
        socket.emit(C.EVT.INPUT, input);
        lastSend = ts;
      }

      // Solo: update locally
      if (soloLogic) {
        soloLogic.update(1 / 60, input);
        gameState = soloLogic.getState();
        UI.updateHUD(gameState, selfId);
      }

      Renderer.render(gameState, selfId);
    }
    rafId = requestAnimationFrame(loop);
  }

  function stopGameLoop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function disconnect() {
    stopGameLoop();
    if (socket) { socket.disconnect(); socket = null; }
    soloLogic = null;
    gameState = null;
    selfId = null;
    roomId = null;
  }

  function requestLeaderboard() {
    if (socket && socket.connected) socket.emit(C.EVT.LEADERBOARD);
    else fetch('/api/leaderboard').then(r => r.json()).then(lb => UI.renderLeaderboard(lb));
  }

  function requestRoomList() {
    fetch('/api/rooms').then(r => r.json()).then(list => UI.renderRoomList(list));
  }

  // ── Solo offline game logic ───────────────────────────────────────────────
  function createSoloLogic(name) {
    const R = C;
    const genId = () => Math.random().toString(36).slice(2, 9);

    const player = {
      id: 'local', name, colorIdx: 0, team: 0,
      x: 0, y: 0, vx: 0, vy: 0, rotation: 0,
      hp: R.PLAYER_HP, maxHp: R.PLAYER_HP,
      alive: true, hitTimer: 0, fireTimer: 0, hitFlash: false,
      kills: 0, deaths: 0, bulletsUsed: 0, distanceTraveled: 0, timeAlive: 0,
    };

    const enemies  = new Map();
    const projs    = new Map();
    const pickups  = new Map();
    let wave = 0, enemiesLeft = 0, graceTimer = 1.5;
    let gameOver = false;

    function randEdge() {
      const e = (Math.random() * 4) | 0;
      if (e === 0) return { x: (Math.random() - 0.5) * R.ARENA_W, y:  R.ARENA_HH + 30 };
      if (e === 1) return { x: (Math.random() - 0.5) * R.ARENA_W, y: -R.ARENA_HH - 30 };
      if (e === 2) return { x:  R.ARENA_HW + 30, y: (Math.random() - 0.5) * R.ARENA_H };
                   return { x: -R.ARENA_HW - 30, y: (Math.random() - 0.5) * R.ARENA_H };
    }

    function spawnWave() {
      wave++;
      const chasers = 3 + wave * 2;
      const tanks   = wave >= 2 ? wave - 1 : 0;
      enemiesLeft   = chasers + tanks;
      for (let i = 0; i < chasers; i++) {
        const p = randEdge();
        const id = genId();
        enemies.set(id, { id, type: R.TYPE.CHASER, x: p.x, y: p.y, vx: 0, vy: 0, r: R.CHASER_R, hp: R.CHASER_HP, maxHp: R.CHASER_HP, dead: false, hitTimer: 0 });
      }
      for (let i = 0; i < tanks; i++) {
        const p = randEdge();
        const id = genId();
        enemies.set(id, { id, type: R.TYPE.TANK, x: p.x, y: p.y, vx: 0, vy: 0, r: R.TANK_R, hp: R.TANK_HP, maxHp: R.TANK_HP, dead: false, hitTimer: 0 });
      }
      Renderer.handleEvent({ type: 'wave_start', wave });
    }

    function update(dt, input) {
      if (gameOver || !player.alive) return;

      player.timeAlive += dt;
      player.hitTimer   = Math.max(0, player.hitTimer - dt);
      player.fireTimer  = Math.max(0, player.fireTimer - dt);
      player.hitFlash   = player.hitTimer > 0;

      // Movement
      let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      let my = (input.down  ? 1 : 0) - (input.up   ? 1 : 0);
      const len = Math.hypot(mx, my) || 1;
      if (Math.hypot(mx, my) > 0.01) { mx /= len; my /= len; }
      const prevX = player.x, prevY = player.y;
      player.x += mx * R.PLAYER_SPEED * dt;
      player.y += my * R.PLAYER_SPEED * dt;
      player.x = Math.max(-R.ARENA_HW + R.PLAYER_R, Math.min(R.ARENA_HW - R.PLAYER_R, player.x));
      player.y = Math.max(-R.ARENA_HH + R.PLAYER_R, Math.min(R.ARENA_HH - R.PLAYER_R, player.y));
      player.distanceTraveled += Math.hypot(player.x - prevX, player.y - prevY);

      // Aim
      const adx = input.aimX - player.x, ady = input.aimY - player.y;
      if (Math.abs(adx) > 1 || Math.abs(ady) > 1) player.rotation = Math.atan2(ady, adx);

      // Shoot
      if (input.shooting && player.fireTimer <= 0 && (Math.abs(adx) > 1 || Math.abs(ady) > 1)) {
        const d = Math.hypot(adx, ady);
        const id = genId();
        projs.set(id, {
          id, ownerId: 'local',
          x: player.x, y: player.y,
          vx: (adx / d) * R.PROJ_SPEED, vy: (ady / d) * R.PROJ_SPEED,
          rotation: Math.atan2(ady, adx),
          life: 1.4,
        });
        player.fireTimer = R.FIRE_CD;
        player.bulletsUsed++;
        Renderer.handleEvent({ type: 'shoot', x: player.x, y: player.y });
      }

      // Enemies
      for (const e of enemies.values()) {
        if (e.dead) continue;
        e.hitTimer = Math.max(0, e.hitTimer - dt);
        const dx = player.x - e.x, dy = player.y - e.y;
        const d  = Math.hypot(dx, dy) || 1;
        const spd = e.type === R.TYPE.TANK ? R.TANK_SPEED : R.CHASER_SPEED;
        e.x += (dx / d) * spd * dt;
        e.y += (dy / d) * spd * dt;

        if (player.hitTimer <= 0 && Math.hypot(player.x - e.x, player.y - e.y) < R.PLAYER_R + e.r) {
          const dmg = e.type === R.TYPE.TANK ? R.TANK_DAMAGE : R.CHASER_DAMAGE;
          player.hp -= dmg;
          player.hitTimer = R.HIT_CD;
          Renderer.handleEvent({ type: 'hit', x: player.x, y: player.y, color: '#ff4455' });
        }
      }

      // Projectiles
      for (const [id, p] of projs) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
        if (p.life <= 0 || Math.abs(p.x) > R.ARENA_HW + 60 || Math.abs(p.y) > R.ARENA_HH + 60) {
          projs.delete(id); continue;
        }
        let hit = false;
        for (const e of enemies.values()) {
          if (e.dead) continue;
          if (Math.hypot(p.x - e.x, p.y - e.y) < e.r) {
            e.hp -= R.PROJ_DAMAGE_ENEMY;
            if (e.hp <= 0) {
              e.dead = true; enemiesLeft = Math.max(0, enemiesLeft - 1);
              player.kills++;
              Renderer.handleEvent({ type: 'kill_enemy', x: e.x, y: e.y, color: e.type === R.TYPE.TANK ? '#a040c0' : '#e03030' });
              if (Math.random() < R.PICKUP_CHANCE) {
                const pid = genId();
                pickups.set(pid, { id: pid, x: e.x, y: e.y, life: 8 });
              }
            } else {
              Renderer.handleEvent({ type: 'hit_enemy', x: e.x, y: e.y });
            }
            hit = true; break;
          }
        }
        if (hit) { projs.delete(id); continue; }
      }

      // Pickups
      for (const [id, pu] of pickups) {
        pu.life -= dt;
        if (pu.life <= 0) { pickups.delete(id); continue; }
        if (Math.hypot(player.x - pu.x, player.y - pu.y) < R.PLAYER_R + R.PICKUP_R) {
          player.hp = Math.min(player.hp + R.PICKUP_HEAL, player.maxHp);
          pickups.delete(id);
          Renderer.handleEvent({ type: 'pickup', x: pu.x, y: pu.y });
        }
      }

      // Wave
      if (enemiesLeft <= 0) {
        graceTimer -= dt;
        if (graceTimer <= 0) { spawnWave(); graceTimer = R.WAVE_GRACE; }
      }

      // Death
      if (player.hp <= 0) {
        player.alive = false; player.hp = 0;
        Renderer.handleEvent({ type: 'player_death', x: player.x, y: player.y });
        gameOver = true;
        setTimeout(() => {
          UI.showGameOver({
            scores: [{
              name: player.name, kills: player.kills, wave,
              time: Math.floor(player.timeAlive), bullets: player.bulletsUsed,
              distance: Math.floor(player.distanceTraveled), mode: R.MODES.SOLO,
            }],
            wave,
          });
        }, 800);
        // Submit to leaderboard via API
        fetch('/api/leaderboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: player.name, kills: player.kills, wave, time: Math.floor(player.timeAlive), mode: R.MODES.SOLO, ts: new Date().toISOString() }),
        }).catch(() => {});
      }
    }

    function getState() {
      return {
        players: [{ ...player }],
        enemies: [...enemies.values()].filter(e => !e.dead).map(e => ({ ...e })),
        projs:   [...projs.values()].map(p => ({ ...p })),
        pickups: [...pickups.values()].map(p => ({ ...p })),
        wave, graceTimer: Math.max(0, graceTimer), enemiesLeft,
      };
    }

    return { update, getState };
  }

  return { connect, startSolo, disconnect, requestLeaderboard, requestRoomList };
})();
