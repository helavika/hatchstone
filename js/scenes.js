"use strict";
// Hatchstone · scenes, settings, the keeper, awards, the moon egg, events and the lantern.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- scenes ----------

const show = (id, on) => $(id).classList.toggle("hidden", !on);
function setHint(text) {
  if ($("hint").textContent !== text) $("hint").textContent = text;
  $("hint").classList.toggle("on", !!text);
}

let toastTimer = 0;
function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("on"), 2600);
}

function setScene(scene) {
  if (scene !== "nest" && arrange.on) stopArrange();
  // into or out of cracking: the pixel size changes (finer everywhere else), so everything is laid out again
  const wasCrack = game.scene === "crack";
  if (game.scene === "nest" && scene !== "nest") sfx.purrOff();
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
  if (scene === "nest") { renderNest(true); nudgeBackup(); }
  updateTopbar();
  talkMoments(scene);
}

function updateTopbar() {
  $("shardPill").innerHTML = `${ic("shard")}${save.shards}`;
  $("starPill").innerHTML = `${ic("star")}${totalStars()}`;
  const n = nextLevel();
  $("crackLvl").textContent = n ? tr("Lv {0}", n) : tr("Wander");
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

// ---------- settings: music on or off, music and sound volumes, less motion, bigger text ----------

// less motion starts on if the device asks for it; the music starts on, and quiet
const opts = () => ({ musicOn: true, music: 0.5, sfx: 1, calm: !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, big: false, look: 1, ...(save.opts || {}) });
function applyOpts() {
  const o = opts();
  sfx.setVolumes(o.music, o.sfx, o.musicOn !== false);
  document.body.classList.toggle("calm", !!o.calm);
  document.body.classList.toggle("bigtext", !!o.big);
}
function setOpt(k, v) { save.opts = { ...opts(), [k]: v }; persist(); applyOpts(); }
function openOpts() {
  sfx.tick();
  const o = opts(), pct = v => `${Math.round(v * 100)}%`;
  $("optsList").innerHTML = `
    <button class="opt-toggle${o.musicOn ? " on" : ""}" data-toggle="musicOn"><span>${tr("Music")}<small>${tr("a slow, quiet soundtrack, its own in every place")}</small></span><b>${o.musicOn ? tr("on") : tr("off")}</b></button>
    <label class="opt"><span>${ic("sound")}${tr("Music volume")}<em id="vMusic">${pct(o.music)}</em></span><input type="range" min="0" max="1" step="0.05" value="${o.music}" data-opt="music"${o.musicOn ? "" : " disabled"}></label>
    <label class="opt"><span>${ic("bell")}${tr("Sounds")}<em id="vSfx">${pct(o.sfx)}</em></span><input type="range" min="0" max="1" step="0.05" value="${o.sfx}" data-opt="sfx"></label>
    <p class="me-hint">${tr("Music is the soundtrack: each place has its own, in its backdrop's key; sounds are everything else: taps, chirps, voices.")}</p>
    <button class="opt-toggle${o.calm ? " on" : ""}" data-toggle="calm"><span>${tr("Less motion")}<small>${tr("no shaking or bouncing, gentler effects")}</small></span><b>${o.calm ? tr("on") : tr("off")}</b></button>
    <button class="opt-toggle${o.big ? " on" : ""}" data-toggle="big"><span>${tr("Bigger text")}<small>${tr("for the cards, dialogs and hints")}</small></span><b>${o.big ? tr("on") : tr("off")}</b></button>`;
  $("optsList").innerHTML += `<div class="opt"><span>${ic("sparkle")}${tr("How glowlings shine")}</span></div><div class="seg look-seg">${[["Classic", 0], ["Glow", 1], ["Spirit", 2]].map(([n, v]) => `<button data-look="${v}" class="${o.look === v ? "on" : ""}">${tr(n)}</button>`).join("")}</div>`;
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
const me = () => (save.me = save.me || { name: "", form: "n", xp: 0, pts: 0, skill: { str: 0, care: 0, luck: 0 } });
const myName = () => me().name || tr("friend");
/** Pick the right ending for you in Ukrainian: gform("знайшла", "знайшов", "знайшли"). English has one form. */
const gform = (f, m, n) => LANG !== "uk" ? f : me().form === "f" ? f : me().form === "m" ? m : n;
const KEEPER_TITLES = [[1, "Pebble finder"], [3, "Stone tapper"], [5, "Keeper's apprentice"], [8, "Gloom chaser"], [12, "Keeper of sparks"], [16, "Heartlight keeper"], [20, "Legend of the grotto"]];
const SKILLS = [
  { id: "str", name: "Strength", icon: "hammer", what: l => tr("taps hit {0}% harder", l * 5) },
  { id: "care", name: "Care", icon: "heart", what: l => tr("glowlings grow {0}% faster", l * 10) },
  { id: "luck", name: "Luck", icon: "sparkle", what: l => tr("+{0}% shiny chance, bars in the rubble {1}% more often", (l * 0.6).toFixed(1), l * 25) },
];
const SKILL_MAX = 5;
const keeperNeed = l => 60 + l * 40;
/** Your keeper level and how far into the next one you are. */
function keeperLevel() {
  let xp = me().xp, l = 1;
  while (xp >= keeperNeed(l)) { xp -= keeperNeed(l); l++; }
  return { l, xp, need: keeperNeed(l) };
}
const keeperTitle = l => tr(KEEPER_TITLES.filter(([at]) => l >= at).pop()[1]);
const skill = id => (save.me && save.me.skill && save.me.skill[id]) || 0;
/** Keeper XP for the things you do; each level brings a skill point. */
const KEEPER_XP = { trips: 5, cracked: 12, harvested: 6, fed: 2, petted: 1, played: 4, taskDays: 15, wickBought: 3, rescued: 40 };
function keeperXP(n) {
  if (!n || coopSession || game.coopTouched) return;
  const before = keeperLevel().l;
  me().xp += n;
  const after = keeperLevel().l;
  if (after > before) {
    me().pts += after - before;
    awardQueue.push({ keeper: true, level: after });
    showAward();
  }
}
function openMe(first) {
  sfx.tick();
  const m = me(), k = keeperLevel();
  $("meName").value = m.name;
  $("meSave").hidden = !first; $("meSave").dataset.first = first ? "1" : "";
  $("meForm").hidden = LANG !== "uk";
  $$("#meForm [data-form]").forEach(b => b.classList.toggle("on", b.dataset.form === m.form));
  const nextTitle = KEEPER_TITLES.find(([at]) => at > k.l);
  $("meLevel").innerHTML = `<h3>${tr("Your level")}<button class="q" data-q="lvl" aria-label="?">?</button></h3>`
    + `<b>${tr("Level {0}", k.l)} · ${keeperTitle(k.l)}</b><i class="aw-bar" style="--k:${k.xp / k.need}"><u>${tr("{0} of {1} XP", k.xp, k.need)}</u></i>`
    + `<p class="me-hint">${tr("You earn XP for everything you do in the game. Every new level gives you a skill point.")}${nextTitle ? " " + tr("Next title at level {0}: {1}.", nextTitle[0], tr(nextTitle[1])) : ""}</p>`
    + `<div class="me-more" data-more="lvl" hidden><p>${tr("Where XP comes from:")}</p><ul>${[
      [tr("cracking an egg"), KEEPER_XP.cracked], [tr("freeing a spark from the Gloom"), KEEPER_XP.rescued], [tr("finishing all of a day's tasks"), KEEPER_XP.taskDays],
      [tr("picking a harvest"), KEEPER_XP.harvested], [tr("playing a mini-game"), KEEPER_XP.played], [tr("buying from Wick"), KEEPER_XP.wickBought],
      [tr("giving a snack"), KEEPER_XP.fed], [tr("petting a glowling"), KEEPER_XP.petted], [tr("an award"), "20–250"]].map(([w, n]) => `<li><span>${w}</span><b>+${n}</b></li>`).join("")}</ul></div>`;
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
  streak: () => Math.max(cnt("moonBest"), save.moon ? save.moon.streak : 0),
};
/** Each award: its rarity, and a test that says how far along you are [now, goal]. */
const AWARDS = [
  { id: "firstCrack", tier: "common", name: "First crack", how: "Crack your first egg", test: () => [stat.cracked(), 1] },
  { id: "firstFriend", tier: "common", name: "Hello, little one", how: "Meet your first glowling", test: () => [Object.keys(save.seen).length, 1] },
  { id: "fed10", tier: "common", name: "Snack time", how: "Give 10 snacks", test: () => [cnt("fed"), 10] },
  { id: "pet25", tier: "common", name: "Gentle hands", how: "Pet your glowlings 25 times", test: () => [cnt("petted"), 25] },
  { id: "decor", tier: "common", name: "Home sweet home", how: "Buy a decoration for the nest", test: () => [Object.keys(save.decor).filter(id => id !== "rug").length, 1] },
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
  { id: "streak3", tier: "rare", name: "Night owl", how: "Open moon eggs 3 nights in a row", test: () => [stat.streak(), 3] },
  { id: "room2", tier: "rare", name: "More room", how: "Add a room to your home", test: () => [(save.rooms || []).length, 2] },
  { id: "echo5", tier: "rare", name: "Good ear", how: "Sing back 5 tunes in Echo song", test: () => [save.echoBest || 0, 5] },
  { id: "wick3", tier: "rare", name: "A good customer", how: "Buy 3 things from Wick", test: () => [cnt("wickBought"), 3] },
  { id: "trips5", tier: "rare", name: "Explorer's map", how: "Send glowlings on 5 expeditions", test: () => [cnt("trips"), 5] },
  { id: "craft3", tier: "rare", name: "Handy", how: "Make 3 things at the workbench", test: () => [cnt("crafted"), 3] },
  { id: "harvest25", tier: "rare", name: "Harvest festival", how: "Pick 25 harvests", test: () => [cnt("harvested"), 25] },
  { id: "biteleaf", tier: "epic", name: "It bites", how: "Grow and pick a biteleaf", test: () => [cnt("biteleaf"), 1] },
  { id: "rescue1", tier: "rare", name: "First light", how: "Free a spark from the Gloom", test: () => [cnt("rescued"), 1] },
  { id: "cracked250", tier: "epic", name: "Quarry lord", how: "Crack 250 eggs", test: () => [stat.cracked(), 250] },
  { id: "species20", tier: "epic", name: "Glowpedia scholar", how: "Meet 20 kinds of glowlings", test: () => [stat.species(), 20] },
  { id: "stars60", tier: "epic", name: "Constellation", how: "Earn 60 stars", test: () => [totalStars(), 60] },
  { id: "radiant", tier: "epic", name: "Radiant", how: "Raise a glowling to level 15", test: () => [stat.level(), 15] },
  { id: "shiny", tier: "epic", name: "Something shiny", how: "Hatch a shiny glowling", test: () => [save.creatures.some(c => c.shiny) || cnt("shiny") ? 1 : 0, 1] },
  { id: "vault", tier: "epic", name: "Into the Vault", how: "Reach the fourth cave", test: () => [unlocked(19) ? 1 : 0, 1] },
  { id: "streak7", tier: "epic", name: "Moon keeper", how: "Open moon eggs 7 nights in a row", test: () => [stat.streak(), 7] },
  { id: "event", tier: "epic", name: "In season", how: "Meet a limited event glowling", test: () => [SPECIES.some(sp => sp.event && save.seen[sp.id]) ? 1 : 0, 1] },
  { id: "arsenal", tier: "epic", name: "Arsenal", how: "Own every tool at the Forge", test: () => [TOOL_SKINS.filter(k => !k.cost || (save.toolSkins || {})[k.id]).length, TOOL_SKINS.length] },
  { id: "legend", tier: "legendary", name: "Legend", how: "Meet a legendary glowling", test: () => [legendOk() ? 1 : 0, 1] },
  { id: "allClear", tier: "legendary", name: "Heart of the grotto", how: "Clear all 24 levels", test: () => [unlocked(LEVELS + 1) ? 1 : 0, 1] },
  { id: "stars72", tier: "legendary", name: "Flawless", how: "Earn all 72 stars", test: () => [totalStars(), LEVELS * 3] },
  { id: "level20", tier: "legendary", name: "Brightest of all", how: "Raise a glowling to level 20", test: () => [stat.level(), MAX_LEVEL] },
  { id: "story", tier: "legendary", name: "The whole story", how: "Hear every part of Mossa's story", test: () => [STORY.filter(p => talkSeen(p.id)).length, STORY.length] },
  { id: "rescueAll", tier: "legendary", name: "Gloombreaker", how: "Free all four sparks from the Gloom", test: () => [cnt("rescued"), 4] },
  { id: "everyone", tier: "legendary", name: "Every last one", how: "Meet every kind of glowling", test: () => [stat.species(), SPECIES.length] }
];
const awardQueue = [];
let awardShowing = false;
/** Hand out what you've earned. The first time (or with quiet) they arrive together, with one word in the corner. */
function checkAwards(quiet) {
  // like the dialogs, awards wait while (and after) you play together, so a shared egg never changes your own save behind its back
  if (coopSession || game.coopTouched) return;
  const first = !save.awards, earned = save.awards || {};
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
  if (first || quiet) { toast(tr("{0} awards earned ✦ see them in the Book", got.length)); return; }
  awardQueue.push(...got);
  showAward();
}
/** A trophy slides down from the top, like a console achievement. */
function showAward() {
  if (awardShowing || !awardQueue.length) return;
  const a = awardQueue.shift(), el = $("award");
  awardShowing = true;
  if (a.keeper) {
    el.className = "glass on legendary";
    el.innerHTML = `${ic("star", "big")}<span><small>${tr("Keeper level {0}", a.level)} · ${tr("+1 skill point")}</small><b>${keeperTitle(a.level)}</b></span>`;
  } else {
    const t = AWARD_TIER[a.tier];
    el.className = "glass on " + a.tier;
    el.innerHTML = `${ic("trophy_" + a.tier, "big")}<span><small>${tr(t.one)} · +${t.shards} ✦</small><b>${tr(a.name)}</b></span>`;
  }
  sfx.levelUp(); buzz([10, 40, 10]);
  setTimeout(() => { el.classList.remove("on"); setTimeout(() => { awardShowing = false; showAward(); }, 450); }, 3400);
}

// ---------- the daily moon egg ----------

const MOON_STONE = Object.assign(["#d7d9f2", "#9ea3cc", "#f6f6ff"], { moon: true });
/** The moon egg wears the colors of an event while it's on. */
const moonStone = () => { const ev = eventNow(); return ev ? Object.assign([...ev.egg], { moon: true }) : MOON_STONE; };

// ---------- events: a few weeks each year with their own glowling in the moon egg, their own sky, and a word from Mossa ----------

const EVENTS = [
  { id: "bloom", name: "Spring Bloom", emoji: "🌸", from: [3, 20], to: [4, 15], sp: "petalpup", egg: ["#f6d3e4", "#c98fb0", "#fff4fa"],
    fall: { c: ["#ffc2dc", "#fff0f6", "#f08cb8"], dir: 1, r: 2.2, n: 26 }, line: "Can you smell it? The moss is flowering. Spring Bloom is here!" },
  { id: "fireflies", name: "Firefly Nights", emoji: "✨", from: [6, 20], to: [7, 15], sp: "glimmerbug", egg: ["#e4efb8", "#a8b86a", "#fbffe6"],
    fall: { c: ["#e8ff8a", "#fbffd0", "#c8f060"], dir: 0, r: 2, n: 22, blink: true }, line: "The fireflies have come down into the grotto. It's Firefly Nights!" },
  { id: "harvest", name: "Harvest Moon", emoji: "🍂", from: [9, 15], to: [10, 10], sp: "acornet", egg: ["#ecd2b0", "#b88a5c", "#fff2e0"],
    fall: { c: ["#e8913a", "#c45a2a", "#f2c45c"], dir: 1, r: 2.6, n: 22 }, line: "The moon is big and golden tonight. The Harvest Moon is up!" },
  { id: "hollow", name: "Hollow Night", emoji: "🎃", from: [10, 20], to: [11, 3], sp: "gourdlet", egg: ["#f2c58f", "#c27a3c", "#fff0d8"],
    fall: { c: ["#ff9d3c", "#ffd27a", "#ff7a2a"], dir: -1, r: 2.4, n: 16, blink: true }, line: "Little lanterns are floating up from the deep. Happy Hollow Night!" },
  { id: "frost", name: "First Frost", emoji: "❄️", from: [11, 8], to: [11, 30], sp: "rimeling", egg: ["#dfe6ff", "#a3b0e0", "#ffffff"],
    fall: { c: ["#ffffff", "#e2ecff", "#c7d6ff"], dir: 1, r: 1.8, n: 48 }, line: "Brr! The first frost has reached the grotto. Look at the snow!" },
  { id: "lights", name: "Winter Lights", emoji: "🎄", from: [12, 15], to: [1, 10], sp: "twinklet", egg: ["#f2d6d6", "#c08080", "#fff6e8"],
    fall: { c: ["#ff6f7f", "#ffd36a", "#7fe0a0", "#8fb8ff"], dir: 0, r: 2, n: 28, blink: true, still: true }, line: "Every crystal in the grotto is twinkling. Winter Lights have begun!" },
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
function moonStreak() {
  if (!save.moon) return 0;
  const y = new Date(); y.setDate(y.getDate() - 1);
  return save.moon.last === dayKey() || save.moon.last === dayKey(y) ? save.moon.streak : 0;
}

/** What today's moon egg holds, in a line. */
function moonLine() {
  const streak = moonStreak(), sp = moonToday();
  if (moonDone()) return tr("next one in {0}", untilTomorrow()) + (streak ? tr(" · streak {0} 🔥", streak) : "");
  return tr("{0} sleeps inside ✦ +25 shards", sp.event && !save.seen[sp.id] ? tr("the {0} glowling", eventName(EVENT[sp.event])) : sp.moon && !save.seen[sp.id] ? tr(/^[aeiou]/.test(sp.moon) ? "an {0} moon glowling" : "a {0} moon glowling", seasonName(sp.moon)) : tr("a {0} glowling", rar(rarityOf(sp)))) + (streak ? tr(" · streak {0} 🔥", streak) : "");
}
function startMoon() {
  if (moonDone()) return;
  sfx.tick();
  game.chips = []; game.sparks = [];
  setScene("crack");
  const sp = moonToday();
  newEgg({ ...levelConf(6), n: "moon", moon: true, wander: true, forced: { species: sp, crystal: CRYSTAL.moonstone } }, true);
  setHint(tr("today's moon egg: something special sleeps inside 🌙"));
}

/** Called when a moon egg opens: streak and bonus shards. */
function finishMoon() {
  const y = new Date(); y.setDate(y.getDate() - 1);
  const streak = save.moon && save.moon.last === dayKey(y) ? save.moon.streak + 1 : 1;
  save.moon = { last: dayKey(), streak };
  if (streak > cnt("moonBest")) save.counts = { ...save.counts, moonBest: streak };
  // every moon egg brings a firefly square; every third night in a row, a star bar
  giveBar(streak % 3 ? "firefly" : "star");
  taskDone("moon");
  return 25 + Math.min(50, (streak - 1) * 5);
}

function untilTomorrow() {
  const t = new Date(); t.setHours(24, 0, 0, 0);
  return fmtLeft(t - Date.now());
}

// ---------- the lantern: oil for trips into the grotto, and snack bars that top it up ----------

const OIL_MAX = 5, OIL_EVERY = 20 * 60e3;
const BARS = {
  firefly: { name: "Firefly square", oil: 1, icon: "barFirefly" },
  nut: { name: "Nut bar", oil: 3, icon: "barNut" },
  star: { name: "Star bar", oil: OIL_MAX, icon: "barStar" },
};
/** Oil in the lantern now: one drop comes back every 20 minutes up to the brim (bars can fill it past that). */
function oilNow() {
  // (only reads: a full lantern leaves the save alone, so looking at it never changes anything)
  const now = Date.now(), o = save.oil;
  if (o.n >= OIL_MAX) return o.n;
  const k = Math.floor((now - o.t) / OIL_EVERY);
  if (k > 0) { o.n = Math.min(OIL_MAX, o.n + k); o.t = o.n >= OIL_MAX ? now : o.t + k * OIL_EVERY; }
  return o.n;
}
const oilNext = () => Math.max(0, save.oil.t + OIL_EVERY - Date.now());
/** Moon eggs, co-op and levels you already have three stars on don't need oil. */
const tripCosts = n => !(n > 0 && save.stars[n] >= 3);
function burnOil() {
  if (oilNow() < 1) return false;
  // the 20 minutes start counting from the first drop used
  if (save.oil.n >= OIL_MAX) save.oil.t = Date.now();
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
function useBar(id) {
  if (!(save.bars?.[id] > 0)) return;
  oilNow();
  save.bars[id]--;
  save.oil.n = Math.min(99, save.oil.n + BARS[id].oil);
  if (save.oil.n >= OIL_MAX) save.oil.t = Date.now();
  persist();
  sfx.munch(); setTimeout(() => sfx.shimmer(), 250);
  updateTopbar();
  openLantern();
}
function renderOilPill() {
  const n = oilNow();
  const drops = Array.from({ length: OIL_MAX }, (_, i) => `<i${i < n ? ' class="on"' : ""}></i>`).join("");
  $("oilCount").innerHTML = `${ic("lantern", n ? "" : "off")}<span class="drops" aria-label="${n}/${OIL_MAX}">${drops}</span>${n > OIL_MAX ? `<em>+${n - OIL_MAX}</em>` : n < OIL_MAX ? `<em>${fmtClock(oilNext())}</em>` : ""}`;
  // the Crack button says so when the lantern is out
  const next = nextLevel(), dry = !n && tripCosts(next);
  $("crackTab").classList.toggle("dry", !!dry);
  $("crackLvl").textContent = dry ? `⏳ ${fmtClock(oilNext())}` : next ? tr("Lv {0}", next) : tr("Wander");
  $("oilWhen").textContent = n >= OIL_MAX ? tr("lantern") : fmtClock(oilNext());
  $("oilPill").classList.toggle("empty", !n);
}
const fmtClock = ms => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
/** The lantern sheet: how much oil, when the next drop comes, and the bars you have. needed: opened because a trip needs oil. */
function openLantern(needed) {
  const n = oilNow();
  $("lanternTitle").textContent = needed && !n ? tr("The lantern is out") : tr("Lantern");
  $("lanternSub").textContent = (n >= OIL_MAX ? tr("Full: {0} trips into the grotto.", n) : tr("{0} of {1} drops of oil · the next one in {2}", n, OIL_MAX, fmtLeft(oilNext())))
    + (needed && !n ? ". " + tr("Have a bar, or come back a little later.") : "");
  $("lanternMeter").innerHTML = Array.from({ length: Math.max(OIL_MAX, n) }, (_, i) => ic("lantern", i < n ? "" : "off")).join("");
  $("barList").innerHTML = Object.entries(BARS).map(([id, b]) => {
    const have = save.bars?.[id] || 0;
    return `<button class="snack" data-bar="${id}" ${have ? "" : "disabled"}>${ic(b.icon, "big")}<span><b>${barName(id)}</b><small>${id === "star" ? tr("fills the lantern, even past the brim") : tr("+{0} oil", b.oil)}</small></span><span class="cost">×${have}</span></button>`;
  }).join("");
  $$("#barList [data-bar]").forEach(b => b.addEventListener("click", () => useBar(b.dataset.bar)));
  // the rules in three small labels, and the whole story behind the ?
  $("oilFacts").textContent = [tr("1 per trip"), tr("+1 every {0} min", OIL_EVERY / 60e3), tr("★★★ levels free")].join(" · ");
  $("lanternFree").innerHTML = [
    tr("Each trip into the Grotto burns 1 drop of oil. The lantern holds {0}.", OIL_MAX),
    tr("A drop comes back every {0} minutes on its own, until the lantern is full again: from empty to full takes {1}.", OIL_EVERY / 60e3, fmtLeft(OIL_MAX * OIL_EVERY)),
    tr("Bars fill it at once, even past the brim. They come from daily tasks, level-ups, moon eggs and sometimes the rubble of a geode."),
    tr("Free, always: moon eggs, playing together, and levels you already have ★★★ on. Quit before the first tap and you get the drop back."),
  ].map(t => `<p>${t}</p>`).join("");
  show("lantern", true);
}

function startLevel(n) {
  // a trip into the grotto takes a drop of lantern oil
  const paid = tripCosts(n);
  if (paid && !burnOil()) { sfx.tick(); openLantern(true); return; }
  sfx.tick();
  game.chips = []; game.sparks = [];
  setScene("crack");
  const conf = levelConf(n);
  if (n && n % 6 === 0 && !save.stars[n]) { conf.gloom = n / 6; conf.hp = Math.round(conf.hp * 1.4); }
  newEgg(conf, true);
  if (conf.gloom) { talk("g" + conf.gloom); setHint(tr("a geode sealed by the Gloom: crack it and set the spark free")); }
  game.egg.paid = paid;
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
      html += `<button class="lvl${n === next ? " next" : ""}" style="left:${x}%;top:${y}%" data-n="${n}" ${open ? "" : "disabled"}>${n}<span>${open ? (st ? "★".repeat(st) : "") : "🔒"}</span></button>`;
    });
    html += "</div></figure>";
  });
  const allDone = unlocked(LEVELS + 1);
  html += `<button class="wander" data-n="0" ${allDone ? "" : "disabled"}>${tr("🌌 Wander: endless geodes from the deepest caves")}${allDone ? "" : tr(" (clear level 24)")}</button>`;
  $("mapList").innerHTML = html;
  $$("#mapList [data-n]").forEach(b => b.addEventListener("click", () => startLevel(Number(b.dataset.n))));
}
