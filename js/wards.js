"use strict";
// Hatchstone · wardstones: Ember forges them at the workbench, you set them at the edge of the fog on the world map,
// and the lands past the valley come out of it, one step per stone. The rules (the lands and their spots, the order
// they open in, the save) are plain functions here, so the tests can load them in Node; the map draws them (world.js).
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- the lands and their spots ----------
// Each land past the valley has a few ward spots along its road, at the veil's edge (map art pixels, where a stone stands).
// The snowfields and the isle come first, the summit once both stand guarded, and the Gloom's land last, with the most
// spots, once the other three are warded and the fourth cave is open (late: chapter IV, see wardOpenIn).
const WARD_LANDS = [
  { id: "frost", spots: [[320, 152], [334, 149]] },
  { id: "isle", spots: [[294, 301], [305, 297]] },
  { id: "summit", spots: [[270, 54], [284, 47]], after: ["frost", "isle"] },
  { id: "gloom", spots: [[102, 144], [87, 140], [73, 136]], after: ["frost", "isle", "summit"], late: true },
];
const WARD_LAND = Object.fromEntries(WARD_LANDS.map(w => [w.id, w]));
const WARD_SPOTS = WARD_LANDS.reduce((n, w) => n + w.spots.length, 0);
/** What a wardstone costs at the workbench: two common spares and some shards, or one rare spare on its own. */
const WARD_COST = { common: 2, shards: 30, rare: 1 };

/** The save's wardstones, made whole: crystals of the stones in hand (oldest first) and what stands on which spot. */
function wardSaveOf(w) {
  w = w && typeof w === "object" && !Array.isArray(w) ? w : {};
  const cid = v => typeof v === "string" && /^[a-z]{2,24}$/.test(v);
  const set = {};
  if (w.set && typeof w.set === "object" && !Array.isArray(w.set))
    for (const [k, v] of Object.entries(w.set)) { const [id, i] = k.split("."); if (WARD_LAND[id] && /^\d$/.test(i) && +i < WARD_LAND[id].spots.length && cid(v)) set[k] = v; }
  // never more in hand than there are empty spots left to fill
  const have = (Array.isArray(w.have) ? w.have : []).filter(cid).slice(0, WARD_SPOTS - Object.keys(set).length);
  return { have, set };
}
/** How many stones stand in a land, and is every spot filled. */
const wardsUp = (ws, id) => WARD_LAND[id].spots.filter((_, i) => ws.set[id + "." + i]).length;
const wardFull = (ws, id) => wardsUp(ws, id) >= WARD_LAND[id].spots.length;
/** How much of a land's veil is left: 1 untouched, 0 lifted. */
const wardLeft = (ws, id) => 1 - wardsUp(ws, id) / WARD_LAND[id].spots.length;
/** Can stones be set in this land yet? late: the fourth cave is open. */
const wardOpenIn = (ws, id, late) => (!WARD_LAND[id].late || !!late) && (WARD_LAND[id].after || []).every(a => wardFull(ws, a));
/** How many more stones are worth forging: the empty spots, less the stones already in hand. */
const wardRoom = ws => Math.max(0, WARD_SPOTS - Object.keys(ws.set).length - ws.have.length);
/** Set the oldest stone in hand on a spot. Returns its crystal, or null if the spot is taken or shut, or the hand is empty. */
function wardPlace(ws, id, i, late) {
  const key = id + "." + i;
  if (!WARD_LAND[id] || !WARD_LAND[id].spots[i] || !wardOpenIn(ws, id, late) || ws.set[key] || !ws.have.length) return null;
  const cid = ws.have.shift();
  ws.set[key] = cid;
  return cid;
}

if (typeof module === "object" && module.exports) module.exports = { WARD_LANDS, WARD_LAND, WARD_SPOTS, WARD_COST, wardSaveOf, wardsUp, wardFull, wardLeft, wardOpenIn, wardRoom, wardPlace };
