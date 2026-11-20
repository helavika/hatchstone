const test = require('node:test');
const assert = require('node:assert/strict');
const { WALKS, WALK_FINDS, WALK_SPOTS, WALK_SHAPE, KEEPSAKES, KEEP_WEAR, WALK_DO, WALK_DO_LAND, walkSaveOf, walkMood, walkPlan, keepsakePick, keepjarView, jarOf, keepWearPlan, walkDoPlan, walkDoAt } = require('../js/walk.js');

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

test('holding an arrow leads a little ahead, and over the stream from stone to stone, never into the water', () => {
  const fs = require('node:fs'), vm = require('node:vm'), src = fs.readFileSync(require.resolve('../js/walk.js'), 'utf8');
  const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));
  const ctx = vm.createContext({ clamp: (v, a, b) => Math.max(a, Math.min(b, v)) });
  vm.runInContext(cut('const walkIn =', '\n') + '\n' + cut('const WALK_SPEED', '\nfunction updateWalk') + '\nthis.walkAhead = walkAhead; this.WALK_SPEED = WALK_SPEED;', ctx);
  assert.ok(ctx.WALK_SPEED > 1, 'outside they walk faster than at home');
  assert.ok(ctx.WALK_SPEED >= 4 && ctx.WALK_SPEED <= 4.5, 'faster than the 3.2 they used to stroll at (#315), and still easy to steer');
  const geo = { s: 20, end: 400, stream: { x0: 100, x1: 160, stones: [115, 130, 145] } };
  assert.equal(ctx.walkAhead(geo, 40, 1), 64);
  assert.equal(ctx.walkAhead(geo, 40, -1), 16);
  assert.equal(ctx.walkAhead(geo, 395, 1), 400);
  // at the bank, then each stone in turn, then the far bank; and back the same way
  let x = 90; const right = [];
  for (let i = 0; i < 6; i++) { x = ctx.walkAhead(geo, x, 1); right.push(x); }
  assert.deepEqual(right.slice(0, 5), [97, 115, 130, 145, 163]);
  assert.equal(ctx.walkAhead(geo, 130, -1), 115);
});

test('the action key does what is right by the one you lead: thorn, bush, a little thing, lantern, else a hop', () => {
  const src = require('node:fs').readFileSync(require.resolve('../js/walk.js'), 'utf8');
  const act = src.slice(src.indexOf('function walkAct()'), src.indexOf('\n}\n', src.indexOf('function walkAct()')));
  const order = ['walkThorn()', 'walkShake(f', 'walkDo(d)', 'g.lamp = {', 'lead.hop = 1'].map(s => act.indexOf(s));
  assert.ok(order.every(i => i > 0) && order.every((v, i) => !i || v > order[i - 1]), 'thorn, then bush, then a little thing along the way, then lantern, then a hop');
  assert.match(src, /ACT = \[" ", "ArrowUp", "w", "W"\]/);
  assert.match(src, /\$\("walkAct"\)\.addEventListener\("pointerdown"/);
});

test('little things to do along the way: a few on every walk, each land its own, the season has its say', () => {
  const ids = Object.keys(WALK_DO);
  assert.ok(ids.length >= 5);
  for (const [land, list] of Object.entries(WALK_DO_LAND)) for (const id of list) assert.ok(WALK_DO[id], `${land}: ${id}`);
  assert.notDeepEqual(WALK_DO_LAND.glowcap, WALK_DO_LAND.summit, 'each land has its own');
  const seasons = ['spring', 'summer', 'autumn', 'winter'];
  for (const land of Object.keys(WALK_DO_LAND)) for (const season of seasons) for (let p = 0; p < WALKS.length; p++) for (const r of [0, 0.3, 0.7, 0.99]) {
    const plan = walkDoPlan(p, land, season, seq(r, 0.5, 0.1, 0.9, 0.42));
    const at = `${land} ${season} path ${p}`;
    assert.ok(plan.length >= 3 && plan.length <= 4, at);
    assert.equal(new Set(plan.map(d => d.id)).size, plan.length, `${at}: no two the same`);
    for (const d of plan) {
      const doing = WALK_DO[d.id];
      assert.ok(!(doing.not || []).includes(season) && (!doing.only || doing.only.includes(season)), `${at}: ${d.id} belongs to the season`);
      assert.ok(d.u > 0.05 && d.u < 0.95, `${at}: on the path`);
      // never on the hill, in the stream, in the dark, up the climb, or on a find
      const sh = WALK_SHAPE[p];
      for (const k of ['hill', 'stream', 'dark']) if (sh[k]) assert.ok(d.u < sh[k][0] || d.u > sh[k][1], `${at}: ${d.id} clear of the ${k}`);
      if (sh.ledge) assert.ok(d.u < sh.ledge[0], `${at}: before the climb`);
      for (const s of WALK_SPOTS[p]) assert.ok(Math.abs(s.u - d.u) * WALKS[p].len > 0.1, `${at}: ${d.id} clear of a find`);
    }
    // in order along the path, and not crowded
    for (let i = 1; i < plan.length; i++) assert.ok((plan[i].u - plan[i - 1].u) * WALKS[p].len >= 0.28, `${at}: room between`);
  }
  // the heap of leaves comes with autumn and winter; puddles and moonpuffs stay out of the snow
  for (const land of Object.keys(WALK_DO_LAND)) {
    assert.ok(walkDoPlan(0, land, 'autumn', seq(0.4, 0.8)).some(d => d.id === 'leaves'), land);
    assert.ok(walkDoPlan(0, land, 'winter', seq(0.4, 0.8)).every(d => !['puddle', 'puff', 'flies'].includes(d.id)), land);
    assert.ok(walkDoPlan(0, land, 'summer', seq(0.4, 0.8)).every(d => d.id !== 'leaves'), land);
  }
  // the same stream gives the same walk; a different one another
  assert.deepEqual(walkDoPlan(1, 'glowcap', 'spring', seq(0.3, 0.6)), walkDoPlan(1, 'glowcap', 'spring', seq(0.3, 0.6)));
  assert.ok(walkDoPlan(3, 'summit', 'summer').length >= 3, 'with Math.random too');
});

test('the action key picks the nearest little thing in reach, one not done before one done, and a done one only if it can be done again', () => {
  const dos = [{ id: 'bell', x: 100, n: 0, t: -9 }, { id: 'puff', x: 130, n: 0, t: -9 }, { id: 'wish', x: 300, n: 0, t: -9 }];
  assert.equal(walkDoAt(dos, 112, 30, 5).id, 'bell', 'the nearer of two in reach');
  assert.equal(walkDoAt(dos, 122, 30, 5).id, 'puff');
  assert.equal(walkDoAt(dos, 200, 30, 5), null, 'nothing in reach');
  assert.equal(walkDoAt([], 100, 30), null);
  assert.equal(walkDoAt(undefined, 100, 30), null);
  // the bell's been rung: the puff (not blown yet) comes first though it's further
  dos[0].n = 1; dos[0].t = 4;
  assert.equal(walkDoAt(dos, 105, 30, 5).id, 'puff');
  // the puff blown too: it can't be again, but the bell can be rung again (not in the same instant)
  dos[1].n = 1; dos[1].t = 4.5;
  assert.equal(walkDoAt(dos, 118, 30, 4.2), null, 'not straight away');
  assert.equal(walkDoAt(dos, 118, 30, 6).id, 'bell');
  // a wish-stone is a once-a-walk thing
  dos[2].n = 1; dos[2].t = 1;
  assert.equal(walkDoAt(dos, 300, 30, 9), null);
  for (const id of Object.keys(WALK_DO)) assert.equal(typeof (WALK_DO[id].again || false), 'boolean', id);
});

test('the little things done along the way add a little joy to the walk, never over the top', () => {
  assert.ok(walkMood(1, 2, false, 3).joy > walkMood(1, 2, false).joy);
  assert.equal(walkMood(1, 2, false, 0).joy, walkMood(1, 2, false).joy);
  assert.ok(walkMood(3, 5, true, 99).joy <= 40);
  const src = require('node:fs').readFileSync(require.resolve('../js/walk.js'), 'utf8');
  assert.match(src, /trackOnce\("walkdo", \{ what: d\.id \}\)/, 'each counted once a walk');
  assert.match(src, /walkMood\(g\.path, n, g\.freed, g\.doJoy\)/);
});
