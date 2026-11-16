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
  if (place) { $("roomLabel").hidden = false; $("roomName").textContent = roomName(save.room); }
  if (!hasAny || place) return;
  applyTime(cr);
  const sp = specOf(cr);
  $("nestName").textContent = cr.name;
  const nr = save.rooms.filter((_, i) => roomOpen(i)).length;
  $("roomLabel").hidden = nr < 2;
  $("roomName").textContent = roomName(save.room);
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
    const fav = id === sp.snack || s.fav, more = [s.all && tr("everyone in the room"), s.energy && `${tr("Sleepiness")} +${s.energy}`, s.xp && tr("+{0} toward growing up", s.xp), fav && tr("favorite!")].filter(Boolean);
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

/** One out of the basket, or bought on the spot: false, with a word about why, when neither can be done. */
function takeSnack(id) {
  const s = SNACKS[id];
  // grown in your garden: free
  if (save.pantry && save.pantry[id] > 0) save.pantry = { ...save.pantry, [id]: save.pantry[id] - 1 };
  else if (s.garden) { toast(tr("That one only grows in the garden 🌱")); return false; }
  else {
    if (save.shards < s.cost) { toast(tr("Not enough shards: crack a geode to earn more ✦")); return false; }
    save.shards -= s.cost;
  }
  return true;
}

function feed(id) {
  const cr = activeCreature(), s = SNACKS[id], sp = specOf(cr);
  show("snacks", false);
  if (s.all) { sprinkle(id); return; }
  if (cr.tummy >= (s.drink ? 97 : 88)) { refuseWith(cr, tr("no thanks, I'm full")); return; }
  if (!takeSnack(id)) return;
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

/** Magic dust isn't fed to one: it settles on the whole room at once, sleepers too, and fills every tummy that has room. Nobody gets drowsy from it. */
function sprinkle(id) {
  const s = SNACKS[id], home = save.creatures.filter(c => actors.has(c.id));
  home.forEach(c => applyTime(c));
  const hungry = home.filter(c => c.tummy < 88);
  if (!hungry.length) { sfx.refuse(); toast(tr("Everyone here has a full tummy already")); return; }
  if (!takeSnack(id)) return;
  sfx.shimmer();
  hungry.forEach((c, i) => {
    c.tummy = clamp(c.tummy + s.tummy, 0, 100);
    c.joy = clamp(c.joy + s.joy, 0, 100);
    addXP(c, 6);
    const a = actors.get(c.id);
    setTimeout(() => {
      const v = actorView(a);
      spawnChips(v.x, v.y - v.size, 10, 0.5, ["#fff0b5", "#ffd27a", "#ffb3d4", "#fff"]);
      if (!c.sleeping) { emote(a, "✨", 1.6); a.hop = 1; }
    }, i * 90);
  });
  setTimeout(() => sfx.munch(), 350);
  bump("fed", hungry.length);
  toast(tr("The dust settles: everyone in the room is fed ✨"));
  updateTopbar();
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
  rug: "pretty", shelf: "pretty", bookcase: "pretty", plant: "pretty", painting: "pretty", bench: "comfort", lamppost: "light", birdbath: "play", drum: "play", blocks: "play", telescope: "pretty", keepjar: "pretty" };
const shopOf = () => (game.shop = game.shop || { mode: "chest", tab: "decor", pick: null });
function openShop() {
  sfx.tick();
  const st = shopOf(), market = st.mode === "market", TABS = market ? MARKET_TABS : SHOP_TABS;
  if (!TABS.some(t => t[0] === st.tab)) st.tab = TABS[0][0];
  $("shop").querySelector("h2").textContent = tr(market ? "Shop" : "Chest");
  $("shopSub").innerHTML = market ? tr("You have {0}. What you buy waits in your chest.", ic("shard") + save.shards) : tr("Everything that's yours. Glowlings visit the things they love.");
  const tabs = `<div class="shop-tabs">${TABS.map(([id, icon, name]) => `<button data-shoptab="${id}" class="${st.tab === id ? "on" : ""}">${ic(icon)}<span>${tr(name)}</span></button>`).join("")}</div>`;
  let body = "";
  if (st.tab === "look") {
    const now = currentTheme();
    body = `<h3>${tr(atHome() ? "Cave mood" : "Backdrop")}</h3><p class="sub">${tr(isOutside() ? "The garden is always under the open sky." : isPlace() ? "This room can take any backdrop you've found." : "Every room at home is a cave: pick its mood.")}</p><div class="themes">${THEMES.filter(t => roomThemes().includes(t.id)).map(t => {
        const ok = t.ok() || t.id === ownTheme();
        const home = atHome() && t.home;
        return `<button class="theme${t.id === now ? " on" : ""}${ok ? "" : " locked"}" data-theme="${t.id}" ${ok ? "" : "disabled"}><img src="${themeThumb(t.id, home)}" alt=""><b>${home || t.name}</b>${ok ? "" : `<small>${ic("lock")}${t.how}</small>`}</button>`;
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
    const items = DECOR.filter(d => market ? !save.decor[d.id] && !d.found : !!save.decor[d.id]);
    const tile = d => {
      const owned = save.decor[d.id], locked = d.legend && !owned && !legendOk();
      const tag = owned ? (owned.on ? tr("placed ✓") : decorRoom(d.id) >= 0 ? tr("in {0}", roomName(decorRoom(d.id))) : tr("stored")) : locked ? ic("lock") : "✦ " + d.cost;
      return `<button class="tile${owned ? " owned" : ""}${owned && owned.on ? " placed" : ""}${d.legend ? " legend" : ""}${locked || (!owned && save.shards < d.cost) ? " dim" : ""}${st.pick === d.id ? " on" : ""}" data-pick="${d.id}">${decorThumb(d)}<b>${d.name}</b><small>${tag}</small></button>`;
    };
    body = (!market ? `<div class="room-head"><span><b>${roomName(save.room)}</b><small>${tr("Room space")} ${used}/${ISO_CAP}</small></span><i class="room-space" style="--k:${Math.min(1, used / ISO_CAP)}"></i><button class="act" id="arrangeOpen">✥ ${tr("Rearrange")}</button></div>` : "")
      + (!items.length ? market ? `<p class="me-hint">${tr("You own everything here ✦")}</p>` : shopEmpty("Nothing here yet: furniture you buy at the shop waits in the chest.", "Nothing here yet: furniture comes from the shop, which opens after level {0}.", "decor") : "")
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
  $("arrangeOpen")?.addEventListener("click", startArrange);
  $$("#shopList [data-bed]").forEach(b => b.addEventListener("click", () => { save.rooms[save.room].bed = b.dataset.bed; persist(); sfx.setDown(); toast(tr("A new bed: {0} ✦", tr(BEDS.find(x => x.id === b.dataset.bed).name))); openShop(); }));
  $$("#shopList [data-build]").forEach(b => b.addEventListener("click", () => buildRoom(b.dataset.build)));
  $("nestUp")?.addEventListener("click", buyNestUp);
  $$("#shopList [data-way]").forEach(b => b.addEventListener("click", () => { const [to, tab] = b.dataset.way.split(":"); show("shop", false); CHEST_WAYS[to].go(tab); }));
  $("giftFromChest")?.addEventListener("click", () => openGift());
  $$("#shopList [data-gift]").forEach(b => b.addEventListener("click", () => openGift(b.dataset.gift)));
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
  const note = locked ? `${ic("lock")}${d.how}` : d.id === "painting" && owned ? tr("Tap it in the room to change the picture") : d.id === "keepjar" ? tr("Every feather and flower from your walks goes into it, and a few of them make something to wear.") : d.legend ? tr("Legendary · plays the songs you've unlocked") : tr("{0} love it", who[0].toUpperCase() + who.slice(1));
  const where = owned && !owned.on && decorRoom(d.id) >= 0 ? ` · ${tr("in {0}", roomName(decorRoom(d.id)))}` : "";
  const inPlace = isPlace(), label = owned ? (inPlace ? tr("In your chest ✓") : owned.on ? tr("Put away") : tr("Place here")) : `${tr("Buy")} ✦ ${d.cost}`;
  box.innerHTML = `${decorThumb(d)}<span><b>${d.name}</b><small>${note}${where}</small></span><button class="act${owned ? "" : " buy"}" id="shopPickGo" ${locked || (!owned && save.shards < d.cost) || (owned && inPlace) ? "disabled" : ""}>${label}</button>`;
  $("shopPickGo").addEventListener("click", () => buyDecor(d.id));
}

// ---------- the map: every place in the world, a tap away (the tab bar keeps only the everyday ones) ----------

const ripePlots = () => (save.garden?.slots || []).filter(q => q && SEEDS[q.seed] && stageOf2(q) === 3).length;
const WORLD = [
  { id: "grotto", name: "Grotto", icon: "grotto", at: [142, 66], note: () => !moonDone() ? tr("today's moon egg 🌙") : wickHere() ? tr("Wick is visiting today") : tr("{0} of {1} stars", totalStars(), LEVELS * 3), call: () => !moonDone() || wickHere(), go: () => arriveAt("grotto") },
  { id: "forge", name: "The Forge", icon: "hammer", at: [138, 160], ok: () => unlocked(4) || Object.keys(save.forge || {}).length > 0, how: () => tr("clear level {0}", 3), note: () => canForge() ? tr("upgrade ready") : tr("hammers and the workbench"), call: canForge, go: () => arriveAt("forge") },
  { id: "nest", name: "Nest", icon: "nest", at: [246, 64], note: () => tr("{0} glowlings at home", save.creatures.filter(c => !c.trip).length), go: () => toRoomKind("nest") },
  { id: "lab", name: "Laboratory", icon: "flask", at: [266, 172], ok: () => labOk(), how: () => tr("grow two glowlings to level {0}", PAIR_LEVEL), note: () => !save.incubator ? tr("the incubator: a mixed egg") : Date.now() >= save.incubator.due ? tr("the egg is ready! ✦") : tr("hatches in {0}", fmtLeft(save.incubator.due - Date.now())), call: () => !!save.incubator && Date.now() >= save.incubator.due, go: () => arriveAt("lab") },
  { id: "shop", name: "Shop", icon: "stall", at: [250, 256], ok: () => unlocked(2), how: () => tr("clear level {0}", 1), note: () => tr("food, furniture, seeds"), go: () => arriveAt("shop") },
  { id: "garden", name: "Garden", icon: "sun", at: [172, 238], ok: () => unlocked(3) || !!save.garden, how: () => tr("clear level {0}", 2), note: () => ripePlots() ? tr("ripe: {0} 🌱", ripePlots()) : tr("grows what no shop sells"), call: () => ripePlots() > 0, go: () => arriveAt("yard") },
  { id: "trail", name: "Expeditions", icon: "compass", at: [276, 318], ok: () => unlocked(6) || onTrip().length > 0, how: () => tr("clear level {0}", 5), note: () => onTrip().length ? tr("{0} away exploring", onTrip().length) : tr("send a glowling exploring"), go: () => arriveAt("camp") },
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
function openMarket(tab) { const st = shopOf(); if (st.mode !== "market" || tab) { st.mode = "market"; st.tab = tab || "food"; st.pick = null; } if (game.scene !== "nest") setScene("nest"); openShop(); }
/** The ways out of an empty shelf, each to where such things come from; `ok` says whether that place is open yet. */
const CHEST_WAYS = {
  shop: { icon: "stall", name: () => tr("To the shop"), ok: () => placeOk("shop"), go: tab => { arriveAt("shop"); openMarket(tab); } },
  walk: { icon: "walk", name: () => tr("A walk outside"), ok: () => walkWho().length > 0, go: () => openWalk() },
  tasks: { icon: "tasks", name: () => tasksName(), ok: () => true, go: () => openTasks() },
  egg: { icon: "egg", name: () => tr(save.creatures.length ? "Crack the next egg" : "Crack your first egg"), ok: () => true, go: () => startLevel(nextLevel() || 1) },
};
/** The button for one of those ways ("shop:seeds" opens the shop at its seeds); nothing while the place is still closed. */
function chestWay(way) {
  const w = CHEST_WAYS[way.split(":")[0]];
  return w.ok() ? `<button class="act" data-way="${way}">${ic(w.icon)}${w.name()}</button>` : "";
}
/** An empty shelf: the chest standing open, a line on where such things come from, and the button that goes there. */
const chestEmpty = (line, way) => `<div class="chest-empty"><img src="${pxIcon("chestOpen")}" alt=""><p>${line}</p>${chestWay(way)}</div>`;
// what the shop sells, while the shop is still closed: the way to it is through the grotto
const shopEmpty = (line, early, tab) => placeOk("shop") ? chestEmpty(tr(line), "shop:" + tab) : chestEmpty(tr(early, 1), "egg");
function buyFood(id, n = 1) {
  const s = SNACKS[id];
  if (!s || s.garden || save.shards < s.cost * n) return;
  save.shards -= s.cost * n; save.pantry = { ...save.pantry, [id]: ((save.pantry || {})[id] || 0) + n };
  sfx.coin(); persist(); updateTopbar(); openShop();
}
function marketFood() {
  const pantry = save.pantry || {}, row = ([id, s]) => {
    const more = [`${tr("Hunger")} +${s.tummy}`, s.all && tr("everyone in the room"), s.energy && `${tr("Sleepiness")} +${s.energy}`, s.xp && tr("+{0} toward growing up", s.xp), s.fav && tr("favorite!")].filter(Boolean).join(" · ");
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
  const chip = (img, name, n, gift) => gift ? `<button class="tile owned" data-gift="${gift}" title="${tr("Send as a gift")}">${img}<b>${name}</b><small>×${n}</small></button>` : `<div class="tile owned">${img}<b>${name}</b><small>×${n}</small></div>`;
  const treasures = bars.length || save.sunlit || (save.charms || []).length;
  const empty = (t, way) => `<p class="me-hint shelf-empty"><span>${t}</span>${way ? chestWay(way) : ""}</p>`;
  const gift = `<button class="act gift-entry" id="giftFromChest">${ic("gift")}${tr("Send a gift")}</button>`;
  // not a thing on any shelf: one open chest instead of four bare shelves
  if (!pantry.length && !seeds.length && !treasures && !KEEPSAKES.some(k => save.walks.found[k.id]))
    return gift + shopEmpty("The pantry is bare: food and seeds come from the shop.", "The pantry is bare: food and seeds come from the shop, which opens after level {0}.", "food");
  return gift + `<p class="me-hint">${tr("Tap food or seeds to wrap them for a friend 🎁")}</p>`
    + `<h3 class="forge-h">${tr("Food")}</h3>` + (pantry.length ? `<div class="tiles">${pantry.map(([id, n]) => chip(`<span class="em">${SNACKS[id].emoji}</span>`, SNACKS[id].name, n, "snack:" + id)).join("")}</div>${empty(tr("Feed it from the snack button in the nest."))}` : empty(tr("The basket is empty. Buy food at the shop, or grow it in the garden."), "shop:food"))
    + `<h3 class="forge-h">${tr("Seeds")}</h3>` + (seeds.length ? `<div class="tiles">${seeds.map(([id, n]) => chip(`<img class="em" src="${plantImage(id, 3)}" alt="">`, seedName(id), n, "seed:" + id)).join("")}</div>` : empty(tr("No seeds. The shop has them, and expeditions bring some back."), "shop:seeds"))
    + chestKeepsakes()
    + `<h3 class="forge-h">${tr("Treasures")}</h3>` + (treasures ? `<div class="tiles">${bars.map(([id, n]) => chip(`<img class="em px-thumb" src="${pxIcon(BARS[id].icon || "bar" + id[0].toUpperCase() + id.slice(1))}" alt="">`, barName(id), n)).join("")}${save.sunlit ? chip(`<span class="em">☀️</span>`, tr("Sunpetal"), save.sunlit) : ""}${giftCharmTiles()}</div>` : empty(tr("Nothing yet: bars for the lantern come from daily tasks and moon eggs, sunpetals from the garden."), "tasks"));
}
/** The chest's keepsakes: every kind of feather and flower found on walks, how many, and how many kinds there are to find. */
function chestKeepsakes() {
  const f = save.walks.found, jar = jarOf(save.walks), have = KEEPSAKES.filter(k => f[k.id]);
  return `<h3 class="forge-h">${tr("Keepsakes")} <small>${tr("{0} of {1} kinds found", have.length, KEEPSAKES.length)}</small></h3>`
    + (have.length ? `<div class="tiles">${have.map(k => `<div class="tile owned"><img class="em px-thumb" src="${pxIcon("ks_" + k.id)}" alt=""><b>${tr(k.name)}</b><small>×${jar[k.id] || 0}</small></div>`).join("")}</div><p class="me-hint">${tr("Every feather and flower from your walks goes into the keepsake jar: set it out in a room, or make something to wear from them under Wear.")}</p>`
      : `<p class="me-hint shelf-empty"><span>${tr("Feathers and flowers from your walks will be kept here.")}</span>${chestWay("walk")}</p>`);
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
const GARDEN_SLOTS = 3, PLOT_BOND = 3, WATER_EVERY = 30 * 60e3, WATER_BOOST = 0.15;
/** How many plots the bed has: three, and a fourth once Fennel has dug it (the thanks for his third wish, see the errands). */
const gardenSlots = () => GARDEN_SLOTS + (bondOf("yard") >= PLOT_BOND ? 1 : 0);
/** The garden in the save, its bed as long as it should be: a short bed gains empty plots; a long one only ever loses empty ones from its end, never a plant. */
function garden() {
  const g = save.garden = save.garden || { slots: Array(GARDEN_SLOTS).fill(null), seeds: { glowberry: 2, moonmint: 1 } }, n = gardenSlots();
  if (!Array.isArray(g.slots)) g.slots = [];
  while (g.slots.length < n) g.slots.push(null);
  while (g.slots.length > n && !g.slots[g.slots.length - 1]) g.slots.pop();
  return g;
}
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
  $("gardenList").innerHTML = `<div class="plots${g.slots.length > GARDEN_SLOTS ? " four" : ""}">${g.slots.map(slot).join("")}</div>${save.sunlit ? `<p class="me-hint">${tr("☀️ ×{0} waiting by your next egg", save.sunlit)}</p>` : ""}<h3>${tr("Seeds")}</h3>` + Object.entries(SEEDS).map(([id, sd]) => {
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
  sfx.coin(); persist(); updateTopbar(); then();
}
function plantSeed(id) {
  const g = garden(), i = g.slots.findIndex(q => !q);
  if (i < 0 || !g.seeds[id]) return;
  g.seeds[id]--; g.slots[i] = { seed: id, at: Date.now() };
  sfx.grain && sfx.ready() && sfx.grain(sfx.ac.currentTime, 0.15, 700, 0.8, 0.15, "lowpass");
  toast(tr("{0} planted 🌱", seedName(id)));
  habitXP("ritual");
  persist(); openGarden();
}
/** A drink for a plant: it grows a little at once. Once every half hour per plant. */
function waterPlot(i, who) {
  const q = garden().slots[i];
  if (!q || stageOf2(q) === 3 || (q.wet && Date.now() - q.wet < WATER_EVERY)) return false;
  q.at -= SEEDS[q.seed].hrs * 3600e3 * WATER_BOOST; q.wet = Date.now();
  if (!who) { sfx.pour(); habitXP("ritual"); openGarden(); }
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
  persist(); updateTopbar(); openGarden(); renderPlaceBar();
}
/** Hoppers and swimmers who visit the garden bed water a thirsty plant. */
function gardenHelp(cr) {
  const g = garden(), i = g.slots.findIndex(q => q && stageOf2(q) < 3 && !(q.wet && Date.now() - q.wet < WATER_EVERY));
  if (i >= 0 && waterPlot(i, cr)) toast(tr("{0} watered the {1} 💧", cr.name, seedName(g.slots[i].seed).toLowerCase()));
}

// ---------- Wick, the lantern moth: every third day he comes to the grotto's hall to top up its lanterns, with a few wares and some gossip for free ----------

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
  "A shiny glowling hums a different note when you pet it. I… listen, that's all.",
  "Mossa snores. Softly. Please don't tell her I said.",
  "Dorma has a book that reads itself. It's very boring. I read along anyway.",
  "Deeper cave, rarer stone. Grumpier, too. I'd be grumpy, so far down.",
  "A biteleaf only bites the ones it likes. It's… never bitten me.",
  "If a knock rings deep, hit there. Moths listen closely. It's… what we do.",
  "The moon leaves more eggs by nests that glow. Keep yours bright, if you can.",
];
/** One more, for those who have found the isle and its lighthouse (where he lives, though he'd rather not say so outright). */
const WICK_HOME = "A lighthouse is only a very big lantern. Someone still has to fill it. Every night.";
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
  const tales = wardFound("isle") ? [...WICK_GOSSIP, WICK_HOME] : WICK_GOSSIP;
  return { wares: pickN, sold: save.wick.sold, gossip: tales[Math.floor(r() * tales.length)] };
}
/** Wick's place when he visits: the grotto's hall, on the bench by the wall, where he tops up the hall's lanterns. */
const wickRoom = () => save.rooms[save.room]?.kind === "grotto";
/** The bench's seat, shared by its picture (ISO_ART.wickbench) and by whoever sits on it: u its middle line in tiles from the wall, v0 where it starts along the wall
 *  (tiles from the back of its footprint) and len how long it is, z its height in tile widths. */
const WICK_SEAT = { u: 0.39, v0: 0.56, len: 1.74, z: 0.36 };
/** A point on the seat's middle line, on screen and on the room's pixel grid: v tiles along the bench from its back end. */
function wickSeat(v) {
  v += WICK_SEAT.v0;
  const p = isoLayout().placed.wickbench, tw = N.isoW / ISO_G / PX, U = tw / 2, [bx, by] = isoAt(p.i / ISO_G, p.j / ISO_G);
  return [Math.round(bx / PX + (2 * WICK_SEAT.u - 2 * v) * U) * PX, Math.round(by / PX + (WICK_SEAT.u + v) * U - Math.round(tw * WICK_SEAT.z)) * PX];
}
let wickImg = null;
/**
 * Wick on his bench, drawn by hand at the room's own pixel size like the keepers (one of his pixels to one of the room's):
 * a seated moth in layers, turned three-quarters so his back is to the wall and he faces into the room, '.' see-through;
 * his soft shadow on the plank; and the brass lantern he tends. (ax, seat) is the point of his picture on the seat's middle
 * line, tap the box round him that a fingertip may hit (designs/wick/v3/seat.py draws all of it).
 */
const WICK_NATIVE = {
  w: 44, h: 48, pal: {"B": "#5e3a1c", "W": "#ffffff", "b": "#946027", "c": "#f7d98a", "d": "#3a2238", "f": "#ffb54a", "g": "#eec26a", "h": "#fff0b5", "k": "#160c26", "o": "#c98f3a", "r": "#e88bb1", "z": "#160c26a0"},
  // his shadow on the plank (see-through ink)
  shadow: "............................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................zzzz.....................................zzzzzzz...................................zzzzzzzzz.................................zzzzzzzzzz................................zzzzzzzzzz................................zzzzzzzzzzz................................zzzzzzzzzz.................................zzzzzzzzz..................................zzzzzzzz....................................zzzzzz......................................zz........................................................................................................................................................................................................................................................",
  // the wings behind his back, towards the wall: folded, half open, open
  wings: [
    "..............................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................kkkk.......................................kBBBBk.....................................kBoobBk.....................................kBooobBk...................................kBooobbBk...................................kBooobbBk...................................kBoooobbBk.................................kBboooobbBk.................................kBboooobBkk.................................kBbooobbBkk.................................kBbbobbbBkk.................................kBbbbbbBk...................................kBbbbbbBk...................................kBbbbbBk....................................kBbbbbBk....................................kBbbbBk......................................kBbBk.......................................kBBk.........................................kk..........................................................................................................................................................................................................................................................................................................................................................................................................................................",
    ".....................................................................................................................................................................................................................................................................................................kkk........................................kBBBk......................................kBbbbBk.....................................kBbbbBk....................................kBbhhbBk....................................kBhddhbBk..................................kBBhddhbBk..................................kBoohhbbBk..................................kBoooobBk...................................kBoooobBk..................................kBoooobbBk..................................kBoooobbBk..................................kBbooobBk...................................kBboobbBk.........................kk........kBbbbbbBk.......................kkBBk........kBbbbBk.......................kBBbbBk.......kBBBBk.......................kBooobbBk.......kkkk.......................kBoooobbBk.................................kBooooobBk.................................kBooooobbBk................................kBboooobbbBk...............................kBboooobbbBk................................kBbhhobbbBk................................kBbhddhbbBk.................................kBbhddhbBk..................................kBbbhhbBk...................................kBbbbBBk.....................................kBBBkk.......................................kkk...................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................",
    ".............................................................................................................................................................................................................................................................................................................................................................................................................................................................................................kkkk.....................................kkkBBBBk...................................kBBBbbbBk.................................kkBbbhhbbBk................................kBBoohddhbBk...............................kBoooohddhbBk..............................kBoooooohhbBk..............................kBoooooobbbBk...............................kBooooobbbBk...............................kBooooobbbBk.................kkkkkk.........kBboobbbbBk...............kkkBBBBBBk.......kBbbbbbbBBk..............kkBBoooobbBk........kBbbbBBkk.............kkBBoooooobbbBk........kBBBkk..............kBBooooooobbbBk..........kkk...............kBbooooooobbbbBk...........................kBbbhhooobbbbBBk...........................kBbbhddhbbbbbBkk............................kBbbhddhbbbBBk..............................kBbbbhhbBBBkk................................kBBBBBBkkk...................................kkkkkk....................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................",
  ],
  // antennae, head, ruff, the seated body and legs over the plank's edge: eyes open, eyes shut
  body: "....................................................................................................................................................oooo........oooo............................g.g.o......o.g.g............................g.g.go....og.g.g................................g.okko.g.....................................kohhok...................................kkkhhhhhkk.................................khhhhhhhhhhk...............................khhhhhhhhhhhhk.............................khhhhhhhhhhhhhck............................khhhhhhhhhhhhhck............................khhhhhhhhhhhhcck............................khhhhWkkhhhWkcck............................khhhhkkkhhhkkcck............................khhhhkddhhhkdcck............................khhrrhhhBhBccrrk.............................khhhhhhhBcccck.............................kkkhhcccccccck.............................khhhhhhhhhhhhcck...........................khhhhhhhhhhhhccggk..........................khhhhhhhhhhhccgggk...........................khhhhhhhcccggggk............................khhcccccgggggggk.............................kcocooggoggkgk.............................kcocoocoogoook..............................kccccccgggoook..............................kcccccggggoook..............................kccccggggooook..............................kcccgggggooook..............................kcgooooooooook..............................kooggggooocckk..............................kgggggoooccccckkk............................kooooooocccgggggkkk..........................kohhoooggggggggoook.........................khhhhhhooooggoooook.........................khhhhhhhccgoooooook.........................khhhhhcccggggkooook..........................kkccccggggggkkkcgk............................kkkkggggggk..kcgk...............................kkkgghk..kcgkk.................................khck..kbbbbk................................khcck..kBBBk.................................khbbk..kkk..................................kbBBbk.......................................kBBk.........................................kk.............",
  blink: "....................................................................................................................................................oooo........oooo............................g.g.o......o.g.g............................g.g.go....og.g.g................................g.okko.g.....................................kohhok...................................kkkhhhhhkk.................................khhhhhhhhhhk...............................khhhhhhhhhhhhk.............................khhhhhhhhhhhhhck............................khhhhhhhhhhhhhck............................khhhhhhhhhhhhcck............................khhhhhhhhhhhhcck............................khhhhhhhhhhhhcck............................khhhhBBBhhhBBcck............................khhrrhhhBhBccrrk.............................khhhhhhhBcccck.............................kkkhhcccccccck.............................khhhhhhhhhhhhcck...........................khhhhhhhhhhhhccggk..........................khhhhhhhhhhhccgggk...........................khhhhhhhcccggggk............................khhcccccgggggggk.............................kcocooggoggkgk.............................kcocoocoogoook..............................kccccccgggoook..............................kcccccggggoook..............................kccccggggooook..............................kcccgggggooook..............................kcgooooooooook..............................kooggggooocckk..............................kgggggoooccccckkk............................kooooooocccgggggkkk..........................kohhoooggggggggoook.........................khhhhhhooooggoooook.........................khhhhhhhccgoooooook.........................khhhhhcccggggkooook..........................kkccccggggggkkkcgk............................kkkkggggggk..kcgk...............................kkkgghk..kcgkk.................................khck..kbbbbk................................khcck..kBBBk.................................khbbk..kkk..................................kbBBbk.......................................kBBk.........................................kk.............",
  // the paws, drawn over the lantern in his lap
  arms: {
    hold: "..................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................kk................................kk.......kcck..............................khhk......kggk..............................kcck.......kk................................kk........k.............................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................",
    rest: "...........................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................kk.........................................kcck.....................................kk.kggk....................................khhk.kk.....................................kcck.........................................kk...........................................................................................................................................................................................................................................................................................................................................................................................................................................................................",
    rubA: "...................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................kkkkk......................................kWWkcck...............................kk....kWWkggk..............................khhk....kkkkk...............................kcck.........................................kk......................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................",
    rubB: "....................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................kk.....kkkkk...............................khhk...kWWkcck..............................kcck...kWWkggk...............................kk.....kkkkk............................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................",
    reach: ".....................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................k..........................................kgk........................................kccgk.......................................kcgk.......................................kccgk.......................................kccgk.......................................kcgk.......................................kccgk.......................................kkkk........................................khhk..........kk............................kcck.........kcck............................kk..........kggk.........................................kk...............................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................",
  },
  // the lantern (8 wide): cold, burning low, lit, and the moment it catches
  lamp: {
    dark: "..kook...kokkok..kggook.kggooookkbBdddbkkbBdddbkkbddddbkkbddddbkkooobbbk.kkkkkk.",
    low: "..kook...kokkok..kggook.kggooookkbBBBBbkkbBBBBbkkbBffBbkkboffobkkooobbbk.kkkkkk.",
    lit: "..kook...kokkok..kggook.kggooookkohhhhokkohWWhokkofWWfokkoffffokkooobbbk.kkkkkk.",
    spark: "..kook...kokkok..kggook.kggooookkoWWWWokkoWWWWokkoWWWWokkohhhhokkooobbbk.kkkkkk.",
  },
  lampW: 8, lap: [22, 28], seat: 37, ax: 22, at: 0.3, row: 0.92, tap: [9, 1, 39, 49],
};
/** One of Wick's pictures, S canvas pixels to each of his (wickImg keeps every one once it's built). */
function wickStamp(key, w, h, S, layers) {
  key += "|" + S; wickImg = wickImg || {};
  if (wickImg[key]) return wickImg[key];
  const c = document.createElement("canvas"); c.width = w * S; c.height = h * S; const g = c.getContext("2d");
  for (const [px, lw, ox, oy] of layers) for (let i = 0; i < px.length; i++) { const ch = px[i]; if (ch === ".") continue; g.fillStyle = WICK_NATIVE.pal[ch]; g.fillRect((ox + i % lw) * S, (oy + Math.floor(i / lw)) * S, S, S); }
  return wickImg[key] = c;
}
/** A frame of Wick: wings (0 folded, 1 half open, 2 open), eyes open or shut, what his paws do, and the lantern in his lap (or none). */
function wickFrame(wing, blink, pose, lap, S) {
  const k = WICK_NATIVE;
  return wickStamp(`${wing}|${blink ? 1 : 0}|${pose}|${lap || ""}`, k.w, k.h, S, [[k.shadow, k.w, 0, 0], [k.wings[wing], k.w, 0, 0], [blink ? k.blink : k.body, k.w, 0, 0], ...(lap ? [[k.lamp[lap], k.lampW, k.lap[0], k.lap[1]]] : []), [k.arms[pose], k.w, 0, 0]]);
}
const wickLamp = (state, S) => wickStamp("lamp" + state, WICK_NATIVE.lampW, WICK_NATIVE.lamp[state].length / WICK_NATIVE.lampW, S, [[WICK_NATIVE.lamp[state], WICK_NATIVE.lampW, 0, 0]]);
/** One lantern's turn in his paws, ms. */
const WICK_TURN = 5600;
/** What Wick is doing ms into a lantern's turn: [his paws, the lantern in his lap, the lantern on its way between the bench and his lap]. */
function wickMoment(ms) {
  if (ms < 220) return ["reach", null, "dark"];                                        // he takes the burnt-out one from the row
  if (ms < 1300) return ["hold", "dark", null];
  if (ms < 2900) return [Math.floor(ms / 200) % 2 ? "rubB" : "rubA", "dark", null];    // wipes its glass
  if (ms < 3300) return ["hold", "dark", null];
  if (ms < 3450) return ["hold", "spark", null];                                       // it catches
  if (ms < 4900) return ["hold", "lit", null];                                         // he looks at it a while
  if (ms < 5120) return ["reach", null, "lit"];                                        // and sets it back in the row
  return [ms < 5250 ? "reach" : "rest", null, null];
}
/** Where Wick sits (his sprite's top left corner) and how big one of his pixels is on screen. */
function wickBox() {
  const k = WICK_NATIVE, S = Math.max(1, Math.floor(Math.round(N.base * 1.55 / PX) / 104 + 0.2)), u = S * PX, [x, y] = wickSeat(k.at);
  return { S, u, left: x - k.ax * u, top: y - k.seat * u };
}
/** The bench's lanterns and, on his days, Wick at work on them (drawn right after the bench itself). */
function drawWick() {
  const k = WICK_NATIVE, { S, u, left, top } = wickBox(), t = game.time, here = wickHere(), busy = here && !opts().calm;
  const turn = Math.floor(t / WICK_TURN), ms = t % WICK_TURN, [pose, lap, fly] = busy ? wickMoment(ms) : ["hold", "lit", null];
  // three lanterns stand in a row down the bench; each burns low and goes out just as its turn comes round again
  // ("less motion": he sits with a lit one and only blinks; on his days off one burns on the bench and a spare stands by it)
  const slot = j => {
    if (!busy) return here ? (j ? "lit" : null) : [null, "lit", "dark"][j];
    const age = (t + (3 - j) * WICK_TURN) % (3 * WICK_TURN);
    return age < 5120 ? null : age < 3 * WICK_TURN - 3550 ? "lit" : age < 3 * WICK_TURN - 1750 ? "low" : "dark";
  };
  const glow = (x, y, r, a) => {
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, `rgba(255,226,150,${a})`); g.addColorStop(1, "rgba(255,226,150,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  };
  const lamp = (state, x, y) => {
    if (state !== "dark") glow(x + 4 * u, y + 6 * u, (state === "low" ? 9 : 15) * u, state === "low" ? 0.14 : 0.24);
    ctx.drawImage(wickLamp(state, S), x, y, k.lampW * u, 10 * u);
  };
  ctx.imageSmoothingEnabled = false;
  const at = j => { const [x, y] = wickSeat(k.row + j * 0.27); return [x - 4 * u, y - 9 * u]; };
  if (here) {
    // his wings open and fold again, slowly, over every other lantern he has lit; now and then he blinks
    const w = busy && turn % 2 === 0 && ms >= 3600 && ms < 4720 ? [1, 2, 2, 1][Math.floor((ms - 3600) / 280)] : 0;
    if (lap && lap !== "dark") glow(left + (k.lap[0] + 4) * u, top + (k.lap[1] + 6) * u, (lap === "spark" ? 26 : 22) * u, lap === "spark" ? 0.42 : 0.3);
    ctx.drawImage(wickFrame(w, (t + 1300) % 4100 < 140, pose, lap, S), left, top, k.w * u, k.h * u);
  }
  for (let j = 0; j < 3; j++) { const st = slot(j); if (st) lamp(st, ...at(j)); }
  if (fly) { const [x, y] = at(turn % 3), lx = left + k.lap[0] * u, ly = top + k.lap[1] * u; lamp(fly, Math.round((x + lx) / 2 / PX) * PX, Math.round((y + ly) / 2 / PX) * PX); }
}
/** Is (x, y) on Wick? A box round the seated moth, a little bigger than he is for a fingertip. */
const wickAt = (x, y) => { if (!(wickRoom() && wickHere() && isoLayout().placed.wickbench)) return false; const { u, left, top } = wickBox(), [x0, y0, x1, y1] = WICK_NATIVE.tap; return x >= left + x0 * u && x <= left + x1 * u && y >= top + y0 * u && y <= top + y1 * u; };
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
  sfx.levelUp(); toast(tr("Thank you. Truly. ✦ {0}", tr(w.name)));
  persist(); updateTopbar(); openWick();
}

// ---------- expeditions: send a glowling off to a place on the map for a few hours; it comes back with finds and a story ----------

const TRIP_PLACES = [
  { id: "amethyst", theme: "amethyst", ok: () => true, finds: ["geode0", "shards"], suits: ["dance", "flutter"],
    tales: ["{0} found a purple crystal humming in the dark and hummed back until it stopped.", "{0} got lost in the Amethyst Hollow, then found the way out by following the echo."],
    pair: "{0} and {1} called their names into the Amethyst Hollow. The echo got them the wrong way round." },
  { id: "glowcap", theme: "glowcap", ok: () => true, finds: ["seeds", "nut"], suits: ["curious", "nap"],
    tales: ["{0} napped under a glowing mushroom and woke up covered in spores. Very sparkly spores.", "{0} chased a firefly all the way round the wood and back."],
    pair: "{0} and {1} sat out the rain under one glowing mushroom. There was no rain." },
  { id: "celestite", theme: "celestite", ok: () => unlocked(7), finds: ["geode1", "seeds", "shards"], suits: ["swim", "hop"],
    tales: ["{0} found a hidden pool in the Celestite Grotto and came back humming.", "{0} counted every blue crystal in the grotto. Twice. Lost count both times."],
    pair: "{0} and {1} took turns jumping into the hidden pool. Neither will say who made the bigger splash." },
  { id: "malachite", theme: "malachite", ok: () => unlocked(13), finds: ["geode2", "nut", "shards"], suits: ["nap", "hop"],
    tales: ["{0} followed the green bands in the Malachite Deep like a map, and they led to a geode.", "{0} met Dorma in a quiet corner of the Deep. They both had a little nap."],
    pair: "{0} and {1} tiptoed past Dorma's nap in the Deep. Then they lay down next to her anyway." },
  { id: "labradorite", theme: "labradorite", ok: () => unlocked(19), finds: ["geode3", "star", "shards"], suits: ["curious", "dance"],
    tales: ["{0} saw the Labradorite Vault flash blue and gold, and wouldn't stop talking about it.", "{0} felt the Gloom's cold somewhere deep, turned round and came straight home. Brave."],
    pair: "{0} and {1} walked the whole Labradorite Vault side by side. It's less dark with two." },
];
const TRIP_HOURS = [1, 4, 8];
const tripPlace = id => TRIP_PLACES.find(t => t.id === id);
const placeName = pl => THEME[pl.theme].name;
/** Who's on an expedition right now. */
const onTrip = () => save.creatures.filter(c => c.trip);
/** How a glowling likes to spend its time (a mix from the incubator carries its own). */
const kindOf = c => specOf(c).beh || BEHAVIOR[c.sp] || "dance";
/** Friends: two who have met five times or more (either of them remembers). */
const areFriends = (a, b) => Math.max((a.pals || {})[b.id] || 0, (b.pals || {})[a.id] || 0) >= 5;
const tripSuits = (pl, c) => pl.suits.includes(kindOf(c));
/** Who went along, if they're still out there together (someone called home early leaves the other to finish alone). */
const tripMate = c => c.trip.with == null ? undefined : save.creatures.find(x => x !== c && x.id === c.trip.with && x.trip && x.trip.with === c.id);
/** The names of one or two, as a line says them. */
const tripNames = list => list.length > 1 ? tr("{0} & {1}", list[0].name, list[1].name) : list[0].name;
/** One find of a trip k hours long, rolled and put away; got keeps what to say about it. A small one (part 0.5) is half the shards, or half the chance of anything else. */
function tripFind(f, k, got, part = 1) {
  if (f === "shards") { const n = Math.round((6 * k + rand(0, 6 * k)) * part); save.shards += n; got.push(`✦ ${n}`); }
  else if (part < 1 && Math.random() >= part) return;
  else if (f.startsWith("geode")) {
    const cave = Number(f.slice(5)), pool = CRYSTALS.filter(x => x.rarity === (Math.random() < 0.15 * k / 4 + cave * 0.05 ? "rare" : "common"));
    if (Math.random() < 0.35 + k * 0.06) { const g = pick(pool), geo = save.geodes[g.id] || { count: 0, shine: -1 }; geo.count++; save.geodes[g.id] = geo; got.push(`💎 ${g.name}`); }
  } else if (f === "seeds") { const sd = pick(["glowberry", "moonmint", "cookiecorn"]), n = 1 + Math.floor(k / 4); garden().seeds[sd] = (garden().seeds[sd] || 0) + n; got.push(`${seedName(sd)} ×${n}`); }
  else if (Math.random() < 0.25 + k * 0.08) { giveBar(f); got.push(barName(f)); }
}
/** One thing more, for going where it suits you or going with a friend: a small find from the place's own, marked with a plus. */
function tripExtra(pl, k) { const more = []; tripFind(pick(pl.finds), k, more, 0.5); return more.map(x => "+" + x); }
/** Bring back anyone whose expedition is over, with their finds; returns what they said. */
function tripsHome() {
  const now = Date.now(), back = [];
  for (const c of save.creatures) {
    if (!c.trip || now < c.trip.until) continue;
    const pl = tripPlace(c.trip.place) || TRIP_PLACES[0], mate = tripMate(c), pals = mate && areFriends(c, mate), all = [];
    // friends who went together find one thing more between them, and come home with one tale for the two
    const ours = pals ? tripExtra(pl, c.trip.hrs) : [];
    for (const x of pals ? [c, mate] : [c]) {
      const k = x.trip.hrs, got = [];
      for (const f of pl.finds) tripFind(f, k, got);
      // a place that suits it shows it one thing more
      if (tripSuits(pl, x)) got.push(...tripExtra(pl, k));
      // and sometimes a spark of inspiration: a song, a colour, a sight of the lands past the valley
      const spark = bringSpark(x, k, true);
      if (spark) got.push(sparkNote(spark));
      x.sparked = true;
      addXP(x, 6 * k);
      all.push(...got);
      const mine = [...got, ...ours];
      if (pals) remember(x, mine.length ? "Went to {0} with {1} ♥ and came back with {2}" : "Went to {0} with {1} ♥", placeName(pl), (x === c ? mate : c).name, mine.join(", "));
      else remember(x, got.length ? "Came back from {0} with {1}" : "Came back from {0}", placeName(pl), got.join(", "));
      x.trip = null; x.roam = false; x.outAt = x.outAt || now;
    }
    all.push(...ours);
    // (two friends tell it together, so their shards are counted into one heap)
    const heap = all.reduce((n, x) => n + (Number(x.split("✦ ")[1]) || 0), 0), told = pals ? [...(heap ? [`✦ ${heap}`] : []), ...all.filter(x => !x.includes("✦ "))] : all;
    back.push((pals ? tr(pl.pair, c.name, mate.name) : tr(pick(pl.tales), c.name)) + (told.length ? " " + tr("Brought back: {0}", told.join(" · ")) : ""));
  }
  if (back.length) { settleHome(); persist(); updateTopbar(); }
  return back;
}
/** The send-off sheet: who's away, then who goes (one, or two together), where and for how long; what the pick adds is said before anyone sets off. */
function openTrips() {
  sfx.tick();
  const g = game.trip = game.trip || { who: [], place: "amethyst", hrs: 4 };
  const home = save.creatures.filter(c => !c.out && !c.sleeping);
  g.who = g.who.filter(id => home.some(c => c.id === id));
  const now = Date.now(), spot = tripPlace(g.place), going = g.who.map(id => home.find(c => c.id === id)), face = c => `<img src="${creatureImage(specOf(c), { art: 20, level: c.level, shiny: c.shiny, acc: c.acc })}" alt="">`;
  // two who went together are one line (told by whoever hatched first)
  const away = onTrip().filter(c => !(tripMate(c)?.id < c.id)).map(c => [c, tripMate(c)].filter(Boolean));
  const fits = going.filter(c => tripSuits(spot, c)).length, pals = going.length > 1 && areFriends(going[0], going[1]);
  const adds = !going.length ? tr("Pick one glowling, or two to go together.")
    : [fits > 1 ? tr("Both suit this place: two more finds.") : fits ? tr("Suits this place: one more find.") : "", pals ? tr("Friends together: one more find and a tale.") : ""].filter(Boolean).join(" ")
      || (going.length > 1 ? tr("Each brings back its own finds.") : tr("One more can go along."));
  // on each one at home: a compass if the place suits it, a heart if it's a friend of the one picked (or the two picked are friends)
  const marks = c => (tripSuits(spot, c) ? ic("compass", "mood") : "") + (going.some(x => x !== c && areFriends(x, c)) && (going.length < 2 || going.includes(c)) ? ic("heart", "mood pal") : "");
  $("tripsSub").textContent = tr("Send a glowling off to explore. It's away for a while, needs nothing, and comes back by itself with finds and a story. The longer the trip, the more it finds.");
  $("tripsList").innerHTML = (away.length ? `<h3>${tr("Away now")}</h3>` + away.map(who => `<div class="trip-away">${who.map(face).join("")}<span><b>${tripNames(who)}</b><small>${placeName(tripPlace(who[0].trip.place))} · ${tr("back in {0}", fmtLeft(who[0].trip.until - now))}</small></span></div>`).join("") : "")
    + `<h3>${tr("Who goes")}</h3>` + (home.length ? `<div class="trip-who">${home.map(c => `<button class="res${g.who.includes(c.id) ? " on" : ""}" data-who="${c.id}" aria-pressed="${g.who.includes(c.id)}">${face(c)}<small>${c.name}</small>${marks(c)}</button>`).join("")}</div><p class="me-hint trip-adds">${adds}</p>` : `<p class="me-hint">${tr("Everyone's asleep or away. Wake someone up first.")}</p>`)
    + `<h3>${tr("Where to")}</h3><div class="themes trip-where">${TRIP_PLACES.map(pl => `<button class="theme${pl.id === g.place ? " on" : ""}${pl.ok() ? "" : " locked"}" data-place="${pl.id}" ${pl.ok() ? "" : "disabled"}><img src="${themeThumb(pl.theme)}" alt=""><b>${placeName(pl)}</b><small>${pl.ok() ? pl.finds.map(f => tr(f.startsWith("geode") ? "geodes" : f === "seeds" ? "seeds" : f === "shards" ? "shards" : "bars")).join(", ") : ic("lock") + tr(THEME[pl.theme].how)}</small>${pl.ok() ? `<small>${tr("Suits: {0}", pl.suits.map(b => BEHAVIOR_NAMES[b]).join(", "))}</small>` : ""}</button>`).join("")}</div>`
    + `<h3>${tr("How long")}</h3><div class="seg trip-hrs">${TRIP_HOURS.map(h => `<button data-hrs="${h}" class="${h === g.hrs ? "on" : ""}">${tr("{0} h", h)}</button>`).join("")}</div>`
    + `<button class="cta" id="tripGo" ${going.length ? "" : "disabled"}>${tr("Send off")}</button>`;
  // a tap picks or unpicks; with two picked already, a third takes the place of whoever was picked first
  $$("#tripsList [data-who]").forEach(b => b.addEventListener("click", () => { const id = Number(b.dataset.who); g.who = g.who.includes(id) ? g.who.filter(x => x !== id) : [...g.who, id].slice(-2); openTrips(); }));
  $$("#tripsList [data-place]").forEach(b => b.addEventListener("click", () => { g.place = b.dataset.place; openTrips(); }));
  $$("#tripsList [data-hrs]").forEach(b => b.addEventListener("click", () => { g.hrs = Number(b.dataset.hrs); openTrips(); }));
  $("tripGo")?.addEventListener("click", sendTrip);
  show("tripsSheet", true);
}
/** Off they go: one alone, or two as two expeditions that know of each other (each still finds its own, and they're due home at the same moment). */
function sendTrip() {
  const g = game.trip, pl = tripPlace(g.place), going = g.who.map(id => save.creatures.find(x => x.id === id)).filter(c => c && !c.out).slice(0, 2), now = Date.now();
  if (!going.length || !pl || !pl.ok()) return;
  for (const c of going) {
    c.out = true; c.roam = true; c.outAt = now; c.sleeping = false; c.selfSlept = false;
    c.trip = { place: pl.id, hrs: g.hrs, until: now + g.hrs * 3600e3 };
    if (going.length > 1) c.trip.with = going.find(x => x !== c).id;
    if (save.active === c.id) save.active = residents(save.room)[0]?.id ?? c.id;
  }
  // (every glowling sent is an expedition of its own, for the count and the award)
  bump("trips", going.length); sfx.chirp(specOf(going[0]).voice * 1.2);
  toast(going.length > 1 ? tr("{0} and {1} set off for {2} 🧭 back in {3}", going[0].name, going[1].name, placeName(pl), tr("{0} h", g.hrs)) : tr("{0} set off for {1} 🧭 back in {2}", going[0].name, placeName(pl), tr("{0} h", g.hrs)));
  g.who = [];
  persist(); syncActors(); renderNest(true); updateTopbar(); openTrips();
}
/** Coming back to the nest: anyone home from a trip tells you about it. */
function tellTrips() {
  const back = tripsHome();
  back.forEach((t, i) => setTimeout(() => toast(t), i * 2800));
}

// ---------- a glowling's own card: its best friend, and a diary of what it has lived through ----------

/** A glowling's diary keeps this many lines. */
const DIARY_MAX = 40;
/** The lines a full diary never lets go of: how it came to be, each time it grew up, its first friend, its first stroke
 *  and its first game. (Everything else, the oldest first, makes room for what's new.) */
const diaryKeeps = (mem, i) => /^(Hatched|Freed from|Grew up|First )/.test(mem[i].k) || (/^Became friends/.test(mem[i].k) && mem.findIndex(m => /^Became friends/.test(m.k)) === i);
/** The same wish come true again isn't a new line: it joins the one before, which counts the times (n) and moves up to the
 *  newest. (An older diary with the same wish many times over folds up the same way.) */
function diaryFold(mem) {
  const out = [];
  for (const m of mem) {
    if (!m || typeof m.k !== "string") continue;
    const j = /^Wished/.test(m.k) ? out.findIndex(o => o.k === m.k) : -1;
    if (j < 0) { out.push(m); continue; }
    const was = out.splice(j, 1)[0];
    out.push({ ...m, n: (was.n || 1) + (m.n || 1) });
  }
  return out;
}
/** Keep a moment in a glowling's diary (the words are translated when shown, so they follow the language). */
function remember(cr, text, ...args) {
  if (!cr) return;
  const mem = diaryFold([...(cr.mem || []), { t: Date.now(), k: text, a: args }]);
  while (mem.length > DIARY_MAX) { const i = mem.findIndex((_, i) => !diaryKeeps(mem, i)); mem.splice(Math.max(0, i), 1); }
  cr.mem = mem;
}
/** A first worth a line of its own (a stroke, a game), written once. Only for a glowling born since the diary began to
 *  keep firsts (see diaryFrom in migrate): an older one's real first was long ago, and the diary won't make one up. */
function rememberFirst(cr, text, ...args) {
  if (cr && (cr.born || 0) >= (save.diaryFrom || 0) && !(cr.mem || []).some(m => m && m.k === text)) remember(cr, text, ...args);
}
/** A wish's diary line (see FANCIES in save.js) once it has come true more than once: {0} is how many times. */
const DIARY_MANY = {
  "Wished for rain and got it": "Wished for rain {0}, and got it every time",
  "Wished for a splash and got one": "Wished for a splash {0}, and got one every time",
  "Wished for a song and got one": "Wished for a song {0}, and got one every time",
  "Wished for a walk and got one": "Wished for a walk {0}, and got one every time",
  "Wished for a new picture and got one": "Wished for a new picture {0}, and got one every time",
  "Wished for a look at the stars and got one": "Wished for a look at the stars {0}, and got one every time",
  "Wished for a push on the swing and got one": "Wished for a push on the swing {0}, and got one every time",
  "Wished for the lamp turned off, and it was": "Wished for the lamp turned off {0}, and it was every time",
  "Wished to catch sparkles, and did": "Wished to catch sparkles {0}, and did every time",
  "Wished for a bounce on the mushrooms and got one": "Wished for a bounce on the mushrooms {0}, and got one every time",
  "Wished for twinkling lights and got them": "Wished for twinkling lights {0}, and got them every time",
  "Wished for snow and got it": "Wished for snow {0}, and got it every time",
};
/** One line of the diary in words: a wish that came true several times says how many. */
function diaryLine(m) {
  const many = m.n > 1 && DIARY_MANY[m.k];
  return many ? tr(many, m.n + " " + pl(m.n, "time", "times")) : tr(m.k, ...(m.a || []).map(x => typeof x === "string" ? tr(x) : x));
}
/** Its best friend: whoever it has met most often, if they still live with you. */
function bestFriend(cr) {
  const best = Object.entries(cr.pals || {}).map(([id, n]) => [save.creatures.find(c => c.id === Number(id)), n]).filter(([c]) => c).sort((p, q) => q[1] - p[1])[0];
  return best ? { c: best[0], n: best[1] } : null;
}
/** Its habit (see HABITS): the one it hatched with, or for one from before habits, its own from its id. */
const habitOf = cr => HABIT[cr.habit] ? cr.habit : seededHabit(cr.id);
/**
 * A habit for one just hatched: one its own kind in the nest doesn't have yet, so a twin lives differently from its relative
 * (and hiding from the rain only once there's a cloud cushion to rain from).
 */
function newHabit(sp) {
  const taken = new Set(save.creatures.filter(c => c.sp === sp).map(habitOf));
  if (!(save.decor && save.decor.cushion)) taken.add("rain");
  const free = HABITS.filter(h => !taken.has(h.id));
  return pick(free.length ? free : HABITS).id;
}
/** The piece it likes best among those out in its room: each glowling ranks them all its own way, so it stays the same one. */
function favePiece(cr) {
  const rank = d => idHash(cr.id, [...d.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7));
  return DECOR.filter(d => hasDecor(d.id)).sort((p, q) => rank(p) - rank(q))[0] || null;
}
/** Its habit in one short line, for its card. */
function habitLine(cr) {
  const h = HABIT[habitOf(cr)], d = h.id === "fave" && favePiece(cr);
  return h.id !== "fave" ? tr(h.line) : d ? tr(h.line, d.name.charAt(0).toLowerCase() + d.name.slice(1)) : tr(h.bare);
}
function openGlowling(cr) {
  if (!cr) return;
  sfx.tick(); sfx.chirp(specOf(cr).voice);
  const sp = specOf(cr), bf = bestFriend(cr), mood = { asleep: "asleep", sleepy: "sleepy", hungry: "hungry", sad: "a bit lonely", happy: "happy", ok: "doing fine" }[moodOf(cr)];
  $("glowImg").src = creatureImage(sp, { size: 200, level: cr.level, shiny: cr.shiny, acc: cr.acc });
  $("glowName").textContent = cr.name;
  $("glowInfo").textContent = `${sp.name} · ${tr("Level {0}", cr.level)} · ${STAGES[stageOf(cr.level)]} · ${tr(mood)}`;
  const LOC = LANG === "uk" ? "uk-UA" : "en-US", day = t => new Date(t).toLocaleDateString(LOC, { day: "numeric", month: "short" });
  $("glowMore").innerHTML = `<p class="habit">${habitLine(cr)}</p><h3>${tr("Best friend")}</h3>`
    + (bf ? `<div class="trip-away"><img src="${creatureImage(specOf(bf.c), { art: 20, level: bf.c.level, shiny: bf.c.shiny, acc: bf.c.acc })}" alt=""><span><b>${bf.c.name}</b><small>${tr("met {0} times: hugs, tag, duets and naps", bf.n)}</small></span></div>`
      : `<p class="me-hint">${tr("No best friend yet. Glowlings who live in the same room meet and make friends by themselves.")}</p>`)
    + `<h3>${tr("Diary")}</h3>`
    // newest first; the day it hatched closes the list (unless the diary already tells how)
    + `<ul class="diary">${diaryFold(cr.mem || []).reverse().map(m => `<li><b>${day(m.t)}</b><span>${diaryLine(m)}</span></li>`).join("")}${(cr.mem || []).some(m => /^Hatched/.test(m.k)) ? "" : `<li><b>${day(cr.born)}</b><span>${tr("Hatched and moved in ✦")}</span></li>`}</ul>`;
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
  const cur = save.jukebox || "", open = THEMES.filter(t => t.ok()).length, home = atHome();
  // at home every backdrop is a mood of the cave, by the name and picture it has there
  $("jukeSub").textContent = tr(home ? "{0} of {1} songs unlocked. Each new cave mood brings one more." : "{0} of {1} songs unlocked. Find more by opening new backdrops.", open, THEMES.length);
  const song = (id, img, name, small, ok) => `<button class="snack song${cur === id ? " on" : ""}" data-song="${id}" ${ok ? "" : "disabled"}>${img}<span><b>${name}</b><small>${small}</small></span><span class="cost">${ok ? (cur === id ? "♪" : "") : ic("lock")}</span></button>`;
  $("jukeList").innerHTML = `<h3>${tr("Songs")}</h3>` + song("", `<span class="em">🏞️</span>`, tr(home ? "The cave's own song" : "The backdrop's own song"), tr(home ? "changes with the cave mood" : "changes with the backdrop"), true)
    + THEMES.map(t => song(t.id, `<img class="em" src="${themeThumb(t.id, home && !!t.home)}" alt="">`, (home && t.home) || t.name, t.ok() ? tr("song") : t.how, t.ok())).join("")
    + `<h3>${tr("Sounds")}</h3><div class="juke-sounds">${JUKE_SOUNDS.map((x, i) => `<button class="pillbtn" data-sound="${i}">${x.emoji} ${tr(x.name)}</button>`).join("")}</div>`;
  $$("#jukeList [data-song]").forEach(b => b.addEventListener("click", () => { save.jukebox = b.dataset.song || null; persist(); openJukebox(); fancyDone("song"); }));
  $$("#jukeList [data-sound]").forEach(b => b.addEventListener("click", () => { JUKE_SOUNDS[b.dataset.sound].play(); fancyDone("song"); }));
  show("jukebox", true);
}
/** While the music box is out, little notes float up from it now and then. */
let noteT = 0;
function musicNotes(dt) {
  const p = hasDecor("musicbox") && isoLayout().placed.musicbox;
  if (!p || sfx.muted || (noteT -= dt) > 0) return;
  noteT = rand(1.1, 1.9);
  const [x, y] = isoPieceAt(p);
  floatText(pick(["♪", "♫", "♪"]), x + rand(-8, 8), y - N.isoW / ISO_G * 1.6, pick(["#fff0b5", "#ffc4da", "#b8e6f5", "#d2bfff"]));
}

/** Accessories in the Decor sheet: each shown on the glowling you've picked; buy once, then any glowling can wear it. */
function accessoryList() {
  const cr = activeCreature();
  if (!cr) return chestEmpty(tr("Nobody to dress up yet: glowlings hatch from the eggs in the grotto."), "egg");
  const owned = save.wardrobe || {};
  return `<p class="sub">${tr("Accessories for {0}: buy once, then any glowling can wear it. Tap to put on or take off.", cr.name)}</p><div class="tiles">` + ACCESSORIES.map(a => {
    const has = owned[a.id], on = cr.acc === a.id;
    const img = `<img class="em px-thumb" src="${creatureImage(specOf(cr), { art: 24, level: cr.level, shiny: cr.shiny, acc: a.id })}" alt="">`;
    return `<button class="tile acc${has ? " owned" : ""}${on ? " placed on" : ""}" data-acc="${a.id}" ${!has && save.shards < a.cost ? "disabled" : ""}>${img}<b>${a.name}</b><small>${on ? tr("worn ✓") : has ? tr("owned") : "✦ " + a.cost}</small></button>`;
  }).join("") + "</div>" + keepWearList(cr);
}
/**
 * The things made from keepsakes: shown as they'd come out of what's in the jar now (a made one, as it was made),
 * with the feathers or flowers it takes. They turn up once a walk has brought something home.
 */
function keepWearList(cr) {
  const owned = save.wardrobe || {}, jar = jarOf(save.walks);
  if (!Object.keys(save.walks.found).length && !KEEP_WEAR.some(t => owned[t.id])) return "";
  return `<h3 class="forge-h">${tr("Made from keepsakes")}</h3><div class="tiles">` + KEEP_WEAR.map(t => {
    const has = owned[t.id], on = cr.acc === t.id, plan = !has && keepWearPlan(t.id, jar);
    const have = KEEPSAKES.filter(k => k.kind === t.kind).reduce((n, k) => n + (jar[k.id] || 0), 0);
    const img = `<img class="em px-thumb" src="${creatureImage(specOf(cr), { art: 24, level: cr.level, shiny: cr.shiny, acc: plan ? `${t.id}:${plan.look.join(".")}` : t.id })}" alt="">`;
    const tag = on ? tr("worn ✓") : has ? tr("owned") : `${ic(t.kind)}${plan ? "×" + t.n : `${have}/${t.n}`}`;
    return `<button class="tile acc${has ? " owned" : ""}${on ? " placed on" : ""}" data-acc="${t.id}" ${has || plan ? "" : "disabled"}>${img}<b>${t.name}</b><small>${tag}</small></button>`;
  }).join("") + `</div><p class="me-hint">${tr("A crown takes three flowers from the keepsake jar and wears their colours; a pin takes two feathers and shows off your rarest one. Made once, any glowling can wear it.")}</p>`;
}
function wearAccessory(id) {
  const cr = activeCreature(), a = ACCESSORIES.find(x => x.id === id) || KEEP_WEAR.find(x => x.id === id);
  if (!cr || !a) return;
  save.wardrobe = save.wardrobe || {};
  let made = false;
  if (!save.wardrobe[id] && a.kind) {
    // made from keepsakes: they come out of the jar, and it keeps the look of the very ones it was made of
    const plan = keepWearPlan(id, jarOf(save.walks));
    if (!plan) return;
    for (const [k, n] of Object.entries(plan.take)) save.walks.used[k] = (save.walks.used[k] || 0) + n;
    save.wardrobe[id] = { ks: plan.look, at: Date.now() }; made = true; sfx.levelUp();
  } else if (!save.wardrobe[id]) {
    if (save.shards < a.cost) return;
    save.shards -= a.cost; save.wardrobe[id] = true; sfx.levelUp();
  } else sfx.tick();
  cr.acc = cr.acc === id ? null : id;
  const act = actors.get(cr.id);
  if (act && cr.acc) { act.hop = 1; emote(act, "♥", 1.4); }
  if (made) toast(tr("Made from your keepsakes ✦ {0} is wearing the {1}", cr.name, a.name.toLowerCase()));
  else if (cr.acc) toast(tr("{0} is wearing the {1} ✦", cr.name, a.name.toLowerCase()));
  persist(); updateTopbar(); renderNest(true); openShop();
}

// ---------- rooms: the nest plus rooms you add, each with its own furniture, layout and backdrop ----------

/** The rooms you can add, in order: each starts on its own backdrop. Every room at home is a cave: the moss garden's glowcaps
 *  grow there in a grotto of their own (HOME_ART), with its beds, its spring and its shaft of light drawn into the room. */
const ROOM_KINDS = [
  { id: "nest", name: "Nest" },
  { id: "yard", name: "Garden", outdoor: true, place: true },
  { id: "play", name: "Playroom", cost: 250, note: "a bright room for toys and games" },
  { id: "garden", name: "Moss garden", cost: 500, theme: "glowcap", note: "glowcap beds, a spring and light through a crack in the vault" },
  { id: "study", name: "Crystal study", cost: 900, theme: "celestite", note: "quiet, blue and full of crystals" },
  { id: "lab", name: "Laboratory", place: true, theme: "abbey" },
  { id: "shop", name: "Shop", place: true, theme: "smithy" },
  { id: "forge", name: "The Forge", place: true, theme: "smithy" },
  { id: "camp", name: "Explorers' camp", place: true, theme: "glowcap" },
  { id: "grotto", name: "Grotto", place: true, theme: "amethyst" },
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
  const had = save.rooms.find(r => r.kind === kind);
  if (had && kind === "forge" && had.theme === "malachite") had.theme = "smithy";
  if (had && kind === "shop" && had.theme === "abbey") had.theme = "smithy";
  if (had && kind === "lab" && had.theme === "celestite") had.theme = "abbey";
  if (save.rooms.some(r => r.kind === kind)) return false;
  return !!save.rooms.push({ kind, on: [], theme: ROOM_KINDS.find(k => k.id === kind).theme });
}
/** Is this room one of the map's places (the shop, the forge, the camp, the lab) rather than a home for glowlings? */
const isPlace = (i = save.room) => !!ROOM_KINDS.find(k => k.id === save.rooms[i]?.kind)?.place;
/** Rooms the tunnels join: homes only (the garden outside is one of the map's places). */
const roomOpen = i => !isPlace(i) && (!isOutside(i) || placeOk("garden"));
// ---------- the places' keepers: each place on the map has someone who runs it ----------

const TANSY = { name: "Tansy", face: mood => pxPortrait("tansy", mood), voice: { f: 330, wave: "triangle", spread: 0.25, glide: 1.05, gain: 0.06, len: 0.06 } };
const EMBER = { name: "Ember", face: mood => pxPortrait("ember", mood), voice: { f: 150, wave: "square", spread: 0.18, glide: 0.9, gain: 0.03, len: 0.08 } };
const PIP = { name: "Pip", face: mood => pxPortrait("pip", mood), voice: { f: 520, wave: "sine", spread: 0.35, glide: 1.15, gain: 0.07, len: 0.05 } };
const FENNEL = { name: "Fennel", face: mood => pxPortrait("fennel", mood), voice: { f: 120, wave: "triangle", spread: 0.1, glide: 0.85, gain: 0.08, len: 0.11 } };
const OLLO = { name: "Ollo", face: mood => pxPortrait("ollo", mood), voice: { f: 240, wave: "sine", spread: 0.12, glide: 0.95, gain: 0.08, len: 0.1 } };
/** A keeper's hello or line is its words, or [mood, words]: the mood is the face it is said with (see `as` in portraits.js);
 *  the place bar shows the words beside the keeper's small crop, which has one face. */
const heroWords = l => Array.isArray(l) ? l[1] : l;
const HEROES = {
  shop: { who: TANSY, eyes: [[4, 5, 2, 2, "#efe6ff"], [10, 5, 2, 2, "#efe6ff"]], quirk: "curl", icon: "tansy", at: [0.7, 0.5], role: "keeps the shop", act: [["stall", "Buy", () => openMarket()]],
    hello: ["Welcome. Mind the sacks: seeds, all of them, and not for sitting on.", "Food, furniture, seeds. If it's on a shelf, it's for sale. Fair prices.", "Furniture to your chest, food to your basket. Easy to remember."],
    lines: [["doubtful", "Fresh cookies today. Well, fresh-ish. I won't lie."], ["dreamy", "One day I'll sell a hat. Just one. Not sensible. Beautiful."], "Moonberries are going fast, dear. Take some while they last.", ["doubtful", "Starfruit? Not on my shelves. It only grows in a garden."], ["pleased", "A tidy nest is a happy nest, I always say."], ["doubtful", "Wick sells odd things. I sell sensible things. We're both very proud."]] },
  forge: { who: EMBER, eyes: [[5, 3, 2, 2, "#e0634f"], [9, 3, 2, 2, "#e0634f"]], quirk: "sparks", icon: "ember", at: [0.76, 0.26], role: "works the forge", act: [["hammer", "Forge", () => openForge()]],
    hello: ["Another stone-breaker. Good. Come in, it's warm.", ["focused", "Better hammer, harder stone. Bring shards. I'll make you one."], "Spare geodes? My workbench. Melt them down. Nothing wasted."],
    lines: [["laugh", "Hot today. It's always hot today."], "I'll cast a bell. One that rings in every cave at once. It's planned.", ["focused", "Deep stone won't forgive a sloppy tap. Aim first. Then strike."], ["laugh", "Made a hammer so light once, it floated off. Never again. Weight matters."], ["focused", "Strike where it glows. That's the weak spot. Everyone forgets. Don't."]] },
  camp: { who: PIP, eyes: [[5, 6, 1, 1, "#3d2866"], [10, 6, 1, 1, "#3d2866"]], quirk: "startle", icon: "pip", at: [0.74, 0.5], role: "leads the expeditions", act: [["compass", "Expeditions", () => openTrips()]],
    hello: ["Hello. I'm Pip. I map the tunnels. They don't always agree.", "Send a glowling with me, and we'll explore for a few hours. I'll bring it back.", ["shy-pride", "We always come back with something. Seeds, shards. Sometimes a geode."]],
    lines: [["thinking", "I've drawn this map three times. The tunnels keep moving. Or I do."], ["thinking", "Do you think the Gloom keeps a map? I'd like to see it. From very far away."], "Pack a snack. I always forget mine.", ["scared-but-steady", "The fire's nice, isn't it? I keep it going. I'm scared of the dark. A bit."], ["excited", "Somewhere past the moss there's a lake that glows. I'm sure of it."]] },
  yard: { who: FENNEL, eyes: [[3, 5, 3, 2, "#57ad6a"], [10, 5, 3, 2, "#57ad6a"]], quirk: "curl", icon: "fennel", at: [0.45, 0.52], role: "tends the garden", act: [["sprout", "Garden bed", () => openGarden()], ["walk", "A walk", () => openWalk()]],
    hello: [["listening", "Mm. Hello. I'm telling the moon mint a story. A slow one."], "Plant seeds in the bed. I'll watch them. And listen.", "Some things grow only here. Berries for juice. Mint for tea. Starfruit. No shop has them."],
    lines: ["Rain tomorrow, I hope. Leaves like rain. So do I.", ["shy", "My dream? A garden as big as the grotto. A pond. Someone to sit by it."], ["glad", "I sang to the growcaps. They grew. Coincidence? No."], ["listening", "Shh. The sunpetals are sleeping."], "Mm. Slow and steady. Like seeds.", "Wick leaves seeds by the gate. Odd ones. He never knocks. I plant them anyway."],
    // his wishes, one at a time and in this order (see the errands below); the thanks for the last is the bed's fourth plot (see gardenSlots)
    mark: "leaf", thanks: "From Fennel: {0}", calm: "A harebell, a pond one pebble deep, and company. I don't need a thing. Stay a while, if you like.",
    asks: [
      { ask: "If you pass a harebell on a walk… might I have it? The little blue one. I'd like it near.", wish: "Fennel would like a harebell from a walk.", btn: "Give Fennel the harebell", ks: "harebell",
        have: () => jarOf(save.walks).harebell > 0, give: () => { save.walks.used.harebell = (save.walks.used.harebell || 0) + 1; },
        story: "My first garden was one cracked pot. A harebell came up in it by itself. All I did was not pull it out.",
        gift: ["Moon mint seeds ×2", () => { const g = garden().seeds; g.moonmint = (g.moonmint || 0) + 2; }] },
      { ask: "Might I have a cup of moon mint tea… from your bed? I tell the mint stories. Does it listen? I'd like to know.", wish: "Fennel would like a cup of moon mint tea.", btn: "Give Fennel a cup of tea",
        have: () => ((save.pantry || {}).tea || 0) > 0, give: () => { save.pantry = { ...save.pantry, tea: save.pantry.tea - 1 }; },
        story: "Mm. It listened. I always tell the same one: somebody slow sets out last and gets there anyway. The mint never asks for another.",
        gift: ["A growcap seed, already sung to", () => { const g = garden().seeds; g.growcap = (g.growcap || 0) + 1; }] },
      { ask: "One more, if it's no trouble… A shiny pebble from a walk. The stream always has one. I'm digging something. Slowly.", wish: "Fennel would like a shiny pebble from the stream.", btn: "Give Fennel the pebble", find: "pebble", found: "A shiny pebble for Fennel",
        have: () => ((save.pocket || {}).pebble || 0) > 0, give: () => { save.pocket = { ...save.pocket, pebble: save.pocket.pebble - 1 }; },
        story: "There. The pond is begun. One pebble deep. And the earth I dug out filled a fourth plot in the bed. That one is yours.",
        gift: ["A fourth plot in the garden bed", () => { garden(); }] },
    ] },
  grotto: { who: { name: "Grotto" }, icon: "grotto", none: true, role: "the hall before the tunnel", act: [["egg", "Into the tunnel", () => startLevel(nextLevel())], ["map", "Map of levels", () => setScene("map")]], hello: [], lines: [] },
  lab: { who: OLLO, eyes: [[3, 5, 3, 2, "#69b7d6"], [9, 5, 3, 2, "#69b7d6"]], quirk: "turn", icon: "ollo", at: [0.45, 0.58], role: "studies glowlings", act: [["heart", "Incubator", () => openIncubator()]],
    hello: ["Hoo. A colleague, at last. I study glowlings: how they glow, and why.", "Two happy glowlings can share an egg in my incubator. The baby takes after both. Every time.", "Stroke the egg to keep it warm. Warmth shortens the wait. Measurably."],
    lines: [["curious", "Each glowling glows at its own pitch. Fascinating."], ["delighted", "I am writing the great book of glowlings. Chapter one is just you."], ["curious", "No two mixed eggs are alike. Checked forty times. Forty-one, now."], ["delighted", "Happy glowlings glow brighter. Measured. That is not nothing."], ["alarmed", "Please don't touch the green jar. It doesn't bite. Probably."]] },
};
// ---------- errands: each keeper keeps one wish at a time, with no hurry and no list; bringing it fills a mark on their bond ----------

// A keeper's `asks` are their wishes, in order. Each has: ask (how they say it), wish (the same in one quiet line for the bar),
// btn (the button once you have it), have() (do you?), give() (it changes hands), story (a line of their own story, opened for
// good) and maybe gift ([its name, what it gives]: a small thank-you, once). A wish can also say what it hopes a walk turns up:
// ks (a keepsake: the next feather or flower of its kind is that one) or find (a pebble: the next one is put by for them in
// save.pocket, and `found` is what the walk calls it). save.bonds[kind] counts the wishes brought (the marks lit); save.wishes[kind]
// is the last wish said aloud, so the bar never shows one before the keeper has asked. On the keeper: `mark` is the little picture
// the marks are drawn with, `thanks` the words over a thank-you, `calm` what they say with no wish left.
PX_ICON_MAPS.leaf = ["............", "........mm..", "......mmMMm.", ".....mMMMMm.", "....mMMmMMm.", "...mMMmMMm..", "...mMmMMMm..", "..mMmMMMm...", "..mmMMMm....", ".mmmmmm.....", ".m..........", "m..........."];
const STORY_HOLD = 9000;
/** How many of a keeper's wishes have been brought (an older nest has brought none yet). */
function bondOf(kind) { const n = (save.bonds || {})[kind]; return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; }
/** The one wish a keeper has now, or null: a keeper with none to make, or with all of them brought. */
const wishOf = kind => (HEROES[kind]?.asks || [])[bondOf(kind)] || null;
/** Has the keeper said this wish aloud yet? */
const wishTold = kind => ((save.wishes || {})[kind] || 0) > bondOf(kind);
/** The lines of a keeper's own story opened so far, oldest first (the Book keeps them under Folk). */
const bondStory = kind => (HEROES[kind]?.asks || []).slice(0, bondOf(kind)).map(a => a.story);
/** A wish still waiting for what a walk might turn up: by `ks` (a keepsake) or by `find` (a kind of find). */
const wishSeeks = (key, ok = () => true) => Object.keys(HEROES).map(k => [HEROES[k], wishOf(k)]).find(([, a]) => a && a[key] && ok(a[key]) && !a.have()) || null;
/** Bring a keeper their wish: nothing happens unless you have it; then it changes hands, a mark fills and the thank-you is given. Returns the wish brought, or null. */
function giveWish(kind) {
  const a = wishOf(kind);
  if (!a || !a.have()) return null;
  a.give();
  save.bonds = { ...save.bonds, [kind]: bondOf(kind) + 1 };
  if (a.gift) a.gift[1]();
  return a;
}
/** The button in the keeper's bar: they thank you with the next line of their story (it stays up a good while, and in the Book for good); what they give is named once the line has been read, so the two never cover each other. */
function bringWish() {
  const kind = save.rooms[save.room]?.kind, h = HEROES[kind], a = h && giveWish(kind);
  if (!a) return;
  for (let k = 0; k < 4; k++) setTimeout(() => sfx.voice(h.who.voice), k * 90);
  sfx.shimmer(); buzz([12, 30, 12]);
  game.hero = { t: game.time, line: tr(a.story), room: save.room, hold: STORY_HOLD };
  if (a.gift) setTimeout(() => toast(tr(h.thanks, tr(a.gift[0]))), STORY_HOLD);
  persist(); renderPlaceBar();
}
const heroHere = () => HEROES[save.rooms[save.room]?.kind] || null;
const heroSpot = () => { const h = heroHere(); return isoAt(h.at[0], h.at[1]); };
const heroImgs = {};
/**
 * A hand-pixelled keeper about `tall` room pixels high: drawn from the fine (twice-size) version and shrunk on the room's grid,
 * each room pixel taking the colour that covers most of it, with the ink lines winning ties so the outline holds.
 */
const keeperSizedCache = {};
function keeperSized(id, blink, f, S, tall) {
  // drawn at full size by hand: shown pixel for pixel (doubled only on a screen with room for it)
  if (KEEPER_NATIVE[id]) return keeperNative(id, blink, f, Math.max(1, Math.floor(tall / KEEPER_NATIVE[id].h + 0.2)));
  const fine = KEEPER_PIX[id] ? keeperCanvas(id, blink, 2, f) : null;
  if (!fine || tall >= fine.height) return keeperCanvas(id, blink, S, f);
  const key = `${id}|${blink ? 1 : 0}|${f}|${tall}`;
  if (keeperSizedCache[key]) return keeperSizedCache[key];
  const sw = fine.width, sh = fine.height, k = tall / sh, tw = Math.round(sw * k), d = fine.getContext("2d").getImageData(0, 0, sw, sh).data;
  const c = document.createElement("canvas"); c.width = tw; c.height = tall; const g = c.getContext("2d"), im = g.createImageData(tw, tall);
  for (let y = 0; y < tall; y++) for (let x = 0; x < tw; x++) {
    const x0 = x / k, x1 = (x + 1) / k, y0 = y / k, y1 = (y + 1) / k, seen = new Map(); let solid = 0;
    for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
      const a = (Math.min(sx + 1, x1) - Math.max(sx, x0)) * (Math.min(sy + 1, y1) - Math.max(sy, y0)), o = (sy * sw + sx) * 4;
      if (a <= 0 || d[o + 3] < 128) continue;
      const rgb = (d[o] << 16) | (d[o + 1] << 8) | d[o + 2], lum = d[o] + d[o + 1] + d[o + 2];
      solid += a; seen.set(rgb, (seen.get(rgb) || 0) + a * (lum < 150 ? 1.6 : 1));
    }
    if (solid < 0.5 / k / k) continue;
    const best = [...seen].sort((p, q) => q[1] - p[1])[0][0], o = (y * tw + x) * 4;
    im.data[o] = best >> 16; im.data[o + 1] = (best >> 8) & 255; im.data[o + 2] = best & 255; im.data[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return keeperSizedCache[key] = c;
}
function drawHero() {
  if (heroHere().none) return;
  // drawn on the room's own pixel grid: S of the room's pixels to each of the keeper's, as tall as about one and a half glowlings
  const h = heroHere(), idle = KEEPER_NATIVE[h.icon] ? keeperIdle(h.icon, game.time) : null, blink = game.time % 3700 < 140 && !String(idle).startsWith("act"), S = Math.max(1, Math.round(N.base * 1.55 / PX / KH)), tall = Math.round(N.base * 1.55 / PX), pose = (b, f) => keeperSized(h.icon, b, f, S, tall), img = pose(blink, idle ?? (KEEPER_PIX[h.icon] ? Math.floor(game.time / 450) % KEEPER_PIX[h.icon].frames.length : 0));
  const [x, y] = heroSpot(), s = Math.round(N.base * 1.05 / 18) * 18 || 18, t = game.time, me = game.hero && game.hero.room === save.room ? game.hero : null;
  const since = me ? t - me.t : 1e9, jump = me && me.startle ? 0.45 : 0.18;
  const hop = since < 500 ? Math.sin(since / 500 * Math.PI) * s * jump : 0;
  const breathe = 1 + Math.sin(t * 0.004) * 0.03;
  ctx.fillStyle = "rgba(5,0,20,.35)"; ctx.beginPath(); ctx.ellipse(x, y, s * 0.36, s * 0.1, 0, 0, TAU); ctx.fill();
  ctx.imageSmoothingEnabled = false;
  // (breathing is a one-pixel rise and fall, so the pixels stay square)
  const wid = img.width * PX, px = S * PX, left = Math.round((x - wid / 2) / PX) * PX, hgt = img.height * PX, top = Math.round((y - hgt - hop - (!KEEPER_PIX[h.icon] && Math.sin(t * 0.004) > 0.4 ? PX : 0)) / PX) * PX;
  if (me && me.curl && since < 2600) {
    // poked once too often: Tansy rolls into a ball of spines, Fennel pulls into his shell
    const wob = Math.sin(t * 0.03) * px, r = s * 0.36, shell = h.who === FENNEL;
    if ((KEEPER_NATIVE[h.icon] || KEEPER_PIX[h.icon])?.[shell ? "shell" : "curl"]) {
      const ball = pose(false, shell ? "shell" : "curl");
      ctx.drawImage(ball, Math.round((left + wob) / PX) * PX, Math.round((y - hgt) / PX) * PX, wid, hgt);
    } else {
    ctx.fillStyle = shell ? "#4a4020" : "#5e3a1c"; ctx.beginPath(); ctx.ellipse(x + wob, y - r * (shell ? 0.7 : 1), r * (shell ? 1.25 : 1), r * (shell ? 0.75 : 1), 0, 0, TAU); ctx.fill();
    ctx.fillStyle = shell ? "#6e6030" : "#946027";
    if (shell) { for (let k = -1; k <= 1; k++) ctx.fillRect(Math.round(x + wob + k * r * 0.6 - px * 2), Math.round(y - r * 1.1), Math.ceil(px * 4), Math.ceil(px * 3)); }
    else
    for (let k = 0; k < 14; k++) { const an = k / 14 * TAU + 0.2; ctx.fillRect(Math.round(x + wob + Math.cos(an) * r * 1.05 - px), Math.round(y - r + Math.sin(an) * r * 1.05 - px), Math.ceil(px * 2), Math.ceil(px * 2)); }
    }
  } else {
    // Ollo looks the other way now and then
    const turned = h.quirk === "turn" && Math.sin(t * 0.0011) > 0.75;
    const own = KEEPER_NATIVE[h.icon] || KEEPER_PIX[h.icon];
    const back = turned && own && own.turn, flip = turned && !back;
    const fright = me && me.startle && since < 900, jumpy = fright && own && own.startle;
    if (flip) { ctx.save(); ctx.translate(left * 2 + wid, 0); ctx.scale(-1, 1); }
    ctx.drawImage(jumpy ? pose(false, "startle") : back ? pose(false, "turn") : img, left, top, wid, hgt);
    if (flip) ctx.restore();
    if (fright && !jumpy) { ctx.fillStyle = "#ffe9a8"; ctx.font = `400 ${Math.round(s * 0.5)}px ${PIXEL_FONT}`; ctx.textAlign = "center"; ctx.fillText("!", x + s * 0.45, top - s * 0.05); }
  }
  // what they just said, in a little bubble over their head
  const hold = me ? me.hold || 4200 : 0, say = me && since < hold ? me.line : "";
  if (say) drawBubble(x, top - 4, say, clamp(1 - (since - hold + 600) / 600, 0, 1));
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
const heroAt = (x, y) => { if (!heroHere() || heroHere().none) return false; const [hx, hy] = heroSpot(); return Math.abs(x - hx) < N.base * 0.6 && y < hy + N.base * 0.15 && y > hy - N.base * 1.6; };
const propAt = (x, y) => Object.values(isoLayout().placed).find(p => PLACE_PROPS.has(p.id) && pieceHits[p.id] && spriteHit(pieceHits[p.id].c, pieceHits[p.id].x, pieceHits[p.id].y, x, y))?.id || null;
/** Things in a place that do something of their own when tapped (the keeper's counter, anvil and map table do the keeper's job). */
const PROP_TAP = {
  tunnel: () => pressProp("tunnel", () => { sfx.tick(); startLevel(nextLevel()); }),
  wallmap: () => pressProp("wallmap", () => { sfx.tick(); setScene("map"); }),
  altar: () => pressProp("altar", () => openThing("moon")),
  shrine: () => eventNow() && pressProp("shrine", () => openThing("event")),
  ...Object.fromEntries(["counter", "anvil", "maptable"].map(id => [id, () => pressProp(id, () => { sfx.tick(); heroHere()?.act[0][2](); })])),
};
// ---------- what can be tapped in a place: a warm rim that breathes, a glint sweeping across now and then, the sign of what it does over it ----------

/** The things in the places that do something: the icon of what they do (the same as on its button) and whether one is calling you right now. */
const PROP_CUES = {
  tunnel: { icon: "egg" }, wallmap: { icon: "map" },
  altar: { icon: "moon", call: () => !moonDone() },
  shrine: { icon: "star", on: () => !!eventNow(), call: () => !moonDone() && !save.seen[eventNow().sp] },
  counter: { icon: "stall", dx: -0.28 }, anvil: { icon: "hammer" }, maptable: { icon: "compass" },
  incubator: { icon: "heart", call: () => !!save.incubator && Date.now() >= save.incubator.due },
  garden: { icon: "sprout", call: () => garden().slots.some(q => q && stageOf2(q) === 3) },
};
/** Each cue keeps its own time, so they never pulse together. */
const cuePhase = id => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 997, 7) / 997;
/** Pressed: the rim lights up and the piece dips a pixel, then (a moment later) it does its thing. Tapped once, its cue calms down. */
function pressProp(id, then, wait = 140) {
  game.propPress = { id, t: game.time };
  markTip("cue:" + id);
  if (then) setTimeout(then, wait);
  return true;
}
const propPressed = id => !!game.propPress && game.propPress.id === id && game.time - game.propPress.t < 160;
/**
 * A piece's highlight, worked out once per picture: a one-pixel rim just outside its ink outline (pale gold on the lit
 * side, deeper gold on the shadow side, like a selective outline), its solid pixels as a mask for the glint, and its top.
 */
const cueBakes = new WeakMap();
function cueBake(c) {
  if (cueBakes.has(c)) return cueBakes.get(c);
  const w = c.width, h = c.height;
  let solid = c._solid;
  if (!solid) { const d = c.getContext("2d").getImageData(0, 0, w, h).data; solid = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3] > 40 ? 1 : 0; }
  const on = (m, x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x];
  const body = new Uint8Array(w * h);
  let x0 = w, x1 = -1, top = h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (solid[y * w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); top = Math.min(top, y); }
    body[y * w + x] = solid[y * w + x] || on(solid, x - 1, y) || on(solid, x + 1, y) || on(solid, x, y - 1) || on(solid, x, y + 1) ? 1 : 0;
  }
  if (x1 < 0) { cueBakes.set(c, null); return null; }
  const mk = (cw, ch) => { const k = document.createElement("canvas"); k.width = cw; k.height = ch; return k; };
  const rim = mk(w + 2, h + 2), rg = rim.getContext("2d"), ri = rg.createImageData(w + 2, h + 2), lit = pxHex("#fff0b5"), deep = pxHex("#eec26a");
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    if (on(body, x, y)) continue;
    const toR = on(body, x + 1, y), toD = on(body, x, y + 1);
    if (!(toR || toD || on(body, x - 1, y) || on(body, x, y - 1))) continue;
    const col = toR || toD ? lit : deep, o = ((y + 1) * (w + 2) + x + 1) * 4;
    ri.data[o] = col[0]; ri.data[o + 1] = col[1]; ri.data[o + 2] = col[2]; ri.data[o + 3] = 255;
  }
  rg.putImageData(ri, 0, 0);
  const mask = mk(w, h), mg = mask.getContext("2d"), mi = mg.createImageData(w, h);
  for (let i = 0; i < w * h; i++) if (solid[i]) { mi.data[i * 4] = mi.data[i * 4 + 1] = 255; mi.data[i * 4 + 2] = 236; mi.data[i * 4 + 3] = 255; }
  mg.putImageData(mi, 0, 0);
  const k = { rim, mask, w, h, top, cx: (x0 + x1 + 1) / 2, span: x1 + 1 - x0 };
  cueBakes.set(c, k);
  return k;
}
/** Where this frame's cues want their little icons (drawn over everything, by drawPlaceLife). */
const cueIcons = {};
/** The cue on one piece in a place, drawn right after the piece: its rim breathing, now and then a glint. */
function propCue(id, f, dy = 0) {
  const q = PROP_CUES[id];
  if (!q || game.scene !== "nest" || arrange.on || (q.on && !q.on())) return;
  const k = cueBake(f.c); if (!k) return;
  const x0 = f.x, y0 = f.y + Math.round(dy / PX) * PX, now = game.time, ph = cuePhase(id), fresh = !tipDone("cue:" + id), press = game.propPress && game.propPress.id === id && now - game.propPress.t < 260;
  // brighter and quicker until it's been tapped once; after that slow and faint, but there
  const per = fresh ? 2600 : 5600, s = 0.5 - 0.5 * Math.cos((now / per + ph) * TAU);
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = press ? 1 : fresh ? 0.3 + 0.5 * s : 0.08 + 0.24 * s;
  ctx.drawImage(k.rim, x0 - PX, y0 - PX, k.rim.width * PX, k.rim.height * PX);
  // the glint: a slanted band three pixels wide crossing it from left to right, every few seconds (a flash when pressed)
  const every = fresh ? 4600 : 9000, sweep = 650, tt = (now + ph * every) % every;
  if (press || tt < sweep) {
    if (!press) {
      const pos = -4 + (k.w + k.h / 2 + 8) * tt / sweep;
      ctx.beginPath();
      for (let y = k.top; y < k.h; y++) ctx.rect(x0 + Math.floor(pos - y / 2) * PX, y0 + y * PX, 3 * PX, PX);
      ctx.clip();
    }
    ctx.globalAlpha = press ? 0.28 : fresh ? 0.42 : 0.28;
    ctx.drawImage(k.mask, x0, y0, k.w * PX, k.h * PX);
  }
  ctx.restore();
  cueIcons[id] = { x: x0 + (k.cx + (q.dx || 0) * k.span) * PX, y: y0 + k.top * PX, t: now, show: fresh || !!(q.call && q.call()), ph };
}
/**
 * The icons over the cued pieces, each on a little dark tag with a point at the bottom, so it reads as a sign and not as
 * something standing in the room: until each piece has been tapped once, and after that only when one is calling you.
 */
function drawCueIcons() {
  const sz = Math.round(N.base * 0.32 / 14) * 14 || 14, P = Math.max(1, Math.round(sz / 14)), pad = P;
  for (const [id, c] of Object.entries(cueIcons)) {
    if (c.t !== game.time) { delete cueIcons[id]; continue; }
    if (!c.show) continue;
    const icon = PROP_CUES[id].icon, im = heroImgs["ic:" + icon] || (heroImgs["ic:" + icon] = Object.assign(new Image(), { src: pxIcon(icon) }));
    if (!im.complete) continue;
    const bob = Math.round(Math.sin(game.time * 0.004 + c.ph * TAU)) * P, x = Math.round(c.x - sz / 2), y = Math.round(c.y - sz - pad * 2 - 4 * P + bob);
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#160c26"; ctx.fillRect(x - pad, y - pad + P, sz + pad * 2, sz + pad * 2 - 2 * P); ctx.fillRect(x - pad + P, y - pad, sz + pad * 2 - 2 * P, sz + pad * 2);
    const cx = Math.round(c.x / P) * P; ctx.fillRect(cx - 2 * P, y + sz + pad, 4 * P, P); ctx.fillRect(cx - P, y + sz + pad + P, 2 * P, P);
    ctx.fillStyle = "#2c1d4d"; ctx.fillRect(x + P, y + P, sz - 2 * P, sz - 2 * P);
    ctx.globalAlpha = 1;
    ctx.drawImage(im, x, y, sz, sz);
    ctx.restore();
  }
}
/** A little card about one thing in a place: what it is, and the one thing to do with it. */
function openThing(what) {
  sfx.tick();
  const ev = eventNow();
  if (what === "moon") {
    $("thingTitle").textContent = tr(moonDone() ? "Moon egg opened" : "Today's moon egg");
    $("thingText").textContent = moonLine();
    $("thingGo").hidden = moonDone(); $("thingGo").textContent = tr("Crack it 🌙"); $("thingGo").onclick = () => { show("thingSheet", false); startMoon(true); };
  } else if (ev) {
    const left = eventDaysLeft(ev);
    $("thingTitle").textContent = `${ev.emoji} ${eventName(ev)}`;
    $("thingText").textContent = tr(left === 1 ? "last day" : "{0} days left", left) + (save.seen[ev.sp] ? tr(" · you've met {0} ✓", SP[ev.sp].name) : tr(" · a limited glowling sleeps in the moon egg"));
    $("thingGo").hidden = moonDone() || !!save.seen[ev.sp]; $("thingGo").textContent = tr("To the moon egg 🌙"); $("thingGo").onclick = () => { show("thingSheet", false); startMoon(); };
  }
  show("thingSheet", true);
}
// ---------- life in the places: Ember's sparks, embers and fireflies at the camp, butterflies in the garden (the forge, lab and shop: see placeBreath) ----------

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
  if (kind === "camp") {
    const f = pieceCenter("campfire", 0.5, 0.6); if (f && Math.random() < 0.15) add({ kind: "ember", x: f[0] + rand(-4, 4), y: f[1], vx: rand(-8, 8), vy: rand(-40, -24), life: rand(1.2, 2.2) });
    if (L.filter(p => p.kind === "fly").length < 6) add({ kind: "fly", x: rand(N.x0, N.x1), y: rand(N.y0 - N.base * 1.5, N.y1), ph: rand(0, TAU), life: 1e9 });
  }
  drawCueIcons();
  // the forge, the lab and the shop breathe on their own (see placeBreath): sparks off the anvil, steam, dust in the window light
  drawPlaceBreath();
  if (kind === "yard" && L.filter(p => p.kind === "butterfly").length < 3) add({ kind: "butterfly", x: rand(N.x0, N.x1), y: rand(N.y0 - N.base, N.y1), ph: rand(0, TAU), col: pick(["#ffc4da", "#fff0b5", "#b8e6f5"]), life: 1e9 });
  ctx.save();
  for (const p of L) {
    p.t += dt;
    if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.kind === "spark") p.vy += 160 * dt; }
    const k = p.t / p.life, a = clamp(Math.min(p.t * 4, 1 - k), 0, 1);
    if (p.kind === "spark") { ctx.fillStyle = k < 0.5 ? "#fff0b5" : "#e0634f"; ctx.globalAlpha = a; ctx.fillRect(Math.round(p.x), Math.round(p.y), P, P); }
    else if (p.kind === "ember") { ctx.fillStyle = k < 0.4 ? "#eec26a" : "#e0634f"; ctx.globalAlpha = a; ctx.fillRect(Math.round(p.x + Math.sin(p.t * 4) * 3), Math.round(p.y), P, P); }
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
  const h = heroHere(); if (!h || h.none) return;
  for (let k = 0; k < 4; k++) setTimeout(() => sfx.voice(h.who.voice), k * 90);
  const kind = save.rooms[save.room].kind, seen = save.heroTalk?.[kind] || 0;
  let line = tr(heroWords(seen < h.hello.length ? h.hello[seen] : pick(h.lines)));
  // Pip wants to hear about every spark the glowlings bring home
  if (h.who === PIP && seen >= h.hello.length) line = sparkPipLine() || line;
  save.heroTalk = { ...save.heroTalk, [kind]: seen + 1 };
  // poked three times in a few seconds, Tansy curls up into a ball
  const prev = game.heroPokes && game.heroPokes.room === save.room ? game.heroPokes.list : [];
  const pokes = auto ? prev : [...prev.filter(p => game.time - p < 4000), game.time];
  game.heroPokes = { room: save.room, list: pokes };
  const curl = h.quirk === "curl" && pokes.length >= 3;
  // a keeper with a wish says it as soon as the hellos are done, then again every fourth word or so, for anyone who forgot;
  // one whose wishes have all come true says so once, and after that now and then (nothing is said, or counted as said, from inside a shell)
  const a = wishOf(kind), word = a ? a.ask : h.asks && h.calm;
  if (word && seen >= h.hello.length && !curl) {
    const told = wishTold(kind), gap = !told ? 3 : game.wishGap && game.wishGap.kind === kind ? game.wishGap.n : 2;
    if (!told || (a && gap >= 3)) { line = tr(word); save.wishes = { ...save.wishes, [kind]: bondOf(kind) + 1 }; game.wishGap = { kind, n: 0 }; }
    else { game.wishGap = { kind, n: gap + 1 }; if (!a && Math.random() < 1 / (h.lines.length + 1)) line = tr(word); }
  }
  if (curl) { line = tr(h.who === FENNEL ? "Mm. I'll just be in my shell a moment." : "Enough poking. Quills out."); game.heroPokes.list = []; sfx.knock && sfx.knock(0.4); }
  if (h.quirk === "sparks") placeBurst(18);
  if (h.quirk === "startle") setTimeout(() => sfx.voice({ ...h.who.voice, f: 900, len: 0.12, wave: "sawtooth", gain: 0.03 }), 120);
  game.hero = { t: game.time, line, room: save.room, curl, startle: h.quirk === "startle" };
  persist(); renderPlaceBar();
}
/** The bar under a place: who runs it, and the one thing to do there. */
function renderPlaceBar() {
  const h = isPlace() && heroHere(), bar = $("placeBar");
  bar.hidden = !h || game.scene !== "nest";
  if (!h) return;
  $("placeFace").src = h.none ? pxIcon(h.icon) : keeperFace(h.icon); $("placeFace").classList.toggle("small", !!h.none);
  // a keeper with wishes: a mark by the name for each one, lit once it's brought; the wish itself in one quiet line once they've said it,
  // and, when you have what they asked for, one clear button in that line's place (so the bar never grows over the room)
  const kind = save.rooms[save.room].kind, n = (h.asks || []).length, lit = Math.min(bondOf(kind), n), a = wishTold(kind) ? wishOf(kind) : null;
  $("placeWho").innerHTML = tr(h.who.name) + (n ? `<span class="marks" role="img" aria-label="${lit}/${n}">${h.asks.map((_, k) => ic(h.mark || "sparkle", k < lit ? "" : "off")).join("")}</span>` : "");
  $("placeRole").innerHTML = a && a.have() ? `<button class="act buy give" id="placeGive">${ic(h.mark || "sparkle")}${tr(a.btn)}</button>` : tr(h.role) + (a ? `<span class="wish">${tr(a.wish)}</span>` : "");
  $("placeActs").innerHTML = h.act.map(([icon, name], k) => `<button class="act buy" data-act="${k}">${ic(icon)}${tr(name)}</button>`).join("")
    + (h.none ? "" : `<button class="act" id="placeTalk">${ic("scroll")}${tr("Chat")}</button>`);
  $$("#placeActs [data-act]").forEach(b => b.addEventListener("click", () => { sfx.tick(); h.act[Number(b.dataset.act)][2](); }));
  $("placeTalk")?.addEventListener("click", () => tapHero());
  $("placeGive")?.addEventListener("click", bringWish);
}
/** Arriving at a place: its keeper says hello. */
function arriveAt(kind) {
  ensurePlace(kind);
  toRoomKind(kind);
  sfx.arrive(kind);
  // Wick on his bench, once the isle is found: whose light that is out at sea (the same talk as in talkMoments, for walking in from home)
  if (kind === "grotto" && wickHere() && wardFound("isle")) talk("wickLight");
  const h = HEROES[kind];
  if (h && (!(save.heroTalk || {})[kind] || (h.who === PIP && sparkNews()))) setTimeout(() => tapHero(true), 500);
  else if (kind === "yard") {
    const g = garden(), dry = g.slots.map((q, i) => [q, i]).filter(([q, i]) => q && waterPlot(i, FENNEL));
    if (dry.length) setTimeout(() => { game.hero = { t: game.time, line: tr("Mm. I watered your {0} 💧", dry.map(([q]) => seedName(q.seed).toLowerCase()).join(", ")), room: save.room }; }, 500);
  }
}
// ---------- passages between rooms: tunnels cut through the rock from one cave to the next ----------

/**
 * The home rooms are a row of caves, west to east, in the order they were carved: each room's left (west) wall opens onto the
 * one before it and its right (east) wall onto the one after, so you come into a room through the wall facing the way you
 * came. The rooms at the ends have a tunnel on their inner side only. New rooms come from the shop's Renovation, not from here.
 */
function roomDoors(i = save.room) {
  const homes = save.rooms.map((_, k) => k).filter(k => roomOpen(k) && !isOutside(k)), at = homes.indexOf(i), out = [];
  if (at < 0) return out;
  if (at > 0) out.push({ wall: "L", to: homes[at - 1] });
  if (at < homes.length - 1) out.push({ wall: "R", to: homes[at + 1] });
  return out;
}
/** The passages drawn and tappable right now. */
function passages() {
  if (isPlace() || game.scene !== "nest" || arrange.on) return [];
  return roomDoors();
}
let passageShapes = [];
/**
 * A tunnel's mouth on its wall, near the front end, in screen pixels: a rough round hole hacked through the rock, low and
 * broad-shouldered, standing on the floor. Both ends of a passage are cut alike: the hole is laid out across the wall from
 * its inner side to its outer one, so the left wall's is the right wall's in a mirror, the same size and the same nicks.
 */
function passageShape(wall) {
  // (never much taller than it is wide, so on a narrow screen it doesn't turn into a slit)
  const c = DOOR_AT, w = DOOR_W, span = 2 * w * Math.hypot(N.isoW, N.isoH), hgt = Math.min(N.isoWall * 0.5, N.base * 1.3, span * 1.3), n = 16;
  const at = f => wall === "R" ? isoAt(c - w + 2 * w * f, 0) : isoAt(0, c - w + 2 * w * f);
  const pts = [];
  for (let k = 0; k <= n; k++) {
    // a squared-off round: steep sides, a broad top, and here and there a chip out of the rock (the same chips at both ends)
    const f = k / n, rise = (1 - Math.abs(2 * f - 1) ** 3) ** (1 / 3), nick = k && k < n ? 0.16 * (pxHash(k, 306) - 0.5) : 0;
    const [x, y] = at(clamp(f + (k && k < n ? 0.05 * (pxHash(k, 307) - 0.5) : 0), 0, 1));
    pts.push([x, y - hgt * rise * (1 + nick)]);
  }
  return pts;
}
/** Which way is into the rock behind a wall, on screen: a tunnel's far end lies that way. */
const intoWall = (wall, d) => { const [x0, y0] = isoAt(DOOR_AT, DOOR_AT), [x1, y1] = wall === "R" ? isoAt(DOOR_AT, DOOR_AT - d) : isoAt(DOOR_AT - d, DOOR_AT); return [x1 - x0, y1 - y0]; };
/** A room's rock and its light: the cave it shows, as a wall ramp from dark to lit and the glow of its crystals. */
function caveColours(i) {
  const id = i === save.room ? currentTheme() : roomTheme(i, save.rooms[i].theme), art = caveArt(id, atHome(i));
  return { wall: art.wall, glow: art.glow, crystal: art.crystal };
}
/** Where a label w wide is centred to stay whole on the screen: over x if it fits there, else pulled in from the edge. */
const onScreen = (x, w, pad = 6) => clamp(x, pad + w / 2, W - pad - w / 2);
/**
 * Every tunnel mouth, by the one recipe, whichever end of the passage it is: the rim of this cave's own rock round a hole,
 * the jamb going back into the wall, the floor running in over a worn threshold, and at the far end, round the bend, the
 * light of the cave it leads to. Its name is written over it.
 */
function drawPassages() {
  passageShapes = [];
  for (const p of passages()) {
    const pts = passageShape(p.wall), P = Math.max(1, Math.round(PX)), here = caveColours(save.room), there = caveColours(p.to);
    const rock = here.wall, n = pts.length - 1, [dx, dy] = intoWall(p.wall, DOOR_W * 0.7);
    const midX = (pts[0][0] + pts[n][0]) / 2, bot = (pts[0][1] + pts[n][1]) / 2, top = Math.min(...pts.map(q => q[1]));
    // grown outward from the middle of its foot, for the rim (the foot stays on the floor)
    const grown = g => pts.map(([x, y], k) => { const ux = x - midX, uy = y - bot, l = Math.hypot(ux, uy) || 1; return k === 0 || k === n ? [x + Math.sign(ux) * g, y] : [x + ux / l * g, y + uy / l * g]; });
    // the far end: smaller (further off) and back into the rock
    const far = pts.map(([x, y]) => [midX + (x - midX) * 0.72 + dx, bot + (y - bot) * 0.78 + dy]);
    const trace = q => { ctx.beginPath(); q.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); };
    ctx.save();
    // the rim: a dark crack round the hole, then its lip of the wall's own rock catching the light
    ctx.fillStyle = rock[0]; trace(grown(P * 3)); ctx.fill();
    ctx.fillStyle = rock[3]; trace(grown(P * 1.5)); ctx.fill();
    // the jamb: the tunnel's sides in the rock's shadow, darker the further in
    trace(pts); ctx.fillStyle = rock[1]; ctx.fill();
    ctx.save(); trace(pts); ctx.clip();
    const farX = midX + dx, sh = ctx.createLinearGradient(midX, bot, farX, bot + dy);
    sh.addColorStop(0, hexA(rock[2], 0.6)); sh.addColorStop(1, hexA(rock[0], 0.9));
    ctx.fillStyle = sh; trace(pts); ctx.fill();
    // the threshold: the floor going in, a worn step at the mouth catching the light
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[n][0], pts[n][1]); ctx.lineTo(far[n][0], far[n][1]); ctx.lineTo(far[0][0], far[0][1]); ctx.closePath();
    ctx.fillStyle = rock[2]; ctx.fill();
    ctx.fillStyle = rock[4];
    for (let k = 0; k <= 8; k++) { const f = k / 8, x = pts[0][0] + (pts[n][0] - pts[0][0]) * f, y = pts[0][1] + (pts[n][1] - pts[0][1]) * f; ctx.fillRect(Math.round(x), Math.round(y - P * 2), P * 2, P); }
    // the far end, round the bend: the dark, and the next cave's light spilling up it and out over the floor
    trace(far); ctx.fillStyle = "#07040e"; ctx.fill();
    const fb = (far[0][1] + far[n][1]) / 2, ft = Math.min(...far.map(q => q[1])), gl = ctx.createLinearGradient(0, fb, 0, ft);
    gl.addColorStop(0, hexA(there.glow, 0.7)); gl.addColorStop(0.55, hexA(there.crystal[1], 0.3)); gl.addColorStop(1, hexA(there.crystal[0], 0));
    ctx.fillStyle = gl; trace(far); ctx.fill();
    const pool = ctx.createRadialGradient(farX, fb, 0, farX, fb, Math.abs(pts[n][0] - pts[0][0]) * 0.6);
    pool.addColorStop(0, hexA(there.glow, 0.45)); pool.addColorStop(1, hexA(there.glow, 0));
    ctx.fillStyle = pool; ctx.fillRect(midX - 200, top, 400, bot - top + P * 4);
    ctx.restore();
    // where it goes, written over the mouth, kept on the screen
    const label = roomName(p.to);
    fx.save(); fx.font = `400 ${Math.round(clamp(N.base * 0.2, 12, 16))}px ${PIXEL_FONT}`; fx.textAlign = "center";
    const lw = fx.measureText(label).width, lx = onScreen(midX, lw), ly = top - P * 3 - 4;
    fx.fillStyle = "#160c26"; for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) fx.fillText(label, lx + ox, ly + oy);
    fx.fillStyle = "#ffe9a8"; fx.fillText(label, lx, ly); fx.restore();
    ctx.restore();
    passageShapes.push({ p, pts, label: { x: lx, w: lw } });
  }
}
/** Which passage (if any) is under a finger. */
function passageAt(x, y) {
  for (const { p, pts } of passageShapes) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; }
    const minY = Math.min(...pts.map(q => q[1]));
    if (inside || (Math.abs(x - (pts[0][0] + pts[pts.length - 1][0]) / 2) < N.base * 0.4 && y > minY - 24 && y < pts[0][1] + 6)) return p;
  }
  return null;
}
/** Through a tunnel: out of this room's east wall is in at the next one's west wall, and back again. */
function goPassage(p) {
  sfx.tick(); goRoom(p.to, p.wall === "R" ? "L" : "R");
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
/** Into another room: through the arch on its wall `via` (L or R) when you walked there, else into the middle of it. */
function goRoom(i, via) {
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
  [N.bedX, N.bedY] = roomSpot("bed");
  // the room's own glowlings are here; the one you look after is one of them
  syncActors();
  const here = residents(i);
  if (here.length && !here.some(c => c.id === save.active)) save.active = here[0].id;
  // they wander in from the middle of the room; walking in through an arch, the one you look after comes with you, in at that wall
  const door = via && roomDoors(i).some(d => d.wall === via) && doorStep(via);
  for (const a of actors.values()) {
    const [x, y] = roomSpot("rug"), tx = x + rand(-1, 1) * N.base * 0.6, ty = y + rand(-0.5, 0.5) * N.base * 0.3, lead = door && a.id === save.active && a.state !== "sleep";
    [a.x, a.y] = lead ? door : [tx, ty];
    a.tx = tx; a.ty = ty; a.goal = a.friend = a.decor = null;
    if (a.state !== "sleep") { a.state = "idle"; a.t = rand(lead ? 2 : 0.5, lead ? 3 : 1.5); }
  }
  sfx.whoosh();
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
  return `<p class="me-hint">${tr("Tansy's cousin carves new rooms into the rock: each opens off the last one at home, through a new tunnel.")}</p>`
    + ROOM_KINDS.filter(k => k.cost).map(k => {
      const built = save.rooms.some(r => r.kind === k.id), soon = !built && next && next.id !== k.id;
      return `<div class="snack seed reno${built ? " built" : ""}"><img class="em reno-img" src="${themeThumb(k.theme || "amethyst", true)}" alt=""><span><b>${tr(k.name)}</b><small>${tr(k.note)}</small></span><span class="seed-btns">${built ? `<small class="only">${tr("built ✓")}</small>` : soon ? `<small class="only">${ic("lock")}${tr("next after {0}", tr(next.name).toLowerCase())}</small>` : `<button class="act buy" data-build="${k.id}" ${save.shards < k.cost ? "disabled" : ""}>✦ ${k.cost}</button>`}</span></div>`;
    }).join("")
    + `<h3 class="forge-h">${tr("Space at home")}</h3><div class="snack seed reno"><span class="em">${ic("nest", "big")}</span><span><b>${tr("Room for one more")}</b><small>${tr("each room fits {0} glowlings now", homeCap())}</small></span><span class="seed-btns">${cost ? `<button class="act buy" id="nestUp" ${save.shards < cost ? "disabled" : ""}>✦ ${cost}</button>` : `<small class="only">${tr("as roomy as it gets ✦")}</small>`}</span></div>`;
}
function buildRoom(id, quiet = false) {
  const kind = nextRoomKind();
  if (!kind || kind.id !== id || save.shards < kind.cost) return;
  save.shards -= kind.cost;
  save.rooms.push({ kind: kind.id, on: [], theme: kind.theme || null });
  sfx.levelUp(); buzz([12, 30, 12]);
  toast(tr("A new room: {0} ✦ it opens off the last room at home", tr(kind.name)));
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
/** Is there room on the floor for one more of this? (wall pieces don't take floor) */
const roomFor = id => !ISO_PLACES[id] || isoSpaceUsed() + ISO_PLACES[id].fw * ISO_PLACES[id].fd <= ISO_CAP;
function buyDecor(id) {
  const d = DECO[id], owned = save.decor[id];
  if (owned) {
    if (!owned.on && !roomFor(id)) { toast(tr("No room on the floor: put something away first")); sfx.tick(); return; }
    owned.on = !owned.on; owned.on ? sfx.setDown() : sfx.tick();
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
  // the moon's and the holidays' own, each by its season and its story (no longer all dancers by default)
  emberleaf: "curious", acornet: "curious", bloomkit: "hop", petalpup: "hop", frostpuff: "flutter", glimmerbug: "flutter",
  sunsplash: "swim", rimeling: "swim", gourdlet: "nap", twinklet: "dance",
};
const actors = new Map();

// ---------- home and exploring: the nest holds a few at a time, the others are off in the grotto ----------
const homeCap = () => (W < 520 ? 5 : 8) + (save.nestUp || 0);
/** Making the nest roomier: each step is one more place at home. */
const NEST_UP_COST = [150, 300, 500];
/**
 * Too many for the room: whoever came home last goes exploring (never the one you picked, never your very first
 * glowling, and not a sleeper if it can be helped), so the ones who've lived here longest stay. Room to spare: the
 * longest-gone explorer comes back. Returns who just left.
 */
function settleHome() {
  const cap = homeCap(), sent = [], homes = save.rooms.map((_, i) => i).filter(i => !isPlace(i));
  // nobody lives in the map's places: anyone filed under one belongs to the nest
  for (const c of save.creatures) if (isPlace(c.room || 0)) c.room = 0;
  for (const r of homes) {
    let home = residents(r);
    while (home.length > cap) {
      const others = home.filter(c => c.id !== save.active), free = others.filter(c => c !== save.creatures[0]), awake = free.filter(c => !c.sleeping);
      const c = (awake.length ? awake : free.length ? free : others).sort((p, q) => (q.homeAt || q.born || 0) - (p.homeAt || p.born || 0))[0];
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
  const hrs = (Date.now() - (c.outAt || Date.now())) / 3600e3, sparked = c.sparked;
  delete c.sparked;
  if (hrs < 0.05) return null;
  const shards = Math.min(30, Math.round(2 + hrs * 4));
  let geode = null;
  if (hrs > 2 && Math.random() < Math.min(0.4, hrs * 0.04)) {
    geode = pick(CRYSTALS.filter(k => k.rarity === (Math.random() < 0.2 ? "rare" : "common")));
    const g = save.geodes[geode.id] || { count: 0, shine: -1 };
    g.count++; save.geodes[geode.id] = g;
  }
  save.shards += shards;
  // a wander can bring a spark home too (the trip's own was already rolled when it came back)
  const spark = sparked ? null : bringSpark(c, hrs, false);
  // the gift shows over its head once it's back in the room
  setTimeout(() => {
    const a = actors.get(c.id);
    if (!a) return;
    const v = actorView(a);
    floatText(`+${shards} ✦${geode ? " 💎" : ""}${spark ? " ✨" : ""}`, v.x, v.y - v.size * 0.9, "#fff0b5");
    a.hop = 1; sfx.shimmer();
  }, 350);
  return { shards, geode, spark };
}
const findNote = (c, f) => !f ? "" : " · " + (f.geode ? tr("{0} brought back ✦ {1} and a {2} geode!", c.name, f.shards, CRYSTAL[f.geode.id].name) : tr("{0} brought back ✦ {1}", c.name, f.shards)) + (f.spark ? " · " + sparkNote(f.spark) : "");
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

const roomPoint = () => freeFloorPoint();

/** The things you can't stand inside, as flat ellipses on the floor. */
function roomObstacles() {
  // every placed piece is an ellipse over its tiles
  const out = [];
  for (const p of Object.values(isoLayout().placed)) { if (p.id === "bed") continue; const [x, y] = isoPieceAt(p); out.push({ id: p.id, x, y, rx: N.isoW / ISO_G * Math.max(p.fw, p.fd) * 0.9, ry: N.isoH / ISO_G * Math.max(p.fw, p.fd) * 0.9 }); }
  return out;
}
