"use strict";
// Hatchstone · furniture in the room, isometric pieces, beds, rearranging, the cloud and the weather.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- solid furniture: glowlings find their way around pieces and can't pass through them ----------
const WALK_N = 12;          // for finding a way, the floor is a grid of half tiles (ISO_G × 2)
const BODY_R = 0.26;        // a glowling's footprint, in tiles
/** The tiles nobody can stand in: every placed piece but the bed (it's soft: they climb onto it). */
function isoBlocked() {
  const L = isoLayout();
  if (!L.blocked) {
    L.blocked = [];
    for (const p of Object.values(L.placed)) if (p.id !== "bed") for (let a = 0; a < p.fw; a++) for (let b = 0; b < p.fd; b++) L.blocked.push([p.i + a, p.j + b]);
    L.blockSet = new Set(L.blocked.map(([i, j]) => i + "," + j));
  }
  return L;
}
const cellFree = (ci, cj) => ci >= 0 && cj >= 0 && ci < WALK_N && cj < WALK_N && !isoBlocked().blockSet.has((ci >> 1) + "," + (cj >> 1));
/** Is a straight walk between two floor points (in tiles) clear of every piece, body and all? */
function walkClear(U0, V0, U1, V1) {
  const n = Math.ceil(Math.hypot(U1 - U0, V1 - V0) / 0.12);
  for (let k = 0; k <= n; k++) {
    const U = lerp(U0, U1, k / n), V = lerp(V0, V1, k / n);
    for (const [i, j] of isoBlocked().blocked) if (Math.hypot(U - clamp(U, i, i + 1), V - clamp(V, j, j + 1)) < BODY_R * 0.95) return false;
  }
  return true;
}
/**
 * A way from one floor point to another around the furniture (A* over half tiles, no cutting corners), smoothed into a few
 * straight legs. If the goal is inside a piece, or too close to one to stand there, the way ends at the nearest free spot. Points are in CSS pixels.
 */
function findPath(x0, y0, x1, y1) {
  // in tiles, kept off the walls the way keepInRoom keeps everyone
  const mT = isoMargin(0.42) * ISO_G, inR = c => clamp(c, mT, ISO_G - mT), toT = (x, y) => isoFrom(x, y).map(c => inR(c * ISO_G)), [U0, V0] = toT(x0, y0);
  let [U1, V1] = toT(x1, y1);
  const cellOf = (U, V) => [clamp(Math.floor(U * 2), 0, WALK_N - 1), clamp(Math.floor(V * 2), 0, WALK_N - 1)];
  const nearestFree = ([ci, cj]) => { let best = null, bd = Infinity; for (let i = 0; i < WALK_N; i++) for (let j = 0; j < WALK_N; j++) if (cellFree(i, j)) { const d = Math.hypot(i - ci, j - cj); if (d < bd) { bd = d; best = [i, j]; } } return best; };
  let s = cellOf(U0, V0), g = cellOf(U1, V1);
  if (!cellFree(...s)) s = nearestFree(s);
  if (!cellFree(...g)) { g = nearestFree(g); if (g) [U1, V1] = [inR((g[0] + 0.5) / 2), inR((g[1] + 0.5) / 2)]; }
  if (!s || !g) return { pts: [], end: [x1, y1] };
  // and it ends where a body fits: a goal brushing a piece (a spot just in front of it) would be pushed back a few pixels short forever
  const end = standSpot(...isoAt(U1 / ISO_G, V1 / ISO_G));
  [U1, V1] = isoFrom(...end).map(c => c * ISO_G);
  if (walkClear(U0, V0, U1, V1)) return { pts: [end], end };
  const key = (i, j) => i * WALK_N + j, cost = new Map([[key(...s), 0]]), from = new Map(), open = [[...s, Math.hypot(g[0] - s[0], g[1] - s[1])]];
  while (open.length) {
    open.sort((p, q) => q[2] - p[2]);
    const [ci, cj] = open.pop();
    if (ci === g[0] && cj === g[1]) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = ci + di, nj = cj + dj;
      if (!cellFree(ni, nj) || (di && dj && (!cellFree(ci + di, cj) || !cellFree(ci, cj + dj)))) continue;
      const c = cost.get(key(ci, cj)) + Math.hypot(di, dj);
      if (c < (cost.get(key(ni, nj)) ?? Infinity)) { cost.set(key(ni, nj), c); from.set(key(ni, nj), [ci, cj]); open.push([ni, nj, c + Math.hypot(g[0] - ni, g[1] - nj)]); }
    }
  }
  if (!from.has(key(...g)) && (g[0] !== s[0] || g[1] !== s[1])) return { pts: [], end };
  const cells = [];
  for (let c = g; c && (c[0] !== s[0] || c[1] !== s[1]); c = from.get(key(...c))) cells.unshift(c);
  const way = [...cells.map(([i, j]) => [inR((i + 0.5) / 2), inR((j + 0.5) / 2)]), [U1, V1]];
  // keep only the corners: from each point, head straight for the furthest one in clear sight
  const pts = [];
  let at = [U0, V0], k = 0;
  while (k < way.length) {
    let far = k;
    for (let m = way.length - 1; m > k; m--) if (walkClear(at[0], at[1], way[m][0], way[m][1])) { far = m; break; }
    at = way[far]; pts.push(isoAt(at[0] / ISO_G, at[1] / ISO_G)); k = far + 1;
  }
  return { pts, end };
}
/** The next point to walk to on the way to (a.tx, a.ty), working the way out again when the goal or the furniture changes. */
function nextWaypoint(a, dt) {
  const key = `${Math.round(a.tx)},${Math.round(a.ty)}|${isoLayout().key}`;
  a.repath = (a.repath || 0) - dt;
  if (a.pathKey !== key || a.repath < 0) {
    const path = findPath(a.x, a.y, a.tx, a.ty);
    a.path = path.pts; a.pathEnd = path.end; a.pathKey = key; a.repath = 1.2;
  }
  // a goal inside a piece moves to the free spot beside it
  [a.tx, a.ty] = a.pathEnd;
  while (a.path.length > 1 && Math.hypot(a.path[0][0] - a.x, a.path[0][1] - a.y) < 5) a.path.shift();
  return a.path[0] || [a.tx, a.ty];
}
/** Out of any piece it ended up overlapping: pushed out the nearest way, so it slides along the side instead of walking through. */
function pushOutOfPieces(a) {
  let [U, V] = isoFrom(a.x, a.y).map(c => c * ISO_G), moved = false;
  for (let pass = 0; pass < 2; pass++) for (const [i, j] of isoBlocked().blocked) {
    const nx = clamp(U, i, i + 1), ny = clamp(V, j, j + 1), dx = U - nx, dy = V - ny, d = Math.hypot(dx, dy);
    if (d >= BODY_R) continue;
    moved = true;
    if (d > 1e-4) { U = nx + dx / d * BODY_R; V = ny + dy / d * BODY_R; }
    else [U, V] = [[i - BODY_R, V, U - i], [i + 1 + BODY_R, V, i + 1 - U], [U, j - BODY_R, V - j], [U, j + 1 + BODY_R, j + 1 - V]].sort((p, q) => p[2] - q[2])[0];
  }
  // the gazebo's posts are round and thin: slide round them
  for (const [pu, pv] of gazeboPosts()) {
    const dx = U - pu, dy = V - pv, d = Math.hypot(dx, dy), r = BODY_R * 0.8 + 0.06;
    if (d >= r) continue;
    moved = true;
    if (d > 1e-4) { U = pu + dx / d * r; V = pv + dy / d * r; } else U = pu + r;
  }
  // the moss garden's spring: round it, never through it (feet may touch its rim), unless it's the one having a bath
  if (a.state !== "bath" && game.scene === "nest" && save.rooms[save.room]?.kind === "garden") {
    const [su, sv, sr] = MOSS_GARDEN.spring, pu = su * ISO_G, pv = sv * ISO_G, dx = U - pu, dy = V - pv, d = Math.hypot(dx, dy), r = (sr + SPRING.rim) * ISO_G * 0.8 + BODY_R * 0.6;
    if (d < r) { moved = true; if (d > 1e-4) { U = pu + dx / d * r; V = pv + dy / d * r; } else U = pu + r; }
  }
  if (moved) [a.x, a.y] = isoAt(U / ISO_G, V / ISO_G);
}
/** Is a floor point (in tiles) on a piece, or just behind one (a piece within a tile in front of it on the floor), where it'd be out of sight? */
function hiddenSpot(U, V) {
  return Object.values(isoLayout().placed).some(p => U > p.i - 0.3 && U < p.i + p.fw + 0.3 && V > p.j - 0.3 && V < p.j + p.fd + 0.3 // on it
    || (p.i + p.fw / 2 - U) + (p.j + p.fd / 2 - V) > 0 && (p.i + p.fw / 2 - U) + (p.j + p.fd / 2 - V) < 2.2 && Math.abs((p.i + p.fw / 2 - U) - (p.j + p.fd / 2 - V)) < (p.fw + p.fd) / 2 + 0.6);
}
/** A random free spot on the floor, in plain sight when there is one. */
function freeFloorPoint() {
  const m = isoMargin(0.42);
  for (let k = 0; k < 40; k++) {
    const [x, y] = isoAt(rand(m, 1 - m), rand(m, 1 - m)), [U, V] = isoFrom(x, y).map(c => c * ISO_G);
    if (cellFree(Math.floor(U * 2), Math.floor(V * 2)) && walkClear(U, V, U, V) && (k > 30 || !hiddenSpot(U, V))) return [x, y];
  }
  return floorAt(0.5, 0.5);
}

/** Keep a glowling on the floor and out of the furniture (the one riding the swing or asleep on the bed is placed by hand). */
function keepInRoom(a, dt) {
  // (lying on the bed, a sleeper may lie closer to the wall than anyone walks: the bed fills its corner)
  const m = a.onBed && (a.state === "sleep" || a.state === "toBed") ? bedMargin() : isoMargin(0.42), x0 = a.x, y0 = a.y; let [u, v] = isoFrom(a.x, a.y); [a.x, a.y] = isoAt(clamp(u, m, 1 - m), clamp(v, m, 1 - m));
  if (a.state !== "visit" || (a.decor !== "swing" && a.decor !== "mushrooms")) pushOutOfPieces(a);
  [u, v] = isoFrom(a.x, a.y); [a.x, a.y] = isoAt(clamp(u, m, 1 - m), clamp(v, m, 1 - m));
  // a little slide happens at once; a big one (stepping off the swing or the caps, a piece put down on it) is a quick eased shuffle, not a jump
  if (dt && Math.hypot(a.x - x0, a.y - y0) > N.base * 0.04) { a.x = lerp(x0, a.x, Math.min(1, dt * 5)); a.y = lerp(y0, a.y, Math.min(1, dt * 5)); }
}
/**
 * A floor point (CSS pixels) moved to where a walker can really stand: off the walls and out of every piece's footprint,
 * just as keepInRoom would keep it. A goal set there can be reached exactly; one inside a piece's reach never could
 * (each step in, the piece pushes it back out a few pixels short).
 */
function standSpot(x, y) {
  const a = { x, y, state: "walk" };
  keepInRoom(a); keepInRoom(a); // (twice: pushed off one piece, it may brush the next)
  return [a.x, a.y];
}
const depth = () => W < 520 ? 0.6 : 0.54;

function syncActors() {
  const list = roomCreatures(), ids = new Set(list.map(c => c.id));
  for (const id of actors.keys()) if (!ids.has(id)) actors.delete(id);
  for (const cr of list) {
    if (actors.has(cr.id)) continue;
    const [x, y] = roomPoint();
    actors.set(cr.id, { id: cr.id, x, y, tx: x, ty: y, alt: 0, state: "idle", t: rand(0.5, 2.5), hop: 0, ph: rand(0, TAU), emote: null, friend: null, beh: kindOf(cr) });
  }
}

/** Where a glowling is drawn: its center and size (smaller further back in the room). */
function actorView(a) {
  const k = depth(a.y), size = N.base * k;
  // (lean and dip: a care moment's offsets, see careTick)
  return { x: a.x + (a.lean || 0) + (a.shake ? Math.sin(game.time * 0.045) * a.shake * size * 0.08 : 0), y: a.y - size * 0.45 - a.alt - (a.perch || 0) + (a.dip || 0), size, k };
}

/** How low a tummy must be for a glowling to come running when someone else is fed. */
const BEG_TUMMY = 30;
const activeActor = () => { const cr = activeCreature(); return cr ? actors.get(cr.id) : null; };
/** Is a finger stroking this glowling right now (any of them, and more than one at once with more fingers). */
const petted = a => game.time - (game.nest.pets[a.id] ?? -1e9) < 250;
const emote = (a, text, life = 1.6) => { a.emote = { text, t: 0, life }; };

function actorAt(x, y) {
  let best = null;
  for (const a of actors.values()) {
    if (seekHidden(a)) continue;
    const v = actorView(a);
    if (Math.hypot(x - v.x, y - v.y) < v.size * 0.6 && (!best || a.y > best.y)) best = a;
  }
  return best;
}

function selectCreature(id) {
  if (save.creatures.find(c => c.id === id)?.out) { callHome(id); syncActors(); }
  save.active = id; persist();
  const a = actors.get(id), cr = activeCreature();
  if (a) { a.hop = 1; emote(a, "♥", 1.2); }
  sfx.chirp(specOf(cr).voice);
  renderNest(true);
}

/** Home to a nest Mossa looked in on: everyone awake in the room hops with a heart, one after another, glad to see you. */
function gladHome() {
  game.nest.glad = false;
  [...actors.values()].forEach((a, i) => setTimeout(() => {
    const cr = save.creatures.find(c => c.id === a.id);
    if (!cr || cr.sleeping || game.scene !== "nest") return;
    // (one standing about or dozing stays put while its heart shows, rather than nodding off under it)
    if (a.state === "idle" || a.state === "nap") { a.state = "idle"; a.t = 2.4; }
    a.hop = 1; emote(a, "♥", 2.4);
    if (i < 3) sfx.chirp(specOf(cr).voice);
  }, 300 + i * 180));
}

/** Slept enough: a stretch and a yawn, and up it gets. */
function wakeRested(cr, a) {
  cr.sleeping = false; cr.selfSlept = false;
  a.hop = 1; a.state = "idle"; a.t = 1.5; emote(a, kaoFor(cr, "wake"), 1.6);
  sfx.stretch(specOf(cr).voice);
  // (one with the habit has a second, longer stretch before it goes anywhere)
  if (habitOf(cr) === "stretch") { a.t = 3.5; setTimeout(() => { if (a.state === "idle") { a.hop = 1; emote(a, "🥱", 1.6); } }, 1300); }
  if (a.id === save.active) { const v = actorView(a); floatText(tr("all rested!"), v.x, v.y - v.size * 0.8, "#fff0b5"); renderNest(); }
  persist();
}
/** A polite no: a shake of the head, a "mm-mm", and a word about why. */
function refuseWith(cr, text) {
  const a = actors.get(cr.id);
  sfx.refuse();
  if (!a) { toast(text); return; }
  a.shake = 1; a.hop = 0.4;
  const v = actorView(a);
  floatText(text, v.x, v.y - v.size * 0.85, "#e6e0ff");
}

/** Fed and cared for, with nothing to call you about: it takes things slowly. */
const content = cr => !callOf(cr) && cr.tummy >= 40;
/** How long it lingers before the next thing: a content one takes its time, and the older, the longer. */
const linger = cr => calmOf(cr.level).rest * (content(cr) ? 2.3 : 1);

/** Pick what to do next: nap, dance, visit a friend, or wander (flutterers chase the light motes); its own habit now and then first. */
function chooseNext(a, list) {
  const cr = save.creatures.find(c => c.id === a.id), was = a.state;
  a.plan = null;
  // up from a doze: one with the habit has a long stretch first
  if (cr && was === "nap" && habitOf(cr) === "stretch") { stretchOut(a, cr); return; }
  // hungry, with food in the bowl here: off to eat, before anything else
  if (cr && hasDecor("bowl") && bowlCall(a, cr)) return;
  if (cr && careNext(a, cr, list)) return;
  if (cr && habitNext(a, cr, list)) return;
  // content: as often as not it stays where it is and looks about (or, a bit tired, dozes off); a hungry one perks up instead
  if (cr && content(cr) && Math.random() < 0.55) {
    if (cr.energy < 60 && Math.random() < 0.3) { dozeOff(a, cr, list, rand(5, 9) * calmOf(cr.level).rest, false); return; }
    a.state = "idle"; a.t = rand(3, 6) * linger(cr);
    // (now and then with a contented face)
    if (!a.emote && Math.random() < 0.15) emote(a, kaoFor(cr, "rest"), 1.6);
    return;
  }
  // outside, hoppers and swimmers like the garden best: they walk over and water a thirsty plant
  const gp = isOutside() && isoLayout().placed.garden;
  if (gp && ["hop", "swim"].includes(a.beh) && Math.random() < 0.25) {
    // (its front can be boxed in, by the skep and the cold frame in the yard: then a side a way really leads to)
    const sides = [[0.8, 0.8], [gp.fw / 2 + 0.4, 0], [0, -gp.fd / 2 - 0.4], [-gp.fw / 2 - 0.4, 0], [0, gp.fd / 2 + 0.4]];
    const to = sides.map(([du, dv]) => standSpot(...isoAt((gp.i + gp.fw / 2 + du) / ISO_G, (gp.j + gp.fd / 2 + dv) / ISO_G))).find(s => findPath(a.x, a.y, ...s).pts.length);
    if (to) { [a.tx, a.ty] = to; a.state = "walk"; a.garden = true; return; }
  }
  if (weatherOn() && Math.random() < 0.8) { playInWeather(a); return; }
  const r = Math.random(), b = a.beh;
  const loved = DECOR.filter(d => hasDecor(d.id) && d.lovers.includes(b));
  if (loved.length && Math.random() < 0.4) { goVisit(a, pick(loved)); return; }
  // hoppers like bouncing on the bed now and then
  if (b === "hop" && r < 0.15 && isoLayout().placed.bed) {
    const p = isoLayout().placed.bed; [a.tx, a.ty] = isoAt((p.i + p.fw * rand(0.3, 0.7)) / ISO_G, (p.j + p.fd * rand(0.3, 0.7)) / ISO_G);
    a.state = "walk"; emote(a, "♪", 1.2); return;
  }
  if (b === "nap" && r < 0.35) { dozeOff(a, cr, list, rand(5, 10), true); return; }
  if (b === "dance" && r < 0.3) { a.state = "dance"; a.t = rand(1.6, 2.8); emote(a, "♪", 1.6); return; }
  const others = list.filter(o => o !== a);
  if (others.length && r < (b === "curious" ? 0.5 : 0.18)) {
    const f = visitWho(cr, others);
    a.friend = f.id; a.state = "walk";
    a.tx = clamp(f.x + (a.x < f.x ? -1 : 1) * N.base * 1.0, N.x0, N.x1); a.ty = f.y;
    return;
  }
  [a.tx, a.ty] = roomPoint();
  a.state = "walk";
  if (b === "flutter" && Math.random() < 0.4) emote(a, "✦", 1);
}
/** A grown one sees a little one in need (careFor in nest.js), or, with nobody in need, now and then one to brush (groomFor):
 *  it goes to look after it (what happens then: the care moments, after meetFriend). One moment in a room at a time. sure:
 *  no dice (a little one has waited CARE_SOON for someone to notice it: see careDue). */
function careNext(a, cr, list, sure = false) {
  const need = careFor(cr), groom = !need && groomFor(cr), c = need || (groom && Math.random() < 0.15 ? groom : null);
  if (!c || careBusy()) return false;
  const f = (sure || careDue() || Math.random() < 0.35) && list.find(o => o.id === c.id && !["sleep", "toBed", "eat", "care"].includes(o.state));
  if (!f) return false;
  careStart(a, f, need ? careKind(c) : "groom");
  return true;
}
// (just outside the little one's personal space, or the gentle push apart would keep it from ever arriving)
// (and the little one sees it coming, and waits)
const careAim = (a, f) => {
  if (f.state === "idle" || f.state === "walk") { f.state = "idle"; f.t = Math.max(f.t || 0, 9); f.goal = f.friend = f.care = f.plan = null; f.tx = f.x; f.ty = f.y; }
  // (its own side first, the other one if that's up on the bed or off the floor)
  const side = a.x < f.x ? -1 : 1, at = k => clamp(f.x + k * N.base * 1.1, N.x0, N.x1), ok = k => !isoOnBed(at(k), f.y) && Math.abs(at(k) - f.x) > N.base;
  a.state = "walk"; a.tx = at(ok(side) || !ok(-side) ? side : -side); a.ty = f.y;
};
/** Hungry enough, and there's food in the bowl: it heads over to eat (what it does there: bowlArrive). */
function bowlCall(a, cr) {
  if (cr.sleeping || cr.tummy >= BOWL_AT || !bowlOf().length || !isoLayout().placed.bowl) return false;
  goVisit(a, DECO.bowl); if (Math.random() < 0.5) emote(a, SNACKS[specOf(cr).snack].emoji, 1.4);
  return true;
}
/** At the bowl: one snack out of it (its favourite if it's there), a munch and a happy face; an empty bowl gets a sad look. */
function bowlArrive(a, cr) {
  const bowl = bowlOf();
  a.state = "eat"; a.t = 1.6; a.tx = a.x; a.ty = a.y;
  // (only looking in, not hungry: a happy look; an empty bowl, a little sigh)
  if (!bowl.length || cr.tummy >= HUNGRY_AT) { a.state = "idle"; a.t = rand(1, 2) * linger(cr); emote(a, bowl.length ? "♥" : "…", 1.6); return; }
  const [id] = bowl.splice(bowlPick(cr, bowl), 1), fav = favFood(cr, id), v = actorView(a);
  a.atBowl = true;
  save.rooms[save.room].bowl = bowl;
  eatSnack(cr, SNACKS[id], fav);
  bump("fed");
  sfx.munch(); setTimeout(() => sfx.chirp(specOf(cr).voice * 1.1), 300);
  spawnChips(v.x, v.y, 6, 0.5, ["#f6e2b8", "#e8c48a", "#fff"]);
  setTimeout(() => emote(a, kaoFor(cr, fav ? "fave" : "fed"), 1.8), 500);
  if (a.id === save.active) { floatText(fav ? tr("favorite! ♥") : tr("yum"), v.x, v.y - v.size * 0.7, fav ? "#ffb3d4" : "#fff"); renderNest(); }
  persist();
}
/** Playing with a toy on its own cheers a glowling up a little: once in TOY_GAP at most, so a toy is a nice extra, not a way to never play. */
const TOY_JOY = 4, TOY_GAP = 3 * 60e3;
function toyJoy(cr, id, now = Date.now()) {
  if (DECOR_CAT[id] !== "play" || now - (cr.toyAt || 0) < TOY_GAP) return false;
  cr.toyAt = now; cr.joy = clamp(cr.joy + TOY_JOY, 0, 100);
  return true;
}
/** Off to a piece of furniture, to play with it (what it does there: see the arrival in updateActors). */
function goVisit(a, d) {
  const [x, y] = decorSpot(d.id);
  a.goal = d.id; a.state = "walk";
  if (d.id === "rug") { const an = rand(0, TAU), r = Math.sqrt(Math.random()), [rx, ry] = rugSize(); [a.tx, a.ty] = standSpot(x + Math.cos(an) * r * rx * 0.8, y + Math.sin(an) * r * ry * 0.75); return; }
  [a.tx, a.ty] = standSpot(x + rand(-0.25, 0.25) * N.base, clamp(y + rand(-0.1, 0.1) * N.base, N.y0, N.y1));
}
/** Who to go and see: its best friend about half the time, when that one's in the room; anyone else otherwise. */
function visitWho(cr, others) {
  const bf = cr && bestFriend(cr), f = bf && others.find(o => o.id === bf.c.id);
  return f && Math.random() < 0.5 ? f : pick(others);
}
/** Time for a doze: beside its best friend if that one is dozing in the room too, or right where it is. */
function dozeOff(a, cr, list, t, sleepy) {
  const bf = cr && bestFriend(cr), f = bf && list.find(o => o.id === bf.c.id && o.state === "nap");
  if (f && Math.hypot(f.x - a.x, f.y - a.y) > N.base * 1.4) {
    a.tx = clamp(f.x + (a.x < f.x ? -1 : 1) * N.base * 0.8, N.x0, N.x1); a.ty = f.y;
    a.state = "walk"; a.plan = "napby"; a.napT = t; return;
  }
  a.state = "nap"; a.t = t;
  if (sleepy) emote(a, "zz", 2.5);
}

// ---------- habits: each glowling's own little way (see HABITS), on top of what its kind likes ----------

/** Now and then its habit decides where it goes next: its favourite piece or spot, after whoever's nearest, a pebble hunt, the corners. */
function habitNext(a, cr, list) {
  const h = habitOf(cr), r = Math.random();
  if (h === "fave" && r < 0.4) { const d = favePiece(cr); if (d) { goVisit(a, d); return true; } }
  if (h === "spot" && r < 0.4) { [a.tx, a.ty] = faveSpot(cr); a.state = "walk"; a.plan = "spot"; return true; }
  if (h === "follow" && r < 0.55) {
    const f = list.filter(o => o !== a && o.state !== "sleep" && o.state !== "toBed").sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))[0];
    if (f) { a.tx = clamp(f.x + (a.x < f.x ? -1 : 1) * N.base * 0.85, N.x0, N.x1); a.ty = f.y; a.state = "walk"; a.plan = "follow"; return true; }
  }
  if (h === "collect" && r < 0.3) { [a.tx, a.ty] = roomPoint(); a.state = "walk"; a.plan = "collect"; return true; }
  if (h === "corners" && r < 0.45) { [a.tx, a.ty] = cornerPoint(); a.state = "walk"; a.plan = "corner"; return true; }
  return false;
}
/** Got where its habit took it: what it does there. */
function habitArrive(a, cr) {
  const plan = a.plan;
  a.plan = null; a.state = "idle"; a.t = rand(1.2, 3) * linger(cr);
  if (plan === "spot") { a.t = rand(5, 9) * linger(cr); emote(a, "♥", 1.4); }
  else if (plan === "follow") a.t = rand(0.5, 1.2);
  else if (plan === "corner") { a.face = { kind: "look", t: 0, life: 2, side: Math.random() < 0.5 ? -1 : 1 }; emote(a, Math.random() < 0.5 ? kaoFor(cr, "curious") : "?", 1.4); }
  else if (plan === "hide") { a.t = rand(3, 5); emote(a, "☂", 2.2); a.shake = 0.5; }
  else if (plan === "napby") { a.state = "nap"; a.t = a.napT || rand(5, 8); emote(a, "zz", 2.5); }
  else if (plan === "collect") {
    // a pebble found: picked up, and carried off to bed
    emote(a, "💎", 2.6); a.hop = 1;
    const p = isoLayout().placed.bed;
    [a.tx, a.ty] = p ? standSpot(...isoPieceAt(p, rand(0.9, 1.3))) : [clamp(N.bedX + rand(-0.6, 0.6) * N.base, N.x0, N.x1), N.bedY];
    a.state = "walk"; a.plan = "carry";
  } else if (plan === "carry") { emote(a, "♥", 1.4); a.hop = 1; }
}
/** Its own favourite spot on the floor, the same one every time (moved off any piece standing there now). */
function faveSpot(cr) {
  const u = 0.2 + (idHash(cr.id, 1) % 1000) / 1000 * 0.6, v = 0.2 + (idHash(cr.id, 2) % 1000) / 1000 * 0.6;
  const m = isoMargin(0.42), [x, y] = isoAt(lerp(m, 1 - m, u), lerp(m, 1 - m, v));
  return standSpot(x + rand(-0.06, 0.06) * N.base, y + rand(-0.03, 0.03) * N.base);
}
/** A free spot near the room's edge: the farthest from the middle of a few tries. */
function cornerPoint(from = isoAt(0.5, 0.5)) {
  let best = null, far = -1;
  for (let k = 0; k < 6; k++) { const p = roomPoint(), d = Math.hypot(p[0] - from[0], (p[1] - from[1]) * 2); if (d > far) { far = d; best = p; } }
  return best;
}
/** A long stretch, up on its toes twice, before anything else. */
function stretchOut(a, cr) {
  a.state = "idle"; a.t = 3.2; a.hop = 1; emote(a, "🥱", 1.4); sfx.stretch(specOf(cr).voice);
  setTimeout(() => { if (a.state === "idle") { a.hop = 1; emote(a, "☀", 1.4); } }, 1100);
}
/** Standing about with nothing going on, a hummer hums: a note over its head every few seconds (and softly, if it's yours). */
function humAlong(a, cr, dt) {
  if (a.state !== "idle" || cr.sleeping || a.emote) return;
  if ((a.humT = (a.humT ?? rand(1, 3)) - dt) > 0) return;
  a.humT = rand(3.5, 6);
  emote(a, Math.random() < 0.5 ? "♪" : "♫", 1.5); a.hop = Math.max(a.hop, 0.3);
  if (a.id === save.active && sfx.ready()) { const f = 330 * (specOf(cr).voice || 1), t = sfx.ac.currentTime; sfx.tone(t, f, 0.012, 0.25, "sine", f * 1.06); sfx.tone(t + 0.28, f * 1.12, 0.01, 0.3, "sine", f * 1.06); }
}

/** Two glowlings meet: a hug, a high five, a game of tag, a little duet, or (if both are tired) a nap side by side. It cheers them both up. */
function meetFriend(a, f, cr) {
  const fc = save.creatures.find(c => c.id === f.id);
  a.hop = 1; f.hop = 1;
  if (!fc || f.state === "sleep" || f.state === "toBed") { emote(a, "♥"); sfx.chirp(specOf(cr).voice * 1.1); return; }
  const va = actorView(a), vf = actorView(f), mx = (va.x + vf.x) / 2, my = Math.min(va.y, vf.y) - va.size * 0.35;
  const kind = cr.energy < 45 && fc.energy < 45 ? "snuggle" : pick(["hug", "hug", "highfive", "tag", "sing"]);
  if (kind === "hug") {
    for (let i = 0; i < 4; i++) setTimeout(() => heart(mx + rand(-14, 14), my + rand(-6, 6)), i * 120);
    const bff = bestFriend(cr)?.c.id === fc.id;
    emote(a, bff ? kaoFor(cr, "friend") : "♥"); emote(f, "♥"); sfx.chirp(specOf(cr).voice * 1.1);
  } else if (kind === "highfive") {
    burst(mx, my, 10, ["#ffffff", "#ffe9a8", "#ffc4da"], 0.8); emote(a, "✦"); emote(f, "✦"); sfx.shimmer();
  } else if (kind === "tag") {
    // tag, you're it: the friend runs off and this one chases after
    emote(a, "!"); emote(f, "♪");
    [f.tx, f.ty] = roomPoint(); f.state = "walk"; f.goal = f.friend = null;
    a.state = "walk"; a.tx = f.tx + rand(-0.6, 0.6) * N.base; a.ty = f.ty;
    sfx.chirp(specOf(fc).voice * 1.25);
  } else if (kind === "sing") {
    emote(a, "♪", 1.8); emote(f, "♫", 1.8);
    sfx.chirp(specOf(cr).voice); setTimeout(() => sfx.chirp(specOf(fc).voice * 1.2), 220); setTimeout(() => sfx.chirp(specOf(cr).voice * 1.1), 440);
  } else {
    a.state = f.state = "nap"; a.t = f.t = rand(5, 8); emote(a, "zz", 2.5); emote(f, "zz", 2.5);
  }
  // friends remember each other, and a good meeting cheers both up
  for (const [c, o] of [[cr, fc], [fc, cr]]) {
    c.joy = clamp(c.joy + 3, 0, 100); c.pals = { ...c.pals, [o.id]: ((c.pals || {})[o.id] || 0) + 1 };
    if (c.pals[o.id] === 5) remember(c, "Became friends with {0} ♥", o.name);
  }
  // (just become friends: both pleased about it)
  if (cr.pals[fc.id] === 5) { emote(a, kaoFor(cr, "friend"), 2); emote(f, kaoFor(fc, "friend"), 2); }
}

// ---------- care moments: a grown one looking after a little one, in a way you can see (#319; the rules: careFor in nest.js) ----------
// The grown one walks over (or first to the bowl or the wall, for a snack) and the two share a few seconds standing still
// ("care" for both, its steps in a.cm.ph, timed by a.cm.t): nobody else moves them, and a call, a stroke or a snack for
// anyone breaks it off gently (what it took from the bowl goes back). Drawn as offsets on top of where they stand: lean
// (sideways), dip (down), squish (wider and lower), so the walking and the room's push apart never fight it.
//   feed:  to the bowl (a snack lifted out) or to the wall (a berry picked), held in front on the way back, set down at
//          the little one's feet, nudged over twice with its nose; the little one hops to it and munches.
//   play:  a ball of sparkles made in its paws, tossed between them five times (a bell each catch, one note higher), then a
//          pop of sparkles and a little dance together.
//   hug:   a sad face; the two lean in till they touch and squish together twice in a soft pink glow; the sad face turns pleased.
//   tuck:  a moon and a yawn; the little one goes to its bed, the big one follows, covers it with a leaf, pats it three
//          times, "shh…", and stays by it a moment.
//   groom: it leans in and brushes, dust flying off the little one in specks, which squints; then it shines.
/** In the room, a little one in need is noticed within this long (ms) of the last moment or of coming in. */
const CARE_SOON = 50e3;
/** How long each step stands (s): the moment's own steps, then the walks between them (no timer). */
const CARE_T = { pick: 1.1, feed: 3.4, play: 4.6, hug: 3.6, tuck: 1.4, pat0: 6, pat: 2.6, watch: 3, groom: 2.8 };
/** The line over the pair as it happens, by what they do. */
const CARE_SAYS = { feed: "{0} found {1} a berry", bowl: "{0} brings {1} a snack", play: "{0} plays with {1}", hug: "{0} hugs {1}", tuck: "{0} tucks {1} in", groom: "{0} brushes {1} clean" };
const careBusy = () => [...actors.values()].some(o => o.cm);
/** Has anyone in need waited long enough here to be noticed for sure (a moment, or coming into the room, starts the wait). */
function careDue() {
  const n = game.nest;
  if (n.careRoom !== save.room) { n.careRoom = save.room; n.careAt = game.time; }
  return game.time - n.careAt > CARE_SOON;
}
function careStart(a, f, kind) {
  a.care = f.id; a.careTry = 0; a.friend = a.goal = a.plan = null;
  a.cm = { kind, ph: "go", t: 0 };
  game.nest.careAt = game.time;
  // the first time, Mossa points at the two of them as it sets off, so the moment plays out while she says what it is
  if (!talkSeen("bigCare")) { const cr = save.creatures.find(x => x.id === a.id); if (cr) setTimeout(() => careHint(cr, a.id, f.id), 400); }
  if (kind !== "feed") { careAim(a, f); return; }
  // a snack first: from the bowl here if there's food in it, else a berry by the wall
  a.cm.ph = "fetch"; a.cm.bowl = !!(hasDecor("bowl") && isoLayout().placed.bowl && bowlOf().length);
  [a.tx, a.ty] = a.cm.bowl ? standSpot(...decorSpot("bowl")) : cornerPoint();
  a.state = "walk"; emote(a, "!", 1);
}
/** Both stand still for the next step (the little one too, when told). */
function careStep(a, ph, f) {
  a.cm.ph = ph; a.cm.t = 0; a.state = "care"; a.tx = a.x; a.ty = a.y;
  if (f) { f.state = "care"; f.cmBy = a.id; f.goal = f.friend = f.care = f.plan = null; f.tx = f.x; f.ty = f.y; }
}
/** Got where it was walking: to the snack, to the bed, or beside the little one (it wandered off on the way: after it, twice at most). */
function careArrive(a, cr) {
  const m = a.cm, f = actors.get(a.care), c = f && save.creatures.find(x => x.id === f.id);
  if (!m || !c) { careEnd(a); return; }
  if (m.ph === "fetch") { careStep(a, "pick"); return; }
  if (m.ph === "bed") { careStep(a, "pat0"); return; }
  const far = Math.hypot(f.x - a.x, (f.y - a.y) * 1.6) > N.base * 1.8;
  if (far && (a.careTry = (a.careTry || 0) + 1) < 3 && careYoung(cr, c)) { careAim(a, f); return; }
  // (and it went and ate at the bowl by itself meanwhile, or cheered up: no longer needed, and what it brought goes back)
  const needed = m.kind === "groom" || Math.min(c.tummy, c.joy) < CARE_LOW || careSleepy(c);
  if (far || !needed || !canCare(cr) || !careYoung(cr, c) || ["sleep", "toBed", "eat"].includes(f.state)) { careEnd(a); return; }
  careStep(a, m.kind === "feed" ? "feed" : m.kind, f);
}
/** All done, or broken off: both let go, and a snack it took and never gave goes back in the bowl. */
function careEnd(a, done = false) {
  const m = a.cm, f = actors.get(a.care);
  if (m && m.from === "bowl" && !m.gone) careBack(save.room, m.snack);
  for (const b of [a, f]) if (b) { b.lean = b.dip = b.squish = 0; b.cmMood = b.cmFace = null; }
  if (f && f.cmBy === a.id) { f.cmBy = null; if (f.state === "care") { f.state = "idle"; f.t = rand(1, 2); } }
  a.cm = a.care = null;
  if (a.state === "care" || a.state === "walk") { a.state = "idle"; a.t = done ? rand(2, 3.5) : rand(0.5, 1.5); a.tx = a.x; a.ty = a.y; }
  game.nest.careAt = game.time;
}
/** The need met: the little one's tummy, joy or sleep, the line over them, hearts, the diary's note, and the first time, Mossa. */
function careGive(a, cr, f, c) {
  const m = a.cm, kind = giveCare(cr, c, Date.now(), m.kind, m.from === "bowl" ? m.snack : "");
  if (!kind) return false;
  if (m.from === "bowl") m.gone = true;
  const va = actorView(a), vf = actorView(f), mx = (va.x + vf.x) / 2, my = Math.min(va.y, vf.y) - va.size * 0.35;
  for (let i = 0; i < 3; i++) setTimeout(() => heart(mx + rand(-12, 12), my + rand(-6, 6)), i * 160);
  floatText(tr(CARE_SAYS[m.from === "bowl" ? "bowl" : kind], cr.name, c.name), mx, my - N.base * 0.6, "#ffc4da");
  if (cr.careNoted && Date.now() - cr.careNoted < 1000) setTimeout(() => floatText(tr("✎ in the diary"), mx, my - N.base * 0.25, "#d2bfff"), 900);
  persist();
  if (a.id === save.active || f.id === save.active) renderNest();
  return true;
}
/** The first moment you see, as it begins: Mossa says what the big ones do (pointing at the pair), when nothing else is going on; else next time. */
function careHint(cr, ...ids) {
  if (game.scene !== "nest" || talkNow || sheetTitle() || bannerUp() || calmNow()) return;
  game.nest.carePair = ids;
  talk("bigCare", cr);
}
/** Where the two of them are on screen, for Mossa to point at. */
function spotPair() {
  const ps = game.scene === "nest" && (game.nest.carePair || []).map(id => actors.get(id)).filter(Boolean);
  if (!ps || !ps.length) return null;
  const vs = ps.map(actorView), r = vs[0].size * 0.6, x0 = Math.min(...vs.map(v => v.x)) - r, x1 = Math.max(...vs.map(v => v.x)) + r, y0 = Math.min(...vs.map(v => v.y)) - r * 1.1, y1 = Math.max(...vs.map(v => v.y)) + r;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
const ease01 = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
const pulse = (t, at, len) => t > at && t < at + len ? Math.sin((t - at) / len * Math.PI) : 0;
/** Each moment, step by step: called every frame for the grown one in it. */
function careTick(a, cr, dt) {
  const m = a.cm, f = actors.get(a.care), c = f && save.creatures.find(x => x.id === f.id);
  const walk = ["go", "fetch", "bring", "bed"].includes(m.ph), bed = ["pat0", "pat", "watch"].includes(m.ph);
  // (called over, stroked, someone fed: it lets the moment be; and so when the little one is gone, or isn't in it any more)
  if (!c || a.state !== (walk ? "walk" : "care") || (bed ? !c.sleeping : !walk && m.ph !== "pick" && !["care", "eat"].includes(f.state))) { careEnd(a); return; }
  if (walk) return;
  const t0 = m.t, t = m.t += dt, at = k => t0 < k && t >= k, v = actorView(a), S = v.size, s = Math.sign(f.x - a.x) || 1, voice = specOf(cr).voice, fv = specOf(c).voice;
  for (const p of m.specks || []) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 30 * dt; }
  if (m.specks) m.specks = m.specks.filter(p => p.t < 0.8);
  if (m.ph === "pick") {
    // down to the floor and up again, the snack in its paws
    a.dip = Math.sin(clamp(t / 0.9, 0, 1) * Math.PI) * S * 0.12;
    if (at(0.45)) {
      const id = m.bowl ? careTake(cr, c) : "";
      m.snack = id || "berry"; m.from = id ? "bowl" : "found";
      sfx.pluck(voice); burst(v.x + s * S * 0.2, a.y - S * 0.15, 6, id ? ["#efe6ff", "#ffffff"] : ["#a3dd9b", "#d2bfff", "#ffffff"], 0.4);
    }
    if (t >= CARE_T.pick) { a.dip = 0; m.ph = "bring"; careAim(a, f); }
    return;
  }
  if (m.ph === "feed") {
    // set down at the little one's feet, nudged twice, then eaten
    a.lean = s * S * 0.2 * (pulse(t, 0.55, 0.4) + pulse(t, 1.0, 0.4)); a.dip = S * 0.06 * (pulse(t, 0, 0.5) + pulse(t, 0.55, 0.4) + pulse(t, 1.0, 0.4));
    m.nudge = ease01((t - 0.55) / 0.3) + ease01((t - 1.0) / 0.3);
    if (at(0.45)) sfx.setDown();
    if (at(0.7) || at(1.15)) sfx.boop(voice);
    if (t > 1.3 && t < 1.65) f.lean = -s * S * 0.18 * pulse(t, 1.3, 0.35);
    if (at(1.6)) {
      f.lean = 0; m.eaten = true;
      if (!careGive(a, cr, f, c)) { careEnd(a); return; }
      f.state = "eat"; f.t = 1.6; f.hop = 1; sfx.munch();
      const fw = actorView(f); spawnChips(fw.x, fw.y, 6, 0.5, ["#f6e2b8", "#e8c48a", "#fff"]);
      setTimeout(() => emote(f, kaoFor(c, "care"), 1.8), 700);
    }
    if (t >= CARE_T.feed) { emote(a, "♥", 1.6); careEnd(a, true); }
    return;
  }
  if (m.ph === "play") {
    // five tosses of a sparkle ball, 0.6 s each from 0.4 s, each catch a hop and a bell; then a pop and a dance
    a.cmMood = f.cmMood = "happy";
    if (at(0.05)) { burst(v.x, v.y - S * 0.3, 8, ["#fff6c2", "#ffffff", "#ffc4da"], 0.4); sfx.shimmer(); emote(a, "♪", 1.2); }
    const k = (t - 0.4) / 0.6, n = Math.floor(k);
    m.ball = t < 0.4 ? { from: a, to: a, k: 0 } : n < 5 ? { from: n % 2 ? f : a, to: n % 2 ? a : f, k: k - n } : null;
    for (let i = 1; i <= 5; i++) if (at(0.4 + i * 0.6)) { const who = i % 2 ? f : a; who.hop = 0.8; sfx.note(Math.min(3, i - 1)); }
    if (at(3.45)) {
      const fw = actorView(f); burst(fw.x, fw.y - S * 0.2, 14, ["#fff6c2", "#ffffff", "#ffc4da", "#d2bfff"], 0.8); sfx.shimmer();
      if (!careGive(a, cr, f, c)) { careEnd(a); return; }
      emote(f, kaoFor(c, "care"), 1.8);
    }
    if (t > 3.4) { a.hop = Math.abs(Math.sin(t * 7)) * 0.5; f.hop = Math.abs(Math.sin(t * 7 + 1)) * 0.5; }
    if (t >= CARE_T.play) careEnd(a, true);
    return;
  }
  if (m.ph === "hug") {
    // lean in till they touch, squish together twice in a glow, then a step back
    const d = Math.abs(f.x - a.x), meet = Math.max(0, (d - S * 0.55) / 2), k = ease01(t / 0.6) * (1 - ease01((t - 2.8) / 0.6));
    a.lean = s * meet * k; f.lean = -s * meet * k;
    a.squish = f.squish = 0.1 * (pulse(t, 0.7, 0.8) + pulse(t, 1.6, 0.8));
    m.glow = k;
    if (at(0.01)) emote(f, KAO.sad.text, 1.4);
    if (at(0.6)) sfx.hug(voice);
    if (at(1.0) || at(1.6) || at(2.2)) heart((v.x + actorView(f).x) / 2 + rand(-8, 8), v.y - S * 0.4);
    if (at(2.6)) { if (!careGive(a, cr, f, c)) { careEnd(a); return; } emote(f, KAO.pleased.text, 2); emote(a, "♥", 1.6); sfx.chirp(fv * 1.2); }
    if (t >= CARE_T.hug) careEnd(a, true);
    return;
  }
  if (m.ph === "tuck") {
    // a moon, a yawn, and off to bed (the little one goes by itself, as a sleepy one does); the big one follows
    if (at(0.01)) emote(a, "🌙", 1.6);
    if (at(0.5)) { emote(f, "🥱", 1.6); sfx.yawn(); f.hop = 0.6; }
    a.lean = s * S * 0.12 * pulse(t, 0.2, 1);
    if (t >= CARE_T.tuck) {
      if (!careGive(a, cr, f, c)) { careEnd(a); return; }
      f.cmBy = null; f.state = "toBed";
      const [bx, by] = bedSpot(f.id);
      m.ph = "bed"; a.state = "walk"; a.lean = 0; a.tx = clamp(bx + (a.x < bx ? -1 : 1) * N.base * 0.85, N.x0, N.x1); a.ty = by;
    }
    return;
  }
  if (m.ph === "pat0") { if (f.state === "sleep" || t >= CARE_T.pat0) { careStep(a, "pat"); f.blanket = game.time; } return; }
  if (m.ph === "pat") {
    // the leaf drawn over it (see drawCareProps), three pats, "shh…"
    a.lean = s * S * 0.16 * (pulse(t, 0.5, 0.35) + pulse(t, 0.95, 0.35) + pulse(t, 1.4, 0.35)); a.dip = a.lean * s * 0.3;
    if (at(0.3)) { const fw = actorView(f); floatText(tr("shh…"), fw.x, fw.y - S * 0.7, "#d2bfff"); }
    if (at(0.65) || at(1.1) || at(1.55)) sfx.pat();
    if (at(1.7)) sfx.hush();
    if (at(2.1)) emote(a, KAO.sleepy.text, 2.4);
    if (t >= CARE_T.pat) { a.lean = a.dip = 0; careStep(a, "watch"); }
    return;
  }
  if (m.ph === "watch") { if (t >= CARE_T.watch) careEnd(a, true); return; }
  if (m.ph === "groom") {
    // leaning in and brushing, the dust flying off in specks; then it shines
    const k = ease01(t / 0.4) * (1 - ease01((t - 2.2) / 0.4));
    // (up close, however far apart they stood)
    const reach = Math.max(S * 0.2, Math.abs(f.x - a.x) - S * 0.7);
    a.lean = s * (reach + Math.sin(t * 14) * S * 0.06) * k; f.cmFace = t > 0.4 && t < 2.3 ? "squint" : null;
    if (t > 0.4 && t < 2.2 && Math.floor(t / 0.07) !== Math.floor(t0 / 0.07)) for (let i = 0; i < 2; i++) {
      const fw = actorView(f), an = rand(-0.9, 0.9);
      (m.specks = m.specks || []).push({ x: fw.x + s * rand(-0.1, 0.35) * S, y: fw.y + rand(-0.3, 0.25) * S, vx: s * Math.cos(an) * rand(40, 90), vy: -rand(20, 60), t: 0, c: pick(["#ffffff", "#e6e0ff", "#c9b8ff", "#b9b3c0"]) });
    }
    if (at(0.45) || at(1.05) || at(1.65)) sfx.brush();
    if (at(2.2)) {
      if (!careGive(a, cr, f, c)) { careEnd(a); return; }
      const fw = actorView(f); burst(fw.x, fw.y, 12, ["#ffffff", "#fff6c2", "#efe6ff"], 0.6); sfx.shimmer(); f.hop = 1; emote(f, kaoFor(c, "care"), 1.8);
    }
    if (t >= CARE_T.groom) careEnd(a, true);
  }
}

// the little things the moments are drawn with, as pixel maps in the furniture's colours (IC, written out: it comes later) (outlined in ink like them, but the ball)
const CARE_ART = {
  berry: { pal: { l: "#d2bfff", m: "#8a6cc9", d: "#6b4fa8", w: "#ffffff", g: "#57ad6a" }, rows: ["..gg..", ".llll.", "lwllmm", "llllmm", "lllmmd", ".mmdd."] },
  cookie: { pal: { c: "#eec26a", s: "#c98f3a", b: "#5e3a1c" }, rows: [".cccc.", "ccbccc", "cccccb", "cbcccs", "ccsbss", ".ssss."] },
  dew: { pal: { b: "#69b7d6", l: "#b8e6f5", d: "#3383a8", w: "#ffffff" }, rows: ["..b..", "..b..", ".blb.", "bwlbb", "bbbbd", ".bdd."] },
  star: { pal: { y: "#fff0b5", o: "#eec26a", w: "#ffffff" }, rows: ["..y..", ".ywy.", "yyyoo", ".yoo.", ".y.o."] },
  glowcap: { pal: { r: "#e88bb1", w: "#ffffff", d: "#c25586", s: "#e4dfe8" }, rows: [".rrrr.", "rwrrrd", "rrrrdd", "..ss..", "..ss.."] },
  // the ball of sparkles: a little glowing star, no outline
  ball: { pal: { w: "#ffffff", y: "#fff6c2", o: "#fff0b5" }, rows: ["..w..", ".wyw.", "wyoyw", ".wyw.", "..w.."], bare: true },
  // the leaf blanket: a broad leaf lying over the sleeper, its vein along the middle and its stalk out at one end
  leaf: { pal: { G: "#a3dd9b", g: "#57ad6a", d: "#2f7d4a", v: "#2f7d4a", s: "#946027" }, rows: ["......gggg......", "...ggGGGGGGgg...", ".gGGGGGGGGGGGGg.", "gGvvvvvvvvvvvvGgss", "ggggggggggggggd..", ".dddddddddddd...."] },
};
const careArts = {};
function careArt(id) {
  if (careArts[id]) return careArts[id];
  const A = CARE_ART[id] || CARE_ART.berry, w = Math.max(...A.rows.map(r => r.length)), h = A.rows.length, o = A.bare ? 0 : 1;
  const c = document.createElement("canvas"); c.width = w + 2 * o; c.height = h + 2 * o;
  const g = c.getContext("2d"), on = (x, y) => (A.rows[y] || "")[x] in A.pal;
  if (o) { g.fillStyle = "#160c26"; for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) g.fillRect(x + o, y + o, 1, 1); }
  A.rows.forEach((row, y) => [...row].forEach((ch, x) => { if (A.pal[ch]) { g.fillStyle = A.pal[ch]; g.fillRect(x + o, y + o, 1, 1); } }));
  return careArts[id] = c;
}
/** One of them drawn centred on (x, y), about wide across (in screen px), on whole art pixels. */
function drawCareArt(id, x, y, wide, alpha = 1) {
  const art = careArt(id), P = PX * Math.max(1, Math.round(wide / art.width / PX)), w = art.width * P, h = art.height * P;
  ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(art, Math.round((x - w / 2) / PX) * PX, Math.round((y - h / 2) / PX) * PX, w, h);
  ctx.restore();
}
/** Where the grown one holds the snack: in front of it, low, bobbing with its step. */
const careHand = (a, v) => [v.x + (Math.sign(actors.get(a.care)?.x - a.x) || 1) * v.size * 0.22, v.y + v.size * 0.18 + Math.sin(a.ph * 9) * v.size * 0.02];
/** On a glowling, after it's drawn: the snack it carries, and the leaf over one tucked in (it slides up over it as it's laid on). */
function drawCareProps(a, v) {
  const m = a.cm;
  if (m && m.snack && (m.ph === "pick" || m.ph === "bring" || (m.ph === "feed" && m.t < 0.45))) { const [hx, hy] = careHand(a, v); if (m.ph !== "feed") drawCareArt(m.snack, hx, hy, v.size * 0.3); }
  if (a.blanket && a.state !== "sleep" && game.time - a.blanket > 8000) a.blanket = 0;
  if (a.blanket && a.state === "sleep") { const k = ease01((game.time - a.blanket) / 500); drawCareArt("leaf", v.x, v.y + v.size * (0.2 + 0.12 * (1 - k)), v.size * 0.85, k); }
}
/** Over the room, after everyone: the snack set down and nudged, the ball in the air, the hug's glow, the dust brushed off. */
function drawCareOver() {
  for (const a of actors.values()) {
    const m = a.cm, f = m && actors.get(a.care);
    if (!f) continue;
    const va = actorView(a), vf = actorView(f), S = va.size, s = Math.sign(f.x - a.x) || 1;
    if (m.ph === "feed" && m.snack && !m.eaten) {
      // from its paws down to the floor in a little arc, then a nudge nearer the little one each time
      // (set down just in front of the little one's feet, whatever way they stand)
      const [hx, hy] = careHand(a, va), fx0 = f.x - s * S * (0.62 - 0.2 * (m.nudge || 0)), fy0 = f.y - S * 0.08, k = ease01(m.t / 0.45);
      drawCareArt(m.snack, lerp(hx, fx0, k), lerp(hy, fy0, k) - Math.sin(k * Math.PI) * S * 0.15, S * 0.3);
    }
    if (m.ph === "play" && m.ball) {
      const p = actorView(m.ball.from), q = actorView(m.ball.to), k = m.ball.k, x = lerp(p.x, q.x, k), y = lerp(p.y - S * 0.25, q.y - S * 0.25, k) - Math.sin(k * Math.PI) * S * 0.7;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(x, y, 0, x, y, S * 0.4); g.addColorStop(0, "rgba(255,240,190,.7)"); g.addColorStop(1, "rgba(255,240,190,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, S * 0.4, 0, TAU); ctx.fill(); ctx.restore();
      // (a trail of three fading dots behind it)
      ctx.fillStyle = "#fff6c2";
      for (let i = 1; i <= 3; i++) { const j = clamp(k - i * 0.07, 0, 1), tx = lerp(p.x, q.x, j), ty = lerp(p.y - S * 0.25, q.y - S * 0.25, j) - Math.sin(j * Math.PI) * S * 0.7; ctx.globalAlpha = 0.6 - i * 0.15; ctx.fillRect(Math.round(tx / PX) * PX, Math.round(ty / PX) * PX, 2 * PX, 2 * PX); }
      ctx.globalAlpha = 1;
      drawCareArt("ball", x, y, S * 0.26);
    }
    if (m.ph === "hug" && m.glow > 0.02) {
      const x = (va.x + vf.x) / 2, y = (va.y + vf.y) / 2, r = S * (0.75 + 0.06 * Math.sin(game.time * 0.006)) * (0.6 + 0.4 * m.glow);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(x, y, S * 0.1, x, y, r); g.addColorStop(0, `rgba(255,170,210,${0.32 * m.glow})`); g.addColorStop(0.6, `rgba(255,200,170,${0.14 * m.glow})`); g.addColorStop(1, "rgba(255,200,170,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
    }
    for (const p of m.specks || []) { ctx.globalAlpha = 1 - p.t / 0.8; ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x / PX) * PX, Math.round(p.y / PX) * PX, PX * (p.t < 0.3 ? 3 : 2), PX * (p.t < 0.3 ? 3 : 2)); }
    ctx.globalAlpha = 1;
  }
}

/** A hopper's way forward comes in pushes, one per hop (on average as fast as a steady walk). */
const hopGate = a => Math.sin(((a.gait || 0) % 1) * Math.PI) * Math.PI / 2;

// little faces while it rests, now and then: a blink, a contented squint, a look aside, a thought. Which ones, by character
const FACE_MIX = { sleepy: { squint: 2, look: 1, think: 1, blink: 1 }, curious: { think: 3, look: 3, squint: 1, blink: 1 }, sparkle: { blink: 3, look: 3, think: 1, squint: 1 }, big: { look: 2, think: 2, blink: 2, squint: 1 }, round: { blink: 2, look: 2, think: 1, squint: 1 } };
const FACE_LIFE = { blink: 0.4, squint: 1.1, look: 2, think: 2.4 };
function faceMoments(a, cr, dt) {
  const calm = calmOf(cr.level), resting = a.state === "idle" && !cr.sleeping && !petted(a);
  if (a.face && ((a.face.t += dt) > a.face.life || !resting)) a.face = null;
  if (!resting || a.face || (a.faceT = (a.faceT ?? rand(2, 10)) - dt) > 0) return;
  // every 6 to 12 seconds or so, each on its own clock; the older, the rarer and the slower
  a.faceT = rand(6, 12) / calm.fidget;
  const sp = specOf(cr), mix = FACE_MIX[(sp.beh || BEHAVIOR[sp.id]) === "curious" ? "curious" : sp.eyes] || FACE_MIX.round;
  let r = Math.random() * Object.values(mix).reduce((n, w) => n + w, 0), kind = "blink";
  for (const [k, w] of Object.entries(mix)) if ((r -= w) < 0) { kind = k; break; }
  a.face = { kind, t: 0, life: FACE_LIFE[kind] / (0.6 + 0.4 * calm.fidget), side: Math.random() < 0.5 ? -1 : 1 };
}
/** The face moment to draw this instant ("" for none): a blink is a quick double one. */
const faceNow = a => !a.face ? "" : a.face.kind === "blink" ? (a.face.t % 0.25 < 0.11 ? "blink" : "") : a.face.kind === "squint" ? "squint" : a.face.kind + (a.face.side < 0 ? "L" : "R");

function updateActors(dt) {
  syncActors();
  game.nest.obst = roomObstacles();
  const list = [...actors.values()], call = game.nest.call;
  // a finger held still on the floor keeps calling (moving it is not needed)
  if (call && pointer && pointer.call) call.t = game.time;
  for (const a of list) {
    const cr = save.creatures.find(c => c.id === a.id);
    if (!cr || seekHidden(a)) continue;
    a.ph += dt;
    if (a.emote && (a.emote.t += dt) > a.emote.life) a.emote = null;
    a.hop = Math.max(0, a.hop - dt * 1.8);
    if (a.shake) a.shake = Math.max(0, a.shake - dt * 1.4);
    // every few seconds: real time catches up, and a very tired glowling takes itself to bed (and gets up again when rested)
    if ((a.needT = (a.needT ?? rand(0, 3)) - dt) < 0) {
      a.needT = 4;
      applyTime(cr);
      const stroked = petted(a);
      // sleepy: a yawn, and off it goes to bed by itself (not right after you woke it up, though)
      if (!cr.sleeping && cr.energy < 20 && !stroked && a.state !== "eat" && Date.now() - (cr.wokeAt || 0) > 3 * 60e3) { cr.sleeping = true; cr.selfSlept = true; emote(a, "🥱", 2.2); sfx.yawn(); a.hop = 1; persist(); if (a.id === save.active) renderNest(); }
      else if (cr.sleeping && cr.energy >= 99) wakeRested(cr, a);
      // grown, on one of its days: it looks toward the valley (a compass over its head; now and then again, never more)
      else if (noteWish(cr) || (!a.emote && wishing(cr) && !cr.sleeping && Math.random() < 0.04)) { emote(a, "🧭", 2.6); a.hop = Math.max(a.hop, 0.5); }
      // hungry and standing about, with food in the bowl: it doesn't wait for its next idea
      else if (a.state === "idle" && hasDecor("bowl")) bowlCall(a, cr);
      // a little one in need here, and nobody's noticed it for a while: a grown one standing about goes over now
      if (a.state === "idle" && !cr.sleeping && careDue()) careNext(a, cr, [...actors.values()], true);
    }
    // an unhurried pace, slower with age, and a stroll when there's nothing it needs
    const calm = calmOf(cr.level), base = (a.beh === "flutter" || a.beh === "swim" ? 85 : a.beh === "nap" ? 35 : 55) * N.base / 100 * 0.8 * calm.go;
    // (on its way to look after a little one, it hurries a little)
    let speed = base * (a.rain ? 1.6 : content(cr) ? 0.85 : 1) * (a.care ? 1.5 : 1), target = null;
    if (cr.sleeping) {
      target = bedSpot(a.id);
      // asleep somewhere else (the bed moved, or someone else lay down and the places shifted): shuffle over and lie down again
      if (a.state !== "sleep" || Math.hypot(a.x - target[0], a.y - target[1]) > 10) a.state = "toBed";
    } else if (a.state === "sleep" || a.state === "toBed") { a.state = "idle"; a.t = 0.5; }
    // a finger held on the floor calls everyone over
    if (!cr.sleeping && call && game.time - call.t < 400 && a.state !== "eat") {
      if (a.state !== "called") emote(a, "!", 0.9);
      a.state = "called";
      target = [call.x + Math.cos(a.id * 2.4) * N.base * 0.55, clamp(call.y + Math.sin(a.id * 2.4) * N.base * 0.3, N.y0, N.y1)];
      speed = base * (a.beh === "curious" ? 3.2 : 2.3);
    } else if (a.state === "called") { a.state = "idle"; a.t = rand(1, 2.5); }
    // someone is being fed: only the really hungry ones come running, hoping for a crumb (the rest just carry on)
    const fc = game.nest.feedCall;
    if (!target && !cr.sleeping && fc && game.time - fc.t < 3500 && a.id !== fc.id && cr.tummy < BEG_TUMMY && a.state !== "eat" && actors.get(fc.id)) {
      const f = actors.get(fc.id), an = a.id * 2.4;
      if (a.state !== "begging") { emote(a, SNACKS[specOf(cr).snack].emoji, 1.8); a.hop = 1; }
      a.state = "begging"; a.goal = a.friend = null; a.rain = false;
      target = [f.x + Math.cos(an) * N.base * 0.75, f.y + Math.sin(an) * N.base * 0.4];
      speed = base * 2.6;
    } else if (a.state === "begging") { a.state = "idle"; a.t = rand(1, 2); }
    // bubbles for everyone (see startParty): off after the next bubble, at a run
    const bub = !target && !cr.sleeping && a.state !== "eat" && partyBubble(a);
    if (bub) {
      if (a.state !== "party") { a.goal = a.friend = a.decor = a.plan = null; a.rain = a.garden = false; }
      a.state = "party"; target = [bub.x, bub.y]; speed = base * 2.1;
    } else if (a.state === "party") { a.state = "idle"; a.t = rand(1, 2); }
    // the Gloom's shadows are in: the little ones huddle close together, and gather round your light while it shines (gloomHuddle)
    const hud = !target && !cr.sleeping && a.state !== "eat" && gloomHuddle(a);
    if (hud) {
      if (a.state !== "huddle") { a.goal = a.friend = a.decor = null; a.rain = a.garden = false; }
      a.state = "huddle"; target = hud; speed = base * (gloomNow.lamp.on ? 2.2 : 1.3);
    } else if (a.state === "huddle") { a.state = "idle"; a.t = rand(1, 2); }
    // until the first stroke, your glowling waits in the middle of the room where the hint points
    if (!target && !cr.sleeping && a.id === save.active && !tipDone("pet") && a.state !== "eat") {
      target = decorSpot("rug"); a.goal = a.friend = null;
      if (a.state !== "idle") { a.state = "idle"; a.t = 1; }
    }
    if (petted(a) && a.state !== "bath") { a.tx = a.x; a.ty = a.y; a.state = "idle"; a.t = 1.5; }
    else if (target) { a.tx = target[0]; a.ty = target[1]; }
    else if (a.state === "eat") { if ((a.t -= dt) <= 0) {
      // fed at the bowl: it steps away to make room for the next one (and has its after-meal nap over there, if that's its way)
      if (a.atBowl) { a.atBowl = false; [a.tx, a.ty] = roomPoint(); a.state = "walk"; if (habitOf(cr) === "meal") { a.plan = "napby"; a.napT = rand(5, 8) * calm.rest; } }
      else if (habitOf(cr) === "meal") { a.state = "nap"; a.t = rand(5, 8) * calm.rest; emote(a, "zz", 2.5); } else { a.state = "idle"; a.t = rand(1, 2) * linger(cr); } } }
    else if (a.state === "idle" || a.state === "nap" || a.state === "dance" || a.state === "visit") { if ((a.t -= dt) <= 0) { a.decor = null; chooseNext(a, list); } }
    // (in a care moment whose grown one has let go: back to itself)
    else if (a.state === "care" && !a.cm && !actors.get(a.cmBy)?.cm) { a.state = "idle"; a.t = rand(1, 2); a.cmBy = null; a.lean = a.dip = a.squish = 0; }

    // a little personal space: glowlings gently push apart instead of piling up
    // (except on the way to bed: sleepy ones squeeze in and cuddle up)
    // (nor the two in a care moment: they stand where they are)
    if (a.state !== "sleep" && a.state !== "visit" && a.state !== "toBed" && a.state !== "bath" && a.state !== "care") for (const o of list) {
      if (o === a || o.state === "sleep" || o.state === "visit" || o.state === "toBed" || o.state === "bath" || o.state === "care") continue;
      const ox = a.x - o.x, oy = (a.y - o.y) * 1.6, od = Math.hypot(ox, oy), min = N.base * 0.95;
      if (od > 0.01 && od < min) {
        // step aside, and move where you were heading too, or you'd walk straight back into them
        // a gentle nudge, never stronger than a walk, so nobody gets shoved across the room
        const push = Math.min((min - od) * dt * 4, N.base * 0.45 * dt), px = ox / od * push, py = oy / od * push * 0.6;
        a.x += px; a.y += py;
        if (a.state !== "walk" && a.state !== "called" && a.state !== "toBed") { a.tx += px; a.ty += py; }
      }
    }
    // the way around the furniture (this also moves a goal that's inside a piece to the free spot beside it)
    // (the last stretch to bed goes straight to the sleeping spot: a way around the bed would stop beside it, never in it)
    const tucking = a.state === "toBed" && Math.hypot(a.tx - a.x, a.ty - a.y) < N.base * 0.9;
    const walking = !tucking && !["nap", "dance", "eat", "sleep", "visit", "bath", "care"].includes(a.state) && !petted(a);
    const wp = walking ? nextWaypoint(a, dt) : null;
    const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
    if (a.state === "toBed" && d <= 8) { a.state = "sleep"; a.hop = 1; } // close enough: lie down (the room's edge may keep the exact spot just out of reach)
    const still = ["nap", "dance", "eat", "sleep", "visit", "bath", "care"].includes(a.state);
    const moving = d > 3 && !still;
    if (!moving) a.vx = a.vy = 0;
    if (moving && wp) {
      // walking has weight: it picks up speed from a stop, slows down to arrive, and turns gradually toward the next corner of its way
      const [wx, wy] = wp, wdx = wx - a.x, wdy = wy - a.y, wd = Math.hypot(wdx, wdy) || 1;
      // (eased both ways: a slow start, a soft smooth stop, and a turn never flips it round on the spot)
      const left = Math.hypot(a.tx - a.x, a.ty - a.y), e = clamp(left / (N.base * 0.7), 0, 1), want = speed * (a.state === "toBed" ? 1.4 : 1) * (0.18 + 0.82 * e * e * (3 - 2 * e));
      const k = Math.min(1, dt * 3);
      a.vx = lerp(a.vx || 0, wdx / wd * want, k); a.vy = lerp(a.vy || 0, wdy / wd * want, k);
      const gate = a.beh === "hop" ? hopGate(a) : 1;
      const step = Math.hypot(a.vx, a.vy) * dt * gate, lim = Math.min(step, wd);
      const x0 = a.x, y0 = a.y;
      if (step > 0) { a.x += a.vx * dt * gate * (lim / step); a.y += a.vy * dt * gate * (lim / step); }
      // pressed against something for a second and a half without getting anywhere: give up and think of something else
      if (a.lastX === undefined) { a.lastX = x0; a.lastY = y0; }
      // (measured against its own pace, so a slow old stroller isn't taken for a stuck one)
      a.stuck = Math.hypot(a.x - a.lastX, a.y - a.lastY) < Math.min(N.base * 0.15, want * 0.5) ? (a.stuck || 0) + dt : 0;
      if (!a.stuck) { a.lastX = a.x; a.lastY = a.y; }
      // (pressed against the very piece it came to see, or nearly there: that's arriving, not being stuck)
      // (held up on the way to a little one it's looking after: near enough is close enough, or it tries again)
      if (a.stuck > 1.5 && a.care) { a.stuck = 0; a.lastX = a.lastY = undefined; a.tx = a.x; a.ty = a.y; careArrive(a, cr); }
      if (a.stuck > 1.5 && (a.goal || a.bath) && left < N.base * (a.goal === "bowl" || a.bath ? 1.1 : 0.6)) { a.stuck = 0; a.lastX = a.lastY = undefined; a.tx = a.x; a.ty = a.y; }
      if (a.stuck > 1.5) { a.stuck = 0; a.lastX = a.lastY = undefined; a.goal = a.friend = a.care = null; a.rain = a.garden = a.bath = a.song = false; if (a.state === "walk" || a.state === "idle") { a.state = "idle"; a.t = rand(0.5, 1.5) * linger(cr); a.tx = a.x; a.ty = a.y; } else a.repath = 0; }
    } else if (moving) {
      const hopper = a.beh === "hop";
      const step = Math.min(d, speed * dt * (hopper ? hopGate(a) : 1));
      a.x += dx / d * step; a.y += dy / d * step;
    } else if (a.state === "walk" && a.goal) {
      // arrived at a favorite thing (or at the bowl, to eat)
      const d = DECO[a.goal];
      if (d.id === "bowl") { a.goal = null; bowlArrive(a, cr); }
      else {
        a.decor = a.goal; a.goal = null;
        toyJoy(cr, d.id);
        a.state = d.id === "cushion" ? "nap" : d.id === "rug" ? "dance" : "visit";
        if (d.id === "swing" || d.id === "mushrooms") { a.from = [a.x, a.y, a.alt]; a.blend = 0; }
        a.t = (d.id === "cushion" ? rand(6, 10) : rand(3, 6)) * calm.rest;
        emote(a, d.emote === "!" && Math.random() < 0.5 ? kaoFor(cr, "surprise") : d.emote, 2);
        if (a.id === save.active) floatText(`${specOf(cr).name} ${d.verb}`, a.x, a.y - N.base * 1.2, "#e6e0ff");
      }
    } else if (a.state === "walk" && a.rain) {
      // under the cloud: a little dance in the rain (or snow)
      a.rain = false; a.state = "dance"; a.t = rand(0.9, 1.6); a.hop = 1;
      emote(a, weather.kind === "snow" ? "❄" : "💧", 1.2);
    } else if (a.state === "walk" && a.bath) { a.bath = false; a.state = "idle"; a.t = rand(1, 2) * linger(cr); batheAt(a, cr); }
    else if (a.state === "walk" && a.song) {
      // gathered by the singing crystals: swaying along till the song ends
      a.song = false; a.state = "dance"; a.t = Math.max(1.2, songLeft() + rand(0.2, 0.6)); emote(a, "♪", 1.4);
    } else if (a.state === "walk" && a.care) careArrive(a, cr);
    else if (a.state === "walk" && a.plan) habitArrive(a, cr);
    else if (a.state === "walk" && a.garden) {
      a.garden = false; a.state = "idle"; a.t = rand(1.5, 3) * linger(cr); emote(a, "💧", 1.6); gardenHelp(cr);
    } else if (a.state === "walk") {
      a.state = "idle"; a.t = rand(1.2, 3.5) * linger(cr);
      // (not one hiding, or counting with its eyes shut, in hide and seek)
      const f = a.friend && actors.get(a.friend);
      if (f && !(game.seek && game.seek.id === f.id)) meetFriend(a, f, cr);
      a.friend = null;
    } else if (a.state === "toBed" && d <= 8) a.state = "sleep";
    keepInRoom(a, dt);
    // standing on the bed (it fills its corner, so there's no "behind" it): up on its soft top, with a little hop on the way up
    const onBed = isoOnBed(a.x, a.y);
    if (onBed && !a.onBed) a.hop = 1;
    a.onBed = onBed;
    a.perch = lerp(a.perch || 0, onBed ? isoBedTop() : 0, Math.min(1, dt * 10));
    // fliers hover, swimmers glide, hoppers bounce
    const ease = (to, k) => { a.alt = lerp(a.alt, to, Math.min(1, dt * k)); };
    if (a.state === "sleep") ease(0, 4);
    else if (a.state === "nap" && a.decor === "cushion") { const c = cloudSpot(); ease(a.y - c.bodyY + N.isoW / ISO_G * 0.75, 5); }
    // a doze anywhere else: fliers and swimmers settle down to the floor instead of sleeping in mid-air
    else if (a.state === "nap") ease(0, 4);
    else if (a.state === "visit" && (a.decor === "swing" || a.decor === "spring")) { /* set above */ }
    else if (a.beh === "flutter") ease(N.base * (0.5 + 0.14 * Math.sin(a.ph * 2 * (0.7 + 0.3 * calm.fidget))), 3);
    else if (a.beh === "swim") ease(N.base * (0.28 + 0.1 * Math.sin(a.ph * 1.2 * (0.7 + 0.3 * calm.fidget))), 3);
    // a hopper goes in little arcs: each starts on the floor, and the last one lands before it stops
    else if (a.beh === "hop" && (moving || a.gait)) {
      const k = (a.gait || 0) % 1;
      a.gait = (a.gait || 0) + dt * 1.6 * (0.6 + 0.4 * calm.fidget);
      if (!moving && a.gait % 1 < k) a.gait = 0;
      const arc = Math.sin((a.gait % 1) * Math.PI) * N.base * 0.12 * calm.hop;
      if (Math.abs(a.alt - arc) > N.base * 0.05) ease(arc, 8); else a.alt = arc; // (coming down off something first)
    }
    else ease(0, 4);
    if (a.state === "dance") a.hop = lerp(a.hop, Math.abs(Math.sin(a.ph * 4 * (0.7 + 0.3 * calm.fidget))) * 0.45 * calm.hop, Math.min(1, dt * 8));
    // a crown of icicles tinkles each time its glowling starts to dance
    if ((a.state === "dance") !== !!a.tinkled) { a.tinkled = a.state === "dance"; if (a.tinkled && specOf(cr).head === "icicles") sfx.tinkle(); }
    if (a.state === "visit") {
      if (a.decor === "swing") {
        // sit on the moon seat and swing with it
        const seat = swingSeat();
        if (seat[5] !== undefined) { const size = N.base * depth(seat[6]); a.x = seat[0]; a.y = seat[6] + 1; a.alt = a.y - size * 0.45 - (seat[1] - size * 0.32); }
        else { a.x = seat[0]; a.y = decorSpot("swing")[1]; a.alt = a.y - N.base * 0.45 - (seat[1] - N.base * 0.38); }
      } else if (a.decor === "mushrooms") {
        // hopping from cap to cap like platforms: an arc between two caps, a squish on landing
        const caps = mushroomCaps();
        if (caps.length > 1) {
          const ph = (game.time / 1000 + a.id * 0.37) / 1.05 * (0.7 + 0.3 * calm.fidget), i = Math.floor(ph) % caps.length, k = ph - Math.floor(ph), [x0, y0] = caps[i], [x1, y1] = caps[(i + 1) % caps.length];
          const size = N.base * depth(a.y), top = lerp(y0, y1, k) - Math.sin(k * Math.PI) * N.base * 0.4, p = isoLayout().placed.mushrooms;
          a.x = lerp(x0, x1, k); a.y = isoAt((p.i + 0.5) / ISO_G, (p.j + 0.5) / ISO_G)[1] + 1;
          a.alt = a.y - size * 0.45 - (top - size * 0.32); a.hop = k < 0.12 ? 0.5 : 0;
          if (k < 0.05 && !a.landed) { a.landed = true; if (Math.random() < 0.3 && sfx.ready()) sfx.tone(sfx.ac.currentTime, 520 + i * 90, 0.02, 0.12, "sine", 700 + i * 90); } else if (k > 0.5) a.landed = false;
        } else a.hop = Math.abs(Math.sin(a.ph * 5)) * 0.8;
      }
      else if (a.decor === "spring") a.alt = Math.sin(a.ph * 2.5) * N.base * 0.04;
      // getting on: from where it stood up to the seat (or the first cap) in a short eased climb, not a jump
      if (a.from) {
        a.blend = Math.min(1, a.blend + dt * 2.5);
        const k = a.blend * a.blend * (3 - 2 * a.blend);
        a.x = lerp(a.from[0], a.x, k); a.y = lerp(a.from[1], a.y, k); a.alt = lerp(a.from[2], a.alt, k);
        if (a.blend >= 1) a.from = null;
      }
    } else a.from = null;
    // in the spring: hopping in, soaking, hopping out and shaking dry, placed by hand (see bathTick)
    if (a.state === "bath") bathTick(a, cr);
    faceMoments(a, cr, dt);
    if (a.cm) careTick(a, cr, dt);
    if (habitOf(cr) === "hum") humAlong(a, cr, dt);
    // needs show up as little thought bubbles now and then
    const wants = callOf(cr);
    if (!a.emote && a.state !== "sleep" && Math.random() < dt * (wants ? 0.4 : 0.07)) {
      const m = moodOf(cr);
      if (wants === "messy") emote(a, "!", 2.2);
      else if (m === "hungry") emote(a, SNACKS[specOf(cr).snack].emoji, 2.2);
      else if (m === "sleepy") emote(a, "zz", 2.2);
      else if (m === "sad") emote(a, cr.joy < 10 || Math.random() < 0.5 ? kaoFor(cr, "sad") : "…", 2.2);
      // (just home to a nest Mossa looked in on: still glad)
      else if (keptQuiet(cr)) emote(a, "♥", 1.6);
      // the one you're looking after beeps for you now and then
      if (wants && a.id === save.active && Math.random() < 0.3) sfx.chirp(specOf(cr).voice * 1.2);
    }
  }
  // and a content one daydreams now and then
  fancyTick(dt);
}

/** What the room's walls and floor are painted from: when it changes, they're painted again. */
const roomKey = () => `${currentTheme()}|${save.rooms[save.room]?.kind || ""}|${W}|${H}|${PX}|${hasDecor("swing")}|${hasDecor("lights")}|${hasDecor("shelf")}|${hasDecor("painting")}|${JSON.stringify(wallSlot("painting"))}|${save.paintScene || 0}`;
function drawRoom() {
  // the walls and floor of this backdrop, painted once in art pixels (or ahead of time: see bakeAhead), and kept a while
  // after you leave, so walking back in is smooth too
  const rk = roomKey();
  if (roomCanvas.key !== rk) {
    if (roomCanvas.c && roomCanvas.key) keepAhead(roomAhead, roomCanvas.key, roomCanvas.c, 8);
    roomCanvas.key = rk; roomCanvas.c = roomAhead.get(rk) || paintRoomIso(currentTheme());
  }
  ctx.drawImage(roomCanvas.c, 0, 0, W, H);
  // (a place's fire lights the floor and the wall round it, under whoever stands there)
  if (isPlace()) drawPlaceGlow();
  return drawRoomIso();
}
const roomSprites = {}, roomCanvas = {};
// ---------- isometric pixel furniture ----------
// Drawn pixel by pixel on the 2:1 grid (two pixels across for one down), the way isometric pixel art is made:
// each piece is built from boxes, discs and cylinders on the floor's axes (the "box method"), lit from the left
// like the room: top faces lightest, left faces middle, right faces darkest, and a dark outline around the whole.
// Circles lying on the floor become 2:1 ellipses. Only palette colors, no smoothing.
const IC = Object.fromEntries(Object.entries({
  ink: "#0b0614", ink2: "#22143a",
  w1: "#c98f3a", w2: "#946027", w3: "#5e3a1c", w0: "#eec26a",
  s0: "#e4dfe8", s1: "#b9b3c0", s2: "#8a8494", s3: "#5d5666", s4: "#3a3440",
  l0: "#efe6ff", l1: "#d2bfff", l2: "#ad91e6", l3: "#8a6cc9", l4: "#6b4fa8",
  p0: "#ffc4da", p1: "#e88bb1", p2: "#c25586", p3: "#8f3460",
  b0: "#b8e6f5", b1: "#69b7d6", b2: "#3383a8", b3: "#1d5276",
  g0: "#a3dd9b", g1: "#57ad6a", g2: "#2f7d4a", g3: "#1e5233",
  y0: "#fff0b5", y1: "#eec26a", r1: "#e0634f", r2: "#b8323b", r3: "#7d1e2c", white: "#ffffff",
  // steel, colder than stone, for anything forged
  m0: "#eef2f8", m1: "#a9b2c2", m2: "#6c7487", m3: "#3a4052", m4: "#1f2330",
}).map(([k, v]) => [k, pxHex(v)]));

/** A little canvas in art pixels, with tools that draw on the 2:1 grid; an ink outline goes round everything at the end. */
/**
 * Material texture, applied to a finished piece: every pixel of a known ramp (wood, stone, metal, cloth, crystal…) is nudged
 * one shade lighter or darker by noise shaped for that material, so surfaces read as grain, grit or weave instead of flat paint.
 * Colours stay on the palette; only where each shade falls changes.
 */
const TEX_RAMPS = [
  ["wood", ["w3", "w2", "w1", "w0"]], ["stone", ["s4", "s3", "s2", "s1", "s0"]], ["steel", ["m4", "m3", "m2", "m1", "m0"]], ["crystal", ["l4", "l3", "l2", "l1", "l0"]],
  ["cloth", ["p3", "p2", "p1", "p0"]], ["metal", ["b3", "b2", "b1", "b0"]], ["leaf", ["g3", "g2", "g1", "g0"]], ["cloth", ["r3", "r2", "r1"]],
];
// the keepers' own woods and stone, off the palette (see DECO_ROSEWOOD, BED_ROOT, BED_CRUST): textured like the rest, darkest
// first; their brightest shade stays as it is, since on these it is a lit edge, not a board's face
const TEX_OWN = () => [["wood", BED_ROOT.slice().reverse()], ["wood", DECO_ROSEWOOD.slice().reverse()], ["stone", BED_CRUST.slice().reverse()]];
let texIndex = null;
/** A pixel's place along and across the grain of the face it was drawn on (dir: 0 flat, 1 along u, 2 along v, 3 upright;
 *  4 more is the same grain on one solid piece, a panel or a beam, with no seams between boards). */
const grainUV = (x, y, dir) => (dir &= 3) === 1 ? [x, y - x * 0.5] : dir === 2 ? [x, y + x * 0.5] : dir === 3 ? [y, x] : [x, y];
function texShade(kind, x, y, dir = 0) {
  // positive: lighter, negative: darker
  // thin grain lines running along the board (whichever way its face lies), the odd knot: texture, not blotches, so the shapes on a piece still read
  if (kind === "wood") {
    const [al, ac] = grainUV(x, y, dir), g = pxNoise(al * 0.12, ac * 0.9 + Math.floor(al / 19) * 3.1);
    if (pxHash(Math.floor(al / 3), Math.floor(ac)) > 0.996) return -2;
    return Math.abs(g - 0.5) < 0.035 ? -1 : g > 0.82 ? 1 : 0;
  }
  if (kind === "stone") {
    // matte grit, soft blotches and the odd crack (coursing, where there is any, is drawn by the piece along its own faces)
    if (Math.abs(pxNoise(x * 0.2, y * 0.2) - 0.5) < 0.015) return -1;
    const g = pxFbm(x * 0.18, y * 0.18); if (g > 0.7) return -1; if (g < 0.24) return 1;
    const sp = pxHash(x, y); return sp > 0.985 ? 1 : sp < 0.015 ? -1 : 0;
  }
  if (kind === "steel") {
    const band = Math.floor((y + x * 0.35) / 2) % 7;    // streaks of reflected light and dark across the surface
    if (pxHash(x, y) > 0.992) return 2;                  // a glint
    return band === 1 ? 1 : band === 4 || band === 5 ? -1 : 0;
  }
  if (kind === "metal") { const sc = Math.abs(pxNoise(x * 0.04 + y * 0.12, y * 0.04) - 0.5) < 0.02; return sc ? 1 : pxHash(x, y) > 0.97 ? -1 : 0; }
  if (kind === "cloth") return (x + y) % 4 === 0 && pxHash(x >> 1, y >> 1) > 0.5 ? -1 : 0;
  if (kind === "leaf") { const g = pxFbm(x * 0.3, y * 0.3); return g > 0.62 ? -1 : g < 0.32 ? 1 : 0; }
  if (kind === "crystal") return pxHash(x, y) > 0.985 ? 1 : 0;
  return 0;
}
function texturize(d, w, h, glowPx, dirs) {
  if (!texIndex) {
    texIndex = new Map();
    for (const [kind, ramp] of TEX_RAMPS) ramp.forEach((k, i) => { const c = IC[k]; texIndex.set((c[0] << 16) | (c[1] << 8) | c[2], { kind, ramp: ramp.map(n => IC[n]), i }); });
    for (const [kind, ramp] of TEX_OWN()) ramp.forEach((c, i) => texIndex.set((c[0] << 16) | (c[1] << 8) | c[2], { kind, ramp, i, own: true }));
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4; if (d[o + 3] === 0 || glowPx.has(y * w + x)) continue;
    const m = texIndex.get((d[o] << 16) | (d[o + 1] << 8) | d[o + 2]); if (!m) continue;
    const dir = dirs ? dirs[y * w + x] : 0;
    // wood's brightest shade drops a step (real timber is brown, not orange); the others keep their contrast
    let sh = texShade(m.kind, x, y, dir) + (m.kind === "wood" && !m.own && m.i === m.ramp.length - 1 ? -1 : 0);
    // a wide wooden face is made of boards (staves when it stands upright): a dark seam every few pixels across the grain,
    // only where the face is broad enough on both sides to be more than one board
    if (m.kind === "wood" && dir && dir < 4) {
      const [, ac] = grainUV(x, y, dir), P = dir === 3 ? 4 : 5;
      if (((Math.floor(ac) % P) + P) % P === 0) {
        const [nx, ny] = dir === 3 ? [1, 0] : [0, 1], wood = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && d[(yy * w + xx) * 4 + 3] && texIndex.get((d[(yy * w + xx) * 4] << 16) | (d[(yy * w + xx) * 4 + 1] << 8) | d[(yy * w + xx) * 4 + 2])?.kind === "wood";
        if (wood(x - 2 * nx, y - 2 * ny) && wood(x + 2 * nx, y + 2 * ny)) sh = Math.min(sh, 0) - 1;
      }
    }
    if (!sh) continue;
    // (wood never brightens into its top highlight: that reads as straw)
    const top = m.kind === "wood" && m.i < m.ramp.length - 1 ? m.ramp.length - 2 : m.ramp.length - 1;
    const c = m.ramp[clamp(m.i + sh, 0, Math.max(top, m.i))]; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2];
  }
}
function isoArt(w, h, paint, { outline = true, texture = true, light = true } = {}) {
  w = Math.ceil(w); h = Math.ceil(h);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data;
  // which way the grain runs on each pixel's face (see grainUV), so the texture can follow it
  const dirs = new Uint8Array(w * h);
  const T = {
    w, h, glowPx: new Set(), dir: 0,
    px(x, y, col) { x = Math.round(x); y = Math.round(y); if (!col || x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; dirs[y * w + x] = T.dir; T.glowPx.delete(y * w + x); },
    /** Draw with the grain running this way (0 flat, 1 along u, 2 along v, 3 upright), then go back to how it was. */
    grain(dir, fn) { const was = T.dir; T.dir = dir; fn(); T.dir = was; },
    has(x, y) { return x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0; },
    /** Paint only over what is already there (not its glow): grain, seams and glints that leave the outline as it was. */
    on(x, y, col) { x = Math.round(x); y = Math.round(y); if (T.has(x, y) && !T.glowPx.has(y * w + x)) T.px(x, y, col); },
    /** Fill a polygon by testing each pixel's center (clean 2:1 steps on the iso edges). */
    poly(pts, col) {
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        const px = x + 0.5, py = y + 0.5; let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) T.px(x, y, typeof col === "function" ? col(x, y) : col);
      }
    },
    /** A box standing on the floor: (x, y) is its back corner, a units along the right-hand axis, b along the left-hand one, hgt pixels tall. */
    box(x, y, a, b, hgt, top, left, right, rim = true) {
      const Bu = [x + 2 * a, y + a], Bv = [x - 2 * b, y + b], Buv = [x + 2 * a - 2 * b, y + a + b], up = p => [p[0], p[1] - hgt];
      // the grain runs the long way: up a tall post, along a plank, across a top the way it is longest
      const was = T.dir, tall = hgt > 1.6 * Math.max(a, b);
      T.dir = was || (tall ? 3 : 1); T.poly([Bv, Buv, up(Buv), up(Bv)], left);
      T.dir = was || (tall ? 3 : 2); T.poly([Bu, Buv, up(Buv), up(Bu)], right);
      T.dir = was || (a >= b ? 1 : 2); T.poly([up([x, y]), up(Bu), up(Buv), up(Bv)], top);
      T.dir = was;
      // a lit edge along the front corner and the top's front rims
      if (rim && hgt > 1) { const [fx, fy] = Buv; for (let k = 1; k < hgt; k++) T.px(fx - 0.5, fy - k - 0.5, top); }
      return { Bu, Bv, Buv, top: up([x, y]) };
    },
    /** A flat 2:1 ellipse on the floor plane. */
    disc(cx, cy, rx, col, ry = rx / 2) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) T.px(x, y, typeof col === "function" ? col(x, y) : col);
    },
    /** A cylinder: a band of side (lighter on the left) under a 2:1 top. */
    cyl(cx, cy, rx, hgt, top, side, dark) {
      // (staves stand upright; the lid's boards run across)
      T.grain(T.dir || 3, () => { for (let k = 0; k <= hgt; k++) T.disc(cx, cy - k, rx, (x) => x < cx - rx * 0.3 ? side : x > cx + rx * 0.35 ? dark : side); });
      T.grain(T.dir || 1, () => T.disc(cx, cy - hgt, rx, top));
    },
    /** A round blob (domes, clouds, caps), shaded from the top left. */
    ball(cx, cy, r, light, mid, dark, ry = r) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        const lit = -dx * 0.6 - dy * 0.8;
        T.px(x, y, lit > 0.45 ? light : lit > -0.35 ? mid : dark);
      }
    },
    line(x0, y0, x1, y1, col) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const was = T.dir, ddx = x1 - x0, ddy = y1 - y0;
      if (!was) T.dir = Math.abs(ddy) > 2 * Math.abs(ddx) ? 3 : Math.abs(ddy) * 4 < Math.abs(ddx) ? 0 : ddx * ddy > 0 ? 1 : 2;
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let e = dx + dy;
      for (;;) { T.px(x0, y0, col); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
      T.dir = was;
    },
    /** A soft light the way the moss garden's shaft is drawn (see pxGlow): see-through, in three clean steps, ordered-dithered
     *  between them, so it stays crisp and never turns into loose dots. */
    glow(cx, cy, r, col, k = 0.5) {
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const f = 1 - Math.hypot(x - cx, (y - cy) * 1.4) / r;
        if (f <= 0 || x < 0 || y < 0 || x >= w || y >= h || (T.has(x, y) && !T.glowPx.has(y * w + x))) continue;
        const lv = Math.floor(f * Math.min(1, k * 2.2) * 3.2 + (PX_BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * 0.9), i = (y * w + x) * 4, a = [0, 56, 96, 136][Math.min(3, lv)];
        if (lv <= 0 || a <= d[i + 3]) continue;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = a; T.glowPx.add(y * w + x);
      }
    },
  };
  paint(T);
  if (texture) texturize(d, w, h, T.glowPx, dirs);
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3] > 0 && !T.glowPx.has(i) ? 1 : 0;
  if (light) {
    // the light comes from the top left: a warm rim along the lit edges of the silhouette, cool (purple-shifted) shade along the far ones
    const src = d.slice(), mix = (o, [r, g2, b], k) => { d[o] = src[o] + (r - src[o]) * k; d[o + 1] = src[o + 1] + (g2 - src[o + 1]) * k; d[o + 2] = src[o + 2] + (b - src[o + 2]) * k; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!solid[i]) continue;
      const up = y > 0 && solid[i - w], left = x > 0 && solid[i - 1], down = y < h - 1 && solid[i + w], right = x < w - 1 && solid[i + 1];
      const down2 = y < h - 2 && solid[i + 2 * w];
      if (!up || !left) mix(i * 4, [255, 238, 196], 0.3);
      else if (!down || !right) mix(i * 4, [34, 18, 62], 0.32);
      else if (!down2) mix(i * 4, [34, 18, 62], 0.14);
    }
  }
  if (outline) {
    // selective outline: on the lit side the outline is a dark shade of whatever it borders; on the shadow side it stays ink
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (solid[y * w + x]) continue;
      const toR = x < w - 1 && solid[y * w + x + 1], toD = y < h - 1 && solid[(y + 1) * w + x], toL = x > 0 && solid[y * w + x - 1], toU = y > 0 && solid[(y - 1) * w + x];
      if (!(toR || toD || toL || toU)) continue;
      const i = (y * w + x) * 4; if (!(d[i + 3] === 0 || T.glowPx.has(y * w + x))) continue;
      let col = IC.ink;
      if ((toR || toD) && !toL && !toU && light) { const n = ((toR ? y * w + x + 1 : (y + 1) * w + x)) * 4; col = [d[n] * 0.38 + 10, d[n + 1] * 0.32 + 4, d[n + 2] * 0.42 + 22]; }
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // (the solid part, without its glow: what a highlight goes round)
  c._solid = solid;
  return c;
}

const ISO_G = 6;          // the floor is a 6×6 grid of tiles
const ISO_CAP = 8;        // how many tiles of furniture fit before the room feels stuffed (the bed and incubator come with the room)
/** Each piece: its size in tiles, and the tiles it likes to stand on, best first (i runs along the right wall, j along the left). */
const ISO_PLACES = {
  lamp: { fw: 1, fd: 1, at: [[0, 0], [1, 0]] },
  bookcase: { fw: 1, fd: 1, at: [[1, 0], [2, 0], [3, 0]] },
  spring: { fw: 1, fd: 1, at: [[2, 0], [3, 0], [1, 0]] },
  armchair: { fw: 1, fd: 1, at: [[0, 1], [1, 1], [0, 2]] },
  chest: { fw: 1, fd: 1, at: [[0, 5], [1, 5], [0, 4]] },
  plant: { fw: 1, fd: 1, at: [[3, 0], [5, 2], [5, 3]] },
  table: { fw: 1, fd: 1, at: [[4, 3], [3, 4], [4, 2]] },
  mushrooms: { fw: 1, fd: 1, at: [[5, 5], [4, 5], [5, 4]] },
  swing: { fw: 1, fd: 1, at: [[2, 0], [3, 0], [1, 0], [0, 2], [0, 3]] },
  musicbox: { fw: 1, fd: 1, at: [[0, 3], [3, 0], [5, 2], [2, 5]] },
  bench: { fw: 1, fd: 1, at: [[0, 2], [2, 0], [5, 3]] },
  lamppost: { fw: 1, fd: 1, at: [[0, 0], [5, 0], [0, 5]] },
  birdbath: { fw: 1, fd: 1, at: [[4, 4], [3, 5], [5, 4]] },
  drum: { fw: 1, fd: 1, at: [[3, 4], [4, 3], [2, 5]] },
  blocks: { fw: 1, fd: 1, at: [[1, 2], [2, 1], [4, 5]] },
  telescope: { fw: 1, fd: 1, at: [[0, 1], [1, 0], [5, 1]] },
  keepjar: { fw: 1, fd: 1, at: [[2, 5], [5, 3], [0, 4]] },
  bowl: { fw: 1, fd: 1, at: [[1, 5], [5, 1], [3, 5]] },
};
/** The arches between home rooms (see roomDoors): where along its wall each stands (0 at the back corner, 1 at the front) and its half width.
 *  (in from the front corner far enough to stay whole on a phone held upright, where the room is seen closer and its corners are cut off) */
const DOOR_AT = 0.74, DOOR_W = 0.07;
/** The floor kept clear at a room's passages: the tiles under each arch out to the front corner and the row in front, so nothing stands in a doorway or hides it. */
function doorTiles(room = save.room) {
  const out = new Set(), s0 = Math.floor((DOOR_AT - DOOR_W) * ISO_G), s1 = ISO_G - 1;
  for (const d of roomDoors(room)) for (let s = s0; s <= s1; s++) for (let k = 0; k < 2; k++) out.add(d.wall === "R" ? `${s},${k}` : `${k},${s}`);
  return out;
}
/** The side corners' tiles: seen close up on a phone held upright, the screen's edges cut through them, so nothing stands there then
 *  (a piece put there on a wider screen stands in its own spot meanwhile, and is back in the corner on the wider screen). */
const ISO_CROP = [`${ISO_G - 1},0`, `0,${ISO_G - 1}`];
/** Would a piece on these tiles stand in a doorway? */
function inDoorway(i, j, fw, fd, tiles = doorTiles()) {
  for (let a = 0; a < fw; a++) for (let b = 0; b < fd; b++) if (tiles.has(`${i + a},${j + b}`)) return true;
  return false;
}
/** Would a wall piece in this slot hang over an arch? (they hang well above its mouth: only the two slots nearest the front corner are its) */
const wallInDoor = (wall, s, room = save.room) => s + 1 > (DOOR_AT - DOOR_W) * ISO_G + 0.5 && roomDoors(room).some(d => d.wall === wall);
/** Just inside an arch, on the floor: where you come in. */
const doorStep = wall => { const m = isoMargin(0.42) + 0.02; return wall === "R" ? isoAt(DOOR_AT, m) : isoAt(m, DOOR_AT); };
/** Older saves may have pieces standing in what's now a doorway (or one opened up behind them when a room was carved): they go back to their own spots. */
function clearDoorways() {
  let moved = false;
  save.rooms.forEach((r, k) => {
    const lay = k === save.room ? save.layout : r.layout, tiles = doorTiles(k);
    if (!lay) return;
    for (const [id, m] of Object.entries(lay)) {
      const f = ISO_FIXED[id] || ISO_PLACES[id];
      if (m.wall ? wallInDoor(m.wall, m.s, k) : f && Number.isFinite(m.i) && inDoorway(m.i, m.j, ...Object.values(pieceDims(id, m.flip)), tiles)) { delete lay[id]; moved = true; }
    }
  });
  if (moved) { isoLayoutCache = null; persist(); }
}
/** Pieces on the walls: which wall (L is the left one, along j; R the right one, along i) and the slot along it, in tiles. */
const WALL_ITEMS = { shelf: { wall: "R", s: 0.82 }, painting: { wall: "L", s: 0.64 } };
/** What a room's own fixtures (paintFixtures) take, kept clear of furniture as a doorway is: the floor tiles they stand on, the
 *  wall slots below each wall's number (the back of the wall), and where its wall pieces hang instead. The playroom's slide runs
 *  down the back of the left wall onto a mat, its climbing wall stands at the back of the right one over another: the back
 *  corner's two tiles are theirs, and the one in front of the slide's end (where you shoot off, before the slate under the
 *  window); what's put out by itself keeps off the row in front of them too (front); the shelf and the painting hang over the
 *  bed, clear of both. */
const ROOM_KEEPS = { play: { tiles: ["0,0", "0,1", "0,2"], front: ["1,0", "1,1", "1,2"], walls: { L: 2, R: 1 }, hang: { shelf: { wall: "R", s: 1.4 }, painting: { wall: "R", s: 3.45 } } } };
const roomKeeps = (room = save.room) => ROOM_KEEPS[save.rooms?.[room]?.kind] || {};
/** Is this wall slot one the room's own fixtures take? */
const wallKept = (wall, s, room = save.room) => s < ((roomKeeps(room).walls || {})[wall] || 0);
const wallSlot = id => { const m = save.layout && save.layout[id]; return m && m.wall && !wallKept(m.wall, m.s) ? m : (roomKeeps().hang || {})[id] || WALL_ITEMS[id]; };
/** Where a wall slot meets the floor. */
const wallFoot = (wall, s) => { const c = (s + 0.5) / ISO_G; return wall === "R" ? isoAt(c, 0) : isoAt(0, c); };
/**
 * Pieces have their back to the right wall when not turned, and to the left one when turned. Put against one wall,
 * a piece turns by itself to stand with its back to it; in a corner or out in the room it keeps its turn.
 */
function autoFlip(id, i, j, flip) {
  if (j === 0 && i !== 0) return false;
  if (i === 0 && j !== 0) return true;
  return flip;
}
// (a fixed piece whose spot is taken, by a doorway say, stands at the nearest free one: the bed moves along the wall)
const ISO_FIXED = { bed: { fw: 2, fd: 2, at: [4, 0] }, incubator: { fw: 1, fd: 1, at: [0, 4] }, garden: { fw: 2, fd: 1, at: [1, 4] },
  // the places on the map come furnished, and that furniture stays put
  shelves: { fw: 2, fd: 1, at: [1, 0] }, shelves2: { fw: 1, fd: 2, at: [0, 2] }, counter: { fw: 2, fd: 1, at: [2, 3] }, crates: { fw: 1, fd: 1, at: [5, 4] }, sacks: { fw: 1, fd: 1, at: [4, 0] }, barrel: { fw: 1, fd: 1, at: [0, 5] },
  furnace: { fw: 2, fd: 2, at: [1, 0] }, bellows: { fw: 1, fd: 1, at: [3, 0] }, anvil: { fw: 1, fd: 1, at: [3, 3] }, coalbin: { fw: 1, fd: 1, at: [0, 3] }, rack: { fw: 2, fd: 1, at: [4, 0] }, barrel2: { fw: 1, fd: 1, at: [2, 3] },
  tent: { fw: 2, fd: 2, at: [3, 0] }, campfire: { fw: 1, fd: 1, at: [2, 3] }, logs: { fw: 2, fd: 1, at: [0, 4] }, packs: { fw: 1, fd: 1, at: [1, 1] }, camplamp: { fw: 1, fd: 1, at: [5, 3] }, maptable: { fw: 1, fd: 1, at: [1, 2] },
  greenhouse: { fw: 2, fd: 2, at: [0, 0] }, skep: { fw: 1, fd: 1, at: [0, 5] }, coldframe: { fw: 2, fd: 1, at: [3, 5] }, potting: { fw: 1, fd: 2, at: [0, 2] }, sunflowers: { fw: 1, fd: 1, at: [5, 3] }, barrow: { fw: 1, fd: 1, at: [3, 0] },
  tunnel: { fw: 2, fd: 1, at: [2, 0] }, wallmap: { fw: 1, fd: 2, at: [0, 1] }, altar: { fw: 1, fd: 1, at: [2, 3] }, shrine: { fw: 1, fd: 1, at: [4, 3] }, wickbench: { fw: 1, fd: 2, at: [0, 3] }, halllamp: { fw: 1, fd: 1, at: [5, 0] },
  labdesk: { fw: 2, fd: 1, at: [2, 0] }, jars: { fw: 1, fd: 1, at: [0, 1] }, scope: { fw: 1, fd: 1, at: [4, 4] }, books: { fw: 1, fd: 1, at: [5, 0] },
  // (the snowfields keep the right-hand front of the clearing free, for the snow huts to come)
  runahut: { fw: 2, fd: 2, at: [2, 0] }, icedoor: { fw: 1, fd: 1, at: [0, 0] }, firs: { fw: 1, fd: 1, at: [0, 1] }, firs2: { fw: 1, fd: 1, at: [4, 0] }, pond: { fw: 2, fd: 2, at: [0, 3] }, hotspring: { fw: 2, fd: 1, at: [1, 5] } };
/** What each kind of room comes with (anything not listed has just its bed). */
const ROOM_FIXED = { grotto: ["tunnel", "wallmap", "altar", "shrine", "wickbench", "halllamp"], yard: ["bed", "garden", "greenhouse", "potting", "sunflowers", "barrow", "skep", "coldframe"], lab: ["incubator", "labdesk", "jars", "scope", "books"], shop: ["shelves", "shelves2", "counter", "crates", "sacks", "barrel"], forge: ["furnace", "bellows", "anvil", "coalbin", "rack", "barrel2"], camp: ["tent", "campfire", "logs", "packs", "camplamp", "maptable"], snow: ["runahut", "icedoor", "firs", "firs2", "pond", "hotspring"] };
/** The places' own furniture: not decorations to play with. */
const PLACE_PROPS = new Set(Object.values(ROOM_FIXED).flat().filter(id => !["bed", "garden", "incubator"].includes(id)));

/** A piece's size in tiles; turned to face the other wall, its two sides swap. */
const pieceDims = (id, flip) => { const f = ISO_FIXED[id] || ISO_PLACES[id]; return flip ? { fw: f.fd, fd: f.fw } : { fw: f.fw, fd: f.fd }; };
/** Which floor pieces are out, and where: the spots you chose first, then each piece's favorite free tiles. Worked out again only when something changes. */
let isoLayoutCache = null;
function isoLayout() {
  const out = Object.keys(ISO_PLACES).filter(hasDecor), mine = save.layout || {};
  const key = save.room + "|" + roomDoors().map(d => d.wall).join("") + "|" + (N.crop ? "crop|" : "") + out.join(",") + JSON.stringify(mine);
  if (isoLayoutCache && isoLayoutCache.key === key) return isoLayoutCache;
  const busy = new Set(), placed = {};
  const take = (i, j, fw, fd) => { for (let a = 0; a < fw; a++) for (let b = 0; b < fd; b++) busy.add(`${i + a},${j + b}`); };
  const free = (i, j, fw, fd) => { if (i < 0 || j < 0) return false; for (let a = 0; a < fw; a++) for (let b = 0; b < fd; b++) if (i + a >= ISO_G || j + b >= ISO_G || busy.has(`${i + a},${j + b}`)) return false; return true; };
  // every tile, nearest a piece's own spot first (ties go to the back of the room)
  const near = ([i0, j0]) => Array.from({ length: ISO_G * ISO_G }, (_, k) => [k % ISO_G, Math.floor(k / ISO_G)]).sort((p, q) => Math.hypot(p[0] - i0, p[1] - j0) - Math.hypot(q[0] - i0, q[1] - j0));
  // the doorways stay open: nothing stands in front of a passage, not even a spot you chose before the passage was there
  // (and on a phone held upright, the two side corners the screen's edges cut through: see ISO_CROP)
  const doors = doorTiles();
  if (N.crop) ISO_CROP.forEach(t => doors.add(t));
  // (and the floor the room's own slide and mats stand on: see ROOM_KEEPS)
  (roomKeeps().tiles || []).forEach(t => doors.add(t));
  doors.forEach(t => busy.add(t));
  const fixed = Object.fromEntries((ROOM_FIXED[save.rooms[save.room]?.kind] || ["bed"]).map(id => [id, ISO_FIXED[id]]));
  const all = [...Object.keys(fixed), ...out];
  for (const id of all) {
    const m = mine[id]; if (!m) continue;
    const d = pieceDims(id, m.flip);
    if (free(m.i, m.j, d.fw, d.fd)) { take(m.i, m.j, d.fw, d.fd); placed[id] = { id, i: m.i, j: m.j, ...d, flip: !!m.flip }; }
  }
  for (const [id, f] of Object.entries(fixed)) if (!placed[id]) {
    const spot = [f.at, ...near(f.at)].find(([i, j]) => free(i, j, f.fw, f.fd));
    if (spot) { take(spot[0], spot[1], f.fw, f.fd); placed[id] = { id, i: spot[0], j: spot[1], fw: f.fw, fd: f.fd, flip: false }; }
  }
  // the rug's middle stays open for pieces placed on their own: glowlings dance there
  // (and, in the playroom, the floor in front of its slide and climbing wall, so they aren't hidden: you can still put things there)
  const center = ["2,2", "2,3", "3,2", "3,3", ...(roomKeeps().front || [])].filter(t => !busy.has(t));
  center.forEach(t => busy.add(t));
  for (const id of out) {
    if (placed[id]) continue;
    // its favorite tiles, or else the free one nearest them (so nothing that's out ever goes missing)
    const f = ISO_PLACES[id], spot = f.at.find(([i, j]) => free(i, j, f.fw, f.fd)) || near(f.at[0]).find(([i, j]) => free(i, j, f.fw, f.fd));
    if (!spot) continue;
    take(spot[0], spot[1], f.fw, f.fd);
    placed[id] = { id, i: spot[0], j: spot[1], fw: f.fw, fd: f.fd, flip: autoFlip(id, spot[0], spot[1], false) };
  }
  center.forEach(t => busy.delete(t));
  doors.forEach(t => busy.delete(t));
  return (isoLayoutCache = { key, placed, busy, doors });
}
/** How many furniture tiles are in use, out of the room's space. */
const isoSpaceUsed = () => Object.keys(ISO_PLACES).filter(hasDecor).reduce((n, id) => n + ISO_PLACES[id].fw * ISO_PLACES[id].fd, 0);
/** The middle of a placed piece on the floor (CSS pixels), and the spot just in front of it. */
function isoPieceAt(p, front = 0) { return isoAt((p.i + p.fw / 2 + front) / ISO_G, (p.j + p.fd / 2 + front) / ISO_G); }

/** The mushroom cluster: each one's place (dx, dy in tiles from the middle), height and cap size. */
const MUSHROOMS = [[-0.36, 0.0, 0.95, 0.27], [0.12, -0.08, 1.35, 0.32], [0.38, 0.06, 0.7, 0.22], [-0.12, 0.12, 0.55, 0.18], [0.22, 0.16, 0.36, 0.13], [-0.45, 0.16, 0.32, 0.11], [0.5, -0.04, 0.48, 0.14]];
/** Where the tops of the bigger caps are in the room (CSS pixels), lowest first: platforms to hop across. */
function mushroomCaps() {
  const p = isoLayout().placed.mushrooms;
  if (!p) return [];
  const t = N.isoW / ISO_G / PX, [cx, cy] = isoAt((p.i + 0.5) / ISO_G, (p.j + 0.5) / ISO_G), m = p.flip ? -1 : 1;
  return MUSHROOMS.filter(q => q[2] >= 0.48).map(([dx, dy, h, r]) => {
    const rx = Math.max(2, r * t * 1.6), ry = Math.max(1, Math.round(rx * 0.4));
    return [cx + m * (dx * t + Math.round(dx * 2)) * PX, cy + (dy * t - h * t * 1.05 - ry) * PX];
  }).sort((p, q) => q[1] - p[1]);
}

/** The pictures the painting can show: each colors a point (u across, v up, both 0..1) of the canvas inside the frame. */
const PAINTINGS = [
  { name: "Moonlit hills", px: (u, v, x, y) => {
    if (Math.hypot((u - 0.65) * 2, v - 0.72) < 0.22) return IC.y0;
    if (v < 0.25 + 0.06 * Math.sin(u * 9)) return pxPick([IC.g3, IC.g2], 0.5 + 0.5 * Math.sin(u * 9), x, y);
    if (pxHash(x, y + 5) > 0.93 && v > 0.45) return IC.white;
    return pxPick([IC.ink2, pxHex("#2e1d4f"), pxHex("#3d2866"), pxHex("#523a85")], v * 0.9, x, y);
  } },
  { name: "Sunrise over the sea", px: (u, v, x, y) => {
    if (v < 0.35) return (Math.round(v * 30) + Math.round(u * 3)) % 4 === 0 ? IC.y0 : pxPick([IC.b3, IC.b2], v * 2.5, x, y);
    if (Math.hypot((u - 0.5) * 1.6, v - 0.35) < 0.22) return v > 0.5 ? IC.y0 : IC.white;
    return pxPick([IC.y1, pxHex("#f2a07b"), IC.p1, IC.p2, IC.l4], (v - 0.35) / 0.65, x, y);
  } },
  { name: "Northern lights", px: (u, v, x, y) => {
    if (v < 0.22 + 0.25 * Math.max(0, 1 - Math.abs(u - 0.35) * 3) * 0.8 + 0.15 * Math.max(0, 1 - Math.abs(u - 0.8) * 4)) return v < 0.12 ? IC.white : pxPick([IC.ink2, IC.b3], 0.5, x, y);
    const band = v - (0.62 + 0.12 * Math.sin(u * 7));
    if (Math.abs(band) < 0.09) return band > 0.04 ? IC.p1 : IC.g0;
    if (Math.abs(band) < 0.16) return PX_BAYER[(y & 3) * 4 + (x & 3)] > 0.5 ? IC.g1 : IC.ink2;
    return pxHash(x, y + 9) > 0.95 ? IC.white : IC.ink2;
  } },
  { name: "A glowling portrait", px: (u, v, x, y) => {
    const d = Math.hypot((u - 0.5) * 1.1, (v - 0.42) * 1.3);
    if (d < 0.3) {
      if (Math.abs(v - 0.46) < 0.04 && (Math.abs(u - 0.4) < 0.03 || Math.abs(u - 0.6) < 0.03)) return IC.ink2;
      if (Math.abs(v - 0.36) < 0.03 && (Math.abs(u - 0.3) < 0.05 || Math.abs(u - 0.7) < 0.05)) return IC.p1;
      return d > 0.25 ? IC.p1 : IC.p0;
    }
    if (v > 0.6 && v < 0.85 && (Math.abs(u - 0.32) < 0.05 || Math.abs(u - 0.68) < 0.05)) return IC.p0;
    return pxPick([IC.y0, IC.y1], (u + v) * 0.5, x, y);
  } },
  { name: "Crystal cave", px: (u, v, x, y) => {
    for (const [cx, w, h, c] of [[0.2, 0.12, 0.55, IC.l2], [0.36, 0.1, 0.8, IC.l1], [0.55, 0.14, 0.62, IC.b1], [0.75, 0.1, 0.45, IC.l2], [0.88, 0.08, 0.3, IC.b0]]) {
      const half = w * (1 - v / h);
      if (v < h && Math.abs(u - cx) < half) return u < cx ? IC.white : c;
    }
    return pxPick([pxHex("#2e1d4f"), IC.ink2], v, x, y);
  } },
];
if (LANG === "uk") for (const p of PAINTINGS) p.name = tr(p.name);

/** Every piece's picture: (ax, ay) inside it is the back corner of its footprint. t is one tile's width in art pixels. */
/** Build a piece from parts on the floor grid, the way the hearth is built: P(u, v, z) is a point in it (u along the right
 *  wall, v along the left, z up; a tile is t/2 along the floor), box() a block standing at a point, faceV/faceU a panel on
 *  a wall-like plane (v or u fixed), flat() one lying on the floor's plane. Every face carries its grain for the texture. */
function isoKit(T, x0, y0) {
  const P = (u, v, z = 0) => [x0 + 2 * u - 2 * v, y0 + u + v - z];
  const K = {
    P,
    box: (u, v, z, du, dv, dz, top, left, right, rim) => T.box(...P(u, v, z), du, dv, dz, top, left, right, rim),
    quad: (pts, col, dir = T.dir) => T.grain(dir, () => T.poly(pts.map(p => P(...p)), col)),
    faceV: (v, u0, u1, z0, z1, col, dir = 1) => K.quad([[u0, v, z0], [u1, v, z0], [u1, v, z1], [u0, v, z1]], col, dir),
    faceU: (u, v0, v1, z0, z1, col, dir = 2) => K.quad([[u, v0, z0], [u, v1, z0], [u, v1, z1], [u, v0, z1]], col, dir),
    flat: (u0, v0, u1, v1, z, col, dir = 1) => K.quad([[u0, v0, z], [u1, v0, z], [u1, v1, z], [u0, v1, z]], col, dir),
    seg: (a, b, col) => { const p = P(...a), q = P(...b); T.line(p[0], p[1], q[0], q[1], col); },
    dot: (u, v, z, col) => { const p = P(u, v, z); T.px(p[0], p[1], col); },
    /** an upright cylinder standing at (u, v, z); r is its radius along the floor */
    cyl: (u, v, z, r, hgt, top, side, dark) => { const p = P(u, v, z); T.cyl(p[0], p[1], r * 2.83, hgt, top, side, dark); },
    /** the front edge of a ring lying flat at (u, v, z): bands round jars and pots */
    ring: (u, v, z, r, col) => { const [x, y] = P(u, v, z), rx = r * 2.83; for (let dx = -Math.floor(rx) + 1; dx < rx; dx++) T.px(x + dx, y + rx / 2 * Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2)), col); },
  };
  return K;
}
/** A small brass lantern, lit, like the ones Wick carries (see WICK_NATIVE.lamp): 6 wide and 9 tall, its top left at (x, y). */
function isoLantern(T, x, y) {
  const col = { o: IC.w1, g: IC.y1, h: IC.y0, W: IC.white, f: pxHex("#ffb54a"), b: IC.w2 };
  ["..oo..", ".o..o.", ".ggoo.", "ggoooo", "ohhhho", "ohWWho", "ofWWfo", "offffo", "ooobbb"].forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== ".") T.px(Math.round(x) + i, Math.round(y) + j, col[ch]); }));
}
/** A cask of upright staves: bellied in the middle, the lit side to the left, a seam between each stave, iron hoops with a
 *  glint, and on top a lid of boards with a bung (or whatever fills it). (x, y) is the middle of its foot, rx its radius. */
function isoCask(T, x, y, rx, hgt, { hoops = [0.1, 0.3, 0.7, 0.9], fill = null, belly = 0.12 } = {}) {
  const R = z => rx * (1 - belly + belly * Math.sin(Math.PI * clamp(z / hgt, 0, 1)));
  T.grain(3, () => {
    for (let z = 0; z <= hgt; z++) {
      const r = R(z), hoop = hoops.some(f => Math.abs(z - f * hgt) < 1);
      T.disc(x, y - z, r, xx => {
        const f = clamp((xx + 0.5 - x) / r, -1, 1), an = Math.asin(f) / 0.42, seam = Math.abs(an - Math.round(an)) < 0.12;
        if (hoop) return f < -0.45 ? IC.m1 : f < -0.15 ? (f < -0.3 ? IC.m0 : IC.m2) : f > 0.5 ? IC.m4 : IC.m3;
        if (seam) return f < -0.3 ? IC.w2 : IC.w3;
        return f < -0.5 ? IC.w1 : f < -0.25 ? IC.w0 : f > 0.45 ? IC.w3 : IC.w2;
      });
    }
  });
  const r = R(hgt);
  T.disc(x, y - hgt, r, IC.w3);
  T.grain(1, () => T.disc(x, y - hgt + 0.4, r - 1.6, fill || ((xx, yy) => (xx - x + (yy - y) * 2) % 6 === 0 ? IC.w3 : IC.w1)));
  if (!fill) { T.px(x + r * 0.25, y - hgt + 1, IC.ink2); T.px(x + r * 0.25 + 1, y - hgt + 1, IC.w3); }
}
/** Something round lying along u (a log, a bedroll, a rolled map): its axis from u0 to u1 at (v, z + R), R its radius.
 *  side(lit, a, b, s) colours its skin (a toward the viewer's left, b up), end(rr, a, b) the near end it shows. */
function isoRoll(K, T, u0, u1, v, z, R, side, end) {
  for (let s = u0; s <= u1 + 1e-6; s += 0.5) {
    const [cx, cy] = K.P(s, v, z + R), cap = s + 0.5 > u1 + 1e-6;
    T.grain(cap ? 0 : 1, () => {
      for (let py = Math.floor(cy - 2 * R - 1); py <= Math.ceil(cy + 2 * R + 1); py++) for (let px = Math.floor(cx - 2 * R - 1); px <= Math.ceil(cx + 2 * R + 1); px++) {
        const a = -(px + 0.5 - cx) / 2, b = a - (py + 0.5 - cy), rr = Math.hypot(a, b) / R;
        if (rr > 1) continue;
        T.px(px, py, cap ? end(rr, a, b) : side((0.85 * b + 0.45 * a) / R, a, b, s));
      }
    });
  }
}
/** Polished brass: its own shades, off every texture ramp, so it stays smooth and bright. */
const BRASS = ["#fff4c4", "#f0c868", "#c8923c", "#8e6226", "#5c3c16"].map(pxHex);
const BURLAP = ["#ece0bc", "#cdb98c", "#a38d62", "#72603f", "#433625"].map(pxHex);
// The nest's own furniture, made by the keepers: root-wood, moss velvet, cast iron, lacquer and glaze, each in a few flat
// bands of its own (off the texture ramps, so the bands stay clean), lit from the top left like the glowlings and the beds
const DECO_IRON = ["#b4bcd8", "#7c84a8", "#535a7c", "#353a56", "#1e2036"].map(pxHex);
const DECO_VELVET = ["#c2e6a0", "#82bc6a", "#528c52", "#346642", "#1e402e"].map(pxHex);
const DECO_ROSEWOOD = ["#d8907a", "#a85a50", "#7a3a40", "#52243a", "#301428"].map(pxHex);
const DECO_LACQUER = ["#ffc2b4", "#f0705e", "#c4404a", "#8a2440", "#561634"].map(pxHex);
const DECO_MOON = ["#ffffff", "#fff4c4", "#f6dc8a", "#d9b25a", "#a57a34"].map(pxHex);
// the feeding bowl's lilac glaze, darkest last, and the cream of the band painted round it
const BOWL_GLAZE = ["#f6ecff", "#dcc4f4", "#b494de", "#8466b8", "#553e86", "#fff4dc"].map(pxHex);
const DECO_AQUA = ["#ffffff", "#d4f6ff", "#9fe4f4", "#5cc0dc", "#3a8eb4", "#24607e"].map(pxHex);
/** A turned shape standing at (x, y): a lamp's foot, a pedestal, a pot, a drum. Rings from z0 up to z1, r(z) wide, each in
 *  the flat bands of its ramp from the lit left to the shaded right, dithered only where two bands meet; then its top as a lid
 *  (lid: false leaves it open, or a function colours it). band(k, x, y, z) can nudge a band: flutes, pleats, hoops. */
function isoLathe(T, x, y, z0, z1, r, ramp, { lid = true, lit = 0, band = null } = {}) {
  const n = ramp.length - 1;
  for (let z = z0; z <= z1; z++) {
    const rr = r(z); if (rr <= 0.4) continue;
    T.disc(x, y - z, rr, (xx, yy) => { let k = 1 + bedBand(-(xx + 0.5 - x) / rr * 0.9 + lit, [0.5, -0.02, -0.55], xx, yy); if (band) k = band(k, xx, yy, z); return ramp[clamp(k, 0, n)]; });
  }
  const rt = r(z1);
  if (lid && rt > 0.4) T.disc(x, y - z1, rt, typeof lid === "function" ? lid : (xx, yy) => ramp[Math.min(n, bedBand(-(xx + 0.5 - x) / rt * 0.6 - (yy + 0.5 - y + z1) / rt + 0.25, [0.3, -0.5], xx, yy))]);
}
/** One crisp highlight on metal, glass or water, laid only on the thing itself: a bright pixel with a paler one either side
 *  along a short stroke (n long, slanting with the light from the top left). */
function decoGlint(T, x, y, n = 2, pale = IC.y0) { for (let k = 0; k < n; k++) T.on(x + k, y - (k >> 1), k ? pale : IC.white); T.on(x - 1, y + 1, pale); }
/** A little glint, the way the glowlings shine: a short bright stroke and a dot. */
function decoGloss(T, x, y, n = 2) { for (let k = 0; k < n; k++) T.px(x + k, y - (k >> 1), IC.white); T.px(x + n + 1, y - (n >> 1), IC.white); }
/** A tuft of moss lying on something, and now and then a glowcap growing out of it. */
function decoMoss(T, x, y, r, cap = 0) {
  bedPlush(T, x, y, r, Math.max(1.5, r * 0.62), BED_MOSS, { gloss: false, curls: true });
  if (cap) bedGlowcap(T, x + r * 0.4, y - 1, Math.round(cap * 1.4), cap);
}
/** The swing's moon seat: a crescent lying on its back, its craters, a glossy shine and (cushion) a felt pad in its hollow
 *  to sit on. (x, y) is the middle of its circle, r its radius in art pixels. */
function moonSeat(T, x, y, r, cushion = true) {
  for (let yy = Math.floor(y); yy <= Math.ceil(y + r); yy++) for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
    const dx = xx + 0.5 - x, dy = yy + 0.5 - y, d = Math.hypot(dx, dy) / r, di = Math.hypot(dx, dy + r * 0.38) / (r * 0.92);
    if (d > 1 || di < 1 || dy < r * 0.12) continue;
    let k = 1 + bedBand(-dx / r * 0.6 - (di - 1) * 2.4 + 0.25, [0.35, -0.1, -0.5], xx, yy);
    if (r > 6 && k < 4 && pxHash(xx >> 1, yy >> 1) > 0.9) k++;
    T.px(xx, yy, DECO_MOON[k]);
  }
  if (r > 6) decoGloss(T, x - r * 0.72, y + r * 0.42, 1);
  if (cushion && r > 6) bedPlush(T, x, y + r * 0.5, r * 0.46, Math.max(1.5, r * 0.17), BED_FELT, { gloss: false });
}
/** A burlap sack sitting on the floor at (x, y): a soft round body with a flat bottom, creases falling from a neck tied with
 *  rope and a gathered tuft above it, or, opened, its rim rolled down over what it holds. */
function isoSack(T, x, y, r, hgt, { open = null, mark = null, lean = 0 } = {}) {
  const cy = y - hgt * 0.45, ry = hgt * 0.55, top = y - hgt;
  for (let yy = Math.floor(top - 2); yy <= y; yy++) for (let xx = Math.floor(x - r - 2); xx <= Math.ceil(x + r + 2); xx++) {
    const ly = (yy + 0.5 - cy) / ry, sx = x + lean * (cy - yy) / ry * 2, nx = (xx + 0.5 - sx) / (r * (1 + 0.12 * Math.max(0, ly)));
    if (Math.abs(nx) ** 2.4 + Math.abs(ly) ** 2.4 > 1) continue;
    let lit = -nx * 0.6 - ly * 0.7, k = lit > 0.5 ? 1 : lit > 0 ? 2 : lit > -0.55 ? 3 : 4;
    // creases fall from the neck, and the weave shows on the middle tones
    const crease = ly < 0.5 && [-0.38, 0.22, 0.55].some(c => Math.abs(nx - c * (1 - (ly + 1) * 0.25)) < 0.07);
    if (crease) k = Math.min(4, k + 1); else if (k === 2 && (xx + yy) % 2 && pxHash(xx, yy) > 0.6) k = 3;
    T.px(xx, yy, BURLAP[k]);
  }
  if (mark) for (let k = -2; k <= 2; k++) { T.px(x + k - r * 0.15, cy + 1 + Math.abs(k) * 0.5, mark); T.px(x + k - r * 0.15, cy + 2, k % 2 ? mark : null); }
  if (open) {
    // the rolled-down rim, then what it holds, heaped a little
    T.disc(x + lean, top + 2, r * 0.82, (xx) => xx < x ? BURLAP[1] : BURLAP[2], r * 0.34);
    T.disc(x + lean, top + 1.6, r * 0.62, (xx, yy) => pxHash(xx, yy) > 0.7 ? open[0] : xx > x + r * 0.2 ? open[2] : open[1], r * 0.24);
    T.ball(x + lean - 1, top, r * 0.4, open[0], open[1], open[2], r * 0.2);
  } else {
    // the neck, the rope round it and the gathered tuft above
    for (let k = 0; k < 3; k++) T.line(x - r * 0.24, top + 1 - k, x + r * 0.24, top + 1 - k, BURLAP[k === 1 ? 2 : 3]);
    T.line(x - r * 0.3, top + 1, x + r * 0.3, top + 1, IC.w3); T.px(x + r * 0.3, top + 2, IC.w3); T.px(x + r * 0.3 + 1, top + 3, IC.w3);
    for (let k = -3; k <= 3; k++) { const hgt2 = 2 + Math.round(pxHash(k, 4) * 2); for (let j = 0; j < hgt2; j++) T.px(x + k * r * 0.12, top - 1 - j, BURLAP[k < 0 ? 1 : k > 1 ? 3 : 2]); }
  }
}
/** Goods on a shelf, standing at (u, v, z) of a kit: stoneware crocks, jam jars with cloth tops, bottles, loaves, cheeses, folded cloth. */
function isoGoods(K, T, kind, u, v, z, U, k = 0) {
  const [x, y] = K.P(u, v, z);
  if (kind === "crock") { const h2 = Math.round(U * 0.75), r = 0.17 * U; K.cyl(u, v, z, r, h2, IC.s1, IC.s0, IC.s2); K.cyl(u, v, z + h2, r * 0.6, 1, IC.s2, IC.s1, IC.s2); K.ring(u, v, z + h2 * 0.62, r, IC.b2); K.ring(u, v, z + h2 * 0.68, r, IC.b1); T.px(x - r * 1.6, y - h2 * 0.5, IC.white); T.px(x - r * 1.6, y - h2 * 0.5 - 1, IC.white); }
  else if (kind === "jar") {
    const c = [[IC.r1, IC.r2, IC.r3], [IC.y1, IC.w1, IC.w2], [IC.p1, IC.p2, IC.p3], [IC.g1, IC.g2, IC.g3]][k % 4], h2 = Math.round(U * 0.62), r = 0.13 * U;
    K.cyl(u, v, z, r, h2, c[0], c[1], c[2]);
    K.cyl(u, v, z + h2, r * 1.1, 2, [IC.s0, IC.p0, IC.y0][k % 3], IC.s1, IC.s2); K.ring(u, v, z + h2 - 1, r * 1.1, IC.w3);
    for (let j = 2; j < h2 - 2; j++) T.px(x - r * 1.7, y - j, j > h2 / 2 ? IC.white : null);
    K.ring(u, v, z + h2 * 0.35, r * 0.9, IC.s0);
  } else if (kind === "bottle") {
    const c = [[IC.g1, IC.g2, IC.g3], [IC.b1, IC.b2, IC.b3], [IC.r1, IC.r2, IC.r3]][k % 3], h2 = Math.round(U * 0.55);
    K.cyl(u, v, z, 0.09 * U, h2, c[1], c[1], c[2]);
    T.line(x, y - h2, x, y - h2 - 4, c[2]); T.line(x + 1, y - h2, x + 1, y - h2 - 3, c[2]); T.px(x, y - h2 - 5, IC.w2); T.px(x + 1, y - h2 - 5, IC.w3);
    for (let j = 2; j < h2 - 1; j++) T.px(x - 2, y - j, j % 5 === 0 ? null : c[0]); T.px(x - 2, y - h2 + 2, IC.white);
  } else if (kind === "loaf") { T.ball(x, y - U * 0.2, U * 0.34, IC.w0, IC.w1, IC.w2, U * 0.22); for (let s = -1; s <= 1; s++) T.line(x + s * 3 - 1, y - U * 0.2, x + s * 3 + 1, y - U * 0.12, IC.w2); }
  else if (kind === "cheese") { for (let j = 0; j < 2; j++) { K.cyl(u, v, z + j * Math.round(U * 0.28), 0.15 * U, Math.round(U * 0.24), IC.y0, IC.y1, IC.w1); K.ring(u, v, z + j * Math.round(U * 0.28), 0.15 * U, IC.w2); } }
  else if (kind === "cloth") { const c = [[IC.p1, IC.p2, IC.p3], [IC.b1, IC.b2, IC.b3], [IC.g1, IC.g2, IC.g3]]; for (let j = 0; j < 3; j++) { const cc = c[(j + k) % 3]; K.box(u - 0.14 * U, v - 0.14 * U, z + j * 3, 0.28 * U, 0.26 * U, 3, cc[0], cc[1], cc[2]); } }
}
/** A half geode standing on its round back, its cut face turned toward the room: you see the stone shell bulging behind on
 *  the right, a white agate rim, crystals catching the light, and the dark hollow in the middle; (cx, cy) is its middle. */
function halfGeode(T, cx, cy, r, ry, [c0, c1, c2], spark) {
  T.disc(cx + 1, cy + ry * 0.9, r * 0.8, IC.w3, r * 0.25);                           // its shadow on the plank
  T.ball(cx + r * 0.18, cy, r, IC.s1, IC.s2, IC.s3, ry);                            // the stone shell
  const fx = cx - r * 0.12, fr = r * 0.8, fry = ry * 0.86;
  T.disc(fx, cy, fr, (px, py) => {
    const d = Math.hypot((px - fx) / fr, (py - cy) / fry);
    if (d > 0.84) return IC.s0;                                                        // agate rim
    if (d > 0.62) return (px + py) % 3 ? c1 : c0;                                       // crystal points
    if (d > 0.36) return py < cy ? c0 : c1;                                             // tips, lit from above
    return pxHash(px, py) > 0.8 ? c0 : c2;                                              // the hollow, with a few sparkles
  }, fry);
  // a glint, and a sparkle when tapped
  T.px(fx - fr * 0.35, cy - fry * 0.4, IC.white); T.px(fx - fr * 0.35 + 1, cy - fry * 0.4, IC.white);
  if (spark) { T.px(cx, cy - r - 2, IC.white); T.px(cx - 1, cy - r - 1, IC.y0); T.px(cx + 1, cy - r - 1, IC.y0); T.px(cx, cy - r, IC.y0); }
}
/** Snow and ice for the snowfields' pieces: snow from its lit white to its deep blue shade, ice from frost-white to deep water. */
const SNOW = ["#ffffff", "#efe6ff", "#cfc4d6", "#a596a8", "#7a6a7e"].map(pxHex), ICE = ["#e8f7ff", "#b8e6f5", "#69b7d6", "#3383a8"].map(pxHex);
/** A fir under snow, standing at (x, y), `hgt` tall: a short trunk, then tiers of dark needles, each tier's top and lit left
 *  edge heaped with snow, the tip a single white point. */
function snowFir(T, x, y, hgt) {
  const C = ["#10301f", "#1e5233", "#2f7d4a"].map(pxHex), tiers = 4, ww = hgt * 0.3;
  T.line(x, y, x, y - hgt * 0.12, IC.w3); T.px(x + 1, y, IC.w3);
  for (let k = 0; k < tiers; k++) {
    const by = y - hgt * 0.1 - k * hgt * 0.2, th = hgt * 0.34, tw = ww * (1 - k * 0.2);
    for (let j = 0; j <= th; j++) { const half = tw * j / th, yy = Math.round(by - th + j); for (let dx = -Math.round(half); dx <= Math.round(half); dx++) { const f = dx / (half + 0.5); T.px(x + dx, yy, j < 2 + (pxHash(dx, k) > 0.5 ? 1 : 0) || (f < -0.45 && j < th * 0.7) ? SNOW[f < 0 ? 0 : 1] : f > 0.4 ? C[0] : f < -0.2 ? C[2] : C[1]); } }
    for (let dx = -Math.round(tw); dx <= Math.round(tw); dx++) if (pxHash(dx, k + 3) > 0.45) T.px(x + dx, Math.round(by) + 1, SNOW[dx < 0 ? 1 : 2]);
  }
  T.px(x, Math.round(y - hgt * 0.1 - (tiers - 1) * hgt * 0.2 - hgt * 0.34) - 1, SNOW[0]);
}
const ISO_ART = {
  lamp(t, T, ax, ay, o) {
    // a standard lamp of root-wood, taller than a keeper's shoulder: three roots gripping a mossy stone for its foot, a stem
    // twisting up through a brass collar, a pleated felt shade glowing warm from inside with a beaded fringe, an amethyst
    // hanging under it for the bulb and another for the finial. Switched off, the shade goes dusky and the glow goes out
    const U = t / 2, K = isoKit(T, ax, ay), [x, y] = K.P(0.5 * U, 0.5 * U, 0), H = Math.round(t * 2.2), on = !o.off;
    const zs = H - Math.round(t * 0.62), sh = on ? [IC.white, IC.y0, pxHex("#f8d890"), IC.y1, pxHex("#c88a48")] : ["#d8cce6", "#b4a6c8", "#8a7aa6", "#5e507a", "#3d3358"].map(pxHex);
    if (on) { T.glow(x, y - zs, t * 1.35, IC.y0, 0.34); T.glow(x, y - zs + t * 0.3, t * 0.8, IC.y0, 0.3); }
    // the foot: a mossy stone, and three roots gripping it
    isoLathe(T, x, y, 0, Math.round(t * 0.14), z => t * (0.36 - z / t * 0.7), [IC.s0, IC.s1, IC.s2, IC.s3, IC.s4]);
    decoMoss(T, x - t * 0.18, y - t * 0.14, t * 0.14);
    const zf = Math.round(t * 0.14);
    for (const [dx, dy] of [[-0.34, 0.06], [0.3, 0.1], [0.04, 0.2]]) for (let k = 0; k < 2; k++) T.line(x + k, y - zf - 3, x + dx * t + k, y - zf + dy * t, BED_ROOT[k ? 3 : 1]);
    // the stem, twisting gently, lit on the left
    for (let z = zf; z < zs; z++) { const sx = x + Math.round(Math.sin(z * 0.22) * 0.8); T.px(sx - 1, y - z, BED_ROOT[1]); T.px(sx, y - z, (z & 3) ? BED_ROOT[2] : BED_ROOT[3]); T.px(sx + 1, y - z, BED_ROOT[3]); }
    isoLathe(T, x, y, Math.round(zs * 0.42), Math.round(zs * 0.42) + 2, () => 2.6, BRASS);
    isoLathe(T, x, y, zs - 3, zs, () => 2.2, BRASS);
    decoGlint(T, x - 2, y - Math.round(zs * 0.42) - 1, 1);
    // the bulb: an amethyst point hanging under the shade
    for (let k = 0; k < 4; k++) for (let q = -1; q <= 1; q++) if (Math.abs(q) <= (3 - k) * 0.5 + 0.2) T.px(x + q, y - zs + 1 + k, on ? (q < 0 ? IC.white : q ? IC.y1 : IC.y0) : (q < 0 ? IC.l1 : IC.l3));
    // the shade: a bell of pleated felt, wider at the bottom, its lower rim lit brightest from inside
    const r0 = t * 0.46, r1 = t * 0.24, hs = H - zs;
    isoLathe(T, x, y, zs, H, z => r1 + (r0 - r1) * Math.pow(1 - (z - zs) / hs, 1.4), sh, { lit: on ? 0.25 : 0,
      band: (k, xx, yy, z) => (z === zs || z === zs + 1) && on ? 0 : k + ((xx - x + 40) % 3 === 0 ? 1 : 0), lid: (xx) => xx < x ? sh[1] : sh[2] });
    T.disc(x, y - H, r1 - 1.6, on ? sh[0] : sh[2]);
    // a beaded fringe along the hem
    for (let dx = -Math.floor(r0) + 1; dx < r0; dx += 2) { const fy = y - zs + r0 / 2 * Math.sqrt(Math.max(0, 1 - (dx / r0) ** 2)); T.px(x + dx, fy + 1, BRASS[dx < 0 ? 1 : 2]); T.px(x + dx, fy + 2, dx % 4 ? BRASS[3] : IC.l2); }
    bedCrystal(T, x, y - H, Math.max(4, t * 0.2), Math.max(1.5, t * 0.06));
    if (on) decoGloss(T, x - r0 * 0.55, y - zs - hs * 0.45, 1);
  },
  bookcase(t, T, ax, ay) {
    // a tall oak bookcase, a head over the keepers: a plinth, the carcass with a raised panel down its side, a cornice on
    // top; inside, four shelves in shadow under each board, filled with real books (spines in cloth colours with gilt bands,
    // different heights, a gap, one leaning, one lying flat), a geode, a jar of glowcaps; moss creeping over the cornice and
    // a crystal cluster standing on it
    const U = t / 2, K = isoKit(T, ax, ay), u0 = 0.05 * U, u1 = 0.95 * U, v0 = 0.08 * U, v1 = 0.62 * U, H = Math.round(t * 2.05), so = 0.09 * U;
    K.box(u0 - 0.02 * U, v0, 0, u1 - u0 + 0.04 * U, v1 - v0 + 0.03 * U, 4, IC.w2, IC.w2, IC.w3);
    K.box(u0, v0, 4, u1 - u0, v1 - v0, H - 8, IC.w1, IC.w2, IC.w3);
    // the raised panel on the side
    { const f = (a, b, z0, z1, col) => K.faceU(u1, a, b, z0, z1, col, 7), a = v0 + 0.08 * U, b = v1 - 0.08 * U, z0 = 8, z1 = H - 10;
      f(a, b, z0, z1, IC.ink2); f(a + 0.4, b - 0.4, z0 + 1, z1 - 1, IC.w3); f(a + 0.4, b - 0.4, z1 - 2, z1 - 1, IC.w2); f(a + 0.4, a + 0.9, z0 + 1, z1 - 1, IC.w2); }
    // the inside: dark at the back, a shelf board every row with a lit edge and a shadow under it
    const ua = u0 + so, ub = u1 - so, zi0 = 6, zi1 = H - 7, rows = 4, rh = (zi1 - zi0) / rows;
    K.faceV(v1, ua, ub, zi0, zi1, IC.w3, 1);
    for (let r = 0; r < rows; r++) { const z = zi0 + r * rh; K.faceV(v1, ua, ub, z + rh - 3, z + rh, IC.ink2, 0); }
    const BOOKS = [[IC.p1, IC.p3, IC.y0], [IC.b1, IC.b3, IC.y0], [IC.g1, IC.g3, IC.y1], [IC.r1, IC.r3, IC.y0], [IC.l2, IC.l4, IC.white], [IC.y1, IC.w3, IC.r2], [IC.b2, IC.b3, IC.y1], [IC.s1, IC.s3, IC.p2]];
    const vb = v1 - 0.04 * U, book = (u, w, z0, tall, col, lean = 0) => {
      for (let c = 0; c < w; c++) for (let z = z0; z < z0 + tall; z++) { const uu = u + c * 0.5 + (z - z0) * lean * 0.5; if (uu > ub - 0.4) continue; const band = (z === z0 + 1 || z === z0 + tall - 2) && c < w - 1; K.dot(uu, vb, z, band ? col[2] : c === w - 1 ? col[1] : col[0]); }
    };
    for (let r = 0; r < rows; r++) {
      const z0 = Math.round(zi0 + r * rh) + 1, top = Math.round(rh) - 2;
      let u = ua + 0.3, k = r * 7;
      while (u < ub - 1.2) {
        k++;
        const col = BOOKS[Math.floor(pxHash(k, 11 + r) * BOOKS.length)];
        if (r === 3 && u > ua + (ub - ua) * 0.55) {
          // the top shelf ends with a half geode and a jar of glowcaps
          const [gx, gy] = K.P(u + 0.9, vb - 0.1 * U, z0); T.ball(gx, gy - 3, 3.2, IC.s1, IC.s2, IC.s3, 3); T.disc(gx - 1, gy - 3, 2.2, (xx, yy) => pxHash(xx, yy) > 0.5 ? IC.l1 : IC.l3, 2.4); T.px(gx - 2, gy - 4, IC.white);
          const [jx, jy] = K.P(u + 2.6, vb - 0.1 * U, z0); T.glow(jx, jy - 4, 5, BED_GLOW[3], 0.4); T.disc(jx, jy - 3, 2.4, BED_GLOW[4], 3.5); T.px(jx - 1, jy - 5, BED_GLOW[1]); T.px(jx + 1, jy - 3, BED_GLOW[2]); T.px(jx - 2, jy - 3, IC.white); T.line(jx - 2, jy - 7, jx + 2, jy - 7, IC.w1);
          break;
        }
        if (pxHash(k, 5 + r) > 0.88) { u += 1; continue; }
        if (r === 1 && pxHash(k, 2) > 0.8) { for (let j = 0; j < 3; j++) K.box(u, vb - 0.2 * U, z0 + j * 2, 2.2, 0.2 * U, 2, BOOKS[(k + j) % 8][0], BOOKS[(k + j) % 8][0], BOOKS[(k + j) % 8][1], false); u += 2.6; continue; }
        const w = pxHash(k, r + 3) > 0.5 ? 4 : 3, tall = top - Math.round(pxHash(k, 7) * Math.min(3, top * 0.3));
        if (r === 2 && pxHash(k, 9) > 0.75) { book(u, 3, z0, tall - 1, col, 0.4); u += 2.6; continue; }
        book(u, w, z0, tall, col);
        u += w * 0.5;
      }
    }
    // the stiles over the books' ends, and the cornice
    K.faceV(v1, u0, ua, 4, H - 4, IC.w2, 3); K.faceV(v1, ub, u1, 4, H - 4, IC.w2, 3); K.seg([u0, v1, H - 5], [u0, v1, 5], IC.w1);
    K.box(u0 - 0.05 * U, v0 - 0.03 * U, H - 4, u1 - u0 + 0.1 * U, v1 - v0 + 0.08 * U, 4, IC.w1, IC.w2, IC.w3);
    K.faceV(v1 + 0.05 * U, u0 - 0.05 * U, u1 + 0.05 * U, H - 2, H - 1, IC.w3, 1);
    { const [cx, cy] = K.P(0.68 * U, 0.3 * U, H); for (const [dx, h, w, l] of [[-2, 0.36, 0.07, -0.08], [1, 0.5, 0.085, 0.04], [4, 0.28, 0.06, 0.12]]) bedCrystal(T, cx + dx, cy, t * h, Math.max(1.5, t * w), l * t); }
    decoMoss(T, ...K.P(0.18 * U, 0.5 * U, H), t * 0.16, t * 0.08);
    for (let k = 0; k < 4; k++) K.dot(0.08 * U + k * 0.6, v1 + 0.06 * U, H - 2 - (k % 3) - 1, BED_MOSS[2]);
  },
  spring(t, T, ax, ay, o) {
    // a little moon pond: a ring of rounded stones, water dark in the deep middle and light at the shallow rim,
    // lily pads with a pink flower, reeds at the back and the moon shining on the water
    const cx = ax, cy = ay + t / 2, rx = t * 0.78, fl = 0.5, ry = rx * fl, f = o.frame || 0;
    const stones = Math.max(9, Math.round(rx / 1.6));
    for (let k = 0; k < stones; k++) {
      const an = k / stones * TAU, sx = cx + Math.cos(an) * (rx - 0.5), sy = cy + Math.sin(an) * (ry - 0.25), r = Math.max(1.6, rx * 0.13) + pxHash(k, 9) * Math.max(1, rx * 0.06);
      T.ball(sx, sy - 1, r + 0.5, IC.s1, IC.s2, IC.s3, r * 0.8);
      // wet stones: a pale lit edge up toward the light on some, a dark seam where each meets the next
      if (k % 3 === 0) { T.on(sx - r * 0.5, sy - r * 0.6 - 1, IC.s0); T.on(sx - r * 0.5 + 1, sy - r * 0.6 - 1, IC.s0); }
      T.on(sx + r * 0.9, sy - 1, IC.s4);
    }
    // the water: shallow and light at the near rim, deep in the middle, and in the shade of the stones along its back edge
    T.disc(cx, cy, rx - 1.5, (x, y) => { const d = Math.hypot((x - cx) / (rx - 1.5), (y - cy) / (ry - 0.75)); return d > 0.7 && y + 0.5 < cy - ry * 0.15 ? IC.b3 : d > 0.78 ? IC.b1 : d > 0.45 ? IC.b2 : IC.b3; }, ry - 0.75);
    // one bright streak of light lying on the water
    for (let k = 0; k < 4; k++) T.on(cx - rx * 0.62 + k, cy + ry * 0.35, k === 1 ? IC.white : IC.b0);
    // reeds at the back edge
    for (const [dx, hgt] of [[-0.45, 0.8], [-0.35, 1.05], [-0.25, 0.7]]) { const rxp = cx + dx * rx * 2, ryp = cy - ry * 0.75; for (let k = 0; k < hgt * t * 0.6; k++) T.px(rxp + (k > hgt * t * 0.4 ? 1 : 0), ryp - k, k > hgt * t * 0.5 ? IC.w2 : IC.g2); }
    // lily pads with a notch, and one pink flower
    for (const [dx, dy, r] of [[0.2, 0.1, 0.22], [-0.15, 0.22, 0.16], [0.35, -0.15, 0.14]]) {
      const px0 = cx + dx * rx * 2, py0 = cy + dy * ry * 2, pr = r * rx * 1.4;
      T.disc(px0, py0, pr, (x, y) => (x > px0 && Math.abs(y - py0) < 0.8) ? IC.b2 : x < px0 - pr * 0.3 ? IC.g0 : IC.g1, pr * fl);
    }
    const fx = cx + 0.2 * rx * 2, fy = cy + 0.1 * ry * 2 - 1;
    T.px(fx, fy - 1, IC.p0); T.px(fx - 1, fy, IC.p1); T.px(fx + 1, fy, IC.p1); T.px(fx, fy, IC.y1);
    // the moon's reflection, and a ripple that moves
    T.px(cx - rx * 0.3, cy - 1, IC.y0); T.px(cx - rx * 0.3 + 1, cy - 1, IC.y0); T.px(cx - rx * 0.3, cy, IC.y1);
    const rk = (f % 6) / 6, rr = rx * (0.25 + rk * 0.5);
    for (let k = 0; k < 16; k++) { const an = k / 16 * TAU; if (k % 2) T.px(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr * fl, IC.b0); }
  },
  armchair(t, T, ax, ay) {
    // a wingback armchair the keepers upholstered in moss-green velvet: a carved root-wood frame on cabriole legs, a camel
    // back buttoned in a diamond, wings, rolled arms with a scroll at the front, a plump seat cushion with piping, a teal
    // felt pillow and an amethyst set in the crest. Its seat is a glowling's lap height
    const U = t / 2, K = isoKit(T, ax, ay), V = DECO_VELVET, R = BED_ROOT;
    const u0 = 0.06 * U, u1 = 0.94 * U, v0 = 0.06 * U, v1 = 0.96 * U, aw = 0.2 * U, bd = 0.24 * U, lg = 0.1 * U;
    const L = Math.round(t * 0.16), zs = L + Math.round(t * 0.26), zc = zs + Math.round(t * 0.12), za = Math.round(t * 0.74), zw = Math.round(t * 1.12), zb = Math.round(t * 1.38);
    const leg = (u, v) => { K.box(u, v, 0, lg, lg, L, R[1], R[2], R[3], false); K.dot(u + lg, v + lg, 0, BRASS[1]); };
    leg(u0 + 0.04 * U, v0); leg(u1 - lg - 0.04 * U, v0);
    // the back, rising in a camel hump, and its show-wood crest
    const ub0 = u0 + 0.06 * U, ub1 = u1 - 0.06 * U, vb = v0 + bd, hump = u => (t * 0.16 * Math.sin(Math.PI * clamp((u - ub0) / (ub1 - ub0), 0, 1)));
    K.box(ub0, v0, L, ub1 - ub0, bd, zb - L, V[1], V[2], V[3]);
    for (let u = ub0; u < ub1; u += 0.5) { const p = hump(u), q = hump(u + 0.5); K.quad([[u, vb, zb], [u + 0.55, vb, zb], [u + 0.55, vb, zb + q], [u, vb, zb + p]], V[2], 0); K.quad([[u, v0, zb + p], [u + 0.55, v0, zb + q], [u + 0.55, vb, zb + q], [u, vb, zb + p]], V[1], 0); }
    for (let u = ub0; u <= ub1; u += 0.5) { K.dot(u, vb, zb + Math.round(hump(u)), R[1]); K.dot(u, vb, zb + Math.round(hump(u)) - 1, R[2]); }
    // buttons in a diamond, each sunk in a little dimple
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - (row % 2); k++) {
      const u = ub0 + (ub1 - ub0) * ((k + (row % 2 ? 1 : 0.5)) / 4), z = zc + 4 + row * Math.round((zb - zc - 6) / 3);
      K.dot(u, vb, z, V[4]); K.dot(u - 0.5, vb, z + 1, V[3]); K.dot(u + 0.5, vb, z - 1, V[1]);
    }
    { const [cx, cy] = K.P((ub0 + ub1) / 2, vb, zb + Math.round(hump((ub0 + ub1) / 2))); bedCrystal(T, cx, cy + 1, Math.max(4, t * 0.17), Math.max(1.5, t * 0.06)); }
    // a side: its wing, then the rolled arm running forward, a scroll on its front
    const side = u => {
      K.box(u, vb, L, aw, 0.32 * U, zw - L, V[1], V[2], V[3]);
      K.box(u, vb, L, aw, v1 - vb - 0.04 * U, za - L, V[1], V[2], V[3]);
      K.seg([u + aw * 0.5, vb + 0.32 * U, za], [u + aw * 0.5, v1 - 0.04 * U, za], V[0]);
      const [sx, sy] = K.P(u + aw * 0.5, v1 - 0.04 * U, za - 3);
      T.disc(sx, sy, 2.4, V[3], 2.2); T.px(sx, sy, V[1]); T.px(sx - 1, sy - 1, V[0]);
    };
    side(u0);
    // the seat and its cushion, sunk between the arms, lit from above so you can see where to sit
    K.box(u0 + aw, vb, L, u1 - u0 - 2 * aw, v1 - vb - 0.04 * U, zs - L, V[2], V[2], V[3]);
    K.box(u0 + aw, vb, zs, u1 - u0 - 2 * aw, v1 - vb - 0.02 * U, zc - zs, V[0], V[1], V[2]);
    K.seg([u0 + aw, v1 - 0.02 * U, zc], [u1 - aw, v1 - 0.02 * U, zc], V[0]);
    { const [gx, gy] = K.P(u0 + aw + 0.12 * U, vb + 0.3 * U, zc); decoGloss(T, gx, gy, 2); }
    { const [px, py] = K.P(0.5 * U, vb + 0.14 * U, zc + Math.round(t * 0.2)); bedPlush(T, px, py, t * 0.24, t * 0.2, BED_FELT, { curls: true }); }
    // a carved apron along the front, scalloped
    for (let u = u0 + aw; u <= u1 - aw; u += 0.5) { const s = Math.round(1.5 + Math.sin((u - u0) * 1.3) * 1.2); for (let z = L - 1; z < L + s; z++) K.dot(u, v1 - 0.04 * U, z, z === L + s - 1 ? R[1] : R[2]); }
    side(u1 - aw);
    leg(u0 + 0.04 * U, v1 - lg - 0.04 * U); leg(u1 - lg - 0.04 * U, v1 - lg - 0.04 * U);
  },
  cushion(t, T, ax, ay) {
    // the cloud cushion as it floats in the room (see paintCloud), here for the Decor list, a little smaller
    const s = Math.round(t * 0.95), w = s * 2 + 12, h = s + 14, ox = Math.round(ax - w / 2), oy = Math.round(ay + t / 2 - h * 0.8);
    paintCloud({ ...T, px: (x, y, c) => T.px(x + ox, y + oy, c) }, s, w, h);
  },
  swing(t, T, ax, ay, o = {}) {
    // an A-frame of root-wood posts, bark on their shaded side, pegged to a crossbar with moss draped over it and a brass moon
    // in the middle; glowcaps grow at one foot. In the room the moon seat hangs from the bar and swings (drawSwingIso)
    const U = t / 2, K = isoKit(T, ax, ay), H = Math.round(t * 1.8), c = 0.5 * U, R = BED_ROOT;
    const post = (u, v) => { const [fx, fy] = K.P(u, v, 0), [tx, ty] = K.P(u, c, H), n = Math.max(2, Math.round(t / 12)); for (let k = 0; k <= n; k++) T.line(tx + k - 1, ty, fx + k - 1, fy, k === 0 ? R[0] : k === n ? R[3] : (k === 1 ? R[1] : R[2])); T.px(fx - 1, fy + 1, R[3]); T.px(fx + n, fy + 1, R[3]); };
    for (const u of [0.06 * U, 0.94 * U]) { post(u, 0.04 * U); }
    // the crossbar, and moss hanging off it in strands
    K.box(0, c - 0.07 * U, H - 2, U, 0.14 * U, 3, R[1], R[2], R[3]);
    for (let u = 0.04 * U; u < U * 0.96; u += 0.5) { const n = (pxHash(Math.round(u * 2), 3) * 4) | 0, near = u < 0.3 * U || u > 0.7 * U; if (near) { K.dot(u, c + 0.07 * U, H + 1, BED_MOSS[1]); for (let k = 0; k < n; k++) K.dot(u, c + 0.07 * U, H - 2 - k, BED_MOSS[k === n - 1 ? 3 : 2]); } }
    { const [mx, my] = K.P(c, c + 0.07 * U, H + 1); moonSeat(T, mx, my - Math.round(t * 0.2), t * 0.17, false); }
    for (const u of [0.06 * U, 0.94 * U]) post(u, 0.96 * U);
    bedGlowcap(T, ...K.P(0.18 * U, 0.98 * U, 0), Math.round(t * 0.28), t * 0.12);
    bedGlowcap(T, ...K.P(0.3 * U, 0.86 * U, 0), Math.round(t * 0.16), t * 0.08);
    if (!o.room) {
      // for the Decor list: the seat at rest under the bar, on its ropes
      const [sx, sy] = K.P(c, c, H * 0.28), r = t * 0.62;
      for (const d of [-1, 1]) T.line(sx + d * r * 0.7, sy - r * 0.15, ...K.P(c + d * 0.3 * U, c, H - 2), IC.s1);
      moonSeat(T, sx, sy, r);
    }
  },
  musicbox(t, T, ax, ay, o = {}) {
    // a legendary music box, the upright kind with a big steel disc: a cabinet of rosewood on bun feet, a glass door in an
    // arched brass frame with the disc turning behind it (its pins catching the light, a brass hub), bulbs round the arch
    // that chase while it plays, a drawer of spare discs, a carved crest with a rose crystal, and a crank on its side
    const U = t / 2, K = isoKit(T, ax, ay), RW = DECO_ROSEWOOD, f = o.frame || 0;
    const u0 = 0.12 * U, u1 = 0.88 * U, v0 = 0.2 * U, v1 = 0.78 * U, H = Math.round(t * 1.42), zp = 4;
    for (const [u, v] of [[u0 + 0.05 * U, v1 - 0.05 * U], [u1 - 0.05 * U, v1 - 0.05 * U], [u1 - 0.05 * U, v0 + 0.05 * U]]) { const [fx, fy] = K.P(u, v, 0); T.ball(fx, fy - 1, 2, BRASS[1], BRASS[2], BRASS[3], 1.6); }
    K.box(u0 - 0.03 * U, v0 - 0.03 * U, 1, u1 - u0 + 0.06 * U, v1 - v0 + 0.06 * U, zp - 1, RW[1], RW[2], RW[3]);
    K.box(u0, v0, zp, u1 - u0, v1 - v0, H - zp - 3, RW[1], RW[2], RW[3]);
    K.box(u0 - 0.04 * U, v0 - 0.04 * U, H - 3, u1 - u0 + 0.08 * U, v1 - v0 + 0.08 * U, 3, RW[0], RW[1], RW[3]);
    // the drawer, with two brass knobs
    const zd1 = Math.round(H * 0.3);
    K.faceV(v1, u0 + 0.08 * U, u1 - 0.08 * U, zp + 2, zd1, RW[3], 0); K.faceV(v1, u0 + 0.1 * U, u1 - 0.1 * U, zp + 3, zd1 - 1, RW[2], 0);
    K.seg([u0 + 0.1 * U, v1, zd1 - 1], [u1 - 0.1 * U, v1, zd1 - 1], RW[1]);
    for (const s of [0.3, 0.7]) { K.dot(u0 + (u1 - u0) * s, v1, Math.round((zp + zd1) / 2), BRASS[1]); K.dot(u0 + (u1 - u0) * s - 0.5, v1, Math.round((zp + zd1) / 2) + 1, BRASS[0]); }
    // the door: an arch in brass, the dark inside, and the disc with its pins in rings, turning with the music
    const ua = u0 + 0.12 * U, ub = u1 - 0.12 * U, uc = (ua + ub) / 2, za = zd1 + 3, zt = H - 5, wu = (ub - ua) / 2;
    const arch = u => zt - Math.round((1 - Math.sqrt(Math.max(0, 1 - ((u - uc) / wu) ** 2))) * (zt - za) * 0.45);
    const dz = Math.round((za + zt) / 2) - 1, dr = Math.min(wu * 2.24, (zt - za) / 2) * 0.86;
    for (let u = ua; u <= ub + 1e-6; u += 0.5) for (let z = za; z <= arch(u); z++) {
      const rim = u < ua + 0.6 || u > ub - 0.6 || z === za || z > arch(u) - 1, d = Math.hypot((u - uc) * 2.24, z - dz) / dr;
      let col = IC.ink2;
      if (rim) col = u < uc ? BRASS[1] : BRASS[2];
      else if (d < 1) {
        const an = Math.atan2(z - dz, (u - uc) * 2.24), glint = Math.abs(((an / TAU * 8 - f) % 8 + 8) % 8 - 2) < 0.6;
        col = d < 0.2 ? (d < 0.1 ? BRASS[0] : BRASS[2]) : d > 0.92 ? IC.m2 : glint ? IC.m0 : Math.round(d * 9) % 2 ? IC.m1 : IC.m2;
      }
      K.dot(u, v1, z, col);
    }
    { const [gx, gy] = K.P(ua + 0.3, v1, arch(ua + 0.3) - 2); decoGlint(T, gx, gy, 1); }
    // bulbs round the arch, chasing round it while it plays
    const bars = [IC.p0, IC.y0, IC.g0, IC.b0, IC.l1];
    for (let k = 0, u = ua + 0.3; u <= ub - 0.3; u += 1, k++) K.dot(u, v1, arch(u) + 1, o.quiet ? BRASS[3] : bars[(k + f) % bars.length]);
    // carved columns either side of the door
    for (const u of [u0 + 0.04 * U, u1 - 0.07 * U]) { K.faceV(v1, u, u + 0.03 * U, za, zt, RW[1], 0); for (let z = za; z < zt; z += 3) K.dot(u + 0.015 * U, v1, z, RW[0]); }
    // the side: a carved panel, and the crank
    K.faceU(u1, v0 + 0.08 * U, v1 - 0.08 * U, zp + 3, H - 6, RW[4], 0); K.faceU(u1, v0 + 0.1 * U, v1 - 0.1 * U, zp + 4, H - 7, RW[3], 0);
    { const vc = (v0 + v1) / 2, zc = Math.round(H * 0.62), [sx, sy] = K.P(u1, vc, zc), [ex, ey] = K.P(u1 + 0.24 * U, vc, zc);
      T.disc(sx, sy, 2.2, BRASS[2], 2.6); T.line(sx, sy, ex, ey, BRASS[1]); T.line(sx, sy + 1, ex, ey + 1, BRASS[3]);
      T.line(ex, ey, ex, ey + Math.round(t * 0.22), BRASS[2]); T.ball(ex + 1, ey + Math.round(t * 0.22) + 1, 1.8, RW[0], RW[1], RW[3]); }
    // the crest: a broken pediment in rosewood edged in brass, a rose crystal in the middle
    { const c0 = u0 + 0.06 * U, c1 = u1 - 0.06 * U, ch = Math.round(t * 0.28), vf = v1 - 0.08 * U;
      for (const [a, b, up] of [[c0, c0 + (c1 - c0) * 0.36, 1], [c1 - (c1 - c0) * 0.36, c1, -1]]) {
        const z = u => H + Math.round(ch * (up > 0 ? (u - a) / (b - a) : (b - u) / (b - a)));
        for (let u = a; u <= b; u += 0.5) { K.seg([u, vf, H], [u, vf, z(u)], RW[2]); K.dot(u, vf, z(u), BRASS[1]); K.dot(u, vf, z(u) - 1, RW[1]); }
      }
      const [gx, gy] = K.P((c0 + c1) / 2, vf, H);
      T.ball(gx, gy - 2, 2.6, BRASS[0], BRASS[1], BRASS[3], 2);
      bedCrystal(T, gx, gy - 3, Math.max(5, t * 0.3), Math.max(2, t * 0.08), 0, [IC.white, IC.p0, IC.p1, IC.p1, IC.p2, IC.p3]); }
    if (!o.quiet) { const [gx, gy] = K.P(uc, v1, dz); T.glow(gx, gy, t * 0.85, IC.y0, 0.28); }
    decoGloss(T, ...K.P(u0 + 0.1 * U, v1, H - 2), 2);
  },
  shelf(t, T, ax, ay, o = {}) {
    // a thick oak plank with a moulded front edge on two scrolled brass brackets, along the wall, moss trailing off one end
    // with a glowcap in it; on it stand up to three geodes cut in half: a round stone shell shaded like a ball, and inside it
    // rings of crystal, dark at the rim and bright in the middle, with a glint
    const len = t * 0.68, dep = t * 0.24, th = Math.max(3, Math.round(t * 0.1));
    const at = (du, dv, up = 0) => [ax + 2 * du - 2 * dv, ay + du + dv - up];
    for (const k of [0.18, 0.82]) {
      // an L of brass against the wall, a scroll curling in its corner
      const [bx, by] = at(len * k, dep * 0.15, -1), d = Math.round(t * 0.24), w = Math.round(dep * 1.6);
      for (let j = 0; j < d; j++) { T.px(bx, by + j, BRASS[2]); T.px(bx + 1, by + j, BRASS[3]); }
      for (let j = 0; j <= w; j++) T.px(bx + j, by - j * 0.5, BRASS[1]);
      for (let a = 0; a < 7; a++) T.px(bx + 2 + Math.round(Math.cos(a * 0.9) * 2), by + 4 - Math.round(Math.sin(a * 0.9) * 2), a < 4 ? BRASS[1] : BRASS[2]);
      T.px(bx, by, IC.white);
    }
    T.box(...at(0, 0, 0), len, dep, th, IC.w1, IC.w1, IC.w2);
    for (let k = 0; k <= len * 2; k++) { const [x, y] = at(k / 2, dep, th - 1); T.px(x, y, IC.w0); const [x2, y2] = at(k / 2, dep, 0); T.px(x2, y2 + 1, IC.w3); }
    { const [mx, my] = at(len * 0.97, dep * 0.5, th); decoMoss(T, mx, my, t * 0.09, t * 0.06); for (let k = 0; k < 4; k++) T.px(mx + 3 + (k & 1), my + 2 + k + th, BED_MOSS[k > 2 ? 3 : 2]); }
    const gems = o.gems && o.gems.length ? o.gems : [[IC.l0, IC.l2, IC.l4], [IC.b0, IC.b1, IC.b3], [IC.p0, IC.p1, IC.p3]];
    gems.slice(0, 3).forEach(([c0, c1, c2], i) => {
      const r = Math.max(4, t * (i === 1 ? 0.24 : 0.19)), ry = r * 1.12, [cx, cy] = at(len * (0.2 + i * 0.3), dep * 0.5, th + ry * 0.92);
      halfGeode(T, cx, cy, r, ry, [c0, c1, c2], o.spark !== undefined && Math.abs(o.spark - i) < 0.5);
    });
  },
  keepjar(t, T, ax, ay, o = {}) {
    // a squat glass jar with twine round its neck, holding what you've brought home from walks: feathers at the back,
    // tall and leaning out, flowers in front, each drawn as the one it is; once it's full, pressed petals rise inside.
    // (the Chest's picture, drawn with nothing to go on, shows a little posy)
    const v = o.stems ? o : { stems: ["jay", "down", "heather", "daisy", "rose"], petals: 1 };
    const cx = ax, cy = ay + t / 2, rx = Math.max(4, Math.round(t * 0.34)), hj = Math.max(5, Math.round(t * 0.36)), top = cy - hj;
    const glass = [IC.ink2, pxHex("#2e1d4f"), pxHex("#3d2866")], n = v.stems.length;
    // where each stem stands in the mouth and which way it leans: spread in a fan, the same every time
    // (feathers and flowers each fan out across the whole mouth: the feathers behind, the flowers in front of them)
    const stems = v.stems.map((id, i) => {
      const same = v.stems.filter(x => KS[x].kind === KS[id].kind), m = same.length, at = v.stems.slice(0, i).filter(x => KS[x].kind === KS[id].kind).length;
      const k = m > 1 ? (at / (m - 1) - 0.5) * (KS[id].kind === "feather" ? 1 : 0.8) : (KS[id].kind === "feather" ? -0.12 : 0.15), j = pxHash(i * 7 + 3, n) - 0.5;
      return { id, ks: KS[id], bx: cx + Math.round(k * (rx - 1) * 1.7), a: k * 1.6 + j * 0.3, len: (KS[id].kind === "feather" ? 0.72 : 0.42) * t * (0.85 + 0.3 * pxHash(i, 11)) };
    });
    // the glass: dark, so what's in it shows through, dimmer than out in the air
    T.cyl(cx, cy, rx, hj, glass[2], glass[1], glass[0]);
    stems.forEach((st, i) => { if (i % 2 === 0) for (let y = cy - 2; y > top; y--) T.px(st.bx + Math.round((cy - y) / hj * Math.sin(st.a) * 1.5), y, st.ks.kind === "feather" ? IC.l4 : IC.g3); });
    // the pressed petals at the bottom, in the colours of the flowers you found
    const pal = stems.filter(st => st.ks.kind === "flower").map(st => pxHex(st.ks.c[1]));
    for (let r = 0; r < v.petals * Math.max(1, Math.round(hj / 6)); r++) for (let x = cx - rx + 1; x <= cx + rx - 1; x++) if (pxHash(x, r + 5) > 0.25) T.px(x, cy - 1 - r + Math.round(Math.abs(x - cx) / rx), pal.length ? pal[Math.floor(pxHash(x * 3, r) * pal.length)] : IC.p1);
    // glints on the glass, the rim of the mouth and the twine
    for (let y = cy - 2; y > top + 2; y--) { T.px(cx - rx + 1, y, y % 3 ? IC.b1 : IC.b0); if (y < cy - 3 && y > top + 4) T.px(cx - rx + 2, y, IC.b2); }
    T.disc(cx, top, rx, IC.b1); T.disc(cx, top, rx - 1, IC.ink2);
    for (let x = cx - rx; x <= cx + rx; x++) T.px(x, top + 2 + Math.round(Math.abs(x - cx) / rx * 0.6), x % 2 ? IC.w1 : IC.w0);
    // and what's in it, out in the air: feathers first (they stand at the back), then the flowers
    for (const st of stems) {
      const c = st.ks.c.map(pxHex), x0 = st.bx, y0 = top - 1;
      // (each one bends outward a little toward its tip, the way a bunch in a jar falls open)
      const bend = (s, L) => { const a = st.a * (1 + 0.35 * s / L); return [Math.sin(a), -Math.cos(a)]; };
      let [dx, dy] = bend(0, 1);
      if (st.ks.kind === "feather") {
        // a quill with a vane on each side, widest past the middle: lit on the left, shaded on the right; the jay's has bars,
        // the down is short and fluffy, the raven's catches a violet sheen along its spine
        const soft = st.id === "down", L = soft ? st.len * 0.6 : st.len, W = Math.max(1.6, t * (soft ? 0.15 : 0.12));
        let x = x0, y = y0;
        for (let s = 0; s <= L; s += 0.5) {
          [dx, dy] = bend(s, L); x += dx * 0.5; y += dy * 0.5;
          // (bare quill at the bottom, the vane widest a little past it, then narrowing to a point)
          const f = s / L, g = (f - 0.15) / 0.85, wv = g <= 0 ? 0 : W * Math.pow(Math.sin(Math.PI * (g < 0.35 ? g / 0.35 * 0.5 : 0.5 + (g - 0.35) / 0.65 * 0.5)), 0.7);
          for (let q = -Math.ceil(wv); q <= Math.ceil(wv); q++) {
            if (Math.abs(q) > wv + (soft ? pxHash(Math.round(s * 2), q + 9) * 0.8 : 0)) continue;
            const px = x - dy * q, py = y + dx * q * 0.6;
            let col = q === 0 ? c[3] : Math.abs(q) >= Math.ceil(wv) ? c[0] : q < 0 ? c[2] : c[1];
            if (st.id === "jay" && q !== 0 && Math.floor(s) % 3 === 0 && f > 0.3) col = IC.ink;
            if (st.id === "raven" && q === -1) col = c[3];
            T.px(px, py, col);
          }
          if (wv === 0) T.px(x, y, IC.s0);
        }
        continue;
      }
      // a flower on its stem: the daisy white with a gold eye, the rose pink and round, the harebell nodding, the heather in tiny bells up the stem
      const L = st.len;
      let hx = x0, hy = y0;
      for (let s = 0; s < L; s += 0.5) { [dx, dy] = bend(s, L); hx += dx * 0.5; hy += dy * 0.5; T.px(hx, hy, s < L * 0.5 ? IC.g2 : IC.g1); }
      if (st.id === "heather") {
        for (let s = L * 0.35, k = 0; s <= L; s += 1.5, k++) { const side = k % 2 ? 1 : -1, f = s / L; T.px(x0 + (hx - x0) * f + side, y0 + (hy - y0) * f, f > 0.8 ? c[3] : k % 3 ? c[2] : c[1]); }
        T.px(hx, hy - 1, c[3]);
      } else if (st.id === "harebell") {
        // nodding: the bell hangs off the tip, opening downward
        const bx = Math.round(hx + (dx >= 0 ? 1 : -1)), by = Math.round(hy);
        T.px(bx - 1, by + 1, c[2]); T.px(bx, by + 1, c[1]); T.px(bx + 1, by + 1, c[1]);
        T.px(bx - 1, by + 2, c[2]); T.px(bx, by + 2, c[2]); T.px(bx + 1, by + 2, c[0]); T.px(bx, by, c[3]);
        T.px(bx - 1, by + 3, c[3]); T.px(bx + 1, by + 3, c[3]);
      } else {
        const r = Math.max(1.6, t * (st.id === "rose" ? 0.12 : 0.11));
        if (st.id === "daisy") { for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0]]) T.px(hx + ox * r * 0.8, hy + oy * r * 0.6, ox < 0 || oy < 0 ? c[2] : c[1]); T.px(hx, hy, c[3]); }
        else { T.ball(hx, hy, r, c[2], c[1], c[0], r * 0.85); T.px(hx, hy, c[3]); }
      }
    }
  },
  bowl(t, T, ax, ay, o = {}) {
    // a feeding bowl of glazed stoneware, wide and low on a little turned foot: a lilac glaze lit from the top left, a cream
    // band round its belly dotted with stars, a rolled rim, and inside, heaped as high as it's full, the snacks you put in,
    // each drawn as itself: cookies with their chips, moonberries, dewdrops, starfruit, glowcaps. Empty, it shows its hollow.
    // (the Chest's picture, drawn with nothing to go on, is a full one)
    const food = o.food !== undefined ? o.food.split(",").filter(Boolean) : ["cookie", "berry", "dew", "berry", "cookie", "star"];
    const U = t / 2, K = isoKit(T, ax, ay), [x, y] = K.P(0.5 * U, 0.5 * U, 0), R = Math.max(5, t * 0.46), h = Math.max(4, Math.round(t * 0.3)), hf = Math.max(1, Math.round(t * 0.06)), zb = Math.round(hf + (h - hf) * 0.5);
    isoLathe(T, x, y, 0, hf, () => R * 0.55, BOWL_GLAZE, { lid: false });
    isoLathe(T, x, y, hf + 1, h, z => R * (0.7 + 0.3 * Math.sin((z - hf) / (h - hf) * Math.PI / 2)), BOWL_GLAZE, { lid: false,
      band: (k, xx, yy, z) => z === zb || z === zb + 1 ? ((xx + z) % 4 === 0 && z === zb ? 2 : k > 3 ? 1 : 5) : k });
    decoGloss(T, x - R * 0.72, y - h * 0.72, 1);
    // the rolled rim and the hollow inside, its far side in shadow under the rim
    T.disc(x, y - h, R + 0.4, (xx, yy) => xx < x - R * 0.3 ? BOWL_GLAZE[0] : BOWL_GLAZE[1]);
    const ri = R - Math.max(1.2, t * 0.06);
    T.disc(x, y - h, ri, (xx, yy) => yy < y - h - ri * 0.15 ? IC.ink2 : xx > x + ri * 0.3 ? BOWL_GLAZE[3] : BOWL_GLAZE[4]);
    // the snacks, heaped: the more there are, the higher the heap, the back ones first
    const s2 = Math.max(1.6, t * 0.1), SLOTS = [[-0.42, 0.12, 0], [0.38, 0.14, 0], [0, 0.3, 0], [-0.12, -0.2, 1], [0.3, -0.18, 1], [0.02, 0.02, 2]];
    food.slice(0, 6).map((id, k) => [id, SLOTS[k]]).sort((p, q) => p[1][1] - q[1][1] || p[1][2] - q[1][2]).forEach(([id, [du, dv, lift]]) => {
      const cx = x + du * ri * 1.3, cy = y - h + dv * ri * 0.6 - lift * s2 * 0.8 + s2 * 0.4;
      if (id === "cookie") { T.disc(cx, cy, s2 * 1.15, (xx) => xx < cx ? IC.w0 : IC.w1, s2 * 0.7); T.px(cx - 1, cy, IC.w3); T.px(cx + 1, cy - 1, IC.w3); T.px(cx, cy + 1, IC.w2); }
      else if (id === "berry") { T.ball(cx, cy - s2 * 0.5, s2 * 0.85, IC.l1, IC.l3, IC.l4); T.px(cx - s2 * 0.3, cy - s2 * 0.9, IC.white); }
      else if (id === "dew") { T.ball(cx, cy - s2 * 0.5, s2 * 0.8, IC.b0, IC.b1, IC.b2); T.px(cx, cy - s2 * 1.4, IC.b1); T.px(cx - s2 * 0.3, cy - s2 * 0.8, IC.white); }
      else if (id === "star") { for (const [ox, oy, c] of [[0, -2, IC.y0], [-1, -1, IC.y0], [0, -1, IC.white], [1, -1, IC.y1], [-2, 0, IC.y0], [-1, 0, IC.y0], [0, 0, IC.y1], [1, 0, IC.y1], [2, 0, IC.y1], [-1, 1, IC.y1], [1, 1, IC.w1]]) T.px(cx + ox, cy - s2 * 0.4 + oy, c); }
      else if (id === "glowcap") bedGlowcap(T, cx, cy, Math.max(2, Math.round(s2 * 1.1)), s2 * 0.95);
      else T.ball(cx, cy - s2 * 0.4, s2 * 0.8, IC.y0, IC.w1, IC.w2);
    });
  },
  chest(t, T, ax, ay) {
    // a toy chest like a little steamer trunk: oak boards, a domed lid painted rose, brass straps running up the front and
    // over the dome, brass corners, a hasp with a keyhole, a painted gold star; a striped ball rolled up against its end
    const U = t / 2, K = isoKit(T, ax, ay), u0 = 0.06 * U, u1 = 0.94 * U, v0 = 0.22 * U, v1 = 0.86 * U, zb = Math.round(t * 0.46), Rz = Math.round(t * 0.2);
    const vm = (v0 + v1) / 2, hv = (v1 - v0) / 2, sw = 0.09 * U, straps = [u0 + 0.16 * (u1 - u0), u1 - 0.16 * (u1 - u0) - sw];
    K.box(u0 + 0.03 * U, v0 + 0.03 * U, 0, u1 - u0 - 0.06 * U, v1 - v0 - 0.06 * U, 2, IC.w3, IC.w3, IC.ink2, false);
    K.box(u0, v0, 2, u1 - u0, v1 - v0, zb - 2, IC.w1, IC.w2, IC.w3);
    // a dark rim where the lid sits
    K.faceV(v1, u0, u1, zb - 2, zb, IC.w3, 1); K.faceU(u1, v0, v1, zb - 2, zb, IC.ink2, 2);
    // the dome, slice by slice: its front face rounding over from shade into light
    for (let z = 0; z <= Rz; z++) {
      const k = Math.sqrt(Math.max(0, 1 - (z / Rz) ** 2)), f = z / Rz, R = BED_ROSE;
      const front = R[1 + bedBand(f * 1.4 - 0.5, [0.5, 0.05, -0.35], z, z)], side = R[Math.min(4, 2 + bedBand(f - 0.4, [0.2], z, z))];
      K.box(u0, vm - hv * k, zb + z, u1 - u0, 2 * hv * k, 1, R[0], front, side, false);
      for (const su of straps) K.box(su, vm - hv * k - 0.02 * U, zb + z, sw, 2 * hv * k + 0.04 * U, 1, BRASS[1], z < Rz * 0.5 ? BRASS[2] : BRASS[1], BRASS[3], false);
    }
    { const [gx, gy] = K.P(straps[0] + sw * 0.3, vm + hv * 0.6, zb + Rz * 0.8); decoGlint(T, gx, gy, 2); }
    // the straps down the front, with rivets, and brass corners
    for (const su of straps) { K.faceV(v1 + 0.02 * U, su, su + sw, 2, zb, BRASS[2], 0); K.faceV(v1 + 0.02 * U, su, su + sw * 0.4, 2, zb, BRASS[1], 0); for (const z of [4, zb - 3]) K.dot(su + sw * 0.5, v1 + 0.02 * U, z, BRASS[0]); }
    for (const z of [2, zb - 1]) { K.seg([u1 - 0.12 * U, v1, z], [u1, v1, z], BRASS[1]); K.seg([u1, v1, z], [u1, v1 - 0.12 * U, z], BRASS[3]); K.seg([u0, v1, z], [u0 + 0.12 * U, v1, z], BRASS[1]); }
    // the hasp and its keyhole, and a gold star painted between the straps
    { const um = (u0 + u1) / 2; K.quad([[um - 0.07 * U, v1 + 0.03 * U, zb + 2], [um + 0.07 * U, v1 + 0.03 * U, zb + 2], [um + 0.07 * U, v1 + 0.03 * U, zb - 5], [um - 0.07 * U, v1 + 0.03 * U, zb - 5]], BRASS[1], 0);
      K.dot(um, v1 + 0.03 * U, zb - 2, IC.ink); K.dot(um, v1 + 0.03 * U, zb - 3, IC.ink); K.dot(um - 0.5, v1 + 0.03 * U, zb + 1, BRASS[0]);
      for (const [du, dz, c] of [[0, 0, IC.y0], [-0.5, 0, IC.y1], [0.5, 0, IC.y1], [0, 1, IC.y0], [0, -1, IC.y1], [-1, -1, IC.y1], [1, -1, IC.y1]]) K.dot(um + du, v1, Math.round(zb * 0.42) + dz, c); }
    // the ball, rolled up against the near end
    { const [bx, by] = K.P(u1 + 0.02 * U, v1 - 0.1 * U, 0), r = t * 0.15;
      T.disc(bx, by - r, r, (xx, yy) => { const dx = (xx + 0.5 - bx) / r, dy = (yy + 0.5 - by + r) / r, lit = -dx * 0.6 - dy * 0.75, s = Math.floor((dx * 0.8 + dy * 0.5 + 2) * 2.2) % 2; return (s ? [IC.white, IC.s0, IC.s1] : [IC.r1, IC.r2, IC.r3])[bedBand(lit, [0.35, -0.35], xx, yy)]; }, r);
      T.px(bx - r * 0.45, by - r * 1.5, IC.white); }
  },
  plant(t, T, ax, ay) {
    // a crystal plant: a fat glazed pot with a rolled lip, moss over the soil, a rosette of fleshy leaves curling up, and out
    // of its heart a cluster of aqua crystal points growing like new shoots, glowing a little, one bud of light among them
    const U = t / 2, K = isoKit(T, ax, ay), [x, y] = K.P(0.5 * U, 0.5 * U, 0), ph = Math.round(t * 0.46), pr = t * 0.28;
    const G = [IC.l1, IC.l2, IC.l3, IC.l4, IC.ink2];
    isoLathe(T, x, y, 0, ph - 3, z => pr * (0.78 + 0.22 * Math.sin(Math.min(1, z / ph * 1.6) * Math.PI / 2)), G, { lid: false, band: (k, xx, yy, z) => z === Math.round(ph * 0.3) ? Math.min(4, k + 1) : k });
    isoLathe(T, x, y, ph - 3, ph, () => pr + 1.2, [IC.l0, IC.l1, IC.l1, IC.l2, IC.l3], { lid: false });
    T.disc(x, y - ph, pr, IC.ink2); T.disc(x, y - ph + 0.5, pr - 1, IC.w3);
    decoGloss(T, x - pr * 0.6, y - ph * 0.55, 1);
    // the rosette: fleshy pointed leaves, lit on one side of the midrib, curling up at the tip
    const top = y - ph - 1;
    const leaf = (an, len, wid, lift, curl, light, dark) => {
      const dx = Math.cos(an), dy = Math.sin(an) * 0.5, px = -Math.sin(an), py = Math.cos(an) * 0.5;
      const bx = x, by = top - lift, tx = bx + dx * len, ty = by + dy * len - curl, mx = bx + dx * len * 0.55, my = by + dy * len * 0.55 - curl * 0.3;
      T.poly([[bx, by], [mx + px * wid, my + py * wid], [tx, ty], [mx - px * wid, my - py * wid]], (xx, yy) => ((xx - bx) * (ty - by) - (yy - by) * (tx - bx)) * (dx > 0 ? 1 : -1) > 0 ? dark : light);
      T.px(tx, ty, BED_MOSS[0]);
    };
    const ring = (n, len, wid, lift, curl, light, dark, turn) => { for (const an of Array.from({ length: n }, (_, k) => k / n * TAU + turn).sort((p, q) => Math.sin(p) - Math.sin(q))) if (Math.sin(an) < 0.2) leaf(an, len, wid, lift, curl, light, dark); };
    ring(8, t * 0.5, t * 0.15, 0, t * 0.08, BED_MOSS[2], BED_MOSS[3], 0.2);
    ring(6, t * 0.36, t * 0.13, t * 0.06, t * 0.14, BED_MOSS[1], BED_MOSS[2], 0.7);
    // the crystal shoots, tallest at the back, glowing softly
    T.glow(x, top - t * 0.45, t * 0.75, DECO_AQUA[4], 0.3);
    for (const [dx, h, w, lean] of [[-0.12, 0.62, 0.075, -0.12], [0.1, 0.82, 0.085, 0.08], [0.24, 0.46, 0.06, 0.18], [-0.26, 0.4, 0.055, -0.2], [0.0, 0.56, 0.07, 0.02]]) bedCrystal(T, x + dx * t, top - t * 0.04, t * h, Math.max(1.5, t * w), lean * t, DECO_AQUA);
    // and the front leaves, over the shoots' feet
    const front = (n, len, wid, lift, curl, light, dark, turn) => { for (const an of Array.from({ length: n }, (_, k) => k / n * TAU + turn).sort((p, q) => Math.sin(p) - Math.sin(q))) if (Math.sin(an) >= 0.2) leaf(an, len, wid, lift, curl, light, dark); };
    front(8, t * 0.5, t * 0.15, 0, t * 0.08, BED_MOSS[1], BED_MOSS[2], 0.2);
    front(6, t * 0.36, t * 0.13, t * 0.06, t * 0.14, BED_MOSS[0], BED_MOSS[1], 0.7);
    T.ball(x + t * 0.04, top - t * 0.3, Math.max(1.5, t * 0.07), IC.white, DECO_AQUA[1], DECO_AQUA[3]);
  },
  // ---- the grotto's hall, before the tunnel
  tunnel(t, T, ax, ay) {
    // the way down: a mine adit driven into an outcrop of rock, its mouth framed in heavy timbers (two posts, a cap, braces in
    // the corners), the dark going back and back, rails on sleepers running out of it with a cart of crystals at the mouth,
    // a lantern on the cap, crystals growing at both sides
    const U = t / 2, K = isoKit(T, ax, ay), ROCK = ["#7a6a9a", "#55477a", "#3a2e5a", "#241a3c", "#150e26"].map(pxHex);
    const vm = 0.42 * U, pu0 = 0.62 * U, pu1 = 1.38 * U, ph = Math.round(t * 1.45);
    // the outcrop: boulders heaped against the wall, shaded from the top left, darkest in their cracks
    const boulder = (u, v, z, r, k) => { const [x, y] = K.P(u, v, z); T.ball(x, y + 0.8, r + 1, ROCK[4], ROCK[4], ROCK[4], r * 0.7 + 1); T.ball(x, y, r, ROCK[k ? 1 : 0], ROCK[2], ROCK[3], r * 0.7); T.line(x - r * 0.5, y - r * 0.5, x - r * 0.1, y - r * 0.6, ROCK[0]); T.line(x + r * 0.2, y - r * 0.1, x + r * 0.5, y + r * 0.3, ROCK[4]); };
    const rocks = [];
    for (let k = 0; k < 22; k++) { const f = pxHash(k, 5), side = f < 0.5 ? 0.1 + f * 0.9 : 1.45 + (f - 0.5) * 1.0, top = pxHash(k, 6) > 0.55;
      rocks.push(top ? [0.35 * U + pxHash(k, 7) * 1.3 * U, 0.12 * U + pxHash(k, 8) * 0.2 * U, ph - 2 + pxHash(k, 9) * t * 0.5, U * (0.32 + 0.2 * pxHash(k, 10)) * 2, k % 3] : [side * U, 0.1 * U + pxHash(k, 8) * 0.28 * U, pxHash(k, 9) * ph * 0.9, U * (0.3 + 0.22 * pxHash(k, 10)) * 2, k % 3]); }
    rocks.sort((p, q) => p[1] + p[0] * 0.2 - q[1] - q[0] * 0.2 || p[2] - q[2]).forEach(r => boulder(...r));
    // the mouth: dark going back, a little light on its floor
    K.faceV(vm, pu0, pu1, 0, ph, ROCK[4], 0);
    K.faceV(vm - 0.2 * U, pu0 + 0.14 * U, pu1 - 0.14 * U, 0, ph * 0.75, IC.ink, 0);
    K.flat(pu0, vm - 0.3 * U, pu1, vm, 0, IC.ink2, 0);
    // rails on sleepers, from inside out over the floor
    for (let k = 0; k < 6; k++) { const v = vm - 0.25 * U + k * 0.22 * U; K.box(pu0 + 0.08 * U, v, 0, pu1 - pu0 - 0.16 * U, 0.08 * U, 1, IC.w2, IC.w2, IC.w3, false); }
    for (const u of [pu0 + 0.2 * U, pu1 - 0.2 * U]) { K.seg([u, vm - 0.3 * U, 1], [u, vm + 1.1 * U, 1], IC.m2); K.seg([u - 0.5, vm - 0.3 * U, 2], [u - 0.5, vm + 1.1 * U, 2], IC.m0); }
    // the frame: posts, a cap across them, braces in the top corners
    for (const u of [pu0 - 0.12 * U, pu1]) K.box(u, vm - 0.05 * U, 0, 0.12 * U, 0.14 * U, ph, IC.w1, IC.w2, IC.w3);
    K.box(pu0 - 0.2 * U, vm - 0.06 * U, ph, pu1 - pu0 + 0.4 * U, 0.16 * U, 4, IC.w1, IC.w2, IC.w3);
    K.seg([pu0, vm + 0.09 * U, ph - 8], [pu0 + 0.16 * U, vm + 0.09 * U, ph], IC.w2); K.seg([pu1, vm + 0.09 * U, ph - 8], [pu1 - 0.16 * U, vm + 0.09 * U, ph], IC.w3);
    // the lantern on its nail
    { const [x, y] = K.P((pu0 + pu1) / 2, vm + 0.1 * U, ph - 2); T.glow(x, y + 6, t * 1.1, IC.y0, 0.45); T.line(x, y, x, y + 2, IC.m3); T.poly([[x - 2, y + 3], [x + 2, y + 3], [x + 2, y + 8], [x - 2, y + 8]], IC.y1); T.px(x - 1, y + 4, IC.y0); T.px(x - 1, y + 5, IC.white); T.line(x - 3, y + 3, x + 3, y + 3, IC.m3); T.line(x - 2, y + 9, x + 2, y + 9, IC.m3); }
    // the cart at the mouth, full of crystals
    { const cu = (pu0 + pu1) / 2 - 0.3 * U, cv = vm + 0.35 * U, cz = 3;
      for (const [u, v] of [[cu + 0.1 * U, cv + 0.05 * U], [cu + 0.5 * U, cv + 0.05 * U], [cu + 0.1 * U, cv + 0.4 * U], [cu + 0.5 * U, cv + 0.4 * U]]) { const [x, y] = K.P(u, v, 2); T.disc(x, y, 2.2, IC.m3, 1.6); T.px(x - 1, y - 1, IC.m1); }
      K.box(cu, cv, cz, 0.6 * U, 0.45 * U, Math.round(t * 0.4), IC.ink2, IC.m2, IC.m3);
      K.faceV(cv + 0.45 * U, cu, cu + 0.6 * U, cz + Math.round(t * 0.4) - 1, cz + Math.round(t * 0.4), IC.m0, 0);
      for (let k = 0; k < 7; k++) { const [x, y] = K.P(cu + (0.1 + (k % 4) * 0.14) * U, cv + (0.12 + Math.floor(k / 4) * 0.2) * U, cz + Math.round(t * 0.4)); const hh = 3 + (k * 7) % 5; T.poly([[x - 2, y], [x, y - hh], [x + 2, y]], k % 2 ? IC.l1 : IC.l2); T.line(x - 1, y - 1, x, y - hh + 1, IC.l0); } }
    // crystals at both sides of the mouth: prisms, a lit facet and a shaded one, a pale tip
    for (const [u, v, n] of [[pu0 - 0.32 * U, vm + 0.15 * U, 4], [pu1 + 0.3 * U, vm + 0.2 * U, 3]]) for (let k = 0; k < n; k++) {
      const [x, y] = K.P(u + (k - n / 2) * 0.1 * U, v + (k % 2) * 0.08 * U, 0), hh = t * (0.35 + 0.35 * pxHash(k, u)), w = 2 + (k % 2), lean = (k - n / 2) * 1.2;
      T.poly([[x - w, y], [x + lean, y - hh], [x, y + 1]], IC.l1); T.poly([[x, y + 1], [x + lean, y - hh], [x + w, y]], IC.l3); T.line(x + lean, y - hh, x + lean * 0.5, y - hh * 0.5, IC.l0); T.px(x + lean, y - hh, IC.white);
    }
    // a signpost by the mouth, out on the right: a board nailed to a stake with an egg painted on it and an arrow pointing in
    { const su = pu1 + 0.48 * U, sv = vm + 0.24 * U, sz = Math.round(t * 0.9), bz0 = sz - Math.max(5, Math.round(t * 0.4)), bv = sv + 0.12 * U;
      K.box(su, sv, 0, 0.1 * U, 0.1 * U, sz + 2, IC.w1, IC.w2, IC.w3);
      K.faceV(bv, su - 0.36 * U, su + 0.4 * U, bz0, sz, IC.w3, 0);
      K.faceV(bv, su - 0.32 * U, su + 0.36 * U, bz0 + 1, sz - 1, IC.w1, 0);
      K.seg([su - 0.32 * U, bv, sz - 1], [su + 0.36 * U, bv, sz - 1], IC.w0);
      const [ex, ey] = K.P(su - 0.14 * U, bv, (bz0 + sz) / 2);
      T.px(ex, ey - 2, IC.white); T.px(ex - 1, ey - 1, IC.white); T.px(ex, ey - 1, IC.l0); T.px(ex + 1, ey - 1, IC.l1); T.px(ex - 1, ey, IC.l0); T.px(ex, ey, IC.l1); T.px(ex + 1, ey, IC.l2); T.px(ex, ey + 1, IC.l2);
      const [rx, ry] = K.P(su + 0.2 * U, bv, (bz0 + sz) / 2);
      T.line(rx + 2, ry, rx - 2, ry + 2, IC.r2); T.px(rx - 2, ry + 1, IC.r2); T.px(rx - 1, ry + 2, IC.r2);
      for (const nu of [su - 0.26 * U, su + 0.3 * U]) K.dot(nu, bv, sz - 2, IC.m3); }
  },
  altar(t, T, ax, ay, o) {
    // a carved stone pedestal: a stepped plinth, a fluted shaft with a crescent cut in it, a capital, a shallow bowl on top;
    // today's moon egg rests in the bowl, glowing, until you've opened it
    const U = t / 2, K = isoKit(T, ax, ay), c = 0.5 * U, [x, y] = K.P(c, c, 0);
    K.box(c - 0.38 * U, c - 0.38 * U, 0, 0.76 * U, 0.76 * U, 4, IC.s1, IC.s2, IC.s3);
    K.box(c - 0.3 * U, c - 0.3 * U, 4, 0.6 * U, 0.6 * U, 3, IC.s0, IC.s1, IC.s2);
    const sz = Math.round(t * 0.8);
    K.box(c - 0.18 * U, c - 0.18 * U, 7, 0.36 * U, 0.36 * U, sz, IC.s0, IC.s1, IC.s2);
    for (const f of [0.25, 0.5, 0.75]) { K.seg([c - 0.18 * U + 0.36 * U * f, c + 0.18 * U, 9], [c - 0.18 * U + 0.36 * U * f, c + 0.18 * U, 5 + sz], IC.s2); K.seg([c + 0.18 * U, c - 0.18 * U + 0.36 * U * f, 9], [c + 0.18 * U, c - 0.18 * U + 0.36 * U * f, 5 + sz], IC.s3); }
    { const [mx, my] = K.P(c, c + 0.18 * U, 7 + sz * 0.55); for (let k = 0; k < 9; k++) { const an = -Math.PI / 2 + k / 8 * Math.PI; T.px(mx + Math.cos(an) * 2.5 - 1, my + Math.sin(an) * 3, IC.s3); } }
    K.box(c - 0.3 * U, c - 0.3 * U, 7 + sz, 0.6 * U, 0.6 * U, 3, IC.s0, IC.s1, IC.s2);
    const top = 10 + sz, [tx, ty] = K.P(c, c, top);
    T.disc(tx, ty - 1, U * 0.24 * 2.83, IC.s1); T.disc(tx, ty - 1.5, U * 0.18 * 2.83, IC.s3);
    if (!o.done) { T.glow(tx, ty - t * 0.35, t * 0.95, IC.b0, 0.45); T.ball(tx, ty - t * 0.32, t * 0.22, IC.white, IC.b0, IC.l2, t * 0.28); T.px(tx - 2, ty - t * 0.48, IC.white); T.px(tx - 2, ty - t * 0.44, IC.white); for (let k = 0; k < 4; k++) T.px(tx + 1 + k % 2, ty - t * 0.38 + k * 2, IC.l1); }
    else { T.ball(tx - 2, ty - 2, t * 0.12, IC.s0, IC.s1, IC.s2, t * 0.08); T.ball(tx + 3, ty - 1, t * 0.1, IC.s0, IC.s1, IC.s2, t * 0.07); }
    // the moon's cradle: a brass crescent rising out of the bowl, its horns either side of the egg (empty once it's opened)
    { const cy = ty - t * 0.3, rx = t * 0.3, ry = t * 0.32;
      for (let k = 0; k <= 28; k++) { const an = -0.18 * Math.PI + k / 28 * 1.36 * Math.PI, w = 1.6 * Math.sin(clamp((an + 0.18 * Math.PI) / (1.36 * Math.PI), 0, 1) * Math.PI);
        for (let d = 0; d <= w; d += 0.5) { const x = tx + Math.cos(an) * (rx + d), y = cy + Math.sin(an) * (ry + d); T.px(x, y, Math.cos(an) < -0.3 ? IC.y0 : Math.cos(an) > 0.4 ? IC.w2 : IC.y1); } }
      for (const sx of [-1, 1]) T.px(tx + sx * Math.cos(-0.18 * Math.PI) * rx, cy + Math.sin(-0.18 * Math.PI) * ry - 1, IC.y0); }
    // two candles on the floor before it, burning
    for (const [u, v, hh] of [[0.3 * U, 0.98 * U, Math.round(t * 0.42)], [0.98 * U, 0.3 * U, Math.round(t * 0.3)]]) {
      const [cx, cyy] = K.P(u, v, 0);
      T.disc(cx, cyy, 2.6, IC.s3, 1.3);
      for (let z = 0; z < hh; z++) { T.px(cx - 1, cyy - z, IC.s0); T.px(cx, cyy - z, IC.y0); T.px(cx + 1, cyy - z, IC.s1); }
      T.px(cx, cyy - hh, IC.ink2); T.px(cx - 1, cyy - hh + 1, IC.white);
      T.glow(cx, cyy - hh - 2, t * 0.55, IC.y0, 0.4);
      T.px(cx, cyy - hh - 1, IC.y1); T.px(cx, cyy - hh - 2, IC.y0); T.px(cx, cyy - hh - 3, IC.white); T.px(cx + 1, cyy - hh - 1, IC.r1);
    }
  },
  wickbench(t, T, ax, ay) {
    // the bench by the wall where Wick sits to tend the hall's lanterns: a worn plank on two trestles, set a little down the
    // wall from the map (it stops short of the crystal in the corner), and on a nail in the rock beyond it one of the
    // lanterns he keeps. He and the row of lanterns on the seat are drawn over it: see drawWick.
    const U = t / 2, K = isoKit(T, ax, ay), du = 0.5 * U, u0 = WICK_SEAT.u * U - du / 2, v0 = WICK_SEAT.v0 * U, dv = WICK_SEAT.len * U, hz = Math.round(t * WICK_SEAT.z);
    { const [x, y] = K.P(0.04 * U, 2.05 * U, Math.round(t * 2.05)); T.glow(x, y + 5, t * 0.6, IC.y0, 0.3); T.line(x, y - 2, x, y - 1, IC.m3); isoLantern(T, x - 3, y); }
    for (const v of [v0 + 0.18 * U, v0 + dv - 0.3 * U]) K.box(u0 + 0.06 * U, v, 0, du - 0.12 * U, 0.12 * U, hz - 2, IC.w2, IC.w2, IC.w3);
    K.box(u0, v0, hz - 2, du, dv, 2, IC.w1, IC.w2, IC.w3);
    K.seg([u0 + du / 2, v0 + 1, hz], [u0 + du / 2, v0 + dv - 1, hz], IC.w2);
  },
  halllamp(t, T, ax, ay) {
    // one of the hall's lanterns, hung on a nail in the rock of the right wall, about head height
    const U = t / 2, K = isoKit(T, ax, ay), [x, y] = K.P(0.5 * U, 0.04 * U, Math.round(t * 2.05));
    T.glow(x, y + 5, t * 0.6, IC.y0, 0.3); T.line(x, y - 2, x, y - 1, IC.m3); isoLantern(T, x - 3, y);
  },
  wallmap(t, T, ax, ay) {
    // the map of the levels pinned high on the wall: aged parchment darker at its edges with a curling corner, four caverns
    // inked in their crystals' colours, a red trail of stops winding down through them, a compass rose, iron nails
    const U = t / 2, K = isoKit(T, ax, ay), u = 0.05 * U, v0 = 0.12 * U, v1 = 1.88 * U, z0 = Math.round(t * 1.35), z1 = Math.round(t * 2.5);
    const at = (fv, fz) => K.P(u, v0 + (v1 - v0) * fv, z1 - (z1 - z0) * fz);
    const [x0, y0] = K.P(0, 0, 0), local = (px, py) => { const v = (x0 + 2 * u - px) / 2, z = y0 + u + v - py; return [(v - v0) / (v1 - v0), (z1 - z) / (z1 - z0)]; };
    const PARCH = ["#f4e6be", "#e2cc98", "#c8a86c", "#9a7a46"].map(pxHex);
    K.faceU(u, v0, v1, z0, z1, (px, py) => {
      const [fv, fz] = local(px + 0.5, py + 0.5), e = Math.min(fv, 1 - fv, fz * 0.6, (1 - fz) * 0.6);
      let k = e < 0.025 ? 3 : e < 0.06 ? 2 : pxFbm(px * 0.2, py * 0.2) > 0.62 ? 1 : 0;
      // the caverns: four inked shapes, one under the other, in their crystals' colours
      const bands = [[0.18, 0.25, IC.l1], [0.68, 0.38, IC.b0], [0.3, 0.58, IC.g0], [0.7, 0.8, IC.l2]];
      for (const [cv, cz, col] of bands) { const d = Math.hypot((fv - cv) / 0.2, (fz - cz) / 0.1) + 0.25 * pxNoise(fv * 9, fz * 9); if (d < 0.92) return pxHash(px, py) > 0.6 ? col : PARCH[k]; if (d < 1.05) return PARCH[3]; }
      return PARCH[k];
    }, 0);
    const stops = [[0.12, 0.12], [0.3, 0.3], [0.55, 0.28], [0.78, 0.42], [0.55, 0.55], [0.3, 0.6], [0.45, 0.78], [0.75, 0.86]];
    for (let k = 0; k + 1 < stops.length; k++) { const p = at(...stops[k]), q = at(...stops[k + 1]), n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 2); for (let j = 0; j <= n; j++) if (j % 2 === 0) T.px(p[0] + (q[0] - p[0]) * j / n, p[1] + (q[1] - p[1]) * j / n, IC.r2); }
    stops.forEach(([fv, fz], k) => { const [sx, sy] = at(fv, fz); T.px(sx, sy, k === stops.length - 1 ? IC.r1 : IC.r3); T.px(sx + 1, sy, IC.r2); T.px(sx, sy - 1, IC.r2); });
    { const [rx, ry] = at(0.88, 0.14); for (let k = -2; k <= 2; k++) { T.px(rx + k, ry - k * 0.5, IC.w3); T.px(rx + k * 0.5, ry + k, IC.w3); } T.px(rx, ry - 3, IC.r2); }
    // a corner curling forward, with its shadow; nails at the other corners
    { const [cx2, cy2] = at(1, 1); T.poly([[cx2, cy2], [cx2 + 6, cy2 - 3], [cx2 + 1, cy2 - 6]], PARCH[1]); T.line(cx2 + 6, cy2 - 3, cx2 + 1, cy2 - 6, PARCH[3]); }
    for (const [fv, fz] of [[0.02, 0.04], [0.98, 0.04], [0.02, 0.96]]) { const [nx, ny] = at(fv, fz); T.px(nx, ny, IC.m3); T.px(nx - 1, ny - 1, IC.m1); }
    // pins with round heads in the caverns along the trail, the last one gold; a red ribbon hanging from the bottom nail; a wax seal
    for (const [k, c0, c1] of [[0, IC.l0, IC.l2], [3, IC.b0, IC.b2], [5, IC.g0, IC.g2], [7, IC.y0, IC.w1]]) {
      const [px, py] = at(...stops[k]); T.px(px + 1, py + 1, PARCH[3]); T.px(px, py - 1, c0); T.px(px + 1, py - 1, c1); T.px(px, py - 2, c0); T.px(px + 1, py - 2, c0); T.px(px - 1, py - 2, c1); T.px(px, py - 3, c1);
    }
    { const [rx, ry] = at(0.04, 0.96), n = Math.round(t * 0.6);
      T.px(rx - 1, ry, IC.r1); T.px(rx + 1, ry, IC.r1); T.px(rx - 2, ry - 1, IC.r2); T.px(rx + 2, ry - 1, IC.r2); T.px(rx - 2, ry + 1, IC.r3); T.px(rx + 2, ry + 1, IC.r3); T.px(rx, ry, IC.r3);
      for (const d of [-1, 1]) { for (let k = 1; k <= n - (d > 0 ? 2 : 0); k++) T.px(rx + d * Math.round(k / 4), ry + k, d < 0 ? IC.r1 : IC.r2); const e = n - (d > 0 ? 2 : 0); T.px(rx + d * Math.round(e / 4) + d, ry + e + 1, IC.r3); } }
    { const [sx, sy] = at(0.82, 0.88); T.ball(sx, sy, 2.4, IC.r1, IC.r2, IC.r3); T.px(sx, sy, IC.r3); T.px(sx - 1, sy - 1, IC.p0); }
  },
  shrine(t, T, ax, ay, o) {
    // a festival's shrine, only while one is on: First Frost is a pillar of ice; others take their egg's colours
    if (!o.event) return;
    const cx = ax, cy = ay + t / 2, [c0, c1, c2] = o.colors.map(pxHex);
    T.cyl(cx, cy, t * 0.32, Math.round(t * 0.14), IC.s1, IC.s2, IC.s3);
    if (o.event === "frost") {
      T.glow(cx, cy - t * 0.7, t * 1.2, IC.b0, 0.35);
      for (const [dx, hh, w] of [[-t * 0.14, 1.15, 4], [t * 0.12, 0.85, 3], [0, 1.5, 4], [-t * 0.26, 0.6, 2]]) {
        const top = cy - t * 0.14 - t * hh;
        T.poly([[cx + dx - w, cy - t * 0.12], [cx + dx, top], [cx + dx, cy - t * 0.1]], IC.white); T.poly([[cx + dx, top], [cx + dx + w, cy - t * 0.12], [cx + dx, cy - t * 0.1]], IC.b0);
      }
      for (let k = 0; k < 6; k++) { const an = k / 6 * TAU; T.line(cx, cy - t * 1.9, cx + Math.cos(an) * 3, cy - t * 1.9 + Math.sin(an) * 3, IC.white); }
    } else {
      T.glow(cx, cy - t * 0.6, t * 1.1, c2, 0.35);
      T.ball(cx, cy - t * 0.55, t * 0.3, c2, c0, c1, t * 0.38);
      for (let k = 0; k < 5; k++) T.px(cx - t * 0.2 + k * t * 0.1, cy - t * 0.55 + (k % 2 ? 2 : -2), c1);
    }
  },
  // ---- the garden
  greenhouse(t, T, ax, ay) {
    // a glasshouse on a low brick wall: white-painted glazing bars, panes you see through to tomatoes on canes and pots on a
    // staging bench inside, the moon's light slanting across the glass, a pitched glass roof and a door in the gable
    const U = t / 2, K = isoKit(T, ax, ay), u0 = 0.06 * U, u1 = 1.94 * U, v0 = 0.08 * U, v1 = 1.9 * U, vm = (v0 + v1) / 2;
    const bz = Math.round(t * 0.32), ez = bz + Math.round(t * 1.0), rz = ez + Math.round(t * 0.6);
    const brick = side => (px, py) => { const yy = side ? py + px * 0.5 : py - px * 0.5, row = Math.floor(yy / 3), along = px + (((row % 2) + 2) % 2) * 3;
      return (((Math.floor(yy) % 3) + 3) % 3 === 0 || ((along % 6) + 6) % 6 === 0) ? IC.s2 : pxHash(Math.floor(along / 6), row) > 0.6 ? (side ? IC.r3 : IC.r2) : side ? IC.r3 : IC.r2; };
    const bar = IC.white, bar2 = IC.s1, through = (px, py) => (px + py) % 2 ? IC.g2 : py % 2 ? IC.b2 : IC.g3;
    // through the back glass: the garden behind, tinted
    K.box(u0, v0, 0, u1 - u0, v1 - v0, bz, IC.w3, brick(0), brick(1));
    K.faceV(v0, u0, u1, bz, ez, through, 0); K.quad([[u0, v0, bz], [u0, v1, bz], [u0, v1, ez], [u0, vm, rz], [u0, v0, ez]], through, 0);
    for (let k = 0; k <= 5; k++) K.seg([u0 + (u1 - u0) * k / 5, v0, bz], [u0 + (u1 - u0) * k / 5, v0, ez], bar2);
    for (let k = 0; k <= 4; k++) K.seg([u0, v0 + (v1 - v0) * k / 4, bz], [u0, v0 + (v1 - v0) * k / 4, k === 2 ? rz : ez], bar2);
    K.quad([[u0, v0, ez], [u1, v0, ez], [u1, vm, rz], [u0, vm, rz]], (px, py) => (px + py) % 2 ? IC.b1 : IC.b2, 0);
    for (let k = 0; k <= 5; k++) K.seg([u0 + (u1 - u0) * k / 5, v0, ez], [u0 + (u1 - u0) * k / 5, vm, rz], bar2);
    // inside: a staging bench of pots along the back, tomatoes on canes down one side, soil between
    K.flat(u0, v0, u1, v1, bz, (px, py) => pxHash(px, py) > 0.8 ? IC.w2 : IC.w3);
    const TERRA = ["#f0a070", "#c86a3c", "#8e4626"].map(pxHex);
    K.box(u0 + 0.1 * U, v0 + 0.05 * U, bz, u1 - u0 - 0.2 * U, 0.4 * U, Math.round(t * 0.4), IC.w1, IC.w2, IC.w3);
    for (let k = 0; k < 5; k++) { const u = u0 + 0.28 * U + k * 0.33 * U, z = bz + Math.round(t * 0.4); K.cyl(u, v0 + 0.25 * U, z, 0.1 * U, 4, TERRA[2], TERRA[0], TERRA[1]); const [x, y] = K.P(u, v0 + 0.25 * U, z + 4); for (let j = 0; j < 6; j++) T.px(x - 2 + j % 3 + (j > 2 ? 1 : 0), y - 1 - Math.floor(j / 2), [IC.g0, IC.g1, IC.g2][j % 3]); }
    for (let k = 0; k < 4; k++) {
      const u = u0 + 0.22 * U, v = v0 + 0.7 * U + k * 0.3 * U;
      K.seg([u, v, bz], [u, v, ez - 2], IC.w1);
      for (let j = 0; j < 14; j++) { const z = bz + 3 + j * (ez - bz - 6) / 14, [x, y] = K.P(u, v, z); T.px(x + (j % 3) - 1, y, [IC.g1, IC.g2, IC.g0][j % 3]); T.px(x + (j % 2 ? 2 : -2), y + 1, IC.g2); if (j % 5 === 3) { T.px(x + 1, y + 2, IC.r1); T.px(x + 2, y + 2, IC.r2); T.px(x + 1, y + 1, IC.p0); } }
    }
    // the near glass: bars, a pale tint, the light slanting across
    const glass = (px, py) => ((px - 2 * py) % 23 + 23) % 23 < 2 ? IC.b0 : ((px - 2 * py) % 23 + 23) % 23 === 2 ? IC.white : (px + py) % 6 === 0 && py % 3 === 0 ? IC.b0 : null;
    K.faceV(v1, u0, u1, bz, ez, glass, 0);
    K.quad([[u1, v0, bz], [u1, v1, bz], [u1, v1, ez], [u1, vm, rz], [u1, v0, ez]], (px, py) => glass(px, py) || ((px + py) % 3 === 0 ? IC.b1 : null), 0);
    for (let k = 0; k <= 4; k++) K.seg([u0 + (u1 - u0) * k / 4, v1, bz], [u0 + (u1 - u0) * k / 4, v1, ez], bar);
    K.seg([u0, v1, (bz + ez) / 2], [u1, v1, (bz + ez) / 2], bar);
    // the door in the gable: a frame, a handle, a brick step
    const dv0 = vm - 0.3 * U, dv1 = vm + 0.3 * U;
    for (const v of [v0, dv0, dv1, v1]) K.seg([u1, v, bz], [u1, v, v === v0 || v === v1 ? ez : ez + 2], bar2);
    K.seg([u1, dv0, ez + 2], [u1, dv1, ez + 2], bar2); K.seg([u1, v0, ez], [u1, vm, rz], bar2); K.seg([u1, vm, rz], [u1, v1, ez], bar2);
    K.dot(u1, dv1 - 0.08 * U, (bz + ez) / 2, IC.y1); K.box(u1, dv0, 0, 0.18 * U, dv1 - dv0, 3, IC.s1, IC.s2, IC.s3, false);
    // the roof's near slope: more bars, more light on the glass, a white ridge
    K.quad([[u0, vm, rz], [u1, vm, rz], [u1, v1, ez], [u0, v1, ez]], (px, py) => glass(px, py) || ((px + py) % 4 === 1 && py % 2 ? IC.b1 : null), 0);
    for (let k = 0; k <= 3; k++) K.seg([u0 + (u1 - u0) * k / 3, vm, rz], [u0 + (u1 - u0) * k / 3, v1, ez], bar);
    K.seg([u0, v1, ez], [u1, v1, ez], bar); K.seg([u0, vm, rz], [u1, vm, rz], bar); K.seg([u1, v1, bz], [u1, v1, ez], bar);
    K.box(u0 - 0.04 * U, vm - 0.04 * U, rz, u1 - u0 + 0.08 * U, 0.08 * U, 1, IC.white, IC.s0, IC.s1, false);
  },
  potting(t, T, ax, ay) {
    // a potting bench along the wall: legs and a slatted top, a backboard with a shelf; terracotta pots stacked and planted,
    // a seed tray, a trowel; a sack of compost underneath and a galvanised watering can on the ground in front
    const U = t / 2, K = isoKit(T, ax, ay), TERRA = ["#f0a070", "#c86a3c", "#8e4626", "#5e2c18"].map(pxHex);
    const u0 = 0.05 * U, u1 = 0.7 * U, v0 = 0.08 * U, v1 = 1.92 * U, h = Math.round(t * 1.15), lg = 0.09 * U;
    K.faceU(0.04 * U, v0, v1, h, h + Math.round(t * 0.75), IC.w2, 2);
    K.box(0.04 * U, v0, h + Math.round(t * 0.5), 0.22 * U, v1 - v0, 2, IC.w1, IC.w2, IC.w3, false);
    for (const v of [v0, v1 - lg]) K.box(u0, v, 0, lg, lg, h, IC.w1, IC.w2, IC.w3, false);
    { const [x, y] = K.P(u0 + 0.35 * U, 0.9 * U, 0); isoSack(T, x, y, U * 0.38, U * 0.8, { open: [IC.w3, IC.ink2, IC.w3] }); }
    for (const v of [v0, v1 - lg]) K.box(u1 - lg, v, 0, lg, lg, h - 2, IC.w1, IC.w2, IC.w3, false);
    K.box(u0, v0, h - 2, u1 - u0, v1 - v0, 2, IC.w1, IC.w2, IC.w3);
    const pot = (u, v, z, r, hz, plant) => {
      K.cyl(u, v, z, r * 0.8, hz, TERRA[3], TERRA[0], TERRA[2]); K.cyl(u, v, z + hz - 2, r, 2, TERRA[1], TERRA[0], TERRA[1]); K.ring(u, v, z + hz, r * 0.8, TERRA[3]);
      if (plant) { const [x, y] = K.P(u, v, z + hz); for (let j = 0; j < 9; j++) T.px(x - 3 + (j * 3) % 7, y - 1 - Math.floor(j / 3) - (j % 2), [IC.g0, IC.g1, IC.g2][j % 3]); }
    };
    // a stack of empty pots, three planted ones, a seed tray of seedlings, the trowel
    for (let k = 0; k < 3; k++) pot(0.38 * U, 0.3 * U, h + k * 3, 0.15 * U, 5, false);
    pot(0.36 * U, 0.75 * U, h, 0.14 * U, 6, true); pot(0.36 * U, 1.05 * U, h, 0.12 * U, 5, true);
    K.box(0.18 * U, 1.3 * U, h, 0.36 * U, 0.42 * U, 3, IC.w3, IC.w1, IC.w2, false);
    for (let k = 0; k < 8; k++) K.dot(0.24 * U + (k % 2) * 0.16 * U, 1.36 * U + Math.floor(k / 2) * 0.09 * U, h + 4, k % 3 ? IC.g0 : IC.g1);
    K.seg([0.55 * U, 1.0 * U, h], [0.62 * U, 1.3 * U, h], IC.m1); K.seg([0.62 * U, 1.3 * U, h], [0.66 * U, 1.45 * U, h], IC.w2);
    // things on the shelf
    for (const [v, k] of [[0.5, 1], [1.4, 0]]) pot(0.14 * U, v * U, h + Math.round(t * 0.5) + 2, 0.08 * U, 4, k);
    // the watering can: a drum with a long spout and a handle over the top
    { const u = 1.05 * U, v = 1.25 * U, [x, y] = K.P(u, v, 0); K.cyl(u, v, 0, 0.17 * U, Math.round(t * 0.4), IC.m1, IC.m1, IC.m2); K.ring(u, v, 3, 0.17 * U, IC.m3);
      T.line(x - 4, y - 5, x - 12, y - 13, IC.m2); T.line(x - 4, y - 4, x - 12, y - 12, IC.m3); T.disc(x - 12, y - 13, 2, IC.m1, 1);
      for (let k = 0; k <= 8; k++) { const an = Math.PI + k / 8 * Math.PI; T.px(x + 2 + Math.cos(an) * 5, y - t * 0.4 - 1 + Math.sin(an) * 5, k < 4 ? IC.m1 : IC.m2); } }
  },
  skep(t, T, ax, ay) {
    // a straw bee skep on a wooden stand: coil on coil of bound straw narrowing to a rounded crown, each coil lit on top and
    // shadowed under, a dark doorway at the foot with bees coming and going
    const U = t / 2, K = isoKit(T, ax, ay), straw = ["#5a3e1e", "#8a6430", "#b8904e", "#dcbd7c", "#f2dca6"].map(pxHex), c = 0.5 * U, sz = Math.round(t * 0.55);
    for (const [u, v] of [[c - 0.3 * U, c - 0.3 * U], [c + 0.25 * U, c - 0.3 * U], [c - 0.3 * U, c + 0.25 * U]]) K.box(u, v, 0, 2, 2, sz, IC.w1, IC.w2, IC.w3, false);
    K.box(c + 0.25 * U, c + 0.25 * U, 0, 2, 2, sz, IC.w1, IC.w2, IC.w3, false);
    K.box(c - 0.4 * U, c - 0.4 * U, sz, 0.8 * U, 0.8 * U, 3, IC.w1, IC.w2, IC.w3);
    const [x, y] = K.P(c, c, sz + 3), r = U * 0.42 * 2.83 * 0.62, hgt = Math.round(t * 0.95), n = 8, ch = hgt / n;
    for (let k = 0; k < n; k++) {
      const f = k / n, rr = r * Math.sqrt(Math.max(0.05, 1 - (f * 0.95) ** 2.2)), yy = y - k * ch;
      for (let j = 0; j < ch + 0.5; j++) T.disc(x, yy - j, rr, xx => { const q = (xx + 0.5 - x) / rr; const band = j < 1 ? 0 : j > ch - 1.5 ? 3 : 2; return straw[clamp(band + (q < -0.45 ? 1 : q > 0.45 ? -1 : 0), 0, 4)]; }, rr * 0.48);
    }
    T.ball(x, y - hgt, r * 0.28, straw[4], straw[3], straw[2], r * 0.2);
    T.poly([[x - 3, y + 1], [x + 2, y + 2], [x + 2, y - 3], [x - 1, y - 4], [x - 3, y - 3]], IC.ink2);
    for (const [dx, dy] of [[-r * 1.3, -hgt * 0.5], [r * 1.2, -hgt * 0.8], [-r * 0.6, -hgt * 1.15], [r * 0.4, 2]]) { T.px(x + dx, y + dy, IC.y1); T.px(x + dx + 1, y + dy, IC.ink); T.px(x + dx, y + dy - 1, IC.white); }
  },
  coldframe(t, T, ax, ay) {
    // a cold frame: a plank box, high at the back and low at the front to catch the sun, rows of seedlings inside, its glass
    // light hinged at the back and propped open on a stick
    const U = t / 2, K = isoKit(T, ax, ay), u0 = 0.08 * U, u1 = 1.92 * U, v0 = 0.12 * U, v1 = 0.9 * U, hb = Math.round(t * 0.62), hf = Math.round(t * 0.32);
    K.faceV(v0, u0, u1, 0, hb, IC.w3, 1);
    K.flat(u0, v0, u1, v1, 2, (px, py) => pxHash(px, py) > 0.8 ? IC.w2 : IC.w3, 0);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 9; k++) { const [x, y] = K.P(u0 + (u1 - u0) * (k + 0.5) / 9, v0 + (v1 - v0) * (r + 0.6) / 3.4, 2); T.px(x, y - 1, IC.g2); T.px(x - 1, y - 2, IC.g0); T.px(x + 1, y - 2, IC.g1); T.px(x, y - 3, r === 1 ? IC.g0 : null); }
    K.quad([[u0, v0, 0], [u0, v1, 0], [u0, v1, hf], [u0, v0, hb]], IC.w2, 1);
    K.faceV(v1, u0, u1, 0, hf, IC.w2, 1); K.faceV(v1, u0, u1, hf - 1, hf, IC.w1, 5);
    K.quad([[u1, v0, 0], [u1, v1, 0], [u1, v1, hf], [u1, v0, hb]], IC.w3, 2);
    K.seg([u1, v1, hf], [u1, v0, hb], IC.w1);
    // the lid: hinged along the back, swung up and over, panes catching the moon, held by a stick
    const lz = hb + Math.round(t * 0.85), lv = v0 + 0.18 * U;
    K.quad([[u0, v0, hb], [u1, v0, hb], [u1, lv, lz], [u0, lv, lz]], (px, py) => ((px - 2 * py) % 13 + 13) % 13 < 2 ? IC.white : (px + py) % 2 ? IC.b0 : IC.b1, 0);
    for (const u of [u0, (u0 + u1) / 2, u1]) K.seg([u, v0, hb], [u, lv, lz], IC.w1);
    K.seg([u0, lv, lz], [u1, lv, lz], IC.w2);
    K.seg([(u0 + u1) * 0.3, v0 + 0.05 * U, hb], [(u0 + u1) * 0.3, lv - 0.02 * U, lz - 2], IC.w2);
  },
  sunflowers(t, T, ax, ay) {
    // three tall sunflowers: hairy stalks, big heart-shaped leaves with a midrib, heads of golden petals round a brown disc of
    // seeds in spirals; the tallest nods toward the light
    const U = t / 2, K = isoKit(T, ax, ay), c = 0.5 * U;
    for (const [du, dv, hh, k0] of [[-0.15, -0.2, 2.5, 0.9], [0.25, -0.02, 2.9, 1], [-0.05, 0.28, 2.0, 0.8]]) {
      const [x, y] = K.P(c + du * U, c + dv * U, 0), top = y - t * hh, r = t * 0.36 * k0;
      for (let yy = y; yy > top + r * 0.4; yy--) { const sway = Math.round(Math.sin((y - yy) * 0.04) * 1.5); T.px(x + sway, yy, IC.g1); T.px(x + sway + 1, yy, IC.g3); if (pxHash(x, yy) > 0.8) T.px(x + sway - 1, yy, IC.g0); }
      // leaves: hearts on short stems, lit above the midrib
      for (const [f, side] of [[0.28, -1], [0.48, 1], [0.66, -1]]) {
        const ly = y - (y - top) * f, lx = x + side * r * 0.95, lr = r * 0.62;
        T.line(x, ly + 2, lx - side * lr * 0.5, ly, IC.g2);
        for (let yy = -lr * 0.6; yy <= lr * 0.6; yy++) for (let xx = -lr; xx <= lr; xx++) { const q = Math.abs(xx / lr) + (yy / (lr * 0.6)) ** 2 * (xx * side > 0 ? 1 : 1.3); if (q > 1) continue; T.px(lx + xx, ly + yy, Math.abs(yy + xx * side * 0.15) < 0.6 ? IC.g2 : yy < 0 ? IC.g0 : IC.g1); }
      }
      // the head: petals, a darker ring of shorter ones, the disc with its seed spiral
      const hx = x + Math.round(Math.sin((y - top) * 0.04) * 1.5) - 1, hy = top;
      for (let k = 0; k < 18; k++) { const an = k / 18 * TAU, pl = r * (k % 2 ? 1 : 0.86); for (let j = 0; j < pl; j++) T.px(hx + Math.cos(an) * (r * 0.4 + j * 0.62), hy + Math.sin(an) * (r * 0.4 + j * 0.62) * 0.8, j > pl - 1.5 ? IC.y1 : an > Math.PI * 0.9 && an < Math.PI * 1.7 ? IC.y0 : IC.y1); }
      T.disc(hx, hy, r * 0.48, (xx, yy) => { const d = Math.hypot(xx - hx, (yy - hy) * 1.25) / (r * 0.48), an = Math.atan2(yy - hy, xx - hx); return ((d * 7 + an * 1.6) % 2 + 2) % 2 < 0.8 ? IC.w2 : d > 0.8 ? IC.w3 : xx < hx && yy < hy ? IC.w2 : IC.ink2; }, r * 0.4);
    }
  },
  barrow(t, T, ax, ay) {
    // a wooden wheelbarrow: a tray of boards splaying outward, red paint worn at the edges, full of soil with a spade in it;
    // a spoked wheel at the front, two legs and two long handles at the back
    const U = t / 2, K = isoKit(T, ax, ay), v0 = 0.25 * U, v1 = 0.75 * U, zt = Math.round(t * 0.38), ht = Math.round(t * 0.38);
    const red = [IC.r1, IC.r2, IC.r3];
    // legs and handles at the back (low u)
    for (const v of [v0 + 0.05 * U, v1 - 0.05 * U]) { K.seg([0.25 * U, v, 0], [0.32 * U, v, zt], IC.w3); K.seg([-0.15 * U, v, zt + 4], [0.95 * U, v, zt - 2], IC.w2); }
    // the tray: a bottom smaller than its top
    const b0 = [0.3 * U, v0 + 0.08 * U, 0.8 * U, v1 - 0.08 * U], b1 = [0.18 * U, v0 - 0.05 * U, 0.98 * U, v1 + 0.05 * U];
    K.quad([[b0[0], b0[1], zt], [b0[2], b0[1], zt], [b1[2], b1[1], zt + ht], [b1[0], b1[1], zt + ht]], red[2], 1);
    K.quad([[b0[0], b0[1], zt], [b0[0], b0[3], zt], [b1[0], b1[3], zt + ht], [b1[0], b1[1], zt + ht]], red[1], 2);
    K.flat(b1[0], b1[1], b1[2], b1[3], zt + ht - 1, (px, py) => pxHash(px, py) > 0.75 ? IC.w2 : pxHash(px + 1, py) > 0.5 ? IC.w3 : IC.ink2, 0);
    K.quad([[b0[0], b0[3], zt], [b0[2], b0[3], zt], [b1[2], b1[3], zt + ht], [b1[0], b1[3], zt + ht]], red[0], 1);
    K.quad([[b0[2], b0[1], zt], [b0[2], b0[3], zt], [b1[2], b1[3], zt + ht], [b1[2], b1[1], zt + ht]], red[1], 2);
    K.seg([b1[0], b1[3], zt + ht], [b1[2], b1[3], zt + ht], IC.p0); K.seg([b1[2], b1[1], zt + ht], [b1[2], b1[3], zt + ht], IC.r2);
    for (let k = 0; k < 5; k++) K.dot(b1[0] + (b1[2] - b1[0]) * pxHash(k, 2), b1[3], zt + ht - 1 - (k % 3), IC.w3);
    // the wheel: a tyre round spokes, standing upright under the nose
    const wc = [1.08 * U, 0.5 * U, zt * 0.62], wr = zt * 0.62;
    for (let k = 0; k < 6; k++) { const an = k / 6 * Math.PI; K.seg([wc[0] + Math.cos(an) * wr, wc[1], wc[2] + Math.sin(an) * wr], [wc[0] - Math.cos(an) * wr, wc[1], wc[2] - Math.sin(an) * wr], IC.w2); }
    for (let k = 0; k < 40; k++) { const an = k / 40 * TAU; for (const d of [0, 1]) K.dot(wc[0] + Math.cos(an) * (wr - d), wc[1], wc[2] + Math.sin(an) * (wr - d), d ? (Math.sin(an) > 0 ? IC.s2 : IC.s3) : IC.s4); }
    K.dot(wc[0], wc[1], wc[2], IC.m1);
    // the spade
    K.seg([0.62 * U, 0.48 * U, zt + ht], [0.5 * U, 0.42 * U, zt + ht + Math.round(t * 0.9)], IC.w2); K.seg([0.62 * U, 0.5 * U, zt + ht], [0.5 * U, 0.44 * U, zt + ht + Math.round(t * 0.9)], IC.w3);
    K.box(0.47 * U, 0.38 * U, zt + ht + Math.round(t * 0.9), 0.04 * U, 0.12 * U, 1, IC.w1, IC.w2, IC.w3, false);
    K.quad([[0.58 * U, 0.42 * U, zt + ht - 2], [0.68 * U, 0.42 * U, zt + ht - 2], [0.66 * U, 0.48 * U, zt + ht + 5], [0.6 * U, 0.48 * U, zt + ht + 5]], IC.m1, 0);
  },
  // ---- the shop
  shelves(t, T, ax, ay) {
    // a tall oak dresser against the wall: side boards, a dark back, five shelves of stoneware, jams, bottles, cheeses and
    // loaves, folded cloth on top, a cornice hung with bunches of drying herbs and a string of onions
    const U = t / 2, K = isoKit(T, ax, ay + 1), u0 = 0.04 * U, u1 = 1.96 * U, D = 0.52 * U, H = Math.round(t * 3), sd = 0.1 * U;
    K.faceV(0.02, u0, u1, 0, H, IC.w3, 1);
    K.faceV(0.03, u0 + sd, u1 - sd, H * 0.84, H, IC.ink2, 1);   // the shadow under the cornice
    K.box(u0, 0, 0, sd, D, H, IC.w1, IC.w2, IC.w3);
    const levels = [3, 0.21, 0.4, 0.59, 0.78].map((f, i) => i ? Math.round(H * f) : f), rows = [["crock", "crock", "cheese", "crock"], ["cheese", "loaf", "loaf", "cheese", "loaf"], ["jar", "jar", "jar", "jar", "jar"], ["bottle", "bottle", "bottle", "bottle", "bottle", "bottle"], ["cloth", "crock", "cloth"]];
    K.faceV(D, u0, u1, 0, 3, IC.w3, 1);
    levels.forEach((zs, r) => {
      K.box(u0 + sd, 0, zs - 2, u1 - u0 - 2 * sd, D, 2, IC.w1, IC.w2, IC.w3, false);
      const n = rows[r].length, span = u1 - u0 - 2 * sd;
      rows[r].forEach((kind, k) => isoGoods(K, T, kind, u0 + sd + span * (k + 0.5) / n, D * 0.5, zs, U, k + r));
    });
    K.box(u1 - sd, 0, 0, sd, D, H, IC.w1, IC.w2, IC.w3);
    // the cornice: a moulded board standing proud of the top
    K.box(u0 - 0.06 * U, 0, H, u1 - u0 + 0.12 * U, D + 0.1 * U, 3, IC.w1, IC.w2, IC.w3);
    K.faceV(D + 0.1 * U, u0 - 0.06 * U, u1 + 0.06 * U, H + 1, H + 2, IC.w1, 1);
    // herbs and onions hung from the cornice's edge
    for (let k = 0; k < 8; k++) {
      const u = u0 + (k + 0.5) / 8 * (u1 - u0), [x, y] = K.P(u, D + 0.1 * U, H), len = 3 + (k % 3);
      T.line(x, y, x, y + len, IC.w3);
      if (k % 4 === 2) for (let j = 0; j < 3; j++) T.ball(x + (j % 2 ? 1 : -1), y + len + 2 + j * 3, 1.8, IC.y0, IC.y1, IC.w1, 1.6);
      else { const lav = k % 4 === 1; for (let j = 0; j < 7; j++) T.px(x - 1 + (j % 3), y + len + 1 + Math.floor(j / 2), lav ? [IC.p0, IC.l2, IC.l3][j % 3] : [IC.g0, IC.g1, IC.g2][j % 3]); T.px(x, y + len + 5, lav ? IC.l3 : IC.g3); }
    }
  },
  shelves2(t, T, ax, ay) {
    // an apothecary's chest of drawers along the other wall: a grid of little drawers with paper labels and brass knobs, one
    // left pulled out with herbs in it; a mortar and pestle, a candle and a row of jars on top
    const U = t / 2, K = isoKit(T, ax, ay + 1), D = 0.55 * U, v0 = 0.05 * U, v1 = 1.95 * U, H = Math.round(t * 2.5);
    K.box(0, v0, 0, D, v1 - v0, H, IC.w1, IC.w2, IC.w3);
    K.faceU(D, v0, v1, 0, 4, IC.ink2);
    const cols = 4, rows = 7, z0 = 5, z1 = H - 4, cw = (v1 - v0 - 0.08 * U) / cols, rh = (z1 - z0) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const va = v0 + 0.04 * U + c * cw, vb = va + cw, za = z0 + r * rh, zb = za + rh;
      K.faceU(D, va, vb, za, zb, IC.w3, 6);
      K.faceU(D, va + 0.5, vb - 0.3, za + 1, zb, IC.w2, 6);
      K.faceU(D, va + 0.5, vb - 0.3, zb - 1, zb, IC.w1, 6);
      // the label, and the knob below it
      K.faceU(D, va + cw * 0.3, vb - cw * 0.3, za + rh * 0.55, za + rh * 0.55 + 2, (r + c) % 3 ? IC.s0 : IC.y0);
      const [kx, ky] = K.P(D, (va + vb) / 2, za + rh * 0.32); T.px(kx, ky, IC.y0); T.px(kx + 1, ky, IC.y1); T.px(kx + 1, ky + 1, IC.w3);
    }
    // one drawer pulled out, a handful of herbs in it
    { const va = v0 + 0.04 * U + 2 * cw, za = z0 + 2 * rh; K.box(D, va + 0.5, za + 1, 0.3 * U, cw - 1, rh - 1.5, IC.w3, IC.w2, IC.w1);
      K.faceU(D + 0.3 * U, va + 0.5, va + cw - 0.5, za + 1, za + rh - 0.5, IC.w2);
      for (let k = 0; k < 5; k++) K.dot(D + 0.06 * U + k * 0.05 * U, va + cw * (0.3 + (k % 3) * 0.2), za + rh, k % 2 ? IC.g1 : IC.g0); }
    // the top: a stone mortar with its pestle, a candle, two jars
    K.cyl(D * 0.5, 0.45 * U, H, 0.16 * U, Math.round(U * 0.3), IC.s1, IC.s0, IC.s2); K.ring(D * 0.5, 0.45 * U, H + U * 0.3, 0.12 * U, IC.s3);
    K.seg([D * 0.5, 0.45 * U, H + U * 0.25], [D * 0.3, 0.6 * U, H + U * 0.7], IC.w3);
    for (const [v, k] of [[1.05, 1], [1.3, 3]]) isoGoods(K, T, "jar", D * 0.5, v * U, H, U, k);
    { const [x, y] = K.P(D * 0.5, 1.7 * U, H); K.cyl(D * 0.5, 1.7 * U, H, 0.08 * U, 1, IC.y1, IC.y1, IC.w2); T.line(x, y - 2, x, y - 7, IC.s0); T.px(x - 1, y - 7, IC.white); T.px(x, y - 8, IC.y0); T.px(x, y - 9, IC.y1); T.glow(x, y - 9, U * 0.6, IC.y0, 0.35); }
  },
  counter(t, T, ax, ay) {
    // a shop counter of raised oak panels on a dark plinth under a thick overhanging top; on it brass scales, the ledger lying
    // open, a cash box with brass corners, a glass jar of sweets and a bell
    const U = t / 2, K = isoKit(T, ax, ay), H = Math.round(t * 1.6), u0 = 0.06 * U, u1 = 1.94 * U, v0 = 0.08 * U, v1 = 0.92 * U, o = 0.07 * U;
    K.box(u0 + o, v0 + o, 0, u1 - u0 - 2 * o, v1 - v0 - 2 * o, 4, IC.w3, IC.w3, IC.ink2);
    K.box(u0 + o * 0.5, v0 + o * 0.5, 4, u1 - u0 - o, v1 - v0 - o, H - 8, IC.w2, IC.w2, IC.w3);
    // raised panels: a frame of stiles and rails, each panel bevelled (lit at its top and left, dark at its bottom and right)
    const vf = v1 - o * 0.5, uf = u1 - o * 0.5, panel = (face, a0, a1, z0, z1, lit) => {
      const f = face === "v" ? (a, b, c, d2, col) => K.faceV(vf, a, b, c, d2, col, 7) : (a, b, c, d2, col) => K.faceU(uf, a, b, c, d2, col, 7);
      const [hi, mid, lo] = lit ? [IC.w1, IC.w2, IC.w3] : [IC.w2, IC.w3, IC.ink2];
      f(a0, a1, z0, z1, lo); f(a0 + 0.6, a1 - 0.6, z0 + 1, z1 - 1, mid);
      f(a0 + 0.6, a1 - 0.6, z1 - 2, z1 - 1, hi); f(a0 + 0.6, a0 + 1.1, z0 + 1, z1 - 1, hi);
      f(a0 + 0.6, a1 - 0.6, z0 + 1, z0 + 2, lo); f(a1 - 1.1, a1 - 0.6, z0 + 1, z1 - 1, lo);
    };
    for (let k = 0; k < 4; k++) { const a = u0 + o + 0.06 * U + k * (u1 - u0 - 2 * o - 0.12 * U) / 4; panel("v", a + 0.08 * U, a + (u1 - u0 - 2 * o - 0.12 * U) / 4 - 0.08 * U, 8, H - 8, true); }
    panel("u", v0 + o + 0.12 * U, v1 - o - 0.12 * U, 8, H - 8, false);
    K.box(u0, v0, H - 4, u1 - u0, v1 - v0, 4, IC.w1, IC.w2, IC.w3);
    K.faceV(v1, u0, u1, H - 4, H - 3, IC.w3, 1);
    // the scales: a post, a beam, two pans on threads
    { const u = 0.35 * U, v = 0.45 * U, [x, y] = K.P(u, v, H); K.cyl(u, v, H, 0.1 * U, 1, IC.y1, IC.y1, IC.w2);
      T.line(x, y - 1, x, y - U * 1.1, BRASS[1]); T.line(x + 1, y - 1, x + 1, y - U * 1.1, BRASS[3]);
      const by = y - U * 1.1, bw2 = U * 0.6; T.line(x - bw2, by + 1, x + bw2, by - 1, BRASS[0]); T.line(x - bw2, by + 2, x + bw2, by, BRASS[2]); T.px(x, by - 1, IC.y0);
      for (const [d, dy] of [[-1, 1], [1, -1]]) { const px0 = x + d * bw2, py0 = by + 1 + dy; T.line(px0, py0, px0 - 3, py0 + U * 0.55, IC.s2); T.line(px0, py0, px0 + 3, py0 + U * 0.55, IC.s2); T.disc(px0, py0 + U * 0.6, 4, (xx) => xx < px0 ? BRASS[0] : BRASS[1], 1.6); T.line(px0 - 3, py0 + U * 0.6 + 1, px0 + 3, py0 + U * 0.6 + 1, BRASS[3]); }
      T.ball(x + bw2 - 1, by + U * 0.55 - 2, 1.6, IC.r1, IC.r2, IC.r3); }
    // the ledger, open, its pages written in rows
    { const u = 0.95 * U, v = 0.5 * U, w2 = 0.26 * U, d2 = 0.2 * U;
      K.flat(u - w2, v - d2, u + w2, v + d2, H, IC.r3); K.flat(u - w2 + 0.6, v - d2 + 0.4, u - 0.3, v + d2 - 0.4, H + 1, IC.white); K.flat(u + 0.3, v - d2 + 0.4, u + w2 - 0.6, v + d2 - 0.4, H + 1, IC.s0);
      for (let k = 0; k < 4; k++) { K.seg([u - w2 + 2, v - d2 + 1.5 + k * 1.6, H + 1], [u - 1.5, v - d2 + 1.5 + k * 1.6, H + 1], IC.s2); K.seg([u + 1.5, v - d2 + 1.5 + k * 1.6, H + 1], [u + w2 - 2, v - d2 + 1.5 + k * 1.6, H + 1], IC.s2); }
      K.seg([u, v - d2, H + 1], [u, v + d2, H + 1], IC.s1); K.seg([u + w2 * 0.6, v + d2, H + 1], [u + w2 * 0.6, v + d2 + 3, H - 1], IC.r1); }
    // a lantern at the far end, so the counter is the brightest thing in the shop
    { const [lx, ly] = K.P(0.14 * U, 0.74 * U, H); T.glow(lx, ly - 5, t * 0.9, IC.y0, 0.38);
      T.line(lx - 2, ly, lx + 2, ly, IC.m3); T.poly([[lx - 2, ly - 1], [lx + 2, ly - 1], [lx + 2, ly - 7], [lx - 2, ly - 7]], IC.y1);
      T.px(lx - 1, ly - 3, IC.white); T.px(lx - 1, ly - 4, IC.y0); T.px(lx, ly - 4, IC.y0); T.line(lx - 2, ly - 8, lx + 2, ly - 8, IC.m3); T.px(lx, ly - 9, IC.m2); T.px(lx, ly - 10, IC.m3); }
    // the cash box
    { const u = 1.38 * U, v = 0.32 * U; K.box(u, v, H, 0.26 * U, 0.22 * U, 6, IC.w3, IC.r3, IC.ink2); K.box(u, v, H + 6, 0.26 * U, 0.22 * U, 1, IC.w2, IC.r2, IC.r3);
      for (const [cu, cv] of [[u, v + 0.22 * U], [u + 0.26 * U, v + 0.22 * U], [u + 0.26 * U, v]]) { K.dot(cu, cv, H + 1, IC.y1); K.dot(cu, cv, H + 6, IC.y0); }
      K.dot(u + 0.13 * U, v + 0.22 * U, H + 4, IC.y0); }
    // the sweet jar, and the bell
    { const u = 1.7 * U, v = 0.62 * U, [x, y] = K.P(u, v, H); K.cyl(u, v, H, 0.12 * U, Math.round(U * 0.55), IC.b0, IC.b0, IC.b1);
      for (let k = 0; k < 9; k++) T.px(x - 2 + (k % 3) * 2 + (k > 5 ? 1 : 0), y - 2 - Math.floor(k / 3) * 2, [IC.r1, IC.y0, IC.g0, IC.p1][k % 4]);
      T.line(x - 3, y - 3, x - 3, y - U * 0.5, IC.white); K.cyl(u, v, H + Math.round(U * 0.55), 0.09 * U, 2, IC.s0, IC.s1, IC.s2); }
    { const [x, y] = K.P(1.65 * U, 0.2 * U, H); T.ball(x, y - 3, 2.6, IC.y0, IC.y1, IC.w2, 2.4); T.line(x - 3, y - 1, x + 3, y - 1, IC.w1); T.px(x, y - 6, IC.w2); }
  },
  crates(t, T, ax, ay) {
    // slatted crates: a big one, a smaller one on it opened and full of red apples, straw poking out, one apple rolled off
    const U = t / 2, K = isoKit(T, ax, ay);
    const crate = (u, v, z, a, b, hz, fill) => {
      K.box(u, v, z, a, b, hz, fill ? IC.ink2 : IC.w1, IC.ink2, IC.ink2, false);
      const n = 3, gap = 1.3;
      for (let k = 0; k < n; k++) {
        const z0 = z + k * hz / n + (k ? gap / 2 : 0), z1 = z + (k + 1) * hz / n - (k < n - 1 ? gap / 2 : 0);
        K.faceV(v + b, u, u + a, z0, z1, IC.w2, 1); K.faceU(u + a, v, v + b, z0, z1, IC.w3, 2);
        K.faceV(v + b, u, u + a, z1 - 1, z1, IC.w1, 1);
      }
      // corner battens, a diagonal brace across the front
      for (const [p, q] of [[u, u + a * 0.13], [u + a * 0.87, u + a]]) K.faceV(v + b, p, q, z, z + hz, IC.w1, 3);
      K.faceU(u + a, v + b * 0.87, v + b, z, z + hz, IC.w2, 3); K.faceU(u + a, v, v + b * 0.13, z, z + hz, IC.w2, 3);
      for (let k = 0; k < 14; k++) { const f = k / 14; K.dot(u + a * (0.13 + f * 0.74), v + b, z + 1 + f * (hz - 2), IC.w1); K.dot(u + a * (0.13 + f * 0.74) + 0.5, v + b, z + 1 + f * (hz - 2), IC.w2); }
      if (fill) {
        // the open top: rim boards round a heap of apples, straw sticking out between them
        K.flat(u + 0.08 * a, v + 0.08 * b, u + 0.92 * a, v + 0.92 * b, z + hz, IC.ink2);
        for (let k = 0; k < 9; k++) { const [x, y] = K.P(u + a * (0.22 + (k % 3) * 0.28), v + b * (0.22 + Math.floor(k / 3) * 0.28), z + hz + 1); T.ball(x, y - 1, 2.4, IC.r1, IC.r2, IC.r3, 2); T.px(x - 1, y - 2, IC.p0); T.px(x, y - 3.5, IC.w3); }
        for (let k = 0; k < 6; k++) { const [x, y] = K.P(u + a * pxHash(k, 3), v + b * (k % 2 ? 0.05 : 0.95), z + hz); T.line(x, y, x + (k % 2 ? 2 : -2), y - 3, IC.y0); }
      } else K.flat(u, v, u + a, v + b, z + hz, IC.w1);
    };
    crate(0.08 * U, 0.1 * U, 0, 0.82 * U, 0.8 * U, Math.round(U * 0.95), false);
    crate(0.18 * U, 0.2 * U, Math.round(U * 0.95), 0.62 * U, 0.6 * U, Math.round(U * 0.72), true);
    { const [x, y] = K.P(0.75 * U, 1.05 * U, 0); T.ball(x, y - 2, 2.4, IC.r1, IC.r2, IC.r3, 2); T.px(x - 1, y - 3, IC.p0); }
  },
  sacks(t, T, ax, ay) {
    // fat burlap sacks of flour and grain: two tied shut with rope, the one in front opened with a scoop in it
    const U = t / 2, K = isoKit(T, ax, ay), at = (u, v) => K.P(u * U, v * U, 0);
    { const [x, y] = at(0.35, 0.3); isoSack(T, x, y, U * 0.62, U * 1.6, { mark: IC.b2, lean: -0.2 }); }
    { const [x, y] = at(0.68, 0.36); isoSack(T, x, y, U * 0.55, U * 1.3, { lean: 0.25 }); }
    { const [x, y] = at(0.55, 0.75); isoSack(T, x, y, U * 0.6, U * 1.05, { open: [IC.white, IC.s0, IC.s1], mark: IC.r2 }); const [sx, sy] = [x + U * 0.15, y - U * 1.05]; T.line(sx, sy, sx + U * 0.4, sy - U * 0.5, IC.w2); T.disc(sx - 1, sy + 1, 2.5, IC.w1, 1.4); }
  },
  barrel(t, T, ax, ay) {
    // an oak cask standing on end, hooped in iron, a ladle across its lid; a little bucket beside it
    const U = t / 2, K = isoKit(T, ax, ay), [x, y] = K.P(0.45 * U, 0.45 * U, 0), r = U * 0.92, h = Math.round(t * 1.25);
    isoCask(T, x, y, r, h);
    T.line(x - r * 0.6, y - h - 1, x + r * 0.3, y - h + 2, IC.w3); T.line(x - r * 0.6, y - h, x + r * 0.3, y - h + 3, IC.w1); T.disc(x + r * 0.4, y - h + 3, 2.5, IC.m2, 1.4);
    const [bx, by] = K.P(0.95 * U, 0.85 * U, 0); isoCask(T, bx, by, U * 0.5, Math.round(U * 0.6), { hoops: [0.2, 0.8], belly: 0, fill: (xx, yy) => pxHash(xx, yy) > 0.85 ? IC.b1 : IC.b3 });
    T.line(bx - U * 0.5, by - U * 0.6, bx, by - U * 1.1, IC.m2); T.line(bx, by - U * 1.1, bx + U * 0.5, by - U * 0.6, IC.m2);
  },
  // ---- the forge
  furnace(t, T, ax, ay, o) {
    // a smith's hearth, built true to the room's grid: a stone table with a firepot sunk in its top, a hood narrowing up from a
    // skirt over the fire into a chimney that stands against the back wall and rises out of sight
    const A = t * 0.95, h = Math.round(t * 0.62), f = (o.frame || 0) % 3, x0 = ax, y0 = ay + 2;
    const P = (u, v, z) => [x0 + 2 * u - 2 * v, y0 + u + v - z];       // a point in the piece: u along the right wall, v along the left, z up
    const quad = (pts, col) => T.poly(pts.map(([u, v, z]) => P(u, v, z)), col);
    // brick courses run along each face: on the left face they fall to the right (half a pixel down per pixel across), on the right face to the left
    const brick = (side) => (px, py) => { const yy = side ? py + px * 0.5 : py - px * 0.5, row = Math.floor(yy / 4), along = Math.floor(px) + (((row % 2) + 2) % 2) * 4, col = Math.floor(along / 8);
      return (((Math.floor(yy) % 4) + 4) % 4 === 0 || ((along % 8) + 8) % 8 === 0) ? IC.s4 : pxHash(col, row) > 0.5 ? (side ? IC.s2 : IC.s1) : (side ? IC.s3 : IC.s2); };
    // the table
    T.box(x0, y0, A, A, h, IC.s1, brick(0), brick(1));
    // the firepot: a square well in the top, dark rim, coals glowing in it
    const fu0 = A * 0.3, fu1 = A * 0.72, fv0 = A * 0.3, fv1 = A * 0.72;
    quad([[fu0, fv0, h], [fu1, fv0, h], [fu1, fv1, h], [fu0, fv1, h]], IC.s4);
    const coal = (px, py) => { const n = pxHash(px >> 1, py >> 1) + Math.sin(px * 0.7 + f * 2) * 0.15; return n > 0.78 ? IC.y0 : n > 0.48 ? IC.y1 : n > 0.22 ? IC.r1 : IC.r2; };
    quad([[fu0 + 2, fv0 + 2, h - 1], [fu1 - 1, fv0 + 2, h - 1], [fu1 - 1, fv1 - 1, h - 1], [fu0 + 2, fv1 - 1, h - 1]], coal);
    // the hood: a skirt just above head height over the fire, its two front faces sloping in to the chimney's mouth
    const zs = h + t * 0.62, zc = h + t * 1.0, su0 = A * 0.12, su1 = A * 0.92, sv0 = 0, sv1 = A * 0.88;
    const cu0 = A * 0.36, cu1 = A * 0.64, cv0 = 0, cv1 = A * 0.26;
    const hoodStone = (lit) => (px, py) => pxHash(px >> 2, py >> 1) > 0.65 ? (lit ? IC.s1 : IC.s2) : (lit ? IC.s2 : IC.s3);
    quad([[su0, sv1, zs], [su1, sv1, zs], [cu1, cv1, zc], [cu0, cv1, zc]], hoodStone(true));     // the face toward the left wall's side, lit
    quad([[su1, sv0, zs], [su1, sv1, zs], [cu1, cv1, zc], [cu1, cv0, zc]], hoodStone(false));    // the face toward the right, in shade
    // the skirt's rim: a band of stone with the fire's light on its underside
    quad([[su0, sv1, zs], [su1, sv1, zs], [su1, sv1, zs - 3], [su0, sv1, zs - 3]], IC.s3);
    quad([[su1, sv0, zs], [su1, sv1, zs], [su1, sv1, zs - 3], [su1, sv0, zs - 3]], IC.s4);
    for (let k = 0; k < 10; k++) { const [px, py] = P(su0 + (su1 - su0) * (k + 0.5) / 10, sv1, zs - 3); T.px(px, py + 1, k % 3 ? IC.r1 : IC.y1); }
    // the chimney: a square stack against the back wall, from the hood up out of the picture
    T.box(P(cu0, cv0, zc)[0], P(cu0, cv0, zc)[1], cu1 - cu0, cv1 - cv0, Math.round(t * 1.6), IC.s1, brick(0), brick(1));
    // light from the coals, a few sparks lifting under the hood, a poker leaning on the table
    const [gx, gy] = P((fu0 + fu1) / 2, (fv0 + fv1) / 2, h);
    T.glow(gx, gy - 4, t * 1.1, IC.y1, 0.3);
    for (let k = 0; k < 4; k++) T.px(gx - 4 + k * 3 + f, gy - 6 - ((k + f) % 3) * 4, k % 2 ? IC.y0 : IC.r1);
    const [lx, ly] = P(A, A * 0.55, 0); T.line(lx + 2, ly, lx + 6, ly - h - 8, IC.m3);
  },
  bellows(t, T, ax, ay) {
    // great bellows lying on a trestle beside the hearth: a teardrop of two boards with pleated leather between them, an iron
    // nozzle into the fire, and a rocker on a post overhead with a chain down to the top board and a rope to pull
    const U = t / 2, K = isoKit(T, ax, ay), zb = Math.round(t * 0.8), lh = Math.round(t * 0.32), zt = zb + 2 + lh;
    const leather = ["#8a5a36", "#6b4127", "#4a2a19", "#2e180e"].map(pxHex);
    const leg = (u, v) => K.box(u - 1, v - 1, 0, 2, 2, zb, IC.w2, IC.w2, IC.w3, false);
    leg(0.25 * U, 0.25 * U); leg(0.85 * U, 0.25 * U); leg(0.25 * U, 0.8 * U);
    K.box(0.2 * U, 0.48 * U, zb - 3, 0.75 * U, 0.1 * U, 2, IC.w1, IC.w2, IC.w3, false);
    const pts = [[0.02, 0.5], [0.3, 0.2], [0.68, 0.1], [0.94, 0.24], [1.0, 0.5], [0.94, 0.76], [0.68, 0.9], [0.3, 0.8]].map(([u, v]) => [u * U, v * U]);
    const board = (z, top, edge) => { K.quad(pts.map(([u, v]) => [u, v, z]), edge); K.quad(pts.map(([u, v]) => [u, v, z + 2]), top, 1); };
    board(zb, IC.w2, IC.w3);
    // the leather: only the sides facing us, each pleated in ridges that catch the light
    const sides = pts.map((p, i) => [p, pts[(i + 1) % pts.length]]).map(([p, q]) => ({ p, q, nu: q[1] - p[1], nv: -(q[0] - p[0]) })).filter(e => e.nu + e.nv > 0).sort((a, b) => a.p[0] + a.p[1] - b.p[0] - b.p[1]);
    for (const e of sides) for (let z = zb + 2; z < zt; z++) {
      const lit = e.nv > e.nu, pleat = (z - zb) % 3, bulge = Math.sin(Math.PI * (z - zb - 2) / lh);
      const col = leather[clamp((lit ? 1 : 2) + (pleat === 0 ? 1 : pleat === 2 ? -1 : 0) - (bulge > 0.7 && pleat === 2 ? 1 : 0), 0, 3)];
      K.quad([[e.p[0], e.p[1], z], [e.q[0], e.q[1], z], [e.q[0], e.q[1], z + 1], [e.p[0], e.p[1], z + 1]], col, 0);
    }
    leg(0.85 * U, 0.8 * U);
    board(zt, IC.w1, IC.w2);
    for (const [u, v] of pts.slice(2, 7)) K.dot(u, v, zt + 1, IC.y1);
    // the nozzle, tapering into the hearth
    for (let k = 0; k < 7; k++) { const u = -k * 0.07 * U, r = 2.2 - k * 0.2; const [x, y] = K.P(u, 0.5 * U, zb + 5); T.ball(x, y, r, IC.m1, IC.m2, IC.m3, r * 0.8); }
    // the rocker: a post, a beam across its top, a chain to the board and a rope with a toggle to pull
    K.box(1.02 * U, 0.45 * U, 0, 2, 2, zt + Math.round(t * 0.95), IC.w1, IC.w2, IC.w3, false);
    const zr = zt + Math.round(t * 0.9);
    for (let k = 0; k < 2; k++) K.seg([0.3 * U, 0.5 * U, zr - 4 + k], [1.3 * U, 0.5 * U, zr + 2 + k], k ? IC.w3 : IC.w1);
    for (let z = zt + 2; z < zr - 3; z += 2) K.dot(0.55 * U, 0.5 * U, z, z % 4 ? IC.m1 : IC.m3);
    K.seg([1.3 * U, 0.5 * U, zr + 2], [1.3 * U, 0.5 * U, zb], BURLAP[1]); K.box(1.27 * U, 0.47 * U, zb - 4, 1, 1, 4, IC.w1, IC.w2, IC.w3, false);
  },
  anvil(t, T, ax, ay) {
    // a London-pattern anvil on an oak stump: a broad foot, a waist, a flat steel face with the hardy and pritchel holes in
    // its heel, a long tapering horn; a hammer lying on the face, a bar glowing on the horn, tongs leaning on the stump
    const U = t / 2, K = isoKit(T, ax, ay), c = 0.5 * U, sh = Math.round(t * 0.75), [sx, sy] = K.P(c, c, 0), sr = U * 0.3 * 2.83;
    // tongs behind the stump
    T.line(sx + sr * 0.9, sy - 2, sx + sr * 0.5, sy - sh - 6, IC.m3); T.line(sx + sr * 0.9 + 2, sy - 2, sx + sr * 0.5 + 1, sy - sh - 6, IC.m2);
    T.grain(3, () => { for (let z = 0; z <= sh; z++) T.disc(sx, sy - z, sr, xx => { const f = (xx + 0.5 - sx) / sr, ridge = pxNoise(xx * 0.7, z * 0.12) > 0.62; return f < -0.55 ? (ridge ? IC.w2 : IC.w1) : f > 0.4 ? (ridge ? IC.ink2 : IC.w3) : ridge ? IC.w3 : IC.w2; }); });
    T.grain(0, () => T.disc(sx, sy - sh, sr - 1, (xx, yy) => { const d = Math.hypot(xx + 0.5 - sx, (yy + 0.5 - sy + sh) * 2) / sr; return Math.round(d * 5) % 2 ? IC.w1 : IC.w0; }));
    T.line(sx, sy - sh, sx + sr * 0.6, sy - sh + sr * 0.2, IC.w2);
    const z0 = sh + 1, steel = [IC.m0, IC.m2, IC.m3];
    K.box(c - 0.34 * U, c - 0.26 * U, z0, 0.68 * U, 0.52 * U, 4, IC.m1, IC.m2, IC.m3);
    K.box(c - 0.18 * U, c - 0.13 * U, z0 + 4, 0.36 * U, 0.26 * U, 7, IC.m1, IC.m3, IC.m4);
    // the horn, from its tip to where it meets the body (far parts first)
    const zf = z0 + 19, n = 9;
    for (let k = n; k >= 1; k--) { const f = k / n, r = 0.17 * U * (1 - f * 0.85), u = c - 0.42 * U - f * 0.5 * U; K.box(u, c - r, zf - 2 * r - 1, 0.06 * U, 2 * r, 2 * r + 1, IC.m0, IC.m2, IC.m3, false); }
    K.box(c - 0.42 * U, c - 0.18 * U, z0 + 11, 0.84 * U, 0.36 * U, 8, ...steel);
    // a glint along the face's front edge, the hardy hole and the pritchel hole in the heel
    K.seg([c - 0.4 * U, c + 0.18 * U, zf], [c + 0.4 * U, c + 0.18 * U, zf], IC.white);
    K.flat(c + 0.24 * U, c - 0.05 * U, c + 0.34 * U, c + 0.05 * U, zf, IC.m4); K.dot(c + 0.12 * U, c, zf, IC.m4);
    // the hammer lying across the face, and a bar glowing orange on the horn
    K.seg([c - 0.05 * U, c - 0.35 * U, zf + 1], [c - 0.05 * U, c + 0.4 * U, zf + 1], IC.w2); K.seg([c - 0.02 * U, c - 0.35 * U, zf + 1], [c - 0.02 * U, c + 0.4 * U, zf + 1], IC.w3);
    K.box(c - 0.12 * U, c - 0.42 * U, zf + 1, 0.16 * U, 0.12 * U, 3, IC.m1, IC.m2, IC.m3, false);
    for (let k = 0; k < 8; k++) { const [x, y] = K.P(c - 0.55 * U + k * 0.06 * U, c + 0.2 * U - k * 0.05 * U, zf + 1); T.px(x, y, k < 3 ? IC.y0 : k < 5 ? IC.y1 : k < 7 ? IC.r1 : IC.m3); }
    const [gx, gy] = K.P(c - 0.5 * U, c + 0.15 * U, zf + 1); T.glow(gx, gy, U * 0.7, IC.y1, 0.4);
  },
  coalbin(t, T, ax, ay) {
    // a plank bunker of coal against the wall, its corners strapped and riveted in iron, the coal heaped up over the rim in
    // glinting lumps, a shovel stuck in it, a few lumps spilled on the floor
    const U = t / 2, K = isoKit(T, ax, ay), u0 = 0.06 * U, v0 = 0.08 * U, a = 0.86 * U, b = 0.82 * U, hz = Math.round(t * 0.8);
    K.box(u0, v0, 0, a, b, hz, IC.ink2, IC.w2, IC.w3);
    for (const [p, q] of [[u0, u0 + 0.1 * U], [u0 + a - 0.1 * U, u0 + a]]) K.faceV(v0 + b, p, q, 0, hz, IC.m3, 3);
    K.faceU(u0 + a, v0 + b - 0.1 * U, v0 + b, 0, hz, IC.m4, 3);
    for (const z of [3, hz - 3]) { K.dot(u0 + 0.05 * U, v0 + b, z, IC.m1); K.dot(u0 + a - 0.05 * U, v0 + b, z, IC.m1); K.dot(u0 + a, v0 + b - 0.05 * U, z, IC.m2); }
    // the heap: lumps from the back to the front, each a dark chunk with a cold glint on its lit facet
    const lump = (u, v, z, r) => { const [x, y] = K.P(u, v, z); T.poly([[x - r, y], [x - r * 0.4, y - r * 0.9], [x + r * 0.6, y - r * 0.7], [x + r, y + 0.2], [x + r * 0.2, y + r * 0.5]], IC.m4); T.poly([[x - r * 0.7, y - 0.3], [x - r * 0.3, y - r * 0.8], [x + r * 0.2, y - r * 0.5], [x - r * 0.1, y]], IC.m3); T.px(x - r * 0.3, y - r * 0.5, pxHash(x, y) > 0.5 ? IC.m1 : IC.s2); };
    const L = [];
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) { const u = u0 + a * (0.1 + i * 0.13), v = v0 + b * (0.1 + j * 0.13), d = Math.hypot(i - 3, j - 3) / 4.3; L.push([u + pxHash(i, j) * 2, v + pxHash(j, i) * 2, hz + 1 + Math.round(t * 0.35 * Math.max(0, 1 - d * d)), 2 + pxHash(i + 7, j) * 1.5]); }
    L.sort((p, q) => p[0] + p[1] - q[0] - q[1]).forEach(l => lump(...l));
    // the shovel
    K.seg([u0 + a * 0.55, v0 + b * 0.4, hz + Math.round(t * 0.3)], [u0 + a * 0.75, v0 + b * 0.3, hz + Math.round(t * 1.15)], IC.w2);
    K.quad([[u0 + a * 0.42, v0 + b * 0.38, hz + 2], [u0 + a * 0.62, v0 + b * 0.38, hz + 2], [u0 + a * 0.6, v0 + b * 0.42, hz + Math.round(t * 0.32)], [u0 + a * 0.46, v0 + b * 0.42, hz + Math.round(t * 0.32)]], IC.m2, 0);
    K.box(u0 + a * 0.72, v0 + b * 0.28, hz + Math.round(t * 1.15), 0.14 * U, 0.06 * U, 2, IC.w1, IC.w2, IC.w3, false);
    for (const [u, v] of [[1.0, 0.7], [0.9, 1.0], [0.6, 1.05]]) lump(u * U, v * U, 0, 2);
  },
  rack(t, T, ax, ay) {
    // a tool board on the wall, planks with a ledge at the foot: tongs, hammers, a file and horseshoes on iron hooks, each
    // throwing a shadow on the boards behind it
    const U = t / 2, K = isoKit(T, ax, ay), vb = 0.06 * U, u0 = 0.12 * U, u1 = 1.88 * U, z0 = Math.round(t * 1.3), z1 = Math.round(t * 2.55);
    K.faceV(vb, u0, u1, z0, z1, IC.w2, 1);
    K.faceV(vb, u0, u1, z1 - 1, z1, IC.w1, 5); K.faceV(vb, u0, u1, z0, z0 + 1, IC.w3, 5);
    K.box(u0, 0, z0 - 3, u1 - u0, 0.2 * U, 3, IC.w1, IC.w2, IC.w3, false);
    const v = vb + 0.04 * U, sh = (fn) => { fn(1, IC.w3); fn(0, null); };
    const tool = (kind, u) => {
      const zt = z1 - 4, [hx, hy] = K.P(u, v, zt);
      T.px(hx, hy - 1, IC.m4); T.px(hx, hy, IC.m3);
      const draw = (o, col) => {
        const c = k => col || k;
        if (kind === "tongs") { T.line(hx - 1 + o, hy + 1 + o, hx - 2 + o, hy + t * 0.85 + o, c(IC.m3)); T.line(hx + 1 + o, hy + 1 + o, hx + 2 + o, hy + t * 0.85 + o, c(IC.m2)); T.line(hx - 2 + o, hy + t * 0.85 + o, hx - 1 + o, hy + t * 0.95 + o, c(IC.m1)); T.line(hx + 2 + o, hy + t * 0.85 + o, hx + 1 + o, hy + t * 0.95 + o, c(IC.m3)); }
        else if (kind === "file") { T.line(hx + o, hy + 1 + o, hx + o, hy + t * 0.25 + o, c(IC.w2)); T.line(hx + o, hy + t * 0.25 + o, hx + o, hy + t * 0.7 + o, c(IC.m1)); T.line(hx + 1 + o, hy + t * 0.25 + o, hx + 1 + o, hy + t * 0.7 + o, c(IC.m3)); }
        else if (kind === "shoe") { for (let k = 0; k < 9; k++) { const an = k / 8 * Math.PI; T.px(hx + Math.cos(an) * 3 + o, hy + 3 + Math.sin(an) * 4 + o, c(k < 4 ? IC.m1 : IC.m2)); } T.px(hx - 3 + o, hy + 3 + o, c(IC.m1)); T.px(hx + 3 + o, hy + 3 + o, c(IC.m3)); }
        else { const len = kind === "hammer" ? t * 0.75 : t * 0.55; T.line(hx + o, hy + 3 + o, hx + o, hy + len + o, c(IC.w1)); T.line(hx + 1 + o, hy + 3 + o, hx + 1 + o, hy + len + o, c(IC.w3));
          if (col) T.poly([[hx - 3 + o, hy + o], [hx + 4 + o, hy + o], [hx + 4 + o, hy + 3 + o], [hx - 3 + o, hy + 3 + o]], col);
          else { T.poly([[hx - 3, hy], [hx + 4, hy], [hx + 4, hy + 3], [hx - 3, hy + 3]], IC.m2); T.line(hx - 3, hy, hx + 3, hy, IC.m0); T.line(hx - 3, hy + 3, hx + 4, hy + 3, IC.m4); } }
      };
      sh(draw);
    };
    [["tongs", 0.3], ["hammer", 0.6], ["shoe", 0.82], ["file", 1.0], ["hammer2", 1.22], ["shoe", 1.42], ["tongs", 1.65]].forEach(([k, u]) => tool(k, u * U));
    // on the ledge: an oil can and a whetstone
    { const [x, y] = K.P(0.5 * U, 0.1 * U, z0); K.cyl(0.5 * U, 0.1 * U, z0, 0.07 * U, 4, IC.m1, IC.m2, IC.m3); T.line(x + 1, y - 4, x + 4, y - 7, IC.m2); }
    K.box(1.3 * U, 0.04 * U, z0, 0.24 * U, 0.08 * U, 2, IC.s1, IC.s2, IC.s3, false);
  },
  barrel2(t, T, ax, ay) {
    // the slack tub by the anvil: half a cask of dark water for quenching, ripples and a gleam on it, tongs across its rim,
    // a wisp of steam
    const U = t / 2, K = isoKit(T, ax, ay), [x, y] = K.P(0.5 * U, 0.5 * U, 0), r = U * 0.9, h = Math.round(t * 0.8);
    isoCask(T, x, y, r, h, { hoops: [0.14, 0.86], belly: 0.05, fill: (xx, yy) => { const d = Math.hypot(xx + 0.5 - x - r * 0.15, (yy + 0.5 - y + h) * 2) / r; return Math.abs(d - 0.45) < 0.06 || Math.abs(d - 0.75) < 0.05 ? IC.b2 : xx < x - r * 0.3 && yy < y - h ? IC.b1 : IC.b3; } });
    T.line(x - r * 0.7, y - h - 2, x + r * 0.7, y - h + 2, IC.m3); T.line(x - r * 0.7, y - h - 1, x + r * 0.7, y - h + 3, IC.m2);
    for (let k = 0; k < 7; k++) T.px(x - 2 + Math.round(Math.sin(k * 0.9) * 2), y - h - 4 - k * 2, k % 2 ? IC.s0 : IC.white);
  },
  // ---- the explorers' camp
  tent(t, T, ax, ay) {
    // a canvas ridge tent: its gable and doorway turned to the fire, flaps tied back on a warm lamplit inside with a bedroll,
    // the ridge pole poking out, roof panels sewn in strips, low walls, guy ropes to pegs, a stovepipe smoking through the roof
    const U = t / 2, K = isoKit(T, ax, ay), cv = ["#efe6cc", "#d8cba6", "#b5a47c", "#8a7a56", "#5e5139"].map(pxHex);
    const u0 = 0.15 * U, u1 = 1.85 * U, v0 = 0.12 * U, v1 = 1.75 * U, wz = Math.round(t * 0.45), rz = wz + Math.round(t * 1.15), um = (u0 + u1) / 2;
    const seams = (n, fn) => { for (let k = 1; k < n; k++) fn(k / n); };
    // the far slope, in the light
    K.quad([[u0, v0, wz], [um, v0, rz], [um, v1, rz], [u0, v1, wz]], cv[1], 0);
    seams(5, f => K.seg([u0, v0 + (v1 - v0) * f, wz], [um, v0 + (v1 - v0) * f, rz], cv[2]));
    K.seg([u0, v0, wz], [u0, v1, wz], cv[0]);
    // the stovepipe through it, smoking
    { const [x, y] = K.P(um * 0.75, v0 + (v1 - v0) * 0.3, rz - 4); T.line(x, y, x, y - t * 0.55, IC.m3); T.line(x + 1, y, x + 1, y - t * 0.55, IC.m2); T.line(x - 1, y - t * 0.55, x + 2, y - t * 0.55, IC.m3);
      for (let k = 0; k < 7; k++) T.px(x + Math.round(Math.sin(k * 0.8) * 2) + k * 0.4, y - t * 0.6 - k * 2.5, k % 2 ? IC.s1 : IC.s0); }
    // the near wall and slope, in shade
    K.faceU(u1, v0, v1, 0, wz, cv[3], 0);
    seams(5, f => K.seg([u1, v0 + (v1 - v0) * f, 0], [u1, v0 + (v1 - v0) * f, wz], cv[4]));
    K.quad([[u1, v0, wz], [um, v0, rz], [um, v1, rz], [u1, v1, wz]], cv[2], 0);
    seams(5, f => K.seg([u1, v0 + (v1 - v0) * f, wz], [um, v0 + (v1 - v0) * f, rz], cv[3]));
    K.seg([u1, v0, wz], [u1, v1, wz], cv[1]); K.seg([um, v0, rz], [um, v1 + 0.1 * U, rz], cv[4]);
    // the gable, facing the camp
    K.quad([[u0, v1, 0], [u1, v1, 0], [u1, v1, wz], [um, v1, rz], [u0, v1, wz]], cv[1], 0);
    K.seg([u0, v1, wz], [um, v1, rz], cv[0]); K.seg([um, v1, rz], [u1, v1, wz], cv[2]);
    // the doorway: lamplight inside, a bedroll on the floor, the pole up the middle, flaps tied back to each side
    const d0 = um - 0.36 * U, d1 = um + 0.36 * U, dz = rz - 6;
    K.quad([[d0, v1, 0], [d1, v1, 0], [d1, v1, wz * 0.9], [um, v1, dz], [d0, v1, wz * 0.9]], IC.w3, 0);
    K.quad([[d0 + 1, v1, 0], [d1 - 2, v1, 0], [d1 - 2, v1, wz * 0.6], [um, v1, dz * 0.7], [d0 + 1, v1, wz * 0.6]], IC.w2, 0);
    K.quad([[d0 + 1, v1, 0], [d1 - 2, v1, 0], [d1 - 2, v1, 3], [d0 + 1, v1, 3]], IC.r2, 0);
    { const [x, y] = K.P(um, v1, wz * 0.9); T.glow(x, y, t * 0.75, IC.y0, 0.5); }
    K.seg([um, v1, 0], [um, v1, dz], IC.w1);
    for (const [dd, side] of [[d0, -1], [d1, 1]]) K.quad([[dd, v1 + 0.05 * U, 2], [dd + side * 0.22 * U, v1 + 0.05 * U, wz * 0.6], [dd + side * 0.08 * U, v1 + 0.05 * U, wz * 1.25], [dd, v1 + 0.05 * U, wz * 1.35]], side < 0 ? cv[0] : cv[2], 0);
    for (const dd of [d0 - 0.12 * U, d1 + 0.12 * U]) K.dot(dd, v1 + 0.05 * U, wz * 0.75, BURLAP[3]);
    // the ridge pole's end, and guy ropes out to pegs
    K.seg([um, v1, rz], [um, v1 + 0.16 * U, rz + 1], IC.w2);
    for (const [from, to] of [[[um, v1 + 0.16 * U, rz + 1], [um + 0.05 * U, v1 + 0.62 * U, 0]], [[u1, v1, wz], [u1 + 0.3 * U, v1 + 0.35 * U, 0]], [[u1, v0 + 0.5 * U, wz], [u1 + 0.42 * U, v0 + 0.5 * U, 0]], [[u0, v1, wz], [u0 - 0.1 * U, v1 + 0.45 * U, 0]]]) {
      K.seg(from, to, cv[4]); K.seg(to, [to[0], to[1], 3], IC.w3); K.dot(to[0], to[1], 3, IC.w1);
    }
  },
  campfire(t, T, ax, ay, o) {
    // a ring of rounded stones round a bed of ash, split logs stacked in a cone and burning, sparks; over it a tripod of
    // poles lashed at the top, a chain, and an iron pot of stew with a bail handle, steaming
    const U = t / 2, K = isoKit(T, ax, ay), f = (o.frame || 0) % 4, c = 0.5 * U, [x, y] = K.P(c, c, 0);
    T.glow(x, y - 4, t * 1.9, IC.y1, 0.3);
    const stones = [];
    for (let k = 0; k < 11; k++) { const an = k / 11 * TAU; stones.push([c + Math.cos(an) * 0.36 * U, c + Math.sin(an) * 0.36 * U]); }
    const ring = back => stones.filter(([u, v]) => (u + v < 2 * c) === back).sort((p, q) => p[0] + p[1] - q[0] - q[1]).forEach(([u, v], k) => { const [sx, sy] = K.P(u, v, 0), r = 2.6 + pxHash(k, back ? 1 : 2) * 1.2; T.ball(sx, sy - r * 0.6, r, IC.s1, IC.s2, IC.s3, r * 0.75); T.px(sx - r * 0.4, sy - r * 1.1, IC.s0); });
    ring(true);
    T.disc(x, y, U * 0.32 * 2.83, (xx, yy) => pxHash(xx, yy) > 0.8 ? IC.s2 : pxHash(xx + 1, yy) > 0.6 ? IC.s3 : IC.s4);
    for (let k = 0; k < 6; k++) { const [ex, ey] = K.P(c + (pxHash(k, 3) - 0.5) * 0.4 * U, c + (pxHash(3, k) - 0.5) * 0.4 * U, 0); T.px(ex, ey, (k + f) % 3 ? IC.r1 : IC.y1); }
    // the logs leaning together
    const tip = [c, c, Math.round(t * 0.55)];
    for (let k = 0; k < 5; k++) { const an = (k + 0.3) / 5 * TAU, foot = [c + Math.cos(an) * 0.26 * U, c + Math.sin(an) * 0.26 * U, 0]; K.seg(foot, tip, IC.w3); K.seg([foot[0] - 0.5, foot[1], 0], [tip[0] - 0.5, tip[1], tip[2] - 1], k % 2 ? IC.w2 : IC.ink2); }
    // the flames: tongues in layers, red outside, yellow, a pale heart; they lick up and sway with the frame
    for (const [du, dv, k0, w] of [[0, 0, 1, 4], [-0.08, 0.05, 0.7, 3], [0.1, -0.04, 0.8, 3], [0.03, 0.1, 0.55, 2]]) {
      const [fx, fy] = K.P(c + du * U, c + dv * U, 1), hh = Math.round(t * 0.75 * k0 * (f % 2 ? 1 : 0.86));
      for (let k = 0; k < hh; k++) { const q = k / hh, sway = Math.round(Math.sin((k + f * 2.3) * 0.5) * q * 2), ww = Math.max(0.5, w * Math.sin(Math.PI * Math.min(1, q * 1.2 + 0.15)) * (1 - q * 0.3)); for (let j = Math.floor(-ww); j <= Math.ceil(ww); j++) { const e = Math.abs(j) / (ww + 0.5); T.px(fx + sway + j, fy - k, e > 0.7 ? (q > 0.6 ? IC.r2 : IC.r1) : e > 0.35 || q > 0.75 ? IC.y1 : q > 0.45 ? IC.y0 : IC.white); } }
    }
    for (let k = 0; k < 4; k++) T.px(x - 3 + k * 2 + (k + f) % 2, y - t * 0.9 - ((k * 3 + f * 2) % 7), k % 2 ? IC.y0 : IC.r1);
    ring(false);
    // the tripod: three poles lashed at the top, a chain down to the pot
    const top = [c, c, Math.round(t * 1.75)], feet = [[c - 0.48 * U, c - 0.05 * U], [c + 0.18 * U, c - 0.5 * U], [c + 0.3 * U, c + 0.45 * U]];
    for (const [fu, fv] of feet.slice(0, 2)) { K.seg([fu, fv, 0], top, IC.w3); K.seg([fu + 0.6, fv, 0], [top[0] + 0.6, top[1], top[2]], IC.w2); }
    for (let k = 0; k < 3; k++) K.dot(c, c, top[2] - 2 - k, BURLAP[k % 2 ? 2 : 1]);
    const zp = Math.round(t * 0.8);
    for (let z = zp + 9; z < top[2] - 3; z += 2) K.dot(c, c, z, z % 4 ? IC.m1 : IC.m3);
    // the pot: a squat iron belly, a rim, stew inside, the bail arching over it
    { const [px0, py0] = K.P(c, c, zp), pr = U * 0.3 * 2.83; T.ball(px0, py0 + 1, pr, IC.m2, IC.m3, IC.m4, pr * 0.62); T.px(px0 - pr * 0.5, py0 - 1, IC.m1); T.px(px0 - pr * 0.45, py0, IC.m1);
      T.disc(px0, py0 - pr * 0.45, pr * 0.92, IC.m3); T.disc(px0, py0 - pr * 0.42, pr * 0.72, (xx, yy) => pxHash(xx, yy) > 0.75 ? IC.w1 : IC.r2);
      for (let k = 0; k <= 12; k++) { const an = Math.PI + k / 12 * Math.PI; T.px(px0 + Math.cos(an) * pr * 0.95, py0 - pr * 0.45 + Math.sin(an) * pr * 0.9, k < 5 ? IC.m1 : IC.m2); }
      for (let k = 0; k < 6; k++) T.px(px0 - 2 + Math.round(Math.sin(k + f) * 1.5) + (k % 2) * 3, py0 - pr - 3 - k * 2.5, k % 2 ? IC.s0 : IC.white); }
    { const [fu, fv] = feet[2]; K.seg([fu, fv, 0], top, IC.w3); K.seg([fu + 0.6, fv, 0], [top[0] + 0.6, top[1], top[2]], IC.w1); }
  },
  logs(t, T, ax, ay) {
    // a fallen trunk dragged up to sit on (rough bark, moss on top, the sawn end showing its rings and a crack), and beside
    // it a chopping block with an axe in it
    const U = t / 2, K = isoKit(T, ax, ay), R = 0.36 * U;
    isoRoll(K, T, 0.08 * U, 1.42 * U, 0.48 * U, 0, R, (lit, a, b, s) => {
      if (b > R * 0.62 && pxNoise(s * 0.25, a * 0.6) > 0.55) return lit > 0.75 ? IC.g1 : IC.g2;
      const ridge = pxNoise(s * 0.12, Math.atan2(b, a) * 3.2) > 0.6;
      return lit > 0.55 ? (ridge ? IC.w2 : IC.w1) : lit > -0.1 ? (ridge ? IC.w3 : IC.w2) : ridge ? IC.ink2 : IC.w3;
    }, (rr, a, b) => rr > 0.86 ? IC.w3 : Math.abs(a * 0.3 - b) < 0.6 && a > 0 ? IC.w2 : Math.round(rr * 6) % 2 ? IC.w1 : IC.w0);
    // a stub of a branch
    { const [x, y] = K.P(0.6 * U, 0.48 * U, R * 2 - 1); T.box(x - 1, y - 3, 1.5, 1.5, 4, IC.w1, IC.w2, IC.w3, false); }
    // the chopping block, the axe bitten into it, and split wood
    const bu = 1.72 * U, bv = 0.55 * U, bh = Math.round(t * 0.55);
    K.cyl(bu, bv, 0, 0.26 * U, bh, IC.w0, IC.w2, IC.w3);
    { const [x, y] = K.P(bu, bv, bh); T.disc(x, y, 0.26 * U * 2.83 - 1.5, (xx, yy) => Math.round(Math.hypot(xx - x, (yy - y) * 2) / 2) % 2 ? IC.w1 : IC.w0);
      T.line(x - 3, y - t * 0.55, x + 2, y + 1, IC.w2); T.line(x - 2, y - t * 0.55, x + 3, y + 1, IC.w3);
      T.poly([[x + 1, y + 1], [x + 6, y - 1], [x + 6, y - 5], [x + 2, y - 3]], IC.m1); T.line(x + 6, y - 1, x + 6, y - 5, IC.m0); }
  },
  packs(t, T, ax, ay) {
    // explorers' rucksacks: canvas bodies with a buckled flap, side pockets and straps, a bedroll strapped on top of one,
    // a coil of rope, a rolled map
    const U = t / 2, K = isoKit(T, ax, ay);
    const pack = (u, v, a, b, h, c, roll) => {
      K.box(u, v, 0, a, b, h, c[0], c[1], c[2]);
      // the flap folds over the top and hangs down the front, with a buckled strap
      K.box(u - 0.02 * U, v - 0.02 * U, h, a + 0.04 * U, b + 0.04 * U, 2, c[0], c[1], c[2], false);
      K.faceV(v + b + 0.02 * U, u, u + a, h - h * 0.35, h + 1, c[1], 0); K.faceV(v + b + 0.02 * U, u, u + a, h - h * 0.35, h - h * 0.35 + 1, c[2], 0);
      K.faceV(v + b + 0.03 * U, u + a * 0.45, u + a * 0.58, h * 0.25, h - h * 0.3, IC.w3, 0); K.dot(u + a * 0.5, v + b + 0.03 * U, h - h * 0.3, IC.y1);
      // a pocket on the side
      K.box(u + a, v + b * 0.2, h * 0.15, 0.12 * U, b * 0.6, h * 0.4, c[1], c[1], c[2], false);
      if (roll) isoRoll(K, T, u - 0.04 * U, u + a + 0.06 * U, v + b * 0.5, h + 2, 0.17 * U, (lit) => lit > 0.4 ? IC.r1 : lit > -0.2 ? IC.r2 : IC.r3, (rr) => Math.round(rr * 4) % 2 ? IC.r1 : IC.r3);
    };
    pack(0.15 * U, 0.12 * U, 0.42 * U, 0.3 * U, Math.round(t * 0.95), [IC.g1, IC.g2, IC.g3], true);
    pack(0.62 * U, 0.4 * U, 0.34 * U, 0.26 * U, Math.round(t * 0.72), [BURLAP[2], BURLAP[3], BURLAP[4]], false);
    // the rope, coiled
    { const [x, y] = K.P(0.35 * U, 0.75 * U, 0); for (let k = 0; k < 4; k++) for (let j = 0; j < 24; j++) { const an = j / 24 * TAU, r = 5 - k * 0.6; T.px(x + Math.cos(an) * r, y - k + Math.sin(an) * r * 0.5, Math.sin(an) > 0 ? BURLAP[2] : BURLAP[1]); } T.disc(x, y - 3, 2, IC.ink2, 1); }
    isoRoll(K, T, 0.55 * U, 0.95 * U, 0.85 * U, 0, 1.6, (lit) => lit > 0.3 ? IC.w0 : IC.w1, (rr) => rr > 0.6 ? IC.w0 : IC.w1);
  },
  camplamp(t, T, ax, ay) {
    // a lantern hung from an iron hook on a stake: glass panes glowing in a dark iron frame under a little cap and ring
    const U = t / 2, K = isoKit(T, ax, ay), c = 0.5 * U, H = Math.round(t * 2.1), [x, y] = K.P(c, c, 0);
    T.line(x - 1, y, x - 1, y - H, IC.w1); T.line(x, y, x, y - H, IC.w3); T.px(x - 1, y - H - 1, IC.w2);
    K.seg([c, c, H - 2], [c + 0.45 * U, c, H], IC.m3); K.seg([c, c, H - 3], [c + 0.45 * U, c, H - 1], IC.m2);
    const [lx, ly] = K.P(c + 0.42 * U, c, H - 9), lw = 4, lh = 9;
    T.glow(lx, ly - lh / 2, t * 1.2, IC.y0, 0.42);
    T.line(lx, ly - lh - 3, lx, ly - lh - 6, IC.m3); T.px(lx - 1, ly - lh - 7, IC.m3); T.px(lx + 1, ly - lh - 7, IC.m3);
    T.poly([[lx - lw - 1, ly - lh], [lx, ly - lh - 4], [lx + lw + 1, ly - lh]], IC.m3); T.line(lx - lw, ly - lh - 1, lx, ly - lh - 3, IC.m1);
    T.poly([[lx - lw, ly - lh], [lx + lw, ly - lh], [lx + lw, ly], [lx - lw, ly]], IC.y1);
    T.poly([[lx - lw + 1, ly - lh + 1], [lx - 1, ly - lh + 1], [lx - 1, ly - 1], [lx - lw + 1, ly - 1]], IC.y0);
    T.line(lx - 2, ly - lh + 3, lx - 2, ly - 3, IC.white);
    for (const dx of [-lw, 0, lw]) T.line(lx + dx, ly - lh, lx + dx, ly, IC.m3);
    T.line(lx - lw - 1, ly + 1, lx + lw + 1, ly + 1, IC.m3);
    T.disc(x, y, 3, IC.w3, 1.5);
  },
  maptable(t, T, ax, ay) {
    // a folding camp table on crossed legs, a map spread on it with its ends curling, a route inked across it, a brass compass,
    // a stone holding a corner down, a tin mug and a candle stub
    const U = t / 2, K = isoKit(T, ax, ay), h = Math.round(t * 1.25), u0 = 0.12 * U, u1 = 0.88 * U, v0 = 0.16 * U, v1 = 0.84 * U;
    for (const v of [v0 + 0.06 * U, v1 - 0.06 * U]) { K.seg([u0 + 0.08 * U, v, 0], [u1 - 0.08 * U, v, h - 2], IC.w3); K.seg([u1 - 0.08 * U, v, 0], [u0 + 0.08 * U, v, h - 2], v > 0.5 * U ? IC.w1 : IC.w2); K.seg([u1 - 0.08 * U + 0.5, v, 0], [u0 + 0.08 * U + 0.5, v, h - 2], IC.w2); }
    K.seg([0.5 * U, v0 + 0.06 * U, h * 0.5], [0.5 * U, v1 - 0.06 * U, h * 0.5], IC.w3);
    K.box(u0, v0, h - 2, u1 - u0, v1 - v0, 2, IC.w1, IC.w2, IC.w3);
    // the map: parchment, a coastline, a dotted route, an X; rolled up at both ends
    const mu0 = u0 + 0.06 * U, mu1 = u1 - 0.06 * U, mv0 = v0 + 0.1 * U, mv1 = v1 - 0.1 * U;
    K.flat(mu0, mv0, mu1, mv1, h + 1, (xx, yy) => pxHash(xx >> 1, yy) > 0.9 ? IC.y1 : IC.y0, 0);
    for (let k = 0; k <= 16; k++) { const f = k / 16; K.dot(mu0 + (mu1 - mu0) * f, mv0 + (mv1 - mv0) * (0.3 + 0.18 * Math.sin(f * 7)), h + 1, IC.b2); }
    for (let k = 0; k <= 10; k++) { const f = k / 10; if (k % 2) K.dot(mu0 + (mu1 - mu0) * (0.15 + f * 0.6), mv0 + (mv1 - mv0) * (0.75 - f * 0.25), h + 1, IC.r2); }
    { const [xx, yy] = K.P(mu0 + (mu1 - mu0) * 0.78, mv0 + (mv1 - mv0) * 0.48, h + 1); T.px(xx - 1, yy - 1, IC.r2); T.px(xx + 1, yy + 1, IC.r2); T.px(xx, yy, IC.r2); T.px(xx + 1, yy - 1, IC.r2); T.px(xx - 1, yy + 1, IC.r2); }
    for (const u of [mu0, mu1]) isoRoll(K, T, u - 0.5, u + 0.5, (mv0 + mv1) / 2 - (mv1 - mv0) / 2, h + 1, 1.3, lit => lit > 0.2 ? IC.y0 : IC.y1, () => IC.w1);
    // the compass, a stone on a corner, a mug, a candle
    { const [cx2, cy2] = K.P(mu0 + 0.12 * U, mv1 - 0.1 * U, h + 1); T.disc(cx2, cy2 - 1, 3.2, IC.y1, 1.7); T.disc(cx2, cy2 - 1.4, 2.2, IC.white, 1.1); T.px(cx2, cy2 - 2, IC.r2); T.px(cx2 + 1, cy2 - 1, IC.ink); }
    { const [sx, sy] = K.P(mu1 - 0.04 * U, mv0 + 0.04 * U, h + 1); T.ball(sx, sy - 1.5, 2.6, IC.s1, IC.s2, IC.s3, 1.8); }
    K.cyl(u1 - 0.12 * U, v1 - 0.08 * U, h, 0.07 * U, 5, IC.m3, IC.m1, IC.m2);
    { const [cx3, cy3] = K.P(u0 + 0.1 * U, v0 + 0.1 * U, h); T.line(cx3, cy3, cx3, cy3 - 4, IC.s0); T.px(cx3, cy3 - 5, IC.y0); T.px(cx3, cy3 - 6, IC.y1); T.glow(cx3, cy3 - 6, U * 0.6, IC.y0, 0.4); }
    // where the next trip goes: a little red pennant on a pin, stuck in the X
    { const [xx, yy] = K.P(mu0 + (mu1 - mu0) * 0.78, mv0 + (mv1 - mv0) * 0.48, h + 1), ph = Math.max(6, Math.round(t * 0.45));
      T.line(xx, yy - 1, xx, yy - ph, IC.m2); T.px(xx, yy - ph - 1, IC.m0);
      for (let k = 0; k < 4; k++) for (let j = 0; j <= 3 - k; j++) T.px(xx + 1 + k, yy - ph + j + Math.floor(k / 2), j === 0 ? IC.r1 : IC.r2); }
  },
  // ---- the snowfields (Runa's clearing)
  runahut(t, T, ax, ay) {
    // Runa's round hut: a drum of logs laid in rings, lit on the left, under a fat cap of snow with icicles along its eave; a low
    // arched door with a step, a round window glowing amber beside it with a cross of glazing bars, a stone chimney through the
    // snow, and her sled leaning on the wall, its runners curled up at the front
    const U = t / 2, K = isoKit(T, ax, ay), c = U, r = 0.78 * U, rx = r * 2.83, hgt = Math.round(t * 0.95), [x, y] = K.P(c, c, 0);
    // (weathered logs, greyer than the furniture's oak, so the grain texture leaves them as plain rings)
    const LOG = ["#a37b4b", "#8a6238", "#6e4a2a", "#3b2414"].map(pxHex);
    T.grain(3, () => { for (let z = 0; z <= hgt; z++) { const seam = z % 3 === 0; T.disc(x, y - z, rx, xx => { const f = (xx + 0.5 - x) / rx; return seam ? (f < -0.4 ? LOG[2] : LOG[3]) : f < -0.55 ? LOG[0] : f < 0.05 ? LOG[1] : f < 0.55 ? LOG[2] : LOG[3]; }); } });
    // the log ends where the rings meet the door frame, and the door: dark planks in an arch, a ring for a handle, a stone step
    const dx = x - rx * 0.32, dw = Math.max(3, Math.round(rx * 0.28)), dh = Math.round(hgt * 0.72), dy = y + rx * 0.45;
    T.poly([[dx - dw, dy], [dx + dw, dy], [dx + dw, dy - dh + dw], [dx, dy - dh], [dx - dw, dy - dh + dw]], IC.w3);
    T.poly([[dx - dw + 1, dy], [dx + dw - 1, dy], [dx + dw - 1, dy - dh + dw + 1], [dx, dy - dh + 1], [dx - dw + 1, dy - dh + dw + 1]], pxHex("#3b2414"));
    T.line(dx, dy - 1, dx, dy - dh + 2, IC.w3); T.px(dx + dw - 2, dy - dh * 0.45, IC.y1);
    T.box(dx - dw - 1, dy, 1.2, 1.2, 2, IC.s1, IC.s2, IC.s3);
    // the round window, amber, a cross of bars, its sill heaped with snow
    const wx = x + rx * 0.34, wy = y - hgt * 0.5 + rx * 0.3, wr = Math.max(2.5, rx * 0.17);
    T.glow(wx, wy, t * 0.9, IC.y1, 0.45);
    T.disc(wx, wy, wr + 1, IC.w3, wr + 1); T.disc(wx, wy, wr, (xx, yy) => xx < wx && yy < wy ? IC.y0 : IC.y1, wr);
    T.line(wx - wr, wy, wx + wr, wy, IC.w3); T.line(wx, wy - wr, wx, wy + wr, IC.w3); T.px(wx - 1, wy - 1, IC.white);
    T.disc(wx, wy + wr + 1, wr + 1.5, SNOW[1], 1);
    // the chimney: rough stones up through the cap, a cap of snow on it
    const [cx2, cy2] = K.P(c + 0.35 * U, c - 0.3 * U, hgt + Math.round(t * 0.35));
    T.box(cx2 - 2, cy2, 1.5, 1.5, Math.round(t * 0.45), IC.s1, IC.s2, IC.s3);
    // the cap of snow: a fat dome overhanging the walls, blue in its shade, a lip along the eave with icicles hanging off it
    T.ball(x, y - hgt - r * 0.2, rx * 1.12, SNOW[0], SNOW[1], SNOW[2], rx * 0.78);
    T.disc(x, y - hgt + 1, rx * 1.1, (xx) => xx < x - rx * 0.2 ? SNOW[1] : SNOW[2], rx * 0.42);
    for (let k = -4; k <= 4; k++) { const ix = x + k * rx * 0.22, iy = y - hgt + 1 + rx * 0.42 * Math.sqrt(Math.max(0, 1 - (k * 0.22 / 1.1) ** 2)), n = 1 + Math.floor(pxHash(k, 7) * 3); for (let j = 0; j < n; j++) T.px(ix, iy + j, j === n - 1 ? ICE[1] : ICE[0]); }
    T.box(cx2 - 2, cy2 - Math.round(t * 0.45) + 1, 1.5, 1.5, 1, SNOW[0], SNOW[1], SNOW[2], false);
    // the sled against the right of the wall: a slatted bed on two runners that curl up at the front
    const [sx, sy] = K.P(1.86 * U, 0.6 * U, 0);
    for (let k = 0; k < 4; k++) T.line(sx - 1 + k, sy - 2 - k * 3, sx + 3 + k, sy - k * 3, k % 2 ? IC.w1 : IC.w0);
    for (const o of [0, 4]) { T.line(sx - 2 + o, sy, sx - 2 + o, sy - 13, IC.r2); T.px(sx - 3 + o, sy - 14, IC.r2); T.px(sx - 3 + o, sy - 15, IC.r1); }
  },
  pond(t, T, ax, ay) {
    // the frozen pond: grey-blue ice lying in a rim of drifted snow, streaks of white where the wind scoured it, one round hole
    // cut in it, black water ringed with broken ice; by the hole a little three-legged stool, and a short rod propped over it
    // with its line down into the water
    const U = t / 2, K = isoKit(T, ax, ay), c = U, [x, y] = K.P(c, c, 0), rx = 0.92 * U * 2.83;
    T.disc(x, y, rx + 2, (xx) => xx < x ? SNOW[1] : SNOW[2], (rx + 2) / 2);
    T.disc(x, y, rx, (xx, yy) => { const s = Math.abs(((xx - x) * 0.5 + (yy - y) * 1.2 + 40) % 9 - 4.5); return s < 0.6 ? SNOW[0] : pxHash(xx, yy) > 0.97 ? ICE[0] : (yy < y - rx * 0.15 ? ICE[1] : ICE[2]); }, rx / 2);
    const [hx, hy] = K.P(c + 0.25 * U, c + 0.2 * U, 0), hr = Math.max(3, U * 0.5);
    T.disc(hx, hy, hr + 1.5, ICE[0], (hr + 1.5) / 2); T.disc(hx, hy, hr, pxHex("#0e1832"), hr / 2); T.disc(hx - 1, hy - 0.4, hr * 0.5, pxHex("#1d2e56"), hr / 4);
    // the stool, and the rod resting across its seat
    const [sx, sy] = K.P(c - 0.45 * U, c + 0.35 * U, 0), sh = Math.round(t * 0.42);
    for (const lx of [-2, 0, 2]) T.line(sx + lx, sy - (lx ? 0 : 1), sx + lx * 0.5, sy - sh, IC.w3);
    T.disc(sx, sy - sh, 3.2, IC.w1, 1.6); T.px(sx - 2, sy - sh - 1, IC.w0);
    T.line(sx - 2, sy - sh - 1, hx + 1, hy - t * 0.7, IC.w2); T.line(hx + 1, hy - t * 0.7, hx + 1, hy, IC.s1);
    T.px(hx + 1, hy - 1, IC.r1);
  },
  hotspring(t, T, ax, ay) {
    // the hot spring: dark wet stones in a ring round warm water (teal in the steam, paler at its middle), snow kept back from
    // its edge by the heat, and frost lilies, white with a blush, growing between the stones
    const U = t / 2, K = isoKit(T, ax, ay), [x, y] = K.P(U, 0.5 * U, 0), rx = 0.9 * U * 2.83, ry = rx * 0.42;
    T.disc(x, y, rx + 1, IC.s4, ry + 1.5);
    T.disc(x, y, rx - 2, (xx, yy) => { const d = Math.hypot((xx - x) / rx, (yy - y) / ry); return d < 0.35 ? pxHex("#8fd8ef") : d < 0.7 ? IC.b1 : IC.b2; }, ry - 1);
    for (let k = 0; k < 16; k++) { const an = k / 16 * TAU, sx = x + Math.cos(an) * rx, sy = y + Math.sin(an) * ry, sr = 1.8 + pxHash(k, 4) * 1.4; T.ball(sx, sy - sr * 0.4, sr, IC.s2, IC.s3, IC.s4, sr * 0.75); }
    for (const [an, col] of [[2.4, IC.p0], [0.5, SNOW[0]], [3.6, SNOW[0]], [5.6, IC.p0]]) { const fx = x + Math.cos(an) * (rx + 1), fy = y + Math.sin(an) * (ry + 1); T.px(fx, fy - 2, col); T.px(fx - 1, fy - 1, col); T.px(fx + 1, fy - 1, col); T.px(fx, fy - 1, IC.y1); T.px(fx, fy, IC.g2); }
  },
  icedoor(t, T, ax, ay) {
    // the door of ice at the back of the clearing, half sunk in a drift: a tall arch of clear blue ice in a frame of older,
    // whiter ice, frost ferns across it, faintly lit blue from somewhere inside; the drift heaped up over its foot
    const U = t / 2, K = isoKit(T, ax, ay), [x, y] = K.P(0.5 * U, 0.5 * U, 0), w = Math.round(t * 0.34), h = Math.round(t * 1.55);
    T.glow(x, y - h * 0.5, t * 1.3, IC.b0, 0.4);
    T.poly([[x - w - 2, y], [x + w + 2, y], [x + w + 2, y - h + w], [x, y - h - 3], [x - w - 2, y - h + w]], (xx) => xx < x - w * 0.4 ? ICE[0] : ICE[1]);
    T.poly([[x - w, y], [x + w, y], [x + w, y - h + w + 1], [x, y - h], [x - w, y - h + w + 1]], (xx, yy) => (Math.abs((xx - x) * 2 + (yy % 7)) % 9 < 1 ? ICE[0] : yy < y - h * 0.6 ? ICE[2] : pxHex("#8fd8ef")));
    for (let k = 0; k < 5; k++) T.px(x - w + 2 + k * 2, y - h * 0.55 - (k % 2) * 2, IC.white);
    T.ball(x - 1, y + 1, w * 2.4, SNOW[0], SNOW[1], SNOW[2], w * 1.2);
  },
  firs(t, T, ax, ay) { snowFir(T, ...isoKit(T, ax, ay).P(t * 0.28, t * 0.28, 0), t * 2.2); snowFir(T, ...isoKit(T, ax, ay).P(t * 0.38, t * 0.1, 0), t * 1.3); },
  firs2(t, T, ax, ay) { snowFir(T, ...isoKit(T, ax, ay).P(t * 0.25, t * 0.25, 0), t * 1.8); },
  // ---- the lab
  labdesk(t, T, ax, ay) {
    // an alchemist's bench on square legs with a shelf of jars below: on its thick top a brick athanor with a fire showing
    // through its arched door, an alembic over a little burner dripping into a flask, a retort, a skull, an open grimoire and
    // two candles
    const U = t / 2, K = isoKit(T, ax, ay), u0 = 0.06 * U, u1 = 1.94 * U, v0 = 0.04 * U, v1 = 0.84 * U, h = Math.round(t * 1.45), lg = 0.12 * U;
    const legs = [[u0, v0], [u1 - lg, v0], [u0, v1 - lg], [u1 - lg, v1 - lg]];
    for (const [u, v] of legs.slice(0, 2)) K.box(u, v, 0, lg, lg, h - 4, IC.w1, IC.w2, IC.w3);
    // the low shelf: crocks and stoppered jars
    K.box(u0 + lg * 0.5, v0 + lg * 0.5, Math.round(t * 0.2), u1 - u0 - lg, v1 - v0 - lg, 2, IC.w1, IC.w2, IC.w3, false);
    [["crock", 0.4], ["jar", 0.75], ["bottle", 1.0], ["jar", 1.25], ["crock", 1.6]].forEach(([k, u], i) => isoGoods(K, T, k, u * U, 0.45 * U, Math.round(t * 0.2) + 2, U, i + 2));
    for (const [u, v] of legs.slice(2)) K.box(u, v, 0, lg, lg, h - 4, IC.w1, IC.w2, IC.w3);
    K.box(u0, v0 + lg, h - 7, u1 - u0, 0.06 * U, 3, IC.w2, IC.w2, IC.w3, false);
    K.faceV(v1, u0 + lg, u1 - lg, h - 7, h - 4, IC.w3, 1);
    K.box(u0 - 0.04 * U, v0 - 0.02 * U, h - 4, u1 - u0 + 0.08 * U, v1 - v0 + 0.06 * U, 4, IC.w1, IC.w2, IC.w3);
    const on = (u, v) => [u * U, v * U, h];
    // the athanor: coursed brick, an arched door with the fire in it, a dome, a short flue
    { const [u, v, z] = on(0.28, 0.4), a = 0.36 * U, hz = Math.round(t * 0.85);
      const brick = side => (px, py) => { const yy = side ? py + px * 0.5 : py - px * 0.5, row = Math.floor(yy / 3), along = px + (((row % 2) + 2) % 2) * 3; return (((Math.floor(yy) % 3) + 3) % 3 === 0 || ((along % 6) + 6) % 6 === 0) ? IC.s3 : side ? IC.s2 : IC.s1; };
      K.box(u - a / 2, v - a / 2, z, a, a, hz, IC.s1, brick(0), brick(1));
      K.quad([[u - a * 0.2, v + a / 2, z + 2], [u + a * 0.2, v + a / 2, z + 2], [u + a * 0.2, v + a / 2, z + hz * 0.45], [u, v + a / 2, z + hz * 0.55], [u - a * 0.2, v + a / 2, z + hz * 0.45]], IC.ink2, 0);
      K.quad([[u - a * 0.14, v + a / 2, z + 2], [u + a * 0.14, v + a / 2, z + 2], [u + a * 0.14, v + a / 2, z + hz * 0.3], [u - a * 0.14, v + a / 2, z + hz * 0.3]], IC.r1, 0);
      K.dot(u, v + a / 2, z + 4, IC.y0); K.dot(u - 1, v + a / 2, z + 3, IC.y1);
      const [dx, dy] = K.P(u, v, z + hz); T.ball(dx, dy, a * 1.3, IC.s1, IC.s2, IC.s3, a * 0.95); T.px(dx - a * 0.5, dy - a * 0.4, IC.s0);
      K.box(u - 1, v - 1, z + hz + a * 0.7, 2, 2, 5, IC.s2, IC.s3, IC.s4, false);
      const [gx, gy] = K.P(u, v + a / 2, z + 4); T.glow(gx, gy, U * 0.9, IC.y1, 0.4); }
    // the alembic: a round flask over a burner, its head and long beak running down into a pink flask
    { const [u, v, z] = on(0.82, 0.42), [x, y] = K.P(u, v, z), r = 0.2 * U * 2.83 * 0.55;
      K.cyl(u, v, z, 0.08 * U, 3, IC.m2, IC.m2, IC.m3); T.px(x, y - 5, IC.y0); T.px(x, y - 6, IC.y1);
      T.ball(x, y - 7 - r, r, IC.white, IC.b0, IC.b1); T.disc(x, y - 7 - r * 0.6, r * 0.8, IC.g0, r * 0.35); T.px(x - r * 0.45, y - 7 - r * 1.4, IC.white);
      T.line(x, y - 7 - 2 * r, x, y - 10 - 2 * r, IC.b0); T.ball(x, y - 12 - 2 * r, 3, IC.white, IC.b0, IC.b1, 2.5);
      const [rx, ry] = K.P(1.22 * U, 0.42 * U, h); T.line(x + 2, y - 13 - 2 * r, rx - 1, ry - 8, IC.b1); T.line(x + 2, y - 12 - 2 * r, rx - 1, ry - 7, IC.b0);
      T.ball(rx, ry - 4, 3.6, IC.white, IC.p0, IC.p1, 3.2); T.line(rx, ry - 7, rx, ry - 9, IC.p0); }
    // a retort on its ring stand, a skull, the grimoire and its candles
    { const [x, y] = K.P(1.55 * U, 0.3 * U, h); T.line(x - 3, y, x - 3, y - 7, IC.m3); T.disc(x, y - 7, 4, IC.m3, 1.5); T.ball(x, y - 10, 3.8, IC.white, IC.g0, IC.g1, 3.4); T.line(x + 3, y - 12, x + 9, y - 9, IC.g0); T.line(x + 3, y - 13, x + 9, y - 10, IC.white); T.px(x - 1, y - 12, IC.white); }
    { const [x, y] = K.P(1.82 * U, 0.2 * U, h); T.ball(x, y - 4, 4, IC.s0, IC.s0, IC.s1, 3.6); T.box(x - 2, y - 2, 1.6, 1.6, 2, IC.s1, IC.s0, IC.s1, false); T.px(x - 2, y - 5, IC.ink); T.px(x + 1, y - 5, IC.ink); T.px(x - 1, y - 5, IC.ink2); T.px(x, y - 3, IC.ink2); }
    { const u = 1.48 * U, v = 0.66 * U, w2 = 0.24 * U, d2 = 0.16 * U;
      K.flat(u - w2, v - d2, u + w2, v + d2, h + 1, IC.p3); K.flat(u - w2 + 0.6, v - d2 + 0.4, u - 0.3, v + d2 - 0.4, h + 2, IC.y0); K.flat(u + 0.3, v - d2 + 0.4, u + w2 - 0.6, v + d2 - 0.4, h + 2, IC.white);
      for (let k = 0; k < 3; k++) { K.seg([u - w2 + 2, v - d2 + 1.5 + k * 1.6, h + 2], [u - 1.5, v - d2 + 1.5 + k * 1.6, h + 2], IC.w2); K.seg([u + 1.5, v - d2 + 1.5 + k * 1.6, h + 2], [u + w2 - 2, v - d2 + 1.5 + k * 1.6, h + 2], k === 1 ? IC.r2 : IC.s2); }
      for (const du of [-0.42, 0.4]) { const [x, y] = K.P(u + du * U, v + 0.06 * U, h); T.disc(x, y, 2, IC.y1, 1); T.line(x, y - 1, x, y - 6, IC.s0); T.px(x - 1, y - 2, IC.white); T.px(x, y - 7, IC.y0); T.px(x, y - 8, IC.y1); T.glow(x, y - 8, U * 0.55, IC.y0, 0.38); } }
  },
  jars(t, T, ax, ay) {
    // a tall bookcase against the wall: old books on four shelves (cloth spines of different widths and heights, gilt bands,
    // a gap, one leaning), specimen jars and a skull on the top shelf, a cornice
    const U = t / 2, K = isoKit(T, ax, ay + 1), D = 0.5 * U, v0 = 0.04 * U, v1 = 0.96 * U, H = Math.round(t * 3.2), sd = 0.08 * U;
    K.faceU(0.02, v0, v1, 0, H, IC.w3, 2);
    K.faceU(0.03, v0 + sd, v1 - sd, H * 0.86, H, IC.ink2, 2);
    K.box(0, v0, 0, D, sd, H, IC.w1, IC.w2, IC.w3);
    const rows = 5, z0 = 3, rh = (H - z0 - 2) / rows, uf = D * 0.78;
    const BOOKS = [[IC.r1, IC.r2, IC.r3], [IC.b1, IC.b2, IC.b3], [IC.g1, IC.g2, IC.g3], [IC.p1, IC.p2, IC.p3], [IC.y1, IC.w1, IC.w2], [IC.l2, IC.l3, IC.l4], [IC.s1, IC.s2, IC.s3]];
    K.faceU(D, v0, v1, 0, z0, IC.w3);
    for (let r = 0; r < rows; r++) {
      const zs = z0 + r * rh;
      K.box(0, v0 + sd, zs - 2, D, v1 - v0 - 2 * sd, 2, IC.w1, IC.w2, IC.w2, false);
      if (r === rows - 1) {
        for (const [v, k] of [[0.25, 3], [0.72, 0]]) isoGoods(K, T, "jar", uf * 0.6, v * U, zs, U, k);
        const [sx, sy] = K.P(uf * 0.6, 0.5 * U, zs); T.ball(sx, sy - 4, 3.6, IC.s0, IC.s0, IC.s1, 3.4); T.px(sx - 1, sy - 5, IC.ink); T.px(sx + 2, sy - 5, IC.ink); T.px(sx, sy - 3, IC.ink2);
        continue;
      }
      let v = v0 + sd + 0.02 * U, k = r * 9;
      while (v < v1 - sd - 0.1 * U) {
        k++;
        if (pxHash(k, r + 1) > 0.9) { v += 0.1 * U; continue; }
        const bw = (0.07 + 0.05 * pxHash(k, 3)) * U, tall = rh * (0.62 + 0.3 * pxHash(k, 7)), c = BOOKS[Math.floor(pxHash(k, 11) * BOOKS.length)];
        const lean = r === 2 && v > 0.55 * U && v < 0.7 * U;
        if (lean) { K.quad([[uf, v, zs], [uf, v + bw, zs], [uf, v + bw + tall * 0.5 / 2, zs + tall * 0.85], [uf, v + tall * 0.5 / 2, zs + tall * 0.85]], c[1], 0); v += bw + 0.14 * U; continue; }
        K.faceU(uf, v, v + bw, zs, zs + tall, c[1], 0);
        K.faceU(uf, v, v + bw * 0.3, zs, zs + tall, c[0], 0); K.faceU(uf, v + bw * 0.75, v + bw, zs, zs + tall, c[2], 0);
        K.faceU(uf, v, v + bw, zs + tall * 0.8, zs + tall * 0.8 + 1, IC.y0, 0); K.faceU(uf, v, v + bw, zs + 2, zs + 3, IC.y1, 0);
        K.flat(0.1 * U, v, uf, v + bw, zs + tall, IC.s0, 0);
        v += bw + 0.01 * U;
      }
    }
    K.box(0, v1 - sd, 0, D, sd, H, IC.w1, IC.w2, IC.w3);
    K.box(0, v0 - 0.06 * U, H, D + 0.1 * U, v1 - v0 + 0.12 * U, 3, IC.w1, IC.w2, IC.w3);
    K.faceU(D + 0.1 * U, v0 - 0.06 * U, v1 + 0.06 * U, H + 1, H + 2, IC.w1, 6);
  },
  scope(t, T, ax, ay) {
    // a brass refractor on a wooden tripod, aimed up at the window: its tube in segments with darker rings, a glass at the
    // big end catching the light, an eyepiece and a little finder on top
    const U = t / 2, K = isoKit(T, ax, ay), c = 0.5 * U, zh = Math.round(t * 1.3), head = [c, c, zh];
    for (const [fu, fv] of [[c - 0.4 * U, c - 0.1 * U], [c + 0.1 * U, c - 0.42 * U]]) { K.seg([fu, fv, 0], head, IC.w3); K.seg([fu + 0.5, fv, 0], [head[0] + 0.5, head[1], head[2]], IC.w2); }
    K.box(c - 1.5, c - 1.5, zh - 2, 3, 3, 4, IC.m1, IC.m2, IC.m3, false);
    // the tube: from the eyepiece (low, toward us) up to the objective (high, toward the window)
    const e = K.P(c + 0.42 * U, c + 0.2 * U, zh - 3), o = K.P(c - 0.55 * U, c + 0.35 * U, zh + Math.round(t * 1.0));
    const len = Math.hypot(o[0] - e[0], o[1] - e[1]), nx = -(o[1] - e[1]) / len, ny = (o[0] - e[0]) / len;
    for (let k = 0; k <= len; k++) {
      const f = k / len, r = 1.6 + f * 1.6, ring = Math.abs(f - 0.35) < 0.03 || Math.abs(f - 0.7) < 0.03 || f > 0.93;
      for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) {
        const q = j / r, col = ring ? (q < -0.3 ? BRASS[2] : BRASS[4]) : q < -0.55 ? BRASS[0] : q < 0.1 ? BRASS[1] : q < 0.6 ? BRASS[2] : BRASS[3];
        T.px(e[0] + (o[0] - e[0]) * f + nx * j, e[1] + (o[1] - e[1]) * f + ny * j, col);
      }
    }
    T.disc(o[0], o[1], 3, IC.b1, 2.2); T.px(o[0] - 1, o[1] - 1, IC.white); T.px(o[0] + 1, o[1], IC.b0);
    T.line(e[0], e[1], e[0] + 3, e[1] + 2, IC.m3); T.line(e[0] + 1, e[1] - 1, e[0] + 4, e[1] + 1, IC.m2);
    const fm = [e[0] + (o[0] - e[0]) * 0.45 - nx * 3.5, e[1] + (o[1] - e[1]) * 0.45 - ny * 3.5]; T.line(fm[0], fm[1], fm[0] + (o[0] - e[0]) * 0.22, fm[1] + (o[1] - e[1]) * 0.22, BRASS[1]);
    { const [fu, fv] = [c + 0.38 * U, c + 0.36 * U]; K.seg([fu, fv, 0], head, IC.w3); K.seg([fu + 0.5, fv, 0], [head[0] + 0.5, head[1], head[2]], IC.w1); }
  },
  books(t, T, ax, ay) {
    // two piles of heavy old books, covers in faded cloth with the pages showing cream along their edges; a candle melted
    // onto the taller pile, a scroll leaning on it
    const U = t / 2, K = isoKit(T, ax, ay), cols = [[IC.r1, IC.r2, IC.r3], [IC.b1, IC.b2, IC.b3], [IC.g1, IC.g2, IC.g3], [IC.p1, IC.p2, IC.p3], [IC.l2, IC.l3, IC.l4], [IC.y1, IC.w1, IC.w2]];
    const pile = (u, v, n, s0) => {
      let z = 0;
      for (let k = 0; k < n; k++) {
        const c = cols[Math.floor(pxHash(k, s0) * cols.length)], a = (0.36 + 0.14 * pxHash(k, s0 + 1)) * U, b = (0.26 + 0.1 * pxHash(k, s0 + 2)) * U, hz = 3 + Math.round(pxHash(k, s0 + 3) * 2);
        const du = (pxHash(k, s0 + 4) - 0.5) * 0.12 * U, dv = (pxHash(k, s0 + 5) - 0.5) * 0.1 * U, spine = k % 2;
        K.box(u - a / 2 + du, v - b / 2 + dv, z, a, b, hz, c[0], spine ? c[1] : IC.s0, spine ? IC.s1 : c[2], false);
        if (!spine) K.faceV(v + b / 2 + dv, u - a / 2 + du, u + a / 2 + du, z + 1, z + hz - 1, IC.s1, 4);
        K.faceV(v + b / 2 + dv, u - a / 2 + du, u + a / 2 + du, z + hz - 1, z + hz, c[0], 0);
        z += hz;
      }
      return z;
    };
    const zA = pile(0.38 * U, 0.38 * U, 7, 3);
    pile(0.72 * U, 0.72 * U, 4, 9);
    { const [x, y] = K.P(0.38 * U, 0.38 * U, zA); T.disc(x, y, 3, IC.s0, 1.5); T.line(x - 2, y, x - 2, y + 4, IC.s0); T.line(x, y - 1, x, y - 8, IC.white); T.line(x + 1, y - 1, x + 1, y - 8, IC.s0); T.px(x, y - 9, IC.y0); T.px(x, y - 10, IC.y1); T.px(x, y - 11, IC.y0); T.glow(x, y - 10, U * 0.7, IC.y0, 0.4); }
    { const [x, y] = K.P(0.95 * U, 0.3 * U, 0); T.line(x, y, x - 4, y - t * 0.6, IC.y0); T.line(x + 1, y, x - 3, y - t * 0.6, IC.y1); T.line(x + 2, y, x - 2, y - t * 0.6, IC.w1); T.px(x - 4, y - t * 0.6 - 1, IC.r2); }
  },
  garden(t, T, ax, ay, o) {
    // a long wooden planter over two tiles, a rim of lighter boards, dark soil inside, three plots along it (four, once Fennel has dug one more)
    const n = Math.max(3, (o.p || []).length), m = t * 0.05, a = t - 2 * m, b = t / 2 - 2 * m, h = Math.max(3, Math.round(t * 0.26)), x = ax, y = ay + 2 * m;
    T.box(x, y, a, b, h, IC.w0, IC.w2, IC.w3);
    const ia = a - 1.5, ib = b - 1.5, x0 = x, y0 = y + 1.5 - h;
    T.poly([[x0, y0], [x0 + 2 * ia, y0 + ia], [x0 + 2 * ia - 2 * ib, y0 + ia + ib], [x0 - 2 * ib, y0 + ib]], (px, py) => pxHash(px, py) > 0.8 ? IC.w2 : IC.w3);
    // the boards between the plots
    for (let j = 1; j < n; j++) for (let k = 0; k <= 4; k++) { const f = j / n, v = k / 4; T.px(x0 + 2 * ia * f - 2 * ib * v, y0 + ia * f + ib * v, IC.w1); }
    (o.p || []).forEach((q, k) => { if (q) { const f = (k + 0.5) / n; gardenPlant(T, x0 + 2 * ia * f - ib, y0 + ia * f + ib / 2 + 1, q[0], q[1], t * 2.2); } });
    // a corner post at each outer corner, standing a little proud of the rim with a pale cap
    for (const [px, py] of [[x - 2 * b, y + b], [x + 2 * a - 2 * b, y + a + b], [x + 2 * a, y + a]]) {
      for (let z = 0; z <= h + 2; z++) { T.px(px - 1, py - z, IC.w1); T.px(px, py - z, IC.w2); T.px(px + 1, py - z, IC.w3); }
      T.px(px - 1, py - h - 3, IC.w0); T.px(px, py - h - 3, IC.w0); T.px(px + 1, py - h - 3, IC.w1);
    }
    // a label on a stake pushed in along the front of each plot: a blank card while it's empty, the seed's colour on it once something's sown
    for (let k = 0; k < n; k++) {
      const q = (o.p || [])[k], f = (k + 0.25) / n, lx = Math.round(x0 + 2 * ia * f - 2 * ib), ly = Math.round(y0 + ia * f + ib), lh = 3;
      for (let z = 0; z < lh; z++) { T.px(lx, ly - z, IC.w2); T.px(lx + 1, ly - z, IC.w3); }
      const top = ly - lh, ink = q ? (GARDEN_TAG[q[0]] || IC.g1) : IC.s2;
      for (let a = -3; a <= 3; a++) for (let bb = -5; bb <= 0; bb++) { const sl = Math.round(a * 0.5); T.px(lx + 1 + a, top + bb + sl, bb === 0 || a === 3 ? IC.ink2 : bb === -5 || a === -3 ? IC.w2 : IC.s0); }
      T.px(lx - 1, top - 2, ink); T.px(lx, top - 2, ink); T.px(lx + 1, top - 1, ink); T.px(lx + 2, top - 1, q ? ink : IC.s1); T.px(lx + 1, top - 2, IC.s1);
    }
  },
  bench(t, T, ax, ay) {
    // a garden bench: ends of bent root-wood (a back post, a front leg, an armrest curling over at the front), a seat of oak
    // slats with gaps between, three slats for the back; a cushion of moss on one end and a glowcap at the far foot
    const U = t / 2, K = isoKit(T, ax, ay), R = BED_ROOT, W = [IC.w1, IC.w2, IC.w3];
    const u0 = 0.04 * U, u1 = 0.96 * U, ew = 0.09 * U, vb = 0.16 * U, vf = 0.86 * U, zs = Math.round(t * 0.42), zr = zs + Math.round(t * 0.24), zt = Math.round(t * 1.06);
    const end = u => {
      K.box(u, vb, 0, ew, 0.09 * U, zt, R[1], R[2], R[3]);
      K.box(u, vf - 0.09 * U, 0, ew, 0.09 * U, zr, R[1], R[2], R[3]);
      K.box(u, vb + 0.06 * U, zs - 3, ew, vf - vb - 0.1 * U, 2, R[1], R[2], R[3], false);
      K.box(u, vb + 0.06 * U, zr, ew, vf - vb - 0.02 * U, 2, R[0], R[1], R[3], false);
      const [sx, sy] = K.P(u + ew / 2, vf + 0.02 * U, zr - 1); T.disc(sx, sy, 1.8, R[2], 1.8); T.px(sx - 1, sy - 1, R[0]); T.px(sx, sy, R[3]);
      K.dot(u + ew / 2, vb + 0.045 * U, zt + 1, R[0]);
    };
    end(u0);
    bedGlowcap(T, ...K.P(u0 + 0.16 * U, vb + 0.06 * U, 0), Math.round(t * 0.3), t * 0.13);
    // the back: three slats between the posts
    for (let k = 0; k < 3; k++) { const z = zs + 4 + k * Math.round((zt - zs - 6) / 3); K.box(u0 + ew, vb + 0.02 * U, z, u1 - u0 - 2 * ew, 0.06 * U, Math.max(2, Math.round(t * 0.1)), ...W); }
    // the seat: slats running the long way, a gap between each
    const n = 4, sd = (vf - vb - 0.04 * U) / n;
    for (let k = 0; k < n; k++) K.box(u0 + ew * 0.5, vb + 0.04 * U + k * sd, zs - 2, u1 - u0 - ew, sd * 0.8, 2, ...W);
    decoMoss(T, ...K.P(u0 + 0.24 * U, vb + 0.4 * U, zs), t * 0.18, t * 0.08);
    end(u1 - ew);
  },
  lamppost(t, T, ax, ay) {
    // a cast-iron lantern post, twice a keeper's height: a stepped foot, a fluted post with collars, a ladder bar with balls on
    // its ends, scrolls curling under a four-paned lantern with a crystal burning inside, a hipped cap and a finial; moss
    // and glowcaps round its foot
    const U = t / 2, K = isoKit(T, ax, ay), c = 0.5 * U, [x, y] = K.P(c, c, 0), I = DECO_IRON, H = Math.round(t * 2.9);
    const hl = Math.round(t * 0.46), zl = H - hl - Math.round(t * 0.28);
    T.glow(x, y - zl - hl / 2, t * 1.3, IC.y0, 0.38);
    isoLathe(T, x, y, 0, 3, () => t * 0.36, I);
    isoLathe(T, x, y, 4, 7, () => t * 0.26, I);
    isoLathe(T, x, y, 8, Math.round(t * 0.36), z => t * (0.17 - (z - 8) / t * 0.22), I);
    for (let z = Math.round(t * 0.32); z < zl - 3; z++) { T.px(x - 2, y - z, I[1]); T.px(x - 1, y - z, I[1]); T.px(x, y - z, (z % 4) ? I[2] : I[3]); T.px(x + 1, y - z, I[3]); }
    for (const zc of [Math.round(t * 0.36), Math.round(zl * 0.55), zl - 4]) isoLathe(T, x, y, zc, zc + 1, () => 2.6, I);
    // the ladder bar
    { const zb = zl - Math.round(t * 0.3); T.line(x - 6, y - zb, x + 6, y - zb, I[2]); T.line(x - 6, y - zb + 1, x + 6, y - zb + 1, I[4]); T.ball(x - 7, y - zb, 1.4, I[0], I[1], I[3]); T.ball(x + 7, y - zb, 1.4, I[1], I[2], I[3]); }
    // scrolls under the lantern
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) { const a = k / 5 * Math.PI; T.px(x + s * (2 + Math.sin(a) * 3), y - zl + 2 - (1 - Math.cos(a)) * 2, s < 0 ? I[1] : I[3]); }
    // the lantern: glass panes lit warm from within, the crystal flame, the iron frame over it
    const a0 = c - 0.17 * U, a1 = c + 0.17 * U;
    K.box(a0 - 0.04 * U, a0 - 0.04 * U, zl - 2, a1 - a0 + 0.08 * U, a1 - a0 + 0.08 * U, 2, I[1], I[2], I[3], false);
    K.box(a0, a0, zl, a1 - a0, a1 - a0, hl, IC.y0, IC.y0, IC.y1, false);
    { const [fx, fy] = K.P(c, c, zl + 2); bedCrystal(T, fx, fy - 1, hl - 4, 2.4, 0); }
    for (const [u, v] of [[a0, a1], [a1, a1], [a1, a0]]) K.seg([u, v, zl], [u, v, zl + hl], I[3]);
    for (const z of [zl, zl + hl]) { K.seg([a0, a1, z], [a1, a1, z], I[3]); K.seg([a1, a1, z], [a1, a0, z], I[4]); }
    // the cap: four sloping faces to a point, a finial and a ring on top
    { const b0 = a0 - 0.05 * U, b1 = a1 + 0.05 * U, zc = zl + hl, apex = [c, c, zc + Math.round(t * 0.2)];
      K.quad([[b0, b1, zc], [b1, b1, zc], apex], I[1], 0); K.quad([[b1, b0, zc], [b1, b1, zc], apex], I[3], 0);
      K.seg([b0, b1, zc], [b1, b1, zc], I[0]); K.seg([b1, b1, zc], apex, I[2]);
      const [px, py] = K.P(...apex); T.ball(px, py - 2, 1.6, I[0], I[1], I[3]); T.px(px, py - 4, I[2]); T.px(px, py - 5, I[1]); }
    decoMoss(T, x - t * 0.18, y - 2, t * 0.16, t * 0.09);
    bedGlowcap(T, x + t * 0.24, y + 1, Math.round(t * 0.2), t * 0.09);
  },
  birdbath(t, T, ax, ay) {
    // a carved stone birdbath: a square-shouldered foot, a baluster with a ring round its waist, a wide shallow bowl with a
    // rolled lip; the water dark in the middle and bright at the rim with the moon in it, moss creeping up the foot, a
    // feather afloat and a little crystal growing from the lip
    const U = t / 2, K = isoKit(T, ax, ay), [x, y] = K.P(0.5 * U, 0.5 * U, 0), S = [IC.s0, IC.s1, IC.s2, IC.s3, IC.s4];
    const zb = Math.round(t * 0.66), H = Math.round(t * 0.92), R = t * 0.62;
    isoLathe(T, x, y, 0, 3, z => t * (0.32 - z * 0.012), S);
    isoLathe(T, x, y, 4, zb, z => { const f = (z - 4) / (zb - 4); return t * (0.11 + 0.06 * Math.exp(-(((f - 0.2) / 0.16) ** 2)) + 0.05 * f * f) + (Math.abs(f - 0.62) < 0.06 ? 1.2 : 0); }, S, { lid: false });
    isoLathe(T, x, y, zb, H, z => { const f = (z - zb) / (H - zb); return t * 0.16 + (R - t * 0.16) * Math.sqrt(f); }, S, { lid: false });
    // the lip, then the water inside it
    T.disc(x, y - H, R, (xx, yy) => (xx < x - R * 0.2 ? IC.s0 : IC.s1));
    T.disc(x, y - H + 0.5, R - 2, (xx, yy) => { const d = Math.hypot(xx + 0.5 - x, (yy + 0.5 - y + H) * 2) / (R - 2); return d > 0.82 ? DECO_AQUA[3] : d > 0.5 ? DECO_AQUA[4] : DECO_AQUA[5]; });
    T.px(x - R * 0.3, y - H - 1, IC.y0); T.px(x - R * 0.3 + 1, y - H - 1, IC.y0); T.px(x - R * 0.3, y - H, IC.y1);
    for (let k = 0; k < 16; k++) if (k % 3) { const a = k / 16 * TAU; T.px(x + R * 0.1 + Math.cos(a) * R * 0.38, y - H + Math.sin(a) * R * 0.19, DECO_AQUA[2]); }
    // a feather floating, a crystal on the back of the lip
    for (let k = 0; k < 5; k++) { T.px(x + R * 0.25 + k, y - H + 2 - k * 0.4, k < 4 ? IC.p0 : IC.white); T.px(x + R * 0.25 + k, y - H + 3 - k * 0.4, k ? IC.p1 : IC.s0); }
    bedCrystal(T, x + R * 0.55, y - H - R * 0.2, Math.max(5, t * 0.28), Math.max(1.5, t * 0.07), t * 0.06);
    decoMoss(T, x - t * 0.2, y - 2, t * 0.15);
    decoMoss(T, x - R * 0.7, y - H + 1, t * 0.1, t * 0.08);
  },
  drum(t, T, ax, ay) {
    // a little drum: a shell lacquered red with a shine, oak hoops top and bottom studded with brass, rope laced between them
    // in a zigzag with leather pulls, a skin of pale hide with a darker beating spot, two sticks with felt tips on top
    const U = t / 2, K = isoKit(T, ax, ay), [x, y] = K.P(0.5 * U, 0.5 * U, 0), h = Math.round(t * 0.56), r = t * 0.5, hp = Math.max(3, Math.round(t * 0.11));
    const W = [IC.w0, IC.w1, IC.w1, IC.w2, IC.w3];
    isoLathe(T, x, y, 0, hp, () => r + 0.8, W, { lid: false });
    isoLathe(T, x, y, hp + 1, h - hp - 1, () => r, DECO_LACQUER, { lid: false });
    isoLathe(T, x, y, h - hp, h, () => r + 0.8, W, { lid: false });
    // the rope zigzag round the front and the pulls on it
    const ring = (z, a) => [x + Math.cos(a) * r, y - z + Math.sin(a) * r / 2];
    for (let k = 0; k < 5; k++) {
      const a0 = (k / 5) * Math.PI + 0.12, a1 = ((k + 0.5) / 5) * Math.PI + 0.12, [p0x, p0y] = ring(h - hp - 1, a0), [p1x, p1y] = ring(hp + 1, a1), [p2x, p2y] = ring(h - hp - 1, a1 + Math.PI / 10);
      const lit = Math.cos(a1) > 0.3 ? BED_FLEECE[2] : BED_FLEECE[0];
      T.line(p0x, p0y, p1x, p1y, lit); T.line(p1x, p1y, p2x, p2y, lit); T.line(p0x + 1, p0y, p1x + 1, p1y, BED_FLEECE[3]);
      const [mx, my] = ring(hp + 3, a1); T.px(mx - 1, my - 1, BED_ROOT[1]); T.px(mx, my - 1, BED_ROOT[2]); T.px(mx - 1, my, BED_ROOT[2]); T.px(mx, my, BED_ROOT[3]);
    }
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI + 0.15; for (const z of [Math.round(hp / 2), h - Math.round(hp / 2)]) { const [bx, by] = ring(z, a); T.px(bx, by, Math.cos(a) > 0.2 ? BRASS[2] : BRASS[0]); } }
    decoGloss(T, x - r * 0.62, y - h * 0.62, 1);
    // the skin
    T.disc(x, y - h, r - 0.4, (xx, yy) => { const d = Math.hypot(xx + 0.5 - x, (yy + 0.5 - y + h) * 2) / r; return d > 0.85 ? BED_FLEECE[2] : d < 0.28 ? BED_FLEECE[3] : xx < x - r * 0.3 ? BED_FLEECE[0] : BED_FLEECE[1]; });
    // two sticks resting across it
    for (const [x0, y0, x1, y1] of [[x - r * 0.8, y - h - 3, x + r * 0.5, y - h + 2], [x - r * 0.3, y - h - 5, x + r * 0.9, y - h - 1]]) { T.line(x0, y0, x1, y1, IC.w1); T.line(x0, y0 + 1, x1, y1 + 1, IC.w3); T.ball(x0, y0, 1.6, IC.p0, IC.p1, IC.p2); }
  },
  blocks(t, T, ax, ay) {
    // wooden alphabet blocks: plain maple edges round a painted panel on every face, each panel with a raised picture (a star,
    // a moon, a heart, a gem, a glowling); three on the floor and one stacked a little crooked, and a spinning top beside them
    const U = t / 2, K = isoKit(T, ax, ay), s = 0.36 * U, hs = Math.round(s * 1.9);
    const PICS = {
      star: ["..x..", ".xxx.", "xxxxx", ".x.x."], moon: [".xx..", "x....", "x....", ".xx.."], heart: ["x.x", "xxx", ".x."],
      gem: [".xxx.", "xxxxx", ".xxx.", "..x.."], glow: [".xxx.", "x.x.x", "xxxxx", ".xxx."],
    };
    const face = (pic, at, w, col, ink) => { const rows = PICS[pic], ph = rows.length, pw = rows[0].length;
      for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) if (rows[j][i] === "x") at(i - (pw - 1) / 2, (ph - 1) / 2 - j, ink); };
    const block = (u, v, z, [c0, c1, c2], picV, picU) => {
      K.box(u, v, z, s, s, hs, IC.w0, IC.w1, IC.w2);
      const m = 0.06 * U, um = u + s / 2, vm = v + s / 2, zm = z + hs / 2;
      K.faceV(v + s, u + m, u + s - m, z + 2, z + hs - 2, c1, 0); K.faceU(u + s, v + m, v + s - m, z + 2, z + hs - 2, c2, 0);
      K.flat(u + m, v + m, u + s - m, v + s - m, z + hs, c0, 0);
      face(picV, (i, j, col) => K.dot(um + i * 0.5, v + s, zm + j, col), 0, c1, IC.white);
      face(picU, (i, j, col) => K.dot(u + s, vm + i * 0.5, zm + j, col), 0, c2, c0);
    };
    const P1 = [IC.p0, IC.p1, IC.p2], B1 = [IC.b0, IC.b1, IC.b2], Y1 = [IC.y0, IC.y1, IC.w1], G1 = [IC.g0, IC.g1, IC.g2];
    block(0.12 * U, 0.06 * U, 0, B1, "moon", "star");
    block(0.16 * U, 0.1 * U, hs, G1, "glow", "heart");
    block(0.04 * U, 0.52 * U, 0, P1, "heart", "gem");
    block(0.54 * U, 0.38 * U, 0, Y1, "star", "glow");
    // the spinning top, standing mid-spin, in stripes
    { const [px, py] = K.P(0.82 * U, 0.86 * U, 0), r = t * 0.17;
      for (let k = 0; k <= Math.round(r * 1.5); k++) { const w = k < r * 0.8 ? k * 1.2 : r * 1.5 - (k - r * 0.8) * 1.6; if (w <= 0) continue; T.line(px - w, py - k, px + w, py - k, (Math.floor(k / 2) % 2) ? IC.r1 : IC.y0); T.px(px - w, py - k, IC.white); T.px(px + w, py - k, (Math.floor(k / 2) % 2) ? IC.r3 : IC.w1); }
      T.line(px, py - r * 1.5, px, py - r * 1.5 - 3, IC.w2); T.px(px, py - r * 1.5 - 4, IC.w1); }
  },
  telescope(t, T, ax, ay) {
    // a brass telescope on a wooden tripod, tipped up at the sky: three legs splayed with a little brass tray between them
    // (a crystal on it), a yoke on top, a tube in drawn sections that widens to a dew shield, a finder scope along its back,
    // an amethyst lens and a dark eyepiece at the near end
    const U = t / 2, K = isoKit(T, ax, ay), c = 0.5 * U, zh = Math.round(t * 1.0), [hx, hy] = K.P(c, c, zh);
    const legs = [[0.9, 0.15], [0.12, 0.82], [0.92, 0.9]].map(([u, v]) => K.P(u * U, v * U, 0));
    const leg = ([fx, fy]) => { T.line(hx, hy, fx, fy, IC.w1); T.line(hx + 1, hy, fx + 1, fy, IC.w3); T.px(fx, fy, BRASS[2]); T.px(fx + 1, fy, BRASS[3]); };
    leg(legs[0]);
    // the tray halfway down, with a crystal on it
    { const m = legs.map(([fx, fy]) => [hx + (fx - hx) * 0.5, hy + (fy - hy) * 0.5]); T.poly(m, BRASS[2]); T.line(m[1][0], m[1][1], m[2][0], m[2][1], BRASS[1]); bedCrystal(T, (m[0][0] + m[1][0] + m[2][0]) / 3, (m[0][1] + m[1][1] + m[2][1]) / 3, 5, 1.5, 0); }
    // the tube: rings of brass stepped along its axis from the far end (the dew shield) to the eyepiece
    const dir = [0.9, -0.44], L0 = t * 0.62, L1 = t * 0.88, prof = s => s < 0.08 ? 0.05 : s < 0.22 ? 0.075 : s < 0.78 ? 0.1 + (s - 0.22) * 0.04 : 0.135;
    const at = s => [hx + dir[0] * ((L0 + L1) * s - L0), hy - 3 + dir[1] * ((L0 + L1) * s - L0)];
    const ring = (s, col) => { const [cx, cy] = at(s), r = prof(s) * t; for (let q = -Math.ceil(r); q <= Math.ceil(r); q++) T.px(cx - dir[1] * q, cy + dir[0] * q, col); };
    for (let s = 1; s >= 0; s -= 0.008) {
      const [cx, cy] = at(s), r = prof(s) * t;
      for (let q = -Math.ceil(r); q <= Math.ceil(r); q++) {
        if (Math.abs(q) > r + 0.3) continue;
        const f = q / r, col = f < -0.55 ? BRASS[0] : f < 0.05 ? BRASS[1] : f < 0.6 ? BRASS[2] : BRASS[3];
        T.px(cx - dir[1] * q, cy + dir[0] * q, col);
      }
    }
    for (const s of [0.08, 0.22, 0.5, 0.78]) ring(s, BRASS[3]);
    // the lens at the far end, the eyepiece at the near
    { const [ox, oy] = at(1), r = prof(1) * t; T.disc(ox + 1, oy, Math.max(1.5, r * 0.45), IC.l3, r); T.disc(ox + 1, oy, Math.max(1, r * 0.3), IC.l1, r * 0.7); T.px(ox + 1, oy - r * 0.4, IC.white); }
    { const [ex, ey] = at(0); T.px(ex - 1, ey, IC.ink); T.px(ex - 1, ey + 1, IC.ink2); }
    // the finder along its back
    { const [a0x, a0y] = at(0.45), [a1x, a1y] = at(0.72), o = prof(0.6) * t + 2; T.line(a0x + dir[1] * o, a0y - dir[0] * o, a1x + dir[1] * o, a1y - dir[0] * o, BRASS[1]); T.px(a1x + dir[1] * o + 1, a1y - dir[0] * o, IC.l2); }
    // the yoke, and the near legs over everything
    T.ball(hx, hy - 1, 2.4, BRASS[0], BRASS[2], BRASS[3]);
    leg(legs[1]); leg(legs[2]);
  },
  table(t, T, ax, ay) {
    // a round tea table of root-wood: three roots curling out for feet, a turned pedestal with a bulb, a thick top with a
    // lace doily; on it a fat teal teapot (lid, knob, spout, handle, a glossy shine and a curl of steam), two cups of
    // moonleaf tea on saucers and a moon cookie. Its top comes up to a glowling's chin
    const U = t / 2, K = isoKit(T, ax, ay), [x, y] = K.P(0.5 * U, 0.5 * U, 0), H = Math.round(t * 0.86), rx = t * 0.8;
    for (const [dx, dy] of [[-0.46, 0.04], [0.44, 0.02], [0.02, 0.26]]) for (let k = 0; k < 2; k++) { T.line(x + k, y - Math.round(t * 0.16), x + dx * t * 0.7 + k, y + dy * t - 1, BED_ROOT[k ? 3 : 1]); T.line(x + dx * t * 0.7 + k, y + dy * t - 1, x + dx * t + k, y + dy * t, BED_ROOT[k ? 3 : 2]); }
    const W = [IC.w0, IC.w1, IC.w1, IC.w2, IC.w3];
    isoLathe(T, x, y, 1, H - 4, z => { const f = z / H; return t * (0.06 + 0.07 * Math.exp(-(((f - 0.22) / 0.12) ** 2)) + 0.04 * Math.exp(-(((f - 0.82) / 0.08) ** 2))); }, W, { lid: false });
    // the top: boards laid side by side with a dark seam between, each lit a touch along its upper edge, the grain running
    // along them, and a rounded rim lit toward the light and shaded on its far side
    isoLathe(T, x, y, H - 3, H, () => rx, W, { lid: (xx, yy) => {
      const dx = xx + 0.5 - x, dy = (yy + 0.5 - y + H) * 2, d = Math.hypot(dx, dy) / rx, a = (dx + dy) / 2 + rx, b = Math.floor(a / 5), f = a - b * 5;
      // (the lit edges in the root-wood's pale shade: the texture keeps oak from ever reaching its own brightest)
      if (d > 0.9) return -dx - dy > rx * 0.2 ? BED_ROOT[0] : dx + dy > rx * 0.5 ? IC.w2 : IC.w1;
      if (f < 1) return IC.w3;
      const g = pxNoise((dx - dy) * 0.18, b * 3.7 + f * 0.6);
      return f < 2 && g > 0.4 ? BED_ROOT[0] : g > 0.72 || (pxHash(b, Math.floor((dx - dy) / 4)) > 0.9 && f > 3) ? IC.w2 : IC.w1;
    } });
    // the doily, its scalloped edge in white
    T.disc(x - 1, y - H, rx * 0.52, (xx, yy) => ((xx * 2 + yy * 3) % 7 ? IC.s0 : IC.s1));
    for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; T.px(x - 1 + Math.cos(a) * rx * 0.56, y - H + Math.sin(a) * rx * 0.28, k % 2 ? IC.white : IC.s1); }
    // cups on saucers: a white rim, the tea inside, a handle
    const cup = (u, v) => { const [cx, cy] = K.P(u, v, H); T.disc(cx, cy, t * 0.15, IC.s1); T.disc(cx, cy - 0.5, t * 0.13, IC.s0);
      isoLathe(T, cx, cy, 1, Math.round(t * 0.12), z => t * (0.07 + z / t * 0.25), [IC.white, IC.s0, IC.s0, IC.s1, IC.s2], { lid: (xx) => xx < cx - t * 0.07 || xx > cx + t * 0.07 ? IC.s0 : IC.w2 });
      T.px(cx + t * 0.1 + 1, cy - 2, IC.s1); T.px(cx + t * 0.1 + 2, cy - 3, IC.s1); T.px(cx + t * 0.1 + 1, cy - 4, IC.s1); };
    cup(0.12 * U, 0.42 * U);
    { const [cx, cy] = K.P(0.8 * U, 0.2 * U, H); T.disc(cx, cy - 1, t * 0.09, IC.y1); T.disc(cx - 0.5, cy - 1.5, t * 0.07, IC.y0); T.px(cx + 1, cy - 2, IC.w1); }
    // the teapot: a round glazed body, a domed lid with a knob, a long spout, a loop of a handle
    { const [px, py] = K.P(0.42 * U, 0.18 * U, H), r = t * 0.22, by = py - r * 0.95, top = by - r * 0.9;
      for (let k = 0; k < 6; k++) { T.px(px + r * 0.7 + k, by + 1 - k * 0.9, BED_FELT[k > 4 ? 1 : 2]); T.px(px + r * 0.7 + k, by + 2 - k * 0.9, BED_FELT[3]); }
      for (let k = -3; k <= 3; k++) T.px(px - r - 1 - Math.round(Math.sqrt(9 - k * k) * 0.6), by + k, BED_FELT[k < 0 ? 2 : 3]);
      bedPlush(T, px, by, r, r * 0.95, BED_FELT);
      T.disc(px, top + 1, r * 0.55, BED_FELT[3], r * 0.22); bedPlush(T, px, top - 0.5, r * 0.5, r * 0.3, BED_FELT, { gloss: false }); T.ball(px, top - r * 0.3 - 1, 1.5, BED_FELT[0], BED_FELT[1], BED_FELT[3]);
      for (let k = 0; k < 4; k++) T.px(px + r * 0.7 + 7 + Math.round(Math.sin(k * 1.4)), by - 5 - k * 2, k % 2 ? IC.s0 : IC.white); }
    cup(0.58 * U, 0.66 * U);
  },
  mushrooms(t, T, ax, ay, o) {
    // a cluster of luminous blue mushrooms on a mossy mound (after the reference photo): tall thin stems glowing from inside,
    // wide flat parasol caps lit brightest at the rim, radial gills underneath, and a strong blue glow all round
    const cx = ax, cy = ay + t / 2, f = o.frame || 0;
    const B = { deep: IC.b3, mid: IC.b2, lit: IC.b1, pale: IC.b0, white: IC.white };
    // the mossy mound they grow from, catching their light on its top
    for (let y = Math.floor(cy - t * 0.22); y <= cy + t * 0.3; y++) for (let x = Math.floor(cx - t * 0.62); x <= cx + t * 0.62; x++) {
      const d = Math.hypot((x - cx) / (t * 0.62), (y - cy - t * 0.04) / (t * 0.26));
      if (d > 1) continue;
      const top = y < cy - t * 0.02 + Math.abs(x - cx) * 0.18;
      T.px(x, y, top ? (pxHash(x, y) > 0.78 ? B.mid : pxHash(x + 1, y) > 0.9 ? B.lit : IC.g2) : (d > 0.8 ? IC.ink2 : IC.g3));
    }
    // a wide blue halo first, so the mushrooms sit inside their own light
    T.glow(cx, cy - t * 0.8, t * 1.45, B.deep, 0.5);
    T.glow(cx, cy - t * 0.75, t * 0.95, B.mid, 0.45);
    const shrooms = [...MUSHROOMS].sort((p, q) => p[1] - q[1]);
    for (const [dx, dy, h, r] of shrooms) {
      const x = Math.round(cx + dx * t), y = Math.round(cy + dy * t), top = Math.round(y - h * t * 1.05), rx = Math.max(2, r * t * 1.6), ry = Math.max(1, Math.round(rx * 0.4));
      const lean = Math.round(dx * 2);
      // a sturdy stem, wider at the foot: lit on the left, a bright core, shaded on the right, little rings up it
      const sw = Math.max(3, Math.round(rx * 0.42));
      for (let k = 0; k <= y - top; k++) {
        const sx = x + Math.round(lean * k / (y - top + 1)), w = sw + (k < 3 ? 2 : k < 5 ? 1 : 0);
        for (let q = 0; q < w; q++) T.px(sx - Math.floor(w / 2) + q, y - k, q === 0 ? B.pale : q >= w - Math.max(1, Math.floor(w / 3)) ? B.lit : B.white);
      }
      const tx = x + lean;
      // the cap: a flat parasol, its top glowing pale, its rim the brightest of all
      for (let yy = top - ry; yy <= top; yy++) for (let xx = Math.floor(tx - rx); xx <= Math.ceil(tx + rx); xx++) {
        const nx = (xx + 0.5 - tx) / rx, ny = (yy + 0.5 - top) / (ry + 0.5);
        if (nx * nx + ny * ny > 1) continue;
        T.px(xx, yy, Math.abs(nx) > 0.86 ? B.pale : yy === top - ry ? B.mid : ny > -0.35 ? B.lit : B.mid);
      }
      // the gills underneath: thin lines fanning out from the stem
      const gy = top + 1;
      for (let xx = Math.floor(tx - rx + 1); xx <= Math.ceil(tx + rx - 1); xx++) T.px(xx, gy, Math.abs(xx - tx) > rx - 2 ? B.white : (xx - tx) % 2 === 0 ? B.deep : B.pale);
      if (rx > 4) for (let xx = Math.floor(tx - rx * 0.6); xx <= Math.ceil(tx + rx * 0.6); xx += 2) T.px(xx, gy + 1, B.mid);
      T.px(tx, top - ry, B.white);
      // a wet shine on the cap's lit shoulder, and its darker crown speckled with paler spots
      if (rx > 3) { T.on(tx - rx * 0.55, top - ry * 0.45, IC.white); T.on(tx - rx * 0.55 + 1, top - ry * 0.45 - (ry > 1 ? 1 : 0), B.pale); }
      if (rx > 5) for (const [sx, sy] of [[0.15, -0.6], [0.45, -0.3], [-0.2, -0.75]]) T.on(tx + sx * rx, top + sy * ry, B.lit);
    }
    // spores drifting up through the light
    for (let i = 0; i < 7; i++) { if ((i + f) % 3 === 0) continue; T.px(cx + Math.round((pxHash(i, 5) - 0.5) * t * 1.5), cy - Math.round(t * (1.1 + pxHash(5, i) * 1.0)) - ((i + f) % 4), i % 2 ? B.white : B.pale); }
  },
  bed(t, T, ax, ay, o = {}) { return (BED_ART[o.style] || BED_ART.nest)(t, T, ax, ay, o); },
};

// ---------- beds to suit the room: a geode cradle, a mossy gazebo outside, a glowcap hammock, a root nest, a glowcap canopy ----------

const BEDS = [
  { id: "nest", name: "Geode cradle", note: "half a geode with moss and a felt blanket, room for everyone" },
  { id: "gazebo", name: "Mossy gazebo", note: "a moss roof, crystal lights and lots of cushions" },
  { id: "hammock", name: "Glowcap hammock", note: "felt and moss, slung between two glowcaps" },
  { id: "basket", name: "Root nest", note: "woven roots, fleece inside, glowcaps at the back" },
  { id: "canopy", name: "Glowcap canopy", note: "a big glowing mushroom keeps watch overhead" },
];
const BED_FOR_ROOM = { nest: "nest", yard: "gazebo", play: "hammock", garden: "basket", study: "canopy", lab: "canopy" };
/** The bed in the room you're in: the one you picked for it, or the one that suits its kind. */
const bedStyle = (i = save.room) => { const b = (save.rooms && save.rooms[i] && (save.rooms[i].bed || BED_FOR_ROOM[save.rooms[i].kind])) || "nest"; return b === "leaves" ? "gazebo" : b; };
/** The beds drawn in layers in the room, with their sleepers between (see drawRoomIso): a front drawn again over them
 *  ("post"), a roof or a cap over everything ("roof"). */
const BED_LAYERS = { gazebo: ["post", "roof"], nest: ["post"], basket: ["post"], hammock: ["post"], canopy: ["roof"] };
const GAZEBO_A = 0.88; // how far the gazebo's posts stand from its middle, in tiles
// The beds share the glowlings' own look: soft and plush, cel-shaded in a few flat bands from the top left (dithered only
// where two bands meet), a big glossy highlight, a gentle glow. Felt, fleece, moss, crystal, the keepers' handiwork.
const BED_CRUST = ["#e4d4ba", "#bba588", "#8c765e", "#5f4d3d", "#3b2f27"].map(pxHex);
const BED_AGATE = ["#ffffff", "#e8eefb", "#c6d8f2", "#a2b8e2"].map(pxHex);
const BED_FELT = ["#c8f6ec", "#80d8c8", "#4aa69e", "#2e7274", "#1c4a54"].map(pxHex);
const BED_ROSE = ["#ffd8e6", "#f4a2c0", "#d36a98", "#9c4472", "#62284c"].map(pxHex);
const BED_FLEECE = ["#ffffff", "#fbf2e2", "#e6d4b8", "#b9a184"].map(pxHex);
const BED_ROOT = ["#d8a868", "#a8743e", "#7a4e28", "#4e3018", "#2e1c10"].map(pxHex);
const BED_MOSS = ["#c4ec9a", "#86c46a", "#4f9450", "#2e6038"].map(pxHex);
const BED_GLOW = ["#ffffff", "#c8f2ff", "#7ed4f4", "#3a9cc8", "#1f5a86"].map(pxHex);
/** Which flat band a light value falls in (steps: thresholds, brightest first), dithered just around each step. */
const bedBand = (v, steps, x, y, w = 0.07) => {
  const b = PX_BAYER[(Math.round(y) & 3) * 4 + (Math.round(x) & 3)];
  let k = 0;
  for (const s of steps) { if (v > s + w || (v > s - w && b < (v - s + w) / (2 * w))) break; k++; }
  return k;
};
/** A plush lump (a pillow, a cushion, a tuft of moss): four flat bands of its ramp, lit from the top left, and a glossy spot. */
function bedPlush(T, x, y, r, ry, ramp, { gloss = true, curls = false } = {}) {
  for (let yy = Math.floor(y - ry); yy <= Math.ceil(y + ry); yy++) for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
    const dx = (xx + 0.5 - x) / r, dy = (yy + 0.5 - y) / ry, d = dx * dx + dy * dy;
    if (d > 1) continue;
    let k = Math.min(ramp.length - 1, bedBand(-dx * 0.55 - dy * 0.75 + (1 - d) * 0.3, [0.62, 0.12, -0.42], xx, yy) + (ramp.length > 4 ? 1 : 0));
    if (curls && k > 0 && k < ramp.length - 1 && (xx + yy * 3) % 5 === 0 && pxHash(xx, yy) > 0.45) k++;
    T.px(xx, yy, ramp[k]);
  }
  if (gloss && r > 3) {
    const gx = x - r * 0.36, gy = y - ry * 0.42, gr = Math.max(1.2, r * 0.26), gry = Math.max(0.8, ry * 0.22);
    T.disc(gx, gy, gr, (xx, yy) => ((xx + 0.5 - gx) / gr) ** 2 + ((yy + 0.5 - gy) / gry) ** 2 < 0.45 ? IC.white : ramp[ramp.length > 4 ? 1 : 0], gry);
  }
}
/** A crystal point standing at (x, y): a lit facet, a middle one, a shaded one, a pale ridge and a bright tip. */
function bedCrystal(T, x, y, h, w, lean = 0, ramp = [IC.white, IC.l0, IC.l1, IC.l2, IC.l3, IC.l4]) {
  const tip = y - h, sh = h * 0.34;
  for (let yy = Math.floor(tip); yy <= Math.ceil(y); yy++) {
    const cxx = x + lean * (y - yy) / h, hw = yy < tip + sh ? w * (yy - tip) / sh : w;
    for (let xx = Math.floor(cxx - hw); xx <= Math.ceil(cxx + hw); xx++) {
      const f = (xx + 0.5 - cxx) / Math.max(0.6, hw);
      if (Math.abs(f) > 1) continue;
      T.px(xx, yy, yy >= y ? ramp[5] : yy < tip + 1.5 ? ramp[0] : f < -0.4 ? ramp[1] : f < -0.1 ? (yy < tip + sh * 1.6 ? ramp[0] : ramp[2]) : f < 0.45 ? ramp[3] : ramp[4]);
    }
  }
}
/**
 * A bed like a bowl lying on the floor, open side up (the geode cradle, the root nest): a shell, a cut rim, a lined hollow
 * with something soft at its bottom, a pillow and a blanket spilling over the front. In the room the front lip (o.part
 * "post") is drawn again over whoever sleeps in it, so they lie down in the hollow instead of on top of it.
 * look: R (outer radius), H (rim height), F (how high the soft bottom is), Ri/Rf (the hollow at the rim and at the bottom,
 * as parts of R), shell(x, y, lit), rim(d, x, y), wall(s, f, x, y) (s: down the wall, f: across a crystal or a strand),
 * floor(x, y, lit, edge), blanket (a ramp), and back/front extras; q, how tall its rings stand for how wide they are.
 */
function bedBowl(T, t, ax, ay, o, look) {
  const lipOnly = o.part === "post", cx = ax, cy = ay + t, { R, H, F } = look, Ri = R * look.Ri, Rf = R * look.Rf, q = look.q;
  const ell = (x, y, z, r) => Math.hypot((x + 0.5 - cx) / r, (y + 0.5 - cy + z) / (r * q));
  const shellR = z => R * (0.68 + 0.32 * Math.sin(z / H * Math.PI / 2));
  // the shell: rings stacked up to the rim, rounded under like a bowl, lit from the left and catching more light higher up
  for (let z = 0; z < H; z++) {
    const r = shellR(z);
    for (let y = Math.floor(cy - z - r * q); y <= Math.ceil(cy - z + r * q); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (ell(x, y, z, r) > 1 || (lipOnly && ell(x, y, H, R) <= 1)) continue;
      T.px(x, y, look.shell(x, y, -(x + 0.5 - cx) / r * 0.7 + z / H * 0.6 - 0.25));
    }
  }
  // the cut rim, in rings (front half only for the lip)
  for (let y = Math.floor(cy - H - R * q); y <= Math.ceil(cy - H + R * q); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
    const d = ell(x, y, H, R);
    if (d > 1 || d < look.Ri || (lipOnly && y + 0.5 <= cy - H)) continue;
    T.px(x, y, look.rim((d - look.Ri) / (1 - look.Ri), x, y));
  }
  const inner = (x, y) => ell(x, y, H, R) < look.Ri;
  if (!lipOnly) {
    if (look.back) look.back(cx, cy);
    // the hollow: its back wall down to the soft bottom
    for (let y = Math.floor(cy - H - Ri * q); y <= Math.ceil(cy - H + Ri * q); y++) for (let x = Math.floor(cx - Ri); x <= Math.ceil(cx + Ri); x++) {
      if (!inner(x, y)) continue;
      const ex = x + 0.5 - cx, df = ell(x, y, F, Rf);
      if (df <= 1) { T.px(x, y, look.floor(x, y, -ex / Rf * 0.4 - (y + 0.5 - cy + F) / (Rf * q) * 0.35, df > 0.84)); continue; }
      const yr = cy - H - Ri * q * Math.sqrt(Math.max(0, 1 - (ex / Ri) ** 2)), yf = Math.abs(ex) < Rf ? cy - F - Rf * q * Math.sqrt(1 - (ex / Rf) ** 2) : cy - F;
      T.px(x, y, look.wall(clamp((y + 0.5 - yr) / Math.max(2, yf - yr), 0, 1), Math.acos(clamp(ex / Ri, -1, 1)) / Math.PI, x, y));
    }
    // a pillow at the back on the lit side, and the blanket over the front, its edge running along the floor's axis
    bedPlush(T, cx - Rf * 0.42, cy - F - Rf * 0.1, t * 0.44, t * 0.24, BED_FLEECE, { curls: true });
    const B = look.blanket, edge = x => cy - F + Rf * 0.02 + ((x + 0.5 - cx) / Rf) ** 2 * Rf * 0.08;
    for (let y = Math.floor(cy - F - Rf * q); y <= Math.ceil(cy - F + Rf * q); y++) for (let x = Math.floor(cx - Rf); x <= Math.ceil(cx + Rf); x++) {
      const e = y + 0.5 - edge(x), df = ell(x, y, F, Rf);
      if (e < 0 || df > 1 || !inner(x, y)) continue;
      // turned down at the top in fleece, a row of stitches under it, soft folds running down to the front
      if (e < 4) { T.px(x, y, e < 1.2 ? BED_FLEECE[0] : e < 3 ? BED_FLEECE[1] : BED_FLEECE[2]); continue; }
      if (e < 5) { T.px(x, y, (x & 3) < 2 ? BED_FLEECE[0] : B[2]); continue; }
      const fold = Math.sin((x + 0.5 - cx) * 0.36) * 0.28;
      T.px(x, y, B[Math.min(4, 1 + bedBand(-(x + 0.5 - cx) / Rf * 0.5 + fold - (df > 0.9 ? 0.5 : 0), [0.25, -0.2, -0.55], x, y))]);
    }
  }
  // the blanket spilling over the front of the rim and hanging down the shell, blanket-stitched along its hem
  const x0 = cx - R * 0.42, x1 = cx + R * 0.42, zb = H * 0.22;
  for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
    const ex = x + 0.5 - cx, side = Math.min(x + 0.5 - x0, x1 - x - 0.5), rb = shellR(zb);
    const yTop = cy - H + Ri * q * Math.sqrt(Math.max(0, 1 - (ex / Ri) ** 2)) - 1, yRim = cy - H + R * q * Math.sqrt(Math.max(0, 1 - (ex / R) ** 2));
    const yBot = cy - zb + rb * q * Math.sqrt(Math.max(0, 1 - (ex / rb) ** 2)) + Math.sin(ex * 0.42) * 1.2 - (side < 3 ? 3 - side : 0);
    for (let y = Math.floor(yTop); y <= Math.ceil(yBot); y++) {
      if (y + 0.5 < yTop || y - 0.5 > yBot) continue;
      const B = look.blanket, onTop = y + 0.5 < yRim, fold = Math.sin(ex * 0.5) * 0.3;
      let k = onTop ? 1 : 2 + bedBand(-ex / R * 0.6 + fold - (y - yRim) / (yBot - yRim + 1) * 0.3, [0.05, -0.4], x, y);
      if (y + 1.5 > yBot) k = (x & 1) ? 0 : 3;
      T.px(x, y, y + 1.5 > yBot && (x % 3 === 0) ? BED_FLEECE[0] : B[Math.min(4, k)]);
    }
    if (x % 3 === 0) T.px(x, yBot - 2, BED_FLEECE[1]);
  }
  if (look.front) look.front(cx, cy, lipOnly);
}
/** A glowcap: a pale stem, thicker at its foot, under a domed cap glowing from within, brightest at its rim, with a gloss. */
function bedGlowcap(T, x, y, h, r) {
  const sw = Math.max(1, Math.round(r * 0.32)), top = y - h, ry = Math.max(1.5, r * 0.62);
  for (let k = 0; k <= h; k++) for (let q = -sw; q <= sw; q++) T.px(x + q + (k < 2 ? Math.sign(q) : 0), y - k, q < 0 ? BED_GLOW[0] : q < sw ? BED_GLOW[1] : BED_GLOW[2]);
  T.disc(x, top + 0.5, r * 0.9, BED_GLOW[3], Math.max(1, r * 0.2));
  for (let yy = Math.floor(top - ry); yy <= top; yy++) for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
    const dx = (xx + 0.5 - x) / r, dy = (yy + 0.5 - top) / ry;
    if (dx * dx + dy * dy > 1) continue;
    T.px(xx, yy, yy === top || Math.abs(dx) > 0.86 ? BED_GLOW[1] : BED_GLOW[1 + bedBand(-dx * 0.6 - dy * 0.6 - 0.25, [0.4, -0.1], xx, yy)]);
  }
  if (r > 2) T.px(x - Math.round(r * 0.4), top - Math.round(ry * 0.55), BED_GLOW[0]);
}
const BED_ART = {
  nest(t, T, ax, ay, o = {}) {
    // the geode cradle: half a geode lying open side up, its knobbly crust outside, rings of agate round the cut rim,
    // amethyst points lining the hollow; a bed of moss at its bottom, a fleece pillow and a teal felt blanket from the
    // keepers, spilling over the front; a few crystals standing up from the back of the rim, glowing softly
    const R = t * 1.6, H = Math.round(t * 0.58), F = Math.round(t * 0.28), q = 0.5;
    bedBowl(T, t, ax, ay, o, {
      R, H, F, q, Ri: 0.8, Rf: 0.64, blanket: BED_FELT,
      shell: (x, y, lit) => BED_CRUST[1 + bedBand(lit - 0.15 + (pxNoise(x * 0.3, y * 0.55) - 0.5) * 0.8, [0.35, -0.05, -0.45], x, y)],
      rim: (s, x, y) => { s += (pxNoise(x * 0.12, y * 0.25) - 0.5) * 0.28; return s > 0.84 ? BED_CRUST[1] : s > 0.6 ? BED_CRUST[0] : s > 0.48 ? BED_AGATE[3] : s > 0.34 ? BED_AGATE[0] : s > 0.2 ? BED_AGATE[2] : IC.l1; },
      wall: (s, f, x, y) => {
        // crystals growing in from the wall, their points toward the middle: long ones and short ones in turn
        const q = f * 13, p = q - Math.floor(q), reach = Math.floor(q) % 2 ? 0.68 : 1, w = 0.5 * (1 - s / reach);
        if (s < reach && Math.abs(p - 0.5) < w) { const g = (p - 0.5) / w; return s > reach - 0.14 ? IC.l0 : g < -0.4 ? IC.l1 : g < 0.3 ? IC.l2 : IC.l3; }
        return s < 0.45 ? IC.l4 : IC.ink2;
      },
      floor: (x, y, lit, edge) => BED_MOSS[edge ? 3 : bedBand(lit + (pxNoise(x * 0.45, y * 0.8) - 0.5) * 0.7, [0.3, -0.1, -0.5], x, y)],
      back: (cx, cy) => {
        for (const [an, hs] of [[-2.55, [0.9, 0.5]], [-0.55, [0.66, 0.36]]]) {
          const bx = cx + Math.cos(an) * R * 0.9, by = cy - H + Math.sin(an) * R * (q * 0.9);
          T.glow(bx, by - t * 0.3, t * 0.85, IC.l4, 0.22);
          hs.forEach((h, k) => bedCrystal(T, bx + (k ? 1 : -0.3) * t * 0.16 * (an < -1.5 ? 1 : -1), by + k * 2, t * h, Math.max(2.5, t * 0.16 - k * 0.6), (k ? 1 : -0.6) * t * 0.16 * (an < -1.5 ? -1 : 1)));
        }
      },
      front: (cx, cy, lipOnly) => {
        // moss creeping over the rim at the front left, glowcaps sprouting on the right
        for (const [an, r] of [[2.55, 0.2], [2.3, 0.16], [2.78, 0.13]]) bedPlush(T, cx + Math.cos(an) * R * 0.9, cy - H + Math.sin(an) * R * (q * 0.9) - 1, t * r, t * r * 0.7, BED_MOSS, { gloss: r > 0.15 });
        const gx = cx + Math.cos(0.75) * R * 0.92, gy = cy - H + Math.sin(0.75) * R * (q * 0.92);
        bedGlowcap(T, gx, gy, Math.round(t * 0.4), t * 0.2); bedGlowcap(T, gx + t * 0.26, gy + 2, Math.round(t * 0.24), t * 0.13);
        if (!lipOnly) T.glow(gx, gy - t * 0.25, t * 0.6, BED_GLOW[4], 0.3);
      },
    });
  },
  basket(t, T, ax, ay, o = {}) {
    // the root nest: roots woven into a deep round nest, a braided rim, lined with fleece; moss at the bottom, a rose felt
    // blanket over the front, glowcaps growing out of the weave at the back
    const R = t * 1.5, H = Math.round(t * 0.42), F = Math.round(t * 0.22), q = 0.5;
    const weave = (x, y) => (Math.floor((x + 2 * y) / 5) + Math.floor((x - 2 * y + 400) / 5)) & 1;
    bedBowl(T, t, ax, ay, o, {
      R, H, F, q, Ri: 0.78, Rf: 0.7, blanket: BED_ROSE,
      shell: (x, y, lit) => { const k = 1 + bedBand(lit + (weave(x, y) ? 0.22 : -0.22), [0.35, -0.05, -0.45], x, y); return BED_ROOT[Math.min(4, k + ((x + 2 * y) % 5 === 0 || (x - 2 * y + 400) % 5 === 0 ? 1 : 0))]; },
      rim: (s, x, y) => BED_ROOT[bedBand(0.55 - Math.abs(s - 0.5) * 1.6 + (((Math.floor((x + y * 2) / 4)) & 1) ? 0.22 : -0.22), [0.45, 0.05, -0.35], x, y)],
      wall: (s, f, x, y) => BED_FLEECE[Math.min(3, 1 + bedBand(0.45 - s * 0.9 - Math.abs(f - 0.5) * 0.5, [0.2, -0.25], x, y) + ((x + y * 3) % 5 === 0 && pxHash(x, y) > 0.5 ? 1 : 0))],
      floor: (x, y, lit, edge) => BED_MOSS[edge ? 3 : bedBand(lit + (pxNoise(x * 0.45, y * 0.8) - 0.5) * 0.7, [0.3, -0.1, -0.5], x, y)],
      back: (cx, cy) => {
        const gx = cx + Math.cos(-0.8) * R * 0.86, gy = cy - H + Math.sin(-0.8) * R * (q * 0.86);
        T.glow(gx, gy - t * 0.4, t * 1.0, BED_GLOW[4], 0.32);
        bedGlowcap(T, gx, gy, Math.round(t * 0.62), t * 0.26); bedGlowcap(T, gx + t * 0.3, gy + 2, Math.round(t * 0.38), t * 0.18); bedGlowcap(T, gx - t * 0.28, gy + 1, Math.round(t * 0.26), t * 0.13);
      },
      front: (cx, cy) => { for (const [an, r] of [[2.5, 0.18], [2.75, 0.13]]) bedPlush(T, cx + Math.cos(an) * R * 0.9, cy - H + Math.sin(an) * R * (q * 0.9) - 1, t * r, t * r * 0.7, BED_MOSS, { gloss: r > 0.15 }); },
    });
  },
  hammock(t, T, ax, ay, o = {}) {
    // a glowcap hammock: two great glowcaps growing from mossy mounds, and slung between their stems a deep striped sling
    // of felt and woven moss on root-wood spreaders, a fleece cushion inside. In the room its near side (o.part "post") is
    // drawn again over whoever sleeps in it, so they lie down inside the sling. It hangs a size up from the other beds
    t *= 1.12;
    const lipOnly = o.part === "post", cx = ax, cy = ay + t, x0 = cx - t * 1.62, x1 = cx + t * 1.62, top = cy - t * 1.02;
    const e0 = x0 + t * 0.38, e1 = x1 - t * 0.38, S = x => clamp((x + 0.5 - e0) / (e1 - e0), 0, 1), sn = x => Math.sin(Math.PI * S(x));
    const yc = x => top + t * 0.55 * sn(x), yb = x => yc(x) - t * (0.2 + 0.36 * sn(x)), yf = x => yc(x) - t * (0.08 + 0.2 * sn(x)), yu = x => yc(x) + t * (0.1 + 0.2 * sn(x));
    if (!lipOnly) {
      for (const x of [x0, x1]) {
        // the glowcap: a mossy mound, a pale stem leaning out a little, a wide cap glowing over it
        const out = x < cx ? -1 : 1, capY = cy - t * 1.6, rx = t * 0.52, ry = t * 0.34, cxp = x + out * t * 0.08;
        T.glow(cxp, capY, t * 1.05, BED_GLOW[4], 0.3);
        bedPlush(T, x, cy - t * 0.1, t * 0.4, t * 0.2, BED_MOSS, { gloss: false });
        const w = Math.max(1.5, t * 0.1);
        for (let y = Math.round(capY); y <= Math.round(cy - t * 0.14); y++) {
          const f = (cy - y) / (cy - capY), sx = x + out * t * 0.08 * f * f, ww = w + (f < 0.12 ? (0.12 - f) * 14 : 0);
          for (let q = Math.floor(-ww); q <= Math.ceil(ww); q++) T.px(sx + q, y, q < -ww * 0.35 ? BED_GLOW[0] : q < ww * 0.4 ? BED_GLOW[1] : BED_GLOW[2]);
        }
        T.disc(cxp, capY + 1, rx * 0.96, (xx) => (Math.round(xx - cxp) % 2 ? BED_GLOW[3] : BED_GLOW[4]), ry * 0.42);
        for (let y = Math.floor(capY - ry); y <= capY; y++) for (let xx = Math.floor(cxp - rx); xx <= Math.ceil(cxp + rx); xx++) {
          const dx = (xx + 0.5 - cxp) / rx, dy = (y + 0.5 - capY) / ry;
          if (dx * dx + dy * dy > 1) continue;
          T.px(xx, y, y === Math.floor(capY) || Math.abs(dx) > 0.9 ? BED_GLOW[1] : BED_GLOW[1 + bedBand(-dx * 0.6 - dy * 0.6 - 0.2, [0.45, -0.05, -0.5], xx, y)]);
        }
        { const gx = cxp - rx * 0.38, gy = capY - ry * 0.55; T.disc(gx, gy, Math.max(1.5, rx * 0.22), IC.white, Math.max(1, ry * 0.2)); }
        for (const [dx, dy] of [[-0.3, 0.35], [0.25, 0.25], [0.5, 0.42]]) T.px(cxp + dx * rx, capY - dy * ry, BED_GLOW[0]);
        // twine wound round the stem, ropes fanning out to the spreader
        for (let k = 0; k < 3; k++) T.line(x - w - 1, top - 2 + k * 2, x + w + 1, top - 1 + k * 2, BED_ROOT[k % 2 ? 2 : 1]);
        const ex = x < cx ? e0 : e1;
        for (const y of [yb(ex), (yb(ex) + yu(ex)) / 2, yu(ex)]) T.line(x - out * w, top, ex, y, BED_ROOT[1]);
      }
      // inside the sling: its far wall of felt in stripes, then the fleece cushion along the bottom
      for (let x = Math.floor(e0); x <= Math.ceil(e1); x++) for (let y = Math.floor(yb(x)); y <= Math.ceil(yf(x)); y++) {
        if (y + 0.5 < yb(x)) continue;
        const v = (y + 0.5 - yb(x)) / Math.max(1, yf(x) - yb(x)), s = S(x);
        if (v < 0.14) T.px(x, y, BED_FELT[0]);
        else if (v < 0.5) T.px(x, y, v > 0.28 && v < 0.36 ? BED_FLEECE[2] : BED_FELT[1 + bedBand(0.3 - (s - 0.4) * 0.9 - v, [0.1, -0.3], x, y)]);
        else T.px(x, y, BED_FLEECE[Math.min(3, bedBand(0.8 - (s - 0.35) * 1.1 - (v - 0.5) * 1.6, [0.6, 0.15, -0.3], x, y) + ((x + y * 3) % 5 === 0 && pxHash(x, y) > 0.5 ? 1 : 0))]);
      }
    }
    // the sling's near side: a rolled plush edge, felt bellying under in stripes, a band of woven moss, moss hanging below
    for (let x = Math.floor(e0); x <= Math.ceil(e1); x++) {
      const s = S(x), a = yf(x), b = yu(x);
      for (let y = Math.floor(a); y <= Math.ceil(b); y++) {
        if (y + 0.5 < a || y - 0.5 > b) continue;
        const v = (y + 0.5 - a) / Math.max(1, b - a), lit = 0.45 - (s - 0.35) * 1.3 - v * 0.9;
        let col;
        if (y + 0.5 - a < 2.2) col = y + 0.5 - a < 1.1 ? BED_FELT[0] : BED_FELT[1];
        else if (v > 0.3 && v < 0.42) col = BED_FLEECE[1 + bedBand(lit, [0.1, -0.4], x, y)];
        else if (v > 0.58 && v < 0.76) col = BED_MOSS[(((x >> 1) + (y & 1)) & 1 ? 1 : 2) + (lit < -0.3 ? 1 : 0)];
        else col = BED_FELT[Math.min(4, 1 + bedBand(lit, [0.3, -0.15, -0.5], x, y))];
        T.px(x, y, col);
      }
      if (s > 0.12 && s < 0.88 && pxHash(x, 7) > 0.7) { const n = 1 + Math.round(pxHash(x, 9) * 2); for (let k = 1; k <= n; k++) T.px(x, b + k, BED_MOSS[k === n ? 3 : 2]); }
    }
    // a glossy sheen on the felt, the way the glowlings shine
    { const gx = e0 + (e1 - e0) * 0.26, gy = yf(gx) + 3; T.line(gx - t * 0.2, gy, gx + t * 0.14, gy + 1, IC.white); T.px(gx + t * 0.22, gy + 1, BED_FELT[0]); }
    // the spreaders: a root-wood bar across each end, holding the sling open
    for (const ex of [e0, e1]) for (let y = Math.floor(yb(ex) - 2); y <= Math.ceil(yu(ex) + 2); y++) { T.px(ex - 1, y, BED_ROOT[1]); T.px(ex, y, BED_ROOT[2]); T.px(ex + 1, y, BED_ROOT[3]); }
  },
  canopy(t, T, ax, ay, o = {}) {
    // the glowcap canopy: a low bed of carved root-wood with a mossy mattress, fleece pillows and a rose felt quilt, under a
    // great glowcap growing from the back corner, its cap spread over the bed like a lamp, spores drifting down. In the room
    // the cap is drawn on its own (o.part "roof") over whoever sleeps under it
    const U = t / 2, K = isoKit(T, ax, ay), hb = Math.round(t * 0.18), hm = Math.round(t * 0.14), zt = hb + hm, u0 = 0.14 * U, u1 = 1.92 * U, v0 = 0.14 * U, v1 = 1.92 * U;
    const base = o.part !== "roof", roof = !o.part || o.part === "roof", Hs = Math.round(t * 2.4), [sx, sy] = K.P(0.16 * U, 0.16 * U, 0), [kx, ky] = K.P(0.95 * U, 0.95 * U, Hs);
    const capDraw = () => {
      // the cap: gills underneath, a domed top glowing from within, brightest at its rim, a big glossy spot
      const rx = t * 1.3, ry = t * 0.62;
      T.disc(kx, ky + 1, rx, (x) => ((x - kx) % 3 === 0 ? BED_GLOW[3] : BED_GLOW[2]), rx * 0.32);
      for (let y = Math.floor(ky - ry); y <= ky; y++) for (let x = Math.floor(kx - rx); x <= Math.ceil(kx + rx); x++) {
        const dx = (x + 0.5 - kx) / rx, dy = (y + 0.5 - ky) / ry;
        if (dx * dx + dy * dy > 1) continue;
        T.px(x, y, Math.abs(dx) > 0.88 || y === ky ? BED_GLOW[1] : BED_GLOW[1 + bedBand(-dx * 0.6 - dy * 0.5 - 0.1, [0.4, -0.05, -0.45], x, y)]);
      }
      { const gx = kx - rx * 0.4, gy = ky - ry * 0.62; T.disc(gx, gy, rx * 0.2, IC.white, ry * 0.14); }
      for (let k = 0; k < 6; k++) { const x = kx + (pxHash(k, 3) - 0.5) * rx * 1.6, y = ky + 4 + pxHash(3, k) * t * 0.9; T.px(x, y, k % 2 ? BED_GLOW[0] : BED_GLOW[1]); }
    };
    if (!base) return capDraw();
    T.glow(kx, ky + t * 0.3, t * 2.0, BED_GLOW[4], 0.3);
    // the stem: thick at its foot, curving out over the bed, pale and glowing from inside
    for (let k = 0; k <= Hs + 2; k++) {
      const f = k / Hs, x = sx + (kx - sx) * f * f, w = Math.max(2, t * (0.2 - 0.08 * f)) + (k < 3 ? 2 : 0);
      for (let q = -w; q <= w; q++) T.px(x + q, sy - k * (sy - ky) / Hs, q < -w * 0.4 ? BED_GLOW[1] : q < w * 0.35 ? BED_GLOW[0] : BED_GLOW[2]);
    }
    bedPlush(T, sx, sy - 1, t * 0.4, t * 0.18, BED_MOSS, { gloss: false });
    // the bed: a root-wood frame, the mossy mattress, the quilt over the front with a fleece turn-down, pillows at the back
    K.box(u0, v0, 0, u1 - u0, v1 - v0, hb, BED_ROOT[1], BED_ROOT[2], BED_ROOT[3]);
    K.box(u0 + 0.06 * U, v0 + 0.06 * U, hb, u1 - u0 - 0.12 * U, v1 - v0 - 0.12 * U, hm, BED_MOSS[1], BED_MOSS[2], BED_MOSS[3]);
    const qv = v0 + 0.62 * U, ue = u1 - 0.06 * U, ve = v1 - 0.06 * U;
    K.quad([[u0 + 0.04 * U, qv, zt], [ue + 0.04 * U, qv, zt], [ue + 0.04 * U, ve + 0.04 * U, zt], [u0 + 0.04 * U, ve + 0.04 * U, zt]], BED_ROSE[1], 0);
    K.faceV(ve + 0.04 * U, u0 + 0.04 * U, ue + 0.04 * U, hb - 2, zt, BED_ROSE[2], 0);
    K.faceU(ue + 0.04 * U, qv, ve + 0.04 * U, hb - 2, zt, BED_ROSE[3], 0);
    for (let k = 1; k < 4; k++) { const v = qv + (ve - qv) * k / 4; K.seg([u0 + 0.1 * U, v, zt], [ue, v, zt], BED_ROSE[2]); }
    K.quad([[u0 + 0.04 * U, qv, zt], [ue + 0.04 * U, qv, zt], [ue + 0.04 * U, qv + 0.16 * U, zt], [u0 + 0.04 * U, qv + 0.16 * U, zt]], BED_FLEECE[1], 0);
    for (let u = u0 + 0.12 * U; u < ue; u += 0.12 * U) K.dot(u, qv + 0.2 * U, zt, BED_FLEECE[0]);
    for (const u of [0.55 * U, 1.3 * U]) { const [x, y] = K.P(u, v0 + 0.32 * U, zt); bedPlush(T, x, y - t * 0.08, t * 0.34, t * 0.19, BED_FLEECE, { curls: true }); }
    if (roof) capDraw();
  },
  gazebo(t, T, ax, ay, o = {}) {
    // a wooden deck over the two tiles, four posts of root-wood, a peaked roof thatched with moss, crystal lights glowing
    // round the eaves, plush cushions of felt and fleece inside.
    // In the room it's drawn in two parts (o.part): "base" goes under the sleepers, "roof" (the front post and the roof) over them
    const base = !o.part || o.part === "base", front = !o.part || o.part === "post", roof = !o.part || o.part === "roof";
    const a = GAZEBO_A * t, x = ax, y = ay + t - a, dh = Math.max(2, Math.round(t * 0.14)), ph = Math.round(t * 1.3);
    if (base) T.box(x, y, a, a, dh, IC.w1, IC.w2, IC.w3);
    const top = y - dh, c = [[x, top], [x + 2 * a, top + a], [x - 2 * a, top + a], [x, top + 2 * a]], mid = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
    // planks
    if (base) for (const u of [0.2, 0.4, 0.6, 0.8]) { const [x0, y0] = mid(c[0], c[2], u), [x1, y1] = mid(c[1], c[3], u); T.line(x0, y0, x1, y1, IC.w0); }
    const post = ([px, py]) => { for (let k = 0; k < ph; k++) { T.px(px - 2, py - k, BED_ROOT[0]); T.px(px - 1, py - k, BED_ROOT[1]); T.px(px, py - k, BED_ROOT[1]); T.px(px + 1, py - k, BED_ROOT[2]); T.px(px + 2, py - k, BED_ROOT[3]); } };
    const cy = top + a;
    if (base) post(c[0]), post(c[1]), post(c[2]);
    // cushions heaped along the back, a small one at the front
    if (base) for (const [dx, dy, r, ramp] of [[0, -0.45, 0.5, BED_ROSE], [-0.9, -0.05, 0.44, BED_FELT], [0.9, -0.05, 0.44, BED_MOSS], [-0.3, 0.1, 0.36, BED_FLEECE], [0.45, 0.35, 0.32, BED_ROSE]])
      bedPlush(T, x + dx * a, cy + dy * a - t * 0.12, t * r, t * r * 0.72, ramp, { curls: ramp === BED_FLEECE });
    if (front) post(c[3]);
    if (!roof) return;
    // the roof: the eaves stick out past the posts, the peak stands high above the middle
    const ex = ([px, py]) => [x + (px - x) * 1.1, cy - ph + (py - cy) * 1.1], e = c.map(ex), apex = [x, cy - ph - t * 1.25];
    // (the moss lies in soft rows, lumpy where they overlap)
    const thatch = lit => (xx, yy) => BED_MOSS[Math.min(3, bedBand(lit + (pxNoise(xx * 0.4, yy * 0.9) - 0.5) * 0.5, [0.35, -0.1, -0.5], xx, yy))];
    T.poly([e[2], e[3], apex], thatch(0.25));
    T.poly([e[1], e[3], apex], thatch(-0.3));
    for (const u of [0.3, 0.55, 0.8]) { T.line(...mid(apex, e[2], u), ...mid(apex, e[3], u), BED_MOSS[2]); T.line(...mid(apex, e[3], u), ...mid(apex, e[1], u), BED_MOSS[3]); }
    T.line(...apex, ...e[3], BED_MOSS[0]);
    for (const [p, q] of [[e[2], e[3]], [e[3], e[1]]]) { T.line(p[0], p[1], q[0], q[1], BED_MOSS[1]); T.line(p[0], p[1] + 1, q[0], q[1] + 1, BED_ROOT[2]); }
    // crystal lights hanging in little loops under the eaves, glowing
    for (const [p, q] of [[e[2], e[3]], [e[3], e[1]]]) for (let k = 1; k < 9; k++) { const [lx, ly] = mid(p, q, k / 9), sag = 2 + Math.round(Math.sin((k % 3) / 3 * Math.PI) * 2), [c0, c1] = k % 3 ? [BED_GLOW[1], BED_GLOW[2]] : [IC.l0, IC.l2]; T.px(lx, ly + sag, c0); T.px(lx + 1, ly + sag, c1); T.px(lx, ly + sag + 1, c1); T.glow(lx, ly + sag, 3, c1, 0.35); }
    bedCrystal(T, apex[0], apex[1] + 1, Math.max(5, t * 0.4), Math.max(1.5, t * 0.09));
  },
};

/** The dab of colour on a garden label: each seed's own. */
const GARDEN_TAG = { glowberry: IC.l2, moonmint: IC.b1, cookiecorn: IC.w1, growcap: IC.r1, sunpetal: IC.y1, crystalbloom: IC.l1, biteleaf: IC.r2 };
/** A small picture of a bed, for choosing one. */
const bedThumbs = {};
function bedThumb(id) {
  if (bedThumbs[id]) return bedThumbs[id];
  // (tall enough for the gazebo's roof and the glowcap's cap)
  const t = 14, c = isoArt(t * 4 + 8, Math.round(t * 4.4 + 8), T => ISO_ART.bed(t, T, t * 2 + 4, 4 + t * 2.2, { style: id }));
  return bedThumbs[id] = c.toDataURL();
}
/** The baked picture of one placed piece, in CSS pixels ready for drawBaked. */
function isoPiece(p, extra = {}, ahead = false) {
  const tw = N.isoW / ISO_G / PX, pad = Math.ceil(tw * 1.2) + 3, base = pieceDims(p.id, false);
  // (room above the footprint for tall pieces: dressers, chimneys, a greenhouse's roof)
  const w = Math.ceil((base.fw + base.fd) * tw + pad * 2), h = (base.fw + base.fd) * tw / 2 + tw * 4 + pad;
  const ax0 = base.fd * tw + pad, ay = tw * 4 + pad / 2;
  // (where it stands on screen is part of the key: a resized window can move the room without changing its size)
  const [bx, by] = isoAt(p.i / ISO_G, p.j / ISO_G);
  const key = `${p.id}|${p.i},${p.j}|${p.flip}|${tw.toFixed(2)}|${Math.round(bx)},${Math.round(by)}|${JSON.stringify(extra)}`;
  const slot = p.id + (extra.part || ""), id = slot + "|" + key;
  // baking ahead (see bakeAhead): painted now and put by until the room is walked into, the room you're in left as it is
  if (ahead) { if (isoPieces[slot]?.key !== key && !isoAhead.has(id)) keepAhead(isoAhead, id, make(), 60); return null; }
  return cachedSprite(isoPieces, slot, key, () => { const f = isoAhead.get(id); isoAhead.delete(id); return f || make(); });
  function make() {
    let c = isoArt(w, h, T => ISO_ART[p.id](tw, T, ax0, ay, extra)), ax = ax0;
    if (p.flip) {
      // turned to face the other wall: a mirror image (the back corner stays the back corner)
      const m = document.createElement("canvas"); m.width = c.width; m.height = c.height;
      const g = m.getContext("2d"); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0);
      if (c._solid) { const s = c._solid, cw = c.width; m._solid = s.map((_, i) => s[i - i % cw + cw - 1 - i % cw]); }
      c = m; ax = c.width - ax0;
    }
    return { c, x: Math.round(bx / PX - ax) * PX, y: Math.round(by / PX - ay) * PX };
  }
}

/** The geode shelf on its wall, showing your three shiniest geodes in their own colors. */
function drawShelfIso() {
  const m = wallSlot("shelf"), tw = N.isoW / ISO_G / PX, c = (m.s + 0.5) / ISO_G, half = 0.65 / 2 / ISO_G * 2;
  const best = Object.entries(save.geodes).filter(([id]) => CRYSTAL[id]).sort((p, q) => (q[1].shine || 0) - (p[1].shine || 0)).slice(0, 3).map(([id]) => CRYSTAL[id].c.map(pxHex));
  const k = fxAge("shelf"), spark = k < 0.9 ? Math.floor(k / 0.3) : undefined;
  const pad = Math.ceil(tw * 0.6) + 4, w = Math.ceil(tw * 1.5 + pad * 2), h = Math.ceil(tw * 1.1 + pad);
  // the plank starts a little before the slot's middle and runs along the wall
  const [bx, by] = m.wall === "R" ? isoAt(c - half / 2, 0) : isoAt(0, c - half / 2), lift = N.isoWall * 0.5;
  const f = cachedSprite(isoPieces, "shelf", `${m.wall}|${m.s}|${tw.toFixed(2)}|${Math.round(bx)},${Math.round(by)}|${JSON.stringify(best)}|${spark}`, () => {
    const ax = pad, ay = Math.round(tw * 0.75);
    let cv = isoArt(w, h, T => ISO_ART.shelf(tw, T, ax, ay, { gems: best, spark })), x0 = ax;
    if (m.wall === "L") { const mm = document.createElement("canvas"); mm.width = cv.width; mm.height = cv.height; const g = mm.getContext("2d"); g.translate(cv.width, 0); g.scale(-1, 1); g.drawImage(cv, 0, 0); cv = mm; x0 = cv.width - ax; }
    return { c: cv, x: Math.round(bx / PX - x0) * PX, y: Math.round((by - lift) / PX - ay) * PX };
  });
  pieceHits.shelf = { c: f.c, x: f.x, y: f.y };
  drawBaked(f);
}

/** The swing in the room: its frame, then the ropes and the moon seat swinging under the bar. */
function drawSwingIso(p) {
  const f = isoPiece(p, { room: true });
  pieceHits.swing = { c: f.c, x: f.x, y: f.y };
  drawBaked(f);
  const [sx, sy, , top, bar, cx] = swingSeat(), r = N.isoW / ISO_G * 0.62;
  ctx.fillStyle = "#d8d2e0";
  for (const d of [-1, 1]) {
    const x0 = cx + d * bar[0], y0 = top + d * bar[1] + PX, x1 = sx + Math.sign(d * bar[0]) * r * 0.7, y1 = sy - r * 0.1, n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / PX));
    for (let k = 0; k <= n; k++) ctx.fillRect(Math.round(lerp(x0, x1, k / n) / PX) * PX, Math.round(lerp(y0, y1, k / n) / PX) * PX, PX, PX);
  }
  // the moon seat, baked once in pixels and carried along the swing
  const R = Math.round(r / PX), m = cachedSprite(isoPieces, "moonseat", `${R}|${PX}`, () => ({ c: isoArt(R * 2 + 6, R + 8, T => moonSeat(T, R + 3, 3, R)) }));
  drawBaked({ c: m.c, x: Math.round(sx / PX - R - 3) * PX, y: Math.round(sy / PX - 3) * PX });
}

// ---------- rearranging the room ----------
const arrange = { on: false, sel: null, drag: null };
function startArrange() {
  show("shop", false);
  arrange.on = true; arrange.sel = null; arrange.drag = null;
  document.body.classList.add("arranging");
  $("arrangeBar").hidden = false; arrangeUi();
}
function stopArrange() {
  arrange.on = false; arrange.sel = arrange.drag = null;
  document.body.classList.remove("arranging");
  $("arrangeBar").hidden = true;
  [N.bedX, N.bedY] = roomSpot("bed");
}
/** What sort of thing is being arranged: a floor piece on tiles, a wall piece in a slot along a wall, or the rug. */
const arrangeKind = id => WALL_ITEMS[id] ? "wall" : id === "rug" ? "rug" : "floor";
function arrangeUi() {
  const id = arrange.sel;
  $("arrangeTip").textContent = id ? (DECO[id]?.name || tr(id === "bed" ? "Bed" : "Incubator")) : tr("Tap a piece, then drag it to a new spot");
  $("arrangeFlip").disabled = !id || id === "rug";
  $("arrangeStore").disabled = !id || !!ISO_FIXED[id];
}
/** The wall piece under a finger, if any. */
function wallItemAt(x, y) {
  for (const id of Object.keys(WALL_ITEMS)) {
    if (!hasDecor(id)) continue;
    const m = wallSlot(id), [fx, fy] = wallFoot(m.wall, m.s), cy = fy - N.isoWall * (id === "painting" ? 0.65 : 0.55), r = N.isoW / ISO_G * 1.1;
    if (Math.abs(x - fx) < r && Math.abs(y - cy) < r * 0.9) return id;
  }
  return null;
}
/** What's under a finger: a wall piece, else the nearest floor piece whose footprint or body is there, else the rug. */
function pieceAt(x, y) {
  const w = wallItemAt(x, y);
  if (w) return w;
  let best = null, bd = Infinity;
  for (const p of Object.values(isoLayout().placed)) {
    const [px, py] = isoPieceAt(p), tile = N.isoW / ISO_G, reach = tile * Math.max(p.fw, p.fd);
    if (Math.abs(x - px) < reach && y < py + tile * 0.7 && y > py - tile * 2.2) { const d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = p.id; } }
  }
  if (best) return best;
  if (hasDecor("rug")) { const [rx, ry] = rugSize(), [cx, cy] = roomSpot("rug"); if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) return "rug"; }
  return null;
}
/** Would this piece fit with its corner on tile (i, j), turned or not, ignoring where it is now? */
function pieceFits(id, i, j, flip) {
  const d = pieceDims(id, flip);
  if (i < 0 || j < 0 || i + d.fw > ISO_G || j + d.fd > ISO_G || inDoorway(i, j, d.fw, d.fd, isoLayout().doors)) return false;
  for (const p of Object.values(isoLayout().placed)) {
    if (p.id === id) continue;
    if (i < p.i + p.fw && p.i < i + d.fw && j < p.j + p.fd && p.j < j + d.fd) return false;
  }
  return true;
}
/** Is this wall slot clear of the other wall piece? */
const wallFree = (id, wall, s) => !wallInDoor(wall, s) && !wallKept(wall, s) && Object.keys(WALL_ITEMS).every(o => o === id || !hasDecor(o) || wallSlot(o).wall !== wall || Math.abs(wallSlot(o).s - s) >= 1.6);
function setLayout(id, m) {
  save.layout = { ...save.layout, [id]: m };
  isoLayoutCache = null; persist(); sfx.setDown();
}
const placePiece = (id, i, j, flip) => setLayout(id, { i, j, flip: !!flip });
function arrangeDown(x, y) {
  const id = pieceAt(x, y);
  arrange.sel = id; arrange.drag = null; arrangeUi();
  if (id && arrangeKind(id) === "floor") { const p = isoLayout().placed[id], [u, v] = isoFrom(x, y); arrange.grab = [u * ISO_G - p.i, v * ISO_G - p.j]; }
  else if (id === "rug") { const [rx, ry] = roomSpot("rug"); arrange.grab = [x - rx, y - ry]; }
}
function arrangeMove(x, y) {
  const id = arrange.sel;
  if (!id) return;
  const kind = arrangeKind(id);
  if (kind === "wall") {
    // whichever wall the finger is nearer: the left half of the room is the left wall
    const wall = x < N.cx ? "L" : "R", s = clamp(Math.round(Math.abs(x - N.cx) / N.isoW * ISO_G - 0.5), 0, ISO_G - 1);
    arrange.drag = { id, wall, s, ok: wallFree(id, wall, s), door: wallInDoor(wall, s) };
  } else if (kind === "rug") {
    const m = 0.26, [u, v] = isoFrom(x - arrange.grab[0], y - arrange.grab[1]);
    arrange.drag = { id, u: clamp(u, m, 1 - m), v: clamp(v, m, 1 - m), ok: true };
  } else {
    const p = isoLayout().placed[id];
    if (!p) return;
    const [u, v] = isoFrom(x, y), i = Math.round(u * ISO_G - arrange.grab[0]), j = Math.round(v * ISO_G - arrange.grab[1]), flip = autoFlip(id, i, j, p.flip);
    const dd = pieceDims(id, flip);
    arrange.drag = { id, i, j, flip, ok: pieceFits(id, i, j, flip), door: inDoorway(i, j, dd.fw, dd.fd, doorTiles()) };
  }
}
function arrangeUp() {
  const d = arrange.drag;
  if (d && d.ok) {
    if (d.wall) setLayout(d.id, { wall: d.wall, s: d.s });
    else if (d.id === "rug") setLayout("rug", { u: d.u, v: d.v });
    else { const p = isoLayout().placed[d.id]; if (p && (d.i !== p.i || d.j !== p.j || d.flip !== p.flip)) placePiece(d.id, d.i, d.j, d.flip); }
  } else if (d) toast(tr(d.door ? "Keep the tunnel clear" : "That spot is taken"));
  arrange.drag = null; arrangeUi();
}
/** Turn the chosen piece: a floor piece faces the other wall (where it is if it fits, or the nearest free spot); a wall piece goes to the other wall. */
function arrangeFlip() {
  const id = arrange.sel, kind = id && arrangeKind(id);
  if (kind === "wall") {
    const m = wallSlot(id), wall = m.wall === "L" ? "R" : "L", s = [Math.round(m.s), 0, 1, 2, 3, 4, 5].find(k => wallFree(id, wall, k));
    if (s === undefined) { toast(tr("No room to turn it here")); return; }
    setLayout(id, { wall, s });
    return;
  }
  const p = kind === "floor" && isoLayout().placed[id];
  if (!p) return;
  const flip = !p.flip, spots = [[p.i, p.j], ...Array.from({ length: ISO_G * ISO_G }, (_, k) => [k % ISO_G, Math.floor(k / ISO_G)]).sort((a, b) => Math.hypot(a[0] - p.i, a[1] - p.j) - Math.hypot(b[0] - p.i, b[1] - p.j))];
  const spot = spots.find(([i, j]) => pieceFits(p.id, i, j, flip));
  if (!spot) { toast(tr("No room to turn it here")); return; }
  placePiece(p.id, spot[0], spot[1], flip);
}
function arrangeStore() {
  const id = arrange.sel;
  if (!id || ISO_FIXED[id] || !save.decor[id]) return;
  save.decor[id].on = false; isoLayoutCache = null; if (id === "bowl") bowlEmpty(); persist(); sfx.tick();
  arrange.sel = null; arrangeUi();
}
/** While arranging: the floor's tiles, the chosen piece's place, and where it would land. */
function drawArrangeGrid() {
  const corner = (i, j) => isoAt(i / ISO_G, j / ISO_G);
  ctx.save();
  ctx.strokeStyle = "rgba(230,224,255,.22)"; ctx.lineWidth = 1;
  for (let k = 0; k <= ISO_G; k++) { let [a, b] = [corner(k, 0), corner(k, ISO_G)]; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); [a, b] = [corner(0, k), corner(ISO_G, k)]; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
  const fill = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); ctx.fill(); };
  const foot = (i, j, fw, fd, col) => fill([corner(i, j), corner(i + fw, j), corner(i + fw, j + fd), corner(i, j + fd)], col);
  // a wall slot: a band up the wall
  const band = (wall, s, col) => { const a = wall === "R" ? corner(s, 0) : corner(0, s), b = wall === "R" ? corner(s + 1, 0) : corner(0, s + 1), up = N.isoWall * 0.9; fill([a, b, [b[0], b[1] - up], [a[0], a[1] - up]], col); };
  const ring = (x, y, col) => { const [rx, ry] = rugSize(); ctx.strokeStyle = col; ctx.lineWidth = PX * 1.5; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.stroke(); };
  // the doorways, darkened: nothing can stand there (and the arches' shapes, as they're not drawn while you arrange)
  for (const t of isoLayout().doors) { const [i, j] = t.split(",").map(Number); foot(i, j, 1, 1, "rgba(11,6,20,.42)"); }
  for (const w of roomDoors()) fill(passageShape(w.wall), "rgba(11,6,20,.6)");
  const id = arrange.sel, kind = id && arrangeKind(id), d = arrange.drag, gold = "rgba(238,194,106,.35)", ok = "rgba(87,173,106,.5)", no = "rgba(224,99,79,.5)";
  if (kind === "floor") {
    const p = isoLayout().placed[id];
    if (p) foot(p.i, p.j, p.fw, p.fd, gold);
    if (d && p) { const dd = pieceDims(id, d.flip); foot(d.i, d.j, dd.fw, dd.fd, d.ok ? ok : no); }
  } else if (kind === "wall") {
    const m = wallSlot(id);
    band(m.wall, m.s, gold);
    if (d) band(d.wall, d.s, d.ok ? ok : no);
  } else if (kind === "rug") {
    ring(...roomSpot("rug"), "rgba(238,194,106,.7)");
    if (d) ring(...isoAt(d.u, d.v), "rgba(87,173,106,.9)");
  }
  ctx.restore();
}
const isoPieces = {};

// ---------- baking ahead: the places' rooms, pieces and keepers are painted in idle moments, so walking in is smooth ----------
const roomAhead = new Map(), isoAhead = new Map();
/** Put something by in a little store that forgets the oldest first. */
const keepAhead = (m, k, v, max) => { m.delete(k); m.set(k, v); while (m.size > max) m.delete(m.keys().next().value); };
/** The map's places and the room each one is (the garden is the yard outside, the trail leads to the explorers' camp). */
const PLACE_ROOM = { garden: "yard", trail: "camp" };
/** Everything as if you stood in room i (its decor, its layout, its backdrop) while fn paints; then all back as it was. */
function asIfIn(i, fn) {
  const was = save.room, keep = ROOM_KEYS.map(k => [k, k in save, save[k]]), on = Object.entries(save.decor).map(([id, d]) => [d, d.on]), layout = isoLayoutCache;
  try {
    const r = save.rooms[i];
    save.room = i;
    for (const [id, d] of Object.entries(save.decor)) d.on = r.on.includes(id);
    for (const k of ROOM_KEYS) { if (r[k] == null) delete save[k]; else save[k] = r[k]; }
    isoLayoutCache = null;
    fn();
  } finally {
    save.room = was;
    for (const [k, had, v] of keep) { if (had) save[k] = v; else delete save[k]; }
    for (const [d, v] of on) d.on = v;
    isoLayoutCache = layout;
  }
}
/** One place's backdrop and walls ("room"), its furniture ("pieces") or its keeper ("keeper"), painted ahead of time. */
function bakePlace(kind, part) {
  let i = save.rooms.findIndex(r => r.kind === kind);
  const added = i < 0;
  // (a place never visited has no room yet: one stands in for it while it's painted, the way ensurePlace will make it)
  if (added) { save.rooms.push({ kind, on: [], theme: ROOM_KINDS.find(k => k.id === kind).theme }); i = save.rooms.length - 1; }
  try {
    asIfIn(i, () => {
      if (part === "room") {
        bgFor("nest");
        const key = roomKey();
        if (roomCanvas.key !== key && !roomAhead.has(key)) keepAhead(roomAhead, key, paintRoomIso(currentTheme()), 8);
      } else if (part === "pieces") {
        // (as drawRoomIso paints them: the incubator and the swing draw themselves, wall pieces hang elsewhere)
        for (const p of Object.values(isoLayout().placed)) {
          if (p.id === "incubator" || p.id === "swing" || typeof ISO_ART[p.id] !== "function") continue;
          const extra = pieceExtra(p), layers = p.id === "bed" && BED_LAYERS[extra.style];
          isoPiece(p, layers ? { ...extra, part: "base" } : extra, true);
          if (layers) for (const part of layers) isoPiece(p, { ...extra, part }, true);
        }
      } else if (heroHere() && !heroHere().none) {
        // the keeper drawn once out of sight, which bakes the pose they'll stand in
        const real = ctx, said = game.hero;
        ctx = bakeScratch.getContext("2d"); game.hero = null;
        try { drawHero(); } finally { ctx = real; game.hero = said; }
      }
    });
  } finally { if (added) save.rooms.pop(); }
}
const bakeScratch = document.createElement("canvas");
let aheadJobs = null;
/**
 * Paint the places you can go to before you get there, one job at a time when the browser is idle (after Play, and when the
 * map opens): the first step into the forge or the camp is then as smooth as the hundredth.
 */
function bakeAhead() {
  if (aheadJobs) return;
  const here = save.rooms[save.room]?.kind;
  const kinds = WORLD.filter(w => w.id !== "nest" && placeOk(w.id)).map(w => PLACE_ROOM[w.id] || w.id).filter(k => k !== here && ROOM_KINDS.some(r => r.id === k));
  aheadJobs = kinds.flatMap(k => ["room", "pieces", "keeper"].map(part => () => bakePlace(k, part)));
  const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 2000 }) : setTimeout(f, 250));
  const next = () => {
    // (only on the room's own pixel grid: not while cracking, nor in the middle of playing together)
    if (!aheadJobs.length || !["nest", "map", "lib"].includes(game.scene) || coopSession) { aheadJobs = null; return; }
    // (a job that fails costs nothing but its own head start)
    try { aheadJobs.shift()(); } catch (e) { console.warn("bakeAhead", e); }
    idle(next);
  };
  idle(next);
}

// ---------- the floating cloud: it drifts above everything, you can drag it anywhere, and sleepy glowlings nap on top ----------
const CLOUD_DEFAULT = [0.16, 0.5];
const cloudUV = () => save.cloud && Number.isFinite(save.cloud[0]) ? save.cloud : CLOUD_DEFAULT;
const cloudLift = () => N.base * 1.15;
/** Where the cloud is: the floor point under it, and its body up in the air (with a slow bob). */
function cloudSpot() {
  const [u, v] = cloudUV(), [x, y] = isoAt(u, v), bob = Math.round(Math.sin(game.time * 0.0016) * 2) * PX;
  return { x, y, bodyY: y - cloudLift() + bob };
}
function cloudSprite() {
  const t = Math.round(N.isoW / ISO_G / PX * 1.9), w = t * 2 + 12, h = t + 14;
  return cachedSprite(isoPieces, "cloud", `${t}|${PX}`, () => ({ c: isoArt(w, h, T => paintCloud(T, t, w, h), { outline: false }), w, h }));
}
/**
 * A real-looking cumulus in pixels: a heap of round puffs of different sizes over a flatter base, lit from above (white on
 * top, cool blue-grey underneath, in a dithered gradient), a little brighter along the top-left of each puff, and soft,
 * dithered edges instead of an outline.
 */
const CLOUD_RAMP = ["#ffffff", "#eef3fb", "#d6dff0", "#b3c1de", "#8f9fc6"].map(pxHex);
function paintCloud(T, t, w, h) {
  const cx = w / 2, cy = h / 2 + t * 0.05, base = cy + t * 0.28;
  const puffs = [[-0.62, 0.12, 0.28], [-0.32, -0.02, 0.38], [0.05, -0.16, 0.46], [0.42, -0.04, 0.38], [0.7, 0.12, 0.26], [-0.12, 0.16, 0.34], [0.25, 0.18, 0.32], [-0.45, 0.2, 0.22]]
    .map(([dx, dy, r]) => [cx + dx * t, cy + dy * t, r * t]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (y > base) continue;
    let dmin = 9, lit = -1;
    for (const [px, py, r] of puffs) { const d = Math.hypot(x + 0.5 - px, (y + 0.5 - py) / 0.82) / r; if (d < dmin) { dmin = d; lit = (px - x) / r * 0.5 + (py - y) / r * 0.8; } }
    if (dmin > 1) continue;
    const b = PX_BAYER[(y & 3) * 4 + (x & 3)];
    if (dmin > 0.9 && b > 0.55) continue;                      // a soft, dithered edge
    const v = clamp((y - (cy - t * 0.55)) / (t * 0.9), 0, 1) * 0.85 + (y > base - 2 ? 0.2 : 0) - clamp(lit, 0, 1) * 0.25;
    T.px(x, y, pxPick(CLOUD_RAMP, v, x, y));
  }
}
function drawCloud() {
  const c = cloudSpot(), f = cloudSprite();
  drawBaked({ c: f.c, x: Math.round(c.x / PX - f.w / 2) * PX, y: Math.round(c.bodyY / PX - f.h / 2) * PX });
}
/** Its soft shadow on the floor (drawn with the floor, under everyone). */
function drawCloudShadow() {
  const c = cloudSpot(), r = N.isoW / ISO_G * 0.8;
  ctx.fillStyle = "rgba(5,0,20,.16)"; ctx.beginPath(); ctx.ellipse(c.x, c.y, r * 1.2, r * 0.6, 0, 0, TAU); ctx.fill();
}
function cloudAt(x, y) {
  if (!hasDecor("cushion")) return false;
  const c = cloudSpot(), f = cloudSprite();
  return spriteHit(f.c, Math.round(c.x / PX - f.w / 2) * PX, Math.round(c.bodyY / PX - f.h / 2) * PX, x, y, 5);
}
function moveCloud(x, y) {
  const m = isoMargin(0.3);
  let [u, v] = isoFrom(x, y + cloudLift());
  save.cloud = [clamp(u, m, 1 - m), clamp(v, m, 1 - m)];
}

// ---------- weather: tap the cloud and it rains (or snows) for a while; puddles and snow on the floor melt away slowly ----------
const weather = { kind: null, last: null, until: 0, acc: 0, drops: [], ground: [] };
const COLD_THEMES = ["frost", "summit", "celestite"];
function startWeather() {
  // rain and snow take turns; the cold backdrops start with snow (and if someone here is dreaming of one of them, that's the one that comes)
  weather.kind = fancyHere("rain") ? "rain" : fancyHere("snow") ? "snow" : weather.last ? (weather.last === "rain" ? "snow" : "rain") : COLD_THEMES.includes(currentTheme()) ? "snow" : "rain";
  weather.last = weather.kind; weather.t0 = game.time; weather.until = game.time + WEATHER_MS;
  // everyone awake and free runs over to play under it
  for (const a of actors.values()) if (["idle", "walk", "dance"].includes(a.state) && !a.goal) playInWeather(a);
  fancyDone("weather:" + weather.kind);
  if (!sfx.ready()) return;
  const t = sfx.ac.currentTime, n = 9;
  // softly in, softly out, like the shower itself
  if (weather.kind === "rain") for (let k = 0; k < n; k++) sfx.grain(t + k * 0.28 + rand(0, 0.08), 0.35, rand(2400, 4200), 0.7, 0.045 * Math.sin(Math.PI * (k + 0.5) / n));
  else for (let k = 0; k < 5; k++) sfx.tone(t + k * 0.55 + rand(0, 0.2), pick(NOTES) * 2, 0.015, 1.2, "sine", null, true);
}
const WEATHER_MS = 2800;
const weatherOn = () => hasDecor("cushion") && game.time < weather.until + 600;
/** Off to a spot under the cloud, hurrying. */
function playInWeather(a) {
  // (except one with the habit: it runs off to the far side of the room, away from the cloud)
  const cr = save.creatures.find(c => c.id === a.id);
  if (cr && habitOf(cr) === "rain") { [a.tx, a.ty] = cornerPoint([cloudSpot().x, cloudSpot().y]); a.state = "walk"; a.goal = a.friend = null; a.rain = false; a.plan = "hide"; emote(a, "!", 0.9); return; }
  const c = cloudSpot(), an = rand(0, TAU), r = Math.sqrt(Math.random()) * N.isoW / ISO_G * 0.9;
  a.tx = c.x + Math.cos(an) * r; a.ty = c.y + Math.sin(an) * r / 2;
  a.state = "walk"; a.goal = a.friend = null; a.rain = true;
}
function updateWeather(dt) {
  const on = hasDecor("cushion"), c = on && cloudSpot(), tile = N.isoW / ISO_G, snow = weather.kind === "snow";
  if (on && game.time < weather.until) {
    // a light shower that swells and fades away: fewer drops at the start and the end
    const k = clamp((game.time - weather.t0) / WEATHER_MS, 0, 1);
    weather.acc += dt * (snow ? 16 : 34) * Math.sin(Math.PI * k) * 1.4;
    for (; weather.acc >= 1; weather.acc--) {
      // from under the cloud, falling onto the floor beneath it (a 2:1 patch, as everything on the floor is)
      const an = rand(0, TAU), r = Math.sqrt(Math.random()) * tile * 1.1, ox = Math.cos(an) * r, oy = Math.sin(an) * r / 2;
      weather.drops.push({ x: c.x + ox, y: c.bodyY + tile * 0.35 + rand(-2, 2), floor: c.y + oy, vy: snow ? rand(0.2, 0.32) * N.base : N.base * 2.4, ph: rand(0, TAU), snow });
    }
  }
  for (const d of weather.drops) {
    if (d.snow) { d.y += d.vy * dt; d.x += Math.sin(game.time * 0.0018 + d.ph) * dt * N.base * 0.14; }
    else { d.vy += N.base * 14 * dt; d.y += d.vy * dt; }
    if (d.y < d.floor) continue;
    d.done = true;
    weather.ground.push({ x: d.x, y: d.floor, life: 1, snow: d.snow, r: d.snow ? 0 : rand(1.5, 3.2) });
    if (!d.snow && Math.random() < 0.3) game.sparks.push({ x: d.x, y: d.floor - 1, vx: rand(-25, 25), vy: rand(-60, -30), t: 0, life: 0.25, s: 2, color: "#bfe3f5" });
    // a glowling caught in it says so
    if (Math.random() < 0.04) for (const a of actors.values()) if (!a.emote && a.state !== "sleep" && Math.hypot(a.x - d.x, (a.y - d.floor) * 2) < tile * 0.8) emote(a, d.snow ? "❄" : "💧", 1.4);
  }
  weather.drops = weather.drops.filter(d => !d.done);
  // what's on the floor fades: rain soaks away in about six seconds, snow melts in about nine
  for (const g of weather.ground) g.life -= dt / (g.snow ? 9 : 6);
  weather.ground = weather.ground.filter(g => g.life > 0).slice(-500);
}
/** Weather's own pixel: about a sixteenth of a tile, so rain and snow read at any pixel size. */
const weatherPx = () => Math.max(1, Math.round(N.isoW / ISO_G / PX / 16)) * PX;
/** Puddles and snow on the floor, fading out pixel by pixel (dithered, so they thin away instead of turning see-through). */
function drawWeatherGround() {
  const Q = weatherPx();
  const put = (x, y, col, life) => { const X = Math.round(x / Q), Y = Math.round(y / Q); if (PX_BAYER[(Y & 3) * 4 + (X & 3)] < life * 1.15) { ctx.fillStyle = col; ctx.fillRect(X * Q, Y * Q, Q, Q); } };
  for (const g of weather.ground) {
    if (g.snow) { put(g.x, g.y, "#f4f7ff", g.life); if (g.life > 0.5) put(g.x + Q, g.y, "#c9d8ef", g.life - 0.3); continue; }
    // a puddle shrinks as it soaks away
    const R = g.r * Math.sqrt(g.life);
    if (R < 0.6) continue;
    for (let y = -Math.ceil(R / 2); y <= Math.ceil(R / 2); y++) for (let x = -Math.ceil(R); x <= Math.ceil(R); x++) if ((x / R) ** 2 + (y / (R / 2)) ** 2 <= 1) put(g.x + x * Q, g.y + y * Q, y < 0 && x < 0 ? "#8fc7e6" : "#3f74a8", 1);
  }
}
/** The drops and flakes in the air. */
function drawWeatherAir() {
  const Q = weatherPx();
  for (const d of weather.drops) {
    const X = Math.round(d.x / Q) * Q, Y = Math.round(d.y / Q) * Q;
    if (d.snow) { ctx.fillStyle = "#ffffff"; ctx.fillRect(X, Y, Q, Q); if (d.ph > 4) { ctx.fillStyle = "#dfe8fa"; ctx.fillRect(X - Q, Y, Q, Q); ctx.fillRect(X + Q, Y, Q, Q); ctx.fillRect(X, Y - Q, Q, Q); ctx.fillRect(X, Y + Q, Q, Q); } }
    else { ctx.fillStyle = "#6fa8d6"; ctx.fillRect(X, Y - Q * 3, Q, Q * 2); ctx.fillStyle = "#d4f0ff"; ctx.fillRect(X, Y - Q, Q, Q * 2); }
  }
}

/** Is this floor point on the (isometric) bed? and how high its soft top is. */
function isoOnBed(x, y) {
  const p = isoLayout().placed.bed;
  if (!p) return false;
  const [u, v] = isoFrom(x, y), U = u * ISO_G, V = v * ISO_G;
  // (the hammock is only its sling, straight across the middle: walking under it at either side stays on the floor)
  if (bedStyle() === "hammock") return Math.abs(U - p.i - p.fw / 2 + V - p.j - p.fd / 2) < 0.45 && Math.abs(U - p.i - V + p.j) < 1.3;
  return U > p.i + 0.15 && U < p.i + p.fw - 0.05 && V > p.j + 0.05 && V < p.j + p.fd - 0.15;
}
/** How high whoever lies on the bed is: on the gazebo's deck, down in the hollow, in the sling, on the mattress. */
const BED_TOP = { gazebo: 0.14, nest: 0.28, basket: 0.24, hammock: 0.47, canopy: 0.3 };
const isoBedTop = () => N.isoW / ISO_G * (BED_TOP[bedStyle()] ?? 0.22);
/** The gazebo's four posts, as floor points in tiles: nobody walks through them. */
function gazeboPosts() {
  const p = bedStyle() === "gazebo" && isoLayout().placed.bed;
  if (!p) return [];
  const cu = p.i + p.fw / 2, cv = p.j + p.fd / 2;
  return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([su, sv]) => [cu + su * GAZEBO_A, cv + sv * GAZEBO_A]);
}

/**
 * Where everyone sleeps on each bed, by how many are in it: [a, b] from the middle of the bed, in tiles across the screen (a)
 * and toward the front (b). Side by side in a row, the one in the middle a little forward, so every face shows; never more
 * than the bed's soft top really holds (the extras curl up on the floor beside it, see bedPlaces). The gazebo keeps its
 * sleepers at the front of its deck, faces out from under the roof and either side of the front post; the hammock keeps
 * them in its sling.
 */
const BED_SLOTS = {
  nest: [[[0, 0.1]], [[-0.62, 0], [0.62, 0.1]], [[-1.15, -0.1], [0, 0.25], [1.15, -0.05]]],
  basket: [[[0, 0.1]], [[-0.62, 0], [0.62, 0.1]], [[-1.15, -0.1], [0, 0.25], [1.15, -0.05]]],
  canopy: [[[0, 0.15]], [[-0.62, 0.05], [0.62, 0.15]], [[-1.15, -0.05], [0, 0.3], [1.15, 0]]],
  gazebo: [[[-0.55, 1.05]], [[-0.62, 1.05], [0.62, 1.05]]],
  hammock: [[[0, 0]], [[-0.85, 0], [0.85, 0.05]], [[-1.15, -0.05], [0, 0.1], [1.15, -0.05]]],
};
/** How close to the walls a sleeper may lie on the bed (closer than anyone walks: the bed fills its corner). */
const bedMargin = () => isoMargin(0.2);
let bedPlacesCache = null;
/**
 * Everyone asleep in the room you're in and where each lies, id → [x, y]: up to the bed's places on its soft top
 * (see BED_SLOTS), and the rest curled up on the floor right in front of it, a cozy cluster on the rug or the stones,
 * spaced so nobody's face is hidden behind another. Counted in this room only (every room has its own bed).
 */
function bedPlaces(r = save.room) {
  const sleepers = sleepOrder(save.creatures.filter(c => c.sleeping && !c.out && roomOf(c) === r).map(c => c.id).sort((p, q) => p - q));
  const p = isoLayout().placed.bed, style = bedStyle();
  const key = [r, style, sleepers.join(","), p ? isoLayout().key : "", N.isoW, N.base, N.bedX, N.bedY, PX].join("|");
  if (bedPlacesCache && bedPlacesCache.key === key) return bedPlacesCache.at;
  const at = new Map();
  // (no bed out: nobody has a place on it, see bedSpot)
  if (!p) { bedPlacesCache = { key, at }; return at; }
  const G = ISO_G, cu = p.i + p.fw / 2, cv = p.j + p.fd / 2, size = N.base * depth(0), top = isoBedTop();
  const mB = bedMargin() * G, mF = isoMargin(0.42) * G, posts = gazeboPosts();
  // on the floor nobody lies over another's face: a little apart from each other, well clear of the faces on the bed
  const taken = [], inBed = [];
  const roomy = (x, y) => taken.every(([tx, ty]) => ((x - tx) / (size * 0.76)) ** 2 + ((y - ty) / (size * 1.0)) ** 2 >= 1)
    && inBed.every(([tx, ty]) => ((x - tx) / (size * 0.85)) ** 2 + ((y - ty) / (size * 1.15)) ** 2 >= 1);
  const offPosts = (U, V) => posts.every(([pu, pv]) => Math.hypot(U - pu, V - pv) > BODY_R * 0.8 + 0.1);
  // on the bed: the places for this many (or as many as it holds), each kept where keepInRoom lets a sleeper lie
  const slots = BED_SLOTS[style] || BED_SLOTS.nest, onBed = [];
  for (const [a0, b] of slots[Math.min(sleepers.length, slots.length) - 1] || []) {
    const a = p.flip ? -a0 : a0, U = clamp(cu + (a + b) / 2, mB, G - mB), V = clamp(cv + (b - a) / 2, mB, G - mB), [x, y] = isoAt(U / G, V / G);
    // (a place the room's walls squeeze onto another's is dropped: one more for the floor)
    if (!isoOnBed(x, y) || !offPosts(U, V) || onBed.some(([ox, oy]) => Math.hypot(x - ox, y - oy) < size * 0.5)) continue;
    inBed.push([x, y - top]); onBed.push([x, y]);
  }
  // beside it: free floor next to the bed (not behind it, where it would hide them, nor in a doorway), nearest first
  const floor = [], doors = doorTiles();
  for (let U = mF; U <= G - mF + 1e-6; U += 0.25) for (let V = mF; V <= G - mF + 1e-6; V += 0.25) {
    const du = Math.max(p.i - U, 0, U - p.i - p.fw), dv = Math.max(p.j - V, 0, V - p.j - p.fd), out = Math.hypot(du, dv);
    if (out < BODY_R + 0.12 || out > 2.6 || (U + V < cu + cv + 0.6 && Math.abs(U - cu - V + cv) < (p.fw + p.fd) / 2 + 0.7) || !offPosts(U, V)) continue;
    if (doors.has(`${Math.floor(U)},${Math.floor(V)}`)) continue;
    if (!cellFree(Math.floor(U * 2), Math.floor(V * 2)) || !walkClear(U, V, U, V)) continue;
    const [x, y] = isoAt(U / G, V / G);
    if (isoOnBed(x, y)) continue;
    floor.push({ x, y, d: out + Math.abs((U - cu) - (V - cv)) * 0.12 });
  }
  floor.sort((m, n) => m.d - n.d);
  sleepers.forEach((id, k) => {
    if (k < onBed.length) { at.set(id, onBed[k]); return; }
    const f = floor.find(f => roomy(f.x, f.y)) || floor[0];
    if (!f) { at.set(id, onBed[k % Math.max(1, onBed.length)] || isoAt(cu / G, cv / G)); return; }
    taken.push([f.x, f.y]); at.set(id, [f.x, f.y]);
  });
  bedPlacesCache = { key, at };
  return at;
}
/** The order they lie down in: by who came first, but best friends side by side. */
function sleepOrder(ids) {
  const out = [], left = new Set(ids);
  for (const id of ids) {
    if (!left.has(id)) continue;
    out.push(id); left.delete(id);
    const cr = save.creatures.find(c => c.id === id), bf = cr && bestFriend(cr);
    if (bf && left.has(bf.c.id)) { out.push(bf.c.id); left.delete(bf.c.id); }
  }
  return out;
}
/** This sleeper's own place: on the bed when there's room, curled up on the floor beside it when there isn't. */
function bedSpot(id) {
  const me = save.creatures.find(c => c.id === id), r = me ? roomOf(me) : save.room;
  return bedPlaces(r).get(id) || [N.bedX, N.bedY];
}

/** A piece's own pixel picture for the Decor list (the same drawing as in the room), or its emoji if it hangs on a wall. */
const decorThumbs = {};
function decorThumb(d) {
  const draw = ISO_ART[d.id];
  if (!draw) return `<span class="em">${d.emoji}</span>`;
  if (!decorThumbs[d.id]) {
    // (room above the footprint for the tall ones: the lamp, the lantern post, the bookcase)
    const f = ISO_PLACES[d.id] || { fw: 1, fd: 1 }, t = 16, pad = 6, w = (f.fw + f.fd) * t + pad * 2, h = (f.fw + f.fd) * t / 2 + t * 3.2 + pad;
    const c = isoArt(w, h, T => draw(t, T, f.fd * t + pad, t * 3.2 + pad / 2, {}));
    // trimmed to the drawing, so small pieces fill their square too
    const dd = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (dd[(y * c.width + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const side = Math.max(x1 - x0, y1 - y0) + 3, o = document.createElement("canvas"); o.width = o.height = side;
    o.getContext("2d").drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, Math.floor((side - (x1 - x0 + 1)) / 2), Math.floor((side - (y1 - y0 + 1)) / 2), x1 - x0 + 1, y1 - y0 + 1);
    decorThumbs[d.id] = o.toDataURL();
  }
  return `<img class="em px-thumb" src="${decorThumbs[d.id]}" alt="">`;
}

// the rugs' yarns, ramps that shift hue the way the light does: warm in the light, cooler and deeper in the shade
const RUG_ROSE = ["#f0c4cc", "#dc8aa6", "#b85a84", "#8c3d68", "#5e2952", "#341634"].map(pxHex);
const RUG_NIGHT = ["#3a5a8e", "#26406e", "#1b2e56", "#142242", "#0e1832", "#060b1e"].map(pxHex);
/** The rug, in pixel rings on the floor (a 2:1 ellipse, as circles on the floor are). */
function isoRug(starry) {
  const [rx, ry] = rugSize(), [cx, cy] = roomSpot("rug"), art = Math.ceil(rx / PX) * 2 + 6;
  return cachedSprite(isoPieces, "rug", `${rx}|${Math.round(cx)},${Math.round(cy)}|${PX}|${starry}|${starry ? Math.floor(game.time / 400) : ""}`, () => {
    const R = rx / PX, c = isoArt(art, art / 2 + 4, T => {
      const ox = art / 2, oy = art / 4 + 2;
      // a rug of coiled cord: rings stitched side by side, each lit on its side toward the light, the whole rug brighter toward
      // the top left, a dark binding round the edge. The starry one is woven in night blue
      // edged in gold, with stars that twinkle
      const ramp = starry ? RUG_NIGHT : RUG_ROSE, rings = starry ? [2, 2, 1, 2, 3, 2, 2, 1, 2, 2] : [2, 1, 2, 3, 1, 2, 2, 1, 2, 3];
      T.disc(ox, oy, R, (x, y) => {
        const nx = (x + 0.5 - ox) / R, ny = (y + 0.5 - oy) / (R / 2), d = Math.hypot(nx, ny), rp = d * R / 4, ring = Math.floor(rp), f = rp - ring;
        if (d > 1 - 1.6 / R) return ramp[ramp.length - 1];
        // each ring a round cord: its side facing the light (top left) lit, its far side shaded, a dark groove between rings,
        // and the stitches that hold it, a paler tick every few pixels round it
        const dn = d || 1, side = (f - 0.5) * (-(nx + ny) / dn), n = Math.max(6, Math.round(TAU * d * R * 0.5 / 5)), an = (Math.atan2(ny, nx) / TAU + 1) % 1;
        let k = rings[ring % rings.length];
        if (f < 0.18) k += 2; else if (side > 0.12) k -= 1; else if (side < -0.12) k += 1; else if ((an * n + ring * 0.5) % 1 < 0.22) k -= 1;
        k += -nx * 0.35 - ny * 0.45 > 0.35 ? -1 : nx * 0.35 + ny * 0.45 > 0.35 ? 1 : 0;
        return ramp[clamp(k, 0, ramp.length - 2)];
      });
      // (the starry one's edge is a cord of gold)
      if (starry) for (let k = 0; k < 360; k += 4) { const an = k * Math.PI / 180; T.px(ox + Math.cos(an) * (R - 1), oy + Math.sin(an) * (R - 1) / 2, Math.sin(an) + Math.cos(an) < -0.6 ? IC.y0 : IC.y1); }
      if (starry) for (let i = 0; i < 12; i++) { const an = i * 2.4, d = 0.25 + (i % 5) * 0.13, tw = Math.sin(game.time * 0.0015 + i); if (tw < -0.6) continue; const sx = ox + Math.cos(an) * R * d, sy = oy + Math.sin(an) * R * d / 2; T.px(sx, sy, tw > 0.5 ? IC.white : IC.y0); if (tw > 0.5) { T.px(sx - 1, sy, IC.y1); T.px(sx + 1, sy, IC.y1); } }
    }, { outline: false });
    return { c, x: Math.round(cx / PX - art / 2) * PX, y: Math.round(cy / PX - art / 4 - 2) * PX };
  });
}


/** A shade from a ramp, banded the way hand-placed pixels are: flat clusters of one colour, dithered only in a thin seam
 *  where two shades meet (k is how wide the seam is; pxPick dithers the whole way between them). */
/** Moss and the moss garden's stone, ramps that shift hue the way the light does: cool and blue-green in shadow, warm and yellow where lit. */
const MOSS = ["#0b1418", "#132820", "#1d3c22", "#2f5726", "#4a772b", "#72a03a", "#a6c65a"], MOSS_HEX = MOSS.map(pxHex);
const GARDEN_STONE = ["#0e0d16", "#1f1e28", "#33323a", "#4b4946", "#6a6658", "#8f8870"];
const isoTone = (ramp, v, x, y, k = 0.3) => { const n = ramp.length - 1; return ramp[clamp(Math.floor(clamp(v, 0, 1) * n + 0.5 + (PX_BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * k), 0, n)]; };
const mixHex = (a, b, k) => a.map((c, i) => Math.round(c + (b[i] - c) * k));
/** A ramp shifted in hue the way a painter shifts one: the shadows cooler (toward blue-violet) and a little richer, the lights
 *  warmer (toward warm) and a little greyer, so a material reads in steps of its own colour rather than one colour darkened. */
function hueRamp(ramp, warm = [255, 222, 168], turn = 0.28) {
  const n = ramp.length - 1;
  return ramp.map((c, i) => {
    const t = i / n, [r, g, b] = c.map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dd = mx - mn;
    let hu = 0, sa = 0;
    if (dd) { sa = dd / (1 - Math.abs(2 * l - 1)); hu = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; hu *= 60; }
    // turn the hue part of the way to 245 (blue-violet), most in the darkest shade, by the short way round
    const dh = ((245 - hu + 540) % 360) - 180;
    hu = (hu + dh * turn * (1 - t) + 360) % 360; sa = Math.min(1, sa * (1.18 - 0.36 * t));
    const C = (1 - Math.abs(2 * l - 1)) * sa, X = C * (1 - Math.abs((hu / 60) % 2 - 1)), m = l - C / 2;
    const [r1, g1, b1] = hu < 60 ? [C, X, 0] : hu < 120 ? [X, C, 0] : hu < 180 ? [0, C, X] : hu < 240 ? [0, X, C] : hu < 300 ? [X, 0, C] : [C, 0, X];
    return mixHex([r1 + m, g1 + m, b1 + m].map(v => Math.round(v * 255)), warm, 0.2 * t * t);
  });
}

/** An iron wall lantern on its bracket, the plate at the left edge against the wall, the arm reaching into the room. */
const LANTERN = [
  "h.........",
  "mhh.......",
  "mkkhh.....",
  "m.kkkhh...",
  "m.h..kkhh.",
  "m.k...k.kk",
  "m..k.k...k",
  "m...k....m",
  "mkk.....hmk",
  "m......hmmmk",
  "......hmmmmmk",
  "......mBAAABk",
  "......mAAWAAk",
  "......mAWWWAk",
  "......mAWWWAk",
  "......mAAWAAk",
  "......mBAAABk",
  "......hmmmmmk",
  ".......kmmmk",
  "........kmk",
  ".........k",
];
/** The abbey's Gothic window, laid out in its wall's own plane (a along the wall from its middle, z up from the floor), for a wall
 *  this high in a room this wide: the pointed arch and its splay (openAt, t of the way in), the glass with its lancets, trefoils
 *  and lozenges (glassAt: 1 a pane, 2 a lozenge, -1 stone tracery), and the night behind it (skyV). */
function gothicWindow(wall, hw, S, seed) {
  // a pointed arch of half-width w: two arcs, each centred as far beyond the middle as the arch is wide
  const rise = w => w * Math.sqrt(3), arch = (a, z, w, z0, z1) => z >= z0 && Math.abs(a) < w && (z < z1 || Math.hypot(Math.abs(a) + w, z - z1) < 2 * w);
  const zb = Math.round(wall * (wall < 120 ? 0.2 : 0.27)), seatUp = Math.max(2, Math.round(Math.min(4 * S, wall * 0.03))), zA = Math.min(Math.round(wall * 0.88), Math.round(wall) - 8);
  // the wall's depth, the splay and a mullion; on a low wall the window is narrower, with fewer lights
  const m = 2, wMax = Math.min(Math.round(hw * 0.17), Math.floor((zA - zb) * 0.62 / Math.sqrt(3)));
  const D = Math.max(2, Math.round(Math.min(3 * S, wMax * 0.1))), sp = Math.max(2, Math.round(Math.min(5 * S, wMax * 0.16)));
  const fit = n => Math.floor((2 * (wMax - sp) - 2 - (n - 1) * m) / n), nL = [4, 3].find(n => fit(n) >= 8) || 2;
  const L = Math.max(4, fit(nL)), wi = (nL * L + (nL - 1) * m + 2) / 2, wo = wi + sp, zs = zA - Math.round(rise(wo)), zg = zb + seatUp;
  // the opening t of the way in (0 at the room, 1 at the glass): narrower, its sill higher, and seen shifted up and left
  const openAt = (a, z, t) => arch(a + 0.5 + D * t, z - D * t, wo - sp * t, zb + seatUp * t, zs);
  const lav = pxHex("#d2bfff"), vio = ["#160c26", "#22143a", "#2e1d4f", "#3d2866", "#523a85", "#6b4fa8", "#8a6cc9", "#ad91e6", "#d2bfff", "#efe6ff"].map(pxHex);
  // the glass, in its own plane: the stone frame, mullions, the lights' trefoil heads and the lozenges above them
  const TREFOIL = [0, 1, 2, 2, 1, 3, 4, 4, 3], hL = L / 2, zh = zs + 2 - Math.round(TREFOIL.length * hL / 5.5), rowH = Math.round(Math.max(wi * 0.46, L * 1.1)), rw = (L + m) / 2 - 2, rh = rowH / 2 - 0.5;
  const lz = [];
  for (let r = 0; r < nL - 1; r++) for (let k = 0; k < nL - 1 - r; k++) lz.push([(k - (nL - 2 - r) / 2) * (L + m), zh + TREFOIL.length * hL / 5.5 + rowH * 0.45 + r * rowH]);
  const moonA = -wi + 1 + (nL >> 1) * (L + m) + hL, moonZ = zh - Math.round(rowH * 0.9), moonR = Math.max(2.5, Math.min(L * 0.36, wi * 0.16));
  const glassAt = (ga, gz) => {
    const a = ga + 0.5;
    if (!arch(a, gz, wi, zg, zs)) return null;
    if (!arch(a, gz, wi - 1, zg + 1, zs)) return -1;
    const rel = ga + wi - 1, k = Math.floor(rel / (L + m)), off = rel - k * (L + m);
    if (gz < zh) return off >= L ? -1 : 1;
    // a light's head: a trefoil, a pointed lobe over two round ones, with stone cusps pointing in between them
    const row = TREFOIL.length - 1 - Math.floor((gz - zh) * 5.5 / hL);
    if (off < L && row >= 0 && Math.abs(off - (L - 1) / 2) <= TREFOIL[row] * (hL - 0.5) / 5 + 0.01) return 1;
    for (const [x0, z0] of lz) { const da = Math.abs(a - x0) / rw, dz = Math.abs(gz - z0) / rh; if (da ** 1.4 + dz ** 1.4 < 1) return 2; }
    return -1;
  };
  const skyV = (ga, gz, x, y, kindG) => {
    const md = Math.hypot(ga + 0.5 - moonA, gz - moonZ);
    if (md < moonR) return Math.hypot(ga + 0.5 - moonA + 1.2, gz - moonZ + 1) > moonR ? 0.82 : 1;
    let v = 0.3 + 0.12 * (gz - zg) / (zA - zg) + (md < moonR + 2.5 ? 0.34 : md < moonR + 7 ? 0.18 : md < moonR + 13 ? 0.08 : 0) + (kindG === 2 ? 0.42 : 0);
    const st = pxHash(x * 5 + 1, y * 3 + seed);
    if (st > 0.99) v = 0.95; else if (st > 0.975) v += 0.25;
    return v;
  };
  const isGlass = (ga, gz) => (glassAt(ga, gz) || 0) > 0;
  return { rise, arch, zb, seatUp, zA, D, sp, wi, wo, zs, zg, openAt, lav, vio, glassAt, skyV, isGlass };
}

/** The materials a room is built of, for one backdrop: its palettes, and how each surface is laid (stone courses, rock facets,
 *  the timber frame, the floor) as functions of a spot on a wall or the floor. hw is the room's width in art pixels, wall its
 *  height, S the scale its stones and boards are cut to. Both views of the room paint from these. */
function roomMaterials(id, hw, wall, S) {
  // (at home every backdrop is a cave: lookOf; the moss garden's glowcaps grow in a grotto of their own, HOME_ART)
  const kind = lookOf(id), t = THEME[id] || THEME.amethyst;
  // at home the cave's mood (HOME_ART): the crystal caves, the glowcap grotto, the lantern gallery, the starfall crypt, the moonwell
  // and the aurora's ice cave
  const mood = kind === "cave" && atHome() ? (HOME_ART[id] && HOME_ART[id].mood) || "crystal" : null;
  const art = kind === "cave" ? caveArt(id, atHome()) : t.art !== undefined && !NIGHT[id] ? CHAPTER_ART[t.art] : null, night = NIGHT[id];
  const wallR = (art ? art.wall : night.ground).map(pxHex), crys = art ? art.crystal.map(pxHex) : null, ground = night ? night.ground.map(pxHex) : wallR;
  const seed = (art ? art.seed : night.seed) * 7, indoor = kind === "cave" || kind === "hall" || kind === "ruin" || kind === "timber";
  const hexes = a => a.map(pxHex);
  // the ruins are old grey stone whatever the night outside; moss and grass grow in every gap
  const ruinStone = hexes(["#22143a", "#3a3440", "#5d5666", "#8a8494", "#b9b3c0"]), moss = hexes(["#1e5233", "#2f7d4a", "#57ad6a"]);
  // the timber hall: oak for the frame and the floor, limewashed daub between the beams on a footing of rubble stone
  const oak = hexes(["#1f130a", "#3b2414", "#5e3a1c", "#7a5230", "#946027", "#b07c45"]), daub = hexes(["#4a4238", "#6e6555", "#958a74", "#b8ad94", "#d4caae", "#e8e0c8"]);
  // the abbey's dressed stone: cool grey with a little violet in the shadows
  const ashlar = hexes(["#0f0a19", "#1d1629", "#2e2639", "#41384d", "#574d63", "#70667b", "#8c8396", "#aaa2b1"]);
  // cave rock: the chapter's own ramp, with a highlight leaning toward its crystals for the lit edges
  // (at home, #307: shifted in hue, cooler in the cracks and warmer on the lit faces, one more step of light on top)
  const rock = !art ? wallR : mood ? hueRamp([...wallR, mixHex(wallR[4], crys[2], 0.35), mixHex(mixHex(wallR[4], crys[3], 0.3), [255, 236, 200], 0.3)]) : [...wallR, mixHex(wallR[4], crys[2], 0.35)];
  const wallC = kind === "timber" ? ruinStone : kind === "ruin" ? ruinStone : kind === "hall" || mood === "crypt" ? ashlar : rock;
  // how high a ruined wall still stands along its length (0..1): broken off in steps, low in the middle of each side
  const ruinH = tt => kind !== "ruin" ? 1 : clamp(0.55 + 0.45 * Math.cos(tt * 2.6) - 0.35 * (Math.floor(pxNoise(tt * 7 + seed, 3) * 4) / 4), 0.18, 1);
  const wood = [oak[1], oak[2], oak[4]], stone = [ruinStone[0], ruinStone[1], ruinStone[2], ruinStone[3]];
  // which room this is: the camp and the garden share a backdrop but not their paths
  const roomKindNow = save.rooms && save.rooms[save.room] ? save.rooms[save.room].kind : "";
  // the moss garden: moss over everything, and soil (see paintMossGarden for what grows in it)
  const garden = roomKindNow === "garden" && kind === "cave", mossC = hexes(MOSS);
  // the moss is the grotto's, and the moss garden's in a crystal cave
  const mossy = mood === "grotto" || (garden && mood === "crystal");
  // what the floor is laid with: boards in the gallery as in the timber hall, flagstones in the crypt as in the abbey
  const floorK = mood === "gallery" ? "timber" : mood === "crypt" ? "hall" : kind;

  // ---- materials on the walls. al runs along a wall from the back corner, z up from the floor; sl is +1 where a larger al
  //      is further left on screen (the left wall) and -1 on the right wall, so "the lit edge" is always the one to the top left.
  /** Courses of dressed stone: rows of different heights, blocks of different lengths, each a hair proud of its mortar
   *  (a lit top and left edge, a shaded bottom and right), the odd chipped corner and crack. */
  const courseZ = (() => { const out = []; let zz = 0, r = 0; while (zz < wall + 40) { const hgt = Math.max(3, Math.round([14, 10, 13, 11, 9, 12, 10][r % 7] * S * (kind === "ruin" ? 1.15 : 1))); out.push([zz, hgt]); zz += hgt; r++; } return out; })();
  const courseOf = z => { let lo = 0, hi = courseZ.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (courseZ[m][0] <= z) lo = m; else hi = m - 1; } return lo; };
  const ashlarPx = (al, z, sl, x, y, base) => {
    const r = courseOf(z), [z0, hgt] = courseZ[r], fz = z - z0;
    const L = Math.round((22 + 16 * pxHash(r, 7)) * S * (kind === "ruin" ? 1.2 : 1)), a = al + pxHash(r, 3 + seed) * L, bi = Math.floor(a / L), fa = a - bi * L;
    const hb = pxHash(bi * 7 + r, seed);
    // now and then a block is two: a short closer stone set beside a longer one, its own shade
    const cl = hb > 0.8 ? Math.round(L * (0.3 + 0.2 * pxHash(bi, r + 3))) : 0, part = cl && fa >= cl ? 1 : 0;
    if (cl && Math.abs(fa - cl) < 0.5) return 0.05 + 0.04 * pxHash(x, y);
    let v = base + 0.18 * (pxHash(bi * 7 + r + part * 13, seed) - 0.5) + 0.07 * (pxFbm(x * 0.21, y * 0.21) - 0.5);
    const litEnd = sl > 0 ? fa >= L - 1 : fa < 2, darkEnd = sl > 0 ? fa < 2 : fa >= L - 1;
    // a chipped corner: the mortar shows where the arris broke off
    const chip = pxHash(bi + 3, r * 5 + seed) > 0.72 && ((fz < 2.5 && fa < 2.5) || (fz > hgt - 2.5 && fa > L - 2.5)) && (fz + fa) % 3 < 2;
    if (fz < 1 || fa < 1 || chip) return 0.05 + 0.04 * pxHash(x, y);
    if (fz >= hgt - 1 || litEnd) v += 0.16; else if (fz < 2 || darkEnd) v -= 0.13;
    // grit and a few pits, and now and then a hairline crack across a block
    const sp = pxHash(x * 3, y * 5 + seed); if (sp > 0.975) v -= 0.12; else if (sp < 0.02) v += 0.1;
    if (hb > 0.86 && Math.abs(pxNoise(al * 0.25 + bi, z * 0.35 + r) - 0.5) < 0.03) v -= 0.22;
    return v;
  };
  /** Rock in chunky facets, the way pixel artists draw boulders: the nearest of a scatter of points owns each pixel, every
   *  facet bulges toward the light (lit top left, dark bottom right), dark crevices between them. Facets are wider than
   *  tall and the scatter is jittered row by row, so on a wall they read as layered strata. */
  const facet = (a, b, cw, ch, sd) => {
    const gi = Math.floor(a / cw), gj = Math.floor(b / ch), k = cw / ch;
    let d1 = 1e9, d2 = 1e9, id = 0, ox = 0, oy = 0;
    for (let j = gj - 1; j <= gj + 1; j++) for (let i = gi - 1; i <= gi + 1; i++) {
      const sx = (i + 0.1 + 0.8 * pxHash(i, j + sd)) * cw, sy = (j + 0.1 + 0.8 * pxHash(j + 3, i + sd)) * ch, dd = Math.hypot(a - sx, (b - sy) * k);
      if (dd < d1) { d2 = d1; d1 = dd; id = i * 131 + j; ox = (a - sx) / cw; oy = (b - sy) / ch; } else if (dd < d2) d2 = dd;
    }
    return { edge: d2 - d1, id, ox, oy, sh: pxHash(id, sd) };
  };
  const rockPx = (al, z, sl, x, y) => {
    const f = facet(al + 6 * pxNoise(z * 0.08, seed), z, 30 * S, 13 * S, seed), fine = facet(al, z, 9 * S, 5 * S, seed + 9);
    // ox runs along the wall (screen-left when ox * sl > 0), oy up it: lit where the facet turns up and left; each big facet
    // leans its own way (sh), the small ones only ripple its face
    const tilt = (f.sh - 0.5) * 0.5;
    let v = (sl > 0 ? 0.5 : 0.32) + 0.16 * (f.sh - 0.5) + 0.3 * (f.ox * sl * (0.5 + tilt) + f.oy * 0.9) - 0.22 * (z / wall);
    v += 0.1 * (fine.ox * sl * 0.4 + fine.oy * 0.8) + 0.05 * (pxFbm(x * 0.3, y * 0.3) - 0.5);
    // the deep cracks between the big facets, a lit lip above each; the small ones only where they break the surface
    if (f.edge < 1.3 && f.sh > 0.2) v = 0.04; else if (f.edge < 2.6 && f.sh > 0.2) v += f.oy > 0 ? 0.16 : -0.12;
    else if (fine.edge < 0.9 && fine.sh > 0.62) v -= 0.12;
    const sp = pxHash(x * 3, y * 5 + seed); if (sp > 0.985) v += 0.15;
    return v;
  };
  // ---- the caves at home (#307): rock you can read stone by stone, each stone shaded on its own, and what grows on it
  /** What grows on the rock at home, by mood: moss in the grotto (and the moss garden) and round the moonwell, rime on the ice
   *  cave's stones, a pale lichen in the crystal caves and the crypt, hardly anything in the gallery's dry rock. moss is how much
   *  covers the tops of the stones (and how high up the wall it climbs), lichen how much of their faces it spots. */
  const GROWTH = { crystal: { moss: 0, lichen: 0.35, gaps: 0.1 }, grotto: { moss: 0.75, lichen: 0.3 }, gallery: { moss: 0, lichen: 0 }, crypt: { moss: 0.1, lichen: 0.7 }, moonwell: { moss: 0.45, lichen: 0.6 }, aurora: { moss: 0.12, lichen: 0, rime: true } };
  const grow = mood && GROWTH[mood];
  const lichenC = !mood ? null : mood === "crypt" ? hexes(["#4f4c34", "#7d7748", "#a69e62"]) : mood === "moonwell" ? hexes(["#4a4660", "#7a7392", "#aaa2c0"]) : [mixHex(wallR[2], crys[1], 0.35), mixHex(wallR[3], crys[2], 0.35), mixHex(wallR[4], crys[2], 0.42)];
  const rimeC = hexes(["#3a6688", "#8fc4dc", "#d8f2fa", "#ffffff"]);
  /** Moss on a stone's top, or rime: it sits on the upper rim of the stone (up is how far up the stone, edge how near its rim) in
   *  a band whose depth wanders, hanging down a little at its lower edge; thickest low on the wall and in damp patches. */
  const growthOn = (f, al, z, sl, x, y, k) => {
    if (!grow || f.edge < 1) return null;
    const damp = pxFbm(al * 0.035 + sl * 11 + seed, z * 0.05) - 0.6 + grow.moss * 0.42 + (grow.rime ? 0.12 * z / wall : 0.16 * (1 - z / wall) ** 2);
    if (grow.moss && damp > 0.06 && f.oy > 0) {
      const depth = (2.2 + 4 * damp + 2 * pxHash(Math.round(al), f.id & 255)) * Math.max(1, S);
      if (f.edge < depth * 1.4 && f.oy > 0.12) {
        if (grow.rime) return { col: rimeC[f.edge < 1.8 ? (sl > 0 ? 3 : 2) : f.edge < 3 ? 2 : 1] };
        // a cushion: lit along its top, its body a step darker (cooler on the shaded wall), its lower rim darker still
        return { col: MOSS_HEX[f.edge < 1.8 ? (sl > 0 ? 5 : 4) : f.edge < depth * 0.9 ? (sl > 0 ? 4 : 3) : 2] };
      }
    }
    // lichen in round spots on a stone's face, a pale ring round a darker heart
    // (in patches here and there: a broad mask, and the spots inside it)
    if (k && grow.lichen && f.edge > 2.4 && f.oy > -0.25 && pxFbm(al * 0.03 + seed + 5, z * 0.04 + sl * 3) > 0.66 - 0.12 * grow.lichen) {
      const ln = pxFbm(x * 0.25 + seed, y * 0.35 + 5);
      if (ln > 0.6) return { col: lichenC[ln > 0.66 ? (sl > 0 ? 2 : 1) : 0] };
    }
    return null;
  };
  /** The rock face at home: layered stones, wider than they're tall, each one flat in one of three shades (its own, not noise),
   *  lit along its top and left edges and shaded along its bottom and right in two steps, a dark crevice round it; the odd pit
   *  and crack; darker toward the roof. Returns a shade, or a colour of its own where something grows on it. */
  const rockTex = (al, z, sl, x, y) => {
    const f = facet(al + 5 * pxNoise(z * 0.07, seed), z, 23 * S, 10 * S, seed);
    if (f.edge < 1.4) return { v: 0.03 };
    // a chipped arris here and there: a notch of the crevice bitten out of the stone's rim
    if (f.edge < 2.4 && pxHash(f.id & 1023, Math.floor((Math.atan2(f.oy, f.ox) + 4) * 2.2) + 7) > 0.9) return { v: 0.03 };
    const g = growthOn(f, al, z, sl, x, y, true);
    if (g) return g;
    const up = f.oy, lt = f.ox * sl;
    // (flat across the stone: its shade darkens toward the roof by where the stone's middle is, not pixel by pixel)
    let v = (f.sh < 0.3 ? 0.3 : f.sh < 0.72 ? 0.47 : 0.64) + (sl > 0 ? 0.07 : -0.07) - 0.24 * Math.round((z - f.oy * 10 * S) / wall * 4) / 4;
    if (f.edge < 2.6) v += up > 0.05 || lt > 0.3 ? 0.2 : -0.16;
    else if (f.edge < 3.6 && up < -0.15) v -= 0.08;
    else if (f.edge < 3.6 && (up > 0.2 || lt > 0.4)) v += 0.07;
    const ph = pxHash(Math.round(x) * 3, Math.round(y) * 5 + seed);
    if (ph > 0.988) v -= 0.18; else if (ph > 0.976 && pxHash(Math.round(x) * 3, Math.round(y) * 5 + seed - 5) > 0.988) v += 0.12;
    if (f.sh > 0.82 && Math.abs(pxNoise(al * 0.18 + f.id, z * 0.32) - 0.5) < 0.022) v -= 0.22;
    return { v };
  };
  /** The cave floor at home: worn stones set close in a bed of grit, each its own shade, its edge toward the back and the left
   *  (toward the light) bevelled bright and its edge toward you in shadow, dark gaps between; the odd crack. */
  const floorTex = (u, v, x, y, ao, lk) => {
    const f = facet(u * hw, v * hw, 15 * S, 15 * S, seed + 5);
    if (f.edge < 1.5) return { v: 0.06 - 0.04 * ao, gap: true };
    // worn and knocked: a notch chipped out of a stone's edge here and there, the grit showing in it
    if (f.edge < 2.5 && pxHash(f.id & 1023, Math.floor((Math.atan2(f.oy, f.ox) + 4) * 2.2)) > 0.88) return { v: 0.08 - 0.04 * ao, gap: true };
    const toward = f.ox * 0.85 + f.oy * 0.35;   // < 0: the side toward the back left, which faces the light
    let val = (f.sh < 0.3 ? 0.28 : f.sh < 0.7 ? 0.44 : 0.6) + 0.24 * lk;
    if (f.edge < 2.7) val += toward < -0.08 ? 0.18 : toward > 0.08 ? -0.17 : 0;
    else if (f.edge < 3.6 && toward > 0.25) val -= 0.08;
    const ph = pxHash(Math.round(x) * 7, Math.round(y) * 3 + seed);
    if (ph > 0.985) val -= 0.16; else if (ph < 0.01) val += 0.12;
    if (f.sh > 0.86 && Math.abs(pxNoise(u * 30 + f.id, v * 30) - 0.5) < 0.02) val -= 0.22;
    return { v: val - 0.45 * ao, f };
  };

  // the timber frame: posts at each bay, studs below the middle rail, a brace in each panel above it, a sill on the footing,
  // a wall plate along the top with the joists' ends resting on it
  const bay = hw / 3, pw = Math.max(2, Math.round(5 * S)), bw = Math.max(3, Math.round(7 * S)), foot = Math.round(12 * S), sw = Math.max(1, Math.round(1.8 * S));
  const zr = Math.round(wall * 0.46), zp = wall - bw - 1;
  /** Which timber is at this spot, if any: c runs across it from its lit edge (0) to its shaded one (1), g along its grain. */
  const timberAt = (al, z, sl) => {
    if (z >= foot && z < foot + bw) return { c: (foot + bw - 1 - z) / (bw - 1), g: al, n: 1, hz: 1 };
    if (z >= zr && z < zr + bw) return { c: (zr + bw - 1 - z) / (bw - 1), g: al, n: 2, hz: 1 };
    if (z >= zp) return { c: (wall - 1 - z) / (bw + 1), g: al, n: 3, hz: 1 };
    const k = Math.round(al / bay), pc = k * bay;
    if (Math.abs(al - pc) < pw) return { c: sl * (pc + sl * pw - al) / (2 * pw), g: z, n: 10 + k };
    const k0 = Math.floor(al / bay), a0 = k0 * bay;
    if (z > foot + bw && z < zr) for (const fr of [1 / 3, 2 / 3]) { const sc = a0 + bay * fr; if (Math.abs(al - sc) < sw) return { c: sl * (sc + sl * sw - al) / (2 * sw), g: z, n: 20 + k0 * 2 + fr * 3 }; }
    if (z >= zr + bw && z < zp) {
      // a straight brace from the foot of one post up to the plate, leaning the other way in the next bay
      const dir = k0 % 2 ? -1 : 1, s0 = dir > 0 ? a0 + pw : a0 + bay - pw, z0 = zr + bw, s1 = s0 + dir * bay * 0.62, z1 = zp;
      const dx = s1 - s0, dz = z1 - z0, len = Math.hypot(dx, dz), tt = ((al - s0) * dx + (z - z0) * dz) / (len * len);
      const dist = ((al - s0) * dz - (z - z0) * dx) / len, half = bw * 0.62;
      if (tt > 0 && tt < 1 && Math.abs(dist) < half) return { c: (sl * dir * dist + half) / (2 * half), g: tt * len, n: 30 + k0 };
    }
    return null;
  };
  const timberPx = (al, z, sl, x, y) => {
    const base = sl > 0 ? 0.44 : 0.3;
    if (z < foot) {
      // the footing: rubble stones in rough courses, each lit on its top and left, mortar between
      const rh = Math.max(3, Math.round(4.5 * S)), row = Math.floor(z / rh), fz = z - row * rh, L = Math.round((7 + 5 * pxHash(row, 2)) * S), a = al + pxHash(row, 9) * 13, si = Math.floor(a / L), fa = a - si * L;
      const round = (fz < 1.5 && (fa < 2 || fa > L - 1.5)) || (fz > rh - 1.5 && (fa < 1.5 || fa > L - 1));
      if (fz < 1 || fa < 1 || round) return { ramp: ruinStone, v: 0.08 };
      let v = base - 0.08 + 0.22 * (pxHash(si, row + 4) - 0.5) + 0.08 * (pxFbm(x * 0.3, y * 0.3) - 0.5);
      if (fz >= rh - 1 || (sl > 0 ? fa > L - 2 : fa < 2)) v += 0.18; else if (fz < 2) v -= 0.14;
      return { ramp: ruinStone, v };
    }
    const m = timberAt(al, z, sl);
    if (m) {
      let v = base - 0.04;
      if (m.c < 0.16) v += 0.24; else if (m.c > 0.84) v -= 0.24;
      const gr = m.hz ? pxNoise(m.g * 0.07 + m.n * 7, z * 0.75) : pxNoise(al * 0.75 + m.n * 3, m.g * 0.06 + m.n * 7);
      if (Math.abs(gr - 0.5) < 0.05) v -= 0.12; else if (gr > 0.82) v += 0.07;
      // a long check split along the grain, here and there
      if (pxHash(m.n, Math.floor(m.g / (14 * S))) > 0.9 && Math.abs(m.c - 0.45) < 0.09) v -= 0.3;
      // the wall plate carries the joists: their square ends show along it, end grain and all
      if (m.n === 3) { const je = 22 * S, jx = ((al % je) + je) % je, jw = 5 * S; if (jx < jw && z < wall - 1) { const rr = Math.hypot(jx - jw / 2, (z - (zp + bw / 2 + 0.5)) * 1.1); v = base + 0.12 + (Math.round(rr * 1.4) % 2 ? -0.08 : 0.06) - (jx > jw - 1 ? 0.25 : 0); } }
      // oak pegs where the posts meet the rails
      if (m.n >= 10 && m.n < 20 && Math.abs(al - Math.round(al / bay) * bay) < 0.6 && (Math.abs(z - (zr + bw + 3 * S)) < 0.6 || Math.abs(z - (zr - 3 * S)) < 0.6 || Math.abs(z - (foot + bw + 3 * S)) < 0.6)) v = 0.05;
      return { ramp: oak, v };
    }
    // the daub: limewash over clay, mottled and cracked, a little sooty high up, with the beams' shadows lying on it
    let v = (sl > 0 ? 0.66 : 0.46) + 0.14 * (pxFbm(x * 0.05 + seed, y * 0.08) - 0.5) + 0.06 * (pxFbm(x * 0.3, y * 0.3) - 0.5);
    if (timberAt(al, z + 1, sl) || timberAt(al - 1, z, sl) || timberAt(al + 1, z, sl) || timberAt(al, z - 1, sl)) v -= 0.22;   // the crack where plaster meets oak
    else if (timberAt(al, z + 2, sl) || timberAt(al, z + 3, sl)) v -= 0.14;
    else if (timberAt(al + 2 * sl, z, sl) || timberAt(al + 3 * sl, z, sl)) v -= 0.12;
    else if (timberAt(al, z - 2, sl)) v += 0.06;
    v -= 0.5 * clamp((z / wall - 0.62) * 2.2, 0, 1) * pxFbm(x * 0.04 + 7, y * 0.06);
    if (Math.abs(pxNoise(al * 0.09 + seed, z * 0.09) - 0.5) < 0.012 && pxHash(x >> 2, y >> 2) > 0.3) v -= 0.22;
    // where the plaster has fallen away the woven wattle shows: hazel rods round upright stakes
    const fall = pxFbm(al * 0.022 + sl * 13 + seed, z * 0.03);
    if (z > foot + bw && z < zr - 1 && fall > 0.7) {
      if (fall < 0.715) return { ramp: daub, v: v - 0.3 };
      const st = 7 * S, row = Math.floor(z / 3), rz = z - row * 3, sa = ((al % st) + st) % st, over = (Math.floor(al / st) + row) % 2;
      if (sa < 1.2) return { ramp: oak, v: 0.2 };
      return { ramp: oak, v: (over ? 0.62 : 0.38) + (rz > 1.8 ? 0.14 : rz < 0.8 ? -0.16 : 0) };
    }
    return { ramp: daub, v };
  };

  // ---- the moods' own things on the walls (at home: see HOME_ART)
  /** The gallery's shoring, if this spot is oak: a post at each of SHORE_AT along the wall, a cap beam along the top, a knee brace
   *  from each post up to the cap (c across the timber from its lit edge, g along its grain), as timberAt is for the timber hall. */
  const kb = Math.round(13 * S), zc = Math.round(wall * 0.84);
  const shoreAt = (al, z, sl) => {
    if (z >= zc && z < zc + bw) return { c: (zc + bw - 1 - z) / (bw - 1), g: al, n: 3, hz: 1 };
    if (z >= zc + bw) return null;
    for (let k = 0; k < SHORE_AT.length; k++) {
      const pc = SHORE_AT[k] * hw;
      if (Math.abs(al - pc) < pw) return { c: sl * (pc + sl * pw - al) / (2 * pw), g: z, n: 10 + k };
      // the braces: from the post's side up to the cap, both ways (none beyond the ends)
      for (const dir of [-1, 1]) {
        const s0 = pc + dir * pw, z0 = zc - kb, s1 = pc + dir * (pw + kb), dx = s1 - s0, dz = zc - z0, len = Math.hypot(dx, dz);
        const tt = ((al - s0) * dx + (z - z0) * dz) / (len * len), dist = ((al - s0) * dz - (z - z0) * dx) / len, half = bw * 0.45;
        if (s1 > 2 && s1 < hw - 2 && tt > 0 && tt < 1 && Math.abs(dist) < half) return { c: (sl * dir * dist + half) / (2 * half), g: tt * len, n: 30 + k * 2 + dir };
      }
    }
    return null;
  };
  /** Oak, as the timber hall's: lit along one edge and shaded along the other, grain along it, the odd split. */
  const oakPx = (m, al, z, base) => {
    let v = base - 0.04;
    if (m.c < 0.16) v += 0.24; else if (m.c > 0.84) v -= 0.24;
    const gr = m.hz ? pxNoise(m.g * 0.07 + m.n * 7, z * 0.75) : pxNoise(al * 0.75 + m.n * 3, m.g * 0.06 + m.n * 7);
    if (Math.abs(gr - 0.5) < 0.05) v -= 0.12; else if (gr > 0.82) v += 0.07;
    if (pxHash(m.n, Math.floor(m.g / (14 * S))) > 0.9 && Math.abs(m.c - 0.45) < 0.09) v -= 0.3;
    return v;
  };
  // the aurora's ice, and the light that glows through it: green curtains, a pink hem here and there
  const ice = hexes(["#0a1426", "#16304d", "#2a5578", "#4a86a8", "#7fbcd4", "#bfe6f2", "#f2fcff"]);
  const auroraG = hexes(["#0b1a2e", "#123c4a", "#1a6a64", "#2fa383", "#6fe0b0", "#c8ffe6"]), auroraP = hexes(["#1a1030", "#3a1f52", "#6b3a7a", "#a3489a", "#e88bc8", "#ffd8ee"]);
  /** High up the aurora's cave the rock gives way to a vault of ice in big blocks (lit top edges, dark seams), the northern
   *  lights glowing through in bands. Below the ice line, null: rock. */
  const auroraAt = (al, z, sl) => {
    const edge = wall * (0.5 + 0.12 * pxNoise(al * 0.04 + sl * 7, seed));
    if (z < edge) return null;
    const f = facet(al, z, 26 * S, 13 * S, seed + 33);
    if (f.edge < 0.9) return { ramp: ice, v: 0.1 };
    const A = (0.5 + 0.5 * Math.sin(al * 0.05 + sl * 2 + pxFbm(al * 0.02 + seed, z * 0.025) * 8)) * clamp((z - edge) / (wall * 0.3), 0, 1);
    let v = 0.22 + 0.62 * A + 0.12 * (f.oy * 0.9 + f.ox * sl * 0.5);
    if (f.edge < 2 && f.oy > 0) v += 0.18;
    return { ramp: A > 0.4 ? (A > 0.55 && z > edge + wall * 0.3 && pxNoise(al * 0.07 + seed, z * 0.03 + sl) > 0.7 ? auroraP : auroraG) : ice, v };
  };
  /** The crypt's columns, engaged in its walls, as a shade (or -1 where there's none): a round shaft lit on its left in bands,
   *  a moulded base on the plinth and a capital under the vault, a rib going on up it. */
  const plH = Math.round(13 * S), cw = Math.max(3, Math.round(6 * S));
  const columnAt = (al, z, sl) => {
    for (const f of COLUMN_AT) {
      const a = (al - f * hw) * sl, base = z < plH + 4 * S, cap = z > wall - 9 * S && z < wall, above = z >= wall;
      const half = above ? cw * 0.55 : base || cap ? cw + Math.round(2 * S) : cw;
      if (Math.abs(a) >= half) continue;
      const c = -a / half;   // 1 at its lit (screen-left) edge, -1 at its shaded one
      if (Math.abs(c) > 0.86) return 0.06;
      if (base && Math.abs(z - (plH + 4 * S)) < 1) return 0.1;
      if (cap && (Math.abs(z - (wall - 9 * S)) < 1 || Math.abs(z - (wall - 4 * S)) < 0.6)) return 0.12;
      return (c > 0.45 ? 0.82 : c > -0.05 ? 0.62 : c > -0.55 ? 0.42 : 0.26) - (above ? 0.1 : 0) + (base || cap ? 0.06 : 0);
    }
    return -1;
  };

  // ---- the floor's materials: u runs along the right wall, v along the left; ao is the dark where it meets a wall
  const pathD = (() => {
    // trodden paths outdoors: the camp's ring round the fire and its ways to the tent and out; the garden's walk between the beds
    const lines = roomKindNow === "camp" ? [[[0.42, 0.58], [0.66, 0.36]], [[0.42, 0.58], [0.72, 0.8], [1.02, 0.9]], [[0.42, 0.58], [0.22, 0.3]]]
      : roomKindNow === "yard" ? [[[1.02, 0.44], [0.7, 0.46], [0.4, 0.43], [0.2, 0.38]], [[0.55, 0.45], [0.52, 0.66]], [[0.7, 0.46], [0.74, 0.32]]]
      // the snowfields: one track trodden in from the edge to Runa's door, and a short one off it to the pond
      : roomKindNow === "snow" ? [[[1.02, 0.78], [0.78, 0.62], [0.6, 0.5], [0.5, 0.38]], [[0.6, 0.5], [0.36, 0.56], [0.3, 0.62]]] : [];
    return (u, v) => {
      let best = 9;
      for (const ln of lines) for (let k = 0; k + 1 < ln.length; k++) {
        const [a0, b0] = ln[k], [a1, b1] = ln[k + 1], du = a1 - a0, dv = b1 - b0, tt = clamp(((u - a0) * du + (v - b0) * dv) / (du * du + dv * dv), 0, 1);
        best = Math.min(best, Math.hypot(u - a0 - du * tt, v - b0 - dv * tt));
      }
      if (roomKindNow === "camp") best = Math.min(best, Math.abs(Math.hypot(u - 0.42, v - 0.58) - 0.02));
      return best;
    };
  })();
  const dirt = hexes(["#1f130a", "#3b2414", "#553620", "#6e4a2a", "#8a6238", "#a37b4b"]);
  // (the gallery's oak at home, shifted in hue like its rock: cool in the seams, warm where it's lit)
  const oakH = mood ? hueRamp(oak, [255, 222, 168], 0.1) : oak;
  const floorPx = (u, v, x, y, ao, lk) => {
    if (floorK === "timber") {
      // wide oak boards running from the back to the front: each its own shade, grain along it, a lit and a dark edge to each
      // seam, staggered butt joints with two nails each, the odd knot; worn paler where people walk
      const n = 12, fu = u * n, plank = Math.floor(fu), pw2 = hw / n, wp = (fu - plank) * pw2, along = v * hw;
      const Lb = hw * (0.42 + 0.16 * pxHash(plank, 5)), a = along + pxHash(plank, 3) * Lb, board = Math.floor(a / Lb), e = a - board * Lb;
      let pv = 0.46 + 0.16 * (pxHash(plank, board + 7) - 0.5) + 0.2 * lk;
      const gr = pxNoise(wp / pw2 * 4 + plank * 3.7 + board * 1.3, along * 0.022 + board * 4);
      if (Math.abs(gr - 0.5) < 0.04) pv -= 0.13; else if (gr > 0.8) pv += 0.07;
      if (pxHash(plank, board) > 0.65) { const ke = Lb * (0.25 + 0.5 * pxHash(board, plank)), kd = Math.hypot((wp - pw2 * 0.45) / 1.3, (e - ke) / 2.6); if (kd < 0.8) pv = 0.12; else if (kd < 1.6) pv -= 0.18; else if (kd < 2.6 && Math.abs(gr - 0.5) < 0.12) pv -= 0.08; }
      if (wp < 1) pv = 0.04; else if (wp < 2) pv += 0.14; else if (wp > pw2 - 1.2) pv -= 0.14;
      if (e < 1) pv = 0.06; else if (e < 2) pv += 0.1; else if (e > Lb - 1.2) pv -= 0.12;
      if (Math.abs(e - 3.2 * S) < 0.6 && (Math.abs(wp - pw2 * 0.28) < 0.6 || Math.abs(wp - pw2 * 0.72) < 0.6)) pv = 0.02;
      return isoTone(mood ? oakH : oak, pv - 0.42 * ao, x, y, mood ? 0.08 : 0.3);
    }
    if (floorK === "hall" || kind === "ruin") {
      // flagstones in staggered rows, each its own stone (a darker slate now and then), bevelled toward the light, cracked,
      // polished pale where feet go; in the ruins, moss in the joints and grass where a stone is missing
      const n = 7, fu = u * n, row = Math.floor(fu), pw2 = hw / n, wp = (fu - row) * pw2;
      const len = 1.05 + 0.55 * pxHash(row, 9), fv = v * n + pxHash(row, 4 + seed) * len, st = Math.floor(fv / len), e = (fv - st * len) * pw2, pl = len * pw2;
      const sh = pxHash(row * 31 + st, seed);
      let val = 0.5 + 0.14 * (sh - 0.5) + 0.24 * lk + 0.08 * (pxFbm(x * 0.15 + seed, y * 0.25) - 0.5) - (sh > 0.82 ? 0.12 : 0);
      if (pxHash(st, row + 3) > 0.74 && Math.abs(pxNoise(x * 0.1 + st, y * 0.2 + row) - 0.5) < 0.018) val -= 0.25;
      const sp = pxHash(x * 3, y * 7 + seed); if (sp > 0.98) val -= 0.12; else if (sp < 0.015) val += 0.1;
      // (a corner knocked off a stone here and there, the joint wider for it)
      const joint = wp < 1 || e < 1 || (wp < 2.5 && e < 2.5 && pxHash(row * 31 + st, seed + 77) > 0.55) || (wp > pw2 - 2.5 && e > pl - 2.5 && pxHash(row * 31 + st, seed + 78) > 0.7);
      if (kind === "ruin") {
        if (joint && pxHash(x, y + seed) > 0.3) return moss[pxHash(x + 1, y) > 0.6 ? 2 : 1];
        if (sh > 0.9) return pxFbm(x * 0.4, y * 0.4) > 0.5 ? moss[1] : moss[0];
      }
      // in the valley's abbey, moss creeps into the joints along the foot of the walls, in patches
      else if (joint && !mood && Math.min(u, v) < 0.06 + 0.12 * pxFbm(u * 7 + seed, v * 7) && pxHash(x, y + seed) > 0.3) return moss[pxHash(x + 1, y) > 0.7 ? 1 : 0];
      if (joint) val = 0.06; else if (wp < 2 || e < 2) val += 0.16; else if (wp > pw2 - 1.4 || e > pl - 1.4) val -= 0.15;
      return isoTone(wallC, val - 0.42 * ao, x, y, mood ? 0.08 : 0.3);
    }
    if (kind === "cave") {
      // the rock itself: lumpy and uneven (lit where it rises toward the light), cracked, strewn with pebbles that each cast a
      // little shadow, a few crystal splinters
      const f = facet(u * hw, v * hw, 26 * S, 26 * S, seed + 5);
      let val = 0.44 + 0.22 * lk + 0.1 * (f.sh - 0.5) + 0.12 * (-f.ox * 0.6 - f.oy * 0.8) + 0.08 * (pxFbm(x * 0.12, y * 0.24) - 0.5);
      if (f.edge < 1 && f.sh > 0.45) val = 0.1; else if (f.edge < 2 && f.sh > 0.45) val += f.ox + f.oy < 0 ? -0.1 : 0.08;
      // (at home, #307: stone by stone, see floorTex; moss in the gaps near the walls where something grows)
      const ft = mood && floorTex(u, v, x, y, ao, lk);
      if (ft) {
        val = ft.v + 0.45 * ao;
        if (ft.gap && grow.moss && Math.min(u, v) < 0.08 + 0.25 * grow.moss && pxHash(x, y + seed) > 0.35) return MOSS_HEX[pxHash(x + 1, y) > 0.7 ? 3 : 2];
        // (in the crystal caves only a dark moss, in the gaps nearest the walls, in patches)
        if (ft.gap && grow.gaps && Math.min(u, v) < grow.gaps * (0.4 + pxFbm(u * 8 + seed, v * 8)) && pxHash(x, y + seed) > 0.3) return MOSS_HEX[pxHash(x + 1, y) > 0.75 ? 2 : 1];
      }
      const gx = Math.floor(x / 9), gy = Math.floor(y / 5), ph = pxHash(gx + seed, gy * 3);
      let pebble = false;
      if (ph > (mossy || mood ? 0.86 : 0.6)) {
        const px0 = gx * 9 + 2 + pxHash(gx, gy) * 5, py0 = gy * 5 + 1 + pxHash(gy, gx) * 3, pr = 1 + (ph - 0.6) * 5, dx = (x + 0.5 - px0) / pr, dy = (y + 0.5 - py0) / (pr * 0.6);
        const dd = dx * dx + dy * dy;
        if (dd < 1) { val = 0.5 + 0.35 * (-dx * 0.6 - dy * 0.8) + 0.2 * lk; pebble = true; }
        else if (dd < 2.2 && dx > -0.2 && dy > 0) val -= 0.2;
      }
      if (mossy && !pebble) {
        // a carpet of moss in cushions, each its own lump: lit warm on its top left, cool in shade on its bottom right, a dark
        // seam between them; bare soil in patches, its clods shaded the same way, the moss's rim curling over its edge
        const soil = pxFbm(u * 6 + seed, v * 6 + 3) + 0.05 * (pxNoise(x * 0.4, y * 0.8) - 0.5);
        if (soil < 0.33) {
          const cl = facet(u * hw, v * hw, 5 * S, 5 * S, seed + 21);
          let sv = 0.36 + 0.2 * lk + 0.28 * (-cl.ox * 0.6 - cl.oy * 0.8) + 0.1 * (cl.sh - 0.5);
          if (cl.edge < 0.8) sv = 0.1;
          if (soil > 0.31) sv -= 0.14;
          return isoTone(dirt, sv - 0.4 * ao, x, y);
        }
        const cu = facet(u * hw, v * hw, 9 * S, 9 * S, seed + 13);
        let mv = 0.42 + 0.22 * lk + 0.36 * (-cu.ox * 0.6 - cu.oy * 0.8) + 0.1 * (cu.sh - 0.5);
        if (cu.edge < 1) mv = 0.2; else if (cu.edge < 2 && cu.ox + cu.oy > 0) mv -= 0.12;
        if (soil < 0.36) mv += 0.16;      // the rim of the moss where it curls over the soil
        if (pxHash(x * 3, y) > 0.97) mv += 0.18;
        return isoTone(mossC, mv - 0.5 * ao, x, y, 0.2);
      }
      // the aurora's cave: sheets of ice over the rock, a pale streak of sheen across each, a dark rim where it ends
      if (mood === "aurora" && !pebble) {
        const sh = pxFbm(u * 5 + seed, v * 5 + 7);
        if (sh > 0.52) return isoTone(ice, sh < 0.545 ? 0.18 : 0.4 + 0.24 * lk + (((x + 2 * y) % 13 === 0 && pxHash(x >> 3, y >> 2) > 0.72) ? 0.36 : 0) + 0.06 * (pxFbm(x * 0.2, y * 0.3) - 0.5) - 0.4 * ao, x, y, 0.15);
      }
      // the moonwell: moss creeping out from the foot of the walls in cushions
      if (mood === "moonwell" && !pebble && Math.min(u, v) < 0.16) {
        const m = pxFbm(u * 9 + seed, v * 9) + (0.16 - Math.min(u, v)) * 2;
        if (m > 0.62) { const cu = facet(u * hw, v * hw, 7 * S, 7 * S, seed + 13); return isoTone(mossC, (cu.edge < 1 ? 0.18 : 0.38 + 0.3 * (-cu.ox * 0.6 - cu.oy * 0.8)) + 0.2 * lk - 0.45 * ao, x, y, 0.2); }
      }
      if (pxHash(x, y + seed) > 0.9975) return crys[2];
      // (at home the floor darkens toward its front edges and into the walls in ordered-dither steps, not one hard band)
      const edgeK = mood ? clamp((Math.max(u, v) - 0.84) / 0.16, 0, 1) * 0.7 + Math.min(1, ao * 1.4) * 0.5 : 0;
      return isoTone(wallC, val - 0.45 * ao - (PX_BAYER[(y & 3) * 4 + (x & 3)] < edgeK ? 0.15 : 0), x, y, mood ? 0.08 : 0.3);
    }
    // outdoors: the ground rolls a little (lit where it tips toward the light), grass in darker and paler patches, the
    // blades themselves come after; trodden paths of bare earth with pebbles, grass creeping in from their edges
    const lump = (xx, yy) => pxFbm(xx * 0.03 + seed, yy * 0.06);
    let val = 0.52 + 0.2 * lk + 2.6 * (lump(x - 2, y - 2) - lump(x + 2, y + 2)) + 0.16 * (pxFbm(x * 0.06 + seed, y * 0.12) - 0.5) - 0.2 * Math.max(0, Math.max(u, v) - 0.85) * 5;
    const pd = pathD(u, v) * hw / (S * 180), pr = roomKindNow === "camp" ? 0.07 : 0.05, ragged = 0.012 * (pxNoise(x * 0.3, y * 0.6) - 0.5) * 2;
    // (snow lies smoother than grass: long soft swells the wind laid, a little sparkle, calm bands between them)
    if (roomKindNow === "snow" && pd >= pr + ragged) return isoTone(ground, 0.62 + 0.18 * lk + 1.1 * (lump(x - 3, y - 3) - lump(x + 3, y + 3)) + 0.06 * (pxFbm(x * 0.05 + seed, y * 0.1) - 0.5) - 0.15 * Math.max(0, Math.max(u, v) - 0.85) * 5 - (pd < pr + 0.03 ? 0.1 : 0), x, y, 0.25);
    if (pd < pr + ragged && roomKindNow === "snow") {
      // packed snow, a step bluer than the drifts round it, a soft lip where it meets them; and small paw prints in pairs up the
      // middle (Runa's: the tracks the sparks saw), a little to either side of the line
      let sv = 0.42 + 0.18 * lk + 1.4 * (lump(x - 2, y - 2) - lump(x + 2, y + 2));
      if (pd > pr + ragged - 0.014) sv += 0.16;
      const step = Math.floor((x + y * 2) / 7), side = step % 2 ? 1 : -1, ox = (x + y * 2) % 7;
      if (pd < pr * 0.55 && ox < 2 && Math.abs(pd * (S * 180) / hw - pr * 0.3 * (side > 0 ? 1 : 0.2)) < 0.02 && (y + side) % 3 === 0) sv = 0.1;
      return isoTone(ground, sv, x, y, 0.4);
    }
    if (pd < pr + ragged) {
      if (roomKindNow === "yard") {
        // stepping stones set in gravel
        const sx = Math.floor(x / 16), sy = Math.floor((y + (sx % 2) * 4) / 8), so = pxHash(sx, sy + seed), scx = sx * 16 + 8, scy = sy * 8 + 4 - (sx % 2) * 4, sd = Math.hypot((x + 0.5 - scx) / 6.5, (y + 0.5 - scy) / 3.4);
        // (old stones: a chip off the front of some, moss in a crescent along the back rim of others)
        const chip = so > 0.7 && sd > 0.62 && x > scx + 1 && y > scy;
        if (so > 0.25 && sd < 1 && !chip) {
          if (sd > 0.66 && y < scy && pxHash(sx * 7, sy + seed) > 0.45 && pxHash(x, y) > 0.2) return moss[sd > 0.85 ? 0 : x < scx ? 2 : 1];
          return isoTone(ruinStone, 0.55 + 0.25 * (-(x - scx) / 6.5 * 0.6 - (y - scy) / 3.4 * 0.8) + 0.2 * lk + 0.1 * (so - 0.5), x, y);
        }
        if (so > 0.25 && sd < 1.35 && y > scy) return dirt[1];
        const gv = pxHash(x, y + 5); return isoTone(dirt, 0.42 + 0.2 * lk + (gv > 0.8 ? 0.22 : gv < 0.15 ? -0.2 : 0) - 0.3 * ao, x, y);
      }
      let dv = 0.45 + 0.2 * lk + 1.8 * (lump(x - 2, y - 2) - lump(x + 2, y + 2)) + 0.1 * (pxFbm(x * 0.2, y * 0.3) - 0.5);
      if (pd > pr + ragged - 0.012) dv -= 0.2;
      const pb = pxHash(x >> 1, (y >> 1) + seed); if (pb > 0.96) dv += 0.28; else if (pb > 0.93) dv -= 0.2;
      return isoTone(dirt, dv, x, y);
    }
    if (pd < pr + 0.03 && pxHash(x, y) > 0.5) val -= 0.14;
    // (no rim at the front edges: the plot lies in its meadow, and the grass grows over its edge: see paintRoomIso, nightSite)
    return isoTone(ground, val, x, y, 0.5);
  };
  return { kind, art, night, wallR, crys, ground, seed, indoor, hexes, ruinStone, moss, oak, daub, ashlar, wallC, ruinH, wood, stone, roomKindNow, garden, mood, mossy, mossC, ashlarPx, facet, rockPx, timberAt, timberPx, shoreAt, oakPx, oakH, ice, auroraG, auroraP, auroraAt, columnAt, plH, rockTex, growthOn, pathD, dirt, floorPx };
}
/** Where the moss garden's own garden is, in floor units along its walls (see paintMossGarden): low against the walls and clear
 *  of the tunnels (DOOR_AT), so furniture still stands anywhere on the floor, in front of it; and where its shaft of light lands. */
const MOSS_GARDEN = { bedL: [0.37, 0.62], bedR: [0.06, 0.3], spring: [0.125, 0.2, 0.11], light: [0.32, 0.38] };
/** The spring's pool (MOSS_GARDEN.spring: its middle on the floor, u and v, and the water's radius): a ring of stones rim wide round
 *  it, standing low enough to hop over, the water a pixel under their tops; and the mossy rock against the wall behind it, its lip
 *  lip out from the wall, the trickle falling off it. Heights in art pixels, for a wall that many art pixels tall. */
const SPRING = { rim: 0.026, lip: 0.045 };
const springZ = wall => { const rim = Math.max(3, Math.round(wall * 0.045)), lip = rim + Math.round(wall * 0.16); return { rim, lip, rock: lip + Math.round(wall * 0.07) }; };
/** The spring in screen pixels: the water's middle (x, y, on its surface), its half width and height (rx, ry; Rx, Ry with the rim),
 *  the rim's height, the lip the trickle falls from (lx, ly) and where it lands (wy), and the rock's top. */
function springPool() {
  const [u, v, r] = MOSS_GARDEN.spring, z = springZ(N.isoWall / PX), [x, fy] = isoAt(u, v), R = r + SPRING.rim, [lx, lf] = isoAt(SPRING.lip, v);
  return { x, y: fy - (z.rim - 1) * PX, fy, rx: r * Math.SQRT2 * N.isoW, ry: r * Math.SQRT1_2 * N.isoW, Rx: R * Math.SQRT2 * N.isoW, Ry: R * Math.SQRT1_2 * N.isoW, z: z.rim * PX,
    lx, ly: lf - z.lip * PX, wy: lf - (z.rim - 1) * PX, rockX: isoAt(0, v)[0], top: isoAt(0, v)[1] - z.rock * PX };
}
/** Where the moods' own things stand along each wall (a share of its length from the back corner), clear of the tunnels
 *  (DOOR_AT): the gallery's posts, the crypt's columns, and the crypt's niche in the left wall between them. */
const SHORE_AT = [0.07, 0.37, 0.64, 0.95], COLUMN_AT = [0.14, 0.62], NICHE_AT = 0.38;
const CAP_BLUE = ["#13304e", "#1d5276", "#3383a8", "#69b7d6", "#b8e6f5", "#f0fbff"], CAP_PINK = ["#3a1530", "#8f3460", "#c25586", "#e88bb1", "#ffd8e6", "#fff4f8"];
const CAVE_FLOWERS = ["#f4f0ff", "#c9a8ff", "#fff0b5", "#ffb8d8", "#9fe4f4"];
/** The shafts of light that come down into a cave at home: the moss garden's and the glowcap grotto's, warm, from a crack in the
 *  vault (fireflies over them), and the moonwell's, cold and wider, from the moon down its well. off is where the opening is along
 *  the left wall (a share of its length), at the share of the floor it lands on. */
const SHAFTS = { warm: { col: "#fff2c0", top: 0.05, bot: 0.21, off: 0.12, at: MOSS_GARDEN.light, flies: true }, moon: { col: "#d8ccff", top: 0.08, bot: 0.25, off: 0.05, at: [0.42, 0.44], flies: false } };
/** The shaft over the room you're in, if it has one (its light and its fireflies go over everything in it). */
const roomShaft = () => {
  if (game.scene !== "nest" || !atHome()) return null;
  const mood = HOME_ART[currentTheme()]?.mood;
  return save.rooms[save.room]?.kind === "garden" || mood === "grotto" ? SHAFTS.warm : mood === "moonwell" ? SHAFTS.moon : null;
};
/** The crack in the vault the light comes down through, in art pixels: just left of the back corner (off along the left wall), where
 *  the rock's ragged top is (the same top paintRoomIso gives a cave's walls), and the seed of the cave it's in. */
function mossCrack(seed, off = SHAFTS.warm.off) {
  const q = v => v / PX, cx = q(N.cx), hw = q(N.isoW), wall = q(N.isoWall), x = Math.round(cx - hw * off), tt = (cx - x) / hw;
  const yTop = q(N.isoTop) + tt * hw / 2 - wall - (wall * (0.22 * (1 - tt) + 0.16 * pxNoise(x * 0.05, seed)) + 4 * pxNoise(x * 0.3, seed + 4) - 2);
  return [x, Math.round(yTop + Math.max(4, wall * 0.13))];
}
/**
 * The moss garden's garden, drawn into its walls and floor (none of it is furniture, and none of it is in the way): a raised bed
 * against the foot of each wall, two courses of stones each shaded on its own (lit top and left, a cool shadow below and right,
 * dark joints, moss creeping over the top), full of dark soil with glowcaps, ferns and little cave flowers; a spring trickling from
 * a crack in the left wall into a stone basin; vines climbing both walls; glowcaps at the ends of the walls and a fern in the back corner; the crack
 * in the vault, and the pool of warm light its shaft lays on the moss (the shaft itself is drawn over the room: drawMossLight).
 */
function paintMossGarden({ put, d, w, h, at, cx, top, hw, hh, wall, S, seed, mossC, dirt, whole = true }) {
  const get = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return null; const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const tint = (x, y, col, k) => { const c0 = get(x, y); if (c0) put(x, y, mixHex(c0, col, k)); };
  const stoneC = GARDEN_STONE.map(pxHex), capB = CAP_BLUE.map(pxHex), capP = CAP_PINK.map(pxHex), aq = DECO_AQUA, warm = pxHex("#f6e9a8");
  const bay = (x, y) => PX_BAYER[(Math.round(y) & 3) * 4 + (Math.round(x) & 3)];
  // a glow round something that shines, falling off in two steps, dithered only where they meet
  const halo = (x0, y0, R, col, k) => { for (let y = Math.floor(y0 - R); y <= y0 + R; y++) for (let x = Math.floor(x0 - R); x <= x0 + R; x++) { const dd = Math.hypot(x - x0, y - y0) / R + (bay(x, y) - 0.5) * 0.25; if (dd < 1) tint(x, y, col, dd < 0.5 ? k : k * 0.45); } };
  // a spot on a wall's plane: s along the wall from the back corner, o out from it across the floor, z up
  const pt = (side, s, o, z = 0) => { const [x, y] = side === "L" ? at(o, s) : at(s, o); return [x, y - z]; };
  const step = 0.35 / hw, pool = new Map();

  // ---- the pool of light from the crack in the vault, laid on the moss in three steps (the shaft brightens it again, over the rug too)
  const [lu, lv] = MOSS_GARDEN.light;
  for (let y = Math.floor(top); y <= Math.ceil(top + hw); y++) for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
    const a = (x - cx) / hw, b = (y - top) / hh, u = (a + b) / 2, v = (b - a) / 2;
    if (u < 0.02 || v < 0.02 || u > 0.98 || v > 0.98) continue;
    const dd = Math.hypot(u - lu, v - lv) / 0.2 + (bay(x, y) - 0.5) * 0.16;
    if (dd < 1) tint(x, y, warm, dd < 0.4 ? 0.36 : dd < 0.7 ? 0.22 : 0.1);
  }

  // ---- the crack in the vault: a jagged slit of light in the rock, a dark lip round it, the stone round it warmed
  const [kx, ky] = mossCrack(seed);
  halo(kx, ky - wall * 0.08, wall * 0.12, warm, 0.22);
  for (let k = 0, x = kx; k < Math.max(5, wall * 0.14); k++) {
    x += pxHash(k, seed + 31) > 0.6 ? 1 : pxHash(k, seed + 32) > 0.7 ? -1 : 0;
    const y = ky - k, wide = k > 2 && k < wall * 0.1 ? 1 : 0;
    put(x - 1 - wide, y, stoneC[0]); put(x + 1 + wide, y, stoneC[0]);
    put(x, y, pxHex(k < 2 ? "#f6e9a8" : "#fffbe6")); if (wide) put(x + 1, y, pxHex("#f6e9a8"));
  }

  // ---- what grows: each drawn from its foot, in pixels, lit from the top left
  const fernAt = (x0, y0, L) => {
    for (const a of [-1.25, -0.75, -0.25, 0.25, 0.75, 1.2]) {
      const len = L * (0.62 + 0.38 * Math.cos(a * 0.9)), fx = Math.sin(a), fy = -Math.cos(a), lit = a < 0;
      for (let st = 0; st <= len; st += 0.5) {
        const t = st / len, x = x0 + fx * st, y = y0 + fy * st + t * t * len * 0.4 * Math.abs(fx);
        put(x, y, mossC[t > 0.85 ? 5 : 3]);
        // leaflets in pairs along the frond, shorter toward its tip, the upper ones catching the light
        if (st > 1 && Math.round(st * 2) % 3 === 0) {
          const lf = Math.max(1, Math.round((1 - t) * 2.6 * S + 0.4));
          for (let q = 1; q <= lf; q++) { put(x - fy * q + fx * q * 0.4, y + fx * q - q * 0.5, mossC[lit ? 6 : 5]); put(x + fy * q + fx * q * 0.4, y - fx * q - q * 0.2, mossC[lit ? 5 : 4]); }
        }
      }
    }
  };
  const capAt = (x0, y0, hg, r, C) => {
    const top = Math.round(y0 - hg), ry = Math.max(2, r * 0.72), ws = Math.max(1, Math.round(r * 0.26));
    halo(x0, top - ry * 0.3, r * 3, C[3], 0.26);
    // a stout stem, glowing pale, lit on the left, a little flared at the foot
    for (let k = 0; k <= hg; k++) { const fw = ws + (k < 2 ? 1 : 0); for (let q = -fw; q <= fw; q++) put(x0 + q, y0 - k, q < 0 ? C[4] : q < fw ? C[3] : C[2]); }
    // the cap: a dome lit from the top left, its rim curling under in shadow, the gills a darker band beneath
    for (let yy = Math.floor(top - ry); yy <= top + 1; yy++) {
      const dy = (top - yy) / ry, half = yy > top ? r * 0.8 : r * Math.sqrt(Math.max(0, 1 - dy * dy));
      for (let xx = Math.round(x0 - half); xx <= Math.round(x0 + half); xx++) {
        const nx = (xx - x0) / (r + 0.01);
        put(xx, yy, yy > top ? C[0] : yy === top ? C[1] : Math.abs(nx) > 0.82 ? C[2] : nx < -0.25 && dy > 0.3 ? C[5] : nx > 0.45 || dy < 0.2 ? C[3] : C[4]);
      }
    }
    if (r > 2.4) { put(x0 - Math.round(r * 0.3), top - Math.round(ry * 0.6), pxHex("#ffffff")); put(x0 + Math.round(r * 0.35), top - Math.round(ry * 0.35), C[5]); }
  };
  const flowerAt = (x0, y0, hg, col) => {
    for (let k = 0; k < hg; k++) put(x0, y0 - k, mossC[3]);
    put(x0 - 1, y0 - Math.round(hg / 2), mossC[5]);
    const c = pxHex(col), dk = mixHex(c, [40, 30, 70], 0.35), fy = y0 - hg;
    put(x0 - 1, fy, c); put(x0 + 1, fy, dk); put(x0, fy - 1, c); put(x0, fy + 1, dk); put(x0, fy, pxHex("#ffe08a"));
    if (wall > 90) { put(x0 - 2, fy - 1, c); put(x0 + 2, fy - 1, c); put(x0 - 2, fy + 1, dk); put(x0 + 2, fy + 1, dk); put(x0, fy - 3, c); put(x0 - 2, fy, c); put(x0 + 2, fy, dk); put(x0, fy - 2, c); put(x0 - 1, fy - 1, c); put(x0 + 1, fy - 1, c); put(x0 + 1, fy + 1, dk); put(x0 - 1, fy + 1, dk); }
  };
  const tuft = (x0, y0) => { put(x0, y0 - 1, mossC[5]); put(x0 - 1, y0, mossC[4]); put(x0 + 1, y0 - 2, mossC[6]); put(x0 + 1, y0, mossC[4]); };

  // ---- vines up the walls: a stem wandering as it climbs, a leaf every few pixels, turn and turn about, and the odd glowing bud
  const vine = (side, s, z0, z1, ph) => {
    for (let z = z0; z <= z1; z += 0.5) {
      const off = (2.2 * Math.sin(z * 0.08 + ph) + Math.sin(z * 0.21 + ph * 2)) * S, [x, y] = pt(side, s + off / hw, 0, z);
      put(x, y, mossC[2]);
      const zi = Math.round(z);
      if (z === zi && zi % 4 === 0) {
        const dir = (zi / 4) % 2 ? 1 : -1;
        put(x + dir, y, mossC[4]); put(x + 2 * dir, y - 1, mossC[dir < 0 ? 6 : 5]); put(x + dir, y - 1, mossC[5]);
        if (pxHash(zi, ph * 9) > 0.86) { halo(x + 2 * dir, y - 2, 3, capB[3], 0.3); put(x + 2 * dir, y - 2, capB[4]); }
      }
    }
  };
  const kz = Math.max(6, Math.round(wall * 0.15)), zb = Math.max(6, Math.round(wall * 0.12)), U = Math.max(1, wall / 70);
  for (const [s, z1, ph] of [[0.1, 0.92, 1], [0.36, 0.58, 2], [0.67, 0.78, 3]]) vine("L", s, whole && s > 0.2 && s < 0.6 ? kz : 0, wall * z1, ph);
  for (const [s, z1, ph] of [[0.14, 0.86, 4], [0.36, 0.5, 5], [0.68, 0.7, 6]]) vine("R", s, whole && s > 0.2 && s < 0.5 ? kz : 0, wall * z1, ph);

  // (the glowcap grotto in another room has the moss garden's light and glowcaps, but not its spring and its beds)
  if (whole) {
  // ---- the spring: a round pool sunk in a low ring of stones by the back corner (low enough to hop over, mossy on the lit back and
  //      left), clear water deep blue-green in the middle and pale over the stones at its edge, the trickle's bright reflection in
  //      it; behind it a mossy rock against the wall, a flat lip of stone sticking out of it and the water falling off that in a
  //      thin bright thread. Every pixel of the pool is kept (pool) to be laid again over a glowling sitting in it: see springFront.
  const [pu, pv, pr] = MOSS_GARDEN.spring, R = pr + SPRING.rim, Z = springZ(wall), wallU = 0.004;
  const pput = (x, y, col, k) => { x = Math.round(x); y = Math.round(y); put(x, y, col); if (x >= 0 && y >= 0 && x < w && y < h) pool.set(y * w + x, k); };
  const lit = th => Math.sin(th) - Math.cos(th);   // (how much a bit of the rim faces left, toward the light)
  // the rock: a lump against the wall, bulging out of it, shaded round like a boulder lit from the top left, moss on its top
  const rw = 0.075;
  for (let z = 0; z <= Z.rock; z += 0.5) for (let s = pv - rw; s <= pv + rw; s += step) {
    const ns = (s - pv) / rw, hgt = Z.rock * Math.sqrt(Math.max(0, 1 - ns * ns)) * (0.85 + 0.25 * pxNoise(s * 60, seed + 7));
    if (z > hgt) continue;
    const nz = z / Math.max(1, hgt), o = 0.03 * Math.sqrt(Math.max(0, 1 - ns * ns * 0.8 - nz * nz * 0.6)), [x, y] = pt("L", s, o, z);
    const lv = 0.42 + 0.3 * ns + 0.25 * nz + (pxNoise(x * 0.4, y * 0.4 + seed) - 0.5) * 0.3 + (bay(x, y) - 0.5) * 0.18;
    const edge = Math.abs(ns) > 0.88 || z > hgt - 1;
    put(x, y, nz > 0.84 - 0.22 * pxNoise(s * 90, seed) ? mossC[edge ? 3 : lv > 0.62 ? 5 : 4] : stoneC[edge ? 1 : clamp(Math.round(lv * 5), 1, 4)]);
  }
  // the lip: a flat stone out of the rock, its top lit, its edge dark, wet underneath
  for (let s = pv - 0.022; s <= pv + 0.022; s += step) for (let o = 0; o <= SPRING.lip; o += step) {
    const [x, y] = pt("L", s, o, Z.lip); put(x, y, o > SPRING.lip - step * 2 ? stoneC[2] : stoneC[s > pv + 0.012 ? 5 : 4]); put(x, y + 1, stoneC[1]);
  }
  // the rim's outer face, stone by stone round the pool (a course as tall as the rim), lit where it faces left, moss on some
  const nSt = Math.max(10, Math.round(2 * Math.PI * R * hw / (5 * U)));
  for (let th = 0; th < 2 * Math.PI; th += 0.3 / (R * hw)) for (let z = 0; z < Z.rim; z++) {
    const u = pu + R * Math.cos(th), v = pv + R * Math.sin(th);
    if (u < wallU) continue;
    const si = Math.floor(th / (2 * Math.PI) * nSt), fa = th / (2 * Math.PI) * nSt - si, [x, y] = at(u, v), L = lit(th);
    let k = 3 + (L > 0.5 ? 1 : L < -0.6 ? -1 : 0) + (pxHash(si, seed + 3) > 0.7 ? -1 : 0);
    if (fa < 0.1) k = 0; else if (z === 0) k -= 1; else if (z === Z.rim - 1) k += 1;
    pput(x, y - z, z === Z.rim - 1 && pxHash(si, seed + 5) > 0.72 ? mossC[4] : stoneC[clamp(k, 0, 5)], 1);
  }
  // the rim's top and the water inside it
  const [tx, ty] = at(SPRING.lip, pv), tyW = ty - (Z.rim - 1);
  for (let a = -R; a <= R; a += step) for (let b = -R; b <= R; b += step) {
    const d = Math.hypot(a, b);
    if (d > R || pu + a < wallU) continue;
    const th = Math.atan2(b, a);
    if (d > pr) {
      const si = Math.floor(((th + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * nSt), fa = ((th + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * nSt - si, [x0, y0] = at(pu + a, pv + b), y = y0 - Z.rim, L = lit(th);
      const mossy = pxNoise(x0 * 0.25, y * 0.25 + seed) + (a < 0 ? 0.2 : 0) + (L > 0 ? 0.1 : -0.1) > 0.78;
      let k = 4 + (pxHash(si, seed + 1) > 0.6 ? 1 : 0) - (L < -0.5 ? 1 : 0);
      if (fa < 0.09) k = 1; else if (d < pr + step * 1.5) k = a + b < 0 ? 1 : 3; else if (d > R - step * 1.5) k -= 1;
      pput(x0, y, mossy && fa >= 0.09 ? mossC[L > 0 ? 5 : 4] : stoneC[clamp(k, 0, 5)], 1);
      continue;
    }
    const [x0, y0] = at(pu + a, pv + b), x = Math.round(x0), y = Math.round(y0 - (Z.rim - 1)), dn = d / pr + (bay(x, y) - 0.5) * 0.18;
    // deep in the middle, pale over the stones at the edge, in shadow under the back of the rim, a pale line where it meets the front
    let c = aq[dn < 0.5 ? 5 : dn < 0.82 ? 4 : 3];
    if (dn > 0.9 && a + b < 0) c = aq[5]; else if (dn > 0.93) c = aq[2];
    // the trickle's reflection: a bright streak below where it lands, broken up
    else if (Math.abs(x - Math.round(tx)) <= (wall > 90 ? 1 : 0) && y > tyW + 1 && y < tyW + pr * hh * 1.1 && (y + Math.round(tx)) % 3) c = aq[(y - tyW) % 2 ? 2 : 3];
    else if (pxHash(x, y + seed) > 0.95) c = aq[3];
    pput(x, y, c, 2);
  }
  // the trickle: a thread off the lip's edge down to the water, shimmering in two blues, and a little splash where it lands
  for (let y = Math.round(ty - Z.lip) + 1; y <= tyW; y++) { put(tx, y, aq[y % 3 ? 1 : 2]); if (wall > 90) put(tx + 1, y, aq[y % 3 ? 2 : 3]); }
  for (const [dx, dy, k] of [[-2, 0, 1], [2, 0, 1], [-1, -1, 0], [1, -2, 0], [3, -1, 2], [-3, 1, 2]]) put(tx + dx, tyW + dy, aq[k]);
  // a fern at its left and two small glowcaps on the rock, glowing over the water
  { const [x, y] = pt("L", pv + R + 0.02, 0.008); fernAt(x, y, wall * 0.15); }
  { const [x, y] = pt("L", pv + 0.04, 0.012, Z.rock * 0.8); capAt(Math.round(x), Math.round(y), Math.round(3 * U), 2.4 * U, capB); }
  { const [x, y] = pt("L", pv - 0.065, 0.014, Z.rock * 0.3); capAt(Math.round(x), Math.round(y), Math.round(2 * U), 1.8 * U, capP); }

  // ---- the beds: raised against the wall in two courses of stone, soil, and what grows in them
  const D = 0.05, rimO = 0.015;
  const bed = (side, s0, s1, sk) => {
    for (let s = s0; s <= s1; s += step) for (let o = 0; o <= D - rimO; o += step) {
      const [x, y] = pt(side, s, o, kz - 1), cl = pxHash(Math.round(x), Math.round(y) + sk);
      put(x, y, dirt[o < 0.008 ? 0 : cl > 0.82 ? 3 : cl < 0.25 ? 1 : 2]);
    }
    // the stones, course by course, each its own length and shade: a lit top and left edge, a cool shadow on its bottom and
    // right, dark joints between; moss creeping over the tops of some
    const ch = Math.ceil(kz / 2), lit = side === "L";   // (a bed's front on the left wall faces the light; on the right one it's in shade)
    const courses = [0, 1].map(r => { const c = [-Math.round(pxHash(r, sk + 9) * 6 * U)]; while (c[c.length - 1] < (s1 - s0) * hw + 2) c.push(c[c.length - 1] + Math.round((7 + 6 * pxHash(c.length + r * 17, sk)) * U)); return c; });
    const stoneOf = (r, p) => { const c = courses[r]; let i = 0; while (c[i + 1] <= p) i++; return [i + r * 50, p - c[i], c[i + 1] - c[i]]; };
    for (let s = s0; s <= s1; s += step) {
      for (let o = D - rimO; o <= D; o += step) { const [x, y] = pt(side, s, o, kz); const [i] = stoneOf(1, (s - s0) * hw); put(x, y, pxHash(i, Math.round(o * 400)) > 0.5 && pxHash(i, sk + 2) > 0.45 ? mossC[5] : stoneC[5]); }
      for (let z = 0; z < kz; z++) {
        const r = Math.min(1, Math.floor(z / ch)), fz = z - r * ch, [i, fa, L] = stoneOf(r, (s - s0) * hw), shade = pxHash(i, sk + 1);
        const bv = Math.max(1.5, U), leftEdge = lit ? fa > L - bv : fa < bv, rightEdge = lit ? fa < bv : fa > L - bv, [x, y] = pt(side, s, D, z);
        let k = (lit ? 3 : 2) + (shade > 0.66 ? 1 : shade < 0.3 ? -1 : 0);
        if (fa < 0.8 || fz === 0 && r) k = 0;
        else if (fz >= ch - Math.max(1, Math.round(U * 0.8)) || z === kz - 1 || leftEdge) k += 1;
        else if (fz <= (r ? 1 : 0) || rightEdge) k -= 1;
        if (r === 1 && z >= kz - 1 - Math.round(2 * pxHash(i, sk + 2)) && fa > 1 && fa < L - 1 && shade > 0.45) { put(x, y, mossC[z === kz - 1 ? 5 : 4]); continue; }
        // grit and pits in the stone's face, and its corners worn round
        const g = pxHash(Math.round(x) * 3, Math.round(y) + sk);
        if (k > 0 && g > 0.9) k -= 1; else if (k > 0 && g < 0.06) k += 1;
        if ((fa < 1.8 || fa > L - 1.8) && (fz < 1.2 || fz > ch - 1.8) && k > 0) k = 1;
        put(x, y, stoneC[clamp(k, 0, 5)]);
      }
    }
    // the end of the bed toward the room's front: the stones turned the other way to the light
    for (let o = 0; o <= D; o += step) for (let z = 0; z <= kz; z++) {
      const [x, y] = pt(side, s1, o, z), fz = z % ch;
      put(x, y, stoneC[o < step * 2 || fz === 0 && z ? 0 : z >= kz - 1 || fz === ch - 1 ? 5 : lit ? 2 : 3]);
    }
    // what grows in it, from the back of the bed to the front
    const n = Math.max(4, Math.round((s1 - s0) * hw / (6.5 * U)));
    for (let k = 0; k < n; k++) {
      const s = s0 + (k + 0.25 + 0.5 * pxHash(k, sk)) / n * (s1 - s0), [x0, y0] = pt(side, s, D * 0.45, kz - 1), x = Math.round(x0), y = Math.round(y0), r = pxHash(k + 7, sk);
      const kind = ["fern", "cap", "flowers", "caps", "fern", "flowers", "cap"][(k + sk) % 7];
      if (kind === "fern") fernAt(x, y, wall * (0.16 + 0.08 * r));
      else if (kind === "cap") { const cr = (2.6 + 1.8 * r) * U; capAt(x, y, Math.round(cr * (0.9 + 0.7 * r)), cr, r > 0.65 ? capP : capB); }
      else if (kind === "caps") { capAt(x - Math.round(2 * U), y, Math.round(5 * U), 3 * U, capB); capAt(x + Math.round(2.5 * U), y + 1, Math.round(2.5 * U), 2 * U, capP); }
      else for (let f = 0; f < 3; f++) flowerAt(x + Math.round((f - 1) * 3 * U), y + (f % 2), Math.round((4 + 5 * pxHash(f, k + sk)) * U), CAVE_FLOWERS[(k + f + sk) % CAVE_FLOWERS.length]);
      tuft(x + Math.round(3 * U), y + 1);
    }
  };
  bed("L", ...MOSS_GARDEN.bedL, 3);
  bed("R", ...MOSS_GARDEN.bedR, 5);
  }

  // ---- glowcaps where a cave grows crystals, at both ends of the walls, with a fern beside them; a big fern in the back corner
  const clump = (x, y, n, big) => {
    fernAt(x - 5 * U, y, wall * 0.14);
    for (let k = 0; k < n; k++) { const r = pxHash(k, Math.round(x)), cr = (big ? 2.6 + 2.4 * r : 2 + 1.6 * r) * U; capAt(Math.round(x + (k - (n - 1) / 2) * 5 * U), Math.round(y + (k % 2)), Math.round(cr * (0.9 + 0.8 * r)), cr, k % 3 === 2 ? capP : capB); }
  };
  { const [x, y] = at(0.02, 0.02); fernAt(x, y, wall * 0.2); }
  clump(...at(0, 0.95), 2, false);
  clump(...at(0.95, 0), 2, false);
  // the moss's own sparkle: a few pale spores resting on it, in the light
  for (let k = 0; k < 18; k++) { const u = 0.15 + 0.6 * pxHash(k, seed + 41), v = 0.15 + 0.6 * pxHash(seed + 42, k), [x, y] = at(u, v); if (Math.hypot(u - lu, v - lv) < 0.3) put(x, y, pxHex("#fffbe6")); }
  return pool.size ? springSprite(pool, d, w) : null;
}
/** The spring's pool cut out of the finished room, as it was painted (its rim, and its water), in art pixels from (x0, y0): laid
 *  again over the lower half of a glowling sitting in it, the water in front of its body (see springFront). */
function springSprite(pool, d, w) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const i of pool.keys()) { const x = i % w, y = (i - x) / w; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const make = k => {
    const c = document.createElement("canvas"); c.width = x1 - x0 + 1; c.height = y1 - y0 + 1;
    const g = c.getContext("2d"), img = g.createImageData(c.width, c.height);
    for (const [i, t] of pool) if (t === k) { const x = i % w, y = (i - x) / w, j = ((y - y0) * c.width + x - x0) * 4; img.data.set([d[i * 4], d[i * 4 + 1], d[i * 4 + 2], 255], j); }
    g.putImageData(img, 0, 0); return c;
  };
  return { x0, y0, rim: make(1), water: make(2) };
}
/** The stained-glass lantern in the crypt's niche: an iron cage, rose, blue, amber and violet panes round a white flame. */
const GLASS_LANTERN = [
  "...k...",
  "..khk..",
  ".kmhmk.",
  "kmmmmmk",
  "kRrkBbk",
  "kRWkWbk",
  "kRrkBbk",
  "kmmmmmk",
  "kYykPpk",
  "kYWkWpk",
  "kmmmmmk",
  ".kmmmk.",
];
/**
 * What makes each cave at home its own mood, drawn into the room (none of it is furniture, and none of it is in the way of the
 * tunnels): the lights that pool on its walls and floor (pushed onto lights, for paintRoomIso to shine), the things the light
 * falls on, and, in the function it returns, the things that shine themselves, drawn after the light so it doesn't wash them out.
 * The crystal caves' crystals glow; the gallery hangs a lantern on its posts; the crypt has a candle at the foot of each column
 * and a blind niche with a stained-glass lantern where a window would be; the moonwell has fallen blocks under moss and the moon
 * down its well; the aurora's cave glows green and pink from its vault of ice. (The glowcap grotto is the moss garden's: paintMossGarden.)
 */
function paintMood({ mood, put, d, w, h, at, cx, top, hw, hh, wall, S, seed, lights, art, crys, oak, ashlar, ice, wallC, plH }) {
  const glow = art.glow, pt = (side, s, o, z = 0) => { const [x, y] = side === "L" ? at(o, s) : at(s, o); return [x, y - z]; };
  const get = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return null; const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const tint = (x, y, col, k) => { const c0 = get(x, y); if (c0) put(x, y, mixHex(c0, col, k)); };
  const bay = (x, y) => PX_BAYER[(Math.round(y) & 3) * 4 + (Math.round(x) & 3)];
  const halo = (x0, y0, R, col, k) => { const c = pxHex(col); for (let y = Math.floor(y0 - R); y <= y0 + R; y++) for (let x = Math.floor(x0 - R); x <= x0 + R; x++) { const dd = Math.hypot(x - x0, y - y0) / R + (bay(x, y) - 0.5) * 0.25; if (dd < 1) tint(x, y, c, dd < 0.45 ? k : k * 0.45); } };
  const ink = pxHex("#0b0614"), white = pxHex("#fffbe6");
  /** A block on the floor, u0..u1 by v0..v1 and hgt high, in a ramp: its top lit, the face toward the left in half light, the
   *  one toward the right in shade, each edge a step lighter or darker, a dark outline, moss over its top if it's mossy. */
  const block = (u0, v0, u1, v1, hgt, ramp, mossTop, sk) => {
    const st = 0.4 / hw, n = ramp.length - 1, tone = (k, x, y) => ramp[clamp(Math.round(k * n), 0, n)];
    for (let u = u0; u <= u1; u += st) for (let z = 0; z <= hgt; z++) { const [x, y] = at(u, v1); put(x, y - z, tone(z === hgt ? 0.75 : z === 0 || u > u1 - st * 2 ? 0.08 : u < u0 + st * 3 ? 0.62 : 0.48 + 0.08 * (pxHash(Math.round(x), z + sk) > 0.8), x, y)); }
    for (let v = v0; v <= v1; v += st) for (let z = 0; z <= hgt; z++) { const [x, y] = at(u1, v); put(x, y - z, tone(z === hgt ? 0.55 : z === 0 || v < v0 + st * 2 ? 0.06 : v > v1 - st * 3 ? 0.4 : 0.28, x, y)); }
    for (let u = u0; u <= u1; u += st) for (let v = v0; v <= v1; v += st) {
      const [x, y] = at(u, v), m = mossTop && pxFbm(u * 40 + sk, v * 40) > 0.42;
      const edge = u < u0 + st * 2 || v < v0 + st * 2, rim = u > u1 - st * 2 || v > v1 - st * 2;
      put(x, y - hgt, m ? MOSS_HEX[rim ? 5 : edge ? 3 : 4 + (pxHash(Math.round(x), Math.round(y)) > 0.85)] : tone(edge ? 0.62 : rim ? 0.95 : 0.82, x, y));
    }
    // moss trailing over the lit front edge
    if (mossTop) for (let u = u0; u <= u1; u += st) { const [x, y] = at(u, v1); if (pxFbm(u * 40 + sk, v1 * 40) > 0.42) { const len = 1 + Math.round(pxHash(Math.round(x), sk) * 3 * S); for (let k = 0; k < len; k++) put(x, y - hgt + 1 + k, MOSS_HEX[k ? 3 : 4]); } }
  };
  const after = [];
  if (mood === "crystal" || mood === "moonwell" || mood === "aurora") {
    // the crystals at the foot of the walls glow, a cool pool round each clump
    for (const [u, v] of [[0.02, 0.02], [0, 0.92], [0.92, 0]]) lights.push({ u, v, z: 8 * S, r: hw * 0.36, col: glow, k: 0.75 });
  }
  if (mood === "gallery") {
    // a lantern on the inner side of the middle posts, warm light all round it; a crate of tools in the back corner
    const lz = Math.round(wall * 0.58);
    for (const [side, f] of [["L", SHORE_AT[1]], ["R", SHORE_AT[1]], ["L", SHORE_AT[2]]]) {
      lights.push(side === "L" ? { u: 0.03, v: f - 0.03, z: lz - 10 * S, r: hw * 0.42, col: "#f2b45a", k: 0.9 } : { u: f - 0.03, v: 0.03, z: lz - 10 * S, r: hw * 0.42, col: "#f2b45a", k: 0.9 });
      after.push(() => {
        // (an oil lantern: its glass amber round a white flame)
        const [x0, y0] = pt(side, f, 0, lz), flip = side === "R", ironC = { k: IC.m4, m: IC.m3, h: IC.m2, W: pxHex("#fffbe6"), A: pxHex("#f6c46a"), B: pxHex("#e08a35") };
        halo(x0 + (flip ? -8 : 8), y0 + 13, 7 * S, "#f6d488", 0.3);
        // (on the right wall the bracket reaches the other way)
        LANTERN.forEach((row, r) => [...row].forEach((ch, k) => { if (ironC[ch]) put(flip ? x0 - k : x0 + k, y0 + r - 1, ironC[ch]); }));
      });
    }
    block(0.03, 0.04, 0.11, 0.12, Math.round(8 * S), oak, false, 3);
    { const [x, y] = at(0.07, 0.04); for (let z = 0; z < 16 * S; z++) put(x + Math.round(z * 0.3), y - Math.round(8 * S) - z, z > 14 * S ? IC.m2 : oak[z % 5 ? 3 : 2]); const [hx, hy] = [x + Math.round(16 * S * 0.3), y - Math.round(24 * S)]; for (let k = -3; k <= 3; k++) put(hx + k, hy + Math.abs(k) * 0.4, k < 0 ? IC.m2 : IC.m3); }
  }
  if (mood === "crypt") {
    // a candle at the foot of each column, on the plinth's ledge, its light round it
    for (const side of ["L", "R"]) for (const f of COLUMN_AT) {
      const s0 = f + 0.05;
      lights.push(side === "L" ? { u: 0.02, v: s0, z: plH + 6 * S, r: hw * 0.34, col: "#eec26a", k: 0.95 } : { u: s0, v: 0.02, z: plH + 6 * S, r: hw * 0.34, col: "#eec26a", k: 0.95 });
      after.push(() => {
        // three candles of different heights, wax lit on its left, a drip, a flame with a hot heart
        for (const [ds, hgt] of [[0, 7], [0.022, 4], [-0.018, 5]]) {
          const [x, y] = pt(side, s0 + ds, 0.012, plH), tall = Math.round(hgt * Math.max(1, S)) + 1;
          halo(x, y - tall - 1, 6 * Math.max(1, S), "#eec26a", 0.22);
          for (let k = 0; k < tall; k++) { put(x - 1, y - k, pxHex("#f4f0ff")); put(x, y - k, pxHex("#d6d0dc")); put(x + 1, y - k, pxHex("#9a94a6")); }
          put(x - 1, y - tall + 2, pxHex("#ffffff")); put(x, y - tall, ink);
          put(x, y - tall - 1, pxHex("#e0634f")); put(x, y - tall - 2, pxHex("#eec26a")); put(x, y - tall - 3, pxHex("#fff0b5"));
        }
      });
    }
    // the blind niche: a pointed arch sunk into the left wall's courses, its jamb in shade and its sill lit, a ring of voussoirs
    // round it; the lantern on its sill throws coloured light over the stone and the floor below
    const wn = Math.round(hw * 0.06), z0 = plH, z1 = z0 + Math.round(wn * 2.4), D = Math.max(2, Math.round(3 * S));
    const arch = (a, z, ww) => z >= z0 && Math.abs(a) < ww && (z < z1 || Math.hypot(Math.abs(a) + ww, z - z1) < 2 * ww);
    const xc = cx - NICHE_AT * hw, foot = x => top + (cx - x) / hw * hh;
    for (let x = Math.floor(xc - wn - 6); x <= xc + wn + 6; x++) for (let y = Math.floor(foot(x) - z1 - wn * 2 - 6); y <= foot(x) - z0; y++) {
      const a = (cx - x) / hw * hw - NICHE_AT * hw, z = foot(x) - y;
      if (arch(a, z, wn)) {
        if (arch(a + D, z - D, wn)) put(x, y, isoTone(ashlar, 0.14 + 0.06 * (pxHash(x, Math.floor(z / 6)) > 0.5), x, y));
        else put(x, y, isoTone(ashlar, z - z0 < D + 1 ? 0.7 : a > 0 ? 0.24 : 0.36, x, y));
      } else if (arch(a, z, wn + 1)) put(x, y, isoTone(ashlar, a > 0 || z > z1 ? 0.84 : 0.5, x, y));
      else if (arch(a, z, wn + 4) && z > z0 + 2) {
        const jt = z < z1 ? (z - z0) % 7 === 0 : Math.abs(((Math.atan2(z - z1, Math.abs(a) + wn) / 0.2) % 1) - 0.5) > 0.4;
        put(x, y, isoTone(ashlar, jt ? 0.1 : a > 0 ? 0.62 : 0.46, x, y));
      } else if (arch(a, z, wn + 5) && z > z0 + 2) put(x, y, isoTone(ashlar, 0.08, x, y));
    }
    lights.push({ u: 0.04, v: NICHE_AT, z: z0 + 8 * S, r: hw * 0.42, col: "#d98ad0", k: 0.85 });
    after.push(() => {
      const lx = Math.round(xc - 3 - D / 2), ly = Math.round(foot(xc) - z0 - D - GLASS_LANTERN.length + 1);
      halo(lx + 3, ly + 6, wn * 1.2, "#e6a8d8", 0.3);
      const C = { k: IC.m4, m: IC.m3, h: IC.m2, W: white, R: pxHex("#e88bb1"), r: pxHex("#c25586"), B: pxHex("#69b7d6"), b: pxHex("#3383a8"), Y: pxHex("#fff0b5"), y: pxHex("#eec26a"), P: pxHex("#ad91e6"), p: pxHex("#6b4fa8") };
      GLASS_LANTERN.forEach((row, r) => [...row].forEach((ch, k) => { if (C[ch]) put(lx + k, ly + r, C[ch]); }));
      // its panes laid on the floor in front of the niche, a patch of each colour
      for (const [k, col] of [[0, "#c25586"], [1, "#3383a8"], [2, "#eec26a"], [3, "#8a6cc9"]]) for (let du = 0; du < 0.05; du += 0.4 / hw) for (let dv = 0; dv < 0.03; dv += 0.4 / hw) {
        const [x, y] = at(0.05 + du + (k >> 1) * 0.06, NICHE_AT - 0.035 + dv + (k & 1) * 0.035);
        if (pxHash(Math.round(x), Math.round(y)) > 0.25) tint(x, y, pxHex(col), 0.32);
      }
    });
  }
  if (mood === "moonwell") {
    // fallen blocks of dressed stone along the foot of the walls, moss over them, one standing on end like a broken pillar
    const stoneR = ashlar;
    block(0.02, 0.5, 0.1, 0.6, Math.round(7 * S), stoneR, true, 1);
    block(0.1, 0.56, 0.16, 0.62, Math.round(4 * S), stoneR, true, 2);
    block(0.46, 0.02, 0.56, 0.09, Math.round(6 * S), stoneR, true, 4);
    block(0.04, 0.04, 0.1, 0.1, Math.round(26 * S), stoneR, true, 5);
    // the moon's light where it lands, cold
    lights.push({ u: SHAFTS.moon.at[0], v: SHAFTS.moon.at[1], z: 0, r: hw * 0.34, col: "#c9b8ff", k: 1 });
    after.push(() => {
      // the well in the vault: a round hole, the night and the moon in it seen from below, a dark lip and the rock round it lit
      const [kx, ky] = mossCrack(seed, SHAFTS.moon.off), rx = Math.max(5, Math.round(hw * 0.07)), ry = Math.max(3, Math.round(rx * 0.55));
      const sky = ["#0b0614", "#160c26", "#22143a", "#3d2866"].map(pxHex), moon = pxHex("#fff8d6");
      halo(kx, ky, rx * 2.4, "#c9b8ff", 0.22);
      for (let y = ky - ry - 2; y <= ky + ry + 2; y++) for (let x = kx - rx - 2; x <= kx + rx + 2; x++) {
        const e = Math.hypot((x - kx) / rx, (y - ky) / ry);
        if (e < 1) {
          const md = Math.hypot(x - kx - rx * 0.25, y - ky + ry * 0.1) / (rx * 0.42);
          put(x, y, md < 1 ? (md > 0.75 && pxHash(x, y) > 0.5 ? pxHex("#d2bfff") : moon) : pxHash(x, y + seed) > 0.95 ? white : sky[e > 0.8 ? 0 : y < ky ? 2 : 1]);
        } else if (e < 1.35) put(x, y, y > ky ? wallC[0] : wallC[Math.min(wallC.length - 1, 5)]);
      }
    });
  }
  if (mood === "aurora") {
    // the northern lights through the ice light the walls high up and lay a cold green on the floor
    for (const [side, f, col] of [["L", 0.3, "#6fe0b0"], ["R", 0.5, "#6fe0b0"], ["L", 0.75, "#e88bc8"], ["R", 0.15, "#8ff0c8"]]) {
      lights.push(side === "L" ? { u: 0, v: f, z: wall * 0.9, r: hw * 0.55, col, k: 0.8 } : { u: f, v: 0, z: wall * 0.9, r: hw * 0.55, col, k: 0.8 });
    }
  }
  return () => after.forEach(f => f());
}
/** Where a room's own fixtures keep clear of along each wall (a share of its length from the back corner): the tunnels' mouths
 *  low down near the front end (DOOR_AT), whichever wall they're cut in. */
const FIXTURE_CLEAR = [DOOR_AT - DOOR_W - 0.05, DOOR_AT + DOOR_W + 0.05];
/** The playroom's bright paints: each a lit, a mid and a shaded tone. */
const PLAY_PAINT = [["#ffc4dc", "#ff7eb6", "#c24d86"], ["#fff2a8", "#ffd84a", "#c99a1e"], ["#c4f4fb", "#5fd3e8", "#2d8fb0"], ["#cdf5b4", "#7ee07a", "#3c9a4a"], ["#e2d2ff", "#b48cff", "#6f4fc0"], ["#ffd6b0", "#ff9f4a", "#c4602a"]].map(r => r.map(pxHex));
/**
 * What each room at home is for, built into its walls whatever look it has (none of it is furniture: it takes no slot, can't be
 * moved, and keeps to the walls, the wall tops and the very foot of them, clear of the tunnels and of the tiles furniture
 * stands on), drawn in the look's own crystals and rock. The crystal study grows crystals everywhere: big clusters in the back
 * corner and along the foot of the walls, points hanging from the top of the rock, a vein across the right wall into a geode
 * that glows; the playroom has a slide standing by the back of the left wall, a ladder up to its deck, onto a landing mat, a climbing board with a
 * bell over a crash mat at the back of the right one (the back corner's floor is theirs: ROOM_KEEPS), a chalk slate and a low
 * shelf of toys under the window, and bunting along the top; in the moss garden moss creeps up the walls in any look (its beds, its
 * spring and its shaft of light are the garden's own already: paintMossGarden, roomShaft). The nest keeps its bed corner.
 * Lights go onto lights before paintRoomIso shines them; what shines itself is drawn in the function it returns.
 */
function paintFixtures(room, { put, d, w, h, at, cx, top, hw, hh, wall, S, seed, lights, art, crys, mossC, mossy, tops }) {
  const get = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return null; const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const bay = (x, y) => PX_BAYER[(Math.round(y) & 3) * 4 + (Math.round(x) & 3)];
  // a spot on a wall: s along it from the back corner, z up, o out from it across the floor
  const P = (side, s, z = 0, o = 0) => { const [x, y] = side === "L" ? at(o, s) : at(s, o); return [x, y - z]; };
  // and a little drawing on a wall's face round such a spot: a along the wall (toward the front), b up, in art pixels
  const onWall = (side, s, z) => { const [x0, y0] = P(side, s, z); return (a, b) => [x0 + (side === "L" ? -a : a), y0 + a / 2 - b]; };
  const clear = s => s < FIXTURE_CLEAR[0] || s > FIXTURE_CLEAR[1];
  const lightAt = (side, s, z, r, col, k) => lights.push(side === "L" ? { u: 0.02, v: s, z, r, col, k } : { u: s, v: 0.02, z, r, col, k });
  /** A soft glow the way the moss garden's is drawn (see pxGlow): see-through, in three clean steps, dithered only between them. */
  const glow = (x0, y0, R, col, k = 1) => {
    for (let y = Math.floor(y0 - R); y <= y0 + R; y++) for (let x = Math.floor(x0 - R); x <= x0 + R; x++) {
      const dd = Math.hypot(x - x0, y - y0) / R; if (dd >= 1) continue;
      const lv = Math.floor((1 - dd) * (1 - dd * 0.35) * 3.2 + (bay(x, y) - 0.5) * 0.9), c0 = lv > 0 && get(x, y);
      if (!c0) continue;
      const a = [0, 0.18, 0.31, 0.45][Math.min(3, lv)] * k;
      put(x, y, c0.map((c, i) => Math.round(255 - (255 - c) * (1 - col[i] / 255 * a))));
    }
  };

  if (room === "study") {
    const cr = crys, gl = pxHex(art.glow || art.crystal[3]), tips = [];
    /** One crystal: a six-sided point from (bx, by) leaning a radians off upright (π hangs it down), its left faces lit,
     *  its right in shade, a dark edge, a pale tip and now and then a glint down its lit face. */
    const point = (bx, by, len, a, r) => {
      const sx = Math.sin(a), sy = -Math.cos(a), cut = len * 0.72;
      for (let t = 0; t <= len; t += 0.5) {
        const wd = t < cut ? r : r * (len - t) / (len - cut);
        for (let e = -wd; e <= wd; e += 0.5) {
          const x = bx + sx * t - sy * e, y = by + sy * t + sx * e, side = sy < 0 ? e : -e;
          put(x, y, Math.abs(e) > wd - 0.7 ? cr[0] : t >= cut ? (side < 0 ? cr[4] : cr[3]) : side < -wd * 0.35 ? (Math.abs(side + wd * 0.6) < 0.5 && pxHash(Math.round(t), Math.round(bx)) > 0.6 ? cr[4] : cr[3]) : side <= wd * 0.3 ? cr[2] : cr[1]);
        }
      }
      tips.push([bx + sx * len, by + sy * len]);
    };
    /** A cluster: n points fanning out of one spot, the longest in the middle, drawn back ones first. */
    const cluster = (bx, by, size, n, k, lean = 0, down = false) => {
      const order = [...Array(n).keys()].sort((i, j) => Math.abs(j - (n - 1) / 2) - Math.abs(i - (n - 1) / 2));
      for (const i of order) {
        const f = n > 1 ? i / (n - 1) - 0.5 : 0, j = pxHash(i + k, seed);
        const len = size * (1 - Math.abs(f) * 0.9) * (0.75 + 0.35 * j), a = lean + f * 1.5 + (j - 0.5) * 0.25;
        point(bx + f * size * 0.5, by + Math.abs(f) * 2, Math.max(3, len), down ? Math.PI - a : a, Math.max(1.5, size * 0.11 * (1 - Math.abs(f) * 0.4)));
      }
    };
    // the great clusters: the back corner, and along the foot of each wall (leaning out of the rock into the room)
    // (sized to the room, but never so small on a phone that they stop reading as crystals)
    const K = Math.max(0.85, S);
    cluster(...P("L", 0.012, 0, 0.012), 46 * K, 9, 1, 0.05);
    cluster(...P("L", 0.07, 0, 0.008), 24 * K, 5, 3, -0.45);
    cluster(...P("R", 0.07, 0, 0.008), 26 * K, 5, 4, 0.45);
    for (const [side, s, n, sz] of [["L", 0.22, 6, 30], ["L", 0.5, 4, 20], ["L", 0.96, 5, 26], ["R", 0.28, 5, 24], ["R", 0.57, 6, 32], ["R", 0.96, 4, 22]]) {
      if (!clear(s)) continue;
      cluster(...P(side, s, 0, 0.008), sz * K, n, Math.round(s * 100) + (side === "L" ? 0 : 50), side === "L" ? -0.3 : 0.3);
      lightAt(side, s, 8 * K, hw * 0.3, art.glow, 0.7);
    }
    // and a few growing out of the rock higher up, leaning out and up
    for (const [side, s, z, sz] of [["L", 0.12, 0.62, 16], ["R", 0.2, 0.74, 14], ["R", 0.8, 0.6, 15], ["L", 0.82, 0.66, 13]]) cluster(...P(side, s, wall * z), sz * K, 4, Math.round(s * 77), side === "L" ? -0.6 : 0.6);
    lightAt("L", 0.02, 14 * S, hw * 0.42, art.glow, 0.9);
    // small points all along the foot of both walls, between the clusters
    for (let k = 0; k < 22; k++) {
      const side = k % 2 ? "R" : "L", s = 0.05 + 0.92 * pxHash(k, seed + 31);
      if (!clear(s)) continue;
      const [x, y] = P(side, s, 0, 0.006);
      point(x, y + 1, (4 + 7 * pxHash(seed, k)) * K + 1, (side === "L" ? -0.35 : 0.35) + (pxHash(k, 3) - 0.5) * 0.6, 1.6 * K);
    }
    // points hanging from the top of the rock, more toward the back
    for (let x = Math.floor(cx - hw) + 2; x < cx + hw - 2; x++) {
      const tt = Math.abs(x - cx) / hw, yt = tops[x];
      if (Number.isNaN(yt) || pxHash(x, seed + 41) > 0.13 - 0.07 * tt) continue;
      point(x, yt + 1, (5 + 16 * pxHash(x + 7, seed) ** 2 * (1 - tt * 0.5)) * K + 2, Math.PI + (pxHash(x, 5) - 0.5) * 0.3, 1.7 * K);
    }
    // a vein of crystal across the right wall, out of the back corner and into a geode, and on beyond it
    const G = { s: 0.47, z: wall * 0.5 }, gr = Math.max(7, Math.round(hw * 0.075)), vein = [[0.02, wall * 0.22], [0.16, wall * 0.3], [0.3, wall * 0.36], [G.s, G.z], [0.58, wall * 0.62], [0.68, wall * 0.72]];
    const veinPts = [];
    for (let k = 0; k < vein.length - 1; k++) {
      const [s0, z0] = vein[k], [s1, z1] = vein[k + 1];
      for (let t = 0; t < 1; t += 0.25 / (hw * (s1 - s0))) {
        const s = s0 + (s1 - s0) * t, z = z0 + (z1 - z0) * t + 3 * S * (pxNoise(s * 30, seed) - 0.5), [x, y] = P("R", s, z), th = Math.max(1, Math.round((1.4 + 1.2 * pxNoise(s * 12, seed + 3)) * K));
        for (let e = -th - 1; e <= th + 1; e++) put(x, y + e, Math.abs(e) > th ? cr[0] : e < 0 ? cr[3] : e === 0 ? cr[2] : cr[1]);
        if (pxHash(Math.round(x), seed + 9) > 0.88) veinPts.push([x, y - th]);
      }
    }
    for (const [x, y] of veinPts) point(x, y, (4 + 5 * pxHash(Math.round(x), 2)) * K, 0.5 + (pxHash(Math.round(y), 4) - 0.5) * 0.6, 1.4 * K);
    // the geode: a round hollow in the rock lined with crystal teeth, darker deep in, its rim of rock lit along the top left
    const [gx, gy] = P("R", G.s, G.z), rx = gr, ry = Math.round(gr * 1.25);
    for (let y = gy - ry - 2; y <= gy + ry + 2; y++) for (let x = gx - rx - 2; x <= gx + rx + 2; x++) {
      const e = Math.hypot((x - gx) / rx, (y - gy - (x - gx) * 0.5) / ry);
      if (e < 1) {
        const ang = Math.atan2(y - gy, x - gx), tooth = (ang * 7 / Math.PI + 8) % 1, inner = 0.45 + 0.25 * Math.abs(tooth - 0.5);
        put(x, y, e < inner ? (e < inner * 0.5 ? cr[4] : cr[3]) : tooth < 0.5 === (x < gx) ? cr[3] : e > 0.9 ? cr[0] : cr[1]);
      } else if (e < 1.3) put(x, y, x < gx && y < gy ? cr[2] : cr[0]);
    }
    lightAt("R", G.s, G.z, hw * 0.4, art.glow, 0.9);
    return () => {
      glow(gx, gy, gr * 3.2, gl, 1);
      glow(...P("L", 0.012, 22 * K, 0.012), 34 * K, gl, 0.9);
      for (const [x, y] of tips) if (pxHash(Math.round(x), Math.round(y)) > 0.55) glow(x, y, 6 * K + 2, gl, 0.7);
      for (const [x, y] of tips) if (pxHash(Math.round(y), Math.round(x)) > 0.8) { const W = pxHex("#ffffff"); put(x, y, W); put(x - 1, y, cr[4]); put(x + 1, y, cr[4]); put(x, y - 1, cr[4]); put(x, y + 1, cr[4]); }
    };
  }

  if (room === "play") {
    // Everything stands where a glowling could reach it and keeps to the back corner's two tiles (ROOM_KEEPS: no furniture
    // there) and the walls under the window; the light falls from the top left, so each thing is lit on its top left and
    // throws a soft dithered shadow down and to the right on the wall, or straight down onto the floor.
    const ink = pxHex("#1a1020"), wood = ["#3a2418", "#6e4a2c", "#9c7046", "#c49a62", "#e2c48c"].map(pxHex), slate = ["#1e222c", "#2b3140", "#394254"].map(pxHex);
    const dim = (x, y, k) => { const c = get(x, y); if (c && bay(x, y) < k * 1.6) put(x, y, c.map(v => Math.round(v * (1 - Math.min(0.55, k))))); };
    const ds = 0.35 / hw;
    /** A padded mat on the floor along a wall: s0..s1 along it, out to o1, t pixels thick, quilted in squares, with a soft
     *  shadow round its foot; its top and its two faces toward the room in the paint's three tones. */
    const mat = (side, s0, s1, o1, c, t) => {
      for (let s = s0 - 0.012; s <= s1 + 0.02; s += ds) for (let o = 0; o <= o1 + 0.025; o += ds) { const [x, y] = P(side, s, 0, o); dim(x, y, 0.32); }
      const q = 0.045;
      for (let z = 0; z <= t; z++) for (let s = s0; s <= s1; s += ds) for (let o = 0; o <= o1; o += ds) {
        const edgeO = o1 - o < ds, edgeS = s1 - s < ds;
        if (z < t && !edgeO && !edgeS) continue;
        const [x, y] = P(side, s, z, o), seam = z === t && (Math.abs(((s - s0) % q) - q / 2) < ds * 0.7 || Math.abs((o % q) - q / 2) < ds * 0.7);
        put(x, y, z === t ? (seam ? c[2] : s - s0 < ds * 2 || o < ds * 2 ? c[0] : c[1]) : z === 0 ? ink : edgeO === (side === "L") ? c[2] : c[1]);
      }
    };
    // ---- the climbing wall: a plywood board bolted to the back of the right wall, one tile wide and as high as two glowlings,
    // coloured holds in three staggered lines up it, and a little brass bell at the top to ring when you get there
    const C0 = 0.02, C1 = 0.175, ch = Math.round(wall * 0.56);
    for (let s = C0; s <= C1 + 0.012; s += ds) for (let z = 0; z <= ch + 2; z++) { const [x, y] = P("R", s, z); if (s > C1 || z < 2) dim(x + 1, y + 1, 0.4); }
    for (let s = C0; s <= C1; s += ds) for (let z = 0; z <= ch; z++) {
      const [x, y] = P("R", s, z), e = s - C0 < ds * 1.5 || z === ch, f = C1 - s < ds * 1.5 || z === 0;
      const seam = z % Math.max(6, Math.round(ch / 4)) === 0, nut = (Math.round(z) % 5 === 2) && Math.abs(((s - C0) * hw) % 4 - 2) < 0.6;
      put(x, y, e ? wood[4] : f ? wood[1] : seam ? wood[2] : nut ? wood[1] : wood[pxHash(Math.round((s - C0) * hw / 3), z >> 2) > 0.5 ? 3 : 2]);
    }
    const rows = Math.max(5, Math.round(ch / (5.5 * S + 2)));
    for (let r = 0; r < rows; r++) for (let k = 0; k < 3; k++) {
      if (pxHash(r * 3 + k, seed + 2) > 0.8) continue;
      const s = C0 + (C1 - C0) * (0.2 + 0.3 * k + (r % 2 ? 0.1 : -0.05) + 0.06 * (pxHash(k, r + seed) - 0.5)), z = ch * (0.08 + 0.84 * (r + 0.5) / rows);
      const c = PLAY_PAINT[Math.floor(pxHash(r * 7 + k, seed + 8) * PLAY_PAINT.length)], [x, y] = P("R", s, z), rr = Math.max(1.5, (1.1 + 0.6 * pxHash(k, r)) * S + 0.4);
      for (let yy = -Math.ceil(rr); yy <= Math.ceil(rr) + 1; yy++) for (let xx = -Math.ceil(rr) - 1; xx <= Math.ceil(rr) + 1; xx++) {
        const e = Math.hypot(xx / (rr + 0.6), yy / rr);
        if (e > 1) { if (e < 1.45 && xx >= 0 && yy >= 0) dim(x + xx + 1, y + yy + 1, 0.5); continue; }
        put(x + xx, y + yy, xx + yy < -rr * 0.5 ? c[0] : xx + yy > rr * 0.7 ? c[2] : c[1]);
      }
    }
    { // the bell on a little bracket over the top
      const [x, y] = P("R", (C0 + C1) / 2, ch + 1), b = Math.max(2, Math.round(1.8 * S)), y1 = y - Math.round(3 * S) - 2, gold = PLAY_PAINT[1];
      for (let yy = y1 - 2; yy < y; yy++) put(x, yy, wood[1]);
      for (let yy = 0; yy <= b * 2; yy++) { const half = Math.round(b * (0.45 + 0.55 * yy / (b * 2))); for (let xx = -half; xx <= half; xx++) put(x + xx, y1 + yy, xx < -half * 0.3 ? gold[0] : xx > half * 0.4 ? gold[2] : gold[1]); }
      put(x, y1 + b * 2 + 1, gold[2]); put(x + b + 1, y1 + b, ink);
    }
    // and its crash mat on the floor under it
    mat("R", 0, 0.19, 0.125, PLAY_PAINT[4], Math.max(2, Math.round(2.4 * S)));

    // ---- the slide: it stands on its own by the back of the left wall, a ladder up to a little deck at its top end, then a run
    // down along the wall toward the room, steep in the middle and flat at both ends, onto a soft landing mat; a red trough with
    // a polished yellow bed and a rail each side, on two pairs of yellow legs with feet on the floor
    const hs = 0.075, hr = Math.max(4, Math.round(hw * 0.04)), hz = wall * 0.46, s1 = 0.285, D = 0.07, side = Math.round(3.5 * S) + 2;
    const zt = hz - hr * 0.55, zl = Math.max(2, Math.round(2.6 * S)) + 1, zOf = s => s <= hs ? zt : s >= s1 ? zl : zl + (zt - zl) * (1 + Math.cos(Math.PI * (s - hs) / (s1 - hs))) / 2;
    mat("L", 0.235, 0.325, 0.15, PLAY_PAINT[2], Math.max(2, Math.round(2.4 * S)));
    { // the ladder at the back end: two yellow rails from the floor to the deck, red rungs a step apart, feet and a shadow
      const sl = hs - 0.035, step = Math.max(3, Math.round(3 * S));
      for (const o of [0.006, D]) {
        { const [fx, fy] = P("L", sl, 0, o); for (let xx = -2; xx <= 3; xx++) dim(fx + xx, fy + 1, 0.5); }
        for (let z = 0; z <= zt + 2; z++) { const [x, y] = P("L", sl, z, o); put(x, y, PLAY_PAINT[1][o > 0.02 ? 1 : 2]); put(x + 1, y, ink); }
      }
      for (let z = step; z < zt; z += step) for (let o = 0.006; o <= D; o += ds) { const [x, y] = P("L", sl, z, o); put(x, y, PLAY_PAINT[0][1]); put(x, y + 1, PLAY_PAINT[0][2]); }
      // the deck between the ladder and the slide's top, with a little rail round its back
      for (let s0 = sl; s0 <= hs; s0 += ds) for (let o = 0; o <= D; o += ds) { const [x, y] = P("L", s0, zt, o); put(x, y, PLAY_PAINT[1][s0 - sl < ds * 1.5 ? 2 : 1]); }
      for (let o = 0; o <= D; o += ds) { const [x, y] = P("L", sl, zt + 3, o); put(x, y, PLAY_PAINT[0][0]); }
      for (let s0 = sl; s0 <= hs; s0 += ds) { const [x, y] = P("L", s0, zt + 3, 0.002); put(x, y, PLAY_PAINT[0][1]); }
      for (let z = 0; z <= zt; z++) { const [x, y] = P("L", sl, z, 0); dim(x - 1, y + 1, 0.35); }
    }
    // its shadow, on the wall under it and straight down on the floor (darker the nearer it runs to the floor)
    for (let s = hs; s <= s1; s += ds) {
      const z = zOf(s);
      for (let k = 1; k <= side + 3 * S; k++) { const [x, y] = P("L", s, z - side - k + 2); dim(x, y, 0.45 * (1 - k / (side + 3 * S + 1))); }
      for (let o = 0; o <= D + 0.015; o += ds) { const [x, y] = P("L", s, 0, o); dim(x, y, 0.42 * (1 - z / zt) + 0.08); }
    }
    // the legs, under its steep part, each with a foot and its shadow
    for (const s of [hs + (s1 - hs) * 0.42, hs + (s1 - hs) * 0.7]) {
      const z = zOf(s) - side;
      for (const o of [0.006, D]) {
        { const [fx, fy] = P("L", s, 0, o); for (let xx = -2; xx <= 3; xx++) dim(fx + xx, fy + 1, 0.5); }
        for (let zz = 0; zz < z; zz++) { const [x, y] = P("L", s, zz, o); put(x, y, PLAY_PAINT[1][o > 0.02 ? 1 : 2]); put(x + 1, y, PLAY_PAINT[1][2]); }
        const [x, y] = P("L", s, 0, o); put(x - 1, y, PLAY_PAINT[1][2]); put(x + 2, y, ink); put(x, y, PLAY_PAINT[1][2]); put(x + 1, y, ink);
      }
    }
    for (let s = hs; s <= s1; s += ds * 0.6) {
      const z = zOf(s), end = s1 - s < ds;
      // the side toward the room, under the lip (and the end of the run-out, where you shoot off onto the mat)
      for (let k = 1; k <= side; k++) { const [x, y] = P("L", s, z - k, D); put(x, y, k === side ? ink : PLAY_PAINT[0][k < 2 ? 1 : 2]); }
      if (end) for (let o = 0; o <= D; o += ds) for (let k = 0; k <= side; k++) { const [x, y] = P("L", s, z - k, o); put(x, y, k === side ? ink : PLAY_PAINT[0][2]); }
      // the trough: its bed polished yellow with a shine down the middle, a red rail along each edge standing up a little
      for (let o = 0; o <= D; o += ds) { const [x, y] = P("L", s, z, o); put(x, y, o > D - ds * 2.5 || o < ds * 2.5 ? PLAY_PAINT[0][1] : Math.abs(o - D * 0.4) < ds * 1.2 ? PLAY_PAINT[1][0] : PLAY_PAINT[1][o < D * 0.4 ? 1 : 2]); }
      for (const o of [0.002, D]) for (let k = 1; k <= 2; k++) { const [x, y] = P("L", s, z + k, o); put(x, y, PLAY_PAINT[0][o > 0.02 ? (k === 2 ? 0 : 1) : 2]); }
    }

    // ---- under the window, at a glowling's height: a slate in a wooden frame with chalk drawings on it (a sun, a glowling, a
    // little house), a ledge with two sticks of chalk, and beside it a low shelf of toys (a striped ball, a stacking tower, a block)
    const B0 = 0.37, B1 = 0.5, bz0 = Math.round(wall * 0.05), bz1 = Math.round(wall * 0.05 + Math.max(10, Math.min(wall * 0.18, (B1 - B0) * hw * 0.62)));
    for (let s = B0; s <= B1 + 0.01; s += ds) for (let z = bz0 - 1; z <= bz1; z++) { const [x, y] = P("L", s, z); if (s > B1 || z < bz0) dim(x + 1, y + 1, 0.4); }
    for (let s = B0; s <= B1; s += ds) for (let z = bz0; z <= bz1; z++) {
      const [x, y] = P("L", s, z), fr = s - B0 < ds * 2.2 || B1 - s < ds * 2.2 || z - bz0 < 2 || bz1 - z < 2;
      put(x, y, fr ? wood[s - B0 < ds * 2.2 || bz1 - z < 1 ? 3 : z - bz0 < 1 ? 1 : 2] : slate[pxFbm(x * 0.2, y * 0.2 + seed) > 0.62 ? 2 : bay(x, y) > 0.85 ? 0 : 1]);
    }
    for (let s = B0 + 0.01; s <= B1 - 0.01; s += ds) { const [x, y] = P("L", s, bz0, 0.012); put(x, y, wood[3]); put(x, y + 1, wood[1]); }
    for (const [s, c] of [[B0 + 0.03, pxHex("#fffbe6")], [B0 + 0.06, pxHex("#ffc4dc")]]) { const [x, y] = P("L", s, bz0 + 1, 0.008); put(x, y, c); put(x - 1, y + 1, c); }
    const chalk = (f, pts, col) => { for (let k = 0; k < pts.length - 1; k++) { const [a0, b0] = pts[k], [a1, b1] = pts[k + 1], n = Math.ceil(Math.hypot(a1 - a0, b1 - b0) * 2) + 1; for (let i = 0; i <= n; i++) { const [x, y] = f(a0 + (a1 - a0) * i / n, b0 + (b1 - b0) * i / n); if (pxHash(Math.round(x), Math.round(y)) > 0.1) put(x, y, col); } } };
    const ring = (r, n = 12) => [...Array(n + 1)].map((_, k) => [Math.cos(k / n * TAU) * r, Math.sin(k / n * TAU) * r]);
    const C = ["#fffbe6", "#ffc4dc", "#fff2a8", "#c4f4fb", "#cdf5b4"].map(pxHex), u = Math.max(1.2, (bz1 - bz0 - 4) / 7.5), bw = (B1 - B0) * hw, mid = bz0 + (bz1 - bz0) / 2;
    { // a sun in the top corner
      const f = onWall("L", B0 + (B1 - B0) * 0.2, bz1 - 2 - 1.6 * u); chalk(f, ring(0.9 * u, 8), C[2]);
      for (let k = 0; k < 8; k++) { const an = k / 8 * TAU; chalk(f, [[Math.cos(an) * 1.4 * u, Math.sin(an) * 1.4 * u], [Math.cos(an) * 1.9 * u, Math.sin(an) * 1.9 * u]], C[2]); } }
    { // a glowling: a round body, two ears, two eyes and a smile
      const f = onWall("L", B0 + (B1 - B0) * 0.47, mid - 0.4 * u); chalk(f, ring(1.7 * u, 12), C[0]); chalk(f, [[-1.2 * u, 1.2 * u], [-1.4 * u, 2.4 * u], [-0.4 * u, 1.6 * u]], C[0]); chalk(f, [[0.4 * u, 1.6 * u], [1.4 * u, 2.4 * u], [1.2 * u, 1.2 * u]], C[0]);
      for (const a of [-0.6, 0.6]) chalk(f, [[a * u, 0.3 * u], [a * u, 0.6 * u]], C[3]);
      chalk(f, [[-0.6 * u, -0.5 * u], [0, -0.85 * u], [0.6 * u, -0.5 * u]], C[1]); }
    { // a little house with a door, and a heart over it
      const f = onWall("L", B0 + (B1 - B0) * 0.79, bz0 + 2.5); chalk(f, [[-1.2 * u, 0], [-1.2 * u, 1.8 * u], [0, 2.9 * u], [1.2 * u, 1.8 * u], [1.2 * u, 0]], C[4]); chalk(f, [[-0.35 * u, 0], [-0.35 * u, 1 * u], [0.35 * u, 1 * u], [0.35 * u, 0]], C[2]);
      if (bw > 30) chalk(onWall("L", B0 + (B1 - B0) * 0.79, bz0 + 2.5 + 4 * u), [[0, -0.6 * u], [-0.7 * u, 0.1 * u], [-0.35 * u, 0.5 * u], [0, 0.2 * u], [0.35 * u, 0.5 * u], [0.7 * u, 0.1 * u], [0, -0.6 * u]], C[1]); }
    // the toy shelf: a plank on two brackets, its shadow on the wall, and the toys standing on it
    const T0 = 0.53, T1 = 0.645, tz = Math.round(Math.max(wall * 0.13, bz0 + 6)), td = 0.03;
    for (let s = T0; s <= T1 + 0.01; s += ds) for (let k = 1; k <= Math.round(3 * S) + 2; k++) { const [x, y] = P("L", s, tz - k); dim(x + 1, y, 0.45 * (1 - k / (3 * S + 3))); }
    for (const s of [T0 + 0.015, T1 - 0.015]) for (let k = 1; k <= Math.round(3 * S) + 1; k++) for (let o = 0; o <= td * (1 - k / (3 * S + 2)); o += ds) { const [x, y] = P("L", s, tz - k, o); put(x, y, wood[1]); }
    for (let s = T0; s <= T1; s += ds) {
      for (let o = 0; o <= td; o += ds) { const [x, y] = P("L", s, tz, o); put(x, y, o > td - ds * 1.5 ? wood[4] : wood[3]); }
      const [x, y] = P("L", s, tz - 1, td); put(x, y, wood[2]); put(x, y + 1, wood[0]);
    }
    { const sit = (s, h) => { const [x, y] = P("L", s, tz + 1, td * 0.5); return [x, y - h]; }, r = Math.max(2, Math.round(2.2 * S));
      // a striped ball
      { const [x, y] = sit(T0 + 0.025, r), red = PLAY_PAINT[0], W = pxHex("#fff8ec");
        for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) { const e = Math.hypot(xx, yy) / (r + 0.4); if (e > 1) continue; const band = Math.abs(yy + xx * 0.4) < r * 0.28; put(x + xx, y + yy, xx + yy < -r * 0.6 ? (band ? W : red[0]) : xx + yy > r * 0.6 ? (band ? pxHex("#d8cfc2") : red[2]) : band ? W : red[1]); }
        put(x - Math.round(r * 0.4), y - Math.round(r * 0.5), W); }
      // a stacking tower: rings getting smaller up a post, a round knob on top
      { const [x, y] = sit(T0 + 0.065, 0), rings = [PLAY_PAINT[2], PLAY_PAINT[3], PLAY_PAINT[1], PLAY_PAINT[5]], rh = Math.max(1, Math.round(1.1 * S));
        rings.forEach((c, k) => { const half = Math.max(1, Math.round((2.4 - k * 0.45) * S + 0.4)); for (let yy = 0; yy < rh + 1; yy++) for (let xx = -half; xx <= half; xx++) put(x + xx, y - k * (rh + 1) - yy, yy === rh ? c[0] : xx < 0 ? c[1] : c[2]); });
        const ty = y - rings.length * (rh + 1); put(x, ty, wood[3]); put(x, ty - 1, PLAY_PAINT[0][1]); put(x + 1, ty - 1, PLAY_PAINT[0][2]); put(x, ty - 2, PLAY_PAINT[0][0]); }
      // a wooden block with a letter on its face
      { const [x, y] = sit(T1 - 0.025, 0), b = Math.max(3, Math.round(2.8 * S)), c = PLAY_PAINT[3];
        for (let yy = 0; yy < b; yy++) for (let xx = 0; xx < b; xx++) put(x - (b >> 1) + xx, y - yy, yy === b - 1 ? c[0] : xx === b - 1 ? c[2] : c[1]);
        put(x - (b >> 1) + (b >> 1), y - (b >> 1), pxHex("#fff8ec")); } }

    // ---- bunting along the top of both walls: a string sagging from peg to peg, a flag of each colour hanging from it (to just
    // past the arches: on a phone held upright the walls' far ends are off the screen)
    for (const side of ["L", "R"]) {
      const pegs = [0.03, 0.25, 0.47, 0.69, 0.9];
      for (let k = 0; k < pegs.length - 1; k++) {
        const s0 = pegs[k], s1 = pegs[k + 1], zs = wall * 0.84, sag = wall * 0.07, line = s => zs - sag * 4 * ((s - s0) / (s1 - s0)) * (1 - (s - s0) / (s1 - s0));
        { const [x, y] = P(side, s0, zs); put(x, y, pxHex("#8a8494")); put(x, y - 1, pxHex("#8a8494")); }
        for (let s = s0; s <= s1; s += 0.3 / hw) { const [x, y] = P(side, s, line(s)); put(x, y, pxHex("#efe4d0")); }
        const n = Math.max(3, Math.round((s1 - s0) * hw / (6 * S + 1)));
        for (let i = 1; i < n; i++) {
          const s = s0 + (s1 - s0) * i / n, c = PLAY_PAINT[(i + k * 2 + (side === "L" ? 0 : 3)) % PLAY_PAINT.length], f = onWall(side, s, line(s)), fw = 2 * S + 0.6, fh = 4.5 * S + 1;
          for (let b = 0; b <= fh; b++) { const half = fw * (1 - b / fh); for (let a = -half; a <= half; a += 0.5) { const [x, y] = f(a, -1 - b); put(x, y, a < -half * 0.3 ? c[0] : a > half * 0.4 ? c[2] : c[1]); } }
          const [x, y] = f(0.8, -2 - fh); dim(x + 1, y + 1, 0.35);
        }
      }
    }
    return null;
  }
  if (room === "garden" && !mossy) {
    // moss creeping up the foot of both walls, thick low down and in tongues higher up, the rock's own light kept under it;
    // a fringe of it under the top of the rock too
    for (let x = Math.floor(cx - hw) + 1; x < cx + hw - 1; x++) {
      const yt = tops[x]; if (Number.isNaN(yt)) continue;
      const tt = Math.abs(x - cx) / hw, base = top + tt * hh, reach = wall * (0.12 + 0.36 * pxFbm(x * 0.05 + seed, 3) + 0.25 * Math.max(0, pxNoise(x * 0.1, seed + 2) - 0.6) / 0.4);
      for (let y = Math.floor(yt); y < base; y++) {
        const z = base - y, under = y - yt;
        const m = z < reach * (0.55 + 0.7 * pxFbm(x * 0.13, z * 0.13 + seed)) || under < wall * 0.05 * (0.4 + pxFbm(x * 0.1, seed + 6));
        const edge = z < reach * 1.15 && pxHash(x, y + seed) > 0.75;
        if (!m && !edge) continue;
        const c0 = get(x, y); if (!c0) continue;
        const L = (c0[0] * 0.3 + c0[1] * 0.55 + c0[2] * 0.15) / 255;
        put(x, y, isoTone(mossC, 0.1 + L * 1.25 + (pxHash(x * 3, y) > 0.9 ? 0.12 : 0), x, y, 0.4));
      }
    }
    return null;
  }
  return null;
}
const mossLight = {};
/**
 * The shaft of light down from the crack in the vault, over everything in the room (whoever stands in it is lit): dithered bands
 * in three steps, brighter in streaks down its middle, and a soft pool where it lands; dust and spores drift up it, and fireflies
 * wander over the beds. With less motion the shaft and the fireflies stand still and nothing drifts.
 */
function drawMossLight(sh = SHAFTS.warm) {
  const seed = caveArt(currentTheme(), true).seed * 7, key = `${W}|${H}|${PX}|${N.isoTop}|${N.isoW}|${N.isoWall}|${seed}|${sh.col}`;
  const q = v => v / PX, hw = q(N.isoW), [kx, ky] = mossCrack(seed, sh.off), [px, py] = isoAt(...sh.at).map(q), wt = Math.max(3, hw * sh.top), wb = hw * sh.bot;
  if (mossLight.key !== key) {
    const w = Math.ceil(W / PX), h = Math.ceil(H / PX), c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data, col = pxHex(sh.col);
    for (let y = Math.max(0, Math.floor(ky)); y < Math.min(h, py + wb); y++) for (let x = Math.max(0, Math.floor(Math.min(kx, px) - wb * 1.4)); x < Math.min(w, Math.max(kx, px) + wb * 1.4); x++) {
      const t = (y - ky) / (py - ky), b = PX_BAYER[(y & 3) * 4 + (x & 3)] - 0.5;
      let I = 0;
      if (t <= 1) {
        const mid = kx + (px - kx) * t, half = wt + (wb - wt) * t, dx = (x - mid) / half;
        if (Math.abs(dx) < 1) I = (1 - dx * dx) * (0.55 + 0.25 * t) * (0.8 + 0.2 * Math.cos(dx * 9 + 1)) * Math.min(1, t * 6 + 0.3);
      }
      const pd = Math.hypot((x - px) / (wb * 1.35), (y - py) / (wb * 0.62));
      if (pd < 1) I = Math.max(I, (1 - pd) * 0.9);
      const lv = Math.floor(I * 3.2 + b * 0.9);
      if (lv <= 0) continue;
      const i = (y * w + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = [0, 46, 80, 116][Math.min(3, lv)];
    }
    g.putImageData(img, 0, 0);
    Object.assign(mossLight, { key, c });
  }
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalCompositeOperation = "screen";
  ctx.drawImage(mossLight.c, 0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
  const calm = opts().calm, s = Math.max(1, Math.round(PX)), tm = game.time / 1000;
  // dust and spores drifting up the light, turning slowly
  if (!calm) for (let k = 0; k < 9; k++) {
    const t = 1 - ((tm * (0.03 + 0.02 * pxHash(k, 3)) + pxHash(k, 5)) % 1), mid = kx + (px - kx) * t, half = wt + (wb - wt) * t;
    const x = (mid + (pxHash(k, 7) - 0.5) * 1.4 * half + Math.sin(tm * 0.7 + k) * 2) * PX, y = (ky + (py - ky) * t) * PX;
    ctx.globalAlpha = 0.5 * Math.sin(t * Math.PI); ctx.fillStyle = sh.flies ? "#fffbe6" : "#f4f0ff"; ctx.fillRect(Math.round(x), Math.round(y), s, s);
  }
  // fireflies over the beds and the spring, blinking; with less motion each glows steady where it is
  if (sh.flies) for (let k = 0; k < 7; k++) {
    const side = k % 2 ? "R" : "L", along = 0.18 + 0.55 * pxHash(k, 11), out = 0.05 + 0.12 * pxHash(k, 13), lift = N.isoWall * (0.15 + 0.3 * pxHash(k, 17));
    let [x, y] = side === "L" ? isoAt(out, along) : isoAt(along, out);
    y -= lift;
    if (!calm) { x += Math.sin(tm * (0.4 + 0.2 * pxHash(k, 19)) + k) * N.base * 0.25; y += Math.sin(tm * 0.53 + k * 2) * N.base * 0.12; }
    const on = calm ? 0.75 : clamp(Math.sin(tm * (1.1 + 0.4 * pxHash(k, 23)) + k * 1.7) * 1.4 + 0.3, 0, 1);
    if (on <= 0) continue;
    ctx.globalAlpha = on * 0.28; ctx.fillStyle = "#d8f58a"; ctx.fillRect(Math.round(x / s) * s - s, Math.round(y / s) * s - s, s * 3, s * 3);
    ctx.globalAlpha = on; ctx.fillStyle = "#f4ffb8"; ctx.fillRect(Math.round(x / s) * s, Math.round(y / s) * s, s, s);
  }
  ctx.restore();
}
// ---------- places that breathe: firelight on the floor and walls, sparks off the anvil, steam from the glass, dust in the window light ----------
// Drawn each frame over the room's baked picture, and small: the light is a baked pool redrawn a little brighter or dimmer, the
// rest a handful of single pixels. With less motion (or on a slow device) only the light stays, breathing slower; nothing flies.

/** Each place's living things, in tiles from its piece's back corner (z in tiles up from the floor): where the fire's light
 *  comes from (the hearth's mouth, the burner's front, a little lower than the flame so the floor gets its share) and how far it reaches, where sparks pop, which glass steams, and the window's light that the dust drifts in (from the
 *  window, u = 0 on the left wall, to where it lands on the floor). */
const BREATH = {
  forge: { fire: { id: "furnace", at: [1.45, 1.45], z: 0.7, r: 3.2, col: "#ffa04e" }, sparks: { id: "anvil", at: [0.5, 0.5], z: 1.4 },
    win: { v: 0.5, z: 0.56, to: [0.17, 0.55], wide: 0.1 } },
  lab: { fire: { id: "labdesk", at: [0.62, 0.8], z: 0.9, r: 2.6, col: "#ffb45e" }, steam: [{ id: "labdesk", at: [0.82, 0.42], z: 2.25, n: 4 }, { id: "labdesk", at: [1.85, 0.3], z: 1.95, n: 2 }],
    win: { v: 0.42, z: 0.5, to: [0.25, 0.5], wide: 0.08 } },
  shop: { win: { v: 0.5, z: 0.56, to: [0.17, 0.55], wide: 0.1 }, sign: { u: 3.75, z: 0.62 }, lamps: true },
  // the snowfields: the hut's window throws its amber on the snow, the spring steams, and smoke curls up from the chimney
  snow: { fire: { id: "runahut", at: [1.55, 1.75], z: 0.45, r: 1.6, col: "#ffb45e" }, steam: [{ id: "hotspring", at: [1, 0.5], z: 0.1, n: 4 }, { id: "runahut", at: [1.35, 0.7], z: 2.2, n: 3 }] },
};
/** At most this many of each in the air at once. */
const BREATH_CAP = { spark: 8, steam: 6, dust: 8 };
const BREATH_DUST = 7, SPARK_EVERY = 0.9, SPARK_LIFE = 0.75;

/** How the fire flickers at t seconds (0 to 1): a few slow waves over one another; with less motion one slow breath. It sets how
 *  far the light reaches (three steps), so the pool's rim creeps in and out. */
const fireFlicker = (t, still) => still ? 0.5 + 0.35 * Math.sin(t * 0.5) : clamp(0.5 + 0.28 * Math.sin(t * 1.7) + 0.14 * Math.sin(t * 3.1 + 1) + 0.08 * Math.sin(t * 5.3 + 2), 0, 1);

/**
 * What breathes in a place at t seconds: its firelight (how bright, and which of three reaches), and the sparks, puffs of steam,
 * motes of dust and the sign's swing, each where it is in the room (u and v across the floor from 0 to 1, z up in art pixels).
 * room: { tile, wall } in art pixels, px screen pixels to an art pixel, and piece(id) → the placed piece { i, j, flip } or nothing.
 */
function placeBreath(kind, t, room, still) {
  const B = BREATH[kind], out = { light: [], spark: [], steam: [], dust: [], lamp: [], sway: 0 };
  if (!B) return out;
  const { tile, wall, piece } = room;
  // a point on a piece, as a place on the floor (a turned piece is mirrored: its two axes swap)
  const spot = (id, [du, dv]) => { const p = piece(id); return p && (p.flip ? [(p.i + dv) / ISO_G, (p.j + du) / ISO_G] : [(p.i + du) / ISO_G, (p.j + dv) / ISO_G]); };
  const inRoom = q => q.u >= 0 && q.v >= 0 && q.u <= 1 && q.v <= 1 && q.z >= 0 && q.z <= wall;
  if (B.fire) {
    const at = spot(B.fire.id, B.fire.at), k = fireFlicker(t, still);
    if (at) out.light.push({ u: at[0], v: at[1], z: B.fire.z * tile, r: B.fire.r * tile, col: B.fire.col, k, step: still ? (k > 0.5 ? 1 : 0) : k > 0.66 ? 2 : k > 0.36 ? 1 : 0 });
  }
  if (still) return out;
  // sparks: now and then the anvil pops a few, which arc out and fall to the floor (this burst and the one before can overlap)
  const S = B.sparks && spot(B.sparks.id, B.sparks.at);
  if (S) for (let n = Math.floor(t / SPARK_EVERY) - 1; n <= Math.floor(t / SPARK_EVERY); n++) {
    if (pxHash(n, 3) < 0.55) continue;
    const t0 = n * SPARK_EVERY + pxHash(n, 5) * 0.3, m = 2 + Math.floor(pxHash(n, 7) * 3);
    for (let k = 0; k < m; k++) {
      const a = t - t0, life = SPARK_LIFE * (0.6 + 0.4 * pxHash(n, k + 11));
      if (a < 0 || a > life) continue;
      const ang = pxHash(n, k + 21) * TAU, sp = (0.5 + pxHash(n, k + 31)) * 0.035, up = (30 + 30 * pxHash(n, k + 41)) / tile;
      const fly = a => ({ u: S[0] + Math.cos(ang) * sp * a * 3, v: S[1] + Math.sin(ang) * sp * a * 3, z: (B.sparks.z + up * a - 4.5 * a * a) * tile });
      // (with where it was a moment ago, for a short streak behind it)
      const q = { ...fly(a), age: a / life, was: fly(Math.max(0, a - 0.05)) };
      if (inRoom(q) && out.spark.length < BREATH_CAP.spark) out.spark.push(q);
    }
  }
  // steam: little puffs leave the glass, grow, curl and thin out as they rise (like the chimney smoke on the map)
  for (const s of B.steam || []) {
    const at = spot(s.id, s.at); if (!at) continue;
    for (let k = 0; k < s.n; k++) {
      const a = (t / 2.6 + k / s.n + pxHash(k, at[0] * 97 | 0) * 0.2) % 1, rise = a * 1.1 * tile;
      const q = { u: at[0] + Math.sin(a * 5 + k * 2.1 + t * 0.6) * 0.012 + a * 0.012, v: at[1] - a * 0.01, z: s.z * tile + rise, age: a };
      if (inRoom(q) && out.steam.length < BREATH_CAP.steam) out.steam.push(q);
    }
  }
  // dust: a few motes drifting slowly down the window's light and out of it, glinting as they turn
  const w = B.win;
  if (w) for (let k = 0; k < BREATH_DUST; k++) {
    const s = (pxHash(k, 51) + t * (0.012 + 0.01 * pxHash(k, 53))) % 1, side = (pxHash(k, 55) - 0.5) * 2 * w.wide;
    const q = { u: w.to[0] * s + Math.sin(t * 0.4 + k) * 0.01, v: w.v + (w.to[1] - w.v) * s + side + Math.sin(t * 0.3 + k * 2) * 0.012,
      z: wall * w.z * (1 - s) + Math.sin(t * 0.5 + k * 1.3) * 2, age: s, glint: Math.max(0, Math.sin(t * 1.3 + k * 2.4)) };
    if (inRoom(q) && out.dust.length < BREATH_CAP.dust) out.dust.push(q);
  }
  // the shop's lanterns flicker, each its own way (with less motion they hang steady: their light is in the room's picture)
  if (B.lamps) { const SH = shopShell(tile * ISO_G, wall, room.px); out.lamp = SH.lamps.map((L, k) => ({ ...L, r: SH.glow, k: fireFlicker(t * 1.4 + k * 2.3, false) })); }
  // the shop's sign swings a little on its bracket
  if (B.sign) out.sway = 0.1 * Math.sin(t * 1.15) + 0.03 * Math.sin(t * 2.6 + 1);
  return out;
}

/** Where each art pixel of the room lies: on the floor (z = 0) or up one of the two walls (u or v = 0), or nowhere in the room.
 *  G is the room in art pixels: { cx, top, hw, hh, wall }. */
function roomSurf(G, x, y) {
  const a = (x - G.cx) / G.hw, b = (y - G.top) / G.hh, u = (a + b) / 2, v = (b - a) / 2;
  if (u >= 0 && v >= 0 && u <= 1 && v <= 1) return [u, v, 0];
  if (a <= 0 && a >= -1) { const z = G.top - a * G.hh - y; return z > 0 && z <= G.wall ? [0, -a, z] : null; }
  if (a > 0 && a <= 1) { const z = G.top + a * G.hh - y; return z > 0 && z <= G.wall ? [a, 0, z] : null; }
  return null;
}
/**
 * A fire's pool of light on the floor and the walls round it, in art pixels: three steps falling off from the fire with a
 * dithered seam between them, cut to the box it can reach (never the whole canvas). grow stretches its reach a little.
 * Returns { x0, y0, w, h, lv } with lv the step (0 to 3) of each pixel in the box.
 */
function breathPool(G, L, grow = 1) {
  const R = L.r * grow, sx = G.cx + (L.u - L.v) * G.hw, sy = G.top + (L.u + L.v) * G.hh;
  const x0 = Math.max(0, Math.floor(sx - R * 1.5)), x1 = Math.min(G.w, Math.ceil(sx + R * 1.5));
  const y0 = Math.max(0, Math.floor(sy - L.z - R - 2)), y1 = Math.min(G.h, Math.ceil(sy + R));
  const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0), lv = new Uint8Array(w * h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const s = roomSurf(G, x + 0.5, y + 0.5); if (!s) continue;
    const dd = Math.hypot((s[0] - L.u) * G.hw, (s[1] - L.v) * G.hw, s[2] - L.z) / R;
    if (dd >= 1) continue;
    lv[(y - y0) * w + x - x0] = clamp(Math.floor((1 - dd) ** 0.8 * 3.6 + (PX_BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * 0.6), 0, 3);
  }
  return { x0, y0, w, h, lv };
}
/** How strongly each step of the pool tints what's under it toward the fire's colour (out of 255). */
const POOL_TINT = [0, 50, 92, 136];

const breath = { at: -1, plan: null, pools: {}, sign: null };
const breathRoom = () => {
  const q = v => v / PX;
  return { cx: q(N.cx), top: q(N.isoTop), hw: q(N.isoW), hh: q(N.isoH), wall: q(N.isoWall), w: Math.ceil(W / PX), h: Math.ceil(H / PX) };
};
/** This frame's plan for the place you're in (worked out once a frame). */
function breathNow() {
  if (breath.at === game.time && breath.kind === save.rooms[save.room]?.kind) return breath.plan;
  const kind = save.rooms[save.room]?.kind, placed = isoLayout().placed;
  breath.at = game.time; breath.kind = kind;
  return breath.plan = placeBreath(kind, game.time / 1000, { tile: N.isoW / ISO_G / PX, wall: N.isoWall / PX, px: PX, piece: id => placed[id] }, opts().calm || quality.low);
}
/** The firelight, right over the room's picture and under everything standing in it. */
function drawPlaceGlow() {
  const plan = breathNow(); if (!plan.light.length) return;
  const G = breathRoom(), was = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (const L of plan.light) {
    const key = `${L.u.toFixed(4)}|${L.v.toFixed(4)}|${L.col}|${W}|${H}|${PX}|${N.isoTop}|${N.isoW}|${N.isoWall}|${L.step}`;
    let P = breath.pools[key];
    if (!P) {
      const pool = breathPool(G, L, [0.92, 1, 1.07][L.step]), c = document.createElement("canvas"); c.width = Math.max(1, pool.w); c.height = Math.max(1, pool.h);
      const g = c.getContext("2d"), img = g.createImageData(c.width, c.height), col = pxHex(L.col);
      pool.lv.forEach((l, i) => { if (l) { img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = POOL_TINT[l]; } });
      g.putImageData(img, 0, 0);
      // (only the three reaches of the places' two fires are ever kept)
      if (Object.keys(breath.pools).length > 12) breath.pools = {};
      P = breath.pools[key] = { c, x: pool.x0 * PX, y: pool.y0 * PX };
    }
    // (the pool's edges creep in and out a step at a time; its strength stays, so only the rim changes, the pixel-art way)
    ctx.globalAlpha = 0.9;
    ctx.drawImage(P.c, P.x, P.y, P.c.width * PX, P.c.height * PX);
  }
  ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = was;
}
/** The sparks, steam and dust, over everything in the place. */
function drawPlaceBreath() {
  const plan = breathNow(), s = Math.max(1, Math.round(PX));
  if (!plan.spark.length && !plan.steam.length && !plan.dust.length && !plan.lamp.length) return;
  const at = q => { const [x, y] = isoAt(q.u, q.v); return [Math.round(x / s) * s, Math.round((y - q.z * PX) / s) * s]; };
  ctx.save(); ctx.imageSmoothingEnabled = false;
  // a lantern's glow round its glass, a little brighter or dimmer as the flame flickers
  for (const q of plan.lamp) { const [x, y] = at(q); pxGlow(x, y, q.r * PX * 1.7, "#f6d488", 0.75 + 0.25 * q.k); }
  for (const q of plan.dust) { const [x, y] = at(q); ctx.globalAlpha = Math.sin(q.age * Math.PI) * (0.25 + 0.5 * q.glint); ctx.fillStyle = "#efe6ff"; ctx.fillRect(x, y, s, s); }
  for (const q of plan.steam) {
    const [x, y] = at(q), r = s * (q.age < 0.35 ? 1 : 2);
    ctx.globalAlpha = (1 - q.age) * 0.5 * Math.min(1, q.age * 6); ctx.fillStyle = "#e4dfe8"; ctx.fillRect(x, y, r, r);
  }
  for (const q of plan.spark) {
    const [x, y] = at(q), [x0, y0] = at(q.was), fade = q.age < 0.7 ? 1 : (1 - q.age) / 0.3;
    if (x0 !== x || y0 !== y) { ctx.globalAlpha = fade * 0.5; ctx.fillStyle = "#c8452f"; ctx.fillRect(x0, y0, s, s); }
    ctx.globalAlpha = fade; ctx.fillStyle = q.age < 0.3 ? "#ffd25e" : q.age < 0.6 ? "#ff943a" : "#e0634f"; ctx.fillRect(x, y, s, s);
  }
  ctx.restore();
}
/**
 * The shop's hanging sign: an iron bracket out of the right wall with a little painted board on two links, a lilac gem on it.
 * The bracket stays put; the board swings a pixel or two each way (row by row, more the lower it hangs).
 */
function drawShopSign() {
  const B = BREATH.shop.sign, t = N.isoW / ISO_G / PX, U = t / 2, bh = Math.max(6, Math.round(t * 0.4)), La = 0.8 * U;
  const key = `${t.toFixed(2)}|${PX}`;
  if (breath.sign?.key !== key) {
    const w = Math.ceil(2 * La + 10), h = Math.ceil(La + bh + 16), x0 = w - 4, y0 = 6;
    const bracket = isoArt(w, h, T => {
      const K = isoKit(T, x0, y0);
      K.faceV(0, -0.07 * U, 0.07 * U, -7, 3, IC.m3);
      K.seg([0, 0, 1], [0, La, 1], IC.m1); K.seg([0, 0, 0], [0, La, 0], IC.m3);
      K.seg([0, 0, -6], [0, La * 0.6, -1], IC.m3);
      K.dot(0, La + 0.04 * U, 1, IC.m2); K.dot(0, La + 0.08 * U, 0, IC.m2); K.dot(0, La + 0.04 * U, -1, IC.m3);
    }, { texture: false });
    const board = isoArt(w, h, T => {
      const K = isoKit(T, x0, y0), v0 = 0.12 * U, v1 = La - 0.02 * U, zt = -3;
      for (const v of [v0 + 0.05 * U, v1 - 0.05 * U]) { K.dot(0, v, -1, IC.m2); K.dot(0, v, -2, IC.m3); }
      K.faceU(0, v0, v1, zt - bh, zt, IC.w3);
      K.faceU(0, v0 + 0.03 * U, v1 - 0.03 * U, zt - bh + 1, zt - 1, IC.w1);
      K.seg([0, v0 + 0.03 * U, zt - 1], [0, v1 - 0.03 * U, zt - 1], IC.w0);
      // the gem painted on it: a little lilac diamond, lit at its top left
      const [gx, gy] = K.P(0, (v0 + v1) / 2, zt - bh / 2), gem = [[0, -2, IC.l0], [-1, -1, IC.l1], [0, -1, IC.l1], [1, -1, IC.l2], [-2, 0, IC.l1], [-1, 0, IC.l2], [0, 0, IC.l2], [1, 0, IC.l3], [2, 0, IC.l3], [-1, 1, IC.l3], [0, 1, IC.l3], [1, 1, IC.l4], [0, 2, IC.l4]];
      for (const [dx, dy, col] of gem) T.px(gx + dx, gy + dy - dx / 2, col);
    }, { texture: false });
    breath.sign = { key, bracket, board, x0, y0, w, h };
  }
  const S = breath.sign, [wx, wy] = isoAt(B.u / ISO_G, 0), ox = Math.round(wx / PX) - S.x0, oy = Math.round(wy / PX - N.isoWall / PX * B.z) - S.y0;
  const sway = breathNow().sway, was = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(S.bracket, ox * PX, oy * PX, S.w * PX, S.h * PX);
  if (!sway) ctx.drawImage(S.board, ox * PX, oy * PX, S.w * PX, S.h * PX);
  // (it swings about its bracket: each row below it moves toward the room and back, the lowest the most)
  else for (let r = 0; r < S.h; r++) ctx.drawImage(S.board, 0, r, S.w, 1, (ox + Math.round(2 * Math.sin(sway) * Math.max(0, r - S.y0))) * PX, (oy + r) * PX, S.w * PX, PX);
  ctx.imageSmoothingEnabled = was;
}

// ---------- the shop's own shell (#278): an open counter front under a striped awning, lanterns, the river behind ----------

/**
 * The shop's shell, measured for a room hw art pixels across with walls wall high (both views of it read this: the painting,
 * the lanterns' flicker, the backdrop's river). The left wall is the stall's open front: a planked counter up to zc, open from
 * there to zo between a post at each end and two more between its three bays; a striped awning hangs from zt under the wall
 * plate and reaches d art pixels out into the room, its scalloped hem hem deep; a lantern hangs from the hem on either side of the
 * middle bay. postAt(al, sl) is the post at a spot along a wall (c across it from its lit edge) and open(al, z) the open front.
 * px is how many screen pixels an art pixel is: the lanterns and the goods are drawn sc times over, so they read on a phone too.
 */
function shopShell(hw, wall, px = 1) {
  const S = Math.max(0.55, hw / 180), pw = Math.max(3, Math.round(5 * S)), plate = Math.max(3, Math.round(5 * S)), foot = Math.max(3, Math.round(7 * S));
  const zc = Math.round(Math.min(wall * 0.36, 38 * S)), zt = Math.min(wall - plate, Math.round(142 * S));
  const zo = Math.max(zc + 6, Math.min(zt - Math.max(6, Math.round(Math.min(wall * 0.2, 20 * S))), Math.round(122 * S)));
  const d = Math.max(4, Math.round(9 * S)), hem = Math.max(3, Math.round(5 * S)), chain = Math.max(2, Math.round(4 * S)), sc = Math.max(1, Math.round(1.6 * S / px));
  const spans = sl => [[0, pw], [hw - pw, hw], ...(sl > 0 ? [hw / 3, hw * 2 / 3].map(p => [p - pw / 2, p + pw / 2]) : [])];
  const postAt = (al, sl) => { for (const [a0, a1] of spans(sl)) if (al >= a0 && al < a1) return { c: sl > 0 ? (a1 - al) / (a1 - a0) : (al - a0) / (a1 - a0) }; return null; };
  const open = (al, z) => z >= zc && z < zo && al >= pw && al < hw - pw && !postAt(al, 1);
  // (the lantern's middle: under the hem, a chain's length down, half the lantern's height lower)
  // (in the gaps the shop's furniture leaves along that wall: between the back corner and the cabinet, the cabinet and the barrel)
  const lamps = [0.26, 0.75].map(v => ({ u: d / hw, v, z: zo - hem - chain - 7 * sc }));
  return { S, pw, plate, foot, zc, zt, zo, d, hem, chain, sc, glow: 6 * sc + 3, lamps, postAt, open };
}
/** A lantern hanging on its chain: an iron cap and frame, amber glass round a white flame, one bright stripe down the glass. */
const SHOP_LANTERN = [
  "....k....",
  "...kmk...",
  "..kmhmk..",
  ".kmmhmmk.",
  "kmmmmmmmk",
  ".kBALAAk.",
  ".kBLWAAk.",
  ".kBLWWAk.",
  ".kBAWAAk.",
  ".kBAAAAk.",
  "kmmmmmmmk",
  "..kmmmk..",
  "...kmk...",
];
/** The goods on the shop's high shelf, each a small sprite standing on it: k its outline, 1 to 3 its own colour from dark to
 *  light (lit on the left), L the one bright highlight, c cork, m and h a tin lid. */
const SHOP_GOODS = {
  bottle: ["..kk..", ".kcck.", ".k32k.", ".k32k.", "k3L21k", "k3L21k", "k3L21k", "k3L21k", "k3221k", ".kkkk."],
  jar: [".kkkkk.", "kmhhmmk", "k3L221k", "k3L221k", "k32221k", "k32211k", ".kkkkk."],
  sack: ["..k.k..", "...k...", ".k332k.", "k33221k", "k32221k", "k32211k", ".kkkkk."],
  bolt: [".kkkkkk.", "k332221k", "k3L2221k", "k322211k", ".kkkkkk."],
};
/** Which goods stand along the shelf, and in what colours (glass green, amber and blue, honey, burlap, a bolt of rose cloth). */
const SHOP_SHELF = [["jar", ["#5c3a14", "#a8661c", "#eec26a"]], ["bottle", ["#1e5233", "#2f7d4a", "#57ad6a"]], ["bottle", ["#5c2a10", "#a8521c", "#e08a35"]], ["sack", ["#4a3420", "#7a5a38", "#a88a5e"]],
  ["bolt", ["#5c1f3f", "#8f3460", "#c25586"]], ["bottle", ["#1d5276", "#3383a8", "#69b7d6"]], ["jar", ["#3a1f5c", "#6b3fa0", "#ad91e6"]], ["sack", ["#4a3420", "#7a5a38", "#a88a5e"]], ["bottle", ["#1e5233", "#2f7d4a", "#57ad6a"]]];

/**
 * Paint the shop's walls into the room (paintRoomIso calls this in place of the forge's timber frame and window; the floor and
 * the slab are the same). Board walls of vertical planks, each its own shade with a lit edge, a dark seam, grain and nails, on a
 * footing of squared stones under an oak wall plate; the left wall is the open front, where nothing is painted so the river in
 * the backdrop shows through. Returns wallPx (each spot on the walls, for paintRoomIso's own loop over them), paint (the awning, the high shelf of
 * goods where the wall is tall enough for it, and the lanterns' light pushed onto lights for paintRoomIso to shine) and after
 * (drawn once the light has fallen: the lanterns themselves).
 */
function paintShopShell({ put, mark, d, w, h, cx, top, hw, hh, wall, S, seed, lights, stoneR, hexes, px }) {
  const SH = shopShell(hw, wall, px), { pw, plate, foot, zc, zt, zo, sc, postAt, open } = SH;
  /** A little sprite drawn sc times over, its top left at x0, y0. */
  const sprite = (rows, C, x0, y0) => rows.forEach((row, r) => [...row].forEach((ch, k) => { if (C[ch]) for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) put(x0 + k * sc + a, y0 + r * sc + b, C[ch]); }));
  // pine boards and dark oak posts, their shadows turned cool and their lights warm; the awning's canvas in faded red and cream
  const plank = hueRamp(hexes(["#221812", "#38281c", "#523b26", "#6e5232", "#8b6a40", "#a98751"]), undefined, 0.16);
  const post = hueRamp(hexes(["#140c0a", "#2a1a12", "#43281a", "#5e3a22", "#7a5230", "#97683c"]));
  const red = hueRamp(hexes(["#3d1622", "#66222e", "#8f3438", "#b2493f", "#cc6a4e"])), cream = hueRamp(hexes(["#4f4440", "#7f6f5e", "#b3a083", "#d9c9a3", "#efe4c4"]));
  const ink = pxHex("#0b0614"), P = Math.max(4, Math.round(9 * S)), bh = Math.max(3, Math.round(6 * S));
  /** One spot on a wall (al along it from the back corner, z up, sl +1 on the left wall): its ramp and shade, or null where it's open. */
  const wallPx = (al, z, sl, x, y) => {
    if (sl > 0 && open(al, z)) return null;
    const p = postAt(al, sl), lit = sl > 0 ? 0.1 : -0.06;
    // the wall plate along the top: a heavy beam, a shadow under it
    if (z >= wall - plate) return { ramp: post, v: z >= wall - 1 ? 0.8 : z === wall - plate ? 0.1 : 0.42 + lit + 0.06 * (pxNoise(al * 0.4, z * 2 + seed) - 0.5) };
    // the posts: lit along one edge, shaded along the other, grain down them, the awning's shadow across their tops
    if (p) {
      let v = p.c < 0.25 ? 0.78 : p.c > 0.75 ? 0.14 : 0.44 + lit + (Math.abs(pxNoise(al * 0.8, z * 0.08 + seed) - 0.5) < 0.05 ? -0.1 : 0);
      if (sl > 0 && z < zt && z > zo - 6 * S) v -= 0.14;
      return { ramp: post, v, post: true };
    }
    // a footing of squared stones, each its own shade, mortar between, a lit top edge
    if (z < foot) {
      const L = Math.round(14 * S), a = al + seed % 7, si = Math.floor(a / L), fa = a - si * L;
      return { ramp: stoneR, v: z === 0 || fa < 1 ? 0.06 : z === foot - 1 ? 0.7 : (sl > 0 ? 0.48 : 0.32) + 0.16 * (pxHash(si, seed) - 0.5) + ((sl > 0 ? fa > L - 2 : fa < 2) ? 0.1 : 0) };
    }
    // the counter's front, under the open bays: boards laid along it, a thick top board lit along its edge, a shadow under that
    if (sl > 0 && z < zc && al >= pw && al < hw - pw) {
      const lip = Math.max(2, Math.round(3 * S));
      if (z >= zc - lip) return { ramp: plank, v: z === zc - 1 ? 0.95 : z === zc - lip ? 0.12 : 0.66 };
      const r = Math.floor((z - foot) / bh), fz = (z - foot) % bh, L = Math.round(34 * S), a = al + r * L * 0.45, si = Math.floor(a / L), fa = a - si * L;
      let v = 0.4 + lit + 0.14 * (Math.floor(pxHash(si, r + seed) * 3) / 2 - 0.5);
      if (fz === 0 || fa < 1) v = 0.08; else if (fz === bh - 1) v += 0.16;
      if (Math.abs(pxNoise(al * 0.08 + r * 5, z * 0.9) - 0.5) < 0.04) v -= 0.1;   // grain along the board
      if (z >= zc - lip - 2) v -= 0.12;
      return { ramp: plank, v };
    }
    // the board wall: vertical planks of different shades, a lit edge toward the light and a dark seam on the other, grain
    // running up them, a butt joint here and there, two nails where each crosses a rail
    const k = Math.floor(al / P), fa = al - k * P, jz = foot + Math.round((0.25 + 0.5 * pxHash(k, seed + 3)) * (wall - foot - plate));
    let v = [0.36, 0.44, 0.52][Math.floor(pxHash(k, seed) * 3)] + lit - 0.1 * z / wall;
    if (sl > 0 ? fa < 1 : fa >= P - 1) return { ramp: plank, v: 0.06 };
    if (sl > 0 ? fa >= P - 1 : fa < 1) v += 0.18;
    if (z === jz) return { ramp: plank, v: 0.08 }; else if (z === jz + 1) v += 0.12;
    if (Math.abs(pxNoise(fa * 0.7 + k * 13, z * 0.05 + seed) - 0.5) < 0.035) v -= 0.12;
    if (pxHash(k, Math.floor(z / (24 * S)) + seed) > 0.94 && Math.hypot(fa - P / 2, (z % (24 * S)) - 12 * S) < 1.6) v = 0.1;   // a knot
    const rail = [foot + Math.round(10 * S), wall - plate - Math.round(8 * S)].some(rz => z === rz || z === rz + 1);
    if (rail && Math.abs(fa - P / 2) < 0.8) v = z % 2 ? 0.86 : 0.04;
    return { ramp: plank, v };
  };
  const at = (u, v, z) => [cx + (u - v) * hw, top + (u + v) * hh - z];
  return { wallPx, paint, after };

  function paint() {
    // the awning: canvas from the wall plate down and out over the counter to its hem, in stripes along the front, each stripe
    // shaded from the wall (in the plate's shadow) to the front edge, a crease of light along the edge and a scalloped valance
    // hanging from it; it sags a little in each bay
    const D = SH.d, sw = Math.max(3, Math.round(7 * S)), drop = zt - zo, a0 = pw / hw, a1 = 1 - pw / hw;
    const sag = v => Math.round(2 * S * Math.sin(Math.PI * ((v * 3) % 1)));
    const stripe = v => Math.floor(v * hw / sw) % 2 ? cream : red;
    for (let v = a0; v <= a1; v += 0.4 / hw) for (let s = 0; s <= 1; s += 0.4 / (D + drop)) {
      const [x, y] = at(s * D / hw, v, zt - s * drop + sag(v) * s);
      const fa = (v * hw) % sw, edgeL = fa > sw - 1;
      put(x, y, isoTone(stripe(v), 0.28 + 0.42 * s + (edgeL ? 0.12 : 0) + (s < 0.12 ? -0.16 : 0), Math.round(x), Math.round(y), 0.2));
      mark(x, y, s * D / hw, v, zt - s * drop);
    }
    for (let v = a0; v <= a1; v += 0.4 / hw) {
      const fa = (v * hw) % sw, tongue = SH.hem * (0.5 + 0.5 * Math.sin(Math.PI * fa / sw)), zf = zo - sag(v);
      for (let z = 0; z <= tongue + 1; z++) {
        const [x, y] = at(D / hw, v, zf - z);
        put(x, y, z === 0 ? isoTone(stripe(v), 0.95, Math.round(x), Math.round(y), 0) : z > tongue ? ink : isoTone(stripe(v), 0.62 - 0.2 * z / tongue + (fa > sw - 1 ? 0.1 : 0), Math.round(x), Math.round(y), 0.2));
       
      }
    }
    // its two ends, dark against what's behind
    for (const v of [a0, a1]) for (let s = 0; s <= 1; s += 0.5 / (D + drop)) { const [x, y] = at(s * D / hw, v, zt - s * drop); put(x + (v === a0 ? 1 : -1), y, ink); }

    // the high shelf of goods along the right wall, where the wall is tall enough to hold it over the furniture and the sign
    if (wall >= 150) {
      const zs = Math.round(wall * 0.8), e = Math.max(3, Math.round(5 * S)), u0 = 0.08, u1 = 0.94;
      for (let u = u0; u <= u1; u += 0.5 / hw) {
        for (let k = 0; k <= e; k++) { const [x, y] = at(u, k / hw, zs); put(x, y, isoTone(plank, k === e ? 0.92 : k === 0 ? 0.3 : 0.74, Math.round(x), Math.round(y), 0.2)); mark(x, y, u, k / hw, zs); }
        for (let z = 1; z <= 3; z++) { const [x, y] = at(u, e / hw, zs - z); put(x, y, z === 3 ? ink : isoTone(plank, 0.5 - z * 0.08, Math.round(x), Math.round(y), 0)); }
        // the shelf's shadow on the boards under it
        for (let z = 4; z <= 6; z++) { const [x, y] = at(u, 0, zs - z); const i = (Math.round(y) * w + Math.round(x)) * 4; if (d[i + 3] && z - 4 < 2) put(x, y, mixHex([d[i], d[i + 1], d[i + 2]], ink, 0.35)); }
      }
      // iron brackets under it
      for (const u of [0.14, 0.5, 0.88]) for (let k = 0; k <= e; k++) { const [x, y] = at(u, k / hw, zs - 1 - (e - k)); put(x, y, IC.m3); const [x2, y2] = at(u, 0, zs - 1 - k); put(x2, y2, IC.m2); }
      // the goods standing on it, each with its contact shadow
      let u = u0 + 0.03;
      for (let n = 0; u < u1 - 0.04; n++) {
        const [kind, cols] = SHOP_SHELF[n % SHOP_SHELF.length], spr = SHOP_GOODS[kind], C = { k: ink, 1: pxHex(cols[0]), 2: pxHex(cols[1]), 3: pxHex(cols[2]), L: pxHex("#f4f0ff"), c: pxHex("#946027"), m: pxHex("#8a8494"), h: pxHex("#e4dfe8") };
        const sw2 = spr[0].length * sc, [bx, by] = at(u, e * 0.5 / hw, zs), x0 = Math.round(bx - sw2 / 2), y0 = Math.round(by) - spr.length * sc;
        for (let k = -1; k <= sw2; k++) { const i = ((y0 + spr.length * sc) * w + x0 + k) * 4; if (d[i + 3]) put(x0 + k, y0 + spr.length * sc, mixHex([d[i], d[i + 1], d[i + 2]], ink, 0.4)); }
        sprite(spr, C, x0, y0);
        u += (sw2 + 2 + Math.round(pxHash(n, seed) * 3)) / hw;
      }
    }
    // the lanterns' warm light on the counter, the posts, the floor and the walls round them
    for (const L of SH.lamps) lights.push({ u: L.u + 0.03, v: L.v, z: L.z, r: hw * 0.5, col: "#f2b45a", k: 0.9 });
  }
  function after() {
    for (const L of SH.lamps) {
      const [hx, hy] = at(L.u, L.v, zo - SH.hem * 0.5), [lx, ly] = at(L.u, L.v, L.z + 6 * sc);
      // the chain from the hem, then the lantern, and a soft warm glow round its glass on whatever's painted behind it
      for (let y = Math.round(hy); y < Math.round(ly); y++) for (let a = 0; a < sc; a++) put(Math.round(lx) + a, y, Math.floor(y / sc) % 2 ? IC.m3 : IC.m2);
      const R = SH.glow, gx = Math.round(lx), gy = Math.round(ly) + 7 * sc, warm = pxHex("#f6d488");
      for (let y = gy - R; y <= gy + R; y++) for (let x = gx - R; x <= gx + R; x++) {
        const dd = Math.hypot(x - gx, y - gy) / R + (PX_BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * 0.25, i = (y * w + x) * 4;
        if (dd >= 1 || x < 0 || y < 0 || x >= w || y >= h || !d[i + 3]) continue;
        put(x, y, mixHex([d[i], d[i + 1], d[i + 2]], warm, dd < 0.45 ? 0.3 : 0.14));
      }
      const C = { k: IC.m4, m: IC.m3, h: IC.m2, W: pxHex("#fffbe6"), A: pxHex("#f6c46a"), B: pxHex("#e08a35"), L: pxHex("#fff0b5") };
      sprite(SHOP_LANTERN, C, gx - 4 * sc, Math.round(ly));
    }
  }
}


/** Where the river runs past the shop on screen (art pixels): level with the middle of the open front's opening. */
function shopRiverY() {
  const q = v => v / PX, SH = shopShell(q(N.isoW), q(N.isoWall), PX);
  return Math.round(q(N.isoTop + N.isoH * 0.5) - (SH.zc + SH.zo) / 2);
}
/**
 * The shop's backdrop: the valley's river running past the open front, in the map's own colours (its water, its glints and
 * its dark banks: WM_COL), under the same night sky as the forge's but with low round hills and trees beyond the water instead
 * of its pines; a meadow of grass in horizontal strokes on the near bank, reeds along both, and a landing at either side
 * stacked with crates and sacks. w×h art pixels; floor is where the ground meets the room, ry where the river runs, S the room's scale.
 */
function paintShopBackdrop(w, h, floor, ry, S = 1) {
  const T = NIGHT.smithy, C = WM_COL, c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data, seed = 83, hx = a => a.map(pxHex);
  const sky = hx(T.sky), ground = hx(T.ground), white = pxHex("#ffffff"), moonC = hx(T.moonCol), ink = pxHex("#0b0614");
  const fy = Math.round(h * floor), rw = Math.max(8, Math.round(18 * S)), r0 = Math.round(clamp(ry, h * 0.12, fy - rw - 6) - rw / 2), r1 = r0 + rw;
  const mx = w * T.moon[0], my = h * T.moon[1], mr = Math.max(6, Math.min(w, h) * T.moon[2] * 1.6);
  // the far bank: gentle hills, and round trees standing on them (their crowns lit on the moon's side)
  const top = new Float32Array(w), tree = new Uint8Array(w);
  for (let x = 0; x < w; x++) top[x] = r0 - 3 - Math.round((10 + 14 * pxNoise(x * 0.012, seed)) * S);
  for (let k = 0; k < Math.round(w / (9 * S)); k++) {
    const tx = Math.round(pxHash(k, seed) * w), tr = (4 + 5 * pxHash(k, seed + 1)) * S, ty = top[clamp(tx, 0, w - 1)] - tr * 0.6;
    for (let x = Math.floor(tx - tr); x <= tx + tr; x++) if (x >= 0 && x < w) { const t2 = ty - Math.sqrt(Math.max(0, tr * tr - (x - tx) ** 2)) * 1.1; if (t2 < top[x]) { top[x] = t2; tree[x] = 1; } }
  }
  const put = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let col;
    const md = Math.hypot(x - mx, y - my);
    if (y >= fy) col = pxPick(ground, Math.max(0.28, 0.75 - (y - fy) / Math.max(16, (h - fy) * 0.7)) + pxFbm(x * 0.3, y * 0.3) * 0.25, x, y);
    else if (y > r1) {
      // the near bank: grass in strokes along it, darker away from the water, a dark lip where it meets the river
      const stroke = pxNoise(x * 0.22 + seed, y * 1.3), k = 0.62 - 0.4 * (y - r1) / Math.max(8, fy - r1) + (stroke > 0.6 ? 0.18 : stroke < 0.3 ? -0.12 : 0);
      col = y <= r1 + 1 ? C.g1 : pxPick([C.g0, C.g1, C.g2, C.g3, C.g4], k, x, y);
    } else if (y >= r0) {
      // the river: deep along the far bank's shadow, the map's blue in the middle, its pale blue in ripples and at the near
      // edge; glints here and there, and the moon's reflection broken into dashes under it
      const t = (y - r0) / rw, rip = pxNoise(x * 0.11 + seed, y * 0.85);
      col = y < r0 + 2 ? C.sea : pxPick([C.sea, C.sea2, C.w0, C.w1], 0.2 + 0.55 * t + (rip > 0.66 ? 0.3 : rip < 0.3 ? -0.12 : 0), x, y);
      if (pxHash(x, y + seed) > 0.992) col = C.foam;
      if (Math.abs(x - mx) < mr * (0.5 + 0.8 * t) && y % 2 === 0 && pxNoise(x * 0.5, y * 0.7 + 3) > 0.45) col = pxNoise(x * 0.9, y) > 0.6 ? moonC[1] : C.foam;
    } else if (y >= top[x]) {
      // the far bank: trees and hills in the map's darkest greens, lit along their tops; a dark lip on the water
      col = y >= r0 - 1 ? C.g1 : y - top[x] < 1.5 ? (tree[x] ? C.g2 : C.g1) : pxPick([C.g0, C.g0, C.g1], 0.4 + 0.3 * pxFbm(x * 0.2, y * 0.2), x, y);
    } else if (md < mr) col = pxPick(moonC, 0.95 - 0.5 * (md / mr) ** 2 - 0.3 * pxSmooth(0.55, 0.7, pxFbm(x * 0.35 + seed, y * 0.35)), x, y);
    else {
      col = pxPick(sky, y / r0 * 0.75 + Math.max(0, 0.35 - (md - mr) / (w * 0.35)), x, y);
      if (pxHash(x, y + seed) > 0.994 && y < r0 * 0.8) col = pxHash(y, x) > 0.5 ? white : pxHex("#d2bfff");
    }
    const i = (y * w + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  // reeds along both banks, leaning a little, a pale tip on some
  for (let x = 0; x < w; x++) for (const [by, n] of [[r1 + 1, 0.55], [r0, 0.75]]) {
    if (pxHash(x, by + seed) > n) continue;
    const hgt = Math.round((2 + 4 * pxHash(x + 7, by)) * S), lean = pxHash(by, x) > 0.5 ? 1 : 0;
    for (let k = 0; k < hgt; k++) put(x + (k > hgt * 0.6 ? lean : 0), by - k, k === hgt - 1 && pxHash(x, 3) > 0.7 ? C.sand2 : k < 2 ? C.g1 : C.g3);
  }
  // a landing on the near bank at either side: boards out over the water on posts, crates and sacks stacked on it
  const wood = [C.d0, C.d1, C.d2, C.d3], s = Math.max(1, Math.round(S));
  for (const lx of [Math.round(w * 0.1), Math.round(w * 0.9)]) {
    const lw = 16 * s, ly = r1 - 2 * s;
    for (let y = ly; y < r1 + 3 * s; y++) for (let x = lx - lw; x <= lx + lw; x++) put(x, y, y === ly ? wood[3] : (x - lx + lw) % (4 * s) === 0 ? wood[0] : y > r1 + 2 * s - 1 ? wood[0] : wood[pxHash(Math.floor((x - lx) / (4 * s)), seed) > 0.5 ? 2 : 1]);
    for (const px of [lx - lw + s, lx + lw - s]) for (let y = r1 + 3 * s; y < r1 + 7 * s; y++) { put(px, y, wood[0]); put(px - 1, y, ink); }
    // two crates, one on the other, and a sack leaning on them: each with a dark outline, a lit top and left face, slats
    const crate = (x0, y0, cw, ch) => {
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const edge = x === 0 || y === 0 || x === cw - 1 || y === ch - 1;
        put(x0 + x, y0 + y, edge ? ink : y === 1 ? wood[3] : x === 1 ? wood[3] : (y - 1) % (3 * s) === 0 ? wood[0] : x > cw - 3 ? wood[1] : wood[2]);
      }
      put(x0 + 1, y0 + 1, pxHex("#e2c08d"));
    };
    const side = lx < w / 2 ? 1 : -1, cw = 10 * s, ch = 8 * s, cx0 = lx - cw / 2 - side * 5 * s;
    for (let x = cx0 - 1; x <= cx0 + cw + 3 * s; x++) put(x, ly - 1, mixHex([d[(ly - 1) * 4 * w + x * 4], d[(ly - 1) * 4 * w + x * 4 + 1], d[(ly - 1) * 4 * w + x * 4 + 2]], ink, 0.4));
    crate(cx0, ly - ch, cw, ch); crate(cx0 + s, ly - 2 * ch + s, cw - 2 * s, ch - s);
    const sx = cx0 + (side > 0 ? cw + 2 * s : -4 * s), sr = 4 * s;
    for (let y = -2 * sr; y <= 0; y++) for (let x = -sr; x <= sr; x++) {
      const e = Math.hypot(x / sr, (y + sr) / (sr * 1.1));
      if (e > 1.05 && !(y < -2 * sr + 2 * s && Math.abs(x) < s)) continue;
      put(sx + x, ly - 1 + y, e > 0.88 ? ink : x < -sr * 0.3 ? pxHex("#a88a5e") : x > sr * 0.4 ? pxHex("#4a3420") : pxHex("#7a5a38"));
    }
    put(sx, ly - 1 - 2 * sr - 1, ink); put(sx - 1, ly - 1 - 2 * sr, pxHex("#a88a5e"));
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** The isometric room in art pixels: a diamond floor on a thick slab, and (indoors) a lit left wall and a shaded right one.
 *  Every surface is a material laid along its own plane, lit from the top left: caves are layered rock with ledges and
 *  fissures over a pebbly floor; the abbey dressed stone in courses over flagstones; the timber hall an oak frame with
 *  limewashed daub on a rubble footing, over boards; the ruins old blocks in moss; outdoors grass with trodden paths. */
function paintRoomIso(id) {
  const w = Math.ceil(W / PX), h = Math.ceil(H / PX), c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data;
  const q = v => v / PX, cx = q(N.cx), top = q(N.isoTop), hw = q(N.isoW), hh = hw / 2, wall = q(N.isoWall), slab = Math.max(4, Math.round(hw / 16));
  // stones, planks and beams keep their proportions to the room whatever its size (a phone's room is about 180 pixels from corner to end)
  const S = Math.max(0.55, hw / 180);
  const { kind, art, night, wallR, crys, ground, seed, indoor, hexes, ruinStone, moss, oak, daub, ashlar, wallC, ruinH, wood, stone, roomKindNow, garden, mood, mossy, mossC, ashlarPx, facet, rockPx, timberAt, timberPx, shoreAt, oakPx, oakH, ice, auroraG, auroraP, auroraAt, columnAt, plH, rockTex, pathD, dirt, floorPx } = roomMaterials(id, hw, wall, S);
  const put = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
  const crypt = mood === "crypt";
  // (the crystal caves' hanging moss, and its roots: dark, cool and muted, see the strands from the wall's top below)
  const strandC = hexes(["#0b1418", "#123033", "#2a5c58", "#4f8a7a"]), strandR = hexes(["#160c26", "#2a1e1a", "#4a362c", "#6e5444"]);
  // where each pixel of the walls and the floor lies in the room (u, v along the floor, z up), for the light that falls on it
  const surf = new Float32Array(w * h * 3).fill(-1), lights = [];
  // where the top of the wall is in each column (the rock's ragged edge), for what grows along it: paintFixtures
  const tops = new Float32Array(w).fill(NaN);
  const mark = (x, y, u, v, z) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 3; surf[i] = u; surf[i + 1] = v; surf[i + 2] = z; };
  /** Each light's pool on the walls and the floor round it, falling off in three steps with a dithered seam between them, the
   *  stone taking on the light's colour; corners away from it stay dark. A light is { u, v, z, r, col, k }: where, how far, how strong. */
  const shine = ls => {
    if (!ls.length) return;
    for (const L of ls) L.c = pxHex(L.col);
    for (let i = 0, n = w * h; i < n; i++) {
      const u = surf[i * 3];
      if (u < 0) continue;
      const v = surf[i * 3 + 1], z = surf[i * 3 + 2], x = i % w, y = (i - x) / w;
      let col = null;
      for (const L of ls) {
        const dd = Math.hypot((u - L.u) * hw, (v - L.v) * hw, z - L.z) / L.r;
        if (dd >= 1) continue;
        const lv = Math.floor((1 - dd) * 3 * L.k + (PX_BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * 0.5);
        if (lv <= 0) continue;
        col = mixHex(col || [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]], L.c, [0, 0.13, 0.26, 0.4][Math.min(3, lv)]);
      }
      if (col) { d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; }
    }
  };
  const ink = pxHex("#0b0614"), at = (u, v) => [cx + (u - v) * hw, top + (u + v) * hh];
  // the shop has a shell of its own (#278): board walls, an open counter front under an awning, lanterns (paintShopShell)
  const shop = roomKindNow === "shop" && kind === "timber" && paintShopShell({ put, mark, d, w, h, cx, top, hw, hh, wall, S, seed, lights, stoneR: ruinStone, hexes, px: PX });
  const lightAt = (u, v) => Math.exp(-(((u - 0.35) / 0.5) ** 2) - (((v - 0.5) / 0.6) ** 2));

  // the slab under the floor: its two front faces, the left one lit, the right one in shade (outdoors the room is part of the land: no slab)
  if (indoor) for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
    const edgeY = top + hh + (hh - Math.abs(x - cx) * hh / hw), left = x < cx;
    for (let k = 0; k < slab; k++) {
      const y = edgeY + k, al = Math.abs(x - cx);
      let col;
      if (kind === "cave" && !crypt) col = isoTone(wallC, (mood ? rockTex(al, slab - k + 400, left ? 1 : -1, x, y).v ?? 0.4 : rockPx(al, slab - k + 400, left ? 1 : -1, x, y)) - 0.12, x, y);
      else {
        // a footing of squared stones, joints staggered course by course
        const row = Math.floor(k / Math.max(3, Math.round(slab / 2))), L = Math.round(12 * S), a = al + row * L * 0.5, fa = a % L;
        col = isoTone(wallC === ashlar ? ashlar : ruinStone, k % Math.max(3, Math.round(slab / 2)) === 0 || fa < 1 ? 0.08 : (left ? 0.5 : 0.3) + 0.15 * (pxHash(Math.floor(a / L), row) - 0.5) + (fa > L - 2 === left ? 0.08 : 0), x, y);
      }
      put(x, y, k === slab - 1 ? ink : k === 0 ? isoTone(wallC === ashlar ? ashlar : ruinStone, left ? 0.75 : 0.5, x, y) : col);
    }
  }
  // the floor
  for (let y = Math.floor(top); y <= Math.ceil(top + hw); y++) for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
    const a = (x - cx) / hw, b = (y - top) / hh, u = (a + b) / 2, v = (b - a) / 2;
    if (u < 0 || v < 0 || u > 1 || v > 1) continue;
    // the dark where floor meets wall: deepest in the back corner
    const ao = indoor ? Math.min(1, Math.exp(-u * hw / (4 * S)) + Math.exp(-v * hw / (4 * S)) + 0.6 * Math.exp(-(u + v) * hw / (10 * S))) : 0;
    put(x, y, floorPx(u, v, x, y, ao, lightAt(u, v)));
    mark(x, y, u, v, 0);
  }
  if (!indoor) {
    // blades of grass in tufts: a dark root, a mid stem, a pale tip leaning a little, thicker where the ground is lush
    for (let y = Math.floor(top); y <= Math.ceil(top + hw); y++) for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      const a = (x - cx) / hw, b = (y - top) / hh, u = (a + b) / 2, v = (b - a) / 2;
      if (u < 0.01 || v < 0.01 || u > 0.98 || v > 0.98) continue;
      const lush = pxFbm(x * 0.05 + seed, y * 0.1), hsh = pxHash(x * 7 + seed, y * 3);
      if (hsh > 0.06 + 0.12 * lush) continue;
      const pr = roomKindNow === "camp" ? 0.07 : 0.05, pd = pathD(u, v) * hw / (S * 180);
      if (pd < pr - 0.012) continue;
      // (in the snow: a glint of frost on a crust, or now and then a dry stalk poking through the drift)
      if (roomKindNow === "snow") { if (pxHash(x, y + 9) > 0.985) { put(x, y, dirt[3]); put(x, y - 1, dirt[4]); put(x + (pxHash(y, x) > 0.5 ? 1 : -1), y - 2, dirt[5]); } else if (pxHash(x + 4, y) > 0.7) put(x, y, ground[4]); continue; }
      const tall = 2 + Math.round(pxHash(x, y + 1) * 2 + lush * 1.5), lean = pxHash(y, x) > 0.5 ? 1 : -1, lk = lightAt(u, v);
      for (let k = 0; k < tall; k++) {
        const col = k === tall - 1 ? ground[Math.min(ground.length - 1, lk > 0.45 ? 4 : 3)] : k === 0 ? ground[1] : ground[Math.min(ground.length - 1, 2 + (lk > 0.6 ? 1 : 0))];
        put(x + (k === tall - 1 && tall > 2 ? lean : 0), y - k, col);
      }
      if (pxHash(x + 3, y) > 0.92) { put(x - 1, y - 1, ground[2]); put(x + 1, y - 1, ground[3]); }
    }
    // the grass at the front edges grows on over them into the meadow (#277): blades rooted just outside, leaning over the edge,
    // lit on the left half; none where the path leaves (the backdrop takes the path on: nightSite)
    for (let x = Math.floor(cx - hw) + 1; x < Math.ceil(cx + hw) && roomKindNow !== "snow"; x++) {
      const ye = Math.round(top + hh + (hh - Math.abs(x - cx) * hh / hw)), left = x < cx;
      const [u, v] = [((x - cx) / hw + (ye - top) / hh) / 2, ((ye - top) / hh - (x - cx) / hw) / 2];
      if (pathD(Math.min(u, 1), Math.min(v, 1)) * hw / (S * 180) < (roomKindNow === "camp" ? 0.07 : 0.05) + 0.02) continue;
      for (const dy of [0, 1]) {
        if (pxHash(x * 5 + dy, seed + 17) > (dy ? 0.35 : 0.6)) continue;
        const tall = 2 + Math.round(pxHash(x, seed + dy) * 2), lean = pxHash(seed + dy, x) > 0.5 ? 1 : -1;
        for (let k = 0; k < tall; k++) put(x + (k === tall - 1 && tall > 2 ? lean : 0), ye + 1 + dy - k, k === tall - 1 ? ground[left ? 3 : 2] : k === 0 ? ground[1] : ground[2]);
      }
    }
    // small flowers in the grass, in little clumps of one kind (two or three heads, the odd one a bud), clover leaves among
    // them, and pale specks of tiny daisies scattered between; none on the paths
    const blooms = ["#fff0b5", "#ffc4da", "#d2bfff", "#ffffff"].map(pxHex), eye = pxHex("#eec26a"), clump = roomKindNow === "snow" ? 0 : Math.round(28 * S * S);
    for (let k = 0; k < clump; k++) {
      const u0 = 0.05 + 0.9 * pxHash(k, seed + 1), v0 = 0.05 + 0.9 * pxHash(seed + 2, k), col = blooms[k % 4];
      for (let j = 0; j < 1 + Math.floor(pxHash(k, 5) * 3); j++) {
        const u = u0 + (j ? (pxHash(k, j + 7) - 0.5) * 0.05 : 0), v = v0 + (j ? (pxHash(j + 7, k) - 0.5) * 0.05 : 0);
        if (u < 0.03 || v < 0.03 || u > 0.97 || v > 0.97 || pathD(u, v) * hw / (S * 180) < 0.09) continue;
        const [fx, fy] = at(u, v);
        put(fx, fy, ground[1]); put(fx, fy - 1, ground[2]);
        if (j === 2) { put(fx, fy - 2, col); continue; }
        put(fx, fy - 3, col); put(fx - 1, fy - 2, col); put(fx + 1, fy - 2, col); put(fx, fy - 2, eye);
      }
      // clover beside the clump: three round leaves
      const [cx0, cy0] = at(u0 + 0.02, v0 - 0.015);
      if (pxHash(k, 11) > 0.5 && pathD(u0 + 0.02, v0 - 0.015) * hw / (S * 180) > 0.09) { put(cx0 - 1, cy0, ground[3]); put(cx0 + 1, cy0, ground[2]); put(cx0, cy0 - 1, ground[Math.min(ground.length - 1, 4)]); }
    }
    for (let k = 0; k < clump * 4; k++) {
      const u = 0.03 + 0.94 * pxHash(k, seed + 31), v = 0.03 + 0.94 * pxHash(seed + 32, k);
      if (pathD(u, v) * hw / (S * 180) < 0.08) continue;
      const [fx, fy] = at(u, v);
      put(fx, fy, k % 5 ? blooms[3] : blooms[0]);
    }
  }
  if (indoor) {
    // the two walls: left (along v) catches the light, right (along u) is in shade; they meet at the back corner
    for (const side of [-1, 1]) for (let x = Math.floor(side < 0 ? cx - hw : cx); x <= Math.ceil(side < 0 ? cx : cx + hw); x++) {
      const tt = Math.abs(x - cx) / hw, base = top + tt * hh, al = tt * hw, sl = -side;
      // a cave's rock rises higher toward the back and juts up and down along its top; the crypt's vault rises smoothly, dressed
      const yTop = base - wall * ruinH(tt) - (crypt ? wall * 0.22 * (1 - tt) + 2 : kind === "cave" ? wall * (0.22 * (1 - tt) + 0.16 * pxNoise(x * 0.05, seed)) + 4 * pxNoise(x * 0.3, seed + 4) - 2 : 0);
      if (x >= 0 && x < w) tops[x] = yTop;
      for (let y = Math.floor(yTop); y < base; y++) {
        const z = base - y;
        if (shop) {
          // (nothing is painted in the open front: the river in the backdrop shows through it)
          const m = shop.wallPx(al, z, sl, x, y);
          if (!m) continue;
          let val = m.v;
          if (al < 10 * S && !m.post) val -= 0.14 * (1 - al / (10 * S));   // the corner's own shadow
          if (Math.abs(x - cx) > hw - 1) val = 0.1;                         // the open ends
          put(x, y, isoTone(m.ramp, val, x, y, 0.15));
          mark(x, y, side < 0 ? 0 : tt, side < 0 ? tt : 0, z);
          continue;
        }
        let val, ramp = wallC;
        if (kind === "cave" && !crypt) {
          // the gallery's rock is shored up with oak: posts against it, a cap along the top, a knee brace in each corner;
          // high up the aurora's cave the rock thins to ice, and the northern lights glow through it in bands
          const sh = mood === "gallery" && shoreAt(al, z, sl), ak = mood === "aurora" && !sh && auroraAt(al, z, sl);
          if (sh) { ramp = oakH; val = oakPx(sh, al, z, sl > 0 ? 0.44 : 0.3); }
          else if (ak) { ramp = ak.ramp; val = ak.v; }
          else {
            // (at home, #307, stone by stone: rockTex, with what grows on each stone in its own colour)
            const rt = mood && rockTex(al, z, sl, x, y);
            if (rt && rt.col) { put(x, y, rt.col); mark(x, y, side < 0 ? 0 : tt, side < 0 ? tt : 0, z); continue; }
            val = (rt ? rt.v : rockPx(al, z, sl, x, y)) - 0.3 * Math.max(0, 1 - z / (6 * S));
            // in the moss garden (in the valley's way of drawing) moss grows on the lit tops of the ledges, thickest low down and up under the roof
            if (!mood && garden) { const m = pxFbm(al * 0.05 + sl * 9 + seed, z * 0.06) + (z < wall * 0.14 ? 0.16 : 0) + (z > wall * 0.9 ? 0.1 : 0); if (m > 0.56 && val > 0.42 - (m - 0.56) * 1.2) { ramp = mossC; val = val * 0.8 + 0.12 + (m > 0.62 ? 0.08 : 0); } }
            // the shoring's shadow on the rock, down and to the right of each timber
            if (mood === "gallery" && (shoreAt(al + sl * 2, z + 2, sl) || shoreAt(al + sl, z + 1, sl))) val -= 0.16;
          }
        }
        else if (kind === "timber") { const m = timberPx(al, z, sl, x, y); ramp = m.ramp; val = m.v; }
        else if (kind === "ruin") {
          // big old blocks, uneven, some missing their corners; moss on whatever still stands on top and in the joints low
          // down and in damp patches (the ivy trailing down comes after: see below)
          if (y - yTop < 2.5) { put(x, y, moss[2]); continue; }
          val = ashlarPx(al, z, sl, x, y, sl > 0 ? 0.52 : 0.32);
          if (z < 5 * S && pxHash(x, y) > 0.55) { put(x, y, moss[pxHash(x + 1, y) > 0.5 ? 1 : 0]); continue; }
          if (val < 0.1 && z < wall * (0.25 + 0.5 * pxFbm(al * 0.04 + sl * 7 + seed, 1.5)) && pxHash(x, y + seed) > 0.25) { put(x, y, moss[pxHash(x + 1, y) > 0.75 ? 2 : pxHash(x, y + 3) > 0.4 ? 1 : 0]); continue; }
        } else {
          // the abbey (and the crypt at home): a plinth of big blocks with a lit ledge along its top, then dressed courses,
          // damp streaks low down; the crypt's vault above a moulding where the wall ends
          const plH = Math.round(13 * S);
          if (z < plH) val = z >= plH - 2 ? 0.86 - (plH - 1 - z) * 0.12 : ashlarPx(al * 0.6, z + 400, sl, x, y, sl > 0 ? 0.46 : 0.3) - 0.06;
          else if (crypt && z >= wall - 3 * S && z < wall) val = z >= wall - S ? 0.82 : z < wall - 2 * S ? 0.12 : 0.5;
          else {
            const as = ashlarPx(al, z, sl, x, y, sl > 0 ? 0.58 : 0.38);
            // (in the valley's abbey moss has got into the mortar low down, in damp patches)
            if (!crypt && as < 0.1 && z < wall * (0.12 + 0.3 * pxFbm(al * 0.04 + sl * 7 + seed, 2.5)) && pxHash(x, y + seed) > 0.3) { put(x, y, moss[pxHash(x + 1, y) > 0.75 ? 1 : 0]); mark(x, y, side < 0 ? 0 : tt, side < 0 ? tt : 0, z); continue; }
            val = as - 0.14 * (z / wall) - (crypt && z >= wall ? 0.1 : 0);
            if (pxNoise(al * 0.11 + sl * 5 + seed, 1.3) > 0.66 && z < wall * (0.2 + 0.3 * pxNoise(al * 0.08, 4))) val -= 0.1;
            if (z < plH + 3) val -= 0.12 * (plH + 3 - z) / 3;   // the ledge's shadow on the wall just above it
          }
          // the crypt's columns, engaged in the wall
          const col = crypt ? columnAt(al, z, sl) : -1;
          if (col >= 0) val = col;
        }
        if (y - yTop < 2) { val = sl > 0 ? 0.8 : 0.6; if (kind === "timber") ramp = oak; if (mossy) ramp = mossC; if (mood === "aurora") ramp = ice; }   // the lit top edge of the wall
        if (kind === "cave" && !crypt) { if (Math.abs(x - cx) < 3) val -= 0.08 * (3 - Math.abs(x - cx)); }  // rock curves round the back, no sharp corner
        else if (Math.abs(x - cx) < 1 && kind !== "timber") val = 0.05;     // the back corner
        if (al < 10 * S) val -= 0.14 * (1 - al / (10 * S));   // the corner's own shadow
        if (Math.abs(x - cx) > hw - 1) val = 0.1;      // the open ends
        put(x, y, isoTone(ramp, val, x, y, mood ? 0 : 0.3));
        mark(x, y, side < 0 ? 0 : tt, side < 0 ? tt : 0, z);
      }
      // a cave's rock overhangs: stalactites drip from its ragged top
      if (mossy) {
        // in the moss garden the roof drips moss instead: curtains of it, long where the rock hangs low, and now and then a root
        // that found its way down through the rock, twisting, lit on its left
        const hs = pxHash(x, seed + 5), curtain = pxNoise(x * 0.09, seed + 7);
        if (hs > 0.42 - 0.3 * curtain) {
          const len = Math.round((2 + 14 * curtain * curtain + 4 * pxHash(x + 3, seed)) * S) + 1;
          for (let k = 0; k < len; k++) put(x, yTop + 1 + k, k === len - 1 ? mossC[pxHash(x, 9) > 0.6 ? 6 : 5] : mossC[clamp(3 + (side < 0 ? 1 : 0) - (k > len * 0.6 ? 1 : 0) + (pxHash(x, k) > 0.85 ? 1 : 0), 0, 6)]);
        } else if (hs < 0.06) {
          const len = Math.round((10 + 16 * pxHash(x, seed + 2)) * S);
          for (let k = 0; k < len; k++) { const rx = x + Math.round(Math.sin(k * 0.35 + x) * 1.2); put(rx, yTop + 1 + k, dirt[k === len - 1 ? 3 : 2]); put(rx - 1, yTop + 1 + k, dirt[k % 5 ? 4 : 3]); }
        }
      } else if (mood === "aurora" && pxHash(x, seed + 5) > 0.55) {
        // icicles: long and many, each a pale column narrowing to a point, lit on its left, a bright glint near its root
        const len = Math.round((3 + 12 * pxHash(x + 3, seed) ** 2) * S) + 2;
        for (let k = 0; k < len; k++) put(x, yTop + 2 + k, ice[clamp(Math.round(5 - k / len * 3 + (side < 0 ? 0 : -1)), 1, 6)]);
        put(x, yTop + 3, ice[6]);
      } else if (mood === "crystal" && pxHash(x, seed + 19) > 0.88 - 0.2 * pxNoise(x * 0.06, seed + 3)) {
        // in the crystal caves, strands of dark moss and the odd root hanging from the rock's ragged top (#317): muted teal and
        // deep green to sit with the violet, a tuft where each starts, a leaf-tick now and then, a paler tip
        const len = Math.round((5 + 22 * pxHash(x + 7, seed) ** 2) * S) + 3, C = pxHash(x, seed + 23) > 0.8 ? strandR : strandC;
        put(x - 1, yTop + 1, C[1]); put(x + 1, yTop + 1, C[side < 0 ? 2 : 1]);
        for (let k = 0; k < len; k++) {
          const sx = x + Math.round(Math.sin(k * 0.35 + x) * 0.7);
          put(sx, yTop + 1 + k, C[k === len - 1 ? 3 : k % 4 === 1 ? 3 : 2]); if (k < len * 0.6) put(sx + 1, yTop + 1 + k, C[1]);
          if (k % 5 === 3 && k < len - 2) put(sx + (k % 10 === 3 ? 1 : -1), yTop + 1 + k, C[side < 0 ? 2 : 1]);
        }
      } else if (kind === "cave" && !crypt && pxHash(x, seed + 5) > 0.82) {
        const len = 2 + Math.round(pxHash(x + 3, seed) * 5);
        for (let k = 0; k < len; k++) put(x, yTop + 2 + k, pxPick(wallC, 0.62 - k * 0.07, x, k));
      }
    }
    // ivy hanging down the walls from their tops, in patches: each strand a stem wandering down with a pair of leaves every few
    // pixels (lit on the top left, a step darker on the shaded wall), a pixel of shadow on the stone under each leaf, and a mat
    // of leaves along the top where it starts. The ruins are swallowed by it; the abbey only touched at the ends of its walls.
    // (none over the window, which comes after)
    if (kind === "ruin" || (kind === "hall" && !crypt)) {
      const ruined = kind === "ruin", ivyC = hexes(["#10301f", "#1e5233", "#2f7d4a", "#57ad6a", "#a3dd9b"]), shade = ruined ? ruinStone[0] : ashlar[1];
      const xw = Math.round(cx - (ruined ? 0.5 : 0.42) * hw), ww = ruined ? hw * 0.19 : gothicWindow(wall, hw, S, seed).wo + 9;
      const leafAt = new Map(), stemAt = new Map();
      const leaf = (x, y, rgt) => { x = Math.round(x); y = Math.round(y); const k = x > cx ? 1 : 0; for (const [dx, dy, c] of [[0, 0, 3 - k], [1, 0, 2 - k], [0, 1, 2 - k], [1, 1, 1]]) leafAt.set((y + dy) * w + x + dx, ivyC[c + (rgt && dx === 0 && dy === 0 && !k ? 1 : 0)]); };
      const step = Math.max(3, Math.round(4 * S));
      for (let x0 = Math.ceil(cx - hw) + 3; x0 < cx + hw - 3; x0 += step) {
        const hs = pxHash(x0, seed + 61), patch = pxNoise(x0 * 0.03, seed + 3) + (ruined ? 0 : 0.5 * Math.max(0, Math.abs(x0 - cx) / hw - 0.55));
        if (Math.abs(x0 - cx) < 4 || Math.abs(x0 - xw) < ww || patch < (ruined ? 0.42 : 0.66) || hs > 0.8 || !(tops[x0] < h)) continue;
        // (never down onto the floor: a strand stops well above the wall's foot)
        const y0 = Math.round(tops[x0]) + 1, foot = top + Math.abs(x0 - cx) / hw * hh - 4 * S;
        const len = Math.min(Math.round(foot - y0), Math.round(wall * (ruined ? 0.15 + 0.5 * pxHash(seed, x0) : 0.08 + 0.3 * pxHash(seed, x0)) * (0.5 + patch)));
        for (let k = 0; k < len; k++) {
          const sx = x0 + Math.round(1.4 * Math.sin(k * 0.17 + hs * 9)), sy = y0 + k;
          stemAt.set(sy * w + sx, ivyC[k % 4 ? 1 : 2]);
          if (k % 3 === 1 && k < len - 1) { const sd = Math.floor(k / 3) % 2 ? 1 : -1; leaf(sx + (sd > 0 ? 1 : -2), sy - 1, sd > 0); }
        }
        leaf(x0 + Math.round(1.4 * Math.sin(len * 0.17 + hs * 9)) - 1, y0 + len - 1, false);
        for (let j = -2; j <= 2; j++) if (pxHash(j + 3, x0 + seed) > 0.3) leaf(x0 + j * 2, y0 - 1 + (j & 1), j > 0);
      }
      // the shadows first, then the stems, then the leaves over them
      for (const i of [...leafAt.keys(), ...stemAt.keys()]) { const j = i + w + 1; if (!leafAt.has(j) && !stemAt.has(j) && surf[j * 3] >= 0 && surf[j * 3 + 2] > 0) put(j % w, (j - j % w) / w, shade); }
      for (const [i, col] of stemAt) put(i % w, (i - i % w) / w, col);
      for (const [i, col] of leafAt) put(i % w, (i - i % w) / w, col);
    }
    // a window in the left wall: a parallelogram that follows the wall. It has depth: a deep reveal in the wall on one
    // side, a stone sill that sticks out at the bottom, and through it a moonlit night with far hills and stars of different
    // brightness. The ruins' is a broken pointed arch; the timber hall's is square-headed under an oak lintel, glazed in
    // small diamond panes of lead; the abbey's is Gothic (below)
    const sky = (night ? night.sky : ["#0d0a2a", "#160c33", "#2d2468", "#463592"]).map(pxHex);
    const white = pxHex("#ffffff"), moon = pxHex("#fff8d6");
    const glazed = kind === "timber", sillC = kind === "timber" ? [oak[1], oak[4]] : [wallC[1], wallC[Math.min(6, wallC.length - 1)]];
    // (the grotto's hall is deep under the rock: no window there, and no moonlight on its floor; the shop's front is open)
    if (roomKindNow === "grotto" || shop) {}
    // (the moss garden has no window: its light comes down a shaft from a crack in the vault, see paintMossGarden; nor has any
    // cave at home that isn't a crystal cave: each has its own light, see paintMood)
    else if (garden || (mood && mood !== "crystal")) {}
    else if (kind === "hall") {
      // the abbey's window is Gothic: a pointed arch cut deep through the wall and splayed, so both its sides show, with a
      // broad stone seat; four tall lancets with trefoil heads under a net of lozenges (three, two, one), all on the wall's
      // slant. Behind the glass a cold violet night with a moon and stars, and an iron lantern on a curled bracket either side
      const tc = 0.42, xc = Math.round(cx - tc * hw), foot = x => Math.floor(top + (cx - x) / hw * hh);
      const { rise, arch, zb, seatUp, zA, D, sp, wi, wo, zs, zg, openAt, lav, vio, glassAt, skyV, isGlass } = gothicWindow(wall, hw, S, seed);
      const x0 = xc - wo - 6, x1 = xc + wo + 6;
      for (let x = x0; x <= x1; x++) for (let y = foot(x) - zA - 8; y <= foot(x) - zb + 1; y++) {
        const a = x - xc, z = foot(x) - y, ac = a + 0.5;
        if (openAt(a, z, 0)) {
          if (openAt(a, z, 1)) {
            // through the glass
            const ga = a + D, gz = z - D, gk = glassAt(ga, gz);
            if (gk > 0) { put(x, y, isoTone(vio, skyV(ga, gz, x, y, gk), x, y)); continue; }
            // stone: lit where it faces up or left into the light, in shade where it turns away
            let v = 0.32;
            if (gk === -1 && !arch(ga + 0.5, gz, wi - 1, zg + 1, zs)) v = 0.42;
            else if (isGlass(ga - 1, gz)) v = 0.58; else if (isGlass(ga, gz + 1)) v = 0.55; else if (isGlass(ga + 1, gz)) v = 0.18; else if (isGlass(ga, gz - 1)) v = 0.22;
            put(x, y, isoTone(wallC, v, x, y)); continue;
          }
          // the reveal: how far in the wall turns this pixel's way, and which face it is
          let t = 0; while (t < 1 && openAt(a, z, t + 1 / 24)) t += 1 / 24;
          const tn = t + 1 / 24, za = z - D * tn, aa = ac + D * tn, deep = t;
          let v;
          if (za < zb + seatUp * tn) v = 0.74 - 0.12 * deep;                       // the seat, lit from above
          else if (aa > 0) v = (za < zs ? 0.3 : 0.2) - 0.08 * deep - (((za % 11) + 11) % 11 < 1 ? 0.18 : 0);   // the far side, in shade
          else v = za < zs ? 0.62 : 0.5;                                            // the near side's splay, catching the light
          if (t < 1 / 24) v += aa > 0 ? 0.14 : 0.2;                                 // the arris
          if (t > 0.9 && za >= zb + seatUp) { put(x, y, isoTone(wallC, 0.06, x, y)); continue; }   // where the stone meets the glass
          // the moonlight coming in silvers the seat and the near side, more the deeper in
          put(x, y, aa > 0 && za >= zb + seatUp * tn ? isoTone(wallC, v, x, y) : mixHex(isoTone(wallC, v, x, y), lav, deep > 0.5 ? 0.22 : 0.1));
          continue;
        }
        // round the opening, on the wall's face: a chamfered surround of dressed voussoirs, and a hood mould over the arch
        if (z < zb) continue;
        const ring = r => arch(ac, z, wo + r, zb, zs);
        if (ring(1)) put(x, y, isoTone(wallC, ac < 0 || z > zs + rise(wo) * 0.6 ? 0.84 : 0.46, x, y));
        else if (ring(4)) {
          const jt = z < zs ? ((z - zb) % 9 === 0) : Math.abs(((Math.atan2(z - zs, Math.abs(ac) + wo) / 0.13) % 1) - 0.5) > 0.42;
          put(x, y, isoTone(wallC, jt ? 0.1 : ac < 0 ? 0.62 : 0.5, x, y));
        } else if (ring(5) && z > zs - 3) put(x, y, isoTone(wallC, 0.08, x, y));
        else if (ring(7) && z > zs - 3) put(x, y, isoTone(wallC, ring(6) ? 0.66 : 0.86, x, y));
      }
      // the seat: a broad slab that sticks out of the wall under the window, its top lit, its front in half light,
      // its end in shade, and a shadow on the wall beneath
      const E = Math.max(3, Math.round(6 * S)), sh = Math.max(2, Math.round(4 * S)), xl = xc - wo - 3, xr = xc + wo + 3;
      for (let x = xl; x <= xr + E; x++) {
        const y0 = foot(x) - zb;
        for (let k = 0; k <= sh + 3; k++) { const o = x - E; if (o >= xl && o <= xr) put(x, y0 + E + k, isoTone(wallC, k <= sh ? (k === 0 ? 0.9 : k === sh ? 0.08 : 0.5) : 0.1, x, y0 + E + k)); }
        for (let e = 0; e < E; e++) { const o = x - e; if (o >= xl && o <= xr) put(x, y0 + e, isoTone(wallC, e === 0 ? 0.6 : 0.76, x, y0 + e)); }
      }
      for (let e = 1; e <= E; e++) for (let k = 0; k <= sh; k++) put(xr + e, foot(xr) - zb + Math.floor(e / 2) + k, isoTone(wallC, k === sh ? 0.06 : 0.26, xr + e, 0));
      // two iron lanterns on curled brackets, each with a soft lavender glow on the stone round it
      for (const side of [-1, 1]) {
        const xw = xc + (side < 0 ? -wo - 21 : wo + 7), yw = foot(xw) - (zs + Math.round(6 * S)), lx = xw + 9, gy = yw + 13, R = Math.round(20 * S);
        for (let y = gy - R; y <= gy + R; y++) for (let x = lx - R; x <= lx + R; x++) {
          const dd = Math.hypot(x - lx, (y - gy) * 1.15) / R + (PX_BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * 0.16;
          if (dd >= 1 || x < 0 || y < 0 || x >= w || y >= h || y >= foot(x)) continue;
          const i = (y * w + x) * 4; put(x, y, mixHex([d[i], d[i + 1], d[i + 2]], lav, dd < 0.4 ? 0.34 : 0.17));
        }
        // the bracket: a plate on the wall, an arm out into the room lit along its top, a brace with a curl under it;
        // the lantern hangs from the arm's end: a pointed cap, glass glowing round a white flame, a foot and a finial
        const ironC = { k: IC.m4, m: IC.m3, h: IC.m2, W: IC.white, A: IC.l0, B: IC.l1 };
        LANTERN.forEach((row, r) => [...row].forEach((ch, k) => { if (ironC[ch]) put(xw + k, yw + r - 1, ironC[ch]); }));
      }
      // the moonlight it lets in: each pane laid out across the flagstones, long and slanting, the mullions' shadows between
      const mz = 1.6, ms = 0.3, u0 = 0.05;
      for (let y = Math.floor(top); y <= Math.ceil(top + hw); y++) for (let x = Math.floor(cx - hw); x <= cx + hw * 0.2; x++) {
        const a = (x - cx) / hw, b = (y - top) / hh, u = (a + b) / 2, v = (b - a) / 2;
        if (u < 0.02 || v < 0.02 || u > 0.9 || v > 0.98) continue;
        const ga = Math.round(cx - (v - ms * u) * hw - xc), gz = Math.round(zg + (u - u0) * hw * mz);
        if (!isGlass(ga, gz)) continue;
        const i = (y * w + x) * 4, f = 1 - u / 0.75, edge = !isGlass(ga + 1, gz) || !isGlass(ga - 1, gz) || !isGlass(ga, gz + 2) || !isGlass(ga, gz - 2);
        const k = f + (PX_BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * 0.2 > 0.55 ? 0.5 : 0.34;
        if (edge) { put(x, y, mixHex([d[i], d[i + 1], d[i + 2]], lav, k * 0.6)); continue; }
        put(x, y, mixHex([d[i], d[i + 1], d[i + 2]], lav, k));
      }
    }
    else {
    // how far out a point is in the cave's pointed opening (1 on its edge): two arcs meeting at the top, a round foot
    const pointed = (lx, hy) => { const a = Math.abs(lx), k = wall / (hw * 0.14); return hy > 0.55 ? Math.hypot(a + 1.6, (hy - 0.55) * k) / 2.6 : hy < 0.44 ? Math.hypot(a, (0.44 - hy) * k) : a; };
    for (let x = Math.floor(cx - hw * 0.67); x <= Math.ceil(cx - hw * 0.33); x++) {
      const tt = (cx - x) / hw, base = top + tt * hh, lx = (tt - 0.5) / 0.14;
      for (let y = Math.floor(base - wall * 0.86); y < base - wall * 0.26; y++) {
        const hy = (base - y) / wall, archTop = kind === "ruin" ? 0.84 - 0.12 * Math.abs(lx) ** 1.6 : kind === "timber" ? 0.78 : 0.8 - 0.08 * lx * lx;
        // a cave's opening is hacked through the rock in a rough pointed arch: no frame, no sill, ragged edges
        if (kind === "cave") {
          const rough = 0.14 * pxNoise(x * 0.3 + seed, y * 0.3) + 0.08 * pxNoise(x * 0.9, y * 0.9 + seed);
          const r = pointed(lx * 0.95, hy);
          if (r > 1.05 + rough) continue;
          // a lip of rock round the hole: lit along its lower left, in shadow up top
          if (r > 0.9 + rough) { put(x, y, wallC[lx < 0 && hy < 0.6 ? 4 : 0]); continue; }
          // the rock is thick: you look down a short tunnel to the sky, its sides lit from inside on the left, dark on the right
          const ri = pointed((lx - 0.2) * 1.3, 0.55 + (hy - 0.6) * 1.3);
          if (ri > 1 + rough * 0.6) { const k = clamp((r - 0.35) / 0.55, 0, 1); put(x, y, isoTone(wallC, lx < 0.2 ? 0.2 + 0.45 * k : 0.08 + 0.12 * k, x, y)); continue; }
        } else {
          // the sill: a ledge under the window, a little wider than it, lit on top, its shadow on the wall below
          if (hy >= 0.28 && hy < 0.335 && Math.abs(lx) < 1.12) { put(x, y, hy > 0.315 ? sillC[1] : sillC[0]); continue; }
          if (hy >= 0.265 && hy < 0.28 && Math.abs(lx) < 1.12) { put(x, y, isoTone(kind === "timber" ? daub : wallC, 0.2, x, y)); continue; }
          // the timber hall's lintel: a heavy oak beam over the opening
          if (kind === "timber" && hy > archTop && hy < archTop + 0.045 && Math.abs(lx) < 1.12) { put(x, y, oak[hy > archTop + 0.035 ? 5 : hy < archTop + 0.01 ? 1 : 3]); continue; }
          if (Math.abs(lx) > 1 || hy > archTop || hy < 0.335 || hy > ruinH(tt) - 0.06) continue;
        }
        let col;
        if (kind === "cave") col = null;
        else if (Math.abs(lx) > 0.88 || hy > archTop - 0.03) col = kind === "timber" ? (lx > 0 ? daub[1] : daub[4]) : lx > 0 ? wallC[1] : wallC[4];   // the reveal: the wall's thickness
        else if (glazed && (Math.abs(lx) > 0.78 || hy > archTop - 0.075 || hy < 0.37)) col = oak[lx > 0 ? 2 : 4];  // the frame
        else if (kind === "timber") {
          // lead cames in diamonds: lines that follow the wall's slant one way and cross it the other
          const da = x - (cx - hw * 0.5), db = base - y, P = 8 * S, m1 = ((db + da * 1.4) / P % 1 + 1) % 1, m2 = ((db - da * 1.4) / P % 1 + 1) % 1;
          if (m1 * P < 1.3 || m2 * P < 1.3) col = ruinStone[1];
        }
        if (!col) {
          // the night outside
          col = pxPick(sky, 0.15 + (archTop - hy) * 1.5, x, y);
          if (hy < 0.405 + 0.022 * Math.sin(lx * 4 + seed) + 0.012 * Math.sin(lx * 11)) col = pxPick([sky[0], sky[1]], 0.35, x, y);   // far hills
          else {
            const st = pxHash(x, y + seed);
            if (st > 0.985) col = white; else if (st > 0.96) col = sky[3];
            // the moon is round on screen, whatever the wall's slant
            const mt = 0.5 + 0.14 * (kind === "cave" ? 0.32 : 0.38), mr = Math.max(2.5, hw * 0.04);
            const md = Math.hypot(x - (cx - hw * mt), y - (top + mt * hh - (kind === "cave" ? 0.66 : 0.68) * wall)) / mr;
            if (md < 1) col = md > 0.7 && pxHash(x, y) > 0.6 ? sky[3] : moon; else if (md < 1.5 && PX_BAYER[(y & 3) * 4 + (x & 3)] < 0.4) col = sky[3];
          }
        }
        put(x, y, col);
      }
    }
    // the moonlight it lets in: a pale, sparse patch on the floor below it
    for (let y = Math.floor(top); y <= Math.ceil(top + hw); y++) for (let x = Math.floor(cx - hw); x <= cx; x++) {
      const a = (x - cx) / hw, b = (y - top) / hh, u = (a + b) / 2, v = (b - a) / 2;
      if (u < 0.03 || u > 0.3 || v < 0.38 + u * 0.3 || v > 0.62 + u * 0.3) continue;
      if (PX_BAYER[(y & 3) * 4 + (x & 3)] < 0.18 * (1 - u / 0.3)) put(x, y, sky[3]);
    }
    }
    if (kind === "ruin") {
      // tufts of grass at the foot of the walls, and a fallen block or two
      for (let k = 0; k < 24; k++) {
        const s0 = pxHash(k, seed), side = k % 2 ? 1 : -1, [fx, fy] = side < 0 ? at(0.02, s0) : at(s0, 0.02);
        for (let j = 0; j < 3; j++) put(fx + j - 1, fy - (j === 1 ? 2 : 1), moss[j === 1 ? 2 : 1]);
      }
      for (const [u0, v0] of [[0.86, 0.12], [0.1, 0.9]]) { const [bx, by] = at(u0, v0); for (let yy = 0; yy < 4; yy++) for (let xx = -4; xx <= 4; xx++) put(bx + xx, by - yy, pxPick(ruinStone, yy === 3 ? 0.8 : xx < 0 ? 0.55 : 0.35, xx, yy)); }
    }
    if (shop) shop.paint();
    const glowing = mood && paintMood({ mood, put, d, w, h, at, cx, top, hw, hh, wall, S, seed, lights, art, crys, oak, ashlar, ice, wallC, plH });
    // what the room is for, built into it whatever its look: the study's crystals, the playroom's slide and climbing wall, the moss garden's moss
    const fixed = atHome() && paintFixtures(roomKindNow, { put, d, w, h, at, cx, top, hw, hh, wall, S, seed, lights, art, crys, mossC, mossy, tops });
    shine(lights);
    if (shop) shop.after();
    if (glowing) glowing();
    if (fixed) fixed();
    if (garden || mood === "grotto") c.spring = paintMossGarden({ put, d, w, h, at, cx, top, hw, hh, wall, S, seed, mossC, dirt, crys, whole: garden });
    else if (kind === "cave" && mood !== "gallery" && !crypt) {
      // crystals growing at the foot of the walls, in the back corner and at both ends: facets lit on the left, a pale tip
      for (const [bx, by, n] of [[cx, top, 5], [cx - hw * 0.92, top + hh * 0.92, 3], [cx + hw * 0.92, top + hh * 0.92, 3]]) for (let k = 0; k < n; k++) {
        const ox = bx + (k - n / 2) * 2.4 * S, hgt = (4 + Math.round(pxHash(k + bx, seed) * 8)) * S, ww = (1.4 + pxHash(k, 3)) * S;
        for (let yy = 0; yy < hgt; yy++) { const hw2 = ww * (1 - yy / hgt); for (let xx = -Math.ceil(hw2); xx <= Math.ceil(hw2); xx++) put(ox + xx, by + 2 - yy, yy >= hgt - 1 ? crys[4] : xx < 0 ? crys[3] : xx === 0 ? crys[2] : crys[1]); }
      }
    }
  } else {
    // the two back edges: a low dry-stone wall, or a woven wattle fence on stakes
    for (const side of [-1, 1]) for (let x = Math.floor(side < 0 ? cx - hw : cx); x <= Math.ceil(side < 0 ? cx : cx + hw); x++) {
      const tt = Math.abs(x - cx) / hw, base = top + tt * hh, al = tt * hw, sl = -side;
      if (roomKindNow === "snow") {
        // the snowfields: a drift banked up along the back, rounded, lit on its top and in shade down its face, the wind's
        // ripples in it; lower toward the front corners
        const hgt = Math.round((7 + 4 * pxNoise(al * 0.06, seed) - 3 * tt) * S);
        for (let z = 0; z < hgt; z++) { const f = z / hgt; put(x, base - z, isoTone(ground, (sl > 0 ? 0.5 : 0.36) + 0.5 * f * f + (Math.abs(pxNoise(al * 0.2, z * 0.4) - 0.5) < 0.04 ? -0.12 : 0), x, base - z, 0.3)); }
        continue;
      }
      if (kind === "yard") {
        const hgt = Math.round(8 * S);
        for (let z = 0; z < hgt; z++) {
          const r = Math.floor(z / 3), fz = z % 3, L = 6 + Math.round(pxHash(r, 5) * 3), a = al + r * 3.5, fa = a % L, si = Math.floor(a / L);
          let v = (sl > 0 ? 0.55 : 0.35) + 0.2 * (pxHash(si, r + seed) - 0.5);
          if (fz === 0 || fa < 1) v = 0.05; else if (fz === 2 || (sl > 0 ? fa > L - 1.5 : fa < 2)) v += 0.2;
          put(x, base - z, z === hgt - 1 ? stone[3] : isoTone(stone, v, x, base - z));
        }
        continue;
      }
      const hgt = Math.round(11 * S), st = 12 * S, sa = ((al % st) + st) % st;
      // the stakes stand up through the weave; the hazel rods pass in front of one and behind the next
      if (sa < 1.6 * S) { for (let z = 0; z < hgt + 2; z++) put(x, base - z, z >= hgt + 1 ? oak[4] : oak[sa < 0.8 * S === sl > 0 ? 3 : 1]); continue; }
      for (let z = 0; z < hgt; z++) {
        const row = Math.floor(z / 2), over = (Math.floor(al / st) + row) % 2, mid = Math.abs(sa - st / 2) / (st / 2);
        let v = (over ? 0.62 : 0.42) - (over ? 0 : mid * 0.2) + (z % 2 ? 0.12 : -0.1);
        if (pxHash(x, row + seed) > 0.9) v -= 0.15;
        put(x, base - z, z === hgt - 1 ? oak[4] : isoTone(oak, v, x, base - z));
      }
      put(x, base + 1, ground[1]);
    }
  }
  // what holds things up: hooks indoors, wooden posts outdoors
  const post = (x, y0, y1) => { for (let y = Math.round(y1); y <= Math.round(y0); y++) { put(x - 1, y, wood[0]); put(x, y, wood[2]); put(x + 1, y, wood[1]); } };
  const wallTopQ = x => q(isoWallTop(x * PX));
  if (hasDecor("lights")) for (const k of [-0.94, 0, 0.94]) {
    const x = cx + k * hw, [, fy] = k < 0 ? at(0, 0.94) : k > 0 ? at(0.94, 0) : at(0, 0);
    if (indoor) { put(x, wallTopQ(x) + 2, pxHex("#8a8494")); } else post(Math.round(x), fy, wallTopQ(x) + 4);
  }
  if (hasDecor("shelf") && !indoor) { const [shx, shy] = roomSpot("shelf"), py = q(shy - N.base * 0.95 * N.dk), [, fy] = at(0.22, 0); post(Math.round(q(shx) - 3), fy, py); post(Math.round(q(shx) + 4), fy + 2, py + 3); }
  if (hasDecor("painting")) {
    // a framed night with a moon, on its wall's plane (a parallelogram that follows the wall), in the slot it was put in
    const slot = wallSlot("painting"), sg = slot.wall === "L" ? -1 : 1, mid = (slot.s + 0.5) / ISO_G;
    const s0 = Math.max(0.03, mid - 0.11), s1 = Math.min(0.97, s0 + 0.22), z0 = indoor ? 0.48 : 0.0, z1 = indoor ? 0.82 : 0.0;
    if (indoor) for (let x = Math.floor(Math.min(cx + sg * hw * s0, cx + sg * hw * s1)); x <= Math.ceil(Math.max(cx + sg * hw * s0, cx + sg * hw * s1)); x++) {
      const tt = sg * (x - cx) / hw, base = top + tt * hh, lx = (tt - s0) / (s1 - s0);
      for (let y = Math.floor(base - wall * z1); y <= base - wall * z0; y++) {
        const hy = (base - y) / wall, ly = (hy - z0) / (z1 - z0), edge = lx < 0.09 || lx > 0.91 || ly < 0.1 || ly > 0.9;
        // inside the frame: whichever picture was chosen (tap the painting to change it)
        put(x, y, edge ? (lx < 0.09 || ly > 0.9 ? IC.w0 : IC.w2) : PAINTINGS[(save.paintScene || 0) % PAINTINGS.length].px((lx - 0.09) / 0.82, (ly - 0.1) / 0.8, x, y));
      }
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** How wide each piece's contact shadow is, in tiles across (pieces that stand on legs or roots, or sit squat on the floor). */
const CONTACT = { bed: 1.5, lamp: 0.42, table: 0.62, chest: 0.82, musicbox: 0.74, swing: 0.9, mushrooms: 0.78, armchair: 0.8, bookcase: 0.72,
  plant: 0.44, keepjar: 0.4, bowl: 0.6, drum: 0.55, blocks: 0.7, telescope: 0.6, bench: 0.8, lamppost: 0.4, birdbath: 0.5 };
/** The isometric room's furniture, back to front: the pixel pieces on the floor, then the swing and the lights on the walls. */
function drawRoomIso() {
  if (!isPlace()) drawBaked(isoRug(hasDecor("rug")));
  if (arrange.on) drawArrangeGrid();
  if (hasDecor("cushion")) drawCloudShadow();
  drawWeatherGround();
  const items = [];
  // each piece casts a soft shadow on the floor, away from the light (top left), before anything is drawn on it
  ctx.save(); ctx.fillStyle = "rgba(10,4,24,.36)";
  for (const p of Object.values(isoLayout().placed)) {
    if (["rack", "wallmap", "halllamp", "swing", "shelves", "shelves2", "jars", "bed"].includes(p.id)) continue;
    const g0 = ISO_G, k = 0.28, pts = [[p.i + k, p.j], [p.i + p.fw + k, p.j], [p.i + p.fw + k, p.j + p.fd], [p.i + k, p.j + p.fd]].map(([u, v]) => isoAt(u / g0, v / g0));
    ctx.beginPath(); pts.forEach(([x, y], n) => n ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
  }
  // and where it touches the floor, a soft contact shadow: a dark core right under it fading out in two steps
  for (const p of Object.values(isoLayout().placed)) {
    const r = CONTACT[p.id]; if (!r) continue;
    const [x, y] = isoAt((p.i + p.fw / 2 + 0.06) / ISO_G, (p.j + p.fd / 2 + 0.06) / ISO_G), rx = r * N.isoW / ISO_G;
    for (const [k, a] of [[1, 0.14], [0.68, 0.18], [0.4, 0.2]]) { ctx.fillStyle = `rgba(10,4,24,${a})`; ctx.beginPath(); ctx.ellipse(x, y, rx * k, rx * k / 2, 0, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
  for (const p of Object.values(isoLayout().placed)) {
    const fy = isoAt((p.i + p.fw) / ISO_G, (p.j + p.fd) / ISO_G)[1];
    const box = { u0: p.i, u1: p.i + p.fw, v0: p.j, v1: p.j + p.fd, id: p.id };
    if (p.id === "incubator") { items.push({ y: fy, box, draw: drawIncubator }); continue; }
    if (p.id === "swing") { items.push({ y: fy, box, draw: () => drawSwingIso(p) }); continue; }
    // (pressed, a thing in a place dips a pixel before it does what it does)
    const fx = decorFx[p.id] !== undefined ? fxAge(p.id) : 9, bob = fx < 0.5 ? -Math.round(Math.sin(fx / 0.5 * Math.PI) * 2) * PX : propPressed(p.id) ? PX : 0;
    const extra = pieceExtra(p);
    const layers = p.id === "bed" && BED_LAYERS[extra.style];
    if (layers) {
      // whoever lies or stands on it goes between its layers: behind the gazebo's front post, down in the hollow of the
      // geode or the root nest, inside the hammock's sling (its front is drawn again over them)
      extra.part = "base";
      if (layers.includes("post")) items.push({ y: fy, box: { ...box, id: "bedpost" }, roofOf: "bed", draw: () => drawBaked(isoPiece(p, { ...extra, part: "post" }), 0, bob) });
      // whoever naps there hides under the gazebo's roof or the glowcap's cap
      if (layers.includes("roof")) items.push({ y: fy, box: { ...box, id: "bedroof" }, roofOf: "bed", after: layers.includes("post") ? "bedpost" : null, draw: () => drawBaked(isoPiece(p, { ...extra, part: "roof" }), 0, bob) });
    }
    items.push({ y: fy, box, draw: () => { const f = isoPiece(p, extra); pieceHits[p.id] = { c: f.c, x: f.x + Math.round(bob / PX) * PX, y: f.y }; if (game.seek?.spot === p.id) drawSeekPeek(); drawBaked(f, seekWiggle(p.id), bob); if (PROP_CUES[p.id]) propCue(p.id, f, bob); } });
  }
  if (hasDecor("shelf")) items.push({ y: -2, draw: drawShelfIso });
  if (save.rooms[save.room]?.kind === "shop") items.push({ y: -3, draw: drawShopSign });
  if (hasDecor("lights")) items.push({ y: -1, draw: lightsIso });
  if (weather.drops.length) items.push({ y: 1e6, top: true, draw: drawWeatherAir });
  if (hasDecor("cushion")) items.push({ y: 1e6, top: true, id: "cushion", draw: drawCloud });
  const shaft = roomShaft();
  if (shaft) items.push({ y: 1e6, top: true, draw: () => drawMossLight(shaft) });
  return items;
}

/** What sort of place each backdrop is: a hollow in the cave wall, an abbey hall, or a clearing under the sky. */
const ROOM_KIND = { smithy: "timber", amethyst: "cave", celestite: "cave", malachite: "cave", labradorite: "cave", frost: "cave", abbey: "hall", churchyard: "ruin", glowcap: "wood", summit: "yard" };

const geodeImgs = new Map();
function geodeImg(id) {
  const g = save.geodes[id];
  if (!g) return null;
  if (!g.img) { g.img = crystalThumb(id); persist(); }
  let im = geodeImgs.get(id);
  if (!im || im.src !== g.img) { im = new Image(); im.src = g.img; geodeImgs.set(id, im); }
  return im.complete ? im : null;
}

function swingSeat() {
  const p = isoLayout().placed.swing;
  if (p) {
    const tw = N.isoW / ISO_G, [cx, cy] = isoAt((p.i + 0.5) / ISO_G, (p.j + 0.5) / ISO_G), top = cy - (Math.round(tw / PX * 1.8) + 1) * PX;
    const len = (cy - top) * 0.72, a = Math.sin(game.time * 0.0012 * (1 + swingPush)) * (0.18 + swingPush);
    // the bar runs along the wall behind it, and the seat swings out into the room and back
    const sw = p.flip ? [0.894, 0.447] : [-0.894, 0.447], bar = p.flip ? [-tw * 0.3, N.isoH / ISO_G * 0.3] : [tw * 0.3, N.isoH / ISO_G * 0.3];
    return [cx + sw[0] * Math.sin(a) * len * 0.8, top + Math.cos(a) * len + sw[1] * Math.sin(a) * len * 0.8, a, top, bar, cx, cy];
  }
  // (out, but with no room on the floor for it: hung from the wall above its spot)
  const [x, y] = decorSpot("swing"), top = isoWallTop(x) + 3;
  const len = y - N.base * 0.95 - top, a = Math.sin(game.time * 0.0012 * (1 + swingPush)) * (0.18 + swingPush);
  return [x + Math.sin(a) * len, top + Math.cos(a) * len, a, top];
}

/** The fairy lights strung round the isometric room's walls, each bulb in its own glow (pxGlow). */
function lightsIso() {
  const cols = ["#ffe9a8", "#ff9ecb", "#8fd8ef", "#b9e88a", "#c9b8ff"];
  ctx.strokeStyle = "rgba(230,224,255,.45)"; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let k = 0; k <= 40; k++) { const [px, py] = lightsLine(k / 40); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.stroke();
  for (let i = 1; i < 14; i++) {
    const [bx, by] = bulbPos(i);
    const col = cols[i % cols.length], rung = fxAge("bulb" + i), lit = rung < 0.7 ? 1 - rung / 0.7 : 0;
    const k = Math.min(1, 0.55 + 0.45 * Math.sin(game.time * 0.003 + i * 1.3) + lit), r = 14 + lit * 12;
    pxGlow(bx, by, r * 1.4, col, k);
    ctx.fillStyle = lit ? "#fff" : col; ctx.beginPath(); ctx.arc(bx, by, 3.5 + lit * 2, 0, TAU); ctx.fill();
  }
}
