import { gameTimeAt } from "./clock.ts";
import type { Config } from "./config.ts";
import type { MoveMode } from "./events.ts";

export const STATE_VERSION = 1;

/** Plain, JSON-serializable data only (SAV-2): no classes, functions, or Maps. */
export interface SimState {
  version: number;
  seed: number;
  tick: number;
  rngState: number;
  player: {
    x: number;
    y: number;
    /** Standing intent set by the SetMove command; applied every tick until changed. */
    intent: { dx: number; dy: number; mode: MoveMode };
  };
  /** Window flags from the previous tick, used to emit transition events. */
  windows: { curfew: boolean; quietHours: boolean; day: number };
}

export function createInitialState(seed: number, config: Config): SimState {
  const t = gameTimeAt(0, config);
  return {
    version: STATE_VERSION,
    seed: seed >>> 0,
    tick: 0,
    rngState: seed >>> 0,
    player: { x: 0, y: 0, intent: { dx: 0, dy: 0, mode: "walk" } },
    // Seeded from tick 0 so the starting window state never fires spurious transition events.
    windows: { curfew: t.isCurfew, quietHours: t.isQuietHours, day: t.day },
  };
}
