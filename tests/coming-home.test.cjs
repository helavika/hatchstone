const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// save.js needs the whole game around it, so only the nest's clock is run here (time away, dust, calls, moods),
// together with the keeper's habits (inner.js), which say the welcome, over a pretend nest
const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const src = read('save.js');
const from = src.indexOf('// Away for a night or more'), to = src.indexOf('function addXP(');
assert.ok(from > 0 && to > from, 'the nest\'s clock should sit in save.js, from the look-in rules to the moods');

const MIN = 60e3, H = 3600e3, DAY = 24 * H;
const LOOKED_IN = 'I looked in at dusk. They\'re not hungry. They\'re just glad.';
const WARM = 'There you are. The nest kept warm for you.';

/** A pretend nest: its glowlings (all at home in the one room unless they're out), the dust on its floor, what was said. */
function nest(creatures, dust = []) {
  const said = [], glad = [], later = [], toasts = [];
  const page = {
    DUST_MAX: 3, MOSSA: 'Mossa', EMBER: 'Ember', TALKS: {}, coopSession: null,
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    save: { creatures, dust, dustT: 0, rooms: [{ kind: 'nest' }], habit: { seen: 0, day: {}, fell: false } },
    game: { scene: 'nest', coopTouched: false, nest: { glad: false } },
    roomOf: () => 0, persist: () => {}, updateTopbar: () => {}, setTimeout: (f, ms) => { later.push(ms); },
    tr: s => s, toast: t => { toasts.push(t); },
    gladHome: () => { page.game.nest.glad = false; glad.push(1); },
    keeperXP: n => { page.xp += n; }, xp: 0,
  };
  page.residents = r => page.save.creatures.filter(c => !c.out && r === 0);
  page.talk = id => { said.push(page.TALKS[id]().map(l => l[1])); return true; };
  vm.createContext(page);
  vm.runInContext(read('inner.js'), page);
  vm.runInContext(src.slice(from, to) + '\nObject.assign(this, { AWAY_MIN, KEPT, KEPT_QUIET, MOSSA_KEPT, mossaKept, applyTime, gatherDust, comeHome, callOf, moodOf, keptQuiet, homeQuiet, habitMoments, BACK_TALK, back: t => { habitLastSeen = t; } });', page);
  return { page, said, glad, later, toasts };
}
const glowling = (away, o = {}) => ({ id: 1, tummy: 60, joy: 60, energy: 60, last: Date.now() - away, ...o });
const { page: w } = nest([]);

test('a night or more away: Mossa looked in, and every need is at three icons of four', () => {
  assert.equal(w.AWAY_MIN, 6 * 60);
  for (const away of [6 * H, 8 * H, 20 * H, DAY, DAY + MIN, 25 * H, 3 * DAY, 400 * DAY]) {
    const now = Date.now(), cr = glowling(away, { last: now - away });
    w.applyTime(cr, now);
    assert.deepEqual([cr.tummy, cr.joy, cr.energy], [w.KEPT, w.KEPT, w.KEPT], 'away ' + away / H + ' h');
    assert.equal(cr.keptAt, now);
    assert.equal(cr.messT, 0); // and no mess to come home to
  }
});

test('the look-in level is clear of every call and sad face, and short of full', () => {
  const now = Date.now(), cr = glowling(3 * DAY, { last: now - 3 * DAY });
  w.applyTime(cr, now);
  // nobody calls, even once the quiet minute is over, and the face is a happy one
  assert.equal(w.callOf(cr, now + w.KEPT_QUIET + 1), '');
  assert.equal(w.moodOf(cr), 'happy');
  // the same icons the needs are drawn with (four per need): three lit, one left to fill
  assert.equal(Math.ceil(w.KEPT / 25), 3);
  assert.ok(w.KEPT < 88, 'a snack is still welcome');
  // and it holds a good while: an hour on (half a tummy point a minute), still nothing to call about
  w.applyTime(cr, now + H);
  assert.equal(w.callOf(cr, now + H), '');
});

test('under six hours away, time passes exactly as before', () => {
  for (const away of [5 * H, 6 * H - MIN]) {
    const now = Date.now(), cr = glowling(away, { last: now - away });
    w.applyTime(cr, now);
    assert.deepEqual([cr.tummy, cr.joy, cr.energy], [0, 0, 0], 'away ' + away / H + ' h');
    assert.equal(cr.keptAt, undefined);
    assert.equal(cr.messT, away / MIN);
    assert.equal(w.callOf(cr, now), 'hungry');
    assert.equal(w.moodOf(cr), 'sleepy');
  }
  // an evening away: a little hungrier, a little lonelier, nothing else
  const now = Date.now(), cr = glowling(H, { last: now - H });
  w.applyTime(cr, now);
  assert.deepEqual([cr.tummy, cr.joy, cr.energy], [30, 36, 45]);
});

test('what is already above the look-in level stays as it is', () => {
  // asleep all the while: fully rested, and that isn't taken down to the level
  const now = Date.now(), cr = glowling(2 * DAY, { last: now - 2 * DAY, sleeping: true, energy: 10 });
  w.applyTime(cr, now);
  assert.deepEqual([cr.tummy, cr.joy, cr.energy], [w.KEPT, w.KEPT, 100]);
  // out exploring: needing nothing, so nothing is touched, low or high
  const out = glowling(2 * DAY, { last: now - 2 * DAY, out: true, tummy: 90, joy: 10, energy: 95 });
  w.applyTime(out, now);
  assert.deepEqual([out.tummy, out.joy, out.energy, out.keptAt], [90, 10, 95, undefined]);
});

test('the first minute home nobody calls; after it, calls are back', () => {
  const now = Date.now();
  // (looked in on, and then hungry all the same: as if the level were ever set too low)
  const cr = { id: 1, tummy: 10, joy: 80, energy: 80, keptAt: now };
  assert.equal(w.callOf(cr, now), '');
  assert.equal(w.callOf(cr, now + w.KEPT_QUIET - 1), '');
  assert.equal(w.callOf(cr, now + w.KEPT_QUIET), 'hungry');
  assert.equal(w.KEPT_QUIET, MIN);
  for (const [need, call] of [['energy', 'sleepy'], ['joy', 'lonely']]) {
    const c = { id: 1, tummy: 80, joy: 80, energy: 80, keptAt: now, [need]: 5 };
    assert.equal(w.callOf(c, now + 30e3), '');
    assert.equal(w.callOf(c, now + 61e3), call);
  }
  // someone who was never looked in on calls as ever
  assert.equal(w.callOf({ id: 1, tummy: 10, joy: 80, energy: 80 }, now), 'hungry');
});

test('Mossa swept too: one dust bunny is left at most, and nobody calls about the mess', () => {
  const a = glowling(3 * DAY), b = glowling(3 * DAY, { id: 2 });
  const { page } = nest([a, b], [[0.1, 0.1], [0.5, 0.5], [0.9, 0.9]]);
  for (let i = 0; i < 3; i++) page.gatherDust(); // the way the page catches up when it opens
  assert.equal(page.save.dust.length, 1);
  assert.equal(page.save.dustT, 0);
  assert.equal(page.callOf(a, Date.now() + 2 * MIN), '');
  // a short time away: the dust gathers as it always did, and two bunnies are worth a call
  const c = glowling(5 * H), away = nest([c], [[0.1, 0.1]]);
  for (let i = 0; i < 3; i++) away.page.gatherDust();
  assert.equal(away.page.save.dust.length, 3);
  c.tummy = c.energy = 80;
  assert.equal(away.page.callOf(c), 'messy');
});

test('home after three days: Mossa says she looked in, and the glowlings are glad', () => {
  // (one glowling and nothing else: the welcome doesn't wait for any part of the story)
  const cr = glowling(3 * DAY), { page, said, glad, later } = nest([cr]);
  page.applyTime(cr, Date.now() - 20e3); // the page opened twenty seconds before Continue was tapped
  page.back(Math.floor((Date.now() - 3 * DAY) / H) * H);
  page.habitMoments('nest');
  assert.equal(said.length, 1);
  assert.equal(said[0].length, 3);
  assert.equal(said[0][1], LOOKED_IN);
  assert.equal(said[0][2], 'Coming back is strength too.');
  assert.equal(glad.length, 1);
  // coming back grows you as a keeper: a little keeper XP, once that day
  assert.equal(page.xp, 30);
  // the quiet minute starts with the welcome, not when the page opened
  assert.ok(Date.now() - cr.keptAt < 1000);
  assert.equal(page.callOf(cr), '');
  // the dots on the tabs and the tasks wait as well, and are looked at again once the minute is over
  assert.equal(page.homeQuiet(), true);
  assert.ok(later.length === 1 && later[0] >= page.KEPT_QUIET);
  cr.keptAt -= page.KEPT_QUIET;
  assert.equal(page.homeQuiet(), false);
  // said once: the next look at the nest is an ordinary one
  page.habitMoments('nest');
  assert.equal(said.length, 1);
  assert.equal(glad.length, 1);
});

test('the welcome said on the map: the glowlings are glad when you reach the nest', () => {
  const cr = glowling(3 * DAY), { page, said, glad } = nest([cr]);
  page.back(Date.now() - 3 * DAY);
  page.habitMoments('map');
  assert.equal(said[0][1], LOOKED_IN);
  assert.equal(glad.length, 0);
  page.habitMoments('nest');
  assert.equal(glad.length, 1);
  assert.equal(said.length, 1);
});

test('the warm words are only said when they are true', () => {
  assert.ok(w.BACK_TALK(true).some(l => l[1] === LOOKED_IN));
  for (const l of w.BACK_TALK(false)) assert.ok(l[1] !== LOOKED_IN && l[1] !== WARM);
  // three days away, but everyone was out exploring the whole time: nobody needed looking in on, so she doesn't say she did
  const cr = glowling(3 * DAY, { out: true }), { page, said, glad, toasts } = nest([cr]);
  page.back(Date.now() - 3 * DAY);
  page.habitMoments('nest');
  assert.equal(said.length, 1);
  assert.equal(said[0].length, 2);
  assert.ok(!said[0].includes(LOOKED_IN) && !said[0].includes(WARM));
  assert.equal(glad.length, 0);
  assert.equal(toasts.length, 0);
  // the nest was open to the hour, the glowlings' clock to the minute: 5 h 40 min away can look like six hours
  // (the nest was last open at 10:40, kept as 10:00), but Mossa hasn't looked in, so there's no word from her
  const c = glowling(5 * H + 40 * MIN), near = nest([c]);
  // (not even with a look-in from the visit before, in that same hour)
  c.keptAt = Date.now() - 6 * H - 15 * MIN;
  near.page.back(Date.now() - 6 * H - 20 * MIN);
  near.page.habitMoments('nest');
  assert.deepEqual([near.said.length, near.toasts.length, near.glad.length], [0, 0, 0]);
  assert.equal(c.tummy, 0);
});

test('back after an hour or five: no word from Mossa, and they want looking after', () => {
  for (const away of [H, 5 * H]) {
    const cr = glowling(away), { page, said, glad, toasts } = nest([cr]);
    page.back(Math.floor((Date.now() - away) / H) * H);
    page.habitMoments('nest');
    assert.deepEqual([said.length, toasts.length, glad.length], [0, 0, 0], 'away ' + away / H + ' h');
    assert.equal(cr.keptAt, undefined);
    assert.equal(page.homeQuiet(), false);
  }
  const cr = glowling(5 * H);
  w.applyTime(cr);
  assert.equal(w.callOf(cr), 'hungry');
});

test('home after a night or a day at work: one short word from Mossa, not the whole welcome', () => {
  for (const away of [8 * H, 20 * H]) {
    const cr = glowling(away), { page, said, glad, later, toasts } = nest([cr], [[0.1, 0.1], [0.5, 0.5], [0.9, 0.9]]);
    page.applyTime(cr, Date.now() - 20e3); // the page opened twenty seconds before Continue was tapped
    page.back(Math.floor((Date.now() - away) / H) * H);
    page.habitMoments('nest');
    // no talk to tap through: one toast, one of hers, and it isn't counted as a day away (no keeper XP for it)
    assert.equal(said.length, 0, 'away ' + away / H + ' h');
    assert.equal(toasts.length, 1);
    assert.ok(page.MOSSA_KEPT.includes(toasts[0]), toasts[0]);
    assert.equal(page.xp, 0);
    // everything she does after a day, she did tonight too: fed and rested (less the twenty seconds since the page
    // opened), swept, a quiet minute, and glad faces
    for (const k of ['tummy', 'joy', 'energy']) assert.ok(cr[k] > page.KEPT - 1 && cr[k] <= page.KEPT, k);
    assert.equal(page.save.dust.length, 1);
    assert.equal(glad.length, 1);
    assert.ok(Date.now() - cr.keptAt < 1000);
    assert.equal(page.callOf(cr), '');
    assert.equal(page.homeQuiet(), true);
    assert.ok(later.length === 1 && later[0] >= page.KEPT_QUIET);
    // said once
    page.habitMoments('nest');
    assert.deepEqual([toasts.length, glad.length], [1, 1]);
  }
});

test('home after 25 hours or three days: the whole welcome, as before, and no toast on top', () => {
  for (const away of [25 * H, 72 * H]) {
    const cr = glowling(away), { page, said, glad, toasts } = nest([cr]);
    page.back(Math.floor((Date.now() - away) / H) * H);
    page.habitMoments('nest');
    assert.equal(said.length, 1, 'away ' + away / H + ' h');
    assert.equal(said[0].length, 3);
    assert.equal(said[0][1], LOOKED_IN);
    assert.equal(toasts.length, 0);
    assert.equal(glad.length, 1);
    // (a few milliseconds pass between Mossa's visit and the check, and the needs drift by a hair)
    for (const v of [cr.tummy, cr.joy, cr.energy]) assert.ok(Math.abs(v - page.KEPT) < 0.01, String(v));
    assert.equal(page.xp, 30);
  }
});

test('her short words differ from one time to the next, and are short', () => {
  const now = Date.now(), seen = new Set();
  for (let i = 0; i < w.MOSSA_KEPT.length; i++) seen.add(w.mossaKept(now + i * 6 * H));
  assert.equal(seen.size, w.MOSSA_KEPT.length);
  // a morning and the evening after it hear different ones
  assert.notEqual(w.mossaKept(now), w.mossaKept(now + 12 * H));
  for (const l of w.MOSSA_KEPT) assert.ok(l.startsWith('Mossa: ') && l.length <= 60, l);
});

test('every line of the welcome has its Ukrainian', () => {
  const uk = read('i18n.js');
  for (const l of [...w.BACK_TALK(true), ...w.BACK_TALK(false), [0, WARM], ...w.MOSSA_KEPT.map(t => [0, t])]) assert.ok(uk.includes(`  ${JSON.stringify(l[1])}: "`), l[1]);
});
