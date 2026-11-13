"use strict";
// Hatchstone · the world map: a valley bigger than the screen, painted in pixels, with every place and its keeper.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- the land: a height map with light from the north-west, then mountains, a river, roads, forests and places ----------

const WM_W = 400, WM_H = 360;
const WM_COL = Object.fromEntries(Object.entries({
  deep: "#101c3d", sea: "#173262", sea2: "#1f3d6b", shallow: "#2f68c8", foam: "#b8e6f5",
  sand0: "#a77b48", sand1: "#c8a070", sand2: "#e2c08d",
  g0: "#16301f", g1: "#1d3b2c", g2: "#24503a", g3: "#2f6446", g4: "#3d7a52", g5: "#57ad6a",
  r0: "#1c1533", r1: "#2a2148", r2: "#3b2f63", r3: "#4e3f7d", r4: "#6b5a9a", r5: "#8a78b8",
  n0: "#b9b3c0", n1: "#e4dfe8", n2: "#ffffff",
  d0: "#4a2e16", d1: "#6b4a2a", d2: "#8a6238", d3: "#a77b48",
  w0: "#2f68c8", w1: "#69b7d6", ink: "#0b0614",
  k0: "#1a1128", k1: "#26193c", k2: "#352454", k3: "#48316e", crack: "#b07af0",
  sn0: "#7d8cb4", sn1: "#aebcdc", sn2: "#d8e2f4", ice0: "#8fb6dc", ice1: "#c6def2",
}).map(([k, v]) => [k, pxHex(v)]));

// where the river runs, from the spring in the mountains down to the sea (art pixels)
const WM_RIVER = [[208, 52], [204, 80], [216, 108], [210, 132], [196, 152], [202, 186], [192, 214], [198, 244], [180, 276], [154, 298], [124, 322], [98, 346]];
/** The roads: the main one from the nest up to the grotto is wider; the others are lanes. */
const WM_ROADS = [["forge", "gloom", 0.9, 10], ["lab", "frost", 0.9, -16], ["nest", "grotto", 2.2, 14], ["nest", "lab", 1.8, -14], ["lab", "shop", 1.6, 12], ["grotto", "forge", 1.4, -12], ["forge", "garden", 1.3, 10], ["garden", "shop", 1.3, -8], ["shop", "trail", 1.4, -12], ["lab", "garden", 1.1, 18]];
/** Lands past the valley, not open yet: the Gloom's dark country in the west, snowfields in the east, an island, the aurora. */
const WM_MYSTERY = [
  { id: "gloom", at: [44, 132], hint: "Mossa won't say what sleeps in the dark past the forge. Only that it's waiting." },
  { id: "frost", at: [360, 150], hint: "Snow, and something glittering under it. A door of ice?" },
  { id: "isle", at: [334, 322], hint: "A light blinks far out at sea, every night, as if someone keeps it." },
  { id: "summit", at: [300, 34], hint: "Above the peaks the sky dances in green and pink. Somebody lives up there." },
];
const wmAt = id => (WORLD.find(w => w.id === id) || WM_MYSTERY.find(w => w.id === id)).at;
/** How far into the west (the Gloom's land) or the east (the snowfields) a point is, 0 to 1, with a ragged edge. */
const wmWest = (x, y) => pxSmooth(0, 1, (100 - x) / 34 + (pxFbm(x / 15 + 2, y / 15) - 0.5) * 0.9);
const wmEast = (x, y) => pxSmooth(0, 1, (x - 304) / 34 + (pxFbm(x / 15 + 5, y / 15) - 0.5) * 0.9) * pxSmooth(0, 1, (285 - y) / 30);

/** Points along a gentle curve from a to b (bent sideways by `bend` pixels), every pixel or so. */
function wmCurve(a, b, bend) {
  const [ax, ay] = a, [bx, by] = b, len = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / len, ny = (bx - ax) / len;
  const cx = (ax + bx) / 2 + nx * bend, cy = (ay + by) / 2 + ny * bend, n = Math.ceil(len * 1.4), out = [];
  for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by]); }
  return out;
}
/** Points along a polyline, every pixel or so. */
function wmLine(pts) {
  const out = [];
  for (let k = 0; k + 1 < pts.length; k++) { const [ax, ay] = pts[k], [bx, by] = pts[k + 1], n = Math.ceil(Math.hypot(bx - ax, by - ay)); for (let j = 0; j < n; j++) out.push([ax + (bx - ax) * j / n, ay + (by - ay) * j / n, k / (pts.length - 1)]); }
  return out;
}
/** A grid of distances to a set of points (only up to `reach` pixels away; beyond that it's Infinity). */
function wmDistance(points, reach) {
  const dist = new Float32Array(WM_W * WM_H).fill(Infinity);
  for (const [px, py] of points) for (let y = Math.max(0, Math.floor(py - reach)); y <= Math.min(WM_H - 1, Math.ceil(py + reach)); y++) for (let x = Math.max(0, Math.floor(px - reach)); x <= Math.min(WM_W - 1, Math.ceil(px + reach)); x++) {
    const d = Math.hypot(x - px, y - py), i = y * WM_W + x; if (d < dist[i]) dist[i] = d;
  }
  return dist;
}

let wmBase = null;
/** The whole map painted once: returns the canvas, plus where the water and shores are (for the sparkles and foam). */
function worldBase() {
  if (wmBase) return wmBase;
  const W = WM_W, H = WM_H, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"), im = g.createImageData(W, H), d = im.data, C = WM_COL;
  const put = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H || !col) return; const i = (y * W + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
  // the height of the land: high in the north, falling to a sea in the south-west, with a hill for the lab
  const lab = wmAt("lab"), elev = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = pxFbm(x / 26, y / 26), north = Math.pow(1 - y / H, 1.6);
    const nz = (pxFbm(x / 18 + 9, y / 18) - 0.5) * 0.7, sea = Math.max(pxSmooth(0, 1, (y - 270) / 60 + (170 - x) / 400 + nz), pxSmooth(0, 1, (y - 300) / 44 + (x - 250) / 260 + nz * 0.8));
    const hill = 0.14 * Math.max(0, 1 - Math.hypot(x - lab[0], (y - lab[1]) * 1.3) / 34);
    const isle = 0.42 * Math.max(0, 1 - Math.hypot(x - 334, (y - 322) * 1.4) / 18);
    elev[y * W + x] = 0.22 + north * 0.7 + (n - 0.5) * 0.3 + hill - sea * 0.62 + isle;
  }
  const h = (x, y) => elev[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)];
  const river = wmLine(WM_RIVER), riverD = wmDistance(river, 7);
  const roads = WM_ROADS.map(([a, b, wid, bend]) => ({ pts: wmCurve(wmAt(a), wmAt(b), bend), wid }));
  const roadD = wmDistance(roads.flatMap(r => r.pts), 6);
  const water = [], shore = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, e = elev[i], shade = (h(x - 1, y - 1) - h(x + 1, y + 1)) * 9, n = pxFbm(x / 9, y / 9);
    let col;
    if (e < 0.1) col = pxPick([C.deep, C.sea, C.sea2], e / 0.1 + (n - 0.5) * 0.3, x, y);
    else if (e < 0.15) col = pxPick([C.sea2, C.shallow], (e - 0.1) / 0.05, x, y);
    else if (e < 0.185) col = pxPick([C.sand0, C.sand1, C.sand2], 0.5 + shade, x, y);
    else if (e < 0.62) col = pxPick([C.g0, C.g1, C.g2, C.g3, C.g4, C.g5], 0.42 + shade * 1.4 + (n - 0.5) * 0.45 + (e - 0.4) * 0.4, x, y);
    else if (e < 0.8) col = pxPick([C.r0, C.r1, C.r2, C.r3, C.r4], 0.45 + shade * 1.6 + (n - 0.5) * 0.3, x, y);
    else col = pxPick([C.r4, C.r5, C.n0, C.n1], (e - 0.8) * 3 + shade * 1.5, x, y);
    // the Gloom's country: dark ground split by violet cracks; the east: snow, and ice where the sea was
    const west = wmWest(x, y), east = wmEast(x, y);
    if (west > 0.5 && e >= 0.15 && e < 0.8) { const f = pxFbm(x / 6 + 1, y / 6); col = Math.abs(f - 0.5) < 0.012 ? C.crack : pxPick([C.k0, C.k1, C.k2, C.k3], 0.4 + shade * 1.4 + (n - 0.5) * 0.4, x, y); }
    if (east > 0.5) col = e < 0.15 ? pxPick([C.ice0, C.ice1], 0.5 + (n - 0.5) * 0.8, x, y) : e < 0.8 ? pxPick([C.sn0, C.sn1, C.sn2, C.n2], 0.5 + shade * 1.6 + (n - 0.5) * 0.4, x, y) : col;
    if (e < 0.15 && east <= 0.5) water.push(i);
    else if (e < 0.185 && (h(x + 1, y) < 0.15 || h(x - 1, y) < 0.15 || h(x, y + 1) < 0.15 || h(x, y - 1) < 0.15)) shore.push(i);
    // the river and its darker banks
    const rd = riverD[i], rw = 1.2 + (river.length ? 2.4 * clamp(y / H, 0, 1) : 0);
    if (e >= 0.15 && rd < rw + 1.2) col = rd < rw ? pxPick([C.w0, C.w1], 0.35 + (n - 0.5) * 0.6, x, y) : C.g1;
    if (e >= 0.15 && rd < rw) water.push(i);
    put(x, y, col);
  }
  // roads: packed dirt with a lighter middle and a few stones, planks where they cross the river
  for (const r of roads) for (const [px, py] of r.pts) {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = Math.round(px + dx), y = Math.round(py + dy), dd = Math.hypot(dx, dy);
      if (dd > r.wid + 0.6 || x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x, onRiver = riverD[i] < 1.2 + 2.4 * y / H + 0.5;
      put(x, y, onRiver ? ((x + y) % 3 ? C.d3 : C.d1) : dd > r.wid - 0.4 ? C.d1 : pxHash(x, y) > 0.9 ? C.n0 : pxPick([C.d2, C.d3], pxHash(y, x), x, y));
    }
  }
  g.putImageData(im, 0, 0);

  // things that stand up out of the land, drawn back to front so nearer ones overlap farther ones
  const stand = [];
  // mountains along the north, a jagged ridge of peaks with snow on top (the grotto's cliff is left clear)
  const gr = wmAt("grotto");
  for (let k = 0; k < 36; k++) {
    const x = 6 + k * 11 + (pxHash(k, 1) - 0.5) * 8, base = 46 + pxHash(k, 2) * 40 - (Math.abs(x - 200) < 30 ? 8 : 0), size = 20 + pxHash(k, 3) * 20;
    if (Math.abs(x - gr[0]) < 24 && base > gr[1] - 34) continue;
    const ne = wmAt("nest"); if (Math.abs(x - ne[0]) < 24 && base > ne[1] - 34) continue;
    stand.push({ y: base, draw: () => wmPeak(g, x, base, size, size * (0.9 + pxHash(k, 4) * 0.5)) });
  }
  // ridges of dark rock along the valley's two edges
  for (let k = 0; k < 26; k++) for (const [x0, side] of [[100, -1], [304, 1]]) {
    const y = 96 + k * 9 + pxHash(k, side + 5) * 6, x = x0 + side * (pxHash(k, side + 9) * 10) + Math.sin(y / 23) * 6, size = 10 + pxHash(k, side + 13) * 10;
    if (WORLD.some(w => Math.hypot(w.at[0] - x, w.at[1] - y) < 26) || elev[Math.round(y) * W + Math.round(x)] < 0.17) continue;
    stand.push({ y, draw: () => wmPeak(g, x, y, size, size * 0.9) });
  }
  // standing stones: a ring of old rocks here and there, from before anyone remembers
  for (const [sx, sy] of [[212, 200], [150, 112], [252, 290]]) stand.push({ y: sy, draw: () => { for (let k = 0; k < 7; k++) { const an = k / 7 * TAU, x = Math.round(sx + Math.cos(an) * 7), y = Math.round(sy + Math.sin(an) * 3.5); g.fillStyle = "#8a8494"; g.fillRect(x, y - 4, 2, 4); g.fillStyle = "#5d5666"; g.fillRect(x + 1, y - 4, 1, 4); g.fillStyle = "rgba(5,0,20,.4)"; g.fillRect(x, y, 3, 1); } } });
  // forests: clumps of pines and round trees where the land is green and nothing else stands
  const places = [...WORLD.map(w => w.at), ...WM_MYSTERY.map(w => w.at)];
  for (let gy = 70; gy < H; gy += 5) for (let gx = 2; gx < W; gx += 6) {
    const x = gx + (pxHash(gx, gy) - 0.5) * 5, y = gy + (pxHash(gy, gx) - 0.5) * 4, i = Math.round(y) * W + Math.round(x), e = elev[i];
    if (!(e > 0.2 && e < 0.6) || pxFbm(x / 34 + 3, y / 34 + 7) < 0.5 || riverD[i] < 6 || roadD[i] < 5 || places.some(([px, py]) => Math.hypot(x - px, (y - py) * 1.2) < 26)) continue;
    const pine = pxFbm(x / 20, y / 20 + 4) > 0.5, land = wmWest(x, y) > 0.5 ? "dead" : wmEast(x, y) > 0.5 ? "snow" : "";
    stand.push({ y, draw: () => wmTree(g, x, y, pine || land === "snow", pxHash(x | 0, y | 0), land) });
  }
  // the far-off secrets, half seen
  for (const w of WM_MYSTERY) stand.push({ y: w.at[1], draw: () => g.drawImage(wmMysteryArt(w.id), Math.round(w.at[0] - 20), Math.round(w.at[1] - 40)) });
  // the places themselves
  for (const w of WORLD) stand.push({ y: w.at[1], draw: () => g.drawImage(wmPlaceArt(w.id), Math.round(w.at[0] - 20), Math.round(w.at[1] - 32)) });
  stand.sort((p, q) => p.y - q.y).forEach(s => s.draw());

  // tiny flowers and stones scattered over the meadows
  for (let k = 0; k < 260; k++) {
    const x = Math.floor(pxHash(k, 21) * W), y = 90 + Math.floor(pxHash(k, 22) * (H - 90)), e = elev[y * W + x];
    if (e < 0.2 || e > 0.55 || riverD[y * W + x] < 4 || roadD[y * W + x] < 3) continue;
    const pix = g.getImageData(x, y, 1, 1).data; if (pix[1] < pix[0]) continue;
    g.fillStyle = ["#e88bb1", "#fff0b5", "#d2bfff", "#ffffff"][k % 4]; g.fillRect(x, y, 1, 1);
  }
  return wmBase = { c, water, shore };
}
/** One mountain: a lit west face, a shaded east face, a ridge line and a ragged cap of snow. */
function wmPeak(g, x, base, w, hgt) {
  const C = WM_COL, top = base - hgt, img = g.getImageData(Math.floor(x - w / 2 - 1), Math.floor(top - 1), Math.ceil(w + 3), Math.ceil(hgt + 3)), d = img.data, ox = Math.floor(x - w / 2 - 1), oy = Math.floor(top - 1);
  const put = (px, py, col) => { const ix = Math.round(px) - ox, iy = Math.round(py) - oy; if (ix < 0 || iy < 0 || ix >= img.width || iy >= img.height) return; const i = (iy * img.width + ix) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
  const skew = (pxHash(x | 0, base | 0) - 0.5) * w * 0.3, apex = x + skew;
  for (let py = Math.ceil(top); py <= base; py++) {
    const f = (py - top) / hgt, l = apex - (apex - (x - w / 2)) * f, r = apex + ((x + w / 2) - apex) * f, snowLine = 0.28 + pxHash(py, x | 0) * 0.08;
    for (let px = Math.floor(l); px <= Math.ceil(r); px++) {
      const west = px < apex - (py - top) * 0.15, edge = px <= l + 0.6 || px >= r - 0.6;
      let col = edge ? C.r0 : west ? pxPick([C.r3, C.r4, C.r5], 0.6 - f * 0.5, px, py) : pxPick([C.r1, C.r2], 0.6 - f * 0.4, px, py);
      if (f < snowLine && !edge) col = west ? (f < snowLine - 0.06 ? C.n2 : C.n1) : C.n0;
      put(px, py, col);
    }
  }
  g.putImageData(img, ox, oy);
}
/** One tree with its shadow to the south-east: a pine of stacked tiers, or a round broadleaf. */
function wmTree(g, x, y, pine, r, land = "") {
  x = Math.round(x); y = Math.round(y);
  const C = WM_COL, px = (a, b, col) => { g.fillStyle = `rgb(${col})`; g.fillRect(a, b, 1, 1); };
  g.fillStyle = "rgba(5,10,20,.45)"; g.fillRect(x - 1, y, 5, 1); g.fillRect(x, y + 1, 4, 1);
  if (land === "dead") {
    // a dead tree: a bare grey trunk with crooked branches
    const tall = 6 + Math.round(r * 5);
    for (let k = 0; k < tall; k++) px(x, y - k, C.r4);
    for (const [k, side] of [[0.5, -1], [0.7, 1], [0.85, -1]]) { const by = y - Math.round(tall * k); for (let j = 1; j <= 3; j++) px(x + side * j, by - Math.floor(j / 2), C.r5); }
    return;
  }
  if (pine) {
    const tall = 7 + Math.round(r * 4);
    px(x, y, C.d1); px(x, y - 1, C.d1);
    for (let k = 0; k < tall; k++) { const half = Math.round((tall - k) * 0.45 * (1 - (k % 3) * 0.18)); for (let j = -half; j <= half; j++) px(x + j, y - 2 - k, j < 0 ? C.g4 : j === 0 ? C.g3 : C.g2); }
    px(x, y - tall - 2, C.g4);
    for (let k = 0; k < tall; k += 2) px(x - Math.round((tall - k) * 0.45), y - 2 - k, C.g1);
    // snow on the boughs
    if (land === "snow") for (let k = 0; k < tall; k += 3) { const half = Math.round((tall - k) * 0.45); for (let j = -half; j <= 0; j++) px(x + j, y - 2 - k - 1, C.n2); }
  } else {
    const rad = 3 + Math.round(r * 2);
    px(x, y, C.d1); px(x, y - 1, C.d1);
    for (let b = -rad; b <= rad; b++) for (let a = -rad; a <= rad; a++) {
      if (a * a + b * b > rad * rad + 1) continue;
      const lit = -a * 0.6 - b * 0.8;
      px(x + a, y - rad - 1 + b, a * a + b * b > (rad - 1) * (rad - 1) + 1 ? C.g1 : lit > rad * 0.5 ? C.g5 : lit > -rad * 0.3 ? C.g4 : C.g2);
    }
  }
}
/** Each place as a little building (40×36 art pixels, standing on its spot at the bottom middle), in the room's own iso style. */
const wmPlaceCache = {};
function wmPlaceArt(id) {
  if (wmPlaceCache[id]) return wmPlaceCache[id];
  return wmPlaceCache[id] = isoArt(40, 36, T => {
    const cx = 20, cy = 32;
    if (id === "nest") {
      // a home cut into the mountainside: a round wooden door, lit windows, a little balcony and a chimney
      T.box(cx + 1, cy - 20, 9, 7, 18, IC.s1, IC.s2, IC.s3);
      T.ball(cx + 2, cy - 22, 9, IC.s0, IC.s1, IC.s2, 5);
      T.disc(cx - 5, cy - 6, 3.5, IC.w3, 4.5); T.disc(cx - 5, cy - 6, 2.6, IC.w2, 3.6); T.px(cx - 4, cy - 6, IC.y1);
      T.disc(cx - 10, cy - 12, 1.6, IC.y0, 2); T.disc(cx + 1, cy - 9, 1.6, IC.y1, 2); T.disc(cx + 6, cy - 14, 1.6, IC.y0, 2);
      for (let k = 0; k < 8; k++) T.px(cx - 12 + k * 2, cy - 15 + k, IC.w1);
      for (let k = 0; k < 8; k += 2) T.line(cx - 12 + k * 2, cy - 15 + k, cx - 12 + k * 2, cy - 12 + k, IC.w2);
      T.box(cx + 7, cy - 30, 1.5, 1.5, 6, IC.s2, IC.s3, IC.s4);
      for (let k = 0; k < 6; k++) T.px(cx - 4 + k * 3, cy - 27 + (k % 2), IC.g1);
    } else if (id === "grotto") {
      // a cliff with a dark arch, crystals glowing at its mouth
      T.box(cx, cy - 18, 9, 7, 16, IC.s2, IC.s3, IC.s4);
      T.poly([[cx - 9, cy - 2], [cx - 3, cy + 1], [cx - 3, cy - 9], [cx - 6, cy - 12], [cx - 9, cy - 9]], IC.ink);
      T.glow(cx - 6, cy - 5, 9, IC.l1, 0.55);
      for (const [dx, hh, c] of [[-11, 6, IC.l1], [-2, 5, IC.l2], [-8, 3, IC.l0]]) for (let k = 0; k < hh; k++) T.px(cx + dx, cy - 1 - k, c);
    } else if (id === "forge") {
      // a timber hut with a thatched roof, a stone chimney, the forge glowing through the door, an anvil outside
      const q = T.box(cx, cy - 12, 7, 6, 9, IC.w1, IC.w2, IC.w3);
      for (let k = 0; k < 4; k++) T.line(q.Bv[0] + k * 3.5, q.Bv[1] + k * 1.75, q.Bv[0] + k * 3.5, q.Bv[1] + k * 1.75 - 9, IC.w3);
      T.poly([[q.top[0] - 14, q.top[1] + 7], [q.top[0] + 1, q.top[1] - 6], [q.top[0] + 17, q.top[1] + 2], [q.top[0] + 2, q.top[1] + 15]], (x, y) => (x + y) % 4 === 0 ? IC.w0 : IC.y1);
      T.box(cx + 7, cy - 26, 2, 2, 12, IC.s1, IC.s2, IC.s3);
      T.poly([[cx - 8, cy - 5], [cx - 4, cy - 3], [cx - 4, cy - 9], [cx - 8, cy - 11]], IC.r1); T.px(cx - 6, cy - 7, IC.y0); T.px(cx - 5, cy - 6, IC.y0);
      T.glow(cx - 6, cy - 5, 9, IC.y1, 0.45);
      T.box(cx + 9, cy - 2, 2, 1, 2, IC.s2, IC.s3, IC.s4); T.box(cx + 8, cy - 4, 3, 1, 1, IC.s1, IC.s2, IC.s3);
    } else if (id === "lab") {
      // a round tower with a dome and a telescope poking out
      T.cyl(cx, cy - 3, 7, 14, IC.l1, IC.l2, IC.l4);
      T.ball(cx, cy - 18, 7, IC.b0, IC.b1, IC.b2, 5);
      T.line(cx + 2, cy - 21, cx + 9, cy - 27, IC.y1); T.line(cx + 3, cy - 21, cx + 10, cy - 27, IC.w2);
      T.disc(cx - 3, cy - 9, 1.5, IC.y0, 2); T.disc(cx + 3, cy - 6, 1.5, IC.y1, 2);
    } else if (id === "garden") {
      // fenced beds in rows, a little red gazebo
      T.box(cx - 4, cy - 10, 8, 5, 1, IC.w3, IC.w2, IC.w3);
      for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) T.px(cx - 6 + k * 4 - j * 2, cy - 9 + k * 2 + j, [IC.g0, IC.p1, IC.y0, IC.g1][(k + j) % 4]);
      for (let k = 0; k < 9; k++) { T.px(cx - 14 + k * 2, cy - 7 + k, IC.w1); T.px(cx - 14 + k * 2, cy - 8 + k, IC.w1); }
      T.box(cx + 9, cy - 12, 3, 3, 5, IC.white, IC.w1, IC.w2);
      T.poly([[cx + 3, cy - 13], [cx + 9, cy - 20], [cx + 15, cy - 13], [cx + 9, cy - 10]], IC.r1);
    } else if (id === "shop") {
      // a cottage with a striped awning and a sign
      const q = T.box(cx, cy - 14, 8, 6, 10, IC.w0, IC.w1, IC.w2);
      T.poly([[q.top[0] - 14, q.top[1] + 6], [q.top[0], q.top[1] - 5], [q.top[0] + 18, q.top[1] + 4], [q.top[0] + 3, q.top[1] + 15]], IC.r2);
      for (let k = 0; k < 6; k++) T.line(cx - 12 + k * 2, cy - 7 + k, cx - 12 + k * 2, cy - 5 + k, k % 2 ? IC.white : IC.r1);
      T.disc(cx + 6, cy - 7, 1.5, IC.y0, 2);
    } else if (id === "trail") {
      // two tents and a campfire at the forest's edge
      T.poly([[cx - 14, cy - 2], [cx - 7, cy - 13], [cx, cy - 2]], IC.y1); T.poly([[cx - 7, cy - 13], [cx, cy - 2], [cx + 2, cy - 4], [cx - 5, cy - 14]], IC.w1); T.px(cx - 7, cy - 4, IC.ink2); T.px(cx - 7, cy - 5, IC.ink2);
      T.poly([[cx + 2, cy - 6], [cx + 8, cy - 15], [cx + 14, cy - 6]], IC.g1); T.poly([[cx + 8, cy - 15], [cx + 14, cy - 6], [cx + 15, cy - 8], [cx + 9, cy - 16]], IC.g2);
      T.glow(cx - 2, cy + 1, 7, IC.y1, 0.5); T.px(cx - 2, cy, IC.y0); T.px(cx - 2, cy - 1, IC.r1); T.px(cx - 1, cy, IC.r1);
    }
  });
}

/** The secrets past the valley: a dark tower, a spire of ice, a lighthouse on its rock, and a peak lost in cloud. */
function wmMysteryArt(id) {
  if (wmPlaceCache["m:" + id]) return wmPlaceCache["m:" + id];
  return wmPlaceCache["m:" + id] = isoArt(40, 44, T => {
    const cx = 20, cy = 40;
    if (id === "gloom") {
      // a crooked black tower with one violet window
      T.poly([[cx - 6, cy], [cx + 6, cy], [cx + 4, cy - 26], [cx + 7, cy - 30], [cx + 1, cy - 40], [cx - 4, cy - 30], [cx - 3, cy - 26]], (x, y) => x < cx - 2 ? IC.ink2 : IC.ink);
      T.px(cx, cy - 24, IC.l0); T.px(cx, cy - 23, IC.l1); T.px(cx + 1, cy - 23, IC.l1); T.glow(cx, cy - 23, 10, IC.l2, 0.6);
      T.line(cx + 1, cy - 40, cx + 3, cy - 33, IC.s3); T.line(cx - 4, cy - 30, cx + 7, cy - 30, IC.s4);
      for (const dx of [-11, 10]) { T.line(cx + dx, cy, cx + dx + 1, cy - 10, IC.s4); T.line(cx + dx + 1, cy - 7, cx + dx + 4, cy - 10, IC.s4); }
    } else if (id === "frost") {
      // a spire of ice with a dark doorway at its foot
      T.poly([[cx - 7, cy], [cx, cy - 36], [cx + 7, cy]], (x) => x < cx ? IC.white : IC.b0);
      T.poly([[cx - 12, cy], [cx - 8, cy - 18], [cx - 4, cy]], IC.b0); T.poly([[cx + 5, cy], [cx + 10, cy - 14], [cx + 13, cy]], IC.b1);
      T.poly([[cx - 2, cy], [cx - 2, cy - 5], [cx, cy - 7], [cx + 2, cy - 5], [cx + 2, cy]], IC.b3);
      T.glow(cx, cy - 20, 10, IC.b0, 0.3);
    } else if (id === "isle") {
      // a lighthouse on a rock
      T.ball(cx, cy - 2, 11, IC.s1, IC.s2, IC.s3, 4);
      T.poly([[cx - 3, cy - 4], [cx + 3, cy - 4], [cx + 2, cy - 24], [cx - 2, cy - 24]], (x, y) => (Math.floor(y / 4) % 2) ? IC.white : IC.r1);
      T.poly([[cx - 3, cy - 24], [cx + 3, cy - 24], [cx, cy - 29]], IC.r2); T.px(cx, cy - 26, IC.y0);
    }
  });
}
// a pre-painted veil of darkness over the Gloom's land and a bank of fog over the snowfields (drawn shifting each frame)
let wmVeils = null;
function worldVeils() {
  if (wmVeils) return wmVeils;
  const make = f => { const c = document.createElement("canvas"); c.width = WM_W; c.height = WM_H; const g = c.getContext("2d"), im = g.createImageData(WM_W, WM_H), d = im.data;
    for (let y = 0; y < WM_H; y++) for (let x = 0; x < WM_W; x++) { const col = f(x, y); if (!col) continue; const i = (y * WM_W + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = col[3]; }
    g.putImageData(im, 0, 0); return c; };
  return wmVeils = {
    // tendrils of dark, thicker towards the west edge; thin enough to make out the tower and the dead trees
    dark: make((x, y) => { const w = wmWest(x, y) * 0.75 - 0.1 + (pxFbm(x / 9 + 4, y / 7) - 0.5) * 0.9 + pxSmooth(0, 1, (30 - x) / 30) * 0.4; return w > 0 && PX_BAYER[(y & 3) * 4 + (x & 3)] < w ? [10, 4, 20, 210] : null; }),
    fog: make((x, y) => { const e = wmEast(x, y) * 0.7 - 0.2 + (pxFbm(x / 13 + 3, y / 13) - 0.5) * 0.8; return e > 0 && PX_BAYER[(y & 3) * 4 + (x & 3)] < e ? [228, 234, 246, 190] : null; }),
    // night: the edges of the map sink into dark
    night: make((x, y) => { const v = Math.max(Math.abs(x / WM_W - 0.5) * 2, Math.abs(y / WM_H - 0.5) * 2) - 0.72; return v > 0 && PX_BAYER[(y & 3) * 4 + (x & 3)] < v * 2.4 ? [6, 3, 14, 150] : null; }),
    cloud: make((x, y) => { const c = pxSmooth(0, 1, (46 - y) / 22 + (pxFbm(x / 10, y / 8) - 0.5) * 1.2) * pxSmooth(0, 1, (x - 250) / 30); return c > 0 && PX_BAYER[(y & 3) * 4 + (x & 3)] < c ? [236, 230, 255, 220] : null; }),
  };
}

// ---------- the living map: water that sparkles, smoke from the chimneys, fireflies, clouds drifting over ----------

const wm = { raf: 0, t0: 0, smoke: [], flies: [], cv: null, K: 3 };
const WM_CHIMNEYS = { forge: [8, -26], nest: [9, -27], trail: [-2, -2] };
function worldFrame(now) {
  const base = worldBase(), cv = wm.cv, g = cv.getContext("2d"), C = WM_COL, t = now / 1000;
  g.imageSmoothingEnabled = false;
  g.drawImage(base.c, 0, 0);
  const put = (x, y, col, a = 1) => { g.globalAlpha = a; g.fillStyle = `rgb(${col})`; g.fillRect(Math.round(x), Math.round(y), 1, 1); g.globalAlpha = 1; };
  // glints on the water, foam along the shore
  for (let k = 0; k < base.water.length; k += 7) { const i = base.water[k], ph = pxHash(i, 7) * 40; if (Math.sin(t * 2 + ph) > 0.96) put(i % WM_W, (i / WM_W) | 0, C.foam); }
  for (let k = 0; k < base.shore.length; k++) { const i = base.shore[k]; if (((i + Math.floor(t * 3)) % 5) === 0) put(i % WM_W, (i / WM_W) | 0, C.foam, 0.8); }
  // smoke from the chimneys and the campfire
  if (Math.random() < 0.25) for (const [id, [dx, dy]] of Object.entries(WM_CHIMNEYS)) if (placeOk(id)) { const [x, y] = wmAt(id); wm.smoke.push({ x: x - 20 + 20 + dx, y: y + dy, t: 0, s: id === "trail" ? 0.7 : 1 }); }
  wm.smoke = wm.smoke.filter(p => (p.t += 1 / 60) < 3);
  for (const p of wm.smoke) { const k = p.t / 3; g.globalAlpha = (1 - k) * 0.55 * p.s; g.fillStyle = "#c9b8ff"; const r = 1 + k * 2.5; g.fillRect(Math.round(p.x + Math.sin(p.t * 2 + p.y) * 2 + k * 6), Math.round(p.y - p.t * 7), Math.ceil(r), Math.ceil(r)); }
  g.globalAlpha = 1;
  // fireflies over the meadows
  if (!wm.flies.length) for (let k = 0; k < 26; k++) wm.flies.push({ x: pxHash(k, 31) * WM_W, y: 100 + pxHash(k, 32) * (WM_H - 120), ph: pxHash(k, 33) * 9 });
  for (const f of wm.flies) { const x = f.x + Math.sin(t * 0.7 + f.ph) * 6, y = f.y + Math.cos(t * 0.5 + f.ph * 1.3) * 4; put(x, y, C.n2, 0.4 + 0.6 * Math.max(0, Math.sin(t * 3 + f.ph))); }
  // the shadows of three slow clouds
  for (let k = 0; k < 3; k++) {
    const cx = ((t * (3 + k) + k * 97) % (WM_W + 80)) - 40, cy = 60 + k * 110 + Math.sin(t * 0.1 + k) * 10;
    for (let y = -10; y <= 10; y++) for (let x = -28; x <= 28; x++) if ((x / 28) ** 2 + (y / 10) ** 2 < 1 && PX_BAYER[((y + 40) & 3) * 4 + ((x + 40) & 3)] < 0.35) put(cx + x, cy + y, C.ink, 0.5);
  }
  // the aurora over the north-east, the veils, two eyes that open in the dark now and then, the lighthouse blinking
  for (let x = 220; x < WM_W; x++) { const y = 10 + Math.sin(x / 17 + t * 0.6) * 6 + Math.sin(x / 7 + t) * 2; for (let k = 0; k < 6; k++) put(x, y + k, k < 3 ? WM_COL.foam : [232, 139, 177], 0.18 + 0.12 * Math.sin(t + x / 30)); }
  const veil = worldVeils();
  g.drawImage(veil.cloud, Math.round(Math.sin(t * 0.2) * 3), 0);
  g.globalAlpha = 0.92 + Math.sin(t * 0.7) * 0.06; g.drawImage(veil.dark, Math.round(Math.sin(t * 0.35) * 2), Math.round(Math.cos(t * 0.27) * 2)); g.globalAlpha = 1;
  g.drawImage(veil.fog, Math.round(Math.sin(t * 0.15) * 4), 0);
  g.drawImage(veil.night, 0, 0);
  // a festival's snow (or petals, or leaves) falls only on the high, cold ground: the peaks and the snowfields
  const fall = eventNow()?.fall;
  if (fall && !fall.still) for (let k = 0; k < 70; k++) { const x = (pxHash(k, 41) * WM_W + t * 6 * (k % 3 - 1)) % WM_W, y = (pxHash(k, 42) * WM_H + t * (8 + k % 7) * (fall.dir || 0.3)) % WM_H; if (y < 95 || wmEast(x, y) > 0.4) put(x, y, pxHex(fall.c[k % fall.c.length]), 0.85); }
  for (let k = 0; k < 3; k++) { const ph = t * 0.4 + k * 2.1; if (Math.sin(ph * 1.7) > 0.93) { const x = 14 + pxHash(k, Math.floor(ph / 3.7)) * 60, y = 100 + pxHash(Math.floor(ph / 3.7), k) * 200; put(x, y, [220, 90, 140]); put(x + 3, y, [220, 90, 140]); } }
  if (Math.sin(t * 2.2) > 0.2) { put(334, 296, WM_COL.n2); g.globalAlpha = 0.35; g.fillStyle = "#fff0b5"; g.fillRect(330, 293, 9, 7); g.globalAlpha = 1; }
  // mist over the places you haven't found yet
  for (const w of WORLD) if (!placeOk(w.id)) {
    const [x, y] = w.at;
    for (let b = -24; b <= 10; b++) for (let a = -26; a <= 26; a++) {
      const f = (a / 26) ** 2 + ((b + 7) / 17) ** 2 + (pxFbm((x + a) / 7 + t * 0.15, (y + b) / 7) - 0.5) * 0.7;
      if (f < 1) put(x + a, y + b, f < 0.7 ? WM_COL.n1 : WM_COL.n0, f < 0.7 ? 0.92 : 0.6);
    }
  }
  wm.raf = requestAnimationFrame(worldFrame);
}

/** Where you are right now, as a place on the map. */
function wherePlace() {
  if (game.scene === "map") return "grotto";
  const k = save.rooms[save.room]?.kind;
  return { yard: "garden", lab: "lab", shop: "shop", forge: "forge", camp: "trail", grotto: "grotto" }[k] || "nest";
}
const WM_KEEPERS = { shop: "tansy", forge: "ember", trail: "pip", lab: "ollo", garden: "fennel" };
/** How big the map is drawn: zoom 0 fits it all on screen, each step in is half as big again. */
const WM_ZOOMS = [1, 1.8, 2.8, 4];
function wmFit() {
  const sc = $("worldScroll"), top = parseFloat(getComputedStyle($("worldMap")).marginTop) || 0, bottom = parseFloat(getComputedStyle($("worldMap")).marginBottom) || 0;
  return Math.max(0.5, Math.min((sc.clientWidth - 16) / WM_W, (sc.clientHeight - top - bottom) / WM_H));
}
function layoutWorld(zoom, keep) {
  const sc = $("worldScroll"), map = $("worldMap"), old = wm.K, cx = keep ? (sc.scrollLeft + sc.clientWidth / 2 - map.offsetLeft) / old : 0, cy = keep ? (sc.scrollTop + sc.clientHeight / 2 - map.offsetTop) / old : 0;
  wm.zoom = clamp(zoom, 0, WM_ZOOMS.length - 1);
  const K = wm.K = wmFit() * WM_ZOOMS[wm.zoom];
  map.style.width = WM_W * K + "px"; map.style.height = WM_H * K + "px";
  map.classList.toggle("far", wm.zoom === 0); map.style.setProperty("--k", K);
  for (const b of $$("#worldMap [data-place], #worldMap [data-mystery]")) { const [x, y] = wmAt(b.dataset.place || b.dataset.mystery); b.style.left = x * K + "px"; b.style.top = (y - 32) * K + "px"; b.firstElementChild.style.width = 40 * K + "px"; b.firstElementChild.style.height = 36 * K + "px"; }
  $("worldIn").disabled = wm.zoom >= WM_ZOOMS.length - 1; $("worldOut").disabled = wm.zoom <= 0;
  if (keep) { sc.scrollLeft = map.offsetLeft + cx * K - sc.clientWidth / 2; sc.scrollTop = map.offsetTop + cy * K - sc.clientHeight / 2; }
}
function openWorld() {
  sfx.tick();
  worldBase();
  const map = $("worldMap"), fresh = save.mapFresh || [], here = wherePlace(), cr = activeCreature();
  map.innerHTML = `<canvas id="worldCv" width="${WM_W}" height="${WM_H}"></canvas>` + WORLD.map(w => {
    const ok = placeOk(w.id), isNew = fresh.includes(w.id), keeper = ok && WM_KEEPERS[w.id];
    return `<button class="wplace${ok && w.call && w.call() ? " call" : ""}${isNew ? " fresh" : ""}${ok ? "" : " locked"}${w.id === here ? " here" : ""}" data-place="${w.id}" ${ok ? "" : "disabled"}>`
      + `<span class="wplace-hit"></span>`
      + (keeper ? `<img class="wkeeper" src="${keeperImage(keeper)}" alt="">` : "")
      + (ok && w.id === here && cr ? `<img class="where" src="${creatureImage(specOf(cr), { art: 20, level: cr.level, shiny: cr.shiny, acc: cr.acc })}" alt="">` : "")
      + `<span class="wbanner"><b>${ok ? tr(w.name) : ic("lock") + "???"}</b><small>${ok ? (isNew ? tr("new! ✦") : w.note()) : w.how()}</small></span></button>`;
  }).join("");
  map.innerHTML += WM_MYSTERY.map(w => `<button class="wplace mystery" data-mystery="${w.id}"><span class="wplace-hit"></span><span class="wbanner"><b>???</b></span></button>`).join("");
  wm.cv = $("worldCv");
  if (fresh.length) { save.mapFresh = []; persist(); updateCalls(); }
  $$("#worldMap [data-mystery]").forEach(b => b.addEventListener("click", () => { sfx.tick(); toast(tr(WM_MYSTERY.find(w => w.id === b.dataset.mystery).hint)); }));
  $$("#worldMap [data-place]").forEach(b => b.addEventListener("click", () => {
    const w = WORLD.find(x => x.id === b.dataset.place);
    if (coopSession) coopEnd("navigation", true);
    closeWorld(); w.go();
  }));
  show("worldSheet", true);
  setHint("");
  // the whole valley at first
  wm.K = 1; layoutWorld(0, false);
  const sc = $("worldScroll"); sc.scrollLeft = 0; sc.scrollTop = 0;
  cancelAnimationFrame(wm.raf); wm.raf = requestAnimationFrame(worldFrame);
  litTabs();
}
function zoomWorld(dir) { sfx.tick(); layoutWorld(wm.zoom + dir, true); }
function closeWorld() {
  cancelAnimationFrame(wm.raf); wm.raf = 0;
  show("worldSheet", false);
  if (game.scene === "nest") setHint(nestHint());
  litTabs();
}
const worldOpen = () => !$("worldSheet").classList.contains("hidden");
