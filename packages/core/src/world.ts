import type { RoutineEntry } from "./npcs.ts";
import type { Effect } from "./rules.ts";

/**
 * Static world data (T1.1). A World is immutable level geometry injected into the sim, like Config.
 * Anything that changes during play (door open/closed, locks) lives in SimState instead (DESIGN §3.2).
 * Coordinates are tile units; tile (tx, ty) covers [tx, tx+1) x [ty, ty+1).
 */

/** Serializable level description: what map importers produce and `buildWorld` validates. */
export interface MapData {
  id: string;
  width: number;
  height: number;
  /** Row-major, length width*height. 0 = floor, 1 = wall. */
  collision: number[];
  /** Row-major, length width*height. 0 = no zone, otherwise 1-based index into `zones`. */
  zoneGrid: number[];
  zones: ZoneDef[];
  doors: DoorDef[];
  spawns: SpawnDef[];
  robots: RobotDef[];
  routes: RouteDef[];
  lockers: LockerDef[];
  npcs: NpcDef[];
  terminals: TerminalPlacement[];
  cameras: CameraDef[];
  /** Things lying in the world to pick up. Optional in map data (none by default). */
  pickups?: PickupDef[];
  /** Named points people walk between (see npcs.ts). Optional in map data. */
  spots?: SpotDef[];
}

/**
 * Something to pick up. `grant` names what the player receives: "augment:ID", "item:ID" or "item:ID:COUNT",
 * or "credits:N". Once taken, the flag `picked_<id>` is set and it is gone for good.
 */
export interface PickupDef {
  id: string;
  x: number;
  y: number;
  grant: string;
}

/** The effect a pickup's `grant` string means, or null if it is malformed. */
export function pickupEffect(grant: string): Effect | null {
  const [kind, id, n] = grant.split(":");
  if (!id && kind !== "credits") return null;
  if (kind === "augment" && id && n === undefined) return { grant_augment: id };
  if (kind === "item" && id && (n === undefined || /^[1-9]\d*$/.test(n))) return { add_item: [id, n === undefined ? 1 : Number(n)] };
  if (kind === "credits" && id && /^[1-9]\d*$/.test(id) && n === undefined) return { add_credits: Number(id) };
  return null;
}

/** A named point on the map, used by NPC routines. */
export interface SpotDef {
  id: string;
  x: number;
  y: number;
}

/** A fixed camera. It may be mounted in a wall tile; its view starts from the tile centre. */
export interface CameraDef {
  id: string;
  x: number;
  y: number;
  /** Radians; 0 faces east (+x), pi/2 faces south (+y). */
  facing: number;
  /** "district:key=value": the camera works only while that holds (a power cut blinds it). */
  activeWhen?: string;
}

/** Where a terminal stands; its behaviour lives in content (`TerminalDef`), keyed by the same id. */
export interface TerminalPlacement {
  id: string;
  x: number;
  y: number;
}

/** A person the player can talk to. Standing still in v1; routines come with T2.8. */
export interface NpcDef {
  /** The npc's content id (also the dialogue `npc:` header). */
  id: string;
  x: number;
  y: number;
  /** Conversation (a compiled `.qdl`) started by Interact. */
  dialogue: string;
  /** Daily routine: where they are through the day (see npcs.ts). Without one they stand still. */
  routine?: RoutineEntry[];
}

/** Where items confiscated by processing can be recovered (FAIL-3). */
export interface LockerDef {
  id: string;
  x: number;
  y: number;
}

export type RobotKind = "warden" | "sentry" | "checker" | "hound" | "auditor" | "heavy" | "mender";
export const ROBOT_KINDS: readonly RobotKind[] = ["warden", "sentry", "checker", "hound", "auditor", "heavy", "mender"];

export interface RobotDef {
  id: string;
  kind: RobotKind;
  /** Start position at a tile centre, in tile units. */
  x: number;
  y: number;
  /** Radians; 0 faces east (+x), pi/2 faces south (+y). */
  facing: number;
  /** Patrol route id; a robot without one stands guard. */
  route: string | null;
  /** "district:key=value": the robot exists only while that district state holds (reinforcements, lockdown patrols). */
  activeWhen?: string;
}

export interface RouteDef {
  id: string;
  /** Waypoints at tile centres, visited in order and looped. */
  points: { x: number; y: number }[];
}

export interface ZoneDef {
  id: string;
  /** Pass level needed to be here legitimately (STE-1). 0 = public. */
  requiredPermission: number;
  /** Curfew applies here: being seen out during curfew is an infraction for anyone with a record. */
  curfew?: boolean;
}

export interface DoorDef {
  id: string;
  x: number;
  y: number;
  /** Initial state; may change at runtime. */
  open: boolean;
  locked: boolean;
}

export interface SpawnDef {
  id: string;
  x: number;
  y: number;
}

export interface World {
  id: string;
  /** width/height of 0 means "unbounded open space" (used by tests with no level). */
  width: number;
  height: number;
  wall: Uint8Array;
  zoneGrid: Uint8Array;
  zones: readonly ZoneDef[];
  doors: readonly DoorDef[];
  spawns: readonly SpawnDef[];
  robots: readonly RobotDef[];
  routes: readonly RouteDef[];
  routeById: ReadonlyMap<string, RouteDef>;
  lockers: readonly LockerDef[];
  npcs: readonly NpcDef[];
  terminals: readonly TerminalPlacement[];
  cameras: readonly CameraDef[];
  pickups: readonly PickupDef[];
  spots: readonly SpotDef[];
  spotById: ReadonlyMap<string, SpotDef>;
  doorByTile: ReadonlyMap<number, DoorDef>;
  doorById: ReadonlyMap<string, DoorDef>;
}

export class WorldError extends Error {}

export const OPEN_WORLD: World = {
  id: "open",
  width: 0,
  height: 0,
  wall: new Uint8Array(0),
  zoneGrid: new Uint8Array(0),
  zones: [],
  doors: [],
  spawns: [],
  robots: [],
  routes: [],
  routeById: new Map(),
  lockers: [],
  npcs: [],
  terminals: [],
  cameras: [],
  pickups: [],
  spots: [],
  spotById: new Map(),
  doorByTile: new Map(),
  doorById: new Map(),
};

/** Runtime door state, stored in SimState. */
export interface DoorState {
  open: boolean;
  locked: boolean;
  /** Tick it was unlocked by an effect (set only for doors that began locked); the city re-locks it later. */
  unlockedAt?: number;
}

const tileKey = (w: World, x: number, y: number) => y * w.width + x;

export function inBounds(world: World, tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < world.width && ty < world.height;
}

/** Validates a MapData and builds the lookup structures. Throws WorldError listing every problem. */
export function buildWorld(data: MapData): World {
  const errors: string[] = [];
  const { width, height } = data;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new WorldError(`map "${data.id}": width/height must be positive integers`);
  }
  const cells = width * height;
  if (data.collision.length !== cells) errors.push(`collision has ${data.collision.length} cells, expected ${cells}`);
  if (data.zoneGrid.length !== cells) errors.push(`zoneGrid has ${data.zoneGrid.length} cells, expected ${cells}`);
  if (errors.length > 0) throw new WorldError(`map "${data.id}": ${errors.join("; ")}`);

  const zoneIds = new Set<string>();
  for (const z of data.zones) {
    if (zoneIds.has(z.id)) errors.push(`duplicate zone id "${z.id}"`);
    zoneIds.add(z.id);
  }
  data.zoneGrid.forEach((v, i) => {
    if (!Number.isInteger(v) || v < 0 || v > data.zones.length) errors.push(`zoneGrid[${i}] = ${v} is not a valid zone index`);
  });

  const wall = Uint8Array.from(data.collision, (v) => (v ? 1 : 0));
  const probe = { width, height } as World;
  const doorByTile = new Map<number, DoorDef>();
  const doorById = new Map<string, DoorDef>();
  for (const d of data.doors) {
    const where = `door "${d.id}" at (${d.x}, ${d.y})`;
    if (doorById.has(d.id)) errors.push(`duplicate door id "${d.id}"`);
    if (!inBounds(probe, d.x, d.y)) {
      errors.push(`${where} is out of bounds`);
      continue;
    }
    if (wall[tileKey(probe, d.x, d.y)]) errors.push(`${where} sits inside a wall tile; doors must be on floor tiles`);
    if (doorByTile.has(tileKey(probe, d.x, d.y))) errors.push(`${where} overlaps another door`);
    doorById.set(d.id, d);
    doorByTile.set(tileKey(probe, d.x, d.y), d);
  }

  const spawnIds = new Set<string>();
  for (const s of data.spawns) {
    if (spawnIds.has(s.id)) errors.push(`duplicate spawn id "${s.id}"`);
    spawnIds.add(s.id);
    if (!inBounds(probe, Math.floor(s.x), Math.floor(s.y))) {
      errors.push(`spawn "${s.id}" is out of bounds`);
    } else if (wall[tileKey(probe, Math.floor(s.x), Math.floor(s.y))]) {
      errors.push(`spawn "${s.id}" is inside a wall`);
    }
  }

  const lockerIds = new Set<string>();
  for (const l of data.lockers) {
    if (lockerIds.has(l.id)) errors.push(`duplicate locker id "${l.id}"`);
    lockerIds.add(l.id);
    if (!inBounds(probe, l.x, l.y)) errors.push(`locker "${l.id}" is out of bounds`);
    else if (wall[tileKey(probe, l.x, l.y)]) errors.push(`locker "${l.id}" is inside a wall`);
  }

  const spotIds = new Set<string>();
  for (const sp of data.spots ?? []) {
    if (spotIds.has(sp.id)) errors.push(`duplicate spot id "${sp.id}"`);
    spotIds.add(sp.id);
    if (!inBounds(probe, sp.x, sp.y)) errors.push(`spot "${sp.id}" is out of bounds`);
    else if (wall[tileKey(probe, sp.x, sp.y)]) errors.push(`spot "${sp.id}" is inside a wall`);
  }

  const pickupIds = new Set<string>();
  for (const p of data.pickups ?? []) {
    if (pickupIds.has(p.id)) errors.push(`duplicate pickup id "${p.id}"`);
    pickupIds.add(p.id);
    if (pickupEffect(p.grant) === null) errors.push(`pickup "${p.id}" has an invalid grant "${p.grant}" (expected augment:ID, item:ID[:COUNT] or credits:N)`);
    if (!inBounds(probe, p.x, p.y)) errors.push(`pickup "${p.id}" is out of bounds`);
    else if (wall[tileKey(probe, p.x, p.y)]) errors.push(`pickup "${p.id}" is inside a wall`);
  }

  const cameraIds = new Set<string>();
  for (const cam of data.cameras) {
    if (cameraIds.has(cam.id)) errors.push(`duplicate camera id "${cam.id}"`);
    cameraIds.add(cam.id);
    if (!inBounds(probe, cam.x, cam.y)) errors.push(`camera "${cam.id}" is out of bounds`);
  }

  const terminalIds = new Set<string>();
  for (const t of data.terminals) {
    if (terminalIds.has(t.id)) errors.push(`duplicate terminal id "${t.id}"`);
    terminalIds.add(t.id);
    if (!inBounds(probe, t.x, t.y)) errors.push(`terminal "${t.id}" is out of bounds`);
    else if (wall[tileKey(probe, t.x, t.y)]) errors.push(`terminal "${t.id}" is inside a wall`);
  }

  const npcIds = new Set<string>();
  for (const n of data.npcs) {
    if (npcIds.has(n.id)) errors.push(`duplicate npc id "${n.id}"`);
    npcIds.add(n.id);
    if (!inBounds(probe, n.x, n.y)) errors.push(`npc "${n.id}" is out of bounds`);
    else if (wall[tileKey(probe, n.x, n.y)]) errors.push(`npc "${n.id}" is inside a wall`);
    if (n.dialogue === "") errors.push(`npc "${n.id}" needs a dialogue`);
    for (const e of n.routine ?? []) {
      if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(e.at)) errors.push(`npc "${n.id}" routine has a bad time "${e.at}" (expected HH:MM)`);
      if (e.spot !== "away" && !(data.spots ?? []).some((s) => s.id === e.spot)) errors.push(`npc "${n.id}" routine goes to unknown spot "${e.spot}"`);
    }
  }

  const routeById = new Map<string, RouteDef>();
  for (const r of data.routes) {
    if (routeById.has(r.id)) errors.push(`duplicate route id "${r.id}"`);
    routeById.set(r.id, r);
    if (r.points.length < 2) errors.push(`route "${r.id}" needs at least 2 waypoints`);
    for (const pt of r.points) {
      const tx = Math.floor(pt.x);
      const ty = Math.floor(pt.y);
      if (!inBounds(probe, tx, ty)) errors.push(`route "${r.id}" waypoint (${pt.x}, ${pt.y}) is out of bounds`);
      else if (wall[tileKey(probe, tx, ty)]) errors.push(`route "${r.id}" waypoint (${pt.x}, ${pt.y}) is inside a wall`);
    }
  }
  const robotIds = new Set<string>();
  for (const r of data.robots) {
    if (robotIds.has(r.id)) errors.push(`duplicate robot id "${r.id}"`);
    robotIds.add(r.id);
    if (!ROBOT_KINDS.includes(r.kind)) errors.push(`robot "${r.id}" has unknown kind "${String(r.kind)}"`);
    const tx = Math.floor(r.x);
    const ty = Math.floor(r.y);
    if (!inBounds(probe, tx, ty)) errors.push(`robot "${r.id}" is out of bounds`);
    else if (wall[tileKey(probe, tx, ty)]) errors.push(`robot "${r.id}" is inside a wall`);
    if (r.route !== null && !routeById.has(r.route)) errors.push(`robot "${r.id}" uses unknown route "${r.route}"`);
  }

  if (errors.length > 0) throw new WorldError(`map "${data.id}": ${errors.join("; ")}`);
  return {
    id: data.id,
    width,
    height,
    wall,
    zoneGrid: Uint8Array.from(data.zoneGrid),
    zones: data.zones,
    doors: data.doors,
    spawns: data.spawns,
    robots: data.robots,
    routes: data.routes,
    routeById,
    lockers: data.lockers,
    npcs: data.npcs,
    terminals: data.terminals,
    cameras: data.cameras,
    pickups: data.pickups ?? [],
    spots: data.spots ?? [],
    spotById: new Map((data.spots ?? []).map((s) => [s.id, s])),
    doorByTile,
    doorById,
  };
}

/** True if the tile blocks movement: outside a bounded map, a wall, or a currently closed door. */
export function isSolid(world: World, doors: Readonly<Record<string, DoorState>>, tx: number, ty: number): boolean {
  if (world.width === 0) return false;
  if (!inBounds(world, tx, ty)) return true;
  const k = tileKey(world, tx, ty);
  if (world.wall[k]) return true;
  const door = world.doorByTile.get(k);
  return door !== undefined && doors[door.id]?.open === false;
}

export function zoneAt(world: World, tx: number, ty: number): ZoneDef | null {
  if (!inBounds(world, tx, ty)) return null;
  const idx = world.zoneGrid[tileKey(world, tx, ty)] ?? 0;
  return idx === 0 ? null : (world.zones[idx - 1] ?? null);
}

export function initialDoorStates(world: World): Record<string, DoorState> {
  const out: Record<string, DoorState> = {};
  for (const d of world.doors) out[d.id] = { open: d.open, locked: d.locked };
  return out;
}

export function spawnPoint(world: World, id: string): SpawnDef | undefined {
  return world.spawns.find((s) => s.id === id);
}
