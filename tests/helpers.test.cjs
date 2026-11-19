const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Grown glowlings who go out into the valley and help (#309): who may go and when it wishes to, two at a place at most,
// what each place's help does, coming home, and the save (helpersSaveOf in save.js) for older and broken nests.
const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };
const nest = read('nest.js'), save = read('save.js'), data = read('data.js');
const helpersSrc = cut(nest, '// ---------- helpers:', '// ---------- a glowling\'s own card', 'the helpers should sit together in nest.js');
const saveSrc = cut(save, '/** The places a grown glowling can go out to help', '/** Older saves get whatever newer versions added', 'helpersSaveOf should sit before migrate in save.js');
const DAY = 864e5;

/** A pretend nest: its glowlings (all at home in room 0 unless out), the places open on the map, today's day number. */
function valley(creatures, { open = ['trail', 'garden', 'lab', 'forge', 'shop'], cap = 5, today = 20000, random = 0.5 } = {}) {
  const said = [], tracked = [];
  const page = {
    save: { creatures, rooms: [{ kind: 'nest' }, { kind: 'yard', place: true }], shards: 0, pantry: {}, active: creatures[0]?.id },
    game: {}, today, INCUBATE_MS: 3 * 3600e3,
    SNACKS: { cookie: { emoji: '🍪', name: 'Stardust cookie' }, juice: { emoji: '🧃' }, berry: { emoji: '🫐' } },
    Math: Object.assign(Object.create(Math), { random: () => page.random }), random,
    dayNo: () => page.today, placeOk: id => open.includes(id), moodOf: cr => cr.mood || 'happy',
    remember: (cr, k, ...a) => { (cr.mem = cr.mem || []).push({ k, a }); }, track: (n, d) => tracked.push([n, d]),
    tr: (s, ...a) => s.replace(/\{(\d)\}/g, (_, i) => a[i]), toast: t => said.push(t), persist() {}, updateTopbar() {}, syncActors() {},
    sfx: { chirp() {}, tick() {} }, specOf: () => ({ voice: 1 }), pick: a => a[0],
    roomOf: c => c.room || 0, isPlace: i => !!page.save.rooms[i]?.place, homeCap: () => cap,
    residents: r => page.save.creatures.filter(c => !c.out && (c.room || 0) === r),
    seedName: id => id, garden: () => page.save.garden, waterPlot: (i, who) => { const q = page.save.garden.slots[i]; if (q.wet) return false; q.wet = who.id; return true; },
    tripFind: (f, k, got) => { if (f === 'shards') got.push('✦ 5'); else if (page.lucky) got.push(f); },
  };
  vm.createContext(page);
  vm.runInContext([line(data, /^const idHash = .*$/m, 'idHash'), line(data, /^const stageOf = .*$/m, 'stageOf'), saveSrc, helpersSrc,
    'Object.assign(this, { HELP_KINDS, HELP_MAX, HELP_PLACES, HELP_STAGE, WISH_EVERY, HELP_HARVEST, HELP_HATCH, HELP_FORGE, HELP_GIFT, helpersSaveOf, helpersAt, helperAt, canHelp, helpOpen, wishDayOf, wantsOut, wishing, noteWish, sendHelper, helperHome, scoutFind, harvestMore, helperWater, incubateMs, forgePrice, shopGift });'].join('\n'), page);
  return { page, said, tracked };
}
const glow = (id, level, o = {}) => ({ id, level, name: 'G' + id, tummy: 80, joy: 80, energy: 80, ...o });
/** A day this glowling dreams of the valley, and one it doesn't. */
const dayFor = (p, cr, want) => { for (let d = 20000; ; d++) if (p.wishDayOf(cr, d) === want) return d; };

test('only a grown glowling may go (level 10 and up), from home, never the last one at home', () => {
  const { page: p } = valley([glow(1, 9), glow(2, 10), glow(3, 15), glow(4, 12, { out: true, roam: true }), glow(5, 12, { trip: { place: 'x' }, out: true })]);
  assert.equal(p.HELP_STAGE, 2);
  assert.deepEqual(p.save.creatures.map(c => p.canHelp(c)), [false, true, true, false, false]);
  // alone at home: it stays
  const { page: q } = valley([glow(1, 12), glow(2, 3, { out: true, roam: true })]);
  assert.equal(q.canHelp(q.save.creatures[0]), false);
  assert.equal(q.sendHelper(1, 'camp'), false);
});

test('the wish: on about one day in three, never more than once a day, only at home, awake and happy', () => {
  const { page: p } = valley([glow(1, 12), glow(2, 12), glow(3, 3)]);
  const cr = p.save.creatures[0];
  // about a third of the days over a year, for each of a few glowlings, and the same all day
  for (const c of [cr, glow(7, 10), glow(42, 14)]) {
    const n = Array.from({ length: 365 }, (_, d) => p.wishDayOf(c, 20000 + d)).filter(Boolean).length;
    assert.ok(n > 365 / p.WISH_EVERY * 0.7 && n < 365 / p.WISH_EVERY * 1.3, `${n} wish days in a year`);
  }
  p.today = dayFor(p, cr, false);
  assert.equal(p.wantsOut(cr), false, 'not its day');
  p.today = dayFor(p, cr, true);
  assert.equal(p.wantsOut(cr), true);
  for (const [k, v] of [['sleeping', true], ['mood', 'hungry'], ['mood', 'sad'], ['level', 9]]) assert.equal(p.wantsOut({ ...cr, [k]: v }), false, `${k} ${v}`);
  // noted once that day: a diary line and the wish on its card; seen again that day, no new line
  assert.equal(p.noteWish(cr), true);
  assert.equal(p.noteWish(cr), false);
  assert.equal(cr.mem.length, 1);
  assert.match(cr.mem[0].k, /valley/);
  assert.equal(p.wishing(cr), true);
  p.today += 1;
  assert.equal(p.wishing(cr), false, 'the next day the card is quiet again');
  // nowhere open on the map: no wish
  const { page: shut } = valley([glow(1, 12), glow(2, 12)], { open: [] });
  shut.today = dayFor(shut, shut.save.creatures[0], true);
  assert.equal(shut.wantsOut(shut.save.creatures[0]), false);
});

test('going out: it lives at the place, isn\'t at home and needs nothing; two at a place at most; counted for the stats', () => {
  const { page: p, tracked } = valley([glow(1, 12), glow(2, 12), glow(3, 12), glow(4, 2)]);
  p.save.creatures[0].wishDay = p.today;
  assert.equal(p.sendHelper(1, 'camp'), true);
  const c = p.save.creatures[0];
  assert.deepEqual(c.job.place, 'camp');
  assert.equal(c.job.met, false);
  assert.ok(c.out && c.roam, 'out, so applyTime leaves its needs be and the nest doesn\'t count it');
  assert.equal(c.wishDay, undefined, 'the wish came true');
  assert.equal(p.residents(0).length, 3);
  assert.notEqual(p.save.active, 1, 'you look after someone at home now');
  assert.match(c.mem.at(-1).k, /Pip/);
  assert.equal(JSON.stringify(tracked), JSON.stringify([['helper', { place: 'camp' }]]));
  assert.equal(p.sendHelper(2, 'camp'), true);
  assert.equal(p.helpersAt('camp').length, p.HELP_MAX);
  assert.equal(p.sendHelper(3, 'camp'), false, 'the camp is full');
  assert.ok(!p.helpOpen().includes('camp'));
  assert.equal(p.sendHelper(3, 'grotto'), false, 'the grotto takes no helpers');
  // a place not open on the map yet takes nobody
  const { page: q } = valley([glow(1, 12), glow(2, 12)], { open: ['shop'] });
  assert.equal(q.sendHelper(1, 'lab'), false);
  assert.equal(q.sendHelper(1, 'shop'), true);
});

test('the help is small and the same with one helper or two', () => {
  const { page: p } = valley([glow(1, 12), glow(2, 12), glow(3, 12)]);
  const H = 3 * 3600e3;
  // none yet: everything as before
  assert.equal(p.incubateMs(), H);
  assert.equal(p.forgePrice(90), 90);
  for (const [kind, check] of [
    ['lab', () => assert.equal(p.incubateMs(), H * 0.75)],
    ['forge', () => { assert.equal(p.forgePrice(90), 81); assert.equal(p.forgePrice(30), 27); assert.equal(p.forgePrice(45), 41); }],
  ]) {
    p.sendHelper(1, kind); check();
    p.sendHelper(2, kind); check();
    p.helperHome(1); p.helperHome(2); p.save.creatures.forEach(c => { c.mem = []; });
  }
  assert.deepEqual([p.HELP_HATCH, p.HELP_FORGE], [0.25, 0.1]);
});

test('the scout: every expedition brings back one more find (shards, when the place\'s own turns up nothing)', () => {
  const { page: p } = valley([glow(1, 12), glow(2, 12)]);
  const pl = { finds: ['geode0', 'shards'] };
  p.lucky = true;
  assert.deepEqual([...p.scoutFind(pl, 4)], ['+geode0']);
  p.lucky = false;
  assert.deepEqual([...p.scoutFind(pl, 4)], ['+✦ 5']);
  // and the expeditions really ask for it, once for each one that comes home
  const home = cut(nest, 'function tripsHome(', '\n}\n', 'tripsHome');
  assert.match(home, /if \(x === c && helperAt\("camp"\)\) got\.push\(\.\.\.scoutFind\(pl, k\)\);/);
});

test('the gardener waters every thirsty plant by itself, and now and then a harvest gives one more', () => {
  const { page: p, said } = valley([glow(1, 12), glow(2, 12)]);
  p.save.garden = { slots: [{ seed: 'glowberry' }, null, { seed: 'moonmint', wet: 1 }] };
  assert.equal(p.helperWater(), 0, 'nobody at the garden yet');
  p.sendHelper(1, 'yard');
  assert.equal(p.helperWater(), 1);
  assert.equal(p.save.garden.slots[0].wet, 1, 'watered by the helper (through waterPlot, so once per plant per half hour)');
  assert.match(said.at(-1), /G1 watered the glowberry/);
  assert.equal(p.helperWater(), 0);
  const berry = { gives: { pantry: { juice: 2, berry: 1 } } }, bloom = { gives: { shards: 45 } };
  p.random = p.HELP_HARVEST - 0.01;
  assert.equal(p.harvestMore(berry), '+🧃×1');
  assert.equal(p.save.pantry.juice, 1);
  assert.equal(p.harvestMore(bloom), '+✦ 12');
  p.random = p.HELP_HARVEST;
  assert.equal(p.harvestMore(berry), null, 'only a quarter of the time');
  for (const [fn, re] of [['pickPlot', /const more = harvestMore\(sd\);/], ['openGarden', /helperWater\(\);/], ['tellTrips', /helperWater\(\);/]]) assert.match(cut(nest, `function ${fn}(`, '\n}\n', fn), re, fn);
});

test('the lab, the forge and the shop ask for their helper where they work', () => {
  const play = read('play.js'), crack = read('crack.js');
  assert.match(cut(play, 'function layEgg(', '\n}\n', 'layEgg'), /const span = incubateMs\(\);[\s\S]*due: now \+ span, span/);
  for (const fn of ['function openForge(', 'function buyForge(']) assert.match(cut(crack, fn, '\n}\n', fn), /forgePrice\(f\.cost\[l\]\)/);
  assert.match(line(crack, /^const canForge = .*$/m, 'canForge'), /forgePrice/);
  assert.match(cut(nest, 'function arriveAt(', '\n}\n', 'arriveAt'), /kind === "shop" && shopGift\(\)/);
});

test('Tansy\'s helper puts a small gift by once a day: shards one day, a cookie the next', () => {
  const { page: p } = valley([glow(1, 12), glow(2, 12)]);
  assert.equal(p.shopGift(), null, 'nobody behind the counter yet');
  p.sendHelper(1, 'shop');
  p.today = 20000;
  assert.equal(p.shopGift().what, `✦ ${p.HELP_GIFT}`);
  assert.equal(p.save.shards, 6);
  assert.equal(p.shopGift(), null, 'once a day');
  p.today = 20001;
  assert.match(p.shopGift().what, /🍪/);
  assert.equal(p.save.pantry.cookie, 1);
  assert.equal(p.save.shards, 6);
});

test('coming home: to a room with a bed free, with a line in its diary; with every room full it stays and says so', () => {
  const { page: p, said } = valley([glow(1, 12), glow(2, 12), glow(3, 4)], { cap: 3 });
  p.sendHelper(1, 'forge');
  p.save.creatures.push(glow(4, 2));
  assert.equal(p.helperHome(1), false);
  assert.match(said.at(-1), /No bed free/);
  assert.ok(p.save.creatures[0].job);
  p.save.creatures.pop();
  assert.equal(p.helperHome(1), true);
  const c = p.save.creatures[0];
  assert.equal(c.job, undefined);
  assert.deepEqual([c.out, c.roam, c.room], [false, false, 0]);
  assert.match(c.mem.at(-1).k, /Came home/);
  assert.equal(p.helperHome(1), false, 'already home');
});

test('a save from before the helpers is left as it was; a broken or crowded one is put right', () => {
  const { page: p } = valley([]);
  const old = [glow(1, 12), glow(2, 12, { out: true, roam: true, outAt: 5 }), glow(3, 4, { out: true, trip: { place: 'amethyst' } })];
  const before = JSON.stringify(old);
  p.helpersSaveOf(old);
  assert.equal(JSON.stringify(old), before);
  const odd = [
    glow(1, 12, { job: { place: 'camp', since: 100 }, out: true, roam: true }),
    glow(2, 12, { job: { place: 'camp' } }),
    glow(3, 12, { job: { place: 'camp', since: 1 }, out: true, roam: true }),
    glow(4, 12, { job: { place: 'moon' }, out: true, roam: true }),
    glow(5, 12, { job: 'lab', out: true }),
    glow(6, 12, { job: null, out: true, roam: true }),
    glow(7, 12, { wishDay: 'today' }),
    glow(8, 12, { wishDay: 20000 }),
  ];
  p.helpersSaveOf(odd);
  const [a, b, c, d, e, f, g, h] = odd;
  assert.deepEqual(JSON.parse(JSON.stringify(a.job)), { place: 'camp', since: 100, met: false });
  assert.ok(Number.isFinite(b.job.since) && b.out && b.roam, 'a job is always out and roaming');
  assert.equal(c.job, undefined, 'a third helper at the camp comes home');
  assert.deepEqual([c.out, d.out, e.out], [false, false, false]);
  assert.deepEqual([d.job, e.job], [undefined, undefined]);
  assert.ok(!('job' in f) && f.out && f.roam, 'no job (null): an explorer stays an explorer');
  assert.equal(g.wishDay, undefined);
  assert.equal(h.wishDay, 20000);
  // and again: nothing more changes
  const once = JSON.stringify(odd);
  p.helpersSaveOf(odd);
  assert.equal(JSON.stringify(odd), once);
  // migrate runs it on every save it loads
  assert.match(cut(save, 'function migrate(d)', '\n}\n', 'migrate'), /helpersSaveOf\(d\.creatures\);/);
  assert.deepEqual([...p.HELP_KINDS].sort(), Object.keys(p.HELP_PLACES).sort(), 'the save knows every place a helper can go');
});

test('each keeper says welcome in their own voice; every helper line has its Ukrainian', () => {
  const UK = new Map([...read('i18n.js').matchAll(/^ {2}("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),?$/gm)].map(m => [JSON.parse(m[1]), JSON.parse(m[2])]));
  const heroes = { pxPortrait: () => '', PX_ICON_MAPS: {} };
  vm.runInNewContext(cut(nest, 'const TANSY = ', '// ---------- errands', 'the keepers should sit in nest.js') + '\nthis.HEROES = HEROES;', heroes);
  const MOODS = { shop: ['businesslike', 'pleased', 'flustered', 'doubtful', 'dreamy'], forge: ['steady', 'satisfied', 'focused', 'concern', 'laugh'], camp: ['alert', 'excited', 'scared-but-steady', 'thinking', 'shy-pride'], lab: ['attentive', 'curious', 'delighted', 'concerned', 'alarmed'], yard: ['content', 'listening', 'shy', 'glad', 'worried'] };
  const { page: p } = valley([]);
  for (const [kind, h] of Object.entries(p.HELP_PLACES)) {
    const [mood, words] = heroes.HEROES[kind].welcome;
    assert.ok(MOODS[kind].includes(mood), `${kind}: ${mood}`);
    assert.match(words, /\{0\}/, `${kind}: the welcome names the helper`);
    for (const w of [words, h.job, h.help, h.went, ...h.says]) assert.ok(UK.get(w), `${kind}: no Ukrainian for ${JSON.stringify(w)}`);
    for (const w of [words, h.job, h.help, h.went, ...h.says]) assert.equal((UK.get(w).match(/\{0\}/g) || []).length, (w.match(/\{0\}/g) || []).length, w);
  }
  // Ember is "she" in Ukrainian: nothing of hers says otherwise
  assert.doesNotMatch(UK.get(p.HELP_PLACES.forge.went) + UK.get(p.HELP_PLACES.forge.job), /для Ембера|в Ембера/);
});
