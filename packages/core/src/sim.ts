import { deepClone } from "./clone.ts";
import { gameTimeAt } from "./clock.ts";
import type { Config } from "./config.ts";
import { EventBus, type GameEvent } from "./events.ts";
import { stateHash } from "./hash.ts";
import { createInitialState, type SimState } from "./state.ts";
import type { MoveMode } from "./events.ts";

// ---- Commands: the only way the outside world changes the simulation ----------------------

export type Command =
  /** Standing movement intent; (0,0) stops. Direction is normalized by the sim. */
  | { type: "SetMove"; dx: number; dy: number; mode: MoveMode }
  /** Debug/scenario helper: place the player. Not available to the real client input layer. */
  | { type: "Teleport"; x: number; y: number };

export interface StepResult {
  state: SimState;
  events: GameEvent[];
}

interface Ctx {
  state: SimState;
  config: Config;
  events: GameEvent[];
  commands: readonly Command[];
}

type System = (ctx: Ctx) => void;

// ---- Systems, in the documented update order (DESIGN §3.1) --------------------------------

function applyCommands({ state, commands }: Ctx): void {
  for (const cmd of commands) {
    switch (cmd.type) {
      case "SetMove": {
        const len = Math.hypot(cmd.dx, cmd.dy);
        state.player.intent =
          len === 0
            ? { dx: 0, dy: 0, mode: cmd.mode }
            : { dx: cmd.dx / len, dy: cmd.dy / len, mode: cmd.mode };
        break;
      }
      case "Teleport":
        state.player.x = cmd.x;
        state.player.y = cmd.y;
        break;
    }
  }
}

function movePlayer({ state, config, events }: Ctx): void {
  const { intent } = state.player;
  if (intent.dx === 0 && intent.dy === 0) return;
  const speeds = config.player;
  const speed =
    intent.mode === "run" ? speeds.runSpeed : intent.mode === "sneak" ? speeds.sneakSpeed : speeds.walkSpeed;
  const dt = 1 / config.sim.ticksPerSecond;
  state.player.x += intent.dx * speed * dt;
  state.player.y += intent.dy * speed * dt;
  const noise = config.noise;
  const radius =
    intent.mode === "run" ? noise.runRadius : intent.mode === "sneak" ? noise.sneakRadius : noise.walkRadius;
  events.push({
    type: "NoiseEmitted",
    tick: state.tick,
    x: state.player.x,
    y: state.player.y,
    radius,
    source: "player",
  });
}

function advanceClock({ state, config, events }: Ctx): void {
  const t = gameTimeAt(state.tick, config);
  const w = state.windows;
  if (t.day !== w.day) events.push({ type: "DayChanged", tick: state.tick, day: t.day });
  if (t.isCurfew !== w.curfew) {
    events.push({ type: t.isCurfew ? "CurfewStarted" : "CurfewEnded", tick: state.tick });
  }
  if (t.isQuietHours !== w.quietHours) {
    events.push({ type: t.isQuietHours ? "QuietHoursStarted" : "QuietHoursEnded", tick: state.tick });
  }
  state.windows = { curfew: t.isCurfew, quietHours: t.isQuietHours, day: t.day };
}

/** Placeholder slots keep the documented order visible; later milestones fill them in. */
const notYet: System = () => {};

export const SYSTEM_ORDER: readonly { name: string; run: System }[] = [
  { name: "commands", run: applyCommands },
  { name: "player", run: movePlayer },
  { name: "clock", run: advanceClock },
  { name: "npcs", run: notYet },
  { name: "robot-perception", run: notYet },
  { name: "alert", run: notYet },
  { name: "district-reactions", run: notYet },
];

// ---- Stepping ----------------------------------------------------------------------------

/**
 * Pure fixed-step transition (ADR-2): state' = step(state, commands, config).
 * Never mutates its input. Randomness will arrive via state.rngState when systems need it.
 */
export function step(prev: SimState, commands: readonly Command[], config: Config): StepResult {
  const state = deepClone(prev);
  const events: GameEvent[] = [];
  // Advance the tick first: systems and emitted events all see the tick the new state will have,
  // so `state.tick` always matches the clock windows stored in that state.
  state.tick += 1;
  const ctx: Ctx = { state, config, events, commands };
  for (const system of SYSTEM_ORDER) system.run(ctx);
  return { state, events };
}

/** Convenience stateful wrapper used by the client and the harness. */
export class Sim {
  readonly bus = new EventBus();
  private current: SimState;

  readonly config: Config;

  constructor(config: Config, seed: number, initial?: SimState) {
    this.config = config;
    this.current = initial ?? createInitialState(seed, config);
  }

  get state(): Readonly<SimState> {
    return this.current;
  }

  get hash(): string {
    return stateHash(this.current);
  }

  /** Advance exactly one tick. */
  tick(commands: readonly Command[] = []): GameEvent[] {
    const { state, events } = step(this.current, commands, this.config);
    this.current = state;
    this.bus.emit(events);
    return events;
  }

  /** Deep copy for rendering or saving; callers cannot mutate sim state through it. */
  snapshot(): SimState {
    return deepClone(this.current);
  }
}
