import { deepClone } from "./clone.ts";
import { alertSystem } from "./alert.ts";
import { gameTimeAt } from "./clock.ts";
import type { Ctx, System } from "./ctx.ts";
import { robotBehavior, robotPerception } from "./robots.ts";
import type { Config } from "./config.ts";
import { EventBus, type GameEvent } from "./events.ts";
import { stateHash } from "./hash.ts";
import { moveWithCollision, overlapsTile } from "./movement.ts";
import { createInitialState, type SimState } from "./state.ts";
import { OPEN_WORLD, isSolid, zoneAt, type World } from "./world.ts";
import type { MoveMode } from "./events.ts";

// ---- Commands: the only way the outside world changes the simulation ----------------------

export type Command =
  /** Standing movement intent; (0,0) stops. Direction is normalized by the sim. */
  | { type: "SetMove"; dx: number; dy: number; mode: MoveMode }
  /** Debug/scenario helper: place the player. Not available to the real client input layer. */
  | { type: "Teleport"; x: number; y: number }
  /** Use the nearest interactable within reach (currently: doors) (CORE-5). */
  | { type: "Interact" };

export interface StepResult {
  state: SimState;
  events: GameEvent[];
}


// ---- Systems, in the documented update order (DESIGN §3.1) --------------------------------

/** Nearest door within `reach` of the player, by distance to the door tile's centre. */
function nearestDoor(state: SimState, world: World, reach: number) {
  let best: { id: string; x: number; y: number; d: number } | undefined;
  for (const door of world.doors) {
    const d = Math.hypot(door.x + 0.5 - state.player.x, door.y + 0.5 - state.player.y);
    if (d <= reach && (best === undefined || d < best.d)) best = { id: door.id, x: door.x, y: door.y, d };
  }
  return best;
}

function interact({ state, config, world, events }: Ctx): void {
  const target = nearestDoor(state, world, config.player.interactRadius);
  const door = target && state.doors[target.id];
  if (!target || !door) return;
  if (door.open) {
    if (overlapsTile(state.player, config.player.radius, target.x, target.y)) {
      events.push({ type: "DoorBlocked", tick: state.tick, doorId: target.id });
      return;
    }
    door.open = false;
    events.push({ type: "DoorClosed", tick: state.tick, doorId: target.id });
  } else if (door.locked) {
    events.push({ type: "DoorLocked", tick: state.tick, doorId: target.id });
  } else {
    door.open = true;
    events.push({ type: "DoorOpened", tick: state.tick, doorId: target.id });
  }
}

function applyCommands(ctx: Ctx): void {
  const { state, commands } = ctx;
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
      case "Interact":
        interact(ctx);
        break;
    }
  }
}

function movePlayer({ state, config, world, events }: Ctx): void {
  const { intent } = state.player;
  if (intent.dx === 0 && intent.dy === 0) return;
  const speeds = config.player;
  const speed =
    intent.mode === "run" ? speeds.runSpeed : intent.mode === "sneak" ? speeds.sneakSpeed : speeds.walkSpeed;
  const dt = 1 / config.sim.ticksPerSecond;
  const from = { x: state.player.x, y: state.player.y };
  const to = moveWithCollision(
    from,
    intent.dx * speed * dt,
    intent.dy * speed * dt,
    config.player.radius,
    (tx, ty) => isSolid(world, state.doors, tx, ty),
  );
  state.player.x = to.x;
  state.player.y = to.y;
  // Pushing against a wall makes no footsteps: noise only when the player actually moved.
  if (to.x === from.x && to.y === from.y) return;
  const noise = config.noise;
  const radius =
    intent.mode === "run" ? noise.runRadius : intent.mode === "sneak" ? noise.sneakRadius : noise.walkRadius;
  events.push({ type: "NoiseEmitted", tick: state.tick, x: to.x, y: to.y, radius, source: "player" });
}

function trackZone({ state, world, events }: Ctx): void {
  const now = zoneAt(world, Math.floor(state.player.x), Math.floor(state.player.y))?.id ?? null;
  const before = state.player.zone;
  if (now === before) return;
  if (before !== null) events.push({ type: "ZoneExited", tick: state.tick, zone: before });
  if (now !== null) events.push({ type: "ZoneEntered", tick: state.tick, zone: now });
  state.player.zone = now;
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
  { name: "zones", run: trackZone },
  { name: "clock", run: advanceClock },
  { name: "npcs", run: notYet },
  { name: "robot-perception", run: robotPerception },
  { name: "robot-behavior", run: robotBehavior },
  { name: "alert", run: alertSystem },
  { name: "district-reactions", run: notYet },
];

// ---- Stepping ----------------------------------------------------------------------------

/**
 * Pure fixed-step transition (ADR-2): state' = step(state, commands, config).
 * Never mutates its input. Randomness will arrive via state.rngState when systems need it.
 */
export function step(
  prev: SimState,
  commands: readonly Command[],
  config: Config,
  world: World = OPEN_WORLD,
): StepResult {
  const state = deepClone(prev);
  const events: GameEvent[] = [];
  // Advance the tick first: systems and emitted events all see the tick the new state will have,
  // so `state.tick` always matches the clock windows stored in that state.
  state.tick += 1;
  const ctx: Ctx = { state, config, world, events, commands };
  for (const system of SYSTEM_ORDER) system.run(ctx);
  return { state, events };
}

/** Convenience stateful wrapper used by the client and the harness. */
export class Sim {
  readonly bus = new EventBus();
  private current: SimState;

  readonly config: Config;
  readonly world: World;

  /** `initial` resumes from a saved state; `world` is the static level (default: unbounded open space). */
  constructor(config: Config, seed: number, options: { world?: World; initial?: SimState } = {}) {
    this.config = config;
    this.world = options.world ?? OPEN_WORLD;
    this.current = options.initial ?? createInitialState(seed, config, this.world);
  }

  get state(): Readonly<SimState> {
    return this.current;
  }

  get hash(): string {
    return stateHash(this.current);
  }

  /** Advance exactly one tick. */
  tick(commands: readonly Command[] = []): GameEvent[] {
    const { state, events } = step(this.current, commands, this.config, this.world);
    this.current = state;
    this.bus.emit(events);
    return events;
  }

  /**
   * Escape hatch for tests and the debug overlay ("scenario teleport", TESTING §12): edit state directly.
   * Gameplay code must never call this; it bypasses commands and events.
   */
  edit(fn: (state: SimState) => void): void {
    const copy = deepClone(this.current);
    fn(copy);
    this.current = copy;
  }

  /** Deep copy for rendering or saving; callers cannot mutate sim state through it. */
  snapshot(): SimState {
    return deepClone(this.current);
  }
}
