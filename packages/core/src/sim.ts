import { deepClone } from "./clone.ts";
import { alertSystem } from "./alert.ts";
import { chooseOption, dialogueView, endConversation, notebookEntries, presentClue, startConversation, type DialogueView, type NotebookEntryView } from "./dialogue/runtime.ts";
import { EMPTY_CONTENT, type Content } from "./dialogue/types.ts";
import { closeTerminal, openTerminal, rotateCell, terminalView, type TerminalView } from "./terminal.ts";
import { processingSystem } from "./processing.ts";
import { applyEffects, type Effect } from "./rules.ts";
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
  /** Use the nearest interactable within reach: doors and lockers (CORE-5). */
  | { type: "Interact" }
  /** Pick a visible dialogue option by its index in the current view (DLG-1). */
  | { type: "Choose"; index: number }
  /** Show the NPC a notebook clue (DLG-3). */
  | { type: "Present"; clueId: string }
  | { type: "EndConversation" }
  /** Quarter-turn a cell of the open terminal's puzzle. */
  | { type: "TerminalRotate"; index: number }
  | { type: "ExitTerminal" }
  /** Run effects as if triggered by content (dialogue, quest scripts). Also used by scenarios to set up state. */
  | { type: "ApplyEffects"; effects: Effect[] };

export interface StepResult {
  state: SimState;
  events: GameEvent[];
}


// ---- Systems, in the documented update order (DESIGN §3.1) --------------------------------

/** Nearest interactable (door, locker, or person) within `reach` of the player; earlier kinds win ties. */
function nearestInteractable(state: SimState, world: World, reach: number) {
  let best: { kind: "door" | "locker" | "npc" | "terminal"; id: string; x: number; y: number; d: number; dialogue?: string } | undefined;
  const consider = (kind: "door" | "locker" | "npc" | "terminal", id: string, x: number, y: number, dialogue?: string) => {
    const d = Math.hypot(x + 0.5 - state.player.x, y + 0.5 - state.player.y);
    if (d <= reach && (best === undefined || d < best.d)) best = { kind, id, x, y, d, ...(dialogue ? { dialogue } : {}) };
  };
  for (const door of world.doors) consider("door", door.id, door.x, door.y);
  for (const l of world.lockers) consider("locker", l.id, l.x, l.y);
  for (const n of world.npcs) consider("npc", n.id, n.x, n.y, n.dialogue);
  for (const t of world.terminals) consider("terminal", t.id, t.x, t.y);
  return best;
}

function interact(ctx: Ctx): void {
  const { state, config, world, events } = ctx;
  const target = nearestInteractable(state, world, config.player.interactRadius);
  if (!target) return;
  if (target.kind === "terminal") {
    openTerminal(ctx, target.id);
    return;
  }
  if (target.kind === "npc") {
    if (target.dialogue) startConversation(ctx, target.dialogue);
    return;
  }
  if (target.kind === "locker") {
    const { items, credits } = state.locker;
    if (credits === 0 && Object.keys(items).length === 0) return;
    for (const [id, n] of Object.entries(items)) state.inventory.items[id] = (state.inventory.items[id] ?? 0) + n;
    state.inventory.credits += credits;
    state.locker = { credits: 0, items: {} };
    events.push({ type: "LockerOpened", tick: state.tick, lockerId: target.id, items, credits });
    return;
  }
  const door = state.doors[target.id];
  if (!door) return;
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
  const { state, commands, events } = ctx;
  const held = state.tick < state.processingUntil; // being processed: the player cannot act
  for (const cmd of commands) {
    switch (cmd.type) {
      case "ApplyEffects":
        applyEffects(cmd.effects, state, events);
        break;
      case "SetMove": {
        if (held) break;
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
        if (!held) interact(ctx);
        break;
    }
  }
}

function movePlayer({ state, config, world, events }: Ctx): void {
  if (state.tick < state.processingUntil) return;
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
  { name: "processing", run: processingSystem },
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
  content: Content = EMPTY_CONTENT,
): StepResult {
  const state = deepClone(prev);
  const events: GameEvent[] = [];
  if (state.conversation || state.terminal) {
    // Dialogue and terminals freeze the world: the clock, robots and player do not advance (CORE-4).
    const ctx: Ctx = { state, config, world, content, events, commands };
    for (const cmd of commands) {
      if (cmd.type === "Choose") chooseOption(ctx, cmd.index);
      else if (cmd.type === "Present") presentClue(ctx, cmd.clueId);
      else if (cmd.type === "EndConversation") endConversation(ctx);
      else if (cmd.type === "TerminalRotate") rotateCell(ctx, cmd.index);
      else if (cmd.type === "ExitTerminal") closeTerminal(ctx);
      else if (cmd.type === "ApplyEffects") applyEffects(cmd.effects, state, events);
    }
    return { state, events };
  }
  // Advance the tick first: systems and emitted events all see the tick the new state will have,
  // so `state.tick` always matches the clock windows stored in that state.
  state.tick += 1;
  const ctx: Ctx = { state, config, world, content, events, commands };
  for (const system of SYSTEM_ORDER) system.run(ctx);
  return { state, events };
}

/** Convenience stateful wrapper used by the client and the harness. */
export class Sim {
  readonly bus = new EventBus();
  private current: SimState;

  readonly config: Config;
  readonly world: World;
  readonly content: Content;

  /**
   * `initial` resumes from a saved state; `world` is the static level (default: unbounded open space);
   * `content` holds compiled dialogues and clue definitions.
   */
  constructor(config: Config, seed: number, options: { world?: World; content?: Content; initial?: SimState } = {}) {
    this.config = config;
    this.world = options.world ?? OPEN_WORLD;
    this.content = options.content ?? EMPTY_CONTENT;
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
    const { state, events } = step(this.current, commands, this.config, this.world, this.content);
    this.current = state;
    this.bus.emit(events);
    return events;
  }

  /** The dialogue window's contents, or null when no conversation is active. */
  dialogue(): DialogueView | null {
    return dialogueView(this.current, this.content, this.config);
  }

  /** The open terminal's puzzle for the UI, or null. */
  terminal(): TerminalView | null {
    return terminalView(this.current, this.content);
  }

  /** The notebook as the UI shows it (reliability hidden). */
  notebook(): NotebookEntryView[] {
    return notebookEntries(this.current, this.content);
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
