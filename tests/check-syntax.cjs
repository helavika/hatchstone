"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(s => s.trim());
for (const [i, source] of scripts.entries()) new vm.Script(source, { filename: `index.html:inline-${i + 1}` });
// the game's own scripts, in the order index.html loads them (they share one global scope)
const gameScripts = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
if (gameScripts.length < 2) throw new Error("index.html should load the game from js/*.js");
for (const filename of gameScripts) {
  if (!fs.readFileSync(path.join(root, filename), "utf8").startsWith('"use strict";')) throw new Error(filename + " should start with \"use strict\"");
}
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
for (const filename of ["style.css", ...gameScripts]) if (!sw.includes(`"${filename}"`)) throw new Error(`sw.js doesn't cache ${filename} for offline play`);
for (const filename of ["coop-link.js", "coop-invite.js", "coop-state.js", "vendor/peerjs-1.5.5.min.js", "sw.js", ...gameScripts]) {
  new vm.Script(fs.readFileSync(path.join(root, filename), "utf8"), { filename });
}
// Only static markup owns document IDs; inline templates contain repeated data-id values.
const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
if (new Set(ids).size !== ids.length) throw new Error("Duplicate HTML IDs");
console.log(`Syntax OK: ${scripts.length} inline script(s), ${gameScripts.length} game scripts, 5 other local scripts; no duplicate HTML IDs`);
