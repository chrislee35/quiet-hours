import { buildWorld, type DoorDef, type LockerDef, type MapData, type NpcDef, type TerminalPlacement, type RobotDef, type RouteDef, type SpawnDef, type World, type ZoneDef } from "@qh/core";

export interface AsciiZone extends ZoneDef {
  /** Tile rectangle (inclusive-exclusive): x, y, width, height. */
  rect: [x: number, y: number, w: number, h: number];
}

/**
 * Build a tiny World from ASCII art for scenarios.
 *   #  wall        .  floor        S  spawn "start"    H  spawn "holding"    K  locker (locker_<x>_<y>)
 *   D  closed door  O  open door    L  locked door
 * Doors are named door_<x>_<y>. Robots and patrol routes are passed in `extras` (tile-centre coordinates). Zones are painted from rectangles, later ones overwriting earlier ones.
 */
export function asciiWorld(
  rows: string[],
  zones: AsciiZone[] = [],
  extras: { id?: string; robots?: RobotDef[]; routes?: RouteDef[]; npcs?: NpcDef[]; terminals?: TerminalPlacement[] } = {},
): World {
  const id = extras.id ?? "ascii";
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const collision: number[] = [];
  const doors: DoorDef[] = [];
  const spawns: SpawnDef[] = [];
  const lockers: LockerDef[] = [];
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`ascii row ${y} has width ${row.length}, expected ${width}`);
    [...row].forEach((ch, x) => {
      collision.push(ch === "#" ? 1 : 0);
      if (ch === "D" || ch === "O" || ch === "L") {
        doors.push({ id: `door_${x}_${y}`, x, y, open: ch === "O", locked: ch === "L" });
      } else if (ch === "S") {
        spawns.push({ id: "start", x: x + 0.5, y: y + 0.5 });
      } else if (ch === "H") {
        spawns.push({ id: "holding", x: x + 0.5, y: y + 0.5 });
      } else if (ch === "K") {
        lockers.push({ id: `locker_${x}_${y}`, x, y });
      } else if (ch !== "#" && ch !== ".") {
        throw new Error(`unknown ascii map character "${ch}" at (${x}, ${y})`);
      }
    });
  });
  const zoneGrid = new Array<number>(width * height).fill(0);
  zones.forEach((z, i) => {
    const [x0, y0, w, h] = z.rect;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) zoneGrid[y * width + x] = i + 1;
  });
  const data: MapData = {
    id,
    width,
    height,
    collision,
    zoneGrid,
    zones: zones.map(({ id: zid, requiredPermission, curfew }) => ({ id: zid, requiredPermission, ...(curfew ? { curfew } : {}) })),
    doors,
    spawns,
    robots: extras.robots ?? [],
    routes: extras.routes ?? [],
    lockers,
    npcs: extras.npcs ?? [],
    terminals: extras.terminals ?? [],
  };
  return buildWorld(data);
}
