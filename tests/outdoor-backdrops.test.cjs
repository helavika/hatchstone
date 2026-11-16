const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// (JS_DIR lets the same page be built from another copy of the game, to work out the "as it was" numbers below)
const read = f => fs.readFileSync(path.join(process.env.JS_DIR || path.join(__dirname, '../js'), f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// the garden's and the camp's backdrops drawn like the tiles (#277), painted for real on a pretend canvas: a glowcap wood under
// a banded sky, the ground round the plot laid to meet it and its path going on out; painted once per size and kept; every
// other place's backdrop as it was
const core = read('core.js'), pixel = read('pixel.js'), iso = read('iso.js'), nest = read('nest.js'), save = read('save.js'), world = read('world.js');
const src = [
  ...['rand', 'clamp', 'TAU'].map(n => line(core, new RegExp(`^const ${n} = .*$`, 'm'), n + ' should be one line in core.js')),
  pixel,
  cut(save, 'const PIXEL_PALETTE = [', 'const PIXEL_DITHER', 'the palette should sit together in save.js'),
  cut(world, 'const WM_COL = ', '\n\n', 'WM_COL should sit on its own in world.js'),
  line(iso, /^const ROOM_KIND = .*$/m, 'ROOM_KIND should be one line in iso.js'),
  line(iso, /^const DECO_AQUA = .*$/m, 'DECO_AQUA should be one line in iso.js'),
  line(iso, /^const DOOR_AT = .*$/m, 'DOOR_AT should be one line in iso.js'),
  line(iso, /^const ISO_G = .*$/m, 'ISO_G should be one line in iso.js'),
  cut(iso, '/** A shade from a ramp', '/** The isometric room\'s furniture, back to front', 'the room\'s painting should sit together in iso.js'),
  line(iso, /^const roomKey = .*$/m, 'roomKey should be one line in iso.js'),
  cut(nest, 'const ROOM_KINDS = [', '\n];', 'ROOM_KINDS should be one list in nest.js') + '\n];',
  line(nest, /^const isOutside = .*$/m, 'isOutside should be one line in nest.js'),
  line(nest, /^const isPlace = .*$/m, 'isPlace should be one line in nest.js'),
  cut(save, 'function currentTheme(', '\n// ----------', 'the backdrop rules should sit together in save.js'),
  line(save, /^const bgCache = .*$/m, 'bgCache should be one line in save.js'),
  cut(save, 'function bgFor(', '\nfunction drawBackground', 'bgFor should sit before drawBackground in save.js'),
  'Object.assign(this, { paintRoomIso, pixelNight, paintTheme, bgFor, bgCache, NIGHT, roomMaterials, WAY_OUT: typeof WAY_OUT === "undefined" ? null : WAY_OUT });',
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
const KINDS = ['nest', 'yard', 'camp', 'forge', 'shop', 'lab'], THEME_OF = { camp: 'glowcap', forge: 'smithy', shop: 'smithy', lab: 'abbey' };
/** The valley with the garden, the camp and the indoor places, on a phone (or any size). */
function page(kind, Wd = 390, Hd = 844, PX = 1) {
  const isoW = Math.min(Wd * 0.47, 400) / PX * PX, IC = new Proxy({}, { get: () => [90, 90, 100] });
  const p = {
    document: { createElement: () => canvas() }, LEVELS: 24, IC, game: { scene: 'nest' }, W: Wd, H: Hd, PX,
    N: { cx: Wd / 2, isoTop: Hd * 0.495, isoW, isoH: isoW / 2, isoWall: 229, base: 70, back: 300, front: 500 },
    save: { room: KINDS.indexOf(kind), theme: THEME_OF[kind], rooms: KINDS.map(k => ({ kind: k, on: [], theme: THEME_OF[k] })), seen: {}, creatures: [] },
    unlocked: () => true, totalStars: () => 0, placeOk: () => true, stageNow: () => ({ horizon: 0 }),
    hasDecor: () => false, wallSlot: () => ({ wall: 'L', s: 0 }), isoWallTop: () => 0, roomSpot: () => [0, 0], opts: () => ({}),
  };
  vm.runInNewContext(src, p);
  return p;
}
/** A short fingerprint of a painted picture. */
const sum = c => { let h = 0; const d = c.img.data; for (let i = 0; i < d.length; i++) h = (h * 31 + d[i]) >>> 0; return h; };
const hex = (c, x, y) => { const i = (Math.round(y) * c.width + Math.round(x)) * 4, d = c.img.data; return '#' + [0, 1, 2].map(k => d[i + k].toString(16).padStart(2, '0')).join(''); };

// worked out from the game as it was before #277 (JS_DIR=<staging's js> FINGERPRINTS=1 node tests/outdoor-backdrops.test.cjs)
const AS_IT_WAS = { smithy: 3406857423, churchyard: 3601599861, abbey: 29634573, summit: 810398794, amethyst: 580735775, forgeRoom: 3644608335, labRoom: 2982072076 };
function fingerprints() {
  const forge = page('forge'), lab = page('lab'), out = {};
  for (const id of ['smithy', 'churchyard', 'abbey', 'summit', 'amethyst']) out[id] = sum(forge.paintTheme(id, 160, 120, 0.6));
  out.forgeRoom = sum(forge.paintRoomIso('smithy'));
  out.labRoom = sum(lab.paintRoomIso('abbey'));
  return out;
}
if (process.env.FINGERPRINTS) { console.log(JSON.stringify(fingerprints())); return; }

test('the garden and the camp each get their backdrop painted once per size, and kept', () => {
  for (const kind of ['yard', 'camp']) {
    const p = page(kind);
    let painted = 0; const real = p.paintTheme;
    p.paintTheme = (...a) => { painted++; return real(...a); };
    const [id, key] = p.bgFor('nest');
    assert.equal(id, 'glowcap', kind + ' is in the glowcap wood');
    assert.match(key, new RegExp(`\\|site:${kind}:`), 'the key says which plot the ground was laid round');
    p.bgFor('nest'); p.bgFor('nest');
    assert.equal(painted, 1, kind + ': painted once, then taken from the cache');
    // a new size is a new picture, kept beside the first
    p.W = 1280; p.H = 800; p.N.cx = 640; p.N.isoTop = 188; p.N.isoW = 400;
    const [, key2] = p.bgFor('nest'); p.bgFor('nest');
    assert.notEqual(key2, key); assert.equal(painted, 2); assert.equal(p.bgCache.size, 2);
  }
  // the garden and the camp share the wood but not the ground round their plots (their paths go different ways)
  assert.notEqual(page('yard').bgFor('nest')[1], page('camp').bgFor('nest')[1]);
});

test('painted within a time budget, at a phone\'s size and a wide screen\'s', () => {
  // (measured against the forge's backdrop at the same size on the same machine, so a slow machine doesn't fail it: in a browser
  // the forge's takes ~100 ms on a phone at a quarter of the speed, and the wood is allowed ~300 ms once, see #277)
  for (const [Wd, Hd, PX] of [[390, 844, 1], [1280, 800, 2]]) for (const kind of ['yard', 'camp']) {
    const p = page(kind, Wd, Hd, PX), time = f => { const t0 = performance.now(); f(); return performance.now() - t0; };
    time(() => p.pixelNight('smithy', 64, 64, 0.5)); time(() => p.pixelNight('glowcap', 64, 64, 0.5));
    const forge = time(() => p.pixelNight('smithy', Math.ceil(Wd / PX), Math.ceil(Hd / PX), 0.6)), ms = time(() => p.bgFor('nest'));
    assert.ok(ms < forge * 3, `${kind} at ${Wd}×${Hd} painted in ${ms.toFixed(0)} ms (the forge's: ${forge.toFixed(0)} ms)`);
  }
});

test('the plot sits in its meadow: its own grass carried on past its edges, blades over the edge, no lit rim', () => {
  for (const kind of ['yard', 'camp']) {
    const p = page(kind), bg = p.bgCache.get(p.bgFor('nest')[1]), room = p.paintRoomIso('glowcap');
    const cx = p.N.cx, top = p.N.isoTop, hw = p.N.isoW, hh = hw / 2, ground = p.NIGHT.glowcap.ground;
    // just outside the front edges (clear of the path), the backdrop is in the plot's own grass tones
    let own = 0, n = 0;
    for (let k = 0.05; k < 0.95; k += 0.03) for (const left of [true, false]) {
      const x = left ? cx - hw + k * hw : cx + k * hw, ye = top + hh + (left ? k * hh : (1 - k) * hh);
      if (!left && kind === 'yard' && k > 0.44) continue;
      if (!left && kind === 'camp' && k < 0.3) continue;
      n++; if (ground.includes(hex(bg, x, ye + 3))) own++;
    }
    assert.ok(own / n > 0.9, `${kind}: ${own} of ${n} spots past the edge are the plot's own grass`);
    // in the room's own picture, blades of grass grow over the front edges, and no unbroken pale rim runs along them
    const opaque = (x, y) => room.img.data[(Math.round(y) * room.width + Math.round(x)) * 4 + 3] > 0;
    let over = 0, rim = 0, m = 0;
    for (let x = Math.ceil(cx - hw) + 2; x < cx + hw - 2; x++) {
      const ye = Math.round(top + hh + (hh - Math.abs(x - cx) * hh / hw));
      m++; if (opaque(x, ye + 1) || opaque(x, ye + 2)) over++;
      if (hex(room, x, ye) === ground[4]) rim++;
    }
    assert.ok(over > m * 0.3, `${kind}: grass grows over the edge at ${over} of ${m} columns`);
    assert.ok(rim < m * 0.2, `${kind}: no lit rim along the front edges (${rim} of ${m})`);
  }
});

test('the path goes on out of the plot toward the next place', () => {
  const dirt = ['#1f130a', '#3b2414', '#553620', '#6e4a2a', '#8a6238', '#a37b4b'], stone = ['#22143a', '#3a3440', '#5d5666', '#8a8494', '#b9b3c0'];
  for (const kind of ['yard', 'camp']) {
    const p = page(kind), bg = p.bgCache.get(p.bgFor('nest')[1]), way = p.WAY_OUT[kind];
    const cx = p.N.cx, top = p.N.isoTop, hw = p.N.isoW, [u, v] = way.at;
    // where it leaves, the plot's own path reaches its edge (pathD agrees with WAY_OUT)
    const M = p.roomMaterials('glowcap', hw, p.N.isoWall, Math.max(0.55, hw / 180));
    assert.ok(M.pathD(u, v) < way.pr * 0.5, kind + ': the plot\'s path leaves where WAY_OUT says');
    // and just out past the edge, the backdrop has the path going on (about as wide as it is on the plot)
    const ex = cx + (u - v) * hw, ey = top + (u + v) * hw / 2;
    let on = 0;
    for (let y = Math.round(ey - 0.15 * hw); y < ey + 0.15 * hw; y++) for (let x = Math.round(ex); x < ex + 0.15 * hw; x++) {
      const a = (x - cx) / hw, b = (y - top) / (hw / 2);
      if ((a + b) / 2 > 1.01 && [...dirt, ...stone].includes(hex(bg, x, y))) on++;
    }
    assert.ok(on > way.half * hw * 0.15 * hw * 0.5, `${kind}: the path goes on past the plot's edge (${on} pixels)`);
  }
});

test('every other place keeps its backdrop and its room as they were', () => {
  assert.deepEqual(fingerprints(), AS_IT_WAS);
  // the indoor places, the nest and the shop have no plot laid in their ground
  for (const kind of ['forge', 'shop', 'lab', 'nest']) assert.doesNotMatch(page(kind).bgFor('nest')[1], /site:/, kind);
});
