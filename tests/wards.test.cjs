const test = require('node:test');
const assert = require('node:assert/strict');
const { WARD_LANDS, WARD_LAND, WARD_SPOTS, WARD_COST, wardSaveOf, wardsUp, wardFull, wardLeft, wardOpenIn, wardRoom, wardPlace } = require('../js/wards.js');
const { CORE_GAIN, CORE_FACETS, coreGrow } = require('../js/inner.js');
const { SPARK_LANDS } = require('../js/sparks.js');

const allSet = (...ids) => Object.fromEntries(ids.flatMap(id => WARD_LAND[id].spots.map((_, i) => [id + '.' + i, 'amethyst'])));

test('four lands, one to three spots each, the Gloom\'s land last with the most', () => {
  assert.deepEqual(WARD_LANDS.map(w => w.id), ['frost', 'isle', 'summit', 'gloom']);
  for (const w of WARD_LANDS) assert.ok(w.spots.length >= 1 && w.spots.length <= 3, w.id);
  assert.equal(WARD_LAND.gloom.spots.length, Math.max(...WARD_LANDS.map(w => w.spots.length)));
  assert.equal(WARD_SPOTS, WARD_LANDS.reduce((n, w) => n + w.spots.length, 0));
  // the lands the sparks show sights of are all here
  for (const id of Object.keys(SPARK_LANDS)) assert.ok(WARD_LAND[id], id);
  assert.ok(WARD_COST.common > 0 && WARD_COST.shards > 0 && WARD_COST.rare > 0);
});

test('an old save without wards loads with an empty hand and nothing set', () => {
  for (const old of [undefined, null, 'nonsense', 7, [], {}]) assert.deepEqual(wardSaveOf(old), { have: [], set: {} });
  assert.deepEqual(wardSaveOf({ have: 'amethyst', set: [] }), { have: [], set: {} });
});

test('a good save comes back the same', () => {
  const w = { have: ['aqua', 'quartz'], set: { 'frost.0': 'amethyst', 'isle.1': 'moonstone' } };
  assert.deepEqual(wardSaveOf(JSON.parse(JSON.stringify(w))), w);
});

test('a damaged save is tidied: unknown lands, spots past the end, odd crystals', () => {
  const w = wardSaveOf({ have: ['aqua', 3, null, 'Bad Id', '<b>', 'quartz'], set: { 'frost.0': 'amethyst', 'frost.2': 'aqua', 'atlantis.0': 'aqua', 'isle.x': 'aqua', 'isle.0': 42, 'gloom.2': 'moonstone', __proto__: { 'summit.0': 'aqua' } } });
  assert.deepEqual(w, { have: ['aqua', 'quartz'], set: { 'frost.0': 'amethyst', 'gloom.2': 'moonstone' } });
});

test('never more stones in hand than there are empty spots', () => {
  const w = wardSaveOf({ have: Array(50).fill('amethyst'), set: allSet('frost') });
  assert.equal(w.have.length, WARD_SPOTS - WARD_LAND.frost.spots.length);
  assert.equal(wardRoom(w), 0);
  assert.equal(wardRoom(wardSaveOf({ have: ['aqua'], set: {} })), WARD_SPOTS - 1);
});

test('the order: snowfields and isle first, then the summit, then the Gloom\'s land in chapter IV', () => {
  const ws = wardSaveOf({});
  assert.ok(wardOpenIn(ws, 'frost') && wardOpenIn(ws, 'isle'));
  assert.ok(!wardOpenIn(ws, 'summit', true) && !wardOpenIn(ws, 'gloom', true));
  ws.set = allSet('frost');
  assert.ok(!wardOpenIn(ws, 'summit'), 'the isle too');
  ws.set = allSet('frost', 'isle');
  assert.ok(wardOpenIn(ws, 'summit') && !wardOpenIn(ws, 'gloom', true));
  ws.set = allSet('frost', 'isle', 'summit');
  assert.ok(!wardOpenIn(ws, 'gloom', false), 'not before chapter IV');
  assert.ok(wardOpenIn(ws, 'gloom', true));
});

test('setting stones: oldest in hand first, one per spot, each thins the veil a step until it lifts', () => {
  const ws = wardSaveOf({ have: ['aqua', 'quartz', 'amethyst'] });
  assert.equal(wardLeft(ws, 'frost'), 1);
  assert.equal(wardPlace(ws, 'frost', 0), 'aqua');
  assert.equal(wardPlace(ws, 'frost', 0), null, 'taken');
  assert.equal(wardPlace(ws, 'frost', 9), null, 'no such spot');
  assert.equal(wardPlace(ws, 'summit', 0), null, 'not open yet');
  assert.equal(wardPlace(ws, 'nowhere', 0), null);
  assert.equal(wardsUp(ws, 'frost'), 1);
  assert.equal(wardLeft(ws, 'frost'), 0.5);
  assert.ok(!wardFull(ws, 'frost'));
  assert.equal(wardPlace(ws, 'frost', 1), 'quartz');
  assert.ok(wardFull(ws, 'frost'));
  assert.equal(wardLeft(ws, 'frost'), 0);
  assert.deepEqual(ws.have, ['amethyst']);
  ws.have = [];
  assert.equal(wardPlace(ws, 'isle', 0), null, 'an empty hand');
  // and it all survives a save and a load
  assert.deepEqual(wardSaveOf(JSON.parse(JSON.stringify(ws))), { have: [], set: { 'frost.0': 'aqua', 'frost.1': 'quartz' } });
});

test('a stone set grows the keeper\'s core a little, once a day', () => {
  assert.ok(CORE_GAIN.ward > 0 && CORE_GAIN.ward < CORE_FACETS[0].at);
  const c = { n: 0, day: {} }, NOON = new Date(2026, 10, 14, 12).getTime();
  assert.equal(coreGrow(c, 'ward', NOON), CORE_GAIN.ward);
  assert.equal(coreGrow(c, 'ward', NOON + 3600e3), 0);
  assert.equal(coreGrow(c, 'ward', NOON + 864e5), CORE_GAIN.ward);
  assert.equal(c.n, 2 * CORE_GAIN.ward);
});
