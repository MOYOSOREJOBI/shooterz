// Entry point — wire up menu buttons and kick off the app
(function () {
  let selectedMode = C.MODES.SOLO;

  // ── Mode selection ────────────────────────────────────────────────────────
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMode = btn.dataset.mode;
    });
  });

  // ── Play button ───────────────────────────────────────────────────────────
  document.getElementById('play-btn').addEventListener('click', () => {
    Audio.unlock();
    const name   = document.getElementById('name-input').value.trim().slice(0, 16) ||
                   C.AVATAR_NAMES[Math.floor(Math.random() * C.AVATAR_NAMES.length)];
    const roomId = document.getElementById('room-code-input').value.trim().toUpperCase() || null;
    Game.connect(name, selectedMode, roomId);
  });

  // ── Join by room code ─────────────────────────────────────────────────────
  document.getElementById('join-room-btn').addEventListener('click', () => {
    Audio.unlock();
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (!code) { alert('Enter a room ID first'); return; }
    const name = document.getElementById('name-input').value.trim().slice(0, 16) ||
                 C.AVATAR_NAMES[Math.floor(Math.random() * C.AVATAR_NAMES.length)];
    Game.connect(name, selectedMode, code);
  });

  // ── How to play ───────────────────────────────────────────────────────────
  document.getElementById('howto-btn').addEventListener('click', () => {
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('howto-screen').classList.remove('hidden');
  });
  document.getElementById('howto-back').addEventListener('click', () => UI.showMenu());

  // ── Leaderboard ───────────────────────────────────────────────────────────
  document.getElementById('lb-btn').addEventListener('click', () => {
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('lb-screen').classList.remove('hidden');
    Game.requestLeaderboard();
  });
  document.getElementById('lb-back').addEventListener('click', () => UI.showMenu());
  document.getElementById('lb-refresh').addEventListener('click', () => Game.requestLeaderboard());

  // ── Mute ──────────────────────────────────────────────────────────────────
  document.getElementById('mute-btn').addEventListener('click', () => {
    const muted = Audio.toggleMute();
    document.getElementById('mute-btn').textContent = muted ? '🔇' : '🔊';
  });

  // ── Random name on load ───────────────────────────────────────────────────
  if (!document.getElementById('name-input').value) {
    document.getElementById('name-input').placeholder =
      C.AVATAR_NAMES[Math.floor(Math.random() * C.AVATAR_NAMES.length)];
  }

  // ── Prevent double-tap zoom on mobile ────────────────────────────────────
  document.addEventListener('touchstart', e => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  // Allow canvas right-click (for mouse aiming)
  document.getElementById('game-canvas').addEventListener('contextmenu', e => e.preventDefault());

  // ── Also add POST handler for solo leaderboard submission ─────────────────
  // (Server side: add this route)
  UI.showMenu();
})();
