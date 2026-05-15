// Input — keyboard + mouse + touch
// Desktop: ARROW / WASD = move. POINTER ON CANVAS = aim & auto-shoot.
// Mobile:  Left side joystick = move. Right side finger = aim & shoot.
const Input = (() => {
  const keys = {};
  let mouseX = 0, mouseY = 0;
  let mouseOnCanvas = false; // true = auto-shooting toward cursor

  // Joystick (mobile)
  const joy = { active: false, baseX: 0, baseY: 0, dx: 0, dy: 0 };
  // Right-side touch aim
  const aim = { active: false, x: 0, y: 0 };

  const KEY_MAP = {
    ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down',
    KeyA:'left', KeyD:'right', KeyW:'up', KeyS:'down',
  };

  document.addEventListener('keydown', e => {
    const k = KEY_MAP[e.code];
    if (k) { keys[k] = true; e.preventDefault(); }
  });
  document.addEventListener('keyup', e => {
    const k = KEY_MAP[e.code];
    if (k) keys[k] = false;
  });

  // ── Mouse ─────────────────────────────────────────────────────────────────
  const canvas = document.getElementById('game-canvas');

  canvas.addEventListener('mouseenter', () => { mouseOnCanvas = true; Audio.unlock(); });
  canvas.addEventListener('mouseleave', () => { mouseOnCanvas = false; });
  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    mouseX = e.clientX - r.left;
    mouseY = e.clientY - r.top;
  });
  // Click also triggers unlock (for iOS audio)
  canvas.addEventListener('click', () => Audio.unlock());
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ── Mobile touch — left half = joystick, right half = aim/shoot ──────────
  const joyZone   = document.getElementById('joystick-zone');
  const shootZone = document.getElementById('shoot-zone');
  const joyBase   = document.getElementById('joystick-base');
  const joyKnob   = document.getElementById('joystick-knob');
  const MAX_JOY   = 38;

  function joyStart(e) {
    Audio.unlock();
    const t = e.changedTouches[0];
    joy.active = true; joy.baseX = t.clientX; joy.baseY = t.clientY;
    joy.dx = joy.dy = 0;
    joyBase.style.cssText = `display:block;left:${t.clientX-45}px;top:${t.clientY-45}px`;
    joyKnob.style.cssText = `display:block;left:${t.clientX-20}px;top:${t.clientY-20}px`;
    e.preventDefault();
  }
  function joyMove(e) {
    if (!joy.active) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - joy.baseX, dy = t.clientY - joy.baseY;
    const d  = Math.hypot(dx, dy);
    const cx = d > MAX_JOY ? dx/d*MAX_JOY : dx;
    const cy = d > MAX_JOY ? dy/d*MAX_JOY : dy;
    joy.dx = cx / MAX_JOY; joy.dy = cy / MAX_JOY;
    joyKnob.style.left = (joy.baseX + cx - 20) + 'px';
    joyKnob.style.top  = (joy.baseY + cy - 20) + 'px';
    e.preventDefault();
  }
  function joyEnd(e) {
    joy.active = false; joy.dx = joy.dy = 0;
    joyBase.style.display = 'none'; joyKnob.style.display = 'none';
    e.preventDefault();
  }

  function aimStart(e) {
    Audio.unlock();
    const t = e.changedTouches[0];
    const r = canvas.getBoundingClientRect();
    aim.active = true;
    aim.x = t.clientX - r.left;
    aim.y = t.clientY - r.top;
    e.preventDefault();
  }
  function aimMove(e) {
    if (!aim.active) return;
    const t = e.changedTouches[0];
    const r = canvas.getBoundingClientRect();
    aim.x = t.clientX - r.left;
    aim.y = t.clientY - r.top;
    e.preventDefault();
  }
  function aimEnd(e) { aim.active = false; e.preventDefault(); }

  joyZone.addEventListener('touchstart',  joyStart, { passive:false });
  joyZone.addEventListener('touchmove',   joyMove,  { passive:false });
  joyZone.addEventListener('touchend',    joyEnd,   { passive:false });
  joyZone.addEventListener('touchcancel', joyEnd,   { passive:false });
  shootZone.addEventListener('touchstart',  aimStart, { passive:false });
  shootZone.addEventListener('touchmove',   aimMove,  { passive:false });
  shootZone.addEventListener('touchend',    aimEnd,   { passive:false });
  shootZone.addEventListener('touchcancel', aimEnd,   { passive:false });

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    getState(scale, offX, offY) {
      // Convert canvas mouse coords → world coords
      const aimWorldX = (mouseX - offX) / scale;
      const aimWorldY = (mouseY - offY) / scale;

      // Mobile aim world coords
      const mAimX = (aim.x - offX) / scale;
      const mAimY = (aim.y - offY) / scale;

      return {
        left:    !!(keys.left  || joy.dx < -0.15),
        right:   !!(keys.right || joy.dx >  0.15),
        up:      !!(keys.up    || joy.dy < -0.15),
        down:    !!(keys.down  || joy.dy >  0.15),
        // World coords of aim point
        aimX:    aim.active ? mAimX : aimWorldX,
        aimY:    aim.active ? mAimY : aimWorldY,
        // Shoot = pointer on canvas (desktop) OR finger on right side (mobile)
        shooting: !!(mouseOnCanvas || aim.active),
      };
    },
  };
})();
