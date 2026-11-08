// covers: ROB-1, ROB-3
import { describe, expect, it } from "vitest";
import { findPath } from "../src/index.ts";

/** Build a passable() from ASCII where '#' is a wall. */
function grid(rows: string[]) {
  return {
    w: rows[0]!.length,
    h: rows.length,
    passable: (x: number, y: number) => rows[y]?.[x] === ".",
  };
}

describe("findPath", () => {
  it("returns an empty path when already at the goal", () => {
    const g = grid(["..."]);
    expect(findPath(g.w, g.h, { x: 1, y: 0 }, { x: 1, y: 0 }, g.passable)).toEqual([]);
  });

  it("finds a straight line, excluding the start and including the goal", () => {
    const g = grid(["....."]);
    expect(findPath(g.w, g.h, { x: 0, y: 0 }, { x: 4, y: 0 }, g.passable)).toEqual([
      { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 },
    ]);
  });

  it("routes around a wall and returns null when unreachable or the goal is blocked", () => {
    const g = grid([".....", ".###.", "....."]);
    const path = findPath(g.w, g.h, { x: 0, y: 1 }, { x: 4, y: 1 }, g.passable)!;
    expect(path.at(-1)).toEqual({ x: 4, y: 1 });
    expect(path.every((p) => g.passable(p.x, p.y))).toBe(true);

    const sealed = grid([".#.", ".#."]);
    expect(findPath(sealed.w, sealed.h, { x: 0, y: 0 }, { x: 2, y: 0 }, sealed.passable)).toBeNull();
    expect(findPath(sealed.w, sealed.h, { x: 0, y: 0 }, { x: 1, y: 0 }, sealed.passable)).toBeNull();
  });

  it("does not cut corners diagonally between two walls", () => {
    const g = grid([".#", "#."]);
    expect(findPath(g.w, g.h, { x: 0, y: 0 }, { x: 1, y: 1 }, g.passable)).toBeNull();
  });

  it("uses diagonals when open (shorter than Manhattan) and is deterministic", () => {
    const g = grid(["....", "....", "...."]);
    const a = findPath(g.w, g.h, { x: 0, y: 0 }, { x: 3, y: 2 }, g.passable)!;
    expect(a).toHaveLength(3);
    expect(findPath(g.w, g.h, { x: 0, y: 0 }, { x: 3, y: 2 }, g.passable)).toEqual(a);
  });

  it("gives up cleanly at the node limit", () => {
    const g = grid(Array.from({ length: 30 }, () => ".".repeat(30)));
    expect(findPath(g.w, g.h, { x: 0, y: 0 }, { x: 29, y: 29 }, g.passable, 5)).toBeNull();
  });
});
