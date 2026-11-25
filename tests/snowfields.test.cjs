const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { WARD_LAND, wardSaveOf, wardFull, wardOpenIn, wardPlace } = require('../js/wards.js');

// The snowfields as a place (snow step 1): once both their wardstones stand the land is Runa's clearing, a stop on the map and
// on the arrows' ring; the isle waits for them; and Runa speaks in both languages.
const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const nest = read('nest.js'), world = read('world.js');
const UK = new Map([...read('i18n.js').matchAll(/^ {2}("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),?$/gm)].map(m => [JSON.parse(m[1]), JSON.parse(m[2])]));
const both = (s, what) => { assert.equal(typeof s, 'string', what); assert.ok(UK.get(s), `no Ukrainian for ${JSON.stringify(s)}`); assert.notEqual(UK.get(s), s, what); };
const allSet = (...ids) => Object.fromEntries(ids.flatMap(id => WARD_LAND[id].spots.map((_, i) => [id + '.' + i, 'amethyst'])));

test('both frost wardstones up: the snowfields open as a place on the map, out on their own land', () => {
  const ws = wardSaveOf({ have: ['aqua', 'quartz'] });
  assert.equal(WARD_LAND.frost.spots.length, 2);
  assert.ok(!wardFull(ws, 'frost'));
  wardPlace(ws, 'frost', 0);
  assert.ok(!wardFull(ws, 'frost'), 'one stone is not enough');
  wardPlace(ws, 'frost', 1);
  assert.ok(wardFull(ws, 'frost'), 'both stand');
  // the map's place: Runa's snowfields, open once the frost land is found (both stones up, the last one risen), drawn as that land
  const entry = nest.match(/^  \{ id: "snow", .*$/m);
  assert.ok(entry, 'the snowfields are on the map (WORLD in nest.js)');
  assert.match(entry[0], /land: "frost"/);
  assert.match(entry[0], /ok: \(\) => wardFound\("frost"\)/);
  assert.match(entry[0], /go: \(\) => arriveAt\("snow"\)/);
  assert.match(world, /^const wardFound = id => wardDone\(id\) && wm\.lifting !== id;$/m);
  // the land's pin goes there once it's a place, instead of "the road is still being cleared"
  assert.match(cut(world, 'function tapMystery(', '\n}\n', 'tapMystery'), /const p = wardFound\(id\) && wardPlaceOf\(id\);\n\s+if \(p\) \{[^}]*closeWorld\(\); p\.go\(\); return; \}/);
  assert.match(cut(world, 'function wardBanner(', '\n}\n', 'wardBanner'), /p \? \(isNew \? tr\("new! ✦"\) : p\.note\(\)\) : tr\("the road is still being cleared"\)/);
  // a place, under the sky, with Runa in it
  assert.match(nest, /\{ id: "snow", name: "The snowfields", place: true, theme: "frost" \}/);
  assert.match(read('save.js'), /id === "frost" && save\.rooms\?\.\[i\]\?\.kind === "snow" \? "yard"/);
  // and its only backdrop is Frost Hollow: the picker offers no other look there
  assert.match(read('save.js'), /kind === "snow" \? \["frost"\]/);
  assert.match(read('iso.js'), /snow: \["runahut", "icedoor", "firs", "firs2", "pond", "hotspring"\]/);
});

test('the isle opens only after the snowfields: its spots stay shut until both frost stones stand', () => {
  assert.deepEqual(WARD_LAND.isle.after, ['frost']);
  const ws = wardSaveOf({ have: ['aqua', 'quartz', 'amethyst'] });
  assert.ok(wardOpenIn(ws, 'frost'));
  assert.ok(!wardOpenIn(ws, 'isle'), 'the isle waits');
  assert.equal(wardPlace(ws, 'isle', 0), null, 'no stone goes on the isle yet');
  ws.set = allSet('frost');
  assert.ok(wardOpenIn(ws, 'isle'), 'the isle opens once the snowfields are warded');
  assert.match(world, /id === "isle" \? "ward the snowfields first"/);
  both('ward the snowfields first');
});

test('the arrows\' ring takes in the snowfields, between the lab (whose road leads there) and the shop', () => {
  const page = {};
  const line = re => nest.match(re)[0];
  vm.runInNewContext([line(/^const VALLEY_RING = .*$/m), line(/^const ringNext = .*$/m), line(/^const ringWays = .*$/m), 'Object.assign(this, { VALLEY_RING, ringNext, ringWays });'].join('\n'), page);
  assert.ok(page.VALLEY_RING.includes('snow'));
  assert.deepEqual({ ...page.ringWays('snow', () => true) }, { prev: 'lab', next: 'shop' });
  assert.deepEqual({ ...page.ringWays('lab', () => true) }, { prev: 'nest', next: 'snow' });
  // before the fog lifts, the arrows go round it
  const shut = id => id !== 'snow';
  assert.deepEqual({ ...page.ringWays('lab', shut) }, { prev: 'nest', next: 'shop' });
  assert.deepEqual({ ...page.ringWays('shop', shut) }, { prev: 'lab', next: 'trail' });
  // and where you stand there, as a place on the map
  assert.match(world, /camp: "trail", grotto: "grotto", snow: "snow" \}\[k\]/);
  assert.match(world, /WM_KEEPERS = \{[^}]*snow: "runa" \}/);
});

test('Runa speaks in both languages: her hellos, lines and welcome, the opening scene\'s lines', () => {
  const heroes = { pxPortrait: () => '', PX_ICON_MAPS: {}, snowActs: () => [['rod', 'Fish'], ['chisel', 'Carving'], ['steam', 'Hot spring']] };
  vm.runInNewContext(cut(nest, 'const TANSY = ', '// ---------- errands', 'the keepers should sit in nest.js') + '\nthis.HEROES = HEROES; this.heroWords = heroWords; this.RUNA = RUNA;', heroes);
  const h = heroes.HEROES.snow;
  assert.equal(h.who, heroes.RUNA);
  assert.equal(h.icon, 'runa');
  both(h.who.name); both(h.role, 'her role');
  assert.ok(h.hello.length >= 3 && h.lines.length >= 4);
  for (const l of [...h.hello, ...h.lines]) both(heroes.heroWords(l));
  both(heroes.heroWords(h.welcome)); assert.match(heroes.heroWords(h.welcome), /\{0\}/);
  // (what there is to do at hers changes as you go, so her buttons are asked for each time: see snowActs in snow.js and its tests)
  assert.equal(JSON.stringify(h.act.map(a => a[1])), '["Fish","Carving","Hot spring"]');
  assert.match(nest, /get act\(\) \{ return snowActs\(\); \}/);
  // the opening: Pip's line, then Mossa's; on the first visit, Runa's welcome
  const found = cut(world, 'wardFound_frost:', '\n  wardFound_isle', 'wardFound_frost');
  assert.match(found, /\[PIP, "The fog's gone\. There's a hut out there, with smoke from its chimney\. Go and say hello!", wardSpotOf\("frost"\), "excited"\]/);
  assert.doesNotMatch(found, /still being cleared/);
  assert.equal(UK.get("The fog's gone. There's a hut out there, with smoke from its chimney. Go and say hello!"), 'Туман зник. Там хатинка, і з комина йде дим. Іди привітайся!');
  assert.match(found, /\[MOSSA, "Snow\. I'd forgotten snow\. Someone kept a door out there, long ago\. I never knew who\.", null, "warm"\]/);
  both("Snow. I'd forgotten snow. Someone kept a door out there, long ago. I never knew who.");
  assert.equal(UK.get("Snow. I'd forgotten snow. Someone kept a door out there, long ago. I never knew who."), 'Сніг. Я й забула, який він. Колись там хтось стеріг двері. Я так і не дізналася, хто.');
  assert.match(found, /snowWelcome: \(\) => \[\[RUNA, "Finally! That fog sat on my porch for a hundred winters\. Come in, come in, mind the drift\.", null, "glad"\]\]/);
  assert.equal(UK.get('Finally! That fog sat on my porch for a hundred winters. Come in, come in, mind the drift.'), 'Нарешті! Цей туман сто зим сидів у мене на ґанку. Заходь, заходь, обережно, замет.');
  assert.match(cut(nest, 'function arriveAt(', '\n}\n', 'arriveAt'), /kind === "snow" && !talkSeen\("snowWelcome"\)/);
  // (Ukrainian: Runa speaks of herself in the feminine; the player is never given a gender)
  const ukLines = [...h.hello, ...h.lines].map(l => UK.get(heroes.heroWords(l)));
  assert.ok(ukLines.some(l => /сказала|в'язала|просила/.test(l)), 'Runa is feminine');
  for (const l of ukLines) assert.doesNotMatch(l, /\b(прийшов|прийшла|готовий|готова|сам|сама ти)\b/);
});

test('the snowfields sound like themselves: a quiet wind bed, a slow harp, far sleigh bells', () => {
  const music = read('music.js');
  const snow = music.match(/^ {2}snow: \{.*\},$/m);
  assert.ok(snow, 'PLACES.snow');
  assert.match(snow[0], /bpm: 46/); assert.match(snow[0], /pad: "sine"/); assert.match(snow[0], /tune: "harp"/); assert.match(snow[0], /bed: "wind"/); assert.match(snow[0], /sleigh: /);
  assert.match(music, /camp: "camp", grotto: "grotto", snow: "snow" \}\[kind\]/);
  assert.match(music, /p\.bed === "wind"/);
});

test('slow snow falls over the clearing, and none with less motion', () => {
  assert.match(nest, /kind === "snow" && !opts\(\)\.calm && L\.filter\(p => p\.kind === "flake"\)/);
});
