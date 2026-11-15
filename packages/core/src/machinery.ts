/**
 * Machinery and timers (T3.5). Two small systems that make the clock matter to the world:
 *
 *  - Machinery doors (presses, gates) open and shut on a timer from the tick count alone, so the pattern is the same
 *    every run and can be learned and timed. A machine only runs while its power holds (`runsWhen`); cut the power
 *    and it rests open. A machine never shuts on someone standing in it.
 *  - Scheduled locks (`unlockedWhen`): the night shift leaves a door unlocked, and it locks again when they are back.
 *    Unlocking it by hand (a terminal) is permanent and is never undone by the schedule.
 *  - Timers: an effect can schedule other effects for later (`schedule`): a repair crew arrives in an hour.
 */
import type { Ctx } from "./ctx.ts";
import { isActive, parseActiveWhen } from "./districts.ts";
import { ticksPerGameMinute } from "./identity.ts";
import { overlapsTile } from "./movement.ts";
import { applyEffects } from "./rules.ts";

export function machinerySystem(ctx: Ctx): void {
  const { state, config, world } = ctx;
  const tps = config.sim.ticksPerSecond;
  const r = config.player.radius;
  for (const def of world.doors) {
    const door = state.doors[def.id];
    if (!door) continue;
    if (def.unlockedWhen) {
      const when = parseActiveWhen(def.unlockedWhen);
      const want = isActive(state, when, config);
      if (want && door.locked) {
        door.locked = false;
        door.scheduled = true;
      } else if (!want && door.scheduled) {
        door.scheduled = false;
        door.locked = true;
        door.open = false;
      }
    }
    if (!def.cycle) continue;
    const running = def.runsWhen ? isActive(state, parseActiveWhen(def.runsWhen), config) : true;
    const period = Math.round((def.cycle.openSeconds + def.cycle.closedSeconds) * tps);
    const inCycle = (state.tick + Math.round(def.cycle.offsetSeconds * tps)) % period;
    const shouldBeOpen = !running || inCycle < Math.round(def.cycle.openSeconds * tps);
    if (shouldBeOpen) door.open = true;
    else if (door.open) {
      // Shutting on somebody would trap them in the wall: the machine waits until the doorway is clear.
      const p = state.player;
      const blocked = overlapsTile(p, r, def.x, def.y) || state.robots.some((rb) => !rb.dormant && !rb.destroyed && overlapsTile(rb, 0.4, def.x, def.y));
      if (!blocked) door.open = false;
    }
  }
}

/** Runs effects whose time has come. */
export function timerSystem(ctx: Ctx): void {
  const { state, config, events } = ctx;
  if (state.timers.length === 0) return;
  const due = state.timers.filter((t) => t.dueTick <= state.tick);
  if (due.length === 0) return;
  state.timers = state.timers.filter((t) => t.dueTick > state.tick);
  for (const t of due) applyEffects(t.effects, state, events, config, ctx.content);
}

/** The tick that is `minutes` of game time from now. */
export const dueIn = (tick: number, minutes: number, config: Parameters<typeof ticksPerGameMinute>[0]): number => tick + Math.round(minutes * ticksPerGameMinute(config));


