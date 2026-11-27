const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { keeperMigrate } = require('../js/inner.js');
const { sparkSaveOf } = require('../js/sparks.js');
const { KEEPSAKES, KEEP_WEAR, walkSaveOf } = require('../js/walk.js');
const { wardSaveOf } = require('../js/wards.js');

// Beds decide who fits at home (#310), and a new nest starts with one cot (#311): the beds in the save and an older save's
// share of them, what the shop's beds cost and how they're paid for, where a newcomer settles once beds count, and the
// first session's words about them. Each runs over a pretend nest.
const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };
const plain = v => JSON.parse(JSON.stringify(v));
const fill = (s, ...a) => a.length ? s.replace(/\{(\d)\}/g, (_, i) => a[i]) : s;
const saveJs = read('save.js'), nestJs = read('nest.js'), crackJs = read('crack.js'), data = read('data.js');

/** A save as it comes through the door: written to a pretend storage, then loaded the way the game loads it. */
function load(d) {
  const page = {
    SAVE_KEY: 'k', BAK_KEY: 'k.bak', localStorage: { getItem: k => k === 'k' && d ? JSON.stringify(d) : null, setItem: () => {} },
    sparkSaveOf, keeperMigrate, walkSaveOf, wardSaveOf, KEEP_WEAR, KS: Object.fromEntries(KEEPSAKES.map(k => [k.id, k])),
    HABIT: { calm: {} }, seededHabit: () => 'calm',
  };
  vm.runInNewContext(cut(saveJs, 'const SAVE_VERSION', 'const save = loadSave();', 'the save\'s way in should sit at the top of save.js') + '\nthis.loaded = loadSave(); this.migrate = migrate; this.bedsFor = bedsFor; this.BED_PLACES = BED_PLACES; this.BED_SPOTS = BED_SPOTS; this.HOME_KINDS = HOME_KINDS; this.freshSave = freshSave;', page);
  return { save: plain(page.loaded), page };
}
const sleeps = beds => beds.reduce((n, t) => n + { cot: 1, bunk: 2, tree: 4, igloo: 6 }[t], 0);
const old = (o = {}) => ({ v: 1, stars: { 1: 3, 2: 3 }, seen: {}, shards: 100, ...o });
const g = (id, room, o = {}) => ({ id, name: 'G' + id, sp: 'mothlet', habit: 'calm', room, ...o });

test('a brand-new nest: one moss cot in the nest, nobody in it, and no beds in the garden outside', () => {
  const { save: s } = load(null);
  assert.equal(s.creatures.length, 0);
  assert.deepEqual(s.rooms.map(r => r.beds), [['cot'], undefined]);
  assert.equal(s.v, 2);
  // and the bars it starts with (the first cot takes one)
  assert.ok(s.bars.firefly + s.bars.nut >= 1);
});

test('an older save: everyone at home has a bed, room by room, rounded up to whole beds; the ones away stay away', () => {
  const rooms = [{ kind: 'nest', on: [] }, { kind: 'yard', on: [] }, { kind: 'play', on: [] }, { kind: 'shop', on: [] }, { kind: 'garden', on: [] }, { kind: 'study', on: [] }];
  const creatures = [
    ...[1, 2, 3, 4, 5, 6, 7].map(id => g(id, 0)),
    g(8, 2), g(9, 2), g(10, 2),
    // one filed under the shop (it lives in the nest), an explorer waiting for space, one on a trip, a helper
    g(11, 3), g(12, 0, { out: true, outAt: 1 }), g(13, 2, { out: true, roam: true, trip: { place: 'amethyst', hrs: 4, until: 1 } }), g(14, 4, { level: 12, out: true, roam: true, job: { place: 'shop', since: 1 } }),
  ];
  const { save: s } = load(old({ rooms, creatures, nestUp: 2 }));
  // the nest sleeps its 7 and the one from the shop: 8, in two nest-trees; the playroom its 3; the moss garden and the study, nobody yet: a cot each
  assert.deepEqual(s.rooms.map(r => r.beds), [['tree', 'tree'], undefined, ['bunk', 'cot'], undefined, ['cot'], ['cot']]);
  // nobody moved, nobody was sent out or called home
  assert.deepEqual(s.creatures.map(c => [c.id, !!c.out]), creatures.map(c => [c.id, !!c.out]));
  assert.equal('nestUp' in s, false, 'room for one more is the beds\' now');
  // what its two steps cost (150 + 300) comes back, and Tansy says so once, at home
  assert.deepEqual([s.shards, s.bedRefund], [100 + 450, 450]);
  assert.match(nestJs, /if \(save\.bedRefund > 0 && game\.scene === "nest"\) \{ const n = save\.bedRefund; delete save\.bedRefund;.*toast\(tr\("Tansy gave back ✦ \{0\} for the old extra space: beds are home now", n\)\)/);
  // all three steps: 950; none, or a broken number: nothing
  assert.equal(load(old({ rooms, creatures, nestUp: 3 })).save.shards, 1050);
  for (const nestUp of [0, -1, 'x', undefined]) { const { save: z } = load(old({ rooms, creatures, nestUp })); assert.deepEqual([z.shards, 'bedRefund' in z], [100, false], String(nestUp)); }
  // loaded again, nothing changes (the beds it got are its own now, and nothing is paid twice)
  const again = load({ ...s, bedRefund: undefined }).save;
  assert.deepEqual(plain(again.rooms), s.rooms);
  assert.equal(again.shards, s.shards);
});

test('the beds an older room gets: never fewer places than sleepers, three spots at most, one spare place at most', () => {
  const { page } = load(null);
  for (let n = 0; n <= 12; n++) {
    const beds = plain(page.bedsFor(n));
    assert.ok(beds.length >= 1 && beds.length <= page.BED_SPOTS, `${n}: ${beds}`);
    assert.ok(sleeps(beds) >= n, `${n} sleep in ${beds}`);
    assert.ok(sleeps(beds) - n <= 1 || (n === 0 && sleeps(beds) === 1), `${n}: no more than one spare place in ${beds}`);
    assert.ok(!beds.includes('igloo'), `${n}: an igloo is only ever grown, in the snowfields' snow`);
  }
  assert.deepEqual(plain(page.bedsFor(11)), ['tree', 'tree', 'tree'], 'the most an old room held (8 + three steps of room for one more) still fits');
  assert.deepEqual(plain(page.bedsFor(5)), ['tree', 'cot']);
  // a phone's old cap was 5, a computer's 8: either fits
  assert.equal(sleeps(plain(page.bedsFor(8))), 8);
});

test('beds already in the save are kept as they are, the broken bits dropped, and a room never has none', () => {
  const rooms = [{ kind: 'nest', on: [], beds: ['bunk', 'sofa', 'cot', 'tree', 'tree'] }, { kind: 'yard', on: [], beds: ['cot'] }, { kind: 'play', on: [], beds: [] }];
  const { save: s } = load(old({ rooms, creatures: [g(1, 0), g(2, 2), g(3, 2)] }));
  assert.deepEqual(s.rooms.map(r => r.beds), [['bunk', 'cot', 'tree'], undefined, ['cot']]);
});

test('the home kinds in the save are the rooms at home in nest.js', () => {
  const { page } = load(null);
  const kinds = [...cut(nestJs, 'const ROOM_KINDS = [', '\n];', 'ROOM_KINDS').matchAll(/\{ id: "(\w+)"([^\n]*)/g)].filter(m => !/place: true/.test(m[2])).map(m => m[1]);
  assert.deepEqual(plain(page.HOME_KINDS), kinds);
});

// ---------- the shop's beds ----------

const bedsSrc = [
  line(saveJs, /^const BED_PLACES = .*$/m, 'BED_PLACES should be one line in save.js'),
  cut(data, 'const SNACKS = {', '\n};', 'SNACKS in data.js') + '\n};',
  line(read('scenes.js'), /^const barFor = .*$/m, 'barFor'),
  line(crackJs, /^const spares = .*$/m, 'spares'), line(crackJs, /^const spareOf = .*$/m, 'spareOf'),
  cut(nestJs, '/** A home room\'s beds, one tier per spot', 'function settleHome()', 'the beds should sit in nest.js before settleHome'),
  cut(nestJs, 'function marketBeds()', '/** A new room comes with a moss cot', 'marketBeds should sit before buildRoom'),
  'Object.assign(this, { BED_TIERS, BED_STUFF, bedsOf, homeCap, nextBed, bedShort, buildBed, marketBeds });',
].join('\n');
const CRYSTALS = [{ id: 'amethyst', rarity: 'common' }, { id: 'quartz', rarity: 'common' }, { id: 'opal', rarity: 'rare' }];

/** A pretend nest with rooms (the nest, the garden outside, a playroom), what's in its pockets, and what was said; the snowfields
 *  open or not (snow). */
function shop(o = {}, { snow = false } = {}) {
  const did = { toasts: [], settled: 0 };
  const page = {
    save: { shards: 30, bars: { firefly: 2, nut: 1 }, geodes: {}, pantry: {}, creatures: [], rooms: [{ kind: 'nest', beds: ['cot'] }, { kind: 'yard' }, { kind: 'play', beds: ['cot'] }], room: 0, ...o },
    BARS: { firefly: { oil: 1 }, nut: { oil: 3 }, star: { oil: 5 } }, CRYSTALS,
    isPlace: i => page.save.rooms[i]?.kind === 'yard', tr: fill, ic: n => `[${n}]`, roomName: i => ['Nest', 'Garden', 'Playroom'][i],
    residents: r => page.save.creatures.filter(c => !c.out && (c.room || 0) === r), bedThumb: () => 'x.png', bedStyle: () => 'nest',
    sfx: { tick() {}, levelUp() {} }, buzz() {}, toast: t => did.toasts.push(t), settleHome: () => { did.settled++; return []; },
    persist() {}, syncActors() {}, renderNest() {}, updateTopbar() {}, $: () => ({ classList: { contains: () => true } }),
    placeOk: id => id === 'snow' ? snow : true, giveGlass: n => { page.save.frostglass = (page.save.frostglass || 0) + n; if (!page.save.frostglass) delete page.save.frostglass; },
  };
  vm.createContext(page);
  vm.runInContext(bedsSrc, page);
  return { page, did, save: page.save };
}

test('how many fit in a room is its beds\' places: a cot one, a bunk two, a nest-tree four; the map\'s places none', () => {
  const { page: p } = shop({ rooms: [{ kind: 'nest', beds: ['cot', 'bunk', 'tree'] }, { kind: 'yard', beds: ['tree'] }, { kind: 'play', beds: ['cot'] }, { kind: 'study' }] });
  assert.deepEqual([0, 1, 2, 3].map(i => p.homeCap(i)), [7, 0, 1, 0]);
  // (and a snow igloo six, the fourth bed, once the snowfields are open)
  assert.deepEqual(plain(p.BED_TIERS.map(t => t.id)), ['cot', 'bunk', 'tree', 'igloo']);
  assert.equal(shop({ rooms: [{ kind: 'nest', beds: ['igloo', 'tree'] }] }).page.homeCap(0), 10);
});

test('the first cot: a free spot, 40 shards and a snack bar (the smallest goes), and the nest sleeps two', () => {
  const s = shop({ shards: 58 });
  assert.deepEqual(plain(s.page.nextBed(0)), { spot: 1, tier: plain(s.page.BED_TIERS[0]), up: false });
  assert.equal(s.page.buildBed(0), true);
  assert.deepEqual(plain(s.save.rooms[0].beds), ['cot', 'cot']);
  assert.equal(s.page.homeCap(0), 2);
  assert.equal(s.save.shards, 18);
  assert.deepEqual(plain(s.save.bars), { firefly: 1, nut: 1 });
  assert.equal(s.did.settled, 1, 'an explorer waiting for a bed may come home');
  assert.deepEqual(s.did.toasts, ['A moss cot in the nest ✦ room for 2 there now']);
});

test('short of anything, nothing is built and nothing is taken; the shop says plainly what is missing', () => {
  const s = shop({ shards: 39, bars: { firefly: 0 } });
  assert.deepEqual(plain(s.page.bedShort(s.page.nextBed(0).tier.cost)), [['shards', 1], ['bar', 1]]);
  assert.equal(s.page.buildBed(0), false);
  assert.deepEqual([s.save.shards, plain(s.save.rooms[0].beds), s.did.toasts.length, s.did.settled], [39, ['cot'], 0, 0]);
  const html = s.page.marketBeds();
  assert.match(html, /data-bedbuild="0" disabled/);
  assert.match(html, /Still needed: ✦ 1, snack bar ×1 \(from daily tasks/);
  assert.doesNotMatch(html, /data-bedbuild="1"/, 'no beds for the garden outside');
  // with enough: the button is live and nothing is said to be missing
  const rich = shop({ shards: 500 }).page.marketBeds();
  assert.match(rich, /data-bedbuild="0" >/);
  assert.doesNotMatch(rich, /Still needed/);
});

test('three cots: the next is a bunk grown from one, for shards, a spare geode and garden produce; then a nest-tree', () => {
  const s = shop({ shards: 1000, rooms: [{ kind: 'nest', beds: ['cot', 'cot', 'cot'] }, { kind: 'yard' }], geodes: { amethyst: { count: 1 }, quartz: { count: 1 } }, pantry: { juice: 1, cookie: 9 } });
  const nb = s.page.nextBed(0);
  assert.deepEqual([nb.spot, nb.tier.id, nb.up, nb.from.id], [0, 'bunk', true, 'cot']);
  // the first of each kind stays in the book: no spare yet, and the shop's own cookies aren't the garden's
  assert.deepEqual(plain(s.page.bedShort(nb.tier.cost)), [['geode', 1], ['crop', 1]]);
  assert.equal(s.page.buildBed(0), false);
  Object.assign(s.save, { geodes: { amethyst: { count: 2 }, quartz: { count: 4 } }, pantry: { juice: 1, tea: 3, cookie: 9 } });
  assert.equal(s.page.buildBed(0), true);
  assert.deepEqual(plain(s.save.rooms[0].beds), ['bunk', 'cot', 'cot']);
  assert.equal(s.page.homeCap(0), 4);
  assert.deepEqual([s.save.shards, s.save.geodes.quartz.count, s.save.geodes.amethyst.count], [900, 3, 2], 'from the kind you have most of');
  assert.deepEqual(plain(s.save.pantry), { juice: 1, tea: 1, cookie: 9 }, 'the most plentiful of what the garden grew');
  assert.match(s.did.toasts[0], /^The bed in the nest grew into a bunk ✦ room for 4 there now$/);
  // the smallest bed grows next: the cots, then the bunks into nest-trees, and then it is as roomy as it gets
  for (const want of [['bunk', 'bunk', 'cot'], ['bunk', 'bunk', 'bunk'], ['tree', 'bunk', 'bunk'], ['tree', 'tree', 'bunk'], ['tree', 'tree', 'tree']]) {
    Object.assign(s.save, { shards: 1000, bars: { star: 1 }, geodes: { quartz: { count: 3 } }, pantry: { star: 3 } });
    assert.equal(s.page.buildBed(0), true, String(want));
    assert.deepEqual(plain(s.save.rooms[0].beds), want);
  }
  assert.equal(s.page.homeCap(0), 12);
  assert.equal(s.page.nextBed(0), null);
  assert.equal(s.page.buildBed(0), false);
  assert.match(s.page.marketBeds(), /as roomy as it gets/);
  assert.doesNotMatch(s.page.marketBeds(), /igloo/i, 'no igloo while the snowfields are shut');
});

test('once the snowfields are open, a nest-tree grows into a snow igloo for 6: shards, frostglass, spare geodes, produce and a bar', () => {
  const rich = () => ({ shards: 1000, frostglass: 40, bars: { firefly: 1, star: 1 }, geodes: { quartz: { count: 5 } }, pantry: { tea: 6 } });
  const s = shop({ ...rich(), rooms: [{ kind: 'nest', beds: ['tree', 'bunk', 'tree'] }, { kind: 'yard' }] }, { snow: true });
  // the smallest grows first still: the bunk into a nest-tree, and only then a nest-tree into an igloo
  assert.equal(s.page.nextBed(0).tier.id, 'tree');
  assert.equal(s.page.buildBed(0), true);
  const nb = s.page.nextBed(0);
  assert.deepEqual([nb.spot, nb.tier.id, nb.up, nb.from.id], [0, 'igloo', true, 'tree']);
  assert.deepEqual(plain(nb.tier.cost), { shards: 400, glass: 30, geode: 2, crop: 4, bar: 1 });
  Object.assign(s.save, rich());
  assert.equal(s.page.buildBed(0), true);
  assert.deepEqual(plain(s.save.rooms[0].beds), ['igloo', 'tree', 'tree']);
  assert.equal(s.page.homeCap(0), 14);
  assert.deepEqual([s.save.shards, s.save.frostglass, s.save.geodes.quartz.count, s.save.pantry.tea, s.save.bars.firefly], [600, 10, 3, 2, 0]);
  assert.equal(s.did.toasts.at(-1), 'The bed in the nest grew into a snow igloo ✦ room for 14 there now');
  // all three: 18, and then it is as roomy as it gets
  for (let k = 0; k < 2; k++) { Object.assign(s.save, rich()); assert.equal(s.page.buildBed(0), true); }
  assert.deepEqual(plain(s.save.rooms[0].beds), ['igloo', 'igloo', 'igloo']);
  assert.equal(s.page.homeCap(0), 18);
  assert.equal(s.page.nextBed(0), null);
  assert.match(s.page.marketBeds(), /as roomy as it gets/);
});

test('short of frostglass (or anything), no igloo: nothing is taken and the shop says what is missing; shut snowfields offer none', () => {
  const s = shop({ shards: 500, frostglass: 12, bars: { nut: 1 }, geodes: { quartz: { count: 3 } }, pantry: { tea: 4 }, rooms: [{ kind: 'nest', beds: ['tree', 'tree', 'tree'] }, { kind: 'yard' }] }, { snow: true });
  assert.deepEqual(plain(s.page.bedShort(s.page.nextBed(0).tier.cost)), [['glass', 18]]);
  assert.equal(s.page.buildBed(0), false);
  assert.deepEqual([s.save.shards, s.save.frostglass, plain(s.save.rooms[0].beds), s.did.toasts.length], [500, 12, ['tree', 'tree', 'tree'], 0]);
  const html = s.page.marketBeds();
  assert.match(html, /<span>\[igloo\]Next: nest-tree into a snow igloo:<\/span>/);
  assert.match(html, /\[glass\]12\/30/);
  assert.match(html, /Still needed: frostglass ×18 \(from Runa's ice hole in the snowfields\)/);
  assert.match(html, /data-bedbuild="0" disabled/);
  // an igloo already built (the snowfields were open then) stays, and sleeps its 6; but nothing grows past a nest-tree while they're shut
  const shut = shop({ shards: 1000, frostglass: 99, rooms: [{ kind: 'nest', beds: ['igloo', 'tree', 'tree'] }, { kind: 'yard' }] });
  assert.equal(shut.page.homeCap(0), 14);
  assert.equal(shut.page.nextBed(0), null);
});

test('the first cot fits the first session: a new nest\'s shards and one plain crack of level 1 pay for it', () => {
  const { save: fresh } = load(null), cot = shop().page.BED_TIERS[0].cost;
  // the shards for a geode (see showFound): the least a first clear gives is one star, no gems, no shine
  assert.match(line(crackJs, /let shards = 8 \+ stars \* 10 \+ .*$/m, 'showFound\'s shards'), /\(firstClear \? 10 : 0\)/);
  const least = 8 + 1 * 10 + 0 + 10;
  assert.ok(fresh.shards + least >= cot.shards, `${fresh.shards} + ${least} pays ${cot.shards}`);
  assert.deepEqual(Object.keys(cot).sort(), ['bar', 'shards'], 'and nothing a first session can\'t have');
  assert.ok(fresh.bars.firefly >= cot.bar);
});

// ---------- where a newcomer settles, with beds ----------

const settleSrc = [
  line(saveJs, /^const BED_PLACES = .*$/m, 'BED_PLACES'),
  cut(nestJs, 'const BEHAVIOR = {', '\n};', 'the kinds of glowling should be one list in nest.js') + '\n};',
  cut(nestJs, 'const TRIP_PLACES = [', '/** The send-off sheet', 'the expeditions should sit in nest.js, before their sheet'),
  cut(nestJs, '/** A home room\'s beds, one tier per spot', '/**\n * The beds Tansy', 'bedsOf and homeCap'),
  cut(nestJs, '/** How long a glowling\'s away when it sets off', '/** Someone had to go out', 'settleNew should sit in nest.js, before offerSpace'),
  cut(nestJs, '/** A glowling\'s diary keeps', '/** Its best friend', 'the diary should sit in nest.js, before bestFriend'),
].join('\n');
const ROOMS = ['Nest', 'Playroom', 'Moss garden'];
/** A pretend home: each room's beds, who lives where, the room you're in, whether Pip's camp is open. */
function home({ beds = [['cot']], room = 0, trail = false, creatures = [] } = {}) {
  const toasts = [], counts = {};
  const page = {
    save: { creatures, rooms: beds.map((b, i) => ({ kind: ['nest', 'play', 'garden'][i], beds: b })), room, active: creatures[0]?.id, shards: 0, geodes: {} },
    THEME: { amethyst: { name: 'Amethyst Hollow' }, glowcap: { name: 'Glowcap Wood' }, celestite: { name: 'Celestite Grotto' }, malachite: { name: 'Malachite Deep' }, labradorite: { name: 'Labradorite Vault' } },
    tr: fill, unlocked: () => true, specOf: () => ({ voice: 1 }), isPlace: () => false, placeOk: id => id !== 'trail' || trail,
    toast: t => { toasts.push(t); }, bump: (k, n = 1) => { counts[k] = (counts[k] || 0) + n; }, content: () => true, roomName: i => ROOMS[i],
    CRYSTALS: [{ id: 'c0', name: 'Stone', rarity: 'common' }], giveBar: () => {}, barName: b => b, seedName: s => s, garden: () => ({ seeds: {} }),
    addXP: () => {}, bringSpark: () => null, sparkNote: s => s, helperAt: () => false, persist: () => {}, updateTopbar: () => {}, settleHome: () => [],
  };
  page.atHome = () => true; page.nestRoom = () => 0; page.wardDone = () => false;
  page.roomOf = c => { const r = c.room || 0; return r < page.save.rooms.length ? r : 0; };
  page.residents = r => page.save.creatures.filter(c => !c.out && page.roomOf(c) === r);
  vm.createContext(page);
  vm.runInContext('Math.random = () => 0; const rand = (a, b) => a, pick = arr => arr[0];\n' + settleSrc, page);
  return { page, save: page.save, toasts };
}
const glow = (id, r, o = {}) => ({ id, name: 'G' + id, sp: 'mothlet', room: r, energy: 80, tummy: 70, joy: 80, born: id, ...o });
function hatch(h, id = 99) { const c = { id, name: 'New', sp: 'petalpuff', energy: 80, tummy: 70, joy: 80, born: Date.now() }; h.save.creatures.push(c); h.page.settleNew(c); return c; }

test('a new game: the first glowling takes the cot; the second, with no bed built, has the first one set off to make room', () => {
  const h = home();
  const first = hatch(h, 1);
  assert.deepEqual([first.room, !!first.out, h.toasts.length], [0, false, 0]);
  const second = hatch(h, 2);
  assert.ok(first.out && !second.out, 'one bed, one glowling at home');
  assert.equal(h.toasts[0], `Every room is full: ${first.name} went out exploring to make room`);
  // with a second cot built first, nobody has to go
  const b = home({ beds: [['cot', 'cot']] });
  hatch(b, 1); hatch(b, 2);
  assert.ok(b.save.creatures.every(c => !c.out));
});

test('the early game: two at home in two cots, a third with no bed: the second goes, never the very first', () => {
  // the second is the one you're looking after (a newcomer always is, see adopt), and still the first glowling stays
  const h = home({ beds: [['cot', 'cot']], creatures: [glow(1, 0), glow(2, 0)] });
  h.save.active = 2;
  const c = hatch(h, 3);
  assert.deepEqual(h.save.creatures.map(x => [x.id, !!x.out]), [[1, false], [2, true], [3, false]]);
  assert.equal(c.room, 0);
  // with someone else at home, neither the first nor the one you look after goes
  const k = home({ beds: [['cot', 'cot', 'cot']], creatures: [glow(1, 0), glow(2, 0), glow(4, 0)] });
  k.save.active = 2;
  hatch(k, 5);
  assert.deepEqual(k.save.creatures.filter(x => x.out).map(x => x.id), [4]);
});

test('a newcomer settles where a bed is free, room by room: the beds decide, not a fixed number', () => {
  // the nest's bunk full, the playroom's tree has room: it goes there, and says so
  const h = home({ beds: [['bunk'], ['tree']], creatures: [glow(1, 0), glow(2, 0), glow(3, 1)] });
  assert.equal(hatch(h).room, 1);
  assert.deepEqual(h.toasts, ['The nest is full, so New settled in the playroom ✦']);
  // a bigger bed in the nest: it stays in the nest
  const n = home({ beds: [['tree'], ['cot']], creatures: [glow(1, 0), glow(2, 0), glow(3, 1)] });
  assert.equal(hatch(n).room, 0);
  assert.deepEqual(n.toasts, []);
  // every bed taken in every room: someone makes room, and no room is over its beds after
  const f = home({ beds: [['bunk'], ['cot']], trail: true, creatures: [glow(1, 0), glow(2, 0), glow(3, 1)] });
  hatch(f);
  assert.equal(f.save.creatures.filter(c => c.out).length, 1);
  assert.deepEqual([0, 1].map(r => f.page.residents(r).length), [2, 1]);
});

// ---------- the words ----------

test('the first steps point to the first bed: Mossa after the first glowling, Tansy at her shop', () => {
  const talks = cut(crackJs, 'const TALKS = {', '\n};', 'TALKS');
  assert.match(cut(talks, 'firstPet:', '\n  firstGrow', 'firstPet'), /bed of its own.*Tansy builds beds.*"#worldTab"/);
  assert.match(cut(talks, 'firstBed:', '\n', 'firstBed'), /\[TANSY, "A bed, is it\?.*Renovation/);
  assert.match(cut(talks, 'firstBed:', '\n', 'firstBed'), /forty shards and one snack bar/, 'the price she says is the price');
  assert.match(nestJs, /if \(kind === "shop" && save\.creatures\.length && !talkSeen\("firstBed"\)\) setTimeout\(\(\) => talk\("firstBed"\)/);
  // the shop opens on its beds when every bed at home is taken
  assert.match(nestJs, /st\.tab = tab \|\| \(bedsFull\(\) \? "reno" : "food"\)/);
});

test('every word about beds is in Ukrainian too, and the help says what beds cost', () => {
  const i18n = read('i18n.js'), ui = read('ui.js');
  const has = s => i18n.includes(`  ${JSON.stringify(s)}: "`);
  for (const t of shop().page.BED_TIERS) { assert.ok(has(t.name), t.name); assert.ok(has(t.note), t.note); }
  for (const k of Object.values(shop().page.BED_STUFF)) { assert.ok(has(k.name) || k.name === 'shards', k.name); if (k.where) assert.ok(has(k.where), k.where); }
  const said = [...cut(nestJs, 'function marketBeds()', '/** A new room comes', 'marketBeds').matchAll(/tr\("((?:[^"\\]|\\.)*)"/g)].map(m => m[1]);
  for (const s of said) assert.ok(has(s), s);
  const faq = line(ui, /\["How do beds work\?", ".*"\],/, 'a help answer about beds');
  assert.match(faq, /moss cot sleeps 1 \(✦ 40 and a snack bar\).*bunk sleeps 2 \(✦ 100, a spare geode and 2 things grown in the garden\).*nest-tree sleeps 4 \(✦ 250, 2 spare geodes, 3 things from the garden and a snack bar\).*room for 3 beds/);
  assert.ok(has('How do beds work?'));
  assert.doesNotMatch(ui + nestJs, /make room for one more|NEST_UP_COST|nestUp/);
});
