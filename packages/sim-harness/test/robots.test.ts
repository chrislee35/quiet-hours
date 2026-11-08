// covers: ROB-1, ROB-3, ALR-1, ALR-2, STE-4
import { describe, expect, it } from "vitest";
import { Rng, type RobotDef, type RouteDef } from "@qh/core";
import { Scenario, asciiWorld } from "../src/index.ts";
import { config } from "./helpers.ts";

const EAST = 0;
const WEST = Math.PI;
const warden = (over: Partial<RobotDef> = {}): RobotDef => ({
  id: "w1", kind: "warden", x: 1.5, y: 1.5, facing: EAST, route: null, ...over,
});

/** Long one-tile-high corridor, 20 wide. */
const corridor = (robots: RobotDef[] = [warden()], routes: RouteDef[] = []) =>
  asciiWorld(["######################", "#....................#", "######################"], [], { robots, routes });

/** Seconds until the first RobotSpotted when the player stands still at (px, 1.5). */
function timeToSpot(px: number, seconds = 10): number | null {
  const s = new Scenario(config, 1, corridor()).player(px, 1.5);
  for (let t = 0; t < seconds * config.sim.ticksPerSecond; t++) {
    s.advanceTicks(1);
    if (s.eventsOfType("RobotSpotted").length > 0) return (t + 1) / config.sim.ticksPerSecond;
  }
  return null;
}

describe("vision and suspicion", () => {
  it("identifies a player in view after a short build-up, not instantly", () => {
    const t = timeToSpot(5.5)!; // 4 tiles away
    const v = config.vision;
    const expected = 1 / (v.suspicionGainPerSecond * (1 - v.proximityFalloff * (4 / config.robots.warden.rangeTiles)));
    expect(t).toBeGreaterThan(expected - 0.1);
    expect(t).toBeLessThan(expected + 0.1);
    expect(t).toBeGreaterThan(1); // never instant: the player always gets a moment to react
  });

  it("sneaking slows detection by the configured factor", () => {
    const spot = (mode: "walk" | "sneak") => {
      const s = new Scenario(config, 1, corridor()).player(5.5, 1.5).command({ type: "SetMove", dx: 0, dy: 0, mode });
      while (s.eventsOfType("RobotSpotted").length === 0 && s.sim.state.tick < 30 * 30) s.advanceTicks(1);
      return s.sim.state.tick / config.sim.ticksPerSecond;
    };
    const ratio = spot("sneak") / spot("walk");
    expect(ratio).toBeGreaterThan(1 / config.vision.sneakGainFactor - 0.15);
    expect(ratio).toBeLessThan(1 / config.vision.sneakGainFactor + 0.15);
  });

  it("is faster the closer the player is (monotonic)", () => {
    const times = [2.5, 4.5, 6.5].map((x) => timeToSpot(x)!);
    expect(times[0]!).toBeLessThan(times[1]!);
    expect(times[1]!).toBeLessThan(times[2]!);
  });

  it("never notices a player outside range", () => {
    expect(timeToSpot(9.5)).toBeNull(); // 8 tiles > 6
  });

  it("never notices a player behind it", () => {
    const s = new Scenario(config, 1, corridor([warden({ x: 8.5, facing: WEST })])).player(12.5, 1.5).advance(10);
    s.expectNoEvent("RobotSpotted");
    expect(s.robot("w1").suspicion).toBe(0);
  });

  it("cannot see through a wall or a closed door, but sees through an open one", () => {
    const run = (mid: string) => {
      const w = asciiWorld(["#########", `#.${mid}.....#`.slice(0, 9), "#########"], [], { robots: [warden({ x: 1.5 })] });
      const s = new Scenario(config, 1, w).player(5.5, 1.5).advance(6);
      return s.eventsOfType("RobotSpotted").length > 0;
    };
    expect(run("#")).toBe(false);
    expect(run("D")).toBe(false);
    expect(run("O")).toBe(true);
  });

  it("suspicion decays when the player leaves view", () => {
    const s = new Scenario(config, 1, corridor()).player(3.5, 1.5).advance(0.5);
    const raised = s.robot("w1").suspicion;
    expect(raised).toBeGreaterThan(0.2);
    expect(raised).toBeLessThan(1);
    s.player(15.5, 1.5).advance(3);
    expect(s.robot("w1").suspicion).toBe(0);
  });
});

describe("patrol", () => {
  const route: RouteDef = { id: "r", points: [{ x: 1.5, y: 1.5 }, { x: 6.5, y: 1.5 }] };

  it("walks its route, pauses at waypoints, and loops", () => {
    const s = new Scenario(config, 1, corridor([warden({ route: "r" })], [route])).player(19.5, 1.5);
    let maxX = 0;
    let returned = false;
    for (let t = 0; t < 14 * config.sim.ticksPerSecond; t++) {
      s.advanceTicks(1);
      const x = s.robot("w1").x;
      maxX = Math.max(maxX, x);
      if (maxX >= 6.4 && x <= 1.6) returned = true;
    }
    expect(maxX).toBeCloseTo(6.5, 1);
    expect(returned).toBe(true);
  });

  it("a robot with no route stands still", () => {
    const s = new Scenario(config, 1, corridor()).player(19.5, 1.5).advance(10);
    expect(s.robot("w1").x).toBe(1.5);
  });

  it("opens unlocked doors on its route, and gives up on locked ones without crashing", () => {
    const r: RouteDef = { id: "r", points: [{ x: 1.5, y: 1.5 }, { x: 6.5, y: 1.5 }] };
    const door = (ch: string) =>
      asciiWorld(["########", `#.${ch}....#`, "########"], [], { robots: [warden({ route: "r" })], routes: [r] });

    const open = new Scenario(config, 1, door("D")).player(7.5, 1.5);
    let maxX = 0;
    for (let t = 0; t < 8 * config.sim.ticksPerSecond; t++) {
      open.advanceTicks(1);
      maxX = Math.max(maxX, open.robot("w1").x);
    }
    open.expectEvent("DoorOpened", { doorId: "door_2_1" });
    expect(maxX).toBeGreaterThan(5);

    const locked = new Scenario(config, 1, door("L")).player(7.5, 1.5).advance(20);
    expect(locked.robot("w1").x).toBeLessThan(2);
    locked.expectNoEvent("DoorOpened");
  });
});

describe("hearing", () => {
  // Warden faces west with its back to the player, so only sound can reveal them.
  const world = () => corridor([warden({ x: 4.5, facing: WEST })]);

  it("running (radius 8) is heard at 6 tiles; walking (3) and sneaking (1) are not", () => {
    const heard = (mode: "run" | "walk" | "sneak") => {
      const s = new Scenario(config, 1, world()).player(10.5, 1.5).command({ type: "SetMove", dx: 1, dy: 0, mode }).advance(0.5);
      return s.eventsOfType("RobotInvestigating").length > 0;
    };
    expect(heard("run")).toBe(true);
    expect(heard("walk")).toBe(false);
    expect(heard("sneak")).toBe(false);
  });

  it("a wall halves the effective radius", () => {
    const walled = (px: number) => {
      const w = asciiWorld(["###########", "#.....#...#", "###########"].map((r, i) => (i === 1 ? "#.....#...#" : r)), [], {
        robots: [warden({ x: 4.5, facing: WEST })],
      });
      const s = new Scenario(config, 1, w).player(px, 1.5).command({ type: "SetMove", dx: 1, dy: 0, mode: "run" }).advance(0.2);
      return s.eventsOfType("RobotInvestigating").length > 0;
    };
    expect(walled(7.5)).toBe(true); // 3 tiles through a wall: within 8 * 0.5 = 4
    expect(walled(9.5)).toBe(false); // 5 tiles through a wall: beyond 4
  });

  it("the robot walks to the noise, looks around, then returns to patrol", () => {
    const s = new Scenario(config, 1, world()).player(10.5, 1.5).command({ type: "SetMove", dx: 1, dy: 0, mode: "run" });
    s.advance(0.3).command({ type: "SetMove", dx: 0, dy: 0, mode: "walk" }).player(19.5, 1.5);
    expect(s.robot("w1").mode).toBe("investigate");
    s.advance(config.robots.warden.investigateSeconds + 8);
    expect(s.robot("w1").mode).toBe("patrol");
  });
});

describe("chase", () => {
  it("spots, chases, and catches a stationary player; alert rises to Suspicious", () => {
    const s = new Scenario(config, 1, corridor()).player(6.5, 1.5).advance(12);
    s.expectEvent("RobotSpotted").expectEvent("PlayerCaught");
    s.expectEvent("AlertChanged", { from: 0, to: 1 });
  });

  it("a running player outpaces a Warden and the robot loses track", () => {
    // A long corridor, so the player runs out of time before running out of room.
    const longWorld = asciiWorld(["#".repeat(82), `#${".".repeat(80)}#`, "#".repeat(82)], [], { robots: [warden()] });
    const s = new Scenario(config, 1, longWorld).player(4.5, 1.5);
    while (s.eventsOfType("RobotSpotted").length === 0) s.advanceTicks(1); // stand still until spotted
    s.clearEvents();
    s.command({ type: "SetMove", dx: 1, dy: 0, mode: "run" });
    s.advance(10);
    s.expectNoEvent("PlayerCaught").expectEvent("RobotLostTrack");
  });

  it("paths around walls to reach the target instead of getting stuck", () => {
    const w = asciiWorld(["#########", "#...#...#", "#...#...#", "#.......#", "#########"], [], {
      robots: [warden({ x: 2.5, y: 1.5 })],
    });
    const s = new Scenario(config, 1, w).player(6.5, 1.5).edit((st) => {
      const r = st.robots[0]!;
      r.mode = "chase";
      r.target = { x: 6.5, y: 1.5 };
    });
    s.advance(6);
    s.expectEvent("PlayerCaught");
  });

  it("after losing the player it searches and then resumes patrol", () => {
    const s = new Scenario(config, 1, corridor()).player(6.5, 1.5);
    s.advance(2.2); // spotted
    s.player(19.5, 1.5); // player vanishes far away
    s.advance(25);
    s.expectEvent("RobotLostTrack");
    expect(s.robot("w1").mode).toBe("patrol");
  });

  it("closed doors do not stop a pursuer; locked doors do", () => {
    const chase = (ch: string) => {
      const w = asciiWorld(["#########", `#..${ch}....#`, "#########"], [], { robots: [warden({ x: 1.5 })] });
      const s = new Scenario(config, 1, w).player(6.5, 1.5).edit((st) => {
        st.robots[0]!.mode = "chase";
        st.robots[0]!.target = { x: 6.5, y: 1.5 };
      });
      s.advance(5);
      return s;
    };
    expect(chase("D").eventsOfType("PlayerCaught").length).toBeGreaterThan(0);
    expect(chase("L").eventsOfType("PlayerCaught")).toHaveLength(0);
  });
});

describe("alert from sightings", () => {
  it("two Wardens spotting together raise only one step; the alert later decays back to Calm", () => {
    const w = corridor([warden({ id: "a", x: 1.5 }), warden({ id: "b", x: 2.5 })]);
    const s = new Scenario(config, 1, w).player(6.5, 1.5).advance(2.5);
    expect(s.eventsOfType("RobotSpotted").length).toBe(2);
    expect(s.eventsOfType("AlertChanged")).toHaveLength(1);
    s.expectAlert(1);
    // Hide the player far from view and make both robots stand down; alert should decay one step per 90 s.
    s.player(21.5, 1.5).edit((st) => {
      for (const r of st.robots) { r.mode = "patrol"; r.suspicion = 0; r.facing = WEST; }
    });
    s.advance(config.alert.decaySeconds + 1);
    s.expectAlert(0);
  });
});

describe("invariants under random play", () => {
  const map = [
    "###############",
    "#.....#.......#",
    "#.....#.......#",
    "#.............#",
    "#.....#.......#",
    "###D#####.#####",
    "#.............#",
    "###############",
  ];
  const routes: RouteDef[] = [{ id: "loop", points: [{ x: 1.5, y: 3.5 }, { x: 13.5, y: 3.5 }, { x: 13.5, y: 6.5 }, { x: 1.5, y: 6.5 }] }];

  for (let seed = 1; seed <= 12; seed++) {
    it(`robots stay on floor, suspicion in [0,1], alert in [0,3] (seed ${seed})`, () => {
      const world = asciiWorld(map, [], {
        robots: [warden({ x: 3.5, y: 3.5, route: "loop" }), warden({ id: "w2", x: 10.5, y: 2.5, facing: Math.PI / 2 })],
        routes,
      });
      const s = new Scenario(config, seed, world).player(2.5, 1.5);
      const rng = new Rng(seed);
      for (let i = 0; i < 1800; i++) {
        if (i % 20 === 0) {
          s.command({ type: "SetMove", dx: rng.int(-1, 1), dy: rng.int(-1, 1), mode: rng.pick(["walk", "run", "sneak"] as const) });
          if (rng.chance(0.1)) s.command({ type: "Interact" });
        } else {
          s.advanceTicks(1);
        }
        for (const r of s.sim.state.robots) {
          expect(r.suspicion).toBeGreaterThanOrEqual(0);
          expect(r.suspicion).toBeLessThanOrEqual(1);
          const tx = Math.floor(r.x);
          const ty = Math.floor(r.y);
          expect(world.wall[ty * world.width + tx]).toBe(0);
        }
        expect(s.alert).toBeGreaterThanOrEqual(0);
        expect(s.alert).toBeLessThanOrEqual(3);
      }
    });
  }

  it("is deterministic: same seed and inputs give the same final state hash", () => {
    const run = () => {
      const world = asciiWorld(map, [], { robots: [warden({ x: 3.5, y: 3.5, route: "loop" })], routes });
      const s = new Scenario(config, 5, world).player(2.5, 1.5);
      const rng = new Rng(5);
      for (let i = 0; i < 900; i++) {
        if (i % 25 === 0) s.command({ type: "SetMove", dx: rng.int(-1, 1), dy: rng.int(-1, 1), mode: "run" });
        else s.advanceTicks(1);
      }
      return s.sim.hash;
    };
    expect(run()).toBe(run());
  });
});
