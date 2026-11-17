"use strict";
// Hatchstone · anonymous play stats (Umami): how many come back, for how long, and what they play, so the game can be
// made better where people get lost or bored. No name, no nest, no ID of yours: each event is a word and a few numbers
// (which level, which path, how many minutes), and Umami counts visitors by its own daily hash, not by anything stored.
// Off in Settings, and never sent while the game is opened locally or by a test browser. See privacy.html.
// All the game's scripts share one global scope and load in order (see index.html).

const STATS = {
  // the website's ID in Umami (Settings → Websites); empty, nothing is ever sent
  site: "32b90b1e-c31a-4dc8-88a0-5c10f7c2ba46",
  send: "https://cloud.umami.is/api/send",
};
/** May this play be counted: an ID set, you didn't turn it off, a real browser on the real site. */
const statsOn = () => !!STATS.site && opts().stats && !navigator.webdriver && !/^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname);
/** The test copy counts apart from the live game. */
const statsPage = () => STAGING ? "/staging/" : "/";
/** Send one event (or, with no name, a visit) to Umami; nothing waits on it and nothing fails if it can't get through. */
function track(name, data) {
  if (!statsOn()) return;
  const payload = { website: STATS.site, hostname: location.hostname, url: statsPage(), title: "Hatchstone", language: LANG, screen: `${screen.width}x${screen.height}`, referrer: document.referrer };
  if (name) { payload.name = name; if (data) payload.data = data; }
  try { fetch(STATS.send, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "event", payload }) }).catch(() => {}); } catch (e) { /* offline, or blocked: fine */ }
}
/** Each of these once a session is enough to see what people do (a task every time would only add noise). */
const statSeen = new Set();
function trackOnce(name, data) {
  const key = name + JSON.stringify(data || {});
  if (statSeen.has(key)) return;
  statSeen.add(key); track(name, data);
}
/** How long you've had the game, in rough steps, so coming back on day 1, 7 or 30 shows without knowing who you are. */
function statAge(first, now = Date.now()) {
  const d = Math.floor((now - first) / 864e5);
  return d < 1 ? "0" : d < 2 ? "1" : d < 4 ? "2-3" : d < 8 ? "4-7" : d < 15 ? "8-14" : d < 31 ? "15-30" : "31+";
}
/** The minutes you play, counted only while the game is on screen; sent when you put it away. */
const statClock = { since: 0, ms: 0 };
function statClockOn() { if (!statClock.since) statClock.since = performance.now(); }
function statClockOff() {
  if (statClock.since) { statClock.ms += performance.now() - statClock.since; statClock.since = 0; }
  if (statClock.ms < 10000) return;
  track("session", { minutes: Math.round(statClock.ms / 6000) / 10, level: Object.keys(save.stars || {}).length, glowlings: save.creatures.length });
  statClock.ms = 0;
}
function statsStart() {
  save.statFirst = save.statFirst || Date.now();
  save.statVisits = (save.statVisits || 0) + 1;
  persist();
  track();
  track("open", { days: statAge(save.statFirst), visits: save.statVisits > 20 ? "20+" : String(save.statVisits), where: window.Telegram?.WebApp?.initData ? "telegram" : matchMedia("(display-mode: standalone)").matches ? "app" : "browser" });
  if (!document.hidden) statClockOn();
  document.addEventListener("visibilitychange", () => document.hidden ? statClockOff() : statClockOn());
  addEventListener("pagehide", statClockOff);
}

if (typeof module === "object" && module.exports) module.exports = { statAge };
