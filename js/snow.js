"use strict";
// Hatchstone · the snowfields' own doings, at Runa's: frostglass, fishing it out of the ice hole, carving it at her bench, and
// warming up in the hot spring. The rules (what the hole gives, what a soak does, what a carving costs) are plain functions at
// the top, so the tests can load them in Node; the scene and the sheets come after.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- the rules ----------

/** Frostglass in hand (save.frostglass, counted like shards; see glassSaveOf in save.js). */
const glassNow = () => save.frostglass || 0;
/** Frostglass for you (n of it): from the ice hole, the snowfields expedition, Runa's thanks (and, later, the settlers). */
function giveGlass(n) {
  save.frostglass = glassSaveOf(glassNow() + n);
  if (!save.frostglass) delete save.frostglass;
  return glassNow();
}

/**
 * The ice hole. Cast, and after ICE_BITE seconds (a random wait, 2 to 6) the float twitches: tap within ICE_GRAB seconds and
 * something comes up. What, out of a hundred: frostglass (1 to 3) most of the time, a few shards, now and then a frost geode
 * or a keepsake from under the ice. The first frost geode comes on the third cast ever (ICE_SURE: the one after, if that one
 * got away). A miss loses nothing. Each catch tires the one fishing by ICE_REST; under ICE_TIRED it yawns and asks to stop.
 */
const ICE_CATCH = [["glass", 70], ["shards", 15], ["geode", 8], ["keepsake", 7]];
const ICE_BITE = [2, 6], ICE_GRAB = 0.8, ICE_SURE = 3, ICE_REST = 5, ICE_TIRED = 20;
/** The keepsakes the hole gives, kept in the jar with the walks' (see KEEPSAKES: the two marked snow). */
const ICE_KEEPS = ["snowflake", "ptarmigan"];
/** How long till the float twitches, in seconds. R: the dice (for the tests). */
const iceBiteIn = (R = Math.random) => ICE_BITE[0] + R() * (ICE_BITE[1] - ICE_BITE[0]);
/**
 * What a catch is, on the cast'th cast ever (counting this one), with or without a frost geode from the hole yet:
 * { what, n } for glass and shards, { what: "geode", n: 1 }, or { what: "keepsake", ks }.
 */
function iceRoll(cast, geodeYet, R = Math.random) {
  if (!geodeYet && cast >= ICE_SURE) return { what: "geode", n: 1 };
  let r = R() * ICE_CATCH.reduce((s, c) => s + c[1], 0), what = ICE_CATCH[ICE_CATCH.length - 1][0];
  for (const [w, p] of ICE_CATCH) if ((r -= p) < 0) { what = w; break; }
  if (what === "glass") return { what, n: 1 + Math.floor(R() * 3) };
  if (what === "shards") return { what, n: 5 + Math.floor(R() * 6) };
  if (what === "keepsake") return { what, ks: ICE_KEEPS[Math.floor(R() * ICE_KEEPS.length)] };
  return { what, n: 1 };
}
/** Can this one fish: awake, at home (not off exploring or helping), and not too tired? Why not, if not ("asleep", "out", "tired"). */
const iceWhyNot = cr => !cr ? "none" : cr.out ? "out" : cr.sleeping ? "asleep" : cr.energy < ICE_TIRED ? "tired" : null;
/** The hole's own record in the save: how many casts, and whether it has given a frost geode yet. */
const iceSave = () => save.icehole || (save.icehole = { casts: 0, geode: false });
/** A cast: counted (so the third one ever brings the first frost geode). Returns the cast's number. */
function iceCastCount() { const s = iceSave(); s.casts++; return s.casts; }
/**
 * A catch for cr, on cast number `cast`: it tires by ICE_REST, and what came up is put away (glass, shards, a frost geode on
 * the shelf, a keepsake in the jar, which a nest without one gets now). Returns the roll, with tired: true once it's under
 * ICE_TIRED.
 */
function iceCatch(cr, cast, R = Math.random) {
  const s = iceSave(), got = iceRoll(cast, s.geode, R);
  cr.energy = Math.max(0, cr.energy - ICE_REST);
  if (got.what === "glass") giveGlass(got.n);
  else if (got.what === "shards") save.shards += got.n;
  else if (got.what === "geode") { s.geode = true; giveFrostGeode(1); }
  else {
    const w = save.walks; w.found[got.ks] = (w.found[got.ks] || 0) + 1;
    if (!save.decor.keepjar) save.decor.keepjar = { on: false, at: Date.now() };
  }
  return { ...got, tired: cr.energy < ICE_TIRED };
}

/**
 * The hot spring (owner's choice: no daily limit, but gentle): up to SPRING_MAX awake glowlings from home sit in it together.
 * Each gets SPRING_REST rest, SPRING_FUN fun and SPRING_GROW toward growing up; each pair who sat together have one more
 * meeting toward being friends (five make friends, as anywhere).
 */
const SPRING_MAX = 3, SPRING_REST = 15, SPRING_FUN = 10, SPRING_GROW = 5;
/** Who can go: awake, at home (not out in the valley or away exploring), in its own home room. */
const springCan = cr => !!cr && !cr.out && !cr.sleeping && !isPlace(roomOf(cr));
/** A soak for these (the first SPRING_MAX who can go): returns who went. */
function springSoak(list) {
  const went = list.filter(springCan).slice(0, SPRING_MAX);
  for (const c of went) { c.energy = Math.min(100, c.energy + SPRING_REST); c.joy = Math.min(100, c.joy + SPRING_FUN); addXP(c, SPRING_GROW); }
  for (const c of went) for (const o of went) if (o !== c) {
    c.pals = { ...c.pals, [o.id]: ((c.pals || {})[o.id] || 0) + 1 };
    if (c.pals[o.id] === 5) remember(c, "Became friends with {0} ♥", o.name);
  }
  return went;
}

/** Runa's bench: the pieces she carves (DECOR marked carved), what each takes (glass and shards), and why she can't, if she can't. */
const CARVINGS = DECOR.filter(d => d.carved);
const carveWhyNot = d => save.decor[d.id] ? "have" : glassNow() < d.glass ? "glass" : save.shards < d.cost ? "shards" : null;
/** Carve one: the glass and shards are spent and it waits in your chest, a piece of furniture like any other. False if not. */
function carve(id) {
  const d = CARVINGS.find(x => x.id === id);
  if (!d || carveWhyNot(d)) return false;
  giveGlass(-d.glass); save.shards -= d.cost;
  save.decor[id] = { on: false, at: Date.now() };
  return true;
}

/**
 * The settlement: grown glowlings may move out to the snowfields and live near Runa (cr.settle = { since, day, geo }: when,
 * the day it came, and the frost geodes it has brought). They're out (cr.out, cr.roam), so they need no bed and nothing else,
 * and grow as helpers do. Room for SETTLE_BASE in a corner of Runa's hut, SETTLE_HUT more in each snow hut she builds
 * (HUT_GLASS: what each costs, in turn), so SETTLE_MAX at most. save.settle = { huts, day }: the huts built and the last day
 * her sled came.
 */
const SETTLE_BASE = 3, SETTLE_HUT = 3, HUT_GLASS = [20, 35, 50], SETTLE_MAX = SETTLE_BASE + SETTLE_HUT * HUT_GLASS.length;
/** Each settler sends SLED_GLASS frostglass a day; Runa's basket holds SLED_DAYS days of it; a frost geode every GEODE_DAYS of its days there. */
const SLED_GLASS = 2, SLED_DAYS = 3, GEODE_DAYS = 10;
/** The frost on the ice door thins as the settlement grows (only to look at: the door opens on Runa's third wish). */
const DOOR_STAGES = [3, 6, 9], LULLABY_AT = 6, DOOR_WISH = 3;
const settleSave = () => save.settle || (save.settle = { huts: 0, day: dayNo() });
const settlers = () => save.creatures.filter(c => c.settle);
const hutsNow = () => (save.settle && save.settle.huts) || 0;
const settleCap = (huts = hutsNow()) => Math.min(SETTLE_MAX, SETTLE_BASE + SETTLE_HUT * huts);
/** The next snow hut's price in frostglass, or null once all three stand. */
const hutPrice = (huts = hutsNow()) => huts < HUT_GLASS.length ? HUT_GLASS[huts] : null;
/** How far the frost on the door has thinned (0 to 3), and is it open (Runa's third wish brought). */
const doorFrost = (n = settlers().length) => DOOR_STAGES.filter(k => n >= k).length;
const doorOpen = () => bondOf("snow") >= DOOR_WISH;
/** Grown (as a helper is), happy or fine, at home and not off anywhere, and never the last one at home. */
const canSettle = cr => !!cr && stageOf(cr.level || 1) >= HELP_STAGE && !cr.out && !cr.trip && !cr.job && !cr.settle && ["happy", "ok"].includes(moodOf(cr)) && save.creatures.some(c => c !== cr && !c.out);
/** Why it can't move out just now, if it can't: not open, not grown or not content, or the settlement full. */
const settleWhyNot = cr => !placeOk("snow") ? "shut" : !canSettle(cr) ? "no" : settlers().length >= settleCap() ? "full" : null;
/** Off to the snowfields: its bed at home is free again. False if it may not go. */
function settleOut(id) {
  const c = save.creatures.find(x => x.id === id);
  if (!c || settleWhyNot(c)) return false;
  settleSave();
  c.out = true; c.roam = true; c.outAt = Date.now(); c.sleeping = false; c.selfSlept = false;
  c.settle = { since: Date.now(), day: dayNo(), geo: 0 };
  delete c.wishDay;
  if (save.active === id) save.active = save.creatures.find(x => !x.out)?.id ?? id;
  remember(c, "Moved to the snowfields, to live near Runa");
  return true;
}
/** A snow hut from Runa (free: her thanks); false once all three stand, or without the glass. */
function buildHut(free = false) {
  const p = hutPrice(), s = settleSave();
  if (p === null || (!free && glassNow() < p)) return false;
  if (!free) giveGlass(-p);
  s.huts++;
  return true;
}
/**
 * What Runa's sled brings today (pure: the tests run it): for each settler, SLED_GLASS a day since the sled last came (or
 * since it came, if later), only SLED_DAYS days' worth at most; and a frost geode for every GEODE_DAYS of its days there not
 * yet brought. Returns { glass, geodes, by: [[id, geodes]] }.
 */
function sledDue(list, last, today) {
  let glass = 0, geodes = 0; const by = [];
  for (const c of list) {
    const from = Math.max(last, c.settle.day), days = Math.min(SLED_DAYS, Math.max(0, today - from));
    glass += days * SLED_GLASS;
    const g = Math.max(0, Math.floor((today - c.settle.day) / GEODE_DAYS) - (c.settle.geo || 0));
    if (g) { geodes += g; by.push([c.id, g]); }
  }
  return { glass, geodes, by };
}
/** The sled comes, once a day (the first time the game is opened that day): returns what it brought, or null. */
function sledCome(today = dayNo()) {
  const s = save.settle, list = settlers();
  if (!s || s.day === today) return null;
  const due = sledDue(list, s.day, today);
  s.day = today;
  if (!due.glass && !due.geodes) return null;
  giveGlass(due.glass);
  for (const [id, g] of due.by) { const c = list.find(x => x.id === id); c.settle.geo = (c.settle.geo || 0) + g; }
  if (due.geodes) giveFrostGeode(due.geodes);
  return due;
}
/** Home from the snowfields, to its own room or any with a bed free: false, with a word, when none is. */
function settlerHome(id) {
  const c = save.creatures.find(x => x.id === id);
  if (!c || !c.settle) return false;
  const r = [roomOf(c), ...save.rooms.map((_, i) => i)].find(i => !isPlace(i) && residents(i).length < homeCap(i));
  if (r === undefined) return false;
  delete c.settle; delete c.jobT;
  c.out = false; c.roam = false; c.room = r; c.homeAt = c.last = Date.now();
  remember(c, "Came home from the snowfields");
  return true;
}

if (typeof module === "object" && module.exports) module.exports = {};

// ---------- the words and the little pictures ----------

Object.assign(PX_ICON_MAPS, {
  // a bead of frostglass: white on its lit facets, ice blue through its middle, deep blue in its shade
  glass: ["............", "....WWww....", "...WWwttt...", "..WWwtttTT..", "..WwttWtTT..", "..wttWWtTT..", "..ttttWtTT..", "..tttttTTT..", "...TtttTT...", "....TTTT....", "............", "............"],
  // a rod bent over a hole in the ice, its line down to a red and white float
  rod: ["..........b.", ".........bbs", "........bb.s", ".......bb..s", "......bb...s", ".....bb....W", "....bb.....e", "...bb.......", "..BB........", ".BB...ssssss", "BB...stkkkts", "B.....ssssss"],
  // a chisel over a block of ice
  chisel: ["..........sS", ".........sS.", "........sS..", ".......sS...", "......bB....", ".....bB.....", "....bB......", "..WWww......", ".WwwttT.....", ".wwttTT.....", ".wttTTT.....", "..TTTT......"],
  // steam curling up off warm water in a ring of stones
  steam: ["...w...w....", "..w...w...w.", "...w...w.w..", "..w...w...w.", "...w...w.w..", "............", "..SsSSsSS...", ".SttttttTS..", "StWttttTTTS.", ".STTTTTTTS..", "..SSsSSsS...", "............"],
  // a frost geode: icy blue stone under a cap of snow
  frostgeode: ["............", "....WWWW....", "..WWWWWWWW..", ".WwwwwwwwwW.", ".wtttTttttw.", ".ttTttWtTtt.", ".tTttttttTt.", ".TtttTtttTT.", "..TTtttTTT..", "...TTTTTT...", "............", "............"],
  // the hole's keepsakes: a snowflake caught in a chip of clear ice, and a ptarmigan's white feather with its dark tip
  ks_snowflake: ["............", ".TTTTTTTTTT.", ".TtWttWttWT.", ".TttWtWtWtT.", ".TtttWWWttT.", ".TWWWWWWWWT.", ".TtttWWWttT.", ".TttWtWtWtT.", ".TtWttWttWT.", ".TttttttttT.", ".TTTTTTTTTT.", "............"],
  ks_ptarmigan: PX_ICON_MAPS.feather.map((r, y) => r.replace(/[Lwl]/g, ch => y < 3 ? (ch === "w" ? "z" : "k") : ch === "L" ? "s" : ch === "w" ? "W" : "w")),
});

// ---------- in the snowfields: what there is to do (the bar under the place; see HEROES.snow) ----------

/** Runa's buttons: fish, carve, the spring, the settlement, and a frost geode to crack when there is one; while fishing, the rod's own. */
function snowActs() {
  const f = iceNow();
  if (f) {
    if (f.phase === "tired") return [["nest", tr("Home"), iceStop], ["steam", tr("Hot spring"), () => { const id = f.id; iceStop(); openSpring([id]); }]];
    const out = ["wait", "bite", "cast"].includes(f.phase);
    return [["rod", tr(out ? "Pull!" : "Cast"), out ? icePull : iceCast, f.phase === "bite" ? "bite" : ""], ["close", tr("Stop"), iceStop]];
  }
  const n = frostGeodes();
  return [["rod", tr("Fish"), startFishing], ["chisel", tr("Carving"), openCarving], ["steam", tr("Hot spring"), () => openSpring()], ["hut", tr("Settlement"), openSettle],
    ...(n ? [["frostgeode", tr("Crack a frost geode ({0})", n), () => { iceStop(); startFrost(); }]] : [])];
}
/** On the plaque under the place's name: your frostglass. */
const snowWho = () => `<span class="glass" title="${tr("Frostglass")}">${ic("glass")}×${glassNow()}</span>`;
/** The keeper says something (her bubble over her head, as when you tap her). */
function runaSays(line) { game.hero = { t: game.time, line: tr(line), room: save.room }; sfx.voice(RUNA.voice); }
const inSnow = () => game.scene === "nest" && save.rooms[save.room]?.kind === "snow";
/** The pond and the spring in the clearing, on screen: the hole, the stool beside it and how high its seat is; the spring's middle and its water's size. */
function snowSpots() {
  const lay = isoLayout().placed, p = lay.pond, q = lay.hotspring, tile = N.isoW / ISO_G, at = (u, v) => isoAt(u / ISO_G, v / ISO_G);
  return {
    hole: p && at(p.i + 1.25, p.j + 1.2), stool: p && at(p.i + 0.55, p.j + 1.35), stoolH: tile * 0.42, holeR: Math.max(3 * PX, tile * 0.25),
    spring: q && at(q.i + 1, q.j + 0.5), springRx: tile * 1.2735 - 2 * PX, springRy: (tile * 1.2735 - 2 * PX) * 0.42,
    // (where those from home come in: the track at the clearing's right-hand edge)
    entry: isoAt(0.97, 0.76), bend: isoAt(0.55, 0.84),
  };
}
/** Along a walk of points at walking pace, from t0: where on it, whether it's there, and how far through a step (for the hop). */
function walkAlong(pts, t0, now = game.time) {
  const speed = N.base * 1.7 / 1000;
  let d = Math.max(0, now - t0) * speed;
  for (let k = 0; k + 1 < pts.length; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], L = Math.hypot(x1 - x0, y1 - y0);
    if (d <= L) { const f = L ? d / L : 1; return { x: lerp(x0, x1, f), y: lerp(y0, y1, f), done: false, step: (Math.max(0, now - t0) / 380) % 1 }; }
    d -= L;
  }
  const [x, y] = pts[pts.length - 1];
  return { x, y, done: true, step: 0 };
}
/** A glowling from home drawn in the clearing, at its feet (x, y), raised by alt; with a face, a hop and an emote of the moment. */
function drawGuest(cr, x, y, o = {}) {
  const size = N.base * depth(y) * (o.k || 1), cy = y - size * 0.45 - (o.alt || 0);
  if (!o.noShadow) { ctx.fillStyle = "rgba(5,0,20,.35)"; ctx.beginPath(); ctx.ellipse(x, y, size * 0.38, size * 0.09, 0, 0, TAU); ctx.fill(); }
  ctx.save(); if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  drawSprite(x, cy, size, specOf(cr), { acc: cr.acc, level: cr.level, shiny: cr.shiny, mood: o.mood || "happy", hop: o.hop || 0, hopK: calmOf(cr.level).hop * 0.75, t: game.time + cr.id * 997, glowK: 0.5, tired: o.tired, face: o.face });
  ctx.restore();
  return { x, y: cy, size };
}
/** A pixel line on the room's grid, in one colour. */
function pxLineTo(x0, y0, x1, y1, col) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / PX));
  ctx.fillStyle = col;
  for (let k = 0; k <= n; k++) ctx.fillRect(Math.round(lerp(x0, x1, k / n) / PX) * PX, Math.round(lerp(y0, y1, k / n) / PX) * PX, PX, PX);
}
const snowImgs = {};
/** A pixel icon as a picture to draw on the canvas (made once). */
const snowImg = name => snowImgs[name] || (snowImgs[name] = Object.assign(new Image(), { src: pxIcon(name) }));
/** A ring on the water's plane round (x, y), r wide, in pixels. */
function waterRing(x, y, r, col, al) {
  if (al <= 0) return;
  ctx.globalAlpha = Math.min(1, al); ctx.fillStyle = col;
  const n = Math.max(10, Math.round(r * 1.1));
  for (let i = 0; i < n; i++) { const a = i / n * TAU; ctx.fillRect(Math.round((x + Math.cos(a) * r) / PX) * PX, Math.round((y + Math.sin(a) * r * 0.5) / PX) * PX, PX, PX); }
  ctx.globalAlpha = 1;
}

/** What the snowfields add to the room's back-to-front order (see drawNest): whoever's fishing, and whoever's in the spring. */
function snowItems() {
  if (!inSnow()) { if (game.ice) game.ice = null; if (game.springTrip) game.springTrip = null; settleWalks.clear(); return []; }
  const items = [], S = snowSpots(), box = ([x, y]) => { const [u, v] = isoFrom(x, y); return { u0: u * ISO_G, u1: u * ISO_G, v0: v * ISO_G, v1: v * ISO_G }; };
  const f = iceNow();
  if (f && S.hole) { iceTick(f, S); const at = icePos(f, S); items.push({ y: at[1] + 0.5, after: f.phase === "walk" ? null : "pond", draw: () => drawIceHole(f, S), box: box(at) }); items.push({ y: 1e6, top: true, draw: () => drawIceOver(f, S) }); }
  // the settlement: its huts, the settlers at what they're doing, the garland once nine live here; the door melting open
  items.push(...settleItems(S));
  if (game.doorFx) items.push({ y: 1e6, top: true, draw: () => drawDoorFx(S) });
  const sp = game.springTrip;
  if (sp && S.spring) {
    springTick(sp, S);
    for (const g of sp.who) { const at = springPos(sp, g, S); items.push({ y: at.y + 0.5, after: at.inWater ? "hotspring" : null, draw: () => drawBather(sp, g, S), box: box([at.x, at.y]) }); }
    items.push({ y: 1e6, top: true, draw: () => drawSpringOver(sp, S) });
  }
  return items;
}
/** A tap in the clearing while fishing: on a twitch (or any time the line's out) it's a pull, by the hole a cast. */
function snowTap(x, y) {
  const f = iceNow();
  if (!f || !inSnow()) return false;
  if (["wait", "bite", "cast"].includes(f.phase)) { icePull(); return true; }
  const S = snowSpots();
  if (f.phase === "sit" && S.hole && Math.hypot(x - S.hole[0], (y - S.hole[1]) * 1.6) < N.base * 1.1) { iceCast(); return true; }
  return false;
}
// the pond and the spring themselves do what their buttons do when tapped
Object.assign(PROP_TAP, { pond: () => iceNow() ? (iceNow().phase === "sit" ? iceCast() : null) : pressProp("pond", startFishing), hotspring: () => pressProp("hotspring", () => openSpring()) });

// ---------- the ice hole ----------
// game.ice: who's fishing (id), what's happening (phase: walk to the stool, sit with the rod, cast, wait for a twitch, bite,
// tired), since when (t), when the float will twitch (biteAt), and what just came up (got, flying up out of the hole).

const iceNow = () => game.ice && inSnow() && save.creatures.find(c => c.id === game.ice.id) ? game.ice : null;
function startFishing() {
  const cr = activeCreature();
  if (cr) applyTime(cr);
  const why = iceWhyNot(cr);
  if (why) {
    sfx.tick();
    toast(why === "none" ? tr("Nobody's at home to fish") : why === "out" ? tr("{0} is out in the valley just now", cr.name) : why === "asleep" ? tr("{0} is asleep. Let it sleep, the hole will wait.", cr.name) : tr("{0} is too sleepy to fish. Home to bed, or a warm in the spring?", cr.name));
    return;
  }
  game.ice = { id: cr.id, phase: "walk", t: game.time };
  sfx.chirp(specOf(cr).voice);
  runaSays(pick(["Sit still and watch the float. The hole likes patience.", "Tap when the float bobs. Not before, not after. Easy.", "Mind your paws, the ice is honest but it's cold."]));
  renderPlaceBar();
}
function iceStop() { if (!game.ice) return; game.ice = null; persist(); renderPlaceBar(); }
/** Cast: the rod swings, the float flies out and lands in the hole with a plop; the float twitches in 2 to 6 seconds. */
function iceCast() {
  const f = iceNow(), cr = f && save.creatures.find(c => c.id === f.id);
  if (!f || !["sit"].includes(f.phase)) return;
  if (cr.energy < ICE_TIRED) { f.phase = "tired"; f.t = game.time; renderPlaceBar(); return; }
  f.cast = iceCastCount(); f.phase = "cast"; f.t = game.time; f.biteAt = game.time + 500 + iceBiteIn() * 1000; f.got = null;
  if (sfx.ready()) sfx.wash(sfx.ac.currentTime, 0.28, 900, 2600, 0.8, 0.03);
  persist(); renderPlaceBar(); setHint(tr("tap when the float twitches!"));
}
/** Pull: on a twitch, the catch comes up; any other time, nothing's on the hook yet (and nothing's lost). */
function icePull() {
  const f = iceNow(), cr = f && save.creatures.find(c => c.id === f.id);
  if (!f) return;
  if (f.phase !== "bite") {
    if (!["wait", "cast"].includes(f.phase)) return;
    f.phase = "sit"; f.t = game.time; f.say = { text: tr("too soon…"), t: game.time };
    sfx.tick(); toast(tr("Too soon! Nothing on the line. Cast again"));
    renderPlaceBar(); return;
  }
  const got = iceCatch(cr, f.cast);
  f.got = { ...got, t: game.time }; f.phase = got.tired ? "tired" : "sit"; f.t = game.time;
  f.kao = { text: got.what === "geode" ? KAO.excited.text : kaoFor(cr, got.what === "glass" ? "fave" : "won"), t: game.time + 700 };
  const name = got.what === "glass" ? tr("frostglass ×{0}", got.n) : got.what === "shards" ? `✦ ${got.n}` : got.what === "geode" ? tr("a frost geode!") : tr(KS[got.ks].name);
  f.got.label = name; f.got.icon = got.what === "glass" ? "glass" : got.what === "shards" ? "shard" : got.what === "geode" ? "frostgeode" : "ks_" + got.ks;
  // the splash and the reel: a pull of water, a bright note (higher for the rare ones), then a chirp
  if (sfx.ready()) { const t = sfx.ac.currentTime; sfx.grain(t, 0.18, 1400, 0.9, 0.09); sfx.tone(t + 0.12, got.what === "glass" ? 1568 : 2093, 0.05, 0.6, "sine", null, true); if (got.what === "geode" || got.what === "keepsake") sfx.tone(t + 0.26, 2637, 0.04, 0.7, "sine", null, true); }
  setTimeout(() => cr && sfx.chirp(specOf(cr).voice * 1.15), 650);
  buzz(12);
  if (got.what === "geode") setTimeout(() => runaSays("Ooh, a frost geode! Something's asleep in there. Crack it here, it likes the cold."), 900);
  if (got.tired) setTimeout(() => { toast(tr("{0} yawns: home, or a warm in the spring?", cr.name)); }, 1200);
  setHint("");
  persist(); updateTopbar(); renderPlaceBar();
}
/** Where the one fishing stands now: walking in from the track, or sat on the stool. */
function icePos(f, S) {
  if (f.phase === "walk") { const w = walkAlong([S.entry, S.bend, [S.stool[0], S.stool[1] + PX]], f.t); return [w.x, w.y]; }
  return S.stool;
}
/** Each frame: the walk ends at the stool, the float twitches when its time comes, and goes still again if you were too slow. */
function iceTick(f, S) {
  const now = game.time;
  if (f.phase === "walk" && walkAlong([S.entry, S.bend, S.stool], f.t).done) { f.phase = "sit"; f.t = now; renderPlaceBar(); setHint(tr("tap Cast, then pull when the float twitches")); }
  if (f.phase === "cast" && now - f.t > 500) { f.phase = "wait"; f.landT = now; if (sfx.ready()) { const t = sfx.ac.currentTime; sfx.tone(t, 620, 0.06, 0.18, "sine", 300); sfx.grain(t, 0.1, 1800, 1, 0.05); } }
  if (f.phase === "wait" && now >= f.biteAt) {
    f.phase = "bite"; f.t = now; renderPlaceBar();
    if (sfx.ready()) { const t = sfx.ac.currentTime; for (let k = 0; k < 3; k++) sfx.tone(t + k * 0.09, 980 + k * 60, 0.05, 0.08, "triangle", 760); sfx.grain(t, 0.12, 2400, 1.2, 0.06); }
    buzz(8);
  }
  if (f.phase === "bite" && now - f.t > ICE_GRAB * 1000) {
    f.phase = "sit"; f.t = now; f.say = { text: tr("it got away…"), t: now };
    toast(tr("It got away. Cast again, nothing's lost"));
    renderPlaceBar();
  }
}
/** The one fishing: on the stool by the hole, the rod held out over it, its line down to the float (bobbing, or twitching hard
 *  on a bite, with rings running out on the black water); a yawn and a sleepy face once it's tired. */
function drawIceHole(f, S) {
  const cr = save.creatures.find(c => c.id === f.id); if (!cr) return;
  const now = game.time, [hx, hy] = S.hole, calm = opts().calm;
  if (f.phase === "walk") { const w = walkAlong([S.entry, S.bend, [S.stool[0], S.stool[1] + PX]], f.t); drawGuest(cr, w.x, w.y, { hop: w.done ? 0 : Math.sin(w.step * Math.PI) * 0.6, alpha: clamp(Math.hypot(w.x - S.entry[0], w.y - S.entry[1]) / (N.base * 1.2), 0, 1) }); return; }
  // (sat on the stool: its shadow on the ice under the stool, its feet on the seat)
  const tired = f.phase === "tired", [sx, sy] = S.stool, sitY = sy - S.stoolH * 0.7, sz = N.base * depth(sy);
  ctx.fillStyle = "rgba(5,0,20,.3)"; ctx.beginPath(); ctx.ellipse(sx, sy, sz * 0.36, sz * 0.09, 0, 0, TAU); ctx.fill();
  const v = drawGuest(cr, sx, sitY, { noShadow: true, mood: tired ? "sleepy" : "happy", tired, hop: f.got && now - f.got.t < 500 ? 1 - (now - f.got.t) / 500 : 0 });
  // the rod: from its paws out over the hole; drawn back over its head while casting
  const k = f.phase === "cast" ? Math.min(1, (now - f.t) / 500) : 1, swing = f.phase === "cast" ? Math.sin(k * Math.PI) : 0;
  // (a rod of dark wood, inked along its underside so it reads on the ice, with a cork grip in its paws)
  const hand = [v.x + v.size * 0.3, v.y + v.size * 0.18], tip = [lerp(hx + v.size * 0.22, v.x - v.size * 0.2, swing), lerp(hy - v.size * 1.1, v.y - v.size * 1.15, swing)];
  pxLineTo(hand[0], hand[1] + PX, tip[0], tip[1] + PX, "#160c26"); pxLineTo(hand[0], hand[1], tip[0], tip[1], "#946027");
  if (v.size > 40) pxLineTo(hand[0] + PX, hand[1], lerp(hand[0], tip[0], 0.55) + PX, lerp(hand[1], tip[1], 0.55), "#c98f3a");
  pxLineTo(hand[0] - PX, hand[1] + PX, lerp(hand[0], tip[0], 0.18) - PX, lerp(hand[1], tip[1], 0.18) + PX, "#e4c67a");
  // the line and the float: hanging by the tip before a cast, flying out on one, in the hole after
  const out = ["wait", "bite"].includes(f.phase), bite = f.phase === "bite", age = (now - (f.landT || f.t)) / 1000;
  let fy = hy - PX * 2, fx = hx;
  if (!out && f.phase !== "cast") { fx = tip[0]; fy = tip[1] + v.size * 0.45; }
  else if (f.phase === "cast") { fx = lerp(tip[0], hx, k); fy = lerp(tip[1] + v.size * 0.45, hy - PX * 2, k) - Math.sin(k * Math.PI) * v.size * 0.4; }
  else if (bite) fy += calm ? PX * 2 : (Math.sin(now * 0.05) > 0 ? PX * 3 : 0);
  else if (!calm) fy += Math.round(Math.sin(age * 2.4)) * PX;
  const fr = Math.max(2, Math.round(v.size * 0.05 / PX)) * PX;
  pxLineTo(tip[0], tip[1], fx, fy - fr * 2, "rgba(61,40,102,.85)");
  // (the water round it: a ring now and then while it waits, fast ones and a splash on a bite)
  if (out) {
    if (bite) { for (let j = 0; j < 3; j++) { const q = ((now - f.t) / 260 + j / 3) % 1; waterRing(hx, hy, S.holeR * (0.3 + q * 0.9), "#d4f6ff", (1 - q) * 0.9); } }
    else if (!calm) { const q = (age / 1.8) % 1; waterRing(hx, hy, S.holeR * (0.3 + q * 0.6), "#9fe4f4", (1 - q) * 0.4); }
  }
  // the float: a little bobber, white over red, inked round, a glint on it
  { const x0 = Math.round(fx / PX) * PX - fr, y0 = Math.round(fy / PX) * PX - fr * 2;
    ctx.fillStyle = "#160c26"; ctx.fillRect(x0 - PX, y0 - PX, fr * 2 + PX * 2, fr * 2 + PX * 2);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(x0, y0, fr * 2, fr); ctx.fillStyle = "#e0634f"; ctx.fillRect(x0, y0 + fr, fr * 2, fr);
    ctx.fillStyle = "#b8323b"; ctx.fillRect(x0 + fr, y0 + fr, fr, fr); ctx.fillStyle = "#efe6ff"; ctx.fillRect(x0, y0, PX, PX); }
  // tired: zz and a yawn
  if (tired && !f.kaoNow) { const s = (now - f.t) / 1000; drawEmote({ emote: { text: s % 4 < 2 ? KAO.sleepy.text : "zz", t: s % 2, life: 2 } }, v); }
  else if (f.kao && now >= f.kao.t && now - f.kao.t < 2200) drawEmote({ emote: { text: f.kao.text, t: (now - f.kao.t) / 1000, life: 2.2 } }, v);
  else if (f.say && now - f.say.t < 1600) drawEmote({ emote: { text: "…", t: (now - f.say.t) / 1000, life: 1.6 } }, v);
  f.view = v;
}
/** Over everything: the "!" over the float on a bite, the catch flying up out of the hole (a splash, a spray, then up over its
 *  head and away into your pocket with its name), and the sleepy one asking to stop. */
function drawIceOver(f, S) {
  const now = game.time, [hx, hy] = S.hole, v = f.view;
  if (f.phase === "bite") { fx.save(); fx.globalAlpha = Math.min(1, (now - f.t) / 120); fx.font = `400 ${Math.round(N.base * 0.5)}px ${PIXEL_FONT}`; fx.textAlign = "center"; fx.fillStyle = "#fff0b5"; fx.strokeStyle = "#160c26"; fx.lineWidth = 3; const ty = hy - N.base * 0.4 - (Math.sin(now * 0.03) > 0 ? PX : 0); fx.strokeText("!", hx, ty); fx.fillText("!", hx, ty); fx.restore(); }
  const g = f.got;
  if (g && v) {
    const e = (now - g.t) / 1000, size = Math.round(N.base * 0.42 / PX) * PX;
    if (e < 0.35) for (let j = 0; j < 8; j++) { const a = -Math.PI * (0.15 + 0.7 * pxHash(j, 3)), r = e / 0.35 * N.base * (0.4 + 0.4 * pxHash(j, 7)); ctx.fillStyle = j % 2 ? "#d4f6ff" : "#ffffff"; ctx.globalAlpha = 1 - e / 0.35; ctx.fillRect(Math.round((hx + Math.cos(a) * r) / PX) * PX, Math.round((hy + Math.sin(a) * r * 1.4) / PX) * PX, PX, PX); }
    ctx.globalAlpha = 1;
    if (e < 1.5) {
      // out of the hole in an arc, to over its head, a moment there, then a pop of sparkles
      const k = Math.min(1, e / 0.7), x = lerp(hx, v.x, k), y = lerp(hy, v.y - v.size * 1.05, k) - Math.sin(k * Math.PI) * N.base * 0.9 + (e > 0.7 ? Math.sin(e * 8) * PX : 0);
      const img = snowImg(g.icon), sc = 1 + (e > 1.2 ? (e - 1.2) * 1.2 : 0);
      if (img.complete) { ctx.imageSmoothingEnabled = false; ctx.globalAlpha = e > 1.2 ? 1 - (e - 1.2) / 0.3 : 1; ctx.drawImage(img, Math.round((x - size * sc / 2) / PX) * PX, Math.round((y - size * sc / 2) / PX) * PX, size * sc, size * sc); ctx.globalAlpha = 1; }
      if (!g.popped && e > 1.2) { g.popped = true; burst(x, y, g.what === "geode" || g.what === "keepsake" ? 22 : 12, g.what === "shards" ? ["#fff0b5", "#ad91e6", "#ffffff"] : ["#ffffff", "#b8e6f5", "#69b7d6"], 0.7); floatText("+ " + g.label, clamp(x, N.base * 1.3, W - N.base * 1.3), y - N.base * 0.3, g.what === "shards" ? "#fff0b5" : "#d4f3ff"); }
    }
  }
  if (f.phase === "tired" && v) drawBubble(v.x, v.y - v.size * 0.9, tr("so sleepy… home, or the spring?"), Math.min(1, (now - f.t) / 400));
}

// ---------- the hot spring ----------
// game.springTrip: who came from home (who: ids, each with its own start), since when (t0). They walk in along the track,
// hop over the stones into the water, sit sunk to their middles in the steam (a happy face, hearts for those side by side),
// hop out, and walk home. What a soak does is done as they set off (springSoak), so leaving early loses nothing.

const SPRING_T = { gap: 350, inHop: 500, sit: 5200, outHop: 450 };
/** Where in the water each of the three sits, in the pool's half widths: in front in the middle, then behind on either side. */
const SPRING_SEATS = [[0, 0.12], [-0.42, -0.36], [0.42, -0.36]];
/** In the water they're drawn a little smaller, so three fit the pool (sunk to their middles, it reads as sitting low). */
const SPRING_K = 0.82;
/** The picker: who goes (up to three awake glowlings from home), and off they go. pre: who's picked to begin with. */
function openSpring(pre) {
  if (game.springTrip) { sfx.tick(); toast(tr("The spring's full just now. A moment!")); return; }
  sfx.tick();
  const home = save.creatures.filter(springCan), st = game.springPick = { who: (pre || [save.active]).filter(id => home.some(c => c.id === id)).slice(0, SPRING_MAX) };
  const face = c => `<img src="${creatureImage(specOf(c), { art: 20, level: c.level, shiny: c.shiny, acc: c.acc })}" alt="">`;
  const paint = () => {
    $("snowTitle").textContent = tr("The hot spring");
    $("snowSub").textContent = tr("Pick up to three from home to warm up in the spring: each rests a little, has some fun and grows a bit, and the ones who sit together grow closer.");
    $("snowList").innerHTML = home.length ? `<div class="trip-who">${home.map(c => `<button class="res${st.who.includes(c.id) ? " on" : ""}" data-soak="${c.id}" aria-pressed="${st.who.includes(c.id)}">${face(c)}<small>${c.name}</small></button>`).join("")}</div>`
      + `<p class="me-hint">${tr("picked {0} of {1}", st.who.length, SPRING_MAX)} · ${tr("rest +{0}, fun +{1}, growing +{2}", SPRING_REST, SPRING_FUN, SPRING_GROW)}</p><button class="cta" id="soakGo" ${st.who.length ? "" : "disabled"}>${tr("Into the spring")}</button>`
      : `<p class="me-hint">${tr("Everyone at home is asleep or away. Wake someone up first.")}</p>`;
    $$("#snowList [data-soak]").forEach(b => b.addEventListener("click", () => {
      const id = Number(b.dataset.soak); sfx.tick();
      // (a fourth tap takes the place of whoever was picked first)
      st.who = st.who.includes(id) ? st.who.filter(x => x !== id) : [...st.who, id].slice(-SPRING_MAX);
      paint();
    }));
    $("soakGo")?.addEventListener("click", () => { show("snowSheet", false); startSpring(st.who.map(id => save.creatures.find(c => c.id === id))); });
  };
  paint();
  show("snowSheet", true);
}
/** Off to the spring with these (settlers will come this way too): the soak is done now, and the scene plays. */
function startSpring(list) {
  const went = springSoak(list.filter(Boolean));
  if (!went.length) return false;
  if (game.ice && went.some(c => c.id === game.ice.id)) iceStop();
  show("snowSheet", false);
  game.springTrip = { t0: game.time, who: went.map((c, i) => ({ id: c.id, t0: game.time + i * SPRING_T.gap, seat: [0, 1, 2][i] })) };
  sfx.chirp(specOf(went[0]).voice);
  toast(tr("Warm at last: {0} · rest +{1}, fun +{2} ✦", went.map(c => c.name).join(", "), SPRING_REST, SPRING_FUN));
  if (went.length > 1) setTimeout(() => runaSays("Look at them, all pink in the nose. Best seat in the snow, that spring."), 2600);
  persist(); updateTopbar(); renderPlaceBar();
  return true;
}
/** Where a bather is: walking in, hopping in, sitting in the water, hopping out, walking off (and gone, null). */
function springPos(sp, g, S) {
  // (three seats huddled together: one in front, two behind it to either side; each hops in over the stones nearest its seat)
  const [px, py] = S.spring, [du, dv] = SPRING_SEATS[g.seat], seat = [px + du * S.springRx, py + dv * S.springRy], rim = [px + du * S.springRx * 0.8, py + S.springRy + PX * 3];
  const walkIn = [S.entry, S.bend, rim], w = walkAlong(walkIn, g.t0), now = game.time;
  if (!w.done) return { x: w.x, y: w.y, alt: 0, step: w.step, phase: "walk" };
  const arrived = g.arrived || (g.arrived = now), e = now - arrived, T = SPRING_T;
  if (e < T.inHop) { const k = e / T.inHop; return { x: lerp(rim[0], seat[0], k), y: lerp(rim[1], seat[1], k), alt: Math.sin(k * Math.PI) * N.base * 0.5, phase: "in", k, inWater: k > 0.6 }; }
  if (e < T.inHop + T.sit) return { x: seat[0], y: seat[1], alt: 0, phase: "sit", s: (e - T.inHop) / 1000, inWater: true };
  if (e < T.inHop + T.sit + T.outHop) { const k = (e - T.inHop - T.sit) / T.outHop; return { x: lerp(seat[0], rim[0], k), y: lerp(seat[1], rim[1], k), alt: Math.sin(k * Math.PI) * N.base * 0.5, phase: "out", k, inWater: k < 0.4 }; }
  const back = walkAlong([rim, S.bend, S.entry], arrived + T.inHop + T.sit + T.outHop);
  return { x: back.x, y: back.y, alt: 0, step: back.step, phase: back.done ? "gone" : "home" };
}
/** Each frame: a splash going in and coming out, a heart now and then between those side by side, and when everyone's gone home, done. */
function springTick(sp, S) {
  let all = true;
  for (const g of sp.who) {
    const at = springPos(sp, g, S);
    if (at.phase !== "gone") all = false;
    if (at.phase === "in" && at.k > 0.6 && !g.splashIn) { g.splashIn = true; springSplashAt(at.x, at.y); }
    if (at.phase === "out" && !g.splashOut) { g.splashOut = true; springSplashAt(at.x, at.y); }
    if (at.phase === "sit" && at.s > 0.4 && !g.kao) { g.kao = { text: kaoFor(save.creatures.find(c => c.id === g.id), at.s > 0 && sp.who.length > 1 ? "friend" : "rest"), t: game.time }; }
  }
  // (together: a heart drifts up between two neighbours, now and then)
  const sitting = sp.who.map(g => springPos(sp, g, S)).filter(a => a.phase === "sit");
  if (sitting.length > 1 && !opts().calm && Math.random() < 0.025) { const i = Math.floor(Math.random() * (sitting.length - 1)), a = sitting[i], b = sitting[i + 1]; heart((a.x + b.x) / 2, Math.min(a.y, b.y) - N.base * 0.5); }
  if (all) { game.springTrip = null; renderPlaceBar(); }
}
function springSplashAt(x, y) {
  waterSplashes.push({ x, y, t0: game.time });
  if (sfx.ready()) { const t = sfx.ac.currentTime; sfx.grain(t, 0.16, 1700, 0.9, 0.08); sfx.tone(t + 0.02, rand(900, 1200), 0.03, 0.15, "sine", 500); }
}
let waterSplashes = [];
/** A bather: walking, hopping over the stones, or sat in the water sunk to its middle, the water's front laid over its lower
 *  half (as the moss garden's bath does): its body shows a little through the water, and a pale line rings it where it meets it. */
function drawBather(sp, g, S) {
  const cr = save.creatures.find(c => c.id === g.id), at = springPos(sp, g, S);
  if (!cr || at.phase === "gone") return;
  const size = N.base * depth(at.y) * SPRING_K, wet = at.inWater, sunk = wet ? size * 0.34 * (at.phase === "sit" ? 1 : at.phase === "in" ? (at.k - 0.6) / 0.4 : 1 - at.k / 0.4) : 0;
  // (coming in from the track and going back along it, they fade in and out at the clearing's edge)
  const fade = at.phase === "home" || at.phase === "walk" ? clamp(Math.hypot(at.x - S.entry[0], at.y - S.entry[1]) / (N.base * 1.2), 0, 1) : 1;
  const bob = at.phase === "sit" && !opts().calm ? Math.sin(game.time * 0.003 + g.id) * PX : 0;
  // (in the water, nothing of it shows below the pool's front: drawn only above the water line, or over the pool itself)
  if (wet) { ctx.save(); ctx.beginPath(); ctx.rect(at.x - size, at.y - size * 3, size * 2, size * 3); ctx.ellipse(S.spring[0], S.spring[1], S.springRx + PX, S.springRy + PX, 0, 0, TAU); ctx.clip(); }
  const v = drawGuest(cr, at.x, at.y + sunk + bob, { k: SPRING_K, noShadow: wet, alt: at.alt, hop: at.step !== undefined ? Math.sin(at.step * Math.PI) * 0.6 : 0, mood: "happy", alpha: fade });
  if (wet) { ctx.restore(); springWater(at.x, at.y, size, S); }
  if (g.kao && game.time - g.kao.t < 2400) drawEmote({ emote: { text: g.kao.text, t: (game.time - g.kao.t) / 1000, life: 2.4 } }, v);
}
/** The spring's water laid over a bather from where it meets the water down, inside the pool's ellipse, in the pool's own
 *  colours (pale in the middle, deeper out to the stones), a little see-through; and a pale line round it at the water. */
function springWater(x, y, size, S) {
  const [px, py] = S.spring, rx = S.springRx, ry = S.springRy, w = size * 0.5, top = Math.round(y / PX) * PX;
  ctx.globalAlpha = 0.86;
  for (let yy = top; yy < top + size * 0.62; yy += PX) for (let xx = Math.round((x - w) / PX) * PX; xx < x + w; xx += PX) {
    const d = Math.hypot((xx + PX / 2 - px) / rx, (yy + PX / 2 - py) / ry);
    if (d >= 1) continue;
    ctx.fillStyle = d < 0.35 ? "#8fd8ef" : d < 0.7 ? "#69b7d6" : "#3383a8";
    ctx.fillRect(xx, yy, PX, PX);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#d4f6ff";
  for (let xx = Math.round((x - size * 0.34) / PX) * PX; xx < x + size * 0.34; xx += PX) if (Math.hypot((xx - px) / rx, (top - py) / ry) < 1) ctx.fillRect(xx, top + (Math.abs(xx - x) > size * 0.26 ? PX : 0), PX, PX);
}
/** Over the spring while they sit: steam curling up off the water round them (thicker than the spring's own), and the splashes. */
function drawSpringOver(sp, S) {
  const calm = opts().calm, now = game.time / 1000, [px, py] = S.spring;
  waterSplashes = waterSplashes.filter(s => game.time - s.t0 < 600);
  for (const s of waterSplashes) { const k = (game.time - s.t0) / 600; waterRing(s.x, s.y, N.base * (0.2 + k * 0.5), "#ffffff", 1 - k); for (let j = 0; j < 6; j++) { const a = -Math.PI * (0.1 + 0.8 * pxHash(j, Math.round(s.t0))); ctx.globalAlpha = 1 - k; ctx.fillStyle = "#d4f6ff"; ctx.fillRect(Math.round((s.x + Math.cos(a) * k * N.base * 0.6) / PX) * PX, Math.round((s.y + Math.sin(a) * k * N.base * 0.9 + k * k * N.base * 0.6) / PX) * PX, PX, PX); } ctx.globalAlpha = 1; }
  if (!sp.who.some(g => springPos(sp, g, S).inWater)) return;
  for (let j = 0; j < (calm ? 4 : 10); j++) {
    const ph = calm ? 0.4 : (now * 0.35 + j * 0.37) % 1, x0 = px + (pxHash(j, 5) - 0.5) * S.springRx * 1.6, sway = calm ? 0 : Math.sin(now * 1.3 + j) * N.base * 0.12;
    const x = x0 + sway * ph, y = py - ph * N.base * 1.6, r = Math.max(2, Math.round(N.base * (0.04 + ph * 0.06) / PX)) * PX;
    // (a puff of steam, white edged in the pool's blue so it shows against the snow)
    ctx.globalAlpha = 0.6 * (1 - ph) * Math.min(1, ph * 6); ctx.fillStyle = "#b8e6f5";
    ctx.fillRect(Math.round(x / PX) * PX - PX, Math.round(y / PX) * PX + PX, r * 2 + PX * 2, r);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(Math.round(x / PX) * PX, Math.round(y / PX) * PX, r * 2, r);
  }
  ctx.globalAlpha = 1;
}

// ---------- carving at Runa's bench ----------

/** The bench's sheet: the four pieces, each with its picture, who loves it and its price in frostglass and shards. */
function openCarving() {
  sfx.tick();
  const paint = () => {
    $("snowTitle").textContent = tr("Runa's bench");
    $("snowSub").innerHTML = tr("Runa carves frostglass into things for your home. You have {0} and {1}.", `${ic("glass")}${glassNow()}`, `${ic("shard")}${save.shards}`);
    $("snowList").innerHTML = CARVINGS.map(d => {
      const why = carveWhyNot(d), who = d.lovers.map(b => BEHAVIOR_NAMES[b]).join(tr(" and "));
      const tag = why === "have" ? (hasDecor(d.id) ? tr("placed ✓") : tr("In your chest ✓")) : `${ic("glass")}${d.glass} · ${ic("shard")}${d.cost}`;
      const note = why === "glass" ? tr("not enough frostglass") : why === "shards" ? tr("not enough shards") : tr("{0} love it", who[0].toUpperCase() + who.slice(1)) + (d.wall ? " · " + tr("hangs on a wall") : "");
      return `<button class="snack carve${why ? " dim" : ""}" data-carve="${d.id}" ${why ? "disabled" : ""}>${decorThumb(d)}<span><b>${d.name}</b><small>${note}</small></span><span class="cost">${tag}</span></button>`;
    }).join("") + `<p class="me-hint">${tr("What she carves waits in your chest: set it out in any room at home.")}</p>`;
    $$("#snowList [data-carve]").forEach(b => b.addEventListener("click", () => {
      const d = DECO[b.dataset.carve];
      if (!carve(d.id)) { sfx.tick(); return; }
      sfx.tinkle(); setTimeout(() => sfx.levelUp(), 200);
      toast(tr("{0} is waiting in your chest ✦", d.name));
      runaSays(pick(["Hold still, block. There. Mind, it's colder than it looks.", "Best carving in the snow, that. I'd know.", "Chip, chip, and out it comes. It was in there all along, you know."]));
      taskDone("decor");
      persist(); updateTopbar(); renderPlaceBar(); paint();
    }));
  };
  paint();
  show("snowSheet", true);
}

// ---------- the settlement: moving out, the huts, Runa's sled ----------

PX_ICON_MAPS.hut = ["............", "............", ".......SS...", "....WWWSSs..", "...WWwwwwT..", "..WWwswwssT.", "..WwwwwwwwT.", ".WwswwkkwsTT", ".WwwwkkGkwTT", ".WWwwkGGkwTT", "..sssssssss.", "............"];
/** From its card at home: off it goes to live in the snowfields (a word, a chirp), its bed free again. */
function moveToSnow(cr) {
  if (!settleOut(cr.id)) { sfx.tick(); return; }
  show("glowCard", false);
  sfx.chirp(specOf(cr).voice * 1.15);
  toast(tr("{0} set off for the snowfields: Runa will look after it ✦", cr.name));
  persist(); syncActors(); if (game.scene === "nest" && !isPlace()) renderNest(true); updateTopbar(); renderPlaceBar();
}
/** Home again from the snowfields, if a bed is free; says so either way. */
function snowHome(id) {
  const c = save.creatures.find(x => x.id === id);
  if (!settlerHome(id)) { toast(tr("No bed free at home: make some room first")); sfx.tick(); return false; }
  sfx.chirp(specOf(c).voice); toast(tr("{0} came home from the snowfields ✦", c.name));
  persist(); syncActors(); if (game.scene === "nest" && !isPlace()) renderNest(true); updateTopbar(); renderPlaceBar();
  return true;
}
/** The first time the game is opened on a day: Runa's sled comes over the snow with the settlers' frostglass (and any frost geodes). */
function sledToast() {
  const got = sledCome();
  if (!got) return;
  persist(); updateTopbar();
  setTimeout(() => {
    toast(tr("Runa's sled came over the snow: frostglass ×{0} from the snowfields", got.glass) + (got.geodes ? " · " + tr("and a frost geode ×{0}", got.geodes) : "") + " ✦");
    if (sfx.ready()) { const t = sfx.ac.currentTime; for (let k = 0; k < 4; k++) sfx.tone(t + k * 0.11, 1568 + k * 196, 0.03, 0.5, "sine", null, true); }
  }, 2200);
}
/** The settlement's sheet, from Runa's bar: who lives here, the huts (and the next one to build), the basket, the door. */
function openSettle() {
  sfx.tick();
  const paint = () => {
    const list = settlers(), cap = settleCap(), price = hutPrice(), fr = doorFrost(list.length);
    const face = c => `<img src="${creatureImage(specOf(c), { art: 20, level: c.level, shiny: c.shiny, acc: c.acc })}" alt="">`;
    $("snowTitle").textContent = tr("The settlement");
    $("snowSub").textContent = tr("Grown glowlings can move out here from their card at home. Each sends {0} frostglass a day on Runa's sled; her basket holds {1} days of it.", SLED_GLASS, SLED_DAYS);
    $("snowList").innerHTML = `<h3 class="forge-h">${tr("Living here: {0} of {1}", list.length, cap)}</h3>`
      + (list.length ? `<div class="trip-who">${list.map(c => `<button class="res" data-settler="${c.id}">${face(c)}<small>${c.name}</small></button>`).join("")}</div>`
        : `<p class="me-hint">${tr("Nobody yet. Open a grown glowling's card at home: “Move to the snowfields”.")}</p>`)
      + (price === null ? `<p class="me-hint">${tr("All three snow huts stand. Room for {0}.", SETTLE_MAX)}</p>`
        : `<button class="snack carve${glassNow() < price ? " dim" : ""}" id="hutBuy" ${glassNow() < price ? "disabled" : ""}><img class="em px-thumb" src="${pxIcon("hut")}" alt=""><span><b>${tr("A snow hut")}</b><small>${tr("room for {0} more", SETTLE_HUT)}${glassNow() < price ? " · " + tr("not enough frostglass") : ""}</small></span><span class="cost">${ic("glass")}${price}</span></button>`)
      + `<p class="me-hint">${doorOpen() ? tr("The ice door stands open.") : tr(["The ice door is thick with frost.", "The frost on the ice door has thinned a little.", "The frost on the ice door is thin now. Light shows through it.", "The ice door is almost clear. It's waiting for something warm."][fr])}</p>`
      + (doorOpen() ? `<button class="act" id="toHall">${ic("glass")}${tr("Into the Winter hall")}</button>` : "");
    $$("#snowList [data-settler]").forEach(b => b.addEventListener("click", () => { show("snowSheet", false); openGlowling(save.creatures.find(c => c.id === Number(b.dataset.settler))); }));
    $("hutBuy")?.addEventListener("click", () => {
      if (!buildHut()) { sfx.tick(); return; }
      sfx.tinkle(); setTimeout(() => sfx.levelUp(), 200);
      toast(tr("A new snow hut: room for {0} more ✦", SETTLE_HUT));
      runaSays(pick(["Snow blocks, a good door, and a hole for the smoke. Best hut in the snow.", "There. Warm inside, I promise. I sat in it to check."]));
      persist(); updateTopbar(); renderPlaceBar(); paint();
    });
    $("toHall")?.addEventListener("click", () => openWinterHall());
  };
  paint();
  show("snowSheet", true);
}

// ---------- the settlers in the clearing ----------
// Each settler does one thing at a time, for a while (SETTLE_SLOT), then walks over to the next: fishing by the hole, sliding
// on the pond, warming in the spring, napping in a drift, or pottering by its hut. Who does what is shared out by their order
// (no more than three at anything), so the clearing always has a bit of everything.

const SETTLE_SLOT = 45e3, SETTLE_ACTS = ["fish", "nap", "spring", "slide", "hut"], SETTLE_K = 0.6;
/** Settlers are drawn small, so a dozen fit the clearing (on a phone's close-up, no bigger than beside Runa there either). */
const settleK = () => Math.min(SETTLE_K, 0.62 * N.kbase / N.base);
/** Where the huts stand, along the clearing's free front edge (u, v across the floor), in the order they're built. */
const HUT_SPOTS = [[0.93, 0.3], [0.62, 0.93], [0.9, 0.93]];
/** Where each of three sits to fish (round the hole on the ice), and where each naps (in a drift). */
const FISH_SPOTS = [[0.31, 0.64], [0.3, 0.79], [0.13, 0.58]], NAP_SPOTS = [[0.3, 0.4], [0.86, 0.52], [0.44, 0.76]];
/** The three runs across the open snow a slider whizzes along on its belly, back and forth (from, to). */
const SLIDE_LANES = [[[0.36, 0.46], [0.52, 0.62]], [[0.5, 0.82], [0.7, 0.86]], [[0.8, 0.64], [0.88, 0.8]]];
const uvAt = ([u, v]) => isoAt(u, v);
/** What settler k (of those living here, in the order they came) is doing now, and which of its kind's three spots. */
function settleDoing(k, now = Date.now()) {
  let act = SETTLE_ACTS[(k + Math.floor(now / SETTLE_SLOT)) % SETTLE_ACTS.length];
  // (the spring belongs to the glowlings from home while they're in it)
  if (act === "spring" && game.springTrip) act = "nap";
  return { act, j: Math.floor(k / SETTLE_ACTS.length) % 3 };
}
/** Where a settler's doing is, on screen: its spot (a slider's lane's start, a bather's seat). */
function settleSpot(d, S) {
  if (d.act === "fish") return uvAt(FISH_SPOTS[d.j]);
  if (d.act === "nap") return uvAt(NAP_SPOTS[d.j]);
  if (d.act === "slide") return uvAt(SLIDE_LANES[d.j][0]);
  if (d.act === "spring" && S.spring) { const [du, dv] = SPRING_SEATS[d.j]; return [S.spring[0] + du * S.springRx, S.spring[1] + dv * S.springRy]; }
  const h = HUT_SPOTS[d.j], [x, y] = h && d.j < hutsNow() ? uvAt(h) : uvAt([0.56 + d.j * 0.06, 0.42]);
  return [x - N.base * 0.45, y + N.base * 0.2];
}
/** Each settler's walk from where it was to where it's going (kept between frames, by id). */
const settleWalks = new Map();
/** Where a settler is now: walking over, or at its doing (a slider somewhere along its lane). */
function settlePos(c, k, S) {
  const d = settleDoing(k), key = d.act + d.j, to = settleSpot(d, S);
  let w = settleWalks.get(c.id);
  if (!w) { w = { key, from: to, t0: -1e9 }; settleWalks.set(c.id, w); }
  if (w.key !== key) { w.from = w.at || to; w.key = key; w.t0 = game.time; }
  const along = walkAlong([w.from, to], w.t0);
  let at = { x: along.x, y: along.y, walking: !along.done, step: along.step, d };
  if (along.done && d.act === "slide") {
    // (back and forth along the lane, easing at each end, as if pushing off again)
    const [a, b] = SLIDE_LANES[d.j].map(uvAt), ph = opts().calm ? 0.25 : (game.time / 1000 * 0.22 + c.id * 0.37) % 1, f = 0.5 - 0.5 * Math.cos(ph * TAU);
    at = { ...at, x: lerp(a[0], b[0], f), y: lerp(a[1], b[1], f), dir: Math.sin(ph * TAU) };
  }
  w.at = [at.x, at.y];
  return at;
}
/** A settler, at its doing: fishing (sat by the hole, a short line out to it), sliding (on its belly, a spray behind), in the
 *  spring (sunk to its middle, as the bathers are), asleep in a drift (only its top showing, zz), or by its hut. */
function drawSettler(c, at, S) {
  const size = N.base * depth(at.y) * settleK(), d = at.d, now = game.time;
  if (at.walking) { drawGuest(c, at.x, at.y, { k: settleK(), hop: Math.sin(at.step * Math.PI) * 0.6 }); return; }
  if (d.act === "spring" && S.spring) {
    const sunk = size * 0.34, bob = opts().calm ? 0 : Math.sin(now * 0.003 + c.id) * PX;
    ctx.save(); ctx.beginPath(); ctx.rect(at.x - size, at.y - size * 3, size * 2, size * 3); ctx.ellipse(S.spring[0], S.spring[1], S.springRx + PX, S.springRy + PX, 0, 0, TAU); ctx.clip();
    const v = drawGuest(c, at.x, at.y + sunk + bob, { k: settleK(), noShadow: true, mood: "happy" });
    ctx.restore(); springWater(at.x, at.y, size, S);
    if ((now / 1000 + c.id) % 9 < 2.2) drawEmote({ emote: { text: KAO.happy.text, t: ((now / 1000 + c.id) % 9), life: 2.2 } }, v);
    return;
  }
  if (d.act === "nap") {
    // (sunk into the drift: drawn low, the snow heaped over it up to its middle, lit white on top, blue in its shade)
    const v = drawGuest(c, at.x, at.y + size * 0.3, { k: settleK(), mood: "sleepy", tired: true, noShadow: true });
    snowDome(Math.round(at.x / PX) * PX, Math.round((at.y + size * 0.06) / PX) * PX, Math.round(size * 0.58 / PX), Math.round(size * 0.4 / PX));
    const s = ((now / 1000) + c.id * 0.7) % 3;
    drawEmote({ emote: { text: "z", t: s, life: 3 } }, v);
    return;
  }
  if (d.act === "slide") {
    // a spray of snow off the ice behind it, the way it came
    if (!opts().calm) for (let j = 1; j <= 4; j++) { ctx.globalAlpha = 0.7 - j * 0.15; ctx.fillStyle = j % 2 ? "#ffffff" : "#d4f6ff"; ctx.fillRect(Math.round((at.x - Math.sign(at.dir || 1) * j * size * 0.16) / PX) * PX, Math.round((at.y - PX * (j % 2)) / PX) * PX, PX, PX); }
    ctx.globalAlpha = 1;
    drawGuest(c, at.x, at.y, { k: settleK(), mood: "happy", hop: 0.15 });
    return;
  }
  const v = drawGuest(c, at.x, at.y, { k: settleK(), mood: "happy", hop: d.act === "hut" && !opts().calm && (now / 1000 + c.id) % 5 < 0.5 ? Math.sin(((now / 1000 + c.id) % 5) / 0.5 * Math.PI) : 0 });
  if (d.act === "fish" && S.hole) {
    // a short rod out over the hole, its line down to the water, a float bobbing slowly
    const tip = [lerp(v.x, S.hole[0], 0.6), v.y - v.size * 0.6], fy = S.hole[1] - PX * 2 + (opts().calm ? 0 : Math.round(Math.sin(now * 0.002 + c.id)) * PX);
    pxLineTo(v.x, v.y + v.size * 0.1, tip[0], tip[1], "#946027");
    pxLineTo(tip[0], tip[1], lerp(tip[0], S.hole[0], 0.8), fy, "rgba(61,40,102,.85)");
    ctx.fillStyle = "#e0634f"; ctx.fillRect(Math.round(lerp(tip[0], S.hole[0], 0.8) / PX) * PX, Math.round(fy / PX) * PX, PX * 2, PX * 2);
  }
}

// ---------- the huts, and the clearing growing festive ----------

/** A dome of snow on the room's pixel grid, its foot's middle at (cx, by), R pixels across each way and H high: inked round,
 *  lit white on the left, lilac in the middle, blue-grey in its shade; seams(r, q) may darken a pixel (a hut's courses of blocks). */
function snowDome(cx, by, R, H, seams) {
  const P = PX, half = r => r > H ? -1 : Math.round(R * Math.sqrt(Math.max(0, 1 - (r / (H + 0.5)) ** 2)));
  ctx.fillStyle = "#160c26";
  for (let r = -1; r <= H + 1; r++) { const h = Math.max(half(Math.max(0, r)), half(r + 1)) + 1; if (h > 0) ctx.fillRect(cx - h * P, by - r * P, (h * 2 + 1) * P, P); }
  for (let r = 0; r <= H; r++) {
    const h = half(r);
    for (let q = -h; q <= h; q++) {
      const f = q / (h || 1), lit = f < -0.45 ? 0 : f < 0.35 ? 1 : 2, dark = seams && seams(r, q);
      ctx.fillStyle = dark ? ["#efe6ff", "#e4dfe8", "#b9b3c0"][lit] : r === H || (r === H - 1 && Math.abs(q) < h) ? "#ffffff" : ["#ffffff", "#f4f0fa", "#cfc4d6"][lit];
      ctx.fillRect(cx + q * P, by - r * P, P, P);
    }
  }
  return half;
}
/** A snow hut at (x, y), its floor `s` wide: a dome of snow blocks (their courses and staggered joints faint on it), a low dark
 *  door at the front with a warm light in it, a stub of a stovepipe on top (smoking, once six live here). */
function drawSnowHut(x, y, s, smoke) {
  const P = PX, R = Math.round(s * 0.5 / P), H = Math.round(s * 0.5 / P), cx = Math.round(x / P) * P, by = Math.round(y / P) * P;
  ctx.fillStyle = "rgba(5,0,20,.3)"; ctx.beginPath(); ctx.ellipse(x, y, s * 0.6, s * 0.18, 0, 0, TAU); ctx.fill();
  const half = snowDome(cx, by, R, H, (r, q) => r % 3 === 2 || (r % 3 === 1 && (q + Math.floor(r / 3) * 2 + 40) % 5 === 0));
  // the door: a dark arch, a warm glow low inside it
  const dw = Math.max(2, Math.round(R * 0.3)), dh = Math.max(3, Math.round(H * 0.55)), dx = cx - Math.round(R * 0.25) * P;
  for (let r = 0; r < dh; r++) { const hw = r > dh - 2 ? dw - 1 : dw; for (let q = -hw; q <= hw; q++) { ctx.fillStyle = Math.abs(q) === hw ? "#160c26" : r < 2 && Math.abs(q) < hw - 1 ? "#eec26a" : "#3d2866"; ctx.fillRect(dx + q * P, by - r * P, P, P); } }
  // the stovepipe, out of the dome's shoulder, and its smoke
  const pq = Math.round(R * 0.4), top = [...Array(H + 1).keys()].reverse().find(r => half(r) >= pq) ?? 0, px = cx + pq * P, py = by - top * P;
  ctx.fillStyle = "#160c26"; ctx.fillRect(px - P, py - 4 * P, 4 * P, 4 * P);
  ctx.fillStyle = "#5d5666"; ctx.fillRect(px, py - 3 * P, 2 * P, 3 * P); ctx.fillStyle = "#8a8494"; ctx.fillRect(px, py - 3 * P, P, 3 * P);
  if (smoke) for (let j = 0; j < 4; j++) {
    const ph = opts().calm ? 0.2 + j * 0.2 : (game.time / 2400 + j / 4 + x * 0.001) % 1, r = Math.max(1, Math.round((1 + ph * 2.5) * s / 40)) * P;
    ctx.globalAlpha = 0.75 * (1 - ph); ctx.fillStyle = j % 2 ? "#a596a8" : "#b9b3c0";
    ctx.fillRect(Math.round((px + Math.sin(ph * 5 + j) * s * 0.08) / P) * P, Math.round((py - 5 * P - ph * s * 0.9) / P) * P, r * 2, r);
  }
  ctx.globalAlpha = 1;
}
/** Nine living here: a garland of little ice lanterns on posts along the clearing's front, lit warm; twelve, and it's a feast:
 *  bunting in every colour between them, the lanterns brighter, and sparkles drifting up. */
function drawGarland(festive) {
  const pts = [[0.5, 1], [0.75, 1], [1, 1], [1, 0.62], [1, 0.22]].map(uvAt), post = N.isoW / ISO_G * 0.75, now = game.time;
  const cols = ["#e0634f", "#eec26a", "#57ad6a", "#69b7d6", "#ad91e6", "#e88bb1"];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], n = Math.max(6, Math.round(Math.hypot(x1 - x0, y1 - y0) / PX));
    const at = f => [lerp(x0, x1, f), lerp(y0, y1, f) - post + Math.sin(f * Math.PI) * N.base * 0.3];
    for (let k = 0; k <= n; k++) { const [x, y] = at(k / n); ctx.fillStyle = "#5e3a1c"; ctx.fillRect(Math.round(x / PX) * PX, Math.round(y / PX) * PX, PX, PX); }
    for (let k = 1; k < 4; k++) {
      const [x, y] = at(k / 4), X = Math.round(x / PX) * PX, Y = Math.round(y / PX) * PX + PX, glow = festive ? 1 : 0.7 + 0.3 * Math.sin(now * 0.003 + i * 2 + k);
      // (a pennant either side of each lantern, in every colour, for the feast)
      if (festive) for (const side of [-1, 1]) { const [px2, py2] = at(k / 4 + side * 0.07), PXX = Math.round(px2 / PX) * PX, PY = Math.round(py2 / PX) * PX; ctx.fillStyle = cols[(i * 3 + k + (side > 0 ? 1 : 0)) % cols.length]; for (let r = 0; r < 4; r++) ctx.fillRect(PXX - Math.max(0, 2 - r) * PX + (r > 1 ? (r - 1) * PX : 0) - PX, PY + r * PX, Math.max(1, 4 - r) * PX, PX); }
      ctx.globalAlpha = 0.35 * glow; ctx.fillStyle = "#fff0b5"; ctx.fillRect(X - 2 * PX, Y - PX, 5 * PX, 5 * PX); ctx.globalAlpha = 1;
      ctx.fillStyle = "#160c26"; ctx.fillRect(X - PX, Y - PX, 3 * PX, 4 * PX);
      ctx.fillStyle = "#b8e6f5"; ctx.fillRect(X, Y, PX, 2 * PX); ctx.fillStyle = "#eec26a"; ctx.fillRect(X, Y + PX, PX, PX);
    }
  }
  for (const [x, y] of pts) { ctx.fillStyle = "#160c26"; ctx.fillRect(Math.round(x / PX) * PX - PX, Math.round((y - post) / PX) * PX, 3 * PX, Math.round(post / PX) * PX); ctx.fillStyle = "#946027"; ctx.fillRect(Math.round(x / PX) * PX, Math.round((y - post) / PX) * PX + PX, PX, Math.round(post / PX) * PX - PX); ctx.fillStyle = "#ffffff"; ctx.fillRect(Math.round(x / PX) * PX - PX, Math.round((y - post) / PX) * PX - PX, 3 * PX, PX); }
  if (festive && !opts().calm && Math.random() < 0.08) { const [x, y] = pick(pts); game.sparks.push({ x: x + rand(-N.base, N.base), y: y - post, vx: rand(-10, 10), vy: rand(-50, -25), t: 0, life: 1.2, s: 2, color: pick(cols) }); }
}

/** What the settlement adds to the clearing's back-to-front order (see snowItems): its huts, its settlers, the garland. */
function settleItems(S) {
  const items = [], list = settlers().sort((p, q) => p.settle.since - q.settle.since || p.id - q.id), n = list.length, tile = N.isoW / ISO_G;
  const box = ([x, y]) => { const [u, v] = isoFrom(x, y); return { u0: u * ISO_G, u1: u * ISO_G, v0: v * ISO_G, v1: v * ISO_G }; };
  HUT_SPOTS.slice(0, hutsNow()).forEach(h => { const [x, y] = uvAt(h); items.push({ y, draw: () => drawSnowHut(x, y, tile * 1.7, n >= 6), box: box([x, y]) }); });
  list.forEach((c, k) => { const at = settlePos(c, k, S); items.push({ y: at.y + 0.5, after: !at.walking && at.d.act === "spring" ? "hotspring" : !at.walking && at.d.act === "fish" ? "pond" : null, draw: () => drawSettler(c, at, S), box: box([at.x, at.y]) }); });
  if (n >= 9) { const [, y] = uvAt([1, 1]); items.push({ y: y + 1, draw: () => drawGarland(n >= SETTLE_MAX) }); }
  return items;
}
/** What the door looks like (see ISO_ART.icedoor): how thin its frost, and open once Runa's third wish is brought (after the moment it melts open). */
const doorView = () => ({ frost: doorFrost(), open: doorOpen() && !(game.doorFx && game.time - game.doorFx.t < DOOR_FX * 0.6) });

// ---------- the door, the lullaby, the hall ----------

const DOOR_FX = 3200;
/** Where the ice door stands, on screen (its foot). */
const doorSpot = () => { const p = isoLayout().placed.icedoor; return p ? isoAt((p.i + 0.5) / ISO_G, (p.j + 0.5) / ISO_G) : null; };
/** Runa's third wish: summer in her paws, and the door melts open. A glow swells inside the ice, the frost runs off it in
 *  sparkles, a soft crack and a chime, and it stands open; then she has her say and you go in. */
function openIceDoor() {
  if (!inSnow()) { if (talk("iceDoor")) afterTalk = () => openWinterHall(); return; }
  // (her thank-you bubble steps aside, so the door can be seen: the line stays in the Book)
  game.doorFx = { t: game.time }; game.hero = null;
  if (sfx.ready()) { const t = sfx.ac.currentTime; sfx.wash(t, 2.2, 300, 1800, 0.6, 0.04); [392, 494, 587, 784].forEach((f, i) => sfx.tone(t + 1.2 + i * 0.16, f, 0.05, 1.6, "sine", null, true)); sfx.grain(t + 1.9, 0.3, 2600, 1, 0.08); }
  buzz([10, 40, 10, 40, 20]);
  setTimeout(() => { if (talk("iceDoor")) afterTalk = () => openWinterHall(); else openWinterHall(); }, DOOR_FX + 300);
}
/** Over the door while it opens: light swelling from inside, frost sparkling off it, a burst as it gives. */
function drawDoorFx(S) {
  const f = game.doorFx, at = doorSpot();
  if (!f || !at) return;
  const e = (game.time - f.t) / DOOR_FX;
  if (e > 1.4) { game.doorFx = null; return; }
  const [x, y] = at, h = N.isoW / ISO_G * 1.6, cy = y - h * 0.45, r = N.base * (0.6 + Math.min(1, e) * 1.6);
  const g = ctx.createRadialGradient(x, cy, 0, x, cy, r);
  g.addColorStop(0, `rgba(255,240,181,${0.75 * Math.min(1, e * 1.5) * (e > 1 ? 1.4 - e : 1)})`); g.addColorStop(1, "rgba(184,230,245,0)");
  ctx.fillStyle = g; ctx.fillRect(x - r, cy - r, r * 2, r * 2);
  if (!opts().calm && e < 1 && Math.random() < 0.6) game.sparks.push({ x: x + rand(-N.base * 0.4, N.base * 0.4), y: cy + rand(-h * 0.4, h * 0.4), vx: rand(-30, 30), vy: rand(-40, 10), t: 0, life: 0.8, s: 2, color: pick(["#ffffff", "#b8e6f5", "#fff0b5"]) });
  if (e > 0.6 && !f.burst) { f.burst = true; burst(x, cy, 30, ["#ffffff", "#b8e6f5", "#fff0b5", "#eec26a"], 0.9); }
}
/** Six living here: through the ice comes a lullaby, and Mossa knows it (a song spark of its own, heard, not brought home). */
function hearLullaby() {
  if (save.sparks.got.icelull || !talk("lullaby")) return;
  save.sparks.got.icelull = { t: Date.now(), by: "" };
  save.sparks.pip = (save.sparks.pip || 0) + 1;
  playSpark("icelull");
  afterTalk = () => { game.sparkNew = [...(game.sparkNew || []), "icelull"]; showNewSparks(600); };
  persist();
}
/** The ice door, tapped: open, the way into the hall; shut, Runa says how the frost is doing. */
function tapIceDoor() {
  if (doorOpen()) { openWinterHall(); return; }
  sfx.tick();
  runaSays(["That door's warm. Every winter, warm. Never opened for a hammer. I've asked nicely.", "See? The frost's let go a little. Warm paws nearby, that's what it likes.", "Thinner every week. I can nearly see the light through it.", "Almost clear. It's waiting for something. Summer, maybe. Don't ask me where we'd get that."][doorFrost()]);
}
Object.assign(PROP_TAP, { icedoor: () => pressProp("icedoor", tapIceDoor) });
PROP_CUES.icedoor = { icon: "glass", on: () => doorOpen() };

/**
 * The mural on the hall's far wall, 96 by 60 old pixels: light spreading out from the grotto in the middle along four roads,
 * to four lands in the corners (the peaks under their aurora, the snowfields with a little door, the isle's lighthouse over
 * the sea, and a dark land), and at the end of each road something small kept, glowing. Painted long ago: flaked here and there.
 */
let muralUrl = null;
function muralArt() {
  if (muralUrl) return muralUrl;
  const W0 = 96, H0 = 60, S = 4, c = document.createElement("canvas"); c.width = W0 * S; c.height = H0 * S;
  const g = c.getContext("2d"), px = (x, y, col) => { g.fillStyle = col; g.fillRect(Math.round(x) * S, Math.round(y) * S, S, S); };
  // the wall: courses of old stone
  for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) px(x, y, y % 8 === 0 || (x + (Math.floor(y / 8) % 2) * 6) % 12 === 0 ? "#2a2433" : pxHash(x, y) > 0.8 ? "#4a4254" : "#3a3440");
  const cx = 48, cy = 31;
  // the four roads of light, dotted gold, out to the corners
  const lands = [[14, 12], [82, 12], [82, 49], [14, 49]];
  for (const [lx, ly] of lands) for (let k = 0; k <= 40; k++) { const f = k / 40; if (k % 3 !== 2) px(lerp(cx, lx, f), lerp(cy, ly, f), f < 0.5 ? "#eec26a" : "#c98f3a"); }
  // the grotto: a dark mouth in a ring of rock, and the light in it
  for (let y = -9; y <= 9; y++) for (let x = -11; x <= 11; x++) { const d = Math.hypot(x / 11, y / 9); if (d <= 1) px(cx + x, cy + y, d > 0.82 ? "#5d5666" : d > 0.55 ? "#22143a" : d > 0.3 ? "#eec26a" : "#fff0b5"); }
  // the peaks (top left): white points, green and pink ribbons over them
  for (let k = 0; k < 9; k++) for (let x = -k; x <= k; x++) px(14 + x, 6 + k, k < 3 ? "#ffffff" : "#8a8494");
  for (let x = 4; x < 25; x++) { px(x, 2 + Math.round(Math.sin(x * 0.6)), "#57ad6a"); px(x, 3 + Math.round(Math.sin(x * 0.6 + 1)), "#e88bb1"); }
  // the snowfields (top right): a white drift, a round hut, a little blue door
  for (let x = 72; x < 93; x++) for (let y = 13; y < 17; y++) px(x, y, "#efe6ff");
  for (let y = -4; y <= 0; y++) for (let x = -5; x <= 5; x++) if (Math.hypot(x / 5, y / 4.5) <= 1) px(77 + x, 12 + y, "#ffffff");
  for (let y = 6; y < 13; y++) { px(87, y, "#69b7d6"); px(88, y, "#b8e6f5"); }
  // the isle (bottom right): waves, a rock, a lighthouse with its light
  for (let x = 70; x < 94; x++) { px(x, 54 + ((x % 4) < 2 ? 0 : 1), "#3383a8"); px(x, 57, "#1d5276"); }
  for (let y = 43; y < 54; y++) { px(88, y, y % 3 ? "#efe6ff" : "#e0634f"); px(89, y, y % 3 ? "#cfc4d6" : "#b8323b"); }
  // the dark land (bottom left): a low shape of deep violet, and still, inside it, a light
  for (let y = -5; y <= 5; y++) for (let x = -9; x <= 9; x++) if (Math.hypot(x / 9, y / 5) <= 1) px(11 + x, 51 + y, "#160c26");
  // at each road's end, what that land keeps: a small bright spark with a cross of light
  for (const [lx, ly] of lands) { px(lx, ly, "#ffffff"); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) px(lx + dx, ly + dy, "#fff0b5"); }
  // flaked with age: here and there the paint gone back to bare stone
  for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) if (pxHash(x * 7, y * 3) > 0.94) px(x, y, "#3a3440");
  return muralUrl = c.toDataURL();
}
/** The Winter hall, behind the open door: the mural, the scratched hinges, and Runa's word on them. */
function openWinterHall() {
  sfx.tick();
  $("snowTitle").textContent = tr("The Winter hall");
  $("snowSub").textContent = tr("Behind the ice door: a long, low hall of old stone, warm as a held breath. Nobody's here. Everything is swept.");
  $("snowList").innerHTML = `<img class="hall-mural" src="${muralArt()}" alt="${tr("An old mural: light spreading from the grotto along four roads, to four lands")}">`
    + `<p class="me-hint">${tr("On the far wall, an old mural: light spreading out from the grotto along four roads, to four lands. At the end of each road something small is kept, and glows.")}</p>`
    + `<p class="me-hint">${tr("On the door's hinges, old rust-red scratches. They stop exactly where the frost begins.")}</p>`
    + `<q class="folk-said">${tr("Something red came this far once. The cold stopped it.")}</q>`;
  show("snowSheet", true);
  if (!talkSeen("hallHinges")) setTimeout(() => talk("hallHinges"), 900);
}

// what's said in the snowfields, once each: Ember at the door, the door opening, the hall's hinges, the lullaby through the ice
Object.assign(TALKS, {
  emberDoor: () => [[EMBER, "So this is Runa's door. Stand back.", null, "focused"], [EMBER, "Not stone. Not mine.", null, "concern"],
    [RUNA, "Told you. It wants warmth, not hammers. Tea, maybe. Company.", null, "cheery"]],
  iceDoor: () => [[RUNA, "There. A hundred winters, and it opens for a bit of summer in a paw.", null, "glad"], [RUNA, "Come and look. Mind the step, it's older than the snow.", null, "cheery"]],
  hallHinges: () => [[RUNA, "Look at the hinges. Scratched, rust-red, right up to where the frost starts.", null, "wistful"], [RUNA, "Something red came this far once. The cold stopped it.", null, "wistful"]],
  lullaby: () => [[RUNA, "Shh. Hear that? Through the ice.", null, "wistful"], [MOSSA, "I know that song. I hummed it on my watch, the night the Heartlight went quiet.", null, "grief"],
    [MOSSA, "I didn't sleep alone that night. Someone sang.", null, "warm"]],
});
