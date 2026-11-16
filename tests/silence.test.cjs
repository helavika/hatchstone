const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// The Celestite's silent stone (levels 7 to 12): no glow, and every knock's ripple leans towards the weak spot. The
// blow as crackHit has it, the levels as levelConf makes them, a host's tap as hitEgg counts it and a guest's replay as
// coop.js has it, the glow as drawSpot draws it and the ripple as drawRipples does, and what aim earns.
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
  // what the guest's replay shows: the lean of every ripple it draws
  'const seen = []; const forgeLvl = () => 0, paintNet = () => {}, hitFeedback = (e, x, y, res) => seen.push(res.lean), fromEgg = (u, v) => [u, v];',
  cut(coop, '/** Replay shared hits', 'function installCoopRound(', 'coopReplayHits should sit just before installCoopRound'),
  'function guestTake(e, state) {',
  line(apply, /^  if \(coopIsGuest\(\) \|\| initial\) coopReplayHits\(.*$/m, 'a guest should replay the host\'s hits').replace('coopIsGuest() || initial', 'true').replace('!initial', 'true'),
  line(apply, /^  e\.taps = state\.taps; e\.crits = state\.crits; .*$/m, 'a guest should take the host\'s count'),
  '}',
  'Object.assign(this, { EGG_R, EGG_UNIT, LEAN_SLOP, LEAN_REACH, levelConf, crackHit, rippleLean, aimShare, aimStars, hostHit, guestTake, inside, seen });',
].join('\n');
const page = {};
vm.runInNewContext(src, page);
const { EGG_R, EGG_UNIT, LEAN_SLOP, levelConf, rippleLean, aimShare, aimStars, hostHit, guestTake, inside, seen } = page;
const plain = x => JSON.parse(JSON.stringify(x));

// newEgg's own rule for which eggs are silent, run on its own
const silentRule = line(crack, /^    silent: .*$/m, 'newEgg should say in one line which eggs are silent');
const silent = new Function('conf', `return ({${silentRule.trim().replace(/,$/, '')}}).silent;`);

/** A weak spot where newEgg would put one, from a seed. */
function spotFor(seed) {
  const R = page.seeded(seed + ':spot');
  for (;;) { const p = [0.25 + R() * 0.5, 0.3 + R() * 0.7]; if (inside(EGG_UNIT, p)) return p; }
}
/** An egg on the table, silent or plain. */
const egg = (hp, quiet, seed = 'seed-abcdef123456', spot = spotFor(seed)) => ({ conf: { n: 9 }, hp, damage: 0, taps: 0, crits: 0, search: 0, gems: 0, combo: 0, chain: 0, owed: 0,
  hits: [], seed, net: { segs: [], tips: [] }, spot, bands: 0, banded: 0, silent: quiet });
/** A tap somewhere on the face, as a hit the way it's sent: [u, v / EGG_R, power]. */
const at = (u, v, power = 1) => [u, v / EGG_R, power];
const onSpot = e => at(e.spot[0], e.spot[1]);
/** How far apart two angles are, either way round. */
const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

test('silent stone is the Celestite\'s alone: levels 7 to 12, its Gloom seal too, never Wander, a moon egg or a heart\'s', () => {
  for (let n = 1; n <= 24; n++) assert.equal(levelConf(n).silent, n >= 7 && n <= 12, `level ${n}`);
  assert.equal(levelConf(0).silent, false, 'Wander');
  for (let n = 7; n <= 12; n++) assert.equal(silent(levelConf(n)), true, `level ${n}`);
  assert.equal(silent({ ...levelConf(12), gloom: 2 }), true, 'the Gloom\'s seal on 12');
  assert.equal(silent({ ...levelConf(7), n: 'moon', moon: true, wander: true }), false, 'a moon egg keeps its glow');
  assert.equal(silent({ ...levelConf(12), n: 'heart', wander: true }), false, 'a heart\'s egg keeps its glow');
  assert.equal(silent({ ...levelConf(8), n: 0, wander: true, coop: true }), true, 'a shared egg of silent stone is silent on both screens');
  for (const n of [1, 4, 6, 13, 18, 24]) assert.equal(silent(levelConf(n)), false, `level ${n}`);
  // and it's still stone you find by ear, where Quarry Eye pings
  for (let n = 7; n <= 12; n++) assert.ok(levelConf(n).spotGlow < 0.5, `level ${n}`);
});

test('no glow on silent stone: drawSpot draws nothing on 7 to 12, and the same as before everywhere else', () => {
  const draw = cut(main, '/**\n * The weak spot:', '/**\n * A band of the Malachite', 'drawSpot should sit just before drawBandBreak in main.js');
  const marks = [];
  const ctx = new Proxy({}, { get: (o, k) => k in o ? o[k] : typeof k === 'string' && /^(fill|stroke)$/.test(k) ? () => marks.push(k) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}, set: (o, k, v) => (o[k] = v, true) });
  const run = new Function('ctx', 'game', 'L', 'TAU', 'hexA', 'fromEgg', `${draw}; return drawSpot;`)(ctx, { time: 1234 }, { k: 1 }, Math.PI * 2, () => 'x', (u, v) => [u, v]);
  for (let n = 1; n <= 24; n++) {
    const conf = levelConf(n);
    marks.length = 0;
    run({ conf, silent: silent(conf), state: 'cracking', spot: [0.5, 0.6], crystal: { c: ['#000000', '#ffffff', '#888888'] } });
    assert.equal(marks.length > 0, conf.spotGlow > 0 && !(n >= 7 && n <= 12), `level ${n}: ${marks.length} marks`);
  }
});

test('every ripple on silent stone leans towards the weak spot, within its slop, for many eggs and knocks', () => {
  let off = 0, n = 0, exact = 0;
  for (let s = 0; s < 400; s++) {
    const e = egg(1e6, true, 'egg' + s), R = page.seeded('taps' + s);
    for (let i = 0; i < 12; i++) {
      let p;
      do p = [0.1 + R() * 0.8, 0.1 + R() * 1.1]; while (!inside(EGG_UNIT, p));
      const truth = Math.atan2(e.spot[1] - p[1], e.spot[0] - p[0]), res = hostHit(e, at(...p));
      assert.ok(res.lean, `egg ${s}, knock ${i}`);
      const d = turn(res.lean.a, truth);
      assert.ok(d <= LEAN_SLOP + 1e-9, `egg ${s}, knock ${i}: ${d.toFixed(3)} off`);
      off += d; n++; if (d < 0.01) exact++;
    }
  }
  // a way to go, not the place: off true by a little, and seldom right on it
  assert.ok(off / n > LEAN_SLOP * 0.3 && off / n < LEAN_SLOP * 0.7, `on average ${(off / n).toFixed(3)} off`);
  assert.ok(exact / n < 0.1, `${exact} of ${n} dead on`);
  assert.equal(LEAN_SLOP, 0.3);
});

test('a ripple leans harder the nearer the spot, from a little at the far side of the egg to all of it beside the spot', () => {
  for (let s = 0; s < 100; s++) {
    const e = { seed: 'egg' + s, spot: spotFor('egg' + s) }, a = page.seeded('way' + s)() * Math.PI * 2;
    let last = 2;
    for (let d = 0.02; d < 1.2; d += 0.04) {
      const { s: k } = rippleLean(e, e.spot[0] - Math.cos(a) * d, e.spot[1] - Math.sin(a) * d, 3);
      assert.ok(k <= last + 1e-12 && k >= 0.15 && k <= 1, `egg ${s}, ${d.toFixed(2)} away: ${k}`);
      last = k;
    }
    assert.ok(rippleLean(e, e.spot[0] + 0.03, e.spot[1], 0).s > 0.9);
    assert.ok(rippleLean(e, e.spot[0] + 1.1, e.spot[1], 0).s === 0.15);
  }
});

test('host and guest draw the very same lean, from the spot, the egg\'s seed and the blow\'s number', () => {
  for (const seed of ['seed-abcdef123456', 'Zq9_x-0123456789abcd', 'another-shared-egg01']) {
    const host = egg(37, true, seed), guest = egg(37, true, seed), mine = [];
    seen.length = 0;
    const R = page.seeded(seed + 'knocks');
    while (host.damage < host.hp) {
      const res = hostHit(host, host.taps % 4 === 3 ? onSpot(host) : at(0.25 + R() * 0.5, 0.3 + R() * 0.8));
      mine.push(res.lean);
      if (host.taps % 3 === 0 || host.damage >= host.hp) guestTake(guest, { hits: host.hits.map(h => h.slice()), taps: host.taps, crits: host.crits, gems: host.gems, damage: host.damage });
    }
    assert.deepEqual(plain(seen), plain(mine), seed);
    assert.equal(aimShare(guest), aimShare(host));
  }
  // the same knock on another egg's seed wanders off true another way
  const a = egg(99, true, 'seed-aaaaaaaaaaaaaa', [0.5, 0.7]), b = egg(99, true, 'seed-bbbbbbbbbbbbbb', [0.5, 0.7]);
  assert.notEqual(hostHit(a, at(0.3, 0.4)).lean.a, hostHit(b, at(0.3, 0.4)).lean.a);
  // the line that computes it says where the numbers come from
  assert.match(crack, /const lean = e\.silent \? rippleLean\(e, u, v, e\.hits \? e\.hits\.length - 1 : 0\) : null;/);
});

/**
 * A player who reads the ripples, roughly: they know only that the spot is somewhere on the face, knock first anywhere,
 * see the way each ripple leans a little off (`eye`, on top of the stone's own wander) and how hard only as far,
 * middling or near, and hear the pitch only as plain, deeper or "closer…". They keep every place the spot could still
 * be, and knock in the middle of those. Taps until the first knock on the weak spot. Without the lean: by ear alone.
 */
function reader(e, useLean, eye = 0.25) {
  const cands = [], R = page.seeded(e.seed + ':player'), slop = LEAN_SLOP + eye * 2;
  for (let u = 0.08; u <= 0.92; u += 0.01) for (let v = 0.1; v <= 1.2; v += 0.01) if (inside(EGG_UNIT, [u, v])) cands.push([u, v]);
  let live = cands, p;
  do p = [0.15 + R() * 0.7, 0.2 + R() * 0.9]; while (!inside(EGG_UNIT, p));
  const bin = k => k < 0.4 ? 0 : k < 0.75 ? 1 : 2, pitch = w => w <= 0 ? 0 : w <= 0.2 ? 1 : 2;
  for (let taps = 1; taps < 60; taps++) {
    const res = hostHit(e, at(...p));
    if (res.crit) return taps;
    const was = p, seenWay = useLean && res.lean.a + (R() + R() + R() - 1.5) * 2 * eye;
    live = live.filter(c => {
      const d = Math.hypot(c[0] - was[0], c[1] - was[1]);
      if (pitch(Math.max(0, 1 - d / 0.2)) !== pitch(res.weak)) return false;
      if (!useLean) return true;
      return turn(Math.atan2(c[1] - was[1], c[0] - was[0]), seenWay) <= slop && bin(rippleLean({ seed: '', spot: c }, ...was, 0).s) === bin(res.lean.s);
    });
    if (!live.length) live = cands.filter(c => Math.hypot(c[0] - was[0], c[1] - was[1]) > 0.05);
    // the middle of what's left (the nearest of them to its average), so as not to waste a knock on a stray corner
    const mu = live.reduce((s, c) => s + c[0], 0) / live.length, mv = live.reduce((s, c) => s + c[1], 0) / live.length;
    p = live.reduce((b, c) => Math.hypot(c[0] - mu, c[1] - mv) < Math.hypot(b[0] - mu, b[1] - mv) ? c : b);
    live = live.filter(c => c !== p);
  }
  return 60;
}

test('two or three knocks find the spot by its ripples: one ripple alone is not enough, and far fewer than by ear', () => {
  const runs = useLean => Array.from({ length: 300 }, (_, s) => reader(egg(1e6, true, 'egg' + s), useLean)).sort((a, b) => a - b);
  const ear = runs(false), lean = runs(true);
  const med = a => a[a.length >> 1], mean = a => a.reduce((s, x) => s + x, 0) / a.length, share = (a, n) => a.filter(x => x === n).length / a.length;
  assert.ok(mean(lean) >= 2.2 && mean(lean) <= 3.2 && med(lean) <= 3, `with the ripples: median ${med(lean)}, mean ${mean(lean).toFixed(2)}`);
  assert.ok(share(lean, 2) < 0.6, `the first ripple alone gave it away ${Math.round(share(lean, 2) * 100)}% of the time`);
  assert.ok(lean.filter(x => x > 5).length < 300 * 0.05, 'and seldom a long hunt');
  assert.ok(mean(ear) > mean(lean) * 2, `by ear: mean ${mean(ear).toFixed(2)}; by the ripples ${mean(lean).toFixed(2)}`);
});

test('the search before the first hit stays forgiven, so stars stay about aim on silent stone too', () => {
  for (let s = 0; s < 60; s++) {
    const e = egg(37, true, 'egg' + s);
    reader(e, true);
    while (e.damage < e.hp) hostHit(e, onSpot(e));
    assert.equal(aimStars(e), 3, `egg ${s}: ${e.search} knocks of search, ${aimShare(e)}%`);
  }
});

test('plain stone is as it was: no lean, and the lean touches nothing else, not a crack nor a number', () => {
  const quiet = egg(37, true), plainEgg = egg(37, false);
  for (let i = 0; quiet.damage < quiet.hp; i++) {
    const h = i % 3 ? onSpot(quiet) : at(0.3 + (i % 7) * 0.06, 0.35 + (i % 5) * 0.08);
    const a = hostHit(quiet, h.slice()), b = hostHit(plainEgg, h.slice());
    assert.ok(a.lean);
    assert.equal(b.lean, null);
  }
  assert.deepEqual(plain(quiet.net.segs), plain(plainEgg.net.segs));
  assert.deepEqual([quiet.damage, quiet.taps, quiet.crits, quiet.search, quiet.gems], [plainEgg.damage, plainEgg.taps, plainEgg.crits, plainEgg.search, plainEgg.gems]);
  // an egg from an older build, with no word on silence, is plain
  const old = egg(37, false); delete old.silent;
  assert.equal(hostHit(old, at(0.4, 0.5)).lean, null);
});

test('the ripple leans on screen the way rippleLean says; with less motion it stands still, an arc on the spot\'s side', () => {
  const draw = cut(main, '\nfunction drawRipples() {', '\nfunction drawRays(', 'drawRipples and drawLean should sit just before drawRays in main.js');
  const pts = [];
  const ctx = new Proxy({}, { get: (o, k) => k in o ? o[k] : k === 'moveTo' || k === 'lineTo' ? (x, y) => pts.push([x, y]) : () => {}, set: (o, k, v) => (o[k] = v, true) });
  const game = { ripples: [] };
  new Function('ctx', 'game', 'L', 'TAU', 'clamp', 'hexA', `${draw}; Object.assign(game, { drawRipples });`)(ctx, game, { k: 1 }, Math.PI * 2, (v, a, b) => Math.max(a, Math.min(b, v)), () => 'x');
  const shape = r => { pts.length = 0; game.ripples = [r]; game.drawRipples(); return pts.map(p => p.slice()); };
  for (const a of [0, 1, 2.5, -2, -0.7]) for (const s of [0.15, 0.5, 1]) {
    const base = { x: 100, y: 200, r: 40, h: 0, lean: { a, s }, tint: '#aabbcc', life: 0.8 };
    // running: the far point of the ring lies the way of the lean, and reaches further the harder it leans
    const run = shape({ ...base, t: 0.5 });
    const far = run.reduce((b, p) => Math.hypot(p[0] - 100, p[1] - 200) > Math.hypot(b[0] - 100, b[1] - 200) ? p : b);
    assert.ok(turn(Math.atan2(far[1] - 200, far[0] - 100), a) < 0.2, `lean ${a}, ${s}`);
    const reach = Math.hypot(far[0] - 100, far[1] - 200), back = Math.hypot(...[run[0][0] - 100, run[0][1] - 200]);
    assert.ok(reach > back * (1 + 0.4 * s), `lean ${a}, ${s}: ${reach.toFixed(1)} against ${back.toFixed(1)}`);
    // with less motion: the same arc early and late, only on the side facing the spot
    const calm = { ...base, calm: true, life: 1.4 }, early = shape({ ...calm, t: 0.1 }), late = shape({ ...calm, t: 1.2 });
    assert.ok(early.length > 0);
    assert.deepEqual(early, late, 'it doesn\'t run');
    for (const [x, y] of early) assert.ok(turn(Math.atan2(y - 200, x - 100), a) < Math.PI / 2, 'and points the way');
  }
  // a plain ripple is the ring it always was
  assert.match(draw, /if \(r\.lean\) \{ drawLean\(r\); continue; \}\n    const k = r\.t \/ 0\.6;/);
});

test('Mossa tells of the silence in the second cave\'s talk, in a line of her own, within the talk\'s length; level 7 says it too', () => {
  const ch1 = cut(crack, '  ch1: () => [', ']],\n', 'ch1 should be in TALKS');
  assert.match(ch1, /\[MOSSA, "Down there the stone is quiet: no glow at all\. But your ripples lean towards the weak spot\. Watch them\."\]/);
  assert.ok(ch1.split('[MOSSA').length - 1 <= 5);
  assert.match(crack, /conf\.step === 7 && e\.silent \? tr\("silent stone: no glow here · watch which way the ripples lean"\)/);
  const i18n = read('i18n.js');
  for (const k of ['Down there the stone is quiet: no glow at all. But your ripples lean towards the weak spot. Watch them.', 'silent stone: no glow here · watch which way the ripples lean', 'closer…'])
    assert.ok(i18n.includes(JSON.stringify(k) + ':'), k);
});
