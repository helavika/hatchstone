const test = require('node:test');
const assert = require('node:assert/strict');
const { CORE_GAIN, CORE_FACETS, CORE_STAGES, CORE_PAUSE, CORE_SEED_MAX, coreDay, coreFacet, coreFill, coreGrow, coreBack, coreRested, coreSeed, coreSaveOf } = require('../js/inner.js');

const H = 3600e3, DAY = 24 * H;
// noon on a fixed day, so "the same day" never straddles midnight
const NOON = new Date(2026, 10, 14, 12).getTime();
const fresh = () => coreSaveOf(undefined, { creatures: [], counts: {} }, NOON);

test('four facets, each further than the last, a phrase for every stage and never a number', () => {
  assert.equal(CORE_FACETS.length, 4);
  for (let i = 1; i < CORE_FACETS.length; i++) assert.ok(CORE_FACETS[i].at > CORE_FACETS[i - 1].at);
  assert.equal(new Set(CORE_FACETS.map(f => f.gift)).size, CORE_FACETS.length);
  assert.equal(CORE_STAGES.length, CORE_FACETS.length + 1);
  for (const s of CORE_STAGES) assert.doesNotMatch(s, /\d/);
  assert.equal(coreFacet(0), 0);
  assert.equal(coreFacet(CORE_FACETS[0].at), 1);
  assert.equal(coreFacet(999), 4);
  assert.equal(coreFill(0), 0);
  assert.equal(coreFill(CORE_FACETS[0].at / 2), 0.5);
  assert.equal(coreFill(999), 1);
});

test('small steps: coming back, trying again, protecting, a daily ritual', () => {
  for (const k of ['back', 'retry', 'rescued', 'lamplit', 'ritual']) assert.ok(CORE_GAIN[k] > 0 && CORE_GAIN[k] < CORE_FACETS[0].at, k);
  const c = fresh();
  assert.equal(coreGrow(c, 'retry', NOON), CORE_GAIN.retry);
  assert.equal(coreGrow(c, 'rescued', NOON), CORE_GAIN.rescued);
  assert.equal(c.n, CORE_GAIN.retry + CORE_GAIN.rescued);
  // rest and anything unknown never grow it
  assert.equal(coreGrow(c, 'harvested', NOON), 0);
  assert.equal(coreGrow(c, 'sleep', NOON), 0);
});

test('the everyday ones count once a day; freeing a seal counts every time', () => {
  const c = fresh();
  assert.equal(coreGrow(c, 'ritual', NOON), 1);
  assert.equal(coreGrow(c, 'ritual', NOON + H), 0);
  assert.equal(coreGrow(c, 'lamplit', NOON), CORE_GAIN.lamplit);
  assert.equal(coreGrow(c, 'lamplit', NOON + 2 * H), 0);
  assert.equal(coreGrow(c, 'ritual', NOON + DAY), 1);
  assert.equal(coreGrow(c, 'rescued', NOON), CORE_GAIN.rescued);
  assert.equal(coreGrow(c, 'rescued', NOON), CORE_GAIN.rescued);
});

test('coming back after a day or more grows it once; a short break does nothing, and nothing ever takes it away', () => {
  const c = fresh();
  c.n = 10;
  assert.equal(coreBack(c, NOON - 3 * H, NOON), 0);
  assert.equal(coreBack(c, 0, NOON), 0, 'no idea when you were last here: no welcome');
  assert.equal(coreBack(c, NOON - CORE_PAUSE, NOON), CORE_GAIN.back);
  // a second tab, the same day
  assert.equal(coreBack(c, NOON - 2 * DAY, NOON + H), 0);
  // a whole month away: still just a warm welcome, never less than before
  assert.equal(coreBack(c, NOON, NOON + 30 * DAY), CORE_GAIN.back);
  assert.equal(c.n, 10 + 2 * CORE_GAIN.back);
});

test('the resting glow lasts a while after a rest, then quietly goes', () => {
  const c = fresh();
  assert.equal(coreRested(c, NOON), false);
  c.rest = NOON;
  assert.equal(coreRested(c, NOON + H), true);
  assert.equal(coreRested(c, NOON + DAY), false);
});

test('an older nest starts part-way from what it has been through, never at the last facet', () => {
  const old = {
    counts: { rescued: 2, lamplit: 3, taskDays: 4 }, moon: { last: '2026-11-01', streak: 2 },
    creatures: [{ born: NOON - 21 * DAY, last: NOON - 2 * DAY }, { born: NOON - 3 * DAY, last: NOON - 5 * DAY }],
  };
  const seed = 2 * CORE_GAIN.rescued + 3 * CORE_GAIN.lamplit + 4 + 2 + 3;
  assert.equal(coreSeed(old, NOON), seed);
  const c = coreSaveOf(undefined, old, NOON);
  assert.equal(c.n, seed);
  assert.equal(c.seen, NOON - 2 * DAY, 'last seen: the last time anyone was looked after');
  assert.equal(c.told, coreFacet(seed), 'facets already lit are not announced one by one');
  assert.equal(c.old, true);
  // a long-time player is capped below the last facet, so it's still theirs to earn
  const veteran = { counts: { rescued: 4, lamplit: 40, taskDays: 90, moonBest: 30 }, creatures: [{ born: NOON - 400 * DAY, last: NOON }] };
  assert.equal(coreSeed(veteran, NOON), CORE_SEED_MAX);
  assert.ok(coreFacet(CORE_SEED_MAX) < CORE_FACETS.length);
  // a brand-new nest starts at the beginning, quietly
  assert.deepEqual(fresh(), { n: 0, seen: 0, day: {}, fell: false, rest: 0, told: 0, old: false });
});

test('a saved core loads as it was; a damaged one is tidied up, never lowered below zero', () => {
  const kept = { n: 17, seen: NOON, day: { ritual: coreDay(NOON), junk: 'x' }, fell: true, rest: NOON - H, told: 2, old: false };
  assert.deepEqual(coreSaveOf(kept, {}, NOON), { n: 17, seen: NOON, day: { ritual: coreDay(NOON) }, fell: true, rest: NOON - H, told: 2, old: false });
  assert.deepEqual(coreSaveOf({ n: -5, seen: 'x', day: 7, told: 99 }, {}, NOON), { n: 0, seen: 0, day: {}, fell: false, rest: 0, told: 4, old: false });
  // not an object at all: seeded like an older save
  assert.equal(coreSaveOf('nonsense', { counts: { rescued: 1 } }, NOON).n, CORE_GAIN.rescued);
});
