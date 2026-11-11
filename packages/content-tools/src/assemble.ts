import {
  EMPTY_CONTENT, buildWorld, compileDialogue, importTiled, validateConfig,
  type Condition, type Config, type Content, type World,
} from "@qh/core";
import type { ContentBundle } from "./validate.ts";

/** A goal the checker must be able to reach from a fresh start: a thing the game needs to be winnable (an ending, a gate). */
export interface GoalDef {
  id: string;
  name: string;
  /** The map it is about. */
  map: string;
  /** All must hold in some reachable state. */
  require: Condition[];
}

export interface StartState {
  credits: number;
  items: Record<string, number>;
}

export interface Assembled {
  content: Content;
  config: Config;
  worlds: Record<string, World>;
  goals: GoalDef[];
  start: StartState;
}

/** Builds what the game builds at startup from a validated bundle: compiled dialogue, entities by id, worlds. */
export function assemble(bundle: ContentBundle): Assembled {
  if (!bundle.config) throw new Error("no config/tuning.json");
  const config = validateConfig(bundle.config.data);
  const all = <T extends { id: string }>(kind: keyof ContentBundle["files"]): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const f of bundle.files[kind]) if (Array.isArray(f.data)) for (const e of f.data as T[]) out[e.id] = e;
    return out;
  };
  const clues = all<Content["clues"][string]>("clues");
  const dialogues: Content["dialogues"] = {};
  for (const { file, text } of bundle.dialogues) {
    const id = file.replace(/^dialogue\//, "").replace(/\.qdl$/, "");
    const { dialogue } = compileDialogue(text, { id, knownClues: new Set(Object.keys(clues)) });
    if (dialogue) dialogues[id] = dialogue;
  }
  const content: Content = {
    ...EMPTY_CONTENT, dialogues, clues,
    puzzles: all("puzzles"), terminals: all("terminals"), augments: all("augments"), items: all("items"),
    services: all("services"), reactions: all("reactions"), quests: all("quests"),
  };
  const worlds: Record<string, World> = {};
  for (const { file, data } of bundle.maps) {
    const id = file.replace(/^maps\//, "").replace(/\.json$/, "");
    worlds[id] = buildWorld(importTiled(data, id));
  }
  const start = bundle.start ? (bundle.start.data as StartState) : { credits: 0, items: {} };
  return { content, config, worlds, goals: Object.values(all<GoalDef>("goals")), start };
}
