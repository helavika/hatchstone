const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sparkSaveOf } = require('../js/sparks.js');
const { coreSaveOf } = require('../js/inner.js');
const { KEEPSAKES, KEEP_WEAR, walkSaveOf } = require('../js/walk.js');
const { wardSaveOf } = require('../js/wards.js');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// scenes.js and save.js need the whole game around them, so only the moon egg's part of each is run here: the moon's own
// functions with a pretend nest under them, and the save's way in (loadSave and migrate) with a pretend storage
const scenes = read('scenes.js'), saveJs = read('save.js'), pixel = read('pixel.js');
const moonSrc = [
  line(scenes, /^const dayKey = .*$/m, 'dayKey should be one line in scenes.js'),
  line(saveJs, /^const unlocked = .*$/m, 'unlocked should be one line in save.js'),
  cut(pixel, 'function levelConf(', '\n}\n', 'levelConf should sit in pixel.js') + '\n}',
  cut(scenes, 'const moonDone = ', 'function untilTomorrow()', 'the moon egg should sit in scenes.js, before untilTomorrow'),
].join('\n');
const saveSrc = cut(saveJs, 'const SAVE_VERSION', 'const save = loadSave();', 'the save\'s way in should sit at the top of save.js');
const awardsSrc = cut(scenes, 'const AWARDS = [', '\n];', 'the awards should be one list in scenes.js') + '\n];';

const DAY = 864e5, NOON = new Date(2026, 10, 14, 12).getTime();
const keyOf = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fill = (s, ...a) => a.length ? s.replace(/\{(\d)\}/g, (_, i) => a[i]) : s;

/** The moon egg over a pretend nest: a clock to move by days, the bars it hands out, the hints it sets. */
function moon(save = {}, words = {}) {
  const clock = { now: NOON }, bars = [], hints = [], eggs = [];
  class Clock extends Date { constructor(...a) { if (a.length) super(...a); else super(clock.now); } }
  const page = {
    Date: Clock, LEVELS: 24, save: { stars: {}, seen: {}, counts: {}, ...save },
    tr: words.tr || fill, pl: words.pl || ((n, one, many) => n === 1 ? one : many),
    giveBar: id => bars.push(id), taskDone: () => {}, coreAdd: () => {}, setScene: () => {}, sfx: { tick: () => {} }, game: {},
    setHint: s => hints.push(s), newEgg: conf => eggs.push(conf), CRYSTAL: { moonstone: { id: 'moonstone' } },
    // today's glowling: a plain rare one, already met
    moonToday: () => ({ id: 'ambercub' }), rar: r => r, rarityOf: () => 'rare', untilTomorrow: () => '5h',
  };
  vm.runInNewContext(moonSrc + '\nObject.assign(this, { moonDone, moonNights, moonWaited, moonNote, moonLine, moonConf, startMoon, finishMoon });', page);
  return { page, bars, hints, eggs, save: page.save, days: n => { clock.now += n * DAY; }, open: () => page.finishMoon() };
}

/** A save as it comes through the door: written to a pretend storage, then loaded the way the game loads it. */
function load(d) {
  const page = {
    SAVE_KEY: 'k', BAK_KEY: 'k.bak', localStorage: { getItem: k => k === 'k' && d ? JSON.stringify(d) : null, setItem: () => {} },
    sparkSaveOf, coreSaveOf, walkSaveOf, wardSaveOf, KEEP_WEAR, KS: Object.fromEntries(KEEPSAKES.map(k => [k.id, k])),
  };
  vm.runInNewContext(saveSrc + '\nthis.loaded = loadSave(); this.migrate = migrate;', page);
  // (through JSON, as it would be written: what isn't there isn't kept)
  return { save: JSON.parse(JSON.stringify(page.loaded)), migrate: page.migrate };
}
/** A nest from before nights were kept: a streak, the longest one, the awards for them. */
const oldNest = (moon, moonBest, awards = {}, creatures = []) => ({ v: 1, stars: { 1: 3 }, creatures, seen: {}, counts: moonBest ? { moonBest } : {}, awards, ...(moon ? { moon } : {}) });

test('every day a moon egg opens is one more night kept', () => {
  const m = moon();
  assert.equal(m.page.moonNights(), 0);
  assert.equal(m.page.moonNote(), '');
  for (let n = 1; n <= 4; n++) {
    m.open();
    assert.equal(m.page.moonNights(), n);
    assert.equal(m.save.moon.last, keyOf(NOON + (n - 1) * DAY));
    assert.ok(m.page.moonDone());
    m.days(1);
  }
  assert.equal(m.page.moonNote(), ' · 4 nights kept\u00a0🌙');
});

test('a day away, or a month, never lowers the count', () => {
  const m = moon();
  m.open(); m.days(1); m.open();
  for (const away of [2, 5, 40]) {
    m.days(away);
    assert.equal(m.page.moonNights(), 2, `${away} days away take nothing`);
    assert.ok(!m.page.moonDone());
  }
  m.open();
  assert.equal(m.page.moonNights(), 3);
  m.days(9); m.open();
  assert.equal(m.page.moonNights(), 4);
});

test('a night is kept once, even if the egg opens twice that day', () => {
  const m = moon();
  m.open(); m.open();
  assert.equal(m.page.moonNights(), 1);
});

test('every third night kept brings a star bar, in a row or not', () => {
  const m = moon();
  for (const away of [1, 1, 6, 1, 20, 3, 1, 1, 2]) { m.open(); m.days(away); }
  assert.deepEqual(m.bars, ['firefly', 'firefly', 'star', 'firefly', 'firefly', 'star', 'firefly', 'firefly', 'star']);
});

test('the bonus shards grow with the nights kept, and a gap does not start them over', () => {
  const m = moon();
  assert.equal(m.open(), 25);
  m.days(1); assert.equal(m.open(), 30);
  m.days(12); assert.equal(m.open(), 35);
  for (let i = 0; i < 20; i++) { m.days(2); m.open(); }
  m.days(1); assert.equal(m.open(), 75);
});

test('the moon waited: said only after a gap', () => {
  const WAITED = 'The moon waited. It\'s good at that.';
  const m = moon();
  // never opened: nothing to wait for
  assert.ok(!m.page.moonWaited());
  assert.ok(!m.page.moonLine().includes(WAITED));
  m.open();
  assert.ok(!m.page.moonWaited(), 'not on the day it was opened');
  assert.equal(m.page.moonLine(), 'next one in 5h · 1 night kept\u00a0🌙');
  m.days(1);
  assert.ok(!m.page.moonWaited(), 'not the day after: yesterday\'s egg was opened');
  assert.equal(m.page.moonLine(), 'a rare glowling sleeps inside ✦ +25 shards · 1 night kept\u00a0🌙');
  m.days(1);
  assert.ok(m.page.moonWaited(), 'yesterday\'s egg stayed shut');
  assert.equal(m.page.moonLine(), WAITED + '\na rare glowling sleeps inside ✦ +25 shards · 1 night kept\u00a0🌙');
  m.days(30);
  assert.ok(m.page.moonWaited());
  m.open();
  assert.ok(!m.page.moonWaited(), 'and not once today\'s egg is open');
  assert.ok(!m.page.moonLine().includes(WAITED));
});

test('the moon egg itself says it, unless the altar\'s card just did', () => {
  const WAITED = 'The moon waited. It\'s good at that.', USUAL = 'today\'s moon egg: something special sleeps inside 🌙';
  const m = moon({ moon: { last: keyOf(NOON - 3 * DAY), nights: 5 } });
  m.page.startMoon();
  m.page.startMoon(true);
  assert.deepEqual(m.hints, [WAITED, USUAL]);
  const near = moon({ moon: { last: keyOf(NOON - DAY), nights: 5 } });
  near.page.startMoon();
  assert.deepEqual(near.hints, [USUAL]);
  const first = moon();
  first.page.startMoon();
  assert.deepEqual(first.hints, [USUAL]);
});

test('the moon stone is as hard as the deepest cave opened, and never softer than it was', () => {
  const stone = stars => { const m = moon({ stars }); m.page.startMoon(); return m.eggs[0]; };
  const upTo = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, 1]));
  // [levels cleared, hp, how much the weak spot glows]
  for (const [cleared, hp, glow] of [[0, 16, 0.45], [3, 16, 0.45], [5, 16, 0.45], [6, 20, 0.45], [11, 20, 0.45], [12, 30, 0.2], [18, 41, 0], [24, 41, 0]]) {
    const egg = stone(upTo(cleared));
    assert.equal(egg.hp, hp, `hp with ${cleared} levels cleared`);
    assert.equal(egg.spotGlow, glow, `glow with ${cleared} levels cleared`);
    // still a moon egg, whatever the stone
    assert.equal(egg.n, 'moon'); assert.equal(egg.moon, true); assert.equal(egg.wander, true);
    assert.equal(egg.forced.species.id, 'ambercub'); assert.equal(egg.forced.crystal.id, 'moonstone');
  }
});

test('an older save: the streak and the longest streak become nights kept', () => {
  // a streak going
  assert.deepEqual(load(oldNest({ last: '2026-11-13', streak: 4 }, 4)).save.moon, { last: '2026-11-13', nights: 4, streak: 4 });
  // a streak that began again after a longer one: the longer one counts
  assert.deepEqual(load(oldNest({ last: '2026-11-10', streak: 1 }, 6)).save.moon, { last: '2026-11-10', nights: 6, streak: 6 });
  // a save from before the longest streak was kept
  assert.equal(load(oldNest({ last: '2026-03-02', streak: 2 })).save.moon.nights, 2);
  // a moon egg opened, and nothing else to go by: one night
  assert.equal(load(oldNest({ last: '2026-03-02' })).save.moon.nights, 1);
  assert.equal(load(oldNest({ last: '2026-03-02', streak: 'x' })).save.moon.nights, 1);
});

test('an older save: awards and glowlings from moon eggs speak for nights, too', () => {
  const at = NOON - 30 * DAY;
  assert.equal(load(oldNest({ last: '2026-11-10', streak: 1 }, 0, { moon1: at, streak3: at })).save.moon.nights, 3);
  assert.equal(load(oldNest({ last: '2026-11-10', streak: 2 }, 5, { streak3: at, streak7: at })).save.moon.nights, 7);
  assert.equal(load(oldNest(null, 0, { moon1: at })).save.moon.nights, 1);
  const fromMoon = id => ({ id, sp: 'x' + id, mem: [{ t: at, k: 'Hatched from a {0} geode', a: ['Quartz'] }, { t: at, k: 'Hatched from a moon egg 🌙', a: [] }] });
  const fromCave = id => ({ id, sp: 'x' + id, mem: [{ t: at, k: 'Hatched from a {0} geode', a: ['Quartz'] }] });
  assert.equal(load(oldNest({ last: '2026-11-10', streak: 1 }, 2, {}, [fromMoon(1), fromCave(2), fromMoon(3), fromMoon(4), { id: 5, sp: 'x5' }])).save.moon.nights, 3);
});

test('nobody loses an award, or the way to one', () => {
  const at = NOON - 30 * DAY;
  for (const [moon0, best, awards] of [[{ last: '2026-11-13', streak: 2 }, 2, { moon1: at }], [{ last: '2026-10-01', streak: 1 }, 6, { moon1: at, streak3: at }], [{ last: '2026-11-14', streak: 9 }, 9, { moon1: at, streak3: at, streak7: at }]]) {
    const { save } = load(oldNest(moon0, best, awards));
    // what the awards used to count: the longest streak, or the one going
    assert.ok(save.moon.nights >= Math.max(best, moon0.streak));
    assert.deepEqual(save.awards, awards);
    assert.equal(save.counts.moonBest, best);
  }
  // the awards keep their names in the save, count nights kept, and a third one waits at 30
  const page = { stat: { nights: () => 12 } };
  vm.runInNewContext(awardsSrc + '\nthis.AWARDS = AWARDS;', page);
  const aw = id => page.AWARDS.find(a => a.id === id);
  assert.deepEqual([...aw('streak3').test()], [12, 3]);
  assert.deepEqual([...aw('streak7').test()], [12, 7]);
  assert.deepEqual([...aw('nights30').test()], [12, 30]);
  assert.equal(aw('nights30').tier, 'legendary');
  for (const id of ['streak3', 'streak7', 'nights30']) assert.doesNotMatch(aw(id).how, /in a row|streak/i);
});

test('a new nest keeps no moon, and nights kept come back as they were saved', () => {
  assert.equal(load(null).save.moon, undefined);
  assert.equal(load(oldNest(null)).save.moon, undefined);
  const m = moon();
  for (const away of [1, 4, 1, 1, 9]) { m.open(); m.days(away); }
  const again = load({ v: 1, stars: {}, creatures: [], ...JSON.parse(JSON.stringify(m.save)) }).save;
  assert.deepEqual(again.moon, { last: keyOf(NOON + 7 * DAY), nights: 5, streak: 5 });
  assert.equal(again.moon.nights, 5);
  // and loading it a second time changes nothing
  assert.deepEqual(load(again).save.moon, again.moon);
});

test('an older game that opens a newer save finds numbers, and takes no nights away', () => {
  const m = moon();
  for (let i = 0; i < 8; i++) { m.open(); m.days(3); }
  assert.equal(m.save.moon.streak, 8);
  assert.equal(m.save.counts.moonBest, 8);
  // the older game, after a gap: its streak begins again at 1 and it knows nothing of nights
  const older = { v: 1, stars: {}, creatures: [], counts: m.save.counts, moon: { last: '2026-12-20', streak: 1 } };
  assert.deepEqual(load(older).save.moon, { last: '2026-12-20', nights: 8, streak: 8 });
});

test('the keeper\'s core still starts an older nest from its moon nights', () => {
  const now = Date.now();
  const born = [{ id: 1, sp: 'ambercub', born: now, last: now }];
  const plain = load(oldNest(null, 0, {}, born)).save, kept = load(oldNest({ last: '2026-11-13', streak: 4 }, 4, {}, born)).save;
  assert.equal(kept.core.n - plain.core.n, 4);
});

test('in Ukrainian: the count in its three forms, and the moon\'s hello', () => {
  const page = {
    location: { pathname: '/' }, addEventListener: () => {}, navigator: { languages: [] }, NodeFilter: { SHOW_TEXT: 4 },
    localStorage: { getItem: k => k === 'hatchstone.lang' ? 'uk' : null, setItem: () => {} },
    document: { documentElement: {}, body: {}, title: '', createTreeWalker: () => ({ nextNode: () => null }), querySelectorAll: () => [] },
  };
  vm.runInNewContext(read('i18n.js') + '\nObject.assign(this, { tr, pl, UK });', page);
  const m = moon({ moon: { last: keyOf(NOON - 3 * DAY), nights: 1 } }, page);
  assert.equal(m.page.moonNote(), ' · 1 ніч із місяцем\u00a0🌙');
  m.save.moon.nights = 3; assert.equal(m.page.moonNote(), ' · 3 ночі з місяцем\u00a0🌙');
  m.save.moon.nights = 11; assert.equal(m.page.moonNote(), ' · 11 ночей із місяцем\u00a0🌙');
  m.save.moon.nights = 21; assert.equal(m.page.moonNote(), ' · 21 ніч із місяцем\u00a0🌙');
  assert.ok(m.page.moonLine().startsWith('Місяць чекав. Чекати він уміє.\n'));
  // every word the moon egg and its awards say has its Ukrainian, and the streak's words are gone
  const said = [...(moonSrc + awardsSrc).matchAll(/(?:tr\(|how: |name: )"((?:[^"\\]|\\.)+)"/g)].map(x => x[1]);
  assert.ok(said.includes('The moon waited. It\'s good at that.') && said.includes('Open the moon egg on any 30 nights'));
  for (const s of said) assert.equal(typeof page.UK[s], 'string', `no Ukrainian for: ${s}`);
  for (const k of Object.keys(page.UK)) assert.doesNotMatch(k, /streak|nights in a row|Don't miss it/, `still there: ${k}`);
});
