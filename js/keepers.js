"use strict";
// Hatchstone · the keepers of the places, drawn full-length: dark-fantasy folk of the valley, each with their trade in hand.
// All the game's scripts share one global scope and load in order (see index.html).

const KW = 40, KH = 64; // each keeper is 40×64 art pixels (a head about a seventh of their height), standing on the bottom middle
const KC = Object.fromEntries(Object.entries({
  plum0: "#1f1029", plum1: "#3b2147", plum2: "#5a3570", plum3: "#7d4f96",
  cream0: "#8a6f52", cream1: "#c9b08a", cream2: "#ead7b4",
  spine0: "#2e1d12", spine1: "#5e3a1c", spine2: "#8a6238", spine3: "#b98a52",
  brass0: "#7a5520", brass1: "#c98f3a", brass2: "#f2cf7a",
  scale0: "#3d0f18", scale1: "#7d1e2c", scale2: "#b8323b", scale3: "#e0634f",
  hide0: "#2b1a10", hide1: "#4a2e18", hide2: "#6b4a2a",
  coat0: "#1e1812", coat1: "#3a2e22", coat2: "#5a4a36",
  velvet0: "#14111c", velvet1: "#2a2536", velvet2: "#433c55",
  robe0: "#0f0c24", robe1: "#1d1745", robe2: "#2e2560", robe3: "#46399a",
  owl0: "#3b2f63", owl1: "#6b5a9a", owl2: "#9c8ac9", owl3: "#d6cbf2",
  moss0: "#14261a", moss1: "#1e3a28", moss2: "#2f5a3a", moss3: "#4a7a4e",
  toad0: "#2e3a1a", toad1: "#56682e", toad2: "#7d9142", toad3: "#a8b866",
  straw0: "#4a3418", straw1: "#7a5a2c", straw2: "#a8844a",
  steel0: "#2a2833", steel1: "#55525f", steel2: "#8a8696", steel3: "#c4c0cc",
  glowY: "#ffd77a", glowW: "#fff6d6", glowG: "#9cf5a8", glowA: "#ffb347", pink: "#e88bb1", pink2: "#b8507a",
  crow0: "#0e0b18", crow1: "#1f1b33", crow2: "#35305a", crow3: "#5a5590", beak0: "#3a3644", beak1: "#7a7688",
  shell0: "#2a2410", shell1: "#4a4020", shell2: "#6e6030", shell3: "#968444",
  map0: "#a8844a", map1: "#e2c08d", ink: "#0b0614",
}).map(([k, v]) => [k, pxHex(v)]));

/** Folds down a cloth: darker lines every few pixels across a polygon's span. */
function kFolds(T, x0, x1, y0, y1, col, every = 4) {
  for (let x = x0 + 2; x < x1 - 1; x += every) for (let y = y0 + 3; y < y1 - 1; y++) if (T.has(x, y) && pxHash(x, y >> 2) > 0.25) {
    // drawn finely, the folds are one real pixel wide
    if (T.S) for (let j = 0; j < T.S; j++) T.raw.px(x * T.S + (T.S >> 1) + Math.round(Math.sin((y * T.S + j) / 9) * 1.2), y * T.S + j, col); else T.px(x, y, col);
  }
}
/** A body's cloak or coat: a trapezoid from shoulders to hem, lit on the left, with folds and a ragged hem if asked. */
function kCloak(T, cx, top, bottom, wTop, wBot, [dark, mid, light], ragged = false) {
  T.poly([[cx - wTop, top], [cx + wTop, top], [cx + wBot, bottom], [cx - wBot, bottom]], (x, y) => x < cx - wTop * 0.35 - (y - top) * 0.15 ? light : x > cx + wTop * 0.5 + (y - top) * 0.2 ? dark : mid);
  kFolds(T, Math.floor(cx - wBot), Math.ceil(cx + wBot), top, bottom, dark, 5);
  if (ragged) for (let x = Math.floor(cx - wBot); x <= cx + wBot; x++) if (pxHash(x, 3) > 0.55) T.px(x, bottom + 1, dark);
}

/** A tapered limb from a to b (widths w0 → w1), its far side in shade; joints are drawn round at the ends. */
function kLimb(T, a, b, w0, w1, col, shade) {
  const [x0, y0] = a, [x1, y1] = b, dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  T.poly([[x0 + nx * w0 / 2, y0 + ny * w0 / 2], [x1 + nx * w1 / 2, y1 + ny * w1 / 2], [x1 - nx * w1 / 2, y1 - ny * w1 / 2], [x0 - nx * w0 / 2, y0 - ny * w0 / 2]], col);
  if (shade) T.poly([[x0 + nx * w0 / 2, y0 + ny * w0 / 2], [x1 + nx * w1 / 2, y1 + ny * w1 / 2], [x1 + nx * w1 * 0.1, y1 + ny * w1 * 0.1], [x0 + nx * w0 * 0.1, y0 + ny * w0 * 0.1]], shade);
  T.disc(x1, y1, w1 / 2, col, w1 / 2);
}
/** An arm: shoulder → elbow → wrist, with a hand (or gauntlet) at the end. */
function kArm(T, sh, el, wr, [col, shade], hand, w = 3.2) { kLimb(T, sh, el, w, w * 0.85, col, shade); kLimb(T, el, wr, w * 0.85, w * 0.7, col, shade); T.ball(wr[0], wr[1] + 0.8, w * 0.45, hand[0], hand[1], hand[2], w * 0.5); }
/** A leg: hip → knee → ankle, and a boot pointing a little outward. */
function kLeg(T, hip, knee, ankle, [col, shade], boot, out = 1, w = 3.8) {
  kLimb(T, hip, knee, w, w * 0.8, col, shade); kLimb(T, knee, ankle, w * 0.8, w * 0.62, col, shade);
  T.poly([[ankle[0] - w * 0.4, ankle[1] - 1.5], [ankle[0] + w * 0.4, ankle[1] - 1.5], [ankle[0] + w * 0.45 + out * 2.2, ankle[1] + 2.4], [ankle[0] - w * 0.45 + out * 0.6, ankle[1] + 2.4]], boot);
}
/** A torso: shoulders, a narrower waist, hips. */
function kTorso(T, cx, top, waist, hips, wSh, wWa, wHi, col) { T.poly([[cx - wSh, top + 1], [cx - wSh + 1, top], [cx + wSh - 1, top], [cx + wSh, top + 1], [cx + wWa, waist], [cx + wHi, hips], [cx - wHi, hips], [cx - wWa, waist]], col); }
const glowEye = (T, x, y, col, r = 0.6) => { T.disc(x, y, r, col, r); T.glow(x, y, 2.5, col, 0.45); };

const KEEPER_ART = {
  tansy(T, blink) {
    // the shop's hedgehog: spines down her back, a long merchant's dress with a corset belt, a knitted shawl, brass scales and a ring of keys
    const cx = 20, C = KC;
    // spines behind the head and shoulders
    // spines down the back of the head and the back, pointing back and up
    for (let k = 0; k < 24; k++) { const f = k / 23, bx = cx - 2 - 6 * f, by = 4.5 + 22 * f, an = Math.PI * (1.18 - 0.25 * f) + (pxHash(k, 2) - 0.5) * 0.3, len = 4.5 - 1.5 * f + pxHash(k, 1) * 1.5;
      T.line(bx, by, bx + Math.cos(an) * len, by + Math.sin(an) * len, k % 2 ? C.spine2 : C.spine1); }
    kLeg(T, [cx - 3, 33], [cx - 3.5, 46], [cx - 3.5, 58], [C.cream1, C.cream0], C.hide0, -1, 3);
    kLeg(T, [cx + 3, 33], [cx + 3.5, 46], [cx + 3.5, 58], [C.cream1, C.cream0], C.hide0, 1, 3);
    // the skirt, long and heavy, with folds
    T.poly([[cx - 6, 29], [cx + 6, 29], [cx + 11, 58], [cx - 11, 58]], (x, y) => x < cx - 4 ? C.plum3 : x > cx + 5 ? C.plum1 : C.plum2);
    kFolds(T, cx - 10, cx + 10, 31, 58, C.plum1, 4);
    for (let x = cx - 11; x <= cx + 11; x += 2) T.px(x, 58, C.plum0);
    kTorso(T, cx, 15, 26, 30, 7, 4.5, 6, C.plum2);
    T.poly([[cx - 4.5, 24], [cx + 4.5, 24], [cx + 5, 30], [cx - 5, 30]], C.hide1);
    for (const y of [25.5, 27.5]) T.line(cx - 2, y, cx + 2, y + 0.5, C.brass1);
    // shawl over the shoulders, fringed
    T.poly([[cx - 8, 15], [cx + 8, 15], [cx + 6, 21], [cx, 24], [cx - 6, 21]], (x, y) => (Math.floor(x) + Math.floor(y)) % 2 ? C.cream1 : C.cream2);
    for (let x = cx - 6; x <= cx + 6; x += 1.5) T.px(x, 21 + (Math.abs(x - cx) < 3 ? 2 : 0), C.cream0);
    // left arm down with a ring of keys, right arm holding the scales
    kArm(T, [cx - 7, 17], [cx - 9, 25], [cx - 8.5, 32], [C.plum2, C.plum1], [C.cream2, C.cream1, C.cream0], 2.8);
    T.disc(cx - 8, 35, 1.5, C.brass1, 1.5); T.line(cx - 8.5, 35, cx - 9, 38, C.brass2); T.line(cx - 7.5, 35, cx - 7, 37.5, C.brass2);
    kArm(T, [cx + 7, 17], [cx + 10, 24], [cx + 13, 21], [C.plum2, C.plum1], [C.cream2, C.cream1, C.cream0], 2.8);
    T.line(cx + 13, 20, cx + 13, 14, C.brass1); T.line(cx + 9, 14, cx + 17, 14, C.brass2);
    for (const sx of [cx + 9, cx + 17]) { T.line(sx, 14, sx - 1, 17, C.brass0); T.line(sx, 14, sx + 1, 17, C.brass0); T.disc(sx, 17.5, 1.6, C.brass2, 0.6); }
    // the head: a pointed hedgehog face under a hood
    T.ball(cx - 1, 8.5, 4.6, C.plum3, C.plum2, C.plum1, 5);
    T.ball(cx + 0.5, 9.5, 3.4, C.cream2, C.cream1, C.cream0, 3.3);
    T.poly([[cx + 2.5, 8.5], [cx + 7, 10.5], [cx + 2.5, 12]], C.cream1); T.disc(cx + 7, 10.5, 0.8, C.ink, 0.8);
    if (blink) T.line(cx + 1, 8.8, cx + 2.5, 8.8, C.cream0); else glowEye(T, cx + 1.8, 8.8, C.glowA, 0.7);
    T.px(cx + 1, 11, C.pink);
  },
  ember(T, blink) {
    // the forge's salamander: tall and horned, a mail shirt under a scorched leather apron, a steel pauldron and gauntlets, greaves, the hammer on one shoulder
    const cx = 19, C = KC;
    // tail, curling behind
    T.poly([[cx + 3, 34], [cx + 7, 36], [cx + 14, 48], [cx + 17, 58], [cx + 13, 60], [cx + 11, 50], [cx + 4, 40]], C.scale1);
    T.line(cx + 6, 38, cx + 14, 54, C.scale2);
    // legs: dark leather breeches, steel greaves, heavy boots
    kLeg(T, [cx - 3.5, 34], [cx - 4, 47], [cx - 4, 59], [C.hide1, C.hide0], C.hide0, -1, 4.4);
    kLeg(T, [cx + 3.5, 34], [cx + 4, 47], [cx + 4, 59], [C.hide1, C.hide0], C.hide0, 1, 4.4);
    for (const lx of [cx - 4, cx + 4]) { T.poly([[lx - 2.2, 48], [lx + 2.2, 48], [lx + 1.8, 57], [lx - 1.8, 57]], (x) => x < lx ? C.steel3 : C.steel2); T.disc(lx, 47.5, 1.8, C.steel3, 1.4); }
    // mail shirt, the apron over it, a belt with tongs
    kTorso(T, cx, 15, 27, 34, 8.5, 6, 7, (x, y) => (Math.floor(x * 2) + Math.floor(y * 2)) % 3 ? C.steel1 : C.steel2);
    T.poly([[cx - 5, 19], [cx + 5, 19], [cx + 7, 46], [cx - 7, 46]], (x, y) => pxHash(Math.floor(x), Math.floor(y)) > 0.93 ? C.hide0 : x < cx - 2 ? C.hide2 : C.hide1);
    T.line(cx - 5, 19, cx - 7, 15, C.hide0); T.line(cx + 5, 19, cx + 7, 15, C.hide0);
    T.line(cx - 7, 31, cx + 7, 31, C.hide0); T.disc(cx, 31, 1, C.brass1, 1);
    T.line(cx - 8, 31, cx - 9, 40, C.steel2); T.line(cx - 7, 31, cx - 7.5, 40, C.steel2);
    // left arm down in a gauntlet; the right raised, the hammer resting on its shoulder
    kArm(T, [cx - 8, 16], [cx - 10.5, 26], [cx - 10, 34], [C.scale2, C.scale1], [C.steel3, C.steel2, C.steel1], 3.6);
    T.poly([[cx - 12, 33], [cx - 8, 33], [cx - 8, 36], [cx - 12, 36]], C.steel2);
    T.ball(cx - 8.5, 16, 4, C.steel3, C.steel2, C.steel1, 3);
    kArm(T, [cx + 8, 16], [cx + 12, 23], [cx + 9, 17], [C.scale2, C.scale1], [C.steel3, C.steel2, C.steel1], 3.6);
    T.line(cx + 9, 18, cx + 18, 3, C.hide2); T.line(cx + 10, 18, cx + 19, 3.5, C.hide1);
    T.poly([[cx + 15, 0], [cx + 22, 3], [cx + 20, 8], [cx + 13, 5]], (x) => x < cx + 17 ? C.steel3 : C.steel1);
    T.glow(cx + 18, 4, 4, C.glowA, 0.25);
    // neck and head: a long lizard skull, horns sweeping back, ember eyes
    kLimb(T, [cx, 15], [cx + 0.5, 11], 4, 3.5, C.scale2, C.scale1);
    T.ball(cx, 8, 4.4, C.scale3, C.scale2, C.scale1, 3.8);
    T.poly([[cx + 2, 6.5], [cx + 8.5, 8.5], [cx + 8, 10.5], [cx + 2, 11]], C.scale2); T.line(cx + 3, 10, cx + 8, 9.8, C.scale0);
    T.poly([[cx - 2, 5], [cx - 7, 0], [cx - 3, 4.5]], C.velvet1); T.poly([[cx + 1, 4.5], [cx - 1, -0.5], [cx + 2.5, 4]], C.velvet1);
    if (blink) T.line(cx + 1.5, 7.5, cx + 3.5, 7.5, C.scale0); else { glowEye(T, cx + 2.5, 7.5, C.glowY, 0.75); }
    for (let k = 0; k < 6; k++) T.px(cx - 3 + pxHash(k, 9) * 5, 6 + pxHash(k, 3) * 5, C.scale3);
  },
  pip(T, blink) {
    // the camp's crow-folk scout: a riveted leather brigandine, bracers and tall boots, a feathered cloak, a short sword, the rolled map
    const cx = 20, C = KC;
    // the cloak behind, feathered at the hem
    T.poly([[cx - 8, 15], [cx + 8, 15], [cx + 12, 52], [cx - 12, 52]], C.crow1);
    for (let x = cx - 12; x <= cx + 11; x += 2) T.poly([[x, 51], [x + 2, 51], [x + 1, 55 + (Math.floor(x) % 4 ? 1 : 0)]], Math.floor(x) % 4 ? C.crow1 : C.crow2);
    kLeg(T, [cx - 3, 34], [cx - 3.5, 46], [cx - 3.5, 58], [C.coat1, C.coat0], C.hide1, -1, 3.4);
    kLeg(T, [cx + 3, 34], [cx + 3.5, 46], [cx + 3.5, 58], [C.coat1, C.coat0], C.hide1, 1, 3.4);
    for (const lx of [cx - 3.5, cx + 3.5]) { T.poly([[lx - 2, 47], [lx + 2, 47], [lx + 1.8, 58], [lx - 1.8, 58]], C.hide1); T.line(lx - 2, 50, lx + 2, 50, C.brass1); }
    // the brigandine, riveted, belted
    kTorso(T, cx, 15, 28, 34, 7.5, 5.2, 6, (x) => x < cx - 3 ? C.hide2 : C.hide1);
    for (let y = 18; y < 33; y += 3) for (let x = cx - 4; x <= cx + 4; x += 4) T.px(x, y, C.brass1);
    T.line(cx - 6, 31, cx + 6, 31, C.hide0); T.disc(cx, 31, 0.9, C.brass2, 0.9);
    // a short sword at the left hip, a satchel at the right
    T.line(cx - 6, 30, cx - 11, 42, C.hide0); T.line(cx - 7, 29, cx - 4, 30.5, C.brass1);
    T.poly([[cx + 5, 30], [cx + 10, 30], [cx + 10, 36], [cx + 5, 36]], C.hide2); T.line(cx + 5, 32, cx + 10, 32, C.hide0);
    // arms: the left holds the map against the chest, the right hangs, gloved, a bracer on each
    kArm(T, [cx + 7, 17], [cx + 9, 26], [cx + 8.5, 34], [C.crow2, C.crow1], [C.hide1, C.hide1, C.hide0], 3);
    T.poly([[cx + 7.2, 28], [cx + 10.2, 28], [cx + 10, 32], [cx + 7, 32]], C.hide1);
    kArm(T, [cx - 7, 17], [cx - 8, 26], [cx - 1, 23], [C.crow2, C.crow1], [C.hide1, C.hide1, C.hide0], 3);
    T.poly([[cx - 9, 20], [cx + 4, 18], [cx + 5, 21], [cx - 8, 23.5]], C.map1); T.line(cx - 8, 23.5, cx + 5, 21, C.map0); T.px(cx - 2, 20.5, C.scale2); T.px(cx - 2, 21.5, C.scale2);
    // the red scarf and the hood fallen back
    T.poly([[cx - 6, 13.5], [cx + 6, 13.5], [cx + 4, 17], [cx - 4, 17]], C.scale1); T.poly([[cx + 2, 16], [cx + 4, 16], [cx + 3, 22], [cx + 1.5, 21]], C.scale1);
    T.ball(cx - 1, 13, 4.5, C.crow2, C.crow1, C.crow0, 2.2);
    // the head: a crow's, crested, with a long grey beak and one bright eye
    for (let k = 0; k < 5; k++) T.poly([[cx - 3 + k * 1.4, 5], [cx - 3.5 + k * 1.4, 1 + (k % 2)], [cx - 2 + k * 1.4, 5]], k % 2 ? C.crow2 : C.crow1);
    T.ball(cx, 8, 4, C.crow3, C.crow2, C.crow0, 4.2);
    T.poly([[cx + 2.5, 7.5], [cx + 10, 9.5], [cx + 2.5, 11]], C.beak1); T.line(cx + 3, 9.5, cx + 9.5, 9.5, C.beak0);
    if (blink) T.line(cx + 0.5, 7.2, cx + 2, 7.2, C.crow0); else { T.disc(cx + 1.2, 7.2, 1, C.glowW, 1); T.disc(cx + 1.4, 7.2, 0.45, C.ink, 0.45); }
  },
  ollo(T, blink) {
    // the lab's owl alchemist: a floor-length midnight robe, a mantle of feathers, a belt of vials, a staff with a crystal, a glowing vial held up
    const cx = 19, C = KC;
    // the staff on the left, taller than Ollo
    T.line(cx - 11, 61, cx - 11, 6, C.hide1); T.line(cx - 10.5, 61, cx - 10.5, 6, C.hide2);
    T.poly([[cx - 11, 0], [cx - 9, 4], [cx - 11, 8], [cx - 13, 4]], (x) => x < cx - 11 ? C.owl3 : C.l2 || C.owl2); T.glow(cx - 11, 4, 5, C.owl3, 0.4);
    // the robe to the floor, two golden trims, toes of talons peeking out
    T.poly([[cx - 6.5, 16], [cx + 6.5, 16], [cx + 10, 61], [cx - 10, 61]], (x) => x < cx - 3 ? C.robe2 : x > cx + 4 ? C.robe0 : C.robe1);
    kFolds(T, cx - 9, cx + 9, 26, 61, C.robe0, 4);
    T.line(cx, 24, cx, 61, C.brass1);
    for (const tx of [cx - 3, cx + 3]) for (let k = -1; k <= 1; k++) T.px(tx + k, 62, C.brass1);
    T.line(cx - 6, 31, cx + 6, 31, C.hide1);
    for (const [vx, c] of [[cx - 4, C.glowG], [cx - 1.5, C.pink], [cx + 3, C.glowY]]) { T.disc(vx, 33, 0.9, c, 1.4); T.px(vx, 31.5, C.steel3); }
    // the mantle of feathers over the shoulders, the high collar
    T.poly([[cx - 9, 16], [cx + 9, 16], [cx + 8, 24], [cx, 26], [cx - 8, 24]], C.owl1);
    for (let k = 0; k < 8; k++) T.poly([[cx - 8 + k * 2.2, 22], [cx - 6.5 + k * 2.2, 22], [cx - 7.2 + k * 2.2, 25.5]], k % 2 ? C.owl0 : C.owl2);
    T.poly([[cx - 5, 12], [cx - 4, 17], [cx + 4, 17], [cx + 5, 12], [cx + 3, 15], [cx - 3, 15]], C.robe2);
    // arms in wide sleeves: the left on the staff, the right holding the vial up
    kArm(T, [cx - 8, 18], [cx - 10, 26], [cx - 10.5, 30], [C.robe1, C.robe0], [C.owl2, C.owl1, C.owl0], 3.6);
    kArm(T, [cx + 8, 18], [cx + 11, 25], [cx + 13, 19], [C.robe1, C.robe0], [C.owl2, C.owl1, C.owl0], 3.6);
    T.line(cx + 13, 18, cx + 13, 15, C.steel3); T.ball(cx + 13, 14, 1.6, C.glowG, C.glowG, C.moss3, 2); T.glow(cx + 13, 14, 5, C.glowG, 0.45);
    // the head: tufted, a pale face-disc, great amber eyes, a monocle on a chain
    T.poly([[cx - 4.5, 4], [cx - 5, -0.5], [cx - 2.5, 3]], C.owl0); T.poly([[cx + 4.5, 4], [cx + 5, -0.5], [cx + 2.5, 3]], C.owl0);
    T.ball(cx, 8, 5, C.owl2, C.owl1, C.owl0, 4.8);
    T.ball(cx - 2, 8, 2.2, C.owl3, C.owl3, C.owl2); T.ball(cx + 2, 8, 2.2, C.owl3, C.owl3, C.owl2);
    if (blink) { T.line(cx - 3.2, 8, cx - 1, 8, C.owl1); T.line(cx + 1, 8, cx + 3.2, 8, C.owl1); }
    else { T.disc(cx - 2, 8, 1.3, C.glowA, 1.3); T.disc(cx + 2, 8, 1.3, C.glowA, 1.3); T.disc(cx - 2, 8, 0.5, C.ink, 0.5); T.disc(cx + 2, 8, 0.5, C.ink, 0.5); }
    for (let k = 0; k < 14; k++) { const an = k / 14 * TAU; T.px(cx + 2 + Math.cos(an) * 2.3, 8 + Math.sin(an) * 2.3, C.brass2); }
    T.line(cx + 4, 9, cx + 6, 16, C.brass1);
    T.poly([[cx - 0.8, 10], [cx + 0.8, 10], [cx, 12]], C.brass1);
  },
  fennel(T, blink) {
    // the garden's turtle-folk: an old gardener whose great mossy shell is armour enough, a leather jerkin full of pockets, a broad hat, a lantern on a staff
    const cx = 18, C = KC;
    // the lantern staff on the right
    T.line(cx + 14, 61, cx + 14, 7, C.hide1); T.line(cx + 14.5, 61, cx + 14.5, 7, C.hide2);
    T.line(cx + 14, 7, cx + 18, 9, C.hide1); T.line(cx + 18, 9, cx + 18, 12, C.steel2);
    T.poly([[cx + 16, 12], [cx + 20, 12], [cx + 20, 18], [cx + 16, 18]], C.steel1); T.poly([[cx + 17, 13], [cx + 19, 13], [cx + 19, 17], [cx + 17, 17]], C.glowY); T.glow(cx + 18, 15, 7, C.glowY, 0.4);
    // the shell: a broad plated dome behind the shoulders, moss and sprouts on top
    T.ball(cx - 1.5, 27, 12, C.shell3, C.shell2, C.shell1, 15);
    for (const [px, py] of [[cx - 7, 19], [cx + 3, 18], [cx - 2, 28], [cx - 9, 31], [cx + 6, 30], [cx - 3, 38]]) { T.disc(px, py, 3.2, C.shell1, 2.4); T.disc(px, py, 2.2, C.shell2, 1.6); }
    for (let k = 0; k < 12; k++) T.px(cx - 10 + pxHash(k, 3) * 17, 13 + pxHash(k, 4) * 5, C.moss3);
    for (const [px, c] of [[cx - 8, C.pink], [cx - 2, C.glowY], [cx + 4, C.owl3]]) { T.line(px, 13, px, 9, C.moss2); T.disc(px, 8.5, 1, c, 1); }
    // sturdy legs, big bare feet
    kLeg(T, [cx - 3.5, 37], [cx - 4.5, 48], [cx - 4.5, 58], [C.toad2, C.toad1], C.toad1, -1, 4.4);
    kLeg(T, [cx + 3.5, 37], [cx + 4.5, 48], [cx + 4.5, 58], [C.toad2, C.toad1], C.toad1, 1, 4.4);
    for (const lx of [cx - 4.5, cx + 4.5]) T.poly([[lx - 2.4, 44], [lx + 2.4, 44], [lx + 2.2, 47], [lx - 2.2, 47]], C.straw0);
    // the jerkin with pockets, an apron, a belt with a trowel
    kTorso(T, cx, 18, 30, 38, 8, 7, 7.5, (x) => x < cx - 3 ? C.straw2 : C.straw1);
    T.poly([[cx - 6, 28], [cx + 6, 28], [cx + 7, 44], [cx - 7, 44]], C.hide2);
    for (const [px, py] of [[cx - 4, 33], [cx + 2, 33]]) { T.poly([[px, py], [px + 3, py], [px + 3, py + 3], [px, py + 3]], C.hide1); T.line(px, py, px + 3, py, C.hide0); }
    T.line(cx - 7, 28, cx + 7, 28, C.hide0); T.line(cx + 6, 28, cx + 8, 34, C.steel2);
    // thick arms: the right on the staff, the left holding a little pot of seedlings
    kArm(T, [cx + 8, 20], [cx + 11.5, 28], [cx + 13.5, 25], [C.toad2, C.toad1], [C.toad3, C.toad2, C.toad1], 4);
    kArm(T, [cx - 8, 20], [cx - 10, 28], [cx - 6, 31], [C.toad2, C.toad1], [C.toad3, C.toad2, C.toad1], 4);
    T.poly([[cx - 7, 29], [cx - 3, 29], [cx - 3.5, 33], [cx - 6.5, 33]], C.scale2); T.line(cx - 5, 29, cx - 5, 26, C.moss3); T.px(cx - 6, 26, C.moss3); T.px(cx - 4, 25.5, C.moss3);
    // neck forward, a hooked beak, wise heavy-lidded eyes, the broad tattered hat
    kLimb(T, [cx + 1, 19], [cx + 3, 14], 4, 3.4, C.toad2, C.toad1);
    T.ball(cx + 3.5, 11, 3.8, C.toad3, C.toad2, C.toad1, 3.4);
    T.poly([[cx + 6, 10.5], [cx + 9, 12], [cx + 7.5, 14], [cx + 6, 13]], C.brass0);
    T.line(cx + 2, 13.5, cx + 6, 13.5, C.toad0);
    if (blink) T.line(cx + 3.5, 10.5, cx + 6, 10.5, C.toad0); else { T.line(cx + 3.5, 9.8, cx + 6, 9.8, C.toad0); T.disc(cx + 4.8, 10.6, 0.6, C.glowY, 0.6); }
    T.poly([[cx - 8, 7.5], [cx + 14, 6.5], [cx + 11, 9], [cx - 5, 9.5]], (x, y) => (Math.floor(x) + Math.floor(y)) % 3 ? C.straw1 : C.straw2);
    T.poly([[cx - 1, 2], [cx + 7, 1.5], [cx + 8, 7], [cx - 2, 7.5]], (x, y) => (Math.floor(x * 2) + Math.floor(y)) % 5 ? C.straw1 : C.straw0);
    T.line(cx - 2, 6, cx + 8, 5.5, C.scale1);
  },
};
/**
 * The same drawing tools, S times finer: shapes keep their outline but get S×S as many pixels, so a keeper can stand
 * in a room on the room's own pixel grid (lines and dots stay one "keeper pixel" wide, i.e. S real pixels).
 */
function scaledT(T, S) {
  const k = v => v * S, col = c => typeof c === "function" ? (x, y) => c(x / S, y / S) : c;
  const quad = (x0, y0, x1, y1, w, c) => { const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len * w / 2, ny = dx / len * w / 2; T.poly([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], c); };
  return {
    // a dot is round and a little smaller than its square, so details read as details, not as big pixels
    px: (x, y, c) => T.disc(Math.round(x) * S + S / 2, Math.round(y) * S + S / 2, S * 0.5, c, S * 0.5),
    S, raw: T,
    has: (x, y) => T.has(Math.round(x) * S + (S >> 1), Math.round(y) * S + (S >> 1)),
    poly: (pts, c) => T.poly(pts.map(([x, y]) => [k(x), k(y)]), col(c)),
    ball: (cx, cy, r, l, m, d, ry = r) => T.ball(k(cx + 0.5), k(cy + 0.5), k(r), l, m, d, k(ry)),
    disc: (cx, cy, rx, c, ry = rx / 2) => T.disc(k(cx + 0.5), k(cy + 0.5), k(rx), col(c), k(ry)),
    line: (x0, y0, x1, y1, c) => { quad(k(x0 + 0.5), k(y0 + 0.5), k(x1 + 0.5), k(y1 + 0.5), S, c); T.disc(k(x0 + 0.5), k(y0 + 0.5), S / 2, c, S / 2); T.disc(k(x1 + 0.5), k(y1 + 0.5), S / 2, c, S / 2); },
    glow: (cx, cy, r, c, kk) => T.glow(k(cx + 0.5), k(cy + 0.5), k(r), c, kk),
  };
}
const keeperCache = {};
/** A keeper's full-length picture as a canvas, S real pixels to each of its own (S = 1 is the small 34×46 version). */
function keeperCanvas(id, blink = false, S = 1) {
  const key = `${id}|${blink ? 1 : 0}|${S}`;
  if (keeperCache[key]) return keeperCache[key];
  return keeperCache[key] = isoArt(KW * S, KH * S, T => KEEPER_ART[id](S === 1 ? T : scaledT(T, S), blink), { texture: false });
}
/** The same as a data URL (for the dialog box, the place bar and the map). */
function keeperImage(id, blink = false, S = 1) {
  if (!KEEPER_ART[id]) return pxIcon(id);
  const key = `url|${id}|${blink ? 1 : 0}|${S}`;
  return keeperCache[key] || (keeperCache[key] = keeperCanvas(id, blink, S).toDataURL());
}
/** Just the head and shoulders, for the dialog box. */
function keeperFace(id) {
  const key = id + ":face";
  if (keeperCache[key]) return keeperCache[key];
  if (!KEEPER_ART[id]) return pxIcon(id);
  // head and shoulders, drawn twice as fine as the small version
  const full = keeperCanvas(id, false, 2), c = document.createElement("canvas"); c.width = c.height = 52;
  c.getContext("2d").drawImage(full, -14, -2);
  return keeperCache[key] = c.toDataURL();
}
/** A tiny keeper for the map: a third the size, each map pixel the colour most of its 3×3 block has. */
function keeperMini(id) {
  const key = id + ":mini";
  if (keeperCache[key]) return keeperCache[key];
  if (!KEEPER_ART[id]) return pxIcon(id);
  const full = keeperCanvas(id, false, 1), d = full.getContext("2d").getImageData(0, 0, KW, KH).data, w = Math.ceil(KW / 3), h = Math.ceil(KH / 3);
  const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"), im = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const seen = new Map(); let opaque = 0;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { const X = x * 3 + i, Y = y * 3 + j; if (X >= KW || Y >= KH) continue; const o = (Y * KW + X) * 4; if (d[o + 3] < 128) continue; opaque++; const key2 = (d[o] << 16) | (d[o + 1] << 8) | d[o + 2]; seen.set(key2, (seen.get(key2) || 0) + (key2 === 0x0b0614 ? 0.6 : 1)); }
    if (opaque < 4) continue;
    const best = [...seen].sort((p, q) => q[1] - p[1])[0][0], o = (y * w + x) * 4;
    im.data[o] = best >> 16; im.data[o + 1] = (best >> 8) & 255; im.data[o + 2] = best & 255; im.data[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return keeperCache[key] = c.toDataURL();
}
