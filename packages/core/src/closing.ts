/**
 * The closing scene and the sequel card (T3.13, END-2/3/5). One fixed scene for every ending: outside the Gate, gratitude,
 * the turn, black, the card. Only the companion's identity and voice change (and, for a mentor, a romantic or platonic
 * tone from `mentor_romance`). There is no epilogue and no choice: what became of everyone else is recorded as sequel
 * flags (companions.ts) and is deliberately not read here. MERIDIAN is never said to fall.
 */
import type { Content } from "./dialogue/types.ts";
import type { FlagValue } from "./events.ts";

export interface ClosingDef {
  id: string;
  /** Narration for the first beat, in order. */
  outside: string[];
  /** What the protagonist says when nobody came with them. */
  alone: { gratitude: string; turn: string };
  /** The sequel advertisement card. */
  card: { title: string; tagline: string; soon: string };
}

/** What a companion says at the end, in their own voice. A mentor can have a second, romantic, gratitude. */
export interface CompanionClosing {
  gratitude: string;
  gratitude_romantic?: string;
  turn: string;
}

export type ClosingBeat =
  | { kind: "outside"; text: string }
  | { kind: "gratitude"; speaker: string; text: string }
  | { kind: "turn"; speaker: string; text: string }
  | { kind: "black" }
  | { kind: "card"; title: string; tagline: string; soon: string };

export const CLOSING_KINDS = ["outside", "gratitude", "turn", "black", "card"] as const;

/** The scene for this run: always the same five kinds of beat, in the same order. */
export function closingScene(flags: Readonly<Record<string, FlagValue>>, content: Content): ClosingBeat[] {
  const def = content.closing.scene;
  if (!def) return [];
  const came = typeof flags.escapee === "string" && flags.escapee !== "none" ? content.companions[flags.escapee] : undefined;
  const romantic = came?.role === "mentor" && flags.mentor_romance === true;
  const beats: ClosingBeat[] = def.outside.map((text) => ({ kind: "outside", text }));
  if (came) {
    const c = came.closing;
    beats.push({ kind: "gratitude", speaker: came.name, text: romantic && c.gratitude_romantic ? c.gratitude_romantic : c.gratitude });
    beats.push({ kind: "turn", speaker: came.name, text: c.turn });
  } else {
    beats.push({ kind: "gratitude", speaker: "", text: def.alone.gratitude });
    beats.push({ kind: "turn", speaker: "", text: def.alone.turn });
  }
  beats.push({ kind: "black" }, { kind: "card", ...def.card });
  return beats;
}
