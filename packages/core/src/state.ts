import { gameTimeAt } from "./clock.ts";
import type { Config } from "./config.ts";
import type { AlertLevel, ClueStatus, FlagValue, MoveMode, TrustLevel } from "./events.ts";
import type { Pass } from "./identity.ts";
import type { Loan } from "./economy.ts";
import { initialDoorStates, OPEN_WORLD, spawnPoint, zoneAt, type CameraDef, type DoorState, type RobotDef, type RobotKind, type World } from "./world.ts";

export const STATE_VERSION = 1;

export interface AugmentState {
  /** Augments found, bought or crafted, in the order acquired. */
  owned: string[];
  /** The subset currently worn; limited by `slots` and `powerBudget`. */
  equipped: string[];
  slots: number;
  powerBudget: number;
  /** Ghost Tag: every ID scan up to this tick reads as valid. */
  spoofUntil: number;
  /** Ghost Tag: the tag cannot start another spoof before this tick. */
  spoofReadyAt: number;
  /** Burst Jammer: cannot fire again before this tick. */
  jamReadyAt: number;
}

/** Plain, JSON-serializable data only (SAV-2): no classes, functions, or Maps. */
export interface SimState {
  version: number;
  seed: number;
  tick: number;
  rngState: number;
  player: {
    x: number;
    y: number;
    /** Standing intent set by the SetMove command; applied every tick until changed. */
    intent: { dx: number; dy: number; mode: MoveMode };
    /** Id of the zone the player's centre is in, or null. */
    zone: string | null;
  };
  /** Runtime state of every door, keyed by door id. */
  doors: Record<string, DoorState>;
  robots: RobotState[];
  cameras: CameraState[];
  /** Alerts in flight between robots. */
  messages: PendingAlert[];
  /** Where the city believes the player was last reported (the shared memory hunters are sent to). */
  lastKnown: { x: number; y: number; tick: number } | null;
  /** Story and quest flags, set by effects and read by conditions. */
  flags: Record<string, FlagValue>;
  /** The notebook: every clue the player knows, by clue id. */
  clues: Record<string, NotebookEntry>;
  inventory: { credits: number; items: Record<string, number> };
  /** The wrist band: augments owned and worn, its capacity, and the timers of active augments (AUG-2). */
  augments: AugmentState;
  /** Outstanding loans, and the last in-game day interest was applied. */
  loans: { debts: Loan[]; lastDay: number };
  /** Passes the player holds. Empty means the null state: no record at all (STE-3). */
  passes: Pass[];
  /** Infraction ledger: points drain over time; `level` tracks which threshold has fired. */
  demerits: { points: number; level: 0 | 1 | 2; last: Record<string, number> };
  /** Hidden three-level trust per NPC; absent means 0 (unsure). */
  trust: Record<string, TrustLevel>;
  /** Times the player has been caught and processed. */
  arrestCount: number;
  /** While tick < processingUntil the player is held and cannot act; 0 when free. */
  processingUntil: number;
  /** Items and credits confiscated by processing, recoverable at a locker. */
  locker: { credits: number; items: Record<string, number>; passes: Pass[] };
  /** Terminal progress by terminal id, created the first time a terminal is opened. */
  terminals: Record<string, { rotations: number[]; solved: boolean }>;
  /** The terminal currently being used, if any. While set, the world is frozen like a conversation. */
  terminal: string | null;
  /** Active conversation, if any. While set, the world is frozen (CORE-4). */
  conversation: { dialogueId: string; node: string; /** A line of outcome text (a service result) shown with the current node. */ notice?: string } | null;
  alert: {
    level: AlertLevel;
    /** Tick of the last sighting, raise, or decay step; decay counts out-of-sight time from here. */
    quietSince: number;
    /** Tick of the last sighting-driven raise (for the cooldown). */
    lastRaise: number;
  };
  /** Window flags from the previous tick, used to emit transition events. */
  windows: { curfew: boolean; quietHours: boolean; day: number };
}

export interface NotebookEntry {
  learnedTick: number;
  /** Who or what told the player (an npc id, terminal id, document id, ...). */
  from: string;
  status: ClueStatus;
}

/** `alert`: a robot that cannot chase (Sentry, Checker) has identified the player and is raising the alarm. */
export type RobotMode = "patrol" | "investigate" | "chase" | "search" | "alert";

export interface RobotState {
  id: string;
  kind: RobotKind;
  x: number;
  y: number;
  facing: number;
  mode: RobotMode;
  route: string | null;
  /** Index of the waypoint currently being walked to. */
  routeIndex: number;
  /** Where the robot is heading in investigate/chase/search modes (last known player position). */
  target: { x: number; y: number } | null;
  /** Remaining waypoints (tile centres) to the current goal. */
  path: { x: number; y: number }[];
  /** Tile the current path leads to; used to know when to re-plan. */
  pathGoal: { x: number; y: number } | null;
  /** True once an investigate/search target has been reached and the robot is looking around. */
  arrived: boolean;
  /** Ticks left pausing at a waypoint or looking around. */
  dwell: number;
  dwellTotal: number;
  /** Facing when the look-around began; the sweep oscillates around it. */
  lookBase: number;
  /** 0..1; reaching 1 means the robot has identified the player. */
  suspicion: number;
  /** Whether the player was visible to this robot on the latest tick. */
  sees: boolean;
  /** Where it was posted and which way it faced; robots without a route return here after a search. */
  home: { x: number; y: number; facing: number };
  /** Ticks remaining on a review (Checker) or audit (Auditor) in progress; it notices nothing else meanwhile. */
  busy: number;
  /** Checker: this player has already been scanned during the current stay in view. */
  checked: boolean;
  /** Consecutive ticks the player has been out of sight (resets `checked`). */
  unseenTicks: number;
  /** Hound: already dispatched during the current high-alert episode. */
  dispatched: boolean;
  /** Maintenance robots: the repair job being carried out. */
  task: RepairTask | null;
  /** Tick until which a Burst Jammer has knocked it out (0 = not jammed). */
  jammedUntil: number;
}

export interface RepairTask {
  kind: "camera" | "door";
  targetId: string;
  /** Ticks left working once on site; -1 while still travelling. */
  workLeft: number;
}

export interface CameraState {
  id: string;
  x: number;
  y: number;
  /** The post facing; the view sweeps around it. */
  facing: number;
  /** The current facing after sweeping. */
  heading: number;
  suspicion: number;
  sees: boolean;
  broken: boolean;
  /** Tick it was disabled (for the repair delay). */
  brokenAt: number;
  /** A maintenance robot is already on its way. */
  claimed: boolean;
  /** Tick before which it cannot raise another alarm. */
  quietUntil: number;
  /** Tick until which a Burst Jammer has knocked it out (0 = not jammed). */
  jammedUntil: number;
}

/** An alert on its way to a robot (comms latency). */
export interface PendingAlert {
  to: string;
  from: string;
  x: number;
  y: number;
  deliverTick: number;
}

export function createCameraState(c: CameraDef): CameraState {
  return {
    id: c.id, x: c.x + 0.5, y: c.y + 0.5, facing: c.facing, heading: c.facing, suspicion: 0, sees: false,
    broken: false, brokenAt: 0, claimed: false, quietUntil: 0, jammedUntil: 0,
  };
}

export function createRobotState(r: RobotDef): RobotState {
  return {
    id: r.id, kind: r.kind, x: r.x, y: r.y, facing: r.facing, mode: "patrol", route: r.route, routeIndex: 0,
    target: null, path: [], pathGoal: null, arrived: false, dwell: 0, dwellTotal: 0, lookBase: r.facing,
    suspicion: 0, sees: false, home: { x: r.x, y: r.y, facing: r.facing }, busy: 0, checked: false, unseenTicks: 0, dispatched: false, task: null, jammedUntil: 0,
  };
}

export function createInitialState(seed: number, config: Config, world: World = OPEN_WORLD): SimState {
  const t = gameTimeAt(0, config);
  const start = spawnPoint(world, "start");
  const x = start?.x ?? 0;
  const y = start?.y ?? 0;
  return {
    version: STATE_VERSION,
    seed: seed >>> 0,
    tick: 0,
    rngState: seed >>> 0,
    player: {
      x,
      y,
      intent: { dx: 0, dy: 0, mode: "walk" },
      zone: zoneAt(world, Math.floor(x), Math.floor(y))?.id ?? null,
    },
    doors: initialDoorStates(world),
    robots: world.robots.map(createRobotState),
    cameras: world.cameras.map(createCameraState),
    messages: [],
    lastKnown: null,
    flags: {},
    clues: {},
    inventory: { credits: 0, items: {} },
    loans: { debts: [], lastDay: t.day },
    augments: {
      owned: [], equipped: [], slots: config.band.slots, powerBudget: config.band.powerBudget,
      spoofUntil: 0, spoofReadyAt: 0, jamReadyAt: 0,
    },
    passes: [],
    demerits: { points: 0, level: 0 as const, last: {} },
    trust: {},
    arrestCount: 0,
    processingUntil: 0,
    locker: { credits: 0, items: {}, passes: [] },
    terminals: {},
    terminal: null,
    conversation: null,
    alert: { level: 0 as AlertLevel, quietSince: 0, lastRaise: -1_000_000 },
    // Seeded from tick 0 so the starting window state never fires spurious transition events.
    windows: { curfew: t.isCurfew, quietHours: t.isQuietHours, day: t.day },
  };
}
