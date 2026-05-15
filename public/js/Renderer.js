// Canvas 2D renderer — high-quality, smooth, no external assets
const Renderer = (() => {
  const canvas = document.getElementById('game-canvas');
  const ctx    = canvas.getContext('2d', { alpha: false });

  let W = 0, H = 0;       // canvas pixel dims
  let scale = 1;          // world-to-canvas scale
  let offX = 0, offY = 0; // canvas offset to center world origin

  // Particle system (client-side, cosmetic only)
  const particles = [];

  // Interpolation buffer
  let prevState = null, nextState = null, interpT = 0;

  // ── Resize ──────────────────────────────────────────────────────────────
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);
    // Fit arena into window with padding
    scale = Math.min(W / C.ARENA_W, H / C.ARENA_H) * 0.88;
    offX  = W / 2;
    offY  = H / 2;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();

  // ── Coordinate helpers ─────────────────────────────────────────────────
  function wx(x) { return x * scale + offX; }
  function wy(y) { return y * scale + offY; }
  function ws(r) { return r * scale; }

  // ── Color palette ──────────────────────────────────────────────────────
  const TEAM_GLOW = ['#00d4ff', '#ff4455', '#44ff88', '#ffcc00'];
  const ENEMY_CHASER_COLOR = '#e03030';
  const ENEMY_TANK_COLOR   = '#a040c0';
  const PROJ_COLOR  = '#ffe050';
  const PICKUP_COLOR = '#44ff88';
  const WALL_COLOR  = '#4040a0';
  const BG_GRID_COLOR = '#1a1a3a';
  const BG_DOT_COLOR  = '#22224a';

  // ── Particle helpers ───────────────────────────────────────────────────
  function spawnBurst(wx_, wy_, color, n = 10, speed = 120) {
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = speed * (0.4 + Math.random() * 0.8);
      particles.push({
        x: wx_, y: wy_,
        vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.5,
        r: 2 + Math.random() * 3,
        color,
      });
    }
  }

  function handleEvent(evt) {
    switch (evt.type) {
      case 'kill_enemy': spawnBurst(wx(evt.x), wy(evt.y), evt.color || ENEMY_CHASER_COLOR, 14, 150); Audio.killEnemy(); break;
      case 'hit_enemy':  spawnBurst(wx(evt.x), wy(evt.y), '#ffaa30', 5, 80); Audio.hit(); break;
      case 'hit':        spawnBurst(wx(evt.x), wy(evt.y), evt.color || '#ff4455', 7, 100); Audio.hitPlayer(); break;
      case 'player_death': spawnBurst(wx(evt.x), wy(evt.y), '#ff4455', 20, 200); Audio.death(); break;
      case 'pickup':     spawnBurst(wx(evt.x), wy(evt.y), PICKUP_COLOR, 8, 80); Audio.pickup(); break;
      case 'wave_start': Audio.waveStart(); break;
      case 'shoot':      Audio.shoot(); break;
    }
  }

  // ── Avatar drawing ─────────────────────────────────────────────────────
  function drawPlayer(p, isSelf) {
    const x = wx(p.x), y = wy(p.y), r = ws(C.PLAYER_R);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.rotation);

    const col = TEAM_GLOW[p.colorIdx % TEAM_GLOW.length];

    // Glow
    ctx.shadowColor = col;
    ctx.shadowBlur  = p.hitFlash ? 20 : (isSelf ? 14 : 8);

    // Body
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = col + (p.hitFlash ? 'ff' : '88');
    ctx.fill();

    // Inner ring
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.65, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // Direction dot
    ctx.beginPath();
    ctx.arc(r * 0.55, 0, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();

    // Name tag
    ctx.save();
    ctx.font = `bold ${Math.max(10, ws(9))}px 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = col;
    ctx.fillText(p.name, x, y - r - 3);
    ctx.restore();

    // HP bar
    const bw = r * 2.4, bh = 4;
    const bx = x - bw / 2, by = y + r + 4;
    ctx.fillStyle = '#222';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = p.hp > 50 ? '#44ff88' : p.hp > 25 ? '#ffcc00' : '#ff4455';
    ctx.fillRect(bx, by, bw * Math.max(0, p.hp / p.maxHp), bh);
  }

  function drawEnemy(e) {
    const x = wx(e.x), y = wy(e.y), r = ws(e.r);
    const isTank = e.type === C.TYPE.TANK;
    const col    = isTank ? ENEMY_TANK_COLOR : ENEMY_CHASER_COLOR;

    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur  = 12;

    // Spiky enemy shape
    ctx.beginPath();
    const spikes = isTank ? 6 : 8;
    const outerR = r, innerR = r * 0.6;
    for (let i = 0; i < spikes * 2; i++) {
      const a  = (i * Math.PI) / spikes - Math.PI / 2;
      const cr = i % 2 === 0 ? outerR : innerR;
      i === 0 ? ctx.moveTo(wx(e.x) + Math.cos(a) * cr, wy(e.y) + Math.sin(a) * cr)
              : ctx.lineTo(wx(e.x) + Math.cos(a) * cr, wy(e.y) + Math.sin(a) * cr);
    }
    ctx.closePath();
    ctx.fillStyle = col + 'cc';
    ctx.fill();

    // Core
    ctx.beginPath();
    ctx.arc(wx(e.x), wy(e.y), r * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff8';
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();

    // HP bar (mini)
    if (e.hp < e.maxHp) {
      const bw = r * 2.2;
      ctx.fillStyle = '#222';
      ctx.fillRect(wx(e.x) - bw / 2, wy(e.y) - r - 7, bw, 3);
      ctx.fillStyle = col;
      ctx.fillRect(wx(e.x) - bw / 2, wy(e.y) - r - 7, bw * (e.hp / e.maxHp), 3);
    }
  }

  function drawProjectile(p, players) {
    const x = wx(p.x), y = wy(p.y);
    // Color by owner team
    const owner = players && players.find(pl => pl.id === p.ownerId);
    const col   = owner ? TEAM_GLOW[owner.colorIdx % TEAM_GLOW.length] : PROJ_COLOR;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.rotation);
    ctx.shadowColor = col;
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = col;
    const pw = ws(C.PROJ_W), ph = ws(C.PROJ_H);
    ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawPickup(p) {
    const x = wx(p.x), y = wy(p.y), r = ws(C.PICKUP_R);
    const t  = Date.now() / 500;
    ctx.save();
    ctx.shadowColor = PICKUP_COLOR;
    ctx.shadowBlur  = 10 + Math.sin(t) * 5;
    ctx.beginPath();
    ctx.arc(x, y, r * (1 + Math.sin(t) * 0.1), 0, Math.PI * 2);
    ctx.fillStyle = PICKUP_COLOR + 'cc';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(9, r * 1.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', x, y);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ── Background ─────────────────────────────────────────────────────────
  function drawBackground(camX, camY) {
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, W, H);

    // Parallax dot grid
    const spacing = ws(50);
    const startX  = ((offX + camX * 0.15 * scale) % spacing + spacing) % spacing;
    const startY  = ((offY + camY * 0.15 * scale) % spacing + spacing) % spacing;
    ctx.fillStyle = BG_DOT_COLOR;
    for (let x = startX - spacing; x < W + spacing; x += spacing)
      for (let y = startY - spacing; y < H + spacing; y += spacing) {
        ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
      }
  }

  function drawArena() {
    const aw = ws(C.ARENA_W), ah = ws(C.ARENA_H);
    const ax = offX - aw / 2, ay = offY - ah / 2;

    // Floor
    ctx.fillStyle = '#0d0d22';
    ctx.fillRect(ax, ay, aw, ah);

    // Floor grid
    const gs = ws(80);
    ctx.strokeStyle = '#151530';
    ctx.lineWidth   = 1;
    for (let x = ax; x <= ax + aw; x += gs) {
      ctx.beginPath(); ctx.moveTo(x, ay); ctx.lineTo(x, ay + ah); ctx.stroke();
    }
    for (let y = ay; y <= ay + ah; y += gs) {
      ctx.beginPath(); ctx.moveTo(ax, y); ctx.lineTo(ax + aw, y); ctx.stroke();
    }

    // Walls
    ctx.shadowColor = '#4040cc';
    ctx.shadowBlur  = 18;
    ctx.fillStyle   = WALL_COLOR;
    const wt = ws(8); // wall thickness
    ctx.fillRect(ax - wt, ay - wt, aw + wt * 2, wt); // top
    ctx.fillRect(ax - wt, ay + ah, aw + wt * 2, wt); // bottom
    ctx.fillRect(ax - wt, ay,      wt, ah);            // left
    ctx.fillRect(ax + aw, ay,      wt, ah);            // right
    ctx.shadowBlur = 0;

    // Corner accents
    ctx.fillStyle = '#00d4ff44';
    const ca = ws(20);
    [[ax, ay],[ax+aw-ca, ay],[ax, ay+ah-ca],[ax+aw-ca, ay+ah-ca]].forEach(([cx, cy]) => {
      ctx.fillRect(cx, cy, ca, ca);
    });
  }

  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
      p.vx *= 0.88;
      p.vy *= 0.88;
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  let lastTime = 0;

  function render(state, selfId) {
    const now = performance.now();
    const dt  = Math.min((now - lastTime) / 1000, 0.05);
    lastTime  = now;

    const self = state && state.players && state.players.find(p => p.id === selfId);
    const camX = self ? self.x * 0.1 : 0;
    const camY = self ? self.y * 0.1 : 0;

    drawBackground(camX, camY);
    drawArena();

    if (!state) { drawParticles(dt); return; }

    // Draw order: pickups → enemies → projs → players → particles
    if (state.pickups) state.pickups.forEach(drawPickup);
    if (state.enemies) state.enemies.forEach(drawEnemy);
    if (state.projs)   state.projs.forEach(p => drawProjectile(p, state.players));
    if (state.players) state.players.forEach(p => p.alive && drawPlayer(p, p.id === selfId));

    drawParticles(dt);
  }

  return {
    render,
    handleEvent,
    resize,
    getScale()  { return scale; },
    getOffX()   { return offX; },
    getOffY()   { return offY; },
    worldToCanvas(wx_, wy_) { return { x: wx(wx_), y: wy(wy_) }; },
    canvasToWorld(cx, cy)   { return { x: (cx - offX) / scale, y: (cy - offY) / scale }; },
  };
})();
