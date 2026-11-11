/**
 * NPC daily routines (T2.8, WLD-5). A person placed on a map may have a `routine` (the NPC object's string property, "06:00=spot_a,12:00=spot_b,22:00=away"): a list of `{ at: "HH:MM", spot }`
 * entries. At any time of day an NPC is headed for the spot of the latest entry whose time has passed (the last
 * entry of the previous day carries over midnight). Spots are named points on the map (`spot` objects); the spot
 * `away` means off duty: not in the district at all (not drawn, cannot be talked to). NPCs walk between spots
 * using the same path-following as robots, so a person is somewhere real at every moment and the player can
 * learn who is where, when.
 */
import { MINUTES_PER_HOUR, gameTimeAt } from "./clock.ts";
import type { Ctx } from "./ctx.ts";
import { goTo } from "./nav.ts";
import { HALF_TILE } from "./world.ts";
import type { NpcState } from "./state.ts";

export interface RoutineEntry {
  /** Time of day, "HH:MM" (24 h). */
  at: string;
  /** A spot id on the map, or "away". */
  spot: string;
}

export const AWAY = "away";

export const minuteOf = (hhmm: string): number => {
  const m = hhmm.match(/^([01]?\d|2[0-3]):([0-5]\d)$/); // tuning-ok: the 24-hour HH:MM format
  return m ? Number(m[1]) * MINUTES_PER_HOUR + Number(m[2]) : -1;
};

/** The spot a routine puts someone at for this minute of the day, or null if the routine is empty. */
export function routineSpot(routine: readonly RoutineEntry[], minuteOfDay: number): string | null {
  if (routine.length === 0) return null;
  const sorted = [...routine].sort((a, b) => minuteOf(a.at) - minuteOf(b.at));
  let spot = sorted[sorted.length - 1]!.spot; // carries over from the previous day
  for (const e of sorted) if (minuteOf(e.at) <= minuteOfDay) spot = e.spot;
  return spot;
}

export function npcSystem(ctx: Ctx): void {
  const { state, config, world } = ctx;
  const minute = gameTimeAt(state.tick, config).minuteOfDay;
  for (const def of world.npcs) {
    const npc = state.npcs[def.id];
    const routine = def.routine;
    if (!npc || !routine) continue;
    const spotId = routineSpot(routine, minute);
    if (spotId === null) continue;
    npc.spot = spotId;
    if (spotId === AWAY) {
      npc.away = true;
      continue;
    }
    const spot = world.spotById.get(spotId);
    if (!spot) continue;
    if (npc.away) {
      // Coming back on duty: appear at the spot instead of walking in from nowhere.
      npc.away = false;
      npc.x = spot.x + HALF_TILE;
      npc.y = spot.y + HALF_TILE;
      npc.path = [];
      npc.pathGoal = null;
      continue;
    }
    goTo(ctx, npc as NpcState, spot.x + HALF_TILE, spot.y + HALF_TILE, config.npcs.walkSpeed);
  }
}
