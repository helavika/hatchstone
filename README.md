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
- No libraries and no asset files: one `index.html` with canvas and the Web Audio API;
  every sound (crackles, the stone "tok", crystal chimes, the grotto ambience) is synthesized live

## Play locally

```sh
python3 -m http.server 8000
```

then visit http://localhost:8000.

## Install on a phone

Hatchstone is a small web app: open it in Safari (iPhone) or Chrome (Android) and choose
**Share → Add to Home Screen** / **Install app**. It opens full screen and works offline.
Your nest, glowlings and progress are saved on the device. Tap 💾 for a backup code
(copy, share or save as a file) and paste it on any device to bring your nest back.

## Hosting on GitHub Pages

Everything Pages needs is here: `index.html`, `manifest.webmanifest`, `sw.js`, `icons/`,
`og-image.jpg` (the share preview) and `.nojekyll`. With the repository public:
Settings → Pages → Deploy from a branch → `main`, `/ (root)`. The game then lives at
`https://helavika.github.io/hatchstone/`; the share tags in `index.html` point there.
Bump `CACHE` in `sw.js` when icons change.
