import { deepClone } from "./clone.ts";
import { alertSystem } from "./alert.ts";
import { chooseOption, dialogueView, endConversation, notebookEntries, presentClue, startConversation, type DialogueView, type NotebookEntryView } from "./dialogue/runtime.ts";
import { EMPTY_CONTENT, type Content } from "./dialogue/types.ts";
import { closeTerminal, openTerminal, skipPuzzle, tapCell, terminalView, type TerminalView } from "./terminal.ts";
import { equipAugment, modifier, unequipAugment, useAugment } from "./augments.ts";
import { useItem } from "./combat.ts";
import { npcSystem } from "./npcs.ts";
import { reactionSystem } from "./districts.ts";
import { annotatedMap, conflicts, linkClues, notebookItems, questLog, unlinkClues, type AnnotatedMap, type Conflict, type NotebookItem, type QuestView } from "./notebook.ts";
import { economySystem } from "./economy.ts";
import { cameraSystem } from "./cameras.ts";
import { commsSystem } from "./comms.ts";
import { repairSystem } from "./repairs.ts";
import { demeritSystem } from "./demerits.ts";
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
import { HALF_TILE, OPEN_WORLD, isSolid, pickupEffect, zoneAt, type World } from "./world.ts";
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
  /** Tap a cell, switch or track of the open terminal's puzzle (what that does depends on the puzzle type). */
  | { type: "TerminalTap"; index: number }
  | { type: "ExitTerminal" }
  /** Skip the open puzzle (only when the assist is on and enough attempts were made). */
  | { type: "TerminalSkip" }
  /** Turn the puzzle-skip assist on or off; recorded in the save. */
  | { type: "SetAssist"; puzzleSkip: boolean }
  /** The player links or unlinks two clues they know (the notebook; takes no game time). */
  | { type: "LinkClues"; a: string; b: string }
  | { type: "UnlinkClues"; a: string; b: string }
  /** Wear an owned augment if the band has the slots and power (AUG-2). */
  | { type: "EquipAugment"; id: string }
  | { type: "UnequipAugment"; id: string }
  /** Fire a worn augment's active ability (Burst Jammer). */
  | { type: "UseAugment"; id: string }
  /** Use a tool item: stun or lethal on the nearest robot in reach, throw a decoy along (dx, dy), cut a camera. */
  | { type: "UseItem"; id: string; dx?: number; dy?: number }
  /** Run effects as if triggered by content (dialogue, quest scripts). Also used by scenarios to set up state. */
  | { type: "ApplyEffects"; effects: Effect[] };

export interface StepResult {
  state: SimState;
  events: GameEvent[];
}


// ---- Systems, in the documented update order (DESIGN §3.1) --------------------------------

/** Nearest interactable (door, locker, or person) within `reach` of the player; earlier kinds win ties. */
function nearestInteractable(state: SimState, world: World, reach: number) {
  let best: { kind: "door" | "locker" | "npc" | "terminal" | "pickup"; id: string; x: number; y: number; d: number; dialogue?: string } | undefined;
  const consider = (kind: "door" | "locker" | "npc" | "terminal" | "pickup", id: string, x: number, y: number, dialogue?: string) => {
    const d = Math.hypot(x + HALF_TILE - state.player.x, y + HALF_TILE - state.player.y);
    if (d <= reach && (best === undefined || d < best.d)) best = { kind, id, x, y, d, ...(dialogue ? { dialogue } : {}) };
  };
  for (const door of world.doors) consider("door", door.id, door.x, door.y);
  for (const l of world.lockers) consider("locker", l.id, l.x, l.y);
  for (const n of world.npcs) {
    const at = state.npcs[n.id];
    if (at?.away) continue;
    // People move (npcs.ts): reach is measured from where they stand now, as a tile-centre offset like the rest.
    consider("npc", n.id, (at?.x ?? n.x + HALF_TILE) - HALF_TILE, (at?.y ?? n.y + HALF_TILE) - HALF_TILE, n.dialogue);
  }
  for (const t of world.terminals) consider("terminal", t.id, t.x, t.y);
  for (const p of world.pickups) if (!state.flags[`picked_${p.id}`]) consider("pickup", p.id, p.x, p.y);
  return best;
}

export interface InteractionPrompt {
  kind: "door" | "locker" | "npc" | "terminal" | "pickup";
  id: string;
  /** Tile position of the thing, for placing the prompt in the world. */
  x: number;
  y: number;
  /** What pressing Interact will do, as a short verb phrase for the prompt ("Open door", "Talk to odd sam"). */
  label: string;
}

/**
 * What Interact would do right now, or null (CORE-5). The UI shows this near the object so the player always
 * knows when and why a press will do something. Returns null while the world is frozen or the player is held.
 */
export function interactionPrompt(state: Readonly<SimState>, world: World, config: Config): InteractionPrompt | null {
  if (state.conversation || state.terminal || state.tick < state.processingUntil) return null;
  const t = nearestInteractable(state, world, config.player.interactRadius);
  if (!t) return null;
  const base = { kind: t.kind, id: t.id, x: t.x, y: t.y };
  if (t.kind === "npc") return { ...base, label: `Talk to ${t.id.replace(/_/g, " ")}` };
  if (t.kind === "terminal") return { ...base, label: "Use terminal" };
  if (t.kind === "pickup") {
    const grant = world.pickups.find((x) => x.id === t.id)?.grant ?? "";
    const what = grant.split(":")[1] ?? "it";
    return { ...base, label: `Take ${(grant.startsWith("credits") ? "credits" : what).replace(/_/g, " ")}` };
  }
  if (t.kind === "locker") {
    const l = state.locker;
    return Object.keys(l.items).length > 0 || l.credits > 0 || l.passes.length > 0 ? { ...base, label: "Recover belongings" } : null;
  }
  const door = state.doors[t.id];
  if (!door) return null;
  return { ...base, label: door.open ? "Close door" : door.locked ? "Door (locked)" : "Open door" };
}

function interact(ctx: Ctx): void {
  const { state, config, world, events } = ctx;
  const target = nearestInteractable(state, world, config.player.interactRadius);
  if (!target) return;
  if (target.kind === "terminal") {
    openTerminal(ctx, target.id);
    return;
  }
  if (target.kind === "pickup") {
    const pickup = world.pickups.find((x) => x.id === target.id);
    const effect = pickup ? pickupEffect(pickup.grant) : null;
    if (!pickup || !effect) return;
    state.flags[`picked_${pickup.id}`] = true;
    applyEffects([effect], state, events, config, ctx.content);
    events.push({ type: "PickedUp", tick: state.tick, pickupId: pickup.id });
    return;
  }
  if (target.kind === "npc") {
    if (target.dialogue) startConversation(ctx, target.dialogue);
    return;
  }
  if (target.kind === "locker") {
    const { items, credits, passes } = state.locker;
    if (credits === 0 && Object.keys(items).length === 0 && passes.length === 0) return;
    for (const p of passes) {
      state.passes = state.passes.filter((x) => x.id !== p.id);
      state.passes.push(p);
      events.push({ type: "PassGained", tick: state.tick, passId: p.id });
    }
    for (const [id, n] of Object.entries(items)) state.inventory.items[id] = (state.inventory.items[id] ?? 0) + n;
    state.inventory.credits += credits;
    state.locker = { credits: 0, items: {}, passes: [] };
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
  const { state, config, commands, events } = ctx;
  const held = state.tick < state.processingUntil; // being processed: the player cannot act
  for (const cmd of commands) {
    switch (cmd.type) {
      case "ApplyEffects":
        applyEffects(cmd.effects, state, events, config, ctx.content);
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
      case "SetAssist":
        setAssist(ctx, cmd.puzzleSkip);
        break;
      case "LinkClues":
        linkClues(state, cmd.a, cmd.b);
        break;
      case "UnlinkClues":
        unlinkClues(state, cmd.a, cmd.b);
        break;
      case "EquipAugment":
        equipAugment(ctx, cmd.id);
        break;
      case "UnequipAugment":
        unequipAugment(ctx, cmd.id);
        break;
      case "UseItem":
        if (!held) useItem(ctx, cmd.id, cmd.dx ?? 1, cmd.dy ?? 0);
        break;
      case "UseAugment":
        if (!held) useAugment(ctx, cmd.id);
        break;
    }
  }
}

function movePlayer({ state, config, world, content, events }: Ctx): void {
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
    (intent.mode === "run" ? noise.runRadius : intent.mode === "sneak" ? noise.sneakRadius : noise.walkRadius) *
    modifier(state, content, "noise.mult");
  events.push({ type: "NoiseEmitted", tick: state.tick, x: to.x, y: to.y, radius, source: "player" });
}

function trackZone({ state, world, events }: Ctx): void {
  const now = zoneAt(world, Math.floor(state.player.x), Math.floor(state.player.y))?.id ?? null;
  const before = state.player.zone;
  if (now === before) return;
  if (before !== null) events.push({ type: "ZoneExited", tick: state.tick, zone: before });
  if (now !== null) {
    events.push({ type: "ZoneEntered", tick: state.tick, zone: now });
    if (!state.visited.includes(now)) state.visited.push(now);
  }
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

function setAssist({ state, events }: Ctx, puzzleSkip: boolean): void {
  if (state.assist.puzzleSkip === puzzleSkip) return;
  state.assist.puzzleSkip = puzzleSkip;
  events.push({ type: "AssistChanged", tick: state.tick, puzzleSkip });
}

/** Placeholder slots keep the documented order visible; later milestones fill them in. */
const notYet: System = () => {};

export const SYSTEM_ORDER: readonly { name: string; run: System }[] = [
  { name: "commands", run: applyCommands },
  { name: "player", run: movePlayer },
  { name: "zones", run: trackZone },
  { name: "clock", run: advanceClock },
  { name: "economy", run: economySystem },
  { name: "npcs", run: npcSystem },
  { name: "robot-perception", run: robotPerception },
  { name: "robot-behavior", run: robotBehavior },
  { name: "cameras", run: cameraSystem },
  { name: "comms", run: commsSystem },
  { name: "repairs", run: repairSystem },
  { name: "alert", run: alertSystem },
  { name: "demerits", run: demeritSystem },
  { name: "processing", run: processingSystem },
  { name: "district-reactions", run: reactionSystem },
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
  // Settings changes take no game time either.
  if (commands.length > 0 && commands.every((c) => c.type === "SetAssist")) {
    const ctx: Ctx = { state, config, world, content, events, commands };
    for (const cmd of commands) if (cmd.type === "SetAssist") setAssist(ctx, cmd.puzzleSkip);
    return { state, events };
  }
  // Notebook edits take no game time: a step made only of them leaves the clock, robots and player alone.
  if (commands.length > 0 && commands.every((c) => c.type === "LinkClues" || c.type === "UnlinkClues")) {
    for (const cmd of commands) {
      if (cmd.type === "LinkClues" && linkClues(state, cmd.a, cmd.b)) events.push({ type: "CluesLinked", tick: state.tick, a: cmd.a, b: cmd.b });
      else if (cmd.type === "UnlinkClues" && unlinkClues(state, cmd.a, cmd.b)) events.push({ type: "CluesUnlinked", tick: state.tick, a: cmd.a, b: cmd.b });
    }
    return { state, events };
  }
  if (state.conversation || state.terminal) {
    // Dialogue and terminals freeze the world: the clock, robots and player do not advance (CORE-4).
    const ctx: Ctx = { state, config, world, content, events, commands };
    for (const cmd of commands) {
      if (cmd.type === "Choose") chooseOption(ctx, cmd.index);
      else if (cmd.type === "Present") presentClue(ctx, cmd.clueId);
      else if (cmd.type === "EndConversation") endConversation(ctx);
      else if (cmd.type === "TerminalTap") tapCell(ctx, cmd.index);
      else if (cmd.type === "ExitTerminal") closeTerminal(ctx);
      else if (cmd.type === "TerminalSkip") skipPuzzle(ctx);
      else if (cmd.type === "SetAssist") setAssist(ctx, cmd.puzzleSkip);
      else if (cmd.type === "LinkClues") linkClues(state, cmd.a, cmd.b);
      else if (cmd.type === "UnlinkClues") unlinkClues(state, cmd.a, cmd.b);
      else if (cmd.type === "ApplyEffects") applyEffects(cmd.effects, state, events, config, content);
    }
    // Effects run from a conversation or terminal can trigger reactions too, even though the world is frozen.
    reactionSystem(ctx);
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
    return terminalView(this.current, this.content, this.config);
  }

  /** What pressing Interact would do right now, for the in-world prompt. */
  prompt(): InteractionPrompt | null {
    return interactionPrompt(this.current, this.world, this.config);
  }

  /** The notebook as the UI shows it (reliability hidden). */
  /** Everything the notebook screen shows, derived from state and content. */
  notebookItems(): NotebookItem[] {
    return notebookItems(this.current, this.content);
  }

  conflicts(): Conflict[] {
    return conflicts(this.current, this.content);
  }

  questLog(): QuestView[] {
    return questLog(this.current, this.content, this.config);
  }

  annotatedMap(): AnnotatedMap {
    return annotatedMap(this.current, this.world, this.content);
  }

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

  /** Replaces the whole state with a loaded one (already validated by `loadSave`) and tells listeners. */
  load(state: SimState): void {
    this.current = deepClone(state);
    this.bus.emit([{ type: "GameLoaded", tick: state.tick }]);
  }

  /** Deep copy for rendering or saving; callers cannot mutate sim state through it. */
  snapshot(): SimState {
    return deepClone(this.current);
  }
}
