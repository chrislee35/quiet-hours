import type { Ctx } from "./ctx.ts";
import { applyEffect } from "./rules.ts";
import type { SimState } from "./state.ts";
import type { Config } from "./config.ts";
import type { GameEvent } from "./events.ts";

/**
 * Demerit ledger (T2.3, STE-6). Minor infractions seen by robots (being somewhere you may not, being out
 * during curfew) add points; points drain slowly; crossing a threshold calls a check, then enforcers.
 * Only people *with* a record can earn demerits: a null has nothing on file to mark (STE-3).
 */

export type InfractionKind = "restricted_zone" | "curfew";

const POINTS = (config: Config): Record<InfractionKind, number> => ({
  restricted_zone: config.demerits.restrictedZonePoints,
  curfew: config.demerits.curfewPoints,
});

/** Records an infraction unless the same kind was recorded within the cooldown. Returns whether it counted. */
export function recordInfraction(state: SimState, config: Config, events: GameEvent[], kind: InfractionKind): boolean {
  const cooldown = Math.round(config.demerits.cooldownSeconds * config.sim.ticksPerSecond);
  const last = state.demerits.last[kind];
  if (last !== undefined && state.tick - last < cooldown) return false;
  const points = POINTS(config)[kind];
  state.demerits.last[kind] = state.tick;
  state.demerits.points += points;
  events.push({ type: "InfractionRecorded", tick: state.tick, kind, points, total: Math.round(state.demerits.points * 100) / 100 });
  return true;
}

/** Standing in words, for the UI: demerits are never shown as a raw number. */
export function standing(points: number, config: Config): "clean" | "noted" | "flagged" | "wanted" {
  if (points <= 0.0001) return "clean";
  if (points < config.demerits.checkThreshold) return "noted";
  if (points < config.demerits.enforcerThreshold) return "flagged";
  return "wanted";
}

/** Drains points over time and fires threshold events, each time the level rises. */
export function demeritSystem(ctx: Ctx): void {
  const { state, config, events } = ctx;
  const d = state.demerits;
  d.points = Math.max(0, d.points - config.demerits.decayPerSecond / config.sim.ticksPerSecond);
  const level = d.points >= config.demerits.enforcerThreshold ? 2 : d.points >= config.demerits.checkThreshold ? 1 : 0;
  if (level > d.level) {
    events.push({ type: "DemeritThreshold", tick: state.tick, level: level === 2 ? "enforcer" : "check" });
    // Until Hounds and Auditors exist the response is the alert: a check makes the city wary, enforcers hunt.
    applyEffect({ raise_alert_to: level === 2 ? 2 : 1 }, state, events, config);
  }
  d.level = level;
}
