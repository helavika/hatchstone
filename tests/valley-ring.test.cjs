const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// the arrows at a place's edges step round the valley's places (#314): the order, the skipping of places not open yet, and home
const nest = fs.readFileSync(path.join(__dirname, '../js/nest.js'), 'utf8');
const line = re => { const m = nest.match(re); assert.ok(m, `${re} should be one line in nest.js`); return m[0]; };
const page = {};
vm.runInNewContext([line(/^const VALLEY_RING = .*$/m), line(/^const ringNext = .*$/m), line(/^const ringWays = .*$/m), 'Object.assign(this, { VALLEY_RING, ringNext, ringWays });'].join('\n'), page);
const open = (...ids) => id => ids.includes(id);
const all = () => true;

test('the ring has every place on the map once, home among them', () => {
  const from = nest.indexOf('const WORLD = ['), block = nest.slice(from, nest.indexOf('\n];', from));
  const world = [...block.matchAll(/^  \{ id: "(\w+)"/gm)].map(m => m[1]);
  assert.equal(world.length, 8);
  assert.deepEqual([...page.VALLEY_RING].sort(), world.sort());
});

test('with everything open, the arrows go round in the ring\'s order, both ways, and wrap', () => {
  const R = page.VALLEY_RING;
  R.forEach((id, k) => {
    assert.equal(page.ringNext(id, 1, all), R[(k + 1) % R.length], `right from ${id}`);
    assert.equal(page.ringNext(id, -1, all), R[(k - 1 + R.length) % R.length], `left from ${id}`);
  });
  assert.deepEqual({ ...page.ringWays('grotto', all) }, { prev: 'forge', next: 'nest' });
});

test('places not open yet are stepped over; home is always a stop on the way', () => {
  const early = open('nest', 'grotto', 'shop');
  // (the snowfields, out past the lab, are on the ring too, once their fog has lifted: see snowfields.test.cjs)
  assert.deepEqual({ ...page.ringWays('shop', early) }, { prev: 'nest', next: 'grotto' });
  assert.deepEqual({ ...page.ringWays('grotto', early) }, { prev: 'shop', next: 'nest' });
});

test('with only one other place open there is one arrow, not two to the same place; off the ring, none', () => {
  assert.deepEqual({ ...page.ringWays('grotto', open('nest', 'grotto')) }, { prev: null, next: 'nest' });
  assert.equal(page.ringNext('grotto', 1, open('grotto')), null);
  assert.deepEqual({ ...page.ringWays('isle', all) }, {});
});
