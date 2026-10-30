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
- The Glowpedia collects every glowling and geode you've found
- No libraries and no asset files: one `index.html` with canvas and the Web Audio API;
  every sound (crackles, the stone "tok", crystal chimes, the grotto ambience) is synthesized live

## Play locally

```sh
python3 -m http.server 8000
```

then visit http://localhost:8000.
