import type { Config } from "./config.ts";
import type { Ctx } from "./ctx.ts";
import type { SimState } from "./state.ts";
import { secondsToTicks } from "./ctx.ts";
import type { AlertLevel, GameEvent } from "./events.ts";
import { spawnPoint } from "./world.ts";

/** Seconds held after the Nth arrest: stricter each time, to a ceiling. */
export function holdSecondsFor(config: Config, arrest: number): number {
  const f = config.failure;
  return Math.min(f.holdMaxSeconds, f.holdSeconds + f.holdPerArrest * Math.max(0, arrest - 1));
}

/** True once repeated arrests have put the player on MERIDIAN's watch list. */
export function isTracked(state: Readonly<SimState>, config: Config): boolean {
  return state.arrestCount >= config.failure.trackingAfterArrests;
}

/** How much faster robots notice a tracked player. */
export function trackingFactor(state: Readonly<SimState>, config: Config): number {
  return isTracked(state, config) ? config.failure.trackedGainFactor : 1;
}

/**
 * Soft failure (T1.6, FAIL-1/2/5). When a robot catches the player they are *processed*, not killed:
 *  - everything carried (items and credits) is confiscated into the locker,
 *  - they wake in the holding facility (the "holding" spawn) and are held for `failure.holdSeconds`,
 *  - every robot stands down, and the alert is set back to at least `failure.alertAfterProcessing`,
 *  - the arrest count goes up, and repeated arrests escalate (FAIL-4): every arrest after the first is held longer,
 *    and from `failure.trackingAfterArrests` MERIDIAN tracks them: the alert stays higher after processing and
 *    robots notice them faster (see `trackingFactor`). Halloran-7's deal (T3.15) wipes the count.
 * Flags, clues, and trust are never touched (FAIL-5): the game continues.
 */
export function processingSystem(ctx: Ctx): void {
  const { state, config, world, events } = ctx;

  if (state.processingUntil > 0 && state.tick >= state.processingUntil) {
    state.processingUntil = 0;
    events.push({ type: "PlayerReleased", tick: state.tick });
  }

  const caught = events.some((e: GameEvent) => e.type === "PlayerCaught" && e.tick === state.tick);
  if (!caught || state.processingUntil > 0) return;

  // Confiscate everything. Items and credits merge into whatever is already in the locker.
  const items = state.inventory.items;
  const credits = state.inventory.credits;
  for (const [id, n] of Object.entries(items)) state.locker.items[id] = (state.locker.items[id] ?? 0) + n;
  state.locker.credits += credits;
  state.inventory = { credits: 0, items: {} };
  // Passes are confiscated too (forged ones included): getting an identity back is part of the setback.
  state.locker.passes.push(...state.passes);
  state.passes = [];
  // Serving the processing wipes the slate of minor infractions.
  state.demerits = { points: 0, level: 0, last: {} };

  state.arrestCount += 1;
  state.processingUntil = state.tick + secondsToTicks(holdSecondsFor(config, state.arrestCount), config);
  state.player.intent = { dx: 0, dy: 0, mode: "walk" };
  const holding = spawnPoint(world, "holding") ?? spawnPoint(world, "start");
  if (holding) {
    state.player.x = holding.x;
    state.player.y = holding.y;
  }

  for (const r of state.robots) {
    r.mode = "patrol";
    r.target = null;
    r.path = [];
    r.pathGoal = null;
    r.arrived = false;
    r.dwell = 0;
    r.suspicion = 0;
    r.sees = false;
  }

  for (const cam of state.cameras) {
    cam.suspicion = 0;
    cam.sees = false;
  }
  state.messages = [];

  const before = state.alert.level;
  const level = Math.max(before, isTracked(state, config) ? config.failure.trackedAlert : config.failure.alertAfterProcessing) as AlertLevel;
  state.alert.quietSince = state.tick;
  if (level !== before) {
    state.alert.level = level;
    events.push({ type: "AlertChanged", tick: state.tick, from: before, to: level });
  }

  events.push({ type: "PlayerProcessed", tick: state.tick, arrestCount: state.arrestCount, items: { ...items }, credits });
}
