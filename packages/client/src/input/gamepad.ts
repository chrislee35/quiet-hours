import { ACTIONS, type Action, type PadBindings } from "./actions.ts";

/** The parts of a browser Gamepad we use, so mapping is testable without a browser. */
export interface PadSnapshot {
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

/** Stick must travel this far (0-1) before it counts as a direction; filters drift on worn sticks. */
export const STICK_THRESHOLD = 0.45;

export type ActionState = Record<Action, boolean>;

export const noActions = (): ActionState => Object.fromEntries(ACTIONS.map((a) => [a, false])) as ActionState;

/** Which actions the pad is holding right now: mapped buttons, plus the left stick as the four directions. */
export function padActions(pad: PadSnapshot | null, map: PadBindings): ActionState {
  const out = noActions();
  if (!pad) return out;
  for (const action of ACTIONS) {
    out[action] = map[action].some((i) => pad.buttons[i]?.pressed === true);
  }
  const x = pad.axes[0] ?? 0;
  const y = pad.axes[1] ?? 0;
  // Use the dominant-axis rule only when the stick is clearly diagonal-free; allow diagonals past the threshold.
  if (x <= -STICK_THRESHOLD) out.left = true;
  if (x >= STICK_THRESHOLD) out.right = true;
  if (y <= -STICK_THRESHOLD) out.up = true;
  if (y >= STICK_THRESHOLD) out.down = true;
  return out;
}

/** Actions that became held since `prev`: the "just pressed" edges. */
export function newPresses(prev: ActionState, next: ActionState): Action[] {
  return ACTIONS.filter((a) => next[a] && !prev[a]);
}
