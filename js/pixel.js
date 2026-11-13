"use strict";
// Hatchstone · pixel art: dithering, icons and backdrops.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- pixel art: dithered scenes in the style of helavika's portfolio keep ----------
const PX_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
const pxHex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const pxPick = (ramp, v, x, y) => { const n = ramp.length - 1; return ramp[clamp(Math.floor(clamp(v, 0, 1) * n + PX_BAYER[(y & 3) * 4 + (x & 3)]), 0, n)]; };
const pxHash = (x, y) => { let h = x * 374761393 + y * 668265263; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function pxNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = pxHash(xi, yi), b = pxHash(xi + 1, yi), c = pxHash(xi, yi + 1), d = pxHash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const pxFbm = (x, y) => pxNoise(x, y) * .55 + pxNoise(x * 2.1, y * 2.1) * .3 + pxNoise(x * 4.3, y * 4.3) * .15;
function pxSmooth(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

// ---------- pixel icons: little sprites for buttons and labels, drawn from text maps ----------
const PX_ICON_COLORS = { U: "#2f68c8", K: "#3a2440", w: "#efe6ff", W: "#ffffff", l: "#ad91e6", L: "#d2bfff", p: "#6b4fa8", d: "#3d2866", k: "#160c26", g: "#eec26a", G: "#fff0b5", o: "#c98f3a", b: "#946027", B: "#5e3a1c", r: "#e88bb1", R: "#c25586", s: "#e4dfe8", S: "#8a8494", z: "#5d5666", t: "#69b7d6", T: "#3383a8", m: "#57ad6a", e: "#e0634f", E: "#b8323b" };
const PX_ICON_MAPS = {
  lantern: ["....zzzz....", "...z....z...", "....SSSS....", "...SzzzzS...", "...sGGGGs...", "...sGWWGs...", "...sGWgGs...", "...sGggGs...", "...sGGGGs...", "...SzzzzS...", "....SSSS....", "............"],
  barFirefly: ["............", "............", "...BBBBBB...", "..BbbbbbbB..", "..BbGbbbbB..", "..BbbbbbbB..", "..BbbbbbbB..", "..BbbbbGbB..", "..BbbbbbbB..", "...BBBBBB...", "............", "............"],
  barNut: ["............", "............", "............", "rr........rr", ".rRRRRRRRRr.", ".RoobobobbR.", ".RbobbobobR.", ".rRRRRRRRRr.", "rr........rr", "............", "............", "............"],
  barStar: ["............", "............", "............", "tt........tt", ".tTTTTgTTTt.", ".TTTTgGgTTT.", ".TTTTTgTTTT.", ".tTTTTTTTTt.", "tt........tt", "............", "............", "............"],
  hammer: ["............", ".zSSSSSSSSz.", ".SswssssssS.", ".SsssssssSS.", ".zSSSSSSSSz.", ".....ob.....", ".....ob.....", ".....ob.....", ".....ob.....", ".....ob.....", ".....bB.....", "............"],
  eye: ["............", "............", "....ssss....", "..ssssssss..", ".sssTTTTsss.", "ssssTkkTssss", "ssssTkWTssss", ".sssTTTTsss.", "..ssssssss..", "....ssss....", "............", "............"],
  bell: [".....bb.....", ".....gg.....", "....gGgg....", "...gGgggo...", "...gGgggo...", "...gGgggo...", "..gGggggoo..", "..gGggggoo..", ".ggggggggoo.", ".oooooooooo.", ".....bb.....", "............"],
  pouch: ["............", "...b....b...", "....bbbb....", "....rrrr....", "...rRRRRr...", "..rrrrrrRR..", "..rrgGrrRR..", "..rGWGrrRR..", "..rrgGrrRR..", "..rrrrrRRR..", "...RRRRRR...", "............"],
  cookie: ["............", "....oooo....", "...oggggo...", "..oggBgggo..", "..ogggggBo..", "..oBgggggo..", "..oggggBgo..", "..ogBggggo..", "...oggggo...", "....oooo....", "............", "............"],
  sparkle: [".....W......", ".....G......", "....GWG.....", "..GGWWWGG...", "....GWG.....", ".....G......", ".....W..W...", "........G...", ".......GWG..", "........G...", "............", "............"],
  moon: ["............", "....GGGG....", "...GGg......", "..GGg.......", "..GGg.......", "..GGg.......", "..GGgg......", "...GGgggg...", "....GGGGGg..", "............", "............", "............"],
  sun: ["............", ".g...g...g..", "..g.ggg.g...", "...gGGGg....", "..gGGWGGg...", "gggGWWGGggg.", "..gGGGGGg...", "...gGGGg....", "..g.ggg.g...", ".g...g...g..", "............", "............"],
  candle: [".....g......", "....gGg.....", "....gWg.....", ".....o......", "....wws.....", "....wws.....", "....wws.....", "....wws.....", "...SSSSS....", "..SzzzzzS...", "............", "............"],
  heart: ["............", "..RR...RR...", ".RrrR.RrrR..", ".RrWrRrrrR..", ".RrrrrrrrR..", "..RrrrrrR...", "...RrrrR....", "....RrR.....", ".....R......", "............", "............", "............"],
  star: [".....g......", ".....g......", "....gGg.....", "ggggGWGgggg.", ".gGGGGGGGg..", "..gGGGGGg...", "..gGGgGGg...", ".gGg...gGg..", ".g.......g..", "............", "............", "............"],
  shard: ["............", "....LLLL....", "...LWLLlp...", "..LWLLLlpp..", "..ppppppppd.", "...pppppdd..", "....ppppd...", ".....ppd....", "......d.....", "............", "............", "............"],
  sound: ["............", "....s....l..", "...ss..l..l.", ".ssss...l.l.", ".ssss...l.l.", ".ssss...l.l.", "...ss..l..l.", "....s....l..", "............", "............", "............", "............"],
  mute: ["............", "....s.......", "...ss.......", ".ssss.e...e.", ".ssss..e.e..", ".ssss...e...", ".ssss..e.e..", "...ss.e...e.", "....s.......", "............", "............", "............"],
  scroll: ["............", ".ooooooooo..", "oGGGGGGGGGo.", ".oGzzzzzGo..", ".oGGGGGGGo..", ".oGzzzzGGo..", ".oGGGGGGGo..", ".oGzzzzzGo..", "oGGGGGGGGGo.", ".ooooooooo..", "............", "............"],
  close: ["............", "..ss....ss..", "...ss..ss...", "....ssss....", ".....ss.....", "....ssss....", "...ss..ss...", "..ss....ss..", "............", "............", "............", "............"],
  grotto: ["............", "...dddddd...", "..ddppppdd..", ".ddpkkkkpdd.", ".dpkkkkkkpd.", ".dpkkLkkkpd.", ".dpkLWLkkpd.", ".dpkLLLkkpd.", ".dpkLLLLkpd.", "dddddddddddd", "............", "............"],
  nest: ["............", "....sss.....", "...sswss....", "...sssss....", "..bsssSsb...", ".bobobobobo.", ".obobobobob.", "..bobobobo..", "...BBBBBB...", "............", "............", "............"],
  book: ["............", ".RRRRRRRRR..", ".RrrrrrrrRs.", ".RrGGGGGrRs.", ".RrrrrrrrRs.", ".RrrrGrrrRs.", ".RrrrrrrrRs.", ".RrrrrrrrRs.", ".RRRRRRRRRs.", "..ssssssss..", "............", "............"],
  duo: ["............", "...r....t...", "..rrr..ttt..", ".rrrrrtttt..", ".rkrkrtktkt.", ".rrrrrtttt..", "..rrr..ttt..", "............", "............", "............", "............", "............"],
  postcard: ["............", "............", ".wwwwwwwwww.", ".Swwwwwwwws.", ".sSwwwwwwSs.", ".ssSwwwwSss.", ".sssSRRSsss.", ".ssssRRssss.", ".ssssssssss.", "............", "............", "............"],
  lock: ["............", "....SSSS....", "...S....S...", "...S....S...", "..gggggggg..", "..gGGGGGgo..", "..gGGkkGgo..", "..gGGkkGgo..", "..ggggggoo..", "..oooooooo..", "............", "............"],
  egg: ["....ssss....", "...swwsss...", "..swwsssss..", "..swssssSs..", ".ssssksssSs.", ".sssskksSSs.", ".ssssssksSs.", ".sssssksSSs.", ".sssssSSSSs.", "..sssSSSSs..", "...SSSSSS...", "............"],
  tasks: ["............", "..wwwwwww...", "..wSSSSSw...", "..wwwwwww...", "..wSSSSSw...", "..wwwwwww..m", "..wSSSSSw.mm", "..wwwwwwwmm.", "..wSSSSmmm..", "..wwwwwwmw..", "............", "............"],
  gear: ["............", ".....ss.....", "..s.sSSs.s..", "..sSSSSSSs..", "...SSzzSS...", ".sSSz..zSSs.", ".sSSz..zSSs.", "...SSzzSS...", "..sSSSSSSs..", "..s.sSSs.s..", ".....ss.....", "............"],
  flaguk: ["............", "............", "UUUUUUUUUUUU", "UUUUUUUUUUUU", "UUUUUUUUUUUU", "UUUUUUUUUUUU", "gggggggggggg", "gggggggggggg", "gggggggggggg", "gggggggggggg", "............", "............"],
  flagen: ["............", "............", "wwTTwEEwTTww", "TwwTwEEwTwwT", "wwwwwEEwwwww", "EEEEEEEEEEEE", "EEEEEEEEEEEE", "wwwwwEEwwwww", "TwwTwEEwTwwT", "wwTTwEEwTTww", "............", "............"],
  help: ["............", "....gggg....", "...gGGGGg...", "..gGo..oGg..", "..oo...gGo..", "......gGo...", ".....gGo....", ".....gGo....", "......o.....", ".....gg.....", ".....oo.....", "............"],
  mossa: [
    "....mmmmmmmm....",
    "..mmmmmmmGmmmm..",
    ".mmmmmmmGgGmmmm.",
    ".mmsmmmmmGmmsmm.",
    "mmsssmmmmmmsssmm",
    "sWsssssssssssssS",
    "sWsssssssssssssS",
    "sssskksssskksssS",
    "ssskssksskssksSS",
    "ssrrssssssssrrSS",
    "ssssssksskssssSS",
    "sssssssKKsssssSS",
    "SsssssssssssssSz",
    ".SSssssssssssSz.",
    "..zSSSSSSSSSSz..",
    "....zzzzzzzz....",
  ],
  wick: [
    "................",
    "...B........B...",
    "....B......B....",
    ".....oooooo.....",
    "bbb.oggggggo.bbb",
    "bggboWkggWkobggb",
    "bgGgorggggrobGgb",
    "bggboggKKggobggb",
    ".bgboggggggobgb.",
    "..bbooggggoobb..",
    ".....oggggo.....",
    ".....obbbbo.....",
    "......oggo......",
    ".......oo.......",
    "......zGGz......",
    "......zGWz......",
  ],
  gloom: [
    "................",
    "......kkkk......",
    "....kkKKKKkk....",
    "...kKKddddKKk...",
    "..kKddddddddKk..",
    ".kKddeEddeEddKk.",
    ".kKdddEdddEddKk.",
    ".kKddddddddddKk.",
    ".kKdddkkkkdddKk.",
    "..kKddkdkdddKk..",
    "..kKKdddddddKk..",
    "...kKKdddddKk...",
    "..k.kKKdddKKk.k.",
    ".k...kKKdKKk...k",
    "......kKKKk.....",
    ".......kKk......",
  ],
  dorma: [
    "............WW..",
    "..........TTWW..",
    "........TTTT....",
    "......tTTTT.....",
    "....ttTTTTT.....",
    "..lttttttttttl..",
    ".lLllllllllllpl.",
    ".lssssllllssssp.",
    ".lskksllllskksp.",
    ".lsssslgglssssp.",
    ".lrlllloollllrp.",
    "..lLsssssssslp..",
    "..lssssssssspp..",
    "...ppsssssspp...",
    "....gg....gg....",
    "................",
  ],
  fennel: [
    "................",
    "....oooooooo....",
    "..oGGGGGGGGGGo..",
    "..oooooooooooo..",
    "...mmmmmmmmmm...",
    "..mgWkmmmmgWkm..",
    "..mggkmmmmggkm..",
    ".mmmmmmmmmmmmmm.",
    ".mmmrmmmmmmrmmm.",
    ".mmmkkkkkkkkmmm.",
    "..mmmmmmmmmmmm..",
    "..mmwwwwwwwwmm..",
    ".mm.wwwwwwww.mm.",
    "....mm....mm....",
    "...mmm....mmm...",
    "................",
  ],
  tansy: [
    "...B..B..B..B...",
    "..BbBBbBBbBBbB..",
    ".BbbbbbbbbbbbbB.",
    "BbbbwwwwwwwwbbbB",
    "BbbwwwwwwwwwwbbB",
    "BbwwkWwwwwkWwwbB",
    "BbwwkkwwwwkkwwbB",
    "BbwrwwwwwwwwrwbB",
    ".BwwwwwRRwwwwwB.",
    "..BwwwwwwwwwwB..",
    "..mmmmmmmmmmmm..",
    ".wmmmGmmmmmmmmw.",
    "..mmmmmmmmmmmm..",
    "..mmmmmmmmmmmm..",
    "...bb......bb...",
    "................",
  ],
  ember: [
    "................",
    ".....eeeeee.....",
    "....eeeeeeee....",
    "...eeWkeeWkee...",
    "...eekkeekkee...",
    "...eeeeeeeeee...",
    "....eeEEEEee....",
    ".....eeeeee.....",
    "...BBBBBBBBBB...",
    "..eBBBBBBBBBBe..",
    ".ee.BBBgBBBB.ss.",
    ".e..BBBBBBBB.oS.",
    "....BBBBBBBB.o..",
    "....ee....ee.o..",
    "...eee....eee.eE",
    "...........eeEE.",
  ],
  pip: [
    "................",
    ".....oooooo.....",
    "....oooooooo....",
    "..ogggggggggggo.",
    "..oooooooooooo..",
    "....dddddddd....",
    "...ddkddddkdd...",
    "...ddddrrdddd...",
    "...dddrRRrddd...",
    "....dddddddd....",
    "..BbbmmmmmmbbB..",
    ".rdBbmmmmmmbBdr.",
    "...BbmmmmmmbB...",
    "....dddddddd....",
    "....rr....rr....",
    "................",
  ],
  ollo: [
    "...p........p...",
    "...pp......pp...",
    "...llllllllll...",
    "..lLLLLLLLLLLl..",
    "..lTTTlllTTTll..",
    "..TtWtTlTtWtTl..",
    "..TtktTlTtktTl..",
    "..lTTTlggTTTll..",
    "..lllllgllllll..",
    "..wWWWlllWWWWw..",
    ".lwWWWWWWWWWWwl.",
    ".lwWWWWsWWWWWwl.",
    "..wWWWWWWWWWWw..",
    "..wWWWWsWWWWWw..",
    "....gg....gg....",
    "................",
  ],
  trophy: ["............", "..AAAAAAAB..", ".CABBBBBBBC.", "C.ABBBBBBB.C", "C.ABBBBBBB.C", ".CABBBBBBC..", "...ABBBBC...", "....ABBC....", ".....BC.....", "....ABBC....", "...ACCCCC...", "............"],
  chest: ["............", "...bbbbbb...", "..bobooobb..", ".booooooobB.", ".BBBBBBBBBB.", ".bobogGobbB.", ".booogGoobB.", ".bobooooobB.", ".boooooooBB.", ".BBBBBBBBBB.", "............", "............"],
  map: ["............", ".ssssssssss.", ".swwwwwwwwS.", ".swwmmwwewS.", ".swmmwweewS.", ".swwwweewwS.", ".swwweewwwS.", ".swweewwtwS.", ".swewwwttwS.", ".swwwwwwwwS.", ".SSSSSSSSSS.", "............"],
  stall: ["............", ".rWrWrWrWrW.", ".rWrWrWrWrW.", "..RRRRRRRR..", "..b......b..", "..b.gG.e.b..", "..b.gg.E.b..", ".BBBBBBBBBB.", ".boooooooob.", ".boooooooob.", ".BBBBBBBBBB.", "............"],
  flask: ["............", "....SSSS....", ".....ss.....", ".....ss.....", ".....ss.....", "....sttS....", "...stTttS...", "..stTtWttS..", "..sttTtttS..", "..sTttttTS..", "...SSSSSS...", "............"],
  compass: ["............", "....ssss....", "..ssSSSSss..", ".sSw.e..wSs.", ".sS..e...Ss.", ".sS.eWe..Ss.", ".sS..t...Ss.", ".sSw.t..wSs.", "..ssSSSSss..", "....ssss....", "............", "............"],
  broom: ["........b...", ".......b....", "......b.....", ".....b......", "....b.......", "...gg.......", "..gGgg......", ".gGgggo.....", "gGgggo......", ".gggo.......", "............", "............"],
};
// the trophy in each award's metal: bronze, silver, amethyst and gold
for (const [tier, [a, b, c]] of Object.entries({ common: "obB", rare: "sSz", epic: "Llp", legendary: "Ggo" }))
  PX_ICON_MAPS["trophy_" + tier] = PX_ICON_MAPS.trophy.map(r => r.replace(/A/g, a).replace(/B/g, b).replace(/C/g, c));
const pxIconCache = {};
/** A pixel icon as a data URL: the map drawn 1:1 with a dark outline around it. */
function pxIcon(name) {
  if (pxIconCache[name]) return pxIconCache[name];
  const map = PX_ICON_MAPS[name];
  if (!map) return "";
  const S = map[0].length + 2, c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d"), im = g.createImageData(S, S), d = im.data, solid = new Uint8Array(S * S);
  const put = (x, y, rgb) => { const i = (y * S + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255; };
  map.forEach((row, y) => [...row].forEach((ch, x) => { const col = PX_ICON_COLORS[ch]; if (col) { solid[(y + 1) * S + x + 1] = 1; put(x + 1, y + 1, pxHex(col)); } }));
  const ink = pxHex("#160c26");
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (solid[y * S + x]) continue;
    if ((x > 0 && solid[y * S + x - 1]) || (x < S - 1 && solid[y * S + x + 1]) || (y > 0 && solid[(y - 1) * S + x]) || (y < S - 1 && solid[(y + 1) * S + x])) put(x, y, ink);
  }
  g.putImageData(im, 0, 0);
  return pxIconCache[name] = c.toDataURL();
}
const ic = (name, cls = "") => `<i class="ic${cls ? " " + cls : ""}" style="background-image:url(${pxIcon(name)})" aria-hidden="true"></i>`;

// one small cave banner per chapter, in that chapter's crystal
const CHAPTER_ART = [
  { seed: 3, wall: ["#07051a", "#120c33", "#21174f", "#33256f", "#463592"], crystal: ["#2a1d63", "#5b3fb0", "#9a7ce6", "#c9b8ff", "#f2ecff"], glow: "#b48cff" },
  { seed: 11, wall: ["#040c20", "#0b1a3a", "#142b58", "#1f4078", "#2f5a9a"], crystal: ["#1d3f75", "#3f78b8", "#7fb8e6", "#bfe4fb", "#f0fbff"], glow: "#8fd8ef", pool: ["#0b1a3a", "#1f4078", "#5d9bd0", "#bfe4fb"] },
  { seed: 23, wall: ["#020d08", "#06201a", "#0c3a29", "#16573c", "#257a52"], crystal: ["#0e3d2a", "#1f7a52", "#3fb07a", "#8fe0b0", "#e0fff0"], glow: "#7fe0a8", bands: true },
  { seed: 37, wall: ["#05060b", "#0e111c", "#1a2030", "#283247", "#3a4862"], crystal: ["#1a2433", "#2f4a66", "#4f7fa3", "#9fd0e6", "#f4f7ff"], glow: "#7fd8c0", flash: ["#1f5f8f", "#2fa3b8", "#7fd8c0", "#e8d27a"] },
  { seed: 43, wall: ["#0b0f1e", "#0f2f4a", "#1d5276", "#3383a8", "#69b7d6"], crystal: ["#1d5276", "#3383a8", "#69b7d6", "#b8e6f5", "#ffffff"], glow: "#b8e6f5", pool: ["#0f2f4a", "#1d5276", "#69b7d6", "#ffffff"] },
];
const chapterArtCache = [];
function chapterArt(ci) {
  if (chapterArtCache[ci]) return chapterArtCache[ci];
  const th = CHAPTER_ART[ci % CHAPTER_ART.length];
  const c = pixelCave({ ...th, wall: th.wall.map(pxHex), crystal: th.crystal.map(pxHex), glow: pxHex(th.glow), pool: th.pool?.map(pxHex), flash: th.flash?.map(pxHex) }, 160, 96, { floorY: 88, crystals: 12, ly: 60 });
  return (chapterArtCache[ci] = c.toDataURL());
}

/** A dithered crystal cave on a W×H canvas. Ramps are [r,g,b] lists; the floor sits at floorY, lit from (lx, ly). */
function pixelCave(th, W, H, { floorY = H - 8, lx, ly = H * .62, crystals = 16, reach = 1, girth = 1, spill = .22, keepClear = 0 } = {}) {
  const seed = th.seed, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"), img = g.createImageData(W, H), d = img.data;
  const { wall, crystal: crys, glow, pool, flash } = th;
  const floor = x => floorY - 3 * pxNoise(x * .07, seed) - 2 * Math.sin(x * .05 + seed);
  const ceil = x => 3 + 4 * pxNoise(x * .09, seed + 1);
  // crystal points: [x, base, height, half width, up?]
  const pts = [];
  // keepClear leaves the middle open, so a glowling or a title can stand there
  const spot = (i, k) => { const x = Math.floor(pxHash(i, k) * (W - 2 * keepClear)); return keepClear && x >= W / 2 - keepClear ? x + 2 * keepClear : x; };
  for (let i = 0; i < crystals; i++) { const x = spot(i, seed); pts.push([x, floor(x) + 2, (7 + pxHash(i, seed + 2) * 15) * reach, (1.5 + pxHash(i, seed + 3) * 2.5) * girth, true]); }
  for (let i = 0; i < Math.round(crystals * .55); i++) { const x = spot(i, seed + 5); pts.push([x, ceil(x) - 1, (4 + pxHash(i, seed + 6) * 9) * reach * 0.6, (1 + pxHash(i, seed + 7) * 2) * girth, false]); }
  lx ??= W * (.3 + .4 * pxHash(seed, 9));
  const lr = W * .44, lh = H * .65;
  // per column, worked out once: the floor and ceiling lines, and only the crystals that reach that column (in the same order)
  const floorA = Float32Array.from({ length: W }, (_, x) => floor(x)), ceilA = Float32Array.from({ length: W }, (_, x) => ceil(x));
  const colPts = Array.from({ length: W }, (_, x) => pts.filter(([sx, , , sw]) => Math.abs(x - sx) <= sw + .5));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const light = Math.max(0, 1 - Math.hypot((x - lx) / lr, (y - ly) / lh));
    let col = null, air = false;
    for (const [sx, sb, sh, sw, up] of colPts[x]) {
      const t = up ? (sb - y) / sh : (y - sb) / sh;
      if (t >= 0 && t <= 1 && Math.abs(x - sx) <= sw * (1 - t) + .5) { col = pxPick(crys, (x < sx ? .8 - t * .15 : .4 + t * .15) + light * .25 + pxFbm(x, y) * .08, x, y); break; }
    }
    if (!col) {
      const f = floorA[x];
      if (pool && y >= f - 1 && y < f + 10 && Math.abs(x - lx) < W * .21) col = pxPick(pool, .35 + light * .5 + .2 * Math.sin(x * .9 + y * 3) * (y % 2), x, y);
      else if (y >= f) col = pxPick(wall, .45 - (y - f) / 14 + pxFbm(x * .25, y * .25) * .3 + light * .35, x, y);
      else if (y <= ceilA[x]) col = pxPick(wall, .12 + pxFbm(x * .2, y * .2) * .3, x, y);
      else {
        air = true;
        let v = pxFbm(x * .09 + seed, y * .14) * .35 + light * .55;
        if (th.bands) v = .2 + .25 * (.5 + .5 * Math.sin(pxFbm(x * .04 + seed, y * .07) * 22)) + light * .45;
        col = pxPick(wall, v, x, y);
        if (flash && pxNoise(x * 12 / W + seed, y * 6 / H) > .62) { const fv = pxFbm(x * .05 + seed, y * .11 + 3); if (fv > .6 && fv < .64) col = pxPick(flash, (fv - .6) / .04 * .5 + light * .5, x, y); }
      }
    }
    // a soft spill of light from the hidden geode
    if (air && PX_BAYER[(y & 3) * 4 + (x & 3)] < light ** 3 * spill) col = glow;
    const i = (y * W + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  // a few stars of sparkle on the crystal tips
  for (let i = 0; i < 6; i++) { const [sx, sb, sh, , up] = pts[Math.floor(pxHash(i, seed + 8) * pts.length)], y = Math.round(up ? sb - sh : sb + sh); for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = sx + dx, yy = y + dy; if (x >= 0 && x < W && yy >= 0 && yy < H) { const j = (yy * W + x) * 4; d[j] = d[j + 1] = d[j + 2] = dx || dy ? 200 : 255; } } }
  g.putImageData(img, 0, 0);
  return c;
}
const LEVELS = 24;

// ---------- backdrops: each cave chapter has its own, and three night scenes unlock as you play ----------
const THEMES = [
  { id: "amethyst", name: "Amethyst Hollow", art: 0, how: "", ok: () => true },
  { id: "celestite", name: "Celestite Grotto", art: 1, how: "reach chapter II", ok: () => unlocked(7) },
  { id: "malachite", name: "Malachite Deep", art: 2, how: "reach chapter III", ok: () => unlocked(13) },
  { id: "labradorite", name: "Labradorite Vault", art: 3, how: "reach chapter IV", ok: () => unlocked(19) },
  { id: "churchyard", name: "Moonlit Ruins", how: "open a moon egg", ok: () => !!save.moon },
  { id: "glowcap", name: "Glowcap Wood", how: "collect 30 stars", ok: () => totalStars() >= 30 },
  { id: "abbey", name: "Starfall Abbey", how: "clear all 24 levels", ok: () => unlocked(LEVELS + 1) },
  { id: "frost", name: "Frost Hollow", art: 4, how: "meet 12 kinds of glowling", ok: () => Object.keys(save.seen).length >= 12 },
  { id: "summit", name: "Aurora Summit", how: "raise a glowling to Radiant", ok: () => save.creatures.some(c => c.level >= 15) },
];
const THEME = Object.fromEntries(THEMES.map(t => [t.id, t]));
const CAVE_THEME = ["amethyst", "celestite", "malachite", "labradorite"];

/** Outdoor night scenes: sky, far hills, ground and mist ramps, a moon, and props drawn on top. */
const NIGHT = {
  churchyard: {
    seed: 41, sky: ["#0b0614", "#160c26", "#22143a", "#2e1d4f", "#3d2866"], far: ["#0b0614", "#160c26", "#22143a"],
    ground: ["#0b0614", "#10301f", "#1e5233", "#2f7d4a"], mist: "#523a85", hill: 0.62,
    moon: [0.74, 0.17, 0.09], moonCol: ["#8a6cc9", "#d2bfff", "#efe6ff", "#ffffff"],
  },
  glowcap: {
    seed: 53, sky: ["#0b0614", "#0f2f4a", "#1d5276", "#3383a8"], far: ["#0b0614", "#10301f", "#1e5233"],
    ground: ["#0b0614", "#10301f", "#1e5233", "#2f7d4a", "#57ad6a"], mist: "#69b7d6", hill: 0.6,
    moon: [0.22, 0.13, 0.05], moonCol: ["#69b7d6", "#b8e6f5", "#ffffff"],
  },
  summit: {
    seed: 79, sky: ["#0b0614", "#0f2f4a", "#1d5276", "#3383a8"], far: ["#0f2f4a", "#1d5276", "#3383a8", "#69b7d6"],
    ground: ["#1d5276", "#3383a8", "#69b7d6", "#b8e6f5", "#ffffff"], mist: "#69b7d6", hill: 0.6,
    moon: [0.16, 0.14, 0.04], moonCol: ["#69b7d6", "#b8e6f5", "#ffffff"],
  },
  abbey: {
    seed: 67, sky: ["#160c26", "#2e1d4f", "#5c1f3f", "#8f3460", "#c25586"], far: ["#0b0614", "#160c26", "#22143a"],
    ground: ["#0b0614", "#22143a", "#3a3440", "#5d5666"], mist: "#c25586", hill: 0.66,
    moon: [0.5, 0.1, 0.04], moonCol: ["#eec26a", "#fff0b5", "#ffffff"],
  },
};

/** Paint one night scene on a W×H canvas, then snap every pixel to the palette (no stray in-between colors). */
function pixelNight(id, W, H, floor = 0.86) {
  const T = NIGHT[id], seed = T.seed, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true }), img = g.createImageData(W, H), d = img.data;
  const R = k => T[k].map(pxHex), sky = R("sky"), far = R("far"), ground = R("ground"), moonCol = R("moonCol"), mist = pxHex(T.mist);
  const floorY = Math.round(H * floor);
  // the hills keep their height above the ground wherever the ground line is
  const hill = x => H * (T.hill - 0.86 + floor) - H * 0.07 * pxNoise(x * 0.025, seed) - H * 0.025 * Math.sin(x * 0.03 + seed);
  const gnd = x => floorY - 2 * pxNoise(x * 0.08, seed + 3);
  const mx = W * T.moon[0], my = H * T.moon[1], mr = Math.max(6, Math.min(W, H) * T.moon[2] * 1.6);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let col;
    const gy = gnd(x), hy = hill(x), md = Math.hypot(x - mx, y - my);
    if (y >= gy) col = pxPick(ground, Math.max(0.28, 0.75 - (y - gy) / Math.max(16, (H - gy) * 0.7)) + pxFbm(x * 0.3, y * 0.3) * 0.25, x, y);
    else if (y >= hy) col = pxPick(far, 0.55 - (y - hy) / (gy - hy) * 0.5 + pxFbm(x * 0.1, y * 0.1) * 0.3, x, y);
    else if (md < mr) col = pxPick(moonCol, 0.95 - 0.5 * (md / mr) ** 2 - 0.3 * pxSmooth(0.55, 0.7, pxFbm(x * 0.35 + seed, y * 0.35)), x, y);
    else {
      col = pxPick(sky, y / hy * 0.75 + Math.max(0, 0.35 - (md - mr) / (W * 0.35)), x, y);
      if (pxHash(x, y + seed) > 0.994 && y < hy * 0.8) col = pxHex(pxHash(y, x) > 0.5 ? "#ffffff" : "#d2bfff");
    }
    // a band of low mist lying on the ground
    const m = (y - (floorY - H * 0.1)) / (H * 0.1);
    if (y < gy && m > 0 && PX_BAYER[(y & 3) * 4 + (x & 3)] < m * 0.45 * (0.6 + 0.4 * pxNoise(x * 0.05, seed + 9))) col = mist;
    const i = (y * W + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  NIGHT_PROPS[id](g, W, H, floorY, seed, hill);
  // snap the props' soft edges to the palette
  const out = g.getImageData(0, 0, W, H), o = out.data;
  for (let i = 0; i < o.length; i += 4) {
    const col = PIXEL_PALETTE[PIXEL_LUT[(o[i] >> 3 << 10) | (o[i + 1] >> 3 << 5) | (o[i + 2] >> 3)]];
    o[i] = col[0]; o[i + 1] = col[1]; o[i + 2] = col[2]; o[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}

/** Spots for props: mostly at the sides, so the egg or the nest in the middle stays clear. */
const sideX = (W, i, seed) => { const h = pxHash(i, seed); return h < 0.5 ? h * 0.6 * W : W - (h - 0.5) * 0.6 * W; };
const NIGHT_PROPS = {
  churchyard(g, W, H, fy, seed, hill) {
    // a little chapel on the far hill, one window lit
    const cx = Math.round(W * 0.2), cy = Math.round(hill(W * 0.2)) + 2, cw = Math.max(10, Math.round(W * 0.07));
    g.fillStyle = "#0b0614";
    g.fillRect(cx - cw, cy - cw, cw * 2, cw);
    g.beginPath(); g.moveTo(cx - cw - 1, cy - cw); g.lineTo(cx, cy - cw * 1.7); g.lineTo(cx + cw + 1, cy - cw); g.fill();
    g.fillRect(cx + cw * 0.4, cy - cw * 2.6, Math.max(3, cw * 0.4), cw * 1.6);
    g.beginPath(); g.moveTo(cx + cw * 0.3, cy - cw * 2.6); g.lineTo(cx + cw * 0.6, cy - cw * 3.4); g.lineTo(cx + cw * 0.9, cy - cw * 2.6); g.fill();
    g.fillStyle = "#eec26a"; g.fillRect(cx - 1, cy - cw * 0.75, 3, 4);
    // a bare tree, branching
    const branch = (x, y, a, len, w) => {
      if (len < 2) return;
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      g.strokeStyle = "#0b0614"; g.lineWidth = w; g.lineCap = "round";
      g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      branch(x2, y2, a - 0.45 + pxHash(len, x) * 0.2, len * 0.72, Math.max(1, w * 0.65));
      branch(x2, y2, a + 0.4 + pxHash(x, len) * 0.2, len * 0.66, Math.max(1, w * 0.6));
    };
    branch(W * 0.9, fy + 2, -Math.PI / 2 - 0.12, H * 0.2, 5);
    // the iron fence behind the graves
    const ry = fy - Math.round(H * 0.06);
    g.fillStyle = "#160c26";
    g.fillRect(0, ry, W, 1); g.fillRect(0, ry + Math.round(H * 0.035), W, 1);
    for (let x = 1; x < W; x += 4) { g.fillRect(x, ry - 2, 1, fy - ry + 2); g.fillRect(x - 1, ry - 2, 3, 1); g.fillRect(x, ry - 3, 1, 1); }
    // gravestones and crosses, lit from the moon side
    for (let i = 0; i < 7; i++) {
      const x = Math.round(sideX(W, i, seed)), w = 6 + Math.round(pxHash(i, 3) * 5), h = 9 + Math.round(pxHash(i, 4) * 7), y = fy + 1 + (i % 2);
      if (pxHash(i, 5) < 0.3) {
        g.fillStyle = "#5d5666"; g.fillRect(x - 1, y - h - 2, 3, h + 2); g.fillRect(x - 4, y - h + 1, 9, 3);
        g.fillStyle = "#8a8494"; g.fillRect(x - 1, y - h - 2, 1, h + 2);
        continue;
      }
      g.fillStyle = "#3a3440"; g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x - w / 2, y - h + w / 2); g.arc(x, y - h + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w / 2, y); g.fill();
      g.fillStyle = "#8a8494"; g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x - w / 2, y - h + w / 2); g.arc(x, y - h + w / 2, w / 2, Math.PI, -Math.PI / 2); g.lineTo(x - w / 2 + 2, y - h); g.lineTo(x - w / 2 + 2, y); g.fill();
      g.fillStyle = "#22143a"; g.fillRect(x - 1, y - h + 3, 2, 5); g.fillRect(x - 2, y - h + 4, 4, 1);
      g.fillStyle = "#2f7d4a"; g.fillRect(x - w / 2, y - 2, w * 0.6, 2);
    }
  },
  glowcap(g, W, H, fy, seed) {
    // giant mushrooms with spotted caps; a soft glow under each cap
    const caps = [["#8f3460", "#c25586", "#e88bb1"], ["#1d5276", "#3383a8", "#69b7d6"], ["#5c1f3f", "#8f3460", "#e88bb1"]];
    for (let i = 0; i < 6; i++) {
      const x = Math.round(sideX(W, i, seed)), big = 0.6 + pxHash(i, 2) * 0.6, h = Math.round(Math.min(H * (0.14 + 0.2 * big), fy * (0.18 + 0.22 * big))), r = Math.round(Math.min(W * 0.08 * big + 5, h * 0.45));
      const [dk, md, lt] = caps[i % 3], top = fy - h;
      const glow = g.createRadialGradient(x, top + r * 0.4, 1, x, top + r * 0.4, r * 2.2);
      glow.addColorStop(0, lt + "66"); glow.addColorStop(1, lt + "00");
      g.fillStyle = glow; g.fillRect(x - r * 2.2, top - r * 2, r * 4.4, r * 4.4);
      g.fillStyle = "#b9b3c0"; g.fillRect(x - Math.max(1, r * 0.18), top, Math.max(3, r * 0.36), h + 2);
      g.fillStyle = "#e4dfe8"; g.fillRect(x - Math.max(1, r * 0.18), top, Math.max(1, r * 0.12), h + 2);
      g.fillStyle = dk; g.beginPath(); g.ellipse(x, top + 1, r, r * 0.62, 0, Math.PI, 0); g.fill();
      g.fillStyle = md; g.beginPath(); g.ellipse(x - 1, top, r - 1, r * 0.56, 0, Math.PI, 0); g.fill();
      g.fillStyle = lt; g.beginPath(); g.ellipse(x - r * 0.35, top - r * 0.3, r * 0.3, r * 0.14, 0, 0, TAU); g.fill();
      g.fillStyle = "#efe6ff";
      for (let k = 0; k < 4; k++) g.fillRect(Math.round(x + (pxHash(i, k + 7) - 0.5) * r * 1.3), Math.round(top - r * 0.15 - pxHash(k, i) * r * 0.35), 2, 2);
    }
    // little mushrooms and floating spores
    for (let i = 0; i < 18; i++) {
      const x = Math.round(pxHash(i, seed + 4) * W), y = fy + 1 + Math.round(pxHash(i, 9) * 3);
      g.fillStyle = "#e4dfe8"; g.fillRect(x, y - 3, 1, 3);
      g.fillStyle = i % 2 ? "#e88bb1" : "#eec26a"; g.fillRect(x - 1, y - 4, 3, 1);
    }
    g.fillStyle = "#fff0b5";
    for (let i = 0; i < 26; i++) g.fillRect(Math.round(pxHash(i, seed + 11) * W), Math.round(H * 0.2 + pxHash(seed, i) * H * 0.6), 1, 1);
  },
  summit(g, W, H, fy, seed) {
    // northern lights: curtains of green with a pink hem, rippling across the upper sky
    for (let x = 0; x < W; x++) {
      const base = H * (0.22 + 0.07 * Math.sin(x * 0.035 + seed)) , len = H * (0.12 + 0.08 * pxNoise(x * 0.06, seed));
      for (let y = Math.round(base - len); y < base + 4; y++) {
        const k = 1 - Math.abs(y - (base - len * 0.4)) / (len * 0.8);
        if (k > 0 && PX_BAYER[(y & 3) * 4 + (x & 3)] < k * 0.6 * (0.6 + 0.4 * Math.sin(x * 0.2 + y * 0.04))) { g.fillStyle = y < base - len * 0.6 ? "#c25586" : k > 0.65 ? "#a3dd9b" : "#57ad6a"; g.fillRect(x, y, 1, 1); }
      }
    }
    // sharp peaks with snow on their tops, two ranges
    // (their feet stand on the ground line, wherever the room puts it)
    for (const [lift, amp, cols, n] of [[0.08, 0.3, ["#1d5276", "#3383a8", "#b8e6f5", "#ffffff"], 6], [0, 0.16, ["#0f2f4a", "#1d5276", "#69b7d6", "#b8e6f5"], 8]]) {
      const baseK = fy / H - lift;
      const peaks = Array.from({ length: n }, (_, i) => ({ x: (i + 0.2 + pxHash(i, n + seed) * 0.6) * W / (n - 0.8) - 10, h: 0.45 + pxHash(n, i + seed) * 0.55, w: W * (0.08 + pxHash(i, 3) * 0.06) }));
      for (let x = 0; x < W; x++) {
        const ridge = H * baseK - H * amp * Math.max(...peaks.map(p => p.h * Math.max(0, 1 - Math.abs(x - p.x) / p.w))), slopeLeft = Math.max(...peaks.map(p => p.h * Math.max(0, 1 - Math.abs(x + 1 - p.x) / p.w))) > Math.max(...peaks.map(p => p.h * Math.max(0, 1 - Math.abs(x - p.x) / p.w)));
        for (let y = Math.max(0, Math.round(ridge)); y < fy; y++) {
          const snow = y - ridge < 4 + 3 * pxNoise(x * 0.3, y * 0.1) && ridge < H * (baseK - amp * 0.45);
          g.fillStyle = snow ? (slopeLeft ? cols[2] : cols[3]) : (slopeLeft ? cols[0] : cols[1]);
          g.fillRect(x, y, 1, 1);
        }
      }
    }
  },
  abbey(g, W, H, fy, seed) {
    // ruined gothic walls with pointed windows, and a great rose window glowing in the middle
    const stone = "#3a3440", lit = "#5d5666", dark = "#22143a";
    const wall = (x, w, h) => {
      g.fillStyle = stone; g.fillRect(x, fy - h, w, h + 2);
      g.fillStyle = lit; g.fillRect(x, fy - h, 2, h + 2);
      // broken top edge
      g.fillStyle = "#2e1d4f";
      for (let k = 0; k < w; k += 3) { const cut = Math.round(pxHash(k, x) * 6); g.fillRect(x + k, fy - h, 3, cut); }
      // pointed windows showing the sky
      for (let k = 6; k + 6 < w; k += 12) {
        const wx = x + k, wy = fy - h * 0.75, ww = 6, wh = h * 0.45;
        g.fillStyle = "#8f3460"; g.fillRect(wx, wy, ww, wh);
        g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx + ww / 2, wy - ww); g.lineTo(wx + ww, wy); g.fill();
        g.fillStyle = dark; g.fillRect(wx + ww / 2 - 0.5, wy - ww + 2, 1, wh + ww - 2);
      }
      // ivy
      g.fillStyle = "#2f7d4a";
      for (let k = 0; k < w * 1.2; k++) g.fillRect(x + Math.round(pxHash(k, seed) * w), fy - Math.round(pxHash(seed, k) * h * 0.7), 1 + (k % 2), 1);
    };
    wall(0, Math.round(W * 0.3), Math.round(H * 0.34));
    wall(Math.round(W * 0.72), Math.round(W * 0.3), Math.round(H * 0.28));
    // the rose window: rings of colored glass with stone spokes
    const rx = W / 2, ry = H * 0.4, rr = Math.round(Math.min(W, H) * 0.2);
    g.fillStyle = stone; g.beginPath(); g.arc(rx, ry, rr + 3, 0, TAU); g.fill();
    const glass = ["#eec26a", "#c25586", "#3383a8", "#8a6cc9", "#fff0b5"];
    for (let ring = 4; ring >= 0; ring--) {
      const r0 = rr * (ring + 1) / 5;
      for (let k = 0; k < 12; k++) {
        g.fillStyle = glass[(k + ring) % glass.length];
        g.beginPath(); g.moveTo(rx, ry); g.arc(rx, ry, r0, k / 12 * TAU, (k + 1) / 12 * TAU); g.fill();
      }
    }
    g.strokeStyle = "#22143a"; g.lineWidth = 1;
    for (let k = 0; k < 12; k++) { g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx + Math.cos(k / 12 * TAU) * rr, ry + Math.sin(k / 12 * TAU) * rr); g.stroke(); }
    for (const f of [0.45, 0.8, 1]) { g.beginPath(); g.arc(rx, ry, rr * f, 0, TAU); g.stroke(); }
    // falling stars
    g.fillStyle = "#fff0b5";
    for (let i = 0; i < 4; i++) { const x = Math.round(pxHash(i, seed + 2) * W), y = Math.round(pxHash(seed, i + 3) * H * 0.3); for (let k = 0; k < 6; k++) g.fillRect(x - k, y - k, 1, 1); g.fillStyle = "#ffffff"; g.fillRect(x, y, 2, 2); g.fillStyle = "#fff0b5"; }
  },
};

/** The backdrop for a theme at the size of the screen's art grid. */
/** A backdrop; `floor` is where its ground line sits (a share of the height), so the nest can stand on it. */
function paintTheme(id, w, h, floor = 0.86) {
  const t = THEME[id] || THEME.amethyst;
  if (t.art === undefined) return pixelNight(t.id, w, h, floor);
  const a = CHAPTER_ART[t.art];
  const th = { seed: 5 + t.art * 7, wall: a.wall.map(pxHex), crystal: a.crystal.map(pxHex), glow: pxHex(a.glow), pool: a.pool?.map(pxHex), flash: a.flash?.map(pxHex), bands: a.bands };
  const c = pixelCave(th, w, h, { floorY: Math.round(h * floor), lx: w / 2, ly: h * 0.55, crystals: Math.round(w / 12), reach: h / 150, girth: 1.6, spill: 0.04, keepClear: Math.round(w * 0.32) });
  // cobwebs in the top corners
  const o = c.getContext("2d");
  o.strokeStyle = "rgba(228,223,232,.32)"; o.lineWidth = 1;
  for (const [cx, sx] of [[0, 1], [w, -1]]) {
    const r = Math.min(w, h) * 0.16;
    for (let i = 0; i <= 4; i++) { const an = i / 4 * Math.PI / 2; o.beginPath(); o.moveTo(cx + 0.5, 0.5); o.lineTo(cx + sx * Math.cos(an) * r, Math.sin(an) * r); o.stroke(); }
    for (const f of [0.35, 0.6, 0.85]) {
      o.beginPath();
      for (let i = 0; i <= 4; i++) { const an = i / 4 * Math.PI / 2, rr = r * f * (i % 2 ? 0.9 : 1); const x = cx + sx * Math.cos(an) * rr, y = Math.sin(an) * rr; i ? o.lineTo(x, y) : o.moveTo(x, y); }
      o.stroke();
    }
  }
  return c;
}

const themeThumbs = {};
const themeThumb = id => themeThumbs[id] || (themeThumbs[id] = paintTheme(id, 96, 64).toDataURL());

/** Newly reached backdrops get a little announcement, once. */
function checkThemes(quiet = false) {
  save.themesSeen = save.themesSeen || [];
  const fresh = THEMES.filter(t => t.ok() && !save.themesSeen.includes(t.id));
  if (!fresh.length) return;
  save.themesSeen.push(...fresh.map(t => t.id));
  persist();
  const shown = fresh.filter(t => t.id !== "amethyst");
  if (!quiet && shown.length) setTimeout(() => toast(tr("New backdrop: {0} · choose it in the Chest ✦", shown.map(t => t.name).join(", "))), 1600);
}

/** How hard an egg is: tougher stone deeper in the grotto, and a weak spot that glows less and less. */
function levelConf(n) {
  const wander = n === 0, step = wander ? LEVELS : n, cave = wander ? 3 : Math.floor((n - 1) / 6);
  return {
    n, wander, cave, step,
    hp: Math.round(8 + step * 1.4 + cave * 2),
    spotGlow: step < 4 ? 1 : step < 10 ? 0.45 : step < 18 ? 0.2 : 0,
    rare: [0.08, 0.25, 0.45, 0.5][cave], legendary: [0, 0.03, 0.08, 0.15][cave],
  };
}
