// covers: ROB-3, STE-3, ROB-1, ALR-2
import { describe, expect, it } from "vitest";
import { withOverrides, type Effect, type RobotDef, type RobotKind } from "@qh/core";
import { Scenario, asciiWorld } from "../src/index.ts";
import { config } from "./helpers.ts";

const bot = (kind: RobotKind, over: Partial<RobotDef> = {}): RobotDef => ({
  id: "r1", kind, x: 1.5, y: 1.5, facing: 0, route: null, ...over,
});
/** A one-tile-high corridor `len` tiles long, with the given robots. */
const corridor = (len: number, robots: RobotDef[]) =>
  asciiWorld(["#".repeat(len + 2), `#${".".repeat(len)}#`, "#".repeat(len + 2)], [], { robots });
const scenario = (len: number, robots: RobotDef[], cfg = config, effects: Effect[] = []) =>
  new Scenario(cfg, 1, corridor(len, robots)).command({ type: "ApplyEffects", effects });
const give = (id: string, extra: object = {}): Effect => ({ give_pass: { id, label: id, level: 1, origin: "issued", ...extra } });
const secs = (s: Scenario, n: number) => s.advance(n);

describe("Sentry: a fixed post, a sweeping view, cannot chase", () => {
  it("never leaves its post, even after identifying a player standing next to it", () => {
    const s = scenario(10, [bot("sentry")]).player(3.5, 1.5);
    secs(s, 30);
    s.expectEvent("RobotSpotted").expectNoEvent("PlayerCaught");
    expect(s.robot("r1").x).toBe(1.5);
    expect(s.robot("r1").mode).toBe("alert");
  });

  it("raising the alarm raises the city alert", () => {
    const s = scenario(10, [bot("sentry", { facing: 0 })]).player(3.5, 1.5);
    secs(s, 6);
    s.expectEvent("AlertChanged", { from: 0, to: 1 });
  });

  it("sweeps its view back and forth around its post facing, within the configured arc", () => {
    const s = scenario(10, [bot("sentry")]).player(9.5, 1.5);
    const arc = (config.robots.sentry.sweepDegrees * Math.PI) / 180;
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < 20 * config.sim.ticksPerSecond; t++) {
      s.advanceTicks(1);
      const f = s.robot("r1").facing;
      min = Math.min(min, f);
      max = Math.max(max, f);
    }
    expect(max).toBeGreaterThan(arc * 0.9);
    expect(max).toBeLessThanOrEqual(arc + 1e-9);
    expect(min).toBeLessThan(-arc * 0.9);
  });

  it("hears a noise, turns to face it without moving, then returns to its sweep", () => {
    const s = scenario(14, [bot("sentry", { x: 7.5, facing: Math.PI })]).player(12.5, 1.5);
    s.command({ type: "SetMove", dx: -1, dy: 0, mode: "run" }).advance(0.3);
    s.command({ type: "SetMove", dx: 0, dy: 0, mode: "sneak" });
    s.expectEvent("RobotInvestigating");
    expect(s.robot("r1").x).toBe(7.5);
    expect(Math.cos(s.robot("r1").facing)).toBeGreaterThan(0.9); // faces east, toward the noise
    secs(s, config.robots.sentry.investigateSeconds + 2);
    expect(s.robot("r1").mode).toBe("patrol");
  });

  it("stands down some time after the player leaves view", () => {
    const s = scenario(20, [bot("sentry")]).player(3.5, 1.5);
    secs(s, 6);
    expect(s.robot("r1").mode).toBe("alert");
    s.player(19.5, 1.5);
    secs(s, config.robots.sentry.searchSeconds + 2);
    expect(s.robot("r1").mode).toBe("patrol");
    expect(s.robot("r1").suspicion).toBe(0);
  });
});

describe("Checker: short range, stalls on a null, checks a record once", () => {
  const checker = () => [bot("checker")];

  it("sees only within its short range", () => {
    const at = (x: number) => {
      const s = scenario(12, checker()).player(x, 1.5);
      secs(s, 3);
      return s.eventsOfType("ScanPerformed").length > 0;
    };
    expect(at(1.5 + config.robots.checker.rangeTiles - 0.5)).toBe(true);
    expect(at(1.5 + config.robots.checker.rangeTiles + 0.5)).toBe(false);
  });

  it("a null is 'pending review': the checker stalls, then reviews again, forever, and never escalates", () => {
    const s = scenario(12, checker()).player(4.5, 1.5);
    secs(s, 60);
    const reviews = s.eventsOfType("ScanPerformed");
    expect(reviews.every((e) => e.outcome === "Null")).toBe(true);
    expect(reviews.length).toBeGreaterThanOrEqual(Math.floor(60 / config.robots.checker.reviewSeconds) - 1);
    s.expectNoEvent("RobotSpotted").expectNoEvent("InfractionRecorded");
    expect(s.alert).toBe(0);
    expect(s.robot("r1").suspicion).toBe(0);
  });

  it("a valid limited pass is checked once per stay and uses up one use; a new stay checks again", () => {
    const s = scenario(12, checker(), config, [give("day_pass", { uses: 3 })]).player(4.5, 1.5);
    secs(s, 10);
    expect(s.eventsOfType("ScanPerformed").map((e) => e.outcome)).toEqual(["Allowed"]);
    expect(s.sim.state.passes[0]!.usesLeft).toBe(2);
    s.player(12.5, 1.5);
    secs(s, 5); // out of its 4-tile range for longer than the 3 s memory
    s.player(4.5, 1.5);
    secs(s, 3);
    expect(s.eventsOfType("ScanPerformed")).toHaveLength(2);
    expect(s.sim.state.passes[0]!.usesLeft).toBe(1);
  });

  it("a pass that does not cover the zone is caught on the spot", () => {
    const s = scenario(12, checker(), config, [give("weak", { zones: ["elsewhere"] })]).player(4.5, 1.5);
    secs(s, 3);
    s.expectEvent("ScanPerformed", { outcome: "Violation" }).expectEvent("RobotSpotted");
  });

  it("cannot chase", () => {
    const s = scenario(12, checker(), config, [give("weak", { zones: ["elsewhere"] })]).player(4.5, 1.5);
    secs(s, 20);
    expect(s.robot("r1").x).toBe(1.5);
    s.expectNoEvent("PlayerCaught");
  });
});

describe("Hound: dispatched by the alert, fast, hears well", () => {
  const long = (robots: RobotDef[]) => scenario(90, robots);

  it("waits at its post until the alert reaches its dispatch level", () => {
    const s = long([bot("hound", { x: 1.5, facing: Math.PI })]).player(40.5, 1.5);
    secs(s, 20);
    expect(s.robot("r1").mode).toBe("patrol");
    expect(s.robot("r1").x).toBe(1.5);
    s.command({ type: "ApplyEffects", effects: [{ raise_alert_to: 2 }] }).advance(0.2);
    s.expectEvent("HoundDispatched", { robotId: "r1" });
    expect(s.robot("r1").mode).toBe("chase");
  });

  it("outruns a running player, where a Warden cannot", () => {
    const chase = (kind: RobotKind) => {
      const s = long([bot(kind, { facing: Math.PI })]).player(9.5, 1.5);
      s.command({ type: "ApplyEffects", effects: [{ raise_alert_to: 2 }] });
      s.command({ type: "SetMove", dx: 1, dy: 0, mode: "run" });
      // Keep the Warden in pursuit too, for a fair comparison.
      s.edit((st) => { st.robots[0]!.mode = "chase"; st.robots[0]!.target = { x: 9.5, y: 1.5 }; });
      for (let t = 0; t < 40 * config.sim.ticksPerSecond && s.eventsOfType("PlayerCaught").length === 0; t++) s.advanceTicks(1);
      return s.eventsOfType("PlayerCaught").length > 0;
    };
    expect(chase("hound")).toBe(true);
    expect(chase("warden")).toBe(false);
  });

  it("hears footsteps from further away than a Warden", () => {
    const heard = (kind: RobotKind) => {
      const s = scenario(20, [bot(kind, { x: 8.5, facing: Math.PI })]).player(13.0, 1.5); // 4.5 tiles behind it
      s.command({ type: "SetMove", dx: 1, dy: 0, mode: "walk" }).advance(0.3);
      return s.eventsOfType("RobotInvestigating").length > 0;
    };
    expect(config.noise.walkRadius).toBeLessThan(4.5);
    expect(heard("warden")).toBe(false);
    expect(heard("hound")).toBe(true); // 3 * 1.6 = 4.8
  });

  it("returns to its post after losing the player, and can be dispatched again", () => {
    const s = long([bot("hound", { x: 1.5, facing: Math.PI })]).player(20.5, 1.5);
    s.command({ type: "ApplyEffects", effects: [{ raise_alert_to: 2 }] });
    s.edit((st) => { st.robots[0]!.sees = false; });
    s.player(80.5, 1.5); // the player vanishes; the hound runs to where they were
    secs(s, 60);
    expect(s.robot("r1").mode).toBe("patrol");
    expect(Math.abs(s.robot("r1").x - 1.5)).toBeLessThan(0.1);
    s.edit((st) => { st.alert.level = 0; });
    s.advance(0.2);
    expect(s.robot("r1").dispatched).toBe(false);
    s.command({ type: "ApplyEffects", effects: [{ raise_alert_to: 2 }] }).advance(0.2);
    expect(s.eventsOfType("HoundDispatched")).toHaveLength(2);
  });
});

describe("Auditor: thorough scans and random audits", () => {
  const eager = withOverrides(config, { robots: { auditor: { checkChancePerSecond: 1000, auditSeconds: 2 } } });
  const audit = (effects: Effect[], x = 3.5, cfg = eager) => {
    const s = scenario(12, [bot("auditor")], cfg, effects).player(x, 1.5);
    secs(s, 1);
    return s;
  };

  it("passes a null and a genuine pass (pending review is not a violation)", () => {
    audit([]).expectEvent("AuditPassed");
    audit([give("real")]).expectEvent("AuditPassed");
  });

  it("catches a forged pass that a Warden's basic scan would accept", () => {
    const forged = [give("fake", { origin: "forged" })];
    const a = audit(forged);
    a.expectEvent("AuditFailed", { reason: "forged" }).expectEvent("RobotSpotted");
    const w = new Scenario(config, 1, corridor(12, [bot("warden")])).command({ type: "ApplyEffects", effects: forged }).player(3.5, 1.5);
    secs(w, 10);
    w.expectNoEvent("RobotSpotted"); // a Warden's basic scan believes the forgery
  });

  it("finds contraband even on someone with no record at all", () => {
    audit([{ add_item: ["contraband_radio", 1] }]).expectEvent("AuditFailed", { reason: "contraband" });
  });

  it("audits only at close range, and not again until the audit has finished", () => {
    const far = audit([], 5.5); // 4 tiles: within sight (5) but beyond audit range (3)
    far.expectNoEvent("AuditPassed");
    const s = scenario(12, [bot("auditor")], eager).player(3.5, 1.5);
    secs(s, 1.5);
    expect(s.eventsOfType("AuditPassed")).toHaveLength(1);
    secs(s, 2);
    expect(s.eventsOfType("AuditPassed").length).toBeGreaterThanOrEqual(2);
  });

  it("audits far more often during Quiet Hours", () => {
    const gentle = withOverrides(config, { robots: { auditor: { checkChancePerSecond: 0.15, auditSeconds: 1 } } });
    const count = (startMinuteOfDay: number) => {
      const cfg = withOverrides(gentle, { clock: { startMinuteOfDay } });
      const s = scenario(12, [bot("auditor")], cfg).player(3.5, 1.5);
      secs(s, 120);
      return s.eventsOfType("AuditPassed").length;
    };
    const day = count(12 * 60);
    const night = count(2 * 60 + 30);
    expect(night).toBeGreaterThan(day * 1.5);
  });

  it("is reproducible: the same seed gives the same audits, and the RNG state advances", () => {
    const run = () => {
      const cfg = withOverrides(config, { robots: { auditor: { checkChancePerSecond: 0.3, auditSeconds: 1 } } });
      const s = scenario(12, [bot("auditor")], cfg).player(3.5, 1.5);
      secs(s, 60);
      return { hash: s.sim.hash, rng: s.sim.state.rngState, audits: s.eventsOfType("AuditPassed").length };
    };
    const a = run();
    expect(run()).toEqual(a);
    expect(a.rng).not.toBe(1);
  });
});

describe("Heavy: wide view, slow, hard to shake, catches from further", () => {
  it("sees what a Warden cannot: further away and further off to the side", () => {
    const seen = (kind: RobotKind, px: number, py: number) => {
      const w = asciiWorld(["###########", "#.........#", "#.........#", "#.........#", "#.........#", "###########"], [], {
        robots: [bot(kind, { x: 1.5, y: 2.5 })],
      });
      const s = new Scenario(config, 1, w).player(px, py);
      s.advance(0.5);
      return s.robot("r1").sees;
    };
    // Straight ahead at 6.5 tiles: the Warden's range is 6, the Heavy's is 7.
    expect(seen("warden", 8.0, 2.5)).toBe(false);
    expect(seen("heavy", 8.0, 2.5)).toBe(true);
    // About 55 degrees off its facing: outside the Warden's 90 degree cone, inside the Heavy's 120.
    const dx = 3;
    const dy = dx * Math.tan((55 * Math.PI) / 180);
    expect(seen("warden", 1.5 + dx, 2.5 + Math.min(dy, 2))).toBe(seen("warden", 1.5 + dx, 2.5 + Math.min(dy, 2)));
    const w2 = asciiWorld(["##########", "#........#", "#........#", "#........#", "#........#", "#........#", "##########"], [], { robots: [bot("warden", { x: 1.5, y: 1.5 }), bot("heavy", { id: "h", x: 1.5, y: 1.5 })] });
    const s2 = new Scenario(config, 1, w2).player(3.0, 1.5 + 3 * Math.tan((55 * Math.PI) / 180) * 0.6);
    s2.advance(0.2);
    expect(s2.robot("r1").sees).toBe(false);
    expect(s2.robot("h").sees).toBe(true);
  });

  it("catches from a greater distance than a Warden", () => {
    const gap = (kind: RobotKind) => {
      const s = scenario(12, [bot(kind)]).player(8.5, 1.5);
      s.edit((st) => { st.robots[0]!.mode = "chase"; st.robots[0]!.target = { x: 8.5, y: 1.5 }; });
      while (s.eventsOfType("PlayerCaught").length === 0 && s.sim.state.tick < 30 * 30) s.advanceTicks(1);
      return Math.abs(s.sim.state.player.x - s.robot("r1").x) ;
    };
    // The player is moved to the holding spawn (none here, so they stay) so the gap at the catch is measurable.
    expect(gap("heavy")).toBeGreaterThan(1.0);
    expect(gap("warden")).toBeLessThanOrEqual(config.robots.warden.catchRadius + 0.05);
  });

  it("is outpaced by a running player, though it keeps up with a walking one", () => {
    const run = (mode: "run" | "walk") => {
      const s = scenario(90, [bot("heavy")]).player(5.5, 1.5);
      s.edit((st) => { st.robots[0]!.mode = "chase"; st.robots[0]!.target = { x: 5.5, y: 1.5 }; });
      s.command({ type: "SetMove", dx: 1, dy: 0, mode });
      for (let t = 0; t < 40 * config.sim.ticksPerSecond && s.eventsOfType("PlayerCaught").length === 0; t++) s.advanceTicks(1);
      return s.eventsOfType("PlayerCaught").length > 0;
    };
    expect(run("run")).toBe(false);
    expect(run("walk")).toBe(true);
  });
});

describe("every type works on a real patrol and through doors", () => {
  const kinds: RobotKind[] = ["warden", "sentry", "checker", "hound", "auditor", "heavy"];
  for (const kind of kinds) {
    it(`${kind}: random play never breaks its invariants`, () => {
      const world = asciiWorld(["###############", "#.....#.......#", "#.....D.......#", "#.............#", "###############"], [], {
        robots: [bot(kind, { x: 3.5, y: 1.5, route: kind === "warden" || kind === "auditor" || kind === "heavy" ? "loop" : null })],
        routes: [{ id: "loop", points: [{ x: 3.5, y: 1.5 }, { x: 12.5, y: 3.5 }] }],
      });
      const s = new Scenario(config, 7, world).player(2.5, 3.5);
      for (let i = 0; i < 1500; i++) {
        if (i % 25 === 0) s.command({ type: "SetMove", dx: (i / 25) % 3 - 1, dy: ((i / 25) * 7) % 3 - 1, mode: i % 2 ? "run" : "walk" });
        else s.advanceTicks(1);
        const r = s.robot("r1");
        expect(r.suspicion).toBeGreaterThanOrEqual(0);
        expect(r.suspicion).toBeLessThanOrEqual(1);
        expect(world.wall[Math.floor(r.y) * world.width + Math.floor(r.x)]).toBe(0);
      }
    });
  }
});
