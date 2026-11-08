// covers: ROB-2, ROB-5, HAK-1, STE-1, STE-3
import { describe, expect, it } from "vitest";
import { withOverrides, type CameraDef, type Effect, type RobotDef } from "@qh/core";
import { Scenario, asciiWorld } from "../src/index.ts";
import { config } from "./helpers.ts";

const cam = (over: Partial<CameraDef> = {}): CameraDef => ({ id: "cam1", x: 0, y: 1, facing: 0, ...over });
const give = (id: string, extra: object = {}): Effect => ({ give_pass: { id, label: id, level: 1, origin: "issued", ...extra } });
/** A corridor with a camera mounted in the west wall, looking east down it. */
const world = (robots: RobotDef[] = [], cameras: CameraDef[] = [cam()]) =>
  asciiWorld(["#####################", "#...................#", "#####################"], [], { robots, cameras });
const still = withOverrides(config, { cameras: { sweepDegrees: 0 } });

const timeToSpot = (s: Scenario, limit = 30) => {
  for (let t = 0; t < limit * config.sim.ticksPerSecond; t++) {
    s.advanceTicks(1);
    if (s.eventsOfType("CameraSpotted").length > 0) return (t + 1) / config.sim.ticksPerSecond;
  }
  return null;
};

describe("camera vision", () => {
  it("identifies a player in its view, raising the alert, even though it is mounted in a wall", () => {
    const s = new Scenario(still, 1, world()).player(4.5, 1.5);
    expect(timeToSpot(s)).not.toBeNull();
    s.expectEvent("CameraSpotted", { cameraId: "cam1" }).expectEvent("AlertChanged", { from: 0, to: 1 });
  });

  it("does not see beyond its range or outside its cone", () => {
    expect(timeToSpot(new Scenario(still, 1, world()).player(1.0 + config.cameras.rangeTiles + 2, 1.5), 15)).toBeNull();
    const facingAway = world([], [cam({ facing: Math.PI })]);
    expect(timeToSpot(new Scenario(still, 1, facingAway).player(4.5, 1.5), 15)).toBeNull();
  });

  it("sweeps: its heading oscillates around its post facing within the configured arc", () => {
    const s = new Scenario(config, 1, world()).player(20.5, 1.5);
    const arc = (config.cameras.sweepDegrees * Math.PI) / 180;
    let min = Infinity, max = -Infinity;
    for (let t = 0; t < 2 * config.cameras.sweepSeconds * config.sim.ticksPerSecond; t++) {
      s.advanceTicks(1);
      const h = s.sim.state.cameras[0]!.heading;
      min = Math.min(min, h); max = Math.max(max, h);
    }
    expect(max).toBeGreaterThan(arc * 0.95);
    expect(max).toBeLessThanOrEqual(arc + 1e-9);
    expect(min).toBeLessThan(-arc * 0.95);
  });

  it("runs the same ID check as a robot: a valid pass is ignored, a bad one is caught faster", () => {
    const run = (effects: Effect[]) => {
      const s = new Scenario(still, 1, world()).command({ type: "ApplyEffects", effects }).player(4.5, 1.5);
      return timeToSpot(s, 40);
    };
    const nul = run([])!;
    expect(run([give("ok", { level: 0 })])).toBeNull();
    const bad = run([give("bad", { zones: ["elsewhere"] })])!;
    expect(bad).toBeLessThan(nul);
  });

  it("sneaking slows it, like everything else that watches", () => {
    const t = (mode: "walk" | "sneak") => timeToSpot(new Scenario(still, 1, world()).player(4.5, 1.5).command({ type: "SetMove", dx: 0, dy: 0, mode }))!;
    expect(t("sneak")).toBeGreaterThan(t("walk") * 1.3);
  });

  it("does not raise another alarm until its cooldown has passed", () => {
    const s = new Scenario(still, 1, world()).player(3.5, 1.5);
    timeToSpot(s);
    const first = s.eventsOfType("CameraSpotted").length;
    s.advance(config.cameras.cooldownSeconds - 2);
    expect(s.eventsOfType("CameraSpotted")).toHaveLength(first);
    s.advance(10);
    expect(s.eventsOfType("CameraSpotted").length).toBeGreaterThan(first);
  });

  it("tells nearby robots where the player is", () => {
    const s = new Scenario(still, 1, world([{ id: "w", kind: "warden", x: 12.5, y: 1.5, facing: Math.PI, route: null }])).player(4.5, 1.5);
    timeToSpot(s);
    s.expectEvent("AlertBroadcast", { originId: "cam1" });
    s.advance(config.comms.latencySeconds + 0.2).expectEvent("AlertReceived", { robotId: "w", originId: "cam1" });
  });
});

describe("disabling cameras", () => {
  it("a disabled camera is blind; re-enabling restores it", () => {
    const s = new Scenario(still, 1, world()).command({ type: "ApplyEffects", effects: [{ disable_camera: "cam1" }] }).player(3.5, 1.5);
    s.expectEvent("CameraDisabled", { cameraId: "cam1" });
    expect(timeToSpot(s, 15)).toBeNull();
    s.command({ type: "ApplyEffects", effects: [{ enable_camera: "cam1" }] });
    expect(timeToSpot(s, 15)).not.toBeNull();
  });

  it("disabling does nothing for an unknown camera or one that is already off", () => {
    const s = new Scenario(still, 1, world());
    s.command({ type: "ApplyEffects", effects: [{ disable_camera: "ghost" }, { disable_camera: "cam1" }, { disable_camera: "cam1" }] });
    expect(s.eventsOfType("CameraDisabled")).toHaveLength(1);
  });
});

describe("camera witnesses", () => {
  const night = withOverrides(still, { clock: { startMinuteOfDay: 23 * 60 } });
  it("record infractions for someone with a record who is out in a curfew zone, and not for a null", () => {
    const w = asciiWorld(["#####################", "#...................#", "#####################"], [
      { id: "street", requiredPermission: 0, curfew: true, rect: [0, 0, 21, 3] },
    ], { cameras: [cam()] });
    const out = (effects: Effect[]) => new Scenario(night, 1, w).command({ type: "ApplyEffects", effects }).player(4.5, 1.5).advance(10);
    out([give("citizen", { level: 0 })]).expectEvent("InfractionRecorded", { kind: "curfew" });
    out([]).expectNoEvent("InfractionRecorded");
  });
});
