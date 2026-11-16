import type { Ctx } from "./ctx.ts";

/**
 * The Hollow's discovery risk (T4.4, WLD-7). Walking into the Hollow while the city is already on alert (a robot has
 * seen you recently) leaves a trail to its door: the flags `hollow_trail` and `hollow_risk` are set, every time that
 * happens. `hollow_risk` is also set by selling out Mrs. Adeyemi-Roth (SQ-02). T4.5 turns the risk into consequences.
 * `hollow_here` remembers that the player is inside, so a visit counts once.
 */
export function hollowSystem({ state }: Ctx): void {
  const inside = state.map === "hollow";
  const f = state.flags;
  if (inside && f.hollow_here !== true) {
    f.hollow_here = true;
    if (state.alert.level >= 1) {
      f.hollow_trail = true;
      f.hollow_risk = true;
    }
  } else if (!inside && f.hollow_here === true) f.hollow_here = false;
}
