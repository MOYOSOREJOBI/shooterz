// Renderer — exact C++ game look: dark arena, character sprites, rock enemies
const Renderer = (() => {
  const canvas = document.getElementById('game-canvas');
  const ctx    = canvas.getContext('2d', { alpha: false });

  // ── Layout ────────────────────────────────────────────────────────────────
  let W = 0, H = 0, dpr = 1;
  let scale  = 1;          // world units → CSS px
  let offX   = 0, offY = 0; // canvas centre (= world origin)
  let aX = 0, aY = 0, aW = 0, aH = 0; // arena rect in CSS px

  // ── Camera shake ──────────────────────────────────────────────────────────
  let shakeX = 0, shakeY = 0, shakeMag = 0;

  // ── Animation clock ───────────────────────────────────────────────────────
  let lastT = 0;
  let clock = 0; // seconds elapsed

  // ── Particle pool ─────────────────────────────────────────────────────────
  const particles = [];
  const projTrails = new Map();

  // Team colours matching the original game palette
  const TEAM_COL  = ['#00d4ff', '#e03030', '#40e080', '#e0c020'];
  const TEAM_TINT = ['rgba(0,200,255,0.32)', 'rgba(220,40,40,0.32)', 'rgba(40,200,100,0.32)', 'rgba(200,180,0,0.32)'];

  // ── Resize ────────────────────────────────────────────────────────────────
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W   = window.innerWidth;
    H   = window.innerHeight;
    canvas.width  = (W * dpr) | 0;
    canvas.height = (H * dpr) | 0;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    const PAD = 20;
    scale = Math.min((W - PAD * 2) / C.ARENA_W, (H - PAD * 2) / C.ARENA_H);
    aW = C.ARENA_W * scale;  aH = C.ARENA_H * scale;
    aX = (W - aW) / 2;       aY = (H - aH) / 2;
    offX = aX + aW / 2;      offY = aY + aH / 2;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  resize();

  // ── Coordinate helpers ────────────────────────────────────────────────────
  const wx = x => x * scale + offX + shakeX;
  const wy = y => y * scale + offY + shakeY;
  const ws = r => r * scale;

  // ── Particle helpers ──────────────────────────────────────────────────────
  function burst(cx, cy, col, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spd * (0.3 + Math.random() * 0.9);
      if (particles.length < 600)
        particles.push({ x: cx, y: cy, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
                         r: 2 + Math.random() * 3, color: col,
                         life: 0.3 + Math.random() * 0.45, maxLife: 0.5 });
    }
  }

  function handleEvent(evt) {
    const ex = wx(evt.x || 0), ey = wy(evt.y || 0);
    switch (evt.type) {
      case 'kill_enemy':   burst(ex,ey,'#e06020',14,160); burst(ex,ey,'#fff',4,80); shakeMag=6; Audio.killEnemy(); break;
      case 'hit_enemy':    burst(ex,ey,'#e08030',5,70);   Audio.hit(); break;
      case 'hit':          burst(ex,ey,'#ff4455',8,110);  shakeMag=4; Audio.hitPlayer(); break;
      case 'player_death': burst(ex,ey,'#ff4455',22,210); burst(ex,ey,'#ffcc00',8,130); shakeMag=12; Audio.death(); break;
      case 'pickup':       burst(ex,ey,'#44ff88',8,75);   Audio.pickup(); break;
      case 'wave_start':   Audio.waveStart(); break;
      case 'shoot':        Audio.shoot(); break;
    }
  }

  // ── Background — exact C++ style ──────────────────────────────────────────
  function drawBackground() {
    // Fill entire window black
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Arena background — same dark navy as original (15,15,25)
    ctx.fillStyle = '#0f0f19';
    ctx.fillRect(aX + shakeX, aY + shakeY, aW, aH);

    // Parallax dot grid layer 1 (matches C++ parallax layer 1)
    const sp1 = ws(55);
    const ox1 = ((offX * 0.8) % sp1 + sp1) % sp1;
    const oy1 = ((offY * 0.8) % sp1 + sp1) % sp1;
    ctx.fillStyle = '#1e1e3c';
    for (let x = aX + shakeX + (ox1 - sp1); x < aX + aW + sp1; x += sp1)
      for (let y = aY + shakeY + (oy1 - sp1); y < aY + aH + sp1; y += sp1) {
        ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill();
      }

    // Parallax dot grid layer 2 (smaller, denser)
    const sp2 = ws(30);
    const ox2 = ((offX * 0.5) % sp2 + sp2) % sp2;
    const oy2 = ((offY * 0.5) % sp2 + sp2) % sp2;
    ctx.fillStyle = '#141428';
    for (let x = aX + shakeX + (ox2 - sp2); x < aX + aW + sp2; x += sp2)
      for (let y = aY + shakeY + (oy2 - sp2); y < aY + aH + sp2; y += sp2) {
        ctx.beginPath(); ctx.arc(x, y, 0.8, 0, Math.PI * 2); ctx.fill();
      }

    // Arena walls — purple-blue like original (80,80,160)
    const wt = ws(7);
    ctx.fillStyle = '#5050a0';
    ctx.fillRect(aX + shakeX,           aY + shakeY - wt,  aW, wt);           // top
    ctx.fillRect(aX + shakeX,           aY + shakeY + aH,   aW, wt);           // bottom
    ctx.fillRect(aX + shakeX - wt,      aY + shakeY,         wt, aH);           // left
    ctx.fillRect(aX + shakeX + aW,      aY + shakeY,         wt, aH);           // right

    // Inner wall edge glow line
    ctx.strokeStyle = '#8888cc';
    ctx.lineWidth   = 2;
    ctx.strokeRect(aX + shakeX, aY + shakeY, aW, aH);
  }

  // ── Player (character sprite) ─────────────────────────────────────────────
  function drawPlayer(p, isSelf) {
    if (!p.alive) return;

    const x   = wx(p.x), y = wy(p.y);
    const sz  = ws(C.PLAYER_R) * 2.8;        // draw size in CSS px
    const col = TEAM_COL[p.colorIdx % TEAM_COL.length];

    // Animation: cycle through 6 run frames at ~8fps
    const frameIdx = (Math.floor(clock * 8) % 6);
    // Sprite row = player colour index (4 rows = 4 character skins)
    const row = p.colorIdx % 4;
    const { img, fw, fh, cols } = GameSprites.playerRun;

    // Flip sprite if aiming/moving left
    const facingLeft = Math.cos(p.rotation) < 0;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);
    if (facingLeft) ctx.scale(-1, 1);

    // Shadow
    ctx.globalAlpha = 0.25;
    ctx.fillStyle   = '#000';
    ctx.beginPath();
    ctx.ellipse(0, sz * 0.45, sz * 0.4, sz * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Hit flash
    if (p.hitFlash && (Date.now() / 60 | 0) % 2 === 0) ctx.globalAlpha = 0.4;

    // Draw character frame
    ctx.drawImage(img, frameIdx * fw, row * fh, fw, fh, -sz/2, -sz/2, sz, sz);

    // Colour tint overlay using source-atop
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.28;
    ctx.fillStyle   = col;
    ctx.fillRect(-sz/2, -sz/2, sz, sz);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    ctx.restore();

    // Name tag
    const fontSize = Math.max(9, ws(8.5));
    ctx.save();
    ctx.font         = `bold ${fontSize}px monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    const tw = ctx.measureText(p.name).width + 8;
    const ty = y - sz / 2 - 2;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.roundRect(x - tw/2, ty - fontSize - 2, tw, fontSize + 4, 4);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.fillText(p.name, x, ty);
    ctx.restore();

    // HP bar
    const bw = sz * 1.1, bh = 4;
    const bx = x - bw / 2, by = y + sz / 2 + 4;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(bx, by, bw, bh);
    const pct = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = pct > 0.55 ? '#40dd70' : pct > 0.28 ? '#e0cc20' : '#e03030';
    ctx.fillRect(bx, by, bw * pct, bh);
    ctx.strokeStyle = '#ffffff22';
    ctx.lineWidth   = 1;
    ctx.strokeRect(bx, by, bw, bh);

    // Self indicator ring
    if (isSelf) {
      ctx.beginPath();
      ctx.arc(x, y, sz / 2 + 5, 0, Math.PI * 2);
      ctx.strokeStyle = col + '66';
      ctx.lineWidth   = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ── Enemy (rock sprite) ───────────────────────────────────────────────────
  function drawEnemy(e) {
    const x   = wx(e.x), y = wy(e.y);
    const sz  = ws(e.r) * 2.4;
    // Chasers = rock, Tanks = pingpong (big round ball)
    const sprite = e.type === C.TYPE.TANK ? GameSprites.pingpong : GameSprites.rock;

    // Slow tumble rotation
    const rot = clock * (e.type === C.TYPE.TANK ? 0.5 : 1.1) + (e.id ? e.id.charCodeAt(0) * 0.4 : 0);

    // Shadow
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle   = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y + sz * 0.44, sz * 0.38, sz * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Sprite with rotation
    ctx.save();
    ctx.imageSmoothingEnabled = true;   // rocks look better with smoothing
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(sprite, -sz/2, -sz/2, sz, sz);
    ctx.restore();

    // HP bar when damaged
    if (e.hp < e.maxHp) {
      const bw = sz;
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(x - bw/2, y - sz/2 - 8, bw, 3);
      ctx.fillStyle = e.type === C.TYPE.TANK ? '#c040e0' : '#e03030';
      ctx.fillRect(x - bw/2, y - sz/2 - 8, bw * (e.hp / e.maxHp), 3);
    }
  }

  // ── Projectile ────────────────────────────────────────────────────────────
  function drawProjectile(p, players) {
    // Update trail
    let tr = projTrails.get(p.id);
    if (!tr) { tr = []; projTrails.set(p.id, tr); }
    tr.push({ x: wx(p.x), y: wy(p.y) });
    if (tr.length > 7) tr.shift();

    const owner = players && players.find(pl => pl.id === p.ownerId);
    const col   = owner ? TEAM_COL[owner.colorIdx % TEAM_COL.length] : '#ffe050';

    // Trail
    for (let i = 1; i < tr.length; i++) {
      const a = i / tr.length;
      ctx.globalAlpha = a * 0.45;
      ctx.strokeStyle = col;
      ctx.lineWidth   = ws(C.PROJ_H) * a * 1.5;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(tr[i-1].x, tr[i-1].y);
      ctx.lineTo(tr[i].x,   tr[i].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Bullet core
    ctx.save();
    ctx.translate(wx(p.x), wy(p.y));
    ctx.rotate(p.rotation);
    ctx.fillStyle = col;
    const pw = ws(C.PROJ_W), ph = ws(C.PROJ_H);
    ctx.fillRect(-pw/2, -ph/2, pw, ph);
    ctx.restore();
  }

  // ── Pickup ────────────────────────────────────────────────────────────────
  function drawPickup(p) {
    const x = wx(p.x), y = wy(p.y);
    const r = ws(C.PICKUP_R) * (1 + Math.sin(clock * 3) * 0.1);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#207840';
    ctx.fill();
    ctx.strokeStyle = '#66ffaa';
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.fillStyle   = '#fff';
    ctx.font        = `bold ${(r * 1.1)|0}px monospace`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', x, y + 1);
  }

  // ── Particles ─────────────────────────────────────────────────────────────
  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.82;      p.vy *= 0.82;
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      const a = (p.life / p.maxLife) ** 1.5;
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
    if (shakeMag > 0.15) {
      shakeX   = (Math.random() - 0.5) * shakeMag;
      shakeY   = (Math.random() - 0.5) * shakeMag;
      shakeMag *= Math.pow(0.03, dt);
    } else { shakeX = shakeY = shakeMag = 0; }
  }

  function cleanTrails(state) {
    if (!state || !state.projs) { projTrails.clear(); return; }
    const live = new Set(state.projs.map(p => p.id));
    for (const id of projTrails.keys()) if (!live.has(id)) projTrails.delete(id);
  }

  // ── HUD (on-canvas) ───────────────────────────────────────────────────────
  function drawHUD(state, selfId, startTime) {
    if (!state) return;
    const self = state.players && state.players.find(p => p.id === selfId);

    // Wave badge — top-right inside arena
    const rx = aX + aW - 8, ry = aY + 10;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'top';
    ctx.font         = 'bold 13px monospace';
    ctx.fillStyle    = '#00d4ff';
    ctx.fillText(`WAVE ${state.wave || 0}`, rx, ry);

    if (state.enemiesLeft === 0 && state.graceTimer > 0) {
      ctx.fillStyle = '#ffcc00';
      ctx.fillText(`NEXT ${state.graceTimer.toFixed(1)}s`, rx, ry + 17);
    }

    if (!self) return;

    // Bottom-left stats
    const lx = aX + 10, ly = aY + aH - 10;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'bottom';
    const col = TEAM_COL[self.colorIdx % TEAM_COL.length];
    ctx.font      = 'bold 12px monospace';
    ctx.fillStyle = col;
    const secs = Math.floor((Date.now() - startTime) / 1000);
    const mm   = String(Math.floor(secs / 60)).padStart(2,'0');
    const ss   = String(secs % 60).padStart(2,'0');
    ctx.fillText(`${self.kills||0} KILLS  ·  ${mm}:${ss}  ·  HP ${Math.ceil(self.hp)}/${self.maxHp}`, lx, ly);

    // HP bar strip — very bottom of arena
    const bw = aW * 0.35, bh = 5;
    const bx = aX + aW/2 - bw/2, by = aY + aH + 6;
    ctx.fillStyle = '#111';
    ctx.fillRect(bx, by, bw, bh);
    const pct = Math.max(0, self.hp / self.maxHp);
    ctx.fillStyle = pct > 0.55 ? '#40dd70' : pct > 0.28 ? '#e0cc20' : '#e03030';
    ctx.fillRect(bx, by, bw * pct, bh);
  }

  // ── Main render ───────────────────────────────────────────────────────────
  let gameStartTime = Date.now();
  function setStartTime(t) { gameStartTime = t; }

  function render(state, selfId) {
    const now = performance.now();
    const dt  = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    clock += dt;

    tickShake(dt);
    cleanTrails(state);

    drawBackground();

    // Clip to arena so sprites don't bleed outside walls
    ctx.save();
    ctx.beginPath();
    ctx.rect(aX + shakeX - 1, aY + shakeY - 1, aW + 2, aH + 2);
    ctx.clip();

    if (state) {
      if (state.pickups) state.pickups.forEach(drawPickup);
      if (state.enemies) state.enemies.forEach(drawEnemy);
      if (state.projs)   state.projs.forEach(p => drawProjectile(p, state.players));
      if (state.players) state.players.forEach(p => drawPlayer(p, p.id === selfId));
    }

    drawParticles(dt);
    ctx.restore();

    drawHUD(state, selfId, gameStartTime);
  }

  return {
    render, handleEvent, resize, setStartTime,
    getScale()  { return scale; },
    getOffX()   { return offX; },
    getOffY()   { return offY; },
    canvasToWorld(cx, cy) { return { x: (cx - offX) / scale, y: (cy - offY) / scale }; },
    worldToCanvas(x, y)   { return { x: x * scale + offX,    y: y * scale + offY }; },
  };
})();
