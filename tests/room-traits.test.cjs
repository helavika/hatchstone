const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Rooms with a purpose (#254): what a room at home gives whoever lives in it (ROOM_TRAITS and applyTime in save.js),
// gently, and said in one line in the shop (ROOM_KINDS' trait in nest.js).
const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const save = read('save.js'), nest = read('nest.js'), i18n = read('i18n.js');
const cut = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, a); return src.slice(i, src.indexOf(b, i)); };

function world(kind) {
  const xp = [];
  const ctx = { Math, save: { rooms: [{ kind: 'nest' }, { kind }], dust: [] }, AWAY_MIN: 360, KEPT: 60, clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    roomOf: c => c.room, nestRoom: () => 0, addXP: (c, n) => xp.push(n) };
  vm.createContext(ctx);
  vm.runInContext(cut(save, 'const ROOM_TRAITS', '\n// ---------- dust bunnies') + '\nthis.applyTime = applyTime;', ctx);
  return { ctx, xp };
}
const glowling = (over = {}) => ({ room: 1, last: 1, tummy: 80, joy: 80, energy: 50, sleeping: false, ...over });

test('the playroom keeps boredom off, the moss garden deepens sleep, the study teaches', () => {
  const minutes = 60, at = 1 + minutes * 60000;
  const plain = glowling(), play = glowling(), { ctx: home } = world('nest'), { ctx: room } = world('play');
  home.applyTime(Object.assign(plain, { room: 0 }), at); room.applyTime(play, at);
  assert.ok(80 - play.joy < (80 - plain.joy) * 0.7, `playroom: joy ${play.joy} vs ${plain.joy}`);
  const s1 = glowling({ sleeping: true, energy: 10 }), s2 = glowling({ sleeping: true, energy: 10, room: 0 });
  world('garden').ctx.applyTime(s1, 1 + 5 * 60000); world("nest").ctx.applyTime(s2, 1 + 5 * 60000);
  assert.ok(s1.energy > s2.energy, `moss garden: energy ${s1.energy} vs ${s2.energy}`);
  const { ctx: study, xp } = world('study'), st = glowling();
  study.applyTime(st, 1 + 75 * 60000);
  assert.deepEqual(xp, [2], 'an xp every half hour awake'); assert.equal(st.studyT, 15, 'the rest carries over');
  const sleeper = glowling({ sleeping: true }), w = world('study'); w.ctx.applyTime(sleeper, 1 + 75 * 60000);
  assert.deepEqual(w.xp, [], 'nobody learns asleep');
});

test('each bought room says its trait in one line, in both languages', () => {
  const kinds = [...cut(nest, 'const ROOM_KINDS = [', '];').matchAll(/id: "(\w+)".*?trait: "([^"]+)"/g)];
  assert.deepEqual(kinds.map(m => m[1]), ['play', 'garden', 'study']);
  for (const [, , t] of kinds) assert.ok(i18n.includes(JSON.stringify(t) + ':'), t);
  assert.match(nest, /k\.trait \? `<small class="reno-trait">✦ \$\{tr\(k\.trait\)\}<\/small>`/);
});

test('a glowling out helping grows an xp every half hour; one just out exploring does not', () => {
  const w = world('nest'), helper = glowling({ out: true, job: { place: 'yard' } });
  w.ctx.applyTime(helper, 1 + 75 * 60000);
  assert.deepEqual(w.xp, [2]); assert.equal(helper.jobT, 15);
  assert.equal(helper.tummy, 80, 'needing nothing while away');
  const v = world('nest'); v.ctx.applyTime(glowling({ out: true }), 1 + 75 * 60000);
  assert.deepEqual(v.xp, []);
});
