"use strict";
// Hatchstone · playing with decorations, breeding and the mini-games.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- playing with the decorations ----------

/** Where each piece was drawn last, for tapping it (see spriteHit). */
const pieceHits = {};
/** What a piece's picture depends on right now (the lamp being off, the pond's ripple frame...). */
const pieceExtra = p => p.id === "altar" ? { done: !!moonDone() } : p.id === "shrine" ? { event: eventNow()?.id || "", colors: eventNow()?.egg || [] } : p.id === "campfire" ? { frame: Math.floor(game.time / 160) % 4 } : p.id === "furnace" ? { frame: Math.floor(game.time / 220) % 3 } : p.id === "bed" ? { style: bedStyle() } : p.id === "garden" ? { p: gardenView() } : p.id === "lamp" ? { off: !!save.decor.lamp?.off } : p.id === "spring" ? { frame: Math.floor(game.time / 450) % 6 } : p.id === "mushrooms" ? { frame: Math.floor(game.time / 600) % 12 } : p.id === "swing" ? { room: true } : p.id === "musicbox" ? { frame: Math.floor(game.time / 260) % 8 } : {};

const decorFx = {};
let swingPush = 0;
const fxAge = id => decorFx[id] === undefined ? 9 : (game.time - decorFx[id]) / 1000;

/** The lights droop a little, but never across the window. */
const lightsSag = () => Math.max(4, Math.min(N.base * 0.4, (N.win.y - N.win.r * 1.25 - N.wallTop - 10) / 2));
/** A point t (0..1) along the string of lights. */
function lightsLine(t) {
  if (N.iso) {
    // from the left corner to the back corner, then on to the right corner, drooping between
    const ends = [[N.cx - N.isoW * 0.94, isoWallTop(N.cx - N.isoW * 0.94) + 6], [N.cx, N.wallTop + 6], [N.cx + N.isoW * 0.94, isoWallTop(N.cx + N.isoW * 0.94) + 6]];
    const seg = t < 0.5 ? 0 : 1, s = t < 0.5 ? t * 2 : t * 2 - 1, [a, b] = [ends[seg], ends[seg + 1]];
    return [lerp(a[0], b[0], s), lerp(a[1], b[1], s) + N.base * 0.3 * 4 * s * (1 - s)];
  }
  const x0 = N.cx - N.hb + N.base * 0.3, x1 = N.cx + N.hb - N.base * 0.3, y = N.wallTop + 6, sag = lightsSag();
  return [lerp(x0, x1, t), y + sag * 4 * t * (1 - t)];
}
function bulbPos(i) {
  const [x, y] = lightsLine(i / 14);
  return [x, y + 6];
}

/** Which decoration (if any) is under a finger. The rug is left out: the floor is for calling everyone. */
function decorAt(x, y) {
  const b = N.base;
  if (N.iso) {
    // the frontmost piece whose own pixels are under the finger; the swing's seat counts too
    let best = null;
    for (const p of Object.values(isoLayout().placed)) {
      if (p.id === "bed" || p.id === "incubator" || (isPlace() && PLACE_PROPS.has(p.id))) continue;
      // not drawn yet (it was only just put out): its picture is made now
      let h = pieceHits[p.id];
      if (!h) { const f = isoPiece(p, pieceExtra(p)); h = pieceHits[p.id] = { c: f.c, x: f.x, y: f.y }; }
      let hit = spriteHit(h.c, h.x, h.y, x, y);
      if (!hit && p.id === "swing") { const [sx, sy] = swingSeat(); hit = Math.hypot(x - sx, (y - sy) * 1.6) < N.isoW / ISO_G * 0.7; }
      if (hit && (!best || p.i + p.j > best.i + best.j)) best = p;
    }
    if (best) return { id: best.id };
    if (hasDecor("shelf") && pieceHits.shelf && spriteHit(pieceHits.shelf.c, pieceHits.shelf.x, pieceHits.shelf.y, x, y)) return { id: "shelf" };
    if (wallItemAt(x, y) === "painting") return { id: "painting" };
  }
  for (const d of DECOR) {
    if (!hasDecor(d.id) || d.id === "rug" || d.id === "lights") continue;
    if (N.iso) continue;
    let [hx, hy] = decorSpot(d.id), r = b * 0.42;
    const k = d.id === "shelf" ? N.dk : depthK(hy); r *= k;
    if (d.id === "lamp") { hy -= b * 0.75 * k; r = b * 0.5 * k; }
    else if (d.id === "mushrooms") { hy -= b * 0.35 * k; r = b * 0.6 * k; }
    else if (d.id === "cushion") hy -= b * 0.1;
    else if (d.id === "shelf") { hy -= b * 1.15 * k; r = b * 0.5 * k; }
    else if (d.id === "spring") r = b * 0.7;
    else if (d.id === "swing") { const s2 = swingSeat(); hx = s2[0]; hy = s2[1] + b * 0.18; r = b * 0.5; }
    if (Math.hypot(x - hx, y - hy) < r) return { id: d.id };
  }
  // the fairy lights last, so they don't steal taps meant for the shelf
  if (hasDecor("lights")) for (let i = 1; i < 14; i++) { const [bx, by] = bulbPos(i); if (Math.hypot(x - bx, y - by) < 13) return { id: "lights", bulb: i }; }
  return null;
}

const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.7, 1318.5];

/** Tap a decoration: it reacts with a little sound and sparkle, and the glowlings who love it come over. */
function playDecor(hit) {
  if (hit.id === "garden") { if (sfx.ready()) sfx.grain(sfx.ac.currentTime, 0.12, 900, 0.8, 0.12, "lowpass"); markTip("garden"); openGarden(); return; }
  const d = DECO[hit.id], [x, y] = decorSpot(hit.id), b = N.base;
  decorFx[hit.id] = game.time;
  markTip("decorTap");
  const t = sfx.ready() ? sfx.ac.currentTime : 0;
  switch (hit.id) {
    case "lights": {
      decorFx["bulb" + hit.bulb] = game.time;
      if (sfx.ready()) sfx.tone(t, NOTES[(hit.bulb - 1) % 8] * (hit.bulb > 8 ? 2 : 1), 0.06, 1.1, "sine", null, true);
      const [bx, by] = bulbPos(hit.bulb);
      game.sparks.push({ x: bx, y: by, vx: rand(-20, 20), vy: 30, t: 0, life: 0.7, s: 4, color: "#fff" });
      break;
    }
    case "lamp":
      save.decor.lamp.off = !save.decor.lamp.off;
      persist();
      if (sfx.ready()) { sfx.tone(t, 1800, 0.05, 0.04, "triangle"); if (!save.decor.lamp.off) sfx.tone(t + 0.05, 1318.5, 0.04, 0.6, "sine", null, true); }
      break;
    case "mushrooms":
      if (sfx.ready()) { sfx.tone(t, 180, 0.2, 0.3, "sine", 420); sfx.tone(t + 0.08, 260, 0.1, 0.25, "sine", 600); }
      for (let i = 0; i < 14; i++) game.sparks.push({ x: x + rand(-0.4, 0.5) * b, y: y - b * rand(0.4, 0.8), vx: rand(-30, 30), vy: rand(-90, -40), t: 0, life: rand(0.8, 1.4), s: rand(2, 4), color: pick(["#8ff0d8", "#c9b8ff", "#ff9ecb", "#fff"]) });
      break;
    case "musicbox":
      openJukebox();
      break;
    case "painting": {
      save.paintScene = ((save.paintScene || 0) + 1) % PAINTINGS.length; persist();
      toast(tr("The painting now shows: {0}", PAINTINGS[save.paintScene].name));
      if (sfx.ready()) { sfx.tone(t, 880, 0.03, 0.3, "sine", 1320, true); sfx.grain(t, 0.08, 3000, 1, 0.03); }
      break;
    }
    case "cushion":
      if (sfx.ready()) { sfx.grain(t, 0.25, 500, 0.7, 0.25, "lowpass"); sfx.grain(t + 0.02, 0.12, 2200, 1, 0.08); }
      if (N.iso) startWeather();
      else spawnChips(x, y - b * 0.2, 10, 0.5, ["#ffffff", "#e6e0ff", "#f3eefc"]);
      break;
    case "drum":
      if (sfx.ready()) { sfx.tone(t, 110, 0.25, 0.35, "sine", 60); sfx.grain(t, 0.08, 400, 1.2, 0.15, "lowpass"); }
      for (let i = 0; i < 4; i++) game.ripples.push({ x, y: y - b * 0.2, t: -i * 0.1, r: b * 0.6, h: 0.5 });
      break;
    case "blocks":
      if (sfx.ready()) for (let i = 0; i < 3; i++) sfx.tone(t + i * 0.09, 700 - i * 120, 0.06, 0.08, "triangle");
      spawnChips(x, y - b * 0.3, 6, 0.6, ["#ffc4da", "#b8e6f5", "#fff0b5"]);
      break;
    case "birdbath":
      if (sfx.ready()) sfx.tone(t, rand(1500, 1900), 0.06, 0.3, "sine", null, true);
      for (let i = 0; i < 8; i++) game.sparks.push({ x: x + rand(-8, 8), y: y - b * 0.5, vx: rand(-40, 40), vy: rand(-120, -60), t: 0, life: rand(0.4, 0.8), s: rand(2, 3), color: pick(["#9fe3e0", "#d4f3ff", "#fff"]) });
      break;
    case "lamppost": case "telescope": case "bench":
      if (sfx.ready()) sfx.tone(t, hit.id === "telescope" ? 1760 : 1320, 0.04, 0.6, "sine", null, true);
      for (let i = 0; i < 6; i++) game.sparks.push({ x: x + rand(-10, 10), y: y - b * rand(0.6, 1.4), vx: rand(-20, 20), vy: rand(-50, -20), t: 0, life: rand(0.6, 1), s: rand(2, 3), color: "#fff0b5" });
      break;
    case "spring":
      if (sfx.ready()) { sfx.tone(t, rand(1300, 1700), 0.08, 0.4, "sine", null, true); sfx.tone(t + 0.04, 2600, 0.03, 0.3, "sine"); }
      for (let i = 0; i < 3; i++) game.ripples.push({ x: x + rand(-8, 8), y, t: -i * 0.12, r: b * 0.7, h: 0.6 });
      for (let i = 0; i < 10; i++) game.sparks.push({ x: x + rand(-12, 12), y: y - 4, vx: rand(-60, 60), vy: rand(-160, -90), t: 0, life: rand(0.5, 0.9), s: rand(2, 4), color: pick(["#9fe3e0", "#d4f3ff", "#fff"]) });
      break;
    case "swing": {
      swingPush = Math.min(swingPush + 0.22, 0.6);
      const rider = [...actors.values()].find(a => a.state === "visit" && a.decor === "swing");
      if (rider) { const cr = save.creatures.find(c => c.id === rider.id); emote(rider, "♥", 1.6); if (cr) sfx.chirp(specOf(cr).voice * 1.15); }
      else if (sfx.ready()) sfx.tone(t, 330, 0.05, 0.3, "triangle", 280);
      break;
    }
    case "shelf":
      [0, 1, 2].forEach(i => setTimeout(() => sfx.star(i), i * 220));
      break;
  }
  if (hit.id === "lights" && Math.random() > 0.3) return;
  // the glowlings who love it come running (two at most)
  const fans = [...actors.values()].filter(a => {
    const cr = save.creatures.find(c => c.id === a.id);
    return cr && !cr.sleeping && d.lovers.includes(a.beh) && a.state !== "eat" && a.state !== "visit";
  }).sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y)).slice(0, 2);
  for (const a of fans) {
    a.goal = d.id; a.state = "walk"; a.friend = null;
    a.tx = clamp(x + rand(-0.25, 0.25) * b, N.x0, N.x1); a.ty = clamp(y + rand(-0.1, 0.1) * b, N.y0, N.y1);
    emote(a, "!", 0.9);
  }
}

function drawEmote(a, v) {
  const e = a.emote, k = e.t / e.life, r = Math.max(12, v.size * 0.2);
  const bx = v.x + v.size * 0.42, by = v.y - v.size * 0.62 - k * 8;
  const fade = Math.min(1, (e.life - e.t) / 0.3, e.t / 0.12);
  if (fade < 0.3) return;
  // a pixel speech bubble on the art layer, its word in crisp pixel type on top
  const rr = Math.round(r);
  drawBaked(cachedSprite(roomSprites, "bubble" + rr, `${rr}|${PX}`, () => bakeSprite(0, 0, rr, () => {
    ctx.fillStyle = "#efe6ff";
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-rr * 0.85, rr * 0.9, rr * 0.25, 0, TAU); ctx.fill();
  }, { up: 1.2, down: 1.35, side: 1.3, soft: false })), bx, by);
  fx.save();
  fx.globalAlpha = fade;
  fx.fillStyle = e.text === "♥" ? "#c25586" : "#3d2866";
  fx.font = `400 ${Math.round(r * 1.1)}px ${PIXEL_FONT}`;
  fx.textAlign = "center"; fx.textBaseline = "middle";
  fx.fillText(e.text, bx, by + 1);
  fx.restore();
}

/** Dust bunnies: little grey puffs with ears and eyes, gathering on the floor until you sweep them. */
function dustSpots() {
  const out = [];
  for (const cr of save.creatures) (cr.dust || []).forEach(([u, v], i) => {
    const [x, y] = N.iso ? isoDustAt(u, v) : [lerp(N.x0, N.x1, 0.06 + u * 0.88), lerp(N.y0, N.y1, 0.2 + v * 0.75)];
    out.push({ cr, i, x, y, r: N.base * 0.26 * depth(y) });
  });
  return out;
}

/** A dust bunny's place on the isometric floor: where it fell, or the nearest spot that's free and in plain sight. */
function isoDustAt(u, v) {
  const m = isoMargin(0.42), want = [m + u * (1 - 2 * m), m + v * (1 - 2 * m)];
  let best = want, bd = Infinity;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    const cu = m + i / 10 * (1 - 2 * m), cv = m + j / 10 * (1 - 2 * m), U = cu * ISO_G, V = cv * ISO_G;
    if (!cellFree(Math.floor(U * 2), Math.floor(V * 2)) || hiddenSpot(U, V)) continue;
    const d = Math.hypot(cu - want[0], cv - want[1]);
    if (d < bd) { bd = d; best = [cu, cv]; }
  }
  return isoAt(...best);
}

function drawDust() {
  for (const { x, y, r, i } of dustSpots()) {
    const b = Math.abs(Math.sin(game.time * 0.003 + i * 2 + x)) * r * 0.12;
    ctx.fillStyle = "rgba(5,0,20,.35)";
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.1, r * 0.3, 0, 0, TAU); ctx.fill();
    cutSprite(ctx, x, y - r * 0.4, r * 1.3, ctx => {
      for (const [dx, h] of [[-0.45, 0.9], [0.45, 0.8]]) {
        ctx.fillStyle = "#8a8494"; ctx.beginPath(); ctx.ellipse(x + dx * r, y - r * (1.2 + h * 0.5) - b, r * 0.2, r * 0.45 * h, dx * 0.6, 0, TAU); ctx.fill();
      }
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.9 - b, r * 0.1, x, y - r * 0.6 - b, r * 1.1);
      g.addColorStop(0, "#e4dfe8"); g.addColorStop(0.5, "#b9b3c0"); g.addColorStop(1, "#5d5666");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, y - r * 0.6 - b, r * 1.05, r * 0.75, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#160c26";
      for (const dx of [-0.32, 0.32]) ctx.fillRect(x + dx * r - r * 0.12, y - r * 0.75 - b, r * 0.24, r * 0.3);
    });
  }
}

/** A tap on a dust bunny sweeps it away: a puff, a shard, and a happier glowling. */
function sweepDust(x, y) {
  const hit = dustSpots().find(s => Math.hypot(x - s.x, y - (s.y - s.r * 0.6)) < Math.max(s.r * 1.6, 22));
  if (!hit) return false;
  hit.cr.dust.splice(hit.i, 1);
  taskDone("sweep");
  hit.cr.joy = clamp(hit.cr.joy + 4, 0, 100);
  save.shards += 1;
  burst(hit.x, hit.y - hit.r * 0.6, 14, ["#e4dfe8", "#b9b3c0", "#8a8494"], 0.7);
  floatText("+1 ✦", hit.x, hit.y - hit.r * 2, "#fff0b5");
  sfx.tick();
  if (sfx.ready()) sfx.grain(sfx.ac.currentTime, 0.08, 3000, 0.6, 0.12);
  buzz(8);
  persist();
  updateTopbar();
  renderNest();
  return true;
}

function drawNest() {
  // furniture and glowlings share one back-to-front order, so a glowling behind the bookcase is hidden by it
  const items = drawRoom() || [];
  drawDust();
  // whoever lies on the bed or sits on a piece is drawn right after it (on top), not by where their feet are
  const frontOf = id => { const p = N.iso && isoLayout().placed[id]; return p ? isoAt((p.i + p.fw) / ISO_G, (p.j + p.fd) / ISO_G)[1] : null; };
  for (const a of actors.values()) {
    const on = a.state === "sleep" || a.state === "toBed" ? frontOf("bed") : N.iso && a.state === "nap" && a.decor === "cushion" ? 1e6 : (a.state === "nap" || a.state === "visit") && a.decor ? frontOf(a.decor) : null;
    const item = { y: on != null && a.state !== "toBed" ? on + 0.5 : a.y + 0.5, draw: () => drawActor(a), actor: a };
    if (N.iso) {
      const [u, v] = isoFrom(a.x, a.y);
      item.box = { u0: u * ISO_G, u1: u * ISO_G, v0: v * ISO_G, v1: v * ISO_G };
      // lying on the bed, napping on the cloud or sitting on the swing or a piece: drawn right after it
      item.after = a.state === "sleep" || a.onBed ? "bed" : a.state === "nap" && a.decor === "cushion" ? "cushion" : (a.state === "visit" || a.state === "nap") && a.decor ? a.decor : null;
      if (item.after === "cushion") item.top = true;
    }
    items.push(item);
  }
  const h = heroHere();
  if (h && !h.none && N.iso) {
    const [hx, hy] = heroSpot(), [u, v] = isoFrom(hx, hy);
    items.push({ y: hy, draw: drawHero, box: { u0: u * ISO_G, u1: u * ISO_G, v0: v * ISO_G, v1: v * ISO_G } });
  }
  if (isOutside() && N.iso && wickHere()) {
    const [wx, wy] = wickSpot(), [u, v] = isoFrom(wx, wy);
    items.push({ y: wy, draw: drawWick, box: { u0: u * ISO_G, u1: u * ISO_G, v0: v * ISO_G, v1: v * ISO_G } });
  }
  const order = N.iso ? isoOrder(items) : items.sort((p, q) => p.y - q.y);
  order.forEach(it => it.draw());
  if (N.iso) ghostBehind(order);
  if (isPlace() && N.iso) drawPlaceLife();
  const sn = game.nest.snack;
  if (sn) {
    fx.font = `${Math.round(N.base * 0.32)}px system-ui`; fx.textAlign = "center";
    fx.fillText(sn.emoji, sn.x, sn.y);
    fx.textAlign = "start";
  }
}
/**
 * Back-to-front order for the isometric room, the way isometric games sort: compare places on the floor grid, not screen height.
 * A thing is in front of another when it lies wholly in front along either floor axis; wall pieces come first, the cloud and
 * whoever naps on it last, and anyone on a piece right after that piece. (A small topological sort; ties go by depth u + v.)
 */
function isoOrder(items) {
  const back = items.filter(it => !it.box && !it.top && it.y < 0), top = items.filter(it => it.top), mid = items.filter(it => it.box && !it.top);
  const loose = items.filter(it => !it.box && !it.top && it.y >= 0);
  const depth = it => (it.box.u0 + it.box.u1 + it.box.v0 + it.box.v1) / 2;
  const front = (a, b) => {
    // is a in front of b?
    if (a.after && a.after === b.box?.id) return true;
    if (b.after && b.after === a.box?.id) return false;
    // a roof goes over its piece and over everyone on that piece
    if (a.roofOf && (b.after === a.roofOf || b.box?.id === a.roofOf)) return true;
    if (b.roofOf && (a.after === b.roofOf || a.box?.id === b.roofOf)) return false;
    const A = a.box, B = b.box, e = 0.001;
    const aU = A.u0 >= B.u1 - e, aV = A.v0 >= B.v1 - e, bU = B.u0 >= A.u1 - e, bV = B.v0 >= A.v1 - e;
    if ((aU || aV) && !(bU || bV)) return true;
    if ((bU || bV) && !(aU || aV)) return false;
    return depth(a) > depth(b);
  };
  const n = mid.length, before = mid.map(() => []), indeg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (front(mid[i], mid[j])) { before[j].push(i); indeg[i]++; } else { before[i].push(j); indeg[j]++; }
  }
  const out = [], ready = mid.map((_, i) => i).filter(i => !indeg[i]);
  while (ready.length) {
    ready.sort((p, q) => depth(mid[q]) - depth(mid[p]));
    const i = ready.pop(); out.push(mid[i]);
    for (const j of before[i]) if (--indeg[j] === 0) ready.push(j);
  }
  if (out.length < n) for (const it of mid) if (!out.includes(it)) out.push(it); // a cycle (shouldn't happen): append the rest
  return [...back.sort((p, q) => p.y - q.y), ...loose, ...out, ...top.sort((p, q) => (p.after ? 1 : 0) - (q.after ? 1 : 0))];
}

/** Glowlings drawn before a piece that covers them on screen are drawn again, faintly, over it (only where it covers them). */
function ghostBehind(order) {
  const pieces = [];
  order.forEach((it, k) => {
    const id = it.box && it.box.id;
    if (!id || id === "rug") return;
    const h = pieceHits[id === "bedroof" || id === "bedpost" ? "bed" : id];
    if (h && h.c) pieces.push({ k, x0: h.x, x1: h.x + h.c.width * PX, y0: h.y, y1: h.y + h.c.height * PX, bed: id === "bed" || id === "bedroof" || id === "bedpost" });
  });
  order.forEach((it, k) => {
    const a = it.actor;
    if (!a || it.after) return;
    const v = actorView(a), r = v.size * 0.4;
    // (the bed never gets a ghost: its base is low, and under the gazebo's roof is a place to hide)
    if (!pieces.some(p => p.k > k && !p.bed && v.x + r > p.x0 && v.x - r < p.x1 && v.y > p.y0 && v.y - v.size * 0.6 < p.y1)) return;
    const cr = save.creatures.find(c => c.id === a.id);
    if (!cr) return;
    // drawn on a sheet of its own, with the glowlings in front cut out of it, then laid over the room faintly
    const real = ctx, cv = ghostSheet(real.canvas), g = cv.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(real.getTransform());
    ctx = g;
    const sprite = (b, c) => { const w = actorView(b); drawSprite(w.x, w.y, w.size, specOf(c), { ...actorLook(b, c), glow: false }); };
    try {
      sprite(a, cr);
      ctx.globalCompositeOperation = "destination-out";
      for (const o of order.slice(k + 1)) { const oc = o.actor && save.creatures.find(c => c.id === o.actor.id); if (oc) sprite(o.actor, oc); }
    } finally { g.globalCompositeOperation = "source-over"; ctx = real; }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.45; ctx.imageSmoothingEnabled = false; ctx.drawImage(cv, 0, 0); ctx.restore();
  });
}
let ghostCv = null;
const ghostSheet = like => { if (!ghostCv || ghostCv.width !== like.width || ghostCv.height !== like.height) { ghostCv = document.createElement("canvas"); ghostCv.width = like.width; ghostCv.height = like.height; } return ghostCv; };

/** How a glowling looks this moment: its face, its nightcap, a bite in its mouth. */
function actorLook(a, cr) {
  const act = activeCreature(), mine = act && a.id === act.id, asleep = a.state === "sleep" || a.state === "nap";
  const mood = asleep ? "asleep" : mine && game.nest.petting ? "joy" : a.state === "dance" || a.state === "visit" || (a.emote && a.emote.text === "♥") ? "happy" : moodOf(cr);
  return { acc: cr.acc, level: cr.level, shiny: cr.shiny, mood, cap: a.state === "sleep", hop: a.hop, eating: a.state === "eat", t: game.time + a.id * 997, glowK: mine ? 0.7 : 0.35 };
}

function drawActor(a) {
  const act = activeCreature();
  {
    const cr = save.creatures.find(c => c.id === a.id);
    if (!cr) return;
    const v = actorView(a), sp = specOf(cr), mine = act && a.id === act.id;
    ctx.fillStyle = "rgba(5,0,20,.35)";
    ctx.beginPath(); ctx.ellipse(a.x, a.y - (a.perch || 0), v.size * 0.38 * clamp(1 - a.alt / (N.base * 1.4), 0.4, 1), v.size * 0.09, 0, 0, TAU); ctx.fill();
    if (mine) {
      ctx.strokeStyle = `rgba(255,233,168,${0.5 + 0.3 * Math.sin(game.time * 0.004)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(a.x, a.y, v.size * 0.5, v.size * 0.13, 0, 0, TAU); ctx.stroke();
    }
    const asleep = a.state === "sleep" || a.state === "nap";
    drawSprite(v.x, v.y, v.size, sp, actorLook(a, cr));
    if (asleep) {
      fx.font = `400 ${Math.round(Math.max(14, v.size * 0.2))}px ${PIXEL_FONT}`;
      fx.fillStyle = "#d2bfff";
      for (let i = 0; i < 2; i++) {
        const k = ((game.time / 1600) + i / 2 + a.id * 0.13) % 1;
        fx.globalAlpha = Math.sin(k * Math.PI);
        fx.fillText("z", v.x + v.size * 0.3 + k * v.size * 0.25, v.y - v.size * 0.35 - k * v.size * 0.4);
      }
      fx.globalAlpha = 1;
    } else if (a.emote) drawEmote(a, v);
  }
}

// ---------- breeding and incubation ----------

const INCUBATE_MS = 3 * 3600e3, REST_MS = 6 * 3600e3, PAIR_LEVEL = 5;
const incSpot = () => roomSpot("incubator");

/** Who can share an egg right now, and if not, why. */
function pairReason(cr) {
  if (cr.level < PAIR_LEVEL) return tr("level {0}/{1}", cr.level, PAIR_LEVEL);
  if (cr.sleeping) return tr("asleep");
  applyTime(cr);
  if (cr.joy < 50) return tr("needs joy");
  if (cr.bredAt && Date.now() - cr.bredAt < REST_MS) return tr("resting {0}", fmtLeft(cr.bredAt + REST_MS - Date.now()));
  return "";
}

function fmtLeft(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  return m >= 60 ? tr("{0}h {1}m", Math.floor(m / 60), String(m % 60).padStart(2, "0")) : tr("{0}m", m);
}

/** Each part comes from one parent or the other, now and then a surprise; colors and names blend. */
function mixGlowling(a, b) {
  const A = specOf(a), B = specOf(b), mix = {};
  let surprise = false;
  for (const k of PARTS) {
    if (Math.random() < 0.08) { mix[k] = pick(SPECIES)[k]; surprise = true; }
    else mix[k] = (Math.random() < 0.5 ? A : B)[k];
  }
  const pa = palOf(A), pb = palOf(B);
  mix.pal = [pa[0], pb[1], Math.random() < 0.5 ? pa[2] : pb[2]];
  mix.crystal = (Math.random() < 0.5 ? A : B).crystal;
  mix.snack = pick([A.snack, B.snack]);
  mix.voice = (A.voice + B.voice) / 2;
  mix.beh = pick([A.beh || BEHAVIOR[a.sp] || "dance", B.beh || BEHAVIOR[b.sp] || "dance"]);
  const na = A.name.replace(/^✦ /, ""), nb = B.name.replace(/^✦ /, "");
  mix.name = na.slice(0, Math.ceil(na.length / 2)) + nb.slice(Math.floor(nb.length / 2)).toLowerCase();
  mix.parents = [na, nb];
  return { mix, surprise, shiny: Math.random() < (a.shiny || b.shiny ? 0.15 : 0.04) };
}

let pairPick = [];
function openIncubator() {
  if (!incHere()) goRoom(0);
  sfx.tick();
  const inc = save.incubator;
  if (inc && Date.now() >= inc.due) { show("incubator", false); return; }
  if (inc) {
    $("incTitle").textContent = tr("Keeping it warm");
    $("incSub").textContent = `${inc.mix.parents[0]} × ${inc.mix.parents[1]}`;
    const cost = hurryCost();
    $("incBody").innerHTML = `<div class="timer" id="incTimer">${fmtLeft(inc.due - Date.now())}</div>
      <p class="sub">${tr("Stroke the egg in the incubator to keep it warm: it hatches faster. Time keeps going even when the game is closed.")}</p>
      <div class="row center"><button class="act" id="hurryBtn" ${save.shards < cost ? "disabled" : ""}>${tr("✨ Hatch now · ✦ {0}", cost)}</button></div>`;
    $("hurryBtn").addEventListener("click", hurryEgg);
    clearInterval(openIncubator.tick);
    openIncubator.tick = setInterval(() => { if ($("incTimer") && save.incubator) $("incTimer").textContent = fmtLeft(save.incubator.due - Date.now()); else clearInterval(openIncubator.tick); }, 1000);
  } else {
    pairPick = pairPick.filter(id => save.creatures.some(c => c.id === id && !pairReason(c)));
    const ready = save.creatures.filter(c => !pairReason(c));
    $("incTitle").textContent = tr("Lay a mixed egg");
    $("incSub").textContent = tr("Two happy glowlings at level {0}+ can share an egg. The baby mixes their parts and colors and hatches in about 3 hours.", PAIR_LEVEL);
    $("incBody").innerHTML = `<div class="pick">${save.creatures.map(c => {
      const why = pairReason(c);
      return `<button data-id="${c.id}" class="${pairPick.includes(c.id) ? "on" : ""}" ${why ? "disabled" : ""}><img class="px2" style="width:52px;height:52px" src="${creatureImage(specOf(c), { art: 26, level: c.level, shiny: c.shiny })}" alt="">${why || c.name}</button>`;
    }).join("")}</div>
      <p id="pairPreview" class="center">${pairPick.length === 2 ? pairPick.map(id => save.creatures.find(c => c.id === id).name).join(" ♥ ") : ready.length < 2 ? tr("Feed, pet and play with your glowlings to grow them up") : tr("Pick two glowlings")}</p>
      <div class="row center"><button class="act" id="layBtn" ${pairPick.length === 2 ? "" : "disabled"}>${tr("💞 Lay the egg")}</button></div>`;
    $$("#incBody .pick button").forEach(b => b.addEventListener("click", () => {
      const id = Number(b.dataset.id);
      pairPick = pairPick.includes(id) ? pairPick.filter(x => x !== id) : [...pairPick, id].slice(-2);
      sfx.tick();
      openIncubator();
    }));
    $("layBtn").addEventListener("click", layEgg);
  }
  show("incubator", true);
}

function layEgg() {
  markTip("pair");
  const [a, b] = pairPick.map(id => save.creatures.find(c => c.id === id));
  if (!a || !b || pairReason(a) || pairReason(b)) return;
  const { mix, surprise, shiny } = mixGlowling(a, b);
  taskDone("breed");
  const now = Date.now();
  save.incubator = { mix, surprise, shiny, laid: now, due: now + INCUBATE_MS, warmed: 0 };
  for (const p of [a, b]) { p.bredAt = now; p.joy = clamp(p.joy + 15, 0, 100); const ac = actors.get(p.id); if (ac) { emote(ac, "♥", 2.5); ac.hop = 1; } }
  pairPick = [];
  persist();
  show("incubator", false);
  sfx.lullaby();
  toast(tr("{0} and {1} laid an egg ♥ Keep it warm!", a.name, b.name));
  const [x, y] = incSpot();
  burst(x, y - N.base * 0.5, 20, ["#fff", "#ffb3d4", mix.pal[0], mix.pal[1]]);
}

const hurryCost = () => Math.max(1, Math.ceil((save.incubator.due - Date.now()) / 60000 / 6));
function hurryEgg() {
  const cost = hurryCost();
  if (save.shards < cost) return;
  save.shards -= cost;
  save.incubator.due = Date.now();
  persist();
  updateTopbar();
  show("incubator", false);
  sfx.gleam();
}

/** Stroking the egg warms it: each stroke takes a little time off, up to half the wait. */
function warmEgg(d) {
  const inc = save.incubator;
  if (!inc || Date.now() >= inc.due) return;
  game.nest.warmDist = (game.nest.warmDist || 0) + d;
  if (game.nest.warmDist < 40) return;
  game.nest.warmDist = 0;
  const cut = Math.min(30e3, INCUBATE_MS / 2 - inc.warmed);
  if (cut <= 0) { if (!game.nest.warmToldMax) { game.nest.warmToldMax = true; toast(tr("It's as warm as it can get ✦ now it just needs time")); } return; }
  inc.warmed += cut; inc.due -= cut;
  const [x, y] = incSpot();
  game.sparks.push({ x: x + rand(-12, 12), y: y - N.base * 0.55, vx: rand(-15, 15), vy: -40, t: 0, life: 0.8, s: 4, color: pick(["#ffd27a", "#ffb3d4", "#fff"]) });
  if (Math.random() < 0.3) persist();
}

/** Hatching: tap the ready egg three times; it cracks a little more each time, then pops open. */
function tapIncubator() {
  const inc = save.incubator, n = game.nest;
  if (!inc) return openIncubator();
  if (Date.now() < inc.due) return openIncubator();
  n.hatchTaps = (n.hatchTaps || 0) + 1;
  n.hatchWob = 1;
  if (n.hatchTaps < 3) { sfx.crackDone(n.hatchTaps + 2); sfx.knock(0.8); return; }
  // it hatches!
  const now = Date.now();
  const cr = { mem: [{ t: Date.now(), k: "Hatched in the incubator: a mix of {0}", a: [inc.mix.parents.join(" × ")] }], id: save.nextId++, sp: "hybrid", mix: inc.mix, name: (inc.shiny ? "✦ " : "") + inc.mix.name, shiny: inc.shiny, level: 1, xp: 0, tummy: 70, joy: 90, energy: 80, sleeping: false, last: now, born: now };
  save.creatures.push(cr);
  save.hybrids = save.hybrids || [];
  save.hybrids.push({ id: cr.id, name: inc.mix.name, parents: inc.mix.parents, date: now });
  save.incubator = null;
  save.active = cr.id;
  n.hatchTaps = 0;
  persist();
  syncActors();
  const [x, y] = incSpot(), a = actors.get(cr.id);
  if (a) { a.x = x + N.base * 0.4; a.y = y; a.tx = a.x; a.ty = a.y; a.hop = 1; emote(a, "♥", 2.5); }
  burst(x, y - N.base * 0.5, 40, ["#fff", ...inc.mix.pal], 1.5);
  sfx.burst("rare");
  setTimeout(() => sfx.chirp(inc.mix.voice), 500);
  toast(inc.surprise ? tr("{0} hatched, with a surprise trait! ✦", cr.name) : tr("{0} hatched! ✦", cr.name));
  renderNest(true);
}

/** The incubator's pod in pixels: a metal saucer with a ring of blinking lights, and inside the glass a nebula with twinkling stars. */
function incubatorPod(x, y, b) {
  const f = Math.floor(game.time / 400) % 8;
  return cachedSprite(isoPieces, "incPod", `${x}|${y}|${b}|${PX}|${f}`, () => {
    const w = Math.ceil(b * 1.3 / PX), h = Math.ceil(b * 1.25 / PX), ox = x - b * 0.65, oy = y - b * 1.05, q = v => v / PX;
    const cx = q(x - ox), domeY = q(y - b * 0.55 - oy), r = q(b * 0.4), floorY = q(y - b * 0.06 - oy);
    const neb = ["#0b0614", "#1d1145", "#3a2a7a", "#6b4fa8", "#c25586"].map(pxHex), metal = [IC.s0, IC.s1, IC.s2, IC.s3];
    const c = isoArt(w, h, T => {
      // the saucer: a metal ring, lit on top, with lights all round that take turns
      const rx = q(b * 0.5), ry = q(b * 0.14), sy = floorY + 1;
      for (let py = Math.floor(sy - ry); py <= sy + ry + 2; py++) for (let px = Math.floor(cx - rx); px <= Math.ceil(cx + rx); px++) {
        const d = Math.hypot((px - cx) / rx, (py - sy) / ry), under = py > sy && Math.hypot((px - cx) / rx, (py - sy - 2) / ry) <= 1;
        if (d <= 1) T.px(px, py, py < sy - ry * 0.3 ? metal[0] : Math.abs(py - sy - ry * 0.15) < 1.5 ? IC.ink2 : py < sy + ry * 0.2 ? metal[1] : metal[2]);
        else if (under) T.px(px, py, metal[3]);
      }
      // the nebula, inside the glass: it stands on the saucer like an upturned glass, its rim an oval on the saucer's top
      const er = r * 0.28;
      for (let py = Math.floor(domeY - r); py <= Math.ceil(floorY + er); py++) for (let px = Math.floor(cx - r); px <= Math.ceil(cx + r); px++) {
        const dx = px - cx, inDome = py < domeY ? Math.hypot(dx, py - domeY) <= r : Math.abs(dx) <= r && (py <= floorY || (dx / r) ** 2 + ((py - floorY) / er) ** 2 <= 1);
        if (!inDome) continue;
        const n = pxNoise(px * 0.18, py * 0.18 + 3) * 0.8 + 0.25 * Math.sin(dx * 0.2 + (py - domeY) * 0.15);
        let col = pxPick(neb, clamp(n, 0, 1), px, py);
        const st = pxHash(px, py);
        if (st > 0.965) col = (st * 97 + f) % 3 < 1 ? IC.y0 : IC.white;
        T.px(px, py, col);
      }
      const lights = [IC.y0, IC.p0, IC.b0, IC.g0];
      for (let k = 0; k < 12; k++) {
        const an = k / 12 * TAU, lx = cx + Math.cos(an) * rx * 0.88, ly = sy + ry * 0.15 + Math.sin(an) * ry * 0.75;
        if (Math.sin(an) < -0.2) continue;
        const col = (k + f) % 3 === 0 ? IC.white : lights[k % 4];
        const ls = Math.max(2, Math.round(rx / 14));
        for (let a2 = 0; a2 < ls; a2++) for (let b2 = 0; b2 < ls - 1; b2++) T.px(lx + a2, ly + b2, col);
      }
    });
    return { c, x: Math.round(ox / PX) * PX, y: Math.round(oy / PX) * PX };
  });
}

function drawIncubator() {
  const [x, y] = incSpot(), b = N.base * depthK(incSpot()[1]), inc = save.incubator, n = game.nest;
  const ready = inc && Date.now() >= inc.due;
  // a little space pod: a metal saucer with blinking lights, and a nebula full of stars inside the dome
  ctx.fillStyle = "rgba(5,0,20,.3)"; ctx.beginPath(); ctx.ellipse(x, y + 4, b * 0.55, b * 0.11, 0, 0, TAU); ctx.fill();
  // while it incubates, a ring of light on the floor round the saucer fills up (it lies flat, under everything else)
  if (inc && !ready) {
    const k = clamp(1 - (inc.due - Date.now()) / INCUBATE_MS, 0, 1), fy = y - b * 0.02, from = Math.PI / 2;
    ctx.lineWidth = Math.max(2, PX * 1.5);
    ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.beginPath(); ctx.ellipse(x, fy, b * 0.66, b * 0.2, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = "rgba(255,179,212,.85)"; ctx.beginPath(); ctx.ellipse(x, fy, b * 0.66, b * 0.2, 0, from, from + TAU * k); ctx.stroke();
  }
  // a tiny moon orbits the dome on a faint ring: the far half of the ring (and the moon, when it's back there) goes behind the dome
  const an = game.time * 0.0009, oy0 = y - b * 0.42, moonFront = Math.sin(an) > 0;
  const orbit = (a0, a1) => { ctx.strokeStyle = "rgba(201,184,255,.3)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, oy0, b * 0.62, b * 0.16, 0, a0, a1); ctx.stroke(); };
  const moon = () => { ctx.fillStyle = "#fff0b5"; ctx.fillRect(Math.round((x + Math.cos(an) * b * 0.62) / PX) * PX - PX * 1.5, Math.round((oy0 + Math.sin(an) * b * 0.16) / PX) * PX - PX * 1.5, PX * 3, PX * 3); };
  orbit(Math.PI, TAU);
  if (!moonFront) moon();
  drawBaked(incubatorPod(x, y, b));
  if (inc) {
    // the egg: speckled in both parents' colors, glowing warmer as it gets closer
    const k = clamp(1 - (inc.due - Date.now()) / INCUBATE_MS, 0, 1), wob = ready ? Math.sin(game.time * 0.02) * 0.08 + (n.hatchWob || 0) * Math.sin(game.time * 0.05) * 0.2 : 0;
    const glow = ctx.createRadialGradient(x, y - b * 0.4, 2, x, y - b * 0.4, b * (0.6 + k * 0.4));
    glow.addColorStop(0, `rgba(255,214,150,${0.2 + k * 0.35})`); glow.addColorStop(1, "rgba(255,214,150,0)");
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y - b * 0.4, b * (0.6 + k * 0.4), 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(x, y - b * 0.06); ctx.rotate(wob); ctx.translate(-x, -(y - b * 0.06));
    const ew = b * 0.42, eh = ew * 1.28, ey = y - b * 0.05 - eh / 2; // it stands on the saucer, in the middle of the glass's rim
    tracePoly(ctx, eggPoly(x, ey, ew, eh, 40));
    const eg = ctx.createLinearGradient(x - ew / 2, ey - eh / 2, x + ew / 2, ey + eh / 2);
    eg.addColorStop(0, "#fff"); eg.addColorStop(0.4, inc.mix.pal[1]); eg.addColorStop(1, inc.mix.pal[0]);
    ctx.fillStyle = eg; ctx.fill();
    ctx.save(); ctx.clip();
    const R2 = seeded(inc.mix.name);
    ctx.fillStyle = inc.mix.pal[2]; ctx.globalAlpha = 0.45;
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(x + (R2() - 0.5) * ew, ey + (R2() - 0.5) * eh, ew * (0.04 + R2() * 0.05), 0, TAU); ctx.fill(); }
    ctx.restore();
    // cracks from the taps
    if (n.hatchTaps) {
      ctx.strokeStyle = "rgba(40,20,50,.8)"; ctx.lineWidth = 1.6; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(x - ew / 2, ey);
      for (let i = 1; i <= 6; i++) ctx.lineTo(x - ew / 2 + i * ew / 6, ey + (i % 2 ? -1 : 1) * eh * 0.06);
      ctx.stroke();
      if (n.hatchTaps > 1) { ctx.beginPath(); ctx.moveTo(x - ew * 0.1, ey - eh * 0.04); ctx.lineTo(x - ew * 0.05, ey - eh * 0.3); ctx.moveTo(x + ew * 0.2, ey + eh * 0.04); ctx.lineTo(x + ew * 0.12, ey + eh * 0.3); ctx.stroke(); }
    }
    ctx.restore();
  }
  // the glass dome
  const dg = ctx.createLinearGradient(x - b * 0.4, 0, x + b * 0.4, 0);
  dg.addColorStop(0, "rgba(255,255,255,.22)"); dg.addColorStop(0.3, "rgba(255,255,255,.05)"); dg.addColorStop(1, "rgba(255,255,255,.16)");
  ctx.fillStyle = dg; ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.4;
  // its rim is an oval resting on the saucer: the back of the rim shows faintly through the glass, the front edge is the bottom of the glass
  const gy = y - b * 0.06, gr = b * 0.112;
  ctx.beginPath(); ctx.moveTo(x - b * 0.4, gy); ctx.lineTo(x - b * 0.4, y - b * 0.55); ctx.arc(x, y - b * 0.55, b * 0.4, Math.PI, 0); ctx.lineTo(x + b * 0.4, gy); ctx.ellipse(x, gy, b * 0.4, gr, 0, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.beginPath(); ctx.ellipse(x, gy, b * 0.4, gr, 0, Math.PI, TAU); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.ellipse(x - b * 0.22, y - b * 0.62, b * 0.05, b * 0.16, 0.3, 0, TAU); ctx.fill();
  orbit(0, Math.PI);
  if (moonFront) moon();
  // a sparkle when it's ready to hatch, a little heart when it's empty
  if (inc && !ready) { /* the ring on the floor shows how far along it is */ }
  else if (ready) {
    ctx.fillStyle = "#ffe9a8";
    for (let i = 0; i < 3; i++) { const a = game.time * 0.002 + i * 2.1; sparklePath(ctx, x + Math.cos(a) * b * 0.5, y - b * 0.55 + Math.sin(a) * b * 0.4, 5 + 3 * Math.abs(Math.sin(game.time * 0.005 + i))); ctx.fill(); }
  } else {
    fx.fillStyle = "rgba(239,230,255,.5)"; fx.font = `400 ${Math.round(b * 0.3)}px ${PIXEL_FONT}`; fx.textAlign = "center";
    fx.fillText("♥", x, y - b * 0.45); fx.textAlign = "start";
  }
}

const atIncubator = (x, y) => { if (!incHere()) return false; const [ix, iy] = incSpot(); return Math.hypot(x - ix, y - (iy - N.base * 0.4)) < N.base * 0.55; };

// ---------- the sparkle-catch mini-game ----------

/** Playing tires a glowling out, more so when it plays again and again: false if it's too sleepy to start. */
function payToPlay(cr) {
  applyTime(cr);
  if (cr.energy < 15) { toast(tr("{0} is too sleepy to play. Try a nap 🌙", cr.name)); return false; }
  const now = Date.now();
  cr.plays = (cr.plays || []).filter(t => now - t < 10 * 60e3).concat(now);
  cr.energy = clamp(cr.energy - 15 - 6 * (cr.plays.length - 1), 0, 100);
  cr.tummy = clamp(cr.tummy - 5, 0, 100);
  persist();
  return true;
}

function openGames() {
  const cr = activeCreature();
  if (!cr) return;
  $("gamesSub").textContent = tr("What shall we play with {0}?", cr.name);
  $("gamesList").innerHTML = [["catch", "✨", tr("Sparkle catch"), tr("drag to catch sparkles, dodge pebbles")], ["echo", "🎵", tr("Echo song"), tr("listen to the tune, then sing it back")]]
    .map(([id, em, name, how]) => `<button class="snack" data-game="${id}"><span class="em">${em}</span><span><b>${name}</b><small>${how}</small></span>${id === "echo" && save.echoBest ? `<span class="cost">♪ ${save.echoBest}</span>` : ""}</button>`).join("");
  $$("#gamesList .snack").forEach(b => b.addEventListener("click", () => { show("games", false); (b.dataset.game === "echo" ? startEcho : startCatch)(); }));
  show("games", true);
}

function startCatch() {
  const cr = activeCreature();
  if (!cr || !payToPlay(cr)) return;
  game.catch = { t: 20, intro: 3, x: W / 2, tx: W / 2, items: [], spawn: 0, score: 0, combo: 0, flinch: 0, done: false };
  setTimeout(() => setHint(tr("drag left and right · catch sparkles, dodge pebbles")), 50);
  setScene("catch");
}

function catchLayout() {
  const s = Math.min(W * 0.24, 110);
  return { s, y: H - Math.max(150, H * 0.2) };
}

function updateCatch(dt) {
  const g = game.catch;
  if (!g || g.done) return;
  const { s, y } = catchLayout();
  if (g.intro > 0) {
    const before = Math.ceil(g.intro);
    g.intro -= dt;
    g.x = lerp(g.x, clamp(g.tx, s * 0.6, W - s * 0.6), Math.min(1, dt * 12));
    if (Math.ceil(g.intro) !== before) sfx.tick();
    if (g.intro <= 0) { setHint(""); sfx.ding(4); }
    return;
  }
  g.t -= dt;
  g.x = lerp(g.x, clamp(g.tx, s * 0.6, W - s * 0.6), Math.min(1, dt * 12));
  g.spawn -= dt;
  const pace = 1 + (20 - g.t) / 14;
  if (g.spawn <= 0) {
    g.spawn = rand(0.32, 0.6) / pace;
    g.items.push({ x: rand(30, W - 30), y: -20, vy: rand(150, 230) * pace, pebble: Math.random() < 0.22, rot: rand(0, 6), color: pick(palOf(specOf(activeCreature()))) });
  }
  for (const it of g.items) {
    it.y += it.vy * dt; it.rot += dt * 2;
    if (!it.hit && Math.abs(it.x - g.x) < s * 0.55 && Math.abs(it.y - (y - s * 0.1)) < s * 0.4) {
      it.hit = true;
      if (it.pebble) {
        g.combo = 0; g.score = Math.max(0, g.score - 1); g.flinch = 0.4;
        sfx.bonk(); buzz(20);
        floatText("bonk", it.x, it.y, "#ffb3a8");
      } else {
        g.combo++; g.score++;
        sfx.ding(g.combo);
        burst(it.x, it.y, 5, ["#fff", it.color]);
      }
    }
  }
  g.items = g.items.filter(it => !it.hit && it.y < H + 30);
  g.flinch = Math.max(0, g.flinch - dt);
  $("catchScore").textContent = g.score;
  $("catchTime").textContent = Math.max(0, Math.ceil(g.t));
  if (g.t <= 0) endCatch();
}

function endCatch() {
  const g = game.catch, cr = activeCreature();
  g.done = true;
  const joy = Math.min(35, Math.round(g.score * 1.5) + 5), xp = g.score + 5, shards = Math.floor(g.score / 3);
  cr.joy = clamp(cr.joy + joy, 0, 100);
  save.shards += shards;
  addXP(cr, xp);
  persist();
  $("catchTitle").textContent = g.score >= 25 ? tr("Sparkle storm! ✦") : g.score >= 12 ? tr("Great catch!") : tr("Fun!");
  $("catchSub").textContent = tr("{0} caught {1} {2}.", cr.name, g.score, pl(g.score, "sparkle", "sparkles"));
  $("cdJoy").textContent = "+" + joy;
  $("cdXp").textContent = "+" + xp;
  $("cdShards").textContent = "+" + shards;
  sfx.levelUp();
  bump("played");
  show("catchDone", true);
  taskDone("catch");
}

function drawCatch() {
  const g = game.catch, cr = activeCreature();
  if (!g || !cr) return;
  const { s, y } = catchLayout();
  if (g.intro > 0) {
    fx.save();
    fx.textAlign = "center";
    fx.globalAlpha = 0.4 + 0.6 * (g.intro % 1);
    fx.font = `400 ${Math.round(Math.min(W, H) * 0.24)}px ${PIXEL_FONT}`;
    fx.fillStyle = "#160c26"; fx.fillText(Math.ceil(g.intro), W / 2 + 6, H * 0.42 + 6);
    fx.fillStyle = "#fff0b5"; fx.fillText(Math.ceil(g.intro), W / 2, H * 0.42);
    fx.restore();
  }
  for (const it of g.items) {
    ctx.save();
    ctx.translate(it.x, it.y); ctx.rotate(it.rot);
    if (it.pebble) {
      ctx.fillStyle = "#8b7f9e";
      ctx.beginPath(); ctx.ellipse(0, 0, 13, 10, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.25)";
      ctx.beginPath(); ctx.ellipse(-4, -3, 5, 3, 0, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = it.color; ctx.shadowColor = it.color; ctx.shadowBlur = quality.low ? 0 : 10;
      sparklePath(ctx, 0, 0, 13); ctx.fill();
      ctx.fillStyle = "#fff"; sparklePath(ctx, 0, 0, 5); ctx.fill();
    }
    ctx.restore();
  }
  drawSprite(g.x, y, s, specOf(cr), { level: cr.level, shiny: cr.shiny, mood: g.flinch > 0 ? "sad" : "happy" });
}

// ---------- the echo-song mini-game: four singing crystals, a tune that grows one note each round ----------

const ECHO_STONES = ["amethyst", "citrine", "celestite", "rose"];

function startEcho() {
  const cr = activeCreature();
  if (!cr || !payToPlay(cr)) return;
  const r = () => Math.floor(Math.random() * 4);
  game.echo = { seq: [r(), r()], phase: "pause", t: 1.2, i: 0, lit: -1, litT: 0, score: 0, sing: 0, done: false };
  sfx.hush = true;
  $("echoRound").textContent = 1;
  setTimeout(() => setHint(tr("listen…")), 50);
  setScene("echo");
}

function echoLayout() {
  const r = Math.min(W * 0.17, H * 0.1, 80), gap = r * 0.25, y1 = H * 0.56;
  return {
    s: Math.min(W * 0.3, H * 0.2, 130), cy: y1 - r - H * 0.1, r,
    pads: [[W / 2 - r - gap / 2, y1], [W / 2 + r + gap / 2, y1], [W / 2 - r - gap / 2, y1 + r * 2 + gap], [W / 2 + r + gap / 2, y1 + r * 2 + gap]],
  };
}

function echoLight(k, dur) {
  const g = game.echo;
  g.lit = k; g.litT = dur; g.sing = dur;
  sfx.note(k);
}

function updateEcho(dt) {
  const g = game.echo;
  if (!g || g.done) return;
  g.litT -= dt; g.sing -= dt;
  if (g.litT <= 0) g.lit = -1;
  if (g.phase === "input") return;
  g.t -= dt;
  if (g.t > 0) return;
  if (g.phase === "over") { endEcho(); return; }
  if (g.phase === "pause") { g.phase = "show"; g.i = 0; g.t = 0; setHint(tr("listen…")); return; }
  // showing the tune: one crystal at a time, a little quicker each round
  if (g.i >= g.seq.length) { g.phase = "input"; g.i = 0; setHint(tr("your turn: tap the crystals")); return; }
  const on = Math.max(0.3, 0.55 - g.score * 0.025);
  echoLight(g.seq[g.i++], on);
  g.t = on + 0.15;
}

function echoTap(x, y) {
  const g = game.echo;
  if (!g || g.done || g.phase !== "input") return;
  const { pads, r } = echoLayout(), k = pads.findIndex(([px, py]) => Math.hypot(x - px, y - py) < r);
  if (k < 0) return;
  if (k !== g.seq[g.i]) {
    // a wrong note: the crystal that should have sung lights up, so you can hear where the tune went
    g.lit = g.seq[g.i]; g.litT = 0.9; g.phase = "over"; g.t = 1.4;
    sfx.bonk(); buzz(30); setHint("");
    return;
  }
  echoLight(k, 0.25);
  if (++g.i < g.seq.length) return;
  // the whole tune, sung back: one note longer next time
  g.score++;
  $("echoRound").textContent = g.score + 1;
  const { cy } = echoLayout();
  floatText(g.score % 5 ? "♪" : "♪♪♪", W / 2, cy - 40, "#fff0b5");
  burst(W / 2, cy, 6, ["#fff", ...palOf(specOf(activeCreature()))]);
  setTimeout(() => sfx.ding(g.score), 280);
  g.seq.push(Math.floor(Math.random() * 4));
  g.phase = "pause"; g.t = 1; setHint("");
}

function endEcho() {
  const g = game.echo, cr = activeCreature();
  g.done = true; sfx.hush = false;
  const best = g.score > (save.echoBest || 0);
  if (best) save.echoBest = g.score;
  if (best && g.score >= 3) giveBar("nut");
  bump("played");
  const joy = Math.min(35, g.score * 4 + 5), xp = g.score * 2 + 5, shards = Math.floor(g.score / 2);
  cr.joy = clamp(cr.joy + joy, 0, 100);
  save.shards += shards;
  addXP(cr, xp);
  persist();
  $("catchTitle").textContent = g.score >= 10 ? tr("Perfect pitch! ✦") : g.score >= 5 ? tr("Lovely song!") : tr("Fun!");
  $("catchSub").textContent = tr("Tunes sung back with {0}: {1}", cr.name, g.score) + (best && g.score ? tr(" · a new best!") + (g.score >= 3 ? " " + tr("{0} +1", barName("nut")) : "") : "");
  $("cdJoy").textContent = "+" + joy;
  $("cdXp").textContent = "+" + xp;
  $("cdShards").textContent = "+" + shards;
  sfx.levelUp();
  show("catchDone", true);
}

/** A crystal pad: a six-sided gem, glowing while it sings. */
function drawEchoStone(x, y, r, id, lit) {
  const [main, light, deep] = CRYSTAL[id].c, k = lit ? 1.08 : 1, R = r * k;
  const pt = (i, rr = R) => [x + Math.cos(-Math.PI / 2 + i * Math.PI / 3) * rr, y + Math.sin(-Math.PI / 2 + i * Math.PI / 3) * rr];
  ctx.save();
  if (lit && !quality.low) { ctx.shadowColor = light; ctx.shadowBlur = r * 0.6; }
  ctx.fillStyle = lit ? light : deep;
  ctx.beginPath(); for (let i = 0; i < 6; i++) ctx.lineTo(...pt(i)); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  // the facets: a lit face up on the left, the table in the middle
  ctx.fillStyle = lit ? "#fff" : main;
  ctx.beginPath(); ctx.moveTo(...pt(0)); ctx.lineTo(...pt(5)); ctx.lineTo(...pt(4)); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = lit ? shade(light, 0.4) : shade(main, 0.2);
  ctx.beginPath(); for (let i = 0; i < 6; i++) ctx.lineTo(...pt(i, R * 0.5)); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = lit ? 0.9 : 0.35; ctx.fillStyle = "#fff";
  sparklePath(ctx, x - R * 0.28, y - R * 0.3, R * 0.12); ctx.fill();
  ctx.restore();
}

function drawEcho() {
  const g = game.echo, cr = activeCreature();
  if (!g || !cr) return;
  const { s, cy, r, pads } = echoLayout();
  pads.forEach(([x, y], k) => drawEchoStone(x, y, r, ECHO_STONES[k], g.lit === k));
  const mood = g.phase === "over" ? "sad" : g.sing > 0 || g.phase === "pause" && g.score ? "happy" : "ok";
  drawSprite(W / 2, cy + (g.sing > 0 ? -4 : 0), s, specOf(cr), { level: cr.level, shiny: cr.shiny, mood });
  if (g.sing > 0) {
    fx.fillStyle = "#fff0b5"; fx.font = `400 ${Math.round(s * 0.28)}px ${PIXEL_FONT}`; fx.textAlign = "center";
    fx.fillText("♪", W / 2 + s * 0.55, cy - s * 0.55 - (0.3 - g.sing) * 30); fx.textAlign = "start";
  }
}
