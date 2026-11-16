const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The cast's dialog portraits (portraits.js, drawn by pxPortrait in pixel.js) with a face per mood, and the moods on the lines
// they say: every speaker has a portrait, every mood a line can carry has a face, and every line has its Ukrainian.
const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };

const CAST = ['mossa', 'wick', 'dorma', 'tansy', 'ember', 'pip', 'fennel', 'ollo'];
const SPEAKERS = { MOSSA: 'mossa', WICK: 'wick', DORMA: 'dorma', TANSY: 'tansy', EMBER: 'ember', PIP: 'pip', FENNEL: 'fennel', OLLO: 'ollo', GLOOM: 'gloom' };
/** The moods the cast bible gives each speaker: the lines are tagged with these. */
const BIBLE = {
  mossa: ['calm', 'warm', 'concerned', 'grief', 'resolve'], ember: ['steady', 'satisfied', 'focused', 'concern', 'laugh'],
  tansy: ['businesslike', 'pleased', 'flustered', 'doubtful', 'dreamy'], pip: ['alert', 'excited', 'scared-but-steady', 'thinking', 'shy-pride'],
  ollo: ['attentive', 'curious', 'delighted', 'concerned', 'alarmed'], fennel: ['content', 'listening', 'shy', 'glad', 'worried'],
  dorma: ['drowsy', 'realizing', 'fond', 'puzzled', 'sorrowful'], wick: ['shy', 'glad', 'confiding', 'sincere', 'flustered'],
  gloom: ['still', 'watching', 'questioning', 'withdrawing', 'seen'],
};

/** A pretend canvas whose data URL is the colour of every pixel, so two faces can be told apart. */
function canvas() {
  const c = { width: 0, height: 0, px: {} };
  c.getContext = () => ({ fillStyle: '', fillRect(x, y, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c.px[(y + j) * 1000 + x + i] = this.fillStyle; } });
  c.toDataURL = () => JSON.stringify({ w: c.width, h: c.height, px: c.px });
  return c;
}
const page = { document: { createElement: () => canvas() }, pxIconCache: {}, pxIcon: name => 'icon:' + name };
vm.createContext(page);
vm.runInContext(cut(read('pixel.js'), 'const PX_PORTRAITS = {};', '// one small cave banner', 'the portraits should sit in pixel.js') + '\nthis.PX_PORTRAITS = PX_PORTRAITS; this.pxPortrait = pxPortrait; this.pxFace = pxFace;', page);
vm.runInContext(read('portraits.js'), page);
vm.runInContext(cut(read('crack.js'), 'PX_PORTRAITS.gloom = {', 'const GLOOM = ', 'the Gloom\'s portrait should sit in crack.js'), page);
const P = page.PX_PORTRAITS;
const faces = name => [P[name].base, ...Object.keys(P[name].moods)];

test('every speaker of the cast has a 39x39 portrait with a base face and moods, all in its own colours', () => {
  for (const name of CAST) {
    const p = P[name];
    assert.ok(p, name);
    assert.equal(p.rows.length, 39, name);
    for (const r of p.rows) assert.equal(r.length, 39, name);
    for (const ch of p.rows.join('')) assert.ok(ch === '.' || p.pal[ch], `${name}: ${ch} has no colour`);
    assert.equal(Object.keys(p.moods).length, 3, `${name} should have three faces besides ${p.base}`);
    for (const [face, runs] of Object.entries(p.moods)) {
      assert.ok(runs.length, `${name}.${face}`);
      for (const [y, x, px] of runs) {
        assert.ok(y >= 0 && y < 39 && x >= 0 && x + px.length <= 39, `${name}.${face} paints off the portrait`);
        for (const ch of px) assert.ok(ch === '.' || p.pal[ch], `${name}.${face}: ${ch} has no colour`);
      }
    }
  }
});

test('each face renders at twice the size (78 px), every face of a speaker its own, cached per face', () => {
  for (const name of CAST) {
    const seen = new Set();
    for (const face of faces(name)) {
      const url = page.pxPortrait(name, face), img = JSON.parse(url);
      assert.deepEqual([img.w, img.h], [78, 78], `${name}.${face}`);
      seen.add(url);
      assert.equal(page.pxPortrait(name, face), url);
      assert.ok(page.pxIconCache['portrait:' + name + (face === P[name].base ? '' : '|' + face)], `${name}.${face} should be cached`);
    }
    assert.equal(seen.size, 4, `${name}'s four faces should differ`);
  }
});

test('every mood the bible gives a speaker has a drawn face, through `as` or by its own name', () => {
  for (const name of CAST) {
    const p = P[name];
    for (const target of Object.values(p.as)) assert.ok(faces(name).includes(target), `${name}: as → ${target} is not drawn`);
    for (const mood of BIBLE[name]) {
      const face = p.as[mood] || mood;
      assert.ok(faces(name).includes(face), `${name}: ${mood} has no face`);
      assert.equal(page.pxPortrait(name, mood), page.pxPortrait(name, face), `${name}: ${mood}`);
    }
    // the base mood is the base face
    assert.equal(page.pxPortrait(name, BIBLE[name][0]), page.pxPortrait(name));
  }
});

test('no mood, or one the speaker has no face for, falls back to the base face; the Gloom keeps its one portrait', () => {
  for (const name of CAST) for (const mood of [undefined, null, '', 'nope', 'base', 'constructor'])
    assert.equal(page.pxPortrait(name, mood), page.pxPortrait(name), `${name}: ${mood}`);
  assert.equal(JSON.parse(page.pxPortrait('gloom')).w, 52);
  for (const mood of BIBLE.gloom) assert.equal(page.pxPortrait('gloom', mood), page.pxPortrait('gloom'));
  assert.equal(page.pxPortrait('nobody', 'warm'), 'icon:nobody');
});

// ---------- the lines ----------
const UK = new Map([...read('i18n.js').matchAll(/^ {2}("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),?$/gm)].map(m => [JSON.parse(m[1]), JSON.parse(m[2])]));
/** Where s[i] is an opening bracket, the index of its closing one (strings and nesting aware). */
function close(s, i) {
  let depth = 0, q = null;
  for (; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; }
    else if ('"\'`'.includes(c)) q = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c) && --depth === 0) return i;
  }
  throw new Error('unclosed');
}
/** Top-level parts of s between a and b, split at commas. */
function parts(s, a, b) {
  const out = []; let depth = 0, q = null, from = a;
  for (let i = a; i < b; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; }
    else if ('"\'`'.includes(c)) q = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { out.push(s.slice(from, i).trim()); from = i + 1; }
  }
  out.push(s.slice(from, b).trim());
  return out;
}
const strings = src => [...src.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => JSON.parse(`"${m[1]}"`));
/** Every talk line said by one of the cast in the game's scripts: [file, speaker, its words (string literals), its moods (literals), the words' code]. */
const TALK_FILES = ['crack.js', 'inner.js', 'play.js', 'world.js', 'gifts.js', 'main.js', 'nest.js', 'sparks.js', 'scenes.js'];
const talkLines = [];
for (const f of TALK_FILES) {
  const src = read(f);
  for (const m of src.matchAll(/\[(MOSSA|WICK|DORMA|GLOOM|PIP|EMBER|TANSY|FENNEL|OLLO), /g)) {
    const end = close(src, m.index), [, words, , mood] = parts(src, m.index + 1, end);
    talkLines.push([f, SPEAKERS[m[1]], strings(words), mood ? strings(mood) : [], words]);
  }
}

test('every talk line of the cast has its Ukrainian, and every mood on one is the speaker\'s', () => {
  assert.equal(talkLines.length, 114, "every talk line of the cast is still said (a new one changes this count on purpose)");
  let tagged = 0;
  for (const [f, who, words, moods, raw] of talkLines) {
    for (const w of words) assert.ok(UK.get(w), `${f}: no Ukrainian for ${JSON.stringify(w)}`);
    if (moods.length) tagged++;
    for (const mood of moods) assert.ok(BIBLE[who].includes(mood), `${f}: ${who} has no mood ${mood} (${raw.slice(0, 60)})`);
  }
  assert.ok(tagged >= 60, `only ${tagged} lines carry a mood`);
});

// the keepers' hellos and lines, as the game has them
const nestJs = read('nest.js');
const heroes = { pxPortrait: () => '', PX_ICON_MAPS: {} };
vm.runInNewContext(cut(nestJs, 'const TANSY = ', '// ---------- errands', 'the keepers should sit in nest.js') + '\nthis.HEROES = HEROES; this.heroWords = heroWords;', heroes);

test('a keeper\'s hello or line is words, or [mood, words] with one of the keeper\'s moods; each has its Ukrainian', () => {
  let n = 0, tagged = 0;
  for (const [kind, h] of Object.entries(heroes.HEROES)) {
    if (h.none) continue;
    const who = SPEAKERS[Object.keys(SPEAKERS).find(k => k.toLowerCase() === h.who.name.toLowerCase())];
    for (const l of [...h.hello, ...h.lines]) {
      n++;
      const w = heroes.heroWords(l);
      assert.equal(typeof w, 'string', kind);
      assert.ok(UK.get(w), `${kind}: no Ukrainian for ${JSON.stringify(w)}`);
      if (Array.isArray(l)) { tagged++; assert.equal(l.length, 2); assert.ok(BIBLE[who].includes(l[0]), `${kind}: ${who} has no mood ${l[0]}`); }
    }
    for (const a of h.asks || []) for (const w of [a.ask, a.story]) assert.ok(UK.get(w), w);
  }
  assert.equal(n, 42, 'five keepers, three hellos each, and their everyday lines: none lost');
  assert.ok(tagged >= 15);
});

test('the talk box shows the face for the line\'s mood: nextLine passes it, the Book\'s retelling keeps it', () => {
  const crack = read('crack.js');
  assert.match(cut(crack, 'function nextLine(', '\n}\n', 'nextLine should sit in crack.js'), /const \[who, words, spot, mood\] = n\.lines\[n\.i\];[\s\S]*face = who\.face\(mood\)/);
  assert.match(cut(crack, 'function retell(', '\n}\n', 'retell should sit in crack.js'), /\[who, words, null, mood\]/);
  // every speaker of the cast speaks with its big portrait; the place bar keeps the keeper's small crop
  for (const [name, file] of [['MOSSA', 'crack.js'], ['WICK', 'crack.js'], ['DORMA', 'crack.js'], ['TANSY', 'nest.js'], ['EMBER', 'nest.js'], ['PIP', 'nest.js'], ['FENNEL', 'nest.js'], ['OLLO', 'nest.js']])
    assert.match(read(file), new RegExp(`const ${name} = \\{ name: "[^"]+", face: mood => pxPortrait\\("${name.toLowerCase()}", mood\\)`));
  assert.match(nestJs, /\$\("placeFace"\)\.src = h\.none \? pxIcon\(h\.icon\) : keeperFace\(h\.icon\);/);
  // and the portraits load before anyone speaks, and offline too
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8'), sw = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
  assert.ok(html.indexOf('js/pixel.js') < html.indexOf('js/portraits.js') && html.indexOf('js/portraits.js') < html.indexOf('js/crack.js'));
  assert.ok(sw.includes('"js/portraits.js"'));
});

test('the collage-head portraits (Ember, Tansy, Pip, Fennel) change only the face between moods', () => {
  for (const name of ['ember', 'tansy', 'pip', 'fennel'])
    for (const [face, runs] of Object.entries(P[name].moods))
      for (const [y] of runs) assert.ok(y >= 8 && y <= 27, `${name}.${face} paints row ${y}, off the face`);
});
