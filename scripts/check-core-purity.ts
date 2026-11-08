// Lint gate for NFR-3 / NFR-4: the core must stay deterministic and free of platform APIs.
// Usage: node scripts/check-core-purity.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../packages/core/src", import.meta.url).pathname;

const banned: { pattern: RegExp; why: string }[] = [
  { pattern: /\bMath\.random\b/, why: "use the injected Rng (NFR-3)" },
  { pattern: /\bDate\.now\b|\bnew Date\b|\bperformance\.now\b/, why: "use the sim clock (NFR-3)" },
  { pattern: /\b(window|document|navigator|localStorage|indexedDB|AudioContext)\b/, why: "no DOM/browser APIs in core (NFR-4)" },
  { pattern: /from\s+["'](phaser|pixi\.js|vite|node:)/, why: "core must not import renderers or Node APIs (NFR-4)" },
  { pattern: /\b(setTimeout|setInterval|requestAnimationFrame)\b/, why: "the core is stepped, never timer-driven" },
];

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (p.endsWith(".ts")) yield p;
  }
}

let failures = 0;
for (const file of files(root)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    // Ignore text inside the leading doc comments: lines starting with * are comments.
    if (/^\s*\*/.test(line) || /^\s*\/\*/.test(line)) return;
    for (const { pattern, why } of banned) {
      if (pattern.test(code)) {
        console.error(`${file}:${i + 1}: ${why}\n    ${line.trim()}`);
        failures++;
      }
    }
  });
}
if (failures > 0) {
  console.error(`\ncore purity check failed (${failures})`);
  process.exit(1);
}
console.log("core purity check passed");
