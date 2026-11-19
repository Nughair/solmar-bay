// audio.js — synthesized WebAudio sounds: no audio files. Engine hum, gunshot,
// hit thud, cash pickup, mission sting and a soft ambient pad, all oscillators.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let padStarted = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { ctx = null; }
    return ctx;
  }

  function blip(freq, dur, type, vol, slideTo) {
    const c = ensure(); if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), c.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.12, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }

  function noiseBurst(dur, vol, freq) {
    const c = ensure(); if (!c) return;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1800;
    const g = c.createGain(); g.gain.value = vol || 0.25;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start();
  }

  return {
    unlock() { ensure(); this.startPad(); },
    shoot() { noiseBurst(0.12, 0.3, 2600); blip(160, 0.08, 'square', 0.1, 60); },
    hit() { blip(110, 0.15, 'sawtooth', 0.18, 55); noiseBurst(0.08, 0.12, 700); },
    hurt() { blip(220, 0.2, 'sawtooth', 0.14, 90); },
    cash() { blip(880, 0.09, 'sine', 0.14); setTimeout(() => blip(1320, 0.14, 'sine', 0.14), 70); },
    sting(win) {
      const notes = win ? [523, 659, 784, 1046] : [392, 330, 262, 196];
      notes.forEach((n, i) => setTimeout(() => blip(n, 0.22, 'triangle', 0.16), i * 110));
    },
    door() { blip(300, 0.07, 'square', 0.08, 180); },
    splash() { noiseBurst(0.3, 0.1, 900); },
    setEngine(on, rpm) {
      const c = ensure(); if (!c) return;
      if (on && !engineOsc) {
        engineOsc = c.createOscillator(); engineGain = c.createGain();
        engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 60;
        engineGain.gain.value = 0.035;
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
        engineOsc.connect(f); f.connect(engineGain); engineGain.connect(c.destination);
        engineOsc.start();
      }
      if (engineOsc) engineOsc.frequency.value = 55 + Math.abs(rpm || 0) * 55;
      if (!on && engineOsc) {
        try { engineOsc.stop(); } catch { /* already stopped */ }
        engineOsc = null; engineGain = null;
      }
    },
    startPad() {
      if (padStarted) return;
      const c = ensure(); if (!c) return;
      padStarted = true;
      [196, 246.9, 293.7].forEach((freq) => {
        const o = c.createOscillator(); const g = c.createGain();
        o.type = 'sine'; o.frequency.value = freq; g.gain.value = 0.012;
        o.connect(g); g.connect(c.destination); o.start();
      });
    },
  };
}
