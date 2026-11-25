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

/** Runa's buttons: fish, carve, the spring, and a frost geode to crack when there is one; while fishing, the rod's own. */
function snowActs() {
  const f = iceNow();
  if (f) {
    if (f.phase === "tired") return [["nest", tr("Home"), iceStop], ["steam", tr("Hot spring"), () => { const id = f.id; iceStop(); openSpring([id]); }]];
    const out = ["wait", "bite", "cast"].includes(f.phase);
    return [["rod", tr(out ? "Pull!" : "Cast"), out ? icePull : iceCast, f.phase === "bite" ? "bite" : ""], ["close", tr("Stop"), iceStop]];
  }
  const n = frostGeodes();
  return [["rod", tr("Fish"), startFishing], ["chisel", tr("Carving"), openCarving], ["steam", tr("Hot spring"), () => openSpring()],
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
  if (!inSnow()) { if (game.ice) game.ice = null; if (game.springTrip) game.springTrip = null; return []; }
  const items = [], S = snowSpots(), box = ([x, y]) => { const [u, v] = isoFrom(x, y); return { u0: u * ISO_G, u1: u * ISO_G, v0: v * ISO_G, v1: v * ISO_G }; };
  const f = iceNow();
  if (f && S.hole) { iceTick(f, S); const at = icePos(f, S); items.push({ y: at[1] + 0.5, after: f.phase === "walk" ? null : "pond", draw: () => drawIceHole(f, S), box: box(at) }); items.push({ y: 1e6, top: true, draw: () => drawIceOver(f, S) }); }
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
