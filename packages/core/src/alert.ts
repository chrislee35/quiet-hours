import type { Ctx } from "./ctx.ts";
import { secondsToTicks } from "./ctx.ts";
import { MAX_ALERT_LEVEL, type AlertLevel } from "./events.ts";

/**
 * Alert state machine (T1.5, ALR-1/2). Calm -> Suspicious -> Hunting -> Lockdown.
 *  - A robot spotting the player raises one step, at most once per sighting cooldown.
 *  - While any robot has the player in view the decay clock is held.
 *  - Otherwise one step is lost per `alert.decaySeconds` of out-of-sight time.
 */
export function alertSystem(ctx: Ctx): void {
  const { state, config, events } = ctx;
  const a = state.alert;
  const anySees = state.robots.some((r) => r.sees) || state.cameras.some((c) => !c.broken && !c.dormant && c.sees);
  if (anySees) a.quietSince = state.tick;

  const spotted = events.some((e) => (e.type === "RobotSpotted" || e.type === "CameraSpotted") && e.tick === state.tick);
  const cooldown = secondsToTicks(config.alert.sightingCooldownSeconds, config);
  // A day of pirate radio (SQ-10): the guard is humming along, and nobody is looked at harder than "Suspicious".
  const calm = state.flags.pirate_calm === true && a.level >= 1;
  if (spotted && !calm && a.level < MAX_ALERT_LEVEL && state.tick - a.lastRaise >= cooldown) {
    const from = a.level;
    a.level = (a.level + 1) as AlertLevel;
    a.lastRaise = state.tick;
    a.quietSince = state.tick;
    events.push({ type: "AlertChanged", tick: state.tick, from, to: a.level });
    return;
  }

  // An embraced past is visible to MERIDIAN: the city never quite relaxes (PST-3).
  const floor = state.flags.meridian_sees === true ? 1 : 0;
  if (a.level > floor && !anySees && state.tick - a.quietSince >= secondsToTicks(config.alert.decaySeconds, config)) {
    const from = a.level;
    a.level = (a.level - 1) as AlertLevel;
    a.quietSince = state.tick;
    events.push({ type: "AlertChanged", tick: state.tick, from, to: a.level });
  }
}
