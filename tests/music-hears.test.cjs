const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');

// The soundtrack listening to the game (js/music.js), run over a pretend audio context that keeps every automation it is
// asked for: the crack scene's tune growing with the shell gone, the phrases for the big moments in the song's key, the
// Gloom stilling the tune over a drone, and nothing new at all with the music off or the sound muted.

function studio({ scene = 'crack', egg = null, veil = 0, coop = null } = {}) {
  const made = [];
  const param = v => { const p = { value: v, sets: [] }; for (const k of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues']) p[k] = (x, t) => { p.sets.push([k, x, t]); }; return p; };
  const node = kind => {
    const n = { kind, gain: param(1), frequency: param(440), detune: param(0), Q: param(1), pan: param(0), delayTime: param(0), playbackRate: param(1), buffer: null };
    n.connect = to => to; n.disconnect = () => {}; n.start = () => {}; n.stop = () => {}; n.addEventListener = () => {};
    made.push(n);
    return n;
  };
  const ac = {
    currentTime: 0, sampleRate: 8000, state: 'running',
    createGain: () => node('gain'), createOscillator: () => node('osc'), createBiquadFilter: () => node('filter'), createStereoPanner: () => node('pan'),
    createConvolver: () => node('conv'), createDelay: () => node('delay'), createBufferSource: () => node('noise'),
    createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }),
  };
  // a steady dice, so a test never waits on luck
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const page = {
    Math: Object.assign(Object.create(Math), { random: rnd }), setInterval: () => 0, setTimeout: () => 0,
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)), rand: (a, b) => a + rnd() * (b - a), pick: arr => arr[Math.floor(rnd() * arr.length)],
    sfx: { ready: () => true, hush: false }, document: { hidden: false },
    game: { scene, egg }, save: { rooms: [{ kind: 'nest' }], room: 0 }, coopSession: coop, gloomVeil: { k: veil },
  };
  vm.runInNewContext(read('music.js') + '\nObject.assign(this, { music, makeMusic, crackLayers, crackShare, gloomMelody, CRACK_GATES, STINGS, SONGS, MODES });', page);
  page.music.start(ac, node('dest'), {});
  const e = page.music.eng;
  e.log = [];
  /** Let the music play on for so many seconds, the timer's way (a pump every 150 ms). */
  const play = secs => { for (let s = 0; s < secs; s += 0.15) { ac.currentTime += 0.15; page.music.pump(); } };
  const tags = (from = 0) => new Set(e.log.filter(n => n[0] >= from).map(n => n[1]));
  return { page, ac, e, made, play, tags, music: page.music };
}

/** Is f a note of the song's key and mode (any octave)? */
function inKey(song, MODES, f) {
  const semis = 12 * Math.log2(f / song.root), s = Math.round(semis);
  if (Math.abs(semis - s) > 0.02) return false;
  return MODES[song.mode].includes(((s % 12) + 12) % 12);
}

test('the crack scene\'s voices come in at a quarter, a half and three quarters of the shell gone', () => {
  const { page } = studio();
  const L = s => JSON.stringify(page.crackLayers(s));
  assert.equal(L(0), JSON.stringify({ bass: false, voice: false, tune: false }));
  assert.equal(L(0.24), L(0));
  assert.equal(L(0.25), JSON.stringify({ bass: true, voice: false, tune: false }));
  assert.equal(L(0.49), L(0.25));
  assert.equal(L(0.5), JSON.stringify({ bass: true, voice: true, tune: false }));
  assert.equal(L(0.75), JSON.stringify({ bass: true, voice: true, tune: true }));
  // the share comes from the egg in hand (the shared one, in co-op: its damage is the host's), and an opened egg is all gone
  assert.equal(page.crackShare({ state: 'cracking', damage: 30, hp: 120 }), 0.25);
  assert.equal(page.crackShare({ state: 'entering', damage: 0, hp: 120 }), 0);
  assert.equal(page.crackShare({ state: 'opening', damage: 118, hp: 120 }), 1);
  assert.equal(page.crackShare(null), 0);
});

test('cracking an egg, the tune assembles itself: pad, then bass, the second voice, the melody; the opening resolves it', () => {
  const egg = { state: 'cracking', damage: 0, hp: 100 };
  const s = studio({ egg });
  s.play(25);
  for (const t of s.tags()) assert.ok(['pad', 'chime'].includes(t), 'only the pad (and a chime now and then) before a quarter is gone: ' + t);
  assert.ok(s.tags().has('pad'));
  const step = (dmg, secs) => { egg.damage = dmg; const from = s.ac.currentTime + 0.6; s.play(secs); return s.tags(from); };
  let t = step(30, 25);
  assert.ok(t.has('bass') && !t.has('voice') && !t.has('tune'), 'the bass at a quarter: ' + [...t]);
  t = step(55, 25);
  assert.ok(t.has('bass') && t.has('voice') && !t.has('tune'), 'a second voice at half: ' + [...t]);
  t = step(80, 25);
  assert.ok(t.has('voice') && t.has('tune'), 'the melody at three quarters: ' + [...t]);
  // a voice let in comes in at once, not at the next chord
  const at = s.ac.currentTime;
  egg.damage = 0; s.play(3); // (a fresh egg starts bare again)
  egg.damage = 26; s.play(3);
  assert.ok(s.e.log.some(n => n[1] === 'bass' && n[0] > at + 3 && n[0] < at + 6), 'the bass should join within a beat or two');
  // the opening: the burst's arpeggio comes in the song's key instead, and the pad turns to the home chord
  egg.damage = 100; egg.state = 'opening';
  const open = s.ac.currentTime;
  assert.equal(s.music.sting('open', 'rare'), true);
  const arp = s.e.log.filter(n => n[1] === 'sting' && n[0] >= open);
  assert.equal(arp.length, 1 + 5, 'a low root and five notes for a rare crystal');
  s.play(12);
  const base = s.e.log.find(n => n[1] === 'sting' && n[0] >= open)[2];
  const pads = s.e.log.filter(n => n[1] === 'pad' && n[0] > open);
  assert.ok(pads.length >= 3);
  for (const [, , f] of pads) {
    const r = ((Math.round(12 * Math.log2(f / base)) % 12) + 12) % 12;
    assert.ok([0, 3, 4, 7].includes(r), 'the opened egg rests on the home chord: ' + f);
  }
});

test('the phrases for hatching, a level and a ward stone are three or four notes, all in the current song\'s key', () => {
  for (const id of ['amethyst', 'celestite', 'malachite', 'labradorite', 'frost', 'smithy']) {
    const s = studio({ scene: 'nest' });
    s.music.song(id);
    s.play(1);
    const song = s.page.SONGS[id];
    for (const name of ['hatch', 'level', 'ward', 'open']) {
      const from = s.e.log.length;
      assert.equal(s.music.sting(name, 'common'), true, name);
      const notes = s.e.log.slice(from).filter(n => n[1] === 'sting');
      if (name !== 'open') assert.ok(notes.length >= 3 && notes.length <= 4, `${name}: ${notes.length} notes`);
      for (const [, , f] of notes) assert.ok(inKey(song, s.page.MODES, f), `${name} in ${id}: ${f} Hz`);
    }
  }
  // and the music key changing changes the phrase with it
  const a = studio({ scene: 'nest' }), b = studio({ scene: 'nest' });
  b.music.song('frost');
  a.music.sting('level'); b.music.sting('level');
  assert.notEqual(a.e.log[0][2], b.e.log[0][2]);
});

test('while the Gloom\'s shadows are in the nest the tune drops out over a low drone, and comes back when they leave', () => {
  const s = studio({ scene: 'nest' });
  s.play(40);
  assert.ok(s.tags().has('tune'), 'the nest has its tune in a calm room');
  const L = s.e.live, drone = () => L.drone.gain.sets.filter(x => x[0] === 'setTargetAtTime').at(-1);
  assert.ok(L.drone, 'the nest\'s bed carries a drone');
  s.page.gloomVeil.k = 1;
  let from = s.ac.currentTime + 0.6;
  s.play(60);
  assert.ok(!s.tags(from).has('tune') && !s.tags(from).has('chime') && !s.tags(from).has('bell'), 'no tune under the Gloom: ' + [...s.tags(from)]);
  assert.ok(s.tags(from).has('pad'), 'the pad goes on, dimmed');
  assert.equal(drone()[1], 1, 'the drone rises with the veil');
  assert.equal(s.e.gloom, 1);
  // two of three gone: the drone sinks with the veil, still no tune; the last one gone: the tune comes back
  s.page.gloomVeil.k = 1 / 3; s.play(1);
  assert.ok(Math.abs(drone()[1] - 1 / 3) < 1e-9);
  assert.equal(s.page.gloomMelody(1 / 3), false);
  s.page.gloomVeil.k = 0;
  from = s.ac.currentTime + 0.6;
  s.play(40);
  assert.equal(drone()[1], 0);
  assert.ok(s.tags(from).has('tune'), 'the tune comes back once they have gone');
  // and the veil is only the nest's: elsewhere it stays out of the music
  const g = studio({ scene: 'map', veil: 1 });
  g.play(2);
  assert.equal(g.e.gloom, 0);
});

test('with the music off, its volume at nothing or the sound muted, nothing new plays and the old sounds stand in', () => {
  for (const off of [m => m.set(false, 0.5), m => m.set(true, 0), (m, p) => { p.sfx.ready = () => false; }, (m, p) => { p.document.hidden = true; }]) {
    const s = studio({ egg: { state: 'cracking', damage: 90, hp: 100 } });
    off(s.music, s.page);
    s.play(10);
    for (const name of ['hatch', 'level', 'ward', 'open']) assert.equal(s.music.sting(name), false, name);
    assert.equal(s.e.log.length, 0, 'no notes at all');
    assert.equal(s.e.live, null);
  }
  // the callers fall back to their own sounds when the phrase doesn't play
  assert.match(read('save.js'), /if \(!music\.sting\("level"\)\) sfx\.levelUp\(\);/);
  assert.match(read('world.js'), /music\.sting\("ward"\) \|\| sfx\.shimmer\(\)/);
  assert.match(read('play.js'), /sfx\.burst\("rare", !music\.sting\("hatch"\)\)/);
  assert.match(read('crack.js'), /sfx\.burst\(e\.crystal\.rarity, !music\.sting\("open", e\.crystal\.rarity\)\)/);
});

test('in co-op the music keeps quiet but for the shared egg, whose tune follows that egg\'s damage on either side', () => {
  const egg = { state: 'cracking', damage: 60, hp: 100, conf: { coop: true } };
  const guest = studio({ egg, coop: { role: 'guest' } });
  guest.play(25);
  assert.ok(guest.tags().has('voice') && !guest.tags().has('tune'), 'the guest hears the half-gone layers: ' + [...guest.tags()]);
  const nest = studio({ scene: 'nest', coop: { role: 'host' } });
  nest.play(5);
  assert.equal(nest.e.log.length, 0, 'still quiet in co-op away from the egg');
  assert.equal(nest.music.sting('level'), false);
});

test('the burst ducks the music under it, and leaves its own arpeggio out when the music plays one', () => {
  const s = studio({ egg: { state: 'cracking', damage: 10, hp: 100 } });
  s.play(3);
  s.music.duck();
  const ramps = s.e.live.in.gain.sets.filter(x => x[0] === 'linearRampToValueAtTime').map(x => x[1]);
  assert.deepEqual(ramps, [0.25, 1]);
  // core.js: no notes from burst with tune false
  const page = { music: { duck() { page.ducked = true; } } };
  vm.runInNewContext(read('core.js') + '\nthis.sfx = sfx;', page);
  const tones = [];
  Object.assign(page.sfx, { ac: { currentTime: 0 }, tone: (...a) => tones.push(a), grain: () => {} });
  page.sfx.burst('legendary', false);
  assert.equal(tones.length, 0);
  assert.equal(page.ducked, true);
  page.sfx.burst('legendary');
  assert.equal(tones.length, 6);
});
