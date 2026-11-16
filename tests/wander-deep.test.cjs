const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sparkSaveOf } = require('../js/sparks.js');
const { keeperMigrate } = require('../js/inner.js');
const { KEEPSAKES, KEEP_WEAR, walkSaveOf } = require('../js/walk.js');
const { wardSaveOf } = require('../js/wards.js');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };
const plain = x => JSON.parse(JSON.stringify(x));

// Wander goes deeper (#236): every geode opened there is one step down, the stone hardens a little with each step, and every
// fifth step is a pocket with a rare stone or better under one of the caves' rules. Run here: levelConf and the descent as
// pixel.js has them, the home caves' section of scenes.js through the descent (startLevel, the stone that waits, the
// picker), the lines of newEgg that lay the cave rules and roll the rarity, and showFound's line that takes the step down.
const pixel = read('pixel.js'), scenes = read('scenes.js'), crack = read('crack.js'), saveJs = read('save.js');
const found = cut(crack, 'function showFound() {', '\n}\n', 'showFound should sit in crack.js');
const egg = cut(crack, '\nfunction newEgg(', '\n}\n', 'newEgg should sit in crack.js');
const src = [
  read('data.js'),
  line(read('core.js'), /^const pick = .*$/m, 'pick should be one line in core.js'),
  cut(pixel, 'function levelConf(', '\n}\n', 'levelConf should sit in pixel.js') + '\n}',
  cut(pixel, '// ---------- Wander goes deeper', 'function depthConf(', 'the descent should sit in pixel.js, after levelConf') + cut(pixel, 'function depthConf(', '\n}\n', 'depthConf should close it') + '\n}',
  line(crack, /^const BANDS = .*$/m, 'how many bands a banded stone has should be one line in crack.js'),
  line(scenes, /^const tripCosts = .*$/m, 'tripCosts should be one line in scenes.js'),
  cut(scenes, '// ---------- home caves ----------', '/** Where the six levels of a chapter sit', 'the home caves, the stone that waits and the descent should run up to the map in scenes.js'),
  'function newEgg(conf) {',
  line(egg, /^  const r = Math\.random\(\);$/m, 'newEgg should roll its rarity first'),
  line(egg, /^  const rarity = .*$/m, 'newEgg should name its rarity in one line'),
  line(egg, /^  const crystal = .*$/m, 'newEgg should choose its crystal in one line'),
  '  eggs.push(game.egg = { conf, crystal, stone: "plain",',
  line(egg, /^    bands: .*$/m, 'newEgg should band its stone in one line'),
  line(egg, /^    silent: .*$/m, 'newEgg should silence its stone in one line'),
  line(egg, /^    sheen: .*$/m, 'newEgg should give its stone the flash in one line'),
  '  });',
  line(egg, /^  \$\("lvlPill"\)\.textContent = .*$/m, 'newEgg should name the egg on its pill in one line'),
  '}',
  // the egg opens, as showFound has it
  'function openEgg() {',
  '  const conf = game.egg.conf;',
  line(found, /^  if \(conf\.depth && !conf\.coop\) wanderDown\(conf\.depth\);$/m, 'showFound should take the step down in one line'),
  '}',
  'Object.assign(this, { CRYSTAL, levelConf, depthConf, depthHp, isPocket, pocketRule, POCKET_EVERY, POCKET_RULES, DEPTH_HP_CAP, DEPTH_FLAT,',
  '  startLevel, newEgg, openEgg, wanderDown, wanderStep, depthChoices, pickDepth, wanderButton, stoneLeave, POCKET_HINTS });',
].join('\n');

/** A stream of numbers that is the same every time. */
function stream(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/** Wander over a pretend nest that has cleared all 24 levels: a lantern, the eggs that start, what's said, and the map's words. */
function deep(save = {}, random = stream()) {
  const did = { burnt: 0, scenes: [], eggs: [], hints: [], talks: [], maps: 0, persisted: 0, els: {} };
  const page = {
    LANG: 'en', LEVELS: 24, eggs: did.eggs, coopSession: null,
    Math: Object.assign(Object.create(Math), { random: () => random() }),
    save: { stars: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, 1])), seen: {}, geodes: {}, oil: { n: 5 }, habit: { day: {} }, depth: { at: 1, best: 0 }, ...save },
    game: { coopTouched: false },
    tr: (s, ...a) => a.length ? s.replace(/\{(\d)\}/g, (_, i) => a[i]) : s, ic: (name, cls) => `<i ${name} ${cls}>`,
    $: id => did.els[id] || (did.els[id] = { textContent: '' }),
    sfx: { tick: () => {} }, persist: () => did.persisted++, renderMap: () => did.maps++, updateTopbar: () => {},
    talk: id => did.talks.push(id), setHint: s => did.hints.push(s),
    burnOil: () => page.save.oil.n >= 1 ? (page.save.oil.n--, did.burnt++, true) : false,
    openLantern: () => {}, habitFell: () => {}, oilNow: () => page.save.oil.n, barFor: () => null, useBar: () => {},
    setScene: s => did.scenes.push(s),
    makeShell: stone => ({ canvas: stone }), pixelate: stone => ({ toDataURL: () => 'shell ' + stone[0] }),
  };
  vm.runInNewContext(src, page);
  return { page, did, save: page.save };
}
const g = deep().page;

/** A save as it comes through the door: written to a pretend storage, then loaded the way the game loads it. */
function load(d) {
  const page = {
    SAVE_KEY: 'k', BAK_KEY: 'k.bak', localStorage: { getItem: k => k === 'k' && d ? JSON.stringify(d) : null, setItem: () => {} },
    sparkSaveOf, keeperMigrate, walkSaveOf, wardSaveOf, KEEP_WEAR, KS: Object.fromEntries(KEEPSAKES.map(k => [k.id, k])),
  };
  vm.runInNewContext(cut(saveJs, 'const SAVE_VERSION', 'const save = loadSave();', 'the save\'s way in should sit at the top of save.js') + '\nthis.loaded = loadSave(); this.migrate = migrate; this.freshSave = freshSave;', page);
  return { save: plain(page.loaded), migrate: page.migrate, freshSave: page.freshSave };
}

/**
 * Taps to open an egg of so much stone for a keeper with no forge and no Strength (a blow of 1, as crackHit has it: on the
 * weak spot 1 + weak × 2.2, off it a plain 1 and a little), who lands `aim` of the taps on the spot. Many eggs, the mean.
 */
const dmgRule = line(crack, /const crit = weak > 0\.45, soft = .*dmg = power \* \(1 \+ weak \* 2\.2\).*$/m, 'crackHit should weigh a blow by how near the weak spot it lands');
function tapsFor(hp, aim, eggs = 4000) {
  const r = stream(7);
  let all = 0;
  for (let k = 0; k < eggs; k++) {
    let dmg = 0, taps = 0;
    while (dmg < hp) { const weak = r() < aim ? 0.45 + r() * 0.55 : r() * 0.3; dmg += 1 * (1 + weak * 2.2); taps++; }
    all += taps;
  }
  return all / eggs;
}

test('step 1 is the Wander egg as it always was; the stone hardens slowly, flattens past step 21 and stops at the cap', t => {
  assert.ok(dmgRule);
  assert.equal(g.depthHp(1), g.levelConf(0).hp, 'the top step is as hard as Wander has always been');
  assert.equal(g.depthConf(1).hp, g.levelConf(0).hp);
  for (let d = 2; d <= 200; d++) assert.ok(g.depthHp(d) >= g.depthHp(d - 1), `never softer going down (step ${d})`);
  for (let d = 1; d <= 1000; d += 7) assert.ok(g.depthHp(d) <= g.DEPTH_HP_CAP, `capped at step ${d}`);
  assert.equal(g.depthHp(10000), g.DEPTH_HP_CAP, 'deep enough, it is the cap and no more');
  // gentle: a quarter harder at most, and past the flat the steps barely count
  assert.ok(g.DEPTH_HP_CAP <= g.levelConf(0).hp * 1.25);
  assert.ok(g.depthHp(g.DEPTH_FLAT + 1) - g.depthHp(1) > g.depthHp(2 * g.DEPTH_FLAT + 1) - g.depthHp(g.DEPTH_FLAT + 1), 'the second stretch grows less than the first');
  // the taps a keeper with no forge needs, at steps 1, 10, 25 and 50: never a slog
  const at = [1, 10, 25, 50].map(d => [d, g.depthHp(d)]);
  for (const aim of [0.4, 0.7]) {
    const taps = at.map(([d, hp]) => [d, hp, Math.round(tapsFor(hp, aim) * 10) / 10]);
    t.diagnostic(`no forge, aim ${aim * 100}%: ` + taps.map(([d, hp, n]) => `step ${d}: ${hp} hp, ${n} taps`).join(' · '));
    assert.ok(taps[3][2] <= taps[0][2] * 1.3, `step 50 asks at most 30% more taps than step 1 (aim ${aim})`);
  }
});

test('every fifth step is a pocket: rare or better, and one cave rule, silence, bands and flash in turn', () => {
  for (let d = 1; d <= 60; d++) {
    const conf = g.depthConf(d), pocket = d % 5 === 0;
    assert.equal(g.isPocket(d), pocket, `step ${d}`);
    assert.equal(!!conf.pocket, pocket, `step ${d}`);
    assert.equal(conf.depth, d);
    assert.equal(conf.wander, true, 'still Wander: crystals from every cave alike, no stars');
    const rules = plain(g.POCKET_RULES.filter(k => conf[k]));
    assert.deepEqual(rules, pocket ? [['silent', 'bands', 'sheen'][(d / 5 - 1) % 3]] : [], `step ${d}`);
    if (pocket) assert.equal(conf.rare + conf.legendary, 1, `nothing common in the pocket at step ${d}`);
    else assert.equal(conf.rare, g.levelConf(0).rare, `the usual chances off the pockets (step ${d})`);
  }
  // and the eggs: a pocket's stone keeps its rule and its crystal is never common, over many rolls
  for (const d of [5, 10, 15, 20, 25, 30]) {
    for (let k = 0; k < 300; k++) {
      const w = deep({ depth: { at: d, best: d - 1 } }, stream((d * 1000 + k) * 2654435761));
      w.page.startLevel(0);
      const e = w.did.eggs[0];
      assert.notEqual(e.crystal.rarity, 'common', `step ${d}, roll ${k}`);
      const rule = g.pocketRule(d);
      assert.equal(rule === 'bands' ? e.bands > 0 : !!e[rule], true, `step ${d} keeps ${rule}`);
      for (const other of g.POCKET_RULES.filter(x => x !== rule)) assert.equal(other === 'bands' ? e.bands > 0 : !!e[other], false, `step ${d} has no ${other}`);
    }
  }
  // off a pocket a Wander egg is as it was: no rule at all, and commons turn up
  const plainEggs = Array.from({ length: 200 }, (_, k) => { const w = deep({ depth: { at: 7, best: 6 } }, stream(k * 2654435761)); w.page.startLevel(0); return w.did.eggs[0]; });
  assert.ok(plainEggs.every(e => !e.bands && !e.silent && !e.sheen));
  assert.ok(plainEggs.some(e => e.crystal.rarity === 'common'));
});

test('a pocket says so: its hint names the rule, the pill marks it, and Pip speaks the first time', () => {
  const w = deep({ depth: { at: 10, best: 9 } });
  w.page.startLevel(0);
  assert.deepEqual(plain(w.did.talks), ['pocket']);
  assert.deepEqual(plain(w.did.hints), [w.page.POCKET_HINTS.bands]);
  assert.equal(w.did.els.lvlPill.textContent, 'Step 10 ✦');
  const p = deep({ depth: { at: 11, best: 10 } });
  p.page.startLevel(0);
  assert.deepEqual(plain(p.did.talks), []); assert.equal(p.did.els.lvlPill.textContent, 'Step 11');
  // Pip's lines: one talk of two, within a run, each with its Ukrainian and a mood of Pip's
  const talk = cut(crack, '  pocket: () => [', ']],\n', 'the pocket\'s talk should sit in TALKS');
  assert.equal((talk.match(/\[PIP, "/g) || []).length, 2);
  const uk = read('i18n.js');
  for (const [, words] of talk.matchAll(/\[PIP, "([^"]+)"/g)) assert.ok(uk.includes(JSON.stringify(words) + ':'), `Ukrainian for ${words}`);
  for (const k of Object.values(w.page.POCKET_HINTS)) assert.ok(uk.includes(JSON.stringify(k) + ':'), `Ukrainian for ${k}`);
});

test('the step goes down only when a Wander geode opens: not on starting, leaving or quitting, nor on a shared egg', () => {
  const w = deep({ oil: { n: 20 } });
  w.page.startLevel(0);
  assert.deepEqual(plain(w.save.depth), { at: 1, best: 0 }, 'starting an egg is no step');
  assert.equal(w.did.burnt, 1, 'Wander costs its drop of oil, as ever');
  // (leaving it mid-crack keeps the stone and nothing else: see tests/stone-waits.test.cjs)
  for (const f of ['stoneLeave', 'stoneOf', 'resumeStone', 'stoneHome']) assert.doesNotMatch(cut(scenes, `function ${f}(`, '\n}\n', `${f} should sit in scenes.js`), /depth/, `${f} takes no step`);
  w.page.openEgg();
  assert.deepEqual(plain(w.save.depth), { at: 2, best: 1 }, 'opening it is');
  for (let i = 0; i < 8; i++) { w.page.startLevel(0); w.page.openEgg(); }
  assert.deepEqual(plain(w.save.depth), { at: 10, best: 9 });
  // a shared egg, a moon egg, a heart's egg and a level's are no step of Wander's
  for (const conf of [{ ...g.levelConf(24), n: 0, wander: true, coop: true }, { ...g.levelConf(6), n: 'moon', moon: true, wander: true }, { ...g.levelConf(18), n: 'heart', wander: true }, g.levelConf(12)]) {
    w.page.game.egg = { conf }; w.page.openEgg();
  }
  assert.deepEqual(plain(w.save.depth), { at: 10, best: 9 });
  // the one place in the game that takes the step: showFound, after the stars and before the save
  const calls = ['crack.js', 'scenes.js', 'ui.js', 'coop.js', 'main.js'].reduce((n, f) => n + (read(f).match(/wanderDown\(/g) || []).length, 0);
  assert.equal(calls, 2, 'wanderDown is defined once and called once');
  assert.ok(found.indexOf('wanderDown(') < found.indexOf('persist();'));
});

test('back up the way: the deepest stays, the next egg is a step below the one opened', () => {
  const w = deep({ depth: { at: 6, best: 23 } });
  w.page.startLevel(0); w.page.openEgg();
  assert.deepEqual(plain(w.save.depth), { at: 7, best: 23 });
  w.page.wanderDown(24);
  assert.deepEqual(plain(w.save.depth), { at: 25, best: 24 });
});

test('the picker: where you are, one past the deepest, the top and every step just past a pocket, never deeper', () => {
  const at = depth => deep({ depth }).page.depthChoices();
  assert.deepEqual(plain(at({ at: 1, best: 0 })), [1]);
  assert.deepEqual(plain(at({ at: 4, best: 3 })), [1, 4]);
  assert.deepEqual(plain(at({ at: 24, best: 23 })), [1, 6, 11, 16, 21, 24]);
  assert.deepEqual(plain(at({ at: 13, best: 23 })), [1, 6, 11, 13, 16, 21, 24]);
  assert.deepEqual(plain(at({ at: 26, best: 25 })), [1, 6, 11, 16, 21, 26]);
  for (const best of [0, 3, 9, 50, 137]) for (const ch of at({ at: best + 1, best })) {
    assert.ok(ch >= 1 && ch <= best + 1, `bounds at best ${best}: ${ch}`);
    assert.ok(!g.isPocket(ch) || ch === best + 1, 'a jump never lands straight on a pocket');
  }
  // the arrows walk the choices and stop at the ends
  const w = deep({ depth: { at: 13, best: 23 } });
  w.page.pickDepth(-1); assert.equal(w.save.depth.at, 11);
  w.page.pickDepth(-1); w.page.pickDepth(-1); w.page.pickDepth(-1); assert.equal(w.save.depth.at, 1);
  w.page.pickDepth(-1); assert.equal(w.save.depth.at, 1, 'not above the top');
  for (let i = 0; i < 9; i++) w.page.pickDepth(1);
  assert.equal(w.save.depth.at, 24, 'not below one past the deepest');
  assert.equal(w.save.depth.best, 23, 'choosing never changes the deepest');
  w.page.startLevel(0);
  assert.equal(w.did.eggs.at(-1).conf.depth, 24);
});

test('the map\'s Wander button shows the step and the deepest; the picker hides while a stone waits there', () => {
  const w = deep({ depth: { at: 13, best: 23 } });
  const html = w.page.wanderButton(true);
  assert.match(html, /Wander · step 13/); assert.match(html, /deepest: step 23/);
  assert.match(html, /class="depth-pick"/); assert.match(html, /data-depth="-1"/); assert.match(html, /data-depth="1"/);
  assert.match(deep({ depth: { at: 15, best: 23 } }).page.wanderButton(true), /step 15 ✦/, 'a pocket is marked');
  const top = deep().page.wanderButton(true);
  assert.match(top, /step 1/); assert.doesNotMatch(top, /depth-pick/, 'nothing to pick at the very start');
  assert.match(deep().page.wanderButton(false), /disabled/);
  // a stone left at step 9 waits: the button says so and its step, and there's nothing to choose until it opens
  const sp = Object.values(g.CRYSTAL).map(c => c.id).find(id => vm.runInNewContext(`SPECIES.some(s => s.crystal === ${JSON.stringify(id)})`, g));
  const species = vm.runInNewContext(`SPECIES.find(s => s.crystal === ${JSON.stringify(sp)}).id`, g);
  const s = deep({ depth: { at: 13, best: 23 }, left: { n: 0, conf: { ...g.depthConf(9) }, crystal: sp, species, taps: 2, damage: 3, hp: 51,
    net: { segs: [], tips: [], live: [], impacts: [], dents: [] }, hits: [], spot: [0.5, 0.5] } });
  const waiting = s.page.wanderButton(true);
  assert.equal(s.page.wanderStep(), 9, 'the Crack button names the waiting stone\'s step too');
  assert.match(waiting, /stoneWait/); assert.match(waiting, /step 9/); assert.doesNotMatch(waiting, /depth-pick/);
  // every word on it has its Ukrainian
  const uk = read('i18n.js');
  for (const k of ['🌌 Wander · step {0}', 'deepest: step {0}', 'endless geodes: each one opened takes you a step deeper', 'start from', 'Higher up', 'Deeper', 'Step {0}', 'step {0}', 'a pocket', 'the deepest yet'])
    assert.ok(uk.includes(JSON.stringify(k) + ':'), `Ukrainian for ${k}`);
});

test('the found card of a Wander egg shows its step instead of stars, and writes no stars', () => {
  assert.match(found, /const deep = conf\.depth && !conf\.coop;/);
  assert.match(found, /\$\("stars"\)\.innerHTML = deep \? `<b>\$\{tr\("Step \{0\}", conf\.depth\)\}/);
  assert.match(found, /if \(!deep\) for \(let i = 0; i < stars; i\+\+\) setTimeout\(\(\) => sfx\.star\(i\)/, 'no star chimes either');
  assert.match(found, /if \(!conf\.wander\) save\.stars\[conf\.n\] = /);
});

test('an old save starts at the top, step 1, with nothing opened; a broken field does too, and the next step stays in bounds', () => {
  const nest = depth => ({ v: 1, stars: { 1: 3 }, creatures: [], seen: {}, ...(depth === undefined ? {} : { depth }) });
  assert.deepEqual(load(nest()).save.depth, { at: 1, best: 0 });
  assert.deepEqual(load(null).save.depth, { at: 1, best: 0 }, 'a new nest too');
  assert.deepEqual(load(nest({ at: 13, best: 23 })).save.depth, { at: 13, best: 23 });
  assert.deepEqual(load(nest({ at: 40, best: 23 })).save.depth, { at: 24, best: 23 }, 'never deeper than one past the deepest');
  assert.deepEqual(load(nest({ at: 0, best: -4 })).save.depth, { at: 1, best: 0 });
  assert.deepEqual(load(nest({ at: 7.6, best: 9.2 })).save.depth, { at: 7, best: 9 });
  for (const broken of [null, 'deep', 7, true, [], [3, 4], { at: 'x', best: NaN }]) assert.deepEqual(load(nest(broken)).save.depth, { at: 1, best: 0 }, JSON.stringify(broken));
  const { migrate, freshSave } = load(null);
  assert.deepEqual(plain(migrate(Object.assign(freshSave(), nest({ at: 5, best: 30 }))).depth), { at: 5, best: 30 });
  // a missed day takes nothing: the depth has no clock in it
  assert.doesNotMatch(cut(saveJs, 'function depthSaveOf(', '\n}\n', 'depthSaveOf should sit in save.js'), /Date|day/);
});
