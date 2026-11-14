"use strict";
// Hatchstone · small helpers and the sound engine (every sound is made live).
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- helpers ----------

const $ = id => document.getElementById(id);
const $$ = sel => [...document.querySelectorAll(sel)];
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const TAU = Math.PI * 2;
const easeOutBack = t => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
const easeOutBounce = t => {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};

function inside(poly, p) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

function centroid(poly) {
  let x = 0, y = 0;
  for (const p of poly) { x += p[0]; y += p[1]; }
  return [x / poly.length, y / poly.length];
}

function tracePoly(c, poly) {
  c.beginPath();
  poly.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
}

/** Mix a hex color toward white (k > 0) or black (k < 0). */
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), t = k > 0 ? 255 : 0, a = Math.abs(k);
  const ch = s => Math.round(lerp((n >> s) & 255, t, a));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** "#rrggbb" with an alpha, as an rgba() string. */
const hexA = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

/** A small repeatable random generator, so each species always gets the same spots. */
function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (const ch of str) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function sparklePath(c, x, y, r) {
  c.beginPath();
  c.moveTo(x, y - r); c.lineTo(x + r * 0.28, y - r * 0.28); c.lineTo(x + r, y);
  c.lineTo(x + r * 0.28, y + r * 0.28); c.lineTo(x, y + r); c.lineTo(x - r * 0.28, y + r * 0.28);
  c.lineTo(x - r, y); c.lineTo(x - r * 0.28, y - r * 0.28);
  c.closePath();
}

const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } },
};

// ---------- audio: every sound is synthesized ----------

const sfx = {
  ac: null, master: null, noise: null, muted: false, lastTick: 0, purr: null, sfxVol: 1,
  /** How loud a sound plays, by the sounds slider (never quite zero, for the ramps); the music has its own, in js/music.js. */
  vol(gain) { return Math.max(0.0001, gain * this.sfxVol); },
  setVolumes(vol, sfx, on = music.on) { this.sfxVol = sfx; music.set(on, vol); },

  init() {
    if (this.ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ac = new AC();
    const comp = this.ac.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    this.master = this.ac.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp).connect(this.ac.destination);
    // a short feedback echo gives chimes a little cave around them
    this.echo = this.ac.createDelay(1);
    this.echo.delayTime.value = 0.23;
    const fb = this.ac.createGain(); fb.gain.value = 0.32;
    const lp = this.ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600;
    this.echo.connect(lp).connect(fb).connect(this.echo);
    lp.connect(this.master);
    const n = this.ac.sampleRate * 2;
    this.noise = this.ac.createBuffer(1, n, this.ac.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    music.start(this.ac, this.master, this.noise);
    if (typeof applyOpts === "function") applyOpts();
  },

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ac.currentTime, 0.15);
  },

  ready() { return !!this.ac && !this.muted; },

  /** The backdrop's song: its key and chords, played by the soundtrack in js/music.js in the texture of the place you're in. */
  music(id) { music.song(id); },

  /** The soft wooden click of a button going down. */
  press() {
    if (!this.ready()) return;
    const t = this.ac.currentTime;
    this.tone(t, 1400, 0.025, 0.035, "triangle", 900);
    this.grain(t, 0.01, 2500, 2, 0.04);
  },

  /** An 8-bit blip for a shard landing; it climbs while a run of shards keeps coming. */
  blip(n) {
    if (!this.ready()) return;
    const t = this.ac.currentTime, f = 880 * Math.pow(2, (Math.min(n, 24) % 25) / 24);
    this.tone(t, f, 0.025, 0.06, "square");
    this.tone(t + 0.04, f * 1.5, 0.02, 0.08, "square");
  },

  grain(t, dur, freq, q, gain, type = "bandpass") {
    const ac = this.ac;
    const src = ac.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rand(0.8, 1.25);
    const f = ac.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(this.vol(gain), t + Math.min(0.004, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, rand(0, 1.8));
    src.stop(t + dur + 0.02);
  },

  tone(t, freq, gain, decay, type = "sine", endFreq = null, echo = false) {
    const o = this.ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + decay * 0.6);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(this.vol(gain), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(this.master);
    if (echo) g.connect(this.echo);
    o.start(t); o.stop(t + decay + 0.05);
  },

  /** One syllable of a speaking voice: a short blip, a little higher or lower each time, like the voices in old RPGs. */
  voice(v) {
    if (!this.ready()) return;
    const t = this.ac.currentTime, f = v.f * (1 + (Math.random() - 0.5) * v.spread);
    this.tone(t, f, v.gain || 0.05, v.len || 0.055, v.wave, f * v.glide);
  },

  /** The stone giving way under your finger: dry little crackles. */
  crackle(n) {
    if (!this.ready() || n <= 0) return;
    const now = this.ac.currentTime;
    if (now - this.lastTick < 0.025) return;
    this.lastTick = now;
    for (let i = 0; i < Math.min(n, 4); i++) {
      const t = now + rand(0, 0.03);
      this.grain(t, rand(0.006, 0.018), rand(2500, 7000), rand(2, 6), rand(0.12, 0.28));
      if (Math.random() < 0.35) this.tone(t, rand(1800, 3600), 0.03, 0.03, "triangle");
    }
  },

  /** A crack running all the way: a deep crunch, then the crystals inside answer with a chime. */
  crackDone(level) {
    if (!this.ready()) return;
    const t = this.ac.currentTime;
    this.grain(t, 0.22, 260, 0.8, 0.4, "lowpass");
    for (let i = 0; i < 14; i++) this.grain(t + Math.pow(Math.random(), 2) * 0.35, rand(0.01, 0.04), rand(1200, 5000), rand(1, 3), rand(0.06, 0.18));
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.7, 1318.5];
    const f = scale[clamp(level, 0, scale.length - 1)];
    this.tone(t + 0.12, f, 0.09, 1.6, "sine", null, true);
    this.tone(t + 0.16, f * 2, 0.035, 1.2, "sine", null, true);
  },

  /** Hard stone: the first pass only leaves a hairline. */
  hairline() {
    if (!this.ready()) return;
    const t = this.ac.currentTime;
    this.grain(t, 0.12, 900, 1.2, 0.2);
    this.tone(t, 420, 0.08, 0.2, "triangle", 300);
  },

  knot() {
    if (!this.ready()) return;
    const t = this.ac.currentTime;
    this.grain(t, 0.16, 350, 0.8, 0.45, "lowpass");
    for (let i = 0; i < 8; i++) this.grain(t + rand(0, 0.12), rand(0.01, 0.03), rand(2000, 6000), 2, 0.15);
    this.tone(t + 0.02, 2637, 0.06, 0.8, "sine", null, true);
  },

  tok() {
    if (!this.ready()) return;
    const t = this.ac.currentTime;
    this.tone(t, rand(520, 680), 0.22, 0.07, "triangle", 300);
    this.grain(t, 0.02, 3800, 1.5, 0.18);
  },

  thud() {
    if (!this.ready()) return;
    const t = this.ac.currentTime;
    this.tone(t, 120, 0.3, 0.25, "sine", 60);
    this.grain(t, 0.12, 400, 0.7, 0.2, "lowpass");
  },

  shimmer() {
    if (!this.ready()) return;
    const t = this.ac.currentTime;
    for (let i = 0; i < 5; i++) this.tone(t + i * 0.09, rand(2400, 4200), 0.02, 0.5, "sine", null, true);
  },

  /** The shell bursting open: a big crunch cascade and a rising crystal arpeggio. */
  burst(rarity) {
    if (!this.ready()) return;
    const t = this.ac.currentTime;
    this.grain(t, 0.35, 200, 0.7, 0.5, "lowpass");
    for (let i = 0; i < 70; i++) {
      const k = Math.pow(Math.random(), 1.7);
      this.grain(t + k * 1.1, rand(0.01, 0.05), rand(900, 6000), rand(1, 4), rand(0.06, 0.22) * (1 - k * 0.6));
    }
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
    const n = rarity === "legendary" ? 6 : rarity === "rare" ? 5 : 4;
    for (let i = 0; i < n; i++) this.tone(t + 0.25 + i * 0.11, notes[i], 0.08, 2.2, "sine", null, true);
  },

  /** The echo game's crystals: one clear bell note each. */
  note(i) {
    if (!this.ready()) return;
    const t = this.ac.currentTime, f = [523.25, 659.25, 783.99, 1046.5][i];
    this.tone(t, f, 0.1, 0.7, "sine", null, true);
    this.tone(t, f * 2, 0.02, 0.2, "triangle");
  },

  /** Each species has its own voice pitch. */
  chirp(voice = 1) {
    if (!this.ready()) return;
    const t = this.ac.currentTime, f = 620 * voice;
    this.tone(t, f, 0.09, 0.3, "sine", f * 1.55);
    this.tone(t + 0.2, f * 1.2, 0.07, 0.28, "sine", f * 1.9);
  },

  star(i) {
    if (!this.ready()) return;
    const t = this.ac.currentTime, f = [1046.5, 1318.5, 1568][i] || 1568;
    this.tone(t, f, 0.08, 1.2, "sine", null, true);
    this.tone(t, f / 2, 0.025, 0.12, "square");
  },

  munch() {
    if (!this.ready()) return;
    const t = this.ac.currentTime;
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.17;
      this.grain(tt, 0.05, rand(900, 1800), 1.2, 0.3);
      for (let j = 0; j < 4; j++) this.grain(tt + rand(0, 0.04), 0.012, rand(3000, 6000), 3, 0.12);
      this.tone(tt, 300 - i * 30, 0.05, 0.08, "triangle");
    }
  },

  /** A soft, continuous purr while you stroke a glowling. */
  purrOn() {
    if (!this.ready() || this.purr) return;
    const ac = this.ac, t = ac.currentTime;
    const src = ac.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 220;
    const g = ac.createGain(); g.gain.value = 0;
    const am = ac.createGain(); am.gain.value = 0.5;
    const lfo = ac.createOscillator(); lfo.frequency.value = 24;
    const lfoG = ac.createGain(); lfoG.gain.value = 0.5;
    lfo.connect(lfoG).connect(am.gain);
    src.connect(lp).connect(am).connect(g).connect(this.master);
    g.gain.setTargetAtTime(0.5, t, 0.15);
    src.start(); lfo.start();
    this.purr = { src, lfo, g };
  },

  purrOff() {
    if (!this.purr) return;
    const { src, lfo, g } = this.purr, t = this.ac.currentTime;
    g.gain.setTargetAtTime(0, t, 0.12);
    src.stop(t + 0.6); lfo.stop(t + 0.6);
    this.purr = null;
  },

  /** "Mm-mm": two short low hums, the second lower, for a polite no. */
  refuse() {
    if (!this.ready()) return;
    const t = this.ac.currentTime;
    this.tone(t, 330, 0.05, 0.16, "triangle", 300);
    this.tone(t + 0.2, 300, 0.05, 0.2, "triangle", 250);
  },
  /** A big sleepy yawn: a soft voice sliding down, with a breath. */
  yawn() {
    if (!this.ready()) return;
    const t = this.ac.currentTime;
    this.tone(t, 620, 0.04, 0.75, "sine", 300);
    this.grain(t + 0.05, 0.6, 900, 0.6, 0.03, "lowpass");
  },
  /** Waking up: a little stretch going up, then a happy chirp. */
  stretch(voice = 1) {
    if (!this.ready()) return;
    const t = this.ac.currentTime;
    this.tone(t, 300 * voice, 0.04, 0.5, "sine", 640 * voice);
    this.tone(t + 0.55, 880 * voice, 0.035, 0.2, "triangle", 1100 * voice);
  },

  lullaby() {
    if (!this.ready()) return;
    const t = this.ac.currentTime;
    [659.25, 587.33, 523.25, 392, 440, 392].forEach((f, i) => this.tone(t + i * 0.42, f, 0.06, 1.4, "sine", null, true));
  },

  levelUp() {
    if (!this.ready()) return;
    const t = this.ac.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093].forEach((f, i) => this.tone(t + i * 0.07, f, 0.07, 1.4, "sine", null, true));
  },

  ding(step) {
    if (!this.ready()) return;
    this.tone(this.ac.currentTime, 880 * Math.pow(2, Math.min(step, 14) / 12), 0.07, 0.5, "sine", null, true);
  },

  bonk() {
    if (!this.ready()) return;
    const t = this.ac.currentTime;
    this.tone(t, 180, 0.25, 0.15, "triangle", 90);
    this.grain(t, 0.06, 500, 1, 0.2, "lowpass");
  },

  /** Knocking on stone: dull and short on solid rock, deep and ringing over the hollow. */
  knock(h) {
    if (!this.ready()) return;
    const t = this.ac.currentTime;
    this.tone(t, lerp(760, 210, h), 0.24, lerp(0.05, 0.4, h), "triangle", lerp(520, 160, h), h > 0.6);
    this.grain(t, 0.015, lerp(4200, 1600, h), 1.5, 0.16);
    if (h > 0.5) this.tone(t + 0.01, lerp(400, 140, h), 0.12 * h, 0.5, "sine");
  },

  /** A soft cloth on stone: the squeak rises as the surface turns glossy. */
  rubOn() {
    if (!this.ready() || this.rub) return;
    const ac = this.ac;
    const src = ac.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 2.5;
    const g = ac.createGain(); g.gain.value = 0;
    src.connect(bp).connect(g).connect(this.master);
    src.start();
    this.rub = { src, bp, g };
  },
  rubSet(shine, speed) {
    if (!this.rub) return;
    const t = this.ac.currentTime;
    this.rub.bp.frequency.setTargetAtTime(lerp(800, 3800, shine), t, 0.05);
    this.rub.g.gain.setTargetAtTime(clamp(speed / 900, 0, 1) * 0.28, t, 0.04);
  },
  rubOff() {
    if (!this.rub) return;
    const { src, g } = this.rub, t = this.ac.currentTime;
    g.gain.setTargetAtTime(0, t, 0.06);
    src.stop(t + 0.4);
    this.rub = null;
  },

  gleam() {
    if (!this.ready()) return;
    const t = this.ac.currentTime;
    [1568, 2093, 2637, 3136].forEach((f, i) => this.tone(t + i * 0.06, f, 0.05, 1.2, "sine", null, true));
  },

  tick() {
    if (!this.ready()) return;
    this.tone(this.ac.currentTime, 1500, 0.03, 0.05, "sine");
  },
};
