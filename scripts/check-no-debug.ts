// Fails if the debug overlay made it into a production bundle (DESIGN §16.8).
// Usage: node scripts/check-no-debug.ts <dist-dir>
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const dist = resolve(process.argv[2] ?? "packages/client/dist");
if (!existsSync(dist)) {
  console.error(`no such directory: ${dist} (run pnpm build first)`);
  process.exit(2);
}
const MARKER = "QH_DEBUG_OVERLAY_MARKER";

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(js|mjs|html|map)$/.test(p)) yield p;
  }
}

const hits = [...files(dist)].filter((f) => readFileSync(f, "utf8").includes(MARKER));
if (hits.length > 0) {
  console.error(`debug overlay found in production bundle:\n${hits.map((h) => `  ${h}`).join("\n")}`);
  process.exit(1);
}
console.log("no debug code in bundle");
