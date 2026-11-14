"use strict";
// Hatchstone · sparks of inspiration: what glowlings bring home from exploring besides shards and geodes.
// A song they hum, a colour they saw, a sight of the lands past the valley. Collected in the Book, never spent.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- the sparks: six songs, six colours, six sights (two for each faraway land on the map) ----------
// A song is a few notes (semitones over its root, and how many beats each), a colour is a swatch that can dye the
// nest's scarves (one of the sprite palette's own colours, so the scarf comes out exactly that colour), and a sight is
// a little picture of one of the map's mystery lands.
const SPARKS = [
  { id: "rain", kind: "song", name: "Rain on a glowcap", line: "The tune rain taps out on a glowcap, learnt by heart on the way home.", root: 784, beat: 0.13, tint: "#8fd8ef",
    notes: [[0, 1], [4, 1], [7, 1], [4, 1], [9, 1], [7, 2], [4, 1], [2, 2]] },
  { id: "lake", kind: "song", name: "The glowing lake", line: "A slow song from the lake past the moss. Pip was right: it does glow.", root: 262, beat: 0.42, tint: "#69b7d6",
    notes: [[0, 2], [4, 1], [7, 2], [9, 1], [7, 1], [4, 3]] },
  { id: "seed", kind: "song", name: "Seed lullaby", line: "Someone in the deep sings this to seeds, so they wake up brave.", root: 392, beat: 0.36, tint: "#8fd18a",
    notes: [[7, 1], [4, 1], [5, 1], [2, 1], [4, 1], [0, 3]] },
  { id: "fire", kind: "song", name: "Campfire tune", line: "What a campfire crackles, if you listen with your whole heart.", root: 330, beat: 0.2, tint: "#f08a4b",
    notes: [[0, 1], [3, 1], [5, 1], [7, 2], [5, 1], [3, 1], [0, 2]] },
  { id: "bell", kind: "song", name: "A far bell", line: "A bell, very far off. Somewhere, someone still rings it every evening.", root: 523, beat: 0.6, tint: "#eec26a", bell: true,
    notes: [[0, 2], [7, 2], [12, 3]] },
  { id: "brave", kind: "song", name: "Song for the dark", line: "A brave little tune to hum when the tunnel goes dark. It helps. It really does.", root: 440, beat: 0.24, tint: "#d2bfff",
    notes: [[0, 1], [0, 1], [4, 1], [7, 2], [4, 1], [5, 1], [7, 1], [12, 2]] },
  { id: "moss", kind: "colour", name: "Dawn moss", line: "The green of moss the moment the first light touches it.", hex: "#57ad6a" },
  { id: "coal", kind: "colour", name: "Coal that stays lit", line: "The orange deep inside a coal that refuses to go out.", hex: "#c98f3a" },
  { id: "wave", kind: "colour", name: "Wave blue", line: "The blue a wave shows just before it breaks into foam.", hex: "#3383a8" },
  { id: "petal", kind: "colour", name: "Pressed petal", line: "Pink, like a petal kept in a book of good days.", hex: "#e88bb1" },
  { id: "window", kind: "colour", name: "Window gold", line: "The gold of a window where someone waits up for you.", hex: "#eec26a" },
  { id: "dusk", kind: "colour", name: "Last-light violet", line: "The violet left in the sky after sunset, still holding on.", hex: "#8a6cc9" },
  { id: "aurora", kind: "sight", land: "summit", name: "Aurora over the peaks", line: "Green and pink over the peaks, as if the sky remembered a song." },
  { id: "hut", kind: "sight", land: "summit", name: "A house on the summit", line: "A tiny house up in the snow, smoke from its chimney. Somebody lives up there." },
  { id: "lighthouse", kind: "sight", land: "isle", name: "The lighthouse on the isle", line: "A light on a rock far out at sea. Someone keeps it lit, every single night." },
  { id: "boats", kind: "sight", land: "isle", name: "Boats coming home", line: "Little boats on a dark sea, all following the lighthouse home." },
  { id: "tracks", kind: "sight", land: "frost", name: "Footprints in the snow", line: "Snow on the frost fields, and small footprints across it. Someone else walks there." },
  { id: "icedoor", kind: "sight", land: "frost", name: "A door of ice", line: "Under a snowdrift, a door of ice, glowing softly from the inside." },
];
const SPARK = Object.fromEntries(SPARKS.map(s => [s.id, s]));
const SPARK_KINDS = [["song", "Songs"], ["colour", "Colours"], ["sight", "Sights"]];
/** The faraway lands the sights show, and what Pip makes of them once both sights of a land are home. */
const SPARK_LANDS = {
  summit: { name: "The summit", pip: "Aurora, and a house with smoke in the chimney. Even up where it's coldest, someone keeps warm. So can we." },
  isle: { name: "The isle", pip: "A lighthouse, and boats following it home. Somebody out at sea keeps a light for people they've never met. I want to be like that." },
  frost: { name: "The snowfields", pip: "Footprints in the snow, and a door that glows. We're not the only ones out there. That makes the dark a little smaller." },
};
const SCARF_RED = "#e0634f";

/**
 * Does a glowling bring a spark home, and which? Only sparks not found yet, so there's nothing to grind for.
 * An expedition: likelier the longer it was (1 h about 1 in 4, 8 h most of the time), and the very first spark is
 * certain, so it doesn't go unnoticed. Sights of the far lands come only from long expeditions (4 h or more).
 * A wander in the grotto (being out while home was full, or sent off on purpose): now and then, after an hour or more.
 */
function sparkRoll(hrs, got = {}, { trip = false, rnd = Math.random } = {}) {
  const pool = SPARKS.filter(s => !got[s.id] && (s.kind !== "sight" || (trip && hrs >= 4)));
  if (!pool.length || !(hrs > 0)) return null;
  const chance = trip ? (Object.keys(got).length ? Math.min(0.85, 0.18 + hrs * 0.08) : 1) : hrs < 1 ? 0 : Math.min(0.3, hrs * 0.05);
  if (rnd() >= chance) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))].id;
}
/** The save's sparks, made whole: what was found (when, and by whom), how many Pip has cheered, which lands he's told, the scarf dye. */
function sparkSaveOf(s) {
  s = s && typeof s === "object" ? s : {};
  const got = {};
  for (const [id, g] of Object.entries(s.got && typeof s.got === "object" ? s.got : {}))
    if (SPARK[id] && g && Number.isFinite(g.t)) got[id] = { t: g.t, by: typeof g.by === "string" ? g.by.slice(0, 40) : "" };
  const n = Object.keys(got).length, lands = {};
  for (const k of Object.keys(SPARK_LANDS)) if (s.lands && s.lands[k] === true) lands[k] = true;
  return { got, pip: Number.isFinite(s.pip) ? Math.max(0, Math.min(n, Math.floor(s.pip))) : n, lands, dye: got[s.dye] && SPARK[s.dye].kind === "colour" ? s.dye : null };
}
/** The scarf's colour: red, or the colour spark it was dyed with. */
const scarfTint = () => (typeof save === "object" && save.sparks && SPARK[save.sparks.dye]?.hex) || SCARF_RED;
const sparksGot = () => Object.keys(save.sparks.got).length;
const landSights = land => SPARKS.filter(s => s.land === land);
const landSeen = land => landSights(land).every(s => save.sparks.got[s.id]);

/** A glowling comes home with a spark: keep it, and show it once the room is quiet. Returns the spark, or null. */
function bringSpark(c, hrs, trip) {
  const id = sparkRoll(hrs, save.sparks.got, { trip });
  if (!id) return null;
  save.sparks.got[id] = { t: Date.now(), by: c.name };
  remember(c, "Brought home a spark: {0}", SPARK[id].name);
  game.sparkNew = [...(game.sparkNew || []), id];
  showNewSparks();
  return SPARK[id];
}
/** The toast's few words for a spark that just came home. */
const sparkNote = s => `✨ ${tr(s.name)}`;
/** Open the newest spark's card when nothing else is on screen (a chat, a sheet, a toast-heavy moment). */
function showNewSparks(wait = 1600) {
  setTimeout(() => {
    if (!game.sparkNew?.length) return;
    const busy = talkNow || game.scene !== "nest" || $$(".overlay.modal").some(o => !o.classList.contains("hidden"));
    if (busy) { if (game.scene === "nest") showNewSparks(1500); return; }
    const id = game.sparkNew.shift();
    openSpark(id, true);
  }, wait);
}

// ---------- hearing and seeing them ----------

/** Hum a song spark: a soft, breathy voice with a little echo (a bell rings instead of humming). */
function playSpark(id) {
  const s = SPARK[id];
  if (!s || s.kind !== "song" || !sfx.ready()) return;
  let t = sfx.ac.currentTime + 0.05;
  for (const [st, beats] of s.notes) {
    const f = s.root * Math.pow(2, st / 12), d = s.beat * beats;
    if (s.bell) { sfx.tone(t, f, 0.07, 1.8, "sine", null, true); sfx.tone(t, f * 2.76, 0.015, 0.6, "sine"); }
    else { sfx.tone(t, f, 0.05, d * 1.25 + 0.08, "triangle", null, true); sfx.tone(t, f * 2, 0.01, d * 0.6, "sine"); }
    t += d;
  }
}

const SPARK_W = 48, SPARK_H = 32, sparkArtCache = {};
/** A spark's little picture, 48×32 art pixels: a sight's vignette, a colour's swatch, a song's notes. */
function sparkArt(id) {
  if (sparkArtCache[id]) return sparkArtCache[id];
  const s = SPARK[id], W = SPARK_W, H = SPARK_H, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"), im = g.createImageData(W, H), d = im.data;
  const rgb = h => typeof h === "string" ? pxHex(h) : h;
  const mix = (a, b, k) => { a = rgb(a); b = rgb(b); return a.map((v, i) => Math.round(v + (b[i] - v) * k)); };
  const put = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 4, v = rgb(col); d[o] = v[0]; d[o + 1] = v[1]; d[o + 2] = v[2]; d[o + 3] = 255; };
  const get = (x, y) => { const o = (y * W + x) * 4; return [d[o], d[o + 1], d[o + 2]]; };
  /** Lay light over what's there, in three dithered steps: k from 0 (none) to 1 (full). */
  const glow = (x, y, col, k) => { if (x < 0 || y < 0 || x >= W || y >= H || k <= 0) return; const a = Math.floor(Math.min(1, k) * 3 + PX_BAYER[(y & 3) * 4 + (x & 3)]) / 3; if (a > 0) put(x, y, mix(get(x, y), col, a * 0.8)); };
  const sky = (ramp, top = 0, bot = H) => { for (let y = top; y < bot; y++) for (let x = 0; x < W; x++) put(x, y, pxPick(ramp, (y - top) / (bot - top), x, y)); };
  const stars = (bot, seed, n = 0.06) => { for (let y = 0; y < bot; y++) for (let x = 0; x < W; x++) if (pxHash(x + seed, y) < n * (1 - y / bot)) put(x, y, pxHash(y, x + seed) < 0.3 ? "#fff0b5" : "#d2bfff"); };
  const NIGHT = ["#0b0a24", "#141a3f", "#1f2b5c", "#2c3f78"];
  if (s.kind === "song" || s.kind === "colour") {
    // a dark card with a soft light of its own colour in the middle
    const col = s.kind === "song" ? s.tint : s.hex;
    const BG = "#140d2c", ramp = [BG, mix(BG, col, 0.12), mix(BG, col, 0.24), mix(BG, col, 0.36)];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, pxPick(ramp, 1 - Math.hypot((x - 24) / 26, (y - 16) / 17), x, y));
    if (s.kind === "colour") {
      // a round blob of paint, lit from the top left, with a drip
      const dark = mix(s.hex, "#160c26", 0.45), light = mix(s.hex, "#ffffff", 0.5);
      for (let y = 4; y < 29; y++) for (let x = 12; x < 37; x++) {
        const r = Math.hypot(x - 24, (y - 16) * 1.05);
        if (r > 11.5) continue;
        const lit = 1 - Math.hypot(x - 20, y - 12) / 16;
        put(x, y, r > 10.6 ? dark : pxPick([dark, s.hex, s.hex, light], lit, x, y));
      }
      for (let y = 26; y < 30; y++) put(28, y, y > 28 ? dark : s.hex);
      put(19, 10, "#ffffff"); put(20, 10, "#ffffff"); put(19, 11, "#ffffff");
    } else {
      // two joined notes, and a few lines of sound going out
      const ink = s.tint, deep = mix(s.tint, "#160c26", 0.4);
      const note = (x, y) => { for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [2, 1], [-1, 2], [0, 2], [1, 2], [0, 3], [1, 3]]) put(x + dx, y + dy, dy > 1 ? deep : ink); put(x, y, "#ffffff"); };
      note(15, 20); note(27, 17);
      for (let y = 7; y < 21; y++) put(17, y, ink);
      for (let y = 5; y < 18; y++) put(29, y, ink);
      for (let x = 17; x <= 29; x++) { const y = Math.round(7 - (x - 17) * 2 / 12); put(x, y, ink); put(x, y + 1, ink); }
      for (const [x, y] of [[36, 8], [37, 10], [38, 12], [8, 12], [7, 14], [6, 16], [36, 20], [37, 22]]) put(x, y, mix(ink, "#ffffff", 0.3));
    }
  } else if (id === "aurora") {
    sky(NIGHT, 0, 24); stars(22, 3);
    // two ribbons of light, green over pink, waving across the sky
    for (let x = 0; x < W; x++) {
      const yg = 8 + 3 * Math.sin(x * 0.22) + 1.5 * Math.sin(x * 0.09 + 1), yp = yg + 4 + Math.sin(x * 0.31);
      for (let y = 0; y < 24; y++) { glow(x, y, "#7fe0a8", 1.1 - Math.abs(y - yg) / 3.2 - (y < yg ? 0.25 : 0)); glow(x, y, "#ffc4da", 0.8 - Math.abs(y - yp) / 2.4); }
    }
    for (let x = 0; x < W; x++) {
      const ridge = Math.round(Math.min(20 + Math.abs(x - 14) * 0.7, 18 + Math.abs(x - 34) * 0.6, 27));
      for (let y = ridge; y < H; y++) put(x, y, y - ridge < 2 ? "#efe6ff" : pxPick(["#141a3f", "#262f5a", "#3a4862"], (x - 6) / 50 + (y - ridge) * 0.02, x, y));
    }
  } else if (id === "hut") {
    sky(NIGHT, 0, 32); stars(28, 9, 0.08);
    for (let x = 0; x < W; x++) {
      const ridge = Math.round(Math.min(13 + Math.abs(x - 24) * 0.9, 31));
      for (let y = ridge; y < H; y++) put(x, y, y - ridge < 3 + (x % 3 === 0 ? 1 : 0) ? "#efe6ff" : pxPick(["#1a2240", "#283247", "#3a4862"], x < 24 ? 0.8 : 0.3, x, y));
    }
    // the house on the very top: walls, a roof, a lit window, a chimney and its smoke
    for (let y = 9; y < 14; y++) for (let x = 21; x < 28; x++) put(x, y, "#946027");
    for (let k = 0; k < 4; k++) for (let x = 20 + k; x < 29 - k; x++) put(x, 8 - k, k === 0 ? "#efe6ff" : "#5e3a1c");
    put(23, 11, "#fff0b5"); put(24, 11, "#eec26a"); put(23, 12, "#eec26a"); put(24, 12, "#c98f3a");
    for (let y = 3; y < 7; y++) put(26, y, "#3a2440");
    for (const [x, y] of [[26, 2], [27, 1], [27, 0], [28, 0]]) put(x, y, "#8a8494");
    for (let y = 9; y < 20; y++) for (let x = 14; x < 34; x++) glow(x, y, "#fff0b5", 0.35 - Math.hypot(x - 23.5, (y - 11.5) * 1.4) / 18);
  } else if (id === "lighthouse") {
    sky(["#141a3f", "#2c2a66", "#5b3f8a", "#a0607a"], 0, 20); stars(14, 5);
    sky(["#1f2b5c", "#141a3f", "#0b0a24"], 20, 32);
    for (let y = 21; y < H; y++) for (let x = 0; x < W; x++) if (pxHash(x, y * 7) < 0.06) put(x, y, "#69b7d6");
    // the rock, the tower in red and white bands, the lamp and its beam over the water
    for (let y = 22; y < 28; y++) for (let x = 28 + (27 - y) * 0 - Math.floor((y - 22) / 2); x < 42 + Math.floor((y - 22) / 2); x++) put(x, y, pxPick(["#160c26", "#3a2440", "#5d5666"], 1 - (y - 22) / 6, x, y));
    for (let y = 10; y < 22; y++) for (let x = 33; x < 37; x++) put(x, y, Math.floor((y - 10) / 3) % 2 ? "#e0634f" : x === 33 ? "#e4dfe8" : "#ffffff");
    for (let x = 32; x < 38; x++) put(x, 9, "#3a2440");
    for (let x = 33; x < 37; x++) { put(x, 8, "#fff0b5"); put(x, 7, "#eec26a"); }
    for (let x = 32; x < 38; x++) put(x, 6, "#3a2440");
    // the beam: a wedge of light sweeping out to the left, fading with distance
    for (let x = 0; x < 33; x++) for (let y = 0; y < 22; y++) { const half = 0.8 + (33 - x) * 0.2, off = Math.abs(y - 7.5); if (off < half) glow(x, y, "#fff0b5", (0.85 - (33 - x) * 0.016) * (1 - off / half * 0.6)); }
    for (let y = 22; y < H; y++) for (let x = 30; x < 40; x++) glow(x, y, "#eec26a", (y % 2 ? 0.35 : 0) - Math.abs(x - 34.5) / 8);
  } else if (id === "boats") {
    sky(NIGHT, 0, 14); stars(12, 17);
    sky(["#1f2b5c", "#141a3f", "#0b0a24"], 14, 32);
    for (let y = 15; y < H; y++) for (let x = 0; x < W; x++) if (pxHash(x * 3, y) < 0.05) put(x, y, "#3383a8");
    // the far light on the horizon, its long reflection, and three boats with lanterns heading for it
    put(40, 12, "#fff0b5"); put(40, 13, "#eec26a"); put(39, 13, "#ffffff");
    for (let y = 14; y < H; y++) for (let x = 36; x < 45; x++) glow(x, y, "#eec26a", 0.55 - Math.abs(x - 40) / (1.5 + (y - 14) * 0.25));
    for (const [bx, by, n] of [[8, 25, 6], [19, 21, 5], [29, 18, 4]]) {
      for (let k = 0; k < n; k++) put(bx + k, by, "#5e3a1c");
      for (let k = 1; k < n - 1; k++) put(bx + k, by + 1, "#3a2440");
      put(bx + 1, by - 1, "#946027"); put(bx + 1, by - 2, "#946027"); put(bx + 2, by - 2, "#fff0b5");
      for (let y = by - 4; y < by + 4; y++) for (let x = bx - 2; x < bx + 6; x++) glow(x, y, "#fff0b5", 0.3 - Math.hypot(x - bx - 2, y - by + 2) / 8);
    }
  } else if (id === "tracks") {
    sky(["#1f2b5c", "#2f4a66", "#4f7fa3"], 0, 13);
    for (let y = 13; y < H; y++) for (let x = 0; x < W; x++) put(x, y, pxPick(["#7fa8d9", "#b9c8ff", "#e4ecff", "#ffffff"], (y - 13) / 19 + pxFbm(x / 9, y / 5) * 0.4 - 0.2, x, y));
    for (let x = 0; x < W; x++) { const top = 13 - Math.round(2 * pxSmooth(0, 1, Math.sin(x * 0.12) * 0.5 + 0.5)); for (let y = top; y < 13; y++) put(x, y, "#b9c8ff"); }
    // a winding line of small footprints, closer and bigger toward you
    for (let k = 0; k < 9; k++) {
      const y = 15 + k * 2, x = 30 - k * 2 + Math.round(Math.sin(k * 0.9) * 2), side = k % 2 ? 1 : -1;
      put(x + side, y, "#7fa8d9"); if (k > 3) put(x + side + 1, y, "#7fa8d9"); if (k > 6) put(x + side, y + 1, "#7fa8d9");
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pxHash(x * 5, y * 3) < 0.025) put(x, y, "#ffffff");
  } else if (id === "icedoor") {
    sky(NIGHT, 0, 32); stars(20, 23);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const drift = 12 + Math.pow(Math.abs(x - 24) / 24, 1.6) * 16;
      if (y >= drift) put(x, y, pxPick(["#7fa8d9", "#b9c8ff", "#e4ecff"], 1 - (y - drift) / 20 - (x > 24 ? 0.2 : 0), x, y));
    }
    // an arch of ice in the drift, lit from inside
    for (let y = 15; y < 30; y++) for (let x = 18; x < 31; x++) {
      const inArch = y > 20 ? Math.abs(x - 24.5) < 5.5 : Math.hypot(x - 24.5, y - 20.5) < 5.5;
      const inDoor = y > 20 ? Math.abs(x - 24.5) < 4 : Math.hypot(x - 24.5, y - 20.5) < 4;
      if (inDoor) put(x, y, pxPick(["#3383a8", "#69b7d6", "#b8e6f5", "#ffffff"], 1 - Math.hypot(x - 24.5, y - 25) / 7, x, y));
      else if (inArch) put(x, y, "#e4ecff");
    }
    for (let y = 22; y < 30; y++) put(24, y, "#3383a8");
    for (let y = 8; y < H; y++) for (let x = 8; x < 40; x++) glow(x, y, "#b8e6f5", 0.45 - Math.hypot(x - 24.5, y - 23) / 14);
  }
  g.putImageData(im, 0, 0);
  return (sparkArtCache[id] = c.toDataURL());
}

// ---------- the card: a spark up close (fresh from a trip, or tapped in the Book) ----------

const kindName = s => tr({ song: "song", colour: "colour", sight: "sight" }[s.kind]);
function openSpark(id, fresh = false) {
  const s = SPARK[id], got = save.sparks.got[id];
  if (!s) return;
  sfx.tick();
  // the card is shared with glowlings and geodes: the spark look comes off when it closes
  if (!$("spCard").dataset.spark) $("spClose").addEventListener("click", () => $("spImg").classList.remove("spark-img", "unk"));
  $("spCard").dataset.spark = id;
  $("spImg").src = sparkArt(id);
  $("spImg").classList.add("spark-img");
  $("spImg").classList.toggle("unk", !got);
  $("spName").textContent = got ? tr(s.name) : "???";
  $("spRarity").textContent = tr("Spark of inspiration · {0}", kindName(s));
  $("spRarity").className = "rarity r-spark";
  $("spLore").textContent = got ? tr(s.line) : s.kind === "sight" ? tr("Still out there, past the valley. Sights only come home from long expeditions, 4 hours or more.") : tr("Still out there. Glowlings bring sparks home from exploring and from expeditions.");
  let facts = "";
  if (got) {
    facts = tr("From {0}'s travels · {1}", got.by || "?", new Date(got.t).toLocaleDateString(LOCALE));
    if (s.kind === "song") facts += `<div class="spark-acts"><button class="act buy" data-spark-play>${ic("sound")}${tr("Hum it again")}</button></div>`;
    if (s.kind === "colour") {
      const on = save.sparks.dye === id;
      facts += `<div class="spark-acts">${on ? `<button class="act" data-spark-dye="">${ic("heart")}${tr("Back to the red scarf")}</button>` : `<button class="act buy" data-spark-dye="${id}">${ic("heart")}${tr("Knit the scarves in this colour")}</button>`}</div>`
        + `<small class="spark-note">${on ? tr("Every cozy scarf in the nest is this colour now.") : tr("Every cozy scarf in the nest takes this colour (Chest → Wear).")}</small>`;
    }
    if (s.kind === "sight") {
      const all = landSights(s.land), seen = all.filter(x => save.sparks.got[x.id]).length;
      facts += `<br>${tr("{0}: {1} of {2} sights home", tr(SPARK_LANDS[s.land].name), seen, all.length)}` + (seen === all.length ? ` · ${tr("Pip has something to say")}` : "");
    }
  }
  $("spFacts").innerHTML = facts;
  $$("#spFacts [data-spark-play]").forEach(b => b.addEventListener("click", () => playSpark(id)));
  $$("#spFacts [data-spark-dye]").forEach(b => b.addEventListener("click", () => dyeScarves(b.dataset.sparkDye || null)));
  show("spCard", true);
  if (got && s.kind === "song") setTimeout(() => playSpark(id), fresh ? 300 : 120);
  else if (fresh) sfx.shimmer();
  if (fresh && game.scene === "lib") renderLib();
}
/** Dye every scarf in the nest with a colour spark (or back to red). */
function dyeScarves(id) {
  if (id && !save.sparks.got[id]) return;
  save.sparks.dye = id;
  persist(); sfx.levelUp();
  toast(id ? tr("Scarves knitted in {0} ✦", tr(SPARK[id].name).toLowerCase()) : tr("Scarves back to red ✦"));
  if (game.scene === "nest") renderNest(true);
  updateTopbar();
  openSpark(id || $("spCard").dataset.spark);
}

// ---------- the Book's Sparks page ----------

function renderSparkLib() {
  const n = sparksGot();
  $("libSub").textContent = tr("{0} of {1} sparks. Glowlings bring them home from exploring: songs to hum, colours for the scarves, and sights of the lands past the valley.", n, SPARKS.length);
  $("libGrid").innerHTML = SPARK_KINDS.map(([kind, title]) => {
    const list = SPARKS.filter(s => s.kind === kind);
    return `<section class="spark-sec"><h3 class="spark-h">${tr(title)} <span>${list.filter(s => save.sparks.got[s.id]).length}/${list.length}</span></h3><div class="spark-grid">` + list.map((s, i) => {
      const got = save.sparks.got[s.id];
      return `<button data-spark="${s.id}" class="${got ? "" : "unk"}" style="animation-delay:${i * 20}ms"><span class="pg"><img class="lib-px spark-px" src="${sparkArt(s.id)}" alt=""></span><b>${got ? tr(s.name) : "???"}</b><small>${s.kind === "sight" ? tr(SPARK_LANDS[s.land].name) : kindName(s)}${save.sparks.dye === s.id ? " · 🧣" : ""}</small></button>`;
    }).join("") + "</div></section>";
  }).join("");
  $$("#libGrid [data-spark]").forEach(b => b.addEventListener("click", () => openSpark(b.dataset.spark)));
}

// ---------- Pip at the camp: he's the one who leads the expeditions, so he wants to hear about every spark ----------

/** Something new for Pip to say about sparks: a land whose sights are all home, or new sparks since he last heard. */
const sparkNews = () => sparksGot() > save.sparks.pip || Object.keys(SPARK_LANDS).some(k => landSeen(k) && !save.sparks.lands[k]);
/** Pip's line about sparks, if he has one: news first (once each), then now and then a land he's already talked about. */
function sparkPipLine() {
  const s = save.sparks, n = sparksGot();
  const land = Object.keys(SPARK_LANDS).find(k => landSeen(k) && !s.lands[k]);
  if (land) { s.lands[land] = true; s.pip = n; return tr(SPARK_LANDS[land].pip); }
  if (n > s.pip) {
    const fresh = n - s.pip, last = Object.entries(s.got).sort((p, q) => q[1].t - p[1].t)[0];
    s.pip = n;
    return fresh > 1 ? tr("Your glowlings brought home {0} new sparks! Songs, colours, faraway places. I've written them all in the Book.", fresh)
      : tr("{0} came home with a spark in their eyes: “{1}”. I've written it in the Book, under Sparks.", last[1].by || "?", tr(SPARK[last[0]].name));
  }
  const told = Object.keys(s.lands);
  return told.length && Math.random() < 0.3 ? tr(SPARK_LANDS[pick(told)].pip) : null;
}

if (typeof module === "object" && module.exports) module.exports = { SPARKS, SPARK, SPARK_LANDS, sparkRoll, sparkSaveOf };
