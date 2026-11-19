const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// play.js needs the whole game around it, so only hide and seek's rules (and why it can or can't start) are run here,
// beside the furniture from data.js, over a pretend Playroom
const playJs = read('play.js'), dataJs = read('data.js');
const src = [
  cut(dataJs, 'const DECOR = [', 'if (LANG === "uk")', 'the furniture should be one list in data.js'),
  line(dataJs, /^const DECO = .*$/m, 'DECO should be one line in data.js'),
  cut(playJs, '// ---------- hide and seek', '/** Is this glowling out of sight', 'hide and seek\'s rules should sit together at the end of play.js'),
  'Object.assign(this, { DECO, HIDE_MIN, HIDE_TRIES, HIDE_PAYS, HIDE_GAP, hideSpots, hidePick, hideGap, hideGuess, seekBlock, seekWho });',
].join('\n');

/** A pretend room of a kind with these pieces placed (the bed is always there) and these glowlings in it. */
function room({ kind = 'play', pieces = [], who = [{ id: 1, sleeping: false }] } = {}) {
  const placed = Object.fromEntries(['bed', ...pieces].map((id, k) => [id, { id, i: k, j: k, fw: 1, fd: 1 }]));
  const actors = new Map(who.map(c => [c.id, { id: c.id, state: c.sleeping ? 'sleep' : 'idle' }]));
  const page = {
    game: {}, save: { room: 0, rooms: [{ kind }], creatures: who, active: who[0]?.id }, actors, tr: s => s,
    isoLayout: () => ({ placed }), activeActor: () => actors.get(page.save.active),
  };
  vm.runInNewContext(src, page);
  return page;
}
/** A seeded dice, so a run can be told again. */
const dice = seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

test('it hides behind the bed and floor pieces, never the rug, the swing, the cloud, the incubator or a wall piece', () => {
  const { hideSpots } = room();
  assert.deepEqual(hideSpots(['bed', 'rug', 'swing', 'cushion', 'incubator', 'painting', 'lights', 'shelf', 'drum', 'blocks', 'chest']), ['bed', 'drum', 'blocks', 'chest']);
  // a place's own props (the forge's anvil, the lab's desk) are no hiding places
  assert.deepEqual(hideSpots(['anvil', 'labdesk']), []);
});

test('it prefers a piece its kind loves, but not every time, and never the same piece twice running', () => {
  const { hidePick } = room(), spots = ['bed', 'drum', 'blocks', 'chest', 'armchair'];
  // a dancer loves the drum (of these, only the drum): mostly there, now and then anywhere
  const R = dice(7), n = 400, got = {};
  for (let i = 0; i < n; i++) { const id = hidePick(spots, 'dance', R); got[id] = (got[id] || 0) + 1; }
  assert.ok(got.drum / n > 0.7 && got.drum / n < 0.9, `the drum ${got.drum}/${n}`);
  assert.ok(got.bed && got.armchair, 'the others get their turn too');
  // a napper loves the armchair; a hopper the drum, the blocks and the chest
  assert.equal(hidePick(spots, 'nap', () => 0), 'armchair');
  assert.ok(['drum', 'blocks', 'chest'].includes(hidePick(spots, 'hop', dice(3))));
  // just hid behind the drum: this time somewhere else (a dancer has no other loved piece here, so any of the rest)
  for (let i = 0; i < 50; i++) assert.notEqual(hidePick(spots, 'dance', dice(i + 1), 'drum'), 'drum');
  // a kind that loves none of them: any one of them
  assert.ok(spots.includes(hidePick(spots, 'swim', dice(5))));
});

test('three tries: a wrong piece costs one, the same wrong piece again costs nothing, the third miss and it pops out', () => {
  const { hideGuess, HIDE_TRIES } = room();
  assert.equal(HIDE_TRIES, 3);
  const g = { spot: 'chest', tries: 3, wrong: [] };
  assert.equal(hideGuess(g, 'bed'), 'miss'); assert.equal(g.tries, 2);
  assert.equal(hideGuess(g, 'bed'), 'again'); assert.equal(g.tries, 2);
  assert.equal(hideGuess(g, 'drum'), 'miss'); assert.equal(g.tries, 1);
  assert.equal(hideGuess(g, 'chest'), 'found');
  const h = { spot: 'chest', tries: 3, wrong: [] };
  assert.deepEqual(['bed', 'drum', 'blocks'].map(id => hideGuess(h, id)), ['miss', 'miss', 'out']);
});

test('the hints come quicker after each wrong guess', () => {
  const { hideGap } = room();
  assert.ok(hideGap(0) > hideGap(1) && hideGap(1) > hideGap(2));
  assert.equal(hideGap(5), hideGap(2));
});

test('found sooner pays a little more; popped out by itself still pays; no more than Sparkle catch at its best', () => {
  const { HIDE_PAYS } = room();
  const [out, first, second, third] = HIDE_PAYS;
  for (const k of ['joy', 'xp']) {
    assert.ok(first[k] > second[k] && second[k] > third[k] && third[k] > out[k], k);
    assert.ok(out[k] > 0, `popping out by itself still brings ${k}`);
  }
  // Sparkle catch gives up to 35 joy, and xp and shards by the score (25 sparkles: 30 xp, 8 shards)
  for (const p of HIDE_PAYS) assert.ok(p.joy <= 35 && p.xp <= 30 && p.shards <= 8);
  assert.equal(out.shards, 0);
});

test('it starts only in the Playroom, with three places to hide (the bed counts) and someone awake', () => {
  assert.equal(room({ pieces: ['drum', 'blocks'] }).seekBlock(), '');
  // too few things: say what to do about it
  assert.equal(room({ pieces: ['drum'] }).seekBlock(), 'Put a few things in the Playroom to hide behind');
  // the rug and the swing are no hiding places, so they don't make up the numbers
  assert.equal(room({ pieces: ['drum', 'rug', 'swing'] }).seekBlock(), 'Put a few things in the Playroom to hide behind');
  assert.equal(room({ kind: 'nest', pieces: ['drum', 'blocks'] }).seekBlock(), 'only in the Playroom');
  assert.equal(room({ pieces: ['drum', 'blocks'], who: [{ id: 1, sleeping: true }] }).seekBlock(), 'Nobody here is awake to play');
  // the one you look after is asleep: another one awake in the room plays
  const r = room({ pieces: ['drum', 'blocks'], who: [{ id: 1, sleeping: true }, { id: 2, sleeping: false }] });
  assert.equal(r.seekBlock(), ''); assert.equal(r.seekWho().id, 2);
});

test('the game list offers it, the room draws the peek behind its piece and the hint says how it goes', () => {
  const games = cut(playJs, 'function openGames()', 'function startCatch()', 'openGames should sit before startCatch');
  assert.match(games, /seekBlock\(\)/, 'the list says why it can\'t start');
  assert.match(games, /startSeek/, 'and starts it from there');
  assert.match(read('crack.js'), /if \(game\.seek\) return seekHint\(\);/, 'the hint line is the game\'s while it\'s on');
  assert.match(read('iso.js'), /drawBaked\(f, seekWiggle\(p\.id\), bob\)/, 'a piece wobbles with a giggle');
  // every new line has its Ukrainian
  const uk = read('i18n.js');
  for (const s of ['Hide and seek', 'Put a few things in the Playroom to hide behind', '{0} is counting… no peeking!', 'not here…', 'Found {0} behind the {1} ♥', '{0} popped out from behind the {1}, giggling'])
    assert.ok(uk.includes(`"${s}":`), s);
});
