// covers: ROB-1
import { describe, expect, it } from "vitest";
import { angleDiff, canSee, lineOfSight } from "../src/index.ts";

const open = () => false;
const wallAt = (x: number, y: number) => (tx: number, ty: number) => tx === x && ty === y;

describe("lineOfSight", () => {
  it("is clear in open space, any direction", () => {
    expect(lineOfSight(0.5, 0.5, 9.5, 3.5, open)).toBe(true);
    expect(lineOfSight(9.5, 3.5, 0.5, 0.5, open)).toBe(true);
  });
  it("is blocked by a wall on the line, in either direction", () => {
    expect(lineOfSight(0.5, 0.5, 4.5, 0.5, wallAt(2, 0))).toBe(false);
    expect(lineOfSight(4.5, 0.5, 0.5, 0.5, wallAt(2, 0))).toBe(false);
  });
  it("is not blocked by a wall off the line", () => {
    expect(lineOfSight(0.5, 0.5, 4.5, 0.5, wallAt(2, 1))).toBe(true);
  });
  it("same-tile is always visible, and the start tile never blocks", () => {
    expect(lineOfSight(2.2, 2.2, 2.8, 2.8, wallAt(2, 2))).toBe(true);
    expect(lineOfSight(2.5, 0.5, 4.5, 0.5, wallAt(2, 0))).toBe(true);
  });
  it("cannot slip diagonally between two touching walls", () => {
    const corner = (tx: number, ty: number) => (tx === 1 && ty === 0) || (tx === 0 && ty === 1);
    expect(lineOfSight(0.5, 0.5, 1.5, 1.5, corner)).toBe(false);
  });
  it("handles vertical and exact-diagonal rays", () => {
    expect(lineOfSight(1.5, 0.5, 1.5, 6.5, wallAt(1, 3))).toBe(false);
    expect(lineOfSight(0.5, 0.5, 4.5, 4.5, wallAt(2, 2))).toBe(false);
    expect(lineOfSight(0.5, 0.5, 4.5, 4.5, open)).toBe(true);
  });
});

describe("angleDiff", () => {
  it("wraps around", () => {
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(0.2);
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
    expect(angleDiff(7, 7 - 2 * Math.PI)).toBeCloseTo(0);
  });
});

describe("canSee", () => {
  const viewer = { x: 5, y: 5, facing: 0 }; // facing east
  it("sees straight ahead within range, not beyond", () => {
    expect(canSee(viewer, { x: 10.9, y: 5 }, 90, 6, open)).toBe(true);
    expect(canSee(viewer, { x: 11.1, y: 5 }, 90, 6, open)).toBe(false);
  });
  it("respects the cone edges (45 degrees either side for a 90 degree cone)", () => {
    expect(canSee(viewer, { x: 8, y: 5 + 3 * Math.tan((44 * Math.PI) / 180) }, 90, 6, open)).toBe(true);
    expect(canSee(viewer, { x: 8, y: 5 + 3 * Math.tan((46 * Math.PI) / 180) }, 90, 6, open)).toBe(false);
  });
  it("does not see behind itself", () => {
    expect(canSee(viewer, { x: 2, y: 5 }, 90, 6, open)).toBe(false);
  });
  it("is blocked by walls", () => {
    expect(canSee(viewer, { x: 8, y: 5 }, 90, 6, wallAt(6, 5))).toBe(false);
  });
  it("always sees a target on top of it", () => {
    expect(canSee(viewer, { x: 5, y: 5 }, 90, 6, open)).toBe(true);
  });
  it("a shorter range (Checker) sees less far", () => {
    expect(canSee(viewer, { x: 9.5, y: 5 }, 90, 6, open)).toBe(true);
    expect(canSee(viewer, { x: 9.5, y: 5 }, 90, 4, open)).toBe(false);
  });
});
