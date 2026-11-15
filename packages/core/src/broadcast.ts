import type { Condition, Effect } from "./rules.ts";
import { applyEffects, evalAll } from "./rules.ts";
import type { Config } from "./config.ts";
import type { Ctx } from "./ctx.ts";
import type { Content } from "./dialogue/types.ts";
import { ticksPerGameMinute } from "./identity.ts";
import { Rng } from "./rng.ts";
import type { SimState } from "./state.ts";

/**
 * The Civic Voice (T3.15): MERIDIAN's public-address announcer. Every `pa.intervalMinutes` of game time it says one
 * line from a pool of content (`content/broadcasts`). A line may carry `when` conditions (an arrest-count notice, a
 * curfew reminder, a gloat about contentment) and `effects` (a piece of false information is a clue the player may
 * pick up: `pa_shift_time`). The choice is a pure function of the run's seed and the moment, never of the
 * state's random stream, so announcing never disturbs anything else; the most recent lines are remembered (in the
 * `pa_recent` flag, so saving keeps them) and not repeated until `pa.noRepeat` others have played.
 */
export interface BroadcastDef {
  id: string;
  text: string;
  /** Every condition must hold for the line to be eligible. Lines without any are routine. */
  when?: Condition[];
  /** Relative weight when picking among eligible lines (default 1). Situational lines carry more. */
  weight?: number;
  effects?: Effect[];
}

const RECENT_FLAG = "pa_recent";

export const recentBroadcasts = (state: Readonly<SimState>): string[] => {
  const v = state.flags[RECENT_FLAG];
  return typeof v === "string" && v !== "" ? v.split(",") : [];
};

/** Lines that could play right now, before the no-repeat rule. */
export function eligibleBroadcasts(state: Readonly<SimState>, config: Config, content: Content): BroadcastDef[] {
  return Object.values(content.broadcasts)
    .filter((b) => evalAll(b.when ?? [], state, config, content))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** The line for a given moment: eligible, not recently played, weighted, from a stream that depends only on the seed and the tick. */
export function pickBroadcast(state: Readonly<SimState>, config: Config, content: Content, tick: number = state.tick): BroadcastDef | null {
  const eligible = eligibleBroadcasts(state, config, content);
  if (eligible.length === 0) return null;
  const recent = new Set(recentBroadcasts(state).slice(-config.pa.noRepeat));
  const fresh = eligible.filter((b) => !recent.has(b.id));
  const pool = fresh.length > 0 ? fresh : eligible;
  const total = pool.reduce((n, b) => n + (b.weight ?? 1), 0);
  let roll = new Rng((state.seed ^ Math.imul(tick, 2654435761)) >>> 0).next() * total;
  for (const b of pool) {
    roll -= b.weight ?? 1;
    if (roll < 0) return b;
  }
  return pool[pool.length - 1]!;
}

/** Ticks between announcements. */
export const broadcastInterval = (config: Config): number => Math.max(1, Math.round(config.pa.intervalMinutes * ticksPerGameMinute(config)));

export function broadcastSystem(ctx: Ctx): void {
  const { state, config, content, events, world } = ctx;
  if (state.tick === 0 || state.tick % broadcastInterval(config) !== 0) return;
  // The Safehouse (any zone marked safe) is beyond the speakers' reach.
  if (state.player.zone !== null && world.zones.find((z) => z.id === state.player.zone)?.safe) return;
  const line = pickBroadcast(state, config, content);
  if (!line) return;
  const recent = [...recentBroadcasts(state), line.id].slice(-config.pa.noRepeat);
  state.flags[RECENT_FLAG] = recent.join(",");
  events.push({ type: "Broadcast", tick: state.tick, id: line.id, text: line.text });
  if (line.effects?.length) applyEffects(line.effects, state, events, config, content);
}
