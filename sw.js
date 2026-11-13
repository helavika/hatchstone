// Hatchstone offline support: the page itself is fetched fresh when online, everything else from the cache.
// The test copy lives under /staging/ on the same site with its own worker: each keeps to its own caches and pages.
const STAGING = self.registration.scope.includes("/staging/");
const CACHE = (STAGING ? "staging-" : "") + "hatchstone-v44";
const SHELL = [
  "./", "index.html", "style.css", "js/i18n.js", "js/core.js", "js/data.js", "js/pixel.js", "js/save.js", "js/glowlings.js", "js/crack.js", "js/scenes.js", "js/nest.js", "js/world.js", "js/iso.js", "js/keepers.js", "js/play.js", "js/coop.js", "js/ui.js", "js/main.js",
  "coop-link.js", "coop-invite.js", "coop-state.js", "vendor/peerjs-1.5.5.min.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png", "icons/favicon-32.png", "fonts/jersey15-latin.woff2", "fonts/jersey10-latin.woff2", "fonts/handjet700-cyrillic.woff2", "fonts/handjet800-cyrillic.woff2",
];
const mine = k => k.startsWith("staging-") === STAGING;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => mine(k) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  // the live worker leaves the test copy alone (it has its own worker, or goes straight to the network)
  if (!STAGING && url.pathname.startsWith(new URL("staging/", self.registration.scope).pathname)) return;
  if (req.mode === "navigate") {
    // new versions of the game show up right away; the cached copy is the offline fallback
    e.respondWith(fetch(req)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put("index.html", copy)); return res; })
      .catch(() => caches.match("index.html", { cacheName: CACHE })));
    return;
  }
  // the game's code and styles come fresh too, so a new page never runs with last version's scripts
  if (/\.(js|css)$/.test(url.pathname)) {
    // (revalidated, so the browser's own short cache can't hand back an old copy either)
    e.respondWith(fetch(req, { cache: "no-cache" })
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { cacheName: CACHE })));
    return;
  }
  e.respondWith(caches.match(req, { cacheName: CACHE }).then(hit => hit || fetch(req)));
});
