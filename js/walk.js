"use strict";
// Hatchstone · a walk outside: you take a glowling (or two) out along a little path for a minute or two.
// Tap where to go and they stroll there; find berries, seeds, a shiny pebble, a feather, a flower, now and then a spark,
// and once each walk clear a tangle of Gloom-thorn with your light, which opens the short way. No enemies, no hurry,
// nothing to lose: the path is drawn to match the garden's backdrop and the season, and they come home tired and happy.
// The rules (paths, the save, what a walk gives) are plain functions at the top, so the tests can load them in Node.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- the paths: each a little longer, each with one new thing ----------

const WALKS = [
  { id: "meadow", name: "The meadow path", len: 2.6, finds: 3, note: "trees, bushes and flowers, and a hill with a hollow way under it" },
  { id: "stream", name: "By the stream", len: 3.2, finds: 4, note: "a waterfall, and a stream to cross on stepping stones" },
  { id: "hollow", name: "The dark hollow", len: 3.8, finds: 4, note: "a hollow under old trees, so dark you'll need the lantern" },
  { id: "ledge", name: "The high ledge", len: 4.4, finds: 5, note: "a climb up the rocks to a ledge with a view" },
];
/** What can be found: where it goes, and how it looks in the bag (a 12×12 pixel icon, see PX_ICON_MAPS below). */
const WALK_FINDS = {
  berry: { name: "Wild berries", gives: "a moonberry for the pantry" },
  seed: { name: "Wild seeds", gives: "a seed for the garden bed" },
  pebble: { name: "A shiny pebble", gives: "shards" },
  feather: { name: "A soft feather", gives: "a keepsake" },
  flower: { name: "A little flower", gives: "a keepsake, pressed" },
  spark: { name: "A hidden spark", gives: "a spark of inspiration" },
};
const WALK_KEEP = ["feather", "flower"];
/**
 * The keepsakes themselves: each feather or flower turns out to be one of a few you can tell apart, and goes into the
 * keepsake jar at home just as it is (see ISO_ART.keepjar). w: how often it turns up (the raven and the wild rose are rare);
 * c: its colours, dark to light, for the jar.
 */
const KEEPSAKES = [
  { id: "jay", kind: "feather", name: "A jay feather", w: 3, c: ["#1d5276", "#3383a8", "#69b7d6", "#ffffff"] },
  { id: "down", kind: "feather", name: "An owl's down", w: 3, c: ["#8a8494", "#e4dfe8", "#fff0b5", "#ffffff"] },
  { id: "robin", kind: "feather", name: "A robin's feather", w: 3, c: ["#7d1e2c", "#b8323b", "#e0634f", "#eec26a"] },
  { id: "raven", kind: "feather", name: "A raven feather", w: 1, c: ["#0b0614", "#22143a", "#3d2866", "#8a6cc9"] },
  { id: "heather", kind: "flower", name: "A heather sprig", w: 3, c: ["#6b4fa8", "#8a6cc9", "#ad91e6", "#d2bfff"] },
  { id: "daisy", kind: "flower", name: "A moon daisy", w: 3, c: ["#b9b3c0", "#efe6ff", "#ffffff", "#eec26a"] },
  { id: "harebell", kind: "flower", name: "A harebell", w: 3, c: ["#1d5276", "#3383a8", "#69b7d6", "#b8e6f5"] },
  { id: "rose", kind: "flower", name: "A wild rose", w: 1, c: ["#8f3460", "#e88bb1", "#ffc4da", "#fff0b5"] },
];
const KS = Object.fromEntries(KEEPSAKES.map(k => [k.id, k]));

/** The save's walks, made whole: how far the paths are open, how many walks, the best haul on each path, the keepsakes. */
function walkSaveOf(w) {
  w = w && typeof w === "object" ? w : {};
  const int = (v, lo, hi) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : lo;
  const best = {}, keep = {}, found = {};
  for (const p of WALKS) if (w.best && Number.isFinite(w.best[p.id]) && w.best[p.id] > 0) best[p.id] = int(w.best[p.id], 0, 9);
  for (const k of WALK_KEEP) if (w.keep && w.keep[k] > 0) keep[k] = int(w.keep[k], 0, 9999);
  for (const k of KEEPSAKES) if (w.found && w.found[k.id] > 0) found[k.id] = int(w.found[k.id], 0, 9999);
  // older saves only counted feathers and flowers: what they found is shared out among the kinds (the common ones first),
  // so their jar fills too; and the count of each is never less than the keepsakes of that kind
  for (const kind of WALK_KEEP) {
    const all = KEEPSAKES.filter(k => k.kind === kind).sort((a, b) => b.w - a.w), have = all.reduce((n, k) => n + (found[k.id] || 0), 0);
    for (let i = 0; i < (keep[kind] || 0) - have; i++) found[all[i % all.length].id] = (found[all[i % all.length].id] || 0) + 1;
    if (have > (keep[kind] || 0)) keep[kind] = have;
  }
  return { open: int(w.open, 1, WALKS.length), n: int(w.n, 0, 1e6), best, keep, found, last: Number.isFinite(w.last) ? w.last : 0 };
}
/** Which keepsake a feather or a flower turns out to be: half the time one of the common ones you haven't got yet, the rare ones rarely. */
function keepsakePick(kind, found = {}, rnd = Math.random) {
  const all = KEEPSAKES.filter(k => k.kind === kind), fresh = all.filter(k => !found[k.id] && k.w > 1);
  const pool = fresh.length && rnd() < 0.5 ? fresh : all;
  let r = rnd() * pool.reduce((n, k) => n + k.w, 0);
  for (const k of pool) if ((r -= k.w) < 0) return k.id;
  return pool[pool.length - 1].id;
}
/**
 * What the keepsake jar holds: a stem for each keepsake you've found at least once, then more of the ones you have most,
 * up to eight (feathers first: they stand at the back); and, once it's full, a layer of pressed petals that keeps rising (0 to 4).
 */
function keepjarView(found = {}, max = 8) {
  const have = KEEPSAKES.filter(k => found[k.id] > 0), left = Object.fromEntries(have.map(k => [k.id, found[k.id] - 1]));
  const stems = have.map(k => k.id);
  while (stems.length < max) {
    const more = have.filter(k => left[k.id] > 0).sort((a, b) => left[b.id] - left[a.id])[0];
    if (!more) break;
    stems.push(more.id); left[more.id]--;
  }
  const all = have.reduce((n, k) => n + found[k.id], 0);
  stems.sort((a, b) => (KS[a].kind === "feather" ? 0 : 1) - (KS[b].kind === "feather" ? 0 : 1));
  return { stems, petals: Math.max(0, Math.min(4, Math.floor((all - max) / 6))) };
}

/** How it ends: joy up by the finds, energy down by how far you went; never below a little, never over the top. */
function walkMood(path, finds, freed) {
  return { joy: Math.min(40, 12 + finds * 4 + (freed ? 6 : 0)), energy: 8 + path * 3, tummy: 4, xp: 6 + finds * 2 };
}

/**
 * Which finds go where on a walk: the path's spots (designed per path), filled with kinds, every walk a little different.
 * A stone in the stream always holds a pebble, the hollow's deepest spot always a spark; a spark elsewhere is rare.
 */
function walkPlan(path, rnd = Math.random) {
  const spots = WALK_SPOTS[path], want = WALKS[path].finds;
  const must = spots.filter(s => s.must), rest = spots.filter(s => !s.must);
  while (must.length + rest.length > want) rest.splice(Math.floor(rnd() * rest.length), 1);
  const kinds = ["berry", "seed", "pebble", "feather", "flower"];
  let spark = must.some(s => s.kind === "spark");
  return [...must, ...rest].sort((a, b) => a.u - b.u).map(s => {
    if (s.kind) return { ...s };
    const k = !spark && rnd() < 0.08 ? "spark" : kinds[Math.floor(rnd() * kinds.length)];
    if (k === "spark") spark = true;
    return { ...s, kind: k };
  });
}
// where along each path (0 to 1) something can be: on the path, inside a bush, on a stepping stone, in the dark
const WALK_SPOTS = [
  [{ u: 0.2, at: "bush" }, { u: 0.34, at: "path" }, { u: 0.74, at: "bush" }, { u: 0.86, at: "path" }],
  [{ u: 0.15, at: "bush" }, { u: 0.335, at: "stone", kind: "pebble", must: true }, { u: 0.5, at: "path" }, { u: 0.82, at: "bush" }, { u: 0.9, at: "path" }],
  [{ u: 0.14, at: "bush" }, { u: 0.27, at: "path" }, { u: 0.42, at: "dark" }, { u: 0.645, at: "dark", kind: "spark", must: true }, { u: 0.8, at: "bush" }, { u: 0.88, at: "path" }],
  [{ u: 0.11, at: "bush" }, { u: 0.215, at: "stone", kind: "pebble", must: true }, { u: 0.33, at: "path" }, { u: 0.58, at: "bush" }, { u: 0.74, at: "path" }, { u: 0.85, at: "path" }],
];
/** The shape of each path, as shares of its length: the hill with the hollow way (and its thorn), the stream, the dark, the climb. */
const WALK_SHAPE = [
  { hill: [0.47, 0.62] },
  { stream: [0.3, 0.37], hill: [0.6, 0.73] },
  { dark: [0.36, 0.72], hill: [0.5, 0.6] },
  { stream: [0.19, 0.24], hill: [0.42, 0.53], ledge: [0.64, 0.86] },
];

if (typeof module === "object" && module.exports) module.exports = { WALKS, WALK_FINDS, WALK_SPOTS, WALK_SHAPE, KEEPSAKES, walkSaveOf, walkMood, walkPlan, keepsakePick, keepjarView };

// ---------- the words and the little pictures (the browser only: the tests load the rules above on their own) ----------

if (typeof window === "object") {
  Object.assign(PX_ICON_MAPS, {
    walk: ["............", ".........mm.", "..mm....mMm.", ".mMm..oo..m.", "..m..oGGo...", ".....oGo....", "....oGo..mm.", "...oGGo.mMm.", "..oGGo...m..", ".oGGo.......", "oGGo.....mm.", "ooo.....mMm."],
    berry: ["............", "......mm....", ".....mMm....", "....m.......", "..tT.tT.....", ".tWtTtTT....", ".tttTtTT.tT.", "..TT..TTtWtT", "....tT..ttTT", "...tWtT..TT.", "...ttTT.....", "....TT......"],
    seed: ["............", ".....mm.....", "....mMm.....", ".....m......", "....bob.....", "...bGoob....", "...bGoob....", "....bbb.....", ".bob....bob.", "bGoob..bGoob", "bGoob..bGoob", ".bbb....bbb."],
    pebble: ["..........W.", ".........WGW", "..........W.", "...ssss.....", "..swwsss....", ".swWwsssS...", ".swwssssS...", ".sssssssS...", ".SssssSSS...", "..SSSSSS....", "............", "............"],
    feather: ["..........L.", ".........LwL", "........LwlL", ".......LwlL.", "......LwlL..", ".....LwlL...", "....LwlL....", "...LwlL.....", "..LwlL......", "..wlL.......", ".d..........", "d..........."],
    flower: ["....rr......", "...rRRr.rr..", "..rr..rrRRr.", "..rRrGGrRr..", "...rGWGrr...", "..rrrGGrRr..", "..rRRr.rRRr.", "...rr.m.rr..", "......m.....", "...Mm.m.....", "....mmm.....", "......m....."],
  });
  PX_ICON_MAPS.wspark = PX_ICON_MAPS.sparkle;
  // each keepsake's own little picture: the feather in its colours (the jay's barred, the raven's with a violet sheen), the down, the flowers
  const quill = PX_ICON_MAPS.feather, recolor = (map, sub) => map.map((r, y) => r.replace(/[Lwl]/g, ch => sub(ch, y)));
  Object.assign(PX_ICON_MAPS, {
    ks_jay: recolor(quill, (ch, y) => ch === "L" ? "T" : ch === "w" ? "W" : y % 3 === 1 ? "k" : "t"),
    ks_robin: recolor(quill, ch => ch === "L" ? "E" : ch === "w" ? "g" : "e"),
    ks_raven: recolor(quill, ch => ch === "L" ? "d" : ch === "w" ? "l" : "p"),
    ks_down: ["............", "....wWWw....", "...wWsWWw...", "..wWWsWGWw..", "..WsWWWsWw..", "..wWGsWWWw..", "...wWWsWw...", "....wWWw....", ".....sS.....", "......S.....", "......S.....", "............"],
    ks_heather: ["......L.....", ".....lLl....", "......m.....", "....lLmLl...", ".....lml....", "...lLlmlLl..", "....lpmpl...", "......m.....", ".....mm.....", "......m.....", "......m.....", "............"],
    ks_daisy: ["............", "...W.WW.W...", "...WWWWWW...", ".WWWWggWWWW.", "..WWgGGgWW..", ".WWWWggWWWW.", "...WWWWWW...", "...W.mm.W...", "......m.....", "...Mm.m.....", "....mmm.....", "......m....."],
    ks_harebell: ["............", "...mmmm.....", "..m....m....", "..m.....m...", "..m....tTt..", "..m...tTTTt.", "..m...ttTTt.", "..m..ttTTTtt", "..m...W..W..", "..m.........", ".Mm.........", "..m........."],
    ks_rose: ["............", "...rrrr.....", "..rrRRrr....", ".rrRggRrr...", ".rRgGGgRr...", ".rrRggRrr...", "..rrRRrr.M..", "...rrrr.MM..", "....m..m....", ".....mm.....", ".....m......", ".....m......"],
  });
  Object.assign(UK, {
    "A walk": "Прогулянка",
    "A walk outside": "Прогулянка",
    "The meadow path": "Лучна стежка",
    "By the stream": "Біля струмка",
    "The dark hollow": "Темна балка",
    "The high ledge": "Високий уступ",
    "trees, bushes and flowers, and a hill with a hollow way under it": "дерева, кущі й квіти, а під пагорбом — нижня стежка",
    "a waterfall, and a stream to cross on stepping stones": "водоспад і струмок, який переходять по камінцях",
    "a hollow under old trees, so dark you'll need the lantern": "балка під старими деревами: без ліхтаря там темно",
    "a climb up the rocks to a ledge with a view": "підйом скелями до уступу, звідки видно далеко",
    "Wild berries": "Дикі ягоди", "Wild seeds": "Дике насіння", "A shiny pebble": "Блискучий камінчик",
    "A soft feather": "М'яка пір'їнка", "A little flower": "Квіточка", "A hidden spark": "Захована іскра",
    "Take a glowling out for a little walk: tap where to go, look around, find small things on the way. You come home a little tired and a lot happier.": "Візьми глоулінга на коротку прогулянку: торкайся, куди йти, роздивляйся, знаходь дрібнички дорогою. Додому — трохи втоми й багато радості.",
    "Who's coming?": "Хто йде гуляти?",
    "a little path to stroll, with things to find": "коротка стежка, а на ній дрібнички",
    "Paths": "Стежки",
    "up to two": "до двох",
    "asleep": "спить",
    "too tired": "забракло сил",
    "after: {0}": "після: {0}",
    "new": "нова",
    "Keepsakes from walks: {0}": "Пам'ятні дрібнички з прогулянок: {0}",
    "A jay feather": "Пір'їнка сойки", "An owl's down": "Совиний пушок", "A robin's feather": "Пір'їнка вільшанки", "A raven feather": "Пір'їна крука",
    "A heather sprig": "Вересова гілочка", "A moon daisy": "Місячна ромашка", "A harebell": "Дзвоник", "A wild rose": "Квітка шипшини",
    "Keepsakes": "Пам'ятні дрібнички",
    "{0} of {1} kinds found": "знайдено {0} з {1} видів",
    "Every feather and flower from your walks goes into the keepsake jar, and stays there: set it out in a room from the Chest.": "Кожна пір'їнка й квіточка з прогулянок лягає в банку з дрібничками й лишається там: постав її в кімнаті зі Скриньки.",
    "Feathers and flowers from your walks will be kept here.": "Тут зберігатимуться пір'їнки й квіточки з прогулянок.",
    "Every feather and flower from your walks goes into it, and none is ever used up.": "Сюди лягає кожна пір'їнка й квіточка з прогулянок, і жодна не витрачається.",
    "A keepsake jar for what you find: it's waiting in your Chest ✦": "Банка для знахідок: вона чекає у Скриньці ✦",
    "In the jar: feathers ×{0}, flowers ×{1}": "У банці: пір'їнки ×{0}, квіточки ×{1}",
    "Everyone's asleep or too tired for a walk. Maybe after a nap 🌙": "Усі сплять або втомилися. Може, після дрімоти 🌙",
    "Not during a shared egg": "Не під час спільного яйця",
    "Tap where to go": "Торкнися, куди йти",
    "Something rustles in that bush. Tap it": "У тому кущі щось шарудить. Торкнися його",
    "Gloom-thorn has tangled the hollow way. Tap it with your light": "Терен Мли заплів нижню стежку. Торкнися його світлом",
    "The thorns loosen in the light. The short way is open ✦": "Терен слабне у світлі. Коротка стежка відкрита ✦",
    "It's dark under the trees. Tap to lift your lantern": "Під деревами темно. Торкнися, щоб підняти ліхтар",
    "Hop, hop, hop: over the stepping stones": "Стриб, стриб, стриб: по камінцях",
    "What a view.": "Який краєвид.",
    "Head home": "Додому",
    "Home": "Додому",
    "A lovely walk": "Гарна прогулянка",
    "A short walk": "Коротка прогулянка",
    "{0}, along {1}.": "{0}: {1}.",
    "Home a little early, and that's fine.": "Додому трохи раніше, і це нічого.",
    "A little tired, a lot happier.": "Трохи втоми, багато радості.",
    "Nothing found this time: just fresh air.": "Цього разу без знахідок: просто свіже повітря.",
    "finds": "знахідки",
    "energy": "сили",
    "A new path is open: {0} ✦": "Відкрилася нова стежка: {0} ✦",
    "a keepsake": "пам'ятна дрібничка",
    "{0} seed": "насіння: {0}",
    "Went for a walk: {0}": "Ходили на прогулянку: {0}",
    "Freed a little light from the Gloom-thorn": "Звільнено трохи світла з терену Мли",
  });
}

// ---------- starting out: who comes along, and which path ----------

let walkPick = [];
/** Who could come: at home, not off exploring. */
const walkWho = () => save.creatures.filter(c => !c.trip && !c.out);
/** Awake, with enough left in them for a stroll. */
const walkFit = cr => { applyTime(cr); return !cr.sleeping && cr.energy >= 20; };
/** The land the walk goes through: the garden's backdrop (a cave theme from indoors means the garden's own one). */
function walkTheme() {
  const id = game.walkThemeTry || currentTheme();
  if (WALK_LAND[id]) return id;
  const yard = save.rooms.find(r => r.kind === "yard");
  return yard && WALK_LAND[yard.theme] ? yard.theme : "glowcap";
}
const walkSeason = () => game.walkSeasonTry || seasonOf();

function openWalk() {
  if (coopSession) { toast(tr("Not during a shared egg")); return; }
  sfx.tick();
  const home = walkWho();
  walkPick = walkPick.filter(id => home.some(c => c.id === id && walkFit(c)));
  const act = activeCreature();
  if (!walkPick.length) { const first = [act, ...home].find(c => c && home.includes(c) && walkFit(c)); if (first) walkPick = [first.id]; }
  renderWalkSheet();
  show("walkSheet", true);
}
function renderWalkSheet() {
  const w = save.walks, home = walkWho();
  $("walkSheetTitle").textContent = tr("A walk outside");
  $("walkSheetSub").textContent = tr("Take a glowling out for a little walk: tap where to go, look around, find small things on the way. You come home a little tired and a lot happier.");
  $("walkWhoH").innerHTML = `${tr("Who's coming?")} <small>${tr("up to two")}</small>`;
  $("walkWho").innerHTML = home.map(c => {
    const ok = walkFit(c), on = walkPick.includes(c.id);
    return `<button class="res${on ? " on" : ""}" data-id="${c.id}" ${ok ? "" : "disabled"} aria-pressed="${on}"><img src="${creatureImage(specOf(c), { art: 20, level: c.level, shiny: c.shiny, acc: c.acc, mood: on ? "happy" : "ok" })}" alt="" draggable="false"><small>${c.name}</small>${ok ? "" : `<small class="away">${tr(c.sleeping ? "asleep" : "too tired")}</small>`}</button>`;
  }).join("");
  $$("#walkWho button").forEach(b => b.addEventListener("click", () => {
    const id = Number(b.dataset.id);
    sfx.tick();
    if (walkPick.includes(id)) { if (walkPick.length > 1) walkPick = walkPick.filter(x => x !== id); }
    else walkPick = [...walkPick, id].slice(-2);
    renderWalkSheet();
  }));
  $("walkPathsH").textContent = tr("Paths");
  $("walkPaths").innerHTML = WALKS.map((p, i) => {
    const open = i < w.open, best = w.best[p.id];
    return `<button class="snack${open ? "" : " locked"}" data-path="${i}" ${open && walkPick.length ? "" : "disabled"}><span class="em">${ic(open ? ["walk", "berry", "feather", "flower"][i] : "lock")}</span><span><b>${tr(p.name)}</b><small>${open ? tr(p.note) : tr("after: {0}", tr(WALKS[i - 1].name))}</small></span>${open ? `<span class="cost">${best ? `${best}/${p.finds}` : tr("new")}</span>` : ""}</button>`;
  }).join("");
  $$("#walkPaths [data-path]").forEach(b => b.addEventListener("click", () => startWalk(Number(b.dataset.path))));
  const keep = KEEPSAKES.filter(k => w.found[k.id]).map(k => `<span title="${tr(k.name)}">${ic("ks_" + k.id)}×${w.found[k.id]}</span>`).join(" ");
  $("walkKeep").innerHTML = keep ? tr("Keepsakes from walks: {0}", keep) + "<br>" + tr("Every feather and flower from your walks goes into the keepsake jar, and stays there: set it out in a room from the Chest.") : "";
  $("walkKeep").hidden = !keep;
  if (!home.some(walkFit)) $("walkSheetSub").textContent = tr("Everyone's asleep or too tired for a walk. Maybe after a nap 🌙");
}

function startWalk(path) {
  const who = walkPick.map(id => save.creatures.find(c => c.id === id)).filter(c => c && walkFit(c));
  if (!who.length || path >= save.walks.open) return;
  show("walkSheet", false);
  sfx.tick();
  const theme = walkTheme();
  game.walk = {
    path, theme, season: walkSeason(), who: who.map(c => c.id), plan: walkPlan(path), t: 0, cam: 0, key: "",
    thorn: 0, freed: false, reached: false, ended: false, endT: 0, got: [], fx: [], motes: [], hinted: {},
  };
  // the backdrop's key and chords, with the walk's own light texture (see PLACES.walk in music.js)
  bgTheme = theme; sfx.music(theme);
  setScene("walk");
  $("walkHud").classList.remove("done");
  $("walkName").textContent = tr(WALKS[path].name);
  walkBag();
  setTimeout(() => walkSay(tr("Tap where to go"), "go"), 300);
}
/** A hint, once per walk each. */
function walkSay(text, id) {
  const g = game.walk;
  if (!g || g.ended || (id && g.hinted[id])) return;
  if (id) g.hinted[id] = true;
  setHint(text);
  clearTimeout(walkSay.t);
  walkSay.t = setTimeout(() => { if (game.scene === "walk" && $("hint").textContent === text) setHint(""); }, 5200);
}
function walkBag() {
  const g = game.walk;
  if (!g) return;
  $("walkBag").innerHTML = `${ic("pouch")}<b>${g.got.length}</b>/${g.plan.length}`;
}

// ---------- the land: each backdrop's trees, grass, flowers and night; the season changes the leaves and the ground ----------

const WALK_LAND = {
  // the mountain meadow under the aurora: pines and boulders, white and lilac alpine flowers
  summit: { trees: ["pine", "pine", "round", "pine"], far: ["#1d5276", "#0f2f4a", "#3383a8", "#1d5276"], mid: "pine", grass: ["#10301f", "#1e5233", "#2f7d4a", "#57ad6a", "#a3dd9b"], flowers: ["#ffffff", "#d2bfff", "#eec26a", "#b8e6f5"], rocks: 3 },
  // the glowcap wood: giant mushrooms glowing among the trees, fireflies, pink and blue little caps
  glowcap: { trees: ["cap", "round", "round", "cap", "round"], far: ["#1e5233", "#10301f", "#2f7d4a", "#1e5233"], mid: "cap", grass: ["#10301f", "#1e5233", "#2f7d4a", "#57ad6a", "#a3dd9b"], flowers: ["#e88bb1", "#69b7d6", "#fff0b5", "#ffc4da"], caps: true, rocks: 1 },
  // the moonlit ruins: dark yews and an old bare tree, broken walls with ivy, pale flowers
  churchyard: { trees: ["yew", "round", "bare", "yew"], far: ["#22143a", "#160c26", "#3d2866", "#2e1d4f"], mid: "yew", grass: ["#0b0614", "#10301f", "#1e5233", "#2f7d4a", "#57ad6a"], flowers: ["#d2bfff", "#efe6ff", "#ad91e6"], ruins: true, rocks: 2 },
  abbey: { trees: ["yew", "round", "yew"], far: ["#2e1d4f", "#160c26", "#523a85", "#3d2866"], mid: "yew", grass: ["#10301f", "#1e5233", "#2f7d4a", "#57ad6a", "#a3dd9b"], flowers: ["#ffc4da", "#eec26a", "#efe6ff"], ruins: true, rocks: 2 },
  smithy: { trees: ["pine", "round", "pine"], far: ["#1e3a28", "#10301f", "#2f7d4a", "#1e5233"], mid: "pine", grass: ["#10301f", "#1e5233", "#2f7d4a", "#57ad6a", "#a3dd9b"], flowers: ["#eec26a", "#fff0b5", "#e0634f"], rocks: 2 },
};
/** Leaves by season: [deep, mid, lit, highlight]. Pines keep theirs all year. */
const WALK_LEAVES = {
  spring: ["#1e5233", "#2f7d4a", "#57ad6a", "#a3dd9b"], summer: ["#10301f", "#1e5233", "#2f7d4a", "#57ad6a"],
  autumn: ["#7d1e2c", "#b8323b", "#e0634f", "#eec26a"], winter: ["#10301f", "#1e5233", "#2f7d4a", "#57ad6a"],
};
const WALK_PINE = ["#0b0614", "#10301f", "#1e5233", "#2f7d4a"];
const WALK_DIRT = ["#2a1e1a", "#4a362c", "#6e5444", "#98786a", "#c4a796"];
const WALK_STONE = ["#22143a", "#3a3440", "#5d5666", "#8a8494", "#b9b3c0", "#e4dfe8"];
const WALK_WATER = ["#0f2f4a", "#1d5276", "#3383a8", "#69b7d6", "#b8e6f5", "#ffffff"];
const WALK_SNOW = ["#8a8494", "#b9b3c0", "#e4dfe8", "#ffffff"];
const WALK_SNOWBANK = ["#3d2866", "#6b4fa8", "#ad91e6", "#d2bfff", "#efe6ff"]; // snow at night: lilac in the shade
const walkHexes = a => a.map(pxHex);
const WALK_PATH = 16; // how deep the path's band of earth is, in art pixels

/** The walk's shape in art pixels, at this screen and pixel size: where the path runs, and where its hill, stream, dark and climb are. */
function walkGeo(g) {
  const AW = Math.ceil(W / PX), AH = Math.ceil(H / PX), sh = WALK_SHAPE[g.path];
  const len = Math.round(AW * WALKS[g.path].len), at = u => Math.round(u * len);
  const s = clamp(W * 0.16, 52, 92) / PX, y0 = Math.round(AH * 0.7);
  // (base: the length the shape is measured on; the ledge's walk runs on past it, to the view)
  const geo = { AW, AH, len, base: len, s, y0, start: Math.round(AW * 0.22), end: at(0.95), seed: g.path * 101 + 7 };
  if (sh.hill) { const [a, b] = sh.hill.map(at); geo.hill = { x0: a, x1: b, h: Math.round(Math.min(AH * 0.13, s * 1.6)), ax: Math.round((a + b) / 2), aw: Math.round((b - a) * 0.26), ah: Math.round(s * 1.25) }; }
  if (sh.stream) { const [a, b] = sh.stream.map(at); geo.stream = { x0: a, x1: b, stones: [0.2, 0.5, 0.8].map(k => Math.round(lerp(a, b, k))), top: Math.round(y0 - AH * 0.27) }; }
  if (sh.dark) { const [a, b] = sh.dark.map(at); geo.dark = { x0: a, x1: b }; }
  if (sh.ledge) {
    // the lookout: the path ends at a rail on the edge, and past it the camera stops with the view filling most of the screen
    const [a, b] = sh.ledge.map(at);
    geo.ledge = { x0: a, x1: b, rise: Math.round(AH * 0.17) }; geo.end = b + Math.round(AW * 0.12); geo.edge = b + Math.round(AW * 0.22); geo.len = geo.edge + Math.round(AW * 0.66);
  }
  return geo;
}
/** The path's surface at x; `over`: taking the top of the hill (while the hollow way under it is still tangled). */
function walkGround(geo, x, over = false) {
  let y = geo.y0 + Math.round(1.4 * Math.sin(x * 0.012 + geo.seed) + 0.8 * Math.sin(x * 0.031));
  const L = geo.ledge;
  if (L && x > L.x0) { const k = clamp((x - L.x0) / (L.x1 - L.x0), 0, 1); y -= Math.round(L.rise * k * k * (3 - 2 * k)); }
  if (over && geo.hill && x > geo.hill.x0 && x < geo.hill.x1) y = Math.min(y, walkHillTop(geo, x));
  return y;
}
const walkHillTop = (geo, x) => { const h = geo.hill, k = clamp((x - h.x0) / (h.x1 - h.x0), 0, 1); return Math.round(geo.y0 - h.h * Math.pow(Math.sin(k * Math.PI), 0.75)) - 1; };
const walkIn = (x, a, b) => x >= a && x <= b;

// ---------- painting: little canvases in art pixels, palette colours, soft cel shading lit from the top left ----------

/** A blob shaded from the top left with a dithered step between its shades: the soft cel look of the rooms. */
function walkBall(T, cx, cy, r, ramp, ry = r, k = 0.5) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / ry, q = dx * dx + dy * dy;
    if (q > 1) continue;
    const lit = -dx * 0.55 - dy * 0.8 - q * 0.25 + (pxFbm(x * 0.3, y * 0.3) - 0.5) * k;
    T.px(x, y, pxPick(ramp, 0.5 + lit * 0.55, x, y));
  }
}
/** Trees by kind: a round leafy one, a pine, a giant glowcap, a dark yew, a bare winter one. h: how tall, in art pixels. */
function walkTree(kind, h, seed, land, season) {
  const R = seeded("tree" + seed), w = Math.round(kind === "pine" ? h * 0.62 : kind === "yew" ? h * 0.5 : kind === "cap" ? h * 0.8 : h * 0.78) + 6;
  const winter = season === "winter";
  if (kind === "round" && winter) kind = "bare";
  return isoArt(w, h + 4, T => {
    const cx = w / 2, base = h + 1, wood = walkHexes(["#2a1e1a", "#5e3a1c", "#946027", "#c98f3a"]);
    const trunk = (tw, th) => {
      for (let y = base - th; y <= base; y++) { const k = (y - (base - th)) / th, half = tw / 2 + k * k * 2; for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) T.px(x, y, pxPick(wood, 0.62 - (x - cx) / half * 0.42 - (y > base - 2 ? 0.2 : 0), x, y)); }
    };
    if (kind === "pine") {
      trunk(3, Math.round(h * 0.2));
      const tiers = 4 + Math.floor(R() * 2), ramp = walkHexes(WALK_PINE), snow = walkHexes(WALK_SNOW);
      for (let t = 0; t < tiers; t++) {
        const k = t / tiers, by = Math.round(base - h * 0.14 - k * h * 0.74), tw = (w / 2 - 2) * (1 - k * 0.72), th = h * 0.3 * (1 - k * 0.25);
        for (let y = Math.floor(by - th); y <= by; y++) {
          const f = (y - (by - th)) / th, half = tw * f;
          for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
            const side = (x - cx) / Math.max(1, half), lit = 0.55 - side * 0.35 - (by - y < 2 ? 0.3 : 0) + (pxHash(x, y) - 0.5) * 0.2;
            const white = (winter || land === "summit" && t >= tiers - 2) && y - (by - th) < 2 + 2 * (1 - f) + (side < 0 ? 1 : 0) && pxHash(x, y + seed) > 0.25;
            T.px(x, y, white ? pxPick(snow, 0.8 - side * 0.3, x, y) : pxPick(ramp, lit, x, y));
          }
        }
      }
      return;
    }
    if (kind === "cap") {
      const cols = [["#5c1f3f", "#8f3460", "#c25586", "#e88bb1"], ["#0f2f4a", "#1d5276", "#3383a8", "#69b7d6"], ["#5c1f3f", "#8f3460", "#c25586", "#ffc4da"]][seed % 3];
      const r = w / 2 - 3, top = base - h + r * 0.6, stem = walkHexes(["#5d5666", "#8a8494", "#b9b3c0", "#e4dfe8"]);
      for (let y = Math.round(top); y <= base; y++) { const half = 2 + (y - top) / (base - top) * 2.5 + (y > base - 3 ? 1.5 : 0); for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) T.px(x, y, pxPick(stem, 0.7 - (x - cx) / half * 0.4, x, y)); }
      // the gills: a dark band under the cap, a little light leaking from them
      for (let x = Math.floor(cx - r * 0.85); x <= cx + r * 0.85; x++) { T.px(x, top + 1, walkHexes([cols[0]])[0]); T.px(x, top + 2, walkHexes([cols[1]])[0]); }
      const ramp = walkHexes(cols);
      for (let y = Math.floor(top - r * 0.75); y <= top; y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - top) / (r * 0.75); if (dx * dx + dy * dy > 1) continue;
        T.px(x, y, pxPick(ramp, 0.62 - dx * 0.3 - dy * 0.35 + (pxFbm(x * 0.3, y * 0.3) - 0.5) * 0.25, x, y));
      }
      const spot = pxHex("#efe6ff");
      for (let k = 0; k < 5; k++) { const sx = Math.round(cx + (R() - 0.5) * r * 1.3), sy = Math.round(top - R() * r * 0.55 - 1); if (T.has(sx, sy) && T.has(sx + 1, sy + 1)) { T.px(sx, sy, spot); T.px(sx + 1, sy, spot); T.px(sx, sy + 1, spot); } }
      T.glow(cx, top + 2, r * 1.15, pxHex(cols[3]), 0.35);
      return;
    }
    if (kind === "bare") {
      const twig = walkHexes(["#2a1e1a", "#4a362c", "#6e5444"]), snow = pxHex("#e4dfe8");
      const branch = (x, y, a, len, wd, d) => {
        if (len < 2 || d > 6) return;
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len, n = Math.ceil(len);
        for (let i = 0; i <= n; i++) { const px = lerp(x, x2, i / n), py = lerp(y, y2, i / n); for (let k = -Math.floor(wd / 2); k <= Math.floor(wd / 2); k++) T.px(px + k, py, twig[k < 0 ? 2 : k > 0 ? 0 : 1]); if (winter && Math.cos(a) !== 0 && Math.abs(Math.sin(a)) < 0.8) T.px(px, py - 1, snow); }
        branch(x2, y2, a - 0.42 - R() * 0.25, len * 0.7, Math.max(1, wd - 1), d + 1);
        branch(x2, y2, a + 0.38 + R() * 0.25, len * 0.66, Math.max(1, wd - 1), d + 1);
      };
      trunk(4, Math.round(h * 0.35));
      branch(cx, base - h * 0.33, -Math.PI / 2 + (R() - 0.5) * 0.3, h * 0.26, 3, 0);
      return;
    }
    if (kind === "yew") {
      trunk(3, Math.round(h * 0.15));
      // a dark flame of a tree: one tall body, its edge broken by clumps
      const ramp = walkHexes(["#0b0614", "#10301f", "#1e5233", "#2f7d4a"]), r = w / 2 - 3, top = base - h * 0.9;
      walkBall(T, cx, base - h * 0.48, r, ramp, h * 0.44, 0.7);
      for (let k = 0; k < 9; k++) { const f = 0.15 + k / 9 * 0.75, side = k % 2 ? 1 : -1, wd = r * Math.sin(Math.PI * Math.min(1, (base - (top + f * h * 0.8)) / (h * 0.9)) * 0.9); walkBall(T, cx + side * wd * 0.85, top + f * h * 0.8, r * 0.36, ramp, r * 0.3, 0.6); }
      walkBall(T, cx, top + 4, r * 0.3, ramp, r * 0.35, 0.6);
      if (winter) for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (T.has(x, y) && !T.has(x, y - 1) && pxHash(x, y) > 0.3) T.px(x, y, pxHex("#e4dfe8"));
      return;
    }
    // a round leafy tree: a trunk with two limbs and a crown of clumps, each lit from the top left
    const th = Math.round(h * 0.42);
    trunk(4, th);
    const limb = (s) => { for (let i = 0; i < h * 0.18; i++) T.px(cx + s * (1 + i * 0.7), base - th * 0.7 - i, wood[s < 0 ? 2 : 1]); };
    limb(-1); limb(1);
    const ramp = walkHexes(WALK_LEAVES[season]), r = w * 0.2, top = base - h + r * 1.2;
    const clumps = [[0, 0.4, 1.15], [-0.85, 0.75, 0.9], [0.85, 0.7, 0.92], [-0.4, -0.15, 0.95], [0.45, -0.05, 0.9], [0, -0.5, 0.8]];
    for (const [dx, dy, k] of clumps) walkBall(T, cx + dx * r * 1.1 + (R() - 0.5) * 2, top + r * 0.9 + dy * r * 1.1, r * k, ramp, r * k * 0.9);
    if (season === "spring") for (let k = 0; k < 26; k++) { const x = Math.round(cx + (R() - 0.5) * w * 0.8), y = Math.round(top + R() * r * 2.4); if (T.has(x, y) && T.has(x, y - 1)) { T.px(x, y, pxHex(R() < 0.5 ? "#ffc4da" : "#efe6ff")); } }
  });
}
/** An old trunk in the hollow, so tall its crown is out of sight: roots spread at its foot, bark in long grooves. */
function walkTrunk(seed, w, h, season) {
  const R = seeded("trunk" + seed), W2 = w + 12;
  return isoArt(W2, h + 3, T => {
    const bark = walkHexes(["#160c26", "#2a1e1a", "#4a362c", "#6e5444"]), cx = W2 / 2, base = h + 2;
    for (let y = 0; y <= base; y++) {
      const flare = Math.max(0, (y - base + 14) / 14), half = w / 2 + flare * flare * 6;
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        const f = (x - cx) / half, groove = Math.abs(pxNoise(x * 0.9, y * 0.03 + seed) - 0.5) < 0.06;
        T.px(x, y, groove ? bark[0] : pxPick(bark, 0.62 - f * 0.45 - (y < h * 0.3 ? 0.2 : 0), x, y));
      }
    }
    // a bracket fungus or two, and moss on the shaded side
    for (let k = 0; k < 2; k++) { const fy = Math.round(base - 20 - R() * h * 0.4), fx = Math.round(cx + w / 2); for (let i = 0; i < 4; i++) T.px(fx + i - 1, fy, walkHexes(["#c98f3a"])[0]), T.px(fx + i - 1, fy - 1, walkHexes(["#eec26a"])[0]); }
    if (season !== "winter") for (let y = base - 40; y < base; y++) if (pxHash(y, seed) > 0.5) T.px(cx + w / 2 - 1, y, walkHexes(["#1e5233"])[0]);
  }, { texture: false });
}
/** A low bush; `berries` dots it with fruit, and a find can hide inside one. */
function walkBush(seed, w, season, berries) {
  const R = seeded("bush" + seed), h = Math.round(w * 0.62);
  return isoArt(w + 4, h + 4, T => {
    const ramp = walkHexes(season === "autumn" ? ["#5e3a1c", "#946027", "#c98f3a", "#eec26a"] : WALK_LEAVES[season === "winter" ? "summer" : season]);
    const cx = (w + 4) / 2, base = h + 2, r = w * 0.26;
    for (const [dx, dy, k] of [[-0.9, 0.2, 0.85], [0.9, 0.25, 0.8], [0, -0.25, 1.05], [-0.35, 0.35, 0.9], [0.4, 0.4, 0.85]]) walkBall(T, cx + dx * r, base - r * 0.9 + dy * r, r * k, ramp, r * k * 0.82);
    if (berries) for (let k = 0; k < 7; k++) { const x = Math.round(cx + (R() - 0.5) * w * 0.7), y = Math.round(base - R() * h * 0.7); if (T.has(x, y)) { T.px(x, y, pxHex("#3383a8")); T.px(x - 1, y - 1, pxHex("#b8e6f5")); } }
    if (season === "winter") for (let x = 0; x < w + 4; x++) for (let y = h + 3; y >= 1; y--) if (T.has(x, y) && !T.has(x, y - 1)) { T.px(x, y, pxHex("#ffffff")); T.px(x, y + 1, pxHex("#efe6ff")); if (pxHash(x, y) > 0.5) T.px(x, y + 2, pxHex("#d2bfff")); }
  });
}
function walkRock(seed, w, season) {
  const h = Math.round(w * 0.55);
  return isoArt(w + 4, h + 4, T => {
    walkBall(T, (w + 4) / 2, h + 2 - h * 0.45, w / 2, walkHexes(WALK_STONE.slice(1)), h * 0.55, 0.3);
    const moss = pxHex(season === "winter" ? "#ffffff" : "#57ad6a");
    for (let x = 0; x < w + 4; x++) for (let y = 0; y < h + 4; y++) if (T.has(x, y) && !T.has(x, y - 1) && pxHash(x, y + seed) > 0.35) T.px(x, y, moss);
  });
}
/** A broken bit of old wall, with ivy. */
function walkRuin(seed, w, h, season) {
  const R = seeded("ruin" + seed);
  return isoArt(w + 2, h + 2, T => {
    const st = walkHexes(WALK_STONE.slice(1)), top = x => Math.round(h * (0.15 + 0.5 * pxNoise(x * 0.18, seed)) + (x < 3 || x > w - 3 ? h * 0.2 : 0));
    for (let x = 1; x <= w; x++) for (let y = top(x); y <= h; y++) {
      const course = y % 5 === 0 || (x + Math.floor(y / 5) * 4) % 9 === 0;
      T.px(x, y, course ? st[0] : pxPick(st, 0.62 - x / w * 0.3 + (pxHash(x, y) - 0.5) * 0.2, x, y));
    }
    const ivy = walkHexes(["#1e5233", "#2f7d4a", "#57ad6a"]);
    for (let k = 0; k < w * 2; k++) { const x = 1 + Math.floor(R() * w), y = Math.round(top(x) + R() * h * 0.7); if (T.has(x, y)) T.px(x, y, ivy[Math.floor(R() * 3)]); }
    if (season === "winter") for (let x = 1; x <= w; x++) T.px(x, top(x), pxHex("#ffffff"));
  });
}
/** The end of each path: a little cairn with a crystal on top that glows when you reach it. */
function walkCairn() {
  return isoArt(22, 30, T => {
    const st = walkHexes(WALK_STONE.slice(1));
    walkBall(T, 11, 25, 9, st, 4, 0.2); walkBall(T, 10.5, 19, 7, st, 3.4, 0.2); walkBall(T, 11.5, 14, 5, st, 2.8, 0.2);
    const cr = walkHexes(["#6b4fa8", "#8a6cc9", "#d2bfff", "#efe6ff"]);
    T.poly([[11, 2], [8, 9], [11, 12], [11, 2]], cr[2]); T.poly([[11, 2], [14, 9], [11, 12]], cr[0]); T.poly([[11, 4], [9, 9], [11, 11]], cr[3]);
  });
}
/** The lookout at the top of the ledge: a wooden rail at the edge and a bench to sit on. */
function walkRail() {
  return isoArt(46, 24, T => {
    const wood = walkHexes(["#5e3a1c", "#946027", "#c98f3a"]);
    for (const x of [4, 22, 40]) for (let y = 6; y < 23; y++) { T.px(x, y, wood[1]); T.px(x + 1, y, wood[0]); }
    for (let x = 3; x < 43; x++) { T.px(x, 6, wood[2]); T.px(x, 7, wood[1]); T.px(x, 13, wood[2]); T.px(x, 14, wood[0]); }
  });
}
/** A clump of tall grass close to you (a fern in the wood, a snowy drift in winter), drawn dark against the light. */
function walkTuft(seed, h, season, land) {
  const R = seeded("tuft" + seed), w = Math.round(h * 0.9) + 6;
  return isoArt(w, h + 4, T => {
    const base = h + 3, cx = w / 2;
    const ramp = walkHexes(season === "winter" ? ["#160c26", "#2e1d4f", "#523a85", "#d2bfff"] : season === "autumn" ? ["#2a1e1a", "#4a362c", "#5e3a1c", "#946027"] : [land.grass[0], land.grass[0], land.grass[1], land.grass[2]]);
    const n = 6 + Math.floor(R() * 6);
    for (let b = 0; b < n; b++) {
      const bx = cx + (R() - 0.5) * w * 0.55, hb = h * (0.5 + R() * 0.5), lean = (R() - 0.5) * 1.6 + (bx - cx) / w * 1.4, wd = 1 + (R() < 0.5 ? 1 : 0);
      for (let k = 0; k < hb; k++) {
        const f = k / hb, px = bx + lean * f * f * hb * 0.5, py = base - k;
        for (let j = 0; j <= (f < 0.7 ? wd : 0); j++) T.px(px + j, py, pxPick(ramp, 0.25 + f * 0.55 - j * 0.25 + (b % 2) * 0.12, Math.round(px + j), py));
      }
    }
    if (land.caps && R() < 0.5) walkBall(T, cx + w * 0.2, base - h * 0.3, 4, walkHexes(["#5c1f3f", "#8f3460", "#c25586", "#e88bb1"]), 2.6, 0.2);
  });
}
/** The Gloom-thorn: a knot of ink-dark briars with cold violet tips, thinner at each stage as your light loosens it. */
function walkThornArt(stage, sway, w, h, seed) {
  const R = seeded("thorn" + seed);
  return isoArt(w, h, T => {
    const body = walkHexes(["#22143a", "#523a85", "#6b4fa8", "#8a6cc9"]), tip = walkHexes(["#8a6cc9", "#ad91e6", "#d2bfff", "#efe6ff"]);
    const keep = [11, 7, 4][stage];
    // briars knotted across the hollow: each a thick curve, lit along its top, with a hooked thorn every few pixels
    for (let k = 0; k < 11; k++) {
      const P = [[w * (0.04 + R() * 0.5), h - 3], [w * R(), h * (0.05 + R() * 0.2)], [w * R(), h * (0.05 + R() * 0.35)], [w * (0.5 + R() * 0.46), h * (0.25 + R() * 0.72)]];
      if (k % 2) P.reverse();
      if (k >= keep) continue;
      const n = 90;
      for (let i = 0; i <= n; i++) {
        const t = i / n, u = 1 - t, wob = Math.sin(t * 9 + sway + k) * 0.8;
        const x = u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0] + wob;
        const y = u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1];
        const r = t < 0.1 || t > 0.92 ? 0.8 : t < 0.4 ? 2.2 : 1.5;
        for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) if (dx * dx + dy * dy <= r * r + 0.3) T.px(x + dx, y + dy, body[dy < -r * 0.35 ? 3 : dy > r * 0.35 ? 0 : dx < 0 ? 2 : 1]);
        if (i % 8 === 4) { const sd = (i / 8) % 2 ? 1 : -1, o = Math.ceil(r) + 1; T.px(x, y + sd * o, body[2]); T.px(x + 1, y + sd * (o + 1), tip[0]); T.px(x + 2, y + sd * (o + 1), tip[1]); }
      }
      // a cold violet bud at the end, where the Gloom is thickest
      const [ex, ey] = P[3];
      T.px(ex, ey, tip[1]); T.px(ex + 1, ey, tip[2]); T.px(ex, ey - 1, tip[3]); T.px(ex + 1, ey + 1, tip[0]);
    }
    T.glow(w / 2, h * 0.55, w * 0.6, pxHex("#523a85"), 0.55 * keep / 11);
  });
}

/** Rock in rough blocks of different sizes, each lit at its top left, dark cracks between some, moss on a few ledges.
 *  dy: how far below the rock's top; k: across it, 0 lit side to 1 shaded side; tall: how tall the face is. */
function walkRockAt(stone, x, dy, k, tall, grass, winter) {
  // wavy strata rather than courses of brick: each layer rises and dips, broken into blocks of any width
  const rock = stone.slice(1, 5), rh = 8, wy = dy + 5 * pxNoise(x * 0.035, 3) + 3 * pxNoise(x * 0.11, 9), row = Math.floor(wy / rh), fyR = (((wy % rh) + rh) % rh) / rh;
  const off = Math.floor(pxHash(row, 5) * 17), bw = 7 + Math.floor(pxHash(Math.floor((x + off) / 19), row) * 16);
  const bx = Math.floor((x + off) / bw), fx = ((x + off) % bw) / bw, v = pxHash(bx, row);
  if ((fx * bw < 1 && v > 0.45 && fyR > 0.2) || (fyR * rh < 1 && pxHash(x >> 2, row) > 0.4)) return rock[0];
  if (fyR * rh < 2 && pxNoise(x * 0.1, row) > 0.55) return winter ? pxHex("#e4dfe8") : grass[2];
  return pxPick(rock, 0.68 - k * 0.38 + (v - 0.5) * 0.34 - fyR * 0.24 - fx * 0.1 - dy / tall * 0.12 + (pxNoise(x * 0.25, dy * 0.25) - 0.5) * 0.2, x, dy);
}
/** A canvas in art pixels with a pixel buffer to paint into; `done()` puts the pixels down. */
function walkCanvas(w, h) {
  const c = document.createElement("canvas"); c.width = Math.max(1, w); c.height = Math.max(1, h);
  const g = c.getContext("2d"), img = g.createImageData(c.width, c.height), d = img.data;
  const put = (x, y, col) => { if (x < 0 || y < 0 || x >= c.width || y >= c.height || !col) return; const i = (y * c.width + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
  return { c, g, d, put, has: (x, y) => x >= 0 && y >= 0 && x < c.width && y < c.height && d[(y * c.width + x) * 4 + 3] > 0, done: () => g.putImageData(img, 0, 0) };
}
/** Where a point of the path shows on a slower layer, when the camera has it in the middle of the screen. */
const walkOnLayer = (geo, x, k) => Math.round(x * k + (1 - k) * geo.AW / 2);

/** Paint every layer of a walk once: the backdrop, the far trees, the path and what grows along it, the grass in front. */
function walkBake(g) {
  const geo = g.geo, { AW, AH, len, y0 } = geo, land = WALK_LAND[g.theme], season = g.season, winter = season === "winter";
  const R = seeded(`walk|${g.path}|${g.theme}|${season}`), K = { far: 0.12, mid: 0.45, front: 1.3 };
  const widthAt = k => Math.ceil(AW + Math.max(0, len - AW) * k) + 2;
  const grass = walkHexes(winter ? WALK_SNOWBANK : land.grass), dirt = walkHexes(WALK_DIRT), stone = walkHexes(WALK_STONE), water = walkHexes(WALK_WATER);
  const ground = x => walkGround(geo, x);
  const dark = geo.dark, darkK = x => !dark ? 0 : clamp(Math.min(x - dark.x0, dark.x1 - x) / 40 + 0.5, 0, 1);

  // the far land: the backdrop itself (the same picture as the garden's), a little wider so it drifts slowly behind
  const far = paintTheme(g.theme, widthAt(K.far), AH, (y0 - 16) / AH);

  // the far trees: a row of dark shapes against the sky, a lighter rim where the moon catches them
  const M = walkCanvas(widthAt(K.mid), AH), mw = M.c.width, mask = new Uint8Array(mw * AH);
  const blob = (cx, cy, rx, ry, v) => { for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(AH - 1, cy + ry); y++) for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(mw - 1, cx + rx); x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) mask[y * mw + x] = Math.max(mask[y * mw + x], v); };
  const tri = (cx, base, hw, h, v) => { for (let y = Math.max(0, Math.round(base - h)); y <= Math.min(AH - 1, base); y++) { const half = hw * (y - (base - h)) / h; for (let x = Math.max(0, Math.floor(cx - half)); x <= Math.min(mw - 1, cx + half); x++) mask[y * mw + x] = Math.max(mask[y * mw + x], v); } };
  const hz = y0 - 10, mDark = dark ? [walkOnLayer(geo, dark.x0, K.mid) - 30, walkOnLayer(geo, dark.x1, K.mid) + 30] : null;
  const mLedge = geo.ledge ? walkOnLayer(geo, geo.ledge.x0, K.mid) : Infinity;
  for (let row = 0; row < 2; row++) for (let x = -20; x < mw + 20; x += 9 + Math.floor(R() * 12)) {
    const deep = mDark && walkIn(x, mDark[0], mDark[1]), low = x > mLedge ? clamp(1 - (x - mLedge) / (AW * 0.5), 0.15, 1) : 1;
    const h = AH * (row ? 0.1 : 0.16) * (0.7 + R() * 0.6) * (deep ? 1.9 : 1) * low, base = hz + row * 3, v = row + 1, kind = deep && land.mid !== "pine" ? "yew" : land.mid;
    if (kind === "pine") { tri(x, base, h * 0.32, h, v); }
    else if (kind === "cap") { if (R() < 0.4) { blob(x, base - h * 0.3, 1.5, h * 0.3, v); blob(x, base - h * 0.6, h * 0.3, h * 0.13, v); } else { blob(x, base - h * 0.55, h * 0.3, h * 0.36, v); blob(x + h * 0.18, base - h * 0.32, h * 0.22, h * 0.24, v); } }
    else if (kind === "yew") { blob(x, base - h * 0.5, h * 0.24, h * 0.55, v); }
    else { blob(x, base - h * 0.55, h * 0.36, h * 0.38, v); blob(x - h * 0.2, base - h * 0.35, h * 0.26, h * 0.26, v); }
  }
  for (let y = hz; y < AH; y++) for (let x = 0; x < mw; x++) mask[y * mw + x] = Math.max(mask[y * mw + x], 2);
  // (nothing stands between the lookout and the view)
  if (geo.edge) { const m0 = Math.round(geo.edge - (1 - K.mid) * (len - AW)); for (let y = 0; y < AH; y++) mask.fill(0, y * mw + Math.max(0, m0), y * mw + mw); }
  // (the back row a little lighter, as if through the night air; the near row darker; both rimmed where the moon catches them)
  const [backC, nearC, rim1, rim2] = walkHexes(land.far);
  for (let y = 0; y < AH; y++) for (let x = 0; x < mw; x++) {
    const v = mask[y * mw + x]; if (!v) continue;
    const edge = (y > 0 && mask[(y - 1) * mw + x] < v) || (x > 0 && mask[y * mw + x - 1] < v);
    M.put(x, y, edge && y < hz ? (v === 2 ? rim2 : rim1) : v === 2 ? nearC : backC);
  }
  // glowcaps far off still glow a little under their caps
  if (land.caps) for (let k = 0; k < mw / 40; k++) { const x = Math.floor(R() * mw), y = hz - Math.floor(R() * AH * 0.1) - 4; if (mask[y * mw + x]) M.put(x, y, pxHex(pick(["#e88bb1", "#69b7d6", "#d2bfff"]))); }
  M.done();

  // ---------- the path itself ----------
  const main = document.createElement("canvas"); main.width = len; main.height = AH;
  const mg = main.getContext("2d");
  const finds = new Set(g.plan.filter(f => f.at === "bush").map(f => Math.round(f.u * geo.base)));
  const busy = x => (geo.hill && walkIn(x, geo.hill.x0 - 10, geo.hill.x1 + 10)) || (geo.stream && walkIn(x, geo.stream.x0 - 40, geo.stream.x1 + 40))
    || [...finds].some(f => Math.abs(f - x) < 22) || Math.abs(x - geo.end) < 18 || (geo.ledge && x > geo.ledge.x0 - 10);
  const put = (c, x, base) => mg.drawImage(c, Math.round(x - c.width / 2), Math.round(base - c.height + 2));
  // behind the path: trees, bushes, rocks and ruins on the far verge (their feet tuck in behind its grass)
  for (let x = 12; x < len; x += 20 + Math.floor(R() * 30)) {
    if (busy(x)) continue;
    const dk = darkK(x) > 0.5, r = R(), base = ground(x) - 1;
    if (dk) { put(walkTrunk(Math.floor(R() * 999), 9 + Math.floor(R() * 8), base, season), x, base); continue; }
    if (r < 0.55) {
      const kind = land.trees[Math.floor(R() * land.trees.length)];
      const tall = dk ? 0.4 : kind === "cap" ? 0.08 + R() * 0.07 : kind === "pine" ? 0.2 + R() * 0.14 : 0.17 + R() * 0.12;
      put(walkTree(kind, Math.round(AH * tall), Math.floor(R() * 999), g.theme, dk && kind === "round" ? "summer" : season), x, base);
    } else if (r < 0.72 && land.ruins) put(walkRuin(Math.floor(R() * 99), 22 + Math.floor(R() * 16), 12 + Math.floor(R() * 12), season), x, base);
    else if (r < 0.85 && land.rocks) put(walkRock(Math.floor(R() * 99), 10 + Math.floor(R() * 8), season), x, base + 1);
    else put(walkBush(Math.floor(R() * 999), 14 + Math.floor(R() * 8), season, R() < 0.3), x, base + 1);
  }
  if (geo.ledge) for (let x = geo.ledge.x0 - 6; x < geo.edge - 20; x += 30 + Math.floor(R() * 30)) put(walkRock(Math.floor(R() * 99), 10 + Math.floor(R() * 10), season), x, ground(x));
  // the end of the path
  if (!geo.ledge) put(walkCairn(), geo.end + 10, ground(geo.end + 10) + 1);

  const T = walkCanvas(len, AH), P = T.put;
  // the cliff behind the stream: stacked mossy rock, its waterfall, and the pool at its foot
  const st = geo.stream, ink = pxHex("#22143a");
  const streamAt = y => { const d = Math.max(0, y - y0), c = (st.x0 + st.x1) / 2 + Math.sin(d * 0.045) * d * 0.14, hw = (st.x1 - st.x0) / 2 + d * 0.2; return [c - hw, c + hw]; };
  if (st) {
    const c0 = st.x0 - 52, c1 = st.x1 + 52, fc = Math.round((st.x0 + st.x1) / 2);
    st.fall = { x: fc - 5, w: 11 };
    for (let x = c0; x <= c1; x++) {
      // a crag with a flat-ish top and steep shoulders, its edge broken into steps
      const k = (x - c0) / (c1 - c0), hump = pxSmooth(0, 0.24, k) * pxSmooth(1, 0.8, k);
      let ct = Math.round(y0 - (y0 - st.top) * hump * (0.86 + 0.14 * Math.sin(k * 5 + 1)) + 4 * Math.round(2 * pxNoise(x * 0.07, 3)) + 2 * (pxHash(Math.floor(x / 4), 1) > 0.7 ? 1 : 0));
      if (Math.abs(x - fc) < 8) ct += Math.round(4 - Math.abs(x - fc) * 0.4);
      if (x === fc) st.fall.y = ct + 2;
      for (let y = ct; y < ground(x); y++) {
        const dy = y - ct;
        let col = walkRockAt(stone, x, dy, k, y0 - st.top, grass, winter);
        if (dy < 3) col = dy === 0 ? ink : winter ? pxHex("#ffffff") : grass[dy === 1 ? 4 : 3];
        const f = Math.abs(x - fc);
        if (f <= 5 && dy > 0) col = f === 5 ? water[1] : f === 4 ? water[2] : water[(x + Math.floor(y / 3)) % 3 ? 3 : 4];
        P(x, y, col);
      }
    }
    // the pool where it lands, foaming under the fall
    const pt = ground(fc), prx = (st.x1 - st.x0) / 2 + 10;
    for (let y = pt - 5; y < pt; y++) for (let x = Math.floor(fc - prx); x <= fc + prx; x++) {
      const q = ((x - fc) / prx) ** 2 + ((y - pt + 0.5) / 5) ** 2; if (q > 1) continue;
      P(x, y, q > 0.8 ? stone[2] : Math.abs(x - fc) < 7 && pxHash(x, y) > 0.35 ? water[5] : water[q > 0.5 ? 2 : 3]);
    }
    st.pool = pt - 3;
  }
  for (let x = 0; x < len; x++) {
    const top = ground(x), dk = darkK(x), gr = dk ? [grass[0], ...grass.slice(0, -1)] : grass, dt = dk ? [dirt[0], ...dirt.slice(0, -1)] : dirt;
    const stream = st && walkIn(x, st.x0 - (AH - top) * 0.45, st.x1 + (AH - top) * 0.45);
    // the grass on the far side of the path: little blades against whatever stands behind
    const blade = Math.floor(pxHash(x, 17) * 4.5) + (pxHash(x, 23) > 0.85 ? 2 : 0);
    if (!(st && walkIn(x, st.x0 - 2, st.x1 + 2))) for (let y = top - blade; y < top; y++) P(x, y, y === top - blade ? gr[4] : gr[3]);
    // the rock face under a path that has climbed
    const low = geo.y0 + Math.round(1.4 * Math.sin(x * 0.012 + geo.seed) + 0.8 * Math.sin(x * 0.031));
    const vista = geo.edge && x > geo.edge;
    for (let y = top; y < AH; y++) {
      let col;
      const d = y - top;
      if (vista) break;
      if (stream && y >= top - 1) {
        // the stream runs toward you, winding and widening, between stony banks
        const [l, r] = streamAt(y), edge = Math.min(x - l, r - x);
        if (edge >= -1) {
          col = edge < 1 ? (pxHash(x, y) > 0.5 ? stone[3] : stone[2]) : edge < 2.5 ? water[1] : pxPick(water.slice(1, 5), 0.3 + 0.22 * pxNoise(x * 0.2, y * 0.03) + (pxNoise(x * 0.6, y * 0.05) > 0.66 ? 0.35 : 0) - (y - top) / AH * 0.4, x, y);
          P(x, y, col); continue;
        }
      }
      // the path: packed earth lit along its far edge, the odd pebble, a darker lip at the front
      if (d === 0) col = winter ? pxHex("#ffffff") : dt[4];
      else if (d < WALK_PATH - 1) col = winter && pxHash(x, y) > 0.3 + d * 0.06 ? (d < 3 ? grass[3] : grass[2]) : pxHash(x * 3, y) > 0.95 ? stone[d < 4 ? 5 : 4] : pxPick(dt.slice(1, 4), 0.85 - d * 0.075 + (pxNoise(x * 0.18, y * 0.5) - 0.5) * 0.45, x, y);
      else if (d === WALK_PATH - 1) col = dt[1];
      // (up at the lookout the rock goes all the way down: the land is far below, under the cloud)
      else if (y < low + WALK_PATH || (geo.ledge && x > geo.ledge.x1 - (y - low) * 0.6)) col = walkRockAt(stone, x, y - top - WALK_PATH, 0.5 + (x - geo.ledge.x0) / (geo.edge - geo.ledge.x0) * 0.1, (low - top) * 1.4, grass, winter);
      else {
        // the near bank: rows of grass blades, each row's blades standing up in front of the row behind, lit at their tips
        const ry = y - Math.max(top, low) - WALK_PATH, r = Math.floor(ry / 4), up = (r + 1) * 4 - ry;
        const blade = pxHash(x * 7, r + 1) > 0.35 ? 1 + Math.floor(pxHash(x, r + 1) * 5) : 0;
        let v = (winter ? 0.8 : 0.56) - ry / (AH * 0.5) + (pxFbm(x * 0.05, y * 0.06) - 0.5) * 0.5 - dk * 0.3 - (ry < 4 ? 0.16 : 0);
        if (winter) v = 0.86 - ry / (AH * 0.7) + (pxFbm(x * 0.03, y * 0.05) - 0.5) * 0.4 - dk * 0.3 + (pxHash(x, y) > 0.992 ? 0.5 : 0);
        else v += up <= blade ? (up === blade ? 0.26 : 0.12) : -(ry - r * 4) * 0.04;
        col = pxPick(gr.slice(0, 5), v, x, y);
      }
      P(x, y, col);
    }
    // grass blades reaching up over the path's front edge
    if (!stream && !vista && pxHash(x, 41) > 0.45) { const hb = 1 + Math.floor(pxHash(x, 43) * 3); for (let k = 0; k < hb; k++) P(x, top + WALK_PATH - k, k === hb - 1 ? gr[3] : gr[2]); }
  }
  // the stepping stones, wet underneath
  if (st) for (const sx of st.stones) {
    const sy = ground(sx) + 3;
    for (let y = sy - 5; y <= sy + 4; y++) for (let x = sx - 9; x <= sx + 9; x++) {
      const q = ((x - sx) / 9) ** 2 + ((y - sy) / 4.5) ** 2; if (q > 1) continue;
      P(x, y, q > 0.86 ? ink : y >= sy + 2 ? water[0] : pxPick(stone.slice(1, 6), 0.8 - (x - sx) / 18 - (y - sy + 4) * 0.08, x, y));
    }
    for (let x = sx - 10; x <= sx + 10; x++) if (pxHash(x, 7) > 0.35) P(x, sy + 5, water[4]);
  }
  // the hill, and the hollow way under it
  const hl = geo.hill;
  if (hl) for (let x = hl.x0; x <= hl.x1; x++) {
    const top = ground(x), hy = walkHillTop(geo, x), ax = (x - hl.ax) / hl.aw, inArch = Math.abs(ax) < 1, archTop = inArch ? top - hl.ah * Math.sqrt(1 - ax * ax) : Infinity;
    for (let y = hy; y < top + WALK_PATH; y++) {
      const d = y - hy;
      let col;
      if (y > archTop + 2) col = y >= top ? (y === top ? dirt[1] : dirt[0]) : PX_BAYER[(y & 3) * 4 + (x & 3)] < 0.18 * (1 - (y - archTop) / hl.ah) ? stone[1] : stone[0];
      else if (y >= archTop - 1) col = pxPick(stone.slice(2, 6), 0.7 - ax * 0.3, x, y);
      else if (d === 0) col = winter ? pxHex("#ffffff") : grass[4];
      else if (d < 3) col = winter ? grass[3] : grass[3];
      else col = pxPick(grass.slice(0, 4), 0.72 - d / (hl.h + 6) * 0.5 - (x - hl.x0) / (hl.x1 - hl.x0) * 0.2 + (pxFbm(x * 0.15, y * 0.15) - 0.5) * 0.4, x, y);
      P(x, y, col);
    }
    if (y0 > hy + 3 && pxHash(x, 91) > 0.5) P(x, hy - 1, grass[4]);
  }
  // the view from the ledge: a sea of cloud below, lit by the moon along its tops, and through a gap in it, far down,
  // the warm lights of home
  if (geo.edge) {
    const lt = ground(geo.edge), vw = len - geo.edge, top = lt + 18;
    const cloud = walkHexes(winter ? ["#1d5276", "#3383a8", "#69b7d6", "#b8e6f5", "#ffffff"] : ["#22143a", "#3d2866", "#6b4fa8", "#ad91e6", "#d2bfff"]);
    // puffs: a row along the top so the sea has an edge, then more, bigger and nearer further down; nearer ones drawn over
    const puffs = [];
    for (let x = geo.edge - 20; x < len + 30; x += 16 + Math.floor(R() * 14)) puffs.push([x, top + 4 + R() * 6, 12 + R() * 12]);
    for (let k = 0; k < vw / 9; k++) { const y = top + 12 + Math.pow(R(), 1.4) * AH * 0.36; puffs.push([geo.edge - 20 + R() * (vw + 50), y, 14 + R() * 20 + (y - top) * 0.12]); }
    puffs.sort((a, b) => a[1] - b[1]);
    const gaps = [[0.5, 0.22, 0.05, 0.018], [0.66, 0.3, 0.035, 0.014], [0.3, 0.27, 0.03, 0.012]].map(([gx, gy, rx, ry]) => [geo.edge + vw * gx, top + AH * gy, vw * rx, AH * ry]);
    for (let x = geo.edge; x < len; x++) {
      const drop = lt + Math.max(0, 46 - (x - geo.edge) * 5);
      for (let y = lt; y < drop; y++) P(x, y, y === lt ? (winter ? pxHex("#ffffff") : grass[4]) : walkRockAt(stone, x, y - lt, 0.4 + (x - geo.edge) / 10, 46, grass, winter));
      for (let y = Math.max(drop, top - 30); y < AH; y++) {
        // whichever puff is nearest decides the shade: lit along its top, into shadow below; between them, the cloud's body
        let col = y > top + 8 ? pxPick(cloud, 0.32 - (y - top) / AH * 0.4, x, y) : null;
        for (const [px, py, r] of puffs) {
          const dx = (x - px) / r, dy = (y - py) / (r * 0.62), q = dx * dx + dy * dy;
          if (q <= 1) col = pxPick(cloud, 0.92 - dy * 0.42 - dx * 0.12 - q * 0.3 - (py - top) / AH * 0.5, x, y);
        }
        const gd = Math.min(...gaps.map(([gx, gy, rx, ry]) => Math.hypot((x - gx) / rx, (y - gy) / ry)));
        if (gd < 1 && col && PX_BAYER[(y & 3) * 4 + (x & 3)] < (1 - gd) * 0.5) col = pxHex(gd < 0.4 ? "#fff0b5" : "#eec26a");
        if (col) P(x, y, col);
      }
    }
    for (const [x, y] of gaps) { P(Math.round(x), Math.round(y), pxHex("#ffffff")); P(Math.round(x) + 1, Math.round(y), pxHex("#fff0b5")); }
  }
  T.done();
  mg.drawImage(T.c, 0, 0);
  if (geo.edge) put(walkRail(), geo.edge - 8, ground(geo.edge - 8) + 2);
  // flowers on the near bank, and the odd bush and stone in front of the path
  const fl = walkHexes(land.flowers), stem = grass[2];
  // (in patches of one colour, the way wildflowers grow: little crosses, the odd daisy, buds)
  const patches = winter ? len / 120 : season === "autumn" ? len / 60 : len / 34;
  for (let i = 0; i < patches; i++) {
    const cx = Math.floor(R() * len), cy = ground(cx) + WALK_PATH + 4 + Math.floor(R() * AH * 0.24), n = 4 + Math.floor(R() * 9);
    const c = winter ? pxHex("#ffffff") : season === "autumn" ? pxHex(pick(["#8a6cc9", "#ad91e6", "#eec26a"])) : fl[Math.floor(R() * fl.length)];
    for (let k = 0; k < n; k++) {
      const x = Math.round(cx + (R() - 0.5) * 26), y = Math.round(cy + (R() - 0.5) * 10), top = ground(x);
      if ((st && walkIn(x, st.x0 - (y - top) * 0.3 - 3, st.x1 + (y - top) * 0.3 + 3)) || (geo.edge && x > geo.edge - 2) || y >= AH - 2 || y < top + WALK_PATH + 2) continue;
      const big = R();
      mg.fillStyle = `rgb(${stem})`; mg.fillRect(x, y, 1, 2 + (big > 0.6 ? 1 : 0));
      mg.fillStyle = `rgb(${c})`;
      if (big > 0.8) { mg.fillRect(x - 2, y - 2, 5, 1); mg.fillRect(x, y - 4, 1, 5); mg.fillRect(x - 1, y - 3, 3, 3); mg.fillStyle = "#eec26a"; mg.fillRect(x, y - 2, 1, 1); }
      else if (big > 0.25) { mg.fillRect(x - 1, y - 1, 3, 1); mg.fillRect(x, y - 2, 1, 3); mg.fillStyle = "#eec26a"; mg.fillRect(x, y - 1, 1, 1); }
      else mg.fillRect(x, y - 1, 1, 1);
    }
  }
  for (let x = 30; x < len; x += 50 + Math.floor(R() * 80)) {
    const top = ground(x), y = Math.round(top + WALK_PATH + 12 + R() * AH * 0.16), r = R();
    if ((st && walkIn(x, st.x0 - 60, st.x1 + 60)) || (geo.edge && x > geo.ledge.x0 - 20)) continue;
    put(land.caps && r < 0.35 ? walkTree("cap", 22 + Math.floor(R() * 16), Math.floor(R() * 99), g.theme, season) : r < 0.75 ? walkBush(Math.floor(R() * 999), 22 + Math.floor(R() * 14), season, R() < 0.4) : walkRock(Math.floor(R() * 99), 10 + Math.floor(R() * 10), season), x, y);
  }
  // the hollow's roof: old branches hanging low, so the light can't get in
  if (dark) {
    const D = walkCanvas(dark.x1 - dark.x0 + 80, Math.round(AH * 0.5)), lv = walkHexes(["#0b0614", "#10301f", "#1e5233"]);
    for (let x = 0; x < D.c.width; x++) {
      const k = Math.min(x, D.c.width - x) / 40, hang = Math.round(AH * (0.22 + 0.1 * pxNoise(x * 0.05, 2)) * clamp(k, 0, 1) + 8 * pxNoise(x * 0.3, 4));
      for (let y = 0; y < hang; y++) D.put(x, y, pxPick(lv, 0.15 + (y / hang) * 0.25 + (pxFbm(x * 0.2, y * 0.2) - 0.5) * 0.5, x, y));
      if (pxHash(x, 5) > 0.93) for (let y = hang; y < hang + 6 + pxHash(x, 6) * 22; y++) D.put(x, y, lv[1]);
    }
    D.done();
    mg.drawImage(D.c, dark.x0 - 40, 0);
  }

  // ---------- in front: tall grass and ferns close to you, drifting past faster ----------
  const F = walkCanvas(widthAt(K.front), AH), fw = F.c.width, fg = walkHexes(winter ? WALK_SNOW : [land.grass[0], land.grass[1], land.grass[2], land.grass[3]]);
  // a dark hem along the bottom, so the near grass stands against something
  for (let x = 0; x < fw; x++) { const hh = Math.round(4 + 3 * pxNoise(x * 0.05, 8)); for (let y = AH - hh; y < AH; y++) F.put(x, y, fg[y > AH - hh + 1 ? 0 : 1]); }
  F.done();
  for (let x = 10; x < fw; x += 55 + Math.floor(R() * 90)) {
    const tuft = walkTuft(Math.floor(R() * 999), Math.round(AH * (0.07 + R() * 0.08)), season, land);
    F.g.drawImage(tuft, Math.round(x - tuft.width / 2), AH - tuft.height + 6);
  }
  g.L = { far, mid: M.c, main, front: F.c, K };
  g.glows = dark ? Array.from({ length: Math.round((dark.x1 - dark.x0) / 9) }, () => { const x = Math.round(dark.x0 + 20 + R() * (dark.x1 - dark.x0 - 40)); return { x, y: Math.round(ground(x) - 2 - (R() < 0.4 ? R() * AH * 0.35 : -R() * AH * 0.2)), c: pick(["#69b7d6", "#b8e6f5", "#d2bfff", "#a3dd9b"]), ph: R() * TAU }; }) : [];
  g.thornArt = [0, 1, 2].map(s => [0, 1].map(f => walkThornArt(s, f * 1.7, Math.round(hl ? hl.aw * 2.1 : 30), Math.round(hl ? hl.ah * 1.02 : 30), g.path)));
  g.bushArt = g.plan.filter(f => f.at === "bush").map((f, i) => walkBush(500 + i, 32, season, true));
}

// ---------- on the path: laying it out, walking, finding, the thorn, the dark ----------

/** Fit the walk to the screen (again, when the screen or the pixel size changes): everyone keeps their place along the path. */
function walkLayout() {
  const g = game.walk, key = `${W}|${H}|${PX}`;
  if (!g || g.key === key) return;
  const old = g.geo, geo = g.geo = walkGeo(g), k = old ? geo.base / old.base : 1;
  g.key = key;
  if (old) { g.cam *= k; for (const p of g.pals) { p.x *= k; p.tx *= k; } if (g.lamp) g.lamp.x *= k; }
  else {
    g.pals = g.who.map((id, i) => ({ id, x: -geo.s * (1 + i * 0.9), tx: geo.start - i * geo.s * 0.85, v: 0, alt: 0, hop: 0, over: null, gait: 0, seg: -1, stepT: 0, happy: 1.5, emote: null }));
    g.dir = 1;
  }
  for (const f of g.plan) {
    f.x = Math.round(f.u * geo.base);
    if (f.at === "stone" && geo.stream) f.x = geo.stream.stones[1];
    if (!f.state) f.state = f.at === "bush" || f.at === "dark" ? "hidden" : "shown";
  }
  const t0 = performance.now();
  walkBake(g);
  g.bakeMs = Math.round(performance.now() - t0);
  quality.settle(2500);
}
const walkCr = id => save.creatures.find(c => c.id === id);
/** How fast a glowling strolls, in art pixels a second: by its kind and its age, like at home. */
function walkPace(p) {
  const cr = walkCr(p.id), sp = cr && specOf(cr), calm = calmOf(cr?.level), g = game.walk;
  return (sp && (sp.beh === "flutter" || sp.beh === "swim") ? 60 : sp?.beh === "nap" ? 36 : 48) * g.geo.s / 100 * calm.go;
}
/** Where the stream's hops go: the near bank, each stone, the far bank. */
const walkHops = st => [st.x0 - 3, ...st.stones, st.x1 + 3];
/** Nobody stops in mid-air over the water: a spot on the stream becomes the nearest stone (or bank). */
const walkSnap = (geo, x) => { const st = geo.stream; if (!st || !walkIn(x, st.x0 - 3, st.x1 + 3)) return x; return walkHops(st).reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a); };

function updateWalk(dt) {
  const g = game.walk;
  if (!g || !g.geo || g.ended) return;
  g.t += dt;
  const geo = g.geo, lead = g.pals[0], calm = opts().calm, st = geo.stream, hl = geo.hill;
  g.pals.forEach((p, i) => {
    const cr = walkCr(p.id), sp = cr && specOf(cr);
    if (i) p.tx = walkSnap(geo, clamp(g.pals[i - 1].x - g.dir * geo.s * 0.85, -geo.s * 2, geo.end));
    const d = p.tx - p.x, e = clamp(Math.abs(d) / (geo.s * 0.6), 0, 1);
    // uphill is slower, a little; a hop across water a touch quicker
    const slope = Math.abs(walkGround(geo, p.x + Math.sign(d || 1) * 3, p.over) - walkGround(geo, p.x, p.over)) / 3;
    const want = Math.abs(d) < 0.5 ? 0 : Math.sign(d) * walkPace(p) * (0.2 + 0.8 * e * e * (3 - 2 * e)) / (1 + slope * 1.6);
    p.v = lerp(p.v, want, Math.min(1, dt * 3));
    const step = p.v * dt;
    p.x = Math.abs(step) > Math.abs(d) ? p.tx : p.x + step;
    // the hill: the top of it while the thorn still tangles the hollow way, through underneath once it's open
    if (hl && walkIn(p.x, hl.x0, hl.x1)) { if (p.over === null) p.over = g.thorn < 3; } else p.over = null;
    // the stream: from stone to stone in little arcs, a plip each landing
    let alt = 0;
    if (st && walkIn(p.x, st.x0 - 3, st.x1 + 3)) {
      const h = walkHops(st), s = h.findIndex((x, k) => k < h.length - 1 && p.x >= x && p.x <= h[k + 1]);
      if (s >= 0) {
        const k = (p.x - h[s]) / (h[s + 1] - h[s]);
        alt = Math.sin(k * Math.PI) * geo.s * (calm ? 0.2 : 0.32);
        if (p.seg >= 0 && s !== p.seg) walkPlip(s);
        p.seg = s;
      }
    } else p.seg = -1;
    // how each kind moves: a hopper bounces along, a flier floats, the rest glide with a soft step
    const moving = Math.abs(p.v) > 2;
    if (!alt && sp?.beh === "hop" && (moving || p.gait % 1 > 0.05)) { p.gait += dt * 1.6; alt = Math.sin((p.gait % 1) * Math.PI) * geo.s * 0.12 * calmOf(cr.level).hop; }
    else if (sp?.beh === "flutter") alt = geo.s * (0.35 + 0.08 * Math.sin(g.t * 2.2 + i));
    else if (sp?.beh === "swim") alt = geo.s * (0.18 + 0.06 * Math.sin(g.t * 1.4 + i));
    p.alt = lerp(p.alt, alt, Math.min(1, dt * 12));
    p.hop = Math.max(0, p.hop - dt * 2.5);
    p.happy = Math.max(0, p.happy - dt);
    if (p.emote && (p.emote.t += dt) > p.emote.life) p.emote = null;
    if (moving && !alt && (p.stepT -= dt * Math.abs(p.v) / (geo.s * 0.32)) < 0) { p.stepT = 1; walkStep(g.season === "winter"); }
  });
  // the camera keeps the one you lead a little left of the middle, so you see where you're going
  const want = geo.ledge && lead.x > geo.ledge.x1 ? geo.len - geo.AW : clamp(lead.x - geo.AW * (g.dir > 0 ? 0.38 : 0.62), 0, Math.max(0, geo.len - geo.AW));
  g.cam = lerp(g.cam, want, Math.min(1, dt * (calm ? 1.6 : 2.2)));
  // finds: picked up by whoever walks over them
  for (const f of g.plan) {
    if (f.state === "pop" && (f.t += dt) > 0.45) f.state = "shown";
    if (f.state === "got") { f.t += dt; continue; }
    if (f.state === "hidden" && f.at === "dark" && walkLit(f.x, walkGround(geo, f.x) - 6) > 0.4) { f.state = "shown"; f.t = 0; sfx.shimmer(); }
    if (f.state === "hidden" && f.at === "bush" && Math.abs(lead.x - f.x) < geo.s * 0.9 && !f.sniffed) { f.sniffed = true; lead.emote = { text: "?", t: 0, life: 1.6 }; walkSay(tr("Something rustles in that bush. Tap it"), "bush"); }
    if (f.state !== "shown") continue;
    const p = g.pals.find(q => Math.abs(q.x - f.x) < geo.s * 0.22 && q.alt < geo.s * 0.4);
    if (p) walkCollect(f, p);
  }
  // a word at the new things, once each
  const near = (a, b) => lead.x > a - geo.AW * 0.45 && lead.x < b;
  if (hl && g.thorn < 3 && near(hl.x0, hl.x1)) walkSay(tr("Gloom-thorn has tangled the hollow way. Tap it with your light"), "thorn");
  else if (geo.dark && walkIn(lead.x, geo.dark.x0 - 10, geo.dark.x1)) walkSay(tr("It's dark under the trees. Tap to lift your lantern"), "dark");
  else if (st && near(st.x0, st.x1)) walkSay(tr("Hop, hop, hop: over the stepping stones"), "stream");
  if (g.lamp) g.lamp.t += dt;
  // the end of the path: a chime at the cairn (or the view from the ledge), a moment to enjoy it, then home
  if (!g.reached && lead.x >= geo.end - 2) {
    g.reached = true; g.endT = 0; setHint("");
    for (const p of g.pals) { p.hop = 1; p.happy = 9; }
    if (geo.ledge) { lead.say = tr("What a view."); [0, 0.5, 1.1].forEach((d, k) => setTimeout(() => sfx.ding(4 + k * 3), d * 1000)); }
    else { sfx.gleam(); walkRing(geo.end + 10, walkGround(geo, geo.end + 10) - 24, "#d2bfff", 1.2); }
  }
  if (g.reached && (g.endT += dt) > (geo.ledge ? 3.6 : 2.2)) finishWalk();
  walkWater(st && walkIn(st.x0, g.cam - 60, g.cam + geo.AW + 60) ? 1 : 0);
  for (const r of g.fx) {
    r.t += dt;
    // the freed light reaches the glowling you lead
    if (r.kind === "free" && r.t >= r.life) { lead.hop = 1; lead.happy = 3; lead.emote = { text: "♥", t: 0, life: 1.4 }; heart((lead.x - g.cam) * PX, (walkGround(geo, lead.x, lead.over) - geo.s * 0.8) * PX); }
  }
  g.fx = g.fx.filter(r => r.t < r.life);
  walkMotes(dt);
}
/** How lit a spot in the hollow is (0 dark to 1 bright): around each glowling, and where you lifted the lantern. */
function walkLit(x, y) {
  const g = game.walk, s = g.geo.s;
  let k = 0;
  for (const p of g.pals) k = Math.max(k, 1 - Math.hypot(x - p.x, (y - walkGround(g.geo, p.x) + s * 0.4) * 1.2) / (s * 1.25));
  if (g.lamp) k = Math.max(k, (1 - Math.hypot(x - g.lamp.x, y - g.lamp.y) / (s * 1.7)) * clamp(1.2 - g.lamp.t / 6, 0, 1));
  return k;
}
function walkCollect(f, p) {
  const g = game.walk, cr = walkCr(p.id), [label, em, ks] = walkGive(f.kind, cr);
  f.state = "got"; f.t = 0;
  g.got.push({ kind: f.kind, label, ks });
  p.hop = 1; p.happy = 2; p.emote = { text: "♥", t: 0, life: 1.2 };
  const X = (f.x - g.cam) * PX, Y = (walkGround(g.geo, f.x) - 14) * PX;
  floatText(em ? `${em} ${label}` : label, X, Y, f.kind === "spark" ? "#fff0b5" : "#e6e0ff");
  burst(X, Y + 6 * PX, 8, ["#fff", "#fff0b5", f.kind === "berry" ? "#69b7d6" : f.kind === "flower" ? "#e88bb1" : "#d2bfff"], 0.6);
  sfx.ding(2 + g.got.length * 2); setTimeout(() => sfx.shimmer(), 120);
  walkBag();
}
/** What a find gives, given right away (so nothing found is ever lost); returns its few words, and an emoji for the float. */
function walkGive(kind, cr) {
  let label = tr(WALK_FINDS[kind].name), em = "";
  if (kind === "berry") { save.pantry = { ...save.pantry, berry: ((save.pantry || {}).berry || 0) + 1 }; label = tr(SNACKS.berry.name); em = SNACKS.berry.emoji; }
  if (kind === "seed") { const id = pick(["glowberry", "glowberry", "moonmint", "moonmint", "cookiecorn"]), gd = garden(); gd.seeds[id] = (gd.seeds[id] || 0) + 1; label = tr("{0} seed", seedName(id)); em = "🌱"; }
  if (kind === "pebble") { const n = 4 + Math.floor(Math.random() * 3); save.shards += n; label = `✦ +${n}`; updateTopbar(); }
  let ks = null;
  if (WALK_KEEP.includes(kind)) {
    // which feather, which flower: it goes into the keepsake jar (the first one brings the jar itself, waiting in the chest)
    const w = save.walks;
    ks = keepsakePick(kind, w.found);
    w.keep[kind] = (w.keep[kind] || 0) + 1; w.found[ks] = (w.found[ks] || 0) + 1;
    label = tr(KS[ks].name);
    if (!save.decor.keepjar) { save.decor.keepjar = { on: false, at: Date.now() }; if (game.walk) game.walk.jar = true; }
  }
  if (kind === "spark") {
    const pool = SPARKS.filter(s => s.kind !== "sight" && !save.sparks.got[s.id]);
    if (pool.length) {
      const s = pick(pool);
      save.sparks.got[s.id] = { t: Date.now(), by: cr ? cr.name : "" };
      remember(cr, "Brought home a spark: {0}", s.name);
      game.sparkNew = [...(game.sparkNew || []), s.id];
      label = tr(s.name); em = "✨";
    } else { save.shards += 10; label = "✦ +10"; em = "✨"; updateTopbar(); }
  }
  persist();
  return [label, em, ks];
}

/** A tap: on the thorn, a rustling bush, something to pick up, or just somewhere to walk to. */
function walkTap(x, y) {
  const g = game.walk;
  if (!g || !g.geo || g.ended || g.reached) return;
  const geo = g.geo, ax = x / PX + g.cam, ay = y / PX, lead = g.pals[0], hl = geo.hill;
  if (hl && g.thorn < 3) {
    const tw = g.thornArt[0][0].width, th = g.thornArt[0][0].height, gy = walkGround(geo, hl.ax);
    if (Math.abs(ax - hl.ax) < tw / 2 + 6 && ay > gy - th - 8 && ay < gy + 8) { walkThorn(); return; }
  }
  if (geo.dark && walkIn(ax, geo.dark.x0 - 20, geo.dark.x1 + 20)) { g.lamp = { x: ax, y: ay, t: 0 }; sfx.tone && sfx.ready() && sfx.tone(sfx.ac.currentTime, 1046, 0.03, 0.4, "sine", 1568, true); }
  for (const [k, f] of g.plan.entries()) {
    if (f.state !== "hidden" || f.at !== "bush") continue;
    const b = g.bushArt[g.plan.filter(q => q.at === "bush").indexOf(f)], gy = walkGround(geo, f.x) - 1;
    if (Math.abs(ax - f.x) < b.width / 2 + 4 && ay > gy - b.height - 4 && ay < gy + 6) {
      f.state = "pop"; f.t = 0; f.rustle = g.t; f.x += 9 * (k % 2 ? -1 : 1);
      walkRustle(); lead.tx = clamp(f.x, 8, geo.end); g.dir = Math.sign(lead.tx - lead.x) || g.dir;
      return;
    }
  }
  const tx = walkSnap(geo, clamp(ax, 8, geo.end));
  g.dir = Math.sign(tx - lead.x) || g.dir;
  lead.tx = tx;
  g.fx.push({ kind: "mark", x: tx, y: walkGround(geo, tx), t: 0, life: 0.6 });
}
/** Your light on the thorn: it loosens a little each time; the third time it lets go, the short way opens and the light it held goes free. */
function walkThorn() {
  const g = game.walk, geo = g.geo, hl = geo.hill, gy = walkGround(geo, hl.ax), th = g.thornArt[0][0].height;
  g.thorn++;
  const X = (hl.ax - g.cam) * PX, Y = (gy - th / 2) * PX;
  walkRing(hl.ax, gy - th / 2, "#fff0b5", 0.7);
  burst(X, Y, 10, ["#fff0b5", "#eec26a", "#d2bfff", "#8a6cc9"], 0.7);
  if (sfx.ready()) { const t = sfx.ac.currentTime; sfx.tone(t, [523.25, 659.25, 783.99][g.thorn - 1], 0.07, 0.9, "sine", null, true); sfx.grain(t, 0.12, 1800, 1, 0.06); }
  buzz(12);
  for (const p of g.pals) if (Math.abs(p.x - hl.ax) < geo.AW * 0.6) p.emote = { text: g.thorn < 3 ? "!" : "♥", t: 0, life: 1 };
  if (g.thorn < 3) return;
  g.freed = true; g.thornT = g.t;
  walkRing(hl.ax, gy - th / 2, "#d2bfff", 1.4);
  setTimeout(() => sfx.gleam(), 200);
  setHint(""); toast(tr("The thorns loosen in the light. The short way is open ✦"));
  // the light it had caught drifts to the glowling you lead: a little joy
  g.fx.push({ kind: "free", x: hl.ax, y: gy - th / 2, t: 0, life: 1.6 });
  coreAdd("lamplit");
}
const walkRing = (x, y, col, life) => game.walk.fx.push({ kind: "ring", x, y, col, t: 0, life });

function finishWalk() {
  const g = game.walk;
  if (!g || g.ended) return;
  g.ended = true;
  setHint(""); walkWater(0);
  $("walkHud").classList.add("done");
  const w = save.walks, p = WALKS[g.path], n = g.got.length, mood = walkMood(g.path, n, g.freed), crs = g.who.map(walkCr).filter(Boolean);
  for (const cr of crs) {
    applyTime(cr);
    cr.joy = clamp(cr.joy + mood.joy, 0, 100); cr.energy = clamp(cr.energy - mood.energy, 0, 100); cr.tummy = clamp(cr.tummy - mood.tummy, 0, 100);
    addXP(cr, mood.xp);
    remember(cr, "Went for a walk: {0}", p.name);
  }
  w.n++; w.last = Date.now();
  if (n > (w.best[p.id] || 0)) w.best[p.id] = n;
  let opened = null;
  if (g.reached && g.path === w.open - 1 && w.open < WALKS.length) { w.open++; opened = WALKS[g.path + 1]; }
  bump("walked"); keeperXP(4); coreAdd("ritual");
  persist(); updateTopbar();
  $("walkTitle").textContent = tr(g.reached ? "A lovely walk" : "A short walk");
  $("walkPics").innerHTML = crs.map(c => `<img src="${creatureImage(specOf(c), { art: 20, level: c.level, shiny: c.shiny, acc: c.acc, mood: "happy" })}" alt="">`).join("");
  $("walkSub").textContent = tr("{0}, along {1}.", crs.map(c => c.name).join(" & "), tr(p.name)) + " " + tr(g.reached ? "A little tired, a lot happier." : "Home a little early, and that's fine.");
  $("walkGot").innerHTML = (g.got.length ? g.got.map(f => `<span class="walk-find">${ic(f.ks ? "ks_" + f.ks : f.kind === "spark" ? "wspark" : f.kind)}<span>${f.label}</span></span>`).join("") : `<p class="sub">${tr("Nothing found this time: just fresh air.")}</p>`)
    + (g.freed ? `<p class="me-hint">${ic("sparkle")} ${tr("Freed a little light from the Gloom-thorn")}</p>` : "")
    + (g.jar ? `<p class="me-hint">${ic("ks_daisy")} ${tr("A keepsake jar for what you find: it's waiting in your Chest ✦")}</p>` : "");
  $("wdJoy").textContent = "+" + mood.joy; $("wdJoyL").textContent = tr("joy");
  $("wdFinds").textContent = `${n}/${g.plan.length}`; $("wdFindsL").textContent = tr("finds");
  $("wdTired").textContent = "−" + mood.energy; $("wdTiredL").textContent = tr("energy");
  $("walkNew").hidden = !opened;
  if (opened) $("walkNew").textContent = tr("A new path is open: {0} ✦", tr(opened.name));
  $("walkHome").textContent = tr("Home");
  sfx.levelUp();
  show("walkDone", true);
}
function walkHome() {
  show("walkDone", false);
  walkWater(0);
  game.walk = null;
  setScene("nest");
  showNewSparks(1200);
}

// ---------- sounds of the path: soft steps, a plip on each stone, a rustle, the water ----------

function walkStep(snow) {
  if (!sfx.ready()) return;
  const t = sfx.ac.currentTime;
  sfx.grain(t, snow ? 0.05 : 0.035, snow ? rand(2200, 3200) : rand(500, 800), snow ? 2 : 1.2, snow ? 0.03 : 0.04, snow ? "bandpass" : "lowpass");
}
function walkPlip(s) {
  if (!sfx.ready()) return;
  const t = sfx.ac.currentTime;
  sfx.tone(t, 640 + s * 110, 0.05, 0.14, "sine", 1150 + s * 140);
  sfx.grain(t, 0.06, 2800, 2, 0.035);
}
function walkRustle() {
  if (!sfx.ready()) return;
  const t = sfx.ac.currentTime;
  for (let i = 0; i < 9; i++) sfx.grain(t + i * 0.035 + rand(0, 0.02), rand(0.02, 0.05), rand(2400, 5200), 1.5, rand(0.04, 0.08));
}
/** The water's hush, louder near the stream (on: 0 to 1). */
function walkWater(on) {
  const w = walkWater;
  if (!w.node && (!on || !sfx.ready())) return;
  if (!w.node) {
    const ac = sfx.ac, src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = sfx.noise; src.loop = true; bp.type = "bandpass"; bp.frequency.value = 1300; bp.Q.value = 0.5; g.gain.value = 0;
    src.connect(bp).connect(g).connect(sfx.master); src.start();
    w.node = { src, g };
  }
  const { src, g } = w.node, t = sfx.ac.currentTime;
  g.gain.setTargetAtTime(sfx.vol(on * 0.07), t, 0.6);
  if (!on && game.walk?.ended !== false) { src.stop(t + 2.5); w.node = null; }
}

// ---------- the little lives in the air: fireflies, falling leaves, snow, petals, spores ----------

function walkMotes(dt) {
  const g = game.walk, geo = g.geo, calm = opts().calm, n = calm ? 6 : 18;
  const kind = g.season === "winter" ? "snow" : g.season === "autumn" ? "leaf" : g.season === "spring" ? "petal" : WALK_LAND[g.theme].caps ? "spore" : "fly";
  while (g.motes.length < n) g.motes.push({ x: g.cam + rand(0, geo.AW), y: rand(0, geo.AH * 0.85), ph: rand(0, TAU), v: rand(0.6, 1.2), kind });
  if (g.motes.length > n) g.motes.length = n;
  const sp = calm ? 0.45 : 1;
  for (const m of g.motes) {
    m.ph += dt * m.v;
    if (m.kind === "snow") { m.y += 9 * m.v * sp * dt; m.x += Math.sin(m.ph) * 4 * sp * dt; }
    else if (m.kind === "leaf" || m.kind === "petal") { m.y += 11 * m.v * sp * dt; m.x += (Math.sin(m.ph * 1.3) * 10 - 4) * sp * dt; }
    else if (m.kind === "spore") { m.y -= 4 * m.v * sp * dt; m.x += Math.sin(m.ph) * 3 * sp * dt; }
    else { m.x += Math.cos(m.ph * 0.7) * 6 * sp * dt; m.y += Math.sin(m.ph) * 4 * sp * dt; }
    if (m.x < g.cam - 12) m.x += geo.AW + 24; else if (m.x > g.cam + geo.AW + 12) m.x -= geo.AW + 24;
    if (m.y > geo.AH * 0.92) { m.y = -4; } else if (m.y < -6) m.y = geo.AH * 0.85;
  }
}

// ---------- drawing a frame ----------

const walkIcons = {};
/** A find's little picture at one art pixel per pixel, with the dark outline the icons have. */
function walkIcon(name) {
  if (walkIcons[name]) return walkIcons[name];
  const map = PX_ICON_MAPS[name], S = map[0].length + 2, C = walkCanvas(S, S), solid = new Uint8Array(S * S);
  map.forEach((row, y) => [...row].forEach((ch, x) => { const col = PX_ICON_COLORS[ch]; if (col) { solid[(y + 1) * S + x + 1] = 1; C.put(x + 1, y + 1, pxHex(col)); } }));
  const ink = pxHex("#160c26");
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!solid[y * S + x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => solid[(y + dy) * S + x + dx] && x + dx >= 0 && x + dx < S)) C.put(x, y, ink);
  C.done();
  return walkIcons[name] = C.c;
}
/** The dark, as a dithered veil with holes of light cut in it (patterns and stamps made once). */
const walkShadeArt = { tiles: [], holes: {} };
function walkShadeTile(k) {
  if (walkShadeArt.tiles[k]) return walkShadeArt.tiles[k];
  const C = walkCanvas(4, 4), ink = pxHex("#0b0614");
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (PX_BAYER[y * 4 + x] < [0.2, 0.4, 0.56, 0.72][k]) C.put(x, y, ink);
  C.done();
  return walkShadeArt.tiles[k] = C.c;
}
function walkHole(r) {
  r = Math.max(4, Math.round(r));
  if (walkShadeArt.holes[r]) return walkShadeArt.holes[r];
  const C = walkCanvas(r * 2 + 1, r * 2 + 1), w = pxHex("#ffffff");
  for (let y = 0; y <= r * 2; y++) for (let x = 0; x <= r * 2; x++) { const f = 1 - Math.hypot(x - r, y - r) / r; if (f > 0 && PX_BAYER[(y & 3) * 4 + (x & 3)] < f * 2.2) C.put(x, y, w); }
  C.done();
  return walkShadeArt.holes[r] = C.c;
}
let walkShadeCv = null;
/** A little dithered glow of candle gold, laid under a find. */
function walkHalo() {
  if (walkShadeArt.halo) return walkShadeArt.halo;
  const C = walkCanvas(19, 19), a = pxHex("#eec26a"), b = pxHex("#fff0b5");
  for (let y = 0; y < 19; y++) for (let x = 0; x < 19; x++) { const f = 1 - Math.hypot(x - 9, (y - 9) * 1.2) / 9.5; if (f > 0 && PX_BAYER[(y & 3) * 4 + (x & 3)] < f * 0.55) C.put(x, y, f > 0.6 ? b : a); }
  C.done();
  return walkShadeArt.halo = C.c;
}

function drawWalk() {
  const g = game.walk;
  if (!g) return;
  walkLayout();
  const geo = g.geo, { AW, AH, s } = geo, cam = Math.round(g.cam), L = g.L, calm = opts().calm, t = g.t;
  const X = x => Math.round(x - cam) * PX, Y = y => Math.round(y) * PX, dot = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(X(x), Y(y), w * PX, h * PX); };
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const blit = (c, k) => { const off = Math.round(cam * k), w = Math.min(AW, c.width - off); if (w > 0) ctx.drawImage(c, off, 0, w, AH, 0, 0, w * PX, AH * PX); };
  blit(L.far, L.K.far); blit(L.mid, L.K.mid); blit(L.main, 1);
  const st = geo.stream;
  if (st && st.fall && walkIn(st.x0, cam - 80, cam + AW + 80)) {
    // the waterfall pours, the pool and the stream glint as they run toward you
    const f = st.fall, hgt = st.pool - f.y, sp = calm ? 18 : 40;
    for (let c = 0; c < f.w; c++) for (let j = 0; j < 3; j++) {
      const yy = f.y + ((t * sp * (1 + (c % 3) * 0.25) + pxHash(c, j) * hgt) % hgt);
      dot(f.x + c, yy, 1, 3, c === 0 || c === f.w - 1 ? "#69b7d6" : j ? "#b8e6f5" : "#ffffff");
    }
    for (let j = 0; j < 7; j++) if (Math.sin(t * 5 + j * 2.1) > 0.2) dot(f.x - 3 + Math.round(pxHash(j, 9) * (f.w + 6)), st.pool - 1 + (j % 2), 1, 1, "#ffffff");
    for (let j = 0; j < 12; j++) {
      const top = walkGround(geo, st.x0), yy = top + 3 + ((t * (calm ? 6 : 14) + j * 23) % (AH - top - 3)), sp2 = (yy - top) * 0.3;
      dot(Math.round(st.x0 - sp2 + 3 + pxHash(j, 4) * (st.x1 - st.x0 + sp2 * 2 - 6)), yy, 2, 1, j % 3 ? "#69b7d6" : "#b8e6f5");
    }
  }
  // the bushes something hides in, and the finds
  const bushes = g.plan.filter(f => f.at === "bush");
  bushes.forEach((f, i) => {
    const b = g.bushArt[i], bx = Math.round(f.u * geo.base), shake = f.rustle !== undefined && t - f.rustle < 0.5 && !calm ? (Math.floor((t - f.rustle) * 20) % 2 ? 1 : -1) : 0;
    ctx.drawImage(b, X(bx - b.width / 2 + shake), Y(walkGround(geo, bx) - b.height + 1), b.width * PX, b.height * PX);
    if (f.state === "hidden" && (t + i * 1.3) % 2.6 < 0.35) { const gx = bx + b.width * 0.22, gy = walkGround(geo, bx) - b.height * 0.55; dot(gx, gy, 1, 1, "#ffffff"); dot(gx - 1, gy, 3, 1, "#fff0b5"); dot(gx, gy - 1, 1, 3, "#fff0b5"); dot(gx, gy, 1, 1, "#ffffff"); }
  });
  for (const f of g.plan) {
    const ic2 = walkIcon(f.kind === "spark" ? "wspark" : f.kind), gy = f.at === "stone" ? walkGround(geo, f.x) - 1 : walkGround(geo, f.x) + 1;
    let x = f.x - ic2.width / 2, y = gy - ic2.height + 1, a = 1;
    if (f.state === "hidden" && f.at === "dark") { if (f.kind === "spark") { a = 0.3 + 0.25 * Math.sin(t * 2.4); } else continue; }
    else if (f.state === "hidden") continue;
    if (f.state === "pop") { const k = clamp(f.t / 0.45, 0, 1), bx = Math.round(f.u * geo.base); x = lerp(bx, f.x, k) - ic2.width / 2; y -= Math.sin(k * Math.PI) * 14; }
    if (f.state === "got") { if (f.t > 0.6) continue; y -= f.t * 30; a = 1 - f.t / 0.6; }
    if (f.state === "shown" && !calm) y -= (Math.floor(t * 1.6 + f.u * 9) % 2);
    if (f.state === "shown" || f.state === "pop") ctx.drawImage(walkHalo(), X(x + ic2.width / 2 - 9), Y(y + ic2.height / 2 - 9), 19 * PX, 19 * PX);
    ctx.globalAlpha = a;
    ctx.drawImage(ic2, X(x), Y(y), ic2.width * PX, ic2.height * PX);
    ctx.globalAlpha = 1;
    if (f.state === "shown" && (t + f.u * 7) % 2.2 < 0.3) { const gx = x + ic2.width - 3, gy2 = y + 2; dot(gx, gy2, 1, 1, "#ffffff"); dot(gx - 1, gy2, 3, 1, "#fff0b5"); dot(gx, gy2 - 1, 1, 3, "#fff0b5"); dot(gx, gy2, 1, 1, "#ffffff"); }
  }
  // the thorn, loosening; once it lets go, a few small flowers open where it was
  const hl = geo.hill;
  if (hl) {
    const gy = walkGround(geo, hl.ax);
    if (g.thorn < 3) { const a = g.thornArt[g.thorn][calm ? 0 : Math.floor(t / 0.8) % 2]; ctx.drawImage(a, X(hl.ax - a.width / 2), Y(gy - a.height + 2), a.width * PX, a.height * PX); }
    else for (let k = 0; k < 5; k++) {
      const grow = clamp((t - g.thornT - k * 0.15) / 0.5, 0, 1), fx2 = hl.ax + (k - 2) * 7 + (k % 2) * 2, fy = gy + 4 + (k % 2) * 2;
      if (!grow) continue;
      dot(fx2, fy - Math.round(2 * grow), 1, Math.round(2 * grow) + 1, "#2f7d4a");
      if (grow > 0.6) { const c = ["#d2bfff", "#ffc4da", "#fff0b5"][k % 3]; dot(fx2 - 1, fy - 3, 3, 1, c); dot(fx2, fy - 4, 1, 3, c); dot(fx2, fy - 3, 1, 1, "#eec26a"); }
    }
  }
  // taps, light rings, the freed light
  for (const r of g.fx) {
    const k = r.t / r.life;
    if (r.kind === "mark") { const c = k < 0.5 ? "#fff0b5" : "#eec26a", d = Math.round(2 + k * 4); dot(r.x - d, r.y - 1, 2, 1, c); dot(r.x + d - 1, r.y - 1, 2, 1, c); dot(r.x, r.y - 2 - Math.round(k * 3), 1, 1, c); }
    if (r.kind === "ring") { const rr = 4 + k * 26, n = 18; for (let i = 0; i < n; i++) { const an = i / n * TAU; if ((i + Math.floor(k * 6)) % 3 === 0) continue; dot(Math.round(r.x + Math.cos(an) * rr), Math.round(r.y + Math.sin(an) * rr * 0.8), 1, 1, k < 0.6 ? r.col : "#8a6cc9"); } }
    if (r.kind === "free") {
      const p = g.pals[0], tx = p.x, ty = walkGround(geo, p.x) - s * 0.6, e = k * k * (3 - 2 * k), x = lerp(r.x, tx, e), y = lerp(r.y, ty, e) - Math.sin(k * Math.PI) * 20;
      dot(Math.round(x), Math.round(y), 2, 2, "#fff0b5"); dot(Math.round(x) - 1, Math.round(y), 1, 1, "#eec26a"); dot(Math.round(x) + 1, Math.round(y) - 1, 1, 1, "#ffffff");
    }
  }
  // the glowlings: the one you lead in front
  for (let i = g.pals.length - 1; i >= 0; i--) {
    const p = g.pals[i], cr = walkCr(p.id);
    if (!cr) continue;
    const sp = specOf(cr), foot = walkGround(geo, p.x, p.over), sz = s * PX, x = X(p.x), fy = Y(foot);
    ctx.fillStyle = "rgba(5,0,20,.35)";
    ctx.beginPath(); ctx.ellipse(x, fy, sz * 0.32 * clamp(1 - p.alt / (s * 1.2), 0.4, 1), sz * 0.07, 0, 0, TAU); ctx.fill();
    const mood = p.happy > 0 || g.reached ? "happy" : cr.energy < 25 ? "sleepy" : "ok";
    drawSprite(x, fy - sz * 0.45 - p.alt * PX, sz, sp, { acc: cr.acc, level: cr.level, shiny: cr.shiny, mood, hop: p.hop, hopK: calmOf(cr.level).hop * 0.75, t: game.time + p.id * 997, glowK: i ? 0.4 : 0.7 });
    const head = fy - sz * 1.05 - p.alt * PX;
    if (p.emote) {
      fx.save(); fx.font = `400 ${Math.round(clamp(sz * 0.32, 16, 22))}px ${PIXEL_FONT}`; fx.textAlign = "center";
      fx.globalAlpha = clamp((p.emote.life - p.emote.t) * 3, 0, 1);
      const ey = head - p.emote.t * 10;
      fx.fillStyle = "#160c26"; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) fx.fillText(p.emote.text, x + sz * 0.3 + dx, ey + dy);
      fx.fillStyle = p.emote.text === "♥" ? "#ff9ecb" : "#fff0b5"; fx.fillText(p.emote.text, x + sz * 0.3, ey);
      fx.restore();
    }
    if (p.say && g.reached) drawBubble(x, head - 6, p.say, clamp(g.endT * 2, 0, 1));
  }
  // in the air
  for (const m of g.motes) {
    const x = Math.round(m.x), y = Math.round(m.y);
    if (m.kind === "fly") { if (Math.sin(m.ph * 3) > -0.2) { dot(x, y, 1, 1, "#fff0b5"); if (Math.sin(m.ph * 3) > 0.6) { dot(x - 1, y, 1, 1, "#eec26a"); dot(x + 1, y, 1, 1, "#eec26a"); } } }
    else if (m.kind === "snow") dot(x, y, 1, 1, "#ffffff");
    else if (m.kind === "spore") dot(x, y, 1, 1, Math.sin(m.ph * 2) > 0 ? "#d2bfff" : "#69b7d6");
    else { const c = m.kind === "petal" ? (m.v > 0.9 ? "#ffc4da" : "#efe6ff") : ["#e0634f", "#eec26a", "#c98f3a"][Math.floor(m.v * 7) % 3]; Math.sin(m.ph * 2) > 0 ? dot(x, y, 2, 1, c) : dot(x, y, 1, 2, c); }
  }
  // the dark hollow: a veil of dark, holes of light around the glowlings and where you lift the lantern
  const dk = geo.dark;
  if (dk && dk.x1 > cam && dk.x0 < cam + AW) {
    if (!walkShadeCv || walkShadeCv.width !== AW || walkShadeCv.height !== AH) { walkShadeCv = document.createElement("canvas"); walkShadeCv.width = AW; walkShadeCv.height = AH; }
    const sc = walkShadeCv.getContext("2d");
    sc.clearRect(0, 0, AW, AH);
    const a = dk.x0 - cam, b = dk.x1 - cam;
    // (thicker toward the middle, in steps, so walking in feels like the trees closing over)
    [0, 1, 2, 3].forEach(k => { const p0 = a + k * 22, p1 = b - k * 22; if (p1 > p0) { sc.fillStyle = sc.createPattern(walkShadeTile(k), "repeat"); sc.clearRect(Math.round(p0), 0, Math.round(p1 - p0), AH); sc.fillRect(Math.round(p0), 0, Math.round(p1 - p0), AH); } });
    sc.globalCompositeOperation = "destination-out";
    const hole = (x, y, r) => { const hc = walkHole(r); sc.drawImage(hc, Math.round(x - cam - hc.width / 2), Math.round(y - hc.height / 2)); };
    for (const p of g.pals) hole(p.x, walkGround(geo, p.x, p.over) - s * 0.45 - p.alt, s * 1.25);
    if (g.lamp && g.lamp.t < 7) hole(g.lamp.x, g.lamp.y, s * 1.7 * clamp(1.2 - g.lamp.t / 6, 0.2, 1));
    for (const f of g.plan) if (f.kind === "spark" && f.state === "hidden" && f.at === "dark") hole(f.x, walkGround(geo, f.x) - 6, 5 + Math.sin(t * 2.4) * 2);
    // the Gloom-thorn's cold glow shows through the dark, a little, so you can find it
    if (hl && g.thorn < 3 && walkIn(hl.ax, dk.x0, dk.x1)) hole(hl.ax, walkGround(geo, hl.ax) - hl.ah * 0.5, hl.aw * (0.7 + 0.08 * Math.sin(t * 1.3)));
    sc.globalCompositeOperation = "source-over";
    ctx.drawImage(walkShadeCv, 0, 0, AW * PX, AH * PX);
    // little fungi glowing on their own in the dark, softly, never all at once
    for (const f of g.glows) { const k = Math.sin(t * 0.9 + f.ph); if (k > -0.3 && walkIn(f.x, cam, cam + AW)) { dot(f.x, f.y, 1, 1, f.c); if (k > 0.5) { dot(f.x - 1, f.y + 1, 1, 1, f.c); dot(f.x + 1, f.y + 1, 1, 1, "#ffffff"); } } }
    if (g.lamp && g.lamp.t < 6) { const lx = g.lamp.x, ly = g.lamp.y; dot(lx, ly - 3, 1, 1, "#fff0b5"); dot(lx - 1, ly - 2, 3, 3, "#eec26a"); dot(lx, ly - 1, 1, 1, "#ffffff"); dot(lx, ly - 5, 1, 2, "#5d5666"); }
  }
  blit(L.front, L.K.front);
  ctx.restore();
}

if (typeof window === "object") {
  $("walkSheetClose").addEventListener("click", () => show("walkSheet", false));
  $("walkQuit").addEventListener("click", ev => { ev.stopPropagation(); sfx.tick(); finishWalk(); });
  $("walkHome").addEventListener("click", () => { sfx.tick(); walkHome(); });
}
