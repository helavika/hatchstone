const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };

// The glowling that comes along to the stone: who comes, when it helps, what each rarity does, and that aim never moves.
// Runs crack.js's own blow (crackHit, blowPay, aim), hitEgg's counting lines and the buddy's section, with the screen stubbed.
const crack = read('crack.js'), main = read('main.js'), ui = read('ui.js'), i18n = read('i18n.js');
const hit = cut(crack, '\nfunction hitEgg(', '\n}\n', 'hitEgg should sit in crack.js');
const buddy = cut(crack, '// ---------- a glowling comes along ----------', '// ---------- Quarry Eye', 'the buddy should have a section of its own after hitEgg');
const src = [
  read('core.js'),
  cut(read('save.js'), 'function eggPoly(', '\n}\n', 'eggPoly should sit in save.js') + '\n}',
  cut(read('save.js'), 'function moodOf(', '\n}\n', 'moodOf should sit in save.js') + '\n}',
  'const SLEEPY_AT = ' + read('nest.js').match(/^const SLEEPY_AT = (\d+);$/m)[1] + ';',
  crack.match(/^const EGG_R = .*$/m)[0],
  crack.match(/^const EGG_UNIT = .*$/m)[0],
  cut(crack, '/** The rest of a crack network:', '/** Draw what\'s new on the shell:', 'crackHit should follow nearSeg'),
  cut(crack, '// ---------- what a blow pays ----------', '/** A tap on the egg:', 'what a blow pays should sit just before hitEgg'),
  // the stubbed screen and save
  'sfx.chirp = () => {}; const forgeLvl = () => 0, game = { time: 0 }, said = [], floatText = t => said.push(t), buddySeat = () => ({ x: 0, y: 0, s: 10 });',
  'const tr = (s, ...a) => s.replace(/\\{(\\d)\\}/g, (_, i) => a[i]);',
  'let creatures = [], active = 1; const activeCreature = () => creatures.find(c => c.id === active) || null, applyTime = () => {}, specOf = cr => cr.spec;',
  'const rarityOf = sp => sp.rarity;',
  buddy,
  // hitEgg, as it counts and pays a tap, without the screen
  'function tap(e, u, v, power = 1) {',
  '  const hit = [u, v / EGG_R, power];',
  ...hit.split('\n').filter(l => /^  (e\.hits\.push|const res = crackHit|e\.taps\+\+|if \(res\.crit\) e\.crits|const gems = blowPay|e\.gems \+= |const twice|buddyHop)/.test(l)),
  '  return res;',
  '}',
  'Object.assign(this, { game, said, buddyFor, buddyReady, buddyNote, aimShare, aimStars, tap, setCreatures: (c, a = 1) => { creatures = c; active = a; } });',
].join('\n');
const page = {};
vm.runInNewContext(src, page);
const { buddyFor, buddyReady, buddyNote, aimShare, aimStars, tap, setCreatures } = page;

const glowling = (rarity, needs = {}) => ({ id: 1, name: 'Bun', level: 3, spec: { id: 'x', rarity, voice: 1 }, tummy: 90, joy: 90, energy: 90, sleeping: false, ...needs });
/** A fresh stone of so much rock, its weak spot at (u, v) in egg units, with this glowling by it. */
function stone(cr, { hp = 200, spot = [0.7, 0.6], coop = false } = {}) {
  setCreatures(cr ? [cr] : []);
  const conf = { coop };
  const e = { conf, hp, damage: 0, taps: 0, crits: 0, search: 0, gems: 0, combo: 0, chain: 0, owed: 0, hits: [], seed: 's', spot,
    net: { segs: [], tips: [] }, bands: 0, banded: 0, patches: [] };
  e.buddy = buddyFor(conf);
  return e;
}
const onSpot = e => tap(e, e.spot[0], e.spot[1]);
const miss = (e, u = 0.25) => tap(e, u, 0.35);

test('the active glowling comes along; one asleep, out exploring, or none at all stays home', () => {
  assert.ok(stone(glowling('common')).buddy, 'awake and home: it comes');
  assert.equal(stone(glowling('common', { sleeping: true })).buddy, null);
  assert.equal(stone(glowling('common', { out: true })).buddy, null);
  assert.equal(stone(null).buddy, null);
});

test('help is gated by its needs: rested and happy helps, tired or glum only watches', () => {
  assert.equal(buddyReady(glowling('common')), true);
  assert.equal(buddyReady(glowling('common', { energy: 40 })), false, 'tired: below bedtime');
  assert.equal(buddyReady(glowling('common', { joy: 50 })), false, 'not happy');
  assert.equal(buddyReady(glowling('common', { tummy: 40 })), false, 'hungry is not happy');
  // a tired rare one sees a chain broken like anyone's, and the stone pays as it always did
  const e = stone(glowling('rare', { energy: 30 })), plain = stone(null, { spot: [0.7, 0.6] });
  assert.ok(e.buddy && !e.buddy.ready, 'it still sits by the stone, watching');
  for (const s of [e, plain]) { onSpot(s); onSpot(s); onSpot(s); miss(s); }
  assert.equal(e.combo, 0, 'the chain breaks');
  assert.deepEqual([e.gems, e.owed], [plain.gems, plain.owed], 'nothing lost, nothing added');
  assert.equal(buddyNote(e.buddy), '', 'and the card says nothing of a help');
});

test('a common one hops towards the side of the weak spot after two misses of the search, and only once', () => {
  for (const [u, side] of [[0.7, 1], [0.3, -1], [0.52, 0]]) {
    const e = stone(glowling('common'), { spot: [u, 0.6] });
    miss(e, 0.9 - (u > 0.5 ? 0.65 : 0)); // away from the spot
    assert.equal(e.buddy.done, false, 'one miss is not yet a search');
    miss(e, 0.9 - (u > 0.5 ? 0.65 : 0));
    assert.equal(e.buddy.done, true);
    assert.equal(e.buddy.side, side, `spot at ${u}`);
    assert.equal(e.helped, true, 'the stone remembers its help was spent');
  }
  // found at once: no hop needed
  const quick = stone(glowling('common'));
  onSpot(quick); miss(quick); miss(quick); miss(quick);
  assert.equal(quick.buddy.done, false, 'once the spot is found it doesn\'t hop');
});

test('the hop is no blow: taps, hits and aim are the same with or without it', () => {
  const run = cr => { const e = stone(cr, { spot: [0.7, 0.6] }); miss(e); miss(e); miss(e); for (let i = 0; i < 6; i++) onSpot(e); miss(e); return e; };
  const helped = run(glowling('common')), alone = run(null);
  assert.equal(helped.buddy.done, true);
  assert.deepEqual([helped.taps, helped.crits, helped.search, helped.damage, helped.gems], [alone.taps, alone.crits, alone.search, alone.damage, alone.gems]);
  assert.equal(aimShare(helped), aimShare(alone));
});

test('a rare one catches one miss: the chain holds, aim counts the miss all the same', () => {
  const run = cr => { const e = stone(cr, { hp: 400 }); for (let i = 0; i < 4; i++) onSpot(e); const c = e.combo; miss(e); const held = e.combo; onSpot(e); return { e, c, held }; };
  const r = run(glowling('rare')), plain = run(null);
  assert.equal(r.held, r.c, 'the chain stays at its links through the miss');
  assert.equal(r.e.combo, r.c + 1, 'and the next hit adds to it');
  assert.equal(plain.e.combo, 1, 'without it the miss ends the chain');
  assert.ok(r.e.gems > plain.e.gems, 'the held chain pays on');
  assert.deepEqual([r.e.taps, r.e.crits], [plain.e.taps, plain.e.crits], 'the miss is still a tap that missed');
  assert.equal(aimShare(r.e), aimShare(plain.e), 'aim exactly the same');
  // only once per stone
  for (let i = 0; i < 3; i++) onSpot(r.e);
  miss(r.e);
  assert.equal(r.e.combo, 0, 'the second miss breaks it as ever');
  assert.match(buddyNote(r.e.buddy), /caught a miss/);
});

test('a rare one doesn\'t spend its catch on a chain of one link, or on a miss before any chain', () => {
  const e = stone(glowling('rare'), { hp: 400 });
  miss(e); assert.equal(e.buddy.done, false);
  onSpot(e); miss(e); assert.equal(e.buddy.done, false, 'one link isn\'t worth catching');
});

test('a legendary one doubles the last blow, and only the last', () => {
  const e = stone(glowling('legendary'), { hp: 30 });
  let before = 0;
  while (e.damage < e.hp) { before = e.gems; onSpot(e); if (e.damage < e.hp) assert.equal(e.buddy.done, false); }
  assert.equal(e.buddy.done, true);
  assert.ok(e.buddy.extra >= 1);
  const last = e.gems - before;
  assert.ok(last === 2 * e.buddy.extra || (e.buddy.extra === 1 && last === 1), `the last blow paid twice (${last}, ${e.buddy.extra} of it the buddy's)`);
  assert.match(buddyNote(e.buddy), new RegExp(`doubled the last blow: \\+${e.buddy.extra}`));
  const plain = stone(null, { hp: 30 });
  while (plain.damage < plain.hp) onSpot(plain);
  assert.equal(aimShare(e), aimShare(plain));
  assert.equal(aimStars(e), aimStars(plain));
});

test('one help per stone, even after it waited: the spent help stays with the stone', () => {
  const scenes = read('scenes.js');
  assert.match(scenes.match(/^const STONE_KEEP = [\s\S]*?\];$/m)[0], /"helped"/, 'the waiting stone keeps "helped"');
  const e = stone(glowling('rare'), { hp: 400 });
  e.helped = true; // came back to a stone already helped
  for (let i = 0; i < 4; i++) onSpot(e);
  miss(e);
  assert.equal(e.combo, 0, 'no second catch');
});

test('co-op: nobody comes along, and the guest\'s replay pays with the plain blowPay', () => {
  assert.equal(stone(glowling('legendary'), { coop: true }).buddy, null);
  assert.match(read('coop.js'), /const gems = blowPay\(e, res\);/, 'the replay never passes a held miss');
});

test('the found card\'s buddy cheer is gone: one system, its line says what the buddy did', () => {
  const found = cut(crack, 'function showFound() {', '\n}\n', 'showFound should sit in crack.js');
  assert.ok(!/cheer/.test(found), 'no +15% cheer left in showFound');
  assert.ok(!/activeCreature/.test(found), 'showFound no longer looks for a buddy of its own');
  assert.match(found, /buddyNote\(e\.buddy\)/);
  assert.ok(!/cheered on by/.test(i18n), 'the old line is gone from the translations');
  for (const s of [' · {0} hopped towards the weak spot', ' · {0} caught a miss: the chain held', ' · {0} doubled the last blow: +{1} ✦', 'chain held ♥'])
    assert.ok(i18n.includes(JSON.stringify(s) + ':'), `Ukrainian for "${s}"`);
  assert.ok(!/cheers you on when you crack/.test(ui), 'the help page tells the new story');
});

test('with less motion the buddy doesn\'t hop: a soft glow instead', () => {
  const draw = cut(main, 'function drawBuddy(', '\n}\n', 'drawBuddy should sit in main.js');
  assert.match(draw, /if \(now && calm\) \{[\s\S]*createRadialGradient[\s\S]*\} else if \(now\) \{/);
  assert.ok(/drawBuddy\(game\.egg\)/.test(main), 'drawn in the crack scene');
});
