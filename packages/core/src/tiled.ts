import type { DoorDef, MapData, SpawnDef, ZoneDef } from "./world.ts";

/**
 * Importer for maps authored in Tiled (https://www.mapeditor.org/), exported as JSON.
 * Pure data transform, so it lives in core and runs in both the client and the tooling.
 *
 * Authoring conventions (see docs/maps.md):
 *  - Tile layer "collision": any non-zero tile is a wall.
 *  - Object layer "zones": rectangles with custom properties `zone` (string id) and
 *    `permission` (int, default 0). Later rectangles overwrite earlier ones.
 *  - Object layer "objects": points or rectangles whose Class/Type is "door" or "spawn",
 *    named with the entity id. Doors take bool properties `open` and `locked` (default false).
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
    let idx = zones.findIndex((z) => z.id === zid);
    if (idx === -1) {
      zones.push({ id: zid, requiredPermission: permission });
      idx = zones.length - 1;
    } else if (zones[idx]!.requiredPermission !== permission) {
      errors.push(`zone "${zid}" is given conflicting permissions`);
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
  for (const o of layer("objects", "objectgroup")?.objects ?? []) {
    const kind = o.class ?? o.type ?? "";
    const oid = o.name ?? "";
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
    } else {
      errors.push(`object "${oid}" has unknown class "${kind}" (expected door or spawn)`);
    }
  }

  if (errors.length > 0) throw new TiledImportError(`map "${id}": ${errors.join("; ")}`);
  return { id, width, height, collision, zoneGrid, zones, doors, spawns };
}
