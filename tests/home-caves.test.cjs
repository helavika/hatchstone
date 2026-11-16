const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// scenes.js and crack.js need the whole game around them, so only the rolling is run here: the crystals as they are in
// data.js, the level's odds, the home caves' section of scenes.js, and the three lines of newEgg that decide the crystal
const scenes = read('scenes.js'), crack = read('crack.js'), coop = read('coop.js'), ui = read('ui.js');
const src = [
  read('data.js'),
  line(read('core.js'), /^const pick = .*$/m, 'pick should be one line in core.js'),
  cut(read('pixel.js'), 'function levelConf(', '\n}\n', 'levelConf should sit in pixel.js') + '\n}',
  cut(read('pixel.js'), '// ---------- Wander goes deeper', 'function depthConf(', 'the descent should sit in pixel.js, after levelConf') + cut(read('pixel.js'), 'function depthConf(', '\n}\n', 'depthConf should close it') + '\n}',
  line(scenes, /^const tripCosts = .*$/m, 'tripCosts should be one line in scenes.js'),
  cut(scenes, '// ---------- home caves ----------', '/** Where the six levels of a chapter sit', 'the home caves should sit in scenes.js, in a section of their own that ends with startLevel'),
  'function newEgg(conf) {',
  line(crack, /^  const r = Math\.random\(\);$/m, 'newEgg should roll its rarity first'),
  line(crack, /^  const rarity = .*$/m, 'newEgg should name its rarity in one line'),
  line(crack, /^  const crystal = .*$/m, 'newEgg should choose its crystal in one line'),
  '  eggs.push(game.egg = { conf, crystal, stone: "plain" });',
  '}',
  'Object.assign(this, { CRYSTALS, CRYSTAL, SPECIES, CAVES, CAVE_STONES, HOME_WEIGHT, levelConf, rollCrystal, replays, bookCrystal, startLevel, newEgg, tripCosts });',
].join('\n');

/** A stream of numbers that is the same every time, for rolls that have to be told apart from luck. */
function stream(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/** The grotto over a pretend nest: a lantern with drops to count, and the eggs that get started. */
function grotto(save = {}, random = stream()) {
  const did = { rolls: 0, burnt: 0, lantern: 0, fell: 0, scenes: [], eggs: [], hints: [], ate: [] };
  const page = {
    LANG: 'en', LEVELS: 24, eggs: did.eggs,
    Math: Object.assign(Object.create(Math), { random: () => { did.rolls++; return random(); } }),
    save: { stars: {}, seen: {}, geodes: {}, oil: { n: 5 }, depth: { at: 1, best: 0 }, ...save }, game: {},
    tr: s => s, sfx: { tick: () => {} },
    persist: () => {}, talk: () => {}, setHint: s => did.hints.push(s),
    burnOil: () => page.save.oil.n >= 1 ? (page.save.oil.n--, did.burnt++, true) : false,
    openLantern: () => { did.lantern++; }, habitFell: () => { did.fell++; },
    // a pocket of bars: the smallest goes first (the real ones are tried in tests/first-session.test.cjs)
    oilNow: () => page.save.oil.n, barFor: () => ['firefly', 'nut', 'star'].find(id => page.save.bars?.[id] > 0),
    useBar: (id, auto) => { page.save.bars[id]--; page.save.oil.n += { firefly: 1, nut: 3, star: 5 }[id]; did.ate.push([id, auto]); },
    setScene: s => did.scenes.push(s),
    makeShell: stone => ({ canvas: stone }), pixelate: stone => ({ toDataURL: () => 'shell ' + stone[0] }),
  };
  vm.runInNewContext(src, page);
  return { page, did, save: page.save, random: f => { random = f; } };
}
/** A nest that has opened every level up to n. */
const cleared = (n, stars = 1) => ({ stars: Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, stars])) });

const g = grotto().page;
const RARITIES = ['common', 'rare', 'legendary'];
const canRoll = (k, rarity) => rarity === 'common' || g.levelConf(k * 6 + 1)[rarity] > 0;

test('every crystal that can be rolled has a home cave', () => {
  const rolled = new Set(g.SPECIES.filter(s => !s.moon).map(s => s.crystal));
  for (const c of g.CRYSTALS) {
    assert.ok(rolled.has(c.id), c.id + ' holds a glowling that can be rolled');
    assert.ok(Number.isInteger(c.cave) && c.cave >= 0 && c.cave < g.CAVES.length, c.id + ' should have a home cave');
  }
  // a crystal that gives a cave its name lives in it
  assert.deepEqual(['amethyst', 'celestite', 'malachite', 'labradorite'].map(id => g.CRYSTAL[id].cave), [0, 1, 2, 3]);
  assert.equal(g.CAVE_STONES.length, g.CAVES.length);
});

test('every cave is home to a crystal of each rarity it can roll', () => {
  for (let k = 0; k < g.CAVES.length; k++) {
    for (const rarity of RARITIES) {
      const homed = g.CRYSTALS.filter(c => c.cave === k && c.rarity === rarity).length;
      if (canRoll(k, rarity)) assert.ok(homed > 0, `${g.CAVES[k]} should be home to a ${rarity} crystal`);
      else assert.equal(homed, 0, `no ${rarity} crystal should live in ${g.CAVES[k]}, where none can be found`);
    }
    const homed = g.CRYSTALS.filter(c => c.cave === k).length;
    assert.ok(homed >= 6 && homed <= 10, `${g.CAVES[k]} should be home to about a quarter of the crystals, not ${homed}`);
  }
});

test('at home a crystal turns up three times as often as the others of its rarity', () => {
  assert.equal(g.HOME_WEIGHT, 3);
  for (let k = 0; k < g.CAVES.length; k++) {
    for (const rarity of RARITIES.filter(r => canRoll(k, r))) {
      // one roll for every hundredth of every share, so the count is exact and not a matter of luck
      const pool = g.CRYSTALS.filter(c => c.rarity === rarity), shares = pool.reduce((sum, c) => sum + (c.cave === k ? 3 : 1), 0);
      const seen = {}, n = shares * 100;
      let i = 0;
      const l = grotto({}, () => (i++ + 0.5) / n);
      for (let j = 0; j < n; j++) { const c = l.page.rollCrystal(l.page.levelConf(k * 6 + 1), rarity); seen[c.id] = (seen[c.id] || 0) + 1; }
      for (const c of pool) assert.equal(seen[c.id], c.cave === k ? 300 : 100, `${c.id} (${rarity}) in ${g.CAVES[k]}`);
    }
  }
});

test('Wander and playing together roll as they always have: every crystal alike, from the same one number', () => {
  const confs = [g.levelConf(0), ...[1, 4, 8].map(step => ({ ...g.levelConf(step), n: 0, wander: true, coop: true }))];
  for (const conf of confs) {
    for (const rarity of RARITIES) {
      const a = grotto({}, stream(7)), b = stream(7), pool = g.CRYSTALS.filter(c => c.rarity === rarity);
      for (let i = 0; i < 300; i++) {
        // the old line of newEgg: pick(CRYSTALS.filter(c => c.rarity === rarity))
        const before = pool[Math.floor(b() * pool.length)];
        assert.equal(a.page.rollCrystal(conf, rarity).id, before.id);
      }
      assert.equal(a.did.rolls, 300, 'one number for each crystal, as before');
    }
  }
  // the shared egg is rolled by newEgg from the host's own conf, the guest gets it as a blueprint, and neither comes through startLevel
  const host = cut(ui, 'const step = Number($("coopDifficulty").value);', 'coopBlueprintFromEgg(', 'the host should start the shared egg in ui.js');
  assert.ok(host.includes('const conf = { ...levelConf(step), n: 0, wander: true, coop: true };') && host.includes('newEgg(conf, true)') && !host.includes('startLevel('), 'the host rolls a Wander-like egg straight through newEgg');
  assert.ok(coop.includes('wander: true, coop: true, forced: {') && !/startLevel\(|\.chosen/.test(coop), 'the guest\'s egg is forced and never comes through startLevel');
  const moon = cut(scenes, 'function startMoon(', '\n}\n', 'startMoon should sit in scenes.js');
  assert.ok(/forced: \{/.test(moon) && !/startLevel\(|chosen/.test(moon), 'the moon egg is forced and never comes through startLevel');
});

test('a forced stone stays forced, whatever was chosen', () => {
  const l = grotto();
  l.page.newEgg({ ...l.page.levelConf(0), forced: { crystal: l.page.CRYSTAL.moonstone }, chosen: l.page.CRYSTAL.opal });
  assert.equal(l.did.eggs[0].crystal.id, 'moonstone');
});

test('a first visit and a sealed geode roll as ever: no second look', () => {
  for (let n = 1; n <= 24; n++) {
    const l = grotto(cleared(n - 1));
    assert.equal(l.page.replays(n), false);
    l.page.startLevel(n);
    assert.deepEqual(l.did.scenes, ['crack']);
    assert.equal(l.did.eggs.length, 1);
    assert.equal(l.did.eggs[0].conf.chosen, undefined);
    assert.equal(l.did.eggs[0].conf.gloom, n % 6 ? undefined : n / 6);
    // the first cave's six are free the first time through, so its seal never meets an empty lantern
    assert.deepEqual([l.save.oil.n, l.did.burnt], n <= 6 ? [5, 0] : [4, 1]);
    assert.equal(l.did.eggs[0].paid, n > 6);
  }
});

test('Wander and a level opened before start straight away: no sheet to choose from', () => {
  for (const n of [0, 1, 6, 12, 24]) {
    const l = grotto(cleared(24));
    assert.equal(l.page.replays(n), true);
    l.page.startLevel(n);
    assert.deepEqual(l.did.scenes, ['crack']);
    assert.equal(l.did.eggs.length, 1);
    const egg = l.did.eggs[0];
    assert.ok(egg.conf.chosen && egg.crystal === egg.conf.chosen);
    assert.equal(egg.conf.forced, undefined, 'stars, the sunpetal and the counters treat it as any other stone');
    assert.equal(egg.stone, 'plain', 'it comes in an ordinary stone');
  }
  assert.ok(/^  delete d\.offers;$/m.test(read('save.js')), 'an old save drops the three it was offered');
});

test('a three-star level is free, and a dry lantern opens the lantern', () => {
  const free = grotto({ ...cleared(24, 3), oil: { n: 0 } });
  free.page.startLevel(8);
  assert.deepEqual([free.did.eggs.length, free.did.burnt, free.did.lantern, free.did.eggs[0].paid], [1, 0, 0, false]);
  const dry = grotto({ ...cleared(24), oil: { n: 0 } });
  dry.page.startLevel(8);
  assert.deepEqual([dry.did.eggs.length, dry.did.lantern, dry.did.fell], [0, 1, 1]);
});

test('out of oil, a bar in the pocket goes in by itself: no sheet, straight into the egg', () => {
  const l = grotto({ ...cleared(10), oil: { n: 0 }, bars: { nut: 1, firefly: 2 } });
  l.page.startLevel(11);
  assert.deepEqual(l.did.ate, [['firefly', true]], 'the smallest bar, eaten by itself');
  assert.deepEqual([l.did.eggs.length, l.did.burnt, l.did.lantern, l.did.fell, l.save.oil.n, l.save.bars.firefly], [1, 1, 0, 0, 0, 1]);
  // oil left, or a free trip: the bars stay in the pocket
  for (const [save, n] of [[{ ...cleared(10), oil: { n: 1 }, bars: { firefly: 1 } }, 11], [{ ...cleared(10, 3), oil: { n: 0 }, bars: { firefly: 1 } }, 4], [{ oil: { n: 0 }, bars: { firefly: 1 } }, 1]]) {
    const k = grotto(save);
    k.page.startLevel(n);
    assert.deepEqual([k.did.ate.length, k.did.eggs.length, k.save.bars.firefly], [0, 1, 1], 'level ' + n);
  }
});

test('the first cave costs oil only once it has been cleared: replays and later levels as ever', () => {
  const l = grotto({ oil: { n: 0 } });
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(n => l.page.tripCosts(n)), [false, false, false, false, false, false, true]);
  l.save.stars = { 1: 1, 2: 2, 3: 3 };
  assert.deepEqual([1, 2, 3, 4].map(n => l.page.tripCosts(n)), [true, true, false, false], 'a replay on 1 or 2 stars costs a drop, ★★★ is free');
  assert.equal(l.page.tripCosts(0), true, 'Wander costs a drop');
});

test('the second look keeps the rarity and favours a crystal the Book lacks', () => {
  const have = new Set(g.CRYSTALS.filter((c, i) => i % 2).map(c => c.id));
  const geodes = Object.fromEntries([...have].map(id => [id, { count: 1 }]));
  for (const n of [0, 3, 14, 20]) {
    const base = grotto({}, stream(9)), conf = base.page.levelConf(n), N = 20000, seen = { common: 0, rare: 0, legendary: 0 };
    let fresh = 0, freshBefore = 0;
    const l = grotto({ geodes }, stream(9 + n));
    for (let i = 0; i < N; i++) { const c = l.page.bookCrystal(conf); seen[c.rarity]++; if (!have.has(c.id)) fresh++; }
    for (let i = 0; i < N; i++) {
      const r = base.page.Math.random(), rarity = r < conf.legendary ? 'legendary' : r < conf.legendary + conf.rare ? 'rare' : 'common';
      if (!have.has(base.page.rollCrystal(conf, rarity).id)) freshBefore++;
    }
    assert.ok(Math.abs(seen.rare / N - conf.rare) < 0.012 && Math.abs(seen.legendary / N - conf.legendary) < 0.006, `level ${n}: ${JSON.stringify(seen)}`);
    assert.ok(fresh > freshBefore * 1.2, `level ${n}: new for the Book ${fresh} vs ${freshBefore}`);
  }
  // with the Book full the second look changes nothing, and with it empty there is no second look at all
  const full = Object.fromEntries(g.CRYSTALS.map(c => [c.id, { count: 1 }]));
  const a = grotto({ geodes: full }, stream(4)), conf = a.page.levelConf(8);
  for (let i = 0; i < 200; i++) a.page.bookCrystal(conf);
  assert.equal(a.did.rolls, 600);
  const e = grotto({}, stream(4));
  for (let i = 0; i < 200; i++) e.page.bookCrystal(conf);
  assert.equal(e.did.rolls, 400);
});
