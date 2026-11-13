"use strict";
// Hatchstone · input, buttons, backup codes, the glowpedia and postcards.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- input ----------

let pointer = null;
function handlePointerDown(x, y, now = performance.now(), remote = false) {
  if (game.scene === "menu") return;
  pointer = { x, y, t0: now, moved: 0, lx: x, ly: y };
  if (!remote) game.trail = game.scene === "crack" ? [{ x, y, t: now }] : [];
  if (!remote && coopIsGuest()) { coopSendInput("down", x, y); return; }
  if (game.scene === "crack" && game.egg.state === "cracking") hitEgg(x, y);
  if (game.scene === "crack" && game.egg.state === "polish") { sfx.rubOn(); pointer.lt = now; }
  if (game.scene === "catch" && game.catch) game.catch.tx = x;
  if (game.scene === "echo") { echoTap(x, y); return; }
  if (game.scene === "nest" && cloudAt(x, y)) { pointer.cloud = true; return; }
  if (game.scene === "nest" && arrange.on) { pointer.arrange = true; arrangeDown(x, y); return; }
  if (game.scene === "nest" && sweepDust(x, y)) { pointer = null; return; }
  if (game.scene === "nest" && !remote && wickAt(x, y)) { pointer = null; openWick(); return; }
  if (game.scene === "nest" && !remote && isPlace() && (heroAt(x, y) || propAt(x, y))) { pointer = null; tapHero(); return; }
  if (game.scene === "nest" && atIncubator(x, y)) pointer.warm = true;
  else if (game.scene === "nest" && !actorAt(x, y) && (pointer.decor = decorAt(x, y))) {
    if (pointer.decor.id === "lights") playDecor(pointer.decor);
  }
  else if (game.scene === "nest" && !actorAt(x, y) && y > N.y0 - N.base) { pointer.call = true; markTip("call"); game.nest.call = { x: clamp(x, N.x0, N.x1), y: clamp(y, N.y0, N.y1), t: game.time }; }
}
function handlePointerMove(x, y, now = performance.now(), remote = false) {
  if (game.scene === "catch" && game.catch) game.catch.tx = x;
  if (!pointer) return;
  const d = Math.hypot(x - pointer.lx, y - pointer.ly); pointer.moved += d;
  if (!remote && coopIsGuest()) { coopSendInput("move", x, y); pointer.lx = x; pointer.ly = y; game.trail.push({ x, y, t: now }); return; }
  if (game.scene === "crack") {
    if (game.egg.state === "polish") { const steps2 = Math.max(1, Math.ceil(d / (6 * L.k))); for (let i = 1; i <= steps2; i++) rub(lerp(pointer.lx, x, i / steps2), lerp(pointer.ly, y, i / steps2), d / steps2, (now - (pointer.lt || now)) / 1000 / steps2); pointer.lt = now; }
    if (!remote) game.trail.push({ x, y, t: now });
  }
  if (game.scene === "nest" && pointer.cloud) { if (pointer.moved > 6) { moveCloud(x, y); pointer.cloudMoved = true; } pointer.lx = x; pointer.ly = y; return; }
  if (game.scene === "nest" && pointer.arrange) { if (pointer.moved > 6) arrangeMove(x, y); pointer.lx = x; pointer.ly = y; return; }
  if (game.scene === "nest") {
    if (pointer.call) game.nest.call = { x: clamp(x, N.x0, N.x1), y: clamp(y, N.y0, N.y1), t: game.time };
    else if (pointer.warm) warmEgg(d);
    else if (pointer.decor) {
      const hit = decorAt(x, y);
      if (hit?.id === "lights" && hit.bulb !== pointer.decor.bulb) { pointer.decor = hit; playDecor(hit); }
    } else pet(x, y, d);
  }
  pointer.lx = x; pointer.ly = y;
}
function handlePointerUp(x, y, now = performance.now(), remote = false) {
  if (!pointer) return;
  if (pointer.cloud) { const moved = pointer.cloudMoved; pointer = null; if (moved) { persist(); sfx.tick(); } else playDecor({ id: "cushion" }); return; }
  if (pointer.arrange) { pointer = null; arrangeUp(); return; }
  const tap = pointer.moved < 10 && now - pointer.t0 < 350, calling = pointer.call, decorHit = pointer.decor;
  if (!remote && coopIsGuest()) { coopSendInput("up", x, y); pointer = null; return; }
  pointer = null;
  if (game.scene === "nest") { game.nest.petting = false; sfx.purrOff(); }
  sfx.rubOff(); if (!tap) return;
  if (game.scene === "nest" && !calling && atIncubator(x, y)) { tapIncubator(); return; }
  if (game.scene === "nest" && decorHit) { if (decorHit.id !== "lights") playDecor(decorHit); return; }
  if (game.scene === "crack") { const egg = game.egg; if (egg.state === "open" && Math.hypot(x - L.ecx, y - L.ecy) < L.ew * 0.25) { egg.hop = 1; sfx.chirp(egg.species.voice); } }
  if (game.scene === "nest" && !calling) { const a = actorAt(x, y); if (a && a.id !== save.active) selectCreature(a.id); else if (a) { const cr = activeCreature(), v = actorView(a); if (!cr.sleeping) { a.hop = 1; sfx.chirp(specOf(cr).voice); heart(v.x, v.y - v.size * 0.4); } } }
}
function handlePointerCancel(remote = false) { if (!remote && coopIsGuest()) coopSendInput("cancel"); pointer = null; game.nest.petting = false; sfx.purrOff(); sfx.rubOff(); }
cvs.addEventListener("pointerdown", e => { if (game.scene === "menu") return; try { cvs.setPointerCapture(e.pointerId); } catch {} handlePointerDown(e.clientX, e.clientY); });
cvs.addEventListener("pointermove", e => handlePointerMove(e.clientX, e.clientY));
cvs.addEventListener("pointerup", e => handlePointerUp(e.clientX, e.clientY));
cvs.addEventListener("pointercancel", () => handlePointerCancel());

/** Stroking a glowling: hearts, a purr, joy, and a little XP now and then. */
function pet(x, y, d) {
  const cr = activeCreature(), n = game.nest, a = activeActor();
  if (!cr || cr.sleeping || !a) return;
  const v = actorView(a);
  if (Math.hypot(x - v.x, y - v.y) > v.size * 0.7) { if (n.petting) { n.petting = false; sfx.purrOff(); } return; }
  if (!n.petting) { n.petting = true; sfx.purrOn(); }
  n.petDist += d;
  if (n.petDist > 45) {
    n.petDist = 0;
    heart(x, y - 10);
    if (!tipDone("pet")) { markTip("pet"); setHint(nestHint()); }
    if (!pointer || !pointer.petted) { if (pointer) pointer.petted = true; taskDone("pet"); bump("petted"); }
    cr.joy = clamp(cr.joy + 1.2, 0, 100);
    if (performance.now() - n.petXpT > 1500) { n.petXpT = performance.now(); addXP(cr, 1); persist(); renderNest(); }
  }
}

// ---------- buttons ----------

// The dialog shows one step at a time; each [data-v] element lists the steps it belongs to.
const COOP_LEADS = { start: tr("Crack an egg together with a friend 🥚"), invited: tr("You're invited to a shared egg 🥚"), invitedManual: tr("You're invited to a shared egg 🥚"),
  switchInvite: tr("Join your friend's room instead?"),
  replyTab: tr("Your friend's reply is here"), hostWait: tr("Send this link to your friend"), hostReady: tr("Your friend is here ✦ Pick an egg"),
  guest: tr("You're in 🥚"), manual: tr("Connect with codes") };
function coopView() {
  const s = coopSession;
  const view = s && coopPendingInvite ? "switchInvite" : s && s.mode === "manual" ? (s.role === "host" && s.peer?.connected ? "hostReady" : "manual")
    : s ? (s.role === "host" ? (s.peer?.connected ? "hostReady" : "hostWait") : "guest")
    : !$("coopJoinNow").hidden ? "invitedManual" : !$("coopCopyPending").hidden ? "replyTab"
    : coopInvited ? "invited" : "start";
  for (const el of $("coopDialog").querySelectorAll("[data-v]")) el.classList.toggle("off", !el.dataset.v.split(" ").includes(view));
  $("coopLead").textContent = COOP_LEADS[view];
  $("coopStatus").classList.toggle("off", view === "switchInvite");
  if (view === "manual") $("coopAdvanced").open = true;
  const manual = s && s.mode === "manual" ? s.role : "none";
  for (const el of $("coopDialog").querySelectorAll("[data-m]")) el.classList.toggle("off", el.dataset.m !== manual);
  // an invited friend only needs one big button
  $("coopJoinLink").className = view === "invited" ? "cta" : "act";
  return view;
}
var coopInvited = false;
var coopPendingInvite = null; // Memory only: opening another link must not replace a live room.
function coopShowRoom() {
  coopView();
  const on = !!coopSession && !!coopSession.peer;
  $("coopRoom").classList.toggle("on", on);
  $("coopRoomText").textContent = on ? tr("👯 {0} · {1}", tr(coopSession.role === "host" ? "Host" : "Guest"), tr(coopSession.peer.connected ? "connected" : "connecting")) : "👯 Shared room";
}
function coopLockSetup(locked) {
  for (const id of ["coopQuickHost", "coopJoinLink", "coopHost", "coopJoin"]) $(id).disabled = locked;
  $("coopLinkIn").disabled = locked;
}
function coopForgetLocationInvite() {
  if (location.hash.startsWith("#coop=")) history.replaceState(null, "", location.pathname + location.search);
}
function coopResetFields() {
  for (const id of ["coopInvite", "coopReply", "coopInviteIn", "coopReplyIn", "coopLinkOut", "coopLinkIn"]) $(id).value = "";
  coopUiStatus(""); coopUiError(""); coopLockSetup(false); $("coopJoinNow").hidden = $("coopCopyPending").hidden = true;
  $("coopLinkReady").hidden = true; $("coopAdvanced").open = false;
  $("coopCopyLink").disabled = $("coopShareLink").disabled = $("coopTelegram").disabled = true;
  $("coopBegin").disabled = true; $("coopBegin").hidden = true; $("coopAccept").disabled = false;
  coopInvited = false; coopPendingInvite = null; coopView();
}
function coopEnd(reason = "left", silent = false) {
  coopForgetLocationInvite();
  const old = coopSession;
  coopSession = null; game.coop = null; ++coopGeneration;
  if (old) { clearTimeout(old.connectTimer); clearInterval(old.beat); }
  if (old && old.peer && old.peer.connected && reason !== "partner-left" && reason !== "timeout") { try { old.peer.send({ type: "bye" }); } catch (e) {} }
  pointer = null; game.trail = []; game.pieces = []; sfx.purrOff(); sfx.rubOff();
  // when you walk away yourself, a moment for the goodbye to leave before the line closes
  if (old && old.peer) { if (reason === "left" || reason === "navigation") setTimeout(() => old.peer.close(reason), 200); else old.peer.close(reason); }
  $("coopRoom").classList.remove("on"); $("polishDone").hidden = true; show("coopDialog", false);
  // a finished shared egg keeps its card: the glowling is already in your nest, and your friend leaving mustn't hide it
  const keepCard = !$("found").classList.contains("hidden") && game.egg && game.egg.coopRewarded;
  if (keepCard) {
    $("nextLvl").disabled = false; $("nextLvl").textContent = tr("Back to the grotto");
    if (reason !== "navigation") $("foundNote").textContent = tr("Your friend left · {0} is in your nest ✦", (activeCreature() || {}).name || "");
  } else {
    show("found", false);
    if (game.egg && game.egg.conf && game.egg.conf.coop) game.egg = null;
    if (game.scene === "crack" || game.scene === "found") setScene("map");
  }
  if (!silent && reason && reason !== "left") toast(tr("Shared room ended"));
  coopResetFields();
}
function coopOpenDialog() {
  game.coopTouched = true;
  sfx.tick();
  if ($("coopDialog").classList.contains("hidden")) coopReturnFocus = document.activeElement;
  if (!coopSession) coopResetFields();
  else coopShowRoom();
  if (!globalThis.HatchstoneLink || !globalThis.HatchstoneInvite || !coopWire || typeof RTCPeerConnection === "undefined" || !window.isSecureContext) {
    coopLockSetup(true);
    coopUiError(tr("Online co-op needs WebRTC over HTTPS or localhost. From Telegram, try opening this link in Chrome or Safari. Solo play still works."));
  }
  show("coopDialog", true);
  $("coopTitle").tabIndex = -1; $("coopTitle").focus();
}
function coopReportFailure(s, message) {
  if (!coopLive(s)) return;
  coopEnd("failed", true); coopOpenDialog(); coopUiError(message);
}
async function coopHostLink() {
  if (coopSession) return;
  sfx.init(); if (sfx.ac?.state === "suspended") sfx.ac.resume().catch(() => {});
  coopForgetLocationInvite(); coopUiError(""); coopUiStatus(tr("Making your link…")); coopLockSetup(true);
  const s = coopSetSession("host", "invite");
  try {
    const token = await s.peer.host();
    if (!coopLive(s)) return;
    $("coopLinkOut").value = globalThis.HatchstoneInvite.inviteUrl(location.href, token);
    $("coopLinkReady").hidden = false; $("coopCopyLink").disabled = $("coopShareLink").disabled = $("coopTelegram").disabled = false;
    $("coopShareLink").hidden = !navigator.share;
    coopUiStatus(tr("Keep this tab open until they join."));
    coopShowRoom();
  } catch (err) { coopReportFailure(s, err.message || tr("Could not create an invite link. Try Advanced or another network.")); }
}
async function coopJoinLink() {
  if (coopSession) { coopOfferIncomingInvite($("coopLinkIn").value.trim(), "invite"); return; }
  let token;
  try { token = globalThis.HatchstoneInvite.parseInvite($("coopLinkIn").value.trim()); }
  catch (err) { coopUiError(err.message || tr("Open or paste a complete invite link first.")); return; }
  sfx.init(); if (sfx.ac?.state === "suspended") sfx.ac.resume().catch(() => {});
  coopForgetLocationInvite(); coopUiError(""); coopUiStatus("Joining…"); coopLockSetup(true);
  const s = coopSetSession("guest", "invite");
  try {
    await s.peer.join(token);
    if (!coopLive(s)) return;
    coopUiStatus(tr("Waiting for your friend to start the egg…")); coopShowRoom();
  } catch (err) { coopReportFailure(s, err.message || tr("Could not join. Ask for a fresh invite or try another network.")); }
}
function coopImportLocationInvite() {
  if (!location.hash.startsWith("#coop=")) return;
  if (coopSession) { coopOfferIncomingInvite(location.href, "invite"); return; }
  coopOpenDialog();
  try {
    globalThis.HatchstoneInvite.parseInvite(location.href);
    $("coopLinkIn").value = location.href;
    coopInvited = true; coopView();
    if (!$("coopJoinLink").disabled) $("coopJoinLink").focus();
  } catch (err) { coopUiError(err.message || tr("This invite link is incomplete. Ask your friend for a fresh link.")); }
}
function coopOfferIncomingInvite(input, mode) {
  // Validate before offering to close anything; malformed/self links keep the existing room.
  coopPendingInvite = null;
  coopForgetLocationInvite();
  coopOpenDialog();
  let code, room;
  try {
    if (mode === "invite") {
      code = globalThis.HatchstoneInvite.parseInvite(input);
      room = code.slice(3, 27);
    } else {
      code = input;
      const signal = globalThis.HatchstoneLink.decodeSignal(code);
      if (signal.type !== "offer") throw new Error("Expected an offer invite");
      room = signal.room;
    }
  } catch {
    coopUiError(tr("This invite link is incomplete or invalid. Ask your friend for a fresh link; your current room is still open."));
    return;
  }
  const s = coopSession;
  if (!s) return;
  if (s.mode === mode && s.peer?.room === room) {
    coopUiError(s.role === "host" ? tr("This is your own invite. Send it to your friend and keep this tab open.") : tr("You're already in this room. Your friend can start the shared egg."));
    return;
  }
  coopPendingInvite = { code, mode };
  coopUiError(""); coopView(); $("coopSwitchJoin").focus();
}
function coopKeepCurrentRoom() {
  coopPendingInvite = null; coopForgetLocationInvite(); coopUiError(""); coopShowRoom();
}
function coopSwitchToInvite() {
  const pending = coopPendingInvite;
  if (!pending || !coopSession) return;
  // The explicit switch is the only action that ends the old room and starts a new connection.
  coopEnd("switched", true); coopOpenDialog();
  if (pending.mode === "invite") { $("coopLinkIn").value = pending.code; coopJoinLink(); }
  else { $("coopInviteIn").value = pending.code; coopJoin(); }
}
async function coopHost() {
  sfx.init(); if (sfx.ac?.state === "suspended") sfx.ac.resume().catch(() => {});
  coopUiError(""); coopUiStatus(tr("Making a private manual invite…")); coopLockSetup(true);
  const s = coopSetSession("host");
  try {
    const invite = await s.peer.host();
    if (!coopLive(s)) return;
    $("coopInvite").value = invite; $("coopAccept").disabled = false; coopUiStatus(""); coopShowRoom();
  } catch (err) { coopReportFailure(s, err.message || tr("Could not create an invite")); }
}
async function coopJoin() {
  const invite = coopCodeFrom($("coopInviteIn").value, "join");
  if (!invite) { coopUiError(tr("Paste the host invite first.")); return; }
  sfx.init(); if (sfx.ac?.state === "suspended") sfx.ac.resume().catch(() => {});
  coopUiError(""); coopUiStatus(tr("Joining with manual codes…")); coopLockSetup(true); $("coopJoinNow").hidden = true;
  const s = coopSetSession("guest");
  try {
    const reply = await s.peer.join(invite);
    if (!coopLive(s)) return;
    $("coopReply").value = reply; coopUiStatus(tr("Then wait here for the shared egg.")); coopShowRoom();
    $("coopAdvanced").open = true; $("coopSendReply").scrollIntoView({ block: "center", behavior: "smooth" });
  } catch (err) { coopReportFailure(s, err.message || tr("Could not join that invite")); }
}
async function coopAccept() {
  const s = coopSession, reply = coopCodeFrom($("coopReplyIn").value, "reply");
  if (!s || s.role !== "host" || !reply) { coopUiError(tr("Paste the guest reply first.")); return; }
  try {
    await s.peer.accept(reply); if (!coopLive(s)) return;
    if (!s.peer.connected) s.connectTimer = setTimeout(() => {
      coopReportFailure(s, tr("Connection timed out. Try fresh codes or a different network; this game has no TURN relay."));
    }, 30000);
    coopUiStatus(tr("Guest accepted ✓ Waiting for the direct connection…")); $("coopBegin").disabled = !s.peer.connected; coopShowRoom();
  }
  catch (err) { if (coopLive(s)) coopUiError(err.message || tr("That reply does not match this invite")); }
}
function coopStartRound() {
  const s = coopSession;
  if (!s || s.role !== "host" || !s.peer.connected) return;
  if (s.round && game.egg?.conf.coop && !game.egg.coopRewarded) { coopUiError(tr("Finish this shared egg before starting another.")); return; }
  if (s.rounds.size >= 128) { coopEnd("room-limit"); return; }
  const step = Number($("coopDifficulty").value);
  if (![1, 4, 8].includes(step)) return;
  sfx.init(); if (sfx.ac && sfx.ac.state === "suspended") sfx.ac.resume();
  const conf = { ...levelConf(step), n: 0, wander: true, coop: true };
  game.chips = []; game.sparks = []; show("start", false); setScene("crack"); newEgg(conf, true);
  const r = coopBlueprintFromEgg(game.egg);
  if (!r) { coopUiError(tr("Could not make a valid shared egg.")); coopEnd("invalid-round", true); return; }
  s.round = r; s.rounds.add(r.id); game.egg.coopBlueprint = r; s.stateSeq = 0; s.lastStateSeq = -1; s.remotePointer = null; s.remoteCursor = null; pointer = null;
  const state = coopSnapshot(game.egg, 0);
  if (!state || !s.peer.send({ type: "round", round: r, state })) { coopUiError(tr("The shared egg could not be sent.")); coopEnd("send-failed", true); return; }
  s.lastStateSeq = 0; show("coopDialog", false); coopShowRoom(); coopUiStatus(tr("Shared egg started — trace together ✦"));
}
function coopFinishPolish() {
  if (coopIsGuest()) coopSendInput("finish");
  else finishPolish();
}

$("startCoop").addEventListener("click", coopOpenDialog);
$("mapCoop").addEventListener("click", coopOpenDialog);
$("coopRoom").addEventListener("click", e => { if (e.target.id !== "coopRoomLeave") coopOpenDialog(); });
$("coopRoom").addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.id === "coopRoom") { e.preventDefault(); coopOpenDialog(); } });
$("coopRoomLeave").addEventListener("click", () => coopEnd("left"));
$("coopQuickHost").addEventListener("click", coopHostLink);
$("coopJoinLink").addEventListener("click", coopJoinLink);
$("coopSwitchJoin").addEventListener("click", coopSwitchToInvite);
$("coopKeepRoom").addEventListener("click", coopKeepCurrentRoom);
$("coopCopyLink").addEventListener("click", () => coopCopy($("coopLinkOut").value, "Invite link", "coopLinkOut"));
$("coopShareLink").addEventListener("click", async () => {
  const url = $("coopLinkOut").value;
  if (!url || $("coopShareLink").disabled) return;
  try { await navigator.share({ title: "Hatchstone", text: tr("Crack a Hatchstone egg with me 🥚✨ Tap to join:"), url }); } catch (e) { if (e.name !== "AbortError") coopCopy(url, "Invite link", "coopLinkOut"); }
});
$("coopTelegram").addEventListener("click", () => {
  if ($("coopLinkOut").value && !$("coopTelegram").disabled) window.open(globalThis.HatchstoneInvite.telegramUrl($("coopLinkOut").value), "_blank", "noopener,noreferrer");
});
$("coopHost").addEventListener("click", coopHost);
$("coopJoin").addEventListener("click", coopJoin);
$("coopJoinNow").addEventListener("click", coopJoin);
$("coopCopyPending").addEventListener("click", () => coopCopy($("coopReplyIn").value, "Reply"));
$("coopAccept").addEventListener("click", coopAccept);
$("coopBegin").addEventListener("click", coopStartRound);
$("coopCopyInvite").addEventListener("click", () => coopCopy($("coopInvite").value, "Invite"));
$("coopCopyReply").addEventListener("click", () => coopCopy($("coopReply").value, "Reply"));
$("coopSendInvite").addEventListener("click", () => coopSendLink("join", $("coopInvite").value));
$("coopSendReply").addEventListener("click", () => coopSendLink("reply", $("coopReply").value));
addEventListener("hashchange", coopOpenLink);
addEventListener("storage", e => { if (e.key === COOP_REPLY_KEY && e.newValue) coopTakeReply(); });
addEventListener("visibilitychange", () => { if (!document.hidden) coopTakeReply(); });
setTimeout(coopOpenLink);
$("coopClose").addEventListener("click", () => {
  const declinedInvite = !!coopPendingInvite;
  coopPendingInvite = null;
  coopForgetLocationInvite();
  if (declinedInvite || coopSession?.peer.connected) { coopView(); show("coopDialog", false); }
  else coopEnd("cancelled", true);
  if (coopReturnFocus?.isConnected && !coopReturnFocus.closest(".hidden")) coopReturnFocus.focus();
});
$("coopDialog").addEventListener("keydown", e => {
  if (e.key === "Escape") { e.preventDefault(); $("coopClose").click(); return; }
  if (e.key !== "Tab") return;
  const items = [...$("coopDialog").querySelectorAll("button:not(:disabled),input:not(:disabled),select,summary,a[href]")].filter(el => el.getClientRects().length);
  const first = items[0], last = items[items.length - 1];
  if (!items.length) return;
  if (!items.includes(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
$("coopLeave").addEventListener("click", () => coopEnd("left"));
$$(".lang-btn").forEach(b => {
  const to = LANG === "uk" ? "en" : "uk";
  b.innerHTML = ic("flag" + to) + (b.classList.contains("menu-only") ? (to === "uk" ? "Українська" : "English") : "");
  b.setAttribute("aria-label", to === "uk" ? "Українська мова" : "English language");
  b.title = to === "uk" ? "Українська" : "English";
  b.addEventListener("click", () => setLang(to));
});

if (save.creatures.length) {
  $("play").textContent = tr("Continue");
  const n = save.creatures.length, pet = activeCreature();
  $("startNew").hidden = true; $("startBack").hidden = false;
  $("startBackSub").textContent = n > 1 ? tr("{0} and {1} more are waiting in your nest ✦", pet.name, n - 1) : tr("{0} is waiting in your nest ✦", pet.name);
  $("pixelGrotto").setAttribute("aria-label", tr("{0} waiting in a pixel-art grotto by moonlight", pet.name));
}

// what an older save had already been through, so returning players skip the beginner dialogs
if (!save.talks && save.creatures.length) talkOld = { intro: 1, firstPet: 1, firstGrotto: 1, firstForge: 1, firstGrow: save.creatures.some(c => stageOf(c.level) > 0),
  ch1: unlocked(7), ch2: unlocked(13), ch3: unlocked(19), allClear: unlocked(LEVELS + 1), shiny: save.creatures.some(c => c.shiny), legendary: save.creatures.some(c => rarityOf(specOf(c)) === "legendary") };

$("play").addEventListener("click", () => {
  sfx.init();
  if (sfx.ac && sfx.ac.state === "suspended") sfx.ac.resume();
  show("start", false);
  setScene("nest");
  if (!save.creatures.length) talk("intro");
});
$$(".mute").forEach(b => b.addEventListener("click", () => {
  sfx.setMuted(!sfx.muted);
  $$(".mute").forEach(m => { m.innerHTML = ic(sfx.muted ? "mute" : "sound") + (m.dataset.label ? (sfx.muted ? tr("Sound off") : tr("Sound on")) : ""); });
}));
$$("#tabs [data-tab]").forEach(b => b.addEventListener("click", () => {
  if ($("tabs").inert || (coopSession?.round && game.scene === "crack")) return;
  sfx.tick(); if (coopSession) coopEnd("navigation", true);
  if (b.dataset.tab === "nest" && game.scene === "nest" && awayPlace()) goRoom(save.rooms.findIndex(r => r.kind === "nest"));
  setScene(b.dataset.tab);
}));
// the big middle button: straight into the next egg, from anywhere
$("crackTab").addEventListener("click", () => {
  if ($("tabs").inert || (coopSession?.round && game.scene === "crack")) return;
  if (coopSession) coopEnd("navigation", true);
  startLevel(nextLevel());
});
$("worldTab").addEventListener("click", () => {
  if ($("tabs").inert || (coopSession?.round && game.scene === "crack")) return;
  openWorld();
});
$("worldClose").addEventListener("click", () => show("worldSheet", false));
$("quit").addEventListener("click", () => {
  if (coopSession) { coopEnd("left"); return; }
  const e = game.egg;
  const started = e && e.state === "cracking" && e.taps > 0;
  if (started) { sfx.tick(); show("confirmLeave", true); return; }
  if (e && e.paid && !e.taps) { e.paid = false; oilNow(); save.oil.n++; persist(); updateTopbar(); }
  setScene("map");
});
$("keepCracking").addEventListener("click", () => show("confirmLeave", false));
$("leaveEgg").addEventListener("click", () => { show("confirmLeave", false); if (coopSession) coopEnd("left"); else setScene("map"); });
$("nextLvl").addEventListener("click", () => {
  const conf = game.egg.conf;
  if (conf.coop && !coopSession) { game.egg = null; return setScene("map"); }
  if (conf.coop) { if (coopIsHost()) coopStartRound(); return; }
  if (conf.moon) return setScene("map");
  startLevel(conf.wander || conf.n >= LEVELS ? 0 : conf.n + 1);
});
$("foundNest").addEventListener("click", () => { if (coopSession) coopEnd("navigation", true); setScene("nest"); });
$("foundShare").addEventListener("click", shareFound);
$("switcher").addEventListener("scroll", switchArrows, { passive: true });
addEventListener("resize", () => requestAnimationFrame(() => { switchArrows(); fitTopbar(); }));
for (const [id, dir] of [["swPrev", -1], ["swNext", 1]]) $(id).addEventListener("click", () => { sfx.tick(); const sw = $("switcher"); sw.scrollBy({ left: dir * sw.clientWidth * 0.8, behavior: "smooth" }); });
$("arrangeFlip").addEventListener("click", arrangeFlip);
$("arrangeStore").addEventListener("click", arrangeStore);
$("arrangeDone").addEventListener("click", () => { sfx.tick(); stopArrange(); });
$("firstEgg").addEventListener("click", () => startLevel(nextLevel() || 1));
$("nestShare").addEventListener("click", () => { const cr = activeCreature(); if (cr) shareCreature(cr); });
$("polishDone").addEventListener("click", coopFinishPolish);
$("decorBtn").addEventListener("click", () => {
  if ($("tabs").inert || (coopSession?.round && game.scene === "crack")) return;
  if (coopSession) coopEnd("navigation", true);
  if (game.scene !== "nest") setScene("nest");
  if (isPlace()) toRoomKind("nest");
  openChest();
});
/** Tapping your shards and stars: they jingle, a few fly out, and a little card says what they're for. */
function tapWallet(ev) {
  ev.stopPropagation();
  const pill = $("walletPill"), tip = $("walletTip"), open = tip.hidden;
  sfx.shimmer(); buzz(8);
  pill.classList.remove("jingle"); void pill.offsetWidth; pill.classList.add("jingle");
  const box = pill.getBoundingClientRect(), shards = $("shardPill").getBoundingClientRect(), stars = $("starPill").getBoundingClientRect();
  for (let i = 0; i < 7; i++) {
    const star = i % 3 === 2, from = star ? stars : shards, el = document.createElement("i");
    el.className = "wallet-fly";
    el.style.backgroundImage = `url(${pxIcon(star ? "star" : "shard")})`;
    el.style.left = `${from.left + 10}px`; el.style.top = `${from.top + from.height / 2 - 8}px`;
    el.style.setProperty("--dx", `${rand(-40, 40)}px`); el.style.setProperty("--dy", `${rand(30, 70)}px`); el.style.setProperty("--r", `${rand(-180, 180)}deg`);
    el.style.animationDelay = `${i * 30}ms`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }
  tip.hidden = !open;
  pill.setAttribute("aria-expanded", String(open));
  if (!open) return;
  const n = totalStars(), max = LEVELS * 3;
  tip.innerHTML = `<p>${ic("shard")}<span><b>${tr("{0} shards", save.shards)}</b>${tr("Spend them on snacks, decor and the Forge. They come from geodes, daily tasks and the moon egg.")}</span></p>`
    + `<p>${ic("star")}<span><b>${tr("{0} of {1} stars", n, max)}</b>${tr("Up to three for each level of the Grotto: hit the weak spot to crack the egg in fewer taps.")}</span></p>`;
  tip.style.left = `${Math.max(8, box.left)}px`; tip.style.top = `${box.bottom + 8}px`;
  clearTimeout(tapWallet.t);
  tapWallet.t = setTimeout(() => { tip.hidden = true; pill.setAttribute("aria-expanded", "false"); }, 6000);
}
$("walletPill").addEventListener("click", tapWallet);
document.addEventListener("click", ev => { if (!ev.target.closest("#walletTip, #walletPill") && !$("walletTip").hidden) { $("walletTip").hidden = true; $("walletPill").setAttribute("aria-expanded", "false"); } });
$("incClose").addEventListener("click", () => show("incubator", false));
$("shopClose").addEventListener("click", () => show("shop", false));
setInterval(updateCalls, 20000);

// the menu: rarely used things (co-op, backup, sound) live behind one button, so the top bar stays calm
function setMenu(open) {
  $("menuSheet").hidden = !open;
  $("menuBtn").setAttribute("aria-expanded", String(open));
}
$("menuBtn").addEventListener("click", ev => { ev.stopPropagation(); sfx.tick(); setMenu($("menuSheet").hidden); });
$("menuSheet").addEventListener("click", ev => { if (ev.target.closest("#mapCoop, #backupBtn")) setMenu(false); });
document.addEventListener("click", ev => { if (!ev.target.closest(".menu-wrap")) setMenu(false); });

// tapping the dimmed space around a card closes it (not for questions that need an answer)
$$(".overlay.modal").forEach(o => o.addEventListener("click", ev => {
  if (ev.target === o && !["coopDialog", "confirmLeave", "incubator"].includes(o.id)) { sfx.tick(); show(o.id, false); if (o.id === "forge" && game.scene === "map") renderMap(); }
}));

// every button answers your finger: a soft click and, where the phone can, the lightest buzz
document.addEventListener("pointerdown", ev => {
  if (!ev.target.closest("button:not(:disabled), .btn")) return;
  sfx.press();
  buzz(6);
}, { passive: true });
$("taskPill").addEventListener("click", openTasks);
$("oilPill").addEventListener("click", () => { sfx.tick(); openLantern(); });
$("lanternClose").addEventListener("click", () => show("lantern", false));
$("oilHelp").addEventListener("click", () => { const m = $("lanternFree"); m.hidden = !m.hidden; $("oilHelp").setAttribute("aria-expanded", String(!m.hidden)); sfx.tick(); });
setInterval(() => { if ($("topbar").classList.contains("on")) renderOilPill(); }, 1000);
const FAQ_SECTIONS = [["basics", "egg", "Basics", [0, 1, 14, 15, 11, 12, 13]], ["pets", "heart", "Glowlings", [2, 16, 5, 17, 18, 19, 20]], ["nest", "nest", "Nest", [21, 22, 3]],
  ["grotto", "grotto", "Grotto & story", [4, 23, 24, 25]], ["save", "duo", "Friends & saving", [6, 7, 9]], ["about", "help", "About", [8, 10, 26]]];
const FAQ = [["What do I do in this game?", "Crack stone eggs, meet the glowling inside, and raise it in your nest. Cracking earns shards and stars; the nest is where your glowlings live, play and grow."], ["How do I get three stars?", "Find the weak spot: aim for the glow, or from level 4 listen for the knock that rings higher. Hitting it cracks the egg in fewer taps, and fewer taps means more stars."], ["How do I look after my glowling?", "Stroke it with your finger, feed it snacks, play sparkle catch and tuck it in when it's sleepy. A happy glowling earns XP and grows up to level 20. The glowing button shows what it needs right now. A well-rested, happy glowling also cheers you on when you crack an egg: a few more shards."], ["What are shards for?", "Snacks, decorations for the nest and hammer upgrades at the Forge. You get them from geodes, daily tasks and the moon egg."], ["What is the moon egg?", "One special egg a day in the Grotto. Open it every day to build a streak: the longer the streak, the more shards."], ["Can my glowlings have a baby?", "Yes. Two happy glowlings at level 5 or higher can lay a mixed egg in the incubator (the glass dome in the lab: find it on the map). The baby mixes both parents and hatches in about 3 hours; stroke the egg to speed it up."], ["Can I play with a friend?", "Yes: open the menu (⚙) and tap Play together. You send a link, your friend opens it, and you crack one egg together, each on your own phone."], ["Where is my progress saved?", "In this browser, on this device. Make a backup code in the menu (⚙ → Back up nest) and keep it somewhere safe: it brings your nest back on any device. On iPhone, add the game to your Home Screen so Safari doesn't clear it."], ["Is it free? Are there ads?", "Free, with no ads, no account and no purchases. Everything stays on your device."], ["How do I turn the sound off, or change the language?", "Sound is in the menu (⚙). The flag in the corner switches between English and Ukrainian. Headphones make the cracks sound best."], ["Who made Hatchstone?", "Made with care by helavika, in free evenings. [Code on GitHub](https://github.com/helavika/hatchstone) · more work in my [portfolio](https://helavika.github.io/helavika-portfolio/) · ideas and bugs welcome [on GitHub](https://github.com/helavika/hatchstone/issues/new)."], ["What is the lantern?", "Every trip into the Grotto takes a drop of lantern oil. The lantern holds 5 drops, and one comes back every 20 minutes. Bars fill it right away: a firefly square gives 1 drop, a nut bar 3, and a star bar fills it to the brim. Moon eggs, playing together and levels you already have ★★★ on don't use oil."], ["Where do I get bars?", "From daily tasks (finish all of them for a nut bar), when a glowling reaches a new level, from moon eggs (every third night in a row brings a star bar), from a good round of Echo song, and now and then from the rubble of a geode."], ["What are daily tasks?", "A few small things to do each day: tap the tasks counter at the top. Each one gives 10 shards, and finishing them all gives 15 more and a nut bar."], ["Why polish a geode?", "When a geode opens, rub it with your finger to make it shine. The shinier it gets, the more shards you earn. Tap the button when you're happy with it."], ["What is the Forge?", "Spend shards on your hammer: harder taps crack eggs faster, and keener eyes help you find the weak spot. The deeper caves have tougher stone, so upgrades help a lot there."], ["What games can I play with my glowling?", "Tap Play in the nest. Sparkle catch: drag to catch sparkles and dodge pebbles. Echo song: listen to the tune the stones sing, then sing it back. Playing makes a glowling happy, but it tires them out, so let them nap."], ["What does shiny mean?", "Now and then a glowling hatches shiny, with a sparkly look of its own: about 1 in 25 from geodes and 1 in 10 from moon eggs."], ["Can my glowling wear things?", "Yes: Decor → Wear. Buy an accessory once and any glowling can wear it. Tap it again to take it off."], ["Can I send a picture of my glowling?", "Yes: tap the postcard button next to your glowling's name in the nest. You get a pixel postcard to save or send to a friend."], ["Why aren't all my glowlings at home?", "The nest fits only a few at once; the others are out exploring the grotto, having a lovely time. Tap one in the row under the nest to call them home. Tap the \"at home\" counter to make room for one more, for shards."], ["How do I decorate the nest?", "Open Decor in the nest. Furniture is sorted into Comfort, Light, Toys and Pretty things: tap something to see who loves it, then buy or place it. Glowlings visit the things they love. Look changes the view and the backdrop, and new backdrops open as you go deeper. In the isometric view you can rearrange the room."], ["How do rooms work?", "The nest is your first room. Add more in Decor → Rooms: a playroom, a garden room and a crystal study. Each room has its own furniture, backdrop and bed. Switch rooms with the arrows at the sides of the nest."], ["What are events?", "A few weeks a year the grotto celebrates: Spring Bloom, Firefly Nights, Harvest Moon, Hollow Night, First Frost and Winter Lights. During an event a limited glowling sleeps in the moon egg and the sky over the grotto changes. Look for the banner in the Grotto."], ["Is there a story?", "Yes. Mossa, the old stone who keeps the grotto, tells it a little at a time as you go deeper, and a couple of friends join in along the way. Every part you've heard stays in the Book → Story to read again."], ["What happens after level 24?", "Wander opens: endless geodes from the deepest caves, as many as you like. The moon egg and events keep coming too."]];
FAQ.push(["What happens to my data?", "Nothing leaves your device unless you send it: no accounts, no ads, no analytics. The whole story is on the [privacy page](https://helavika.github.io/hatchstone/privacy.html)."]);
function openFaq() {
  sfx.tick();
  const esc = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  // [words](https://…) in an answer becomes a link that opens in a new tab
  const links = t => t.replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, (_, w, u) => `<a href="${u}" target="_blank" rel="noopener">${w}</a>`);
  const sec = FAQ_SECTIONS.find(x => x[0] === openFaq.tab) || FAQ_SECTIONS[0];
  $("faqList").innerHTML = `<div class="shop-tabs three">${FAQ_SECTIONS.map(([id, icon, name]) => `<button data-faqtab="${id}" class="${id === sec[0] ? "on" : ""}">${ic(icon)}<span>${tr(name)}</span></button>`).join("")}</div>`
    + sec[3].map((n, i) => { const [q, a] = FAQ[n]; return `<details${i ? "" : " open"}><summary>${esc(tr(q))}</summary><p>${links(esc(tr(a)))}</p></details>`; }).join("");
  $$("#faqList [data-faqtab]").forEach(b => b.addEventListener("click", () => { openFaq.tab = b.dataset.faqtab; openFaq(); }));
  show("faq", true);
}
$$(".faq-btn").forEach(b => b.addEventListener("click", ev => { ev.stopPropagation(); setMenu(false); openFaq(); }));
$("faqClose").addEventListener("click", () => show("faq", false));
$("tasksClose").addEventListener("click", () => show("tasks", false));
$("forgeClose").addEventListener("click", () => { show("forge", false); if (game.scene === "map") renderMap(); });
$("foundForge").addEventListener("click", openForge);
$("foundMap").addEventListener("click", () => { if (coopSession) coopEnd("navigation", true); setScene("map"); });
$("feedBtn").addEventListener("click", openSnacks);
$("snackClose").addEventListener("click", () => show("snacks", false));
$("jukeClose").addEventListener("click", () => show("jukebox", false));
$("gardenClose").addEventListener("click", () => show("gardenSheet", false));
$("wickClose").addEventListener("click", () => show("wickSheet", false));
$("tripsClose").addEventListener("click", () => { show("tripsSheet", false); if (game.scene === "map") renderMap(); });
$("startMore").addEventListener("click", ev => { ev.stopPropagation(); const c = $("startCorner"); c.classList.toggle("open"); $("startMore").setAttribute("aria-expanded", String(c.classList.contains("open"))); sfx.tick(); });
document.addEventListener("click", ev => { if (!ev.target.closest("#startCorner")) $("startCorner").classList.remove("open"); });
$("optsBtn").addEventListener("click", () => { setMenu(false); openOpts(); });
$("fbBtn").addEventListener("click", () => { setMenu(false); openFeedback(); });
$("fbClose").addEventListener("click", () => show("fbSheet", false));
$("fbIdea").addEventListener("click", () => sendFeedback("idea"));
$("fbBug").addEventListener("click", () => sendFeedback("bug"));
$("fbCopy").addEventListener("click", async () => {
  const words = $("fbText").value.trim();
  if (!words) { $("fbText").focus(); toast(tr("Write a few words first ✎")); return; }
  try { await navigator.clipboard.writeText(`${words}\n\n---\n${feedbackInfo()}`); toast(tr("Copied ✓")); } catch (e) { toast(tr("Couldn't copy: select the text and copy it yourself")); }
});
$("optsClose").addEventListener("click", () => show("optsSheet", false));
$("meBtn").addEventListener("click", () => { setMenu(false); openMe(); });
$("meClose").addEventListener("click", () => { saveMe(); show("meSheet", false); if (afterMe) { const f = afterMe; afterMe = null; f(); } });
// a Save button shows up once there's something to save (and always the first time, when Mossa asks your name)
$("meName").addEventListener("input", () => { $("meSave").hidden = !$("meSave").dataset.first && $("meName").value.trim().slice(0, 18) === me().name; });
$("meSave").addEventListener("click", () => { const first = !!$("meSave").dataset.first; saveMe(); sfx.tick(); if (first) $("meClose").click(); else { $("meSave").hidden = true; toast(tr("Saved ✓")); } });
$("meName").addEventListener("change", saveMe);
$$("#meForm [data-form]").forEach(b => b.addEventListener("click", () => { me().form = b.dataset.form; persist(); sfx.tick(); $$("#meForm [data-form]").forEach(x => x.classList.toggle("on", x === b)); }));
$("award").addEventListener("click", () => { if ($("award").classList.contains("legendary") && awardShowing) openMe(); });
$("homeClose").addEventListener("click", () => show("homeSheet", false));
$("homePill").addEventListener("click", openHome);
$("residentsBtn").addEventListener("click", openHome);
$("playBtn").addEventListener("click", openGames);
$("roomPrev").addEventListener("click", () => goRoom(stepRoom(-1)));
$("roomNext").addEventListener("click", () => goRoom(stepRoom(1)));
$("gamesClose").addEventListener("click", () => show("games", false));
$("sleepBtn").addEventListener("click", toggleSleep);
$$(".hud-quit").forEach(b => b.addEventListener("click", ev => {
  ev.stopPropagation(); sfx.tick();
  if (game.scene === "catch" && game.catch && !game.catch.done) endCatch();
  else if (game.scene === "echo" && game.echo && !game.echo.done) endEcho();
}));
$("catchBack").addEventListener("click", () => { show("catchDone", false); game.catch = game.echo = null; sfx.hush = false; setScene("nest"); });
$("nestName").addEventListener("click", () => openGlowling(activeCreature()));
$("glowRename").addEventListener("click", () => {
  const cr = activeCreature();
  if (!cr) return;
  const name = (prompt(tr("A new name for your {0}?", specOf(cr).name), cr.name) || "").trim().slice(0, 18);
  if (name) { remember(cr, "Got a new name: {0}", name); cr.name = name; persist(); renderNest(true); openGlowling(cr); }
});
$("glowClose").addEventListener("click", () => show("glowCard", false));
$("spClose").addEventListener("click", () => show("spCard", false));
cornerCloses();
// the test copy: a badge, and a way to bring your real nest over (a copy: the live one is never touched)
if (STAGING) {
  $("testBadge").hidden = false; $("copyLive").hidden = false;
  document.title = "TEST · " + document.title;
  $("copyLive").addEventListener("click", () => {
    let live = null;
    try { live = JSON.parse(localStorage.getItem(LIVE_SAVE_KEY) || "null"); } catch {}
    if (!validSave(live)) { toast(tr("No live nest on this device yet")); return; }
    if (!confirm(tr("Replace the test nest with a copy of your live one ({0} {1})? The live nest stays as it is.", live.creatures.length, pl(live.creatures.length, "glowling", "glowlings")))) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(live)); localStorage.removeItem(BAK_KEY); } catch {}
    location.reload();
  });
}
$("backupBtn").addEventListener("click", () => {
  if ($("topbar").inert || (coopSession?.round && game.scene === "crack")) return;
  openBackup();
});
$("backupClose").addEventListener("click", () => show("backup", false));
$("copyCode").addEventListener("click", copyCode);
$("shareCode").addEventListener("click", shareCode);
$("saveCode").addEventListener("click", saveCodeFile);
$("restoreBtn").addEventListener("click", restoreFromCode);
$("loadFile").addEventListener("click", () => $("fileIn").click());
$("fileIn").addEventListener("change", async e => {
  const f = e.target.files[0];
  if (!f) return;
  $("restoreCode").value = (await f.text()).trim();
  e.target.value = "";
  restoreFromCode();
});
$$("[data-lib]").forEach(b => b.addEventListener("click", () => {
  game.libTab = b.dataset.lib;
  $$("[data-lib]").forEach(x => x.classList.toggle("on", x === b));
  sfx.tick();
  renderLib();
}));

// ---------- backup codes: a nest you can carry to another device ----------

const toB64 = bytes => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const fromB64 = str => Uint8Array.from(atob(str.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const pipe = (bytes, stream) => new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer().then(b => new Uint8Array(b));

/** The whole save, minus geode pictures (they're big, and a restore can redraw them). HS1 = compressed, HS0 = plain. */
async function makeBackupCode() {
  const data = { ...save, geodes: Object.fromEntries(Object.entries(save.geodes).map(([k, g]) => [k, { count: g.count, shine: g.shine }])) };
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  if (window.CompressionStream) {
    try { return "HS1-" + toB64(await pipe(bytes, new CompressionStream("deflate-raw"))); } catch {}
  }
  return "HS0-" + toB64(bytes);
}

async function readBackupCode(code) {
  const m = /^HS([01])-([A-Za-z0-9_-]+)$/.exec(code.replace(/\s+/g, ""));
  if (!m) throw new Error("shape");
  let bytes = fromB64(m[2]);
  if (m[1] === "1") {
    if (!window.DecompressionStream) throw new Error(tr("This browser is too old to read compressed codes"));
    bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
  }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || !Array.isArray(data.creatures) || typeof data.stars !== "object" || typeof data.shards !== "number") throw new Error("shape");
  return data;
}

async function openBackup() {
  sfx.tick();
  $("backupCode").value = "…";
  $("backupMsg").textContent = save.backupAt ? tr("Last backup: {0}", new Date(save.backupAt).toLocaleDateString(LOCALE)) : "";
  $("restoreMsg").textContent = ""; $("restoreMsg").className = "";
  $("shareCode").hidden = !navigator.share;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  $("homeTip").hidden = !(/iPhone|iPad|iPod/.test(navigator.userAgent) && !standalone);
  show("backup", true);
  $("backupCode").value = await makeBackupCode();
}

function markBackedUp(how) {
  save.backupAt = Date.now();
  persist();
  $("backupMsg").textContent = how;
}

async function copyCode() {
  const code = $("backupCode").value;
  try { await navigator.clipboard.writeText(code); }
  catch { $("backupCode").select(); document.execCommand("copy"); }
  markBackedUp(tr("Copied ✓ Paste it somewhere safe."));
}

async function shareCode() {
  try { await navigator.share({ title: tr("My Hatchstone nest"), text: $("backupCode").value }); markBackedUp(tr("Shared ✓")); } catch {}
}

function saveCodeFile() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([$("backupCode").value], { type: "text/plain" }));
  a.download = `hatchstone-nest-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  markBackedUp(tr("Saved ✓ Look for it in your downloads."));
}

async function restoreFromCode() {
  const msg = $("restoreMsg");
  let data;
  try { data = await readBackupCode($("restoreCode").value); }
  catch (err) { msg.className = "bad"; msg.textContent = err.message === "shape" ? tr("That doesn't look like a Hatchstone backup code.") : err.message; return; }
  const n = data.creatures.length, mine = save.creatures.length;
  if (mine && !confirm(tr("Replace your current nest ({0} {1}) with the one in this code ({2} {3})?", mine, pl(mine, "glowling", "glowlings"), n, pl(n, "glowling", "glowlings")))) return;
  const rev = Math.max(save.rev || 0, data.rev || 0) + 1;
  for (const k of Object.keys(save)) delete save[k];
  Object.assign(save, migrate(Object.assign(freshSave(), data)), { backupAt: Date.now(), rev });
  // time doesn't pass while a nest is in a code
  for (const cr of save.creatures) cr.last = Date.now();
  persist();
  msg.className = ""; msg.textContent = tr("Welcome back, {0} {1} ✦", n, pl(n, "glowling", "glowlings"));
  setTimeout(() => location.reload(), 900);
}

/** Geodes restored from a code have no picture yet: draw a fresh one of the same crystal. */
function crystalThumb(id) {
  const inner = makeInterior(CRYSTAL[id], STONES[0]), s = 150 / (L.ew + PAD * 2);
  const c = document.createElement("canvas");
  c.width = Math.round((L.ew + PAD * 2) * s); c.height = Math.round((L.eh + PAD * 2) * s);
  const o = c.getContext("2d");
  o.scale(s, s);
  o.drawImage(inner, 0, 0, L.ew + PAD * 2, L.eh + PAD * 2);
  drawGloss(o, L.ew / 2 + PAD, L.eh / 2 + PAD, 0.8);
  return c.toDataURL("image/png");
}

/** A gentle nudge, once per session, when there's a nest worth keeping and no recent backup. */
let backupNudged = false;
function nudgeBackup() {
  if (backupNudged || save.creatures.length < 3) return;
  if (save.backupAt && Date.now() - save.backupAt < 7 * 864e5) return;
  backupNudged = true;
  setTimeout(() => toast(tr("Tip: tap backup (top right) to keep your nest safe")), 2800);
}

// ---------- the glowpedia: glowlings and geodes ----------

function renderLib() {
  const found = SPECIES.filter(s => save.seen[s.id]).length;
  const geos = CRYSTALS.filter(c => save.geodes[c.id]).length;
  const hyN = save.creatures.filter(c => c.mix).length;
  $("libSub").textContent = tr("{0} of {1} glowlings · {2} of {3} geodes", found, SPECIES.length, geos, CRYSTALS.length) + (hyN ? ` · ${hyN} ${pl(hyN, "hybrid", "hybrids")}` : "") + tr(" · {0} in your nest", save.creatures.length);
  if (game.libTab === "aw") {
    const earned = save.awards || {};
    const have = AWARDS.filter(a => earned[a.id]).length;
    $("libSub").textContent = tr("{0} of {1} awards. They come by themselves as you play; each brings shards and keeper XP, more for rarer ones.", have, AWARDS.length);
    $("libGrid").innerHTML = `<div class="aw-list">` + AWARD_TIERS.slice().reverse().map(t => {
      const list = AWARDS.filter(a => a.tier === t.id), have = list.filter(a => earned[a.id]).length;
      return `<h3 class="aw-h ${t.id}">${tr(t.name)} <span>${have}/${list.length} · +${t.shards} ✦</span></h3>` + list.map(a => {
        const got = earned[a.id], [now, goal] = a.test(), k = Math.min(1, now / goal);
        return `<div class="aw ${t.id}${got ? " got" : ""}">${ic("trophy_" + t.id, "big")}<span><b>${tr(a.name)}</b><small>${tr(a.how)}</small>${got ? `<em>${new Date(got).toLocaleDateString(LANG === "uk" ? "uk-UA" : "en-US", { day: "numeric", month: "short", year: "numeric" })}</em>` : goal > 1 ? `<i class="aw-bar" style="--k:${k}"><u>${Math.min(now, goal)}/${goal}</u></i>` : ""}</span></div>`;
      }).join("");
    }).join("") + "</div>";
  } else if (game.libTab === "st") {
    $("libGrid").innerHTML = STORY.map((p, i) => {
      const open = unlocked(p.at) && talkSeen(p.id);
      return `<button data-st="${i}" class="${open ? "" : "unk"}" style="animation-delay:${i * 20}ms"><i class="no">${tr("Part {0}", i + 1)}</i><span class="pg"><img class="lib-px" src="${pxIcon(p.who.icon || p.who.name.toLowerCase())}" alt=""${open ? "" : ' style="filter:brightness(0) opacity(.5)"'}></span><b>${open ? tr(p.title) : "???"}</b><small>${open ? tr(p.who.name) : p.at > LEVELS ? tr("Open every geode") : tr("Reach level {0}", p.at)}</small></button>`;
    }).join("");
  } else if (game.libTab === "hy") {
    const hy = save.creatures.filter(c => c.mix);
    $("libGrid").innerHTML = hy.length ? hy.map((c, i) => `<button data-hy="${c.id}" style="animation-delay:${i * 20}ms"><span class="pg"><img class="lib-px" src="${creatureImage(specOf(c), { art: 32, level: c.level, shiny: c.shiny })}" alt=""></span><b>${c.name}</b><small>${c.mix.parents.join(" × ")}</small></button>`).join("")
      : `<p class="sub" style="grid-column:1/-1;padding:20px 0">${tr("No hybrids yet. Grow two glowlings to level {0}, keep them happy, and tap the incubator in the lab 💞", PAIR_LEVEL)}</p>`;
  } else if (game.libTab === "sp") {
    $("libGrid").innerHTML = SPECIES.map((s, i) => {
      const seen = save.seen[s.id];
      return `<button data-sp="${s.id}" class="${seen ? "" : "unk"}" style="animation-delay:${i * 20}ms"><i class="no">${tr("No. {0}", i + 1)}</i><span class="pg"><img class="lib-px" src="${creatureImage(s, { art: 32, sil: !seen })}" alt=""></span><b>${seen ? s.name : "???"}</b><small>${rar(rarityOf(s))}</small></button>`;
    }).join("");
  } else {
    for (const c of CRYSTALS) if (save.geodes[c.id] && !save.geodes[c.id].img) { save.geodes[c.id].img = crystalThumb(c.id); persist(); }
    $("libGrid").innerHTML = CRYSTALS.map((c, i) => {
      const geo = save.geodes[c.id];
      return `<button data-cr="${c.id}" class="${geo ? "" : "unk"}" style="animation-delay:${i * 20}ms"><i class="no">${tr("No. {0}", i + 1)}</i><span class="pg"><img src="${geo ? geo.img : mysteryGeode()}" alt=""></span><b>${geo ? c.name : "???"}</b><small>${rarF(c.rarity)}${geo && geo.count > 1 ? ` · ×${geo.count}` : ""}</small></button>`;
    }).join("");
  }
  $$("#libGrid [data-sp]").forEach(b => b.addEventListener("click", () => openSpecies(SP[b.dataset.sp])));
  $$("#libGrid [data-cr]").forEach(b => b.addEventListener("click", () => openCrystal(CRYSTAL[b.dataset.cr])));
  $$("#libGrid [data-st]").forEach(b => b.addEventListener("click", () => {
    const p = STORY[b.dataset.st];
    if (unlocked(p.at) && talkSeen(p.id)) retell(p); else sfx.tick();
  }));
  $$("#libGrid [data-hy]").forEach(b => b.addEventListener("click", () => openHybrid(save.creatures.find(c => c.id === Number(b.dataset.hy)))));
}

// ---------- postcards: a picture of your glowling to send to friends ----------

const GAME_URL = "https://helavika.github.io/hatchstone/";

/** Draw a 1080×1350 pixel-art postcard: your glowling in a dithered grotto of its own crystal, inside a rope frame. */
function makePostcard({ art, name, line, note, pal }) {
  const PW = 108, PH = 135, S = 10, floorY = 92;
  const [main, light, dark] = pal.map(pxHex);
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const night = ["#07051a", "#120c33", "#21174f", "#33256f", "#463592"].map(pxHex);
  const seed = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 997, 7);
  const th = {
    seed,
    wall: night.map((c, i) => mix(c, mix([0, 0, 0], dark, .25 + i * .15), .35)),
    crystal: [mix(dark, [0, 0, 0], .45), dark, main, light, mix(light, [255, 255, 255], .7)],
    glow: light,
  };
  const low = pixelCave(th, PW, PH, { floorY, lx: PW / 2, ly: 62, crystals: 12, reach: 1.7, spill: .07, keepClear: 26 });
  const o = low.getContext("2d");
  // the glowling stands on the ledge
  const pix = pixelate(art, 58, 56);
  o.drawImage(pix, Math.round((PW - pix.width) / 2), floorY + 3 - pix.height);
  // the ledge fades to dark under the words, then a rope frame like the plates in the game
  const im = o.getImageData(0, 0, PW, PH), d = im.data, gold = [255, 233, 168], ink = th.wall[0];
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const i = (y * PW + x) * 4, e = Math.min(x, y, PW - 1 - x, PH - 1 - y);
    let col = null;
    if (y > floorY + 4 && PX_BAYER[(y & 3) * 4 + (x & 3)] < (y - floorY - 4) / 10) col = ink;
    if (e === 0) col = ink;
    else if (e === 1 || e === 5) col = mix(ink, gold, .55);
    else if (e >= 2 && e <= 4) col = (x + y) % 3 === 0 ? gold : mix(ink, gold, .2);
    if ((x === 2 || x === PW - 3) && (y === 2 || y === PH - 3)) col = gold;
    if (col) { d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; }
  }
  o.putImageData(im, 0, 0);
  o.drawImage(pixelText(name, 92, [255, 255, 255], ink), 0, 0, PW, PH, 0, 0, PW, PH);

  const c = document.createElement("canvas"); c.width = PW * S; c.height = PH * S;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.drawImage(low, 0, 0, c.width, c.height);
  g.textAlign = "center";
  g.fillStyle = "#ffe9a8";
  g.font = "700 34px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";
  g.letterSpacing = "10px";
  g.fillText("✦ HATCHSTONE ✦", c.width / 2, 110);
  g.letterSpacing = "0px";
  g.font = "700 40px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";
  g.fillText(line, c.width / 2, 1162);
  if (note) { g.fillStyle = "rgba(236,230,255,.85)"; g.font = "500 32px ui-rounded, system-ui, sans-serif"; g.fillText(note, c.width / 2, 1210); }
  g.fillStyle = "rgba(236,230,255,.7)";
  g.font = "600 28px ui-rounded, system-ui, sans-serif";
  g.fillText(tr("crack open real geodes · ") + GAME_URL.replace("https://", "").replace(/\/$/, ""), c.width / 2, 1268);
  return c;
}

/** Shrink art to fit maxW×maxH pixels with few colors, ordered dithering and a dark outline. Empty margins are trimmed first. */
function pixelate(art, maxW, maxH) {
  const t = document.createElement("canvas"); t.width = art.width; t.height = art.height;
  const tg = t.getContext("2d"); tg.drawImage(art, 0, 0);
  const td = tg.getImageData(0, 0, t.width, t.height).data;
  let x0 = t.width, y0 = t.height, x1 = 0, y1 = 0;
  for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) if (td[(y * t.width + x) * 4 + 3] > 110) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < x0) { x0 = y0 = 0; x1 = t.width - 1; y1 = t.height - 1; }
  const sw = x1 - x0 + 1, sh = y1 - y0 + 1, k = Math.min(maxW / sw, maxH / sh);
  const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
  const c = document.createElement("canvas"); c.width = w + 2; c.height = h + 2;
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(t, x0, y0, sw, sh, 1, 1, w, h);
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data, W = c.width, H = c.height;
  const solid = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (d[i + 3] < 110) { d[i + 3] = 0; continue; }
    solid[y * W + x] = 1; d[i + 3] = 255;
    const b = PX_BAYER[(y & 3) * 4 + (x & 3)] - .5;
    for (let k = 0; k < 3; k++) d[i + k] = clamp(Math.round(d[i + k] / 255 * 8 + b * .7) / 8 * 255, 0, 255);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (solid[y * W + x]) continue;
    if ((x > 0 && solid[y * W + x - 1]) || (x < W - 1 && solid[y * W + x + 1]) || (y > 0 && solid[(y - 1) * W + x]) || (y < H - 1 && solid[(y + 1) * W + x])) {
      const i = (y * W + x) * 4; d[i] = 22; d[i + 1] = 14; d[i + 2] = 46; d[i + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
  return c;
}

/** The glowling's name in crisp pixels, sized to fit maxW, with a one-pixel shadow. Baseline at y 108. */
function pixelText(text, maxW, col, shadow) {
  const c = document.createElement("canvas"); c.width = 108; c.height = 135;
  const g = c.getContext("2d");
  let size = 14;
  do { g.font = `800 ${size}px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif`; } while (g.measureText(text).width > maxW && --size > 8);
  g.textAlign = "center"; g.fillStyle = "#fff"; g.fillText(text, 54, 108);
  const im = g.getImageData(0, 0, 108, 135), d = im.data, out = g.createImageData(108, 135), o = out.data;
  for (let y = 0; y < 135; y++) for (let x = 0; x < 108; x++) {
    if (d[(y * 108 + x) * 4 + 3] < 120) continue;
    const put = (xx, yy, cc) => { const j = (yy * 108 + xx) * 4; if (o[j + 3] && cc === shadow) return; o[j] = cc[0]; o[j + 1] = cc[1]; o[j + 2] = cc[2]; o[j + 3] = 255; };
    if (x < 107 && y < 134) put(x + 1, y + 1, shadow);
    put(x, y, col);
  }
  g.clearRect(0, 0, 108, 135); g.putImageData(out, 0, 0);
  return c;
}

async function sharePostcard(card, name) {
  sfx.tick();
  taskDone("share");
  const blob = await new Promise(r => card.toBlob(r, "image/jpeg", 0.9));
  const file = new File([blob], `hatchstone-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.jpg`, { type: "image/jpeg" });
  const text = tr("Look who hatched in my Hatchstone nest: {0} ✦ {1}", name, GAME_URL);
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Hatchstone", text }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(tr("Postcard saved ✓ Send it to a friend"));
}

const imgFrom = url => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = url; });

/** The postcard of a fresh hatch: the new glowling in its own crystal grotto. */
async function shareFound() {
  const e = game.egg, sp = e.species;
  const art = await imgFrom(creatureImage(sp, { size: 360, shiny: e.shiny, mood: "happy" }));
  sharePostcard(makePostcard({ art, pal: palOf(sp), name: (e.shiny ? "✦ " : "") + sp.name, line: sp.moon ? moonKind(sp) : tr("from a {0} geode · {1}", e.crystal.name, rar(rarityOf(sp))), note: tr("just hatched in my nest") }), sp.name);
}

/** The postcard of a glowling from the nest. */
async function shareCreature(cr) {
  const sp = specOf(cr);
  const art = await imgFrom(creatureImage(sp, { size: 360, level: cr.level, shiny: cr.shiny, mood: "happy" }));
  const what = sp.hybrid ? tr("{0} hybrid", sp.parents.join(" × ")) : sp.moon ? moonKind(sp) : `${STAGES[stageOf(cr.level)].toLowerCase()} ${sp.name} · ${rar(rarityOf(sp))}`;
  sharePostcard(makePostcard({ art, pal: palOf(sp), name: cr.name, line: what, note: tr("level {0} · raised in my nest", cr.level) }), cr.name);
}

function openHybrid(cr) {
  const sp = specOf(cr);
  sfx.tick();
  $("spImg").src = creatureImage(sp, { size: 200, level: cr.level, shiny: cr.shiny });
  $("spName").textContent = cr.name;
  $("spRarity").textContent = "one of a kind";
  $("spRarity").className = "rarity r-legendary";
  $("spLore").textContent = sp.lore;
  $("spFacts").innerHTML = tr("Favorite snack: {0}<br>Level {1} · hatched {2}", SNACKS[sp.snack].emoji + " " + SNACKS[sp.snack].name, cr.level, new Date(cr.born).toLocaleDateString(LOCALE));
  show("spCard", true);
  sfx.chirp(sp.voice);
}

let mysteryUrl = null;
function mysteryGeode() {
  if (mysteryUrl) return mysteryUrl;
  const c = document.createElement("canvas");
  c.width = 120; c.height = 150;
  const o = c.getContext("2d");
  tracePoly(o, eggPoly(60, 75, 96, 123));
  o.fillStyle = "rgba(255,255,255,.08)"; o.fill();
  o.strokeStyle = "rgba(255,255,255,.2)"; o.lineWidth = 2; o.stroke();
  o.fillStyle = "rgba(255,255,255,.3)"; o.font = "800 44px system-ui"; o.textAlign = "center"; o.fillText("?", 60, 92);
  return (mysteryUrl = c.toDataURL());
}

function openSpecies(sp) {
  const seen = save.seen[sp.id], cry = CRYSTAL[sp.crystal];
  const mine = save.creatures.filter(c => c.sp === sp.id);
  sfx.tick();
  $("spImg").src = creatureImage(sp, { size: 200, sil: !seen, level: mine.length ? Math.max(...mine.map(c => c.level)) : 1 });
  $("spName").textContent = seen ? sp.name : "???";
  $("spRarity").textContent = sp.moon ? moonKind(sp) : `${cry.name} · ${rar(cry.rarity)}`;
  $("spRarity").className = `rarity r-${rarityOf(sp)}`;
  $("spLore").textContent = seen ? sp.lore : sp.event ? tr("Hatches only from moon eggs during {0} ({1}). Look for the 🌙 in the Grotto.", eventName(EVENT[sp.event]), eventDates(EVENT[sp.event])) : sp.moon ? tr("Hatches only from moon eggs in {0}. Look for the 🌙 in the Grotto.", seasonIn(sp.moon)) : tr("Sleeps inside {0} geodes. Crack one to meet it.", LANG === "uk" ? cry.name : cry.name.toLowerCase());
  $("spFacts").innerHTML = seen
    ? tr("Favorite snack: {0}<br>Met {1} {2} · first on {3}", SNACKS[sp.snack].emoji + " " + SNACKS[sp.snack].name, seen.count, pl(seen.count, "time", "times"), new Date(seen.first).toLocaleDateString(LOCALE)) +
      (mine.length ? tr("<br>In your nest: {0}", mine.map(c => tr("{0} (level {1})", c.name, c.level)).join(", ")) : "")
    : sp.event ? tr("Only in 🌙 moon eggs during {0}.", eventName(EVENT[sp.event])) : sp.moon ? tr("Only in 🌙 moon eggs, in {0}.", seasonIn(sp.moon)) : tr(cry.rarity === "common" ? "Found anywhere in the grotto." : cry.rarity === "rare" ? "Found deeper in the grotto." : "Found rarely, in the deepest parts of the grotto.");
  show("spCard", true);
  if (seen) sfx.chirp(sp.voice);
}

function openCrystal(cry) {
  const geo = save.geodes[cry.id];
  if (geo && !geo.img) { geo.img = crystalThumb(cry.id); persist(); }
  const who = SPECIES.filter(s => s.crystal === cry.id);
  sfx.tick();
  $("spImg").src = geo ? geo.img : mysteryGeode();
  $("spName").textContent = geo ? cry.name : "???";
  $("spRarity").textContent = tr("{0} geode", rarF(cry.rarity));
  $("spRarity").className = `rarity r-${cry.rarity}`;
  $("spLore").textContent = geo ? cry.fact : tr("A geode you haven't opened yet.");
  $("spFacts").innerHTML = geo
    ? tr("Opened {0} {1}<br>Glowlings that live inside: {2}", geo.count, pl(geo.count, "time", "times"), who.map(s => save.seen[s.id] ? s.name : "???").join(", "))
    : tr("Glowlings sleeping inside: {0}.", who.length);
  show("spCard", true);
}
