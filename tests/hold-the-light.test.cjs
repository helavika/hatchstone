const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// play.js needs the whole game around it, so only the Gloom's visit is run here, over a pretend nest (a diamond of floor
// wide enough to hold a stretch 800 across and 400 deep, a glowling 100 across): the visit from its numbers down to the end
// of gloomEnd, with areFriends and the diary's remember as they stand in nest.js, the charms and the one hung on the wall
// as gifts.js has them, and the walls' pieces as iso.js has them (no tunnel in the nest's walls here)
const playJs = read('play.js'), nestJs = read('nest.js'), i18n = read('i18n.js'), giftsJs = read('gifts.js'), saveJs = read('save.js'), isoJs = read('iso.js');
const visitSrc = [
  line(nestJs, /^const areFriends = .*$/m, 'areFriends should be one line in nest.js'),
  cut(nestJs, '/** A glowling\'s diary keeps', '/** A first worth', 'the diary and its remember should sit in nest.js'),
  line(giftsJs, /^const CHARMS = .*$/m, 'the charms should be one line in gifts.js'),
  line(giftsJs, /^const charmHung = .*$/m, 'charmHung should be one line in gifts.js'),
  line(saveJs, /^const isoAt = .*$/m, 'isoAt should be one line in save.js'),
  line(isoJs, /^const ISO_G = .*$/m, 'ISO_G should be one line in iso.js'),
  line(isoJs, /^const WALL_ITEMS = .*$/m, 'WALL_ITEMS should be one line in iso.js'),
  line(isoJs, /^const wallSlot = .*$/m, 'wallSlot should be one line in iso.js'),
  cut(playJs, 'const GLOOM_WAIT = ', '/** Where the huddle is for a glowling', 'the Gloom\'s visit should sit together in play.js, down to gloomEnd'),
  'Object.assign(this, { GLOOM_HELP, GLOOM_TIE, GLOOM_TIE_R, gloomNow, gloomArt, gloomCome, updateGloom, gloomEnd, gloomSegDist, gloomOnThread, areFriends, GLOOM_CHARM, GLOOM_CHARM_R, GLOOM_CHARM_LOW, charmSpot, charmAt, gloomInCharm });',
].join('\n');
const B = 100, DT = 1 / 60;
const fill = (s, ...a) => a.length ? s.replace(/\{(\d)\}/g, (_, i) => a[i]) : s;

/** A pretend nest with the Gloom's shadows already in it: `friends` lists the pairs who are friends, `at` where each glowling
 *  stands on the floor. No wisp is out until a test puts one somewhere; one is still on its way in from the crack, so the
 *  visit goes on (`last: true` for a visit that ends with the wisps the test puts out). */
function visit({ friends = [], at = { 1: [300, 300], 2: [500, 300], 3: [400, 380] }, save = {}, calm = false, last = false, decor = {}, wall = {} } = {}) {
  const did = { toasts: [], emotes: [], saved: 0, sparks: [] };
  const names = { 1: 'Dozeling', 2: 'Mossmew', 3: 'Smudgekin', 4: 'Pippom' };
  const creatures = Object.keys(at).map(Number).map(id => ({ id, name: names[id], sleeping: false, joy: 50, pals: {} }));
  for (const [p, q, n = 5] of friends) creatures.find(c => c.id === p).pals[q] = n;
  const actors = new Map(creatures.map(c => [c.id, { id: c.id, x: at[c.id][0], y: at[c.id][1] }]));
  const page = {
    Math, Date, TAU: Math.PI * 2, W: 800, H: 600, N: { base: B, x0: 0, x1: 800, y0: 0, y1: 400, cx: 400, isoW: 900, isoH: 450, isoTop: -250, isoWall: 300, dk: 1, ...wall },
    save: { creatures, shards: 0, room: 0, dust: [], ...save }, actors, game: { scene: 'nest', sparks: did.sparks, time: 0 },
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)), lerp: (a, b, t) => a + (b - a) * t, rand: (a, b) => (a + b) / 2, pick: arr => arr[0],
    sfx: { ready: () => false }, opts: () => ({ calm }), document: { hidden: false }, setTimeout: () => 0, $$: () => [],
    talkNow: null, talkQueue: [], giftNow: null, coopSession: null, pointer: null, arrange: { on: false }, startedEmpty: false,
    emote: (a, text) => did.emotes.push([a.id, text]), kaoFor: () => "≧ω≦", toast: t => did.toasts.push(t), tr: fill, persist: () => did.saved++,
    isoLayout: () => ({ key: '', placed: {} }), wallInDoor: () => false,
    nestRoom: () => 0, hasDecor: id => !!decor[id], residents: () => creatures, cnt: () => 1, bump: () => {}, tipDone: () => true, dayKey: () => 'today', keeperGift: () => false,
    setHint: () => {}, nestHint: () => '', renderNest: () => {}, updateTopbar: () => {}, checkAwards: () => {}, floatText: () => {}, buzz: () => {}, talk: () => {},
  };
  vm.runInNewContext(visitSrc, page);
  const g = page.gloomNow;
  assert.equal(page.gloomCome(), true, 'the shadows should come into a calm nest');
  for (const w of g.wisps) w.on = false;
  if (!last) Object.assign(g.wisps[2], { on: true, t: -1e6 });
  did.emotes.length = 0;
  const cr = id => creatures.find(c => c.id === id), actor = id => actors.get(id);
  /** Your lantern, held over a spot on the floor (it hangs as high over it as the wisps float). */
  const lamp = (x, y) => Object.assign(g.lamp, { on: true, x, y: y - B * 0.42 });
  /** A whole wisp, long since seeped in, at a spot on the floor. */
  const wisp = (i, x, y) => Object.assign(g.wisps[i], { on: true, x, y, t: 5, life: 999, hp: 1, k: 1, fade: 1, lit: 0, tie: 0 });
  const run = (secs, each) => { for (let k = 0; k < Math.round(secs / DT) && g.on; k++) { page.updateGloom(DT); if (each) each(k); } };
  // (what the game makes lives in its own world: copied out, so it can be compared with what is written here)
  const threads = () => Array.from(g.threads).filter(t => t.live).map(t => [t.a.id, t.b.id].sort().join('+')).sort();
  const diary = id => Array.from(cr(id).mem || []).map(m => fill(m.k, ...m.a));
  return { page, g, did, cr, actor, lamp, wisp, run, threads, diary, creatures };
}

test('how far a spot is from the line between two friends: across counts as it is, toward the back for 1.4', () => {
  const { page } = visit();
  const d = page.gloomSegDist;
  assert.equal(d(50, 0, 0, 0, 100, 0), 0, 'on the line');
  assert.equal(d(50, 10, 0, 0, 100, 0), 14, 'beside its middle, a step toward the back');
  assert.equal(d(-30, 0, 0, 0, 100, 0), 30, 'past one end: as far as that end');
  assert.ok(Math.abs(d(130, 10, 0, 0, 100, 0) - Math.hypot(30, 14)) < 1e-9, 'past the other end, and off to the side');
  assert.equal(d(30, 40, 30, 0, 30, 100), 0, 'on a line that runs toward the back');
  assert.equal(d(50, 40, 30, 0, 30, 100), 20, 'beside it');
  assert.ok(Math.abs(d(3, 4, 0, 0, 0, 0) - Math.hypot(3, 5.6)) < 1e-9, 'two friends on one spot: as far as that spot');
  // the same either way round
  assert.equal(d(20, 30, 0, 0, 100, 50), d(20, 30, 100, 50, 0, 0));
});

test('a thread only between friends, and only while both shine with you', () => {
  const v = visit({ friends: [[1, 2]] });
  // no lantern: nobody shines, no thread
  v.run(0.5);
  assert.equal(v.g.helpers, 0); assert.deepEqual(v.threads(), []);
  // the lantern between them: all three shine, and the two friends hold a thread; the third has none
  v.lamp(400, 300); v.run(0.5);
  assert.equal(v.g.helpers, 3); assert.deepEqual(v.threads(), ['1+2']);
  assert.ok(v.g.threads.find(t => t.live).k > 0.9, 'it has reached all the way across');
  // one of them wanders out of your light: the thread is let go
  v.actor(2).x = 400 + B * 2.2; v.run(0.1);
  assert.equal(v.g.helpers, 2); assert.deepEqual(v.threads(), []);
  v.run(0.5);
  assert.ok(v.g.threads.every(t => !t.on), 'and it is gone in a blink');
  // back again: there it is; asleep: gone; the lantern lifted: gone
  v.actor(2).x = 500; v.run(0.1);
  assert.deepEqual(v.threads(), ['1+2']);
  v.cr(1).sleeping = true; v.run(0.1);
  assert.deepEqual(v.threads(), []);
  v.cr(1).sleeping = false; v.run(0.1);
  assert.deepEqual(v.threads(), ['1+2']);
  v.g.lamp.on = false; v.run(0.1);
  assert.deepEqual(v.threads(), []);
});

test('friendship counts either way round, from five meetings on', () => {
  for (const [friends, want] of [[[[2, 1]], ['1+2']], [[[1, 2, 4], [2, 1, 4]], []], [[[1, 2, 4], [2, 1, 5]], ['1+2']], [[], []]]) {
    const v = visit({ friends });
    v.lamp(400, 300); v.run(0.2);
    assert.equal(v.g.helpers, 3);
    assert.deepEqual(v.threads(), want, JSON.stringify(friends));
  }
});

test('three who shine with you: a thread for each pair of friends, three at most', () => {
  const two = visit({ friends: [[1, 2], [2, 3]] });
  two.lamp(400, 320); two.run(0.2);
  assert.deepEqual(two.threads(), ['1+2', '2+3']);
  // a fourth friend close by doesn't shine with you (three at most do), so it holds no thread
  const all = visit({ friends: [[1, 2], [2, 3], [1, 3], [4, 1], [4, 2], [4, 3]], at: { 1: [300, 300], 2: [500, 300], 3: [400, 380], 4: [400, 240] } });
  all.lamp(400, 320); all.run(0.2);
  assert.equal(all.g.helpers, all.page.GLOOM_HELP);
  assert.deepEqual(all.threads(), ['1+2', '1+3', '2+3']);
});

test('a wisp on the thread fades fast, even where your lantern does not reach', () => {
  const v = visit({ friends: [[1, 2]], at: { 1: [310, 300], 2: [690, 300] } });
  // the two as far apart as your light lets them be: toward either end the thread is out of your lantern's own pool
  v.lamp(500, 300); v.wisp(0, 640, 300); v.wisp(1, 640, 300 - B * 0.6);
  v.run(0.5);
  assert.deepEqual(v.threads(), ['1+2']);
  const [on, off] = v.g.wisps;
  assert.equal(on.lit, 0, 'your lantern is not on it');
  assert.ok(on.tie > 0.9, 'it is caught on the thread');
  // it took a moment to catch (a twelfth of a second), then faded by GLOOM_TIE a second
  assert.ok(Math.abs(1 - on.hp - v.page.GLOOM_TIE * (0.5 - 5 * DT)) < v.page.GLOOM_TIE * DT * 1.5, `faded by ${1 - on.hp}`);
  assert.equal(off.hp, 1, 'one a little way off the thread is not touched');
  assert.equal(off.tie, 0);
  // caught, it stays where it is and lets go within a second and a bit
  assert.ok(Math.abs(on.x - 640) < B * 0.05 && Math.abs(on.y - 300) < B * 0.05, 'it has not drifted on');
  v.run(0.75);
  assert.equal(on.on, false, 'gone');
  assert.equal(v.g.freed, 1);
  assert.equal(v.page.save.shards, 1, 'a shard for it, as for any wisp');
  assert.equal(off.on, true);
});

test('how close is on the thread: its reach and the wisp\'s own size, past the ends too', () => {
  const v = visit({ friends: [[1, 2]] });
  v.lamp(400, 300); v.run(0.2);
  const reach = B * v.page.GLOOM_TIE_R, w = v.g.wisps[0];
  const on = (x, y, k = 1) => !!v.page.gloomOnThread(Object.assign(w, { x, y, k }));
  assert.ok(on(400, 300) && on(400, 300 + (reach - 1) / 1.4) && on(300 - reach + 1, 300));
  assert.ok(!on(400, 300 + (reach + 1) / 1.4) && !on(300 - reach - 1, 300) && !on(500 + reach + 1, 300));
  // a wisp is caught by its edge: a bigger one from further off
  v.page.gloomArt.R = 10; v.page.gloomArt.P = 2;
  assert.ok(on(400, 300 + (reach + 19) / 1.4) && !on(400, 300 + (reach + 21) / 1.4));
  assert.ok(!on(400, 300 + (reach + 11) / 1.4, 0.5) && on(400, 300 + (reach + 9) / 1.4, 0.5), 'a faded one from closer');
});

test('under your lantern and on the thread: both lights count; not friends: your lantern as ever', () => {
  const lone = visit(), pals = visit({ friends: [[1, 2]] });
  for (const v of [lone, pals]) { v.lamp(400, 300); v.wisp(0, 400, 300); v.run(0.4); }
  assert.deepEqual(lone.threads(), []); assert.deepEqual(pals.threads(), ['1+2']);
  // (the thread takes hold of a wisp in a twelfth of a second; your lantern takes as long to light and as long again to take hold)
  const lantern = (0.28 + 0.2 * 3) * (0.4 - 10 * DT), thread = pals.page.GLOOM_TIE * (0.4 - 5 * DT);
  assert.ok(Math.abs(1 - lone.g.wisps[0].hp - lantern) < 0.02, `your lantern and three who shine: ${1 - lone.g.wisps[0].hp}`);
  assert.ok(Math.abs(1 - pals.g.wisps[0].hp - lantern - thread) < 0.04, `and the thread on top: ${1 - pals.g.wisps[0].hp}`);
  assert.equal(lone.g.wisps[0].tie, 0);
});

test('nothing changes where nobody is friends: the same visit, frame for frame', () => {
  // (one nest where nobody has met, one where two have met four times: not friends yet)
  const plain = visit(), also = visit({ friends: [[1, 2, 4]] });
  for (const v of [plain, also]) {
    v.lamp(420, 310); v.wisp(0, 400, 300); v.wisp(1, 700, 100); v.wisp(2, 100, 350);
    v.run(3, k => { if (k === 60) v.lamp(650, 150); });
  }
  const tell = v => JSON.stringify(v.g.wisps.map(w => [w.on, w.x, w.y, w.hp, w.lit, w.tie]));
  assert.equal(tell(plain), tell(also));
  for (const v of [plain, also]) {
    assert.ok(v.g.wisps.every(w => w.tie === 0)); assert.ok(v.g.threads.every(t => !t.on && !t.live));
    assert.equal(v.g.tied.length, 0); assert.equal(v.g.told.length, 0); assert.equal(v.g.pair, null);
    assert.ok(v.creatures.every(c => !c.mem), 'no diary knows of a thread');
    assert.ok(!v.did.emotes.some(([, e]) => e === '♥'));
  }
  // the lantern alone frees a wisp at its old pace: 0.28 and 0.2 for each who shines, a second
  const v = visit({ at: { 1: [300, 300] } });
  v.lamp(400, 300); v.wisp(0, 400, 300);
  v.run(1 / 0.48 + 10 * DT - 0.05);
  assert.equal(v.g.wisps[0].on, true);
  v.run(0.1);
  assert.equal(v.g.wisps[0].on, false);
});

test('the diary keeps it once a visit for each of them, however often the thread comes and goes', () => {
  const v = visit({ friends: [[1, 2]] });
  v.lamp(400, 300); v.run(0.3);
  assert.deepEqual(v.diary(1), ['Held the light with Mossmew ♥']);
  assert.deepEqual(v.diary(2), ['Held the light with Dozeling ♥']);
  assert.deepEqual(v.diary(3), []);
  // they show it once: a heart over each, the first time
  assert.deepEqual(v.did.emotes.filter(([, e]) => e === '♥').map(([id]) => id).sort(), [1, 2]);
  const saved = v.did.saved;
  assert.ok(saved >= 1, 'and it is saved');
  // let go and taken up again, again and again: nothing more is written, shown or saved
  for (let k = 0; k < 5; k++) { v.g.lamp.on = false; v.run(0.3); v.lamp(400, 300); v.run(0.3); }
  assert.equal(v.diary(1).length, 1); assert.equal(v.diary(2).length, 1);
  assert.equal(v.did.emotes.filter(([, e]) => e === '♥').length, 2);
  assert.equal(v.did.saved, saved);
  // the diary holds the words and the name apart, so they follow the language
  assert.deepEqual(JSON.parse(JSON.stringify(v.cr(1).mem.map(m => [m.k, m.a]))), [['Held the light with {0} ♥', ['Mossmew']]]);
  // another day, another visit: once more
  v.page.gloomEnd(false);
  assert.equal(v.page.gloomCome(), true);
  v.lamp(400, 300); v.run(0.3);
  assert.equal(v.diary(1).length, 2); assert.equal(v.diary(2).length, 2);
});

test('three friends: each diary keeps one moment a visit, with whoever it held a thread with first', () => {
  const v = visit({ friends: [[1, 2], [2, 3], [1, 3]] });
  v.lamp(400, 320); v.run(0.3);
  assert.deepEqual(v.threads(), ['1+2', '1+3', '2+3']);
  for (const id of [1, 2, 3]) assert.equal(v.diary(id).length, 1, `one line for ${id}`);
  assert.deepEqual(Array.from(v.g.told).sort(), [1, 2, 3]);
  // and all three pairs have shown it
  assert.equal(v.g.tied.length, 3);
});

test('the closing word names the friends whose thread a wisp let go on, and only then', () => {
  const v = visit({ friends: [[1, 2]], last: true });
  v.lamp(400, 300); v.wisp(0, 400, 300);
  v.run(3);
  assert.equal(v.g.on, false, 'the last wisp gone, the visit is over');
  assert.deepEqual(v.did.toasts, ['It\'s lighter now. Dozeling and Mossmew held the light together.']);
  assert.equal(v.g.pair, null, 'and the next visit starts with no such pair');
  const plain = visit({ last: true });
  plain.lamp(400, 300); plain.wisp(0, 400, 300);
  plain.run(4);
  assert.deepEqual(plain.did.toasts, ['It\'s lighter now. Together.']);
  // friends who held a thread that caught nothing: the plain word
  const idle = visit({ friends: [[1, 2]], at: { 1: [300, 300], 2: [500, 300] }, last: true });
  idle.lamp(400, 300 - B * 1.1); idle.wisp(0, 400, 300 - B * 1.1);
  idle.run(0.3);
  assert.deepEqual(idle.threads(), ['1+2']);
  idle.run(6);
  assert.equal(idle.g.on, false);
  assert.deepEqual(idle.did.toasts, ['It\'s lighter now. Together.']);
});

test('the lantern has to be lit: left alone, friends hold no thread and the wisps drift off by themselves', () => {
  const v = visit({ friends: [[1, 2], [2, 3], [1, 3]], last: true });
  v.wisp(0, 400, 300); v.g.wisps[0].life = 6;
  v.run(12);
  assert.equal(v.g.on, false);
  assert.equal(v.page.save.shards, 0); assert.deepEqual(v.did.toasts, []);
  assert.ok(v.creatures.every(c => !c.mem));
});

test('every new word has its Ukrainian', () => {
  for (const key of ['Held the light with {0} ♥', 'It\'s lighter now. {0} and {1} held the light together.']) {
    assert.ok(playJs.includes(`"${key}"`), `play.js should say: ${key}`);
    assert.match(i18n, new RegExp(`^  "${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}": "[^"]*[а-яіїє][^"]*",$`, 'm'), `no Ukrainian for: ${key}`);
  }
});

// ---------- a friend's charm on the wall ----------

const plain = v => JSON.parse(JSON.stringify(v));
const OLD = { v: 1, stars: { 1: 3 }, creatures: [], seen: {} }; // a nest from before charms could hang
/** A save as it comes through the door: written to a pretend storage, then loaded the way the game loads it. */
function load(d) {
  const { sparkSaveOf } = require('../js/sparks.js'), { keeperMigrate } = require('../js/inner.js'), { KEEPSAKES, KEEP_WEAR, walkSaveOf } = require('../js/walk.js'), { wardSaveOf } = require('../js/wards.js');
  const page = {
    SAVE_KEY: 'k', BAK_KEY: 'k.bak', localStorage: { getItem: k => k === 'k' && d ? JSON.stringify(d) : null, setItem: () => {} },
    sparkSaveOf, keeperMigrate, walkSaveOf, wardSaveOf, KEEP_WEAR, KS: Object.fromEntries(KEEPSAKES.map(k => [k.id, k])),
  };
  vm.runInNewContext(cut(saveJs, 'const SAVE_VERSION', 'const save = loadSave();', 'the save\'s way in should sit at the top of save.js') + '\nthis.loaded = loadSave(); this.migrate = migrate; this.freshSave = freshSave; this.hungSaveOf = hungSaveOf;', page);
  return { save: plain(page.loaded), migrate: page.migrate, freshSave: page.freshSave, hungSaveOf: h => plain(page.hungSaveOf(h)) };
}
/** The chest's charms over a pretend save: the charms and the hanging of them as they stand in gifts.js. */
function chest(save = {}) {
  const did = { toasts: [], saved: 0, opened: 0 };
  const page = {
    save, tr: fill, toast: t => did.toasts.push(t), persist: () => did.saved++, sfx: { setDown: () => {}, tick: () => {} },
    $: () => ({ classList: { contains: () => false } }), openShop: () => did.opened++, giftImg: (k, i) => `[${i}]`,
  };
  vm.runInNewContext([
    line(giftsJs, /^const CHARMS = .*$/m, 'the charms should be one line in gifts.js'),
    line(giftsJs, /^const giftEsc = .*$/m, 'giftEsc should be one line in gifts.js'),
    cut(giftsJs, 'const charmHung = ', '\nfunction charmTap(', 'the hanging of charms should sit together in gifts.js'),
    cut(giftsJs, 'function charmTap(', '\n}\n', 'charmTap should sit in gifts.js') + '\n}',
    'Object.assign(this, { CHARMS, charmHung, giftCharmList, giftCharmTiles, charmHang, charmTap });',
  ].join('\n'), page);
  return { page, did, save };
}

test('the charm on the wall is kept apart from the chest\'s list, so it stays when the list is trimmed', () => {
  // forty charms came, one a day; the first of them is hung
  const charms = Array.from({ length: 40 }, (_, i) => ({ c: ['heart', 'star', 'moon'][i % 3], from: 'Friend ' + i, at: 1000 + i }));
  const c = chest({ charms: charms.slice(0, 30) });
  c.page.charmHang(0);
  assert.deepEqual(plain(c.save.hung), { c: 'heart', from: 'Friend 0', at: 1000 });
  assert.equal(c.did.saved, 1);
  assert.deepEqual(c.did.toasts, ['Heart charm hangs on the nest\'s wall now ✦']);
  // ten more come, and the chest keeps the last thirty, as acceptGift does
  c.save.charms = [...c.save.charms, ...charms.slice(30)].slice(-30);
  assert.ok(!c.save.charms.some(x => x.from === 'Friend 0'), 'the chest\'s own list has let it go');
  assert.deepEqual(plain(c.page.charmHung()), { c: 'heart', from: 'Friend 0', at: 1000 }, 'the wall has not');
  // through the door and back: still there, and the chest still shows it, first and marked as hung
  const { save } = load({ ...OLD, charms: c.save.charms, hung: c.save.hung });
  assert.deepEqual(save.hung, { c: 'heart', from: 'Friend 0', at: 1000 });
  assert.equal(save.charms.length, 30);
  const again = chest(save);
  assert.equal(again.page.giftCharmList().length, 31);
  assert.match(again.page.giftCharmTiles(), /^<button class="tile owned charm placed on" data-hang="0">\[heart\]<b>Heart charm<\/b><small>from Friend 0<\/small><span class="hang">Take down<\/span>/);
  // taken down, it goes back into the chest's list rather than being lost
  again.page.charmHang(0);
  assert.equal(again.save.hung, undefined);
  assert.equal(again.save.charms.length, 30);
  assert.deepEqual(plain(again.save.charms[29]), { c: 'heart', from: 'Friend 0', at: 1000 });
  assert.deepEqual(again.did.toasts, ['Heart charm is back in the chest']);
});

test('one charm hangs at a time: another takes its place, the same one again takes it down', () => {
  const c = chest({ charms: [{ c: 'heart', from: 'Vika', at: 1 }, { c: 'moon', from: '', at: 2 }, { c: 'star', from: 'Vika', at: 3 }] });
  const marks = () => (c.page.giftCharmTiles().match(/<span class="hang">[^<]*/g) || []).map(s => s.slice(19));
  assert.deepEqual(marks(), ['Hang on the wall', 'Hang on the wall', 'Hang on the wall']);
  c.page.charmHang(1);
  assert.deepEqual(plain(c.save.hung), { c: 'moon', from: '', at: 2 });
  assert.deepEqual(marks(), ['Hang on the wall', 'Take down', 'Hang on the wall']);
  c.page.charmHang(2);
  assert.deepEqual(plain(c.save.hung), { c: 'star', from: 'Vika', at: 3 });
  assert.deepEqual(marks(), ['Hang on the wall', 'Hang on the wall', 'Take down']);
  assert.equal(c.save.charms.length, 3, 'they all stay in the chest');
  c.page.charmHang(2);
  assert.equal(c.save.hung, undefined);
  assert.equal(c.save.charms.length, 3);
  assert.deepEqual(marks(), ['Hang on the wall', 'Hang on the wall', 'Hang on the wall']);
  // a tile that isn't there: nothing
  c.page.charmHang(7); c.page.charmHang(-1); c.page.charmHang(NaN);
  assert.equal(c.save.hung, undefined);
  assert.equal(c.did.saved, 3);
  // no charms at all: no tiles, nothing hung, a tap says nothing
  const none = chest({});
  assert.equal(none.page.giftCharmTiles(), ''); assert.equal(none.page.charmHung(), null);
  none.page.charmTap();
  assert.deepEqual(none.did.toasts, []);
});

test('a tap on the hung charm says what it is and who it is from; a name is only ever text', () => {
  const c = chest({ charms: [{ c: 'star', from: '<b>Vi&ka</b>', at: 1 }, { c: 'moon', from: '', at: 2 }] });
  assert.match(c.page.giftCharmTiles(), /<small>from &lt;b&gt;Vi&amp;ka&lt;\/b&gt;<\/small>/);
  assert.doesNotMatch(c.page.giftCharmTiles(), /<b>Vi/);
  c.page.charmHang(0); c.page.charmTap();
  // (a toast is written as text, never as markup)
  assert.equal(c.did.toasts[1], 'Star charm · from <b>Vi&ka</b>');
  c.page.charmHang(1); c.page.charmTap();
  assert.equal(c.did.toasts[3], 'Moon charm · from a friend');
});

test('old saves, and whatever else turns up where the hung charm is kept', () => {
  // a save from before charms could hang: nothing there, and nothing put there
  const old = load({ ...OLD, charms: [{ c: 'heart', from: 'Vika', at: 5 }] }).save;
  assert.equal('hung' in old, false); assert.equal(old.charms.length, 1);
  assert.equal('hung' in load(null).save, false);
  const { hungSaveOf, migrate, freshSave } = load(null);
  for (const bad of [null, undefined, 0, 1, 'heart', true, [], ['heart'], {}, { c: 5 }, { c: '' }, { c: 'Heart' }, { c: '<img>' }, { c: 'a'.repeat(17) }, { from: 'Vika' }, { c: ['heart'] }, { c: { c: 'heart' } }]) {
    assert.equal(hungSaveOf(bad), null, `not a charm: ${JSON.stringify(bad)}`);
    assert.equal('hung' in migrate(Object.assign(freshSave(), { hung: bad })), false);
  }
  // what's kept: its kind, who it's from and when it came, and nothing else
  assert.deepEqual(hungSaveOf({ c: 'moon', from: 'Vika', at: 7, x: 1, name: 'no' }), { c: 'moon', from: 'Vika', at: 7 });
  assert.deepEqual(hungSaveOf({ c: 'moon' }), { c: 'moon', from: '', at: 0 });
  assert.deepEqual(hungSaveOf({ c: 'moon', from: 5, at: 'now' }), { c: 'moon', from: '', at: 0 });
  assert.deepEqual(hungSaveOf({ c: 'moon', from: null, at: Infinity }), { c: 'moon', from: '', at: 0 });
  // a name is trimmed, cleared of line breaks and cut to 24 letters (whole ones)
  assert.equal(hungSaveOf({ c: 'star', from: '  Vi\nka\t ' }).from, 'Vika');
  assert.equal(hungSaveOf({ c: 'star', from: 'я'.repeat(40) }).from, 'я'.repeat(24));
  assert.equal(hungSaveOf({ c: 'star', from: '🌙'.repeat(40) }).from, '🌙'.repeat(24));
  // a kind of charm this game doesn't know (a save from a newer one) is kept in the save, and simply not hung
  assert.deepEqual(plain(migrate(Object.assign(freshSave(), { hung: { c: 'comet', from: 'Vika', at: 3 } })).hung), { c: 'comet', from: 'Vika', at: 3 });
  const c = chest({ hung: { c: 'comet', from: 'Vika', at: 3 } });
  assert.equal(c.page.charmHung(), null); assert.equal(c.page.giftCharmTiles(), '');
  assert.equal(visit({ save: { hung: { c: 'comet', from: 'Vika', at: 3 } } }).page.charmSpot(), null);
  // the same way in for a backup code and a nest adopted from another tab: through migrate
  assert.match(cut(saveJs, 'function migrate(', '\n}\n', 'migrate should sit in save.js'), /const hung = hungSaveOf\(d\.hung\);\n\s*if \(hung\) d\.hung = hung; else delete d\.hung;/);
});

/** A visit in a nest with a charm on its wall: hung on the right wall, its light falls on the floor at (835, 58), and a
 *  glowling stands close by, so a wisp there doesn't drift off after someone further away. */
const HUNG = { c: 'heart', from: 'Vika', at: 1 }, LIGHT = [835, 58];
const charmVisit = (o = {}) => { const v = visit({ at: { 1: [835, 148] }, ...o, save: { hung: HUNG, ...o.save } }); v.page.gloomArt.R = 10; v.page.gloomArt.P = 2; return v; };

test('the charm\'s light wears a wisp thin, slowly, with no lantern on it; and only within its reach', () => {
  const v = charmVisit(), g = v.g, reach = B * v.page.GLOOM_CHARM_R;
  const at = v.page.charmSpot();
  assert.deepEqual([Math.round(at.fx), Math.round(at.fy)], LIGHT);
  assert.ok(at.wall === 'R' && at.x > 400 + B && at.y < at.fy - B, 'it hangs up on the right wall, the one with no window in it');
  // one in the light, one a good way out of it
  v.wisp(0, LIGHT[0], LIGHT[1] + 20); v.wisp(1, 150, 300);
  v.run(1);
  assert.ok(Math.abs(1 - g.wisps[0].hp - v.page.GLOOM_CHARM) < 1e-6, `a second in its light: ${1 - g.wisps[0].hp}`);
  assert.equal(g.wisps[1].hp, 1);
  assert.equal(g.wisps[0].lit, 0); assert.equal(g.wisps[0].tie, 0);
  // gentle: a good deal slower than your lantern alone (0.28 a second), and far slower than a thread
  assert.ok(v.page.GLOOM_CHARM <= 0.28 / 2 && v.page.GLOOM_CHARM < v.page.GLOOM_TIE / 5);
  // its reach: so far over the floor to a wisp's edge, a step toward the back counting for 1.4
  const w = g.wisps[1], within = (x, y, k = 1) => v.page.gloomInCharm(Object.assign(w, { x, y, k }), at);
  assert.ok(within(LIGHT[0] + reach + 19, LIGHT[1]) && !within(LIGHT[0] + reach + 21, LIGHT[1]));
  assert.ok(within(LIGHT[0] - reach - 19, LIGHT[1]) && !within(LIGHT[0] - reach - 21, LIGHT[1]));
  assert.ok(within(LIGHT[0], LIGHT[1] + (reach + 19) / 1.4) && !within(LIGHT[0], LIGHT[1] + (reach + 21) / 1.4));
  assert.ok(within(LIGHT[0] + reach + 9, LIGHT[1], 0.5) && !within(LIGHT[0] + reach + 11, LIGHT[1], 0.5), 'a faded one from closer');
  assert.ok(reach < B, 'a small pool of light: less than a glowling across to either side');
});

test('the charm never frees a wisp: it leaves that to your lantern, so nothing is won by waiting', () => {
  const v = charmVisit({ last: true }), g = v.g, low = v.page.GLOOM_CHARM_LOW;
  v.wisp(0, LIGHT[0], LIGHT[1] + 20);
  v.run(20);
  assert.equal(g.wisps[0].on, true);
  assert.equal(g.wisps[0].hp, low, 'worn down to what the charm leaves, and no further');
  assert.ok(low >= 0.3 && low <= 0.6);
  assert.equal(g.freed, 0); assert.equal(v.page.save.shards, 0); assert.deepEqual(v.did.toasts, []);
  assert.equal(g.on, true, 'the visit goes on');
  // left alone, it drifts off by itself like any other, and nothing is given for it
  g.wisps[0].life = g.wisps[0].t + 1;
  v.run(12);
  assert.equal(g.on, false);
  assert.equal(v.page.save.shards, 0); assert.deepEqual(v.did.toasts, []);
  // your lantern on one the charm has worn thin: it lets go sooner than a whole one would
  const worn = charmVisit({ last: true }), whole = visit({ at: { 1: [835, 148] }, last: true });
  worn.wisp(0, LIGHT[0], LIGHT[1] + 20); worn.run(8);
  assert.equal(worn.g.wisps[0].hp, low);
  let tw = 0, th = 0;
  whole.wisp(0, LIGHT[0], LIGHT[1] + 20);
  worn.lamp(LIGHT[0], LIGHT[1] + 20); worn.run(6, () => { if (worn.g.wisps[0].on) tw++; });
  whole.lamp(LIGHT[0], LIGHT[1] + 20); whole.run(6, () => { if (whole.g.wisps[0].on) th++; });
  assert.equal(worn.page.save.shards, 1, 'one shard, as for any wisp'); assert.equal(whole.page.save.shards, 1);
  assert.ok(tw < th * 0.55, `worn thin: ${tw} frames; whole: ${th}`);
});

test('under your lantern in the charm\'s light: both count, until the charm has done its part', () => {
  const v = charmVisit({ at: { 1: [150, 350] } }), plainV = visit({ at: { 1: [150, 350] } });
  for (const x of [v, plainV]) { x.wisp(0, LIGHT[0], LIGHT[1] + 20); x.lamp(LIGHT[0], LIGHT[1] + 20); x.run(1); }
  // (nobody is close enough to shine with you: your lantern alone, 0.28 a second once it has taken hold)
  assert.equal(v.g.helpers, 0);
  const lantern = 1 - plainV.g.wisps[0].hp;
  assert.ok(Math.abs(lantern - 0.28 * (1 - 10 * DT)) < 0.28 * DT * 1.5, `your lantern alone: ${lantern}`);
  assert.ok(Math.abs(1 - v.g.wisps[0].hp - lantern - v.page.GLOOM_CHARM) < 1e-6, `and the charm on top: ${1 - v.g.wisps[0].hp}`);
});

test('no charm on the wall, or not in this room: the same visit, frame for frame', () => {
  const tell = v => JSON.stringify([v.g.wisps.map(w => [w.on, w.x, w.y, w.hp, w.lit, w.tie, w.k]), v.g.freed, v.page.save.shards, v.did.sparks.length, v.did.toasts]);
  const go = v => { v.lamp(420, 310); v.wisp(0, LIGHT[0], LIGHT[1] + 20); v.wisp(1, 700, 100); v.wisp(2, 100, 350); v.run(4, k => { if (k === 90) v.lamp(650, 150); }); return tell(v); };
  const bare = go(visit());
  // charms in the chest but none hung; one this game doesn't know; rubbish where it's kept
  assert.equal(go(visit({ save: { charms: [HUNG, { c: 'moon', from: '', at: 2 }] } })), bare);
  assert.equal(go(visit({ save: { hung: { c: 'comet', from: 'Vika', at: 3 } } })), bare);
  assert.equal(go(visit({ save: { hung: 'heart' } })), bare);
  // and with one hung it is not the same: the wisp in its light has worn thinner
  assert.notEqual(go(visit({ save: { hung: HUNG } })), bare);
  // no charm: no place for one, nothing under a finger
  const v = visit();
  assert.equal(v.page.charmSpot(), null); assert.equal(v.page.charmAt(925, -150), false);
  // hung, it is there in the nest and under a finger, and nowhere in another room
  const h = visit({ save: { hung: HUNG } }), at = h.page.charmSpot();
  assert.equal(h.page.charmAt(at.x + 5, at.y - 5), true); assert.equal(h.page.charmAt(at.x + B, at.y), false);
  h.page.save.room = 1;
  assert.equal(h.page.charmSpot(), null); assert.equal(h.page.charmAt(at.x, at.y), false);
});

test('the charm glows while the shadows are in, and settles again after', () => {
  const v = charmVisit({ last: true }), g = v.g;
  assert.equal(g.glow, 0);
  v.run(1);
  assert.equal(g.glow, 1);
  // the last wisp drifts off: the visit ends, and the glow goes down by itself
  v.wisp(0, 150, 300); g.wisps[0].life = g.wisps[0].t + 0.5;
  v.run(12);
  assert.equal(g.on, false);
  for (let k = 0; k < 60; k++) v.page.updateGloom(DT);
  assert.equal(g.glow, 0);
});

test('every new word about the charm has its Ukrainian', () => {
  const uk = key => assert.match(i18n, new RegExp(`^  "${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}": "[^"]*[а-яіїє][^"]*",$`, 'm'), `no Ukrainian for: ${key}`);
  for (const key of ['Hang on the wall', 'Take down', '{0} hangs on the nest\'s wall now ✦', '{0} is back in the chest']) {
    assert.ok(giftsJs.includes(`"${key}"`), `gifts.js should say: ${key}`);
    uk(key);
  }
  // who it's from, by the charm while it glows: the words the chest already has
  for (const key of ['from {0}', 'from a friend']) { assert.ok(playJs.includes(`tr("${key}"`), `play.js should say: ${key}`); uk(key); }
});
