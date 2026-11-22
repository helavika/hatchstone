const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// On a phone held upright the room is seen closer up: a wider floor (its side corners past the screen's edges), lower walls, bigger
// glowlings, the keepers as they were, and the tunnels' mouths still whole on the screen. Wider screens keep the room as it was.
const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };
const core = read('core.js'), save = read('save.js'), iso = read('iso.js');
const page = { Math };
vm.createContext(page);
vm.runInContext([
  ...['clamp', 'lerp', 'TAU'].map(n => line(core, new RegExp(`^const ${n} = .*$`, 'm'), n + ' should be one line in core.js')),
  'const L = {}, N = {}; let W = 0, H = 0, PX = 1; function screenFit() {} function eggPoly() { return []; } function roomSpot() { return [0, 0]; }',
  cut(save, 'function computeLayout() {', '\n/** Isometric floor', 'computeLayout should be in save.js'),
  line(iso, /^const DOOR_AT = .*$/m, 'DOOR_AT should be one line in iso.js'),
  'this.size = (w, h, px) => { W = w; H = h; PX = px; computeLayout(); return { ...N }; }; this.DOOR = [DOOR_AT, DOOR_W];',
].join('\n'), page);

const PHONES = [[360, 740, 1], [390, 844, 1], [430, 932, 2]];
// the room before the close-up, as these screens had it (the numbers the screen-space audit measured)
const OLD = { 360: { isoW: 169.2, wall: 211.5, glow: 64.8 }, 390: { isoW: 183.3, wall: 229.1, glow: 70.2 }, 430: { isoW: 202.1, wall: 252.6, glow: 77.4 } };

test('on a phone held upright the floor is bigger, the walls lower and the glowlings grown with the room', () => {
  for (const [w, h, px] of PHONES) {
    const n = page.size(w, h, px), o = OLD[w];
    assert.ok(n.isoW > o.isoW * 1.15 && n.isoW <= w * 0.6, `${w}: half the floor's width ${n.isoW}, was ${o.isoW}`);
    assert.ok(n.isoWall < o.wall * 0.85 && n.isoWall <= n.isoW * 0.8 + px, `${w}: walls ${n.isoWall} high, were ${o.wall}`);
    assert.ok(Math.abs(n.base / o.glow - n.isoW / o.isoW) < 0.02, `${w}: glowlings ${n.base}, grown as the floor was`);
    assert.ok(Math.abs(n.kbase - o.glow) < 0.01, `${w}: the keepers keep their size (${n.kbase})`);
    assert.ok(n.crop, `${w}: the side corners are past the screen's edges`);
    // on the room's pixel grid
    for (const k of ['isoW', 'isoH', 'isoWall', 'isoTop']) assert.equal(n[k] % px, 0, `${w}: ${k} ${n[k]} on the ${px}px grid`);
  }
});

test('the close-up room stays between the name row and the needs', () => {
  for (const [w, h, px] of PHONES) {
    const n = page.size(w, h, px), bottom = h - 166;
    assert.ok(n.wallTop >= n.top + 30, `${w}: the walls' top ${n.wallTop} under the room's name`);
    assert.ok(n.isoTop + n.isoW <= bottom, `${w}: the floor's front ${n.isoTop + n.isoW} above the needs (${bottom})`);
    assert.ok(n.x0 >= 0 && n.x1 <= w, `${w}: walking room ${n.x0}..${n.x1} on the screen`);
  }
});

test('the tunnels stay whole on the screen, rim and all', () => {
  const [at, hw] = page.DOOR;
  for (const [w, h, px] of PHONES) {
    const n = page.size(w, h, px), outer = n.cx - (at + hw) * n.isoW;
    assert.ok(outer >= 3 * px + 6, `${w}: a tunnel's outer side ${outer.toFixed(1)}px from the screen's edge`);
  }
});

test('wider screens and phones on their side keep the room as it was', () => {
  for (const [w, h, px] of [[1280, 800, 2], [844, 390, 1], [768, 1024, 2]]) {
    const n = page.size(w, h, px), room = h - 166 - 98;
    assert.equal(n.zoom, 1, `${w}x${h}`); assert.equal(n.crop, false, `${w}x${h}`);
    assert.equal(n.isoW, Math.min(w * 0.47, 400, room * 0.9), `${w}x${h}: floor`);
    assert.equal(n.base, n.kbase, `${w}x${h}: glowlings and keepers as before`);
  }
});
