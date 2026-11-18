const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The finale's three endings (ENDINGS in crack.js): the Gloom asks in the hollow, your answer is how the story ends, it is
// kept in the save, Mossa's welcome home and the map's west follow it, and every answer and title has its Ukrainian.
const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const crack = read('crack.js'), inner = read('inner.js'), world = read('world.js'), i18n = read('i18n.js');
const cut = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, a); return src.slice(i, src.indexOf(b, i)); };

test('three endings, each asked as an answer in the finale, each with a title and its own lines', () => {
  const E = cut(crack, 'const ENDINGS = {', '\n};\n');
  const ids = [...E.matchAll(/^  (\w+): \{ ask: "([^"]+)", title: "([^"]+)"/gm)];
  assert.deepEqual(ids.map(m => m[1]), ['home', 'rest', 'watch']);
  for (const [, id, ask, title] of ids) {
    for (const s of [ask, title]) assert.ok(i18n.includes(JSON.stringify(s) + ':'), `${id}: "${s}" needs its Ukrainian`);
  }
  const s8 = cut(crack, '{ id: "s8"', '] },');
  assert.match(s8, /Object\.entries\(ENDINGS\)\.map\(\(\[id, e\]\) => \(\{ text: e\.ask, pick: \(\) => endWith\(id\) \}\)\)/);
  assert.match(cut(crack, 'function endWith(', '\n}\n'), /save\.ending = id; persist\(\);/);
});

test('the ending follows you home and onto the map', () => {
  const back = cut(inner, 'const BACK_ENDING = {', '};');
  for (const id of ['home', 'rest', 'watch']) assert.match(back, new RegExp(id + ': "'));
  assert.match(inner, /BACK_ENDING\[save\.ending\] \|\| "Coming back is strength too\."/);
  assert.match(world, /save\.ending === "watch" \|\| \(wardKeep\("gloom"\) > 0 && !save\.ending\)/);
});

test('an asked line waits for an answer: a tap does not move on, and the answer\'s lines come next', () => {
  assert.match(cut(crack, 'function tapTalk(', '\n}\n'), /else if \(!talkNow\.asking\)/);
  assert.match(cut(crack, 'function talkAsk(', '\n}\n'), /n\.lines\.splice\(n\.i \+ 1, 0, \.\.\.a\.pick\(\)\)/);
});
