// covers: CORE-2, STE-1, NFR-5
import { describe, expect, it } from "vitest";
import { WorldError, buildWorld, isSolid, zoneAt, type MapData } from "../src/index.ts";

const base = (over: Partial<MapData> = {}): MapData => ({
  id: "t",
  width: 3,
  height: 2,
  collision: [1, 1, 1, 1, 0, 1],
  zoneGrid: [0, 0, 0, 0, 1, 0],
  zones: [{ id: "lab", requiredPermission: 2 }],
  doors: [],
  spawns: [{ id: "start", x: 1.5, y: 1.5 }],
  robots: [],
  routes: [],
  lockers: [],
  npcs: [],
  ...over,
});

describe("buildWorld", () => {
  it("builds a valid map", () => {
    const w = buildWorld(base());
    expect(w.width).toBe(3);
    expect(zoneAt(w, 1, 1)?.id).toBe("lab");
    expect(zoneAt(w, 0, 0)).toBeNull();
    expect(zoneAt(w, 99, 99)).toBeNull();
  });

  it("reports every problem at once", () => {
    const bad = base({
      collision: [1, 1],
      zoneGrid: [0, 0, 0, 0, 9, 0],
      doors: [],
    });
    expect(() => buildWorld(bad)).toThrow(WorldError);
    try {
      buildWorld(bad);
    } catch (e) {
      expect((e as Error).message).toContain("collision has 2 cells");
    }
  });

  it("rejects bad zone indices, doors in walls, duplicate ids, and bad spawns", () => {
    const msg = (m: MapData) => {
      try {
        buildWorld(m);
        return "";
      } catch (e) {
        return (e as Error).message;
      }
    };
    expect(msg(base({ zoneGrid: [0, 0, 0, 0, 5, 0] }))).toContain("not a valid zone index");
    expect(msg(base({ doors: [{ id: "d", x: 0, y: 0, open: false, locked: false }] }))).toContain("inside a wall");
    expect(msg(base({ doors: [{ id: "d", x: 5, y: 5, open: false, locked: false }] }))).toContain("out of bounds");
    expect(
      msg(
        base({
          collision: [1, 1, 1, 0, 0, 1],
          zoneGrid: [0, 0, 0, 0, 0, 0],
          doors: [
            { id: "d", x: 0, y: 1, open: false, locked: false },
            { id: "d", x: 1, y: 1, open: false, locked: false },
          ],
        }),
      ),
    ).toContain('duplicate door id "d"');
    expect(msg(base({ spawns: [{ id: "start", x: 0.5, y: 0.5 }] }))).toContain("inside a wall");
    expect(msg(base({ zones: [{ id: "a", requiredPermission: 0 }, { id: "a", requiredPermission: 0 }] }))).toContain("duplicate zone id");
  });
});

describe("isSolid", () => {
  const world = buildWorld(
    base({
      collision: [1, 1, 1, 1, 0, 0],
      doors: [{ id: "d", x: 2, y: 1, open: false, locked: false }],
    }),
  );
  it("treats walls and out-of-bounds as solid, floor as open", () => {
    expect(isSolid(world, {}, 0, 0)).toBe(true);
    expect(isSolid(world, {}, 1, 1)).toBe(false);
    expect(isSolid(world, {}, -1, 1)).toBe(true);
    expect(isSolid(world, {}, 3, 1)).toBe(true);
  });
  it("closed doors are solid; open doors are not", () => {
    expect(isSolid(world, { d: { open: false, locked: false } }, 2, 1)).toBe(true);
    expect(isSolid(world, { d: { open: true, locked: false } }, 2, 1)).toBe(false);
  });
});
