// Usage: node packages/content-tools/src/cli.ts <content-dir>
import { resolve } from "node:path";
import { loadContent } from "./load.ts";
import { validateContent } from "./validate.ts";

const root = resolve(process.argv[2] ?? "content");
const { bundle, issues: loadIssues } = loadContent(root);
const issues = [...loadIssues, ...validateContent(bundle)];

if (issues.length > 0) {
  for (const i of issues) console.error(`${i.file}: ${i.message}`);
  console.error(`\ncontent validation failed: ${issues.length} issue(s)`);
  process.exit(1);
}
const count = Object.values(bundle.files).reduce((n, f) => n + f.length, bundle.maps.length);
console.log(`content validation passed (${count} files)`);
