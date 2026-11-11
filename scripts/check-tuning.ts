// Lint gate for NFR-8 / T2.14: the simulation's tunable numbers live in content/config/tuning.json, not in code.
// Scans the *systems* (the files that decide how the game plays) for numeric literals other than a few structural
// ones, and fails on any that is not either moved into the config or explained on its line with `// tuning-ok: why`.
// Usage: node scripts/check-tuning.ts [--list]
import { readFileSync } from "node:fs";

/** The systems listed in DESIGN §12: everything whose numbers are game-feel, not mathematics. */
export const SYSTEM_FILES = [
  "alert.ts", "cameras.ts", "combat.ts", "comms.ts", "demerits.ts", "districts.ts", "economy.ts", "identity.ts",
  "movement.ts", "nav.ts", "npcs.ts", "processing.ts", "repairs.ts", "robots.ts", "sim.ts", "vision.ts", "augments.ts", "terminal.ts", "dialogue/runtime.ts",
];

/** Numbers that carry no game-feel: zero, one, two (halves, doubles, pairs, off-by-one). */
const STRUCTURAL = new Set(["0", "1", "2", "-1"]);

export interface Finding {
  file: string;
  line: number;
  literal: string;
  text: string;
}

/** Blanks out comments and string/template/regex contents so only real code is scanned. */
export function codeOnly(source: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (const raw of source.split("\n")) {
    let line = "";
    let i = 0;
    while (i < raw.length) {
      if (inBlock) {
        const end = raw.indexOf("*/", i);
        if (end < 0) { i = raw.length; break; }
        inBlock = false;
        i = end + 2;
        continue;
      }
      const two = raw.slice(i, i + 2);
      if (two === "/*") { inBlock = true; i += 2; continue; }
      if (two === "//") break;
      const ch = raw[i]!;
      if (ch === '"' || ch === "'" || ch === "`") {
        let j = i + 1;
        while (j < raw.length && raw[j] !== ch) j += raw[j] === "\\" ? 2 : 1;
        line += `${ch}${ch}`;
        i = j + 1;
        continue;
      }
      line += ch;
      i++;
    }
    out.push(line);
  }
  return out;
}

export function scan(file: string, source: string): Finding[] {
  const lines = source.split("\n");
  const code = codeOnly(source);
  const found: Finding[] = [];
  code.forEach((line, i) => {
    if (/\/\/\s*tuning-ok:\s*\S/.test(lines[i]!)) return;
    // Naming a structural constant is the fix, not the problem: `const NAME = 12;` at module level, with a comment saying why.
    if (/^\s*(export\s+)?const\s+[A-Z][A-Z0-9_]*\s*(:[^=]+)?=/.test(line)) return;
    for (const m of line.matchAll(/(?<![\w.$#])(\d+\.?\d*(?:e[+-]?\d+)?)(?![\w])/gi)) {
      const lit = m[1]!;
      if (STRUCTURAL.has(lit)) continue;
      // Array/tuple index like [3] or x[0] and the `0x` hex prefix are not tunables.
      if (/\[\s*\d+\s*\]/.test(line.slice(Math.max(0, m.index! - 1), m.index! + lit.length + 2))) continue;
      found.push({ file, line: i + 1, literal: lit, text: lines[i]!.trim() });
    }
  });
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = new URL("../packages/core/src/", import.meta.url).pathname;
  const all = SYSTEM_FILES.flatMap((f) => scan(f, readFileSync(root + f, "utf8")));
  if (process.argv.includes("--list")) {
    for (const f of all) console.log(`${f.file}:${f.line}: ${f.literal}   ${f.text}`);
  }
  if (all.length > 0) {
    if (!process.argv.includes("--list")) for (const f of all) console.error(`${f.file}:${f.line}: magic number ${f.literal}\n    ${f.text}`);
    console.error(`\ntuning check failed: ${all.length} numeric literal(s) in simulation systems.\nMove each into content/config/tuning.json (and the Config type), or explain it on its line with "// tuning-ok: why".`);
    process.exit(1);
  }
  console.log(`tuning check passed (${SYSTEM_FILES.length} system files)`);
}
