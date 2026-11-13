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
function keepInRoom(a) {
  if (N.iso) {
    const m = isoMargin(0.42); let [u, v] = isoFrom(a.x, a.y); [a.x, a.y] = isoAt(clamp(u, m, 1 - m), clamp(v, m, 1 - m));
    if (a.state !== "visit" || (a.decor !== "swing" && a.decor !== "mushrooms")) pushOutOfPieces(a);
    [u, v] = isoFrom(a.x, a.y); [a.x, a.y] = isoAt(clamp(u, m, 1 - m), clamp(v, m, 1 - m));
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

/** Pick what to do next: nap, dance, visit a friend, or wander (flutterers chase the light motes). */
function chooseNext(a, list) {
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

function updateActors(dt) {
  syncActors();
  game.nest.obst = roomObstacles();
  const list = [...actors.values()], call = game.nest.call;
  for (const a of list) {
    const cr = save.creatures.find(c => c.id === a.id);
    if (!cr) continue;
    a.ph += dt;
    if (a.emote && (a.emote.t += dt) > a.emote.life) a.emote = null;
    a.hop = Math.max(0, a.hop - dt * 2.5);
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
    const base = (a.beh === "flutter" || a.beh === "swim" ? 85 : a.beh === "nap" ? 35 : 55) * N.base / 100;
    let speed = base * (a.rain ? 1.6 : 1), target = null;
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
      speed = base * (a.beh === "curious" ? 2.4 : 1.7);
    } else if (a.state === "called") { a.state = "idle"; a.t = rand(1, 2.5); }
    // someone is being fed: the hungry ones come running, hoping for a crumb
    const fc = game.nest.feedCall;
    if (!target && !cr.sleeping && fc && game.time - fc.t < 3500 && a.id !== fc.id && cr.tummy < 60 && a.state !== "eat" && actors.get(fc.id)) {
      const f = actors.get(fc.id), an = a.id * 2.4;
      if (a.state !== "begging") { emote(a, SNACKS[specOf(cr).snack].emoji, 1.8); a.hop = 1; }
      a.state = "begging"; a.goal = a.friend = null; a.rain = false;
      target = [f.x + Math.cos(an) * N.base * 0.75, f.y + Math.sin(an) * N.base * 0.4];
      speed = base * 2;
    } else if (a.state === "begging") { a.state = "idle"; a.t = rand(1, 2); }
    // until the first stroke, your glowling waits in the middle of the room where the hint points
    if (!target && !cr.sleeping && a.id === save.active && !tipDone("pet") && a.state !== "eat") {
      target = decorSpot("rug"); a.goal = a.friend = null;
      if (a.state !== "idle") { a.state = "idle"; a.t = 1; }
    }
    if (a.id === save.active && game.nest.petting) { a.tx = a.x; a.ty = a.y; a.state = "idle"; a.t = 1.5; }
    else if (target) { a.tx = target[0]; a.ty = target[1]; }
    else if (a.state === "eat") { if ((a.t -= dt) <= 0) { a.state = "idle"; a.t = rand(1, 2); } }
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
    const walking = N.iso && !["nap", "dance", "eat", "sleep", "visit"].includes(a.state) && !(a.id === save.active && game.nest.petting);
    const wp = walking ? nextWaypoint(a, dt) : null;
    const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
    if (a.state === "toBed" && d <= 8) { a.state = "sleep"; a.hop = 1; } // close enough: lie down (the room's edge may keep the exact spot just out of reach)
    const still = ["nap", "dance", "eat", "sleep", "visit"].includes(a.state);
    const moving = d > 3 && !still;
    if (!moving) a.vx = a.vy = 0;
    if (moving && wp) {
      // walking has weight: it picks up speed from a stop, slows down to arrive, and turns gradually toward the next corner of its way
      const [wx, wy] = wp, wdx = wx - a.x, wdy = wy - a.y, wd = Math.hypot(wdx, wdy) || 1;
      const left = Math.hypot(a.tx - a.x, a.ty - a.y), want = speed * (a.state === "toBed" ? 1.4 : 1) * clamp(left / (N.base * 0.4) + 0.35, 0.35, 1);
      const k = Math.min(1, dt * 5);
      a.vx = lerp(a.vx || 0, wdx / wd * want, k); a.vy = lerp(a.vy || 0, wdy / wd * want, k);
      const gate = a.beh === "hop" ? Math.max(0, Math.sin(a.ph * 7)) * 2 : 1;
      const step = Math.hypot(a.vx, a.vy) * dt * gate, lim = Math.min(step, wd);
      const x0 = a.x, y0 = a.y;
      if (step > 0) { a.x += a.vx * dt * gate * (lim / step); a.y += a.vy * dt * gate * (lim / step); }
      // pressed against something for a second and a half without getting anywhere: give up and think of something else
      if (a.lastX === undefined) { a.lastX = x0; a.lastY = y0; }
      a.stuck = Math.hypot(a.x - a.lastX, a.y - a.lastY) < N.base * 0.15 ? (a.stuck || 0) + dt : 0;
      if (!a.stuck) { a.lastX = a.x; a.lastY = a.y; }
      if (a.stuck > 1.5) { a.stuck = 0; a.lastX = a.lastY = undefined; a.goal = a.friend = null; a.rain = false; if (a.state === "walk" || a.state === "idle") { a.state = "idle"; a.t = rand(0.5, 1.5); a.tx = a.x; a.ty = a.y; } else a.repath = 0; }
    } else if (moving) {
      const hopper = a.beh === "hop";
      const step = Math.min(d, speed * dt * (hopper ? Math.max(0, Math.sin(a.ph * 7)) * 2 : 1));
      a.x += dx / d * step; a.y += dy / d * step;
    } else if (a.state === "walk" && a.goal) {
      // arrived at a favorite thing
      const d = DECO[a.goal];
      a.decor = a.goal; a.goal = null;
      a.state = d.id === "cushion" ? "nap" : d.id === "rug" ? "dance" : "visit";
      a.t = d.id === "cushion" ? rand(6, 10) : rand(3, 6);
      emote(a, d.emote, 2);
      if (a.id === save.active) floatText(`${specOf(cr).name} ${d.verb}`, a.x, a.y - N.base * 1.2, "#e6e0ff");

    } else if (a.state === "walk" && a.rain) {
      // under the cloud: a little dance in the rain (or snow)
      a.rain = false; a.state = "dance"; a.t = rand(0.9, 1.6); a.hop = 1;
      emote(a, weather.kind === "snow" ? "❄" : "💧", 1.2);
    } else if (a.state === "walk" && a.garden) {
      a.garden = false; a.state = "idle"; a.t = rand(1.5, 3); emote(a, "💧", 1.6); gardenHelp(cr);
    } else if (a.state === "walk") {
      a.state = "idle"; a.t = rand(1.2, 3.5);
      const f = a.friend && actors.get(a.friend);
      if (f) meetFriend(a, f, cr);
      a.friend = null;
    } else if (a.state === "toBed" && d <= 8) a.state = "sleep";
    keepInRoom(a);
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
    else if (a.beh === "flutter") ease(N.base * (0.5 + 0.14 * Math.sin(a.ph * 3)), 3);
    else if (a.beh === "swim") ease(N.base * (0.28 + 0.1 * Math.sin(a.ph * 1.6)), 3);
    else if (a.beh === "hop" && moving) a.alt = Math.abs(Math.sin(a.ph * 7)) * N.base * 0.18;
    else ease(0, 6);
    if (a.state === "dance") a.hop = Math.abs(Math.sin(a.ph * 6)) * 0.6;
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
          const ph = (game.time / 1000 + a.id * 0.37) / 0.75, i = Math.floor(ph) % caps.length, k = ph - Math.floor(ph), [x0, y0] = caps[i], [x1, y1] = caps[(i + 1) % caps.length];
          const size = N.base * depth(a.y), top = lerp(y0, y1, k) - Math.sin(k * Math.PI) * N.base * 0.4, p = isoLayout().placed.mushrooms;
          a.x = lerp(x0, x1, k); a.y = isoAt((p.i + 0.5) / ISO_G, (p.j + 0.5) / ISO_G)[1] + 1;
          a.alt = a.y - size * 0.45 - (top - size * 0.32); a.hop = k < 0.12 ? 0.5 : 0;
          if (k < 0.05 && !a.landed) { a.landed = true; if (Math.random() < 0.3 && sfx.ready()) sfx.tone(sfx.ac.currentTime, 520 + i * 90, 0.02, 0.12, "sine", 700 + i * 90); } else if (k > 0.5) a.landed = false;
        } else a.hop = Math.abs(Math.sin(a.ph * 5)) * 0.8;
      }
      else if (a.decor === "spring") a.alt = Math.sin(a.ph * 2.5) * N.base * 0.04;
    }
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
  const rk = `${currentTheme()}|${W}|${H}|${PX}|${hasDecor("swing")}|${hasDecor("lights")}|${hasDecor("shelf")}|${hasDecor("painting")}|${JSON.stringify(wallSlot("painting"))}|${save.paintScene || 0}`;
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
}).map(([k, v]) => [k, pxHex(v)]));

/** A little canvas in art pixels, with tools that draw on the 2:1 grid; an ink outline goes round everything at the end. */
/**
 * Material texture, applied to a finished piece: every pixel of a known ramp (wood, stone, metal, cloth, crystal…) is nudged
 * one shade lighter or darker by noise shaped for that material, so surfaces read as grain, grit or weave instead of flat paint.
 * Colours stay on the palette; only where each shade falls changes.
 */
const TEX_RAMPS = [
  ["wood", ["w3", "w2", "w1", "w0"]], ["stone", ["s4", "s3", "s2", "s1", "s0"]], ["crystal", ["l4", "l3", "l2", "l1", "l0"]],
  ["cloth", ["p3", "p2", "p1", "p0"]], ["metal", ["b3", "b2", "b1", "b0"]], ["leaf", ["g3", "g2", "g1", "g0"]], ["cloth", ["r3", "r2", "r1"]],
];
let texIndex = null;
function texShade(kind, x, y) {
  // positive: lighter, negative: darker
  // thin grain lines, a few knots: texture, not blotches, so the shapes on a piece still read
  if (kind === "wood") { const g = pxNoise(x * 0.12, y * 0.9 + Math.floor(x / 19) * 3.1); if (pxHash(x >> 1, y >> 1) > 0.998) return -2; return Math.abs(g - 0.5) < 0.035 ? -1 : g > 0.82 ? 1 : 0; }
  if (kind === "stone") { const g = pxFbm(x * 0.16, y * 0.16), sp = pxHash(x, y); return sp > 0.988 ? 1 : sp < 0.01 ? -1 : g > 0.69 ? -1 : g < 0.25 ? 1 : 0; }
  if (kind === "metal") { const sc = Math.abs(pxNoise(x * 0.04 + y * 0.12, y * 0.04) - 0.5) < 0.02; return sc ? 1 : pxHash(x, y) > 0.97 ? -1 : 0; }
  if (kind === "cloth") return (x + y) % 4 === 0 && pxHash(x >> 1, y >> 1) > 0.5 ? -1 : 0;
  if (kind === "leaf") { const g = pxFbm(x * 0.3, y * 0.3); return g > 0.62 ? -1 : g < 0.32 ? 1 : 0; }
  if (kind === "crystal") return pxHash(x, y) > 0.985 ? 1 : 0;
  return 0;
}
function texturize(d, w, h, glowPx) {
  if (!texIndex) { texIndex = new Map(); for (const [kind, ramp] of TEX_RAMPS) ramp.forEach((k, i) => { const c = IC[k]; texIndex.set((c[0] << 16) | (c[1] << 8) | c[2], { kind, ramp: ramp.map(n => IC[n]), i }); }); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4; if (d[o + 3] === 0 || glowPx.has(y * w + x)) continue;
    const m = texIndex.get((d[o] << 16) | (d[o + 1] << 8) | d[o + 2]); if (!m) continue;
    // wood's brightest shade drops a step (real timber is brown, not orange); the others keep their contrast
    const sh = texShade(m.kind, x, y) + (m.kind === "wood" && m.i === m.ramp.length - 1 ? -1 : 0); if (!sh) continue;
    // (wood never brightens into its top highlight: that reads as straw)
    const top = m.kind === "wood" && m.i < m.ramp.length - 1 ? m.ramp.length - 2 : m.ramp.length - 1;
    const c = m.ramp[clamp(m.i + sh, 0, Math.max(top, m.i))]; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2];
  }
}
function isoArt(w, h, paint, { outline = true, texture = true, light = true } = {}) {
  w = Math.ceil(w); h = Math.ceil(h);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data;
  const T = {
    w, h, glowPx: new Set(),
    px(x, y, col) { x = Math.round(x); y = Math.round(y); if (!col || x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; T.glowPx.delete(y * w + x); },
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
      T.poly([Bv, Buv, up(Buv), up(Bv)], left);
      T.poly([Bu, Buv, up(Buv), up(Bu)], right);
      T.poly([up([x, y]), up(Bu), up(Buv), up(Bv)], top);
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
      for (let k = 0; k <= hgt; k++) T.disc(cx, cy - k, rx, (x) => x < cx - rx * 0.3 ? side : x > cx + rx * 0.35 ? dark : side);
      T.disc(cx, cy - hgt, rx, top);
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
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let e = dx + dy;
      for (;;) { T.px(x0, y0, col); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
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
  if (texture) texturize(d, w, h, T.glowPx);
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
  const key = save.room + "|" + out.join(",") + JSON.stringify(mine);
  if (isoLayoutCache && isoLayoutCache.key === key) return isoLayoutCache;
  const busy = new Set(), placed = {};
  const take = (i, j, fw, fd) => { for (let a = 0; a < fw; a++) for (let b = 0; b < fd; b++) busy.add(`${i + a},${j + b}`); };
  const free = (i, j, fw, fd) => { if (i < 0 || j < 0) return false; for (let a = 0; a < fw; a++) for (let b = 0; b < fd; b++) if (i + a >= ISO_G || j + b >= ISO_G || busy.has(`${i + a},${j + b}`)) return false; return true; };
  const fixed = Object.fromEntries((ROOM_FIXED[save.rooms[save.room]?.kind] || ["bed"]).map(id => [id, ISO_FIXED[id]]));
  const all = [...Object.keys(fixed), ...out];
  for (const id of all) {
    const m = mine[id]; if (!m) continue;
    const d = pieceDims(id, m.flip);
    if (free(m.i, m.j, d.fw, d.fd)) { take(m.i, m.j, d.fw, d.fd); placed[id] = { id, i: m.i, j: m.j, ...d, flip: !!m.flip }; }
  }
  for (const [id, f] of Object.entries(fixed)) if (!placed[id]) {
    const spot = [f.at, ...Array.from({ length: ISO_G * ISO_G }, (_, k) => [k % ISO_G, Math.floor(k / ISO_G)])].find(([i, j]) => free(i, j, f.fw, f.fd));
    if (spot) { take(spot[0], spot[1], f.fw, f.fd); placed[id] = { id, i: spot[0], j: spot[1], fw: f.fw, fd: f.fd, flip: false }; }
  }
  // the rug's middle stays open for pieces placed on their own: glowlings dance there
  const center = ["2,2", "2,3", "3,2", "3,3"].filter(t => !busy.has(t));
  center.forEach(t => busy.add(t));
  for (const id of out) {
    if (placed[id]) continue;
    // its favorite tiles, or else any free one (so nothing that's out ever goes missing)
    const f = ISO_PLACES[id], spot = f.at.find(([i, j]) => free(i, j, f.fw, f.fd)) || Array.from({ length: ISO_G * ISO_G }, (_, k) => [k % ISO_G, Math.floor(k / ISO_G)]).find(([i, j]) => free(i, j, f.fw, f.fd));
    if (!spot) continue;
    take(spot[0], spot[1], f.fw, f.fd);
    placed[id] = { id, i: spot[0], j: spot[1], fw: f.fw, fd: f.fd, flip: autoFlip(id, spot[0], spot[1], false) };
  }
  center.forEach(t => busy.delete(t));
  return (isoLayoutCache = { key, placed, busy });
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
/** A shop shelf along a wall (along u when dir is 1, along v when -1): planks of jars, packets and loaves. */
/** A shop shelf along a wall (along u when dir is 1, along v when -1): four oak planks of clay jars, blue crocks, bottles, loaves and bolts of cloth. */
function shopShelf(T, x, y, a, b, h, dir) {
  const q = T.box(x, y, a, b, h, IC.w2, IC.w2, IC.w3);
  const [f0, f1] = dir > 0 ? [q.Bv, q.Buv] : [q.Buv, q.Bu], len = Math.hypot(f1[0] - f0[0], f1[1] - f0[1]);
  const at = (f, lift) => [f0[0] + (f1[0] - f0[0]) * f, f0[1] + (f1[1] - f0[1]) * f - lift];
  // the dark back of the shelves, then the planks
  T.poly([at(0.04, h * 0.06), at(0.96, h * 0.06), at(0.96, h * 0.94), at(0.04, h * 0.94)], IC.w3);
  const rows = 4, rowH = h * 0.88 / rows;
  for (let r = 0; r < rows; r++) {
    const lift = h * 0.06 + r * rowH;
    for (let k = 0; k <= len; k++) { const [px, py] = at(k / len, lift); T.px(px, py, IC.w1); T.px(px, py + 1, IC.w2); }
    // goods along the plank, by row: crocks, jars, bottles, loaves and cloth
    const kind = ["crock", "jar", "bottle", "bread"][r];
    for (let n = 0; n < 5; n++) {
      const f = 0.1 + n * 0.19, [px, py] = at(f, lift + 1), size = rowH * 0.62;
      if (kind === "crock") { T.cyl(px, py, size * 0.38, Math.round(size * 0.55), IC.b0, IC.b1, IC.b2); T.disc(px, py - size * 0.55, size * 0.2, IC.b3); }
      else if (kind === "jar") { T.cyl(px, py, size * 0.32, Math.round(size * 0.62), IC.r1, IC.r2, IC.r3); T.disc(px, py - size * 0.62, size * 0.32, IC.w3); T.line(px - size * 0.3, py - size * 0.3, px + size * 0.3, py - size * 0.3, IC.y0); }
      else if (kind === "bottle") { T.cyl(px, py, size * 0.2, Math.round(size * 0.45), IC.g1, IC.g1, IC.g2); T.line(px, py - size * 0.45, px, py - size * 0.75, IC.g2); T.px(px, py - size * 0.78, IC.w3); }
      else { T.ball(px, py - size * 0.25, size * 0.42, IC.w0, IC.w1, IC.w2, size * 0.26); T.line(px - size * 0.2, py - size * 0.4, px + size * 0.1, py - size * 0.3, IC.w2); }
    }
  }
}
/** Apothecary drawers along a wall: a grid of little drawers with brass pulls, a ledge on top with a mortar and pestle. */
function shopDrawers(T, x, y, a, b, h) {
  const q = T.box(x, y, a, b, h, IC.w2, IC.w2, IC.w3);
  const [f0, f1] = [q.Buv, q.Bu], at = (f, up) => [f0[0] + (f1[0] - f0[0]) * f, f0[1] + (f1[1] - f0[1]) * f - up];
  const cols = 4, rows = 6;
  for (let r = 0; r <= rows; r++) for (let k = 0; k <= 40; k++) { const [px, py] = at(k / 40, h * 0.06 + r * h * 0.88 / rows); T.px(px, py, IC.w3); }
  for (let c = 0; c <= cols; c++) for (let k = 0; k <= h * 0.88; k++) { const [px, py] = at(c / cols, h * 0.06 + k); T.px(px, py, IC.w3); }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const lo = h * 0.06 + r * h * 0.88 / rows, hi = lo + h * 0.88 / rows, c0 = (c + 0.1) / cols, c1 = (c + 0.9) / cols;
    T.poly([at(c0, lo + 1), at(c1, lo + 1), at(c1, hi - 1), at(c0, hi - 1)], IC.w1);
    const [px, py] = at((c + 0.5) / cols, (lo + hi) / 2); T.px(px, py, IC.y0); T.px(px + 1, py, IC.y1);
  }
  const [mx, my] = at(0.7, h); T.cyl(mx, my, 3, 3, IC.s1, IC.s2, IC.s3); T.line(mx, my - 3, mx + 3, my - 8, IC.w2);
}
/** A wooden barrel with iron hoops, full to the top. */
function woodBarrel(t, T, cx, cy, fill) {
  const r = t * 0.3, h = Math.round(t * 0.7);
  T.cyl(cx, cy, r, h, IC.w0, IC.w1, IC.w2);
  for (const k of [0.2, 0.75]) T.disc(cx, cy - h * k, r + 0.5, (x) => x < cx ? IC.s2 : IC.s3, r / 2 * 0.25);
  T.disc(cx, cy - h, r * 0.8, fill);
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
    // a rough arch into the dark with crystals round its mouth and rails running in
    const a = t - 2, b = t * 0.5, h = Math.round(t * 1.5), x = ax, y = ay + 1;
    const rock = (c0, c1, c2) => (px, py) => { const n = pxHash(px >> 1, py >> 1); return n > 0.86 ? c2 : n > 0.55 ? c1 : c0; };
    const q = T.box(x, y, a, b, h, rock(IC.s2, IC.l4, IC.s3), rock(IC.s3, IC.s2, IC.s4), rock(IC.s4, IC.s3, IC.ink2));
    // a ragged crest along the top, so it reads as a cliff rather than a block
    for (let k = 0; k < 7; k++) { const f = (k + 0.5) / 7, bx = q.top[0] + (q.Bu[0] - x) * f, by = q.top[1] + (q.Bu[1] - y) * f, hh = t * (0.15 + pxHash(k, 9) * 0.3), w = t * 0.16;
      T.poly([[bx - w, by + 1], [bx + w * 0.3, by - hh], [bx + w, by + 2]], k % 2 ? IC.s2 : IC.l4); }
    const mx = (q.Bv[0] + q.Buv[0]) / 2 + a * 0.5, my = (q.Bv[1] + q.Buv[1]) / 2 + a * 0.25, w = t * 0.45;
    T.poly([[mx - w, my - w / 2], [mx + w, my + w / 2], [mx + w, my + w / 2 - h * 0.55], [mx + w * 0.3, my - h * 0.8], [mx - w * 0.5, my - w / 2 - h * 0.62]], IC.ink);
    T.glow(mx, my - h * 0.3, t * 0.9, IC.l3, 0.3);
    for (const [dx, hh, c] of [[-w - 3, 7, IC.l1], [w + 2, 6, IC.l2], [-w + 1, 4, IC.l0], [w - 2, 9, IC.l1]]) for (let k = 0; k < hh; k++) { T.px(mx + dx, my + dx / 2 - 1 - k, c); if (k < hh - 2) T.px(mx + dx + 1, my + dx / 2 - 1 - k, IC.l3); }
    for (const off of [-w * 0.45, w * 0.45]) for (let k = 0; k < t * 0.9; k++) T.px(mx + off + k * 0.2 - k * 0.9, my + off / 2 + k * 0.55, IC.s1);
    for (let k = 0; k < 5; k++) T.line(mx - w * 0.6 - k * t * 0.15, my - w * 0.3 + k * t * 0.1, mx + w * 0.6 - k * t * 0.15, my + w * 0.3 + k * t * 0.1, IC.w2);
  },
  altar(t, T, ax, ay, o) {
    // a stone pedestal; today's moon egg rests on it until you've opened it
    const cx = ax, cy = ay + t / 2;
    T.cyl(cx, cy, t * 0.3, Math.round(t * 0.16), IC.s1, IC.s2, IC.s3);
    T.cyl(cx, cy - t * 0.16, t * 0.18, Math.round(t * 0.4), IC.s0, IC.s1, IC.s2);
    const top = cy - t * 0.56;
    T.cyl(cx, top, t * 0.26, 2, IC.s0, IC.s1, IC.s2);
    if (!o.done) { T.glow(cx, top - t * 0.3, t * 0.9, IC.b0, 0.45); T.ball(cx, top - t * 0.28, t * 0.2, IC.white, IC.b0, IC.l2, t * 0.26); T.px(cx - 1, top - t * 0.4, IC.white); }
    else { T.ball(cx - 2, top - 2, t * 0.12, IC.s0, IC.s1, IC.s2, t * 0.08); T.ball(cx + 3, top - 1, t * 0.1, IC.s0, IC.s1, IC.s2, t * 0.07); }
  },
  wallmap(t, T, ax, ay) {
    // the map of the levels, pinned high on the wall: a parchment with a red trail of dots down through four caves
    const x = ax + 1, y = ay + t * 0.5, lift = Math.round(t * 1.35), w = t * 0.95, h = Math.round(t * 1.05);
    const p0 = [x, y - lift], p1 = [x - 2 * w, y - lift + w], p2 = [p1[0], p1[1] - h], p3 = [p0[0], p0[1] - h];
    T.poly([p3, p2, p1, p0], (px, py) => pxHash(px, py) > 0.88 ? IC.w0 : pxPick([IC.w0, IC.y0], 0.5, px, py));
    const at = (u, v) => [p3[0] + (p2[0] - p3[0]) * u, p3[1] + (p2[1] - p3[1]) * u + h * v];
    // four caves in bands of their crystal colours, and the trail zig-zagging down through them
    for (const [v, c] of [[0, IC.l1], [0.25, IC.b0], [0.5, IC.g0], [0.75, IC.l3]]) for (let k = 0; k <= 20; k++) for (let r = 0; r < h * 0.25 - 1; r++) { const [px, py] = at(k / 20, v + r / h + 0.02); if (pxHash(px, py) > 0.55) T.px(px, py, c); }
    let prev = at(0.25, 0.08);
    for (let k = 1; k <= 8; k++) { const cur = at(k % 2 ? 0.75 : 0.25, 0.08 + k * 0.105); T.line(prev[0], prev[1], cur[0], cur[1], IC.r2); T.px(cur[0], cur[1] - 1, IC.r1); prev = cur; }
    const [sx, sy] = at(0.5, 0.12); T.px(sx, sy - 1, IC.r2); T.px(sx + 1, sy - 1, IC.r2); T.px(sx, sy, IC.r2);
    for (const q of [p3, p2]) { T.px(q[0], q[1] + 1, IC.s1); T.px(q[0], q[1] + 2, IC.s2); }
    T.line(p0[0], p0[1], p1[0], p1[1], IC.w2); T.line(p3[0], p3[1], p2[0], p2[1], IC.w1);
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
    // a little glasshouse: a white frame, panes catching the light, ferns and tomatoes inside, a peaked glass roof
    const a = t * 0.95, b = t * 0.95, h = Math.round(t * 1.1), x = ax, y = ay + 2;
    const q = T.box(x, y, a, b, h, IC.b0, (px, py) => (px + py) % 5 === 0 ? IC.white : pxHash(px, py) > 0.75 ? IC.g1 : IC.b1, (px, py) => (px + py) % 5 === 0 ? IC.b0 : pxHash(px, py) > 0.8 ? IC.g2 : IC.b2);
    for (const [p0, p1] of [[q.Bv, q.Buv], [q.Buv, q.Bu]]) for (let k = 0; k <= 4; k++) { const f = k / 4, px = p0[0] + (p1[0] - p0[0]) * f, py = p0[1] + (p1[1] - p0[1]) * f; T.line(px, py, px, py - h, IC.white); }
    T.line(q.Bv[0], q.Bv[1] - h * 0.5, q.Buv[0], q.Buv[1] - h * 0.5, IC.white); T.line(q.Buv[0], q.Buv[1] - h * 0.5, q.Bu[0], q.Bu[1] - h * 0.5, IC.white);
    const top = [q.top, [q.Bu[0], q.Bu[1] - h], [q.Buv[0], q.Buv[1] - h], [q.Bv[0], q.Bv[1] - h]], ridge0 = [(top[0][0] + top[3][0]) / 2, (top[0][1] + top[3][1]) / 2 - t * 0.5], ridge1 = [(top[1][0] + top[2][0]) / 2, (top[1][1] + top[2][1]) / 2 - t * 0.5];
    T.poly([top[3], top[2], ridge1, ridge0], (px, py) => (px - py) % 6 === 0 ? IC.white : IC.b0);
    T.poly([top[2], top[1], ridge1], IC.b1);
    T.line(ridge0[0], ridge0[1], ridge1[0], ridge1[1], IC.white);
    for (let k = 0; k < 4; k++) T.px(q.Bv[0] + 4 + k * 5, q.Bv[1] + 2 + k * 2.5 - h * 0.3, k % 2 ? IC.r1 : IC.y1);
  },
  potting(t, T, ax, ay) {
    // a potting bench along the wall: terracotta pots of seedlings, a trowel, a watering can
    const a = t * 0.3, b = t - 2, h = Math.round(t * 0.6), x = ax, y = ay + 1;
    T.box(x, y, a, b, h, IC.w1, IC.w2, IC.w3);
    for (let k = 0; k < 4; k++) { const px = x - 2 * b * (k + 0.6) / 4.4 + a, py = y + b * (k + 0.6) / 4.4 + a / 2 - h; T.cyl(px, py, t * 0.09, Math.round(t * 0.16), IC.r1, IC.r1, IC.r2); T.px(px, py - t * 0.2, IC.g0); T.px(px - 1, py - t * 0.24, IC.g1); T.px(px + 1, py - t * 0.26, IC.g0); }
    const cx = x - b * 0.4, cy = y + b + 2;
    T.cyl(cx, cy, t * 0.12, Math.round(t * 0.2), IC.s1, IC.s2, IC.s3); T.line(cx + t * 0.12, cy - t * 0.12, cx + t * 0.3, cy - t * 0.25, IC.s2);
  },
  skep(t, T, ax, ay) {
    // a straw bee skep on a little stand: coiled rows of straw, a dark doorway at its foot, a bee or two about
    const cx = ax, cy = ay + t / 2, straw = [pxHex("#7a5a2c"), pxHex("#a8844a"), pxHex("#d2b273"), pxHex("#ead09a")];
    T.box(cx - t * 0.02, cy - t * 0.3, t * 0.28, t * 0.28, Math.round(t * 0.28), IC.w1, IC.w2, IC.w3);
    const base = cy - t * 0.42, r = t * 0.3, hgt = t * 0.62;
    for (let k = 0; k < 7; k++) { const f = k / 7, rr = r * Math.sqrt(1 - f * f * 0.9), yy = base - hgt * f; T.disc(cx, yy, rr, (px) => px < cx - rr * 0.3 ? straw[3] : px > cx + rr * 0.4 ? straw[1] : straw[2], rr * 0.45); T.line(cx - rr, yy, cx + rr, yy, straw[0]); }
    T.ball(cx, base - hgt, r * 0.25, straw[2], straw[1], straw[0], r * 0.18);
    T.poly([[cx - 2, base + 1], [cx + 2, base + 2], [cx + 2, base - 2], [cx - 2, base - 3]], IC.ink2);
    for (const [dx, dy] of [[-r * 1.2, -hgt * 0.6], [r * 1.1, -hgt * 0.9]]) { T.px(cx + dx, base + dy, IC.y1); T.px(cx + dx + 1, base + dy, IC.ink2); T.px(cx + dx, base + dy - 1, IC.white); }
  },
  coldframe(t, T, ax, ay) {
    // a cold frame: a low wooden box with a sloping glass lid propped open, seedlings in rows inside
    const a = t - 2, b = t * 0.42, x = ax, y = ay + t * 0.05, h = Math.round(t * 0.32);
    const q = T.box(x, y, a, b, h, IC.w1, IC.w2, IC.w3);
    T.poly([q.top, [q.top[0] + 2 * a, q.top[1] + a], [q.top[0] + 2 * a - 2 * b, q.top[1] + a + b], [q.top[0] - 2 * b, q.top[1] + b]], IC.w3);
    for (let r = 0; r < 2; r++) for (let k = 0; k < 7; k++) { const px = q.top[0] - 2 * b * (r * 0.5 + 0.25) + 2 * a * (k + 0.5) / 7, py = q.top[1] + b * (r * 0.5 + 0.25) + a * (k + 0.5) / 7; T.px(px, py - 1, IC.g0); T.px(px - 1, py - 2, IC.g1); T.px(px + 1, py - 2, IC.g0); }
    // the lid, raised on a stick, panes catching the light
    const lift = t * 0.45, l0 = [q.top[0], q.top[1] - lift], l1 = [q.top[0] + 2 * a, q.top[1] + a - lift];
    T.poly([l0, l1, [l1[0] - 2 * b * 0.9, l1[1] + b * 0.9 + lift * 0.6], [l0[0] - 2 * b * 0.9, l0[1] + b * 0.9 + lift * 0.6]], (px, py) => (px - py * 2) % 7 === 0 ? IC.white : IC.b0);
    T.line(l0[0], l0[1], l1[0], l1[1], IC.w1);
    T.line(q.top[0] + a, q.top[1] + a / 2, q.top[0] + a, q.top[1] + a / 2 - lift, IC.w2);
  },
  sunflowers(t, T, ax, ay) {
    // three tall sunflowers nodding at the moon
    const cx = ax, cy = ay + t / 2;
    for (const [dx, hh, k0] of [[-t * 0.24, 1.45, 0.85], [t * 0.18, 1.85, 1], [t * 0.0, 1.1, 0.75]]) {
      const top = cy - t * hh, r = t * 0.17 * k0, x = cx + dx;
      for (let y = cy; y > top; y--) { T.px(x, y, IC.g2); T.px(x + 1, y, IC.g3); }
      for (const [ly, side] of [[0.35, -1], [0.55, 1]]) T.ball(x + side * r * 0.9, cy - t * hh * ly, r * 0.55, IC.g0, IC.g1, IC.g2, r * 0.3);
      T.ball(x, top, r * 1.45, IC.y0, IC.y1, IC.w1, r * 1.2);
      T.ball(x, top, r * 0.65, IC.w2, IC.w3, IC.w3, r * 0.55);
    }
  },
  barrow(t, T, ax, ay) {
    // a wheelbarrow full of soil, with a spade stuck in it
    const cx = ax, cy = ay + t / 2;
    T.disc(cx + t * 0.3, cy, t * 0.12, IC.s3);
    T.box(cx - t * 0.25, cy - t * 0.4, t * 0.34, t * 0.22, Math.round(t * 0.26), IC.w3, IC.r2, IC.r3);
    T.line(cx - t * 0.55, cy - t * 0.05, cx - t * 0.25, cy - t * 0.2, IC.w2);
    T.line(cx + t * 0.05, cy - t * 0.62, cx + t * 0.12, cy - t * 0.12, IC.w2); T.box(cx + t * 0.04, cy - t * 0.72, 2, 1, 3, IC.s1, IC.s2, IC.s3);
  },
  // ---- the shop
  shelves(t, T, ax, ay) {
    // tall oak shelves against the wall, full of crocks, jars, bottles and loaves; a garland of herbs and onions hangs above
    const h = Math.round(t * 2.1);
    shopShelf(T, ax, ay + 1, t - 2, t * 0.3, h, 1);
    for (let k = 0; k < 9; k++) { const f = (k + 0.5) / 9, x = ax - t * 0.6 + (2 * (t - 2)) * f, y = ay + 1 - h - 3 + (t - 2) * f; T.line(x, y, x, y + 4 + (k % 3) * 2, IC.w3); k % 3 === 1 ? T.ball(x, y + 7 + (k % 3) * 2, 2, IC.p0, IC.p1, IC.p2, 2.2) : (T.px(x - 1, y + 6, IC.g1), T.px(x, y + 7, IC.g0), T.px(x + 1, y + 6, IC.g2)); }
  },
  shelves2(t, T, ax, ay) {
    // apothecary drawers along the other wall
    shopDrawers(T, ax, ay + 1, t * 0.3, t - 2, Math.round(t * 1.8));
  },
  counter(t, T, ax, ay) {
    // a plank counter with panelled front, and on top: brass scales, a ledger, a cash box and a jar of sweets
    const a = t - 2, b = t * 0.42, h = Math.round(t * 0.85), x = ax, y = ay + t * 0.08;
    const q = T.box(x, y, a, b, h, IC.w1, IC.w2, IC.w3);
    // panels on the front face, a darker plinth at the bottom
    for (let k = 0; k < 4; k++) { const f0 = k / 4 + 0.03, f1 = (k + 1) / 4 - 0.03, p = f => [q.Bv[0] + (q.Buv[0] - q.Bv[0]) * f, q.Bv[1] + (q.Buv[1] - q.Bv[1]) * f];
      const [a0, a1] = [p(f0), p(f1)]; T.poly([[a0[0], a0[1] - h * 0.18], [a1[0], a1[1] - h * 0.18], [a1[0], a1[1] - h * 0.85], [a0[0], a0[1] - h * 0.85]], IC.w3); T.poly([[a0[0] + 1, a0[1] - h * 0.22], [a1[0] - 1, a1[1] - h * 0.22], [a1[0] - 1, a1[1] - h * 0.8], [a0[0] + 1, a0[1] - h * 0.8]], IC.w2); }
    const on = f => [x - b + a * f * 2, y + b / 2 + a * f - h];
    { const [sx, sy] = on(0.22); T.line(sx, sy, sx, sy - t * 0.5, IC.y1); T.line(sx - 6, sy - t * 0.5, sx + 6, sy - t * 0.5, IC.y0); for (const d of [-6, 6]) { T.line(sx + d, sy - t * 0.5, sx + d - 2, sy - t * 0.32, IC.y1); T.line(sx + d, sy - t * 0.5, sx + d + 2, sy - t * 0.32, IC.y1); T.disc(sx + d, sy - t * 0.31, 3, IC.y1, 1.2); } T.cyl(sx, sy, 3, 1, IC.y1, IC.y1, IC.w2); }
    { const [lx, ly] = on(0.55); T.poly([[lx - 7, ly - 1], [lx + 1, ly + 3], [lx + 8, ly - 1], [lx, ly - 5]], IC.s0); T.line(lx, ly - 5, lx + 1, ly + 3, IC.s2); for (let k = 0; k < 3; k++) T.line(lx - 5 + k, ly - 1 - k * 0.5, lx - 1 + k, ly + 1 - k * 0.5, IC.s2); }
    { const [cx2, cy2] = on(0.85); T.box(cx2 - 3, cy2 - 4, 4, 3, 4, IC.w1, IC.w2, IC.w3); T.px(cx2 - 1, cy2 - 3, IC.y0); }
    { const [jx, jy] = on(1.08); T.cyl(jx, jy, t * 0.12, Math.round(t * 0.3), IC.b0, IC.b0, IC.b1); for (const [dx, dy, c] of [[-1, -2, IC.r1], [1, -3, IC.y1], [0, -5, IC.p1]]) T.px(jx + dx, jy + dy, c); }
  },
  crates(t, T, ax, ay) {
    const cx = ax, cy = ay + t / 2, a = t * 0.4, b = t * 0.4, h = Math.round(t * 0.46);
    const one = (x, y, hh, top) => { const q = T.box(x, y, a, b, hh, top, IC.w2, IC.w3); T.line(q.Bv[0], q.Bv[1] - 1, q.Buv[0], q.Buv[1] - hh + 1, IC.w3); T.line(q.Buv[0], q.Buv[1] - 1, q.Bu[0], q.Bu[1] - hh + 1, IC.w3); return q; };
    one(cx, cy - a, h, IC.w1); const q = one(cx + 1, cy - a - h, Math.round(h * 0.8), IC.w1);
    for (let k = 0; k < 4; k++) T.ball(q.top[0] - 2 + k * 2, q.top[1] + a * 0.6 + (k % 2), 1.5, IC.r1, IC.r1, IC.r2);
  },
  sacks(t, T, ax, ay) {
    // fat sacks of flour and seeds, tied at the top
    const cx = ax, cy = ay + t / 2;
    for (const [dx, dy, r, c] of [[-t * 0.2, -t * 0.05, t * 0.32, [IC.s0, IC.s1, IC.s2]], [t * 0.22, t * 0.06, t * 0.28, [IC.w0, IC.w1, IC.w2]], [0, t * 0.16, t * 0.22, [IC.g0, IC.g1, IC.g2]]]) {
      T.ball(cx + dx, cy + dy - r, r, ...c, r * 1.15); T.px(cx + dx, cy + dy - r * 2.2, IC.w3); T.px(cx + dx + 1, cy + dy - r * 2.3, IC.w3);
    }
  },
  barrel(t, T, ax, ay) {
    // two barrels lying on a cradle, taps on their ends
    const cx = ax, cy = ay + t / 2;
    T.box(cx - t * 0.1, cy - t * 0.3, t * 0.45, t * 0.12, 3, IC.w2, IC.w3, IC.w3);
    for (const [dx, dy] of [[-t * 0.2, t * 0.08], [t * 0.12, -t * 0.08]]) {
      T.ball(cx + dx, cy + dy - t * 0.32, t * 0.26, IC.w1, IC.w2, IC.w3, t * 0.24);
      for (const k of [-0.15, 0.15]) T.line(cx + dx + t * k - 1, cy + dy - t * 0.55, cx + dx + t * k + 1, cy + dy - t * 0.1, IC.s3);
      T.disc(cx + dx - t * 0.2, cy + dy - t * 0.3, t * 0.12, IC.w2, t * 0.16); T.px(cx + dx - t * 0.3, cy + dy - t * 0.28, IC.y1);
    }
  },
  barrel2(t, T, ax, ay) {
    // the slack tub by the anvil: a wide half-barrel of dark water for quenching, a wisp of steam over it
    const cx = ax, cy = ay + t / 2, r = t * 0.36, h = Math.round(t * 0.38);
    T.cyl(cx, cy, r, h, IC.w0, IC.w1, IC.w2);
    for (const k of [0.25, 0.8]) T.disc(cx, cy - h * k, r + 0.5, (x) => x < cx ? IC.s2 : IC.s3, r / 2 * 0.22);
    T.disc(cx, cy - h, r * 0.86, (px, py) => pxHash(px >> 1, py) > 0.9 ? IC.b1 : IC.b3);
    for (let k = 0; k < 6; k++) T.px(cx - 3 + k + Math.round(Math.sin(k) * 2), cy - h - 4 - k * 2, IC.s0);
  },
  // ---- the forge
  furnace(t, T, ax, ay, o) {
    // a smith's hearth: a waist-high table of dressed stone with a bed of glowing coals on top, a stone hood over it and a chimney up the wall
    const a = t * 0.95, b = t * 0.95, h = Math.round(t * 0.62), x = ax, y = ay + 2, f = (o.frame || 0) % 3;
    const brick = (side) => (px, py) => { const row = Math.floor(py / 4), col = Math.floor((px + (row % 2) * 4) / 8); return (py % 4 === 0 || (px + (row % 2) * 4) % 8 === 0) ? IC.s4 : pxHash(col, row) > 0.5 ? (side ? IC.s2 : IC.s1) : (side ? IC.s3 : IC.s2); };
    const q = T.box(x, y, a, b, h, IC.s1, brick(0), brick(1));
    // the fire bed sunk into the top: coals dark at the rim, bright at the heart
    const fx = q.top[0] - b + a, fy = q.top[1] + (a + b) / 2;
    T.disc(fx, fy, a * 0.55, IC.s3, a * 0.3);
    T.disc(fx, fy, a * 0.45, (px, py) => { const n = pxHash(px >> 1, py >> 1) + Math.sin(px * 0.7 + f * 2) * 0.15; return n > 0.75 ? IC.y0 : n > 0.45 ? IC.y1 : n > 0.2 ? IC.r1 : IC.r2; }, a * 0.24);
    T.glow(fx, fy - 4, t * 1.3, IC.y1, 0.3);
    // the hood: a stone funnel gathering smoke, narrowing into the chimney
    const hy = fy - t * 0.95, hw = a * 0.75;
    T.poly([[fx - hw, hy + t * 0.25], [fx + hw, hy + t * 0.25 + hw * 0.1], [fx + hw * 0.35, hy - t * 0.15], [fx - hw * 0.35, hy - t * 0.2]], (px, py) => pxHash(px >> 2, py >> 1) > 0.6 ? IC.s1 : IC.s2);
    T.poly([[fx - hw, hy + t * 0.25], [fx + hw, hy + t * 0.25 + hw * 0.1], [fx + hw, hy + t * 0.32 + hw * 0.1], [fx - hw, hy + t * 0.32]], IC.s3);
    T.box(fx - t * 0.1, hy - t * 0.25, t * 0.22, t * 0.22, Math.round(t * 1.6), IC.s1, brick(0), brick(1));
    // sparks lifting from the coals
    for (let k = 0; k < 4; k++) T.px(fx - 5 + k * 3 + f, fy - 6 - ((k + f) % 3) * 4, k % 2 ? IC.y0 : IC.r1);
    // a poker leaning on the table
    T.line(q.Buv[0] - 3, q.Buv[1] - 1, q.Buv[0] + 4, q.Buv[1] - h - 8, IC.s3);
  },
  bellows(t, T, ax, ay) {
    // paired leather bellows on a wooden frame, their nozzle into the hearth, worked by a long lever overhead
    const cx = ax, cy = ay + t / 2;
    t *= 1.35;
    for (const [dx, dy] of [[-t * 0.3, 0], [t * 0.3, 0], [0, -t * 0.15], [0, t * 0.15]]) T.line(cx + dx, cy + dy, cx + dx, cy + dy - t * 0.35, IC.w3);
    const by = cy - t * 0.42;
    // the lower board, the leather between, the upper board (teardrop shapes pointing at the hearth)
    const drop = (oy, col) => T.poly([[cx - t * 0.62, by + oy + 2], [cx - t * 0.1, by + oy - t * 0.2], [cx + t * 0.42, by + oy - t * 0.05], [cx + t * 0.45, by + oy + t * 0.15], [cx - t * 0.05, by + oy + t * 0.25]], col);
    drop(t * 0.14, IC.w3);
    drop(t * 0.07, (px, py) => (Math.floor(px / 4) % 2) ? IC.r3 : IC.w3);
    drop(0, (px, py) => pxNoise(px * 0.1, py * 0.6) > 0.55 ? IC.w3 : IC.w2);
    T.line(cx - t * 0.62, by + 2, cx - t * 0.85, by + 5, IC.s2); T.line(cx - t * 0.62, by + 3, cx - t * 0.85, by + 6, IC.s3);
    // the lever and its chain
    T.line(cx + t * 0.3, by - t * 0.05, cx + t * 0.3, by - t * 0.75, IC.w3);
    T.line(cx - t * 0.4, by - t * 0.55, cx + t * 0.75, by - t * 0.9, IC.w2);
    for (let k = 0; k < 5; k++) T.px(cx - t * 0.1, by - t * 0.6 + k * 3, IC.s2);
  },
  anvil(t, T, ax, ay) {
    // a London-pattern anvil on an oak stump: a flat steel face, a long horn, a square heel with its hardy hole, and a hammer leaning on the stump
    const cx = ax, cy = ay + t / 2;
    T.cyl(cx, cy, t * 0.3, Math.round(t * 0.4), (px, py) => Math.hypot(px - cx, (py - (cy - t * 0.4)) * 2) % 3 < 1 ? IC.w2 : IC.w1, IC.w2, IC.w3);
    const top = cy - Math.round(t * 0.4);
    T.poly([[cx - t * 0.15, top], [cx + t * 0.15, top + t * 0.07], [cx + t * 0.1, top - t * 0.12], [cx - t * 0.1, top - t * 0.18]], IC.s4);
    T.box(cx - t * 0.2, top - t * 0.42, t * 0.42, t * 0.15, Math.round(t * 0.14), IC.s0, IC.s3, IC.s4);
    T.poly([[cx + t * 0.64, top - t * 0.42 + t * 0.21], [cx + t * 1.05, top - t * 0.3 + t * 0.21], [cx + t * 0.64, top - t * 0.26 + t * 0.21]], (px) => px < cx + t * 0.8 ? IC.s1 : IC.s2);
    T.px(cx - t * 0.1, top - t * 0.34, IC.ink); T.px(cx - t * 0.1 + 1, top - t * 0.34, IC.ink);
    T.line(cx - t * 0.62, cy, cx - t * 0.33, top - t * 0.15, IC.w2); T.box(cx - t * 0.46, top - t * 0.36, 2, 2, 3, IC.s1, IC.s2, IC.s3);
  },
  coalbin(t, T, ax, ay) {
    const cx = ax, cy = ay + t / 2, a = t * 0.4, b = t * 0.34, h = Math.round(t * 0.36);
    const q = T.box(cx, cy - a, a, b, h, IC.w2, IC.w3, IC.ink2);
    for (let k = 0; k < 14; k++) T.ball(q.top[0] - b + 2 + pxHash(k, 2) * (a + b) * 1.4, q.top[1] + 2 + pxHash(k, 5) * a * 0.9, 1.3, k % 5 ? IC.s4 : IC.r1, k % 5 ? IC.ink2 : IC.r2, IC.ink);
  },
  rack(t, T, ax, ay) {
    // a tool board on the wall: pegs, with tongs, hammers and a file hanging from them
    const a = t - 2, x = ax, y = ay + 1, lift = Math.round(t * 1.25), bh = Math.round(t * 0.75);
    const p0 = [x, y - lift], p1 = [x + 2 * a, y + a - lift];
    T.poly([[p0[0], p0[1] - bh], [p1[0], p1[1] - bh], p1, p0], (px, py) => pxNoise(px * 0.08, py * 0.5) > 0.6 ? IC.w3 : IC.w2);
    T.line(p0[0], p0[1] - bh, p1[0], p1[1] - bh, IC.w1);
    const tools = ["tongs", "hammer", "file", "hammer2", "tongs"];
    tools.forEach((kind, k) => {
      const f = (k + 0.6) / tools.length, hx = p0[0] + (p1[0] - p0[0]) * f, hy = p0[1] + (p1[1] - p0[1]) * f - bh + 3;
      T.px(hx, hy - 1, IC.s3);
      if (kind === "tongs") { T.line(hx - 1, hy, hx - 2, hy + t * 0.55, IC.s3); T.line(hx + 1, hy, hx + 2, hy + t * 0.55, IC.s2); }
      else if (kind === "file") T.line(hx, hy, hx, hy + t * 0.45, IC.s1);
      else { const len = kind === "hammer" ? t * 0.5 : t * 0.38; T.line(hx, hy, hx, hy + len, IC.w3); T.box(hx - 2, hy + len - 1, 2, 1, 3, IC.s1, IC.s2, IC.s3); }
    });
  },
  // ---- the explorers' camp
  tent(t, T, ax, ay) {
    // a canvas wall tent: four short walls and a ridged roof, the door flaps tied back, guy ropes to pegs, a stovepipe smoking
    const cv = [pxHex("#6b5e44"), pxHex("#9c8c68"), pxHex("#c8b890"), pxHex("#e2d6b4")];
    const x = ax, y = ay + t * 0.25, a = t * 0.9, b = t * 0.8, wall = Math.round(t * 0.55), roof = Math.round(t * 0.55);
    const q = T.box(x, y, a, b, wall, cv[2], (px, py) => (px % 7 === 0 ? cv[1] : cv[2]), (px, py) => (px % 7 === 0 ? cv[0] : cv[1]));
    const up = p => [p[0], p[1] - wall];
    const L = up(q.Bv), F = up(q.Buv), Rr = up(q.Bu), B = q.top;
    const r0 = [(B[0] + L[0]) / 2, (B[1] + L[1]) / 2 - roof], r1 = [(Rr[0] + F[0]) / 2, (Rr[1] + F[1]) / 2 - roof];
    T.poly([L, F, r1, r0], (px, py) => (Math.round(px + py * 2) % 9 === 0 ? cv[2] : cv[3]));
    T.poly([F, Rr, r1], cv[1]);
    T.line(r0[0], r0[1], r1[0], r1[1], cv[0]);
    // the doorway on the front wall, flaps tied back to either side
    const d0 = [q.Bv[0] + (q.Buv[0] - q.Bv[0]) * 0.38, q.Bv[1] + (q.Buv[1] - q.Bv[1]) * 0.38], d1 = [q.Bv[0] + (q.Buv[0] - q.Bv[0]) * 0.62, q.Bv[1] + (q.Buv[1] - q.Bv[1]) * 0.62];
    T.poly([d0, d1, [d1[0], d1[1] - wall - roof * 0.45], [(d0[0] + d1[0]) / 2, (d0[1] + d1[1]) / 2 - wall - roof * 0.75], [d0[0], d0[1] - wall - roof * 0.45]], IC.ink2);
    T.glow((d0[0] + d1[0]) / 2, (d0[1] + d1[1]) / 2 - wall * 0.4, t * 0.4, IC.y0, 0.45);
    for (const [d, side] of [[d0, -1], [d1, 1]]) T.poly([d, [d[0] + side * 3, d[1] + side * 1.5], [d[0] + side * 2, d[1] - wall], [d[0], d[1] - wall - 2]], cv[1]);
    // guy ropes to pegs
    for (const [p, dx, dy] of [[L, -t * 0.35, t * 0.35], [F, -t * 0.05, t * 0.5], [Rr, t * 0.35, t * 0.3]]) { T.line(p[0], p[1], p[0] + dx, p[1] + dy + wall, cv[0]); T.line(p[0] + dx, p[1] + dy + wall, p[0] + dx, p[1] + dy + wall - 2, IC.w3); }
    // the stovepipe through the roof
    const sp = [r1[0] * 0.7 + r0[0] * 0.3, r1[1] * 0.7 + r0[1] * 0.3 + 2];
    T.line(sp[0], sp[1], sp[0], sp[1] - t * 0.35, IC.s3); T.line(sp[0] + 1, sp[1], sp[0] + 1, sp[1] - t * 0.35, IC.s2);
    for (let k = 0; k < 5; k++) T.px(sp[0] + Math.round(Math.sin(k) * 2), sp[1] - t * 0.4 - k * 3, IC.s1);
  },
  campfire(t, T, ax, ay, o) {
    // a ring of stones, crossed logs, the fire, and an iron pot hanging from a tripod over it, steaming
    const cx = ax, cy = ay + t / 2, f = (o.frame || 0) % 4;
    T.glow(cx, cy - 4, t * 1.8, IC.y1, 0.32);
    for (let k = 0; k < 10; k++) { const an = k / 10 * TAU; T.ball(cx + Math.cos(an) * t * 0.36, cy + Math.sin(an) * t * 0.18, 2.2, IC.s1, IC.s2, IC.s3); }
    T.box(cx - t * 0.3, cy - 2, t * 0.3, 1, 2, IC.w1, IC.w2, IC.w3); T.box(cx + t * 0.05, cy - 4, 1, t * 0.3, 2, IC.w1, IC.w2, IC.w3);
    const tall = t * 0.5;
    for (const [dx, k0, w] of [[0, 1, 3], [-3, 0.7, 2], [3, 0.8, 2]]) {
      const hh = Math.round(tall * k0 * (f % 2 ? 1 : 0.88));
      for (let k = 0; k < hh; k++) { const sway = Math.round(Math.sin((k + f * 2) * 0.6) * (k / hh) * 1.5), ww = Math.max(1, Math.round(w * (1 - k / hh))); for (let j = -ww + 1; j < ww; j++) T.px(cx + dx + sway + j, cy - 2 - k, k < hh * 0.35 ? IC.y0 : k < hh * 0.7 ? IC.y1 : IC.r1); }
    }
    // the tripod and the pot
    const top = [cx, cy - t * 1.05];
    for (const [dx, dy] of [[-t * 0.42, t * 0.05], [t * 0.4, t * 0.1], [t * 0.05, -t * 0.22]]) T.line(top[0], top[1], cx + dx, cy + dy, IC.w3);
    T.line(top[0], top[1], top[0], top[1] + t * 0.35, IC.s3);
    T.ball(cx, top[1] + t * 0.5, t * 0.17, IC.s2, IC.s3, IC.s4, t * 0.14); T.line(cx - t * 0.17, top[1] + t * 0.4, cx + t * 0.17, top[1] + t * 0.4, IC.s4);
    for (let k = 0; k < 4; k++) T.px(cx - 2 + k + ((k + f) % 2), top[1] + t * 0.3 - k * 3, IC.s0);
  },
  logs(t, T, ax, ay) {
    // two logs to sit on, cut ends showing their rings
    const x = ax, y = ay + t * 0.2;
    for (const [dx, dy] of [[0, 0], [-t * 0.5, t * 0.32]]) {
      T.box(x + dx, y + dy, t * 0.88, t * 0.2, Math.round(t * 0.36), IC.w1, IC.w2, IC.w3);
      const ex = x + dx + t * 1.76 - t * 0.4, ey = y + dy + t * 0.88 + t * 0.2 - t * 0.2;
      T.ball(ex, ey - t * 0.12, t * 0.2, IC.w0, IC.w0, IC.w1); T.px(ex, ey - t * 0.12, IC.w2); T.px(ex + 2, ey - t * 0.12, IC.w2);
    }
  },
  packs(t, T, ax, ay) {
    // two backpacks, a bedroll and a rolled-up map
    const cx = ax, cy = ay + t / 2;
    T.box(cx - t * 0.3, cy - t * 0.5, t * 0.22, t * 0.18, Math.round(t * 0.5), IC.g1, IC.g2, IC.g3); T.ball(cx - t * 0.3, cy - t * 0.5 - t * 0.45, t * 0.16, IC.g0, IC.g1, IC.g2, t * 0.1);
    T.box(cx + t * 0.15, cy - t * 0.35, t * 0.2, t * 0.16, Math.round(t * 0.42), IC.r1, IC.r2, IC.r3);
    T.cyl(cx, cy + t * 0.1, t * 0.12, 2, IC.y0, IC.w0, IC.w1); T.line(cx - t * 0.4, cy + t * 0.2, cx + t * 0.3, cy + t * 0.05, IC.b2);
  },
  camplamp(t, T, ax, ay) { ISO_ART.lamppost(t, T, ax, ay); },
  maptable(t, T, ax, ay) {
    // a folding camp table with a map spread out, a brass compass and a candle stub
    const cx = ax, cy = ay + t / 2, h = Math.round(t * 0.5);
    for (const [dx, dy] of [[-t * 0.3, -t * 0.05], [t * 0.3, -t * 0.05]]) { T.line(cx + dx - 3, cy + dy, cx + dx + 3, cy + dy - h, IC.w3); T.line(cx + dx + 3, cy + dy, cx + dx - 3, cy + dy - h, IC.w2); }
    T.box(cx - 1, cy - h - t * 0.32, t * 0.36, t * 0.3, 2, IC.w1, IC.w2, IC.w3);
    T.poly([[cx - t * 0.55, cy - h - t * 0.05], [cx, cy - h + t * 0.2], [cx + t * 0.55, cy - h - t * 0.05], [cx, cy - h - t * 0.3]], (px, py) => pxHash(px >> 1, py) > 0.9 ? IC.w2 : IC.w0);
    T.line(cx - t * 0.3, cy - h - t * 0.05, cx + t * 0.2, cy - h - t * 0.12, IC.r1); T.px(cx + t * 0.2, cy - h - t * 0.12, IC.r2);
    T.disc(cx - t * 0.2, cy - h - t * 0.12, 2.5, IC.y1, 1.6); T.px(cx - t * 0.2, cy - h - t * 0.13, IC.r2);
    T.line(cx + t * 0.35, cy - h - t * 0.05, cx + t * 0.35, cy - h - t * 0.2, IC.white); T.px(cx + t * 0.35, cy - h - t * 0.22, IC.y0);
  },
  // ---- the lab
  labdesk(t, T, ax, ay) {
    // an alchemist's bench: a little brick athanor at one end, an alembic dripping into a receiver, a retort, candles and an open book
    const a = t - 2, b = t * 0.42, h = Math.round(t * 0.72), x = ax, y = ay + 1;
    const q = T.box(x, y, a, b, h, IC.w1, IC.w2, IC.w3);
    for (const f of [0.08, 0.92]) { const lx = q.Bv[0] + (q.Buv[0] - q.Bv[0]) * f, ly = q.Bv[1] + (q.Buv[1] - q.Bv[1]) * f; T.line(lx, ly, lx, ly - h * 0.8, IC.w3); }
    const on = f => [x - b + a * f * 2, y + b / 2 + a * f - h];
    // the athanor: a brick tower with a fire showing through its little door, a dome on top
    { const [fx, fy] = on(0.14); T.box(fx - t * 0.12, fy - t * 0.2, t * 0.16, t * 0.16, Math.round(t * 0.55), IC.s1, (px, py) => (py % 3 === 0 || (px + Math.floor(py / 3) * 2) % 5 === 0) ? IC.s3 : IC.s2, IC.s3);
      T.ball(fx, fy - t * 0.62, t * 0.17, IC.s1, IC.s2, IC.s3, t * 0.12); T.poly([[fx - 3, fy - 2], [fx + 1, fy], [fx + 1, fy - 5], [fx - 3, fy - 7]], IC.r1); T.px(fx - 1, fy - 3, IC.y0); T.glow(fx - 1, fy - 3, t * 0.4, IC.y1, 0.35); }
    // the alembic: a round flask over a small flame, a head with a long beak running down to a receiving flask
    { const [ax2, ay2] = on(0.45), [rx, ry] = on(0.7);
      T.disc(ax2, ay2, 2.5, IC.s3, 1.5); T.px(ax2, ay2 - 2, IC.y1); T.px(ax2, ay2 - 3, IC.y0);
      T.ball(ax2, ay2 - t * 0.25, t * 0.16, IC.white, IC.b0, IC.b1); T.disc(ax2, ay2 - t * 0.2, t * 0.12, IC.g0, t * 0.06);
      T.ball(ax2, ay2 - t * 0.48, t * 0.1, IC.white, IC.b0, IC.b1, t * 0.08);
      T.line(ax2 + t * 0.08, ay2 - t * 0.5, rx - 1, ry - t * 0.3, IC.b1); T.line(ax2 + t * 0.08, ay2 - t * 0.49, rx - 1, ry - t * 0.29, IC.b0);
      T.ball(rx, ry - t * 0.14, t * 0.12, IC.white, IC.p0, IC.p1); T.px(rx, ry - t * 0.3, IC.b1); }
    // a retort lying on its stand, neck sloping down
    { const [tx, ty] = on(0.92); T.ball(tx, ty - t * 0.16, t * 0.13, IC.white, IC.g0, IC.g1); T.line(tx + t * 0.1, ty - t * 0.22, tx + t * 0.42, ty - t * 0.08, IC.b0); T.line(tx - t * 0.08, ty, tx + t * 0.08, ty, IC.s3); }
    // an open book and two candles
    { const [bx, by] = on(1.12); T.poly([[bx - 6, by - 1], [bx, by + 2], [bx, by - 2], [bx - 6, by - 5]], IC.s0); T.poly([[bx, by + 2], [bx + 6, by - 1], [bx + 6, by - 5], [bx, by - 2]], IC.white);
      for (let k = 0; k < 3; k++) { T.line(bx - 5, by - 3 + k * 0.8, bx - 1, by - 1 + k * 0.8, IC.s2); T.line(bx + 1, by - 1 + k * 0.8, bx + 5, by - 3 + k * 0.8, IC.s2); }
      for (const dx of [-9, 9]) { T.line(bx + dx, by, bx + dx, by - 6, IC.white); T.px(bx + dx, by - 7, IC.y0); T.glow(bx + dx, by - 7, 4, IC.y0, 0.4); } }
  },
  jars(t, T, ax, ay) {
    // a tall bookcase: rows of old books with coloured spines, specimen jars and a skull on the top shelf
    const a = t * 0.34, b = t - 2, h = Math.round(t * 1.9), x = ax, y = ay + 1;
    const q = T.box(x, y, a, b, h, IC.w2, IC.w2, IC.w3);
    const [f0, f1] = [q.Buv, q.Bu], at = (f, up) => [f0[0] + (f1[0] - f0[0]) * f, f0[1] + (f1[1] - f0[1]) * f - up];
    T.poly([at(0.05, h * 0.05), at(0.95, h * 0.05), at(0.95, h * 0.95), at(0.05, h * 0.95)], IC.w3);
    const rows = 5, rowH = h * 0.9 / rows, spines = [IC.r2, IC.b2, IC.g2, IC.p2, IC.w1, IC.l3, IC.r1, IC.s2];
    for (let r = 0; r < rows; r++) {
      const lift = h * 0.05 + r * rowH;
      for (let k = 0; k <= 30; k++) { const [px, py] = at(k / 30, lift); T.px(px, py, IC.w1); }
      if (r === rows - 1) {
        // the top shelf: jars of strange things, and a skull
        for (const [f, c] of [[0.2, IC.g0], [0.45, IC.p0], [0.85, IC.b0]]) { const [px, py] = at(f, lift + 1); T.cyl(px, py, 2.2, Math.round(rowH * 0.55), IC.white, c, c); }
        const [sx, sy] = at(0.65, lift + 1); T.ball(sx, sy - 3, 3, IC.s0, IC.s0, IC.s1); T.px(sx - 1, sy - 3, IC.ink); T.px(sx + 1, sy - 3, IC.ink);
        continue;
      }
      let f = 0.07;
      while (f < 0.9) { const w = 0.05 + pxHash(Math.round(f * 100), r) * 0.04, tall = rowH * (0.6 + pxHash(r, Math.round(f * 100)) * 0.3), c = spines[Math.floor(pxHash(Math.round(f * 50), r + 3) * spines.length)];
        const p0 = at(f, lift + 1), p1 = at(f + w, lift + 1); T.poly([p0, p1, [p1[0], p1[1] - tall], [p0[0], p0[1] - tall]], c); T.line(p0[0], p0[1] - tall * 0.7, p1[0], p1[1] - tall * 0.7, IC.y1); f += w + 0.008; }
    }
  },
  scope(t, T, ax, ay) { ISO_ART.telescope(t, T, ax, ay); },
  books(t, T, ax, ay) {
    // piles of fat old books
    const cx = ax, cy = ay + t / 2, cols = [[IC.r1, IC.r2], [IC.b1, IC.b2], [IC.g1, IC.g2], [IC.y1, IC.w2], [IC.l2, IC.l4]];
    for (let k = 0; k < 7; k++) { const [c1, c2] = cols[k % 5], dx = (pxHash(k, 1) - 0.5) * 3; T.box(cx - t * 0.25 + dx, cy - t * 0.35 - k * 3, t * 0.32, t * 0.2, 3, IC.s0, c1, c2); }
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
  bed(t, T, ax, ay, o = {}) {
    if (o.style && o.style !== "nest" && BED_ART[o.style]) return BED_ART[o.style](t, T, ax, ay, o);
    // a big round, puffy nest-bed over two tiles each way, all fabric: an oval base, a plump rim of cushions all round
    // (like a doughnut), a soft white middle with pillows, and a striped pink quilt tucked in at the front
    const cx = ax, cy = ay + t, rx = t * 1.75, ry = rx / 2, lift = Math.max(3, Math.round(t * 0.14));
    // a cushion with its seam: the ball, then a darker line round its shaded lower edge (so each cushion stands apart)
    const cushion = (x, y, r, ry2, cols, seam) => {
      T.ball(x, y, r, ...cols, ry2);
      for (let py = Math.floor(y - ry2); py <= Math.ceil(y + ry2); py++) for (let qx = Math.floor(x - r); qx <= Math.ceil(x + r); qx++) {
        const dx = (qx + 0.5 - x) / r, dy = (py + 0.5 - y) / ry2, d = dx * dx + dy * dy;
        if (d <= 1 && d > 0.72 && dx * 0.6 + dy * 0.8 > 0.15) T.px(qx, py, seam);
      }
    };
    T.cyl(cx, cy, rx, lift, IC.l2, IC.l3, IC.l4);
    // piping round the base's top edge
    for (let k = 0; k < 120; k++) { const an = k / 120 * TAU; if (Math.sin(an) > -0.2) T.px(cx + Math.cos(an) * rx, cy - lift + Math.sin(an) * ry, IC.l1); }
    T.disc(cx, cy - lift, rx * 0.8, (x, y) => (Math.hypot((x - cx) / (rx * 0.8), (y - cy + lift) / (ry * 0.8)) > 0.8 ? IC.s1 : IC.s0));
    const rim = (front) => {
      const n = 16, r = Math.max(2.5, t * 0.3);
      for (let k = 0; k < n; k++) {
        const an = k / n * TAU, sy = Math.sin(an);
        if ((sy > 0.15) !== front) continue;
        cushion(cx + Math.cos(an) * rx * 0.86, cy - lift + sy * ry * 0.86 - r * 0.4, r, r * 0.82, [IC.l0, IC.l1, IC.l2], IC.l3);
      }
    };
    rim(false);
    for (const [dx, dy] of [[-0.45, -0.32], [0.05, -0.42], [0.5, -0.26]]) cushion(cx + dx * rx, cy - lift + dy * ry, t * 0.26, t * 0.17, [IC.white, IC.s0, IC.s1], IC.s2);
    // the quilt over the front half: soft stripes, a darker hem round it and little stitches down each stripe
    const qx = cx + rx * 0.08, qy = cy - lift + ry * 0.28, qr = rx * 0.62, qry = ry * 0.5, sw = Math.max(2, t * 0.22);
    T.disc(qx, qy, qr, (x, y) => {
      const d = Math.hypot((x - qx) / qr, (y - qy) / qry);
      if (d > 0.9) return IC.p2;
      const st = Math.floor((x - cx) / sw), edge = Math.abs(((x - cx) / sw) - Math.round((x - cx) / sw)) < 0.5 / sw;
      return edge && Math.round(y) % 2 ? IC.p2 : st % 2 ? IC.p1 : IC.p0;
    }, qry);
    rim(true);
  },
};

// ---------- beds to suit the room: the nest-bed, a pile of leaves outside, a hammock, a basket, a canopy bed ----------

const BEDS = [
  { id: "nest", name: "Nest-bed", note: "round and puffy, room for everyone" },
  { id: "gazebo", name: "Garden gazebo", note: "a little roof, fairy lights and lots of cushions" },
  { id: "hammock", name: "Hammock", note: "sways a little when someone climbs in" },
  { id: "basket", name: "Basket", note: "woven, with a soft cushion inside" },
  { id: "canopy", name: "Canopy bed", note: "posts, a drape, very grand" },
];
const BED_FOR_ROOM = { nest: "nest", yard: "gazebo", play: "hammock", garden: "basket", study: "canopy", lab: "canopy" };
/** The bed in the room you're in: the one you picked for it, or the one that suits its kind. */
const bedStyle = (i = save.room) => { const b = (save.rooms && save.rooms[i] && (save.rooms[i].bed || BED_FOR_ROOM[save.rooms[i].kind])) || "nest"; return b === "leaves" ? "gazebo" : b; };
const GAZEBO_A = 0.88; // how far the gazebo's posts stand from its middle, in tiles
const BED_ART = {
  gazebo(t, T, ax, ay, o = {}) {
    // a wooden deck over the two tiles, four white posts, a peaked red roof with fairy lights round the eaves, cushions inside.
    // In the room it's drawn in two parts (o.part): "base" goes under the sleepers, "roof" (the front post and the roof) over them
    const base = !o.part || o.part === "base", front = !o.part || o.part === "post", roof = !o.part || o.part === "roof";
    const a = GAZEBO_A * t, x = ax, y = ay + t - a, dh = Math.max(2, Math.round(t * 0.14)), ph = Math.round(t * 1.3);
    if (base) T.box(x, y, a, a, dh, IC.w1, IC.w2, IC.w3);
    const top = y - dh, c = [[x, top], [x + 2 * a, top + a], [x - 2 * a, top + a], [x, top + 2 * a]], mid = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
    // planks
    if (base) for (const u of [0.2, 0.4, 0.6, 0.8]) { const [x0, y0] = mid(c[0], c[2], u), [x1, y1] = mid(c[1], c[3], u); T.line(x0, y0, x1, y1, IC.w0); }
    const post = ([px, py]) => { for (let k = 0; k < ph; k++) { T.px(px - 2, py - k, IC.white); T.px(px - 1, py - k, IC.white); T.px(px, py - k, IC.s0); T.px(px + 1, py - k, IC.s1); T.px(px + 2, py - k, IC.s2); } };
    const cy = top + a;
    if (base) post(c[0]), post(c[1]), post(c[2]);
    // cushions heaped along the back, a small one at the front
    if (base) for (const [dx, dy, r, cols] of [[0, -0.45, 0.5, [IC.p0, IC.p1, IC.p2]], [-0.9, -0.05, 0.44, [IC.l0, IC.l2, IC.l3]], [0.9, -0.05, 0.44, [IC.b0, IC.b1, IC.b2]], [-0.3, 0.1, 0.36, [IC.white, IC.s0, IC.s1]], [0.45, 0.35, 0.32, [IC.y0, IC.y1, IC.w1]]])
      T.ball(x + dx * a, cy + dy * a - t * 0.12, t * r, ...cols, t * r * 0.72);
    if (front) post(c[3]);
    if (!roof) return;
    // the roof: the eaves stick out past the posts, the peak stands high above the middle
    const ex = ([px, py]) => [x + (px - x) * 1.1, cy - ph + (py - cy) * 1.1], e = c.map(ex), apex = [x, cy - ph - t * 1.25];
    T.poly([e[2], e[3], apex], IC.r1);
    T.poly([e[1], e[3], apex], IC.r2);
    for (const u of [0.3, 0.55, 0.8]) { T.line(...mid(apex, e[2], u), ...mid(apex, e[3], u), IC.r2); T.line(...mid(apex, e[3], u), ...mid(apex, e[1], u), IC.r3); }
    T.line(...apex, ...e[3], IC.y1);
    for (const [p, q] of [[e[2], e[3]], [e[3], e[1]]]) { T.line(p[0], p[1], q[0], q[1], IC.white); T.line(p[0], p[1] + 1, q[0], q[1] + 1, IC.s1); }
    // fairy lights hanging in little loops under the eaves
    for (const [p, q] of [[e[2], e[3]], [e[3], e[1]]]) for (let k = 1; k < 9; k++) { const [lx, ly] = mid(p, q, k / 9), sag = 2 + Math.round(Math.sin((k % 3) / 3 * Math.PI) * 2); T.px(lx, ly + sag, k % 3 ? IC.y0 : IC.p0); T.px(lx + 1, ly + sag, k % 3 ? IC.y1 : IC.p1); T.px(lx, ly + sag + 1, k % 3 ? IC.y1 : IC.p1); }
    T.ball(apex[0], apex[1] - 2, 2, IC.y0, IC.y1, IC.w1);
  },
  hammock(t, T, ax, ay) {
    // two wooden posts, ropes, and a striped hammock sagging between them
    const cx = ax, cy = ay + t, x0 = cx - t * 1.45, x1 = cx + t * 1.45, top = cy - t * 1.15;
    const post = x => { for (let y = Math.round(top - 2); y <= cy + 1; y++) { T.px(x - 1, y, IC.w1); T.px(x, y, IC.w2); T.px(x + 1, y, IC.w3); } T.ball(x, top - 3, 2, IC.w0, IC.w1, IC.w2); };
    post(x0); post(x1);
    const sag = x => { const u = (x - x0) / (x1 - x0); return top + 4 + Math.sin(u * Math.PI) * t * 0.7; };
    for (let x = Math.round(x0 + 2); x <= Math.round(x1 - 2); x++) {
      const y = Math.round(sag(x)), w = Math.max(3, Math.round(t * 0.22 * Math.sin((x - x0) / (x1 - x0) * Math.PI) + 2));
      for (let k = 0; k < w; k++) T.px(x, y + k, k === w - 1 ? IC.b3 : Math.floor((x - x0) / 4) % 2 ? IC.b1 : IC.white);
    }
    for (const [px0, ex] of [[x0, x0 + 5], [x1, x1 - 5]]) T.line(px0, top, ex, sag(ex), IC.y1);
  },
  basket(t, T, ax, ay) {
    // a woven basket, a cushion inside, a little blanket over its edge
    const cx = ax, cy = ay + t, rx = t * 1.35, h = Math.round(t * 0.5);
    for (let k = 0; k <= h; k++) T.disc(cx, cy - k, rx, (x) => (Math.floor(x / 2) + k) % 2 ? IC.w1 : IC.w2);
    T.disc(cx, cy - h, rx * 0.86, IC.w3);
    T.disc(cx, cy - h - 1, rx * 0.8, (x, y) => Math.hypot((x - cx) / (rx * 0.8), (y - cy + h + 1) / (rx * 0.4)) > 0.75 ? IC.p1 : IC.p0);
    for (let k = 0; k < 90; k++) { const an = k / 90 * TAU; if (Math.sin(an) > -0.2) T.px(cx + Math.cos(an) * rx, cy - h + Math.sin(an) * rx / 2, IC.w0); }
    T.poly([[cx + rx * 0.2, cy - h], [cx + rx * 0.75, cy - h + 2], [cx + rx * 0.8, cy - h * 0.2], [cx + rx * 0.3, cy - h * 0.1]], IC.l2);
  },
  canopy(t, T, ax, ay) {
    // a grand bed: a wooden frame, a white mattress, a purple quilt, four posts and a pink drape across the top
    const cx = ax, a = t * 0.82, b = t * 0.82, x = cx, y = ay + t - b, h = Math.round(t * 0.32);
    T.box(x, y, a, b, h, IC.white, IC.w2, IC.w3);
    const top = y - h;
    T.poly([[x - 2 * b * 0.1, top + b * 0.1 + 2 * a * 0.45 * 0.5], [x + 2 * a - 2 * b * 0.1, top + a + b * 0.1], [x + 2 * a - 2 * b, top + a + b], [x - 2 * b, top + b + a * 0.45]], IC.l3);
    T.ball(x + a * 0.2 - b * 0.4, top + b * 0.6, t * 0.22, IC.white, IC.s0, IC.s1, t * 0.14);
    const corners = [[x, y], [x + 2 * a, y + a], [x - 2 * b, y + b], [x + 2 * a - 2 * b, y + a + b]], ph = Math.round(t * 1.5);
    for (const [px, py] of corners) for (let k = 0; k < ph; k++) { T.px(px, py - k, IC.w2); T.px(px + 1, py - k, IC.w3); }
    const up = ([px, py]) => [px, py - ph];
    for (const [p0, p1] of [[corners[0], corners[1]], [corners[0], corners[2]], [corners[1], corners[3]], [corners[2], corners[3]]]) {
      const [x0, y0] = up(p0), [x1, y1] = up(p1);
      for (let k = 0; k <= 20; k++) { const u = k / 20, sx = x0 + (x1 - x0) * u, sy = y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * 3; T.px(sx, sy, IC.p1); T.px(sx, sy + 1, IC.p2); }
    }
  },
};

/** A small picture of a bed, for choosing one. */
const bedThumbs = {};
function bedThumb(id) {
  if (bedThumbs[id]) return bedThumbs[id];
  const t = 14, c = isoArt(t * 4 + 8, Math.round(t * 3.6 + 8), T => ISO_ART.bed(t, T, t * 2 + 4, 4 + t * 1.4, { style: id }));
  return bedThumbs[id] = c.toDataURL();
}
/** The baked picture of one placed piece, in CSS pixels ready for drawBaked. */
function isoPiece(p, extra = {}) {
  const tw = N.isoW / ISO_G / PX, pad = Math.ceil(tw * 1.2) + 3, base = pieceDims(p.id, false);
  const w = Math.ceil((base.fw + base.fd) * tw + pad * 2), h = (base.fw + base.fd) * tw / 2 + tw * 2 + pad;
  const ax0 = base.fd * tw + pad, ay = tw * 2 + pad / 2;
  // (where it stands on screen is part of the key: a resized window can move the room without changing its size)
  const [bx, by] = isoAt(p.i / ISO_G, p.j / ISO_G);
  const key = `${p.id}|${p.i},${p.j}|${p.flip}|${tw.toFixed(2)}|${Math.round(bx)},${Math.round(by)}|${JSON.stringify(extra)}`;
  return cachedSprite(isoPieces, p.id + (extra.part || ""), key, () => {
    let c = isoArt(w, h, T => ISO_ART[p.id](tw, T, ax0, ay, extra)), ax = ax0;
    if (p.flip) {
      // turned to face the other wall: a mirror image (the back corner stays the back corner)
      const m = document.createElement("canvas"); m.width = c.width; m.height = c.height;
      const g = m.getContext("2d"); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0);
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
  if (i < 0 || j < 0 || i + d.fw > ISO_G || j + d.fd > ISO_G) return false;
  for (const p of Object.values(isoLayout().placed)) {
    if (p.id === id) continue;
    if (i < p.i + p.fw && p.i < i + d.fw && j < p.j + p.fd && p.j < j + d.fd) return false;
  }
  return true;
}
/** Is this wall slot clear of the other wall piece? */
const wallFree = (id, wall, s) => Object.keys(WALL_ITEMS).every(o => o === id || !hasDecor(o) || wallSlot(o).wall !== wall || Math.abs(wallSlot(o).s - s) >= 1.6);
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
    arrange.drag = { id, wall, s, ok: wallFree(id, wall, s) };
  } else if (kind === "rug") {
    const m = 0.26, [u, v] = isoFrom(x - arrange.grab[0], y - arrange.grab[1]);
    arrange.drag = { id, u: clamp(u, m, 1 - m), v: clamp(v, m, 1 - m), ok: true };
  } else {
    const p = isoLayout().placed[id];
    if (!p) return;
    const [u, v] = isoFrom(x, y), i = Math.round(u * ISO_G - arrange.grab[0]), j = Math.round(v * ISO_G - arrange.grab[1]), flip = autoFlip(id, i, j, p.flip);
    arrange.drag = { id, i, j, flip, ok: pieceFits(id, i, j, flip) };
  }
}
function arrangeUp() {
  const d = arrange.drag;
  if (d && d.ok) {
    if (d.wall) setLayout(d.id, { wall: d.wall, s: d.s });
    else if (d.id === "rug") setLayout("rug", { u: d.u, v: d.v });
    else { const p = isoLayout().placed[d.id]; if (p && (d.i !== p.i || d.j !== p.j || d.flip !== p.flip)) placePiece(d.id, d.i, d.j, d.flip); }
  } else if (d) toast(tr("That spot is taken"));
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
  return U > p.i + 0.15 && U < p.i + p.fw - 0.05 && V > p.j + 0.05 && V < p.j + p.fd - 0.15;
}
const isoBedTop = () => N.isoW / ISO_G * (bedStyle() === "gazebo" ? 0.14 : 0.22);
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


/** The isometric room in art pixels: a diamond floor on a thick slab, and (indoors) a lit left wall and a shaded right one.
 *  Caves get rock, crystals and a hole onto the night; the abbey brick, tiles and an arched window;
 *  the churchyard a lawn edged with old stones; the wood moss edged with fallen logs. */
function paintRoomIso(id) {
  const kind = ROOM_KIND[id] || "cave", t = THEME[id] || THEME.amethyst;
  const art = t.art !== undefined ? CHAPTER_ART[t.art] : null, night = NIGHT[id];
  const wallR = (art ? art.wall : night.ground).map(pxHex), crys = art ? art.crystal.map(pxHex) : null, ground = night ? night.ground.map(pxHex) : wallR;
  const w = Math.ceil(W / PX), h = Math.ceil(H / PX), c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data;
  const q = v => v / PX, cx = q(N.cx), top = q(N.isoTop), hw = q(N.isoW), hh = hw / 2, wall = q(N.isoWall), slab = Math.max(4, Math.round(hw / 16));
  const seed = (art ? art.seed : night.seed) * 7, indoor = kind === "cave" || kind === "hall" || kind === "ruin" || kind === "timber";
  const put = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
  const ink = pxHex("#0b0614"), at = (u, v) => [cx + (u - v) * hw, top + (u + v) * hh];
  // the ruins are old grey stone whatever the night outside; moss and grass grow in every gap
  const ruinStone = [pxHex("#22143a"), pxHex("#3a3440"), pxHex("#5d5666"), pxHex("#8a8494"), pxHex("#b9b3c0")], moss = [pxHex("#1e5233"), pxHex("#2f7d4a"), pxHex("#57ad6a")];
  const wallC = kind === "ruin" || kind === "timber" ? ruinStone : wallR;
  // the timber hall: oak for the frame and the floor, limewashed daub between the beams (smoke-stained higher up)
  const oak = [pxHex("#1f130a"), pxHex("#3b2414"), pxHex("#5e3a1c"), pxHex("#7a5230"), pxHex("#946027")], daub = [pxHex("#5d5446"), pxHex("#8a8070"), pxHex("#b8ad94"), pxHex("#d9cfb8"), pxHex("#ece4cf")];
  // how high a ruined wall still stands along its length (0..1): broken off in steps, low in the middle of each side
  const ruinH = tt => kind !== "ruin" ? 1 : clamp(0.55 + 0.45 * Math.cos(tt * 2.6) - 0.35 * (Math.floor(pxNoise(tt * 7 + seed, 3) * 4) / 4), 0.18, 1);
  const wood = [pxHex("#3b2414"), pxHex("#5e3a1c"), pxHex("#946027")], stone = [pxHex("#22143a"), pxHex("#3a3440"), pxHex("#5d5666"), pxHex("#8a8494")];

  // the slab under the floor: its two front faces, the left one lit, the right one in shade (outdoors the room is part of the land: no slab)
  if (indoor) for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
    const edgeY = top + hh + (hh - Math.abs(x - cx) * hh / hw) * 1, left = x < cx;
    for (let k = 0; k < slab; k++) {
      const y = edgeY + k, col = indoor ? pxPick(wallC, (left ? 0.45 : 0.22) - k * 0.03 + pxFbm(x * 0.2, y * 0.2) * 0.15, x, y)
        : k < 2 ? pxPick(ground, left ? 0.6 : 0.4, x, y) : pxPick([pxHex("#3b2414"), pxHex("#5e3a1c"), pxHex("#946027")], (left ? 0.6 : 0.3) - k * 0.04 + pxFbm(x * 0.3, y * 0.3) * 0.25, x, y);
      put(x, y, k === slab - 1 ? ink : col);
    }
  }
  // the floor
  for (let y = Math.floor(top); y <= Math.ceil(top + hw); y++) for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
    const a = (x - cx) / hw, b = (y - top) / hh, u = (a + b) / 2, v = (b - a) / 2;
    if (u < 0 || v < 0 || u > 1 || v > 1) continue;
    const near = Math.min(u, v), lightK = Math.exp(-(((u - 0.35) / 0.5) ** 2) - (((v - 0.5) / 0.6) ** 2));
    let val, col = null;
    if (kind === "timber") {
      // wide planks running toward the front, each its own shade, grain along it, dark seams, nail heads, soot by the hearth
      const n = 9, fu = u * n, plank = Math.floor(fu), along = v * hw;
      let pv = 0.42 + 0.18 * (pxHash(plank, 7) - 0.5) + 0.22 * lightK + 0.16 * (pxNoise(fu * 2 + plank * 5, along * 0.09) - 0.5);
      if (Math.abs(pxNoise(plank * 3.1, along * 0.04) - 0.5) < 0.04) pv -= 0.14;
      const end = Math.floor((along + pxHash(plank, 3) * 40) / 45);
      if (Math.abs(fu - Math.round(fu)) * hw / n < 0.6 || Math.abs(along + pxHash(plank, 3) * 40 - end * 45) < 0.6) pv = 0.05;
      else if (pxHash(Math.floor(fu * 3), Math.floor(along / 3)) > 0.985) pv = 0.85;
      pv -= 0.25 * Math.exp(-(((u - 0.3) / 0.22) ** 2) - (((v - 0.12) / 0.2) ** 2)) * pxFbm(x * 0.2, y * 0.2);
      if (near * hw < 2.5) pv -= 0.3;
      put(x, y, pxPick(oak, pv, x, y));
      continue;
    }
    if (indoor) {
      val = 0.5 + 0.15 * pxFbm(x * 0.12 + seed, y * 0.2) + 0.25 * lightK;
      const n = kind === "hall" ? 7 : 5, fu = u * n, fv = v * n;
      const joint = Math.abs(fu - Math.round(fu)) * hw / n < 0.6 || Math.abs(fv - Math.round(fv)) * hw / n < 0.6;
      if (kind === "hall") val += (Math.floor(fu) + Math.floor(fv)) % 2 ? 0.1 : -0.08;
      if (kind === "cave") {
        // a cave floor is the rock itself: uneven, with cracks, pebbles and a few crystals, no slabs
        val += 0.12 * pxFbm(x * 0.05 + seed, y * 0.09) - 0.06;
        if (Math.abs(pxNoise(x * 0.07 + seed, y * 0.13) - 0.5) < 0.018) val -= 0.25;
        if (pxHash(x + 11, y + seed) > 0.985) val += 0.22;
      } else if (joint && (kind === "hall" || pxHash(x >> 2, y >> 1) > 0.25)) val -= 0.2;
      if (kind === "ruin") { val += 0.12 * (pxHash(Math.floor(fu), Math.floor(fv) + seed) - 0.5); if (joint && pxHash(x, y + seed) > 0.35) col = moss[pxHash(x + 1, y) > 0.6 ? 2 : 1]; else if (pxHash(Math.floor(fu) * 3, Math.floor(fv) + seed) > 0.86 && pxFbm(x * 0.3, y * 0.3) > 0.55) col = moss[0]; }
      if (near * hw < 2.5) val -= 0.3; // shadow at the foot of the walls
      if (kind === "cave" && pxHash(x, y + seed) > 0.9975) col = crys[2];
      put(x, y, col || pxPick(wallC, val, x, y));
    } else {
      val = 0.5 + 0.25 * pxFbm(x * 0.14 + seed, y * 0.25) + 0.2 * lightK - 0.2 * Math.max(0, Math.max(u, v) - 0.85) * 5;
      if (pxHash(x, y + seed) > 0.965) val += 0.3;
      if (kind === "wood") {
        if (pxHash(x + 7, y + seed) > 0.988) col = pxHex(pxHash(x, y) > 0.5 ? "#c98f3a" : "#946027");
        else if (pxHash(x + 3, y + seed * 2) > 0.995) col = pxHex("#8ff0d8");
      }
      // blades of grass in little tufts (a light tip over a dark root), clover, pebbles
      const tuft = pxNoise(x * 0.09 + seed, y * 0.18) > 0.58;
      if (!col && tuft && pxHash(x, y + 3) > 0.7) col = pxPick(ground, pxHash(x, y + 1) > 0.5 ? 0.85 : 0.2, x, y);
      else if (!col && pxHash(x >> 1, (y >> 1) + seed) > 0.992) col = pxHex(pxHash(x, y) > 0.5 ? "#8a8494" : "#b9b3c0");
      else if (!col && kind !== "wood" && pxHash((x >> 1) + 7, y >> 1) > 0.994) col = pxHex("#fff0b5");
      if (Math.max(u, v) > 0.985) col = pxPick(ground, 0.85, x, y); // a lit rim at the front edges
      put(x, y, col || pxPick(ground, val, x, y));
    }
  }
  if (indoor) {
    // the two walls: left (along v) catches the light, right (along u) is in shade; they meet at the back corner
    for (const side of [-1, 1]) for (let x = Math.floor(side < 0 ? cx - hw : cx); x <= Math.ceil(side < 0 ? cx : cx + hw); x++) {
      const tt = Math.abs(x - cx) / hw, base = top + tt * hh;
      // a cave's rock rises higher toward the back and juts up and down along its top
      const yTop = base - wall * ruinH(tt) - (kind === "cave" ? wall * (0.22 * (1 - tt) + 0.16 * pxNoise(x * 0.05, seed)) + 4 * pxNoise(x * 0.3, seed + 4) - 2 : 0);
      for (let y = Math.floor(yTop); y < base; y++) {
        const hgt = (base - y) / wall;
        let val;
        if (kind === "cave") {
          val = (side < 0 ? 0.42 : 0.24) + 0.24 * pxFbm(x * 0.09 + seed, y * 0.09) - 0.15 * hgt;
          if (Math.abs(pxNoise(x * 0.18 + seed, y * 0.18) - 0.5) < 0.025) val -= 0.25;
        } else if (kind === "timber") {
          // a stone footing, then oak posts, a mid rail and braces with limewashed daub between, sooty near the top
          const along = tt * hw, hh2 = base - y, foot = Math.max(4, wall * 0.09), postEvery = hw / 3.2;
          const post = Math.abs((along + postEvery / 2) % postEvery - postEvery / 2) < Math.max(2, hw / 70);
          const rail = Math.abs(hh2 - wall * 0.5) < Math.max(1.5, wall / 60), plate = wall - hh2 < Math.max(3, wall / 30);
          const panel = Math.floor((along + postEvery / 2) / postEvery), py = (hh2 - wall * 0.5) / (wall * 0.5), px2 = ((along + postEvery / 2) % postEvery) / postEvery;
          const brace = panel % 2 === 0 && py > 0 && Math.abs((1 - py) - px2) * postEvery < Math.max(1.5, hw / 90);
          if (hh2 < foot) { put(x, y, pxPick(stone, (side < 0 ? 0.55 : 0.35) + 0.25 * pxHash(Math.floor(along / 6), Math.floor(hh2 / 3)) - ((Math.round(hh2) % 3 === 0 || Math.round(along) % 6 === 0) ? 0.3 : 0), x, y)); continue; }
          if (post || rail || plate || brace) { put(x, y, pxPick(oak, (side < 0 ? 0.55 : 0.35) + 0.2 * (pxNoise(along * 0.5, hh2 * 0.05) - 0.5) + (post && pxHash(Math.round(along), Math.round(hh2 / 3)) > 0.97 ? -0.3 : 0), x, y)); continue; }
          const soot = clamp((hh2 / wall - 0.55) * 1.6, 0, 1) * pxFbm(x * 0.05, y * 0.08);
          put(x, y, pxPick(daub, (side < 0 ? 0.72 : 0.5) + 0.18 * (pxFbm(x * 0.12 + seed, y * 0.15) - 0.5) - 0.55 * soot - (pxHash(x, y + seed) > 0.97 ? 0.15 : 0), x, y));
          continue;
        } else if (kind === "ruin") {
          // big old blocks, uneven, some missing their corners; moss on whatever still stands on top, ivy trailing down
          const row = Math.floor((base - y) / 5), bx = Math.floor((tt * hw + (row % 2) * 5) / 9);
          val = (side < 0 ? 0.5 : 0.3) + 0.2 * pxHash(bx * side, row + seed) - 0.1 * pxFbm(x * 0.2, y * 0.2);
          if (Math.round(base - y) % 5 === 0 || Math.round(tt * hw + (row % 2) * 5) % 9 === 0) val = 0.08;
          const ivy = pxNoise(x * 0.35 + seed, 2) > 0.62 && y - yTop < wall * 0.55 * pxNoise(x * 0.2, seed + 1);
          if (y - yTop < 2.5 || ivy) { put(x, y, moss[ivy ? (pxHash(x, y) > 0.5 ? 1 : 0) : 2]); continue; }
        } else {
          const row = Math.floor((base - y) / 4), bx = Math.floor((tt * hw + (row % 2) * 4) / 8);
          val = (side < 0 ? 0.46 : 0.28) + 0.14 * pxHash(bx * side, row + seed);
          if (Math.round(base - y) % 4 === 0 || Math.round(tt * hw + (row % 2) * 4) % 8 === 0) val = 0.1;
        }
        if (y - yTop < 2) val = side < 0 ? 0.8 : 0.6; // the lit top edge of the wall
        if (kind === "cave") { if (Math.abs(x - cx) < 3) val -= 0.08 * (3 - Math.abs(x - cx)); }  // rock curves round the back, no sharp corner
        else if (Math.abs(x - cx) < 1) val = 0.05;     // the back corner
        if (Math.abs(x - cx) > hw - 1) val = 0.1;      // the open ends
        put(x, y, pxPick(wallC, val, x, y));
      }
      // a cave's rock overhangs: stalactites drip from its ragged top
      if (kind === "cave" && pxHash(x, seed + 5) > 0.82) {
        const len = 2 + Math.round(pxHash(x + 3, seed) * 5);
        for (let k = 0; k < len; k++) put(x, yTop + 2 + k, pxPick(wallC, 0.62 - k * 0.07, x, k));
      }
    }
    // a window in the left wall: a parallelogram that follows the wall, arched in the abbey. It has depth: a deep reveal
    // in the wall on one side, a wooden frame with a cross of glazing bars, a stone sill that sticks out at the bottom,
    // and through the glass a moonlit night with far hills, stars of different brightness and a faint shine on the panes
    const sky = (night ? night.sky : ["#0d0a2a", "#160c33", "#2d2468", "#463592"]).map(pxHex);
    const woodW = [IC.w0, IC.w1, IC.w2, IC.w3], white = pxHex("#ffffff"), moon = pxHex("#fff8d6");
    for (let x = Math.floor(cx - hw * 0.67); x <= Math.ceil(cx - hw * 0.33); x++) {
      const tt = (cx - x) / hw, base = top + tt * hh, lx = (tt - 0.5) / 0.14;
      for (let y = Math.floor(base - wall * 0.86); y < base - wall * 0.26; y++) {
        const hy = (base - y) / wall, archTop = kind === "hall" || kind === "ruin" ? 0.84 - 0.12 * Math.abs(lx) ** 1.6 : 0.8 - 0.08 * lx * lx;
        const glazed = kind === "hall";
        // a cave's opening is a ragged hole worn through the rock: no frame, no sill, rough edges
        if (kind === "cave") {
          const rough = 0.18 * pxNoise(x * 0.3 + seed, y * 0.3) + 0.08 * pxNoise(x * 0.9, y * 0.9 + seed);
          const r = Math.hypot(lx * 0.95, (hy - 0.58) / 0.21);
          if (r > 1.05 + rough) continue;
          // a lip of rock round the hole: lit along its lower left, in shadow up top
          if (r > 0.9 + rough) { put(x, y, wallC[lx < 0 && hy < 0.6 ? 3 : 0]); continue; }
          // the rock is thick: you look down a short tunnel to the sky, its sides lit from inside on the left, dark on the right
          const ri = Math.hypot((lx - 0.2) * 1.3, (hy - 0.6) / 0.15);
          if (ri > 1 + rough * 0.6) { const k = clamp((r - 0.35) / 0.55, 0, 1); put(x, y, pxPick(wallC, lx < 0.2 ? 0.2 + 0.45 * k : 0.08 + 0.12 * k, x, y)); continue; }
        } else {
          // the sill: a ledge under the window, a little wider than it, lit on top
          if (hy >= 0.28 && hy < 0.335 && Math.abs(lx) < 1.12) { put(x, y, hy > 0.315 ? wallC[Math.min(4, wallC.length - 1)] : wallC[1]); continue; }
          if (Math.abs(lx) > 1 || hy > archTop || hy < 0.335 || hy > ruinH(tt) - 0.06) continue;
        }
        let col;
        if (kind === "cave") col = null;
        else if (Math.abs(lx) > 0.88 || hy > archTop - 0.03) col = lx > 0 ? wallC[0] : wallC[2];                // the reveal: the wall's thickness
        else if (glazed && (Math.abs(lx) > 0.78 || hy > archTop - 0.075 || hy < 0.37)) col = woodW[lx > 0 ? 2 : 1];  // the frame
        else if (glazed && (Math.abs(lx) < 0.05 || Math.abs(hy - 0.57) < 0.013)) col = woodW[2];                     // the glazing bars
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
          // a faint shine slanting across the glass
          if (glazed && ((x + y * 2) % 23 + 23) % 23 < 2 && hy > 0.5) col = sky[3];
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
    if (kind === "ruin") {
      // tufts of grass at the foot of the walls, and a fallen block or two
      for (let k = 0; k < 24; k++) {
        const s0 = pxHash(k, seed), side = k % 2 ? 1 : -1, [fx, fy] = side < 0 ? at(0.02, s0) : at(s0, 0.02);
        for (let j = 0; j < 3; j++) put(fx + j - 1, fy - (j === 1 ? 2 : 1), moss[j === 1 ? 2 : 1]);
      }
      for (const [u0, v0] of [[0.86, 0.12], [0.1, 0.9]]) { const [bx, by] = at(u0, v0); for (let yy = 0; yy < 4; yy++) for (let xx = -4; xx <= 4; xx++) put(bx + xx, by - yy, pxPick(ruinStone, yy === 3 ? 0.8 : xx < 0 ? 0.55 : 0.35, xx, yy)); }
    }
    if (kind === "cave") {
      // crystals growing at the foot of the walls, in the back corner and at both ends
      for (const [bx, by, n] of [[cx, top, 5], [cx - hw * 0.92, top + hh * 0.92, 3], [cx + hw * 0.92, top + hh * 0.92, 3]]) for (let k = 0; k < n; k++) {
        const ox = bx + (k - n / 2) * 2.4, hgt = 4 + Math.round(pxHash(k + bx, seed) * 8), ww = 1.4 + pxHash(k, 3);
        for (let yy = 0; yy < hgt; yy++) { const hw2 = ww * (1 - yy / hgt); for (let xx = -Math.ceil(hw2); xx <= Math.ceil(hw2); xx++) put(ox + xx, by + 2 - yy, yy === hgt - 1 ? crys[4] : xx < 0 ? crys[3] : crys[1]); }
      }
    }
  } else {
    // the two back edges: a low wall of old stones, or fallen mossy logs
    for (const side of [-1, 1]) for (let x = Math.floor(side < 0 ? cx - hw : cx); x <= Math.ceil(side < 0 ? cx : cx + hw); x++) {
      const tt = Math.abs(x - cx) / hw, base = top + tt * hh;
      for (let yy = 0; yy < 6; yy++) {
        let col;
        if (kind === "yard") { const st = Math.floor(tt * hw / 5); col = yy === 5 || Math.round(tt * hw) % 5 === 0 ? ink : stone[1 + Math.min(2, Math.floor(pxHash(st, side + seed) * 2.4 + (side < 0 ? 0.6 : 0)))]; }
        else col = yy === 5 ? ink : yy >= 3 ? pxPick([pxHex("#1e5233"), pxHex("#2f7d4a"), pxHex("#57ad6a")], 0.4 + 0.5 * pxNoise(x * 0.3, seed), x, yy) : wood[(Math.round(tt * hw) % 6 === 0 ? 0 : side < 0 ? 2 : 1)];
        put(x, base - yy, col);
      }
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
    const fx = decorFx[p.id] !== undefined ? fxAge(p.id) : 9, bob = fx < 0.5 ? -Math.round(Math.sin(fx / 0.5 * Math.PI) * 2) * PX : 0;
    const extra = pieceExtra(p);
    if (p.id === "bed" && extra.style === "gazebo") {
      // whoever lies or stands on the deck goes between its two layers: under the roof, behind the front post
      extra.part = "base";
      items.push({ y: fy, box: { ...box, id: "bedpost" }, roofOf: "bed", draw: () => drawBaked(isoPiece(p, { ...extra, part: "post" }), 0, bob) });
      // whoever naps there hides under the roof
      items.push({ y: fy, box: { ...box, id: "bedroof" }, roofOf: "bed", after: "bedpost", draw: () => drawBaked(isoPiece(p, { ...extra, part: "roof" }), 0, bob) });
    }
    items.push({ y: fy, box, draw: () => { const f = isoPiece(p, extra); pieceHits[p.id] = { c: f.c, x: f.x + Math.round(bob / PX) * PX, y: f.y }; drawBaked(f, 0, bob); } });
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
