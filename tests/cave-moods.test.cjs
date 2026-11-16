const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// the rooms at home painted for real, pixel by pixel, on a pretend canvas: every backdrop is a mood of the cave there (the five
// that aren't caves of their own each its own: a grotto, a gallery, a crypt, a moonwell, an ice cave), and the valley as it was
const core = read('core.js'), pixel = read('pixel.js'), iso = read('iso.js'), nest = read('nest.js'), save = read('save.js');
const src = [
  ...['rand', 'clamp', 'TAU'].map(n => line(core, new RegExp(`^const ${n} = .*$`, 'm'), n + ' should be one line in core.js')),
  pixel,
  line(iso, /^const ROOM_KIND = .*$/m, 'ROOM_KIND should be one line in iso.js'),
  line(iso, /^const DECO_AQUA = .*$/m, 'DECO_AQUA should be one line in iso.js'),
  line(iso, /^const DOOR_AT = .*$/m, 'DOOR_AT should be one line in iso.js'),
  cut(iso, '/** A shade from a ramp', '/** The isometric room\'s furniture, back to front', 'the room\'s painting should sit together in iso.js'),
  line(iso, /^const roomKey = .*$/m, 'roomKey should be one line in iso.js'),
  cut(nest, 'const ROOM_KINDS = [', '\n];', 'ROOM_KINDS should be one list in nest.js') + '\n];',
  line(nest, /^const isOutside = .*$/m, 'isOutside should be one line in nest.js'),
  line(nest, /^const isPlace = .*$/m, 'isPlace should be one line in nest.js'),
  cut(save, 'function currentTheme(', '\n// ----------', 'the backdrop rules should sit together in save.js'),
  'Object.assign(this, { THEMES, HOME_ART, paintRoomIso, roomMaterials, roomKey, roomShaft, currentTheme, themeThumb });',
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
    save: { room, theme, rooms: ['nest', 'yard', 'play', 'garden', 'forge'].map(kind => ({ kind, on: [] })), moon: 1, seen: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['s' + i, 1])), creatures: [{ level: 15 }] },
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

const MOODS = { glowcap: 'grotto', smithy: 'gallery', abbey: 'crypt', churchyard: 'moonwell', summit: 'aurora' };
const CAVES = ['amethyst', 'celestite', 'malachite', 'labradorite', 'frost'];
// what gives the valley's halls and meadows away: the timber hall's limewashed daub, the abbey's moon in its Gothic window,
// the ruins' green ivy, the sky through a cave's window
const DAUB = ['#958a74', '#b8ad94', '#d4caae', '#e8e0c8'], GOTHIC_MOON = '#efe6ff', IVY = ['#1e5233', '#2f7d4a', '#57ad6a'], MOON = '#fff8d6';

test('every backdrop that isn\'t a cave has a mood of its own at home, with a name in both languages', () => {
  const p = page(2, 'amethyst');
  for (const [id, mood] of Object.entries(MOODS)) {
    assert.equal(p.HOME_ART[id].mood, mood, id);
    assert.ok(p.THEMES.find(t => t.id === id).home, id + ' has a name at home');
  }
  for (const id of CAVES) assert.equal(p.HOME_ART[id], undefined, id + ' is a crystal cave, as before');
  const uk = read('i18n.js');
  for (const name of ['Грот сяйних шапинок', 'Ліхтарна штольня', 'Крипта зорепаду', 'Місячна криниця', 'Сяйна крижана печера']) assert.ok(uk.includes(`home: "${name}"`), name);
  // its thumbnail in the chest is its cave at home, not the meadow or the hall
  assert.match(pixel, /const k = home && HOME_ART\[id\] \? id \+ "\|home" : id/);
});

test('each mood paints a cave at home: walls of rock or stone, no sky, no house, no meadow', () => {
  for (const room of [0, 2, 3]) for (const id of [...Object.keys(MOODS), ...CAVES]) {
    const p = page(room, id), c = p.paintRoomIso(p.currentTheme()), m = p.roomMaterials(id, 180, 150, 1), cols = colours(c);
    assert.equal(p.currentTheme(), id);
    assert.equal(m.kind, 'cave', `${id} in room ${room}`);
    assert.equal(m.indoor, true);
    assert.equal(m.mood, MOODS[id] || 'crystal');
    // walls stand round the back of the floor (outdoors there would be none)
    assert.ok(opaque(c, p.N.cx, p.N.isoTop - 100) && opaque(c, p.N.cx - 120, p.N.isoTop - 40), `${id} has walls`);
    for (const col of { smithy: DAUB, abbey: [GOTHIC_MOON], churchyard: IVY }[id] || []) assert.ok(!cols.has(col), `${id} in room ${room} shows ${col} from the valley`);
    // only the crystal caves keep their window on the night (and the moonwell its moon, down the well)
    if (MOODS[id] && id !== 'churchyard') assert.ok(!cols.has(MOON), `${id} in room ${room} has a window on the sky`);
  }
});

test('each mood has its own light: lanterns, candles, the moon down the well, the northern lights', () => {
  const lit = id => { const p = page(2, id), c = p.paintRoomIso(id); return colours(c); };
  // the lanterns' amber glass, the candles' flames, the stained glass, the moon in the well, the aurora's green through the ice
  assert.ok(lit('smithy').has('#f6c46a'));
  for (const col of ['#e0634f', '#e88bb1', '#69b7d6']) assert.ok(lit('abbey').has(col), 'crypt ' + col);
  assert.ok(lit('churchyard').has(MOON));
  assert.ok(lit('summit').has('#6fe0b0') || lit('summit').has('#2fa383'));
  // the grotto and the moss garden have the warm shaft from the crack, the moonwell a cold one, the others none
  const shaft = (room, id) => page(room, id).roomShaft();
  assert.equal(shaft(2, 'glowcap').col, '#fff2c0');
  assert.equal(shaft(3, 'amethyst').col, '#fff2c0');
  assert.equal(shaft(2, 'churchyard').col, '#d8ccff');
  for (const id of ['amethyst', 'smithy', 'abbey', 'summit']) assert.equal(shaft(2, id), null, id);
  assert.equal(shaft(4, 'glowcap'), null, 'not in the valley');
});

test('the valley is as it was: the forge a timber hall, the abbey a hall with its window, the wood under the sky', () => {
  const p = page(4, 'smithy');
  assert.equal(p.roomMaterials('smithy', 180, 150, 1).kind, 'timber');
  assert.equal(p.roomMaterials('smithy', 180, 150, 1).mood, null);
  assert.ok(DAUB.some(c => colours(p.paintRoomIso('smithy')).has(c)), 'the timber hall keeps its daub');
  p.save.theme = 'abbey';
  assert.equal(p.roomMaterials('abbey', 180, 150, 1).kind, 'hall');
  assert.ok(colours(p.paintRoomIso('abbey')).has(GOTHIC_MOON), 'the abbey keeps its moonlit window');
  p.save.theme = 'glowcap';
  assert.equal(p.roomMaterials('glowcap', 180, 150, 1).indoor, false, 'the camp is under the sky');
  assert.ok(!opaque(p.paintRoomIso('glowcap'), p.N.cx, p.N.isoTop - 100), 'no walls out of doors');
  p.save.theme = 'churchyard';
  assert.equal(p.roomMaterials('churchyard', 180, 150, 1).kind, 'ruin');
  assert.ok(IVY.some(c => colours(p.paintRoomIso('churchyard')).has(c)), 'the ruins keep their ivy');
});

test('a room painted once is kept by what it shows: the mood, the room it is in, at home or in the valley', () => {
  const key = (room, id) => page(room, id).roomKey();
  // the same backdrop in the playroom and in the forge is two different rooms; two moods in one room are too
  assert.notEqual(key(2, 'smithy'), key(4, 'smithy'));
  assert.notEqual(key(2, 'smithy'), key(2, 'abbey'));
  // and the moss garden's grotto is not the playroom's (it has its beds and spring)
  assert.notEqual(key(2, 'glowcap'), key(3, 'glowcap'));
  assert.equal(key(2, 'abbey'), key(2, 'abbey'));
  // the backdrop behind the room is kept apart at home and in the valley too
  assert.match(save, /const key = `\$\{id\}\|\$\{floor\.toFixed\(3\)\}\|\$\{deep\}\|\$\{home\}`/);
});

test('the caves at home are textured stone by stone, in ramps shifted in hue, and quickly enough', () => {
  const p = page(2, 'amethyst');
  // a hue-shifted ramp: the shadows bluer than the lights, the lights warmer (redder) than the shadows
  const m = p.roomMaterials('amethyst', 180, 150, 1), r = m.wallC;
  assert.ok(r.length >= 6, 'six or more steps');
  const blueShare = c => c[2] / (c[0] + c[1] + c[2] + 1), redShare = c => c[0] / (c[0] + c[1] + c[2] + 1);
  assert.ok(blueShare(r[1]) > blueShare(r[r.length - 1]) && redShare(r[r.length - 1]) > redShare(r[1]));
  // the valley's own grotto is drawn as before
  assert.notDeepEqual(page(4, 'amethyst').roomMaterials('amethyst', 180, 150, 1).wallC, r);
  // stones, not noise: a handful of shades per material
  const c = p.paintRoomIso('amethyst'), cols = colours(c);
  assert.ok(cols.size < 60, `a limited palette, not noise (${cols.size} colours)`);
  // painting a room at home takes no more than a few times what it did (it's painted once and kept, see roomKey);
  // this runs on a plain-JS canvas stand-in, so shared CI runners are slow: the bound only catches a runaway
  const t0 = process.hrtime.bigint();
  for (const id of ['amethyst', 'smithy', 'abbey', 'churchyard', 'summit', 'glowcap']) page(2, id).paintRoomIso(id);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 6;
  assert.ok(ms < 2000, `a room at home paints in ${ms.toFixed(0)} ms`);
});
