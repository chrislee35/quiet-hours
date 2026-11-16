import type { Ctx } from "./ctx.ts";
import { companionOf } from "./companions.ts";
import { ticksPerGameMinute } from "./identity.ts";
import { zoneAt } from "./world.ts";

/**
 * Odile is fragile (T4.3, CMP-5). Once she is awake (`lull_awake`) the Lull can pull her back under, and she is then
 * `odile_lapsed` until the player wakes her again at the Lull:
 *  - **the city is on alert**: at `lull.panicAlert` (Hunting) she panics and slides back (`odile_lapse_cause = alert`);
 *    (once the Lull is disrupted, `lull_disrupted`, only the alert remains);
 *  - **she is left alone**: the player spends `lull.leftAloneMinutes` of game time away from the Lull without her
 *    (`odile_lapse_cause = alone`). Time spent in the Lull, or with her as the chosen companion, does not count.
 * Never permanent: a glass of clear water brings her back (her conversation). Emits the custom event `odile_lapsed`.
 */
export const AWAY_FLAG = "odile_away";

export function fragileSystem({ state, config, world, events }: Ctx): void {
  const f = state.flags;
  if (f.lull_awake !== true || f.odile_lapsed === true || f.escaped === true) return;
  let cause: "alert" | "alone" | null = null;
  if (state.alert.level >= config.lull.panicAlert) cause = "alert";
  else if (f.lull_disrupted === true) return; // the Lull no longer pulls anyone back
  else if (zoneAt(world, Math.floor(state.player.x), Math.floor(state.player.y))?.dulls === true) delete f[AWAY_FLAG];
  else if (companionOf(state) !== "odile") {
    const away = (typeof f[AWAY_FLAG] === "number" ? f[AWAY_FLAG] : 0) + 1;
    f[AWAY_FLAG] = away;
    if (away >= config.lull.leftAloneMinutes * ticksPerGameMinute(config)) cause = "alone";
  }
  if (cause === null) return;
  f.odile_lapsed = true;
  f.odile_lapse_cause = cause;
  delete f[AWAY_FLAG];
  events.push({ type: "Custom", tick: state.tick, name: "odile_lapsed" });
}
