const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Keepers and Wick in their rooms stay the same size on screen whatever the room's pixel size: when a phone falls back to
// coarser pixels (quality.pxStep, or ?px=), the hand-drawn sprites are shrunk to fit instead of shown pixel for pixel twice as big.
const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };

function canvas() {
  const c = { width: 0, height: 0, px: new Map() };
  c.getContext = () => ({
    fillStyle: '',
    fillRect(x, y, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c.px.set((y + j) * 4096 + x + i, this.fillStyle); },
    getImageData(x0, y0, w, h) { const data = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (c.px.has((y0 + y) * 4096 + x0 + x)) data[(y * w + x) * 4 + 3] = 255; return { data }; },
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {}, drawImage() {},
  });
  return c;
}
const page = { document: { createElement: () => canvas() }, KEEPER_ART: {}, pxIcon: n => n, Math };
vm.createContext(page);
const keepers = read('keepers.js'), nest = read('nest.js');
vm.runInContext(cut(keepers, 'const KEEPER_NATIVE = {', '\nfunction keeperPixCanvas', 'KEEPER_NATIVE')
  + cut(keepers, 'const keeperCache = {};', '\n/** A keeper\'s full-length', 'keeperCache')
  + '\nconst KEEPER_PIX = {};\n' + cut(nest, 'const keeperSizedCache = {};', '\nfunction drawHero', 'keeperSized')
  + '\nconst WICK_NATIVE = { ax: 20, seat: 40 }; const wickSeat = () => [200, 300]; let PX = 1; const N = { base: 70.2 };\n'
  + cut(nest, 'function wickBox() {', '\n/** The bench', 'wickBox')
  + '\nthis.KN = KEEPER_NATIVE; this.sized = keeperSized; this.wickBox = wickBox; this.setPX = p => { PX = p; };', page);

test('a keeper is about as tall on screen at every pixel size', () => {
  const base = 70.2, want = base * 1.55;
  for (const id of Object.keys(page.KN)) for (const PX of [1, 2, 3, 4]) {
    const tall = Math.round(base * 1.55 / PX), img = page.sized(id, false, 0, 1, tall), h = img.height * PX;
    assert.ok(h <= want * 1.15 && h >= want * 0.7, `${id} at px ${PX}: ${h} css px tall, about ${Math.round(want)} wanted`);
  }
});

test('Wick keeps his size when the room\'s pixels get coarser', () => {
  const sizes = [1, 2, 3, 4].map(PX => { page.setPX(PX); return page.wickBox().u; });
  for (const u of sizes) assert.ok(Math.abs(u - sizes[0]) / sizes[0] < 0.25, `one of his pixels: ${sizes.join(', ')} css px`);
});
