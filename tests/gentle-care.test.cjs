const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Less to keep up with in a full nest (#319): everyone but the one you're looking after needs you more slowly (IDLE_PACE in
// applyTime, save.js), a grown glowling looks after the little ones in its room (careFor and giveCare in nest.js: a few times
// an hour, never from your pantry, and slows their needs a little while you're away), and the residents button's badge goes
// to the one who needs you most (neediest).
const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); assert.ok(i >= 0 && j > i, a); return src.slice(i, j); };
const save = read('save.js'), nest = read('nest.js'), data = read('data.js'), iso = read('iso.js'), ui = read('ui.js'), i18n = read('i18n.js');
const MIN = 60e3, H = 3600e3;

function world(creatures, active) {
  const page = {
    Math, AWAY_MIN: 360, KEPT: 75, HELP_STAGE: 2, clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    save: { creatures, active, rooms: [{ kind: 'nest' }, { kind: 'nest' }], dust: [], pantry: { berry: 2 }, shards: 50 },
    roomOf: c => c.room || 0, nestRoom: () => 0, addXP() {},
    remember: (cr, k, ...a) => { (cr.mem = cr.mem || []).push({ k, a }); },
  };
  page.residents = r => page.save.creatures.filter(c => !c.out && (c.room || 0) === r);
  vm.createContext(page);
  vm.runInContext([data.match(/^const stageOf = .*$/m)[0], cut(save, 'const ROOM_TRAITS', '\n// ---------- dust bunnies'),
    cut(nest, '// ---------- big ones look after the little ones', '/** Everyone as they are this moment'),
    'Object.assign(this, { applyTime, IDLE_PACE, CARE_SLOW, CARE_MAX, CARE_LOW, CARE_TUMMY, CARE_JOY, careLeft, careFor, giveCare, unwell, neediest, tended });'].join('\n'), page);
  return page;
}
const glow = (id, level, o = {}) => ({ id, level, name: 'G' + id, tummy: 80, joy: 80, energy: 80, last: 1, ...o });

test('the one you look after needs you as ever; everyone else at IDLE_PACE (sleep refills the same)', () => {
  const a = glow(1, 3), b = glow(2, 3), w = world([a, b], 1);
  assert.equal(w.IDLE_PACE, 0.6);
  w.applyTime(a, 1 + 60 * MIN); w.applyTime(b, 1 + 60 * MIN);
  assert.deepEqual([a.tummy, a.joy, a.energy], [50, 56, 65]);
  assert.deepEqual([b.tummy, b.joy, b.energy], [62, 65.6, 71]);
  // nobody picked yet: the first one is the one you're with
  const c = glow(3, 3), d = glow(4, 3), v = world([c, d], null);
  v.applyTime(c, 1 + 60 * MIN); v.applyTime(d, 1 + 60 * MIN);
  assert.equal(c.tummy, 50); assert.equal(d.tummy, 62);
  // asleep: energy comes back at the same rate for both
  const s1 = glow(1, 3, { sleeping: true, energy: 10 }), s2 = glow(2, 3, { sleeping: true, energy: 10 }), u = world([s1, s2], 1);
  u.applyTime(s1, 1 + 5 * MIN); u.applyTime(s2, 1 + 5 * MIN);
  assert.equal(s1.energy, s2.energy);
  assert.ok(s2.tummy > s1.tummy);
});

test('a grown one in the room slows the little ones\' hunger and boredom a little, even while you are away', () => {
  const big = glow(1, 12, { sleeping: true }), small = glow(2, 2), alone = glow(3, 2, { room: 1 }), w = world([big, small, alone], 9);
  assert.equal(w.tended(small), true); assert.equal(w.tended(alone), false); assert.equal(w.tended(big), false, 'only the little ones');
  w.applyTime(small, 1 + 3 * H); w.applyTime(alone, 1 + 3 * H);
  assert.ok(small.tummy > alone.tummy && small.joy > alone.joy, `${small.tummy}/${small.joy} vs ${alone.tummy}/${alone.joy}`);
  assert.ok(Math.abs((80 - small.tummy) - (80 - alone.tummy) * w.CARE_SLOW) < 1e-9);
  assert.equal(small.energy, alone.energy, 'energy as ever');
  // one out exploring keeps nobody company
  const out = glow(4, 12, { out: true }), s = glow(5, 2), v = world([out, s], 9);
  assert.equal(v.tended(s), false);
});

test('a grown one looks after a young one in need, in its own room, the neediest first, at most CARE_MAX an hour', () => {
  const big = glow(1, 10), kid = glow(2, 4, { tummy: 30, joy: 60 }), sad = glow(3, 7, { tummy: 70, joy: 20 }), fine = glow(4, 3),
    other = glow(5, 1, { room: 1, tummy: 5 }), grown = glow(6, 11, { tummy: 5 }), asleep = glow(7, 2, { tummy: 1, sleeping: true });
  const w = world([big, kid, sad, fine, other, grown, asleep], 1), now = 10 * H;
  assert.equal(w.careFor(big, now), sad, 'the neediest little one awake in its room');
  assert.equal(w.careFor(kid, now), null, 'a little one looks after nobody');
  assert.equal(w.giveCare(big, sad, now), 'play'); assert.equal(sad.joy, 20 + w.CARE_JOY);
  assert.equal(w.giveCare(big, kid, now + MIN), 'feed'); assert.equal(kid.tummy, 30 + w.CARE_TUMMY);
  assert.deepEqual(w.save.pantry, { berry: 2 }, 'a berry it found: nothing out of the pantry'); assert.equal(w.save.shards, 50);
  assert.equal(w.giveCare(big, grown, now), '', 'never a grown one'); assert.equal(w.giveCare(big, other, now), '', 'never another room');
  assert.equal(w.giveCare(big, asleep, now), '', 'never one asleep');
  assert.equal(w.giveCare(big, kid, now + 2 * MIN), 'feed');
  assert.equal(w.careLeft(big, now + 3 * MIN), 0);
  assert.equal(w.giveCare(big, kid, now + 3 * MIN), '', 'three an hour, then it rests'); assert.equal(w.careFor(big, now + 3 * MIN), null);
  // an hour after the first, one more
  assert.equal(w.careLeft(big, now + H + 30e3), 1); assert.equal(w.giveCare(big, kid, now + H + 30e3), 'feed');
  // the first time, a line in both diaries; not every time
  assert.equal(sad.mem.length, 1); assert.match(big.mem[0].k, /^Looked after a little one/);
  assert.equal(kid.mem, undefined);
  // asleep or out, it looks after nobody; and only those who need it
  assert.equal(w.careFor(Object.assign(glow(8, 15), { sleeping: true }), now), null);
  const calm = world([glow(1, 12), glow(2, 2, { tummy: 50, joy: 50 })], 1);
  assert.equal(calm.careFor(calm.save.creatures[0], now), null);
});

test('neediest: only the really unwell, awake at home, the lowest need first, leaving out the one you are with', () => {
  const w = world([], 1), list = [glow(1, 3, { tummy: 5 }), glow(2, 3, { joy: 10 }), glow(3, 3, { energy: 3, sleeping: true }), glow(4, 3, { tummy: 1, out: true }), glow(5, 3, { tummy: 25 })];
  assert.deepEqual(list.map(c => w.unwell(c)), [true, true, false, false, false]);
  assert.equal(w.neediest(list).id, 1);
  assert.equal(w.neediest(list, 1).id, 2);
  assert.equal(w.neediest(list.slice(2)), null);
});

test('wired in: grown ones walk over (careNext), the badge goes to the neediest, words in both languages, the FAQ says so', () => {
  assert.match(iso, /if \(cr && careNext\(a, cr, list\)\) return;/);
  assert.match(iso, /a\.state === "walk" && a\.care\) careArrive\(a, cr\)/);
  assert.match(ui, /\$\("residentsBtn"\)\.addEventListener\("click", residentsTap\)/);
  assert.match(nest, /<i class="unwell"/);
  for (const s of ['Had a berry that {0} found ♥', 'Played with a big one: {0} ♥', 'Looked after a little one: {0}', '{0} found {1} a berry', '{0} plays with {1}', '{0} needs you: tap to go to it'])
    assert.ok(i18n.includes(JSON.stringify(s) + ':'), s);
  assert.match(ui, /everyone else's needs drift down more slowly/);
});
