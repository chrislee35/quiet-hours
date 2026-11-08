import { gameTimeAt } from "./clock.ts";
import type { Config } from "./config.ts";
import type { AlertLevel, ClueStatus, FlagValue, MoveMode, TrustLevel } from "./events.ts";
import { initialDoorStates, OPEN_WORLD, spawnPoint, zoneAt, type DoorState, type World } from "./world.ts";

export const STATE_VERSION = 1;

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
  /** Story and quest flags, set by effects and read by conditions. */
  flags: Record<string, FlagValue>;
  /** The notebook: every clue the player knows, by clue id. */
  clues: Record<string, NotebookEntry>;
  inventory: { credits: number; items: Record<string, number> };
  /** Hidden three-level trust per NPC; absent means 0 (unsure). */
  trust: Record<string, TrustLevel>;
  /** Times the player has been caught and processed. */
  arrestCount: number;
  /** While tick < processingUntil the player is held and cannot act; 0 when free. */
  processingUntil: number;
  /** Items and credits confiscated by processing, recoverable at a locker. */
  locker: { credits: number; items: Record<string, number> };
  /** Active conversation, if any. While set, the world is frozen (CORE-4). */
  conversation: { dialogueId: string; node: string } | null;
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

export type RobotMode = "patrol" | "investigate" | "chase" | "search";

export interface RobotState {
  id: string;
  kind: "warden";
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
    robots: world.robots.map((r) => ({
      id: r.id,
      kind: r.kind,
      x: r.x,
      y: r.y,
      facing: r.facing,
      mode: "patrol" as const,
      route: r.route,
      routeIndex: 0,
      target: null,
      path: [],
      pathGoal: null,
      arrived: false,
      dwell: 0,
      dwellTotal: 0,
      lookBase: r.facing,
      suspicion: 0,
      sees: false,
    })),
    flags: {},
    clues: {},
    inventory: { credits: 0, items: {} },
    trust: {},
    arrestCount: 0,
    processingUntil: 0,
    locker: { credits: 0, items: {} },
    conversation: null,
    alert: { level: 0 as AlertLevel, quietSince: 0, lastRaise: -1_000_000 },
    // Seeded from tick 0 so the starting window state never fires spurious transition events.
    windows: { curfew: t.isCurfew, quietHours: t.isQuietHours, day: t.day },
  };
}
