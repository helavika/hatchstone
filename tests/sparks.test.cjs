const test = require('node:test');
const assert = require('node:assert/strict');
const { SPARKS, SPARK, SPARK_LANDS, sparkRoll, sparkSaveOf } = require('../js/sparks.js');

// a fixed run of "random" numbers, so a roll can be told what it will draw
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const all = () => Object.fromEntries(SPARKS.map(s => [s.id, { t: 1, by: 'Bo' }]));

test('eighteen sparks: six songs, six colours, six sights, two for each faraway land', () => {
  assert.equal(SPARKS.length, 18);
  for (const k of ['song', 'colour', 'sight']) assert.equal(SPARKS.filter(s => s.kind === k).length, 6);
  for (const land of Object.keys(SPARK_LANDS)) assert.equal(SPARKS.filter(s => s.land === land).length, 2);
  assert.equal(new Set(SPARKS.map(s => s.id)).size, 18);
  for (const s of SPARKS) {
    assert.ok(s.name && s.line, s.id);
    if (s.kind === 'song') assert.ok(s.notes.length >= 3 && s.root > 0 && s.beat > 0, s.id);
    if (s.kind === 'colour') assert.match(s.hex, /^#[0-9a-f]{6}$/, s.id);
    if (s.kind === 'sight') assert.ok(SPARK_LANDS[s.land], s.id);
  }
});

test('the first expedition always brings a spark; later ones more often the longer they are', () => {
  assert.ok(sparkRoll(1, {}, { trip: true, rnd: seq(0.99, 0) }));
  const one = { rain: { t: 1, by: 'Bo' } };
  // 1 h: about one in four
  assert.equal(sparkRoll(1, one, { trip: true, rnd: seq(0.3, 0) }), null);
  assert.ok(sparkRoll(1, one, { trip: true, rnd: seq(0.2, 0) }));
  // 8 h: most of the time
  assert.ok(sparkRoll(8, one, { trip: true, rnd: seq(0.8, 0) }));
  assert.equal(sparkRoll(8, one, { trip: true, rnd: seq(0.9, 0) }), null);
  // over many rolls, a long trip beats a short one
  let r = 7; const rnd = () => { r = (r + 0x6d2b79f5) | 0; let t = Math.imul(r ^ (r >>> 15), 1 | r); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rate = h => { let n = 0; for (let i = 0; i < 2000; i++) if (sparkRoll(h, one, { trip: true, rnd })) n++; return n / 2000; };
  assert.ok(rate(8) > rate(4) && rate(4) > rate(1));
});

test('never a spark already found, and nothing left to find means nothing', () => {
  const got = all(); delete got.lake;
  assert.equal(sparkRoll(8, got, { trip: true, rnd: seq(0, 0.99) }), 'lake');
  assert.equal(sparkRoll(8, all(), { trip: true, rnd: seq(0) }), null);
});

test('sights come only from long expeditions; a wander brings songs and colours, after an hour', () => {
  const one = { rain: { t: 1, by: 'Bo' } };
  for (let i = 0; i < 40; i++) {
    const k = i / 40;
    for (const id of [sparkRoll(1, one, { trip: true, rnd: seq(0, k) }), sparkRoll(20, one, { rnd: seq(0, k) })]) if (id) assert.notEqual(SPARK[id].kind, 'sight');
  }
  assert.equal(sparkRoll(0.5, {}, { rnd: seq(0) }), null);
  assert.ok(sparkRoll(2, {}, { rnd: seq(0) }));
  // a wander is never a sure thing, however long
  assert.equal(sparkRoll(100, {}, { rnd: seq(0.31, 0) }), null);
  const sights = new Set();
  for (let i = 0; i < 18; i++) { const id = sparkRoll(4, one, { trip: true, rnd: seq(0, i / 18) }); if (SPARK[id].kind === 'sight') sights.add(id); }
  assert.ok(sights.size > 0);
});

test('an old save without sparks loads with empty ones; a damaged one is cleaned up', () => {
  assert.deepEqual(sparkSaveOf(undefined), { got: {}, pip: 0, lands: {}, dye: null });
  assert.deepEqual(sparkSaveOf('nonsense'), { got: {}, pip: 0, lands: {}, dye: null });
  const s = sparkSaveOf({ got: { moss: { t: 5, by: 'Bo' }, nope: { t: 1 }, wave: { by: 'no time' }, lake: { t: 7, by: 42 } }, pip: 9, lands: { isle: true, mars: true, frost: 'yes' }, dye: 'moss' });
  assert.deepEqual(s.got, { moss: { t: 5, by: 'Bo' }, lake: { t: 7, by: '' } });
  assert.equal(s.pip, 2);
  assert.deepEqual(s.lands, { isle: true });
  assert.equal(s.dye, 'moss');
  // only a found colour can dye the scarves
  assert.equal(sparkSaveOf({ got: { lake: { t: 1 } }, dye: 'lake' }).dye, null);
  assert.equal(sparkSaveOf({ got: {}, dye: 'moss' }).dye, null);
  // a save from before Pip counted: he's already heard about what was found
  assert.equal(sparkSaveOf({ got: { moss: { t: 5 } } }).pip, 1);
  // loading twice changes nothing
  assert.deepEqual(sparkSaveOf(JSON.parse(JSON.stringify(s))), s);
});
