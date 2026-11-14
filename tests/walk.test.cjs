const test = require('node:test');
const assert = require('node:assert/strict');
const { WALKS, WALK_FINDS, WALK_SPOTS, WALK_SHAPE, walkSaveOf, walkMood, walkPlan } = require('../js/walk.js');

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
  assert.deepEqual(walkSaveOf(undefined), { open: 1, n: 0, best: {}, keep: {}, last: 0 });
  assert.deepEqual(walkSaveOf('nonsense'), { open: 1, n: 0, best: {}, keep: {}, last: 0 });
  const w = walkSaveOf({ open: 9, n: 3.7, best: { meadow: 3, stream: -1, nowhere: 4 }, keep: { feather: 2, flower: 'x', rock: 5 }, last: 123 });
  assert.equal(w.open, WALKS.length);
  assert.equal(w.n, 3);
  assert.deepEqual(w.best, { meadow: 3 });
  assert.deepEqual(w.keep, { feather: 2 });
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
