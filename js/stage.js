"use strict";
// ---------- the geode's stage: a stone plinth with a woven nest on it, the cave floor run on down to the bottom of the
// screen, and two things of the cave's own beside it ----------
// Painted pixel by pixel once per cave and screen size (stageArt keeps it), in palette colors, so it costs one drawImage a
// frame. The shell chips that land on the floor are laid onto a layer of their own, only the new ones each frame (drawRest),
// and stay there until the next egg. Nothing here moves: the live candle flames are drawn on top, as before.

// palette ramps, dark to light (each one hue-shifted: cool, saturated shadows and warm lights)
const STAGE_RAMP = {
  stone: ["#0b0614", "#22143a", "#3a3440", "#5d5666", "#7a6a7e", "#a596a8", "#cfc4d6"],
  warm: ["#2a1e1a", "#4a362c", "#6e5444", "#98786a", "#c4a796", "#d9c2b4"],
  // candlelight on dark stone: the floor warms through plum and rose to old brass
  pool: ["#0b0614", "#2a1e1a", "#4a362c", "#6e5444", "#98786a", "#c4a796"],
  straw: ["#2a1e1a", "#4a362c", "#5e3a1c", "#946027", "#c98f3a", "#eec26a"],
  felt: ["#160c26", "#22143a", "#2e1d4f", "#3d2866", "#523a85"],
  moss: ["#10301f", "#1e5233", "#2f7d4a", "#57ad6a", "#a3dd9b"],
  lilacMoss: ["#2e1d4f", "#3d2866", "#523a85", "#6b4fa8", "#8a6cc9"],
  water: ["#0b0614", "#0f2f4a", "#1d5276", "#3383a8", "#69b7d6", "#b8e6f5"],
  lilac: ["#2e1d4f", "#523a85", "#6b4fa8", "#8a6cc9", "#ad91e6", "#d2bfff", "#efe6ff"],
  ice: ["#0f2f4a", "#1d5276", "#3383a8", "#69b7d6", "#b8e6f5", "#ffffff"],
  glow: ["#10301f", "#1e5233", "#2f7d4a", "#57ad6a", "#a3dd9b"],
  wax: ["#3a3440", "#6e5444", "#98786a", "#c4a796", "#d9c2b4", "#efe0d4"],
  brass: ["#2a1e1a", "#5e3a1c", "#946027", "#c98f3a", "#eec26a"],
  iron: ["#0b0614", "#2a1e1a", "#4a362c", "#6e5444"],
  slab: ["#0b0614", "#160c26", "#22143a", "#3a3440", "#5d5666"],
  sheen: ["#1d5276", "#3383a8", "#69b7d6", "#a3dd9b", "#eec26a"],
  candle: ["#5e3a1c", "#946027", "#c98f3a", "#eec26a", "#fff0b5"],
  ink: ["#0b0614"],
};
const SR = Object.fromEntries(Object.entries(STAGE_RAMP).map(([k, v]) => [k, v.map(pxHex)]));

/**
 * Each cave's floor and its two props. floor: the cobbles' ramp; moss: how much grows in the joints (0..1) and in which
 * ramp; puddles: how many; props: [kind, side] (side -1 left, 1 right; a pool lies on the floor in front).
 * The moonlit ruins (a moon egg) get the floor and the plinth, nothing of a cave's own.
 */
const STAGE_CAVES = {
  amethyst: { seed: 5, floor: ["#0b0614", "#160c26", "#22143a", "#2e1d4f", "#3d2866", "#523a85"], moss: 0.25, mossRamp: "lilacMoss", puddles: 1, props: [["cluster", -1], ["stubs", 1]], fleck: "#ad91e6" },
  celestite: { seed: 12, floor: ["#0b0614", "#160c26", "#0f2f4a", "#1d5276", "#3383a8", "#69b7d6"], moss: 0.1, mossRamp: "lilacMoss", puddles: 3, props: [["shards", -1], ["pool", 1]], fleck: "#b8e6f5" },
  malachite: { seed: 19, floor: ["#0b0614", "#160c26", "#22143a", "#3a3440", "#5d5666", "#7a6a7e"], moss: 0.7, mossRamp: "moss", puddles: 2, props: [["stones", -1], ["caps", 1]], fleck: "#57ad6a" },
  labradorite: { seed: 26, floor: ["#0b0614", "#160c26", "#3a3440", "#5d5666", "#7a6a7e"], moss: 0.2, mossRamp: "moss", puddles: 2, props: [["slabs", -1], ["lantern", 1]], fleck: "#69b7d6" },
  plain: { seed: 33, floor: ["#160c26", "#3a3440", "#5d5666", "#7a6a7e", "#a596a8", "#cfc4d6"], moss: 0.35, mossRamp: "lilacMoss", puddles: 1, props: [] },
};
// how big each prop is, in units of the egg (its width is 240 of them): [width, height]
const PROP_SIZE = { cluster: [54, 64], stubs: [44, 30], shards: [48, 68], pool: [96, 30], stones: [64, 42], caps: [50, 48], slabs: [50, 74], lantern: [24, 50] };
/** The props are drawn on a grid of this many units to their own pixel sizes above (so 1.5: half again as big). */
const PROP_SCALE = 1.5;
// the light some of them give: [tint ramp, how far it reaches (units)]
const PROP_LIGHT = { cluster: ["lilac", 46], shards: ["ice", 36], caps: ["glow", 52], lantern: ["pool", 64], pool: ["ice", 40] };
/** How many chips stay on the floor of one level at most (after that new ones just fade, as they did). */
const REST_MAX = 120;
/** The hint's strip along the bottom: nothing of note is put there, and no chip settles in it. */
const STAGE_QUIET = 84;

const stageCave = id => STAGE_CAVES[id] || STAGE_CAVES.plain;

/**
 * Where everything stands, in screen pixels, for the egg laid out in Lo on a Wd×Hd screen: the nest under the egg, the
 * plinth under the nest, where its foot meets the floor, the floor's back edge (the backdrop's ground line), the props
 * beside it, the warm pools of the two candles on the plinth and the band of floor where chips land.
 */
function stageGeom(id, Wd, Hd, Lo) {
  const e = Lo.ew, k = e / 240, cx = Lo.ecx, f = Lo.floor;
  // on a wide, low screen the egg comes down near the bottom: the plinth grows lower (not narrower) to leave some floor
  const z = clamp((Hd - f) / (0.6 * e), 0.45, 1);
  // the nest: the egg sits a little way down in it, so its front rim hides the very bottom of the shell
  const lip = f - 0.035 * e, nest = { cx, rx: 0.45 * e, back: lip - 0.16 * e * z, front: f + 0.08 * e * z, irx: 0.28 * e, iry: 0.05 * e * z, lip };
  // the plinth: a round stone drum of two courses on a wider foot
  const plinth = { cx, ty: f + 0.05 * e * z, rx: 0.52 * e, ry: 0.11 * e * z, h: 0.13 * e * z, frx: 0.57 * e, fh: 0.045 * e * z };
  const base = plinth.ty + plinth.h + plinth.fh, foot = base + plinth.ry * plinth.frx / plinth.rx;
  const quiet = Hd - STAGE_QUIET;
  const candles = [-1, 1].map(s => ({ x: cx + s * 0.45 * e, y: plinth.ty + 0.045 * e * z }));
  const props = stageCave(id).props.map(([kind, side]) => {
    const [pw, ph] = PROP_SIZE[kind].map(v => v * k);
    let x, yb;
    if (kind === "pool") { x = cx + side * 0.5 * e; yb = Math.min(foot + 0.1 * e, quiet - 4 - ph / 2); }
    // beside the foot and a little behind it, the plinth hiding its inner edge
    else { x = cx + side * (plinth.frx + pw * 0.22); yb = base - 0.01 * e; }
    x = clamp(x, pw / 2 + 4, Wd - pw / 2 - 4);
    return { kind, side, x, yb, w: pw, h: ph, box: [x - pw / 2, yb - ph, x + pw / 2, yb + (kind === "pool" ? ph / 2 : 2 * k)] };
  });
  const lights = [
    { x: cx, y: foot + 0.025 * e, rx: 0.68 * e, ry: 0.1 * e, tint: "pool" },
    ...props.filter(p => PROP_LIGHT[p.kind]).map(p => ({ x: p.x, y: p.kind === "pool" ? p.yb : p.yb + 2 * k, rx: PROP_LIGHT[p.kind][1] * k * PROP_SCALE, ry: PROP_LIGHT[p.kind][1] * k * PROP_SCALE * 0.32, tint: PROP_LIGHT[p.kind][0] })),
  ];
  // chips land on the floor in front of the plinth's foot, short of the hint's strip (or, with no room there, on the slab and beside it)
  const land = [foot + 0.01 * e, Math.min(quiet - 6, foot + 0.2 * e)];
  return { e, k, z, cx, horizon: f - 0.09 * e * z, nest, plinth, base, foot, quiet, candles, props, lights, land };
}

/**
 * Paint the stage for cave id on a canvas of the art grid (one pixel per art pixel). Transparent above the floor's back
 * edge except where the plinth, the nest and the props stand. With lip, only the nest's front rim (drawn over the egg).
 */
function paintStage(id, Wd, Hd, px, G, lip = false) {
  const s = 1 / px, w = Math.ceil(Wd * s), h = Math.ceil(Hd * s), u = G.k * s, C = stageCave(id), seed = C.seed;
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d"), img = g.createImageData(w, h), d = img.data;
  const set = (x, y, col) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
  const pick = (ramp, v) => ramp[clamp(Math.floor(v * ramp.length), 0, ramp.length - 1)];
  const sm = (a, b, x) => pxSmooth(a, b, x);
  /** Paint one solid thing: f gives each pixel's color (or nothing); then a dark outline round it, as the props have. */
  const obj = (x0, y0, x1, y1, fn, ink = true) => {
    x0 = Math.floor(x0) - 1; y0 = Math.floor(y0) - 1; x1 = Math.ceil(x1) + 1; y1 = Math.ceil(y1) + 1;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, m = new Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) m[y * bw + x] = fn(x0 + x, y0 + y) || null;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const col = m[y * bw + x];
      if (col) { set(x0 + x, y0 + y, col); continue; }
      if (ink && ((x > 0 && m[y * bw + x - 1]) || (x < bw - 1 && m[y * bw + x + 1]) || (y > 0 && m[(y - 1) * bw + x]) || (y < bh - 1 && m[(y + 1) * bw + x]))) set(x0 + x, y0 + y, SR.ink[0]);
    }
  };
  const cx = G.cx * s, N = G.nest, P = G.plinth;

  // ---- the nest (all of it on the stage; only its front rim on the lip layer) ----
  const nest = () => {
    const ncx = N.cx * s, orx = N.rx * s, oy = (N.back + N.front) / 2 * s, ory = (N.front - N.back) / 2 * s, irx = N.irx * s, iry = N.iry * s, hy = N.lip * s - iry;
    obj(ncx - orx - 2, oy - ory - 2, ncx + orx + 2, oy + ory + 2, (x, y) => {
      const nx = (x + 0.5 - ncx) / orx, ny = (y + 0.5 - oy) / ory, rho = Math.hypot(nx, ny);
      // a ragged edge: straw ends sticking out here and there
      if (rho > 1 + (pxHash(x, y + seed) > 0.9 ? 0.06 : 0) - 0.04 * pxNoise(x * 0.5, y * 0.5)) return null;
      const hole = ((x + 0.5 - ncx) / irx) ** 2 + ((y + 0.5 - hy) / iry) ** 2 <= 1;
      if (lip && (hole || y + 0.5 < hy)) return null;
      // the soft lining, deep in the hollow: plum felt, darker at the back
      if (hole) return pick(SR.felt, 0.25 + 0.5 * clamp((y + 0.5 - hy) / iry + 0.5, 0, 1) - 0.15 * nx);
      const th = Math.atan2(ny, nx), rin = Math.hypot((irx / orx) * Math.cos(th), (iry / ory) * Math.sin(th) + (hy - oy) / ory * 0.6);
      const r = clamp((rho - rin) / (1 - rin), 0, 1);
      // coils of straw laid round and round, lit from the upper left and rounded like a roll, a stitch binding them every so
      // often; the outer coil sags a little and a few stray ends stick out
      let v = 0.22 + 0.4 * Math.sin(Math.PI * clamp(r * 0.9 + 0.1, 0, 1)) - 0.12 * Math.cos(th) - (ny > 0 ? 0.18 * ny * r : 0);
      const coil = r * 4.2 + 0.25 * Math.sin(th * 7 + seed), band = Math.floor(coil), fc = coil - band;
      if (fc < 0.22) v -= 0.2; else if (fc > 0.45 && fc < 0.7) v += 0.1;
      const st = (th / TAU + 0.5) * 30 + band * 0.5, sf = st - Math.floor(st);
      if (sf < 0.07 * (1 + band % 2)) v = fc < 0.22 ? v : 0.62;
      v += 0.08 * (pxHash(Math.floor(st * 3), band) - 0.5);
      return pick(SR.straw, v);
    });
  };
  /** A few stray straws sticking out of the nest, at the sides and the back. */
  const strays = () => {
    const ncx = N.cx * s, orx = N.rx * s, oy = (N.back + N.front) / 2 * s, ory = (N.front - N.back) / 2 * s;
    for (let n = 0; n < 9; n++) {
      const a = Math.PI * (0.95 + 1.1 * pxHash(n, seed + 90)) + (n % 3 ? 0 : Math.PI * 0.45), len = (5 + 7 * pxHash(n, seed + 91)) * G.k * s, tilt = (pxHash(n, seed + 92) - 0.5) * 0.9;
      const x0 = ncx + Math.cos(a) * orx * 0.92, y0 = oy + Math.sin(a) * ory * 0.92;
      for (let j = 0; j < len; j++) set(Math.round(x0 + Math.cos(a + tilt) * j), Math.round(y0 + Math.sin(a + tilt) * j * 0.6), SR.straw[j < len * 0.6 ? 3 : 4]);
    }
  };
  if (lip) { nest(); g.putImageData(img, 0, 0); return cv; }

  // ---- the floor: rounded cobbles in perspective, dark mortar, each stone lit on its far-left edge ----
  const hz = Math.round(G.horizon * s), span = h - hz, cw = 0.115 * G.e * s, fl = C.floor.map(pxHex);
  const kind = new Uint8Array(w * h), shade = new Float32Array(w * h), tint = new Array(w * h);
  const mossR = SR[C.mossRamp];
  const shadows = [[cx, G.foot * s, P.frx * s * 1.08, P.ry * s * 0.55], ...G.props.filter(p => p.kind !== "pool").map(p => [p.x * s, p.yb * s, p.w * s * 0.55, p.w * s * 0.14])];
  const lights = G.lights.map(l => ({ x: l.x * s, y: l.y * s, rx: l.rx * s, ry: l.ry * s, ramp: SR[l.tint] }));
  for (let y = Math.max(0, hz); y < h; y++) {
    const t = (y - hz + 0.5) / span, q = t + 0.16, Z = Math.log(q) * span / (0.42 * cw);
    for (let x = 0; x < w; x++) {
      const X = (x + 0.5 - cx) / (q * cw), i = y * w + x;
      let d1 = 9, d2 = 9, id = 0, ox = 0, oz = 0;
      for (let j = Math.floor(Z) - 1; j <= Math.floor(Z) + 1; j++) {
        const sh = (j & 1) * 0.5;
        for (let a = Math.floor(X + sh) - 1; a <= Math.floor(X + sh) + 1; a++) {
          const sx = a + 0.2 + 0.6 * pxHash(a, j * 7 + seed) - sh, sz = j + 0.2 + 0.6 * pxHash(a + 11, j + seed), dx = X - sx, dz = Z - sz, dd = Math.hypot(dx, dz);
          if (dd < d1) { d2 = d1; d1 = dd; id = a * 131 + j; ox = dx; oz = dz; } else if (dd < d2) d2 = dd;
        }
      }
      const gap = d2 - d1, onePx = 1 / (q * cw);
      let v, kd = 1;
      if (gap < Math.max(0.08, 1.1 * onePx)) { v = 0.12; kd = 2; }
      else {
        v = 0.58 + 0.16 * (pxHash(id, seed) - 0.5) - 0.32 * (d1 / 0.6) ** 2;
        // the edge facing the light (far and left) catches it; the near right one falls into shadow
        if (gap < Math.max(0.2, 2.6 * onePx)) v += ox < 0 || oz < 0 ? 0.16 : -0.12;
        v += (pxFbm(x * 0.3, y * 0.3) - 0.5) * 0.1 + (pxHash(x, y + seed) > 0.985 ? 0.12 : 0);
      }
      // moss in the joints and creeping onto the stones, more of it toward the sides and the plinth's foot
      const near = Math.max(0, 1 - Math.abs(y - G.foot * s) / (0.12 * G.e * s)) * Math.max(0, 1 - Math.abs(x - cx) / (P.frx * s * 1.3));
      const mo = pxFbm(X * 0.35 + seed, Z * 0.35) + C.moss * 0.22 + near * 0.15 + (kd === 2 ? 0.08 : 0);
      if (mo > (kd === 2 ? 0.8 : 0.95) && t > 0.06) kd = 3;
      // a fade to the dark: the far edge, the sides and the very bottom
      v = v * (0.4 + 0.6 * sm(0, 0.35, t)) - 0.4 * clamp(Math.abs(x + 0.5 - cx) / (w * 0.5), 0, 1) ** 2 - 0.1 * sm(0.8, 1, t);
      kind[i] = kd; shade[i] = v;
      // the far edge melts into the backdrop's own floor: the first rows only on every other pixel
      if (y - hz < 3 && (x + y + (y - hz)) % (y - hz + 2)) kind[i] = 9;
    }
  }
  // puddles: a few still, flat ones, a bright glint on the far bank
  const puddles = [];
  for (let n = 0, tries = 0; n < C.puddles && tries < 40; tries++) {
    const tx = pxHash(tries, seed + 40), ty = 0.18 + 0.4 * pxHash(tries, seed + 41), py = hz + ty * span, side = tx < 0.5 ? -1 : 1;
    const px0 = cx + side * (P.frx * s * (0.7 + 0.9 * (tx < 0.5 ? tx * 2 : (tx - 0.5) * 2))), rx = (8 + 10 * pxHash(tries, seed + 42)) * u * (0.6 + ty), ry = rx * 0.3;
    if (px0 - rx < 2 || px0 + rx > w - 2 || py + ry > G.quiet * s || Math.abs(px0 - cx) < P.frx * s + rx) continue;
    if (G.props.some(p => px0 + rx > p.box[0] * s - 3 && px0 - rx < p.box[2] * s + 3 && py + ry > p.box[1] * s && py - ry < p.box[3] * s + 6)) continue;
    puddles.push([px0, py, rx, ry]); n++;
  }
  // the still pool (the Celestite's): the same as a puddle, only bigger and deeper
  for (const p of G.props) if (p.kind === "pool") puddles.push([p.x * s, p.yb * s, p.w * s / 2, p.h * s / 2, true]);
  for (const [px0, py, rx, ry, deep] of puddles) {
    for (let y = Math.floor(py - ry) - 1; y <= Math.ceil(py + ry) + 1; y++) for (let x = Math.floor(px0 - rx) - 1; x <= Math.ceil(px0 + rx) + 1; x++) {
      if (x < 0 || y < hz || x >= w || y >= h) continue;
      const nx = (x + 0.5 - px0) / rx, ny = (y + 0.5 - py) / ry, dd = nx * nx + ny * ny + 0.15 * (pxNoise(x * 0.4, y * 0.6 + seed) - 0.5), i = y * w + x;
      if (dd > 1.25) continue;
      // a wet rim round it, lit on the near side; a deep pool has a dark bank on the far one
      if (dd > 1) { if (ny > 0) { kind[i] = 1; shade[i] += 0.18; } else if (deep) shade[i] -= 0.25; continue; }
      kind[i] = 4;
      // the far half mirrors the dark, the near half the light of the cave; one band of reflected light across it
      shade[i] = (deep ? 0.28 : 0.36) + 0.3 * clamp(ny + 0.3, 0, 1) + (Math.abs(ny + 0.15) < (deep ? 0.08 : 0.12) && Math.abs(nx) < 0.7 ? 0.3 : 0) - 0.2 * Math.abs(nx) ** 3;
    }
    for (const [gx, gy] of [[-0.35, -0.45], [-0.25, -0.45], deep ? [0.3, -0.25] : [-0.3, -0.55]]) { const x = Math.round(px0 + gx * rx), y = Math.round(py + gy * ry), i = y * w + x; if (x >= 0 && x < w && y >= hz && y < h && kind[i] === 4) kind[i] = 5; }
  }
  // the warm pools of the candles (and the glow of the props), falling off in three steps
  for (const l of lights) {
    for (let y = Math.max(hz, Math.floor(l.y - l.ry)); y <= Math.min(h - 1, Math.ceil(l.y + l.ry)); y++) for (let x = Math.max(0, Math.floor(l.x - l.rx)); x <= Math.min(w - 1, Math.ceil(l.x + l.rx)); x++) {
      const kk = 1 - Math.hypot((x + 0.5 - l.x) / l.rx, (y + 0.5 - l.y) / l.ry), i = y * w + x;
      if (kk <= 0 || kind[i] === 4 || kind[i] === 5) continue;
      // (three steps: a touch lighter, then lit every other pixel, then lit through)
      const step = kk > 0.7 ? 3 : kk > 0.35 ? 2 : 1;
      shade[i] += 0.05 * step;
      if (kind[i] !== 3 && step === 3) tint[i] = l.ramp;
    }
  }
  // contact shadows under the plinth and each prop, in two steps
  for (const [sx, sy, rx, ry] of shadows) {
    for (let y = Math.max(hz, Math.floor(sy - ry * 1.3)); y <= Math.min(h - 1, Math.ceil(sy + ry * 1.3)); y++) for (let x = Math.max(0, Math.floor(sx - rx * 1.3)); x <= Math.min(w - 1, Math.ceil(sx + rx * 1.3)); x++) {
      const dd = Math.hypot((x + 0.5 - sx) / rx, (y + 0.5 - sy) / ry), i = y * w + x;
      if (dd < 1) shade[i] -= 0.3; else if (dd < 1.3) shade[i] -= 0.13;
    }
  }
  for (let y = Math.max(0, hz); y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, v = shade[i], kd = kind[i];
    if (kd === 9) continue;
    set(x, y, kd === 5 ? [255, 255, 255] : kd === 4 ? pick(SR.water, v) : kd === 3 ? pick(mossR, v - 0.12) : pick(tint[i] || fl, v));
  }
  // pebbles: little rounded stones, lit on top, each with a dark foot; a few in the cave's own crystal
  const rock = (x, yb, rx, ry, ramp, mossy = 0) => {
    const cy = yb - ry;
    obj(x - rx - 1, cy - ry - 1, x + rx + 1, yb + 1, (px, py) => {
      const nx = (px + 0.5 - x) / rx, ny = (py + 0.5 - cy) / ry, dd = nx * nx + ny * ny;
      if (dd > 1 - 0.12 * pxNoise(px * 0.35 + x, py * 0.35)) return null;
      const z = Math.sqrt(Math.max(0, 1 - dd)), l = -0.45 * nx - 0.6 * ny + 0.65 * z;
      // moss sits on the top of it, following its curve, its edge ragged
      if (mossy && ny < -0.05 - mossy * 0.25 + 0.5 * (pxFbm(px * 0.35, py * 0.35) - 0.5) + 0.25 * nx * nx) return pick(mossR, 0.08 + 0.7 * l);
      return l > 0.95 ? ramp[ramp.length - 1] : pick(ramp, 0.1 + 0.75 * l);
    });
  };
  const peb = SR.stone.slice(0, 5), fleck = C.fleck ? [pxHex("#160c26"), pxHex(C.fleck), [255, 255, 255]] : peb;
  for (let n = 0; n < Math.round(w * span / (2600 * u * u)); n++) {
    const t = 0.12 + 0.82 * pxHash(n, seed + 60), y = hz + t * span, x = pxHash(n, seed + 61) * w, r = (1.6 + 3 * pxHash(n, seed + 62) ** 2) * u * (0.5 + t);
    if (y > G.quiet * s && Math.abs(x - cx) < w * 0.3) continue;
    if (Math.abs(x - cx) < P.frx * s * 1.05 && y < G.foot * s + r) continue;
    if (puddles.some(([a, b, rx, ry]) => Math.abs(x - a) < rx + r && Math.abs(y - b) < ry + r)) continue;
    if (G.props.some(p => x > p.box[0] * s - r && x < p.box[2] * s + r && y > p.box[1] * s && y < p.box[3] * s + r)) continue;
    if (r < 0.9) continue;
    rock(x, y, r, r * 0.72, pxHash(n, seed + 63) > 0.85 ? fleck : peb, C.moss > 0.5 && pxHash(n, seed + 64) > 0.5 ? 0.6 : 0);
  }

  // ---- the plinth and the props, back to front ----
  const things = [...G.props.filter(p => p.kind !== "pool").map(p => [p.yb, () => drawProp(p)]), [G.base, () => plinth()]];
  for (const p of G.props) if (p.kind === "pool") things.push([p.yb + 1, () => poolBank(p)]);
  things.sort((a, b) => a[0] - b[0]);

  const plinth = () => {
    const pcx = P.cx * s, ty = P.ty * s, rx = P.rx * s, ry = P.ry * s, ph = P.h * s, frx = P.frx * s, fry = ry * frx / rx, fh = P.fh * s, st = SR.stone;
    const warmAt = (x, y) => G.candles.some(c => Math.hypot((x - c.x * s) / (0.09 * G.e * s), (y - c.y * s) / (0.045 * G.e * s)) < 1 + 0.25 * ((x + y) & 1));
    const course = (x, y, dx, v, n, top) => {
      // one ring of blocks: dark joints, each block lit on its top and left edges, shaded on its bottom and right
      const ang = Math.asin(clamp(dx, -1, 1)), bw = 0.5, a = ang / bw + n * 0.5 + 0.25, col = Math.floor(a), fa = a - col;
      const bh = ph / 2, fv = v, onePxA = 1 / (bw * rx * Math.max(0.15, Math.cos(ang)));
      if (fv * bh < 1 && !top) return pick(st, 0.08);
      if (fa < onePxA * 0.9) return pick(st, 0.08);
      let l = 0.52 - 0.36 * dx + 0.1 * (pxHash(col, n + seed) - 0.5);
      if (fv * bh < 2.2) l += 0.16; else if ((1 - fv) * bh < 1.8) l -= 0.14;
      if (fa < onePxA * 2.4) l += 0.08; else if (1 - fa < onePxA * 2.4) l -= 0.1;
      if (pxHash(x, y + seed) > 0.985) l -= 0.18;
      // moss climbs from the foot, on the shady side and where the stone stays damp
      if (pxFbm(x * 0.14 + seed, y * 0.2) + (n ? fv * 0.35 : -0.1) + dx * 0.12 + C.moss * 0.2 > 0.98) return pick(mossR, l * 0.9);
      return pick(st, l * 0.9);
    };
    obj(pcx - frx - 1, ty - ry - 1, pcx + frx + 1, ty + ph + fh + fry + 1, (x, y) => {
      const X = x + 0.5, Y = y + 0.5, dx = (X - pcx) / rx, dt = ((X - pcx) / rx) ** 2 + ((Y - ty) / ry) ** 2;
      if (dt <= 1) {
        // the top slab: worn smooth, a bright worn edge at the front, the back edge in shade, a crack or two
        let l = 0.56 - 0.12 * dx;
        const r = Math.sqrt(dt);
        if (r > 0.88 && Y > ty) l = 0.76; else if (r > 0.9) l = 0.36;
        if (Math.abs(pxNoise(X * 0.09 + seed, Y * 0.25) - 0.5) < 0.012 && r < 0.85) l = 0.28;
        if (pxHash(x, y + seed) > 0.97) l -= 0.1;
        if (r > 0.82 && Y < ty && pxFbm(X * 0.2, Y * 0.3 + seed) + C.moss * 0.2 > 0.78) return pick(mossR, 0.4 + 0.3 * (1 - dx));
        return warmAt(X, Y) ? pick(SR.warm, l - 0.1) : pick(st, l * 0.92);
      }
      if (Math.abs(dx) <= 1) {
        const yt = ty + ry * Math.sqrt(1 - dx * dx);
        // a thin shadow under the slab's lip, then two courses of blocks
        if (Y > yt && Y <= yt + ph) { const v = (Y - yt) / ph; if (Y - yt < 1.2) return pick(st, 0.04); return course(x, y, dx, (v * 2) % 1, v < 0.5 ? 0 : 1, false); }
      }
      const fdx = (X - pcx) / frx;
      if (Math.abs(fdx) > 1) return null;
      const fyt = ty + ph + fry * Math.sqrt(1 - fdx * fdx);
      // the foot's ledge, where it steps out from the drum, catches the light
      if (Y <= fyt && Y > ty + ph - fry * Math.sqrt(1 - fdx * fdx)) return pick(st, 0.74 - 0.3 * fdx);
      if (Y > fyt && Y <= fyt + fh) { const fv = (Y - fyt) / fh; if (pxFbm(X * 0.16 + seed, Y * 0.3) + fv * 0.3 - fdx * 0.15 + C.moss * 0.25 > 0.9) return pick(mossR, 0.55 - 0.3 * fdx); return pick(st, 0.48 - 0.32 * fdx - fv * 0.18 + (fv * fh < 1.5 ? 0.12 : 0)); }
      return null;
    });
  };

  // a crystal: a six-sided column with a pointed tip, leaning by lean, its left faces lit and one bright ridge
  const prism = (x, yb, hgt, hw, lean, ramp) => {
    const sa = Math.sin(lean), ca = Math.cos(lean), tip = hw * 1.5, ex = Math.abs(sa) * hgt + hw;
    obj(x - ex - 1, yb - hgt - 1, x + ex + 1, yb + hw, (px, py) => {
      const rx = px + 0.5 - x, ry = yb - (py + 0.5), along = rx * sa + ry * ca, across = rx * ca - ry * sa;
      if (along < -0.5 || along > hgt) return null;
      const lim = along > hgt - tip ? hw * (hgt - along) / tip : hw;
      if (Math.abs(across) > lim + 0.3) return null;
      const f = across / hw;
      let v = f < -0.33 ? 0.7 : f > 0.33 ? 0.28 : 0.5;
      if (along > hgt - tip) v += 0.12;
      if (f > -0.42 && f < -0.25) v = 0.92;
      if (along < 1.5) v = 0.15;
      v += 0.08 * (pxHash(px >> 1, py >> 1) - 0.5);
      return pick(ramp, v);
    });
  };
  const drawProp = p => {
    const x = p.x * s, yb = p.yb * s, u = G.k * s * PROP_SCALE;
    if (p.kind === "cluster") {
      // a fist of amethyst points out of a stone heel
      rock(x, yb + u, 13 * u, 6 * u, SR.stone.slice(0, 4));
      for (const [ox, hh, hw, lean] of [[-9, 22, 4, -0.5], [9, 26, 4.5, 0.45], [4, 18, 3.5, 0.2], [0, 40, 6, 0.05], [-4, 14, 3, -0.25]]) prism(x + ox * u, yb - 2 * u, hh * u, hw * u, lean, SR.lilac);
    } else if (p.kind === "shards") {
      // shards of ice, thin and leaning every way, frost round their feet
      for (const [ox, hh, hw, lean] of [[-10, 26, 3, -0.55], [8, 32, 3.2, 0.5], [-2, 44, 4, -0.08], [4, 20, 2.6, 0.25], [13, 14, 2.2, 0.85]]) prism(x + ox * u, yb, hh * u, hw * u, lean, SR.ice);
      for (let n = 0; n < 9; n++) set(Math.round(x + (pxHash(n, seed + 70) - 0.5) * 34 * u), Math.round(yb + pxHash(n, seed + 71) * 4 * u), pxHex("#b8e6f5"));
    } else if (p.kind === "stubs") {
      // three candle stubs on a brass dish, burnt down and long gone out, wax run down their sides
      rock(x, yb + 1.5 * u, 15 * u, 3 * u, SR.brass);
      for (const [ox, hh, hw] of [[-7, 12, 3.5], [3, 18, 4], [10, 8, 3]]) {
        const sx = x + ox * u, top = yb - hh * u;
        obj(sx - hw * u, top - hw * u * 0.4, sx + hw * u, yb, (px, py) => {
          const nx = (px + 0.5 - sx) / (hw * u), dy = (py + 0.5 - top) / (hw * u * 0.4);
          if (Math.abs(nx) > 1) return null;
          if (nx * nx + dy * dy <= 1) return pick(SR.wax, 0.6 - 0.3 * nx);
          if (py + 0.5 < top) return null;
          // drips: a few columns run lower and lighter
          const drip = pxHash(Math.floor((px - sx) / Math.max(1, u)), Math.round(ox)) > 0.6 && py + 0.5 < top + hh * u * 0.5;
          return pick(SR.wax, 0.3 - 0.4 * nx + (drip ? 0.22 : 0) - 0.25 * (py + 0.5 - top) / (hh * u));
        });
        set(Math.round(sx), Math.round(top - hw * u * 0.4) - 1, SR.ink[0]);
      }
    } else if (p.kind === "stones") {
      // mossy stones: one big, one leaning on it, a little one in front
      rock(x - 6 * u, yb - 1 * u, 16 * u, 12 * u, SR.stone.slice(0, 5), 0.8);
      rock(x + 11 * u, yb, 10 * u, 8 * u, SR.stone.slice(0, 5), 0.6);
      rock(x + 2 * u, yb + 2 * u, 6 * u, 4 * u, SR.stone.slice(0, 5), 0.3);
    } else if (p.kind === "caps") {
      // glowcaps: pale stems under domed caps that glow, spotted
      for (const [ox, hh, cr] of [[-7, 22, 9], [7, 14, 7], [13, 8, 4.5], [-14, 7, 4]]) {
        const sx = x + ox * u, top = yb - hh * u, rx = cr * u, ry = cr * u * 0.62;
        obj(sx - rx, top - ry, sx + rx, yb, (px, py) => {
          const X = px + 0.5, Y = py + 0.5, nx = (X - sx) / rx, ny = (Y - top) / ry;
          if (nx * nx + ny * ny <= 1 && ny <= 0.3) {
            if (ny > 0.05) return pick(SR.glow, 0.15);
            if (pxHash(Math.floor(X / Math.max(1, 2 * u)), Math.floor(Y / Math.max(1, 2 * u)) + ox) > 0.88 && ny < -0.2) return pxHex("#efe6ff");
            return pick(SR.glow, 0.45 - 0.35 * nx - 0.4 * ny);
          }
          if (Y > top && Math.abs(X - sx) <= Math.max(0.8, cr * u * 0.24)) return pick(SR.stone, X < sx ? 0.86 : 0.66);
          return null;
        });
      }
    } else if (p.kind === "slabs") {
      // dark slabs of labradorite leaning together, a sheen of blue and gold caught across their faces
      for (const [ox, hw, hh, lean] of [[-6, 9, 46, -0.12], [8, 8, 34, 0.2]]) {
        const sx = x + ox * u, ww = hw * u, hgt = hh * u, sa = Math.sin(lean), ca = Math.cos(lean), ex = Math.abs(sa) * hgt + ww;
        obj(sx - ex - 1, yb - hgt - 1, sx + ex + 1, yb + 1, (px, py) => {
          const rx = px + 0.5 - sx, ry = yb - (py + 0.5), along = rx * sa + ry * ca, across = rx * ca - ry * sa;
          // a chipped top: one corner knocked off
          if (along < 0 || along > hgt || Math.abs(across) > ww || along > hgt - (across + ww) * 0.45) return null;
          const f = across / ww, b = (along - across * 1.6) / hgt;
          if (Math.abs(b - 0.55) < 0.05 + 0.02 * Math.sin(along * 0.4)) return pick(SR.sheen, clamp((f + 1) / 2, 0, 0.99));
          if (Math.abs(b - 0.43) < 0.015) return pick(SR.sheen, 0.1);
          let v = 0.5 - 0.25 * f + 0.08 * (pxFbm(px * 0.2, py * 0.2) - 0.5);
          if (f < -0.78) v = 0.92; else if (along > hgt - (across + ww) * 0.45 - 1.6) v = 0.8;
          return pick(SR.slab, v);
        });
      }
    } else if (p.kind === "lantern") {
      // an old iron lantern on the floor, its glass still warm: posts, a pointed cap, a ring to carry it by
      const lw = 7 * u, lh = 20 * u, yt = yb - 2 * u - lh;
      obj(x - lw - 1, yt - 10 * u, x + lw + 1, yb, (px, py) => {
        const X = px + 0.5 - x, Y = py + 0.5, ax = Math.abs(X);
        if (Y > yb - 2 * u) return ax <= lw + u ? pick(SR.iron, 0.6 - X / lw * 0.3) : null;
        if (Y > yt) {
          if (ax > lw) return null;
          if (ax > lw - Math.max(1, 1.4 * u)) return pick(SR.iron, X < 0 ? 0.75 : 0.35);
          if (Y < yt + Math.max(1, u)) return pick(SR.iron, 0.4);
          // the glass, warm, a bright stripe down its left, the flame in the middle
          const fy = yt + lh * 0.55;
          if (ax < 1.2 * u && Y > fy - 4 * u && Y < fy + 2 * u) return Y < fy - 2 * u ? pxHex("#fff0b5") : pxHex("#e0634f");
          if (X > -lw * 0.6 && X < -lw * 0.6 + Math.max(1, u)) return pxHex("#fff0b5");
          return pick(SR.candle, 0.75 - ax / lw * 0.45 - Math.abs(Y - fy) / lh * 0.6);
        }
        const cy = yt - Y;
        if (cy < 6 * u && ax <= lw * (1 - cy / (6 * u)) + u) return pick(SR.iron, 0.55 - X / lw * 0.3 + (cy < Math.max(1, u) ? 0.15 : 0));
        if (cy >= 6 * u && Math.abs(Math.hypot(X, cy - 8 * u) - 2 * u) < Math.max(0.7, 0.8 * u)) return pick(SR.iron, 0.5);
        return null;
      });
    }
  };
  const poolBank = p => {
    // stones round the still pool's far side
    const x = p.x * s, y = p.yb * s, rx = p.w * s / 2, ry = p.h * s / 2;
    for (let n = 0; n < 6; n++) { const a = Math.PI * (1.05 + 0.9 * n / 5), r = (2.5 + 2 * pxHash(n, seed + 80)) * u; rock(x + Math.cos(a) * rx * 1.05, y + Math.sin(a) * ry * 1.1 + r * 0.5, r, r * 0.7, SR.stone.slice(0, 5), C.moss > 0.5 ? 0.5 : 0); }
  };
  for (const [, fn] of things) fn();
  strays();
  nest();
  g.putImageData(img, 0, 0);
  return cv;
}

// ---------- drawing it ----------
const stageCache = new Map();
let stagePaints = 0; // (how many times a stage has been painted: the tests count them)
/** The stage for cave id at this screen size: painted once, then kept (a handful of sizes and caves at most). */
function stageArt(id, lip = false) {
  const key = `${id}|${W}|${H}|${PX}|${L.ew}|${L.floor}|${lip}`;
  if (!stageCache.has(key)) {
    if (stageCache.size > 12) stageCache.clear();
    stagePaints++;
    stageCache.set(key, paintStage(id, W, H, PX, stageGeom(id, W, H, L), lip));
  }
  return stageCache.get(key);
}
function drawStage() {
  const was = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(stageArt(currentTheme()), 0, 0, Math.ceil(W / PX) * PX, Math.ceil(H / PX) * PX);
  ctx.imageSmoothingEnabled = was;
}
/** The nest's front rim, over the bottom of the egg, so it sits in it. */
function drawStageLip() {
  const was = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(stageArt(currentTheme(), true), 0, 0, Math.ceil(W / PX) * PX, Math.ceil(H / PX) * PX);
  ctx.imageSmoothingEnabled = was;
}

// ---------- chips that stay ----------
let stageGeomKept = null;
/** This screen's stage, worked out once (the chips ask for it every frame). */
function stageNow() {
  const id = currentTheme(), key = `${id}|${W}|${H}|${L.ew}|${L.floor}|${L.ecx}`;
  if (!stageGeomKept || stageGeomKept.key !== key) stageGeomKept = { key, G: stageGeom(id, W, H, L) };
  return stageGeomKept.G;
}
/**
 * Where a chip falling at x comes down, for its depth (0..1, picked when it flew off): on the floor in front of the plinth,
 * or on the floor beside it, or (for the near half of those over the plinth, or when the floor in front is too near the
 * bottom) on the plinth's slab.
 */
function chipFloorAt(G, x, depth) {
  const P = G.plinth, dx = (x - G.cx) / P.rx, front = G.land[1] > G.land[0];
  if (Math.abs(dx) < 1 && (depth < 0.35 || !front)) { const half = P.ry * Math.sqrt(1 - dx * dx); return P.ty - half * 0.6 + half * 1.5 * (front ? depth / 0.35 : depth); }
  if (front && Math.abs(x - G.cx) < P.frx * 1.05) return lerp(G.land[0], G.land[1], depth);
  // beside the plinth the floor runs from a little behind its foot forward
  return lerp(Math.max(G.horizon + 0.04 * G.e, G.base - P.ry), front ? G.land[1] : G.quiet - 6, depth);
}
/** A chip has come to rest on the floor: it stays there for the rest of the level (as a fraction of the egg's size, so it
 *  stays put if the screen turns), up to REST_MAX of them. False if there's no room left. */
function restChip(e, c) {
  if (!e) return false;
  e.rest = e.rest || [];
  if (e.rest.length >= REST_MAX || c.x < 0 || c.x > W) return false;
  const r3 = v => Math.round(v * 1000) / 1000;
  e.rest.push([r3((c.x - L.ecx) / L.ew), r3((c.y - L.floor) / L.ew), Math.round(c.s / Math.max(1, L.k) * 10) / 10, c.color, Math.floor(Math.abs(c.rot * 4)) % 4]);
  return true;
}
/** The chips on the floor: a layer of their own, kept for this egg and this screen; each frame only the new ones are added. */
function drawRest() {
  const e = game.egg;
  if (!e || !e.rest || !e.rest.length) return;
  const key = `${W}|${H}|${PX}|${L.ew}`, w = Math.ceil(W / PX), h = Math.ceil(H / PX);
  let R = game.restLayer;
  if (!R || R.e !== e || R.key !== key) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    R = game.restLayer = { e, key, c, g: c.getContext("2d"), n: 0 };
  }
  const g = R.g;
  for (; R.n < e.rest.length; R.n++) {
    const [a, b, sz, col, shape] = e.rest[R.n], x = Math.round((L.ecx + a * L.ew) / PX), y = Math.round((L.floor + b * L.ew) / PX), n = clamp(Math.round(sz * Math.max(1, L.k) / PX), 2, 5);
    // a flake of shell lying flat: wider than tall, a dark foot under it, its top edge catching the light
    const fw = n + (shape & 1), fh = Math.max(1, Math.round(n * 0.6));
    g.fillStyle = "#0b0614"; g.fillRect(x - (fw >> 1) + 1, y + 1, fw, 1);
    g.fillStyle = col; g.fillRect(x - (fw >> 1), y - fh + 1, fw, fh);
    if (shape & 2) g.fillRect(x - (fw >> 1) + 1, y - fh, fw - 2, 1);
    g.fillStyle = "rgba(255,255,255,.4)"; g.fillRect(x - (fw >> 1), y - fh + 1, Math.max(1, fw - 2), 1);
  }
  const was = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(R.c, 0, 0, w * PX, h * PX);
  ctx.imageSmoothingEnabled = was;
}

if (typeof module === "object" && module.exports) module.exports = { stageGeom, paintStage, STAGE_CAVES, PROP_SIZE, REST_MAX, STAGE_QUIET };
