// covers: WLD-3, WLD-4, ALR-4, ROB-5
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_CONTENT, parseActiveWhen, type CameraDef, type Content, type Effect, type ItemDef, type ReactionDef, type RobotDef } from "@qh/core";
import { Scenario, asciiWorld } from "../src/index.ts";
import { config } from "./helpers.ts";

const read = (rel: string) => readFileSync(new URL(`../../../content/${rel}`, import.meta.url), "utf8");
const reactions = Object.fromEntries((JSON.parse(read("reactions/city.json")) as ReactionDef[]).map((r) => [r.id, r]));
const items = Object.fromEntries((JSON.parse(read("items/items.json")) as ItemDef[]).map((i) => [i.id, i]));
const content: Content = { ...EMPTY_CONTENT, reactions, items };
const bot = (over: Partial<RobotDef> = {}): RobotDef => ({ id: "r1", kind: "warden", x: 3.5, y: 1.5, facing: Math.PI, route: null, ...over });
const world = (robots: RobotDef[] = [], cameras: CameraDef[] = []) =>
  asciiWorld(["#".repeat(22), `#${".".repeat(20)}#`, "#".repeat(22)], [], { robots, cameras });
const start = (robots: RobotDef[] = [], effects: Effect[] = [], cameras: CameraDef[] = [], c = content) =>
  new Scenario(config, 1, world(robots, cameras), c).command({ type: "ApplyEffects", effects });
const metric = (s: Scenario, m: "order" | "power" | "contentment") => s.sim.state.metrics[m];

describe("district state", () => {
  it("is set by effects, read by conditions, and each change is an event", () => {
    const s = start([], [{ set_district: ["stacks", "power", "off"] }]);
    expect(s.sim.state.district.stacks?.power).toBe("off");
    s.expectEvent("DistrictChanged", { district: "stacks", key: "power", value: "off" });
    s.clearEvents?.();
    s.command({ type: "ApplyEffects", effects: [{ set_district: ["stacks", "power", "off"] }] });
    expect(s.eventsOfType("DistrictChanged")).toHaveLength(0); // setting the same value again is no change
  });

  it("parses activeWhen: equals, not-equals, numbers and booleans", () => {
    expect(parseActiveWhen("stacks:patrolSet=reinforced")).toMatchObject({ district: "stacks", key: "patrolSet", value: "reinforced", not: false });
    expect(parseActiveWhen("stacks:power!=off")).toMatchObject({ not: true, value: "off" });
    expect(parseActiveWhen("a:b=3")).toMatchObject({ value: 3 });
    expect(parseActiveWhen("a:b=true")).toMatchObject({ value: true });
    expect(parseActiveWhen("nonsense")).toBeNull();
  });
});

describe("robots and cameras that come and go", () => {
  const reinforcement = bot({ id: "extra", kind: "heavy", x: 10.5, facing: 0, activeWhen: "stacks:patrolSet=reinforced" });

  it("a reinforcement robot is absent until the district calls for it, then it sees and hunts", () => {
    const s = start([reinforcement], []).player(14.5, 1.5);
    s.advance(10);
    expect(s.robot("extra").dormant).toBe(true);
    expect(s.robot("extra").sees).toBe(false);
    s.expectNoEvent("RobotSpotted");
    s.command({ type: "ApplyEffects", effects: [{ set_district: ["stacks", "patrolSet", "reinforced"] }] });
    s.expectEvent("RobotActivated", { robotId: "extra" });
    s.advance(10).expectEvent("RobotSpotted", { robotId: "extra" });
  });

  it("stands down again when the setting is reverted", () => {
    const s = start([reinforcement], [{ set_district: ["stacks", "patrolSet", "reinforced"] }]).player(30, 30);
    s.command({ type: "ApplyEffects", effects: [{ set_district: ["stacks", "patrolSet", "base"] }] }).expectEvent("RobotStoodDown");
    expect(s.robot("extra").dormant).toBe(true);
  });

  it("a power cut blinds a camera, and power coming back restores it", () => {
    const cam: CameraDef = { id: "cam1", x: 0, y: 1, facing: 0, activeWhen: "stacks:power!=off" };
    const spotted = (effects: Effect[]) => {
      const s = start([], effects, [cam]).player(4.5, 1.5);
      s.advance(20);
      return s.eventsOfType("CameraSpotted").length > 0;
    };
    expect(spotted([])).toBe(true);
    expect(spotted([{ set_district: ["stacks", "power", "off"] }])).toBe(false);
    expect(spotted([{ set_district: ["stacks", "power", "off"] }, { set_district: ["stacks", "power", "on"] }])).toBe(true);
  });
});

describe("city metrics respond to what the player does (WLD-4)", () => {
  it("start at their configured values", () => {
    const s = start();
    expect([metric(s, "order"), metric(s, "power"), metric(s, "contentment")]).toEqual([70, 80, 60]);
  });

  it("clamp to 0-100", () => {
    const s = start([], [{ adjust_metric: ["order", -500 as number] }]);
    expect(metric(s, "order")).toBe(0);
  });

  it("stunning a robot lowers order; cutting a camera lowers it a little; destroying one costs contentment too", () => {
    const s = start([bot()], [{ add_item: ["stun_charge", 1] }]).player(2.5, 1.5).command({ type: "UseItem", id: "stun_charge" });
    expect(metric(s, "order")).toBe(62);
    const cam: CameraDef = { id: "c", x: 2, y: 0, facing: 1.57 };
    const t = start([], [{ add_item: ["wire_cutters", 1] }], [cam]).player(2.5, 1.5).command({ type: "UseItem", id: "wire_cutters" });
    expect(metric(t, "order")).toBe(67);
    const u = start([bot()], [{ add_item: ["contraband_slug_round", 1] }]).player(2.5, 1.5).command({ type: "UseItem", id: "contraband_slug_round" });
    expect([metric(u, "order"), metric(u, "contentment")]).toEqual([55, 52]);
  });

  it("order and contentment drift back toward their start by the hour; power does not", () => {
    const s = start([], [{ adjust_metric: ["order", -20] }, { adjust_metric: ["contentment", -10] }, { adjust_metric: ["power", -30] }]);
    s.advance((3 * 60) / config.clock.gameMinutesPerRealSecond); // three in-game hours
    expect(metric(s, "order")).toBe(56);
    expect(metric(s, "contentment")).toBe(56);
    expect(metric(s, "power")).toBe(50);
  });
});

describe("MERIDIAN reallocates in response (ALR-4)", () => {
  const reinforcement = bot({ id: "extra", kind: "heavy", x: 15.5, facing: 0, activeWhen: "stacks:patrolSet=reinforced" });

  it("order falling below the threshold brings reinforcements; recovering sends them away", () => {
    const s = start([reinforcement], [{ adjust_metric: ["order", -10] }]).player(30, 30);
    expect(s.sim.state.district.stacks?.patrolSet).toBeUndefined();
    s.command({ type: "ApplyEffects", effects: [{ adjust_metric: ["order", -20] }] });
    expect(s.sim.state.district.stacks?.patrolSet).toBe("reinforced");
    expect(s.robot("extra").dormant).toBe(false);
    s.expectEvent("ReactionFired", { reactionId: "meridian_reinforces" }).expectEvent("RobotActivated");
    s.command({ type: "ApplyEffects", effects: [{ adjust_metric: ["order", 40] }] });
    expect(s.sim.state.district.stacks?.patrolSet).toBe("base");
    expect(s.robot("extra").dormant).toBe(true);
  });

  it("a sabotage event cuts the power, blinds the cameras, lowers the metrics, and the repair crews do not come for a power cut", () => {
    const cam: CameraDef = { id: "cam1", x: 0, y: 1, facing: 0, activeWhen: "stacks:power!=off" };
    const s = start([], [], [cam]).player(4.5, 1.5);
    s.command({ type: "ApplyEffects", effects: [{ emit: "sabotage_power" }] });
    expect(s.sim.state.district.stacks?.power).toBe("off");
    expect(metric(s, "power")).toBe(30);
    expect(metric(s, "order")).toBe(65);
    s.expectEvent("CameraPowerLost", { cameraId: "cam1" });
    s.advance(20).expectNoEvent("CameraSpotted");
  });

  it("works while a conversation or terminal has the world frozen", () => {
    const s = start();
    s.edit((st) => {
      st.conversation = { dialogueId: "x", node: "y" };
    });
    s.command({ type: "ApplyEffects", effects: [{ emit: "sabotage_power" }] });
    expect(s.sim.state.district.stacks?.power).toBe("off");
  });

  it("reactions cannot loop forever and once-only reactions fire once", () => {
    const loop: ReactionDef = { id: "loop", on: "MetricChanged", effects: [{ adjust_metric: ["power", -1] }] };
    const once: ReactionDef = { id: "once", on: "Custom", match: { name: "ping" }, once: true, effects: [{ adjust_metric: ["contentment", 1] }] };
    const c: Content = { ...content, reactions: { loop, once } };
    const s = start([], [], [], c).command({ type: "ApplyEffects", effects: [{ adjust_metric: ["power", -1] }] });
    expect(metric(s, "power")).toBeGreaterThan(70); // bounded chain, not a runaway
    s.command({ type: "ApplyEffects", effects: [{ emit: "ping" }] }).command({ type: "ApplyEffects", effects: [{ emit: "ping" }] });
    expect(s.eventsOfType("ReactionFired").filter((e) => e.reactionId === "once")).toHaveLength(1);
  });
});

describe("shipped reactions", () => {
  it("only listen for events that exist", () => {
    const src = read("../packages/core/src/events.ts");
    for (const r of Object.values(reactions)) expect(src, `reaction ${r.id} listens for ${r.on}`).toContain(`type: "${r.on}"`);
  });
});
