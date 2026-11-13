import type { ClueDef } from "@qh/core";
import type { ContentBundle } from "./validate.ts";
import { analyseWeb, renderSheet, type WebReport } from "./web.ts";

/** The clues of a bundle (in file order), the web's report, and the generated design sheet. */
export function sheetFor(bundle: ContentBundle): { clues: ClueDef[]; report: WebReport; text: string } {
  const clues: ClueDef[] = [];
  const fileOf = new Map<string, string>();
  for (const f of [...bundle.files.clues].sort((a, b) => (a.file < b.file ? -1 : 1))) {
    if (!Array.isArray(f.data)) continue;
    for (const c of f.data as ClueDef[]) {
      clues.push(c);
      fileOf.set(c.id, f.file.replace(/^clues\//, "").replace(/\.json$/, ""));
    }
  }
  const npcs = new Map<string, string>();
  for (const f of bundle.files.npcs) if (Array.isArray(f.data)) for (const n of f.data as { id: string; name: string }[]) npcs.set(n.id, n.name);
  const group = (id: string) => fileOf.get(id) ?? "clues";
  const report = analyseWeb(clues, new Set(npcs.keys()), group);
  const text = renderSheet(clues, report, (id) => ({ sample: "stacks_slice" } as Record<string, string>)[group(id)] ?? group(id), (id) => npcs.get(id) ?? id.replace(/_/g, " "));
  return { clues, report, text };
}
