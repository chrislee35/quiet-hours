// covers: PUZ-1 (more than one way through), ROB-1, STE-4. Guards the vertical slice against becoming
// impossible again (it once was: see TASKS T1.13 notes). Uses the shipped map and tuning.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildWorld, importTiled, Sim } from "@qh/core";
import { successRate, type RouteStep } from "../src/index.ts";
import { config } from "./helpers.ts";

const read = (rel: string) => readFileSync(new URL(`../../../content/${rel}`, import.meta.url), "utf8");
const world = buildWorld(importTiled(JSON.parse(read("maps/stacks_slice.json")), "stacks_slice"));
const spawn = world.spawns.find((s) => s.id === "start")!;
const start: [number, number] = [spawn.x, spawn.y];

/** Careful route: up the west room, through the north door, across to the terminal room. */
const north: RouteStep[] = [start, [6.6, 3.5], "use", [8.5, 3.5], [13.5, 3.5]];
/** Bold route: straight east along the guarded corridor to the east door. */
const corridor: RouteStep[] = [start, [14.3, 7.5]];

describe("the slice is fair", () => {
  it("the player can stand still at the start for a minute without being found", () => {
    const sim = new Sim(config, 1, { world });
    let spotted = false;
    for (let t = 0; t < 60 * config.sim.ticksPerSecond; t++) spotted ||= sim.tick().some((e) => e.type === "RobotSpotted");
    expect(spotted).toBe(false);
  });

  it("the careful route is usually passable when sneaking, and always has a safe window", () => {
    expect(successRate(config, world, north, "sneak")).toBeGreaterThanOrEqual(70);
  });

  it("the careful route is riskier when running (noise draws the Warden)", () => {
    expect(successRate(config, world, north, "run")).toBeLessThan(successRate(config, world, north, "sneak"));
  });

  it("the bold corridor route is a real gamble: possible when sneaking, hopeless when running", () => {
    const sneak = successRate(config, world, corridor, "sneak");
    expect(sneak).toBeGreaterThanOrEqual(25);
    expect(sneak).toBeLessThanOrEqual(85);
    expect(successRate(config, world, corridor, "walk")).toBeLessThan(sneak);
    expect(successRate(config, world, corridor, "run")).toBeLessThanOrEqual(10);
  });
});
