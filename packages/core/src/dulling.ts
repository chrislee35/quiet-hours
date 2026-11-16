import type { Config } from "./config.ts";
import type { Ctx } from "./ctx.ts";
import type { Content } from "./dialogue/types.ts";
import { hasTag } from "./augments.ts";
import { ticksPerGameMinute } from "./identity.ts";
import type { SimState } from "./state.ts";
import { zoneAt } from "./world.ts";

/**
 * The Lull's dulling (T4.2, CLU-6). Time spent in a zone marked `dulls` builds up exposure, kept in the number flag
 * `lull_exposure` (game ticks, so saving keeps it). After a grace period the *newest* notebook entries smudge: the
 * more exposure, the more of them. A smudged entry is only blurred on screen: the clue is never changed or removed.
 * Sleeping (the `rest` effect) clears the exposure and every entry is clear again. An equipped Memory Anchor (the
 * augment tag `notebook_anchor`) stops exposure from building at all.
 */
export const EXPOSURE_FLAG = "lull_exposure";

export const exposureTicks = (state: Readonly<SimState>): number => {
  const v = state.flags[EXPOSURE_FLAG];
  return typeof v === "number" ? v : 0;
};

/** How many of the newest entries are smudged at this exposure. */
export function dulledCount(state: Readonly<SimState>, config: Config): number {
  const c = config.lull;
  const grace = c.graceMinutes * ticksPerGameMinute(config);
  const over = exposureTicks(state) - grace;
  if (over < 0) return 0;
  const steps = Math.floor(over / (c.stepMinutes * ticksPerGameMinute(config))) + 1;
  return Math.min(c.maxDulled, steps * c.perStep);
}

/** The ids of the smudged entries: the newest the player has learned. */
export function dulledIds(state: Readonly<SimState>, config: Config): Set<string> {
  const n = dulledCount(state, config);
  if (n === 0) return new Set();
  return new Set(
    Object.entries(state.clues)
      .sort(([ai, a], [bi, b]) => b.learnedTick - a.learnedTick || (ai < bi ? -1 : 1))
      .slice(0, n)
      .map(([id]) => id),
  );
}

/** Blurs about half of the words of a clue, which ones fixed by the clue's id so the screen does not flicker. */
export function smudge(id: string, text: string): string {
  let words = 0;
  return text.replace(/\S+/g, (w) => {
    const i = words++;
    if (i === 0) return w;
    let h = 2166136261;
    for (const ch of `${id}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    return h % 100 < 55 ? w.replace(/[A-Za-z0-9]/g, "▒") : w;
  });
}

const hasDullZone = new WeakMap<object, boolean>();

export function dullingSystem({ state, config, world, content, events }: Ctx): void {
  let any = hasDullZone.get(world);
  if (any === undefined) hasDullZone.set(world, (any = world.zones.some((z) => z.dulls === true)));
  if (!any || state.flags.lull_disrupted === true) return;
  const zone = zoneAt(world, Math.floor(state.player.x), Math.floor(state.player.y));
  if (!zone?.dulls || hasTag(state, content, "notebook_anchor")) return;
  const before = dulledCount(state, config);
  state.flags[EXPOSURE_FLAG] = exposureTicks(state) + 1;
  const after = dulledCount(state, config);
  if (after > before) events.push({ type: "NotebookDulled", tick: state.tick, dulled: after });
}

/** Sleeping: every entry is clear again. Returns whether anything had been smudged. */
export function restoreNotebook(state: SimState, config: Config): boolean {
  const had = dulledCount(state, config) > 0 || exposureTicks(state) > 0;
  delete state.flags[EXPOSURE_FLAG];
  return had;
}
