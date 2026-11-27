const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { walkSaveOf, jarOf, KEEPSAKES } = require('../js/walk.js');
const { SPARKS, sparkRoll } = require('../js/sparks.js');

// The snowfields, step 4: Runa's three wishes (in order, each with its thanks, the ice door opening only on the third), the
// settlement (moving out from a card and back home, the room in Runa's hut and her snow huts, the sled once a day with its
// three-day basket, a frost geode every ten days there), the door's frost and the lullaby at six, the Winter hall and Dorma's
// page, the save, and every new word in both languages.
const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const snow = read('snow.js'), saveJs = read('save.js'), dataJs = read('data.js'), nestJs = read('nest.js'), crack = read('crack.js');
const UK = new Map([...read('i18n.js').matchAll(/^ {2}("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),?$/gm)].map(m => [JSON.parse(m[1]), JSON.parse(m[2])]));
const both = (s, what) => { assert.equal(typeof s, 'string', what); assert.ok(UK.get(s), `no Ukrainian for ${JSON.stringify(s)}`); assert.notEqual(UK.get(s), s, what); };
const plain = v => JSON.parse(JSON.stringify(v));
const KS = Object.fromEntries(KEEPSAKES.map(k => [k.id, k]));

const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };
const rules = [
  line(saveJs, /^const GLASS_MAX = .*$/m, 'GLASS_MAX should be one line in save.js'),
  line(saveJs, /^const glassSaveOf = .*$/m, 'glassSaveOf should be one line in save.js'),
  cut(dataJs, 'const DECOR = [', 'if (LANG === "uk")', 'the furniture should be one list in data.js'),
  'const DECO = Object.fromEntries(DECOR.map(d => [d.id, d]));',
  cut(snow, '// ---------- the rules ----------', '\nif (typeof module', 'the rules should sit at the top of snow.js'),
  cut(nestJs, 'const TANSY = ', '/** The button in the keeper\'s bar', 'the keepers and their errands should sit together in nest.js'),
  'Object.assign(this, { SLED_GEODES, HEROES, bondOf, wishOf, giveWish, bondStory, wishSeeks, glassNow, giveGlass, SETTLE_BASE, SETTLE_HUT, HUT_GLASS, SETTLE_MAX, SLED_GLASS, SLED_DAYS, GEODE_DAYS, DOOR_STAGES, LULLABY_AT, settlers, hutsNow, settleCap, hutPrice, doorFrost, doorOpen, canSettle, settleWhyNot, settleOut, buildHut, sledDue, sledCome, settlerHome });',
].join('\n');
const stageOf = level => level < 5 ? 0 : level < 10 ? 1 : level < 15 ? 2 : 3;
const glow = (id, o = {}) => ({ id, name: 'G' + id, level: 12, energy: 70, joy: 80, tummy: 80, room: 0, ...o });
/** A pretend nest with the snowfields open: today is day 100, one room at home with `beds` beds. */
function world(save = {}, { beds = 4, open = true } = {}) {
  const did = { geodes: 0, diary: [] };
  const page = {
    save: { shards: 0, decor: {}, walks: walkSaveOf({}), pantry: {}, geodes: {}, creatures: [], rooms: [{ kind: 'nest' }, { kind: 'snow', place: true }], ...save },
    today: 100, Math: Object.create(Math), PX_ICON_MAPS: {}, KS, jarOf, SPARKS: [], SNACKS: {},
    dayNo: () => page.today, stageOf, HELP_STAGE: 2, moodOf: c => c.sleeping ? 'asleep' : c.joy < 25 ? 'sad' : 'happy', placeOk: id => id !== 'snow' || open,
    remember: (c, k) => did.diary.push([c.id, k]), giveFrostGeode: n => { did.geodes += n; }, tr: (s, ...a) => a.length ? s.replace(/\{(\d)\}/g, (_, i) => a[i]) : s,
    roomOf: c => c.room || 0, isPlace: i => !!page.save.rooms[i]?.place, homeCap: () => beds,
    residents: r => page.save.creatures.filter(c => !c.out && (c.room || 0) === r), openIceDoor: () => {}, pxPortrait: () => '',
  };
  vm.runInNewContext(rules, page);
  return { page, did, g: page };
}

// ---------- Runa's wishes ----------

test('Runa has three wishes in this order: moon mint tea, a wild rose from a walk, a spare sunstone; and a calm word after', () => {
  const { g } = world(), runa = g.HEROES.snow;
  assert.equal(runa.asks.length, 3);
  assert.deepEqual(plain(runa.asks.map(a => a.ask)), ['Moon mint tea, from your bed? The cold gets in my whiskers.', 'A wild rose from a walk. Nothing pink grows here. Not once.', 'A sunstone. A spare one. I\'d like to hold summer once.']);
  assert.equal(runa.calm, 'Tea, a rose, a bit of summer. I\'m the richest ermine in the snow.');
  for (const a of runa.asks) {
    for (const k of ['ask', 'wish', 'btn', 'story']) both(a[k], k);
    assert.ok(a.story.split(/\s+/).length <= 25, a.story);
    both(a.gift[0]);
  }
  both(runa.calm); both(runa.thanks);
  // the rose is looked for on walks (the next flower found is one), the last wish sets the door going
  assert.equal(runa.asks[1].ks, 'rose');
  assert.equal(typeof runa.asks[2].then, 'function');
  // the owner's words, Ukrainian as given
  assert.equal(UK.get(runa.asks[2].ask), 'Сонячний камінь. Запасний. Хочу хоч раз потримати літо в лапах.');
  assert.equal(UK.get(runa.calm), 'Чай, троянда, шматочок літа. Я найбагатша горностаїха в цих снігах.');
});

test('each wish waits for its own thing; tea gives frostglass ×10, the rose an ice lantern, the sunstone the door and a snow hut', () => {
  const { g } = world({ pantry: { tea: 2 }, walks: walkSaveOf({ found: { rose: 1 } }), geodes: { sunstone: { count: 2 } } });
  // a rose or a sunstone in hand is no use while she wants tea
  assert.equal(g.wishOf('snow'), g.HEROES.snow.asks[0]);
  assert.ok(g.giveWish('snow'));
  assert.equal(g.save.pantry.tea, 1); assert.equal(g.glassNow(), 10); assert.equal(g.doorOpen(), false);
  assert.ok(g.giveWish('snow'));
  assert.equal(jarOf(g.save.walks).rose, undefined, 'the rose leaves the jar'); assert.ok(g.save.decor.icelantern); assert.equal(g.doorOpen(), false);
  assert.equal(g.hutsNow(), 0);
  const last = g.giveWish('snow');
  assert.ok(last); assert.equal(g.save.geodes.sunstone.count, 1, 'the spare goes, the first stays in the book');
  assert.equal(g.doorOpen(), true); assert.equal(g.hutsNow(), 1); assert.equal(g.settleCap(), 6);
  assert.equal(g.wishOf('snow'), null); assert.equal(g.giveWish('snow'), null);
  assert.equal(g.bondStory('snow').length, 3);
});

test('a sunstone that is the only one is not a spare; a lantern already carved comes back as its frostglass; all huts built, the last one\'s price', () => {
  const one = world({ bonds: { snow: 2 }, geodes: { sunstone: { count: 1 } } });
  assert.equal(one.g.giveWish('snow'), null); assert.equal(one.g.doorOpen(), false);
  const carved = world({ bonds: { snow: 1 }, walks: walkSaveOf({ found: { rose: 1 } }), decor: { icelantern: { on: true } } });
  const a = carved.g.giveWish('snow');
  assert.equal(carved.g.glassNow(), 12); assert.equal(a.gift[0], 'frostglass ×12');
  const full = world({ bonds: { snow: 2 }, geodes: { sunstone: { count: 3 } }, settle: { huts: 3, day: 100 } });
  const b = full.g.giveWish('snow');
  assert.equal(full.g.hutsNow(), 3); assert.equal(full.g.glassNow(), 50); assert.match(b.gift[0], /×50/);
});

test('the ice door opens only with the third wish: never by settlers, however many; their numbers only thin its frost at 3, 6 and 9', () => {
  const { g } = world({ creatures: Array.from({ length: 12 }, (_, i) => glow(i + 1, { settle: { since: 0, day: 90, geo: 0 }, out: true })), settle: { huts: 3, day: 99 } });
  assert.deepEqual(plain(g.DOOR_STAGES), [3, 6, 9]);
  assert.deepEqual([0, 2, 3, 5, 6, 8, 9, 12].map(n => g.doorFrost(n)), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(g.doorOpen(), false);
  for (const [b, open] of [[0, false], [1, false], [2, false], [3, true]]) { g.save.bonds = { snow: b }; assert.equal(g.doorOpen(), open, String(b)); }
});

// ---------- the settlement ----------

test('room for 3 in Runa\'s hut, 3 more for each snow hut (20, 35, 50 frostglass), 12 at most', () => {
  const { g } = world({ frostglass: 200 });
  assert.equal(g.settleCap(), 3); assert.equal(g.hutPrice(), 20);
  assert.ok(g.buildHut()); assert.equal(g.glassNow(), 180); assert.equal(g.settleCap(), 6);
  assert.ok(g.buildHut()); assert.equal(g.glassNow(), 145); assert.equal(g.settleCap(), 9);
  assert.ok(g.buildHut()); assert.equal(g.glassNow(), 95); assert.equal(g.settleCap(), 12);
  assert.equal(g.hutPrice(), null); assert.equal(g.buildHut(), false); assert.equal(g.buildHut(true), false);
  assert.equal(g.SETTLE_MAX, 12);
  // without the glass, nothing is built and nothing spent
  const poor = world({ frostglass: 19 });
  assert.equal(poor.g.buildHut(), false); assert.equal(poor.g.glassNow(), 19); assert.equal(poor.g.hutsNow(), 0);
});

test('moving out: grown, happy or fine, at home, never the last one; its bed is free, and the snowfields fill up', () => {
  const crs = [glow(1), glow(2), glow(3), glow(4), glow(5), glow(6, { level: 8 }), glow(7, { joy: 10 }), glow(8, { out: true }), glow(9, { job: { place: 'yard' }, out: true })];
  const { g, did } = world({ creatures: crs, active: 1 });
  assert.equal(g.settleWhyNot(crs[5]), 'no', 'not grown'); assert.equal(g.settleWhyNot(crs[6]), 'no', 'sad');
  assert.equal(g.settleWhyNot(crs[7]), 'no', 'out exploring'); assert.equal(g.settleWhyNot(crs[8]), 'no', 'a helper');
  assert.equal(g.residents(0).length, 7);
  assert.ok(g.settleOut(1));
  assert.equal(crs[0].out, true); assert.deepEqual(plain(crs[0].settle), { since: crs[0].settle.since, day: 100, geo: 0 });
  assert.equal(g.residents(0).length, 6, 'its bed is free');
  assert.notEqual(g.save.active, 1, 'you look after someone at home now');
  assert.deepEqual(did.diary[0], [1, 'Moved to the snowfields, to live near Runa']);
  assert.ok(g.settleOut(2)); assert.ok(g.settleOut(3));
  assert.equal(g.settleWhyNot(crs[3]), 'full'); assert.equal(g.settleOut(4), false);
  // shut snowfields: nobody goes
  const shut = world({ creatures: [glow(1), glow(2)] }, { open: false });
  assert.equal(shut.g.settleWhyNot(shut.g.save.creatures[0]), 'shut');
  // the last one at home stays
  const two = world({ creatures: [glow(1), glow(2)] });
  assert.ok(two.g.settleOut(1)); assert.equal(two.g.settleOut(2), false);
});

test('bringing one home needs a free bed', () => {
  const crs = [glow(1), glow(2), glow(3, { out: true, roam: true, settle: { since: 0, day: 90, geo: 0 } })];
  const { g } = world({ creatures: crs }, { beds: 2 });
  assert.equal(g.settlerHome(3), false, 'two beds, both taken'); assert.ok(crs[2].settle);
  crs[1].out = true;
  assert.ok(g.settlerHome(3));
  assert.equal(crs[2].settle, undefined); assert.equal(crs[2].out, false); assert.equal(g.residents(0).length, 2);
  assert.equal(g.settlerHome(3), false, 'already home');
});

test('the sled: 2 frostglass a day per settler, once a day, its basket only three days deep', () => {
  const s = (id, day) => glow(id, { out: true, settle: { since: 0, day, geo: 0 } });
  const { g } = world({ creatures: [s(1, 99), s(2, 99), s(3, 99)], settle: { huts: 0, day: 99 } });
  assert.equal(g.SLED_GLASS, 2); assert.equal(g.SLED_DAYS, 3);
  const a = g.sledCome(100);
  assert.equal(a.glass, 6); assert.equal(g.glassNow(), 6);
  assert.equal(g.sledCome(100), null, 'once a day'); assert.equal(g.glassNow(), 6);
  // away a week: the basket held only three days
  assert.equal(g.sledCome(107).glass, 18);
  // one who came yesterday sends one day's; one who came today, nothing yet
  assert.deepEqual(plain(g.sledDue([s(1, 106), s(2, 107)], 105, 107)), { glass: 2, geodes: 0, by: [] });
  // nobody living there: no sled, nothing in the save
  const empty = world();
  assert.equal(empty.g.sledCome(), null); assert.equal(empty.g.save.settle, undefined);
});

test('each settler brings a frost geode for every ten of its days there, counted, never random, and at most one per sled', () => {
  const c = glow(1, { out: true, settle: { since: 0, day: 80, geo: 0 } });
  const { g, did } = world({ creatures: [c], settle: { huts: 0, day: 80 } });
  assert.equal(g.GEODE_DAYS, 10);
  for (let d = 81; d <= 89; d++) assert.equal(g.sledCome(d).geodes, 0, String(d));
  assert.equal(g.sledCome(90).geodes, 1); assert.equal(c.settle.geo, 1); assert.equal(did.geodes, 1);
  assert.equal(g.sledCome(91).geodes, 0);
  // a month away: the basket holds one geode from each settler; the days' others are forgone, not saved for later
  assert.equal(g.sledCome(120).geodes, 1); assert.equal(c.settle.geo, 4); assert.equal(did.geodes, 2);
  assert.equal(g.sledCome(121).geodes, 0); assert.equal(g.sledCome(130).geodes, 1); assert.equal(did.geodes, 3);
  // three settlers away a long while: one each
  const s = (id, day) => glow(id, { out: true, settle: { since: 0, day, geo: 0 } });
  assert.equal(g.sledDue([s(1, 0), s(2, 10), s(3, 95)], 50, 100).geodes, 2);
});

test('settlers need nothing and grow like helpers; the game never counts them at home or sends them back by itself', () => {
  assert.match(saveJs, /if \(cr\.job \|\| cr\.settle\) \{ cr\.jobT = /);
  assert.match(nestJs, /const away = save\.creatures\.filter\(c => c\.out && !c\.roam && !c\.trip && !c\.job && !c\.settle\)/);
  assert.match(nestJs, /\$\("switcher"\)\.innerHTML = save\.creatures\.filter\(c => !c\.job && !c\.settle\)/);
  // the card: the way out, and the way home
  assert.match(nestJs, /id="glowSnow"[^`]*\$\{tr\("Move to the snowfields"\)\}/);
  assert.match(nestJs, /id="glowSnowHome" \$\{free \? "" : "disabled"\}/);
  // the residents sheet: a zone of their own, and in the Everyone view their place under their name
  assert.match(nestJs, /zone\("snow", `\$\{tr\("The snowfields"\)\} <span>\$\{snowy\.length\}\/\$\{settleCap\(\)\}<\/span>`/);
  assert.match(nestJs, /c\.settle \? `<small class="away">❄ \$\{tr\("The snowfields"\)\}<\/small>`/);
});

// ---------- the save ----------

const saveSrc = [cut(saveJs, 'const SETTLE_HUTS = 3;', '/**\n * Beds (#310)', 'settleSaveOf should sit in save.js, before beds'), 'this.settleSaveOf = settleSaveOf;'].join('\n');
test('the save keeps the huts, the sled\'s day and each settler; too many for the huts come home, an older save has none', () => {
  const page = {}; vm.runInNewContext(saveSrc, page);
  const old = { creatures: [glow(1), glow(2)] };
  assert.equal(page.settleSaveOf(old), null); assert.equal(old.settle, undefined); assert.equal(old.creatures[0].settle, undefined);
  const s = (id, o = {}) => glow(id, { settle: { since: 5, day: 50, geo: '2' }, ...o });
  const d = { settle: { huts: 9, day: 77.5 }, creatures: [s(1), s(2, { job: { place: 'yard' } }), ...Array.from({ length: 13 }, (_, i) => s(i + 3)), glow(30, { settle: 'nonsense' })] };
  page.settleSaveOf(d);
  assert.deepEqual(plain(d.settle), { huts: 3, day: 77 });
  const kept = d.creatures.filter(c => c.settle);
  assert.equal(kept.length, 12, 'twelve at most');
  assert.ok(kept.every(c => c.out && c.roam && c.settle.geo === 0 && c.settle.day === 50));
  assert.equal(d.creatures[1].settle, undefined, 'a helper is not a settler as well');
  assert.equal(d.creatures.at(-1).settle, undefined); assert.equal(d.creatures.at(-1).out, false);
  const small = { settle: { huts: 0 }, creatures: [s(1), s(2), s(3), s(4)] };
  page.settleSaveOf(small);
  assert.deepEqual(small.creatures.map(c => !!c.settle), [true, true, true, false]);
  assert.equal(small.creatures[3].out, false, 'the fourth comes home');
  assert.match(cut(saveJs, 'function migrate(d) {', '\n}\n', 'migrate'), /settleSaveOf\(d\);\s*\/\/ beds/);
});

// ---------- the door, the lullaby, the hall, Dorma's page ----------

test('at six settlers a lullaby comes through the ice: Mossa knows it, and it is a song spark of its own, never brought home', () => {
  const { g } = world();
  assert.equal(g.LULLABY_AT, 6);
  assert.match(nestJs, /else if \(kind === "snow" && settlers\(\)\.length >= LULLABY_AT && !save\.sparks\.got\.icelull\) setTimeout\(\(\) => inSnow\(\) && hearLullaby\(\), 1200\);/);
  const lull = SPARKS.find(s => s.id === 'icelull');
  assert.equal(lull.kind, 'song'); assert.equal(lull.name, 'Lullaby under the ice'); assert.ok(lull.heard);
  for (let i = 0; i < 200; i++) assert.notEqual(sparkRoll(8, {}, { trip: true, rnd: () => i / 200 }), 'icelull');
  assert.match(read('walk.js'), /SPARKS\.filter\(s => s\.kind !== "sight" && !s\.heard && /);
  assert.match(snow, /lullaby: \(\) => \[\[RUNA, [^\n]*\n\s*\[MOSSA, "I didn't sleep alone that night\. Someone sang\.", null, "warm"\]\]/);
  assert.equal(UK.get('I didn\'t sleep alone that night. Someone sang.'), 'Тієї ночі я спала не сама. Хтось співав.');
  assert.equal(UK.get('Not stone. Not mine.'), 'Не камінь. Не мій.');
  assert.equal(UK.get('Something red came this far once. The cold stopped it.'), 'Колись сюди дійшло щось руде. Мороз його спинив.');
  assert.match(snow, /\[EMBER, "Not stone\. Not mine\.", null, "concern"\]/);
});

test('Dorma\'s page about the Winter hall: in the Book once the door is open, not before, and never part of the grotto\'s own story', () => {
  const part = cut(crack, '{ id: "winterhall"', '] },', 'Dorma\'s page');
  assert.match(part, /land: "frost", ok: \(\) => doorOpen\(\), how: "Open the ice door in the snowfields", title: "The Winter hall", who: DORMA/);
  assert.match(part, /Four lands, each one keeping something/);
  assert.match(crack, /const part = STORY\.find\(s => !s\.gloom && !s\.land && unlocked\(s\.at\) && !talkSeen\(s\.id\)\);/);
  assert.match(crack, /const storyOpen = p => \(p\.ok \? p\.ok\(\) : unlocked\(p\.at\)\) && talkSeen\(p\.id\);/);
  assert.match(read('scenes.js'), /STORY\.filter\(p => !p\.land && talkSeen\(p\.id\)\)\.length, STORY\.filter\(p => !p\.land\)\.length/);
  // the door's look: thinner frost as they come, open once the wish is brought
  assert.match(read('play.js'), /p\.id === "icedoor" \? doorView\(\)/);
  assert.match(read('iso.js'), /icedoor\(t, T, ax, ay, o = \{\}\)/);
});

test('every new word of the snowfields\' settlement and door has its Ukrainian; glowlings neuter, Runa feminine, the player never gendered', () => {
  const part = snow.slice(snow.indexOf('// ---------- the settlement: moving out'));
  const said = new Set([...part.matchAll(/\btr\("((?:[^"\\]|\\.)*)"/g)].map(m => JSON.parse(`"${m[1]}"`)));
  for (const m of part.matchAll(/(?:runaSays\((?:pick\()?\[?|tr\(\[)((?:"(?:[^"\\]|\\.)*",? ?)+)/g)) for (const x of m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) said.add(JSON.parse(`"${x[1]}"`));
  for (const m of part.matchAll(/\[(?:RUNA|MOSSA|EMBER), "((?:[^"\\]|\\.)*)"/g)) said.add(JSON.parse(`"${m[1]}"`));
  assert.ok(said.size >= 40, `${said.size} lines`);
  for (const s of said) both(s);
  for (const s of ['Move to the snowfields', 'The settlement', 'Runa\'s sled came over the snow: frostglass ×{0} from the snowfields', 'The Winter hall', 'Open the ice door in the snowfields', 'Lullaby under the ice']) both(s);
  for (const s of ['{0} set off for the snowfields: Runa will look after it ✦', '{0} came home from the snowfields ✦', 'Moved to the snowfields, to live near Runa']) assert.doesNotMatch(UK.get(s), /\b(вирушив|вирушила|повернувся|повернулася|переселився|переселилася)\b/, s);
  assert.match(UK.get('Moved to the snowfields, to live near Runa'), /Переселилося/);
  for (const s of said) assert.doesNotMatch(UK.get(s), /\b(прийшов|прийшла|готовий|готова|зміг|змогла)\b/, s);
});

test('Runa\'s bar on a narrow screen: one short word under each icon, in both languages, the targets still a finger wide', () => {
  const words = JSON.parse(snow.match(/^const SHORT_WORDS = (\[.*\]);$/m)[1]);
  assert.deepEqual(words, ['Fish', 'Carve', 'Spring', 'Village', 'Geode']);
  assert.deepEqual(words.map(k => UK.get('short:' + k)), ['Риба', 'Різьба', 'Джерело', 'Поселення', 'Жеода']);
  assert.match(snow, /\["rod", tr\("Fish"\), startFishing, "", shortWord\("Fish"\)\]/);
  assert.match(nestJs, /\$\{short \? `<small class="short">\$\{short\}<\/small>` : ""\}/);
  const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
  assert.match(css, /#placeActs\.tight \.act\.has-short:not\(\.give\) \{[^}]*min-width: var\(--tap\); min-height: var\(--tap\);/);
  assert.match(css, /#placeActs\.tight \.act\.has-short \.short \{ display: block; font-size: 11px;/);
  // and in a place, a banner sends the plaque out of its way
  assert.match(css, /body\.scene-nest\.at-place\.banner #roomLabel \{ opacity: 0; \}/);
  assert.match(nestJs, /document\.body\.classList\.toggle\("at-place", !bar\.hidden\);/);
});
