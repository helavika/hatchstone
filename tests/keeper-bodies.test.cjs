const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The six place keepers standing in their rooms (KEEPER_NATIVE in keepers.js, drawn by drawHero in nest.js) on their new
// bodies: every pose the code reads is there, on the same canvas and ground line, the breath is a one-pixel rise, nothing
// new floats loose, and the place bar's crop (keeperFace, moved by KEEPER_FACE_AT) holds the whole face.
const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };

/** A pretend canvas that keeps its pixels, reads them back and remembers what was drawn from where. */
function canvas() {
  const c = { width: 0, height: 0, px: new Map(), draws: [] };
  c.getContext = () => ({
    fillStyle: '', imageSmoothingEnabled: true,
    fillRect(x, y, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c.px.set((y + j) * 4096 + x + i, this.fillStyle); },
    getImageData(x0, y0, w, h) { const data = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (c.px.has((y0 + y) * 4096 + x0 + x)) data[(y * w + x) * 4 + 3] = 255; return { data }; },
    drawImage(src, ...a) { c.draws.push(a); },
  });
  c.toDataURL = () => c;
  return c;
}
const page = { document: { createElement: () => canvas() }, KEEPER_ART: { tansy: 1, ember: 1, pip: 1, ollo: 1, fennel: 1, runa: 1 }, pxIcon: n => 'icon:' + n };
vm.createContext(page);
const src = read('keepers.js');
vm.runInContext(cut(src, 'const KEEPER_NATIVE = {', '\nfunction keeperPixCanvas', 'KEEPER_NATIVE and keeperNative should sit in keepers.js')
  + cut(src, 'const keeperCache = {};', '\n/** A keeper\'s full-length', 'keeperCache')
  + cut(src, 'const KEEPER_FACE_AT', '\n/** A tiny keeper for the map', 'keeperFace')
  + '\nthis.KN = KEEPER_NATIVE; this.keeperIdle = keeperIdle; this.keeperFace = keeperFace; this.FACE_AT = KEEPER_FACE_AT;', page);
const KN = page.KN, KEEPERS = ['tansy', 'ember', 'pip', 'ollo', 'fennel', 'runa'];
const poses = k => Object.entries(k).filter(([key]) => !['w', 'h', 'pal', 'name'].includes(key)).flatMap(([key, v]) => (Array.isArray(v) ? v : [v]).map((px, i) => [`${key}:${i}`, px]));
const solid = (k, px, x, y) => x >= 0 && y >= 0 && x < k.w && y < k.h && px[y * k.w + x] !== '.';
const bottom = (k, px) => { for (let y = k.h - 1; y >= 0; y--) for (let x = 0; x < k.w; x++) if (solid(k, px, x, y)) return y; return -1; };

// what drawHero asks for: the quirk pose per keeper (Tansy curls, Fennel pulls into his shell, Pip startles, Ollo turns)
const nest = read('nest.js');
const heroes = [...cut(nest, 'const HEROES = {', '\nconst heroHere', 'HEROES in nest.js').matchAll(/who: (\w+),.*?quirk: "(\w+)", icon: "(\w+)"/g)].map(m => ({ who: m[1], quirk: m[2], icon: m[3] }));
const QUIRK_POSE = h => h.quirk === 'curl' ? (h.who === 'FENNEL' ? 'shell' : 'curl') : h.quirk === 'startle' ? 'startle' : h.quirk === 'turn' ? 'turn' : null;

test('every place keeper has every pose the code reads, and each moment of the idle resolves to a drawn pose', () => {
  assert.deepEqual(heroes.map(h => h.icon).sort(), [...KEEPERS].sort());
  assert.match(nest, /pose\(false, shell \? "shell" : "curl"\)/, 'the curl/shell pose is read from the keeper');
  for (const h of heroes) {
    const k = KN[h.icon];
    for (const key of ['frames', 'breathe', 'act']) assert.ok(Array.isArray(k[key]) && k[key].length, `${h.icon}.${key}`);
    assert.equal(typeof k.blink, 'string', `${h.icon}.blink`);
    const q = QUIRK_POSE(h);
    if (q) assert.equal(typeof k[q], 'string', `${h.icon} needs its ${q} pose`);
    for (let t = 0; t < 60000; t += 37) {
      const [pose, n] = String(page.keeperIdle(h.icon, t)).split(':');
      assert.ok(Array.isArray(k[pose]) && typeof k[pose][+n] === 'string', `${h.icon} at ${t}: ${pose}:${n}`);
    }
  }
});

test('every pose is on the same 64x104 canvas in the keeper\'s own colours, standing on the same ground line', () => {
  for (const id of KEEPERS) {
    const k = KN[id], ground = bottom(k, k.frames[0]);
    assert.equal(k.w, 64); assert.equal(k.h, 104);
    assert.ok(ground >= 101, `${id} stands at the foot of the canvas`);
    for (const [name, px] of poses(k)) {
      assert.equal(px.length, k.w * k.h, `${id} ${name} size`);
      for (const ch of new Set(px)) assert.ok(ch === '.' || k.pal[ch], `${id} ${name}: colour '${ch}' in the palette`);
      assert.equal(bottom(k, px), ground, `${id} ${name} stands on the ground line`);
    }
    // nothing in the palette goes unused (keeps the file small)
    const used = new Set(poses(k).flatMap(([, px]) => [...px]));
    for (const ch of Object.keys(k.pal)) assert.ok(used.has(ch), `${id}: '${ch}' is used`);
  }
});

test('the breath is a one-pixel rise of the upper body; the feet and the blink\'s body stay put', () => {
  for (const id of KEEPERS) {
    const k = KN[id], f0 = k.frames[0], rest = k.breathe[0], up = k.breathe[k.breathe.length - 1];
    assert.equal(rest, f0, `${id} breathes from the standing pose`);
    let same = 0, n = 0;
    for (let y = 0; y < 30; y++) for (let x = 0; x < k.w; x++) if (f0[(y + 1) * k.w + x] !== '.') { n++; if (up[y * k.w + x] === f0[(y + 1) * k.w + x]) same++; }
    assert.ok(same / n > 0.85, `${id}: the head rises by one pixel (a planted staff stays) (${same}/${n})`);
    for (let y = 70; y < k.h; y++) assert.equal(up.slice(y * k.w, (y + 1) * k.w), f0.slice(y * k.w, (y + 1) * k.w), `${id} row ${y} of the legs stays`);
    // the blink touches only a few pixels, all in the head
    const diff = [...k.blink].map((ch, i) => ch !== f0[i] ? i : -1).filter(i => i >= 0);
    assert.ok(diff.length > 6 && diff.length < 60, `${id} blink changes ${diff.length} pixels`);
    for (const i of diff) assert.ok(Math.floor(i / k.w) < 32, `${id} blink stays on the face`);
  }
});

test('no pose leaves a stray pixel floating on its own', () => {
  const strays = (k, px) => { const s = new Set(); for (let i = 0; i < px.length; i++) { if (px[i] === '.') continue; const x = i % k.w, y = Math.floor(i / k.w); let near = false; for (let b = -1; b <= 1 && !near; b++) for (let a = -1; a <= 1; a++) if ((a || b) && solid(k, px, x + a, y + b)) { near = true; break; } if (!near) s.add(i); } return s; };
  for (const id of KEEPERS) {
    const k = KN[id], base = strays(k, k.frames[0]);
    assert.equal(base.size, 0, `${id} standing has no stray pixels`);
    for (const [name, px] of poses(k)) assert.deepEqual([...strays(k, px)].filter(i => !base.has(i)), [], `${id} ${name}`);
  }
});

test('the place bar\'s crop holds the whole face: every pixel the blink closes, with room around it', () => {
  for (const id of KEEPERS) {
    const k = KN[id], img = page.keeperFace(id), [args] = img.draws, [sx, sy, sw, sh] = args;
    assert.ok(page.FACE_AT[id], `${id} has its own crop`);
    assert.equal(sw, 26); assert.equal(sh, 26);
    for (let i = 0; i < k.blink.length; i++) if (k.blink[i] !== k.frames[0][i]) {
      const x = i % k.w, y = Math.floor(i / k.w);
      assert.ok(x >= sx + 2 && x < sx + sw - 2 && y >= sy + 2 && y < sy + sh - 2, `${id}: eye pixel ${x},${y} inside the crop ${sx},${sy}`);
    }
  }
});

// Ember, Tansy, Pip and Fennel wear their heads from the first cast collage again: the blink has to find those eyes.
test('the blink shuts the collage heads\' eyes: no eye colour is left in the face', () => {
  const EYES = { ember: ['#ffc94e', '#fff4d4', '#f07a24'], tansy: ['#fff8ea'], pip: ['#ffc23d', '#fff3d0', '#c46a1f'], fennel: ['#fff4c8', '#e8a23a', '#d06a2a'] };
  for (const [id, eyes] of Object.entries(EYES)) {
    const k = KN[id], [[sx, sy, sw, sh]] = page.keeperFace(id).draws;
    const count = px => { let n = 0; for (let y = sy; y < sy + sh; y++) for (let x = sx; x < sx + sw; x++) if (eyes.includes(k.pal[px[y * k.w + x]])) n++; return n; };
    assert.ok(count(k.frames[0]) >= 3, `${id}'s eyes are open, inside the place bar's crop`);
    assert.equal(count(k.blink), 0, `${id}'s blink closes both eyes`);
  }
});
