const test = require('node:test');
const assert = require('node:assert/strict');
const { WALKS, WALK_FINDS, WALK_SPOTS, WALK_SHAPE, KEEPSAKES, KEEP_WEAR, walkSaveOf, walkMood, walkPlan, keepsakePick, keepjarView, jarOf, keepWearPlan } = require('../js/walk.js');

// a fixed run of "random" numbers
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('four paths, each a little longer, each with its own shape and spots', () => {
  assert.equal(WALKS.length, 4);
  for (let i = 1; i < WALKS.length; i++) assert.ok(WALKS[i].len > WALKS[i - 1].len, WALKS[i].id);
  assert.equal(WALK_SPOTS.length, WALKS.length);
  assert.equal(WALK_SHAPE.length, WALKS.length);
  // every path has the hill with the thorn on it; the new thing comes in order: the stream, the dark, the climb
  for (const sh of WALK_SHAPE) assert.ok(sh.hill);
  assert.ok(WALK_SHAPE[1].stream && WALK_SHAPE[2].dark && WALK_SHAPE[3].ledge);
});

test('a walk finds three to five things, the must-haves always among them', () => {
  for (let p = 0; p < WALKS.length; p++) for (const r of [0, 0.3, 0.6, 0.99]) {
    const plan = walkPlan(p, seq(r, 0.5, 0.1, 0.9));
    assert.equal(plan.length, WALKS[p].finds);
    assert.ok(plan.length >= 3 && plan.length <= 5);
    for (const f of plan) assert.ok(WALK_FINDS[f.kind], f.kind);
    for (const s of WALK_SPOTS[p].filter(s => s.must)) assert.ok(plan.some(f => f.u === s.u && f.kind === s.kind));
    // in order along the path
    assert.deepEqual(plan.map(f => f.u), plan.map(f => f.u).slice().sort((a, b) => a - b));
  }
  // the hollow always hides a spark; the stream always a pebble on its stone
  assert.ok(walkPlan(2).some(f => f.kind === 'spark' && f.at === 'dark'));
  assert.ok(walkPlan(1).some(f => f.kind === 'pebble' && f.at === 'stone'));
});

test('an old save gets walks; a broken one is mended, never thrown away', () => {
  assert.deepEqual(walkSaveOf(undefined), { open: 1, n: 0, best: {}, keep: {}, found: {}, used: {}, last: 0 });
  assert.deepEqual(walkSaveOf('nonsense'), { open: 1, n: 0, best: {}, keep: {}, found: {}, used: {}, last: 0 });
  const w = walkSaveOf({ open: 9, n: 3.7, best: { meadow: 3, stream: -1, nowhere: 4 }, keep: { feather: 2, flower: 'x', rock: 5 }, last: 123 });
  assert.equal(w.open, WALKS.length);
  assert.equal(w.n, 3);
  assert.deepEqual(w.best, { meadow: 3 });
  assert.deepEqual(w.keep, { feather: 2 });
  assert.equal(Object.values(w.found).reduce((a, b) => a + b, 0), 2, 'the two feathers are in the jar');
  assert.equal(w.last, 123);
  assert.deepEqual(walkSaveOf(w), w);
  assert.equal(walkSaveOf({ open: 0 }).open, 1);
});

test('a walk gives joy and takes a little energy, more of both the further it goes', () => {
  const a = walkMood(0, 0, false), b = walkMood(3, 5, true);
  assert.ok(a.joy > 0 && a.energy > 0);
  assert.ok(b.joy > a.joy && b.energy > a.energy);
  assert.ok(b.joy <= 40 && b.energy <= 20, 'never too much');
  assert.ok(walkMood(0, 2, true).joy > walkMood(0, 2, false).joy, 'freeing the thorn\'s light is a little extra joy');
});

test('never more than one spark on a walk', () => {
  for (let p = 0; p < WALKS.length; p++) assert.ok(walkPlan(p, () => 0.01).filter(f => f.kind === 'spark').length <= 1);
});

test('every feather and flower is one of a few keepsakes, the rare ones rarer', () => {
  for (const kind of ['feather', 'flower']) {
    const all = KEEPSAKES.filter(k => k.kind === kind);
    assert.ok(all.length >= 3, kind);
    assert.ok(all.some(k => k.w < Math.max(...all.map(q => q.w))), 'a rare one');
    for (const k of all) assert.equal(k.c.length, 4, k.id);
    for (const r of [0, 0.2, 0.49, 0.5, 0.8, 0.999]) assert.equal(KEEPSAKES.find(k => k.id === keepsakePick(kind, {}, () => r)).kind, kind);
    // with everything common found, the rare one can still turn up
    const most = Object.fromEntries(all.filter(k => k.w > 1).map(k => [k.id, 1]));
    assert.ok([...Array(50)].some((_, i) => !most[keepsakePick(kind, most, seq(0.9, i / 50))]));
  }
});

test('an old save\'s feathers and flowers are shared out into kinds; new counts are kept as they are', () => {
  const w = walkSaveOf({ keep: { feather: 5, flower: 1 } });
  const sum = kind => KEEPSAKES.filter(k => k.kind === kind).reduce((n, k) => n + (w.found[k.id] || 0), 0);
  assert.equal(sum('feather'), 5);
  assert.equal(sum('flower'), 1);
  assert.deepEqual(walkSaveOf(w), w, 'mended once, it stays the same');
  const v = walkSaveOf({ keep: { feather: 1 }, found: { jay: 2, rose: 1, nothing: 4 } });
  assert.deepEqual(v.found, { jay: 2, rose: 1 });
  assert.deepEqual(v.keep, { feather: 2, flower: 1 }, 'the counts never fall below the jar');
});

test('the jar shows each kind found, grows with more, and never overflows', () => {
  assert.deepEqual(keepjarView({}), { stems: [], petals: 0 });
  assert.deepEqual(keepjarView({ daisy: 1 }).stems, ['daisy']);
  const a = keepjarView({ jay: 1, daisy: 2 }), b = keepjarView({ jay: 3, daisy: 3, rose: 1 });
  assert.ok(b.stems.length > a.stems.length);
  assert.ok(b.stems.includes('rose'));
  // feathers stand at the back
  assert.ok(b.stems.indexOf('jay') < b.stems.indexOf('daisy'));
  const full = keepjarView(Object.fromEntries(KEEPSAKES.map(k => [k.id, 20])));
  assert.equal(full.stems.length, 8);
  assert.equal(full.petals, 4);
  assert.ok(keepjarView(Object.fromEntries(KEEPSAKES.map(k => [k.id, 3]))).petals < full.petals, 'petals rise as you find more');
});

test('keepsakes made into something to wear leave the jar, never more than were found', () => {
  const w = walkSaveOf({ keep: { feather: 3, flower: 2 }, found: { jay: 2, raven: 1, daisy: 2 }, used: { jay: 5, raven: 1, rose: 2, nothing: 1 } });
  assert.deepEqual(w.used, { jay: 2, raven: 1 }, 'kept within what was found');
  assert.deepEqual(jarOf(w), { daisy: 2 });
  assert.deepEqual(walkSaveOf(w), w);
  assert.deepEqual(jarOf({ found: { jay: 1 } }), { jay: 1 }, 'an older save has used nothing');
});

test('a crown takes three flowers in their colours, a pin two feathers and shows the rarest', () => {
  assert.equal(KEEP_WEAR.length, 2);
  const count = p => Object.values(p.take).reduce((n, v) => n + v, 0);
  assert.equal(keepWearPlan('wreath', { daisy: 2 }), null, 'not enough flowers');
  assert.equal(keepWearPlan('featherpin', { jay: 1, daisy: 5 }), null, 'flowers are no feathers');
  assert.equal(keepWearPlan('nothing', { jay: 9 }), null);
  const c = keepWearPlan('wreath', { daisy: 4, heather: 1, harebell: 2, rose: 1, jay: 3 });
  assert.equal(count(c), 3);
  assert.deepEqual(c.look, ['daisy', 'harebell', 'heather'], 'as many kinds as fit, the most plentiful first');
  assert.deepEqual(c.take, { daisy: 1, harebell: 1, heather: 1 });
  const one = keepWearPlan('wreath', { rose: 3 });
  assert.deepEqual(one, { take: { rose: 3 }, look: ['rose'] });
  const two = keepWearPlan('wreath', { daisy: 1, heather: 5 });
  assert.deepEqual(two.take, { heather: 2, daisy: 1 });
  const p = keepWearPlan('featherpin', { jay: 4, raven: 1, robin: 1 });
  assert.deepEqual(p.look, ['raven']);
  assert.deepEqual(p.take, { raven: 1, jay: 1 });
  assert.deepEqual(keepWearPlan('featherpin', { down: 2 }), { take: { down: 2 }, look: ['down'] });
  for (const t of KEEP_WEAR) {
    const jar = Object.fromEntries(KEEPSAKES.map(k => [k.id, 3])), plan = keepWearPlan(t.id, jar);
    assert.equal(count(plan), t.n, t.id);
    for (const [k, n] of Object.entries(plan.take)) { assert.equal(KEEPSAKES.find(q => q.id === k).kind, t.kind); assert.ok(n <= jar[k]); }
  }
});
