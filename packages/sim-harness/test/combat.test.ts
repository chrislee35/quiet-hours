// covers: CMB-1, CMB-2, CMB-3, ROB-4
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_CONTENT, type CameraDef, type Content, type Effect, type ItemDef, type RobotDef } from "@qh/core";
import { Scenario, asciiWorld } from "../src/index.ts";
import { config } from "./helpers.ts";

const read = (rel: string) => readFileSync(new URL(`../../../content/${rel}`, import.meta.url), "utf8");
const items = Object.fromEntries((JSON.parse(read("items/items.json")) as ItemDef[]).map((i) => [i.id, i]));
const content: Content = { ...EMPTY_CONTENT, items };
const bot = (over: Partial<RobotDef> = {}): RobotDef => ({ id: "r1", kind: "warden", x: 3.5, y: 1.5, facing: Math.PI, route: null, ...over });
const corridor = (robots: RobotDef[], cameras: CameraDef[] = []) =>
  asciiWorld(["#".repeat(22), `#${".".repeat(20)}#`, "#".repeat(22)], [], { robots, cameras });
const setup = (effects: Effect[], robots: RobotDef[] = [bot()], cameras: CameraDef[] = []) =>
  new Scenario(config, 1, corridor(robots, cameras), content).command({ type: "ApplyEffects", effects });
const have = (id: string, n = 1): Effect => ({ add_item: [id, n] });
const use = (s: Scenario, id: string, dx = 1, dy = 0) => s.command({ type: "UseItem", id, dx, dy });
const refusal = (s: Scenario) => s.eventsOfType("ToolRefused").at(-1)?.reason;

describe("using tools", () => {
  it("refuses what is not a tool, what you do not have, and a tool with nothing to act on (and wastes nothing)", () => {
    const s = setup([have("scrap_wire"), have("stun_charge")]).player(10.5, 1.5);
    use(s, "scrap_wire");
    expect(refusal(s)).toBe("not_a_tool");
    use(s, "noise_maker");
    expect(refusal(s)).toBe("none_left");
    use(s, "stun_charge"); // the robot is 7 tiles away
    expect(refusal(s)).toBe("no_target");
    expect(s.sim.state.inventory.items.stun_charge).toBe(1);
  });
});

describe("decoy: distract, no fight", () => {
  it("a thrown noise-maker draws robots to where it lands, without raising the alert, and is used up", () => {
    const s = setup([have("noise_maker")], [bot({ x: 17.5, facing: 0 })]).player(1.5, 1.5);
    use(s, "noise_maker", 1, 0);
    s.expectEvent("ToolUsed", { kind: "decoy" });
    expect(s.sim.state.inventory.items.noise_maker).toBeUndefined();
    const noise = s.eventsOfType("NoiseEmitted").at(-1)!;
    expect(noise.source).toBe("decoy");
    expect(noise.x).toBeCloseTo(9.5, 1);
    s.advance(0.5);
    expect(s.robot("r1").mode).toBe("investigate");
    expect(s.alert).toBe(0);
    s.expectNoEvent("FightConsequences");
  });

  it("stops short of a wall instead of landing inside it", () => {
    const s = setup([have("noise_maker")], []).player(18.5, 1.5);
    use(s, "noise_maker", 1, 0);
    expect(s.eventsOfType("NoiseEmitted").at(-1)!.x).toBeLessThan(21);
  });
});

describe("cutters: quiet, reusable", () => {
  const cam: CameraDef = { id: "cam1", x: 3, y: 0, facing: Math.PI / 2 };
  it("disable a camera in reach and keep the cutters; the city sends a mender", () => {
    const s = setup([have("wire_cutters")], [bot({ id: "mender", kind: "mender", x: 15.5, facing: 0 })], [cam]).player(3.5, 1.5);
    use(s, "wire_cutters").expectEvent("CameraDisabled", { cameraId: "cam1" });
    expect(s.sim.state.inventory.items.wire_cutters).toBe(1);
    expect(s.alert).toBe(0);
    s.advance(config.repairs.cameraDelaySeconds + 15).expectEvent("RepairAssigned", { task: "camera" });
  });
  it("need a camera within reach", () => {
    const s = setup([have("wire_cutters")], [], [cam]).player(15.5, 1.5);
    use(s, "wire_cutters");
    expect(refusal(s)).toBe("no_target");
  });
});

describe("stun: a fight, with a price (CMB-2)", () => {
  it("knocks the robot offline for the stated time, then it recovers", () => {
    const s = setup([have("stun_charge")]).player(2.5, 1.5);
    use(s, "stun_charge").expectEvent("RobotStunned", { robotId: "r1" });
    expect(s.sim.state.tick).toBeLessThan(s.robot("r1").jammedUntil);
    s.advance(5);
    expect(s.robot("r1").sees).toBe(false);
    s.expectNoEvent("PlayerCaught");
    s.advance(5);
    expect(s.sim.state.tick).toBeGreaterThan(s.robot("r1").jammedUntil);
  });

  it("always raises the alert to Hunting, costs the tool and a share of credits, and calls reinforcements", () => {
    const second = bot({ id: "r2", x: 9.5, facing: 0 });
    const s = setup([have("stun_charge"), { add_credits: 100 }], [bot(), second]).player(2.5, 1.5);
    use(s, "stun_charge");
    expect(s.alert).toBe(2);
    expect(s.sim.state.inventory.items.stun_charge).toBeUndefined();
    expect(s.sim.state.inventory.credits).toBe(75);
    s.expectEvent("FightConsequences", { creditsLost: 25 });
    expect(s.eventsOfType("AlertBroadcast")[0]!.recipients).toContain("r2");
    s.advance(2);
    expect(["investigate", "chase"]).toContain(s.robot("r2").mode);
  });

  it("puts an assault on the record of someone who has one, and not of a null", () => {
    const withRecord = setup([have("stun_charge"), { give_pass: { id: "p", label: "p", level: 0, origin: "issued" } }]).player(2.5, 1.5);
    use(withRecord, "stun_charge").expectEvent("InfractionRecorded", { kind: "assault" });
    const nul = setup([have("stun_charge")]).player(2.5, 1.5);
    use(nul, "stun_charge").expectNoEvent("InfractionRecorded");
  });

  it("is not available while held after being caught", () => {
    const s = setup([have("stun_charge")]).player(3.0, 1.5).advance(3);
    expect(s.sim.state.processingUntil).toBeGreaterThan(0);
    use(s, "stun_charge");
    expect(s.eventsOfType("RobotStunned")).toHaveLength(0);
  });
});

describe("lethal force: rare, loud, recorded (CMB-3)", () => {
  const shoot = () => {
    const s = setup([have("contraband_slug_round"), { add_credits: 40 }], [bot(), bot({ id: "far", x: 19.5 })]).player(6.5, 1.5);
    return use(s, "contraband_slug_round");
  };

  it("destroys the robot for good, whatever happens later", () => {
    const s = shoot();
    expect(s.robot("r1").destroyed).toBe(true);
    s.advance(60);
    expect(s.robot("r1").destroyed).toBe(true);
    expect(s.robot("r1").sees).toBe(false);
    expect(s.eventsOfType("PlayerCaught").some((e) => e.robotId === "r1")).toBe(false);
  });

  it("is very loud, sets the lockdown alert, and leaves a flag the story can read", () => {
    const s = shoot();
    expect(s.eventsOfType("NoiseEmitted").at(-1)).toMatchObject({ source: "weapon", radius: 14 });
    expect(s.alert).toBe(3);
    expect(s.sim.state.flags.lethal_force_used).toBe(true);
    expect(s.sim.state.flags.robots_destroyed).toBe(1);
    s.expectEvent("RobotDestroyed", { robotId: "r1" });
  });

  it("the ammunition is contraband: an audit finds it", () => {
    const s = setup([have("contraband_slug_round")], [bot({ kind: "auditor", x: 3.5, facing: 0 })]).player(5.5, 1.5);
    s.advance(60);
    expect(s.eventsOfType("AuditFailed").some((e) => e.reason === "contraband")).toBe(true);
  });
});
