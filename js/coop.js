"use strict";
// Hatchstone · playing together: transport and the shared round.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- co-op transport and authoritative round state ----------

const coopWire = globalThis.HatchstoneCoopState;
let coopSession = null, coopGeneration = 0, coopReturnFocus = null;
const coopPhaseIndex = phase => ["entering", "cracking", "ready", "opening", "polish", "gleam", "open"].indexOf(phase);
const coopIsHost = () => !!coopSession && coopSession.role === "host";
const coopIsGuest = () => !!coopSession && coopSession.role === "guest" && !!game.egg && !!game.egg.conf.coop;
const coopLive = s => !!s && s === coopSession && s.generation === coopGeneration;

window.__coop = {
  get peer() { return coopSession && coopSession.peer || null; },
  get round() { return coopSession && coopSession.round || null; },
  get blueprint() { return coopSession && coopSession.round || null; },
  get active() { return !!coopSession && !!coopSession.peer; },
  get role() { return coopSession && coopSession.role || null; },
};

function coopUiStatus(text) { $("coopStatus").textContent = text || ""; }
function coopUiError(text) { $("coopError").textContent = text || ""; }
function coopCopy(value, label, inputId) {
  if (!value) return;
  const done = () => toast(tr(label) + tr(" copied ✓"));
  const select = () => {
    const input = $(inputId || (label.startsWith("Reply") ? "coopReply" : "coopInvite"));
    input.focus(); input.select(); toast((inputId ? tr("Link") : tr("Code")) + tr(" selected — copy it using your browser."));
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(value).then(done).catch(select);
  else select();
}
// Codes travel as links: the code sits after the #, so it never reaches the web server.
const COOP_REPLY_KEY = "hatchstone.coopReply";
const coopLink = (kind, code) => location.origin + location.pathname + "#" + kind + "=" + code;
function coopCodeFrom(text, kind) {
  const t = (text || "").trim(), at = t.indexOf("#" + kind + "=");
  return at < 0 ? t : t.slice(at + kind.length + 2);
}
async function coopSendLink(kind, code) {
  if (!code) return;
  const url = coopLink(kind, code);
  const text = kind === "join" ? tr("Crack a Hatchstone egg with me 🥚✨ Tap to join:") : tr("Here's my Hatchstone reply, tap it to let me in:");
  if (navigator.share) {
    try { await navigator.share({ title: "Hatchstone", text, url }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  coopCopy(url, kind === "join" ? "Invite link" : "Reply link");
}
// The host tapped the guest's reply link and it opened in another tab: hand the reply to the hosting tab.
function coopTakeReply() {
  const s = coopSession;
  if (!s || s.role !== "host" || s.peer.connected || $("coopReplyIn").value) return;
  let pending;
  try { pending = JSON.parse(localStorage.getItem(COOP_REPLY_KEY)); } catch { return; }
  if (!pending || typeof pending.code !== "string" || Date.now() - pending.t > 15 * 60e3) return;
  try { if (HatchstoneLink.decodeSignal(pending.code).room !== s.peer.room) return; } catch { return; }
  try { localStorage.removeItem(COOP_REPLY_KEY); } catch {}
  $("coopReplyIn").value = pending.code;
  if ($("coopDialog").classList.contains("hidden")) coopOpenDialog();
  coopAccept();
}
function coopOpenLink() {
  const m = /^#(join|reply)=(.+)$/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  const [, kind, code] = m;
  if (kind === "join") {
    if (coopSession) { coopOfferIncomingInvite(code, "manual"); return; }
    coopOpenDialog();
    $("coopInviteIn").value = code;
    coopUiStatus(""); 
    $("coopJoinNow").hidden = false; coopView(); $("coopJoinNow").focus();
    return;
  }
  // a reply link opened in the hosting tab itself
  if (coopSession && coopSession.role === "host") { $("coopReplyIn").value = code; coopOpenDialog(); coopAccept(); return; }
  try { localStorage.setItem(COOP_REPLY_KEY, JSON.stringify({ code, t: Date.now() })); } catch {}
  coopOpenDialog();
  $("coopReplyIn").value = code;
  coopUiStatus(tr("Go back to the Hatchstone tab where you made the invite. It connects by itself."));
  coopUiError(tr("If it doesn't, copy this reply and paste it there."));
  $("coopCopyPending").hidden = false; coopView();
}
function coopRoundCatalogValid(r) {
  return !!(r && CRYSTAL[r.crystal] && SP[r.species] && STONES[r.stone] && SP[r.species].crystal === r.crystal);
}
function coopId() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
  let out = "";
  for (let i = 0; i < 20; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function coopBlueprintFromEgg(e) {
  const stone = STONES.indexOf(e.stone);
  const r = { id: coopId(), step: e.conf.step, crystal: e.crystal.id, species: e.species.id, shiny: !!e.shiny, stone,
    hp: e.hp, spot: [e.spot[0], e.spot[1] / EGG_R], seed: e.seed };
  return coopWire.validRound(r) && coopRoundCatalogValid(r) ? r : null;
}
function coopSnapshot(e, seq) {
  const matteHits = e.matte ? e.matte.cells.map(c => Math.min(3, c.hits || 0)) : null;
  const s = { round: coopSession.round.id, seq, phase: e.state, t: clamp(e.t || 0, 0, 86400),
    taps: e.taps, crits: e.crits, gems: e.gems, damage: e.damage, hits: e.hits.map(h => h.slice()),
    matte: matteHits ? { hits: matteHits, shine: e.matte.shine } : null };
  return coopWire.validState(s, coopSession.round) ? s : null;
}
function coopBroadcast(force = false) {
  const s = coopSession, e = game.egg;
  if (!coopIsHost() || !s.round || !e || !e.conf.coop || !s.peer.connected || game.scene !== "crack") return;
  const now = performance.now();
  if (!force && now - s.lastBroadcast < 100) return;
  const state = coopSnapshot(e, ++s.stateSeq);
  if (!state) return;
  s.lastBroadcast = now;
  s.peer.send({ type: "state", state });
}
function coopRoundState(packet) {
  const s = coopSession, r = packet && packet.round, state = packet && packet.state;
  if (!s || !coopWire.validRound(r) || !coopRoundCatalogValid(r) || !coopWire.validState(state, r) || state.round !== r.id) return false;
  return true;
}
/** Replay shared hits we haven't drawn yet. The same seed and hit order grow the very same cracks on every screen. */
function coopReplayHits(e, hits, feedback) {
  for (let i = e.hits.length; i < hits.length; i++) {
    const [u, nv, power] = hits[i], p = [u, nv * EGG_R];
    e.hits.push(hits[i].slice());
    const res = crackHit(e, p, power, seeded(e.seed + ":" + i));
    if (feedback) { const [x, y] = fromEgg(...p); hitFeedback(e, x, y, res, 1 + (res.crit ? 2 : 0)); }
  }
  paintNet(e);
}
function installCoopRound(r, state) {
  if (!coopRoundState({ round: r, state })) return false;
  const conf = { ...levelConf(r.step), n: 0, wander: true, coop: true, forced: { crystal: CRYSTAL[r.crystal], species: SP[r.species] } };
  // newEgg supplies the ordinary canvas assets; the host blueprint replaces every random gameplay value below.
  newEgg(conf, false);
  const e = game.egg;
  e.conf = conf; e.crystal = CRYSTAL[r.crystal]; e.species = SP[r.species]; e.shiny = r.shiny; e.stone = STONES[r.stone];
  e.hp = r.hp; e.spot = [r.spot[0], r.spot[1] * EGG_R]; e.seed = r.seed; e.par = Math.ceil(e.hp / 2.6); e.coopBlueprint = r;
  e.hits = []; e.net = { segs: [], tips: [] }; e.damage = 0;
  refitEgg(e); game.pieces = [];
  return coopApplySnapshot(state, true);
}
function reprojectCoopEgg() {
  const e = game.egg, r = e && e.coopBlueprint;
  if (!e || !r || !coopWire.validRound(r)) return;
  const old = { phase: e.state, t: e.t, shine: e.matte?.shine, matte: e.matte ? e.matte.cells.map(c => c.hits || 0) : null };
  refitEgg(e); game.pieces = [];
  if (old.matte || ["polish", "gleam", "open"].includes(old.phase)) {
    startPolish();
    if (old.matte) e.matte.cells.forEach((c, i) => { c.hits = old.matte[i] || 0; c.done = c.hits >= 3; });
    e.matte.done = e.matte.cells.filter(c => c.done).length; e.matte.shine = old.shine || 0;
    paintCoopMatte(e.matte);
  }
  e.state = old.phase; e.t = old.t;
  if (coopIsGuest()) coopSendInput("cancel");
  pointer = null; game.trail = [];
  if (coopSession) { coopSession.remotePointer = null; coopSession.remoteCursor = null; }
  $("polishDone").hidden = e.state !== "polish";
  updateDots();
}

function paintCoopMatte(m, before = []) {
  if (m.shine === 1) { m.ctx.clearRect(0, 0, m.canvas.width, m.canvas.height); return; }
  const o = m.ctx, radius = 13 * L.k;
  o.save(); o.globalCompositeOperation = "destination-out";
  m.cells.forEach((c, i) => {
    const [x, y] = toShell(c.x, c.y);
    for (let h = before[i] || 0; h < (c.hits || 0); h++) {
      const g = o.createRadialGradient(x, y, 1, x, y, radius);
      g.addColorStop(0, "rgba(0,0,0,.65)"); g.addColorStop(1, "rgba(0,0,0,0)");
      o.fillStyle = g; o.beginPath(); o.arc(x, y, radius, 0, TAU); o.fill();
    }
  });
  o.restore();
}
function coopApplySnapshot(state, initial = false) {
  const s = coopSession, e = game.egg;
  if (!s || !e || !s.round || state.round !== s.round.id || !coopWire.validState(state, s.round)) return false;
  if (!initial && state.seq <= s.lastStateSeq) return false;
  if (!initial && coopPhaseIndex(state.phase) < coopPhaseIndex(e.state)) return false;
  if (!initial && state.seq > s.lastStateSeq) s.lastStateSeq = state.seq;
  const oldPhase = e.state;
  if (coopIsGuest() || initial) coopReplayHits(e, state.hits, !initial);
  e.taps = state.taps; e.crits = state.crits; e.gems = state.gems; e.damage = state.damage;
  if (state.phase === "opening" && oldPhase !== "opening") openEgg();
  if (state.matte && !e.matte) startPolish();
  if (state.phase === "gleam" && oldPhase === "polish") finishPolish();
  if (state.matte) {
    const oldHits = e.matte.cells.map(c => c.hits || 0);
    e.matte.cells.forEach((c, i) => { c.hits = state.matte.hits[i] || 0; c.done = c.hits >= 3; });
    e.matte.done = e.matte.cells.filter(c => c.done).length; e.matte.shine = state.matte.shine;
    paintCoopMatte(e.matte, oldHits);
  }
  e.state = state.phase; e.t = state.t;
  updateDots();
  $("polishDone").hidden = !(game.scene === "crack" && e.state === "polish");
  if (e.state === "open" && !e.coopRewarded) showFound();
  return true;
}
function coopSetSession(role, mode = "manual") {
  if (coopSession && coopSession.peer) coopSession.peer.close("replaced");
  const generation = ++coopGeneration;
  const session = { generation, role, mode, peer: null, round: null, rounds: new Set(), stateSeq: 0, lastStateSeq: -1, lastBroadcast: 0, inputSeq: 0, lastInputSeq: -1, inputWindow: 0, inputCount: 0, remotePointer: null, remoteCursor: null };
  coopSession = session; game.coop = session; game.coopTouched = true;
  session.lastHeard = Date.now();
  session.beat = setInterval(() => {
    if (!coopLive(session)) { clearInterval(session.beat); return; }
    if (!session.peer?.connected) { session.lastHeard = Date.now(); return; }
    session.peer.send({ type: "ping" });
    if (!document.hidden && Date.now() - session.lastHeard > COOP_SILENCE_MS) { coopEnd("timeout", true); coopPartnerGone(); }
  }, 4000);
  const callbacks = {
    onStatus: status => {
      if (!coopLive(session)) return;
      const connected = !!session.peer?.connected;
      if (connected) {
        clearTimeout(session.connectTimer);
        // A connected invite is consumed. Do not offer to share a stale link.
        $("coopLinkReady").hidden = true; $("coopLinkOut").value = "";
        $("coopCopyLink").disabled = $("coopShareLink").disabled = $("coopTelegram").disabled = true;
      }
      coopUiStatus(connected ? (role === "host" ? "" : tr("Waiting for your friend to start the egg…")) : status === "connecting" ? tr("Connecting…") : tr("Connection: {0}", status));
      $("coopBegin").disabled = !(role === "host" && connected);
      $("coopBegin").hidden = !(role === "host" && connected);
      coopShowRoom();
    },
    onMessage: packet => { if (!coopLive(session)) return; coopReceive(session, packet); },
    onClose: reason => {
      if (!coopLive(session)) return;
      const started = !!session.round, done = game.egg && game.egg.coopRewarded;
      coopEnd("disconnected", true);
      if (started && !done) toast(tr("Friend disconnected. Your nest is safe; create a fresh invite to reconnect."));
      else {
        coopOpenDialog();
        coopUiError(mode === "invite" ? globalThis.HatchstoneInvite.friendlyError(reason) : tr("Could not connect. Exchange fresh codes, or try another network."));
      }
    },
  };
  session.peer = new (mode === "invite" ? globalThis.HatchstoneInvite.Peer : globalThis.HatchstoneLink.Peer)(callbacks);
  return session;
}
const COOP_SILENCE_MS = 45000;
/** Your friend left (or went quiet): say so, kindly, wherever you are. */
function coopPartnerGone() {
  if ($("found").classList.contains("hidden")) toast(tr("Your friend left the shared room"));
}
function coopReceive(s, packet) {
  if (!packet || typeof packet !== "object") return;
  s.lastHeard = Date.now();
  if (packet.type === "ping") return;
  if (packet.type === "bye") { coopEnd("partner-left", true); coopPartnerGone(); return; }
  if (packet.type === "round" && s.role === "guest") {
    if (!coopRoundState(packet) || s.rounds.has(packet.round.id) || (s.round && game.egg && !game.egg.coopRewarded)) return;
    if (s.rounds.size >= 128) { coopEnd("room-limit"); return; }
    s.rounds.add(packet.round.id);
    s.round = packet.round; s.lastStateSeq = -1;
    if (!installCoopRound(packet.round, packet.state)) { coopUiError(tr("The shared egg was invalid.")); coopEnd("invalid-round", true); return; }
    s.lastStateSeq = packet.state.seq; show("start", false); setScene("crack"); show("coopDialog", false); coopUiStatus(tr("Shared egg ready — trace together ✦"));
    return;
  }
  if (packet.type === "state" && s.role === "guest") { if (s.round && packet.state && packet.state.round === s.round.id) coopApplySnapshot(packet.state); return; }
  if (packet.type === "input" && s.role === "host") applyCoopInput(s, packet.input);
}
function coopSendInput(kind, x, y) {
  const s = coopSession, r = s && s.round;
  if (!coopIsGuest() || !r || !s.peer.connected) return;
  const p = { round: r.id, seq: ++s.inputSeq, kind };
  if (kind !== "cancel" && kind !== "finish") p.point = coopWire.normalisePoint(x, y, L);
  if (coopWire.validInput(p, r.id) && !s.peer.send({ type: "input", input: p }) && kind !== "move") {
    queueMicrotask(() => coopReportFailure(s, tr("The connection is congested. Create a fresh invite to reconnect.")));
  }
}
function withRemotePointer(s, fn) {
  const saved = pointer; pointer = s.remotePointer;
  try { fn(); } finally { s.remotePointer = pointer; pointer = saved; }
}
function applyCoopInput(s, p) {
  const r = s.round, now = performance.now();
  if (!r || !game.egg?.conf.coop || !coopWire.validInput(p, r.id) || p.seq <= s.lastInputSeq) return;
  if (now - s.inputWindow >= 1000) { s.inputWindow = now; s.inputCount = 0; }
  // Gesture-end messages must not be dropped: otherwise remote rubbing can stay held.
  if (++s.inputCount > 120 && (p.kind === "move" || p.kind === "down")) return;
  s.lastInputSeq = p.seq;
  if (p.kind === "finish") { if (game.egg.state === "polish") finishPolish(); return; }
  if (p.kind === "cancel") { withRemotePointer(s, () => handlePointerCancel(true)); return; }
  const [x, y] = coopWire.projectPoint(p.point, L);
  s.remoteCursor = { x, y, down: p.kind !== "up" && p.kind !== "cancel", t: now, trail: (s.remoteCursor && s.remoteCursor.trail || []).slice(-31) };
  s.remoteCursor.trail.push({ x, y, t: now });
  withRemotePointer(s, () => {
    if (p.kind === "down") handlePointerDown(x, y, now, true);
    else if (p.kind === "move") handlePointerMove(x, y, now, true);
    else if (p.kind === "up") handlePointerUp(x, y, now, true);
    else handlePointerCancel(true);
  });
}
