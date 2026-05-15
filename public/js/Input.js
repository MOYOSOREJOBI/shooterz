// Keyboard + mouse + touch input handler
const Input = (() => {
  const keys = {};
  let mouseX = 0, mouseY = 0;    // canvas coords
  let worldX = 0, worldY = 0;    // world coords (set by Game)
  let shooting = false;
  let mouseDown = false;

  // Joystick state (mobile)
  const joystick = { active: false, baseX: 0, baseY: 0, dx: 0, dy: 0 };
  const shootTouch = { active: false, aimX: 0, aimY: 0 };

  // Normalise key names
  function key(e) {
    const map = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
      Space: 'space',
    };
    return map[e.code] || null;
  }

  document.addEventListener('keydown', e => {
    const k = key(e);
    if (k) { keys[k] = true; e.preventDefault(); }
  });
  document.addEventListener('keyup', e => {
    const k = key(e);
    if (k) keys[k] = false;
  });

  // Mouse
  const canvas = document.getElementById('game-canvas');
  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    mouseX = e.clientX - r.left;
    mouseY = e.clientY - r.top;
    // Auto-shoot whenever mouse moves on canvas (aim = shoot on desktop)
    if (mouseDown) shooting = true;
  });
  canvas.addEventListener('mousedown', e => {
    if (e.button === 0) { mouseDown = true; shooting = true; Audio.unlock(); }
  });
  canvas.addEventListener('mouseup', e => {
    if (e.button === 0) { mouseDown = false; shooting = false; }
  });
  // Also shoot on right click (aim right-click)
  canvas.addEventListener('mousedown', e => {
    if (e.button === 2) { shooting = true; }
  });
  canvas.addEventListener('mouseup', e => {
    if (e.button === 2) { shooting = false; }
  });
  document.addEventListener('mouseleave', () => { mouseDown = false; shooting = false; });

  // Touch — joystick zone (left half), shoot zone (right half)
  const joyZone   = document.getElementById('joystick-zone');
  const shootZone = document.getElementById('shoot-zone');
  const joyBase   = document.getElementById('joystick-base');
  const joyKnob   = document.getElementById('joystick-knob');

  const MAX_JOY = 36;

  function onJoyStart(e) {
    Audio.unlock();
    const t = e.changedTouches[0];
    joystick.active = true;
    joystick.baseX  = t.clientX;
    joystick.baseY  = t.clientY;
    joystick.dx = joystick.dy = 0;
    joyBase.style.display = 'block';
    joyKnob.style.display = 'block';
    joyBase.style.left = (t.clientX - 45) + 'px';
    joyBase.style.top  = (t.clientY - 45) + 'px';
    joyKnob.style.left = (t.clientX - 20) + 'px';
    joyKnob.style.top  = (t.clientY - 20) + 'px';
    e.preventDefault();
  }
  function onJoyMove(e) {
    if (!joystick.active) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - joystick.baseX;
    const dy = t.clientY - joystick.baseY;
    const d  = Math.hypot(dx, dy);
    const cx = d > MAX_JOY ? (dx / d) * MAX_JOY : dx;
    const cy = d > MAX_JOY ? (dy / d) * MAX_JOY : dy;
    joystick.dx = cx / MAX_JOY;
    joystick.dy = cy / MAX_JOY;
    joyKnob.style.left = (joystick.baseX + cx - 20) + 'px';
    joyKnob.style.top  = (joystick.baseY + cy - 20) + 'px';
    e.preventDefault();
  }
  function onJoyEnd(e) {
    joystick.active = false;
    joystick.dx = joystick.dy = 0;
    joyBase.style.display = 'none';
    joyKnob.style.display = 'none';
    e.preventDefault();
  }

  function onShootStart(e) {
    Audio.unlock();
    const t = e.changedTouches[0];
    const r = canvas.getBoundingClientRect();
    shootTouch.active = true;
    shootTouch.aimX   = t.clientX - r.left;
    shootTouch.aimY   = t.clientY - r.top;
    shooting = true;
    e.preventDefault();
  }
  function onShootMove(e) {
    if (!shootTouch.active) return;
    const t = e.changedTouches[0];
    const r = canvas.getBoundingClientRect();
    shootTouch.aimX = t.clientX - r.left;
    shootTouch.aimY = t.clientY - r.top;
    e.preventDefault();
  }
  function onShootEnd(e) {
    shootTouch.active = false;
    shooting = false;
    e.preventDefault();
  }

  joyZone.addEventListener('touchstart',  onJoyStart,   { passive: false });
  joyZone.addEventListener('touchmove',   onJoyMove,    { passive: false });
  joyZone.addEventListener('touchend',    onJoyEnd,     { passive: false });
  joyZone.addEventListener('touchcancel', onJoyEnd,     { passive: false });
  shootZone.addEventListener('touchstart',  onShootStart, { passive: false });
  shootZone.addEventListener('touchmove',   onShootMove,  { passive: false });
  shootZone.addEventListener('touchend',    onShootEnd,   { passive: false });
  shootZone.addEventListener('touchcancel', onShootEnd,   { passive: false });

  return {
    // Returns current input state for server transmission
    getState(playerX, playerY, scale, offX, offY) {
      // Convert mouse canvas coords to world coords
      const mx = (mouseX - offX) / scale;
      const my = (mouseY - offY) / scale;

      let aimWorldX = mx, aimWorldY = my;
      // Mobile: use shoot-touch canvas coord
      if (shootTouch.active) {
        aimWorldX = (shootTouch.aimX - offX) / scale;
        aimWorldY = (shootTouch.aimY - offY) / scale;
      }

      // Joystick or keyboard
      const jLeft  = joystick.dx < -0.15;
      const jRight = joystick.dx >  0.15;
      const jUp    = joystick.dy < -0.15;
      const jDown  = joystick.dy >  0.15;

      return {
        left:  !!(keys.left  || jLeft),
        right: !!(keys.right || jRight),
        up:    !!(keys.up    || jUp),
        down:  !!(keys.down  || jDown),
        aimX:  aimWorldX,
        aimY:  aimWorldY,
        shooting: !!(shooting || mouseDown || shootTouch.active),
      };
    },

    getMouseCanvas() { return { x: mouseX, y: mouseY }; },
    setWorldMouse(x, y) { worldX = x; worldY = y; },
  };
})();
