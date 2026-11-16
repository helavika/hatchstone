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
  bismuth: ["#ffd25f", "#ff7ac8", "#7a5cff", "#3fd0e0", "#9cff8a", "#ffd25f"],
  obsidian: ["#231d33", "#7e6fb0", "#231d33", "#c9a9e8", "#231d33"],
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
    // labradorite, opal, moonstone, sunstone, tiger's eye, obsidian and bismuth: a sheen of color across the stone (tiger's eye in rolling golden stripes)
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
  const crystal = conf.forced ? conf.forced.crystal : conf.chosen || rollCrystal(conf, rarity);
  const species = conf.forced ? conf.forced.species : pick(SPECIES.filter(s => s.crystal === crystal.id && !s.moon));
  const sun = !conf.coop && !conf.forced && animate && save.sunlit > 0;
  if (sun) { save.sunlit--; setTimeout(() => toast(tr("A sunpetal warms this egg ☀️ a far better chance it's shiny")), 600); }
  game.egg = {
    conf, crystal, species, shiny: Math.random() < (conf.moon ? 0.1 : 0.04) + (conf.coop ? 0 : skill("luck") * 0.006) + (sun ? 0.3 : 0), stone: conf.gloom ? GLOOM_STONE : conf.moon ? moonStone() : pick(STONES),
    state: animate ? "entering" : "cracking", t: 0, wob: 0, wobT: 9, squash: 0, open: 0, hop: 0,
    hp: conf.hp, damage: 0, taps: 0, crits: 0, search: 0, gems: 0, combo: 0, chain: 0, owed: 0, hits: [], seed: coopId(),
    net: { segs: [], tips: [] }, painted: 0,
    // banded stone (the Malachite's levels; never a moon egg or a heart's): the bands still whole, and how many it had
    bands: conf.bands && (!conf.wander || conf.coop) ? BANDS : 0, banded: conf.bands && (!conf.wander || conf.coop) ? BANDS : 0,
    // silent stone (the Celestite's levels, on the same terms): no glow, and the ripples lean towards the weak spot
    silent: !!conf.silent && (!conf.wander || !!conf.coop),
    // the Labradorite's stone (on the same terms again): the weak spot shows only in a flash, right after a blow lands on it
    sheen: !!conf.sheen && (!conf.wander || !!conf.coop),
    // the Gloom's first seal (level 6, only until it is cleared: see startLevel): it lays patches of shadow as you go
    shade: conf.gloom === 1, patches: [], shadeLaid: 0,
  };
  const e = game.egg;
  // Quarry Eye's pings, fresh for every egg (yours alone, even on a shared one: they change nothing the friend sees)
  e.eyeLeft = eyeCharges(); game.ping = null; game.sheen = null; game.shadeFx = null;
  if (e.eyeLeft && save.eyeNote && animate) {
    delete save.eyeNote; persist();
    setTimeout(() => toast(save.eyeThanks ? tr("Quarry Eye listens now: tap the eye for a ring that shows where to listen. One more ping per geode, as thanks ✦") : tr("Quarry Eye listens now: tap the eye for a ring that shows where to listen ✦")), 1400);
  }
  // the weak spot: somewhere on the face of the egg, away from the very edge
  // stored the way co-op sends it (height / EGG_R), so host and guest compute with the very same numbers
  for (;;) { const p = [rand(0.25, 0.75), rand(0.3, 1) / EGG_R * EGG_R]; if (inside(EGG_UNIT, p)) { e.spot = p; break; } }
  game.gemsShown = 0; game.gems = []; game.pops = [];
  refitEgg(e);
  game.pieces = [];
  updateDots();
  updateEye();
  $("lvlPill").textContent = conf.moon ? "🌙" : conf.wander ? tr("Wander") : tr("Lv {0}", conf.n);
  setHint(conf.step === 1 ? tr("tap the egg to crack it · aim for the glow ✦") : conf.step === 4 ? tr("the weak spot hides now: knocks sound deeper near it") : conf.step === 10 ? tr("hard stone: find the weak spot by ear") : conf.step === 7 && e.silent ? tr("silent stone: no glow here · watch which way the ripples lean") : conf.step === 13 && e.banded ? tr("banded stone: when a band breaks, the weak spot moves") : conf.step === 19 && e.sheen ? tr("this stone shows its weak spot only as you hit it · keep the chain") : "");
}

/** Fresh shell and inside for the current layout, with every crack so far drawn back on. */
function refitEgg(e) {
  e.shell = makeShell(e.stone);
  e.interior = makeInterior(e.crystal, e.stone);
  e.painted = 0; e.dentsPainted = 0; e.bandsPainted = -1;
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

// Banded stone: the egg gives way a band at a time, at each third of its stone, and with every band the weak spot
// shifts to a new place on the face of the egg. Finding it again is a search like the first (see aimShare).
const BANDS = 2;
/** Where the weak spot goes when a band breaks: on the face, clear of the edge, and well away from where it was. */
function bandSpot(R, from) {
  for (let i = 0; ; i++) {
    const p = [0.25 + R() * 0.5, 0.3 + R() * 0.7];
    if (inside(EGG_UNIT, p) && (Math.hypot(p[0] - from[0], p[1] - from[1]) > 0.3 || i > 60)) return p;
  }
}

// Silent stone: the weak spot doesn't glow at all, but every knock sends a ripple that leans towards it, harder the
// nearer it is. One ripple gives a way to go, not the place: its lean wanders a little off true (never more than
// LEAN_SLOP), and how hard it leans only says near or far. Two or three knocks, and the ways cross at the spot.
const LEAN_REACH = 0.6, LEAN_SLOP = 0.3;
/**
 * Which way a knock at (u, v) leans (an angle on the face of the egg, the same on screen) and how hard, from a little
 * to 1. From the spot, the egg's seed and the blow's number alone, so a guest replaying the host's hit draws the same.
 */
function rippleLean(e, u, v, i) {
  const R = seeded(e.seed + ":" + i + ":lean"), [sx, sy] = e.spot;
  return { a: Math.atan2(sy - v, sx - u) + (R() * 2 - 1) * LEAN_SLOP, s: 0.15 + 0.85 * clamp(1 - Math.hypot(sx - u, sy - v) / LEAN_REACH, 0, 1) };
}

// The Labradorite's stone: the weak spot never shows by itself (you find it by ear, as deep in the grotto as ever), but
// a blow that lands on it lights it up for a moment in the stone's blue-green-gold sheen. Hit it again before the flash
// is gone and it lights up again, so a chain keeps you on it; a miss puts it out.
const SHEEN_LIFE = 0.55;
/**
 * How bright the flash is (0 to 1), `a` seconds after the blow that lit it: up at once, at full while the hammer is still
 * over it, then gone by SHEEN_LIFE. With less motion it doesn't flare: a soft, even light for the same time.
 */
function sheenGlow(a, calm) {
  if (!(a >= 0 && a < SHEEN_LIFE)) return 0;
  return calm ? 0.8 : Math.min(1, a / 0.04) * (1 - clamp((a - 0.3) / (SHEEN_LIFE - 0.3), 0, 1) ** 2);
}

// The Gloom's first seal (level 6, the first time only) fights back: after every third blow it lays a soft patch of
// shadow on the shell, near where the last blow fell. A blow under a patch breaks half the stone; a blow on the weak
// spot burns away every patch beside it. There are never more than three at once (under a quarter of the shell), and
// the middle of the weak spot is always left clear, so a true aim is never softened and the stars stay about aim.
const SHADE_EVERY = 3, SHADE_MAX = 3, SHADE_CLEAR = 0.025, SHADE_BURN = 0.1;
/** The patch under (u, v), if any. */
const shadeAt = (e, u, v) => (e.patches || []).find(p => Math.hypot(u - p.u, v - p.v) < p.r);
/**
 * Where the Gloom lays its next patch, after blow number i fell at (u, v): a little way off it, on the face, clear of
 * the spot's middle and not over another patch. From the egg's seed and the blow's number alone, so a guest replaying
 * the host's hits lays the very same ones; null when there is no room.
 */
function shadePatch(e, u, v, i) {
  const R = seeded(e.seed + ":" + i + ":shade"), [sx, sy] = e.spot;
  for (let k = 0; k < 16; k++) {
    const r = 0.11 + R() * 0.03, a = R() * TAU, d = 0.04 + R() * 0.14;
    let pu = u + Math.cos(a) * d, pv = v + Math.sin(a) * d;
    // pushed off the spot's middle, the way it lay from it
    const off = Math.hypot(pu - sx, pv - sy), need = r + SHADE_CLEAR + R() * 0.03;
    if (off < need) { const b = off > 1e-6 ? Math.atan2(pv - sy, pu - sx) : a; pu = sx + Math.cos(b) * need; pv = sy + Math.sin(b) * need; }
    if (!inside(EGG_UNIT, [pu, pv]) || e.patches.some(p => Math.hypot(pu - p.u, pv - p.v) < (p.r + r) * 0.8)) continue;
    return { u: pu, v: pv, r, id: e.shadeLaid };
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
  const crit = weak > 0.45, soft = !!shadeAt(e, u, v), dmg = power * (1 + weak * 2.2) * (soft ? 0.5 : 1);
  // (on silent stone, which way this knock's ripple leans: from where the spot is before the blow)
  const lean = e.silent ? rippleLean(e, u, v, e.hits ? e.hits.length - 1 : 0) : null;
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
  // the search for the weak spot lasts until the first blow that finds it, and its misses are counted apart (see aimShare)
  if (crit) e.found = true; else if (!e.found) e.search++;
  // a band gives way at each third (not on the blow that opens the egg): the spot moves, and the search starts over.
  // The new place comes from the egg's seed and this blow's number, so host and guest move it to the same spot.
  let band = 0;
  while (e.bands > 0 && e.damage < e.hp && e.damage >= e.hp * (e.banded + 1 - e.bands) / (e.banded + 1)) {
    e.bands--; band++;
    e.spot = bandSpot(seeded(e.seed + ":" + (e.hits ? e.hits.length - 1 : 0) + ":band" + e.bands), e.spot);
    e.found = false;
  }
  // on the Labradorite's stone a blow on the weak spot lights it up: the hit decides, so host and guest flash alike
  const flash = !!e.sheen && crit;
  // on the Gloom's first seal a blow on the weak spot burns away the patches beside it, and every third blow it lays one
  let burnt = [], laid = null;
  if (e.shade) {
    if (crit) { burnt = e.patches.filter(q => Math.hypot(u - q.u, v - q.v) < q.r + SHADE_BURN); e.patches = e.patches.filter(q => !burnt.includes(q)); }
    const i = e.hits ? e.hits.length - 1 : 0;
    if ((i + 1) % SHADE_EVERY === 0 && e.damage < e.hp && e.patches.length < SHADE_MAX && (laid = shadePatch(e, u, v, i))) { e.patches.push(laid); e.shadeLaid++; }
  }
  return { dmg, crit, weak, grown, band, lean, flash, soft, burnt, laid };
}

/** Draw what's new on the shell: crushed spots where blows landed, then the cracks (dark, with a pale lit lip). */
function paintNet(e) {
  if (e.banded) paintBands(e);
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

/** A band's line across the face of the egg, in egg units: a ring round the stone, bowed a little the way it curves, and uneven. */
function bandLine(e, i) {
  const R = seeded(e.seed + ":bandline" + i), v0 = [0.44, 0.86][i] || 0.6, bow = 0.05 + R() * 0.03, tilt = (R() - 0.5) * 0.08, pts = [];
  for (let u = -0.04; u <= 1.04; u += 0.04) pts.push([u, v0 + bow * (1 - ((u - 0.5) / 0.5) ** 2) + tilt * (u - 0.5) + (R() - 0.5) * 0.012]);
  return pts;
}

/**
 * The Malachite's bands on the shell: whole, each a soft stripe of greens like the stone's own banding; broken, a raw
 * groove where it came away, cracked along both edges. Paints only what changed since last time (a fresh shell: all).
 */
function paintBands(e) {
  const broke = e.banded - e.bands, from = e.bandsPainted ?? -1;
  if (from === broke) return;
  const o = e.shell.ctx, k = Math.max(1, L.k), at = ([u, v]) => toShell(...fromEgg(u, v));
  const path = (pts, dv) => { o.beginPath(); pts.forEach(([u, v], j) => { const [x, y] = at([u, v + dv]); j ? o.lineTo(x, y) : o.moveTo(x, y); }); };
  o.save();
  tracePoly(o, eggPoly(L.ew / 2 + PAD, L.eh / 2 + PAD, L.ew, L.eh)); o.clip();
  o.lineCap = "butt"; o.lineJoin = "round";
  for (let i = 0; i < e.banded; i++) {
    const pts = bandLine(e, i), whole = i >= broke;
    if (whole && from >= 0) continue;
    if (whole) {
      // dark green, a lighter green inside it, and a pale thread: malachite's rings, faint enough to keep the stone's own colour
      for (const [col, w, dv] of [["rgba(31,92,56,.55)", 9, 0], ["rgba(87,173,106,.6)", 5, -0.003], ["rgba(163,221,155,.7)", 1.5, 0.007]]) {
        o.strokeStyle = col; o.lineWidth = w * k; path(pts, dv); o.stroke();
      }
    } else {
      // the band has come away: the stone under it, a shade deeper, and a crack along each edge with a pale lip
      o.strokeStyle = hexA(e.stone[1], 0.8); o.lineWidth = 8 * k; path(pts, 0); o.stroke();
      for (const s of [-1, 1]) {
        const edge = pts.map(([u, v], j) => [u, v + s * 4 * k / L.ew + (j % 3 === 1 ? s * 0.004 : 0)]);
        o.strokeStyle = "rgba(255,250,240,.5)"; o.lineWidth = 1 * k; path(edge.map(([u, v]) => [u, v + 1.2 * k / L.ew]), 0); o.stroke();
        o.strokeStyle = "rgba(40,22,28,.75)"; o.lineWidth = 1.2 * k; path(edge, 0); o.stroke();
      }
    }
  }
  o.restore();
  e.bandsPainted = broke;
}

/** A band breaks (crackHit moved the weak spot): a crack runs round the band and it flakes away with a crunch and a ring. With less motion, only a soft flash. */
function bandBreak(e) {
  const calm = opts().calm, i = e.banded - e.bands - 1, pts = bandLine(e, i);
  game.bandFx = { e, i, t: game.time, calm };
  sfx.knot();
  buzz(calm ? 10 : [12, 30, 18]);
  floatText(tr("a band broke · the spot moved"), L.ecx, L.ey0 + 24 * L.k, "#c8f0c0");
  if (calm) return;
  game.shake = Math.min(14, game.shake + 6 * Math.max(0.5, L.k));
  const greens = ["#a3dd9b", "#57ad6a", "#2f7d4a"];
  for (let j = 2; j < pts.length - 2; j += 3) {
    const [x, y] = fromEgg(...pts[j]);
    if (inside(L.egg, [x, y])) spawnChips(x, y, 2, 1.2, greens);
  }
}

/** The Gloom lays a patch (crackHit chose where): it seeps in over a moment, with a low hush. The first one says what it does. */
function shadeLay(e, p) {
  p.shown = game.time;
  if (sfx.ready()) sfx.wash(sfx.ac.currentTime, 0.7, 520, 150, 0.8, 0.14, "lowpass");
  if (e.shadeLaid === 1) floatText(tr("a shadow: blows under it land soft"), L.ecx, L.ey0 + 24 * L.k, "#c9b8f0");
}

/** A blow on the weak spot burns patches away: each flares up in the crystal's light and is gone. With less motion, only a soft glow that fades. */
function shadeBurn(e, burnt) {
  const calm = opts().calm;
  game.shadeFx = (game.shadeFx || []).filter(f => f.e === e).concat(burnt.map(p => ({ e, p, t: game.time, calm })));
  sfx.shimmer();
  if (!e.shadeBurnt) { e.shadeBurnt = true; floatText(tr("the light burns the shadow away"), L.ecx, L.ey0 + 24 * L.k, "#ffe9a8"); }
  if (calm) return;
  for (const p of burnt) { const [x, y] = fromEgg(p.u, p.v); burst(x, y, 8, ["#fff", e.crystal.c[1], "#d2bfff"], 0.7); }
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
// (how hard a tap hits is the keeper's Strength alone: the Forge's Granite Fist went into it, see keeperMigrate in inner.js)
const FORGE = [
  { id: "eye", name: "Quarry Eye", icon: "eye", cost: [40, 90, 160], what: l => ["", tr("one ping per geode: a ring over the shell shows where to listen"), tr("two pings per geode"), save.eyeThanks ? tr("four pings per geode: one is a thank-you") : tr("three pings per geode")][l] },
  { id: "echo", name: "Thunder Echo", icon: "bell", cost: [60, 120, 200], what: l => tr("{0}% of taps ring twice, for 60% more", l * 10) },
  { id: "magpie", name: "Finder's Sack", icon: "pouch", cost: [30, 70, 120, 180], what: l => tr("stone broken at the weak spot pays {0}% more", Math.round(l * SACK_PAY * 100)) },
];
const forgeLvl = id => (save.forge && save.forge[id]) || 0;
/** Quarry Eye's pings for each geode: one a forge level, and one more for keepers who had the whole eye back when it
 *  still lit the spot up for good (see migrate). It no longer shows the spot by itself: you choose when to look. */
const eyeCharges = () => { const l = forgeLvl("eye"); return l ? l + (save.eyeThanks ? 1 : 0) : 0; };
/** Stone where the weak spot is found by ear: from level 4, where it stops glowing brightly. There a near miss whispers
 *  "closer…" and Quarry Eye can ping; on brighter stone you simply look. */
const byEar = conf => conf.spotGlow < 0.5;
/** Hammer looks: each shows when you tap the stone (the tool swings, bigger with each point of Strength) and changes the sparks. */
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
  sweep: { text: "Sweep a dust bunny out of the nest", icon: "broom", ok: () => hasPets() && (save.dust || []).length > 0, go: () => toRoomKind("nest") },
  forge: { text: "Buy a hammer upgrade at the Forge", icon: "hammer", ok: canForge, go: () => openForge() },
  decor: { text: "Decorate the nest or change its cave mood", icon: "candle", ok: hasPets, go: toNest(null, "decorBtn") },
  moon: { text: "Open today's moon egg", icon: "moon", ok: () => !moonDone(), go: () => startMoon() },
  book: { text: "Look someone up in the Glowpedia", icon: "book", ok: () => true, go: () => setScene("lib") },
  breed: { text: "Lay a mixed egg in the incubator", icon: "heart", ok: () => !save.incubator && save.creatures.filter(c => !pairReason(c)).length >= 2, go: () => { toRoomKind("lab"); openIncubator(); } },
  share: { text: "Send a postcard of a glowling", icon: "postcard", ok: hasPets, go: toNest(null, "nestShare") },
};
const TASK_SHARDS = 10, TASK_BONUS = 15;
/** What the day's three are called: little tasks in the first cave, a keeper's round of the grotto from chapter II on. */
const tasksName = little => tr(unlocked(7) ? "Today's round" : little ? "Today's little tasks" : "Today's tasks");

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
  $("taskPill").title = tasksName(true);
  // (new tasks can wait out the first minute home after Mossa looked in: see homeQuiet)
  $("taskPill").classList.toggle("fresh", n === 0 && !t.seen && !homeQuiet());
}

function openTasks() {
  sfx.tick();
  const t = todayTasks();
  t.seen = true;
  $("tasksTitle").textContent = tasksName();
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

/** How hard a tap hits: your Strength, and now and then Thunder Echo. Shared eggs use the plain hammer, so both friends are even. */
function tapPower() {
  if (game.egg && game.egg.conf.coop) return { power: 1, echo: false };
  const echo = Math.random() < forgeLvl("echo") * 0.1;
  return { power: Math.round((1 + skill("str") * STR_STEP) * (echo ? 1.6 : 1) * 100) / 100, echo };
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
  // Ember forges more than hammers: a wardstone holds ground on the map, and its rune lights in the colour of the crystal it was made from
  // (only while there's an empty spot on the map left for it: see wardRoom)
  { id: "ward", rarity: "common", need: WARD_COST.common, shards: WARD_COST.shards, name: "Wardstone", note: "set it on the map, where the fog is thickest", ward: true, ok: () => wardsOpen() && wardRoom(wards()) > 0, how: () => wardsOpen() ? "enough stones for every spot" : "reach chapter III", icon: () => wardIcon(spareOf("common")?.id), give: used => forgeWard(used[0]) },
  { id: "wardRare", rarity: "rare", need: WARD_COST.rare, name: "Wardstone of a rare crystal", note: "one rare spare and no shards", ward: true, ok: () => wardsOpen() && wardRoom(wards()) > 0, how: () => wardsOpen() ? "enough stones for every spot" : "reach chapter III", icon: () => wardIcon(spareOf("rare")?.id || "celestite"), give: used => forgeWard(used[0]) },
];
/** How many spare geodes of a rarity you have (the first of each kind stays in the book). */
const spares = rarity => CRYSTALS.filter(c => c.rarity === rarity).reduce((n, c) => n + Math.max(0, ((save.geodes[c.id] || {}).count || 0) - 1), 0);
/** The spare a recipe takes next: from the kind you have most of. */
const spareOf = rarity => CRYSTALS.filter(x => x.rarity === rarity && ((save.geodes[x.id] || {}).count || 0) > 1).sort((p, q) => save.geodes[q.id].count - save.geodes[p.id].count)[0];
const canCraft = r => (!r.ok || r.ok()) && spares(r.rarity) >= r.need && save.shards >= (r.shards || 0);
function craft(id) {
  const r = RECIPES.find(x => x.id === id);
  if (!r || !canCraft(r)) return;
  const used = [];
  for (let k = 0; k < r.need; k++) { const c = spareOf(r.rarity); save.geodes[c.id].count--; used.push(c.id); }
  save.shards -= r.shards || 0;
  r.give(used); bump("crafted"); sfx.levelUp(); buzz([12, 30, 12]);
  toast(tr("Made at the workbench: {0} ✦", tr(r.name)));
  persist(); updateTopbar(); openForge();
  if (r.ward) setTimeout(() => talk("firstWard"), 500);
}
const RARITY_WORD = { common: "common ones", rare: "rare ones", legendary: "legendary ones" };
function workbenchList() {
  return `<h3 class="forge-h">${tr("Workbench")}</h3><p class="me-hint">${tr("Every geode past the first of its kind is a spare. The first one always stays in the book; spares melt down into useful things here.")}</p>`
    + RECIPES.map(r => {
      const have = spares(r.rarity), shut = r.ok && !r.ok(), inHand = r.ward && wards().have.length;
      const cost = shut ? tr(r.how()) : tr("{0} {1} spares", r.need, tr(RARITY_WORD[r.rarity])) + (r.shards ? `<span class="plus">+ ${ic("shard")}${r.shards}</span>` : "");
      return `<button class="forge craft${r.ward ? " ward" : ""}" data-craft="${r.id}" ${canCraft(r) ? "" : "disabled"}><img class="skin-img" src="${r.icon()}" alt=""><span class="txt"><b>${tr(r.name)}</b><small>${tr(r.note)}${inHand ? " · " + tr("in hand: {0}", inHand) : ""}</small></span><span class="cost">${cost}${shut ? "" : `<em>${tr("you have {0}", have)}</em>`}</span></button>`;
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

// ---------- what a blow pays ----------

// The stone pays for itself: shards for every point of it broken off, however many blows that takes, so a heavier
// hammer is never the poorer one. A fair blow of the plain hammer on the weak spot breaks about 2.4 points, and a
// tap like that used to pay 3.
const STONE_PAY = 1.25;
// A chain is hits on the weak spot in a row, and a miss ends it: aim pays, speed doesn't. It fills with the stone it
// breaks (about four of those fair blows), and a full one doubles what the stone pays: 3 more for a fair blow.
const CHAIN_FULL = 9.6;
// Finder's Sack: a third more for stone broken at the weak spot, per level (one more shard for a fair blow).
const SACK_PAY = 1 / 3;

/**
 * Whole shards for the blow that just landed (res is what crackHit gave back); the part of a shard left over rides on
 * to the next blow. It keeps the chain as it goes. Host, guest and solo all count this way, blow by blow in the same
 * order, so a shared egg pays the same on both screens.
 */
function blowPay(e, res, sack = 0) {
  // the last blow is paid for the stone that was left, not for how hard it fell
  const broke = Math.min(res.dmg, e.hp - (e.damage - res.dmg));
  e.lost = res.crit ? 0 : e.combo;
  e.combo = res.crit ? e.combo + 1 : 0;
  e.chain = res.crit ? e.chain + broke : 0;
  e.owed += broke * STONE_PAY * (1 + (res.crit ? Math.min(1, e.chain / CHAIN_FULL) + sack * SACK_PAY : 0));
  const gems = Math.floor(e.owed + 1e-9);
  e.owed -= gems;
  return gems;
}

// ---------- what aim earns ----------

// Stars are for aim, not for the hammer: the share of an egg's taps that landed on the weak spot (crackHit's crit),
// so a heavy hammer earns no more of them than the plain one, and no fewer. The search for the spot doesn't count
// (deep in the grotto nothing shows it, you find it by knocking): every miss before the first hit on it is left out.
// And never fewer than this many misses on an egg, so a slip or two after a lucky first knock is forgiven as well.
const AIM_FREE = 3;
// Two stars from this share of the taps, in percent, and three from that one. The first star is for opening the egg.
const AIM_STARS = [40, 70];

/**
 * Aim so far, in whole percent (rounded down, so the number never promises a star it doesn't give): hits on the weak
 * spot out of the taps that count. crackHit counts the search (e.search) blow by blow, on every screen in the same
 * order, and the taps and the hits ride in a co-op snapshot, so host and guest read the same aim off a shared egg.
 */
const aimShare = e => Math.floor(e.crits * 100 / Math.max(1, e.taps - Math.min(e.taps - e.crits, Math.max(AIM_FREE, e.search || 0))));
/** One to three stars for that aim. */
const aimStars = e => 1 + AIM_STARS.filter(p => aimShare(e) >= p).length;

/** A tap on the egg: crack it, pop numbers and shards, shake. Hosts and solo players run this; guests replay it. */
function hitEgg(x, y) {
  const e = game.egg;
  if (!e || e.state !== "cracking" || !inside(L.egg, [x, y])) return;
  const [u, v] = toEgg(x, y), { power, echo } = tapPower(), hit = [u, v / EGG_R, power];
  e.hits.push(hit);
  const res = crackHit(e, [hit[0], hit[1] * EGG_R], power, seeded(e.seed + ":" + (e.hits.length - 1)));
  e.taps++;
  if (res.crit) e.crits++;
  const gems = blowPay(e, res, e.conf.coop ? 0 : forgeLvl("magpie"));
  e.gems += gems;
  markTip("tap");
  if (e.taps === 3 && e.conf.step === 1) setHint("");
  hitFeedback(e, x, y, res, gems, echo);
  if (e.damage >= e.hp) openEgg();
}

// ---------- Quarry Eye: a knock that listens for you ----------

// A ping runs out from the middle of the egg to its rim in this many seconds, and is gone a little after.
const PING_RUN = 0.7, PING_LIFE = 1;

/** The eye button, while there's shell to listen to: a pip for each ping left; dimmed on stone that glows, where it rests, and once they're spent. */
function updateEye() {
  const b = $("eyeBtn"), e = game.egg, n = eyeCharges();
  b.hidden = !n || !e || !["entering", "cracking"].includes(e.state);
  if (b.hidden) return;
  b.querySelector(".pips").innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < e.eyeLeft ? "on" : ""}"></i>`).join("");
  b.classList.toggle("rest", !byEar(e.conf));
  b.classList.toggle("spent", !(e.eyeLeft > 0));
}

/**
 * Spend a ping: a knock, and a ring that runs over the shell, bright where it passes near the weak spot, with a deep
 * hollow note as it gets there. It only shows where to listen, and is gone in a second. All on this screen: on a shared
 * egg nothing goes to the friend, and the cracks, pay and aim stay exactly as they were.
 */
function eyePing() {
  const e = game.egg;
  if (!e || e.state !== "cracking") return;
  const say = text => { sfx.tick(); floatText(text, L.ecx, L.ey0 + 24 * L.k, "#e6e0ff"); };
  if (!byEar(e.conf)) return say(tr("the spot glows here: just look"));
  if (!(e.eyeLeft > 0)) return say(tr("no pings left on this geode"));
  e.eyeLeft--;
  game.ping = { e, t: game.time };
  sfx.ping(PING_RUN * pingReach(e));
  buzz(8);
  updateEye();
}

/** How far out the weak spot sits, from the middle of the egg (0) to its rim (1): when the ring gets there. */
function pingReach(e) {
  const [x, y] = fromEgg(...e.spot);
  return clamp(Math.hypot(x - L.ecx, y - L.ecy) / pingRim(), 0, 1);
}
const pingRim = () => Math.max(L.ew, L.eh) * 0.55;

/** Everything you see and hear when a hit lands (also used when a co-op guest replays the host's hits). */
function hitFeedback(e, x, y, res, gems, echo = false) {
  paintNet(e);
  if (res.band) bandBreak(e);
  // the Labradorite's flash: lit by a blow on the weak spot, put out by a miss (see drawSheen)
  if (e.sheen) game.sheen = res.flash ? { e, t: game.time, calm: opts().calm } : null;
  // the Gloom's patches: a flare where the light burns one away, and a shadow seeping in where one is laid (see drawShade)
  if (res.burnt && res.burnt.length) shadeBurn(e, res.burnt);
  if (res.laid) shadeLay(e, res.laid);
  const prog = clamp(e.damage / e.hp, 0, 1);
  e.wob = 0.02 + prog * 0.04 + (res.crit ? 0.03 : 0); e.wobT = 0; e.squash = 1;
  game.shake = Math.min(14, game.shake + (res.crit ? 7 : 3) + prog * 3) * Math.max(0.5, L.k);
  if (res.crit && !opts().calm) game.freeze = 0.06;
  pop(res.crit ? tr("CRIT {0}", res.dmg.toFixed(1)) : res.dmg.toFixed(1), x, y - 14 * L.k, res.crit ? "#ffe9a8" : res.soft ? "#c9b8f0" : "#ffffff", res.crit ? 1.5 : 1);
  // the chain is a ring round the hammer that grows with every link; a miss breaks the ring it had
  if (e.combo || e.lost > 1) e.ring = { x, y, n: e.combo || e.lost, from: e.combo && e.ring && !e.ring.broken ? e.ring.n : 0, broken: !e.combo, t: game.time };
  if (echo) {
    // the bell echo: a second ring a beat later
    pop("ECHO", x - 34 * L.k, y - 30 * L.k, "#eec26a", 1.1);
    setTimeout(() => { sfx.knock(res.weak * 0.6); game.ripples.push(ripple(x, y, 60 * L.k, 1, res.lean)); }, 110);
  }
  if (Math.random() < 0.6) carveChip(x, y, rand(1.2, 2.4) * L.k, 3);
  spawnChips(x, y, 3 + Math.round(prog * 5) + (res.crit ? 4 : 0), 1 + prog);
  if (res.crit) burst(x, y, 10, ["#fff", ...e.crystal.c], 1.3);
  const skin = toolSkin();
  game.swings.push({ x, y, t: game.time, skin });
  if (skin.sparks) burst(x, y, res.crit ? 8 : 5, skin.sparks, 0.9);
  if (skin.chime && sfx.ready()) sfx.tone(sfx.ac.currentTime + 0.02, 1568 + res.weak * 400, 0.02, 0.5, "sine", null, true);
  flyGems(x, y, gems);
  sfx.knock(res.weak, e.combo - 1);
  if (res.grown) sfx.crackle(Math.min(res.grown, 12));
  game.ripples.push(ripple(x, y, ((res.lean ? 46 : 20) + res.weak * 40) * L.k, res.weak, res.lean));
  buzz(res.crit ? 18 : 7);
  if (byEar(e.conf) && res.weak > 0.2 && !res.crit) floatText(tr("closer…"), x, y - 30 * L.k, "#e6e0ff");
  updateDots();
}

/**
 * A knock's ripple on the shell. On silent stone it leans (see rippleLean and drawRipples), in the Celestite's pale
 * blue, and with less motion it stands still as an arc pointing the way, a little longer, and fades.
 */
function ripple(x, y, r, h, lean) {
  if (!lean) return { x, y, t: 0, r, h };
  const calm = opts().calm;
  return { x, y, t: 0, r, h, lean, tint: "#d8f1ff", calm, life: calm ? 1.4 : 0.9 };
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
  // a heavy hammer can knock out dozens at a blow: a dozen fly, each carrying its share
  for (let i = 0, many = Math.min(n, 12); i < many; i++) {
    const a = rand(-Math.PI, 0), v = rand(80, 200);
    game.gems.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: -i * 0.04, tx, ty, color: pick(game.egg.crystal.c), worth: Math.floor(n / many) + (i < n % many ? 1 : 0) });
  }
}

function openEgg() {
  markTip("open");
  const e = game.egg;
  e.state = "opening"; e.t = 0;
  updateEye();
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

/**
 * From level 4 the cloth has a few strokes: one unbroken drag each, counted the moment it touches the frost. A stroke
 * widens as it goes and dries out after STROKE_LEN egg widths, so a long curve that keeps to fresh frost clears far more
 * than a few straight swipes, and the shine is whatever the strokes cleared. The first three levels (and a shared egg,
 * where both hands rub one face) keep the open-ended rub, so the lesson of polishing lands first.
 */
const POLISH_STROKES = 4, STROKE_LEN = 3, STROKE_WARM = 1, STROKE_BRUSH = [0.7, 1.3];
const polishBudget = conf => conf.coop || conf.step <= 3 ? Infinity : POLISH_STROKES;
/** How wide the cloth is so far into a stroke (len in egg widths): narrow at the touch, full after STROKE_WARM. */
const strokeBrush = len => lerp(STROKE_BRUSH[0], STROKE_BRUSH[1], clamp(len / STROKE_WARM, 0, 1));

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
  const budget = polishBudget(e.conf);
  e.matte = { canvas: c, ctx: o, cells, done: 0, shine: 0, rev: 1, budget, used: 0, stroke: null };
  // with a budget, one cell of the face hides a bright fleck: uncover it and it's a pinch of magic dust (see showFound)
  if (budget < Infinity) e.matte.fleck = { i: Math.floor(Math.random() * cells.length), found: false };
  const first = budget < Infinity && !tipDone("strokes");
  setHint(first ? tr("only {0} strokes now · one long, curving stroke polishes the most", budget) : tr("rub the geode with your finger to polish it ✦"));
  $("polishDone").hidden = false; polishLabel(0); strokePips();
  if (!e.conf.coop) talk("firstPolish");
}

function rub(x, y, d, dt) {
  const e = game.egg, m = e.matte;
  if (!m || e.state !== "polish") return;
  const limited = m.budget < Infinity;
  if (limited && !m.stroke) {
    if (m.used >= m.budget) return;
    m.stroke = { len: 0, on: false, dry: false };
  }
  const s = m.stroke;
  if (limited && s.dry) return;
  const r = 22 * L.k * (limited ? strokeBrush(s.len) : 1), [sx, sy] = toShell(x, y);
  m.ctx.save();
  m.ctx.globalCompositeOperation = "destination-out";
  const g = m.ctx.createRadialGradient(sx, sy, 1, sx, sy, r);
  g.addColorStop(0, "rgba(0,0,0,.45)"); g.addColorStop(1, "rgba(0,0,0,0)");
  m.ctx.fillStyle = g;
  m.ctx.beginPath(); m.ctx.arc(sx, sy, r, 0, TAU); m.ctx.fill();
  m.ctx.restore();
  m.rev = (m.rev || 0) + 1;
  let touched = false;
  for (const c of m.cells) {
    if (c.done || (c.x - x) ** 2 + (c.y - y) ** 2 > (r * 0.8) ** 2) continue;
    touched = true;
    c.hits = (c.hits || 0) + 1;
    if (c.hits >= 3) { c.done = true; m.done++; }
  }
  m.shine = m.done / m.cells.length;
  polishLabel(m.shine);
  sfx.rubSet(m.shine, d / Math.max(dt, 0.008));
  if (Math.random() < 0.25 * (r / (22 * L.k))) game.sparks.push({ x: x + rand(-r, r) * 0.5, y: y + rand(-r, r) * 0.5, vx: 0, vy: -20, t: 0, life: 0.5, s: rand(3, 6), color: "#fff" });
  if (m.fleck && !m.fleck.found && m.cells[m.fleck.i].done) fleckFound(m);
  if (m.shine >= 0.9) { finishPolish(); return; }
  if (!limited) return;
  // the stroke counts from the moment it touches the frost, and from then on its length runs down the cloth
  if (!s.on && touched) { s.on = true; m.used++; }
  if (s.on) s.len += d / L.ew;
  strokePips();
  if (s.on && s.len >= STROKE_LEN) {
    s.dry = true; sfx.rubOff(); sfx.tick();
    if (m.used >= m.budget) finishPolish();
  }
}

/** The finger lifts: that stroke is done (with the last one, so is the polishing). */
function strokeEnd() {
  const e = game.egg, m = e && e.matte;
  if (!m || e.state !== "polish" || !m.stroke) return;
  m.stroke = null;
  strokePips();
  if (m.used >= m.budget) finishPolish();
}

/** The fleck turns up: a glint and a chime where it was, and the dust goes into the pantry with the found card. */
function fleckFound(m) {
  m.fleck.found = true; m.rev++;
  const c = m.cells[m.fleck.i];
  burst(c.x, c.y, 14, ["#fff", "#ffe9a8", ...game.egg.crystal.c], 0.8);
  pop("✨", c.x, c.y - 10 * L.k, "#ffe9a8", 1.3);
  sfx.star(2); buzz(12);
}
/** The fleck itself, drawn under the frost (ox, oy: from the screen to where the picture is drawn): a few bright pixels, faint through it, brighter once uncovered. */
function drawFleck(o, e, ox = 0, oy = 0) {
  const m = e.matte, f = m && m.fleck;
  if (!f) return;
  const c = m.cells[f.i], p = Math.max(2, Math.round((f.found ? 3 : 2) * L.k)), x = Math.round(c.x + ox), y = Math.round(c.y + oy);
  o.save();
  o.globalAlpha = f.found ? 1 : 0.85;
  o.fillStyle = "#fff";
  o.fillRect(x - p / 2, y - p * 1.5, p, p * 3); o.fillRect(x - p * 1.5, y - p / 2, p * 3, p);
  o.fillStyle = "#ffe9a8";
  o.fillRect(x - p * 2.5, y - p / 2, p, p); o.fillRect(x + p * 1.5, y - p / 2, p, p);
  o.fillRect(x - p / 2, y - p * 2.5, p, p); o.fillRect(x - p / 2, y + p * 1.5, p, p);
  o.restore();
}

/** The button shows how shiny it is so far, so rubbing visibly does something. */
function polishLabel(shine) {
  const t = tr("✨ Shiny enough") + " · " + Math.round(shine * 100) + "%";
  if ($("polishDone").textContent !== t) $("polishDone").textContent = t;
}
/** A pixel pip for each stroke: full ones still to come, the one in hand drains as its cloth dries, spent ones dark. */
function strokePips() {
  const m = game.egg && game.egg.matte, el = $("strokes");
  if (!el) return;
  el.hidden = !m || m.budget === Infinity;
  if (el.hidden) return;
  const now = m.stroke && m.stroke.on ? m.used - 1 : -1, left = now >= 0 ? 1 - clamp(m.stroke.len / STROKE_LEN, 0, 1) : 1;
  const html = Array.from({ length: m.budget }, (_, i) => i < m.used && i !== now ? "<i></i>" : i === now ? `<i class="on now" style="--left:${Math.ceil(left * 7) / 7}"></i>` : `<i class="on"></i>`).join("");
  if (el.innerHTML !== html) el.innerHTML = html;
  el.setAttribute("aria-label", tr("strokes left: {0}", m.budget - m.used + (now >= 0 ? 1 : 0)));
}

function finishPolish() {
  const e = game.egg;
  if (e.state !== "polish") return;
  markTip("polish");
  if (e.matte.budget < Infinity) markTip("strokes");
  sfx.rubOff();
  e.state = "gleam"; e.t = 0;
  // polished all the way: the last bits of frost vanish (and with them whatever they hid)
  if (e.matte.shine >= 0.9) { e.matte.ctx.clearRect(0, 0, e.matte.canvas.width, e.matte.canvas.height); e.matte.shine = 1; if (e.matte.fleck && !e.matte.fleck.found) fleckFound(e.matte); }
  e.matte.stroke = null;
  $("polishDone").hidden = true;
  strokePips();
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
  drawFleck(o, e, PAD - L.ex0, PAD - L.ey0);
  if (e.matte) o.drawImage(e.matte.canvas, 0, 0, L.ew + PAD * 2, L.eh + PAD * 2);
  drawGloss(o, L.ew / 2 + PAD, L.eh / 2 + PAD, 0.3 + (e.matte ? e.matte.shine : 0) * 0.6);
  if (withCreature) drawCreature(o, L.ew / 2 + PAD, L.eh / 2 + PAD + L.eh * 0.04, L.ew * 0.34, e.species, { t: 1000, mood: "happy", shiny: e.shiny });
  return c.toDataURL("image/png");
}

/**
 * Hatch: the glowling joins your nest. If you already have one of its kind (just as shiny), you choose on the found card:
 * it moves in as a glowling of its own, or it only visits its relative, who gets XP (see chooseTwin). A shared egg keeps
 * the visit, as both nests get the card at once.
 */
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
  adopt.sibling = false; adopt.twin = null;
  if (mine && !e.conf.coop) {
    adopt.twin = { e, kin: mine, name: twinName(sp, e.shiny) };
    note = tr("Another {0}! It can move in as a glowling of its own, or just visit its relative.", sp.name);
  } else if (mine) note = kinVisit(mine);
  else {
    mine = moveIn(e, (e.shiny ? "✦ " : "") + sp.name);
    note = e.shiny ? tr("A shiny one! It sparkles in your nest now ✦") : tr("{0} moved into your nest", sp.name);
  }
  save.active = mine.id;
  return { isNew, note, mine };
}
/** A new glowling moves into the nest, with a habit of its own (and if the room's full, someone goes exploring, see settleHome). */
function moveIn(e, name) {
  const sp = e.species;
  const mine = { id: save.nextId++, sp: sp.id, name, shiny: e.shiny, habit: newHabit(sp.id), level: 1, xp: 0, tummy: 70, joy: 80, energy: 80, sleeping: false, last: Date.now(), born: Date.now() };
  save.creatures.push(mine);
  if (e.conf.coop) remember(mine, "Hatched from a {0} geode, cracked together with a friend ♥", e.crystal.name);
  else remember(mine, e.conf.gloom ? "Freed from the Gloom's seal at the end of the {0}" : e.conf.moon ? "Hatched from a moon egg 🌙" : "Hatched from a {0} geode", e.conf.gloom ? CAVES[e.conf.gloom - 1] : e.crystal.name);
  return mine;
}
/** Only a visit: the one you have meets its relative, and grows from it. */
function kinVisit(kin) {
  applyTime(kin);
  addXP(kin, 40);
  kin.joy = clamp(kin.joy + 20, 0, 100);
  adopt.sibling = true;
  return tr("Your {0} met a sibling: +40 XP and lots of joy ✦", kin.name);
}
/** A twin's own name, so it's not mixed up with its relative: a little one nobody in the nest has yet. */
const TWIN_NAMES = ["Bean", "Button", "Pebble", "Puddle", "Tuft", "Mote", "Sprig", "Crumb", "Bramble", "Dot", "Fig", "Wren", "Nutmeg", "Clover", "Acorn", "Mitten"];
function twinName(sp, shiny) {
  const pre = shiny ? "✦ " : "", taken = new Set(save.creatures.map(c => c.name));
  const free = TWIN_NAMES.map(n => pre + tr(n)).filter(n => !taken.has(n));
  return free.length ? pick(free) : `${pre}${sp.name} ${save.creatures.filter(c => c.sp === sp.id).length + 1}`;
}
/** The choice on the found card for a repeat: welcome it home (home = true), or let it visit its relative. Leaving the card without choosing is a visit, as it always was. */
function chooseTwin(home) {
  const t = adopt.twin;
  if (!t) return;
  adopt.twin = null;
  $("foundTwin").hidden = true;
  let note, who;
  if (home) {
    who = moveIn(t.e, t.name);
    note = tr("{0} moved into your nest", who.name);
    $("foundNestSub").textContent = tr("{0} is waiting for you", who.name);
    sfx.chirp(t.e.species.voice || 1);
  } else {
    who = t.kin;
    note = kinVisit(who);
    $("foundNestSub").textContent = tr("{0} met a sibling: +40 XP", who.name);
  }
  save.active = who.id;
  $("foundNote").textContent = $("foundNote").textContent.replace(t.note, note);
  persist(); updateTopbar();
  if (!$("found").classList.contains("hidden")) $("foundNest").focus({ preventScroll: true });
}

function showFound() {
  const e = game.egg, sp = e.species, conf = e.conf, cry = e.crystal;
  if (conf.coop && e.coopRewarded) return;
  if (conf.coop) e.coopRewarded = true;
  // truer aim, more stars: finding the weak spot and staying on it is the whole trick
  const stars = aimStars(e);
  const firstClear = !conf.wander && !save.stars[conf.n];
  const shine = e.matte ? e.matte.shine : 0;
  const moonBonus = conf.moon ? finishMoon() : 0;
  let shards = 8 + stars * 10 + Math.floor(conf.step / 2) + (firstClear ? 10 : 0) + e.gems + Math.round(shine * 10) + moonBonus;
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
  // the bright fleck under the frost, if the strokes uncovered it: a pinch of magic dust for the pantry
  const fleck = !!(e.matte && e.matte.fleck && e.matte.fleck.found);
  if (fleck) save.pantry = { ...save.pantry, feast: ((save.pantry || {}).feast || 0) + 1 };
  const { isNew, note, mine } = adopt(e);
  if (conf.gloom) { bump("rescued"); save.shards += 30; talkLater.push(["g" + conf.gloom + "win"]); }
  if (!conf.coop && e.shiny) talkLater.push(["shiny", mine]);
  else if (!conf.coop && rarityOf(sp) === "legendary") talkLater.push(["legendary", mine]);
  persist();
  checkThemes();
  taskDone("crack");
  if (shine >= 0.8) taskDone("polish");
  if (!conf.coop) { bump("cracked"); if (e.shiny) bump("shiny"); habitTried(); }

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
  $("foundNote").textContent = (conf.coop ? tr("Shared egg · ") : "") + note + (conf.moon ? moonNote() : "") + (rubble ? tr(" · {0} in the rubble", barName(rubble)) : "") + (fleck ? tr(" · a pinch of magic dust under the frost ✨") : "") + (cheer ? tr(" · cheered on by {0}: +{1} ✦", buddy.name, cheer) : "");
  $("stShine").textContent = Math.round(shine * 100) + "%";
  // aim, and on a line of its own the mark of the next star up (of the third, once it is earned)
  $("stAim").textContent = aimShare(e) + "%";
  $("stAimFor").textContent = tr("aim") + "\n" + tr("{0}★\u00a0from\u00a0{1}%", Math.min(stars + 1, 3), AIM_STARS[Math.min(stars, 2) - 1]);
  $("stCrits").textContent = e.crits;
  $("stShards").textContent = "+" + shards;
  $("foundMap").hidden = !!conf.moon;
  // the nest is the other half of the game: say who's waiting there, so it's not just egg after egg
  $("foundNestLabel").textContent = tr("Go to the nest");
  $("foundNestSub").textContent = adopt.sibling ? tr("{0} met a sibling: +40 XP", mine.name) : tr("{0} is waiting for you", mine.name);
  // one of a kind you already have: two choices, one tap each; welcoming it home comes first
  const twin = adopt.twin;
  $("foundTwin").hidden = !twin;
  if (twin) {
    twin.note = note;
    $("twinHomeSub").textContent = tr("a new glowling: {0}", twin.name);
    $("twinVisitSub").textContent = tr("{0} gets +40 XP", mine.name);
  }
  $("nextLvl").textContent = conf.coop ? (coopIsHost() ? tr("Another shared egg") : tr("Waiting for host")) : conf.moon ? tr("Back to the grotto") : conf.wander ? tr("Another egg") : conf.n >= LEVELS ? tr("Wander on") : tr("Next level");
  $("nextLvl").disabled = !!conf.coop && !coopIsHost();
  if (conf.heart) heartFound(conf);
  updateTopbar();
  show("found", true);
  // (once the card has faded in: a hidden one can't take it)
  if (twin) setTimeout(() => { if (adopt.twin === twin) $("twinHome").focus({ preventScroll: true }); }, 480);
  if (conf.coop) coopBroadcast(true); // deliver the result before a host can send the next egg
}

// ---------- dialogs: Mossa, the stone-folk elder who keeps the grotto, talks you through the big moments ----------

// Mossa's face, and every other speaker's but the Gloom's, is in portraits.js.
const MOSSA = { name: "Mossa", face: mood => pxPortrait("mossa", mood), voice: { f: 190, wave: "triangle", spread: 0.22, glide: 0.92, gain: 0.07, len: 0.07 } };
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

/** Each line is [who, words, what to point at, mood]: what to point at is a selector for a button or panel, one of the canvas spots above
 *  or null; the mood (optional, see the cast's `as` in portraits.js) picks the speaker's face, the calm one if it has none. */
const TALKS = {
  intro: () => [[MOSSA, "Someone's here. Good. It's been quiet.", null, "warm"], [MOSSA, "I'm Mossa. I've kept watch over this grotto since before the moss was green."],
    [MOSSA, "Glowlings sleep in the stone eggs down here. Crack one, and whoever wakes will need a home.", "#crackTab"],
    [MOSSA, "This nest is yours. Empty, for now. Let's find who sleeps in the stone.", null, "warm"]],
  meet: () => [[MOSSA, "We've never been properly introduced. What should I call you?", null, "warm"]],
  firstPet: () => { const cr = firstPet(), g = glowVoice(cr); return [[g, "Pip?", spotActor], [g, "...pip-pip! ♥", spotActor],
    [MOSSA, tr("{0} trusts you already. Glowlings remember a kind hand.", cr.name), spotActor, "warm"],
    [MOSSA, "Stroke it, feed it, play with it, tuck it in when it's sleepy. That's how it grows.", "#nestBottom .acts"],
    [MOSSA, "Want another egg? The big Crack button is always right there. The nest has room for many.", "#crackTab"]]; },
  firstGrow: cr => [[glowVoice(cr), "Pip! Pip-pip-pip!", spotActor], [MOSSA, tr("Look at {0}. Not a little one any more.", cr.name), spotActor, "warm"],
    [MOSSA, "Glowlings grow when they're loved. Keep on, and one day it will be Radiant.", "#xpBar"]],
  firstGrotto: () => [[MOSSA, "This is the Grotto. Each level is a geode, a little harder than the last.", "#mapList .lvl.next"],
    [MOSSA, "Find the weak spot and keep your taps on it. The truer your aim, the more stars.", "#mapList .lvl.next"],
    [MOSSA, "On the altar in the hall, a moon egg appears once a day. Something special sleeps in it."]],
  firstExplore: cap => [[MOSSA, tr("The nest is warm, but small: {0} glowlings fit at home at once.", cap)], [MOSSA, "The others are out exploring the grotto, and they're happy there. Tap the glowlings button below to see who lives where, and call them home.", "#residentsBtn"]],
  firstPolish: () => [[MOSSA, "The inside is frosted. Rub it with a finger, and it will shine.", spotEgg], [MOSSA, "The more it shines, the more shards you earn. Tap the button when it's bright enough for you.", "#polishDone"]],
  firstForge: () => [[MOSSA, "The Forge. My old hammer is in here somewhere. Ember won't say where.", null, "warm"],
    [MOSSA, "Spend shards here: harder taps, keener eyes. The deep stone will ask for both.", "#forgeList"]],
  ch1: () => [[MOSSA, tr("The stone has shifted. The {0} is open now.", CAVES[1]), null, "resolve"],
    [MOSSA, "Down there the stone is quiet: no glow at all. But your ripples lean towards the weak spot. Watch them."], [MOSSA, "The stone is harder from here on. The Forge can help. It's on the map.", "#worldTab"]],
  ch2: () => [[MOSSA, tr("The stone has shifted. The {0} is open now.", CAVES[2]), null, "resolve"], [MOSSA, "Down there, you find the weak spot by ear. Listen for the knock that rings deep and hollow."],
    [MOSSA, "The stone there grows in bands. When one breaks, the weak spot moves. Find it again."]],
  ch3: () => [[MOSSA, tr("The stone has shifted. The {0} is open now.", CAVES[3]), null, "resolve"], [MOSSA, "The oldest stone, and the hardest. The rarest glowlings sleep in it.", null, "concerned"],
    [MOSSA, "Its weak spot flashes only when you strike it. Keep striking. You won't lose it."]],
  shiny: cr => [[glowVoice(cr), "✦ Pip! ✦"], [MOSSA, "A shiny one. I've seen only a handful in all my years.", null, "warm"]],
  legendary: cr => [[glowVoice(cr), "...Pip."], [MOSSA, tr("A legendary glowling. They say {0} wakes only for someone kind. They were right.", cr.name), null, "warm"]],
  allClear: () => [[MOSSA, "Every geode in the grotto, opened. In all my watch, this is the best of it.", null, "warm"],
    [MOSSA, "The deep caves never end. Go down whenever you like. I'll keep the moss warm.", "#mapList .wander", "warm"]],
  // Wick, on his bench in the hall, once the isle and its lighthouse are found: it is he who keeps that light (see talkMoments)
  wickLight: () => [[WICK, "You found the isle. And… the light on it."], [WICK, "Someone trims that wick every night. Quietly. It's… not a big thing.", null, "confiding"],
    [WICK, "Please don't tell Pip. He wants to meet the keeper. I'm not… ready to be met.", null, "flustered"]],
};

// ---------- the Gloom: a cold dark from the deep that seals the sparks in dead stone; at the end of each cave, one to rescue ----------

// a wheel of four blade-wings round an eclipse, an eye in each gap; only one of them is open
PX_PORTRAITS.gloom = {
  pal: { D: "#2e1d4f", E: "#b8323b", K: "#160c26", L: "#d2bfff", P: "#8a6cc9", V: "#523a85", W: "#ffffff", e: "#e0634f", k: "#0b0614", l: "#ad91e6", p: "#6b4fa8", v: "#3d2866", w: "#efe6ff" },
  rows: [
    "..........................",
    "........LL..LL..ll........",
    "......LLVK.weEw.Kvll......",
    ".....LPVvK..ll..KDvpl.....",
    "....LPVvK........KDvpP....",
    "...LPVvK..........KDvpP...",
    "..LPVvvK..........KDDvpP..",
    "..LVvKK....wWwL....KKDvp..",
    ".LVvK....wWkkkkLl....KDvV.",
    ".lKK....Wkkkkkkkkl....KKv.",
    "........wkkkkkkkkP........",
    ".......wkkkkkkkkkkP.......",
    ".l..l..Lkkkkkkkkkkp..l..l.",
    "..ll...Lkkkkkkkkkkp...ll..",
    ".......Lkkkkkkkkkkp.......",
    "........Lkkkkkkkkp........",
    ".PVV....LkkkkkkkkV....pvK.",
    ".PDvV....lLkkkkpV....pvDK.",
    "..pDvVV....llPp....ppvDK..",
    "..pDDvvV..........pvvDDK..",
    "...pDDvV..........pvDDK...",
    "....KDDvV........VvDDK....",
    ".....KDDvV.l..l.VvDDK.....",
    "......KKDv..ll..VDKK......",
    "........KK......KK........",
    "..........................",
  ],
};
const GLOOM = { name: "the Gloom", icon: "gloom", face: mood => pxPortrait("gloom", mood), voice: { f: 95, wave: "sawtooth", spread: 0.12, glide: 0.8, gain: 0.05, len: 0.1 } };
const GLOOM_STONE = Object.assign(["#3a2a52", "#1a1028", "#6b4fa8"], { gloom: true });
/** Before the sealed geode at the end of cave k (1..4), the Gloom has its say; after it opens, your friends have theirs. */
const GLOOM_TALKS = {
  g1: () => [[GLOOM, "Little light. You are loud."], [GLOOM, "They are not kept. They are hidden. Hidden things do not get hurt.", null, "watching"],
    [MOSSA, "A spark sleeps in there. Hidden things don't get to play, either.", null, "resolve"],
    [MOSSA, "Where the Gloom lays a shadow, blows land soft. Strike the glow beside it. The shadow burns.", null, "concerned"], [MOSSA, tr("Crack the seal, {0}. Let's wake it together.", myName()), null, "resolve"]],
  g1win: () => [[MOSSA, "That spark is awake now. And it has a home.", null, "warm"],
    [MOSSA, "The Gloom was here before the moss, and before me. When the seal cracked, it let go. Can you feel it?"]],
  g2: () => [[GLOOM, "I am what stayed when the light ran. I did not put it out.", null, "watching"], [GLOOM, "Every one you wake can be hurt again. Have you counted that?", null, "questioning"],
    [MOSSA, "We have. We wake them anyway.", null, "resolve"]],
  g2win: () => [[MOSSA, "Another spark, awake. The stone is a little warmer now.", null, "warm"],
    [MOSSA, "The Gloom isn't cruel, I think. It's afraid. Afraid that someone will be hurt again.", null, "concerned"]],
  g3: () => [[GLOOM, "The Heartlight did not run from me. It was hurting, and it hid.", null, "watching"], [GLOOM, "It broke itself into a thousand pieces. I have hidden them ever since.", null, "withdrawing"],
    [DORMA, "Hm… so that's why it gave itself away. It wasn't hiding from the Gloom. It was hiding from the hurt.", null, "realizing"],
    [DORMA, "A book that stays shut is safe, too. But nobody ever gets to read it. Let's open this one.", null, "fond"]],
  g3win: () => [[WICK, "That spark woke up humming. I'll… tell a few people. Quietly.", null, "glad"],
    [WICK, "I thought of something funny to say about the Gloom. It didn't feel right."], [WICK, "All that time alone, keeping a thousand pieces. I know a little about that.", null, "sincere"]],
  g4: () => [[GLOOM, "The last one. The oldest. Hidden longest."], [GLOOM, tr("Wake it, and nothing here is hidden any more. Can you stand to be seen, {0}?", myName()), null, "seen"],
    [MOSSA, "Not alone. That's why there are two of us.", null, "resolve"]],
  g4win: () => [[MOSSA, "The oldest spark is awake. The Gloom has drawn back from the deep caves. Not gone. Only quieter."],
    [MOSSA, "The dark will come again, the way it does. But every nest that glows keeps the dark gentle."],
    [MOSSA, tr("Thank you, {0}. You're a true keeper now.", myName()), null, "warm"]],
};
Object.assign(TALKS, GLOOM_TALKS);
/** How many steps the Gloom's wheel takes through a quarter turn (after that it looks the same again). */
const GLOOM_TURNS = 6;
/**
 * The Gloom's own shape for the scene, baked once per size (crisp pixels, never scaled): its wheel of four blade-wings at
 * every step of a quarter turn, the eclipse in the hub from dim to bright, and an eye asleep and an eye awake. `R` is the
 * wheel's radius in art pixels. Every colour is one of PIXEL_PALETTE's, so the scene's dither leaves the shape alone.
 */
function bakeGloomWheel(R) {
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const paint = (w, h, col) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), im = g.createImageData(w, h), px = im.data;
    for (let p = 0; p < w * h; p++) if (col[p]) { const i = p * 4; px[i] = col[p][0]; px[i + 1] = col[p][1]; px[i + 2] = col[p][2]; px[i + 3] = 255; }
    g.putImageData(im, 0, 0);
    return c;
  };
  const INK = hex("#0b0614"), EDGE = hex("#160c26"), D1 = hex("#22143a"), D2 = hex("#2e1d4f"), V1 = hex("#3d2866"), V2 = hex("#523a85"), V3 = hex("#6b4fa8");
  // a blade is a lens: inside the wheel's rim, and inside a far larger circle whose arc makes its inner edge
  const S = 2 * R + 2, mid = S / 2, half = 36 * Math.PI / 180, thick = Math.max(3, R * 0.26), line = Math.max(1, R / 30);
  const tx = R * Math.sin(half), ty = -R * Math.cos(half), bulge = thick - (R + ty), far = (tx * tx + ty * ty - (ty + bulge) ** 2) / (2 * bulge), r3 = far + ty + bulge;
  const wheels = [];
  for (let f = 0; f < GLOOM_TURNS; f++) {
    const col = new Array(S * S).fill(null);
    for (let k = 0; k < 4; k++) {
      const ax = Math.PI / 4 + (f / GLOOM_TURNS + k) * Math.PI / 2, ca = Math.cos(ax), sa = Math.sin(ax);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = x + 0.5 - mid, dy = y + 0.5 - mid, r = Math.hypot(dx, dy);
        if (r > R || r < R - thick - 1) continue;
        const q = Math.hypot(dx * ca + dy * sa, dy * ca - dx * sa + far);
        if (q > r3) continue;
        // lit: +1 where the blade faces the light (up and left); each blade has a ridge, a rim outside and an edge inside
        const lit = -(dx + dy) / (r * Math.SQRT2), out = R - r, inn = r3 - q;
        col[y * S + x] = out < line ? (lit > 0.55 ? V3 : lit > 0.1 ? V2 : lit > -0.35 ? V1 : EDGE)
          : inn < line ? (lit > -0.1 ? EDGE : V1)
          : out < inn ? (lit > 0.3 ? V1 : lit > -0.3 ? D2 : D1) : (lit > 0.3 ? D2 : lit > -0.3 ? D1 : D2);
      }
    }
    wheels.push(paint(S, S, col));
  }
  // the eclipse: a black disc and a thin cold corona, brightest toward the light; three strengths for its breathing
  const rd = R * 0.4, ring = Math.max(1.25, R * 0.055), hs = 2 * Math.ceil(rd + ring + 2), CORONA = ["#3d2866", "#523a85", "#6b4fa8", "#8a6cc9", "#ad91e6", "#d2bfff", "#efe6ff"].map(hex);
  const hubs = [0, 1, 2].map(lv => {
    const col = new Array(hs * hs).fill(null);
    for (let y = 0; y < hs; y++) for (let x = 0; x < hs; x++) {
      const dx = x + 0.5 - hs / 2, dy = y + 0.5 - hs / 2, r = Math.hypot(dx, dy), lit = -(dx + dy) / (r * Math.SQRT2 || 1);
      if (r <= rd) col[y * hs + x] = INK;
      else if (r <= rd + ring) col[y * hs + x] = CORONA[clamp(Math.round(2 + lit * 2) + lv - (r > rd + ring * 0.6 ? 1 : 0), 0, 6)];
      else if (lv === 2 && r <= rd + ring + 1 && lit > 0.25) col[y * hs + x] = D2;
    }
    return paint(hs, hs, col);
  });
  const EYE = { P: V3, l: hex("#ad91e6"), w: hex("#efe6ff"), e: hex("#e0634f"), E: hex("#b8323b") };
  const eye = rows => paint(rows[0].length, rows.length, [...rows.join("")].map(ch => EYE[ch] || null));
  // the eyes are drawn by hand, in two sizes
  return R < 44 ? { R, wheels, hubs, shut: eye(["P.....P", ".PPPPP."]), open: eye([".lllll.", "lweEewl", ".PPPPP."]) }
    : { R, wheels, hubs, shut: eye(["P.........P", ".PP.....PP.", "...PPPPP..."]), open: eye(["...lllll...", ".llwwewwll.", "lwwweEewwwl", ".PPwwewwPP.", "...PPPPP..."]) };
}
const gloomWheel = { R: 0 };

/**
 * The cold creeping in round a sealed geode: dark at the edges that breathes, and the Gloom itself hanging in it, up and
 * to the left, clear of the geode and the buttons: its wheel turns a notch at a time, its corona breathes with the dark,
 * and its eyes open one by one, then all shut.
 */
function drawGloom() {
  const e = game.egg;
  if (!e || !e.conf.gloom || e.state === "opening" || e.state === "done") return;
  const k = 0.75 + 0.25 * Math.sin(game.time * 0.0017), g = ctx.createRadialGradient(L.ecx, L.ecy, L.ew * 0.55, L.ecx, L.ecy, Math.max(W, H) * 0.75);
  g.addColorStop(0, "rgba(10,4,20,0)"); g.addColorStop(1, `rgba(10,4,20,${0.85 * k})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const P = PX * Math.max(1, Math.round(2 / PX));
  let r = clamp(Math.min(W, H) * 0.15, 54, 120);
  const x0 = Math.max(W * 0.16, r + 6), y0 = Math.max(H * 0.22, r + 60);
  // on a short or narrow screen it shrinks rather than lean over the geode
  while (r > 24 && ((x0 - L.ecx) / (L.ew / 2 + r)) ** 2 + ((y0 - L.ecy) / (L.eh / 2 + r)) ** 2 < 1) r *= 0.9;
  const R = Math.round(r / P), A = gloomWheel;
  if (A.R !== R) Object.assign(A, bakeGloomWheel(R));
  const turn = Math.floor(game.time / 1600), wake = (game.time / 3000) % 7, cx = Math.round(x0 / P) * P, cy = Math.round(y0 / P) * P;
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const put = (c, ax, ay) => ctx.drawImage(c, cx + Math.round(ax - c.width / 2) * P, cy + Math.round(ay - c.height / 2) * P, c.width * P, c.height * P);
  put(A.wheels[turn % GLOOM_TURNS], 0, 0);
  put(A.hubs[k > 0.9 ? 2 : k > 0.65 ? 1 : 0], 0, 0);
  // an eye rides in each gap between the blades: one more wakes every three seconds, then they all shut together
  for (let i = 0; i < 4; i++) {
    const a = (turn / GLOOM_TURNS + i) * Math.PI / 2;
    put(wake > i + 1 && wake < 6.85 ? A.open : A.shut, Math.sin(a) * R * 0.86, -Math.cos(a) * R * 0.86);
  }
  ctx.imageSmoothingEnabled = smooth;
}

// ---------- the story: why the glowlings sleep in stone, told a little at a time as you go deeper ----------

const WICK = { name: "Wick", face: mood => pxPortrait("wick", mood), voice: { f: 420, wave: "sawtooth", spread: 0.3, glide: 1.1, gain: 0.025, len: 0.05 } };
const DORMA = { name: "Dorma", face: mood => pxPortrait("dorma", mood), voice: { f: 260, wave: "sine", spread: 0.15, glide: 0.85, gain: 0.08, len: 0.09 } };
/** Each part opens with a level of the grotto and plays once; the book keeps them all to read again. */
const STORY = [
  { id: "s1", at: 3, title: "The Heartlight", who: MOSSA, lines: () => [
    [MOSSA, "You have a gentle touch. Shall I tell you why glowlings sleep in stone?", null, "warm"],
    [MOSSA, "Long ago a great light lived at the bottom of this grotto. We called it the Heartlight."],
    [MOSSA, "One night it went quiet and scattered into a thousand sparks. Each one curled up in the rock to keep warm."],
    [MOSSA, "That's what a glowling is: a little piece of the Heartlight, dreaming.", null, "warm"]] },
  { id: "s2", at: 7, title: "The lantern moth", who: WICK, lines: () => [
    [WICK, "Um. Hello. Up here. I'm Wick. I… trade in glimmers. And small news."],
    [WICK, "Mossa told you about the Heartlight? Did she say… who kept watch that night? Sorry. Not mine to ask.", null, "confiding"],
    [MOSSA, "Wick. Not now.", null, "grief"],
    [WICK, "Sorry. I'll be… on the bench. I usually am.", null, "flustered"]] },
  { id: "s3", at: 10, title: "The keeper", who: MOSSA, lines: () => [
    [MOSSA, "Wick asked a fair question. I was the Heartlight's keeper.", null, "grief"],
    [MOSSA, "That night sleep found me on my watch. When I woke, the light was gone.", null, "grief"],
    [MOSSA, "Ever since, I've listened for its sparks in the stone, hoping someone kind would come to wake them."],
    [MOSSA, "And then you came.", null, "warm"]] },
  { id: "s4", at: 13, title: "The sleepy library", who: DORMA, lines: () => [
    [DORMA, "Hm? …Someone come to read. Good. I'm Dorma. I keep the grotto's library."],
    [DORMA, "Most of the books are asleep. So am I, mostly."],
    [DORMA, "Here's a page about the moon eggs… The moon was the Heartlight's oldest friend.", null, "fond"],
    [DORMA, "Every night she leaves an egg by a nest that glows, hoping it holds a spark she knows.", null, "fond"]] },
  { id: "s5", at: 16, title: "A gift", who: DORMA, lines: () => [
    [DORMA, "Another page. Under my pillow again. I've stopped asking how.", null, "puzzled"],
    [DORMA, "It says the Heartlight didn't break by accident. It gave itself away.", null, "realizing"],
    [DORMA, "The grotto was growing cold and lonely… and a thousand small lights reach further than one big one.", null, "sorrowful"],
    [MOSSA, "It gave itself away? All this time I thought I'd failed it...", null, "grief"]] },
  { id: "s6", at: 19, title: "A hum in the deep", who: WICK, lines: () => [
    [WICK, "Um… news from the deep. The old hollow at the bottom of the Vault. It's started to hum.", null, "confiding"],
    [WICK, "Not for a hundred years. I think it's waiting. Maybe… for someone.", null, "sincere"],
    [MOSSA, "The Heartlight's hollow. Go carefully down there.", null, "concerned"]] },
  { id: "s7", at: 22, title: "Warm stone", who: MOSSA, lines: () => [
    [MOSSA, "The deeper you go, the warmer the stone. Can you feel it?"],
    [MOSSA, "Your glowlings glow brighter every day. The sparks remember where they came from.", null, "warm"]] },
  { id: "s8", at: LEVELS + 1, title: "The Heartlight's hollow", who: MOSSA, lines: () => [
    [MOSSA, "So this is it. The Heartlight's hollow."],
    [MOSSA, "Empty, I thought. No, look! Your glowlings are lighting it up.", null, "warm"],
    [MOSSA, "The Heartlight never really went out. It lives in every nest that's loved. It lives in yours.", null, "warm"],
    [WICK, "It's… beautiful. I'll tell Pip. Some of it.", null, "glad"],
    [DORMA, "I'll write this one down. Awake, for once.", null, "fond"],
    [MOSSA, "Thank you. At last I can rest easy on my watch.", null, "warm"]] },
];
// the Gloom's parts, told at the sealed geodes, join the story in the book once heard
for (const [i, at] of [[1, 6], [2, 12], [3, 18], [4, 24]]) STORY.push({ id: "g" + i, at, title: ["The Gloom", "What stayed in the dark", "A thousand pieces", "The oldest spark"][i - 1], who: GLOOM, lines: GLOOM_TALKS["g" + i], gloom: true });
STORY.sort((a, b) => a.at - b.at || (a.gloom ? 1 : 0) - (b.gloom ? 1 : 0));
for (const s of STORY) TALKS[s.id] = s.lines;
/** Tell a part of the story again, from the book. */
function retell(s) {
  talkQueue.push(s.lines().map(([who, words, , mood]) => [who, words, null, mood]));
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
  const [who, words, spot, mood] = n.lines[n.i];
  // a button or panel further down a list scrolls into view first
  if (typeof spot === "string") document.querySelector(spot)?.scrollIntoView({ block: "nearest" });
  updateSpot();
  const text = tr(words), face = who.face(mood);
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
/** No more lines than this in a row at one calm moment: the rest wait their turn for the next one (see talkMoments). */
const TALK_RUN = 5;
/** Lines already waiting or still to come on screen. */
const talkLines = () => talkQueue.reduce((a, l) => a + l.length, 0) + (talkNow ? talkNow.lines.length - Math.max(0, talkNow.i) : 0);
/** The day this nest began: its first glowling met (an older nest that never noted it began long ago). */
const nestBegan = () => Math.min(Date.now(), ...Object.values(save.seen).map(v => Number.isFinite(v.first) ? v.first : 0));
/** An event is told about once the first cave has been tasted (level 3) and not on the nest's first day or in its first session. */
const eventToldOk = () => !!save.stars[3] && !startedEmpty && dayKey(new Date(nestBegan())) !== dayKey();
function talkMoments(scene) {
  if (!["nest", "map", "lib"].includes(scene) || !$("found").classList.contains("hidden")) return;
  habitMoments(scene);
  // one by one, in their order, while there's room in this run; the first that doesn't fit waits, and so does all after it
  let full = false;
  const say = (id, ...args) => {
    if (full || !TALKS[id] || talkSeen(id) || game.coopTouched || coopSession) return false;
    const n = TALKS[id](...args).length, now = talkLines();
    if (now && now + n > TALK_RUN) { full = true; return false; }
    return talk(id, ...args);
  };
  const waiting = talkLater.splice(0);
  for (const a of waiting) if (!say(...a) && full) talkLater.push(a);
  if (scene === "nest" && save.creatures.length) say("firstPet");
  if (scene === "nest") tellTrips();
  // (the question that opens the sheet about you: it comes when it's asked, it's one line)
  if (scene === "nest" && save.creatures.length && !(save.me && save.me.name) && !talkSeen("meet") && talk("meet")) afterTalk = () => openMe(true);
  if (scene === "map") say("firstGrotto");
  for (const k of [1, 2, 3]) if (unlocked(k * 6 + 1)) say("ch" + k);
  if (unlocked(LEVELS + 1)) say("allClear");
  // Mossa tells you when an event starts, once each year
  const ev = eventNow();
  if (ev && save.creatures.length && eventToldOk()) {
    const id = `ev-${ev.id}-${new Date().getFullYear()}`;
    TALKS[id] = () => [[MOSSA, ev.line, null, "warm"], [MOSSA, tr("For {0} days, a limited glowling sleeps in the moon egg: {1}. It comes back every year.", eventDaysLeft(ev), SP[ev.sp].name)]];
    say(id);
  }
  // Wick comes to the grotto's hall every third day to top up its lanterns, and lets you know
  if (scene === "nest" && save.creatures.length && wickHere()) {
    const id = `wick-${dayNo()}`;
    TALKS[id] = () => [[WICK, wickRoom() ? "Um, hello. I'm on the bench, topping up the hall's lanterns. I brought a few things to sell, if you'd like." : "Um, hello. I'm in the grotto today, on the bench, topping up the lanterns. A few things for sale, too. Until midnight.", wickRoom() ? null : "#worldTab"]];
    say(id);
    // on his bench, once you've found the isle, he lets slip whose light that is out at sea (Pip is not to know)
    if (wickRoom() && wardFound("isle")) say("wickLight");
  }
  // one part of the story per visit, so a long-time player catches up gently
  const part = STORY.find(s => !s.gloom && unlocked(s.at) && !talkSeen(s.id));
  if (part) say(part.id);
}

function nestHint() {
  // (nothing over the valley map: it would cover the places you came to tap)
  if (!save.creatures.length || worldOpen()) return "";
  if (!tipDone("pet")) return tr("stroke {0} to pet it ♥", activeCreature()?.name || tr("your glowling"));
  if (game.scene === "nest" && gloomNow.on) return tipDone("lantern") ? tr("the Gloom's shadows: shine your light on them, together") : tr("shadows of the Gloom! hold your finger on one to shine your lantern");
  // (only about someone who is right here: not from the shop or the forge, nor for someone in another room)
  const cr = activeCreature(), call = cr && !isPlace() && roomOf(cr) === save.room && !cr.out && callOf(cr);
  if (call) return { hungry: tr("{0} is hungry: give it a snack", cr.name), sleepy: tr("{0} is sleepy: tuck it in", cr.name), messy: tr("dust bunnies! tap them to sweep the nest"), lonely: tr("{0} feels lonely: pet it or play", cr.name) }[call];
  // dust is the nest's own: its hint shows only there, whoever you're looking after (the very first bunny gets a how-to)
  const dust = game.scene === "nest" ? dustSpots().length : 0;
  if (dust && !tipDone("sweep")) return tr("a dust bunny! tap it to sweep it away");
  if (dust >= 2) return tr("dust bunnies! tap them to sweep the nest");
  if (!tipDone("call")) return tr("tip: hold a finger on the floor to call everyone");
  // (keepers greet you themselves; only the grotto's hall says what its things do, until you've used them)
  if (isPlace()) return heroHere()?.none && !tipDone("hall") ? tr("the tunnel leads to the next egg · the map on the wall shows every level") : "";
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
  // the first of the Gloom's shadows: a finger shows where to hold your light
  if (game.scene === "nest" && gloomNow.on && !tipDone("lantern")) { const w = gloomNow.wisps.find(q => q.on && q.t > 0.6); if (w) return { kind: "tap", at: [w.x, w.y - gloomAlt()] }; }
  // the first dust bunny in the nest: a tap on it shows how it's swept
  if (game.scene === "nest" && tipDone("pet") && !tipDone("sweep")) { const s = dustSpots()[0]; if (s) return { kind: "tap", at: [s.x, s.y - s.r * 0.6] }; }
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
