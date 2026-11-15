/**
 * The past self (T3.9, PST-2/3). Three explicit moments each set a flag to "embrace" or "reject":
 * past_m1 (the Checkpoint, Civic Core), past_m2 (the Recognition, Pell), past_m3 (the Prompt, the Gate).
 * The stance is derived from them: the majority wins; with one of each, the latest choice wins; with none,
 * the past is undiscovered. Embracing anywhere makes the player visible to MERIDIAN (`meridian_sees`).
 */
import type { FlagValue } from "./events.ts";

export type PastStance = "embraced" | "rejected" | "undiscovered";
export const PAST_MOMENTS = ["past_m1", "past_m2", "past_m3"] as const;

export function pastStance(flags: Readonly<Record<string, FlagValue>>): PastStance {
  let score = 0;
  let any = false;
  for (const m of PAST_MOMENTS) {
    if (flags[m] === "embrace") { score++; any = true; }
    else if (flags[m] === "reject") { score--; any = true; }
  }
  if (!any) return "undiscovered";
  if (score !== 0) return score > 0 ? "embraced" : "rejected";
  return flags.past_last === "embrace" ? "embraced" : "rejected";
}

/** After a past moment is set: remember which way it went last and refresh the derived flags. */
export function refreshPast(flags: Record<string, FlagValue>, moment: string, value: FlagValue): void {
  if ((PAST_MOMENTS as readonly string[]).includes(moment) && (value === "embrace" || value === "reject")) flags.past_last = value;
  flags.past_stance = pastStance(flags);
  flags.meridian_sees = PAST_MOMENTS.some((m) => flags[m] === "embrace");
}
