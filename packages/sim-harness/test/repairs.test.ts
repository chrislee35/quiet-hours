// covers: ROB-5, WLD-3, HAK-1
import { describe, expect, it } from "vitest";
import { withOverrides, type CameraDef, type RobotDef } from "@qh/core";
import { Scenario, asciiWorld } from "../src/index.ts";
import { config as base } from "./helpers.ts";

const fast = withOverrides(base, { repairs: { cameraDelaySeconds: 2, relockDelaySeconds: 3, repairSeconds: 1 } });
const mender = (id: string, x: number, y = 1.5): RobotDef => ({ id, kind: "mender", x, y, facing: 0, route: null });
const cam = (id: string, x: number, y = 1): CameraDef => ({ id, x, y, facing: 0 });
const row = (n: number) => ["#".repeat(n + 2), `#${".".repeat(n)}#`, "#".repeat(n + 2)];
const offscreen = 30.5; // keep the player out of everything's way

describe("cameras are repaired", () => {
  const world = (robots: RobotDef[]) => asciiWorld(row(30), [], { robots, cameras: [cam("c1", 12, 0)] });
  const broken = (robots: RobotDef[]) =>
    new Scenario(fast, 1, world(robots)).player(offscreen, 1.5).command({ type: "ApplyEffects", effects: [{ disable_camera: "c1" }] });

  it("a maintenance robot is sent after the delay, repairs it, and goes home", () => {
    const s = broken([mender("m1", 2.5)]);
    s.advance(fast.repairs.cameraDelaySeconds - 0.5);
    s.expectNoEvent("RepairAssigned");
    expect(s.sim.state.cameras[0]!.broken).toBe(true);
    s.advance(1);
    s.expectEvent("RepairAssigned", { robotId: "m1", task: "camera", targetId: "c1" });
    s.advance(10);
    s.expectEvent("CameraRepaired", { cameraId: "c1" });
    expect(s.sim.state.cameras[0]!.broken).toBe(false);
    expect(s.robot("m1").task).toBeNull();
    s.advance(12);
    expect(Math.hypot(s.robot("m1").x - 2.5, s.robot("m1").y - 1.5)).toBeLessThan(0.1);
  });

  it("travel and work take real time: the camera stays blind while the robot walks over", () => {
    const s = broken([mender("m1", 2.5)]);
    s.advance(fast.repairs.cameraDelaySeconds + 1);
    expect(s.sim.state.cameras[0]!.broken).toBe(true); // still on its way: ~10 tiles at 2.2 tiles/s
    s.advance(10);
    expect(s.sim.state.cameras[0]!.broken).toBe(false);
  });

  it("with no maintenance robot, nothing is repaired", () => {
    const s = broken([]);
    s.advance(60);
    expect(s.sim.state.cameras[0]!.broken).toBe(true);
    s.expectNoEvent("RepairAssigned");
  });

  it("the nearest idle robot takes the job, and a job is never given to two robots", () => {
    const s = broken([mender("near", 8.5), mender("far", 2.5)]);
    s.advance(fast.repairs.cameraDelaySeconds + 0.5);
    expect(s.eventsOfType("RepairAssigned").map((e) => e.robotId)).toEqual(["near"]);
    s.advance(10);
    expect(s.eventsOfType("RepairAssigned")).toHaveLength(1);
  });

  it("one robot handles several jobs one after another", () => {
    const w = asciiWorld(row(30), [], { robots: [mender("m1", 2.5)], cameras: [cam("c1", 12, 0), cam("c2", 20, 0)] });
    const s = new Scenario(fast, 1, w).player(offscreen, 1.5).command({ type: "ApplyEffects", effects: [{ disable_camera: "c1" }, { disable_camera: "c2" }] });
    s.advance(40);
    expect(s.eventsOfType("CameraRepaired").map((e) => e.cameraId).sort()).toEqual(["c1", "c2"]);
  });

  it("a robot that cannot reach the job gives up and the job can be reassigned", () => {
    // The only way to the camera is through a locked door that never opens.
    const w = asciiWorld(["###########", "#.m...L...#", "###########"].map((r) => r.replace("m", ".")), [], {
      robots: [mender("m1", 1.5)], cameras: [cam("c1", 8, 0)],
    });
    const s = new Scenario(fast, 1, w).player(9.5, 1.5).command({ type: "ApplyEffects", effects: [{ disable_camera: "c1" }] });
    s.advance(20);
    expect(s.sim.state.cameras[0]!.broken).toBe(true);
    s.expectNoEvent("CameraRepaired");
    // It tries again after the normal delay rather than every tick.
    expect(s.eventsOfType("RepairAssigned").length).toBeLessThanOrEqual(Math.ceil(20 / fast.repairs.cameraDelaySeconds) + 1);
  });

  it("maintenance robots never notice the player", () => {
    const w = asciiWorld(row(20), [], { robots: [mender("m1", 5.5)] });
    const s = new Scenario(base, 1, w).player(7.5, 1.5);
    s.advance(30);
    s.expectNoEvent("RobotSpotted");
    expect(s.robot("m1").suspicion).toBe(0);
  });
});

describe("doors are locked again", () => {
  // The east door starts locked; the player (or a terminal) unlocks it; the city locks it again.
  const world = (robots: RobotDef[]) => asciiWorld(["###########", "#.........#", "#####L#####", "#.........#", "###########"].map((r, i) => (i === 2 ? "####L######" : r)), [], { robots });
  const doorId = "door_4_2";
  const unlocked = (robots: RobotDef[]) =>
    new Scenario(fast, 1, world(robots)).player(9.5, 1.5).command({ type: "ApplyEffects", effects: [{ unlock_door: doorId }] });

  it("records when the door was unlocked", () => {
    const s = unlocked([]);
    expect(s.sim.state.doors[doorId]!.unlockedAt).toBeGreaterThan(0);
    expect(s.sim.state.doors[doorId]!.unlockedAt).toBeLessThanOrEqual(s.sim.state.tick);
  });

  it("after the delay a maintenance robot closes and locks it", () => {
    const s = unlocked([mender("m1", 2.5)]);
    s.command({ type: "Teleport", x: 4.5, y: 1.5 });
    s.command({ type: "Interact" }); // the player opens it...
    expect(s.sim.state.doors[doorId]!.open).toBe(true);
    s.player(9.5, 1.5).advance(fast.repairs.relockDelaySeconds + 15);
    s.expectEvent("RepairAssigned", { task: "door", targetId: doorId }).expectEvent("DoorRelocked", { doorId });
    expect(s.sim.state.doors[doorId]).toMatchObject({ open: false, locked: true });
    expect(s.sim.state.doors[doorId]!.unlockedAt).toBeUndefined();
  });

  it("not before the delay, and not at all without a maintenance robot", () => {
    const s = unlocked([mender("m1", 2.5)]);
    s.advance(fast.repairs.relockDelaySeconds - 1);
    s.expectNoEvent("RepairAssigned");
    const none = unlocked([]);
    none.advance(60);
    expect(none.sim.state.doors[doorId]!.locked).toBe(false);
  });

  it("will not lock a door while the player is standing in the doorway, and does once they leave", () => {
    const s = unlocked([mender("m1", 2.5)]);
    s.player(4.5, 2.5); // standing in the door tile (4, 2)
    s.command({ type: "Interact" });
    s.command({ type: "SetMove", dx: 0, dy: 0, mode: "walk" });
    s.advance(fast.repairs.relockDelaySeconds + 12);
    expect(s.sim.state.doors[doorId]!.locked).toBe(false);
    s.player(9.5, 1.5).advance(3);
    expect(s.sim.state.doors[doorId]!.locked).toBe(true);
  });

  it("a door that never started locked is never re-locked", () => {
    const w = asciiWorld(row(10).slice(0, 1).concat(["#..D.......#"], ["############"]), [], { robots: [mender("m1", 2.5)] });
    const s = new Scenario(fast, 1, w).player(9.5, 1.5).advance(30);
    s.expectNoEvent("RepairAssigned");
    expect(s.sim.state.doors.door_3_1!.locked).toBe(false);
  });
});

describe("the emergent loop (WLD-3)", () => {
  it("a terminal-style camera cut gives a window, then the city closes it", () => {
    // The camera looks straight down from the ceiling at x = 15.
    const w = asciiWorld(row(30), [], { robots: [mender("m1", 2.5)], cameras: [{ id: "c1", x: 15, y: 0, facing: Math.PI / 2 }] });
    const cfg = withOverrides(fast, { cameras: { sweepDegrees: 0 } });
    const s = new Scenario(cfg, 1, w).player(offscreen, 1.5).command({ type: "ApplyEffects", effects: [{ disable_camera: "c1" }] });
    // During the blind window the player walks past undetected.
    s.player(15.5, 1.5).advance(3);
    s.expectNoEvent("CameraSpotted");
    // The city repairs it.
    s.player(offscreen, 1.5).advance(20);
    expect(s.sim.state.cameras[0]!.broken).toBe(false);
    // Now the same stroll is seen.
    s.player(15.5, 1.5);
    s.advance(10);
    s.expectEvent("CameraSpotted");
  });
});
