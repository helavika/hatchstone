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

// Rust, drawn as the Gloom's opposite: where the Gloom is soft, round, violet and many-eyed, Rust is hard, flaking and angular,
// a dry oxide red-brown gone grey with age, with green verdigris in its seams and cold steel where a flake has just come away.
// It never has eyes. Kept dull and dark on purpose, so it can't be mistaken for the Heartlight's gold or a reward's orange.
const PX_RUST = {
  u0: "#191514", u1: "#2b221f", u2: "#41302a", u3: "#5c4034", u4: "#957060", // oxide, darkest to a dusty flake
  cold: "#8d9aa2", vg0: "#2c4f49", vg1: "#4f8478",                              // a cold bare edge; verdigris, dark and light
};

// ---------- pixel icons: little sprites for buttons and labels, drawn from text maps ----------
const PX_ICON_COLORS = { U: "#2f68c8", K: "#3a2440", w: "#efe6ff", W: "#ffffff", l: "#ad91e6", L: "#d2bfff", p: "#6b4fa8", d: "#3d2866", k: "#160c26", g: "#eec26a", G: "#fff0b5", o: "#c98f3a", b: "#946027", B: "#5e3a1c", r: "#e88bb1", R: "#c25586", s: "#e4dfe8", S: "#8a8494", z: "#5d5666", t: "#69b7d6", T: "#3383a8", m: "#57ad6a", M: "#a3dd9b", e: "#e0634f", E: "#b8323b" };
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
  sprout: ["............", "......mmmm..", ".mmm..mMmmm.", "mmMmm.mmmm..", ".mmmmm.m....", "....mm.m....", "......m.....", "......m.....", "..bbbbbbbb..", ".boBboobBob.", ".BBBBBBBBBB.", "............"],
  heart: ["............", "..RR...RR...", ".RrrR.RrrR..", ".RrWrRrrrR..", ".RrrrrrrrR..", "..RrrrrrR...", "...RrrrR....", "....RrR.....", ".....R......", "............", "............", "............"],
  star: [".....g......", ".....g......", "....gGg.....", "ggggGWGgggg.", ".gGGGGGGGg..", "..gGGGGGg...", "..gGGgGGg...", ".gGg...gGg..", ".g.......g..", "............", "............", "............"],
  shard: ["............", "....LLLL....", "...LWLLlp...", "..LWLLLlpp..", "..ppppppppd.", "...pppppdd..", "....ppppd...", ".....ppd....", "......d.....", "............", "............", "............"],
  sound: ["............", "....s....l..", "...ss..l..l.", ".ssss...l.l.", ".ssss...l.l.", ".ssss...l.l.", "...ss..l..l.", "....s....l..", "............", "............", "............", "............"],
  mute: ["............", "....s.......", "...ss.......", ".ssss.e...e.", ".ssss..e.e..", ".ssss...e...", ".ssss..e.e..", "...ss.e...e.", "....s.......", "............", "............", "............"],
  scroll: ["............", ".ooooooooo..", "oGGGGGGGGGo.", ".oGzzzzzGo..", ".oGGGGGGGo..", ".oGzzzzGGo..", ".oGGGGGGGo..", ".oGzzzzzGo..", "oGGGGGGGGGo.", ".ooooooooo..", "............", "............"],
  left: ["............", ".......s....", "......ss....", ".....sss....", "....ssss....", "...sssss....", "....ssss....", ".....sss....", "......ss....", ".......s....", "............", "............"],
  right: ["............", "....s.......", "....ss......", "....sss.....", "....ssss....", "....sssss...", "....ssss....", "....sss.....", "....ss......", "....s.......", "............", "............"],
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
    "...oo......oo...",
    "..o..o....o..o..",
    "......o..o......",
    ".....GGGGGG.....",
    "....GGGGGGGG....",
    "...GGGGGGGGGg...",
    "...GGWkGGWkGg...",
    "...GGkkGGkkGg...",
    ".BbrrGGGGGGrrbB.",
    ".BbbbGGooGGbbbB.",
    "BbbbbGGGGGGoobbB",
    "BbGbbgGGGGBWWBbB",
    "BbGbbgggggBGGBbB",
    "BbbbgggggggoobbB",
    ".BbbbggggggbbbB.",
    ".....gggggg.....",
  ],
  gloom: [
    "...L.LLL.LL.L...",
    "..L..........L..",
    ".L....kkkk....L.",
    "L...kkKKKKkk....",
    "...kKKssssKKk..L",
    "L..kKsWWlWsKk...",
    "...kKWkWlWkKk..L",
    ".L.kKWkWWkWKk.L.",
    "...kKsWWkWWKk...",
    "...kKKsWkWsKk...",
    "..kkKKKsssKKkk..",
    ".kkKKKKKKKKKKkk.",
    "kkKKdKKKKKKdKKkk",
    "kKKd.dKKKKd.dKKk",
    "kKd...dKKd...dKk",
    "kd.....dd.....dk",
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
  gift: ["............", "..gg....gg..", ".gGGg..gGGg.", "..gGGggGGg..", ".RRRRggRRRR.", ".RrrrgGrrrR.", ".RrrrgGrrrR.", ".RrWrgGrrrR.", ".RrrrgGrrrR.", ".RrrrgGrrrR.", ".RRRRggRRRR.", "............"],
  broom: ["........b...", ".......b....", "......b.....", ".....b......", "....b.......", "...gg.......", "..gGgg......", ".gGgggo.....", "gGgggo......", ".gggo.......", "............", "............"],
  // a geode left mid-crack, waiting by its level on the map: grey stone, a crack, the crystal showing through
  stoneWait: ["............", "....SSSS....", "...SssssS...", "..SswsskS...", "..SswskLSS..", ".SsssklsSSz.", ".SssskLkSSz.", ".SsssslkSSz.", "..SsssskSz..", "..zSSSSSzz..", "...zzzzzz...", "............"],
  // for the Book's tabs: a glowling, and a mossy stone face for the folk
  glowling: ["............", "..L......L..", "...l....l...", "...llllll...", "..lLLllllp..", ".lLlllllllp.", ".llkllllklp.", ".lrlllllrlp.", ".llllllllpp.", "..llllllpp..", "...pppppp...", "............"],
  folk: ["............", "...mmmmmm...", "..mMmmmmmm..", ".mmmmsmmsmm.", ".msssssssss.", ".sWsssssssS.", ".sskssskssS.", ".sskssskssS.", ".srsskssrsS.", ".SsssssssSz.", "..SSSSSSSz..", "............"],
  // the chest standing open with nothing in it, for an empty shelf
  chestOpen: [
    "................",
    "....oooooooo....",
    "...boBBBBBBob...",
    "...bBddddddBb...",
    "..bBddddddddBb..",
    "..bBddddddddBb..",
    "..bBBBBBBBBBBb..",
    ".BBkkkkkkkkkkBB.",
    ".BkkkkkkkkkkkkB.",
    ".BkkKKKKKKKKkkB.",
    ".bbbbbbGGbbbbbB.",
    ".bobooogGooobbB.",
    ".boooooooooobbB.",
    ".bobooooooooobB.",
    ".BBBBBBBBBBBBBB.",
    "................",
  ],
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

// ---------- portraits: the faces of those who speak, in the talk box ----------
/** name → { pal: { letter: colour }, rows: square strings, "." clear } (the Gloom's, 26x26, in crack.js), or a cast portrait
 *  (39x39, portraits.js) with `base` (its calm face's name), `moods` { face: [[y, x, "pixels"], …] painted over the rows }
 *  and `as` { mood the lines use: the face drawn for it }. */
const PX_PORTRAITS = {};
/** The face drawn for a mood (a face's own name, or a line's mood through `as`), or "" for the base face. */
function pxFace(p, mood) {
  const f = mood && p.moods ? (p.as && p.as[mood]) || mood : "";
  return f && p.moods[f] ? f : "";
}
/** A portrait as a data URL, each art pixel doubled like keeperFace's, in the face for that mood (the base one if it has none);
 *  the small icon of that name stands in until one is drawn. */
function pxPortrait(name, mood) {
  const p = PX_PORTRAITS[name];
  if (!p) return pxIcon(name);
  const face = pxFace(p, mood), key = "portrait:" + name + (face ? "|" + face : "");
  if (pxIconCache[key]) return pxIconCache[key];
  const rows = p.rows.map(r => [...r]);
  if (face) for (const [y, x, px] of p.moods[face]) rows[y].splice(x, px.length, ...px);
  const c = document.createElement("canvas"); c.width = c.height = rows.length * 2;
  const g = c.getContext("2d");
  rows.forEach((row, y) => row.forEach((ch, x) => { if (p.pal[ch]) { g.fillStyle = p.pal[ch]; g.fillRect(x * 2, y * 2, 2, 2); } }));
  return pxIconCache[key] = c.toDataURL();
}

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

/** A dithered crystal cave on a W×H canvas. Ramps are [r,g,b] lists; the floor sits at floorY, lit from (lx, ly).
 *  With deep, the floor doesn't sink into the dark under its edge: it runs on down to the bottom as worn rock, stalagmites standing on it. */
function pixelCave(th, W, H, { floorY = H - 8, lx, ly = H * .62, crystals = 16, reach = 1, girth = 1, spill = .22, keepClear = 0, deep = false } = {}) {
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
  // stalagmites on a deep floor, often a little one beside a big one; the nearer ones stand in front
  const stones = [];
  if (deep) for (let i = 0; i < Math.round(W * (H - floorY) / (reach * reach * 230)); i++) {
    const x = Math.floor(pxHash(i, seed + 12) * W), far = floor(x) + 4 * reach, y = far + pxHash(i, seed + 13) * (H - far);
    const sh = (6 + pxHash(i, seed + 14) * 8) * reach * .8, sw = (2 + pxHash(i, seed + 15) * 2) * reach * .8;
    stones.push([x, y, sh, sw, true, true]);
    if (pxHash(i, seed + 17) > .45) stones.push([x + Math.round(sw * (pxHash(i, seed + 18) > .5 ? 1.1 : -1.1)), y + reach, sh * .5, sw * .6, true, true]);
  }
  stones.sort((a, b) => b[1] - a[1]);
  lx ??= W * (.3 + .4 * pxHash(seed, 9));
  const lr = W * .44, lh = H * .65;
  // per column, worked out once: the floor and ceiling lines, and only the crystals that reach that column (in the same order)
  const floorA = Float32Array.from({ length: W }, (_, x) => floor(x)), ceilA = Float32Array.from({ length: W }, (_, x) => ceil(x));
  const colPts = Array.from({ length: W }, (_, x) => [...stones, ...pts].filter(([sx, , , sw]) => Math.abs(x - sx) <= sw * (th.caps ? 2.4 : 1) + .5));
  // a deep floor is rock in flat slabs, like the room's own walls: the nearest of a scatter of points owns each pixel, every slab
  // lit along its far edge and darker toward you, cracks between them, grit on top
  const ground = (x, y, f, light) => {
    const cw = 11 * reach, ch = 4.2 * reach, b = y - f, gi = Math.floor(x / cw), gj = Math.floor(b / ch);
    let d1 = 1e9, d2 = 1e9, id = 0, oy = 0;
    for (let j = gj - 1; j <= gj + 1; j++) for (let i = gi - 1; i <= gi + 1; i++) {
      const sy = (j + .1 + .8 * pxHash(j + 3, i + seed)) * ch, dd = Math.hypot(x - (i + .1 + .8 * pxHash(i, j + seed)) * cw, (b - sy) * cw / ch);
      if (dd < d1) { d2 = d1; d1 = dd; id = i * 131 + j; oy = (b - sy) / ch; } else if (dd < d2) d2 = dd;
    }
    if (d2 - d1 < 1.2 && b > 2) return .05;
    return Math.max(.2, .36 + .16 * (pxHash(id, seed) - .5) - .2 * oy + (d2 - d1 < 2.6 && oy < 0 ? .14 : 0) + .1 * (pxFbm(x * .3, y * .3) - .5) + light * .3 + (pxHash(x, y + seed) > .99 ? .15 : 0));
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const light = Math.max(0, 1 - Math.hypot((x - lx) / lr, (y - ly) / lh));
    let col = null, air = false;
    for (const [sx, sb, sh, sw, up, rock] of colPts[x]) {
      const t = up ? (sb - y) / sh : (y - sb) / sh;
      // (a stalagmite is rock: it flares out at the foot, in rings of flowstone, and stands in a little shade)
      if (rock) {
        if (t >= 0 && t <= 1 && Math.abs(x - sx) <= sw * (1 - t) ** 1.5 + .5) { col = pxPick(wall, (x < sx ? .8 : .1) - ((sb - y) / reach % 2.5 < .6 ? .2 : 0) + light * .25 + pxFbm(x, y) * .08, x, y); break; }
        if (t < 0 && ((x - sx) / (sw + .5)) ** 2 + ((y - sb) / (sw * .35)) ** 2 < 1) { col = wall[0]; break; }
        continue;
      }
      // (in a glowcap grotto they're glowing mushrooms, a pale stem under a domed cap, and moss hangs from the roof instead)
      if (th.caps && t >= 0 && t <= 1) {
        const dx = Math.abs(x - sx), cap = t > .55 && dx <= sw * 2.3 * Math.sqrt(Math.max(0, 1 - ((t - .55) / .45) ** 2)) + .5;
        if (!up) { if (dx <= .5 + .5 * (pxHash(sx, seed) > .5)) { col = pxPick(wall, .55 + .4 * t + light * .2, x, y); break; } continue; }
        if (cap) { col = t < .6 ? crys[0] : pxPick(crys, (x < sx ? .85 : .5) - (t - .55) * .25 + light * .2 + pxFbm(x, y) * .08, x, y); break; }
        if (dx <= Math.max(.6, sw * .3)) { col = pxPick(crys, x < sx ? .7 : .45, x, y); break; }
        continue;
      }
      if (t >= 0 && t <= 1 && Math.abs(x - sx) <= sw * (1 - t) + .5) { col = pxPick(crys, (x < sx ? .8 - t * .15 : .4 + t * .15) + light * .25 + pxFbm(x, y) * .08, x, y); break; }
    }
    if (!col) {
      const f = floorA[x];
      if (pool && y >= f - 1 && y < f + 10 && Math.abs(x - lx) < W * .21) col = pxPick(pool, .35 + light * .5 + .2 * Math.sin(x * .9 + y * 3) * (y % 2), x, y);
      else if (y >= f) col = pxPick(wall, deep ? ground(x, y, f, light) : .45 - (y - f) / 14 + pxFbm(x * .25, y * .25) * .3 + light * .35, x, y);
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
  { id: "churchyard", name: "Moonlit Ruins", home: "Moonwell Cave", how: "open a moon egg", ok: () => !!save.moon },
  { id: "glowcap", name: "Glowcap Wood", home: "Glowcap Grotto", how: "collect 30 stars", ok: () => totalStars() >= 30 },
  { id: "abbey", name: "Starfall Abbey", home: "Starfall Crypt", how: "clear all 24 levels", ok: () => unlocked(LEVELS + 1) },
  { id: "frost", name: "Frost Hollow", art: 4, how: "meet 12 kinds of glowling", ok: () => Object.keys(save.seen).length >= 12 },
  { id: "smithy", name: "Timber Hall", home: "Lantern Gallery", how: "open the forge on the map", ok: () => placeOk("forge") },
  { id: "summit", name: "Aurora Summit", home: "Aurora Ice Cave", how: "raise a glowling to Radiant", ok: () => save.creatures.some(c => c.level >= 15) },
];
const THEME = Object.fromEntries(THEMES.map(t => [t.id, t]));
const CAVE_THEME = ["amethyst", "celestite", "malachite", "labradorite"];
/** Backdrops that are a cave of their own at home (every room there is a cave), each a mood of the rock: the glowcaps grow in a
 *  grotto of mossy rock, their caps glowing where a cave would have crystals; the timber hall is a gallery of rock shored up with
 *  oak and hung with lanterns; the abbey a crypt of dressed stone; the moonlit ruins a cave round a well the moon shines down;
 *  the aurora summit a cave of ice the northern lights glow through. (mood is how paintRoomIso builds the room: see roomMaterials) */
const HOME_ART = {
  glowcap: { seed: 29, mood: "grotto", wall: ["#0a0d0b", "#17221a", "#26391f", "#3a5527", "#557a34"], crystal: ["#1d5276", "#3383a8", "#69b7d6", "#b8e6f5", "#f0fbff"], glow: "#b4e67a", caps: true },
  smithy: { seed: 31, mood: "gallery", wall: ["#0b0a0e", "#1c1a20", "#302a2c", "#473d38", "#63554a"], crystal: ["#5c2a10", "#a8521c", "#e08a35", "#f6c46a", "#fff0b5"], glow: "#f2b45a" },
  abbey: { seed: 47, mood: "crypt", wall: ["#0b0814", "#1b1527", "#2e2639", "#463c52", "#62576d"], crystal: ["#3a1f5c", "#6b3fa0", "#c25586", "#eec26a", "#fff0b5"], glow: "#e6a8d8" },
  churchyard: { seed: 59, mood: "moonwell", wall: ["#080812", "#141428", "#23233d", "#363654", "#4d4b6e"], crystal: ["#2e1d4f", "#523a85", "#8a6cc9", "#d2bfff", "#efe6ff"], glow: "#d2bfff" },
  summit: { seed: 71, mood: "aurora", wall: ["#060c18", "#0e1e33", "#1a3552", "#2b5577", "#4a7fa0"], crystal: ["#1d5276", "#3383a8", "#8fd8ef", "#d4f4fb", "#ffffff"], glow: "#8ff0c8", bands: true },
};
/** The cave a backdrop is drawn as: at home its own grotto if it has one, else its chapter's cave (the first for one that has none). */
const caveArt = (id, home) => (home && HOME_ART[id]) || CHAPTER_ART[(THEME[id] || THEME.amethyst).art ?? 0];

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
  smithy: {
    seed: 23, sky: ["#0b0614", "#121230", "#1d2048", "#2a2f5e", "#3d4478"], far: ["#0b0614", "#10301f", "#1e3a28"],
    ground: ["#1a1008", "#2b1a10", "#4a2e18", "#6b4a2a"], mist: "#3d4478", hill: 0.64,
    moon: [0.72, 0.12, 0.035], moonCol: ["#eec26a", "#fff0b5", "#ffffff"],
  },
  abbey: {
    seed: 67, sky: ["#160c26", "#2e1d4f", "#5c1f3f", "#8f3460", "#c25586"], far: ["#0b0614", "#160c26", "#22143a"],
    ground: ["#0b0614", "#22143a", "#3a3440", "#5d5666"], mist: "#c25586", hill: 0.66,
    moon: [0.5, 0.1, 0.04], moonCol: ["#eec26a", "#fff0b5", "#ffffff"],
  },
};

/** Paint one night scene on a W×H canvas, then snap every pixel to the palette (no stray in-between colors). With `site` (the
 *  garden's or the camp's plot on screen: see bgFor) the ground round the plot is laid to meet it (nightSite). */
function pixelNight(id, W, H, floor = 0.86, site = null) {
  // (the glowcap wood is drawn layer by layer, like the tiles: pixelMeadow)
  if (id === "glowcap") return pixelMeadow(W, H, floor, site);
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
  if (site) nightSite(o, W, H, T, floorY, site);
  g.putImageData(out, 0, 0);
  return c;
}

/** Spots for props: mostly at the sides, so the egg or the nest in the middle stays clear. */
const sideX = (W, i, seed) => { const h = pxHash(i, seed); return h < 0.5 ? h * 0.6 * W : W - (h - 0.5) * 0.6 * W; };
const NIGHT_PROPS = {
  smithy(g, W, H, fy, seed, hill) {
    // dark pines along the far hills: the forge stands at the forest's edge
    g.fillStyle = "#0b0614";
    for (let k = 0; k < 18; k++) { const x = Math.round(pxHash(k, seed) * W), y = Math.round(hill(x)) + 2, hh = Math.max(6, Math.round(H * (0.06 + pxHash(k, 3) * 0.05))), ww = Math.round(hh * 0.4);
      g.beginPath(); g.moveTo(x - ww, y); g.lineTo(x, y - hh); g.lineTo(x + ww, y); g.fill(); }
  },
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

// ---------- the glowcap wood, drawn like the tiles (#277): a banded sky, a far ridge, a wooded hill, glowcaps, a meadow ----------
/** Where the garden's and the camp's trodden paths leave their plot (u, v on its floor, as in roomMaterials' pathD) and how wide
 *  they are there (pr across the floor, as pathD has it; half: how wide that looks on screen, a share of the plot); out on the meadow the backdrop takes each on: the garden's stepping stones toward the shop, the camp's track
 *  on out of the valley, the way the expeditions go. */
const WAY_OUT = { yard: { at: [1, 0.44], pr: 0.05, half: 0.075, stones: true }, camp: { at: [1, 0.9], pr: 0.07, half: 0.11 } };
/** A 2×2 ordered pattern: a seam between two bands goes over in clean checkerboard steps (a quarter, a half, three quarters). */
const PX_B2 = [0.125, 0.625, 0.875, 0.375];
/** A colour from a ramp in clean bands (v from 0 to 1), checkered only in a seam k wide between two bands. */
const pxBand = (ramp, v, x, y, k = 0.4) => { const n = ramp.length - 1; return ramp[clamp(Math.floor(clamp(v, 0, 1) * n + 0.5 + (PX_B2[((y & 1) << 1) | (x & 1)] - 0.5) * k), 0, n)]; };
/** The nearest colour on the palette. */
const pxSnap = col => PIXEL_PALETTE[PIXEL_LUT[(col[0] >> 3 << 10) | (col[1] >> 3 << 5) | (col[2] >> 3)]];

/** The glowcap wood at night, painted once per size and kept (see bgFor): the sky in clean bands with a stream of light across
 *  it, stars and the moon; a far ridge of rock, lit on the faces toward the moon, mist at its foot; a nearer hill wooded with
 *  round trees and pines; the giant glowcaps, their stems shaded and ringed, gills under their caps, glowing from within; and
 *  the meadow as horizontal strokes of grass in four greens. With `site`, the ground round the plot is laid to meet it. */
function pixelMeadow(W, H, floor = 0.86, site = null) {
  const T = NIGHT.glowcap, seed = T.seed, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true }), img = g.createImageData(W, H), d = img.data;
  const R = a => a.map(pxHex);
  const sky = R(["#0b0614", "#160c26", "#0f2f4a", "#1d5276", "#3383a8"]), rock = R(["#0b0614", "#160c26", "#22143a", "#2e1d4f", "#3d2866"]);
  const leaf = R(["#0b0614", "#10301f", "#1e5233", "#2f7d4a"]), grass = R(["#10301f", "#1e5233", "#2f7d4a", "#57ad6a"]), moonCol = R(T.moonCol);
  const stemC = R(["#3a3440", "#5d5666", "#8a8494", "#b9b3c0", "#e4dfe8"]), mist = pxHex("#1d5276"), stars = R(["#69b7d6", "#b8e6f5", "#ffffff"]);
  const floorY = Math.round(H * floor), sk = Math.max(12, floorY);
  const put = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
  const get = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  // the layers, back to front, each keeping its height above the ground line wherever the room puts it: a peaked ridge (folded
  // noise), a rolling hill, the meadow's edge; and the stream of light across the sky
  const ridgeY = new Float32Array(W), hillY = new Float32Array(W), gndY = new Float32Array(W), streamY = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const pk = 1 - Math.abs(pxNoise(x * 0.022, seed) - 0.5) * 2;
    ridgeY[x] = floorY - sk * (0.25 + 0.17 * pk + 0.05 * pxNoise(x * 0.09, seed + 1));
    hillY[x] = floorY - sk * (0.08 + 0.06 * pxNoise(x * 0.03, seed + 5));
    gndY[x] = floorY - 2 * pxNoise(x * 0.08, seed + 3);
    streamY[x] = sk * (0.2 + 0.09 * Math.sin(x * 0.017 + seed)) + sk * 0.12 * (pxNoise(x * 0.012, seed + 7) - 0.5);
  }
  const mr = Math.max(5, Math.min(W, H) * T.moon[2] * 1.6), mx = W * T.moon[0];
  const my = Math.max(mr * 0.6, Math.min(H * T.moon[1], ridgeY[clamp(Math.round(mx), 0, W - 1)] - mr * 1.8));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let col;
    if (y >= gndY[x]) {
      // the meadow: strokes of grass lying across, longer toward you, in big paler and darker patches; dark at its far edge
      const z = clamp((y - floorY) / Math.max(8, H - floorY), 0, 1), L = 2 + Math.round(z * 7 + pxHash(y, seed) * 3);
      const seg = Math.floor((x + pxHash(y, seed + 1) * L) / L), patch = pxNoise(x * 0.012 + seed, y * 0.03);
      const v = 0.38 + 0.5 * (patch - 0.5) + 0.36 * (pxHash(seg, y + seed) - 0.5) + 0.1 * z - 0.4 * Math.max(0, 1 - (y - gndY[x]) / (sk * 0.06 + 2));
      col = y - gndY[x] < 1 ? grass[0] : grass[clamp(Math.floor(v * 4), 0, 3)];
    } else if (y >= hillY[x]) {
      // the wooded hill: dark, a lit rim along its top, a few strokes of grass on it
      const seg = Math.floor((x + pxHash(y, seed + 2) * 5) / 5);
      col = y - hillY[x] < 1 ? leaf[2] : pxHash(seg, y + seed + 1) > 0.86 ? leaf[2] : leaf[1];
    } else if (y >= ridgeY[x]) {
      // the far ridge: faces toward the moon (rising to the left) lit, the others in shade, gullies down it, hazy at its foot
      const lit = ridgeY[Math.min(W - 1, x + 2)] > ridgeY[Math.max(0, x - 2)], fo = (y - ridgeY[x]) / Math.max(1, hillY[x] - ridgeY[x]);
      let v = (lit ? 0.52 : 0.32) + 0.3 * fo - (pxNoise(x * 0.16, y * 0.035 + seed) > 0.64 ? 0.18 : 0);
      if (y - ridgeY[x] < 1 && lit) v = 0.95;
      col = pxBand(rock, v, x, y);
    } else {
      // the sky in clean bands, lighter toward the ridge, a stream of light across it and the moon's glow
      const md = Math.hypot(x - mx, y - my);
      if (md < mr) col = pxBand(moonCol, 0.95 - 0.5 * (md / mr) ** 2 - 0.3 * pxSmooth(0.55, 0.7, pxFbm(x * 0.35 + seed, y * 0.35)), x, y);
      else {
        const t = clamp(y / Math.max(1, ridgeY[x]), 0, 1), st = Math.exp(-(((y - streamY[x]) / (sk * 0.07)) ** 2)) * (0.55 + 0.45 * pxNoise(x * 0.05, y * 0.05 + seed));
        col = pxBand(sky, 0.7 * t ** 1.6 + 0.3 * st + Math.max(0, 0.3 - (md - mr) / (sk * 0.7)), x, y, 0.45);
        if (pxHash(x, y + seed) > 0.9965 && y < ridgeY[x] * 0.85) col = stars[pxHash(y, x) > 0.5 ? 2 : 1];
      }
    }
    // mist lying in the hollow between the ridge and the hill, in checkered steps
    const m = 1 - (hillY[x] - y) / (sk * 0.14);
    if (y < hillY[x] && y >= ridgeY[x] && m > 0 && PX_B2[((y & 1) << 1) | (x & 1)] < m * 0.55) col = mist;
    const i = (y * W + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  // blades standing up out of the meadow here and there, more of them nearer, so it reads as grass and not as water
  for (let y = floorY + 3; y < H; y++) {
    const z = clamp((y - floorY) / Math.max(8, H - floorY), 0, 1);
    for (let x = 0; x < W; x++) {
      if (pxHash(x * 3 + seed, y * 5) > 0.012 + 0.03 * z) continue;
      const tall = 2 + Math.round(pxHash(x, y + 2) * (1 + 2 * z));
      for (let k = 0; k < tall; k++) put(x + (k === tall - 1 && tall > 2 ? (pxHash(y, x) > 0.5 ? 1 : -1) : 0), y - k, grass[k === tall - 1 ? 3 : k ? 2 : 0]);
    }
  }
  // a few big stars, sparkling in a cross
  for (let k = 0; k < 6; k++) {
    const x = Math.round(pxHash(k, seed + 21) * W), y = Math.round(pxHash(seed + 22, k) * ridgeY[clamp(x, 0, W - 1)] * 0.7);
    if (Math.hypot(x - mx, y - my) < mr * 2 || y < 3) continue;
    put(x, y, stars[2]);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { put(x + dx, y + dy, stars[1]); if (k % 2) put(x + 2 * dx, y + 2 * dy, stars[0]); }
  }
  // trees on the hill: round crowns of three lumps, each lit on its top left, and dark pines between
  for (let tx = -4, k = 0; tx < W + 4; k++) {
    const rr = Math.max(2, sk * (0.03 + 0.025 * pxHash(k, seed + 31))), pine = pxHash(k, seed + 32) > 0.68, x0 = Math.round(tx), base = hillY[clamp(x0, 0, W - 1)] + rr * 0.5;
    tx += rr * (1.3 + 1.4 * pxHash(seed + 33, k));
    if (pine) {
      const ph = rr * 3.2, top = base - ph, tier = Math.max(2, Math.round(ph / 3));
      for (let y = Math.floor(top); y <= base; y++) {
        const half = (y - top) / ph * rr * 1.1 * (0.7 + 0.3 * (((y - top) % tier) / tier));
        for (let x = Math.floor(x0 - half); x <= Math.ceil(x0 + half); x++) { const cc = (x - x0) / Math.max(1, half); put(x, y, cc < -0.35 ? leaf[2] : cc > 0.7 ? leaf[0] : leaf[1]); }
      }
      continue;
    }
    put(x0, base, leaf[0]); put(x0, base - 1, leaf[0]);
    const lumps = [[0, -rr * 0.9, rr], [-rr * 0.6, -rr * 0.55, rr * 0.75], [rr * 0.65, -rr * 0.5, rr * 0.7]];
    for (let y = Math.floor(base - rr * 2); y <= base; y++) for (let x = Math.floor(x0 - rr * 1.4); x <= Math.ceil(x0 + rr * 1.4); x++) {
      let best = null;
      for (const [ox, oy, r] of lumps) { const dx = (x + 0.5 - x0 - ox) / r, dy = (y + 0.5 - base - oy) / r, dd = dx * dx + dy * dy; if (dd < 1 && (!best || dd < best[2])) best = [dx, dy, dd]; }
      if (!best) continue;
      let v = 0.36 + 0.42 * (-best[0] * 0.6 - best[1] * 0.8) - (pxHash(x >> 1, (y >> 1) + seed) > 0.8 ? 0.2 : 0);
      if (best[2] > 0.75 && best[0] + best[1] > 0) v = 0;
      put(x, y, pxBand(leaf, v, x, y));
    }
  }
  // the giant glowcaps at the sides, so the plot in the middle stays clear: first the light round each cap, then the mushroom
  const caps = [["#5c1f3f", "#8f3460", "#c25586", "#e88bb1", "#ffc4da"], ["#0f2f4a", "#1d5276", "#3383a8", "#69b7d6", "#b8e6f5"], ["#2e1d4f", "#523a85", "#8a6cc9", "#ad91e6", "#d2bfff"]].map(R);
  const shrooms = Array.from({ length: 6 }, (_, i) => {
    const big = 0.6 + pxHash(i, 2) * 0.6, x = Math.round(sideX(W, i, seed)), foot = Math.round(gndY[clamp(x, 0, W - 1)]) + 1 + (i % 2);
    const h = Math.round(Math.min(H * (0.14 + 0.2 * big), floorY * (0.18 + 0.22 * big))), r = Math.round(Math.min(W * 0.08 * big + 5, h * 0.45));
    return { x, foot, h, r, ry: Math.max(2, Math.round(r * 0.62)), top: foot - h, cap: caps[i % 3], i };
  });
  for (const s of shrooms) {
    const cy = s.top - s.ry * 0.3, RR = s.r * 2.4;
    for (let y = Math.max(0, Math.floor(cy - RR)); y < Math.min(H, cy + RR); y++) for (let x = Math.max(0, Math.floor(s.x - RR)); x < Math.min(W, s.x + RR); x++) {
      const lv = Math.floor((1 - Math.hypot(x - s.x, (y - cy) * 1.15) / RR) * 2.6 + (PX_B2[((y & 1) << 1) | (x & 1)] - 0.5) * 0.6);
      if (lv <= 0) continue;
      const a = [0, 0.16, 0.3, 0.42][Math.min(3, lv)], o = get(x, y), lt = s.cap[3];
      put(x, y, pxSnap(o.map((v, k) => Math.round(v + (lt[k] - v) * a))));
    }
  }
  for (const { x: x0, foot, h, r, ry, top, cap, i } of shrooms) {
    // the stem: pale, lit on its left, shaded on its right with a dark edge, fibres along it, a ring under the cap, a bulb at
    // its foot in a tuft of moss, darker just under the cap where the cap shades it
    // (each stem bows a little, its foot off to one side of its cap)
    const half = Math.max(1.5, r * 0.14), ringY = top + Math.max(2, Math.round(h * 0.16)), bend = Math.round((pxHash(i, seed + 41) - 0.5) * r * 0.7), xAt = y => x0 + bend * ((y - top) / h) ** 2;
    for (let y = top; y <= foot; y++) {
      const fl = pxSmooth(0.8, 1, (y - top) / h), hw = half * (0.85 + 0.15 * (y - top) / h + 0.55 * fl) + (y === ringY || y === ringY + 1 ? 1 : 0);
      const xc = xAt(y);
      for (let x = Math.floor(xc - hw); x <= Math.ceil(xc + hw - 1); x++) {
        const cc = (x + 0.5 - xc) / hw;
        let v = 0.62 - 0.42 * cc - (y - top < ry * 0.45 ? 0.22 : 0) - (pxHash(x, Math.floor(y / 3) + seed) > 0.82 ? 0.12 : 0) - 0.15 * fl;
        if (y === ringY) v = cc < 0.4 ? 1 : 0.55; else if (y === ringY + 1) v = 0.2;
        if (cc > 0.8) v = 0;
        put(x, y, pxBand(stemC, v, x, y, 0.3));
      }
    }
    for (let k = -Math.round(half * 2.6); k <= Math.round(half * 2.6); k++) {
      if (pxHash(k, i + seed) > 0.7) put(x0 + bend + k, foot - 1, grass[pxHash(i, k) > 0.5 ? 2 : 1]);
      put(x0 + bend + k, foot, grass[k < 0 ? 2 : 1]);
      if (pxHash(k + 9, i) > 0.6) put(x0 + bend + k, foot - 2, grass[3]);
    }
    // under the cap: the gills, fanning out from the stem, glowing toward the rim
    const gy = Math.max(2, Math.round(ry * 0.45)), gills = Math.max(4, Math.round(r * 0.7));
    for (let y = top; y <= top + gy; y++) for (let x = Math.floor(x0 - r); x <= Math.ceil(x0 + r); x++) {
      const ex = (x + 0.5 - x0) / r, ey = (y + 0.5 - top) / (gy + 0.5), e = ex * ex + ey * ey;
      if (e >= 1) continue;
      const ang = Math.atan2(x + 0.5 - x0, top + gy * 1.6 - y), stripe = Math.floor((ang / Math.PI + 1) * gills) & 1;
      put(x, y, e > 0.8 ? cap[0] : ex * ex > 0.55 ? cap[stripe ? 3 : 2] : cap[stripe ? 1 : 0]);
    }
    // the cap: a dome lit from the top left, glowing from within, brightest at its rim; a dark edge on its shaded side,
    // pale spots and a gloss
    for (let y = top - ry; y <= top; y++) for (let x = Math.floor(x0 - r); x <= Math.ceil(x0 + r); x++) {
      const dx = (x + 0.5 - x0) / r, dy = (y + 0.5 - top) / ry, e = dx * dx + dy * dy;
      if (e >= 1) continue;
      let v = 0.4 + 0.36 * (-dx * 0.6 - dy * 0.8 - 0.4);
      if (dy > -0.24) v = Math.max(v, 0.7); if (dy > -0.1) v = 0.85;
      if (e > 0.82 && (dx > 0.2 || dy < -0.6) && dy < -0.24) v = 0;
      put(x, y, pxBand(cap, v, x, y));
    }
    for (let k = 0; k < 5; k++) {
      const sx = x0 + (pxHash(i, k + 7) - 0.5) * r * 1.3, sy = top - ry * (0.3 + 0.45 * pxHash(k, i)), sr = Math.max(1, r * 0.11);
      if (((sx - x0) / r) ** 2 + ((sy - top) / ry) ** 2 > 0.7) continue;
      for (let y = Math.floor(sy - sr * 0.7); y <= sy + sr * 0.7; y++) for (let x = Math.floor(sx - sr); x <= sx + sr; x++) if (((x + 0.5 - sx) / sr) ** 2 + ((y + 0.5 - sy) / (sr * 0.7)) ** 2 < 1.1) put(x, y, y > sy ? cap[3] : cap[4]);
    }
    put(x0 - r * 0.45, top - ry * 0.62, stars[2]); put(x0 - r * 0.45 + 1, top - ry * 0.62, cap[4]); put(x0 - r * 0.45 - 1, top - ry * 0.55, cap[4]);
  }
  // little glowcaps at the meadow's edge, and spores drifting
  for (let k = 0; k < 18; k++) {
    const x = Math.round(pxHash(k, seed + 4) * W), y = Math.round(gndY[clamp(x, 0, W - 1)]) + 1 + Math.round(pxHash(k, 9) * 3), cc = caps[k % 3];
    put(x, y - 1, stemC[4]); put(x, y - 2, stemC[3]); put(x + 1, y - 1, stemC[2]);
    put(x - 1, y - 3, cc[3]); put(x, y - 3, cc[2]); put(x + 1, y - 3, cc[1]); put(x, y - 4, cc[3]);
  }
  for (let k = 0; k < 26; k++) put(pxHash(k, seed + 11) * W, H * 0.2 + pxHash(seed, k) * H * 0.6 * floor, pxHex("#fff0b5"));
  if (site) nightSite(d, W, H, T, floorY, site);
  g.putImageData(img, 0, 0);
  return c;
}

/** The ground the garden's or the camp's plot sits in (site: { cx, top, hw } its floor's diamond in art pixels, kind the room):
 *  the plot's own grass, in its own tones and lumps (the floor's formula in roomMaterials), carried on past its edges and
 *  checkered out into the meadow, blades and all; and its trodden path going on out of it (WAY_OUT), narrowing toward the
 *  horizon: the garden's stepping stones in gravel, the camp's dirt track with pebbles. */
function nightSite(d, W, H, T, floorY, site) {
  const { cx, top, hw, kind } = site, hh = hw / 2, S = Math.max(0.55, hw / 180), seed = T.seed * 7, ground = T.ground.map(pxHex);
  const put = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
  // (isoTone's way: a 4×4 ordered seam half a step wide)
  const tone = (ramp, v, x, y, k) => { const n = ramp.length - 1; return ramp[clamp(Math.floor(clamp(v, 0, 1) * n + 0.5 + (PX_BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * k), 0, n)]; };
  const lump = (x, y) => pxFbm(x * 0.03 + seed, y * 0.06), uv = (x, y) => { const a = (x - cx) / hw, b = (y - top) / hh; return [(a + b) / 2, (b - a) / 2]; };
  const RING = Math.round(10 * S);
  for (let y = Math.max(0, Math.floor(top - RING)); y <= Math.min(H - 1, Math.ceil(top + hw + RING)); y++) for (let x = Math.max(0, Math.floor(cx - hw - 2 * RING)); x <= Math.min(W - 1, Math.ceil(cx + hw + 2 * RING)); x++) {
    const [u, v] = uv(x + 0.5, y + 0.5), o = Math.max(u - 1, v - 1, -u, -v) * hw;
    if (o > RING || o < -3 || PX_BAYER[(y & 3) * 4 + (x & 3)] < (o / RING) ** 1.3) continue;
    put(x, y, tone(ground, 0.42 + 2.6 * (lump(x - 2, y - 2) - lump(x + 2, y + 2)) + 0.16 * (pxFbm(x * 0.06 + seed, y * 0.12) - 0.5), x, y, 0.5));
    // and the plot's blades of grass, in tufts, as thick as on it
    const lush = pxFbm(x * 0.05 + seed, y * 0.1);
    if (o > 0 && o < RING * 0.8 && pxHash(x * 7 + seed, y * 3) < 0.06 + 0.12 * lush) {
      const tall = 2 + Math.round(pxHash(x, y + 1) * 2 + lush * 1.5), lean = pxHash(y, x) > 0.5 ? 1 : -1;
      for (let k = 0; k < tall; k++) put(x + (k === tall - 1 && tall > 2 ? lean : 0), y - k, k === tall - 1 ? ground[3] : k === 0 ? ground[1] : ground[2]);
    }
  }
  const way = WAY_OUT[kind];
  if (!way) return;
  // the path's line: out of the plot's edge square to it, then bending off along the meadow to the horizon on the right
  const at = (u, v) => [cx + (u - v) * hw, top + (u + v) * hh], E = at(...way.at), P1 = [E[0] + 0.4 * hw, E[1] + 0.2 * hw];
  const P3 = [cx + hw * 1.45, floorY + 1], P2 = [cx + hw * 1.35, floorY + (E[1] - floorY) * 0.6];
  const bez = t => [0, 1].map(k => (1 - t) ** 3 * E[k] + 3 * (1 - t) ** 2 * t * P1[k] + 3 * (1 - t) * t * t * P2[k] + t ** 3 * P3[k]);
  // (as wide as it is on the plot where it leaves it, narrowing with distance)
  const half0 = way.half * S * 180, dist = new Float32Array(W * H).fill(9), far = new Float32Array(W * H), n = Math.ceil(hw * 4);
  const stones = [];
  let run = 0, prev = E;
  for (let s = 0; s <= n; s++) {
    const p = bez(s / n), persp = clamp((p[1] - floorY) / Math.max(1, E[1] - floorY), 0.1, 1), hwid = Math.max(0.8, half0 * persp ** 0.7);
    run += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p;
    if (way.stones && run > 15 * persp) { run = 0; stones.push([p[0] + (stones.length % 2 ? 0.25 : -0.25) * hwid, p[1], persp]); }
    for (let y = Math.max(0, Math.floor(p[1] - hwid / 2 - 2)); y <= Math.min(H - 1, p[1] + hwid / 2 + 2); y++) for (let x = Math.max(0, Math.floor(p[0] - hwid - 2)); x <= Math.min(W - 1, p[0] + hwid + 2); x++) {
      const dn = Math.hypot(x + 0.5 - p[0], 2 * (y + 0.5 - p[1])) / hwid, i = y * W + x;
      if (dn < dist[i]) { dist[i] = dn; far[i] = persp; }
    }
  }
  const dirt = ["#1f130a", "#3b2414", "#553620", "#6e4a2a", "#8a6238", "#a37b4b"].map(pxHex);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, dn = dist[i] + 0.25 * (pxNoise(x * 0.3, y * 0.6) - 0.5);
    if (dn >= 1) continue;
    const [u, v] = uv(x + 0.5, y + 0.5);
    if (u > 0 && v > 0 && u < 1 && v < 1) continue;
    // grass creeping in at its edges
    if (dn > 0.72 && pxHash(x, y + seed) > 0.55) continue;
    let dv;
    if (way.stones) { const gv = pxHash(x, y + 5); dv = 0.42 + (gv > 0.8 ? 0.22 : gv < 0.15 ? -0.2 : 0); }
    else {
      dv = 0.45 + 1.8 * (lump(x - 2, y - 2) - lump(x + 2, y + 2)) + 0.1 * (pxFbm(x * 0.2, y * 0.3) - 0.5);
      const pb = pxHash(x >> 1, (y >> 1) + seed); if (pb > 0.96 && far[i] > 0.4) dv += 0.28; else if (pb > 0.93) dv -= 0.2;
    }
    if (dn > 0.8) dv -= 0.2;
    put(x, y, tone(dirt, dv - 0.15 * (1 - far[i]), x, y, 0.3));
  }
  // the stepping stones, smaller as they go: lit on their top left, a shadow under each
  const stone = ["#22143a", "#3a3440", "#5d5666", "#8a8494", "#b9b3c0"].map(pxHex);
  for (const [sx, sy, persp] of stones) {
    const rx = Math.max(1.2, 6.5 * persp), ry = Math.max(0.8, 3.4 * persp), [u, v] = uv(sx, sy);
    if (u > -0.02 && v > -0.02 && u < 1.02 && v < 1.02) continue;
    for (let y = Math.floor(sy - ry * 1.4); y <= sy + ry * 1.4; y++) for (let x = Math.floor(sx - rx * 1.4); x <= sx + rx * 1.4; x++) {
      const dx = (x + 0.5 - sx) / rx, dy = (y + 0.5 - sy) / ry, sd = Math.hypot(dx, dy);
      if (sd < 1) put(x, y, tone(stone, 0.6 + 0.25 * (-dx * 0.6 - dy * 0.8) - 0.15 * (1 - persp), x, y, 0.3));
      else if (sd < 1.35 && dy > 0) put(x, y, dirt[1]);
    }
  }
}

/** The backdrop for a theme at the size of the screen's art grid. */
/** A backdrop; `floor` is where its ground line sits (a share of the height), so the nest can stand on it; `site` is the
 *  garden's or the camp's plot, for the ground round it (outdoors only: see bgFor). */
function paintTheme(id, w, h, floor = 0.86, deep = false, home = false, site = null) {
  const t = THEME[id] || THEME.amethyst, own = home && HOME_ART[t.id];
  if (t.art === undefined && !own) return pixelNight(t.id, w, h, floor, site);
  const a = own || CHAPTER_ART[t.art];
  const th = { seed: own ? a.seed : 5 + t.art * 7, wall: a.wall.map(pxHex), crystal: a.crystal.map(pxHex), glow: pxHex(a.glow), pool: a.pool?.map(pxHex), flash: a.flash?.map(pxHex), bands: a.bands, caps: a.caps };
  const c = pixelCave(th, w, h, { floorY: Math.round(h * floor), lx: w / 2, ly: h * 0.55, crystals: Math.round(w / 12), reach: h / 150, girth: 1.6, spill: 0.04, keepClear: Math.round(w * 0.32), deep });
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
/** A backdrop's little picture (home: as it looks in a room at home, for one that's a cave of its own there). */
const themeThumb = (id, home = false) => { const k = home && HOME_ART[id] ? id + "|home" : id; return themeThumbs[k] || (themeThumbs[k] = paintTheme(id, 96, 64, 0.86, false, home).toDataURL()); };

/** Newly reached backdrops get a little announcement, once (at home by the name of the cave it makes there). */
function checkThemes(quiet = false) {
  save.themesSeen = save.themesSeen || [];
  const fresh = THEMES.filter(t => t.ok() && !save.themesSeen.includes(t.id));
  if (!fresh.length) return;
  save.themesSeen.push(...fresh.map(t => t.id));
  persist();
  const shown = fresh.filter(t => t.id !== "amethyst");
  if (!quiet && shown.length) setTimeout(() => toast(tr(atHome() ? "New cave mood: {0} · choose it in the Chest ✦" : "New backdrop: {0} · choose it in the Chest ✦", shown.map(t => (atHome() && t.home) || t.name).join(", "))), 1600);
}

/** How hard an egg is: tougher stone deeper in the grotto, and a weak spot that glows less and less. */
function levelConf(n) {
  const wander = n === 0, step = wander ? LEVELS : n, cave = wander ? 3 : Math.floor((n - 1) / 6);
  return {
    n, wander, cave, step,
    hp: Math.round(8 + step * 1.4 + cave * 2),
    spotGlow: step < 4 ? 1 : step < 10 ? 0.45 : step < 18 ? 0.2 : 0,
    rare: [0.08, 0.25, 0.45, 0.5][cave], legendary: [0, 0.03, 0.08, 0.15][cave],
    // the Malachite's stone grows in bands, and the weak spot moves when one breaks (see crackHit)
    bands: !wander && cave === 2,
    // the Celestite's stone is silent: the weak spot doesn't glow, but every knock's ripple leans towards it (see rippleLean)
    silent: !wander && cave === 1,
    // the Labradorite's weak spot shows only in a flash, right after a blow lands on it (see sheenGlow)
    sheen: !wander && cave === 3,
  };
}

// ---------- Wander goes deeper: every geode opened there is one step further down (see wanderDown) ----------

/** Every fifth step down is a pocket: a rare stone or better, in stone that keeps one of the caves' own rules. */
const POCKET_EVERY = 5;
/** The pockets take the caves' rules in turn: the Celestite's silence, the Malachite's bands, the Labradorite's flash. */
const POCKET_RULES = ["silent", "bands", "sheen"];
/** The stone hardens a little with each step (DEPTH_HP) down to DEPTH_FLAT, then only a touch (DEPTH_HP_LATE), and never
 *  past DEPTH_HP_CAP: a few more taps deep down, never a slog. Deeper, the pockets' rules carry the difficulty. */
const DEPTH_HP = 0.4, DEPTH_FLAT = 21, DEPTH_HP_LATE = 0.1, DEPTH_HP_CAP = 60;
const isPocket = d => d > 0 && d % POCKET_EVERY === 0;
/** Which cave rule the pocket at step d keeps. */
const pocketRule = d => POCKET_RULES[(d / POCKET_EVERY - 1) % POCKET_RULES.length];
/** The stone at step d of Wander: step 1 is as hard as it always was (level 24's), and it grows slowly from there. */
function depthHp(d) {
  const base = levelConf(0).hp, k = Math.max(0, d - 1);
  return Math.min(DEPTH_HP_CAP, Math.round(base + Math.min(k, DEPTH_FLAT) * DEPTH_HP + Math.max(0, k - DEPTH_FLAT) * DEPTH_HP_LATE));
}
/** An egg at step d of Wander: Wander's own, a little harder, and on a pocket a rare one or better under one cave rule. */
function depthConf(d) {
  const conf = { ...levelConf(0), depth: d, hp: depthHp(d) };
  if (!isPocket(d)) return conf;
  conf.pocket = true;
  conf[pocketRule(d)] = true;
  // (the legendary chance as deep as ever, and all the rest rare)
  conf.rare = 1 - conf.legendary;
  return conf;
}
