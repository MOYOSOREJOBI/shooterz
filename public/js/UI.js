const UI = (() => {
  let selfId = null, selfData = null, gameStartTime = 0;

  function hideAll() {
    ['menu-screen','howto-screen','lb-screen'].forEach(id => {
      document.getElementById(id).classList.add('hidden');
    });
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
  }

  function showMenu() {
    hideAll();
    document.getElementById('menu-screen').classList.remove('hidden');
    document.getElementById('mute-btn').classList.add('hidden');
    document.getElementById('ping-display').classList.add('hidden');
    document.getElementById('mobile-controls').style.display = 'none';
    Renderer.clearGameOver && Renderer.clearGameOver();
    Game.requestRoomList();
  }

  function showGame() {
    hideAll();
    document.getElementById('mute-btn').classList.remove('hidden');
    document.getElementById('ping-display').classList.remove('hidden');
    gameStartTime = Date.now();
    if ('ontouchstart' in window) document.getElementById('mobile-controls').style.display = 'flex';
  }

  // ── Room joined ────────────────────────────────────────────────────────────
  function onRoomJoined(data) {
    selfId = data.playerId;
    if (data.leaderboard && data.leaderboard.length) renderLeaderboard(data.leaderboard);
    const maxP = { solo:1, coop:4, '1v1':2, '2v2':4, '1v1v1':3, '1v1v1v1':4 }[data.mode] || 1;
    const waitingForMore = data.mode !== 'solo' && data.players.length < maxP;
    if (waitingForMore) _showLobby(data, maxP);
  }

  function _showLobby(data, maxP) {
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('overlay-title').textContent = 'Waiting for players…';
    document.getElementById('overlay-title').className   = 'otitle info';
    document.getElementById('overlay-body').innerHTML = `
      <p style="color:#8899bb;margin:.4rem 0">Room: <b id="lobby-code" style="color:var(--accent);letter-spacing:.18em;font-family:monospace">${data.roomId}</b>
        <button class="btn-sm" style="margin-left:.5rem;padding:.2rem .5rem" onclick="navigator.clipboard&&navigator.clipboard.writeText('${data.roomId}').then(()=>this.textContent='✓').catch(()=>{})">Copy</button>
      </p>
      <p style="color:#556;font-size:.8rem">Share the Room ID so friends can join</p>
      <p style="color:#8899bb;margin-top:.5rem" id="lobby-count">${data.players.length} / ${maxP} joined</p>`;
    document.getElementById('overlay-btns').innerHTML = `<button class="btn-danger" onclick="UI.leaveGame()">Leave</button>`;
  }

  function onPlayerJoined(d) {
    const lc = document.getElementById('lobby-count');
    if (lc) { document.getElementById('overlay').classList.add('hidden'); }
  }
  function onPlayerLeft(d) {}

  // ── HUD ────────────────────────────────────────────────────────────────────
  function updateHUD(state, myId) {
    selfId = myId;
    const self = state && state.players && state.players.find(p => p.id === myId);
    selfData = self || selfData;
  }

  // ── Game events ────────────────────────────────────────────────────────────
  function onGameEvent(evt, myId) {
    if (evt.type === 'wave_start') _flash(`WAVE ${evt.wave}`, '#00c8ff');
    if (evt.type === 'player_death' && evt.id === myId) _flash('YOU DIED', '#e63232');
  }

  function _flash(text, color) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `position:fixed;top:38%;left:50%;transform:translate(-50%,-50%);
      font-size:clamp(1.8rem,6vw,3.5rem);font-weight:900;color:${color};letter-spacing:.06em;
      text-shadow:0 0 30px ${color};pointer-events:none;z-index:9;
      animation:flash 1.4s forwards`;
    if (!document.getElementById('flash-style')) {
      const s = document.createElement('style');
      s.id = 'flash-style';
      s.textContent = '@keyframes flash{0%{opacity:1;transform:translate(-50%,-50%)scale(1.1)}100%{opacity:0;transform:translate(-50%,-65%)scale(1.3)}}';
      document.head.appendChild(s);
    }
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  // ── Game over ──────────────────────────────────────────────────────────────
  function showGameOver(data) {
    const scores = data.scores || [];
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('overlay-title').textContent = 'GAME OVER';
    document.getElementById('overlay-title').className   = 'otitle lose';
    const rows = scores.map(s => `<tr>
      <td>${esc(s.name)}</td><td>${s.wave||0}</td><td>${s.kills||0}</td>
      <td>${s.time||0}s</td><td>${s.bullets||0}</td><td>${s.distance||0}px</td>
    </tr>`).join('');
    document.getElementById('overlay-body').innerHTML = `
      <table class="score-table">
        <thead><tr><th>Name</th><th>Wave</th><th>Kills</th><th>Time</th><th>Bullets</th><th>Dist</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" style="color:#445">-</td></tr>'}</tbody>
      </table>`;
    document.getElementById('overlay-btns').innerHTML = `
      <button class="btn btn-primary" onclick="UI.playAgain()">Play Again</button>
      <button class="btn-sm" onclick="UI.leaveGame()">Menu</button>`;
  }

  function playAgain() {
    Game.disconnect();
    document.getElementById('overlay').classList.add('hidden');
    const name = document.getElementById('name-input').value.trim() ||
                 C.AVATAR_NAMES[Math.floor(Math.random()*C.AVATAR_NAMES.length)];
    const modeEl = document.querySelector('.mode-btn.active');
    Game.connect(name, modeEl ? modeEl.dataset.mode : 'solo', null);
  }

  function leaveGame() {
    Game.disconnect();
    showMenu();
  }

  // ── Leaderboard ────────────────────────────────────────────────────────────
  function renderLeaderboard(lb) {
    const el = document.getElementById('lb-body');
    if (!el) return;
    if (!lb || !lb.length) {
      el.innerHTML = '<tr><td colspan="7" style="color:#445;text-align:center">No scores yet</td></tr>';
      return;
    }
    el.innerHTML = lb.map((s,i) => `<tr>
      <td>${i+1}</td><td>${esc(s.name)}</td><td>${s.wave}</td><td>${s.kills}</td>
      <td>${s.time}s</td><td>${s.bullets||0}</td><td>${s.mode||'solo'}</td>
    </tr>`).join('');
  }

  // ── Room browser ───────────────────────────────────────────────────────────
  function renderRoomList(list) {
    const el = document.getElementById('room-list');
    if (!el) return;
    if (!list || !list.length) {
      el.innerHTML = '<div style="color:#445;font-size:.8rem;padding:.3rem">No open rooms — press PLAY to start one</div>';
      return;
    }
    el.innerHTML = list.map(r => `
      <div class="room-item" onclick="UI.quickJoin('${r.id}','${r.mode}')">
        <span class="ri-code">${r.id}</span>
        <span class="ri-info">${r.mode} · ${r.players}/${r.maxPlayers} · Wave ${r.wave}</span>
        <span class="btn-sm" style="font-size:.75rem;padding:.2rem .5rem">Join →</span>
      </div>`).join('');
  }

  function quickJoin(roomId, mode) {
    const name = document.getElementById('name-input').value.trim() ||
                 C.AVATAR_NAMES[Math.floor(Math.random()*C.AVATAR_NAMES.length)];
    // Set mode button
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    Game.connect(name, mode, roomId);
  }

  function esc(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return {
    showMenu, showGame, hideAll,
    updateHUD, onRoomJoined, onPlayerJoined, onPlayerLeft, onGameEvent,
    showGameOver, renderLeaderboard, renderRoomList, quickJoin,
    playAgain, leaveGame,
  };
})();
