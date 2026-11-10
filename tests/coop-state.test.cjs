"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../coop-state.js");

const round = () => ({
  id: "test-round-123456", step: 1, crystal: "amethyst", species: "wisp", shiny: false,
  stone: 0, hp: 10, spot: [0.5, 0.6], seed: "seed-abcdef123456",
});
const state = () => ({
  round: "test-round-123456", seq: 1, phase: "cracking", t: 0,
  taps: 2, crits: 1, gems: 4, damage: 4.2, hits: [[0.5, 0.6, 1], [0.4, 0.5, 1]],
  matte: null,
});
const broken = s => { s.hits.push([0.5, 0.6, 1], [0.5, 0.61, 1], [0.49, 0.6, 1]); s.taps = 5; s.damage = 10.5; };

test("maps the same normalized point into different egg layouts", () => {
  const phone = { ex0: 20, ey0: 40, ew: 200, eh: 256 };
  const tablet = { ex0: 80, ey0: 100, ew: 400, eh: 512 };
  assert.deepEqual(S.normalisePoint(120, 168, phone), [0.5, 0.5]);
  assert.deepEqual(S.projectPoint([0.5, 0.5], tablet), [280, 356]);
});
for (const [label, change] of [
  ["unsupported difficulty", r => { r.step = 24; }],
  ["invalid round id", r => { r.id = "<script>"; }],
  ["invalid species id", r => { r.species = "<img src=x>"; }],
  ["impossible toughness", r => { r.hp = 0; }],
  ["huge toughness", r => { r.hp = 1e9; }],
  ["out-of-bounds weak spot", r => { r.spot = [-5, 0]; }],
  ["non-finite weak spot", r => { r.spot = [NaN, 0.5]; }],
  ["missing crack seed", r => { delete r.seed; }],
  ["unsafe crack seed", r => { r.seed = "<b>"; }],
]) test(`rejects ${label}`, () => { const r = round(); change(r); assert.equal(S.validRound(r), false); });

for (const [label, change] of [
  ["wrong round", s => { s.round = "different-round"; }],
  ["invalid sequence", s => { s.seq = -1; }],
  ["non-finite time", s => { s.t = Infinity; }],
  ["unknown phase", s => { s.phase = "restoreSave"; }],
  ["hits that don't match the taps", s => { s.taps = 3; }],
  ["more crits than taps", s => { s.crits = 3; }],
  ["out-of-bounds hit", s => { s.hits[0] = [4, 0.5, 1]; }],
  ["malformed hit", s => { s.hits[0] = [0.5, 0.5]; }],
  ["impossible hit power", s => { s.hits[0][2] = 1e6; }],
  ["too many hits", s => { s.hits = Array(301).fill([0.5, 0.5, 1]); s.taps = 301; }],
  ["premature hatch", s => { s.phase = "open"; }],
  ["unopened broken egg", s => { broken(s); }],
  ["unexpected polish", s => { s.matte = { hits: [0], shine: 0 }; }],
]) test(`rejects ${label}`, () => { const s = state(); change(s); assert.equal(S.validState(s, round()), false); });

test("accepts a bounded shared egg and its hits so far", () => {
  assert.equal(S.validRound(round()), true);
  assert.equal(S.validState(state(), round()), true);
});
test("validates complete hatches and bounded polish data", () => {
  const r = round(), s = state();
  broken(s); s.phase = "open";
  s.matte = { hits: [3, 3, 0], shine: 2 / 3 };
  assert.equal(S.validState(s, r), true);
  s.matte.hits = Array(513).fill(3);
  assert.equal(S.validState(s, r), false);
});
test("accepts the final shine rounding only after a sufficiently polished face", () => {
  const r = round(), s = state();
  broken(s); s.phase = "gleam";
  s.matte = { hits: [...Array(9).fill(3), 0], shine: 1 };
  assert.equal(S.validState(s, r), true);
  s.matte = { hits: [0], shine: 1 };
  assert.equal(S.validState(s, r), false);
});
test("remote actions are round-scoped and cannot call arbitrary game functions", () => {
  const id = round().id;
  assert.equal(S.validInput({ round: id, seq: 1, kind: "down", point: [0.5, 0.5] }, id), true);
  assert.equal(S.validInput({ round: id, seq: 2, kind: "cancel" }, id), true);
  assert.equal(S.validInput({ round: id, seq: 3, kind: "finish" }, id), true);
  assert.equal(S.validInput({ round: "old-round-12345", seq: 4, kind: "down", point: [0.5, 0.5] }, id), false);
  assert.equal(S.validInput({ round: id, seq: 5, kind: "restoreFromCode" }, id), false);
  assert.equal(S.validInput({ round: id, seq: 6, kind: "move", point: [1e20, 0] }, id), false);
  assert.equal(S.validInput({ round: id, seq: 7, kind: "move", point: [null, 0] }, id), false);
});
