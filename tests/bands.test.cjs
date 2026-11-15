const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// The Malachite's banded stone (levels 13 to 18): the blow as crackHit has it, the levels as levelConf makes them, a
// host's tap as hitEgg counts it and a guest's replay as coop.js has it, and what aim earns.
const crack = read('crack.js'), coop = read('coop.js');
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
  'const forgeLvl = () => 0, paintNet = () => {}, hitFeedback = () => {}, fromEgg = (u, v) => [u, v];',
  cut(coop, '/** Replay shared hits', 'function installCoopRound(', 'coopReplayHits should sit just before installCoopRound'),
  'function guestTake(e, state) {',
  line(apply, /^  if \(coopIsGuest\(\) \|\| initial\) coopReplayHits\(.*$/m, 'a guest should replay the host\'s hits').replace('coopIsGuest() || initial', 'true').replace('!initial', 'false'),
  line(apply, /^  e\.taps = state\.taps; e\.crits = state\.crits; .*$/m, 'a guest should take the host\'s count'),
  '}',
  'Object.assign(this, { EGG_R, EGG_UNIT, BANDS, levelConf, crackHit, aimShare, aimStars, hostHit, guestTake, inside });',
].join('\n');
const page = {};
vm.runInNewContext(src, page);
const { EGG_R, EGG_UNIT, BANDS, levelConf, aimShare, aimStars, hostHit, guestTake, inside } = page;
const plain = x => JSON.parse(JSON.stringify(x));

// newEgg's own rule for which eggs are banded, run on its own
const bandRule = line(crack, /^    bands: conf\.bands && .*$/m, 'newEgg should say in one line which eggs are banded');
const banded = new Function('conf', 'BANDS', `return ({${bandRule.trim().replace(/,$/, '')}}).bands;`);

const START = [0.5, 0.6 * EGG_R];
/** An egg on the table, banded or plain, with a weak spot where a co-op round would put it. */
const egg = (hp, bands, seed = 'seed-abcdef123456') => ({ conf: { n: 13 }, hp, damage: 0, taps: 0, crits: 0, search: 0, gems: 0, combo: 0, chain: 0, owed: 0,
  hits: [], seed, net: { segs: [], tips: [] }, spot: START.slice(), bands, banded: bands });
/** A tap where the weak spot is now (a perfect aim), as a hit the way it's sent: [u, v / EGG_R, power]. */
const onSpot = (e, power = 1) => [e.spot[0], e.spot[1] / EGG_R, power];

test('the bands are the Malachite\'s alone: levels 13 to 18, never Wander, a moon egg or a heart\'s', () => {
  for (let n = 1; n <= 24; n++) assert.equal(levelConf(n).bands, n >= 13 && n <= 18, `level ${n}`);
  assert.equal(levelConf(0).bands, false, 'Wander');
  assert.equal(BANDS, 2);
  assert.equal(banded(levelConf(13), BANDS), 2);
  assert.equal(banded(levelConf(18), BANDS), 2, 'the Gloom\'s seal on 18 is banded too');
  assert.equal(banded({ ...levelConf(13), n: 'moon', moon: true, wander: true }, BANDS), 0, 'a moon egg');
  assert.equal(banded({ ...levelConf(18), n: 'heart', wander: true }, BANDS), 0, 'a heart\'s egg');
  assert.equal(banded({ ...levelConf(13), n: 0, wander: true, coop: true }, BANDS), 2, 'a shared egg of banded stone would be banded on both screens');
  for (const n of [1, 4, 8, 12, 19, 24]) assert.equal(banded(levelConf(n), BANDS), 0, `level ${n}`);
});

test('a band breaks as the damage crosses a third and two thirds of the stone, and the spot moves exactly twice', () => {
  for (const [hp, power] of [[30, 1], [37, 1], [52, 1], [30, 2.4], [52, 3.2]]) {
    const e = egg(hp, 2), moves = [];
    let last = e.spot.slice();
    while (e.damage < e.hp) {
      const before = e.damage, res = hostHit(e, onSpot(e, power));
      if (e.spot[0] !== last[0] || e.spot[1] !== last[1]) { moves.push([before, e.damage, res.band]); last = e.spot.slice(); }
      else assert.equal(res.band, 0);
    }
    assert.equal(moves.length, 2, `hp ${hp}, power ${power}: ${JSON.stringify(moves)}`);
    assert.ok(moves[0][0] < hp / 3 && moves[0][1] >= hp / 3, 'the first at a third');
    assert.ok(moves[1][0] < hp * 2 / 3 && moves[1][1] >= hp * 2 / 3, 'the second at two thirds');
    assert.equal(e.bands, 0);
  }
});

test('one blow that crosses both thirds breaks both bands, and the blow that opens the egg breaks none', () => {
  const e = egg(30, 2);
  hostHit(e, [0.3, 0.3, 30]);
  assert.equal(e.bands, 2, 'the egg opened: no band left to break on it');
  const f = egg(30, 2);
  const res = hostHit(f, [0.3, 0.3, 22]);
  assert.ok(f.damage >= 20 && f.damage < 30);
  assert.equal(res.band, 2);
  assert.equal(f.bands, 0);
});

test('the new spot is on the face, clear of the edge, and well away from the old one', () => {
  for (let s = 0; s < 300; s++) {
    const e = egg(30, 2, 'egg' + s), seen = [e.spot.slice()];
    while (e.damage < e.hp) { hostHit(e, onSpot(e, 1)); if (e.spot[0] !== seen.at(-1)[0] || e.spot[1] !== seen.at(-1)[1]) seen.push(e.spot.slice()); }
    assert.equal(seen.length, 3);
    for (let i = 1; i < 3; i++) {
      const [u, v] = seen[i];
      assert.ok(inside(EGG_UNIT, seen[i]) && u >= 0.25 && u <= 0.75 && v >= 0.3 && v <= 1, `egg ${s}: ${seen[i]}`);
      assert.ok(Math.hypot(u - seen[i - 1][0], v - seen[i - 1][1]) > 0.3, `egg ${s}: moved far enough`);
    }
  }
});

test('host and guest move the spot to the very same places, from the egg\'s seed and the blow\'s number', () => {
  for (const seed of ['seed-abcdef123456', 'Zq9_x-0123456789abcd', 'another-shared-egg01']) {
    const host = egg(37, 2, seed), guest = egg(37, 2, seed), spots = [];
    // the host aims at the spot it sees; a few misses on the way, as people do
    let i = 0;
    while (host.damage < host.hp) {
      hostHit(host, i++ % 5 === 4 ? [0.3, 0.35, 1] : onSpot(host, 1));
      // the guest gets the host's state now and then, and replays the hits it hasn't drawn
      if (i % 3 === 0 || host.damage >= host.hp) {
        guestTake(guest, { hits: host.hits.map(h => h.slice()), taps: host.taps, crits: host.crits, gems: host.gems, damage: host.damage });
        assert.deepEqual(plain(guest.spot), plain(host.spot), `${seed}, after ${host.taps} taps`);
        spots.push(host.spot.join());
      }
    }
    assert.deepEqual([guest.bands, guest.search, guest.found], [host.bands, host.search, host.found]);
    assert.equal(aimShare(guest), aimShare(host));
    assert.equal(new Set(spots).size, 3, 'and the spot did move twice');
  }
  // another egg's seed puts it somewhere else
  const a = egg(30, 2, 'seed-aaaaaaaaaaaaaa'), b = egg(30, 2, 'seed-bbbbbbbbbbbbbb');
  while (a.bands === 2) hostHit(a, onSpot(a));
  while (b.bands === 2) hostHit(b, onSpot(b));
  assert.notDeepEqual(plain(a.spot), plain(b.spot));
  // the line that moves it says where the numbers come from
  assert.match(crack, /e\.spot = bandSpot\(seeded\(e\.seed \+ ":" \+ \(e\.hits \? e\.hits\.length - 1 : 0\) \+ ":band" \+ e\.bands\), e\.spot\);/);
});

/** Crack a banded egg open: true aim on the spot, then after each band `look` knocks off it to find the new one. */
function hunt(hp, look, bands = 2) {
  const e = egg(hp, bands);
  let lost = 0;
  while (e.damage < e.hp) {
    const res = hostHit(e, lost > 0 ? [0.28 + lost * 0.01, 0.32, 1] : onSpot(e));
    if (lost > 0) lost--;
    if (res.band) lost = look;
  }
  return e;
}

test('after a band breaks, the misses until the spot is found again are search: forgiven, so stars stay about aim', () => {
  const e = egg(1000, 2);
  hostHit(e, onSpot(e)); assert.equal(e.found, true);
  hostHit(e, [0.3, 0.3, 1]); assert.equal(e.search, 0, 'a slip after finding it is not search');
  while (e.bands === 2) hostHit(e, onSpot(e, 50));
  assert.equal(e.found, false, 'the band broke: the spot is lost');
  const s = e.search;
  hostHit(e, [0.3, 0.3, 1]); hostHit(e, [0.32, 0.31, 1]);
  assert.equal(e.search, s + 2, 'looking for the new spot counts as search again');
  hostHit(e, onSpot(e)); hostHit(e, [0.3, 0.3, 1]);
  assert.equal(e.search, s + 2, 'and stops once it is found');
  // a true aim with a fair search after each band still earns three stars, however long the search
  for (const look of [0, 2, 4, 8, 15]) {
    const done = hunt(37, look);
    assert.equal(aimStars(done), 3, `${look} knocks to find each new spot: ${aimShare(done)}%`);
  }
  // without the search counted afresh, the same play would have cost stars for luck alone
  const done = hunt(37, 8), unfair = Math.floor(done.crits * 100 / Math.max(1, done.taps - Math.min(done.taps - done.crits, 3)));
  assert.ok(unfair < 70 && aimShare(done) === 100, `${unfair}% the old way, ${aimShare(done)}% now`);
  // and sloppy aim after finding it still shows
  const sloppy = egg(37, 2);
  for (let i = 0; sloppy.damage < sloppy.hp; i++) hostHit(sloppy, i % 2 ? [0.3, 0.3, 1] : onSpot(sloppy));
  assert.ok(aimStars(sloppy) < 3);
});

test('plain stone is as it was: no band, the spot never moves, and every crack and number the same', () => {
  const runs = [false, true].map(old => {
    const e = egg(37, 0);
    if (old) { delete e.bands; delete e.banded; }
    for (let i = 0; e.damage < e.hp; i++) hostHit(e, i % 3 ? onSpot(e) : [0.3 + i * 0.01, 0.4, 1]);
    return e;
  });
  for (const e of runs) assert.deepEqual(plain(e.spot), plain(START));
  assert.deepEqual(plain(runs[0].net.segs), plain(runs[1].net.segs));
  assert.deepEqual([runs[0].taps, runs[0].crits, runs[0].search, runs[0].gems], [runs[1].taps, runs[1].crits, runs[1].search, runs[1].gems]);
  // and the bands touch nothing but the spot: up to the blow that breaks one, the same blows crack a banded egg the same way
  const b = egg(37, 2), p = egg(37, 0);
  for (let i = 0; b.bands === 2; i++) { const h = [0.3 + (i % 7) * 0.06, 0.35 + (i % 5) * 0.08, 1]; hostHit(b, h.slice()); hostHit(p, h.slice()); }
  assert.deepEqual(plain(b.net.segs), plain(p.net.segs));
  assert.deepEqual([b.damage, b.taps, b.crits, b.gems], [p.damage, p.taps, p.crits, p.gems]);
});

test('Mossa tells of the bands in the third cave\'s talk, in a line of her own, within the talk\'s length', () => {
  const ch2 = cut(crack, '  ch2: () => [', ']],\n', 'ch2 should be in TALKS');
  assert.match(ch2, /\[MOSSA, "The stone there grows in bands\. When one breaks, the weak spot moves\./);
  assert.ok(ch2.split('[MOSSA').length - 1 <= 5);
  const i18n = read('i18n.js');
  for (const k of ['The stone there grows in bands. When one breaks, the weak spot moves. Just find it again.', 'banded stone: when a band breaks, the weak spot moves', 'a band broke · the spot moved'])
    assert.ok(i18n.includes(JSON.stringify(k) + ':'), k);
});
