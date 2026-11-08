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

  it("imports robots and waypoint routes, snapping to tile centres and sorting by order", () => {
    const m = tiled();
    (m.layers[2] as { objects: unknown[] }).objects.push(
      { name: "w1", class: "robot", x: 32, y: 32, properties: [{ name: "facing", value: 90 }, { name: "route", value: "loop" }] },
      { class: "waypoint", x: 70, y: 40, properties: [{ name: "route", value: "loop" }, { name: "order", value: 2 }] },
      { class: "waypoint", x: 33, y: 33, properties: [{ name: "route", value: "loop" }, { name: "order", value: 1 }] },
    );
    const data = importTiled(m, "m");
    expect(data.robots).toEqual([{ id: "w1", kind: "warden", x: 1.5, y: 1.5, facing: Math.PI / 2, route: "loop" }]);
    expect(data.routes).toEqual([{ id: "loop", points: [{ x: 1.5, y: 1.5 }, { x: 2.5, y: 1.5 }] }]);
    expect(() => buildWorld(data)).not.toThrow();
  });

  it("rejects unknown robot kinds and waypoints without a route", () => {
    const m = tiled();
    (m.layers[2] as { objects: unknown[] }).objects.push(
      { name: "r", class: "robot", x: 32, y: 32, properties: [{ name: "kind", value: "tank" }] },
      { class: "waypoint", x: 0, y: 0 },
    );
    const msg = (() => { try { importTiled(m, "m"); return ""; } catch (e) { return (e as Error).message; } })();
    expect(msg).toContain('unknown kind "tank"');
    expect(msg).toContain('no string property "route"');
  });

  it("world building rejects robots in walls and unknown or too-short routes", () => {
    const m = tiled();
    (m.layers[2] as { objects: unknown[] }).objects.push(
      { name: "r", class: "robot", x: 0, y: 0, properties: [{ name: "route", value: "nowhere" }] },
      { class: "waypoint", x: 32, y: 32, properties: [{ name: "route", value: "short" }] },
    );
    const data = importTiled(m, "m");
    const msg = (() => { try { buildWorld(data); return ""; } catch (e) { return (e as Error).message; } })();
    expect(msg).toContain('robot "r" is inside a wall');
    expect(msg).toContain('unknown route "nowhere"');
    expect(msg).toContain('route "short" needs at least 2 waypoints');
  });

  it("accepts every robot type by name", () => {
    for (const kind of ["warden", "sentry", "checker", "hound", "auditor", "heavy"]) {
      const m = tiled();
      (m.layers[2] as { objects: unknown[] }).objects.push({ name: "r", class: "robot", x: 32, y: 32, properties: [{ name: "kind", value: kind }] });
      expect(importTiled(m, "m").robots[0]!.kind).toBe(kind);
    }
  });
});
