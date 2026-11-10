/* Shared, bounded wire shapes. No DOM, storage or network side effects. */
(function (root) {
  "use strict";
  const object = x => x !== null && typeof x === "object" && !Array.isArray(x);
  const number = (x, min, max) => Number.isFinite(x) && x >= min && x <= max;
  const integer = (x, min, max) => Number.isSafeInteger(x) && x >= min && x <= max;
  const identifier = x => typeof x === "string" && /^[a-zA-Z0-9_-]{12,80}$/.test(x);
  const catalogId = x => typeof x === "string" && /^[a-z][a-z0-9_-]{0,39}$/.test(x);
  const point = (x, margin = 0) => Array.isArray(x) && x.length === 2 && x.every(n => number(n, -margin, 1 + margin));
  const phases = ["entering", "cracking", "ready", "opening", "polish", "gleam", "open"];

  // A shared egg: what's inside, how tough it is, where its weak spot is, and the seed every crack grows from.
  function validRound(r) {
    return object(r) && identifier(r.id) && [1, 4, 8].includes(r.step) &&
      catalogId(r.crystal) && catalogId(r.species) && typeof r.shiny === "boolean" &&
      integer(r.stone, 0, 63) && number(r.hp, 1, 500) && point(r.spot) && identifier(r.seed);
  }

  // Progress is the list of hits so far ([x, y, power] in egg space); replaying them rebuilds the cracks exactly.
  function validState(s, r) {
    if (!validRound(r) || !object(s) || s.round !== r.id || !integer(s.seq, 0, 1e9) ||
        !phases.includes(s.phase) || !number(s.t, 0, 86400) ||
        !integer(s.taps, 0, 300) || !integer(s.crits, 0, s.taps) || !integer(s.gems, 0, 1e5) ||
        !number(s.damage, 0, 5000) || !Array.isArray(s.hits) || s.hits.length !== s.taps ||
        !s.hits.every(h => Array.isArray(h) && h.length === 3 && point(h.slice(0, 2)) && number(h[2], 0.1, 20))) return false;
    const broken = phases.indexOf(s.phase) >= phases.indexOf("opening");
    if (broken !== (s.damage >= r.hp)) return false;
    const polished = phases.indexOf(s.phase) >= phases.indexOf("polish");
    if (!polished) return s.matte === null;
    const m = s.matte;
    if (!object(m) || !Array.isArray(m.hits) || m.hits.length < 1 || m.hits.length > 512 ||
        !m.hits.every(n => integer(n, 0, 3)) || !number(m.shine, 0, 1)) return false;
    const fraction = m.hits.filter(n => n === 3).length / m.hits.length;
    return Math.abs(m.shine - fraction) < 1e-6 ||
      (["gleam", "open"].includes(s.phase) && m.shine === 1 && fraction >= 0.9);
  }

  function validInput(p, round) {
    if (!object(p) || p.round !== round || !identifier(round) || !integer(p.seq, 0, 1e9) ||
        !["down", "move", "up", "cancel", "finish"].includes(p.kind)) return false;
    return ["cancel", "finish"].includes(p.kind) || point(p.point, 1);
  }
  const normalisePoint = (x, y, l) => [(x - l.ex0) / l.ew, (y - l.ey0) / l.eh];
  const projectPoint = (p, l) => [l.ex0 + p[0] * l.ew, l.ey0 + p[1] * l.eh];
  const api = { validRound, validState, validInput, normalisePoint, projectPoint };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HatchstoneCoopState = api;
})(typeof globalThis === "object" ? globalThis : this);
