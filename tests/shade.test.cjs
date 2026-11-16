const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// The Gloom's first seal (level 6, until it is cleared): every third blow it lays a patch of shadow, a blow under one
// breaks half the stone, and a blow on the weak spot burns away the patches beside it. The blow as crackHit has it, the
// seal as startLevel makes it, a host's tap as hitEgg counts it and a guest's replay as coop.js has it, the patches as
// drawShade draws them, and what aim earns.
const crack = read('crack.js'), coop = read('coop.js'), main = read('main.js'), scenes = read('scenes.js');
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
  // what the guest's replay shows: the patches each blow softened, burnt and laid
  'const seen = []; const forgeLvl = () => 0, paintNet = () => {}, hitFeedback = (e, x, y, res) => seen.push([res.soft, res.burnt.map(p => p.id), res.laid && res.laid.id]), fromEgg = (u, v) => [u, v];',
  cut(coop, '/** Replay shared hits', 'function installCoopRound(', 'coopReplayHits should sit just before installCoopRound'),
  'function guestTake(e, state) {',
  line(apply, /^  if \(coopIsGuest\(\) \|\| initial\) coopReplayHits\(.*$/m, 'a guest should replay the host\'s hits').replace('coopIsGuest() || initial', 'true').replace('!initial', 'true'),
  line(apply, /^  e\.taps = state\.taps; e\.crits = state\.crits; .*$/m, 'a guest should take the host\'s count'),
  '}',
  'Object.assign(this, { EGG_R, EGG_UNIT, SHADE_EVERY, SHADE_MAX, SHADE_CLEAR, SHADE_BURN, levelConf, crackHit, shadeAt, aimShare, aimStars, hostHit, guestTake, inside, seen });',
].join('\n');
const page = {};
vm.runInNewContext(src, page);
const { EGG_R, EGG_UNIT, SHADE_EVERY, SHADE_MAX, SHADE_CLEAR, SHADE_BURN, levelConf, aimShare, aimStars, hostHit, guestTake, inside, seen } = page;
const plain = x => JSON.parse(JSON.stringify(x));

// startLevel's own rule for the Gloom's seals, and newEgg's for which eggs are shaded, each run on its own
const sealRule = line(scenes, /^  if \(n && n % 6 === 0 && !save\.stars\[n\]\) .*$/m, 'startLevel should seal a level in one line');
const seal = new Function('conf', 'n', 'save', `${sealRule}; return conf;`);
const shadeRule = line(crack, /^    shade: .*$/m, 'newEgg should say in one line which eggs are shaded');
const shaded = new Function('conf', `return ({${shadeRule.trim().replace(/,$/, '')}}).shade;`);
const sealOf = (n, stars = {}) => seal(levelConf(n), n, { stars });

/** A weak spot where newEgg would put one, from a seed. */
function spotFor(seed) {
  const R = page.seeded(seed + ':spot');
  for (;;) { const p = [0.25 + R() * 0.5, 0.3 + R() * 0.7]; if (inside(EGG_UNIT, p)) return p; }
}
/** An egg on the table, the Gloom's first seal or plain stone. */
const egg = (hp, shade, seed = 'seed-abcdef123456', spot = spotFor(seed)) => ({ conf: { n: 6 }, hp, damage: 0, taps: 0, crits: 0, search: 0, gems: 0, combo: 0, chain: 0, owed: 0,
  hits: [], seed, net: { segs: [], tips: [] }, spot, bands: 0, banded: 0, silent: false, sheen: false, shade, patches: [], shadeLaid: 0 });
/** A tap somewhere on the face, as a hit the way it's sent: [u, v / EGG_R, power]. */
const at = (u, v, power = 1) => [u, v / EGG_R, power];
const onSpot = e => at(e.spot[0], e.spot[1]);
const HP = sealOf(6).hp;

/** Every point of the shell on a fine grid, and the share of them under a patch. */
const GRID = [];
for (let u = 0.01; u < 1; u += 0.01) for (let v = 0.01; v < 1.3; v += 0.01) if (inside(EGG_UNIT, [u, v])) GRID.push([u, v]);
const covered = e => GRID.filter(([u, v]) => e.patches.some(p => Math.hypot(u - p.u, v - p.v) < p.r)).length / GRID.length;

/** A player who sees the glow and aims at it, each tap landing a finger's scatter off. Returns the taps and stars. */
function glowBot(e, finger, R = page.seeded(e.seed + ':finger')) {
  const jitter = () => (R() + R() + R() - 1.5) * 2 * finger;
  while (e.damage < e.hp && e.taps < 400) {
    let p = [e.spot[0] + jitter(), e.spot[1] + jitter()];
    if (!inside(EGG_UNIT, p)) p = e.spot;
    hostHit(e, at(...p));
  }
  return { taps: e.taps, stars: aimStars(e), share: aimShare(e) };
}

test('the shadows are the first seal\'s alone: level 6 until it is cleared, never another level, a replay, Wander or a shared egg', () => {
  for (let n = 0; n <= 24; n++) assert.equal(shaded(sealOf(n)), n === 6, `level ${n}`);
  assert.equal(sealOf(6).gloom, 1);
  assert.equal(shaded(sealOf(6, { 6: 1 })), false, 'a cleared seal is replayed as plain stone');
  for (const n of [12, 18, 24]) assert.equal(shaded(sealOf(n)), false, `the seal on ${n} is not this step`);
  assert.equal(shaded({ ...levelConf(6), n: 0, wander: true, coop: true }), false, 'a shared egg');
  assert.equal(shaded({ ...levelConf(6), n: 'moon', moon: true, wander: true }), false, 'a moon egg');
});

test('a patch after every third blow, never more than three at once, never over a third of the shell nor on the spot\'s middle', () => {
  let laid = 0, most = 0, worst = 0;
  for (let s = 0; s < 300; s++) {
    const e = egg(1e6, true, 'egg' + s), R = page.seeded('taps' + s);
    for (let i = 0; i < 40; i++) {
      // knocks round the egg, now and then on the spot (which burns the patches beside it)
      let p;
      do p = i % 5 === 4 ? [e.spot[0], e.spot[1]] : [0.1 + R() * 0.8, 0.1 + R() * 1.1]; while (!inside(EGG_UNIT, p));
      const res = hostHit(e, at(...p));
      if (res.laid) { laid++; assert.equal((i + 1) % SHADE_EVERY, 0, `egg ${s}: a patch after blow ${i + 1}`); }
      assert.ok(e.patches.length <= SHADE_MAX, `egg ${s}, blow ${i + 1}: ${e.patches.length} patches`);
      most = Math.max(most, e.patches.length);
      for (const q of e.patches) {
        assert.ok(inside(EGG_UNIT, [q.u, q.v]), `egg ${s}: a patch off the egg`);
        assert.ok(Math.hypot(q.u - e.spot[0], q.v - e.spot[1]) >= q.r + SHADE_CLEAR - 1e-9, `egg ${s}: a patch on the spot's middle`);
      }
      if (i % 3 === 2) worst = Math.max(worst, covered(e));
    }
  }
  assert.equal(most, SHADE_MAX);
  assert.ok(laid > 300 * 3, `${laid} patches laid`);
  assert.ok(worst <= 1 / 3, `at worst ${(worst * 100).toFixed(1)}% of the shell under shadow`);
  // and the weak spot is never shadowed whole: the middle of it, where a blow counts most, is always clear
  assert.equal(SHADE_EVERY, 3); assert.equal(SHADE_MAX, 3);
});

test('a blow under a patch breaks half the stone; the same blow beside it, all of it; and the patch alone decides', () => {
  for (let s = 0; s < 50; s++) {
    const seed = 'egg' + s, spot = [0.5, 0.95];
    const under = egg(1e6, true, seed, spot), bare = egg(1e6, true, seed, spot);
    under.patches = [{ u: 0.4, v: 0.45, r: 0.13, id: 0 }];
    const a = hostHit(under, at(0.42, 0.47)), b = hostHit(bare, at(0.42, 0.47));
    assert.equal(a.soft, true); assert.equal(b.soft, false);
    assert.ok(Math.abs(a.dmg - b.dmg / 2) < 1e-12, `egg ${s}: ${a.dmg} vs ${b.dmg}`);
    assert.equal(a.crit, b.crit); assert.equal(a.weak, b.weak);
    // just outside its edge, nothing is softened
    const edge = egg(1e6, true, seed, spot);
    edge.patches = [{ u: 0.4, v: 0.45, r: 0.13, id: 0 }];
    assert.equal(hostHit(edge, at(0.4 + 0.135, 0.45)).soft, false);
  }
  // on plain stone, or the seal with no patch down, a blow is as it always was
  const p = egg(1e6, false), q = egg(1e6, true);
  assert.deepEqual(plain({ ...hostHit(p, at(0.3, 0.5)), laid: 0 }), plain({ ...hostHit(q, at(0.3, 0.5)), laid: 0 }));
});

test('a blow on the weak spot burns away the patches beside it; a miss beside one, or a hit far from one, does not', () => {
  for (let s = 0; s < 50; s++) {
    const spot = [0.5, 0.7], near = { u: 0.5 + 0.13 + SHADE_CLEAR + 0.01, v: 0.7, r: 0.13, id: 0 }, far = { u: 0.3, v: 1.05, r: 0.12, id: 1 };
    const e = egg(1e6, true, 'egg' + s, spot);
    e.patches = [near, far];
    const res = hostHit(e, onSpot(e));
    assert.equal(res.crit, true);
    assert.deepEqual(res.burnt.map(p => p.id), [0]);
    assert.deepEqual(e.patches.map(p => p.id), [1]);
    // a miss right beside a patch leaves it be
    const m = egg(1e6, true, 'egg' + s, spot);
    m.patches = [{ u: 0.3, v: 0.4, r: 0.12, id: 0 }];
    const res2 = hostHit(m, at(0.3 + 0.15, 0.4));
    assert.equal(res2.crit, false); assert.equal(res2.burnt.length, 0); assert.equal(m.patches.length, 1);
  }
  assert.ok(SHADE_BURN >= 0.08 && SHADE_BURN <= 0.15);
});

test('host and guest lay, soften under and burn the very same patches, from the egg\'s seed and the blow\'s number', () => {
  for (const seed of ['seed-abcdef123456', 'Zq9_x-0123456789abcd', 'another-shared-egg01']) {
    const host = egg(HP, true, seed), guest = egg(HP, true, seed), mine = [];
    seen.length = 0;
    const R = page.seeded(seed + 'knocks');
    while (host.damage < host.hp) {
      const res = hostHit(host, host.taps % 3 === 2 ? onSpot(host) : at(0.25 + R() * 0.5, 0.3 + R() * 0.8));
      mine.push([res.soft, res.burnt.map(p => p.id), res.laid && res.laid.id]);
      if (host.taps % 4 === 0 || host.damage >= host.hp) {
        guestTake(guest, { hits: host.hits.map(h => h.slice()), taps: host.taps, crits: host.crits, gems: host.gems, damage: host.damage });
        assert.deepEqual(plain(guest.patches), plain(host.patches), seed);
      }
    }
    assert.deepEqual(plain(seen), plain(mine), seed);
    assert.ok(mine.some(m => m[2] !== null) && mine.some(m => m[1].length), `${seed}: laid and burnt`);
    assert.equal(aimShare(guest), aimShare(host));
    assert.equal(guest.gems, host.gems);
  }
  // the line that lays them says where the numbers come from
  assert.match(crack, /const R = seeded\(e\.seed \+ ":" \+ i \+ ":shade"\)/);
  assert.match(crack, /const i = e\.hits \? e\.hits\.length - 1 : 0;/);
});

test('the shadows never touch aim: the same blows hit or miss the spot as on plain stone, and a perfect aim gets three stars', () => {
  for (let s = 0; s < 100; s++) {
    const a = egg(HP, true, 'egg' + s), b = egg(HP, false, 'egg' + s), R = page.seeded('aim' + s);
    for (let i = 0; i < 30; i++) {
      const h = at(a.spot[0] + (R() - 0.5) * 0.3, a.spot[1] + (R() - 0.5) * 0.3);
      assert.equal(hostHit(a, h.slice()).crit, hostHit(b, h.slice()).crit);
    }
    // a perfect aim is never under a patch, so it opens the seal in as many taps as plain stone, with three stars
    const p = egg(HP, true, 'egg' + s), q = egg(HP, false, 'egg' + s);
    while (p.damage < p.hp) assert.equal(hostHit(p, onSpot(p)).soft, false);
    while (q.damage < q.hp) hostHit(q, onSpot(q));
    assert.equal(p.taps, q.taps);
    assert.equal(aimStars(p), 3);
  }
});

test('the seal stays winnable with no forge at all: a plain-hammer player opens it in a few more taps, and stars are as before', t => {
  const rows = [];
  for (const finger of [0.035, 0.06, 0.1]) {
    const before = [], after = [], stars = [[], []];
    for (let s = 0; s < 300; s++) {
      const b = glowBot(egg(HP, false, 'egg' + s), finger), a = glowBot(egg(HP, true, 'egg' + s), finger);
      before.push(b.taps); after.push(a.taps); stars[0].push(b.stars); stars[1].push(a.stars);
    }
    const mean = x => x.reduce((p, q) => p + q, 0) / x.length;
    rows.push({ finger, before: mean(before), after: mean(after), most: Math.max(...after), stars: [mean(stars[0]), mean(stars[1])] });
  }
  t.diagnostic(`level 6 seal, hp ${HP}, plain hammer: ` + rows.map(r => `finger ${r.finger}: ${r.before.toFixed(1)} -> ${r.after.toFixed(1)} taps (most ${r.most}), stars ${r.stars[0].toFixed(2)} -> ${r.stars[1].toFixed(2)}`).join('; '));
  for (const r of rows) {
    assert.ok(r.after >= r.before && r.after <= r.before * 1.3, `finger ${r.finger}: ${r.before.toFixed(1)} -> ${r.after.toFixed(1)}`);
    assert.ok(r.after < 25 && r.most < 40, `finger ${r.finger}: ${r.after.toFixed(1)} taps, at most ${r.most}`);
    // the stars barely move: a share of aim over a few more taps
    assert.ok(Math.abs(r.stars[1] - r.stars[0]) < 0.15, `finger ${r.finger}: ${r.stars[0]} -> ${r.stars[1]}`);
  }
  // and even one who never finds the spot gets through: every blow breaks at least half of what it would
  const lost = egg(HP, true, 'lost'), R = page.seeded('lost');
  while (lost.damage < lost.hp && lost.taps < 200) hostHit(lost, at(0.2 + R() * 0.15, 1.0 + R() * 0.1));
  assert.ok(lost.damage >= lost.hp && lost.taps <= HP * 2, `${lost.taps} taps`);
});

test('drawShade draws the patches on the shell, breathing; with less motion the very same picture throughout, and a burnt one fades', () => {
  const draw = cut(main, '/**\n * The Gloom\'s patches of shadow', '/** A band of light sweeping', 'drawShade should sit just before drawGleam in main.js');
  const marks = [];
  const ctx = new Proxy({}, { get: (o, k) => k in o ? o[k] : k === 'createRadialGradient' ? (...a) => { marks.push(a.map(n => Math.round(n * 100) / 100)); return { addColorStop: (s, c) => marks.push(c) }; } : /^(fill|stroke|fillRect)$/.test(k) ? (...a) => marks.push(k, ...a) : () => {}, set: (o, k, v) => (o[k] = v, true) });
  const game = { time: 0 }, L = { k: 1, ew: 200, egg: [] }, calm = { calm: false };
  const hexA = (h, a) => `${h}/${Math.round(a * 1000)}`;
  const drawShade = new Function('ctx', 'game', 'L', 'TAU', 'clamp', 'fromEgg', 'tracePoly', 'seeded', 'hexA', 'opts', `${draw}; return drawShade;`)(ctx, game, L, Math.PI * 2, (v, a, b) => Math.max(a, Math.min(b, v)), (u, v) => [u * 200, v * 200], () => {}, page.seeded, hexA, () => calm);
  const p = { u: 0.4, v: 0.5, r: 0.12, id: 0, shown: 0 };
  const e = { state: 'cracking', patches: [p], crystal: { c: ['#000000', '#ffffff', '#888888'] } };
  const shot = t => { marks.length = 0; game.time = t; drawShade(e); return plain(marks); };
  assert.ok(shot(800).length > 0, 'drawn');
  assert.deepEqual(shot(800)[0].slice(0, 2), [80, 100], 'centred on the patch');
  assert.notDeepEqual(shot(800), shot(1700), 'it breathes');
  assert.notDeepEqual(shot(100), shot(600), 'a new one seeps in');
  calm.calm = true;
  assert.deepEqual(shot(100), shot(2600), 'with less motion it stands still');
  // a burnt one: a flare that is gone in a moment, and forgotten
  e.patches = [];
  calm.calm = false;
  game.shadeFx = [{ e, p, t: 3000, calm: false }];
  assert.ok(shot(3100).length > 0); assert.notDeepEqual(shot(3100), shot(3300), 'the flare runs');
  shot(3600); assert.equal(game.shadeFx, null);
  game.shadeFx = [{ e, p, t: 4000, calm: true }];
  assert.ok(shot(4100).length > 0);
  assert.equal(shot(4100).filter(m => m === 'stroke').length < shot(4100).filter(m => m === 'fill').length, true);
  shot(4800); assert.equal(game.shadeFx, null);
  // nothing on another state, nor with no patches
  assert.equal(shot(5000).length, 0);
  e.patches = [p]; e.state = 'opening'; assert.equal(shot(5000).length, 0);
  assert.match(main, /drawBandBreak\(e\); drawShade\(e\); \}/);
});

test('hitFeedback flares a burnt patch and seeps in a laid one; a softened blow\'s number shows in the Gloom\'s lilac', () => {
  const fb = cut(crack, 'function hitFeedback(', '\n}\n', 'hitFeedback should sit in crack.js');
  assert.match(fb, /if \(res\.burnt && res\.burnt\.length\) shadeBurn\(e, res\.burnt\);/);
  assert.match(fb, /if \(res\.laid\) shadeLay\(e, res\.laid\);/);
  assert.match(fb, /res\.soft \? "#c9b8f0"/);
  // with less motion the burn throws no sparks
  const burn = cut(crack, 'function shadeBurn(', '\n}\n', 'shadeBurn should sit in crack.js');
  assert.ok(burn.indexOf('if (calm) return;') < burn.indexOf('burst('));
});

test('Mossa tells of the shadows in the first seal\'s talk, in a line of her own, within the talk\'s length; the map and the README name every cave\'s rule', () => {
  const g1 = cut(crack, '  g1: () => [', ']],\n', 'g1 should be in GLOOM_TALKS');
  assert.match(g1, /\[MOSSA, "Where the Gloom lays a shadow, blows land soft\. Strike the glow beside it\. The shadow burns\."/);
  assert.equal((g1.match(/\[(MOSSA|GLOOM), /g) || []).length, 5);
  const i18n = read('i18n.js');
  for (const k of ['Where the Gloom lays a shadow, blows land soft. Strike the glow beside it. The shadow burns.', 'a shadow: blows under it land soft', 'the light burns the shadow away'])
    assert.ok(i18n.includes(JSON.stringify(k) + ':'), k);
  const notes = new Function(`${line(read('data.js'), /^const CAVE_NOTES = .*$/m, 'CAVE_NOTES should be one line')}; return CAVE_NOTES;`)();
  const uk = JSON.parse(line(i18n, /caveNotes: \[.*\]/, 'caveNotes in Ukrainian').replace(/^caveNotes: /, ''));
  assert.equal(notes.length, 4); assert.equal(uk.length, 4);
  for (const [i, re, reUk] of [[0, /shadow/, /тін/], [1, /Silent/, /Тихий/], [2, /Banded/, /Смугастий/], [3, /Flashing/, /Мерехтливий/]]) {
    assert.match(notes[i], re); assert.match(uk[i], reUk);
    assert.ok(notes[i].length <= 75 && uk[i].length <= 85, `cave ${i}: short`);
  }
  const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
  assert.match(readme, /lays shadows[^]*silent[^]*bands move the spot[^]*flashes only when you hit it/);
});
