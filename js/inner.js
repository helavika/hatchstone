"use strict";
// Hatchstone · the keeper's core: a small light inside a stone, on the Keeper page, that grows as you hold on.
// It grows when you come back after a pause, when you go back to the stone after one that didn't open, when you stand up
// for the little ones, and with one small ritual a day. Small steps each, and it never shrinks: being away costs nothing.
// Rest (sleep, the garden's harvest, the music box) doesn't grow it, but it glows when you've rested: rest is part of the fight.
// Four facets, each with a quiet word from a friend and something modest to keep.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- the rules: how much each thing grows it, and the facets ----------

const CORE_GAIN = { back: 3, retry: 2, rescued: 4, lamplit: 2, ritual: 1 };
// at most once a day each (a freed seal is rare enough on its own: there are only four)
const CORE_DAILY = ["back", "retry", "lamplit", "ritual"];
const CORE_PAUSE = 24 * 3600e3;       // a pause that counts: a day or more
const CORE_REST = 12 * 3600e3;        // how long the resting glow lasts
const CORE_SEED_MAX = 30;             // an older nest starts part-way, never at the last facet
/** Each facet: how much light it takes, its name, and what it gives (gift: what the rest of the game asks for). */
const CORE_FACETS = [
  { at: 5, name: "It holds", gift: "lantern", what: "A little lantern hangs by every egg you crack" },
  { at: 12, name: "Steadier", gift: "oil", what: "Ember deepened your lantern: it holds one more drop of oil" },
  { at: 24, name: "Steady heart", gift: "title", what: "A keeper title from Mossa: Steady heart" },
  { at: 40, name: "Unbroken", gift: "shine", what: "Your light pushes the Gloom's shadows back faster" },
];
/** What the core looks like at each number of facets lit: a phrase, never a number. */
const CORE_STAGES = [
  "A small warm spark, deep in the stone.",
  "One facet lit. It holds.",
  "Two facets. Steadier than before.",
  "Three facets. The cold can't get in so easily.",
  "Whole and bright. Not because nothing hurts: because you hold.",
];

/** The local day of a moment, like dayKey (that one lives with the moon egg, later on). */
const coreDay = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
/** How many facets are lit. */
const coreFacet = n => CORE_FACETS.filter(f => n >= f.at).length;
/** How far into the next facet (0..1), for drawing it filling from the bottom; 1 once all are lit. */
function coreFill(n) {
  const i = coreFacet(n);
  if (i >= CORE_FACETS.length) return 1;
  const from = i ? CORE_FACETS[i - 1].at : 0;
  return Math.max(0, Math.min(1, (n - from) / (CORE_FACETS[i].at - from)));
}
/** Grow the core for something you did: returns how much it grew (0 if that kind has had its turn today). Never shrinks. */
function coreGrow(c, kind, now = Date.now()) {
  const gain = CORE_GAIN[kind];
  if (!gain) return 0;
  if (CORE_DAILY.includes(kind)) {
    const day = coreDay(now);
    if (c.day[kind] === day) return 0;
    c.day = { ...c.day, [kind]: day };
  }
  c.n += gain;
  return gain;
}
/** Back after a pause of a day or more (seen: when the nest was last open)? Grows the core once that day. */
const coreBack = (c, seen, now = Date.now()) => seen > 0 && now - seen >= CORE_PAUSE ? coreGrow(c, "back", now) : 0;
/** Rested lately: the core glows softly for a while after sleep, a harvest or music. */
const coreRested = (c, now = Date.now()) => c.rest > 0 && now - c.rest < CORE_REST;
/** What an older nest has already been through: freed seals, shadows pushed back, finished days, moon nights, weeks together. */
function coreSeed(d, now = Date.now()) {
  const k = id => { const v = d && d.counts && d.counts[id]; return Number.isFinite(v) && v > 0 ? v : 0; };
  const born = Math.min(now, ...((d && d.creatures) || []).map(c => c && Number.isFinite(c.born) ? c.born : now));
  const weeks = Math.floor((now - born) / (7 * 864e5));
  const moon = Math.max(k("moonBest"), Number.isFinite(d && d.moon && d.moon.streak) ? d.moon.streak : 0);
  return Math.min(CORE_SEED_MAX, k("rescued") * CORE_GAIN.rescued + Math.min(k("lamplit"), 5) * CORE_GAIN.lamplit + Math.min(k("taskDays"), 10) + Math.min(moon, 5) + Math.min(weeks, 6));
}
/** When the nest was last open, as far as an older save can tell: the last time anyone's needs were caught up. */
const coreSeenOf = d => Math.max(0, ...((d && d.creatures) || []).map(c => c && Number.isFinite(c.last) ? c.last : 0));
/** The core in the save: an older save starts part-way (see coreSeed); a damaged one is tidied up. */
function coreSaveOf(c, d, now = Date.now()) {
  const num = v => Number.isFinite(v) && v > 0 ? v : 0;
  if (!c || typeof c !== "object" || Array.isArray(c)) {
    const n = coreSeed(d, now), f = coreFacet(n);
    // told: the facets already lit aren't announced one by one; old: Mossa says one word about all of it instead
    return { n, seen: coreSeenOf(d), day: {}, fell: false, rest: 0, told: f, old: f > 0 };
  }
  const day = {};
  if (c.day && typeof c.day === "object") for (const k of CORE_DAILY) if (typeof c.day[k] === "string") day[k] = c.day[k];
  return { n: num(c.n), seen: num(c.seen), day, fell: !!c.fell, rest: num(c.rest), told: Math.min(CORE_FACETS.length, Math.floor(num(c.told))), old: !!c.old };
}

// ---------- in the game ----------

/** When the nest was last open before now: set when the page opens (save.js) and when you come back to the tab. */
let coreLastSeen = 0;
/** Has the core reached the facet that gives this? */
const coreGift = id => typeof save === "object" && !!save.core && CORE_FACETS.findIndex(f => f.gift === id) < coreFacet(save.core.n);

/** Grow it, and when a new facet lights up, a glow and a word from a friend. Never during co-op, like keeper XP. */
function coreAdd(kind) {
  if (coopSession || game.coopTouched) return 0;
  const c = save.core, gain = coreGrow(c, kind);
  if (!gain) return 0;
  coreLit();
  persist();
  return gain;
}
/** Every facet newly lit: a glow at the top of the screen and its friend's word. */
function coreLit() {
  const c = save.core, lit = coreFacet(c.n);
  while (c.told < lit) {
    c.told++;
    awardQueue.push({ core: c.told });
    showAward();
    coreSay("core" + c.told);
  }
}
/** A word now if it's a calm moment (the nest, the grotto, the book), else as soon as there is one. */
function coreSay(id) {
  if (["nest", "map", "lib"].includes(game.scene) && $("found").classList.contains("hidden")) talk(id);
  else talkLater.push([id]);
}
/** A stone that didn't open: left mid-crack, or the lantern ran dry. Nothing is lost, and nothing is taken. */
function coreFell() {
  if (coopSession || game.coopTouched || save.core.fell) return;
  save.core.fell = true;
  persist();
}
/** An egg opened: if the last one didn't, you went back to the stone anyway. */
function coreTried() {
  const c = save.core;
  if (!c.fell || coopSession || game.coopTouched) return;
  c.fell = false;
  persist();
  if (coreAdd("retry")) setTimeout(() => toast(tr("Back at the stone, and it opened. Your core grew a little ✦")), 2600);
}
/** Rest: no growth, just a soft glow on the core, and once a day a quiet word. */
function coreRest() {
  if (coopSession || game.coopTouched) return;
  const c = save.core, now = Date.now(), first = coreDay(c.rest) !== coreDay(now);
  c.rest = now;
  persist();
  if (first) setTimeout(() => toast(tr("Rest is part of the fight. Your core glows, quiet and warm 🌙")), 2800);
}
/** Things the counters already count that protect the little ones or rest you (see bump). */
function coreBump(k) {
  if (k === "rescued" || k === "lamplit") coreAdd(k);
  if (k === "harvested") coreRest();
}

/** Mossa's welcome when you come back after a day or more, and her one word for an older nest. Runs in a calm scene. */
function coreMoments(scene) {
  if (!["nest", "map", "lib"].includes(scene) || coopSession || game.coopTouched || !save.creatures.length) return;
  const seen = coreLastSeen;
  coreLastSeen = 0;
  if (save.core.old) talk("coreOld");
  if (!coreBack(save.core, seen)) return;
  const id = "back-" + coreDay();
  TALKS[id] = CORE_BACK;
  talk(id);
  coreLit();
  persist();
}
// leaving the tab marks when you were last here; coming back after a day or more is a return too
if (typeof addEventListener === "function") addEventListener("visibilitychange", () => {
  if (typeof save !== "object" || !save.core) return;
  if (document.hidden) { save.core.seen = Date.now(); return; }
  coreLastSeen = save.core.seen;
  if (game.scene !== "menu" && !talkNow) coreMoments(game.scene);
});

const CORE_BACK = () => {
  const i = Math.floor(Date.now() / 864e5) % 3;
  return [[MOSSA, ["You came back. The light held.", "There you are. The nest kept warm for you.", "Welcome home. Everyone's here, and the light held."][i]],
    [MOSSA, "Coming back is strength too. Your core grew a little."]];
};
/** The facets' words: Mossa for the first, Ember for the lantern she deepens, Mossa again for the title and the last. */
const CORE_TALKS = {
  core1: () => [[MOSSA, "Look at you. There's something steady in you now, like a stone that won't roll."],
    [MOSSA, "I've hung a little lantern by the eggs. So you never have to crack in the dark."]],
  core2: () => [[EMBER, "Mossa says you keep coming back. I like that in a keeper."],
    [EMBER, "Here: I've deepened your lantern. One more drop fits, for the long nights.", "#oilPill"]],
  core3: () => [[MOSSA, "When I fell asleep on my watch, I thought I'd never stand guard again."],
    [MOSSA, "You show me every day that it can be done. Steady heart: that's what I'll call you."]],
  core4: () => [[MOSSA, "Your core is whole now. That doesn't mean the dark is gone."],
    [MOSSA, "It means that when it comes, you have a light that holds. The little ones can feel it."]],
  coreOld: () => [[MOSSA, "I've been watching you all this while. You keep coming back, and the little ones feel safe with you."],
    [MOSSA, "Something grew in you with it, a core of light. Look for it on your Keeper page.", "#meBtn"]],
};

// ---------- the picture: a crystal in a hollow stone, its four facets lighting from the bottom up ----------

const CORE_ART = {};
/** The core as a data URL: n is how much light, rested adds a calm blue glow around the stone. */
function coreArt(n, rested) {
  const key = `${coreFacet(n)}|${coreFill(n).toFixed(2)}|${rested ? 1 : 0}`;
  if (CORE_ART[key]) return CORE_ART[key];
  const S = 40, cx = 19.5, cy = 20.5, lit = coreFacet(n), fill = coreFill(n);
  const ramp = hexes => hexes.map(pxHex);
  const stone = ramp(["#3a3440", "#5d5666", "#8a8494", "#b9b3c0"]), hollow = ramp(["#0b0614", "#160c26", "#22143a"]);
  const gold = ramp(["#946027", "#c98f3a", "#eec26a", "#fff0b5"]), dark = ramp(["#22143a", "#2e1d4f", "#3d2866"]);
  const warm = ramp(["#22143a", "#5e3a1c", "#946027"]), calm = ramp(["#0f2f4a", "#1d5276", "#3383a8", "#69b7d6"]), ink = pxHex("#160c26");
  const c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d"), im = g.createImageData(S, S), d = im.data, solid = new Uint8Array(S * S);
  const put = (x, y, rgb) => { const i = (y * S + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255; };
  // the four facets: bottom left, bottom right, top left, top right (they light in that order, like a stone settling)
  const facetOf = (x, y) => (y < cy ? 2 : 0) + (x < cx ? 0 : 1);
  const tall = 13, wide = 8.5, hx = 11.8, hy = 14.8, lining = ramp(["#3d2866", "#6b4fa8", "#ad91e6"]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const ex = (x - cx) / 16, ey = (y - cy) / 18, r = Math.hypot(ex, ey) + (pxFbm(x * .3, y * .3) - .5) * .16;
    if (r > 1) continue;
    solid[y * S + x] = 1;
    const dx = Math.abs(x - cx) / wide, dy = Math.abs(y - cy) / tall;
    if (dx + dy <= 1) {
      const f = facetOf(x, y), seam = Math.abs(x - cx) < 0.6 || Math.abs(y - cy) < 0.6;
      // a facet fills from its lowest point upward
      const top = f >= 2 ? cy - tall : cy, k = 1 - (y - top) / tall;
      const on = f < lit || (f === lit && k <= fill * 0.999 && fill > 0);
      const shade = (x < cx ? 0.75 : 0.45) + (y < cy ? 0.15 : 0) - (dx + dy) * 0.25;
      put(x, y, on ? (seam ? gold[3] : pxPick(gold, shade, x, y)) : seam ? dark[0] : pxPick(dark, shade * 0.8, x, y));
    } else if (Math.hypot((x - cx) / hx, (y - cy) / hy) <= 1) {
      // the hollow round the crystal, warmer the more facets are lit, its rim lined with little crystal teeth like a geode
      const h = Math.hypot((x - cx) / hx, (y - cy) / hy);
      if (h > 0.84 && pxHash(x, y) > 0.55) put(x, y, pxPick(lining, 1.2 - h + pxHash(y, x) * 0.5, x, y));
      else put(x, y, lit ? pxPick(warm, lit / 4 * (1.15 - h), x, y) : pxPick(hollow, 0.9 - h, x, y));
    } else put(x, y, pxPick(stone, 0.85 - (ex + ey) * 0.45 + pxFbm(x * .5, y * .5) * .25 - r * .2, x, y));
  }
  // a dark rim round the stone, and when rested a calm glow beyond it
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (solid[y * S + x]) continue;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => x + a >= 0 && x + a < S && y + b >= 0 && y + b < S && solid[(y + b) * S + x + a]);
    if (edge) { put(x, y, ink); continue; }
    if (rested) { const r = Math.hypot((x - cx) / 16, (y - cy) / 18); if (r < 1.24 && PX_BAYER[(y & 3) * 4 + (x & 3)] < (1.24 - r) * 3.2) put(x, y, pxPick(calm, (1.24 - r) * 4, x, y)); }
  }
  g.putImageData(im, 0, 0);
  return CORE_ART[key] = c.toDataURL();
}

/** The Keeper page's core: the picture, a phrase, the facets lit so far and what each gave. */
function coreHtml() {
  const c = save.core, lit = coreFacet(c.n), rest = coreRested(c);
  return `<h3>${tr("Your core")}<button class="q" data-q="core" aria-label="?">?</button></h3>`
    + `<div class="core-row"><img class="core-art${rest ? " rest" : ""}" src="${coreArt(c.n, rest)}" alt="${tr(CORE_STAGES[lit])}">`
    + `<p><b>${tr(CORE_STAGES[lit])}</b>${rest ? `<small class="core-rest">${tr("Rested. The core glows soft and warm.")}</small>` : ""}</p></div>`
    + (lit ? `<ul class="core-facets">${CORE_FACETS.slice(0, lit).map(f => `<li><i aria-hidden="true">◆</i><span><b>${tr(f.name)}</b><small>${tr(f.what)}</small></span></li>`).join("")}</ul>` : "")
    + (lit < CORE_FACETS.length ? `<p class="me-hint">${tr(lit ? "Another facet waits in the dark, filling slowly." : "Its first facet is filling, slowly, from the bottom up.")}</p>` : "")
    + `<div class="me-more" data-more="core" hidden><p>${tr("Your core grows when you come back after time away, when you go back to the stone after one that didn't open, when you stand up for the little ones (a seal freed, shadows pushed back), and with one small ritual a day: the moon egg, or tending the garden.")}</p>`
    + `<p>${tr("It grows a little at a time and never shrinks. Being away costs nothing.")}</p>`
    + `<p>${tr("Sleep, a harvest or the music box don't grow it, but the core glows softly after a rest. Rest is part of the fight.")}</p></div>`;
}

/** The little lantern Mossa hangs by the egg (the first facet's gift): a candle in an iron frame, glowing blue-calm after a rest. */
function drawCoreLantern(x, y, tall, ph) {
  const u = PX * 2, t = game.time * 0.001 + ph, fl = Math.sin(t * 9) + Math.sin(t * 23) * 0.5;
  const at = (i, j, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x / PX) * PX + i * u, Math.round(y / PX) * PX - j * u, w * u, h * u); };
  const fy = y - 9 * u, glow = (r, col) => { const g = ctx.createRadialGradient(x, fy, 2, x, fy, r); g.addColorStop(0, col); g.addColorStop(1, col.replace(/[\d.]+\)$/, "0)")); ctx.fillStyle = g; ctx.fillRect(x - r, fy - r, r * 2, r * 2); };
  if (coreRested(save.core)) glow(30 * u, "rgba(105,183,214,0.2)");
  glow(16 * u, `rgba(238,194,106,${0.3 + fl * 0.03})`);
  at(-5, 1, 11, 1, "#2a1e1a"); at(-4, 2, 9, 1, "#4a362c");                       // the foot
  at(-4, 15, 1, 13, "#2a1e1a"); at(4, 15, 1, 13, "#2a1e1a");                      // the posts
  ctx.globalAlpha = 0.22; at(-3, 15, 7, 13, "#fff0b5"); ctx.globalAlpha = 1;       // warm glass
  at(-1, 7, 3, 5, "#e4dfe8"); at(1, 7, 1, 5, "#b9b3c0"); at(-1, 5, 1, 2, "#ffffff"); // the candle
  at(0, 8, 1, 1, "#2a1e1a");                                                       // its wick
  const lean = Math.round(fl * 0.4);
  at(-1 + lean, 10, 3, 2, "#e0634f"); at(lean, 12, 1, 3, "#eec26a"); at(lean, 10, 1, 1, "#fff0b5");
  at(-5, 16, 11, 1, "#6e5444"); at(-4, 17, 9, 1, "#2a1e1a"); at(-2, 18, 5, 1, "#4a362c"); at(-1, 19, 3, 1, "#2a1e1a");   // the cap
  at(-1, 21, 1, 2, "#6e5444"); at(1, 21, 1, 2, "#6e5444"); at(0, 22, 1, 1, "#6e5444");                                  // the ring
}

if (typeof module === "object" && module.exports) module.exports = { CORE_GAIN, CORE_FACETS, CORE_STAGES, CORE_PAUSE, CORE_SEED_MAX, coreDay, coreFacet, coreFill, coreGrow, coreBack, coreRested, coreSeed, coreSaveOf };
