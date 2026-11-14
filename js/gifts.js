"use strict";
// Hatchstone · gifts via a link: wrap a snack, seeds or one of Ember's charms with a note, and a friend opens it in their own game.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- the gift link: everything travels inside it, after the #, so it never reaches a server ----------
// No server means no real proof: the checksum only catches a link that was edited or cut short, and the limits are per device.

const GiftLink = (() => {
  const VERSION = 1, NOTE_MAX = 140, NAME_MAX = 24, DAY_CAP = 3, MAX_AGE = 60, KEEP = 200, CODE_MAX = 1500;
  const CAPS = { snack: 5, seed: 3, charm: 1 };
  const KEYS = ["d", "f", "i", "id", "k", "m", "n", "v"];
  // control characters, bidi overrides, zero-width marks (but not the joiner emoji need) and anything that looks like markup
  const STRIP = /[\u0000-\u001f\u007f-\u009f​‎‏‪-‮⁠-⁩﻿<>]/g;
  const fail = why => { throw new Error(why); };
  const chars = s => [...s].length;
  /** A note or a name as plain words: no control or markup characters, one line, at most `max` letters. */
  const clean = (s, max) => [...String(s ?? "").replace(/[\r\n\t]+/g, " ").replace(STRIP, "").replace(/ {2,}/g, " ").trim()].slice(0, max).join("");
  const b64 = bytes => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const unb64 = str => Uint8Array.from(atob(str.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  // FNV-1a over the words: not a lock (anyone can redo it), just a seal that tells a tampered or broken link from a whole one
  const seal = text => { let h = 0x811c9dc5; for (const b of new TextEncoder().encode("hatchstone-gift|" + text)) h = Math.imul(h ^ b, 0x01000193) >>> 0; return h.toString(36); };
  const newId = () => { const a = new Uint8Array(8); crypto.getRandomValues(a); return [...a].map(x => (x % 36).toString(36)).join(""); };

  /** A fresh parcel: what's in it, how many, a few words and who it's from. */
  function make({ kind, item, n, note, from, day }) {
    return { v: VERSION, id: newId(), k: kind, i: item, n, m: clean(note, NOTE_MAX), f: clean(from, NAME_MAX), d: day };
  }
  function encode(g) {
    const json = JSON.stringify({ v: g.v, id: g.id, k: g.k, i: g.i, n: g.n, m: g.m, f: g.f, d: g.d });
    return b64(new TextEncoder().encode(json)) + "." + seal(json);
  }
  /** Read a parcel back and check every bit of it; `known` lists the item ids of each kind, `today` is a day number. */
  function decode(code, known, today) {
    if (typeof code !== "string" || code.length > CODE_MAX) fail("shape");
    const m = /^([A-Za-z0-9_-]+)\.([0-9a-z]{1,8})$/.exec(code);
    if (!m) fail("shape");
    let json, g;
    try { json = new TextDecoder("utf-8", { fatal: true }).decode(unb64(m[1])); g = JSON.parse(json); } catch { fail("shape"); }
    if (seal(json) !== m[2]) fail("seal");
    if (!g || typeof g !== "object" || Array.isArray(g) || Object.keys(g).sort().join() !== KEYS.join()) fail("shape");
    if (g.v !== VERSION) fail("version");
    if (typeof g.id !== "string" || !/^[0-9a-z]{8,16}$/.test(g.id)) fail("shape");
    if (!Object.hasOwn(CAPS, g.k) || typeof g.i !== "string" || !(known[g.k] || []).includes(g.i)) fail("item");
    if (!Number.isInteger(g.n) || g.n < 1 || g.n > CAPS[g.k]) fail("count");
    if (typeof g.m !== "string" || typeof g.f !== "string" || chars(g.m) > NOTE_MAX || chars(g.f) > NAME_MAX) fail("note");
    if (!Number.isInteger(g.d) || g.d > today + 1) fail("shape");
    if (g.d < today - MAX_AGE) fail("old");
    return { ...g, m: clean(g.m, NOTE_MAX), f: clean(g.f, NAME_MAX) };
  }
  const ledger = l => Object.assign(l, { got: l.got || [], sent: l.sent || [], day: l.day || 0, n: l.n || 0 });
  /** Your own parcel, one already opened here, or one too many today; otherwise it's yours, and counted. */
  function receive(l, g, today) {
    ledger(l);
    if (l.sent.includes(g.id)) return "mine";
    if (l.got.includes(g.id)) return "again";
    if (l.day !== today) { l.day = today; l.n = 0; }
    if (l.n >= DAY_CAP) return "full";
    l.n++; l.got = [...l.got, g.id].slice(-KEEP);
    return "ok";
  }
  function sent(l, g) { ledger(l); l.sent = [...l.sent, g.id].slice(-KEEP); }
  return { VERSION, NOTE_MAX, NAME_MAX, DAY_CAP, MAX_AGE, CAPS, clean, make, encode, decode, receive, sent };
})();
if (typeof module === "object" && module.exports) module.exports = GiftLink;

// ---------- in the game: wrapping a parcel, and Pip bringing one to your nest ----------

/** Ember forges these fresh for a friend: a keepsake for their chest, nothing more. */
const CHARMS = { heart: { name: "Heart charm", icon: "heart" }, star: { name: "Star charm", icon: "sparkle" }, moon: { name: "Moon charm", icon: "moon" } };
const CHARM_COST = 20;
const gifts = () => (save.gifts = save.gifts || { got: [], sent: [], day: 0, n: 0, wait: [], out: [] });
const giftKnown = () => ({ snack: Object.keys(SNACKS), seed: Object.keys(SEEDS), charm: Object.keys(CHARMS) });
const giftName = (k, i) => k === "snack" ? SNACKS[i].name : k === "seed" ? seedName(i) : tr(CHARMS[i].name);
const giftImg = (k, i) => k === "snack" ? `<span class="em">${SNACKS[i].emoji}</span>` : `<img class="em${k === "charm" ? " px-thumb" : ""}" src="${k === "seed" ? plantImage(i, 3) : pxIcon(CHARMS[i].icon)}" alt="">`;
/** How many of a thing you could send: what's in your basket or seed packets, or one charm while you have the shards. */
const giftHave = (k, i) => k === "snack" ? (save.pantry || {})[i] || 0 : k === "seed" ? garden().seeds[i] || 0 : save.shards >= CHARM_COST ? 1 : 0;
const giftEsc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const giftLinkOf = code => location.origin + location.pathname + "#gift=" + code;

let giftPick = null, giftN = 1;
function openGift(pick) {
  sfx.tick();
  giftPick = pick && giftHave(...pick.split(":")) > 0 ? pick : null; giftN = 1;
  $("giftNote").value = "";
  $("giftDone").hidden = true; $("giftForm").hidden = false;
  renderGift();
  show("gift", true);
}
function renderGift() {
  const pantry = Object.entries(save.pantry || {}).filter(([id, n]) => n > 0 && SNACKS[id]);
  const seeds = Object.entries(garden().seeds).filter(([id, n]) => n > 0 && SEEDS[id]);
  const tile = (k, i, small) => `<button class="tile${giftPick === k + ":" + i ? " on" : ""}${giftHave(k, i) ? "" : " dim"}" data-gpick="${k}:${i}" ${giftHave(k, i) ? "" : "disabled"}>${giftImg(k, i)}<b>${giftName(k, i)}</b><small>${small}</small></button>`;
  const empty = t => `<p class="me-hint">${t}</p>`;
  $("giftItems").innerHTML = `<h3 class="forge-h">${tr("Food")}</h3>` + (pantry.length ? `<div class="tiles">${pantry.map(([id, n]) => tile("snack", id, "×" + n)).join("")}</div>` : empty(tr("The basket is empty. Buy food at the shop, or grow it in the garden.")))
    + `<h3 class="forge-h">${tr("Seeds")}</h3>` + (seeds.length ? `<div class="tiles">${seeds.map(([id, n]) => tile("seed", id, "×" + n)).join("")}</div>` : empty(tr("No seeds. The shop has them, and expeditions bring some back.")))
    + `<h3 class="forge-h">${tr("Ember's charms")}</h3>${empty(tr("Ember forges one fresh for your friend: a keepsake for their chest."))}<div class="tiles">${Object.keys(CHARMS).map(id => tile("charm", id, `${ic("shard")}${CHARM_COST}`)).join("")}</div>`;
  $$("#giftItems [data-gpick]").forEach(b => b.addEventListener("click", () => { sfx.tick(); giftPick = b.dataset.gpick; giftN = 1; renderGift(); }));
  const [k, i] = giftPick ? giftPick.split(":") : [], max = giftPick ? Math.min(giftHave(k, i), GiftLink.CAPS[k]) : 0;
  giftN = clamp(giftN, 1, Math.max(1, max));
  $("giftPicked").innerHTML = giftPick ? `${giftImg(k, i)}<span><b>${giftName(k, i)}</b><small>${k === "charm" ? tr("Ember forges it for ✦ {0}", CHARM_COST) : tr("leaves your chest when you wrap it")}</small></span>` : `<span><small>${tr("Pick one thing to wrap")}</small></span>`;
  $("giftCount").hidden = !giftPick || max < 2;
  $("giftN").textContent = "×" + giftN;
  $("giftLess").disabled = giftN <= 1; $("giftMore").disabled = giftN >= max;
  $("giftFrom").textContent = me().name ? tr("From: {0}", me().name) : tr("From: a friend (set your name in Keeper)");
  $("giftLeft").textContent = `${[...$("giftNote").value].length}/${GiftLink.NOTE_MAX}`;
  $("giftWrap").disabled = !giftPick;
  $("giftOut").innerHTML = (gifts().out || []).length ? `<h3 class="forge-h">${tr("Parcels you've wrapped")}</h3>` + gifts().out.slice().reverse().map((o, j) => `<div class="gift-out"><span>${giftImg(o.k, o.i)}<b>${giftName(o.k, o.i)} ×${o.n}</b></span><button class="act" data-gcopy="${gifts().out.length - 1 - j}">${tr("Copy link")}</button></div>`).join("") : "";
  $$("#giftOut [data-gcopy]").forEach(b => b.addEventListener("click", () => giftCopy(gifts().out[b.dataset.gcopy].link)));
}
/** Take it out of your chest (or pay Ember), and wrap it into a link. */
function giftWrapUp() {
  if (!giftPick) return;
  const [k, i] = giftPick.split(":"), n = Math.min(giftN, giftHave(k, i), GiftLink.CAPS[k]);
  if (n < 1) return;
  if (k === "snack") save.pantry = { ...save.pantry, [i]: save.pantry[i] - n };
  else if (k === "seed") garden().seeds[i] -= n;
  else save.shards -= CHARM_COST;
  const g = GiftLink.make({ kind: k, item: i, n, note: $("giftNote").value, from: me().name, day: dayNo() }), link = giftLinkOf(GiftLink.encode(g));
  const l = gifts();
  GiftLink.sent(l, g);
  l.out = [...(l.out || []), { k, i, n, link, at: Date.now() }].slice(-5);
  persist(); updateTopbar(); sfx.chirp(1.1); buzz([8, 40, 8]);
  $("giftLink").value = link; $("giftBig").src = pxIcon("gift");
  $("giftDoneText").textContent = tr("{0} ×{1} is wrapped and waiting in this link. Send it to a friend: it opens in their own game.", giftName(k, i), n);
  $("giftShare").hidden = !navigator.share;
  $("giftForm").hidden = true; $("giftDone").hidden = false;
  if (game.shop && !$("shop").classList.contains("hidden")) openShop();
}
function giftCopy(link) {
  const done = () => toast(tr("Gift link copied ✓"));
  const select = () => { $("giftLink").value = link; $("giftLink").focus(); $("giftLink").select(); toast(tr("Link selected — copy it using your browser.")); };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(done).catch(select); else select();
}
async function giftShare() {
  const link = $("giftLink").value;
  if (!link) return;
  if (navigator.share) {
    try { await navigator.share({ title: "Hatchstone", text: tr("A little parcel for you from my nest 🎁 Tap to open it in Hatchstone:"), url: link }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  giftCopy(link);
}

/** A #gift= link: read it, tidy the address, and if it's good, Pip takes it to your nest. */
function giftOpenLink() {
  const m = /^#gift=(.*)$/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  let g;
  try { g = GiftLink.decode(decodeURIComponent(m[1]), giftKnown(), dayNo()); }
  catch (e) { toast(e.message === "old" ? tr("This parcel waited too long and got lost in the tunnels. Ask your friend for a fresh one.") : tr("This gift link is torn. Ask your friend to send it again.")); return; }
  const l = gifts(), got = GiftLink.receive(l, g, dayNo());
  if (got === "mine") { toast(tr("That's your own parcel 🎁 Send the link to a friend: it opens in their game.")); return; }
  if (got === "again") { toast(tr("This gift is already in your chest ✓")); return; }
  if (got === "full") { toast(tr("Pip can carry {0} parcels a day. Open this link again tomorrow ✦", GiftLink.DAY_CAP)); return; }
  l.wait = [...(l.wait || []), g];
  persist();
  if (!save.creatures.length) toast(tr("A parcel from {0} is waiting 🎁 Pip will bring it once your first glowling hatches.", g.f || tr("a friend")));
  else if (game.scene !== "nest") toast(tr("Pip is on the way with a parcel from {0} 🎁", g.f || tr("a friend")));
  giftArrive();
}
/** Pip comes up through the tunnels with a parcel, when the nest is calm: no dialog, no window open, no shared egg. */
let giftNow = null;
function giftArrive() {
  const l = save.gifts;
  if (giftNow || !l || !(l.wait || []).length || game.scene !== "nest" || !save.creatures.length || document.hidden) return;
  if (talkNow || talkQueue.length || coopSession || arrange.on || gloomNow.on || $$(".overlay").some(o => !o.classList.contains("hidden"))) return;
  giftNow = l.wait[0];
  const from = giftNow.f || tr("a friend");
  talkQueue.push([[PIP, tr("Knock knock! I came up through the tunnels with a parcel for you, {0}.", myName())],
    [PIP, giftNow.m ? tr("It's from {0}. There's a note tucked under the ribbon!", from) : tr("It's from {0}. Shall we open it?", from)]]);
  const before = afterTalk;
  afterTalk = () => { if (before) before(); giftParcel(); };
  if (!talkNow) nextTalk();
}
function giftParcel() {
  const g = giftNow;
  if (!g) return;
  $("parcelImg").src = pxIcon("gift"); $("parcelImg").classList.add("wobble");
  $("parcelTitle").textContent = tr("A parcel from {0}", g.f || tr("a friend"));
  $("parcelNote").textContent = g.m ? `“${g.m}”` : ""; $("parcelNote").hidden = !g.m;
  $("parcelSub").textContent = tr("Pip carried it all the way from their nest to yours.");
  $("parcelGo").textContent = tr("Open it");
  $("parcelGo").dataset.step = "open";
  show("giftParcel", true);
  sfx.chirp(1.2);
}
/** Into your chest it goes: food to the basket, seeds to their packets, a charm to your treasures. */
function giftOpen() {
  const g = giftNow, l = gifts();
  if (!g) return;
  // (another tab may have opened it already: the parcel only counts while it's still waiting)
  if (!(l.wait || []).some(x => x.id === g.id)) { giftNow = null; show("giftParcel", false); return; }
  if (g.k === "snack") save.pantry = { ...save.pantry, [g.i]: ((save.pantry || {})[g.i] || 0) + g.n };
  else if (g.k === "seed") garden().seeds[g.i] = (garden().seeds[g.i] || 0) + g.n;
  else save.charms = [...(save.charms || []), { c: g.i, from: g.f, at: Date.now() }].slice(-30);
  l.wait = (l.wait || []).filter(x => x.id !== g.id);
  persist();
  const img = $("parcelImg"), what = `${giftName(g.k, g.i)} ×${g.n}`;
  img.classList.remove("wobble");
  img.src = g.k === "snack" ? "" : g.k === "seed" ? plantImage(g.i, 3) : pxIcon(CHARMS[g.i].icon);
  $("parcelEmoji").textContent = g.k === "snack" ? SNACKS[g.i].emoji : ""; $("parcelEmoji").hidden = g.k !== "snack"; img.hidden = g.k === "snack";
  $("parcelTitle").textContent = what;
  $("parcelSub").textContent = tr(g.k === "snack" ? "It's in your pantry basket now ✦" : g.k === "seed" ? "It's in your seed packets now ✦" : "It's with your treasures in the chest now ✦");
  $("parcelGo").textContent = tr("Thank you ♥");
  $("parcelGo").dataset.step = "close";
  sfx.levelUp(); buzz([10, 40, 10]);
  toast(tr("🎁 {0} from {1}", what, g.f || tr("a friend")));
}
function giftParcelGo() {
  if ($("parcelGo").dataset.step === "open") { giftOpen(); return; }
  show("giftParcel", false);
  $("parcelImg").hidden = false; $("parcelEmoji").hidden = true;
  giftNow = null;
  if (game.scene === "nest") renderNest();
}
/** The chest's shelf of charms from friends, each with who sent it. */
const giftCharmTiles = () => (save.charms || []).filter(c => CHARMS[c.c]).map(c => `<div class="tile owned">${giftImg("charm", c.c)}<b>${tr(CHARMS[c.c].name)}</b><small>${giftEsc(c.from ? tr("from {0}", c.from) : tr("from a friend"))}</small></div>`).join("");

function giftWire() {
  $("giftBtn").addEventListener("click", () => { setMenu(false); openGift(); });
  $("giftClose").addEventListener("click", () => show("gift", false));
  $("giftNote").addEventListener("input", () => { $("giftLeft").textContent = `${[...$("giftNote").value].length}/${GiftLink.NOTE_MAX}`; });
  $("giftLess").addEventListener("click", () => { giftN--; renderGift(); });
  $("giftMore").addEventListener("click", () => { giftN++; renderGift(); });
  $("giftWrap").addEventListener("click", giftWrapUp);
  $("giftShare").addEventListener("click", giftShare);
  $("giftCopy").addEventListener("click", () => giftCopy($("giftLink").value));
  $("giftAgain").addEventListener("click", () => openGift());
  $("parcelGo").addEventListener("click", giftParcelGo);
  addEventListener("hashchange", giftOpenLink);
  setTimeout(giftOpenLink);
  setInterval(giftArrive, 2500);
}
