const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { keeperMigrate } = require('../js/inner.js');
const { sparkSaveOf } = require('../js/sparks.js');
const { KEEPSAKES, KEEP_WEAR, walkSaveOf } = require('../js/walk.js');
const { wardSaveOf } = require('../js/wards.js');

// Quarry Eye no longer lights the weak spot up for good: it gives a geode a few pings (one a forge level), each a ring
// over the shell that shows where to listen. Here: the pings per level, a fresh set for every egg, the thank-you ping
// for keepers who had the whole eye before, nothing spent on stone that glows anyway, and no glow from the eye by itself.
const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const plain = v => JSON.parse(JSON.stringify(v));
const crack = read('crack.js'), main = read('main.js');

/** A button or label that only remembers what it was told. */
const el = () => ({ hidden: false, textContent: '', pips: { innerHTML: '' }, cls: {}, querySelector() { return this.pips; }, classList: { toggle() {} } });

/** The crack scene's own Quarry Eye: eyeCharges, byEar, newEgg, updateEye and eyePing as they stand, over a save. */
function scene(save, level = 12) {
  const els = { eyeBtn: el(), lvlPill: el() }, heard = [], said = [];
  const page = {
    save, els, heard, said, console,
    game: { time: 0 }, L: { ecx: 100, ecy: 120, ey0: 40, ew: 160, eh: 200, k: 1 },
    Math, Array, Object, Number,
    $: id => els[id] || el(), tr: s => s, toast: () => {}, persist: () => {}, setHint: () => {}, setTimeout: () => {},
    sfx: { ping: at => heard.push(at), tick: () => heard.push('tick') }, buzz: () => {}, floatText: t => said.push(t),
    rand: (a, b) => (a + b) / 2, pick: a => a[0], clamp: (v, a, b) => Math.max(a, Math.min(b, v)), inside: () => true,
    skill: () => 0, rollCrystal: () => ({ id: 'quartz' }), SPECIES: [{ crystal: 'quartz' }], STONES: ['grey'], coopId: () => 'seed',
    refitEgg: () => {}, updateDots: () => {}, EGG_UNIT: [], EGG_R: 1.28,
    fromEgg: (u, v) => [page.L.ecx - 80 + u * 160, page.L.ey0 + v * 160],
    levelConf: n => ({ n, step: n, spotGlow: n < 4 ? 1 : n < 10 ? 0.45 : n < 18 ? 0.2 : 0, hp: 20, rare: 0, legendary: 0 }),
  };
  vm.runInNewContext([
    cut(crack, 'const forgeLvl = ', '/** Hammer looks:', 'eyeCharges and byEar should follow forgeLvl in crack.js'),
    cut(crack, 'function newEgg(', '\n/** Fresh shell and inside', 'newEgg should sit in crack.js'),
    cut(crack, '// ---------- Quarry Eye: a knock that listens for you ----------', '/** Everything you see and hear when a hit lands', 'the eye\'s ping should sit before hitFeedback'),
    'this.eyeCharges = eyeCharges; this.byEar = byEar; this.eyePing = eyePing; this.crackEgg = (n, conf) => { newEgg({ ...levelConf(n), ...conf }, false); return game.egg; };',
  ].join('\n'), page);
  page.egg = conf => page.crackEgg(level, conf);
  return page;
}

test('Quarry Eye gives a geode one ping a forge level, and none without it', () => {
  assert.deepEqual([0, 1, 2, 3].map(eye => scene({ forge: { eye } }).eyeCharges()), [0, 1, 2, 3]);
  assert.deepEqual([0, 1, 2, 3].map(eye => scene({ forge: { eye } }).egg().eyeLeft), [0, 1, 2, 3]);
  // without the eye there's no button at all
  const none = scene({ forge: {} });
  none.egg();
  assert.equal(none.els.eyeBtn.hidden, true);
  const two = scene({ forge: { eye: 2 } });
  two.egg();
  assert.equal(two.els.eyeBtn.hidden, false);
  assert.equal(two.els.eyeBtn.pips.innerHTML, '<i class="on"></i><i class="on"></i>');
});

test('the thank-you ping: a fourth for keepers who had the whole eye, and it shows in the Forge', () => {
  assert.equal(scene({ forge: { eye: 3 }, eyeThanks: true }).eyeCharges(), 4);
  // (a flag left on a save without the eye gives nothing)
  assert.equal(scene({ forge: {}, eyeThanks: true }).eyeCharges(), 0);
  assert.match(crack, /save\.eyeThanks \? tr\("four pings per geode: one is a thank-you"\) : tr\("three pings per geode"\)/);
});

test('each ping spends one, the last one says so, and the next egg has them all again', () => {
  const s = scene({ forge: { eye: 2 } }, 20);
  let e = s.egg();
  e.state = 'cracking';
  s.eyePing(); s.eyePing();
  assert.equal(e.eyeLeft, 0);
  assert.equal(s.heard.filter(h => typeof h === 'number').length, 2, 'a knock for each ping');
  assert.ok(s.game.ping && s.game.ping.e === e, 'the ring is on this egg');
  s.eyePing();
  assert.equal(e.eyeLeft, 0);
  assert.deepEqual(s.said, ['no pings left on this geode']);
  assert.equal(s.heard.at(-1), 'tick');
  e = s.egg();
  assert.equal(e.eyeLeft, 2, 'a fresh egg, fresh pings');
  assert.equal(s.game.ping, null, 'and no ring left over from the last one');
});

test('the ping\'s note sounds as the ring reaches the weak spot: later the further out it sits', () => {
  const s = scene({ forge: { eye: 3 } }, 20);
  const e = s.egg(); e.state = 'cracking';
  e.spot = [0.5, 0.5]; s.eyePing();
  e.spot = [0.3, 0.9]; s.eyePing();
  const [near, far] = s.heard;
  assert.ok(near >= 0 && far > near && far <= 0.7, `${near} then ${far}`);
});

test('on stone that still glows the eye rests: nothing is spent, and it says why', () => {
  for (const n of [1, 2, 3]) {
    const s = scene({ forge: { eye: 3 } }, n);
    const e = s.egg(); e.state = 'cracking';
    s.eyePing();
    assert.equal(e.eyeLeft, 3, `level ${n}`);
    assert.equal(s.game.ping, null);
    assert.deepEqual(s.said, ['the spot glows here: just look']);
  }
  // from level 4, where the spot is found by ear (and "closer…" whispers), it pings
  for (const n of [4, 10, 18, 24]) {
    const s = scene({ forge: { eye: 1 } }, n);
    const e = s.egg(); e.state = 'cracking';
    s.eyePing();
    assert.equal(e.eyeLeft, 0, `level ${n}`);
  }
  // an egg still rolling in waits
  const s = scene({ forge: { eye: 1 } }, 20), e = s.egg();
  e.state = 'entering'; s.eyePing();
  assert.equal(e.eyeLeft, 1);
});

test('on a shared egg the ping is this screen\'s alone: the co-op snapshot and the blueprint never carry it', () => {
  const coop = read('coop.js');
  assert.doesNotMatch(coop, /eyeLeft|game\.ping|eyePing/);
  const snap = cut(coop, 'function coopSnapshot(', '\n}\n', 'coopSnapshot should sit in coop.js');
  assert.doesNotMatch(snap, /\.\.\.e\b|Object\.assign\([^)]*\be\b/, 'the snapshot names its fields one by one');
  // the ping touches nothing a friend counts: cracks, pay, taps and aim stay as they were
  const s = scene({ forge: { eye: 2 } }, 20), e = s.egg({ coop: true });
  e.state = 'cracking';
  const before = plain({ hits: e.hits, damage: e.damage, taps: e.taps, crits: e.crits, gems: e.gems, combo: e.combo, chain: e.chain, owed: e.owed, net: e.net });
  s.eyePing();
  assert.equal(e.eyeLeft, 1);
  assert.deepEqual(plain({ hits: e.hits, damage: e.damage, taps: e.taps, crits: e.crits, gems: e.gems, combo: e.combo, chain: e.chain, owed: e.owed, net: e.net }), before);
});

test('drawSpot no longer uses the eye: the spot glows only as the stone allows', () => {
  const src = cut(main, 'function drawSpot(', '\n}\n', 'drawSpot should sit in main.js');
  assert.doesNotMatch(src, /forgeLvl|"eye"/);
  let drawn = 0;
  const ctx = new Proxy({}, { get: (t, k) => k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'fill' || k === 'stroke' ? () => drawn++ : t[k] || (() => {}), set: (t, k, v) => (t[k] = v, true) });
  const page = { ctx, game: { time: 0 }, L: { k: 1 }, TAU: Math.PI * 2, hexA: () => '', fromEgg: (u, v) => [u, v], Math, save: { forge: { eye: 3 } }, forgeLvl: () => 3 };
  vm.runInNewContext(src + '\n}\nthis.drawSpot = drawSpot;', page);
  const egg = glow => ({ conf: { spotGlow: glow }, state: 'cracking', spot: [0.5, 0.5], crystal: { c: ['#ffffff', '#ffffff', '#ffffff'] } });
  page.drawSpot(egg(0));
  assert.equal(drawn, 0, 'deep stone with the whole eye: no glow');
  page.drawSpot(egg(0.2));
  assert.ok(drawn > 0, 'stone that glows still glows');
});

/** A save as it comes through the door, loaded the way the game loads it. */
function load(d) {
  const page = {
    SAVE_KEY: 'k', BAK_KEY: 'k.bak', localStorage: { getItem: k => k === 'k' && d ? JSON.stringify(d) : null, setItem: () => {} },
    sparkSaveOf, keeperMigrate, walkSaveOf, wardSaveOf, KEEP_WEAR, KS: Object.fromEntries(KEEPSAKES.map(k => [k.id, k])),
  };
  vm.runInNewContext(cut(read('save.js'), 'const SAVE_VERSION', 'const save = loadSave();', 'the save\'s way in should sit at the top of save.js') + '\nthis.loaded = loadSave(); this.migrate = migrate;', page);
  return { save: plain(page.loaded), migrate: page.migrate };
}
const old = (o = {}) => ({ v: 1, stars: { 1: 3 }, creatures: [], seen: {}, shards: 100, ...o });

test('old saves: the whole eye earns a fourth ping, once; anyone who had it hears what changed', () => {
  const full = load(old({ forge: { eye: 3 } })).save;
  assert.equal(full.eyeThanks, true);
  assert.equal(full.eyeNote, true);
  assert.equal(full.forge.eye, 3, 'the level stays');
  const part = load(old({ forge: { eye: 2 } })).save;
  assert.equal(part.eyeThanks, undefined);
  assert.equal(part.eyeNote, true);
  const none = load(old({ forge: { echo: 1 } })).save;
  assert.equal(none.eyeThanks, undefined);
  assert.equal(none.eyeNote, undefined);
  // once: a nest that has been through it (or started after) and buys the whole eye later gets three, like everyone
  for (const d of [none, load(null).save]) {
    const later = load({ ...d, forge: { eye: 3 } }).save;
    assert.equal(later.eyeThanks, undefined);
    assert.equal(later.eyeNote, undefined);
  }
  // and the thanks, once given, stays through every later load
  const again = load({ ...full, eyeNote: undefined }).save;
  assert.equal(again.eyeThanks, true);
  assert.equal(again.eyeNote, undefined, 'the word about it is said only once');
});
