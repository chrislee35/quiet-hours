import { ROBOT_KINDS, type PlaceDef, type SpotDef, type PickupDef, type DoorDef, type LockerDef, type MapData, type NpcDef, type TerminalPlacement, type CameraDef, type RobotDef, type RobotKind, type RouteDef, type SpawnDef, type ZoneDef } from "./world.ts";

/**
 * Importer for maps authored in Tiled (https://www.mapeditor.org/), exported as JSON.
 * Pure data transform, so it lives in core and runs in both the client and the tooling.
 *
 * Authoring conventions (see docs/maps.md):
 *  - Tile layer "collision": any non-zero tile is a wall.
 *  - Object layer "zones": rectangles with custom properties `zone` (string id),
 *    `permission` (int, default 0), `curfew` (bool, default false) and `safe` (bool: manual saving always allowed). Later rectangles overwrite earlier ones.
 *  - Object layer "objects": points or rectangles whose Class/Type is "door" or "spawn",
 *    named with the entity id. Doors take bool properties `open` and `locked` (default false).
 *    Class "npc": a person to talk to; Name is the npc id, string property `dialogue` is the conversation id.
 *    An npc may have a string `routine`: "06:00=spot_a,12:00=spot_b,22:00=away" (see npcs.ts).
 *    Class "terminal": a hackable terminal; Name is the terminal id (defined in content/terminals).
 *    Class "camera": a fixed camera; Name is its id, number property `facing` in degrees (like robots).
 *    Class "pickup": something lying around; Name is its id, string property `grant` is what it gives
 *    ("augment:ID", "item:ID[:COUNT]" or "credits:N").
 *    Robots and cameras may have a string `activeWhen` ("district:key=value"): they exist only while it holds.
 *    Class "spot": a named point (Name is its id) that NPC routines send people to.
 *    Class "place": a named place (Name is its id, string `label` its display name) shown on the notebook map once a
 *    clue tagged `place:<id>` is known.
 *    Class "locker": where confiscated items are recovered after processing.
 *    Class "robot": string `kind` (default "warden"), number `facing` in degrees (0 = east, 90 = south,
 *    default 0), optional string `route`. Class "waypoint": string `route`, number `order` (default:
 *    creation order); waypoints snap to tile centres and each route needs at least two.
 *  - Positions are pixels; they are divided by tilewidth/tileheight. Maps must be orthogonal.
 */

export class TiledImportError extends Error {}

interface TiledProperty {
  name: string;
  value: unknown;
}
interface TiledObject {
  name?: string;
  type?: string;
  class?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  properties?: TiledProperty[];
}
interface TiledLayer {
  name: string;
  type: string;
  data?: number[];
  objects?: TiledObject[];
}
interface TiledMap {
  orientation?: string;
  infinite?: boolean;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
}

function prop(obj: TiledObject, name: string): unknown {
  return obj.properties?.find((p) => p.name === name)?.value;
}

function asRecord(v: unknown): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new TiledImportError("map JSON must be an object");
  return v as Record<string, unknown>;
}

export function importTiled(raw: unknown, id: string): MapData {
  const m = asRecord(raw) as unknown as TiledMap;
  const errors: string[] = [];
  if (m.orientation !== undefined && m.orientation !== "orthogonal") errors.push(`orientation "${m.orientation}" unsupported; use orthogonal`);
  if (m.infinite) errors.push("infinite maps are unsupported; use a fixed-size map");
  if (![m.width, m.height, m.tilewidth, m.tileheight].every((n) => Number.isInteger(n) && n > 0)) {
    errors.push("width, height, tilewidth, tileheight must be positive integers");
  }
  if (!Array.isArray(m.layers)) errors.push("missing layers array");
  if (errors.length > 0) throw new TiledImportError(`map "${id}": ${errors.join("; ")}`);

  const { width, height, tilewidth, tileheight } = m;
  const layer = (name: string, type: string) => m.layers.find((l) => l.name === name && l.type === type);

  const collisionLayer = layer("collision", "tilelayer");
  if (!collisionLayer?.data) throw new TiledImportError(`map "${id}": missing tile layer "collision"`);
  const collision = collisionLayer.data.map((gid) => (gid !== 0 ? 1 : 0));

  const zones: ZoneDef[] = [];
  const zoneGrid: number[] = new Array<number>(width * height).fill(0);
  for (const o of layer("zones", "objectgroup")?.objects ?? []) {
    const zid = prop(o, "zone");
    if (typeof zid !== "string" || zid === "") {
      errors.push(`zone rectangle at pixel (${o.x}, ${o.y}) has no string property "zone"`);
      continue;
    }
    const permission = prop(o, "permission") ?? 0;
    if (typeof permission !== "number") {
      errors.push(`zone "${zid}": "permission" must be a number`);
      continue;
    }
    const curfew = prop(o, "curfew") === true;
    const safe = prop(o, "safe") === true;
    let idx = zones.findIndex((z) => z.id === zid);
    if (idx === -1) {
      zones.push({ id: zid, requiredPermission: permission, ...(curfew ? { curfew: true } : {}), ...(safe ? { safe: true } : {}) });
      idx = zones.length - 1;
    } else if (zones[idx]!.requiredPermission !== permission || (zones[idx]!.curfew === true) !== curfew || (zones[idx]!.safe === true) !== safe) {
      errors.push(`zone "${zid}" is given conflicting permissions or curfew settings`);
    }
    const x0 = Math.floor(o.x / tilewidth);
    const y0 = Math.floor(o.y / tileheight);
    const x1 = Math.ceil((o.x + (o.width ?? 0)) / tilewidth);
    const y1 = Math.ceil((o.y + (o.height ?? 0)) / tileheight);
    for (let ty = Math.max(0, y0); ty < Math.min(height, y1); ty++) {
      for (let tx = Math.max(0, x0); tx < Math.min(width, x1); tx++) zoneGrid[ty * width + tx] = idx + 1;
    }
  }

  const doors: DoorDef[] = [];
  const spawns: SpawnDef[] = [];
  const robots: RobotDef[] = [];
  const lockers: LockerDef[] = [];
  const npcs: NpcDef[] = [];
  const terminals: TerminalPlacement[] = [];
  const cameras: CameraDef[] = [];
  const pickups: PickupDef[] = [];
  const spots: SpotDef[] = [];
  const places: PlaceDef[] = [];
  const waypoints = new Map<string, { order: number; seq: number; x: number; y: number }[]>();
  let seq = 0;
  for (const o of layer("objects", "objectgroup")?.objects ?? []) {
    const kind = o.class ?? o.type ?? "";
    const oid = o.name ?? "";
    if (kind === "waypoint") {
      const route = prop(o, "route");
      if (typeof route !== "string" || route === "") {
        errors.push(`waypoint at pixel (${o.x}, ${o.y}) has no string property "route"`);
        continue;
      }
      const order = prop(o, "order");
      const list = waypoints.get(route) ?? [];
      list.push({
        order: typeof order === "number" ? order : Number.MAX_SAFE_INTEGER,
        seq: seq++,
        x: Math.floor(o.x / tilewidth) + 0.5,
        y: Math.floor(o.y / tileheight) + 0.5,
      });
      waypoints.set(route, list);
      continue;
    }
    if (oid === "") {
      errors.push(`${kind || "object"} at pixel (${o.x}, ${o.y}) needs a name (its id)`);
      continue;
    }
    const tx = Math.floor(o.x / tilewidth);
    const ty = Math.floor(o.y / tileheight);
    if (kind === "door") {
      doors.push({ id: oid, x: tx, y: ty, open: prop(o, "open") === true, locked: prop(o, "locked") === true });
    } else if (kind === "spawn") {
      // Spawns stand at the centre of their tile.
      spawns.push({ id: oid, x: tx + 0.5, y: ty + 0.5 });
    } else if (kind === "npc") {
      const dlg = prop(o, "dialogue");
      if (typeof dlg !== "string" || dlg === "") {
        errors.push(`npc "${oid}" needs a string property "dialogue"`);
        continue;
      }
      const routineText = prop(o, "routine");
      const routine =
        typeof routineText === "string" && routineText !== ""
          ? routineText.split(",").map((part) => {
              const [at, spot] = part.trim().split("=");
              return { at: at ?? "", spot: spot ?? "" };
            })
          : undefined;
      npcs.push({ id: oid, x: tx, y: ty, dialogue: dlg, ...(routine ? { routine } : {}) });
    } else if (kind === "camera") {
      const degrees = prop(o, "facing");
      const when = prop(o, "activeWhen");
      cameras.push({ id: oid, x: tx, y: ty, facing: ((typeof degrees === "number" ? degrees : 0) * Math.PI) / 180, ...(typeof when === "string" ? { activeWhen: when } : {}) });
    } else if (kind === "place") {
      const label = prop(o, "label");
      places.push({ id: oid, x: tx, y: ty, label: typeof label === "string" && label !== "" ? label : oid.replace(/_/g, " ") });
    } else if (kind === "spot") {
      spots.push({ id: oid, x: tx, y: ty });
    } else if (kind === "pickup") {
      const grant = prop(o, "grant");
      if (typeof grant !== "string") {
        errors.push(`pickup "${oid}" needs a string property "grant"`);
        continue;
      }
      pickups.push({ id: oid, x: tx, y: ty, grant });
    } else if (kind === "terminal") {
      terminals.push({ id: oid, x: tx, y: ty });
    } else if (kind === "locker") {
      lockers.push({ id: oid, x: tx, y: ty });
    } else if (kind === "robot") {
      const rk = prop(o, "kind") ?? "warden";
      if (typeof rk !== "string" || !ROBOT_KINDS.includes(rk as RobotKind)) {
        errors.push(`robot "${oid}" has unknown kind "${String(rk)}"`);
        continue;
      }
      const degrees = prop(o, "facing");
      const route = prop(o, "route");
      robots.push({
        id: oid,
        kind: rk as RobotKind,
        x: tx + 0.5,
        y: ty + 0.5,
        facing: ((typeof degrees === "number" ? degrees : 0) * Math.PI) / 180,
        route: typeof route === "string" && route !== "" ? route : null,
        ...(typeof prop(o, "activeWhen") === "string" ? { activeWhen: prop(o, "activeWhen") as string } : {}),
      });
    } else {
      errors.push(`object "${oid}" has unknown class "${kind}" (expected door, spawn, locker, npc, terminal, camera, pickup, spot, place, robot or waypoint)`);
    }
  }

  const routes: RouteDef[] = [...waypoints.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([rid, pts]) => ({
      id: rid,
      points: pts.sort((a, b) => a.order - b.order || a.seq - b.seq).map(({ x, y }) => ({ x, y })),
    }));

  if (errors.length > 0) throw new TiledImportError(`map "${id}": ${errors.join("; ")}`);
  return { id, width, height, collision, zoneGrid, zones, doors, spawns, robots, routes, lockers, npcs, terminals, cameras, pickups, spots, places };
}
