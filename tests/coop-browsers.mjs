// Online co-op between different browsers, each player in its own fresh (incognito-like) context.
// node tests/coop-browsers.mjs [host:guest,...]   (CODES=1 swaps codes by hand instead of using a link; BASE is the page to test)
import { chromium, firefox, webkit } from "playwright";
const engines = { chromium, firefox, webkit };
const pairs = (process.argv[2] || "chromium:firefox,firefox:webkit,webkit:chromium,chromium:chromium").split(",").map(p => p.split(":"));
const BASE = process.env.BASE || "http://localhost:8766/index.html";
const wait = async (what, fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch (e) {} await new Promise(r => setTimeout(r, 250)); } throw new Error("timed out: " + what); };
const launched = {};
const results = [];
for (const [h, g] of pairs) {
  const res = { pair: `${h} → ${g}`, steps: [] };
  const step = s => res.steps.push(s);
  let hc, gc;
  try {
    const opts = e => e === "chromium" ? { args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] } : e === "firefox" ? { firefoxUserPrefs: { "media.peerconnection.ice.obfuscate_host_addresses": false } } : {};
    launched[h] ||= await engines[h].launch(opts(h)); launched[g] ||= await engines[g].launch(opts(g));
    hc = await launched[h].newContext({ viewport: { width: 390, height: 844 } }); gc = await launched[g].newContext({ viewport: { width: 390, height: 844 } });
    const host = await hc.newPage(), guest = await gc.newPage(), errors = [];
    for (const [n, p] of [["host", host], ["guest", guest]]) p.on("pageerror", e => errors.push(`${n}: ${e}`));
    await host.goto(BASE); await host.waitForTimeout(400);
    await host.click("#startCoop"); await host.waitForTimeout(500);
    if (process.env.CODES) {
      // swap codes by hand (no PeerJS)
      await host.evaluate(() => document.getElementById("coopHost").click());
      const invite = await wait("host code", () => host.evaluate(() => document.getElementById("coopInvite").value), 25000);
      await guest.goto(BASE); await guest.waitForTimeout(400); await guest.click("#startCoop"); await guest.waitForTimeout(500);
      await guest.evaluate(v => { const i = document.getElementById("coopInviteIn"); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("coopJoin").click(); }, invite);
      const reply = await wait("guest reply", () => guest.evaluate(() => document.getElementById("coopReply").value), 25000);
      await host.evaluate(v => { const i = document.getElementById("coopReplyIn"); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("coopAccept").click(); }, reply);
      step("codes swapped");
    } else {
      await host.click("#coopQuickHost");
      const invite = await wait("invite link", () => host.evaluate(() => document.getElementById("coopLinkOut").value), 25000);
      step("invite made");
      await guest.goto(invite); await wait("guest sees the invite", () => guest.evaluate(() => !document.getElementById("coopDialog").classList.contains("hidden")));
      await guest.waitForTimeout(500); await guest.click("#coopJoinLink");
    }
    await wait("data channel on both", async () => await host.evaluate(() => !!window.__coop?.peer?.connected) && await guest.evaluate(() => !!window.__coop?.peer?.connected), 40000);
    step("connected");
    await host.evaluate(() => { document.getElementById("coopDifficulty").value = "8"; }); await host.click("#coopBegin");
    await wait("both cracking", async () => await host.evaluate(() => __game.egg?.state) === "cracking" && await guest.evaluate(() => __game.egg?.state) === "cracking");
    step("shared egg started");
    // both tap the weak spot, taking turns
    for (let i = 0; i < 120; i++) {
      const p = i % 2 ? guest : host;
      const at = await p.evaluate(() => __game.egg?.state === "cracking" ? fromEgg(...__game.egg.spot) : null);
      if (!at) break;
      await p.mouse.click(at[0], at[1]); await p.waitForTimeout(120);
    }
    await wait("both polishing", async () => await host.evaluate(() => __game.egg?.state) === "polish" && await guest.evaluate(() => __game.egg?.state) === "polish", 20000);
    step("cracked together");
    await guest.click("#polishDone", { force: true });
    await wait("both result cards", async () => await host.evaluate(() => !document.getElementById("found").classList.contains("hidden")) && await guest.evaluate(() => !document.getElementById("found").classList.contains("hidden")), 20000);
    const [a, b] = [await host.textContent("#foundName"), await guest.textContent("#foundName")];
    step(a === b ? `same glowling: ${a}` : `DIFFERENT: ${a} vs ${b}`);
    const saved = await guest.evaluate(() => JSON.parse(localStorage.getItem("hatchstone.save")).creatures.map(c => c.sp));
    step(`guest saved it: ${saved.length > 0}`);
    res.ok = a === b && saved.length > 0 && !errors.length; res.errors = errors;
  } catch (e) { res.ok = false; res.fail = String(e.message || e).slice(0, 200);
    try { const pages = [...hc.pages(), ...gc.pages()]; res.ui = await Promise.all(pages.map(p => p.evaluate(() => [document.getElementById("coopStatus")?.textContent, document.getElementById("coopError")?.textContent, location.hash.slice(0, 20), !!window.__coop?.peer]))); } catch (e2) {} }
  await hc?.close(); await gc?.close();
  results.push(res); console.log(JSON.stringify(res));
}
for (const b of Object.values(launched)) await b.close();
const failed = results.filter(r => !r.ok);
console.log(`${results.length - failed.length}/${results.length} pairs played a shared egg`);
process.exit(failed.length ? 1 : 0);
