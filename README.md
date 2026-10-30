# Hatchstone

A tiny ASMR game for the browser and phones: crack open glossy stone eggs and find
what's glowing inside. 🎧 Best with headphones.

- Trace the faint glowing lines to crack the stone; tap to knock little chips off
- 24 levels in four caves (plus endless Wander): more cracks, knots to tap and hard
  stone to trace twice; 1–3 stars for staying on the line and for speed
- 17 real geodes (amethyst, celestite, agate, malachite, labradorite, lapis lazuli…),
  each drawn the way the mineral looks, with a real fact on the card
- Every geode holds a glowling: 26 species built from wings, ears, horns, tails and
  patterns, each with its own lore, voice and favorite snack, plus rare shiny ones
- The nest: feed, pet, play a sparkle-catch mini-game and put them to sleep; needs drift
  in real time (nobody ever dies), and glowlings level up to 20 and grow Baby → Young →
  Grown → Radiant
- Knock on the stone to find its hollow spot, and polish each opened geode to a shine
- The nest is a little cave room where all your glowlings roam, nap, dance, visit each
  other and come when you call; decorate it with shards (lamp, mushrooms, cloud cushion,
  starry rug, geode shelf, moon spring, moon swing, fairy lights) and each kind of
  glowling has favorites it goes to play with
- Breeding: two happy glowlings at level 5+ can lay a mixed egg in the incubator; it
  hatches in about 3 real hours (stroke it to keep it warm), and the baby mixes their
  parts, colors and names, sometimes with a surprise trait
- The Glowpedia collects every glowling, geode and hybrid you've found
- No runtime libraries: canvas and the Web Audio API, with small local modules for
  optional online co-op; every sound (crackles, the stone "tok", crystal chimes and
  grotto ambience) is synthesized live

## Play locally

```sh
python3 -m http.server 8000
```

then visit http://localhost:8000.

## Online co-op (two devices)

Choose **Play together** on the title screen or open the co-op control in the grotto.
Both devices need the same game version, served over HTTPS or localhost.

1. The host chooses **Host**, then sends the invite code to their friend using a
   private messenger.
2. The guest pastes that code and chooses **Join**, then sends the generated reply
   code back to the host.
3. The host pastes and accepts the reply. Once both devices are connected, the host
   chooses a difficulty and starts a shared egg.
4. Either player can trace, tap knots, open the shell or polish. Both see the same
   egg and glowling. Each receives the hatch in their **own existing local nest**;
   neither save is sent to the other device. Co-op does not unlock campaign levels
   or replace moon-egg progress.
5. The host can start another shared egg. **Leave**, returning to the grotto/nest,
   or losing the connection ends the session. Unfinished eggs grant no reward;
   completed hatchlings remain saved. Reconnect by exchanging new codes.

Codes are deliberately exchanged in both directions: this is a static site, not a
hosted matchmaking service. No accounts, signaling backend, third-party JavaScript
libraries or paid hosting are required.

**Privacy and connectivity:** This is an encrypted, data-only WebRTC channel; no
camera or microphone capture. Hosting/joining contacts Google's public STUN server
(`stun.l.google.com:19302`) to discover connectivity candidates. Your invited peer
may learn your network addresses through WebRTC. Treat invite/reply codes as
private temporary connection details; they are not stored in your save. There is
no relay/TURN service, so restrictive firewalls and some mobile/symmetric NAT
combinations may prevent a connection. Try another network if direct connectivity
fails. Solo play still works without WebRTC or internet once cached.

## Verification

Tests need **Node.js 22 or newer**; there are no npm dependencies to install:

```sh
npm test
npm run check
```

The browser smoke additionally needs an **already installed** Chrome, Chromium or
Edge. It launches a separate temporary headless profile, never your normal browser
profile, and drives two isolated storage contexts using CDP:

```sh
npm run test:e2e
```

Set `CHROME_PATH` to the browser executable if automatic detection fails. The test
serves a loopback `/hatchstone/` path, like GitHub Pages, and exercises actual WebRTC
signaling/data channels, shared input and hatching, independent saves, resize and
disconnect behavior, solo play and offline reload. It does **not** certify
cross-network/NAT compatibility or replace testing on two physical devices. No
browser or model is downloaded; no backend is deployed.

## Install on a phone

Hatchstone is a small web app: open it in Safari (iPhone) or Chrome (Android) and choose
**Share → Add to Home Screen** / **Install app**. It opens full screen and works offline.
Your nest, glowlings and progress are saved on the device. Tap 💾 for a backup code
(copy, share or save as a file) and paste it on any device to bring your nest back.

## Hosting on GitHub Pages

Everything Pages needs is here: `index.html`, `coop-link.js`, `coop-state.js`,
`manifest.webmanifest`, `sw.js`, `icons/`,
`og-image.jpg` (the share preview) and `.nojekyll`. With the repository public:
Settings → Pages → Deploy from a branch → `main`, `/ (root)`. The game then lives at
`https://helavika.github.io/hatchstone/`; the share tags in `index.html` point there.
Bump `CACHE` in `sw.js` when cached JavaScript or icons change.
