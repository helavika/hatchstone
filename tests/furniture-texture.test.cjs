const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// the furniture at home painted for real, pixel by pixel, on a pretend canvas: every piece still paints, with the same
// outline as before (so where it stands, what a tap finds and what a save remembers stay as they were), but now in materials
const core = read('core.js'), pixel = read('pixel.js'), iso = read('iso.js'), data = read('data.js');
const src = [
  ...['rand', 'clamp', 'lerp', 'TAU'].map(n => line(core, new RegExp(`^const ${n} = .*$`, 'm'), n + ' should be one line in core.js')),
  pixel,
  'const LANG = "en", tr = s => s;',
  cut(data, 'const CRYSTALS = [', '\nconst CRYSTAL = ', 'CRYSTALS should be one list in data.js'),
  line(data, /^const CRYSTAL = .*$/m, 'CRYSTAL should be one line in data.js'),
  cut(iso, 'const IC = Object.fromEntries', '/** The dab of colour on a garden label', 'the furniture painters should sit together in iso.js'),
  cut(iso, 'const CLOUD_RAMP', '\nfunction drawCloud', 'the cloud should be painted in one place in iso.js'),
  line(iso, /^const mixHex = .*$/m, 'mixHex should be one line in iso.js'),
  cut(iso, 'function hueRamp(', '\n/**', 'hueRamp should be one function in iso.js'),
  cut(iso, "// the rugs' yarns", '\n\n', 'the rug should be one function in iso.js'),
  'Object.assign(this, { ISO_ART, ISO_PLACES, ISO_FIXED, isoArt, isoRug, CRYSTAL, pxHex, cloudSprite: typeof cloudSprite === "function" ? cloudSprite : null });',
].join('\n');

/** A canvas that keeps the pixels put on it. */
function canvas() {
  const c = { width: 0, height: 0, img: null };
  c.getContext = () => ({
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: img => { c.img = img; }, getImageData: () => c.img, drawImage() {},
    translate() {}, scale() {}, fillRect() {}, beginPath() {}, ellipse() {}, fill() {},
  });
  c.toDataURL = () => 'data:';
  return c;
}
function page() {
  const p = {
    document: { createElement: () => canvas() }, PX: 3, W: 390, H: 844, game: { time: 0 },
    N: { isoW: 183, isoWall: 150 }, save: { keepsakes: { feather: 2, rose: 1 }, decor: {} },
    rugSize: () => [93, 46], roomSpot: () => [195, 520], cachedSprite: (o, s, k, make) => make(),
    fxAge: () => 9, hasDecor: () => true, isoPieces: {},
  };
  vm.runInNewContext(src, p);
  return p;
}
/** What a tap sees of a picture: its size and which pixels are solid enough to hit (see spriteHit). */
function mask(c) {
  const d = c.img.data, w = c.width; let n = 0, h = 2166136261;
  for (let i = 0; i < d.length / 4; i++) if (d[i * 4 + 3] > 40) { n++; h = Math.imul(h ^ i, 16777619) >>> 0; }
  return `${c.width}x${c.height}:${n}:${h.toString(16)}`;
}
/** Every colour in a picture. */
const colours = c => { const d = c.img.data, s = new Set(); for (let i = 0; i < d.length; i += 4) if (d[i + 3]) s.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); return s; };
const PIECES = ['bed:nest', 'bed:gazebo', 'bed:hammock', 'bed:basket', 'bed:canopy', 'lamp', 'shelf', 'table', 'chest', 'musicbox', 'swing', 'mushrooms', 'spring', 'armchair', 'bookcase', 'plant', 'drum', 'blocks', 'telescope', 'bench', 'lamppost', 'birdbath', 'altar'];
function paint(p, id, t = 31) {
  const [base, style] = id.split(':');
  if (base === 'shelf') return p.isoArt(t * 2 + 10, t * 1.3 + 10, T => p.ISO_ART.shelf(t, T, 6, Math.round(t * 0.75), { gems: [p.CRYSTAL.amethyst.c.map(p.pxHex), p.CRYSTAL.celestite.c.map(p.pxHex)] }));
  const f = p.ISO_FIXED[base] || p.ISO_PLACES[base] || { fw: 1, fd: 1 }, pad = Math.ceil(t * 1.2) + 3, w = Math.ceil((f.fw + f.fd) * t + pad * 2), h = (f.fw + f.fd) * t / 2 + t * 4 + pad;
  return p.isoArt(w, h, T => p.ISO_ART[base](t, T, f.fd * t + pad, t * 4 + pad / 2, style ? { style } : {}));
}

/** Each piece's outline as it was before the texture pass, at a phone's tile size and at the Decor list's (the glowing ones'
 *  glows redrawn since, in the moss garden's three see-through steps: see T.glow). */
const BEFORE = {
  'bed:nest|31': '206x227:5357:bb495d15',
  'bed:nest|16': '110x119:1496:a2ceb476',
  'bed:gazebo|31': '206x227:8530:c4bb85a5',
  'bed:gazebo|16': '110x119:2527:4a9520e8',
  'bed:hammock|31': '206x227:5789:4e6cf9af',
  'bed:hammock|16': '110x119:1718:7a1f80a4',
  'bed:basket|31': '206x227:4616:3be4f78d',
  'bed:basket|16': '110x119:1291:f1a9f07e',
  'bed:canopy|31': '206x227:7721:7d681ee9',
  'bed:canopy|16': '110x119:2140:543e3583',
  'lamp|31': '144x196:1912:7bdfba7d',
  'lamp|16': '78x103:575:77536a4d',
  'shelf|31': '72x51:1081:74461186',
  'shelf|16': '42x31:456:bc7d4f3e',
  'table|31': '144x196:1597:7f2720d2',
  'table|16': '78x103:567:f2869f74',
  'chest|31': '144x196:1466:a3a6ff90',
  'chest|16': '78x103:429:26d52362',
  'musicbox|31': '144x196:2513:226fb759',
  'musicbox|16': '78x103:736:dec9b8fd',
  'swing|31': '144x196:2146:73cd2e09',
  'swing|16': '78x103:826:d20383bb',
  'mushrooms|31': '144x196:2909:8ef28ec9',
  'mushrooms|16': '78x103:843:cab62407',
  'spring|31': '144x196:1439:3cc138ee',
  'spring|16': '78x103:394:8fb63f3b',
  'armchair|31': '144x196:2768:eb816008',
  'armchair|16': '78x103:790:86833d4d',
  'bookcase|31': '144x196:3753:41bb3f60',
  'bookcase|16': '78x103:1069:a7c2c064',
  'plant|31': '144x196:952:57811dc',
  'plant|16': '78x103:309:fd80f91f',
  'drum|31': '144x196:1075:e6c6998f',
  'drum|16': '78x103:365:9c7d187',
  'blocks|31': '144x196:1342:3d85d25d',
  'blocks|16': '78x103:369:2f4dbecf',
  'telescope|31': '144x196:994:2708f6b',
  'telescope|16': '78x103:416:19e6fbd5',
  'bench|31': '144x196:1797:d8d29387',
  'bench|16': '78x103:557:d1e6f461',
  'lamppost|31': '144x196:2117:275b2d00',
  'lamppost|16': '78x103:705:c3ff8c77',
  'birdbath|31': '144x196:1098:4dec1d2c',
  'birdbath|16': '78x103:338:bc8d337',
  'altar|31': '144x196:2726:58b55482',
  'altar|16': '78x103:869:8507daf4',
  'rug|false': '68x38:1500:d19d9aa9',
  'rug|true': '68x38:1513:5cf522fa',
};

if (process.env.PRINT_MASKS) { const p = page(); for (const id of PIECES) for (const t of [31, 16]) console.log(`'${id}|${t}': '${mask(paint(p, id, t))}',`); for (const st of [false, true]) console.log(`'rug|${st}': '${mask(p.isoRug(st).c)}',`); }

test('every piece at home still paints, in the same outline as before', () => {
  const p = page();
  for (const id of PIECES) for (const t of [31, 16]) assert.equal(mask(paint(p, id, t)), BEFORE[`${id}|${t}`], `${id} at ${t}`);
  for (const st of [false, true]) assert.equal(mask(p.isoRug(st).c), BEFORE[`rug|${st}`], 'the rug, starry: ' + st);
  const data = read('data.js'), ids = [...data.matchAll(/\{ id: "(\w+)"/g)].map(m => m[1]).filter(id => p.ISO_PLACES[id]);
  assert.ok(ids.length >= 15, 'the floor pieces are found');
  for (const id of ids) assert.equal(typeof p.ISO_ART[id], 'function', id + ' has a painter');
});

test('footprints and favourite tiles stay as they were, so saved layouts still fit', () => {
  const p = page(), f = id => JSON.stringify(p.ISO_PLACES[id]);
  assert.equal(f('lamp'), '{"fw":1,"fd":1,"at":[[0,0],[1,0]]}');
  assert.equal(f('table'), '{"fw":1,"fd":1,"at":[[4,3],[3,4],[4,2]]}');
  assert.equal(f('chest'), '{"fw":1,"fd":1,"at":[[0,5],[1,5],[0,4]]}');
  assert.equal(f('musicbox'), '{"fw":1,"fd":1,"at":[[0,3],[3,0],[5,2],[2,5]]}');
  assert.equal(f('swing'), '{"fw":1,"fd":1,"at":[[2,0],[3,0],[1,0],[0,2],[0,3]]}');
  assert.equal(f('mushrooms'), '{"fw":1,"fd":1,"at":[[5,5],[4,5],[5,4]]}');
  assert.equal(f('spring'), '{"fw":1,"fd":1,"at":[[2,0],[3,0],[1,0]]}');
  assert.equal(JSON.stringify(p.ISO_FIXED.bed), '{"fw":2,"fd":2,"at":[4,0]}');
});

test('the baked pieces are cached under the same keys', () => {
  assert.ok(iso.includes('const key = `${p.id}|${p.i},${p.j}|${p.flip}|${tw.toFixed(2)}|${Math.round(bx)},${Math.round(by)}|${JSON.stringify(extra)}`;'), 'a piece\'s key');
  assert.ok(iso.includes('cachedSprite(isoPieces, "rug", `${rx}|${Math.round(cx)},${Math.round(cy)}|${PX}|${starry}|${starry ? Math.floor(game.time / 400) : ""}`'), 'the rug\'s key');
  assert.ok(iso.includes('cachedSprite(isoPieces, "shelf", `${m.wall}|${m.s}|${tw.toFixed(2)}|${Math.round(bx)},${Math.round(by)}|${JSON.stringify(best)}|${spark}`'), 'the shelf\'s key');
});

test('materials you can read: grain on the woods, seams on the table, cords on the rug, a glint on brass and water', () => {
  const p = page(), hex = h => parseInt(h.slice(1), 16), has = (c, h) => colours(c).has(hex(h));
  // the music box's rosewood and the swing's root-wood carry grain now: more shades of their wood than the flat bands had
  const woods = (c, ramp) => ramp.filter(h => has(c, h)).length;
  assert.ok(woods(paint(p, 'musicbox'), ['#d8907a', '#a85a50', '#7a3a40', '#52243a', '#301428']) >= 4, 'rosewood grain');
  assert.ok(woods(paint(p, 'swing'), ['#d8a868', '#a8743e', '#7a4e28', '#4e3018', '#2e1c10']) >= 4, 'root-wood grain');
  // the tea table's top is boards with dark seams between
  const top = paint(p, 'table'), d = top.img.data; let seams = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] && ((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]) === hex('#5e3a1c')) seams++;
  assert.ok(seams > 30, 'seams on the table top: ' + seams);
  // the rug: cords in at least four shades of its yarn, a dark binding, and the same ellipse
  const rug = p.isoRug(false).c, yarn = ['#f0c4cc', '#dc8aa6', '#b85a84', '#8c3d68', '#5e2952', '#341634'];
  assert.ok(yarn.filter(h => has(rug, h)).length >= 5, 'rug shades');
  // one crisp white highlight on the chest's brass, the spring's water, the lamp's collar
  for (const id of ['chest', 'spring', 'lamp', 'musicbox']) assert.ok(has(paint(p, id), '#ffffff'), id + ' has a glint');
});

test('every floor piece that stands up has a soft contact shadow', () => {
  const contact = line(iso, /^const CONTACT = [\s\S]*?\};$/m, 'CONTACT should be one table in iso.js');
  for (const id of ['bed', 'lamp', 'table', 'chest', 'musicbox', 'swing', 'mushrooms', 'armchair', 'bookcase', 'plant', 'keepjar']) assert.match(contact, new RegExp(`\\b${id}: [0-9.]+`), id);
  assert.doesNotMatch(contact, /\bspring:/, 'the pond lies flat in the floor');
});
