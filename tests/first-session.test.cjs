const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };
const fill = (s, ...a) => a.length ? s.replace(/\{(\d)\}/g, (_, i) => a[i]) : s;

// the first session, piece by piece: the lantern's bars and its sheet, the award for a second room, when an event is
// told about, and how many lines Mossa and friends say at one calm moment. Each runs over a pretend nest.
const scenes = read('scenes.js'), crack = read('crack.js'), nest = read('nest.js');
const lanternSrc = [
  read('data.js'),
  cut(read('pixel.js'), 'function levelConf(', '\n}\n', 'levelConf should sit in pixel.js') + '\n}',
  cut(scenes, 'const OIL_EVERY', '// ---------- home caves ----------', 'the lantern should sit in scenes.js, before the home caves'),
  'Object.assign(this, { BARS, barFor, useBar, openLantern, freeReplay, tripCosts, CRYSTALS });',
].join('\n');

/** An element that only remembers what was put on it. */
const el = () => ({ textContent: '', innerHTML: '', hidden: false, classList: { toggle: () => {}, contains: () => true } });
function lantern(save = {}, { moonDone = false } = {}) {
  const els = {}, did = { toasts: [], shown: [] };
  const page = {
    LANG: 'en', LEVELS: 24, save: { stars: {}, seen: {}, geodes: {}, oil: { n: 0, t: Date.now() }, bars: {}, ...save },
    $: id => els[id] || (els[id] = el()), $$: () => [], els,
    tr: fill, ic: name => `[${name}]`, fmtLeft: () => '20 min', keeperGift: () => false, moonDone: () => moonDone,
    persist: () => {}, updateTopbar: () => {}, sfx: { munch: () => {}, shimmer: () => {} }, setTimeout: () => {},
    toast: t => did.toasts.push(t), show: (id, on) => did.shown.push([id, on]),
  };
  vm.runInNewContext(lanternSrc, page);
  return { page, did, els, save: page.save };
}

test('the smallest bar in the pocket is the one that goes in', () => {
  assert.equal(lantern({ bars: { star: 1, nut: 2, firefly: 1 } }).page.barFor(), 'firefly');
  assert.equal(lantern({ bars: { star: 1, nut: 2, firefly: 0 } }).page.barFor(), 'nut');
  assert.equal(lantern({ bars: { star: 1 } }).page.barFor(), 'star');
  assert.equal(lantern({ bars: {} }).page.barFor(), undefined);
});

test('a bar eaten by itself says so in the corner and opens no sheet', () => {
  const l = lantern({ bars: { nut: 1 } });
  l.page.useBar('nut', true);
  assert.deepEqual([l.save.oil.n, l.save.bars.nut], [3, 0]);
  assert.deepEqual(l.did.toasts, ['Nut bar into the lantern ✦ +3 oil']);
  assert.deepEqual(l.did.shown, [], 'no lantern sheet');
  // from the sheet, by hand, it is as it was: the sheet shows again with the new oil, and no toast
  const h = lantern({ bars: { firefly: 1 } });
  h.page.useBar('firefly');
  assert.deepEqual([h.did.toasts.length, h.did.shown.at(-1)], [0, ['lantern', true]]);
});

test('the empty lantern offers today\'s moon egg and a ★★★ level, free', () => {
  const stars = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, i < 8 ? 3 : 1]));
  const l = lantern({ stars });
  l.page.openLantern(true);
  assert.equal(l.els.lanternTitle.textContent, 'The lantern is out');
  assert.match(l.els.lanternSub.textContent, /play one of these for free:$/);
  assert.equal(l.els.lanternGo.hidden, false);
  assert.match(l.els.lanternGo.innerHTML, /data-free="moon"/);
  // the deepest level with ★★★ (8, not 9 with one star): its cave still hides crystals the Book lacks
  assert.match(l.els.lanternGo.innerHTML, /data-free="8">\[star\]Level 8 ★★★/);
  // the moon egg already cracked today, and no ★★★ anywhere: nothing to offer, and the old words
  const none = lantern({ stars: { 1: 2 } }, { moonDone: true });
  none.page.openLantern(true);
  assert.equal(none.els.lanternGo.hidden, true);
  assert.match(none.els.lanternSub.textContent, /Have a bar, or come back a little later\.$/);
  // with oil in it, the sheet is just the lantern
  const full = lantern({ stars, oil: { n: 5, t: 0 } });
  full.page.openLantern();
  assert.equal(full.els.lanternGo.hidden, true);
});

test('a ★★★ level worth cracking again: the deepest whose cave the Book hasn\'t finished', () => {
  const stars = { 1: 3, 2: 3, 7: 3, 8: 3 };
  const l = lantern({ stars });
  assert.equal(l.page.freeReplay(), 8);
  // the second cave's crystals all in the Book: the first cave's deepest ★★★ is the one
  const book = Object.fromEntries(l.page.CRYSTALS.filter(c => c.cave === 1).map(c => [c.id, { count: 1 }]));
  assert.equal(lantern({ stars, geodes: book }).page.freeReplay(), 2);
  // everything found: the deepest ★★★ all the same
  const all = Object.fromEntries(l.page.CRYSTALS.map(c => [c.id, { count: 1 }]));
  assert.equal(lantern({ stars, geodes: all }).page.freeReplay(), 8);
  assert.equal(lantern({ stars: { 1: 2 } }).page.freeReplay(), 0);
});

test('"More room" waits for a room carved at the shop', () => {
  const awardsSrc = cut(scenes, 'const AWARDS = [', '\n];', 'the awards should be one list in scenes.js') + '\n];';
  const kinds = cut(nest, 'const ROOM_KINDS = [', '\n];', 'ROOM_KINDS should be one list in nest.js') + '\n];';
  const room2 = rooms => {
    const page = { save: { rooms: rooms.map(kind => ({ kind, on: [] })) } };
    vm.runInNewContext(kinds + '\n' + awardsSrc + '\nthis.AWARDS = AWARDS;', page);
    const [now, goal] = page.AWARDS.find(a => a.id === 'room2').test();
    return now >= goal;
  };
  // a new nest comes with its garden outside; the map's places are rooms in the save, but not rooms of your home
  assert.equal(room2(['nest', 'yard']), false);
  assert.equal(room2(['nest', 'yard', 'shop', 'forge', 'grotto', 'camp', 'lab']), false);
  assert.equal(room2(['nest', 'yard', 'shop', 'play']), true);
  assert.equal(room2(['nest', 'play']), true);
  // nothing takes an award back: an award once earned is never looked at again
  assert.match(cut(scenes, 'function checkAwards(', '\n}\n', 'checkAwards should sit in scenes.js'), /if \(earned\[a\.id\]\) continue;/);
});

test('an event is told about after level 3, and not on the nest\'s first day or in its first session', () => {
  const DAY = 864e5, NOON = new Date(2026, 10, 14, 12).getTime();
  const src = [line(scenes, /^const dayKey = .*$/m, 'dayKey should be one line in scenes.js'),
    line(crack, /^const nestBegan = .*$/m, 'nestBegan should be one line in crack.js'),
    line(crack, /^const eventToldOk = .*$/m, 'eventToldOk should be one line in crack.js'), 'this.eventToldOk = eventToldOk;'].join('\n');
  const ok = ({ stars = { 1: 1, 2: 1, 3: 1 }, met = NOON - 2 * DAY, empty = false, seen } = {}) => {
    class Clock extends Date { constructor(...a) { if (a.length) super(...a); else super(NOON); } static now() { return NOON; } }
    const page = { Date: Clock, startedEmpty: empty, save: { stars, seen: seen || { pebblet: { count: 1, first: met } } } };
    vm.runInNewContext(src, page);
    return page.eventToldOk();
  };
  assert.equal(ok(), true);
  assert.equal(ok({ stars: { 1: 3, 2: 3 } }), false, 'not before level 3 is cleared');
  assert.equal(ok({ empty: true }), false, 'not in the session the nest began in');
  assert.equal(ok({ met: NOON - 3600e3 }), false, 'not on the day the nest began');
  assert.equal(ok({ seen: { pebblet: { count: 4 } } }), true, 'an older nest that never noted the day began long ago');
});

// the calm moments: the talk queue as it is in crack.js, over pretend talks of known lengths
const talkSrc = [
  cut(crack, 'let talkOld = null;', '/** Where the thing a line points at', 'the talk queue should sit in crack.js'),
  cut(crack, 'const talkLater = [];', '\nfunction nestHint', 'talkMoments should sit in crack.js, before nestHint'),
  'Object.assign(this, { talkMoments, talkQueue, talkLater, TALK_RUN });',
].join('\n');
function calm({ lens, later = [], cleared = 6, wick = false } = {}) {
  const said = [], lines = n => Array.from({ length: n }, (_, i) => ['who', 'line ' + i]);
  const TALKS = Object.fromEntries(Object.entries(lens).map(([id, n]) => [id, () => lines(n)]));
  const page = {
    TALKS, LEVELS: 24, save: { creatures: [{}], me: { name: 'V' }, talks: {}, stars: Object.fromEntries(Array.from({ length: cleared }, (_, i) => [i + 1, 3])) },
    game: {}, coopSession: null, persist: () => {}, $: () => ({ classList: { contains: () => true } }),
    nextTalk: () => {}, habitMoments: () => {}, tellTrips: () => {}, openMe: () => {}, unlocked: n => n <= cleared + 1, eventNow: () => null,
    wickHere: () => wick, wickRoom: () => true, wardFound: () => false, dayNo: () => 1, WICK: {}, MOSSA: {},
    STORY: [{ id: 's1', at: 5 }],
  };
  vm.runInNewContext(talkSrc, page);
  page.talkLater.push(...later);
  // what the player reads, then the queue is empty again for the next calm moment
  const moment = scene => { page.talkMoments(scene); const n = page.talkQueue.reduce((a, l) => a + l.length, 0); said.push(Object.keys(page.save.talks).filter(id => id !== 'firstPet' && !said.flat().includes(id))); page.talkQueue.length = 0; return n; };
  return { page, said, moment };
}

test('after the first seal, no more than five lines in a row: the rest wait for the next calm moment, in order', () => {
  const c = calm({ lens: { firstPet: 5, g1win: 2, core1: 2, ch1: 2, 'wick-1': 1, s1: 4 }, later: [['g1win'], ['core1']], wick: true });
  c.page.save.talks.firstPet = 1;
  const runs = [c.moment('nest'), c.moment('nest'), c.moment('nest'), c.moment('nest')];
  assert.ok(runs.every(n => n <= c.page.TALK_RUN), JSON.stringify(runs));
  assert.deepEqual(c.said.slice(0, 3), [['g1win', 'core1'], ['ch1', 'wick-1'], ['s1']]);
  assert.equal(c.page.talkLater.length, 0, 'nothing is lost');
});

test('a moment waiting in line keeps its place when it doesn\'t fit yet', () => {
  const c = calm({ lens: { firstPet: 5, g1win: 4, shiny: 2, core1: 2 }, later: [['g1win'], ['shiny', {}], ['core1']] });
  c.page.save.talks.firstPet = 1;
  assert.equal(c.moment('map'), 4);
  assert.deepEqual([...c.page.talkLater.map(a => a[0])], ['shiny', 'core1']);
  assert.equal(c.moment('map'), 4);
  assert.deepEqual(c.said, [['g1win'], ['shiny', 'core1']]);
  // one long talk on its own is told whole
  const long = calm({ lens: { firstPet: 5, s1: 6 }, cleared: 1 });
  long.page.save.talks.firstPet = 1;
  long.page.STORY[0].at = 1;
  assert.equal(long.moment('nest'), 6);
});
