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
 * straight legs. If the goal is inside a piece, the way ends at the nearest free spot. Points are in CSS pixels.
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
  const end = isoAt(U1 / ISO_G, V1 / ISO_G);
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
  if (N.iso) {
    const m = isoMargin(0.42), x0 = a.x, y0 = a.y; let [u, v] = isoFrom(a.x, a.y); [a.x, a.y] = isoAt(clamp(u, m, 1 - m), clamp(v, m, 1 - m));
    if (a.state !== "visit" || (a.decor !== "swing" && a.decor !== "mushrooms")) pushOutOfPieces(a);
    [u, v] = isoFrom(a.x, a.y); [a.x, a.y] = isoAt(clamp(u, m, 1 - m), clamp(v, m, 1 - m));
    // a little slide happens at once; a big one (stepping off the swing or the caps, a piece put down on it) is a quick eased shuffle, not a jump
    if (dt && Math.hypot(a.x - x0, a.y - y0) > N.base * 0.04) { a.x = lerp(x0, a.x, Math.min(1, dt * 5)); a.y = lerp(y0, a.y, Math.min(1, dt * 5)); }
    return;
  }
  a.y = clamp(a.y, N.y0, N.y1);
  const h = N.iso ? N.isoW : floorHalf(a.y) - N.base * 0.42;
  a.x = clamp(a.x, N.cx - h, N.cx + h);
  if (a.alt > N.base * 0.3 || a.state === "sleep" || a.state === "toBed" || a.state === "visit") return;
  for (const o of game.nest.obst || []) {
    if (o.id === a.decor || o.id === a.goal || (o.id === "bed" && a.state === "nap")) continue;
    const dx = (a.x - o.x) / o.rx, dy = (a.y - o.y) / o.ry, d = Math.hypot(dx, dy);
    if (d < 1) { const k = d > 0.01 ? 1 / d : 1; a.x = o.x + dx * k * o.rx; a.y = o.y + (d > 0.01 ? dy * k : 1) * o.ry; }
  }
  a.y = clamp(a.y, N.y0, N.y1);
}
const depth = y => N.iso ? (W < 520 ? 0.74 : 0.66) : lerp(0.72, 1, clamp((y - N.y0) / (N.y1 - N.y0), 0, 1));

function syncActors() {
  const list = roomCreatures(), ids = new Set(list.map(c => c.id));
  for (const id of actors.keys()) if (!ids.has(id)) actors.delete(id);
  for (const cr of list) {
    if (actors.has(cr.id)) continue;
    const [x, y] = roomPoint();
    actors.set(cr.id, { id: cr.id, x, y, tx: x, ty: y, alt: 0, state: "idle", t: rand(0.5, 2.5), hop: 0, ph: rand(0, TAU), emote: null, friend: null, beh: specOf(cr).beh || BEHAVIOR[cr.sp] || "dance" });
  }
}

/** Where a glowling is drawn: its center and size (smaller further back in the room). */
function actorView(a) {
  const k = depth(a.y), size = N.base * k;
  return { x: a.x + (a.shake ? Math.sin(game.time * 0.045) * a.shake * size * 0.08 : 0), y: a.y - size * 0.45 - a.alt - (a.perch || 0), size, k };
}

const activeActor = () => { const cr = activeCreature(); return cr ? actors.get(cr.id) : null; };
const emote = (a, text, life = 1.6) => { a.emote = { text, t: 0, life }; };

function actorAt(x, y) {
  let best = null;
  for (const a of actors.values()) {
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

/** Slept enough: a stretch and a yawn, and up it gets. */
function wakeRested(cr, a) {
  cr.sleeping = false; cr.selfSlept = false;
  a.hop = 1; a.state = "idle"; a.t = 1.5; emote(a, "☀", 1.6);
  sfx.stretch(specOf(cr).voice);
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

/** Pick what to do next: nap, dance, visit a friend, or wander (flutterers chase the light motes). */
function chooseNext(a, list) {
  // content: as often as not it stays where it is and looks about (or, a bit tired, dozes off); a hungry one perks up instead
  const cr = save.creatures.find(c => c.id === a.id);
  if (cr && content(cr) && Math.random() < 0.55) {
    if (cr.energy < 60 && Math.random() < 0.3) { a.state = "nap"; a.t = rand(5, 9) * calmOf(cr.level).rest; return; }
    a.state = "idle"; a.t = rand(3, 6) * linger(cr); return;
  }
  // outside, hoppers and swimmers like the garden best: they walk over and water a thirsty plant
  const gp = isOutside() && N.iso && isoLayout().placed.garden;
  if (gp && ["hop", "swim"].includes(a.beh) && Math.random() < 0.25) {
    [a.tx, a.ty] = isoPieceAt(gp, 0.8); a.state = "walk"; a.garden = true; return;
  }
  if (weatherOn() && Math.random() < 0.8) { playInWeather(a); return; }
  const r = Math.random(), b = a.beh;
  const loved = DECOR.filter(d => hasDecor(d.id) && d.lovers.includes(b));
  if (loved.length && Math.random() < 0.4) {
    const d = pick(loved), [x, y] = decorSpot(d.id);
    a.goal = d.id; a.state = "walk";
    if (d.id === "rug") { const an = rand(0, TAU), r = Math.sqrt(Math.random()), [rx, ry] = rugSize(); a.tx = x + Math.cos(an) * r * rx * 0.8; a.ty = y + Math.sin(an) * r * ry * 0.75; return; }
    a.tx = x + rand(-0.25, 0.25) * N.base; a.ty = clamp(y + rand(-0.1, 0.1) * N.base, N.y0, N.y1);
    return;
  }
  // hoppers like bouncing on the bed now and then
  if (N.iso && b === "hop" && r < 0.15 && isoLayout().placed.bed) {
    const p = isoLayout().placed.bed; [a.tx, a.ty] = isoAt((p.i + p.fw * rand(0.3, 0.7)) / ISO_G, (p.j + p.fd * rand(0.3, 0.7)) / ISO_G);
    a.state = "walk"; emote(a, "♪", 1.2); return;
  }
  if (b === "nap" && r < 0.35) { a.state = "nap"; a.t = rand(5, 10); emote(a, "zz", 2.5); return; }
  if (b === "dance" && r < 0.3) { a.state = "dance"; a.t = rand(1.6, 2.8); emote(a, "♪", 1.6); return; }
  const others = list.filter(o => o !== a);
  if (others.length && r < (b === "curious" ? 0.5 : 0.18)) {
    const f = pick(others);
    a.friend = f.id; a.state = "walk";
    a.tx = clamp(f.x + (a.x < f.x ? -1 : 1) * N.base * 1.0, N.x0, N.x1); a.ty = f.y;
    return;
  }
  [a.tx, a.ty] = roomPoint();
  a.state = "walk";
  if (b === "flutter" && Math.random() < 0.4) emote(a, "✦", 1);
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
    emote(a, "♥"); emote(f, "♥"); sfx.chirp(specOf(cr).voice * 1.1);
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
}

/** A hopper's way forward comes in pushes, one per hop (on average as fast as a steady walk). */
const hopGate = a => Math.sin(((a.gait || 0) % 1) * Math.PI) * Math.PI / 2;

// little faces while it rests, now and then: a blink, a contented squint, a look aside, a thought. Which ones, by character
const FACE_MIX = { sleepy: { squint: 2, look: 1, think: 1, blink: 1 }, curious: { think: 3, look: 3, squint: 1, blink: 1 }, sparkle: { blink: 3, look: 3, think: 1, squint: 1 }, big: { look: 2, think: 2, blink: 2, squint: 1 }, round: { blink: 2, look: 2, think: 1, squint: 1 } };
const FACE_LIFE = { blink: 0.4, squint: 1.1, look: 2, think: 2.4 };
function faceMoments(a, cr, dt) {
  const calm = calmOf(cr.level), resting = a.state === "idle" && !cr.sleeping && !(a.id === save.active && game.nest.petting);
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
  for (const a of list) {
    const cr = save.creatures.find(c => c.id === a.id);
    if (!cr) continue;
    a.ph += dt;
    if (a.emote && (a.emote.t += dt) > a.emote.life) a.emote = null;
    a.hop = Math.max(0, a.hop - dt * 1.8);
    if (a.shake) a.shake = Math.max(0, a.shake - dt * 1.4);
    // every few seconds: real time catches up, and a very tired glowling takes itself to bed (and gets up again when rested)
    if ((a.needT = (a.needT ?? rand(0, 3)) - dt) < 0) {
      a.needT = 4;
      applyTime(cr);
      const petted = a.id === save.active && game.nest.petting;
      // sleepy: a yawn, and off it goes to bed by itself (not right after you woke it up, though)
      if (!cr.sleeping && cr.energy < 20 && !petted && a.state !== "eat" && Date.now() - (cr.wokeAt || 0) > 3 * 60e3) { cr.sleeping = true; cr.selfSlept = true; emote(a, "🥱", 2.2); sfx.yawn(); a.hop = 1; persist(); if (a.id === save.active) renderNest(); }
      else if (cr.sleeping && cr.energy >= 99) wakeRested(cr, a);
    }
    // an unhurried pace, slower with age, and a stroll when there's nothing it needs
    const calm = calmOf(cr.level), base = (a.beh === "flutter" || a.beh === "swim" ? 85 : a.beh === "nap" ? 35 : 55) * N.base / 100 * 0.8 * calm.go;
    let speed = base * (a.rain ? 1.6 : content(cr) ? 0.85 : 1), target = null;
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
    // someone is being fed: the hungry ones come running, hoping for a crumb
    const fc = game.nest.feedCall;
    if (!target && !cr.sleeping && fc && game.time - fc.t < 3500 && a.id !== fc.id && cr.tummy < 60 && a.state !== "eat" && actors.get(fc.id)) {
      const f = actors.get(fc.id), an = a.id * 2.4;
      if (a.state !== "begging") { emote(a, SNACKS[specOf(cr).snack].emoji, 1.8); a.hop = 1; }
      a.state = "begging"; a.goal = a.friend = null; a.rain = false;
      target = [f.x + Math.cos(an) * N.base * 0.75, f.y + Math.sin(an) * N.base * 0.4];
      speed = base * 2.6;
    } else if (a.state === "begging") { a.state = "idle"; a.t = rand(1, 2); }
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
    if (a.id === save.active && game.nest.petting) { a.tx = a.x; a.ty = a.y; a.state = "idle"; a.t = 1.5; }
    else if (target) { a.tx = target[0]; a.ty = target[1]; }
    else if (a.state === "eat") { if ((a.t -= dt) <= 0) { a.state = "idle"; a.t = rand(1, 2) * linger(cr); } }
    else if (a.state === "idle" || a.state === "nap" || a.state === "dance" || a.state === "visit") { if ((a.t -= dt) <= 0) { a.decor = null; chooseNext(a, list); } }

    // a little personal space: glowlings gently push apart instead of piling up
    // (except on the way to bed: sleepy ones squeeze in and cuddle up)
    if (a.state !== "sleep" && a.state !== "visit" && a.state !== "toBed") for (const o of list) {
      if (o === a || o.state === "sleep" || o.state === "visit" || o.state === "toBed") continue;
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
    const walking = N.iso && !tucking && !["nap", "dance", "eat", "sleep", "visit"].includes(a.state) && !(a.id === save.active && game.nest.petting);
    const wp = walking ? nextWaypoint(a, dt) : null;
    const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
    if (a.state === "toBed" && d <= 8) { a.state = "sleep"; a.hop = 1; } // close enough: lie down (the room's edge may keep the exact spot just out of reach)
    const still = ["nap", "dance", "eat", "sleep", "visit"].includes(a.state);
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
      if (a.stuck > 1.5) { a.stuck = 0; a.lastX = a.lastY = undefined; a.goal = a.friend = null; a.rain = false; if (a.state === "walk" || a.state === "idle") { a.state = "idle"; a.t = rand(0.5, 1.5) * linger(cr); a.tx = a.x; a.ty = a.y; } else a.repath = 0; }
    } else if (moving) {
      const hopper = a.beh === "hop";
      const step = Math.min(d, speed * dt * (hopper ? hopGate(a) : 1));
      a.x += dx / d * step; a.y += dy / d * step;
    } else if (a.state === "walk" && a.goal) {
      // arrived at a favorite thing
      const d = DECO[a.goal];
      a.decor = a.goal; a.goal = null;
      a.state = d.id === "cushion" ? "nap" : d.id === "rug" ? "dance" : "visit";
      if (d.id === "swing" || d.id === "mushrooms") { a.from = [a.x, a.y, a.alt]; a.blend = 0; }
      a.t = (d.id === "cushion" ? rand(6, 10) : rand(3, 6)) * calm.rest;
      emote(a, d.emote, 2);
      if (a.id === save.active) floatText(`${specOf(cr).name} ${d.verb}`, a.x, a.y - N.base * 1.2, "#e6e0ff");

    } else if (a.state === "walk" && a.rain) {
      // under the cloud: a little dance in the rain (or snow)
      a.rain = false; a.state = "dance"; a.t = rand(0.9, 1.6); a.hop = 1;
      emote(a, weather.kind === "snow" ? "❄" : "💧", 1.2);
    } else if (a.state === "walk" && a.garden) {
      a.garden = false; a.state = "idle"; a.t = rand(1.5, 3) * linger(cr); emote(a, "💧", 1.6); gardenHelp(cr);
    } else if (a.state === "walk") {
      a.state = "idle"; a.t = rand(1.2, 3.5) * linger(cr);
      const f = a.friend && actors.get(a.friend);
      if (f) meetFriend(a, f, cr);
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
    else if (N.iso && a.state === "nap" && a.decor === "cushion") { const c = cloudSpot(); ease(a.y - c.bodyY + N.isoW / ISO_G * 0.75, 5); }
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
    faceMoments(a, cr, dt);
    // needs show up as little thought bubbles now and then
    const wants = callOf(cr);
    if (!a.emote && a.state !== "sleep" && Math.random() < dt * (wants ? 0.4 : 0.07)) {
      const m = moodOf(cr);
      if (wants === "messy") emote(a, "!", 2.2);
      else if (m === "hungry") emote(a, SNACKS[specOf(cr).snack].emoji, 2.2);
      else if (m === "sleepy") emote(a, "zz", 2.2);
      else if (m === "sad") emote(a, "…", 2.2);
      // the one you're looking after beeps for you now and then
      if (wants && a.id === save.active && Math.random() < 0.3) sfx.chirp(specOf(cr).voice * 1.2);
    }
  }
}

function drawRoom() {
  const { y1 } = N, cx = N.cx, kind = ROOM_KIND[currentTheme()] || "cave";
  // the walls and floor of this backdrop, painted once in art pixels
  const rk = `${currentTheme()}|${isPlace() ? save.rooms[save.room].kind : ""}|${W}|${H}|${PX}|${hasDecor("swing")}|${hasDecor("lights")}|${hasDecor("shelf")}|${hasDecor("painting")}|${JSON.stringify(wallSlot("painting"))}|${save.paintScene || 0}`;
  if (roomCanvas.key !== rk + N.iso) { roomCanvas.key = rk + N.iso; roomCanvas.c = N.iso ? paintRoomIso(currentTheme()) : paintRoom(currentTheme()); }
  ctx.drawImage(roomCanvas.c, 0, 0, W, H);
  // a round window onto the night sky in the cave wall (the abbey has its own arched one; outdoors the sky is already there)
  const wr = N.win.r, wy = N.win.y;
  if (wr > 0 && kind === "cave" && !N.iso) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, wy, wr, 0, TAU);
    const sky = ctx.createLinearGradient(0, wy - wr, 0, wy + wr);
    sky.addColorStop(0, "#0d0a2a"); sky.addColorStop(1, "#2d2468");
    ctx.fillStyle = sky; ctx.fill();
    ctx.clip();
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 22; i++) {
      ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(game.time * 0.001 + i));
      ctx.fillRect(cx + Math.sin(i * 12.9898) * wr * 0.9, wy + Math.cos(i * 78.233) * wr * 0.9, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff8d6";
    ctx.beginPath(); ctx.arc(cx + wr * 0.4, wy - wr * 0.35, wr * 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = "#0d0a2a";
    ctx.beginPath(); ctx.arc(cx + wr * 0.48, wy - wr * 0.42, wr * 0.17, 0, TAU); ctx.fill();
    ctx.restore();
    // a solid stone frame, three art pixels thick, with a lit inner edge
    ctx.beginPath(); ctx.arc(cx, wy, wr + PX, 0, TAU);
    ctx.strokeStyle = "#160c26"; ctx.lineWidth = PX * 3.2; ctx.stroke();
    ctx.strokeStyle = "#523a85"; ctx.lineWidth = PX * 1.2; ctx.stroke();
  }
  // moonlight falling through the window onto the floor
  if ((kind === "cave" || kind === "hall") && !N.iso) {
    const ray = ctx.createLinearGradient(0, wy, 0, y1);
    ray.addColorStop(0, "rgba(230,224,255,.09)"); ray.addColorStop(1, "rgba(230,224,255,0)");
    ctx.fillStyle = ray;
    ctx.beginPath(); ctx.moveTo(cx - wr * 0.7, wy); ctx.lineTo(cx + wr * 0.7, wy); ctx.lineTo(cx + wr * 1.7, y1); ctx.lineTo(cx - wr * 1.7, y1); ctx.closePath(); ctx.fill();
  }
  if (N.iso) return drawRoomIso();
  // a round woven rug in solid rings, in the middle of the floor
  const [rcx, rcy] = roomSpot("rug"), [rrx, rry] = rugSize();
  const starry = hasDecor("rug");
  drawBaked(cachedSprite(roomSprites, "rug", `${rcx}|${rcy}|${rrx}|${rry}|${PX}|${starry ? Math.floor(game.time / 250) : ""}`, () => bakeSprite(rcx, rcy, rrx, () => {
    ["#5c1f3f", "#8f3460", "#c25586", "#8f3460", "#5c1f3f"].forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(rcx, rcy, rrx * (1 - i * 0.19), rry * (1 - i * 0.19), 0, 0, TAU); ctx.fill();
    });
    if (starry) drawStarryRug(rcx, rcy, rrx, rry);
  }, { up: rry / rrx + 0.08, down: rry / rrx + 0.08, side: 1.06 })));
  // furniture from the back of the room to the front, so nearer things overlap farther ones
  const items = [{ y: N.bedY, draw: () => drawCushion(N.bedX, N.bedY + N.base * 0.1 * depthK(N.bedY), N.base * 0.72 * depthK(N.bedY)) },
    ...(incHere() ? [{ y: incSpot()[1], draw: drawIncubator }] : [])];
  // pieces made only as isometric pixel art stand in the room as they are, at their own spots
  for (const d of DECOR) if (hasDecor(d.id) && d.iso && !d.wall && !DRAW_DECOR[d.id] && ISO_ART[d.id]) {
    const [x, y] = decorSpot(d.id), k = depthK(y), tw = Math.max(6, Math.round(N.base * k * 0.6 / PX)), pad = Math.ceil(tw * 1.2) + 3;
    const w = Math.ceil(2 * tw + pad * 2), h = tw + tw * 2 + pad, ax0 = tw + pad, ay = tw * 2 + pad / 2;
    const extra = pieceExtra({ id: d.id });
    items.push({ y, draw: () => drawBaked(cachedSprite(roomSprites, d.id, `front|${x}|${y}|${tw}|${PX}|${JSON.stringify(extra)}`,
      () => ({ c: isoArt(w, h, T => ISO_ART[d.id](tw, T, ax0, ay, extra)), x: Math.round(x / PX - ax0) * PX, y: Math.round(y / PX - ay - tw) * PX }))) });
  }
  for (const d of DECOR) if (hasDecor(d.id) && d.id !== "rug" && DRAW_DECOR[d.id]) {
    const [x, y] = decorSpot(d.id);
    // the swing and the lights are thin lines on the wall; the rest are baked
    if (d.id === "swing" || d.id === "lights") { items.push({ y: d.id === "lights" ? -1 : N.back, draw: () => DRAW_DECOR[d.id](x, y) }); continue; }
    const k = d.id === "shelf" ? N.dk : depthK(y);
    // decorations animate gently, so a new frame five times a second is plenty
    items.push({ y: d.id === "shelf" ? -1 : y, draw: () => { decorK = k; drawBaked(cachedSprite(roomSprites, d.id, `${x}|${y}|${N.base}|${k}|${PX}|${save.decor[d.id].off}|${Math.floor(game.time / 200)}`,
      () => bakeSprite(x, y - N.base * 0.6 * k, N.base * k, () => DRAW_DECOR[d.id](x, y), { up: 2.4, down: 1.1, side: 1.8 }))); decorK = 1; } });
  }
  return items;
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
  if (!texIndex) { texIndex = new Map(); for (const [kind, ramp] of TEX_RAMPS) ramp.forEach((k, i) => { const c = IC[k]; texIndex.set((c[0] << 16) | (c[1] << 8) | c[2], { kind, ramp: ramp.map(n => IC[n]), i }); }); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4; if (d[o + 3] === 0 || glowPx.has(y * w + x)) continue;
    const m = texIndex.get((d[o] << 16) | (d[o + 1] << 8) | d[o + 2]); if (!m) continue;
    const dir = dirs ? dirs[y * w + x] : 0;
    // wood's brightest shade drops a step (real timber is brown, not orange); the others keep their contrast
    let sh = texShade(m.kind, x, y, dir) + (m.kind === "wood" && m.i === m.ramp.length - 1 ? -1 : 0);
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
    /** A soft light made of scattered pixels (dithered, so it stays crisp). */
    glow(cx, cy, r, col, k = 0.5) {
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const f = 1 - Math.hypot(x - cx, (y - cy) * 1.4) / r;
        if (f > 0 && !T.has(x, y) && PX_BAYER[(y & 3) * 4 + (x & 3)] < f * k) { T.px(x, y, col); T.glowPx.add(y * w + x); }
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
};
/** The arches between home rooms (see roomDoors): where along its wall each stands (0 at the back corner, 1 at the front) and its half width. */
const DOOR_AT = 0.8, DOOR_W = 0.085;
/** The floor kept clear at a room's passages: the tiles under each arch and the row in front, so nothing stands in a doorway or hides it. */
function doorTiles(room = save.room) {
  const out = new Set(), s0 = Math.floor((DOOR_AT - DOOR_W) * ISO_G), s1 = Math.ceil((DOOR_AT + DOOR_W) * ISO_G) - 1;
  for (const d of roomDoors(room)) for (let s = s0; s <= s1; s++) for (let k = 0; k < 2; k++) out.add(d.wall === "R" ? `${s},${k}` : `${k},${s}`);
  return out;
}
/** Would a piece on these tiles stand in a doorway? */
function inDoorway(i, j, fw, fd, tiles = doorTiles()) {
  for (let a = 0; a < fw; a++) for (let b = 0; b < fd; b++) if (tiles.has(`${i + a},${j + b}`)) return true;
  return false;
}
/** Would a wall piece in this slot hang over an arch? (they're about a tile and a half wide) */
const wallInDoor = (wall, s, room = save.room) => Math.abs(s + 0.5 - DOOR_AT * ISO_G) < 0.75 + DOOR_W * ISO_G && roomDoors(room).some(d => d.wall === wall);
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
const wallSlot = id => { const m = save.layout && save.layout[id]; return m && m.wall ? m : WALL_ITEMS[id]; };
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
  tunnel: { fw: 2, fd: 1, at: [2, 0] }, wallmap: { fw: 1, fd: 2, at: [0, 1] }, altar: { fw: 1, fd: 1, at: [2, 3] }, shrine: { fw: 1, fd: 1, at: [4, 3] },
  labdesk: { fw: 2, fd: 1, at: [2, 0] }, jars: { fw: 1, fd: 1, at: [0, 1] }, scope: { fw: 1, fd: 1, at: [4, 4] }, books: { fw: 1, fd: 1, at: [5, 0] } };
/** What each kind of room comes with (anything not listed has just its bed). */
const ROOM_FIXED = { grotto: ["tunnel", "wallmap", "altar", "shrine"], yard: ["bed", "garden", "greenhouse", "potting", "sunflowers", "barrow", "skep", "coldframe"], lab: ["incubator", "labdesk", "jars", "scope", "books"], shop: ["shelves", "shelves2", "counter", "crates", "sacks", "barrel"], forge: ["furnace", "bellows", "anvil", "coalbin", "rack", "barrel2"], camp: ["tent", "campfire", "logs", "packs", "camplamp", "maptable"] };
/** The places' own furniture: not decorations to play with. */
const PLACE_PROPS = new Set(Object.values(ROOM_FIXED).flat().filter(id => !["bed", "garden", "incubator"].includes(id)));

/** A piece's size in tiles; turned to face the other wall, its two sides swap. */
const pieceDims = (id, flip) => { const f = ISO_FIXED[id] || ISO_PLACES[id]; return flip ? { fw: f.fd, fd: f.fw } : { fw: f.fw, fd: f.fd }; };
/** Which floor pieces are out, and where: the spots you chose first, then each piece's favorite free tiles. Worked out again only when something changes. */
let isoLayoutCache = null;
function isoLayout() {
  const out = Object.keys(ISO_PLACES).filter(hasDecor), mine = save.layout || {};
  const key = save.room + "|" + roomDoors().map(d => d.wall).join("") + "|" + out.join(",") + JSON.stringify(mine);
  if (isoLayoutCache && isoLayoutCache.key === key) return isoLayoutCache;
  const busy = new Set(), placed = {};
  const take = (i, j, fw, fd) => { for (let a = 0; a < fw; a++) for (let b = 0; b < fd; b++) busy.add(`${i + a},${j + b}`); };
  const free = (i, j, fw, fd) => { if (i < 0 || j < 0) return false; for (let a = 0; a < fw; a++) for (let b = 0; b < fd; b++) if (i + a >= ISO_G || j + b >= ISO_G || busy.has(`${i + a},${j + b}`)) return false; return true; };
  // every tile, nearest a piece's own spot first (ties go to the back of the room)
  const near = ([i0, j0]) => Array.from({ length: ISO_G * ISO_G }, (_, k) => [k % ISO_G, Math.floor(k / ISO_G)]).sort((p, q) => Math.hypot(p[0] - i0, p[1] - j0) - Math.hypot(q[0] - i0, q[1] - j0));
  // the doorways stay open: nothing stands in front of a passage, not even a spot you chose before the passage was there
  const doors = doorTiles();
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
  const center = ["2,2", "2,3", "3,2", "3,3"].filter(t => !busy.has(t));
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
  const p = N.iso && isoLayout().placed.mushrooms;
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
const ISO_ART = {
  lamp(t, T, ax, ay, o) {
    const cx = ax, cy = ay + t / 2, top = cy - t * 1.7;
    if (!o.off) T.glow(cx, top + 2, t * 1.1, IC.y0, 0.38);
    T.cyl(cx, cy, t * 0.24, 2, IC.l2, IC.l3, IC.l4);
    for (let y = Math.round(top + 4); y < cy - 1; y++) { T.px(cx - 1, y, IC.l1); T.px(cx, y, IC.l4); }
    // the crystal shade: a little prism, lit facets left and top
    const sh = o.off ? [IC.s2, IC.s3, IC.s4] : [IC.y0, IC.y1, IC.w1];
    T.poly([[cx, top - 5], [cx - 4, top], [cx, top + 4]], sh[0]);
    T.poly([[cx, top - 5], [cx + 4, top], [cx, top + 4]], sh[1]);
    T.poly([[cx - 4, top], [cx, top + 4], [cx + 4, top], [cx, top + 2]], sh[2]);
    if (!o.off) T.px(cx - 1, top - 2, IC.white);
  },
  bookcase(t, T, ax, ay) {
    const a = t / 2 - 0.5, b = t * 0.32, hgt = Math.round(t * 1.55);
    const B = T.box(ax, ay, a, b, hgt, IC.w1, IC.w2, IC.w3);
    // the open front faces the room (the left-hand face): shelves and books on it
    const at = (s, z) => [B.Bv[0] + (B.Buv[0] - B.Bv[0]) * s, B.Bv[1] + (B.Buv[1] - B.Bv[1]) * s - z];
    // real books: spines two or three pixels wide in a cloth color with a shaded edge, light bands near the top and bottom,
    // different heights, a gap now and then, and one leaning on its neighbour
    const BOOKS = [[IC.p1, IC.p3, IC.y0], [IC.b1, IC.b3, IC.y0], [IC.g1, IC.g3, IC.y1], [IC.r1, IC.r3, IC.y0], [IC.l2, IC.l4, IC.white], [IC.y1, IC.w3, IC.r2], [IC.b2, IC.b3, IC.y1], [IC.s1, IC.s3, IC.p2]];
    const fw = Math.max(6, Math.abs(B.Buv[0] - B.Bv[0])), ds = 1 / fw, rowH = (hgt - 3) / 3;
    const book = (s, w, z0, tall, col, lean = 0) => {
      for (let z = z0; z < tall; z++) for (let c = 0; c < w; c++) {
        const ss = s + (c + Math.round((z - z0) * lean)) * ds;
        if (ss >= 1 - ds) continue;
        const band = (z === z0 + 1 || z === tall - 2) && c < w - 1, [x, y] = at(ss, z);
        T.px(x, y, band ? col[2] : c === w - 1 ? col[1] : col[0]);
      }
    };
    for (let row = 0; row < 3; row++) {
      const z0 = 2 + row * rowH, top = z0 + rowH - 1;
      let s = 1.5 * ds, k = row * 7;
      while (s < 1 - 4 * ds) {
        k++;
        if (pxHash(k, 5 + row) > 0.9) { s += 2 * ds; continue; }
        const w = pxHash(k, row + 3) > 0.5 ? 4 : 3, col = BOOKS[Math.floor(pxHash(k, 11 + row) * BOOKS.length)];
        const tall = Math.round(top - 1 - pxHash(k, 7) * Math.min(3, rowH * 0.3));
        if (row === 1 && s > 0.62 && s < 0.8) { book(s, 3, z0, Math.round(tall - 1), col, 0.35); s += 6 * ds; continue; }
        book(s, w, z0, tall, col);
        s += w * ds;
      }
      for (let s2 = 0; s2 <= 1; s2 += ds / 2) { const [x, y] = at(s2, z0 - 1); T.px(x, y, IC.w3); }
    }
  },
  spring(t, T, ax, ay, o) {
    // a little moon pond: a ring of rounded stones, water dark in the deep middle and light at the shallow rim,
    // lily pads with a pink flower, reeds at the back and the moon shining on the water
    const cx = ax, cy = ay + t / 2, rx = t * 0.78, ry = rx / 2, f = o.frame || 0;
    const stones = Math.max(9, Math.round(rx / 1.6));
    for (let k = 0; k < stones; k++) {
      const an = k / stones * TAU, sx = cx + Math.cos(an) * (rx - 0.5), sy = cy + Math.sin(an) * (ry - 0.25), r = Math.max(1.6, rx * 0.13) + pxHash(k, 9) * Math.max(1, rx * 0.06);
      T.ball(sx, sy - 1, r + 0.5, IC.s1, IC.s2, IC.s3, r * 0.8);
    }
    T.disc(cx, cy, rx - 1.5, (x, y) => { const d = Math.hypot((x - cx) / (rx - 1.5), (y - cy) / (ry - 0.75)); return d > 0.78 ? IC.b1 : d > 0.45 ? IC.b2 : IC.b3; });
    // reeds at the back edge
    for (const [dx, hgt] of [[-0.45, 0.8], [-0.35, 1.05], [-0.25, 0.7]]) { const rxp = cx + dx * rx * 2, ryp = cy - ry * 0.75; for (let k = 0; k < hgt * t * 0.6; k++) T.px(rxp + (k > hgt * t * 0.4 ? 1 : 0), ryp - k, k > hgt * t * 0.5 ? IC.w2 : IC.g2); }
    // lily pads with a notch, and one pink flower
    for (const [dx, dy, r] of [[0.2, 0.1, 0.22], [-0.15, 0.22, 0.16], [0.35, -0.15, 0.14]]) {
      const px0 = cx + dx * rx * 2, py0 = cy + dy * ry * 2, pr = r * rx * 1.4;
      T.disc(px0, py0, pr, (x, y) => (x > px0 && Math.abs(y - py0) < 0.8) ? IC.b2 : x < px0 - pr * 0.3 ? IC.g0 : IC.g1);
    }
    const fx = cx + 0.2 * rx * 2, fy = cy + 0.1 * ry * 2 - 1;
    T.px(fx, fy - 1, IC.p0); T.px(fx - 1, fy, IC.p1); T.px(fx + 1, fy, IC.p1); T.px(fx, fy, IC.y1);
    // the moon's reflection, and a ripple that moves
    T.px(cx - rx * 0.3, cy - 1, IC.y0); T.px(cx - rx * 0.3 + 1, cy - 1, IC.y0); T.px(cx - rx * 0.3, cy, IC.y1);
    const rk = (f % 6) / 6, rr = rx * (0.25 + rk * 0.5);
    for (let k = 0; k < 16; k++) { const an = k / 16 * TAU; if (k % 2) T.px(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr / 2, IC.b0); }
  },
  armchair(t, T, ax, ay) {
    // a big puffy bubble chair in deep green velvet: a ring of fat round cushions (tall at the back, lower for the arms,
    // plump pumpkin-like ones along the front), a seat of more cushions inside, and a fine dotted weave all over
    const cx = ax, cy = ay + t / 2 + 1, rx = t * 0.8, ry = rx / 2, r = Math.max(2.5, t * 0.23), seatY = cy - r * 0.8, seam = pxHex("#123a24");
    const bubble = (x, y, rr, rh, lit0 = IC.g1, mid = IC.g2) => {
      T.ball(x, y + 0.6, rr + 0.9, seam, seam, seam, rh + 0.9);         // a dark seam where it presses into its neighbours
      T.ball(x, y, rr, lit0, mid, IC.g3, rh);
      T.px(x - rr * 0.4, y - rh * 0.5, IC.g0);                            // a soft sheen
      // the dotted weave: little dents in a staggered grid
      for (let py = Math.ceil(y - rh) + 1; py < y + rh; py += 2) for (let px = Math.ceil(x - rr) + (py & 2 ? 1 : 0); px < x + rr; px += 3) {
        const dx = (px + 0.5 - x) / rr, dy = (py + 0.5 - y) / rh, lit = -dx * 0.6 - dy * 0.8;
        if (dx * dx + dy * dy < 0.72 && lit > -0.35) T.px(px, py, lit > 0.45 ? mid : IC.g3);
      }
    };
    T.cyl(cx, cy - 1, rx * 0.9, Math.round(r * 1.2), IC.g2, IC.g3, IC.g3);    // the solid body under the cushions, right on the floor
    const ring = (front) => {
      const n = 10, out = [];
      for (let k = 0; k < n; k++) {
        const an = (k + 0.5) / n * TAU, sn = Math.sin(an);
        if ((sn > 0.05) !== front) continue;
        const back = Math.max(0, -sn), rr = r * (1 + back * 0.3), rh = front ? rr * 1.15 : rr * 1.05;
        out.push([cx + Math.cos(an) * rx * 0.8, seatY + sn * ry * 0.8 - (front ? -r * 0.35 : r * (0.4 + back * 1.5)), rr, rh]);
      }
      out.sort((p, q) => p[1] - q[1]).forEach(q => bubble(...q));
    };
    ring(false);
    // the back cushions you lean on, filling in between the high back and the seat
    for (const dx of [-0.42, 0, 0.42]) bubble(cx + dx * rx, seatY - ry * 0.3 - r * (1.2 - Math.abs(dx)), r * 1.05, r * 0.9);
    // the seat: plump cushions tucked inside the ring
    // the seat, sunk a little and catching the light from above, so you can see where to sit
    for (const [dx, dy] of [[-0.24, -0.25], [0.24, -0.25], [0, 0.2]]) bubble(cx + dx * rx, seatY - r * 0.45 + dy * ry, r * 0.95, r * 0.6, IC.g0, IC.g1);
    ring(true);
  },
  cushion(t, T, ax, ay, o = {}) {
    const cx = ax, cy = ay + t / 2;
    if (!o.float) T.disc(cx, cy + 1, t * 0.5, IC.l3);
    for (const [dx, dy, r] of [[-0.24, -0.08, 0.24], [0.2, -0.1, 0.26], [0, -0.26, 0.28], [-0.05, 0.02, 0.26]]) T.ball(cx + dx * t, cy + dy * t, r * t, IC.l0, IC.l1, IC.l2, r * t * 0.82);
  },
  swing(t, T, ax, ay, o = {}) {
    // a little wooden A-frame with a brass moon on its bar; in the room the moon seat hangs from it and swings (drawSwingIso)
    const h = t / 2, H = Math.round(t * 1.8), at = (du, dv, up = 0) => [ax + 2 * du - 2 * dv, ay + du + dv - up], th = Math.max(2, Math.round(t / 14));
    for (const du of [h * 0.08, h * 0.92]) {
      const [tx, ty] = at(du, h * 0.5, H);
      // sturdy legs, lit on the left: a light edge, the wood, a dark edge
      for (const dv of [h * 0.05, h * 0.95]) { const [fx, fy] = at(du, dv); for (let k = 0; k <= th; k++) T.line(tx + k, ty, fx + k, fy, k === 0 ? IC.w0 : k === th ? IC.w3 : IC.w1); }
    }
    const [b0x, b0y] = at(h * 0.02, h * 0.5, H + 1), [b1x, b1y] = at(h * 0.98, h * 0.5, H + 1);
    for (let k = 0; k <= th; k++) T.line(b0x, b0y + k, b1x, b1y + k, k === 0 ? IC.w0 : k === th ? IC.w3 : IC.w1);
    const [mx, my] = at(h * 0.5, h * 0.5, H + 5);
    T.px(mx, my, IC.y0); T.px(mx - 1, my + 1, IC.y0); T.px(mx - 1, my + 2, IC.y1); T.px(mx, my + 3, IC.y1);
    if (!o.room) {
      // for the Decor list: the seat at rest
      const [sx, sy] = at(h * 0.5, h * 0.5, H * 0.3), r = Math.max(3, t * 0.28);
      for (const d of [-1, 1]) T.line(sx + d * r * 0.7, sy - 2, b0x + (b1x - b0x) * (0.5 + d * 0.3), b0y + (b1y - b0y) * (0.5 + d * 0.3) + 1, IC.s1);
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (Math.hypot(x, y) <= r && Math.hypot(x, y + r * 0.45) > r * 0.85 && y > -r * 0.2) T.px(sx + x, sy + y, y > r * 0.5 ? IC.y1 : IC.y0);
    }
  },
  musicbox(t, T, ax, ay, o = {}) {
    // a legendary music cabinet: dark polished wood, a gold crown with a gem, a window of colored lights that glow while it plays,
    // a gold-dotted speaker grille and little gold feet
    const a = t * 0.4, b = t * 0.32, hgt = Math.round(t * 1.25), x = ax + 1, y = ay + 3;
    const B = T.box(x, y, a, b, hgt, IC.p3, IC.r3, IC.ink2);
    const at = (s, z) => [B.Bv[0] + (B.Buv[0] - B.Bv[0]) * s, B.Bv[1] + (B.Buv[1] - B.Bv[1]) * s - z];
    const fw = Math.max(6, Math.abs(B.Buv[0] - B.Bv[0])), ds = 1 / fw;
    // the grille: gold dots on the dark
    for (let z = Math.round(hgt * 0.12); z < hgt * 0.5; z += 2) for (let s = 0.18; s < 0.84; s += 2 * ds) { const [px, py] = at(s, z); T.px(px, py, IC.y1); }
    // the arched window: a rim of colored lights that chase round it, and behind the glass a spinning record
    // (grooves, a pink label, and a glint that turns with the music)
    const f = o.frame || 0, bars = [IC.p0, IC.y0, IC.g0, IC.b0, IC.l1], archTop = s => hgt * 0.9 - ((s - 0.5) / 0.36) ** 2 * hgt * 0.14;
    const z0 = Math.round(hgt * 0.56), rc = [0.5, (z0 + hgt * 0.84) / 2], rr = hgt * 0.15;
    for (let s = 0.14; s < 0.87; s += ds) for (let z = z0; z <= archTop(s) + 1; z++) {
      const edge = s < 0.14 + ds * 1.2 || s > 0.87 - ds * 1.2 || z === z0 || z > archTop(s);
      const [px, py] = at(s, z);
      if (edge) { T.px(px, py, bars[(Math.floor(s / ds) + Math.floor(z) + f) % bars.length]); continue; }
      const du = (s - rc[0]) / ds / 2, dz = z - rc[1], d = Math.hypot(du, dz) / rr;
      if (d < 1) {
        const an = Math.atan2(dz, du), glint = Math.abs(((an / TAU * 8 + f) % 8 + 8) % 8 - 4) < 0.5;
        T.px(px, py, d < 0.28 ? (d < 0.1 ? IC.white : IC.p1) : glint ? IC.s1 : Math.round(d * 6) % 2 ? IC.ink : IC.ink2);
      } else T.px(px, py, IC.ink2);
    }
    // a row of little selector buttons and a coin slot under the window
    for (let k = 0; k < 6; k++) { const [px, py] = at(0.22 + k * 0.11, hgt * 0.53); T.px(px, py, [IC.r1, IC.y0, IC.g0, IC.b0, IC.p0, IC.white][k]); }
    { const [px, py] = at(0.82, hgt * 0.53); T.px(px, py, IC.ink); T.px(px, py - 1, IC.ink); }
    // glowing tubes up the side, cycling through the colors
    const side = (s, z) => [B.Bu[0] + (B.Buv[0] - B.Bu[0]) * s, B.Bu[1] + (B.Buv[1] - B.Bu[1]) * s - z];
    for (const [k, s2] of [[0, 0.3], [2, 0.65]]) for (let z = 3; z < hgt - 3; z++) { const [px, py] = side(s2, z); T.px(px, py, bars[(k + Math.floor(z / 4) + f) % bars.length]); }
    // gold trim up both sides and along the top of the front
    for (let z = 1; z < hgt - 1; z++) for (const s of [ds * 0.6, 1 - ds * 1.4]) { const [px, py] = at(s, z); T.px(px, py, IC.y1); }
    for (let s = 0; s < 1; s += ds) { const [px, py] = at(s, hgt - 1); T.px(px, py, IC.y0); }
    if (!o.quiet) { const [gx, gy] = at(0.5, hgt * 0.72); T.glow(gx, gy, t * 0.8, IC.y0, 0.3); }
    // the gold crown on top, with a pink gem
    const [cx, cy] = [x + a - b, y + (a + b) / 2 - hgt], r = Math.max(3, Math.round(t * 0.2));
    for (let dx = -r; dx <= r; dx++) { const hh = Math.round(Math.sqrt(r * r - dx * dx) * 0.8); for (let k = 0; k <= hh; k++) T.px(cx + dx, cy - k, k === hh ? IC.y0 : IC.y1); }
    T.px(cx, cy - Math.round(r * 0.5), IC.p1); T.px(cx, cy - Math.round(r * 0.5) - 1, IC.p0);
    // little gold feet
    for (const s of [0.1, 0.9]) { const [fx, fy] = at(s, 0); T.px(fx, fy + 1, IC.y1); }
  },
  shelf(t, T, ax, ay, o = {}) {
    // a thick wooden plank on two brackets, along the wall; on it stand up to three geodes cut in half: a round stone shell
    // shaded like a ball, and inside it rings of crystal, dark at the rim and bright in the middle, with a glint
    const len = t * 0.68, dep = t * 0.24, th = Math.max(3, Math.round(t * 0.1));
    const at = (du, dv, up = 0) => [ax + 2 * du - 2 * dv, ay + du + dv - up];
    for (const k of [0.18, 0.82]) { const [bx, by] = at(len * k, dep * 0.4, -1); for (let j = 0; j < t * 0.22; j++) { T.px(bx, by + j, IC.w3); if (j < t * 0.22 - 2) T.px(bx + 1, by + j, IC.w2); } T.line(bx + 1, by + Math.round(t * 0.2), bx + Math.round(dep * 1.6), by, IC.w3); }
    T.box(...at(0, 0, 0), len, dep, th, IC.w0, IC.w1, IC.w2);
    const gems = o.gems && o.gems.length ? o.gems : [[IC.l0, IC.l2, IC.l4], [IC.b0, IC.b1, IC.b3], [IC.p0, IC.p1, IC.p3]];
    gems.slice(0, 3).forEach(([c0, c1, c2], i) => {
      // a half geode standing on its round back, its cut face turned toward the room: you see the stone shell bulging
      // behind on the right, a white agate rim, crystals catching the light, and the dark hollow in the middle
      const r = Math.max(4, t * (i === 1 ? 0.24 : 0.19)), ry = r * 1.12, [cx, cy] = at(len * (0.2 + i * 0.3), dep * 0.5, th + ry * 0.92);
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
      if (o.spark !== undefined && Math.abs(o.spark - i) < 0.5) { T.px(cx, cy - r - 2, IC.white); T.px(cx - 1, cy - r - 1, IC.y0); T.px(cx + 1, cy - r - 1, IC.y0); T.px(cx, cy - r, IC.y0); }
    });
  },
  chest(t, T, ax, ay) {
    const a = t * 0.42, b = t * 0.32, hgt = Math.round(t * 0.42), x = ax, y = ay + 2;
    const B = T.box(x, y, a, b, hgt, IC.w1, IC.w2, IC.w3);
    // the lid, a little proud, with a pink band and a gold latch on the front
    T.box(x, y - hgt + 1, a, b, 3, IC.p1, IC.p2, IC.p3, false);
    const mx = (B.Bv[0] + B.Buv[0]) / 2, my = (B.Bv[1] + B.Buv[1]) / 2 - hgt + 3;
    T.px(mx, my, IC.y0); T.px(mx, my + 1, IC.y1); T.px(mx - 1, my + 1, IC.w1);
  },
  plant(t, T, ax, ay) {
    // a plump succulent in a clay pot: a rosette of thick, rounded leaves in three rings, each leaf shaded like a little
    // ball with a blush-pink tip; the outer ring lies low and wide, the inner ones sit higher and lighter, a bud in the middle
    const cx = ax, cy = ay + t / 2, ph = Math.round(t * 0.28);
    T.cyl(cx, cy, t * 0.24, ph, IC.r2, IC.r1, IC.r3);
    T.disc(cx, cy - ph, t * 0.26, IC.r1); T.disc(cx, cy - ph, t * 0.21, IC.w3);
    const top = cy - ph - 1;
    // one pointed, fleshy leaf from the middle outward: lit on one side of the midrib, shaded on the other, tip curling up
    const leaf = (an, len, wid, lift, curl, light, dark) => {
      const dx = Math.cos(an), dy = Math.sin(an) * 0.5, px = -Math.sin(an), py = Math.cos(an) * 0.5;
      const bx = cx, by = top - lift, tx = bx + dx * len, ty = by + dy * len - curl;
      const mx = bx + dx * len * 0.5, my = by + dy * len * 0.5 - curl * 0.3;
      T.poly([[bx, by], [mx + px * wid, my + py * wid], [tx, ty], [mx - px * wid, my - py * wid]], (x, y) => ((x - bx) * (ty - by) - (y - by) * (tx - bx)) * (Math.cos(an) > 0 ? 1 : -1) > 0 ? dark : light);
      T.px(tx, ty, IC.p1);
    };
    const ring = (n, len, wid, lift, curl, light, dark, turn) => {
      for (const an of Array.from({ length: n }, (_, k) => k / n * TAU + turn).sort((p, q) => Math.sin(p) - Math.sin(q))) leaf(an, len, wid, lift, curl, light, dark);
    };
    ring(8, t * 0.48, t * 0.16, 0, t * 0.06, IC.g1, IC.g2, 0.2);
    ring(7, t * 0.34, t * 0.14, t * 0.07, t * 0.12, IC.g0, IC.g1, 0.65);
    ring(5, t * 0.2, t * 0.1, t * 0.13, t * 0.16, IC.b0, IC.g0, 1.2);
    T.ball(cx, top - t * 0.16, Math.max(1.5, t * 0.05), IC.white, IC.b0, IC.g0);
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
    // a long wooden planter over two tiles, a rim of lighter boards, dark soil inside, three plots along it
    const m = t * 0.05, a = t - 2 * m, b = t / 2 - 2 * m, h = Math.max(3, Math.round(t * 0.26)), x = ax, y = ay + 2 * m;
    T.box(x, y, a, b, h, IC.w0, IC.w2, IC.w3);
    const ia = a - 1.5, ib = b - 1.5, x0 = x, y0 = y + 1.5 - h;
    T.poly([[x0, y0], [x0 + 2 * ia, y0 + ia], [x0 + 2 * ia - 2 * ib, y0 + ia + ib], [x0 - 2 * ib, y0 + ib]], (px, py) => pxHash(px, py) > 0.8 ? IC.w2 : IC.w3);
    // the boards between the plots
    for (const f of [1 / 3, 2 / 3]) for (let k = 0; k <= 4; k++) { const v = k / 4; T.px(x0 + 2 * ia * f - 2 * ib * v, y0 + ia * f + ib * v, IC.w1); }
    (o.p || []).forEach((q, k) => { if (q) { const f = (k + 0.5) / 3; gardenPlant(T, x0 + 2 * ia * f - ib, y0 + ia * f + ib / 2 + 1, q[0], q[1], t * 2.2); } });
    // a corner post at each outer corner, standing a little proud of the rim with a pale cap
    for (const [px, py] of [[x - 2 * b, y + b], [x + 2 * a - 2 * b, y + a + b], [x + 2 * a, y + a]]) {
      for (let z = 0; z <= h + 2; z++) { T.px(px - 1, py - z, IC.w1); T.px(px, py - z, IC.w2); T.px(px + 1, py - z, IC.w3); }
      T.px(px - 1, py - h - 3, IC.w0); T.px(px, py - h - 3, IC.w0); T.px(px + 1, py - h - 3, IC.w1);
    }
    // a label on a stake pushed in along the front of each plot: a blank card while it's empty, the seed's colour on it once something's sown
    for (let k = 0; k < 3; k++) {
      const q = (o.p || [])[k], f = (k + 0.25) / 3, lx = Math.round(x0 + 2 * ia * f - 2 * ib), ly = Math.round(y0 + ia * f + ib), lh = 3;
      for (let z = 0; z < lh; z++) { T.px(lx, ly - z, IC.w2); T.px(lx + 1, ly - z, IC.w3); }
      const top = ly - lh, ink = q ? (GARDEN_TAG[q[0]] || IC.g1) : IC.s2;
      for (let a = -3; a <= 3; a++) for (let bb = -5; bb <= 0; bb++) { const sl = Math.round(a * 0.5); T.px(lx + 1 + a, top + bb + sl, bb === 0 || a === 3 ? IC.ink2 : bb === -5 || a === -3 ? IC.w2 : IC.s0); }
      T.px(lx - 1, top - 2, ink); T.px(lx, top - 2, ink); T.px(lx + 1, top - 1, ink); T.px(lx + 2, top - 1, q ? ink : IC.s1); T.px(lx + 1, top - 2, IC.s1);
    }
  },
  bench(t, T, ax, ay) {
    // a wooden garden bench: four legs, a seat of planks, a back
    const cx = ax, cy = ay + t / 2, a = t * 0.42, b = t * 0.16, lift = Math.round(t * 0.3), x = cx - a + b, y = cy - (a + b) / 2;
    for (const [lx, ly] of [[x, y], [x + 2 * a, y + a], [x - 2 * b, y + b], [x + 2 * a - 2 * b, y + a + b]]) for (let k = 0; k < lift; k++) T.px(lx, ly - k, IC.w3);
    T.box(x, y - lift, a, b, 2, IC.w0, IC.w1, IC.w2);
    T.box(x, y - lift - 2, a, 1, Math.round(t * 0.32), IC.w1, IC.w1, IC.w2);
  },
  lamppost(t, T, ax, ay) {
    // an iron post with a little lantern at the top, glowing
    const cx = ax, cy = ay + t / 2, top = cy - t * 1.7;
    T.glow(cx, top + 3, t * 1.1, IC.y0, 0.4);
    T.disc(cx, cy, t * 0.16, IC.s3);
    for (let y = Math.round(top + 6); y < cy; y++) { T.px(cx - 1, y, IC.s2); T.px(cx, y, IC.s3); }
    T.box(cx, top, 3, 3, 7, IC.s2, IC.y0, IC.y1);
    T.poly([[cx - 6, top - 7], [cx, top - 11], [cx + 6, top - 7], [cx, top - 4]], IC.s3);
  },
  birdbath(t, T, ax, ay) {
    // a stone bowl on a pedestal, full of water that catches the light
    const cx = ax, cy = ay + t / 2, h = Math.round(t * 0.45), r = t * 0.42;
    T.cyl(cx, cy, t * 0.1, h, IC.s1, IC.s1, IC.s3);
    T.cyl(cx, cy - h, r, 2, IC.s0, IC.s1, IC.s2);
    T.disc(cx, cy - h - 2, r * 0.8, (x, y) => pxHash(x, y) > 0.85 ? IC.b0 : IC.b1);
    T.px(cx - r * 0.3, cy - h - 3, IC.white);
  },
  drum(t, T, ax, ay) {
    // a little red drum with a white skin, and two sticks resting on it
    const cx = ax, cy = ay + t / 2, h = Math.round(t * 0.38), r = t * 0.36;
    T.cyl(cx, cy, r, h, IC.white, IC.r1, IC.r2);
    for (let k = 0; k < 6; k++) { const x = cx - r + k * r / 2.5; T.line(x, cy - h + 1, x + 2, cy - 1, IC.y1); }
    T.line(cx - r * 0.5, cy - h - 3, cx + r * 0.4, cy - h + 1, IC.w2); T.line(cx - r * 0.2, cy - h - 4, cx + r * 0.6, cy - h, IC.w2);
  },
  blocks(t, T, ax, ay) {
    // three toy blocks stacked crooked, each a colour, each with a mark
    const cx = ax, cy = ay + t / 2, s = t * 0.2;
    const block = (x, y, z, col) => { const B = T.box(x, y - z, s, s, Math.round(s * 1.6), col[0], col[1], col[2]); T.px(B.top[0], B.top[1] + s, IC.white); };
    block(cx - s * 1.2, cy - s, 0, [IC.p0, IC.p1, IC.p2]);
    block(cx + s * 0.9, cy - s * 0.6, 0, [IC.b0, IC.b1, IC.b2]);
    block(cx - s * 0.2, cy - s * 1.3, Math.round(s * 1.6), [IC.y0, IC.y1, IC.w1]);
  },
  telescope(t, T, ax, ay) {
    // a brass telescope on a wooden tripod, pointing up at the sky
    const cx = ax, cy = ay + t / 2, top = cy - t * 0.8;
    for (const dx of [-t * 0.35, 0, t * 0.3]) T.line(cx + dx, cy + (dx ? 0 : 2), cx, top, IC.w2);
    T.poly([[cx - t * 0.45, top + 4], [cx - t * 0.4, top + 7], [cx + t * 0.45, top - t * 0.35], [cx + t * 0.38, top - t * 0.42]], IC.b2);
    T.poly([[cx - t * 0.45, top + 4], [cx - t * 0.43, top + 5], [cx + t * 0.42, top - t * 0.4], [cx + t * 0.38, top - t * 0.42]], IC.b1);
    T.ball(cx + t * 0.43, top - t * 0.39, 2, IC.y0, IC.y1, IC.w2);
  },
  table(t, T, ax, ay) {
    const cx = ax, cy = ay + t / 2, lift = Math.round(t * 0.42), rx = t * 0.4;
    T.disc(cx, cy, rx * 0.45, IC.w3);
    for (let k = 1; k < lift; k++) { T.px(cx - 1, cy - k, IC.w2); T.px(cx, cy - k, IC.w3); }
    T.cyl(cx, cy - lift, rx, 2, IC.w1, IC.w2, IC.w3);
    // a teapot and a cup
    const ty = cy - lift - 3;
    T.ball(cx - 1, ty - 1, 3.2, IC.p0, IC.p1, IC.p2, 2.6);
    T.px(cx + 3, ty - 2, IC.p1); T.px(cx + 4, ty - 3, IC.p1); T.px(cx - 1, ty - 4, IC.p2);
    T.px(cx - 6, ty + 1, IC.s0); T.px(cx - 5, ty + 1, IC.s0); T.px(cx - 6, ty + 2, IC.s1);
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
 * floor(x, y, lit, edge), blanket (a ramp), and back/front extras.
 */
function bedBowl(T, t, ax, ay, o, look) {
  const lipOnly = o.part === "post", cx = ax, cy = ay + t, { R, H, F } = look, Ri = R * look.Ri, Rf = R * look.Rf;
  const ell = (x, y, z, r) => Math.hypot((x + 0.5 - cx) / r, (y + 0.5 - cy + z) / (r / 2));
  const shellR = z => R * (0.68 + 0.32 * Math.sin(z / H * Math.PI / 2));
  // the shell: rings stacked up to the rim, rounded under like a bowl, lit from the left and catching more light higher up
  for (let z = 0; z < H; z++) {
    const r = shellR(z);
    for (let y = Math.floor(cy - z - r / 2); y <= Math.ceil(cy - z + r / 2); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (ell(x, y, z, r) > 1 || (lipOnly && ell(x, y, H, R) <= 1)) continue;
      T.px(x, y, look.shell(x, y, -(x + 0.5 - cx) / r * 0.7 + z / H * 0.6 - 0.25));
    }
  }
  // the cut rim, in rings (front half only for the lip)
  for (let y = Math.floor(cy - H - R / 2); y <= Math.ceil(cy - H + R / 2); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
    const d = ell(x, y, H, R);
    if (d > 1 || d < look.Ri || (lipOnly && y + 0.5 <= cy - H)) continue;
    T.px(x, y, look.rim((d - look.Ri) / (1 - look.Ri), x, y));
  }
  const inner = (x, y) => ell(x, y, H, R) < look.Ri;
  if (!lipOnly) {
    if (look.back) look.back(cx, cy);
    // the hollow: its back wall down to the soft bottom
    for (let y = Math.floor(cy - H - Ri / 2); y <= Math.ceil(cy - H + Ri / 2); y++) for (let x = Math.floor(cx - Ri); x <= Math.ceil(cx + Ri); x++) {
      if (!inner(x, y)) continue;
      const ex = x + 0.5 - cx, df = ell(x, y, F, Rf);
      if (df <= 1) { T.px(x, y, look.floor(x, y, -ex / Rf * 0.4 - (y + 0.5 - cy + F) / (Rf / 2) * 0.35, df > 0.84)); continue; }
      const yr = cy - H - Ri / 2 * Math.sqrt(Math.max(0, 1 - (ex / Ri) ** 2)), yf = Math.abs(ex) < Rf ? cy - F - Rf / 2 * Math.sqrt(1 - (ex / Rf) ** 2) : cy - F;
      T.px(x, y, look.wall(clamp((y + 0.5 - yr) / Math.max(2, yf - yr), 0, 1), Math.acos(clamp(ex / Ri, -1, 1)) / Math.PI, x, y));
    }
    // a pillow at the back on the lit side, and the blanket over the front, its edge running along the floor's axis
    bedPlush(T, cx - Rf * 0.42, cy - F - Rf * 0.1, t * 0.44, t * 0.24, BED_FLEECE, { curls: true });
    const B = look.blanket, edge = x => cy - F + Rf * 0.02 + ((x + 0.5 - cx) / Rf) ** 2 * Rf * 0.08;
    for (let y = Math.floor(cy - F - Rf / 2); y <= Math.ceil(cy - F + Rf / 2); y++) for (let x = Math.floor(cx - Rf); x <= Math.ceil(cx + Rf); x++) {
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
    const yTop = cy - H + Ri / 2 * Math.sqrt(Math.max(0, 1 - (ex / Ri) ** 2)) - 1, yRim = cy - H + R / 2 * Math.sqrt(Math.max(0, 1 - (ex / R) ** 2));
    const yBot = cy - zb + rb / 2 * Math.sqrt(Math.max(0, 1 - (ex / rb) ** 2)) + Math.sin(ex * 0.42) * 1.2 - (side < 3 ? 3 - side : 0);
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
    const R = t * 1.6, H = Math.round(t * 0.58), F = Math.round(t * 0.28);
    bedBowl(T, t, ax, ay, o, {
      R, H, F, Ri: 0.8, Rf: 0.64, blanket: BED_FELT,
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
          const bx = cx + Math.cos(an) * R * 0.9, by = cy - H + Math.sin(an) * R * 0.45;
          T.glow(bx, by - t * 0.3, t * 0.85, IC.l4, 0.22);
          hs.forEach((h, k) => bedCrystal(T, bx + (k ? 1 : -0.3) * t * 0.16 * (an < -1.5 ? 1 : -1), by + k * 2, t * h, Math.max(2.5, t * 0.16 - k * 0.6), (k ? 1 : -0.6) * t * 0.16 * (an < -1.5 ? -1 : 1)));
        }
      },
      front: (cx, cy, lipOnly) => {
        // moss creeping over the rim at the front left, glowcaps sprouting on the right
        for (const [an, r] of [[2.55, 0.2], [2.3, 0.16], [2.78, 0.13]]) bedPlush(T, cx + Math.cos(an) * R * 0.9, cy - H + Math.sin(an) * R * 0.45 - 1, t * r, t * r * 0.7, BED_MOSS, { gloss: r > 0.15 });
        const gx = cx + Math.cos(0.75) * R * 0.92, gy = cy - H + Math.sin(0.75) * R * 0.46;
        bedGlowcap(T, gx, gy, Math.round(t * 0.4), t * 0.2); bedGlowcap(T, gx + t * 0.26, gy + 2, Math.round(t * 0.24), t * 0.13);
        if (!lipOnly) T.glow(gx, gy - t * 0.25, t * 0.6, BED_GLOW[4], 0.3);
      },
    });
  },
  basket(t, T, ax, ay, o = {}) {
    // the root nest: roots woven into a deep round nest, a braided rim, lined with fleece; moss at the bottom, a rose felt
    // blanket over the front, glowcaps growing out of the weave at the back
    const R = t * 1.5, H = Math.round(t * 0.42), F = Math.round(t * 0.22);
    const weave = (x, y) => (Math.floor((x + 2 * y) / 5) + Math.floor((x - 2 * y + 400) / 5)) & 1;
    bedBowl(T, t, ax, ay, o, {
      R, H, F, Ri: 0.78, Rf: 0.7, blanket: BED_ROSE,
      shell: (x, y, lit) => { const k = 1 + bedBand(lit + (weave(x, y) ? 0.22 : -0.22), [0.35, -0.05, -0.45], x, y); return BED_ROOT[Math.min(4, k + ((x + 2 * y) % 5 === 0 || (x - 2 * y + 400) % 5 === 0 ? 1 : 0))]; },
      rim: (s, x, y) => BED_ROOT[bedBand(0.55 - Math.abs(s - 0.5) * 1.6 + (((Math.floor((x + y * 2) / 4)) & 1) ? 0.22 : -0.22), [0.45, 0.05, -0.35], x, y)],
      wall: (s, f, x, y) => BED_FLEECE[Math.min(3, 1 + bedBand(0.45 - s * 0.9 - Math.abs(f - 0.5) * 0.5, [0.2, -0.25], x, y) + ((x + y * 3) % 5 === 0 && pxHash(x, y) > 0.5 ? 1 : 0))],
      floor: (x, y, lit, edge) => BED_MOSS[edge ? 3 : bedBand(lit + (pxNoise(x * 0.45, y * 0.8) - 0.5) * 0.7, [0.3, -0.1, -0.5], x, y)],
      back: (cx, cy) => {
        const gx = cx + Math.cos(-0.8) * R * 0.86, gy = cy - H + Math.sin(-0.8) * R * 0.43;
        T.glow(gx, gy - t * 0.4, t * 1.0, BED_GLOW[4], 0.32);
        bedGlowcap(T, gx, gy, Math.round(t * 0.62), t * 0.26); bedGlowcap(T, gx + t * 0.3, gy + 2, Math.round(t * 0.38), t * 0.18); bedGlowcap(T, gx - t * 0.28, gy + 1, Math.round(t * 0.26), t * 0.13);
      },
      front: (cx, cy) => { for (const [an, r] of [[2.5, 0.18], [2.75, 0.13]]) bedPlush(T, cx + Math.cos(an) * R * 0.9, cy - H + Math.sin(an) * R * 0.45 - 1, t * r, t * r * 0.7, BED_MOSS, { gloss: r > 0.15 }); },
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
function isoPiece(p, extra = {}) {
  const tw = N.isoW / ISO_G / PX, pad = Math.ceil(tw * 1.2) + 3, base = pieceDims(p.id, false);
  // (room above the footprint for tall pieces: dressers, chimneys, a greenhouse's roof)
  const w = Math.ceil((base.fw + base.fd) * tw + pad * 2), h = (base.fw + base.fd) * tw / 2 + tw * 4 + pad;
  const ax0 = base.fd * tw + pad, ay = tw * 4 + pad / 2;
  // (where it stands on screen is part of the key: a resized window can move the room without changing its size)
  const [bx, by] = isoAt(p.i / ISO_G, p.j / ISO_G);
  const key = `${p.id}|${p.i},${p.j}|${p.flip}|${tw.toFixed(2)}|${Math.round(bx)},${Math.round(by)}|${JSON.stringify(extra)}`;
  return cachedSprite(isoPieces, p.id + (extra.part || ""), key, () => {
    let c = isoArt(w, h, T => ISO_ART[p.id](tw, T, ax0, ay, extra)), ax = ax0;
    if (p.flip) {
      // turned to face the other wall: a mirror image (the back corner stays the back corner)
      const m = document.createElement("canvas"); m.width = c.width; m.height = c.height;
      const g = m.getContext("2d"); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0);
      if (c._solid) { const s = c._solid, cw = c.width; m._solid = s.map((_, i) => s[i - i % cw + cw - 1 - i % cw]); }
      c = m; ax = c.width - ax0;
    }
    return { c, x: Math.round(bx / PX - ax) * PX, y: Math.round(by / PX - ay) * PX };
  });
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
  ctx.fillStyle = "#fff8d6";
  ctx.beginPath(); ctx.arc(sx, sy, r, Math.PI * 0.05, Math.PI * 0.95); ctx.arc(sx, sy - r * 0.35, r * 0.9, Math.PI * 0.92, Math.PI * 0.08, true); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#eec26a";
  ctx.beginPath(); ctx.arc(sx, sy, r, Math.PI * 0.3, Math.PI * 0.95); ctx.arc(sx, sy - r * 0.2, r * 0.92, Math.PI * 0.9, Math.PI * 0.35, true); ctx.closePath(); ctx.fill();
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
const wallFree = (id, wall, s) => !wallInDoor(wall, s) && Object.keys(WALL_ITEMS).every(o => o === id || !hasDecor(o) || wallSlot(o).wall !== wall || Math.abs(wallSlot(o).s - s) >= 1.6);
function setLayout(id, m) {
  save.layout = { ...save.layout, [id]: m };
  isoLayoutCache = null; persist(); sfx.tick();
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
    arrange.drag = { id, i, j, flip, ok: pieceFits(id, i, j, flip), door: inDoorway(i, j, dd.fw, dd.fd, isoLayout().doors) };
  }
}
function arrangeUp() {
  const d = arrange.drag;
  if (d && d.ok) {
    if (d.wall) setLayout(d.id, { wall: d.wall, s: d.s });
    else if (d.id === "rug") setLayout("rug", { u: d.u, v: d.v });
    else { const p = isoLayout().placed[d.id]; if (p && (d.i !== p.i || d.j !== p.j || d.flip !== p.flip)) placePiece(d.id, d.i, d.j, d.flip); }
  } else if (d) toast(tr(d.door ? "Keep the doorway clear" : "That spot is taken"));
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
  save.decor[id].on = false; isoLayoutCache = null; persist(); sfx.tick();
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
  if (!N.iso || !hasDecor("cushion")) return false;
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
  // rain and snow take turns; the cold backdrops start with snow
  weather.kind = weather.last ? (weather.last === "rain" ? "snow" : "rain") : COLD_THEMES.includes(currentTheme()) ? "snow" : "rain";
  weather.last = weather.kind; weather.t0 = game.time; weather.until = game.time + WEATHER_MS;
  // everyone awake and free runs over to play under it
  for (const a of actors.values()) if (["idle", "walk", "dance"].includes(a.state) && !a.goal) playInWeather(a);
  if (!sfx.ready()) return;
  const t = sfx.ac.currentTime, n = 9;
  // softly in, softly out, like the shower itself
  if (weather.kind === "rain") for (let k = 0; k < n; k++) sfx.grain(t + k * 0.28 + rand(0, 0.08), 0.35, rand(2400, 4200), 0.7, 0.045 * Math.sin(Math.PI * (k + 0.5) / n));
  else for (let k = 0; k < 5; k++) sfx.tone(t + k * 0.55 + rand(0, 0.2), pick(NOTES) * 2, 0.015, 1.2, "sine", null, true);
}
const WEATHER_MS = 2800;
const weatherOn = () => N.iso && hasDecor("cushion") && game.time < weather.until + 600;
/** Off to a spot under the cloud, hurrying. */
function playInWeather(a) {
  const c = cloudSpot(), an = rand(0, TAU), r = Math.sqrt(Math.random()) * N.isoW / ISO_G * 0.9;
  a.tx = c.x + Math.cos(an) * r; a.ty = c.y + Math.sin(an) * r / 2;
  a.state = "walk"; a.goal = a.friend = null; a.rain = true;
}
function updateWeather(dt) {
  const on = N.iso && hasDecor("cushion"), c = on && cloudSpot(), tile = N.isoW / ISO_G, snow = weather.kind === "snow";
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
  const p = N.iso && isoLayout().placed.bed;
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
  const p = N.iso && bedStyle() === "gazebo" && isoLayout().placed.bed;
  if (!p) return [];
  const cu = p.i + p.fw / 2, cv = p.j + p.fd / 2;
  return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([su, sv]) => [cu + su * GAZEBO_A, cv + sv * GAZEBO_A]);
}

/** Each sleeper's own place on the bed: a 2×2 spread on the big isometric bed, side by side on the straight-on one. */
function bedSpot(id) {
  const sleepers = save.creatures.filter(c => c.sleeping).map(c => c.id).sort((p, q) => p - q), k = Math.max(0, sleepers.indexOf(id)), n = sleepers.length;
  const p = N.iso && isoLayout().placed.bed;
  if (p && bedStyle() === "hammock") {
    // side by side in the sling, spread along the wall it stands by (straight across it would push one into the wall,
    // where nobody can stand): one end of the sling a little higher on screen than the other, both still inside it
    const a = clamp((k % 3 - (Math.min(n, 3) - 1) / 2) * 0.6, -0.65, 0.65) + Math.floor(k / 3) * 0.25, m = isoMargin(0.45);
    const [du, dv] = p.flip ? [0, a] : [a, 0];
    return isoAt(clamp((p.i + p.fw / 2 + du) / ISO_G, m, 1 - m), clamp((p.j + p.fd / 2 + dv) / ISO_G, m, 1 - m));
  }
  if (p) {
    // a 2×2 spread kept inside the bed (and away from the walls, where glowlings can't stand)
    const ci = k % 2, ri = Math.floor(k / 2) % 2, extra = Math.floor(k / 4) * 0.12, m = isoMargin(0.45);
    return isoAt(clamp((p.i + p.fw * (0.3 + 0.42 * ci + extra)) / ISO_G, m, 1 - m), clamp((p.j + p.fd * (0.32 + 0.4 * ri + extra)) / ISO_G, m, 1 - m));
  }
  return [N.bedX + (k - (n - 1) / 2) * N.base * 0.42, N.bedY + (k % 2) * N.base * 0.1];
}

/** A piece's own pixel picture for the Decor list (the same drawing as in the room), or its emoji if it hangs on a wall. */
const decorThumbs = {};
function decorThumb(d) {
  const draw = ISO_ART[d.id];
  if (!draw) return `<span class="em">${d.emoji}</span>`;
  if (!decorThumbs[d.id]) {
    const f = ISO_PLACES[d.id] || { fw: 1, fd: 1 }, t = 16, pad = 6, w = (f.fw + f.fd) * t + pad * 2, h = (f.fw + f.fd) * t / 2 + t * 2 + pad;
    const c = isoArt(w, h, T => draw(t, T, f.fd * t + pad, t * 2 + pad / 2, {}));
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

/** The rug, in pixel rings on the floor (a 2:1 ellipse, as circles on the floor are). */
function isoRug(starry) {
  const [rx, ry] = rugSize(), [cx, cy] = roomSpot("rug"), art = Math.ceil(rx / PX) * 2 + 6;
  return cachedSprite(isoPieces, "rug", `${rx}|${Math.round(cx)},${Math.round(cy)}|${PX}|${starry}|${starry ? Math.floor(game.time / 400) : ""}`, () => {
    const R = rx / PX, c = isoArt(art, art / 2 + 4, T => {
      const ox = art / 2, oy = art / 4 + 2;
      if (starry) {
        T.disc(ox, oy, R, IC.b3); T.disc(ox, oy, R - 2, IC.b2 && pxHex("#0f2f4a"));
        for (let k = 0; k < 360; k += 4) { const an = k * Math.PI / 180; T.px(ox + Math.cos(an) * (R - 1), oy + Math.sin(an) * (R - 1) / 2, IC.y1); }
        for (let i = 0; i < 12; i++) { const an = i * 2.4, d = 0.25 + (i % 5) * 0.13, tw = Math.sin(game.time * 0.0015 + i); if (tw < -0.6) continue; T.px(ox + Math.cos(an) * R * d, oy + Math.sin(an) * R * d / 2, tw > 0.5 ? IC.y0 : IC.y1); }
      } else [IC.p3, IC.p2, IC.p1, IC.p2, IC.p3].forEach((col, i) => T.disc(ox, oy, R * (1 - i * 0.19), col));
    }, { outline: false });
    return { c, x: Math.round(cx / PX - art / 2) * PX, y: Math.round(cy / PX - art / 4 - 2) * PX };
  });
}


/** A shade from a ramp, banded the way hand-placed pixels are: flat clusters of one colour, dithered only in a thin seam
 *  where two shades meet (k is how wide the seam is; pxPick dithers the whole way between them). */
const isoTone = (ramp, v, x, y, k = 0.3) => { const n = ramp.length - 1; return ramp[clamp(Math.floor(clamp(v, 0, 1) * n + 0.5 + (PX_BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * k), 0, n)]; };
const mixHex = (a, b, k) => a.map((c, i) => Math.round(c + (b[i] - c) * k));

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
/** The isometric room in art pixels: a diamond floor on a thick slab, and (indoors) a lit left wall and a shaded right one.
 *  Every surface is a material laid along its own plane, lit from the top left: caves are layered rock with ledges and
 *  fissures over a pebbly floor; the abbey dressed stone in courses over flagstones; the timber hall an oak frame with
 *  limewashed daub on a rubble footing, over boards; the ruins old blocks in moss; outdoors grass with trodden paths. */
function paintRoomIso(id) {
  const kind = ROOM_KIND[id] || "cave", t = THEME[id] || THEME.amethyst;
  const art = t.art !== undefined ? CHAPTER_ART[t.art] : null, night = NIGHT[id];
  const wallR = (art ? art.wall : night.ground).map(pxHex), crys = art ? art.crystal.map(pxHex) : null, ground = night ? night.ground.map(pxHex) : wallR;
  const w = Math.ceil(W / PX), h = Math.ceil(H / PX), c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data;
  const q = v => v / PX, cx = q(N.cx), top = q(N.isoTop), hw = q(N.isoW), hh = hw / 2, wall = q(N.isoWall), slab = Math.max(4, Math.round(hw / 16));
  // stones, planks and beams keep their proportions to the room whatever its size (a phone's room is about 180 pixels from corner to end)
  const S = Math.max(0.55, hw / 180);
  const seed = (art ? art.seed : night.seed) * 7, indoor = kind === "cave" || kind === "hall" || kind === "ruin" || kind === "timber";
  const put = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
  const ink = pxHex("#0b0614"), at = (u, v) => [cx + (u - v) * hw, top + (u + v) * hh], hexes = a => a.map(pxHex);
  // the ruins are old grey stone whatever the night outside; moss and grass grow in every gap
  const ruinStone = hexes(["#22143a", "#3a3440", "#5d5666", "#8a8494", "#b9b3c0"]), moss = hexes(["#1e5233", "#2f7d4a", "#57ad6a"]);
  // the timber hall: oak for the frame and the floor, limewashed daub between the beams on a footing of rubble stone
  const oak = hexes(["#1f130a", "#3b2414", "#5e3a1c", "#7a5230", "#946027", "#b07c45"]), daub = hexes(["#4a4238", "#6e6555", "#958a74", "#b8ad94", "#d4caae", "#e8e0c8"]);
  // the abbey's dressed stone: cool grey with a little violet in the shadows
  const ashlar = hexes(["#0f0a19", "#1d1629", "#2e2639", "#41384d", "#574d63", "#70667b", "#8c8396", "#aaa2b1"]);
  // cave rock: the chapter's own ramp, with a highlight leaning toward its crystals for the lit edges
  const rock = art ? [...wallR, mixHex(wallR[4], crys[2], 0.35)] : wallR;
  const wallC = kind === "timber" ? ruinStone : kind === "ruin" ? ruinStone : kind === "hall" ? ashlar : rock;
  // how high a ruined wall still stands along its length (0..1): broken off in steps, low in the middle of each side
  const ruinH = tt => kind !== "ruin" ? 1 : clamp(0.55 + 0.45 * Math.cos(tt * 2.6) - 0.35 * (Math.floor(pxNoise(tt * 7 + seed, 3) * 4) / 4), 0.18, 1);
  const wood = [oak[1], oak[2], oak[4]], stone = [ruinStone[0], ruinStone[1], ruinStone[2], ruinStone[3]];
  const lightAt = (u, v) => Math.exp(-(((u - 0.35) / 0.5) ** 2) - (((v - 0.5) / 0.6) ** 2));
  // which room this is: the camp and the garden share a backdrop but not their paths
  const roomKindNow = save.rooms && save.rooms[save.room] ? save.rooms[save.room].kind : "";

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
    let v = base + 0.18 * (hb - 0.5) + 0.07 * (pxFbm(x * 0.21, y * 0.21) - 0.5);
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

  // ---- the floor's materials: u runs along the right wall, v along the left; ao is the dark where it meets a wall
  const pathD = (() => {
    // trodden paths outdoors: the camp's ring round the fire and its ways to the tent and out; the garden's walk between the beds
    const lines = roomKindNow === "camp" ? [[[0.42, 0.58], [0.66, 0.36]], [[0.42, 0.58], [0.72, 0.8], [1.02, 0.9]], [[0.42, 0.58], [0.22, 0.3]]]
      : roomKindNow === "yard" ? [[[1.02, 0.44], [0.7, 0.46], [0.4, 0.43], [0.2, 0.38]], [[0.55, 0.45], [0.52, 0.66]], [[0.7, 0.46], [0.74, 0.32]]] : [];
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
  const floorPx = (u, v, x, y, ao, lk) => {
    if (kind === "timber") {
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
      return isoTone(oak, pv - 0.42 * ao, x, y);
    }
    if (kind === "hall" || kind === "ruin") {
      // flagstones in staggered rows, each its own stone (a darker slate now and then), bevelled toward the light, cracked,
      // polished pale where feet go; in the ruins, moss in the joints and grass where a stone is missing
      const n = 7, fu = u * n, row = Math.floor(fu), pw2 = hw / n, wp = (fu - row) * pw2;
      const len = 1.05 + 0.55 * pxHash(row, 9), fv = v * n + pxHash(row, 4 + seed) * len, st = Math.floor(fv / len), e = (fv - st * len) * pw2, pl = len * pw2;
      const sh = pxHash(row * 31 + st, seed);
      let val = 0.5 + 0.14 * (sh - 0.5) + 0.24 * lk + 0.08 * (pxFbm(x * 0.15 + seed, y * 0.25) - 0.5) - (sh > 0.82 ? 0.12 : 0);
      if (pxHash(st, row + 3) > 0.74 && Math.abs(pxNoise(x * 0.1 + st, y * 0.2 + row) - 0.5) < 0.018) val -= 0.25;
      const sp = pxHash(x * 3, y * 7 + seed); if (sp > 0.98) val -= 0.12; else if (sp < 0.015) val += 0.1;
      const joint = wp < 1 || e < 1;
      if (kind === "ruin") {
        if (joint && pxHash(x, y + seed) > 0.3) return moss[pxHash(x + 1, y) > 0.6 ? 2 : 1];
        if (sh > 0.9) return pxFbm(x * 0.4, y * 0.4) > 0.5 ? moss[1] : moss[0];
      }
      if (joint) val = 0.06; else if (wp < 2 || e < 2) val += 0.16; else if (wp > pw2 - 1.4 || e > pl - 1.4) val -= 0.15;
      return isoTone(wallC, val - 0.42 * ao, x, y);
    }
    if (kind === "cave") {
      // the rock itself: lumpy and uneven (lit where it rises toward the light), cracked, strewn with pebbles that each cast a
      // little shadow, a few crystal splinters
      const f = facet(u * hw, v * hw, 26 * S, 26 * S, seed + 5);
      let val = 0.44 + 0.22 * lk + 0.1 * (f.sh - 0.5) + 0.12 * (-f.ox * 0.6 - f.oy * 0.8) + 0.08 * (pxFbm(x * 0.12, y * 0.24) - 0.5);
      if (f.edge < 1 && f.sh > 0.45) val = 0.1; else if (f.edge < 2 && f.sh > 0.45) val += f.ox + f.oy < 0 ? -0.1 : 0.08;
      const gx = Math.floor(x / 9), gy = Math.floor(y / 5), ph = pxHash(gx + seed, gy * 3);
      if (ph > 0.6) {
        const px0 = gx * 9 + 2 + pxHash(gx, gy) * 5, py0 = gy * 5 + 1 + pxHash(gy, gx) * 3, pr = 1 + (ph - 0.6) * 5, dx = (x + 0.5 - px0) / pr, dy = (y + 0.5 - py0) / (pr * 0.6);
        const dd = dx * dx + dy * dy;
        if (dd < 1) val = 0.5 + 0.35 * (-dx * 0.6 - dy * 0.8) + 0.2 * lk;
        else if (dd < 2.2 && dx > -0.2 && dy > 0) val -= 0.2;
      }
      if (pxHash(x, y + seed) > 0.9975) return crys[2];
      return isoTone(wallC, val - 0.45 * ao, x, y);
    }
    // outdoors: the ground rolls a little (lit where it tips toward the light), grass in darker and paler patches, the
    // blades themselves come after; trodden paths of bare earth with pebbles, grass creeping in from their edges
    const lump = (xx, yy) => pxFbm(xx * 0.03 + seed, yy * 0.06);
    let val = 0.52 + 0.2 * lk + 2.6 * (lump(x - 2, y - 2) - lump(x + 2, y + 2)) + 0.16 * (pxFbm(x * 0.06 + seed, y * 0.12) - 0.5) - 0.2 * Math.max(0, Math.max(u, v) - 0.85) * 5;
    const pd = pathD(u, v) * hw / (S * 180), pr = roomKindNow === "camp" ? 0.07 : 0.05, ragged = 0.012 * (pxNoise(x * 0.3, y * 0.6) - 0.5) * 2;
    if (pd < pr + ragged) {
      if (roomKindNow === "yard") {
        // stepping stones set in gravel
        const sx = Math.floor(x / 16), sy = Math.floor((y + (sx % 2) * 4) / 8), so = pxHash(sx, sy + seed), scx = sx * 16 + 8, scy = sy * 8 + 4 - (sx % 2) * 4, sd = Math.hypot((x + 0.5 - scx) / 6.5, (y + 0.5 - scy) / 3.4);
        if (so > 0.25 && sd < 1) return isoTone(ruinStone, 0.55 + 0.25 * (-(x - scx) / 6.5 * 0.6 - (y - scy) / 3.4 * 0.8) + 0.2 * lk + 0.1 * (so - 0.5), x, y);
        if (so > 0.25 && sd < 1.35 && y > scy) return dirt[1];
        const gv = pxHash(x, y + 5); return isoTone(dirt, 0.42 + 0.2 * lk + (gv > 0.8 ? 0.22 : gv < 0.15 ? -0.2 : 0) - 0.3 * ao, x, y);
      }
      let dv = 0.45 + 0.2 * lk + 1.8 * (lump(x - 2, y - 2) - lump(x + 2, y + 2)) + 0.1 * (pxFbm(x * 0.2, y * 0.3) - 0.5);
      if (pd > pr + ragged - 0.012) dv -= 0.2;
      const pb = pxHash(x >> 1, (y >> 1) + seed); if (pb > 0.96) dv += 0.28; else if (pb > 0.93) dv -= 0.2;
      return isoTone(dirt, dv, x, y);
    }
    if (pd < pr + 0.03 && pxHash(x, y) > 0.5) val -= 0.14;
    if (Math.max(u, v) > 0.985) val = 0.85; // a lit rim at the front edges
    return isoTone(ground, val, x, y, 0.5);
  };

  // the slab under the floor: its two front faces, the left one lit, the right one in shade (outdoors the room is part of the land: no slab)
  if (indoor) for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
    const edgeY = top + hh + (hh - Math.abs(x - cx) * hh / hw), left = x < cx;
    for (let k = 0; k < slab; k++) {
      const y = edgeY + k, al = Math.abs(x - cx);
      let col;
      if (kind === "cave") col = isoTone(wallC, rockPx(al, slab - k + 400, left ? 1 : -1, x, y) - 0.12, x, y);
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
      const tall = 2 + Math.round(pxHash(x, y + 1) * 2 + lush * 1.5), lean = pxHash(y, x) > 0.5 ? 1 : -1, lk = lightAt(u, v);
      for (let k = 0; k < tall; k++) {
        const col = k === tall - 1 ? ground[Math.min(ground.length - 1, lk > 0.45 ? 4 : 3)] : k === 0 ? ground[1] : ground[Math.min(ground.length - 1, 2 + (lk > 0.6 ? 1 : 0))];
        put(x + (k === tall - 1 && tall > 2 ? lean : 0), y - k, col);
      }
      if (pxHash(x + 3, y) > 0.92) { put(x - 1, y - 1, ground[2]); put(x + 1, y - 1, ground[3]); }
    }
    // a few small flowers and clover in the grass
    for (let k = 0; k < 40; k++) {
      const u = 0.05 + 0.9 * pxHash(k, seed + 1), v = 0.05 + 0.9 * pxHash(seed + 2, k);
      if (pathD(u, v) * hw / (S * 180) < 0.09) continue;
      const [fx, fy] = at(u, v), col = pxHex(["#fff0b5", "#ffc4da", "#d2bfff", "#ffffff"][k % 4]);
      put(fx, fy - 2, col); put(fx - 1, fy - 1, col); put(fx + 1, fy - 1, col); put(fx, fy - 1, pxHex("#eec26a")); put(fx, fy, ground[1]);
    }
  }
  if (indoor) {
    // the two walls: left (along v) catches the light, right (along u) is in shade; they meet at the back corner
    for (const side of [-1, 1]) for (let x = Math.floor(side < 0 ? cx - hw : cx); x <= Math.ceil(side < 0 ? cx : cx + hw); x++) {
      const tt = Math.abs(x - cx) / hw, base = top + tt * hh, al = tt * hw, sl = -side;
      // a cave's rock rises higher toward the back and juts up and down along its top
      const yTop = base - wall * ruinH(tt) - (kind === "cave" ? wall * (0.22 * (1 - tt) + 0.16 * pxNoise(x * 0.05, seed)) + 4 * pxNoise(x * 0.3, seed + 4) - 2 : 0);
      for (let y = Math.floor(yTop); y < base; y++) {
        const z = base - y;
        let val, ramp = wallC;
        if (kind === "cave") val = rockPx(al, z, sl, x, y) - 0.3 * Math.max(0, 1 - z / (6 * S));
        else if (kind === "timber") { const m = timberPx(al, z, sl, x, y); ramp = m.ramp; val = m.v; }
        else if (kind === "ruin") {
          // big old blocks, uneven, some missing their corners; moss on whatever still stands on top, ivy trailing down
          const ivy = pxNoise(x * 0.35 + seed, 2) > 0.62 && y - yTop < wall * 0.55 * pxNoise(x * 0.2, seed + 1);
          if (y - yTop < 2.5 || ivy) { put(x, y, moss[ivy ? (pxHash(x, y) > 0.5 ? 1 : 0) : 2]); continue; }
          val = ashlarPx(al, z, sl, x, y, sl > 0 ? 0.52 : 0.32);
          if (z < 5 * S && pxHash(x, y) > 0.55) { put(x, y, moss[pxHash(x + 1, y) > 0.5 ? 1 : 0]); continue; }
        } else {
          // the abbey: a plinth of big blocks with a lit ledge along its top, then dressed courses, damp streaks low down
          const plH = Math.round(13 * S);
          if (z < plH) val = z >= plH - 2 ? 0.86 - (plH - 1 - z) * 0.12 : ashlarPx(al * 0.6, z + 400, sl, x, y, sl > 0 ? 0.46 : 0.3) - 0.06;
          else {
            val = ashlarPx(al, z, sl, x, y, sl > 0 ? 0.58 : 0.38) - 0.14 * (z / wall);
            if (pxNoise(al * 0.11 + sl * 5 + seed, 1.3) > 0.66 && z < wall * (0.2 + 0.3 * pxNoise(al * 0.08, 4))) val -= 0.1;
            if (z < plH + 3) val -= 0.12 * (plH + 3 - z) / 3;   // the ledge's shadow on the wall just above it
          }
        }
        if (y - yTop < 2) { val = sl > 0 ? 0.8 : 0.6; if (kind === "timber") ramp = oak; }   // the lit top edge of the wall
        if (kind === "cave") { if (Math.abs(x - cx) < 3) val -= 0.08 * (3 - Math.abs(x - cx)); }  // rock curves round the back, no sharp corner
        else if (Math.abs(x - cx) < 1 && kind !== "timber") val = 0.05;     // the back corner
        if (al < 10 * S) val -= 0.14 * (1 - al / (10 * S));   // the corner's own shadow
        if (Math.abs(x - cx) > hw - 1) val = 0.1;      // the open ends
        put(x, y, isoTone(ramp, val, x, y));
      }
      // a cave's rock overhangs: stalactites drip from its ragged top
      if (kind === "cave" && pxHash(x, seed + 5) > 0.82) {
        const len = 2 + Math.round(pxHash(x + 3, seed) * 5);
        for (let k = 0; k < len; k++) put(x, yTop + 2 + k, pxPick(wallC, 0.62 - k * 0.07, x, k));
      }
    }
    // a window in the left wall: a parallelogram that follows the wall. It has depth: a deep reveal in the wall on one
    // side, a stone sill that sticks out at the bottom, and through it a moonlit night with far hills and stars of different
    // brightness. The ruins' is a broken pointed arch; the timber hall's is square-headed under an oak lintel, glazed in
    // small diamond panes of lead; the abbey's is Gothic (below)
    const sky = (night ? night.sky : ["#0d0a2a", "#160c33", "#2d2468", "#463592"]).map(pxHex);
    const white = pxHex("#ffffff"), moon = pxHex("#fff8d6");
    const glazed = kind === "timber", sillC = kind === "timber" ? [oak[1], oak[4]] : [wallC[1], wallC[Math.min(6, wallC.length - 1)]];
    if (kind === "hall") {
      // the abbey's window is Gothic: a pointed arch cut deep through the wall and splayed, so both its sides show, with a
      // broad stone seat; four tall lancets with trefoil heads under a net of lozenges (three, two, one), all on the wall's
      // slant. Behind the glass a cold violet night with a moon and stars, and an iron lantern on a curled bracket either side
      const tc = 0.42, xc = Math.round(cx - tc * hw), foot = x => Math.floor(top + (cx - x) / hw * hh);
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
      const lav = pxHex("#d2bfff"), vio = hexes(["#160c26", "#22143a", "#2e1d4f", "#3d2866", "#523a85", "#6b4fa8", "#8a6cc9", "#ad91e6", "#d2bfff", "#efe6ff"]);
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
    if (kind === "cave") {
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
let decorK = 1;

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
    if (["rack", "wallmap", "swing", "shelves", "shelves2", "jars", "bed"].includes(p.id)) continue;
    const g0 = ISO_G, k = 0.28, pts = [[p.i + k, p.j], [p.i + p.fw + k, p.j], [p.i + p.fw + k, p.j + p.fd], [p.i + k, p.j + p.fd]].map(([u, v]) => isoAt(u / g0, v / g0));
    ctx.beginPath(); pts.forEach(([x, y], n) => n ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
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
    items.push({ y: fy, box, draw: () => { const f = isoPiece(p, extra); pieceHits[p.id] = { c: f.c, x: f.x + Math.round(bob / PX) * PX, y: f.y }; drawBaked(f, 0, bob); if (PROP_CUES[p.id]) propCue(p.id, f, bob); } });
  }
  if (hasDecor("shelf")) items.push({ y: -2, draw: drawShelfIso });
  if (hasDecor("lights")) items.push({ y: -1, draw: () => DRAW_DECOR.lights() });
  if (weather.drops.length) items.push({ y: 1e6, top: true, draw: drawWeatherAir });
  if (hasDecor("cushion")) items.push({ y: 1e6, top: true, id: "cushion", draw: drawCloud });
  return items;
}

/** What sort of place each backdrop is: a hollow in the cave wall, an abbey hall, or a clearing under the sky. */
const ROOM_KIND = { smithy: "timber", amethyst: "cave", celestite: "cave", malachite: "cave", labradorite: "cave", frost: "cave", abbey: "hall", churchyard: "ruin", glowcap: "wood", summit: "yard" };

/** The room's walls and floor in art pixels, for one backdrop: caves get rough rock with crystals in the corners and stone slabs,
 *  the abbey brick with a tall arched window and tiles, the churchyard grass behind a low stone wall, the wood moss behind a fallen log. */
function paintRoom(id) {
  // seen straight on, the ruins are a broken hall
  const kind = ROOM_KIND[id] === "ruin" || ROOM_KIND[id] === "timber" ? "hall" : ROOM_KIND[id] || "cave", t = THEME[id] || THEME.amethyst;
  const art = t.art !== undefined ? CHAPTER_ART[t.art] : null, night = NIGHT[id];
  const wallR = (art ? art.wall : night.ground).map(pxHex), crys = art ? art.crystal.map(pxHex) : null;
  const w = Math.ceil(W / PX), h = Math.ceil(H / PX), c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data;
  const q = v => v / PX, cx = q(N.cx), back = Math.round(q(N.back)), front = Math.round(q(N.front)), hb = q(N.hb), hf = q(N.hf), top = Math.round(q(N.wallTop));
  const win = { x: q(N.win.x), y: q(N.win.y), r: q(N.win.r) }, seed = (art ? art.seed : night.seed) * 7;
  const half = y => lerp(hb, hf, clamp((y - back) / (front - back), 0, 1));
  const put = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
  const ink = pxHex("#0b0614"), indoor = kind === "cave" || kind === "hall";
  const lightAt = (x, y) => Math.exp(-(((x - cx) / (hb * 0.55)) ** 2) - (((y - back) / ((front - back) * 0.9)) ** 2));

  if (indoor) {
    // side walls first: they lean out from the back corners to the front, a little darker
    for (const side of [-1, 1]) for (let y = top - 8; y <= front; y++) {
      const inner = cx + side * (y < back ? hb : half(y)), outer = cx + side * (hf + 2);
      const lo = Math.min(inner, outer), hi = Math.max(inner, outer);
      const ceil = top - 8 + (Math.abs(inner - cx) - hb) * 0.6;
      if (y < ceil) continue;
      for (let x = Math.floor(lo); x <= Math.ceil(hi); x++) {
        const fade = Math.abs(x - inner) / Math.max(1, hi - lo);
        if (PX_BAYER[(y & 3) * 4 + (x & 3)] < fade - 0.45) continue;
        put(x, y, pxPick(wallR, 0.06 + 0.16 * pxFbm(x * 0.11 + seed, y * 0.11) - fade * 0.12, x, y));
      }
    }
    // the back wall
    for (let y = top - 6; y < back; y++) for (let x = Math.floor(cx - hb); x <= Math.ceil(cx + hb); x++) {
      const du = (x - cx) / hb, yt = kind === "cave" ? top + du * du * (back - top) * 0.18 + 3 * pxNoise(x * 0.14, seed) - 2 : top;
      if (y < yt) continue;
      let v;
      if (kind === "cave") {
        v = 0.22 + 0.26 * pxFbm(x * 0.08 + seed, y * 0.08) - 0.18 * (1 - (y - top) / (back - top)) - 0.14 * du * du;
        if (Math.abs(pxNoise(x * 0.18 + seed, y * 0.18) - 0.5) < 0.025) v -= 0.25; // cracks in the rock
        if (y - yt < 2) v -= 0.2;
      } else {
        // dressed stone: rows of bricks, each a slightly different shade
        const row = Math.floor((y - top) / 4), bx = Math.floor((x - cx + 400 + (row % 2) * 4) / 8);
        v = 0.32 + 0.16 * pxHash(bx, row + seed) - 0.12 * du * du;
        if ((y - top) % 4 === 0 || (x - cx + 400 + (row % 2) * 4) % 8 === 0) v = 0.12;
        if (y - top < 3) v = 0.62; // a lighter cornice along the top
      }
      v += 0.22 * Math.exp(-((Math.hypot(x - win.x, y - win.y) / (win.r * 2.4)) ** 2)); // light around the window
      if (back - y < 3) v -= 0.25; // shadow where wall meets floor
      if (Math.abs(du) > 0.985) v = 0.02; // the corner edges
      put(x, y, pxPick(wallR, v, x, y));
    }
    if (kind === "cave") {
      // crystal clusters growing in the corners where the wall meets the floor
      for (const side of [-1, 1]) for (let k = 0; k < 6; k++) {
        const bx = cx + side * (hb - 2 - k * 2.6 - pxHash(k, seed) * 2), hgt = 5 + Math.round(pxHash(k + 9, seed) * 9) - k, ww = 1.6 + pxHash(k, 3) * 1.2;
        for (let yy = 0; yy < hgt; yy++) {
          const hw = ww * (1 - yy / hgt), lean = side * yy * 0.18;
          for (let xx = -Math.ceil(hw); xx <= Math.ceil(hw); xx++) put(bx + xx - lean, back - yy, yy === hgt - 1 ? crys[4] : xx < 0 ? crys[3] : crys[1]);
        }
      }
    } else {
      // a tall arched window with a stone frame and two panes of pink dusk
      const sky = night.sky.map(pxHex), ww = Math.max(5, Math.round(win.r * 0.62)), wb = Math.round(win.y + win.r * 1.1), wt = Math.round(win.y - win.r * 1.1);
      for (let y = wt - ww - 2; y <= wb + 2; y++) for (let x = Math.round(win.x - ww - 2); x <= Math.round(win.x + ww + 2); x++) {
        const dx = Math.abs(x - win.x), arch = y < wt ? Math.hypot(dx, (wt - y) * 1.0) : dx;
        if (arch > ww + 2) continue;
        if (arch > ww || y > wb) { put(x, y, wallR[3]); continue; }
        if (dx < 1 || (y - wt) % 9 === 0 && y > wt) { put(x, y, ink); continue; }
        put(x, y, pxPick(sky, 0.15 + 0.85 * (y - (wt - ww)) / (wb - wt + ww), x, y));
        if (pxHash(x, y + seed) > 0.97 && y < wt + 4) put(x, y, pxHex("#fff0b5"));
      }
    }
  }

  // the floor
  const ground = night ? night.ground.map(pxHex) : wallR;
  for (let y = back; y <= front + 6; y++) {
    const hw = half(Math.min(y, front)), dv = (y - back) / (front - back);
    for (let x = Math.floor(cx - hw - 3); x <= Math.ceil(cx + hw + 3); x++) {
      const du = (x - cx) / hw;
      let v, col = null;
      if (indoor) {
        if (Math.abs(du) > 1) continue;
        if (y > front) { if (y - front > 4) continue; put(x, y, pxPick(wallR, 0.18 - (y - front) * 0.04, x, y)); continue; } // the front lip of the ledge
        v = 0.56 + 0.14 * pxFbm(x * 0.1 + seed, y * 0.2) + 0.3 * lightAt(x, y) - 0.22 * du * du;
        if (y - back < 1) v = 0.95; // a lit edge where the floor meets the wall
        else if (y - back < 3) v -= 0.3; // and the shadow just in front of it
        if (Math.abs(du) > 0.975) v -= 0.35; // the floor's side edges
        if (kind === "cave") {
          // big flat slabs: seams across and seams running toward the back
          if ([0.34, 0.68].some(r => Math.abs(dv - r) * (front - back) < 0.5) && pxHash(x >> 2, y) > 0.15) v -= 0.22;
          const col6 = (du + 1) * 3; if (Math.abs(col6 - Math.round(col6)) * hw / 3 < 0.5 && pxHash(x, y >> 2) > 0.3) v -= 0.18;
          if (pxHash(x, y + seed) > 0.9975) col = crys[2];
        } else {
          const ti = Math.floor((du + 1) * 4), tj = Math.floor(dv * 5);
          v += (ti + tj) % 2 ? 0.1 : -0.06;
          if (Math.abs((du + 1) * 4 - Math.round((du + 1) * 4)) * hw / 4 < 0.5 || Math.abs(dv * 5 - Math.round(dv * 5)) * (front - back) / 5 < 0.5) v -= 0.18;
        }
        if (dv > 0.85) v -= (dv - 0.85) * 1.6;
        put(x, y, col || pxPick(wallR, v, x, y));
      } else {
        // a clearing: the grass or moss thins out at a ragged edge
        if (y > front) continue;
        const edge = 1 - 0.1 * pxNoise(y * 0.2 + seed, 1) - 0.04 * pxNoise(x * 0.3, 5);
        const dist = Math.max(Math.abs(du) / edge, (dv - 0.88) / 0.12);
        if (dist > 1) continue;
        if (dist > 0.9 && PX_BAYER[(y & 3) * 4 + (x & 3)] < (dist - 0.9) * 10) continue;
        v = 0.5 + 0.25 * pxFbm(x * 0.14 + seed, y * 0.25) + 0.2 * lightAt(x, y) - 0.3 * du * du - 0.35 * Math.max(0, dist - 0.7);
        if (pxHash(x, y + seed) > 0.965) v += 0.3; // tufts
        if (kind === "wood") {
          if (pxHash(x + 7, y + seed) > 0.988) col = pxHex(pxHash(x, y) > 0.5 ? "#c98f3a" : "#946027"); // fallen leaves
          else if (pxHash(x + 3, y + seed * 2) > 0.995) col = pxHex("#8ff0d8"); // a glowing speck
        }
        put(x, y, col || pxPick(ground, v, x, y));
      }
    }
  }
  if (kind === "yard") {
    // stepping stones winding from the front to the back
    for (let i = 0; i < 5; i++) {
      const v = 0.12 + i * 0.19, y = lerp(back, front, v), x = cx + Math.sin(i * 1.3 + 0.6) * half(y) * 0.28;
      const rx = 2.6 + v * 2.2, ry = 1.2 + v;
      for (let yy = -Math.ceil(ry); yy <= Math.ceil(ry); yy++) for (let xx = -Math.ceil(rx); xx <= Math.ceil(rx); xx++) {
        const e = (xx / rx) ** 2 + (yy / ry) ** 2;
        if (e <= 1) put(x + xx, y + yy, e > 0.7 ? pxHex("#22143a") : yy < 0 ? pxHex("#8a8494") : pxHex("#5d5666"));
      }
    }
    // a low wall of old stones along the back of the clearing
    for (let x = Math.floor(cx - hb - 2); x <= Math.ceil(cx + hb + 2); x++) {
      const st = Math.floor((x - cx + 300) / 6), sh = 4 + Math.round(pxHash(st, seed) * 2);
      for (let yy = 0; yy < sh; yy++) {
        const edge = (x - cx + 300) % 6 === 0 || yy === sh - 1;
        put(x, back - yy, edge ? ink : pxPick([pxHex("#3a3440"), pxHex("#5d5666"), pxHex("#8a8494")], 0.3 + 0.4 * (yy / sh) + 0.2 * pxHash(st, 2), x, back - yy));
      }
      if (pxHash(x, seed) > 0.8) put(x, back - sh, pxHex("#2f7d4a")); // moss on top
    }
  }
  if (kind === "wood") {
    // a fallen mossy log along the back
    for (let x = Math.floor(cx - hb - 3); x <= Math.ceil(cx + hb + 3); x++) for (let yy = 0; yy < 7; yy++) {
      const end = Math.abs(x - cx) > hb + 1;
      put(x, back - yy, yy === 6 ? ink : yy >= 4 ? pxPick([pxHex("#1e5233"), pxHex("#2f7d4a"), pxHex("#57ad6a")], 0.4 + 0.5 * pxNoise(x * 0.3, seed), x, yy)
        : end ? pxHex(yy % 2 ? "#c98f3a" : "#946027") : pxPick([pxHex("#3b2414"), pxHex("#5e3a1c"), pxHex("#946027")], 0.3 + 0.3 * (yy / 4) + (x % 5 === 0 ? -0.2 : 0), x, yy));
    }
  }

  // what holds things up: a hook for the swing and pegs for the lights on a wall; outdoors, wooden posts
  const wood = [pxHex("#3b2414"), pxHex("#5e3a1c"), pxHex("#946027")];
  const post = (x, y0, y1) => { for (let y = Math.round(y1); y <= Math.round(y0); y++) { put(x - 1, y, wood[0]); put(x, y, wood[2]); put(x + 1, y, wood[1]); } };
  const sx = q(wallAt(0.9, 0)[0]), lx0 = q(N.cx - N.hb + N.base * 0.3), lx1 = q(N.cx + N.hb - N.base * 0.3);
  if (hasDecor("swing")) {
    if (indoor) for (const dx of [-1, 0, 1]) { put(sx + dx, top + 1, pxHex("#8a8494")); put(sx, top + 2, pxHex("#e4dfe8")); }
    else { const px = sx + q(N.base * 0.55); post(px, back - 1, top); for (let x = Math.round(sx - q(N.base * 0.4)); x <= px; x++) { put(x, top, wood[2]); put(x, top + 1, wood[0]); } }
  }
  if (hasDecor("lights")) {
    if (indoor) for (const x of [lx0, lx1]) { put(x, top + 2, pxHex("#8a8494")); put(x, top + 3, pxHex("#5d5666")); }
    else for (const x of [lx0, lx1]) post(x, back - 1, top + 2);
  }
  if (hasDecor("shelf") && !indoor) {
    // outdoors the shelf stands on two legs
    const [shx, shy] = roomSpot("shelf"), sw = q(N.base * 1.2 * N.dk) / 2, py = q(shy - N.base * 0.95 * N.dk);
    for (const x of [q(shx) - sw + 2, q(shx) + sw - 2]) post(Math.round(x), back - 1, py);
  }
  g.putImageData(img, 0, 0);
  return c;
}

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
  const p = N.iso && isoLayout().placed.swing;
  if (p) {
    const tw = N.isoW / ISO_G, [cx, cy] = isoAt((p.i + 0.5) / ISO_G, (p.j + 0.5) / ISO_G), top = cy - (Math.round(tw / PX * 1.8) + 1) * PX;
    const len = (cy - top) * 0.72, a = Math.sin(game.time * 0.0012 * (1 + swingPush)) * (0.18 + swingPush);
    // the bar runs along the wall behind it, and the seat swings out into the room and back
    const sw = p.flip ? [0.894, 0.447] : [-0.894, 0.447], bar = p.flip ? [-tw * 0.3, N.isoH / ISO_G * 0.3] : [tw * 0.3, N.isoH / ISO_G * 0.3];
    return [cx + sw[0] * Math.sin(a) * len * 0.8, top + Math.cos(a) * len + sw[1] * Math.sin(a) * len * 0.8, a, top, bar, cx, cy];
  }
  const [x, y] = decorSpot("swing"), top = N.iso ? isoWallTop(x) + 3 : N.wallTop + 3;
  const len = y - N.base * 0.95 - top, a = Math.sin(game.time * 0.0012 * (1 + swingPush)) * (0.18 + swingPush);
  return [x + Math.sin(a) * len, top + Math.cos(a) * len, a, top];
}

function drawStarryRug(x, y, rx, ry) {
  ctx.save();
  // deep night blue with a gold border and stars that blink in whole steps (on, bright, off)
  ctx.fillStyle = "#1d5276";
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "#0f2f4a";
  ctx.beginPath(); ctx.ellipse(x, y, rx * 0.86, ry * 0.82, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#eec26a"; ctx.lineWidth = PX * 1.1;
  ctx.beginPath(); ctx.ellipse(x, y, rx * 0.93, ry * 0.9, 0, 0, TAU); ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = i * 2.4, d = 0.22 + (i % 5) * 0.13, tw = Math.sin(game.time * 0.0015 + i);
    if (tw < -0.6) continue;
    ctx.fillStyle = tw > 0.5 ? "#fff0b5" : "#eec26a";
    sparklePath(ctx, x + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d, PX * (1.6 + (i % 3) * 0.5)); ctx.fill();
  }
  ctx.restore();
}

const DRAW_DECOR = {
  lamp(x, y) {
    const b = N.base * decorK, top = y - b * 1.25, pulse = 0.85 + 0.15 * Math.sin(game.time * 0.002), off = save.decor.lamp.off;
    if (!off) {
      const glow = ctx.createRadialGradient(x, top, 2, x, top, b * 1.6);
      glow.addColorStop(0, `rgba(255,233,168,${0.35 * pulse})`); glow.addColorStop(1, "rgba(255,233,168,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, top, b * 1.6, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = off ? 0.55 : 1;
    ctx.strokeStyle = "#8a7bc8"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, top + b * 0.15); ctx.stroke();
    ctx.fillStyle = "#5b4aa8"; ctx.beginPath(); ctx.ellipse(x, y, b * 0.2, b * 0.06, 0, 0, TAU); ctx.fill();
    // the crystal shade
    ctx.fillStyle = "#fff3c4";
    ctx.beginPath(); ctx.moveTo(x, top - b * 0.28); ctx.lineTo(x + b * 0.16, top - b * 0.05); ctx.lineTo(x + b * 0.1, top + b * 0.15); ctx.lineTo(x - b * 0.1, top + b * 0.15); ctx.lineTo(x - b * 0.16, top - b * 0.05); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,200,120,.5)";
    ctx.beginPath(); ctx.moveTo(x, top - b * 0.28); ctx.lineTo(x + b * 0.16, top - b * 0.05); ctx.lineTo(x + b * 0.1, top + b * 0.15); ctx.lineTo(x, top); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  },
  mushrooms(x, y) {
    const b = N.base * decorK;
    const k = fxAge("mushrooms"), boing = k < 0.7 ? Math.sin(k * Math.PI * 6) * (1 - k / 0.7) : 0;
    [[-0.3, 0.55, "#8ff0d8"], [0.15, 0.8, "#c9b8ff"], [0.42, 0.45, "#ff9ecb"]].forEach(([dx, h, col], i) => {
      const mx = x + dx * b, cap = b * (0.18 + h * 0.18) * (1 + boing * 0.12), top = y - b * h * (1 - boing * 0.15 * (i % 2 ? -1 : 1));
      ctx.fillStyle = "#e9e1f5"; ctx.fillRect(mx - b * 0.05, top, b * 0.1, b * h);
      const glow = ctx.createRadialGradient(mx, top, 1, mx, top, cap * 2.2);
      glow.addColorStop(0, col + "66"); glow.addColorStop(1, col + "00");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(mx, top, cap * 2.2, 0, TAU); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(mx, top, cap, cap * 0.62, 0, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.8)";
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(mx + (k - 1) * cap * 0.45, top - cap * (0.25 + (k % 2) * 0.15), cap * 0.09, 0, TAU); ctx.fill(); }
    });
  },
  cushion(x, y) {
    const b = N.base * decorK, k = fxAge("cushion"), squish = k < 0.6 ? Math.sin(k * Math.PI * 4) * (1 - k / 0.6) : 0;
    ctx.fillStyle = "rgba(5,0,20,.3)"; ctx.beginPath(); ctx.ellipse(x, y + b * 0.05, b * 0.62, b * 0.12, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.scale(1 + squish * 0.12, 1 - squish * 0.2); ctx.translate(-x, -y);
    ctx.fillStyle = "#e6e0ff";
    for (const [dx, dy, r] of [[-0.35, -0.08, 0.22], [0, -0.16, 0.28], [0.35, -0.08, 0.22], [-0.15, -0.02, 0.24], [0.18, -0.02, 0.24]]) {
      ctx.beginPath(); ctx.arc(x + dx * b, y + dy * b, r * b, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = "rgba(201,184,255,.5)";
    ctx.beginPath(); ctx.ellipse(x, y + b * 0.02, b * 0.55, b * 0.1, 0, 0, TAU); ctx.fill();
    ctx.restore();
  },
  shelf(x, y) {
    const b = N.base * decorK, sy = y - b * 0.95, w = b * 1.2;
    if (N.iso) { ctx.translate(x, sy); ctx.transform(1, wallSlot("shelf").wall === "L" ? -0.5 : 0.5, 0, 1, 0, 0); ctx.translate(-x, -sy); }
    ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(x - w / 2, sy, w, 5);
    ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(x - w / 2 + 6, sy + 5, 4, 10); ctx.fillRect(x + w / 2 - 10, sy + 5, 4, 10);
    // brackets under the plank
    ctx.fillStyle = "rgba(255,255,255,.18)";
    for (const dx of [-0.36, 0.36]) { ctx.beginPath(); ctx.moveTo(x + dx * w - 3, sy + 5); ctx.lineTo(x + dx * w + 3, sy + 5); ctx.lineTo(x + dx * w, sy + b * 0.22); ctx.fill(); }
    const best = Object.entries(save.geodes).filter(([, g]) => g.img).sort((p, q) => (q[1].shine || 0) - (p[1].shine || 0)).slice(0, 3);
    if (!best.length) for (let i = 0; i < 3; i++) {
      const gx = x - w / 2 + w * (0.2 + i * 0.3), hh = b * (0.2 + (i % 2) * 0.12);
      ctx.fillStyle = ["#c9b8ff", "#8fd8ef", "#ff9ecb"][i];
      ctx.beginPath(); ctx.moveTo(gx - hh * 0.3, sy); ctx.lineTo(gx - hh * 0.2, sy - hh * 0.75); ctx.lineTo(gx, sy - hh); ctx.lineTo(gx + hh * 0.2, sy - hh * 0.75); ctx.lineTo(gx + hh * 0.3, sy); ctx.fill();
    }
    best.forEach(([id], i) => {
      const im = geodeImg(id);
      if (!im) return;
      const h = b * 0.55, gw = h * im.width / im.height, gx = x - w / 2 + w * (0.18 + i * 0.32);
      ctx.drawImage(im, gx - gw / 2, sy - h, gw, h);
      // tapped: each geode sparkles in turn
      const k = fxAge("shelf") - i * 0.22;
      if (k > 0 && k < 0.6) { ctx.fillStyle = "#fff"; ctx.globalAlpha = Math.sin(k / 0.6 * Math.PI); sparklePath(ctx, gx + gw * 0.2, sy - h * 0.7, b * 0.16); ctx.fill(); ctx.globalAlpha = 1; }
    });
  },
  spring(x, y) {
    const b = N.base * decorK, rx = b * 0.75, ry = b * 0.22;
    const g = ctx.createRadialGradient(x, y, 2, x, y, rx);
    g.addColorStop(0, "#9fe3e0"); g.addColorStop(1, "#3a6fa8");
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const k = ((game.time / 2200) + i / 3) % 1;
      ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.ellipse(x + rx * 0.1, y, rx * 0.2 + k * rx * 0.75, ry * 0.2 + k * ry * 0.75, 0, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.stroke();
  },
  swing() {
    const [sx, sy, , top] = swingSeat(), b = N.base;
    // ropes as runs of whole pixels
    ctx.fillStyle = "#b9b3c0";
    const px = decorSpot("swing")[0];
    for (const d of [-1, 1]) { const x0 = px + d * b * 0.3, x1 = sx + d * b * 0.3, n = Math.max(1, Math.round((sy - top) / PX)); for (let k = 0; k <= n; k++) ctx.fillRect(Math.round(lerp(x0, x1, k / n) / PX) * PX, Math.round(lerp(top, sy, k / n) / PX) * PX, PX, PX); }
    ctx.fillStyle = "#fff8d6";
    ctx.beginPath(); ctx.arc(sx, sy, b * 0.4, Math.PI * 0.05, Math.PI * 0.95); ctx.arc(sx, sy - b * 0.14, b * 0.36, Math.PI * 0.92, Math.PI * 0.08, true); ctx.closePath(); ctx.fill();
  },
  lights() {
    const cols = ["#ffe9a8", "#ff9ecb", "#8fd8ef", "#b9e88a", "#c9b8ff"];
    ctx.strokeStyle = "rgba(230,224,255,.45)"; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let k = 0; k <= 40; k++) { const [px, py] = lightsLine(k / 40); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
    for (let i = 1; i < 14; i++) {
      const [bx, by] = bulbPos(i);
      const col = cols[i % cols.length], rung = fxAge("bulb" + i), lit = rung < 0.7 ? 1 - rung / 0.7 : 0;
      const k = Math.min(1, 0.55 + 0.45 * Math.sin(game.time * 0.003 + i * 1.3) + lit), r = 14 + lit * 12;
      const g = ctx.createRadialGradient(bx, by, 1, bx, by, r);
      g.addColorStop(0, col); g.addColorStop(1, col + "00");
      ctx.globalAlpha = k; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = lit ? "#fff" : col; ctx.beginPath(); ctx.arc(bx, by, 3.5 + lit * 2, 0, TAU); ctx.fill();
    }
  },
};
