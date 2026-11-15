import { compileDialogue, composeMentors, type MentorVoicing, type AugmentDef, type ServiceDef, type ReactionDef, type QuestDef, type GrowthDef, type ItemDef, type ClueDef, type Content, type PuzzleDef, type TerminalDef } from "@qh/core";

/**
 * Loads dialogue (.qdl) and clue definitions from content/ at startup. The same compiler and checks run in
 * `pnpm validate`, so a failure here means someone bypassed validation; we fail loudly rather than limp on.
 */
const qdl = import.meta.glob("../../../content/dialogue/*.qdl", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const mentorArc = import.meta.glob("../../../content/mentors/arc.qdl", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const mentorFiles = import.meta.glob("../../../content/mentors/*.json", { import: "default", eager: true }) as Record<string, MentorVoicing>;
const clueFiles = import.meta.glob("../../../content/clues/*.json", { import: "default", eager: true }) as Record<string, ClueDef[]>;

const puzzleFiles = import.meta.glob("../../../content/puzzles/*.json", { import: "default", eager: true }) as Record<string, PuzzleDef[]>;
const terminalFiles = import.meta.glob("../../../content/terminals/*.json", { import: "default", eager: true }) as Record<string, TerminalDef[]>;
const augmentFiles = import.meta.glob("../../../content/augments/*.json", { import: "default", eager: true }) as Record<string, AugmentDef[]>;
const itemFiles = import.meta.glob("../../../content/items/*.json", { import: "default", eager: true }) as Record<string, ItemDef[]>;
const serviceFiles = import.meta.glob("../../../content/services/*.json", { import: "default", eager: true }) as Record<string, ServiceDef[]>;
const reactionFiles = import.meta.glob("../../../content/reactions/*.json", { import: "default", eager: true }) as Record<string, ReactionDef[]>;
const questFiles = import.meta.glob("../../../content/quests/*.json", { import: "default", eager: true }) as Record<string, QuestDef[]>;
const growthFiles = import.meta.glob("../../../content/growth/*.json", { import: "default", eager: true }) as Record<string, GrowthDef[]>;

export function loadContent(): Content {
  const clues: Record<string, ClueDef> = {};
  for (const list of Object.values(clueFiles)) for (const c of list) clues[c.id] = c;
  const dialogues: Content["dialogues"] = {};
  const sources: Record<string, string> = {};
  for (const [path, text] of Object.entries(qdl)) sources[path.replace(/^.*\//, "").replace(/\.qdl$/, "")] = text;
  const arc = Object.values(mentorArc)[0];
  const composed = arc ? composeMentors(sources, arc, Object.values(mentorFiles)) : sources;
  for (const [id, text] of Object.entries(composed)) {
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
  const reactions: Content["reactions"] = {};
  for (const list of Object.values(reactionFiles)) for (const r of list) reactions[r.id] = r;
  const quests: Content["quests"] = {};
  for (const list of Object.values(questFiles)) for (const q of list) quests[q.id] = q;
  const growth: Content["growth"] = {};
  for (const list of Object.values(growthFiles)) for (const g of list) growth[g.id] = g;
  return { dialogues, clues, puzzles, terminals, augments, items, services, reactions, quests, growth };
}
