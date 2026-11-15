const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');

// only the part of crack.js that counts what a blow pays
const src = read('crack.js');
const from = src.indexOf('// ---------- what a blow pays ----------'), to = src.indexOf('/** A tap on the egg:');
const page = {};
vm.runInNewContext(src.slice(from, to) + '\nthis.blowPay = blowPay; this.STONE_PAY = STONE_PAY;', page);
const { blowPay, STONE_PAY } = page;

const SPOT = 0.11;   // inside this far from the weak spot a hit counts as on it (crackHit: weak > 0.45)
const egg = hp => ({ hp, damage: 0, taps: 0, gems: 0, combo: 0, chain: 0, owed: 0 });
/** One blow at a distance from the weak spot, with crackHit's own sums. */
function blow(e, dist, power = 1, sack = 0) {
  const weak = Math.min(1, Math.max(0, 1 - dist / 0.2)), res = { weak, crit: weak > 0.45, dmg: power * (1 + weak * 2.2) };
  e.damage += res.dmg; e.taps++;
  const gems = blowPay(e, res, sack);
  e.gems += gems;
  return gems;
}
/** Crack a whole stone, taking each blow's distance from aim(i). */
function crackOpen(hp, aim, power = 1, sack = 0) {
  const e = egg(hp);
  while (e.damage < e.hp) blow(e, aim(e.taps), power, sack);
  return e;
}
// hits spread evenly over the spot land this far from its middle on average: a fair blow, about 2.4 points of stone
const FAIR = 0.073, MISS = 0.5;
/** The same run of chances every time it is asked for. */
function dice(seed) { let x = seed; return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648; }

test('the chain grows only with hits on the weak spot, and a miss ends it', () => {
  const e = egg(1000);
  for (let i = 1; i <= 5; i++) { blow(e, FAIR); assert.equal(e.combo, i); }
  blow(e, SPOT + 0.01);
  assert.equal(e.combo, 0, 'just off the spot is a miss');
  assert.equal(e.chain, 0);
  assert.equal(e.lost, 5, 'the ring that breaks is the one the chain had');
  blow(e, MISS);
  assert.equal(e.combo, 0, 'misses never build anything');
  assert.equal(e.lost, 0);
  blow(e, SPOT - 0.01);
  assert.equal(e.combo, 1, 'and the next hit on the spot starts again from one');
});

test('the chain has no clock: the same hits pay the same however fast they come', () => {
  assert.ok(!/game\.time|lastTap|Date\.now|performance\.now/.test(src.slice(from, to)));
});

test('a full chain doubles what the stone pays and no more: 3 shards on top of a fair blow of the plain hammer', () => {
  const e = egg(100000), dmg = 1 + (1 - FAIR / 0.2) * 2.2;
  let paid = 0;
  for (let i = 0; i < 400; i++) paid += blow(e, FAIR);
  const last200 = () => { let n = 0; for (let i = 0; i < 200; i++) n += blow(e, FAIR); return n; };
  const perBlow = last200() / 200;
  assert.ok(Math.abs(perBlow - 2 * dmg * STONE_PAY) < 0.02, 'a long chain pays twice the plain rate, not more');
  assert.ok(Math.abs(perBlow - dmg * STONE_PAY - 3) < 0.25, 'which is about 3 on top for a fair blow');
  for (let i = 0; i < 50; i++) assert.ok(blow(e, FAIR) <= Math.ceil(2 * dmg * STONE_PAY), 'no single blow pays more than double');
});

test('the chain bonus builds up link by link rather than landing at once', () => {
  const e = egg(1000), pays = [];
  for (let i = 0; i < 6; i++) pays.push(blow(e, FAIR));
  assert.ok(pays[0] < pays[5]);
  assert.ok(pays[0] >= 3, 'the first hit on the spot still pays what it always did');
  const missed = blow(e, MISS);
  assert.ok(missed <= 2, 'a miss pays for the little stone it broke');
  assert.ok(blow(e, FAIR) < pays[5], 'and after it the bonus starts over');
});

test('without the chain the stone pays for its size, not for the number of taps', () => {
  // all misses, so no chain and no sack: only the stone itself is paid for
  for (const hp of [10, 22, 34, 48]) {
    const light = crackOpen(hp, () => MISS, 1), heavy = crackOpen(hp, () => MISS, 3.5), mixed = crackOpen(hp, i => i % 2 ? MISS : 0.15, 1.3);
    assert.ok(light.taps > heavy.taps * 2);
    for (const e of [light, heavy, mixed]) assert.equal(e.gems, Math.floor(hp * STONE_PAY + 1e-9), `hp ${hp}, ${e.taps} taps`);
  }
});

test('mashing earns less than aiming on the same stone', () => {
  const mash = crackOpen(48, () => MISS), aimed = crackOpen(48, i => i % 10 === 9 ? MISS : FAIR);
  assert.ok(mash.taps > aimed.taps);
  assert.ok(aimed.gems > mash.gems * 1.5, `${aimed.gems} aimed against ${mash.gems} mashed`);
});

const POWERS = [1, 1.15, 1.3, 1.45, 1.6, 1.75, 2.1875, 2.8, 3.5];

test('a stronger hammer is never the poorer one, with the same aim on every blow', () => {
  const aims = { mash: () => MISS, fair: () => FAIR, centre: () => 0, edge: () => SPOT - 0.005 };
  for (const [name, aim] of Object.entries(aims)) for (const sack of [0, 2, 4]) for (const hp of [10, 22, 34, 48]) {
    let before = 0;
    for (const power of POWERS) {
      const got = crackOpen(hp, aim, power, sack).gems;
      assert.ok(got >= before, `${name}, sack ${sack}, hp ${hp}: power ${power} earned ${got}, a weaker hammer ${before}`);
      before = got;
    }
  }
});

test('nor with a hand that sometimes misses: over many stones the stronger hammer earns at least as much', () => {
  // (on one stone it can come out a shard behind, when a miss happens to fall on a fuller chain)
  for (const hitRate of [0.5, 0.9]) for (const sack of [0, 4]) for (const hp of [22, 48]) {
    let before = 0;
    for (const power of POWERS) {
      const roll = dice(7);
      let got = 0;
      for (let i = 0; i < 3000; i++) got += crackOpen(hp, () => roll() < hitRate ? FAIR : MISS, power, sack).gems;
      got /= 3000;
      assert.ok(got >= before, `${hitRate * 100}% on the spot, sack ${sack}, hp ${hp}: power ${power} earned ${got.toFixed(1)} a stone, a weaker hammer ${before.toFixed(1)}`);
      before = got;
    }
  }
});

test("Looter's Sack adds a third per level to stone broken at the weak spot, and nothing to a miss", () => {
  const plain = crackOpen(4800, () => FAIR, 1, 0).gems, full = crackOpen(4800, () => FAIR, 1, 4).gems;
  const dmg = 1 + (1 - FAIR / 0.2) * 2.2;
  assert.ok(Math.abs((full - plain) / (4800 / dmg) - 4) < 0.1, 'four levels: about four shards more for a fair blow');
  assert.equal(crackOpen(48, () => MISS, 1, 4).gems, crackOpen(48, () => MISS, 1, 0).gems);
});

test('the last blow is paid for the stone that was left, not for how hard it fell', () => {
  const e = egg(10);
  blow(e, MISS, 9);
  const last = blow(e, 0, 50);
  assert.ok(e.damage > e.hp * 10);
  assert.ok(last <= Math.ceil(1 * STONE_PAY * 2), `one point of stone was left, it paid ${last}`);
});

test('two screens that count the same blows in the same order pay the same', () => {
  const host = egg(48), guest = egg(48), dists = [0.02, 0.3, 0.07, 0.1, 0.05, 0.12, 0, 0.09, 0.4, 0.01, 0.03, 0.06, 0.08, 0.02, 0.05, 0.01, 0.03, 0.02, 0.04, 0.06];
  for (const d of dists) { if (host.damage < host.hp) blow(host, d, 1); }
  for (const d of dists) { if (guest.damage < guest.hp) blow(guest, d, 1); }
  assert.deepEqual(guest, host);
});

/** core.js on its own, with a pretend audio context that writes down the notes it is asked for. */
function studio() {
  const page = {};
  vm.runInNewContext(read('core.js') + '\nthis.sfx = sfx;', page);
  const made = [];
  const param = () => { const p = { value: 0, sets: [] }; for (const k of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime']) p[k] = (v, t) => p.sets.push([v, t]); return p; };
  const node = kind => { const n = { kind, gain: param(), frequency: param(), Q: param(), playbackRate: param(), connect: to => to, start() {}, stop() {} }; made.push(n); return n; };
  page.sfx.ac = { currentTime: 10, createOscillator: () => node('osc'), createBufferSource: () => node('noise'), createBiquadFilter: () => node('filter'), createGain: () => node('gain') };
  page.sfx.master = {}; page.sfx.echo = {}; page.sfx.noise = {};
  // the first note of a knock: where its pitch starts
  return (...a) => { made.length = 0; page.sfx.knock(...a); return made.find(n => n.kind === 'osc').frequency.sets[0][0]; };
}

test('the knock climbs a note with each link of the chain, stops at an octave, and starts over after a miss', () => {
  const knock = studio(), base = knock(0.8);
  assert.equal(knock(0.8, 0), base, 'the first link sounds as a knock always did');
  assert.equal(knock(0.8, -1), base, 'and so does a miss');
  let last = base;
  for (let step = 1; step <= 5; step++) { const f = knock(0.8, step); assert.ok(f > last, `link ${step + 1} is higher`); last = f; }
  assert.ok(Math.abs(last / base - 2) < 1e-9, 'six links reach the octave');
  assert.equal(knock(0.8, 6), last);
  assert.equal(knock(0.8, 40), last, 'and a long chain stays there');
});
