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
  if (spotted && a.level < MAX_ALERT_LEVEL && state.tick - a.lastRaise >= cooldown) {
    const from = a.level;
    a.level = (a.level + 1) as AlertLevel;
    a.lastRaise = state.tick;
    a.quietSince = state.tick;
    events.push({ type: "AlertChanged", tick: state.tick, from, to: a.level });
    return;
  }

  if (a.level > 0 && !anySees && state.tick - a.quietSince >= secondsToTicks(config.alert.decaySeconds, config)) {
    const from = a.level;
    a.level = (a.level - 1) as AlertLevel;
    a.quietSince = state.tick;
    events.push({ type: "AlertChanged", tick: state.tick, from, to: a.level });
  }
}
