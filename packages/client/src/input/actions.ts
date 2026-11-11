import type { MoveMode } from "@qh/core";
import { safeStorage } from "../storage.ts";

/** Logical actions (ACC-1). The game logic only ever sees these; physical keys and buttons map onto them. */
export type HeldAction = "up" | "down" | "left" | "right" | "run" | "sneak";
export type PressAction = "interact" | "notebook" | "gear" | "pulse" | "tool" | "zones" | "cancel";
export type Action = HeldAction | PressAction;

export const HELD_ACTIONS: readonly HeldAction[] = ["up", "down", "left", "right", "run", "sneak"];
export const PRESS_ACTIONS: readonly PressAction[] = ["interact", "notebook", "gear", "pulse", "tool", "zones", "cancel"];
export const ACTIONS: readonly Action[] = [...HELD_ACTIONS, ...PRESS_ACTIONS];

export type HeldActions = Record<HeldAction, boolean>;
export type KeyBindings = Record<Action, string[]>;
/** Standard-mapping gamepad button indexes. */
export type PadBindings = Record<Action, number[]>;

export const DEFAULT_KEYS: KeyBindings = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  run: ["ShiftLeft", "ShiftRight"],
  sneak: ["ControlLeft", "KeyC"],
  interact: ["KeyE"],
  notebook: ["KeyN"],
  gear: ["KeyG"],
  pulse: ["KeyF"],
  tool: ["KeyQ"],
  zones: ["KeyZ"],
  cancel: ["Escape"],
};

/** D-pad moves; right bumper/trigger runs; left bumper/trigger sneaks; A uses; B cancels; Y notebook; X pulse; Start gear; Back zones. */
export const DEFAULT_PAD: PadBindings = {
  up: [12],
  down: [13],
  left: [14],
  right: [15],
  run: [5, 7],
  sneak: [4, 6],
  interact: [0],
  notebook: [3],
  gear: [9],
  pulse: [2],
  tool: [10],
  zones: [8],
  cancel: [1],
};

export interface MoveIntent {
  dx: number;
  dy: number;
  mode: MoveMode;
}

export function intentFromActions(a: HeldActions): MoveIntent {
  const dx = (a.right ? 1 : 0) - (a.left ? 1 : 0);
  const dy = (a.down ? 1 : 0) - (a.up ? 1 : 0);
  // Sneak wins over run if both are held: quiet is the safer reading of mixed input.
  const mode: MoveMode = a.sneak ? "sneak" : a.run ? "run" : "walk";
  return { dx, dy, mode };
}

export function sameIntent(a: MoveIntent, b: MoveIntent): boolean {
  return a.dx === b.dx && a.dy === b.dy && a.mode === b.mode;
}

// ---- Rebinding (the settings screen arrives with T2.13; the logic and persistence live here) ----

/**
 * Binds `code` to `action`, replacing that action's keys. A key can only do one thing, so it is taken
 * from any other action; those are reported so the UI can tell the player what was unbound.
 */
export function rebindKey(map: KeyBindings, action: Action, code: string): { map: KeyBindings; displaced: Action[] } {
  const next = Object.fromEntries(ACTIONS.map((a) => [a, [...map[a]]])) as KeyBindings;
  const displaced: Action[] = [];
  for (const other of ACTIONS) {
    if (other !== action && next[other].includes(code)) {
      next[other] = next[other].filter((c) => c !== code);
      displaced.push(other);
    }
  }
  next[action] = [code];
  return { map: next, displaced };
}

/** The first action that has no key at all, if any (a rebind that left something unusable). */
export function unboundActions(map: KeyBindings): Action[] {
  return ACTIONS.filter((a) => map[a].length === 0);
}

const BINDINGS_KEY = "bindings";

function isKeyBindings(v: unknown): v is KeyBindings {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return ACTIONS.every((a) => Array.isArray(r[a]) && (r[a] as unknown[]).every((c) => typeof c === "string"));
}

export function loadBindings(storage: ReturnType<typeof safeStorage>): KeyBindings {
  const raw = storage.get(BINDINGS_KEY);
  if (raw === null) return DEFAULT_KEYS;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isKeyBindings(parsed) ? parsed : DEFAULT_KEYS;
  } catch {
    return DEFAULT_KEYS;
  }
}

export function saveBindings(storage: ReturnType<typeof safeStorage>, map: KeyBindings): boolean {
  return storage.set(BINDINGS_KEY, JSON.stringify(map));
}

/** Binds a gamepad button to an action, taking it from any other action (a button can only do one thing). */
export function rebindPad(map: PadBindings, action: Action, button: number): { map: PadBindings; displaced: Action[] } {
  const next = Object.fromEntries(ACTIONS.map((a) => [a, [...map[a]]])) as PadBindings;
  const displaced: Action[] = [];
  for (const other of ACTIONS) {
    if (other !== action && next[other].includes(button)) {
      next[other] = next[other].filter((b) => b !== button);
      displaced.push(other);
    }
  }
  next[action] = [button];
  return { map: next, displaced };
}

const PAD_KEY = "padbindings";

function isPadBindings(v: unknown): v is PadBindings {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return ACTIONS.every((a) => Array.isArray(r[a]) && (r[a] as unknown[]).every((n) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < 32));
}

export function loadPadBindings(storage: ReturnType<typeof safeStorage>): PadBindings {
  const raw = storage.get(PAD_KEY);
  if (raw === null) return DEFAULT_PAD;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPadBindings(parsed) ? parsed : DEFAULT_PAD;
  } catch {
    return DEFAULT_PAD;
  }
}

export function savePadBindings(storage: ReturnType<typeof safeStorage>, map: PadBindings): boolean {
  return storage.set(PAD_KEY, JSON.stringify(map));
}

export function resetBindings(storage: ReturnType<typeof safeStorage>): void {
  storage.remove(BINDINGS_KEY);
  storage.remove(PAD_KEY);
}

/** Human names for logical actions, for the controls screen. */
export const ACTION_NAMES: Record<Action, string> = {
  up: "Move up", down: "Move down", left: "Move left", right: "Move right", run: "Run", sneak: "Sneak",
  interact: "Use / talk / hack", notebook: "Notebook", gear: "Wrist band", pulse: "Burst Jammer", tool: "Use ready tool", zones: "Zone overlay", cancel: "Back / menu",
};

/** A readable name for a key code: "KeyE" -> "E", "ArrowUp" -> "Up", "ShiftLeft" -> "Left Shift". */
export function keyName(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (code.startsWith("Arrow")) return code.slice(5);
  return code.replace(/(Left|Right)$/, " $1").replace(/^(Shift|Control|Alt|Meta)/, "$1").replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** Standard-mapping gamepad button names. */
const PAD_NAMES = ["A", "B", "X", "Y", "Left bumper", "Right bumper", "Left trigger", "Right trigger", "Back", "Start", "Left stick click", "Right stick click", "D-pad up", "D-pad down", "D-pad left", "D-pad right"];
export const padButtonName = (i: number): string => PAD_NAMES[i] ?? `Button ${i}`;
