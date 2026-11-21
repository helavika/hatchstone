const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Looking after a roomful at once (#318): feeding everyone hungry from the pantry, the feeding bowl that the hungry ones eat
// from by themselves (and that keeps feeding them while nobody's watching), bubbles for everyone, and a little joy from toys.
const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const plain = v => JSON.parse(JSON.stringify(v));
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const nestJs = read('nest.js'), playJs = read('play.js'), isoJs = read('iso.js'), saveJs = read('save.js'), dataJs = read('data.js'), i18n = read('i18n.js'), uiJs = read('ui.js');

/** A pretend nest with the feeding code in it: the kinds' favourite snacks, the bowl in room 1 unless told otherwise. */
function nest(o = {}) {
  const xp = [];
  const page = {
    Math, save: { pantry: {}, creatures: [], bowl: [], ...o.save }, game: { scene: o.scene || 'nest' }, document: { hidden: !!o.hidden },
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)), addXP: (c, n) => xp.push([c.id, n]), bump: () => {},
    specOf: c => ({ snack: c.fav || 'cookie' }), decorRoom: () => o.bowlRoom ?? 1,
    residents: r => page.save.creatures.filter(c => !c.out && c.room === r),
  };
  vm.createContext(page);
  vm.runInContext(cut(dataJs, 'const SNACKS = {', '\n};', 'the snacks should sit in data.js') + '\n};\n'
    + cut(nestJs, '/** What a snack does for whoever eats it', '/** Magic dust', 'the feeding code should sit in nest.js, before the magic dust')
    + '\nObject.assign(this, { HUNGRY_AT, BOWL_CAP, BOWL_AT, roundFood, favFood, feedPlan, bowlOf, bowlFill, bowlPick, bowlFeed, bowlAway, eatSnack, SNACKS });', page);
  return { page, xp };
}
const g = (id, o = {}) => ({ id, room: 1, tummy: 20, joy: 50, energy: 70, sleeping: false, ...o });

test('feed everyone hungry: one snack each, the hungriest first, favourites when the pantry has them', () => {
  const { page } = nest();
  const a = g(1, { tummy: 10, fav: 'berry' }), b = g(2, { tummy: 40, fav: 'dew' }), c = g(3, { tummy: 30 });
  const { plan, left, short } = page.feedPlan([b, a, c], { berry: 1, cookie: 3, milk: 5, feast: 2, cap: 4 }, page.favFood);
  assert.deepEqual(plain(plan.map(([cr, id]) => [cr.id, id])), [[1, 'berry'], [3, 'cookie'], [2, 'cookie']], 'hungriest first; no dew left for 2, so what there is most of');
  assert.deepEqual([left.berry, left.cookie, left.milk, left.feast, left.cap], [0, 1, 5, 2, 4], 'never a drink, the magic dust or a growcap');
  assert.equal(short, 0);
  // starfruit is everyone's favourite
  assert.equal(page.feedPlan([g(4, { fav: 'berry' })], { cookie: 5, star: 1 }, page.favFood).plan[0][1], 'star');
});

test('feed everyone hungry: when the pantry runs short, it says how many went without', () => {
  const { page } = nest();
  const hungry = [g(1, { tummy: 5 }), g(2, { tummy: 15 }), g(3, { tummy: 25 }), g(4, { tummy: 35 })];
  const r = page.feedPlan(hungry, { dew: 1, cookie: 1, milk: 9 }, page.favFood);
  assert.deepEqual(plain(r.plan.map(([cr]) => cr.id)), [1, 2]);
  assert.equal(r.short, 2);
  assert.equal(page.feedPlan(hungry, {}, page.favFood).short, 4);
  // and the sheet's own code: only the awake, hungry ones in the room, with the pantry it leaves behind
  assert.match(nestJs, /return here\.filter\(c => !c\.sleeping && c\.tummy < HUNGRY_AT\);/);
  assert.match(nestJs, /toast\(short \? tr\("The pantry ran short: \{0\} fed, \{1\} still hungry", plan\.length, short\)/);
  assert.match(nestJs, /\$\("feedAllBtn"\)\.addEventListener\("click", feedAll\);/);
  assert.equal(page.HUNGRY_AT, 60);
});

test('the bowl fills from the pantry up to its cap, the room\'s favourites first', () => {
  const { page } = nest();
  assert.equal(page.BOWL_CAP, 6);
  const r = page.bowlFill(['dew'], { berry: 2, cookie: 9, milk: 4, cap: 3 }, ['berry', 'berry', 'dew']);
  assert.equal(r.bowl.length, 6, 'never more than six');
  assert.deepEqual(plain(r.added), ['berry', 'berry', 'cookie', 'cookie', 'cookie']);
  assert.deepEqual([r.pantry.berry, r.pantry.cookie, r.pantry.milk, r.pantry.cap], [0, 6, 4, 3]);
  // full already: nothing goes in; an empty pantry: nothing either
  assert.deepEqual(plain(page.bowlFill(Array(6).fill('dew'), { cookie: 5 }).added), []);
  assert.deepEqual(plain(page.bowlFill([], { milk: 3, feast: 1 }).added), []);
  // whatever an odd save holds, the bowl shows only what it can hold, six at most
  const { page: odd } = nest({ save: { bowl: ['dew', 'nope', 'milk', ...Array(9).fill('cookie')] } });
  assert.deepEqual([...odd.bowlOf()], ['dew', 'cookie', 'cookie', 'cookie', 'cookie', 'cookie']);
});

test('who eats from the bowl: the hungry ones under BOWL_AT, hungriest first, favourite first, until nobody is or it\'s empty', () => {
  const { page, xp } = nest();
  const a = g(1, { tummy: 10, fav: 'berry' }), b = g(2, { tummy: 35 }), full = g(3, { tummy: 70 }), asleep = g(4, { tummy: 5, sleeping: true }), away = g(5, { tummy: 5, out: true });
  a.tummy = -20; // (so hungry that one moonberry isn't enough)
  const { left, ate } = page.bowlFeed([a, b, full, asleep, away], ['cookie', 'berry', 'dew', 'cookie']);
  assert.deepEqual(plain(ate.map(([cr, id]) => [cr.id, id])), [[1, 'berry'], [1, 'cookie'], [2, 'cookie']], 'its favourite, then the hungriest again, then the next, each its favourite');
  assert.deepEqual([...left], ['dew']);
  assert.ok(a.tummy >= page.BOWL_AT && b.tummy >= page.BOWL_AT);
  assert.deepEqual([full.tummy, asleep.tummy, away.tummy], [70, 5, 5], 'nobody else eats');
  assert.equal(xp.length, 3, 'each snack counts like one from your hand');
  assert.equal(page.bowlPick(g(9, { fav: 'dew' }), ['cookie', 'dew']), 1);
  assert.equal(page.bowlPick(g(9, { fav: 'dew' }), ['cookie', 'berry']), 0);
});

test('while nobody is watching its room, the bowl feeds the hungry ones there; in the room you look at, they walk over themselves', () => {
  const kids = () => [g(1, { tummy: 5 }), g(2, { tummy: 90 }), g(3, { tummy: 30, room: 0 })];
  const away = nest({ scene: 'crack', save: { creatures: kids(), bowl: ['cookie', 'cookie', 'dew'] } });
  away.page.bowlAway();
  assert.deepEqual([...away.page.save.bowl], ['dew'], 'one hungry one in its room ate twice, till its tummy was over BOWL_AT');
  assert.equal(away.page.save.creatures[2].tummy, 30, 'the one in another room has no bowl');
  // the nest in another room, or with the page hidden: the same
  const other = nest({ save: { room: 0, creatures: kids(), bowl: ['cookie'] } }); other.page.save.room = 0; other.page.bowlAway();
  assert.deepEqual([...other.page.save.bowl], []);
  const watched = nest({ save: { creatures: kids(), bowl: ['cookie'] } }); watched.page.save.room = 1; watched.page.bowlAway();
  assert.deepEqual([...watched.page.save.bowl], ['cookie'], 'watched: the bowl waits for them to come');
  // the hook sits next to the catch-up, and the decay itself is untouched
  assert.match(cut(saveJs, 'function gatherDust() {', '\n}\n', 'gatherDust'), /for \(const cr of save\.creatures\) applyTime\(cr\);\n.*\n  if \(save\.bowl\?\.length\) bowlAway\(\);/);
  assert.doesNotMatch(cut(saveJs, 'function applyTime(', '\n}\n', 'applyTime'), /bowl/);
  // and in the room, a hungry one goes to the bowl first thing
  assert.match(isoJs, /if \(cr && hasDecor\("bowl"\) && bowlCall\(a, cr\)\) return;/);
  assert.match(isoJs, /if \(d\.id === "bowl"\) \{ a\.goal = null; bowlArrive\(a, cr\); \}/);
});

test('the bowl is a piece of furniture like the others: sold at the shop, drawn, placed, its fill shown on it, both languages', () => {
  assert.match(dataJs, /\{ id: "bowl", name: "Feeding bowl", emoji: "🥣", cost: 60, lovers: \[\], verb: "eats from the bowl", emote: "♥", iso: true \}/);
  assert.match(isoJs, /\n  bowl\(t, T, ax, ay, o = \{\}\) \{/);
  assert.match(isoJs, /bowl: \{ fw: 1, fd: 1, at: /);
  assert.match(isoJs, /keepjar: 0\.4, bowl: 0\.6,/);
  assert.match(nestJs, /keepjar: "pretty", bowl: "comfort" \}/);
  assert.match(playJs, /p\.id === "bowl" \? \{ food: bowlOf\(\)\.join\(","\) \}/);
  assert.match(playJs, /case "bowl":[\s\S]{0,200}fillBowl\(\);/);
  for (const s of ['Feeding bowl', 'eats from the bowl', 'Feed everyone hungry', 'Fill the bowl', 'Bubbles for everyone', 'With everyone', 'Just for {0}', 'The bowl is full: {0}'])
    assert.ok(i18n.includes(JSON.stringify(s) + ':'), s);
});

test('bubbles for everyone: everyone who joined is glad, a bit more for each bubble it popped, up to a cap', () => {
  const page = { Math, clamp: (v, a, b) => Math.max(a, Math.min(b, v)) };
  vm.createContext(page);
  vm.runInContext(cut(playJs, '// ---------- bubbles for everyone', 'function startCatch() {', 'the bubble game should sit in play.js, before sparkle catch')
    + '\nObject.assign(this, { PARTY_T, PARTY_JOY, PARTY_MAX, partyOk, partyJoy, partyEnd });', page);
  assert.ok(page.PARTY_T >= 10 && page.PARTY_T <= 20, 'a short game');
  const a = g(1, { joy: 20 }), b = g(2, { joy: 20 }), c = g(3, { joy: 95 });
  assert.equal(page.partyEnd([a, b, c], { 1: 3, 3: 50 }), 3);
  assert.deepEqual([a.joy, b.joy, c.joy], [20 + page.PARTY_JOY + 6, 20 + page.PARTY_JOY, 100]);
  assert.equal(page.partyJoy(99), page.PARTY_MAX);
  assert.ok(a.energy < 70 && a.tummy < 20, 'playing tires and makes peckish');
  // who can join: awake, at home, not too sleepy
  assert.deepEqual([g(1), g(2, { sleeping: true }), g(3, { out: true }), g(4, { energy: 10 })].map(page.partyOk), [true, false, false, false]);
  // the games sheet offers it first, and the single games stay
  const sheet = cut(playJs, 'function openGames() {', '\n}\n', 'openGames');
  assert.match(sheet, /data-game="party"/);
  for (const id of ['catch', 'echo', 'walk']) assert.match(sheet, new RegExp(`\\["${id}"`));
  assert.match(sheet, /party: startParty/);
  // and in the room, each one who joined chases its own bubble
  assert.match(cut(isoJs, 'function updateActors(', '\n}\n', 'updateActors'), /partyBubble\(a\)/);
});

test('a toy in the room gives a little joy to whoever plays with it on its own, now and then', () => {
  const page = { Math, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), DECOR_CAT: { drum: 'play', blocks: 'play', painting: 'pretty' } };
  vm.createContext(page);
  vm.runInContext(cut(isoJs, '/** Playing with a toy on its own', '/** Off to a piece of furniture', 'toyJoy should sit in iso.js, before goVisit') + '\nObject.assign(this, { TOY_JOY, TOY_GAP, toyJoy });', page);
  const cr = g(1, { joy: 40 });
  assert.equal(page.toyJoy(cr, 'drum', 1e9), true);
  assert.equal(cr.joy, 40 + page.TOY_JOY);
  assert.equal(page.toyJoy(cr, 'blocks', 1e9 + 1000), false, 'not again so soon');
  assert.equal(page.toyJoy(cr, 'blocks', 1e9 + page.TOY_GAP), true);
  assert.equal(page.toyJoy(g(2), 'painting', 1e9), false, 'only toys');
  assert.match(isoJs, /a\.decor = a\.goal; a\.goal = null;\n\s+toyJoy\(cr, d\.id\);/);
});

test('the FAQ tells how to look after a roomful, in both languages', () => {
  assert.match(uiJs, /Feed everyone hungry gives one snack each/);
  assert.match(uiJs, /A feeding bowl from Tansy's shop feeds them by itself/);
  assert.match(i18n, /«Нагодувати всіх голодних»/);
  assert.match(i18n, /Мисочка для їжі з крамниці Тенсі годує сама/);
});
