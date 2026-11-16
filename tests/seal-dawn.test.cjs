const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const cut = (src, a, b, what) => { const from = src.indexOf(a), to = src.indexOf(b, from); assert.ok(from >= 0 && to > from, what); return src.slice(from, to); };
const line = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[0]; };

// Breaking a seal looks like dawn (#270): on the four sealed geodes (levels 6, 12, 18 and 24, the first time only) the
// Gloom's chains lie across the shell and come off at their shares of the stone; at the opening its eyes shut one by
// one, the dark draws back and the colour returns before the rays; the found card has its own header. Only a look: no
// rule changes. The seal section of crack.js runs here as it is, with the canvas, sound and screen stubbed.
const crack = read('js/crack.js'), main = read('js/main.js'), scenes = read('js/scenes.js'), html = read('index.html'), css = read('style.css');
const src = [
  read('js/core.js'),
  'const LEVELS = 24;',
  cut(read('js/pixel.js'), 'function levelConf(', '\n}\n', 'levelConf should sit in pixel.js') + '\n}',
  cut(read('js/save.js'), 'function eggPoly(', '\n}\n', 'eggPoly should sit in save.js') + '\n}',
  line(crack, /^const EGG_R = .*$/m, 'the egg\'s height should be one line in crack.js'),
  // the screen: one egg width is 200 px, from (0, 0); the calm switch, the game clock and what the effects left behind
  'const L = { k: 1, ew: 200 }, fromEgg = (u, v) => [u * L.ew, v * L.ew], game = { time: 0, shake: 0, sealFx: null };',
  'let calm = false; const opts = () => ({ calm }), heard = [], motes = [];',
  'Object.assign(sfx, { ready: () => true, ac: { currentTime: 0 }, tok: () => heard.push("tok"), tone: () => heard.push("tone") }); const buzz = () => {}, burst = (...a) => motes.push(a);',
  cut(crack, '// ---------- the seal on the egg:', '\nfunction carveChip(', 'the seal\'s section should sit just before carveChip in crack.js'),
  'Object.assign(this, { levelConf, SEAL_AT, SEAL_WAYS, SEAL_EGG, sealed, sealWhole, sealLeft, sealLinks, dawnAt, openLen, foundHead, sealCheck, DAWN_RAYS, DAWN_CALM, game, setCalm: c => { calm = c; }, heard, motes });',
].join('\n');
const page = {};
vm.runInNewContext(src, page);
const { levelConf, SEAL_AT, sealed, sealWhole, sealLeft, sealLinks, dawnAt, openLen, foundHead, sealCheck } = page;

// startLevel's own rule for the Gloom's seals, run on its own
const sealRule = line(scenes, /^  if \(n && n % 6 === 0 && !save\.stars\[n\]\) .*$/m, 'startLevel should seal a level in one line');
const seal = new Function('conf', 'n', 'save', `${sealRule}; return conf;`);
const eggOn = (n, stars = {}, seed = 'seed-' + n) => ({ conf: seal(levelConf(n), n, { stars }), hp: 20, damage: 0, seed, spot: [0.5, 0.7] });

test('the chains are on the four sealed geodes alone, the first time only: never a cleared one, another level, Wander or a shared egg', () => {
  for (let n = 1; n <= 24; n++) {
    const e = eggOn(n);
    assert.equal(sealed(e), n % 6 === 0, `level ${n}`);
    assert.equal(sealLeft(e), n % 6 === 0 ? 3 : 0, `level ${n}: chains at the start`);
  }
  for (const n of [6, 12, 18, 24]) assert.equal(sealLeft(eggOn(n, { [n]: 2 })), 0, `level ${n}, cleared before: plain stone`);
  const shared = { conf: { ...levelConf(6), n: 0, wander: true, coop: true, gloom: 1 }, hp: 20, damage: 0, seed: 's' };
  assert.equal(sealed(shared), false, 'a shared egg is never sealed, even if one were sent');
  assert.equal(sealLeft({ conf: levelConf(0), hp: 20, damage: 0 }), 0, 'Wander');
});

test('the chains come off at a quarter, a half and three quarters of the stone, the first chain first, each once', () => {
  assert.deepEqual([...SEAL_AT], [0.25, 0.5, 0.75]);
  const e = eggOn(18);
  const at = d => { e.damage = d; return [sealLeft(e), [0, 1, 2].map(i => sealWhole(e, i))]; };
  assert.deepEqual(at(4.99), [3, [true, true, true]]);
  assert.deepEqual(at(5), [2, [false, true, true]]);
  assert.deepEqual(at(9.99), [2, [false, true, true]]);
  assert.deepEqual(at(10), [1, [false, false, true]]);
  assert.deepEqual(at(15), [0, [false, false, false]]);
  // never on a Malachite band's own third, so a chain and a band never come off on the same blow by their shares alone
  for (const t of SEAL_AT) for (const b of [1 / 3, 2 / 3]) assert.ok(Math.abs(t - b) > 0.05);

  // blow by blow, as hitFeedback calls it: each chain breaks once, in order, and a blow past two shares breaks both
  const f = eggOn(6), broke = () => (page.game.sealFx || []).length;
  page.game.sealFx = null; f.sealShown = sealLeft(f); page.setCalm(false);
  for (const [d, n] of [[3, 0], [5.5, 1], [6, 1], [16, 3], [19, 3]]) { f.damage = d; sealCheck(f, 100, 120); assert.equal(broke(), n, `at ${d} of 20`); }
  // a stone that waited comes back with its broken chains already off: no clank for them (refitEgg sets sealShown)
  assert.match(cut(crack, '\nfunction refitEgg(', '\n}\n', 'refitEgg'), /e\.sealShown = sealLeft\(e\);/);
  assert.match(cut(crack, '\nfunction hitFeedback(', '\n}\n', 'hitFeedback'), /if \(sealed\(e\)\) sealCheck\(e, x, y\);/);
});

test('the chains lie across the egg at a slant, never level like the Malachite\'s bands, and the same on every screen', () => {
  for (let s = 0; s < 40; s++) {
    const e = eggOn(18, {}, 'egg' + s);
    for (let i = 0; i < 3; i++) {
      const links = sealLinks(e, i);
      assert.ok(links.length >= 12, `egg ${s}, chain ${i}: ${links.length} links`);
      for (const l of links) assert.ok(page.inside(page.SEAL_EGG, [l.u, l.v]));
      // its run from end to end slants at least 25° off level
      const a = links[0], b = links[links.length - 1], slant = Math.abs(Math.atan2(b.v - a.v, b.u - a.u));
      assert.ok(slant > 0.44 && slant < Math.PI - 0.44, `egg ${s}, chain ${i}: ${slant.toFixed(2)} rad`);
    }
    assert.deepEqual(sealLinks(e, 1), sealLinks(eggOn(18, {}, 'egg' + s), 1), 'from the seed alone');
  }
  // drawn after the shell and before the spot, the sheen and the patches, so those draw on top; thinned over a glowing spot
  const egg = cut(main, '\nfunction drawEgg(', '\n}\n', 'drawEgg');
  assert.ok(egg.indexOf('drawSeal(e)') < egg.indexOf('drawSpot(e)') && egg.indexOf('drawSeal(e)') < egg.indexOf('drawShade(e)'));
  assert.match(cut(main, '\nfunction drawSeal(', '\n}\n', 'drawSeal'), /const glow = e\.conf\.spotGlow && !e\.silent && !e\.sheen/);
});

test('at the opening the eyes shut one by one, the first first; the dark draws back and the colour returns before the rays', () => {
  for (const calm of [false, true]) {
    let was = dawnAt(0, calm), closedAt = [];
    assert.equal(was.shut, 0, 'all four eyes are open as the shell breaks');
    assert.equal(was.grey, 1); assert.equal(was.dark, 1); assert.ok(was.rays < 0);
    for (let t = 0.01; t <= 4; t += 0.01) {
      const d = dawnAt(t, calm);
      assert.ok(d.shut >= was.shut && d.shut - was.shut <= 1, `${t}: the eyes shut one at a time`);
      if (d.shut > was.shut) closedAt.push(t);
      for (const k of ['grey', 'dark', 'wheel']) assert.ok(d[k] <= was[k] + 1e-12, `${t}: ${k} only ever lessens (no flash)`);
      assert.ok(d.reach >= was.reach - 1e-12);
      if (d.rays > 0) { assert.equal(d.shut, 4); assert.equal(d.grey, 0, 'colour is back'); assert.equal(d.wheel, 0, 'the Gloom is gone'); assert.ok(d.dark < 0.05); }
      was = d;
    }
    assert.equal(closedAt.length, 4);
    for (let i = 1; i < 4; i++) assert.ok(closedAt[i] - closedAt[i - 1] > 0.2, 'a beat between eyes');
    // the opening lasts long enough for the rays to come up before the polishing
    const e = eggOn(6);
    assert.ok(openLen(e, calm) - DAWN() * (calm ? page.DAWN_CALM : 1) >= 1);
  }
  assert.equal(openLen(eggOn(5)), 1.6, 'any other egg opens as it always did');
  assert.match(cut(crack, '\nfunction drawGloom(', '\n}\n', 'drawGloom'), /\(d \? i >= d\.shut : /, 'eye i shuts once d.shut passes it');
  assert.match(main, /if \(e\.t > openLen\(e, opts\(\)\.calm\)\) startPolish\(\);/);
});
const DAWN = () => page.DAWN_RAYS;

test('with less motion the dawn is a calm fade: the dark never moves, nothing falls, nothing shakes', () => {
  for (let t = 0; t <= 4; t += 0.05) assert.equal(dawnAt(t, true).reach, 0);
  assert.ok(dawnAt(1, false).reach > 0.5, 'with motion the dark draws back into the corners');
  // the same order, a little slower
  const shutBy = calm => { for (let t = 0; ; t += 0.01) if (dawnAt(t, calm).shut === 4) return t; };
  assert.ok(shutBy(true) > shutBy(false));
  // a chain coming off: no motion, no motes, no shake
  page.setCalm(true); page.game.sealFx = null; page.game.shake = 0; page.motes.length = 0;
  const e = eggOn(12); e.sealShown = 3; e.damage = 6;
  sealCheck(e, 100, 100);
  const fx = page.game.sealFx[0];
  assert.equal(fx.calm, true);
  assert.ok(fx.links.every(l => l.vx === 0 && l.vy === 0 && l.va === 0));
  assert.equal(page.game.shake, 0); assert.equal(page.motes.length, 0);
  page.setCalm(false); e.sealShown = 3; page.game.sealFx = null;
  sealCheck(e, 100, 100);
  assert.ok(page.game.sealFx[0].links.some(l => l.vx !== 0) && page.game.shake > 0 && page.motes.length === 1);
  // the rays don't spin on less motion, as before; and they wait for the dawn
  assert.match(cut(main, '\nfunction drawRays(', '\n}\n', 'drawRays'), /if \(dawn !== null && dawn <= 0\) return;/);
});

test('the found card has its own header and frame, and its chord, for a glowling freed from the Gloom alone', () => {
  assert.equal(foundHead(seal(levelConf(6), 6, { stars: {} })), 'freed from the Gloom');
  assert.equal(foundHead(seal(levelConf(24), 24, { stars: {} })), 'freed from the Gloom');
  assert.equal(foundHead(seal(levelConf(6), 6, { stars: { 6: 3 } })), 'geode opened', 'a cleared seal replayed');
  for (const n of [1, 5, 7, 23]) assert.equal(foundHead(levelConf(n)), 'geode opened');
  assert.equal(foundHead({ ...levelConf(0), coop: true, gloom: 1 }), 'geode opened');
  const shown = cut(crack, '\nfunction showFound(', '\n}\n', 'showFound');
  assert.match(shown, /\$\("foundHead"\)\.textContent = tr\(foundHead\(conf\)\);/);
  assert.match(shown, /\$\("found"\)\.classList\.toggle\("freed", freed\);/);
  assert.match(shown, /if \(freed\) setTimeout\(\(\) => sfx\.freed\(\), \d+\);/);
  assert.match(html, /<h2 id="foundHead">geode opened<\/h2>/);
  assert.match(read('js/i18n.js'), /"freed from the Gloom": "звільнено від Мли",/);
  assert.match(css, /#found\.freed \.card\.glass \{/);
  assert.match(read('js/core.js'), /\n  freed\(\) \{/);
});
