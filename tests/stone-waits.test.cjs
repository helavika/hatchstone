const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// The stone that waits (scenes.js): an egg left mid-crack is kept in the save and picked up again from the map. Run here
// over the real blow (crackHit and what it pays, as tests/bands.test.cjs has them), startLevel and its oil, the quit
// button's handler as ui.js has it and setScene's line that notices an egg left before it opened, over a pretend grotto.
const crack = read('crack.js'), scenes = read('scenes.js'), ui = read('ui.js');
const hit = cut(crack, '\nfunction hitEgg(', '\n}\n', 'hitEgg should sit in crack.js');
const src = [
  // (core.js but its $ and $$: the pretend grotto has buttons of its own)
  read('core.js').replace(/^const \$\$? = .*$/gm, ''),
  'const LEVELS = 24;',
  cut(read('pixel.js'), 'function levelConf(', '\n}\n', 'levelConf should sit in pixel.js') + '\n}',
  cut(read('save.js'), 'function eggPoly(', '\n}\n', 'eggPoly should sit in save.js') + '\n}',
  line(crack, /^const EGG_R = .*$/m, 'the egg\'s height should be one line in crack.js'),
  line(crack, /^const EGG_UNIT = .*$/m, 'the egg\'s outline should be one line in crack.js'),
  cut(crack, '/** The rest of a crack network:', '/** Draw what\'s new on the shell:', 'crackHit should follow nearSeg in crack.js'),
  cut(crack, '// ---------- what a blow pays ----------', '/** A tap on the egg:', 'what a blow pays should sit just before hitEgg'),
  'function tap(e, hit) {',
  line(hit, /^  e\.hits\.push\(hit\);$/m, 'hitEgg should keep every hit'),
  line(hit, /^  const res = crackHit\(.*$/m, 'hitEgg should crack the egg in one line').replace('power', 'hit[2]'),
  line(hit, /^  e\.taps\+\+;$/m, 'hitEgg should count the tap'),
  line(hit, /^  if \(res\.crit\) e\.crits\+\+;$/m, 'hitEgg should count a hit on the weak spot'),
  line(hit, /^  const gems = blowPay\(.*$/m, 'hitEgg should pay for the blow in one line'),
  line(hit, /^  e\.gems \+= gems;$/m, 'hitEgg should keep the shards'),
  '}',
  'const forgeLvl = () => 0, buddyCatch = () => false;',
  line(scenes, /^const tripCosts = .*$/m, 'tripCosts should be one line in scenes.js'),
  cut(scenes, 'function startLevel(', '\n}\n', 'startLevel should sit in scenes.js') + '\n}',
  cut(scenes, '// ---------- the stone that waits', '/** Where the six levels of a chapter sit', 'the stone that waits should have a section of its own in scenes.js, before the map'),
  'function setScene(scene) {',
  '  const wasCrack = game.scene === "crack";',
  line(scenes, /^  if \(wasCrack && scene !== "crack" && game\.egg\?\.state === "cracking".*$/m, 'setScene should notice an egg left mid-crack in one line'),
  '  did.scenes.push(scene); game.scene = scene;',
  '}',
  // the quit button and the confirm's Leave, as ui.js wires them
  cut(ui, '$("quit").addEventListener("click", ', '$("nextLvl")', 'the quit button and the confirm should sit together in ui.js'),
  'Object.assign(this, { EGG_R, levelConf, tap, aimShare, startLevel, setScene, stoneOf, stoneOk, stoneWaits, stoneKeeps, leaveWords, stoneHome, netOut, netIn });',
].join('\n');

const plain = x => JSON.parse(JSON.stringify(x));
const STONES = [['#8d8a91', '#5f5c66', '#b7b3bb'], ['#d8cdb8', '#a89c86', '#eee6d6']];
const GLOOM_STONE = Object.assign(['#3a2a52', '#1a1028', '#6b4fa8'], { gloom: true });

/** A pretend grotto: a lantern with drops, buttons that remember their handlers, and the eggs newEgg lays (each rolled
 *  afresh: a new seed, a new weak spot, a crystal of its own, so a resumed stone that weren't kept would show it). */
function grotto(save = {}) {
  const did = { scenes: [], eggs: [], burnt: 0, fell: 0, talks: [], shown: {}, persisted: 0, ticks: 0 };
  const els = {}, el = id => els[id] || (els[id] = { id, textContent: '', on: {}, addEventListener(k, f) { this.on[k] = f; } });
  let rolls = 0;
  const page = {
    did, STONES, GLOOM_STONE, LANG: 'en',
    CRYSTAL: { amethyst: { id: 'amethyst' }, quartz: { id: 'quartz' }, celestite: { id: 'celestite' } },
    SP: { violetling: { id: 'violetling' }, frostkin: { id: 'frostkin' } },
    save: { stars: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 }, oil: { n: 5 }, habit: { day: {}, fell: false }, ...save },
    game: { scene: 'map', coopTouched: false }, coopSession: null, TALKS: {}, MOSSA: { name: 'Mossa' },
    $: el, show: (id, on) => { did.shown[id] = on; }, tr: (s, ...a) => a.length ? s.replace(/\{(\d)\}/g, (_, i) => a[i]) : s,
    sfx: { tick: () => did.ticks++ }, persist: () => did.persisted++, updateTopbar: () => {}, setHint: () => {},
    talk: id => { did.talks.push([id, page.TALKS[id] && page.TALKS[id]()]); return true; }, talkLines: () => 0, habitDay: () => '2026-11-16',
    oilNow: () => page.save.oil.n, barFor: () => null, useBar: () => {}, openLantern: () => {},
    burnOil: () => page.save.oil.n >= 1 ? (page.save.oil.n--, did.burnt++, true) : false,
    habitFell: () => { did.fell++; page.save.habit.fell = true; }, coopEnd: () => {},
    replays: () => false, bookCrystal: () => null,
    refitEgg: e => { e.refit = (e.refit || 0) + 1; }, updateDots: () => {}, updateEye: () => {},
    newEgg: (conf, animate) => {
      const k = rolls++;
      did.eggs.push([conf.n, animate]);
      page.game.egg = { conf, crystal: conf.chosen || page.CRYSTAL[['quartz', 'celestite'][k % 2]], species: page.SP[['frostkin', 'violetling'][k % 2]],
        stone: STONES[k % 2], shiny: false, state: animate ? 'entering' : 'cracking', t: 0, hp: conf.hp, damage: 0, taps: 0, crits: 0, search: 0, gems: 0,
        combo: 0, chain: 0, owed: 0, hits: [], seed: 'seed-' + k, net: { segs: [], tips: [] }, spot: [0.3 + k * 0.07, 0.5 + k * 0.03], eyeLeft: 1,
        bands: 0, banded: 0, silent: !!conf.silent, sheen: false, shade: false, patches: [], shadeLaid: 0 };
    },
  };
  vm.runInNewContext(src, page);
  return { page, did, save: page.save, game: page.game, els };
}
/** Into a level, through the egg's drop-in, and a few taps: on the weak spot, beside it, far off. */
function crackSome(g, n, taps = [[0, 0], [0.02, -0.01], [0.25, 0.2], [0, 0.01], [-0.2, 0.15]]) {
  g.page.startLevel(n);
  const e = g.game.egg;
  e.state = 'cracking';
  for (const [du, dv] of taps) g.page.tap(e, [e.spot[0] + du, (e.spot[1] + dv) / g.page.EGG_R, 1]);
  return e;
}
const quit = g => { g.els.quit.on.click(); if (g.did.shown.confirmLeave) { g.did.shown.confirmLeave = false; g.els.leaveEgg.on.click(); } };
/** What the blows have done to an egg, to compare two eggs by (the spokes shared between the tips and the impacts included). */
const state = e => plain({ n: e.conf.n, crystal: e.crystal.id, species: e.species.id, stone: [...e.stone], seed: e.seed, spot: e.spot, hp: e.hp, damage: e.damage,
  taps: e.taps, crits: e.crits, search: e.search, found: e.found, gems: e.gems, combo: e.combo, chain: e.chain, owed: e.owed, hits: e.hits, eyeLeft: e.eyeLeft,
  bands: e.bands, aim: null, net: { segs: e.net.segs, tips: e.net.tips, impacts: e.net.impacts, dents: e.net.dents } });

test('leaving after a few taps, through the confirm, keeps that very stone in the save', () => {
  const g = grotto();
  const e = crackSome(g, 8);
  quit(g);
  assert.equal(g.els.leaveSays.textContent, 'This stone will wait for you on the map, cracks and all.');
  assert.deepEqual(g.did.scenes.slice(-1), ['map']);
  const s = g.save.left;
  assert.ok(s && g.page.stoneOk(s), 'the stone is in the save');
  assert.equal(s.n, 8);
  assert.equal(s.crystal, e.crystal.id); assert.equal(s.species, e.species.id); assert.equal(s.seed, e.seed);
  assert.equal(s.taps, 5); assert.equal(s.damage, e.damage); assert.ok(s.net.segs.length > 10, 'with its cracks');
  // plain data, so it goes into the save file as it is, and later blows on the egg don't change it
  assert.equal(JSON.stringify(plain(s)), JSON.stringify(s));
  assert.ok(g.page.stoneWaits(8)); assert.ok(!g.page.stoneWaits(7));
  assert.equal(g.did.fell, 1, 'and going back to it still counts as going back to the stone');
});

test('starting that level again picks the same stone up exactly where it was, for no oil, and the next blow lands as it would have', () => {
  const g = grotto();
  const e = crackSome(g, 8);
  const before = state(e), aim = g.page.aimShare(e), oil = g.save.oil.n, burnt = g.did.burnt;
  // the original, left on the side: it is what the stone would have become with one more blow
  const twin = g.page.netIn(g.page.netOut(e.net));
  const go = { ...e, net: twin, hits: plain(e.hits), spot: e.spot.slice(), patches: [] };
  quit(g);
  g.game.egg = null;
  g.page.startLevel(8);
  const r = g.game.egg;
  assert.equal(g.save.oil.n, oil, 'no oil for the way back'); assert.equal(g.did.burnt, burnt);
  assert.deepEqual(g.did.eggs.slice(-1), [[8, false]], 'laid out without rolling a sunpetal or a new note');
  assert.equal(r.state, 'entering', 'it still drops in like any egg');
  assert.ok(r.waited);
  assert.ok(r.refit >= 1, 'its shell is painted again, with the cracks on it');
  assert.deepEqual(state(r), before, 'damage, cracks, aim and the weak spot are all as they were');
  assert.equal(g.page.aimShare(r), aim);
  assert.equal(r.paid, true, 'the trip it began with was paid once');
  // a spoke is still one and the same in the live tips and in its impact's rays
  for (const m of r.net.impacts) for (const t of m.rays) if (!t.dead) assert.ok(r.net.tips.includes(t));
  // one more blow on each: the same new cracks, the same damage
  r.state = 'cracking';
  const blow = [e.spot[0] + 0.01, e.spot[1] / g.page.EGG_R, 1];
  g.page.tap(r, blow.slice()); g.page.tap(go, blow.slice());
  assert.deepEqual(plain(r.net.segs), plain(go.net.segs));
  assert.equal(r.damage, go.damage); assert.equal(r.gems, go.gems); assert.equal(r.chain, go.chain);
  // and Mossa notices, in one line, today
  assert.equal(g.did.talks.length, 1);
  const [id, lines] = g.did.talks[0];
  assert.equal(id, 'stone-2026-11-16'); assert.equal(lines.length, 1); assert.equal(lines[0][0].name, 'Mossa');
});

test('the stone is never duplicated: it waits until it opens, and opening it counts as going back to the stone', () => {
  const g = grotto();
  crackSome(g, 8);
  quit(g);
  g.page.startLevel(8);
  assert.equal(g.did.eggs.length, 2);
  // quit again before the egg has landed: the stone still waits as it was (no new one, no refund)
  const kept = plain(g.save.left), oil = g.save.oil.n;
  quit(g);
  assert.deepEqual(plain(g.save.left), kept); assert.equal(g.save.oil.n, oil);
  // again, and this time with a blow more: the save keeps the newer one, still one stone
  g.page.startLevel(8);
  g.game.egg.state = 'cracking';
  g.page.tap(g.game.egg, [0.5, 0.5, 1]);
  quit(g);
  assert.equal(g.save.left.taps, kept.taps + 1);
  g.page.startLevel(8);
  g.save.habit.fell = false;
  g.page.stoneHome();
  assert.equal(g.save.left, undefined, 'opened: it no longer waits');
  assert.equal(g.save.habit.fell, true, 'so habitTried gives the "back to the stone" keeper XP, once a day as ever');
  // the next trip to that level is a new geode, paid as usual
  const burnt = g.did.burnt;
  g.page.startLevel(8);
  assert.deepEqual(g.did.eggs.slice(-1), [[8, true]]); assert.equal(g.did.burnt, burnt + 1);
});

test('one stone waits at a time: leaving another takes its place, and the confirm says so first', () => {
  const g = grotto();
  crackSome(g, 8);
  quit(g);
  crackSome(g, 7);
  g.els.quit.on.click();
  assert.equal(g.els.leaveSays.textContent, 'This stone will wait for you on the map, cracks and all. The stone waiting on level 8 goes back to the rock.');
  g.els.keepCracking.on.click();
  assert.equal(g.save.left.n, 8, 'still cracking: nothing has changed yet');
  quit(g);
  assert.equal(g.save.left.n, 7);
  assert.ok(g.page.stoneWaits(7)); assert.ok(!g.page.stoneWaits(8));
  // Wander keeps one too, under its own words
  const w = grotto({ stars: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, 3])) });
  crackSome(w, 0);
  quit(w);
  assert.ok(w.page.stoneWaits(0));
  crackSome(w, 5);
  w.els.quit.on.click();
  assert.match(w.els.leaveSays.textContent, /The stone waiting in Wander goes back to the rock\.$/);
});

test('quitting before the first tap gives the drop back and keeps nothing', () => {
  const g = grotto();
  g.page.startLevel(8);
  g.game.egg.state = 'cracking';
  assert.equal(g.save.oil.n, 4);
  g.els.quit.on.click();
  assert.ok(!g.did.shown.confirmLeave, 'no confirm: nothing to lose');
  assert.equal(g.save.oil.n, 5, 'the drop is back');
  assert.equal(g.save.left, undefined);
  assert.equal(g.did.fell, 0);
});

test('a moon egg, a heart geode and a shared egg aren\'t kept, and their confirm says the cracks are lost', () => {
  const { page } = grotto();
  for (const conf of [{ n: 'moon', moon: true, wander: true }, { n: 'heart', wander: true, heart: { cave: 0, i: 0 } }, { n: 0, coop: true }]) {
    assert.equal(page.stoneKeeps(conf), false, JSON.stringify(conf));
    assert.equal(page.leaveWords({ conf }), 'The cracks you\'ve made so far will be lost.');
  }
  assert.ok(page.stoneKeeps(page.levelConf(0)), 'Wander');
  for (let n = 1; n <= 24; n++) assert.ok(page.stoneKeeps(page.levelConf(n)), `level ${n}`);
  const g = grotto();
  crackSome(g, 8);
  g.game.egg.conf = { ...g.game.egg.conf, n: 'moon', moon: true };
  quit(g);
  assert.equal(g.save.left, undefined);
});

test('a stone the save can\'t vouch for is dropped, and the level starts afresh', () => {
  const g = grotto();
  g.save.left = { n: 8, conf: {}, crystal: 'nope', species: 'violetling', taps: 2, damage: 1, hp: 9 };
  assert.ok(!g.page.stoneWaits(8));
  g.page.startLevel(8);
  assert.equal(g.save.left, undefined);
  assert.deepEqual(g.did.eggs, [[8, true]]);
  assert.equal(g.save.oil.n, 4);
});

test('the map marks the level with the waiting stone, and its words have their Ukrainian', () => {
  const map = cut(scenes, 'function renderMap(', '\n}\n', 'renderMap should sit in scenes.js');
  assert.match(map, /const waits = open && stoneWaits\(n\);/);
  assert.match(map, /\$\{waits \? ic\("stoneWait", "wait"\) : ""\}/);
  assert.match(map, /stoneWaits\(0\) \? ic\("stoneWait", "wait"\)/, 'and the Wander button');
  const icon = line(read('pixel.js'), /^  stoneWait: \[.*$/m, 'the waiting stone is a pixel icon in pixel.js');
  const rows = JSON.parse(icon.trim().replace(/^stoneWait: /, '').replace(/,$/, ''));
  assert.equal(rows.length, 12); for (const r of rows) assert.equal(r.length, 12);
  assert.match(fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8'), /id="leaveSays"/);
  const uk = read('i18n.js');
  for (const s of ['This stone will wait for you on the map, cracks and all.', 'The stone waiting on level {0} goes back to the rock.', 'The stone waiting in Wander goes back to the rock.',
    'Level {0}: your stone waits here', 'Your stone waited. Stones are good at that.'])
    assert.match(uk, new RegExp(`^  ${JSON.stringify(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: "[^"]*[а-яіїєґ][^"]*",$`, 'm'), s);
  // the opened stone is let go where the found card counts the egg, before habitTried looks
  assert.match(crack, /if \(e\.waited\) stoneHome\(\); habitTried\(\);/);
});
