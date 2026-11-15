const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { keeperNeed, keeperLevelOf, SKILL_MAX, STR_STEP, HABIT_XP, HABIT_PAUSE, KEEPER_GIFTS, keeperGiftsBetween, habitDay, habitGrow, habitBack, habitSaveOf, keeperMigrate, CORE_AT, CORE_GIFTS, CORE_XP, FIST_COST } = require('../js/inner.js');
const { sparkSaveOf } = require('../js/sparks.js');
const { KEEPSAKES, KEEP_WEAR, walkSaveOf } = require('../js/walk.js');
const { wardSaveOf } = require('../js/wards.js');

// One scale for "you grow": the keeper level. Strength is the one knob for how hard a tap hits (Granite Fist went into it),
// and what the keeper's core gave (keeper XP from coming back and holding on, and its facets' gifts) comes with keeper levels.
const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const plain = v => JSON.parse(JSON.stringify(v));
const H = 3600e3, DAY = 24 * H;
// noon on a fixed day, so "the same day" never straddles midnight
const NOON = new Date(2026, 10, 14, 12).getTime();

/** A save as it comes through the door: written to a pretend storage, then loaded the way the game loads it. */
function load(d) {
  const page = {
    SAVE_KEY: 'k', BAK_KEY: 'k.bak', localStorage: { getItem: k => k === 'k' && d ? JSON.stringify(d) : null, setItem: () => {} },
    sparkSaveOf, keeperMigrate, walkSaveOf, wardSaveOf, KEEP_WEAR, KS: Object.fromEntries(KEEPSAKES.map(k => [k.id, k])),
  };
  vm.runInNewContext(cut(read('save.js'), 'const SAVE_VERSION', 'const save = loadSave();', 'the save\'s way in should sit at the top of save.js') + '\nthis.loaded = loadSave(); this.migrate = migrate;', page);
  return { save: plain(page.loaded), migrate: page.migrate };
}
const old = (o = {}) => ({ v: 1, stars: { 1: 3 }, creatures: [], seen: {}, shards: 100, ...o });
const me = (str = 0, xp = 0, o = {}) => ({ name: 'Vika', form: 'f', xp, pts: 0, skill: { str, care: 1, luck: 0 }, ...o });

/** tapPower as it stands in crack.js, over a save: no echo, so the number is the hammer's own. */
function tapOf(save, egg = null) {
  const page = { save, game: { egg }, STR_STEP, Math: Object.assign(Object.create(Math), { random: () => 0.99 }) };
  page.forgeLvl = id => (page.save.forge && page.save.forge[id]) || 0;
  page.skill = id => (page.save.me && page.save.me.skill && page.save.me.skill[id]) || 0;
  vm.runInNewContext(cut(read('crack.js'), 'function tapPower()', '\nfunction openForge(', 'tapPower should sit in crack.js before the forge sheet') + '\nthis.tapPower = tapPower;', page);
  return page.tapPower().power;
}
/** How hard a tap hit before: Granite Fist's 15% a level times Strength's old 5% a point. */
const before = (heft, str) => Math.round((1 + heft * 0.15) * (1 + str * 0.05) * 100) / 100;

// ---------- one knob for tap power ----------

test('Granite Fist is gone from the Forge, and Strength alone sets how hard a tap hits', () => {
  assert.doesNotMatch(read('crack.js'), /id: "heft"|forgeLvl\("heft"\)|name: "Granite Fist"/);
  assert.doesNotMatch(read('main.js'), /"heft"/);
  assert.equal(tapOf({ me: me(0) }), 1);
  assert.equal(tapOf({ me: me(2) }), 1 + 2 * STR_STEP);
  // a forge level left in some save does nothing any more
  assert.equal(tapOf({ me: me(2), forge: { heft: 5 } }), 1 + 2 * STR_STEP);
  // shared eggs still use the plain hammer
  assert.equal(tapOf({ me: me(5) }, { conf: { coop: true } }), 1);
});

test('a full Strength hits about as hard as a full Granite Fist and full Strength did together', () => {
  const ceiling = before(FIST_COST.length, SKILL_MAX), now = 1 + SKILL_MAX * STR_STEP;
  assert.ok(now >= ceiling && now - ceiling < 0.1, `${now} against ${ceiling}`);
});

test('old saves: tap power before and after, never lighter, never far heavier', () => {
  for (const [heft, str] of [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [0, 3], [2, 1], [3, 2], [5, 2], [5, 5], [1, 5]]) {
    const was = before(heft, str), d = load(old({ forge: { heft, eye: 1 }, me: me(str) })).save, now = tapOf(d);
    assert.ok(now >= was, `Granite Fist ${heft}, Strength ${str}: ${was} then, ${now} now`);
    // at most one point of Strength more than it takes to keep up (unless Strength alone already hit harder)
    if (heft && d.me.skill.str > str) assert.ok(now - was < STR_STEP, `Granite Fist ${heft}, Strength ${str}: ${was} then, ${now} now`);
    assert.equal(d.me.skill.str >= str, true);
    assert.equal(d.forge.heft, undefined);
    assert.equal(d.forge.eye, 1, 'the other upgrades stay');
  }
  // the levels that go into Strength, from nothing: 15% → 25%, 30% → 50%, 45% → 50%, 60% → 75%, 75% → 75%
  assert.deepEqual([1, 2, 3, 4, 5].map(h => load(old({ forge: { heft: h } })).save.me.skill.str), [1, 2, 2, 3, 3]);
});

test('old saves: Granite Fist\'s shards come back once, with one word about it', () => {
  const { save: d, migrate } = load(old({ forge: { heft: 3 }, me: me(1) }));
  assert.equal(d.shards, 100 + 25 + 50 + 90);
  assert.deepEqual(d.keeperNote, { fist: 165, str: 2 }); // 45% and 5%: 52% then, three points (75%) now
  // loaded again (another tab, a backup code, the next visit): nothing more comes back
  const again = plain(migrate(plain(d)));
  assert.equal(again.shards, d.shards);
  assert.equal(again.me.skill.str, d.me.skill.str);
  assert.deepEqual(again.keeperNote, d.keeperNote, 'the word waits until it has been said, and is not doubled');
  // a save that never bought it: no shards, no word, and no keeper made up for it
  const none = load(old({ forge: { eye: 2 } })).save;
  assert.equal(none.shards, 100);
  assert.equal(none.keeperNote, undefined);
  assert.equal(none.me, undefined);
  // the word is said once, in a calm scene, and then it's gone from the save
  const src = read('inner.js');
  assert.match(cut(src, 'function habitMoments(', '\n}\n', 'habitMoments should be in inner.js'), /delete save\.keeperNote;[\s\S]*toast\(/);
});

// ---------- the core becomes keeper XP and gifts ----------

test('the gifts come at keeper levels, about where the facets used to light, each one once', () => {
  assert.deepEqual(KEEPER_GIFTS.map(g => g.id), ['lantern', 'oil', 'shine']);
  for (let i = 1; i < KEEPER_GIFTS.length; i++) assert.ok(KEEPER_GIFTS[i].at > KEEPER_GIFTS[i - 1].at);
  // never at a level that already brings a new title, so a banner says one thing
  const titles = read('scenes.js').match(/^const KEEPER_TITLES = (.*);$/m)[1];
  for (const g of KEEPER_GIFTS) assert.ok(!new RegExp(`\\[${g.at}, "`).test(titles), g.id);
  assert.deepEqual(keeperGiftsBetween(3, 4).map(g => g.id), ['lantern']);
  assert.deepEqual(keeperGiftsBetween(4, 5), []);
  assert.deepEqual(keeperGiftsBetween(1, 12).map(g => g.id), ['lantern', 'oil', 'shine']);
  // the first in the first day or two of play, the last after about a week (an engaged keeper earns a few hundred XP a day)
  const total = l => Array.from({ length: l - 1 }, (_, i) => keeperNeed(i + 1)).reduce((a, b) => a + b, 0);
  assert.ok(total(KEEPER_GIFTS[0].at) <= 500 && total(KEEPER_GIFTS[2].at) >= 2000);
  assert.equal(keeperLevelOf(total(6)).l, 6);
});

test('old saves: the core\'s growth turns into keeper XP, with the skill points of the levels it climbs', () => {
  const d = load(old({ core: { n: 40, seen: NOON, day: {}, fell: false, rest: 0, told: 4, old: false }, me: me(0, 0) })).save;
  assert.equal(d.me.xp, 40 * CORE_XP);
  assert.equal(d.me.pts, keeperLevelOf(40 * CORE_XP).l - 1);
  assert.deepEqual(d.keeperNote, { xp: 40 * CORE_XP });
  assert.equal(d.core, undefined);
  // an older keeper part-way up keeps their XP and skills, and only climbs
  const v = load(old({ core: { n: 7 }, me: me(2, 230, { pts: 1 }) })).save;
  assert.equal(v.me.xp, 230 + 7 * CORE_XP);
  assert.equal(v.me.pts, 1 + keeperLevelOf(230 + 7 * CORE_XP).l - keeperLevelOf(230).l);
  assert.equal(v.me.skill.str, 2);
  assert.equal(v.me.name, 'Vika');
  // a core that had grown nothing: nothing to say
  assert.equal(load(old({ core: { n: 0 } })).save.keeperNote, undefined);
});

test('old saves: whoever had a facet keeps what it gave, whatever their keeper level', () => {
  const cases = [[3, []], [5, ['lantern']], [12, ['lantern', 'oil']], [24, ['lantern', 'oil', 'title']], [99, CORE_GIFTS]];
  for (const [n, gifts] of cases) {
    const d = load(old({ core: { n } })).save;
    assert.deepEqual(d.me ? d.me.gifts || [] : [], gifts, 'core ' + n);
    // and the game asks for them by these names: the egg's lantern, the lantern's extra drop, the title, the stronger light
    const page = { save: d, keeperLevel: () => ({ l: 1 }) };
    vm.runInNewContext(cut(read('inner.js'), 'const KEEPER_GIFTS = ', '\n/** The local day', 'the gifts should sit in inner.js') + cut(read('inner.js'), 'const keeperGift = ', '\n/** A habit\'s keeper XP', 'keeperGift should sit in inner.js') + '\nthis.keeperGift = keeperGift;', page);
    for (const id of CORE_GIFTS) assert.equal(page.keeperGift(id), gifts.includes(id), `core ${n}: ${id}`);
  }
  assert.deepEqual(CORE_AT, [5, 12, 24, 40]);
  // a new keeper gets them by level, and "Steady heart" only ever came from the core
  const page = { save: { me: { gifts: [] } }, keeperLevel: () => ({ l: 10 }) };
  vm.runInNewContext(cut(read('inner.js'), 'const KEEPER_GIFTS = ', '\n/** The local day', '') + cut(read('inner.js'), 'const keeperGift = ', '\n/** A habit\'s keeper XP', '') + '\nthis.keeperGift = keeperGift;', page);
  assert.deepEqual(['lantern', 'oil', 'shine', 'title'].map(page.keeperGift), [true, true, true, false]);
  page.keeperLevel = () => ({ l: 5 });
  assert.deepEqual(['lantern', 'oil', 'shine'].map(page.keeperGift), [true, false, false]);
  for (const [file, id] of [['main.js', 'lantern'], ['scenes.js', 'oil'], ['play.js', 'shine'], ['scenes.js', 'title']]) assert.ok(read(file).includes(`keeperGift("${id}")`), `${file} should ask for ${id}`);
});

test('the habits carry over from the core: when the nest was last open, today\'s turns, a stone that didn\'t open', () => {
  const d = load(old({ core: { n: 9, seen: NOON, day: { back: habitDay(NOON), lamplit: habitDay(NOON), junk: 1 }, fell: true, rest: NOON, told: 1, old: true } })).save;
  assert.deepEqual(d.habit, { seen: NOON, day: { back: habitDay(NOON) }, fell: true });
  // a brand new nest, and a damaged field
  assert.deepEqual(load(null).save.habit, { seen: 0, day: {}, fell: false });
  assert.deepEqual(habitSaveOf({ seen: 'x', day: 7, fell: 'yes' }, {}), { seen: 0, day: {}, fell: true });
  // a save from before the core knows when the nest was last open from its glowlings
  assert.equal(habitSaveOf(undefined, { creatures: [{ last: NOON - H }, { last: NOON }] }).seen, NOON);
});

// ---------- keeper XP from what grew the core ----------

test('what grew the core brings keeper XP now, once a day each', () => {
  for (const k of ['back', 'retry', 'thorns', 'ritual']) assert.ok(HABIT_XP[k] > 0 && HABIT_XP[k] < keeperNeed(1), k);
  const h = { day: {} };
  assert.equal(habitGrow(h, 'ritual', NOON), HABIT_XP.ritual);
  assert.equal(habitGrow(h, 'ritual', NOON + H), 0);
  assert.equal(habitGrow(h, 'retry', NOON), HABIT_XP.retry);
  assert.equal(habitGrow(h, 'ritual', NOON + DAY), HABIT_XP.ritual);
  // rest never did grow it, and isn't a habit
  assert.equal(habitGrow(h, 'harvested', NOON), 0);
  assert.equal(habitGrow(h, 'sleep', NOON), 0);
});

test('coming back after a day or more is worth keeper XP, once that day; a short pause is not', () => {
  const h = { day: {} };
  assert.equal(habitBack(h, NOON - 3 * H, NOON), 0);
  assert.equal(habitBack(h, 0, NOON), 0, 'no idea when you were last here: no welcome');
  assert.equal(habitBack(h, NOON - HABIT_PAUSE, NOON), HABIT_XP.back);
  assert.equal(habitBack(h, NOON - 2 * DAY, NOON + H), 0);
  assert.equal(habitBack(h, NOON, NOON + 30 * DAY), HABIT_XP.back);
});

test('every place that grew the core gives keeper XP instead, and nothing is left of the core', () => {
  const calls = { 'scenes.js': ['habitXP("ritual")', 'habitFell()'], 'nest.js': ['habitXP("ritual")'], 'walk.js': ['habitXP("ritual")', 'habitXP("thorns")'], 'crack.js': ['habitTried()', 'habitMoments(scene)'] };
  for (const [file, list] of Object.entries(calls)) for (const c of list) assert.ok(read(file).includes(c), `${file}: ${c}`);
  // the freed seals and shadows pushed back already counted as keeper XP, and a wardstone set now does too
  assert.match(read('scenes.js'), /^const KEEPER_XP = \{.*\brescued: \d+.*\blamplit: \d+.*\bwarded: \d+/m);
  for (const f of fs.readdirSync(path.join(__dirname, '../js')).filter(f => f.endsWith('.js') && f !== 'i18n.js')) {
    assert.doesNotMatch(read(f), /\bcore(Add|Gift|Rest|Fell|Tried|Moments|Html|Art|Facet|Lit|Say)\b|CORE_(FACETS|STAGES|TALKS|BACK|GAIN)|save\.core\b/, f);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8'), /meCore/);
});

test('the keeper level\'s new words, its gifts and the word to an older save all have their Ukrainian', () => {
  const uk = read('i18n.js'), has = s => assert.match(uk, new RegExp(`^  ${JSON.stringify(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: "[^"]*[а-яіїєґ][^"]*",$`, 'm'), s);
  for (const g of KEEPER_GIFTS) { has(g.name); has(g.what); }
  const src = read('inner.js') + read('scenes.js');
  for (const s of ['Granite Fist went into your Strength: Strength +{0}, and {1} ✦ back', 'Granite Fist went into your Strength: {0} ✦ back', 'Your core grew into your keeper level: +{0} XP',
    'Next gift at level {0}: {1}.', 'coming home after a day or more', 'going back to the stone after one that didn\'t open', 'a small ritual a day: the moon egg, the garden or a walk', 'setting a wardstone', 'Coming back is strength too.', 'Steady heart']) {
    assert.ok(src.includes(JSON.stringify(s)), 'used: ' + s);
    has(s);
  }
  // and the core's own words are gone
  for (const s of ['Your core', 'A new facet of your core', 'Back at the stone, and it opened. Your core grew a little ✦', 'You stood guard. Your core grew a little ✦']) assert.ok(!uk.includes(`  ${JSON.stringify(s)}:`), s);
});
