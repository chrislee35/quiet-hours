// Usage: node packages/content-tools/src/solve-cli.ts <content-dir> [--max-states N]
import { resolve } from "node:path";
import { assemble } from "./assemble.ts";
import { loadContent } from "./load.ts";
import { checkSolvability, formatReport } from "./solvability.ts";
import { validateContent } from "./validate.ts";

const args = process.argv.slice(2);
const root = resolve(args.find((a) => !a.startsWith("--")) ?? "content");
const max = args.indexOf("--max-states");
const { bundle, issues: loadIssues } = loadContent(root);
const issues = [...loadIssues, ...validateContent(bundle)];
if (issues.length > 0) {
  for (const i of issues) console.error(`${i.file}: ${i.message}`);
  console.error("\ncontent is invalid; fix that first (pnpm validate)");
  process.exit(1);
}
const a = assemble(bundle);
const report = checkSolvability(a.worlds, a.content, a.config, a.goals, a.start, max >= 0 ? { maxStates: Number(args[max + 1]) } : {});
console.log(formatReport(report));
if (report.errors > 0) {
  console.error("\nsolvability check failed");
  process.exit(1);
}
console.log("solvability check passed");
