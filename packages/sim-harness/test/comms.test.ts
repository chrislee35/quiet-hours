// covers: ROB-2, ROB-1
import { describe, expect, it } from "vitest";
import { withOverrides, type RobotDef, type RobotKind } from "@qh/core";
import { Scenario, asciiWorld } from "../src/index.ts";
import { config as base } from "./helpers.ts";

const bot = (id: string, kind: RobotKind, x: number, facing = 0, over: Partial<RobotDef> = {}): RobotDef => ({
  id, kind, x, y: 1.5, facing, route: null, ...over,
});
const corridor = (len: number, robots: RobotDef[]) =>
  asciiWorld(["#".repeat(len + 2), `#${".".repeat(len)}#`, "#".repeat(len + 2)], [], { robots });

/** Alerts are the subject here, so the reporting robot must not catch the player (which would reset everyone). */
const config = withOverrides(base, { robots: { warden: { chaseSpeed: 0 } } });

/** Runs until robot `a` identifies the player (RobotSpotted), returning the scenario at that moment. */
function untilSpotted(s: Scenario, limitSeconds = 20): Scenario {
  while (s.eventsOfType("RobotSpotted").length === 0) {
    s.advanceTicks(1);
    if (s.sim.state.tick > limitSeconds * config.sim.ticksPerSecond) throw new Error("never spotted");
  }
  return s;
}
const latency = Math.round(config.comms.latencySeconds * config.sim.ticksPerSecond);

describe("alerts between robots", () => {
  // a sees the player at 4.5; b, behind a wall of distance, is 12 tiles from a and cannot see the player.
  const world = () => corridor(40, [bot("a", "warden", 1.5), bot("b", "warden", 13.5, Math.PI), bot("far", "warden", 38.5, Math.PI)]);
  const setup = () => untilSpotted(new Scenario(config, 1, world()).player(5.5, 1.5));

  it("the robot that identifies the player alerts robots within range, and only those", () => {
    const s = setup();
    const ev = s.eventsOfType("AlertBroadcast")[0]!;
    expect(ev.originId).toBe("a");
    expect(ev.recipients).toEqual(["b"]); // "far" is 37 tiles away, beyond comms range
  });

  it("arrives after the latency, not before", () => {
    const s = setup();
    s.clearEvents().advanceTicks(latency - 2);
    s.expectNoEvent("AlertReceived");
    s.advanceTicks(4);
    s.expectEvent("AlertReceived", { robotId: "b", originId: "a" });
  });

  it("the recipient goes to investigate the reported position, primed to identify the player quickly", () => {
    const s = setup();
    s.advanceTicks(latency + 1);
    const b = s.robot("b");
    expect(b.mode).toBe("investigate");
    expect(Math.abs(b.target!.x - 5.5)).toBeLessThan(0.1);
    expect(b.suspicion).toBeGreaterThan(config.comms.primedSuspicion - 0.1); // primed, minus a tick of natural decay
  });

  it("a primed robot identifies the player sooner than an unalerted one would", () => {
    const quick = (primed: boolean) => {
      const w = corridor(20, [bot("b", "warden", 1.5)]);
      const s = new Scenario(config, 1, w).player(5.5, 1.5);
      if (primed) s.edit((st) => { st.robots[0]!.suspicion = config.comms.primedSuspicion; });
      while (s.eventsOfType("RobotSpotted").length === 0 && s.sim.state.tick < 30 * 30) s.advanceTicks(1);
      return s.sim.state.tick;
    };
    expect(quick(true)).toBeLessThan(quick(false) * 0.7);
  });

  it("is one hop: a recipient does not alert anyone else", () => {
    const s = setup();
    s.advanceTicks(latency + 1);
    expect(s.eventsOfType("AlertBroadcast")).toHaveLength(1);
  });

  it("robots already chasing ignore alerts", () => {
    const w = corridor(40, [bot("a", "warden", 1.5), bot("b", "warden", 13.5, Math.PI)]);
    const s = new Scenario(config, 1, w).player(5.5, 1.5).edit((st) => {
      st.robots[1]!.mode = "chase";
      st.robots[1]!.target = { x: 30.5, y: 1.5 };
    });
    untilSpotted(s);
    s.advanceTicks(latency + 1);
    expect(s.eventsOfType("AlertReceived")).toHaveLength(0);
    expect(s.robot("b").target!.x).toBeGreaterThan(20);
  });

  it("a post-bound robot (a Sentry) turns to face the reported position", () => {
    const w = corridor(40, [bot("a", "warden", 1.5), bot("s", "sentry", 13.5, Math.PI / 2)]);
    const s = untilSpotted(new Scenario(config, 1, w).player(5.5, 1.5));
    s.advanceTicks(latency + 2);
    expect(s.robot("s").x).toBe(13.5);
    expect(Math.cos(s.robot("s").facing)).toBeLessThan(-0.9); // faces west, toward x = 5.5
  });

  it("maintenance robots are never alerted", () => {
    const w = corridor(40, [bot("a", "warden", 1.5), bot("m", "mender", 13.5, Math.PI)]);
    const s = untilSpotted(new Scenario(config, 1, w).player(5.5, 1.5));
    expect(s.eventsOfType("AlertBroadcast")[0]!.recipients).toEqual([]);
  });

  it("a larger comms range reaches further", () => {
    const wide = withOverrides(config, { comms: { rangeTiles: 60 } });
    const s = untilSpotted(new Scenario(wide, 1, world()).player(5.5, 1.5));
    expect(s.eventsOfType("AlertBroadcast")[0]!.recipients.sort()).toEqual(["b", "far"]);
  });
});

describe("the city's shared memory", () => {
  const world = () => corridor(60, [bot("a", "warden", 1.5), bot("h", "hound", 50.5, Math.PI)]);
  const hunterTarget = (waitSeconds: number) => {
    const s = untilSpotted(new Scenario(config, 1, world()).player(5.5, 1.5));
    s.edit((st) => { st.robots[0]!.sees = false; }).player(30.5, 1.5);
    s.advance(waitSeconds).command({ type: "ApplyEffects", effects: [{ raise_alert_to: 2 }] }).advance(0.1);
    return s.robot("h").target!.x;
  };

  it("records where the player was reported, with a time", () => {
    const s = untilSpotted(new Scenario(config, 1, world()).player(5.5, 1.5));
    expect(s.sim.state.lastKnown).toMatchObject({ x: 5.5, y: 1.5 });
    expect(s.sim.state.lastKnown!.tick).toBe(s.sim.state.tick);
  });

  it("hunters are sent to the reported position while it is fresh, not to where the player is now", () => {
    expect(hunterTarget(2)).toBeLessThan(10); // the report said x = 5.5; the player has since moved to 30.5
  });

  it("once the report is stale, hunters fall back to the player's actual position", () => {
    expect(hunterTarget(config.comms.memorySeconds + 5)).toBeGreaterThan(25);
  });
});
