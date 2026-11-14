const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sparkSaveOf } = require('../js/sparks.js');
const { coreSaveOf } = require('../js/inner.js');
const { KEEPSAKES, KEEP_WEAR, walkSaveOf } = require('../js/walk.js');
const { wardSaveOf } = require('../js/wards.js');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// scenes.js and crack.js need the whole game around them, so only the niches are run here: the crystals as they are in
// data.js, the level's stone, the star niches' section of scenes.js, the lines of newEgg that decide the crystal and name
// the egg, and the lines of showFound that write the stars and the card's buttons, in the order they stand there
const scenes = read('scenes.js'), crack = read('crack.js'), ui = read('ui.js'), saveJs = read('save.js');
const found = cut(crack, 'function showFound() {', '\n}\n', 'showFound should sit in crack.js');
const nicheSrc = cut(scenes, '// ---------- star niches', '\n}\n', 'the star niches should sit in scenes.js, in a section of their own')
  + cut(scenes.slice(scenes.indexOf('// ---------- star niches')), '\n}\n', '\nfunction heartFound(', 'the niches\' section should end with heartFound')
  + cut(scenes, '\nfunction heartFound(', '\n}\n', 'heartFound should close the niches\' section') + '\n}';
const src = [
  read('data.js'),
  line(read('core.js'), /^const pick = .*$/m, 'pick should be one line in core.js'),
  cut(read('pixel.js'), 'function levelConf(', '\n}\n', 'levelConf should sit in pixel.js') + '\n}',
  line(saveJs, /^const unlocked = .*$/m, 'unlocked should be one line in save.js'),
  nicheSrc,
  'function newEgg(conf) {',
  line(crack, /^  const r = Math\.random\(\);$/m, 'newEgg should roll its rarity first'),
  line(crack, /^  const rarity = .*$/m, 'newEgg should name its rarity in one line'),
  line(crack, /^  const crystal = .*$/m, 'newEgg should choose its crystal in one line'),
  '  eggs.push(game.egg = { conf, crystal, hp: conf.hp, stone: conf.gloom ? "gloom" : "plain", taps: 0 });',
  line(crack, /^  \$\("lvlPill"\)\.textContent = .*$/m, 'newEgg should name the egg on its pill in one line'),
  '}',
  // the egg cracked open in so many stars, as showFound has it
  'function openEgg(stars) {',
  '  const conf = game.egg.conf;',
  line(found, /^  if \(!conf\.wander\) save\.stars\[conf\.n\] = .*$/m, 'showFound should write a level\'s stars in one line, never a wandering egg\'s'),
  line(found, /^  \$\("foundMap"\)\.hidden = .*$/m, 'showFound should show or hide the map button in one line'),
  line(found, /^  \$\("nextLvl"\)\.textContent = .*$/m, 'showFound should word the next button in one line'),
  line(found, /^  if \(conf\.heart\) heartFound\(conf\);$/m, 'showFound should hand a heart geode to heartFound'),
  '}',
  'Object.assign(this, { CRYSTALS, CRYSTAL, SPECIES, CAVES, CAVE_STONES, levelConf, unlocked, NICHE_STARS, caveStars, nicheState, heartCrystal, nicheRow, tapNiche, startHeart, heartFound, newEgg, openEgg });',
].join('\n');

const fill = (s, ...a) => a.length ? s.replace(/\{(\d)\}/g, (_, i) => a[i]) : s;
/** A stream of numbers that is the same every time. */
function stream(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/** The map over a pretend nest: a lantern with drops to count, the eggs that get started, and everything said along the way. */
function caves(save = {}, room = null) {
  const did = { rolls: 0, burnt: 0, saved: 0, scenes: [], eggs: [], refit: 0, hints: [], toasts: [], talks: [], sheets: [], ended: [] };
  const els = {};
  const page = {
    LANG: 'en', LEVELS: 24, eggs: did.eggs, coopSession: room,
    Math: Object.assign(Object.create(Math), { random: () => { did.rolls++; return 0.5; } }),
    save: { stars: {}, seen: {}, geodes: {}, oil: { n: 5, t: 0 }, shards: 30, ...save }, game: {},
    tr: fill, $: id => els[id] || (els[id] = { textContent: '', hidden: false }), sfx: { tick: () => {} },
    toast: s => did.toasts.push(s), talk: (...a) => did.talks.push(a), show: (...a) => did.sheets.push(a),
    persist: () => { did.saved++; }, setHint: s => did.hints.push(s), setScene: s => did.scenes.push(s),
    burnOil: () => { did.burnt++; return true; }, refitEgg: () => { did.refit++; },
    coopEnd: (...a) => { did.ended.push([...a, did.eggs.length]); page.coopSession = null; }, coopIsHost: () => false,
    rollCrystal: () => { throw new Error('a heart geode\'s crystal is never rolled'); },
    caveShell: k => 'shell-' + k,
  };
  vm.runInNewContext(src, page);
  return { page, did, save: page.save, el: id => page.$(id) };
}
/** Stars on the six levels of cave k, given as six numbers. */
const starsIn = (k, six) => Object.fromEntries(six.map((s, j) => [k * 6 + j + 1, s]).filter(([, s]) => s));
const book = (g, ids, count = 1) => Object.fromEntries(ids.map(id => [id, { count }]));
const plain = v => JSON.parse(JSON.stringify(v));

const g = caves().page;
const RANK = { common: 0, rare: 1, legendary: 2 };
const home = k => g.CRYSTALS.filter(c => c.cave === k);

test('a cave counts the stars of its own six levels and no others', () => {
  const m = caves({ stars: { 1: 3, 6: 2, 7: 3, 12: 1, 24: 3, heart: 3, moon: 3 } });
  assert.deepEqual([0, 1, 2, 3].map(m.page.caveStars), [5, 4, 0, 3]);
  assert.deepEqual([0, 1, 2, 3].map(caves().page.caveStars), [0, 0, 0, 0]);
  assert.equal(caves({ stars: starsIn(2, [3, 3, 3, 3, 3, 3]) }).page.caveStars(2), 18);
  // there are four caves of six levels, and a niche can be opened in each
  assert.equal(g.CAVES.length * 6, 24);
  assert.deepEqual(plain(g.NICHE_STARS), [12, 18]);
});

test('the first niche opens at 12 of a cave\'s stars and the second at 18', () => {
  const states = six => { const m = caves({ stars: starsIn(1, six) }); return [0, 1].map(i => m.page.nicheState(1, i)); };
  assert.deepEqual(states([0, 0, 0, 0, 0, 0]), ['sealed', 'sealed']);
  assert.deepEqual(states([3, 3, 3, 2, 0, 0]), ['sealed', 'sealed']); // 11
  assert.deepEqual(states([3, 3, 3, 3, 0, 0]), ['open', 'sealed']);   // 12
  assert.deepEqual(states([3, 3, 3, 3, 3, 2]), ['open', 'sealed']);   // 17
  assert.deepEqual(states([3, 3, 3, 3, 3, 3]), ['open', 'open']);     // 18
  // another cave's stars open nothing here
  const far = caves({ stars: starsIn(0, [3, 3, 3, 3, 3, 3]) });
  assert.deepEqual([0, 1].map(i => far.page.nicheState(1, i)), ['sealed', 'sealed']);
  assert.deepEqual([0, 1].map(i => far.page.nicheState(0, i)), ['open', 'open']);
});

test('a niche says plainly how many stars it has and how many it needs', () => {
  const sealed = caves({ stars: starsIn(0, [2, 1, 1, 2, 1, 0]) }).page.nicheRow(0);
  assert.match(sealed, /class="niche sealed" data-niche="0,0"[^>]*>.*★ 7 \/ 12.*star niche/);
  assert.match(sealed, /class="niche sealed" data-niche="0,1"[^>]*>.*★ 7 \/ 18.*star niche/);
  assert.match(sealed, /aria-label="Star niche, sealed: 7 of 12 stars"/);
  const half = caves({ stars: starsIn(0, [3, 3, 2, 2, 2, 2]) }).page.nicheRow(0);
  assert.match(half, /class="niche open" data-niche="0,0"[^>]*>.*<img src="shell-0".*heart geode.*tap to open/);
  assert.match(half, /class="niche sealed" data-niche="0,1"[^>]*>.*★ 14 \/ 18/);
  const done = caves({ stars: starsIn(0, [3, 3, 3, 3, 3, 3]), caches: { 0: [true, true] } }).page.nicheRow(0);
  assert.equal((done.match(/class="niche empty"/g) || []).length, 2);
  assert.match(done, /★ 12.*opened.*★ 18.*opened/);
  assert.doesNotMatch(done, /<img/);
  // every niche is a button with its place on it, in every state
  for (const html of [sealed, half, done]) assert.equal((html.match(/<button class="niche \w+" data-niche="0,[01]" aria-label="[^"]+">/g) || []).length, 2);
});

test('the first niche holds the commonest crystal of the cave the Book lacks, the second the rarest', () => {
  for (let k = 0; k < g.CAVES.length; k++) {
    const m = caves(), first = m.page.heartCrystal(k, 0), second = m.page.heartCrystal(k, 1);
    assert.equal(first.cave, k); assert.equal(second.cave, k);
    assert.equal(first.rarity, 'common', `${g.CAVES[k]}: the first niche starts with a common crystal`);
    assert.equal(RANK[second.rarity], Math.max(...home(k).map(c => RANK[c.rarity])), `${g.CAVES[k]}: the second niche starts with the rarest`);
    assert.notEqual(first.id, second.id);
    // with the common ones found, the first niche moves on to a rare one, never to one already in the Book
    const commons = home(k).filter(c => c.rarity === 'common').map(c => c.id);
    const next = caves({ geodes: book(g, commons) }).page.heartCrystal(k, 0);
    assert.equal(next.cave, k); assert.equal(next.rarity, 'rare');
    // with all but one found, both niches hold that one
    for (const last of home(k)) {
      const one = caves({ geodes: book(g, home(k).filter(c => c !== last).map(c => c.id)) });
      assert.equal(one.page.heartCrystal(k, 0).id, last.id);
      assert.equal(one.page.heartCrystal(k, 1).id, last.id);
    }
  }
});

test('with the cave\'s own all found, a heart geode holds the rarest crystal the Book lacks anywhere', () => {
  for (let k = 0; k < g.CAVES.length; k++) {
    const mine = home(k).map(c => c.id);
    for (const i of [0, 1]) {
      const c = caves({ geodes: book(g, mine) }).page.heartCrystal(k, i);
      assert.notEqual(c.cave, k);
      assert.equal(c.rarity, 'legendary', 'a legendary one is still missing somewhere');
      // only one left in the whole Book: that one, wherever it lives
      const last = g.CRYSTALS.find(x => x.cave !== k && x.rarity === 'common');
      const all = g.CRYSTALS.filter(x => x !== last).map(x => x.id);
      assert.equal(caves({ geodes: book(g, all) }).page.heartCrystal(k, i).id, last.id);
    }
  }
});

test('with the Book full, a heart geode holds a rare or better crystal of its own cave', () => {
  const all = g.CRYSTALS.map(c => c.id);
  for (let k = 0; k < g.CAVES.length; k++) {
    const first = caves({ geodes: book(g, all) }).page.heartCrystal(k, 0), second = caves({ geodes: book(g, all) }).page.heartCrystal(k, 1);
    for (const c of [first, second]) { assert.equal(c.cave, k); assert.notEqual(c.rarity, 'common'); }
    assert.equal(RANK[second.rarity], Math.max(...home(k).map(c => RANK[c.rarity])), 'the second niche looks for the rarest first');
    // the one there are fewest of comes first
    const rares = home(k).filter(c => c.rarity !== 'common'), few = rares[rares.length - 1];
    const geodes = book(g, all, 5); geodes[few.id] = { count: 1 };
    assert.equal(caves({ geodes }).page.heartCrystal(k, 0).id, few.id);
  }
});

test('a heart geode always has a crystal, the same one for the same Book, and nothing is rolled for it', () => {
  const random = stream(7);
  for (let round = 0; round < 300; round++) {
    const have = g.CRYSTALS.filter(() => random() < round / 300).map(c => c.id);
    const m = caves({ geodes: book(g, have) });
    for (let k = 0; k < g.CAVES.length; k++) for (const i of [0, 1]) {
      const c = m.page.heartCrystal(k, i);
      assert.ok(c && g.CRYSTAL[c.id], 'a crystal of the game');
      assert.equal(m.page.heartCrystal(k, i).id, c.id);
      const lacksHome = home(k).some(x => !have.includes(x.id)), lacksAny = g.CRYSTALS.some(x => !have.includes(x.id));
      if (lacksHome) { assert.equal(c.cave, k); assert.ok(!have.includes(c.id), 'new to the Book while the cave has one that is'); }
      else if (lacksAny) assert.ok(!have.includes(c.id), 'new to the Book while anything is');
      else { assert.equal(c.cave, k); assert.notEqual(c.rarity, 'common'); }
      // every crystal holds a glowling that can hatch from it
      assert.ok(g.SPECIES.some(s => s.crystal === c.id && !s.moon));
    }
    assert.equal(m.did.rolls, 0);
    assert.equal(m.did.saved, 0);
  }
});

test('an open niche starts its heart geode: the cave\'s stone, no oil, no seal, no stars to earn', () => {
  for (let k = 0; k < g.CAVES.length; k++) for (const i of [0, 1]) {
    const stars = starsIn(k, [3, 3, 3, 3, 3, 3]);
    const m = caves({ stars: { ...stars } }), want = m.page.heartCrystal(k, i);
    m.page.tapNiche(k, i);
    assert.equal(m.did.eggs.length, 1);
    const egg = m.did.eggs[0], conf = egg.conf, last = g.levelConf(k * 6 + 6);
    assert.equal(egg.crystal.id, want.id);
    assert.equal(conf.chosen.id, want.id);
    assert.deepEqual(plain(conf.heart), { cave: k, i });
    assert.equal(conf.n, 'heart'); assert.equal(conf.wander, true);
    // as hard as the cave's last level, and no harder: the Gloom's seal is not on it
    assert.equal(egg.hp, last.hp); assert.equal(conf.cave, k); assert.equal(conf.step, last.step);
    for (const not of ['gloom', 'moon', 'coop', 'forced']) assert.equal(conf[not], undefined, `a heart geode is no ${not} egg`);
    assert.equal(egg.paid, undefined, 'nothing was paid, so nothing is given back for leaving');
    assert.equal(egg.stone, m.page.CAVE_STONES[want.cave]); assert.equal(m.did.refit, 1);
    assert.deepEqual(m.did.scenes, ['crack']);
    assert.equal(m.el('lvlPill').textContent, '♥');
    assert.deepEqual(m.did.hints, ['the cave\'s heart geode: a crystal new to your Book is inside']);
    // no lantern oil, no talk of the Gloom's, no sheet of three, nothing written
    assert.equal(m.did.burnt, 0); assert.deepEqual(plain(m.save.oil), { n: 5, t: 0 });
    assert.deepEqual(m.did.talks, []); assert.deepEqual(m.did.sheets, []); assert.deepEqual(m.did.toasts, []);
    assert.deepEqual(plain(m.save.stars), stars);
    assert.equal(m.save.caches, undefined); assert.equal(m.did.saved, 0);
  }
  // with the Book full the hint doesn't promise a new crystal
  const full = caves({ stars: starsIn(0, [3, 3, 3, 3, 0, 0]), geodes: book(g, g.CRYSTALS.map(c => c.id)) });
  full.page.tapNiche(0, 0);
  assert.deepEqual(full.did.hints, ['the cave\'s heart geode: something rare is inside']);
});

test('a sealed niche and an empty one start nothing and say why', () => {
  const m = caves({ stars: starsIn(0, [3, 3, 3, 2, 0, 0]) });
  m.page.tapNiche(0, 0); m.page.tapNiche(0, 1); m.page.startHeart(0, 0); m.page.startHeart(0, 1);
  assert.deepEqual(m.did.toasts, ['12 stars in this cave open the niche: a heart geode waits inside', '18 stars in this cave open the niche: a heart geode waits inside']);
  assert.deepEqual(m.did.eggs, []); assert.deepEqual(m.did.scenes, []);
  const done = caves({ stars: starsIn(0, [3, 3, 3, 3, 3, 3]), caches: { 0: [true, false] } });
  done.page.tapNiche(0, 0); done.page.startHeart(0, 0);
  assert.deepEqual(done.did.toasts, ['This niche is empty: its heart geode is already opened']);
  assert.deepEqual(done.did.eggs, []);
  // the other one is still there to open
  done.page.tapNiche(0, 1);
  assert.equal(done.did.eggs.length, 1);
});

test('leaving a heart geode midway keeps its niche open, with the same crystal inside', () => {
  const m = caves({ stars: starsIn(2, [3, 3, 3, 3, 3, 3]) });
  m.page.tapNiche(2, 1);
  const first = m.did.eggs[0].crystal.id;
  m.did.eggs[0].taps = 9;
  // (out to the map and back, any number of times)
  for (let again = 0; again < 3; again++) {
    assert.equal(m.page.nicheState(2, 1), 'open');
    assert.match(m.page.nicheRow(2), /class="niche open" data-niche="2,1"/);
    m.page.tapNiche(2, 1);
    assert.equal(m.did.eggs[m.did.eggs.length - 1].crystal.id, first);
  }
  assert.equal(m.save.caches, undefined);
  assert.deepEqual(plain(m.save.oil), { n: 5, t: 0 });
});

test('a niche is empty only once its heart geode is cracked open, and the card leads back to the grotto', () => {
  const stars = starsIn(1, [3, 3, 3, 3, 3, 3]);
  const m = caves({ stars: { ...stars } });
  const open = () => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].filter(m.page.unlocked);
  const before = open();
  m.page.tapNiche(1, 0);
  assert.equal(m.page.nicheState(1, 0), 'open');
  m.page.openEgg(3);
  assert.deepEqual(plain(m.save.caches), { 1: [true, false] });
  assert.equal(m.did.saved, 1);
  assert.equal(m.page.nicheState(1, 0), 'empty'); assert.equal(m.page.nicheState(1, 1), 'open');
  // the card: back to the grotto, as the moon egg's, with no second way to the map and no next level
  assert.equal(m.el('nextLvl').textContent, 'Back to the grotto');
  assert.equal(m.el('foundMap').hidden, true);
  // three stars on the card are the egg's own: none is written, no level opens
  assert.deepEqual(plain(m.save.stars), stars);
  assert.deepEqual(open(), before);
  assert.deepEqual(plain(m.save.oil), { n: 5, t: 0 }); assert.equal(m.did.burnt, 0); assert.deepEqual(m.did.talks, []);
  // the second one, and both are empty for good
  m.page.tapNiche(1, 1); m.page.openEgg(1);
  assert.deepEqual(plain(m.save.caches), { 1: [true, true] });
  assert.match(m.page.nicheRow(1), /niche empty.*niche empty/);
  assert.deepEqual(plain(m.save.stars), stars);
  // a level's egg still writes its stars and gets its own buttons
  m.page.newEgg({ ...g.levelConf(13), chosen: g.CRYSTALS[0] }); m.page.openEgg(2);
  assert.equal(m.save.stars[13], 2);
  assert.equal(m.el('foundMap').hidden, false); assert.equal(m.el('nextLvl').textContent, 'Next level');
  assert.deepEqual(plain(m.save.caches), { 1: [true, true] });
});

test('showFound hands over a heart geode after it has set the card, and the card\'s button goes to the map', () => {
  const at = s => { const i = found.indexOf(s); assert.ok(i >= 0, 'showFound should have: ' + s); return i; };
  const hook = at('if (conf.heart) heartFound(conf);');
  assert.ok(hook > at('$("foundMap").hidden = ') && hook > at('$("nextLvl").textContent = '), 'heartFound words the card\'s buttons, so it comes after showFound has');
  assert.ok(hook > at('const { isNew, note, mine } = adopt(e);'), 'the glowling is home before its niche is marked empty');
  assert.ok(hook < at('show("found", true);'));
  assert.equal(crack.split('conf.heart').length, 2, 'one line in crack.js knows about heart geodes');
  // the card's button: back to the map, never on to a level or another egg
  const next = cut(ui, '$("nextLvl").addEventListener("click"', '\n});', 'the next button should be wired in ui.js');
  assert.ok(next.indexOf('if (conf.moon || conf.heart) return setScene("map");') > 0 && next.indexOf('if (conf.moon || conf.heart) return setScene("map");') < next.indexOf('startLevel('));
  // its cave's own backdrop, not the deep caves' a wandering egg has
  assert.match(saveJs, /c\.wander && !c\.heart \? "labradorite"/);
});

test('a shared room is left before a heart geode of your own starts', () => {
  const m = caves({ stars: starsIn(0, [3, 3, 3, 3, 0, 0]) }, { code: 'ABCD' });
  m.page.tapNiche(0, 0);
  assert.deepEqual(m.did.ended, [['navigation', true, 0]], 'the room ends first, quietly, as it does for the Crack button');
  assert.equal(m.did.eggs.length, 1);
  assert.equal(m.did.eggs[0].conf.coop, undefined);
  // a sealed niche leaves the room alone
  const s = caves({}, { code: 'ABCD' });
  s.page.tapNiche(0, 0);
  assert.deepEqual(s.did.ended, []);
});

/** A save as it comes through the door: written to a pretend storage, then loaded the way the game loads it. */
function load(d) {
  const page = {
    SAVE_KEY: 'k', BAK_KEY: 'k.bak', localStorage: { getItem: k => k === 'k' && d ? JSON.stringify(d) : null, setItem: () => {} },
    sparkSaveOf, coreSaveOf, walkSaveOf, wardSaveOf, KEEP_WEAR, KS: Object.fromEntries(KEEPSAKES.map(k => [k.id, k])),
  };
  vm.runInNewContext(cut(saveJs, 'const SAVE_VERSION', 'const save = loadSave();', 'the save\'s way in should sit at the top of save.js') + '\nthis.loaded = loadSave(); this.migrate = migrate; this.freshSave = freshSave;', page);
  return { save: plain(page.loaded), migrate: page.migrate, freshSave: page.freshSave };
}

test('a save from before the niches has opened none: whichever its stars reach are simply open', () => {
  const old = load({ v: 1, stars: { ...starsIn(0, [3, 3, 3, 3, 3, 3]), ...starsIn(1, [3, 3, 2, 2, 2, 0]) }, creatures: [], seen: {} }).save;
  assert.deepEqual(old.caches, {});
  const m = caves(old);
  assert.deepEqual([[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 1]].map(([k, i]) => m.page.nicheState(k, i)), ['open', 'open', 'open', 'sealed', 'sealed', 'sealed']);
  // a brand new nest, too
  assert.deepEqual(load(null).save.caches, {});
});

test('the niches come through a save, a backup code and a broken field alike', () => {
  const nest = caches => ({ v: 1, stars: { 1: 3 }, creatures: [], seen: {}, ...(caches === undefined ? {} : { caches }) });
  assert.deepEqual(load(nest({ 0: [true, true], 2: [false, true] })).save.caches, { 0: [true, true], 2: [false, true] });
  // what isn't a plain yes is a no, what isn't a cave is dropped
  assert.deepEqual(load(nest({ 0: [1, 'yes'], 1: 'both', 2: [true], x: [true, true], 12: [true, true] })).save.caches, { 0: [false, false], 2: [true, false] });
  for (const broken of [null, 'all', 7, true, [], [[true, true]]]) assert.deepEqual(load(nest(broken)).save.caches, {});
  // a nest in a backup code goes the same way in (ui.js) and so does one adopted from another tab (save.js): through migrate, over a fresh save
  const { migrate, freshSave } = load(null);
  assert.deepEqual(plain(migrate(Object.assign(freshSave(), nest())).caches), {});
  assert.deepEqual(plain(migrate(Object.assign(freshSave(), nest({ 3: [true, false] }))).caches), { 3: [true, false] });
  assert.match(ui, /Object\.assign\(save, migrate\(Object\.assign\(freshSave\(\), data\)\)/);
  assert.match(cut(saveJs, 'function adoptSave(', '\n}\n', 'adoptSave should sit in save.js'), /migrate\(Object\.assign\(freshSave\(\), d\)\)/);
  // and what the game writes is what it reads
  const m = caves({ stars: starsIn(3, [3, 3, 3, 3, 3, 3]) });
  m.page.tapNiche(3, 1); m.page.openEgg(2);
  const back = load({ v: 1, creatures: [], seen: {}, ...plain(m.save) }).save;
  assert.deepEqual(back.caches, { 3: [false, true] });
  const again = caves(back);
  assert.equal(again.page.nicheState(3, 1), 'empty'); assert.equal(again.page.nicheState(3, 0), 'open');
});

test('in Ukrainian: every word of the niches has its own, and none of them says who the player is', () => {
  const page = {
    location: { pathname: '/' }, addEventListener: () => {}, navigator: { languages: [] }, NodeFilter: { SHOW_TEXT: 4 },
    localStorage: { getItem: k => k === 'hatchstone.lang' ? 'uk' : null, setItem: () => {} },
    document: { documentElement: {}, body: {}, title: '', createTreeWalker: () => ({ nextNode: () => null }), querySelectorAll: () => [] },
  };
  vm.runInNewContext(read('i18n.js') + '\nObject.assign(this, { tr, pl, UK });', page);
  const said = [...nicheSrc.matchAll(/tr\("((?:[^"\\]|\\.)+)"/g)].map(x => x[1]);
  assert.ok(said.length >= 11 && said.includes('heart geode') && said.includes('star niche') && said.includes('Back to the grotto'));
  for (const s of said) {
    assert.equal(typeof page.UK[s], 'string', `no Ukrainian for: ${s}`);
    assert.match(page.UK[s], /[а-яіїєґ]/, `Ukrainian for: ${s}`);
    // nothing in the past tense about the player (знайшов / знайшла, відкрив / відкрила)
    assert.doesNotMatch(page.UK[s], /(?:^|\s)(?:ти|ви)\s|\S(?:ив|ила|ав|ала|ов|ла)(?:\s|$|[.,:!])/, `gendered or addressed in the past: ${page.UK[s]}`);
  }
  // the niches as the map shows them, in Ukrainian
  const m = caves({ stars: starsIn(0, [3, 3, 2, 2, 2, 2]) });
  m.page.tr = page.tr;
  const row = m.page.nicheRow(0);
  assert.match(row, /серце печери.*відкрий/); assert.match(row, /★ 14 \/ 18.*зоряна схованка/);
  assert.match(row, /aria-label="Зоряна схованка запечатана: зірок 14 з 18"/);
  m.page.tapNiche(0, 1);
  assert.deepEqual(m.did.toasts, ['18 зірок у цій печері відкриють схованку: всередині чекає серце печери']);
  m.page.tapNiche(0, 0);
  assert.deepEqual(m.did.hints, ['серце печери: у цій жеоді кристал, якого ще немає в Книзі']);
  // the question about stars tells of the niches, in both languages
  const faq = line(ui, /Stars also open the star niches on the map: 12 stars in a cave open its first niche and 18 the second[^"]*/, 'the FAQ answer about stars should tell of the niches');
  const whole = Object.keys(page.UK).find(k => k.endsWith(faq));
  assert.ok(whole, 'the answer about stars has its Ukrainian');
  assert.match(page.UK[whole], /зоряні схованки.*12 зірок.*18.*жеода/);
});
