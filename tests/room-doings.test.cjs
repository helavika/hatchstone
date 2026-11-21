const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The rooms' own things to do (play.js): glowcaps come up on the moss garden's moss over real time, three at most; the spring
// takes each glowling once a day; the study's crystals sing the song sparks found on expeditions, each note on its own crystal.
const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, a); const j = src.indexOf(b, i); assert.ok(j > i, b); return src.slice(i, j); };
const play = read('play.js'), sparks = read('sparks.js'), i18n = read('i18n.js');
const ctx = { Math, Date, Set, Object, Array, Number, clamp: (v, a, b) => Math.max(a, Math.min(b, v)) };
vm.createContext(ctx);
vm.runInContext(cut(sparks, 'const SPARKS = [', 'const SPARK_KINDS') + cut(play, '/** Glowcaps come up on the moss garden', 'const roomDoSeen')
  + '\nObject.assign(this, { SPARKS, SPARK, CAP_EVERY, CAP_MAX, roomDoOf, capsGrow, capsPick, bathOk, bathed, songsFound, songNotes, noteCrystal });', ctx);
const { CAP_EVERY, CAP_MAX } = ctx, H = 3600e3, plain = v => JSON.parse(JSON.stringify(v));

test('glowcaps come up one every few hours, on the first free spot, three at most', () => {
  assert.equal(CAP_MAX, 3); assert.ok(CAP_EVERY >= 2 * H && CAP_EVERY <= 6 * H, 'one every few hours');
  const t0 = 1e12, c = { on: [], t: t0 };
  assert.deepEqual(plain(ctx.capsGrow(c, t0 + CAP_EVERY - 1)), { on: [], t: t0 }, 'not yet');
  assert.deepEqual(plain(ctx.capsGrow(c, t0 + CAP_EVERY * 2 + 5)), { on: [0, 1], t: t0 + CAP_EVERY * 2 }, 'two, the clock kept to the minute');
  const full = ctx.capsGrow(c, t0 + CAP_EVERY * 9);
  assert.deepEqual(plain(full.on), [0, 1, 2], 'never more than three, however long you were away');
  assert.equal(full.t, t0 + CAP_EVERY * 9, 'full, the clock waits');
  // pick the middle one: it is that one that goes, and its spot is the next to fill, a whole while after the pick
  const now = t0 + CAP_EVERY * 9, left = ctx.capsPick(full, 1, now);
  assert.deepEqual(plain(left), { on: [0, 2], t: now });
  assert.deepEqual(plain(ctx.capsGrow(left, now + CAP_EVERY - 1).on), [0, 2]);
  assert.deepEqual(plain(ctx.capsGrow(left, now + CAP_EVERY).on), [0, 2, 1]);
  assert.equal(ctx.capsPick(left, 1, now + 60e3), null, 'nothing to pick where none is up');
});

test('the save keeps the glowcaps and baths whole, and a new moss garden has one glowcap waiting', () => {
  const now = 5e12;
  assert.deepEqual(plain(ctx.roomDoOf(undefined, now)), { caps: { on: [0], t: now }, bath: {} });
  assert.deepEqual(plain(ctx.roomDoOf({ caps: { on: [2, 2, 7, -1, 'x', 1.5, 0], t: now + 9e9 }, bath: { 4: '2026-11-21', 5: 3 } }, now)), { caps: { on: [2, 0], t: now }, bath: { 4: '2026-11-21' } });
  assert.deepEqual(plain(ctx.roomDoOf({ caps: { on: [] } }, now).caps.on), [], 'all picked stays all picked');
});

test('the spring takes each glowling once a day, and forgets the days before', () => {
  let bath = {};
  assert.ok(ctx.bathOk(bath, 1, '2026-11-21'));
  bath = ctx.bathed(bath, 1, '2026-11-21');
  assert.ok(!ctx.bathOk(bath, 1, '2026-11-21'), 'not twice the same day');
  assert.ok(ctx.bathOk(bath, 2, '2026-11-21'), 'someone else still can');
  assert.ok(ctx.bathOk(bath, 1, '2026-11-22'), 'and tomorrow again');
  bath = ctx.bathed(ctx.bathed(bath, 2, '2026-11-21'), 1, '2026-11-22');
  assert.deepEqual(plain(bath), { 1: '2026-11-22' }, 'only today is kept');
});

test('the crystals sing only the songs found, in the Book order, note by note as playSpark plays them', () => {
  assert.deepEqual(plain(ctx.songsFound({})), []);
  assert.deepEqual(plain(ctx.songsFound({ brave: { t: 1 }, moss: { t: 1 }, rain: { t: 2 }, aurora: { t: 3 } })), ['rain', 'brave'], 'songs only, colours and sights are not sung');
  assert.deepEqual(plain(ctx.songsFound(null)), []);
  const lake = ctx.SPARK.lake, n = ctx.songNotes(lake);
  assert.equal(n.length, lake.notes.length);
  assert.deepEqual(plain(n.slice(0, 2)), [{ at: 0, dur: lake.beat * 2, st: 0 }, { at: lake.beat * 2, dur: lake.beat, st: 4 }]);
  const last = n[n.length - 1], beats = lake.notes.reduce((s, [, b]) => s + b, 0);
  assert.ok(Math.abs(last.at + last.dur - beats * lake.beat) < 1e-9, 'as long as the song');
  // low notes on the left crystal, high on the right, one note alone in the middle
  assert.deepEqual([0, 6, 12].map(st => ctx.noteCrystal(st, 0, 12, 9)), [0, 4, 8]);
  assert.equal(ctx.noteCrystal(0, 0, 0, 9), 4);
});

test('the glowcap is a snack in the pantry, and every new word has its Ukrainian', () => {
  assert.match(read('data.js'), /glowcap: \{ name: "Glowcap", emoji: "[^"]+", tummy: \d+, joy: \d+, garden: true \}/);
  assert.match(i18n, /glowcap: "Сяйвогриб"/);
  const section = play.slice(play.indexOf('// ---------- the rooms\' own things to do'));
  const words = [...section.matchAll(/tr\("((?:[^"\\]|\\.)+)"/g)].map(m => m[1]);
  assert.ok(words.length >= 10);
  for (const w of words) assert.ok(i18n.includes(JSON.stringify(w) + ':'), w);
  for (const w of ['Singing crystals', 'Songs your glowlings brought home. Pick one, and the crystals sing it.', 'Found on expeditions']) assert.ok(i18n.includes(JSON.stringify(w) + ':'), w);
  // each counted once a session, by what was done
  for (const what of ['glowcap', 'bath', 'song', 'hum']) assert.ok(section.includes(`trackOnce("roomdo", { what: "${what}" })`), what);
});
