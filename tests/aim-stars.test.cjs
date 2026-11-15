const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const coopWire = require('../coop-state.js');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// crack.js and coop.js need the whole game around them, so only the blow and its count are run here: the helpers of
// core.js, the egg's outline, crackHit as it stands, what a blow pays and what aim earns, the lines of hitEgg that count
// a tap, the guest's replay of shared hits, and the lines of showFound that give the stars and write them down
const crack = read('crack.js'), coop = read('coop.js'), main = read('main.js'), ui = read('ui.js');
const hit = cut(crack, '\nfunction hitEgg(', '\n}\n', 'hitEgg should sit in crack.js');
const found = cut(crack, 'function showFound() {', '\n}\n', 'showFound should sit in crack.js');
const apply = cut(coop, 'function coopApplySnapshot(', '\n}\n', 'coopApplySnapshot should sit in coop.js');
const src = [
  read('core.js'),
  cut(read('save.js'), 'function eggPoly(', '\n}\n', 'eggPoly should sit in save.js') + '\n}',
  line(crack, /^const EGG_R = .*$/m, 'the egg\'s height should be one line in crack.js'),
  line(crack, /^const EGG_UNIT = .*$/m, 'the egg\'s outline should be one line in crack.js'),
  cut(crack, '/** The rest of a crack network:', '/** Draw what\'s new on the shell:', 'crackHit should follow nearSeg in crack.js'),
  cut(crack, '// ---------- what a blow pays ----------', '/** A tap on the egg:', 'what a blow pays and what aim earns should sit just before hitEgg'),
  // one tap of the host's (or a solo player's), as hitEgg counts it
  'function hostHit(e, hit) {',
  '  const power = hit[2];',
  line(hit, /^  e\.hits\.push\(hit\);$/m, 'hitEgg should keep every hit'),
  line(hit, /^  const res = crackHit\(.*$/m, 'hitEgg should crack the egg in one line'),
  line(hit, /^  e\.taps\+\+;$/m, 'hitEgg should count the tap'),
  line(hit, /^  if \(res\.crit\) e\.crits\+\+;$/m, 'hitEgg should count a hit on the weak spot by crackHit\'s own word'),
  line(hit, /^  const gems = blowPay\(.*$/m, 'hitEgg should pay for the blow in one line'),
  line(hit, /^  e\.gems \+= gems;$/m, 'hitEgg should keep the shards'),
  '  return res;',
  '}',
  // the guest's side: the shared hits replayed, then the host's count taken as it came
  'const forgeLvl = () => 0, paintNet = () => {}, hitFeedback = () => {}, fromEgg = (u, v) => [u, v];',
  cut(coop, '/** Replay shared hits', 'function installCoopRound(', 'coopReplayHits should sit just before installCoopRound'),
  'function guestTake(e, state) {',
  line(apply, /^  if \(coopIsGuest\(\) \|\| initial\) coopReplayHits\(.*$/m, 'a guest should replay the host\'s hits').replace('coopIsGuest() || initial', 'true').replace('!initial', 'false'),
  line(apply, /^  e\.taps = state\.taps; e\.crits = state\.crits; .*$/m, 'a guest should take the host\'s count of taps and of hits on the weak spot'),
  '}',
  // the egg is open: its stars, as showFound gives them and writes them down
  'function openEgg(e, save) {',
  '  const conf = e.conf;',
  line(found, /^  const stars = aimStars\(e\);$/m, 'showFound should take its stars from the aim, in one line'),
  line(found, /^  if \(!conf\.wander\) save\.stars\[conf\.n\] = .*$/m, 'showFound should write a level\'s stars in one line, never a wandering egg\'s'),
  '  return stars;',
  '}',
  'Object.assign(this, { EGG_R, crackHit, AIM_FREE, AIM_STARS, aimShare, aimStars, hostHit, guestTake, openEgg });',
].join('\n');
const page = {};
vm.runInNewContext(src, page);
const { EGG_R, AIM_FREE, AIM_STARS, aimShare, aimStars, hostHit, guestTake, openEgg } = page;

/** An egg that took so many hits on the weak spot and so many misses. */
const tapped = (crits, misses) => ({ taps: crits + misses, crits });
const plain = x => JSON.parse(JSON.stringify(x));

test('the marks are the ones the game promises: two stars from 40%, three from 70%, and three misses forgiven', () => {
  assert.deepEqual(plain(AIM_STARS), [40, 70]);
  assert.equal(AIM_FREE, 3);
});

test('aim is the share of taps that landed on the weak spot', () => {
  assert.equal(aimShare(tapped(5, 8)), 50, '5 of the 10 taps that count');
  assert.equal(aimShare(tapped(10, 0)), 100);
  assert.equal(aimShare(tapped(1, 12)), 10);
  // never more than a whole, whatever the count
  for (let c = 0; c <= 30; c++) for (let m = 0; m <= 30; m++) {
    const a = aimShare(tapped(c, m));
    assert.ok(Number.isInteger(a) && a >= 0 && a <= 100, `${c} hits and ${m} misses read ${a}%`);
  }
});

test('the first three misses of an egg are forgiven, and no more than three', () => {
  for (const misses of [0, 1, 2, 3]) {
    assert.equal(aimShare(tapped(6, misses)), 100, `${misses} misses are all forgiven`);
    assert.equal(aimStars(tapped(6, misses)), 3);
  }
  assert.equal(aimShare(tapped(6, 4)), 85, 'the fourth miss counts: 6 of 7');
  assert.equal(aimShare(tapped(6, 9)), 50, '6 of the 12 taps that count');
  // it is the number of misses that is forgiven, not their place in the run: a slip at the end weighs as one at the start
  const count = run => ({ taps: run.length, crits: [...run].filter(c => c === 'h').length });
  assert.equal(aimShare(count('mmmmhhhh')), aimShare(count('hhhhmmmm')));
  assert.equal(aimShare(count('mhmhmhmh')), aimShare(count('mmmmhhhh')));
});

test('an egg nobody has tapped, and one opened without a single hit on the weak spot, read 0% and one star', () => {
  assert.equal(aimShare(tapped(0, 0)), 0);
  assert.equal(aimStars(tapped(0, 0)), 1);
  assert.equal(aimShare(tapped(0, 2)), 0, 'forgiven misses are not hits');
  assert.equal(aimStars(tapped(0, 2)), 1);
  assert.equal(aimStars(tapped(0, 40)), 1, 'the first star is for opening the egg at all');
});

test('exactly 40% is two stars and exactly 70% is three; a hair under is not', () => {
  // 3 forgiven misses, then: 4 of 10, 7 of 10
  assert.equal(aimShare(tapped(4, 9)), 40);
  assert.equal(aimStars(tapped(4, 9)), 2);
  assert.equal(aimShare(tapped(7, 6)), 70);
  assert.equal(aimStars(tapped(7, 6)), 3);
  // 39 of 100 and 69 of 100
  assert.equal(aimStars(tapped(39, 64)), 1);
  assert.equal(aimStars(tapped(40, 63)), 2);
  assert.equal(aimStars(tapped(69, 34)), 2);
  assert.equal(aimStars(tapped(70, 33)), 3);
  // the number shown is rounded down, so it never reads 70% under two stars: 23 of 33 is 69.7%
  assert.equal(aimShare(tapped(23, 13)), 69);
  assert.equal(aimStars(tapped(23, 13)), 2);
  assert.equal(aimShare(tapped(13, 23)), 39, '13 of 33 is 39.4%');
  assert.equal(aimStars(tapped(13, 23)), 1);
});

test('stars follow the aim and nothing else: every count of hits and misses agrees with its own percent', () => {
  for (let c = 0; c <= 40; c++) for (let m = 0; m <= 40; m++) {
    const e = tapped(c, m), a = aimShare(e);
    assert.equal(aimStars(e), a >= 70 ? 3 : a >= 40 ? 2 : 1, `${c} hits and ${m} misses`);
    // one more hit never costs a star, one more miss never earns one
    assert.ok(aimStars(tapped(c + 1, m)) >= aimStars(e));
    assert.ok(aimStars(tapped(c, m + 1)) <= aimStars(e));
  }
});

const SPOT = [0.5, 0.6];   // the weak spot the way a co-op round carries it (height / EGG_R)
const ON = [0.5, 0.6], NEAR = [0.56, 0.6], OFF = [0.3, 0.3];
/** A whole egg on the table: nothing in it but what crackHit and the count need. */
const egg = (hp, extra = {}) => ({ conf: { n: 5, coop: false }, hp, damage: 0, taps: 0, crits: 0, gems: 0, combo: 0, chain: 0, owed: 0,
  hits: [], seed: 'seed-abcdef123456', net: { segs: [], tips: [] }, spot: [SPOT[0], SPOT[1] * EGG_R], ...extra });
/** Crack it open with blows of one weight, each aimed where at(i) says; the blows are counted as hitEgg counts them. */
function crackOpen(hp, at, power = 1) {
  const e = egg(hp);
  while (e.damage < e.hp) hostHit(e, [...at(e.taps), power]);
  return e;
}

test('a hit on the weak spot is the one crackHit calls a crit: the count takes its word', () => {
  const e = egg(1000);
  assert.equal(hostHit(e, [...ON, 1]).crit, true);
  assert.equal(hostHit(e, [...NEAR, 1]).crit, true, 'near enough is on it');
  assert.equal(hostHit(e, [...OFF, 1]).crit, false);
  assert.deepEqual([e.taps, e.crits], [3, 2]);
});

test('a heavier hammer earns no more stars for the same aim, where the old count by taps gave it all three', () => {
  // three misses, then one hit: a quarter of the taps on the spot, whatever the hammer
  const sloppy = i => (i % 4 === 3 ? ON : OFF);
  const light = crackOpen(120, sloppy, 1), heavy = crackOpen(120, sloppy, 3.2);
  assert.ok(heavy.taps < light.taps / 2, 'the heavy hammer does open the egg in far fewer taps');
  assert.ok(heavy.taps <= Math.ceil(120 / 2.6), 'few enough for three stars by the old count');
  assert.equal(aimStars(light), 1);
  assert.equal(aimStars(heavy), 1);
  // and true aim earns all three with the plain hammer
  assert.equal(aimStars(crackOpen(120, () => ON, 1)), 3);
  assert.equal(aimStars(crackOpen(40, i => (i < 3 ? OFF : NEAR), 1)), 3, 'three knocks to find the spot cost nothing');
});

test('a level keeps the most stars it has ever had, and a wandering or shared egg writes none', () => {
  const save = { stars: {} }, at = n => ({ conf: { n }, ...tapped(0, 0) });
  assert.equal(openEgg({ ...at(5), ...tapped(8, 2) }, save), 3);
  assert.equal(save.stars[5], 3);
  assert.equal(openEgg({ ...at(5), ...tapped(2, 20) }, save), 1, 'the card shows the run as it was');
  assert.equal(save.stars[5], 3, 'but the level loses nothing');
  assert.equal(openEgg({ ...at(5), ...tapped(5, 8) }, save), 2);
  assert.equal(save.stars[5], 3);
  // stars from before the rule changed stay as they are, and can still grow
  const old = { stars: { 7: 3, 8: 1 } };
  openEgg({ ...at(7), ...tapped(1, 30) }, old);
  openEgg({ ...at(8), ...tapped(5, 8) }, old);
  assert.deepEqual(plain(old.stars), { 7: 3, 8: 2 });
  openEgg({ conf: { n: 0, wander: true, coop: true }, ...tapped(9, 0) }, old);
  assert.deepEqual(plain(old.stars), { 7: 3, 8: 2 });
});

test('co-op: host and guest read the same aim and the same stars off a shared egg, at every snapshot', () => {
  const round = { id: 'test-round-123456', step: 8, crystal: 'amethyst', species: 'wisp', shiny: false, stone: 0, hp: 30, spot: SPOT, seed: 'seed-abcdef123456' };
  assert.ok(coopWire.validRound(round));
  const shared = () => egg(round.hp, { conf: { n: 0, wander: true, coop: true }, seed: round.seed });
  const host = shared(), guest = shared();
  // both players knock about, then settle on the spot: whose finger it was makes no difference to the count
  const run = [OFF, [0.7, 0.5], OFF, [0.4, 0.75], NEAR, ON, OFF, ON, NEAR, ON, ON, NEAR, ON, ON, ON, ON, ON, ON];
  let seq = 0, seen = new Set();
  for (const p of run) {
    if (host.damage >= host.hp) break;
    hostHit(host, [...p, 1]);
    const state = { round: round.id, seq: ++seq, phase: host.damage >= host.hp ? 'opening' : 'cracking', t: 1, taps: host.taps, crits: host.crits,
      gems: host.gems, damage: host.damage, hits: host.hits.map(h => h.slice()), matte: null };
    assert.ok(coopWire.validState(state, round), `the snapshot after tap ${host.taps} should pass the wire's check`);
    guestTake(guest, plain(state));
    assert.equal(aimShare(guest), aimShare(host), `aim after tap ${host.taps}`);
    assert.equal(aimStars(guest), aimStars(host), `stars after tap ${host.taps}`);
    seen.add(aimStars(host));
  }
  assert.ok(host.damage >= host.hp, 'the run should open the egg');
  assert.deepEqual([...seen].sort(), [1, 2, 3], 'the run should pass through every count of stars');
  assert.equal(guest.net.segs.length, host.net.segs.length, 'and the replay grew the very same cracks');
  // a guest who joins late and gets it all at once ends in the same place
  const late = shared();
  guestTake(late, { taps: host.taps, crits: host.crits, gems: host.gems, damage: host.damage, hits: host.hits.map(h => h.slice()) });
  assert.equal(aimStars(late), aimStars(host));
  // the shared hammer is the plain one, and the snapshot already carried both numbers the aim is read from
  assert.match(crack, /if \(game\.egg && game\.egg\.conf\.coop\) return \{ power: 1, echo: false \};/);
  assert.match(coop, /taps: e\.taps, crits: e\.crits,/);
});

test('nothing counts stars by taps any more', () => {
  for (const f of ['crack.js', 'coop.js', 'main.js', 'ui.js', 'scenes.js', 'pixel.js', 'save.js'])
    assert.ok(!/\.par\b/.test(read(f)), `${f} still reads an egg's par`);
});

test('the aim meter is in the top bar from the first visit to a level, with a notch where each star begins', () => {
  const clock = cut(main, 'function updateClock() {', '\n}\n', 'updateClock should sit in main.js');
  assert.ok(!/save\.stars/.test(clock), 'the meter should not wait for the level to have stars');
  assert.match(clock, /id="aim" class="s\$\{aimStars\(e\)\}"/);
  assert.match(clock, /width:\$\{aimShare\(e\)\}%/);
  assert.match(clock, /AIM_STARS\.map\(p => `<u style="left:\$\{p\}%"><\/u>`\)/);
  // it is redrawn when the count changes, not every frame
  assert.match(clock, /key = shown \+ "\/" \+ e\.taps \+ "\/" \+ e\.crits/);
});

test('the card, the wallet, Mossa and the FAQ say what stars are for now, in both languages', () => {
  const uk = {
    location: { pathname: '/' }, addEventListener: () => {}, navigator: { languages: [] }, NodeFilter: { SHOW_TEXT: 4 },
    localStorage: { getItem: k => k === 'hatchstone.lang' ? 'uk' : null, setItem: () => {} },
    document: { documentElement: {}, body: {}, title: '', createTreeWalker: () => ({ nextNode: () => null }), querySelectorAll: () => [] },
  };
  vm.runInNewContext(read('i18n.js') + '\nObject.assign(this, { tr, UK });', uk);
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const said = [
    line(found, /aim · \{0\}★\\u00a0from\\u00a0\{1\}%/, 'the card should name the aim and the mark of the next star').replace(/\\u00a0/g, '\u00a0'),
    line(html, /<span id="stAimFor">(aim)<\/span>/, 'the card should have a place for the aim').replace(/<[^>]*>/g, ''),
    line(html, /aria-label="Shards caught and aim"/, 'the counter should be named for what it shows').replace(/^aria-label=/, ''),
    line(crack, /Find the weak spot and keep your taps on it\. The truer your aim, the more stars\./, 'Mossa should say what stars are for'),
    line(ui, /Up to three for each level of the Grotto: the more of your taps land on the weak spot, the more stars\./, 'the wallet should say what stars are for'),
    line(ui, /Find the weak spot and keep your taps on it: aim for the glow[^"]*/, 'the FAQ should say how to get three stars'),
  ].map(s => s.replace(/^"|"$/g, ''));
  for (const key of said) assert.match(uk.UK[key] || '', /[а-яіїє]/, `no Ukrainian for: ${key}`);
  const faq = said[said.length - 1], faqUk = uk.UK[faq];
  // the numbers in the answer are the rule's own
  assert.match(faq, new RegExp(`three when ${AIM_STARS[1]}% of your taps land on the weak spot, two from ${AIM_STARS[0]}%`));
  assert.match(faq, /first three misses on each geode don't count/);
  assert.match(faq, /can only add to them/);
  assert.match(faqUk, new RegExp(`${AIM_STARS[1]}% ударів.*слабке місце.*від ${AIM_STARS[0]}%.*три промахи.*жеод`));
  assert.ok(!/Fewer taps, more stars|you'll need fewer taps|crack the egg in fewer taps|taps · ★ in/.test(ui + crack + main + html + read('i18n.js')), 'nothing should still promise stars for fewer taps');
});
