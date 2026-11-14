"use strict";
// Hatchstone · drawing glowlings and their accessories.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- glowlings ----------

const BODY = {
  round: { rx: 0.5, ry: 0.42, top: -0.42, face: -0.03, feet: 0.38 },
  bean: { rx: 0.42, ry: 0.5, top: -0.5, face: -0.08, feet: 0.46 },
  wide: { rx: 0.56, ry: 0.38, top: -0.38, face: 0, feet: 0.34 },
  drop: { rx: 0.47, ry: 0.47, top: -0.6, face: 0.1, feet: 0.53 },
};

function bodyPath(c, s, type) {
  c.beginPath();
  if (type === "drop") {
    c.moveTo(0, -0.6 * s);
    c.bezierCurveTo(0.28 * s, -0.38 * s, 0.47 * s, -0.12 * s, 0.47 * s, 0.1 * s);
    c.arc(0, 0.1 * s, 0.47 * s, 0, Math.PI);
    c.bezierCurveTo(-0.47 * s, -0.12 * s, -0.28 * s, -0.38 * s, 0, -0.6 * s);
  } else {
    const b = BODY[type];
    c.ellipse(0, 0, b.rx * s, b.ry * s, 0, 0, TAU);
  }
  c.closePath();
}

/** Wings, fins and tails sit behind the body. */
function drawBack(c, s, sp, t, pal) {
  const [main, light, deep] = pal;
  switch (sp.back) {
    case "mothwings": {
      const flap = 0.78 + 0.22 * Math.sin(t * 0.008);
      for (const d of [-1, 1]) {
        c.save();
        c.translate(d * s * 0.28, -s * 0.12); c.rotate(d * 0.5); c.scale(flap, 1);
        c.globalAlpha = 0.9; c.fillStyle = light;
        c.beginPath(); c.ellipse(d * s * 0.22, -s * 0.05, s * 0.3, s * 0.2, 0, 0, TAU); c.fill();
        c.beginPath(); c.ellipse(d * s * 0.14, s * 0.15, s * 0.18, s * 0.12, d * 0.4, 0, TAU); c.fill();
        c.globalAlpha = 1; c.fillStyle = deep;
        c.beginPath(); c.arc(d * s * 0.27, -s * 0.06, s * 0.055, 0, TAU); c.fill();
        c.restore();
      }
      break;
    }
    case "fins":
      for (const d of [-1, 1]) {
        c.save();
        c.translate(d * s * 0.43, s * 0.08); c.rotate(d * (0.3 + Math.sin(t * 0.01) * 0.2));
        c.fillStyle = light; c.globalAlpha = 0.9;
        c.beginPath(); c.moveTo(0, -s * 0.13); c.lineTo(d * s * 0.3, -s * 0.02); c.lineTo(0, s * 0.13); c.closePath(); c.fill();
        c.restore();
      }
      break;
    case "ribbon": {
      c.save(); c.lineCap = "round";
      for (let i = 0; i < 22; i++) {
        const a = -s * 0.3 - i * s * 0.045, b = s * 0.18 + Math.sin(t * 0.004 + i * 0.45) * s * 0.09 * (i / 22) - i * s * 0.012;
        const a2 = a - s * 0.045, b2 = s * 0.18 + Math.sin(t * 0.004 + (i + 1) * 0.45) * s * 0.09 * ((i + 1) / 22) - (i + 1) * s * 0.012;
        c.strokeStyle = pal[Math.floor(i / 6) % 3];
        c.lineWidth = s * 0.1 * (1 - i / 24);
        c.beginPath(); c.moveTo(a, b); c.lineTo(a2, b2); c.stroke();
      }
      c.restore();
      break;
    }
    case "comet": {
      c.save();
      c.rotate(-0.65 + Math.sin(t * 0.003) * 0.05);
      const g = c.createLinearGradient(0, 0, -s * 1.2, 0);
      g.addColorStop(0, light); g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.beginPath(); c.moveTo(-s * 0.1, -s * 0.32); c.lineTo(-s * 1.2, 0); c.lineTo(-s * 0.1, s * 0.32); c.closePath(); c.fill();
      c.fillStyle = "#ffe9a8";
      for (let i = 0; i < 5; i++) { sparklePath(c, -s * (0.45 + i * 0.15), Math.sin(t * 0.004 + i) * s * 0.1, s * 0.04); c.fill(); }
      c.restore();
      break;
    }
    case "startail": {
      const wag = Math.sin(t * 0.004) * s * 0.05;
      c.strokeStyle = main; c.lineWidth = s * 0.06; c.lineCap = "round";
      c.beginPath(); c.moveTo(s * 0.35, s * 0.2); c.quadraticCurveTo(s * 0.85, s * 0.25, s * 0.72 + wag, -s * 0.2); c.stroke();
      c.fillStyle = light; sparklePath(c, s * 0.72 + wag, -s * 0.22, s * 0.13); c.fill();
      break;
    }
    case "tail": {
      const wag = Math.sin(t * 0.005) * s * 0.07;
      c.strokeStyle = main; c.lineWidth = s * 0.1; c.lineCap = "round";
      c.beginPath(); c.moveTo(s * 0.45, s * 0.2); c.quadraticCurveTo(s * 0.85, s * 0.15, s * 0.7 + wag, -s * 0.25); c.stroke();
      break;
    }
    case "fluff":
      c.save();
      c.translate(s * 0.5, s * 0.12); c.rotate(-0.6 + Math.sin(t * 0.004) * 0.12);
      c.fillStyle = main; c.beginPath(); c.ellipse(s * 0.22, 0, s * 0.3, s * 0.15, 0, 0, TAU); c.fill();
      c.fillStyle = "#fff"; c.globalAlpha = 0.9; c.beginPath(); c.ellipse(s * 0.44, 0, s * 0.1, s * 0.09, 0, 0, TAU); c.fill();
      c.restore();
      break;
    case "wisp": {
      const w = Math.sin(t * 0.004) * s * 0.12;
      const g = c.createLinearGradient(0, 0, 0, s * 0.95);
      g.addColorStop(0, main); g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.beginPath(); c.moveTo(-s * 0.45, s * 0.1);
      c.quadraticCurveTo(-s * 0.3 + w, s * 0.6, w * 1.5, s * 0.98);
      c.quadraticCurveTo(s * 0.3 + w, s * 0.6, s * 0.45, s * 0.1);
      c.closePath(); c.fill();
      break;
    }
  }
}

/** Ears and crowns that peek out from behind the body. */
function drawBehindHead(c, s, sp, t, pal, top) {
  const [main, light, deep] = pal;
  switch (sp.ears) {
    case "bunny":
      for (const d of [-1, 1]) {
        c.save();
        c.translate(d * s * 0.17, top + s * 0.04); c.rotate(d * (0.18 + Math.sin(t * 0.003 + d) * 0.05));
        c.fillStyle = main; c.beginPath(); c.ellipse(0, -s * 0.26, s * 0.09, s * 0.28, 0, 0, TAU); c.fill();
        c.fillStyle = light; c.beginPath(); c.ellipse(0, -s * 0.24, s * 0.045, s * 0.2, 0, 0, TAU); c.fill();
        c.restore();
      }
      break;
    case "cat": case "fox": {
      const big = sp.ears === "fox";
      for (const d of [-1, 1]) {
        c.fillStyle = main;
        c.beginPath(); c.moveTo(d * s * (big ? 0.08 : 0.12), top + s * 0.12); c.lineTo(d * s * 0.46, top + s * 0.2); c.lineTo(d * s * (big ? 0.38 : 0.32), top - s * (big ? 0.32 : 0.2)); c.closePath(); c.fill();
        c.fillStyle = light;
        c.beginPath(); c.moveTo(d * s * 0.18, top + s * 0.12); c.lineTo(d * s * 0.38, top + s * 0.16); c.lineTo(d * s * (big ? 0.35 : 0.31), top - s * (big ? 0.18 : 0.08)); c.closePath(); c.fill();
      }
      break;
    }
    case "tufts":
      c.fillStyle = deep;
      for (const d of [-1, 1]) {
        c.beginPath(); c.moveTo(d * s * 0.26, top + s * 0.08); c.lineTo(d * s * 0.5, top + s * 0.16); c.lineTo(d * s * 0.5, top - s * 0.15); c.closePath(); c.fill();
      }
      break;
  }
  if (sp.head === "petals") {
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.33, open = 1 + Math.sin(t * 0.002) * 0.04;
      c.save();
      c.translate(Math.cos(a) * s * 0.34 * open, top + s * 0.12 + Math.sin(a) * s * 0.34 * open);
      c.rotate(a + Math.PI / 2);
      c.fillStyle = i % 2 ? light : main;
      c.beginPath(); c.ellipse(0, 0, s * 0.08, s * 0.15, 0, 0, TAU); c.fill();
      c.restore();
    }
  }
  if (sp.head === "rays") {
    c.save();
    c.rotate(t * 0.0004);
    c.fillStyle = light;
    for (let i = 0; i < 12; i++) {
      c.rotate(TAU / 12);
      c.beginPath(); c.moveTo(-s * 0.06, -s * 0.4); c.lineTo(0, -s * 0.64); c.lineTo(s * 0.06, -s * 0.4); c.closePath(); c.fill();
    }
    c.restore();
  }
}

function drawPattern(c, s, sp, t, pal, R) {
  const [main, light, deep] = pal;
  switch (sp.pattern) {
    case "freckles":
      c.fillStyle = "rgba(255,255,255,.85)";
      for (const d of [-1, 1]) for (let i = 0; i < 3; i++) {
        c.beginPath(); c.arc(d * s * (0.27 + (i % 2) * 0.05), BODY[sp.body].face * s + s * (0.13 + i * 0.03), s * 0.016, 0, TAU); c.fill();
      }
      break;
    case "spots":
      c.fillStyle = deep; c.globalAlpha = 0.28;
      for (let i = 0; i < 5; i++) { c.beginPath(); c.arc((R() - 0.5) * s * 0.85, (R() - 0.35) * s * 0.6, s * (0.04 + R() * 0.06), 0, TAU); c.fill(); }
      c.globalAlpha = 1;
      break;
    case "stripes":
      c.fillStyle = deep; c.globalAlpha = 0.3;
      for (let i = 0; i < 3; i++) c.fillRect(-s, BODY[sp.body].top * s + s * (0.12 + i * 0.16), s * 2, s * 0.065);
      c.globalAlpha = 1;
      break;
    case "heart":
      c.fillStyle = "rgba(255,255,255,.75)";
      c.save(); c.translate(0, s * 0.2); c.scale(s * 0.11, s * 0.11);
      c.beginPath(); c.moveTo(0, 0.35); c.bezierCurveTo(-1.1, -0.35, -0.45, -1.05, 0, -0.45); c.bezierCurveTo(0.45, -1.05, 1.1, -0.35, 0, 0.35); c.fill();
      c.restore();
      break;
    case "bubbles":
      c.strokeStyle = "rgba(255,255,255,.65)"; c.lineWidth = Math.max(1, s * 0.012);
      for (let i = 0; i < 4; i++) { c.beginPath(); c.arc((R() - 0.5) * s * 0.7, (R() - 0.2) * s * 0.5, s * (0.035 + R() * 0.04), 0, TAU); c.stroke(); }
      break;
    case "belly":
      c.fillStyle = "rgba(255,255,255,.45)";
      c.beginPath(); c.ellipse(0, s * 0.14, s * 0.27, s * 0.22, 0, 0, TAU); c.fill();
      break;
    case "galaxy": {
      const neb = c.createRadialGradient(s * 0.1, -s * 0.1, 1, s * 0.1, -s * 0.1, s * 0.4);
      neb.addColorStop(0, "rgba(159,176,255,.4)"); neb.addColorStop(1, "rgba(159,176,255,0)");
      c.fillStyle = neb; c.fillRect(-s, -s, s * 2, s * 2);
      for (let i = 0; i < 22; i++) {
        c.fillStyle = i % 3 ? `rgba(255,255,255,${0.4 + 0.6 * Math.abs(Math.sin(t * 0.002 + i * 1.7))})` : "#e8c25a";
        const r = s * (0.008 + R() * 0.012);
        c.fillRect((R() - 0.5) * s, (R() - 0.5) * s, r * 2, r * 2);
      }
      break;
    }
    case "iridescent": {
      const a = t * 0.0008, gx = Math.cos(a) * s * 0.5, gy = Math.sin(a) * s * 0.5;
      const g = c.createLinearGradient(-gx, -gy, gx, gy);
      g.addColorStop(0, pal[0]); g.addColorStop(0.35, pal[1]); g.addColorStop(0.7, pal[2]); g.addColorStop(1, "#ffd6f0");
      c.globalAlpha = 0.4; c.fillStyle = g; c.fillRect(-s, -s, s * 2, s * 2); c.globalAlpha = 1;
      break;
    }
  }
}

function drawHeadTop(c, s, sp, t, pal, top, level) {
  const [main, light, deep] = pal;
  switch (sp.head) {
    case "antennae": {
      const sway = Math.sin(t * 0.004) * s * 0.03;
      c.strokeStyle = deep; c.lineWidth = Math.max(1.2, s * 0.022); c.lineCap = "round";
      for (const d of [-1, 1]) {
        const ex = d * s * 0.27 + sway, ey = top - s * 0.3;
        c.beginPath(); c.moveTo(d * s * 0.08, top + s * 0.05); c.quadraticCurveTo(d * s * 0.1, top - s * 0.2, ex, ey); c.stroke();
        const g = c.createRadialGradient(ex, ey, 1, ex, ey, s * 0.08);
        g.addColorStop(0, "#fff"); g.addColorStop(0.5, light); g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g; c.beginPath(); c.arc(ex, ey, s * 0.08, 0, TAU); c.fill();
      }
      break;
    }
    case "sprout": {
      c.strokeStyle = "#5f9a3a"; c.lineWidth = Math.max(1.2, s * 0.025); c.lineCap = "round";
      c.beginPath(); c.moveTo(0, top + s * 0.03); c.lineTo(0, top - s * 0.16); c.stroke();
      const leaves = 1 + Math.min(3, Math.floor((level || 1) / 5));
      for (let i = 0; i < leaves; i++) {
        const d = i % 2 ? -1 : 1, y = top - s * (0.14 - i * 0.045);
        c.fillStyle = i % 2 ? light : main;
        c.beginPath(); c.ellipse(d * s * 0.09, y, s * 0.1, s * 0.045, d * -0.5 + Math.sin(t * 0.003) * 0.1, 0, TAU); c.fill();
      }
      break;
    }
    case "crystal":
      c.fillStyle = shade(light, 0.3);
      c.beginPath(); c.moveTo(-s * 0.08, top + s * 0.04); c.lineTo(0, top - s * 0.26); c.lineTo(s * 0.09, top + s * 0.04); c.closePath(); c.fill();
      c.fillStyle = shade(main, -0.1);
      c.beginPath(); c.moveTo(s * 0.02, top + s * 0.04); c.lineTo(s * 0.2, top - s * 0.14); c.lineTo(s * 0.14, top + s * 0.06); c.closePath(); c.fill();
      break;
    case "crescent": {
      const r = s * 0.14;
      c.save(); c.translate(0, top - s * 0.1);
      c.fillStyle = "#fff8d6";
      c.beginPath(); c.arc(0, 0, r, Math.PI * 0.08, Math.PI * 0.92, false); c.arc(0, -r * 0.4, r * 0.86, Math.PI * 0.9, Math.PI * 0.1, true); c.closePath(); c.fill();
      c.restore();
      break;
    }
    case "cap": {
      const droop = Math.sin(t * 0.002) * s * 0.03;
      c.fillStyle = deep;
      c.beginPath(); c.moveTo(-s * 0.3, top + s * 0.1); c.quadraticCurveTo(-s * 0.05, top - s * 0.38, s * 0.44 + droop, top + s * 0.06); c.lineTo(s * 0.3, top + s * 0.1); c.closePath(); c.fill();
      c.fillStyle = light;
      c.beginPath(); c.ellipse(0, top + s * 0.1, s * 0.32, s * 0.06, 0, 0, TAU); c.fill();
      c.fillStyle = "#fff"; c.beginPath(); c.arc(s * 0.45 + droop, top + s * 0.08, s * 0.065, 0, TAU); c.fill();
      break;
    }
  }
}

function drawFace(c, s, sp, t, mood, eating) {
  const fy = BODY[sp.body].face * s, ex = s * (sp.body === "wide" ? 0.18 : 0.16);
  const ink = "#2a1f4a";
  c.fillStyle = ink; c.strokeStyle = ink; c.lineCap = "round";
  c.lineWidth = Math.max(1.2, s * 0.025);
  const blink = (t % 3800) < 140;
  if (mood === "asleep") {
    for (const d of [-1, 1]) { c.beginPath(); c.arc(d * ex, fy - s * 0.01, s * 0.045, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
  } else if (mood === "happy" || mood === "joy") {
    for (const d of [-1, 1]) { c.beginPath(); c.arc(d * ex, fy + s * 0.02, s * 0.045, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke(); }
  } else if (blink) {
    for (const d of [-1, 1]) c.fillRect(d * ex - s * 0.045, fy - s * 0.01, s * 0.09, Math.max(1.2, s * 0.02));
  } else {
    const kind = mood === "sleepy" ? "sleepy" : sp.eyes;
    for (const d of [-1, 1]) {
      const x = d * ex;
      if (kind === "sleepy") {
        c.fillStyle = ink;
        c.beginPath(); c.ellipse(x, fy + s * 0.01, s * 0.05, s * 0.032, 0, 0, Math.PI); c.fill();
        c.beginPath(); c.moveTo(x - s * 0.06, fy); c.lineTo(x + s * 0.06, fy); c.stroke();
        continue;
      }
      const big = kind === "big";
      c.fillStyle = ink;
      c.beginPath(); c.ellipse(x, fy, s * (big ? 0.07 : 0.046), s * (big ? 0.085 : 0.065), 0, 0, TAU); c.fill();
      c.fillStyle = "#fff";
      if (kind === "sparkle") { sparklePath(c, x + s * 0.015, fy - s * 0.022, s * 0.03); c.fill(); }
      else { c.beginPath(); c.arc(x + s * 0.017, fy - s * 0.025, s * (big ? 0.028 : 0.017), 0, TAU); c.fill(); }
    }
    if (mood === "sad" || mood === "hungry") {
      c.strokeStyle = ink;
      for (const d of [-1, 1]) { c.beginPath(); c.moveTo(d * ex - d * s * 0.06, fy - s * 0.09); c.lineTo(d * ex + d * s * 0.03, fy - s * 0.12); c.stroke(); }
    }
  }
  c.fillStyle = "rgba(255,140,180,.45)";
  for (const d of [-1, 1]) { c.beginPath(); c.ellipse(d * s * 0.28, fy + s * 0.09, s * 0.07, s * 0.04, 0, 0, TAU); c.fill(); }
  c.strokeStyle = ink; c.fillStyle = ink;
  const my = fy + s * 0.09;
  if (eating) {
    const open = 0.5 + 0.5 * Math.sin(t * 0.03);
    c.beginPath(); c.ellipse(0, my + s * 0.01, s * 0.04, s * (0.01 + open * 0.035), 0, 0, TAU); c.fill();
  } else if (mood === "sad" || mood === "hungry") {
    c.beginPath(); c.arc(0, my + s * 0.05, s * 0.045, 1.2 * Math.PI, 1.8 * Math.PI); c.stroke();
  } else if (mood === "asleep") {
    c.beginPath(); c.arc(0, my + s * 0.01, s * 0.018, 0, TAU); c.stroke();
  } else {
    c.beginPath(); c.arc(0, my - s * 0.01, s * 0.045, 0.2, Math.PI - 0.2); c.stroke();
  }
}

// ---------- accessories: little things a glowling can wear, drawn on the sprite before it's cut into pixels ----------
const ACCESSORIES = [
  { id: "bow", name: "Pink bow", emoji: "🎀", cost: 40 },
  { id: "star", name: "Star clip", emoji: "⭐", cost: 40 },
  { id: "flowers", name: "Flower crown", emoji: "🌸", cost: 60 },
  { id: "scarf", name: "Cozy scarf", emoji: "🧣", cost: 60 },
  { id: "glasses", name: "Round glasses", emoji: "👓", cost: 70 },
  { id: "mushroom", name: "Mushroom cap", emoji: "🍄", cost: 80 },
  { id: "crown", name: "Little crown", emoji: "👑", cost: 150 },
];
if (LANG === "uk") for (const a of ACCESSORIES) a.name = tr(a.name);
/** Where the top of the head is at x (in units of s from the middle): hats sit on the head's real outline, not above a pointy tip. */
function headAt(body, x) {
  x = Math.abs(x);
  if (body === "drop") {
    // the drop's upper curve, from its tip (0, -0.6) down to its widest point (0.47, 0.1)
    for (let k = 0; k <= 40; k++) {
      const t = k / 40, u = 1 - t, bx = 3 * u * u * t * 0.28 + 3 * u * t * t * 0.47 + t * t * t * 0.47;
      if (bx >= x) return -0.6 * u * u * u - 3 * u * u * t * 0.38 - 3 * u * t * t * 0.12 + t * t * t * 0.1;
    }
    return 0.1;
  }
  const b = BODY[body];
  return -b.ry * Math.sqrt(Math.max(0, 1 - (x / b.rx) ** 2));
}
/** Draw one accessory on a glowling (in its own coordinates: centered, s wide, the top of its head at `top`). */
function drawAccessory(c, s, sp, top, id) {
  const B = BODY[sp.body], fy = B.face * s, ex = s * (sp.body === "wide" ? 0.18 : 0.16), head = x => headAt(sp.body, x / s) * s;
  // fine lines stay at least one pixel wide, so small pictures don't smudge them
  const m = c.getTransform(), thin = 1.2 / (Math.hypot(m.a, m.b) || 1);
  c.save();
  if (id === "bow") {
    const x = s * 0.26, y = head(x) + s * 0.04, w = s * 0.23, h = s * 0.16;
    c.fillStyle = "#e88bb1";
    for (const d of [-1, 1]) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + d * w, y - h); c.lineTo(x + d * w, y + h); c.closePath(); c.fill(); }
    c.fillStyle = "#c25586"; c.beginPath(); c.arc(x, y, s * 0.065, 0, TAU); c.fill();
  } else if (id === "star") {
    const x = -s * 0.28, y = head(x) + s * 0.06, r = s * 0.15;
    c.fillStyle = "#eec26a"; c.beginPath();
    for (let k = 0; k < 10; k++) { const an = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
    c.closePath(); c.fill();
    c.fillStyle = "#fff0b5"; c.beginPath(); c.arc(x - r * 0.15, y - r * 0.15, r * 0.2, 0, TAU); c.fill();
  } else if (id === "flowers") {
    for (let k = -3; k <= 3; k++) {
      const x = k * s * 0.11, y = Math.min(head(x) + s * 0.05, head(0) + s * 0.12 + k * k * s * 0.008);
      c.fillStyle = "#57ad6a"; c.beginPath(); c.ellipse(x + s * 0.06, y + s * 0.03, s * 0.07, s * 0.035, 0.4, 0, TAU); c.fill();
      c.fillStyle = ["#ffc4da", "#fff0b5", "#ffffff", "#e88bb1"][(k + 3) % 4]; c.beginPath(); c.arc(x, y, s * 0.075, 0, TAU); c.fill();
      c.fillStyle = "#eec26a"; c.beginPath(); c.arc(x, y, s * 0.028, 0, TAU); c.fill();
    }
  } else if (id === "scarf") {
    // round the neck, just under the face, as wide as the body is there
    const y = fy + s * (sp.body === "wide" ? 0.2 : 0.26), band = y - s * 0.06;
    const half = sp.body === "drop" ? 0.47 * s * Math.sqrt(Math.max(0, 1 - ((band / s - 0.1) / 0.47) ** 2)) : B.rx * s * Math.sqrt(Math.max(0, 1 - (band / (B.ry * s)) ** 2));
    c.strokeStyle = "#e0634f"; c.lineWidth = s * 0.11; c.lineCap = "round";
    c.beginPath(); c.ellipse(0, band, Math.max(s * 0.2, half * 0.86), s * 0.1, 0, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();
    // the loose end hangs down the front, but never below the tummy
    const end = Math.min(s * 0.22, (sp.body === "drop" ? 0.5 : B.ry - 0.06) * s - y);
    c.fillStyle = "#e0634f"; c.fillRect(s * 0.16, y - s * 0.02, s * 0.1, end);
    c.fillStyle = "#fff0b5"; for (const k of [0.08, 0.15]) if (k * s < end - s * 0.03) c.fillRect(s * 0.16, y - s * 0.02 + k * s, s * 0.1, s * 0.03);
  } else if (id === "glasses") {
    c.strokeStyle = "#22143a"; c.lineWidth = Math.max(s * 0.03, thin);
    for (const d of [-1, 1]) { c.beginPath(); c.arc(d * ex, fy, s * 0.1, 0, TAU); c.stroke(); }
    c.beginPath(); c.moveTo(-ex + s * 0.1, fy - s * 0.01); c.lineTo(ex - s * 0.1, fy - s * 0.01); c.stroke();
    c.fillStyle = "rgba(255,255,255,.5)"; for (const d of [-1, 1]) { c.beginPath(); c.arc(d * ex - s * 0.04, fy - s * 0.04, s * 0.02, 0, TAU); c.fill(); }
  } else if (id === "mushroom") {
    const y = head(s * 0.3) + s * 0.05;
    c.fillStyle = "#e0634f"; c.beginPath(); c.ellipse(0, y, s * 0.34, s * 0.2, 0, Math.PI, TAU); c.fill();
    c.fillStyle = "#b8323b"; c.fillRect(-s * 0.34, y - s * 0.02, s * 0.68, s * 0.04);
    c.fillStyle = "#ffffff"; for (const [dx, dy, r] of [[-0.16, -0.08, 0.05], [0.08, -0.13, 0.045], [0.2, -0.05, 0.035], [-0.02, -0.04, 0.03]]) { c.beginPath(); c.arc(dx * s, y + dy * s, r * s, 0, TAU); c.fill(); }
  } else if (id === "crown") {
    const w = s * 0.27, y = head(w * 0.8) + s * 0.04;
    c.fillStyle = "#eec26a"; c.beginPath(); c.moveTo(-w, y); c.lineTo(-w, y - s * 0.17); c.lineTo(-w * 0.5, y - s * 0.07); c.lineTo(0, y - s * 0.24); c.lineTo(w * 0.5, y - s * 0.07); c.lineTo(w, y - s * 0.17); c.lineTo(w, y); c.closePath(); c.fill();
    c.fillStyle = "#c98f3a"; c.fillRect(-w, y - s * 0.045, w * 2, s * 0.045);
    c.fillStyle = "#e88bb1"; c.beginPath(); c.arc(0, y - s * 0.09, s * 0.05, 0, TAU); c.fill();
    c.fillStyle = "#fff0b5"; c.beginPath(); c.arc(-w * 0.6, y - s * 0.07, s * 0.018, 0, TAU); c.fill();
  }
  c.restore();
}

/** A floppy striped nightcap with a pompom, in a color of its own for each kind of glowling. */
function drawNightcap(c, s, sp, top) {
  const caps = [["#1d5276", "#3383a8", "#b8e6f5"], ["#8f3460", "#c25586", "#ffc4da"], ["#523a85", "#8a6cc9", "#d2bfff"], ["#1e5233", "#2f7d4a", "#a3dd9b"], ["#946027", "#c98f3a", "#fff0b5"]];
  const [dk, md, lt] = caps[[...sp.id].reduce((h, ch) => h + ch.charCodeAt(0), 0) % caps.length];
  const y0 = top + s * 0.12;
  c.save();
  c.fillStyle = md; c.beginPath(); c.moveTo(-s * 0.38, y0); c.quadraticCurveTo(-s * 0.22, y0 - s * 0.66, s * 0.46, y0 - s * 0.52); c.quadraticCurveTo(s * 0.16, y0 - s * 0.32, s * 0.38, y0); c.closePath(); c.fill();
  c.fillStyle = dk; c.beginPath(); c.moveTo(s * 0.12, y0); c.quadraticCurveTo(s * 0.22, y0 - s * 0.32, s * 0.46, y0 - s * 0.52); c.quadraticCurveTo(s * 0.22, y0 - s * 0.24, s * 0.38, y0); c.closePath(); c.fill();
  c.strokeStyle = lt; c.lineWidth = s * 0.07; c.beginPath(); c.moveTo(-s * 0.28, y0 - s * 0.22); c.quadraticCurveTo(0, y0 - s * 0.34, s * 0.24, y0 - s * 0.28); c.stroke();
  c.fillStyle = "#efe6ff"; c.beginPath(); c.ellipse(0, y0, s * 0.42, s * 0.1, 0, 0, TAU); c.fill();
  c.beginPath(); c.arc(s * 0.48, y0 - s * 0.52, s * 0.1, 0, TAU); c.fill();
  c.restore();
}

/**
 * Draw a glowling centered at (x, y), about s pixels wide.
 * o: { t, mood, hop, level, shiny, eating, sil (a dark silhouette for undiscovered species), glow }
 */
function drawCreature(c, x, y, s, sp, o = {}) {
  const t = o.t ?? game.time, level = o.level || 1, stage = stageOf(level), mood = o.mood || "ok";
  const pal = palOf(sp);
  const R = seeded(sp.id);
  s *= [0.82, 1, 1.12, 1.22][stage];
  const asleep = mood === "asleep";
  const bob = (asleep ? Math.sin(t * 0.0015) * 0.015 : Math.sin(t * 0.003) * 0.03) * s;
  const hop = o.hop || 0;
  const sq = (asleep ? 1 + Math.sin(t * 0.0015) * 0.03 : 1 + Math.sin(t * 0.003) * 0.025) - hop * 0.08;
  const B = BODY[sp.body], top = B.top * s;
  c.save();
  c.translate(x, y + bob - Math.sin(hop * Math.PI) * s * 0.35);
  if (!o.sil && o.glow !== false) {
    const gr = Math.min(s * (0.95 + stage * 0.15), o.maxGlow || Infinity);
    const g = c.createRadialGradient(0, 0, s * 0.2, 0, 0, gr);
    g.addColorStop(0, `rgba(255,255,255,${(0.32 + stage * 0.06) * (o.glowK ?? 1)})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, gr, 0, TAU); c.fill();
  }
  c.scale(1 / sq, sq);
  drawBack(c, s, sp, t, pal);
  drawBehindHead(c, s, sp, t, pal, top);
  bodyPath(c, s, sp.body);
  const galaxy = sp.pattern === "galaxy";
  if (galaxy) {
    const g = c.createRadialGradient(-s * 0.3, top * 0.75, s * 0.02, -s * 0.05, top * 0.15, s * 0.72);
    g.addColorStop(0, shade(pal[0], 0.15)); g.addColorStop(0.3, pal[0]); g.addColorStop(1, pal[2]);
    c.fillStyle = g; c.fill();
  } else {
    // three flat tones, as pixel artists shade: the body color, a crescent of shadow low on the right, a small light high on the left
    c.fillStyle = pal[0]; c.fill();
    c.save(); c.clip();
    c.translate(-s * 0.07, -s * 0.08); bodyPath(c, s, sp.body); c.fillStyle = pal[1]; c.fill();
    c.fillStyle = shade(pal[1], 0.3); c.beginPath(); c.ellipse(-s * 0.2, top * 0.62, s * 0.18, s * 0.11, -0.4, 0, TAU); c.fill();
    c.restore();
    bodyPath(c, s, sp.body);
  }
  // and one small hard glint, a few pixels across
  if (!galaxy && !o.sil) { c.fillStyle = "rgba(255,255,255,.75)"; c.beginPath(); c.ellipse(-s * 0.36, top * 0.8, s * 0.04, s * 0.028, -0.5, 0, TAU); c.fill(); }
  c.save(); c.clip();
  drawPattern(c, s, sp, t, pal, R);
  c.restore();
  bodyPath(c, s, sp.body);
  c.strokeStyle = shade(pal[2], -0.25); c.globalAlpha = 0.3; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1;
  // a glowling with its own little hat takes it off for a hat from the wardrobe, and for the nightcap at bedtime
  const hatOn = (mood !== "asleep" && ["flowers", "mushroom", "crown"].includes(o.acc)) || (mood === "asleep" && !o.sil && o.cap);
  if (!(sp.head === "cap" && hatOn)) drawHeadTop(c, s, sp, t, pal, top, level);
  if (o.acc && !o.sil && !(mood === "asleep" && ["bow", "flowers", "mushroom", "crown", "star"].includes(o.acc))) drawAccessory(c, s, sp, top, o.acc);
  // the nightcap is only for sleeping in the bed: dozing anywhere else keeps the eyes shut but no cap
  if (mood === "asleep" && !o.sil && o.cap) drawNightcap(c, s, sp, top);
  if (faceStamp && !o.sil) {
    // inside a sprite cut, remember where the face goes; it's stamped pixel by pixel afterwards so the eyes stay crisp
    const m = c.getTransform(), at = (lx, ly) => [(m.a * lx + m.c * ly + m.e) / 2, (m.b * lx + m.d * ly + m.f) / 2];
    const fy = BODY[sp.body].face * s, ex = s * (sp.body === "wide" ? 0.18 : 0.16);
    faceStamp.push({ eyes: [at(-ex, fy), at(ex, fy)], mouth: at(0, fy + s * 0.1), blush: [at(-s * 0.28, fy + s * 0.08), at(s * 0.28, fy + s * 0.08)],
      r: Math.hypot(m.a, m.b) / 2 * s * 0.5, mood, kind: mood === "sleepy" || (sp.beh || BEHAVIOR[sp.id]) === "curious" ? "sleepy" : sp.eyes, eating: !!o.eating, blink: (t % 3800) < 140, t });
  } else drawFace(c, s, sp, t, mood, o.eating);
  if (sp.back !== "wisp") {
    c.fillStyle = shade(pal[0], -0.15);
    for (const d of [-1, 1]) { c.beginPath(); c.ellipse(d * s * 0.16, B.feet * s, s * 0.09, s * 0.05, 0, 0, TAU); c.fill(); }
  }
  // growing up: orbiting sparkles, then a halo
  if (stage >= 2) {
    const n = stage === 3 ? 5 : 3;
    c.fillStyle = "#fff";
    for (let i = 0; i < n; i++) {
      const a = t * 0.0015 + i * TAU / n;
      sparklePath(c, Math.cos(a) * s * 0.72, Math.sin(a) * s * 0.22 - s * 0.05, s * 0.045); c.fill();
    }
  }
  if (stage === 3) {
    c.strokeStyle = "rgba(255,248,201,.85)"; c.lineWidth = Math.max(1.5, s * 0.025);
    c.beginPath(); c.ellipse(0, top - s * 0.3, s * 0.2, s * 0.055, 0, 0, TAU); c.stroke();
  }
  if (o.shiny) {
    c.fillStyle = "#ffe9a8";
    for (let i = 0; i < 3; i++) {
      const k = Math.abs(Math.sin(t * 0.003 + i * 2.1));
      sparklePath(c, [-0.45, 0.5, 0.3][i] * s, [-0.35, -0.2, 0.35][i] * s, s * 0.07 * k); c.fill();
    }
  }
  c.restore();
}

/**
 * A glowling as a proper pixel sprite on the main canvas: drawn small, cut out with hard edges, shaded in flat palette
 * bands (no dither noise), traced with a one-pixel dark outline, and lit from behind by a soft glow so it stands out.
 */
const spriteBuf = { c: document.createElement("canvas"), o: document.createElement("canvas") };
spriteBuf.g = spriteBuf.c.getContext("2d", { willReadFrequently: true });
spriteBuf.og = spriteBuf.o.getContext("2d");
/** A glowling's own neon: its body colour pushed to full saturation and lifted, as a "#rrggbb" and as [r, g, b]. */
const neonCache = {};
function neonOf(sp) {
  if (neonCache[sp.id]) return neonCache[sp.id];
  const [r, g, b] = pxHex(palOf(sp)[0]).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const hue = (h * 60 + 360) % 360, S = 1, L = 0.68, C = (1 - Math.abs(2 * L - 1)) * S, X = C * (1 - Math.abs((hue / 60) % 2 - 1)), m = L - C / 2;
  const [rr, gg, bb] = hue < 60 ? [C, X, 0] : hue < 120 ? [X, C, 0] : hue < 180 ? [0, C, X] : hue < 240 ? [0, X, C] : hue < 300 ? [X, 0, C] : [C, 0, X];
  const rgb = [rr, gg, bb].map(v => Math.round((v + m) * 255));
  return neonCache[sp.id] = { rgb, css: (a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})` };
}
/**
 * The ethereal look, made from a baked sprite: its silhouette edge lit in its neon, a two-pixel halo of light around it,
 * and (in the "spirit" look) the body fading toward its feet, as if it were made of light more than of anything else.
 */
function neonize(f, sp, look) {
  const key = "n" + look;
  if (f[key]) return f[key];
  const src = f.c, w = src.width, h = src.height, c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.drawImage(src, 0, 0);
  const im = g.getImageData(0, 0, w, h), d = im.data, solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3] > 40 ? 1 : 0;
  let y0 = h, y1 = 0; for (let i = 0; i < w * h; i++) if (solid[i]) { const y = (i / w) | 0; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const [nr, ng, nb] = neonOf(sp).rgb, near = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && solid[Y * w + X] && Math.abs(dx) + Math.abs(dy) <= r) return true; } return false; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = i * 4;
    if (solid[i]) {
      const edge = !(x > 0 && solid[i - 1]) || !(x < w - 1 && solid[i + 1]) || !(y > 0 && solid[i - w]) || !(y < h - 1 && solid[i + w]);
      if (edge) { d[o] = nr + (255 - nr) * 0.15; d[o + 1] = ng + (255 - ng) * 0.15; d[o + 2] = nb + (255 - nb) * 0.15; }
      else { d[o] = d[o] + (nr - d[o]) * 0.12; d[o + 1] = d[o + 1] + (ng - d[o + 1]) * 0.12; d[o + 2] = d[o + 2] + (nb - d[o + 2]) * 0.12; }
      if (look === 2) { const k = clamp((y - (y0 + (y1 - y0) * 0.55)) / ((y1 - y0) * 0.45), 0, 1); d[o + 3] = d[o + 3] * (1 - 0.55 * k); }
      continue;
    }
    if (near(x, y, 1)) { d[o] = nr; d[o + 1] = ng; d[o + 2] = nb; d[o + 3] = look === 2 ? 140 : 120; }
    else if (near(x, y, 2) && PX_BAYER[(y & 3) * 4 + (x & 3)] < 0.5) { d[o] = nr; d[o + 1] = ng; d[o + 2] = nb; d[o + 3] = 55; }
  }
  g.putImageData(im, 0, 0);
  return f[key] = { c, x: f.x, y: f.y };
}
function drawSprite(x, y, s, sp, o = {}) {
  const grow = [0.82, 1, 1.12, 1.22][stageOf(o.level || 1)], look = o.look ?? (typeof opts === "function" ? opts().look : 0);
  if (o.glow !== false && look) {
    // a pool of the glowling's own light, breathing slowly, laid on with "lighter" so it glows rather than paints
    const gr = s * grow * (look === 2 ? 1.35 : 1.15), pulse = 0.85 + 0.15 * Math.sin((o.t ?? game.time) * 0.0025 + sp.id.length), n = neonOf(sp), k = (o.glowK ?? 1) * pulse;
    const g = ctx.createRadialGradient(x, y, s * 0.15, x, y, gr);
    g.addColorStop(0, n.css(0.42 * k)); g.addColorStop(0.5, n.css(0.18 * k)); g.addColorStop(1, n.css(0));
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, gr, 0, TAU); ctx.fill(); ctx.restore();
  } else if (o.glow !== false) {
    // a lighter pool of light behind it: the dark outline needs something brighter to sit on
    const gr = s * grow * 1.05, g = ctx.createRadialGradient(x, y, s * 0.3, x, y, gr);
    g.addColorStop(0, `rgba(210,191,255,${0.55 * (o.glowK ?? 1)})`);
    g.addColorStop(0.6, `rgba(138,108,201,${0.3 * (o.glowK ?? 1)})`);
    g.addColorStop(1, "rgba(138,108,201,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, gr, 0, TAU); ctx.fill();
  }
  // pixel-art pace: a new frame every 100 ms, drawn once and reused, placed on whole pixels so it never shimmers
  const t = Math.floor((o.t ?? game.time) / 100) * 100;
  const key = `${sp.id}|${Math.round(s)}|${o.level || 1}|${!!o.shiny}|${o.mood || ""}|${!!o.eating}|${Math.round((o.hop || 0) * 6)}|${t}|${PX}|${o.acc || ""}|${!!o.cap}`;
  let f = spriteFrames.get(key);
  if (!f) {
    if (spriteFrames.size > 400) spriteFrames.clear();
    f = bakeSprite(0, 0, s * grow, () => drawCreature(ctx, 0, 0, s, sp, { ...o, t, glow: false }), { lut: SPRITE_LUT, soft: false });
    spriteFrames.set(key, f);
  }
  drawBaked(look && !o.sil ? neonize(f, sp, look) : f, x, y);
}
const spriteFrames = new Map();

/**
 * Draw something once as a crisp sprite and keep it: returns { c, x, y } (top-left in screen units, on the pixel grid).
 * Drawing it again costs one image copy, so sprites only get redrawn when they really change.
 */
function bakeSprite(cx, cy, half, draw, opts = {}) {
  const side = opts.side ?? 1.25, up = opts.up ?? 1.75, down = opts.down ?? 1;
  const x0 = (Math.floor((cx - half * side) / PX) - 2) * PX, y0 = (Math.floor((cy - half * up) / PX) - 2) * PX;
  const c = document.createElement("canvas");
  c.width = Math.ceil(half * side * 2 / PX) + 7; c.height = Math.ceil(half * (up + down) / PX) + 7;
  const g = c.getContext("2d");
  g.setTransform(1 / PX, 0, 0, 1 / PX, -x0 / PX, -y0 / PX);
  const real = ctx;
  cutSprite(g, cx, cy, half, gg => { ctx = gg; try { draw(); } finally { ctx = real; } }, { lut: PIXEL_LUT, soft: true, ...opts });
  return { c, x: x0, y: y0 };
}

/** Put a baked sprite down, optionally moved by (dx, dy) snapped to whole art pixels. */
function drawBaked(f, dx = 0, dy = 0) {
  const was = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(f.c, f.x + Math.round(dx / PX) * PX, f.y + Math.round(dy / PX) * PX, f.c.width * PX, f.c.height * PX);
  ctx.imageSmoothingEnabled = was;
}

/**
 * Is (x, y) on a baked picture's own pixels (or within pad CSS pixels of one)? Taps count on the thing itself,
 * not on a box around it, so nothing goes off by accident.
 */
function spriteHit(c, x0, y0, x, y, pad = 4) {
  const ax = Math.floor((x - x0) / PX), ay = Math.floor((y - y0) / PX), r = Math.ceil(pad / PX);
  if (ax < -r || ay < -r || ax >= c.width + r || ay >= c.height + r) return false;
  if (!c._alpha || c._alpha.key !== c.width * 1e5 + c.height) { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, a = new Uint8Array(c.width * c.height); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] > 40; c._alpha = a; c._alpha.key = c.width * 1e5 + c.height; }
  for (let j = Math.max(0, ay - r); j <= Math.min(c.height - 1, ay + r); j++) for (let i = Math.max(0, ax - r); i <= Math.min(c.width - 1, ax + r); i++) if (c._alpha[j * c.width + i] && Math.hypot(i - ax, j - ay) <= r) return true;
  return false;
}

/** A baked sprite kept on an object, redrawn only when its key changes. */
function cachedSprite(owner, slot, key, make) {
  const k = owner[slot];
  if (k && k.key === key) return k.f;
  const f = make();
  owner[slot] = { key, f };
  return f;
}

/** Draw something as a crisp sprite onto a canvas whose transform maps to its pixels: see drawSprite. */
/** Faces waiting to be stamped while a sprite is being cut (drawCreature fills it in). */
let faceStamp = null;
const FACE = { ink: pxHex("#22143a"), hi: pxHex("#ffffff"), blush: pxHex("#e88bb1"), mouthIn: pxHex("#8f3460") };
/**
 * A glowling's face in whole pixels, sized to the sprite (the way small pixel faces are drawn):
 * tiny sprites get one-pixel eyes, middle ones 2×2 eyes with a white glint, big ones 3×3; smiles are three pixels,
 * blush is two pink pixels, closed and happy eyes are little pixel arcs.
 */
function stampFace(d, w, h, solid, f, ox, oy) {
  const put = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h || !solid[y * w + x]) return; const i = (y * w + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
  const R = f.r, e = R < 8 ? 1 : R < 17 ? 2 : R < 26 ? 3 : Math.round(R * 0.13), big = f.kind === "big", tall = e + (big && e > 1 ? 1 : 0) + (e === 1 && R >= 6 ? 1 : 0) + (e >= 4 ? Math.round(e * 0.3) : 0);
  const eyes = f.eyes.map(([x, y]) => [Math.round(x - ox - e / 2), Math.round(y - oy - tall / 2)]);
  const arc = (x, y, up) => { for (let k = 0; k <= e; k++) put(x + k, y + (k === 0 || k === e ? (up ? 1 : 0) : (up ? 0 : 1)), FACE.ink); };
  for (const [x, y] of eyes) {
    if (f.mood === "hungry" && !f.blink && !f.eating && R >= 8) {
      // hungry: big, round, shiny puppy eyes (larger than usual, two glints, a wet shine along the bottom)
      const E = Math.max(3, Math.round(e * 1.6)), Th = Math.max(4, Math.round(tall * 1.45)), x0 = Math.round(x + e / 2 - E / 2), y0 = Math.round(y + tall / 2 - Th / 2);
      for (let j = 0; j < Th; j++) for (let k = 0; k < E; k++) if (((k + 0.5 - E / 2) / (E / 2)) ** 2 + ((j + 0.5 - Th / 2) / (Th / 2)) ** 2 <= 1.08) put(x0 + k, y0 + j, FACE.ink);
      // one bright glint high up (bigger in bigger eyes) and a tiny one low on the other side
      const g = E >= 6 ? 2 : 1;
      for (let j = 0; j < g; j++) for (let k = 0; k < g; k++) put(x0 + E - 1 - g + k - (E >= 5 ? 1 : 0), y0 + 1 + j, FACE.hi);
      if (E >= 4) put(x0 + 1, y0 + Th - 2 - (E >= 6 ? 1 : 0), FACE.hi);
    }
    else if (f.mood === "happy" || f.mood === "joy") arc(x, y + Math.floor(tall / 2), true);
    else if (f.mood === "asleep") arc(x, y + Math.floor(tall / 2) - 1, false);
    else if (f.blink) for (let k = 0; k <= e; k++) put(x + k - (e > 1 ? 0 : 0), y + Math.floor(tall / 2), FACE.ink);
    else if (f.kind === "sleepy") { for (let k = 0; k < e + 1; k++) put(x + k, y + Math.floor(tall / 2) - 1, FACE.ink); for (let k = 0; k < e; k++) for (let j = 0; j < Math.ceil(tall / 2); j++) put(x + k, y + Math.floor(tall / 2) + j, FACE.ink); }
    else if (e >= 4) {
      // big sprites: a round eye, filled pixel by pixel, with a round glint
      const cx = x + e / 2, cy = y + tall / 2;
      for (let j = 0; j < tall; j++) for (let k = 0; k < e; k++) if (((k + 0.5 - e / 2) / (e / 2)) ** 2 + ((j + 0.5 - tall / 2) / (tall / 2)) ** 2 <= 1) put(x + k, y + j, FACE.ink);
      const gr = Math.max(1, e * 0.18);
      for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) if (Math.hypot(k, j) <= gr) put(cx + e * 0.18 + k, cy - tall * 0.2 + j, FACE.hi);
    }
    else {
      for (let k = 0; k < e; k++) for (let j = 0; j < tall; j++) put(x + k, y + j, FACE.ink);
      // the glint, top right; sparkly eyes get a second one low left
      if (e > 1) { put(x + e - 1, y, FACE.hi); if (f.kind === "sparkle" && e > 2) put(x, y + tall - 1, FACE.hi); }
    }
  }
  if (f.mood === "sad" || f.mood === "hungry") eyes.forEach(([x, y], i) => { const dir = i ? 1 : -1; put(x + (dir < 0 ? e : -1), y - 2, FACE.ink); put(x + (dir < 0 ? e + 1 : -2), y - 3, FACE.ink); });
  // blush: a short pink dash under each eye, a little outside
  if (R >= 8) for (const [x, y] of f.blush) { const bw = Math.max(1, Math.round(R * 0.07)), bh = R >= 26 ? 2 : 1; for (let k = -bw; k < bw; k++) for (let j = 0; j < bh; j++) put(x - ox + k, y - oy + j, FACE.blush); }
  // the mouth
  const mx = Math.round(f.mouth[0] - ox), my = Math.round(f.mouth[1] - oy);
  if (f.eating) { const open = Math.sin(f.t * 0.03) > 0; put(mx, my, FACE.ink); put(mx + 1, my, FACE.ink); if (open) { put(mx, my + 1, FACE.mouthIn); put(mx + 1, my + 1, FACE.ink); } }
  else if (R < 8) put(mx, my, FACE.ink);
  else if (f.mood === "sad" || f.mood === "hungry") { put(mx - 1, my + 1, FACE.ink); put(mx, my, FACE.ink); put(mx + 1, my + 1, FACE.ink); }
  else if (f.mood === "asleep") put(mx, my, FACE.ink);
  else if (R >= 26) { const mw = Math.round(R * 0.11); for (let k = -mw; k <= mw; k++) put(mx + k, my + Math.round((1 - (k / mw) ** 2) * mw * 0.55), FACE.ink); }
  else { put(mx - 1, my, FACE.ink); put(mx, my + 1, FACE.ink); put(mx + 1, my, FACE.ink); }
}

function cutSprite(target, x, y, size, draw, { lut = SPRITE_LUT, up = 1.75, down = 1, side = 1.25, soft = false } = {}) {
  const M = target.getTransform(), k = Math.hypot(M.a, M.b);
  const cx = M.a * x + M.c * y + M.e, cy = M.b * x + M.d * y + M.f, r = size * k;
  const ox = Math.floor(cx - r * side) - 1, oy = Math.floor(cy - r * up) - 1;
  const w = Math.ceil(r * side * 2) + 3, h = Math.ceil(r * (up + down)) + 3;
  const { c, g, o: oc, og } = spriteBuf, W2 = w * 2, H2 = h * 2;
  if (c.width < W2 || c.height < H2) { c.width = Math.max(c.width, W2); c.height = Math.max(c.height, H2); }
  if (oc.width < w || oc.height < h) { oc.width = Math.max(oc.width, w); oc.height = Math.max(oc.height, h); }
  // drawn at twice the size, then shrunk by hand so that eyes and mouths survive as solid dark pixels
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
  g.setTransform(M.a * 2, M.b * 2, M.c * 2, M.d * 2, (M.e - ox) * 2, (M.f - oy) * 2);
  faceStamp = [];
  try { draw(g); } finally { var faces = faceStamp; faceStamp = null; }
  const src = g.getImageData(0, 0, W2, H2).data, im = og.createImageData(w, h), d = im.data;
  const solid = new Uint8Array(w * h), idx = new Int16Array(w * h).fill(-1);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    let n = 0, r = 0, gg = 0, b = 0, dark = null, dl = 75;
    for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const i = ((yy * 2 + sy) * W2 + xx * 2 + sx) * 4, a = src[i + 3];
      if (a < 120) continue;
      const k = 255 / a, pr = Math.min(255, src[i] * k), pg = Math.min(255, src[i + 1] * k), pb = Math.min(255, src[i + 2] * k);
      const l = pr * 0.3 + pg * 0.59 + pb * 0.11;
      if (l < dl) { dl = l; dark = [pr, pg, pb]; }
      n++; r += pr; gg += pg; b += pb;
    }
    if (n < 2) {
      // soft light (glows, halos) is kept as it is, under the sprite's hard pixels
      if (soft) {
        let sa = 0, sr = 0, sg = 0, sb = 0;
        for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const i = ((yy * 2 + sy) * W2 + xx * 2 + sx) * 4; sa += src[i + 3]; sr += src[i]; sg += src[i + 1]; sb += src[i + 2]; }
        if (sa > 24) { const i = (yy * w + xx) * 4, q = 255 / sa; d[i] = sr * q; d[i + 1] = sg * q; d[i + 2] = sb * q; d[i + 3] = sa / 4; }
      }
      continue;
    }
    const p = yy * w + xx, [cr, cg, cb] = dark || [r / n, gg / n, b / n];
    idx[p] = lut[(cr >> 3 << 10) | (cg >> 3 << 5) | (cb >> 3)];
    solid[p] = 1;
  }
  // lone pixels join their neighbors: clean clusters instead of speckle (eyes and other dark marks stay)
  const clean = idx.slice();
  for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) {
    const p = yy * w + xx, me = idx[p];
    if (me < 0 || me === 1 || me === 0) continue;
    const n = [idx[p - 1], idx[p + 1], idx[p - w], idx[p + w]];
    if (n.includes(me) || n.includes(-1)) continue;
    const best = n.find(v => n.filter(q => q === v).length >= 3);
    if (best !== undefined) clean[p] = best;
  }
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    if (clean[p] < 0) continue;
    const col = PIXEL_PALETTE[clean[p]];
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  // faces go on last, pixel by pixel (their positions were recorded in the 2× buffer's coordinates, already halved)
  for (const f of faces) stampFace(d, w, h, solid, f, 0, 0);
  // one-pixel outline in the darkest ink, on every side the sprite touches empty space
  const ink = PIXEL_PALETTE[1];
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const p = yy * w + xx;
    if (solid[p]) continue;
    if ((xx > 0 && solid[p - 1]) || (xx < w - 1 && solid[p + 1]) || (yy > 0 && solid[p - w]) || (yy < h - 1 && solid[p + w])) {
      const i = p * 4; d[i] = ink[0]; d[i + 1] = ink[1]; d[i + 2] = ink[2]; d[i + 3] = 255;
    }
  }
  og.clearRect(0, 0, oc.width, oc.height);
  og.putImageData(im, 0, 0);
  target.save(); target.setTransform(1, 0, 0, 1, 0, 0);
  target.drawImage(oc, 0, 0, w, h, ox, oy, w, h);
  target.restore();
}

const thumbCache = new Map();
/** A glowling as a small picture: for the nest switcher, the glowpedia and the found card. */
function creatureImage(sp, { size = 120, sil = false, level = 1, shiny = false, mood = "ok", art = 0, acc = null } = {}) {
  const key = `${sp.id}|${size}|${sil}|${level}|${shiny}|${mood}|${art}|${acc || ""}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  // a real pixel sprite (about one art pixel per three of yours), scaled up with hard edges.
  // With `art`, it stays at exactly that many pixels, for the page to blow up by a whole number (2× or 3×) so every pixel is the same size
  if (art) size = art * 3;
  const n = art || Math.max(16, Math.round(size / 3)), small = document.createElement("canvas");
  small.width = small.height = n;
  const o = small.getContext("2d");
  o.setTransform(n / size, 0, 0, n / size, 0, 0);
  const grow = [0.82, 1, 1.12, 1.22][stageOf(level)];
  const paint = () => cutSprite(o, size / 2, size * 0.56, size * 0.5, g => drawCreature(g, size / 2, size * 0.56, size * 0.5 / grow, sp, { t: 1000, sil, level, shiny, mood, glow: false, acc }));
  paint();
  if (art) {
    // a small picture should be all glowling: find its edges, then draw it again filling the frame (more pixels for the eyes and ears)
    const d = o.getImageData(0, 0, n, n).data;
    let x0 = n, y0 = n, x1 = -1, y1 = -1;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (d[(y * n + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 >= x0) {
      const f = Math.min(2, (n - 1) / Math.max(x1 - x0 + 1, y1 - y0 + 1));
      if (f > 1.05) {
        o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, n, n);
        const k = n / size * f;
        o.setTransform(k, 0, 0, k, Math.round(n / 2 - (x0 + x1 + 1) / 2 * f), Math.round(n - 0.5 - (y1 + 1) * f));
        paint();
      }
    }
  }
  if (sil) {
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = "source-atop";
    o.fillStyle = "#523a85";
    o.fillRect(0, 0, n, n);
  }
  if (art) { const url = small.toDataURL("image/png"); thumbCache.set(key, url); return url; }
  const c = document.createElement("canvas");
  c.width = c.height = n * Math.max(1, Math.round(size * 2 / n));
  const big = c.getContext("2d");
  big.imageSmoothingEnabled = false;
  big.drawImage(small, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/png");
  thumbCache.set(key, url);
  return url;
}
