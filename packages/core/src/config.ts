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
    /** Points for attacking a robot (only people with a record can earn demerits). */
    assaultPoints: number;
    /** Multiplier on curfew points during Quiet Hours, when the city is strictest (WLD-8). */
    quietHoursCurfewFactor: number;
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
  /** Robot-to-robot alerts and the city's shared memory of where the player was last seen (ROB-2). */
  comms: {
    /** A robot that identifies the player alerts every robot within this many tiles. */
    rangeTiles: number;
    /** Seconds before an alert reaches its recipients. */
    latencySeconds: number;
    /** Suspicion an alerted robot starts from, so it identifies the player quickly when it sees them. */
    primedSuspicion: number;
    /** How long a reported position stays "fresh" for dispatching hunters. */
    memorySeconds: number;
  };
  /** Fixed cameras: a sweeping view that cannot move and reports what it sees. */
  cameras: {
    coneDegrees: number;
    rangeTiles: number;
    gainFactor: number;
    sweepDegrees: number;
    /** Seconds for a full sweep cycle. */
    sweepSeconds: number;
    /** Seconds after raising an alarm before it can raise another. */
    cooldownSeconds: number;
  };
  /** The city repairs what it can see is wrong (ROB-5), using maintenance robots. */
  repairs: {
    /** A disabled camera is noticed and repaired after this long. */
    cameraDelaySeconds: number;
    /** A door that began locked and was unlocked is locked again after this long. */
    relockDelaySeconds: number;
    /** Seconds a maintenance robot spends on the job once it arrives. */
    repairSeconds: number;
  };
  npcs: {
    /** Tiles per second people walk between the spots of their routine. */
    walkSpeed: number;
  };
  /** Assist options (HAK-3). */
  assist: {
    /** With the puzzle-skip assist on, a puzzle can be skipped after this many taps that changed it. */
    skipAfterTaps: number;
  };
  /** Saving (SAV-1). */
  save: {
    /** If true, manual saves only work in `safe` zones (the Safehouse); otherwise also anywhere calm. */
    requireSafeZone: boolean;
    /** Real seconds of play between autosaves (taken only when calm). */
    autosaveSeconds: number;
  };
  /** City metrics (WLD-4). */
  metrics: {
    orderStart: number;
    powerStart: number;
    contentmentStart: number;
    /** Points per in-game hour that order and contentment drift back toward their start. */
    recoverPerHour: number;
  };
  /** How robots look around, wait and hurry (the "feel" of their behaviour). */
  ai: {
    /** Seconds out of sight before a robot treats the player as a new arrival (Checkers re-check). */
    forgetSeconds: number;
    /** A robot looking around sweeps back and forth with this period (seconds) and amplitude (radians). */
    lookAroundSeconds: number;
    lookAroundRadians: number;
    /** A post-bound robot's sweep period (seconds). */
    postSweepSeconds: number;
    /** Robots hurry to investigate noise at this multiple of their patrol speed. */
    investigateSpeedFactor: number;
  };
  /** What fighting costs (CMB-2). */
  combat: {
    /** Defaults for a tool that does not say: decoy noise radius, stun seconds, lethal-shot noise radius. */
    defaultDecoyNoise: number;
    defaultStunSeconds: number;
    defaultLethalNoise: number;
    /** Alert level a fight raises the city to (Hunting). */
    fightAlert: number;
    /** Alert level lethal force raises it to (Lockdown). */
    lethalAlert: number;
    /** Share of the credits carried that is lost in the scuffle. */
    creditLossFraction: number;
  };
  /** Loans and collectors (ECO-2). */
  economy: {
    /** Interest added to what is owed, compounding once per in-game day. */
    loanInterestPerDay: number;
    /** In-game days after borrowing before collectors start coming. */
    loanDueDays: number;
    /** Fraction of the credits carried that collectors take on each visit (never more than is owed). */
    garnishFraction: number;
  };
  /** The wrist band's starting capacity (AUG-2); upgrades raise it through effects. */
  band: { slots: number; powerBudget: number };
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
    assaultPoints: "number",
    quietHoursCurfewFactor: "number",
    curfewPoints: "number",
    cooldownSeconds: "number",
    decayPerSecond: "number",
    checkThreshold: "number",
    enforcerThreshold: "number",
  },
  failure: { holdSeconds: "number", alertAfterProcessing: "number" },
  comms: { rangeTiles: "number", latencySeconds: "number", primedSuspicion: "number", memorySeconds: "number" },
  cameras: { coneDegrees: "number", rangeTiles: "number", gainFactor: "number", sweepDegrees: "number", sweepSeconds: "number", cooldownSeconds: "number" },
  repairs: { cameraDelaySeconds: "number", relockDelaySeconds: "number", repairSeconds: "number" },
  band: { slots: "number", powerBudget: "number" },
  npcs: { walkSpeed: "number" },
  assist: { skipAfterTaps: "number" },
  save: { requireSafeZone: "boolean", autosaveSeconds: "number" },
  metrics: { orderStart: "number", powerStart: "number", contentmentStart: "number", recoverPerHour: "number" },
  ai: { forgetSeconds: "number", lookAroundSeconds: "number", lookAroundRadians: "number", postSweepSeconds: "number", investigateSpeedFactor: "number" },
  combat: { fightAlert: "number", lethalAlert: "number", creditLossFraction: "number", defaultDecoyNoise: "number", defaultStunSeconds: "number", defaultLethalNoise: "number" },
  economy: { loanInterestPerDay: "number", loanDueDays: "number", garnishFraction: "number" },
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
