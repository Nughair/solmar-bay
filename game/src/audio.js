// audio.js — every sound in Solmar Bay is synthesised with WebAudio at the
// moment it is needed. The game ships no audio files at all.

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
  }

  // The context may only start after a user gesture, so it is created lazily
  // from the first click or keypress the game sees.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  tone(freqA, freqB, seconds, type, volume, when = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), t0 + seconds);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
  }

  noise(seconds, volume, filterFreq, when = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  gunshot() {
    this.noise(0.16, 0.5, 2600);
    this.tone(160, 40, 0.12, 'square', 0.25);
  }

  dryFire() {
    this.tone(1200, 900, 0.04, 'square', 0.08);
  }

  hitThud() {
    this.noise(0.1, 0.3, 500);
    this.tone(90, 45, 0.12, 'sine', 0.3);
  }

  carDoor() {
    this.noise(0.07, 0.25, 900);
    this.tone(140, 70, 0.09, 'triangle', 0.2);
  }

  crash(intensity) {
    this.noise(0.3, 0.25 + intensity * 0.4, 700);
    this.tone(70, 30, 0.3, 'sawtooth', 0.15 + intensity * 0.2);
  }

  cashRegister() {
    this.tone(1318, 1318, 0.09, 'square', 0.12);
    this.tone(1760, 1760, 0.14, 'square', 0.12, 0.08);
  }

  missionSting(success) {
    if (success) {
      this.tone(523, 523, 0.12, 'triangle', 0.22);
      this.tone(659, 659, 0.12, 'triangle', 0.22, 0.11);
      this.tone(784, 784, 0.22, 'triangle', 0.24, 0.22);
    } else {
      this.tone(392, 392, 0.16, 'triangle', 0.2);
      this.tone(330, 262, 0.3, 'triangle', 0.2, 0.14);
    }
  }

  bustedSting() {
    this.tone(220, 110, 0.7, 'sawtooth', 0.2);
    this.noise(0.5, 0.12, 400, 0.05);
  }

  levelUpStar() {
    this.tone(880, 1320, 0.1, 'square', 0.1);
  }

  // --- looping voices: the car engine and the police siren ----------------

  startEngine() {
    if (!this.ctx || this.engineOsc) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  setEngine(rpm01, load01) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const freq = 50 + rpm01 * 130;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(280 + rpm01 * 900, t, 0.06);
    this.engineGain.gain.setTargetAtTime(0.05 + load01 * 0.075, t, 0.09);
  }

  stopEngine() {
    if (!this.engineOsc) return;
    try {
      this.engineOsc.stop();
    } catch (e) {
      /* already stopped */
    }
    this.engineOsc.disconnect();
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
  }

  setSiren(active, dt) {
    if (!this.ctx) return;
    if (active && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 660;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.035;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenTimer = 0;
      this.sirenHigh = false;
    }
    if (!active && this.sirenOsc) {
      try {
        this.sirenOsc.stop();
      } catch (e) {
        /* already stopped */
      }
      this.sirenOsc.disconnect();
      this.sirenOsc = null;
      this.sirenGain = null;
      return;
    }
    if (this.sirenOsc) {
      this.sirenTimer += dt;
      if (this.sirenTimer > 0.42) {
        this.sirenTimer = 0;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(
          this.sirenHigh ? 880 : 620,
          this.ctx.currentTime,
          0.03,
        );
      }
    }
  }
}
