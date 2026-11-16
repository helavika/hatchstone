const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// The veil over the nest while the Gloom's shadows are in it, run over a pretend nest (as in hold-the-light.test.cjs): the
// visit from its numbers down to the veil's level, and the veil's holes, its mask and its drawing, over a pretend canvas
// that keeps what is drawn on it.
const playJs = read('play.js'), saveJs = read('save.js'), pixelJs = read('pixel.js');
const src = [
  line(saveJs, /^const isoAt = .*$/m, 'isoAt should be one line in save.js'),
  line(pixelJs, /^const PX_BAYER = .*$/m, 'PX_BAYER should be one line in pixel.js'),
  cut(playJs, 'const GLOOM_WAIT = ', '/** Where the huddle is for a glowling', 'the Gloom\'s visit should sit together in play.js'),
  cut(playJs, '/**\n * The veil\'s holes', 'function drawNest()', 'the veil\'s drawing should sit just before drawNest'),
  'Object.assign(this, { gloomNow, gloomVeil, gloomCome, updateGloom, gloomFree, veilHoles, veilMask, veilArt, drawVeil, VEIL_DARK, VEIL_GREY, VEIL_RISE, VEIL_WARM, isoAt });',
].join('\n');
const B = 100, DT = 1 / 60;

function nest({ calm = false, low = false, shaft = null } = {}) {
  const drawn = [];
  const fakeCtx = () => {
    const c = { globalAlpha: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: true, stack: [] };
    c.save = () => c.stack.push([c.globalAlpha, c.globalCompositeOperation]);
    c.restore = () => { [c.globalAlpha, c.globalCompositeOperation] = c.stack.pop(); };
    c.drawImage = img => drawn.push({ img, op: c.globalCompositeOperation, alpha: c.globalAlpha });
    c.createImageData = (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    c.putImageData = () => {};
    return c;
  };
  const creatures = [1, 2].map(id => ({ id, name: 'G' + id, sleeping: false, joy: 50, pals: {} }));
  const actors = new Map([[1, { id: 1, x: 300, y: 300 }], [2, { id: 2, x: 500, y: 300 }]]);
  const page = {
    Math, Date, TAU: Math.PI * 2, W: 800, H: 600, PX: 1, N: { base: B, x0: 0, x1: 800, y0: 0, y1: 400, cx: 400, isoW: 900, isoH: 450, isoTop: -250, isoWall: 300 },
    save: { creatures, shards: 0, room: 0, dust: [] }, actors, game: { scene: 'nest', sparks: [], time: 0 },
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)), lerp: (a, b, t) => a + (b - a) * t, rand: (a, b) => (a + b) / 2, pick: arr => arr[0],
    sfx: { ready: () => false }, opts: () => ({ calm }), quality: { low }, setTimeout: () => 0, $$: () => [],
    document: { hidden: false, createElement: () => ({ getContext: fakeCtx }) }, ctx: fakeCtx(),
    talkNow: null, talkQueue: [], giftNow: null, coopSession: null, pointer: null, arrange: { on: false }, startedEmpty: false,
    emote: () => {}, toast: () => {}, tr: s => s, persist: () => {}, remember: () => {}, areFriends: () => false, charmSpot: () => null, charmHung: () => null,
    nestRoom: () => 0, residents: () => creatures, cnt: () => 1, bump: () => {}, tipDone: () => true, dayKey: () => 'today', keeperGift: () => false,
    setHint: () => {}, nestHint: () => '', renderNest: () => {}, updateTopbar: () => {}, checkAwards: () => {}, floatText: () => {}, buzz: () => {}, talk: () => {},
    depth: () => 0.7, gloomArtNow: () => ({ P: 2 }), roomShaft: () => shaft, mossCrack: () => [200, 40], caveArt: () => ({ seed: 1 }), currentTheme: () => 'glowcap',
  };
  vm.runInNewContext(src, page);
  const g = page.gloomNow, v = page.gloomVeil;
  const run = secs => { for (let k = 0; k < Math.round(secs / DT); k++) page.updateGloom(DT); };
  /** Three wisps in, whole, long since seeped in, out of the way of the little ones, never fading by themselves. */
  const come = () => {
    assert.equal(page.gloomCome(), true, 'the shadows should come into a calm nest');
    g.count = 3;
    g.wisps.forEach((w, i) => Object.assign(w, { on: true, x: 150 + i * 250, y: 120, t: 5, life: 999, hp: 1, k: 1, fade: 1, lit: 0, tie: 0 }));
  };
  /** How the veil covers a spot on the screen, after drawing it (0 clear, 1 all veil). */
  const at = (x, y) => { const A = page.veilArt; return A.m[Math.floor(y / A.cell) * A.cols + Math.floor(x / A.cell)]; };
  return { page, g, v, run, come, drawn, at, actors };
}

test('the veil rises as the shadows come, over about two seconds, and never goes near black', () => {
  const { v, run, come } = nest();
  assert.equal(v.k, 0, 'no veil before they come');
  come();
  run(1);
  assert.ok(v.k > 0.4 && v.k < 0.6, `half-way after a second (${v.k})`);
  assert.ok(v.reach > 0.4 && v.reach < 0.6, 'and it has crept half-way out from the crack');
  run(1.2);
  assert.equal(v.k, 1, 'all of it after two seconds');
  assert.equal(v.reach, 1);
  const { VEIL_DARK } = nest().page;
  assert.ok(VEIL_DARK <= 0.4, 'at its darkest it only dims the room');
});

test('each shadow pushed back takes its share of the dark with it; the last gone, the room warms back in about 1.5 s', () => {
  const { page, g, v, run, come } = nest();
  come();
  run(2.5);
  page.gloomFree(g.wisps[0]);
  run(1);
  assert.ok(Math.abs(v.k - 2 / 3) < 1e-6, `two shadows left: two thirds of the veil (${v.k})`);
  page.gloomFree(g.wisps[1]);
  run(1);
  assert.ok(Math.abs(v.k - 1 / 3) < 1e-6, `one left: a third (${v.k})`);
  // one fading away by itself takes its share as it fades
  g.wisps[2].fade = 0.5;
  run(0.5);
  assert.ok(Math.abs(v.k - 1 / 6) < 1e-6, `half faded: a sixth (${v.k})`);
  page.gloomFree(g.wisps[2]);
  run(1);
  assert.equal(g.on, false, 'the visit is over');
  assert.equal(v.k, 0, 'and the veil is gone');
  assert.equal(v.reach, 0);
  // from a whole veil, warming back takes about a second and a half
  const n = nest();
  n.come(); n.run(2.5);
  for (const w of n.g.wisps) n.page.gloomFree(w);
  n.run(0.75);
  assert.ok(Math.abs(n.v.k - 0.5) < 0.02, `half-way back after 0.75 s (${n.v.k})`);
  n.run(0.8);
  assert.equal(n.v.k, 0);
});

test('out of the nest the veil is simply gone', () => {
  const { page, v, run, come } = nest();
  come(); run(2.5);
  page.game.scene = 'yard';
  run(0.1);
  assert.equal(v.k, 0);
});

test('with less motion it does not creep: the whole room fades in and out together', () => {
  const { page, v, run, come, at } = nest({ calm: true });
  come();
  run(DT);
  assert.equal(v.reach, 1, 'it covers the room at once');
  run(0.5);
  assert.ok(v.k > 0.2 && v.k < 0.3, 'but only fades in');
  page.drawVeil();
  assert.equal(at(790, 590), 1, 'the far corner is veiled as much as by the crack');
  // without less motion, early on, the far corner is still clear
  const n = nest();
  n.come(); n.run(1); n.page.drawVeil();
  assert.equal(n.at(790, 590), 0, 'not crept that far yet');
  assert.ok(n.at(400, 20) > 0.9, 'but next to the crack it lies');
});

test('the colour drains and the room dims; on a slow device it is only a tint', () => {
  const full = nest();
  full.come(); full.run(2.5); full.page.drawVeil();
  assert.deepEqual(full.drawn.map(d => d.op), ['saturation', 'source-over'], 'colour drained, then darkened');
  assert.ok(Math.abs(full.drawn[0].alpha - full.page.VEIL_GREY) < 1e-9 && Math.abs(full.drawn[1].alpha - full.page.VEIL_DARK) < 1e-9);
  assert.equal(full.page.ctx.globalCompositeOperation, 'source-over', 'the canvas is left as it was');
  const low = nest({ low: true });
  low.come(); low.run(2.5); low.page.drawVeil();
  assert.deepEqual(low.drawn.map(d => d.op), ['source-over'], 'just the tint');
  // and nothing drawn at all once it's gone
  const none = nest();
  none.page.drawVeil();
  assert.equal(none.drawn.length, 0);
  // a big screen still gets a small canvas
  const big = nest();
  Object.assign(big.page, { W: 2560, H: 1600 });
  big.come(); big.page.gloomNow.W = 2560; big.page.gloomNow.H = 1600; big.run(2.5); big.page.drawVeil();
  assert.ok(big.page.veilArt.cols * big.page.veilArt.rows <= 22000, `cells: ${big.page.veilArt.cols * big.page.veilArt.rows}`);
});

test('your lantern and the rings of those shining with you cut holes of colour in it; every glowling has its own light', () => {
  const { page, g, run, come, at, actors } = nest();
  come(); run(2.5);
  page.drawVeil();
  assert.ok(at(600, 500) === 1, 'open floor is veiled');
  assert.equal(at(300, 300 - 0.45 * 70), 0, 'a glowling stays clear');
  assert.equal(at(300 + 70 * 0.9, 300 - 0.45 * 70), 1, 'but just its body, while it isn\'t shining with you');
  // the lantern over the floor between the two
  Object.assign(g.lamp, { on: true, x: 400, y: 500 });
  run(0.5);
  page.drawVeil();
  assert.equal(at(400, 500), 0, 'a hole where the lantern\'s light pools');
  assert.equal(at(400, 440), 0, 'and up its cone');
  assert.ok(at(400 + B * 1.3, 500) === 1, 'the veil goes on past it');
  // a glowling near the lantern shines with it: its ring is a hole too
  actors.get(1).x = 400; actors.get(1).y = 560;
  run(1);
  assert.ok(actors.get(1).gloomLit > 0.9, 'it shines with you');
  page.drawVeil();
  assert.equal(at(400 - 70 * 0.7, 560 - 0.45 * 70), 0, 'its ring is clear');
  assert.equal(at(500 + 70 * 0.9, 300 - 0.45 * 70), 1, 'one that isn\'t keeps only its own small light');
});

test('a shaft of light from the vault cuts its own hole', () => {
  const shaft = { top: 0.05, bot: 0.21, off: 0.12, at: [0.32, 0.38] };
  const { page, run, come, at } = nest({ shaft });
  come(); run(2.5); page.drawVeil();
  const [px, py] = page.isoAt(...shaft.at);
  assert.equal(at(px, py), 0, 'where it lands');
  assert.ok(at((200 + px) / 2, (40 + py) / 2) < 0.2, 'and along it');
  const n = nest();
  n.come(); n.run(2.5); n.page.drawVeil();
  assert.equal(n.at(px, py), 1, 'a room without one is veiled there');
});

test('the mask: holes thin it out toward their edge, a half-clear hole leaves half the veil', () => {
  const { page } = nest();
  const m = new Float32Array(100);
  page.veilMask(m, 10, 10, 10, 1, 0, 0, 1, [{ x: 50, y: 50, rx: 30, ry: 30, k: 0.5 }], 1);
  assert.equal(m[0], 1);
  assert.equal(m[5 * 10 + 5], 0.5, 'middle of a half-clear hole');
  assert.ok(m[5 * 10 + 7] > 0.5 && m[5 * 10 + 7] < 1, 'thinning out toward its edge');
});
