"use strict";
// Hatchstone · how you grow as a keeper, past the cracking itself: one scale, the keeper level (see keeperXP in scenes.js).
// Coming back after a pause, going back to the stone after one that didn't open, freeing a path from thorns with your
// light and one small ritual a day each bring a little keeper XP, once a day each; being away costs nothing.
// A few keeper levels bring a small gift as well (KEEPER_GIFTS), and Strength is the one skill that makes taps hit harder.
// (Older saves grew a "keeper's core" from the same things and bought Granite Fist at the Forge: keeperMigrate turns both
// into keeper XP, gifts and Strength, once.)
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- the rules ----------

const keeperNeed = l => 60 + l * 40;
/** The level a number of keeper XP reaches, and how far into the next one. */
function keeperLevelOf(total) {
  let xp = total, l = 1;
  while (xp >= keeperNeed(l)) { xp -= keeperNeed(l); l++; }
  return { l, xp, need: keeperNeed(l) };
}
const SKILL_MAX = 5;
/** Each point of Strength: how much harder a tap hits. Five of them hit a little harder than a full Granite Fist with full Strength did. */
const STR_STEP = 0.25;
/** The habits: keeper XP for each, once a day (a freed seal and shadows pushed back count with the other keeper XP, see KEEPER_XP). */
const HABIT_XP = { back: 30, retry: 10, thorns: 10, ritual: 8 };
const HABIT_PAUSE = 24 * 3600e3;      // a pause that counts: a day or more
/** The gifts of a keeper level: at about the same point in play as the core's facets used to light. */
const KEEPER_GIFTS = [
  { id: "lantern", at: 4, icon: "candle", name: "A lantern by every egg", what: "A little lantern hangs by every egg you crack" },
  { id: "oil", at: 6, icon: "lantern", name: "One more drop of oil", what: "Your lantern holds one more drop of oil" },
  { id: "shine", at: 10, icon: "sun", name: "A brighter light", what: "Your light pushes the Gloom's shadows back faster" },
];
const KEEPER_GIFT = Object.fromEntries(KEEPER_GIFTS.map(g => [g.id, g]));
/** The gifts whose level lies past from and up to to: a level-up from `from` to `to` brings these. */
const keeperGiftsBetween = (from, to) => KEEPER_GIFTS.filter(g => g.at > from && g.at <= to);

/** The local day of a moment, like dayKey (that one lives with the moon egg, later on). */
const habitDay = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
/** A habit's keeper XP if it hasn't had its turn today (0 if it has, or isn't one), marking today as its turn. */
function habitGrow(h, kind, now = Date.now()) {
  const xp = HABIT_XP[kind];
  if (!xp) return 0;
  const day = habitDay(now);
  if (h.day[kind] === day) return 0;
  h.day = { ...h.day, [kind]: day };
  return xp;
}
/** When the nest was last open, to the hour: enough for "a day or more", and a save doesn't change with every write. */
const habitSeenNow = () => Math.floor(Date.now() / 36e5) * 36e5;
/** Back after a pause of a day or more (seen: when the nest was last open)? Its keeper XP, once that day. */
const habitBack = (h, seen, now = Date.now()) => seen > 0 && now - seen >= HABIT_PAUSE ? habitGrow(h, "back", now) : 0;
/** When the nest was last open, as far as an older save can tell: the last time anyone's needs were caught up. */
const habitSeenOf = d => Math.max(0, ...((d && d.creatures) || []).map(c => c && Number.isFinite(c.last) ? c.last : 0));
const meFresh = () => ({ name: "", form: "n", xp: 0, pts: 0, skill: { str: 0, care: 0, luck: 0 } });

// ---------- older saves ----------

// The keeper's core: its four facets lit at 5, 12, 24 and 40 and gave these. Each point it grew is this much keeper XP now
// (about what the same things bring today: a return 30 for its 3 points, a retry 10 for 2, a ritual 8 for 1).
const CORE_AT = [5, 12, 24, 40], CORE_GIFTS = ["lantern", "oil", "title", "shine"], CORE_XP = 8;
// Granite Fist, as the Forge sold it: what each level cost, and how much harder it made a tap
const FIST_COST = [25, 50, 90, 140, 200], FIST_STEP = 0.15, OLD_STR_STEP = 0.05;

/** The habits in the save (when the nest was last open, whose turn it's been today, a stone that didn't open): from the core in an older save. */
function habitSaveOf(h, d) {
  const num = v => Number.isFinite(v) && v > 0 ? v : 0, ok = o => !!o && typeof o === "object" && !Array.isArray(o);
  const from = ok(h) ? h : ok(d && d.core) ? d.core : null;
  if (!from) return { seen: habitSeenOf(d), day: {}, fell: false };
  const day = {};
  if (ok(from.day)) for (const k of Object.keys(HABIT_XP)) if (typeof from.day[k] === "string") day[k] = from.day[k];
  return { seen: num(from.seen), day, fell: !!from.fell };
}
/**
 * Once, for an older save: its core becomes keeper XP (with the skill points of the levels it climbs) and the gifts of the
 * facets it had lit stay; Granite Fist's shards come back and its levels go into Strength, so no tap is any lighter than
 * it was. What it did is left in d.keeperNote, for one word when the nest opens (see habitMoments).
 */
function keeperMigrate(d) {
  const num = v => Number.isFinite(v) && v > 0 ? v : 0;
  d.habit = habitSaveOf(d.habit, d);
  const core = d.core && typeof d.core === "object" && !Array.isArray(d.core) ? d.core : null, h = Math.min(FIST_COST.length, Math.floor(num(d.forge && d.forge.heft)));
  delete d.core;
  if (d.forge) delete d.forge.heft;
  if (!core && !h) return d;
  const m = d.me && typeof d.me === "object" ? d.me : (d.me = meFresh());
  m.skill = { str: 0, care: 0, luck: 0, ...(m.skill && typeof m.skill === "object" ? m.skill : {}) };
  m.xp = num(m.xp); m.pts = num(m.pts);
  const note = { ...(d.keeperNote || {}) };
  if (core) {
    const n = num(core.n), lit = CORE_AT.filter(a => n >= a).length, xp = Math.round(n * CORE_XP);
    if (lit) m.gifts = [...new Set([...(Array.isArray(m.gifts) ? m.gifts : []), ...CORE_GIFTS.slice(0, lit)])];
    if (xp) {
      const before = keeperLevelOf(m.xp).l;
      m.xp += xp;
      m.pts += keeperLevelOf(m.xp).l - before;
      note.xp = (note.xp || 0) + xp;
    }
  }
  if (h) {
    const s = Math.min(SKILL_MAX, Math.floor(num(m.skill.str))), was = (1 + h * FIST_STEP) * (1 + s * OLD_STR_STEP);
    // the fewest points of Strength that hit at least as hard as Granite Fist and Strength did together (never fewer than you had)
    const str = Math.min(SKILL_MAX, Math.max(s, Math.ceil((was - 1) / STR_STEP - 1e-9))), shards = FIST_COST.slice(0, h).reduce((a, b) => a + b, 0);
    m.skill.str = str;
    d.shards = num(d.shards) + shards;
    note.fist = (note.fist || 0) + shards; note.str = (note.str || 0) + str - s;
  }
  if (note.xp || note.fist) d.keeperNote = note;
  return d;
}

// ---------- in the game ----------

/** When the nest was last open before now: set when the page opens (save.js) and when you come back to the tab. */
let habitLastSeen = 0;
/** Do you have this keeper gift: its keeper level reached, or kept from an older save's core ("title" only comes from there)? */
const keeperGift = id => typeof save === "object" && (!!(save.me && Array.isArray(save.me.gifts) && save.me.gifts.includes(id)) || (!!KEEPER_GIFT[id] && keeperLevel().l >= KEEPER_GIFT[id].at));

/** A habit's keeper XP, once a day each. Never during co-op, like all keeper XP. */
function habitXP(kind) {
  if (coopSession || game.coopTouched) return 0;
  const xp = habitGrow(save.habit, kind);
  if (!xp) return 0;
  keeperXP(xp);
  persist();
  return xp;
}
/** A stone that didn't open: left mid-crack, or the lantern ran dry. Nothing is lost, and nothing is taken. */
function habitFell() {
  if (coopSession || game.coopTouched || save.habit.fell) return;
  save.habit.fell = true;
  persist();
}
/** An egg opened: if the last one didn't, you went back to the stone anyway. */
function habitTried() {
  const h = save.habit;
  if (!h.fell || coopSession || game.coopTouched) return;
  h.fell = false;
  persist();
  habitXP("retry");
}

/** Mossa's welcome when you come back after a day or more (her one word, after a night, see MOSSA_KEPT), and one word about
 *  an older save's Granite Fist and core. Runs in a calm scene. */
function habitMoments(scene) {
  if (!["nest", "map", "lib"].includes(scene) || coopSession || game.coopTouched || !save.creatures.length) return;
  const seen = habitLastSeen;
  habitLastSeen = 0;
  const note = save.keeperNote;
  if (note) {
    delete save.keeperNote;
    persist();
    if (note.fist) toast(note.str > 0 ? tr("Granite Fist went into your Strength: Strength +{0}, and {1} ✦ back", note.str, note.fist) : tr("Granite Fist went into your Strength: {0} ✦ back", note.fist));
    if (note.xp) toast(tr("Your core grew into your keeper level: +{0} XP", note.xp));
  }
  // time away is caught up first, so the welcome is true: only if Mossa looked in does she say so
  // (seen is to the hour: the nest was open until some time in the hour after it)
  let kept = false;
  if (habitBack(save.habit, seen)) {
    kept = comeHome(seen + 36e5);
    const id = "back-" + habitDay();
    TALKS[id] = () => BACK_TALK(kept);
    talk(id);
    keeperXP(HABIT_XP.back);
    persist();
  } else if (seen > 0 && (kept = comeHome(seen + 36e5))) {
    // home after a night or a day at work: she looked in, and says so in passing, without stopping you
    toast(mossaKept());
    persist();
  }
  if (kept) {
    game.nest.glad = true;
    // the dots that ask for something wait out the quiet minute (see homeQuiet), and are back the moment it's over
    updateTopbar(); setTimeout(updateTopbar, KEPT_QUIET + 100);
  }
  // and the little ones are glad to see you, as soon as you're in the nest to see it
  if (scene === "nest" && game.nest.glad) gladHome();
}
// leaving the tab marks when you were last here; coming back after a day or more is a return too
if (typeof addEventListener === "function") addEventListener("visibilitychange", () => {
  if (typeof save !== "object" || !save.habit) return;
  if (document.hidden) { save.habit.seen = habitSeenNow(); return; }
  habitLastSeen = save.habit.seen;
  if (game.scene !== "menu" && !talkNow) habitMoments(game.scene);
});

/** After the finale, Mossa's last word on coming home is about the Gloom, as the story ended (see ENDINGS in crack.js). */
const BACK_ENDING = { home: "The Gloom keeps your corner warm. It's shy about it.", rest: "Quiet in the hollow. It's still asleep. Your watch now.",
  watch: "Nothing came from the west. The Gloom is watching." };
/** Mossa's welcome home. kept: she looked in while you were away (see applyTime in save.js), so the warm words are true. */
const BACK_TALK = kept => {
  const hello = ["You came back. The light held.", "Welcome home. Everyone's here. The light held."];
  if (kept) hello.push("There you are. The nest kept warm for you.");
  return [[MOSSA, hello[Math.floor(Date.now() / 864e5) % hello.length], null, "warm"],
    ...(kept ? [[MOSSA, "I looked in at dusk. They're not hungry. They're just glad.", null, "warm"]] : []),
    [MOSSA, BACK_ENDING[save.ending] || "Coming back is strength too."]];
};
/** After a night or a working day away (six hours or more, under a day): Mossa looked in, and says so in one short line,
 *  a different one each time (they turn every six hours), as a toast that doesn't wait for a tap. */
const MOSSA_KEPT = ["Mossa: I looked in on them. Fed and rested, all of them.", "Mossa: The nest stayed warm. I kept watch.",
  "Mossa: All well here. They missed you.", "Mossa: They ate with me. Now they want you.", "Mossa: I tidied up a little. Go on, say hello."];
const mossaKept = (now = Date.now()) => tr(MOSSA_KEPT[Math.floor(now / 216e5) % MOSSA_KEPT.length]);

/** The little lantern Mossa hangs by the egg (the gift of keeper level 4): a candle in an iron frame. */
function drawEggLantern(x, y, tall, ph) {
  const u = PX * 2, t = game.time * 0.001 + ph, fl = Math.sin(t * 9) + Math.sin(t * 23) * 0.5;
  const at = (i, j, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x / PX) * PX + i * u, Math.round(y / PX) * PX - j * u, w * u, h * u); };
  const fy = y - 9 * u;
  pxGlow(x, fy, 16 * u, "#eec26a", 0.9 + fl * 0.08);
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

if (typeof module === "object" && module.exports) module.exports = { keeperNeed, keeperLevelOf, SKILL_MAX, STR_STEP, HABIT_XP, HABIT_PAUSE, KEEPER_GIFTS, keeperGiftsBetween, habitDay, habitGrow, habitBack, habitSaveOf, keeperMigrate, meFresh, CORE_AT, CORE_GIFTS, CORE_XP, FIST_COST };
