/**
 * Renderer — pixel-perfect match to COMPLETED_FINAL_PROJECT_GAME_ENGINE 2
 *
 * Exact C++ entity sizes (world units → C++ units at 1 C++ unit = 100 world units):
 *   Player  : 0.14 × 0.14 units → entity size = 14 world units → PLAYER_R=14 = half-width
 *   Chaser  : 0.12 × 0.12 units → circle radius = 6 world units  (C++ uses width/2)
 *   Tank    : 0.20 × 0.20 units → circle radius = 10 world units
 *   Proj    : 0.07 × 0.03 units → rect 7 × 3 world units
 *   Pickup  : 0.10 × 0.10 units → circle radius = 5 world units
 *
 * Exact C++ palette:
 *   BG         {15,15,25}    #0f0f19
 *   Parallax1  {30,30,60}    #1e1e3c  factor=0.15 spacing=0.6u
 *   Parallax2  {20,50,80}    #143250  factor=0.35 spacing=0.35u
 *   Wall       {80,80,160}   #5050a0
 *   Chaser     {230,50,50}   #e63232  solid filled circle
 *   Tank       {140,40,180}  #8c28b4  solid filled circle
 *   Projectile {255,230,80}  #ffe650  rotated rect
 *   Pickup     {50,220,80}   #32dc50  filled circle
 *   Player     player_run.png WHITE → team tint
 */
const Renderer = (() => {
  const canvas = document.getElementById('game-canvas');
  const ctx    = canvas.getContext('2d', { alpha: false });

  // ── Layout ────────────────────────────────────────────────────────────────
  let W = 0, H = 0, dpr = 1;
  let scale = 1;              // world units → CSS px
  let baseOffX = 0, baseOffY = 0;
  let offX = 0, offY = 0;
  let aX = 0, aY = 0, aW = 0, aH = 0;

  // ── Camera (C++ CAM_LAG = 0.12) ───────────────────────────────────────────
  let camX = 0, camY = 0;
  let shakeX = 0, shakeY = 0, shakeMag = 0;

  // ── Clock / animation ─────────────────────────────────────────────────────
  let lastT = 0, clock = 0;
  const ANIM_FPS = 5; // exact C++ animation fps

  // ── Sprite: player_run.png — 192×128, 6 cols × 4 rows, 32×32 per frame ──
  const SPR = GameSprites.playerRun;

  // ── Particles ─────────────────────────────────────────────────────────────
  const parts  = [];
  const trails = new Map();

  // ── Team colours for tint ─────────────────────────────────────────────────
  const TCOL = ['#00c8ff', '#e03030', '#30d060', '#d0b010'];

  // C++ entity draw sizes (half-widths converted to visual radii)
  // C++ draws at entity.width * pxPerUnit for sprites, entity.width/2 * pxPerUnit for circles
  // We replicate this: sprite drawn at PLAYER_R*2*scale, circles at ENTITY_R/2 * scale
  const P_SZ  = () => ws(C.PLAYER_R);          // = 14 * scale ≈ 18px (matches C++ 0.14u * 128 = 18px)
  const CH_R  = () => ws(C.CHASER_R / 2);      // = 6 * scale  ≈ 8px  (matches C++ 0.06u * 128 = 7.7px)
  const TK_R  = () => ws(C.TANK_R   / 2);      // = 10 * scale ≈ 13px (matches C++ 0.10u * 128 = 12.8px)
  const PK_R  = () => ws(C.PICKUP_R / 2);      // = 5 * scale  ≈ 6px
  const PR_W  = () => ws(C.PROJ_W / 2);        // proj half-size
  const PR_H  = () => ws(C.PROJ_H / 2);

  // ── Resize ────────────────────────────────────────────────────────────────
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W   = window.innerWidth;
    H   = window.innerHeight;
    canvas.width  = (W * dpr) | 0;
    canvas.height = (H * dpr) | 0;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    // Match C++ scale: min(W,H) / viewportScale (7.0) ÷ 100 (world units per C++ unit)
    // But also use our arena to fit the window
    const PAD = 20;
    scale    = Math.min((W - PAD*2) / C.ARENA_W, (H - PAD*2) / C.ARENA_H);
    aW       = C.ARENA_W * scale;
    aH       = C.ARENA_H * scale;
    baseOffX = offX = (W - aW)/2 + aW/2;  // world (0,0) centre
    baseOffY = offY = (H - aH)/2 + aH/2;
    aX = offX - aW/2;
    aY = offY - aH/2;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  resize();

  // ── Coord helpers ─────────────────────────────────────────────────────────
  const wx = x => x * scale + offX + shakeX;
  const wy = y => y * scale + offY + shakeY;
  const ws = r => r * scale;

  // ── Particles ─────────────────────────────────────────────────────────────
  function burst(cx, cy, col, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spd * (0.3 + Math.random() * 0.8);
      if (parts.length < 600)
        parts.push({ x:cx, y:cy, vx:Math.cos(a)*s, vy:Math.sin(a)*s,
                     r:1.5 + Math.random()*2.5, col,
                     life:0.3 + Math.random()*0.35, maxLife:0.45 });
    }
  }

  function handleEvent(evt) {
    const ex = wx(evt.x || 0), ey = wy(evt.y || 0);
    switch (evt.type) {
      case 'kill_enemy':   burst(ex,ey,'#e63232',12,140); burst(ex,ey,'#fff',4,80); shakeMag=5; Audio.killEnemy(); break;
      case 'hit_enemy':    burst(ex,ey,'#ff8844', 4, 60); Audio.hit(); break;
      case 'hit':          burst(ex,ey,'#ff4455', 6, 90); shakeMag=3; Audio.hitPlayer(); break;
      case 'player_death': burst(ex,ey,'#e63232',18,180); burst(ex,ey,'#ffe650',6,110); shakeMag=9; Audio.death(); break;
      case 'pickup':       burst(ex,ey,'#32dc50', 7, 70); Audio.pickup(); break;
      case 'wave_start':   Audio.waveStart(); break;
      case 'shoot':        Audio.shoot(); break;
    }
  }

  // ── Background — exact C++ parallax ──────────────────────────────────────
  // C++ Layer1: {30,30,60}  factor=0.15 tileWidth=0.6  dotR=1.5+0.15*2.5=1.875
  // C++ Layer2: {20,50,80}  factor=0.35 tileWidth=0.35 dotR=1.5+0.35*2.5=2.375
  // Auto-scroll: baseOx += t * factor * 12 * scale
  //              baseOy += t * factor * 6  * scale
  const LAYERS = [
    { col:'#1e1e3c', f:0.15, sp:0.6,  r:1.875 },
    { col:'#143250', f:0.35, sp:0.35, r:2.375 },
  ];

  function drawBG() {
    ctx.fillStyle = '#0f0f19';
    ctx.fillRect(0, 0, W, H);

    for (const L of LAYERS) {
      const spacing = ws(L.sp);
      if (spacing < 3) continue;
      // Shift with camera + auto-scroll (matches C++ formula)
      const ox = ((clock * L.f * 12 * scale - camX * scale * L.f) % spacing + spacing) % spacing;
      const oy = ((-clock * L.f * 6 * scale - camY * scale * L.f) % spacing + spacing) % spacing;
      ctx.fillStyle = L.col;
      for (let x = ox - spacing; x < W + spacing; x += spacing)
        for (let y = oy - spacing; y < H + spacing; y += spacing) {
          ctx.beginPath(); ctx.arc(x, y, L.r, 0, Math.PI * 2); ctx.fill();
        }
    }
  }

  function drawArena() {
    // Very subtle floor tint inside arena walls
    ctx.fillStyle = '#101018';
    ctx.fillRect(aX, aY, aW, aH);

    // Walls — {80,80,160} #5050a0, thickness ~7 world units
    const wt = Math.max(3, ws(6));
    ctx.fillStyle = '#5050a0';
    ctx.fillRect(aX - wt, aY - wt, aW + wt*2, wt); // top
    ctx.fillRect(aX - wt, aY + aH, aW + wt*2, wt); // bottom
    ctx.fillRect(aX - wt, aY, wt, aH);               // left
    ctx.fillRect(aX + aW, aY, wt, aH);               // right
  }

  // ── Player sprite — row chosen by colorIdx, rotated toward aim ─────────────
  // The C++ game draws one row with all 6 frames cycling at 5fps.
  // Row 0 has a slight left bias → sprite faces LEFT in its natural state.
  // C++ rotation=0 → aim right. Rotating a left-facing sprite by PI gives right-facing.
  // So: ctx.rotate(p.rotation + Math.PI) compensates the LEFT-facing base.
  function drawPlayer(p, isSelf) {
    if (!p.alive) return;
    const x  = wx(p.x), y = wy(p.y);
    const sz = P_SZ();              // matches C++ player width on screen

    const frame = (Math.floor(clock * ANIM_FPS) % SPR.cols);
    const row   = p.colorIdx % SPR.rows;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);
    // Sprite faces LEFT in row 0 → add PI to flip it right, then rotate toward aim
    ctx.rotate(p.rotation + Math.PI);

    if (p.hitFlash && (Date.now() / 65 | 0) % 2 === 0) ctx.globalAlpha = 0.3;

    // Draw the frame
    ctx.drawImage(SPR.img,
      frame * SPR.fw, row * SPR.fh, SPR.fw, SPR.fh,
      -sz/2, -sz/2, sz, sz);

    // Team colour tint (replaces C++ WHITE tint for multiplayer differentiation)
    if (p.colorIdx !== 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = 0.35;
      ctx.fillStyle   = TCOL[p.colorIdx % TCOL.length];
      ctx.fillRect(-sz/2, -sz/2, sz, sz);
    }
    ctx.restore();

    // Name tag
    const col = TCOL[p.colorIdx % TCOL.length];
    ctx.save();
    const fs = Math.max(9, ws(7.5));
    ctx.font         = `bold ${fs}px monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle    = col;
    ctx.fillText(p.name + (isSelf ? ' ◆' : ''), x, y - sz/2 - 3);
    ctx.restore();

    // HP bar (matches C++ top-left bar style but per-player)
    const bw = sz * 1.2, bh = 3;
    const bx = x - bw/2, by = y + sz/2 + 4;
    ctx.fillStyle = '#333';
    ctx.fillRect(bx, by, bw, bh);
    const pct = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = pct > 0.60 ? '#22cc44' : pct > 0.30 ? '#ccaa00' : '#cc2222';
    ctx.fillRect(bx, by, bw * pct, bh);
  }

  // ── Enemies — exact C++ DrawCircle ────────────────────────────────────────
  function drawEnemy(e) {
    const x = wx(e.x), y = wy(e.y);
    const r = e.type === C.TYPE.TANK ? TK_R() : CH_R();
    // Solid filled circle — exact C++ colours, no outline
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = e.type === C.TYPE.TANK ? '#8c28b4' : '#e63232';
    ctx.fill();
    // Show HP damage as a lighter inner circle (not in C++ but helps readability)
    if (e.hp < e.maxHp) {
      ctx.beginPath(); ctx.arc(x, y, r * (e.hp / e.maxHp), 0, Math.PI * 2);
      ctx.fillStyle = e.type === C.TYPE.TANK ? '#cc66ff' : '#ff8866';
      ctx.fill();
    }
  }

  // ── Projectile — exact C++ rotated rect {255,230,80} ─────────────────────
  function drawProjectile(p, players) {
    // Trail (cosmetic)
    let tr = trails.get(p.id);
    if (!tr) { tr = []; trails.set(p.id, tr); }
    tr.push({ x: wx(p.x), y: wy(p.y) });
    if (tr.length > 5) tr.shift();
    if (tr.length > 1) {
      ctx.save();
      for (let i = 1; i < tr.length; i++) {
        const a = i / tr.length;
        ctx.globalAlpha = a * 0.35;
        ctx.strokeStyle = '#ffe650';
        ctx.lineWidth   = PR_H() * a * 2;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(tr[i-1].x, tr[i-1].y);
        ctx.lineTo(tr[i].x,   tr[i].y);
        ctx.stroke();
      }
      ctx.restore();
    }
    // Core rect — exact {255,230,80}
    ctx.save();
    ctx.translate(wx(p.x), wy(p.y));
    ctx.rotate(p.rotation);
    ctx.fillStyle = '#ffe650';
    ctx.fillRect(-PR_W(), -PR_H(), PR_W()*2, PR_H()*2);
    ctx.restore();
  }

  // ── Pickup — exact C++ circle {50,220,80} ─────────────────────────────────
  function drawPickup(p) {
    const x = wx(p.x), y = wy(p.y);
    const r = PK_R() * (1 + Math.sin(clock * 3) * 0.1);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#32dc50';  // {50,220,80}
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - r*0.5, y - r*0.13, r, r*0.26);
    ctx.fillRect(x - r*0.13, y - r*0.5, r*0.26, r);
  }

  // ── Particles ─────────────────────────────────────────────────────────────
  function drawParticles(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.84;     p.vy *= 0.84;
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
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
    if (shakeMag > 0.2) {
      shakeX = (Math.random() - 0.5) * shakeMag;
      shakeY = (Math.random() - 0.5) * shakeMag;
      shakeMag *= Math.pow(0.04, dt);
    } else { shakeX = shakeY = shakeMag = 0; }
  }

  // ── HUD — mirrors C++ exactly ─────────────────────────────────────────────
  // C++ hud: HP bar top-left at (10,32). Wave/Kills/Time top-right at (sw-150, 10/34/58).
  function drawHUD(state, selfId, t0) {
    if (!state) return;
    const self = state.players && state.players.find(p => p.id === selfId);

    if (self) {
      // HP bar — top-left inside arena (mirrors C++)
      const bw = Math.min(200, aW * 0.27), bh = 14;
      const bx = aX + 10, by = aY + 10;
      const pct = Math.max(0, self.hp / self.maxHp);
      ctx.fillStyle = '#555';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = pct > 0.60 ? '#22cc44' : pct > 0.30 ? '#ccaa00' : '#cc2222';
      ctx.fillRect(bx, by, bw * pct, bh);
      ctx.fillStyle = '#ccc';
      ctx.font      = '11px monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`HP  ${Math.ceil(self.hp)} / ${self.maxHp}`, bx + bw + 8, by + bh/2);
    }

    // Wave / Kills / Time — top-right (exact C++ layout)
    const rx = aX + aW - 10;
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.font      = 'bold 16px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(`Wave  ${state.wave || 0}`, rx, aY + 8);
    ctx.fillStyle = '#fff';
    ctx.fillText(`Kills ${self ? self.kills || 0 : 0}`, rx, aY + 28);
    ctx.fillStyle = '#aaa';
    const secs = Math.floor((Date.now() - t0) / 1000);
    ctx.fillText(`${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`, rx, aY + 48);

    // Grace/next-wave countdown
    if (state.enemiesLeft === 0 && state.graceTimer > 0) {
      ctx.fillStyle = '#ffe650';
      ctx.font      = 'bold 13px monospace';
      ctx.fillText(`Next wave  ${state.graceTimer.toFixed(1)}s`, rx, aY + 68);
    }

    // Multi-player HP bars (bottom strip)
    if (state.players && state.players.length > 1) {
      const bw2 = 66, bh2 = 5, gap = 10;
      const total = state.players.length;
      const sx = W/2 - (total*(bw2+gap)-gap)/2;
      state.players.forEach((pl, i) => {
        const col = TCOL[pl.colorIdx % TCOL.length];
        const bx2 = sx + i*(bw2+gap), by2 = aY + aH + 8;
        ctx.font = '9px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = col;
        ctx.fillText(pl.name, bx2, by2);
        ctx.fillStyle = '#222';
        ctx.fillRect(bx2, by2 + 11, bw2, bh2);
        ctx.fillStyle = col;
        ctx.fillRect(bx2, by2 + 11, bw2 * Math.max(0, pl.hp/pl.maxHp), bh2);
      });
    }
  }

  // ── Game-over overlay — exact C++ text ────────────────────────────────────
  let goStats = null;
  function drawGameOver() {
    if (!goStats) return;
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // "GAME OVER" in RED — matches C++
    ctx.fillStyle = '#cc2222';
    ctx.font      = `bold ${Math.round(W * 0.055)}px monospace`;
    ctx.fillText('GAME OVER', W/2, H/2 - 60);
    // Stats line — matches C++
    ctx.fillStyle = '#fff';
    ctx.font      = 'bold 17px monospace';
    ctx.fillText(
      `Survived ${goStats.time}s  |  Wave ${goStats.wave}  |  Kills ${goStats.kills}`,
      W/2, H/2 + 10);
    ctx.fillStyle = '#999';
    ctx.font      = '14px monospace';
    ctx.fillText('Press PLAY AGAIN or click below', W/2, H/2 + 40);
  }

  // ── Main render ───────────────────────────────────────────────────────────
  let gameStartMs = Date.now();

  function render(state, selfId) {
    const now = performance.now();
    const dt  = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    clock += dt;

    // Smooth camera drift toward self player (CAM_LAG = 0.12 like C++)
    const self = state && state.players && state.players.find(p => p.id === selfId);
    if (self && self.alive) {
      const target = { x: self.x * 0.12, y: self.y * 0.12 };
      camX += (target.x - camX) * Math.min(1, dt * 10);
      camY += (target.y - camY) * Math.min(1, dt * 10);
    }

    // Apply camera to canvas origin + shake
    tickShake(dt);
    offX = baseOffX - camX * scale + shakeX;
    offY = baseOffY - camY * scale + shakeY;
    aX   = offX - aW/2;
    aY   = offY - aH/2;

    cleanTrails(state);
    drawBG();
    drawArena();

    if (state) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(aX - 1, aY - 1, aW + 2, aH + 2);
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
    drawGameOver();
  }

  return {
    render, handleEvent, resize,
    setStartTime(ms) { gameStartMs = ms; goStats = null; },
    setGameOver(s)   { goStats = s; },
    clearGameOver()  { goStats = null; },
    getScale()  { return scale; },
    getOffX()   { return offX; },
    getOffY()   { return offY; },
    canvasToWorld(cx, cy) { return { x:(cx-offX)/scale, y:(cy-offY)/scale }; },
  };
})();
