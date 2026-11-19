const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };

// nest.js needs the whole game around it, so only the expeditions' part is run here: the places, the homecoming and the
// send-off (without its sheet), with the diary and the kinds of glowling beside them, over a pretend nest
const nestJs = read('nest.js'), ui = read('ui.js');
const tripsSrc = [
  cut(nestJs, 'const BEHAVIOR = {', '\n};', 'the kinds of glowling should be one list in nest.js') + '\n};',
  cut(nestJs, 'const TRIP_PLACES = [', '/** The send-off sheet', 'the expeditions should sit in nest.js, before their sheet'),
  cut(nestJs, '/** Off they go', '/** Coming back to the nest', 'sendTrip should sit in nest.js, before tellTrips'),
  cut(nestJs, '/** A glowling\'s diary keeps', '/** Its best friend', 'the diary should sit in nest.js, before bestFriend'),
].join('\n');

const H = 3600e3, KINDS = ['flutter', 'hop', 'nap', 'dance', 'curious', 'swim'];
const fill = (s, ...a) => a.length ? s.replace(/\{(\d)\}/g, (_, i) => a[i]) : s;
// one of each kind (petalpuff dances, mothlet flutters, dozeling naps, skyfin swims, blushbun hops, ambercub is curious)
const KIND_SP = { dance: 'petalpuff', flutter: 'mothlet', nap: 'dozeling', swim: 'skyfin', hop: 'blushbun', curious: 'ambercub' };
/** A seeded dice, so a run can be told again. */
const dice = seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

/** A pretend nest: its glowlings, its purse and shelf, and a note of every roll, toast and bar. */
function nest(creatures, roll = () => 0) {
  const rolls = [], toasts = [], bars = [], xp = [];
  const page = {
    roll, save: { creatures, shards: 0, geodes: {}, counts: {}, active: creatures[0]?.id, room: 0 }, game: { trip: { who: [], place: 'amethyst', hrs: 4 } },
    THEME: { amethyst: { name: 'Amethyst Hollow' }, glowcap: { name: 'Glowcap Wood' }, celestite: { name: 'Celestite Grotto' }, malachite: { name: 'Malachite Deep' }, labradorite: { name: 'Labradorite Vault' } },
    // a small shelf of crystals: two common and one rare from each cave
    CRYSTALS: [0, 1, 2, 3].flatMap(cave => ['common', 'common', 'rare'].map((rarity, i) => ({ id: `c${cave}${i}`, name: `Stone ${cave}${i}`, rarity, cave }))),
    seeds: {}, seedName: s => s, barName: b => b + ' bar', giveBar: b => { bars.push(b); },
    spark: () => null, sparkNote: s => '✨ ' + s, addXP: (c, n) => { xp.push([c.id, n]); },
    tr: fill, unlocked: () => true, specOf: c => c.mix ? { beh: c.mix.beh, voice: 1 } : { voice: 1 },
    settleHome: () => {}, persist: () => {}, updateTopbar: () => {}, syncActors: () => {}, renderNest: () => {}, openTrips: () => {}, helperAt: () => false,
    sfx: { chirp: () => {}, tick: () => {} }, toast: t => { toasts.push(t); },
  };
  page.garden = () => ({ seeds: page.seeds });
  page.bringSpark = (c, k) => page.spark(c, k);
  page.residents = () => page.save.creatures.filter(c => !c.out);
  page.bump = (k, n = 1) => { page.save.counts[k] = (page.save.counts[k] || 0) + n; };
  vm.createContext(page);
  vm.runInContext('Math.random = () => roll(); const rand = (a, b) => a + Math.random() * (b - a), pick = arr => arr[Math.floor(Math.random() * arr.length)];\n' + tripsSrc
    + '\nObject.assign(this, { TRIP_PLACES, TRIP_HOURS, BEHAVIOR, tripPlace, kindOf, areFriends, tripSuits, tripMate, tripNames });', page);
  // every roll of a find is noted: which find, how long a trip, and whether it was a small one
  const real = page.tripFind;
  page.tripFind = (f, k, got, part) => { rolls.push({ f, k, small: part != null && part < 1 }); return real(f, k, got, part); };
  return { page, save: page.save, rolls, toasts, bars, xp, base: () => rolls.filter(r => !r.small), small: () => rolls.filter(r => r.small) };
}
/** A glowling of a kind, home or away on a trip that's just over. */
const glowling = (id, name, kind, o = {}) => ({ id, name, sp: KIND_SP[kind], level: 1, ...o });
const away = (c, place, hrs = 4, mate) => Object.assign(c, { out: true, roam: true, trip: { place, hrs, until: Date.now() - 1, ...(mate ? { with: mate.id } : {}) } });
/** Two off together, back just now; friends if they've met often enough. */
function party(place, kindA, kindB, hrs = 4, met = 7) {
  const a = glowling(1, 'Lumi', kindA, { pals: met ? { 2: met } : {} }), b = glowling(2, 'Bobo', kindB);
  away(a, place, hrs, b); away(b, place, hrs, a);
  return [a, b];
}
const { page: w } = nest([]);
const unsuitedKind = pl => KINDS.find(k => !pl.suits.includes(k)), suitedKind = pl => pl.suits[0];
// (what the page hands back is made in the page's own world, so lists are copied out before they're compared)
const diary = c => [...c.mem].map(m => fill(m.k, ...m.a));

test('every kind of glowling has a place that suits it, and the two first places take four kinds between them', () => {
  assert.deepEqual([...new Set(Object.values(w.BEHAVIOR)), 'dance'].filter((k, i, a) => a.indexOf(k) === i).sort(), [...KINDS].sort());
  for (const pl of w.TRIP_PLACES) {
    assert.equal(pl.suits.length, 2, pl.id);
    assert.equal(new Set(pl.suits).size, 2, pl.id);
    for (const k of pl.suits) assert.ok(KINDS.includes(k), `${pl.id}: ${k}`);
  }
  for (const k of KINDS) assert.ok(w.TRIP_PLACES.some(pl => pl.suits.includes(k)), `nowhere suits the ${k} kind`);
  const first = w.TRIP_PLACES.filter(pl => ['amethyst', 'glowcap'].includes(pl.id));
  assert.equal(first.length, 2);
  for (const pl of first) assert.equal(pl.ok(), true);
  assert.equal(new Set(first.flatMap(pl => pl.suits)).size, 4);
  // the pool is for swimmers, the mushroom wood for the curious, and Dorma's corner of the Deep for nappers
  assert.ok(w.tripPlace('celestite').suits.includes('swim'));
  assert.ok(w.tripPlace('glowcap').suits.includes('curious'));
  assert.ok(w.tripPlace('malachite').suits.includes('nap'));
});

test('a glowling\'s kind: its species\', its own if it is a mix, a dancer if nobody says', () => {
  assert.equal(w.kindOf({ sp: 'skyfin' }), 'swim');
  assert.equal(w.kindOf({ sp: 'skyfin', mix: { beh: 'nap' } }), 'nap');
  assert.equal(w.kindOf({ sp: 'somebody-new' }), 'dance');
  assert.equal(w.tripSuits(w.tripPlace('celestite'), { sp: 'skyfin' }), true);
  assert.equal(w.tripSuits(w.tripPlace('celestite'), { sp: 'skyfin', mix: { beh: 'nap' } }), false);
});

test('a place that suits a glowling shows it one thing more; one that doesn\'t, nothing more', () => {
  for (const pl of w.TRIP_PLACES) for (const hrs of w.TRIP_HOURS) {
    const plain = nest([away(glowling(1, 'Pip', unsuitedKind(pl)), pl.id, hrs)]);
    assert.equal(plain.page.tripsHome().length, 1);
    assert.deepEqual(plain.base().map(r => r.f), [...pl.finds], `${pl.id} ${hrs} h`);
    assert.equal(plain.small().length, 0, `${pl.id} ${hrs} h: nothing more for one it doesn't suit`);

    const fit = nest([away(glowling(1, 'Pip', suitedKind(pl)), pl.id, hrs)]);
    assert.equal(fit.page.tripsHome().length, 1);
    assert.deepEqual(fit.base().map(r => r.f), [...pl.finds], `${pl.id} ${hrs} h`);
    assert.equal(fit.small().length, 1, `${pl.id} ${hrs} h: one thing more`);
    assert.ok(pl.finds.includes(fit.small()[0].f) && fit.small()[0].k === hrs, 'and it is one of the place\'s own finds, for a trip as long');
  }
});

test('the thing more is a small one: half the shards, or half the chance of anything else', () => {
  // shards (the dice at its lowest picks the first find; amethyst is turned round here so that's the shards)
  const a = nest([away(glowling(1, 'Pip', 'dance'), 'amethyst', 4)]), hollow = a.page.tripPlace('amethyst');
  hollow.finds = ['shards', 'geode0'];
  const [said] = a.page.tripsHome();
  // the trip's own shards are 24 at the least for 4 h, and the small heap is half of that
  assert.equal(a.save.shards, 24 + 12);
  assert.match(said, /Brought back: ✦ 24 · .*\+✦ 12$/);
  assert.deepEqual(diary(a.save.creatures[0]), [`Came back from Amethyst Hollow with ${said.split('Brought back: ')[1].replaceAll(' · ', ', ')}`]);

  // anything else: a dice at 0.6 is enough for the trip's own bar at 8 h (0.89), but not for the coin before the small one
  const b = nest([away(glowling(1, 'Mo', 'nap'), 'glowcap', 8)], () => 0.6);
  b.page.tripsHome();
  assert.deepEqual(b.small().map(r => r.f), ['nut']);
  assert.deepEqual(b.bars, ['nut']);
  // and a dice at 0.4 passes the coin: the small find is seeds this time, as many as the trip's own
  const c = nest([away(glowling(1, 'Mo', 'nap'), 'glowcap', 8)], () => 0.4);
  c.page.tripsHome();
  assert.deepEqual(c.small().map(r => r.f), ['seeds']);
  assert.deepEqual(c.page.seeds, { moonmint: 3 + 3 });
  assert.deepEqual(c.bars, ['nut']);
});

test('friends who go together find one thing more between them: once, not once each', () => {
  for (const pl of w.TRIP_PLACES) {
    const plain = unsuitedKind(pl), fit = suitedKind(pl);
    // friends, neither suited: the one shared find
    const none = nest(party(pl.id, plain, plain));
    assert.equal(none.page.tripsHome().length, 1, 'one tale for the two');
    assert.equal(none.small().length, 1, pl.id);
    // friends, both suited: one each for the place, one between them
    const both = nest(party(pl.id, fit, fit));
    both.page.tripsHome();
    assert.equal(both.small().length, 3, pl.id);
    // friends, one suited
    const one = nest(party(pl.id, fit, plain));
    one.page.tripsHome();
    assert.equal(one.small().length, 2, pl.id);
    // not friends (yet): two trips side by side, nothing shared
    const met = nest(party(pl.id, plain, plain, 4, 4));
    assert.equal(met.page.tripsHome().length, 2, 'each tells its own');
    assert.equal(met.small().length, 0, pl.id);
  }
  // friendship counts whichever of the two remembers it
  const [a, b] = party('amethyst', 'nap', 'nap', 4, 0);
  b.pals = { 1: 5 };
  assert.equal(w.areFriends(a, b), true);
  assert.equal(w.areFriends({ id: 1, pals: { 2: 4 } }, { id: 2, pals: { 1: 4 } }), false);
  assert.equal(w.areFriends({ id: 1 }, { id: 2 }), false);
});

test('two together are never worse off than two sent alone', () => {
  for (const pl of w.TRIP_PLACES) for (const hrs of w.TRIP_HOURS) for (const met of [0, 7]) for (const [ka, kb] of [[unsuitedKind(pl), unsuitedKind(pl)], [suitedKind(pl), unsuitedKind(pl)], [suitedKind(pl), suitedKind(pl)]]) {
    const what = `${pl.id} ${hrs} h, ${met ? 'friends' : 'not friends'}, ${ka} + ${kb}`;
    const together = nest(party(pl.id, ka, kb, hrs, met), dice(7));
    together.page.tripsHome();
    const alone = nest([away(glowling(1, 'Lumi', ka), pl.id, hrs), away(glowling(2, 'Bobo', kb), pl.id, hrs)], dice(7));
    alone.page.tripsHome();
    // every find of the place is rolled in full for each of the two, just as for two sent alone
    assert.deepEqual(together.base(), alone.base(), what);
    assert.deepEqual(together.base().map(r => r.f), [...pl.finds, ...pl.finds], what);
    // and the small ones on top are never fewer
    assert.ok(together.small().length >= alone.small().length, what);
    assert.equal(together.small().length - alone.small().length, met ? 1 : 0, what);
    // both grow from the trip as they would alone
    assert.deepEqual(together.xp, alone.xp, what);
    assert.deepEqual(together.xp, [[1, 6 * hrs], [2, 6 * hrs]], what);
  }
  // with the dice at its lowest, the shards say the same: two alone, two together, two friends together
  const shards = (list) => { const n = nest(list); n.page.tripsHome(); return n.save.shards; };
  const alone = shards([away(glowling(1, 'Lumi', 'nap'), 'celestite', 8), away(glowling(2, 'Bobo', 'nap'), 'celestite', 8)]);
  assert.equal(alone, 96);
  assert.equal(shards(party('celestite', 'nap', 'nap', 8, 0)), alone);
  assert.ok(shards(party('celestite', 'nap', 'nap', 8)) >= alone);
});

test('a trip from an older save (nobody along) comes home as it always did', () => {
  const pip = away(glowling(1, 'Pip', 'nap'), 'amethyst', 4), n = nest([pip]);
  assert.equal('with' in pip.trip, false);
  const back = n.page.tripsHome();
  assert.equal(back.length, 1);
  assert.equal(back[0], 'Pip found a purple crystal humming in the dark and hummed back until it stopped. Brought back: 💎 Stone 02 · ✦ 24');
  assert.deepEqual(diary(pip), ['Came back from Amethyst Hollow with 💎 Stone 02, ✦ 24']);
  assert.deepEqual([pip.trip, pip.roam, pip.sparked, pip.out], [null, false, true, true]);
  assert.equal(n.save.shards, 24);
  assert.equal(JSON.stringify(n.save.geodes), '{"c02":{"count":1,"shine":-1}}');
  assert.deepEqual(n.xp, [[1, 24]]);
  assert.deepEqual(n.rolls.map(r => [r.f, r.small]), [['geode0', false], ['shards', false]]);

  // one that isn't due yet stays out, and one sent somewhere the map no longer has comes back by the first place
  const soon = glowling(2, 'Mo', 'nap', { out: true, trip: { place: 'amethyst', hrs: 4, until: Date.now() + H } });
  const lost = away(glowling(3, 'Fig', 'nap'), 'nowhere', 1), m = nest([soon, lost]);
  assert.equal(m.page.tripsHome().length, 1);
  assert.ok(soon.trip && !lost.trip);
  assert.match(diary(lost)[0], /^Came back from Amethyst Hollow/);
  // and with nothing found there's still a tale and a line in the diary
  const empty = away(glowling(4, 'Nori', 'swim'), 'glowcap', 1), e = nest([empty], dice(3));
  e.page.tripPlace('glowcap').finds = [];
  const [tale] = e.page.tripsHome();
  assert.doesNotMatch(tale, /Brought back/);
  assert.deepEqual(diary(empty), ['Came back from Glowcap Wood']);
});

test('if the one who went along is gone or was called home, the other comes back alone', () => {
  const solo = (n, c) => {
    const back = n.page.tripsHome();
    assert.equal(back.length, 1);
    assert.doesNotMatch(back[0], /Bobo/);
    assert.match(back[0], /^Lumi /);
    assert.equal(n.small().length, 0, 'no shared find');
    assert.deepEqual(n.base().map(r => r.f), ['geode0', 'shards']);
    assert.match(diary(c)[0], /^Came back from Amethyst Hollow/);
    assert.equal(c.trip, null);
  };
  // called home early (moving a glowling ends its trip)
  let [a, b] = party('amethyst', 'nap', 'nap');
  b.trip = null; b.out = false;
  let n = nest([a, b]);
  assert.equal(n.page.tripMate(a), undefined);
  solo(n, a);
  assert.equal(b.mem, undefined, 'and the one at home has nothing to tell');
  // no longer in the nest at all
  [a, b] = party('amethyst', 'nap', 'nap');
  solo(nest([a]), a);
  // called home and sent off again, alone or with someone else: that's another trip now
  [a, b] = party('amethyst', 'nap', 'nap');
  b.trip = { place: 'glowcap', hrs: 8, until: Date.now() + 8 * H };
  n = nest([a, b]); solo(n, a);
  assert.equal(b.trip.place, 'glowcap');
  [a, b] = party('amethyst', 'nap', 'nap');
  const c = glowling(3, 'Fig', 'nap', { out: true });
  b.trip = { place: 'glowcap', hrs: 8, until: Date.now() + 8 * H, with: 3 }; c.trip = { ...b.trip, with: 2 };
  n = nest([a, b, c]); solo(n, a);
  assert.ok(b.trip && c.trip);
  // a trip that names itself as company is a trip alone
  const odd = away(glowling(1, 'Lumi', 'nap', { pals: { 1: 9 } }), 'amethyst', 4);
  odd.trip.with = 1;
  solo(nest([odd]), odd);
});

test('friends come home with one tale for the two, and it goes into both diaries', () => {
  for (const pl of w.TRIP_PLACES) {
    const [a, b] = party(pl.id, unsuitedKind(pl), unsuitedKind(pl)), n = nest([a, b]);
    const back = n.page.tripsHome();
    assert.equal(back.length, 1, pl.id);
    assert.ok(back[0].startsWith(fill(pl.pair, 'Lumi', 'Bobo')), `${pl.id}: ${back[0]}`);
    assert.match(pl.pair, /^\{0\} and \{1\} /);
    assert.ok(!pl.tales.includes(pl.pair));
    const name = n.page.THEME[pl.theme].name;
    assert.ok(diary(a)[0].startsWith(`Went to ${name} with Bobo ♥`), diary(a)[0]);
    assert.ok(diary(b)[0].startsWith(`Went to ${name} with Lumi ♥`), diary(b)[0]);
    assert.equal(a.mem.length, 1); assert.equal(b.mem.length, 1);
    assert.deepEqual([a.trip, b.trip, a.roam, b.roam, a.sparked, b.sparked], [null, null, false, false, true, true]);
  }
  // the shards are told as one heap (what each found, and the shared find once), and it's what the purse got
  const [a, b] = party('amethyst', 'nap', 'nap'), n = nest([a, b]);
  n.page.tripPlace('amethyst').finds = ['shards', 'geode0'];
  const [said] = n.page.tripsHome();
  assert.equal(n.save.shards, 24 + 24 + 12);
  assert.match(said, /Brought back: ✦ 60 · /);
  assert.equal(said.split('✦').length, 2, 'one heap, said once');
  // each diary keeps its own finds and the shared one
  assert.match(diary(a)[0], /^Went to Amethyst Hollow with Bobo ♥ and came back with ✦ 24, 💎 Stone 02, \+✦ 12$/);
  assert.match(diary(b)[0], /^Went to Amethyst Hollow with Lumi ♥ and came back with ✦ 24, 💎 Stone 02, \+✦ 12$/);
  // a spark each is told too
  const [c, d] = party('glowcap', 'dance', 'dance', 1), s = nest([c, d]);
  s.page.spark = x => 'a song from ' + x.name;
  const [told] = s.page.tripsHome();
  assert.ok(told.includes('✨ a song from Lumi') && told.includes('✨ a song from Bobo'));
  // and friends who found nothing at all still went together
  const [e, f] = party('glowcap', 'dance', 'dance', 1), q = nest([e, f]);
  q.page.tripPlace('glowcap').finds = [];
  q.page.tripFind = () => {};
  const [bare] = q.page.tripsHome();
  assert.equal(bare, fill(q.page.tripPlace('glowcap').pair, 'Lumi', 'Bobo'));
  assert.deepEqual(diary(e), ['Went to Glowcap Wood with Bobo ♥']);
});

test('sending off: two set out as two trips that know of each other, due home at the same moment', () => {
  const a = glowling(1, 'Lumi', 'flutter'), b = glowling(2, 'Bobo', 'dance'), c = glowling(3, 'Fig', 'curious'), n = nest([a, b, c]);
  n.page.game.trip = { who: [1, 2], place: 'glowcap', hrs: 8 };
  n.page.sendTrip();
  assert.equal(a.trip.until, b.trip.until);
  assert.deepEqual([a.trip.with, b.trip.with, a.trip.place, b.trip.hrs, a.out, b.out], [2, 1, 'glowcap', 8, true, true]);
  assert.equal(n.page.tripMate(a), b); assert.equal(n.page.tripMate(b), a);
  assert.equal(n.save.counts.trips, 2, 'each glowling sent is an expedition of its own');
  assert.deepEqual(n.toasts, ['Lumi and Bobo set off for Glowcap Wood 🧭 back in 8 h']);
  assert.deepEqual([...n.page.game.trip.who], [], 'nobody is left picked');
  assert.equal(n.save.active, 3, 'whoever stays is the one looked after');
  assert.equal(n.page.tripNames([a, b]), 'Lumi & Bobo');
  // nothing comes home before its time
  assert.deepEqual([...n.page.tripsHome()], []);

  // one alone goes as before, with nobody named
  n.page.game.trip = { who: [3], place: 'amethyst', hrs: 1 };
  n.page.sendTrip();
  assert.equal('with' in c.trip, false);
  assert.equal(n.save.counts.trips, 3);
  assert.equal(n.toasts[1], 'Fig set off for Amethyst Hollow 🧭 back in 1 h');
  assert.equal(n.page.tripNames([c]), 'Fig');

  // nobody picked, someone already out, or more than two: nobody extra leaves
  const m = nest([glowling(1, 'Lumi', 'flutter'), glowling(2, 'Bobo', 'dance', { out: true }), glowling(3, 'Fig', 'curious'), glowling(4, 'Mo', 'nap')]);
  m.page.sendTrip();
  assert.equal(m.save.counts.trips, undefined);
  m.page.game.trip.who = [2, 1];
  m.page.sendTrip();
  assert.equal(m.save.counts.trips, 1);
  assert.equal('with' in m.save.creatures[0].trip, false, 'the one already out doesn\'t count as company');
  assert.equal(m.save.creatures[1].trip, undefined);
  m.page.game.trip.who = [3, 4, 2];
  m.page.sendTrip();
  assert.equal(m.save.counts.trips, 3);
});

test('in Ukrainian: every new word of the expeditions has its own', () => {
  const page = {
    location: { pathname: '/' }, addEventListener: () => {}, navigator: { languages: [] }, NodeFilter: { SHOW_TEXT: 4 },
    localStorage: { getItem: k => k === 'hatchstone.lang' ? 'uk' : null, setItem: () => {} },
    document: { documentElement: {}, body: {}, title: '', createTreeWalker: () => ({ nextNode: () => null }), querySelectorAll: () => [] },
  };
  vm.runInNewContext(read('i18n.js') + '\nObject.assign(this, { tr, UK });', page);
  // everything the trips say: their lines, their tales (alone and together), their diary notes, and the answer in the help
  const trips = cut(nestJs, 'const TRIP_PLACES = [', '/** Coming back to the nest', 'the expeditions should sit in nest.js');
  const said = [...[...trips.matchAll(/(?:tr\(| \? | : )"((?:[^"\\\n]|\\.)+)"/g)].map(x => x[1].replace(/\\(.)/g, '$1')).filter(s => /\S /.test(s) && /[a-z]{3}|\{0\}/.test(s)),
    ...w.TRIP_PLACES.flatMap(pl => [...pl.tales, pl.pair])];
  for (const s of ['{0} & {1}', 'Suits: {0}', 'Went to {0} with {1} ♥', 'Went to {0} with {1} ♥ and came back with {2}', 'Friends together: one more find and a tale.', 'Pick one glowling, or two to go together.', w.tripPlace('malachite').pair])
    assert.ok(said.includes(s), `not found in the trips' own words: ${s}`);
  const faq = ui.match(/\["How do expeditions work\?", "((?:[^"\\]|\\.)+)"\]/);
  assert.ok(faq && /Two can go together/.test(faq[1]), 'the help should say two can go together');
  for (const s of [...said, faq[1].replace(/\\(.)/g, '$1')]) assert.equal(typeof page.UK[s], 'string', `no Ukrainian for: ${s}`);
  // both names stay in every tale for two, and the diary note keeps the place, the friend and the finds
  for (const pl of w.TRIP_PLACES) assert.match(page.tr(pl.pair, 'Лумі', 'Бобо'), /^Лумі і Бобо /, pl.id);
  const note = page.tr('Went to {0} with {1} ♥ and came back with {2}', 'Ліс', 'Бобо', '✦ 24');
  assert.ok(['Ліс', 'Бобо', '✦ 24', '♥'].every(x => note.includes(x)), note);
  assert.equal(page.tr('{0} & {1}', 'Лумі', 'Бобо'), 'Лумі і Бобо');
});
