"use strict";
// Hatchstone · the egg: cracking, the forge, tasks, polishing, results, dialogs and the story.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- the egg ----------

/** The rough outside of a geode: lumpy, speckled rock. */
function makeShell(stone) {
  const [base, dark, light] = stone;
  const c = document.createElement("canvas");
  c.width = Math.ceil((L.ew + PAD * 2) * DPR); c.height = Math.ceil((L.eh + PAD * 2) * DPR);
  const o = c.getContext("2d");
  o.setTransform(DPR, 0, 0, DPR, 0, 0);
  const egg = eggPoly(L.ew / 2 + PAD, L.eh / 2 + PAD, L.ew, L.eh);
  tracePoly(o, egg);
  const g = o.createRadialGradient(PAD + L.ew * 0.36, PAD + L.eh * 0.3, 4, PAD + L.ew * 0.5, PAD + L.eh * 0.55, L.eh * 0.7);
  g.addColorStop(0, light);
  g.addColorStop(0.45, base);
  g.addColorStop(0.85, dark);
  g.addColorStop(1, shade(dark, -0.35));
  o.fillStyle = g;
  o.fill();
  o.save();
  o.clip();
  // lumps: each a small lit bump, like the cauliflower skin of a real geode
  for (let i = 0; i < 130; i++) {
    const x = rand(0, L.ew + PAD * 2), y = rand(0, L.eh + PAD * 2), r = rand(3, 9) * L.k;
    const bump = o.createRadialGradient(x - r * 0.3, y - r * 0.3, 0.5, x, y, r);
    bump.addColorStop(0, "rgba(255,255,255,.28)");
    bump.addColorStop(0.7, "rgba(255,255,255,0)");
    bump.addColorStop(1, "rgba(30,20,30,.2)");
    o.fillStyle = bump;
    o.beginPath(); o.arc(x, y, r, 0, TAU); o.fill();
  }
  if (stone.moon) {
    for (let i = 0; i < 46; i++) {
      o.fillStyle = Math.random() < 0.6 ? "#e8c25a" : "#ffffff";
      o.globalAlpha = rand(0.5, 1);
      sparklePath(o, rand(0, L.ew + PAD * 2), rand(0, L.eh + PAD * 2), rand(1.5, 4.5) * L.k); o.fill();
    }
    o.globalAlpha = 1;
  }
  // speckles, chunky enough to survive as pixels
  for (let i = 0; i < 46; i++) {
    o.fillStyle = `rgba(40,26,40,${rand(0.25, 0.5)})`;
    const sz = rand(1, 2.2) * PX;
    o.fillRect(rand(0, L.ew + PAD * 2), rand(0, L.eh + PAD * 2), sz, sz);
  }
  o.restore();
  const img = o.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const n = (Math.random() - 0.5) * 8;
    d[i] = clamp(d[i] + n, 0, 255); d[i + 1] = clamp(d[i + 1] + n, 0, 255); d[i + 2] = clamp(d[i + 2] + n, 0, 255);
  }
  o.putImageData(img, 0, 0);
  return { canvas: c, ctx: o };
}

/** The colors that play across a stone with a sheen. */
const FLASH = {
  labradorite: ["#2aa3a0", "#3a6fd8", "#d9b13a", "#2aa3a0"],
  opal: ["#ff7ac8", "#5fd0ff", "#9cff8a", "#ffd25f", "#b58cff"],
  moonstone: ["#8fa6ff", "#e8f0ff", "#8fa6ff"],
  sunstone: ["#ff9a4a", "#ffd9a0", "#e8703a", "#ffe0b8", "#ff9a4a"],
  tigereye: ["#5a3410", "#ffd36a", "#7a4a16", "#ffe9a8", "#5a3410", "#e0a84a", "#5a3410"],
};

/** The inside, drawn the way the real mineral looks. */
function makeInterior(crystal, stone) {
  const [main, light, deep] = crystal.c;
  const c = document.createElement("canvas");
  c.width = Math.ceil((L.ew + PAD * 2) * DPR); c.height = Math.ceil((L.eh + PAD * 2) * DPR);
  const o = c.getContext("2d");
  o.setTransform(DPR, 0, 0, DPR, 0, 0);
  const cx = L.ew / 2 + PAD, cy = L.eh / 2 + PAD, k = L.k;
  const ring = (inset, wobble, seed) => eggPoly(cx, cy, L.ew - inset * 2, L.eh - inset * 2).map(([x, y], i, a) => {
    const t = i / a.length * TAU, wv = Math.sin(t * 5 + seed) * wobble + Math.sin(t * 9 + seed * 2) * wobble * 0.5;
    const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1;
    return [x + dx / l * wv, y + dy / l * wv];
  });
  tracePoly(o, ring(0, 0, 0)); o.fillStyle = stone[1]; o.fill();
  tracePoly(o, ring(5 * k, 0, 0)); o.fillStyle = "#f3eef8"; o.fill();
  const banded = crystal.style === "banded";
  // agate, malachite and rhodochrosite fill almost solid with many fine rings
  const bands = banded
    ? Array.from({ length: 16 }, (_, i) => [shade(main, 0.5), main, deep, "#f6f2ff", light, shade(deep, -0.15)][i % 6])
    : [shade(main, 0.55), deep, shade(main, 0.3), "#f6f2ff", main, shade(light, 0.2), deep];
  const bw = L.ew * (banded ? 0.019 : 0.028);
  bands.forEach((col, i) => {
    tracePoly(o, ring(10 * k + i * bw, (banded ? 5 : 3) * k, i * (banded ? 0.6 : 1.7)));
    o.fillStyle = col;
    o.fill();
  });
  const cav = ring(10 * k + bands.length * bw + 2 * k, 4 * k, 9);
  tracePoly(o, cav);
  const cg = o.createRadialGradient(cx, cy, 2, cx, cy, L.ew * 0.32);
  cg.addColorStop(0, shade(light, 0.4));
  cg.addColorStop(0.6, main);
  cg.addColorStop(1, deep);
  o.fillStyle = cg;
  o.fill();
  o.save();
  o.clip();
  // crystal points growing inward from the cavity wall (tiny druzy ones in banded stones)
  const pts = cav.filter((_, i) => i % 2 === 0).sort(() => Math.random() - 0.5);
  for (const [x, y] of pts) {
    const dx = cx - x, dy = cy - y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    const len = (banded ? rand(0.08, 0.16) : rand(0.22, 0.42)) * l, half = (banded ? rand(2, 4) : rand(5, 10)) * k;
    const tx = x + ux * len, ty = y + uy * len, nx = -uy * half, ny = ux * half;
    o.beginPath(); o.moveTo(x + nx, y + ny); o.lineTo(tx, ty); o.lineTo(x, y); o.closePath();
    o.fillStyle = shade(Math.random() < 0.5 ? main : light, 0.25); o.fill();
    o.beginPath(); o.moveTo(x - nx, y - ny); o.lineTo(tx, ty); o.lineTo(x, y); o.closePath();
    o.fillStyle = shade(main, -0.12); o.fill();
    o.strokeStyle = "rgba(255,255,255,.55)"; o.lineWidth = 0.8;
    o.beginPath(); o.moveTo(x, y); o.lineTo(tx, ty); o.stroke();
  }
  for (let i = 0; i < 40; i++) {
    o.fillStyle = `rgba(255,255,255,${rand(0.4, 1)})`;
    const s = rand(0.8, 2);
    o.fillRect(cx + rand(-0.3, 0.3) * L.ew, cy + rand(-0.3, 0.3) * L.eh, s, s);
  }
  o.restore();
  const whole = ring(5 * k, 0, 0);
  if (crystal.style === "flecks") {
    // lapis: gold pyrite specks scattered through the blue
    o.save(); tracePoly(o, whole); o.clip();
    for (let i = 0; i < 110; i++) {
      o.fillStyle = Math.random() < 0.7 ? "#e8c25a" : "#fff3b8";
      o.beginPath(); o.arc(cx + rand(-0.45, 0.45) * L.ew, cy + rand(-0.45, 0.45) * L.eh, rand(0.6, 2.2) * k, 0, TAU); o.fill();
    }
    o.restore();
  }
  if (crystal.style === "flash") {
    // labradorite, opal, moonstone, sunstone and tiger's eye: a sheen of color across the stone (tiger's eye in rolling golden stripes)
    o.save(); tracePoly(o, whole); o.clip();
    const sheen = o.createLinearGradient(cx - L.ew * 0.5, cy - L.eh * 0.5, cx + L.ew * 0.5, cy + L.eh * 0.5);
    const flash = FLASH[crystal.id] || [main, light, main];
    flash.forEach((col, i) => sheen.addColorStop(i / (flash.length - 1), col));
    o.globalAlpha = crystal.id === "moonstone" ? 0.3 : crystal.id === "tigereye" ? 0.55 : 0.4; o.fillStyle = sheen; o.fillRect(0, 0, L.ew + PAD * 2, L.eh + PAD * 2);
    o.restore();
  }
  return c;
}

// ---------- cracking: every tap grows real cracks ----------

// Crack geometry lives in egg units (1 = the egg's width), so it survives resizes and replays the same on every screen.
const EGG_R = 1.28;
const EGG_UNIT = eggPoly(0.5, EGG_R / 2, 0.94, EGG_R * 0.94, 64);
const fromEgg = (u, v) => [L.ex0 + u * L.ew, L.ey0 + v * L.ew];
const toEgg = (x, y) => [(x - L.ex0) / L.ew, (y - L.ey0) / L.ew];

function newEgg(conf, animate = true) {
  const r = Math.random();
  const rarity = r < conf.legendary ? "legendary" : r < conf.legendary + conf.rare ? "rare" : "common";
  const crystal = conf.forced ? conf.forced.crystal : pick(CRYSTALS.filter(c => c.rarity === rarity));
  const species = conf.forced ? conf.forced.species : pick(SPECIES.filter(s => s.crystal === crystal.id && !s.moon));
  const sun = !conf.coop && !conf.forced && animate && save.sunlit > 0;
  if (sun) { save.sunlit--; setTimeout(() => toast(tr("A sunpetal warms this egg ☀️ a far better chance it's shiny")), 600); }
  game.egg = {
    conf, crystal, species, shiny: Math.random() < (conf.moon ? 0.1 : 0.04) + (conf.coop ? 0 : skill("luck") * 0.006) + (sun ? 0.3 : 0), stone: conf.gloom ? GLOOM_STONE : conf.moon ? moonStone() : pick(STONES),
    state: animate ? "entering" : "cracking", t: 0, wob: 0, wobT: 9, squash: 0, open: 0, hop: 0,
    hp: conf.hp, damage: 0, taps: 0, crits: 0, gems: 0, combo: 0, lastTap: -9, hits: [], seed: coopId(),
    net: { segs: [], tips: [] }, painted: 0,
  };
  const e = game.egg;
  // the weak spot: somewhere on the face of the egg, away from the very edge
  // stored the way co-op sends it (height / EGG_R), so host and guest compute with the very same numbers
  for (;;) { const p = [rand(0.25, 0.75), rand(0.3, 1) / EGG_R * EGG_R]; if (inside(EGG_UNIT, p)) { e.spot = p; break; } }
  e.par = Math.ceil(e.hp / 2.6);
  game.gemsShown = 0; game.gems = []; game.pops = [];
  refitEgg(e);
  game.pieces = [];
  updateDots();
  $("lvlPill").textContent = conf.moon ? "🌙" : conf.wander ? tr("Wander") : tr("Lv {0}", conf.n);
  setHint(conf.step === 1 ? tr("tap the egg to crack it · aim for the glow ✦") : conf.step === 4 ? tr("the weak spot hides now: knocks sound higher near it") : conf.step === 10 ? tr("hard stone: find the weak spot by ear") : "");
}

/** Fresh shell and inside for the current layout, with every crack so far drawn back on. */
function refitEgg(e) {
  e.shell = makeShell(e.stone);
  e.interior = makeInterior(e.crystal, e.stone);
  e.painted = 0; e.dentsPainted = 0;
  paintNet(e);
}

const toShell = (x, y) => [x - L.ex0 + PAD, y - L.ey0 + PAD];

function updateDots() {
  const e = game.egg;
  $("dots").firstElementChild.style.width = (e ? clamp(e.damage / e.hp, 0, 1) * 100 : 0) + "%";
}

/** The rest of a crack network: segments [x1, y1, x2, y2, width] and live tips {x, y, a, w} in egg units. */
function nearSeg(net, x, y, skip, r) {
  for (let i = net.segs.length - 1; i >= 0; i--) {
    if (i === skip) continue;
    const [ax, ay, bx, by] = net.segs[i], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1), px = ax + dx * t - x, py = ay + dy * t - y;
    if (px * px + py * py < r * r) return [ax + dx * t, ay + dy * t];
  }
  return null;
}

/**
 * One tap, the way a real eggshell breaks: where the blow lands the shell is crushed into a little cone, straight
 * cracks run out from it like spokes, and as the blows go on, rings of cracks join the spokes into a spider web.
 * Tapping near an impact pushes its spokes further and adds the next ring; tapping somewhere new starts a new web.
 * Spokes stop at the rim and end in a T where they meet an older crack. Everything comes from rng, so a replay is
 * identical on every device.
 */
function crackHit(e, p, power, rng) {
  const net = e.net, [u, v] = p;
  net.impacts = net.impacts || []; net.dents = net.dents || [];
  const weak = clamp(1 - Math.hypot(u - e.spot[0], v - e.spot[1]) / 0.2, 0, 1);
  const crit = weak > 0.45, dmg = power * (1 + weak * 2.2);
  let budget = dmg * 0.2, grown = 0;
  let m = net.impacts.find(m => Math.hypot(m.x - u, m.y - v) < 0.1);
  if (!m) {
    const n = 4 + Math.floor(rng() * 3), a0 = rng() * TAU;
    m = { x: u, y: v, rings: 0, rays: [] };
    for (let i = 0; i < n; i++) {
      // spokes are uneven: some run long, some stop short
      const t = { x: u, y: v, a: a0 + i * TAU / n + (rng() - 0.5) * 0.9, w: 1, len: 0, pull: 0.35 + rng() * 0.9, path: [[u, v, 0]] };
      m.rays.push(t); net.tips.push(t);
    }
    net.impacts.push(m);
    net.dents.push([u, v, 0.02 + rng() * 0.012, Math.floor(rng() * 1e6)]);
  } else net.dents.push([u, v, 0.01 + rng() * 0.008, Math.floor(rng() * 1e6)]);
  // the blow drives the spokes outward, almost straight, one short step at a time
  const step = (t, size) => {
    // straight on the whole, with small sharp kinks: shell breaks along its grain, not in curves
    t.a += (rng() - 0.5) * 0.22 + (rng() < 0.18 ? (rng() - 0.5) * 0.9 : 0);
    let nx = t.x + Math.cos(t.a) * size, ny = t.y + Math.sin(t.a) * size;
    if (!inside(EGG_UNIT, [nx, ny])) { t.dead = true; return 0; }
    const hitAt = net.segs.length > 2 ? nearSeg(net, nx, ny, t.last ?? -1, 0.006) : null;
    if (hitAt && t.len > 0.02) { [nx, ny] = hitAt; t.dead = true; }
    net.segs.push([t.x, t.y, nx, ny, t.w]);
    t.last = net.segs.length - 1; t.x = nx; t.y = ny; t.len += size;
    if (t.path) t.path.push([nx, ny, t.len]);
    grown++;
    return size;
  };
  for (let guard = 0; budget > 0 && guard < 400; guard++) {
    let live = m.rays.filter(t => !t.dead);
    if (!live.length) live = net.tips.filter(t => !t.dead).sort((a, b) => Math.hypot(a.x - u, a.y - v) - Math.hypot(b.x - u, b.y - v)).slice(0, 3);
    if (!live.length) break;
    // the spoke furthest behind its own reach grows next, so lengths stay uneven but none is left a stub
    const t = live.reduce((a, b) => (a.len / (a.pull || 1) <= b.len / (b.pull || 1) ? a : b));
    budget -= step(t, 0.012 + rng() * 0.006) || 0.01;
    // now and then a spoke splits off a thinner branch
    if (!t.dead && t.len > 0.05 && rng() < 0.035) net.tips.push({ x: t.x, y: t.y, a: t.a + (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.4), w: 0.7, len: 0, last: t.last });
  }
  // a ring of cracks joins the spokes once they reach past it (at most one new ring per blow)
  const ringR = 0.045 * Math.pow(1.9, m.rings);
  const reach = m.rays.filter(t => t.len >= ringR * 1.1);
  if (reach.length >= 3) {
    // rings are broken and uneven: each joins two spokes at its own distance, and most gaps stay open
    const at = t => { const r = ringR * (0.75 + rng() * 0.55); return t.path.find(pt => pt[2] >= r) || t.path[t.path.length - 1]; };
    for (let i = 0; i < m.rays.length; i++) {
      const a = m.rays[i], b = m.rays[(i + 1) % m.rays.length];
      if (a.len < ringR || b.len < ringR || rng() < 0.55) continue;
      const pa = at(a), pb = at(b), dx = pb[0] - pa[0], dy = pb[1] - pa[1];
      // a slight outward bow and a kink, so it reads as a broken ring and not a drawn polygon
      const mx = (pa[0] + pb[0]) / 2 + (pa[0] + pb[0] - 2 * m.x) * 0.04 + (rng() - 0.5) * 0.02, my = (pa[1] + pb[1]) / 2 + (pa[1] + pb[1] - 2 * m.y) * 0.04 + (rng() - 0.5) * 0.02;
      if (Math.hypot(dx, dy) > 0.25) continue;
      net.segs.push([pa[0], pa[1], mx, my, 0.65], [mx, my, pb[0], pb[1], 0.65]);
      grown += 2;
    }
    m.rings++;
  }
  net.tips = net.tips.filter(t => !t.dead);
  e.damage += dmg;
  return { dmg, crit, weak, grown };
}

/** Draw what's new on the shell: crushed spots where blows landed, then the cracks (dark, with a pale lit lip). */
function paintNet(e) {
  const o = e.shell.ctx, k = L.k, scale = L.ew;
  const dents = (e.net.dents || []).slice(e.dentsPainted || 0);
  e.dentsPainted = (e.net.dents || []).length;
  for (const [du, dv, dr, seed] of dents) {
    const [cx, cy] = toShell(...fromEgg(du, dv)), r = dr * scale, R = seeded("dent" + seed);
    const pts = Array.from({ length: 7 }, (_, i) => { const a = i / 7 * TAU + (R() - 0.5) * 0.6, rr = r * (0.7 + R() * 0.45); return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; });
    o.save();
    // the crushed cone sits a little lower than the shell: shaded, with the light catching its far rim
    tracePoly(o, pts); o.fillStyle = "rgba(40,24,30,.32)"; o.fill();
    o.lineWidth = 1.1 * k; o.strokeStyle = "rgba(255,250,240,.45)";
    o.beginPath(); pts.slice(3, 7).forEach(([x, y], i) => (i ? o.lineTo(x, y) : o.moveTo(x, y))); o.stroke();
    // tiny flakes of crushed shell inside it
    o.strokeStyle = "rgba(40,22,28,.8)"; o.lineWidth = 0.9 * k;
    for (let i = 0; i < 4; i++) { const a = R() * TAU, q = r * (0.2 + R() * 0.5); o.beginPath(); o.moveTo(cx, cy); o.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); o.stroke(); }
    o.restore();
  }
  const segs = e.net.segs.slice(e.painted);
  if (!segs.length) return;
  e.painted = e.net.segs.length;
  o.save();
  o.lineCap = "round"; o.lineJoin = "round";
  for (const [col, wk, off] of [["rgba(255,250,240,.5)", 1.4, 1.2], ["rgba(40,22,28,.95)", 2.2, 0]]) {
    o.strokeStyle = col;
    for (const [ax, ay, bx, by, w] of segs) {
      const [x1, y1] = toShell(...fromEgg(ax, ay)), [x2, y2] = toShell(...fromEgg(bx, by));
      o.lineWidth = wk * w * k;
      o.beginPath(); o.moveTo(x1 + off * k, y1 + off * k); o.lineTo(x2 + off * k, y2 + off * k); o.stroke();
    }
  }
  o.restore();
}

function carveChip(x, y, r, sides = 0) {
  const o = game.egg.shell.ctx, [sx, sy] = toShell(x, y);
  game.egg.chips = (game.egg.chips || 0) + 1;
  o.save();
  o.globalCompositeOperation = "destination-out";
  o.beginPath();
  // few sides = an angular flake of shell; more sides = a rounder hole
  const n = sides || 6 + Math.floor(rand(0, 3)), spin = rand(0, TAU);
  for (let i = 0; i < n; i++) {
    // ragged: big holes get deep notches, small flakes stay simple
    const a = spin + i / n * TAU + rand(-0.3, 0.3) * 6 / Math.max(6, n), rr = r * (n > 9 && i % 2 ? rand(0.45, 0.75) : rand(0.75, 1.1));
    const px = sx + Math.cos(a) * rr, py = sy + Math.sin(a) * rr;
    i ? o.lineTo(px, py) : o.moveTo(px, py);
  }
  o.closePath();
  o.fill();
  o.globalCompositeOperation = "source-over";
  o.strokeStyle = "rgba(250,244,232,.85)"; o.lineWidth = 1.1 * L.k; o.lineJoin = "miter";
  o.stroke();
  o.restore();
}

function spawnChips(x, y, n, spread = 1, colors = game.egg ? game.egg.stone : ["#fff"]) {
  for (let i = 0; i < n; i++) {
    const a = rand(-Math.PI, 0), v = rand(40, 170) * spread;
    game.chips.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, s: rand(1.5, 4) * Math.max(1, L.k),
      rot: rand(0, 6), vrot: rand(-8, 8), color: pick(colors), t: 0, life: rand(0.9, 1.5),
      floor: game.scene === "crack" ? L.floor + 6 : game.scene === "nest" ? N.y1 : Infinity,
    });
  }
}

function burst(x, y, n, colors, speed = 1) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), v = rand(40, 180) * speed;
    game.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, t: 0, life: rand(0.5, 1.1), s: rand(3, 7) * Math.max(1, L.k), color: pick(colors) });
  }
}

// ---------- the forge: shards buy hammer upgrades that last forever ----------
const FORGE = [
  { id: "heft", name: "Granite Fist", icon: "hammer", cost: [25, 50, 90, 140, 200], what: l => tr("taps hit {0}% harder", l * 15) },
  { id: "eye", name: "Quarry Eye", icon: "eye", cost: [40, 90, 160], what: l => ["", tr("a faint glow shows the weak spot on hard stone"), tr("the weak spot glows brighter"), tr("the weak spot glows even in the deepest caves")][l] },
  { id: "echo", name: "Thunder Echo", icon: "bell", cost: [60, 120, 200], what: l => tr("{0}% of taps ring twice, for 60% more", l * 10) },
  { id: "magpie", name: "Looter's Sack", icon: "pouch", cost: [30, 70, 120, 180], what: l => tr("+{0} {1} from every weak-spot hit", l, pl(l, "shard", "shards")) },
];
const forgeLvl = id => (save.forge && save.forge[id]) || 0;
/** Hammer looks: each shows when you tap the stone (the tool swings, bigger with Granite fist upgrades) and changes the sparks. */
// brutal tools for a cute game: sledges, thorns, picks and cleavers, each drawn as its own pixel silhouette (H h d head, L l handle, S spikes, r g G trim and glow)
const TOOL_SKINS = [
  { id: "classic", name: "Rusty Sledge", cost: 0, note: "old, heavy and honest", head: ["#e4dfe8", "#b9b3c0", "#5d5666"], handle: ["#c98f3a", "#5e3a1c"], r: "#b8603a", g: "#ffffff", G: "#ffffff",
    map: ["................", ".dddddddddddddd.", ".dHHHHHHHHHHHHd.", ".dHrhhhhhhrhhrd.", ".dhhhhrhhhhhhhd.", ".dhhhhhhhhhhhhd.", ".dddddddddddddd.", "......dLLd......", ".......Ll.......", ".......Ll.......", "......rrrr......", "......rLlr......", "......rrrr......", ".......Ll.......", ".......Ll.......", "......dddd......"] },
  { id: "petal", name: "Thorn Maul", cost: 90, note: "a sweet little flower, very sharp thorns", head: ["#ffd0e6", "#ff9ecb", "#c25586"], handle: ["#57ad6a", "#1e5233"], r: "#ffffff", g: "#fff0b5", G: "#ffe9a8", sparks: ["#ffc4da", "#ffffff", "#e88bb1"],
    map: ["...S....S....S..", "...d....d....d..", ".dddddddddddddd.", "SdHHHHHHHHHHHHdS", ".dHhhhhrrhhhhhd.", "SdhhhhrgGrhhhhdS", ".dhhhhhrrhhhhhd.", ".dddddddddddddd.", "...d....d....d..", "...S...LlS...S..", ".......Ll.......", ".......Ll.......", "......dLld......", ".......Ll.......", ".......Ll.......", "......dddd......"] },
  { id: "crystal", name: "Shardbreaker", cost: 120, note: "a pick of raw crystal", head: ["#ffffff", "#9fd0e6", "#4f7fa3"], handle: ["#c9b8ff", "#523a85"], r: "#c9b8ff", g: "#ffffff", G: "#8fd8ef", sparks: ["#ffffff", "#c9b8ff", "#8fd8ef", "#ff9ecb"],
    map: ["................", "Hd............dH", "gHd..........dHg", ".Hhd........dhH.", "..Hhdd....ddhH..", "..dHhhddddhhHd..", "...dhHHgGHHhd...", "....ddhLlhdd....", ".......Ll.......", ".......Ll.......", ".......Ll.......", "......dLld......", ".......Ll.......", ".......Ll.......", ".......Ll.......", "......dddd......"] },
  { id: "ember", name: "Magma Crusher", cost: 140, note: "still glowing hot inside", head: ["#7d1e2c", "#4a1420", "#22143a"], handle: ["#5e3a1c", "#22143a"], r: "#e0634f", g: "#ffe9a8", G: "#e0634f", s: "#c9c2d0", sparks: ["#ffe9a8", "#f2a07b", "#e0634f"],
    map: ["S..............S", ".Sddddddddddddd.", ".dHHHGHHHHHHHHd.", ".dHhhGghhhhhhhd.", "SdhhhhhGghhhhhdS", ".dhhhhhhhGghhhd.", ".dhhhhhhhhGhhhd.", ".Sddddddddddddd.", "S......LL......S", ".......Ll.......", ".......Ll.......", "......rLlr......", ".......Ll.......", ".......Ll.......", ".......Ll.......", "......dddd......"] },
  { id: "moon", name: "Moon Cleaver", cost: 180, note: "rings like a bell on every hit", head: ["#fff8d6", "#eec26a", "#946027"], handle: ["#b8e6f5", "#1d5276"], r: "#b8e6f5", g: "#ffffff", G: "#fff8d6", sparks: ["#fff8d6", "#ffffff", "#b8e6f5"], chime: true,
    map: ["..........ddd...", ".......LldHHHd..", ".......LlhhhHHd.", "..dddd.LlhhhhgHd", ".dHHHHHLlhhhhHHd", "..dddd.LlhhhhHHd", ".......LlhhhHHd.", ".......LldHHHd..", "..........ddd...", ".......Ll.......", ".......Ll.......", "......rLlr......", ".......Ll.......", ".......Ll.......", ".......Ll.......", "......dddd......"] },
  { id: "doom", name: "Skullcracker", cost: 260, note: "with a heart sticker, for balance", head: ["#5d5666", "#3a2440", "#160c26"], handle: ["#3a2440", "#160c26"], r: "#ff8fc0", g: "#e0634f", G: "#ffb070", s: "#c9c2d0", sparks: ["#e0634f", "#ffb070", "#ff8fc0"],
    map: ["S.S..........S.S", "SddddddddddddddS", "dHHHHHHHHHHHHHHd", "dHhhhhhhhhhrhrhd", "dhGGGhhhhGGrrrhd", "dhhhhhhhhhhhrhhd", "dhhhhhhhhhhhhhhd", "SddddddddddddddS", "S.S...dLLd...S.S", ".......Ll.......", "......rrrr......", ".......Ll.......", "......rrrr......", ".......Ll.......", ".......Ll.......", "......dddd......"] }
];
if (LANG === "uk") for (const k of TOOL_SKINS) { k.name = tr(k.name); k.note = tr(k.note); }
const toolSkin = () => TOOL_SKINS.find(k => k.id === save.toolSkin) || TOOL_SKINS[0];
const canForge = () => FORGE.some(f => f.cost[forgeLvl(f.id)] <= save.shards);

/** The first level without stars yet (0 = wander, once everything is cleared). */
const nextLevel = () => { for (let n = 1; n <= LEVELS; n++) if (!save.stars[n] && unlocked(n)) return n; return 0; };

// ---------- today's little tasks: three small goals a day that walk you through everything the game has ----------
const toNest = (then, glow) => () => { setScene("nest"); if (then) then(); if (glow) flashButton(glow); };
const hasPets = () => save.creatures.length > 0;
const TASKS = {
  crack: { text: "Crack open a geode", icon: "egg", ok: () => true, go: () => startLevel(nextLevel()) },
  polish: { text: "Polish a geode to 80% shine", icon: "sparkle", ok: () => true, go: () => startLevel(nextLevel()) },
  feed: { text: "Give a glowling a snack", icon: "cookie", ok: hasPets, go: toNest(null, "feedBtn") },
  pet: { text: "Pet a glowling: stroke it with your finger", icon: "heart", ok: hasPets, go: toNest() },
  catch: { text: "Play sparkle catch", icon: "sparkle", ok: hasPets, go: toNest(null, "playBtn") },
  sweep: { text: "Sweep away a dust bunny", icon: "broom", ok: () => save.creatures.some(c => (c.dust || []).length), go: toNest() },
  forge: { text: "Buy a hammer upgrade at the Forge", icon: "hammer", ok: canForge, go: () => openForge() },
  decor: { text: "Decorate the nest or change its backdrop", icon: "candle", ok: hasPets, go: toNest(null, "decorBtn") },
  moon: { text: "Open today's moon egg", icon: "moon", ok: () => !moonDone(), go: () => startMoon() },
  book: { text: "Look someone up in the Glowpedia", icon: "book", ok: () => true, go: () => setScene("lib") },
  breed: { text: "Lay a mixed egg in the incubator", icon: "heart", ok: () => !save.incubator && save.creatures.filter(c => !pairReason(c)).length >= 2, go: () => { toRoomKind("lab"); openIncubator(); } },
  share: { text: "Send a postcard of a glowling", icon: "postcard", ok: hasPets, go: toNest(null, "nestShare") },
};
const TASK_SHARDS = 10, TASK_BONUS = 15;

/** In Ukrainian, the crystals, lore, snacks, decor, caves, backdrops and tasks get their translated words (glowling names stay as they are). */
(function localizeData() {
  if (LANG !== "uk") return;
  const D = UK_DATA;
  for (const c of CRYSTALS) Object.assign(c, D.crystals[c.id]);
  for (const s of SPECIES) if (D.species[s.id]) s.lore = D.species[s.id].lore;
  for (const id in D.snacks) SNACKS[id].name = D.snacks[id];
  for (const d of DECOR) Object.assign(d, D.decor[d.id]);
  Object.assign(BEHAVIOR_NAMES, D.behaviors);
  STAGES.splice(0, STAGES.length, ...D.stages);
  CAVES.splice(0, CAVES.length, ...D.caves);
  CAVE_NOTES.splice(0, CAVE_NOTES.length, ...D.caveNotes);
  for (const t of THEMES) Object.assign(t, D.themes[t.id] || { name: tr(t.name), how: tr(t.how) });
  for (const id in D.tasks) TASKS[id].text = D.tasks[id];
  for (const f of FORGE) f.name = tr(f.name);
})();

/** Today's three tasks: things you've never done come first, so every part of the game gets its turn. */
function todayTasks() {
  const day = dayKey();
  if (save.tasks && save.tasks.day === day) return save.tasks;
  const ever = save.tasksEver || {}, R = seeded("tasks" + day);
  const pool = Object.keys(TASKS).filter(id => TASKS[id].ok()).map(id => [id, (ever[id] ? 1 : 0) + R() * 0.9]);
  pool.sort((a, b) => a[1] - b[1]);
  save.tasks = { day, ids: pool.slice(0, 3).map(([id]) => id), done: {} };
  persist();
  return save.tasks;
}

/** Something happened that a task might be waiting for. */
function taskDone(id) {
  const t = todayTasks();
  // remember what you've tried (saved straight away, so nothing changes behind a later save's back)
  if (!(save.tasksEver && save.tasksEver[id])) { save.tasksEver = { ...save.tasksEver, [id]: true }; persist(); }
  if (!t.ids.includes(id) || t.done[id]) return;
  t.done[id] = true;
  let gain = TASK_SHARDS;
  const all = t.ids.every(i => t.done[i]);
  if (all) gain += TASK_BONUS;
  save.shards += gain;
  if (all) { giveBar("nut"); bump("taskDays"); }
  persist();
  updateTopbar();
  sfx.star(all ? 2 : 0);
  toast(all ? tr("All of today's tasks done! +{0} ✦", gain) + " · " + tr("{0} +1", barName("nut")) : tr("Task done: {0} · +{1} ✦", TASKS[id].text, gain));
  if (!$("tasks").classList.contains("hidden")) openTasks();
}

function renderTaskPill() {
  const t = todayTasks(), n = t.ids.filter(i => t.done[i]).length;
  $("taskCount").innerHTML = `${ic("tasks")}${n}/${t.ids.length}`;
  $("taskPill").classList.toggle("fresh", n === 0 && !t.seen);
}

function openTasks() {
  sfx.tick();
  const t = todayTasks();
  t.seen = true;
  $("tasksSub").textContent = tr("Each one gives {0} shards, and all three another {1}. New ones tomorrow.", TASK_SHARDS, TASK_BONUS);
  $("taskList").innerHTML = t.ids.map(id => {
    const k = TASKS[id], done = t.done[id];
    return `<div class="task${done ? " done" : ""}">${ic(k.icon, "big")}<span>${k.text}</span>${done ? `<b class="tick">${ic("tasks")}${tr("done")}</b>` : `<button class="act go" data-go="${id}">${tr("Go")}</button>`}</div>`;
  }).join("");
  $$("#taskList .go").forEach(b => b.addEventListener("click", () => { show("tasks", false); TASKS[b.dataset.go].go(); }));
  show("tasks", true);
  renderTaskPill();
}

/** Point at a button for a few seconds: "this one". */
function flashButton(id) {
  const el = $(id);
  if (!el) return;
  el.classList.add("point");
  setTimeout(() => el.classList.remove("point"), 4000);
}

/** How hard a tap hits: the hammer plus its upgrades. Shared eggs use the plain hammer, so both friends are even. */
function tapPower() {
  if (game.egg && game.egg.conf.coop) return { power: 1, echo: false };
  const echo = Math.random() < forgeLvl("echo") * 0.1;
  return { power: Math.round((1 + forgeLvl("heft") * 0.15) * (1 + skill("str") * 0.05) * (echo ? 1.6 : 1) * 100) / 100, echo };
}

function openForge() {
  sfx.tick();
  setTimeout(() => talk("firstForge"), 350);
  $("forgeSub").innerHTML = tr("You have {0}. Upgrades last forever.", ic("shard") + save.shards);
  $("forgeList").innerHTML = FORGE.map(f => {
    const l = forgeLvl(f.id), max = f.cost.length, cost = f.cost[l];
    return `<button class="forge${l >= max ? " maxed" : ""}" data-id="${f.id}" ${l >= max || save.shards < cost ? "disabled" : ""}>${ic(f.icon, "big")}<span class="txt"><b>${f.name}</b><span class="pips">${f.cost.map((_, i) => `<i class="${i < l ? "on" : ""}"></i>`).join("")}</span><small>${l < max ? (l ? tr("next: ") : "") + f.what(l + 1) : f.what(l)}</small></span><span class="cost">${l >= max ? "max" : `${ic("shard")}${cost}`}</span></button>`;
  }).join("");
  $("forgeList").innerHTML += `<h3 class="forge-h">${tr("Hammer looks")}</h3>` + TOOL_SKINS.map(k => {
    const has = !k.cost || (save.toolSkins || {})[k.id], on = toolSkin().id === k.id;
    return `<button class="forge skin${on ? " maxed" : ""}" data-skin="${k.id}" ${!has && save.shards < k.cost ? "disabled" : ""}><img class="skin-img" src="${hammerImage(k)}" alt=""><span class="txt"><b>${k.name}</b><small>${k.note}</small></span><span class="cost">${on ? tr("in hand ✓") : has ? tr("owned") : `${ic("shard")}${k.cost}`}</span></button>`;
  }).join("");
  // (all the markup first: adding to innerHTML afterwards would rebuild the buttons and drop their listeners)
  $("forgeList").innerHTML += workbenchList();
  $$("#forgeList .forge:not(.skin):not(.craft)").forEach(b => b.addEventListener("click", () => buyForge(b.dataset.id)));
  $$("#forgeList .skin").forEach(b => b.addEventListener("click", () => pickSkin(b.dataset.skin)));
  $$("#forgeList [data-craft]").forEach(b => b.addEventListener("click", () => craft(b.dataset.craft)));
  show("forge", true);
}

// ---------- the workbench: spare geodes (every one past the first of its kind) melt down into useful things ----------

const RECIPES = [
  { id: "nut", rarity: "common", need: 3, name: "Nut bar", note: "+3 lantern oil", icon: () => pxIcon("barNut"), give: () => giveBar("nut") },
  { id: "seeds", rarity: "common", need: 2, name: "A bundle of seeds", note: "glowberry, moon mint and starfruit, two of each", icon: () => plantImage("glowberry", 3), give: () => { const g = garden().seeds; for (const k of ["glowberry", "moonmint", "cookiecorn"]) g[k] = (g[k] || 0) + 2; } },
  { id: "star", rarity: "rare", need: 3, name: "Star bar", note: "fills the lantern to the brim", icon: () => pxIcon("barStar"), give: () => giveBar("star") },
  { id: "shards", rarity: "legendary", need: 1, name: "150 shards", note: "a legendary spare, cut and sold", icon: () => pxIcon("shard"), give: () => { save.shards += 150; } },
];
/** How many spare geodes of a rarity you have (the first of each kind stays in the book). */
const spares = rarity => CRYSTALS.filter(c => c.rarity === rarity).reduce((n, c) => n + Math.max(0, ((save.geodes[c.id] || {}).count || 0) - 1), 0);
function craft(id) {
  const r = RECIPES.find(x => x.id === id);
  if (!r || spares(r.rarity) < r.need) return;
  // the spares come from the kinds you have most of
  for (let k = 0; k < r.need; k++) {
    const c = CRYSTALS.filter(x => x.rarity === r.rarity && ((save.geodes[x.id] || {}).count || 0) > 1).sort((p, q) => save.geodes[q.id].count - save.geodes[p.id].count)[0];
    save.geodes[c.id].count--;
  }
  r.give(); bump("crafted"); sfx.levelUp(); buzz([12, 30, 12]);
  toast(tr("Made at the workbench: {0} ✦", tr(r.name)));
  persist(); updateTopbar(); openForge();
}
const RARITY_WORD = { common: "common ones", rare: "rare ones", legendary: "legendary ones" };
function workbenchList() {
  return `<h3 class="forge-h">${tr("Workbench")}</h3><p class="me-hint">${tr("Every geode past the first of its kind is a spare. The first one always stays in the book; spares melt down into useful things here.")}</p>`
    + RECIPES.map(r => {
      const have = spares(r.rarity);
      return `<button class="forge craft" data-craft="${r.id}" ${have < r.need ? "disabled" : ""}><img class="skin-img" src="${r.icon()}" alt=""><span class="txt"><b>${tr(r.name)}</b><small>${tr(r.note)}</small></span><span class="cost">${tr("{0} {1} spares", r.need, tr(RARITY_WORD[r.rarity]))}<em>${tr("you have {0}", have)}</em></span></button>`;
    }).join("");
}

/** Buy a hammer look (once), or switch to one you own. */
function pickSkin(id) {
  const k = TOOL_SKINS.find(x => x.id === id);
  if (!k) return;
  save.toolSkins = save.toolSkins || {};
  if (k.cost && !save.toolSkins[id]) {
    if (save.shards < k.cost) return;
    save.shards -= k.cost; save.toolSkins[id] = true; sfx.levelUp();
  } else sfx.tick();
  save.toolSkin = id;
  toast(tr("{0} in hand ✦", k.name));
  persist(); updateTopbar(); openForge();
}
/** A tool's pixel silhouette with a dark outline, 18×18 (cached). */
const toolSprites = {};
function toolSprite(k) {
  if (toolSprites[k.id]) return toolSprites[k.id];
  const col = { H: k.head[0], S: k.s || k.head[0], h: k.head[1], d: k.head[2], L: k.handle[0], l: k.handle[1], r: k.r, g: k.g, G: k.G };
  const c = document.createElement("canvas"); c.width = c.height = 18;
  const g = c.getContext("2d"), solid = (x, y) => k.map[y]?.[x] && k.map[y][x] !== ".";
  for (let y = -1; y <= 16; y++) for (let x = -1; x <= 16; x++) {
    if (solid(x, y)) { g.fillStyle = col[k.map[y][x]]; g.fillRect(x + 1, y + 1, 1, 1); }
    else if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) { g.fillStyle = "#160c26"; g.fillRect(x + 1, y + 1, 1, 1); }
  }
  return toolSprites[k.id] = c;
}
/** A tool for the Forge list. */
const hammerImage = k => toolSprite(k).toDataURL();

function buyForge(id) {
  const f = FORGE.find(f => f.id === id), l = forgeLvl(id), cost = f.cost[l];
  if (cost === undefined || save.shards < cost) return;
  save.shards -= cost;
  save.forge = { ...save.forge, [id]: l + 1 };
  sfx.levelUp();
  buzz([12, 30, 12]);
  toast(tr("{0} · level {1} ✦", f.name, l + 1));
  taskDone("forge");
  persist();
  updateTopbar();
  openForge();
  const card = document.querySelector(`#forgeList [data-id="${id}"]`);
  if (card) card.classList.add("forged");
}

/** A tap on the egg: crack it, pop numbers and shards, shake. Hosts and solo players run this; guests replay it. */
function hitEgg(x, y) {
  const e = game.egg;
  if (!e || e.state !== "cracking" || !inside(L.egg, [x, y])) return;
  const [u, v] = toEgg(x, y), { power, echo } = tapPower(), hit = [u, v / EGG_R, power];
  e.hits.push(hit);
  const res = crackHit(e, [hit[0], hit[1] * EGG_R], power, seeded(e.seed + ":" + (e.hits.length - 1)));
  e.taps++;
  if (res.crit) e.crits++;
  e.combo = game.time - e.lastTap < 700 ? e.combo + 1 : 1;
  e.lastTap = game.time;
  const gems = 1 + (res.crit ? 2 + (e.conf.coop ? 0 : forgeLvl("magpie")) : 0) + Math.floor(e.combo / 4);
  e.gems += gems;
  markTip("tap");
  if (e.taps === 3 && e.conf.step === 1) setHint("");
  hitFeedback(e, x, y, res, gems, echo);
  if (e.damage >= e.hp) openEgg();
}

/** Everything you see and hear when a hit lands (also used when a co-op guest replays the host's hits). */
function hitFeedback(e, x, y, res, gems, echo = false) {
  paintNet(e);
  const prog = clamp(e.damage / e.hp, 0, 1);
  e.wob = 0.02 + prog * 0.04 + (res.crit ? 0.03 : 0); e.wobT = 0; e.squash = 1;
  game.shake = Math.min(14, game.shake + (res.crit ? 7 : 3) + prog * 3) * Math.max(0.5, L.k);
  if (res.crit) game.freeze = 0.06;
  pop(res.crit ? tr("CRIT {0}", res.dmg.toFixed(1)) : res.dmg.toFixed(1), x, y - 14 * L.k, res.crit ? "#ffe9a8" : "#ffffff", res.crit ? 1.5 : 1);
  if (e.combo >= 3) pop(`×${e.combo}`, x + 34 * L.k, y - 40 * L.k, "#8fd8ef", 0.9);
  if (echo) {
    // the bell echo: a second ring a beat later
    pop("ECHO", x - 34 * L.k, y - 30 * L.k, "#eec26a", 1.1);
    setTimeout(() => { sfx.knock(res.weak * 0.6); game.ripples.push({ x, y, t: 0, r: 60 * L.k, h: 1 }); }, 110);
  }
  if (Math.random() < 0.6) carveChip(x, y, rand(1.2, 2.4) * L.k, 3);
  spawnChips(x, y, 3 + Math.round(prog * 5) + (res.crit ? 4 : 0), 1 + prog);
  if (res.crit) burst(x, y, 10, ["#fff", ...e.crystal.c], 1.3);
  const skin = toolSkin();
  game.swings.push({ x, y, t: game.time, skin });
  if (skin.sparks) burst(x, y, res.crit ? 8 : 5, skin.sparks, 0.9);
  if (skin.chime && sfx.ready()) sfx.tone(sfx.ac.currentTime + 0.02, 1568 + res.weak * 400, 0.02, 0.5, "sine", null, true);
  flyGems(x, y, gems);
  sfx.knock(res.weak);
  if (res.grown) sfx.crackle(Math.min(res.grown, 12));
  game.ripples.push({ x, y, t: 0, r: (20 + res.weak * 50) * L.k, h: res.weak });
  buzz(res.crit ? 18 : 7);
  if (e.conf.spotGlow < 0.5 && res.weak > 0.2 && !res.crit) floatText("closer…", x, y - 30 * L.k, "#e6e0ff");
  updateDots();
}

/** Damage numbers that pop out and float up, with a dark outline so they read on any stone. */
function pop(text, x, y, color, size = 1) {
  // fast taps used to pile numbers on top of each other: now each new one flies out to the other side, the ones
  // already up get pushed a little higher, and only the newest few stay (older ones fade out quickly)
  const live = game.pops.filter(p => p.t < p.life * 0.7);
  live.forEach((p, i) => { p.y -= 12 * Math.max(1, L.k); if (live.length - i > 3) p.t = Math.max(p.t, p.life * 0.75); });
  game.popSide = -(game.popSide || 1);
  game.pops.push({ text, x: x + game.popSide * rand(6, 18), y: y + rand(-4, 4), vx: game.popSide * rand(40, 90), vy: -rand(110, 160), t: 0, life: live.length > 2 ? 0.7 : 0.9, color, size });
}

/** Shards burst out of the hit, hang for a moment, then fly up into the counter. */
function flyGems(x, y, n) {
  const box = $("clock").getBoundingClientRect(), tx = box.left + box.width / 2, ty = box.top + box.height / 2;
  for (let i = 0; i < n; i++) {
    const a = rand(-Math.PI, 0), v = rand(80, 200);
    game.gems.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: -i * 0.04, tx, ty, color: pick(game.egg.crystal.c) });
  }
}

function openEgg() {
  markTip("open");
  const e = game.egg;
  e.state = "opening"; e.t = 0;
  // a jagged line around the middle, with big teeth and small ones, like a cracked shell
  const k = L.k, by = L.ecy + rand(-0.08, 0.02) * L.eh, x0 = L.ex0 - 12, x1 = L.ex0 + L.ew + 12, line = [];
  let drift = 0;
  for (let i = 0, n = 26; i <= n; i++) {
    drift = clamp(drift + rand(-3, 3) * k, -8 * k, 8 * k);
    const tooth = (Math.random() < 0.65 ? (i % 2 ? -1 : 1) : (Math.random() < 0.5 ? -1 : 1)) * rand(1.5, 6) * k * (Math.random() < 0.15 ? 2.2 : 1);
    line.push([lerp(x0, x1, i / n) + rand(-2, 2) * k, by + drift + tooth]);
  }
  const top = [...line, [x1, L.ey0 - 20], [x0, L.ey0 - 20]];
  const bottom = [...line, [x1, L.ey0 + L.eh + 20], [x0, L.ey0 + L.eh + 20]];
  const side = Math.random() < 0.5 ? -1 : 1;
  // the top pops up and tumbles to one side; the bottom drops and falls away
  game.pieces.push({ poly: top, edge: line, c: [L.ecx, L.ecy - L.eh * 0.25], dx: 0, dy: 0, vx: side * rand(90, 150) * k, vy: -rand(320, 380) * k, rot: 0, vrot: side * rand(1.5, 2.5), t: 0 });
  game.pieces.push({ poly: bottom, edge: line, c: [L.ecx, L.ecy + L.eh * 0.25], dx: 0, dy: 0, vx: -side * rand(20, 50) * k, vy: rand(40, 80) * k, rot: 0, vrot: -side * rand(0.3, 0.7), t: 0 });
  // a few small fragments break off along the line
  for (let i = 0; i < 4; i++) {
    const [fx, fy] = line[2 + Math.floor(rand(0, line.length - 4))], r = rand(3, 6) * k;
    const frag = [0, 1, 2, 3].map(j => [fx + Math.cos(j * 1.6 + rand(-0.4, 0.4)) * r * rand(0.6, 1), fy + Math.sin(j * 1.6 + rand(-0.4, 0.4)) * r * rand(0.6, 1)]);
    game.pieces.push({ poly: frag, c: [fx, fy], dx: 0, dy: 0, vx: rand(-160, 160) * k, vy: -rand(120, 260) * k, rot: 0, vrot: rand(-6, 6), t: 0 });
  }
  burst(L.ecx, L.ecy, 36, ["#fff", ...e.crystal.c], 1.6);
  spawnChips(L.ecx, L.ecy, 24, 1.8);
  sfx.burst(e.crystal.rarity);
  buzz([20, 40, 20]);
  setHint("");
}

// ---------- polishing the cut face ----------

/** A frosted, matte film over the inside that rubbing wears away. */
function startPolish() {
  const e = game.egg;
  e.state = "polish"; e.t = 0;
  const c = document.createElement("canvas");
  c.width = Math.ceil((L.ew + PAD * 2) * DPR); c.height = Math.ceil((L.eh + PAD * 2) * DPR);
  const o = c.getContext("2d");
  o.setTransform(DPR, 0, 0, DPR, 0, 0);
  tracePoly(o, eggPoly(L.ew / 2 + PAD, L.eh / 2 + PAD, L.ew - 10 * L.k, L.eh - 10 * L.k));
  o.fillStyle = "rgba(220,214,232,.74)";
  o.fill();
  const img = o.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { const n = (Math.random() - 0.5) * 40; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  o.putImageData(img, 0, 0);
  // a coarse grid tracks how much of the face has been polished
  const cell = 12 * L.k, cells = [];
  for (let y = L.ey0; y < L.ey0 + L.eh; y += cell) for (let x = L.ex0; x < L.ex0 + L.ew; x += cell) {
    if (inside(eggPoly(L.ecx, L.ecy, L.ew - 24 * L.k, L.eh - 24 * L.k, 48), [x + cell / 2, y + cell / 2])) cells.push({ x: x + cell / 2, y: y + cell / 2, done: false });
  }
  // rev 1: the frosted face is drawn straight away (the picture of the inside was cached before the frost existed)
  e.matte = { canvas: c, ctx: o, cells, done: 0, shine: 0, rev: 1 };
  setHint(tr("rub the geode with your finger to polish it ✦"));
  $("polishDone").hidden = false; polishLabel(0);
  if (!e.conf.coop) talk("firstPolish");
}

function rub(x, y, d, dt) {
  const e = game.egg, m = e.matte;
  if (!m || e.state !== "polish") return;
  const r = 22 * L.k, [sx, sy] = toShell(x, y);
  m.ctx.save();
  m.ctx.globalCompositeOperation = "destination-out";
  const g = m.ctx.createRadialGradient(sx, sy, 1, sx, sy, r);
  g.addColorStop(0, "rgba(0,0,0,.45)"); g.addColorStop(1, "rgba(0,0,0,0)");
  m.ctx.fillStyle = g;
  m.ctx.beginPath(); m.ctx.arc(sx, sy, r, 0, TAU); m.ctx.fill();
  m.ctx.restore();
  m.rev = (m.rev || 0) + 1;
  for (const c of m.cells) {
    if (c.done || (c.x - x) ** 2 + (c.y - y) ** 2 > (r * 0.8) ** 2) continue;
    c.hits = (c.hits || 0) + 1;
    if (c.hits >= 3) { c.done = true; m.done++; }
  }
  m.shine = m.done / m.cells.length;
  polishLabel(m.shine);
  sfx.rubSet(m.shine, d / Math.max(dt, 0.008));
  if (Math.random() < 0.25) game.sparks.push({ x: x + rand(-r, r) * 0.5, y: y + rand(-r, r) * 0.5, vx: 0, vy: -20, t: 0, life: 0.5, s: rand(3, 6), color: "#fff" });
  if (m.shine >= 0.9) finishPolish();
}

/** The button shows how shiny it is so far, so rubbing visibly does something. */
function polishLabel(shine) {
  const t = tr("✨ Shiny enough") + " · " + Math.round(shine * 100) + "%";
  if ($("polishDone").textContent !== t) $("polishDone").textContent = t;
}

function finishPolish() {
  const e = game.egg;
  if (e.state !== "polish") return;
  markTip("polish");
  sfx.rubOff();
  e.state = "gleam"; e.t = 0;
  // polished all the way: the last bits of frost vanish
  if (e.matte.shine >= 0.9) { e.matte.ctx.clearRect(0, 0, e.matte.canvas.width, e.matte.canvas.height); e.matte.shine = 1; }
  $("polishDone").hidden = true;
  setHint("");
  sfx.gleam();
  burst(L.ecx, L.ecy, 20, ["#fff", ...e.crystal.c], 1.2);
}

// ---------- results: stars, shards, a new friend ----------

function geodeImage(withCreature = true, width = 0) {
  const e = game.egg, s = width ? width / (L.ew + PAD * 2) : 0.75;
  const c = document.createElement("canvas");
  c.width = Math.round((L.ew + PAD * 2) * s); c.height = Math.round((L.eh + PAD * 2) * s);
  const o = c.getContext("2d");
  o.scale(s, s);
  o.drawImage(e.interior, 0, 0, L.ew + PAD * 2, L.eh + PAD * 2);
  if (e.matte) o.drawImage(e.matte.canvas, 0, 0, L.ew + PAD * 2, L.eh + PAD * 2);
  drawGloss(o, L.ew / 2 + PAD, L.eh / 2 + PAD, 0.3 + (e.matte ? e.matte.shine : 0) * 0.6);
  if (withCreature) drawCreature(o, L.ew / 2 + PAD, L.eh / 2 + PAD + L.eh * 0.04, L.ew * 0.34, e.species, { t: 1000, mood: "happy", shiny: e.shiny });
  return c.toDataURL("image/png");
}

/** Hatch: the glowling joins your nest (or, if you already have one, its sibling visit gives XP). */
function adopt(e) {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  const sp = e.species;
  const seen = save.seen[sp.id] || { count: 0, first: Date.now() };
  const isNew = seen.count === 0;
  seen.count++;
  save.seen[sp.id] = seen;
  // the glowpedia keeps your shiniest geode of each kind
  const shine = e.matte ? e.matte.shine : 0;
  const geo = save.geodes[e.crystal.id] || { count: 0, shine: -1 };
  if (shine > (geo.shine ?? -1)) { geo.img = geodeImage(false, 150); geo.shine = shine; }
  geo.count++;
  save.geodes[e.crystal.id] = geo;
  let mine = save.creatures.find(c => c.sp === sp.id && !!c.shiny === e.shiny);
  let note = "";
  if (mine) {
    applyTime(mine);
    addXP(mine, 40);
    mine.joy = clamp(mine.joy + 20, 0, 100);
    note = tr("Your {0} met a sibling: +40 XP and lots of joy ✦", mine.name);
    adopt.sibling = true;
  } else {
    mine = { id: save.nextId++, sp: sp.id, name: (e.shiny ? "✦ " : "") + sp.name, shiny: e.shiny, level: 1, xp: 0, tummy: 70, joy: 80, energy: 80, sleeping: false, last: Date.now(), born: Date.now() };
    save.creatures.push(mine);
    adopt.sibling = false;
    note = e.shiny ? tr("A shiny one! It sparkles in your nest now ✦") : tr("{0} moved into your nest", sp.name);
    if (!e.conf.coop) remember(mine, e.conf.gloom ? "Freed from the Gloom's seal at the end of the {0}" : e.conf.moon ? "Hatched from a moon egg 🌙" : "Hatched from a {0} geode", e.conf.gloom ? CAVES[e.conf.gloom - 1] : e.crystal.name);
  }
  save.active = mine.id;
  return { isNew, note, mine };
}

function showFound() {
  const e = game.egg, sp = e.species, conf = e.conf, cry = e.crystal;
  if (conf.coop && e.coopRewarded) return;
  if (conf.coop) e.coopRewarded = true;
  // fewer taps, more stars: finding the weak spot is the whole trick
  const stars = e.taps <= e.par ? 3 : e.taps <= Math.ceil(e.par * 1.7) ? 2 : 1;
  const firstClear = !conf.wander && !save.stars[conf.n];
  const shine = e.matte ? e.matte.shine : 0;
  const moonBonus = conf.moon ? finishMoon() : 0;
  let shards = 8 + stars * 4 + Math.floor(conf.step / 2) + (firstClear ? 10 : 0) + e.gems + Math.round(shine * 10) + moonBonus;
  // a well-rested, happy glowling cheers you on: a few more shards (the one you'd picked before this egg)
  const buddy = !conf.coop && activeCreature();
  let cheer = 0;
  if (buddy && !buddy.out && !buddy.sleeping) { applyTime(buddy); if (buddy.energy >= 75 && buddy.joy >= 70) cheer = Math.max(2, Math.round(shards * 0.15)); }
  shards += cheer;
  if (!conf.wander) save.stars[conf.n] = Math.max(save.stars[conf.n] || 0, stars);
  save.shards += shards;
  // now and then a bar turns up in the rubble
  const r = Math.random(), rubble = conf.coop || conf.moon ? null : r < 0.03 * (1 + skill("luck") * 0.25) ? "nut" : r < 0.13 * (1 + skill("luck") * 0.25) ? "firefly" : null;
  if (rubble) giveBar(rubble);
  const { isNew, note, mine } = adopt(e);
  if (conf.gloom) { bump("rescued"); save.shards += 30; talkLater.push(["g" + conf.gloom + "win"]); }
  if (!conf.coop && e.shiny) talkLater.push(["shiny", mine]);
  else if (!conf.coop && rarityOf(sp) === "legendary") talkLater.push(["legendary", mine]);
  persist();
  checkThemes();
  taskDone("crack");
  if (shine >= 0.8) taskDone("polish");
  if (!conf.coop) { bump("cracked"); if (e.shiny) bump("shiny"); }

  $("stars").innerHTML = [0, 1, 2].map(i => i < stars ? `<b style="animation-delay:${0.3 + i * 0.25}s">★</b>` : "★").join("");
  for (let i = 0; i < stars; i++) setTimeout(() => sfx.star(i), 300 + i * 250);
  $("foundImg").src = geodeImage();
  // the same picture as a pixel sprite, once it's drawn
  imgFrom($("foundImg").src).then(im => { $("foundImg").src = pixelate(im, 66, 88).toDataURL(); });
  $("newBadge").hidden = !isNew;
  $("foundName").textContent = (e.shiny ? "✦ " : "") + sp.name;
  $("foundRarity").textContent = sp.moon ? moonKind(sp) : tr("{0} geode · {1}", cry.name, rarF(cry.rarity));
  $("foundRarity").className = `rarity r-${rarityOf(sp)}`;
  $("foundLore").textContent = sp.lore;
  $("foundFact").textContent = `💎 ${cry.fact}`;
  $("foundNote").textContent = (conf.coop ? tr("Shared egg · ") : "") + note + (conf.moon ? tr(" · moon streak {0} 🔥", save.moon.streak) : "") + (rubble ? tr(" · {0} in the rubble", barName(rubble)) : "") + (cheer ? tr(" · cheered on by {0}: +{1} ✦", buddy.name, cheer) : "");
  $("stShine").textContent = Math.round(shine * 100) + "%";
  $("stTaps").textContent = e.taps;
  $("stPar").textContent = tr("taps · ★ in {0}", e.par);
  $("stCrits").textContent = e.crits;
  $("stShards").textContent = "+" + shards;
  $("foundMap").hidden = !!conf.moon;
  // the nest is the other half of the game: say who's waiting there, so it's not just egg after egg
  $("foundNestLabel").textContent = tr("Go to the nest");
  $("foundNestSub").textContent = adopt.sibling ? tr("{0} met a sibling: +40 XP", mine.name) : tr("{0} is waiting for you", mine.name);
  $("nextLvl").textContent = conf.coop ? (coopIsHost() ? tr("Another shared egg") : tr("Waiting for host")) : conf.moon ? tr("Back to the grotto") : conf.wander ? tr("Another egg") : conf.n >= LEVELS ? tr("Wander on") : tr("Next level");
  $("nextLvl").disabled = !!conf.coop && !coopIsHost();
  updateTopbar();
  show("found", true);
  if (conf.coop) coopBroadcast(true); // deliver the result before a host can send the next egg
}

// ---------- dialogs: Mossa, the old stone who keeps the grotto, talks you through the big moments ----------

const MOSSA = { name: "Mossa", face: () => pxIcon("mossa"), voice: { f: 190, wave: "triangle", spread: 0.22, glide: 0.92, gain: 0.07, len: 0.07 } };
const glowVoice = cr => ({ name: cr.name, face: () => creatureImage(specOf(cr), { art: 32, level: cr.level, shiny: cr.shiny }),
  voice: { f: 640 * (specOf(cr).voice || 1), wave: "square", spread: 0.4, glide: 1.3, gain: 0.03, len: 0.05 } });
const firstPet = () => save.creatures[0];

/** Each one plays once. A line is [speaker, words]; words can use {0} for the event's detail. */
/** Things Mossa can point at on the canvas: your glowling, and the egg you're cracking. */
function spotActor() {
  const a = game.scene === "nest" && activeActor();
  if (!a) return null;
  const v = actorView(a), r = v.size * 0.62;
  return { x: v.x - r, y: v.y - r * 1.05, w: r * 2, h: r * 2, round: true };
}
const spotEgg = () => game.scene === "crack" ? { x: L.ex0 - 8, y: L.ey0 - 8, w: L.ew + 16, h: L.eh + 16, round: true } : null;

/** Each line is [who, words, what to point at]: a selector for a button or panel, or one of the canvas spots above. */
const TALKS = {
  intro: () => [[MOSSA, "Oh! A visitor. Hello, hello."], [MOSSA, "I'm Mossa. I've watched over this grotto since before the moss was green."],
    [MOSSA, "Glowlings sleep inside the stone eggs down here. Crack one open, and whoever's inside will need a home.", "#crackTab"],
    [MOSSA, "This empty nest is yours. Let's go and find your first one!", "#firstEgg"]],
  meet: () => [[MOSSA, "Oh! And we've never been properly introduced. What should I call you?"]],
  firstPet: () => { const cr = firstPet(), g = glowVoice(cr); return [[g, "Pip?", spotActor], [g, "...pip-pip! ♥", spotActor],
    [MOSSA, tr("{0} likes you already. Glowlings remember a kind hand.", cr.name), spotActor],
    [MOSSA, "Stroke it, feed it, play with it, and tuck it in when it's sleepy. That's how it grows.", "#nestBottom .acts"],
    [MOSSA, "When you want another egg, the big Crack button is always right there. Your nest has room for many.", "#crackTab"]]; },
  firstGrow: cr => [[glowVoice(cr), "Pip! Pip-pip-pip!", spotActor], [MOSSA, tr("Look at {0}! Not a baby anymore.", cr.name), spotActor],
    [MOSSA, "Glowlings grow when they're loved. Keep it up, and one day it will be Radiant.", "#xpBar"]],
  firstGrotto: () => [[MOSSA, "This is the Grotto. Every level is a geode, each a little harder than the last.", "#mapList .lvl.next"],
    [MOSSA, "Find the weak spot and you'll need fewer taps. Fewer taps, more stars.", "#mapList .lvl.next"],
    [MOSSA, "And look up: once a day a moon egg appears. Something special sleeps in it.", "#moonBtn"]],
  firstExplore: cap => [[MOSSA, tr("The nest is cozy, but small: {0} glowlings fit at home at once.", cap)], [MOSSA, "The others are out exploring the grotto, having a lovely time. Tap the glowlings button below to see who lives where, and call them home.", "#residentsBtn"]],
  firstPolish: () => [[MOSSA, "The inside is frosty. Rub it with your finger to make it shine.", spotEgg], [MOSSA, "The shinier it gets, the more shards you earn. Tap the button when you're happy with it.", "#polishDone"]],
  firstForge: () => [[MOSSA, "Ah, the Forge. My old hammer is still here somewhere."],
    [MOSSA, "Spend shards here and your taps hit harder, your eyes get keener. The deep stone will need it.", "#forgeList"]],
  ch1: () => [[MOSSA, tr("Did you feel that? The {0} has opened up.", CAVES[1])], [MOSSA, "The stone gets harder from here on. The Forge can help: it's on the map.", "#worldTab"]],
  ch2: () => [[MOSSA, tr("Did you feel that? The {0} has opened up.", CAVES[2])], [MOSSA, "Down there you find the weak spot by ear. Listen for the knocks that ring higher."]],
  ch3: () => [[MOSSA, tr("Did you feel that? The {0} has opened up.", CAVES[3])], [MOSSA, "The oldest, toughest stone. And the rarest glowlings sleep in it."]],
  shiny: cr => [[glowVoice(cr), "✦ Pip! ✦"], [MOSSA, "Oh my. A shiny one! I've only seen a handful in all my years."]],
  legendary: cr => [[glowVoice(cr), "...Pip."], [MOSSA, tr("A legendary glowling... They say {0} only wakes for someone kind. Well done, you.", cr.name)]],
  allClear: () => [[MOSSA, "Every geode in the grotto, opened. I'm so proud of you."],
    [MOSSA, "But the deep caves never end. Wander down whenever you like. I'll keep the moss warm.", "#mapList .wander"]],
};

// ---------- the Gloom: a cold dark from the deep that seals the sparks in dead stone; at the end of each cave, one to rescue ----------

const GLOOM = { name: "the Gloom", icon: "gloom", face: () => pxIcon("gloom"), voice: { f: 95, wave: "sawtooth", spread: 0.12, glide: 0.8, gain: 0.05, len: 0.1 } };
const GLOOM_STONE = Object.assign(["#3a2a52", "#1a1028", "#6b4fa8"], { gloom: true });
/** Before the sealed geode at the end of cave k (1..4), the Gloom has its say; after it opens, your friends have theirs. */
const GLOOM_TALKS = {
  g1: () => [[GLOOM, "Another little light... how annoying."], [GLOOM, "These sparks are mine. They sleep in my cold, and they'll stay asleep."],
    [MOSSA, tr("{0}, don't listen to it. Crack the seal: the spark inside is frightened!", myName())]],
  g1win: () => [[MOSSA, "You did it! The Gloom let go of that one."], [MOSSA, "It's been creeping up from the deep since the Heartlight broke. It can't stand anything warm."]],
  g2: () => [[GLOOM, tr("You again. Do you know what I am, {0}?", myName())], [GLOOM, "I'm what's left when the light goes out. Every spark you wake is one less for me."]],
  g2win: () => [[MOSSA, "It's afraid of you. I can feel the stone getting warmer."]],
  g3: () => [[GLOOM, "The Heartlight hid from me in a thousand pieces. Clever."], [GLOOM, "But little pieces are easy to snuff out."],
    [DORMA, "So that's why it gave itself away... to hide its light from the Gloom!"]],
  g3win: () => [[WICK, "Did you see it flinch? Ha! I'm telling everyone."]],
  g4: () => [[GLOOM, "This is the last one. The oldest spark of all."], [GLOOM, "Wake it, and there'll be nowhere left in the deep for me to hide."],
    [MOSSA, tr("Then let's light up every corner. Together, {0}.", myName())]],
  g4win: () => [[MOSSA, "The Gloom has left the deep caves. Not forever, maybe... but every nest that glows keeps it away."],
    [MOSSA, tr("Thank you, {0}. You're a true keeper now.", myName())]],
};
Object.assign(TALKS, GLOOM_TALKS);
/** The cold creeping in round a sealed geode: dark at the edges that breathes, and two red eyes watching from it. */
function drawGloom() {
  const e = game.egg;
  if (!e || !e.conf.gloom || e.state === "opening" || e.state === "done") return;
  const k = 0.75 + 0.25 * Math.sin(game.time * 0.0017), g = ctx.createRadialGradient(L.ecx, L.ecy, L.ew * 0.55, L.ecx, L.ecy, Math.max(W, H) * 0.75);
  g.addColorStop(0, "rgba(10,4,20,0)"); g.addColorStop(1, `rgba(10,4,20,${0.85 * k})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // the eyes blink now and then
  if ((game.time / 3200) % 1 > 0.06) {
    const ex = W * 0.16, ey = H * 0.22, s = Math.max(3, Math.round(W / 110));
    ctx.fillStyle = `rgba(224,99,79,${0.55 + 0.35 * k})`;
    ctx.fillRect(Math.round(ex), Math.round(ey), s * 2, s); ctx.fillRect(Math.round(ex + s * 4), Math.round(ey), s * 2, s);
  }
}

// ---------- the story: why the glowlings sleep in stone, told a little at a time as you go deeper ----------

const WICK = { name: "Wick", face: () => pxIcon("wick"), voice: { f: 420, wave: "sawtooth", spread: 0.3, glide: 1.1, gain: 0.025, len: 0.05 } };
const DORMA = { name: "Dorma", face: () => pxIcon("dorma"), voice: { f: 260, wave: "sine", spread: 0.15, glide: 0.85, gain: 0.08, len: 0.09 } };
/** Each part opens with a level of the grotto and plays once; the book keeps them all to read again. */
const STORY = [
  { id: "s1", at: 3, title: "The Heartlight", who: MOSSA, lines: () => [
    [MOSSA, "You have a gentle touch. Shall I tell you why glowlings sleep in stone?"],
    [MOSSA, "Long ago a great light lived at the very bottom of this grotto. We called it the Heartlight."],
    [MOSSA, "One night it went quiet and scattered into a thousand sparks. Each spark curled up in the rock to keep warm."],
    [MOSSA, "That's what a glowling is: a little piece of the Heartlight, dreaming."]] },
  { id: "s2", at: 7, title: "The lantern moth", who: WICK, lines: () => [
    [WICK, "Psst! Up here! The name's Wick. I trade in glimmers and gossip."],
    [WICK, "So the old stone told you about the Heartlight? Ha. Did she tell you who was keeping watch the night it went dark?"],
    [MOSSA, "...That's enough, Wick."],
    [WICK, "Touchy! I'll be around. I always am."]] },
  { id: "s3", at: 10, title: "The keeper", who: MOSSA, lines: () => [
    [MOSSA, "Wick isn't wrong. I was the Heartlight's keeper."],
    [MOSSA, "That night sleep found me on my watch. When I woke, the light was gone."],
    [MOSSA, "I've been listening for its sparks in the stone ever since, hoping someone kind would come and wake them."],
    [MOSSA, "And then you came along."]] },
  { id: "s4", at: 13, title: "The sleepy library", who: DORMA, lines: () => [
    [DORMA, "Mm? Oh... a reader. How lovely. I'm Dorma. I keep the grotto's library."],
    [DORMA, "Most of the books are asleep. So am I, mostly."],
    [DORMA, "But here's a page about the moon eggs. The moon was the Heartlight's oldest friend."],
    [DORMA, "Every night she leaves an egg by a nest that glows, hoping it holds a spark she knows.", "#moonBtn"]] },
  { id: "s5", at: 16, title: "A gift", who: DORMA, lines: () => [
    [DORMA, "I found another page. It was under my pillow, of all places."],
    [DORMA, "It says the Heartlight didn't break by accident. It gave itself away."],
    [DORMA, "The grotto was growing cold and lonely, and a thousand small lights can reach further than one big one."],
    [MOSSA, "It gave itself away? All this time I thought I'd failed it..."]] },
  { id: "s6", at: 19, title: "A hum in the deep", who: WICK, lines: () => [
    [WICK, "Big news from the deep! The old hollow at the bottom of the Vault has started to hum."],
    [WICK, "Nobody's heard it hum in a hundred years. I think it's waiting for something. Or someone."],
    [MOSSA, "The Heartlight's hollow... Go carefully, friend."]] },
  { id: "s7", at: 22, title: "Warm stone", who: MOSSA, lines: () => [
    [MOSSA, "The deeper you go, the warmer the stone feels. Can you feel it too?"],
    [MOSSA, "And your glowlings glow brighter every day. I think the sparks remember where they came from."]] },
  { id: "s8", at: LEVELS + 1, title: "The Heartlight's hollow", who: MOSSA, lines: () => [
    [MOSSA, "So this is it. The Heartlight's hollow."],
    [MOSSA, "It's empty... no, look! Your glowlings are lighting it up."],
    [MOSSA, "The Heartlight never really went out. It lives in every nest that's loved. It lives in yours."],
    [WICK, "Well, I'll be. I'm going to tell everyone!"],
    [DORMA, "I'll write this one down... right after a little nap."],
    [MOSSA, "Thank you, friend. I can finally rest easy on my watch."]] },
];
// the Gloom's parts, told at the sealed geodes, join the story in the book once heard
for (const [i, at] of [[1, 6], [2, 12], [3, 18], [4, 24]]) STORY.push({ id: "g" + i, at, title: ["The Gloom", "What's left in the dark", "A thousand pieces", "The oldest spark"][i - 1], who: GLOOM, lines: GLOOM_TALKS["g" + i], gloom: true });
STORY.sort((a, b) => a.at - b.at || (a.gloom ? 1 : 0) - (b.gloom ? 1 : 0));
for (const s of STORY) TALKS[s.id] = s.lines;
/** Tell a part of the story again, from the book. */
function retell(s) {
  talkQueue.push(s.lines().map(([who, words]) => [who, words]));
  if (!talkNow) nextTalk();
}

// people who played before the dialogs existed don't get the beginner ones (worked out from the save as it was when the page opened)
let talkOld = null;
function talkSeen(id) {
  if (save.talks && save.talks[id]) return true;
  return !!(talkOld && talkOld[id]);
}
const talkQueue = [];
let talkNow = null;
/** Play a dialog once, if it hasn't been seen (never during co-op, so a shared egg isn't interrupted). */
function talk(id, ...args) {
  if (game.coopTouched || coopSession || talkSeen(id) || !TALKS[id]) return false;
  save.talks = { ...(talkOld || {}), ...save.talks, [id]: Date.now() };
  persist();
  talkQueue.push(TALKS[id](...args));
  if (!talkNow) nextTalk();
  return true;
}
/** Where the thing a line points at is on screen, or null if it isn't showing. */
function spotRect(f) {
  if (typeof f === "function") return f();
  const el = f && document.querySelector(f);
  if (!el || el.closest("[hidden], .hidden")) return null;
  const r = el.getBoundingClientRect();
  return r.width && r.height ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
}
/** Frame what Mossa is talking about, and keep her dialog out of its way. */
function updateSpot() {
  const line = talkNow && talkNow.lines[talkNow.i], r = line && spotRect(line[2]), t = $("talk");
  t.classList.toggle("lit", !!r);
  if (!r) { t.classList.remove("up"); return; }
  const pad = 8, el = $("talkSpot"), low = r.y + r.h / 2 > H * 0.5;
  Object.assign(el.style, { left: r.x - pad + "px", top: r.y - pad + "px", width: r.w + pad * 2 + "px", height: r.h + pad * 2 + "px", borderRadius: r.round ? "50%" : "12px" });
  // the arrow points down from above, unless there's no room above it
  el.classList.toggle("below", r.y < 70);
  t.classList.toggle("up", low);
}

let afterTalk = null, afterMe = null;
function nextTalk() {
  const lines = talkQueue.shift();
  if (!lines) { talkNow = null; $("talk").hidden = true; updateSpot(); if (afterTalk) { const f = afterTalk; afterTalk = null; f(); } return; }
  talkNow = { lines, i: -1 };
  $("talk").hidden = false;
  nextLine();
}
function nextLine() {
  const n = talkNow;
  clearInterval(n.timer);
  if (++n.i >= n.lines.length) return nextTalk();
  const [who, words, spot] = n.lines[n.i];
  // a button or panel further down a list scrolls into view first
  if (typeof spot === "string") document.querySelector(spot)?.scrollIntoView({ block: "nearest" });
  updateSpot();
  const text = tr(words), face = who.face();
  $$("#talk .talk-face img").forEach(im => { if (im.src !== face) im.src = face; });
  $$("#talk .talk-name").forEach(el => { el.textContent = tr(who.name); });
  const box = $$("#talk .talk-text")[0];
  box.textContent = "";
  $("talk").classList.remove("done");
  // type it out: a blip for every other letter, a breath at commas, a longer one at full stops
  let at = 0, wait = 0, said = 0;
  n.full = () => { clearInterval(n.timer); box.textContent = text; n.typing = false; $("talk").classList.add("done"); };
  n.typing = true;
  n.timer = setInterval(() => {
    if (wait > 0) { wait--; return; }
    const ch = text[at++];
    box.textContent = text.slice(0, at);
    if (/[\p{L}\p{N}]/u.test(ch) && said++ % 2 === 0) sfx.voice(who.voice);
    if (/[.!?…♥✦]/.test(ch) && text[at] === " ") wait = 7;
    else if (/[,:;—]/.test(ch)) wait = 3;
    if (at >= text.length) n.full();
  }, 32);
}
function tapTalk(ev) {
  if (!talkNow) return;
  ev && ev.preventDefault();
  if (talkNow.typing) talkNow.full(); else { sfx.tick(); nextLine(); }
}
$("talk").addEventListener("pointerdown", ev => { if (ev.target.id !== "talkSkip") tapTalk(ev); });
$("talkSkip").addEventListener("click", ev => { ev.stopPropagation(); clearInterval(talkNow && talkNow.timer); talkQueue.length = 0; nextTalk(); });
document.addEventListener("keydown", ev => { if (talkNow && (ev.key === " " || ev.key === "Enter")) tapTalk(ev); }, true);

/** The big moments that are waiting for a calm scene (the nest, the grotto or the book) to be told. */
const talkLater = [];
function talkMoments(scene) {
  if (!["nest", "map", "lib"].includes(scene) || !$("found").classList.contains("hidden")) return;
  while (talkLater.length) talk(...talkLater.shift());
  if (scene === "nest" && save.creatures.length) talk("firstPet");
  if (scene === "nest") tellTrips();
  if (scene === "nest" && save.creatures.length && !(save.me && save.me.name) && !talkSeen("meet") && talk("meet")) afterTalk = () => openMe(true);
  if (scene === "map") talk("firstGrotto");
  for (const k of [1, 2, 3]) if (unlocked(k * 6 + 1)) talk("ch" + k);
  if (unlocked(LEVELS + 1)) talk("allClear");
  // Mossa tells you when an event starts, once each year
  const ev = eventNow();
  if (ev && save.creatures.length) {
    const id = `ev-${ev.id}-${new Date().getFullYear()}`;
    TALKS[id] = () => [[MOSSA, ev.line], [MOSSA, tr("For {0} days a limited glowling, {1}, sleeps in the moon egg. Don't miss it!", eventDaysLeft(ev), SP[ev.sp].name), scene === "map" ? "#moonBtn" : null]];
    talk(id);
  }
  // Wick lands outside every third day and lets you know
  if (scene === "nest" && save.creatures.length && wickHere()) {
    const id = `wick-${dayNo()}`;
    TALKS[id] = () => [[WICK, isOutside() ? "Psst! Over here, by the garden. I've brought a few things from the deep." : "Psst! I'm outside today, by the garden, with a few things from the deep. Here till midnight!", isOutside() ? null : "#roomNav"]];
    talk(id);
  }
  // one part of the story per visit, so a long-time player catches up gently
  const part = STORY.find(s => !s.gloom && unlocked(s.at) && !talkSeen(s.id));
  if (part) talk(part.id);
}

function nestHint() {
  if (!save.creatures.length) return "";
  if (!tipDone("pet")) return tr("stroke {0} to pet it ♥", activeCreature()?.name || tr("your glowling"));
  const cr = activeCreature(), call = cr && callOf(cr);
  if (call) return { hungry: tr("{0} is hungry: give it a snack", cr.name), sleepy: tr("{0} is sleepy: tuck it in", cr.name), messy: tr("dust bunnies! tap them to sweep the nest"), lonely: tr("{0} feels lonely: pet it or play", cr.name) }[call];
  if (!tipDone("call")) return tr("tip: hold a finger on the floor to call everyone");
  if (isPlace()) return heroHere()?.none ? tr("tap the tunnel to go down to the geodes") : heroHere() ? tr("tap {0} to chat", tr(heroHere().who.name)) : "";
  if (isOutside() && !tipDone("garden")) return tr("tip: tap the garden bed to plant seeds 🌱");
  if (!tipDone("decorTap") && DECOR.some(d => hasDecor(d.id) && d.id !== "rug")) return tr("tip: tap your decorations to play with them ✦");
  if (save.incubator && Date.now() >= save.incubator.due) return incHere() ? tr("the egg is ready: tap it three times to hatch ✦") : tr("the egg in the lab is ready to hatch 🧪");
  if (!save.incubator && !tipDone("pair") && save.creatures.filter(c => !pairReason(c)).length >= 2) return incHere() ? tr("two of your glowlings could share an egg: tap the incubator 💞") : tr("two of your glowlings could share an egg: the incubator is in the lab, on the map 🧪");
  return "";
}

// ---------- first-time guidance: a ghost finger shows each new move once ----------

const tipDone = id => !!(save.tips && save.tips[id]);
function markTip(id) {
  if (tipDone(id)) return;
  save.tips = save.tips || {};
  save.tips[id] = Date.now();
  persist();
}

/** What the ghost finger should show right now, if anything. */
function coachMove() {
  if (pointer) return null;
  if (game.scene === "crack" && game.egg) {
    const e = game.egg;
    if (e.state === "cracking" && !tipDone("tap") && !e.taps) return { kind: "tap", at: fromEgg(...e.spot) };
    if (e.state === "polish" && !tipDone("polish") && e.matte && e.matte.shine < 0.15)
      return { kind: "path", pts: [0, 1, 2, 3, 4].map(i => [L.ecx + (i % 2 ? 0.3 : -0.3) * L.ew, L.ecy - L.eh * 0.15 + i * L.eh * 0.08]) };
  }
  if (game.scene === "nest" && incHere() && tipDone("pet") && save.incubator && Date.now() >= save.incubator.due) {
    const [x, y] = incSpot(); return { kind: "tap", at: [x, y - N.base * 0.4] };
  }
  if (game.scene === "nest" && !tipDone("pet")) {
    const a = activeActor(), cr = activeCreature();
    if (a && cr && !cr.sleeping) { const v = actorView(a); return { kind: "path", pts: [[v.x - v.size * 0.3, v.y], [v.x + v.size * 0.3, v.y], [v.x - v.size * 0.3, v.y], [v.x + v.size * 0.3, v.y]] }; }
  }
  if (game.scene === "catch" && game.catch && game.catch.intro > 0) {
    const y = catchLayout().y;
    return { kind: "path", pts: [[W * 0.3, y], [W * 0.7, y], [W * 0.3, y]] };
  }
  return null;
}

/** A soft glowing fingertip that traces a path (with a fading trail) or taps a spot. */
function drawCoach() {
  const m = coachMove();
  if (!m) return;
  const cycle = 2600, k = (game.time % cycle) / cycle;
  ctx.save();
  if (m.kind === "tap") {
    const [x, y] = m.at, press = Math.sin(Math.min(1, k * 2.2) * Math.PI);
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 14 + k * 30, 0, TAU); ctx.stroke();
    finger(x, y - 6 * (1 - press), 0.95);
  } else {
    const pts = m.pts, t = clamp(k * 1.25 - 0.1, 0, 1);
    const at = u => { const f = u * (pts.length - 1), i = Math.min(Math.floor(f), pts.length - 2), r = f - i; return [lerp(pts[i][0], pts[i + 1][0], r), lerp(pts[i][1], pts[i + 1][1], r)]; };
    const fade = t <= 0 || t >= 1 ? 0 : Math.min(1, t * 8, (1 - t) * 8);
    for (let j = 1; j <= 8; j++) {
      const u = t - j * 0.025;
      if (u <= 0) break;
      const [x, y] = at(u);
      ctx.fillStyle = `rgba(255,255,255,${0.35 * fade * (1 - j / 9)})`;
      ctx.beginPath(); ctx.arc(x, y, 7 - j * 0.5, 0, TAU); ctx.fill();
    }
    const [x, y] = at(t);
    finger(x, y, fade);
  }
  ctx.restore();
}

function finger(x, y, a) {
  if (a <= 0) return;
  const g = ctx.createRadialGradient(x, y, 2, x, y, 26);
  g.addColorStop(0, `rgba(255,255,255,${0.9 * a})`); g.addColorStop(0.45, `rgba(230,224,255,${0.45 * a})`); g.addColorStop(1, "rgba(230,224,255,0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 26, 0, TAU); ctx.fill();
  ctx.strokeStyle = `rgba(255,255,255,${0.9 * a})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.stroke();
}
