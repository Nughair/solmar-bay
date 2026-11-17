// audio.js — every sound in Solmar Bay is synthesised with WebAudio at run time.
// There are no audio files: the engine hum, the police siren, gunshots and the
// little stingers are all oscillators and filtered noise shaped by hand.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineNodes = null;
    this.sirenNodes = null;
    this.enabled = false;
  }

  // Browsers only let an AudioContext start after a gesture, so main.js calls
  // unlock() from the first click or key press.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.enabled = true;
    } catch (err) {
      this.enabled = false;
    }
  }

  tone(freq, dur, type, vol, slideTo, delay = 0) {
    if (!this.enabled) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, vol, filterFreq, delay = 0) {
    if (!this.enabled) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
  }

  // A gunshot: a crack of broadband noise over a low thump.
  shot() {
    this.noise(0.16, 0.5, 3200);
    this.tone(120, 0.12, 'triangle', 0.4, 40);
  }

  // A dry click when a shot finds nothing / the trigger is pulled on cooldown.
  dryFire() {
    this.tone(1400, 0.03, 'square', 0.08);
  }

  // Being hit: a dull thud.
  hurt() {
    this.tone(90, 0.18, 'sine', 0.5, 45);
    this.noise(0.1, 0.2, 500);
  }

  // Cash register stinger for small rewards.
  cash() {
    this.tone(880, 0.09, 'square', 0.16);
    this.tone(1318, 0.16, 'square', 0.16, null, 0.08);
  }

  // Mission complete: a short rising arpeggio.
  missionDone() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this.tone(n, 0.22, 'triangle', 0.22, null, i * 0.11));
  }

  // Mission failed / busted sting: two falling notes.
  missionFailed() {
    this.tone(392, 0.25, 'sawtooth', 0.14, 330);
    this.tone(311, 0.4, 'sawtooth', 0.14, 233, 0.2);
  }

  // A car door and a seatbelt click when entering a vehicle.
  door() {
    this.noise(0.07, 0.25, 900);
    this.tone(220, 0.06, 'square', 0.1, null, 0.09);
  }

  // Collision crunch, scaled by impact.
  crash(strength) {
    const s = Math.min(1, strength);
    this.noise(0.22, 0.2 + 0.5 * s, 700);
    this.tone(70, 0.25, 'sine', 0.3 * s, 35);
  }

  // Continuous engine hum while driving; speed01 is 0..1 of top speed.
  engine(on, speed01) {
    if (!this.enabled) return;
    if (on && !this.engineNodes) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      const sub = this.ctx.createOscillator();
      sub.type = 'square';
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0;
      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain).connect(this.master);
      osc.start();
      sub.start();
      this.engineNodes = { osc, sub, filter, gain };
    }
    if (!on && this.engineNodes) {
      const nodes = this.engineNodes;
      nodes.gain.gain.linearRampToValueAtTime(0.0, this.ctx.currentTime + 0.15);
      setTimeout(() => { try { nodes.osc.stop(); nodes.sub.stop(); } catch (e) { /* already stopped */ } }, 250);
      this.engineNodes = null;
      return;
    }
    if (on && this.engineNodes) {
      const rpm = 55 + speed01 * 165;
      const t = this.ctx.currentTime;
      this.engineNodes.osc.frequency.setTargetAtTime(rpm, t, 0.06);
      this.engineNodes.sub.frequency.setTargetAtTime(rpm * 0.5, t, 0.06);
      this.engineNodes.filter.frequency.setTargetAtTime(320 + speed01 * 900, t, 0.08);
      this.engineNodes.gain.gain.setTargetAtTime(0.05 + speed01 * 0.1, t, 0.09);
    }
  }

  // Two-tone police siren while a chase is live nearby.
  siren(on) {
    if (!this.enabled) return;
    if (on && !this.sirenNodes) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      const gain = this.ctx.createGain();
      gain.gain.value = 0.045;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 0.9;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 130;
      lfo.connect(lfoGain).connect(osc.frequency);
      osc.frequency.value = 830;
      osc.connect(gain).connect(this.master);
      osc.start();
      lfo.start();
      this.sirenNodes = { osc, lfo, gain };
    }
    if (!on && this.sirenNodes) {
      const nodes = this.sirenNodes;
      try { nodes.osc.stop(); nodes.lfo.stop(); } catch (e) { /* already stopped */ }
      this.sirenNodes = null;
    }
  }
}
