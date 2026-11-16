const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// the rooms at home are a row of caves by the grotto: which backdrops they take, and what they show for an old pick
const pixel = read('pixel.js'), iso = read('iso.js'), nest = read('nest.js'), save = read('save.js');
const themesSrc = [
  cut(pixel, 'const THEMES = [', '\n];', 'THEMES should be one list in pixel.js') + '\n];',
  line(pixel, /^const THEME = .*$/m, 'THEME should be one line in pixel.js'),
  line(pixel, /^const CAVE_THEME = .*$/m, 'CAVE_THEME should be one line in pixel.js'),
  line(iso, /^const ROOM_KIND = .*$/m, 'ROOM_KIND should be one line in iso.js'),
  cut(nest, 'const ROOM_KINDS = [', '\n];', 'ROOM_KINDS should be one list in nest.js') + '\n];',
  line(nest, /^const isOutside = .*$/m, 'isOutside should be one line in nest.js'),
  line(nest, /^const isPlace = .*$/m, 'isPlace should be one line in nest.js'),
  cut(save, 'function currentTheme(', '\n// ----------', 'the backdrop rules should sit together in save.js'),
  'Object.assign(this, { THEMES, currentTheme, roomTheme, ownTheme, roomThemes, lookOf });',
].join('\n');

/** A pretend nest with these rooms, every backdrop found (or none but the first, with found: false). */
function home(kinds, { found = true, theme, room = 0 } = {}) {
  const page = {
    LEVELS: 24, game: { scene: 'nest' },
    save: { rooms: kinds.map(k => typeof k === 'string' ? { kind: k, on: [] } : k), room, theme, moon: found, seen: found ? Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['s' + i, 1])) : {}, creatures: found ? [{ level: 15 }] : [] },
    unlocked: n => found || n <= 1, totalStars: () => found ? 99 : 0, placeOk: () => found,
  };
  vm.runInNewContext(themesSrc, page);
  return page;
}
const CAVES = ['amethyst', 'celestite', 'malachite', 'labradorite', 'frost'];
const HOMES = ['nest', 'play', 'garden', 'study'];

test('every room at home takes the cave backdrops only (the moss garden its glowcap grotto too); the garden outside and the valley keep theirs', () => {
  const p = home(['nest', 'yard', ...HOMES.slice(1), 'shop', 'grotto']);
  for (const kind of HOMES) assert.deepEqual([...p.roomThemes(p.save.rooms.findIndex(r => r.kind === kind))].sort(), [...CAVES, ...(kind === 'garden' ? ['glowcap'] : [])].sort(), kind);
  // Fennel's garden is under the sky, and the places on the map take any backdrop, as before
  assert.deepEqual([...p.roomThemes(1)], ['glowcap', 'summit']);
  assert.equal(p.roomThemes(5).length, p.THEMES.length);
  assert.equal(p.roomThemes(6).length, p.THEMES.length);
  // and at home every one of them is drawn as a cave: no meadow, wood or sky in any room there
  for (const kind of HOMES) for (const id of p.roomThemes(p.save.rooms.findIndex(r => r.kind === kind))) assert.equal(p.lookOf(id, p.save.rooms.findIndex(r => r.kind === kind)), 'cave', `${kind} ${id}`);
  assert.equal(p.lookOf('glowcap', 1), 'wood', 'outside the glowcaps are still a wood');
});

test('the moss garden is its glowcap grotto from the start, even before the glowcaps are found; the study a blue cave', () => {
  for (const found of [true, false]) {
    // bought with its glowcaps (or before they were found, with no backdrop at all)
    for (const theme of ['glowcap', null]) {
      const p = home(['nest', 'yard', 'play', { kind: 'garden', on: [], theme }], { found, room: 3, theme });
      assert.equal(p.currentTheme(), 'glowcap', `garden with ${theme}, found ${found}`);
    }
    const p = home(['nest', 'yard', 'play', 'garden', 'study'], { found, room: 4 });
    assert.equal(p.currentTheme(), 'celestite');
    assert.equal(home(['nest', 'play'], { found, room: 1 }).currentTheme(), 'amethyst');
    // the glowcap grotto is the moss garden's own: not the other rooms' (yet)
    assert.equal(home(['nest', 'play'], { found, room: 1, theme: 'glowcap' }).currentTheme(), 'amethyst');
  }
  // a cave picked for the moss garden shows; the glowcaps are still its own whatever it shows
  assert.equal(home(['nest', 'yard', 'play', 'garden'], { room: 3, theme: 'frost' }).currentTheme(), 'frost');
  // the shop's renovation shows the grotto the room will be, and a new one is built on it
  assert.match(nest, /themeThumb\(k\.theme \|\| "amethyst", true\)/);
  assert.match(nest, /theme: kind\.theme \|\| null/);
});

test('a meadow or a hall saved in a room at home shows a cave, and stays in the save for later', () => {
  for (const theme of ['smithy', 'abbey', 'churchyard', 'glowcap', 'summit']) {
    const p = home(['nest', 'yard', 'play', 'garden'], { room: 2, theme });
    assert.equal(p.currentTheme(), 'amethyst', theme);
    assert.equal(p.save.theme, theme, 'the pick is kept');
    assert.equal(p.roomTheme(3, theme), 'glowcap', 'the moss garden shows its own grotto for ' + theme);
  }
  // a cave picked for a room shows, and a cave not found yet doesn't
  assert.equal(home(['nest', 'play'], { room: 1, theme: 'frost' }).currentTheme(), 'frost');
  assert.equal(home(['nest', 'play'], { room: 1, theme: 'frost', found: false }).currentTheme(), 'amethyst');
  // the valley is as it was: the forge's timber hall, the camp's glowcap wood
  assert.equal(home(['nest', 'yard', 'forge'], { room: 2, theme: 'smithy' }).currentTheme(), 'smithy');
  assert.equal(home(['nest', 'yard', 'camp'], { room: 2, theme: 'glowcap', found: false }).currentTheme(), 'glowcap');
  assert.equal(home(['nest', 'yard'], { room: 1, theme: 'glowcap' }).currentTheme(), 'glowcap');
});

test('old saves: a moss garden built before the glowcaps were found gets its grotto; a cave picked for it stays', () => {
  const fix = line(save, /^  d\.rooms\.forEach\(\(r, i\) => \{ if \(r\.kind !== "garden"\).*$/m, 'the moss garden\'s migration should be one line in migrate');
  const run = d => { vm.runInNewContext(`(function (d) {\n${fix}\n})(d)`, { d }); return d; };
  // in another room: the garden's own entry
  let d = run({ room: 0, theme: 'amethyst', rooms: [{ kind: 'nest' }, { kind: 'yard' }, { kind: 'play', theme: null }, { kind: 'garden', theme: null }] });
  assert.equal(d.rooms[3].theme, 'glowcap');
  assert.equal(d.rooms[2].theme, null, 'the playroom is left alone');
  assert.equal(d.theme, 'amethyst', 'and so is the room you are in');
  // standing in it: the backdrop in the save's own field
  d = run({ room: 1, rooms: [{ kind: 'nest' }, { kind: 'garden', theme: null }] });
  assert.equal(d.theme, 'glowcap');
  // a pick of its own is kept
  d = run({ room: 0, rooms: [{ kind: 'nest' }, { kind: 'garden', theme: 'frost' }] });
  assert.equal(d.rooms[1].theme, 'frost');
});

test('the moss garden is called that everywhere, in both languages', () => {
  const i18n = read('i18n.js'), ui = read('ui.js');
  assert.match(nest, /\{ id: "garden", name: "Moss garden"/);
  assert.match(i18n, /"Moss garden": "Мохова оранжерея"/);
  const note = nest.match(/\{ id: "garden"[^}]*note: "([^"]+)"/)[1];
  assert.ok(i18n.includes(`"${note}": "`), 'its note in the shop is in Ukrainian too');
  assert.match(i18n, /glowcap: \{ name: "Ліс сяйних шапинок", home: "Грот сяйних шапинок"/);
  // nothing left calls it the garden room (Fennel's garden outside is the only garden)
  for (const [f, src] of [['nest', nest], ['i18n', i18n], ['ui', ui]]) {
    assert.ok(!/Garden room|garden room/.test(src), f + ' still says garden room');
    assert.ok(!/"Садова"|потім садову/.test(src), f + ' still says Садова');
  }
  // the birdbath stays outside: the moss garden has its own spring and basin
  assert.match(read('data.js'), /id: "birdbath".*rooms: \["yard"\]/);
});

test('the moss garden\'s own garden is drawn into the room: it takes no floor tiles and stays clear of both tunnels', () => {
  const ROOM_FIXED = vm.runInNewContext('(' + line(iso, /^const ROOM_FIXED = .*$/m, 'ROOM_FIXED should be one line in iso.js').replace(/^const ROOM_FIXED = /, '').replace(/;$/, '') + ')');
  assert.equal(ROOM_FIXED.garden, undefined, 'nothing fixed stands on its floor: only its bed, like any room');
  const G = vm.runInNewContext('(' + line(iso, /^const MOSS_GARDEN = .*$/m, 'MOSS_GARDEN should be one line in iso.js').replace(/^const MOSS_GARDEN = /, '').replace(/;$/, '') + ')');
  const [at, dw] = line(iso, /^const DOOR_AT = .*$/m, 'DOOR_AT').match(/[\d.]+/g).map(Number), door = at - dw;
  assert.ok(G.bedL[1] < door && G.bedR[1] < door, 'the beds end before the tunnels');
  assert.ok(G.basin + 0.08 < door && G.basin > 0.08, 'and so does the basin');
  // they stand against the walls, less than a third of a tile deep (6 tiles to the floor)
  const paint = cut(iso, 'function paintMossGarden(', '\nconst mossLight', 'paintMossGarden should sit in iso.js');
  for (const depth of [paint.match(/const D = ([\d.]+)/)[1], paint.match(/rb = ([\d.]+)/)[1]].map(Number)) assert.ok(depth < 1 / 6 / 3 + 0.05 && depth <= 0.11, 'depth ' + depth);
  // and its light respects less motion
  assert.match(cut(iso, 'function drawMossLight(', '\n}\n', 'drawMossLight'), /opts\(\)\.calm/);
});

// the row of caves and the tunnels between them
const core = read('core.js');
const rowSrc = [
  line(core, /^const clamp = .*$/m, 'clamp should be one line in core.js'),
  line(pixel, /^const pxHash = .*$/m, 'pxHash should be one line in pixel.js'),
  line(save, /^const isoAt = .*$/m, 'isoAt should be one line in save.js'),
  line(iso, /^const DOOR_AT = .*$/m, 'DOOR_AT should be one line in iso.js'),
  cut(nest, 'const ROOM_KINDS = [', '\n];', 'ROOM_KINDS should be one list in nest.js') + '\n];',
  line(nest, /^const isOutside = .*$/m, 'isOutside should be one line in nest.js'),
  line(nest, /^const isPlace = .*$/m, 'isPlace should be one line in nest.js'),
  line(nest, /^const roomOpen = .*$/m, 'roomOpen should be one line in nest.js'),
  cut(nest, 'function stepRoom(', '\n}\n', 'stepRoom should sit in nest.js') + '\n}',
  cut(nest, 'function roomDoors(', '\n}\n', 'roomDoors should sit in nest.js') + '\n}',
  cut(nest, 'function passageShape(', '\n}\n', 'passageShape should sit in nest.js') + '\n}',
  line(nest, /^const intoWall = .*$/m, 'intoWall should be one line in nest.js'),
  line(nest, /^const onScreen = .*$/m, 'onScreen should be one line in nest.js'),
  'Object.assign(this, { stepRoom, roomDoors, passageShape, intoWall, onScreen });',
].join('\n');
/** The row at home on a screen this wide: the nest, the garden outside, the playroom, the shop, the garden room and the study. */
function row(room, Wd = 390) {
  const isoW = Math.min(Wd * 0.47, 400);
  const page = { W: Wd, N: { cx: Wd / 2, isoTop: 200, isoW, isoH: isoW / 2, isoWall: isoW, base: 60 }, placeOk: () => true,
    save: { room, rooms: ['nest', 'yard', 'play', 'shop', 'garden', 'study'].map(kind => ({ kind, on: [] })) } };
  vm.runInNewContext(rowSrc, page);
  return page;
}

test('the arrows stop at both ends of the row of caves, and go where the tunnels go', () => {
  assert.equal(row(0).stepRoom(-1), 0, 'nothing before the nest');
  assert.equal(row(5).stepRoom(1), 5, 'nothing past the study');
  // through the rooms of home only, skipping the garden outside and the shop
  assert.equal(row(0).stepRoom(1), 2);
  assert.equal(row(2).stepRoom(1), 4);
  assert.equal(row(4).stepRoom(-1), 2);
  for (const r of [0, 2, 4, 5]) {
    const p = row(r), doors = Object.fromEntries(p.roomDoors().map(d => [d.wall, d.to]));
    assert.equal(doors.L ?? r, p.stepRoom(-1), 'the left tunnel and the back arrow lead to the same room');
    assert.equal(doors.R ?? r, p.stepRoom(1), 'the right tunnel and the forward arrow lead to the same room');
  }
  // the straight-on view hides the arrow at an end
  assert.match(nest, /\$\(id\)\.style\.visibility = to === save\.room \? "hidden" : ""/);
});

test('both ends of a tunnel are cut alike: the same size and outline, in a mirror', () => {
  for (const Wd of [390, 1280]) {
    const p = row(2, Wd), R = p.passageShape('R'), L = p.passageShape('L'), box = q => {
      const xs = q.map(v => v[0]), ys = q.map(v => v[1]);
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    };
    assert.equal(R.length, L.length);
    const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);
    near(box(R).w, box(L).w, 'width'); near(box(R).h, box(L).h, 'height');
    // the right wall's mouth is the left wall's, mirrored across the middle of the room
    R.forEach(([x, y], k) => { near(x, Wd - L[k][0], 'x of point ' + k); near(y, L[k][1], 'y of point ' + k); });
    // a round mouth standing on the floor, lower than the room's wall, and the far end back into the rock on each side
    assert.ok(box(R).h < p.N.isoWall * 0.55 && box(R).h > 0);
    const [rx, ry] = p.intoWall('R', 0.05), [lx, ly] = p.intoWall('L', 0.05);
    near(rx, -lx, 'into the wall, across'); near(ry, ly, 'into the wall, up'); assert.ok(ry < 0 && rx > 0);
  }
  // one function draws both ends, labelled with the room on the other side, in the colours of the cave it leads to
  const draw = cut(nest, 'function drawPassages(', '\n}\n', 'drawPassages should sit in nest.js');
  assert.match(draw, /passageShape\(p\.wall\)/);
  assert.match(draw, /roomName\(p\.to\)/);
  assert.match(draw, /caveColours\(p\.to\)/);
  assert.match(draw, /caveColours\(save\.room\)/);
});

test('a tunnel\'s label stays whole on a phone screen', () => {
  const p = row(2, 390);
  // the longest room name, over a tunnel at either edge of a 390px screen
  for (const x of [-20, 10, 195, 370, 410]) {
    const w = 150, c = p.onScreen(x, w);
    assert.ok(c - w / 2 >= 0 && c + w / 2 <= 390, `label at ${x} sits at ${c}`);
  }
  assert.equal(p.onScreen(195, 100), 195, 'a label that fits stays over its tunnel');
});
