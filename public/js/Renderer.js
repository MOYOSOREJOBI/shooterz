// High-performance Canvas 2D renderer
const Renderer = (() => {
  const canvas = document.getElementById('game-canvas');
  const ctx    = canvas.getContext('2d', { alpha: false, desynchronized: true });

  let W = 0, H = 0, dpr = 1;
  let scale = 1, offX = 0, offY = 0;
  let camShakeX = 0, camShakeY = 0, camShakeMag = 0;
  let lastFrameTime = 0;

  // Particle pool
  const particles = [];
  const MAX_PARTICLES = 400;

  // Projectile trail history
  const projTrails = new Map(); // projId → [{x,y}]

  // Off-screen canvases for glow (cheaper than shadowBlur)
  const glowCanvas = document.createElement('canvas');
  const glowCtx    = glowCanvas.getContext('2d');

  const TEAM_COLS = ['#00d4ff', '#ff4455', '#44ff88', '#ffcc00'];
  const TEAM_DARK = ['#004466', '#440011', '#114422', '#443300'];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W   = window.innerWidth;
    H   = window.innerHeight;
    canvas.width  = (W * dpr) | 0;
    canvas.height = (H * dpr) | 0;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    // Don't scale context — we handle dpr in draw calls for perf
    scale = Math.min(W / C.ARENA_W, H / C.ARENA_H) * 0.86;
    offX  = W / 2;
    offY  = H / 2;
    glowCanvas.width  = (W * dpr) | 0;
    glowCanvas.height = (H * dpr) | 0;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  resize();

  // ── Coordinate transforms ─────────────────────────────────────────────────
  function wx(x) { return (x * scale + offX + camShakeX) * dpr; }
  function wy(y) { return (y * scale + offY + camShakeY) * dpr; }
  function ws(r) { return r * scale * dpr; }

  // ── Glow helper — draw soft radial halo without shadowBlur ───────────────
  function drawGlow(x, y, r, color, alpha = 0.35) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
    g.addColorStop(0,   color + Math.round(alpha * 255).toString(16).padStart(2,'0'));
    g.addColorStop(1,   color + '00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Particles ─────────────────────────────────────────────────────────────
  function addParticle(x, y, vx, vy, r, color, life) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({ x, y, vx, vy, r, color, life, maxLife: life });
  }

  function spawnBurst(cx, cy, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a   = Math.random() * Math.PI * 2;
      const spd = speed * (0.3 + Math.random() * 0.9);
      addParticle(cx, cy,
        Math.cos(a) * spd, Math.sin(a) * spd,
        (2 + Math.random() * 3) * dpr,
        color,
        0.3 + Math.random() * 0.4);
    }
  }

  function handleEvent(evt) {
    const eX = wx(evt.x || 0), eY = wy(evt.y || 0);
    switch (evt.type) {
      case 'kill_enemy':
        spawnBurst(eX, eY, evt.color || '#e03030', 16, 180 * dpr);
        spawnBurst(eX, eY, '#fff', 6, 100 * dpr);
        camShakeMag = 5 * dpr;
        Audio.killEnemy(); break;
      case 'hit_enemy':
        spawnBurst(eX, eY, '#ffaa30', 5, 70 * dpr);
        Audio.hit(); break;
      case 'hit':
        spawnBurst(eX, eY, evt.color || '#ff4455', 8, 100 * dpr);
        camShakeMag = 3 * dpr;
        Audio.hitPlayer(); break;
      case 'player_death':
        spawnBurst(eX, eY, '#ff4455', 24, 240 * dpr);
        spawnBurst(eX, eY, '#ffaa00', 10, 160 * dpr);
        camShakeMag = 10 * dpr;
        Audio.death(); break;
      case 'pickup':
        spawnBurst(eX, eY, '#44ff88', 8, 80 * dpr);
        Audio.pickup(); break;
      case 'wave_start':
        Audio.waveStart(); break;
      case 'shoot':
        Audio.shoot(); break;
    }
  }

  // ── Background ─────────────────────────────────────────────────────────────
  let bgOffset = 0;
  function drawBackground(dt) {
    bgOffset += dt * 8 * dpr;

    ctx.fillStyle = '#080812';
    ctx.fillRect(0, 0, W * dpr, H * dpr);

    // Animated dot grid (parallax)
    const sp  = 55 * dpr;
    const sX  = ((offX * dpr + bgOffset * 0.4) % sp + sp) % sp;
    const sY  = ((offY * dpr + bgOffset * 0.15) % sp + sp) % sp;
    ctx.fillStyle = '#1e1e3c';
    for (let x = sX - sp; x < W * dpr + sp; x += sp)
      for (let y = sY - sp; y < H * dpr + sp; y += sp) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
  }

  function drawArena() {
    const aw  = ws(C.ARENA_W), ah  = ws(C.ARENA_H);
    const ax  = wx(-C.ARENA_HW), ay = wy(-C.ARENA_HH);

    // Floor gradient
    const fg = ctx.createLinearGradient(ax, ay, ax + aw, ay + ah);
    fg.addColorStop(0,   '#0c0c20');
    fg.addColorStop(0.5, '#0e0e28');
    fg.addColorStop(1,   '#0c0c20');
    ctx.fillStyle = fg;
    ctx.fillRect(ax, ay, aw, ah);

    // Subtle grid
    ctx.strokeStyle = '#181830';
    ctx.lineWidth   = 1 * dpr;
    const gs = 80 * scale * dpr;
    for (let x = ax % gs; x < ax + aw + gs; x += gs) {
      ctx.beginPath(); ctx.moveTo(ax + (x - ax), ay); ctx.lineTo(ax + (x - ax), ay + ah); ctx.stroke();
    }
    for (let y = ay % gs; y < ay + ah + gs; y += gs) {
      ctx.beginPath(); ctx.moveTo(ax, ay + (y - ay)); ctx.lineTo(ax + aw, ay + (y - ay)); ctx.stroke();
    }

    // Walls with glow
    const wt  = ws(9);
    const wallColor = '#3838aa';
    ctx.fillStyle = wallColor;
    // top, bottom, left, right
    ctx.fillRect(ax - wt, ay - wt, aw + wt * 2, wt);
    ctx.fillRect(ax - wt, ay + ah,  aw + wt * 2, wt);
    ctx.fillRect(ax - wt, ay,       wt, ah);
    ctx.fillRect(ax + aw, ay,       wt, ah);

    // Wall glow edge lines
    ctx.strokeStyle = '#5555cc';
    ctx.lineWidth   = 2 * dpr;
    ctx.strokeRect(ax, ay, aw, ah);

    // Corner squares
    const cs = ws(18);
    ctx.fillStyle = '#00d4ff22';
    [[ax, ay],[ax+aw-cs, ay],[ax, ay+ah-cs],[ax+aw-cs, ay+ah-cs]].forEach(([cx, cy]) => {
      ctx.fillRect(cx, cy, cs, cs);
    });
    ctx.strokeStyle = '#00d4ff44';
    ctx.lineWidth   = 1.5 * dpr;
    [[ax, ay],[ax+aw-cs, ay],[ax, ay+ah-cs],[ax+aw-cs, ay+ah-cs]].forEach(([cx, cy]) => {
      ctx.strokeRect(cx, cy, cs, cs);
    });
  }

  // ── Entity drawing ─────────────────────────────────────────────────────────
  function drawPlayer(p, isSelf) {
    const x = wx(p.x), y = wy(p.y);
    const r = ws(C.PLAYER_R);
    const col = TEAM_COLS[p.colorIdx % TEAM_COLS.length];

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.rotation);

    if (p.hitFlash) {
      ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 50) * 0.5;
    }

    // Outer glow ring
    const glow = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2.2);
    glow.addColorStop(0, col + '55');
    glow.addColorStop(1, col + '00');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Body — layered circles
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = TEAM_DARK[p.colorIdx % TEAM_DARK.length];
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    ctx.strokeStyle = col;
    ctx.lineWidth   = 2.5 * dpr;
    ctx.stroke();

    // Inner fill
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = col + 'cc';
    ctx.fill();

    // Direction barrel (gun)
    ctx.fillStyle = col;
    ctx.fillRect(r * 0.4, -r * 0.12, r * 0.65, r * 0.24);
    ctx.fillRect(r * 0.9, -r * 0.15, r * 0.2, r * 0.3); // tip

    ctx.globalAlpha = 1;
    ctx.restore();

    // Name tag with background
    ctx.save();
    const label = p.name + (isSelf ? '' : '');
    const fs    = Math.max(10, ws(8.5)) + 'px';
    ctx.font = `bold ${fs} 'Segoe UI',sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    const tw = ctx.measureText(label).width;
    const ty = y - r - 5;
    // Background pill
    ctx.fillStyle = '#00000099';
    ctx.beginPath();
    ctx.roundRect(x - tw/2 - 4, ty - parseFloat(fs) - 1, tw + 8, parseFloat(fs) + 4, 4);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.fillText(label, x, ty);
    ctx.restore();

    // HP bar
    const bw = r * 2.6, bh = 5 * dpr;
    const bx = x - bw / 2, by = y + r + 6 * dpr;
    ctx.fillStyle = '#111';
    ctx.fillRect(bx, by, bw, bh);
    const pct = Math.max(0, p.hp / p.maxHp);
    const hpCol = pct > 0.5 ? '#44ff88' : pct > 0.25 ? '#ffcc00' : '#ff4455';
    ctx.fillStyle = hpCol;
    ctx.fillRect(bx, by, bw * pct, bh);
    // HP bar border
    ctx.strokeStyle = '#334';
    ctx.lineWidth   = 1 * dpr;
    ctx.strokeRect(bx, by, bw, bh);
  }

  function drawEnemy(e, t) {
    const x = wx(e.x), y = wy(e.y), r = ws(e.r);
    const isTank = e.type === C.TYPE.TANK;
    const col    = isTank ? '#c040e0' : '#e03030';
    const spikes = isTank ? 6 : 8;
    const pulse  = 1 + Math.sin(t * 3 + (e.id?.charCodeAt(0) || 0)) * 0.05;

    // Glow
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    g.addColorStop(0, col + '44');
    g.addColorStop(1, col + '00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, Math.PI * 2);
    ctx.fill();

    // Spiky body
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a  = (i * Math.PI) / spikes - Math.PI / 2 + t * (isTank ? 0.5 : 1.2);
      const cr = i % 2 === 0 ? r * pulse : r * 0.55 * pulse;
      i === 0 ? ctx.moveTo(x + Math.cos(a)*cr, y + Math.sin(a)*cr)
              : ctx.lineTo(x + Math.cos(a)*cr, y + Math.sin(a)*cr);
    }
    ctx.closePath();
    ctx.fillStyle = col + 'cc';
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth   = 1.5 * dpr;
    ctx.stroke();

    // Core
    const cg = ctx.createRadialGradient(x, y, 0, x, y, r * 0.45);
    cg.addColorStop(0, '#fff');
    cg.addColorStop(1, col);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = cg;
    ctx.fill();

    // HP bar
    if (e.hp < e.maxHp) {
      const bw = r * 2.4;
      ctx.fillStyle = '#111';
      ctx.fillRect(x - bw/2, y - r - 8*dpr, bw, 4*dpr);
      ctx.fillStyle = col;
      ctx.fillRect(x - bw/2, y - r - 8*dpr, bw * (e.hp/e.maxHp), 4*dpr);
    }
  }

  function drawProjectile(p, players) {
    const x = wx(p.x), y = wy(p.y);
    const owner = players && players.find(pl => pl.id === p.ownerId);
    const col   = owner ? TEAM_COLS[owner.colorIdx % TEAM_COLS.length] : '#ffe050';

    // Trail
    const trail = projTrails.get(p.id);
    if (trail && trail.length > 1) {
      ctx.save();
      for (let i = 1; i < trail.length; i++) {
        const a  = i / trail.length;
        const pw = ws(C.PROJ_H) * a;
        ctx.globalAlpha = a * 0.5;
        ctx.strokeStyle = col;
        ctx.lineWidth   = pw;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(trail[i-1].x, trail[i-1].y);
        ctx.lineTo(trail[i].x,   trail[i].y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Bullet glow
    const gg = ctx.createRadialGradient(x, y, 0, x, y, ws(C.PROJ_H) * 2);
    gg.addColorStop(0, col + 'cc');
    gg.addColorStop(1, col + '00');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(x, y, ws(C.PROJ_H) * 2, 0, Math.PI * 2);
    ctx.fill();

    // Bullet core
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = '#fff';
    const pw = ws(C.PROJ_W), ph = ws(C.PROJ_H);
    ctx.fillRect(-pw/2, -ph/2, pw, ph);
    ctx.restore();
  }

  function updateProjTrails(state) {
    const seen = new Set();
    if (state && state.projs) {
      for (const p of state.projs) {
        seen.add(p.id);
        let trail = projTrails.get(p.id);
        if (!trail) { trail = []; projTrails.set(p.id, trail); }
        trail.push({ x: wx(p.x), y: wy(p.y) });
        if (trail.length > 8) trail.shift();
      }
    }
    for (const id of projTrails.keys()) if (!seen.has(id)) projTrails.delete(id);
  }

  function drawPickup(p, t) {
    const x = wx(p.x), y = wy(p.y), r = ws(C.PICKUP_R);
    const pulse = r * (1 + Math.sin(t * 2.5 + (p.id?.charCodeAt(0)||0)) * 0.12);

    // Rotating ring
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 1.5);
    ctx.strokeStyle = '#44ff8888';
    ctx.lineWidth   = 2 * dpr;
    ctx.setLineDash([ws(6), ws(6)]);
    ctx.beginPath();
    ctx.arc(0, 0, pulse * 1.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Glow
    const g = ctx.createRadialGradient(x, y, 0, x, y, pulse * 2.5);
    g.addColorStop(0, '#44ff8866');
    g.addColorStop(1, '#44ff8800');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, pulse * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.beginPath();
    ctx.arc(x, y, pulse, 0, Math.PI * 2);
    ctx.fillStyle = '#22cc66';
    ctx.fill();
    ctx.strokeStyle = '#88ffaa';
    ctx.lineWidth   = 2 * dpr;
    ctx.stroke();

    // Plus icon
    ctx.fillStyle = '#fff';
    const pw = pulse * 0.4, ph = pulse * 0.12;
    ctx.fillRect(x - pw/2, y - ph/2, pw, ph);
    ctx.fillRect(x - ph/2, y - pw/2, ph, pw);
  }

  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x    += p.vx * dt;
      p.y    += p.vy * dt;
      p.vx   *= 0.84;
      p.vy   *= 0.84;
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha * alpha; // quadratic fade
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── Camera shake ──────────────────────────────────────────────────────────
  function updateCamShake(dt) {
    if (camShakeMag > 0.1) {
      camShakeX  = (Math.random() - 0.5) * camShakeMag;
      camShakeY  = (Math.random() - 0.5) * camShakeMag;
      camShakeMag *= Math.pow(0.05, dt);
    } else {
      camShakeX = camShakeY = camShakeMag = 0;
    }
  }

  // ── Vignette / post-process ───────────────────────────────────────────────
  function drawVignette() {
    const g = ctx.createRadialGradient(W*dpr/2, H*dpr/2, H*dpr*0.35, W*dpr/2, H*dpr/2, H*dpr*0.8);
    g.addColorStop(0, 'transparent');
    g.addColorStop(1, '#00000088');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W*dpr, H*dpr);
  }

  // ── Main render ───────────────────────────────────────────────────────────
  function render(state, selfId) {
    const now = performance.now();
    const dt  = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;
    const t = now / 1000;

    updateCamShake(dt);
    updateProjTrails(state);

    drawBackground(dt);
    drawArena();

    if (state) {
      if (state.pickups) state.pickups.forEach(p => drawPickup(p, t));
      if (state.enemies) state.enemies.forEach(e => drawEnemy(e, t));
      if (state.projs)   state.projs.forEach(p => drawProjectile(p, state.players));
      if (state.players) state.players.forEach(p => p.alive && drawPlayer(p, p.id === selfId));
    }

    drawParticles(dt);
    drawVignette();
  }

  return {
    render,
    handleEvent,
    resize,
    getScale()  { return scale; },
    getOffX()   { return offX; },
    getOffY()   { return offY; },
    canvasToWorld(cx, cy) { return { x: (cx - offX) / scale, y: (cy - offY) / scale }; },
    worldToCanvas(x, y)   { return { x: x * scale + offX, y: y * scale + offY }; },
  };
})();
