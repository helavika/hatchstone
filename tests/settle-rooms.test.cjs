const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };

// a newcomer's bed (#316): nest.js needs the whole game around it, so only where a new glowling settles, who sets off to
// make room and the expeditions they go on are run here, with the diary beside them, over a pretend home of a few rooms
const nestJs = read('nest.js');
const src = [
  cut(nestJs, 'const BEHAVIOR = {', '\n};', 'the kinds of glowling should be one list in nest.js') + '\n};',
  cut(nestJs, 'const TRIP_PLACES = [', '/** The send-off sheet', 'the expeditions should sit in nest.js, before their sheet'),
  cut(nestJs, '/** How long a glowling\'s away when it sets off', '/** Someone had to go out', 'settleNew should sit in nest.js, before offerSpace'),
  cut(nestJs, '/** A glowling\'s diary keeps', '/** Its best friend', 'the diary should sit in nest.js, before bestFriend'),
].join('\n');
const fill = (s, ...a) => a.length ? s.replace(/\{(\d)\}/g, (_, i) => a[i]) : s;
const ROOMS = ['Nest', 'Kitchen', 'Library'];

/** A pretend home: rooms (the nest first), a cap, who lives where, the room you're in, and whether Pip's camp is open. */
function home({ cap = 2, rooms = 3, room = 0, trail = true, creatures = [], active } = {}) {
  const toasts = [], counts = {};
  const page = {
    save: { creatures, rooms: ROOMS.slice(0, rooms).map(n => ({ kind: n.toLowerCase() })), room, active: active ?? creatures[0]?.id, shards: 0, geodes: {} },
    THEME: { amethyst: { name: 'Amethyst Hollow' }, glowcap: { name: 'Glowcap Wood' }, celestite: { name: 'Celestite Grotto' }, malachite: { name: 'Malachite Deep' }, labradorite: { name: 'Labradorite Vault' } },
    tr: fill, unlocked: () => true, specOf: () => ({ voice: 1 }), homeCap: () => cap, isPlace: () => false, placeOk: id => id !== 'trail' || trail,
    toast: t => { toasts.push(t); }, bump: (k, n = 1) => { counts[k] = (counts[k] || 0) + n; }, content: c => (c.tummy ?? 70) >= 40 && (c.joy ?? 80) >= 25,
    roomName: i => ROOMS[i],
    // what a homecoming needs around it: the shelf, the garden, and a settleHome that calls in whoever there's a bed for
    CRYSTALS: [{ id: 'c0', name: 'Stone', rarity: 'common' }, { id: 'c1', name: 'Gem', rarity: 'rare' }], giveBar: () => {}, barName: b => b, seedName: s => s, garden: () => ({ seeds: {} }),
    addXP: () => {}, bringSpark: () => null, sparkNote: s => s, helperAt: () => false, wardDone: () => false, persist: () => {}, updateTopbar: () => {},
    settleHome: () => { for (const c of page.save.creatures.filter(x => x.out && !x.roam && !x.trip)) { const r = page.save.rooms.findIndex((_, i) => page.residents(i).length < cap); if (r < 0) break; c.out = false; c.room = r; } },
  };
  page.atHome = (i = page.save.room) => !!page.save.rooms[i];
  page.nestRoom = () => 0;
  page.roomOf = c => { const r = c.room || 0; return r < page.save.rooms.length ? r : 0; };
  page.residents = r => page.save.creatures.filter(c => !c.out && page.roomOf(c) === r);
  vm.createContext(page);
  vm.runInContext('Math.random = () => 0; const rand = (a, b) => a, pick = arr => arr[0];\n' + src, page);
  return { page, save: page.save, toasts, counts };
}
/** A glowling at home in room r: awake, fed and rested unless told otherwise. */
const glow = (id, r, o = {}) => ({ id, name: 'G' + id, sp: 'mothlet', room: r, energy: 80, tummy: 70, joy: 80, born: id, ...o });
/** A newborn, pushed onto the save the way moveIn does, and settled. */
function hatch(h, id = 99) { const c = { id, name: 'New', sp: 'petalpuff', energy: 80, tummy: 70, joy: 80, born: Date.now() }; h.save.creatures.push(c); h.page.settleNew(c); return c; }

test('a newcomer goes to the room you are in when it has space, and says nothing more', () => {
  const h = home({ room: 1, creatures: [glow(1, 0), glow(2, 0), glow(3, 1)] });
  const c = hatch(h);
  assert.equal(c.room, 1);
  assert.deepEqual(h.toasts, []);
  assert.ok(h.save.creatures.every(x => !x.out));
});

test('the room you are in full: the nest next, then any room with a free spot, with a toast saying where', () => {
  const h = home({ room: 1, creatures: [glow(1, 0), glow(2, 1), glow(3, 1)] });
  const c = hatch(h);
  assert.equal(c.room, 0, 'the nest before the library');
  assert.deepEqual(h.toasts, ['The kitchen is full, so New settled in the nest ✦']);
  // the nest full too: the last room with space
  const h2 = home({ room: 1, creatures: [glow(1, 0), glow(2, 0), glow(3, 1), glow(4, 1), glow(5, 2)] });
  assert.equal(hatch(h2).room, 2);
  assert.match(h2.toasts[0], /settled in the library/);
  assert.ok(h2.save.creatures.every(x => !x.out), 'nobody had to leave');
});

test('every room full: someone sets off on an expedition to make room, and the newcomer takes its bed', () => {
  const h = home({ room: 0, creatures: [glow(1, 0), glow(2, 0), glow(3, 1), glow(4, 1), glow(5, 2), glow(6, 2)] });
  const c = hatch(h);
  const gone = h.save.creatures.filter(x => x.out);
  assert.equal(gone.length, 1);
  const [x] = gone;
  // not the first glowling nor the one you're looking after (1 is both): one from the newcomer's own room, so it lands where you are
  assert.equal(x.id, 2);
  assert.equal(c.room, 0);
  assert.ok(x.trip && x.roam, 'a real expedition');
  assert.equal(x.trip.hrs, 4);
  assert.ok(x.trip.until > Date.now());
  assert.equal(h.counts.trips, 1);
  assert.match(h.toasts[0], /^Every room is full: G2 set off for .* to make room 🧭 back in 4 h$/);
  assert.equal(h.toasts.length, 1, 'settled where it was meant to: nothing more to say');
  assert.match(x.mem.at(-1).k, /to make room for/);
  assert.deepEqual(h.save.rooms.map((_, r) => h.page.residents(r).length), [2, 2, 2], 'no room over its cap');
});

test('who goes: rested, awake and content first, never the newborn, and the one you look after only if nobody else can', () => {
  // the first glowling (and the one you look after), a tired one, a sleeper
  const h = home({ cap: 3, rooms: 1, creatures: [glow(1, 0), glow(2, 0, { energy: 20 }), glow(3, 0, { sleeping: true })] });
  const c = hatch(h);
  const x = h.save.creatures.find(y => y.out);
  assert.equal(x.id, 2, 'awake beats asleep, and the first glowling stays');
  assert.notEqual(x, c);
  // with only the one you look after and the newborn, the one you look after goes, and the newborn is picked instead
  const h2 = home({ cap: 1, rooms: 1, creatures: [glow(1, 0)] });
  const n = hatch(h2);
  assert.ok(h2.save.creatures[0].out && !n.out);
  assert.equal(h2.save.active, n.id);
  // rested and content beat tired and hungry
  const h3 = home({ cap: 3, rooms: 1, creatures: [glow(1, 0), glow(2, 0, { energy: 30, tummy: 20 }), glow(3, 0, { energy: 90 })] });
  hatch(h3);
  assert.equal(h3.save.creatures.find(y => y.out).id, 3);
});

test('the newborn is never the one to go, whatever the rest are doing', () => {
  // everyone else asleep, away or helping: someone asleep is woken before the newborn is ever sent
  const h = home({ cap: 2, rooms: 1, creatures: [glow(1, 0, { sleeping: true }), glow(2, 0, { sleeping: true }), glow(3, 0, { out: true, roam: true, trip: { place: 'amethyst', hrs: 4, until: Date.now() + 1e6 } })] });
  const c = hatch(h);
  assert.ok(!c.out && !c.trip);
  assert.equal(h.save.creatures.filter(y => y.out).length, 2, 'one more out, the trip that was already away untouched');
  // and nobody else at home at all: it moves in anyway, and no one is sent
  const h2 = home({ cap: 0, rooms: 1, creatures: [] });
  const n = hatch(h2);
  assert.ok(!n.out);
  assert.equal(n.room, 0);
});

test('before Pip\'s camp is open, the one who makes room goes out exploring instead, and comes back on its own', () => {
  const g = glow(2, 0);
  const h2 = home({ trail: false, cap: 2, rooms: 1, creatures: [glow(1, 0), g] });
  hatch(h2);
  assert.ok(g.out && !g.roam && !g.trip, 'a plain explorer, the kind settleHome calls home once there is a bed');
  assert.equal(h2.toasts[0], 'Every room is full: G2 went out exploring to make room');
  assert.equal(h2.counts.trips, undefined);
});

test('back from the trip to a full home, it waits out exploring rather than crowding a room', () => {
  const h = home({ cap: 2, rooms: 1, creatures: [glow(1, 0), glow(2, 0)] });
  hatch(h);
  const x = h.save.creatures.find(y => y.trip);
  x.trip.until = Date.now() - 1;
  assert.equal(h.page.tripsHome().length, 1, 'it tells its tale');
  assert.ok(x.out && !x.trip, 'still out: a plain explorer now');
  assert.equal(JSON.stringify(h.page.tripsHome.waiting.map(y => y.id)), JSON.stringify([x.id]));
  assert.equal(h.page.residents(0).length, 2);
  // a bed frees up (someone sent off exploring on purpose): the next settling calls it in
  Object.assign(h.save.creatures.find(y => y.id === 1), { out: true, roam: true });
  h.page.settleHome();
  assert.ok(!x.out);
});
