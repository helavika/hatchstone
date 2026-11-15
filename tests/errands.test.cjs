const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sparkSaveOf } = require('../js/sparks.js');
const { keeperMigrate } = require('../js/inner.js');
const { KEEPSAKES, KEEP_WEAR, WALK_FINDS, walkSaveOf, keepsakePick, jarOf, keepjarView } = require('../js/walk.js');
const { wardSaveOf } = require('../js/wards.js');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// nest.js and walk.js need the whole game around them, so only the errands' part of each is run here, over a pretend nest:
// the garden bed, the keepers with their wishes, the tap on a keeper, and what a walk does with a find
const nestJs = read('nest.js'), walkJs = read('walk.js'), saveJs = read('save.js'), ui = read('ui.js');
const KS = Object.fromEntries(KEEPSAKES.map(k => [k.id, k]));
const errandsSrc = [
  cut(nestJs, 'const GARDEN_SLOTS = 3, PLOT_BOND', '/** How far along a plant is', 'the garden bed should sit in nest.js, before growth'),
  cut(nestJs, 'const TANSY = ', '/** The button in the keeper\'s bar', 'the keepers and their errands should sit together in nest.js'),
  line(nestJs, /^const heroHere = .*$/m, 'heroHere should be one line in nest.js'),
  cut(nestJs, 'function tapHero(', '/** The bar under a place', 'tapHero should sit in nest.js, before the place bar'),
  line(walkJs, /^const WALK_KEEP = .*$/m, 'WALK_KEEP should be one line in walk.js'),
  cut(walkJs, 'function walkGive(', '\n}\n', 'walkGive should sit in walk.js') + '\n}',
  'Object.assign(this, { HEROES, FENNEL, GARDEN_SLOTS, gardenSlots, bondOf, wishOf, wishTold, bondStory, wishSeeks });',
].join('\n');
const saveSrc = cut(saveJs, 'const SAVE_VERSION', 'const save = loadSave();', 'the save\'s way in should sit at the top of save.js');

/** A pretend nest with the yard open and Fennel in it: his hellos already heard, unless the save says otherwise. */
function nest(save = {}, rnd = () => 0.5) {
  const said = [], math = Object.assign(Object.create(Math), { random: rnd });
  const page = {
    Math: math, PX_ICON_MAPS: {}, jarOf, KS, WALK_FINDS, keepsakePick, SNACKS: { berry: { name: 'Moonberry', emoji: '' } }, SPARKS: [],
    save: { shards: 0, rooms: [{ kind: 'yard' }], room: 0, heroTalk: { yard: 3 }, walks: walkSaveOf({}), decor: { keepjar: { on: true } }, pantry: {}, sparks: { got: {} }, ...save },
    game: { time: 0 }, sfx: { voice: () => {}, knock: () => {} }, setTimeout: () => 0, tr: s => s, pick: arr => arr[0], seedName: id => id,
    sparkPipLine: () => '', placeBurst: () => {}, persist: () => {}, renderPlaceBar: () => {}, updateTopbar: () => {}, remember: () => {},
  };
  vm.runInNewContext(errandsSrc, page);
  // one tap on Fennel, a good while after the last (so he never curls up); what he said comes back
  const tap = (dt = 10e3) => { page.game.time += dt; page.tapHero(); said.push(page.game.hero.line); return page.game.hero.line; };
  return { page, save: page.save, said, tap, yard: page.HEROES.yard };
}
/** A save as it comes through the door: written to a pretend storage, then loaded the way the game loads it. */
function load(d) {
  const page = {
    SAVE_KEY: 'k', BAK_KEY: 'k.bak', localStorage: { getItem: k => k === 'k' && d ? JSON.stringify(d) : null, setItem: () => {} },
    sparkSaveOf, keeperMigrate, walkSaveOf, wardSaveOf, KEEP_WEAR, KS,
  };
  vm.runInNewContext(saveSrc + '\nthis.loaded = loadSave();', page);
  // (through JSON, as it would be written: what isn't there isn't kept)
  return JSON.parse(JSON.stringify(page.loaded));
}
const plant = (seed, at = 1) => ({ seed, at });
/** Everything he will ever ask for, already at hand. */
const allThree = () => ({ walks: walkSaveOf({ found: { harebell: 1 } }), pantry: { tea: 1 }, pocket: { pebble: 1 } });

test('only Fennel has wishes yet: three of them, each with all it needs', () => {
  const { page, yard } = nest();
  assert.deepEqual(Object.keys(page.HEROES).filter(k => page.HEROES[k].asks), ['yard']);
  assert.equal(yard.asks.length, 3);
  for (const a of yard.asks) {
    for (const k of ['ask', 'wish', 'btn', 'story']) assert.ok(typeof a[k] === 'string' && a[k].length > 8, k);
    assert.equal(typeof a.have, 'function'); assert.equal(typeof a.give, 'function');
    assert.ok(Array.isArray(a.gift) && typeof a.gift[0] === 'string' && typeof a.gift[1] === 'function');
    // a line of his story is short enough to read in one bubble
    assert.ok(a.story.split(/\s+/).length <= 25, a.story);
  }
  assert.ok(typeof yard.calm === 'string' && yard.calm.length > 8);
  // the first is a harebell from a walk; the last is thanked with the fourth plot
  assert.equal(yard.asks[0].ks, 'harebell');
  assert.match(yard.asks[2].gift[0], /fourth plot/);
  assert.equal(yard.asks.length, 3 /* PLOT_BOND */);
});

test('the wishes come one at a time, in order', () => {
  const { page, save, yard } = nest(allThree());
  for (let k = 0; k < 3; k++) {
    assert.equal(page.bondOf('yard'), k);
    assert.equal(page.wishOf('yard'), yard.asks[k]);
    assert.equal(page.giveWish('yard'), yard.asks[k]);
    assert.deepEqual([...page.bondStory('yard')], [...yard.asks].slice(0, k + 1).map(a => a.story));
  }
  assert.deepEqual(JSON.parse(JSON.stringify(save.bonds)), { yard: 3 });
  // the keepers with no wishes have none, and nothing to bring
  for (const k of ['shop', 'forge', 'camp', 'lab', 'grotto', 'nowhere']) {
    assert.equal(page.wishOf(k), null); assert.equal(page.giveWish(k), null); assert.deepEqual([...page.bondStory(k)], []);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(save.bonds)), { yard: 3 });
});

test('without the thing he asked for, nothing is given and nothing changes', () => {
  // a jar full of other flowers, a basket of other food, shards in plenty: none of it is a harebell
  const { page, save } = nest({ shards: 500, walks: walkSaveOf({ found: { daisy: 4, heather: 2, rose: 1 } }), pantry: { cookie: 9 }, garden: { slots: [null, null, null], seeds: { moonmint: 1 } } });
  const before = JSON.stringify(save);
  assert.equal(page.wishOf('yard').have(), false);
  assert.equal(page.giveWish('yard'), null);
  assert.equal(JSON.stringify(save), before);
  assert.equal(page.bondOf('yard'), 0);
  // a harebell that was found once and then woven into a crown isn't in the jar any more
  const worn = nest({ walks: walkSaveOf({ found: { harebell: 1 }, used: { harebell: 1 } }) });
  assert.equal(worn.page.giveWish('yard'), null);
  // and each later wish waits for its own thing, whatever else is at hand
  const second = nest({ bonds: { yard: 1 }, walks: walkSaveOf({ found: { harebell: 3 } }), pocket: { pebble: 2 } });
  assert.equal(second.page.giveWish('yard'), null);
  const third = nest({ bonds: { yard: 2 }, walks: walkSaveOf({ found: { harebell: 3 } }), pantry: { tea: 5 } });
  assert.equal(third.page.giveWish('yard'), null);
  assert.equal(third.page.gardenSlots(), 3);
});

test('the harebell leaves the jar, stays in the Book, and he thanks with moon mint seeds', () => {
  const { page, save } = nest({ walks: walkSaveOf({ found: { harebell: 2, daisy: 1 } }), garden: { slots: [null, null, null], seeds: { moonmint: 1 } } });
  const stems = v => v.stems.filter(id => id === 'harebell').length;
  assert.equal(stems(keepjarView(jarOf(save.walks))), 2);
  assert.ok(page.giveWish('yard'));
  assert.deepEqual(JSON.parse(JSON.stringify(jarOf(save.walks))), { daisy: 1, harebell: 1 });
  assert.equal(stems(keepjarView(jarOf(save.walks))), 1);
  // found stays as it was (the Book's pressed flowers and "kinds found" count from it), and the save still reads whole
  assert.equal(save.walks.found.harebell, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(walkSaveOf(save.walks).used)), { harebell: 1 });
  assert.equal(save.garden.seeds.moonmint, 3);
  assert.equal(page.bondOf('yard'), 1);
  // the only harebell: the jar has none left, and the next wish is another one altogether
  const one = nest({ walks: walkSaveOf({ found: { harebell: 1 } }) });
  assert.ok(one.page.giveWish('yard'));
  assert.equal(jarOf(one.save.walks).harebell, undefined);
  assert.equal(one.page.giveWish('yard'), null);
  assert.equal(one.page.bondOf('yard'), 1);
});

test('one cup of tea is poured for him, and a growcap seed comes back', () => {
  const { page, save } = nest({ bonds: { yard: 1 }, pantry: { tea: 3, cookie: 2 }, garden: { slots: [plant('moonmint'), null, null], seeds: {} } });
  assert.ok(page.giveWish('yard'));
  assert.deepEqual(JSON.parse(JSON.stringify(save.pantry)), { tea: 2, cookie: 2 });
  assert.equal(save.garden.seeds.growcap, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(save.garden.slots)), [plant('moonmint'), null, null]);
  assert.equal(page.bondOf('yard'), 2);
});

test('a walk puts one pebble by for him, and only while he is waiting for it', () => {
  // before he has asked for it, a pebble is shards, as ever
  const early = nest({ bonds: { yard: 1 } });
  early.page.walkGive('pebble');
  assert.ok(early.save.shards >= 4 && early.save.shards <= 6);
  assert.equal(early.save.pocket, undefined);
  // once he has: the next one is kept just as it is, and the ones after it are shards again
  const { page, save, yard } = nest({ bonds: { yard: 2 } });
  assert.equal(page.wishOf('yard').have(), false);
  const [label] = page.walkGive('pebble');
  assert.equal(label, yard.asks[2].found);
  assert.deepEqual(JSON.parse(JSON.stringify(save.pocket)), { pebble: 1 });
  assert.equal(save.shards, 0);
  page.walkGive('pebble');
  assert.deepEqual(JSON.parse(JSON.stringify(save.pocket)), { pebble: 1 });
  assert.ok(save.shards >= 4);
  // giving it empties the pocket, and after that a pebble is never put by again
  assert.equal(page.giveWish('yard'), yard.asks[2]);
  assert.equal(save.pocket.pebble, 0);
  const had = save.shards;
  page.walkGive('pebble');
  assert.equal(save.pocket.pebble, 0);
  assert.ok(save.shards > had);
});

test('the flower he is waiting for turns up first, so nobody walks ten times for a harebell', () => {
  // (the walk's dice would have said a wild rose)
  const rose = () => 0.999;
  assert.equal(keepsakePick('flower', {}, rose), 'rose');
  assert.equal(keepsakePick('flower', {}, rose, 'harebell'), 'harebell');
  // a feather is still a feather, and a wish for something that isn't a keepsake changes nothing
  assert.equal(KS[keepsakePick('feather', {}, rose, 'harebell')].kind, 'feather');
  assert.equal(keepsakePick('flower', {}, rose, 'pebble'), 'rose');
  // on a walk: the first flower is the harebell, the next is whatever the dice say; feathers never were his
  const { page, save } = nest({}, rose);
  assert.equal(page.walkGive('feather')[2], 'raven');
  assert.equal(page.walkGive('flower')[2], 'harebell');
  assert.equal(page.wishOf('yard').have(), true);
  assert.equal(page.walkGive('flower')[2], 'rose');
  assert.deepEqual(JSON.parse(JSON.stringify(jarOf(save.walks))), { raven: 1, harebell: 1, rose: 1 });
  // and once it's given, flowers are the dice's again
  assert.ok(page.giveWish('yard'));
  assert.equal(page.walkGive('flower')[2], 'rose');
});

test('the bond is kept in the save, and an older nest starts with none', () => {
  // an older nest: a garden, a jar, a keeper already chatted to, and no word of bonds
  const old = load({ v: 1, stars: { 1: 3, 2: 3 }, creatures: [], seen: {}, counts: {}, heroTalk: { yard: 9 }, garden: { slots: [plant('glowberry', 5), null, plant('moonmint', 7)], seeds: { glowberry: 1 } }, walks: { n: 4, found: { harebell: 1 } } });
  assert.equal(old.bonds, undefined);
  const a = nest(old);
  assert.equal(a.page.bondOf('yard'), 0);
  assert.equal(a.page.wishOf('yard'), a.yard.asks[0]);
  assert.equal(a.page.wishTold('yard'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(a.page.garden().slots)), [plant('glowberry', 5), null, plant('moonmint', 7)]);
  // he gets his harebell; the nest is written and read again, and the bond, the jar and the pocket are all still there
  assert.ok(a.page.giveWish('yard'));
  a.save.pocket = { pebble: 1 }; a.save.wishes = { yard: 2 };
  const back = load(JSON.parse(JSON.stringify(a.save)));
  assert.deepEqual(back.bonds, { yard: 1 });
  assert.deepEqual(back.pocket, { pebble: 1 });
  assert.deepEqual(back.wishes, { yard: 2 });
  assert.deepEqual(back.walks.used, { harebell: 1 });
  const b = nest(back);
  assert.equal(b.page.bondOf('yard'), 1);
  assert.equal(b.page.wishOf('yard'), b.yard.asks[1]);
  assert.equal(b.page.wishTold('yard'), true);
  // a bond that got written oddly is read as none, or as whole wishes, and never breaks the bed
  for (const [odd, n] of [[null, 0], ['3', 0], [-2, 0], [NaN, 0], [1.9, 1], [99, 99]]) {
    const c = nest({ bonds: { yard: odd } });
    assert.equal(c.page.bondOf('yard'), n, String(odd));
    assert.equal(c.page.garden().slots.length, n >= 3 ? 4 : 3);
  }
  assert.equal(nest({ bonds: null }).page.bondOf('yard'), 0);
});

test('the fourth plot comes only after the third wish, and the bed never loses a plant', () => {
  const bed = [plant('glowberry', 5), plant('moonmint', 6), plant('starfruit', 7)];
  const { page, save } = nest({ ...allThree(), garden: { slots: bed.map(q => ({ ...q })), seeds: {} } });
  for (let k = 0; k < 3; k++) {
    assert.equal(page.gardenSlots(), 3);
    assert.equal(page.garden().slots.length, 3);
    page.giveWish('yard');
  }
  assert.equal(page.gardenSlots(), 4);
  // the thank-you itself has already made the bed longer: three plants where they were, and one empty plot
  assert.deepEqual(JSON.parse(JSON.stringify(save.garden.slots)), [...bed, null]);
  assert.deepEqual(JSON.parse(JSON.stringify(page.garden().slots)), [...bed, null]);
  // a nest that never opened the garden gets a whole new bed of the right length
  assert.deepEqual(JSON.parse(JSON.stringify(nest({ bonds: { yard: 3 } }).page.garden().slots)), [null, null, null, null]);
  assert.deepEqual(JSON.parse(JSON.stringify(nest().page.garden().slots)), [null, null, null]);
  // a bed that is longer than it should be (the bond lost, or a nest from somewhere else): empty plots go from its end, a plant never does
  const long = nest({ garden: { slots: [null, plant('glowberry'), null, plant('growcap')], seeds: {} } });
  assert.deepEqual(JSON.parse(JSON.stringify(long.page.garden().slots)), [null, plant('glowberry'), null, plant('growcap')]);
  long.save.garden.slots[3] = null; // ...until it's picked
  assert.deepEqual(JSON.parse(JSON.stringify(long.page.garden().slots)), [null, plant('glowberry'), null]);
  const longer = nest({ bonds: { yard: 3 }, garden: { slots: [plant('a'), null, null, null, plant('b'), null, null], seeds: {} } });
  assert.deepEqual(JSON.parse(JSON.stringify(longer.page.garden().slots)), [plant('a'), null, null, null, plant('b')]);
  // a short or broken bed is mended without touching what grows in it
  assert.deepEqual(JSON.parse(JSON.stringify(nest({ bonds: { yard: 3 }, garden: { slots: [plant('a')], seeds: {} } }).page.garden().slots)), [plant('a'), null, null, null]);
  assert.deepEqual(JSON.parse(JSON.stringify(nest({ garden: { slots: 'oops', seeds: {} } }).page.garden().slots)), [null, null, null]);
});

test('after the last wish there is none: no wish, nothing to give, a contented word', () => {
  const { page, save, tap, said, yard } = nest({ ...allThree(), walks: walkSaveOf({ found: { harebell: 5 } }), pantry: { tea: 5 }, pocket: { pebble: 1 } });
  for (let k = 0; k < 3; k++) page.giveWish('yard');
  const before = JSON.stringify(save);
  assert.equal(page.wishOf('yard'), null);
  assert.equal(page.giveWish('yard'), null);
  assert.equal(JSON.stringify(save), before);
  assert.equal(page.wishSeeks('ks'), null);
  assert.equal(page.wishSeeks('find'), null);
  assert.equal(page.bondStory('yard').length, 3);
  // the first thing he says is that he needs nothing; after that it's his everyday lines (and that one among them, now and then)
  assert.equal(tap(), yard.calm);
  for (let i = 0; i < 12; i++) tap();
  assert.ok(said.every(l => l === yard.calm || yard.lines.includes(l)), said.join(' | '));
  assert.ok(said.slice(1).some(l => yard.lines.includes(l)));
  assert.ok(!said.some(l => yard.asks.some(a => a.ask === l)));
  // a bond past the end (a save from a later day, opened by this one) is the same quiet
  const far = nest({ bonds: { yard: 7 } });
  assert.equal(far.page.wishOf('yard'), null); assert.equal(far.page.giveWish('yard'), null); assert.equal(far.page.bondStory('yard').length, 3);
});

test('he says his wish once the hellos are done, then again within a few taps, never every tap', () => {
  const { page, save, tap, said, yard } = nest({ heroTalk: {} });
  // three hellos first, and the wish isn't in the bar before he has said it
  for (const hello of yard.hello) { assert.equal(tap(), hello); assert.equal(page.wishTold('yard'), false); }
  assert.equal(tap(), yard.asks[0].ask);
  assert.equal(page.wishTold('yard'), true);
  assert.deepEqual(JSON.parse(JSON.stringify(save.wishes)), { yard: 1 });
  // sixteen more taps: the wish comes round again, with at most three other lines between, and never twice running
  said.length = 0;
  for (let i = 0; i < 16; i++) tap();
  const at = said.map((l, i) => l === yard.asks[0].ask ? i : -1).filter(i => i >= 0);
  assert.deepEqual(at, [3, 7, 11, 15]);
  assert.ok(said.every(l => l === yard.asks[0].ask || yard.lines.includes(l)));
  // the next wish is said on the first tap after the last one is brought
  save.walks.found.harebell = 1;
  assert.ok(page.giveWish('yard'));
  assert.equal(page.wishTold('yard'), false);
  assert.equal(tap(), yard.asks[1].ask);
  assert.equal(page.wishTold('yard'), true);
  // another day (nothing remembered but the save): the wish comes back on the second tap
  const again = nest({ bonds: { yard: 1 }, wishes: { yard: 2 } });
  assert.ok(yard.lines.includes(again.tap()));
  assert.equal(again.tap(), yard.asks[1].ask);
});

test('from inside his shell he asks for nothing, and it does not count as asked', () => {
  const { page, tap, yard } = nest();
  // three quick pokes: he curls up instead of saying his wish
  tap(); // (the wish, said on the first tap)
  const shy = nest();
  shy.page.game.heroPokes = { room: 0, list: [200, 600] };
  assert.match(shy.tap(1000), /shell/);
  assert.equal(shy.page.game.hero.curl, true);
  assert.equal(shy.page.wishTold('yard'), false);
  assert.equal(shy.tap(), yard.asks[0].ask);
  assert.equal(page.wishTold('yard'), true);
});

test('in Ukrainian: every word of the errands has its own, and Fennel keeps his name', () => {
  const page = {
    location: { pathname: '/' }, addEventListener: () => {}, navigator: { languages: [] }, NodeFilter: { SHOW_TEXT: 4 },
    localStorage: { getItem: k => k === 'hatchstone.lang' ? 'uk' : null, setItem: () => {} },
    document: { documentElement: {}, body: {}, title: '', createTreeWalker: () => ({ nextNode: () => null }), querySelectorAll: () => [] },
  };
  vm.runInNewContext(read('i18n.js') + '\nObject.assign(this, { tr, UK });', page);
  const { yard } = nest();
  const faq = ui.match(/\["How does the garden work\?", "((?:[^"\\]|\\.)+)"\]/);
  assert.ok(faq && /one small wish at a time/.test(faq[1]), 'the help should say a word about Fennel\'s wishes');
  const said = [yard.thanks, yard.calm, ...yard.asks.flatMap(a => [a.ask, a.wish, a.btn, a.story, a.gift[0], ...(a.found ? [a.found] : [])]), faq[1].replace(/\\(.)/g, '$1')];
  for (const s of said) {
    assert.equal(typeof page.UK[s], 'string', `no Ukrainian for: ${s}`);
    assert.doesNotMatch(page.UK[s], /Фенхел/, s);
    assert.doesNotMatch(page.UK[s], /[A-Za-z]{3}/, s);
  }
  for (const a of yard.asks) {
    assert.match(page.UK[a.wish], /^Феннел /);
    assert.match(page.UK[a.btn], /Феннел/);
    assert.ok(page.UK[a.story].split(/\s+/).length <= 25, page.UK[a.story]);
  }
  // the harebell is a дзвоник, as it is on the walks
  assert.match(page.UK[yard.asks[0].btn], /дзвоник/);
  assert.match(page.tr(yard.thanks, page.tr(yard.asks[0].gift[0])), /^Від Феннела: Насіння/);
});
