"use strict";
// Hatchstone · the save, layout, quality settings and game state.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- save ----------

// Progress is precious: a main save, a "last good" copy, and care when several tabs are open.
const SAVE_KEY = STAGING ? "hatchstone.staging.save" : LIVE_SAVE_KEY, BAK_KEY = SAVE_KEY + ".bak";
const SAVE_VERSION = 2; // 2: beds decide who fits at home (see bedsSaveOf)
const DUST_MAX = 3; // dust bunnies on the nest floor at most (see gatherDust)
const freshSave = () => ({ v: SAVE_VERSION, rev: 0, shards: 30, stars: {}, creatures: [], active: null, seen: {}, geodes: {}, decor: {}, forge: {}, nextId: 1, rooms: [{ kind: "nest", on: [], beds: ["cot"] }, { kind: "yard", on: [] }], room: 0, bars: { firefly: 2, nut: 1 }, oil: { n: 5, t: 0 }, dust: [], dustT: 0 });
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
  return migrate(freshSave());
}

/**
 * The moon egg in the save: the day it was last opened and the nights kept, a count that only ever rises. An older save
 * kept a streak that began again after a day away: its nights start from the most that save can prove, so nobody steps back.
 */
function moonSaveOf(m, d) {
  const num = v => Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  const had = !!m && typeof m === "object" && !Array.isArray(m), aw = (d && d.awards) || {};
  // a glowling that remembers hatching from a moon egg is a night, too (the words adopt() leaves in its memory)
  const moonBorn = ((d && d.creatures) || []).filter(c => c && Array.isArray(c.mem) && c.mem.some(e => e && e.k === "Hatched from a moon egg 🌙")).length;
  // the streak as it stands, the longest one, an award for 7 or 3 nights or for the first, and one for a moon egg opened at all
  const nights = Math.max(had ? 1 : 0, had ? num(m.nights) : 0, had ? num(m.streak) : 0, num(d && d.counts && d.counts.moonBest), aw.streak7 ? 7 : aw.streak3 ? 3 : aw.moon1 ? 1 : 0, moonBorn);
  // (streak: the same number under its old name, for an older game that may still read this save: see finishMoon)
  return nights ? { last: had && typeof m.last === "string" ? m.last : "", nights, streak: nights } : null;
}

/** The star niches in the save: for each cave where a heart geode has been cracked, whether it was the first niche's and the second's.
 *  A save from before the niches has cracked none, so whichever its stars already reach are simply open. */
const cacheSaveOf = c => Object.fromEntries(Object.entries(c && typeof c === "object" && !Array.isArray(c) ? c : {}).filter(([k, v]) => /^\d$/.test(k) && Array.isArray(v)).map(([k, v]) => [k, [v[0] === true, v[1] === true]]));

/** How deep Wander has gone (see wanderDown): the step the next geode there is on, and the deepest step opened. A save from
 *  before the descent starts at the top, step 1, with nothing opened yet; the next step is never below one past the deepest. */
function depthSaveOf(o) {
  const num = (v, min) => Number.isFinite(v) && v >= min ? Math.floor(v) : min;
  const ok = !!o && typeof o === "object" && !Array.isArray(o), best = ok ? num(o.best, 0) : 0;
  return { at: Math.min(ok ? num(o.at, 1) : 1, best + 1), best };
}

/** The friend's charm hung on the nest's wall (see gifts.js), kept apart from the chest's list of charms so it stays when
 *  that list is trimmed: what kind, who it's from and when it came. Anything else there is dropped. */
const hungSaveOf = h => h && typeof h === "object" && !Array.isArray(h) && typeof h.c === "string" && /^[a-z]{1,16}$/.test(h.c)
  ? { c: h.c, from: typeof h.from === "string" ? [...h.from.replace(/[\u0000-\u001f\u007f]/g, "").trim()].slice(0, 24).join("") : "", at: Number.isFinite(h.at) ? h.at : 0 } : null;

/** The places a grown glowling can go out to help (see HELP_PLACES in nest.js), and how many helpers each takes at most. */
const HELP_KINDS = ["camp", "yard", "lab", "forge", "shop"], HELP_MAX = 2;
/**
 * The helpers in the save (#309): one out helping has cr.job = { place, since, met } and is out (cr.out, cr.roam), so it isn't
 * counted at home and needs nothing (the keeper looks after it). A job at no such place, or a third at one place, comes home;
 * a wish day (cr.wishDay, the day it last dreamed of the valley) is a whole number or nothing. A save from before has neither.
 */
function helpersSaveOf(creatures) {
  const at = {};
  for (const cr of creatures || []) {
    if (!cr || typeof cr !== "object") continue;
    if (cr.wishDay !== undefined && !Number.isInteger(cr.wishDay)) delete cr.wishDay;
    if (cr.job == null) { delete cr.job; continue; }
    const j = cr.job, place = j && typeof j === "object" ? j.place : null;
    if (HELP_KINDS.includes(place) && (at[place] || 0) < HELP_MAX) {
      at[place] = (at[place] || 0) + 1;
      cr.job = { place, since: Number.isFinite(j.since) ? j.since : Date.now(), met: j.met === true };
      cr.out = true; cr.roam = true; cr.trip = null; cr.sleeping = false;
    } else { delete cr.job; cr.out = false; cr.roam = false; }
  }
  return creatures;
}

/**
 * Beds (#310): each home room has a few bed spots, and its beds' places are how many live there (the shop builds and
 * upgrades them, see BED_TIERS in nest.js). A room keeps its beds in save.rooms[i].beds, one tier per spot. A room from
 * before beds gets, once, just enough to sleep everyone who lives there now, in whole beds (big ones first, the last spot
 * the smallest that still fits, so it rounds up only there), and a cot at least; whoever was already out exploring stays out, as before.
 */
const BED_PLACES = { cot: 1, bunk: 2, tree: 4 }, BED_SPOTS = 3, HOME_KINDS = ["nest", "play", "garden", "study"];
/** What each step of the old "room for one more" cost (NEST_UP_COST before beds): given back to a save that bought them. */
const NEST_UP_PAID = [150, 300, 500];
/** Beds that sleep n in BED_SPOTS spots (12 at most): nest-trees while four or more are left, then a bunk, a cot; the last spot the smallest that fits. */
function bedsFor(n) {
  const beds = [], tiers = Object.keys(BED_PLACES);
  for (let left = n; left > 0 && beds.length < BED_SPOTS;) {
    const t = beds.length === BED_SPOTS - 1 ? tiers.find(k => BED_PLACES[k] >= left) || "tree" : left >= BED_PLACES.tree ? "tree" : left >= BED_PLACES.bunk ? "bunk" : "cot";
    beds.push(t); left -= BED_PLACES[t];
  }
  return beds.length ? beds : ["cot"];
}
function bedsSaveOf(d) {
  const at = r => (d.creatures || []).filter(c => c && !c.out && (Number.isInteger(c.room) && HOME_KINDS.includes(d.rooms[c.room]?.kind) ? c.room : 0) === r).length;
  d.rooms.forEach((r, i) => {
    if (!HOME_KINDS.includes(r.kind)) { delete r.beds; return; }
    const had = Array.isArray(r.beds) ? r.beds.filter(t => BED_PLACES[t]).slice(0, BED_SPOTS) : null;
    r.beds = had ? (had.length ? had : ["cot"]) : bedsFor(at(i));
  });
  // the old "room for one more" is the beds' now: what it cost comes back, once, and Tansy says so (see roomCreatures)
  const back = NEST_UP_PAID.slice(0, Math.max(0, Math.floor(Number(d.nestUp)) || 0)).reduce((n, v) => n + v, 0);
  if (back) { d.shards = (Number(d.shards) || 0) + back; d.bedRefund = (d.bedRefund || 0) + back; }
  delete d.nestUp;
  return d.rooms;
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
  // every glowling has a habit of its own (see HABITS): one from before them gets its own quietly, the same each time
  for (const cr of d.creatures || []) if (!HABIT[cr.habit]) cr.habit = seededHabit(cr.id);
  if (!Array.isArray(d.rooms) || !d.rooms.length) { d.rooms = [{ kind: "nest", on: [] }]; d.room = 0; }
  if (!(d.room >= 0 && d.room < d.rooms.length)) d.room = 0;
  // everyone has a way outside, to the garden
  if (!d.rooms.some(r => r.kind === "yard")) d.rooms.push({ kind: "yard", on: [] });
  // a moss garden built before its glowcaps were found had no backdrop of its own: it's their grotto now (the room you're in
  // keeps its backdrop in d.theme, the others in their own entry)
  d.rooms.forEach((r, i) => { if (r.kind !== "garden") return; if (i === d.room) d.theme = d.theme || "glowcap"; else r.theme = r.theme || "glowcap"; });
  if (!d.bars) d.bars = { firefly: 2, nut: 1 };
  if (!d.oil || !Number.isFinite(d.oil.n)) d.oil = { n: 5, t: 0 };
  // dust bunnies used to belong to each glowling and showed up in every room: now they're the nest's own, three at most
  const dust = [d.dust, ...(d.creatures || []).map(c => c.dust)].flatMap(a => Array.isArray(a) ? a : []);
  d.dust = dust.filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)).slice(0, DUST_MAX);
  for (const cr of d.creatures || []) delete cr.dust;
  // the three geodes to choose from are gone: a replay hands you its geode like a first visit
  delete d.offers;
  if (!Number.isFinite(d.dustT)) d.dustT = 0;
  // sparks of inspiration from exploring (see sparks.js): found ones, Pip's news, the scarf dye
  d.sparks = sparkSaveOf(d.sparks);
  // how you grow as a keeper (see inner.js): the habits' day, and an older save's core and Granite Fist turned into
  // keeper XP, gifts and Strength, once
  keeperMigrate(d);
  // Quarry Eye used to light the weak spot up for good; now it pings when you choose (see eyePing). Once, for a save from
  // before: a keeper who had the whole eye keeps one more ping on every geode as thanks, and anyone who had it hears
  // what changed when they next crack an egg
  if (!d.eyePings) {
    const eye = Math.floor(Number(d.forge.eye)) || 0;
    if (eye >= 3) d.eyeThanks = true;
    if (eye > 0) d.eyeNote = true;
    d.eyePings = true;
  }
  // the moon egg: nights kept, where there was a streak
  const moon = moonSaveOf(d.moon, d);
  if (moon) d.moon = moon; else delete d.moon;
  // walks outside (see walk.js): how far the paths are open, the best hauls, the keepsakes
  d.walks = walkSaveOf(d.walks);
  // a nest that already brought keepsakes home gets the jar they go into, waiting in the chest
  if (Object.keys(d.walks.found).length && !d.decor.keepjar) d.decor.keepjar = { on: false, at: Date.now() };
  // things made from keepsakes remember the ones they were made of (see KEEP_WEAR); one that lost them goes back to the plainest
  if (d.wardrobe && typeof d.wardrobe === "object") for (const t of KEEP_WEAR) {
    const o = d.wardrobe[t.id];
    if (o && !(o.ks && Array.isArray(o.ks) && o.ks.length && o.ks.every(k => KS[k] && KS[k].kind === t.kind))) d.wardrobe[t.id] = { ks: [t.kind === "feather" ? "jay" : "daisy"], at: Date.now() };
  }
  // the diary keeps a glowling's first stroke and first game from now on (see rememberFirst): older ones' were long ago
  if (!Number.isFinite(d.diaryFrom)) d.diaryFrom = Date.now();
  // the postcard's border of pressed flowers and feathers: on unless you've turned it off
  if (typeof d.cardBorder !== "boolean") d.cardBorder = true;
  // wardstones (see wards.js): the ones in hand and the ones set on the map
  d.wards = wardSaveOf(d.wards);
  // star niches (see scenes.js): which heart geodes have been cracked
  d.caches = cacheSaveOf(d.caches);
  // how deep Wander has gone (see depthSaveOf): a save from before starts at the top
  d.depth = depthSaveOf(d.depth);
  // a friend's charm on the wall, if one hangs there
  const hung = hungSaveOf(d.hung);
  if (hung) d.hung = hung; else delete d.hung;
  // grown glowlings out helping in the valley's places (see helpersSaveOf)
  helpersSaveOf(d.creatures);
  // beds: who fits at home (see bedsSaveOf), after the helpers, who are out and need none
  bedsSaveOf(d);
  // rooms used to be seen either from the corner or from the front: now always from the corner, so the choice goes
  delete d.view;
  d.v = SAVE_VERSION;
  return d;
}

const save = loadSave();
habitLastSeen = save.habit.seen; // when this nest was last open: a night or a day or more ago, and Mossa says welcome back
let lastBak = 0, saveWarned = false;

function persist() {
  // another tab saved newer progress: take theirs instead of overwriting it
  try {
    const theirs = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    // (and a page that opened with no nest must never overwrite one that appeared since, e.g. in another tab)
    if (theirs && validSave(theirs) && ((theirs.rev || 0) > save.rev || (startedEmpty && !save.rev && theirs.creatures.length))) { adoptSave(theirs); return; }
  } catch {}
  save.rev = (save.rev || 0) + 1;
  if (!document.hidden) save.habit.seen = habitSeenNow();
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

// Away for a night or more (six hours), and nobody comes home to hungry, lonely or worn-out little ones: Mossa looked in.
// Six hours is about where time alone has emptied every need anyway, and a night's sleep or a working day is longer: so
// the keeper who comes back every morning or evening finds the nest as cared for as one who was gone for a week. Under
// six hours the needs drift down as ever: that's a short break, and looking after them yourself is the game.
// She leaves every need at three icons of four at least (what is higher stays): well clear of what makes a glowling call
// or look sad (tummy and joy under 25, energy under 20), enough for a happy face (joy over 70, tummy over 50), and not
// full, so there's still something kind to do.
const AWAY_MIN = 6 * 60, KEPT = 75;
const KEPT_QUIET = 60e3; // and for the first minute home nobody calls for anything: the welcome comes first
/** Just home to a glowling Mossa looked in on: it's glad, and asks for nothing yet. */
const keptQuiet = (cr, now = Date.now()) => cr.keptAt > 0 && Math.abs(now - cr.keptAt) < KEPT_QUIET;
/** That first minute home: the dots that ask for something (the valley's, the day's tasks') wait as well. */
const homeQuiet = () => save.creatures.some(cr => keptQuiet(cr));

/** Real time passes in the nest too, gently: needs drift down, sleep refills energy. */
/**
 * What a room at home gives whoever lives in it, gently (#254): the playroom keeps boredom off a little, the moss garden's
 * beds make sleep deeper, the crystal study teaches a little while awake (an xp every STUDY_MIN minutes). Room space keeps
 * anyone from piling everyone into one.
 */
const ROOM_TRAITS = { play: { joy: 0.65 }, garden: { rest: 1.35 }, study: { learn: true } };
const STUDY_MIN = 30, HELP_GROW_MIN = 30;
const roomTrait = cr => ROOM_TRAITS[save.rooms[roomOf(cr)]?.kind] || {};
/**
 * Less to keep up with in a full nest (#319): the one you're looking after needs you as ever, everyone else's needs drift
 * down at IDLE_PACE of that (sleep refills just the same). And a little one living in a room with a grown glowling (see
 * HELP_STAGE) gets hungry and bored a little slower still, CARE_SLOW of the pace: the big one keeps it company, finds it
 * a berry now and then (see careFor in nest.js), even while you're away.
 */
const IDLE_PACE = 0.6, CARE_SLOW = 0.8;
/** Is this the glowling you're looking after (the first one, when you haven't picked)? */
const looked = cr => cr.id === (save.active ?? (save.creatures || [])[0]?.id);
/** A little one with a grown glowling at home in its room. */
const tended = cr => (save.creatures || []).some(g => g !== cr && !g.out && roomOf(g) === roomOf(cr) && stageOf(g.level || 1) >= HELP_STAGE) && stageOf(cr.level || 1) < HELP_STAGE;
function applyTime(cr, now = Date.now()) {
  const min = clamp((now - (cr.last || now)) / 60000, 0, AWAY_MIN);
  cr.last = now;
  if (min <= 0) return;
  // out exploring: having a lovely time, needing nothing; helping in the valley, it grows a little all the while
  if (cr.out) {
    if (cr.job) { cr.jobT = (cr.jobT || 0) + min; const n = Math.floor(cr.jobT / HELP_GROW_MIN); if (n) { cr.jobT -= n * HELP_GROW_MIN; addXP(cr, n); } }
    return;
  }
  const trait = roomTrait(cr), pace = looked(cr) ? 1 : IDLE_PACE, kept = pace * (tended(cr) ? CARE_SLOW : 1);
  if (cr.sleeping) {
    cr.energy = clamp(cr.energy + min * 12 * (trait.rest || 1), 0, 100);
    cr.tummy = clamp(cr.tummy - min * 0.25 * kept, 0, 100);
  } else {
    // awake time makes a little mess (gatherDust turns it into dust bunnies in the nest), and an untidy nest wears
    // joy down a little faster for those who live in it
    const dust = roomOf(cr) === nestRoom() ? (save.dust || []).length : 0;
    cr.tummy = clamp(cr.tummy - min * 0.5 * kept, 0, 100);
    cr.joy = clamp(cr.joy - min * (0.4 + dust * 0.15) * (trait.joy || 1) * kept, 0, 100);
    cr.energy = clamp(cr.energy - min * 0.25 * pace, 0, 100);
    cr.messT = (cr.messT || 0) + min;
    if (trait.learn) { cr.studyT = (cr.studyT || 0) + min; const n = Math.floor(cr.studyT / STUDY_MIN); if (n) { cr.studyT -= n * STUDY_MIN; addXP(cr, n); } }
  }
  // six hours or more: Mossa looked in (see KEPT), and her visit leaves no mess behind
  if (min >= AWAY_MIN) {
    for (const k of ["tummy", "joy", "energy"]) cr[k] = Math.max(cr[k], KEPT);
    cr.messT = 0;
    cr.keptAt = now;
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
// 6. Home after six hours or more, Mossa has swept too (see KEPT): all but one bunny, and one alone makes nobody call.
const MESS_MIN = 45;
const nestRoom = () => save.rooms.findIndex(r => r.kind === "nest");

/** Catch up everyone's time and wind the dust clock: returns the bunny that just landed, if one did. */
function gatherDust() {
  for (const cr of save.creatures) applyTime(cr);
  const n = Math.max(1, save.creatures.length), nest = nestRoom(), dust = save.dust = save.dust || [];
  for (const cr of save.creatures) if (cr.messT) { save.dustT = (save.dustT || 0) + cr.messT / n; cr.messT = 0; }
  if (homeQuiet()) { dust.length = Math.min(dust.length, 1); save.dustT = 0; }
  let d = null;
  if (nest >= 0 && dust.length < DUST_MAX && save.dustT >= MESS_MIN && !residents(nest).some(c => c.sleeping)) {
    dust.push(d = [Math.round(Math.random() * 100) / 100, Math.round(Math.random() * 100) / 100]);
    save.dustT -= MESS_MIN;
  }
  if (dust.length >= DUST_MAX) save.dustT = Math.min(save.dustT, MESS_MIN / 2);
  return d;
}

/** Home after a while (see habitMoments): everyone's time is caught up, and if Mossa looked in while you were away
 *  (since: a moment the nest was already closed), the quiet minute starts now, when you're really here. Returns whether she did. */
function comeHome(since, now = Date.now()) {
  for (const cr of save.creatures) applyTime(cr, now);
  const kept = save.creatures.filter(cr => cr.keptAt > since);
  if (!kept.length) return false;
  for (const cr of kept) cr.keptAt = now;
  gatherDust(); // (she swept too)
  return true;
}

/** What a glowling is calling you for, if anything: gently, the way a Tamagotchi beeps. */
function callOf(cr, now = Date.now()) {
  if (cr.sleeping || cr.out || keptQuiet(cr, now)) return "";
  if (cr.tummy < 25) return "hungry";
  if (cr.energy < 20) return "sleepy";
  if ((save.dust || []).length >= 2 && roomOf(cr) === nestRoom()) return "messy";
  if (cr.joy < 25) return "lonely";
  return "";
}

/** The mark on the tabs: a soft gold sparkle on the valley when something new waits there. */
function updateCalls() {
  // (no mark on the Nest tab for needs any more: a chore left undone isn't news; the glowling's own call says it, at home)
  checkPlaces();
  // the valley's soft gold sparkle is only for something new there: a place just opened, something ripe, an egg that has
  // hatched in the incubator (not today's moon egg or a Forge you could afford: those wait without nagging).
  // (the first minute home after Mossa looked in, it waits too)
  $("worldTab")?.classList.toggle("fresh", !homeQuiet() && ((placeOk("garden") && ripePlots() > 0) || (save.mapFresh || []).length > 0 || (!!save.incubator && Date.now() >= save.incubator.due && !incHere())));
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
    if (!music.sting("level")) sfx.levelUp(); // a phrase in the song's key, or the old run of bells with the music off
    const a = actors.get(cr.id);
    if (game.scene === "nest" && a) { const v = actorView(a); burst(v.x, v.y, grew ? 40 : 18, ["#fff", ...palOf(specOf(cr))], grew ? 1.6 : 1); }
  }
  if (cr.level >= MAX_LEVEL) cr.xp = 0;
}

// ---------- glowling fancies: now and then a content glowling daydreams of something particular ----------
// (in the code a glowling's wish is a "fancy": "wish" already belongs to the keepers and their errands, see nest.js)

/** The little pictures in the daydream bubbles (the rest are icons the game already has). */
Object.assign(PX_ICON_MAPS, {
  fRain: ["............", "....sss.....", "..sssssssss.", ".sWsssssssss", ".sssssssssss", "..SSSSSSSSS.", "............", "............", "............", "..t...t...t.", "..T...T...T.", "............"],
  fSnow: ["............", "....sss.....", "..sssssssss.", ".sWsssssssss", ".sssssssssss", "..SSSSSSSSS.", "............", "............", "..W.......W.", "......W.....", "..........W.", "..W........."],
  fDrop: ["............", ".....t......", ".....t......", "....tTt.....", "....tTt.....", "...tWTTt....", "...tWTTt....", "...tTTTt....", "....ttt.....", "............", ".tt......tt.", "...tttttt..."],
  fNote: ["............", "....pppppp..", "....plllpp..", "....p....p..", "....p....p..", "....p....p..", "....p....p..", "..ppp..ppp..", ".plpp.plpp..", ".ppp..ppp...", "............", "............"],
  fShroom: ["............", "....rrrr....", "..rrRRRRrr..", ".rRRWRRRRRr.", ".rRRRRRWWRr.", ".rRWRRRWWRr.", "..rrrrrrrr..", "....wwww....", "....wssw....", "....wssw....", "...wwwwww...", "............"],
  fSwing: [".bbbbbbbbbb.", ".b.z....z.b.", ".b.z....z.b.", ".b.z....z.b.", ".b.z....z.b.", ".b.GGGGGG.b.", ".b..gggg..b.", ".b........b.", ".b........b.", "bb........bb", "............", "............"],
  fFrame: ["............", ".oooooooooo.", ".oddddddddo.", ".odddddGGdo.", ".odddddGGdo.", ".oddddddddo.", ".oddmdddddo.", ".odmmmdmmdo.", ".ommmmmmmmo.", ".oooooooooo.", "............", "............"],
  fLights: ["............", "............", "z..........z", ".zz......zz.", ".g.zzzzzz.r.", "gGg..t...rRr", "gWg.tTt..rWr", ".g..tWt...r.", ".....t......", "............", "............", "............"],
});
/** How long a daydream stays up (seconds of looking at the nest), what it gives when it comes true, and how long until the first and the next one. */
const FANCY_LIFE = 100, FANCY_JOY = 20, FANCY_XP = 20, FANCY_FIRST = [70, 120], FANCY_GAP = [240, 420];
/** Can this piece be tapped in the room you're looking at? (The cloud floats by itself: see the two showers below.) */
const fancyPiece = id => !!hasDecor(id) && (!!isoLayout().placed[id] || !!DECO[id].wall || id === "lights");
/**
 * What each kind daydreams of: the picture in its bubble, the line it says when tapped, the diary line, whether it can come
 * true here and now, and what makes it come true (by: a tap on a piece, a shower from the cloud, a finished game or walk).
 */
const FANCIES = [
  { id: "rain", kinds: ["swim"], icon: "fRain", dream: "{0} is dreaming of rain", mem: "Wished for rain and got it", by: ["weather:rain"], can: () => !!hasDecor("cushion") },
  { id: "splash", kinds: ["swim"], icon: "fDrop", dream: "{0} is dreaming of a splash in the water", mem: "Wished for a splash and got one", by: ["tap:spring", "tap:birdbath"], can: () => fancyPiece("spring") || fancyPiece("birdbath") },
  { id: "song", kinds: ["dance"], icon: "fNote", dream: "{0} is dreaming of a song", mem: "Wished for a song and got one", by: ["song", "tap:drum"], can: () => true },
  { id: "walk", kinds: ["curious"], icon: "walk", dream: "{0} is dreaming of a walk", mem: "Wished for a walk and got one", by: ["walk"], can: () => true },
  { id: "picture", kinds: ["curious"], icon: "fFrame", dream: "{0} is dreaming of a new picture on the wall", mem: "Wished for a new picture and got one", by: ["tap:painting"], can: () => fancyPiece("painting") },
  { id: "stars", kinds: ["curious"], icon: "star", dream: "{0} is dreaming of a look at the stars", mem: "Wished for a look at the stars and got one", by: ["tap:telescope"], can: () => fancyPiece("telescope") },
  { id: "swing", kinds: ["nap"], icon: "fSwing", dream: "{0} is dreaming of a push on the swing", mem: "Wished for a push on the swing and got one", by: ["tap:swing"], can: () => fancyPiece("swing") },
  { id: "dark", kinds: ["nap"], icon: "moon", dream: "{0} is dreaming of the lamp turned off", mem: "Wished for the lamp turned off, and it was", by: ["lamp:off"], can: () => fancyPiece("lamp") && !save.decor.lamp.off },
  { id: "catch", kinds: ["hop"], icon: "sparkle", dream: "{0} is dreaming of catching sparkles", mem: "Wished to catch sparkles, and did", by: ["catch"], can: () => true },
  { id: "bounce", kinds: ["hop"], icon: "fShroom", dream: "{0} is dreaming of a bounce on the mushrooms", mem: "Wished for a bounce on the mushrooms and got one", by: ["tap:mushrooms"], can: () => fancyPiece("mushrooms") },
  { id: "twinkle", kinds: ["flutter"], icon: "fLights", dream: "{0} is dreaming of twinkling lights", mem: "Wished for twinkling lights and got them", by: ["tap:lights", "tap:lamppost"], can: () => fancyPiece("lights") || fancyPiece("lamppost") },
  { id: "snow", kinds: ["flutter"], icon: "fSnow", dream: "{0} is dreaming of snow", mem: "Wished for snow and got it", by: ["weather:snow"], can: () => !!hasDecor("cushion") },
];
/** The one daydream in the nest (there is never a second): whose, of what, how long it has been up. Kept in memory only, so one that fades leaves nothing behind. */
const fancy = { on: null, wait: rand(...FANCY_FIRST), acc: 0, last: "" };
/** What this glowling is daydreaming of right now, if anything. */
const fancyOf = id => fancy.on && fancy.on.id === id ? FANCIES.find(f => f.id === fancy.on.what) : null;
/** Who may daydream: awake, at home, fed and wanting nothing (see content). */
const fancyFit = cr => !cr.sleeping && !cr.out && !cr.trip && content(cr);
/** What this glowling could daydream of here and now: only what can really come true. */
const fanciesFor = cr => fancyFit(cr) ? FANCIES.filter(f => f.kinds.includes(kindOf(cr)) && f.can(cr)) : [];
/** A nest old enough for daydreams: you've stroked a glowling, and at least two live here. */
const fancyReady = () => tipDone("pet") && save.creatures.length >= 2;
/** Not a moment for daydreams: you're not in a room of the nest, someone is talking, a window is open, the Gloom is visiting, a friend shares an egg, the furniture is being moved. */
const fancyBusy = () => game.scene !== "nest" || isPlace() || arrange.on || gloomNow.on || !!talkNow || talkQueue.length > 0 || !!coopSession || $$(".overlay").some(o => !o.classList.contains("hidden"));
/** Is the daydream about this very thing, and its glowling in the room you're looking at? */
const fancyHere = what => { const w = fancy.on, cr = w && w.what === what && save.creatures.find(c => c.id === w.id); return !!cr && !cr.out && roomOf(cr) === save.room; };
/** The daydream is over (it came true, or it just faded): the next one is a good few minutes away. */
function fancyFade() { fancy.on = null; fancy.wait = rand(...FANCY_GAP); }
/** Every frame the nest is on screen: a daydream fades when its time is up, and now and then a content glowling in this room starts one. */
function fancyTick(dt) {
  if ((fancy.acc += dt) < 0.5) return;
  const step = fancy.acc, w = fancy.on; fancy.acc = 0;
  // (time stands still while something else is going on; but when the Gloom comes, nobody is daydreaming any more)
  if (fancyBusy()) { if (w && gloomNow.on) fancyFade(); return; }
  if (w) {
    // it fades by itself after a while, or sooner if its glowling now needs something or the thing is gone: no counter, nothing lost
    const cr = save.creatures.find(c => c.id === w.id);
    if (!cr || !fancyFit(cr) || (roomOf(cr) === save.room && !fancyOf(cr.id).can(cr)) || (w.t += step) >= FANCY_LIFE) fancyFade();
    return;
  }
  if (!fancyReady() || (fancy.wait -= step) > 0) return;
  const who = residents(save.room).filter(c => fanciesFor(c).length && !["nap", "sleep", "toBed"].includes(actors.get(c.id)?.state));
  if (!who.length) { fancy.wait = 20; return; }
  const cr = pick(who), all = fanciesFor(cr), fresh = all.filter(f => f.id !== fancy.last);
  fancy.on = { id: cr.id, what: fancy.last = pick(fresh.length ? fresh : all).id, t: 0 };
  // (it wonders about it first, with a curious face)
  const a = actors.get(cr.id);
  if (a && !a.emote) emote(a, kaoFor(cr, "curious"), 1.6);
}
/**
 * Something just happened that a daydream may have been about (a piece tapped, a shower, a song, a game, a walk). If it was,
 * the wish comes true, once: joy, a good bite of XP and a line in the diary. `who` took part (a game, a walk); without it,
 * it happened in the room you're looking at. Gives back the glowling whose wish it was, or null.
 */
function fancyDone(what, who) {
  const w = fancy.on, f = w && FANCIES.find(x => x.id === w.what), cr = f && f.by.includes(what) && save.creatures.find(c => c.id === w.id);
  if (!cr || (who ? !who.includes(cr.id) : !fancyHere(f.id))) return null;
  fancyFade();
  cr.joy = clamp(cr.joy + FANCY_JOY, 0, 100);
  addXP(cr, FANCY_XP);
  remember(cr, f.mem);
  persist();
  toast(tr("{0}: a wish come true ✦", cr.name));
  const a = actors.get(cr.id);
  if (game.scene === "nest" && a) {
    const v = actorView(a);
    a.hop = 1; emote(a, "♥", 2.4); sfx.chirp(specOf(cr).voice);
    burst(v.x, v.y - v.size * 0.5, 14, ["#ffffff", "#fff0b5", "#ffc4da"], 0.8);
    for (let i = 0; i < 3; i++) heart(v.x + rand(-14, 14), v.y - v.size * 0.4);
    renderNest();
  }
  return cr;
}
/** Tapped while it daydreams (the glowling or its bubble): one line about what it's dreaming of. */
function fancyTell(id = fancy.on?.id) {
  const f = fancyOf(id), cr = f && save.creatures.find(c => c.id === id);
  if (cr) toast(tr(f.dream, cr.name));
  return !!cr;
}
/** Is the finger on the daydream's bubble (where it was last drawn)? */
const fancyAt = (x, y) => { const p = fancy.on?.at; return !!p && game.scene === "nest" && game.time - p.t < 200 && Math.hypot(x - p.x, y - p.y) < p.r; };

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
  const nTop = compact ? 98 : 116, nBottom = H - (compact ? 206 : 280);
  N.top = nTop;
  N.base = clamp(Math.min(W * 0.18, (nBottom - nTop) * 0.28), 56, 120);
  // the room: a diamond of floor with two walls behind it, like a little diorama
  N.cx = W / 2;
  const room = nBottom - nTop;
  N.isoW = Math.min(W * 0.47, 400, room * 0.9); N.isoH = N.isoW / 2;
  // taller walls on tall screens (more wall for the window, shelf and painting); any space left over goes above and below evenly,
  // but on a phone held upright most of it goes above: the room sits low, near the needs, and the cave floor runs on down behind them
  N.isoWall = clamp(room - N.isoW - 4, N.base * 1.2, N.isoW * 1.25);
  N.isoTop = nBottom - N.isoW - 6 - Math.max(0, room - N.isoW - 4 - N.isoWall) / (H > W ? 4 : 2);
  N.y0 = N.isoTop; N.y1 = N.isoTop + N.isoW;
  N.wallTop = N.isoTop - N.isoWall;
  N.back = N.isoTop + N.isoH; N.front = N.y1 + 10;
  N.x0 = N.cx - N.isoW; N.x1 = N.cx + N.isoW;
  N.dk = W < 520 ? 0.8 : 0.92; // decorations a touch smaller on a phone, so the room doesn't feel stuffed
  [N.bedX, N.bedY] = roomSpot("bed");
}

/** Isometric floor coordinates: u runs from the back corner to the right corner, v from the back corner to the left one. */
const isoAt = (u, v) => [N.cx + (u - v) * N.isoW, N.isoTop + (u + v) * N.isoH];
const isoFrom = (x, y) => { const a = (x - N.cx) / N.isoW, b = (y - N.isoTop) / N.isoH; return [(a + b) / 2, (b - a) / 2]; };
/** The top of the back walls above a point (they meet at the back corner). */
const isoWallTop = x => N.isoTop + Math.min(1, Math.abs(x - N.cx) / N.isoW) * N.isoH - N.isoWall;
const isoMargin = k => k * N.base / (1.118 * N.isoW);

/** A point on the floor, a little in from the walls: u along the right wall (0 at the back corner, 1 at the right one), v along the left. */
function floorAt(u, v) { const m = isoMargin(0.5); return isoAt(lerp(m, 1 - m, u), lerp(m, 1 - m, v)); }

// where each piece stands when nothing else says: [u, v] on the diamond. The left wall has the window with the cloud under it,
// the lamp in the back corner and the incubator; the right wall has the shelf, the spring and the swing, the bed in its corner;
// mushrooms in front
const ROOM_SLOTS_ISO = { lamp: [0.06, 0.08], cushion: [0.05, 0.5], incubator: [0.1, 0.86], spring: [0.36, 0.06], bed: [0.9, 0.1], mushrooms: [0.92, 0.9], rug: [0.5, 0.5] };
function roomSpot(id) {
  if (id === "cushion") { const [u, v] = cloudUV(); return isoAt(u, v); }
  if (isoLayout().placed[id]) { const p = isoLayout().placed[id]; return isoPieceAt(p, id === "bed" || id === "incubator" ? 0 : 0.55); }
  if (id === "shelf") { const m = wallSlot("shelf"), [x, y] = wallFoot(m.wall, m.s); return [x, y - N.isoWall * 0.5 + N.base * 0.95 * N.dk]; }
  if (id === "swing") { const [x, y] = floorAt(0.42, 0.04); return [x, y + N.base * 0.55]; }
  if (id === "lights") return [N.cx, N.wallTop];
  if (id === "rug" && save.layout && save.layout.rug) return isoAt(save.layout.rug.u, save.layout.rug.v);
  const [u, v] = ROOM_SLOTS_ISO[id] || [0.5, 0.5];
  return floorAt(u, v);
}
/** The rug's half width and half depth on the floor. */
const rugSize = () => [N.isoW * 0.36, N.isoW * 0.18];

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
  // a phone browser's own bar can lie over the bottom of the page (Chrome on iPhone): the part of the page it hides goes to
  // --vv-bottom, so everything pinned to the bottom stands clear of it (see --bottom in style.css)
  const vv = window.visualViewport;
  if (vv) document.documentElement.style.setProperty("--vv-bottom", Math.max(0, Math.round(H - vv.height - vv.offsetTop)) + "px");
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
  chips: [], sparks: [], pieces: [], glints: [], trail: [], hearts: [], swings: [], floaters: [], ripples: [], pops: [], gems: [], ping: null, shake: 0, freeze: 0,
  nest: { snack: null, pets: {}, petting: false, call: null, glad: false },
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

/** Which backdrop shows now: the chapter's own cave while cracking (a heart geode's too), moonlight for moon eggs, your pick elsewhere. */
function currentTheme() {
  const c = game.scene === "crack" && game.egg && game.egg.conf;
  if (c) return c.moon ? "churchyard" : c.wander && !c.heart ? "labradorite" : CAVE_THEME[c.cave] || "amethyst";
  return roomTheme(save.room, save.theme);
}
/** The backdrop room i shows for the one picked for it: a pick that doesn't suit the room (a cave saved in the garden outside)
 *  or isn't found yet is kept in the save but not shown, and the room shows its own instead. */
function roomTheme(i, id) {
  const fits = roomThemes(i), own = ownTheme(i);
  return THEME[id] && (THEME[id].ok() || isPlace(i) || id === own) && fits.includes(id) ? id : own;
}
/** A room's own backdrop, there even before it's found: the moss garden's glowcap grotto, the study's blue cave, else the first that suits. */
function ownTheme(i = save.room) {
  const kind = save.rooms && save.rooms[i] && ROOM_KINDS.find(k => k.id === save.rooms[i].kind), fits = roomThemes(i);
  return kind && !kind.place && fits.includes(kind.theme) ? kind.theme : fits[0];
}
/** Which backdrops suit the room you're in: outside is always under the sky; every other room takes any, at home each
 *  one a mood of the cave (HOME_ART: a meadow or a hall is drawn as a grotto, a gallery, a crypt...), in the valley as it always was. */
function roomThemes(i = save.room) {
  const kind = save.rooms && save.rooms[i] && save.rooms[i].kind, k = id => ROOM_KIND[id] || "cave", ids = THEMES.map(t => t.id);
  return kind === "yard" ? ids.filter(id => k(id) === "wood" || k(id) === "yard") : ids;
}
/** Is room i one of the caves at home (not the garden outside, nor a place in the valley)? */
const atHome = (i = save.room) => !!(save.rooms && save.rooms[i]) && !isPlace(i);
/** What sort of place a backdrop makes of room i: at home every one is a cave (of its own mood), elsewhere a hall, a ruin, a wood or a yard as it always was. */
const lookOf = (id, i = save.room) => atHome(i) ? "cave" : ROOM_KIND[id] || "cave";

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
const skyHere = () => game.scene === "nest" && ["yard", "wood", "ruin"].includes(lookOf(currentTheme()));
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
  // in the nest the land goes on around the room: outdoors the horizon lies behind the room, so the clearing is part of the
  // meadow and the hills, trees and mushrooms stand beyond it; a cave room stands on a rock shelf on the cave floor, crystals around it
  const home = scene === "nest" && atHome(), kind = scene === "nest" ? lookOf(id) : ROOM_KIND[id] || "cave", outdoor = kind === "yard" || kind === "wood";
  // (while cracking the cave floor meets the plinth's stage: see stageGeom)
  const floor = scene === "crack" && game.egg ? stageNow().horizon / H : scene !== "nest" || !N.back ? 0.86 : outdoor ? (N.isoTop - N.isoWall * 0.35) / H : (kind === "cave" ? N.front : N.back + 1) / H;
  // in the nest and on the title the cave floor runs on down behind the needs and the tabs, and under the title card (no dark band there)
  const deep = scene === "nest" || scene === "menu";
  // the shop looks out on the river from its open front (#278): a backdrop of its own, level with its counter
  const shop = scene === "nest" && save.rooms?.[save.room]?.kind === "shop" && kind === "timber" ? shopRiverY() : null;
  // the garden and the camp sit in their meadow (#277): the ground round the plot is laid to meet it, its path going on out
  const site = scene === "nest" && outdoor && !home && N.isoW ? { cx: N.cx / PX, top: N.isoTop / PX, hw: N.isoW / PX, kind: save.rooms?.[save.room]?.kind } : null;
  const key = `${id}|${floor.toFixed(3)}|${deep}|${home}` + (shop === null ? "" : `|shop${shop}`) + (site ? `|site:${site.kind}:${[site.cx, site.top, site.hw].map(v => v.toFixed(1))}` : "");
  if (!bgCache.has(key)) bgCache.set(key, shop === null ? paintTheme(id, Math.ceil(W / PX), Math.ceil(H / PX), floor, deep, home, site) : paintShopBackdrop(Math.ceil(W / PX), Math.ceil(H / PX), floor, shop, Math.max(0.55, N.isoW / PX / 180)));
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
