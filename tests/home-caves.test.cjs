const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// scenes.js and crack.js need the whole game around them, so only the choosing is run here: the crystals as they are in
// data.js, the level's odds, the home caves' section of scenes.js, and the three lines of newEgg that decide the crystal
const scenes = read('scenes.js'), crack = read('crack.js'), coop = read('coop.js'), ui = read('ui.js');
const src = [
  read('data.js'),
  line(read('core.js'), /^const pick = .*$/m, 'pick should be one line in core.js'),
  cut(read('pixel.js'), 'function levelConf(', '\n}\n', 'levelConf should sit in pixel.js') + '\n}',
  line(scenes, /^const tripCosts = .*$/m, 'tripCosts should be one line in scenes.js'),
  cut(scenes, '// ---------- home caves and a choice of three geodes', '/** Where the six levels of a chapter sit', 'the choice of three should sit in scenes.js, in a section of its own that ends with startLevel'),
  'function newEgg(conf) {',
  line(crack, /^  const r = Math\.random\(\);$/m, 'newEgg should roll its rarity first'),
  line(crack, /^  const rarity = .*$/m, 'newEgg should name its rarity in one line'),
  line(crack, /^  const crystal = .*$/m, 'newEgg should choose its crystal in one line'),
  '  eggs.push(game.egg = { conf, crystal, stone: "plain" });',
  '}',
  'Object.assign(this, { CRYSTALS, CRYSTAL, SPECIES, CAVES, CAVE_STONES, HOME_WEIGHT, levelConf, rollCrystal, offerOdds, rollOffer, choosesGeode, offerFor, startLevel, closePick, newEgg });',
].join('\n');

/** A stream of numbers that is the same every time, for rolls that have to be told apart from luck. */
function stream(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/** The grotto over a pretend nest: a lantern with drops to count, a sheet with three buttons, and the eggs that get started. */
function grotto(save = {}, random = stream()) {
  const did = { rolls: 0, burnt: 0, lantern: 0, fell: 0, scenes: [], sheet: false, eggs: [], refit: 0, hints: [] };
  const where = { isConnected: true, focus: () => { document.activeElement = where; } };
  const document = { activeElement: where };
  let buttons = [];
  const row = {
    set innerHTML(html) {
      buttons = [...html.matchAll(/<button data-geo="(\d)"[^>]*>.*?<\/button>/g)].map(m => {
        const b = { html: m[0], dataset: { geo: m[1] }, addEventListener: (ev, f) => { b[ev] = f; }, focus: () => { document.activeElement = b; } };
        return b;
      });
    },
    get firstElementChild() { return buttons[0]; },
  };
  const page = {
    LANG: 'en', LEVELS: 24, document, eggs: did.eggs,
    Math: Object.assign(Object.create(Math), { random: () => { did.rolls++; return random(); } }),
    save: { stars: {}, seen: {}, geodes: {}, oil: { n: 5 }, ...save }, game: {},
    tr: s => s, $: () => row, $$: () => buttons, sfx: { tick: () => {} },
    show: (id, on) => { assert.equal(id, 'pickSheet'); did.sheet = on; },
    persist: () => {}, talk: () => {}, setHint: s => did.hints.push(s),
    oilNow: () => page.save.oil.n,
    burnOil: () => page.save.oil.n >= 1 ? (page.save.oil.n--, did.burnt++, true) : false,
    openLantern: () => { did.lantern++; }, coreFell: () => { did.fell++; },
    setScene: s => did.scenes.push(s), refitEgg: () => { did.refit++; },
    makeShell: stone => ({ canvas: stone }), pixelate: stone => ({ toDataURL: () => 'shell ' + stone[0] }),
  };
  vm.runInNewContext(src, page);
  return { page, did, save: page.save, where, document, buttons: () => buttons, random: f => { random = f; } };
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
  // the shared egg is rolled by newEgg from the host's own conf, the guest gets it as a blueprint, and neither passes the sheet
  const host = cut(ui, 'const step = Number($("coopDifficulty").value);', 'coopBlueprintFromEgg(', 'the host should start the shared egg in ui.js');
  assert.ok(host.includes('const conf = { ...levelConf(step), n: 0, wander: true, coop: true };') && host.includes('newEgg(conf, true)') && !host.includes('startLevel('), 'the host rolls a Wander-like egg straight through newEgg');
  assert.ok(coop.includes('wander: true, coop: true, forced: {') && !/startLevel\(|openPick|\.chosen/.test(coop), 'the guest\'s egg is forced and never comes through startLevel');
  const moon = cut(scenes, 'function startMoon(', '\n}\n', 'startMoon should sit in scenes.js');
  assert.ok(/forced: \{/.test(moon) && !/startLevel\(|openPick|chosen/.test(moon), 'the moon egg is forced and never comes through startLevel');
});

test('a forced stone stays forced, whatever was chosen', () => {
  const l = grotto();
  l.page.newEgg({ ...l.page.levelConf(0), forced: { crystal: l.page.CRYSTAL.moonstone }, chosen: l.page.CRYSTAL.opal });
  assert.equal(l.did.eggs[0].crystal.id, 'moonstone');
});

test('three to choose from are no three tries: a shimmer shows at most 1.5 times as often as one geode had it', () => {
  for (const n of [1, 7, 13, 19, 0]) {
    const conf = g.levelConf(n), odds = g.offerOdds(conf), p = conf.rare + conf.legendary, q = odds.rare + odds.legendary;
    assert.ok(q > 0 && q <= p + 1e-12, 'no single geode is likelier to be rare than before');
    assert.ok(1 - (1 - q) ** 3 <= Math.min(1, 1.5 * p) + 1e-12, `level ${n}: a shimmer among the three`);
    // taking a shimmer whenever there is one finds a legendary less than 1.5 times as often as before
    assert.ok(odds.legendary <= conf.legendary && (1 - (1 - q) ** 3) * odds.legendary / q <= 1.5 * conf.legendary + 1e-12, `level ${n}: legendaries`);
    if (!conf.legendary) assert.equal(odds.legendary, 0);
  }
  // and the rolls keep to those odds
  const l = grotto({}, stream(3)), conf = l.page.levelConf(13), odds = l.page.offerOdds(conf), seen = { common: 0, rare: 0, legendary: 0 };
  for (let i = 0; i < 20000; i++) for (const c of l.page.rollOffer(conf)) seen[c.rarity]++;
  assert.ok(Math.abs(seen.rare / 60000 - odds.rare) < 0.01 && Math.abs(seen.legendary / 60000 - odds.legendary) < 0.005, JSON.stringify(seen));
});

test('the three on offer: a shimmer on every rare or better, and one ? at most, on a geode the Book lacks', () => {
  for (let seed = 1; seed <= 400; seed++) {
    // books of every size: empty, half full, all but the legendaries, full
    const have = g.CRYSTALS.filter((c, i) => [false, i % 2, c.rarity !== 'legendary', true][seed % 4]).map(c => [c.id, { count: 1 }]);
    const n = [0, 3, 8, 14, 20][seed % 5], l = grotto({ ...cleared(24), geodes: Object.fromEntries(have) }, stream(seed));
    const three = l.page.offerFor(n);
    assert.equal(three.length, 3);
    const fresh = three.filter(o => o.fresh), lacking = three.filter(o => !l.save.geodes[o.crystal.id]);
    assert.ok(fresh.length <= 1, 'one ? at most');
    assert.equal(fresh.length, lacking.length ? 1 : 0, 'a ? whenever one of the three would be new');
    if (fresh.length) assert.ok(!l.save.geodes[fresh[0].crystal.id]);
    for (const o of three) assert.equal(o.shimmer, o.crystal.rarity !== 'common');
  }
});

test('a first visit and a sealed geode hand you theirs: no sheet', () => {
  for (let n = 1; n <= 24; n++) {
    const l = grotto(cleared(n - 1));
    assert.equal(l.page.choosesGeode(n), false);
    l.page.startLevel(n);
    assert.equal(l.did.sheet, false, 'level ' + n);
    assert.equal(l.did.eggs.length, 1);
    assert.equal(l.did.eggs[0].conf.chosen, undefined);
    assert.equal(l.did.eggs[0].conf.gloom, n % 6 ? undefined : n / 6);
    assert.equal(l.did.eggs[0].stone, 'plain');
    assert.equal(l.save.offers, undefined, 'nothing is rolled for a sheet that never shows');
  }
});

test('Wander and a level opened before let you choose', () => {
  for (const n of [0, 1, 6, 12, 24]) {
    const l = grotto(cleared(24));
    assert.equal(l.page.choosesGeode(n), true);
    l.page.startLevel(n);
    assert.equal(l.did.sheet, true, 'level ' + n);
    assert.equal(l.buttons().length, 3);
    assert.equal(l.document.activeElement, l.buttons()[0], 'the keyboard starts on the first geode');
    assert.equal(l.did.eggs.length, 0);
    assert.ok(l.buttons().filter(b => b.html.includes('class="new"')).length <= 1);
  }
});

test('closing the sheet spends nothing, and the same three wait', () => {
  const l = grotto(cleared(24));
  l.page.startLevel(8);
  const three = l.save.offers[8].ids.slice(), rolls = l.did.rolls;
  l.page.closePick();
  assert.equal(l.did.sheet, false);
  assert.equal(l.document.activeElement, l.where, 'the keyboard goes back to where it was');
  assert.deepEqual([l.save.oil.n, l.did.burnt, l.did.lantern, l.did.fell, l.did.scenes.length, l.did.eggs.length], [5, 0, 0, 0, 0, 0]);
  l.page.startLevel(8);
  assert.equal(l.did.sheet, true);
  assert.deepEqual(l.save.offers[8].ids, three);
  assert.equal(l.did.rolls, rolls, 'no second roll');
});

test('picking starts exactly that geode, as an ordinary stone', () => {
  for (const i of [0, 1, 2]) {
    const l = grotto(cleared(24), stream(11));
    l.page.startLevel(8);
    const id = l.save.offers[8].ids[i], rolls = l.did.rolls;
    l.buttons()[i].click();
    assert.equal(l.did.sheet, false);
    assert.deepEqual(l.did.scenes, ['crack']);
    const egg = l.did.eggs[0];
    assert.equal(egg.crystal.id, id);
    assert.equal(egg.conf.chosen.id, id);
    assert.equal(egg.conf.forced, undefined, 'stars, the sunpetal and the counters treat it as any other stone');
    assert.equal(egg.conf.n, 8);
    assert.equal(egg.stone, l.page.CAVE_STONES[egg.crystal.cave], 'it arrives in the stone shown on the sheet');
    assert.deepEqual([l.save.oil.n, l.did.burnt, egg.paid], [4, 1, true], 'the drop is burnt once a geode is taken');
    assert.equal(l.did.rolls, rolls + 1, 'only newEgg\'s own roll, which the choice overrides');
  }
});

test('a three-star level is free, sheet and all', () => {
  const l = grotto({ ...cleared(24, 3), oil: { n: 0 } });
  l.page.startLevel(8);
  assert.equal(l.did.sheet, true);
  l.buttons()[2].click();
  assert.deepEqual([l.did.eggs.length, l.did.burnt, l.did.lantern, l.did.eggs[0].paid], [1, 0, 0, false]);
});

test('with a dry lantern there is nothing to choose: the lantern opens instead', () => {
  const l = grotto({ ...cleared(24), oil: { n: 0 } });
  l.page.startLevel(8);
  assert.deepEqual([l.did.sheet, l.did.lantern, l.did.eggs.length, l.save.offers], [false, 1, 0, undefined]);
});

test('a geode taken and left waits for you; three new ones come once an egg has hatched', () => {
  const l = grotto({ ...cleared(24), seen: { dozeling: { count: 2 } } }, stream(5));
  l.page.startLevel(0);
  l.buttons()[1].click();
  const took = l.did.eggs[0].crystal.id;
  // walking out and coming back is no way to try the other two
  l.page.startLevel(0);
  assert.equal(l.did.sheet, false);
  assert.equal(l.did.eggs.length, 2);
  assert.equal(l.did.eggs[1].crystal.id, took);
  assert.equal(l.did.eggs[1].stone, l.page.CAVE_STONES[l.did.eggs[1].crystal.cave]);
  assert.equal(l.did.burnt, 2);
  assert.deepEqual(l.did.hints, ['the geode you chose is still waiting for you']);
  // it hatches (adopt counts every glowling that comes out)
  l.save.seen.dozeling.count++;
  l.page.startLevel(0);
  assert.equal(l.did.sheet, true);
  assert.equal(l.save.offers[0].ids.length, 3);
  assert.equal(l.did.eggs.length, 2);
});

test('a save with a broken offer just gets a new one', () => {
  for (const broken of [['amethyst', 'quartz'], { ids: ['amethyst', 'nosuchstone', 'quartz'] }, { ids: 'amethyst' }, 7, { chose: 'nosuchstone', took: 0 }]) {
    const l = grotto({ ...cleared(24), offers: { 5: broken } });
    l.page.startLevel(5);
    assert.equal(l.did.sheet, true);
    assert.equal(l.save.offers[5].ids.length, 3);
    for (const id of l.save.offers[5].ids) assert.ok(l.page.CRYSTAL[id]);
  }
});
