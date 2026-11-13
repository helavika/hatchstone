"use strict";
// Hatchstone · the nest, the map, the shop and chest, the garden, Wick, expeditions, rooms and who lives where.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- the nest ----------

function renderNest(full) {
  if (game.scene === "nest") { syncActors(); setHint(nestHint()); }
  const cr = activeCreature();
  const hasAny = !!cr, place = isPlace();
  $("nestTop").hidden = !hasAny || place;
  $("nestBottom").hidden = !hasAny || place;
  renderPlaceBar();
  if (place) { $("roomNav").hidden = true; $("roomLabel").hidden = false; $("roomName").textContent = roomName(save.room); }
  if (!hasAny || place) return;
  applyTime(cr);
  const sp = specOf(cr);
  $("nestName").textContent = cr.name;
  const nr = save.rooms.filter((_, i) => roomOpen(i)).length;
  $("roomNav").hidden = $("roomLabel").hidden = nr < 2;
  $("roomName").textContent = roomName(save.room);
  $("roomPrevName").textContent = roomName(stepRoom(-1));
  $("roomNextName").textContent = roomName(stepRoom(1));
  $("nestLvl").textContent = tr("Lv {0}", cr.level) + (cr.level >= MAX_LEVEL ? tr(" · max") : "");
  $("nestTop").title = tr("Level {0} · {1} {2}", cr.level, STAGES[stageOf(cr.level)], sp.name);
  $("xpBar").firstElementChild.style.width = (cr.level >= MAX_LEVEL ? 100 : cr.xp / xpNeed(cr.level) * 100) + "%";
  for (const [k, id] of [["tummy", "Tummy"], ["joy", "Joy"], ["energy", "Energy"]]) {
    // four icons per need, like an old handheld pet (and like the Sims: a full Hunger bar means a full tummy)
    const el = $("b" + id), full = Math.ceil(cr[k] / 25);
    if (el.dataset.full !== String(full)) { el.dataset.full = full; el.innerHTML = [0, 1, 2, 3].map(i => ic(el.dataset.need, i < full ? "" : "off")).join(""); }
    el.classList.toggle("low", cr[k] < 25);
    const btn = document.querySelector(`.acts [data-fill="${k}"]`);
    if (btn) { btn.style.setProperty("--fill", full / 4); btn.classList.toggle("lowfill", cr[k] < 25); }
    $("v" + id).textContent = Math.round(cr[k]);
  }
  $("sleepBtn").innerHTML = cr.sleeping ? ic("sun") + tr("Wake") : ic("moon") + tr("Sleepiness");
  $("sleepBtn").setAttribute("aria-label", cr.sleeping ? tr("Wake") : tr("Sleep"));
  $("sleepBtn").classList.toggle("rested", !cr.sleeping && cr.energy >= SLEEPY_AT);
  $("feedBtn").disabled = cr.sleeping;
  // the button for what it needs lights up, the way a Tamagotchi's attention icon does
  const wants = callOf(cr);
  $("feedBtn").classList.toggle("want", wants === "hungry");
  $("playBtn").classList.toggle("want", wants === "lonely");
  $("sleepBtn").classList.toggle("want", wants === "sleepy");
  $("playBtn").disabled = cr.sleeping;
  renderResidentsBtn(cr);
  if (full) {
    $("switcher").innerHTML = save.creatures.map(c =>
      `<button data-id="${c.id}" class="${c.id === cr.id ? "on" : ""}${c.out ? " out" : ""}" title="${c.out ? tr("{0} is out exploring: tap to call it home", c.name) : c.name}"><img class="px2" style="width:40px;height:40px" src="${creatureImage(specOf(c), { art: 20, level: c.level, shiny: c.shiny, acc: c.acc })}" alt="${c.name}"></button>`).join("");
    $$("#switcher button").forEach(b => b.addEventListener("click", () => selectCreature(Number(b.dataset.id))));
    requestAnimationFrame(switchArrows);
  }
}
/** The one cell under the needs: who you're looking after, their mood, and how full this room is. Tap for everyone, room by room. */
function renderResidentsBtn(cr) {
  const here = residents(save.room).length, others = save.creatures.length - here;
  const html = `<img src="${creatureImage(specOf(cr), { art: 20, level: cr.level, shiny: cr.shiny, acc: cr.acc })}" alt="">${moodIcon(cr)}<b>${here}/${homeCap()}</b>${others ? `<small>+${others}</small>` : ""}`;
  if ($("residentsBtn").dataset.h !== html) { $("residentsBtn").dataset.h = html; $("residentsBtn").innerHTML = html; }
}
/** The arrows beside the glowling row show only where there are more glowlings to scroll to. */
function switchArrows() {
  // first see whether everyone fits without the arrows (buttons may shrink a little): then there's nothing to scroll
  const sw = $("switcher"), wrap = sw.parentElement;
  if (!wrap.classList.contains("fits") || sw.scrollWidth - sw.clientWidth > 2) {
    wrap.classList.add("fits");
    if (sw.scrollWidth - sw.clientWidth > 2) wrap.classList.remove("fits");
  }
  if (wrap.classList.contains("fits")) { sw.scrollLeft = 0; $("swPrev").hidden = $("swNext").hidden = true; return; }
  const more = sw.scrollWidth - sw.clientWidth > 2;
  $("swPrev").hidden = !more || sw.scrollLeft < 4;
  $("swNext").hidden = !more || sw.scrollLeft > sw.scrollWidth - sw.clientWidth - 4;
}

function openSnacks() {
  const cr = activeCreature();
  if (!cr) return;
  const sp = specOf(cr);
  // (English plurals: a moonberry, moonberries)
  const snack = SNACKS[sp.snack].name.toLowerCase();
  $("snackSub").textContent = tr("You have ✦ {0} shards. {1}s love {2}.", save.shards, sp.name, LANG === "uk" ? snack : snack.replace(/([^aeiou])y$/, "$1ie") + "s");
  const pantry = save.pantry || {};
  const row = ([id, s]) => {
    const fav = id === sp.snack || s.fav, more = [s.energy && `${tr("Sleepiness")} +${s.energy}`, s.xp && tr("+{0} toward growing up", s.xp), fav && tr("favorite!")].filter(Boolean);
    const cost = pantry[id] ? `🧺 ×${pantry[id]}` : s.garden ? "🌱" : `✦ ${s.cost}`;
    return `<button class="snack" data-id="${id}" ${!pantry[id] && (s.garden || save.shards < s.cost) ? "disabled" : ""}><span class="em">${s.emoji}</span><span><b>${s.name}${fav ? " ♥" : ""}</b><small>${[`${tr("Hunger")} +${s.tummy}`, ...more].join(" · ")}</small></span><span class="cost">${cost}</span></button>`;
  };
  const all = Object.entries(SNACKS), bought = all.filter(([, s]) => !s.garden);
  $("snackList").innerHTML = `<h3 class="forge-h">${tr("Snacks")}</h3>` + bought.filter(([, s]) => !s.drink).map(row).join("")
    + `<h3 class="forge-h">${tr("Drinks")}</h3><p class="me-hint">${tr("A sip doesn't fill the tummy or make anyone drowsy. Starfizz perks a sleepy glowling up.")}</p>` + bought.filter(([, s]) => s.drink).map(row).join("")
    + `<h3 class="forge-h">${tr("From the garden")}</h3><p class="me-hint">${tr("No shop sells these: they only grow in the garden bed outside.")}</p>` + all.filter(([, s]) => s.garden).map(row).join("");
  $$("#snackList .snack").forEach(b => b.addEventListener("click", () => feed(b.dataset.id)));
  show("snacks", true);
}

function feed(id) {
  const cr = activeCreature(), s = SNACKS[id], sp = specOf(cr);
  show("snacks", false);
  if (cr.tummy >= (s.drink ? 97 : 88)) { refuseWith(cr, tr("no thanks, I'm full")); return; }
  // grown in your garden: free
  if (save.pantry && save.pantry[id] > 0) save.pantry = { ...save.pantry, [id]: save.pantry[id] - 1 };
  else if (s.garden) { toast(tr("That one only grows in the garden 🌱")); return; }
  else {
    if (save.shards < s.cost) { toast(tr("Not enough shards: crack a geode to earn more ✦")); return; }
    save.shards -= s.cost;
  }
  game.nest.feedCall = { t: game.time, id: cr.id };
  const v = actorView(activeActor());
  game.nest.snack = { emoji: s.emoji, x: v.x, y: v.y - N.base * 2, ty: v.y, vy: 0, fav: id === sp.snack || !!s.fav, s };
  updateTopbar();
}

function finishSnack(sn) {
  const cr = activeCreature(), a = activeActor();
  if (a) { a.state = "eat"; a.t = 1.4; a.tx = a.x; a.ty = a.y; }
  const v = a ? actorView(a) : { x: sn.x, y: sn.ty, size: N.base };
  sfx.munch();
  cr.tummy = clamp(cr.tummy + sn.s.tummy, 0, 100);
  // a full tummy makes you drowsy: the bigger the snack, the sleepier; a drink doesn't, and some wake you up
  if (sn.s.drink) cr.energy = clamp(cr.energy + (sn.s.energy || 0), 0, 100);
  else cr.energy = clamp(cr.energy - sn.s.tummy * 0.25 - (cr.tummy > 85 ? 6 : 0), 0, 100);
  if (sn.s.energy && a) setTimeout(() => { emote(a, "⚡", 1.6); a.hop = 1; }, 900);
  else if (cr.energy < 40 && a) setTimeout(() => { emote(a, "🥱", 1.8); sfx.yawn(); }, 1500);
  cr.messT = (cr.messT || 0) + 15;
  bump("fed");
  cr.joy = clamp(cr.joy + sn.s.joy + (sn.fav ? 15 : 0), 0, 100);
  addXP(cr, (sn.fav ? 12 : 6) + (sn.s.xp || 0));
  spawnChips(v.x, v.y, 8, 0.6, ["#f6e2b8", "#e8c48a", "#fff"]);
  floatText(sn.fav ? tr("favorite! ♥") : sn.s.xp ? tr("growing! ✦") : sn.s.drink ? tr("slurp") : tr("yum"), v.x, v.y - v.size * 0.7, sn.fav ? "#ffb3d4" : "#fff");
  if (sn.fav) for (let i = 0; i < 5; i++) heart(v.x + rand(-30, 30), v.y - v.size * 0.3);
  // the hungry ones who came running only get to watch: they stay hungry until they get their own snack
  for (const o of actors.values()) if (o.state === "begging" && a && Math.hypot(o.x - a.x, o.y - a.y) < N.base * 1.4) emote(o, "🥺", 1.6);
  if (game.nest.feedCall) game.nest.feedCall.t = game.time - 2000;
  persist();
  taskDone("feed");
  renderNest();
}

const hasDecor = id => save.decor[id] && save.decor[id].on;

/** The chest keeps what's yours; the shop sells. Both work like a catalogue: four tabs, then things in sections, and a strip at the bottom for the one you picked. */
const SHOP_TABS = [["decor", "candle", "Furniture"], ["look", "grotto", "Look"], ["pantry", "chest", "Pantry"], ["wear", "heart", "Wear"]];
const MARKET_TABS = [["food", "cookie", "Food"], ["decor", "candle", "Furniture"], ["seeds", "sun", "Seeds"], ["reno", "hammer", "Renovation"]];
const DECOR_CATS = [["comfort", "Comfort"], ["light", "Light"], ["play", "Toys"], ["pretty", "Pretty things"]];
const DECOR_CAT = { cushion: "comfort", armchair: "comfort", table: "comfort", lamp: "light", lights: "light", mushrooms: "play", swing: "play", spring: "play", chest: "play", musicbox: "play",
  rug: "pretty", shelf: "pretty", bookcase: "pretty", plant: "pretty", painting: "pretty", bench: "comfort", lamppost: "light", birdbath: "play", drum: "play", blocks: "play", telescope: "pretty" };
const shopOf = () => (game.shop = game.shop || { mode: "chest", tab: "decor", pick: null });
function openShop() {
  sfx.tick();
  const st = shopOf(), iso = N.iso, market = st.mode === "market", TABS = market ? MARKET_TABS : SHOP_TABS;
  if (!TABS.some(t => t[0] === st.tab)) st.tab = TABS[0][0];
  $("shop").querySelector("h2").textContent = tr(market ? "Shop" : "Chest");
  $("shopSub").innerHTML = market ? tr("You have {0}. What you buy waits in your chest.", ic("shard") + save.shards) : tr("Everything that's yours. Glowlings visit the things they love.");
  const tabs = `<div class="shop-tabs">${TABS.map(([id, icon, name]) => `<button data-shoptab="${id}" class="${st.tab === id ? "on" : ""}">${ic(icon)}<span>${tr(name)}</span></button>`).join("")}</div>`;
  let body = "";
  if (st.tab === "look") {
    const now = currentTheme(), view = roomView();
    body = `<h3>${tr("View")}</h3><div class="seg view-seg"><button data-view="front" class="${view === "front" ? "on" : ""}">${tr("Straight on")}</button><button data-view="iso" class="${view === "iso" ? "on" : ""}">${tr("Isometric")}</button></div>`
      + `<h3>${tr("Backdrop")}</h3><p class="sub">${tr(isOutside() ? "The garden is always under the open sky." : !save.room ? "The nest is always tucked away in a cave, a grotto or a hollow." : "This room can take any backdrop you've found.")}</p><div class="themes">${THEMES.filter(t => roomThemes().includes(t.id)).map(t => {
        const ok = t.ok();
        return `<button class="theme${t.id === now ? " on" : ""}${ok ? "" : " locked"}" data-theme="${t.id}" ${ok ? "" : "disabled"}><img src="${themeThumb(t.id)}" alt=""><b>${t.name}</b>${ok ? "" : `<small>${ic("lock")}${t.how}</small>`}</button>`;
      }).join("")}</div>`
      + `<h3>${tr("The bed in the {0}", roomName(save.room).toLowerCase())}</h3><div class="tiles">${BEDS.map(bd => `<button class="tile${bedStyle() === bd.id ? " on placed" : ""}" data-bed="${bd.id}"><img class="em" src="${bedThumb(bd.id)}" alt=""><b>${tr(bd.name)}</b><small>${bedStyle() === bd.id ? tr("placed ✓") : tr("free")}</small></button>`).join("")}</div>`
      + `<p class="me-hint">${tr("Beds are free: pick the one that suits the room. Every glowling who lives here sleeps in it.")}</p>`;
  } else if (st.tab === "reno") {
    body = marketReno();
  } else if (st.tab === "wear") {
    body = accessoryList();
  } else if (st.tab === "food") {
    body = marketFood();
  } else if (st.tab === "seeds") {
    body = marketSeeds();
  } else if (st.tab === "pantry") {
    body = chestPantry();
  } else {
    const used = isoSpaceUsed();
    const items = DECOR.filter(d => (iso || !d.wall || DRAW_DECOR[d.id]) && (market ? !save.decor[d.id] : !!save.decor[d.id]));
    const tile = d => {
      const owned = save.decor[d.id], locked = d.legend && !owned && !legendOk();
      const tag = owned ? (owned.on ? tr("placed ✓") : decorRoom(d.id) >= 0 ? tr("in {0}", roomName(decorRoom(d.id))) : tr("stored")) : locked ? ic("lock") : "✦ " + d.cost;
      return `<button class="tile${owned ? " owned" : ""}${owned && owned.on ? " placed" : ""}${d.legend ? " legend" : ""}${locked || (!owned && save.shards < d.cost) ? " dim" : ""}${st.pick === d.id ? " on" : ""}" data-pick="${d.id}">${decorThumb(d)}<b>${d.name}</b><small>${tag}</small></button>`;
    };
    body = (!market ? `<div class="room-head"><span><b>${roomName(save.room)}</b>${iso ? `<small>${tr("Room space")} ${used}/${ISO_CAP}</small>` : ""}</span>${iso ? `<i class="room-space" style="--k:${Math.min(1, used / ISO_CAP)}"></i><button class="act" id="arrangeOpen">✥ ${tr("Rearrange")}</button>` : ""}</div>` : "")
      + (!items.length ? `<p class="me-hint">${market ? tr("You own everything here ✦") : tr("Nothing here yet: furniture you buy at the shop waits in the chest.")}</p>${market ? "" : `<button class="act" id="toMarket">${ic("stall")}${tr("To the shop")}</button>`}` : "")
      + DECOR_CATS.map(([cat, name]) => { const here = items.filter(d => (DECOR_CAT[d.id] || "pretty") === cat); return here.length ? `<h3 class="forge-h">${tr(name)}</h3><div class="tiles">${here.map(tile).join("")}</div>` : ""; }).join("");
  }
  $("shopList").innerHTML = tabs + `<div class="shop-body">${body}</div>`;
  renderShopPick();
  $$("#shopList [data-shoptab]").forEach(b => b.addEventListener("click", () => { st.tab = b.dataset.shoptab; st.pick = null; openShop(); }));
  $$("#shopList [data-pick]").forEach(b => b.addEventListener("click", () => {
    sfx.tick(); st.pick = b.dataset.pick;
    $$("#shopList [data-pick]").forEach(x => x.classList.toggle("on", x === b));
    renderShopPick();
  }));
  $$("#shopList .acc").forEach(b => b.addEventListener("click", () => wearAccessory(b.dataset.acc)));
  $$("#shopList .theme").forEach(b => b.addEventListener("click", () => { save.theme = b.dataset.theme; persist(); sfx.tick(); taskDone("decor"); openShop(); }));
  $$("#shopList [data-view]").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
  $("arrangeOpen")?.addEventListener("click", startArrange);
  $$("#shopList [data-bed]").forEach(b => b.addEventListener("click", () => { save.rooms[save.room].bed = b.dataset.bed; persist(); sfx.tick(); toast(tr("A new bed: {0} ✦", tr(BEDS.find(x => x.id === b.dataset.bed).name))); openShop(); }));
  $$("#shopList [data-build]").forEach(b => b.addEventListener("click", () => buildRoom(b.dataset.build)));
  $("nestUp")?.addEventListener("click", buyNestUp);
  $("toMarket")?.addEventListener("click", openMarket);
  $$("#shopList [data-food]").forEach(b => b.addEventListener("click", () => buyFood(b.dataset.food, Number(b.dataset.n || 1))));
  $$("#shopList [data-seedbuy]").forEach(b => b.addEventListener("click", () => buySeed(b.dataset.seedbuy, openShop)));
  show("shop", true);
}
/** The strip under the grid: what the picked thing is, who loves it, and the one button that buys, places or puts it away. */
function renderShopPick() {
  const st = shopOf(), d = st.tab === "decor" && DECO[st.pick], box = $("shopPick");
  box.hidden = !d;
  if (!d) return;
  const owned = save.decor[d.id], locked = d.legend && !owned && !legendOk();
  const who = d.lovers.map(b => BEHAVIOR_NAMES[b]).join(tr(" and "));
  const note = locked ? `${ic("lock")}${d.how}` : d.id === "painting" && owned ? tr("Tap it in the room to change the picture") : d.legend ? tr("Legendary · plays the songs you've unlocked") : tr("{0} love it", who[0].toUpperCase() + who.slice(1));
  const where = owned && !owned.on && decorRoom(d.id) >= 0 ? ` · ${tr("in {0}", roomName(decorRoom(d.id)))}` : "";
  const inPlace = isPlace(), label = owned ? (inPlace ? tr("In your chest ✓") : owned.on ? tr("Put away") : tr("Place here")) : `${tr("Buy")} ✦ ${d.cost}`;
  box.innerHTML = `${decorThumb(d)}<span><b>${d.name}</b><small>${note}${where}</small></span><button class="act${owned ? "" : " buy"}" id="shopPickGo" ${locked || (!owned && save.shards < d.cost) || (owned && inPlace) ? "disabled" : ""}>${label}</button>`;
  $("shopPickGo").addEventListener("click", () => buyDecor(d.id));
}

// ---------- the map: every place in the world, a tap away (the tab bar keeps only the everyday ones) ----------

const ripePlots = () => (save.garden?.slots || []).filter(q => q && SEEDS[q.seed] && stageOf2(q) === 3).length;
const WORLD = [
  { id: "grotto", name: "Grotto", icon: "grotto", at: [62, 66], note: () => !moonDone() ? tr("today's moon egg 🌙") : tr("{0} of {1} stars", totalStars(), LEVELS * 3), call: () => !moonDone(), go: () => setScene("map") },
  { id: "forge", name: "The Forge", icon: "hammer", at: [58, 160], ok: () => unlocked(4) || Object.keys(save.forge || {}).length > 0, how: () => tr("clear level {0}", 3), note: () => canForge() ? tr("upgrade ready") : tr("hammers and the workbench"), call: canForge, go: () => arriveAt("forge") },
  { id: "nest", name: "Nest", icon: "nest", at: [166, 64], note: () => tr("{0} glowlings at home", save.creatures.filter(c => !c.trip).length), go: () => toRoomKind("nest") },
  { id: "lab", name: "Laboratory", icon: "flask", at: [186, 172], ok: () => labOk(), how: () => tr("grow two glowlings to level {0}", PAIR_LEVEL), note: () => !save.incubator ? tr("the incubator: a mixed egg") : Date.now() >= save.incubator.due ? tr("the egg is ready! ✦") : tr("hatches in {0}", fmtLeft(save.incubator.due - Date.now())), call: () => !!save.incubator && Date.now() >= save.incubator.due, go: () => arriveAt("lab") },
  { id: "shop", name: "Shop", icon: "stall", at: [170, 256], ok: () => unlocked(2), how: () => tr("clear level {0}", 1), note: () => tr("food, furniture, seeds"), go: () => arriveAt("shop") },
  { id: "garden", name: "Garden", icon: "sun", at: [92, 238], ok: () => unlocked(3) || !!save.garden, how: () => tr("clear level {0}", 2), note: () => ripePlots() ? tr("ripe: {0} 🌱", ripePlots()) : wickHere() ? tr("Wick is visiting today") : tr("grows what no shop sells"), call: () => ripePlots() > 0 || wickHere(), go: () => arriveAt("yard") },
  { id: "trail", name: "Expeditions", icon: "compass", at: [196, 318], ok: () => unlocked(6) || onTrip().length > 0, how: () => tr("clear level {0}", 5), note: () => onTrip().length ? tr("{0} away exploring", onTrip().length) : tr("send a glowling exploring"), go: () => arriveAt("camp") },
];
const placeOk = id => { const w = WORLD.find(x => x.id === id); return !w.ok || w.ok(); };
/** A place that has just opened: noted once, with a toast and a "new" tag on the map until you've looked. */
function checkPlaces() {
  const ok = WORLD.filter(w => placeOk(w.id)).map(w => w.id);
  // (a nest that already had an incubator hears that it has moved to a lab of its own)
  const moved = ok.includes("lab") && ensureLab() && save.mapKnown === undefined && save.creatures.length > 0;
  if (!save.mapKnown) { save.mapKnown = ok.filter(id => !(moved && id === "lab")); if (!moved) return; }
  const fresh = ok.filter(id => !save.mapKnown.includes(id));
  if (!fresh.length) return;
  save.mapKnown = [...save.mapKnown, ...fresh]; save.mapFresh = [...(save.mapFresh || []), ...fresh];
  setTimeout(() => toast(tr("A new place on the map: {0} ✦", fresh.map(id => tr(WORLD.find(w => w.id === id).name)).join(", "))), 900);
  persist();
}
function toRoomKind(kind) {
  if (game.scene !== "nest") setScene("nest");
  const i = save.rooms.findIndex(r => r.kind === kind);
  if (i >= 0 && i !== save.room) goRoom(i);
  litTabs();
}
// ---------- the shop sells; the chest keeps what's yours ----------

function openChest() { const st = shopOf(); if (st.mode !== "chest") { st.mode = "chest"; st.tab = "decor"; st.pick = null; } openShop(); }
function openMarket() { const st = shopOf(); if (st.mode !== "market") { st.mode = "market"; st.tab = "food"; st.pick = null; } if (game.scene !== "nest") setScene("nest"); openShop(); }
function buyFood(id, n = 1) {
  const s = SNACKS[id];
  if (!s || s.garden || save.shards < s.cost * n) return;
  save.shards -= s.cost * n; save.pantry = { ...save.pantry, [id]: ((save.pantry || {})[id] || 0) + n };
  sfx.tick(); persist(); updateTopbar(); openShop();
}
function marketFood() {
  const pantry = save.pantry || {}, row = ([id, s]) => {
    const more = [`${tr("Hunger")} +${s.tummy}`, s.energy && `${tr("Sleepiness")} +${s.energy}`, s.xp && tr("+{0} toward growing up", s.xp), s.fav && tr("favorite!")].filter(Boolean).join(" · ");
    return `<div class="snack seed"><span class="em">${s.emoji}</span><span><b>${s.name} <em>×${pantry[id] || 0}</em></b><small>${more}</small></span><span class="seed-btns">${s.garden ? `<small class="only">🌱 ${tr("garden only")}</small>`
      : `<button class="act" data-food="${id}" ${save.shards < s.cost ? "disabled" : ""}>+1 ✦ ${s.cost}</button><button class="act" data-food="${id}" data-n="5" ${save.shards < s.cost * 5 ? "disabled" : ""}>+5</button>`}</span></div>`;
  };
  const all = Object.entries(SNACKS);
  return `<p class="me-hint">${tr("What you buy goes into the pantry basket 🧺: feed it from the snack button in the nest.")}</p>`
    + `<h3 class="forge-h">${tr("Snacks")}</h3>` + all.filter(([, s]) => !s.drink && !s.garden).map(row).join("")
    + `<h3 class="forge-h">${tr("Drinks")}</h3>` + all.filter(([, s]) => s.drink && !s.garden).map(row).join("")
    + `<h3 class="forge-h">${tr("From the garden")}</h3>` + all.filter(([, s]) => s.garden).map(row).join("");
}
function marketSeeds() {
  const g = garden();
  return `<p class="me-hint">${tr("Plant them in the garden bed outside.")}</p>` + Object.entries(SEEDS).map(([id, sd]) => {
    const have = g.seeds[id] || 0, locked = sd.ok && !sd.ok();
    return `<div class="snack seed${locked ? " locked" : ""}"><img class="em" src="${plantImage(id, 3)}" alt=""><span><b>${seedName(id)} <em>×${have}</em></b><small>${locked ? ic("lock") + tr(sd.how) : `${tr(sd.note)} · ${tr("{0} h", sd.hrs)}`}</small></span>`
      + `<span class="seed-btns"><button class="act" data-seedbuy="${id}" ${locked || save.shards < sd.cost ? "disabled" : ""}>+1 ✦ ${sd.cost}</button></span></div>`;
  }).join("");
}
/** The chest's pantry shelf: food in the basket, seeds in their packets, and the odd treasure. */
function chestPantry() {
  const pantry = Object.entries(save.pantry || {}).filter(([id, n]) => n > 0 && SNACKS[id]);
  const seeds = Object.entries(garden().seeds).filter(([id, n]) => n > 0 && SEEDS[id]);
  const bars = Object.entries(save.bars || {}).filter(([id, n]) => n > 0 && BARS[id]);
  const chip = (img, name, n) => `<div class="tile owned">${img}<b>${name}</b><small>×${n}</small></div>`;
  const empty = t => `<p class="me-hint">${t}</p>`;
  return `<h3 class="forge-h">${tr("Food")}</h3>` + (pantry.length ? `<div class="tiles">${pantry.map(([id, n]) => chip(`<span class="em">${SNACKS[id].emoji}</span>`, SNACKS[id].name, n)).join("")}</div>${empty(tr("Feed it from the snack button in the nest."))}` : empty(tr("The basket is empty. Buy food at the shop, or grow it in the garden.")))
    + `<h3 class="forge-h">${tr("Seeds")}</h3>` + (seeds.length ? `<div class="tiles">${seeds.map(([id, n]) => chip(`<img class="em" src="${plantImage(id, 3)}" alt="">`, seedName(id), n)).join("")}</div>` : empty(tr("No seeds. The shop has them, and expeditions bring some back.")))
    + `<h3 class="forge-h">${tr("Treasures")}</h3>` + (bars.length || save.sunlit ? `<div class="tiles">${bars.map(([id, n]) => chip(`<img class="em px-thumb" src="${pxIcon(BARS[id].icon || "bar" + id[0].toUpperCase() + id.slice(1))}" alt="">`, barName(id), n)).join("")}${save.sunlit ? chip(`<span class="em">☀️</span>`, tr("Sunpetal"), save.sunlit) : ""}</div>` : empty(tr("Nothing yet: bars for the lantern and sunpetals end up here.")));
}

// ---------- the garden: plant seeds in the garden bed, water them, and pick what grows (in real time) ----------

const SEEDS = {
  glowberry: { name: "Glowberry", hrs: 2, cost: 8, gives: { pantry: { juice: 2, berry: 1 } }, note: "2 berry juices and a moonberry" },
  moonmint: { name: "Moon mint", hrs: 3, cost: 6, gives: { pantry: { tea: 3 } }, note: "3 moon mint teas: they wake a sleepy glowling right up" },
  cookiecorn: { name: "Starfruit vine", hrs: 4, cost: 12, gives: { pantry: { star: 2 } }, note: "2 starfruits: every glowling's favorite" },
  growcap: { name: "Growcap", hrs: 6, cost: 20, gives: { pantry: { cap: 2 } }, note: "2 growcaps: a big step toward growing up" },
  sunpetal: { name: "Sunpetal", hrs: 8, cost: 35, gives: { sun: 1 }, note: "laid by your next egg, it hatches shiny far more often", ok: () => unlocked(7), how: "reach chapter II" },
  crystalbloom: { name: "Crystal bloom", hrs: 8, cost: 30, gives: { shards: 45 }, note: "45 shards, and now and then a geode" },
  biteleaf: { name: "Biteleaf", hrs: 12, cost: 60, gives: { shards: 30, bar: "star" }, note: "a star bar and 30 shards. It bites", ok: () => unlocked(13), how: "reach chapter III" },
};
const GARDEN_SLOTS = 3, WATER_EVERY = 30 * 60e3, WATER_BOOST = 0.15;
const garden = () => (save.garden = save.garden || { slots: Array(GARDEN_SLOTS).fill(null), seeds: { glowberry: 2, moonmint: 1 } });
/** How far along a plant is, 0 to 1 (watering moves its planting time back a little). */
const growth = q => clamp((Date.now() - q.at) / (SEEDS[q.seed].hrs * 3600e3), 0, 1);
const stageOf2 = q => { const g = growth(q); return g >= 1 ? 3 : g >= 0.5 ? 2 : g >= 0.12 ? 1 : 0; };
/** What the bed shows: each spot's plant and stage (only changes when a stage does, so the picture is cached). */
const gardenView = () => garden().slots.map(q => q ? [q.seed, stageOf2(q)] : null);

/** One plant in pixels, standing on the soil at (x, y): a seed mound, a sprout, a young plant, then the ripe one by kind. */
function gardenPlant(T, x, y, kind, stage, t) {
  x = Math.round(x); y = Math.round(y);
  const u = Math.max(1, t / 16);
  if (stage === 0) { T.px(x, y - 1, IC.w2); T.px(x + 1, y - 1, IC.w2); T.px(x, y - 2, IC.g1); return; }
  const tall = Math.round((stage === 1 ? 3 : stage === 2 ? 6 : 8) * u);
  for (let k = 1; k <= tall; k++) { T.px(x, y - k, k > tall - 2 ? IC.g0 : IC.g1); if (u >= 1.5) T.px(x + 1, y - k, IC.g2); }
  const leaf = (k, side, col) => { for (let j = 1; j <= Math.round(2 * u); j++) T.px(x + (side > 0 ? 1 : 0) + side * j, y - k - Math.floor(j / 2), col); };
  leaf(Math.round(tall * 0.4), -1, IC.g1); leaf(Math.round(tall * 0.6), 1, IC.g2);
  if (stage === 1) return;
  leaf(Math.round(tall * 0.8), -1, IC.g0);
  if (stage === 2) return;
  const top = y - tall;
  if (kind === "glowberry") {
    T.ball(x, top + 1, 2.5 * u, IC.g0, IC.g1, IC.g2);
    for (const [dx, dy] of [[-2, 0], [1, -1], [2, 2], [-1, 2]]) { T.px(x + dx * u, top + dy * u + 1, IC.l2); T.px(x + dx * u, top + dy * u, IC.l1); }
  } else if (kind === "moonmint") {
    for (const s of [-1, 1]) for (let k = 0; k < 3 * u; k++) T.px(x + s * (1 + k), top + 2 - k, IC.b0);
    T.px(x, top - 1, IC.y0); T.px(x + 1, top - 2, IC.y0);
  } else if (kind === "cookiecorn") {
    for (const [dx, dy] of [[-2, 1], [2, 0], [0, -2]]) { T.ball(x + dx * u, top + dy * u, 1.6 * u, IC.w0, IC.w1, IC.w2); T.px(x + dx * u, top + dy * u, IC.w3); }
  } else if (kind === "growcap") {
    // a fat red cap with white spots on a pale stem
    T.ball(x, top + 1, 3 * u, IC.r1, IC.r2, IC.r1);
    for (const [dx, dy] of [[-1.5, 0], [1, -1], [1.8, 1]]) T.px(x + dx * u, top + dy * u, IC.white);
  } else if (kind === "sunpetal") {
    for (let k = 0; k < 8; k++) { const an = k / 8 * Math.PI * 2; T.px(x + Math.cos(an) * 2.6 * u, top + Math.sin(an) * 2.2 * u, IC.y0); T.px(x + Math.cos(an) * 1.7 * u, top + Math.sin(an) * 1.4 * u, IC.y0); }
    T.ball(x, top, 1.3 * u, IC.w3, IC.w2, IC.w3);
  } else if (kind === "crystalbloom") {
    const h = 4 * u;
    T.poly([[x, top - h], [x - 2 * u, top], [x, top + u]], IC.l1); T.poly([[x, top - h], [x + 2 * u, top], [x, top + u]], IC.l3);
    T.px(x - 1, top - h * 0.5, IC.white);
  } else if (kind === "biteleaf") {
    // a trap of two red jaws with white teeth, mouth open toward you
    const w = 3 * u;
    T.poly([[x - w, top - w], [x + w, top - w], [x, top - 1]], IC.r2);
    T.poly([[x - w, top + 1], [x + w, top + 1], [x, top - 1]], IC.r1);
    for (let k = -2; k <= 2; k += 2) { T.px(x + k * u * 0.8, top - 1 - u, IC.white); T.px(x + k * u * 0.8 + u, top, IC.white); }
  }
}
const plantImage = (kind, stage) => isoArt(22, 26, T => { T.poly([[3, 20], [19, 20], [19, 24], [3, 24]], IC.w3); gardenPlant(T, 11, 20, kind, stage, 22); }).toDataURL();
const seedName = id => tr(SEEDS[id].name);

function openGarden() {
  sfx.tick();
  const g = garden(), now = Date.now();
  const slot = (q, i) => {
    if (!q) return `<div class="plot empty"><span class="plot-img">${ic("heart", "off")}</span><b>${tr("Empty")}</b><small>${tr("pick a seed below")}</small></div>`;
    const st = stageOf2(q), left = SEEDS[q.seed].hrs * 3600e3 * (1 - growth(q)), wet = q.wet && now - q.wet < WATER_EVERY;
    return `<div class="plot${st === 3 ? " ripe" : ""}"><img class="plot-img" src="${plantImage(q.seed, st)}" alt=""><b>${seedName(q.seed)}</b><small>${st === 3 ? tr("ready to pick!") : tr("ripe in {0}", fmtLeft(left))}</small>`
      + (st === 3 ? `<button class="act buy" data-pick="${i}">${tr("Pick")}</button>` : `<button class="act" data-water="${i}" ${wet ? "disabled" : ""}>${wet ? tr("watered ✓") : "💧 " + tr("Water")}</button>`) + `</div>`;
  };
  const free = g.slots.findIndex(q => !q);
  $("gardenSub").textContent = tr("What grows here can't be bought anywhere: juice and mint tea, starfruit every glowling loves, growcaps that help them grow up, sunpetals for shiny eggs. Seeds grow in real time, even while you're away; watering helps.");
  $("gardenList").innerHTML = `<div class="plots">${g.slots.map(slot).join("")}</div>${save.sunlit ? `<p class="me-hint">${tr("☀️ ×{0} waiting by your next egg", save.sunlit)}</p>` : ""}<h3>${tr("Seeds")}</h3>` + Object.entries(SEEDS).map(([id, sd]) => {
    const have = g.seeds[id] || 0, locked = sd.ok && !sd.ok();
    return `<div class="snack seed${locked ? " locked" : ""}"><img class="em" src="${plantImage(id, 3)}" alt=""><span><b>${seedName(id)} <em>×${have}</em></b><small>${locked ? ic("lock") + tr(sd.how) : `${tr(sd.note)} · ${tr("{0} h", sd.hrs)}`}</small></span>`
      + `<span class="seed-btns">${have && free >= 0 && !locked ? `<button class="act" data-plant="${id}">${tr("Plant")}</button>` : ""}<button class="act" data-seed="${id}" ${locked || save.shards < sd.cost ? "disabled" : ""}>+1 ✦ ${sd.cost}</button></span></div>`;
  }).join("");
  $$("#gardenList [data-plant]").forEach(b => b.addEventListener("click", () => plantSeed(b.dataset.plant)));
  $$("#gardenList [data-seed]").forEach(b => b.addEventListener("click", () => buySeed(b.dataset.seed)));
  $$("#gardenList [data-water]").forEach(b => b.addEventListener("click", () => waterPlot(Number(b.dataset.water))));
  $$("#gardenList [data-pick]").forEach(b => b.addEventListener("click", () => pickPlot(Number(b.dataset.pick))));
  show("gardenSheet", true);
}
function buySeed(id, then = openGarden) {
  const sd = SEEDS[id], g = garden();
  if (save.shards < sd.cost || (sd.ok && !sd.ok())) return;
  save.shards -= sd.cost; g.seeds[id] = (g.seeds[id] || 0) + 1;
  sfx.tick(); persist(); updateTopbar(); then();
}
function plantSeed(id) {
  const g = garden(), i = g.slots.findIndex(q => !q);
  if (i < 0 || !g.seeds[id]) return;
  g.seeds[id]--; g.slots[i] = { seed: id, at: Date.now() };
  sfx.grain && sfx.ready() && sfx.grain(sfx.ac.currentTime, 0.15, 700, 0.8, 0.15, "lowpass");
  toast(tr("{0} planted 🌱", seedName(id)));
  persist(); openGarden();
}
/** A drink for a plant: it grows a little at once. Once every half hour per plant. */
function waterPlot(i, who) {
  const q = garden().slots[i];
  if (!q || stageOf2(q) === 3 || (q.wet && Date.now() - q.wet < WATER_EVERY)) return false;
  q.at -= SEEDS[q.seed].hrs * 3600e3 * WATER_BOOST; q.wet = Date.now();
  if (!who) { sfx.tone && sfx.ready() && sfx.tone(sfx.ac.currentTime, 1400, 0.05, 0.3, "sine", 900, true); openGarden(); }
  persist();
  return true;
}
function pickPlot(i) {
  const g = garden(), q = g.slots[i];
  if (!q || stageOf2(q) !== 3) return;
  const sd = SEEDS[q.seed], got = [];
  g.slots[i] = null;
  for (const [k, n] of Object.entries(sd.gives.pantry || {})) { save.pantry = { ...save.pantry, [k]: ((save.pantry || {})[k] || 0) + n }; got.push(`${SNACKS[k].emoji}×${n}`); }
  if (sd.gives.shards) { save.shards += sd.gives.shards; got.push(`✦ ${sd.gives.shards}`); }
  if (sd.gives.sun) { save.sunlit = (save.sunlit || 0) + sd.gives.sun; got.push(tr("a sunpetal for your next egg ☀️")); }
  if (sd.gives.bar) { giveBar(sd.gives.bar); got.push(barName(sd.gives.bar)); }
  if (q.seed === "crystalbloom" && Math.random() < 0.3) {
    const k = pick(CRYSTALS.filter(c => c.rarity === "rare")), geo = save.geodes[k.id] || { count: 0, shine: -1 };
    geo.count++; save.geodes[k.id] = geo; got.push(`💎 ${k.name}`);
  }
  // seeds come back now and then, so the garden keeps going
  if (Math.random() < 0.5) { g.seeds[q.seed] = (g.seeds[q.seed] || 0) + 1; got.push(tr("a seed")); }
  bump("harvested"); if (q.seed === "biteleaf") { bump("biteleaf"); sfx.knock(1); buzz([20, 30, 20]); toast(tr("CHOMP! The biteleaf bit you, then let go ✦")); }
  else sfx.shimmer();
  setTimeout(() => toast(tr("Picked: {0}", got.join(" · "))), q.seed === "biteleaf" ? 1400 : 0);
  persist(); updateTopbar(); openGarden();
}
/** Hoppers and swimmers who visit the garden bed water a thirsty plant. */
function gardenHelp(cr) {
  const g = garden(), i = g.slots.findIndex(q => q && stageOf2(q) < 3 && !(q.wet && Date.now() - q.wet < WATER_EVERY));
  if (i >= 0 && waterPlot(i, cr)) toast(tr("{0} watered the {1} 💧", cr.name, seedName(g.slots[i].seed).toLowerCase()));
}

// ---------- Wick, the travelling moth: every third day, outside, with a few wares from the deep and some gossip for free ----------

const WICK_WARES = {
  biteleaf: { name: "Biteleaf seed", note: "the one that bites, no questions asked", cost: 50, icon: () => plantImage("biteleaf", 3), give: () => { garden().seeds.biteleaf = (garden().seeds.biteleaf || 0) + 1; } },
  bloom: { name: "Crystal bloom seeds ×2", note: "grow shards in the garden", cost: 45, icon: () => plantImage("crystalbloom", 3), give: () => { garden().seeds.crystalbloom = (garden().seeds.crystalbloom || 0) + 2; } },
  bundle: { name: "A bundle of seeds", note: "glowberry, moon mint and starfruit, two of each", cost: 30, icon: () => plantImage("glowberry", 3), give: () => { const g = garden().seeds; for (const k of ["glowberry", "moonmint", "cookiecorn"]) g[k] = (g[k] || 0) + 2; } },
  nut: { name: "Nut bar", note: "+3 lantern oil", cost: 40, icon: () => pxIcon("barNut"), give: () => giveBar("nut") },
  star: { name: "Star bar", note: "fills the lantern to the brim", cost: 110, icon: () => pxIcon("barStar"), give: () => giveBar("star") },
  geode: { name: "Mystery geode", note: "a rare or legendary one for your collection", cost: 70, icon: () => mysteryGeode(), give: () => {
    const k = pick(CRYSTALS.filter(c => c.rarity !== "common")), g = save.geodes[k.id] || { count: 0, shine: -1 }, isNew = !g.count;
    g.count++; save.geodes[k.id] = g; toast(isNew ? tr("A new geode for the book: {0} 💎", k.name) : tr("{0} 💎", k.name));
  } },
};
const WICK_GOSSIP = [
  "They say a shiny glowling hums a different note when you pet it.",
  "Mossa snores. Loudly. You didn't hear it from me.",
  "Dorma's library has a book that reads itself. It's very boring.",
  "The deeper the cave, the rarer the stone. And the grumpier.",
  "A biteleaf only bites the ones it likes. Or so I'm told.",
  "Hear a knock that rings higher? Hit there. Trust a moth.",
  "The moon drops more eggs for nests that glow. Keep yours bright.",
];
const dayNo = (d = new Date()) => Math.floor((d - d.getTimezoneOffset() * 60e3) / 864e5);
// the test game can call Wick any day: /staging/?wick
const WICK_TRY = STAGING && /[?&]wick\b/.test(location.search);
/** Is Wick visiting today? (Every third day, once you've met Wick in the story.) */
const wickHere = () => (WICK_TRY || dayNo() % 3 === 0) && (talkSeen("s2") || unlocked(7));
/** Today's wares: three from the pack, the same all day, and what you've already bought. */
function wickToday() {
  const day = dayNo(), r = seeded("wick" + day), pool = Object.keys(WICK_WARES);
  const pickN = []; while (pickN.length < 3) { const k = pool[Math.floor(r() * pool.length)]; if (!pickN.includes(k)) pickN.push(k); }
  if (!save.wick || save.wick.day !== day) save.wick = { day, sold: [] };
  return { wares: pickN, sold: save.wick.sold, gossip: WICK_GOSSIP[Math.floor(r() * WICK_GOSSIP.length)] };
}
/** Where Wick hovers outside: at the front right of the yard, lantern in hand. */
const wickSpot = () => isoAt(0.86, 0.72);
let wickImg = null;
function drawWick() {
  if (!wickImg) { wickImg = new Image(); wickImg.src = pxIcon("wick"); }
  const [x, y] = wickSpot(), s = Math.round(N.base * 0.85 / 18) * 18 || 18, bob = Math.sin(game.time * 0.003) * N.base * 0.06;
  // the lantern's glow, then a shadow, then the moth
  const glow = ctx.createRadialGradient(x, y - s * 0.6 + bob, 2, x, y - s * 0.6 + bob, s * 1.1);
  glow.addColorStop(0, "rgba(255,226,150,.35)"); glow.addColorStop(1, "rgba(255,226,150,0)");
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y - s * 0.6 + bob, s * 1.1, 0, TAU); ctx.fill();
  ctx.fillStyle = "rgba(5,0,20,.3)"; ctx.beginPath(); ctx.ellipse(x, y, s * 0.3, s * 0.08, 0, 0, TAU); ctx.fill();
  ctx.imageSmoothingEnabled = false;
  if (wickImg.complete) ctx.drawImage(wickImg, Math.round(x - s / 2), Math.round(y - s * 1.25 + bob), s, s);
}
const wickAt = (x, y) => { if (!(isOutside() && N.iso && wickHere())) return false; const [wx, wy] = wickSpot(); return Math.hypot(x - wx, y - (wy - N.base * 0.6)) < N.base * 0.55; };
function openWick() {
  sfx.voice(WICK.voice); sfx.tick();
  const t = wickToday(), end = new Date(); end.setHours(24, 0, 0, 0);
  $("wickSub").textContent = tr("Glimmers and gossip, fresh from the deep. Here until midnight ({0} left).", fmtLeft(end - Date.now()));
  $("wickList").innerHTML = t.wares.map(id => {
    const w = WICK_WARES[id], sold = t.sold.includes(id);
    return `<button class="snack" data-ware="${id}" ${sold || save.shards < w.cost ? "disabled" : ""}><img class="em px-thumb" src="${w.icon()}" alt=""><span><b>${tr(w.name)}</b><small>${tr(w.note)}</small></span><span class="cost">${sold ? tr("sold ✓") : `✦ ${w.cost}`}</span></button>`;
  }).join("") + `<p class="wick-gossip"><img src="${pxIcon("wick")}" alt=""><span>“${tr(t.gossip)}”</span></p>`;
  $$("#wickList [data-ware]").forEach(b => b.addEventListener("click", () => buyWare(b.dataset.ware)));
  show("wickSheet", true);
}
function buyWare(id) {
  const w = WICK_WARES[id], t = wickToday();
  if (!w || t.sold.includes(id) || save.shards < w.cost) return;
  save.shards -= w.cost; save.wick.sold.push(id); w.give(); bump("wickBought");
  sfx.levelUp(); toast(tr("Pleasure doing business! ✦ {0}", tr(w.name)));
  persist(); updateTopbar(); openWick();
}

// ---------- expeditions: send a glowling off to a place on the map for a few hours; it comes back with finds and a story ----------

const TRIP_PLACES = [
  { id: "amethyst", theme: "amethyst", ok: () => true, finds: ["geode0", "shards"],
    tales: ["{0} found a purple crystal humming in the dark and hummed back until it stopped.", "{0} got lost in the Amethyst Hollow, then found the way out by following the echo."] },
  { id: "glowcap", theme: "glowcap", ok: () => true, finds: ["seeds", "nut"],
    tales: ["{0} napped under a glowing mushroom and woke up covered in spores. Very sparkly spores.", "{0} chased a firefly all the way round the wood and back."] },
  { id: "celestite", theme: "celestite", ok: () => unlocked(7), finds: ["geode1", "seeds", "shards"],
    tales: ["{0} found a hidden pool in the Celestite Grotto and came back humming.", "{0} counted every blue crystal in the grotto. Twice. Lost count both times."] },
  { id: "malachite", theme: "malachite", ok: () => unlocked(13), finds: ["geode2", "nut", "shards"],
    tales: ["{0} followed the green bands in the Malachite Deep like a map, and they led to a geode.", "{0} met Dorma in a quiet corner of the Deep. They both had a little nap."] },
  { id: "labradorite", theme: "labradorite", ok: () => unlocked(19), finds: ["geode3", "star", "shards"],
    tales: ["{0} saw the Labradorite Vault flash blue and gold, and wouldn't stop talking about it.", "{0} felt the Gloom's cold somewhere deep, turned round and came straight home. Brave."] },
];
const TRIP_HOURS = [1, 4, 8];
const tripPlace = id => TRIP_PLACES.find(t => t.id === id);
const placeName = pl => THEME[pl.theme].name;
/** Who's on an expedition right now. */
const onTrip = () => save.creatures.filter(c => c.trip);
/** Bring back anyone whose expedition is over, with their finds; returns what they said. */
function tripsHome() {
  const now = Date.now(), back = [];
  for (const c of save.creatures) {
    if (!c.trip || now < c.trip.until) continue;
    const pl = tripPlace(c.trip.place) || TRIP_PLACES[0], k = c.trip.hrs, got = [];
    for (const f of pl.finds) {
      if (f.startsWith("geode")) {
        const cave = Number(f.slice(5)), pool = CRYSTALS.filter(x => x.rarity === (Math.random() < 0.15 * k / 4 + cave * 0.05 ? "rare" : "common"));
        if (Math.random() < 0.35 + k * 0.06) { const g = pick(pool), geo = save.geodes[g.id] || { count: 0, shine: -1 }; geo.count++; save.geodes[g.id] = geo; got.push(`💎 ${g.name}`); }
      } else if (f === "shards") { const n = Math.round(6 * k + rand(0, 6 * k)); save.shards += n; got.push(`✦ ${n}`); }
      else if (f === "seeds") { const sd = pick(["glowberry", "moonmint", "cookiecorn"]), n = 1 + Math.floor(k / 4); garden().seeds[sd] = (garden().seeds[sd] || 0) + n; got.push(`${seedName(sd)} ×${n}`); }
      else if (Math.random() < 0.25 + k * 0.08) { giveBar(f); got.push(barName(f)); }
    }
    addXP(c, 6 * k);
    remember(c, got.length ? "Came back from {0} with {1}" : "Came back from {0}", placeName(pl), got.join(", "));
    c.trip = null; c.roam = false; c.outAt = c.outAt || now;
    back.push(tr(pick(pl.tales), c.name) + (got.length ? " " + tr("Brought back: {0}", got.join(" · ")) : ""));
  }
  if (back.length) { settleHome(); persist(); updateTopbar(); }
  return back;
}
function openTrips() {
  sfx.tick();
  const g = game.trip = game.trip || { who: null, place: "amethyst", hrs: 4 };
  const home = save.creatures.filter(c => !c.out && !c.sleeping);
  if (!home.some(c => c.id === g.who)) g.who = home[0]?.id ?? null;
  const now = Date.now(), away = onTrip();
  $("tripsSub").textContent = tr("Send a glowling off to explore. It's away for a while, needs nothing, and comes back by itself with finds and a story. The longer the trip, the more it finds.");
  $("tripsList").innerHTML = (away.length ? `<h3>${tr("Away now")}</h3>` + away.map(c => `<div class="trip-away"><img src="${creatureImage(specOf(c), { art: 20, level: c.level, shiny: c.shiny, acc: c.acc })}" alt=""><span><b>${c.name}</b><small>${placeName(tripPlace(c.trip.place))} · ${tr("back in {0}", fmtLeft(c.trip.until - now))}</small></span></div>`).join("") : "")
    + `<h3>${tr("Who goes")}</h3>` + (home.length ? `<div class="trip-who">${home.map(c => `<button class="res${c.id === g.who ? " on" : ""}" data-who="${c.id}"><img src="${creatureImage(specOf(c), { art: 20, level: c.level, shiny: c.shiny, acc: c.acc })}" alt=""><small>${c.name}</small></button>`).join("")}</div>` : `<p class="me-hint">${tr("Everyone's asleep or away. Wake someone up first.")}</p>`)
    + `<h3>${tr("Where to")}</h3><div class="themes trip-where">${TRIP_PLACES.map(pl => `<button class="theme${pl.id === g.place ? " on" : ""}${pl.ok() ? "" : " locked"}" data-place="${pl.id}" ${pl.ok() ? "" : "disabled"}><img src="${themeThumb(pl.theme)}" alt=""><b>${placeName(pl)}</b><small>${pl.ok() ? pl.finds.map(f => tr(f.startsWith("geode") ? "geodes" : f === "seeds" ? "seeds" : f === "shards" ? "shards" : "bars")).join(", ") : ic("lock") + tr(THEME[pl.theme].how)}</small></button>`).join("")}</div>`
    + `<h3>${tr("How long")}</h3><div class="seg trip-hrs">${TRIP_HOURS.map(h => `<button data-hrs="${h}" class="${h === g.hrs ? "on" : ""}">${tr("{0} h", h)}</button>`).join("")}</div>`
    + `<button class="cta" id="tripGo" ${g.who == null ? "disabled" : ""}>${tr("Send off")}</button>`;
  $$("#tripsList [data-who]").forEach(b => b.addEventListener("click", () => { g.who = Number(b.dataset.who); openTrips(); }));
  $$("#tripsList [data-place]").forEach(b => b.addEventListener("click", () => { g.place = b.dataset.place; openTrips(); }));
  $$("#tripsList [data-hrs]").forEach(b => b.addEventListener("click", () => { g.hrs = Number(b.dataset.hrs); openTrips(); }));
  $("tripGo")?.addEventListener("click", sendTrip);
  show("tripsSheet", true);
}
function sendTrip() {
  const g = game.trip, c = save.creatures.find(x => x.id === g.who), pl = tripPlace(g.place);
  if (!c || c.out || !pl || !pl.ok()) return;
  c.out = true; c.roam = true; c.outAt = Date.now(); c.sleeping = false; c.selfSlept = false;
  c.trip = { place: pl.id, hrs: g.hrs, until: Date.now() + g.hrs * 3600e3 };
  if (save.active === c.id) save.active = residents(save.room)[0]?.id ?? c.id;
  bump("trips"); sfx.chirp(specOf(c).voice * 1.2);
  toast(tr("{0} set off for {1} 🧭 back in {2}", c.name, placeName(pl), tr("{0} h", g.hrs)));
  persist(); syncActors(); renderNest(true); updateTopbar(); openTrips();
}
/** Coming back to the nest: anyone home from a trip tells you about it. */
function tellTrips() {
  const back = tripsHome();
  back.forEach((t, i) => setTimeout(() => toast(t), i * 2800));
}

// ---------- a glowling's own card: its best friend, and a diary of what it has lived through ----------

/** Keep a moment in a glowling's diary (the words are translated when shown, so they follow the language). */
function remember(cr, text, ...args) {
  if (!cr) return;
  cr.mem = [...(cr.mem || []), { t: Date.now(), k: text, a: args }].slice(-40);
}
/** Its best friend: whoever it has met most often, if they still live with you. */
function bestFriend(cr) {
  const best = Object.entries(cr.pals || {}).map(([id, n]) => [save.creatures.find(c => c.id === Number(id)), n]).filter(([c]) => c).sort((p, q) => q[1] - p[1])[0];
  return best ? { c: best[0], n: best[1] } : null;
}
function openGlowling(cr) {
  if (!cr) return;
  sfx.tick(); sfx.chirp(specOf(cr).voice);
  const sp = specOf(cr), bf = bestFriend(cr), mood = { asleep: "asleep", sleepy: "sleepy", hungry: "hungry", sad: "a bit lonely", happy: "happy", ok: "doing fine" }[moodOf(cr)];
  $("glowImg").src = creatureImage(sp, { size: 200, level: cr.level, shiny: cr.shiny, acc: cr.acc });
  $("glowName").textContent = cr.name;
  $("glowInfo").textContent = `${sp.name} · ${tr("Level {0}", cr.level)} · ${STAGES[stageOf(cr.level)]} · ${tr(mood)}`;
  const LOC = LANG === "uk" ? "uk-UA" : "en-US", day = t => new Date(t).toLocaleDateString(LOC, { day: "numeric", month: "short" });
  $("glowMore").innerHTML = `<h3>${tr("Best friend")}</h3>`
    + (bf ? `<div class="trip-away"><img src="${creatureImage(specOf(bf.c), { art: 20, level: bf.c.level, shiny: bf.c.shiny, acc: bf.c.acc })}" alt=""><span><b>${bf.c.name}</b><small>${tr("met {0} times: hugs, tag, duets and naps", bf.n)}</small></span></div>`
      : `<p class="me-hint">${tr("No best friend yet. Glowlings who live in the same room meet and make friends by themselves.")}</p>`)
    + `<h3>${tr("Diary")}</h3>`
    // newest first; the day it hatched closes the list (unless the diary already tells how)
    + `<ul class="diary">${(cr.mem || []).slice().reverse().map(m => `<li><b>${day(m.t)}</b><span>${tr(m.k, ...m.a.map(x => typeof x === "string" ? tr(x) : x))}</span></li>`).join("")}${(cr.mem || []).some(m => /^Hatched/.test(m.k)) ? "" : `<li><b>${day(cr.born)}</b><span>${tr("Hatched and moved in ✦")}</span></li>`}</ul>`;
  show("glowCard", true);
}

// ---------- feedback: your words, plus a few details that help fix things, opened on GitHub for you to check and send ----------

function feedbackInfo() {
  let errs = [];
  try { errs = JSON.parse(localStorage.getItem(ERR_KEY) || "[]"); } catch (e) {}
  return [
    `- ${STAGING ? "test game" : "live game"} · ${LANG} · ${innerWidth}×${innerHeight} @${devicePixelRatio || 1}x${document.body.classList.contains("in-telegram") ? " · Telegram" : ""}`,
    `- ${navigator.userAgent}`,
    `- ${save.creatures.length} glowlings · ${totalStars()} stars · level ${nextLevel() || "all"}`,
    ...(errs.length ? ["", "Recent errors:", ...errs.map(e => `- ${e.t} ${e.where}: ${e.msg}`)] : []),
  ].join("\n");
}
function openFeedback() {
  sfx.tick();
  $("fbText").value = $("fbText").value || "";
  $("fbInfo").textContent = feedbackInfo();
  show("fbSheet", true);
}
function sendFeedback(kind) {
  const words = $("fbText").value.trim();
  if (!words) { $("fbText").focus(); toast(tr("Write a few words first ✎")); return; }
  const title = (kind === "bug" ? "Bug: " : "Idea: ") + words.split("\n")[0].slice(0, 70);
  const body = `${words}\n\n---\n${feedbackInfo()}`;
  window.open(`https://github.com/helavika/hatchstone/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, "_blank", "noopener");
}

/** The buttons that only close their popup become one small ✕ in its corner (their words stay as the label for screen readers). */
function cornerCloses() {
  for (const b of document.querySelectorAll('.overlay .card > button[id$="Close"]')) {
    b.classList.remove("ghost", "cta"); b.classList.add("x-close");
    b.setAttribute("aria-label", tr("Close")); b.title = tr("Close");
    b.removeAttribute("style"); b.textContent = "✕";
    b.parentElement.prepend(b);
  }
}

// ---------- the music box: pick the nest's song from the ones you've unlocked, and play the game's sounds ----------
const JUKE_SOUNDS = [
  { name: "Lullaby", emoji: "🌙", play: () => sfx.lullaby() },
  { name: "Chirp", emoji: "🐣", play: () => sfx.chirp(rand(0.8, 1.3)) },
  { name: "Munch", emoji: "🍪", play: () => sfx.munch() },
  { name: "Shimmer", emoji: "✨", play: () => sfx.shimmer() },
  { name: "Level up", emoji: "⭐", play: () => sfx.levelUp() },
  { name: "Cracking stone", emoji: "🔨", play: () => sfx.crackDone(2) },
  { name: "Knock", emoji: "🪨", play: () => sfx.knock(0.6) },
  { name: "Rare crystal", emoji: "💎", play: () => sfx.burst("rare") },
  { name: "Legendary crystal", emoji: "🌈", play: () => sfx.burst("legendary") },
];
function openJukebox() {
  sfx.tick();
  const cur = save.jukebox || "", open = THEMES.filter(t => t.ok()).length;
  $("jukeSub").textContent = tr("{0} of {1} songs unlocked. Find more by opening new backdrops.", open, THEMES.length);
  const song = (id, img, name, small, ok) => `<button class="snack song${cur === id ? " on" : ""}" data-song="${id}" ${ok ? "" : "disabled"}>${img}<span><b>${name}</b><small>${small}</small></span><span class="cost">${ok ? (cur === id ? "♪" : "") : ic("lock")}</span></button>`;
  $("jukeList").innerHTML = `<h3>${tr("Songs")}</h3>` + song("", `<span class="em">🏞️</span>`, tr("The backdrop's own song"), tr("changes with the backdrop"), true)
    + THEMES.map(t => song(t.id, `<img class="em" src="${themeThumb(t.id)}" alt="">`, t.name, t.ok() ? tr("song") : t.how, t.ok())).join("")
    + `<h3>${tr("Sounds")}</h3><div class="juke-sounds">${JUKE_SOUNDS.map((x, i) => `<button class="pillbtn" data-sound="${i}">${x.emoji} ${tr(x.name)}</button>`).join("")}</div>`;
  $$("#jukeList [data-song]").forEach(b => b.addEventListener("click", () => { save.jukebox = b.dataset.song || null; persist(); openJukebox(); }));
  $$("#jukeList [data-sound]").forEach(b => b.addEventListener("click", () => JUKE_SOUNDS[b.dataset.sound].play()));
  show("jukebox", true);
}
/** While the music box is out, little notes float up from it now and then. */
let noteT = 0;
function musicNotes(dt) {
  const p = N.iso && hasDecor("musicbox") && isoLayout().placed.musicbox;
  if (!p || save.muted || (noteT -= dt) > 0) return;
  noteT = rand(1.1, 1.9);
  const [x, y] = isoPieceAt(p);
  floatText(pick(["♪", "♫", "♪"]), x + rand(-8, 8), y - N.isoW / ISO_G * 1.6, pick(["#fff0b5", "#ffc4da", "#b8e6f5", "#d2bfff"]));
}

/** Accessories in the Decor sheet: each shown on the glowling you've picked; buy once, then any glowling can wear it. */
function accessoryList() {
  const cr = activeCreature();
  if (!cr) return "";
  const owned = save.wardrobe || {};
  return `<p class="sub">${tr("Accessories for {0}: buy once, then any glowling can wear it. Tap to put on or take off.", cr.name)}</p><div class="tiles">` + ACCESSORIES.map(a => {
    const has = owned[a.id], on = cr.acc === a.id;
    const img = `<img class="em px-thumb" src="${creatureImage(specOf(cr), { art: 24, level: cr.level, shiny: cr.shiny, acc: a.id })}" alt="">`;
    return `<button class="tile acc${has ? " owned" : ""}${on ? " placed on" : ""}" data-acc="${a.id}" ${!has && save.shards < a.cost ? "disabled" : ""}>${img}<b>${a.name}</b><small>${on ? tr("worn ✓") : has ? tr("owned") : "✦ " + a.cost}</small></button>`;
  }).join("") + "</div>";
}
function wearAccessory(id) {
  const cr = activeCreature(), a = ACCESSORIES.find(x => x.id === id);
  if (!cr || !a) return;
  save.wardrobe = save.wardrobe || {};
  if (!save.wardrobe[id]) {
    if (save.shards < a.cost) return;
    save.shards -= a.cost; save.wardrobe[id] = true; sfx.levelUp();
  } else sfx.tick();
  cr.acc = cr.acc === id ? null : id;
  const act = actors.get(cr.id);
  if (act && cr.acc) { act.hop = 1; emote(act, "♥", 1.4); }
  if (cr.acc) toast(tr("{0} is wearing the {1} ✦", cr.name, a.name.toLowerCase()));
  persist(); updateTopbar(); renderNest(true); openShop();
}

/** Switch between the straight-on room and the isometric one: everything is laid out again. */
function setView(v) {
  save.view = v === "iso" ? "iso" : "front"; persist(); sfx.tick();
  if (/[?&]view=/.test(location.search)) history.replaceState(null, "", location.pathname + location.hash);
  computeLayout(); actors.clear(); for (const k in roomSprites) delete roomSprites[k];
  syncActors(); renderNest(true); openShop();
}

// ---------- rooms: the nest plus rooms you add, each with its own furniture, layout and backdrop ----------

/** The rooms you can add, in order: each starts on its own backdrop if you have it. */
const ROOM_KINDS = [
  { id: "nest", name: "Nest" },
  { id: "yard", name: "Garden", outdoor: true, place: true },
  { id: "play", name: "Playroom", cost: 250, note: "a bright room for toys and games" },
  { id: "garden", name: "Garden room", cost: 500, theme: "glowcap", note: "moss underfoot, glowcaps overhead" },
  { id: "study", name: "Crystal study", cost: 900, theme: "celestite", note: "quiet, blue and full of crystals" },
  { id: "lab", name: "Laboratory", place: true, theme: "celestite" },
  { id: "shop", name: "Shop", place: true, theme: "abbey" },
  { id: "forge", name: "The Forge", place: true, theme: "malachite" },
  { id: "camp", name: "Explorers' camp", place: true, theme: "glowcap" },
];
/** What each room keeps for itself (the room you're in keeps them in the save as usual; the others are packed away in save.rooms). */
const ROOM_KEYS = ["layout", "cloud", "theme", "jukebox"];
const roomKind = i => ROOM_KINDS.find(k => k.id === save.rooms[i].kind) || ROOM_KINDS[0];
/** Are we outside, in the garden under the sky? */
const isOutside = (i = save.room) => save.rooms[i]?.kind === "yard";
/** The next room you can add (Outside comes free). */
const nextRoomKind = () => ROOM_KINDS.find(k => k.cost && !save.rooms.some(r => r.kind === k.id));
const roomName = i => tr(roomKind(i).name);
/** The incubator lives in the lab; every room has its own bed. */
const incHere = () => save.rooms[save.room]?.kind === "lab";
/** The lab opens once two glowlings could share an egg (or you've already used the incubator). */
const labOk = () => !!save.incubator || save.creatures.some(c => c.sp === "hybrid") || save.creatures.filter(c => c.level >= PAIR_LEVEL).length >= 2;
function ensureLab() { return ensurePlace("lab"); }
/** A place on the map is a room of its own, furnished, with its keeper in it: made the first time you go. */
function ensurePlace(kind) {
  if (save.rooms.some(r => r.kind === kind)) return false;
  return !!save.rooms.push({ kind, on: [], theme: ROOM_KINDS.find(k => k.id === kind).theme });
}
/** Is this room one of the map's places (the shop, the forge, the camp, the lab) rather than a home for glowlings? */
const isPlace = (i = save.room) => !!ROOM_KINDS.find(k => k.id === save.rooms[i]?.kind)?.place;
/** Rooms the arrows step through: homes only, and the garden outside once the map shows it. */
const roomOpen = i => !isPlace(i) && (!isOutside(i) || placeOk("garden"));
function stepRoom(dir) {
  for (let k = 1; k < save.rooms.length; k++) { const i = ((save.room + dir * k) % save.rooms.length + save.rooms.length) % save.rooms.length; if (roomOpen(i)) return i; }
  return save.room;
}
// ---------- the places' keepers: each place on the map has someone who runs it ----------

const TANSY = { name: "Tansy", face: () => pxIcon("tansy"), voice: { f: 330, wave: "triangle", spread: 0.25, glide: 1.05, gain: 0.06, len: 0.06 } };
const EMBER = { name: "Ember", face: () => pxIcon("ember"), voice: { f: 150, wave: "square", spread: 0.18, glide: 0.9, gain: 0.03, len: 0.08 } };
const PIP = { name: "Pip", face: () => pxIcon("pip"), voice: { f: 520, wave: "sine", spread: 0.35, glide: 1.15, gain: 0.07, len: 0.05 } };
const FENNEL = { name: "Fennel", face: () => pxIcon("fennel"), voice: { f: 120, wave: "triangle", spread: 0.1, glide: 0.85, gain: 0.08, len: 0.11 } };
const OLLO = { name: "Ollo", face: () => pxIcon("ollo"), voice: { f: 240, wave: "sine", spread: 0.12, glide: 0.95, gain: 0.08, len: 0.1 } };
const HEROES = {
  shop: { who: TANSY, eyes: [[4, 5, 2, 2, "#efe6ff"], [10, 5, 2, 2, "#efe6ff"]], quirk: "curl", icon: "tansy", at: [0.5, 0.42], role: "keeps the shop", act: [["stall", "Buy", () => openMarket()]],
    hello: ["Welcome, welcome! Mind the sacks, they're full of seeds.", "Food, furniture, seeds: if it's on a shelf, it's for sale.", "Furniture goes into your chest. Food goes into your basket."],
    lines: ["Fresh cookies today. Well, fresh-ish.", "One day I'll sell a hat. Just one. A very good hat.", "Moonberries are flying off the shelf!", "Starfruit? Oh no, that only grows in a garden. Not here.", "A tidy nest is a happy nest, I always say.", "Wick sells odd things. I sell sensible things."] },
  forge: { who: EMBER, eyes: [[5, 3, 2, 2, "#e0634f"], [9, 3, 2, 2, "#e0634f"]], quirk: "sparks", icon: "ember", at: [0.42, 0.6], role: "works the forge", act: [["hammer", "Forge", () => openForge()]],
    hello: ["Hah! Another egg-cracker. Come in, it's warm.", "A better hammer cracks harder stone. Bring shards and I'll make you one.", "And spare geodes? Melt them down at my workbench."],
    lines: ["Hot today. It's always hot today.", "I want to forge a bell that rings in every cave at once. One day.", "The deeper caves have stubborn stone. Sharpen up!", "I once forged a hammer so light it floated off. Never again.", "Tap where it glows. That's the weak spot. Everyone forgets."] },
  camp: { who: PIP, eyes: [[5, 6, 1, 1, "#3d2866"], [10, 6, 1, 1, "#3d2866"]], quirk: "startle", icon: "pip", at: [0.74, 0.5], role: "leads the expeditions", act: [["compass", "Expeditions", () => openTrips()]],
    hello: ["Oh! Hello! I'm Pip, I map the tunnels. Well, I try.", "Send me a glowling and we'll go exploring for a few hours.", "We always come back with something: seeds, shards, the odd geode."],
    lines: ["I've drawn this map three times. The tunnels keep moving.", "Do you think the Gloom has a map? I'd like to see it. From far away.", "Pack a snack. Exploring is hungry work.", "The fire's nice, isn't it? I'm scared of the dark. A bit.", "Somewhere past the moss there's a lake that glows. I'm sure of it."] },
  yard: { who: FENNEL, eyes: [[3, 5, 3, 2, "#57ad6a"], [10, 5, 3, 2, "#57ad6a"]], quirk: "croak", icon: "fennel", at: [0.45, 0.52], role: "tends the garden", act: [["sun", "Garden bed", () => openGarden()]],
    hello: ["Oh. Hello. I was just telling the moon mint a story.", "Plant seeds in the bed, and I'll keep an eye on them. And an ear.", "Some things only grow here: berries for juice, mint for tea, starfruit. No shop can keep them."],
    lines: ["Rain tomorrow, I hope. The leaves like rain. So do I.", "My dream? A garden as big as the grotto. With a pond. For me.", "I sang to the growcaps. They grew. Coincidence? No.", "Shh. The sunpetals are sleeping.", "Slow and steady. Like me. Like seeds.", "Wick visits every third day. Moths love a lantern."] },
  lab: { who: OLLO, eyes: [[3, 5, 3, 2, "#69b7d6"], [9, 5, 3, 2, "#69b7d6"]], quirk: "turn", icon: "ollo", at: [0.55, 0.36], role: "studies glowlings", act: [["heart", "Incubator", () => openIncubator()]],
    hello: ["Hoo. A visitor. I study glowlings: how they glow, and why.", "Two happy glowlings can share an egg in my incubator. The baby mixes them both.", "Stroke the egg to keep it warm. It hatches faster."],
    lines: ["Fascinating. Truly fascinating. Hoo.", "I am writing the great book of glowlings. Chapter one is just you.", "No two mixed eggs are alike. I've checked. Many times.", "Glowlings glow brighter when they're happy. I measured it.", "Please don't touch the green jar."] },
};
const heroHere = () => HEROES[save.rooms[save.room]?.kind] || null;
const heroSpot = () => { const h = heroHere(); return isoAt(h.at[0], h.at[1]); };
const heroImgs = {};
function drawHero() {
  const h = heroHere(), img = heroImgs[h.icon] || (heroImgs[h.icon] = Object.assign(new Image(), { src: pxIcon(h.icon) }));
  const [x, y] = heroSpot(), s = Math.round(N.base * 1.05 / 18) * 18 || 18, t = game.time, me = game.hero && game.hero.room === save.room ? game.hero : null;
  const since = me ? t - me.t : 1e9, jump = me && me.startle ? 0.45 : 0.18;
  const hop = since < 500 ? Math.sin(since / 500 * Math.PI) * s * jump : 0;
  const breathe = 1 + Math.sin(t * 0.004) * 0.03;
  ctx.fillStyle = "rgba(5,0,20,.35)"; ctx.beginPath(); ctx.ellipse(x, y, s * 0.36, s * 0.1, 0, 0, TAU); ctx.fill();
  ctx.imageSmoothingEnabled = false;
  const px = s / 18, left = Math.round(x - s / 2), top = Math.round(y - s * breathe - hop), hgt = Math.round(s * breathe);
  if (me && me.curl && since < 2600) {
    // Tansy, poked once too often: a ball of spines, wobbling
    const wob = Math.sin(t * 0.03) * px, r = s * 0.36;
    ctx.fillStyle = "#5e3a1c"; ctx.beginPath(); ctx.arc(x + wob, y - r, r, 0, TAU); ctx.fill();
    ctx.fillStyle = "#946027";
    for (let k = 0; k < 14; k++) { const an = k / 14 * TAU + 0.2; ctx.fillRect(Math.round(x + wob + Math.cos(an) * r * 1.05 - px), Math.round(y - r + Math.sin(an) * r * 1.05 - px), Math.ceil(px * 2), Math.ceil(px * 2)); }
  } else if (img.complete) {
    // Ollo looks the other way now and then
    const turned = h.quirk === "turn" && Math.sin(t * 0.0011) > 0.75;
    if (turned) { ctx.save(); ctx.translate(left * 2 + s, 0); ctx.scale(-1, 1); }
    ctx.drawImage(img, left, top, s, hgt);
    // a blink every few seconds
    if (t % 3700 < 130) for (const [ex, ey, ew, eh, col] of h.eyes || []) { ctx.fillStyle = col; ctx.fillRect(left + (ex + 1) * px, top + (ey + 1) * px * breathe, ew * px, eh * px * breathe); }
    if (turned) ctx.restore();
    if (me && me.startle && since < 900) { ctx.fillStyle = "#ffe9a8"; ctx.font = `400 ${Math.round(s * 0.5)}px ${PIXEL_FONT}`; ctx.textAlign = "center"; ctx.fillText("!", x + s * 0.45, top - s * 0.05); }
  }
  // what they just said, in a little bubble over their head
  const say = me && since < 4200 ? me.line : "";
  if (say) drawBubble(x, y - s * 1.1 - hop, say, clamp(1 - (since - 3600) / 600, 0, 1));
}
function drawBubble(x, y, text, alpha = 1) {
  const size = Math.round(clamp(N.base * 0.2, 14, 18)), maxW = Math.min(W * 0.7, 260);
  fx.save(); fx.globalAlpha = alpha; fx.font = `400 ${size}px ${PIXEL_FONT}`;
  const words = text.split(" "), rows = [""];
  for (const w of words) { const tryRow = rows[rows.length - 1] ? rows[rows.length - 1] + " " + w : w; if (fx.measureText(tryRow).width > maxW && rows[rows.length - 1]) rows.push(w); else rows[rows.length - 1] = tryRow; }
  const lh = size * 1.1, bw = Math.max(...rows.map(r => fx.measureText(r).width)) + 16, bh = rows.length * lh + 10;
  const bx = clamp(x - bw / 2, 8, W - bw - 8), by = y - bh - 8;
  fx.fillStyle = "#160c26"; fx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
  fx.fillStyle = "#efe6ff"; fx.fillRect(bx, by, bw, bh);
  fx.fillRect(x - 4, by + bh, 8, 4); fx.fillRect(x - 2, by + bh + 4, 4, 3);
  fx.fillStyle = "#160c26"; fx.textAlign = "left"; fx.textBaseline = "top";
  rows.forEach((r, k) => fx.fillText(r, bx + 8, by + 6 + k * lh));
  fx.restore();
}
const heroAt = (x, y) => { if (!heroHere() || !N.iso) return false; const [hx, hy] = heroSpot(); return Math.abs(x - hx) < N.base * 0.55 && y < hy + N.base * 0.15 && y > hy - N.base * 1.2; };
const propAt = (x, y) => Object.values(isoLayout().placed).some(p => PLACE_PROPS.has(p.id) && pieceHits[p.id] && spriteHit(pieceHits[p.id].c, pieceHits[p.id].x, pieceHits[p.id].y, x, y));
// ---------- life in the places: sparks at the forge, embers and fireflies at the camp, bubbles in the lab, dust in the shop's light, butterflies in the garden ----------

const placeLife = { list: [], last: 0 };
const pieceCenter = (id, fx = 0.5, fy = 0.5) => { const h = pieceHits[id]; return h && h.c ? [h.x + h.c.width * PX * fx, h.y + h.c.height * PX * fy] : null; };
/** A shower of sparks from the anvil (Ember's hammer). */
function placeBurst(n) {
  const at = pieceCenter("anvil", 0.45, 0.35); if (!at) return;
  for (let k = 0; k < n; k++) placeLife.list.push({ kind: "spark", x: at[0], y: at[1], vx: rand(-60, 60), vy: rand(-140, -50), t: 0, life: rand(0.5, 0.9) });
}
function drawPlaceLife() {
  const kind = save.rooms[save.room]?.kind, now = game.time, dt = Math.min(0.05, (now - (placeLife.last || now)) / 1000); placeLife.last = now;
  if (placeLife.kind !== kind) { placeLife.kind = kind; placeLife.list = []; }
  const L = placeLife.list, add = p => L.length < 60 && L.push({ t: 0, ...p });
  const P = Math.max(1, Math.round(PX));
  if (kind === "forge") { const m = pieceCenter("furnace", 0.3, 0.55); if (m && Math.random() < 0.18) add({ kind: "spark", x: m[0] + rand(-6, 6), y: m[1], vx: rand(-10, 10), vy: rand(-60, -30), life: rand(0.8, 1.4) }); }
  if (kind === "camp") {
    const f = pieceCenter("campfire", 0.5, 0.6); if (f && Math.random() < 0.15) add({ kind: "ember", x: f[0] + rand(-4, 4), y: f[1], vx: rand(-8, 8), vy: rand(-40, -24), life: rand(1.2, 2.2) });
    if (L.filter(p => p.kind === "fly").length < 6) add({ kind: "fly", x: rand(N.x0, N.x1), y: rand(N.y0 - N.base * 1.5, N.y1), ph: rand(0, TAU), life: 1e9 });
  }
  if (kind === "lab") { const d = pieceCenter("labdesk", rand(0.25, 0.65), 0.25); if (d && Math.random() < 0.06) add({ kind: "bubble", x: d[0], y: d[1], vx: rand(-4, 4), vy: rand(-22, -14), life: rand(1, 1.8) }); }
  if (kind === "shop" && L.length < 22 && Math.random() < 0.08) add({ kind: "mote", x: rand(N.x0, N.x1), y: rand(N.y0 - N.base * 2.5, N.y1 - N.base), vx: rand(-5, 5), vy: rand(-4, 4), life: rand(4, 7) });
  if (kind === "yard" && L.filter(p => p.kind === "butterfly").length < 3) add({ kind: "butterfly", x: rand(N.x0, N.x1), y: rand(N.y0 - N.base, N.y1), ph: rand(0, TAU), col: pick(["#ffc4da", "#fff0b5", "#b8e6f5"]), life: 1e9 });
  ctx.save();
  for (const p of L) {
    p.t += dt;
    if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.kind === "spark") p.vy += 160 * dt; }
    const k = p.t / p.life, a = clamp(Math.min(p.t * 4, 1 - k), 0, 1);
    if (p.kind === "spark") { ctx.fillStyle = k < 0.5 ? "#fff0b5" : "#e0634f"; ctx.globalAlpha = a; ctx.fillRect(Math.round(p.x), Math.round(p.y), P, P); }
    else if (p.kind === "ember") { ctx.fillStyle = k < 0.4 ? "#eec26a" : "#e0634f"; ctx.globalAlpha = a; ctx.fillRect(Math.round(p.x + Math.sin(p.t * 4) * 3), Math.round(p.y), P, P); }
    else if (p.kind === "bubble") { ctx.strokeStyle = "#b8e6f5"; ctx.globalAlpha = a; ctx.lineWidth = 1; ctx.strokeRect(Math.round(p.x), Math.round(p.y), P * 2, P * 2); }
    else if (p.kind === "mote") { ctx.fillStyle = "#fff0b5"; ctx.globalAlpha = a * 0.55; ctx.fillRect(Math.round(p.x), Math.round(p.y), P, P); }
    else if (p.kind === "fly") { const x = p.x + Math.sin(now * 0.0007 + p.ph) * N.base * 0.8, y = p.y + Math.cos(now * 0.0005 + p.ph) * N.base * 0.4; ctx.fillStyle = "#fff0b5"; ctx.globalAlpha = 0.3 + 0.7 * Math.max(0, Math.sin(now * 0.004 + p.ph)); ctx.fillRect(Math.round(x), Math.round(y), P, P); }
    else if (p.kind === "butterfly") {
      const x = p.x + Math.sin(now * 0.0009 + p.ph) * N.base * 1.2, y = p.y + Math.sin(now * 0.0013 + p.ph * 2) * N.base * 0.5 - N.base * 0.3, open = Math.sin(now * 0.025 + p.ph) > 0;
      ctx.globalAlpha = 1; ctx.fillStyle = p.col;
      if (open) { ctx.fillRect(Math.round(x - 2 * P), Math.round(y - P), P * 2, P * 2); ctx.fillRect(Math.round(x + P), Math.round(y - P), P * 2, P * 2); } else { ctx.fillRect(Math.round(x - P), Math.round(y - 2 * P), P, P * 2); ctx.fillRect(Math.round(x + P), Math.round(y - 2 * P), P, P * 2); }
      ctx.fillStyle = "#3a2440"; ctx.fillRect(Math.round(x), Math.round(y - P), P, P * 2);
    }
  }
  ctx.restore();
  placeLife.list = L.filter(p => p.t < p.life);
}
/** Tapping the keeper (or their counter, anvil, fire): a hop, a line, and what they do for you. */
function tapHero(auto = false) {
  const h = heroHere(); if (!h) return;
  for (let k = 0; k < 4; k++) setTimeout(() => sfx.voice(h.who.voice), k * 90);
  const seen = save.heroTalk?.[save.rooms[save.room].kind] || 0;
  let line = tr(seen < h.hello.length ? h.hello[seen] : pick(h.lines));
  save.heroTalk = { ...save.heroTalk, [save.rooms[save.room].kind]: seen + 1 };
  // poked three times in a few seconds, Tansy curls up into a ball
  const prev = game.heroPokes && game.heroPokes.room === save.room ? game.heroPokes.list : [];
  const pokes = auto ? prev : [...prev.filter(p => game.time - p < 4000), game.time];
  game.heroPokes = { room: save.room, list: pokes };
  const curl = h.quirk === "curl" && pokes.length >= 3;
  if (curl) { line = tr("Eep! Too much poking!"); game.heroPokes.list = []; sfx.knock && sfx.knock(0.4); }
  if (h.quirk === "sparks") placeBurst(18);
  if (h.quirk === "croak") setTimeout(() => sfx.voice({ ...h.who.voice, f: 70, len: 0.25 }), 380);
  game.hero = { t: game.time, line, room: save.room, curl, startle: h.quirk === "startle" };
  persist(); renderPlaceBar();
}
/** The bar under a place: who runs it, and the one thing to do there. */
function renderPlaceBar() {
  const h = isPlace() && heroHere(), bar = $("placeBar");
  bar.hidden = !h || game.scene !== "nest";
  if (!h) return;
  $("placeFace").src = pxIcon(h.icon);
  $("placeWho").textContent = tr(h.who.name);
  $("placeRole").textContent = tr(h.role);
  $("placeActs").innerHTML = h.act.map(([icon, name], k) => `<button class="act buy" data-act="${k}">${ic(icon)}${tr(name)}</button>`).join("")
    + `<button class="act" id="placeTalk">${ic("scroll")}${tr("Chat")}</button>`;
  $$("#placeActs [data-act]").forEach(b => b.addEventListener("click", () => { sfx.tick(); h.act[Number(b.dataset.act)][2](); }));
  $("placeTalk").addEventListener("click", () => tapHero());
}
/** Arriving at a place: its keeper says hello. */
function arriveAt(kind) {
  ensurePlace(kind);
  toRoomKind(kind);
  const h = HEROES[kind];
  if (h && !(save.heroTalk || {})[kind]) setTimeout(() => tapHero(true), 500);
  else if (kind === "yard") {
    const g = garden(), dry = g.slots.map((q, i) => [q, i]).filter(([q, i]) => q && waterPlot(i, FENNEL));
    if (dry.length) setTimeout(() => { game.hero = { t: game.time, line: tr("I watered your {0} 💧", dry.map(([q]) => seedName(q.seed).toLowerCase()).join(", ")), room: save.room }; }, 500);
  }
}
/** Which room a decoration stands in, or -1 if it's in storage. */
function decorRoom(id) {
  if (hasDecor(id)) return save.room;
  return save.rooms.findIndex((r, i) => i !== save.room && r.on.includes(id));
}
/** A piece set out here leaves whatever room it stood in before. */
function claimDecor(id) {
  save.rooms.forEach((r, i) => { if (i !== save.room) r.on = r.on.filter(x => x !== id); });
}
function packRoom() {
  const r = save.rooms[save.room];
  r.on = Object.keys(save.decor).filter(hasDecor);
  for (const k of ROOM_KEYS) r[k] = save[k] ?? null;
}
function goRoom(i) {
  i = (i + save.rooms.length) % save.rooms.length;
  if (i === save.room) return;
  if (arrange.on) stopArrange();
  packRoom();
  save.room = i;
  const r = save.rooms[i];
  for (const [id, d] of Object.entries(save.decor)) d.on = r.on.includes(id);
  for (const k of ROOM_KEYS) { if (r[k] == null) delete save[k]; else save[k] = r[k]; }
  isoLayoutCache = null;
  persist();
  // outside is always seen from above: stepping out of a straight-on room lays everything out again
  if ((roomView() === "iso") !== !!N.iso) { computeLayout(); actors.clear(); for (const k in roomSprites) delete roomSprites[k]; }
  [N.bedX, N.bedY] = roomSpot("bed");
  // the room's own glowlings are here; the one you look after is one of them
  syncActors();
  const here = residents(i);
  if (here.length && !here.some(c => c.id === save.active)) save.active = here[0].id;
  // they wander in from the middle of the room
  for (const a of actors.values()) { const [x, y] = roomSpot("rug"); a.x = a.tx = x + rand(-1, 1) * N.base * 0.6; a.y = a.ty = y + rand(-0.5, 0.5) * N.base * 0.3; a.goal = a.friend = a.decor = null; if (a.state !== "sleep") { a.state = "idle"; a.t = rand(0.5, 1.5); } }
  sfx.tick();
  renderNest(true);
  litTabs();
}
/** Light the tab for where you are: outside in the nest scene is the Garden. */
/** Out in one of the map's places (the garden, the lab) rather than at home. */
const awayPlace = () => isOutside() || isPlace();
function litTabs() {
  const out = game.scene === "nest" && awayPlace();
  $$("#tabs [data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === game.scene && !(out && b.dataset.tab === "nest")));
  const onMap = typeof worldOpen === "function" && worldOpen();
  if (onMap) $$("#tabs [data-tab]").forEach(b => b.classList.remove("on"));
  $("worldTab").classList.toggle("on", onMap || out || game.scene === "map");
}
/** The shop's renovation corner: build a new room at home, or make room for one more glowling. */
function marketReno() {
  const next = nextRoomKind(), nu = save.nestUp || 0, cost = NEST_UP_COST[nu];
  return `<p class="me-hint">${tr("Tansy's cousin carves new rooms into the rock: they appear at home, a tap of the arrows away.")}</p>`
    + ROOM_KINDS.filter(k => k.cost).map(k => {
      const built = save.rooms.some(r => r.kind === k.id), soon = !built && next && next.id !== k.id;
      return `<div class="snack seed reno${built ? " built" : ""}"><img class="em reno-img" src="${themeThumb(k.theme || "amethyst")}" alt=""><span><b>${tr(k.name)}</b><small>${tr(k.note)}</small></span><span class="seed-btns">${built ? `<small class="only">${tr("built ✓")}</small>` : soon ? `<small class="only">${ic("lock")}${tr("next after {0}", tr(next.name).toLowerCase())}</small>` : `<button class="act buy" data-build="${k.id}" ${save.shards < k.cost ? "disabled" : ""}>✦ ${k.cost}</button>`}</span></div>`;
    }).join("")
    + `<h3 class="forge-h">${tr("Space at home")}</h3><div class="snack seed reno"><span class="em">${ic("nest", "big")}</span><span><b>${tr("Room for one more")}</b><small>${tr("each room fits {0} glowlings now", homeCap())}</small></span><span class="seed-btns">${cost ? `<button class="act buy" id="nestUp" ${save.shards < cost ? "disabled" : ""}>✦ ${cost}</button>` : `<small class="only">${tr("as roomy as it gets ✦")}</small>`}</span></div>`;
}
function buildRoom(id, quiet = false) {
  const kind = nextRoomKind();
  if (!kind || kind.id !== id || save.shards < kind.cost) return;
  save.shards -= kind.cost;
  save.rooms.push({ kind: kind.id, on: [], theme: kind.theme && THEME[kind.theme].ok() ? kind.theme : null });
  sfx.levelUp(); buzz([12, 30, 12]);
  toast(tr("A new room: {0} ✦ find it at home with the arrows", tr(kind.name)));
  persist(); updateTopbar();
  if (!quiet) openShop();
}
function buyNestUp() {
  const cost = NEST_UP_COST[save.nestUp || 0];
  if (!cost || save.shards < cost) return;
  save.shards -= cost; save.nestUp = (save.nestUp || 0) + 1;
  sfx.levelUp(); toast(tr("The nest grew: {0} glowlings fit at home now ✦", homeCap()));
  settleHome(); persist(); syncActors(); renderNest(true); updateTopbar();
  if (!$("shop").classList.contains("hidden")) openShop();
}

/** Buy a decoration, or tap one you own to put it away or bring it back. */
/** Is there room on the floor for one more of this? (only the isometric room has a limit; wall pieces don't take floor) */
const roomFor = id => !N.iso || !ISO_PLACES[id] || isoSpaceUsed() + ISO_PLACES[id].fw * ISO_PLACES[id].fd <= ISO_CAP;
function buyDecor(id) {
  const d = DECO[id], owned = save.decor[id];
  if (owned) {
    if (!owned.on && !roomFor(id)) { toast(tr("No room on the floor: put something away first")); sfx.tick(); return; }
    owned.on = !owned.on; sfx.tick();
    if (owned.on) claimDecor(id);
  }
  else {
    if (save.shards < d.cost || (d.legend && !legendOk())) return;
    save.shards -= d.cost;
    // bought at the shop: it waits in the chest; bought at home: it goes straight onto the floor if there's room
    const fits = roomFor(id) && !isPlace();
    save.decor[id] = { on: fits, at: Date.now() };
    if (isPlace()) toast(tr("{0} is waiting in your chest ✦", d.name));
    else if (!fits) toast(tr("{0} is in storage: the floor is full. Put something away to place it", d.name));
    taskDone("decor");
    sfx.levelUp();
    if (fits) { claimDecor(id); toast(save.room ? tr("{0} placed in the {1} ✦", d.name, roomName(save.room).toLowerCase()) : tr("{0} placed in the nest ✦", d.name)); }
  }
  persist();
  updateTopbar();
  openShop();
}

function decorSpot(id) { return roomSpot(id); }

/** Below this much energy a glowling can be tucked in. */
const SLEEPY_AT = 60;
function toggleSleep() {
  const cr = activeCreature();
  if (!cr) return;
  applyTime(cr);
  // only a tired glowling goes to bed: a lively one shakes its head
  if (!cr.sleeping && cr.energy >= SLEEPY_AT) { refuseWith(cr, tr("not sleepy yet!")); toast(tr("{0} is full of energy ({1}%). Bedtime comes below {2}%.", cr.name, Math.round(cr.energy), SLEEPY_AT)); return; }
  cr.sleeping = !cr.sleeping;
  cr.selfSlept = false;
  if (cr.sleeping) { sfx.lullaby(); toast(tr("Sweet dreams, {0} 🌙", cr.name)); }
  else { cr.wokeAt = Date.now(); sfx.chirp(specOf(cr).voice); const a = activeActor(); if (a) a.hop = 1; }
  persist();
  renderNest();
}

function heart(x, y) {
  game.hearts.push({ x, y, vx: rand(-20, 20), vy: rand(-70, -40), t: 0, life: rand(1, 1.6), s: rand(8, 13) });
}

function floatText(text, x, y, color = "#fff") {
  game.floaters.push({ text, x, y, color, t: 0 });
}

// ---------- the living nest: every glowling roams the cave room ----------

/** How each kind of glowling likes to spend its time. */
const BEHAVIOR = {
  mothlet: "flutter", honeybop: "flutter", flutterite: "flutter",
  dozeling: "nap", smudgekin: "nap", dreamwisp: "nap", hushowl: "nap",
  skyfin: "swim", ripplet: "swim", bubblequill: "swim", cometail: "swim", auroray: "swim",
  blushbun: "hop", lunaroo: "hop", ringlet: "hop", sproutle: "hop",
  glimmerfox: "curious", ambercub: "curious", mossmew: "curious", nebbit: "curious", cubbet: "curious",
  veilfin: "swim", melonpip: "hop", embermote: "flutter",
  hearthling: "nap", pippom: "hop", tigrell: "curious", gladewing: "flutter",
  petalpuff: "dance", rosettle: "dance", sunnub: "dance", glassling: "dance", prismpip: "dance", swirlhorn: "dance",
};
const ROOM_MAX = 12, ROOM_MAX_PHONE = 8;
const actors = new Map();

// ---------- home and exploring: the nest holds a few at a time, the others are off in the grotto ----------
const homeCap = () => (N.iso ? (W < 520 ? 5 : 8) : H < 700 ? 6 : W < 520 ? ROOM_MAX_PHONE : ROOM_MAX) + (save.nestUp || 0);
/** Making the nest roomier: each step is one more place at home. */
const NEST_UP_COST = [150, 300, 500];
/**
 * Too many for the room: whoever has been home longest goes exploring (never the one you picked, and not a sleeper
 * if it can be helped). Room to spare: the longest-gone explorer comes back. Returns who just left.
 */
function settleHome() {
  const cap = homeCap(), sent = [], homes = save.rooms.map((_, i) => i).filter(i => !isPlace(i));
  // nobody lives in the map's places: anyone filed under one belongs to the nest
  for (const c of save.creatures) if (isPlace(c.room || 0)) c.room = 0;
  for (const r of homes) {
    let home = residents(r);
    while (home.length > cap) {
      const free = home.filter(c => c.id !== save.active), awake = free.filter(c => !c.sleeping);
      const c = (awake.length ? awake : free).sort((p, q) => (p.homeAt || p.born || 0) - (q.homeAt || q.born || 0))[0];
      if (!c) break;
      c.out = true; c.outAt = Date.now(); c.sleeping = false; c.selfSlept = false;
      home = home.filter(h => h !== c); sent.push(c);
    }
  }
  // explorers come back to their own room if it has space, or to any room that has (not the ones you sent out on purpose)
  const away = save.creatures.filter(c => c.out && !c.roam && !c.trip).sort((p, q) => (p.outAt || 0) - (q.outAt || 0));
  for (const c of away) {
    const r = [roomOf(c), ...homes].find(i => !isPlace(i) && residents(i).length < cap);
    if (r === undefined) break;
    exploreFind(c); c.out = false; c.room = r; c.homeAt = Date.now(); c.last = Date.now();
  }
  if (sent.length) { persist(); if (typeof updateTopbar === "function") updateTopbar(); offerSpace(sent); }
  return sent;
}
/** Someone had to go out because home is full: say so, and offer what helps (a new room, more space, or an expedition). */
function offerSpace(sent) {
  if (!save.creatures.length || game.scene !== "nest" || Date.now() - (game.spaceOffer || 0) < 5 * 60e3 || !talkSeen("firstExplore")) return;
  game.spaceOffer = Date.now();
  const next = nextRoomKind(), cost = NEST_UP_COST[save.nestUp || 0];
  $("spaceSub").textContent = tr("{0} went out exploring the grotto: each room fits {1} glowlings.", sent.map(c => c.name).join(", "), homeCap());
  $("spaceActs").innerHTML = (next ? `<button class="act buy" data-space="room" ${save.shards < next.cost ? "disabled" : ""}>${ic("hammer")}${tr("Carve a new room: {0}", tr(next.name).toLowerCase())} · ✦ ${next.cost}</button>` : "")
    + (cost ? `<button class="act" data-space="up" ${save.shards < cost ? "disabled" : ""}>${ic("nest")}${tr("Room for one more")} · ✦ ${cost}</button>` : "")
    + (placeOk("trail") ? `<button class="act" data-space="trip">${ic("compass")}${tr("Send someone on an expedition")}</button>` : "")
    + `<button class="act" data-space="home">${ic("heart")}${tr("Who lives where")}</button>`;
  $$("#spaceActs [data-space]").forEach(b => b.addEventListener("click", () => {
    show("spaceSheet", false);
    const what = b.dataset.space;
    if (what === "room" && next) { buildRoom(next.id, true); settleHome(); syncActors(); renderNest(true); }
    else if (what === "up") buyNestUp();
    else if (what === "trip") openTrips();
    else openHome();
  }));
  // (after whatever someone's saying)
  const when = () => talkNow ? setTimeout(when, 700) : show("spaceSheet", true);
  setTimeout(when, 400);
}
/** Which room a glowling lives in (the nest, if its room is gone), and who lives in a room. */
function roomOf(c) { const r = c.room || 0; return r < save.rooms.length && !isPlace(r) ? r : 0; }
function residents(r) { return save.creatures.filter(c => !c.out && roomOf(c) === r); }
/** Move a glowling to a room (calling it home if it's out): false if that room is full. */
function moveGlowling(id, r) {
  const c = save.creatures.find(c => c.id === id);
  if (!c || (!c.out && roomOf(c) === r)) return false;
  if (residents(r).length >= homeCap()) { toast(tr("No space in the {0}: move someone out first", roomName(r).toLowerCase())); sfx.tick(); return false; }
  const found = c.out && !c.trip ? exploreFind(c) : null;
  c.trip = null;
  c.out = false; c.roam = false; c.room = r; c.homeAt = c.last = Date.now();
  if (r !== save.room && save.active === id) save.active = residents(save.room)[0]?.id ?? id;
  sfx.chirp(specOf(c).voice);
  toast(tr("{0} now lives in the {1} ✦", c.name, roomName(r).toLowerCase()) + findNote(c, found));
  persist(); syncActors(); renderNest(true); updateTopbar();
  return true;
}
/** Send a glowling out exploring on purpose: it stays out until you call it back. */
function sendExploring(id) {
  const c = save.creatures.find(c => c.id === id);
  if (!c || c.out) return false;
  c.out = true; c.roam = true; c.outAt = Date.now(); c.sleeping = false; c.selfSlept = false;
  if (save.active === id) save.active = residents(save.room)[0]?.id ?? id;
  toast(tr("{0} went exploring 🧭 the longer the trip, the more it brings back", c.name));
  persist(); syncActors(); renderNest(true); updateTopbar();
  return true;
}
/**
 * Back from exploring with something found on the way: shards for the time away (a few for a short walk, up to 30
 * for a long trip), and after a long trip, now and then a geode for the collection.
 */
function exploreFind(c) {
  const hrs = (Date.now() - (c.outAt || Date.now())) / 3600e3;
  if (hrs < 0.05) return null;
  const shards = Math.min(30, Math.round(2 + hrs * 4));
  let geode = null;
  if (hrs > 2 && Math.random() < Math.min(0.4, hrs * 0.04)) {
    geode = pick(CRYSTALS.filter(k => k.rarity === (Math.random() < 0.2 ? "rare" : "common")));
    const g = save.geodes[geode.id] || { count: 0, shine: -1 };
    g.count++; save.geodes[geode.id] = g;
  }
  save.shards += shards;
  // the gift shows over its head once it's back in the room
  setTimeout(() => {
    const a = actors.get(c.id);
    if (!a) return;
    const v = actorView(a);
    floatText(`+${shards} ✦${geode ? " 💎" : ""}`, v.x, v.y - v.size * 0.9, "#fff0b5");
    a.hop = 1; sfx.shimmer();
  }, 350);
  return { shards, geode };
}
const findNote = (c, f) => !f ? "" : " · " + (f.geode ? tr("{0} brought back ✦ {1} and a {2} geode!", c.name, f.shards, CRYSTAL[f.geode.id].name) : tr("{0} brought back ✦ {1}", c.name, f.shards));
/** Away for how long, said simply. */
const awayFor = c => { const m = Math.max(1, Math.round((Date.now() - (c.outAt || Date.now())) / 60000)); return m < 60 ? tr("{0} min", m) : tr("{0} h", Math.floor(m / 60)); };

/** Tap an explorer in the row: it comes home (and if the nest is full, someone else heads out). */
function callHome(id) {
  const c = save.creatures.find(c => c.id === id);
  if (!c || !c.out) return;
  const found = exploreFind(c);
  c.out = false; c.roam = false; c.room = save.room; c.homeAt = Date.now(); c.last = Date.now();
  save.active = id;
  const sent = settleHome();
  toast((sent.length ? tr("{0} came home, and {1} went exploring 🧭", c.name, sent[0].name) : tr("{0} came home ✦", c.name)) + findNote(c, found));
  persist(); updateTopbar();
}
/** A glowling's mood in one small icon: what it needs most, or a heart when all is well. */
const MOOD_ICON = { hungry: "cookie", sleepy: "moon", messy: "broom", lonely: "heart" };
function moodIcon(c) { return  c.out ? "" : c.sleeping ? `<i class="mood zz">z</i>` : ic(MOOD_ICON[callOf(c)] || "heart", "mood" + (callOf(c) ? " want" : "")); }
/** Everyone, room by room: drag a glowling onto another room to move it (or onto Exploring to send it off), tap to look after it. */
function openHome() {
  sfx.tick();
  const cap = homeCap(), away = save.creatures.filter(c => c.out);
  $("homeSub").textContent = tr("Each room fits {0} glowlings. Drag one onto another room to move it in, or tap it to look after it.", cap);
  const card = c => `<button class="res${c.out ? " out" : ""}${c.id === save.active ? " on" : ""}" data-id="${c.id}"><img src="${creatureImage(specOf(c), { art: 20, level: c.level, shiny: c.shiny, acc: c.acc })}" alt="" draggable="false"><small>${c.name}</small>${c.trip ? `<small class="away">🧭 ${fmtLeft(Math.max(0, c.trip.until - Date.now()))}</small>` : c.out ? `<small class="away">${awayFor(c)}</small>` : moodIcon(c)}</button>`;
  const zone = (r, title, list, empty) => `<section class="res-zone${r === save.room ? " here" : ""}" data-room="${r}"><h3>${title}</h3><div class="home-grid">${list.map(card).join("") || `<p class="sub">${empty}</p>`}</div></section>`;
  $("homeList").innerHTML = save.rooms.map((_, r) => isPlace(r) ? "" : zone(r, `${roomName(r)} <span>${residents(r).length}/${cap}</span>`, residents(r), tr("empty: drag someone here"))).join("")
    + zone("out", `${tr("Exploring")} <span>${away.length}</span>`, away, tr("drag someone here to send them exploring"))
    + ((save.nestUp || 0) < NEST_UP_COST.length ? `<p class="me-hint">${tr("More space at home: the shop builds it, in Renovation.")}</p>` : "");
  $$("#homeList .res").forEach(b => b.addEventListener("pointerdown", dragResident));
  show("homeSheet", true);
}
/** Pick a glowling up in the residents sheet and drop it on a room; a tap without moving looks after it instead. */
function dragResident(ev) {
  const b = ev.currentTarget, id = Number(b.dataset.id), x0 = ev.clientX, y0 = ev.clientY;
  let ghost = null, over = null;
  b.setPointerCapture(ev.pointerId);
  const move = e => {
    if (!ghost && Math.hypot(e.clientX - x0, e.clientY - y0) < 8) return;
    if (!ghost) { ghost = b.cloneNode(true); ghost.className = "res res-ghost"; document.body.appendChild(ghost); b.classList.add("lifted"); sfx.tick(); buzz(6); }
    ghost.style.left = `${e.clientX}px`; ghost.style.top = `${e.clientY}px`;
    const z = document.elementsFromPoint(e.clientX, e.clientY).find(el => el.classList && el.classList.contains("res-zone"));
    if (z !== over) { over?.classList.remove("drop"); over = z; over?.classList.add("drop"); }
  };
  const up = () => {
    b.removeEventListener("pointermove", move); b.removeEventListener("pointerup", up); b.removeEventListener("pointercancel", up);
    if (!ghost) { tapResident(id); return; }
    ghost.remove(); b.classList.remove("lifted"); over?.classList.remove("drop");
    const r = over && over.dataset.room;
    if (r === "out") sendExploring(id); else if (r != null) moveGlowling(id, Number(r));
    openHome();
  };
  b.addEventListener("pointermove", move); b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
}
/** Tap in the sheet: an explorer comes home to this room; anyone else is picked, and you go to their room. */
function tapResident(id) {
  const c = save.creatures.find(c => c.id === id);
  if (!c) return;
  if (c.out) { if (moveGlowling(id, save.room)) openHome(); return; }
  show("homeSheet", false);
  if (roomOf(c) !== save.room) goRoom(roomOf(c));
  selectCreature(id);
}

/** The glowlings in the room you're in: the ones who live here. */
function roomCreatures() {
  if (settleHome().length && game.scene === "nest") talk("firstExplore", homeCap());
  return residents(save.room);
}

const roomPoint = () => N.iso ? freeFloorPoint() : floorAt(rand(0.08, 0.92), rand(0.05, 0.95));

/** The things you can't stand inside, as flat ellipses on the floor. */
function roomObstacles() {
  const b = N.base, out = [];
  if (N.iso) {
    // every placed piece is an ellipse over its tiles
    for (const p of Object.values(isoLayout().placed)) { if (p.id === "bed") continue; const [x, y] = isoPieceAt(p); out.push({ id: p.id, x, y, rx: N.isoW / ISO_G * Math.max(p.fw, p.fd) * 0.9, ry: N.isoH / ISO_G * Math.max(p.fw, p.fd) * 0.9 }); }
    return out;
  }
  const add = (id, rx, ry) => { const [x, y] = roomSpot(id), k = depthK(y); out.push({ id, x, y, rx: rx * b * k, ry: ry * b * k }); };
  if (incHere()) add("incubator", 0.5, 0.2);
  add("bed", 0.72, 0.24);
  if (hasDecor("lamp")) add("lamp", 0.3, 0.14);
  if (hasDecor("mushrooms")) add("mushrooms", 0.6, 0.2);
  if (hasDecor("cushion")) add("cushion", 0.6, 0.18);
  if (hasDecor("spring")) add("spring", 0.75, 0.22);
  return out;
}
