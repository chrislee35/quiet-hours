import { deepClone } from "./clone.ts";
import { ROBOT_KINDS, type RobotKind } from "./world.ts";

/**
 * Tuning configuration (NFR-8). The core never reads files: callers inject a Config.
 * The canonical values live in content/config/tuning.json.
 */
export interface RobotProfile {
  /** Vision cone width and reach. */
  coneDegrees: number;
  rangeTiles: number;
  /** Multiplier on how fast this robot builds suspicion. */
  gainFactor: number;
  /** Multiplier on how far it hears footsteps. */
  hearingFactor: number;
  /** Tiles per second; 0 means the robot never moves from its post. */
  patrolSpeed: number;
  chaseSpeed: number;
  catchRadius: number;
  pauseSeconds: number;
  investigateSeconds: number;
  searchSeconds: number;
  /** Idle scan: the robot sweeps its view this many degrees either side of its post facing (0 = fixed). */
  sweepDegrees: number;
  /** Robots that cannot chase raise the alarm and watch instead. */
  canChase: boolean;
  /** Thorough scans detect forged passes. */
  thorough: boolean;
  /** Checkers: seconds a "pending review" (null) scan stalls them, repeating for as long as the player stays in view. */
  reviewSeconds: number;
  /** Auditors: random audits happen only within this distance. */
  checkRangeTiles: number;
  checkChancePerSecond: number;
  /** Multiplier on audit chance during Quiet Hours. */
  quietHoursCheckFactor: number;
  /** Seconds an audit takes (and the pause before the next). */
  auditSeconds: number;
  /** While chasing, keeps re-targeting the footsteps it can hear (Hounds follow a runner by sound). */
  tracksNoise: boolean;
  /** Hounds: the alert level (1-3) at which this robot is dispatched to hunt; 0 = never. */
  dispatchAlert: number;
}

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
    /** Suspicion (0..1) gained per second at point-blank range in the cone. */
    suspicionGainPerSecond: number;
    suspicionDecayPerSecond: number;
    /** Multiplier on suspicion gain while the player is sneaking (0-1): crouching low is harder to spot. */
    sneakGainFactor: number;
    /** Fraction of the gain lost at maximum range (0 = distance does not matter). */
    proximityFalloff: number;
  };
  /** How a robot's ID check outcome scales how fast it becomes suspicious of the player (STE-3). */
  identity: {
    /** No record at all: "pending review", the baseline. */
    nullGainFactor: number;
    /** Holding a pass that does not cover this zone, or has expired. */
    violationGainFactor: number;
    /** Holding a valid pass: the robot has no reason to be suspicious. */
    allowedGainFactor: number;
  };
  demerits: {
    restrictedZonePoints: number;
    curfewPoints: number;
    /** Minimum seconds between two infractions of the same kind being recorded. */
    cooldownSeconds: number;
    decayPerSecond: number;
    /** Points at which a check is triggered (alert raised to Suspicious). */
    checkThreshold: number;
    /** Points at which enforcers are called (alert raised to Hunting). */
    enforcerThreshold: number;
  };
  failure: {
    /** Seconds the player is held (frozen) in the holding facility after being caught. */
    holdSeconds: number;
    /** Alert level (0-3) the city is at least raised to after processing: the setback (FAIL-2). */
    alertAfterProcessing: number;
  };
  /** One behaviour profile per robot type (ROB-3): how it sees, moves, and what it can do. */
  robots: Record<RobotKind, RobotProfile>;

}

type Shape = { [key: string]: Shape | "number" | "boolean" };

const PROFILE_SHAPE: Shape = {
  coneDegrees: "number", rangeTiles: "number", gainFactor: "number", hearingFactor: "number",
  patrolSpeed: "number", chaseSpeed: "number", catchRadius: "number", pauseSeconds: "number",
  investigateSeconds: "number", searchSeconds: "number", sweepDegrees: "number",
  canChase: "boolean", thorough: "boolean", tracksNoise: "boolean", reviewSeconds: "number", checkRangeTiles: "number",
  checkChancePerSecond: "number", quietHoursCheckFactor: "number", auditSeconds: "number", dispatchAlert: "number",
};

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
    suspicionGainPerSecond: "number",
    suspicionDecayPerSecond: "number",
    sneakGainFactor: "number",
    proximityFalloff: "number",
  },
  identity: { nullGainFactor: "number", violationGainFactor: "number", allowedGainFactor: "number" },
  demerits: {
    restrictedZonePoints: "number",
    curfewPoints: "number",
    cooldownSeconds: "number",
    decayPerSecond: "number",
    checkThreshold: "number",
    enforcerThreshold: "number",
  },
  failure: { holdSeconds: "number", alertAfterProcessing: "number" },
  robots: Object.fromEntries(ROBOT_KINDS.map((k) => [k, PROFILE_SHAPE])) as Shape,
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
    } else if (expected === "boolean") {
      if (typeof actual !== "boolean") errors.push(`${here}: expected true or false`);
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
