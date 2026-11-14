const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// play.js needs the whole game around it, so only the Gloom's visit is run here, over a pretend nest seen straight on (a
// floor 800 wide and 400 deep, a glowling 100 across): the visit from its numbers down to the end of gloomEnd, with
// areFriends and the diary's remember as they stand in nest.js
const playJs = read('play.js'), nestJs = read('nest.js'), i18n = read('i18n.js');
const visitSrc = [
  line(nestJs, /^const areFriends = .*$/m, 'areFriends should be one line in nest.js'),
  cut(nestJs, 'function remember(', '\n}\n', 'remember should sit in nest.js') + '\n}',
  cut(playJs, 'const GLOOM_WAIT = ', '/** Where the huddle is for a glowling', 'the Gloom\'s visit should sit together in play.js, down to gloomEnd'),
  'Object.assign(this, { GLOOM_HELP, GLOOM_TIE, GLOOM_TIE_R, gloomNow, gloomArt, gloomCome, updateGloom, gloomEnd, gloomSegDist, gloomOnThread, areFriends });',
].join('\n');
const B = 100, DT = 1 / 60;
const fill = (s, ...a) => a.length ? s.replace(/\{(\d)\}/g, (_, i) => a[i]) : s;

/** A pretend nest with the Gloom's shadows already in it: `friends` lists the pairs who are friends, `at` where each glowling
 *  stands on the floor. No wisp is out until a test puts one somewhere; one is still on its way in from the crack, so the
 *  visit goes on (`last: true` for a visit that ends with the wisps the test puts out). */
function visit({ friends = [], at = { 1: [300, 300], 2: [500, 300], 3: [400, 380] }, save = {}, calm = false, last = false } = {}) {
  const did = { toasts: [], emotes: [], saved: 0, sparks: [] };
  const names = { 1: 'Dozeling', 2: 'Mossmew', 3: 'Smudgekin', 4: 'Pippom' };
  const creatures = Object.keys(at).map(Number).map(id => ({ id, name: names[id], sleeping: false, joy: 50, pals: {} }));
  for (const [p, q, n = 5] of friends) creatures.find(c => c.id === p).pals[q] = n;
  const actors = new Map(creatures.map(c => [c.id, { id: c.id, x: at[c.id][0], y: at[c.id][1] }]));
  const page = {
    Math, Date, TAU: Math.PI * 2, W: 800, H: 600, N: { iso: false, base: B, x0: 0, x1: 800, y0: 0, y1: 400 },
    save: { creatures, shards: 0, room: 0, dust: [], ...save }, actors, game: { scene: 'nest', sparks: did.sparks, time: 0 },
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)), lerp: (a, b, t) => a + (b - a) * t, rand: (a, b) => (a + b) / 2, pick: arr => arr[0],
    sfx: { ready: () => false }, opts: () => ({ calm }), document: { hidden: false }, setTimeout: () => 0, $$: () => [],
    talkNow: null, talkQueue: [], giftNow: null, coopSession: null, pointer: null, arrange: { on: false }, startedEmpty: false,
    emote: (a, text) => did.emotes.push([a.id, text]), toast: t => did.toasts.push(t), tr: fill, persist: () => did.saved++,
    nestRoom: () => 0, residents: () => creatures, cnt: () => 1, bump: () => {}, tipDone: () => true, dayKey: () => 'today', coreGift: () => false,
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
