const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// scenes.js needs the whole game around it, so only its banner lane is run here, with a pretend page under it
const src = fs.readFileSync(path.join(__dirname, '../js/scenes.js'), 'utf8');
const from = src.indexOf('let bannerQueue'), to = src.indexOf('function setScene(');
assert.ok(from > 0 && to > from, 'the banner lane should sit in scenes.js, before setScene');

function lane(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const els = {}, painted = [];
  const el = id => els[id] || (els[id] = { id, on: new Set(id === 'found' ? ['hidden'] : []), style: {}, offsetHeight: 40, textContent: '',
    classList: { add: c => els[id].on.add(c), remove: c => els[id].on.delete(c), contains: c => els[id].on.has(c) } });
  const page = {
    $: el, game: { scene: 'nest' }, innerHeight: 800, getComputedStyle: () => ({ top: '68px' }),
    document: { body: el('body'), querySelectorAll: () => [] },
    paintAward: (e, a) => painted.push(a),
    setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: id => clearTimeout(id)
  };
  vm.runInNewContext(src.slice(from, to) + '\nthis.toast = toast; this.queueAwards = queueAwards;', page);
  const showing = id => el(id).on.has('on');
  // (time goes by in small steps, so a timer set by another timer rings in its turn)
  return { page, painted, showing, said: () => showing('toast') ? el('toast').textContent : null, tick: ms => { for (let i = 0; i < ms; i += 50) t.mock.timers.tick(50); }, found: () => el('found').on.delete('hidden') };
}
const cup = name => ({ tier: 'common', name });

test('toasts take turns: the second waits for the first to leave', t => {
  const l = lane(t);
  l.page.toast('one'); l.page.toast('two');
  assert.equal(l.said(), 'one');
  l.tick(2600); assert.equal(l.said(), null);
  l.tick(450); assert.equal(l.said(), 'two');
  l.tick(3050); assert.equal(l.said(), null);
  assert.ok(!l.page.document.body.on.has('banner'));
});

test('the same words twice are said once', t => {
  const l = lane(t);
  l.page.toast('one'); l.tick(2000); l.page.toast('one');
  l.tick(2000); assert.equal(l.said(), 'one'); // on screen again for its full time, not in line a second time
  l.tick(600 + 450 + 100); assert.equal(l.said(), null);
  l.page.toast('two'); l.page.toast('three'); l.page.toast('three');
  l.tick(3050); assert.equal(l.said(), 'three');
  l.tick(3050); assert.equal(l.said(), null);
});

test('no more than three toasts wait: the oldest gives up its place', t => {
  const l = lane(t), seen = [];
  for (const w of ['now', 'a', 'b', 'c', 'd']) l.page.toast(w);
  for (let i = 0; i < 5; i++) { if (l.said()) seen.push(l.said()); l.tick(3050); }
  assert.deepEqual(seen, ['now', 'b', 'c', 'd']);
});

test('a toast and an award never show together', t => {
  const l = lane(t);
  l.page.toast('one'); l.page.queueAwards(cup('Snack time'));
  assert.ok(l.showing('toast') && !l.showing('award'));
  l.tick(3050);
  assert.ok(!l.showing('toast') && l.showing('award'));
  assert.deepEqual(l.painted.map(a => a.name), ['Snack time']);
  l.tick(3400 + 450);
  assert.ok(!l.showing('award') && !l.page.document.body.on.has('banner'));
});

test('an award earned while cracking waits for the found card; a toast goes past it', t => {
  const l = lane(t);
  l.page.game.scene = 'crack';
  l.page.queueAwards(cup('Playmate'));
  l.tick(5000); assert.ok(!l.showing('award'));
  l.page.toast('one'); assert.equal(l.said(), 'one');
  l.tick(3050); assert.ok(!l.showing('award') && !l.showing('toast'));
  l.found(); l.tick(400);
  assert.ok(l.showing('award'));
});

test('an award also shows once the geode is left unopened', t => {
  const l = lane(t);
  l.page.game.scene = 'crack';
  l.page.queueAwards(cup('Playmate'));
  l.tick(2000); assert.ok(!l.showing('award'));
  l.page.game.scene = 'map'; l.tick(400);
  assert.ok(l.showing('award'));
});

test('three or more trophies at once arrive as one banner; two still come one by one', t => {
  const l = lane(t);
  l.page.queueAwards(cup('a'), cup('b'));
  l.tick(3850 * 2);
  assert.deepEqual(l.painted.map(a => a.name), ['a', 'b']);
  l.page.toast('one');
  l.page.queueAwards(cup('c'), cup('d')); l.page.queueAwards({ keeper: true, level: 2 }, cup('e'));
  l.tick(3050 + 3850 * 2);
  // the keeper's own level keeps its banner; the trophies around it are one
  assert.deepEqual(l.painted.slice(2).map(a => a.many ? a.many.map(x => x.name).join('') : a.keeper ? 'keeper' : a.name), ['cde', 'keeper']);
  assert.ok(!l.showing('award'));
});
