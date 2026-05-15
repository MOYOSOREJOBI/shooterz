// UI — menus, HUD, overlays, leaderboard
const UI = (() => {
  let selfId   = null;
  let selfData = null;
  let gameStartTime = 0;

  // ── Screen management ─────────────────────────────────────────────────────
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
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('mobile-controls').style.display = 'none';
  }

  function showGame() {
    hideAll();
    document.getElementById('hud').classList.remove('hidden');
    gameStartTime = Date.now();
    // Show mobile controls on touch devices
    if ('ontouchstart' in window) {
      document.getElementById('mobile-controls').style.display = 'flex';
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  function updateHUD(state, myId) {
    selfId = myId;
    if (!state) return;

    const self = state.players && state.players.find(p => p.id === myId);
    selfData = self;

    // Wave badge
    document.getElementById('wave-badge').textContent = `WAVE ${state.wave || 0}`;

    // Grace timer
    const gb = document.getElementById('grace-badge');
    if (state.enemiesLeft === 0 && state.graceTimer > 0) {
      gb.style.display = 'block';
      gb.textContent   = `NEXT WAVE ${state.graceTimer.toFixed(1)}s`;
    } else {
      gb.style.display = 'none';
    }

    // Stats
    if (self) {
      const secs = Math.floor((Date.now() - gameStartTime) / 1000);
      const mm   = Math.floor(secs / 60).toString().padStart(2, '0');
      const ss   = (secs % 60).toString().padStart(2, '0');
      document.getElementById('stat-kills').textContent   = `${self.kills || 0} kills`;
      document.getElementById('stat-time').textContent    = `${mm}:${ss}`;
      document.getElementById('stat-bullets').textContent = `${(self.bulletsUsed || 0)} bullets`;
    }

    // Player bars
    const pb = document.getElementById('hud-players');
    pb.innerHTML = '';
    if (state.players) {
      state.players.forEach(p => {
        const col = C.TEAM_GLOW[p.colorIdx % C.TEAM_GLOW.length];
        const div = document.createElement('div');
        div.className = 'player-bar';
        div.innerHTML = `
          <div class="player-bar-name" style="color:${col}">${p.name}${p.id === myId ? ' (you)' : ''}</div>
          <div class="player-bar-hp-wrap">
            <div class="player-bar-hp" style="width:${Math.max(0,(p.hp/p.maxHp)*100).toFixed(1)}%;background:${col}"></div>
          </div>`;
        pb.appendChild(div);
      });
    }
  }

  // ── Room joined ───────────────────────────────────────────────────────────
  function onRoomJoined(data) {
    selfId = data.playerId;
    if (data.leaderboard && data.leaderboard.length) renderLeaderboard(data.leaderboard);
    if (data.mode !== C.MODES.SOLO && data.players.length < maxPlayersForMode(data.mode)) {
      // Show lobby wait overlay
      document.getElementById('overlay').classList.remove('hidden');
      document.getElementById('overlay-title').textContent = 'Waiting for players...';
      document.getElementById('overlay-title').className   = 'overlay-title info';
      document.getElementById('overlay-body').innerHTML    = `
        <p style="color:#8899bb;margin:.5rem 0">Room Code:</p>
        <div style="display:flex;align-items:center;justify-content:center;gap:.6rem;margin:.4rem 0">
          <span id="room-code-display" style="font-size:1.8rem;font-weight:900;color:#00d4ff;letter-spacing:.2em;background:#0d1a2a;padding:.3rem .9rem;border-radius:8px;border:1px solid #00d4ff44">${data.roomId}</span>
          <button class="btn btn-secondary" style="padding:.4rem .8rem;font-size:.8rem" onclick="navigator.clipboard&&navigator.clipboard.writeText('${data.roomId}').then(()=>this.textContent='Copied!').catch(()=>{})">Copy</button>
        </div>
        <p style="color:#556;font-size:.82rem;margin-bottom:.5rem">Share this code — friends enter it in the Room ID field on the menu</p>
        <p style="color:#8899bb">${data.players.length} / ${maxPlayersForMode(data.mode)} players joined</p>`;
      document.getElementById('overlay-btns').innerHTML = `<button class="btn btn-danger" onclick="UI.leaveGame()">Leave</button>`;
    }
  }

  function onPlayerJoined(data) {
    const ob = document.getElementById('overlay');
    if (!ob.classList.contains('hidden')) {
      // Update lobby count — just hide if full
      ob.classList.add('hidden');
    }
  }

  function onPlayerLeft(data) {}

  function onGameEvent(evt) {
    if (evt.type === 'wave_start') {
      flashMessage(`WAVE ${evt.wave}`, '#00d4ff');
    }
    if (evt.type === 'player_death' && evt.id === selfId) {
      flashMessage('YOU DIED', '#ff4455');
    }
  }

  function flashMessage(text, color) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);
      font-size:clamp(1.8rem,6vw,3.5rem);font-weight:900;color:${color};
      text-shadow:0 0 30px ${color};pointer-events:none;z-index:9;
      animation:fadeOut 1.5s forwards`;
    document.body.appendChild(el);
    if (!document.querySelector('#fade-style')) {
      const s = document.createElement('style');
      s.id = 'fade-style';
      s.textContent = '@keyframes fadeOut{0%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-70%) scale(1.3)}}';
      document.head.appendChild(s);
    }
    setTimeout(() => el.remove(), 1600);
  }

  // ── Game Over ─────────────────────────────────────────────────────────────
  function showGameOver(data) {
    const scores  = data.scores || [];
    const winner  = scores.reduce((a, b) => (b.kills > a.kills ? b : a), scores[0] || {});
    const isSelf  = winner && winner.name === (selfData && selfData.name);

    document.getElementById('overlay').classList.remove('hidden');
    const title = document.getElementById('overlay-title');
    // Show pixel gameover sprite
    title.innerHTML = `<canvas id="go-canvas" width="273" height="33" style="image-rendering:pixelated;max-width:80vw"></canvas>`;
    title.className = 'overlay-title lose';
    setTimeout(() => {
      const gc = document.getElementById('go-canvas');
      if (gc && Sprites && Sprites.gameover) {
        const gctx = gc.getContext('2d');
        gctx.imageSmoothingEnabled = false;
        gctx.drawImage(Sprites.gameover, 0, 0, 273, 33);
      }
    }, 30);

    const rows = scores.map(s => `<tr>
      <td>${s.name}</td><td>${s.wave || data.wave || 0}</td>
      <td>${s.kills}</td><td>${s.time}s</td><td>${s.bullets || 0}</td><td>${s.distance || 0}px</td>
    </tr>`).join('');

    document.getElementById('overlay-body').innerHTML = `
      <table class="score-table">
        <thead><tr><th>Name</th><th>Wave</th><th>Kills</th><th>Time</th><th>Bullets</th><th>Dist</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

    document.getElementById('overlay-btns').innerHTML = `
      <button class="btn btn-primary" onclick="UI.playAgain()">Play Again</button>
      <button class="btn btn-secondary" onclick="UI.leaveGame()">Main Menu</button>`;
  }

  function playAgain() {
    Game.disconnect();
    document.getElementById('overlay').classList.add('hidden');
    // Re-join with same settings
    const name = document.getElementById('name-input').value.trim() || 'Player';
    const mode = document.querySelector('.mode-btn.active')?.dataset.mode || 'solo';
    Game.connect(name, mode, null);
  }

  function leaveGame() {
    Game.disconnect();
    showMenu();
  }

  // ── Leaderboard ───────────────────────────────────────────────────────────
  function renderLeaderboard(lb) {
    const tbody = document.getElementById('lb-body');
    if (!tbody) return;
    if (!lb || lb.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="color:#445;text-align:center">No scores yet</td></tr>';
      return;
    }
    tbody.innerHTML = lb.map((s, i) => `<tr>
      <td>${i + 1}</td>
      <td>${escHtml(s.name)}</td>
      <td>${s.wave}</td>
      <td>${s.kills}</td>
      <td>${s.time}s</td>
      <td>${s.mode || 'solo'}</td>
    </tr>`).join('');
  }

  function renderRoomList(list) {}

  function maxPlayersForMode(m) {
    if (m === C.MODES.SOLO) return 1;
    if (m === C.MODES.V1V1 || m === C.MODES.COOP) return 2;
    if (m === C.MODES.V1V1V1) return 3;
    return 4;
  }

  function escHtml(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return {
    showMenu, showGame, hideAll,
    updateHUD, onRoomJoined, onPlayerJoined, onPlayerLeft, onGameEvent,
    showGameOver, renderLeaderboard, renderRoomList,
    playAgain, leaveGame, flashMessage,
  };
})();
