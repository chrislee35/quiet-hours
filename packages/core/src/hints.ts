import type { Config } from "./config.ts";
import type { Content } from "./dialogue/types.ts";
import { evalAll, type Condition } from "./rules.ts";
import type { SimState } from "./state.ts";

/**
 * Hints (CLU-7, PUZ-3). Hints live in the notebook and cost nothing: no progress is ever gated by chance or by
 * pixel-hunting, and a player who is stuck can ask. An optional hint level is a player setting (never in a save):
 *  - off: nothing is shown (the default);
 *  - nudge: which way to look;
 *  - direct: what to do.
 * A hint is shown only while it is *relevant* (`when` holds, so it never hints at something the player has not yet
 * heard of) and *unfinished* (`done` does not all hold). Every critical puzzle, each Gate route and each stage of the
 * main path must have one (a validator rule), so the notebook can always say what to try next.
 */
export type HintLevel = "off" | "nudge" | "direct";
export const HINT_LEVELS: readonly HintLevel[] = ["off", "nudge", "direct"];

export interface HintDef {
  id: string;
  topic: string;
  /** What this hint is about: `terminal:<id>`, `route:<sneak|hack|break>`, `act1`, `mentor`, `companion`, `past`. */
  for: string[];
  when: Condition[];
  done: Condition[];
  nudge: string;
  direct: string;
}

export interface HintView {
  id: string;
  topic: string;
  text: string;
  level: Exclude<HintLevel, "off">;
}

/** The hints to show right now at this level, in content order (by id). */
export function activeHints(state: Readonly<SimState>, config: Config, content: Content, level: HintLevel): HintView[] {
  if (level === "off") return [];
  return Object.values(content.hints)
    .filter((h) => evalAll(h.when, state, config, content) && !(h.done.length > 0 && evalAll(h.done, state, config, content)))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((h) => ({ id: h.id, topic: h.topic, text: level === "nudge" ? h.nudge : h.direct, level }));
}
