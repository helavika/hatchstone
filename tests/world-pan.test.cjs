const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// world.js needs the whole game around it, so only its "looking around" sums are run here
const src = fs.readFileSync(path.join(__dirname, '../js/world.js'), 'utf8');
const from = src.indexOf('// ---------- looking around'), to = src.indexOf('// ----------', from + 1);
assert.ok(from > 0 && to > from, 'the looking-around sums should sit in world.js, in a section of their own');
const w = {};
vm.runInNewContext(src.slice(from, to) + '\nObject.assign(this, { WM_ZOOMS, WM_TALL, WM_TAP, wmSteps, wmPanClamp, wmPanTo, wmDragged });', w);
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('the map never rests past its own edges', () => {
  // a 680px map in a 390px window: 290px to drag through
  assert.equal(w.wmPanClamp(-40, 680, 390), 0);
  assert.equal(w.wmPanClamp(0, 680, 390), 0);
  assert.equal(w.wmPanClamp(123, 680, 390), 123);
  assert.equal(w.wmPanClamp(290, 680, 390), 290);
  assert.equal(w.wmPanClamp(291, 680, 390), 290);
  assert.equal(w.wmPanClamp(5000, 680, 390), 290);
});

test('a map smaller than its window stays put', () => {
  for (const at of [-50, 0, 50, 900]) {
    assert.equal(w.wmPanClamp(at, 374, 390), 0);
    assert.equal(w.wmPanClamp(at, 390, 390), 0);
  }
});

test('the place you stand in opens in the middle, as near as the edges allow', () => {
  assert.equal(w.wmPanTo(340, 680, 390), 145);  // the middle of the map: the window sits around it
  assert.equal(w.wmPanTo(300, 680, 390), 105);
  assert.equal(w.wmPanTo(60, 680, 390), 0);     // a place by the left edge: the map stops at its edge
  assert.equal(w.wmPanTo(650, 680, 390), 290);  // and by the right one
  assert.equal(w.wmPanTo(200, 374, 390), 0);    // nothing to scroll
  // wherever it lands, the place is on screen
  for (let p = 0; p <= 680; p += 20) { const at = w.wmPanTo(p, 680, 390); assert.ok(p >= at && p <= at + 390, 'place at ' + p); }
});

test('a press that moves 8px or less is a tap, any further is a drag', () => {
  assert.equal(w.WM_TAP, 8);
  for (const [dx, dy] of [[0, 0], [3, -2], [8, 0], [0, -8], [5, 6], [-5.6, 5.6]]) assert.equal(w.wmDragged(dx, dy), false, dx + ',' + dy);
  for (const [dx, dy] of [[9, 0], [0, -8.5], [6, 6], [-7, 4], [120, 0], [0, 300]]) assert.equal(w.wmDragged(dx, dy), true, dx + ',' + dy);
});

test('a wide screen opens on the whole map, as before', () => {
  // 1280x800: the map would fit 3.16 times across, 1.58 times down
  const { ks, home } = w.wmSteps(3.16, 1.58);
  assert.equal(home, 0);
  assert.deepEqual([...ks], [...w.WM_ZOOMS].map(z => 1.58 * z));
  // a phone on its side, and a screen only a little taller than the map
  assert.equal(w.wmSteps(2.07, 0.5).home, 0);
  assert.equal(w.wmSteps(1, 1.29).home, 0);
  assert.equal(w.wmSteps(1, 1).home, 0);
});

test('an upright phone opens with the map as tall as the screen, the whole map one step out', () => {
  // 390x844: fits 0.935 times across, 1.7 times down
  const { ks, home } = w.wmSteps(0.935, 1.7);
  assert.equal(home, 1);
  assert.ok(near(ks[0], 0.935) && near(ks[1], 1.7), 'whole map, then by height');
  assert.equal(ks.length, 4);
  for (let i = 1; i < ks.length; i++) assert.ok(ks[i] > ks[i - 1] * 1.25, 'each step in is clearly bigger');
  // the same on a bigger phone and on an upright tablet
  for (const [byW, byH] of [[1.035, 1.944], [1.88, 2.5]]) { const s = w.wmSteps(byW, byH); assert.equal(s.home, 1); assert.ok(near(s.ks[s.home], byH) && near(s.ks[0], byW)); }
});

test('the map is never drawn smaller than half size', () => {
  assert.equal(w.wmSteps(0.2, 0.3).ks[0], 0.5);
  assert.equal(w.wmSteps(0.2, 3).ks[0], 0.5);
});
