"use strict";
// Hatchstone · real crystals, glowlings, caves, snacks and decorations.
// All the game's scripts share one global scope and load in order (see index.html).

// ---------- real crystals, glowlings and caves ----------

/**
 * Real minerals that form in geodes or nodules. style: how the inside is drawn.
 * cavity = a hollow lined with crystal points, banded = tight rings, flecks = gold pyrite specks, flash = a colored sheen.
 */
const CRYSTALS = [
  { id: "amethyst", name: "Amethyst", rarity: "common", style: "cavity", c: ["#b48cf0", "#d9c2ff", "#7a52c7"], fact: "Purple quartz; the classic geode lining. Its color comes from traces of iron." },
  { id: "quartz", name: "Clear Quartz", rarity: "common", style: "cavity", c: ["#dde6f5", "#ffffff", "#9fadc6"], fact: "The most common crystal in geodes: six-sided points, clear as ice." },
  { id: "citrine", name: "Citrine", rarity: "common", style: "cavity", c: ["#ffd27a", "#fff0b8", "#e8a33d"], fact: "Golden quartz. Natural citrine is rare; most is heated amethyst." },
  { id: "smoky", name: "Smoky Quartz", rarity: "common", style: "cavity", c: ["#9a8a7c", "#d6cabd", "#5e5148"], fact: "Quartz darkened by natural radiation deep underground." },
  { id: "calcite", name: "Calcite", rarity: "common", style: "cavity", c: ["#f5b971", "#ffe2b8", "#c9813a"], fact: "Honey-colored and soft enough to scratch with a coin. Common in limestone geodes." },
  { id: "rose", name: "Rose Quartz", rarity: "common", style: "cavity", c: ["#f7a8c4", "#ffd6e5", "#d9779e"], fact: "Pink quartz, usually found in big masses rather than crystals." },
  { id: "agate", name: "Blue Lace Agate", rarity: "common", style: "banded", c: ["#8fb0d9", "#e1ecf7", "#4f6f9e"], fact: "Layer after layer of chalcedony fills the hollow, making fine wavy bands." },
  { id: "celestite", name: "Celestite", rarity: "common", style: "cavity", c: ["#a9d4f5", "#e8f6ff", "#6fa3d1"], fact: "Sky-blue crystals. Madagascar is famous for celestite geodes." },
  { id: "aqua", name: "Aquamarine", rarity: "rare", style: "cavity", c: ["#8fd8ef", "#d4f3ff", "#4fa9c9"], fact: "Blue-green beryl, a cousin of emerald. Named for sea water." },
  { id: "moonstone", name: "Moonstone", rarity: "rare", style: "flash", c: ["#c4ccff", "#ffffff", "#8c98d9"], fact: "A feldspar with a floating blue glow called adularescence." },
  { id: "peridot", name: "Peridot", rarity: "rare", style: "cavity", c: ["#b9e88a", "#ecffd0", "#78ad47"], fact: "Olivine from deep in the mantle, carried up by volcanoes." },
  { id: "fluorite", name: "Fluorite", rarity: "rare", style: "cavity", c: ["#a98bf0", "#c4f2d6", "#5f7f9e"], fact: "Purple and green cubes. It glows under UV light, which is where 'fluorescence' got its name." },
  { id: "rhodochrosite", name: "Rhodochrosite", rarity: "rare", style: "banded", c: ["#f08aa0", "#ffd1db", "#b5485f"], fact: "Raspberry-pink bands, formed in old silver mines in Argentina." },
  { id: "malachite", name: "Malachite", rarity: "rare", style: "banded", c: ["#3fb07a", "#a8ecc8", "#1d6b49"], fact: "Swirling green copper mineral, once ground up to make green paint." },
  { id: "turquoise", name: "Turquoise", rarity: "common", style: "flecks", c: ["#5fc9c0", "#c4f2ec", "#2f7d76"], fact: "Sky-blue copper stone with dark veins, treasured for thousands of years." },
  { id: "pyrite", name: "Pyrite", rarity: "rare", style: "cavity", c: ["#e0c060", "#fff2b0", "#9a7a2a"], fact: "Fool's gold: brassy cubes so perfect they look machine-made." },
  { id: "tourmaline", name: "Watermelon Tourmaline", rarity: "rare", style: "banded", c: ["#f07aa0", "#c8f0b0", "#3f9a5a"], fact: "Pink in the middle and green at the rim, like a slice of watermelon." },
  { id: "sunstone", name: "Sunstone", rarity: "rare", style: "flash", c: ["#f7a35c", "#ffe0b8", "#c2623a"], fact: "Feldspar full of tiny copper plates that glitter like a sunset." },
  { id: "opal", name: "Opal", rarity: "legendary", style: "flash", c: ["#ffc8ef", "#c9f1ff", "#b9a2ff"], fact: "Tiny silica spheres split light into flashes of every color." },
  { id: "labradorite", name: "Labradorite", rarity: "legendary", style: "flash", c: ["#5d7a8f", "#9fe3e0", "#2c3e4f"], fact: "Gray stone that flashes peacock blue and gold when it turns in the light." },
  { id: "carnelian", name: "Carnelian", rarity: "common", style: "banded", c: ["#f28a4a", "#ffd2ad", "#b8461f"], fact: "Orange chalcedony. Romans carved it into seals because hot wax won't stick to it." },
  { id: "garnet", name: "Garnet", rarity: "rare", style: "cavity", c: ["#c8384f", "#ff9aa8", "#7a1630"], fact: "Deep red crystals with many faces. Its name comes from pomegranate seeds." },
  { id: "tigereye", name: "Tiger's Eye", rarity: "rare", style: "flash", c: ["#b8742a", "#ffd36a", "#4a2a0e"], fact: "Quartz made of fine fibers: golden stripes shimmer and roll as you turn it." },
  { id: "emerald", name: "Emerald", rarity: "legendary", style: "cavity", c: ["#2fbf71", "#b4ffd6", "#13693c"], fact: "Green beryl. Almost every emerald has tiny flaws inside, called its \"garden\"." },
  { id: "lapis", name: "Lapis Lazuli", rarity: "legendary", style: "flecks", c: ["#3a4fb8", "#9fb0ff", "#1c2366"], fact: "Deep blue with gold pyrite specks like stars. Ground into ultramarine paint for 6,000 years." },
];
const CRYSTAL = Object.fromEntries(CRYSTALS.map(c => [c.id, c]));

/** Every glowling is assembled from parts: body, ears, things on its head and its back, a pattern and eyes. */
const SPECIES = [
  { id: "mothlet", name: "Mothlet", crystal: "amethyst", body: "round", head: "antennae", back: "mothwings", pattern: "freckles", eyes: "sparkle", snack: "berry", voice: 1.0,
    lore: "Flutters toward any light, even your phone screen. Leaves a trail of lilac dust on everything it loves." },
  { id: "dozeling", name: "Dozeling", crystal: "amethyst", body: "bean", head: "cap", pattern: "belly", eyes: "sleepy", snack: "cookie", voice: 0.8,
    lore: "Has never been fully awake. Dreams in perfect hexagons and snores in a minor key." },
  { id: "glassling", name: "Glassling", crystal: "quartz", body: "round", head: "crystal", pattern: "bubbles", eyes: "big", snack: "dew", voice: 1.15,
    lore: "So clear you can see what it's thinking. Mostly it's thinking about you." },
  { id: "sunnub", name: "Sunnub", crystal: "citrine", body: "round", head: "rays", pattern: "freckles", eyes: "sparkle", snack: "cookie", voice: 1.15,
    lore: "Warm to the touch, always. Grotto keepers borrow them on cold nights as tiny heaters." },
  { id: "honeybop", name: "Honeybop", crystal: "citrine", body: "bean", head: "antennae", back: "mothwings", pattern: "stripes", eyes: "round", snack: "dew", voice: 1.3,
    lore: "Hums while it works. Nobody knows what it works on. It seems very busy about it." },
  { id: "smudgekin", name: "Smudgekin", crystal: "smoky", body: "wide", ears: "tufts", pattern: "belly", eyes: "sleepy", snack: "cookie", voice: 0.8,
    lore: "Smells faintly of campfires that never happened. Loves blankets, distrusts mornings." },
  { id: "ambercub", name: "Ambercub", crystal: "calcite", body: "round", ears: "cat", back: "tail", pattern: "freckles", eyes: "round", snack: "berry", voice: 1.05,
    lore: "Glows like honey in lamplight and follows warm spots around the cave all day." },
  { id: "blushbun", name: "Blushbun", crystal: "rose", body: "round", ears: "bunny", pattern: "heart", eyes: "round", snack: "berry", voice: 1.2,
    lore: "Turns pinker when complimented. Try it. It will hide behind its own ears." },
  { id: "petalpuff", name: "Petalpuff", crystal: "rose", body: "wide", head: "petals", pattern: "spots", eyes: "round", snack: "dew", voice: 1.1,
    lore: "Its petals open a little more each time it laughs. Fully bloomed ones are very rare and very smug." },
  { id: "ringlet", name: "Ringlet", crystal: "agate", body: "bean", head: "antennae", pattern: "stripes", eyes: "round", snack: "dew", voice: 1.1,
    lore: "Grows one new ring every birthday, like the agate it came from. Counts them out loud, often wrong." },
  { id: "skyfin", name: "Skyfin", crystal: "celestite", body: "drop", back: "fins", pattern: "freckles", eyes: "sparkle", snack: "dew", voice: 1.2,
    lore: "Swims through the air as if it were water. Nobody has told it otherwise." },
  { id: "ripplet", name: "Ripplet", crystal: "aqua", body: "drop", back: "fins", pattern: "spots", eyes: "big", snack: "dew", voice: 0.95,
    lore: "Made mostly of cave water and good intentions. Splashes when startled, apologizes after." },
  { id: "bubblequill", name: "Bubblequill", crystal: "aqua", body: "round", head: "crystal", back: "fins", pattern: "bubbles", eyes: "round", snack: "berry", voice: 1.05,
    lore: "Blows one perfect bubble a day and guards it until it pops. Then it sulks for exactly one minute." },
  { id: "lunaroo", name: "Lunaroo", crystal: "moonstone", body: "bean", ears: "bunny", head: "crescent", pattern: "freckles", eyes: "sparkle", snack: "berry", voice: 0.9,
    lore: "Hops higher under a full moon. Keeps a crescent on its head in case it gets lost." },
  { id: "hushowl", name: "Hushowl", crystal: "moonstone", body: "wide", ears: "tufts", pattern: "belly", eyes: "big", snack: "cookie", voice: 0.75,
    lore: "Says nothing. Notices everything. Remembers the exact moment you wandered off the line." },
  { id: "sproutle", name: "Sprigglet", crystal: "peridot", body: "round", head: "sprout", pattern: "spots", eyes: "round", snack: "dew", voice: 1.1,
    lore: "Grows a new leaf every few levels. Water it with attention; it isn't picky about the rest." },
  { id: "mossmew", name: "Mossmew", crystal: "peridot", body: "wide", ears: "cat", back: "tail", pattern: "spots", eyes: "sleepy", snack: "cookie", voice: 1.0,
    lore: "Soft as moss and twice as stubborn. Purrs like a tiny, friendly landslide." },
  { id: "flutterite", name: "Flutterite", crystal: "fluorite", body: "round", back: "mothwings", head: "crystal", pattern: "stripes", eyes: "big", snack: "berry", voice: 1.15,
    lore: "Glows a different color under moonlight, just like its stone. Very proud of this. Mentions it often." },
  { id: "rosettle", name: "Rosettle", crystal: "rhodochrosite", body: "wide", head: "petals", pattern: "heart", eyes: "sparkle", snack: "berry", voice: 1.2,
    lore: "Its petals keep the raspberry stripes of its home stone. Blushes in bands." },
  { id: "swirlhorn", name: "Swirlhorn", crystal: "malachite", body: "bean", head: "crystal", back: "fluff", pattern: "stripes", eyes: "round", snack: "cookie", voice: 0.95,
    lore: "Green swirls go round and round its fur. Staring at them makes you sleepy, which it finds hilarious." },
  { id: "prismpip", name: "Prismpip", crystal: "opal", body: "round", head: "crystal", back: "startail", pattern: "iridescent", eyes: "sparkle", snack: "berry", voice: 1.25,
    lore: "Never the same color twice. Each of its moods has its own rainbow." },
  { id: "dreamwisp", name: "Dreamwisp", crystal: "opal", body: "drop", back: "wisp", pattern: "iridescent", eyes: "sleepy", snack: "dew", voice: 0.85,
    lore: "Half creature, half daydream. Drifts a little when you look away and pretends it didn't." },
  { id: "auroray", name: "Auroray", crystal: "labradorite", body: "bean", head: "crystal", back: "ribbon", pattern: "iridescent", eyes: "sparkle", snack: "berry", voice: 1.1,
    lore: "Its ribbon tail flashes peacock blue when it dances. The cave ceiling remembers every color." },
  { id: "glimmerfox", name: "Glimmerfox", crystal: "labradorite", body: "wide", ears: "fox", back: "fluff", pattern: "freckles", eyes: "sparkle", snack: "cookie", voice: 1.0,
    lore: "Collects shiny things: shards, glints, your attention. Returns none of them." },
  { id: "nebbit", name: "Nebbit", crystal: "lapis", body: "round", head: "antennae", pattern: "galaxy", eyes: "big", snack: "berry", voice: 0.8,
    lore: "A small piece of night with gold specks for stars. Wears a constellation nobody has named yet." },
  { id: "cometail", name: "Cometail", crystal: "lapis", body: "drop", back: "comet", pattern: "galaxy", eyes: "sparkle", snack: "dew", voice: 1.2,
    lore: "Zooms. Constantly. Its tail is the last thing you see and the first thing you remember." },
  // only in moon eggs, one per season
  { id: "emberleaf", name: "Emberleaf", crystal: "moonstone", moon: "autumn", pal: ["#ff9a5c", "#ffd29e", "#c4542b"], body: "round", ears: "fox", head: "sprout", back: "fluff", pattern: "freckles", eyes: "sparkle", snack: "cookie", voice: 1.05,
    lore: "Only hatches when the leaves turn. Smells like toasted marshmallows and crisp mornings." },
  { id: "frostpuff", name: "Frostpuff", crystal: "moonstone", moon: "winter", pal: ["#cfe6ff", "#ffffff", "#7fa8d9"], body: "round", head: "petals", back: "wisp", pattern: "bubbles", eyes: "big", snack: "dew", voice: 1.25,
    lore: "A winter moon-egg puff. Every sneeze is a tiny snowfall." },
  { id: "bloomkit", name: "Bloomkit", crystal: "moonstone", moon: "spring", pal: ["#ffc2dc", "#fff0f6", "#e07aa8"], body: "wide", ears: "cat", head: "petals", pattern: "heart", eyes: "round", snack: "berry", voice: 1.2,
    lore: "A spring moon-egg kitten. Sneaks flowers into your pockets when you're not looking." },
  { id: "sunsplash", name: "Sunsplash", crystal: "moonstone", moon: "summer", pal: ["#7fe0d6", "#e0fff8", "#2fa39a"], body: "drop", head: "rays", back: "fins", pattern: "spots", eyes: "sparkle", snack: "dew", voice: 1.15,
    lore: "A summer moon-egg sprite. Leaves warm little puddles of light wherever it naps." },
  // only in moon eggs during an event, a few weeks a year
  { id: "petalpup", name: "Petalpup", crystal: "moonstone", moon: "spring", event: "bloom", pal: ["#f7a8c8", "#ffe6f1", "#c9618f"], body: "round", ears: "bunny", head: "petals", back: "fluff", pattern: "heart", eyes: "sparkle", snack: "berry", voice: 1.15,
    lore: "Hatches when the grotto blooms. Leaves a trail of petals everywhere, and refuses to apologize for it." },
  { id: "glimmerbug", name: "Glimmerbug", crystal: "moonstone", moon: "summer", event: "fireflies", pal: ["#d8f27a", "#fbffd0", "#7fa83a"], body: "bean", head: "antennae", back: "mothwings", pattern: "spots", eyes: "big", snack: "dew", voice: 1.3,
    lore: "Blinks on and off all evening. Nobody knows what it's saying, but it's clearly very happy about it." },
  { id: "acornet", name: "Acornet", crystal: "moonstone", moon: "autumn", event: "harvest", pal: ["#c98a4a", "#f2cf9a", "#7d4f24"], body: "round", ears: "tufts", head: "cap", back: "tail", pattern: "belly", eyes: "round", snack: "cookie", voice: 0.9,
    lore: "Hides snacks for winter and forgets where. The nest is full of surprise cookies." },
  { id: "gourdlet", name: "Gourdlet", crystal: "moonstone", moon: "autumn", event: "hollow", pal: ["#ff9d3c", "#ffe0a0", "#b8521c"], body: "wide", head: "sprout", back: "wisp", pattern: "stripes", eyes: "sleepy", snack: "cookie", voice: 0.95,
    lore: "Glows from the inside like a carved lantern. Spooky for exactly one second, then wants a hug." },
  { id: "rimeling", name: "Rimeling", crystal: "moonstone", moon: "autumn", event: "frost", pal: ["#b9c8ff", "#f4f6ff", "#6f7fc9"], body: "drop", ears: "cat", head: "crystal", back: "startail", pattern: "iridescent", eyes: "sparkle", snack: "dew", voice: 1.25,
    lore: "Breathes ferns of frost onto every window it passes, then signs each one with a tiny paw." },
  { id: "twinklet", name: "Twinklet", crystal: "moonstone", moon: "winter", event: "lights", pal: ["#ff6f7f", "#ffe1a8", "#b8324a"], body: "round", ears: "fox", head: "rays", back: "ribbon", pattern: "spots", eyes: "sparkle", snack: "cookie", voice: 1.1,
    lore: "Wears a ribbon nobody tied and glows in five colors at once. Counts down to every new year, loudly." },
  { id: "veilfin", name: "Veilfin", crystal: "turquoise", body: "wide", back: "fins", pattern: "bubbles", eyes: "round", snack: "dew", voice: 0.9,
    lore: "Hums sea songs it has never heard. Loves water, and anyone who brings it some." },
  { id: "cubbet", name: "Cubbet", crystal: "pyrite", body: "round", head: "crystal", back: "tail", pattern: "spots", eyes: "round", snack: "cookie", voice: 0.95,
    lore: "Sits very still in perfect squares. Thinks it's made of gold, and nobody has the heart to tell it." },
  { id: "melonpip", name: "Melonpip", crystal: "tourmaline", body: "drop", head: "sprout", back: "ribbon", pattern: "stripes", eyes: "big", snack: "berry", voice: 1.2,
    lore: "Smells faintly of summer. Rolls instead of walking when it's happy." },
  { id: "embermote", name: "Embermote", crystal: "sunstone", body: "round", head: "rays", back: "comet", pattern: "freckles", eyes: "sparkle", snack: "dew", voice: 1.1,
    lore: "Glows warmest at dusk, and follows the last sunbeam across the room every evening." },
  { id: "hearthling", name: "Hearthling", crystal: "carnelian", pal: ["#e8743a", "#ffb07a", "#a8401c"], body: "wide", ears: "tufts", back: "fluff", pattern: "belly", eyes: "sleepy", snack: "cookie", voice: 0.85,
    lore: "Always sits closest to the lamp and hums like a kettle about to boil. Very good at being warm." },
  { id: "pippom", name: "Pippom", crystal: "garnet", body: "round", head: "petals", pattern: "spots", eyes: "big", snack: "berry", voice: 1.2,
    lore: "Named for pomegranate seeds, like its stone. Rattles softly when it hops, and nobody knows why." },
  { id: "tigrell", name: "Tigrell", crystal: "tigereye", pal: ["#a8662a", "#e0a050", "#5a3410"], body: "bean", ears: "cat", back: "tail", pattern: "stripes", eyes: "sparkle", snack: "cookie", voice: 1.0,
    lore: "Its stripes flash gold when it turns its head. So it turns its head a lot." },
  { id: "gladewing", name: "Gladewing", crystal: "emerald", pal: ["#2fae68", "#8fe8b4", "#13693c"], body: "drop", head: "sprout", back: "mothwings", pattern: "spots", eyes: "sparkle", snack: "dew", voice: 1.1,
    lore: "Carries a tiny garden inside, just like an emerald. It lets you look, if you ask nicely." }
];
const rarityOf = sp => sp.moon ? "moon" : CRYSTAL[sp.crystal].rarity;
const SP = Object.fromEntries(SPECIES.map(s => [s.id, s]));

const PARTS = ["body", "ears", "head", "back", "pattern", "eyes"];
const palOf = sp => sp.pal || CRYSTAL[sp.crystal].c;
const hybridCache = new Map();
/** What a glowling looks and sounds like: its species, or for a mixed hatchling, its own blend of parts. */
function specOf(cr) {
  if (!cr.mix) return SP[cr.sp];
  let h = hybridCache.get(cr.id);
  if (!h) {
    const m = cr.mix;
    h = { id: "h" + cr.id, name: m.name, crystal: m.crystal, pal: m.pal, snack: m.snack, voice: m.voice, beh: m.beh, hybrid: true, parents: m.parents,
      lore: tr("A one-of-a-kind mix of {0}, hatched in your nest.", m.parents.join(tr(" and "))) };
    for (const k of PARTS) h[k] = m[k];
    hybridCache.set(cr.id, h);
  }
  return h;
}

/** Real geode outsides: rough, plain rock that gives nothing away. */
const STONES = [
  ["#8d8a91", "#5f5c66", "#b7b3bb"], // basalt
  ["#d8cdb8", "#a89c86", "#eee6d6"], // limestone
  ["#b9b2c4", "#8a8199", "#dcd7e6"], // chalcedony crust
  ["#b8896a", "#8a5f45", "#d9b49a"], // iron-stained
  ["#d4b48c", "#a8875f", "#ecd6b6"], // desert sandstone
  ["#6f6a78", "#4a4652", "#9893a3"], // dark volcanic
];

const SNACKS = {
  dew: { name: "Dewdrop", emoji: "💧", cost: 5, tummy: 15, joy: 4 },
  cookie: { name: "Stardust cookie", emoji: "🍪", cost: 10, tummy: 30, joy: 6 },
  berry: { name: "Moonberry", emoji: "🫐", cost: 15, tummy: 40, joy: 10 },
  // drinks: a sip, no heavy tummy (so no drowsiness); the fizzy and the minty ones wake you up
  milk: { name: "Moon milk", emoji: "🥛", cost: 6, tummy: 10, joy: 4, drink: true },
  fizz: { name: "Starfizz", emoji: "🥤", cost: 18, tummy: 4, joy: 12, energy: 35, drink: true },
  // only the garden grows these: no shop sells them
  juice: { name: "Berry juice", emoji: "🧃", tummy: 8, joy: 18, drink: true, garden: true },
  tea: { name: "Moon mint tea", emoji: "🍵", tummy: 4, joy: 6, energy: 45, drink: true, garden: true },
  star: { name: "Starfruit", emoji: "🌟", tummy: 35, joy: 10, fav: true, garden: true },
  cap: { name: "Growcap", emoji: "🍄", tummy: 20, joy: 6, xp: 40, garden: true },
};

/** Things to buy with shards. Each has a fixed spot in the room and the kinds of glowling that love it. */
const DECOR = [
  { id: "lamp", name: "Crystal lamp", emoji: "🔮", cost: 40, lovers: ["flutter"], spot: [0.04, 0.06], verb: "warms up by the lamp", emote: "✦" },
  { id: "mushrooms", name: "Glow mushrooms", emoji: "🍄", cost: 35, lovers: ["hop"], spot: [0.1, 0.92], verb: "bounces on the mushrooms", emote: "♪" },
  { id: "cushion", name: "Cloud cushion", emoji: "☁️", cost: 30, lovers: ["nap"], spot: [0.72, 0.92], verb: "naps on the cloud", emote: "zz" },
  { id: "rug", name: "Starry rug", emoji: "✨", cost: 45, lovers: ["dance"], spot: [0.42, 0.55], verb: "dances on the rug", emote: "♪" },
  { id: "shelf", name: "Geode shelf", emoji: "💎", cost: 60, lovers: ["curious"], spot: [0.18, 0], verb: "admires your geodes", emote: "💎" },
  { id: "spring", name: "Moon spring", emoji: "💧", cost: 80, lovers: ["swim"], spot: [0.62, 0.66], verb: "splashes in the spring", emote: "💧" },
  { id: "swing", name: "Moon swing", emoji: "🌙", cost: 70, lovers: ["nap", "hop"], spot: [0.9, 0.4], verb: "swings on the moon", emote: "♥" },
  { id: "lights", name: "Fairy lights", emoji: "🎐", cost: 55, lovers: ["flutter", "dance"], spot: [0.5, 0], verb: "chases the fairy lights", emote: "✦" },
];
// the isometric room has space for more: these stand on the floor (or hang on the wall) only in that view
DECOR.push(
  { id: "bookcase", name: "Bookcase", emoji: "📚", cost: 65, lovers: ["curious"], verb: "leafs through a book", emote: "✦", iso: true },
  { id: "armchair", name: "Moss armchair", emoji: "🛋️", cost: 50, lovers: ["nap"], verb: "curls up in the armchair", emote: "zz", iso: true },
  { id: "table", name: "Tea table", emoji: "🫖", cost: 45, lovers: ["dance", "curious"], verb: "sips moonleaf tea", emote: "♥", iso: true },
  { id: "chest", name: "Toy chest", emoji: "🧸", cost: 40, lovers: ["hop"], verb: "digs through the toy chest", emote: "!", iso: true },
  { id: "plant", name: "Crystal plant", emoji: "🪴", cost: 35, lovers: ["flutter", "swim"], verb: "sniffs the crystal plant", emote: "✦", iso: true },
  { id: "musicbox", name: "Music box", emoji: "🎼", cost: 120, lovers: ["dance", "flutter"], verb: "sways to the music box", emote: "♪", iso: true, legend: true, how: "meet a legendary glowling" },
  { id: "bench", name: "Garden bench", emoji: "🪑", cost: 45, lovers: ["nap", "curious"], verb: "sits on the bench", emote: "♥", iso: true, rooms: ["yard", "garden"] },
  { id: "lamppost", name: "Lantern post", emoji: "🏮", cost: 55, lovers: ["flutter"], verb: "circles the lantern", emote: "✦", iso: true, rooms: ["yard", "garden"] },
  { id: "birdbath", name: "Birdbath", emoji: "⛲", cost: 60, lovers: ["swim", "flutter"], verb: "splashes in the birdbath", emote: "💧", iso: true, rooms: ["yard", "garden"] },
  { id: "drum", name: "Little drum", emoji: "🥁", cost: 50, lovers: ["dance", "hop"], verb: "bangs the drum", emote: "♪", iso: true, rooms: ["play"] },
  { id: "blocks", name: "Toy blocks", emoji: "🧱", cost: 35, lovers: ["hop", "curious"], verb: "stacks the blocks", emote: "!", iso: true, rooms: ["play", "nest"] },
  { id: "telescope", name: "Telescope", emoji: "🔭", cost: 90, lovers: ["curious", "flutter"], verb: "looks at the stars", emote: "✦", iso: true, rooms: ["study", "yard"] },
  { id: "painting", name: "Moon painting", emoji: "🖼️", cost: 55, lovers: ["curious", "dance"], verb: "admires the painting", emote: "✦", iso: true, wall: true },
);
if (LANG === "uk") for (const d of DECOR) if (d.iso) { d.name = tr(d.name); d.verb = tr(d.verb); if (d.how) d.how = tr(d.how); }
/** The music box is legendary: it's for those who have met a legendary glowling. */
const legendOk = () => Object.keys(save.seen).some(id => SP[id] && rarityOf(SP[id]) === "legendary") || save.creatures.some(c => SP[c.sp] && rarityOf(SP[c.sp]) === "legendary");
const DECO = Object.fromEntries(DECOR.map(d => [d.id, d]));
const BEHAVIOR_NAMES = { flutter: "flutterers", hop: "hoppers", nap: "nappers", dance: "dancers", curious: "curious ones", swim: "swimmers" };

const STAGES = ["Baby", "Young", "Grown", "Radiant"];
const stageOf = level => level < 5 ? 0 : level < 10 ? 1 : level < 15 ? 2 : 3;
const xpNeed = level => 20 + level * 15;
const MAX_LEVEL = 20;

const CAVES = ["Amethyst Hollow", "Celestite Grotto", "Malachite Deep", "Labradorite Vault"];
const CAVE_NOTES = ["Soft stone · the weak spot hides from level 4", "Harder stone · rare crystals", "Find the weak spot by ear · a chance of legendary", "The toughest stone and the rarest geodes"];
