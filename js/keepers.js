"use strict";
// Hatchstone · the keepers of the places, drawn full-length: dark-fantasy folk of the valley, each with their trade in hand.
// All the game's scripts share one global scope and load in order (see index.html).

const KW = 34, KH = 46; // each keeper is 34×46 art pixels, standing on the bottom middle
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
  map0: "#a8844a", map1: "#e2c08d", ink: "#0b0614",
}).map(([k, v]) => [k, pxHex(v)]));

/** Folds down a cloth: darker lines every few pixels across a polygon's span. */
function kFolds(T, x0, x1, y0, y1, col, every = 4) {
  for (let x = x0 + 2; x < x1 - 1; x += every) for (let y = y0 + 3; y < y1 - 1; y++) if (T.has(x, y) && pxHash(x, y >> 2) > 0.25) T.px(x, y, col);
}
/** A body's cloak or coat: a trapezoid from shoulders to hem, lit on the left, with folds and a ragged hem if asked. */
function kCloak(T, cx, top, bottom, wTop, wBot, [dark, mid, light], ragged = false) {
  T.poly([[cx - wTop, top], [cx + wTop, top], [cx + wBot, bottom], [cx - wBot, bottom]], (x, y) => x < cx - wTop * 0.35 - (y - top) * 0.15 ? light : x > cx + wTop * 0.5 + (y - top) * 0.2 ? dark : mid);
  kFolds(T, Math.floor(cx - wBot), Math.ceil(cx + wBot), top, bottom, dark, 5);
  if (ragged) for (let x = Math.floor(cx - wBot); x <= cx + wBot; x++) if (pxHash(x, 3) > 0.55) T.px(x, bottom + 1, dark);
}
const glowEye = (T, x, y, col) => { T.px(x, y, col); T.glow(x, y, 3, col, 0.5); };

const KEEPER_ART = {
  tansy(T, blink) {
    // a hedgehog merchant in a dark hooded mantle, spines bristling out of the hood, brass scales at her belt
    const cx = 17, C = KC;
    T.poly([[11, 42], [15, 42], [15, 45], [10, 45]], C.hide0); T.poly([[19, 42], [23, 42], [24, 45], [19, 45]], C.hide0);
    kCloak(T, cx, 22, 42, 6, 10, [C.plum1, C.plum2, C.plum3], true);
    T.line(9, 33, 25, 33, C.brass1); T.px(13, 33, C.brass2);
    T.line(22, 33, 22, 37, C.brass1); T.line(19, 37, 25, 37, C.brass1); T.disc(19, 38, 1.5, C.brass2, 0.8); T.disc(25, 38, 1.5, C.brass2, 0.8);
    T.poly([[11, 23], [8, 31], [10, 32], [13, 25]], C.plum2); T.ball(9, 32, 1.6, C.cream2, C.cream1, C.cream0);
    T.poly([[23, 23], [26, 30], [24, 31], [21, 25]], C.plum1); T.ball(25, 31, 1.6, C.cream1, C.cream1, C.cream0);
    // spines through the hood, then the hood, then the face
    for (let k = 0; k < 15; k++) { const an = Math.PI * (1.05 + k / 14 * 0.9), r0 = 7, r1 = 11 + pxHash(k, 1) * 3; T.line(cx + Math.cos(an) * r0, 15 + Math.sin(an) * r0, cx + Math.cos(an) * r1, 15 + Math.sin(an) * r1 * 0.9, k % 2 ? C.spine2 : C.spine1); }
    T.ball(cx, 15, 8.5, C.plum3, C.plum2, C.plum1, 8);
    T.ball(cx, 17, 5.2, C.cream2, C.cream1, C.cream0, 5);
    T.poly([[cx - 2, 19], [cx + 2, 19], [cx, 23]], C.cream1); T.px(cx, 23, C.ink); T.px(cx, 22, C.spine0);
    if (blink) { T.line(cx - 3, 17, cx - 2, 17, C.cream0); T.line(cx + 2, 17, cx + 3, 17, C.cream0); }
    else for (const ex of [cx - 3, cx + 2]) { T.px(ex, 16, C.ink); T.px(ex + 1, 16, C.ink); T.px(ex, 17, C.ink); T.px(ex + 1, 17, C.glowA); T.glow(ex + 1, 17, 3, C.glowA, 0.35); }
    T.px(cx - 4, 19, C.pink); T.px(cx + 4, 19, C.pink); T.line(cx - 1, 21, cx + 1, 21, C.cream0);
  },
  ember(T, blink) {
    // a salamander smith: tall, horned, scales the colour of embers, a scorched leather apron and a heavy hammer
    const cx = 16, C = KC;
    T.poly([[26, 40], [31, 38], [33, 41], [29, 44], [24, 44]], C.scale1); T.px(32, 40, C.scale2);
    T.poly([[11, 41], [15, 41], [15, 45], [10, 45]], C.scale0); T.poly([[18, 41], [22, 41], [23, 45], [18, 45]], C.scale0);
    kCloak(T, cx, 20, 41, 7, 8, [C.scale0, C.scale1, C.scale2]);
    for (let k = 0; k < 18; k++) T.px(cx - 6 + pxHash(k, 2) * 12, 21 + pxHash(k, 3) * 18, C.scale3);
    T.poly([[cx - 5, 25], [cx + 5, 25], [cx + 6, 41], [cx - 6, 41]], (x, y) => pxHash(x, y) > 0.9 ? C.hide0 : x < cx - 2 ? C.hide2 : C.hide1);
    T.line(cx - 5, 25, cx - 7, 21, C.hide0); T.line(cx + 5, 25, cx + 7, 21, C.hide0);
    // arms: the right one holds the hammer up
    T.poly([[cx - 7, 21], [cx - 10, 31], [cx - 8, 32], [cx - 5, 23]], C.scale1); T.ball(cx - 9, 32, 1.8, C.scale2, C.scale1, C.scale0);
    T.poly([[cx + 7, 21], [cx + 11, 26], [cx + 9, 28], [cx + 5, 24]], C.scale1); T.ball(cx + 11, 26, 1.8, C.scale2, C.scale1, C.scale0);
    T.line(cx + 11, 26, cx + 15, 12, C.hide2); T.line(cx + 12, 26, cx + 16, 12, C.hide1);
    T.poly([[cx + 12, 9], [cx + 19, 11], [cx + 18, 15], [cx + 11, 13]], C.steel1); T.line(cx + 12, 9, cx + 19, 11, C.steel3);
    T.glow(cx + 15, 11, 4, C.glowA, 0.3);
    // a long head with a horned brow and burning eyes
    T.ball(cx, 14, 7, C.scale3, C.scale2, C.scale1, 6);
    T.ball(cx + 1, 17, 5, C.scale2, C.scale2, C.scale1, 3);
    T.poly([[cx - 6, 10], [cx - 9, 4], [cx - 4, 9]], C.velvet1); T.poly([[cx + 5, 9], [cx + 8, 3], [cx + 7, 10]], C.velvet1);
    T.line(cx - 3, 19, cx + 4, 19, C.scale0);
    if (blink) { T.line(cx - 4, 13, cx - 2, 13, C.scale0); T.line(cx + 2, 13, cx + 4, 13, C.scale0); }
    else { glowEye(T, cx - 3, 13, C.glowY); glowEye(T, cx + 3, 13, C.glowY); T.px(cx - 3, 12, C.glowW); T.px(cx + 3, 12, C.glowW); }
  },
  pip(T, blink) {
    // a star-nosed mole who maps the tunnels: a long travelling coat, a hat with a candle stub, a rolled map under one arm
    const cx = 17, C = KC;
    T.poly([[11, 42], [16, 42], [16, 45], [10, 45]], C.coat0); T.poly([[18, 42], [23, 42], [24, 45], [18, 45]], C.coat0);
    kCloak(T, cx, 23, 42, 7, 9, [C.coat0, C.coat1, C.coat2], true);
    T.line(cx - 6, 24, cx + 7, 38, C.hide0); T.poly([[cx + 5, 34], [cx + 10, 34], [cx + 10, 39], [cx + 5, 39]], C.hide1);
    // the map under the left arm
    T.poly([[4, 28], [14, 25], [15, 28], [5, 31]], C.map1); T.line(5, 31, 15, 28, C.map0); T.px(9, 28, C.scale2); T.px(9, 29, C.scale2);
    T.poly([[cx - 7, 23], [cx - 10, 29], [cx - 8, 30], [cx - 5, 25]], C.coat2);
    for (let k = 0; k < 3; k++) T.px(cx - 10 + k, 31, C.pink);
    T.poly([[cx + 7, 23], [cx + 9, 31], [cx + 7, 32], [cx + 5, 25]], C.coat1);
    for (let k = 0; k < 3; k++) T.px(cx + 7 + k, 33, C.pink);
    // the velvet head, the star of pink feelers, small sleepy eyes
    T.ball(cx, 17, 7, C.velvet2, C.velvet1, C.velvet0, 6.5);
    for (let k = 0; k < 10; k++) { const an = k / 10 * TAU; T.px(cx + Math.cos(an) * 2.6, 21 + Math.sin(an) * 2, k % 2 ? C.pink : C.pink2); }
    T.px(cx, 21, C.pink2);
    if (blink) { T.line(cx - 4, 17, cx - 2, 17, C.velvet0); T.line(cx + 2, 17, cx + 4, 17, C.velvet0); } else { T.px(cx - 3, 17, C.glowW); T.px(cx + 3, 17, C.glowW); T.glow(cx - 3, 17, 2, C.glowW, 0.4); T.glow(cx + 3, 17, 2, C.glowW, 0.4); }
    // a battered hat with brass goggles on the band and a candle burning on top
    T.poly([[cx - 10, 12], [cx + 10, 12], [cx + 8, 14], [cx - 8, 14]], C.hide0);
    T.poly([[cx - 6, 5], [cx + 6, 5], [cx + 7, 12], [cx - 7, 12]], C.hide1); T.line(cx - 7, 10, cx + 7, 10, C.hide0);
    T.disc(cx - 3, 10, 1.6, C.brass2, 1.3); T.disc(cx + 2, 10, 1.6, C.brass1, 1.3);
    T.poly([[cx + 1, 1], [cx + 3, 1], [cx + 3, 5], [cx + 1, 5]], C.cream2); T.px(cx + 2, 0, C.glowY); T.glow(cx + 2, 0, 4, C.glowY, 0.45);
  },
  ollo(T, blink) {
    // an owl alchemist in a high-collared midnight robe, a monocle in one great eye, a glowing vial held up
    const cx = 17, C = KC;
    kCloak(T, cx, 22, 44, 7, 11, [C.robe0, C.robe1, C.robe2]);
    for (let y = 26; y < 44; y += 3) T.px(cx, y, C.robe3);
    T.poly([[cx - 9, 20], [cx - 6, 26], [cx, 24], [cx + 6, 26], [cx + 9, 20], [cx + 6, 23], [cx, 21], [cx - 6, 23]], C.robe2);
    T.disc(cx, 25, 1.4, KC.steel3, 1);
    // the vial, glowing green
    T.poly([[cx + 7, 23], [cx + 12, 27], [cx + 10, 29], [cx + 5, 26]], C.robe1);
    T.line(cx + 12, 25, cx + 12, 20, C.steel3); T.ball(cx + 12, 27, 2, C.glowG, C.glowG, C.moss3); T.glow(cx + 12, 26, 6, C.glowG, 0.4);
    T.poly([[cx - 7, 23], [cx - 10, 33], [cx - 7, 34], [cx - 5, 26]], C.robe1);
    // the head: tufted, a pale face-disc, two huge amber eyes
    T.poly([[cx - 8, 6], [cx - 6, 1], [cx - 4, 7]], C.owl0); T.poly([[cx + 8, 6], [cx + 6, 1], [cx + 4, 7]], C.owl0);
    T.ball(cx, 13, 9, C.owl2, C.owl1, C.owl0, 8.5);
    T.ball(cx - 3.5, 13, 3.6, C.owl3, C.owl3, C.owl2); T.ball(cx + 3.5, 13, 3.6, C.owl3, C.owl3, C.owl2);
    if (blink) { T.line(cx - 6, 13, cx - 2, 13, C.owl1); T.line(cx + 2, 13, cx + 6, 13, C.owl1); }
    else { T.disc(cx - 3.5, 13, 2.2, C.glowA, 2.2); T.disc(cx + 3.5, 13, 2.2, C.glowA, 2.2); T.px(cx - 3, 13, C.ink); T.px(cx + 4, 13, C.ink); T.px(cx - 4, 12, C.glowW); T.px(cx + 3, 12, C.glowW); }
    for (let k = 0; k < 12; k++) { const an = k / 12 * TAU; T.px(cx + 3.5 + Math.cos(an) * 3.4, 13 + Math.sin(an) * 3.4, C.brass2); }
    T.line(cx + 6, 15, cx + 8, 22, C.brass1);
    T.poly([[cx - 1, 16], [cx + 1, 16], [cx, 19]], C.brass1);
  },
  fennel(T, blink) {
    // a toad hermit: hunched under a ragged moss cloak and a broad tattered straw hat, a lantern swinging from his staff
    const cx = 15, C = KC;
    T.line(28, 6, 26, 45, C.hide1); T.line(29, 6, 27, 45, C.hide2);
    T.line(28, 6, 32, 8, C.hide1); T.line(32, 8, 32, 11, C.steel2);
    T.poly([[30, 11], [34, 11], [34, 16], [30, 16]], C.steel1); T.poly([[31, 12], [33, 12], [33, 15], [31, 15]], C.glowY); T.glow(32, 13, 8, C.glowY, 0.4);
    T.poly([[8, 42], [13, 42], [13, 45], [6, 45]], C.toad1); T.poly([[17, 42], [22, 42], [24, 45], [17, 45]], C.toad1);
    kCloak(T, cx, 22, 42, 9, 12, [C.moss0, C.moss1, C.moss2], true);
    for (let k = 0; k < 10; k++) T.px(cx - 9 + pxHash(k, 6) * 18, 24 + pxHash(k, 8) * 16, C.moss3);
    T.poly([[cx + 8, 25], [cx + 12, 27], [cx + 12, 29], [cx + 7, 28]], C.toad2);
    // the wide head with gold slit eyes and a long mouth
    T.ball(cx, 18, 9, C.toad3, C.toad2, C.toad1, 6);
    for (let k = 0; k < 6; k++) T.px(cx - 6 + pxHash(k, 11) * 12, 15 + pxHash(k, 12) * 6, C.toad1);
    T.line(cx - 6, 21, cx + 6, 21, C.toad0); T.px(cx - 7, 20, C.toad0); T.px(cx + 7, 20, C.toad0);
    if (blink) { T.line(cx - 5, 16, cx - 3, 16, C.toad1); T.line(cx + 3, 16, cx + 5, 16, C.toad1); }
    else { T.ball(cx - 4, 15, 2, C.glowY, C.glowY, C.brass1); T.ball(cx + 4, 15, 2, C.glowY, C.glowY, C.brass1); T.line(cx - 4, 14, cx - 4, 16, C.ink); T.line(cx + 4, 14, cx + 4, 16, C.ink); }
    // the hat, broad and frayed
    T.poly([[cx - 14, 12], [cx + 14, 11], [cx + 11, 14], [cx - 11, 14]], (x, y) => (x + y) % 3 ? C.straw1 : C.straw2);
    T.poly([[cx - 7, 5], [cx + 6, 4], [cx + 8, 12], [cx - 8, 12]], (x, y) => (x * 2 + y) % 5 ? C.straw1 : C.straw0);
    for (let x = cx - 14; x <= cx + 14; x += 2) if (pxHash(x, 9) > 0.5) T.px(x, 14, C.straw0);
    T.line(cx - 8, 10, cx + 8, 10, C.scale1);
  },
};
const keeperCache = {};
/** A keeper's full-length picture (a data URL), eyes open or mid-blink. */
function keeperImage(id, blink = false) {
  const key = id + (blink ? ":b" : "");
  if (keeperCache[key]) return keeperCache[key];
  if (!KEEPER_ART[id]) return pxIcon(id);
  return keeperCache[key] = isoArt(KW, KH, T => KEEPER_ART[id](T, blink)).toDataURL();
}
/** Just the head and shoulders, for the dialog box. */
function keeperFace(id) {
  const key = id + ":face";
  if (keeperCache[key]) return keeperCache[key];
  if (!KEEPER_ART[id]) return pxIcon(id);
  const full = isoArt(KW, KH, T => KEEPER_ART[id](T, false)), c = document.createElement("canvas"); c.width = c.height = 30;
  c.getContext("2d").drawImage(full, -2, 0);
  return keeperCache[key] = c.toDataURL();
}
