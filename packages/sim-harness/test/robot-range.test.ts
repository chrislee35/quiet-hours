import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildWorld, importTiled } from "@qh/core";

const read = (p: string) => readFileSync(new URL(`../../../content/${p}`, import.meta.url), "utf8");

describe("robot test range map", () => {
  it("loads and holds one of every robot kind, with a camera", () => {
    const world = buildWorld(importTiled(JSON.parse(read("maps/robot_range.json")), "robot_range"));
    const kinds = world.robots.map((r) => r.kind).sort();
    expect(kinds).toEqual(["auditor", "checker", "heavy", "hound", "mender", "sentry"]);
    expect(world.cameras.length).toBe(1);
    expect(world.pickups.filter((p) => p.grant.startsWith("augment:")).length).toBe(6);
  });
});
