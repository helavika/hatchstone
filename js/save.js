"use strict";
// Hatchstone · the save, layout, quality settings and game state.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- save ----------

// Progress is precious: a main save, a "last good" copy, and care when several tabs are open.
const SAVE_KEY = STAGING ? "hatchstone.staging.save" : LIVE_SAVE_KEY, BAK_KEY = SAVE_KEY + ".bak";
const SAVE_VERSION = 1;
const DUST_MAX = 3; // dust bunnies on the nest floor at most (see gatherDust)
const freshSave = () => ({ v: SAVE_VERSION, rev: 0, shards: 30, stars: {}, creatures: [], active: null, seen: {}, geodes: {}, decor: {}, forge: {}, nextId: 1, rooms: [{ kind: "nest", on: [] }, { kind: "yard", on: [] }], room: 0, bars: { firefly: 2, nut: 1 }, oil: { n: 5, t: 0 }, dust: [], dustT: 0 });
const validSave = d => d && typeof d === "object" && Array.isArray(d.creatures) && typeof d.stars === "object";

let startedEmpty = true; // no nest in storage when this page opened

function loadSave() {
  for (const key of [SAVE_KEY, BAK_KEY]) {
    let raw = null;
    try { raw = localStorage.getItem(key); } catch {}
    if (!raw) continue;
    try {
      const d = JSON.parse(raw);
      if (validSave(d)) { startedEmpty = false; return migrate(Object.assign(freshSave(), d)); }
    } catch {}
    // keep a damaged save aside instead of throwing it away
    try { localStorage.setItem(SAVE_KEY + ".damaged", raw); } catch {}
  }
  return freshSave();
}

/** Older saves get whatever newer versions added; big geode pictures are dropped and redrawn small. */
function migrate(d) {
  d.geodes = d.geodes || {}; d.decor = d.decor || {}; d.seen = d.seen || {}; d.forge = d.forge || {};
  for (const g of Object.values(d.geodes)) if (g.img && g.img.length > 60000) delete g.img;
  // Sproutle was renamed Sprigglet: glowlings still wearing the old species name take the new one
  const renamed = n => n === "Sproutle" ? "Sprigglet" : n === "✦ Sproutle" ? "✦ Sprigglet" : n;
  for (const cr of d.creatures || []) {
    cr.name = renamed(cr.name);
    if (cr.mix && cr.mix.parents) cr.mix.parents = cr.mix.parents.map(renamed);
  }
  for (const h of d.hybrids || []) if (h.parents) h.parents = h.parents.map(renamed);
  if (!Array.isArray(d.rooms) || !d.rooms.length) { d.rooms = [{ kind: "nest", on: [] }]; d.room = 0; }
  if (!(d.room >= 0 && d.room < d.rooms.length)) d.room = 0;
  // everyone has a way outside, to the garden
  if (!d.rooms.some(r => r.kind === "yard")) d.rooms.push({ kind: "yard", on: [] });
  if (!d.bars) d.bars = { firefly: 2, nut: 1 };
  if (!d.oil || !Number.isFinite(d.oil.n)) d.oil = { n: 5, t: 0 };
  // dust bunnies used to belong to each glowling and showed up in every room: now they're the nest's own, three at most
  const dust = [d.dust, ...(d.creatures || []).map(c => c.dust)].flatMap(a => Array.isArray(a) ? a : []);
  d.dust = dust.filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)).slice(0, DUST_MAX);
  for (const cr of d.creatures || []) delete cr.dust;
  if (!Number.isFinite(d.dustT)) d.dustT = 0;
  d.v = SAVE_VERSION;
  return d;
}

const save = loadSave();
let lastBak = 0, saveWarned = false;

function persist() {
  // another tab saved newer progress: take theirs instead of overwriting it
  try {
    const theirs = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    // (and a page that opened with no nest must never overwrite one that appeared since, e.g. in another tab)
    if (theirs && validSave(theirs) && ((theirs.rev || 0) > save.rev || (startedEmpty && !save.rev && theirs.creatures.length))) { adoptSave(theirs); return; }
  } catch {}
  save.rev = (save.rev || 0) + 1;
  if (!store.set(SAVE_KEY, save)) {
    // storage is full: geode pictures can be redrawn, progress can't
    for (const g of Object.values(save.geodes)) delete g.img;
    if (store.set(SAVE_KEY, save)) return;
    try { localStorage.removeItem(BAK_KEY); } catch {}
    if (!store.set(SAVE_KEY, save) && !saveWarned) { saveWarned = true; toast(tr("Couldn't save: tap backup and keep a backup code")); }
    return;
  }
  if (Date.now() - lastBak > 30000) { lastBak = Date.now(); store.set(BAK_KEY, save); }
}

function adoptSave(d) {
  if (!validSave(d)) return;
  for (const k of Object.keys(save)) delete save[k];
  Object.assign(save, migrate(Object.assign(freshSave(), d)));
  actors.clear();
  if (game.scene === "nest") renderNest(true);
  if (game.scene === "map") renderMap();
  if (game.scene === "lib") renderLib();
  updateTopbar();
}

// keep tabs in step: when another tab saves, this one follows
addEventListener("storage", e => {
  if (e.key !== SAVE_KEY || !e.newValue) return;
  try { const d = JSON.parse(e.newValue); if (d.rev > save.rev) adoptSave(d); } catch {}
});
// save when the app goes to the background (phones may close it without warning)
addEventListener("visibilitychange", () => { if (document.hidden) { persist(); store.set(BAK_KEY, save); } });

// phones pause a page's sound when the screen locks, you switch apps, a call comes in or another app plays.
// The sound used to wake only once, on Begin; now it goes quiet while hidden and comes back on return or the next touch
function wakeAudio() {
  const ac = sfx.ac;
  if (ac && !document.hidden && ac.state !== "running" && ac.state !== "closed") ac.resume().catch(() => {});
}
for (const ev of ["pointerdown", "touchend", "keydown"]) addEventListener(ev, wakeAudio, { capture: true, passive: true });
addEventListener("visibilitychange", () => { if (document.hidden) sfx.ac?.state === "running" && sfx.ac.suspend().catch(() => {}); else wakeAudio(); });
addEventListener("pageshow", wakeAudio);
addEventListener("focus", wakeAudio);
addEventListener("pagehide", () => persist());
const activeCreature = () => save.creatures.find(c => c.id === save.active) || save.creatures[0] || null;
const totalStars = () => Object.values(save.stars).reduce((s, v) => s + v, 0);
const unlocked = n => n === 1 || (save.stars[n - 1] || 0) > 0;

/** Real time passes in the nest too, gently: needs drift down, sleep refills energy. */
function applyTime(cr, now = Date.now()) {
  const min = clamp((now - (cr.last || now)) / 60000, 0, 24 * 60);
  cr.last = now;
  if (min <= 0) return;
  // out exploring: having a lovely time, needing nothing
  if (cr.out) return;
  if (cr.sleeping) {
    cr.energy = clamp(cr.energy + min * 12, 0, 100);
    cr.tummy = clamp(cr.tummy - min * 0.25, 0, 100);
  } else {
    // awake time makes a little mess (gatherDust turns it into dust bunnies in the nest), and an untidy nest wears
    // joy down a little faster for those who live in it
    const dust = roomOf(cr) === nestRoom() ? (save.dust || []).length : 0;
    cr.tummy = clamp(cr.tummy - min * 0.5, 0, 100);
    cr.joy = clamp(cr.joy - min * (0.4 + dust * 0.15), 0, 100);
    cr.energy = clamp(cr.energy - min * 0.25, 0, 100);
    cr.messT = (cr.messT || 0) + min;
  }
}

// ---------- dust bunnies: only ever in the nest, and always in the same order ----------
// 1. Every minute a glowling is awake at home (not asleep, not out exploring) winds the nest's dust clock, shared out
//    among everyone so a full house is no messier than one glowling (a snack's crumbs wind it a little more).
// 2. Every MESS_MIN minutes on the clock one bunny lands on the nest floor, one at a time, up to DUST_MAX. Never while
//    someone sleeps in the nest: it waits until they're up. Time away is caught up quietly when the game opens.
// 3. Watched in the nest, it pops in with a puff and the nearest glowling looks round with "!" (dustLanded).
// 4. The first one, a ghost finger taps it; from two on, the nest's glowlings call you ("messy": the Nest tab's "!",
//    their "!" bubbles and the hint, which shows only in the nest).
// 5. A tap sweeps it (sweepDust): a puff, +1 ✦, the nearest glowling cheers ♥, everyone in the nest gets joy back.
//    A full nest's clock stops at half, so a swept nest stays tidy for a while.
const MESS_MIN = 45;
const nestRoom = () => save.rooms.findIndex(r => r.kind === "nest");

/** Catch up everyone's time and wind the dust clock: returns the bunny that just landed, if one did. */
function gatherDust() {
  for (const cr of save.creatures) applyTime(cr);
  const n = Math.max(1, save.creatures.length), nest = nestRoom(), dust = save.dust = save.dust || [];
  for (const cr of save.creatures) if (cr.messT) { save.dustT = (save.dustT || 0) + cr.messT / n; cr.messT = 0; }
  let d = null;
  if (nest >= 0 && dust.length < DUST_MAX && save.dustT >= MESS_MIN && !residents(nest).some(c => c.sleeping)) {
    dust.push(d = [Math.round(Math.random() * 100) / 100, Math.round(Math.random() * 100) / 100]);
    save.dustT -= MESS_MIN;
  }
  if (dust.length >= DUST_MAX) save.dustT = Math.min(save.dustT, MESS_MIN / 2);
  return d;
}

/** What a glowling is calling you for, if anything: gently, the way a Tamagotchi beeps. */
function callOf(cr) {
  if (cr.sleeping || cr.out) return "";
  if (cr.tummy < 25) return "hungry";
  if (cr.energy < 20) return "sleepy";
  if ((save.dust || []).length >= 2 && roomOf(cr) === nestRoom()) return "messy";
  if (cr.joy < 25) return "lonely";
  return "";
}

/** A little "!" on the Nest tab whenever someone at home needs you. */
function updateCalls() {
  const t = document.querySelector('#tabs [data-tab="nest"]');
  if (!t) return;
  // looks ahead on a copy: just checking must never change the save
  const n = save.creatures.filter(c => { const p = { ...c }; applyTime(p); return callOf(p); }).length;
  t.classList.toggle("call", n > 0 && game.scene !== "nest");
  checkPlaces();
  $("worldTab")?.classList.toggle("call", (!moonDone() && game.scene !== "map") || (placeOk("forge") && canForge()) || (placeOk("garden") && ripePlots() > 0) || (save.mapFresh || []).length > 0 || (!!save.incubator && Date.now() >= save.incubator.due && !incHere()));
}

function moodOf(cr) {
  if (cr.sleeping) return "asleep";
  if (cr.energy < 20) return "sleepy";
  if (cr.tummy < 25) return "hungry";
  if (cr.joy < 25) return "sad";
  if (cr.joy > 70 && cr.tummy > 50) return "happy";
  return "ok";
}

function addXP(cr, n) {
  if (cr.level >= MAX_LEVEL) return;
  cr.xp += Math.round(n * (1 + skill("care") * 0.1));
  while (cr.level < MAX_LEVEL && cr.xp >= xpNeed(cr.level)) {
    cr.xp -= xpNeed(cr.level);
    const before = stageOf(cr.level);
    cr.level++;
    const grew = stageOf(cr.level) !== before;
    if (grew) remember(cr, "Grew up: now {0}", STAGES[stageOf(cr.level)]);
    if (grew && stageOf(cr.level) === 1) { if (game.scene === "nest") setTimeout(() => talk("firstGrow", cr), 900); else talkLater.push(["firstGrow", cr]); }
    giveBar("firefly");
    toast((grew ? tr("{0} grew up: now {1}! ✦", cr.name, STAGES[stageOf(cr.level)]) : tr("{0} reached level {1} ✦", cr.name, cr.level)) + " · " + tr("{0} +1", barName("firefly")));
    sfx.levelUp();
    const a = actors.get(cr.id);
    if (game.scene === "nest" && a) { const v = actorView(a); burst(v.x, v.y, grew ? 40 : 18, ["#fff", ...palOf(specOf(cr))], grew ? 1.6 : 1); }
  }
  if (cr.level >= MAX_LEVEL) cr.xp = 0;
}

// ---------- layout ----------

const cvs = $("c");
const screen = cvs.getContext("2d");
// The world is drawn small, then every frame is snapped to one cute-gothic palette with ordered dithering and
// blown up with hard edges: eggs, glowlings, the nest and every effect come out as the same pixel art.
const low = document.createElement("canvas");
let ctx = low.getContext("2d", { willReadFrequently: true }); // let: bakeSprite() lends it out for a moment
const fxCanvas = $("fx"), fx = fxCanvas.getContext("2d");
const PIXEL_FONT = '"Jersey 15", ui-rounded, system-ui, sans-serif';
let W = 0, H = 0, DPR = 1, PX = 3;
const L = {}; // the egg
const N = {}; // the nest
const PAD = 8;

function eggPoly(cx, cy, w, h, n = 96) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / n * TAU, py = -Math.cos(t), px = Math.sin(t) * (1 + 0.14 * py);
    pts.push([cx + px * w / 2, cy + py * h / 2]);
  }
  return pts;
}

/** Every screen gets the tight layout now (needs on the buttons, low tabs, one-line header), so the room has the space;
 *  the narrowest phones also move ? and language into the menu. */
function screenFit() {
  document.body.classList.toggle("compact", true);
  document.body.classList.toggle("narrow", W < 360);
  document.body.classList.toggle("phone", W < 600);
}

function computeLayout() {
  screenFit();
  const top = 100, bottom = 96;
  L.ew = clamp(Math.min(W * 0.62, (H - top - bottom - 40) / 1.28), 170, 400);
  L.eh = L.ew * 1.28;
  L.k = L.ew / 240;
  L.ecx = W / 2;
  L.ecy = top + (H - top - bottom) / 2 - 6;
  L.ex0 = L.ecx - L.ew / 2;
  L.ey0 = L.ecy - L.eh / 2;
  L.floor = L.ecy + L.eh / 2;
  L.egg = eggPoly(L.ecx, L.ecy, L.ew, L.eh);
  // the nest leaves room for the name above and the needs, buttons and tabs below
  const compact = true;
  const nTop = compact ? 98 : 116, nBottom = H - (compact ? 206 : 280), roomW = Math.min(W * 0.92, 760);
  N.top = nTop;
  N.base = clamp(Math.min(W * 0.18, (nBottom - nTop) * 0.28), 56, 120);
  N.x0 = W / 2 - roomW / 2 + N.base * 0.5; N.x1 = W / 2 + roomW / 2 - N.base * 0.5;
  N.y0 = nTop + (nBottom - nTop) * 0.45; N.y1 = nBottom - 24;
  // the room around them: the floor widens toward you, the back wall stands behind it
  N.cx = W / 2;
  N.back = N.y0 - N.base * 0.3; N.front = N.y1 + N.base * 0.5;
  N.hf = roomW / 2; N.hb = roomW / 2 * 0.84;
  N.wallTop = Math.max(64, nTop - 56);
  N.dk = W < 520 ? 0.82 : 1; // decorations a touch smaller on a phone, so the room doesn't feel stuffed
  const wr = Math.min(N.hb * 0.3, (N.back - N.wallTop) * 0.3);
  N.win = { x: N.cx, y: lerp(N.back, N.wallTop, 0.5), r: wr };
  // the isometric room: a diamond of floor with two walls behind it, like a little diorama
  N.iso = roomView() === "iso";
  // the room arrows hug the room's sides (on a wide screen, not the far edges of it)
  document.body.style.setProperty("--room-mid", Math.round((nTop + nBottom) / 2) + "px");
  document.body.style.setProperty("--room-side", Math.max(6, Math.round(W / 2 - (N.iso ? Math.min(W * 0.47, 400, (nBottom - nTop) * 0.9) : roomW / 2) - 64)) + "px");
  if (N.iso) {
    const room = nBottom - nTop;
    N.isoW = Math.min(W * 0.47, 400, room * 0.9); N.isoH = N.isoW / 2;
    // taller walls on tall screens (more wall for the window, shelf and painting); any space left over goes above and below evenly
    N.isoWall = clamp(room - N.isoW - 4, N.base * 1.2, N.isoW * 1.25);
    N.isoTop = nBottom - N.isoW - 6 - Math.max(0, room - N.isoW - 4 - N.isoWall) / 2;
    N.y0 = N.isoTop; N.y1 = N.isoTop + N.isoW;
    N.wallTop = N.isoTop - N.isoWall;
    N.back = N.isoTop + N.isoH; N.front = N.y1 + 10;
    N.x0 = N.cx - N.isoW; N.x1 = N.cx + N.isoW;
    N.dk = W < 520 ? 0.8 : 0.92;
  }
  [N.bedX, N.bedY] = roomSpot("bed");
}

/** Which way the room is seen: isometric (the default) or straight on. ?view=front tries it without saving. */
function roomView() {
  const q = /[?&]view=(iso|front)\b/.exec(location.search);
  if (save.rooms && isOutside()) return "iso";
  return q ? q[1] : save.view === "front" ? "front" : "iso";
}
/** Isometric floor coordinates: u runs from the back corner to the right corner, v from the back corner to the left one. */
const isoAt = (u, v) => [N.cx + (u - v) * N.isoW, N.isoTop + (u + v) * N.isoH];
const isoFrom = (x, y) => { const a = (x - N.cx) / N.isoW, b = (y - N.isoTop) / N.isoH; return [(a + b) / 2, (b - a) / 2]; };
/** The top of the back walls above a point (they meet at the back corner). */
const isoWallTop = x => N.isoTop + Math.min(1, Math.abs(x - N.cx) / N.isoW) * N.isoH - N.isoWall;
const isoMargin = k => k * N.base / (1.118 * N.isoW);

/** A point on the floor: u from the left wall (0) to the right (1), v from the back (0) to the front (1). */
function floorAt(u, v) {
  if (N.iso) { const m = isoMargin(0.5); return isoAt(lerp(m, 1 - m, u), lerp(m, 1 - m, v)); }
  const y = lerp(N.y0, N.y1, v), h = floorHalf(y) - N.base * 0.55;
  return [N.cx + (u * 2 - 1) * h, y];
}
const floorHalf = y => lerp(N.hb, N.hf, clamp((y - N.back) / (N.front - N.back), 0, 1));
/** A point on the back wall: u across, h from the floor line (0) up to the top (1). */
const wallAt = (u, h) => [N.cx + (u * 2 - 1) * (N.hb - N.base * 0.55), lerp(N.back, N.wallTop, h)];

/** Every piece of furniture has its own place, so nothing stands on top of anything else:
 *  the left side has the lamp (under the shelf), the incubator and the mushrooms (back to front), the right side the spring and the bed,
 *  the cloud cushion sits under the window for naps in the moonlight, the rug lies in the middle,
 *  and the shelf, window, lights and swing are on the back wall. */
const ROOM_SLOTS = {
  lamp: [0, 0.02], incubator: [0.02, 0.5], mushrooms: [0.1, 0.94],
  spring: [0.98, 0.06], cushion: [0.5, 0], bed: [0.97, 0.94],
  rug: [0.5, 0.56],
  // the pieces drawn for the isometric room stand here when the room is seen straight on
  bookcase: [0.22, 0], plant: [0.36, 0.02], armchair: [0.72, 0.06], chest: [1, 0.48], table: [0.78, 0.52], musicbox: [0.36, 0.98], bench: [0.6, 0.04], lamppost: [0.08, 0.02], birdbath: [0.62, 0.98], drum: [0.24, 0.96], blocks: [0.84, 0.97], telescope: [0.9, 0.05],
};
// a wide, shallow room (a computer screen) spreads the front pieces inward instead, so they don't stand in front of the middle ones
const ROOM_SLOTS_WIDE = { ...ROOM_SLOTS, incubator: [0, 0.62], mushrooms: [0.2, 0.96], bed: [0.85, 0.9] };
// isometric: [u, v] on the diamond. The left wall has the window with the cloud under it, the lamp in the back corner
// and the incubator; the right wall has the shelf, the spring and the swing, the bed in its corner; mushrooms in front
const ROOM_SLOTS_ISO = { lamp: [0.06, 0.08], cushion: [0.05, 0.5], incubator: [0.1, 0.86], spring: [0.36, 0.06], bed: [0.9, 0.1], mushrooms: [0.92, 0.9], rug: [0.5, 0.5] };
function roomSpot(id) {
  if (N.iso && id === "cushion") { const [u, v] = cloudUV(); return isoAt(u, v); }
  if (N.iso && isoLayout().placed[id]) { const p = isoLayout().placed[id]; return isoPieceAt(p, id === "bed" || id === "cushion" || id === "incubator" ? 0 : 0.55); }
  if (N.iso) {
    if (id === "shelf") { const m = wallSlot("shelf"), [x, y] = wallFoot(m.wall, m.s); return [x, y - N.isoWall * 0.5 + N.base * 0.95 * N.dk]; }
    if (id === "swing") { const [x, y] = floorAt(0.42, 0.04); return [x, y + N.base * 0.55]; }
    if (id === "lights") return [N.cx, N.wallTop];
    if (id === "rug" && save.layout && save.layout.rug) return isoAt(save.layout.rug.u, save.layout.rug.v);
    const [u, v] = ROOM_SLOTS_ISO[id] || [0.5, 0.5];
    return floorAt(u, v);
  }
  if (id === "shelf") { const [x, y] = wallAt(0.12, 0.4); return [x, y + N.base * 0.95 * N.dk]; }
  if (id === "swing") { const [x] = wallAt(0.9, 0); return [x, N.back + N.base * 0.62]; }
  if (id === "lights") return [N.cx, N.wallTop];
  const slots = N.hf * 2 / (N.y1 - N.y0) > 2.6 ? ROOM_SLOTS_WIDE : ROOM_SLOTS;
  const [u, v] = slots[id] || [0.5, 0.5];
  return floorAt(u, v);
}
/** How big things are drawn at a depth: smaller toward the back wall. */
const depthK = y => N.iso ? N.dk : lerp(0.78, 1, clamp((y - N.y0) / (N.y1 - N.y0), 0, 1)) * N.dk;
const rugSize = () => N.iso ? [N.isoW * 0.36, N.isoW * 0.18] : [Math.min(N.hf * 0.4, N.base * 2.1), (N.y1 - N.y0) * 0.26];

// ---------- quality: step resolution down if the device can't keep up ----------

const quality = {
  dpr: 1, low: false, pxStep: 0, pinned: /[?&]q=high\b/.test(location.search), gaps: [], works: [], slow: 0, quietUntil: 0,
  /** Hold off judging for a few seconds (after loading, a scene change or a new pixel size, pictures are being baked). */
  settle(ms = 4000) { this.quietUntil = performance.now() + ms; this.gaps.length = this.works.length = 0; },
  /**
   * gap: time between frames; work: time the game itself spent on the frame. A device is slow only if the game's own work
   * is heavy, or frames come less than ~22 times a second, twice in a row; a 30-frame cap (battery saver) isn't slowness.
   */
  sample(gap, work) {
    if (this.pinned || game.scene === "menu" || gap > 250 || document.hidden || performance.now() < this.quietUntil) return;
    this.gaps.push(gap); this.works.push(work);
    if (this.gaps.length < 120) return;
    const med = a => a.slice().sort((p, q) => p - q)[a.length >> 1], g = med(this.gaps), w = med(this.works);
    this.gaps.length = this.works.length = 0;
    if (w < 14 && g < 45) { this.slow = 0; return; }
    if (++this.slow < 2) return;
    this.slow = 0;
    // first, coarser art pixels (a quarter of the work per step); then a lower screen resolution
    if (this.pxStep < (this.pxLevels || 2) - 1 && !/[?&]px=/.test(location.search)) { this.pxStep++; refit(); return; }
    if (this.dpr > 1) { this.dpr = Math.max(1, this.dpr - 0.5); sizeCanvas(); }
    else if (!this.low) { this.low = true; document.body.classList.add("low"); }
  },
};

function sizeCanvas() {
  // about 195 art pixels across a phone (2 screen pixels each): small enough for detail, big enough to read as pixels
  const pxTry = /[?&]px=(0\.5|[1-5])(?![\d.])/.exec(location.search);
  // fine pixels: on sharp screens half a CSS pixel (one or two real screen pixels each), so every sprite has twice the detail;
  // a device that can't keep up steps back to coarser ones, a level at a time (see quality)
  // (the egg is drawn live every frame and fills the screen, so cracking keeps the regular pixel size)
  // (art pixels used to be half a CSS pixel on sharp screens; they're a whole one now, so the pixel art reads as pixel art)
  const base = clamp(Math.ceil(Math.min(W, H * 0.6) / 400), 1, 4), fine = base;
  const levels = [...new Set([fine, base, base + 1])];
  quality.pxLevels = levels.length;
  PX = pxTry ? +pxTry[1] : levels[Math.min(quality.pxStep, levels.length - 1)];
  low.width = cvs.width = Math.ceil(W / PX); low.height = cvs.height = Math.ceil(H / PX);
  cvs.style.width = cvs.width * PX + "px"; cvs.style.height = cvs.height * PX + "px";
  ctx.setTransform(1 / PX, 0, 0, 1 / PX, 0, 0);
  ctx.imageSmoothingEnabled = true;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  fxCanvas.width = Math.round(W * dpr); fxCanvas.height = Math.round(H * dpr);
  fxCanvas.style.width = W + "px"; fxCanvas.style.height = H + "px";
  fx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// the palette: ink and plum nights, lilac, rose, candle gold, celestite, moss, bone, ember and old stone
const PIXEL_PALETTE = [
  "#0b0614", "#160c26", "#22143a", "#2e1d4f", "#3d2866", "#523a85",
  "#6b4fa8", "#8a6cc9", "#ad91e6", "#d2bfff", "#efe6ff",
  "#5c1f3f", "#8f3460", "#c25586", "#e88bb1", "#ffc4da",
  "#5e3a1c", "#946027", "#c98f3a", "#eec26a", "#fff0b5",
  "#0f2f4a", "#1d5276", "#3383a8", "#69b7d6", "#b8e6f5",
  "#10301f", "#1e5233", "#2f7d4a", "#57ad6a", "#a3dd9b",
  "#3a3440", "#5d5666", "#8a8494", "#b9b3c0", "#e4dfe8", "#ffffff",
  "#4a0f1c", "#7d1e2c", "#b8323b", "#e0634f",
  "#2a1e1a", "#4a362c", "#6e5444", "#98786a", "#c4a796",
  "#d9c2b4", "#efe0d4", "#7a6a7e", "#a596a8", "#cfc4d6",
].map(pxHex);
// nearest palette color for every 5-bit rgb, worked out once (perceptual-ish weights)
const PIXEL_LUT = (() => {
  const lut = new Uint8Array(32768);
  for (let i = 0; i < 32768; i++) {
    const r = (i >> 10) * 8.2, g = ((i >> 5) & 31) * 8.2, b = (i & 31) * 8.2;
    let best = 0, bd = Infinity;
    PIXEL_PALETTE.forEach(([pr, pg, pb], j) => { const d = 3 * (r - pr) ** 2 + 4 * (g - pg) ** 2 + 2 * (b - pb) ** 2; if (d < bd) { bd = d; best = j; } });
    lut[i] = best;
  }
  return lut;
})();
const PIXEL_DITHER = PX_BAYER.map(v => (v - 0.5) * 7); // light: big areas sit in calm bands, dither only at their seams
// sprites snap to the palette without the stone greys and warm neutrals, so pale glowlings don't go blotchy
const SPRITE_SKIP = new Set(["#3a3440", "#5d5666", "#8a8494", "#b9b3c0", "#2a1e1a", "#4a362c", "#6e5444", "#98786a", "#c4a796", "#d9c2b4", "#efe0d4", "#7a6a7e", "#a596a8", "#cfc4d6"].map(h => pxHex(h).join()));
const SPRITE_LUT = (() => {
  const lut = new Uint8Array(32768), ok = PIXEL_PALETTE.map((c, j) => SPRITE_SKIP.has(c.join()) ? -1 : j).filter(j => j >= 0);
  for (let i = 0; i < 32768; i++) {
    const r = (i >> 10) * 8.2, g = ((i >> 5) & 31) * 8.2, b = (i & 31) * 8.2;
    let best = 0, bd = Infinity;
    for (const j of ok) { const [pr, pg, pb] = PIXEL_PALETTE[j], d = 3 * (r - pr) ** 2 + 4 * (g - pg) ** 2 + 2 * (b - pb) ** 2; if (d < bd) { bd = d; best = j; } }
    lut[i] = best;
  }
  return lut;
})();
// colors that are already exactly in the palette skip dithering: sprites stay flat and clean
const PIXEL_EXACT = (() => {
  const t = new Int16Array(32768).fill(-1);
  PIXEL_PALETTE.forEach(([r, g, b], j) => { t[(r >> 3 << 10) | (g >> 3 << 5) | (b >> 3)] = j; });
  return t;
})();

/** Snap the finished frame to the palette with ordered dithering and show it. Works on whole pixels (32 bits) at once. */
const PIXEL_PAL32 = new Uint32Array(PIXEL_PALETTE.map(([r, g, b]) => (255 << 24 | b << 16 | g << 8 | r) >>> 0));
function present() {
  // everywhere but the egg, everything on screen is already drawn in palette pixels (backdrops, rooms, furniture, sprites are baked),
  // so the frame is copied straight across; only the egg (cracks and polish drawn live) is snapped to the palette here
  if (game.scene !== "crack") { screen.drawImage(low, 0, 0); return; }
  const w = low.width, h = low.height, img = ctx.getImageData(0, 0, w, h), d = new Uint32Array(img.data.buffer);
  for (let y = 0, i = 0; y < h; y++) {
    const row = (y & 3) * 4;
    for (let x = 0; x < w; x++, i++) {
      const v = d[i], r = v & 255, g = (v >>> 8) & 255, b = (v >>> 16) & 255;
      // colors already in the palette stay exactly as they are (sprites, outlines): no dither noise on them
      const ex = PIXEL_EXACT[(r >> 3 << 10) | (g >> 3 << 5) | (b >> 3)];
      if (ex >= 0 && PIXEL_PAL32[ex] === ((v | 0xff000000) >>> 0)) { d[i] = PIXEL_PAL32[ex]; continue; }
      const o = PIXEL_DITHER[row + (x & 3)];
      const rr = r + o, gg = g + o, bb = b + o;
      d[i] = PIXEL_PAL32[PIXEL_LUT[((rr < 0 ? 0 : rr > 255 ? 255 : rr) >> 3 << 10) | ((gg < 0 ? 0 : gg > 255 ? 255 : gg) >> 3 << 5) | ((bb < 0 ? 0 : bb > 255 ? 255 : bb) >> 3)]];
    }
  }
  screen.putImageData(img, 0, 0);
}

/** Redraw everything for a new pixel size (the screen itself didn't change). */
function refit() {
  quality.settle();
  sizeCanvas(); makeBackground(); computeLayout(); makeMotes();
  roomCanvas.key = null; spriteFrames.clear();
  if (game.egg && game.scene === "crack") {
    if (game.egg.conf && game.egg.conf.coop) reprojectCoopEgg();
    else refitEgg(game.egg);
  }
}

function resize() {
  const oldW = W, oldH = H;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  quality.dpr = oldW ? Math.min(quality.dpr, DPR) : DPR;
  sizeCanvas();
  makeBackground();
  if (oldW === W && Math.abs(oldH - H) < 120 && oldW) return; // ignore tiny mobile toolbar changes
  computeLayout();
  makeMotes();
  if (game.egg && game.scene === "crack") {
    if (game.egg.conf && game.egg.conf.coop) reprojectCoopEgg();
    else refitEgg(game.egg);
  }
}

// ---------- game state ----------

const game = {
  scene: "menu", egg: null, time: 0, libTab: "sp",
  coop: null,
  chips: [], sparks: [], pieces: [], glints: [], trail: [], hearts: [], swings: [], floaters: [], ripples: [], pops: [], gems: [], shake: 0, freeze: 0,
  nest: { snack: null, petDist: 0, petXpT: 0, petting: false, call: null },
  actors: null,
  catch: null,
  quality, save,
};
window.__game = game; // handy for debugging and tests

// ---------- background: a moonlit grotto ----------

let motes = [], bgTheme = null;
const bgCache = new Map();
/** The grotto behind everything: a dithered crystal cave drawn at art resolution, its middle left open. */
function makeBackground() { bgCache.clear(); }

/** Which backdrop shows now: the chapter's own cave while cracking, moonlight for moon eggs, your pick elsewhere. */
function currentTheme() {
  const c = game.scene === "crack" && game.egg && game.egg.conf;
  if (c) return c.moon ? "churchyard" : c.wander ? "labradorite" : CAVE_THEME[c.cave] || "amethyst";
  const fits = roomThemes();
  return THEME[save.theme] && (THEME[save.theme].ok() || isPlace()) && fits.includes(save.theme) ? save.theme : fits[0];
}
/** Which backdrops suit the room you're in: the nest is always in a cave, outside is always under the sky, the other rooms take any. */
function roomThemes(i = save.room) {
  const kind = save.rooms && save.rooms[i] && save.rooms[i].kind, k = id => ROOM_KIND[id] || "cave";
  const ids = THEMES.map(t => t.id);
  if (kind === "yard") return ids.filter(id => k(id) === "wood" || k(id) === "yard");
  if (!kind || kind === "nest") return ids.filter(id => k(id) === "cave");
  return ids;
}

// ---------- gothic little things: candles by the egg, bats in the dark ----------

/** One art pixel at CSS coords, snapped to the pixel grid. */
const dot = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x / PX) * PX, Math.round(y / PX) * PX, w * PX, h * PX); };

function drawCandle(x, y, tall, ph) {
  const t = game.time * 0.001 + ph, fl = Math.sin(t * 9) + Math.sin(t * 23) * 0.5;
  // warm light around the flame (the palette dithers it into rings)
  const fy = y - (tall + 4) * PX, g = ctx.createRadialGradient(x, fy, 2, x, fy, 46 * PX / 3);
  g.addColorStop(0, `rgba(238,194,106,${0.32 + fl * 0.03})`); g.addColorStop(1, "rgba(238,194,106,0)");
  ctx.fillStyle = g; ctx.fillRect(x - 50 * PX / 3, fy - 50 * PX / 3, 100 * PX / 3, 100 * PX / 3);
  dot(x - 3 * PX, y - PX, 6, 1, "#4a362c");                               // the dish
  dot(x - 2 * PX, y - (tall + 1) * PX, 4, tall, "#e4dfe8");               // wax
  dot(x + PX, y - (tall + 1) * PX, 1, tall, "#b9b3c0");                   // its shaded side
  dot(x - 2 * PX, y - (tall - 2) * PX, 1, 3, "#ffffff");                  // a drip
  dot(x, y - (tall + 2) * PX, 1, 1, "#2a1e1a");                           // wick
  const lean = Math.round(fl * 0.6);
  dot(x - PX + lean * PX, y - (tall + 4) * PX, 3, 2, "#e0634f");
  dot(x + lean * PX, y - (tall + 6) * PX, 1, 3, "#eec26a");
  dot(x + lean * PX, y - (tall + 4) * PX, 1, 1, "#fff0b5");
}

const BAT = [["..#...#..", ".###.###.", "#########", "..#####.."], ["#.......#", "##.###.##", ".#######.", "..#####.."]];
function drawBats(dt) {
  if (!game.bats) game.bats = [];
  if (Math.random() < dt * 0.08 && game.bats.length < 2) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    game.bats.push({ x: dir > 0 ? -20 : W + 20, y: rand(H * 0.12, H * 0.4), dir, v: rand(50, 90), ph: rand(0, 6) });
  }
  for (const b of game.bats) {
    b.x += b.dir * b.v * dt;
    const y = b.y + Math.sin(game.time * 0.004 + b.ph) * 14, frame = Math.floor(game.time / 120 + b.ph) % 2;
    BAT[frame].forEach((row, j) => [...row].forEach((c, i) => { if (c === "#") dot(b.x + (b.dir > 0 ? i : 8 - i) * PX, y + j * PX, 1, 1, "#0b0614"); }));
  }
  game.bats = game.bats.filter(b => b.x > -40 && b.x < W + 40);
}

/** The event's sky: snow, petals, leaves, fireflies, lanterns or twinkling lights over every scene. */
let evMotes = [];
function makeEventMotes() {
  const f = eventNow()?.fall;
  evMotes = !f ? [] : Array.from({ length: Math.round(f.n * 1.4 * clamp(W * H / 300000, 0.6, 1.6)) }, () => ({
    x: rand(0, W), y: rand(0, H), r: f.r * rand(0.7, 1.3), v: rand(10, 26), ph: rand(0, 6.28), c: pick(f.c),
  }));
}
function updateEventMotes(dt) {
  const f = eventNow()?.fall;
  if (!f || f.still) return;
  for (const m of evMotes) {
    m.y += m.v * f.dir * dt;
    if (!f.dir) { m.x += Math.cos(m.ph + game.time * 0.0007) * 9 * dt; m.y += Math.sin(m.ph * 1.7 + game.time * 0.0005) * 7 * dt; }
    if (m.y > H + 6) { m.y = -6; m.x = rand(0, W); } else if (m.y < -6) { m.y = H + 6; m.x = rand(0, W); }
    if (m.x < -6) m.x = W + 6; else if (m.x > W + 6) m.x = -6;
  }
}
/** Is there open sky here? (the garden, the camp, a backdrop out of doors) — not inside a cave, the shop or the lab. */
const skyHere = () => game.scene === "nest" && ["yard", "wood", "ruin"].includes(ROOM_KIND[currentTheme()] || "cave");
function drawEventMotes() {
  const f = eventNow()?.fall;
  if (!f || !skyHere()) return;
  for (const m of evMotes) {
    ctx.globalAlpha = f.blink ? 0.25 + 0.75 * Math.max(0, Math.sin(game.time * 0.002 + m.ph * 3)) : 0.85;
    const sway = f.dir > 0 ? Math.sin(m.ph + game.time * 0.0013) * 10 : 0, s = Math.max(2, Math.round(m.r * 1.5)) * PX;
    ctx.fillStyle = m.c;
    ctx.fillRect(Math.round(m.x + sway), Math.round(m.y), s, s);
    if (f.blink) { ctx.globalAlpha *= 0.25; ctx.fillRect(Math.round(m.x + sway) - s, Math.round(m.y) - s, s * 3, s * 3); }
  }
  ctx.globalAlpha = 1;
}

function makeMotes() {
  makeEventMotes();
  motes = Array.from({ length: Math.round(clamp(W * H / 14000, 20, 70)) }, () => ({
    x: rand(0, W), y: rand(0, H), r: rand(0.6, 1.8), vy: rand(3, 10), ph: rand(0, 6.28), a: rand(0.2, 0.7),
  }));
}

/** The backdrop for a scene: which picture, and where its ground line meets the room. */
function bgFor(scene) {
  const id = currentTheme();
  // in the nest, the backdrop's ground meets the room: a clearing or a ruined hall stands on the land, a cave hollow opens onto the cave floor
  // in the isometric room the land goes on around it: outdoors the horizon lies behind the room, so the clearing is part of the
  // meadow and the hills, trees and mushrooms stand beyond it; a cave room stands on a rock shelf on the cave floor, crystals around it
  const kind = ROOM_KIND[id] || "cave", outdoor = kind === "yard" || kind === "wood";
  const floor = scene !== "nest" || !N.back ? 0.86 : N.iso && outdoor ? (N.isoTop - N.isoWall * 0.35) / H : (kind === "cave" ? N.front : N.back + 1) / H;
  const key = `${id}|${floor.toFixed(3)}`;
  if (!bgCache.has(key)) bgCache.set(key, paintTheme(id, Math.ceil(W / PX), Math.ceil(H / PX), floor));
  return [id, key];
}
function drawBackground() {
  const [id, key] = bgFor(game.scene);
  // the music box plays the song picked on it, in the nest; otherwise each backdrop has its own
  const song = game.scene === "nest" && hasDecor("musicbox") && save.jukebox && THEMES.some(t => t.id === save.jukebox && t.ok()) ? save.jukebox : id;
  if (song !== bgTheme) { bgTheme = song; sfx.music(song); }
  ctx.drawImage(bgCache.get(key), 0, 0, W, H);
  ctx.fillStyle = "#e6f6ff";
  for (const m of motes) {
    ctx.globalAlpha = m.a * (0.5 + 0.5 * Math.sin(game.time * 0.0012 + m.ph));
    ctx.fillRect(m.x + Math.sin(m.ph + game.time * 0.0004) * 8, m.y, m.r, m.r);
  }
  ctx.globalAlpha = 1;
}
