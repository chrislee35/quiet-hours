import type { Ctx } from "./ctx.ts";
import { secondsToTicks } from "./ctx.ts";

/**
 * Robot-to-robot alerts and the city's shared memory (T2.2, ROB-2). When a robot or camera identifies the
 * player it tells every robot within `comms.rangeTiles`; the message arrives after `comms.latencySeconds`.
 * An alerted robot goes to investigate the reported position and starts primed (suspicion raised), so it
 * identifies the player quickly if it sees them. Alerts are one hop: recipients do not relay (no storms).
 */
export function broadcastAlert(ctx: Ctx, originId: string, from: { x: number; y: number }, at: { x: number; y: number }): void {
  const { state, config, events } = ctx;
  const range = config.comms.rangeTiles;
  const deliverTick = state.tick + secondsToTicks(config.comms.latencySeconds, config);
  const recipients: string[] = [];
  for (const r of state.robots) {
    if (r.id === originId || r.kind === "mender" || r.destroyed || r.dormant) continue;
    if (Math.hypot(r.x - from.x, r.y - from.y) > range) continue;
    recipients.push(r.id);
    state.messages.push({ to: r.id, from: originId, x: at.x, y: at.y, deliverTick });
  }
  state.lastKnown = { x: at.x, y: at.y, tick: state.tick };
  events.push({ type: "AlertBroadcast", tick: state.tick, originId, recipients });
}

/** Delivers alerts whose latency has elapsed. */
export function commsSystem(ctx: Ctx): void {
  const { state, config, events } = ctx;
  const due = state.messages.filter((m) => m.deliverTick <= state.tick);
  if (due.length === 0) return;
  state.messages = state.messages.filter((m) => m.deliverTick > state.tick);
  for (const m of due) {
    const robot = state.robots.find((r) => r.id === m.to);
    if (!robot || robot.destroyed || robot.dormant || robot.mode === "chase" || robot.mode === "alert") continue; // already on it
    robot.suspicion = Math.max(robot.suspicion, config.comms.primedSuspicion);
    robot.mode = "investigate";
    robot.target = { x: m.x, y: m.y };
    robot.arrived = false;
    robot.dwell = 0;
    robot.path = [];
    robot.pathGoal = null;
    events.push({ type: "AlertReceived", tick: state.tick, robotId: robot.id, originId: m.from });
  }
}

/** True while a reported position is recent enough to send hunters to. */
export function freshLastKnown(ctx: Ctx): { x: number; y: number } | null {
  const { state, config } = ctx;
  const k = state.lastKnown;
  if (!k) return null;
  return state.tick - k.tick <= secondsToTicks(config.comms.memorySeconds, config) ? { x: k.x, y: k.y } : null;
}
