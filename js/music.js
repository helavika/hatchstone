"use strict";
// Hatchstone · the soundtrack. Every note is made live, like the sounds in core.js: a small generative engine plays slow
// chords on a soft pad, a sparse plucked tune with long rests between, and now and then a low bell or a crystal chime.
// The backdrop (or the music box's pick) sets the key and the chords; the place sets the texture. A lantern in a cave:
// soft, slow and spacious, never busy.

const MODES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10] };
/** Each backdrop's key and chords, as scale degrees (0 is home, 3 the IV, which the minor songs lift to major: a little hope). */
const SONGS = {
  amethyst: { root: 220, mode: "minor", prog: [0, 5, 3, 6] },
  celestite: { root: 293.66, mode: "major", prog: [0, 4, 5, 3] },
  malachite: { root: 246.94, mode: "dorian", prog: [0, 3, 0, 4] },
  labradorite: { root: 185, mode: "minor", prog: [0, 5, 3, 4] },
  churchyard: { root: 146.83, mode: "minor", prog: [0, 3, 5, 4], bells: true },
  glowcap: { root: 196, mode: "major", prog: [0, 3, 4, 0] },
  frost: { root: 329.63, mode: "major", prog: [0, 5, 3, 4], bells: true },
  summit: { root: 174.61, mode: "dorian", prog: [0, 3, 6, 4] },
  abbey: { root: 130.81, mode: "major", prog: [0, 5, 3, 4], bells: true },
  smithy: { root: 164.81, mode: "dorian", prog: [0, 3, 0, 6] },
};
/**
 * Each place's texture: tempo, the pad's wave and how dark it is, which instrument carries the tune and how often it
 * speaks, how much room is around it, and its own bed under everything (the cave's hum, the forge's drone, the camp's fire).
 */
const PLACES = {
  nest: { bpm: 52, pad: "triangle", cut: 700, tune: "kalimba", notes: 0.34, chime: 0.05, wet: 0.4, bed: "hum", drip: 0.03 },
  garden: { bpm: 58, pad: "sine", cut: 1300, tune: "harp", notes: 0.4, birds: 0.09, wet: 0.25 },
  forge: { bpm: 48, pad: "triangle", cut: 480, padGain: 0.7, tune: "kalimba", notes: 0.18, wet: 0.35, bed: "drone", anvil: true },
  lab: { bpm: 56, pad: "sine", cut: 1800, glass: true, tune: "kalimba", notes: 0.14, bubbles: 0.45, chime: 0.03, wet: 0.4 },
  camp: { bpm: 50, pad: "sine", cut: 800, tune: "flute", notes: 0.24, wet: 0.22, bed: "fire" },
  grotto: { bpm: 42, pad: "triangle", cut: 420, tune: "kalimba", notes: 0.24, dark: true, chime: 0.04, wet: 0.7, deep: true, bed: "hum", drip: 0.05 },
  map: { bpm: 44, pad: "sine", cut: 950, tune: "harp", notes: 0.2, bell: 0.15, wet: 0.5, wide: true },
  crack: { bpm: 46, pad: "sine", cut: 560, padGain: 0.55, notes: 0, chime: 0.06, wet: 0.45 },
};
/** Where the music is: the egg, the map (and the book), or the room you stand in. */
function musicPlace() {
  if (game.scene === "crack") return "crack";
  if (game.scene === "map" || game.scene === "lib") return "map";
  const kind = save.rooms && save.rooms[save.room] && save.rooms[save.room].kind;
  return { yard: "garden", garden: "garden", forge: "forge", lab: "lab", camp: "camp", grotto: "grotto" }[kind] || "nest";
}

/** A soft room tail: stereo noise that dies away and darkens as it goes. */
function musicImpulse(ac, secs, decay) {
  const n = Math.round(ac.sampleRate * secs), b = ac.createBuffer(2, n, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) { const k = i / n; lp += (Math.random() * 2 - 1 - lp) * (0.55 - 0.45 * k); d[i] = lp * Math.pow(1 - k, decay); }
  }
  return b;
}

/**
 * The engine on any audio context (the live one, or an offline one to record a sample): `place` crossfades to a place's
 * texture, `setSong` changes key, `run(until)` schedules the beats up to then. Notes are counted, so it never piles up.
 */
function makeMusic(ac, dest, noise) {
  const CAP = 32, FADE = 2;
  const e = { ac, out: ac.createGain(), layers: [], live: null, ends: [], song: SONGS.amethyst, beat: 0, next: 0, motif: null, stats: {} };
  e.out.gain.value = 0;
  e.out.connect(dest);
  // the room around the music, and a long echo for the deep places
  const rev = ac.createConvolver();
  rev.buffer = musicImpulse(ac, 4.5, 3);
  rev.connect(e.out);
  const echo = ac.createDelay(2), fb = ac.createGain(), elp = ac.createBiquadFilter(), eg = ac.createGain();
  echo.delayTime.value = 0.62; fb.gain.value = 0.42; elp.type = "lowpass"; elp.frequency.value = 1300; eg.gain.value = 0.5;
  echo.connect(elp).connect(fb).connect(echo);
  elp.connect(eg); eg.connect(e.out); eg.connect(rev);

  // the song's notes: the root folded into one low octave, the minor IV lifted to major
  const base = () => { let r = e.song.root; while (r >= 220) r /= 2; while (r < 110) r *= 2; return r; };
  const scaleFor = chord => MODES[e.song.mode === "minor" && ((chord % 7) + 7) % 7 === 3 ? "dorian" : e.song.mode];
  const freq = (deg, oct, sc) => { const d = ((deg % 7) + 7) % 7; return base() * Math.pow(2, (sc[d] + 12 * (Math.floor(deg / 7) + oct)) / 12); };

  /** Room for one more voice at t? (the ones still sounding then, counted) */
  function room(t, len) {
    e.ends = e.ends.filter(x => x > t);
    if (e.ends.length >= CAP) return false;
    e.ends.push(t + len);
    return true;
  }
  /** One voice: an oscillator that swells and falls (or holds, for pads and the flute), panned a little, gone when it's done. */
  function voice(L, t, f, { type = "sine", gain, a = 0.005, len, hold = 0, glide = 0, cut = 0, pan = 0, detune = 0, into = null }) {
    if (!room(t, len)) return null;
    e.stats[L.id] = (e.stats[L.id] || 0) + 1; // notes per place, for the tests
    const o = ac.createOscillator(), g = ac.createGain(), nodes = [o, g];
    o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(f * glide, t + Math.min(0.08, len * 0.5));
    g.gain.setValueAtTime(0.0001, t);
    if (hold) { g.gain.linearRampToValueAtTime(gain, t + a); g.gain.setValueAtTime(gain, t + a + hold); g.gain.linearRampToValueAtTime(0.0001, t + len); }
    else { g.gain.exponentialRampToValueAtTime(gain, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + len); }
    let head = o;
    if (cut) { const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = cut; head = head.connect(lp); nodes.push(lp); }
    head.connect(g);
    let tail = g;
    if (pan) { const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); tail = g.connect(p); nodes.push(p); }
    tail.connect(into || L.in);
    o.start(t); o.stop(t + len + 0.05);
    o.onended = () => nodes.forEach(n => n.disconnect());
    return o;
  }
  /** A breath of filtered noise: the fire's crackle, the flute's air, the anvil's ring. */
  function grain(L, t, len, f, q, gain, type = "bandpass", pan = 0) {
    if (!room(t, len)) return;
    const src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain(), p = ac.createStereoPanner();
    src.buffer = noise; src.playbackRate.value = rand(0.8, 1.2);
    bp.type = type; bp.frequency.value = f; bp.Q.value = q; p.pan.value = pan;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.004, len * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(bp).connect(g).connect(p).connect(L.in);
    src.start(t, rand(0, 1.5)); src.stop(t + len + 0.02);
    src.onended = () => [src, bp, g, p].forEach(n => n.disconnect());
  }
  const spread = L => (Math.random() * 2 - 1) * (L.p.wide ? 0.7 : 0.3);

  // ---------- the instruments ----------
  /** The pad: each chord tone twice, a little out of tune with itself, through one lowpass; it swells in and lets go slowly. */
  function pad(L, t, fs, len) {
    const p = L.p, lp = ac.createBiquadFilter(), rel = 3, a = Math.min(3, len * 0.4);
    lp.type = "lowpass"; lp.frequency.value = p.cut; lp.Q.value = 0.3;
    lp.connect(L.in);
    let last = null;
    for (const f of fs) for (const d of [-7, 7]) last = voice(L, t, f, { type: p.pad, gain: 0.016 * (p.padGain || 1), a, len: len + rel, hold: Math.max(0.01, len - a), detune: d, pan: d / (p.wide ? 12 : 25), into: lp }) || last;
    if (last) last.addEventListener("ended", () => lp.disconnect()); else lp.disconnect();
  }
  const TUNES = {
    kalimba(L, t, f) {
      voice(L, t, f, { gain: 0.05, a: 0.004, len: 2.4, pan: spread(L) });
      if (!L.p.dark) voice(L, t, f * 4.02, { gain: 0.007, a: 0.002, len: 0.2, pan: spread(L) });
    },
    harp(L, t, f) {
      voice(L, t, f, { type: "triangle", gain: 0.045, a: 0.003, len: 2.8, cut: 2200, pan: spread(L) });
      voice(L, t, f * 2, { gain: 0.009, a: 0.003, len: 1.2, pan: spread(L) });
    },
    /** A wooden flute: a slow breath in, a gentle vibrato once the note settles, a puff of air at the start. */
    flute(L, t, f, spb) {
      const len = spb * 1.8, o = voice(L, t, f, { type: "triangle", gain: 0.03, a: 0.16, len, hold: len - 0.5, cut: 1500, pan: spread(L) });
      if (!o) return;
      const lfo = ac.createOscillator(), depth = ac.createGain();
      lfo.frequency.value = 4.6; depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(9, t + 0.6);
      lfo.connect(depth).connect(o.detune);
      lfo.start(t); lfo.stop(t + len);
      lfo.onended = () => { lfo.disconnect(); depth.disconnect(); };
      grain(L, t, 0.22, f * 2, 1.2, 0.006);
    },
  };
  /** A crystal chime: high, clear, with a glassy overtone that isn't quite in tune. */
  const chime = (L, t, f) => { const pan = spread(L) * 1.5; voice(L, t, f, { gain: 0.016, a: 0.002, len: 3.5, pan }); voice(L, t, f * 2.76, { gain: 0.005, a: 0.002, len: 1.5, pan }); };
  /** A low bell far off: a hum under it and two bell partials over it. */
  const bell = (L, t, f) => { const pan = spread(L); for (const [k, g, len] of [[0.5, 0.012, 6], [1, 0.026, 5], [2, 0.01, 3], [2.76, 0.007, 2]]) voice(L, t, f * k, { gain: g, a: 0.004, len, pan }); };
  /** Birds, suggested: two or three soft high blips that rise. */
  const birds = (L, t) => { const f = rand(2600, 4000), pan = spread(L) * 2; for (let i = 0, n = pick([2, 2, 3]); i < n; i++) voice(L, t + i * rand(0.08, 0.12), f * rand(0.95, 1.08), { gain: 0.006, a: 0.004, len: 0.07, glide: 1.25, pan }); };
  /** The anvil in the next cave: a small metal tick with a ring that's mostly room. */
  const anvil = (L, t, g) => { voice(L, t, 1850, { gain: 0.009 * g, a: 0.001, len: 0.6, pan: -0.35 }); voice(L, t, 1850 * 2.71, { gain: 0.004 * g, a: 0.001, len: 0.25, pan: -0.35 }); grain(L, t, 0.015, 3200, 2, 0.012 * g, "bandpass", -0.35); };
  const bubble = (L, t, f) => voice(L, t, f, { gain: 0.011, a: 0.003, len: 0.16, glide: 1.5, pan: spread(L) * 2 });
  const drip = (L, t) => voice(L, t, rand(1100, 1900), { gain: 0.012, a: 0.003, len: 0.5, pan: spread(L) * 2 });

  // ---------- the beds: what each place sounds like underneath ----------
  function bed(L, t) {
    const p = L.p, sc = scaleFor(0), g = ac.createGain(), srcs = [];
    g.connect(L.in);
    const osc = (type, deg, oct, gain, into, det = 0) => { const o = ac.createOscillator(), og = ac.createGain(); o.type = type; o.frequency.value = freq(deg, oct, sc); o.detune.value = det; og.gain.value = gain; o.connect(og).connect(into); srcs.push(o); L.tune.push([o, deg, oct]); return o; };
    const hiss = (type, f, q, gain) => { const s = ac.createBufferSource(), bp = ac.createBiquadFilter(), sg = ac.createGain(); s.buffer = noise; s.loop = true; bp.type = type; bp.frequency.value = f; bp.Q.value = q; sg.gain.value = gain; s.connect(bp).connect(sg).connect(g); srcs.push(s); };
    const swayLp = (f, depth, rate) => { const lp = ac.createBiquadFilter(), lfo = ac.createOscillator(), lg = ac.createGain(); lp.type = "lowpass"; lp.frequency.value = f; lfo.frequency.value = rate; lg.gain.value = depth; lfo.connect(lg).connect(lp.frequency); srcs.push(lfo); lp.connect(g); return lp; };
    if (p.bed === "hum") {
      // the cave breathing: a low root and fifth, slowly opening and closing, and a breath of air
      const lp = swayLp(320, 160, 1 / 11);
      for (const det of [-5, 5]) { osc("sine", 0, -1, 0.02, lp, det); osc("sine", 4, -1, 0.01, lp, det); }
      hiss("bandpass", 500, 0.6, 0.012);
    } else if (p.bed === "drone") {
      // the forge's furnace: a deep, warm drone that never quite settles
      const lp = swayLp(170, 70, 1 / 13);
      osc("sawtooth", 0, -2, 0.045, lp); osc("sine", 0, -1, 0.03, lp, 4);
      hiss("lowpass", 220, 0.5, 0.02);
    } else if (p.bed === "fire") {
      // the campfire: a low rumble and a little hiss (the crackles come with the beats)
      hiss("lowpass", 380, 0.5, 0.03); hiss("highpass", 3200, 0.5, 0.003);
    }
    g.gain.value = 1;
    srcs.forEach(s => s.start(t));
    L.beds = srcs;
  }

  /** A tune is a two-bar motif: heard, rested on, answered with a changed ending, rested on. */
  function motif(p) {
    const m = [];
    let at = pick([0, 2, 4]);
    for (let i = 0; i < 8; i++) m.push(Math.random() < (i % 4 === 0 ? p.notes * 1.7 : p.notes) ? (at = clamp(at + pick([-2, -1, -1, 0, 1, 1, 2]), -3, 7)) : null);
    return m;
  }

  /** One beat of music in a place. */
  function beat(L, t) {
    const p = L.p, s = e.song, b = e.beat, bar = Math.floor(b / 4), k = b % 4, spb = 60 / p.bpm;
    const chord = s.prog[Math.floor(bar / 2) % s.prog.length], sc = scaleFor(chord), nt = (deg, oct) => freq(deg, oct, sc);
    const turn = b % 8 === 0;
    // the chord on its pad (a fresh place joins the chord already playing), a soft bass under it
    if (turn || L.fresh) {
      const left = spb * (8 - (b % 8));
      pad(L, t, [nt(chord, 0), nt(chord + 4, 0), nt(chord + 9, 0)], left);
      if (p.glass) voice(L, t, nt(chord + 4, 2), { gain: 0.006, a: Math.min(2, left / 2), len: left + 2, hold: Math.max(0.01, left - 2) });
      if (turn) voice(L, t, nt(chord, -1), { gain: 0.04, a: 0.4, len: spb * 7 });
      L.fresh = false;
    }
    // the tune: two bars of motif, two bars of rest, a fresh pair of motifs every sixteen bars
    if (p.tune && p.notes) {
      if (!e.motif || (bar % 16 === 0 && k === 0)) e.motif = motif(p);
      const phrase = Math.floor(bar / 2) % 4;
      let deg = phrase % 2 ? null : e.motif[(bar % 2) * 4 + k];
      if (deg != null) {
        if (phrase === 2 && bar % 2 && k === 3) deg += pick([-1, 1, 2]);
        deg += chord;
        // strong beats lean onto the nearest chord tone
        if (k === 0) { const r = (((deg - chord) % 7) + 7) % 7; if (r === 1 || r === 3) deg -= 1; else if (r === 5 || r === 6) deg += 7 - r; }
        TUNES[p.tune](L, t, nt(deg, 1), spb);
      }
    }
    // the things that come now and then
    if (p.chime && Math.random() < p.chime) chime(L, t + spb * pick([0, 0.5]), nt(chord + pick([0, 2, 4, 7]), 2));
    if (k === 0 && Math.random() < (p.bell || 0) + (s.bells && bar % 4 === 0 ? 0.3 : 0)) bell(L, t, nt(chord, 0));
    if (p.birds && Math.random() < p.birds) birds(L, t + rand(0, spb));
    if (p.drip && Math.random() < p.drip) drip(L, t + rand(0, spb));
    // the forge: the smith strikes on one and three, rests a bar now and then
    if (p.anvil) {
      if (k === 0) L.strike = Math.random() < 0.7;
      if (L.strike && k % 2 === 0) anvil(L, t, k ? 0.6 : 1);
    }
    // the lab: some bars bubble up the chord in quick little rising blips
    if (p.bubbles) {
      if (k === 0) L.bubbling = Math.random() < p.bubbles;
      if (L.bubbling) for (const h of [0, 0.5]) if (Math.random() < 0.75) bubble(L, t + h * spb, nt(chord + [0, 2, 4, 7, 9, 11, 14, 11][k * 2 + h * 2], 2));
    }
    // the fire: crackles, never quite in time
    if (p.bed === "fire") {
      for (let i = 0, n = Math.floor(rand(1, 5)); i < n; i++) grain(L, t + rand(0, spb), rand(0.004, 0.014), rand(2200, 6000), rand(1, 4), rand(0.015, 0.05), "bandpass", rand(-0.4, 0.4));
      if (Math.random() < 0.12) grain(L, t + rand(0, spb), 0.05, 700, 1, 0.04, "bandpass", rand(-0.3, 0.3));
    }
  }

  /** Crossfade to a place (or to silence, with null) over two seconds. */
  e.place = (id, t) => {
    if ((e.live ? e.live.id : null) === (id || null)) return;
    const old = e.live;
    if (old) {
      const g = old.fade.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + FADE);
      old.beds.forEach(s => s.stop(t + FADE + 0.1));
      setTimeout(() => { old.nodes.forEach(n => n.disconnect()); e.layers = e.layers.filter(l => l !== old); }, (FADE + 7) * 1000);
    }
    e.live = null;
    if (!id) return;
    const p = PLACES[id] || PLACES.nest, L = { id, p, fade: ac.createGain(), in: ac.createGain(), beds: [], tune: [], fresh: true };
    L.fade.gain.setValueAtTime(0, t); L.fade.gain.linearRampToValueAtTime(1, t + FADE);
    const dry = ac.createGain(), wet = ac.createGain();
    dry.gain.value = 1 - p.wet * 0.5; wet.gain.value = p.wet;
    L.in.connect(L.fade); L.fade.connect(dry).connect(e.out); L.fade.connect(wet).connect(rev);
    L.nodes = [L.in, L.fade, dry, wet];
    if (p.deep) { const s = ac.createGain(); s.gain.value = 0.35; L.fade.connect(s).connect(echo); L.nodes.push(s); }
    bed(L, t);
    e.motif = null;
    e.layers.push(L); e.live = L;
  };
  /** A new key and chords; the beds slide to the new root. */
  e.setSong = id => {
    const s = SONGS[id] || SONGS.amethyst;
    if (s === e.song) return;
    e.song = s;
    const sc = scaleFor(0);
    for (const L of e.layers) for (const [o, deg, oct] of L.tune) o.frequency.setTargetAtTime(freq(deg, oct, sc), ac.currentTime, 1.5);
  };
  /** Schedule the beats up to `until` (back from a pause, it picks up from now rather than rushing the missed beats). */
  e.run = until => {
    const L = e.live;
    if (!L) return;
    if (e.next < ac.currentTime) e.next = ac.currentTime + 0.05;
    while (e.next < until) { beat(L, e.next); e.next += 60 / L.p.bpm; e.beat++; }
  };
  return e;
}

/**
 * The soundtrack that plays: it wakes with the sound (after the first tap), follows you from place to place with a slow
 * crossfade, and keeps quiet when music is off, in co-op, in the echo game and while the game is in the background.
 * A small timer schedules half a second ahead; nothing runs per frame.
 */
const music = {
  eng: null, on: true, vol: 0.5, id: "amethyst", level: -1,
  start(ac, dest, noise) {
    if (this.eng) return;
    this.eng = makeMusic(ac, dest, noise);
    this.eng.setSong(this.id);
    setInterval(() => this.pump(), 150);
  },
  set(on, vol) { this.on = on; this.vol = vol; this.pump(); },
  song(id) { this.id = id; if (this.eng) this.eng.setSong(id); },
  quiet() {
    return !this.on || this.vol < 0.01 || !sfx.ready() || document.hidden || sfx.hush || this.eng.ac.state !== "running"
      || (typeof coopSession !== "undefined" && !!coopSession);
  },
  pump() {
    const e = this.eng;
    if (!e) return;
    const now = e.ac.currentTime, q = this.quiet(), level = q ? 0 : 1.1 * this.vol;
    if (level !== this.level) { this.level = level; e.out.gain.setTargetAtTime(level, now, q ? 0.6 : 0.3); }
    e.place(q ? null : musicPlace(), now);
    if (!q) e.run(now + 0.5);
  },
};
