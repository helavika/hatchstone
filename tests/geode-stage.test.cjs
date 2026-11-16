const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// the geode's stage painted for real, pixel by pixel, on a pretend canvas, for each cave at three screen sizes
const core = read('core.js'), pixel = read('pixel.js'), save = read('save.js'), stage = read('stage.js');
const src = [
  ...['rand', 'clamp', 'lerp', 'pick', 'TAU'].map(n => line(core, new RegExp(`^const ${n} = .*$`, 'm'), n + ' should be one line in core.js')),
  pixel,
  'const L = {}, N = {}; let W = 0, H = 0, PX = 1; function screenFit() {}',
  cut(save, 'function eggPoly(', '\n}\n', 'eggPoly should be in save.js') + '\n}',
  cut(save, 'function computeLayout() {', '  // the nest leaves room', 'the egg\'s layout should come first in computeLayout') + '}',
  stage,
  'Object.assign(this, { stageArt, stageGeom, paintStage, restChip, drawRest, chipFloorAt, stageNow, REST_MAX, STAGE_QUIET, paints: () => stagePaints, L,'
  + ' size: (w, h, px) => { W = w; H = h; PX = px; computeLayout(); } });',
].join('\n');

/** A canvas that keeps the pixels put on it (and counts what is drawn on it). */
function canvas() {
  const c = { width: 0, height: 0, img: null, rects: 0 };
  c.getContext = () => ({
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: img => { c.img = img; }, getImageData: () => c.img,
    fillRect() { c.rects++; }, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {}, ellipse() {}, closePath() {},
    createRadialGradient: () => ({ addColorStop() {} }),
  });
  c.toDataURL = () => 'data:';
  return c;
}
function page(theme = 'amethyst') {
  const p = {
    document: { createElement: () => canvas() }, game: { scene: 'crack', egg: { rest: [] } }, theme,
    ctx: { drawImage() {}, imageSmoothingEnabled: true }, unlocked: () => true, totalStars: () => 0, placeOk: () => true, save: { creatures: [], seen: {} },
  };
  p.currentTheme = () => p.theme;
  vm.runInNewContext(src, p);
  return p;
}
const CAVES = ['amethyst', 'celestite', 'malachite', 'labradorite'];
const SIZES = [[360, 640, 1], [390, 844, 1], [1280, 800, 2]];
const opaque = (c, x, y) => c.img.data[(y * c.width + x) * 4 + 3] > 0;
const inside = (poly, [x, y]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };

test('the stage is painted once per cave and screen size, then kept', () => {
  const p = page();
  p.size(390, 844, 1);
  const a = p.stageArt('amethyst');
  assert.equal(p.stageArt('amethyst'), a, 'the same cave at the same size is not painted again');
  assert.equal(p.paints(), 1);
  const b = p.stageArt('celestite');
  assert.notEqual(b, a, 'each cave has its own');
  assert.equal(p.paints(), 2);
  p.size(1280, 800, 2);
  const c = p.stageArt('amethyst');
  assert.notEqual(c, a, 'a new size is painted anew');
  assert.equal(c.width, 640, 'on the art grid');
  assert.equal(p.paints(), 3);
  p.size(390, 844, 1);
  assert.equal(p.stageArt('amethyst'), a, 'and the first is still kept');
  assert.equal(p.paints(), 3);
});

test('each cave has two props of its own, on screen, clear of the egg, the top bar, the eye and the hint', () => {
  const p = page();
  const kinds = new Set();
  for (const [w, h, px] of SIZES) {
    p.size(w, h, px);
    const L = p.L;
    for (const id of CAVES) {
      const G = p.stageGeom(id, w, h, L);
      assert.equal(G.props.length, 2, id);
      for (const pr of G.props) {
        kinds.add(pr.kind);
        const [x0, y0, x1, y1] = pr.box;
        assert.ok(x0 >= 0 && x1 <= w, `${id} ${pr.kind} on screen at ${w}x${h}`);
        assert.ok(y0 > 100, `${id} ${pr.kind} below the top bar at ${w}x${h}`);
        assert.ok(y1 <= h - p.STAGE_QUIET, `${id} ${pr.kind} above the hint at ${w}x${h}`);
        for (let x = x0; x <= x1; x += 2) for (let y = y0; y <= y1; y += 2) assert.ok(!inside(L.egg, [x, y]), `${id} ${pr.kind} clear of the egg at ${w}x${h}`);
      }
      assert.ok(G.land[1] <= h - p.STAGE_QUIET, `chips settle above the hint at ${w}x${h}`);
    }
  }
  assert.equal(kinds.size, 8, 'no two caves share a prop');
});

test('the painted stage leaves the top bar, the eye button and the egg (but for the nest\'s rim) untouched', () => {
  const p = page();
  for (const [w, h, px] of SIZES) {
    p.size(w, h, px);
    const L = p.L;
    for (const id of [...CAVES, 'churchyard']) {
      const G = p.stageGeom(id, w, h, L), c = p.paintStage(id, w, h, px, G), lip = p.paintStage(id, w, h, px, G, true);
      for (let y = 0; y < Math.ceil(110 / px); y++) for (let x = 0; x < c.width; x++) assert.ok(!opaque(c, x, y), `${id}: nothing under the top bar at ${w}x${h}`);
      // the eye button (right: 14px, top: 66px, 48 by 48)
      for (let y = Math.floor(66 / px); y < Math.ceil(114 / px); y++) for (let x = Math.floor((w - 62) / px); x < Math.ceil((w - 14) / px); x++) assert.ok(!opaque(c, x, y), `${id}: nothing under the eye at ${w}x${h}`);
      // over the egg only the nest, round its very bottom (the weak spot is never lower than 0.28 of its width above it)
      let rim = 0;
      for (let y = 0; y < lip.height; y++) for (let x = 0; x < lip.width; x++) {
        if (!opaque(lip, x, y) || !inside(L.egg, [(x + 0.5) * px, (y + 0.5) * px])) continue;
        rim++;
        assert.ok((y + 1) * px >= L.floor - 0.1 * L.ew, `${id}: the rim only over the egg's bottom at ${w}x${h}`);
      }
      assert.ok(rim > 0, `${id}: the egg sits in the nest at ${w}x${h}`);
      // and the floor runs on down to the bottom of the screen, no black band
      let lit = 0;
      for (let x = 0; x < c.width; x++) if (opaque(c, x, c.height - 1)) lit++;
      assert.equal(lit, c.width, `${id}: floor to the bottom at ${w}x${h}`);
    }
  }
});

test('chips that settle stay on the floor for the level, capped, drawn a few at a time, and go with the egg', () => {
  const p = page();
  p.size(390, 844, 1);
  const e = p.game.egg, L = p.L, G = p.stageNow();
  const chip = (x, y) => ({ x, y, s: 3, color: '#b9b2c4', rot: 1 });
  // where a chip comes down: on the slab, or the floor in front, never in the hint's strip
  for (let i = 0; i <= 20; i++) for (const x of [L.ecx, L.ecx - L.ew * 0.4, 20, 370]) {
    const y = p.chipFloorAt(G, x, i / 20);
    assert.ok(y > G.horizon && y < 844 - p.STAGE_QUIET, 'lands on the stage');
  }
  assert.ok(p.restChip(e, chip(L.ecx, G.land[0])));
  assert.ok(p.restChip(e, chip(L.ecx + 30, G.land[1])));
  assert.ok(!p.restChip(e, chip(-5, G.land[1])), 'one off the screen is not kept');
  p.drawRest();
  const R = p.game.restLayer, first = R.c.rects;
  assert.equal(R.n, 2);
  assert.ok(first > 0);
  // a frame later nothing new: nothing is drawn again
  p.drawRest();
  assert.equal(R.c.rects, first, 'chips already on the layer are not drawn again');
  p.restChip(e, chip(L.ecx - 30, G.land[1]));
  p.drawRest();
  assert.equal(p.game.restLayer, R, 'the same layer');
  assert.equal(R.c.rects, first * 1.5, 'only the new chip is drawn');
  // capped
  while (p.restChip(e, chip(L.ecx, G.land[1])));
  assert.equal(e.rest.length, p.REST_MAX);
  assert.ok(JSON.stringify(e.rest).length < 6000, 'small enough to keep in a waiting stone');
  // a new egg starts with a clean floor
  p.game.egg = { rest: [] };
  p.drawRest();
  p.restChip(p.game.egg, chip(L.ecx, G.land[0]));
  p.drawRest();
  assert.notEqual(p.game.restLayer, R, 'a new layer for a new egg');
  assert.equal(p.game.restLayer.n, 1);
});

test('the chips are wired in: they rest while cracking, a waiting stone keeps them, and a new egg has none', () => {
  const crack = read('crack.js'), main = read('main.js'), scenes = read('scenes.js');
  const spawn = cut(crack, 'function spawnChips(', '\n}\n', 'spawnChips');
  assert.match(spawn, /rest = game\.scene === "crack"/);
  assert.match(main, /restChip\(game\.egg, c\)/);
  assert.match(main, /drawStage\(\);\s*drawRest\(\);/);
  assert.match(line(scenes, /^const STONE_KEEP = [\s\S]*?\];$/m, 'STONE_KEEP'), /"rest"/);
  assert.doesNotMatch(cut(crack, 'function newEgg(', '\n}\n', 'newEgg'), /rest:/, 'a new egg object starts with no chips on the floor');
});
