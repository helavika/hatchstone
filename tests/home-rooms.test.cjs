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
  'Object.assign(this, { THEMES, currentTheme, roomTheme, ownTheme, roomThemes });',
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

test('every room at home takes the cave backdrops only; the garden outside and the valley keep theirs', () => {
  const p = home(['nest', 'yard', ...HOMES.slice(1), 'shop', 'grotto']);
  for (const kind of HOMES) assert.deepEqual([...p.roomThemes(p.save.rooms.findIndex(r => r.kind === kind))].sort(), [...CAVES].sort(), kind);
  // Fennel's garden is under the sky, and the places on the map take any backdrop, as before
  assert.deepEqual([...p.roomThemes(1)], ['glowcap', 'summit']);
  assert.equal(p.roomThemes(5).length, p.THEMES.length);
  assert.equal(p.roomThemes(6).length, p.THEMES.length);
});

test('the garden room is a green cave from the start, the study a blue one, even before those caves are found', () => {
  for (const found of [true, false]) {
    // bought with its glowcaps (or before they were found, with no backdrop at all)
    for (const theme of ['glowcap', null]) {
      const p = home(['nest', 'yard', 'play', { kind: 'garden', on: [], theme }], { found, room: 3, theme });
      assert.equal(p.currentTheme(), 'malachite', `garden with ${theme}, found ${found}`);
    }
    const p = home(['nest', 'yard', 'play', 'garden', 'study'], { found, room: 4 });
    assert.equal(p.currentTheme(), 'celestite');
    assert.equal(home(['nest', 'play'], { found, room: 1 }).currentTheme(), 'amethyst');
  }
  // the shop's renovation shows the cave the room will be
  assert.match(nest, /themeThumb\(k\.cave \|\| k\.theme/);
});

test('a meadow or a hall saved in a room at home shows a cave, and stays in the save for later', () => {
  for (const theme of ['smithy', 'abbey', 'churchyard', 'glowcap', 'summit']) {
    const p = home(['nest', 'yard', 'play', 'garden'], { room: 2, theme });
    assert.equal(p.currentTheme(), 'amethyst', theme);
    assert.equal(p.save.theme, theme, 'the pick is kept');
    assert.equal(p.roomTheme(3, theme), 'malachite', 'the garden room shows its own green cave for ' + theme);
  }
  // a cave picked for a room shows, and a cave not found yet doesn't
  assert.equal(home(['nest', 'play'], { room: 1, theme: 'frost' }).currentTheme(), 'frost');
  assert.equal(home(['nest', 'play'], { room: 1, theme: 'frost', found: false }).currentTheme(), 'amethyst');
  // the valley is as it was: the forge's timber hall, the camp's glowcap wood
  assert.equal(home(['nest', 'yard', 'forge'], { room: 2, theme: 'smithy' }).currentTheme(), 'smithy');
  assert.equal(home(['nest', 'yard', 'camp'], { room: 2, theme: 'glowcap', found: false }).currentTheme(), 'glowcap');
  assert.equal(home(['nest', 'yard'], { room: 1, theme: 'glowcap' }).currentTheme(), 'glowcap');
});
