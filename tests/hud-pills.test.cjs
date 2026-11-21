const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };

// the top bar's pills come one by one, when each starts to matter (hudPills in scenes.js), over pretend saves
const scenes = read('js/scenes.js');
const page = {};
vm.runInNewContext(cut(scenes, 'const hudPills = ', '\nfunction updateTopbar', 'hudPills should sit in scenes.js, before updateTopbar') + '\nObject.assign(this, { hudPills });', page);
const { hudPills } = page;
const fresh = () => ({ shards: 30, stars: {}, creatures: [], oil: { n: 5, t: 0 } });
const shown = p => Object.keys(p).filter(k => p[k]).join(',');

test('before the first egg the top bar is empty', () => {
  assert.equal(shown(hudPills(fresh(), false)), '');
});

test('each pill comes when it first matters: shards and stars after a level, tasks with a glowling, the lantern once oil counts', () => {
  const s = fresh();
  s.stars = { 1: 2 };
  assert.equal(shown(hudPills(s, false)), 'shards,stars');
  s.creatures = [{ id: 1 }];
  assert.equal(shown(hudPills(s, false)), 'shards,stars,tasks');
  // the next trip would burn a drop: the lantern shows, though none has been spent yet
  assert.equal(shown(hudPills(s, true)), 'shards,stars,oil,tasks');
  // a drop spent once (the clock starts): it stays from then on
  s.oil.t = Date.now();
  assert.equal(shown(hudPills(s, false)), 'shards,stars,oil,tasks');
});

test('a glowling from somewhere other than a level (a moon egg, a friend) brings shards and tasks, not stars', () => {
  assert.equal(shown(hudPills({ ...fresh(), creatures: [{ id: 1 }] }, false)), 'shards,tasks');
});

test('an older save well past the start sees every pill', () => {
  const mid = { shards: 400, stars: { 1: 3, 2: 2, 7: 1 }, creatures: [{ id: 1 }, { id: 2 }], oil: { n: 3, t: Date.now() - 6e5 } };
  assert.equal(shown(hudPills(mid, false)), 'shards,stars,oil,tasks');
});

test('the needs are named for what the bars show: Tummy, Fun and Rest (Ситість, Радість, Сили)', () => {
  const html = read('index.html'), i18n = read('js/i18n.js'), nest = read('js/nest.js');
  for (const w of ['Hunger', 'Boredom', 'Sleepiness']) assert.doesNotMatch(html + nest, new RegExp(`\\b${w}\\b`), `${w} should be gone`);
  assert.match(html, /<label>Tummy <span id="vTummy">/);
  assert.match(html, /<label>Fun <span id="vJoy">/);
  assert.match(html, /<label>Rest <span id="vEnergy">/);
  assert.match(line(nest, /tr\("Tummy"\)} \+\$\{s\.tummy\}/, 'a snack names the gain as Tummy +n'), /Tummy/);
  for (const [en, uk] of [['Tummy', 'Ситість'], ['Fun', 'Радість'], ['Rest', 'Сили']]) assert.ok(i18n.includes(`"${en}": "${uk}"`), `${en} → ${uk}`);
});

test('on a phone the walk names the arrows on screen, never the space bar', () => {
  const walk = read('js/walk.js');
  assert.match(line(walk, /^const walkTouch = .*$/m, 'walkTouch should be one line in walk.js'), /pointer: coarse/);
  assert.match(walk, /walkTouch\(\) \? tr\("Hold ◀ ▶ to walk, ✦ to look closer"\)/);
  assert.ok(walk.includes('"Hold ◀ ▶ to walk, ✦ to look closer": "Тримай ◀ ▶, щоб іти, ✦ — роздивитися"'));
  assert.doesNotMatch(walk, /little walk: tap where to go/);
});
