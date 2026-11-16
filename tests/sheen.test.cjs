const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// The Labradorite's stone (levels 19 to 24): the weak spot shows only in a flash of the stone's sheen, right after a
// blow lands on it. The blow as crackHit has it, the levels as levelConf makes them, a host's tap as hitEgg counts it
// and a guest's replay as coop.js has it, the flash as hitFeedback lights it and drawSheen draws it, and what aim earns.
const crack = read('crack.js'), coop = read('coop.js'), main = read('main.js');
const hit = cut(crack, '\nfunction hitEgg(', '\n}\n', 'hitEgg should sit in crack.js');
const apply = cut(coop, 'function coopApplySnapshot(', '\n}\n', 'coopApplySnapshot should sit in coop.js');
const src = [
  read('core.js'),
  'const LEVELS = 24;',
  cut(read('pixel.js'), 'function levelConf(', '\n}\n', 'levelConf should sit in pixel.js') + '\n}',
  cut(read('save.js'), 'function eggPoly(', '\n}\n', 'eggPoly should sit in save.js') + '\n}',
  line(crack, /^const EGG_R = .*$/m, 'the egg\'s height should be one line in crack.js'),
  line(crack, /^const EGG_UNIT = .*$/m, 'the egg\'s outline should be one line in crack.js'),
  cut(crack, '/** The rest of a crack network:', '/** Draw what\'s new on the shell:', 'crackHit should follow nearSeg in crack.js'),
  cut(crack, '// ---------- what a blow pays ----------', '/** A tap on the egg:', 'what a blow pays and what aim earns should sit just before hitEgg'),
  'function hostHit(e, hit) {',
  '  const power = hit[2];',
  line(hit, /^  e\.hits\.push\(hit\);$/m, 'hitEgg should keep every hit'),
  line(hit, /^  const res = crackHit\(.*$/m, 'hitEgg should crack the egg in one line'),
  line(hit, /^  e\.taps\+\+;$/m, 'hitEgg should count the tap'),
  line(hit, /^  if \(res\.crit\) e\.crits\+\+;$/m, 'hitEgg should count a hit on the weak spot'),
  line(hit, /^  const gems = blowPay\(.*$/m, 'hitEgg should pay for the blow in one line'),
  '  return res;',
  '}',
  // what the guest's replay shows: which of its blows flash
  'const seen = []; const forgeLvl = () => 0, buddyCatch = () => false, paintNet = () => {}, hitFeedback = (e, x, y, res) => seen.push(res.flash), fromEgg = (u, v) => [u, v];',
  cut(coop, '/** Replay shared hits', 'function installCoopRound(', 'coopReplayHits should sit just before installCoopRound'),
  'function guestTake(e, state) {',
  line(apply, /^  if \(coopIsGuest\(\) \|\| initial\) coopReplayHits\(.*$/m, 'a guest should replay the host\'s hits').replace('coopIsGuest() || initial', 'true').replace('!initial', 'true'),
  line(apply, /^  e\.taps = state\.taps; e\.crits = state\.crits; .*$/m, 'a guest should take the host\'s count'),
  '}',
  'Object.assign(this, { EGG_R, EGG_UNIT, SHEEN_LIFE, levelConf, crackHit, sheenGlow, aimShare, aimStars, hostHit, guestTake, inside, seen });',
].join('\n');
const page = {};
vm.runInNewContext(src, page);
const { EGG_R, EGG_UNIT, SHEEN_LIFE, levelConf, sheenGlow, aimShare, aimStars, hostHit, guestTake, inside, seen } = page;
const plain = x => JSON.parse(JSON.stringify(x));

// newEgg's own rule for which eggs flash, run on its own
const sheenRule = line(crack, /^    sheen: .*$/m, 'newEgg should say in one line which eggs flash');
const sheens = new Function('conf', `return ({${sheenRule.trim().replace(/,$/, '')}}).sheen;`);

/** A weak spot where newEgg would put one, from a seed. */
function spotFor(seed) {
  const R = page.seeded(seed + ':spot');
  for (;;) { const p = [0.25 + R() * 0.5, 0.3 + R() * 0.7]; if (inside(EGG_UNIT, p)) return p; }
}
/** An egg on the table, of the Labradorite's stone or plain. */
const egg = (hp, lit, seed = 'seed-abcdef123456', spot = spotFor(seed)) => ({ conf: { n: 21 }, hp, damage: 0, taps: 0, crits: 0, search: 0, gems: 0, combo: 0, chain: 0, owed: 0,
  hits: [], seed, net: { segs: [], tips: [] }, spot, bands: 0, banded: 0, silent: false, sheen: lit });
/** A tap somewhere on the face, as a hit the way it's sent: [u, v / EGG_R, power]. */
const at = (u, v, power = 1) => [u, v / EGG_R, power];
const onSpot = e => at(e.spot[0], e.spot[1]);
/** The Gloom's seal at the end of a cave, the way scenes.js makes it. */
const seal = n => { const conf = levelConf(n); conf.gloom = n / 6; conf.hp = Math.round(conf.hp * 1.4); return conf; };

test('the flash is the Labradorite\'s alone: levels 19 to 24, its Gloom seal too, never Wander, a moon egg or a heart\'s', () => {
  for (let n = 1; n <= 24; n++) assert.equal(levelConf(n).sheen, n >= 19, `level ${n}`);
  assert.equal(levelConf(0).sheen, false, 'Wander');
  for (let n = 19; n <= 24; n++) assert.equal(sheens(levelConf(n)), true, `level ${n}`);
  assert.equal(sheens(seal(24)), true, 'the Gloom\'s seal on 24');
  assert.equal(sheens({ ...levelConf(20), n: 'moon', moon: true, wander: true }), false, 'a moon egg as it was');
  assert.equal(sheens({ ...levelConf(24), n: 'heart', wander: true }), false, 'a heart\'s egg as it was');
  assert.equal(sheens({ ...levelConf(22), n: 0, wander: true, coop: true }), true, 'a shared egg of that stone flashes on both screens');
  for (let n = 1; n <= 18; n++) assert.equal(sheens(levelConf(n)), false, `level ${n}`);
  // the first hit must be findable: no glow, but stone you find by ear, where knocks sound deeper and Quarry Eye pings
  for (let n = 19; n <= 24; n++) { assert.equal(levelConf(n).spotGlow, 0, `level ${n}`); assert.ok(levelConf(n).spotGlow < 0.5); }
  assert.match(crack, /const byEar = conf => conf\.spotGlow < 0\.5;/);
  // and the rules of the other caves stay where they were
  for (let n = 19; n <= 24; n++) assert.ok(!levelConf(n).bands && !levelConf(n).silent, `level ${n}`);
});

test('a blow flashes only when it lands on the weak spot, and only on the Labradorite\'s stone', () => {
  let flashes = 0, misses = 0;
  for (let s = 0; s < 200; s++) {
    const lit = egg(1e6, true, 'egg' + s), dull = egg(1e6, false, 'egg' + s), R = page.seeded('taps' + s);
    for (let i = 0; i < 14; i++) {
      let p;
      if (i % 3 === 2) p = [lit.spot[0] + (R() - 0.5) * 0.24, lit.spot[1] + (R() - 0.5) * 0.24];
      else do p = [0.1 + R() * 0.8, 0.1 + R() * 1.1]; while (!inside(EGG_UNIT, p));
      const a = hostHit(lit, at(...p)), b = hostHit(dull, at(...p));
      assert.equal(a.flash, a.crit, `egg ${s}, blow ${i}`);
      assert.equal(b.flash, false);
      if (a.flash) flashes++; else misses++;
    }
  }
  assert.ok(flashes > 200 && misses > 200, `${flashes} flashes, ${misses} without`);
  // an egg from an older build, with no word on the sheen, never flashes
  const old = egg(37, false); delete old.sheen;
  assert.equal(hostHit(old, onSpot(old)).flash, false);
});

test('the flash is short: up at once, gone in about half a second; with less motion an even, softer light for just as long', () => {
  assert.ok(SHEEN_LIFE >= 0.4 && SHEEN_LIFE <= 0.6, `${SHEEN_LIFE} s`);
  assert.equal(sheenGlow(-0.01, false), 0, 'not before the blow');
  assert.equal(sheenGlow(SHEEN_LIFE, false), 0, 'gone at the end');
  assert.equal(sheenGlow(SHEEN_LIFE + 1, true), 0);
  assert.equal(sheenGlow(NaN, false), 0);
  assert.ok(sheenGlow(0.04, false) === 1 && sheenGlow(0.15, false) === 1, 'at full straight away, for a moment');
  let last = 1;
  for (let a = 0.05; a < SHEEN_LIFE; a += 0.01) { const k = sheenGlow(a, false); assert.ok(k <= last + 1e-12 && k >= 0, `${a.toFixed(2)} s: ${k}`); last = k; }
  assert.ok(sheenGlow(SHEEN_LIFE - 0.02, false) < 0.2, 'fading out at the end');
  const calm = [];
  for (let a = 0; a < SHEEN_LIFE; a += 0.01) calm.push(sheenGlow(a, true));
  assert.ok(calm.every(k => k === calm[0]) && calm[0] > 0.4 && calm[0] < 1, `held at ${calm[0]}`);
});

test('hitFeedback lights the flash on a weak-spot hit and puts it out on a miss, and only on that stone', () => {
  const lights = line(crack, /^  if \(e\.sheen\) game\.sheen = .*$/m, 'hitFeedback should light the flash in one line');
  const run = new Function('e', 'res', 'game', 'opts', `${lights}; return game.sheen;`);
  const game = { time: 5000 }, calm = { calm: false };
  const e = { sheen: true };
  assert.deepEqual(run(e, { flash: true }, game, () => calm), { e, t: 5000, calm: false });
  game.time = 5200;
  assert.equal(run(e, { flash: false }, game, () => calm), null, 'a miss puts it out');
  calm.calm = true;
  assert.equal(run(e, { flash: true }, game, () => calm).calm, true);
  // on other stone it is left alone
  game.sheen = 'kept';
  assert.equal(run({ sheen: false }, { flash: false, crit: true }, game, () => calm), 'kept');
  assert.match(cut(crack, 'function hitFeedback(', '\n}\n', 'hitFeedback should sit in crack.js'), /if \(e\.sheen\) game\.sheen = /);
});

test('drawSheen draws the flash on the spot, sliding while it lasts; with less motion the very same picture throughout', () => {
  const draw = cut(main, '// labradorite\'s play of colour', '/**\n * Quarry Eye\'s ping', 'drawSheen should sit just before drawPing in main.js');
  const marks = [];
  const ctx = new Proxy({}, { get: (o, k) => k in o ? o[k] : k === 'createRadialGradient' ? (...a) => { marks.push(a.map(n => Math.round(n * 100) / 100)); return { addColorStop() {} }; } : k === 'fill' || k === 'stroke' ? () => marks.push(k) : () => {}, set: (o, k, v) => (o[k] = v, true) });
  const game = { time: 0 }, L = { k: 1, ew: 200, egg: [] };
  const drawSheen = new Function('ctx', 'game', 'L', 'TAU', 'clamp', 'fromEgg', 'tracePoly', 'sheenGlow', 'SHEEN_LIFE', `${draw}; return drawSheen;`)(ctx, game, L, Math.PI * 2, (v, a, b) => Math.max(a, Math.min(b, v)), (u, v) => [u * 200, v * 200], () => {}, sheenGlow, SHEEN_LIFE);
  const e = { state: 'cracking', spot: [0.5, 0.6] };
  const shot = (t, calm) => { marks.length = 0; game.sheen = { e, t: 0, calm }; game.time = t * 1000; drawSheen(e); return plain(marks); };
  assert.equal(shot(0.05, false).length > 0, true, 'drawn right after the blow');
  assert.notDeepEqual(shot(0.05, false), shot(0.4, false), 'the colours slide');
  // centred on the spot
  assert.deepEqual(shot(0.1, false)[0].slice(0, 2), [100, 120]);
  assert.deepEqual(shot(0.05, true), shot(0.45, true), 'with less motion it doesn\'t shimmer');
  assert.equal(shot(SHEEN_LIFE + 0.01, false).length, 0, 'gone after');
  assert.equal(game.sheen, null, 'and forgotten');
  // not on another egg, nor once the shell is open
  marks.length = 0; game.sheen = { e: {}, t: 0 }; game.time = 50; drawSheen(e); assert.equal(marks.length, 0);
  marks.length = 0; game.sheen = { e, t: 0 }; drawSheen({ ...e, state: 'opening' }); assert.equal(marks.length, 0);
  assert.match(main, /drawSpot\(e\); drawSheen\(e\); drawPing\(e\);/);
});

test('host and guest flash on the very same blows', () => {
  for (const seed of ['seed-abcdef123456', 'Zq9_x-0123456789abcd', 'another-shared-egg01']) {
    const host = egg(48, true, seed), guest = egg(48, true, seed), mine = [];
    seen.length = 0;
    const R = page.seeded(seed + 'knocks');
    while (host.damage < host.hp) {
      const res = hostHit(host, host.taps % 3 ? onSpot(host) : at(0.25 + R() * 0.5, 0.3 + R() * 0.8));
      mine.push(res.flash);
      if (host.taps % 4 === 0 || host.damage >= host.hp) guestTake(guest, { hits: host.hits.map(h => h.slice()), taps: host.taps, crits: host.crits, gems: host.gems, damage: host.damage });
    }
    assert.deepEqual(plain(seen), mine, seed);
    assert.ok(mine.includes(true) && mine.includes(false));
    assert.equal(aimShare(guest), aimShare(host));
  }
});

test('the flash touches nothing else: the same cracks, damage, pay and count as plain stone', () => {
  const lit = egg(48, true), dull = egg(48, false);
  for (let i = 0; lit.damage < lit.hp; i++) {
    const h = i % 3 ? onSpot(lit) : at(0.3 + (i % 7) * 0.06, 0.35 + (i % 5) * 0.08);
    const a = hostHit(lit, h.slice()), b = hostHit(dull, h.slice());
    assert.deepEqual({ ...a, flash: 0 }, { ...b, flash: 0 });
  }
  assert.deepEqual(plain(lit.net), plain(dull.net));
  assert.deepEqual([lit.damage, lit.taps, lit.crits, lit.search, lit.gems, lit.chain, lit.owed], [dull.damage, dull.taps, dull.crits, dull.search, dull.gems, dull.chain, dull.owed]);
});

/**
 * A player who searches by pitch and then keeps the chain, roughly. Before the first hit they hear the knock only as
 * plain, deeper or "closer…", keep every place the spot could still be and knock in the middle of those. Every tap
 * lands a little off where they aim (a finger's scatter). Once a blow lands on the spot, without the flash they know
 * only where that blow fell (somewhere on the spot, not its middle) and keep tapping there; with it they see the
 * spot's middle light up and aim there. Returns the taps to open the egg and the taps of the search.
 */
function player(e, sees, finger = 0.035) {
  const R = page.seeded(e.seed + ':player'), cands = [];
  for (let u = 0.08; u <= 0.92; u += 0.01) for (let v = 0.1; v <= 1.2; v += 0.01) if (inside(EGG_UNIT, [u, v])) cands.push([u, v]);
  const pitch = w => w <= 0 ? 0 : w <= 0.2 ? 1 : 2, jitter = () => (R() + R() + R() - 1.5) * 2 * finger;
  let live = cands, aim, search = 0, known = null;
  do aim = [0.15 + R() * 0.7, 0.2 + R() * 0.9]; while (!inside(EGG_UNIT, aim));
  while (e.damage < e.hp && e.taps < 400) {
    let p = [aim[0] + jitter(), aim[1] + jitter()];
    if (!inside(EGG_UNIT, p)) p = aim;
    const res = hostHit(e, at(...p));
    if (!known && !res.crit) {
      search++;
      live = live.filter(c => pitch(Math.max(0, 1 - Math.hypot(c[0] - p[0], c[1] - p[1]) / 0.2)) === pitch(res.weak));
      if (!live.length) live = cands.filter(c => Math.hypot(c[0] - p[0], c[1] - p[1]) > 0.05);
      const mu = live.reduce((s, c) => s + c[0], 0) / live.length, mv = live.reduce((s, c) => s + c[1], 0) / live.length;
      aim = live.reduce((b, c) => Math.hypot(c[0] - mu, c[1] - mv) < Math.hypot(b[0] - mu, b[1] - mv) ? c : b);
      live = live.filter(c => c !== aim);
    } else if (res.crit) {
      // the flash shows the middle of the spot (seen a hair off); without it, only where this blow fell
      known = res.flash ? [e.spot[0] + jitter() * 0.2, e.spot[1] + jitter() * 0.2] : p;
      aim = known;
    }
  }
  return { taps: e.taps, search };
}

/** Taps per egg on 19 to 24 (24 as the Gloom's seal), the plain hammer and a strong one, with and without the flash. */
function measure(power) {
  const rows = [];
  for (let n = 19; n <= 24; n++) {
    const hp = (n === 24 ? seal(n) : levelConf(n)).hp, runs = { before: [], after: [], search: [] };
    for (let s = 0; s < 200; s++) {
      const seed = `lv${n}-egg${s}`, mk = lit => Object.assign(egg(hp / power, lit, seed), { conf: { n } });
      const b = player(mk(false), false), a = player(mk(true), true);
      assert.equal(a.search, b.search, `level ${n}, egg ${s}: the flash can't help find the spot the first time`);
      runs.before.push(b.taps); runs.after.push(a.taps); runs.search.push(a.search);
    }
    const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    rows.push({ n, hp, before: mean(runs.before), after: mean(runs.after), search: mean(runs.search) });
  }
  return rows;
}

test('a player who searches by pitch needs fewer taps with the flash, and the search for the first hit is the same', t => {
  for (const power of [1, 2]) {
    const rows = measure(power);
    t.diagnostic(`hammer ${power}: ` + rows.map(r => `${r.n}${r.n === 24 ? ' (seal)' : ''}: hp ${r.hp}, ${r.before.toFixed(1)} -> ${r.after.toFixed(1)} taps (search ${r.search.toFixed(1)})`).join('; '));
    for (const r of rows) {
      assert.ok(r.after < r.before, `level ${r.n}: ${r.before.toFixed(2)} -> ${r.after.toFixed(2)}`);
      // a help, not a giveaway: the egg still takes most of its taps
      assert.ok(r.after > r.before * 0.6, `level ${r.n}: ${r.before.toFixed(2)} -> ${r.after.toFixed(2)}`);
    }
  }
});

test('the search before the first hit stays forgiven, so stars stay about aim', () => {
  for (let s = 0; s < 60; s++) {
    const e = egg(seal(24).hp, true, 'egg' + s);
    // knock round the egg by ear until the first hit, then keep on the spot
    const R = page.seeded('search' + s);
    let found = false;
    for (let i = 0; i < 40 && !found; i++) found = hostHit(e, i > 5 + s % 7 ? onSpot(e) : at(0.25 + R() * 0.1, 0.35 + R() * 0.1)).crit;
    while (e.damage < e.hp) hostHit(e, onSpot(e));
    assert.equal(aimStars(e), 3, `egg ${s}: ${e.search} knocks of search, ${aimShare(e)}%`);
  }
});

test('Mossa tells of the flash in the fourth cave\'s talk, in a line of her own, within the talk\'s length; level 19 says it too', () => {
  const ch3 = cut(crack, '  ch3: () => [', ']],\n', 'ch3 should be in TALKS');
  assert.match(ch3, /\[MOSSA, "Its weak spot flashes only when you strike it\. Keep striking\. You won't lose it\."/);
  assert.ok(ch3.split('[MOSSA').length - 1 <= 5);
  assert.match(crack, /conf\.step === 19 && e\.sheen \? tr\("this stone shows its weak spot only as you hit it · keep the chain"\)/);
  const i18n = read('i18n.js');
  for (const k of ['Its weak spot flashes only when you strike it. Keep striking. You won\'t lose it.', 'this stone shows its weak spot only as you hit it · keep the chain'])
    assert.ok(i18n.includes(JSON.stringify(k) + ':'), k);
});
