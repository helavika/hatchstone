const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };

// nest.js needs the whole game around it, so only a glowling's diary (from its size down to how a line reads) and who
// goes exploring when a room is full are run here, over a pretend nest; the Ukrainian comes from i18n.js as it stands
const nestJs = read('nest.js'), saveJs = read('save.js'), crackJs = read('crack.js'), playJs = read('play.js'), uiJs = read('ui.js');
const diarySrc = cut(nestJs, '/** A glowling\'s diary keeps', '/** Its best friend', 'the diary should sit in nest.js, before bestFriend');
const settleSrc = cut(nestJs, 'function settleHome()', '/** Someone had to go out', 'settleHome should sit in nest.js, before offerSpace');
const MIN = 60e3, DAY = 864e5;
/** (What the pretend page made comes from another realm: compared as JSON, it's the values that count.) */
const same = (actual, expected, what) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), what);

/** The diary's own functions over a pretend save, in English or Ukrainian. */
function diary({ lang = 'en', save = {} } = {}) {
  const page = { save: { creatures: [], ...save }, location: { pathname: '/' }, addEventListener: () => {}, navigator: { languages: [] }, NodeFilter: { SHOW_TEXT: 4 },
    localStorage: { getItem: k => k === 'hatchstone.lang' ? lang : null, setItem: () => {} },
    document: { documentElement: {}, body: {}, title: '', createTreeWalker: () => ({ nextNode: () => null }), querySelectorAll: () => [] } };
  vm.createContext(page);
  vm.runInContext(read('i18n.js') + '\n' + diarySrc + '\nObject.assign(this, { tr, UK, DIARY_MAX, DIARY_MANY, diaryKeeps, diaryFold, remember, rememberFirst, diaryLine });', page);
  return page;
}
const D = diary();
const BOUNCE = 'Wished for a bounce on the mushrooms and got one', SONG = 'Wished for a song and got one';

test('the same wish come true again joins its line, and the line counts the times', () => {
  const cr = { id: 1, born: 0, mem: [] };
  D.remember(cr, 'Hatched from a {0} geode', 'Amethyst');
  D.remember(cr, BOUNCE);
  D.remember(cr, 'Became friends with {0} ♥', 'Pip');
  D.remember(cr, BOUNCE);
  D.remember(cr, SONG);
  D.remember(cr, BOUNCE);
  same(cr.mem.map(m => [m.k, m.n]), [['Hatched from a {0} geode', undefined], ['Became friends with {0} ♥', undefined], [SONG, undefined], [BOUNCE, 3]]);
  // it moved up to the newest, and says how many in words, in both languages
  assert.equal(D.diaryLine(cr.mem[3]), 'Wished for a bounce on the mushrooms 3 times, and got one every time');
  const uk = diary({ lang: 'uk' });
  assert.equal(uk.diaryLine(cr.mem[3]), 'Мріяло пострибати на грибочках уже 3 рази — і щоразу мрія збувалася');
  assert.equal(uk.diaryLine({ k: BOUNCE, a: [], n: 5 }), 'Мріяло пострибати на грибочках уже 5 разів — і щоразу мрія збувалася');
  assert.equal(uk.diaryLine({ k: BOUNCE, a: [], n: 22 }), 'Мріяло пострибати на грибочках уже 22 рази — і щоразу мрія збувалася');
  // a wish that came true once reads as ever
  assert.equal(D.diaryLine(cr.mem[2]), SONG);
  assert.equal(D.diaryLine(cr.mem[0]), 'Hatched from a Amethyst geode');
  // other lines never fold: two walks are two walks
  const w = { mem: [] };
  D.remember(w, 'Went for a walk: {0}', 'Meadow');
  D.remember(w, 'Went for a walk: {0}', 'Meadow');
  assert.equal(w.mem.length, 2);
});

test('every wish has a counted line, and it has its Ukrainian, in the neuter', () => {
  const FANCIES = [...saveJs.matchAll(/mem: "([^"]*)"/g)].map(m => m[1]);
  assert.equal(FANCIES.length, 12);
  const uk = diary({ lang: 'uk' });
  for (const mem of FANCIES) {
    const many = D.DIARY_MANY[mem];
    assert.ok(many && many.includes('{0}'), mem);
    assert.ok(uk.UK[many] && uk.UK[many].includes('{0}'), 'no Ukrainian for: ' + many);
    assert.match(uk.UK[many], /^Мріяло[ ,]/, many);
  }
  for (const k of ['First stroke from you ♥', 'First game with you: {0}', 'Hatched from a {0} geode, cracked together with a friend ♥']) assert.ok(uk.UK[k], 'no Ukrainian for: ' + k);
  assert.match(uk.UK['Hatched from a {0} geode, cracked together with a friend ♥'], /^Вилупилося/);
});

test('an older diary full of the same wish folds up, and keeps working', () => {
  const t0 = Date.now() - 10 * DAY;
  const old = [{ t: t0, k: 'Hatched from a {0} geode', a: ['Quartz'] }, { t: t0 + 1, k: 'Became friends with {0} ♥', a: ['Pip'] },
    ...Array.from({ length: 38 }, (_, i) => ({ t: t0 + 2 + i, k: i % 2 ? BOUNCE : SONG, a: [] }))];
  // shown before anything new is written: one line for each wish
  const shown = D.diaryFold(old);
  same(shown.map(m => [m.k, m.n]), [['Hatched from a {0} geode', undefined], ['Became friends with {0} ♥', undefined], [SONG, 19], [BOUNCE, 19]]);
  assert.equal(shown[3].t, t0 + 39);
  assert.equal(old.length, 40, 'showing it changes nothing in the save');
  // and the next line written folds it in the save too
  const cr = { mem: old };
  D.remember(cr, SONG);
  same(cr.mem.map(m => [m.k, m.n]), [['Hatched from a {0} geode', undefined], ['Became friends with {0} ♥', undefined], [BOUNCE, 19], [SONG, 20]]);
  // something odd in an old diary is passed over, not a crash
  assert.equal(D.diaryFold([null, { k: 3 }, { t: 1, k: SONG, a: [] }]).length, 1);
});

test('a full diary lets go of the oldest everyday line, never of the ones that matter', () => {
  const cr = { mem: [] };
  D.remember(cr, 'Hatched from a {0} geode', 'Quartz');
  D.remember(cr, 'First stroke from you ♥');
  D.remember(cr, 'Became friends with {0} ♥', 'Pip');
  D.remember(cr, 'Grew up: now {0}', 'Sprout');
  D.remember(cr, 'Became friends with {0} ♥', 'Ollo');
  D.remember(cr, 'First game with you: {0}', 'Sparkle catch');
  for (let i = 0; i < 100; i++) D.remember(cr, i % 2 ? 'Went for a walk: {0}' : 'Came back from {0}', 'place ' + i);
  D.remember(cr, 'Grew up: now {0}', 'Youngster');
  assert.equal(cr.mem.length, D.DIARY_MAX);
  const keys = cr.mem.map(m => m.k);
  for (const k of ['Hatched from a {0} geode', 'First stroke from you ♥', 'First game with you: {0}']) assert.ok(keys.includes(k), k);
  assert.equal(keys.filter(k => k === 'Grew up: now {0}').length, 2);
  // the first friend stays; a later friendship is an everyday line like the rest
  same(cr.mem.filter(m => m.k === 'Became friends with {0} ♥').map(m => m.a[0]), ['Pip']);
  // the newest everyday lines are the ones kept, in order
  assert.equal(cr.mem[cr.mem.length - 2].a[0], 'place 99');
  assert.equal(cr.mem.filter(m => /^(Went|Came)/.test(m.k)).length, D.DIARY_MAX - 6);
  // and a diary of nothing but lines that matter still never grows past the size
  const all = { mem: [] };
  for (let i = 0; i < 50; i++) D.remember(all, 'Grew up: now {0}', 'stage ' + i);
  assert.equal(all.mem.length, D.DIARY_MAX);
  assert.equal(all.mem[all.mem.length - 1].a[0], 'stage 49');
});

test('first stroke and first game: written once, and only for glowlings born since the diary keeps firsts', () => {
  const from = Date.now() - DAY, page = diary({ save: { diaryFrom: from } });
  const young = { id: 1, born: from + MIN, mem: [] }, old = { id: 2, born: from - DAY, mem: [] }, older = { id: 3, mem: [] };
  for (const cr of [young, old, older]) for (let i = 0; i < 3; i++) {
    page.rememberFirst(cr, 'First stroke from you ♥');
    page.rememberFirst(cr, 'First game with you: {0}', i ? 'Echo song' : 'Sparkle catch');
  }
  same(young.mem.map(m => [m.k, ...m.a]), [['First stroke from you ♥'], ['First game with you: {0}', 'Sparkle catch']]);
  same([old.mem.length, older.mem.length], [0, 0]);
  assert.equal(diary({ lang: 'uk' }).diaryLine(young.mem[1]), 'Перша гра з тобою: Лови іскорки');
  // where the game writes them: the first stroke of a glowling, the end of either game, and a hatch in co-op
  assert.match(uiJs, /bump\("petted"\); rememberFirst\(cr, "First stroke from you ♥"\);/);
  assert.match(playJs, /rememberFirst\(cr, "First game with you: \{0\}", "Sparkle catch"\);/);
  assert.match(playJs, /rememberFirst\(cr, "First game with you: \{0\}", "Echo song"\);/);
  assert.match(crackJs, /if \(e\.conf\.coop\) remember\(mine, "Hatched from a \{0\} geode, cracked together with a friend ♥", e\.crystal\.name\);/);
});

test('the save learns when the diary began keeping firsts, once', () => {
  const { sparkSaveOf } = require('../js/sparks.js'), { keeperMigrate } = require('../js/inner.js'), { KEEPSAKES, KEEP_WEAR, walkSaveOf } = require('../js/walk.js'), { wardSaveOf } = require('../js/wards.js');
  const load = d => {
    const page = { SAVE_KEY: 'k', BAK_KEY: 'k.bak', localStorage: { getItem: k => k === 'k' && d ? JSON.stringify(d) : null, setItem: () => {} },
      sparkSaveOf, keeperMigrate, walkSaveOf, wardSaveOf, KEEP_WEAR, KS: Object.fromEntries(KEEPSAKES.map(k => [k.id, k])) };
    // (with the habits from data.js beside it: an older glowling gets one on the way in)
    const habits = cut(fs.readFileSync(path.join(__dirname, '../js/data.js'), 'utf8'), 'const HABITS = [', 'const STAGES', 'the habits should sit in data.js, before the stages');
    vm.runInNewContext(habits + cut(saveJs, 'const SAVE_VERSION', 'const save = loadSave();', 'the save\'s way in should sit at the top of save.js') + '\nthis.loaded = loadSave();', page);
    return JSON.parse(JSON.stringify(page.loaded));
  };
  const before = Date.now();
  // a nest from before: its glowlings were born before it, so none of them is told it had a first stroke today
  const old = load({ v: 1, stars: { 1: 3 }, seen: {}, creatures: [{ id: 1, born: before - 30 * DAY, mem: [{ t: 1, k: SONG, a: [] }] }] });
  assert.ok(old.diaryFrom >= before && old.diaryFrom <= Date.now());
  assert.ok(old.creatures[0].born < old.diaryFrom);
  same(old.creatures[0].mem, [{ t: 1, k: SONG, a: [] }]);
  // already set: it stays as it was
  assert.equal(load({ v: 1, stars: {}, seen: {}, creatures: [], diaryFrom: 12345 }).diaryFrom, 12345);
  // a brand-new nest: from now on
  assert.ok(load(null).diaryFrom >= before);
});

/** A pretend nest of one room that fits `cap`: everyone who lives there, the one you picked, and who went out. */
function room(cap) {
  const page = { save: { creatures: [], rooms: [{ kind: 'nest' }], active: null }, Date, sent: [],
    homeCap: () => cap, isPlace: () => false, exploreFind: () => null, persist: () => {}, updateTopbar: () => {}, offerSpace: s => { page.sent.push(...s.map(c => c.id)); } };
  page.roomOf = c => c.room || 0;
  page.residents = r => page.save.creatures.filter(c => !c.out && page.roomOf(c) === r);
  vm.createContext(page);
  vm.runInContext(settleSrc + '\nthis.settleHome = settleHome;', page);
  return page;
}

test('a full room: whoever moved in last goes exploring, and the first glowling stays home', () => {
  const page = room(5), t0 = Date.now() - DAY;
  // six hatches on a phone, each new one picked as it hatches (the way adopt does)
  for (let i = 1; i <= 6; i++) {
    page.save.creatures.push({ id: i, born: t0 + i * MIN, sleeping: false });
    page.save.active = i;
    page.settleHome();
  }
  const home = page.residents(0).map(c => c.id);
  same(home, [1, 2, 3, 4, 6]);
  same(page.sent, [5]);
  // a seventh: the one before it goes too, never the first, never the one just hatched
  page.save.creatures.push({ id: 7, born: t0 + 7 * MIN, sleeping: false });
  page.save.active = 7;
  page.settleHome();
  same(page.residents(0).map(c => c.id), [1, 2, 3, 4, 7]);
  same(page.sent, [5, 6]);
});

test('a full room still lets a sleeper be, and the first glowling stays even when it is the only one awake', () => {
  const page = room(2), t0 = Date.now() - DAY;
  page.save.creatures.push({ id: 1, born: t0, sleeping: false }, { id: 2, born: t0 + MIN, sleeping: true }, { id: 3, born: t0 + 2 * MIN, sleeping: false });
  page.save.active = 3;
  page.settleHome();
  // the first one is awake, the second asleep: the sleeper is woken to go, rather than the first one leaving home
  same(page.residents(0).map(c => c.id), [1, 3]);
  // someone called home from exploring has just moved in: if the room is full, they're the one next to go
  const p2 = room(3);
  p2.save.creatures.push({ id: 1, born: t0 }, { id: 2, born: t0 + MIN, homeAt: Date.now() - MIN }, { id: 3, born: t0 + 2 * MIN }, { id: 4, born: t0 + 3 * MIN });
  p2.save.active = 4;
  p2.settleHome();
  same(p2.sent, [2]);
  // and the one you picked never goes, even if it's the first
  const p3 = room(1);
  p3.save.creatures.push({ id: 1, born: t0 }, { id: 2, born: t0 + MIN });
  p3.save.active = 1;
  p3.settleHome();
  same(p3.sent, [2]);
});
