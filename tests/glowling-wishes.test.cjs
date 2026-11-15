const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// save.js needs the whole game around it, so only the daydreams' part is run here (in the code a glowling's wish is a
// "fancy"), with what it leans on beside it: what a glowling calls you for, who is content, the kinds, the furniture and
// the diary, over a pretend nest
const saveJs = read('save.js'), nestJs = read('nest.js'), isoJs = read('iso.js'), dataJs = read('data.js'), playJs = read('play.js'), walkJs = read('walk.js'), ui = read('ui.js'), crackJs = read('crack.js'), pixelJs = read('pixel.js');
const callsSrc = cut(saveJs, '/** What a glowling is calling you for', '/** A little "!" on the Nest tab', 'callOf should sit in save.js, before updateCalls');
const fancySrc = [
  cut(dataJs, 'const DECOR = [', 'if (LANG === "uk")', 'the furniture should be one list in data.js'),
  line(dataJs, /^const DECO = .*$/m, 'DECO should be one line in data.js'),
  cut(nestJs, 'const BEHAVIOR = {', '\n};', 'the kinds of glowling should be one list in nest.js') + '\n};',
  line(nestJs, /^const kindOf = .*$/m, 'kindOf should be one line in nest.js'),
  line(nestJs, /^const hasDecor = .*$/m, 'hasDecor should be one line in nest.js'),
  cut(nestJs, '/** Keep a moment in a glowling\'s diary', '/** Its best friend', 'the diary should sit in nest.js, before bestFriend'),
  callsSrc,
  line(isoJs, /^const content = .*$/m, 'content should be one line in iso.js'),
  cut(saveJs, '// ---------- glowling fancies', '// ---------- layout ----------', 'the daydreams should sit in save.js, before the layout'),
  'Object.assign(this, { DECO, FANCIES, FANCY_LIFE, FANCY_JOY, FANCY_XP, FANCY_FIRST, FANCY_GAP, fancy, fancyOf, fancyFit, fanciesFor, fancyReady, fancyBusy, fancyHere, fancyTick, fancyDone, fancyTell, fancyAt, fancyPiece, callOf, content, kindOf });',
].join('\n');

const KINDS = ['flutter', 'hop', 'nap', 'dance', 'curious', 'swim'];
const fill = (s, ...a) => a.length ? s.replace(/\{(\d)\}/g, (_, i) => a[i]) : s;
// one of each kind (petalpuff dances, mothlet flutters, dozeling naps, skyfin swims, blushbun hops, ambercub is curious)
const KIND_SP = { dance: 'petalpuff', flutter: 'mothlet', nap: 'dozeling', swim: 'skyfin', hop: 'blushbun', curious: 'ambercub' };
/** A seeded dice, so a run can be told again. */
const dice = seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
/** A glowling of a kind: fed, rested and glad unless told otherwise. */
const glowling = (id, kind, o = {}) => ({ id, name: 'G' + id, sp: KIND_SP[kind], level: 3, xp: 0, tummy: 80, joy: 60, energy: 70, sleeping: false, room: 0, ...o });
const sixKinds = () => KINDS.map((k, i) => glowling(i + 1, k));
/** Every piece a daydream can be about, set out in the room. */
const ALL_PIECES = ['cushion', 'spring', 'birdbath', 'drum', 'painting', 'telescope', 'swing', 'lamp', 'mushrooms', 'lights', 'lamppost'];

/** A pretend nest: its glowlings, the pieces set out in the room you're looking at, and a note of every toast, save and XP. */
function nest(creatures, pieces = [], roll = () => 0) {
  const toasts = [], xp = [], saves = [];
  const page = {
    roll, PX_ICON_MAPS: {}, LANG: 'en', N: { iso: true }, actors: new Map(),
    save: { creatures, decor: Object.fromEntries(pieces.map(id => [id, { on: true }])), rooms: [{ kind: 'nest' }, { kind: 'play' }], room: 0, dust: [], tips: { pet: 1 } },
    game: { scene: 'nest', time: 0 }, arrange: { on: false }, gloomNow: { on: false }, talkNow: null, talkQueue: [], coopSession: null, overlays: [],
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)), tr: fill, specOf: c => c.mix ? { beh: c.mix.beh, voice: 1 } : { voice: 1 },
    keptQuiet: () => false, nestRoom: () => 0, isPlace: () => false,
    addXP: (c, n) => { xp.push([c.id, n]); }, persist: () => { saves.push(1); }, toast: t => { toasts.push(t); },
    emote: () => {}, burst: () => {}, heart: () => {}, renderNest: () => {}, actorView: () => ({ x: 0, y: 0, size: 60 }), sfx: { chirp: () => {} },
  };
  page.roomOf = c => c.room || 0;
  page.residents = r => page.save.creatures.filter(c => !c.out && page.roomOf(c) === r);
  page.tipDone = id => !!page.save.tips[id];
  page.$$ = () => page.overlays;
  // (everything set out stands on the floor, as the room's layout would say)
  page.isoLayout = () => ({ placed: Object.fromEntries(Object.keys(page.save.decor).filter(id => page.save.decor[id].on).map(id => [id, { id }])) });
  vm.createContext(page);
  vm.runInContext('Math.random = () => roll(); const rand = (a, b) => a + Math.random() * (b - a), pick = arr => arr[Math.floor(Math.random() * arr.length)];\n' + fancySrc, page);
  /** Time passes in the nest, half a second at a time; `each` looks in after every step. */
  const run = (seconds, each) => { for (let t = 0; t < seconds; t += 0.5) { page.fancyTick(0.5); if (each) each(); } };
  /** On until someone daydreams (or the time is up). */
  const until = (seconds = 3600) => { for (let t = 0; t < seconds && !page.fancy.on; t += 0.5) page.fancyTick(0.5); return page.fancy.on; };
  const dreamer = () => page.fancy.on && page.save.creatures.find(c => c.id === page.fancy.on.id);
  const needy = () => page.save.creatures.filter(c => page.callOf({ ...c })).length;
  return { page, save: page.save, fancy: page.fancy, toasts, xp, saves, run, until, dreamer, needy };
}
const diary = c => [...(c.mem || [])].map(m => fill(m.k, ...m.a));
const offered = (n, c) => [...n.page.fanciesFor(c)].map(f => f.id);
const w = nest([]).page;

test('every kind of glowling has daydreams of its own, each with a picture, a line to say, a diary line and a way to come true', () => {
  for (const k of KINDS) assert.ok(w.FANCIES.some(f => f.kinds.includes(k)), `the ${k} kind never daydreams`);
  assert.equal(new Set(w.FANCIES.map(f => f.id)).size, w.FANCIES.length, 'each has its own name');
  for (const f of w.FANCIES) {
    for (const k of f.kinds) assert.ok(KINDS.includes(k), `${f.id}: ${k}`);
    assert.match(f.dream, /^\{0\} is dreaming of /, f.id);
    assert.match(f.mem, /^Wished /, f.id);
    assert.ok(f.by.length > 0 && typeof f.can === 'function', f.id);
    // the picture is one of the new little ones, or an icon the game already has
    const map = w.PX_ICON_MAPS[f.icon];
    if (map) { assert.equal(map.length, 12, f.icon); for (const row of map) assert.equal(row.length, 12, f.icon); }
    else assert.match(pixelJs + walkJs, new RegExp(`\\b${f.icon}: \\[`), `${f.id}: no picture called ${f.icon}`);
    // a piece that makes it come true with a tap is one this kind loves anyway
    for (const by of f.by) if (by.startsWith('tap:')) {
      const d = w.DECO[by.slice(4)];
      assert.ok(d, `${f.id}: ${by}`);
      assert.ok(f.kinds.every(k => d.lovers.includes(k)), `${f.id}: ${d.id} is not for the ${f.kinds} kind`);
    }
  }
});

test('only a content glowling daydreams: never a hungry, sleepy, lonely, half-fed, sleeping or absent one', () => {
  const not = [
    glowling(1, 'hop', { tummy: 20 }), glowling(2, 'hop', { energy: 10 }), glowling(3, 'hop', { joy: 10 }), glowling(4, 'hop', { tummy: 35 }),
    glowling(5, 'hop', { sleeping: true }), glowling(6, 'hop', { out: true }), glowling(7, 'hop', { out: true, trip: { place: 'amethyst' } }),
  ];
  const a = nest(not, ALL_PIECES, dice(7));
  for (const c of not) assert.deepEqual(offered(a, c), [], c.id + ' should have nothing to daydream of');
  a.run(3600, () => assert.equal(a.fancy.on, null));
  // dust about the nest makes everyone there call "messy": no daydreams then either
  const messy = nest([glowling(1, 'hop'), glowling(2, 'dance')], ALL_PIECES, dice(7));
  messy.save.dust = [[0, 0], [1, 1]];
  messy.run(3600, () => assert.equal(messy.fancy.on, null));
  // one content one among them: it is the one
  const b = nest([...not.map(c => ({ ...c })), glowling(8, 'hop')], ALL_PIECES, dice(7));
  assert.ok(b.until());
  assert.equal(b.dreamer().id, 8);
  // and a napping one is left to nap
  const c = nest([glowling(1, 'hop'), glowling(2, 'hop')], [], dice(7));
  c.page.actors.set(1, { state: 'nap' }); c.page.actors.set(2, { state: 'idle' });
  assert.ok(c.until());
  assert.equal(c.dreamer().id, 2);
});

test('one daydream at a time, a good while apart, and only where you are looking', () => {
  const a = nest(sixKinds(), ALL_PIECES, dice(11));
  // the first comes after a minute or two of looking at the room
  let t = 0;
  while (!a.fancy.on && t < 600) { a.page.fancyTick(0.5); t += 0.5; }
  assert.ok(a.fancy.on);
  assert.ok(t >= w.FANCY_FIRST[0] && t <= w.FANCY_FIRST[1] + 1, `the first after ${t} s`);
  // while it is up nobody else starts one, and it stays the same one
  const first = { ...a.fancy.on };
  let up = 0;
  a.run(w.FANCY_LIFE - 2, () => {
    up++;
    assert.equal(a.save.creatures.filter(c => a.page.fancyOf(c.id)).length, 1);
    assert.equal(a.fancy.on.id, first.id); assert.equal(a.fancy.on.what, first.what);
  });
  assert.ok(up > 150);
  // it fades, and the next is minutes away
  a.run(4);
  assert.equal(a.fancy.on, null);
  let gap = 0;
  while (!a.fancy.on && gap < 1200) { a.page.fancyTick(0.5); gap += 0.5; }
  assert.ok(a.fancy.on);
  assert.ok(gap >= w.FANCY_GAP[0] && gap <= w.FANCY_GAP[1] + 1, `the next after ${gap} s`);
  // nobody daydreams in a room you aren't looking at
  const b = nest(sixKinds().map(c => ({ ...c, room: 1 })), ALL_PIECES, dice(11));
  b.run(3600, () => assert.equal(b.fancy.on, null));
});

test('a daydream is only ever of something that can come true here and now', () => {
  // a bare room: a game, a song, a walk are always there; the rest need their piece
  const bare = nest(sixKinds());
  const of = (n, kind) => offered(n, n.save.creatures.find(c => n.page.kindOf(c) === kind));
  assert.deepEqual(of(bare, 'hop'), ['catch']);
  assert.deepEqual(of(bare, 'dance'), ['song']);
  assert.deepEqual(of(bare, 'curious'), ['walk']);
  for (const k of ['swim', 'flutter', 'nap']) assert.deepEqual(of(bare, k), [], `the ${k} kind has nothing it could get in a bare room`);
  // a room of swimmers with nothing for them: nobody daydreams
  const dry = nest([glowling(1, 'swim'), glowling(2, 'swim')], ['mushrooms', 'lamp'], dice(3));
  dry.run(3600, () => assert.equal(dry.fancy.on, null));
  // everything set out: everything on the list
  const full = nest(sixKinds(), ALL_PIECES);
  assert.deepEqual(of(full, 'swim'), ['rain', 'splash']);
  assert.deepEqual(of(full, 'curious'), ['walk', 'picture', 'stars']);
  assert.deepEqual(of(full, 'nap'), ['swing', 'dark']);
  assert.deepEqual(of(full, 'hop'), ['catch', 'bounce']);
  assert.deepEqual(of(full, 'flutter'), ['twinkle', 'snow']);
  assert.deepEqual(KINDS.flatMap(k => of(full, k)).sort(), [...w.FANCIES].map(f => f.id).sort(), 'and nothing on the list is out of reach');
  // a piece put away, a lamp already off, a room seen straight on (no showers there): not offered
  full.save.decor.mushrooms.on = false;
  assert.deepEqual(of(full, 'hop'), ['catch']);
  full.save.decor.lamp.off = true;
  assert.deepEqual(of(full, 'nap'), ['swing']);
  full.page.N.iso = false;
  assert.deepEqual(of(full, 'swim'), ['splash']);
  assert.deepEqual(of(full, 'flutter'), ['twinkle']);
  // over many daydreams with half the pieces out, each one was on offer at the moment it began
  const n = nest(sixKinds(), ['spring', 'lamp', 'lights', 'painting'], dice(5));
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    assert.ok(n.until(), 'someone should daydream again');
    assert.ok(offered(n, n.dreamer()).includes(n.fancy.on.what), n.fancy.on.what);
    seen.add(n.fancy.on.what);
    n.run(w.FANCY_LIFE + 1);
  }
  assert.deepEqual([...seen].sort(), ['catch', 'dark', 'picture', 'song', 'splash', 'twinkle', 'walk']);
});

test('no daydreams in a brand-new nest, nor while something else is going on', () => {
  // before the first stroke, or with one glowling alone: not yet
  const fresh = nest(sixKinds(), ALL_PIECES, dice(2));
  fresh.save.tips = {};
  fresh.run(3600, () => assert.equal(fresh.fancy.on, null));
  const alone = nest([glowling(1, 'hop')], ALL_PIECES, dice(2));
  alone.run(3600, () => assert.equal(alone.fancy.on, null));
  // a window open, someone talking, the Gloom visiting, a shared egg, the furniture being moved, a place, another scene: time stands still
  const busy = [
    p => { p.overlays = [{ classList: { contains: () => false } }]; }, p => { p.talkNow = [['Mossa', 'hello']]; }, p => { p.talkQueue.push([]); },
    p => { p.gloomNow.on = true; }, p => { p.coopSession = {}; }, p => { p.arrange.on = true; }, p => { p.isPlace = () => true; }, p => { p.game.scene = 'catch'; },
  ];
  for (const [i, make] of busy.entries()) {
    const n = nest(sixKinds(), ALL_PIECES, dice(2)), wait = n.fancy.wait;
    make(n.page);
    assert.equal(n.page.fancyBusy(), true, 'busy ' + i);
    n.run(3600, () => assert.equal(n.fancy.on, null));
    assert.equal(n.fancy.wait, wait, 'the wait should not run down while busy ' + i);
  }
  // (a closed window is no window)
  const calm = nest(sixKinds(), ALL_PIECES, dice(2));
  calm.page.overlays = [{ classList: { contains: c => c === 'hidden' } }];
  assert.equal(calm.page.fancyBusy(), false);
  // and a daydream already up waits too: a game or a walk never eats it
  assert.ok(calm.until());
  const t = calm.fancy.on.t;
  calm.page.game.scene = 'walk';
  calm.run(3600);
  assert.ok(calm.fancy.on); assert.equal(calm.fancy.on.t, t);
  // but when the Gloom comes it is simply gone, with nothing lost
  calm.page.game.scene = 'nest';
  const before = JSON.stringify(calm.save);
  calm.page.gloomNow.on = true;
  calm.run(1);
  assert.equal(calm.fancy.on, null);
  assert.equal(JSON.stringify(calm.save), before); assert.deepEqual(calm.toasts, []); assert.deepEqual(calm.saves, []);
});

test('a wish that comes true: joy, a good bite of XP and a diary line, once', () => {
  const n = nest([glowling(1, 'hop'), glowling(2, 'dance')], ['mushrooms', 'spring']);
  n.fancy.on = { id: 1, what: 'bounce', t: 5 };
  const hop = n.save.creatures[0], other = n.save.creatures[1];
  // something else tapped: nothing
  assert.equal(n.page.fancyDone('tap:spring'), null);
  assert.equal(n.page.fancyDone('catch', [1]), null);
  assert.ok(n.fancy.on); assert.equal(hop.joy, 60); assert.deepEqual(n.xp, []); assert.deepEqual(diary(hop), []);
  // the mushrooms tapped: there it is
  assert.equal(n.page.fancyDone('tap:mushrooms'), hop);
  assert.equal(n.fancy.on, null);
  assert.equal(hop.joy, 60 + w.FANCY_JOY);
  assert.deepEqual(n.xp, [[1, w.FANCY_XP]]);
  assert.deepEqual(diary(hop), ['Wished for a bounce on the mushrooms and got one']);
  assert.deepEqual(n.toasts, ['G1: a wish come true ✦']);
  assert.equal(n.saves.length, 1);
  assert.deepEqual(diary(other), []); assert.equal(other.joy, 60);
  // tapped again: just the mushrooms
  assert.equal(n.page.fancyDone('tap:mushrooms'), null);
  assert.equal(hop.joy, 60 + w.FANCY_JOY); assert.equal(n.xp.length, 1); assert.equal(diary(hop).length, 1); assert.equal(n.toasts.length, 1);
  // and the next daydream is minutes away, however much you tap
  assert.ok(n.fancy.wait >= w.FANCY_GAP[0]);
  // the bite is a good one but no feast: more than a favourite snack (12), less than a level's worth at any level
  assert.ok(w.FANCY_XP > 12 && w.FANCY_XP < 20 + 1 * 15);
  // joy never runs over
  const glad = nest([glowling(1, 'hop', { joy: 95 }), glowling(2, 'dance')], ['mushrooms']);
  glad.fancy.on = { id: 1, what: 'bounce', t: 5 };
  glad.page.fancyDone('tap:mushrooms');
  assert.equal(glad.save.creatures[0].joy, 100);
});

test('each way a wish comes true: the right piece, the right shower, the game or the walk it took part in', () => {
  const grant = (kind, what, by, who) => {
    const n = nest(sixKinds(), ALL_PIECES), c = n.save.creatures.find(x => n.page.kindOf(x) === kind);
    n.fancy.on = { id: c.id, what, t: 1 };
    const got = n.page.fancyDone(by, who && who(c));
    return { n, c, got };
  };
  const ways = [
    ['swim', 'rain', 'weather:rain'], ['flutter', 'snow', 'weather:snow'], ['swim', 'splash', 'tap:spring'], ['swim', 'splash', 'tap:birdbath'],
    ['dance', 'song', 'song'], ['dance', 'song', 'tap:drum'], ['curious', 'picture', 'tap:painting'], ['curious', 'stars', 'tap:telescope'],
    ['nap', 'swing', 'tap:swing'], ['nap', 'dark', 'lamp:off'], ['hop', 'bounce', 'tap:mushrooms'], ['flutter', 'twinkle', 'tap:lights'], ['flutter', 'twinkle', 'tap:lamppost'],
  ];
  for (const [kind, what, by] of ways) {
    const { c, got } = grant(kind, what, by);
    assert.equal(got, c, `${what} by ${by}`);
    assert.equal(diary(c).length, 1);
  }
  assert.deepEqual([...new Set(ways.map(x => x[1])), 'walk', 'catch'].sort(), [...w.FANCIES].map(f => f.id).sort(), 'every daydream has a way here');
  // the wrong shower, the lamp turned on: not it
  assert.equal(grant('swim', 'rain', 'weather:snow').got, null);
  assert.equal(grant('flutter', 'snow', 'weather:rain').got, null);
  assert.equal(grant('nap', 'dark', 'lamp:on').got, null);
  // a game or a walk counts for the one who was in it
  for (const [kind, what, by] of [['hop', 'catch', 'catch'], ['dance', 'song', 'song'], ['curious', 'walk', 'walk']]) {
    assert.equal(grant(kind, what, by, c => [c.id === 1 ? 2 : 1]).got, null, `${what}: someone else played`);
    const { c, got } = grant(kind, what, by, c => [9, c.id]);
    assert.equal(got, c, what);
  }
  // a piece tapped in this room does nothing for a daydreamer in another
  const far = nest(sixKinds(), ALL_PIECES), hop = far.save.creatures.find(x => far.page.kindOf(x) === 'hop');
  far.fancy.on = { id: hop.id, what: 'bounce', t: 1 };
  hop.room = 1;
  assert.equal(far.page.fancyHere('bounce'), false);
  assert.equal(far.page.fancyDone('tap:mushrooms'), null);
  // (but its game still counts: you took it along)
  far.fancy.on.what = 'catch';
  assert.equal(far.page.fancyDone('catch', [hop.id]), hop);
});

test('a wish left alone fades after a minute or two and leaves no trace', () => {
  const n = nest(sixKinds(), ALL_PIECES, dice(9));
  const before = JSON.stringify(n.save);
  assert.ok(n.until());
  const c = n.dreamer();
  assert.ok(w.FANCY_LIFE >= 60 && w.FANCY_LIFE <= 120);
  n.run(w.FANCY_LIFE - 3);
  assert.ok(n.fancy.on, 'still up near the end');
  n.run(5);
  assert.equal(n.fancy.on, null);
  // nothing counted, nothing written, nothing saved, nothing said, and it is as glad as it was
  assert.equal(JSON.stringify(n.save), before);
  assert.deepEqual(Object.keys(c).sort(), Object.keys(glowling(1, 'hop')).sort());
  assert.deepEqual(n.saves, []); assert.deepEqual(n.toasts, []); assert.deepEqual(n.xp, []);
  assert.deepEqual(Object.keys(n.fancy).sort(), ['acc', 'last', 'on', 'wait']);
  // what made it come true a moment ago does nothing now
  for (const f of w.FANCIES) for (const by of f.by) assert.equal(n.page.fancyDone(by, [c.id]), null);
  assert.equal(JSON.stringify(n.save), before);
  // a daydreamer that gets hungry simply stops daydreaming, and so does one whose piece was put away
  const h = nest([glowling(1, 'hop'), glowling(2, 'hop')], ['mushrooms'], dice(9));
  assert.ok(h.until());
  h.dreamer().tummy = 20;
  h.run(1);
  assert.equal(h.fancy.on, null);
  const p = nest([glowling(1, 'nap'), glowling(2, 'nap')], ['swing'], dice(9));
  assert.ok(p.until());
  assert.equal(p.fancy.on.what, 'swing');
  p.save.decor.swing.on = false;
  p.run(1);
  assert.equal(p.fancy.on, null);
  // the save never learns the word
  assert.doesNotMatch(cut(saveJs, 'const SAVE_VERSION', 'const save = loadSave();', 'the save\'s way in should sit at the top of save.js'), /fancy/i);
});

test('a daydream is not a call: nobody "needs you" because of one', () => {
  const n = nest([...sixKinds(), glowling(7, 'hop', { tummy: 10 })], ALL_PIECES, dice(4));
  assert.equal(n.needy(), 1);
  assert.ok(n.until());
  assert.equal(n.needy(), 1, 'the count on the Nest tab is the hungry one alone');
  assert.equal(n.page.callOf(n.dreamer()), '');
  n.run(w.FANCY_LIFE + 1);
  assert.equal(n.needy(), 1);
  // and what lights the tab's dot, the icon by a glowling's picture and the hint under the room have never heard of it
  assert.doesNotMatch(callsSrc, /fancy/i);
  assert.doesNotMatch(cut(saveJs, 'function updateCalls()', 'function moodOf(', 'updateCalls should sit in save.js, before moodOf'), /fancy/i);
  assert.doesNotMatch(line(nestJs, /^function moodIcon\(c\) .*$/m, 'moodIcon should be one line in nest.js'), /fancy/i);
  assert.doesNotMatch(cut(crackJs, 'function nestHint()', '\n}\n', 'nestHint should sit in crack.js'), /fancy/i);
});

test('tapped while it daydreams, it says what of, in one line', () => {
  const n = nest(sixKinds(), ALL_PIECES);
  n.fancy.on = { id: 6, what: 'rain', t: 1 };
  assert.equal(n.page.fancyTell(1), false);
  assert.deepEqual(n.toasts, []);
  assert.equal(n.page.fancyTell(6), true);
  assert.deepEqual(n.toasts, ['G6 is dreaming of rain']);
  // the bubble counts too, where it was last drawn (and only while it is being drawn)
  n.fancy.on.at = { x: 100, y: 80, r: 20, t: 0 };
  assert.equal(n.page.fancyAt(105, 90), true);
  assert.equal(n.page.fancyAt(140, 80), false);
  assert.equal(n.page.fancyTell(), true);
  n.page.game.time = 1000;
  assert.equal(n.page.fancyAt(105, 90), false);
  n.fancy.on = null;
  assert.equal(n.page.fancyTell(), false); assert.equal(n.page.fancyTell(6), false);
  assert.equal(n.toasts.length, 2);
});

test('the game tells the daydreams what happened: a tap, a shower, a song, a game, a walk', () => {
  assert.match(cut(isoJs, 'function updateActors(', '\n}\n', 'updateActors should sit in iso.js'), /fancyTick\(dt\);/);
  const weather = cut(isoJs, 'function startWeather()', '\n}\n', 'startWeather should sit in iso.js');
  assert.match(weather, /fancyHere\("rain"\) \? "rain" : fancyHere\("snow"\) \? "snow" :/);
  assert.match(weather, /fancyDone\("weather:" \+ weather\.kind\)/);
  assert.match(cut(playJs, 'function playDecor(', '\n}\n', 'playDecor should sit in play.js'), /fancyDone\(hit\.id === "lamp" \? "lamp:" \+ \(save\.decor\.lamp\.off \? "off" : "on"\) : "tap:" \+ hit\.id\)/);
  assert.match(cut(playJs, 'function endCatch()', '\n}\n', 'endCatch should sit in play.js'), /fancyDone\("catch", \[cr\.id\]\)/);
  assert.match(cut(playJs, 'function endEcho()', '\n}\n', 'endEcho should sit in play.js'), /fancyDone\("song", \[cr\.id\]\)/);
  assert.match(cut(nestJs, 'function openJukebox()', '\n}\n', 'openJukebox should sit in nest.js').match(/fancyDone\("song"\)/g).length + '', /^2$/);
  assert.match(cut(walkJs, 'function finishWalk()', '\n}\n', 'finishWalk should sit in walk.js'), /fancyDone\("walk", g\.who\)/);
  // the bubble is drawn last in the room, over everyone
  assert.match(cut(playJs, 'function drawNest()', '\n}\n', 'drawNest should sit in play.js'), /if \(dreamer\) drawFancy\(dreamer, actorView\(dreamer\)\);$/);
  // the bubble holds still for those who asked for less motion
  assert.match(cut(playJs, 'function drawFancy(', '\n}\n', 'drawFancy should sit in play.js'), /opts\(\)\.calm \? 0 :/);
  assert.match(cut(ui, 'function handlePointerUp(', '\n}\n', 'handlePointerUp should sit in ui.js'), /if \(a\) fancyTell\(a\.id\);/);
  assert.match(cut(ui, 'function handlePointerDown(', '\n}\n', 'handlePointerDown should sit in ui.js'), /fancyAt\(x, y\)\) \{ pointer = null; sfx\.tick\(\); fancyTell\(\); return; \}/);
});

test('every word of it is there in Ukrainian, and the help says what a daydream is', () => {
  const page = {
    location: { pathname: '/' }, addEventListener: () => {}, navigator: { languages: [] }, NodeFilter: { SHOW_TEXT: 4 },
    localStorage: { getItem: k => k === 'hatchstone.lang' ? 'uk' : null, setItem: () => {} },
    document: { documentElement: {}, body: {}, title: '', createTreeWalker: () => ({ nextNode: () => null }), querySelectorAll: () => [] },
  };
  vm.runInNewContext(read('i18n.js') + '\nObject.assign(this, { tr, UK });', page);
  const said = [...w.FANCIES.flatMap(f => [f.dream, f.mem]), '{0}: a wish come true ✦'];
  for (const s of said) {
    assert.ok(page.UK[s], `no Ukrainian for: ${s}`);
    assert.equal(page.UK[s].includes('{0}'), s.includes('{0}'), s);
  }
  // a glowling is "it" in Ukrainian too: it dreams in the present, and its diary remembers in the neuter
  for (const f of w.FANCIES) {
    assert.match(page.UK[f.dream], /^\{0\} мріє/, f.id);
    assert.match(page.UK[f.mem], /^Мріяло[ ,]/, f.id);
  }
  const faq = line(ui, /^  \["How do I look after my glowling\?", "(.*)"\],$/m, 'the help should have the looking-after question').replace(/^.*?", "/, '').replace(/"\],$/, '');
  assert.match(faq, /daydreams of something/);
  assert.ok(page.UK[faq], 'the help\'s answer about looking after a glowling should be there in Ukrainian');
  assert.match(page.UK[faq], /про щось мріє/);
});
