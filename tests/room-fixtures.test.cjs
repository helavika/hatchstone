const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// Rooms that live up to their names (#254): each room at home painted for real, pixel by pixel, on a pretend canvas, in very
// different looks: the study full of crystals, the playroom with its slide, climbing wall, chalk and bunting, the moss garden
// mossy with its beds, spring and shaft; all of it the room's own (paintFixtures), clear of the floor where furniture stands.
const core = read('core.js'), pixel = read('pixel.js'), iso = read('iso.js'), nest = read('nest.js'), save = read('save.js');
const src = [
  ...['rand', 'clamp', 'TAU'].map(n => line(core, new RegExp(`^const ${n} = .*$`, 'm'), n + ' should be one line in core.js')),
  pixel,
  line(iso, /^const ROOM_KIND = .*$/m, 'ROOM_KIND should be one line in iso.js'),
  line(iso, /^const DECO_AQUA = .*$/m, 'DECO_AQUA should be one line in iso.js'),
  line(iso, /^const DOOR_AT = .*$/m, 'DOOR_AT should be one line in iso.js'),
  cut(iso, '/** A shade from a ramp', '/** The isometric room\'s furniture, back to front', 'the room\'s painting should sit together in iso.js'),
  line(iso, /^const roomKey = .*$/m, 'roomKey should be one line in iso.js'),
  line(iso, /^const ISO_G = .*$/m, 'ISO_G should be one line in iso.js'),
  cut(nest, 'const ROOM_KINDS = [', '\n];', 'ROOM_KINDS should be one list in nest.js') + '\n];',
  line(nest, /^const isOutside = .*$/m, 'isOutside should be one line in nest.js'),
  line(nest, /^const isPlace = .*$/m, 'isPlace should be one line in nest.js'),
  cut(save, 'function currentTheme(', '\n// ----------', 'the backdrop rules should sit together in save.js'),
  'Object.assign(this, { THEMES, HOME_ART, paintRoomIso, roomMaterials, roomKey, roomShaft, currentTheme, themeThumb, PLAY_PAINT, ISO_G });',
].join('\n');

/** A canvas that keeps the pixels put on it. */
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
/** A nest with the nest, the garden outside, the playroom, the moss garden and the forge, every backdrop found, on a phone. */
function page(room, theme, Wd = 390, Hd = 844) {
  const isoW = 180, IC = new Proxy({}, { get: () => [90, 90, 100] });
  const p = {
    document: { createElement: () => canvas() }, LEVELS: 24, IC, game: { scene: 'nest' }, W: Wd, H: Hd, PX: 1,
    N: { cx: Wd / 2, isoTop: 330, isoW, isoH: isoW / 2, isoWall: 150, base: 60 },
    save: { room, theme, rooms: ['nest', 'yard', 'play', 'garden', 'study', 'forge'].map(kind => ({ kind, on: [] })), moon: 1, seen: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['s' + i, 1])), creatures: [{ level: 15 }] },
    unlocked: () => true, totalStars: () => 99, placeOk: () => true,
    hasDecor: () => false, wallSlot: () => ({ wall: 'L', s: 0 }), isoWallTop: x => 0, roomSpot: () => [0, 0], opts: () => ({}),
  };
  vm.runInNewContext(src, p);
  return p;
}
const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
/** Every colour in a painted room, and how many pixels of each. */
function colours(c) {
  const d = c.img.data, n = new Map();
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { const k = hex([d[i], d[i + 1], d[i + 2]]); n.set(k, (n.get(k) || 0) + 1); }
  return n;
}
/** Is anything painted at this pixel? */
const opaque = (c, x, y) => c.img.data[(Math.round(y) * c.width + Math.round(x)) * 4 + 3] > 0;


// the rooms in page(): 0 the nest, 2 the playroom, 3 the moss garden, 4 the crystal study
const LOOKS = ['amethyst', 'celestite', 'glowcap', 'smithy', 'abbey', 'churchyard', 'summit'];
const ROOMS = { nest: 0, play: 2, garden: 3, study: 4 };
const paint = (kind, id) => { const p = page(ROOMS[kind], id); return { p, c: p.paintRoomIso(p.currentTheme()) }; };
/** How many pixels two paintings of a room differ in, all told and where the floor's tiles are (inset from its edges and the walls'
 *  foot, where furniture stands), there only counting those painted in one of the colours given (not just lit by a glow). */
function diff(a, b, p, solid = []) {
  const { cx, isoTop: top, isoW: hw } = p.N, hh = hw / 2, d0 = a.img.data, d1 = b.img.data, w = a.width;
  let all = 0, floor = 0;
  for (let i = 0; i < d0.length; i += 4) {
    if (d0[i] === d1[i] && d0[i + 1] === d1[i + 1] && d0[i + 2] === d1[i + 2] && d0[i + 3] === d1[i + 3]) continue;
    all++;
    const x = (i / 4) % w, y = Math.floor(i / 4 / w), u = ((x - cx) / hw + (y - top) / hh) / 2, v = ((y - top) / hh - (x - cx) / hw) / 2;
    if (u > 0.1 && v > 0.1 && u < 0.99 && v < 0.99 && solid.includes(hex([d1[i], d1[i + 1], d1[i + 2]]))) floor++;
  }
  return { all, floor };
}
const hasAny = (cols, list) => list.some(c => cols.has(c));

test('the crystal study grows crystals and the playroom its play things, whatever look the room has', () => {
  for (const id of LOOKS) {
    const nest = paint('nest', id), study = paint('study', id), play = paint('play', id);
    const cryst = study.p.roomMaterials(id, 180, 150, 1).crys.map(hex);
    const count = (c, list) => list.reduce((n, k) => n + (colours(c).get(k) || 0), 0);
    // a lot more crystal than the nest in the same look
    assert.ok(count(study.c, cryst) > count(nest.c, cryst) + 600, `${id}: the study has ${count(study.c, cryst)} crystal pixels, the nest ${count(nest.c, cryst)}`);
    // the playroom's bright paints (the slide's red and yellow, the holds and the bunting), none of them in the nest
    const paints = play.p.PLAY_PAINT.flat().map(hex), cols = colours(play.c);
    assert.ok(paints.filter(k => cols.has(k)).length >= 12, `${id}: the playroom is painted bright`);
    assert.ok(!hasAny(colours(nest.c), play.p.PLAY_PAINT.map(r => hex(r[1]))), `${id}: the nest has none of it`);
  }
});

test('the moss garden has its moss, beds, spring and shaft in every look', () => {
  for (const id of LOOKS) {
    const { p, c } = paint('garden', id), m = p.roomMaterials(id, 180, 150, 1);
    assert.equal(p.roomShaft().col, '#fff2c0', `${id}: the light down the crack`);
    const moss = m.mossC.map(hex), n = [...colours(c)].filter(([k]) => moss.includes(k)).reduce((s, [, v]) => s + v, 0);
    const n0 = [...colours(paint('nest', id).c)].filter(([k]) => moss.includes(k)).reduce((s, [, v]) => s + v, 0);
    // (the glowcap grotto is all moss in any room; everywhere else the garden has a lot more of it than the nest)
    if (m.mood === 'grotto') assert.ok(n > n0 * 0.9, id); else assert.ok(n > n0 + 2000, `${id}: moss on the walls (${n} vs the nest's ${n0})`);
    // the spring's water (DECO_AQUA) and the beds' glowcaps
    assert.ok(hasAny(colours(c), ['#9fe4f4', '#5cc0dc']), `${id}: the spring`);
  }
});

test('what a room is built with keeps off the floor where furniture stands, and the nest is as it was', () => {
  for (const id of ['amethyst', 'glowcap', 'smithy', 'abbey']) {
    const nest = paint('nest', id), plain = page(ROOMS.nest, id);
    for (const kind of ['play', 'study']) {
      // (their light falls on the floor, as a lamp's would; nothing painted stands on it)
      const { p, c } = paint(kind, id), solid = [...p.roomMaterials(id, 180, 150, 1).crys, ...p.PLAY_PAINT.flat()].map(hex), dd = diff(nest.c, c, plain, solid);
      assert.ok(dd.all > 3000, `${kind} in ${id} has fixtures of its own (${dd.all} pixels)`);
      assert.ok(dd.floor < 60, `${kind} in ${id}: ${dd.floor} pixels of its fixtures on the furniture's tiles`);
    }
  }
  // the nest has no fixtures of its own: it's painted just as a room of no kind would be
  const p = page(0, 'amethyst'), before = p.paintRoomIso('amethyst');
  p.save.rooms[0].kind = 'lab-less'; assert.equal(diff(before, p.paintRoomIso('amethyst'), p).all, 0);
});

test('each room is painted and kept by its kind', () => {
  const key = (kind, id) => page(ROOMS[kind], id).roomKey();
  for (const id of LOOKS) assert.equal(new Set(Object.keys(ROOMS).map(k => key(k, id))).size, 4, id);
  assert.match(read('iso.js'), /const fixed = atHome\(\) && paintFixtures\(roomKindNow,/);
});
