import { gameTimeAt } from "./clock.ts";
import type { Config } from "./config.ts";
import type { MoveMode } from "./events.ts";
import { initialDoorStates, OPEN_WORLD, spawnPoint, zoneAt, type DoorState, type World } from "./world.ts";

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
    /** Id of the zone the player's centre is in, or null. */
    zone: string | null;
  };
  /** Runtime state of every door, keyed by door id. */
  doors: Record<string, DoorState>;
  /** Window flags from the previous tick, used to emit transition events. */
  windows: { curfew: boolean; quietHours: boolean; day: number };
}

export function createInitialState(seed: number, config: Config, world: World = OPEN_WORLD): SimState {
  const t = gameTimeAt(0, config);
  const start = spawnPoint(world, "start");
  const x = start?.x ?? 0;
  const y = start?.y ?? 0;
  return {
    version: STATE_VERSION,
    seed: seed >>> 0,
    tick: 0,
    rngState: seed >>> 0,
    player: {
      x,
      y,
      intent: { dx: 0, dy: 0, mode: "walk" },
      zone: zoneAt(world, Math.floor(x), Math.floor(y))?.id ?? null,
    },
    doors: initialDoorStates(world),
    // Seeded from tick 0 so the starting window state never fires spurious transition events.
    windows: { curfew: t.isCurfew, quietHours: t.isQuietHours, day: t.day },
  };
}
