// covers: STE-1, STE-2, STE-3, STE-6, ALR-2, FAIL-2
import { describe, expect, it } from "vitest";
import { withOverrides, type Effect, type RobotDef } from "@qh/core";
import { Scenario, asciiWorld } from "../src/index.ts";
import { config as base } from "./helpers.ts";

/** A guard facing a corridor. Cells 4..11 are the restricted vault (permission 2); the guard sees everything. */
const guard: RobotDef = { id: "w1", kind: "warden", x: 1.5, y: 1.5, facing: 0, route: null };
const world = () =>
  asciiWorld(["###############", "#S............#", "###############"], [
    { id: "street", requiredPermission: 0, curfew: true, rect: [0, 0, 15, 3] },
    { id: "vault", requiredPermission: 2, rect: [4, 0, 8, 3] },
  ], { robots: [guard] });

/** A guard that can see but never reaches the player, so ledgers can be observed without arrests. */
const slowConfig = withOverrides(base, { warden: { chaseSpeed: 0 } });

const give = (id: string, extra: object = {}): Effect => ({ give_pass: { id, label: id, level: 2, origin: "issued", ...extra } });
const setup = (cfg = slowConfig, effects: Effect[] = [], x = 5.5) =>
  new Scenario(cfg, 1, world()).command({ type: "ApplyEffects", effects }).player(x, 1.5);

/** Seconds until the guard identifies the player (RobotSpotted), or null within `limit`. */
function timeToSpot(s: Scenario, limit = 60): number | null {
  for (let t = 0; t < limit * s.config.sim.ticksPerSecond; t++) {
    s.advanceTicks(1);
    if (s.eventsOfType("RobotSpotted").length > 0) return (t + 1) / s.config.sim.ticksPerSecond;
  }
  return null;
}

describe("how the ID check changes suspicion", () => {
  it("a null (no record) is pending review: baseline suspicion, and no demerits at all", () => {
    const s = setup();
    const t = timeToSpot(s)!;
    expect(t).toBeGreaterThan(1);
    s.advance(20);
    s.expectNoEvent("InfractionRecorded");
    expect(s.sim.state.demerits.points).toBe(0);
  });

  it("holding a pass that does not cover the zone is a violation: faster suspicion and demerits", () => {
    const nullTime = timeToSpot(setup())!;
    const s = setup(slowConfig, [give("weak", { level: 1 })]);
    const t = timeToSpot(s)!;
    expect(t).toBeLessThan(nullTime);
    expect(t / nullTime).toBeGreaterThan(1 / base.identity.violationGainFactor - 0.15);
    expect(t / nullTime).toBeLessThan(1 / base.identity.violationGainFactor + 0.15);
    s.expectEvent("InfractionRecorded", { kind: "restricted_zone" });
  });

  it("holding a valid pass makes the guard indifferent: never spotted, never any demerits", () => {
    const s = setup(slowConfig, [give("vault_pass")]);
    expect(timeToSpot(s, 60)).toBeNull();
    expect(s.robot("w1").suspicion).toBe(0);
    s.expectNoEvent("InfractionRecorded");
  });

  it("an expired pass counts as a violation", () => {
    const s = setup(slowConfig, [give("old", { expiresInMinutes: 1 })]); // 30 ticks of validity
    s.advance(5);
    s.expectEvent("InfractionRecorded", { kind: "restricted_zone" });
  });

  it("the same pass is fine in the open street where nothing is restricted", () => {
    const s = setup(slowConfig, [give("weak", { level: 1 })], 2.5);
    s.advance(20);
    s.expectNoEvent("InfractionRecorded");
  });
});

describe("demerit ledger", () => {
  it("does not count the same infraction twice within the cooldown, then counts again", () => {
    const s = setup(slowConfig, [give("weak", { level: 1 })]);
    s.advance(base.demerits.cooldownSeconds - 1);
    expect(s.eventsOfType("InfractionRecorded")).toHaveLength(1);
    s.advance(2);
    expect(s.eventsOfType("InfractionRecorded")).toHaveLength(2);
  });

  it("crossing the check threshold raises the alert to Suspicious; the enforcer threshold to Hunting", () => {
    const s = setup(slowConfig, [give("weak", { level: 1 })]);
    // Keep the alert low so we see the demerit threshold act on it: it starts at Calm.
    s.edit((st) => { st.robots[0]!.sees = false; });
    while (s.eventsOfType("DemeritThreshold").length === 0 && s.sim.state.tick < 30 * 120) s.advanceTicks(1);
    s.expectEvent("DemeritThreshold", { level: "check" });
    expect(s.alert).toBeGreaterThanOrEqual(1);
    while (!s.eventsOfType("DemeritThreshold").some((e) => e.level === "enforcer") && s.sim.state.tick < 30 * 240) s.advanceTicks(1);
    s.expectEvent("DemeritThreshold", { level: "enforcer" });
    expect(s.alert).toBeGreaterThanOrEqual(2);
  });

  it("points drain over time without firing events", () => {
    const s = setup(slowConfig, []).edit((st) => { st.demerits.points = 4; });
    s.advance(30);
    expect(s.sim.state.demerits.points).toBeCloseTo(4 - 30 * base.demerits.decayPerSecond, 1);
    s.expectNoEvent("DemeritThreshold");
  });

  it("curfew: a pass-holder seen out is marked unless exempt; a null is not", () => {
    const night = withOverrides(slowConfig, { clock: { startMinuteOfDay: 23 * 60 } }); // 23:00, inside curfew
    const out = (effects: Effect[]) => setup(night, effects, 2.5).advance(10);
    out([give("citizen", { level: 0 })]).expectEvent("InfractionRecorded", { kind: "curfew" });
    out([give("night_shift", { level: 0, curfewExempt: true })]).expectNoEvent("InfractionRecorded");
    out([]).expectNoEvent("InfractionRecorded");
    const day = withOverrides(slowConfig, { clock: { startMinuteOfDay: 12 * 60 } });
    setup(day, [give("citizen", { level: 0 })], 2.5).advance(10).expectNoEvent("InfractionRecorded");
  });
});

describe("processing and identity", () => {
  it("being caught confiscates every pass into the locker and clears the infraction slate; the locker returns them", () => {
    const s = new Scenario(base, 1, asciiWorld(["#################", "#S...........H.K#", "#################"], [], {
      robots: [{ ...guard, x: 5.5, facing: Math.PI }],
    })).command({ type: "ApplyEffects", effects: [give("weak", { level: 1, zones: ["elsewhere"] })] });
    s.edit((st) => { st.demerits.points = 4; });
    while (s.eventsOfType("PlayerProcessed").length === 0 && s.sim.state.tick < 30 * 40) s.advanceTicks(1);
    s.expectEvent("PlayerProcessed");
    const st = s.sim.state;
    expect(st.passes).toEqual([]);
    expect(st.locker.passes.map((p) => p.id)).toEqual(["weak"]);
    expect(st.demerits).toEqual({ points: 0, level: 0, last: {} });
    s.advance(base.failure.holdSeconds + 1).player(14.5, 1.5).command({ type: "Interact" });
    s.expectEvent("LockerOpened").expectEvent("PassGained", { passId: "weak" });
    expect(s.sim.state.passes.map((p) => p.id)).toEqual(["weak"]);
    expect(s.sim.state.locker.passes).toEqual([]);
  });
});
