// Every sound in Solmar Bay is synthesised with WebAudio — no audio files. One engine
// owns the context, the looping voices (engine, boat, siren, sea air) and the one-shot
// voices (shots, hits, crashes, coins, jingles). It starts on the first user gesture,
// as browsers require, and M mutes it.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.loops = {};
  }

  /** Create the context on a user gesture; safe to call every frame. */
  unlock() {
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
    this.startAmbience();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** A short oscillator blip with an envelope — the atom of most one-shots. */
  blip(freqA, freqB, seconds, type, volume, when = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.now() + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), t0 + seconds);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
  }

  /** A burst of filtered noise — gunshots, crashes, splashes, static. */
  noise(seconds, volume, filterFreq, type = 'lowpass', when = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.now() + when;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(t0);
  }

  shot() {
    this.noise(0.14, 0.5, 2800, 'bandpass');
    this.blip(160, 40, 0.1, 'square', 0.25);
  }

  dryFire() {
    this.blip(900, 500, 0.05, 'square', 0.12);
  }

  hitFlesh() {
    this.noise(0.1, 0.35, 700);
  }

  hitMetal() {
    this.blip(2200, 900, 0.09, 'triangle', 0.2);
    this.noise(0.08, 0.2, 4000, 'highpass');
  }

  crash(strength) {
    this.noise(0.28, Math.min(0.7, 0.2 + strength * 0.06), 500);
    this.blip(90, 35, 0.3, 'sawtooth', 0.3);
  }

  splash() {
    this.noise(0.4, 0.25, 900);
  }

  coin() {
    this.blip(1320, 1320, 0.07, 'sine', 0.22);
    this.blip(1760, 1760, 0.12, 'sine', 0.22, 0.07);
  }

  missionStart() {
    this.blip(523, 523, 0.1, 'triangle', 0.25);
    this.blip(784, 784, 0.16, 'triangle', 0.25, 0.1);
  }

  missionDone() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => this.blip(freq, freq, 0.16, 'triangle', 0.26, i * 0.11));
  }

  missionFailed() {
    this.blip(392, 392, 0.14, 'triangle', 0.25);
    this.blip(311, 311, 0.14, 'triangle', 0.25, 0.13);
    this.blip(262, 200, 0.3, 'triangle', 0.25, 0.26);
  }

  hurt() {
    this.blip(200, 90, 0.16, 'sawtooth', 0.3);
  }

  door() {
    this.noise(0.07, 0.25, 1200);
    this.blip(140, 90, 0.09, 'sine', 0.2, 0.05);
  }

  /** A named loop voice (engine / boat / siren): created once, then just re-tuned. */
  loopVoice(name, type, freq, volume, filterFreq) {
    if (!this.ctx) return null;
    if (this.loops[name]) return this.loops[name];
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start();
    const voice = { osc, gain, filter, baseVolume: volume };
    this.loops[name] = voice;
    return voice;
  }

  /** Engine note for the driven vehicle; kind 'car' revs higher than 'boat'. */
  setEngine(kind, rpm01, load01) {
    if (!this.ctx) return;
    const voice = kind === 'boat'
      ? this.loopVoice('boat', 'sawtooth', 55, 0.16, 300)
      : this.loopVoice('car', 'sawtooth', 70, 0.13, 500);
    if (!voice) return;
    const other = this.loops[kind === 'boat' ? 'car' : 'boat'];
    if (other) other.gain.gain.setTargetAtTime(0, this.now(), 0.1);
    const base = kind === 'boat' ? 48 : 62;
    const span = kind === 'boat' ? 70 : 165;
    voice.osc.frequency.setTargetAtTime(base + rpm01 * span, this.now(), 0.06);
    voice.gain.gain.setTargetAtTime(this.muted ? 0 : voice.baseVolume * (0.35 + load01 * 0.65), this.now(), 0.09);
  }

  stopEngine() {
    if (!this.ctx) return;
    for (const name of ['car', 'boat']) {
      const voice = this.loops[name];
      if (voice) voice.gain.gain.setTargetAtTime(0, this.now(), 0.08);
    }
  }

  /** Two-tone patrol siren, audible while any police unit is close and active. */
  setSiren(on, closeness01) {
    if (!this.ctx) return;
    const voice = this.loopVoice('siren', 'triangle', 700, 0.06, 2400);
    if (!voice) return;
    if (!on) {
      voice.gain.gain.setTargetAtTime(0, this.now(), 0.1);
      return;
    }
    const wail = 700 + Math.sin(this.now() * 5.2) * 190;
    voice.osc.frequency.setTargetAtTime(wail, this.now(), 0.03);
    voice.gain.gain.setTargetAtTime(this.muted ? 0 : voice.baseVolume * (0.3 + closeness01 * 0.7), this.now(), 0.1);
  }

  /** Looping sea-and-city air: soft filtered noise, louder near the water. */
  startAmbience() {
    if (!this.ctx || this.loops.ambience) return;
    const length = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.05;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    this.loops.ambience = { gain };
  }

  setAmbienceLevel(level01) {
    const voice = this.loops.ambience;
    if (voice && this.ctx) voice.gain.gain.setTargetAtTime(0.03 + level01 * 0.08, this.now(), 0.4);
  }
}
