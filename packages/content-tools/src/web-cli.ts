// Usage: node packages/content-tools/src/web-cli.ts <content-dir> [--write]
// Prints the information web's report; with --write, regenerates docs/information-web.md from the clue data.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClueDef } from "@qh/core";
import { loadContent } from "./load.ts";
import { analyseWeb, renderSheet } from "./web.ts";
import { sheetFor } from "./web-sheet.ts";

const args = process.argv.slice(2);
const root = resolve(args.find((a) => !a.startsWith("--")) ?? "content");
const { bundle } = loadContent(root);
const { clues, report, text } = sheetFor(bundle);
console.log(`${report.total} clues (${report.critical} critical); true ${report.byReliability.true}, outdated ${report.byReliability.outdated}, false ${report.byReliability.false}, planted ${report.byReliability.planted}`);
for (const [need, n] of Object.entries(report.needs).sort(([a], [b]) => (a < b ? -1 : 1))) console.log(`  ${need.padEnd(18)} ${String(n.clues).padStart(3)} clues, ${n.critical} critical`);
console.log("most-asked people: " + report.people.slice(0, 6).map((p) => `${p.id} ${p.clues}`).join(", "));
for (const i of report.issues) console.error(`${i.file}: ${i.message}`);
if (args.includes("--write")) {
  const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/information-web.md");
  writeFileSync(out, text);
  console.log(`wrote ${out}`);
}
void clues; void analyseWeb; void renderSheet; void ({} as ClueDef);
if (report.issues.length > 0) process.exit(1);
