/**
 * Game client — socket management, client-side prediction, render loop
 *
 * Client prediction: player moves locally immediately (no wait for server).
 * Server state reconciles on next update. Other entities are interpolated.
 */
const Game = (() => {
  let socket      = null;
  let selfId      = null;
  let mode        = C.MODES.SOLO;
  let gameState   = null;
  let running     = false;
  let rafId       = null;
  let soloLogic   = null;

  // Client-side prediction state
  const localPlayer = { x:0, y:0, rotation:0, hp:100, kills:0, bulletsUsed:0, alive:true };
  let localFireTimer = 0;
  let localHitTimer  = 0;

  // Ping
  let pingStart = 0, pingMs = 0;

  // ── Connect & join ────────────────────────────────────────────────────────
  function connect(playerName, gameMode, joinRoomId) {
    mode = gameMode;
    document.getElementById('connecting').classList.remove('hidden');

    socket = io({ transports: ['websocket'], upgrade: false });

    socket.on('connect', () => {
      selfId = socket.id;
      document.getElementById('connecting').classList.add('hidden');
      socket.emit(C.EVT.JOIN, {
        mode: gameMode,
        name: playerName,
        roomId: joinRoomId || undefined,
      });
    });

    socket.on(C.EVT.ROOM_JOINED, data => {
      selfId = data.playerId;
      Renderer.setStartTime(Date.now());
      Renderer.clearGameOver();
      UI.onRoomJoined(data);
      startLoop();
    });

    socket.on(C.EVT.STATE, state => {
      // Reconcile local player with server
      const srv = state.players && state.players.find(p => p.id === selfId);
      if (srv) {
        // Soft-reconcile: blend local position toward server (hide latency)
        localPlayer.x        = localPlayer.x * 0.7 + srv.x * 0.3;
        localPlayer.y        = localPlayer.y * 0.7 + srv.y * 0.3;
        localPlayer.hp       = srv.hp;
        localPlayer.kills    = srv.kills || 0;
        localPlayer.alive    = srv.alive;
        localPlayer.rotation = srv.rotation;
        localPlayer.hitFlash = srv.hitFlash;
        localPlayer.colorIdx = srv.colorIdx;
        localPlayer.name     = srv.name;
        localPlayer.maxHp    = srv.maxHp;
        localPlayer.team     = srv.team;
        // Replace server player entry with local predicted data
        const idx = state.players.findIndex(p => p.id === selfId);
        if (idx !== -1) state.players[idx] = { ...state.players[idx], ...localPlayer, id: selfId };
      }
      gameState = state;
      UI.updateHUD(state, selfId);
    });

    socket.on(C.EVT.EVENT, evt => {
      Renderer.handleEvent(evt);
      UI.onGameEvent(evt, selfId);
    });

    socket.on(C.EVT.GAME_OVER, data => {
      const scores = data.scores || [];
      const me = scores.find(s => s.name === (localPlayer.name || ''));
      Renderer.setGameOver(me || scores[0]);
      UI.showGameOver(data);
    });

    socket.on(C.EVT.LEADERBOARD, lb => UI.renderLeaderboard(lb));
    socket.on(C.EVT.ROOM_LIST,   list => UI.renderRoomList(list));
    socket.on(C.EVT.PONG, () => {
      pingMs = Date.now() - pingStart;
      const el = document.getElementById('ping-display');
      if (el) el.textContent = pingMs + ' ms';
    });
    socket.on('player_joined', d => UI.onPlayerJoined(d));
    socket.on('player_left',   d => UI.onPlayerLeft(d));
    socket.on('connect_error', () => {
      document.getElementById('connecting').classList.add('hidden');
      if (mode === C.MODES.SOLO) _startSolo(playerName);
    });
    socket.on('error', d => {
      alert(d.msg || 'Server error');
      document.getElementById('connecting').classList.add('hidden');
      UI.showMenu();
    });

    setInterval(() => {
      if (socket && socket.connected) { pingStart = Date.now(); socket.emit(C.EVT.PING); }
    }, 3000);
  }

  // ── Offline solo ──────────────────────────────────────────────────────────
  function _startSolo(name) {
    selfId    = 'local';
    soloLogic = _makeSolo(name);
    Renderer.setStartTime(Date.now());
    UI.onRoomJoined({ roomId:'local', playerId:'local', mode:C.MODES.SOLO,
                      players:[{id:'local',name,colorIdx:0,team:0}], leaderboard:[] });
    startLoop();
  }

  // ── Render / input loop ───────────────────────────────────────────────────
  let lastSend = 0;
  const SEND_DT = 1000 / 30; // 30 Hz input

  function startLoop() {
    running = true;
    UI.showGame();

    function loop(ts) {
      if (!running) return;
      rafId = requestAnimationFrame(loop);

      const input = Input.getState(Renderer.getScale(), Renderer.getOffX(), Renderer.getOffY());

      // Client prediction — apply movement locally this frame
      if (!soloLogic) _predictLocal(input, 1/60);

      // Send input to server at 30 Hz
      if (socket && socket.connected && ts - lastSend > SEND_DT) {
        socket.emit(C.EVT.INPUT, input);
        lastSend = ts;
      }

      // Solo offline
      if (soloLogic) {
        soloLogic.update(1/60, input);
        gameState = soloLogic.getState();
        UI.updateHUD(gameState, selfId);
      }

      Renderer.render(gameState, selfId);
    }
    rafId = requestAnimationFrame(loop);
  }

  function _predictLocal(input, dt) {
    if (!localPlayer.alive) return;
    localFireTimer = Math.max(0, localFireTimer - dt);
    localHitTimer  = Math.max(0, localHitTimer  - dt);

    let mx = (input.right?1:0)-(input.left?1:0);
    let my = (input.down?1:0)-(input.up?1:0);
    const len = Math.hypot(mx, my) || 1;
    if (Math.hypot(mx, my) > 0.01) { mx /= len; my /= len; }

    localPlayer.x += mx * C.PLAYER_SPEED * dt;
    localPlayer.y += my * C.PLAYER_SPEED * dt;
    localPlayer.x = Math.max(-C.ARENA_HW + C.PLAYER_R, Math.min(C.ARENA_HW - C.PLAYER_R, localPlayer.x));
    localPlayer.y = Math.max(-C.ARENA_HH + C.PLAYER_R, Math.min(C.ARENA_HH - C.PLAYER_R, localPlayer.y));

    const adx = input.aimX - localPlayer.x, ady = input.aimY - localPlayer.y;
    if (Math.abs(adx) > 0.5 || Math.abs(ady) > 0.5)
      localPlayer.rotation = Math.atan2(ady, adx);

    // Reflect prediction in gameState
    if (gameState && gameState.players) {
      const idx = gameState.players.findIndex(p => p.id === selfId);
      if (idx !== -1) Object.assign(gameState.players[idx], { x: localPlayer.x, y: localPlayer.y, rotation: localPlayer.rotation });
    }
  }

  function stopLoop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function disconnect() {
    stopLoop();
    if (socket) { socket.disconnect(); socket = null; }
    soloLogic = null; gameState = null; selfId = null;
  }

  function requestLeaderboard() {
    if (socket && socket.connected) socket.emit(C.EVT.LEADERBOARD);
    else fetch('/api/leaderboard').then(r => r.json()).then(lb => UI.renderLeaderboard(lb));
  }

  function requestRoomList() {
    fetch('/api/rooms').then(r => r.json()).then(list => UI.renderRoomList(list)).catch(()=>{});
  }

  // ── Solo offline engine ───────────────────────────────────────────────────
  // Exact C++ mechanics: same HP values, speeds, damage, wave formula
  function _makeSolo(name) {
    const R   = C;
    const uid = () => Math.random().toString(36).slice(2, 9);
    const p = {
      id:'local', name, colorIdx:0, team:0, alive:true, hitFlash:false,
      x:0, y:0, vx:0, vy:0, rotation:0,
      hp:R.PLAYER_HP, maxHp:R.PLAYER_HP, hitTimer:0, fireTimer:0,
      kills:0, bulletsUsed:0, distanceTraveled:0, timeAlive:0,
    };
    const enemies  = new Map();
    const projs    = new Map();
    const pickups  = new Map();
    let wave=0, enemiesLeft=0, graceTimer=1.5, over=false;

    function rEdge() {
      const e=(Math.random()*4)|0;
      if(e===0) return{x:((Math.random()-0.5)*R.ARENA_W),y: R.ARENA_HH+30};
      if(e===1) return{x:((Math.random()-0.5)*R.ARENA_W),y:-R.ARENA_HH-30};
      if(e===2) return{x: R.ARENA_HW+30,y:((Math.random()-0.5)*R.ARENA_H)};
               return{x:-R.ARENA_HW-30,y:((Math.random()-0.5)*R.ARENA_H)};
    }

    function spawnWave() {
      wave++;
      const ch=3+wave*2, tk=wave>=2?wave-1:0;
      enemiesLeft=ch+tk;
      for(let i=0;i<ch;i++){const pos=rEdge();const id=uid();enemies.set(id,{id,type:R.TYPE.CHASER,x:pos.x,y:pos.y,r:R.CHASER_R,hp:R.CHASER_HP,maxHp:R.CHASER_HP,dead:false});}
      for(let i=0;i<tk;i++){const pos=rEdge();const id=uid();enemies.set(id,{id,type:R.TYPE.TANK,  x:pos.x,y:pos.y,r:R.TANK_R,  hp:R.TANK_HP,  maxHp:R.TANK_HP,  dead:false});}
      Renderer.handleEvent({type:'wave_start',wave});
    }

    function update(dt, input) {
      if (over || !p.alive) return;
      p.timeAlive += dt;
      p.hitTimer   = Math.max(0, p.hitTimer - dt);
      p.fireTimer  = Math.max(0, p.fireTimer - dt);
      p.hitFlash   = p.hitTimer > 0;

      let mx=(input.right?1:0)-(input.left?1:0), my=(input.down?1:0)-(input.up?1:0);
      const ml=Math.hypot(mx,my)||1; if(Math.hypot(mx,my)>0.01){mx/=ml;my/=ml;}
      const px=p.x, py=p.y;
      p.x=Math.max(-R.ARENA_HW+R.PLAYER_R,Math.min(R.ARENA_HW-R.PLAYER_R, p.x+mx*R.PLAYER_SPEED*dt));
      p.y=Math.max(-R.ARENA_HH+R.PLAYER_R,Math.min(R.ARENA_HH-R.PLAYER_R, p.y+my*R.PLAYER_SPEED*dt));
      p.distanceTraveled+=Math.hypot(p.x-px,p.y-py);
      const adx=input.aimX-p.x, ady=input.aimY-p.y;
      if(Math.abs(adx)>0.5||Math.abs(ady)>0.5) p.rotation=Math.atan2(ady,adx);

      if(input.shooting && p.fireTimer<=0 && (Math.abs(adx)>0.5||Math.abs(ady)>0.5)){
        const d=Math.hypot(adx,ady)||1;
        const id=uid();
        projs.set(id,{id,ownerId:'local',x:p.x,y:p.y,vx:(adx/d)*R.PROJ_SPEED,vy:(ady/d)*R.PROJ_SPEED,rotation:Math.atan2(ady,adx),life:1.4});
        p.fireTimer=R.FIRE_CD; p.bulletsUsed++;
        Renderer.handleEvent({type:'shoot',x:p.x,y:p.y});
      }

      for(const e of enemies.values()){
        if(e.dead) continue;
        const dx=p.x-e.x, dy=p.y-e.y, d=Math.hypot(dx,dy)||1;
        const spd=e.type===R.TYPE.TANK?R.TANK_SPEED:R.CHASER_SPEED;
        e.x+=dx/d*spd*dt; e.y+=dy/d*spd*dt;
        if(p.hitTimer<=0 && Math.hypot(p.x-e.x,p.y-e.y)<R.PLAYER_R+e.r){
          p.hp-=e.type===R.TYPE.TANK?R.TANK_DAMAGE:R.CHASER_DAMAGE;
          p.hitTimer=R.HIT_CD;
          Renderer.handleEvent({type:'hit',x:p.x,y:p.y,color:'#e63232'});
        }
      }

      for(const [id,pr] of projs){
        pr.x+=pr.vx*dt; pr.y+=pr.vy*dt; pr.life-=dt;
        if(pr.life<=0||Math.abs(pr.x)>R.ARENA_HW+60||Math.abs(pr.y)>R.ARENA_HH+60){projs.delete(id);continue;}
        let hit=false;
        for(const e of enemies.values()){
          if(e.dead||Math.hypot(pr.x-e.x,pr.y-e.y)>=e.r) continue;
          e.hp-=R.PROJ_DAMAGE_ENEMY;
          if(e.hp<=0){
            e.dead=true; enemiesLeft=Math.max(0,enemiesLeft-1); p.kills++;
            Renderer.handleEvent({type:'kill_enemy',x:e.x,y:e.y,color:e.type===R.TYPE.TANK?'#8c28b4':'#e63232'});
            if(Math.random()<R.PICKUP_CHANCE){const pid=uid();pickups.set(pid,{id:pid,x:e.x,y:e.y,life:8});}
          } else Renderer.handleEvent({type:'hit_enemy',x:e.x,y:e.y});
          hit=true; break;
        }
        if(hit) projs.delete(id);
      }

      for(const [id,pu] of pickups){
        pu.life-=dt;
        if(pu.life<=0){pickups.delete(id);continue;}
        if(Math.hypot(p.x-pu.x,p.y-pu.y)<R.PLAYER_R+R.PICKUP_R){
          p.hp=Math.min(p.hp+R.PICKUP_HEAL,p.maxHp);
          pickups.delete(id);
          Renderer.handleEvent({type:'pickup',x:pu.x,y:pu.y});
        }
      }

      if(enemiesLeft<=0){
        graceTimer-=dt;
        if(graceTimer<=0){spawnWave();graceTimer=R.WAVE_GRACE;}
      }

      if(p.hp<=0){
        p.alive=false; p.hp=0;
        Renderer.handleEvent({type:'player_death',x:p.x,y:p.y});
        const scoreData={name:p.name,kills:p.kills,wave,time:Math.floor(p.timeAlive),
                         bullets:p.bulletsUsed,distance:Math.floor(p.distanceTraveled),mode:R.MODES.SOLO};
        Renderer.setGameOver(scoreData);
        UI.showGameOver({scores:[scoreData],wave});
        fetch('/api/leaderboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...scoreData,ts:new Date().toISOString()})}).catch(()=>{});
        over=true;
      }
    }

    function getState() {
      return {
        players:[{...p}],
        enemies:[...enemies.values()].filter(e=>!e.dead),
        projs:  [...projs.values()],
        pickups:[...pickups.values()],
        wave, graceTimer:Math.max(0,graceTimer), enemiesLeft,
      };
    }
    return {update,getState};
  }

  return { connect, startSolo: _startSolo, disconnect, requestLeaderboard, requestRoomList };
})();
