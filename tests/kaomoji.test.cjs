const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The kaomoji a glowling pulls in its speech bubble: each face a well-made pixel map in the icons' colours, and a face for
// every moment it's wired to, its kind's favourite a bit likelier.
const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const pixel = read('pixel.js');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from + 1); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };

const page = { roll: () => 0, kindOf: c => c.kind };
vm.createContext(page);
vm.runInContext([
  'const pick = arr => arr[Math.floor(roll() * arr.length)];',
  cut(pixel, 'const PX_ICON_COLORS = ', '\n', 'the icons\' colours should be one line in pixel.js'),
  cut(pixel, '// ---------- kaomoji', 'const kaoArts = ', 'the kaomoji should sit in pixel.js, before their art'),
  'Object.assign(this, { PX_ICON_COLORS, KAO, KAO_MOMENTS, KAO_FAVE, KAO_GLAD, kaoNamed, kaoFor });',
].join('\n'), page);
const { PX_ICON_COLORS, KAO, KAO_MOMENTS, KAO_FAVE, KAO_GLAD, kaoNamed, kaoFor } = page;

test('every face is a well-made pixel map: even rows, only the icons\' colours, small enough for the bubble', () => {
  const names = Object.keys(KAO);
  assert.ok(names.length >= 8 && names.length <= 10, `about 8 to 10 faces (${names.length})`);
  for (const [name, f] of Object.entries(KAO)) {
    assert.ok(f.rows.length >= 3 && f.rows.length <= 6, `${name}: 3 to 6 rows high`);
    const w = f.rows[0].length;
    assert.ok(w >= 9 && w <= 16, `${name}: 9 to 16 pixels wide`);
    for (const row of f.rows) {
      assert.equal(row.length, w, `${name}: every row as long as the first`);
      for (const ch of row) assert.ok(ch === '.' || ch in PX_ICON_COLORS, `${name}: "${ch}" is not one of the icons' colours`);
    }
    // nothing wasted: ink on its top and bottom rows and its left and right columns
    assert.ok(/[^.]/.test(f.rows[0]) && /[^.]/.test(f.rows.at(-1)), `${name}: no empty row at the top or bottom`);
    assert.ok(f.rows.some(r => r[0] !== '.') && f.rows.some(r => r.at(-1) !== '.'), `${name}: no empty column at either side`);
    assert.equal(kaoNamed(f.text), name, `${name}: found again by its text`);
  }
  assert.equal(new Set(names.map(n => KAO[n].text)).size, names.length, 'no two faces share a text');
  assert.equal(kaoNamed('♥'), null, 'a heart is not a kaomoji');
  assert.equal(kaoNamed('zz'), null);
});

test('every moment has a face, and only faces that exist', () => {
  const KINDS = ['flutter', 'hop', 'nap', 'dance', 'curious', 'swim'];
  for (const [moment, faces] of Object.entries(KAO_MOMENTS)) {
    assert.ok(faces.length, moment);
    for (const f of faces) assert.ok(KAO[f], `${moment}: no face "${f}"`);
    for (const kind of [...KINDS, undefined]) for (const r of [0, 0.3, 0.6, 0.99]) {
      page.roll = () => r;
      const text = kaoFor(kind ? { kind } : null, moment), name = kaoNamed(text);
      assert.ok(name, `${moment} (${kind}): a face`);
      // only the moment's own faces, or (in a glad moment) the kind's favourite if it's a glad one
      assert.ok(faces.includes(name) || (name === KAO_FAVE[kind] && KAO_GLAD.includes(name)), `${moment} (${kind}): ${name} doesn't fit`);
    }
  }
  for (const moment of ['pet', 'fave', 'full', 'won', 'sad', 'wake', 'rest', 'friend', 'surprise', 'curious']) assert.ok(KAO_MOMENTS[moment], `a face for ${moment}`);
  for (const kind of KINDS) assert.ok(KAO[KAO_FAVE[kind]], `${kind} has a favourite face`);
});

test('a kind pulls its favourite face more often where it fits', () => {
  const count = (kind, moment, face) => { let n = 0; for (let i = 0; i < 100; i++) { page.roll = () => i / 100; if (kaoNamed(kaoFor({ kind }, moment)) === face) n++; } return n; };
  // a hopper is excited more often than a swimmer when it wins; a swimmer's pleased face turns up in glad moments only
  assert.ok(count('hop', 'won', 'excited') > count('swim', 'won', 'excited'), 'a hopper is excited more often');
  assert.ok(count('swim', 'pet', 'pleased') > 0, 'a swimmer is sometimes pleased when stroked');
  assert.equal(count('swim', 'sad', 'pleased'), 0, 'but never pleased when sad');
});
