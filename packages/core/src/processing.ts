import type { Ctx } from "./ctx.ts";
import { secondsToTicks } from "./ctx.ts";
import type { GameEvent } from "./events.ts";
import { spawnPoint } from "./world.ts";

/**
 * Soft failure (T1.6, FAIL-1/2/5). When a robot catches the player they are *processed*, not killed:
 *  - everything carried (items and credits) is confiscated into the locker,
 *  - they wake in the holding facility (the "holding" spawn) and are held for `failure.holdSeconds`,
 *  - every robot stands down, and the alert is set back to at least `failure.alertAfterProcessing`,
 *  - the arrest count goes up (which later escalates how MERIDIAN treats them).
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

  state.arrestCount += 1;
  state.processingUntil = state.tick + secondsToTicks(config.failure.holdSeconds, config);
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

  const before = state.alert.level;
  const level = Math.max(before, config.failure.alertAfterProcessing) as 0 | 1 | 2 | 3;
  state.alert.quietSince = state.tick;
  if (level !== before) {
    state.alert.level = level;
    events.push({ type: "AlertChanged", tick: state.tick, from: before, to: level });
  }

  events.push({ type: "PlayerProcessed", tick: state.tick, arrestCount: state.arrestCount, items: { ...items }, credits });
}
