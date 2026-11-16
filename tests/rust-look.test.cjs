const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Rust's look and voice on the world map: the west is drawn in Rust's own grammar (not the Gloom's veil), its creep along
// the western road holds still with less motion, and its scrape sounds once a visit as you look west, and never when muted.
const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const world = read('world.js'), pixel = read('pixel.js');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from + 1); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };

const sums = {};
vm.runInNewContext([
  pixel.match(/^const pxHash = .*$/m)[0],
  cut(world, '// ---------- Rust in the west', '// ----------', 'Rust\'s sums should sit in world.js, in a section of their own'),
  'Object.assign(this, { WM_CREEPS, WM_CRAWL, WM_WEST, wmRustCrawl, wmLooksWest, wmScrapeDue });',
].join('\n'), sums);

test('the west is drawn as Rust: its own dust and ground, not the Gloom\'s veil', () => {
  assert.match(world, /\{ id: "gloom",[^\n]*veil: "rust"/, 'the western land\'s veil is Rust\'s dust');
  const veils = cut(world, 'const WM_VEILS = {', '\n};', 'the veils');
  assert.ok(!/\bdark:/.test(veils), 'the Gloom\'s dark veil is gone from the map');
  assert.match(veils, /\brust:/);
  // it doesn't breathe like the Gloom: it lies still, and Rust creeps along its road
  const frame = cut(world, 'function worldFrame(', '\n}', 'worldFrame');
  const line = frame.split('\n').find(l => l.includes('wmVeilDraw(g, "gloom"'));
  assert.ok(line && !/Math\.sin/.test(line), 'the west\'s veil does not pulse');
  assert.match(frame, /wmRustFrame\(g, t\)/);
  const base = cut(world, 'function worldBase(', '\n}', 'worldBase');
  assert.match(base, /wmRustGround\(/, 'the ground is Rust\'s cracked plates');
  assert.ok(!/C\.crack|C\.k[0-3]/.test(base), 'no violet cracks left in the west');
  assert.match(base, /wmTree\(g, x, y, false, .*"rust"\)/, 'the trees there are Rust-eaten');
});

test('Rust\'s colours are dull, dark and cold: never mistaken for the Heartlight\'s gold or a reward', () => {
  const page = {};
  vm.runInNewContext(pixel.match(/^const pxHex = .*$/m)[0] + '\n' + cut(pixel, 'const PX_RUST = {', '};', 'PX_RUST in pixel.js') + '};\nObject.assign(this, { pxHex, PX_RUST });', page);
  const hsl = ([r, g, b]) => { const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2; return { s: mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1)), l }; };
  const golds = ['#eec26a', '#c98f3a', '#946027', '#ffe9a8', '#fff0b5'].map(page.pxHex);
  for (const [k, hex] of Object.entries(page.PX_RUST)) {
    const c = page.pxHex(hex), { s, l } = hsl(c);
    assert.ok(s < 0.4, `${k} is desaturated (${s.toFixed(2)})`);
    assert.ok(l < 0.6, `${k} stays dark (${l.toFixed(2)})`);
    for (const gd of golds) assert.ok(Math.hypot(c[0] - gd[0], c[1] - gd[1], c[2] - gd[2]) > 50, `${k} is far from the gold ${gd}`);
  }
});

test('Rust creeps slowly along the western road; with less motion it holds still', () => {
  const road = Array.from({ length: 80 }, (_, i) => [40 + i, 130 + i * 0.1]);
  const at0 = sums.wmRustCrawl(road, 0, false), at10 = sums.wmRustCrawl(road, 10, false);
  assert.equal(at0.length, sums.WM_CREEPS);
  const moved = at0.map((c, k) => at10[k][3] - c[3]).filter(d => d > 0);
  assert.ok(moved.length >= sums.WM_CREEPS - 1, 'they move east along the road');
  assert.ok(moved.every(d => d <= 10), 'and slowly: under a point a second');
  for (const [, , k] of at0) assert.ok(k >= 0 && k <= 1);
  // less motion: where they are never changes
  assert.equal(JSON.stringify(sums.wmRustCrawl(road, 0, true)), JSON.stringify(sums.wmRustCrawl(road, 123.4, true)));
  assert.equal(sums.wmRustCrawl([], 5, false).length, 0);
});

test('the scrape sounds once a visit, as you look into the west from outside it', () => {
  assert.equal(sums.wmLooksWest(0), true);
  assert.equal(sums.wmLooksWest(sums.WM_WEST + 1), false);
  const visit = startWest => ({ west: startWest, scraped: false });
  const st = visit(false), heard = [];
  for (const left of [150, 100, 60, 20, 0, 80, 150, 10, 0]) heard.push(sums.wmScrapeDue(st, sums.wmLooksWest(left)));
  assert.deepEqual(heard.map((h, i) => h ? i : -1).filter(i => i >= 0), [3], 'once, the first time the window reaches the west');
  // opening already looking west (a wide screen sees the whole map): no scrape for that
  const wide = visit(true);
  assert.equal(sums.wmScrapeDue(wide, true), false);
  // a new visit may scrape again
  const again = visit(false);
  assert.equal(sums.wmScrapeDue(again, true), true);
  // the map hooks it to every way it can move, and starts each visit fresh
  assert.match(world, /addEventListener\("scroll", wmScrolled/);
  assert.match(cut(world, 'function openWorld(', '\n}', 'openWorld'), /wm\.scrape = \{ west: wmLooksWest\(wmViewLeft\(\)\), scraped: false \}/);
  assert.match(cut(world, 'function wmScrolled(', '\n', 'wmScrolled'), /sfx\.scrape\(\)/);
});

/** core.js on its own, with a pretend audio context that writes down every node (as in sounds.test.cjs). */
function studio() {
  const page = {};
  vm.runInNewContext(read('core.js') + '\nthis.sfx = sfx;', page);
  const made = [];
  const param = () => { const p = { sets: [] }; for (const k of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime']) p[k] = (v, t) => p.sets.push([v, t]); return p; };
  const node = kind => { const n = { kind, gain: param(), frequency: param(), Q: param(), playbackRate: param(), connect: to => to, start: () => {}, stop: t => { n.to = t; } }; made.push(n); return n; };
  page.sfx.ac = { currentTime: 10, createOscillator: () => node('osc'), createBufferSource: () => node('noise'), createBiquadFilter: () => node('filter'), createGain: () => node('gain') };
  page.sfx.master = {}; page.sfx.echo = {}; page.sfx.noise = {};
  return { sfx: page.sfx, made };
}

test('the scrape: dry, short, no note in it (the Gloom\'s is a hum); quiet with sound off, softer with the slider down', () => {
  const s = studio();
  s.sfx.scrape();
  assert.ok(s.made.length > 0, 'it plays');
  assert.equal(s.made.filter(n => n.kind === 'osc').length, 0, 'noise only: no tone, no hum');
  assert.ok(Math.max(...s.made.filter(n => n.to != null).map(n => n.to)) - 10 < 0.8, 'short');
  const peak = nodes => Math.max(...nodes.filter(n => n.kind === 'gain').flatMap(n => n.gain.sets.map(x => x[0])));
  const loud = peak(s.made);
  assert.ok(loud <= 0.08, `soft (${loud})`);
  const half = studio(); half.sfx.sfxVol = 0.5; half.sfx.scrape();
  assert.ok(Math.abs(peak(half.made) - loud / 2) < 1e-9, 'the sounds slider scales it');
  const off = studio(); off.sfx.muted = true; off.sfx.scrape();
  assert.equal(off.made.length, 0, 'muted: nothing');
});
