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
  ...PX_RUST,
  sn0: "#7d8cb4", sn1: "#aebcdc", sn2: "#d8e2f4", ice0: "#8fb6dc", ice1: "#c6def2",
}).map(([k, v]) => [k, pxHex(v)]));

// where the river runs, from the spring in the mountains down to the sea (art pixels)
const WM_RIVER = [[208, 52], [204, 80], [216, 108], [210, 132], [196, 152], [202, 186], [192, 214], [198, 244], [180, 276], [154, 298], [124, 322], [98, 346]];
/** The roads: the main one from the nest up to the grotto is wider; the others are lanes. */
const WM_ROADS = [["forge", "gloom", 0.9, 10], ["lab", "frost", 0.9, -16], ["nest", "grotto", 2.2, 14], ["nest", "lab", 1.8, -14], ["lab", "shop", 1.6, 12], ["grotto", "forge", 1.4, -12], ["forge", "garden", 1.3, 10], ["garden", "shop", 1.3, -8], ["shop", "trail", 1.4, -12], ["lab", "garden", 1.1, 18]];
/** Lands past the valley, not open yet: the west that Rust laid waste, snowfields in the east, an island, the aurora.
 *  Each has a veil, and ward spots along its road at the veil's edge (see wards.js): every stone set thins the veil a step,
 *  and once all of a land's spots stand guarded the veil lifts and the land shows, named like its sights (sparks.js). */
const WM_MYSTERY = [
  { id: "gloom", at: [44, 132], hint: "Mossa won't say what sleeps in the dark past the forge. Only that it's waiting.", name: "The Gloomreach", veil: "rust", thin: "The dark steps back" },
  { id: "frost", at: [360, 150], hint: "Snow, and something glittering under it. A door of ice?", name: "The snowfields", veil: "fog", thin: "The fog thins" },
  { id: "isle", at: [334, 322], hint: "A light blinks far out at sea, every night, as if someone keeps it.", name: "The isle", veil: "haze", thin: "The sea mist thins" },
  { id: "summit", at: [300, 34], hint: "Above the peaks the sky dances in green and pink. Somebody lives up there.", name: "The summit", veil: "cloud", thin: "The clouds part" },
].map(w => ({ ...w, wards: WARD_LAND[w.id].spots }));
const wmAt = id => (WORLD.find(w => w.id === id) || WM_MYSTERY.find(w => w.id === id)).at;
/** How far into the west (Rust's land) or the east (the snowfields) a point is, 0 to 1, with a ragged edge. */
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
  // (read back pixel by pixel while it's painted: the flowers look at the ground, each peak at what's behind it)
  const g = c.getContext("2d", { willReadFrequently: true }), im = g.createImageData(W, H), d = im.data, C = WM_COL;
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
    // the west: ground gone to Rust, cracked into flaking plates; the east: snow, and ice where the sea was
    const west = wmWest(x, y), east = wmEast(x, y);
    if (west > 0.5 && e >= 0.15 && e < 0.8) col = wmRustGround(x, y, shade, n);
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
      // (out in the west the road has rusted: oxide over the dirt, a cold glint where a flake came away)
      const rusted = pxHash(x, y + 3) < wmWest(x, y) * 1.1;
      put(x, y, onRiver ? ((x + y) % 3 ? C.d3 : C.d1) : rusted ? (dd > r.wid + 0.2 ? C.u0 : pxHash(x, y) > 0.85 ? C.cold : C.u4) : dd > r.wid - 0.4 ? C.d1 : pxHash(x, y) > 0.9 ? C.n0 : pxPick([C.d2, C.d3], pxHash(y, x), x, y));
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
    if (WORLD.some(w => !w.land && Math.hypot(w.at[0] - x, w.at[1] - y) < 26) || elev[Math.round(y) * W + Math.round(x)] < 0.17) continue;
    stand.push({ y, draw: () => wmPeak(g, x, y, size, size * 0.9) });
  }
  // standing stones: a ring of old rocks here and there, from before anyone remembers
  for (const [sx, sy] of [[212, 200], [150, 112], [252, 290]]) stand.push({ y: sy, draw: () => { for (let k = 0; k < 7; k++) { const an = k / 7 * TAU, x = Math.round(sx + Math.cos(an) * 7), y = Math.round(sy + Math.sin(an) * 3.5); g.fillStyle = "#8a8494"; g.fillRect(x, y - 4, 2, 4); g.fillStyle = "#5d5666"; g.fillRect(x + 1, y - 4, 1, 4); g.fillStyle = "rgba(5,0,20,.4)"; g.fillRect(x, y, 3, 1); } } });
  // forests: clumps of pines and round trees where the land is green and nothing else stands
  const places = [...WORLD.map(w => w.at), ...WM_MYSTERY.map(w => w.at)];
  // old ruins in the woods (#317), wherever one of these spots is clear of the roads, the river and the places: a lone arch with
  // half its head fallen, a broken column beside it and a few fallen blocks, ivy on them; the forest keeps back from them
  for (const [rx, ry] of [[232, 112], [290, 222], [176, 282], [120, 226]]) {
    const i = ry * W + rx, e = elev[i];
    if (!(e > 0.2 && e < 0.6) || roadD[i] < 9 || riverD[i] < 10 || wmWest(rx, ry) > 0.3 || wmEast(rx, ry) > 0.3 || places.some(([px, py]) => Math.hypot(rx - px, ry - py) < 30)) continue;
    // (the first is a landmark: a great arch, a column and a stone owl on a clearing of grass; the others smaller)
    const big = !places.ruin, k = big ? 1.5 : 1;
    places.push([rx, ry]); places.ruin = true;
    const put = (x, y, col) => { g.fillStyle = `rgb(${col})`; g.fillRect(x, y, 1, 1); };
    stand.push({ y: ry, draw: () => {
      g.fillStyle = "rgba(5,0,20,.4)"; g.fillRect(Math.round(rx - 7 * k), ry, Math.round(22 * k), 1);
      pxRuin("arch", put, rx, ry, 0.55 * k, rx + ry, { ivy: 2 });
      pxRuin("column", put, Math.round(rx + 12 * k), ry + 2, 0.42 * k, rx);
      if (big) pxRuin("owl", put, rx - 13, ry + 3, 0.5, ry);
      for (const [dx, dy] of [[-8, 1], [-5, 2], [5, 2]]) { const bx = Math.round(rx + dx * k); put(bx, ry + dy - 1, RUIN_STONE[3]); put(bx + 1, ry + dy - 1, RUIN_STONE[2]); put(bx, ry + dy, RUIN_STONE[1]); put(bx + 1, ry + dy, RUIN_STONE[1]); }
    } });
  }
  for (let gy = 70; gy < H; gy += 5) for (let gx = 2; gx < W; gx += 6) {
    const x = gx + (pxHash(gx, gy) - 0.5) * 5, y = gy + (pxHash(gy, gx) - 0.5) * 4, i = Math.round(y) * W + Math.round(x), e = elev[i];
    if (!(e > 0.2 && e < 0.6) || pxFbm(x / 34 + 3, y / 34 + 7) < 0.5 || riverD[i] < 6 || roadD[i] < 5 || places.some(([px, py]) => Math.hypot(x - px, (y - py) * 1.2) < 26)) continue;
    if (wmWest(x, y) > 0.5) continue;
    const pine = pxFbm(x / 20, y / 20 + 4) > 0.5, land = wmEast(x, y) > 0.5 ? "snow" : "";
    stand.push({ y, draw: () => wmTree(g, x, y, pine || land === "snow", pxHash(x | 0, y | 0), land) });
  }
  // in the west, a few trees Rust got to stand alone where a forest was
  for (let gy = 96; gy < H; gy += 15) for (let gx = 4; gx < 100; gx += 17) {
    const x = gx + (pxHash(gx, gy + 1) - 0.5) * 7, y = gy + (pxHash(gy, gx + 1) - 0.5) * 6, i = Math.round(y) * W + Math.round(x), e = elev[i];
    if (wmWest(x, y) <= 0.5 || !(e > 0.17 && e < 0.7) || pxHash(gx, gy + 2) < 0.45 || roadD[i] < 4 || places.some(([px, py]) => Math.hypot(x - px, (y - py) * 1.2) < 22)) continue;
    stand.push({ y, draw: () => wmTree(g, x, y, false, pxHash(x | 0, y | 0), "rust") });
  }
  // the far-off secrets, half seen
  for (const w of WM_MYSTERY) stand.push({ y: w.id === "summit" ? 90 : w.at[1], draw: () => g.drawImage(wmMysteryArt(w.id), Math.round(w.at[0] - 20), Math.round(w.at[1] - 40)) });
  // the places themselves
  // (a place past the valley is its land's own art, out under its veil: see wmMysteryArt)
  for (const w of WORLD) if (!w.land) stand.push({ y: w.at[1], draw: () => g.drawImage(wmPlaceArt(w.id), Math.round(w.at[0] - 20), Math.round(w.at[1] - 32)) });
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
  if (land === "rust") {
    // a tree Rust got to: a bare trunk lit pale on its west side and dark on its east, snapped off at the top with a cold bare
    // edge, its branches bent at hard right angles with a dark underside, their ends flaking; verdigris in the fork of a few
    const tall = 8 + Math.round(r * 5), h = pxHash(x, y);
    for (let k = 0; k < tall; k++) { const thick = k < tall * 0.55; px(x, y - k, thick ? C.u4 : C.u3); px(x + 1, y - k, thick ? C.u0 : C.u1); }
    px(x, y - tall, C.cold); px(x + 1, y - tall, C.u0);
    for (const [k, side, out] of [[0.4, -1, 3], [0.6, 1, 3], [0.8, -1, 2]]) {
      const by = y - Math.round(tall * k), x0 = side < 0 ? x : x + 1;
      for (let j = 1; j <= out; j++) { px(x0 + side * j, by, C.u3); px(x0 + side * j, by + 1, C.u0); }
      px(x0 + side * out, by - 1, C.u3); px(x0 + side * out, by - 2, pxHash(x + side, by) > 0.6 ? C.cold : C.u4);
    }
    if (h > 0.55) px(x, y - Math.round(tall * 0.4) - 1, C.vg1);
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
/** One pixel of ground gone to Rust: dark corroded earth (lit from the north-west like the rest of the land), split by long
 *  angular cracks with a lit lip on their north-west side, and here and there a flake of lighter oxide lifting off it, its
 *  north-west edge caught bright or bare cold steel; verdigris grows along some of the cracks. */
function wmRustGround(x, y, shade, n) {
  const C = WM_COL, crack = (x, y) => { const [gap, a, b] = wmRustCell(x, y); return gap < 1 && pxHash(Math.min(a, b), Math.max(a, b)) < 0.45; };
  const [gap, id] = wmRustCell(x, y);
  if (crack(x, y)) return pxHash(id, 11) < 0.25 && pxHash(x, y) < 0.5 ? C.vg0 : C.u0;
  if (crack(x - 1, y - 1) || crack(x - 1, y)) return C.u2;
  if (crack(x + 1, y + 1)) return C.u0;
  // a flake: a lighter plate shrunk inside its cell, lit along its top and left, shadowed under
  if (pxHash(id, 5) < 0.16 && gap > 3) {
    if (wmRustCell(x - 1, y)[0] <= 3 || wmRustCell(x, y - 1)[0] <= 3) return pxHash(x, y) > 0.75 ? C.cold : C.u4;
    if (wmRustCell(x + 1, y + 1)[0] <= 3) return C.u0;
    return pxPick([C.u2, C.u3], 0.6 + shade, x, y);
  }
  if (pxHash(x + 5, y) > 0.99) return C.u4;
  return pxPick([C.u0, C.u1, C.u2], 0.38 + shade * 1.6 + (n - 0.5) * 0.5, x, y);
}
/** Which plate of the cracked ground a pixel is on, how far it is from that plate's edge, and the plate across that edge
 *  (straight-edged cells round jittered points: [gap, id, id across]). */
function wmRustCell(x, y) {
  const S = 11, gx = Math.floor(x / S), gy = Math.floor(y / S);
  let d1 = Infinity, d2 = Infinity, id = 0, id2 = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = gx + i, cy = gy + j, d = Math.hypot((cx + 0.1 + pxHash(cx, cy) * 0.8) * S - x, (cy + 0.1 + pxHash(cy, cx) * 0.8) * S - y), k = cx * 977 + cy;
    if (d < d1) { d2 = d1; id2 = id; d1 = d; id = k; } else if (d < d2) { d2 = d; id2 = k; }
  }
  return [d2 - d1, id, id2];
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
      // and on the left, Runa's round hut: a log drum under a cap of snow, its round window lit amber, a chimney
      T.ball(cx - 13, cy - 3, 5, IC.w1, IC.w2, IC.w3, 3.5);
      T.poly([[cx - 19, cy - 4], [cx - 13, cy - 10], [cx - 7, cy - 4]], (x) => x < cx - 13 ? IC.white : IC.s0);
      T.line(cx - 11, cy - 10, cx - 11, cy - 12, IC.s3);
      T.px(cx - 14, cy - 3, IC.y1); T.px(cx - 13, cy - 3, IC.y0); T.glow(cx - 13, cy - 3, 4, IC.y1, 0.5);
    } else if (id === "isle") {
      // a lighthouse on a rock
      T.ball(cx, cy - 2, 11, IC.s1, IC.s2, IC.s3, 4);
      T.poly([[cx - 3, cy - 4], [cx + 3, cy - 4], [cx + 2, cy - 24], [cx - 2, cy - 24]], (x, y) => (Math.floor(y / 4) % 2) ? IC.white : IC.r1);
      T.poly([[cx - 3, cy - 24], [cx + 3, cy - 24], [cx, cy - 29]], IC.r2); T.px(cx, cy - 26, IC.y0);
    } else if (id === "summit") {
      // a snowy shoulder of rock with a little stone hut on it and a pole flying a ribbon in the aurora's colours
      T.poly([[cx - 14, cy], [cx - 4, cy - 12], [cx + 3, cy - 9], [cx + 14, cy]], (x, y) => y < cy - 7 ? IC.white : x < cx ? IC.s1 : IC.s2);
      T.box(cx - 2, cy - 12, 3, 3, 4, IC.s0, IC.s1, IC.s3); T.px(cx - 4, cy - 13, IC.y0);
      T.line(cx + 5, cy - 9, cx + 5, cy - 20, IC.w3);
      for (let k = 0; k < 5; k++) { T.px(cx + 6 + k, cy - 20 + (k % 2), k % 2 ? IC.p1 : IC.g0); T.px(cx + 6 + k, cy - 19 + (k % 2), k % 2 ? IC.g1 : IC.p0); }
    }
  });
}
// pre-painted veils: dry oxide dust blown over the west, a bank of fog over the snowfields, sea mist round the isle, cloud on the
// peaks, and night at the edges (drawn breathing each frame). `keep` thins a land's veil as its wardstones go up: 1 is untouched,
// 0 is gone. A thinner veil is the same dither with a lower bar, so every step only takes pixels away, never moves them.
const WM_VEILS = {
  // Rust's dust on the west wind: a dull dark haze with hard-edged streaks of paler grit through it (blocky across, thin
  // down), thicker towards the west edge; thin enough to make out the tower and the trees. Never a warm glow: that's the Heartlight's
  rust: (x, y) => {
    const streak = pxFbm(Math.floor(x / 4) / 5 + 4, y / 2.2);
    return [wmWest(x, y) * 0.75 - 0.1 + (pxFbm(x / 9 + 4, y / 7) - 0.5) * 0.6 + pxSmooth(0, 1, (30 - x) / 30) * 0.4, streak > 0.6 ? [104, 88, 84, 215] : [30, 22, 21, 215]];
  },
  fog: (x, y) => [wmEast(x, y) * 0.7 - 0.2 + (pxFbm(x / 13 + 3, y / 13) - 0.5) * 0.8, [228, 234, 246, 190]],
  // a ring of sea mist round the lighthouse's rock; its light still blinks through
  haze: (x, y) => [(1 - Math.hypot(x - 334, (y - 316) * 1.25) / 40) * 1.3 + (pxFbm(x / 8 + 7, y / 8) - 0.5) * 0.8, [200, 212, 236, 200]],
  // night: the edges of the map sink into dark
  night: (x, y) => [(Math.max(Math.abs(x / WM_W - 0.5) * 2, Math.abs(y / WM_H - 0.5) * 2) - 0.72) * 2.4, [6, 3, 14, 150]],
  cloud: (x, y) => [pxSmooth(0, 1, (46 - y) / 22 + (pxFbm(x / 10, y / 8) - 0.5) * 1.2) * pxSmooth(0, 1, (x - 250) / 30), [236, 230, 255, 220]],
};
const wmVeilCache = {};
function wmVeil(name, keep = 1) {
  const key = name + ":" + keep.toFixed(3);
  if (wmVeilCache[key]) return wmVeilCache[key];
  const c = document.createElement("canvas"); c.width = WM_W; c.height = WM_H; const g = c.getContext("2d"), im = g.createImageData(WM_W, WM_H), d = im.data;
  // (thinning also eats in from the veil's thin edge, so the first stone already shows)
  for (let y = 0; y < WM_H; y++) for (let x = 0; x < WM_W; x++) {
    const [v, col] = WM_VEILS[name](x, y), w = v * keep - (1 - keep) * 0.1, i = (y * WM_W + x) * 4;
    if (w > 0 && PX_BAYER[(y & 3) * 4 + (x & 3)] < w) { d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = col[3]; }
  }
  g.putImageData(im, 0, 0);
  return wmVeilCache[key] = c;
}
/** A land's veil, thinned by its wardstones; just after one goes up, the old veil fades off over the new one. */
function wmVeilDraw(g, id, alpha, now) {
  // (eased, so the first stones thin it and the last one lifts what's left)
  const w = wardLand(id), keep = wardKeep(id) ** 0.6, f = wm.fade[id], p = f ? clamp((now - f.t0) / 1600, 0, 1) : 1;
  if (keep > 0) { g.globalAlpha = alpha; g.drawImage(wmVeil(w.veil, keep), 0, 0); }
  if (p < 1) { g.globalAlpha = alpha * (1 - p) * (1 - p); g.drawImage(wmVeil(w.veil, f.from ** 0.6), 0, 0); } else delete wm.fade[id];
  g.globalAlpha = 1;
}

// ---------- the living map: water that sparkles, smoke from the chimneys, fireflies, clouds drifting over ----------

const wm = { fresh: [], raf: 0, t0: 0, smoke: [], flies: [], cv: null, K: 3, fade: {}, rise: {}, lifting: null, press: null, hint: null, rustRoad: null, scrape: null };
const WM_CHIMNEYS = { forge: [8, -26], nest: [9, -27], trail: [-2, -2], snow: [-11, -14] };
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
  // the veils stay put and only breathe: nudged a pixel at a time, their dither crawled and the map's edges peeked out from under them
  wmVeilDraw(g, "summit", 0.9 + Math.sin(t * 0.2) * 0.1, now);
  // (Rust's dust doesn't breathe like the others: it only lies there, and creeps along its road, see wmRustFrame)
  wmVeilDraw(g, "gloom", 0.94, now);
  wmRustFrame(g, t);
  wmVeilDraw(g, "frost", 0.88 + Math.sin(t * 0.15) * 0.12, now);
  wmVeilDraw(g, "isle", 0.85 + Math.sin(t * 0.3) * 0.1, now);
  g.drawImage(wmVeil("night"), 0, 0);
  wardsFrame(g, now);
  // a festival's snow (or petals, or leaves) falls only on the high, cold ground: the peaks and the snowfields
  const fall = eventNow()?.fall;
  if (fall && !fall.still) for (let k = 0; k < 70; k++) { const x = (pxHash(k, 41) * WM_W + t * 6 * (k % 3 - 1)) % WM_W, y = (pxHash(k, 42) * WM_H + t * (8 + k % 7) * (fall.dir || 0.3)) % WM_H; if (y < 95 || wmEast(x, y) > 0.4) put(x, y, pxHex(fall.c[k % fall.c.length]), 0.85); }
  // (after the finale: gone if the Gloom came home or lay down to sleep; still there, far off, if it keeps watch with you)
  if (save.ending === "watch" || (wardKeep("gloom") > 0 && !save.ending)) for (let k = 0; k < 3; k++) { const ph = t * 0.4 + k * 2.1; if (Math.sin(ph * 1.7) > 0.93) { const x = 14 + pxHash(k, Math.floor(ph / 3.7)) * 60, y = 100 + pxHash(Math.floor(ph / 3.7), k) * 200; put(x, y, [220, 90, 140]); put(x + 3, y, [220, 90, 140]); } }
  if (Math.sin(t * 2.2) > 0.2) { put(334, 296, WM_COL.n2); g.globalAlpha = 0.35; g.fillStyle = "#fff0b5"; g.fillRect(330, 293, 9, 7); g.globalAlpha = 1; }
  // mist over the places you haven't found yet
  for (const w of WORLD) if (!w.land && !placeOk(w.id)) {
    const [x, y] = w.at;
    for (let b = -24; b <= 10; b++) for (let a = -26; a <= 26; a++) {
      const f = (a / 26) ** 2 + ((b + 7) / 17) ** 2 + (pxFbm((x + a) / 7 + t * 0.15, (y + b) / 7) - 0.5) * 0.7;
      if (f < 1) put(x + a, y + b, f < 0.7 ? WM_COL.n1 : WM_COL.n0, f < 0.7 ? 0.92 : 0.6);
    }
  }
  wm.raf = requestAnimationFrame(worldFrame);
}

/** Rust creeping along the western road from the land it laid waste, a pixel at a time: each creep a flaking head with its
 *  stain behind it. With less motion it stays where it is. */
function wmRustFrame(g, t) {
  const C = WM_COL;
  if (!wm.rustRoad) wm.rustRoad = wmCurve(wmAt("forge"), wmAt("gloom"), 10).filter(([x]) => x > 46 && x < 118).reverse();
  for (const [x, y, k, i] of wmRustCrawl(wm.rustRoad, t, opts().calm)) {
    // the stain it leaves behind, the flaking head (a cold glint where a flake has just come away), a fleck come loose beside it
    const at = j => wm.rustRoad[Math.max(0, i - j)].map(Math.round), p = (q, col, w = 1) => { g.fillStyle = `rgb(${col})`; g.fillRect(q[0], q[1], w, 1); };
    const hx = Math.round(x), hy = Math.round(y);
    g.globalAlpha = k * 0.85; p(at(4), C.u1); p(at(3), C.u2); p(at(2), C.u3);
    g.globalAlpha = k; p([hx - 1, hy + 1], C.u0, 3); p(at(1), C.u3, 2); p([hx, hy], C.u4); p([hx + 1, hy], C.cold); p([hx, hy - 1], C.u3); p([hx + 1, hy - 1], C.u4);
    if (pxHash(i, 6) > 0.6) p([hx - 1, hy], C.vg1);
  }
  g.globalAlpha = 1;
}

// ---------- wardstones: Ember forges them, you set them at the edge of the fog, and the lands past the valley come out of it ----------
// save.wards: { have: crystal ids of the stones in hand (each lights its rune in that crystal's colour), set: { "frost.0": crystal id } }.

const wards = () => save.wards || (save.wards = wardSaveOf());
const wardLand = id => WM_MYSTERY.find(w => w.id === id);
/** Wardstones come with chapter III, when the valley first has to hold its ground (and Ember's forge is open). */
const wardsOpen = () => unlocked(13) && placeOk("forge");
/** The fourth cave is open: the Gloom's land can be warded once the other three are (see wards.js). */
const wardLate = () => unlocked(19);
const wardOk = id => wardsOpen() && wardOpenIn(wards(), id, wardLate());
const wardsSet = id => wardsUp(wards(), id);
const wardDone = id => wardFull(wards(), id);
/** How much of a land's veil is left: 1 untouched, 0 lifted. */
const wardKeep = id => wardLeft(wards(), id);
/** What a land still waits for before its spots open. */
const wardHow = id => tr(WARD_LAND[id].late && !wardLate() ? "reach chapter IV" : id === "gloom" ? "ward the other lands first" : id === "isle" ? "ward the snowfields first" : "ward the snowfields and the isle first");
const wardCol = cid => (CRYSTAL[cid] || CRYSTAL.quartz).c.map(pxHex);
/** A fresh stone from the workbench, made from a spare of this crystal. */
function forgeWard(cid) { wards().have.push(CRYSTAL[cid] ? cid : "quartz"); }

/** A wardstone: a little standing stone of grey granite with a rune down its face, lit `lit` of the way (0 to 1) in its crystal's colour. */
const WARD_GRANITE = ["#3a3440", "#5d5666", "#8a8494", "#b9b3c0", "#e4dfe8"].map(pxHex);
// the stone's shape, from the ground up (k = 1 is the foot): its columns from a to b, a wide foot and a rounded, leaning top
const WARD_SHAPE = [[-2, 2], [-2, 2], [-1, 1], [-1, 1], [-1, 1], [-1, 1], [-1, 1], [-1, 1], [-1, 0]];
function wardStone(g, x, y, col, lit = 1, sink = 0) {
  const p = (a, b, c) => { if (b > y - 1) return; g.fillStyle = `rgb(${c})`; g.fillRect(a, b, 1, 1); }, G = WARD_GRANITE;
  const inside = (a, k) => k >= 1 && k <= WARD_SHAPE.length && a >= WARD_SHAPE[k - 1][0] && a <= WARD_SHAPE[k - 1][1];
  g.fillStyle = "rgba(5,0,20,.5)"; g.fillRect(x - 3, y, 7, 1);
  // a dark outline round it, so it reads against snow, grass and the dark alike
  for (let k = 1; k <= WARD_SHAPE.length + 1; k++) for (let a = -3; a <= 3; a++)
    if (!inside(a, k) && (inside(a - 1, k) || inside(a + 1, k) || inside(a, k - 1) || inside(a, k + 1))) p(x + a, y - k + sink, WM_COL.ink);
  // granite lit from the north-west: pale on the left, dark on the right, a bright cap
  WARD_SHAPE.forEach(([l, r], j) => { for (let a = l; a <= r; a++) p(x + a, y - j - 1 + sink, j === WARD_SHAPE.length - 1 ? G[a < 0 ? 4 : 3] : G[a < 0 ? 3 : a > 0 ? 1 : 2]); });
  // moss at its foot
  p(x - 2, y - 1 + sink, WM_COL.g4); p(x + 1, y - 1 + sink, WM_COL.g5); p(x + 2, y - 1 + sink, WM_COL.g3);
  // the rune: a line down the middle with a tick to each side, carved dark, then lit from the bottom up
  const rune = [[0, -2], [0, -3], [-1, -4], [0, -4], [1, -5], [0, -5], [0, -6], [0, -7]];
  rune.forEach(([a, b], k) => { const on = k < lit * rune.length; p(x + a, y + b + sink, on ? (k < lit * rune.length - 1 ? col[0] : col[1]) : G[0]); });
}
/** The stones and their spots on the map, drawn over the veils: old sockets, stones rising, glow rings that stay. */
function wardsFrame(g, now) {
  if (!wardsOpen()) return;
  const t = now / 1000, ws = wards();
  for (const w of WM_MYSTERY) {
    if (!wardOk(w.id)) continue;
    w.wards.forEach(([x, y], i) => {
      const key = w.id + "." + i, cid = ws.set[key];
      if (!cid) {
        // an old socket in the ground: a ring of worn pebbles round a dark hollow where a stone once stood
        g.fillStyle = "rgba(5,0,20,.55)"; g.fillRect(x - 3, y - 1, 7, 2);
        g.fillStyle = "#0b0614"; g.fillRect(x - 1, y - 1, 3, 1);
        for (const [a, b, c] of [[-3, -1, "#6b5a9a"], [3, -1, "#4e3f7d"], [-2, 0, "#4e3f7d"], [2, 0, "#3b2f63"], [-2, -2, "#8a78b8"], [0, -2, "#6b5a9a"], [2, -2, "#4e3f7d"]]) { g.fillStyle = c; g.fillRect(x + a, y + b, 1, 1); }
        if (ws.have.length) {
          // while there's a stone in hand: a soft ring that keeps spreading, and a little gold mark bobbing over the spot
          const r = 3 + ((t * 0.9 + i * 0.37) % 1) * 6; g.globalAlpha = 0.85 * (1 - (r - 3) / 6); wmRing(g, x, y, r, [255, 240, 181]); g.globalAlpha = 1;
          const by = y - 6 - (Math.sin(t * 3 + i) > 0 ? 1 : 0), tw = Math.sin(t * 5 + i * 2) > 0.3;
          g.fillStyle = "#c98f3a"; g.fillRect(x, by - 2, 1, 5); g.fillRect(x - 2, by, 5, 1);
          g.fillStyle = "#eec26a"; g.fillRect(x, by - 1, 1, 3); g.fillRect(x - 1, by, 3, 1);
          g.fillStyle = tw ? "#ffffff" : "#fff0b5"; g.fillRect(x, by, 1, 1);
        }
        return;
      }
      const col = wardCol(cid), age = (now - (wm.rise[key] || 0)) / 1000;
      // just set: it rises out of the ground (0–0.7s), its rune lights (0.7–1.3s), a ring of light spreads (1–2.2s), and a wave of light runs into the veil
      const rise = clamp(age / 0.7, 0, 1), lit = clamp((age - 0.7) / 0.6, 0, 1), ring = clamp((age - 1) / 1.2, 0, 1);
      // a pool of light on the ground inside its ring (dithered, so it stays pixel-crisp)
      const pool = lit * (0.5 + 0.1 * Math.sin(t * 1.6 + i));
      g.fillStyle = "#eec26a"; g.globalAlpha = 0.55;
      for (let b = -3; b <= 2; b++) for (let a = -7; a <= 7; a++) { const f = (a / 7.5) ** 2 + ((b + 0.5) / 3.4) ** 2; if (f < 1 && PX_BAYER[((y + b) & 3) * 4 + ((x + a) & 3)] < pool * (1 - f)) g.fillRect(x + a, y + b, 1, 1); }
      g.globalAlpha = Math.min(1, 0.6 + 0.2 * Math.sin(t * 1.6 + i) + (ring < 1 ? (1 - ring) * 0.4 : 0));
      // the ring of warm light that stays, with a thread of the crystal's own colour inside it
      wmRing(g, x, y, 3 + 5 * (1 - (1 - ring) ** 2), [238, 194, 106]);
      g.globalAlpha *= 0.7; wmRing(g, x, y, 2 + 4 * (1 - (1 - ring) ** 2), col[0]);
      if (ring > 0 && ring < 1) { g.globalAlpha = (1 - ring) * 0.9; wmRing(g, x, y, 6 + ring * 22, [255, 240, 181]); }
      g.globalAlpha = 1;
      wardStone(g, x, y, col, lit, Math.round(9 * (1 - rise) ** 2));
      // earth thrown up as it rises
      if (age < 0.7) for (let k = 0; k < 5; k++) { g.fillStyle = k % 2 ? "#8a6238" : "#6b4a2a"; g.fillRect(x - 4 + k * 2 + Math.round(Math.sin(age * 20 + k) * 1.5), y - 1 - Math.round(pxHash(k, Math.floor(age * 10)) * 4), 1, 1); }
      // a flash as the rune catches
      if (lit > 0 && lit < 1) { g.globalAlpha = 1 - lit; g.fillStyle = "#ffffff"; g.fillRect(x - 1, y - 9, 3, 1); g.fillRect(x, y - 10, 1, 3); g.globalAlpha = 1; }
      // a spark climbs off the rune now and then
      const ph = (t * 0.5 + pxHash(i, w.id.length)) % 1;
      if (lit >= 1 && ph < 0.5) { g.globalAlpha = 1 - ph * 2; g.fillStyle = `rgb(${col[1]})`; g.fillRect(x + Math.round(Math.sin(ph * 9 + i) * 2), y - 8 - Math.round(ph * 14), 1, 1); g.globalAlpha = 1; }
    });
  }
}
/** A dithered ring lying on the ground (half as tall as wide). */
function wmRing(g, x, y, r, col) {
  g.fillStyle = `rgb(${col})`;
  const n = Math.max(12, Math.round(r * 5));
  for (let k = 0; k < n; k++) { const a = k / n * TAU; g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y - 1 + Math.sin(a) * r * 0.5), 1, 1); }
}
const wardIconCache = {};
/** A wardstone for buttons and the hand counter. */
function wardIcon(cid = "amethyst") {
  if (wardIconCache[cid]) return wardIconCache[cid];
  const c = document.createElement("canvas"); c.width = 9; c.height = 12;
  const g = c.getContext("2d"), col = wardCol(cid);
  g.globalAlpha = 0.5; wmRing(g, 4, 11, 3.6, [238, 194, 106]); g.globalAlpha = 1;
  wardStone(g, 4, 11, col);
  return wardIconCache[cid] = c.toDataURL();
}

/** A land shows once all its stones stand (and the last one has risen: wm.lifting is the land whose veil is lifting now). */
const wardFound = id => wardDone(id) && wm.lifting !== id;
/** How many of a land's sights glowlings have brought home (see sparks.js), for its label once it's found; null if it has none. */
function wardSights(id) {
  const all = landSights(id);
  return all.length ? [all.filter(x => save.sparks.got[x.id]).length, all.length] : null;
}
/** The place a land past the valley becomes once it's found (the snowfields: Runa's), or null while it has none yet. */
const wardPlaceOf = id => WORLD.find(p => p.land === id && placeOk(p.id)) || null;
/** The banner under a land: a lock pin while it's hidden (a tap shows its hint: see wmHint), its name once it's found, and
 *  what's there once it's a place you can go to (a "new" tag until you've looked, like the valley's places). */
function wardBanner(w) {
  if (wardFound(w.id)) {
    const s = wardSights(w.id), p = wardPlaceOf(w.id), isNew = p && (wm.fresh || []).includes(p.id);
    return `<b>${tr(w.name)}</b><small>${p ? (isNew ? tr("new! ✦") : p.note()) : tr("the road is still being cleared")}</small>` + (s ? `<small class="wsights">${tr("✦ sights {0} of {1}", s[0], s[1])}</small>` : "");
  }
  return ic("lock");
}
/** How many stones are in hand, in the strip under the map. */
function wardHand() {
  const el = $("wardHand"), ws = wards();
  if (!el) return;
  el.hidden = !wardsOpen() || (!ws.have.length && WM_MYSTERY.every(w => wardDone(w.id)));
  el.innerHTML = `<img src="${wardIcon(ws.have[0])}" alt=""><b>${ws.have.length}</b><small>${pl(ws.have.length, "wardstone", "wardstones")}</small>`;
  el.classList.toggle("full", ws.have.length > 0);
}
function tapWard(key) {
  const [id, i] = key.split("."), w = wardLand(id), ws = wards();
  if (!w || !wardOk(id)) return;
  if (ws.set[key]) { sfx.tick(); toast(tr("A wardstone of {0} stands here. The light holds.", tr(CRYSTAL[ws.set[key]]?.name || ""))); return; }
  if (!ws.have.length) { sfx.refuse(); toast(tr("No wardstone in hand. Ember forges them at the workbench ✦")); return; }
  const from = wardKeep(id), cid = wardPlace(ws, id, +i, wardLate());
  if (!cid) return;
  const now = performance.now();
  wm.rise[key] = now; wm.fade[id] = { from, t0: now + 900 };
  sfx.thud(); setTimeout(() => music.sting("ward") || sfx.shimmer(), 700); buzz([10, 40, 20]); // (the ward's phrase in the song's key)
  bump("warded");
  persist();
  if (wardDone(id)) wm.lifting = id;
  wmWardButtons(); wardHand();
  if (wardDone(id)) setTimeout(() => {
    wm.lifting = null;
    if (!worldOpen()) return;
    sfx.levelUp();
    toast(tr("The veil lifts: {0} ✦", tr(w.name)));
    const b = document.querySelector(`#worldMap [data-mystery="${id}"]`), p = wardPlaceOf(id);
    if (b) b.classList.add("fresh");
    // (a land that is a place now says so on its banner straight away)
    if (p) wm.fresh = [...(wm.fresh || []), p.id];
    // the next land's spots may have opened with this one
    wmWardButtons();
    setTimeout(() => talk("wardFound_" + id), 900);
  }, 2400);
  else setTimeout(() => worldOpen() && toast(tr("{0} · {1} of {2} ✦", tr(w.thin), wardsSet(id), w.wards.length)), 1300);
}
/** The ward spots, as buttons over the canvas, and the lands' banners (rebuilt when a stone is set). */
function wmWardButtons() {
  $$("#worldMap [data-ward]").forEach(b => b.remove());
  for (const w of WM_MYSTERY) if (wardOk(w.id)) w.wards.forEach((_, i) => {
    const b = document.createElement("button"), key = w.id + "." + i;
    b.className = "wward" + (wards().set[key] ? " set" : wards().have.length ? " ready" : "");
    b.dataset.ward = key; b.setAttribute("aria-label", tr("Ward spot"));
    b.addEventListener("click", e => { e.stopPropagation(); tapWard(key); });
    $("worldMap").appendChild(b);
  });
  // (a land whose veil has lifted is found only once its stone has risen: the banner changes with the toast, not before)
  for (const b of $$("#worldMap [data-mystery]")) {
    const w = wardLand(b.dataset.mystery), found = wardFound(w.id), p = found && wardPlaceOf(w.id);
    b.querySelector(".wbanner").innerHTML = wardBanner(w); b.classList.toggle("found", found); b.classList.toggle("pin", !found);
    // a land that is a place now wears its keeper, and says so when you're standing in it
    b.classList.toggle("place", !!p); b.classList.toggle("here", !!p && wherePlace() === p.id); if (p && (wm.fresh || []).includes(p.id)) b.classList.add("fresh");
    const k = WM_KEEPERS[p && p.id], img = b.querySelector(".wkeeper");
    if (k && !img) b.querySelector(".wplace-hit").insertAdjacentHTML("afterend", `<img class="wkeeper" src="${keeperMini(k)}" alt="">`); else if (!k && img) img.remove();
    if (found) b.removeAttribute("aria-label"); else b.setAttribute("aria-label", "??? · " + tr(w.hint));
  }
  // no pin's hint is open (or its land has just been found): the strip goes back to its quiet line
  if (!document.querySelector("#worldMap .wplace.pin.on")) wmHint(null);
  if (wm.K) { wmPlaceWards(); wmClampBanners(); }
}
/** The lands at the map's edges keep their banners inside it (the snowfields' and the Gloom's would hang off the side). */
function wmClampBanners() {
  const m = $("worldMap").getBoundingClientRect();
  for (const el of $$("#worldMap [data-mystery] .wbanner")) {
    el.style.translate = "";
    const r = el.getBoundingClientRect();
    el.style.translate = Math.round(Math.max(0, m.left + 4 - r.left) - Math.max(0, r.right - m.right + 4)) + "px 0";
  }
}
function wmPlaceWards() {
  for (const b of $$("#worldMap [data-ward]")) { const [id, i] = b.dataset.ward.split("."), [x, y] = wardLand(id).wards[i]; b.style.left = x * wm.K + "px"; b.style.top = (y - 3) * wm.K + "px"; }
}
/** A tap on a land past the valley: while it's hidden, its hint and how the warding goes, in the strip under the map; once it's found, its name and its sights. */
function tapMystery(id) {
  const w = wardLand(id), s = wardSights(id);
  sfx.tick();
  // found and a place now: off you go, as from any place on the map
  const p = wardFound(id) && wardPlaceOf(id);
  if (p) { if (coopSession) coopEnd("navigation", true); closeWorld(); p.go(); return; }
  if (wardFound(id)) { toast(tr("{0}: the road is still being cleared. Pip will lead the way when it's ready.", tr(w.name)) + (s ? " · " + tr("{0}: {1} of {2} sights home", tr(w.name), s[0], s[1]) : "")); return; }
  wmHint(id, tr(w.hint), !wardsOpen() ? "" : wardOk(id) ? tr("wardstones {0} of {1}", wardsSet(id), w.wards.length) + " · " + tr("Set a wardstone on each spot at the edge of the veil.") : wardHow(id));
}

/** Where you are right now, as a place on the map. */
function wherePlace() {
  if (game.scene === "map") return "grotto";
  const k = save.rooms[save.room]?.kind;
  return { yard: "garden", lab: "lab", shop: "shop", forge: "forge", camp: "trail", grotto: "grotto", snow: "snow" }[k] || "nest";
}
const WM_KEEPERS = { shop: "tansy", forge: "ember", trail: "pip", lab: "ollo", garden: "fennel", snow: "runa" };

// ---------- looking around: how big the map is drawn, where it may rest, and when a press is a drag ----------
// (plain sums, so the tests can run them in Node: see tests/world-pan.test.cjs)

/** How big the map is drawn: the first step fits it all on screen, each step in is bigger. */
const WM_ZOOMS = [1, 1.8, 2.8, 4];
// a screen with this much more height than the whole map needs (a phone held upright) opens the map filling its height
const WM_TALL = 1.3;
/** The sizes the map can be drawn at (screen px per art px) and the step it opens at, from the sizes that fit the screen's
 *  width and its height. A wide screen opens on the whole map. An upright phone opens a step in, the map as tall as the
 *  screen and dragged sideways, with the whole map one step out. */
function wmSteps(byW, byH) {
  const whole = Math.max(0.5, Math.min(byW, byH));
  return byH < whole * WM_TALL ? { ks: WM_ZOOMS.map(z => whole * z), home: 0 } : { ks: [whole, byH, byH * 1.5, byH * 2.2], home: 1 };
}
/** Where the map may rest: never past its own edges (a map smaller than its window stays put). */
const wmPanClamp = (at, size, view) => Math.max(0, Math.min(at, size - view));
/** The scroll that brings a point of the map to the middle of its window, as near as the edges allow. */
const wmPanTo = (p, size, view) => wmPanClamp(p - view / 2, size, view);
// a press may wander this far (screen px) and still be a tap; any further and it drags the map and taps nothing
const WM_TAP = 8;
const wmDragged = (dx, dy) => Math.hypot(dx, dy) > WM_TAP;

// ---------- Rust in the west: its slow creep along the road, and the dry scrape you hear when you look that way ----------
// (plain sums too, for tests/rust-look.test.cjs)

/** How many creeps of Rust are on the western road, and how much of the road one crawls in a second (the length in ~2 minutes). */
const WM_CREEPS = 7, WM_CRAWL = 1 / 120;
/** Where each creep is on the road (points from the west end in), at t seconds: [x, y, how strongly it shows, point index].
 *  Each fades in at the west end and out at the east, where it gives up. With less motion they never move. */
function wmRustCrawl(pts, t, calm) {
  if (pts.length < 2) return [];
  return Array.from({ length: WM_CREEPS }, (_, k) => {
    const s = (k / WM_CREEPS + pxHash(k, 9) * 0.06 + (calm ? 0 : t * WM_CRAWL)) % 1, i = Math.floor(s * (pts.length - 1));
    return [pts[i][0], pts[i][1], Math.min(1, s * 6, (1 - s) * 3), i];
  });
}
// the window looks into the west once its left edge is this near the map's own (art pixels): Rust's land fills its side
const WM_WEST = 40;
const wmLooksWest = left => left < WM_WEST;
/** Should the scrape sound now? Only as the window comes into the west from outside it, and once a visit to the map
 *  (st: { west: is it looking west already, scraped: has it sounded this visit }, updated). */
function wmScrapeDue(st, west) {
  const due = west && !st.west && !st.scraped;
  st.west = west;
  if (due) st.scraped = true;
  return due;
}

// ---------- the map sheet: laid out, opened, dragged about, and the strip under it ----------

/** The sizes at which the map would just fit the sheet's width, and its height. */
function wmFit() {
  const sc = $("worldScroll"), css = getComputedStyle($("worldMap"));
  return [(sc.clientWidth - 16) / WM_W, (sc.clientHeight - (parseFloat(css.marginTop) || 0) - (parseFloat(css.marginBottom) || 0)) / WM_H];
}
/** Draw the map at a zoom step (none given: the step it opens at); keep: what's in the middle of the screen stays there. */
function layoutWorld(zoom, keep) {
  const sc = $("worldScroll"), map = $("worldMap"), old = wm.K, cx = keep ? (sc.scrollLeft + sc.clientWidth / 2 - map.offsetLeft) / old : 0, cy = keep ? (sc.scrollTop + sc.clientHeight / 2 - map.offsetTop) / old : 0;
  const { ks, home } = wmSteps(...wmFit());
  wm.zoom = clamp(zoom ?? home, 0, ks.length - 1);
  const K = wm.K = ks[wm.zoom];
  map.style.width = WM_W * K + "px"; map.style.height = WM_H * K + "px";
  map.classList.toggle("far", wm.zoom <= home); map.style.setProperty("--k", K);
  for (const b of $$("#worldMap [data-place], #worldMap [data-mystery]")) { const [x, y] = wmAt(b.dataset.place || b.dataset.mystery); b.style.left = x * K + "px"; b.style.top = (y - 32) * K + "px"; b.firstElementChild.style.width = 40 * K + "px"; b.firstElementChild.style.height = 36 * K + "px"; }
  wmPlaceWards(); wmClampBanners();
  $("worldIn").disabled = wm.zoom >= ks.length - 1; $("worldOut").disabled = wm.zoom <= 0;
  if (keep) { sc.scrollLeft = map.offsetLeft + cx * K - sc.clientWidth / 2; sc.scrollTop = map.offsetTop + cy * K - sc.clientHeight / 2; }
}
function openWorld() {
  sfx.tick();
  worldBase();
  const map = $("worldMap"), fresh = wm.fresh = save.mapFresh || [], here = wherePlace(), cr = activeCreature();
  map.innerHTML = `<canvas id="worldCv" width="${WM_W}" height="${WM_H}"></canvas>` + WORLD.filter(w => !w.land).map(w => {
    const ok = placeOk(w.id), isNew = fresh.includes(w.id), keeper = ok && WM_KEEPERS[w.id];
    // (a place not open yet is a lock pin: a tap shows how it opens, in the strip under the map)
    return `<button class="wplace${ok && w.call && w.call() ? " call" : ""}${isNew ? " fresh" : ""}${ok ? "" : " locked pin"}${w.id === here ? " here" : ""}" data-place="${w.id}"${ok ? "" : ` aria-label="??? · ${w.how()}"`}>`
      + `<span class="wplace-hit"></span>`
      + (keeper ? `<img class="wkeeper" src="${keeperMini(keeper)}" alt="">` : "")
      + (ok && w.id === here && cr ? `<img class="where" src="${creatureImage(specOf(cr), { art: 20, level: cr.level, shiny: cr.shiny, acc: cr.acc })}" alt="">` : "")
      + `<span class="wbanner">${ok ? `<b>${tr(w.name)}</b><small>${isNew ? tr("new! ✦") : w.note()}</small>` : ic("lock")}</span></button>`;
  }).join("");
  map.innerHTML += WM_MYSTERY.map(w => `<button class="wplace mystery" data-mystery="${w.id}"><span class="wplace-hit"></span><span class="wbanner">${wardBanner(w)}</span></button>`).join("");
  if (!$("wardHand")) { const h = document.createElement("button"); h.id = "wardHand"; h.addEventListener("click", () => { sfx.tick(); toast(tr(wards().have.length ? "Tap a glowing spot at the edge of the fog to set a wardstone." : "No wardstone in hand. Ember forges them at the workbench ✦")); }); $("worldSheet").appendChild(h); }
  // the stones in hand sit in the strip under the map, before the hint
  $("worldStrip").prepend($("wardHand"));
  wm.cv = $("worldCv");
  if (fresh.length) { save.mapFresh = []; persist(); updateCalls(); }
  $$("#worldMap [data-mystery]").forEach(b => b.addEventListener("click", () => tapMystery(b.dataset.mystery)));
  wmWardButtons(); wardHand();
  $$("#worldMap [data-place]").forEach(b => b.addEventListener("click", () => {
    const w = WORLD.find(x => x.id === b.dataset.place);
    if (!placeOk(w.id)) { sfx.tick(); wmHint(w.id, w.how()); return; }
    if (coopSession) coopEnd("navigation", true);
    closeWorld(); w.go();
  }));
  show("worldSheet", true);
  setHint("");
  // fitted to the screen at first (an upright phone fills its height), with the place you stand in in the middle
  wm.K = 1; layoutWorld(null, false);
  const sc = $("worldScroll"), [hx, hy] = wmAt(here);
  sc.scrollLeft = wmPanTo(map.offsetLeft + hx * wm.K, sc.scrollWidth, sc.clientWidth); sc.scrollTop = wmPanTo(map.offsetTop + (hy - 14) * wm.K, sc.scrollHeight, sc.clientHeight);
  cancelAnimationFrame(wm.raf); wm.raf = requestAnimationFrame(worldFrame);
  // a new visit: Rust may scrape once, if you look west (not if the map opens looking there already)
  wm.scrape = { west: wmLooksWest(wmViewLeft()), scraped: false };
  litTabs();
  if (wardsOpen()) setTimeout(() => worldOpen() && talk("wardSpots"), 600);
}
/** The art pixel at the window's left edge. */
function wmViewLeft() { const sc = $("worldScroll"); return (sc.scrollLeft - $("worldMap").offsetLeft) / wm.K; }
/** However the map moved (a drag, the wheel, a zoom), looking west for the first time this visit, you hear Rust. */
function wmScrolled() { if (wm.scrape && worldOpen() && wmScrapeDue(wm.scrape, wmLooksWest(wmViewLeft()))) sfx.scrape(); }
function zoomWorld(dir) { sfx.tick(); layoutWorld(wm.zoom + dir, true); }
function closeWorld() {
  cancelAnimationFrame(wm.raf); wm.raf = 0; wm.scrape = null;
  show("worldSheet", false);
  if (game.scene === "nest") setHint(nestHint());
  litTabs();
}
const worldOpen = () => !$("worldSheet").classList.contains("hidden");

/** A lock pin's hint, in the strip under the map: a tap on the pin shows it, a tap on it again (or anywhere else: see wmClick) puts it away. */
function wmHint(id, text = "", sub = "") {
  const on = !!id && wm.hint !== id, pins = $$("#worldMap .wplace.pin");
  wm.hint = on ? id : null;
  for (const b of pins) b.classList.toggle("on", on && (b.dataset.place || b.dataset.mystery) === id);
  $("worldHint").innerHTML = on ? `${ic("lock")}<span>${text}${sub ? `<small>${sub}</small>` : ""}</span>` : pins.length ? tr("tap a lock for its hint") : "";
  $("worldStrip").classList.toggle("on", on);
}
/** A press on the map is a tap until it has moved (see wmDragged): from then on it drags the map, and taps nothing. */
function wmPress(e) {
  if (!e.isPrimary || e.button || (wm.press && wm.press.pan && !wm.press.up)) return;
  const sc = $("worldScroll");
  wm.press = { id: e.pointerId, x: e.clientX, y: e.clientY, left: sc.scrollLeft, top: sc.scrollTop, pan: false, up: false };
}
function wmDrag(e) {
  const p = wm.press, sc = $("worldScroll");
  if (!p || p.up || p.id !== e.pointerId) return;
  if (e.pointerType === "mouse" && !(e.buttons & 1)) { wmRelease(e); return; }
  if (!p.pan) {
    if (!wmDragged(e.clientX - p.x, e.clientY - p.y)) return;
    // the drag starts from here, so the map doesn't jump the first few pixels
    p.pan = true; p.x = e.clientX; p.y = e.clientY;
    sc.setPointerCapture(e.pointerId); sc.classList.add("panning");
  }
  sc.scrollLeft = wmPanClamp(p.left - (e.clientX - p.x), sc.scrollWidth, sc.clientWidth);
  sc.scrollTop = wmPanClamp(p.top - (e.clientY - p.y), sc.scrollHeight, sc.clientHeight);
}
function wmRelease(e) {
  const p = wm.press;
  if (!p || p.id !== e.pointerId) return;
  p.up = true; $("worldScroll").classList.remove("panning");
  // a tap is over with; a drag is remembered a moment longer, for the click that may come with letting go
  if (p.pan) setTimeout(() => { if (wm.press === p) wm.press = null; }, 400); else wm.press = null;
}
/** Every click on the map sheet comes through here first: the one that ends a drag is dropped, and a tap anywhere but on a lock pin puts the hint away. */
function wmClick(e) {
  if (wm.press && wm.press.pan) { wm.press = null; e.stopPropagation(); e.preventDefault(); return; }
  if (wm.hint && !e.target.closest(".wplace.pin")) wmHint(null);
}
// a new press anywhere on the sheet (the zoom buttons, the strip) means the last drag is over with
$("worldSheet").addEventListener("pointerdown", () => { if (wm.press && wm.press.up) wm.press = null; }, true);
$("worldScroll").addEventListener("pointerdown", wmPress);
$("worldScroll").addEventListener("pointermove", wmDrag);
$("worldScroll").addEventListener("scroll", wmScrolled, { passive: true });
for (const ev of ["pointerup", "pointercancel"]) addEventListener(ev, wmRelease);
$("worldSheet").addEventListener("click", wmClick, true);

// what Ember says over the first wardstone, Pip at the first sight of the ward spots, and Pip as each land comes out of the dark
Object.assign(TALKS, {
  firstWard: () => [[EMBER, "A hammer breaks stone. This one holds ground.", null, "satisfied"],
    [EMBER, "Set it where the fog is thickest. Where a wardstone stands, the dark steps back. Stays back.", null, "concern"]],
  wardSpots: () => [[PIP, "See the old sockets in the ground, at the edge of the fog? Wardstones stood there once. I've marked them.", () => wardSpotRect(), "thinking"],
    [PIP, "Ember can forge new ones at the workbench. What's past the fog scares me. A bit. I'd still like to see it.", null, "scared-but-steady"]],
  wardFound_frost: () => [[PIP, "The fog's gone. There's a hut out there, with smoke from its chimney. Go and say hello!", wardSpotOf("frost"), "excited"],
    [MOSSA, "Snow. I'd forgotten snow. Someone kept a door out there, long ago. I never knew who.", null, "warm"]],
  // the first steps into the snowfields: small tracks across the snow, up to a round hut, and its keeper out on the step
  snowWelcome: () => [[RUNA, "Finally! That fog sat on my porch for a hundred winters. Come in, come in, mind the drift.", null, "glad"]],
  wardFound_isle: () => [[PIP, "Someone keeps that lighthouse lit every single night. Never misses. I'd like to meet them one day.", wardSpotOf("isle"), "thinking"]],
  wardFound_summit: () => [[PIP, "Up there the sky never quite goes dark. The path is steep and still being cleared. One day we'll stand under it.", wardSpotOf("summit"), "excited"]],
  wardFound_gloom: () => [[PIP, "The dark held for so long. But the stones are standing, and so are we.", wardSpotOf("gloom"), "shy-pride"],
    [PIP, "I'm still scared of the dark. I'll go anyway, with my map, once the road is clear. Will you come too?", null, "scared-but-steady"]],
});
/** A land's banner on the map, for Pip to point at as it comes out of the veil. */
const wardSpotOf = id => `#worldMap [data-mystery="${id}"] .wbanner`;
/** Where the first open ward spot is on screen (for Pip to point at). */
function wardSpotRect() {
  const b = document.querySelector("#worldMap .wward:not(.set)");
  if (!b) return null;
  b.scrollIntoView({ block: "center", inline: "center" });
  const r = b.getBoundingClientRect();
  return r.width ? { x: r.left, y: r.top, w: r.width, h: r.height, round: true } : null;
}
