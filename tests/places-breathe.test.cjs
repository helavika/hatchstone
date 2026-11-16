const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// the indoor places breathe (#274): firelight that flickers on the floor and the wall, sparks, steam, dust and a swinging sign,
// all worked out from the time alone, so they can be checked here without a canvas
const core = read('core.js'), iso = read('iso.js'), nest = read('nest.js');
const section = cut(iso, '// ---------- places that breathe', '/** The isometric room in art pixels', 'the places-that-breathe section should sit before paintRoomIso in iso.js');
const src = [
  ...['clamp', 'TAU'].map(n => line(core, new RegExp(`^const ${n} = .*$`, 'm'), n + ' should be one line in core.js')),
  read('pixel.js'),
  line(iso, /^const ISO_G = .*$/m, 'ISO_G should be one line in iso.js'),
  section,
  'Object.assign(this, { BREATH, BREATH_CAP, placeBreath, roomSurf, breathPool, fireFlicker });',
].join('\n');
const page = () => { const p = { document: { createElement: () => ({ getContext: () => ({}) }) } }; vm.runInNewContext(src, p); return p; };

// the fixed furniture of each place, where it stands (as ISO_FIXED has it), at a phone's sizes in art pixels
const FIXED = { furnace: { i: 1, j: 0 }, anvil: { i: 3, j: 3 }, labdesk: { i: 2, j: 0 } };
const room = (flip = false) => ({ tile: 30.55, wall: 229, piece: id => FIXED[id] && { ...FIXED[id], flip } });
const G = { cx: 195, top: 418, hw: 183.3, hh: 91.65, wall: 229, w: 390, h: 844 };
const times = () => Array.from({ length: 1200 }, (_, k) => k * 0.05);

test('each indoor place has its own overlays: firelight at the forge and the lab, sparks, steam, dust and the sign', () => {
  const p = page(), seen = kind => { const s = { light: 0, spark: 0, steam: 0, dust: 0, sway: 0 }; for (const t of times()) { const b = p.placeBreath(kind, t, room(), false); for (const k of ['light', 'spark', 'steam', 'dust']) s[k] = Math.max(s[k], b[k].length); s.sway = Math.max(s.sway, Math.abs(b.sway)); } return s; };
  const forge = seen('forge'), lab = seen('lab'), shop = seen('shop');
  assert.ok(forge.light === 1 && forge.spark > 0 && forge.dust > 0, 'the forge: its hearth lights the room, the anvil sparks, dust in the window light');
  assert.ok(lab.light === 1 && lab.steam > 0 && lab.dust > 0, 'the lab: the burner lights the room, the glass steams, dust in the window light');
  assert.ok(shop.dust > 0 && shop.sway > 0.03 && shop.sway < 0.15, 'the shop: dust in the window light and a sign that swings a little');
  assert.equal(shop.light, 0, 'no fire in the shop');
  // (#278) its two lanterns flicker, each its own way, a little brighter and dimmer
  const lamps = times().map(t => p.placeBreath('shop', t, room(), false).lamp);
  assert.ok(lamps.every(l => l.length === 2), 'two lanterns in the shop');
  const ks = lamps.map(l => l[0].k);
  assert.ok(Math.max(...ks) - Math.min(...ks) > 0.3 && lamps.some(l => Math.abs(l[0].k - l[1].k) > 0.1), 'they flicker, and not together');
  for (const k of ['forge', 'lab']) assert.equal(p.placeBreath(k, 3, room(), false).lamp.length, 0, k + ' has no lanterns');
  for (const k of ['nest', 'yard', 'camp', 'grotto']) { const b = p.placeBreath(k, 3, room(), false); assert.equal(b.light.length + b.spark.length + b.steam.length + b.dust.length + b.sway, 0, k + ' is left as it was'); }
  // sparks come now and then, not all the time
  const busy = times().filter(t => p.placeBreath('forge', t, room(), false).spark.length).length / times().length;
  assert.ok(busy > 0.1 && busy < 0.6, `sparks pop now and then (${busy.toFixed(2)} of the time)`);
});

test('with less motion (or a slow device) only the slow light stays: no sparks, steam, dust or swing', () => {
  const p = page();
  for (const kind of ['forge', 'lab', 'shop']) for (const t of times()) {
    const b = p.placeBreath(kind, t, room(), true);
    assert.equal(b.spark.length + b.steam.length + b.dust.length, 0, kind + ': nothing flies');
    assert.equal(b.sway, 0, kind + ': the sign hangs still');
    assert.equal(b.lamp.length, 0, kind + ': the lanterns hang steady (their light is in the room\'s picture)');
    for (const L of b.light) assert.ok(L.step <= 1, 'the pool only breathes between its two nearer reaches');
  }
  // the light still breathes, slower than the fire's flicker
  const span = f => { const v = times().slice(0, 200).map(f); return Math.max(...v) - Math.min(...v); };
  const pace = f => times().slice(1).reduce((s, t) => s + Math.abs(f(t) - f(t - 0.05)), 0);
  assert.ok(span(t => p.fireFlicker(t, true)) > 0.1, 'the still light breathes');
  assert.ok(pace(t => p.fireFlicker(t, true)) < pace(t => p.fireFlicker(t, false)) / 2, 'and slower than the flicker');
  assert.ok(nest.includes('drawPlaceBreath()') && !/kind === "(forge|lab|shop)"[^\n]*add\(/.test(nest), 'the old always-on sparks, bubbles and motes are gone from drawPlaceLife');
  assert.match(section, /opts\(\)\.calm \|\| quality\.low/, 'less motion and low quality both keep only the light');
});

test('particle counts are capped', () => {
  const p = page();
  for (const kind of ['forge', 'lab', 'shop']) for (const flip of [false, true]) for (const t of times()) {
    const b = p.placeBreath(kind, t, room(flip), false);
    for (const k of ['spark', 'steam', 'dust']) assert.ok(b[k].length <= p.BREATH_CAP[k], `${kind} ${k} at ${t}`);
  }
  const all = Object.values(p.BREATH_CAP).reduce((a, b) => a + b);
  assert.ok(all <= 24, 'a handful of pixels in all');
});

test('nothing is drawn outside the room: particles stay in it and the light falls only on its floor and walls', () => {
  const p = page();
  for (const kind of ['forge', 'lab', 'shop']) for (const flip of [false, true]) for (const t of times()) {
    const b = p.placeBreath(kind, t, room(flip), false);
    for (const k of ['spark', 'steam', 'dust']) for (const q of b[k]) {
      assert.ok(q.u >= 0 && q.u <= 1 && q.v >= 0 && q.v <= 1 && q.z >= 0 && q.z <= room().wall, `${kind} ${k} at ${t} is in the room`);
    }
  }
  // roomSurf: inside the floor diamond is floor, above its back edges up to the wall's top is wall, the rest is outside
  assert.equal(JSON.stringify(p.roomSurf(G, G.cx, G.top + G.hh).map(v => +v.toFixed(2))), '[0.5,0.5,0]');
  assert.equal(p.roomSurf(G, G.cx, G.top - G.wall - 3), null, 'above the walls is sky');
  assert.equal(p.roomSurf(G, G.cx, G.top + 2 * G.hh + 4), null, 'below the floor is the slab');
  assert.equal(p.roomSurf(G, G.cx - G.hw - 4, G.top + G.hh), null, 'beside the room');
  for (const kind of ['forge', 'lab']) for (const step of [0, 1, 2]) {
    const L = p.placeBreath(kind, 1, room(), false).light[0], pool = p.breathPool(G, L, [0.92, 1, 1.07][step]);
    assert.ok(pool.w * pool.h < G.w * G.h / 3, 'the pool is cut to the box it reaches, not the whole canvas');
    const steps = new Set();
    for (let y = 0; y < pool.h; y++) for (let x = 0; x < pool.w; x++) {
      const l = pool.lv[y * pool.w + x]; if (!l) continue;
      steps.add(l);
      assert.ok(p.roomSurf(G, pool.x0 + x + 0.5, pool.y0 + y + 0.5), `${kind}: lit pixel ${pool.x0 + x},${pool.y0 + y} is on the floor or a wall`);
    }
    assert.ok(steps.size >= 2 && steps.has(1) && steps.has(2), `${kind}: the light falls off in two or three steps (${[...steps]})`);
  }
});
