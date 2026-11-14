"use strict";
// Hatchstone · the simulation, drawing every frame, the start plate and Telegram.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- simulation ----------

const GRAVITY = 900;
let nestTick = 0;

function update(dt) {
  game.time += dt * 1000;
  for (const m of motes) { m.y -= m.vy * dt; if (m.y < -4) { m.y = H + 4; m.x = rand(0, W); } }
  updateEventMotes(dt);

  const e = game.egg;
  if (game.scene === "crack" && e) {
    const guestOwned = coopIsGuest();
    if (!guestOwned) {
      e.t += dt;
      if (e.state === "entering" && !e.thudded && e.t > 0.32) { e.thudded = true; sfx.thud(); }
      if (e.state === "entering" && e.t >= 0.9) { e.state = "cracking"; e.t = 0; }
    }
    e.wobT += dt;
    e.squash = Math.max(0, e.squash - dt * 6);
    if (!guestOwned && e.state === "opening") {
      e.open = Math.min(1, e.t / 1.1);
      if (!e.cooed && e.t > 0.55) { e.cooed = true; sfx.chirp(e.species.voice); }
      if (e.t > 1.6) startPolish();
    }
    if (!guestOwned && e.state === "gleam" && e.t > 1.1) { e.state = "open"; e.t = 0; showFound(); }
    e.hop = Math.max(0, e.hop - dt * 2.5);
    coopBroadcast();
  }

  if (game.scene === "nest") {
    const n = game.nest;
    updateActors(dt);
    updateWeather(dt);
    musicNotes(dt);
    swingPush *= Math.exp(-0.35 * dt);
    if (n.snack) {
      const a = activeActor();
      if (a) { const v = actorView(a); n.snack.x = v.x; n.snack.ty = v.y; }
      n.snack.vy += GRAVITY * dt; n.snack.y += n.snack.vy * dt;
      if (n.snack.y >= n.snack.ty) { const sn = n.snack; n.snack = null; finishSnack(sn); }
    }
    // needs are worked out from time stamps, so the per-second refresh only redraws (saving here would make tabs fight)
    if ((nestTick += dt) > 1 && activeCreature()) { nestTick = 0; renderNest(); }
  }
  if (game.scene === "catch") updateCatch(dt);
  if (game.scene === "echo") updateEcho(dt);

  const drag = Math.exp(-1.5 * dt);
  for (const p of game.pieces) {
    p.t += dt; p.vy += GRAVITY * dt; p.vx *= drag;
    p.dx += p.vx * dt; p.dy += p.vy * dt; p.rot += p.vrot * dt;
  }
  game.pieces = game.pieces.filter(p => p.t < 2.2);
  for (const c of game.chips) {
    c.t += dt; c.vy += GRAVITY * dt; c.vx *= drag;
    c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vrot * dt;
    if (c.y > c.floor && c.vy > 0) { c.y = c.floor; c.vy *= -0.3; c.vx *= 0.5; c.vrot *= 0.4; }
  }
  game.chips = game.chips.filter(c => c.t < c.life);
  const sparkDrag = Math.exp(-1.8 * dt);
  for (const s of game.sparks) { s.t += dt; s.vy += 160 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= sparkDrag; }
  game.sparks = game.sparks.filter(s => s.t < s.life);
  for (const h of game.hearts) { h.t += dt; h.x += h.vx * dt; h.y += h.vy * dt; }
  game.hearts = game.hearts.filter(h => h.t < h.life);
  for (const f of game.floaters) f.t += dt;
  game.floaters = game.floaters.filter(f => f.t < 1.2);
  for (const g of game.glints) g.t += dt;
  game.glints = game.glints.filter(g => g.t < 0.8);
  const now = performance.now();
  game.trail = game.trail.filter(p => now - p.t < 220);
  for (const r of game.ripples) r.t += dt;
  game.ripples = game.ripples.filter(r => r.t < 0.6);
  for (const p of game.pops) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; }
  game.pops = game.pops.filter(p => p.t < p.life);
  for (const g of game.gems) {
    g.t += dt;
    if (g.t < 0) continue;
    if (g.t < 0.3) { g.x += g.vx * dt; g.y += g.vy * dt; g.vx *= Math.exp(-5 * dt); g.vy *= Math.exp(-5 * dt); continue; }
    const k = 1 - Math.exp(-(6 + (g.t - 0.3) * 40) * dt);
    g.x = lerp(g.x, g.tx, k); g.y = lerp(g.y, g.ty, k);
    if (Math.hypot(g.x - g.tx, g.y - g.ty) < 10) { g.done = true; gemArrived(); }
  }
  game.gems = game.gems.filter(g => !g.done);
  game.shake *= Math.exp(-12 * dt);
}

/** A shard lands in the counter: count up, bump and tick. */
function gemArrived() {
  game.gemsShown = (game.gemsShown || 0) + 1;
  const pill = $("clock");
  pill.classList.remove("bump"); void pill.offsetWidth; pill.classList.add("bump");
  if (game.gemsShown % 2) sfx.blip(game.gemsShown >> 1);
}

/** The counter in the top bar: shards caught from this egg, and taps (with the 3-star mark once you've cleared it). */
function updateClock() {
  const e = game.egg;
  if (game.scene !== "crack" || !e) return;
  const shown = Math.min(game.gemsShown || 0, e.gems), key = shown + "/" + e.taps;
  if (updateClock.last !== key) {
    updateClock.last = key;
    $("clock").innerHTML = `<b>${ic("shard")}${shown}</b><small>${e.taps} ${pl(e.taps, "tap", "taps")}${save.stars[e.conf.n] ? ` · ★ ${e.par}` : ""}</small>`;
  }
}

// ---------- drawing ----------

function eggOffset() {
  const e = game.egg;
  return e.state === "entering" ? -(1 - easeOutBounce(clamp(e.t / 0.9, 0, 1))) * (L.ecy + L.eh) : 0;
}

function drawCushion(cx, y, w) {
  const sh = ctx.createRadialGradient(cx, y + 6, 4, cx, y + 6, w * 1.1);
  sh.addColorStop(0, "rgba(5,0,20,.55)");
  sh.addColorStop(1, "rgba(5,0,20,0)");
  ctx.fillStyle = sh;
  ctx.fillRect(cx - w * 1.2, y - 20, w * 2.4, 60);
  const ry = 18 * Math.max(1, w / 150);
  drawBaked(cachedSprite(roomSprites, "cushion" + Math.round(w), `${cx}|${y}|${w}|${PX}`, () => bakeSprite(cx, y + 4, w, () => {
    // a velvet cushion: a lit top, a darker rim, a sheen where the light falls
    ctx.fillStyle = "#2e1d4f";
    ctx.beginPath(); ctx.ellipse(cx, y + 4 + ry * 0.25, w, ry, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#523a85";
    ctx.beginPath(); ctx.ellipse(cx, y + 4, w * 0.96, ry * 0.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#6b4fa8";
    ctx.beginPath(); ctx.ellipse(cx - w * 0.2, y + 4 - ry * 0.25, w * 0.5, ry * 0.32, 0, 0, TAU); ctx.fill();
  }, { up: (ry * 1.3) / w + 0.04, down: (ry * 1.5) / w + 0.04, side: 1.04 })));
}

function drawGloss(c, cx, cy, a = 1) {
  const r = L.ew * 0.22;
  c.save();
  c.translate(cx - L.ew * 0.17, cy - L.eh * 0.25);
  c.rotate(-0.5);
  c.scale(1, 0.72);
  const g = c.createRadialGradient(0, 0, 1, 0, 0, r);
  g.addColorStop(0, `rgba(255,255,255,${0.4 * a})`);
  g.addColorStop(0.45, `rgba(255,255,255,${0.14 * a})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(-r, -r, r * 2, r * 2);
  c.restore();
}

function drawEgg() {
  const e = game.egg;
  if (e.state === "opening") e.open = clamp(e.t / 1.1, 0, 1);
  const oy = eggOffset();
  // near the end it trembles by itself, as if something inside is pushing
  const prog = e.hp ? clamp(e.damage / e.hp, 0, 1) : 0;
  const wob = e.wob * Math.sin(e.wobT * 22) * Math.exp(-e.wobT * 5)
    + (e.state === "cracking" && prog > 0.7 ? Math.sin(game.time * 0.05) * 0.006 * (prog - 0.6) * 3 : 0);
  const sq = e.squash * e.squash;
  ctx.save();
  ctx.translate(L.ecx, L.floor + oy);
  ctx.rotate(wob);
  ctx.scale(1 + sq * 0.04, 1 - sq * 0.05);
  ctx.translate(-L.ecx, -L.floor);
  const x = L.ex0 - PAD, y = L.ey0 - PAD, w = L.ew + PAD * 2, h = L.eh + PAD * 2;
  // the inside and its glowling stay hidden until the shell bursts
  const opened = e.state === "opening" || e.state === "polish" || e.state === "gleam" || e.state === "open";
  const box = { up: 1.08, down: 1.08, side: 1.08 }, half = Math.max(w, h) / 2;
  const size = `${L.ew}|${L.eh}|${PX}`;
  if (opened) {
    drawRays(e);
    // the polished face changes as you rub: redraw its sprite at most about 12 times a second
    const m = e.matte, rev = m ? (game.time - (e.innerAt || 0) > 80 ? m.rev || 0 : e.innerRev) : 0;
    if (rev !== e.innerRev) { e.innerRev = rev; e.innerAt = game.time; }
    drawBaked(cachedSprite(e, "innerSprite", `${size}|${e.innerRev}`, () => bakeSprite(L.ecx, L.ecy, half, () => {
      ctx.drawImage(e.interior, x, y, w, h);
      if (e.matte) ctx.drawImage(e.matte.canvas, x, y, w, h);
    }, box)));
    if (e.state === "gleam" || e.state === "open") drawGleam(e, x, y, w, h);
    // it pops up once, while the shell flies apart
    const k = e.state === "opening" ? clamp((e.t - 0.35) / 0.5, 0, 1) : 1;
    if (k > 0) drawSprite(L.ecx, L.ecy + L.eh * 0.04, L.ew * 0.34 * easeOutBack(k), e.species, { mood: "happy", hop: e.hop, shiny: e.shiny });
  } else {
    drawBaked(cachedSprite(e, "shellSprite", `${size}|${e.painted}|${e.dentsPainted}|${e.chips || 0}|${e.shell.canvas.width}`, () => bakeSprite(L.ecx, L.ecy, half, () => ctx.drawImage(e.shell.canvas, x, y, w, h), box)));
    drawCrackLight(e, prog);
    drawGloss(ctx, L.ecx, L.ecy);
    if (e.state !== "entering") drawSpot(e);
  }
  ctx.restore();
}

/** As the egg gives way, the glow inside starts to seep out through the cracks. */
function drawCrackLight(e, prog) {
  if (prog < 0.3 || !e.net.segs.length) return;
  const light = e.crystal.c[1], pulse = 0.6 + 0.4 * Math.sin(game.time * 0.006);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = light;
  ctx.globalAlpha = clamp((prog - 0.3) / 0.6, 0, 1) * 0.7 * pulse;
  ctx.shadowColor = light;
  ctx.shadowBlur = quality.low ? 0 : 8 * L.k;
  ctx.lineWidth = 0.9 * L.k;
  ctx.beginPath();
  for (const [ax, ay, bx, by] of e.net.segs) { ctx.moveTo(...fromEgg(ax, ay)); ctx.lineTo(...fromEgg(bx, by)); }
  ctx.stroke();
  ctx.restore();
}

/** The weak spot: a soft glow on easy stone, fainter on harder stone, and gone deep in the grotto. */
function drawSpot(e) {
  const a = Math.max(e.conf.spotGlow, e.conf.coop ? 0 : [0, 0.15, 0.25, 0.35][forgeLvl("eye")]);
  if (!a || e.state !== "cracking") return;
  const [x, y] = fromEgg(...e.spot), k = 0.5 + 0.5 * Math.sin(game.time * 0.004), r = (18 + k * 6) * L.k;
  const g = ctx.createRadialGradient(x, y, 1, x, y, r);
  g.addColorStop(0, hexA(e.crystal.c[1], 0.9 * a));
  g.addColorStop(0.35, hexA(e.crystal.c[0], 0.6 * a));
  g.addColorStop(1, hexA(e.crystal.c[2], 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  // a thin ring breathing outward, so it reads on pale stone too
  const w = (game.time * 0.0008) % 1;
  ctx.strokeStyle = hexA(e.crystal.c[2], 0.7 * a * (1 - w)); ctx.lineWidth = 2 * Math.max(1, L.k);
  ctx.beginPath(); ctx.arc(x, y, (8 + w * 22) * L.k, 0, TAU); ctx.stroke();
}

/** A band of light sweeping across the freshly polished face. */
function drawGleam(e, x, y, w, h) {
  const k = e.state === "open" ? 1 : clamp(e.t / 1, 0, 1);
  if (k >= 1) return;
  ctx.save();
  tracePoly(ctx, L.egg);
  ctx.clip();
  const sx = lerp(x - w * 0.5, x + w * 1.5, k);
  const g = ctx.createLinearGradient(sx - 50, y, sx + 50, y + 80);
  g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,.6)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function drawRipples() {
  for (const r of game.ripples) {
    if (r.t < 0) continue;
    const k = r.t / 0.6;
    ctx.strokeStyle = `rgba(255,255,255,${(1 - k) * (0.35 + r.h * 0.5)})`;
    ctx.lineWidth = 1.5 + r.h * 2;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r * k, 0, TAU); ctx.stroke();
  }
}

function drawRays(e) {
  const k = e.state === "opening" ? e.open : 1;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(L.ecx, L.ecy);
  ctx.rotate(game.time * 0.00012);
  const r = Math.max(W, H) * 0.7;
  ctx.fillStyle = e.crystal.c[1];
  for (let i = 0; i < 14; i++) {
    ctx.globalAlpha = (e.state === "opening" ? 0.12 * (1 - k) + 0.05 : 0.05) * (i % 2 ? 0.7 : 1);
    ctx.rotate(TAU / 14);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r, -r * 0.08); ctx.lineTo(r, r * 0.08); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawPieces() {
  const e = game.egg;
  if (!game.pieces.length) return;
  const x = L.ex0 - PAD, y = L.ey0 - PAD, w = L.ew + PAD * 2, h = L.eh + PAD * 2;
  for (const p of game.pieces) {
    // each shard of shell is cut as a sprite once, then just moved and turned
    if (!p.sprite) {
      const r = Math.max(...p.poly.map(([px, py]) => Math.hypot(px - p.c[0], py - p.c[1])), 4) + 4 * L.k;
      p.sprite = bakeSprite(p.c[0], p.c[1], r, () => drawPiece(p, e, x, y, w, h), { up: 1.05, down: 1.05, side: 1.05 });
    }
    ctx.save();
    ctx.globalAlpha = clamp(1 - (p.t - 1.1) / 1.1, 0, 1);
    ctx.translate(p.c[0] + p.dx, p.c[1] + p.dy);
    ctx.rotate(p.rot);
    ctx.translate(-p.c[0], -p.c[1]);
    drawBaked(p.sprite);
    ctx.restore();
  }
}

/** One flying piece of shell: the shell cut along the break, its pale broken edge showing. */
function drawPiece(p, e, x, y, w, h) {
  tracePoly(ctx, p.poly);
  ctx.save();
  ctx.clip();
  ctx.drawImage(e.shell.canvas, x, y, w, h);
  // the broken edge shows the shell's pale thickness, with a thin shadow under it
  if (p.edge) {
    ctx.lineJoin = "miter"; ctx.lineCap = "butt";
    ctx.beginPath(); p.edge.forEach(([ex, ey], i) => (i ? ctx.lineTo(ex, ey) : ctx.moveTo(ex, ey)));
    ctx.strokeStyle = "#f6efe4"; ctx.lineWidth = 4 * L.k; ctx.stroke();
    ctx.strokeStyle = "rgba(60,40,40,.35)"; ctx.lineWidth = 1 * L.k; ctx.stroke();
  }
  ctx.restore();
}

function drawChips() {
  for (const c of game.chips) {
    ctx.save();
    ctx.globalAlpha = clamp((c.life - c.t) / 0.4, 0, 1);
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.moveTo(-c.s, -c.s * 0.6); ctx.lineTo(c.s * 0.8, -c.s * 0.8); ctx.lineTo(c.s, c.s * 0.5); ctx.lineTo(-c.s * 0.4, c.s * 0.8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function drawSparks() {
  ctx.save();
  for (const s of game.sparks) {
    const k = 1 - s.t / s.life;
    ctx.globalAlpha = k;
    ctx.fillStyle = s.color;
    ctx.shadowColor = s.color;
    ctx.shadowBlur = quality.low ? 0 : 8;
    sparklePath(ctx, s.x, s.y, s.s * k);
    ctx.fill();
  }
  ctx.restore();
}

function drawHearts() {
  ctx.save();
  for (const h of game.hearts) {
    ctx.globalAlpha = 1 - h.t / h.life;
    ctx.fillStyle = "#ff9ecb";
    ctx.save(); ctx.translate(h.x, h.y); ctx.scale(h.s / 10, h.s / 10);
    ctx.beginPath(); ctx.moveTo(0, 3.5); ctx.bezierCurveTo(-11, -3.5, -4.5, -10.5, 0, -4.5); ctx.bezierCurveTo(4.5, -10.5, 11, -3.5, 0, 3.5); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawFloaters() {
  fx.save();
  fx.textAlign = "center"; fx.lineJoin = "round";
  fx.font = `400 19px ${PIXEL_FONT}`;
  for (const f of game.floaters) {
    fx.globalAlpha = 1 - f.t / 1.2;
    fx.fillStyle = "#160c26";
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [2, 2]]) fx.fillText(f.text, f.x + dx, f.y - f.t * 40 + dy);
    fx.fillStyle = f.color;
    fx.fillText(f.text, f.x, f.y - f.t * 40);
  }
  fx.restore();
}

function drawPops() {
  fx.save();
  fx.textAlign = "center"; fx.lineJoin = "miter";
  for (const p of game.pops) {
    const k = p.t / p.life, grow = p.t < 0.08 ? 1.6 - p.t / 0.08 * 0.6 : 1;
    fx.globalAlpha = clamp((1 - k) * 2, 0, 1);
    fx.font = `400 ${Math.round(22 * p.size * grow * Math.max(1, L.k))}px ${PIXEL_FONT}`;
    // a hard pixel outline: the word stamped dark in four directions, then the color on top
    fx.fillStyle = "#160c26";
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [2, 2], [1, 2], [2, 1]]) fx.fillText(p.text, p.x + dx, p.y + dy);
    fx.fillStyle = p.color; fx.fillText(p.text, p.x, p.y);
  }
  fx.restore();
}

function drawGems() {
  ctx.save();
  for (const g of game.gems) {
    if (g.t < 0) continue;
    const s = 5 * Math.max(1, L.k);
    ctx.fillStyle = "#1a1030";
    ctx.beginPath(); ctx.moveTo(g.x, g.y - s - 1.5); ctx.lineTo(g.x + s * 0.7 + 1.5, g.y); ctx.lineTo(g.x, g.y + s + 1.5); ctx.lineTo(g.x - s * 0.7 - 1.5, g.y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = g.color;
    ctx.beginPath(); ctx.moveTo(g.x, g.y - s); ctx.lineTo(g.x + s * 0.7, g.y); ctx.lineTo(g.x, g.y + s); ctx.lineTo(g.x - s * 0.7, g.y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.fillRect(g.x - s * 0.25, g.y - s * 0.5, s * 0.3, s * 0.4);
  }
  ctx.restore();
}

function drawGlints() {
  for (const g of game.glints) {
    const k = 1 - g.t / 0.8;
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${k})`;
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = quality.low ? 0 : 14 * k;
    ctx.lineWidth = 3 * k + 1;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    g.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
  }
}

function drawFlash() {
  const e = game.egg;
  if (game.scene !== "crack" || !e || e.state !== "opening" || e.t > 0.6) return;
  const k = 1 - e.t / 0.6;
  const g = ctx.createRadialGradient(L.ecx, L.ecy, 4, L.ecx, L.ecy, L.ew * 1.4);
  g.addColorStop(0, `rgba(255,255,255,${0.9 * k})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** The little hammer that swings down where you tapped: up, a quick strike, a moment's rest, gone. */
function drawSwings() {
  game.swings = game.swings.filter(w => game.time - w.t < 320);
  if (game.scene !== "crack") return;
  // the tool grows with each Granite fist level
  const u = Math.max(PX, Math.round(3.2 * L.k / PX) * PX) * (1 + Math.min(5, forgeLvl("heft")) * 0.08);
  ctx.imageSmoothingEnabled = false;
  for (const w of game.swings) {
    const a = (game.time - w.t) / 1000, ang = a < 0.07 ? -1.1 * (1 - a / 0.07) : 0;
    ctx.save();
    ctx.globalAlpha = a > 0.2 ? Math.max(0, 1 - (a - 0.2) / 0.12) : 1;
    // it pivots on the end of its handle, down and to the right of the tap, and the head lands on the stone
    ctx.translate(w.x + 9.5 * u, w.y + 9.5 * u); ctx.rotate(-Math.PI / 4 + ang);
    ctx.drawImage(toolSprite(w.skin), -9 * u, -17 * u, 18 * u, 18 * u);
    ctx.restore();
  }
}

function drawTrail() {
  const now = performance.now();
  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(255,255,255,.8)";
  ctx.shadowBlur = quality.low ? 0 : 10;
  for (let i = 1; i < game.trail.length; i++) {
    const p = game.trail[i - 1], q = game.trail[i], k = 1 - (now - q.t) / 220;
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * k})`;
    ctx.lineWidth = 1 + 4 * k;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  }
  ctx.restore();
}

function drawCoopCursor() {
  const c = coopSession && coopSession.remoteCursor;
  if (!c || performance.now() - c.t > 450 || game.scene !== "crack") return;
  ctx.save(); ctx.lineCap = "round";
  for (let i = 1; i < c.trail.length; i++) {
    const p = c.trail[i - 1], q = c.trail[i], a = clamp(1 - (performance.now() - q.t) / 450, 0, 1);
    ctx.strokeStyle = `rgba(143,216,239,${a * .55})`; ctx.lineWidth = 2 + a * 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  }
  ctx.fillStyle = "#8fd8ef"; ctx.shadowColor = "#8fd8ef"; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(c.x, c.y, c.down ? 8 : 5, 0, TAU); ctx.fill(); ctx.restore();
}

/** Behind the menus: a glowling floating in the dark (asleep if you haven't met it yet). */
function drawIdle() {
  const sp = SPECIES[Math.floor(game.time / 4000) % SPECIES.length];
  ctx.globalAlpha = game.scene === "menu" ? 0.9 : 0.3;
  // one still frame per glowling (it floats as a whole), so the menu doesn't redraw a big sprite ten times a second
  drawSprite(W / 2, H * 0.5 + Math.round(Math.sin(game.time * 0.001) * 10 / PX) * PX, Math.min(W, H) * 0.32, sp, { mood: save.seen[sp.id] ? "happy" : "asleep", t: 0 });
  ctx.globalAlpha = 1;
}

function frame(now) {
  const ms = now - (frame.last || now), t0 = performance.now();
  frame.last = now;
  quality.sample(ms, frame.work || 0);
  let dt = Math.min(ms / 1000, 0.05);
  // a crit freezes the world for a blink, so the hit lands
  if (game.freeze > 0) { game.freeze -= dt; dt = 0; }
  const steps = Math.ceil(dt * 60 - 0.01) || 1;
  if (dt) for (let i = 0; i < steps; i++) update(dt / steps);
  updateClock();
  fx.clearRect(0, 0, W, H);
  if (talkNow) updateSpot();
  drawBackground();
  if (game.scene !== "menu") drawBats(dt);
  if (game.scene === "crack" && game.egg) {
    ctx.save();
    if (game.shake > 0.3 && !opts().calm) ctx.translate(rand(-1, 1) * game.shake, rand(-1, 1) * game.shake);
    drawCushion(L.ecx, L.floor + 4, L.ew * 0.62);
    const cx = Math.min(L.ew * 0.66, W / 2 - 8 * PX);
    drawCandle(L.ecx - cx, L.floor + 8, 12, 0); drawCandle(L.ecx + cx, L.floor + 10, 8, 2.1);
    drawEgg();
    drawPieces();
    ctx.restore();
    drawGloom();
  } else if (game.scene === "nest") {
    drawNest();
  } else if (game.scene === "catch") {
    drawCatch();
  } else if (game.scene === "echo") {
    drawEcho();
  } else {
    drawIdle();
  }
  if (game.scene !== "catch" && game.scene !== "echo") drawEventMotes();
  drawChips();
  drawGlints();
  drawRipples();
  drawFlash();
  drawSparks();
  drawHearts();
  drawFloaters();
  drawPops();
  drawGems();
  drawSwings();
  drawTrail();
  drawCoopCursor();
  drawCoach();
  present();
  frame.work = performance.now() - t0;
  requestAnimationFrame(frame);
}

if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});

window.addEventListener("resize", resize);
window.addEventListener("hashchange", coopImportLocationInvite);
for (const cr of save.creatures) applyTime(cr);
clearDoorways();
resize();
updateTopbar();
checkThemes();
coopImportLocationInvite();
quality.settle(5000); // the first seconds bake every picture: don't judge the device by them
requestAnimationFrame(frame);
applyOpts();
warmUp();
// show the page once the words are translated, the fonts are in and the first frame is on screen (or after 1.5 s whatever happens)
Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))])
  .then(() => requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove("booting"))));

/** While the menu is up, paint what the nest will need, one small job per idle moment, so Play opens without a hitch. */
function warmUp() {
  const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 1500 }) : setTimeout(f, 200));
  const jobs = [() => bgFor("nest"), ...save.creatures.map(c => () => creatureImage(specOf(c), { art: 20, level: c.level, shiny: c.shiny, acc: c.acc }))];
  const next = () => { if (game.scene !== "menu" || !jobs.length) return; jobs.shift()(); idle(next); };
  setTimeout(() => idle(next), 600);
}

// ---------- the start plate: a dithered pixel-art grotto, drawn live like the keep on helavika's portfolio ----------
// New players see a big stone egg that wobbles now and then; returning players see their own glowling on the ledge.
(() => {
  const c = $("pixelGrotto"), g = c.getContext("2d"), W = c.width, H = c.height, img = g.createImageData(W, H);
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const P = Object.fromEntries(Object.entries({
    sky: ["#06041a", "#0f0a2e", "#1b1446", "#2a2163", "#3d3185"],
    moon: ["#5b4ea3", "#9b8fd6", "#c9b8ff", "#ece6ff", "#fff8d6"],
    far: ["#120d36", "#231a5a", "#382a80", "#5a46a8"],
    crystal: ["#2a1d63", "#5b3fb0", "#9a7ce6", "#c9b8ff", "#eef0ff"],
    rock: ["#050314", "#0d0926", "#18123a", "#251d52", "#372c6e"],
    egg: ["#2e2a3e", "#58526a", "#8a8396", "#b9b1bf", "#ddd6d8"],
    glow: ["#5b3fb0", "#8fd8ef", "#c9b8ff", "#ffffff"],
  }).map(([k, v]) => [k, v.map(pxHex)]));
  const bayer = PX_BAYER, pick = pxPick, hash = pxHash, noise = pxNoise, fbm = pxFbm, smooth = pxSmooth;
  const moon = { x: 101, y: 16, r: 9 }, egg = { x: 64, y: 47, rx: 11, ry: 15 };
  const pet = activeCreature();
  // crystal spires on the far ridge: [x, base, height, half width]
  const spires = [[16, 44, 15, 3], [23, 45, 9, 2], [34, 43, 12, 2], [88, 44, 13, 3], [95, 45, 8, 2], [110, 43, 17, 3], [117, 45, 10, 2]];
  const ridge = x => 41 - 5 * Math.abs(Math.sin(x * .06 + .4)) - 3 * noise(x * .15, 2);
  const ledge = x => 58 + 2 * Math.sin(x * .09) + 2 * noise(x * .2, 7) + Math.abs(x - 64) * .04;
  // the cave mouth: rock hangs down from the top corners
  const cave = (x, y) => {
    const l = 20 - 14 * (y / H) - 4 * noise(y * .2, 1), r = W - 18 + 12 * (y / H) + 4 * noise(y * .2, 4);
    const roof = 4 + 3 * noise(x * .18, 3) + (Math.abs(x - 64) > 30 ? 0 : -6) + 4 * (hash(x >> 2, 9) > .8 ? 1 : 0) * smooth(30, 0, Math.abs(x - 64) - 10);
    return x < l || x > r || y < roof;
  };
  const eggD = (x, y) => { const dx = (x - egg.x) / (egg.rx * (y < egg.y ? .86 : 1)), dy = (y - egg.y) / egg.ry; return dx * dx + dy * dy; };
  // a zigzag crack down the front of the egg
  const crack = [];
  for (let y = egg.y - egg.ry + 4, x = egg.x, i = 0; y <= egg.y + 6; y++, i++) { x += [0, 1, 1, 0, -1, -1][i % 6]; crack.push([x, y]); if (i === 9) crack.push([x + 1, y + 1], [x + 2, y + 2], [x + 3, y + 2]); }
  const stars = Array.from({ length: 22 }, (_, i) => [Math.floor(hash(i, 1) * W), Math.floor(hash(i, 2) * 34), hash(i, 3) * 6]);

  const base = new Array(W * H), sky = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, md = Math.hypot(x - moon.x, y - moon.y);
    let col;
    if (y >= ledge(x)) col = pick(P.rock, .55 - (y - ledge(x)) / 16 + fbm(x * .25, y * .25) * .3 + .25 * smooth(22, 0, Math.hypot(x - egg.x, (y - 60) * 2)), x, y);
    else if (cave(x, y)) col = pick(P.rock, .08 + fbm(x * .2, y * .2) * .3, x, y);
    else {
      let sp = null;
      for (const [sx, sb, sh, sw] of spires) { const t = (sb - y) / sh; if (t >= 0 && t <= 1 && Math.abs(x - sx) <= sw * (1 - t) + .5) sp = x < sx ? .85 - t * .2 : .45; }
      if (sp !== null) col = pick(P.crystal, sp + fbm(x, y) * .1, x, y);
      else if (y >= ridge(x)) col = pick(P.far, .6 - (y - ridge(x)) / 18 + fbm(x * .12, y * .12) * .3, x, y);
      else if (md < moon.r) col = pick(P.moon, .9 - .5 * (md / moon.r) ** 3 - .3 * smooth(.55, .7, fbm(x * .3 + 5, y * .3)), x, y);
      else { sky[i] = 1; col = pick(P.sky, y / 40 * .45 + Math.max(0, .35 - (md - moon.r) / 30), x, y); }
    }
    base[i] = col;
  }

  // a returning player's glowling, pixelated like the postcards
  let sprite = null;
  if (pet) imgFrom(creatureImage(specOf(pet), { size: 240, level: pet.level, shiny: pet.shiny, mood: "happy" })).then(im => { sprite = pixelate(im, 44, 38); draw(t); });

  function draw(t) {
    const d = img.data, put = (x, y, col) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
    for (let i = 0; i < W * H; i++) put(i % W, Math.floor(i / W), base[i]);
    for (const [x, y, ph] of stars) if (sky[y * W + x] && Math.sin(t * .35 + ph) > -.3) put(x, y, P.moon[Math.sin(t * .35 + ph) > .7 ? 4 : 2]);
    const k = .5 + .5 * Math.sin(t * .22);
    // light spills on the ledge around the egg or the glowling
    for (let y = egg.y - 22; y <= egg.y + 16; y++) for (let x = egg.x - 24; x <= egg.x + 24; x++) {
      const r = Math.hypot(x - egg.x, (y - egg.y) * .8);
      if ((pet || eggD(x, y) > 1) && r < 22 && bayer[(y & 3) * 4 + (x & 3)] < (1 - r / 22) * (.2 + k * .25)) put(x, y, P.glow[0]);
    }
    if (!pet) {
      // every few seconds the egg gives a little wobble
      const w = t % 55, dx = w < 8 ? [0, -1, 1, -1, 1, 0, -1, 0][w] : 0;
      for (let y = egg.y - egg.ry; y <= egg.y + egg.ry; y++) for (let x = egg.x - egg.rx - 1; x <= egg.x + egg.rx + 1; x++) {
        if (eggD(x, y) > 1) continue;
        put(x + dx, y, pick(P.egg, .8 - (x - egg.x + 4) / 28 - (y - egg.y + 8) / 50 + fbm(x * .45, y * .45) * .25, x, y));
      }
      for (const [x, y] of crack) put(x + dx, y, P.glow[k > .6 ? 3 : 2]);
    }
    // motes drifting up out of the grotto
    for (let n = 0; n < 7; n++) {
      const life = (t * .08 + hash(n, 5)) % 1, x = Math.round(30 + hash(n, 6) * 68 + Math.sin(t * .1 + n) * 2), y = Math.round(60 - life * 50);
      if (life < .9) put(x, y, P.glow[life < .5 ? 2 : 1]);
    }
    g.putImageData(img, 0, 0);
    if (sprite) g.drawImage(sprite, Math.round(egg.x - sprite.width / 2), Math.round(60 - sprite.height + (Math.sin(t * .3) > .6 ? -1 : 0)));
  }
  let t = 0, last = 0;
  function loop(now) {
    if (!$("start").classList.contains("hidden") && now - last > 110) { last = now; draw(++t); }
    requestAnimationFrame(loop);
  }
  draw(0);
  if (!calm) requestAnimationFrame(loop);
})();

// ---------- tiny pixel icons for the start page ----------
(() => {
  const S = 14, ramp = hexes => hexes.map(pxHex);
  const stone = ramp(["#58526a", "#8a8396", "#b9b1bf", "#ddd6d8", "#f4f0f2"]), crys = ramp(["#2a1d63", "#5b3fb0", "#9a7ce6", "#c9b8ff", "#eef0ff"]);
  const pink = ramp(["#7a3d68", "#d77fb0", "#ff9ecb", "#ffd0e6"]), gold = pxHex("#ffe9a8"), ink = [22, 14, 46];
  const ICONS = {
    crack: (x, y) => { const dx = (x - 6.5) / (y < 7 ? 4.6 : 5.4), dy = (y - 7.5) / 6.5; if (dx * dx + dy * dy > 1) return null; if ([[6, 3], [7, 4], [7, 5], [6, 6], [6, 7], [7, 8], [8, 9], [8, 10]].some(([a, b]) => a === x && b === y)) return crys[1]; return pxPick(stone, .85 - (x + y) / 26, x, y); },
    geode: (x, y) => { const r = Math.hypot((x - 6.5) / 6.5, (y - 7) / 5.5); if (r > 1) return null; if (r > .72) return pxPick(stone, .7 - y / 20, x, y); return pxPick(crys, .95 - r * .9 + (((x * 3 + y * 5) % 4) === 0 ? .2 : 0), x, y); },
    glowling: (x, y) => {
      if ((x === 3 || x === 10) && y === 3) return pink[1];
      if ((x === 3 || x === 4 || x === 9 || x === 10) && y === 4) return pink[1];
      const r = Math.hypot((x - 6.5) / 5.6, (y - 8) / 4.8); if (r > 1) return null;
      if ((x === 5 || x === 8) && y === 7) return ink;
      if ((x === 4 || x === 9) && y === 9) return pink[1];
      return pxPick(pink, 1 - r * .55 - y / 40, x, y);
    },
    duo: (x, y) => { const star = (cx, cy, r) => { const a = Math.abs(x - cx), b = Math.abs(y - cy); return a + b <= 1 || (a === 0 && b <= r) || (b === 0 && a <= r); }; return star(4, 7, 3) || star(10, 5, 2) ? gold : null; },
  };
  for (const el of $$("[data-icon]")) {
    const fn = ICONS[el.dataset.icon], c = document.createElement("canvas"); c.width = c.height = S;
    const g = c.getContext("2d"), im = g.createImageData(S, S), d = im.data, solid = new Uint8Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const col = fn(x, y); if (!col) continue; solid[y * S + x] = 1; const i = (y * S + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; }
    if (el.dataset.icon !== "duo") for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!solid[y * S + x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => solid[(y + b) * S + x + a] && x + a >= 0 && x + a < S)) { const i = (y * S + x) * 4; d[i] = ink[0]; d[i + 1] = ink[1]; d[i + 2] = ink[2]; d[i + 3] = 255; }
    g.putImageData(im, 0, 0);
    el.src = c.toDataURL();
  }
})();
for (const el of $$("[data-ic]")) el.style.backgroundImage = `url(${pxIcon(el.dataset.ic)})`;

// ---------- inside Telegram (as a Mini App): its back button, haptics, safe areas, and the save kept in Telegram's cloud ----------
// Telegram opens the game with #tgWebAppData… in the address; anywhere else none of this loads, and the game is the same as ever
let tg = null, tgCloud = false;
/** A little buzz: Telegram's haptics when we have them, the phone's vibration otherwise. A pattern (array) is a "well done". */
function buzz(p) {
  const h = tg && tg.isVersionAtLeast("6.1") && tg.HapticFeedback;
  if (h) { if (Array.isArray(p)) h.notificationOccurred("success"); else h.impactOccurred(p >= 18 ? "heavy" : p >= 10 ? "medium" : p >= 7 ? "light" : "soft"); return; }
  if (navigator.vibrate) navigator.vibrate(p);
}
/** What Telegram's back button would do right now: close the top window, or leave the egg (it asks first), or nothing. */
function tgBackTarget() {
  const m = $$(".overlay.modal:not(.hidden)").pop();
  if (m) return m.querySelector('[id$="Close"]') || m.querySelector("#keepCracking");
  if (!$("catchDone").classList.contains("hidden")) return $("catchBack");
  if (game.scene === "crack") return $("quit");
  return null;
}
const TG_CHUNK = 4000, TG_MAX = 400;
/** The save goes to Telegram's cloud in pieces (4096 characters each at most); geode pictures stay behind, they can be redrawn. */
/** The cloud copy's keys: s0..sN and sn, or t0..tN and tn for the test copy. */
const TG_KEY = STAGING ? "t" : "s";
function tgCloudPut() {
  if (!tgCloud || !validSave(save)) return;
  const copy = JSON.parse(JSON.stringify(save));
  for (const g of Object.values(copy.geodes || {})) delete g.img;
  const text = JSON.stringify(copy), n = Math.ceil(text.length / TG_CHUNK);
  if (n > TG_MAX) return;
  for (let i = 0; i < n; i++) tg.CloudStorage.setItem(TG_KEY + i, text.slice(i * TG_CHUNK, (i + 1) * TG_CHUNK));
  tg.CloudStorage.setItem(TG_KEY + "n", `${n}|${copy.rev || 0}`);   // written last: a half-written save is never picked up
}
function tgCloudGet(done) {
  tg.CloudStorage.getItem(TG_KEY + "n", (err, head) => {
    if (err || !head) return done(null);
    const [n, rev] = head.split("|").map(Number);
    if (!(n > 0 && n <= TG_MAX) || rev <= (save.rev || 0)) return done(null);
    tg.CloudStorage.getItems(Array.from({ length: n }, (_, i) => TG_KEY + i), (err2, parts) => {
      if (err2 || !parts) return done(null);
      try { done(JSON.parse(Array.from({ length: n }, (_, i) => parts[TG_KEY + i] || "").join(""))); } catch { done(null); }
    });
  });
}
function tgStart() {
  tg = window.Telegram && Telegram.WebApp;
  if (!tg || !tg.initData) { tg = null; return; }
  document.body.classList.add("in-telegram");
  tg.ready(); tg.expand();
  if (tg.isVersionAtLeast("7.7")) tg.disableVerticalSwipes();   // tracing a crack downwards mustn't pull the game shut
  if (tg.isVersionAtLeast("6.1")) { tg.setHeaderColor("#16123a"); tg.setBackgroundColor("#16123a"); }
  if (tg.isVersionAtLeast("7.10")) tg.setBottomBarColor("#16123a");
  // keep clear of Telegram's own buttons at the top in full screen
  const insets = () => {
    const a = tg.safeAreaInset || {}, c = tg.contentSafeAreaInset || {}, st = document.documentElement.style;
    st.setProperty("--tg-top", ((a.top || 0) + (c.top || 0)) + "px"); st.setProperty("--tg-bottom", ((a.bottom || 0) + (c.bottom || 0)) + "px");
  };
  insets(); tg.onEvent("safeAreaChanged", insets); tg.onEvent("contentSafeAreaChanged", insets);
  if (tg.isVersionAtLeast("6.1")) {
    tg.BackButton.onClick(() => { const b = tgBackTarget(); if (b) b.click(); });
    setInterval(() => { const on = !!tgBackTarget(); if (on !== tg.BackButton.isVisible) on ? tg.BackButton.show() : tg.BackButton.hide(); }, 300);
  }
  tgCloud = tg.isVersionAtLeast("6.9") && !!tg.CloudStorage;
  if (tgCloud) {
    // the same nest on your phone and your computer: take the cloud copy if it's newer, and keep it up to date
    tgCloudGet(d => { if (d && validSave(d)) { adoptSave(d); store.set(SAVE_KEY, save); toast(tr("Your nest came back from Telegram ✦")); } });
    let last = 0;
    setInterval(() => { if (save.rev !== last) { last = save.rev; tgCloudPut(); } }, 20000);
    addEventListener("visibilitychange", () => { if (document.hidden) tgCloudPut(); });
    if (tg.isVersionAtLeast("8.0")) tg.onEvent("deactivated", tgCloudPut);
  }
}
if (/[#&?]tgWebApp/.test(location.hash + location.search)) {
  const sc = document.createElement("script");
  sc.src = "https://telegram.org/js/telegram-web-app.js?65"; sc.onload = tgStart;
  document.head.appendChild(sc);
}

// ---------- once every script has loaded: timers that reach across them ----------
game.actors = actors;
giftWire();
setInterval(() => { if (game.scene !== "menu" && !talkNow) checkAwards(); }, 1500);
