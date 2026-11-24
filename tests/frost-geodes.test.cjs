const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// The snowfields' crystals and glowlings: never in the grotto's rolls, only in frost geodes; the frost geode's shelf in the
// save; the art parts the three are drawn with; the expedition to the snowfields; and their words in both languages.
const scenes = read('scenes.js'), crack = read('crack.js'), nestJs = read('nest.js'), saveJs = read('save.js'), glow = read('glowlings.js');
const src = [
  read('data.js'),
  line(read('core.js'), /^const pick = .*$/m, 'pick should be one line in core.js'),
  cut(read('pixel.js'), 'function levelConf(', '\n}\n', 'levelConf should sit in pixel.js') + '\n}',
  line(saveJs, /^const FROST_MAX = .*$/m, 'FROST_MAX should be one line in save.js'),
  line(saveJs, /^const frostSaveOf = .*$/m, 'frostSaveOf should be one line in save.js'),
  cut(scenes, '// ---------- home caves ----------', '\nconst caveShells', 'the home caves should sit in scenes.js'),
  line(scenes, /^  const pool = SPECIES\.filter\(s => !s\.moon .*$/m, 'moonToday should pick its rare pool in one line'),
  cut(scenes, '// ---------- frost geodes', '/** Off the found card', 'the frost geodes should sit in scenes.js, in a section of their own'),
  'function newEgg(conf) {',
  line(crack, /^  const r = Math\.random\(\);$/m, 'newEgg should roll its rarity first'),
  line(crack, /^  const rarity = .*$/m, 'newEgg should name its rarity in one line'),
  line(crack, /^  const crystal = .*$/m, 'newEgg should choose its crystal in one line'),
  line(crack, /^  const species = .*$/m, 'newEgg should choose its glowling in one line'),
  '  eggs.push(game.egg = { conf, crystal, species });',
  '}',
  'Object.assign(this, { CRYSTALS, CRYSTAL, SPECIES, SP, SNACKS, FROST_CRYSTALS, FROST_STONE, FROST_MAX, frostKind, frostSaveOf, rollCrystal, levelConf, frostCrystal, frostGeodes, giveFrostGeode, startFrost, frostFound, newEgg, moonPool: pool });',
].join('\n').replace(/^  const pool = SPECIES\.filter/m, 'const pool = SPECIES.filter');

/** Lists made in the page's own world, copied out so they compare as plain ones. */
const plain = v => JSON.parse(JSON.stringify(v));

function world(save = {}) {
  const did = { eggs: [], scenes: [], hints: [], saved: 0 };
  const els = { nextLvl: {}, foundMap: {} };
  const page = {
    LANG: 'en', eggs: did.eggs, coopSession: null,
    save: { geodes: {}, seen: {}, stars: {}, rooms: [], ...save }, game: {},
    tr: (s, ...a) => s.replace(/\{(\d)\}/g, (_, i) => a[i]), $: id => els[id],
    persist: () => { did.saved++; }, sfx: { tick() {} }, setScene: s => did.scenes.push(s), setHint: h => did.hints.push(h),
    moonConf: () => ({ hp: 10, rare: 0.1, legendary: 0.01, cave: 1 }),
  };
  vm.runInNewContext(src, page);
  return { page, did, els };
}

test('the frost crystals: real minerals of the snowfields, two common and a rare, each with a glowling of its own', () => {
  const { page: g } = world();
  assert.deepEqual(plain(g.FROST_CRYSTALS.map(c => [c.id, c.rarity])), [['selenite', 'common'], ['snowobsidian', 'common'], ['cryolite', 'rare']]);
  for (const c of g.FROST_CRYSTALS) {
    assert.equal(c.cave, 'frost');
    assert.ok(c.fact.length > 40, c.id + ' has a fact');
    assert.equal(g.SPECIES.filter(s => s.crystal === c.id && !s.moon).length, 1, c.id + ' holds one glowling');
  }
  assert.deepEqual(plain(g.SPECIES.filter(g.frostKind).map(s => [s.id, s.beh, g.CRYSTAL[s.crystal].rarity])), [['driftlet', 'nap', 'common'], ['slipkin', 'swim', 'common'], ['tinkicle', 'dance', 'rare']]);
});

test('the grotto never rolls a frost crystal: not in a level, not in Wander, not in a moon egg', () => {
  const { page: g } = world();
  for (const rarity of ['common', 'rare', 'legendary']) for (const conf of [g.levelConf(1), g.levelConf(9), g.levelConf(20), { wander: true }])
    for (let i = 0; i < 400; i++) assert.notEqual(g.rollCrystal(conf, rarity).cave, 'frost');
  for (let i = 0; i < 300; i++) { g.newEgg(g.levelConf(1 + (i % 24))); assert.ok(!g.frostKind(g.game.egg.species), g.game.egg.species.id); }
  assert.ok(g.moonPool.length > 10 && g.moonPool.every(s => !g.frostKind(s)), 'a moon egg holds no frost glowling');
  // and the rest of the game picks its random geodes from the grotto's crystals only
  const picks = nestJs.split('\n').filter(l => l.includes('CRYSTALS.filter('));
  assert.ok(picks.length >= 4);
  for (const p of picks) assert.match(p, /cave !== "frost"/, p.trim());
  assert.match(cut(scenes, 'function heartCrystal(', '\n}\n', 'heartCrystal'), /const far = CRYSTALS\.filter\(c => lacks\(c\) && c\.cave !== "frost"\)/);
});

test('a frost geode holds only frost glowlings, the rare one now and then, a new one for the Book first', () => {
  const { page: g, did, els } = world({ frostGeodes: 2 });
  const got = {};
  for (let i = 0; i < 2000; i++) { const c = g.frostCrystal(); got[c.id] = (got[c.id] || 0) + 1; }
  assert.deepEqual(Object.keys(got).sort(), ['cryolite', 'selenite', 'snowobsidian']);
  assert.ok(got.cryolite > 250 && got.cryolite < 550, `the rare one about one in five: ${got.cryolite}`);
  // with selenite in the Book, a common roll is snowflake obsidian
  g.save.geodes.selenite = { count: 1 };
  assert.equal(g.frostCrystal(() => 0.9).id, 'snowobsidian');
  // through the cracking screen: the egg is a frost one, its crystal and glowling from the snowfields
  for (let i = 0; i < 200; i++) {
    g.save.frostGeodes = 2;
    assert.equal(g.startFrost(), true);
    const e = did.eggs.at(-1);
    assert.equal(e.conf.frost, true); assert.equal(e.conf.wander, true);
    assert.ok(g.frostKind(e.species), e.species.id);
  }
  assert.equal(did.scenes.at(-1), 'crack');
  // a geode comes off the shelf only once it is open
  assert.equal(g.frostGeodes(), 2);
  g.frostFound();
  assert.equal(g.frostGeodes(), 1);
  assert.match(els.nextLvl.textContent, /Next frost geode \(1\)/);
  g.frostFound();
  assert.equal(g.save.frostGeodes, undefined);
  assert.equal(els.nextLvl.textContent, 'Back to the nest');
  assert.equal(g.startFrost(), false, 'none left: nothing to crack');
});

test('the frost geodes on the shelf: given one at a time, kept whole in the save, never past the cap', () => {
  const { page: g } = world();
  assert.equal(g.giveFrostGeode(), 1);
  assert.equal(g.giveFrostGeode(3), 4);
  assert.equal(g.giveFrostGeode(500), g.FROST_MAX);
  for (const [v, want] of [[undefined, 0], [-3, 0], ['7', 7], [2.8, 2], [1e9, 99], [{}, 0], [null, 0]]) assert.equal(g.frostSaveOf(v), want, String(v));
  assert.equal(g.FROST_STONE.snow, true);
  assert.match(crack, /stone: conf\.gloom \? GLOOM_STONE : conf\.moon \? moonStone\(\) : conf\.frost \? FROST_STONE :/);
  assert.match(crack, /if \(stone\.snow\) \{/, 'makeShell draws the snow cap');
  assert.match(crack, /if \(conf\.frost\) frostFound\(\);/);
  assert.match(read('ui.js'), /if \(conf\.frost\) return frostNext\(\);/);
  assert.match(saveJs, /const frost = frostSaveOf\(d\.frostGeodes\);/);
});

test('the three are drawn from parts that exist, and look like none of the winter moon glowlings', () => {
  const { page: g } = world();
  const parts = name => new Set([...cut(glow, `function ${name}(`, '\n}\n', name).matchAll(/case "(\w+)"/g)].map(m => m[1]));
  const bodies = new Set([...cut(glow, 'const BODY = {', '\n};', 'BODY').matchAll(/^  (\w+): \{/gm)].map(m => m[1]));
  const have = { body: bodies, back: parts('drawBack'), ears: parts('drawBehindHead'), pattern: parts('drawPattern'),
    head: new Set([...parts('drawHeadTop'), 'petals', 'rays']), eyes: new Set(['sparkle', 'sleepy', 'big', 'round']) };
  for (const [k, id] of [['pattern', 'snowflakes'], ['pattern', 'drift'], ['head', 'icicles'], ['head', 'snowcap'], ['ears', 'lops'], ['back', 'flattail'], ['body', 'snowball'], ['body', 'seal']]) assert.ok(have[k].has(id), `the new ${k} ${id} is drawn`);
  const frost = g.SPECIES.filter(g.frostKind);
  for (const s of frost) {
    for (const k of ['body', 'ears', 'head', 'back', 'pattern', 'eyes']) if (s[k]) assert.ok(have[k].has(s[k]), `${s.id}: ${k} ${s[k]}`);
    assert.ok(Array.isArray(s.pal) && s.pal.length === 3 && s.pal.every(c => /^#[0-9a-f]{6}$/.test(c)), s.id);
    assert.ok(g.SNACKS[s.snack] && s.voice > 0 && s.lore.length > 40, s.id);
  }
  assert.deepEqual(plain(frost.map(s => [s.body, s.ears || '', s.head || '', s.back || '', s.pattern, s.eyes])), [['snowball', 'lops', 'snowcap', '', 'drift', 'sleepy'], ['seal', '', '', 'flattail', 'snowflakes', 'big'], ['bean', '', 'icicles', 'wisp', 'iridescent', 'round']]);
  const look = s => ['body', 'ears', 'head', 'back', 'pattern', 'eyes'].map(k => s[k] || '').join('|');
  for (const w of ['frostpuff', 'rimeling']) for (const s of frost) assert.notEqual(look(s), look(g.SP[w]), `${s.id} vs ${w}`);
  // and not a recolour of anyone: no other glowling shares a frost one's outline (its body with what sticks out of it:
  // ears, head and back), so Driftlet is no white Hearthling and Slipkin no dark Ripplet
  const outline = s => ['body', 'ears', 'head', 'back'].map(k => s[k] || '').join('|');
  for (const s of frost) for (const o of g.SPECIES.filter(o => o !== s)) assert.notEqual(outline(s), outline(o), `${s.id} has the outline of ${o.id}`);
  for (const [a, b] of [['driftlet', 'hearthling'], ['slipkin', 'ripplet']]) {
    assert.notEqual(g.SP[a].body, g.SP[b].body, `${a} and ${b} have bodies of their own`);
    for (const k of ['ears', 'head', 'back']) if (g.SP[b][k]) assert.notEqual(g.SP[a][k], g.SP[b][k], `${a} doesn't wear ${b}'s ${k}`);
  }
  assert.deepEqual(plain(frost.filter(s => s.cheeks === 'frost').map(s => s.id)), ['driftlet', 'slipkin']);
  // only Tinkicle wears the crown, and it tinkles as it starts a dance
  assert.deepEqual(plain(g.SPECIES.filter(s => s.head === 'icicles').map(s => s.id)), ['tinkicle']);
  assert.match(read('iso.js'), /if \(a\.tinkled && specOf\(cr\)\.head === "icicles"\) sfx\.tinkle\(\);/);
  assert.match(read('core.js'), /^  tinkle\(\) \{$/m);
});

test('the expedition to the snowfields: frost geodes and shards, for hoppers and nappers, only once the land is warded', () => {
  const trips = cut(nestJs, 'const TRIP_PLACES = [', '\nconst TRIP_HOURS', 'TRIP_PLACES');
  const page = { warded: false, THEME: { frost: { name: 'Frost Hollow' } }, tr: s => s, unlocked: () => true };
  page.wardDone = id => id === 'frost' && page.warded;
  vm.runInNewContext(trips + '\nthis.TRIP_PLACES = TRIP_PLACES;', page);
  const pl = page.TRIP_PLACES.find(p => p.id === 'snowfields');
  assert.ok(pl);
  assert.deepEqual(plain([pl.theme, pl.finds, pl.suits, pl.ok()]), ['frost', ['frost', 'shards'], ['hop', 'nap'], false]);
  page.warded = true;
  assert.equal(pl.ok(), true);
  assert.equal(pl.tales.length, 2);
  assert.match(pl.pair, /^\{0\} and \{1\} /);
});

test('in Ukrainian: the frost crystals, the three glowlings by their own names, and every new line', () => {
  const page = {
    location: { pathname: '/' }, addEventListener: () => {}, navigator: { languages: [] }, NodeFilter: { SHOW_TEXT: 4 },
    localStorage: { getItem: k => k === 'hatchstone.lang' ? 'uk' : null, setItem: () => {} },
    document: { documentElement: {}, body: {}, title: '', createTreeWalker: () => ({ nextNode: () => null }), querySelectorAll: () => [] },
  };
  vm.runInNewContext(read('i18n.js') + '\nObject.assign(this, { tr, UK, UK_DATA });', page);
  for (const id of ['selenite', 'snowobsidian', 'cryolite']) assert.ok(page.UK_DATA.crystals[id]?.name && page.UK_DATA.crystals[id].fact.length > 40, id);
  assert.deepEqual(plain(['driftlet', 'slipkin', 'tinkicle'].map(id => page.UK_DATA.species[id].name)), ['Заметик', 'Ковзик', 'Бурулька']);
  for (const id of ['driftlet', 'slipkin', 'tinkicle']) assert.ok(page.UK_DATA.species[id].lore.length > 40, id);
  // the older glowlings keep their names in Ukrainian, as they always have
  assert.ok(Object.entries(page.UK_DATA.species).filter(([, v]) => v.name).every(([id]) => ['driftlet', 'slipkin', 'tinkicle'].includes(id)));
  assert.match(crack, /if \(D\.species\[s\.id\]\.name\) s\.name = D\.species\[s\.id\]\.name;/);
  const frostSrc = cut(scenes, '// ---------- frost geodes', '\nconst frostNext', 'frost geodes') + cut(nestJs, '  // past the valley: open once both wardstones', '\n];', 'snowfields');
  const said = [...frostSrc.matchAll(/(?:tr\(|tales: \[|, |pair: |how: |name: )"((?:[^"\\\n]|\\.)+)"/g)].map(m => m[1].replace(/\\(.)/g, '$1')).filter(s => /[a-z]{3}/.test(s) && !/^[a-z]+$/.test(s));
  const ui = read('ui.js');
  said.push('frost geodes', 'a frost geode', 'Sleeps only in frost geodes, from the snowfields past the valley.', 'Only in ❄ frost geodes, from the snowfields: never in the grotto.');
  for (const s of said.slice(-4)) assert.ok(ui.includes(`"${s}"`) || nestJs.includes(`"${s}"`), 'used in the game: ' + s);
  assert.ok(said.length >= 12, said.join(' / '));
  for (const s of said) assert.equal(typeof page.UK[s], 'string', `no Ukrainian for: ${s}`);
  assert.match(page.tr('{0} and {1} built one snow figure from both sides.', 'Лумі', 'Бобо'), /^Лумі і Бобо /);
});
