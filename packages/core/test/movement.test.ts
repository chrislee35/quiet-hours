// covers: CORE-1, CORE-2
import { describe, expect, it } from "vitest";
import { moveWithCollision, overlapsTile } from "../src/index.ts";

const R = 0.3;
/** Solid: tiles with x < 0 or x >= 5 or y < 0 or y >= 5, i.e. a 5x5 room. */
const room = (tx: number, ty: number) => tx < 0 || ty < 0 || tx >= 5 || ty >= 5;

describe("moveWithCollision", () => {
  it("moves freely in open space", () => {
    expect(moveWithCollision({ x: 2.5, y: 2.5 }, 0.1, -0.05, R, room)).toEqual({ x: 2.6, y: 2.45 });
  });

  it("stops flush against a wall on each side", () => {
    const right = moveWithCollision({ x: 4.6, y: 2.5 }, 0.5, 0, R, room);
    expect(right.x).toBeCloseTo(5 - R, 4);
    expect(right.x).toBeLessThanOrEqual(5 - R);
    const left = moveWithCollision({ x: 0.4, y: 2.5 }, -0.5, 0, R, room);
    expect(left.x).toBeCloseTo(R, 4);
    expect(left.x).toBeGreaterThanOrEqual(R);
    const down = moveWithCollision({ x: 2.5, y: 4.6 }, 0, 0.5, R, room);
    expect(down.y).toBeCloseTo(5 - R, 4);
    const up = moveWithCollision({ x: 2.5, y: 0.4 }, 0, -0.5, R, room);
    expect(up.y).toBeCloseTo(R, 4);
  });

  it("slides along a wall when moving diagonally into it", () => {
    const p = moveWithCollision({ x: 4.69, y: 2.5 }, 0.1, 0.1, R, room);
    expect(p.x).toBeCloseTo(5 - R, 4);
    expect(p.y).toBeCloseTo(2.6, 5);
  });

  it("does not stick in corners and never ends inside a wall", () => {
    let p = { x: 4.0, y: 4.0 };
    for (let i = 0; i < 200; i++) p = moveWithCollision(p, 0.16, 0.16, R, room);
    expect(p.x).toBeLessThanOrEqual(5 - R);
    expect(p.y).toBeLessThanOrEqual(5 - R);
    expect(p.x).toBeGreaterThan(4.6);
    expect(p.y).toBeGreaterThan(4.6);
  });

  it("squeezes through a one-tile gap but not a gap narrower than the hitbox", () => {
    // Wall column at x=2 with a one-tile gap at y=2.
    const gap = (tx: number, ty: number) => room(tx, ty) || (tx === 2 && ty !== 2);
    let p = { x: 1.5, y: 2.5 };
    for (let i = 0; i < 30; i++) p = moveWithCollision(p, 0.1, 0, R, gap);
    expect(p.x).toBeGreaterThan(3);
    // Centred on the wall between y=1 (wall at x=2) and y=2: hitbox half-size 0.3 straddles the wall row.
    let q = { x: 1.5, y: 2.05 };
    for (let i = 0; i < 30; i++) q = moveWithCollision(q, 0.1, 0, R, gap);
    expect(q.x).toBeLessThan(2);
  });

  it("cannot tunnel at the maximum per-tick speed", () => {
    // Run speed 5 tiles/s at 30 ticks/s is ~0.1667/tick; a one-tile wall must still hold.
    const wall = (tx: number, ty: number) => room(tx, ty) || tx === 3;
    let p = { x: 1.5, y: 2.5 };
    for (let i = 0; i < 100; i++) p = moveWithCollision(p, 5 / 30, 0, R, wall);
    expect(p.x).toBeLessThan(3 - R + 1e-3);
  });

  it("does not move when already blocked", () => {
    const p = moveWithCollision({ x: 5 - R - 1e-6, y: 2.5 }, 0.1, 0, R, room);
    expect(p.x).toBeCloseTo(5 - R, 4);
  });
});

describe("overlapsTile", () => {
  it("detects hitbox overlap with a tile", () => {
    expect(overlapsTile({ x: 2.5, y: 2.5 }, R, 2, 2)).toBe(true);
    expect(overlapsTile({ x: 3.35, y: 2.5 }, R, 2, 2)).toBe(false);
    expect(overlapsTile({ x: 3.35, y: 2.5 }, R, 3, 2)).toBe(true);
  });
});
