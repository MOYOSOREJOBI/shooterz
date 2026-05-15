// Web Audio API sound engine — no external files needed
const Audio = (() => {
  let ctx = null;
  let muted = false;
  let masterGain = null;

  function _ctx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.4;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noise(duration, freq, type = 'square', vol = 0.3, decay = 0.1) {
    if (muted) return;
    try {
      const c = _ctx();
      const osc = c.createOscillator();
      const g   = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, c.currentTime + duration);
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + decay);
      osc.connect(g); g.connect(masterGain);
      osc.start(); osc.stop(c.currentTime + decay + 0.01);
    } catch (_) {}
  }

  function burst(freq = 800, vol = 0.25) {
    if (muted) return;
    try {
      const c = _ctx();
      const buf = c.createBuffer(1, c.sampleRate * 0.08, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = c.createBufferSource();
      const g   = c.createGain();
      const flt = c.createBiquadFilter();
      flt.type = 'bandpass'; flt.frequency.value = freq; flt.Q.value = 0.5;
      src.buffer = buf;
      src.connect(flt); flt.connect(g); g.connect(masterGain);
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
      src.start();
    } catch (_) {}
  }

  return {
    shoot()    { noise(0.08, 900, 'sawtooth', 0.2, 0.08); },
    hit()      { burst(300, 0.35); },
    hitPlayer(){ burst(600, 0.3); },
    death()    { burst(120, 0.6); noise(0.4, 60, 'sine', 0.5, 0.5); },
    pickup()   { noise(0.15, 1200, 'sine', 0.3, 0.2); noise(0.1, 1800, 'sine', 0.2, 0.15); },
    waveStart(){ noise(0.5, 200, 'sawtooth', 0.25, 0.5); },
    killEnemy(){ burst(400, 0.28); },

    toggleMute() {
      muted = !muted;
      if (masterGain) masterGain.gain.value = muted ? 0 : 0.4;
      return muted;
    },
    isMuted() { return muted; },
    unlock() { _ctx(); },
  };
})();
