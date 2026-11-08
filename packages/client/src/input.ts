import type { MoveMode } from "@qh/core";

/** Logical actions the core understands; physical keys are mapped here and will be rebindable (ACC-1). */
export interface HeldActions {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
  sneak: boolean;
}

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

export const DEFAULT_KEYS: Record<keyof HeldActions, string[]> = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  run: ["ShiftLeft", "ShiftRight"],
  sneak: ["ControlLeft", "KeyC"],
};
