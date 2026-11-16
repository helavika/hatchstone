const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// the shop stops wearing the forge's house (#278): both rooms painted for real on a pretend canvas, the shop with its open
// counter front, awning, lanterns and shelf of goods, the river behind it; the forge exactly as it was
const core = read('core.js'), pixel = read('pixel.js'), iso = read('iso.js'), nest = read('nest.js'), save = read('save.js'), world = read('world.js');
const src = [
  ...['rand', 'clamp', 'TAU'].map(n => line(core, new RegExp(`^const ${n} = .*$`, 'm'), n + ' should be one line in core.js')),
  pixel,
  cut(world, 'const WM_COL = ', '\n\n', 'WM_COL should sit on its own in world.js'),
  line(iso, /^const ROOM_KIND = .*$/m, 'ROOM_KIND should be one line in iso.js'),
  line(iso, /^const DECO_AQUA = .*$/m, 'DECO_AQUA should be one line in iso.js'),
  line(iso, /^const DOOR_AT = .*$/m, 'DOOR_AT should be one line in iso.js'),
  line(iso, /^const ISO_G = .*$/m, 'ISO_G should be one line in iso.js'),
  cut(iso, '/** A shade from a ramp', '/** The isometric room\'s furniture, back to front', 'the room\'s painting should sit together in iso.js'),
  line(iso, /^const roomKey = .*$/m, 'roomKey should be one line in iso.js'),
  line(iso, /^const ROOM_FIXED = .*$/m, 'ROOM_FIXED should be one line in iso.js'),
  cut(nest, 'const ROOM_KINDS = [', '\n];', 'ROOM_KINDS should be one list in nest.js') + '\n];',
  line(nest, /^const isOutside = .*$/m, 'isOutside should be one line in nest.js'),
  line(nest, /^const isPlace = .*$/m, 'isPlace should be one line in nest.js'),
  cut(save, 'function currentTheme(', '\n// ----------', 'the backdrop rules should sit together in save.js'),
  'Object.assign(this, { paintRoomIso, paintShopBackdrop, shopShell, shopRiverY, roomKey, ROOM_FIXED, BREATH });',
].join('\n');

function canvas() {
  const c = { width: 0, height: 0, img: null };
  c.getContext = () => ({
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: img => { c.img = img; }, getImageData: () => c.img,
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, fillRect() {}, arc() {}, ellipse() {}, closePath() {},
    createRadialGradient: () => ({ addColorStop() {} }), drawImage() {},
  });
  c.toDataURL = () => 'data:';
  return c;
}
/** The valley's shop and forge, on a phone (tall walls) or a wide screen (low ones). */
function page(room, wallH = 229) {
  const isoW = 183, IC = new Proxy({}, { get: () => [90, 90, 100] });
  const p = {
    document: { createElement: () => canvas() }, LEVELS: 24, IC, game: { scene: 'nest' }, W: 390, H: 844, PX: 1,
    N: { cx: 195, isoTop: 418, isoW, isoH: isoW / 2, isoWall: wallH, base: 70 },
    save: { room, theme: 'smithy', rooms: ['nest', 'shop', 'forge'].map(kind => ({ kind, on: [], theme: kind === 'nest' ? undefined : 'smithy' })), seen: {}, creatures: [] },
    unlocked: () => true, totalStars: () => 0, placeOk: () => true,
    hasDecor: () => false, wallSlot: () => ({ wall: 'L', s: 0 }), isoWallTop: () => 0, roomSpot: () => [0, 0], opts: () => ({}),
  };
  vm.runInNewContext(src, p);
  return p;
}
const SHOP = 1, FORGE = 2;
const paint = (room, wallH) => { const p = page(room, wallH); return { p, c: p.paintRoomIso('smithy') }; };
/** Is there paint at art pixel x, y? */
const painted = (c, x, y) => c.img.data[(y * c.width + x) * 4 + 3] > 0;
/** A spot on the left wall, v along it from the back corner and z up. */
const leftWall = (v, z) => [Math.round(195 - v * 183), Math.round(418 + v * 91.5 - z)];

test('the shop and the forge have different shells; the forge keeps its own', () => {
  for (const wallH of [229, 72]) {
    const shop = paint(SHOP, wallH).c, forge = paint(FORGE, wallH).c;
    let diff = 0; for (let i = 0; i < shop.img.data.length; i++) if (shop.img.data[i] !== forge.img.data[i]) diff++;
    assert.ok(diff > 20000, `the two rooms are painted differently (${diff} values) with walls ${wallH} high`);
    // the forge's left wall is solid; the shop's is open over its counter (in its middle bay, between the lanterns), so the river shows through
    // (just over the counter: higher up, the awning's hem hangs in front of the opening on a low wall)
    const SH = page(SHOP, wallH).shopShell(183, wallH), mid = SH.zc + 3;
    for (const v of [0.38, 0.46, 0.54]) {
      const [x, y] = leftWall(v + 0.04, mid);
      assert.ok(painted(forge, x, y), `the forge's wall is there at ${v}`);
      assert.ok(!painted(shop, x, y), `the shop is open at ${v}, walls ${wallH} high`);
    }
    // but under the opening the counter stands, and the right wall is boards all the way
    { const [x, y] = leftWall(0.5 + 0.04, Math.round(SH.zc / 2) + 2); assert.ok(painted(shop, x, y), 'the counter under the opening'); }
    for (const u of [0.2, 0.5, 0.8]) assert.ok(painted(shop, Math.round(195 + u * 183), Math.round(418 + u * 91.5 - wallH / 2)), 'the right wall is solid');
  }
  // each room's picture is kept apart from the other's
  assert.notEqual(page(SHOP).roomKey(), page(FORGE).roomKey());
});

test('the shell fits the room at every size: the opening, the awning and the lanterns stay inside the walls', () => {
  const p = page(SHOP);
  for (const [hw, wall] of [[183, 229], [200, 72], [140, 60], [260, 300]]) {
    const SH = p.shopShell(hw, wall);
    assert.ok(SH.zc > SH.foot && SH.zo > SH.zc + 4 && SH.zt > SH.zo && SH.zt <= wall - SH.plate, `the counter, the opening and the awning stack up under the plate (${hw}, ${wall})`);
    for (const L of SH.lamps) assert.ok(L.z > SH.zc && L.z < SH.zo && L.u > 0 && L.v > 0 && L.v < 1, 'each lantern hangs in the opening, over the counter');
    // the posts: one in each corner, two between the bays of the open front, none in the middle of the right wall
    assert.ok(SH.postAt(1, 1) && SH.postAt(hw - 1, 1) && SH.postAt(hw / 3, 1) && SH.postAt(hw * 2 / 3, 1));
    assert.equal(SH.postAt(hw / 3, -1), null);
    assert.ok(!SH.open(hw / 3, (SH.zc + SH.zo) / 2) && SH.open(hw / 2, (SH.zc + SH.zo) / 2), 'open between the posts');
  }
});

test('the shop keeps its furniture, its keeper\'s counter and its sign where they were', () => {
  const p = page(SHOP);
  assert.equal(JSON.stringify(p.ROOM_FIXED.shop), JSON.stringify(['shelves', 'shelves2', 'counter', 'crates', 'sacks', 'barrel']));
  assert.equal(JSON.stringify(p.BREATH.shop.sign), JSON.stringify({ u: 3.75, z: 0.62 }));
  assert.equal(JSON.stringify(p.BREATH.shop.win), JSON.stringify({ v: 0.5, z: 0.56, to: [0.17, 0.55], wide: 0.1 }));
  assert.ok(!('lamps' in p.BREATH.forge), 'no lanterns at the forge');
});

test('the shop looks out on the river, in the map\'s own colours', () => {
  const p = page(SHOP), ry = p.shopRiverY(), c = p.paintShopBackdrop(390, 844, 0.6, ry), d = c.img.data;
  const at = (x, y) => '#' + [0, 1, 2].map(k => d[(y * 390 + x) * 4 + k].toString(16).padStart(2, '0')).join('');
  // (the map's water: WM_COL sea, sea2, w0, w1 and foam; the moon's glints in it are its own pale yellow)
  const map = ['#173262', '#1f3d6b', '#2f68c8', '#69b7d6', '#b8e6f5', '#fff0b5'];
  const water = []; for (let x = 90; x < 300; x += 3) water.push(at(x, ry));   // (between the two landings)
  assert.ok(water.every(col => map.includes(col)), `the river is in the map's colours (${[...new Set(water)]})`);
  assert.ok(new Set(water).size >= 3, 'with ripples in it, not one flat fill');
  // the river runs level with the open front's middle, so it shows through it
  const SH = p.shopShell(183, 229);
  assert.equal(ry, Math.round(418 + 91.5 / 2 - (SH.zc + SH.zo) / 2));
  // the backdrop is cached by the room it's for: the forge's key is as it was
  assert.match(save, /shop === null \? "" : `\|shop\$\{shop\}`/);
});
