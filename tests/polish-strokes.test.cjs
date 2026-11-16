const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// Polishing with a stroke budget: from level 4 the cloth has a few strokes (one unbroken drag each), a stroke widens as
// it goes and dries out after a while, and one cell of the face hides a fleck of magic dust. Levels 1 to 3 and a shared
// egg keep the open-ended rub. The polish section of crack.js as it is, on a pretend canvas, driven like ui.js drives it.
const crack = read('crack.js'), core = read('core.js');
const found = cut(crack, '\nfunction showFound(', '\n}\n', 'showFound should sit in crack.js');
const helpers = core.slice(core.indexOf('const $ = '), core.indexOf('const easeOutBack'));
const src = [
  helpers.replace('const $ = id => document.getElementById(id);', '').replace(/^const \$\$ = .*$/m, ''),
  cut(core, 'function inside(', 'function centroid(', 'inside should sit in core.js'),
  cut(core, 'function tracePoly(', '\n}\n', 'tracePoly should sit in core.js') + '\n}',
  'const PAD = 8, DPR = 1, L = {};',
  cut(read('save.js'), 'function eggPoly(', '\n}\n', 'eggPoly should sit in save.js') + '\n}',
  cut(read('pixel.js'), 'function levelConf(', '\n}\n', 'levelConf should sit in pixel.js') + '\n}',
  'const LEVELS = 24;',
  // a canvas that only pretends to draw
  'const pretend = () => new Proxy({}, { get: (t, k) => k === "getImageData" ? () => ({ data: [] }) : k === "canvas" ? { width: 1, height: 1 } : k in t ? t[k] : () => ({ addColorStop() {} }), set: (t, k, v) => (t[k] = v, true) });',
  'const document = { createElement: () => ({ width: 0, height: 0, getContext: pretend }) };',
  'const els = {}; const $ = id => (els[id] = els[id] || { hidden: true, textContent: "", innerHTML: "", setAttribute() {} });',
  'const tr = (s, ...a) => s.replace(/\\{(\\d)\\}/g, (_, i) => a[i]);',
  'const tips = {}; const tipDone = id => !!tips[id], markTip = id => { tips[id] = 1; };',
  'let hint = ""; const setHint = t => { hint = t; }, talk = () => {}, burst = () => {}, pop = () => {}, buzz = () => {};',
  'const sounds = []; const sfx = new Proxy({}, { get: (t, k) => (...a) => sounds.push(k) });',
  'const toShell = (x, y) => [x, y];',
  'const game = { sparks: [], egg: null };',
  cut(crack, '// ---------- polishing the cut face ----------', '// ---------- results:', 'the polish should be its own section of crack.js'),
  // the pointer as ui.js has it: a move rubs along the way in small steps, a lift (or a cancel) ends the stroke
  'function drag(pts) { for (let i = 1; i < pts.length; i++) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i], d = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(d / 6)); for (let j = 1; j <= n; j++) rub(lerp(ax, bx, j / n), lerp(ay, by, j / n), d / n, 0.016 / n); } strokeEnd(); }',
  'function egg(conf) { Object.assign(L, { k: 1, ew: 240, eh: 300, ex0: 75, ey0: 200, ecx: 195, ecy: 350 }); game.egg = { conf, crystal: { c: ["#fff", "#fff", "#fff"] }, state: "opening" }; startPolish(); return game.egg; }',
  'Object.assign(this, { POLISH_STROKES, STROKE_LEN, polishBudget, strokeBrush, levelConf, egg, drag, finishPolish, strokeEnd, rub, game, sounds, tips, els, L, hint: () => hint });',
].join('\n');
const page = {};
vm.runInNewContext(src, page);
const { POLISH_STROKES, STROKE_LEN, polishBudget, strokeBrush, levelConf, egg, drag, finishPolish, sounds, tips, els, L } = page;

/** A straight swipe across the egg at a height (a share of its height from the middle). */
const swipe = (dy = 0) => [[L.ex0 - 10, L.ecy + dy * L.eh], [L.ex0 + L.ew + 10, L.ecy + dy * L.eh]];
/** A path that zigzags down the face, rows a brush apart, as long as you like (in egg widths). */
function serpentine(widths, from = 0) {
  const pts = [], rows = [];
  for (let y = L.ey0 + 20; y < L.ey0 + L.eh - 16; y += 30) rows.push(y);
  let len = 0, i = from;
  pts.push([L.ex0 + 30, rows[i % rows.length]]);
  while (len < widths * L.ew) {
    const y = rows[i % rows.length], [x0, x1] = i % 2 ? [L.ex0 + L.ew - 30, L.ex0 + 30] : [L.ex0 + 30, L.ex0 + L.ew - 30];
    const last = pts[pts.length - 1];
    pts.push([x0, y], [x1, y]);
    len += Math.hypot(x0 - last[0], y - last[1]) + Math.abs(x1 - x0);
    i++;
  }
  return pts;
}

test('the budget: levels 1 to 3 rub freely, from 4 on (wandering, moon and heart eggs too) a few strokes; a shared egg rubs freely', () => {
  for (const n of [1, 2, 3]) assert.equal(polishBudget(levelConf(n)), Infinity, `level ${n} keeps the open-ended rub`);
  for (const n of [4, 5, 12, 24]) assert.equal(polishBudget(levelConf(n)), POLISH_STROKES, `level ${n} has strokes`);
  assert.equal(polishBudget(levelConf(0)), POLISH_STROKES, 'wandering has strokes');
  assert.equal(polishBudget({ ...levelConf(6), n: 'moon', moon: true, wander: true }), POLISH_STROKES, 'a moon egg has strokes');
  assert.equal(polishBudget({ ...levelConf(24), n: 0, wander: true, coop: true }), Infinity, 'a shared egg rubs freely');
  assert.ok(POLISH_STROKES >= 3 && POLISH_STROKES <= 4, 'a generous handful');
});

test('on level 3 nothing runs out: many short strokes, and it still finishes itself at 90%', () => {
  const e = egg(levelConf(3));
  assert.equal(e.matte.fleck, undefined, 'no fleck on the open-ended rub');
  let n = 0;
  for (let dy = -0.45; dy <= 0.45 && e.state === 'polish'; dy += 0.04, n++) drag([[L.ex0 + 20, L.ecy + dy * L.eh], [L.ex0 + L.ew - 20, L.ecy + dy * L.eh]]);
  assert.ok(n > POLISH_STROKES, 'more strokes than any budget');
  assert.equal(e.state, 'gleam');
  assert.equal(e.matte.shine, 1);
  assert.equal(els.strokes.hidden, true, 'no pips');
});

test('a stroke counts once it touches the frost: a tap, or a drag off the face, costs nothing; a lift ends it', () => {
  const e = egg(levelConf(8)), m = e.matte;
  assert.equal(els.strokes.hidden, false, 'the pips show');
  drag([[10, 10], [40, 20], [10, 40]]);
  assert.equal(m.used, 0, 'a drag beside the egg is free');
  drag([[L.ecx, L.ecy]]);
  assert.equal(m.used, 0, 'a tap is free');
  drag(swipe(0));
  assert.equal(m.used, 1);
  assert.equal(m.stroke, null, 'lifting the finger ends the stroke');
  // one unbroken drag is one stroke, however it wiggles
  drag(serpentine(1.5, 1));
  assert.equal(m.used, 2);
  assert.match(els.strokes.innerHTML, /^(<i><\/i>){2}(<i class="on"><\/i>){2}$/, 'two spent pips, two to come');
});

test('the last stroke ends the polish when the finger lifts; the shine is what the strokes cleared', () => {
  const e = egg(levelConf(8)), m = e.matte;
  for (let i = 0; i < POLISH_STROKES; i++) { assert.equal(e.state, 'polish'); drag(swipe([-0.3, -0.1, 0.1, 0.3][i])); }
  assert.equal(e.state, 'gleam');
  assert.equal(m.used, POLISH_STROKES);
  assert.ok(m.shine > 0.2 && m.shine < 0.9, `straight swipes clear a part of the face (${m.shine.toFixed(2)})`);
  assert.equal(tips.strokes, 1, 'the first limited polish is marked, so its hint shows once');
});

test('a stroke clears more the longer it runs, and widens as it goes; then the cloth dries out', () => {
  assert.ok(strokeBrush(0) < strokeBrush(0.5) && strokeBrush(0.5) < strokeBrush(1), 'the cloth widens');
  assert.equal(strokeBrush(1), strokeBrush(3), 'and stays wide');
  const shineAfter = widths => { const e = egg(levelConf(8)); drag(serpentine(widths)); return e.matte.shine; };
  const short = shineAfter(0.5), mid = shineAfter(1), long = shineAfter(2), dry = shineAfter(STROKE_LEN + 2);
  assert.ok(short < mid && mid < long, `${short.toFixed(2)} < ${mid.toFixed(2)} < ${long.toFixed(2)}`);
  assert.ok(mid > short * 2, 'twice the length clears more than twice as much (the cloth has warmed up)');
  const full = shineAfter(STROKE_LEN);
  assert.ok(Math.abs(dry - full) < 0.03, 'past its length a stroke clears nothing more');
});

test('a careful path beats careless swipes by a wide margin', () => {
  const careless = egg(levelConf(8));
  for (let i = 0; i < 3; i++) drag(swipe([-0.15, 0.1, 0.25][i]));
  const curve = egg(levelConf(8));
  for (let i = 0, from = 0; i < 3 && curve.state === 'polish'; i++) drag(serpentine(STROKE_LEN * 0.97, from += i ? 6 : 0));
  assert.ok(careless.matte.shine < 0.5, `three swipes: ${careless.matte.shine.toFixed(2)}`);
  assert.ok(curve.matte.shine >= 0.9, `three planned strokes polish it all: ${curve.matte.shine.toFixed(2)}`);
});

test('the fleck pays once: found as its cell clears (or as full shine clears the rest), never twice', () => {
  const e = egg(levelConf(8)), m = e.matte;
  assert.ok(m.fleck && m.fleck.i >= 0 && m.fleck.i < m.cells.length, 'one hidden fleck');
  const c = m.cells[m.fleck.i];
  sounds.length = 0;
  drag([[c.x - 40, c.y], [c.x + 40, c.y]]);
  assert.equal(m.fleck.found, true);
  drag([[c.x - 40, c.y + 4], [c.x + 40, c.y + 4]]);
  for (let i = 0; i < 2 && e.state === 'polish'; i++) drag(swipe(0.3 * i));
  if (e.state === 'polish') finishPolish();
  assert.equal(sounds.filter(s => s === 'star').length, 1, 'one chime');
  // full shine uncovers it too
  const f = egg(levelConf(8));
  f.matte.shine = 0.95; finishPolish();
  assert.equal(f.matte.fleck.found, true);
  // the found card turns it into one pinch of magic dust, and only when it was found
  const give = new Function('e', 'save', `${line(found, /^  const fleck = .*$/m, 'showFound should say if the fleck was found')}\n${line(found, /^  if \(fleck\) save\.pantry = .*$/m, 'showFound should put the dust in the pantry')}\nreturn save;`);
  assert.deepEqual(give({ matte: { fleck: { found: true } } }, { pantry: { feast: 2, dew: 1 } }).pantry, { feast: 3, dew: 1 });
  assert.deepEqual(give({ matte: { fleck: { found: true } } }, {}).pantry, { feast: 1 });
  assert.deepEqual(give({ matte: { fleck: { found: false } } }, { pantry: {} }).pantry, {});
  assert.deepEqual(give({ matte: {} }, { pantry: {} }).pantry, {}, 'no fleck on the open-ended rub');
  assert.match(found, /\(fleck \? tr\(" · a pinch of magic dust under the frost ✨"\) : ""\)/, 'the card says so');
});

test('a shared egg polishes as it always did: no strokes, no fleck, finishes itself at 90%', () => {
  const e = egg({ ...levelConf(24), n: 0, wander: true, coop: true }), m = e.matte;
  assert.equal(m.budget, Infinity);
  assert.equal(m.fleck, undefined, 'nothing to share out unevenly');
  for (let dy = -0.45; dy <= 0.45 && e.state === 'polish'; dy += 0.04) drag(swipe(dy));
  assert.equal(e.state, 'gleam');
  assert.equal(m.shine, 1);
  // what goes over the wire is unchanged: the hits per cell and the shine
  const coop = read('coop.js');
  assert.match(coop, /matte: matteHits \? \{ hits: matteHits, shine: e\.matte\.shine \} : null/);
});

test('the first limited polish says how it works, in both languages', () => {
  for (const k of Object.keys(tips)) delete tips[k];
  egg(levelConf(8));
  assert.match(page.hint(), /only 4 strokes now/);
  const uk = read('i18n.js');
  for (const s of ['only {0} strokes now · one long, curving stroke polishes the most', 'strokes left: {0}', ' · a pinch of magic dust under the frost ✨'])
    assert.ok(uk.includes(JSON.stringify(s) + ':'), `Ukrainian for "${s}"`);
  tips.strokes = 1;
  egg(levelConf(8));
  assert.match(page.hint(), /rub the geode/);
});
