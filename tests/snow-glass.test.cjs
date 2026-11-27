const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { KEEPSAKES, keepsakePick, walkSaveOf, keepjarView } = require('../js/walk.js');

// The snowfields, step 2: frostglass (counted like shards, kept in the save), the ice hole (what it gives and how often, the
// first frost geode on the third cast, a catch tiring the one fishing), Runa's bench (four carvings, their prices, when she
// can't), the hot spring (its gentle effects, three at most) and their words in both languages.
const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };
const snow = read('snow.js'), saveJs = read('save.js'), dataJs = read('data.js'), nestJs = read('nest.js'), isoJs = read('iso.js');
const UK = new Map([...read('i18n.js').matchAll(/^ {2}("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),?$/gm)].map(m => [JSON.parse(m[1]), JSON.parse(m[2])]));
const both = (s, what) => { assert.equal(typeof s, 'string', what); assert.ok(UK.get(s), `no Ukrainian for ${JSON.stringify(s)}`); assert.notEqual(UK.get(s), s, what); };
const plain = v => JSON.parse(JSON.stringify(v));

const rules = [
  line(saveJs, /^const GLASS_MAX = .*$/m, 'GLASS_MAX should be one line in save.js'),
  line(saveJs, /^const glassSaveOf = .*$/m, 'glassSaveOf should be one line in save.js'),
  line(saveJs, /^const iceSaveOf = .*$/m, 'iceSaveOf should be one line in save.js'),
  cut(dataJs, 'const DECOR = [', 'if (LANG === "uk")', 'the furniture should be one list in data.js'),
  cut(snow, '// ---------- the rules ----------', '\nif (typeof module', 'the rules should sit at the top of snow.js'),
  'Object.assign(this, { GLASS_MAX, glassSaveOf, iceSaveOf, DECOR, glassNow, giveGlass, ICE_CATCH, ICE_BITE, ICE_GRAB, ICE_SURE, ICE_REST, ICE_TIRED, ICE_KEEPS, iceBiteIn, iceRoll, iceWhyNot, iceSave, iceCastCount, iceCatch, SPRING_MAX, SPRING_REST, SPRING_FUN, SPRING_GROW, springCan, springSoak, CARVINGS, carveWhyNot, carve });',
].join('\n');
/** A pretend snowfields: the save, and a note of what else was done (frost geodes given, xp, diary lines). */
function world(save = {}) {
  const did = { geodes: 0, xp: [], diary: [] };
  const page = {
    save: { shards: 0, decor: {}, walks: { found: {} }, creatures: [], rooms: [{ kind: 'nest' }, { kind: 'snow', place: true }], ...save },
    giveFrostGeode: n => { did.geodes += n; }, addXP: (c, n) => { did.xp.push([c.id, n]); }, remember: (c, k, ...a) => did.diary.push([c.id, k, ...a]),
    roomOf: c => c.room || 0, isPlace: i => !!page.save.rooms[i]?.place,
  };
  vm.runInNewContext(rules, page);
  return { page, did };
}
/** Dice that give these numbers in turn. */
const dice = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const glow = (id, o = {}) => ({ id, name: 'G' + id, level: 5, energy: 60, joy: 50, tummy: 80, ...o });

test('frostglass: counted like shards, given and spent, and kept whole in the save (older saves have none)', () => {
  const { page: g } = world();
  assert.equal(g.glassNow(), 0);
  assert.equal(g.giveGlass(3), 3); assert.equal(g.giveGlass(12), 15); assert.equal(g.giveGlass(-15), 0);
  assert.equal(g.save.frostglass, undefined, 'none left: nothing in the save');
  for (const [v, want] of [[undefined, 0], [null, 0], ['12', 12], [7.9, 7], [-4, 0], ['nonsense', 0], [1e12, g.GLASS_MAX]]) assert.equal(g.glassSaveOf(v), want, String(v));
  const mig = cut(saveJs, 'function migrate(d) {', '\n}\n', 'migrate');
  assert.match(mig, /const glass = glassSaveOf\(d\.frostglass\), ice = iceSaveOf\(d\.icehole\);/);
  assert.match(mig, /if \(glass\) d\.frostglass = glass; else delete d\.frostglass;/);
  // the hole's record: casts and whether it has given its frost geode, or nothing for a nest that never fished
  assert.equal(g.iceSaveOf(undefined), null); assert.equal(g.iceSaveOf([3]), null); assert.equal(g.iceSaveOf({ casts: 0 }), null);
  assert.deepEqual(plain(g.iceSaveOf({ casts: '4', geode: 'yes' })), { casts: 4, geode: false });
  assert.deepEqual(plain(g.iceSaveOf({ casts: 9.6, geode: true })), { casts: 9, geode: true });
});

test('the ice hole gives frostglass most of the time, now and then shards, a frost geode or a keepsake, in the design\'s odds', () => {
  const { page: g } = world();
  assert.deepEqual(plain(g.ICE_CATCH), [['glass', 70], ['shards', 15], ['geode', 8], ['keepsake', 7]]);
  const n = 40000, got = { glass: 0, shards: 0, geode: 0, keepsake: 0 }, amounts = { glass: new Set(), shards: new Set() }, ks = new Set();
  for (let i = 0; i < n; i++) { const r = g.iceRoll(10, true); got[r.what]++; if (amounts[r.what]) amounts[r.what].add(r.n); if (r.ks) ks.add(r.ks); }
  for (const [w, p] of g.ICE_CATCH) assert.ok(Math.abs(got[w] / n * 100 - p) < 1.5, `${w}: ${(got[w] / n * 100).toFixed(1)}% for ${p}%`);
  assert.deepEqual([...amounts.glass].sort(), [1, 2, 3]);
  assert.deepEqual([...amounts.shards].sort((a, b) => a - b), [5, 6, 7, 8, 9, 10]);
  assert.deepEqual([...ks].sort(), ['ptarmigan', 'snowflake']);
  // the float twitches 2 to 6 seconds after the cast, and there's about 0.8 s to pull
  assert.equal(g.iceBiteIn(() => 0), 2); assert.equal(g.iceBiteIn(() => 0.999999).toFixed(3), '6.000');
  assert.equal(g.ICE_GRAB, 0.8);
  // ~15 catches from a rested glowling make 20 to 25 glass on average (the design's session)
  const per = g.ICE_CATCH.find(c => c[0] === 'glass')[1] / 100 * 2;
  assert.ok(per * 15 > 19 && per * 15 < 26, `${per * 15} glass in 15 catches`);
});

test('the first frost geode is sure on the third cast ever (or the next catch, if that one got away), then it\'s luck', () => {
  const { page: g, did } = world();
  const low = () => 0.01; // (dice that would otherwise always give frostglass)
  assert.equal(g.iceRoll(1, false, low).what, 'glass');
  assert.equal(g.iceRoll(2, false, low).what, 'glass');
  assert.equal(g.iceRoll(3, false, low).what, 'geode');
  assert.equal(g.iceRoll(4, false, low).what, 'geode', 'the third got away: the next catch brings it');
  assert.equal(g.iceRoll(3, true, low).what, 'glass', 'one already came up by luck: nothing more is owed');
  // played through: three casts, the third caught, a geode on the shelf, and the hole remembers
  const cr = glow(1, { energy: 80 });
  for (let k = 1; k <= 2; k++) assert.equal(g.iceCatch(cr, g.iceCastCount(), low).what, 'glass');
  const third = g.iceCatch(cr, g.iceCastCount(), low);
  assert.equal(third.what, 'geode'); assert.equal(did.geodes, 1);
  assert.deepEqual(plain(g.save.icehole), { casts: 3, geode: true });
  assert.equal(g.iceCatch(cr, g.iceCastCount(), low).what, 'glass');
  // a lucky geode on the first cast counts as the first: the third cast is luck then
  const { page: h, did: hd } = world();
  const c2 = glow(2, { energy: 80 });
  assert.equal(h.iceCatch(c2, h.iceCastCount(), dice(0.88, 0.5)).what, 'geode');
  h.iceCastCount(); h.iceCastCount();
  assert.equal(h.iceCatch(c2, 3, low).what, 'glass');
  assert.equal(hd.geodes, 1);
});

test('each catch costs the one fishing 5 rest; under 20 it\'s tired and asks to stop; a miss costs nothing', () => {
  const { page: g } = world({ icehole: { casts: 9, geode: true } });
  assert.equal(g.ICE_REST, 5); assert.equal(g.ICE_TIRED, 20);
  const cr = glow(1, { energy: 34 }), low = () => 0.01;
  let r = g.iceCatch(cr, 10, low);
  assert.equal(cr.energy, 29); assert.equal(r.tired, false);
  r = g.iceCatch(cr, 11, low); assert.equal(cr.energy, 24); assert.equal(r.tired, false);
  r = g.iceCatch(cr, 12, low); assert.equal(cr.energy, 19); assert.equal(r.tired, true, 'under 20: it yawns');
  assert.equal(g.iceWhyNot(cr), 'tired');
  assert.equal(g.save.frostglass, 3);
  // a cast is counted, but a miss takes nothing from anyone (the cast count is all that changes)
  const before = JSON.stringify(cr); g.iceCastCount(); assert.equal(JSON.stringify(cr), before);
  // who can't fish at all: asleep, out in the valley or away, nobody
  assert.equal(g.iceWhyNot(glow(2, { sleeping: true })), 'asleep');
  assert.equal(g.iceWhyNot(glow(3, { out: true })), 'out');
  assert.equal(g.iceWhyNot(null), 'none');
  assert.equal(g.iceWhyNot(glow(4)), null);
  // a keepsake goes into the jar's count, and a nest without the jar gets one, waiting in the chest
  const k = g.iceCatch(glow(5, { energy: 90 }), 20, dice(0.99, 0.2));
  assert.equal(k.what, 'keepsake'); assert.equal(k.ks, 'snowflake');
  assert.equal(g.save.walks.found.snowflake, 1); assert.equal(g.save.decor.keepjar.on, false);
});

test('the hole\'s keepsakes are their own: a snowflake in ice and a ptarmigan feather, never found on the valley\'s walks', () => {
  const snowKs = KEEPSAKES.filter(k => k.snow).map(k => [k.id, k.kind]);
  assert.deepEqual(snowKs, [['ptarmigan', 'feather'], ['snowflake', 'ice']]);
  for (let i = 0; i < 300; i++) for (const kind of ['feather', 'flower']) { const id = keepsakePick(kind, {}, Math.random); assert.ok(!KEEPSAKES.find(k => k.id === id).snow, id); }
  // an old save's feathers are shared out among the valley's own, not the ptarmigan's
  assert.ok(!walkSaveOf({ keep: { feather: 12 } }).found.ptarmigan);
  // the jar never holds more than eight stems, with every kind there is found
  assert.equal(keepjarView(Object.fromEntries(KEEPSAKES.map(k => [k.id, 1]))).stems.length, 8);
  // their pictures and words
  assert.match(snow, /ks_snowflake: \[/); assert.match(snow, /ks_ptarmigan: PX_ICON_MAPS\.feather/);
  for (const k of KEEPSAKES.filter(k => k.snow)) both(k.name);
});

test('Runa\'s bench: four carvings at the design\'s prices, kept out of the shop, placed like any furniture (the window on a wall)', () => {
  const { page: g } = world({ shards: 100, frostglass: 30 });
  assert.deepEqual(plain(g.CARVINGS.map(d => [d.id, d.glass, d.cost, d.lovers])), [
    ['icelantern', 12, 20, ['flutter']], ['snowfigure', 20, 30, ['curious', 'dance']], ['frostwin', 15, 25, ['curious', 'nap']], ['iceslide', 25, 40, ['hop']]]);
  assert.ok(g.CARVINGS.every(d => d.iso && d.carved));
  assert.equal(g.CARVINGS.find(d => d.id === 'frostwin').wall, true);
  assert.deepEqual(plain(g.CARVINGS.find(d => d.id === 'iceslide').rooms), ['play', 'nest']);
  // she can't: not enough glass, not enough shards, or it's yours already
  const D = id => g.CARVINGS.find(d => d.id === id);
  assert.equal(g.carveWhyNot(D('iceslide')), null);
  assert.equal(g.carve('iceslide'), true);
  assert.equal(g.save.frostglass, 5); assert.equal(g.save.shards, 60);
  assert.deepEqual(Object.keys(g.save.decor), ['iceslide']); assert.equal(g.save.decor.iceslide.on, false, 'it waits in the chest');
  assert.equal(g.carveWhyNot(D('iceslide')), 'have'); assert.equal(g.carve('iceslide'), false);
  assert.equal(g.carveWhyNot(D('icelantern')), 'glass'); assert.equal(g.carve('icelantern'), false);
  g.save.frostglass = 50; g.save.shards = 10;
  assert.equal(g.carveWhyNot(D('icelantern')), 'shards');
  assert.equal(g.save.frostglass, 50, 'a refusal spends nothing');
  assert.equal(g.carve('lamp'), false, 'only what she carves');
  // the shop never sells them; each has a place in the room and a picture (the window hangs on a wall slot of its own)
  assert.match(nestJs, /&& !d\.found && !d\.carved :/);
  assert.match(line(isoJs, /^const WALL_ITEMS = .*$/m, 'WALL_ITEMS'), /frostwin: \{ wall: "R", s: 2\.7 \}/);
  for (const id of ['icelantern', 'snowfigure', 'iceslide']) assert.match(isoJs, new RegExp(`^  ${id}: \\{ fw: \\d, fd: 1, at: `, 'm'));
  for (const d of g.CARVINGS) { assert.match(isoJs, new RegExp(`^  ${d.id}\\(t, T, ax, ay\\) \\{`, 'm')); both(d.name); both(d.verb); assert.match(nestJs, new RegExp(`${d.id}: "(light|pretty|play|comfort)"`)); }
  assert.match(isoJs, /if \(hasDecor\("frostwin"\)\) items\.push\(\{ y: -2, draw: drawFrostWin \}\);/);
  // hoppers go down the slide: up the steps, over the top, whoosh
  assert.match(isoJs, /else if \(a\.decor === "iceslide" && isoLayout\(\)\.placed\.iceslide\)/);
});

test('the hot spring: three at most, awake and from home; rest +15, fun +10, +5 toward growing; a meeting for each pair', () => {
  const { page: g, did } = world();
  assert.deepEqual([g.SPRING_MAX, g.SPRING_REST, g.SPRING_FUN, g.SPRING_GROW], [3, 15, 10, 5]);
  const a = glow(1, { energy: 40, joy: 95 }), b = glow(2, { energy: 92, pals: { 1: 4 } }), c = glow(3), d = glow(4);
  const went = g.springSoak([a, b, c, d]);
  assert.deepEqual(went.map(x => x.id), [1, 2, 3], 'the fourth waits');
  assert.deepEqual([a.energy, a.joy, b.energy, b.joy, c.energy, c.joy], [55, 100, 100, 60, 75, 60]);
  assert.deepEqual(did.xp, [[1, 5], [2, 5], [3, 5]]);
  assert.equal(d.energy, 60); assert.equal(d.pals, undefined);
  assert.deepEqual(plain(a.pals), { 2: 1, 3: 1 }); assert.deepEqual(plain(c.pals), { 1: 1, 2: 1 });
  // the fifth meeting makes friends, as anywhere
  assert.equal(b.pals[1], 5); assert.deepEqual(did.diary, [[2, 'Became friends with {0} ♥', 'G1']]);
  // no daily limit: in again straight away
  assert.equal(g.springSoak([a]).length, 1); assert.equal(a.energy, 70);
  // asleep, out in the valley, or living at a place: not from home
  g.save.rooms.push({ kind: 'forge', place: true });
  assert.deepEqual(g.springSoak([glow(5, { sleeping: true }), glow(6, { out: true }), glow(7, { room: 2 })]), []);
});

test('in the snowfields: Runa\'s buttons as you go, the expedition\'s frostglass, and every new word in Ukrainian', () => {
  // her bar: fish, carve, the spring, the settlement, and a frost geode to crack when there is one; while fishing, the rod's own buttons
  const page = { fishing: null, geodes: 0, tr: s => s.replace('{0}', '·'), frostGeodes: () => page.geodes, iceNow: () => page.fishing, startFishing() {}, openCarving() {}, openSpring() {}, openSettle() {}, iceStop() {}, startFrost() {}, iceCast() {}, icePull() {} };
  vm.runInNewContext(cut(snow, 'function snowActs() {', '\n}\n', 'snowActs') + '\n}\nthis.snowActs = snowActs;', page);
  const names = () => plain(page.snowActs().map(a => a[1]));
  assert.deepEqual(names(), ['Fish', 'Carving', 'Hot spring', 'Settlement']);
  page.geodes = 2; assert.deepEqual(names(), ['Fish', 'Carving', 'Hot spring', 'Settlement', 'Crack a frost geode (·)']);
  page.fishing = { phase: 'sit' }; assert.deepEqual(names(), ['Cast', 'Stop']);
  page.fishing = { phase: 'bite' }; assert.deepEqual(names(), ['Pull!', 'Stop']); assert.equal(page.snowActs()[0][3], 'bite');
  page.fishing = { phase: 'tired', id: 1 }; assert.deepEqual(names(), ['Home', 'Hot spring']);
  // the expedition to the snowfields brings frostglass too, and says so
  assert.match(nestJs, /finds: \["glass", "frost", "shards"\]/);
  assert.match(nestJs, /else if \(f === "glass"\) \{ const n = Math\.max\(1, Math\.round\(\(k \+ rand\(0, k\)\) \* part\)\); giveGlass\(n\);/);
  // the Chest's treasures show the frostglass, the place's plaque too
  assert.match(nestJs, /glassNow\(\) \? chip\(`<img class="em px-thumb" src="\$\{pxIcon\("glass"\)\}" alt="">`, tr\("Frostglass"\), glassNow\(\)\)/);
  assert.match(nestJs, /\+ \(kind === "snow" \? snowWho\(\) : ""\)/);
  // every line the snowfields' new doings say, in both languages (tr("...") and Runa's lines given to runaSays)
  const said = new Set([...snow.matchAll(/\btr\("((?:[^"\\]|\\.)*)"/g), ...snow.matchAll(/runaSays\((?:pick\(\[)?((?:"(?:[^"\\]|\\.)*",? ?)+)/g)].flatMap(m => m[0].startsWith('tr') ? [JSON.parse(`"${m[1]}"`)] : [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(x => JSON.parse(`"${x[1]}"`))));
  assert.ok(said.size > 40, `${said.size} lines`);
  for (const s of said) both(s);
  for (const s of ['frostglass ×{0}', 'Crack a frost geode ({0})', 'Warm at last: {0} · rest +{1}, fun +{2} ✦']) assert.match(UK.get(s), /\{0\}/);
  // (glowlings are neuter in Ukrainian; Runa is feminine; the player is never given a gender)
  assert.match(UK.get('{0} is too sleepy to fish. Home to bed, or a warm in the spring?'), /надто сонне/);
  for (const s of said) assert.doesNotMatch(UK.get(s), /\b(прийшов|прийшла|готовий|готова|втомився|втомилася|сонний|сонна)\b/, s);
});
