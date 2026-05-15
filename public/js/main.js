(function () {
  let selectedMode = C.MODES.SOLO;

  // Draw pixel-art title sprite on menu canvas
  function drawTitle() {
    const tc = document.getElementById('title-canvas');
    if (!tc) return;
    const g = tc.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0f0f19';
    g.fillRect(0, 0, tc.width, tc.height);
    const draw = () => g.drawImage(GameSprites.playerRun.img,
      0, 0, 32, 32,          // first frame of player sprite as icon
      10, 30, 64, 64);
    // Also try to draw a "SHOOTERZ" text since we don't have an explicit title sprite
    g.font = 'bold 52px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const grad = g.createLinearGradient(0, 0, 350, 0);
    grad.addColorStop(0,   '#00c8ff');
    grad.addColorStop(0.5, '#a855f7');
    grad.addColorStop(1,   '#e63232');
    g.fillStyle = grad;
    g.fillText('SHOOTERZ', 175, 55);
    if (GameSprites.playerRun.img.complete) draw();
    else GameSprites.playerRun.img.onload = draw;
  }
  drawTitle();

  // Mode select
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMode = btn.dataset.mode;
    });
  });

  // Play button
  document.getElementById('play-btn').addEventListener('click', () => {
    Audio.unlock();
    const name = _name();
    const code = document.getElementById('room-code-input').value.trim().toUpperCase() || null;
    Game.connect(name, selectedMode, code);
  });

  // Join by code
  document.getElementById('join-room-btn').addEventListener('click', () => {
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (!code) { alert('Enter a Room ID first'); return; }
    Audio.unlock();
    Game.connect(_name(), selectedMode, code);
  });

  // Refresh rooms
  document.getElementById('refresh-rooms').addEventListener('click', () => {
    Game.requestRoomList();
  });

  // How to play
  document.getElementById('howto-btn').addEventListener('click', () => {
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('howto-screen').classList.remove('hidden');
  });
  document.getElementById('howto-back').addEventListener('click', () => UI.showMenu());

  // Leaderboard
  document.getElementById('lb-btn').addEventListener('click', () => {
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('lb-screen').classList.remove('hidden');
    Game.requestLeaderboard();
  });
  document.getElementById('lb-back').addEventListener('click', () => UI.showMenu());
  document.getElementById('lb-refresh').addEventListener('click', () => Game.requestLeaderboard());

  // Mute
  document.getElementById('mute-btn').addEventListener('click', () => {
    document.getElementById('mute-btn').textContent = Audio.toggleMute() ? '🔇' : '🔊';
  });

  // Prevent zoom/scroll on touch
  document.addEventListener('touchstart', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive:false });
  document.getElementById('game-canvas').addEventListener('contextmenu', e => e.preventDefault());

  // Auto-load room list
  setTimeout(() => Game.requestRoomList(), 500);

  // Default placeholder name
  document.getElementById('name-input').placeholder =
    C.AVATAR_NAMES[Math.floor(Math.random() * C.AVATAR_NAMES.length)];

  UI.showMenu();

  function _name() {
    return (document.getElementById('name-input').value.trim().slice(0,16)) ||
           C.AVATAR_NAMES[Math.floor(Math.random()*C.AVATAR_NAMES.length)];
  }
})();
