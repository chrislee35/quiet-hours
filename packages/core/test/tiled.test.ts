// covers: CORE-2, STE-1
import { describe, expect, it } from "vitest";
import { TiledImportError, buildWorld, importTiled } from "../src/index.ts";

/** 4x3 map: walls around the border, a door at (2,1), spawn at (1,1), zone "lab" over x>=2. */
const tiled = (over: Record<string, unknown> = {}) => ({
  orientation: "orthogonal",
  width: 4,
  height: 3,
  tilewidth: 32,
  tileheight: 32,
  layers: [
    { name: "collision", type: "tilelayer", data: [1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1] },
    {
      name: "zones",
      type: "objectgroup",
      objects: [
        { x: 0, y: 0, width: 128, height: 96, properties: [{ name: "zone", value: "hall" }] },
        { x: 64, y: 0, width: 64, height: 96, properties: [{ name: "zone", value: "lab" }, { name: "permission", value: 2 }] },
      ],
    },
    {
      name: "objects",
      type: "objectgroup",
      objects: [
        { name: "start", class: "spawn", x: 32, y: 32 },
        { name: "lab_door", class: "door", x: 64, y: 32, properties: [{ name: "locked", value: true }] },
      ],
    },
  ],
  ...over,
});

describe("importTiled", () => {
  it("imports collision, zones (later overwrite earlier), doors and spawns", () => {
    const data = importTiled(tiled(), "m");
    expect(data.collision).toEqual([1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1]);
    expect(data.zones).toEqual([
      { id: "hall", requiredPermission: 0 },
      { id: "lab", requiredPermission: 2 },
    ]);
    expect(data.zoneGrid.slice(0, 4)).toEqual([1, 1, 2, 2]);
    expect(data.doors).toEqual([{ id: "lab_door", x: 2, y: 1, open: false, locked: true }]);
    expect(data.spawns).toEqual([{ id: "start", x: 1.5, y: 1.5 }]);
    expect(() => buildWorld(data)).not.toThrow();
  });

  it("rejects unsupported maps and missing layers with clear messages", () => {
    expect(() => importTiled(tiled({ orientation: "isometric" }), "m")).toThrow(/orthogonal/);
    expect(() => importTiled(tiled({ infinite: true }), "m")).toThrow(/infinite/);
    expect(() => importTiled(tiled({ layers: [] }), "m")).toThrow(/collision/);
    expect(() => importTiled(null, "m")).toThrow(TiledImportError);
  });

  it("collects authoring mistakes in objects", () => {
    const bad = tiled({
      layers: [
        { name: "collision", type: "tilelayer", data: new Array(12).fill(0) },
        { name: "zones", type: "objectgroup", objects: [{ x: 0, y: 0, width: 32, height: 32 }] },
        { name: "objects", type: "objectgroup", objects: [{ class: "door", x: 0, y: 0 }, { name: "x", class: "crate", x: 0, y: 0 }] },
      ],
    });
    try {
      importTiled(bad, "m");
      throw new Error("should have thrown");
    } catch (e) {
      const m = (e as Error).message;
      expect(m).toContain('no string property "zone"');
      expect(m).toContain("needs a name");
      expect(m).toContain('unknown class "crate"');
    }
  });
});
