import { deepClone } from "./clone.ts";
/**
 * Tuning configuration (NFR-8). The core never reads files: callers inject a Config.
 * The canonical values live in content/config/tuning.json.
 */
export interface Config {
  sim: { ticksPerSecond: number };
  clock: {
    gameMinutesPerRealSecond: number;
    startDay: number;
    startMinuteOfDay: number;
    curfewStartMinute: number;
    curfewEndMinute: number;
    quietHoursStartMinute: number;
    quietHoursEndMinute: number;
  };
  player: {
    walkSpeed: number;
    sneakSpeed: number;
    runSpeed: number;
    /** Half-size of the player's square hitbox, in tiles. */
    radius: number;
    /** How far (tiles) the Interact action reaches. */
    interactRadius: number;
  };
  noise: {
    walkRadius: number;
    sneakRadius: number;
    runRadius: number;
    /** Multiplier on hearing radius when walls block the straight line to the listener. */
    occludedFactor: number;
  };
  alert: {
    /** Out-of-sight seconds per one-step decay. */
    decaySeconds: number;
    /** Minimum seconds between sighting-driven raises, so a pair of robots cannot jump straight to Lockdown. */
    sightingCooldownSeconds: number;
  };
  vision: {
    coneDegrees: number;
    rangeTiles: number;
    checkerRangeTiles: number;
    /** Suspicion (0..1) gained per second at point-blank range in the cone. */
    suspicionGainPerSecond: number;
    suspicionDecayPerSecond: number;
    /** Fraction of the gain lost at maximum range (0 = distance does not matter). */
    proximityFalloff: number;
  };
  failure: {
    /** Seconds the player is held (frozen) in the holding facility after being caught. */
    holdSeconds: number;
    /** Alert level (0-3) the city is at least raised to after processing: the setback (FAIL-2). */
    alertAfterProcessing: number;
  };
  warden: {
    patrolSpeed: number;
    chaseSpeed: number;
    waypointPauseSeconds: number;
    investigateSeconds: number;
    searchSeconds: number;
    catchRadius: number;
  };
}

type Shape = { [key: string]: Shape | "number" };

const SHAPE: Shape = {
  sim: { ticksPerSecond: "number" },
  clock: {
    gameMinutesPerRealSecond: "number",
    startDay: "number",
    startMinuteOfDay: "number",
    curfewStartMinute: "number",
    curfewEndMinute: "number",
    quietHoursStartMinute: "number",
    quietHoursEndMinute: "number",
  },
  player: { walkSpeed: "number", sneakSpeed: "number", runSpeed: "number", radius: "number", interactRadius: "number" },
  noise: { walkRadius: "number", sneakRadius: "number", runRadius: "number", occludedFactor: "number" },
  alert: { decaySeconds: "number", sightingCooldownSeconds: "number" },
  vision: {
    coneDegrees: "number",
    rangeTiles: "number",
    checkerRangeTiles: "number",
    suspicionGainPerSecond: "number",
    suspicionDecayPerSecond: "number",
    proximityFalloff: "number",
  },
  failure: { holdSeconds: "number", alertAfterProcessing: "number" },
  warden: {
    patrolSpeed: "number",
    chaseSpeed: "number",
    waypointPauseSeconds: "number",
    investigateSeconds: "number",
    searchSeconds: "number",
    catchRadius: "number",
  },
};

export class ConfigError extends Error {}

function check(value: unknown, shape: Shape, path: string, errors: string[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push(`${path || "config"}: expected an object`);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const [key, expected] of Object.entries(shape)) {
    const here = path ? `${path}.${key}` : key;
    const actual = record[key];
    if (expected === "number") {
      if (typeof actual !== "number" || !Number.isFinite(actual)) {
        errors.push(`${here}: expected a finite number`);
      }
    } else {
      check(actual, expected, here, errors);
    }
  }
}

/** Validates untrusted JSON and returns it typed. Throws ConfigError listing every problem. */
export function validateConfig(raw: unknown): Config {
  const errors: string[] = [];
  check(raw, SHAPE, "", errors);
  const config = raw as Config;
  if (errors.length === 0 && config.sim.ticksPerSecond <= 0) {
    errors.push("sim.ticksPerSecond: must be > 0");
  }
  if (errors.length > 0) throw new ConfigError(errors.join("\n"));
  return config;
}

/** Returns a deep-copied config with a partial override applied (for tests and difficulty presets). */
export function withOverrides(base: Config, overrides: DeepPartial<Config>): Config {
  return validateConfig(merge(deepClone(base), overrides));
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function merge(target: any, source: any): any {
  for (const [key, value] of Object.entries(source)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      target[key] = merge(target[key] ?? {}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}
