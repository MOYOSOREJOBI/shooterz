/**
 * Renderer — exact visual match to COMPLETED_FINAL_PROJECT_GAME_ENGINE 2
 *
 * C++ palette (from source):
 *   Background   : {15,  15,  25}   #0f0f19
 *   Parallax L1  : {30,  30,  60}   #1e1e3c  factor=0.15 spacing=0.6u
 *   Parallax L2  : {20,  50,  80}   #143250  factor=0.35 spacing=0.35u
 *   Wall         : {80,  80, 160}   #5050a0
 *   Chaser circle: {230,  50,  50}  #e63232
 *   Tank circle  : {140,  40, 180}  #8c28b4
 *   Projectile   : {255, 230,  80}  #ffe650  (rotated rect)
 *   Pickup circle: { 50, 220,  80}  #32dc50
 *   Player       : player_run.png, rotated, WHITE tint → 4 team-colour tints
 */
const Renderer = (() => {
  const canvas = document.getElementById('game-canvas');
  const ctx    = canvas.getContext('2d', { alpha: false });

  // ── Layout ────────────────────────────────────────────────────────────────
  let W = 0, H = 0, dpr = 1;
  let scale  = 1;            // world-units → CSS px
  let offX   = 0, offY = 0; // canvas centre = world (0,0) — shifts with camera
  let baseOffX = 0, baseOffY = 0; // geometric centre, no camera shift
  let aX = 0, aY = 0, aW = 0, aH = 0;  // arena rect in CSS px (no cam shift)

  // ── Camera ────────────────────────────────────────────────────────────────
  const CAM_LAG = 0.12;
  let camX = 0, camY = 0;      // smooth camera offset in world units
  let shakeX = 0, shakeY = 0, shakeMag = 0;

  // ── Clock ─────────────────────────────────────────────────────────────────
  let lastT = 0, clock = 0;

  // ── Sprite ────────────────────────────────────────────────────────────────
  // player_run.png: 192×128, 6 cols × 4 rows, each frame 32×32
  // Row = player slot (4 different skins). Sprite faces RIGHT.
  const { img: sprImg, fw: sprFW, fh: sprFH, cols: sprCols } = GameSprites.playerRun;

  // ── Particles ─────────────────────────────────────────────────────────────
  const parts = [];
  const trails = new Map(); // projId → [{x,y}]

  // ── Team colours (for player tint + UI) ──────────────────────────────────
  const TCOL = ['#00c8ff', '#e03030', '#30d060', '#d0b010'];

  // ── Resize ────────────────────────────────────────────────────────────────
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W   = window.innerWidth;
    H   = window.innerHeight;
    canvas.width  = (W * dpr) | 0;
    canvas.height = (H * dpr) | 0;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    const PAD = 18;
    scale  = Math.min((W - PAD * 2) / C.ARENA_W, (H - PAD * 2) / C.ARENA_H);
    aW     = C.ARENA_W * scale;
    aH     = C.ARENA_H * scale;
    baseOffX = aX = (W - aW) / 2;
    baseOffY = aY = (H - aH) / 2;
    offX   = aX + aW / 2;
    offY   = aY + aH / 2;
    baseOffX = offX;
    baseOffY = offY;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  resize();

  // ── Coord helpers ─────────────────────────────────────────────────────────
  // All coords in CSS px (multiply by dpr only in raw canvas ops)
  const wx = x => x * scale + offX + shakeX;
  const wy = y => y * scale + offY + shakeY;
  const ws = r => r * scale;

  // ── Particle pool ─────────────────────────────────────────────────────────
  function burst(cx, cy, col, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spd * (0.3 + Math.random() * 0.8);
      if (parts.length < 600)
        parts.push({ x: cx, y: cy, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
                     r: 2 + Math.random() * 3, col, life: 0.3 + Math.random() * 0.4 });
    }
  }

  function handleEvent(evt) {
    const ex = wx(evt.x || 0), ey = wy(evt.y || 0);
    switch (evt.type) {
      case 'kill_enemy':   burst(ex,ey,'#e63232',14,160); burst(ex,ey,'#fff',5,90); shakeMag=5; Audio.killEnemy(); break;
      case 'hit_enemy':    burst(ex,ey,'#ffaa30',5,70); Audio.hit(); break;
      case 'hit':          burst(ex,ey,'#ff4455',8,100); shakeMag=3; Audio.hitPlayer(); break;
      case 'player_death': burst(ex,ey,'#e63232',20,200); burst(ex,ey,'#ffe650',8,120); shakeMag=10; Audio.death(); break;
      case 'pickup':       burst(ex,ey,'#32dc50',8,80); Audio.pickup(); break;
      case 'wave_start':   Audio.waveStart(); break;
      case 'shoot':        Audio.shoot(); break;
    }
  }

  // ── Background — exact C++ parallax ──────────────────────────────────────
  const L1 = { col:'#1e1e3c', f:0.15, sp:0.6,  r:1.875 };  // {30,30,60}
  const L2 = { col:'#143250', f:0.35, sp:0.35, r:2.375 };  // {20,50,80}

  function drawLayer(layer) {
    const spacing = ws(layer.sp);
    if (spacing < 4) return;
    // auto-scroll (matches C++: baseOx += t * factor * 12)
    const autoX = clock * layer.f * 12 * scale;
    const autoY = clock * layer.f *  6 * scale;
    // camera parallax
    const parX  = -camX * scale * layer.f;
    const parY  = -camY * scale * layer.f;

    const ox = ((autoX + parX) % spacing + spacing) % spacing;
    const oy = ((autoY + parY) % spacing + spacing) % spacing;

    ctx.fillStyle = layer.col;
    for (let x = ox - spacing; x < W + spacing; x += spacing)
      for (let y = oy - spacing; y < H + spacing; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, layer.r, 0, Math.PI * 2);
        ctx.fill();
      }
  }

  function drawBackground() {
    ctx.fillStyle = '#0f0f19';    // {15,15,25}
    ctx.fillRect(0, 0, W, H);
    drawLayer(L1);
    drawLayer(L2);
  }

  function drawArena() {
    // Arena floor (slightly lighter than BG to delineate the play area)
    ctx.fillStyle = '#121220';
    ctx.fillRect(aX, aY, aW, aH);

    // Walls — {80,80,160} #5050a0
    const wt = ws(6);
    ctx.fillStyle = '#5050a0';
    ctx.fillRect(aX,        aY - wt,  aW, wt);   // top
    ctx.fillRect(aX,        aY + aH,  aW, wt);   // bottom
    ctx.fillRect(aX - wt,   aY,  wt,  aH);        // left
    ctx.fillRect(aX + aW,   aY,  wt,  aH);        // right
  }

  // ── Player (player_run.png sprite, faces RIGHT, rotated toward aim) ───────
  function drawPlayer(p, isSelf) {
    if (!p.alive) return;
    const x  = wx(p.x), y = wy(p.y);
    const sz = ws(C.PLAYER_R) * 2.6;
    const row = p.colorIdx % 4;

    // Animation: 6 frames at 8 fps
    const frame = (Math.floor(clock * 8) % sprCols);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);
    ctx.rotate(p.rotation);   // sprite faces RIGHT; rotation = atan2(dy,dx) → correct

    // Hit flash
    if (p.hitFlash && (Date.now() / 70 | 0) % 2) ctx.globalAlpha = 0.35;

    // Draw frame
    ctx.drawImage(sprImg, frame * sprFW, row * sprFH, sprFW, sprFH,
                  -sz / 2, -sz / 2, sz, sz);

    // Team-colour tint
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.30;
    ctx.fillStyle   = TCOL[p.colorIdx % TCOL.length];
    ctx.fillRect(-sz / 2, -sz / 2, sz, sz);

    ctx.restore();

    // Name tag
    const col  = TCOL[p.colorIdx % TCOL.length];
    const fs   = Math.max(9, ws(8));
    ctx.save();
    ctx.font         = `bold ${fs}px monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    const tw = ctx.measureText(p.name).width + 8;
    const ty = y - sz / 2 - 3;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath(); ctx.roundRect(x - tw/2, ty - fs - 2, tw, fs + 4, 3); ctx.fill();
    ctx.fillStyle = col;
    ctx.fillText(p.name, x, ty);
    ctx.restore();

    // HP bar
    const bw = sz * 1.05, bh = 4;
    const bx = x - bw/2, by = y + sz/2 + 4;
    ctx.fillStyle = '#333';
    ctx.fillRect(bx, by, bw, bh);
    const pct = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = pct > 0.60 ? '#22cc44' : pct > 0.30 ? '#ccaa00' : '#cc2222';
    ctx.fillRect(bx, by, bw * pct, bh);
  }

  // ── Chaser — exact: DrawCircle with {230,50,50} ───────────────────────────
  function drawChaser(e) {
    const x = wx(e.x), y = wy(e.y), r = ws(e.r);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#e63232';   // {230,50,50}
    ctx.fill();
    // HP damage indicator
    if (e.hp < e.maxHp) {
      ctx.beginPath(); ctx.arc(x, y, r * (e.hp/e.maxHp), 0, Math.PI * 2);
      ctx.fillStyle = '#ff6666';
      ctx.fill();
    }
  }

  // ── Tank — exact: DrawCircle with {140,40,180} ────────────────────────────
  function drawTank(e) {
    const x = wx(e.x), y = wy(e.y), r = ws(e.r);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#8c28b4';   // {140,40,180}
    ctx.fill();
    if (e.hp < e.maxHp) {
      ctx.beginPath(); ctx.arc(x, y, r * (e.hp/e.maxHp), 0, Math.PI * 2);
      ctx.fillStyle = '#bb66ee';
      ctx.fill();
    }
  }

  function drawEnemy(e) {
    e.type === C.TYPE.TANK ? drawTank(e) : drawChaser(e);
  }

  // ── Projectile — exact: rotated rect {255,230,80} ─────────────────────────
  function drawProjectile(p, players) {
    // Trail
    let tr = trails.get(p.id);
    if (!tr) { tr = []; trails.set(p.id, tr); }
    tr.push({ x: wx(p.x), y: wy(p.y) });
    if (tr.length > 6) tr.shift();

    if (tr.length > 1) {
      for (let i = 1; i < tr.length; i++) {
        const a = i / tr.length;
        ctx.globalAlpha = a * 0.4;
        ctx.strokeStyle = '#ffe650';
        ctx.lineWidth   = ws(C.PROJ_H) * a;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(tr[i-1].x, tr[i-1].y);
        ctx.lineTo(tr[i].x,   tr[i].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Core rect — {255,230,80}
    ctx.save();
    ctx.translate(wx(p.x), wy(p.y));
    ctx.rotate(p.rotation);
    ctx.fillStyle = '#ffe650';
    ctx.fillRect(-ws(C.PROJ_W)/2, -ws(C.PROJ_H)/2, ws(C.PROJ_W), ws(C.PROJ_H));
    ctx.restore();
  }

  // ── Pickup — exact: circle {50,220,80} ────────────────────────────────────
  function drawPickup(p) {
    const x = wx(p.x), y = wy(p.y);
    const r = ws(C.PICKUP_R) * (1 + Math.sin(clock * 2.8) * 0.08);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#32dc50';   // {50,220,80}
    ctx.fill();
    // Plus sign
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - r*0.5, y - r*0.12, r, r*0.24);
    ctx.fillRect(x - r*0.12, y - r*0.5, r*0.24, r);
  }

  // ── Particles ─────────────────────────────────────────────────────────────
  function drawParticles(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.82;     p.vy *= 0.82;
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life / 0.5);
      ctx.fillStyle   = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function cleanTrails(state) {
    if (!state || !state.projs) { trails.clear(); return; }
    const live = new Set(state.projs.map(p => p.id));
    for (const id of trails.keys()) if (!live.has(id)) trails.delete(id);
  }

  // ── Camera shake ──────────────────────────────────────────────────────────
  function tickShake(dt) {
    if (shakeMag > 0.15) {
      shakeX = (Math.random() - 0.5) * shakeMag;
      shakeY = (Math.random() - 0.5) * shakeMag;
      shakeMag *= Math.pow(0.04, dt);
    } else { shakeX = shakeY = shakeMag = 0; }
  }

  // ── HUD — matches C++ exactly ─────────────────────────────────────────────
  // "HP [bar] HP XX/100" top-left
  // "Wave N / Kills N / time s" top-right
  function drawHUD(state, selfId, startMs) {
    if (!state) return;
    const self = state.players && state.players.find(p => p.id === selfId);
    const p    = self;

    if (p) {
      // HP bar — top-left (matches C++ 200x16 bar at x=10, y=32)
      const barW = Math.min(200, aW * 0.28);
      const barH = 14;
      const bx   = aX + 10, by = aY + 10;
      const pct  = Math.max(0, p.hp / p.maxHp);
      ctx.fillStyle = '#444';
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = pct > 0.60 ? '#22cc44' : pct > 0.30 ? '#ccaa00' : '#cc2222';
      ctx.fillRect(bx, by, barW * pct, barH);
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ddd';
      ctx.fillText(`HP  ${Math.ceil(p.hp)} / ${p.maxHp}`, bx + barW + 8, by + barH/2);
    }

    // Wave / Kills / Time — top-right (matches C++ DrawText at sw-150)
    const rx = aX + aW - 8;
    const col = TCOL[p ? p.colorIdx % TCOL.length : 0];
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    ctx.fillText(`Wave  ${state.wave || 0}`,  rx, aY + 8);
    ctx.fillStyle = '#fff';
    ctx.fillText(`Kills ${p ? p.kills || 0 : 0}`, rx, aY + 26);
    ctx.fillStyle = '#bbb';
    const secs = Math.floor((Date.now() - startMs) / 1000);
    const mm = String(Math.floor(secs/60)).padStart(2,'0');
    const ss = String(secs%60).padStart(2,'0');
    ctx.fillText(`${mm}:${ss}`, rx, aY + 44);

    // Grace timer
    if (state.enemiesLeft === 0 && state.graceTimer > 0) {
      ctx.fillStyle = '#ffcc00';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(`Next wave ${state.graceTimer.toFixed(1)}s`, rx, aY + 64);
    }

    // Multi-player mini bars (bottom centre)
    if (state.players && state.players.length > 1) {
      const barW2 = 70, barH2 = 5, gap = 10;
      const total = state.players.length;
      const startX = W/2 - (total * (barW2 + gap) - gap)/2;
      state.players.forEach((pl, i) => {
        const bx2 = startX + i*(barW2+gap), by2 = aY + aH + 8;
        const col2 = TCOL[pl.colorIdx % TCOL.length];
        ctx.font = '10px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = col2;
        ctx.fillText(pl.name, bx2, by2);
        ctx.fillStyle = '#333';
        ctx.fillRect(bx2, by2 + 11, barW2, barH2);
        ctx.fillStyle = col2;
        ctx.fillRect(bx2, by2 + 11, barW2 * Math.max(0, pl.hp/pl.maxHp), barH2);
      });
    }
  }

  // ── Game-over overlay ─────────────────────────────────────────────────────
  // Matches C++ dark overlay + "GAME OVER" red + stats + "Press R to Restart"
  function drawGameOver(stats) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#cc2222';
    ctx.font = `bold ${Math.max(32, Math.min(60, W*0.06))}px monospace`;
    ctx.fillText('GAME OVER', W/2, H/2 - 70);

    if (stats) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(`Survived ${stats.time}s  |  Wave ${stats.wave}  |  Kills ${stats.kills}`, W/2, H/2 + 10);
      ctx.fillStyle = '#bbb';
      ctx.font = '15px monospace';
      ctx.fillText('Play Again — click the button below', W/2, H/2 + 40);
    }
  }

  // ── Main render ───────────────────────────────────────────────────────────
  let gameStartMs = Date.now();
  let goStats = null;

  function render(state, selfId) {
    const now = performance.now();
    const dt  = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    clock += dt;

    // Camera smoothly follows self
    const self = state && state.players && state.players.find(p => p.id === selfId);
    if (self && self.alive) {
      camX += (self.x * CAM_LAG - camX) * Math.min(1, dt * 8);
      camY += (self.y * CAM_LAG - camY) * Math.min(1, dt * 8);
    }
    // Apply camera + shake to offX/offY
    offX = baseOffX - camX * scale + shakeX;
    offY = baseOffY - camY * scale + shakeY;

    tickShake(dt);
    cleanTrails(state);

    // Recalculate arena screen position with camera shift
    aX = offX - C.ARENA_HW * scale;
    aY = offY - C.ARENA_HH * scale;

    drawBackground();
    drawArena();

    if (state) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(aX - 2, aY - 2, aW + 4, aH + 4);
      ctx.clip();

      if (state.pickups) state.pickups.forEach(drawPickup);
      if (state.enemies) state.enemies.forEach(drawEnemy);
      if (state.projs)   state.projs.forEach(p => drawProjectile(p, state.players));
      if (state.players) state.players.forEach(p => drawPlayer(p, p.id === selfId));
      drawParticles(dt);
      ctx.restore();
    } else {
      drawParticles(dt);
    }

    drawHUD(state, selfId, gameStartMs);
    if (goStats) drawGameOver(goStats);
  }

  return {
    render, handleEvent, resize,
    setStartTime(ms) { gameStartMs = ms; goStats = null; },
    setGameOver(s)   { goStats = s; },
    clearGameOver()  { goStats = null; },
    getScale()  { return scale; },
    getOffX()   { return offX; },
    getOffY()   { return offY; },
    canvasToWorld(cx, cy) { return { x: (cx - offX) / scale, y: (cy - offY) / scale }; },
  };
})();
