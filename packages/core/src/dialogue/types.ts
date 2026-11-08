import type { Condition, Effect } from "../rules.ts";

export type Reliability = "true" | "false" | "outdated" | "planted";

/** A clue as defined in content/clues. The player's notebook only stores ids and status. */
export interface ClueDef {
  id: string;
  text: string;
  source: string;
  reliability: Reliability;
  tags: string[];
  links: { to: string; kind: "supports" | "contradicts" | "updates" }[];
}

export interface DialogueLine {
  speaker: string;
  mood: string | null;
  text: string;
}

export interface Choice {
  text: string;
  /** All must hold for the option to be shown (DLG-3). */
  if: Condition[];
  effects: Effect[];
  /** Node id, or "end" to finish the conversation. */
  goto: string;
}

/** What an NPC says when shown a clue (DLG-3); first matching entry wins. */
export interface Reaction {
  /** A clue id, or "*" for anything. */
  clue: string;
  if: Condition[];
  /** Match on the presented clue's true reliability (hidden from the player). */
  reliability?: Reliability;
  effects: Effect[];
  goto: string;
}

export interface DialogueNode {
  id: string;
  onEnter: Effect[];
  lines: DialogueLine[];
  choices: Choice[];
  /** Non-null means the player may present a clue here. */
  present: Reaction[] | null;
  /** The node offers a plain "leave" action. */
  end: boolean;
}

export interface Dialogue {
  id: string;
  npc: string;
  name: string;
  /** Show the one-line trust status in this NPC's window (CMP-3). Only candidates do. */
  trackTrust: boolean;
  /** First entry whose conditions hold is the starting node. */
  start: { if: Condition[]; goto: string }[];
  nodes: Record<string, DialogueNode>;
}

/** Everything the runtime needs besides game state. Injected like Config and World. */
export interface Content {
  dialogues: Record<string, Dialogue>;
  clues: Record<string, ClueDef>;
}

export const EMPTY_CONTENT: Content = { dialogues: {}, clues: {} };
