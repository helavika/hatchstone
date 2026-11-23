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

// Twins and habits: a repeat species can move in as a glowling of its own (crack.js: adopt, chooseTwin), every glowling
// has one habit of its own (data.js HABITS, nest.js habitOf, iso.js habitNext), the moon's glowlings have kinds of their
// own (nest.js BEHAVIOR), and friends seek each other out (iso.js visitWho, sleepOrder). Each part is run over a pretend nest.
const dataJs = read('data.js'), nestJs = read('nest.js'), isoJs = read('iso.js'), crackJs = read('crack.js'), saveJs = read('save.js'), scenesJs = read('scenes.js');
const habitsSrc = cut(dataJs, 'const HABITS = [', 'const STAGES', 'the habits should sit in data.js, before the stages');
const decorSrc = cut(dataJs, 'const DECOR = [', 'if (LANG === "uk")', 'the furniture should be one list in data.js') + '\nconst DECO = Object.fromEntries(DECOR.map(d => [d.id, d]));';
const behaviorSrc = cut(nestJs, 'const BEHAVIOR = {', '\n};', 'the kinds of glowling should be one list in nest.js') + '\n};';
const kindSrc = nestJs.match(/^const kindOf = .*$/m)[0];
const friendsSrc = cut(nestJs, '/** Its best friend', 'function openGlowling', 'bestFriend and the habits should sit in nest.js, before openGlowling');
const roomSrc = cut(isoJs, '/** Fed and cared for', '/** Two glowlings meet', 'what a glowling does next should sit in iso.js, before meetFriend');
const sleepSrc = cut(isoJs, '/** The order they lie down in', '/** This sleeper\'s own place', 'sleepOrder should sit in iso.js, before bedSpot');
const adoptSrc = cut(crackJs, '/**\n * Hatch: the glowling joins your nest.', 'function showFound() {', 'adopt and the twin choice should sit in crack.js, before showFound');

/** A seeded dice, so a run can be told again. */
const dice = seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const fill = (s, ...a) => a.length ? s.replace(/\{(\d)\}/g, (_, i) => a[i]) : s;
/** A glowling: fed, rested and glad unless told otherwise. */
const glowling = (id, sp, o = {}) => ({ id, name: 'G' + id, sp, level: 3, xp: 0, tummy: 80, joy: 60, energy: 70, sleeping: false, room: 0, ...o });

/** A pretend room (its floor laid out flat here, 600 by 400): its glowlings, the pieces out in it, and a dice for every choice. */
function room(creatures, pieces = [], seed = 7) {
  const roll = dice(seed);
  const page = {
    roll, LANG: 'en', N: { base: 60, x0: 0, x1: 600, y0: 100, y1: 500, cx: 300, bedX: 520, bedY: 460 },
    save: { creatures, decor: Object.fromEntries(pieces.map(id => [id, { on: true }])), active: 0 },
    game: { nest: {}, time: 0 }, tr: fill, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), lerp: (a, b, k) => a + (b - a) * k, TAU: Math.PI * 2,
    specOf: () => ({ voice: 1 }), callOf: () => '', calmOf: () => ({ rest: 1, go: 1, fidget: 1, hop: 1 }),
    isOutside: () => false, weatherOn: () => false, isoLayout: () => ({ placed: {} }), rugSize: () => [80, 40],
    isoAt: (u, v) => [u * 600, 100 + v * 400], isoMargin: () => 0, standSpot: (x, y) => [x, y], emote: () => {}, kaoFor: () => "", setTimeout: () => {}, sfx: { stretch: () => {}, ready: () => false },
    careFor: () => null, groomFor: () => null, // (no grown one looking after a little one here: see gentle-care.test.cjs)
  };
  // each piece stands at its own place on the floor
  page.decorSpot = id => { const k = [...id].reduce((h, c) => h * 31 + c.charCodeAt(0), 7); return [60 + (k % 480), 140 + ((k >> 4) % 320)]; };
  page.hasDecor = id => !!(page.save.decor[id] && page.save.decor[id].on);
  vm.createContext(page);
  vm.runInContext('Math.random = () => roll(); const rand = (a, b) => a + Math.random() * (b - a), pick = arr => arr[Math.floor(Math.random() * arr.length)];\n'
    + 'const roomPoint = () => [rand(0, 600), rand(100, 500)];\n'
    + [habitsSrc, decorSrc, behaviorSrc, kindSrc, friendsSrc, roomSrc, sleepSrc].join('\n')
    + '\nObject.assign(this, { HABITS, HABIT, seededHabit, BEHAVIOR, kindOf, bestFriend, habitOf, newHabit, favePiece, habitLine, faveSpot, chooseNext, visitWho, sleepOrder, habitArrive });', page);
  /** An actor in the room for each glowling, standing about. */
  const actors = creatures.map((c, i) => ({ id: c.id, x: 100 + i * 90, y: 300, tx: 0, ty: 0, state: 'idle', t: 0, beh: page.kindOf(c) }));
  /** What it decides to do, many times over, each from where it stood. */
  const choices = (a, n = 2000) => Array.from({ length: n }, () => { Object.assign(a, { state: 'idle', goal: null, friend: null, plan: null }); page.chooseNext(a, actors); return { goal: a.goal, plan: a.plan, friend: a.friend, state: a.state, tx: a.tx, ty: a.ty }; });
  return { page, actors, choices };
}

/** The hatch over a pretend nest: what the found card shows, and a note of XP given. */
function hatch(creatures, { coop = false, shiny = false, sp = 'mothlet', seed = 3 } = {}) {
  const roll = dice(seed), xp = [], els = {};
  const el = id => els[id] || (els[id] = { id, hidden: false, textContent: '', classList: { contains: () => false }, focus: () => {} });
  const page = {
    roll, LANG: 'en', navigator: {}, save: { seen: { [sp]: { count: creatures.length } }, geodes: {}, creatures, nextId: 50, active: 0, decor: {} },
    tr: fill, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), $: el, CAVES: ['Shallows'], geodeImage: () => '',
    applyTime: () => {}, addXP: (c, n) => xp.push([c.id, n]), persist: () => {}, updateTopbar: () => {}, sfx: { chirp: () => {} },
    specOf: () => ({ voice: 1 }), hasDecor: () => false, settleNew: c => { c.room = 0; return 0; },
  };
  vm.createContext(page);
  vm.runInContext('Math.random = () => roll(); const pick = arr => arr[Math.floor(Math.random() * arr.length)];\n'
    + [habitsSrc, decorSrc, friendsSrc, cut(nestJs, '/** A glowling\'s diary keeps this many lines', '/** A first worth a line', 'the diary should sit in nest.js, before rememberFirst'), adoptSrc].join('\n')
    + '\nObject.assign(this, { adopt, chooseTwin, habitOf, HABITS });', page);
  const egg = { species: { id: sp, name: 'Mothlet', voice: 1 }, shiny, crystal: { id: 'quartz', name: 'Quartz' }, conf: { coop } };
  return { page, xp, els, egg, save: page.save };
}

test('a repeat hatch asks first: nothing joins and no XP is given until you choose', () => {
  const kin = glowling(1, 'mothlet', { name: 'Mothlet', habit: 'hum' });
  const h = hatch([kin]);
  const { note, mine } = h.page.adopt(h.egg);
  assert.equal(h.save.creatures.length, 1, 'still just the one');
  assert.deepEqual(h.xp, [], 'no XP yet');
  assert.equal(mine, kin);
  assert.ok(h.page.adopt.twin, 'the card has a choice to offer');
  assert.match(note, /^Another Mothlet! It can move in/);
});

test('welcome it home: a glowling of its own, with its own name and a habit its relative does not have', () => {
  for (let seed = 1; seed < 30; seed++) {
    const kin = glowling(1, 'mothlet', { name: 'Mothlet', habit: 'hum' });
    const h = hatch([kin], { seed });
    h.page.adopt(h.egg);
    h.page.$('foundNote').textContent = h.page.adopt.twin.note = 'note';
    h.page.chooseTwin(true);
    assert.equal(h.save.creatures.length, 2, 'it moved in');
    const twin = h.save.creatures[1];
    assert.equal(twin.sp, 'mothlet');
    assert.equal(twin.id, 50);
    assert.notEqual(twin.name, kin.name, 'a name of its own');
    assert.notEqual(twin.habit, 'hum', 'not the same habit as its relative');
    assert.notEqual(twin.habit, 'rain', 'no hiding from the rain in a nest with no cloud to rain from');
    assert.ok(h.page.HABITS.some(x => x.id === twin.habit));
    assert.equal(h.save.active, twin.id, 'the new one is the one you are looking after');
    assert.deepEqual(h.xp, [], 'no visit XP');
    assert.equal(h.els.foundTwin.hidden, true, 'the choice is gone from the card');
    assert.match(h.els.foundNote.textContent, /moved into your nest/);
    assert.ok(twin.mem.some(m => m.k === 'Hatched from a {0} geode'), 'its diary starts on the day it hatched');
    assert.equal(h.page.adopt.twin, null);
    h.page.chooseTwin(false);
    assert.deepEqual(h.xp, [], 'a second tap does nothing');
  }
});

test('let it visit: the relative gets +40 XP, as it always did, and nobody new moves in', () => {
  const kin = glowling(1, 'mothlet', { name: 'Mothlet', joy: 50 });
  const h = hatch([kin]);
  h.page.adopt(h.egg);
  h.page.$('foundNote').textContent = h.page.adopt.twin.note = 'note';
  h.page.chooseTwin(false);
  assert.equal(h.save.creatures.length, 1);
  assert.deepEqual(h.xp, [[1, 40]]);
  assert.equal(kin.joy, 70);
  assert.equal(h.page.adopt.sibling, true);
  assert.match(h.els.foundNote.textContent, /met a sibling/);
  assert.match(h.els.foundNestSub.textContent, /met a sibling: \+40 XP/);
});

test('leaving the card without a choice is a visit; a shared egg and a first one of a kind need no choice', () => {
  assert.match(cut(scenesJs, 'function setScene(scene) {', '\n}\n', 'setScene'), /if \(adopt\.twin\) chooseTwin\(false\);/);
  const shared = hatch([glowling(1, 'mothlet')], { coop: true });
  shared.page.adopt(shared.egg);
  assert.equal(shared.page.adopt.twin, null, 'both nests get the card at once: a shared egg visits');
  assert.deepEqual(shared.xp, [[1, 40]]);
  // a shiny one is not a repeat of a plain one
  const shiny = hatch([glowling(1, 'mothlet')], { shiny: true });
  shiny.page.adopt(shiny.egg);
  assert.equal(shiny.page.adopt.twin, null);
  assert.equal(shiny.save.creatures.length, 2);
  assert.ok(shiny.save.creatures[1].habit, 'a first one of its kind gets a habit too');
});

test('every glowling has a habit: the same one from its id each time, and all of them come up', () => {
  const { page } = room([]);
  assert.ok(page.HABITS.length >= 8 && page.HABITS.length <= 10);
  for (let id = 1; id < 300; id++) assert.equal(page.seededHabit(id), page.seededHabit(id));
  const seen = new Set(Array.from({ length: 200 }, (_, i) => page.seededHabit(i + 1)));
  assert.equal(seen.size, page.HABITS.length, 'every habit turns up among the ids');
  // one hatched with a habit keeps it; one from before has its own from its id
  assert.equal(page.habitOf({ id: 4, habit: 'collect' }), 'collect');
  assert.equal(page.habitOf({ id: 4 }), page.seededHabit(4));
  assert.equal(page.habitOf({ id: 4, habit: 'nonsense' }), page.seededHabit(4));
  for (const h of page.HABITS) assert.ok(page.habitLine({ id: 1, habit: h.id }).length > 6, h.id);
});

test('an older save: each glowling gets its habit quietly on the way in, and keeps one it has', () => {
  const saveSrc = habitsSrc + cut(saveJs, 'const SAVE_VERSION', 'const save = loadSave();', 'the save\'s way in should sit at the top of save.js');
  const load = d => {
    const page = { SAVE_KEY: 'k', BAK_KEY: 'k.bak', localStorage: { getItem: k => k === 'k' ? JSON.stringify(d) : null, setItem: () => {} },
      sparkSaveOf, keeperMigrate, walkSaveOf, wardSaveOf, KEEP_WEAR, KS: Object.fromEntries(KEEPSAKES.map(k => [k.id, k])) };
    vm.runInNewContext(saveSrc + '\nthis.loaded = loadSave();', page);
    return JSON.parse(JSON.stringify(page.loaded));
  };
  const old = { v: 1, shards: 10, stars: {}, creatures: [glowling(1, 'mothlet'), glowling(2, 'dozeling'), glowling(3, 'skyfin', { habit: 'rain' }), glowling(4, 'blushbun', { habit: 'gone' })], nextId: 5 };
  const a = load(old), b = load(old);
  assert.equal(a.creatures.length, 4, 'the save loaded as it was');
  const { page } = room([]);
  assert.equal(a.creatures[0].habit, page.seededHabit(1));
  assert.equal(a.creatures[1].habit, page.seededHabit(2));
  assert.equal(a.creatures[2].habit, 'rain', 'one it already had stays');
  assert.equal(a.creatures[3].habit, page.seededHabit(4), 'one that no longer exists is replaced');
  assert.deepEqual(a.creatures.map(c => c.habit), b.creatures.map(c => c.habit), 'the same each time it is opened');
});

test('a habit changes where it goes: two of the same kind, a favourite piece and a favourite spot, choose differently', () => {
  // two dancers: the lamp, the cushion, the shelf and the spring are nothing a dancer cares for by its kind alone
  const fan = glowling(1, 'petalpuff', { habit: 'fave' }), sitter = glowling(2, 'petalpuff', { habit: 'spot' });
  const r = room([fan, sitter], ['lamp', 'cushion', 'shelf', 'spring']);
  const fave = r.page.favePiece(fan);
  assert.ok(fave, 'it has a favourite among the pieces out');
  assert.equal(r.page.favePiece(fan).id, fave.id, 'always the same one');
  const byFan = r.choices(r.actors[0]), bySitter = r.choices(r.actors[1]);
  const share = (list, f) => list.filter(f).length / list.length;
  assert.ok(share(byFan, c => c.goal === fave.id) > 0.3, `the fan visits its favourite piece often (${share(byFan, c => c.goal === fave.id)})`);
  assert.equal(share(bySitter, c => !!c.goal), 0, 'the other one never goes to those pieces');
  const [sx, sy] = r.page.faveSpot(sitter), near = c => Math.hypot(c.tx - sx, c.ty - sy) < 8;
  assert.ok(share(bySitter, c => c.plan === 'spot' && near(c)) > 0.3, 'the sitter keeps going to its own spot');
  assert.ok(share(byFan, near) < 0.02, 'the fan hardly ever stands there');
  // and the habit line on each one's card says so
  assert.match(r.page.habitLine(fan), new RegExp(`^Its favourite thing: ${fave.name.toLowerCase()}`, 'i'));
  assert.match(r.page.habitLine(sitter), /favourite spot/);
});

test('a follower goes after whoever is nearest, a hummer does not', () => {
  const follower = glowling(1, 'petalpuff', { habit: 'follow' }), hummer = glowling(2, 'petalpuff', { habit: 'hum' }), far = glowling(3, 'mothlet', { habit: 'hum' });
  const r = room([follower, hummer, far]);
  // the follower stands right beside the hummer; the third is across the room
  Object.assign(r.actors[0], { x: 100, y: 300 }); Object.assign(r.actors[1], { x: 170, y: 300 }); Object.assign(r.actors[2], { x: 560, y: 480 });
  const share = (list, f) => list.filter(f).length / list.length;
  const byFollower = r.choices(r.actors[0]);
  assert.ok(share(byFollower, c => c.plan === 'follow' && Math.abs(c.ty - 300) < 1 && Math.abs(c.tx - 170) < 60) > 0.4, 'it tags along after the nearest one');
  assert.equal(share(r.choices(r.actors[1]), c => c.plan === 'follow'), 0);
});

test('after the walk its habit took it on: a collector carries its find to bed, a napper by its friend lies down', () => {
  const collector = glowling(1, 'petalpuff', { habit: 'collect' });
  const r = room([collector]), a = r.actors[0];
  Object.assign(a, { state: 'walk', plan: 'collect' });
  r.page.habitArrive(a, collector);
  assert.equal(a.state, 'walk'); assert.equal(a.plan, 'carry');
  assert.deepEqual([a.tx >= 0, a.ty], [true, 460], 'off to the bed with it');
  r.page.habitArrive(a, collector);
  assert.equal(a.state, 'idle'); assert.equal(a.plan, null);
  Object.assign(a, { state: 'walk', plan: 'napby', napT: 6 });
  r.page.habitArrive(a, collector);
  assert.equal(a.state, 'nap'); assert.equal(a.t, 6);
});

test('the moon\'s and the holidays\' glowlings have kinds of their own, by their stories, not all dancers', () => {
  const { page } = room([]);
  const moonIds = [...dataJs.matchAll(/\{ id: "(\w+)", name: "\w+", crystal: "moonstone", moon:/g)].map(m => m[1]);
  assert.equal(moonIds.length, 10);
  const KINDS = ['flutter', 'hop', 'nap', 'dance', 'curious', 'swim'];
  for (const id of moonIds) assert.ok(KINDS.includes(page.BEHAVIOR[id]), `${id} has a kind`);
  const kinds = moonIds.map(id => page.kindOf({ sp: id }));
  assert.ok(new Set(kinds).size >= 5, 'their dreams vary');
  assert.ok(kinds.filter(k => k === 'dance').length <= 2, 'not all dancers any more');
  assert.equal(page.BEHAVIOR.sunsplash, 'swim'); assert.equal(page.BEHAVIOR.glimmerbug, 'flutter'); assert.equal(page.BEHAVIOR.gourdlet, 'nap');
});

test('going to see someone, it picks its best friend about half the time; a nest without friends picks at random', () => {
  const me = glowling(1, 'ambercub', { pals: { 3: 7, 2: 1 } });
  const others = [2, 3, 4, 5].map(id => glowling(id, 'mothlet'));
  const r = room([me, ...others], [], 11);
  const actors = r.actors.slice(1), n = 4000;
  const picks = Array.from({ length: n }, () => r.page.visitWho(me, actors).id);
  const toFriend = picks.filter(id => id === 3).length / n;
  // half the time straight to the friend, and the other half one in four of a random pick: 0.625
  assert.ok(Math.abs(toFriend - 0.625) < 0.03, `best friend picked ${toFriend}`);
  for (const id of [2, 4, 5]) assert.ok(Math.abs(picks.filter(x => x === id).length / n - 0.125) < 0.025, `${id} still visited now and then`);
  const lone = glowling(9, 'ambercub');
  const plain = Array.from({ length: n }, () => r.page.visitWho(lone, actors).id).filter(id => id === 3).length / n;
  assert.ok(Math.abs(plain - 0.25) < 0.03, `without friends it is anyone (${plain})`);
  // and in the room, a curious one visiting someone chooses its friend far more than the others
  const meetings = r.choices(r.actors[0], 3000).filter(c => c.friend != null);
  assert.ok(meetings.length > 200);
  assert.ok(meetings.filter(c => c.friend === 3).length / meetings.length > 0.5);
});

test('friends asleep lie side by side', () => {
  const r = room([glowling(1, 'mothlet', { pals: { 4: 6 } }), glowling(2, 'mothlet'), glowling(3, 'mothlet'), glowling(4, 'mothlet', { pals: { 1: 6 } })]);
  const order = [...r.page.sleepOrder([1, 2, 3, 4])];
  assert.deepEqual(order, [1, 4, 2, 3]);
  assert.deepEqual([...r.page.sleepOrder([2, 3])], [2, 3], 'no friends: by who came first');
  // a friend dozing in the room: a sleepy one walks over and dozes beside it
  const me = glowling(5, 'dozeling', { pals: { 6: 6 }, energy: 30, habit: 'hum' }), pal = glowling(6, 'dozeling', { habit: 'hum' });
  const s = room([me, pal], [], 5);
  Object.assign(s.actors[1], { x: 500, y: 450, state: 'nap' });
  const naps = s.choices(s.actors[0], 2000).filter(c => c.plan === 'napby' || c.state === 'nap');
  assert.ok(naps.length > 100);
  assert.ok(naps.every(c => c.plan === 'napby'), 'every doze is beside its friend');
  assert.ok(naps.every(c => Math.abs(c.tx - 452) < 1 && c.ty === 450));
});
