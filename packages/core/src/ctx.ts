import type { Command } from "./sim.ts";
import type { Config } from "./config.ts";
import type { GameEvent } from "./events.ts";
import type { SimState } from "./state.ts";
import type { World } from "./world.ts";

/** Everything a system needs for one tick. Systems mutate `state` (a private copy) and push `events`. */
export interface Ctx {
  state: SimState;
  config: Config;
  world: World;
  events: GameEvent[];
  commands: readonly Command[];
}

export type System = (ctx: Ctx) => void;

export const secondsToTicks = (seconds: number, config: Config): number =>
  Math.round(seconds * config.sim.ticksPerSecond);
