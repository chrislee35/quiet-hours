// covers: CORE-3, WLD-5, WLD-8, STE-6
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_CONTENT, evalCondition, type Condition, minuteOf, parseActiveWhen, routineSpot, withOverrides, type Content, type Effect, type RobotDef, type ServiceDef, type SpotDef } from "@qh/core";
import { Scenario, asciiWorld } from "../src/index.ts";
import { config } from "./helpers.ts";

const read = (rel: string) => readFileSync(new URL(`../../../content/${rel}`, import.meta.url), "utf8");
const services = Object.fromEntries((JSON.parse(read("services/services.json")) as ServiceDef[]).map((s) => [s.id, s]));
const content: Content = { ...EMPTY_CONTENT, services };
const hall = ["#".repeat(22), `#${".".repeat(20)}#`, "#".repeat(22)];
const bot = (over: Partial<RobotDef> = {}): RobotDef => ({ id: "r1", kind: "warden", x: 3.5, y: 1.5, facing: 0, route: null, ...over });
const at = (s: Scenario, hhmm: string) => s.advanceToMinuteOfDay(minuteOf(hhmm));
const minutes = (n: number) => Math.round((n * config.sim.ticksPerSecond) / config.clock.gameMinutesPerRealSecond);

describe("routines (WLD-5)", () => {
  const routine = [{ at: "06:00", spot: "a" }, { at: "12:00", spot: "b" }, { at: "22:00", spot: "away" }];

  it("picks the spot of the latest entry that has begun, carrying the last one over midnight", () => {
    expect(routineSpot(routine, minuteOf("05:59"))).toBe("away"); // 22:00 carries over
    expect(routineSpot(routine, minuteOf("06:00"))).toBe("a");
    expect(routineSpot(routine, minuteOf("11:59"))).toBe("a");
    expect(routineSpot(routine, minuteOf("12:00"))).toBe("b");
    expect(routineSpot(routine, minuteOf("23:30"))).toBe("away");
    expect(routineSpot([], 600)).toBeNull();
    expect(minuteOf("7:05")).toBe(425);
    expect(minuteOf("25:00")).toBe(-1);
  });

  const spots: SpotDef[] = [{ id: "a", x: 2, y: 1 }, { id: "b", x: 18, y: 1 }];
  const world = () => asciiWorld(hall, [], { spots, npcs: [{ id: "sam", x: 2, y: 1, dialogue: "x", routine }] });
  const npc = (s: Scenario) => s.sim.state.npcs.sam!;

  it("walks to the next spot at walking speed, and is somewhere real the whole way", () => {
    const s = new Scenario(config, 1, world(), content);
    at(s, "11:59");
    expect(npc(s).x).toBeCloseTo(2.5, 1);
    s.advanceTicks(minutes(2)); // past noon
    expect(npc(s).spot).toBe("b");
    const mid = npc(s).x;
    expect(mid).toBeGreaterThan(2.6);
    expect(mid).toBeLessThan(18.4);
    s.advance(16 / config.npcs.walkSpeed + 1);
    expect(npc(s).x).toBeCloseTo(18.5, 1);
  });

  it("goes off duty (away) and returns by appearing at the spot", () => {
    const s = new Scenario(config, 1, world(), content);
    at(s, "22:00").advanceTicks(2);
    expect(npc(s).away).toBe(true);
    at(s, "06:00").advanceTicks(2);
    expect(npc(s).away).toBe(false);
    expect(npc(s).x).toBeCloseTo(2.5, 1);
  });

  it("an absent person cannot be talked to; a present one can, wherever they have walked", () => {
    const s = new Scenario(config, 1, world(), { ...content, dialogues: {} });
    at(s, "22:30");
    expect(s.sim.prompt()).toBeNull();
    at(s, "13:00").advance(14);
    s.player(npc(s).x + 0.6, npc(s).y);
    expect(s.sim.prompt()?.id).toBe("sam");
  });

  it("a person with no routine stands where the map put them", () => {
    const w = asciiWorld(hall, [], { npcs: [{ id: "sam", x: 4, y: 1, dialogue: "x" }] });
    const s = new Scenario(config, 1, w, content);
    at(s, "13:00");
    expect(npc(s).x).toBeCloseTo(4.5, 3);
  });

  it("a routine that names a spot the map lacks, or a bad time, is a map error", () => {
    expect(() => asciiWorld(hall, [], { spots, npcs: [{ id: "sam", x: 2, y: 1, dialogue: "x", routine: [{ at: "6am", spot: "a" }] }] })).toThrow(/bad time/);
    expect(() => asciiWorld(hall, [], { spots, npcs: [{ id: "sam", x: 2, y: 1, dialogue: "x", routine: [{ at: "06:00", spot: "nowhere" }] }] })).toThrow(/unknown spot/);
  });
});

describe("rosters by the clock (WLD-8: Quiet Hours changes who is on patrol)", () => {
  it("parses time windows, inside and outside", () => {
    expect(parseActiveWhen("time:02:00-05:00")).toEqual({ kind: "time", start: 120, end: 300, not: false });
    expect(parseActiveWhen("!time:02:00-05:00")).toMatchObject({ not: true });
    expect(parseActiveWhen("time:25:00-05:00")).toBeNull();
  });

  const roster = () =>
    new Scenario(config, 1, asciiWorld(hall, [], {
      robots: [
        bot({ id: "day", kind: "warden", activeWhen: "!time:02:00-05:00" }),
        bot({ id: "night", kind: "auditor", x: 9.5, activeWhen: "time:02:00-05:00" }),
        bot({ id: "always", kind: "sentry", x: 15.5 }),
      ],
    }), content).player(19.5, 1.5);

  it("wardens work by day and stand down at night; auditors come out only at night", () => {
    const s = roster();
    at(s, "12:00").advanceTicks(2);
    expect(s.robot("day").dormant).toBe(false);
    expect(s.robot("night").dormant).toBe(true);
    at(s, "02:00").advanceTicks(2);
    expect(s.robot("day").dormant).toBe(true);
    expect(s.robot("night").dormant).toBe(false);
    s.expectEvent("RobotStoodDown", { robotId: "day" }).expectEvent("RobotActivated", { robotId: "night" });
    expect(s.robot("always").dormant).toBe(false);
    at(s, "05:00").advanceTicks(2);
    expect(s.robot("night").dormant).toBe(true);
    expect(s.robot("day").dormant).toBe(false);
  });

  it("a stood-down robot cannot see the player", () => {
    const s = new Scenario(config, 1, asciiWorld(hall, [], { robots: [bot({ activeWhen: "!time:02:00-05:00" })] }), content).player(1.5, 1.5);
    at(s, "03:00").player(6.5, 1.5).advance(20);
    s.expectNoEvent("RobotSpotted");
  });
});

describe("curfew is strictest in Quiet Hours (WLD-8)", () => {
  const cfg = withOverrides(config, { demerits: { cooldownSeconds: 0 } });
  const pass: Effect = { give_pass: { id: "p", label: "p", level: 0, origin: "issued" } };
  const world = asciiWorld(hall, [{ id: "z", requiredPermission: 0, curfew: true, rect: [0, 0, 10, 3] }], { robots: [bot({ kind: "sentry" })] });
  const points = (time: string) => {
    const s = new Scenario(cfg, 1, world, content).command({ type: "ApplyEffects", effects: [pass] }).player(15.5, 1.5);
    at(s, time).player(6.5, 1.5).advance(2);
    return s.eventsOfType("InfractionRecorded").find((e) => e.kind === "curfew")?.points;
  };
  it("the same offence earns double during Quiet Hours, and none by day", () => {
    expect(points("23:00")).toBe(config.demerits.curfewPoints);
    expect(points("03:00")).toBe(config.demerits.curfewPoints * config.demerits.quietHoursCurfewFactor);
    expect(points("12:00")).toBeUndefined();
  });
});

describe("hacking and forgery windows (WLD-8)", () => {
  const w = asciiWorld(hall);
  const use = (s: Scenario) => s.command({ type: "ApplyEffects", effects: [{ use_service: "quiet_hours_forgery" }] });
  it("the night forgery is refused by day and available in Quiet Hours", () => {
    const day = new Scenario(config, 1, w, content).command({ type: "ApplyEffects", effects: [{ add_credits: 50 }] });
    at(day, "12:00");
    use(day);
    expect(day.eventsOfType("ServiceRefused").at(-1)?.reason).toBe("requirements");
    const night = new Scenario(config, 1, w, content).command({ type: "ApplyEffects", effects: [{ add_credits: 50 }] });
    at(night, "03:00");
    use(night).expectEvent("ServiceUsed", { serviceId: "quiet_hours_forgery" });
    expect(night.sim.state.passes[0]).toMatchObject({ origin: "forged" });
  });

  it("the conditions is_quiet_hours / is_curfew follow the clock", () => {
    const s = new Scenario(config, 1, w, content);
    const is = (c: Condition) => evalCondition(c, s.sim.state, config);
    at(s, "03:00").advanceTicks(1);
    expect([is({ is_quiet_hours: true }), is({ is_curfew: true })]).toEqual([true, true]);
    at(s, "12:00").advanceTicks(1);
    expect([is({ is_quiet_hours: true }), is({ is_curfew: true }), is({ is_quiet_hours: false })]).toEqual([false, false, true]);
    at(s, "23:00").advanceTicks(1);
    expect([is({ is_quiet_hours: true }), is({ is_curfew: true })]).toEqual([false, true]);
  });
});
