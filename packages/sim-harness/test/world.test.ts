// covers: CORE-1, CORE-2, CORE-5, STE-1, STE-4
import { describe, expect, it } from "vitest";
import { Scenario, asciiWorld } from "../src/index.ts";
import { config } from "./helpers.ts";

const room = asciiWorld([
  "#######",
  "#S....#",
  "#.....#",
  "#####D#",
  "#.....#",
  "#######",
]);

describe("walls", () => {
  it("player walking into a wall stops at it and makes no noise once stopped", () => {
    const s = new Scenario(config, 1, room).command({ type: "SetMove", dx: 1, dy: 0, mode: "walk" }).advance(4);
    const x = s.sim.state.player.x;
    expect(x).toBeLessThanOrEqual(6 - config.player.radius);
    expect(x).toBeGreaterThan(5.6);
    s.clearEvents().advance(2);
    s.expectNoEvent("NoiseEmitted");
  });

  it("spawns at the 'start' marker", () => {
    new Scenario(config, 1, room).expectPlayerNear(1.5, 1.5);
  });

  it("running is noisy and sliding along a wall still makes noise", () => {
    const s = new Scenario(config, 1, room).command({ type: "SetMove", dx: 1, dy: -1, mode: "run" }).advance(1);
    s.expectEvent("NoiseEmitted", { radius: config.noise.runRadius });
  });
});

describe("doors", () => {
  const goTo = (s: Scenario, x: number, y: number) => s.command({ type: "Teleport", x, y });

  it("a closed door blocks; interacting opens it and the player can pass", () => {
    const s = new Scenario(config, 1, room);
    goTo(s, 5.5, 2.4).command({ type: "SetMove", dx: 0, dy: 1, mode: "walk" }).advance(2);
    expect(s.sim.state.player.y).toBeLessThan(3 - config.player.radius + 1e-3);

    s.command({ type: "SetMove", dx: 0, dy: 0, mode: "walk" }).command({ type: "Interact" });
    s.expectEvent("DoorOpened", { doorId: "door_5_3" });
    s.command({ type: "SetMove", dx: 0, dy: 1, mode: "walk" }).advance(3);
    expect(s.sim.state.player.y).toBeGreaterThan(4);
  });

  it("interact toggles the door closed again, but not on top of the player", () => {
    const s = new Scenario(config, 1, room);
    goTo(s, 5.5, 2.5).command({ type: "Interact" }).command({ type: "Interact" });
    s.expectEvent("DoorClosed", { doorId: "door_5_3" });

    const t = new Scenario(config, 1, room);
    goTo(t, 5.5, 2.5).command({ type: "Interact" });
    goTo(t, 5.5, 3.5).command({ type: "Interact" });
    t.expectEvent("DoorBlocked", { doorId: "door_5_3" });
  });

  it("locked doors refuse to open", () => {
    const locked = asciiWorld(["#####", "#S.L#", "#####"]);
    const s = new Scenario(config, 1, locked);
    s.command({ type: "Teleport", x: 2.5, y: 1.5 }).command({ type: "Interact" });
    s.expectEvent("DoorLocked").expectNoEvent("DoorOpened");
  });

  it("interact does nothing when no door is in reach", () => {
    const s = new Scenario(config, 1, room).command({ type: "Interact" });
    expect(s.events).toEqual([]);
  });

  it("only the nearest door in reach is used", () => {
    const two = asciiWorld(["#####", "#DSD#", "#####"]);
    const s = new Scenario(config, 1, two).command({ type: "Teleport", x: 1.9, y: 1.5 }).command({ type: "Interact" });
    s.expectEvent("DoorOpened", { doorId: "door_1_1" });
    expect(s.eventsOfType("DoorOpened")).toHaveLength(1);
  });
});

describe("zones", () => {
  const w = asciiWorld(
    ["#######", "#S....#", "#.....#", "#######"],
    [
      { id: "street", requiredPermission: 0, rect: [0, 0, 7, 4] },
      { id: "restricted", requiredPermission: 2, rect: [4, 0, 3, 4] },
    ],
  );

  it("starts in the spawn zone and emits enter/exit events when crossing", () => {
    const s = new Scenario(config, 1, w);
    expect(s.sim.state.player.zone).toBe("street");
    s.command({ type: "SetMove", dx: 1, dy: 0, mode: "run" }).advance(2);
    s.expectEvent("ZoneExited", { zone: "street" }).expectEvent("ZoneEntered", { zone: "restricted" });
    expect(s.sim.state.player.zone).toBe("restricted");
  });
});
