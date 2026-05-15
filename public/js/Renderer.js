// Renderer — pixel-art sprites, rectangular bordered canvas, landscape-first
const Renderer = (() => {
  const canvas = document.getElementById('game-canvas');
  const ctx    = canvas.getContext('2d', { alpha: false });

  // Natural sprite sizes (px)
  const SHIP_SRC   = 65;
  const BACT_SRC   = 31;

  // Number sprite strip: each digit = 9px wide, 15px tall, strip is 90x15
  const NUM_W = 9, NUM_H = 15;

  // Canvas & arena layout
  let W = 0, H = 0;          // CSS pixel canvas size
  let dpr = 1;
  let scale  = 1;            // world-units → CSS px
  let offX   = 0, offY = 0;  // world origin in CSS px (centre of arena)
  let arenaX = 0, arenaY = 0, arenaW = 0, arenaH = 0; // arena rect in CSS px

  // Camera shake
  let shakeX = 0, shakeY = 0, shakeMag = 0;

  // Particle pool
  const particles = [];
  const PROJ_TRAILS = new Map();

  // ── Resize ────────────────────────────────────────────────────────────────
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W   = window.innerWidth;
    H   = window.innerHeight;
    canvas.width  = (W * dpr) | 0;
    canvas.height = (H * dpr) | 0;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    // Fit the arena inside the window with some padding
    const PAD = 24;
    scale  = Math.min((W - PAD * 2) / C.ARENA_W, (H - PAD * 2) / C.ARENA_H);
    arenaW = C.ARENA_W * scale;
    arenaH = C.ARENA_H * scale;
    arenaX = (W - arenaW) / 2;
    arenaY = (H - arenaH) / 2;
    offX   = arenaX + arenaW / 2;  // world (0,0) maps here
    offY   = arenaY + arenaH / 2;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  resize();

  // ── Coord helpers (CSS px, no dpr) ───────────────────────────────────────
  function wx(x) { return x * scale + offX + shakeX; }
  function wy(y) { return y * scale + offY + shakeY; }
  function ws(r) { return r * scale; }

  // ── Particles ─────────────────────────────────────────────────────────────
  function addBurst(cx, cy, color, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spd * (0.3 + Math.random() * 0.9);
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        r: 2 + Math.random() * 3,
        color,
        life: 0.3 + Math.random() * 0.4,
        maxLife: 0.5,
      });
      if (particles.length > 500) particles.shift();
    }
  }

  function handleEvent(evt) {
    const ex = wx(evt.x || 0), ey = wy(evt.y || 0);
    switch (evt.type) {
      case 'kill_enemy':  addBurst(ex, ey, '#e03030', 14, 150); addBurst(ex, ey, '#fff', 5, 90); shakeMag = 5; Audio.killEnemy(); break;
      case 'hit_enemy':   addBurst(ex, ey, '#ffaa30',  5, 70); Audio.hit(); break;
      case 'hit':         addBurst(ex, ey, '#ff4455',  8, 100); shakeMag = 3; Audio.hitPlayer(); break;
      case 'player_death':addBurst(ex, ey, '#ff4455', 20, 200); addBurst(ex, ey, '#ffaa00', 8, 130); shakeMag = 10; Audio.death(); break;
      case 'pickup':      addBurst(ex, ey, '#44ff88',  8, 70); Audio.pickup(); break;
      case 'wave_start':  Audio.waveStart(); break;
      case 'shoot':       Audio.shoot(); break;
    }
  }

  // ── Background & arena ────────────────────────────────────────────────────
  function drawBackground() {
    // Black outside
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Arena fill
    ctx.fillStyle = '#050510';
    ctx.fillRect(arenaX + shakeX, arenaY + shakeY, arenaW, arenaH);

    // Dot grid inside arena
    ctx.fillStyle = '#1a1a30';
    const sp = ws(60);
    for (let x = arenaX + (sp / 2); x < arenaX + arenaW; x += sp)
      for (let y = arenaY + (sp / 2); y < arenaY + arenaH; y += sp) {
        ctx.beginPath();
        ctx.arc(x + shakeX, y + shakeY, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

    // White border — matches original game aesthetic
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 4;
    ctx.strokeRect(arenaX + shakeX, arenaY + shakeY, arenaW, arenaH);
  }

  // ── Pixel-art sprite drawing ───────────────────────────────────────────────
  // imageSmoothingEnabled = false for crisp upscaled sprites
  function drawSprite(img, cx, cy, drawW, drawH, rotation) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(cx, cy);
    if (rotation !== undefined) ctx.rotate(rotation);
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  function drawPlayer(p, isSelf) {
    if (!p.alive) return;
    const x   = wx(p.x), y = wy(p.y);
    const sz  = ws(C.PLAYER_R) * 2.2;
    const col = C.TEAM_COLORS[p.colorIdx % C.TEAM_COLORS.length];

    // Team colour tint using composite
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // Flicker on hit
    if (p.hitFlash && (Date.now() / 80 | 0) % 2 === 0) {
      ctx.globalAlpha = 0.4;
    }

    ctx.translate(x, y);
    // Spaceship points UP in the sprite; player.rotation is atan2(dy,dx) so offset +PI/2
    ctx.rotate(p.rotation + Math.PI / 2);

    // Draw with team colour overlay
    ctx.drawImage(Sprites.spaceship, -sz / 2, -sz / 2, sz, sz);

    // Colour tint pass
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.38;
    ctx.fillStyle   = col;
    ctx.fillRect(-sz / 2, -sz / 2, sz, sz);

    ctx.restore();

    // Name tag
    ctx.save();
    ctx.font = `bold ${Math.max(10, ws(9))}px monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle    = '#000';
    ctx.fillText(p.name, x + 1, y - sz / 2 - 3);
    ctx.fillStyle = col;
    ctx.fillText(p.name, x, y - sz / 2 - 4);
    ctx.restore();

    // HP bar
    const bw = sz * 1.1, bh = 4;
    const bx = x - bw / 2, by = y + sz / 2 + 4;
    ctx.fillStyle = '#333';
    ctx.fillRect(bx, by, bw, bh);
    const pct = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = pct > 0.5 ? '#44ff88' : pct > 0.25 ? '#ffcc00' : '#ff3344';
    ctx.fillRect(bx, by, bw * pct, bh);
    ctx.strokeStyle = '#fff4';
    ctx.lineWidth   = 1;
    ctx.strokeRect(bx, by, bw, bh);
  }

  function drawEnemy(e, t) {
    const x  = wx(e.x), y = wy(e.y);
    const sz = ws(e.r) * 2.5;
    // Bacteria sprite — rotate slowly to make them feel alive
    const rot = t * (e.type === C.TYPE.TANK ? 0.6 : 1.4) + (e.id ? e.id.charCodeAt(0) : 0);
    drawSprite(Sprites.bacteria, x, y, sz, sz, rot);

    // For tanks: draw bigger with a slight red tint
    if (e.type === C.TYPE.TANK) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = 0.35;
      ctx.fillStyle   = '#c040e0';
      ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      ctx.restore();
    }

    // HP bar (only when damaged)
    if (e.hp < e.maxHp) {
      const bw = sz, bh = 3;
      ctx.fillStyle = '#333';
      ctx.fillRect(x - bw / 2, y - sz / 2 - 7, bw, bh);
      ctx.fillStyle = e.type === C.TYPE.TANK ? '#c040e0' : '#e03030';
      ctx.fillRect(x - bw / 2, y - sz / 2 - 7, bw * (e.hp / e.maxHp), bh);
    }
  }

  function drawProjectile(p, players) {
    // Update trail
    let trail = PROJ_TRAILS.get(p.id);
    if (!trail) { trail = []; PROJ_TRAILS.set(p.id, trail); }
    trail.push({ x: wx(p.x), y: wy(p.y) });
    if (trail.length > 7) trail.shift();

    const owner = players && players.find(pl => pl.id === p.ownerId);
    const col   = owner ? C.TEAM_COLORS[owner.colorIdx % C.TEAM_COLORS.length] : '#ffffff';

    // Trail
    if (trail.length > 1) {
      for (let i = 1; i < trail.length; i++) {
        const a = i / trail.length;
        ctx.globalAlpha = a * 0.5;
        ctx.strokeStyle = col;
        ctx.lineWidth   = ws(C.PROJ_H) * a;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(trail[i-1].x, trail[i-1].y);
        ctx.lineTo(trail[i].x,   trail[i].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Bullet
    ctx.save();
    ctx.translate(wx(p.x), wy(p.y));
    ctx.rotate(p.rotation);
    ctx.fillStyle = col;
    ctx.fillRect(-ws(C.PROJ_W)/2, -ws(C.PROJ_H)/2, ws(C.PROJ_W), ws(C.PROJ_H));
    ctx.restore();
  }

  function drawPickup(p, t) {
    const x = wx(p.x), y = wy(p.y);
    const pulse = ws(C.PICKUP_R) * (1 + Math.sin(t * 2.5) * 0.15);
    ctx.beginPath();
    ctx.arc(x, y, pulse, 0, Math.PI * 2);
    ctx.fillStyle = '#22aa44';
    ctx.fill();
    ctx.strokeStyle = '#88ffaa';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    // Plus sign
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - pulse * 0.5, y - pulse * 0.12, pulse, pulse * 0.24);
    ctx.fillRect(x - pulse * 0.12, y - pulse * 0.5, pulse * 0.24, pulse);
  }

  // ── Pixel-art HUD using sprites ───────────────────────────────────────────
  function drawSpriteHUD(state, selfId) {
    if (!state) return;
    const self = state.players && state.players.find(p => p.id === selfId);
    const lives = self ? Math.max(0, Math.min(3, Math.ceil((self.hp / self.maxHp) * 3))) : 0;
    const score = self ? (self.kills || 0) : 0;

    // Bottom-left: life indicator sprite (scaled up 2x)
    const LW = 69 * 2, LH = 15 * 2;
    const lifeX = arenaX + 10, lifeY = arenaY + arenaH - LH - 8;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(Sprites.life[lives], lifeX, lifeY, LW, LH);

    // Bottom-center: "SCORE" label
    const SW = 69 * 2, SH = 15 * 2;
    const scoreTextX = arenaX + arenaW / 2 - SW / 2;
    const scoreTextY = arenaY + arenaH - SH - 8;
    ctx.drawImage(Sprites.score, scoreTextX, scoreTextY, SW, SH);

    // Score digits (right of label)
    const scoreStr = score.toString();
    const DW = NUM_W * 2, DH = NUM_H * 2;
    const digX = scoreTextX + SW + 6;
    for (let i = 0; i < scoreStr.length; i++) {
      const d = parseInt(scoreStr[i]);
      ctx.drawImage(
        Sprites.numbers,
        d * NUM_W, 0, NUM_W, NUM_H,      // source clip
        digX + i * (DW + 2), scoreTextY, DW, DH  // dest
      );
    }

    // Wave badge (top-right of arena)
    ctx.font = 'bold 13px monospace';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle    = '#00d4ff';
    ctx.fillText(`WAVE ${state.wave || 0}`, arenaX + arenaW - 8, arenaY + 8);

    if (state.enemiesLeft === 0 && state.graceTimer > 0) {
      ctx.fillStyle = '#ffcc00';
      ctx.fillText(`NEXT: ${state.graceTimer.toFixed(1)}s`, arenaX + arenaW - 8, arenaY + 24);
    }
  }

  // ── Particles draw ────────────────────────────────────────────────────────
  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x    += p.vx * dt; p.y += p.vy * dt;
      p.vx   *= 0.85;      p.vy *= 0.85;
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      const a = (p.life / p.maxLife) ** 2;
      ctx.globalAlpha = a;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── Camera shake ──────────────────────────────────────────────────────────
  function tickShake(dt) {
    if (shakeMag > 0.2) {
      shakeX   = (Math.random() - 0.5) * shakeMag;
      shakeY   = (Math.random() - 0.5) * shakeMag;
      shakeMag *= Math.pow(0.04, dt);
    } else {
      shakeX = shakeY = shakeMag = 0;
    }
  }

  // Clean up dead proj trails
  function cleanTrails(state) {
    if (!state || !state.projs) { PROJ_TRAILS.clear(); return; }
    const live = new Set(state.projs.map(p => p.id));
    for (const id of PROJ_TRAILS.keys()) if (!live.has(id)) PROJ_TRAILS.delete(id);
  }

  // ── Main render ───────────────────────────────────────────────────────────
  let lastT = 0;
  function render(state, selfId) {
    const now = performance.now();
    const dt  = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    const t = now / 1000;

    tickShake(dt);
    cleanTrails(state);

    drawBackground();

    // Clip drawing to arena
    ctx.save();
    ctx.beginPath();
    ctx.rect(arenaX + shakeX - 2, arenaY + shakeY - 2, arenaW + 4, arenaH + 4);
    ctx.clip();

    if (state) {
      if (state.pickups) state.pickups.forEach(p => drawPickup(p, t));
      if (state.enemies) state.enemies.forEach(e => drawEnemy(e, t));
      if (state.projs)   state.projs.forEach(p => drawProjectile(p, state.players));
      if (state.players) state.players.forEach(p => drawPlayer(p, p.id === selfId));
    }

    drawParticles(dt);
    ctx.restore();

    drawSpriteHUD(state, selfId);
  }

  return {
    render,
    handleEvent,
    resize,
    getScale()  { return scale; },
    getOffX()   { return offX; },
    getOffY()   { return offY; },
    canvasToWorld(cx, cy) { return { x: (cx - offX) / scale, y: (cy - offY) / scale }; },
    worldToCanvas(x, y)   { return { x: x * scale + offX,    y: y * scale + offY }; },
    getArena() { return { x: arenaX, y: arenaY, w: arenaW, h: arenaH }; },
  };
})();
