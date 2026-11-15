// Usage: node packages/content-tools/src/tree-cli.ts <content-dir> [--write]
// Renders the decision and achievement tree; with --write, regenerates docs/decision-tree.md.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent } from "./load.ts";
import { buildTree, type Manifest } from "./tree.ts";

const args = process.argv.slice(2);
const root = resolve(args.find((a) => !a.startsWith("--")) ?? "content");
const { bundle } = loadContent(root);
const manifest = JSON.parse(readFileSync(join(root, "design", "decisions.json"), "utf8")) as Manifest;
const { text, issues } = buildTree(bundle, manifest);
for (const i of issues) console.error(`${i.file}: ${i.message}`);
if (args.includes("--write")) {
  const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/decision-tree.md");
  writeFileSync(out, text);
  console.log(`wrote ${out}`);
} else console.log(text);
if (issues.length > 0) process.exit(1);
