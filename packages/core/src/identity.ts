/**
 * Identity, passes and the pass resolver (T2.3, STE-2/3). The player starts with no record at all: the *null
 * state*. A scan of a null returns `Null`, which the city treats as "pending review", not a violation. Anyone
 * holding passes is scanned against them, and a pass that does not cover the situation is a real violation.
 */
import type { Config } from "./config.ts";
import type { SimState } from "./state.ts";
import type { ZoneDef } from "./world.ts";

export type PassOrigin = "issued" | "forged" | "borrowed" | "stolen";

export interface Pass {
  id: string;
  label: string;
  /** Highest zone permission level this pass satisfies. */
  level: number;
  /** Restrict to these zone ids; null covers any zone whose requirement is within `level`. */
  zones: string[] | null;
  /** Game tick after which the pass is no longer valid; null never expires. */
  expiresTick: number | null;
  /** Remaining scans for a one-time or limited pass; null is unlimited. Checkpoints consume uses. */
  usesLeft: number | null;
  origin: PassOrigin;
  /** Lets the holder be out during curfew without it counting against them. */
  curfewExempt: boolean;
}

export type ScanOutcome = "Allowed" | "Null" | "Violation" | "Expired";

export interface ScanResult {
  outcome: ScanOutcome;
  /** The pass that satisfied the scan (Allowed only). */
  passId: string | null;
  reason: string;
}

export interface ScanOptions {
  /** A thorough scan (an Auditor) detects forged passes; a basic scan does not. */
  thorough?: boolean;
}

/** Why a pass fails here, or null if it is fully valid. Order matters: the first reason found is reported. */
function whyInvalid(pass: Pass, required: number, zoneId: string | null, tick: number, opts: ScanOptions): string | null {
  if (pass.expiresTick !== null && tick >= pass.expiresTick) return "expired";
  if (pass.usesLeft !== null && pass.usesLeft <= 0) return "spent";
  if (pass.level < required) return "insufficient level";
  if (pass.zones !== null && (zoneId === null || !pass.zones.includes(zoneId))) return "not valid in this zone";
  if (opts.thorough && pass.origin === "forged") return "forged";
  return null;
}

/**
 * Evaluates the player's identity against a zone at the current time (STE-1/2/3).
 *   no passes           -> Null          (pending review; the null state)
 *   a valid pass        -> Allowed
 *   only expired passes -> Expired       (they would have been fine, once)
 *   otherwise           -> Violation
 */
export function resolvePass(state: Readonly<SimState>, zone: ZoneDef | null, opts: ScanOptions = {}): ScanResult {
  if (state.passes.length === 0) return { outcome: "Null", passId: null, reason: "no record" };
  const required = zone?.requiredPermission ?? 0;
  const zoneId = zone?.id ?? null;
  // Prefer the lowest-level valid pass that works, so powerful passes are not spent on trivial checks.
  const ordered = [...state.passes].sort((a, b) => a.level - b.level || (a.id < b.id ? -1 : 1));
  const reasons: string[] = [];
  for (const pass of ordered) {
    const why = whyInvalid(pass, required, zoneId, state.tick, opts);
    if (why === null) return { outcome: "Allowed", passId: pass.id, reason: "valid pass" };
    reasons.push(why);
  }
  // Would any pass have worked if it had not expired?
  const wouldWork = ordered.some((p) => p.expiresTick !== null && state.tick >= p.expiresTick && whyInvalid({ ...p, expiresTick: null }, required, zoneId, state.tick, opts) === null);
  if (wouldWork) return { outcome: "Expired", passId: null, reason: "pass expired" };
  return { outcome: "Violation", passId: null, reason: reasons[0] ?? "no valid pass" };
}

/** Uses up one scan of a limited pass (checkpoints call this); unlimited passes are unaffected. */
export function consumePass(state: SimState, passId: string): void {
  const pass = state.passes.find((p) => p.id === passId);
  if (pass && pass.usesLeft !== null && pass.usesLeft > 0) pass.usesLeft -= 1;
}

/** True when the holder may be out during curfew (any held pass marked exempt and still valid). */
export function curfewExempt(state: Readonly<SimState>): boolean {
  return state.passes.some((p) => p.curfewExempt && (p.expiresTick === null || state.tick < p.expiresTick));
}

/** Ticks in one in-game minute, for building pass expiry times. */
export function ticksPerGameMinute(config: Config): number {
  return config.sim.ticksPerSecond / config.clock.gameMinutesPerRealSecond;
}
