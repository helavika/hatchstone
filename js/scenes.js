"use strict";
// Hatchstone · scenes, settings, the keeper, awards, the moon egg, events and the lantern.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- scenes ----------

const show = (id, on) => $(id).classList.toggle("hidden", !on);
// (a hint waved away, by a tap or a swipe: see ui.js, keeps quiet for a while; a different hint still shows)
const HINT_AWAY = 10 * 60e3, hintWaved = {};
function setHint(text) {
  const el = $("hint");
  if (text && hintWaved[text] > Date.now()) { el.classList.remove("on"); return; }
  if (el.textContent !== text) el.textContent = text;
  // (thrown aside last time: it comes back to its place first, unseen)
  if (text && el.style.translate) { el.style.transition = "none"; el.style.translate = ""; void el.offsetHeight; el.style.transition = ""; }
  el.classList.toggle("on", !!text);
}
function waveHint() {
  const el = $("hint");
  if (!el.classList.contains("on")) return;
  hintWaved[el.textContent] = Date.now() + HINT_AWAY;
  el.classList.remove("on");
}

// one lane for banners: toasts and awards wait in one line and show one at a time, in one slot under the top bar (the
// hint, where it lives up there too, steps aside for them: see body.banner in style.css)
let bannerQueue = [], bannerNow = null, bannerTimer = 0, awardHeld = 0, bannerHushed = false;
const AWARD_HOLD = 6000; // how long an award waits for an open sheet to close before it shows anyway
const BANNER_BREATH = 1500; // after a quiet spell, a breath between the banners it kept back, so they come gently, one by one
const AWARD_LINE = 3;    // this many trophies waiting at once arrive as one banner instead
const TOAST_LINE = 3;    // no more toasts than this wait their turn: the oldest gives up its place
const bannerEl = b => $(b.text ? "toast" : "award");
function toast(text) {
  // the same words again are said once: on screen now, they stay their full time again; already in line, that's enough
  if (bannerNow && bannerNow.text === text && $("toast").classList.contains("on")) { clearTimeout(bannerTimer); bannerTimer = setTimeout(endBanner, 2600); return; }
  if (bannerQueue.some(b => b.text === text)) return;
  bannerQueue.push({ text });
  const line = bannerQueue.filter(b => b.text);
  if (line.length > TOAST_LINE) bannerQueue.splice(bannerQueue.indexOf(line[0]), 1);
  nextBanner();
}
/** Awards join the line. Three or more trophies waiting at once (after a big level, say) become one banner, where the first of them stood. */
function queueAwards(...list) {
  bannerQueue.push(...list);
  const line = bannerQueue.filter(b => b.tier || b.many), many = line.flatMap(b => b.many || [b]);
  if (many.length >= AWARD_LINE) bannerQueue = bannerQueue.filter(b => b === line[0] || !line.includes(b)).map(b => b === line[0] ? { many } : b);
  nextBanner();
}
/**
 * An award bides its time: never in the middle of cracking (it comes with the found card), and not onto an open sheet's
 * title (it waits for the sheet to close: a few seconds at most, then it drops in just under the sheet's title instead).
 */
function awardWaits() {
  const found = !$("found").classList.contains("hidden");
  if (game.scene === "crack" && !found) return true;
  if (!found && bannerClash($("award"))) {
    if (!awardHeld) awardHeld = Date.now();
    if (Date.now() - awardHeld < AWARD_HOLD) return true;
  }
  awardHeld = 0;
  return false;
}
/** The slot is free: whoever is first in line comes on (a toast goes past an award that is still waiting). */
function nextBanner() {
  if (bannerNow || !bannerQueue.length) { if (!bannerNow) bannerHushed = false; return; }
  clearTimeout(bannerTimer);
  // the first moments with a new glowling are kept quiet (see calmNow in crack.js): everyone in line waits them out
  if (typeof calmNow === "function" && calmNow()) { bannerHushed = true; bannerTimer = setTimeout(nextBanner, 400); return; }
  const wait = bannerQueue.some(b => !b.text) && awardWaits(), i = bannerQueue.findIndex(b => b.text || !wait);
  if (i < 0) { bannerTimer = setTimeout(nextBanner, 400); return; }
  const b = bannerNow = bannerQueue.splice(i, 1)[0], el = bannerEl(b);
  // (if the last one here was waved away, the slot comes back to its place first, unseen)
  if (el.style.translate) { el.style.transition = "none"; el.style.translate = ""; void el.offsetHeight; el.style.transition = ""; }
  if (b.text) el.textContent = b.text; else paintAward(el, b);
  el.classList.add("on");
  document.body.classList.add("banner");
  placeBanner(el);
  bannerTimer = setTimeout(endBanner, b.text ? 2600 : 3400);
}
function endBanner() {
  bannerEl(bannerNow).classList.remove("on");
  // (the slot stays taken while it leaves; the hint comes back once nobody else is next)
  bannerTimer = setTimeout(() => { bannerNow = null; if (bannerHushed && bannerQueue.length) { document.body.classList.remove("banner"); bannerTimer = setTimeout(nextBanner, BANNER_BREATH); return; } nextBanner(); if (!bannerNow) document.body.classList.remove("banner"); }, 450);
}
/** Is a banner up right now (not waiting, not already leaving)? */
const bannerUp = () => !!bannerNow && bannerEl(bannerNow).classList.contains("on");
/** A finger on the banner: it stays for as long as it's held; let go of it and it has a moment more. */
function holdBanner(held) {
  if (!bannerUp()) return;
  clearTimeout(bannerTimer);
  if (!held) bannerTimer = setTimeout(endBanner, 1600);
}
/** Waved away (tapped, or swiped aside: see ui.js): it leaves at once, and whoever is next in line comes on. */
function dismissBanner() {
  if (!bannerUp()) return;
  clearTimeout(bannerTimer);
  endBanner();
}

/**
 * The open sheet's title block on screen (whatever sits above its title and the title itself, and its ×): { top, bottom,
 * sheet } (sheet: a card over the scene, not a full screen like the Book), or null with none open. The topmost one counts.
 */
function sheetTitle() {
  let best = null, bz = -Infinity;
  for (const o of document.querySelectorAll(".overlay:not(.hidden)")) {
    const card = o.querySelector(":scope > .card"), z = Number(getComputedStyle(o).zIndex) || 0;
    if (card && card.getClientRects().length && z >= bz) { best = [o, card]; bz = z; }
  }
  if (!best) return null;
  const [o, card] = best, r = card.getBoundingClientRect();
  let bottom = r.top + 12;
  for (const el of card.children) {
    if (el.matches(".x-close, [id$=Close]")) { const b = el.getBoundingClientRect(); if (b.top < r.top + 90) bottom = Math.max(bottom, b.bottom); continue; }
    const b = el.getBoundingClientRect();
    if (b.height) bottom = Math.max(bottom, b.bottom);
    if (el.tagName === "H2") break;
    if (b.top > r.top + innerHeight * 0.45) { bottom = r.top + 12; break; } // no title near the top: only the card's own top edge
  }
  return { top: r.top, bottom, sheet: o.classList.contains("modal") || !o.classList.contains("screen") };
}
/**
 * A banner at the top (a toast, an award) never covers an open sheet's title or its ×: if they'd meet, it moves down to
 * just under the title block. Kept on screen.
 */
function placeBanner(el) {
  el.style.top = "";
  const top = parseFloat(getComputedStyle(el).top) || 0, h = el.offsetHeight, s = sheetTitle();
  let y = top;
  if (s && y < s.bottom && y + h > s.top) y = s.bottom + 8;
  if (y !== top) el.style.top = Math.round(Math.min(y, innerHeight - h - 12)) + "px";
}
/** Does an open sheet's title sit where this banner would drop in? */
const bannerClash = el => { el.style.top = ""; const s = sheetTitle(), top = parseFloat(getComputedStyle(el).top) || 0; return !!s && s.sheet && top < s.bottom && top + (el.offsetHeight || 64) > s.top; };

function setScene(scene) {
  // a repeat glowling left on the found card without a choice: it visits its relative, as it always did
  if (adopt.twin) chooseTwin(false);
  if (scene !== "nest" && arrange.on) stopArrange();
  // into or out of cracking: the pixel size changes (finer everywhere else), so everything is laid out again
  const wasCrack = game.scene === "crack";
  // an egg left before it opened: no harm done, but going back to the stone after it counts (see habitTried)
  // and the stone itself waits for you, as it is (see stoneLeave)
  if (wasCrack && scene !== "crack" && game.egg?.state === "cracking" && game.egg.taps > 0 && !game.egg.conf.coop) { habitFell(); stoneLeave(game.egg); }
  if (game.scene === "nest" && scene !== "nest") { sfx.purrOff(); stopSeek(); }
  game.scene = scene;
  if (wasCrack !== (scene === "crack") && W) refit();
  else quality.settle(2500);
  document.body.className = document.body.className.replace(/\bscene-\S+/g, "").trim() + ` scene-${scene}`;
  for (const [id, active] of [["hud", scene === "crack"], ["topbar", ["map", "nest", "lib"].includes(scene)], ["tabs", ["map", "nest", "lib"].includes(scene)]]) {
    $(id).classList.toggle("on", active); $(id).inert = !active; $(id).setAttribute("aria-hidden", String(!active));
  }
  $("polishDone").hidden = !(scene === "crack" && game.egg && game.egg.state === "polish");

  litTabs();
  renderPlaceBar();
  show("map", scene === "map");
  show("lib", scene === "lib");
  show("found", false);
  if (scene !== "crack") setHint(scene === "nest" ? nestHint() : "");
  $("nestEmpty").hidden = !(scene === "nest" && !save.creatures.length);
  if (scene === "map") renderMap();
  if (scene === "lib") { renderLib(); taskDone("book"); }
  // (in the nest, the places you can go to are painted ahead while nothing else is going on)
  if (scene === "nest") { renderNest(true); nudgeBackup(); bakeAhead(); }
  updateTopbar();
  talkMoments(scene);
}

/**
 * Which top-bar pills have earned their place yet: before the first egg, none. Shards once a geode has given some (or
 * someone lives at home), stars after a first level, the lantern once a drop is spent or the next trip needs one, the
 * day's tasks once there's a glowling to do them with. Read from the save itself, not a flag, so an older nest already
 * past these points sees every pill, and none goes away again. oilNeeded: the next trip burns a drop (see tripCosts).
 */
const hudPills = (s, oilNeeded) => {
  const stars = Object.values(s.stars || {}), home = (s.creatures || []).length > 0;
  return { shards: stars.length > 0 || home, stars: stars.some(v => v > 0), oil: !!(s.oil && s.oil.t > 0) || !!oilNeeded, tasks: home };
};
function updateTopbar() {
  $("shardPill").innerHTML = `${ic("shard")}${save.shards}`;
  $("starPill").innerHTML = `${ic("star")}${totalStars()}`;
  const n = nextLevel(), pills = hudPills(save, tripCosts(n));
  $("shardPill").hidden = !pills.shards; $("starPill").hidden = !pills.stars; $("walletPill").hidden = !pills.shards && !pills.stars;
  $("walletPill").querySelector(".sep").hidden = !(pills.shards && pills.stars);
  $("oilPill").hidden = !pills.oil; $("taskPill").hidden = !pills.tasks;
  $("crackLvl").textContent = n ? tr("Lv {0}", n) : tr("Step {0}", wanderStep());
  renderTaskPill();
  renderOilPill();
  // who's home, out of everyone (only once somebody is out exploring)
  const away = save.creatures.filter(c => c.out).length;
  $("homePill").hidden = !away;
  if (away) $("homeCount").innerHTML = `${ic("nest")}${save.creatures.length - away}/${save.creatures.length}`;
  fitTopbar();
  updateCalls();
}
/** When the top bar's pills don't fit across the screen, ? and the language move into the ⚙ menu (as on the narrowest phones). */
function fitTopbar() {
  const body = document.body, rows = $$("#topbar .row");
  body.classList.remove("tight", "tighter");
  if (rows.length < 2) return;
  const over = () => { const [l, r] = rows.map(e => e.getBoundingClientRect()); return r.right > innerWidth + 1 || l.right > r.left - 4 || $("topbar").scrollWidth > $("topbar").clientWidth + 1; };
  if (over()) body.classList.add("tight");
  if (over()) body.classList.add("tighter");
}

// ---------- settings: music on or off, music and sound volumes, vibration, less motion, bigger text ----------

// less motion starts on if the device asks for it; the music starts on, and quiet; so does the buzz under your finger
const opts = () => ({ musicOn: true, music: 0.5, sfx: 1, buzz: true, calm: !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, big: false, look: 1, stats: true, ...(save.opts || {}) });
function applyOpts() {
  const o = opts();
  sfx.setVolumes(o.music, o.sfx, o.musicOn !== false);
  document.body.classList.toggle("calm", !!o.calm);
  document.body.classList.toggle("bigtext", !!o.big);
}
// only what you set yourself is kept: less motion goes on following the device until you choose
function setOpt(k, v) { save.opts = { ...(save.opts || {}), [k]: v }; persist(); applyOpts(); }
function openOpts() {
  sfx.tick();
  const o = opts(), pct = v => `${Math.round(v * 100)}%`;
  $("optsList").innerHTML = `
    <button class="opt-toggle${o.musicOn ? " on" : ""}" data-toggle="musicOn"><span>${tr("Music")}<small>${tr("a slow, quiet soundtrack, its own in every place")}</small></span><b>${o.musicOn ? tr("on") : tr("off")}</b></button>
    <label class="opt"><span>${ic("sound")}${tr("Music volume")}<em id="vMusic">${pct(o.music)}</em></span><input type="range" min="0" max="1" step="0.05" value="${o.music}" data-opt="music"${o.musicOn ? "" : " disabled"}></label>
    <label class="opt"><span>${ic("bell")}${tr("Sounds")}<em id="vSfx">${pct(o.sfx)}</em></span><input type="range" min="0" max="1" step="0.05" value="${o.sfx}" data-opt="sfx"></label>
    <p class="me-hint">${tr("Music is the soundtrack: each place has its own, in its backdrop's key; sounds are everything else: taps, chirps, voices.")}</p>
    <button class="opt-toggle${o.buzz ? " on" : ""}" data-toggle="buzz"><span>${tr("Vibration")}<small>${tr("a light buzz under your finger, where the phone can")}</small></span><b>${o.buzz ? tr("on") : tr("off")}</b></button>
    <button class="opt-toggle${o.calm ? " on" : ""}" data-toggle="calm"><span>${tr("Less motion")}<small>${tr("no shaking or bouncing, gentler effects")}</small></span><b>${o.calm ? tr("on") : tr("off")}</b></button>
    <button class="opt-toggle${o.big ? " on" : ""}" data-toggle="big"><span>${tr("Bigger text")}<small>${tr("for the cards, dialogs and hints")}</small></span><b>${o.big ? tr("on") : tr("off")}</b></button>
    <button class="opt-toggle${o.stats ? " on" : ""}" data-toggle="stats"><span>${tr("Anonymous play stats")}<small>${tr("how long and what is played, to make the game better; never your name or your nest")}</small></span><b>${o.stats ? tr("on") : tr("off")}</b></button>`;
  $("optsList").innerHTML += `<div class="opt"><span>${ic("sparkle")}${tr("How glowlings shine")}</span></div><div class="seg look-seg">${[["Classic", 0], ["Glow", 1], ["Spirit", 2]].map(([n, v]) => `<button data-look="${v}" class="${o.look === v ? "on" : ""}">${tr(n)}</button>`).join("")}</div>`;
  // last, apart from the rest: the nest wiped and the game begun again (startOver in ui.js asks first)
  $("optsList").innerHTML += `<h3 class="forge-h">${tr("Start over")}</h3><p class="me-hint">${tr("A new game from the very beginning: a new first stone, a new first glowling. Keep a backup code first (Menu → Back up nest) if you might want this nest back.")}</p><button class="act opt-reset" id="startOver">${ic("nest")}${tr("Reset the nest")}</button>`;
  $("startOver").addEventListener("click", () => { show("optsSheet", false); startOver(); });
  $$("#optsList [data-look]").forEach(b => b.addEventListener("click", () => { setOpt("look", Number(b.dataset.look)); sfx.chirp(1); openOpts(); }));
  $$("#optsList [data-opt]").forEach(r => r.addEventListener("input", () => {
    const v = Number(r.value); $(r.dataset.opt === "music" ? "vMusic" : "vSfx").textContent = pct(v);
    sfx.setVolumes(r.dataset.opt === "music" ? v : opts().music, r.dataset.opt === "sfx" ? v : opts().sfx, opts().musicOn);
  }));
  $$("#optsList [data-opt]").forEach(r => r.addEventListener("change", () => { setOpt(r.dataset.opt, Number(r.value)); if (r.dataset.opt === "sfx") sfx.chirp(1); }));
  $$("#optsList [data-toggle]").forEach(b => b.addEventListener("click", () => { setOpt(b.dataset.toggle, !opts()[b.dataset.toggle]); openOpts(); }));
  show("optsSheet", true);
}

// ---------- you, the keeper: your name, how Mossa speaks to you, and a keeper level with skills to grow ----------

/** How the Ukrainian lines address you: she, he, or neither (the default). */
const me = () => (save.me = save.me || meFresh());
const myName = () => me().name || tr("friend");
/** Pick the right ending for you in Ukrainian: gform("знайшла", "знайшов", "знайшли"). English has one form. */
const gform = (f, m, n) => LANG !== "uk" ? f : me().form === "f" ? f : me().form === "m" ? m : n;
const KEEPER_TITLES = [[1, "Pebble finder"], [3, "Stone tapper"], [5, "Keeper's apprentice"], [8, "Lamp carrier"], [12, "Keeper of sparks"], [16, "Heartlight keeper"], [20, "Legend of the grotto"]];
const SKILLS = [
  { id: "str", name: "Strength", icon: "hammer", what: l => tr("taps hit {0}% harder", Math.round(l * STR_STEP * 100)) },
  { id: "care", name: "Care", icon: "heart", what: l => tr("glowlings grow {0}% faster", l * 10) },
  { id: "luck", name: "Luck", icon: "sparkle", what: l => tr("+{0}% shiny chance, bars in the rubble {1}% more often", (l * 0.6).toFixed(1), l * 25) },
];
/** Your keeper level and how far into the next one you are (the rules and its gifts are in inner.js). */
const keeperLevel = () => keeperLevelOf(me().xp);
const keeperTitle = l => tr(KEEPER_TITLES.filter(([at]) => l >= at).pop()[1]);
const skill = id => (save.me && save.me.skill && save.me.skill[id]) || 0;
/** Keeper XP for the things you do; each level brings a skill point. */
/** The newest keeper gift a climb from one level to another brings (not one an older save's core already gave). */
const keeperGiftNew = (from, to) => keeperGiftsBetween(from, to).filter(g => !(me().gifts || []).includes(g.id)).pop();
/** Keeper XP for the things you do; each level brings a skill point, and a few a gift (see KEEPER_GIFTS). The habits are in inner.js (HABIT_XP). */
const KEEPER_XP = { trips: 5, cracked: 12, harvested: 6, fed: 2, petted: 1, played: 4, taskDays: 15, wickBought: 3, rescued: 40, lamplit: 10, warded: 10 };
function keeperXP(n) {
  if (!n || coopSession || game.coopTouched) return;
  const before = keeperLevel().l;
  me().xp += n;
  const after = keeperLevel().l;
  if (after > before) {
    me().pts += after - before;
    queueAwards({ keeper: true, level: after, pts: true, gift: keeperGiftNew(before, after)?.id });
  }
}
function openMe(first) {
  sfx.tick();
  const m = me(), k = keeperLevel();
  $("meName").value = m.name;
  // the first time, Mossa only asks your name (and in Ukrainian how to speak to you): a small sheet with her face, the rest comes later
  $("meSheet").classList.toggle("first", !!first);
  $("meFace").hidden = !first; if (first) $("meFace").querySelector("img").src = MOSSA.face("warm");
  $("meSave").hidden = !first; $("meSave").dataset.first = first ? "1" : ""; $("meSave").textContent = first ? tr("That's me") : tr("Save");
  $("meClose").hidden = !!first;
  $("meForm").hidden = LANG !== "uk";
  $$("#meForm [data-form]").forEach(b => b.classList.toggle("on", b.dataset.form === m.form));
  const nextTitle = KEEPER_TITLES.find(([at]) => at > k.l), gifts = KEEPER_GIFTS.filter(g => keeperGift(g.id)), nextGift = KEEPER_GIFTS.find(g => !keeperGift(g.id));
  $("meLevel").innerHTML = `<h3>${tr("Your level")}<button class="q" data-q="lvl" aria-label="?">?</button></h3>`
    + `<b>${tr("Level {0}", k.l)} · ${keeperTitle(k.l)}</b>${keeperGift("title") ? `<small class="me-title">✦ ${tr("Steady heart")}</small>` : ""}<i class="aw-bar" style="--k:${k.xp / k.need}"><u>${tr("{0} of {1} XP", k.xp, k.need)}</u></i>`
    + (gifts.length ? `<ul class="me-gifts">${gifts.map(g => `<li>${ic(g.icon)}<span>${tr(g.what)}</span></li>`).join("")}</ul>` : "")
    + `<p class="me-hint">${tr("You earn XP for everything you do in the game. Every new level gives you a skill point.")}${nextTitle ? " " + tr("Next title at level {0}: {1}.", nextTitle[0], tr(nextTitle[1])) : ""}${nextGift ? " " + tr("Next gift at level {0}: {1}.", nextGift.at, tr(nextGift.name)) : ""}</p>`
    + `<div class="me-more" data-more="lvl" hidden><p>${tr("Where XP comes from:")}</p><ul>${[
      [tr("cracking an egg"), KEEPER_XP.cracked], [tr("freeing a spark from the Gloom"), KEEPER_XP.rescued], [tr("pushing the Gloom's shadows back"), KEEPER_XP.lamplit], [tr("finishing all of a day's tasks"), KEEPER_XP.taskDays],
      [tr("coming home after a day or more"), HABIT_XP.back], [tr("going back to the stone after one that didn't open"), HABIT_XP.retry], [tr("a small ritual a day: the moon egg, the garden or a walk"), HABIT_XP.ritual], [tr("setting a wardstone"), KEEPER_XP.warded],
      [tr("picking a harvest"), KEEPER_XP.harvested], [tr("playing a mini-game"), KEEPER_XP.played], [tr("buying from Wick"), KEEPER_XP.wickBought],
      [tr("giving a snack"), KEEPER_XP.fed], [tr("petting a glowling"), KEEPER_XP.petted], [tr("an award"), "20–250"]].map(([w, n]) => `<li><span>${w}</span><b>+${n}</b></li>`).join("")}</ul></div>`;
  // (skills, once there's a first point to put into one)
  $("meSkills").hidden = !m.pts && !SKILLS.some(sk => skill(sk.id));
  $("meSkills").innerHTML = `<h3>${tr("Skills")}<button class="q" data-q="sk" aria-label="?">?</button></h3>`
    + `<p class="me-hint">${m.pts ? `<b class="me-pts">${tr("Skill points to spend: {0}", m.pts)}</b> ` : ""}${tr("Put a point into a skill with its + button. Each skill goes up to {0}, and points stay with you for good.", SKILL_MAX)}</p>`
    + `<div class="me-more" data-more="sk" hidden><p>${tr("Strength makes every tap on an egg hit harder, so eggs crack in fewer taps. Care makes your glowlings earn more XP, so they grow up sooner. Luck makes shiny glowlings and bars in the rubble a little more likely. Skills don't count in eggs you crack together with a friend.")}</p></div>`
    + SKILLS.map(sk => {
      const l = skill(sk.id);
      return `<div class="forge skill">${ic(sk.icon, "big")}<span class="txt"><b>${tr(sk.name)} <em>${l}/${SKILL_MAX}</em></b><span class="pips">${Array.from({ length: SKILL_MAX }, (_, i) => `<i class="${i < l ? "on" : ""}"></i>`).join("")}</span><small>${l ? tr("now: {0}", sk.what(l)) : tr("not yet")}${l < SKILL_MAX ? ` · ${tr("next: ")}${sk.what(l + 1)}` : ""}</small></span><button class="act" data-skill="${sk.id}" ${!m.pts || l >= SKILL_MAX ? "disabled" : ""} aria-label="+1 ${tr(sk.name)}">+1</button></div>`;
    }).join("");
  $$("#meSheet .q").forEach(b => b.addEventListener("click", () => { const m2 = document.querySelector(`#meSheet [data-more="${b.dataset.q}"]`); m2.hidden = !m2.hidden; b.classList.toggle("on", !m2.hidden); sfx.tick(); }));
  $("meFirst").hidden = !first;
  $$("#meSkills [data-skill]").forEach(b => b.addEventListener("click", () => {
    const mm = me(); if (!mm.pts || skill(b.dataset.skill) >= SKILL_MAX) return;
    mm.pts--; mm.skill[b.dataset.skill] = skill(b.dataset.skill) + 1; sfx.levelUp(); persist(); openMe();
  }));
  show("meSheet", true);
}
function saveMe() {
  const m = me(), name = $("meName").value.trim().slice(0, 18);
  if (name !== m.name) { m.name = name; persist(); }
}

// ---------- awards: achievements in four rarities, each with a few shards and a trophy in the book ----------

const AWARD_TIERS = [
  { id: "common", name: "Common", one: "Common award", shards: 10 },
  { id: "rare", name: "Rare", one: "Rare award", shards: 25 },
  { id: "epic", name: "Epic", one: "Epic award", shards: 60 },
  { id: "legendary", name: "Legendary", one: "Legendary award", shards: 150 },
];
const AWARD_TIER = Object.fromEntries(AWARD_TIERS.map(t => [t.id, t]));
/** Counters for the things the save didn't count before: eggs cracked, snacks, pets, games, finished days. */
const cnt = k => (save.counts && save.counts[k]) || 0;
function bump(k, n = 1) { save.counts = { ...save.counts, [k]: cnt(k) + n }; keeperXP((KEEPER_XP[k] || 0) * n); }
const stat = {
  // older nests counted every hatch in the glowpedia, so cracking starts from there
  cracked: () => Math.max(cnt("cracked"), Object.values(save.seen).reduce((a, v) => a + (v.count || 0), 0)),
  species: () => SPECIES.filter(sp => save.seen[sp.id]).length,
  level: () => Math.max(0, ...save.creatures.map(c => c.level)),
  nights: () => moonNights(),
};
/** Each award: its rarity, and a test that says how far along you are [now, goal]. */
const AWARDS = [
  { id: "firstCrack", tier: "common", name: "First crack", how: "Crack your first egg", test: () => [stat.cracked(), 1] },
  { id: "firstFriend", tier: "common", name: "Hello, little one", how: "Meet your first glowling", test: () => [Object.keys(save.seen).length, 1] },
  { id: "fed10", tier: "common", name: "Snack time", how: "Give 10 snacks", test: () => [cnt("fed"), 10] },
  { id: "pet25", tier: "common", name: "Gentle hands", how: "Pet your glowlings 25 times", test: () => [cnt("petted"), 25] },
  { id: "decor", tier: "common", name: "Home sweet home", how: "Buy a decoration for the nest", test: () => [Object.keys(save.decor).filter(id => id !== "rug" && !DECO[id]?.found).length, 1] },
  { id: "moon1", tier: "common", name: "Moonstruck", how: "Open a moon egg", test: () => [save.moon ? 1 : 0, 1] },
  { id: "play5", tier: "common", name: "Playmate", how: "Play 5 mini-games", test: () => [cnt("played"), 5] },
  { id: "greenThumb", tier: "common", name: "Green thumb", how: "Pick your first harvest", test: () => [cnt("harvested"), 1] },
  { id: "tasksAll", tier: "common", name: "Busy day", how: "Finish all of a day's tasks", test: () => [cnt("taskDays"), 1] },
  { id: "cracked50", tier: "rare", name: "Stonebreaker", how: "Crack 50 eggs", test: () => [stat.cracked(), 50] },
  { id: "species10", tier: "rare", name: "Collector", how: "Meet 10 kinds of glowlings", test: () => [stat.species(), 10] },
  { id: "geodes10", tier: "rare", name: "Rockhound", how: "Find 10 kinds of geodes", test: () => [Object.keys(save.geodes).length, 10] },
  { id: "stars30", tier: "rare", name: "Starry-eyed", how: "Earn 30 stars", test: () => [totalStars(), 30] },
  { id: "grown", tier: "rare", name: "All grown up", how: "Raise a glowling to level 10", test: () => [stat.level(), 10] },
  { id: "hybrid", tier: "rare", name: "Matchmaker", how: "Hatch a hybrid", test: () => [save.creatures.some(c => c.mix) ? 1 : 0, 1] },
  { id: "forge5", tier: "rare", name: "Blacksmith", how: "Buy 5 upgrades at the Forge", test: () => [Object.values(save.forge || {}).reduce((a, b) => a + b, 0), 5] },
  { id: "streak3", tier: "rare", name: "Night owl", how: "Open the moon egg on any 3 nights", test: () => [stat.nights(), 3] },
  // (a room carved at the shop: the garden outside comes with every nest, and the map's places are not rooms of your home)
  { id: "room2", tier: "rare", name: "More room", how: "Add a room to your home", test: () => [(save.rooms || []).filter(r => ROOM_KINDS.find(k => k.id === r.kind)?.cost).length, 1] },
  { id: "echo5", tier: "rare", name: "Good ear", how: "Sing back 5 tunes in Echo song", test: () => [save.echoBest || 0, 5] },
  { id: "wick3", tier: "rare", name: "A good customer", how: "Buy 3 things from Wick", test: () => [cnt("wickBought"), 3] },
  { id: "trips5", tier: "rare", name: "Explorer's map", how: "Send glowlings on 5 expeditions", test: () => [cnt("trips"), 5] },
  { id: "craft3", tier: "rare", name: "Handy", how: "Make 3 things at the workbench", test: () => [cnt("crafted"), 3] },
  { id: "harvest25", tier: "rare", name: "Harvest festival", how: "Pick 25 harvests", test: () => [cnt("harvested"), 25] },
  { id: "biteleaf", tier: "epic", name: "It bites", how: "Grow and pick a biteleaf", test: () => [cnt("biteleaf"), 1] },
  { id: "rescue1", tier: "rare", name: "First light", how: "Free a spark from the Gloom", test: () => [cnt("rescued"), 1] },
  { id: "lamp5", tier: "rare", name: "Lamplighter", how: "Push the Gloom's shadows back with your light 5 times", test: () => [cnt("lamplit"), 5] },
  { id: "cracked250", tier: "epic", name: "Quarry lord", how: "Crack 250 eggs", test: () => [stat.cracked(), 250] },
  { id: "species20", tier: "epic", name: "Glowpedia scholar", how: "Meet 20 kinds of glowlings", test: () => [stat.species(), 20] },
  { id: "stars60", tier: "epic", name: "Constellation", how: "Earn 60 stars", test: () => [totalStars(), 60] },
  { id: "radiant", tier: "epic", name: "Radiant", how: "Raise a glowling to level 15", test: () => [stat.level(), 15] },
  { id: "shiny", tier: "epic", name: "Something shiny", how: "Hatch a shiny glowling", test: () => [save.creatures.some(c => c.shiny) || cnt("shiny") ? 1 : 0, 1] },
  { id: "vault", tier: "epic", name: "Into the Vault", how: "Reach the fourth cave", test: () => [unlocked(19) ? 1 : 0, 1] },
  { id: "streak7", tier: "epic", name: "Moon keeper", how: "Open the moon egg on any 7 nights", test: () => [stat.nights(), 7] },
  { id: "event", tier: "epic", name: "In season", how: "Meet a limited event glowling", test: () => [SPECIES.some(sp => sp.event && save.seen[sp.id]) ? 1 : 0, 1] },
  { id: "arsenal", tier: "epic", name: "Arsenal", how: "Own every tool at the Forge", test: () => [TOOL_SKINS.filter(k => !k.cost || (save.toolSkins || {})[k.id]).length, TOOL_SKINS.length] },
  { id: "legend", tier: "legendary", name: "Legend", how: "Meet a legendary glowling", test: () => [legendOk() ? 1 : 0, 1] },
  { id: "allClear", tier: "legendary", name: "Heart of the grotto", how: "Clear all 24 levels", test: () => [unlocked(LEVELS + 1) ? 1 : 0, 1] },
  { id: "stars72", tier: "legendary", name: "Flawless", how: "Earn all 72 stars", test: () => [totalStars(), LEVELS * 3] },
  { id: "level20", tier: "legendary", name: "Brightest of all", how: "Raise a glowling to level 20", test: () => [stat.level(), MAX_LEVEL] },
  { id: "story", tier: "legendary", name: "The whole story", how: "Hear every part of Mossa's story", test: () => [STORY.filter(p => talkSeen(p.id)).length, STORY.length] },
  { id: "rescueAll", tier: "legendary", name: "Seal breaker", how: "Free all four sparks from the Gloom", test: () => [cnt("rescued"), 4] },
  { id: "nights30", tier: "legendary", name: "Friend of the moon", how: "Open the moon egg on any 30 nights", test: () => [stat.nights(), 30] },
  { id: "everyone", tier: "legendary", name: "Every last one", how: "Meet every kind of glowling", test: () => [stat.species(), SPECIES.length] }
];
/** Hand out what you've earned. The first time (or with quiet) they arrive together, with one word in the corner. */
function checkAwards(quiet) {
  // like the dialogs, awards wait while (and after) you play together, so a shared egg never changes your own save behind its back
  if (coopSession || game.coopTouched) return;
  // (a brand-new nest has nothing to catch up on: its very first awards come one by one, like everyone's after)
  const first = !save.awards && stat.cracked() > 1, earned = save.awards || {}, level = keeperLevel().l;
  const got = [];
  for (const a of AWARDS) {
    if (earned[a.id]) continue;
    const [now, goal] = a.test();
    if (now < goal) continue;
    earned[a.id] = Date.now();
    save.shards += AWARD_TIER[a.tier].shards;
    me().xp += { common: 20, rare: 50, epic: 100, legendary: 250 }[a.tier];
    got.push(a);
  }
  // nothing new: the save stays exactly as it was
  if (!got.length) return;
  save.awards = earned;
  persist(); updateTopbar();
  // an award's XP brings no skill point, but a keeper gift it reaches is still announced
  const gift = keeperGiftNew(level, keeperLevel().l);
  if (gift) queueAwards({ keeper: true, level: keeperLevel().l, gift: gift.id });
  if (first || quiet) { toast(`${got.length} ${pl(got.length, "award earned", "awards earned")} ✦ ${tr("see them in the Book")}`); return; }
  queueAwards(...got);
}
/** A trophy slides down from the top, like a console achievement (in its turn: see nextBanner). */
function paintAward(el, a) {
  if (a.keeper) {
    // a new keeper level: its title, or the gift it brings
    const g = KEEPER_GIFT[a.gift];
    el.className = "glass on legendary";
    el.innerHTML = `${ic(g ? g.icon : "star", "big")}<span><small>${tr("Keeper level {0}", a.level)}${a.pts ? " · " + tr("+1 skill point") : ""}</small><b>${g ? tr(g.name) : keeperTitle(a.level)}</b></span>`;
  } else if (a.many) {
    // a line of trophies in one: the rarest one's cup, and the shards of them all
    const n = a.many.length, top = AWARD_TIERS.filter(t => a.many.some(x => x.tier === t.id)).pop().id, shards = a.many.reduce((sum, x) => sum + AWARD_TIER[x.tier].shards, 0);
    el.className = "glass on " + top;
    el.innerHTML = `${ic("trophy_" + top, "big")}<span><small>${tr("see them in the Book")} · +${shards} ✦</small><b>${n} ${pl(n, "award earned", "awards earned")}</b></span>`;
  } else {
    const t = AWARD_TIER[a.tier];
    el.className = "glass on " + a.tier;
    // (and what it was for, in the words the Book uses)
    el.innerHTML = `${ic("trophy_" + a.tier, "big")}<span><small>${tr(t.one)} · +${t.shards} ✦</small><b>${tr(a.name)}</b><em>✓ ${tr(a.how)}</em></span>`;
  }
  sfx.levelUp(); buzz([10, 40, 10]);
}

// ---------- the daily moon egg ----------

const MOON_STONE = Object.assign(["#d7d9f2", "#9ea3cc", "#f6f6ff"], { moon: true });
/** The moon egg wears the colors of an event while it's on. */
const moonStone = () => { const ev = eventNow(); return ev ? Object.assign([...ev.egg], { moon: true }) : MOON_STONE; };

// ---------- events: a few weeks each year with their own glowling in the moon egg, their own sky, and a word from Mossa ----------

const EVENTS = [
  { id: "bloom", name: "Spring Bloom", emoji: "🌸", from: [3, 20], to: [4, 15], sp: "petalpup", egg: ["#f6d3e4", "#c98fb0", "#fff4fa"],
    fall: { c: ["#ffc2dc", "#fff0f6", "#f08cb8"], dir: 1, r: 2.2, n: 26 }, line: "Smell that? The moss is flowering. Spring Bloom has come." },
  { id: "fireflies", name: "Firefly Nights", emoji: "✨", from: [6, 20], to: [7, 15], sp: "glimmerbug", egg: ["#e4efb8", "#a8b86a", "#fbffe6"],
    fall: { c: ["#e8ff8a", "#fbffd0", "#c8f060"], dir: 0, r: 2, n: 22, blink: true }, line: "The fireflies have come down into the grotto. Firefly Nights have begun." },
  { id: "harvest", name: "Harvest Moon", emoji: "🍂", from: [9, 15], to: [10, 10], sp: "acornet", egg: ["#ecd2b0", "#b88a5c", "#fff2e0"],
    fall: { c: ["#e8913a", "#c45a2a", "#f2c45c"], dir: 1, r: 2.6, n: 22 }, line: "The moon is big and golden tonight. The Harvest Moon is up." },
  { id: "hollow", name: "Hollow Night", emoji: "🎃", from: [10, 20], to: [11, 3], sp: "gourdlet", egg: ["#f2c58f", "#c27a3c", "#fff0d8"],
    fall: { c: ["#ff9d3c", "#ffd27a", "#ff7a2a"], dir: -1, r: 2.4, n: 16, blink: true }, line: "Little lanterns are rising from the deep. It's Hollow Night. Keep yours lit." },
  { id: "frost", name: "First Frost", emoji: "❄️", from: [11, 8], to: [11, 30], sp: "rimeling", egg: ["#dfe6ff", "#a3b0e0", "#ffffff"],
    fall: { c: ["#ffffff", "#e2ecff", "#c7d6ff"], dir: 1, r: 1.8, n: 48 }, line: "The first frost has reached the grotto. Look at the snow. Even the stone feels it." },
  { id: "lights", name: "Winter Lights", emoji: "🎄", from: [12, 15], to: [1, 10], sp: "twinklet", egg: ["#f2d6d6", "#c08080", "#fff6e8"],
    fall: { c: ["#ff6f7f", "#ffd36a", "#7fe0a0", "#8fb8ff"], dir: 0, r: 2, n: 28, blink: true, still: true }, line: "Every crystal in the grotto is twinkling. Winter Lights have begun." },
];
const EVENT = Object.fromEntries(EVENTS.map(e => [e.id, e]));
// the test game can try any event: /staging/?event=bloom
const EVENT_TRY = STAGING && EVENT[new URLSearchParams(location.search).get("event")];
const inRange = (d, [fm, fd], [tm, td]) => {
  const v = (d.getMonth() + 1) * 100 + d.getDate(), a = fm * 100 + fd, b = tm * 100 + td;
  return a <= b ? v >= a && v <= b : v >= a || v <= b;
};
/** The event that's on today, if any. */
const eventNow = (d = new Date()) => EVENT_TRY || EVENTS.find(e => inRange(d, e.from, e.to)) || null;
/** Whole days until an event ends, counting today. */
function eventDaysLeft(ev, d = new Date()) {
  const end = new Date(d.getFullYear(), ev.to[0] - 1, ev.to[1]);
  if (end < new Date(d.getFullYear(), d.getMonth(), d.getDate())) end.setFullYear(end.getFullYear() + 1);
  return Math.max(1, Math.round((end - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5) + 1);
}
const eventName = ev => tr(ev.name);
const eventDates = ev => [ev.from, ev.to].map(([m, d]) => new Date(2000, m - 1, d).toLocaleDateString(LANG === "uk" ? "uk-UA" : "en-US", { month: "short", day: "numeric" })).join(" – ");
/** How a moon glowling is described: by its season, or by the event it belongs to. */
const moonKind = sp => sp.event ? tr("moon glowling · {0}", eventName(EVENT[sp.event])) : tr("{0} moon glowling", seasonName(sp.moon));
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const seasonOf = (d = new Date()) => ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"][d.getMonth()];

/** Today's moon egg: the season's moon glowling until you've met it, then a rare or legendary one that changes daily. */
function moonToday() {
  const ev = eventNow(), evSp = ev && SP[ev.sp];
  if (evSp && !save.seen[evSp.id]) return evSp;
  const season = SPECIES.find(s => s.moon === seasonOf() && !s.event);
  if (!save.seen[season.id]) return season;
  const pool = SPECIES.filter(s => !s.moon && CRYSTAL[s.crystal].rarity !== "common");
  return pool[Math.floor(seeded(dayKey())() * pool.length)];
}

const moonDone = () => save.moon && save.moon.last === dayKey();
/** Nights kept: every day a moon egg was opened, all of them together. A day away takes nothing: it only ever rises. */
const moonNights = () => (save.moon && save.moon.nights) || 0;
/** Back after a gap: there are nights kept, but yesterday's egg (and today's, so far) stayed shut. The moon doesn't mind. */
function moonWaited() {
  if (!moonNights() || moonDone()) return false;
  const y = new Date(); y.setDate(y.getDate() - 1);
  return save.moon.last !== dayKey(y);
}
/** The nights kept under the moon's mark, for the end of a line (the mark holds on to the last word, so it never wraps alone). */
const moonNote = () => { const n = moonNights(); return n ? ` · ${n} ${pl(n, "night kept", "nights kept")}\u00a0🌙` : ""; };

/** What today's moon egg holds, in a line; after days away the moon says hello first, and nothing about the days. */
function moonLine() {
  const sp = moonToday();
  if (moonDone()) return tr("next one in {0}", untilTomorrow()) + moonNote();
  return (moonWaited() ? tr("The moon waited. It's good at that.") + "\n" : "") + tr("{0} sleeps inside ✦ +25 shards", sp.event && !save.seen[sp.id] ? tr("the {0} glowling", eventName(EVENT[sp.event])) : sp.moon && !save.seen[sp.id] ? tr(/^[aeiou]/.test(sp.moon) ? "an {0} moon glowling" : "a {0} moon glowling", seasonName(sp.moon)) : tr("a {0} glowling", rar(rarityOf(sp)))) + moonNote();
}
/** The moon stone grows with you: as hard as the first stone of the deepest cave you've opened, and never softer than
 *  level 6's, which is what it used to be for everyone. */
function moonConf() {
  const cave = [3, 2, 1, 0].find(k => unlocked(k * 6 + 1));
  return levelConf(Math.max(6, cave * 6 + 1));
}
/** greeted: the altar's card has just said the moon's hello, so the egg doesn't say it again. */
function startMoon(greeted) {
  if (moonDone()) return;
  sfx.tick();
  game.chips = []; game.sparks = [];
  setScene("crack");
  const sp = moonToday();
  newEgg({ ...moonConf(), n: "moon", moon: true, wander: true, forced: { species: sp, crystal: CRYSTAL.moonstone } }, true);
  setHint(!greeted && moonWaited() ? tr("The moon waited. It's good at that.") : tr("today's moon egg: something special sleeps inside 🌙"));
}

/** Called when a moon egg opens: one more night kept, and bonus shards. */
function finishMoon() {
  // (one night a day, even if the egg somehow opens twice, say in two tabs)
  const nights = moonNights() + (moonDone() ? 0 : 1);
  // streak, moonBest: the same number under its old names, so a tab or a phone still on an older game finds a number where
  // it looks for one, and whatever it writes back turns into nights kept again without losing any (see moonSaveOf)
  save.moon = { last: dayKey(), nights, streak: nights };
  save.counts = { ...save.counts, moonBest: nights };
  // every moon egg brings a firefly square; every third night kept, a star bar
  giveBar(nights % 3 ? "firefly" : "star");
  taskDone("moon");
  habitXP("ritual");
  return 25 + Math.min(50, (nights - 1) * 5);
}

function untilTomorrow() {
  const t = new Date(); t.setHours(24, 0, 0, 0);
  return fmtLeft(t - Date.now());
}

// ---------- the lantern: oil for trips into the grotto, and snack bars that top it up ----------

const OIL_EVERY = 20 * 60e3;
/** The lantern holds 5 drops, one more from keeper level 6 (see KEEPER_GIFTS). */
const oilMax = () => 5 + (keeperGift("oil") ? 1 : 0);
const BARS = {
  firefly: { name: "Firefly square", oil: 1, icon: "barFirefly" },
  nut: { name: "Nut bar", oil: 3, icon: "barNut" },
  star: { name: "Star bar", get oil() { return oilMax(); }, icon: "barStar" },
};
/** Oil in the lantern now: one drop comes back every 20 minutes up to the brim (bars can fill it past that). */
function oilNow() {
  // (only reads: a full lantern leaves the save alone, so looking at it never changes anything)
  const now = Date.now(), o = save.oil;
  if (o.n >= oilMax()) return o.n;
  const k = Math.floor((now - o.t) / OIL_EVERY);
  if (k > 0) { o.n = Math.min(oilMax(), o.n + k); o.t = o.n >= oilMax() ? now : o.t + k * OIL_EVERY; }
  return o.n;
}
const oilNext = () => Math.max(0, save.oil.t + OIL_EVERY - Date.now());
/** Moon eggs, co-op, levels you already have three stars on and the first time through the first cave's six don't need oil
 *  (so the Gloom's first seal, at the end of it, never meets an empty lantern). */
const tripCosts = n => !(n > 0 && (save.stars[n] >= 3 || (n <= 6 && !save.stars[n])));
function burnOil() {
  if (oilNow() < 1) return false;
  // the 20 minutes start counting from the first drop used
  if (save.oil.n >= oilMax()) save.oil.t = Date.now();
  save.oil.n--;
  persist();
  updateTopbar();
  return true;
}
/** A snack bar for the lantern, from a task, a level-up, a moon egg or the rubble of a geode. */
function giveBar(id, n = 1) {
  save.bars = { ...save.bars, [id]: (save.bars?.[id] || 0) + n };
  persist();
  if (!$("lantern").classList.contains("hidden")) openLantern();
}
const barName = id => tr(BARS[id].name);
/** The smallest bar in your pocket, if any: the one a trip eats by itself when the lantern is out (see startLevel). */
const barFor = () => Object.keys(BARS).filter(id => save.bars?.[id] > 0).sort((a, b) => BARS[a].oil - BARS[b].oil)[0];
/** auto: a trip needed the drop, so the bar goes in by itself with a word in the corner, and no sheet. */
function useBar(id, auto) {
  if (!(save.bars?.[id] > 0)) return;
  oilNow();
  save.bars[id]--;
  save.oil.n = Math.min(99, save.oil.n + BARS[id].oil);
  if (save.oil.n >= oilMax()) save.oil.t = Date.now();
  persist();
  sfx.munch(); setTimeout(() => sfx.shimmer(), 250);
  updateTopbar();
  if (auto) toast(tr("{0} into the lantern ✦ +{1} oil", barName(id), BARS[id].oil));
  else openLantern();
}
function renderOilPill() {
  const n = oilNow();
  const drops = Array.from({ length: oilMax() }, (_, i) => `<i${i < n ? ' class="on"' : ""}></i>`).join("");
  $("oilCount").innerHTML = `${ic("lantern", n ? "" : "off")}<span class="drops" aria-label="${n}/${oilMax()}">${drops}</span>${n > oilMax() ? `<em>+${n - oilMax()}</em>` : n < oilMax() ? `<em>${fmtClock(oilNext())}</em>` : ""}`;
  // the Crack button says so when the lantern is out (a bar in the pocket goes in by itself, so that isn't out)
  const next = nextLevel(), dry = !n && tripCosts(next) && !barFor();
  $("crackTab").classList.toggle("dry", !!dry);
  $("crackLvl").textContent = dry ? `⏳ ${fmtClock(oilNext())}` : next ? tr("Lv {0}", next) : tr("Step {0}", wanderStep());
  $("oilWhen").textContent = n >= oilMax() ? tr("lantern") : fmtClock(oilNext());
  $("oilPill").classList.toggle("empty", !n);
}
const fmtClock = ms => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
/** A level that's free to crack again: one with ★★★, the deepest whose cave still hides a crystal the Book lacks, else the deepest. */
function freeReplay() {
  const done = Array.from({ length: LEVELS }, (_, i) => LEVELS - i).filter(n => save.stars[n] >= 3);
  return done.find(n => CRYSTALS.some(c => c.cave === levelConf(n).cave && !save.geodes[c.id])) || done[0] || 0;
}
/** The lantern sheet: how much oil, when the next drop comes, and the bars you have. needed: opened because a trip needs oil.
 *  Out of oil, it shows the ways to play that are free right now: today's moon egg and a ★★★ level. */
function openLantern(needed) {
  const n = oilNow(), ways = [];
  if (!n && !moonDone()) ways.push(`<button class="pillbtn" data-free="moon">${ic("moon")}${tr("Today's moon egg")}</button>`);
  const again = !n && freeReplay();
  if (again) ways.push(`<button class="pillbtn" data-free="${again}">${ic("star")}${tr("Level {0} ★★★", again)}</button>`);
  $("lanternTitle").textContent = needed && !n ? tr("The lantern is out") : tr("Lantern");
  $("lanternSub").textContent = (n >= oilMax() ? tr("Full: {0} trips into the grotto.", n) : tr("{0} of {1} drops of oil · the next one in {2}", n, oilMax(), fmtLeft(oilNext())))
    + (ways.length ? ". " + tr("Come back a little later, or play one of these for free:") : needed && !n ? ". " + tr("Have a bar, or come back a little later.") : "");
  $("lanternGo").innerHTML = ways.join("");
  $("lanternGo").hidden = !ways.length;
  $$("#lanternGo [data-free]").forEach(b => b.addEventListener("click", () => {
    show("lantern", false);
    if (b.dataset.free === "moon") startMoon(); else startLevel(Number(b.dataset.free));
  }));
  $("lanternMeter").innerHTML = Array.from({ length: Math.max(oilMax(), n) }, (_, i) => ic("lantern", i < n ? "" : "off")).join("");
  $("barList").innerHTML = Object.entries(BARS).map(([id, b]) => {
    const have = save.bars?.[id] || 0;
    return `<button class="snack" data-bar="${id}" ${have ? "" : "disabled"}>${ic(b.icon, "big")}<span><b>${barName(id)}</b><small>${id === "star" ? tr("fills the lantern, even past the brim") : tr("+{0} oil", b.oil)}</small></span><span class="cost">×${have}</span></button>`;
  }).join("");
  $$("#barList [data-bar]").forEach(b => b.addEventListener("click", () => useBar(b.dataset.bar)));
  // the rules in three small labels, and the whole story behind the ?
  $("oilFacts").textContent = [tr("1 per trip"), tr("+1 every {0} min", OIL_EVERY / 60e3), tr("★★★ levels free")].join(" · ");
  $("lanternFree").innerHTML = [
    tr("Each trip into the Grotto burns 1 drop of oil. The lantern holds {0}.", oilMax()),
    tr("A drop comes back every {0} minutes on its own, until the lantern is full again: from empty to full takes {1}.", OIL_EVERY / 60e3, fmtLeft(oilMax() * OIL_EVERY)),
    tr("Bars fill it at once, even past the brim. They come from daily tasks, level-ups, moon eggs and sometimes the rubble of a geode."),
    tr("Free, always: moon eggs, playing together, and levels you already have ★★★ on. Quit before the first tap and you get the drop back."),
    tr("The first time through the first cave, its six geodes need no oil at all."),
  ].map(t => `<p>${t}</p>`).join("");
  show("lantern", true);
}

// ---------- home caves ----------

/** At home a crystal turns up this many times as often as the others of its rarity. */
const HOME_WEIGHT = 3;
/** Which crystal of this rarity a geode holds. Wander and playing together draw from every cave alike, as they always have. */
function rollCrystal(conf, rarity) {
  const pool = CRYSTALS.filter(c => c.rarity === rarity);
  if (conf.wander) return pick(pool);
  const w = c => c.cave === conf.cave ? HOME_WEIGHT : 1;
  let r = Math.random() * pool.reduce((sum, c) => sum + w(c), 0);
  return pool.find(c => (r -= w(c)) < 0) || pool[pool.length - 1];
}

/** On a level you have opened before and in Wander, the geode takes a second look at the Book: a crystal you already have
 *  gets one more roll of the same rarity, and the new one is kept if the Book lacks it. Rare stays as rare as ever. */
const replays = n => n === 0 || !!save.stars[n];
function bookCrystal(conf) {
  const r = Math.random(), rarity = r < conf.legendary ? "legendary" : r < conf.legendary + conf.rare ? "rare" : "common";
  const first = rollCrystal(conf, rarity);
  if (!save.geodes[first.id]) return first;
  const second = rollCrystal(conf, rarity);
  return save.geodes[second.id] ? first : second;
}

const caveShells = [];
/** A closed geode in the stone of cave k, small and pixelled like the pictures in the Book. One picture per cave, so two alike give nothing away. */
function caveShell(k) {
  return caveShells[k] || (caveShells[k] = pixelate(makeShell(CAVE_STONES[k]).canvas, 30, 40).toDataURL());
}

/** Into the grotto. */
function startLevel(n) {
  // a stone left mid-crack on this level is still there: back to it, for no oil (its trip was paid when it began)
  if (save.left && save.left.n === n && resumeStone(save.left)) return;
  // a trip into the grotto takes a drop of lantern oil
  const paid = tripCosts(n);
  // out of oil with a bar in the pocket: the smallest goes in by itself, and on you go
  if (paid && oilNow() < 1 && barFor()) useBar(barFor(), true);
  if (paid && !burnOil()) { sfx.tick(); openLantern(true); habitFell(); return; }
  sfx.tick();
  game.chips = []; game.sparks = [];
  setScene("crack");
  // (Wander is a descent: its egg is the one on the step you're on, see depthConf)
  const conf = n ? levelConf(n) : depthConf(save.depth.at);
  if (n && n % 6 === 0 && !save.stars[n]) { conf.gloom = n / 6; conf.hp = Math.round(conf.hp * 1.4); }
  if (replays(n) && !conf.gloom) conf.chosen = bookCrystal(conf);
  newEgg(conf, true);
  if (conf.gloom) { talk("g" + conf.gloom); setHint(tr("a geode sealed by the Gloom: crack it and set the spark free")); }
  if (conf.pocket) { talk("pocket"); setHint(tr(POCKET_HINTS[pocketRule(conf.depth)])); }
  game.egg.paid = paid;
}

// ---------- the stone that waits: an egg left mid-crack is kept, cracks and all, until you come back to it ----------

/** Can this geode wait for you? The Grotto's levels and Wander can. A moon egg is the day's own, a heart geode stays in its
 *  niche until it's cracked anyway, and a shared egg belongs to both of you: those aren't kept. */
const stoneKeeps = conf => !!conf && !conf.coop && !conf.moon && !conf.heart && Number.isInteger(conf.n) && conf.n >= 0 && conf.n <= LEVELS;
/** What a waiting stone keeps besides its level, crystal, glowling, shell and cracks: everything the blows so far have done. */
const STONE_KEEP = ["shiny", "hp", "damage", "taps", "crits", "search", "found", "gems", "combo", "chain", "owed", "hits", "seed", "spot",
  "bands", "banded", "silent", "sheen", "shade", "patches", "shadeLaid", "shadeBurnt", "eyeLeft", "paid", "rest", "helped"];
/** The crack network as plain data: a spoke is both a live tip and a ray of its impact, so each is written once and named by number. */
function netOut(net) {
  const all = [...new Set([...net.tips, ...(net.impacts || []).flatMap(m => m.rays)])], at = new Map(all.map((t, i) => [t, i]));
  return { segs: net.segs, tips: all, live: net.tips.map(t => at.get(t)), impacts: (net.impacts || []).map(m => ({ ...m, rays: m.rays.map(t => at.get(t)) })), dents: net.dents || [] };
}
/** And back: the same spokes shared between the tips and the impacts again, so the next blow grows them as it would have. */
function netIn(o) {
  const all = o.tips.map(t => ({ ...t, path: t.path && t.path.map(p => p.slice()) }));
  return { segs: o.segs.map(g => g.slice()), tips: o.live.map(i => all[i]), impacts: o.impacts.map(m => ({ ...m, rays: m.rays.map(i => all[i]) })), dents: o.dents.map(d => d.slice()) };
}
/** The egg as it stands, for the save. */
function stoneOf(e) {
  const { chosen, ...conf } = e.conf, kept = {};
  for (const k of STONE_KEEP) if (e[k] !== undefined) kept[k] = e[k];
  return JSON.parse(JSON.stringify({ n: e.conf.n, conf, crystal: e.crystal.id, species: e.species.id, stone: e.stone.gloom ? "gloom" : [...e.stone], net: netOut(e.net), ...kept, at: Date.now() }));
}
/** Is this a stone that can be picked up again (and not something a damaged or hand-edited save left behind)? */
const stoneOk = s => !!s && typeof s === "object" && Number.isInteger(s.n) && s.n >= 0 && s.n <= LEVELS && !!s.conf && typeof s.conf === "object" && !!CRYSTAL[s.crystal] && !!SP[s.species]
  && s.taps > 0 && s.damage < s.hp && !!s.net && [s.net.segs, s.net.tips, s.net.live, s.net.impacts, s.net.dents, s.hits, s.spot].every(Array.isArray);
/** Is a stone waiting on level n (0: in Wander)? */
const stoneWaits = n => !!save.left && save.left.n === n && stoneOk(save.left);
/** Left mid-crack: the stone stays as it is, and takes the place of any other that waited (only one waits at a time). */
function stoneLeave(e) {
  if (!e || e.state !== "cracking" || !e.taps || !stoneKeeps(e.conf) || coopSession || game.coopTouched) return;
  save.left = stoneOf(e);
  persist();
}
/** The words on the quit confirm: whether the stone waits, and which one it takes the place of. */
function leaveWords(e) {
  if (!e || !stoneKeeps(e.conf)) return tr("The cracks you've made so far will be lost.");
  const s = save.left, other = s && stoneOk(s) && s.n !== e.conf.n && !e.waited;
  return tr("This stone will wait for you on the map, cracks and all.")
    + (other ? " " + (s.n ? tr("The stone waiting on level {0} goes back to the rock.", s.n) : tr("The stone waiting in Wander goes back to the rock.")) : "");
}
/** Back at the stone: the same egg, as you left it. No oil (that trip was paid), nothing rolled again. False if it can't be. */
function resumeStone(s) {
  if (!stoneOk(s)) { delete save.left; persist(); return false; }
  sfx.tick();
  game.chips = []; game.sparks = [];
  setScene("crack");
  const crystal = CRYSTAL[s.crystal], conf = { ...s.conf, chosen: crystal };
  // (laid out without the drop-in, so no sunpetal is spent and nothing new is rolled; then it drops in as any egg does)
  newEgg(conf, false);
  const e = game.egg;
  Object.assign(e, JSON.parse(JSON.stringify(Object.fromEntries(STONE_KEEP.filter(k => s[k] !== undefined).map(k => [k, s[k]])))));
  e.crystal = crystal; e.species = SP[s.species];
  e.stone = s.stone === "gloom" ? GLOOM_STONE : STONES.find(t => t.join() === s.stone.join()) || s.stone;
  e.net = netIn(s.net);
  e.waited = true; e.state = "entering"; e.t = 0;
  refitEgg(e);
  updateDots(); updateEye();
  game.gemsShown = e.gems;
  if (conf.gloom) setHint(tr("a geode sealed by the Gloom: crack it and set the spark free"));
  // Mossa notices, in one line, once a day (and only when nobody else is talking)
  const id = "stone-" + habitDay();
  if (!talkLines()) { TALKS[id] = () => [[MOSSA, "Your stone waited. Stones are good at that.", null, "warm"]]; talk(id); }
  return true;
}
/** The stone that waited is open: it's gone from the save, and coming back to it counts as going back to the stone. */
function stoneHome() {
  delete save.left;
  if (!coopSession && !game.coopTouched) save.habit.fell = true;
  persist();
}

// ---------- Wander goes deeper: one step down for every geode opened there, and the depth is never lost ----------

/** What a pocket's hint says, by the cave rule its stone keeps. */
const POCKET_HINTS = {
  silent: "a pocket: something rare sleeps here · silent stone, watch which way the ripples lean",
  bands: "a pocket: something rare sleeps here · banded stone, when a band breaks the weak spot moves",
  sheen: "a pocket: something rare sleeps here · the weak spot shows only as you hit it",
};
/** The step Wander's next egg is on: the waiting stone's, if one waits there. */
const wanderStep = () => (stoneWaits(0) && save.left.conf.depth) || save.depth.at;
/** A geode opened at step d of Wander: the next one is a step further down, and the deepest is remembered for good. */
function wanderDown(d) {
  save.depth.best = Math.max(save.depth.best, d);
  save.depth.at = Math.min(d + 1, save.depth.best + 1);
}
/** Where Wander can start from: the step you're on, one past the deepest, the top, and every step just past a pocket on
 *  the way up (so jumping back is five steps at a time, and never straight onto a pocket). Shallowest first. */
function depthChoices() {
  const { at, best } = save.depth, set = new Set([1, at, best + 1]);
  for (let d = POCKET_EVERY + 1; d <= best + 1; d += POCKET_EVERY) set.add(d);
  return [...set].filter(d => d >= 1 && d <= best + 1).sort((a, b) => a - b);
}
/** The picker's arrows: a choice higher up (-1) or deeper (+1). */
function pickDepth(dir) {
  const ch = depthChoices(), i = ch.indexOf(save.depth.at), to = ch[i + dir];
  if (!to) return;
  sfx.tick();
  save.depth.at = to;
  persist();
  renderMap(); updateTopbar();
}
/** Wander's button on the map, with the step you're on and the deepest; under it, while no stone waits there, where to start from. */
function wanderButton(open) {
  if (!open) return `<button class="wander" data-n="0" disabled>${tr("🌌 Wander: endless geodes from the deepest caves")}${tr(" (clear level 24)")}</button>`;
  const waits = stoneWaits(0), d = wanderStep(), best = save.depth.best, ch = depthChoices(), i = ch.indexOf(d);
  let html = `<button class="wander${waits ? " waits" : ""}" data-n="0">${waits ? ic("stoneWait", "wait") : ""}${tr("🌌 Wander · step {0}", d)}${isPocket(d) ? " ✦" : ""}`
    + `<small>${best ? tr("deepest: step {0}", best) : tr("endless geodes: each one opened takes you a step deeper")}</small></button>`;
  if (!waits && ch.length > 1) html += `<div class="depth-pick"><span>${tr("start from")}</span>`
    + `<button class="pillbtn" data-depth="-1" aria-label="${tr("Higher up")}" ${i > 0 ? "" : "disabled"}>▲</button><b>${tr("step {0}", d)}</b>`
    + `<button class="pillbtn" data-depth="1" aria-label="${tr("Deeper")}" ${i < ch.length - 1 ? "" : "disabled"}>▼</button></div>`;
  return html;
}

/** Where the six levels of a chapter sit on its cave, in percent: across the top, then back along the bottom. */
const TRAIL = [[16, 26], [50, 22], [84, 30], [80, 70], [48, 76], [16, 70]];

function renderMap() {
  const next = Array.from({ length: LEVELS }, (_, i) => i + 1).find(n => !save.stars[n]) || 0;
  $("mapSub").textContent = tr("{0} of {1} stars · tap a level to crack its geode", totalStars(), LEVELS * 3);
  let html = "";
  CAVES.forEach((name, ci) => {
    html += `${ci ? '<div class="orn sm" aria-hidden="true"></div>' : ""}<h3 class="chap"><small>${tr("Chapter {0}", ["I", "II", "III", "IV", "V", "VI"][ci])}</small>${name}</h3><p class="cave-note">${CAVE_NOTES[ci]}</p>`;
    // the trail snakes across the cave and leaves at the bottom left, where the next cave's trail picks it up
    const pts = TRAIL.map(([x, y], i) => [x, y + Math.sin(ci * 3 + i * 1.7) * 4]);
    const done = pts.filter((_, i) => save.stars[ci * 6 + i + 1]).length;
    const line = (a, col, dash) => a.length > 1 ? `<polyline points="${a.map(p => p.join(",")).join(" ")}" fill="none" stroke="${col}" stroke-width="4" stroke-dasharray="${dash}" vector-effect="non-scaling-stroke"/>` : "";
    html += `<figure class="plate band cave${unlocked(ci * 6 + 1) ? "" : " dim"}"><div class="biome"><img src="${chapterArt(ci)}" alt=""><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${line([[pts[0][0], -6], ...pts, [pts[5][0], 106]], "rgba(239,230,255,.35)", "2 6")}${line(pts.slice(0, Math.min(6, done + 1)), "#eec26a", "2 6")}</svg>`;
    pts.forEach(([x, y], i) => {
      const n = ci * 6 + i + 1, st = save.stars[n] || 0, open = unlocked(n);
      // (a stone left mid-crack sits by its level, waiting)
      const waits = open && stoneWaits(n);
      html += `<button class="lvl${n === next ? " next" : ""}${waits ? " waits" : ""}" style="left:${x}%;top:${y}%" data-n="${n}" ${open ? "" : "disabled"}${waits ? ` aria-label="${tr("Level {0}: your stone waits here", n)}"` : ""}>${n}<span>${open ? (st ? "★".repeat(st) : "") : "🔒"}</span>${waits ? ic("stoneWait", "wait") : ""}</button>`;
    });
    html += `</div>${nicheRow(ci)}</figure>`;
  });
  const allDone = unlocked(LEVELS + 1);
  html += wanderButton(allDone);
  $("mapList").innerHTML = html;
  $$("#mapList [data-n]").forEach(b => b.addEventListener("click", () => startLevel(Number(b.dataset.n))));
  $$("#mapList [data-depth]").forEach(b => b.addEventListener("click", () => pickDepth(Number(b.dataset.depth))));
  $$("#mapList [data-niche]").forEach(b => b.addEventListener("click", () => tapNiche(...b.dataset.niche.split(",").map(Number))));
}

// ---------- star niches: two in the wall of every cave, sealed until its stars open them, a heart geode in each ----------

/** A cave's two niches open at this many of its eighteen stars. */
const NICHE_STARS = [12, 18];
/** Stars earned on the six levels of cave k. */
const caveStars = k => [1, 2, 3, 4, 5, 6].reduce((sum, j) => sum + (save.stars[k * 6 + j] || 0), 0);
/** A niche is sealed until its cave has the stars, open while its heart geode waits inside, and empty once that has been cracked. */
const nicheState = (k, i) => save.caches && save.caches[k] && save.caches[k][i] ? "empty" : caveStars(k) >= NICHE_STARS[i] ? "open" : "sealed";

/**
 * The crystal in the heart geode of cave k's niche i: one of the cave's own that the Book lacks, the commonest of them in
 * the first niche and the rarest in the second. With the cave's own all found it is the rarest the Book lacks anywhere,
 * and with the Book full, one of the cave's rare ones (the one you have fewest of; the second niche looks for a legendary first).
 * Nothing is rolled and nothing is kept: the same Book gives the same crystal, so walking out and coming back changes nothing.
 */
function heartCrystal(k, i) {
  const rank = c => ["common", "rare", "legendary"].indexOf(c.rarity), rarest = (a, b) => rank(b) - rank(a), lacks = c => !save.geodes[c.id];
  const home = CRYSTALS.filter(c => c.cave === k);
  const own = home.filter(lacks).sort(i ? rarest : (a, b) => rank(a) - rank(b));
  if (own.length) return own[0];
  const far = CRYSTALS.filter(lacks).sort(rarest);
  if (far.length) return far[0];
  const count = c => save.geodes[c.id].count || 0;
  return home.filter(c => c.rarity !== "common").sort((a, b) => (i ? rarest(a, b) : 0) || count(a) - count(b))[0] || home[0];
}

/** The two niches under a cave's picture: sealed with the cave's stars counted on it, open with its heart geode showing, or opened and empty. */
function nicheRow(k) {
  const have = caveStars(k);
  return `<div class="niches">${NICHE_STARS.map((need, i) => {
    const st = nicheState(k, i), count = `★ ${Math.min(have, need)} / ${need}`;
    const [inside, big, small] = st === "open" ? [`<img src="${caveShell(heartCrystal(k, i).cave)}" alt=""><i></i><i></i>`, tr("heart geode"), tr("tap to open")]
      : st === "sealed" ? ["★", count, tr("star niche")] : ["", `★ ${need}`, tr("opened")];
    const says = st === "open" ? tr("Star niche, open: a heart geode is inside") : st === "sealed" ? tr("Star niche, sealed: {0} of {1} stars", Math.min(have, need), need) : tr("Star niche, opened and empty");
    return `<button class="niche ${st}" data-niche="${k},${i}" aria-label="${says}"><span class="hole" aria-hidden="true">${inside}</span><span class="says"><b>${big}</b><small>${small}</small></span></button>`;
  }).join("")}</div>`;
}

/** A tap on a niche: an open one hands over its heart geode, a sealed or an empty one says in a line what it is. */
function tapNiche(k, i) {
  const st = nicheState(k, i);
  if (st === "open") return startHeart(k, i);
  sfx.tick();
  toast(st === "sealed" ? tr("{0} stars in this cave open the niche: a heart geode waits inside", NICHE_STARS[i]) : tr("This niche is empty: its heart geode is already opened"));
}

/**
 * Into an open niche. Its heart geode is a gift from the cave: no lantern oil, no stars to earn and no seal of the Gloom,
 * in stone as hard as the cave's last level. It stands outside the ladder of levels, the way the moon egg does.
 */
function startHeart(k, i) {
  if (nicheState(k, i) !== "open") return;
  // (walking off to a geode of your own ends a shared room, as the Crack button does)
  if (coopSession) coopEnd("navigation", true);
  sfx.tick();
  game.chips = []; game.sparks = [];
  setScene("crack");
  const crystal = heartCrystal(k, i), fresh = !save.geodes[crystal.id];
  newEgg({ ...levelConf(k * 6 + 6), n: "heart", wander: true, heart: { cave: k, i }, chosen: crystal }, true);
  // in the stone of its crystal's home, the one that showed in the niche
  game.egg.stone = CAVE_STONES[crystal.cave]; refitEgg(game.egg);
  $("lvlPill").textContent = "♥";
  setHint(fresh ? tr("the cave's heart geode: a crystal new to your Book is inside") : tr("the cave's heart geode: something rare is inside"));
}

/** Called when a heart geode opens: only now is its niche empty. The card leads back to the map, as the moon egg's does. */
function heartFound(conf) {
  const { cave, i } = conf.heart;
  const taken = save.caches || (save.caches = {});
  (taken[cave] || (taken[cave] = [false, false]))[i] = true;
  persist();
  $("nextLvl").textContent = tr("Back to the grotto");
  $("foundMap").hidden = true;
}
