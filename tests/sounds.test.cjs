const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
// the places come from the list of rooms in nest.js
const PLACES = [...read('nest.js').matchAll(/\{ id: "(\w+)"[^}]*\bplace: true/g)].map(m => m[1]);
const ACTIONS = ['coin', 'setDown', 'page', 'pour', 'whoosh'];
const TICK = 0.03;

/** core.js on its own, with a pretend audio context that writes down every node it is asked for. */
function studio(audio = true) {
  const page = {};
  vm.runInNewContext(read('core.js') + '\nthis.sfx = sfx;', page);
  const made = [];
  const param = () => { const p = { value: 0, sets: [] }; for (const k of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime']) p[k] = (v, t) => p.sets.push([v, t]); return p; };
  const node = kind => {
    const n = { kind, gain: param(), frequency: param(), Q: param(), playbackRate: param(), connect: to => { to.fed = n.fed || kind; return to; }, start: t => { n.from = t; }, stop: t => { n.to = t; } };
    made.push(n);
    return n;
  };
  if (audio) {
    page.sfx.ac = { currentTime: 10, createOscillator: () => node('osc'), createBufferSource: () => node('noise'), createBiquadFilter: () => node('filter'), createGain: () => node('gain') };
    page.sfx.master = {}; page.sfx.echo = {}; page.sfx.noise = {};
  }
  return { sfx: page.sfx, made, heard: f => { made.length = 0; f(); return made.slice(); } };
}
const ends = nodes => Math.max(...nodes.filter(n => n.to != null).map(n => n.to)) - 10;
const gains = nodes => nodes.filter(n => n.kind === 'gain');
// a note may be as loud as the button click and no louder; noise loses most of itself in its filter, so it may be set higher
const soft = (n, k) => {
  assert.ok(Math.max(...n.gain.sets.map(x => x[0])) <= (n.fed === 'osc' ? TICK : 0.08), k);
  assert.equal(n.gain.sets.at(-1)[0], 0.0001, k);
};

test('every place you can arrive at has a sound of its own, and anywhere else gets the shared one', () => {
  const { sfx } = studio();
  assert.ok(PLACES.length >= 6 && PLACES.includes('forge'), 'the places should be found in nest.js');
  for (const k of PLACES) assert.equal(typeof sfx.cues[k], 'function', k);
  assert.equal(typeof sfx.cues.any, 'function');
  assert.equal(new Set(Object.values(sfx.cues)).size, PLACES.length + 1);
});

test('no audio, or sound switched off: nothing plays and nothing breaks', () => {
  const none = studio(false);
  for (const k of ACTIONS) assert.doesNotThrow(() => none.sfx[k](), k);
  for (const k of [...PLACES, 'nowhere']) assert.doesNotThrow(() => none.sfx.arrive(k), k);
  const off = studio();
  off.sfx.muted = true;
  for (const k of ACTIONS) off.sfx[k]();
  for (const k of [...PLACES, 'nowhere']) off.sfx.arrive(k);
  assert.equal(off.made.length, 0);
});

test('the action sounds are short and soft, and each one dies away to nothing', () => {
  const s = studio();
  for (const k of ACTIONS) {
    const nodes = s.heard(() => s.sfx[k]());
    assert.ok(nodes.length > 0, k);
    assert.ok(ends(nodes) <= 0.45, `${k} is over in ${ends(nodes).toFixed(2)}s`);
    for (const g of gains(nodes)) soft(g, k);
  }
});

test('an arrival waits for the whoosh, is over within 0.7s and stays soft', () => {
  const s = studio();
  for (const k of [...PLACES, 'nowhere']) {
    const nodes = s.heard(() => s.sfx.arrive(k));
    assert.ok(nodes.length > 0, k);
    assert.ok(Math.min(...nodes.filter(n => n.from != null).map(n => n.from)) - 10 > 0.199, k);
    assert.ok(ends(nodes) <= 0.7, `${k} is over in ${ends(nodes).toFixed(2)}s`);
    for (const g of gains(nodes)) soft(g, k);
  }
});

test('the sounds slider turns them down like every other sound', () => {
  const s = studio();
  const loudest = () => Math.max(...gains(s.heard(() => s.sfx.coin())).flatMap(n => n.gain.sets).map(x => x[0]));
  const full = loudest();
  s.sfx.sfxVol = 0.5;
  assert.ok(loudest() < full);
});
