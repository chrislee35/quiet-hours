import { compileDialogue, type AugmentDef, type ServiceDef, type ItemDef, type ClueDef, type Content, type PuzzleDef, type TerminalDef } from "@qh/core";

/**
 * Loads dialogue (.qdl) and clue definitions from content/ at startup. The same compiler and checks run in
 * `pnpm validate`, so a failure here means someone bypassed validation; we fail loudly rather than limp on.
 */
const qdl = import.meta.glob("../../../content/dialogue/*.qdl", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const clueFiles = import.meta.glob("../../../content/clues/*.json", { import: "default", eager: true }) as Record<string, ClueDef[]>;

const puzzleFiles = import.meta.glob("../../../content/puzzles/*.json", { import: "default", eager: true }) as Record<string, PuzzleDef[]>;
const terminalFiles = import.meta.glob("../../../content/terminals/*.json", { import: "default", eager: true }) as Record<string, TerminalDef[]>;
const augmentFiles = import.meta.glob("../../../content/augments/*.json", { import: "default", eager: true }) as Record<string, AugmentDef[]>;
const itemFiles = import.meta.glob("../../../content/items/*.json", { import: "default", eager: true }) as Record<string, ItemDef[]>;
const serviceFiles = import.meta.glob("../../../content/services/*.json", { import: "default", eager: true }) as Record<string, ServiceDef[]>;

export function loadContent(): Content {
  const clues: Record<string, ClueDef> = {};
  for (const list of Object.values(clueFiles)) for (const c of list) clues[c.id] = c;
  const dialogues: Content["dialogues"] = {};
  for (const [path, text] of Object.entries(qdl)) {
    const id = path.replace(/^.*\//, "").replace(/\.qdl$/, "");
    const { dialogue, errors } = compileDialogue(text, { id, knownClues: new Set(Object.keys(clues)) });
    if (!dialogue) throw new Error(`dialogue ${id}:\n${errors.map((e) => `  line ${e.line}: ${e.message}`).join("\n")}`);
    dialogues[id] = dialogue;
  }
  const puzzles: Content["puzzles"] = {};
  for (const list of Object.values(puzzleFiles)) for (const p of list) puzzles[p.id] = p;
  const terminals: Content["terminals"] = {};
  for (const list of Object.values(terminalFiles)) for (const t of list) terminals[t.id] = t;
  const augments: Content["augments"] = {};
  for (const list of Object.values(augmentFiles)) for (const a of list) augments[a.id] = a;
  const items: Content["items"] = {};
  for (const list of Object.values(itemFiles)) for (const i of list) items[i.id] = i;
  const services: Content["services"] = {};
  for (const list of Object.values(serviceFiles)) for (const sv of list) services[sv.id] = sv;
  return { dialogues, clues, puzzles, terminals, augments, items, services };
}
