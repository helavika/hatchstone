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
  if (hit.id === "garden") { if (sfx.ready()) sfx.grain(sfx.ac.currentTime, 0.12, 900, 0.8, 0.12, "lowpass"); markTip("garden"); pressProp("garden", openGarden); return; }
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
      coreRest();
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

/** Dust bunnies: little fluffy puffs with ears and eyes on the nest floor, until you sweep them (the order of it all: see gatherDust). */
const dustView = { key: "", spots: [] }, dustArt = { R: 0 }, dustBorn = new Map();
/** Where the nest's dust bunnies are: worked out again only when the dust, the room or its furniture change. Nowhere but the nest. */
function dustSpots() {
  const dust = save.dust || [];
  if (!dust.length || save.room !== nestRoom()) return [];
  const lay = N.iso && isoLayout(), key = `${W}|${H}|${N.base}|${N.iso}|${dust.join(";")}`;
  if (dustView.key === key && dustView.lay === lay && dustView.dust === dust) return dustView.spots;
  const taken = [];
  dustView.spots = dust.map((d, i) => {
    const [x, y] = N.iso ? isoDustAt(d[0], d[1], taken) : [lerp(N.x0, N.x1, 0.06 + d[0] * 0.88), lerp(N.y0, N.y1, 0.2 + d[1] * 0.75)];
    return { d, i, x, y, r: N.base * 0.24 * depth(y) };
  });
  dustView.key = key; dustView.lay = lay; dustView.dust = dust;
  return dustView.spots;
}

/** A dust bunny's place on the isometric floor: where it fell, or the nearest spot that's free, in plain sight and not on another bunny. */
function isoDustAt(u, v, taken) {
  const m = isoMargin(0.42), want = [m + u * (1 - 2 * m), m + v * (1 - 2 * m)];
  let best = want, bd = Infinity;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    const cu = m + i / 10 * (1 - 2 * m), cv = m + j / 10 * (1 - 2 * m), U = cu * ISO_G, V = cv * ISO_G;
    if (!cellFree(Math.floor(U * 2), Math.floor(V * 2)) || hiddenSpot(U, V) || taken.some(([a, b]) => Math.hypot(a - cu, b - cv) < 0.14)) continue;
    const d = Math.hypot(cu - want[0], cv - want[1]);
    if (d < bd) { bd = d; best = [cu, cv]; }
  }
  taken.push(best);
  return isoAt(...best);
}

/**
 * A dust bunny in art pixels, painted once per size: soft cel bands lit from the top left (a pale top, lilac-grey body,
 * a darker belly), a fluffy scalloped crown, two ears with pink insides, little eyes with a glint (or shut, to blink),
 * pink cheeks, and a one-pixel dark plum outline so it reads on any floor. The contact shadow is its own picture.
 */
function bakeDust(R) {
  const w = Math.ceil(R * 2.6) + 4, h = Math.ceil(R * 2.4) + 4, cx = w / 2, fy = h - 2, by = fy - R * 0.62, rx = R, ry = R * 0.66;
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const INK = hex("#160c26"), BANDS = ["#7a6a7e", "#a596a8", "#cfc4d6", "#efe6ff"].map(hex), PINK = hex("#e88bb1"), WHITE = hex("#ffffff");
  const ell = (x, y, ex, ey, ax, ay, rot = 0) => { const dx = x - ex, dy = y - ey, c = Math.cos(rot), s = Math.sin(rot), p = (dx * c + dy * s) / ax, q = (-dx * s + dy * c) / ay; return p * p + q * q; };
  const ears = [[-0.42, -1.45, -0.35, 1], [0.42, -1.38, 0.35, 0.9]].map(([ex, ey, rot, k]) => [cx + ex * R, fy + ey * R * k + R * (1 - k) * 0.4, R * 0.2, R * 0.44 * k, rot]);
  const frame = blink => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), im = g.createImageData(w, h), px = im.data, col = new Array(w * h).fill(null);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = x + 0.5, Y = y + 0.5, nx = (X - cx) / rx, ny = (Y - by) / ry, a = Math.atan2(ny, nx);
      // the crown is fluffy: a few soft scallops along the top edge
      const fluff = ny < 0 ? 1 + 0.07 * Math.max(0, Math.sin(a * 9)) : 1;
      let inBody = nx * nx + ny * ny <= fluff * fluff && Y <= fy;
      if (inBody) {
        const l = -0.5 * nx - 0.8 * ny + 0.45 * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        col[y * w + x] = BANDS[l > 0.72 ? 3 : l > 0.2 ? 2 : l > -0.35 ? 1 : 0];
        continue;
      }
      for (const [ex, ey, ax, ay, rot] of ears) {
        const e = ell(X, Y, ex, ey, ax, ay, rot);
        if (e <= 1) { col[y * w + x] = e < 0.35 && Y < ey + ay * 0.3 ? PINK : BANDS[X < ex ? 3 : 2]; break; }
      }
    }
    // eyes (with a glint), shut in a line to blink, and pink cheeks
    const e = R >= 10 ? 2 : 1, ey = Math.round(by - R * 0.08), put = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (col[y * w + x]) col[y * w + x] = c; };
    for (const s of [-1, 1]) {
      const ex = Math.round(cx + s * R * 0.36 - e / 2);
      if (blink) for (let k = 0; k < e + 1; k++) put(ex + k, ey + e, INK);
      else { for (let k = 0; k < e; k++) for (let j = 0; j <= e; j++) put(ex + k, ey + j, INK); if (e > 1) put(ex + e - 1, ey, WHITE); }
      if (R >= 7) for (let k = 0; k < Math.max(1, Math.round(R * 0.12)); k++) put(ex + (s < 0 ? -1 - k : e + k), ey + e + 1, PINK);
    }
    put(cx - 0.5, ey + e + 1, INK);
    // the dark plum outline, on every side that touches the floor
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!col[p] && ((x > 0 && col[p - 1] && col[p - 1] !== INK) || (x < w - 1 && col[p + 1] && col[p + 1] !== INK) || (y > 0 && col[p - w] && col[p - w] !== INK) || (y < h - 1 && col[p + w] && col[p + w] !== INK))) col[p] = INK;
    }
    for (let p = 0; p < w * h; p++) if (col[p]) { const i = p * 4; px[i] = col[p][0]; px[i + 1] = col[p][1]; px[i + 2] = col[p][2]; px[i + 3] = 255; }
    g.putImageData(im, 0, 0);
    return c;
  };
  // a soft dark pool under it, darker in the middle, so it sits on the floor instead of floating over it
  const sh = document.createElement("canvas"); sh.width = w; sh.height = h;
  const sg = sh.getContext("2d");
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const q = ell(x + 0.5, y + 0.5, cx, fy, R * 1.12, R * 0.3);
    if (q <= 1) { sg.fillStyle = `rgba(11,6,20,${q < 0.45 ? 0.55 : 0.32})`; sg.fillRect(x, y, 1, 1); }
  }
  return { R, w, h, ax: cx, ay: fy, open: frame(false), shut: frame(true), shadow: sh };
}

function drawDust() {
  const spots = dustSpots();
  if (!spots.length) return;
  const R = Math.max(5, Math.round(spots[0].r / PX));
  if (dustArt.R !== R) Object.assign(dustArt, bakeDust(R));
  const A = dustArt, t = game.time, was = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (const { d, i, x, y } of spots) {
    // each one breathes (a one-pixel bob) and blinks on its own beat; a new one pops up out of its puff
    const ph = i * 1.7 + d[0] * 5, up = Math.sin(t * 0.0032 + ph) > 0.55 ? 1 : 0, blink = (t + ph * 900) % 3400 < 150;
    const born = dustBorn.get(d), k = born == null ? 1 : clamp((t - born) / 380, 0, 1), s = k >= 1 ? 1 : 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;
    if (k >= 1) dustBorn.delete(d);
    const ox = Math.round(x / PX) * PX - A.ax * PX, oy = Math.round(y / PX) * PX - A.ay * PX;
    ctx.drawImage(A.shadow, ox, oy, A.w * PX, A.h * PX);
    if (s === 1) ctx.drawImage(blink ? A.shut : A.open, ox, oy - up * PX, A.w * PX, A.h * PX);
    else if (s > 0) { const sw = A.w * PX * s, shh = A.h * PX * s; ctx.drawImage(A.open, Math.round(x - A.ax * PX * s), Math.round(y - A.ay * PX * s), sw, shh); }
  }
  ctx.imageSmoothingEnabled = was;
}

/** A little cloud of dust motes. */
function dustPuff(x, y, r, n) {
  for (let i = 0; i < n; i++) game.sparks.push({ x: x + rand(-1, 1) * r, y: y - rand(0, 0.9) * r, vx: rand(-45, 45), vy: rand(-55, -10), t: 0, life: rand(0.35, 0.75), s: rand(2, 4), color: pick(["#efe6ff", "#cfc4d6", "#a596a8"]) });
}
/** The awake glowling in this room nearest a spot, if anyone is. */
function nearestAwake(x, y) {
  let best = null, bd = Infinity;
  for (const a of actors.values()) { const cr = save.creatures.find(c => c.id === a.id); if (!cr || cr.sleeping || cr.out) continue; const dd = Math.hypot(a.x - x, a.y - y); if (dd < bd) { bd = dd; best = a; } }
  return best;
}

/** A dust bunny just landed: if you're in the nest to see it, it pops up out of a puff and the nearest glowling notices. */
function dustLanded(d) {
  if (game.scene !== "nest") return;
  updateTopbar();
  const s = dustSpots().find(q => q.d === d);
  if (!s) return;
  dustBorn.set(d, game.time);
  dustPuff(s.x, s.y - s.r * 0.4, s.r, 8);
  if (sfx.ready()) sfx.grain(sfx.ac.currentTime, 0.1, 1800, 0.7, 0.08);
  const a = nearestAwake(s.x, s.y);
  if (a) { emote(a, "!", 1.4); a.hop = 0.6; }
  setHint(nestHint());
}

/** A tap on a dust bunny sweeps it away: a puff, a shard, a cheer and a happier nest. */
function sweepDust(x, y) {
  const hit = dustSpots().find(s => Math.hypot(x - s.x, y - (s.y - s.r * 0.6)) < Math.max(s.r * 1.6, 22));
  if (!hit) return false;
  save.dust.splice(hit.i, 1);
  markTip("sweep");
  taskDone("sweep");
  for (const cr of residents(nestRoom())) if (!cr.sleeping) cr.joy = clamp(cr.joy + 4, 0, 100);
  save.shards += 1;
  dustPuff(hit.x, hit.y - hit.r * 0.5, hit.r * 1.2, 16);
  floatText("+1 ✦", hit.x, hit.y - hit.r * 2, "#fff0b5");
  const a = nearestAwake(hit.x, hit.y);
  if (a) setTimeout(() => { emote(a, "♥", 1.4); a.hop = 1; }, 250);
  sfx.tick();
  if (sfx.ready()) sfx.grain(sfx.ac.currentTime, 0.08, 3000, 0.6, 0.12);
  buzz(8);
  persist();
  updateTopbar();
  renderNest();
  return true;
}

// ---------- the Gloom's shadows: now and then a few seep into the nest, and you push them back with light ----------
// 1. Once a day at most, once a spark has been freed from the Gloom, never in a nest's very first session: a while into a calm
//    stay in the nest (everyone up, no dust, no talk, parcel or window, no shared egg, not rearranging), one to three wisps
//    of ink seep out of a crack in the back corner and from the ends of the walls, and drift slowly toward the glowlings.
// 2. The little ones close to them dim, look worried and huddle together. Nothing they have is taken from them.
// 3. Hold a finger on a wisp and your lantern shines on it: it shrinks, and lets go of the light hidden in it, a spark that
//    floats up. Glowlings near your light shine with you (a ring each, three at most), and each one makes it go faster.
// 4. All gone by your light: everyone perks up, "It's lighter now. Together.", a shard a wisp, keeper XP, Lamplighter.
// 5. Left alone, they thin out and drift off after a minute or so. Nothing is lost: the little ones just brighten again.
const GLOOM_WAIT = 40, GLOOM_LIFE = 60, GLOOM_SEEP = 1.8, GLOOM_FADE = 2.5, GLOOM_HELP = 3, GLOOM_RISE = 2.4;
const GLOOM_STEPS = [1, 0.84, 0.68, 0.52, 0.36], GLOOM_FRAMES = 6;
const gloomNow = {
  on: false, count: 0, calm: 0, tick: 0, held: false, heldT: 0, endT: 0, freed: 0, W: 0, H: 0, gx: 0, gy: 0, helpers: 0, chime: 0,
  wisps: [0, 1, 2].map(() => ({ on: false, x: 0, y: 0, t: 0, life: 0, hp: 1, k: 0, fade: 1, ph: 0, lit: 0 })),
  lights: [0, 1, 2].map(() => ({ on: false, x: 0, y: 0, t: 0 })),
  lamp: { on: false, x: 0, y: 0, k: 0 }, crack: { x: 0, y: 0, t: -1 }, spot: [0, 0],
};
const gloomArt = { R: 0, b: 0, P: 1 };
const crOf = id => { for (const c of save.creatures) if (c.id === id) return c; return null; };
const gloomAlt = () => N.base * 0.42; // how high a wisp floats over the floor
const gloomR = w => gloomArt.R * gloomArt.P * w.k;
/** Whether the shadows may come today: a spark freed from the Gloom, not a nest's first session, not yet today. */
const gloomDue = () => cnt("rescued") > 0 && !startedEmpty && tipDone("pet") && save.gloom?.day !== dayKey();
/** Something over the nest (a dialog, a window, a parcel): the shadows wait where they are. */
const gloomHeld = () => !!(talkNow || talkQueue.length || giftNow || $$(".overlay").some(o => !o.classList.contains("hidden")));
/** A calm moment in the nest: everyone home is awake, the floor is swept, nothing else is going on. */
function gloomCalm() {
  const nest = nestRoom();
  if (game.scene !== "nest" || save.room !== nest || document.hidden || coopSession || game.coopTouched || arrange.on || pointer || gloomHeld()) return false;
  if ((save.dust || []).length || !actors.size) return false;
  const home = residents(nest);
  return home.length > 0 && !home.some(c => c.sleeping);
}
/** A point on the floor (0..1 each way) onto an object's x and y. */
function gloomFloor(o, u, v) {
  if (N.iso) { o.x = N.cx + (u - v) * N.isoW; o.y = N.isoTop + (u + v) * N.isoH; }
  else { o.x = lerp(N.x0, N.x1, u); o.y = lerp(N.y0, N.y1, v); }
}
/** Keep a wisp over the floor. */
function gloomKeep(w) {
  if (!N.iso) { w.x = clamp(w.x, N.x0, N.x1); w.y = clamp(w.y, N.y0, N.y1); return; }
  const a = (w.x - N.cx) / N.isoW, b = (w.y - N.isoTop) / N.isoH;
  gloomFloor(w, clamp((a + b) / 2, 0.04, 0.96), clamp((b - a) / 2, 0.04, 0.96));
}
/** The awake glowling nearest a spot (no lists made: this runs every frame). */
function gloomNearest(x, y) {
  let best = null, bd = Infinity;
  for (const a of actors.values()) { const cr = crOf(a.id); if (!cr || cr.sleeping || cr.out) continue; const d = Math.hypot(a.x - x, a.y - y); if (d < bd) { bd = d; best = a; } }
  return best;
}

/** In they seep: one to three wisps, a breath apart, from a crack in the back corner and from the ends of the walls. */
function gloomCome() {
  if (gloomNow.on || !gloomCalm()) return false;
  save.gloom = { day: dayKey() };
  persist();
  const g = gloomNow;
  Object.assign(g, { on: true, endT: 0, freed: 0, helpers: 0, held: false, heldT: 0.5, W, H });
  // the little ones huddle at the front of the room, away from where the shadows come in
  const huddle = { x: 0, y: 0 };
  gloomFloor(huddle, N.iso ? 0.66 : 0.5, N.iso ? 0.66 : 0.78);
  g.gx = huddle.x; g.gy = huddle.y;
  const count = g.count = 1 + (Math.random() < 0.65 ? 1 : 0) + (Math.random() < 0.35 ? 1 : 0);
  // (in floor coordinates, a little way in: the crack, then the left end and the right end of the walls)
  const from = N.iso ? [[0.05, 0.05], [0.06, 0.86], [0.86, 0.06]] : [[0.5, 0.03], [0.04, 0.25], [0.96, 0.25]];
  g.wisps.forEach((w, i) => {
    w.on = i < count;
    gloomFloor(w, ...from[i]);
    Object.assign(w, { t: -i * 1.2, life: GLOOM_LIFE + rand(-6, 6), hp: 1, k: 0, fade: 1, ph: rand(0, TAU), lit: 0 });
  });
  gloomFloor(g.crack, 0, 0);
  if (!N.iso) gloomFloor(g.crack, 0.5, 0);
  g.crack.t = 0;
  if (sfx.ready()) { const t = sfx.ac.currentTime; sfx.grain(t, 1.4, 160, 0.6, 0.14, "lowpass"); sfx.tone(t, 98, 0.04, 1.6, "sine", 82); }
  // the one nearest the crack notices first
  const a = gloomNearest(g.wisps[0].x, g.wisps[0].y);
  if (a) { emote(a, "!", 1.4); a.hop = 0.6; }
  setHint(nestHint());
  return true;
}

function updateGloom(dt) {
  const g = gloomNow, b = N.base, lamp = g.lamp, alt = gloomAlt();
  for (const l of g.lights) if (l.on && (l.t += dt) > GLOOM_RISE) l.on = false;
  if (!g.on) {
    // the little ones' light comes back by itself
    for (const a of actors.values()) if (a.gloomK > 0.001 || a.gloomLit > 0.001) { a.gloomK *= Math.exp(-dt * 1.5); a.gloomLit *= Math.exp(-dt * 3); }
    if (game.scene !== "nest" || (g.tick += dt) < 5) return;
    const waited = g.tick;
    g.tick = 0;
    if (!gloomDue() || !gloomCalm()) return;
    g.calm += waited;
    if (g.calm >= GLOOM_WAIT && Math.random() < 0.125) gloomCome();
    return;
  }
  // out of the nest, rearranging it, a shared egg, a new screen size: they're simply gone, and nothing is lost
  if (game.scene !== "nest" || save.room !== nestRoom() || arrange.on || coopSession || W !== g.W || H !== g.H) { gloomEnd(false); return; }
  // a dialog or a window over the nest: everything waits
  if ((g.heldT -= dt) <= 0) { g.heldT = 0.5; g.held = gloomHeld(); }
  if (g.held) { lamp.on = false; lamp.k = 0; return; }
  lamp.k = clamp(lamp.k + (lamp.on ? dt * 6 : -dt * 4), 0, 1);
  if (g.crack.t >= 0) g.crack.t += dt;
  // who's close by dims; who's close to your light shines with you
  let helpers = 0;
  for (const a of actors.values()) {
    const cr = crOf(a.id), awake = !!cr && !cr.sleeping;
    let near = 0;
    for (const w of g.wisps) if (w.on && w.t > 0) near = Math.max(near, clamp((2.6 * b - Math.hypot(a.x - w.x, (a.y - w.y) * 1.4)) / (1.6 * b), 0, 1) * w.k * w.fade);
    const helping = awake && lamp.on && helpers < GLOOM_HELP && Math.hypot(a.x - lamp.x, (a.y - lamp.y - alt) * 1.4) < b * 2;
    if (helping) { helpers++; if (!a.gloomHelp) { a.gloomHelp = true; emote(a, "✦", 1); a.hop = 0.8; } }
    else a.gloomHelp = false;
    a.gloomK = lerp(a.gloomK || 0, awake ? near : 0, Math.min(1, dt * 2.5));
    a.gloomLit = lerp(a.gloomLit || 0, helping ? 1 : 0, Math.min(1, dt * 5));
  }
  g.helpers = helpers;
  // the wisps: seep in, drift toward the little ones, give way to the light
  // (a whole core makes your light a little stronger: see inner.js)
  const drain = (0.28 + 0.2 * helpers) * (coreGift("shine") ? 1.25 : 1);
  let left = 0, lit = false;
  for (const w of g.wisps) {
    if (!w.on) continue;
    left++;
    if ((w.t += dt) < 0) continue;
    w.ph += dt;
    const grow = clamp(w.t / GLOOM_SEEP, 0, 1);
    if (w.t > w.life && (w.fade -= dt / GLOOM_FADE) <= 0) { w.on = false; continue; }
    const lx = lamp.x - w.x, ly = lamp.y - (w.y - alt), ld = Math.hypot(lx, ly);
    w.lit = lamp.on && lamp.k > 0.5 && ld < b * 0.9 + gloomR(w) ? Math.min(1, w.lit + dt * 6) : Math.max(0, w.lit - dt * 4);
    if (w.lit > 0.5) {
      lit = true;
      if ((w.hp -= drain * dt) <= 0) { gloomFree(w); continue; }
      // it gives way, backing off from the light
      if (ld > 1) { w.x -= lx / ld * b * 0.3 * dt; w.y -= ly / ld * b * 0.15 * dt; }
    } else if (grow >= 1) {
      // slowly toward the nearest little one, but never quite onto it
      const a = gloomNearest(w.x, w.y);
      if (a) { const dx = a.x - w.x, dy = a.y - w.y, d = Math.hypot(dx, dy); if (d > b * 1.25) { const s = b * 0.17 * dt / d; w.x += dx * s; w.y += dy * s; } }
    }
    w.x += Math.cos(w.ph * 0.9) * b * 0.06 * dt;
    gloomKeep(w);
    w.k = grow * (GLOOM_STEPS[4] + (1 - GLOOM_STEPS[4]) * Math.max(0, w.hp));
  }
  // a soft high note now and then while the light is on one
  if (lit && (g.chime -= dt) <= 0) { g.chime = 0.38; if (sfx.ready()) sfx.tone(sfx.ac.currentTime, rand(1500, 2100), 0.012, 0.35, "sine", null, true); }
  if (!left && (g.endT += dt) > 0.8) gloomEnd(true);
}

/** A wisp lets go: the light hidden in it floats up, a shard for you, and the nearest little one cheers. */
function gloomFree(w) {
  const g = gloomNow, x = w.x, y = w.y - gloomAlt(), r = Math.max(gloomR(w), 8);
  w.on = false; g.freed++;
  const l = g.lights.find(q => !q.on);
  if (l) Object.assign(l, { on: true, x, y, t: 0 });
  for (let i = 0; i < 14; i++) {
    const an = rand(0, TAU), v = rand(30, 110);
    game.sparks.push({ x: x + Math.cos(an) * r * 0.5, y: y + Math.sin(an) * r * 0.5, vx: Math.cos(an) * v, vy: Math.sin(an) * v - 50, t: 0, life: rand(0.5, 1), s: rand(2, 4), color: pick(["#2e1d4f", "#523a85", "#8a6cc9", "#d2bfff", "#fff0b5"]) });
  }
  save.shards += 1;
  floatText("+1 ✦", x, y - r * 1.4, "#fff0b5");
  if (sfx.ready()) { const t = sfx.ac.currentTime; sfx.tone(t, 523.25, 0.05, 1.2, "sine", 1046.5, true); sfx.tone(t + 0.12, 1568, 0.03, 0.9, "sine", null, true); sfx.grain(t, 0.3, 2400, 0.8, 0.04); }
  const a = gloomNearest(x, w.y);
  if (a) { emote(a, "✦", 1.2); a.hop = 1; }
  buzz(10);
  persist();
  updateTopbar();
}

/** The visit is over. Pushed back by your light: everyone perks up, a warm word, keeper XP. Gone by itself: just quiet. */
function gloomEnd(seen) {
  const g = gloomNow, freed = g.freed;
  g.on = false; g.endT = 0; g.calm = 0; g.freed = 0; g.lamp.on = false; g.crack.t = -1;
  for (const w of g.wisps) w.on = false;
  if (seen && freed) {
    bump("lamplit");
    for (const cr of residents(nestRoom())) if (!cr.sleeping) cr.joy = clamp(cr.joy + 5, 0, 100);
    for (const a of actors.values()) { const cr = crOf(a.id); if (cr && !cr.sleeping) { a.hop = 1; emote(a, a.id % 2 ? "♥" : "✦", 1.8); } }
    toast(tr("It's lighter now. Together."));
    if (sfx.ready()) { const t = sfx.ac.currentTime; [659.25, 783.99, 1046.5].forEach((f, i) => sfx.tone(t + i * 0.13, f, 0.05, 1.4, "sine", null, true)); }
    persist();
    updateTopbar();
    checkAwards();
    // the first time, Mossa has a word about what they are
    if (cnt("lamplit") === 1) setTimeout(() => { if (game.scene === "nest") talk("lamp1"); }, 1500);
  }
  if (game.scene === "nest") { setHint(nestHint()); renderNest(); }
}

/** Where the huddle is for a glowling: around your light while it shines, else close together where they were. */
function gloomHuddle(a) {
  const g = gloomNow;
  if (!g.on || g.held) return null;
  let any = false;
  for (const w of g.wisps) if (w.on && w.t > 0) any = true;
  if (!any) return null;
  const lamp = g.lamp, on = lamp.on && lamp.k > 0.3, an = a.id * 2.4, r = N.base * (on ? 0.95 : 0.6);
  g.spot[0] = (on ? lamp.x : g.gx) + Math.cos(an) * r;
  g.spot[1] = clamp((on ? lamp.y + gloomAlt() : g.gy) + Math.sin(an) * r * 0.5, N.y0, N.y1);
  return g.spot;
}

/** A finger on a wisp lights your lantern there: a tap is a quick flash, holding keeps it shining and it follows your finger. */
function lanternDown(x, y) {
  const g = gloomNow;
  if (!g.on || g.held) return false;
  const alt = gloomAlt();
  let hit = null;
  for (const w of g.wisps) if (w.on && w.t > 0.3 && Math.hypot(x - w.x, y - (w.y - alt)) < Math.max(gloomR(w) * 1.8, 30)) hit = w;
  if (!hit) return false;
  Object.assign(g.lamp, { on: true, x, y });
  hit.lit = 1;
  if ((hit.hp -= 0.15) <= 0) gloomFree(hit);
  markTip("lantern");
  if (sfx.ready()) sfx.tone(sfx.ac.currentTime, 1318.5, 0.03, 0.5, "sine", null, true);
  return true;
}
function lanternMove(x, y) { gloomNow.lamp.x = x; gloomNow.lamp.y = y; }
function lanternUp() { gloomNow.lamp.on = false; }

// Mossa's word the first time, about what the shadows are
Object.assign(TALKS, {
  lamp1: () => [[MOSSA, "Those shadows creep up from the deep sometimes, even into a warm nest."],
    [MOSSA, "Don't be cross with them. They're only light that hid away from hurting."],
    [MOSSA, "Shine on them together, and the light remembers the way out."]],
});

/**
 * The wisps in art pixels, painted once per size: a blob of ink (soft metaballs, a lobe or two and a tail of drips that sways
 * from frame to frame), nearly black with a faint sheen up top, a one-pixel plum rim, and the light hidden inside it: a violet
 * heart and a few sparks that twinkle. Five sizes for shrinking (crisp, never scaled), six frames each, and a shadow.
 */
function bakeGloom(R) {
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const INK = hex("#0b0614"), INK2 = hex("#160c26"), RIM = hex("#5c1f3f"), V1 = hex("#3d2866"), V2 = hex("#8a6cc9"), V3 = hex("#d2bfff");
  const paint = (w, h, col) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), im = g.createImageData(w, h), px = im.data;
    for (let p = 0; p < w * h; p++) if (col[p]) { const i = p * 4; px[i] = col[p][0]; px[i + 1] = col[p][1]; px[i + 2] = col[p][2]; px[i + 3] = col[p][3] ?? 255; }
    g.putImageData(im, 0, 0);
    return c;
  };
  const steps = GLOOM_STEPS.map(s => {
    const r = Math.max(2.5, R * s), w = Math.ceil(r * 3) + 4, cy = Math.ceil(r * 1.6) + 2, h = Math.ceil(cy + r * 2.15) + 2, cx = w / 2;
    const frames = [];
    for (let f = 0; f < GLOOM_FRAMES; f++) {
      const p = f / GLOOM_FRAMES * TAU;
      // a round middle and two soft lobes; a curl of smoke rising off the top; three drips hanging below, each on its own sway
      const balls = [[0, 0, 0.78], [-0.54, 0.16 + Math.cos(p) * 0.08, 0.42], [0.53, 0.06 - Math.cos(p) * 0.08, 0.4],
        [-0.28 + Math.sin(p) * 0.1, -0.68, 0.38], [-0.02 + Math.sin(p + 0.8) * 0.2, -1.1, 0.23], [0.2 + Math.sin(p + 1.6) * 0.28, -1.4, 0.12],
        [-0.45 + Math.sin(p + 1) * 0.06, 0.82, 0.24], [0.05 + Math.sin(p + 2.1) * 0.08, 0.98, 0.27], [0.48 + Math.sin(p + 3.2) * 0.06, 0.8, 0.2],
        [-0.42 + Math.sin(p + 1.5) * 0.14, 1.28, 0.13], [0.1 + Math.sin(p + 2.6) * 0.16, 1.45, 0.16], [0.06 + Math.sin(p + 3.3) * 0.22, 1.86, 0.09]];
      const col = new Array(w * h).fill(null), body = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const X = (x + 0.5 - cx) / r, Y = (y + 0.5 - cy) / r;
        // soft blobs that reach only a little past their edge: necks of ink where two come close, the drips and the curl apart
        let F = 0;
        for (const [bx, by, br] of balls) { const q = 1 - ((X - bx) ** 2 + (Y - by) ** 2) / (br * br * 2.56); if (q > 0) F += q * q; }
        if (F < 0.37) continue;
        body[y * w + x] = 1;
        // ink, a shade less black where it bulges up toward the light
        col[y * w + x] = -0.5 * X - 0.85 * Y > 0.4 && F > 0.6 ? INK2 : INK;
      }
      // the light inside: a dim violet heart, a brighter middle, and sparks that come and go
      const put = (x, y, c) => { x = Math.round(x); y = Math.round(y); const q = y * w + x; if (x > 0 && y > 0 && x < w - 1 && y < h - 1 && body[q] && body[q - 1] && body[q + 1] && body[q - w] && body[q + w]) col[q] = c; };
      const hr = Math.max(1, Math.round(r * 0.2));
      for (let j = -hr; j <= hr; j++) for (let i = -hr; i <= hr; i++) if (Math.abs(i) + Math.abs(j) <= hr) put(cx - 0.5 + i, cy + r * 0.15 + j, !i && !j ? V2 : V1);
      for (let k = 0; k < 3; k++) {
        const an = k * 2.1 + f * 0.95, d = r * (0.42 + 0.16 * ((k + f) % 2)), sx = cx - 0.5 + Math.cos(an) * d, sy = cy + Math.sin(an) * d * 0.8, on = (k + f) % 3;
        if (!on) continue;
        put(sx, sy, on === 2 ? V3 : V2);
        if (on === 2 && r >= 8) { put(sx - 1, sy, V1); put(sx + 1, sy, V1); put(sx, sy - 1, V1); put(sx, sy + 1, V1); }
      }
      // the plum rim, one pixel all round
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const q = y * w + x;
        if (!body[q] && ((x > 0 && body[q - 1]) || (x < w - 1 && body[q + 1]) || (y > 0 && body[q - w]) || (y < h - 1 && body[q + w]))) col[q] = RIM;
      }
      frames.push(paint(w, h, col));
    }
    return { w, h, ax: cx, ay: cy, frames };
  });
  // a dithered pool of dark on the floor under it
  const sw = Math.ceil(R * 2.6) + 2, sh = Math.ceil(R * 0.8) + 2, scol = new Array(sw * sh).fill(null), SH = [11, 6, 20, 120];
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const nx = (x + 0.5 - sw / 2) / (R * 1.25), ny = (y + 0.5 - sh / 2) / (R * 0.38), q = 1 - nx * nx - ny * ny;
    if (q > PX_BAYER[(y & 3) * 4 + (x & 3)] * 0.8) scol[y * sw + x] = SH;
  }
  return { R, steps, shadow: { c: paint(sw, sh, scol), w: sw, h: sh } };
}

/** The crack the shadows come out of: a jagged split up the wall with violet light in it. And your lantern, and its cone of light. */
function bakeGloomBits(b, P) {
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255];
  const paint = (w, h, col) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), im = g.createImageData(w, h), px = im.data;
    for (let p = 0; p < w * h; p++) if (col[p]) { const i = p * 4; px[i] = col[p][0]; px[i + 1] = col[p][1]; px[i + 2] = col[p][2]; px[i + 3] = col[p][3]; }
    g.putImageData(im, 0, 0);
    return c;
  };
  // the crack, from the floor up
  const ch = Math.max(14, Math.round(b * 1.05 / P)), cw = 13, ccol = new Array(cw * ch).fill(null);
  const INK = hex("#0b0614"), V1 = hex("#523a85"), V2 = hex("#8a6cc9"), V3 = hex("#d2bfff"), HAZE = [82, 58, 133, 110];
  const set = (x, y, c, over) => { if (x >= 0 && y >= 0 && x < cw && y < ch && (over || !ccol[y * cw + x])) ccol[y * cw + x] = c; };
  const line = [];
  for (let y = ch - 1; y >= 0; y--) {
    const up = 1 - y / ch, x = Math.round(cw / 2 - 0.5 + Math.sin(y * 0.55) * 1.3 + Math.sin(y * 1.7 + 1) * 0.7), wide = up < 0.35 ? 2 : 1;
    if (up > 0.92) break;
    line.push([x, y, wide]);
  }
  const fork = Math.floor(line.length * 0.45);
  for (let i = 0; i < Math.min(5, line.length - fork); i++) line.push([line[fork][0] + 1 + i, line[fork][1] - i, 1]);
  for (const [x, y] of line) for (let j = -2; j <= 2; j++) for (let i = -2; i <= 3; i++) if (PX_BAYER[((y + j) & 3) * 4 + ((x + i) & 3)] < 0.35) set(x + i, y + j, HAZE);
  for (const [x, y, wide] of line) { set(x - 1, y, INK, true); set(x + wide, y, INK, true); }
  line.forEach(([x, y, wide], i) => { for (let k = 0; k < wide; k++) set(x + k, y, i % 5 === 2 ? V3 : wide > 1 && k ? V1 : V2, true); });
  // the lantern: the little icon's picture, with a dark outline
  const map = PX_ICON_MAPS.lantern, S = map.length + 2, lcol = new Array(S * S).fill(null), ink = hex("#160c26");
  map.forEach((row, y) => [...row].forEach((c, x) => { if (PX_ICON_COLORS[c]) lcol[(y + 1) * S + x + 1] = hex(PX_ICON_COLORS[c]); }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const q = y * S + x;
    if (!lcol[q] && ((x > 0 && lcol[q - 1] && lcol[q - 1] !== ink) || (x < S - 1 && lcol[q + 1] && lcol[q + 1] !== ink) || (y > 0 && lcol[q - S] && lcol[q - S] !== ink) || (y < S - 1 && lcol[q + S] && lcol[q + S] !== ink))) lcol[q] = ink;
  }
  // the cone: from the lantern down to a pool of warm light where your finger is, dithered in three warm bands
  const top = 2, hc = Math.round(b * 1.2 / P), rx = Math.round(b * 0.95 / P), ry = Math.round(b * 0.42 / P), ow = rx * 2 + 2, oh = hc + ry + 2;
  const ocol = new Array(ow * oh).fill(null), W1 = hex("#fff0b5"), W2 = hex("#eec26a"), W3 = hex("#c98f3a");
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const dx = x + 0.5 - ow / 2, ex = dx / rx, ey = (y + 0.5 - hc) / ry, q = ex * ex + ey * ey;
    let I = q < 1 ? 0.62 * (1 - q) + 0.12 : 0;
    const k = (y - top) / (hc - top), hw = Math.max(1, rx * 0.85 * k);
    if (k > 0 && k <= 1.05 && Math.abs(dx) < hw) I = Math.max(I, (1 - Math.abs(dx) / hw) * (0.5 + 0.35 * k));
    if (I > PX_BAYER[(y & 3) * 4 + (x & 3)] * 0.85 + 0.06) ocol[y * ow + x] = I > 0.72 ? W1 : I > 0.42 ? W2 : W3;
  }
  return { b, crack: { c: paint(cw, ch, ccol), w: cw, h: ch }, lamp: { c: paint(S, S, lcol), s: S, m: Math.max(1, Math.round(b * 0.42 / (S * P))) }, cone: { c: paint(ow, oh, ocol), w: ow, h: oh, py: hc } };
}

/** The pictures, painted for this screen: their art pixels are never finer than two screen pixels, so they read as pixel art. */
function gloomArtNow() {
  const A = gloomArt, P = A.P = PX * Math.max(1, Math.round(2 / PX)), R = Math.max(4, Math.round(N.base * 0.28 / P));
  if (A.R !== R || A.px !== P) Object.assign(A, bakeGloom(R), { px: P });
  if (A.b !== N.base || A.bpx !== P) Object.assign(A, bakeGloomBits(N.base, P), { bpx: P });
  return A;
}
const gloomStep = k => { let s = 0; for (let i = 1; i < GLOOM_STEPS.length; i++) if (Math.abs(GLOOM_STEPS[i] - k) < Math.abs(GLOOM_STEPS[s] - k)) s = i; return s; };

/** Under everything in the room: the crack in the wall, the wisps' shadows on the floor, the rings of those who shine with you. */
function drawGloomUnder() {
  const g = gloomNow;
  if (!g.on && !actors.size) return;
  let any = false;
  for (const a of actors.values()) if (a.gloomLit > 0.05) any = true;
  if (!g.on && !any) return;
  const A = gloomArtNow(), P = A.P, was = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (g.on && g.crack.t >= 0) {
    // it opens as they come, and closes once the last is through
    const last = GLOOM_SEEP + 1.2 * (g.count - 1) + 1.5, t = g.crack.t;
    const k = t < 0.6 ? t / 0.6 : t < last ? 1 : Math.max(0, 1 - (t - last) / 1.5);
    if (k > 0) {
      const C = A.crack, x = Math.round(g.crack.x / P) * P - Math.floor(C.w / 2) * P, y = Math.round((N.iso ? N.isoTop : N.back) / P) * P - C.h * P;
      ctx.globalAlpha = k;
      ctx.drawImage(C.c, x, y, C.w * P, C.h * P);
    }
  }
  if (g.on) for (const w of g.wisps) {
    if (!w.on || w.t <= 0) continue;
    const S = A.shadow;
    ctx.globalAlpha = w.fade * clamp(w.k / GLOOM_STEPS[4], 0, 1) * 0.9;
    ctx.drawImage(S.c, Math.round(w.x / P - S.w / 2) * P, Math.round(w.y / P - S.h / 2) * P, S.w * P, S.h * P);
  }
  // each glowling that shines with you: a warm ring at its feet, and one that keeps spreading out from it toward the dark
  ctx.strokeStyle = "#ffe9a8"; ctx.lineWidth = 2;
  for (const a of actors.values()) {
    const k = a.gloomLit || 0;
    if (k < 0.05) continue;
    const size = N.base * depth(a.y), cy = a.y - size * 0.45 - a.alt - (a.perch || 0), beat = ((game.time + a.id * 300) % 900) / 900;
    ctx.globalAlpha = k * (0.55 + 0.25 * Math.sin(game.time * 0.008));
    ctx.beginPath(); ctx.ellipse(a.x, a.y - (a.perch || 0), size * 0.52, size * 0.15, 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = k * 0.5 * (1 - beat);
    ctx.beginPath(); ctx.arc(a.x, cy, size * (0.5 + 0.55 * beat), 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = was;
}

/** Over the room: the wisps, your lantern and its light, and the freed sparks floating up. */
function drawGloomOver() {
  const g = gloomNow;
  let rising = false;
  for (const l of g.lights) if (l.on) rising = true;
  if (!g.on && !rising) return;
  const A = gloomArtNow(), P = A.P, alt = gloomAlt(), was = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (g.on) for (const w of g.wisps) {
    if (!w.on || w.t <= 0 || w.k <= 0) continue;
    const s = gloomStep(w.k), St = A.steps[s], fr = St.frames[Math.floor(w.ph * 7) % GLOOM_FRAMES];
    // it floats with a slow bob, and trembles while the light is on it
    const bob = Math.round(Math.sin(w.ph * 2.1) * 1.5), shake = w.lit > 0.5 ? (Math.floor(w.ph * 20) % 2 ? 1 : -1) : 0;
    const x = (Math.round(w.x / P) + shake - St.ax) * P, y = (Math.round((w.y - alt) / P) + bob - St.ay) * P;
    ctx.globalAlpha = w.fade * clamp(w.k / GLOOM_STEPS[4], 0, 1);
    ctx.drawImage(fr, x, y, St.w * P, St.h * P);
    // lit: the light inside it answers (the same picture laid over itself, lighter: the dark stays dark, the violet glows)
    if (w.lit > 0.05) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = w.lit * 0.8 * w.fade; ctx.drawImage(fr, x, y, St.w * P, St.h * P); ctx.globalCompositeOperation = "source-over"; }
  }
  // your lantern, held up over your finger, and its cone of warm light down onto the dark
  const lamp = g.lamp;
  if (g.on && lamp.k > 0) {
    const C = A.cone, L = A.lamp, sway = Math.round(Math.sin(game.time * 0.004) * 1);
    const cx = Math.round(lamp.x / P), cy = Math.round(lamp.y / P);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = lamp.k * (0.42 + 0.06 * Math.sin(game.time * 0.011) + 0.05 * g.helpers);
    ctx.drawImage(C.c, (cx - Math.floor(C.w / 2)) * P, (cy - C.py) * P, C.w * P, C.h * P);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = lamp.k;
    ctx.drawImage(L.c, (cx - Math.floor(L.s * L.m / 2) + sway) * P, (cy - C.py - (L.s - 3) * L.m) * P, L.s * L.m * P, L.s * L.m * P);
  }
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = was;
  // the light that was hidden in a wisp, free again: it floats up, sways, and goes out softly
  ctx.save();
  ctx.shadowBlur = quality.low ? 0 : 10;
  for (const l of g.lights) {
    if (!l.on) continue;
    const k = l.t / GLOOM_RISE, x = l.x + Math.sin(l.t * 3) * 6, y = l.y - (1 - (1 - k) * (1 - k)) * N.base * 1.7;
    ctx.globalAlpha = k < 0.75 ? 1 : (1 - k) / 0.25;
    ctx.fillStyle = ctx.shadowColor = "#d2bfff";
    sparklePath(ctx, x - Math.sin(l.t * 3 - 0.6) * 4, y + 9, 2.5); ctx.fill();
    ctx.fillStyle = ctx.shadowColor = "#fff0b5";
    sparklePath(ctx, x, y, 6 - k * 2); ctx.fill();
  }
  ctx.restore();
}

function drawNest() {
  // furniture and glowlings share one back-to-front order, so a glowling behind the bookcase is hidden by it
  const items = drawRoom() || [];
  drawPassages();
  drawDust();
  drawGloomUnder();
  // whoever lies on the bed or sits on a piece is drawn right after it (on top), not by where their feet are
  const frontOf = id => { const p = N.iso && isoLayout().placed[id]; return p ? isoAt((p.i + p.fw) / ISO_G, (p.j + p.fd) / ISO_G)[1] : null; };
  for (const a of actors.values()) {
    // (asleep on the floor beside a full bed: drawn where it lies, like anyone else on the floor)
    const on = (a.state === "sleep" || a.state === "toBed") && (!N.iso || a.onBed) ? frontOf("bed") : N.iso && a.state === "nap" && a.decor === "cushion" ? 1e6 : (a.state === "nap" || a.state === "visit") && a.decor ? frontOf(a.decor) : null;
    const item = { y: on != null && a.state !== "toBed" ? on + 0.5 : a.y + 0.5, draw: () => drawActor(a), actor: a };
    if (N.iso) {
      const [u, v] = isoFrom(a.x, a.y);
      item.box = { u0: u * ISO_G, u1: u * ISO_G, v0: v * ISO_G, v1: v * ISO_G };
      // lying on the bed, napping on the cloud or sitting on the swing or a piece: drawn right after it
      item.after = a.onBed ? "bed" : a.state === "nap" && a.decor === "cushion" ? "cushion" : (a.state === "visit" || a.state === "nap") && a.decor ? a.decor : null;
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
  drawGloomOver();
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
  // near the Gloom's shadows a glowling dims and looks worried; shining with your light, it brightens and cheers up (see updateGloom)
  const gk = asleep ? 0 : a.gloomK || 0, lit = a.gloomLit || 0;
  const mood = asleep ? "asleep" : mine && game.nest.petting ? "joy" : a.state === "dance" || a.state === "visit" || lit > 0.5 || (a.emote && a.emote.text === "♥") ? "happy" : gk > 0.35 ? "sad" : moodOf(cr);
  // only a truly tired one (not just a bit low) looks sleepy-eyed; a little moment's face while it rests; older ones hop lower
  return { acc: cr.acc, level: cr.level, shiny: cr.shiny, mood, cap: a.state === "sleep", hop: a.hop, hopK: calmOf(cr.level).hop * 0.75, eating: a.state === "eat", t: game.time + a.id * 997, glowK: (mine ? 0.7 : 0.35) * (1 - gk * 0.7) + lit * 0.7,
    tired: cr.energy < 12, face: faceNow(a), dim: gk * 0.6 * (1 - lit) };
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
    else if (a.face && a.face.kind === "think") {
      // thinking: little dots rising one by one beside its head, on the side it's looking
      ctx.fillStyle = "#efe6ff";
      for (let i = 0; i < Math.min(3, Math.floor(a.face.t / 0.4) + 1); i++) {
        const r = Math.max(1, Math.round(v.size * (0.03 + i * 0.015) / PX)) * PX;
        ctx.fillRect(Math.round((v.x + a.face.side * v.size * (0.36 + i * 0.12)) / PX) * PX, Math.round((v.y - v.size * (0.5 + i * 0.14)) / PX) * PX, r, r);
      }
    }
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
  pressProp("incubator");
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
  propCue("incubator", incubatorPod(x, y, b));
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
