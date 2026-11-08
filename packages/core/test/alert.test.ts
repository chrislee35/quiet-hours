// covers: ALR-1, ALR-2
import { describe, expect, it } from "vitest";
import { alertSystem, createInitialState, type AlertLevel, type Ctx, type GameEvent, type SimState } from "../src/index.ts";
import { EMPTY_CONTENT, OPEN_WORLD } from "../src/index.ts";
import { config } from "./helpers.ts";

const tps = config.sim.ticksPerSecond;
const decayTicks = config.alert.decaySeconds * tps;
const cooldownTicks = config.alert.sightingCooldownSeconds * tps;

function setup(level: AlertLevel = 0, robotCount = 2) {
  const state: SimState = createInitialState(1, config);
  state.alert.level = level;
  state.alert.quietSince = 0;
  state.robots = Array.from({ length: robotCount }, (_, i) => ({
    id: `r${i}`, kind: "warden" as const, x: 0, y: 0, facing: 0, mode: "patrol" as const, route: null, routeIndex: 0,
    target: null, path: [], pathGoal: null, arrived: false, dwell: 0, dwellTotal: 0, lookBase: 0, suspicion: 0, sees: false,
  }));
  const events: GameEvent[] = [];
  /** Advance to `tick` and run the alert system with the given facts. */
  const at = (tick: number, o: { sees?: boolean; spotted?: boolean } = {}) => {
    state.tick = tick;
    state.robots.forEach((r) => (r.sees = o.sees ?? false));
    const tickEvents: GameEvent[] = o.spotted ? [{ type: "RobotSpotted", tick, robotId: "r0" }] : [];
    const ctx: Ctx = { state, config, world: OPEN_WORLD, content: EMPTY_CONTENT, events: tickEvents, commands: [] };
    alertSystem(ctx);
    events.push(...tickEvents.filter((e) => e.type === "AlertChanged"));
    return state.alert.level;
  };
  return { state, events, at };
}

describe("alert raising", () => {
  it("a sighting raises exactly one step and reports it", () => {
    const { at, events } = setup(0);
    expect(at(10, { sees: true, spotted: true })).toBe(1);
    expect(events).toEqual([{ type: "AlertChanged", tick: 10, from: 0, to: 1 }]);
  });

  it("respects the sighting cooldown, then raises again", () => {
    const { at } = setup(0);
    at(100, { sees: true, spotted: true });
    expect(at(100 + cooldownTicks - 1, { sees: true, spotted: true })).toBe(1);
    expect(at(100 + cooldownTicks, { sees: true, spotted: true })).toBe(2);
  });

  it("never exceeds Lockdown", () => {
    const { at } = setup(3);
    expect(at(5000, { sees: true, spotted: true })).toBe(3);
  });
});

describe("alert decay", () => {
  it("drops one step per decay interval of out-of-sight time", () => {
    const { at } = setup(3);
    expect(at(decayTicks - 1)).toBe(3);
    expect(at(decayTicks)).toBe(2);
    expect(at(decayTicks + decayTicks - 1)).toBe(2);
    expect(at(2 * decayTicks)).toBe(1);
    expect(at(3 * decayTicks)).toBe(0);
    expect(at(10 * decayTicks)).toBe(0);
  });

  it("is held while any robot can see the player, then restarts the full interval", () => {
    const { at } = setup(2);
    let lastSeen = 0;
    for (let t = 0; t < 3 * decayTicks; t += 100) {
      lastSeen = t; // quietSince follows the most recent tick on which a robot saw the player
      expect(at(t, { sees: true })).toBe(2);
    }
    expect(at(lastSeen + decayTicks - 1)).toBe(2);
    expect(at(lastSeen + decayTicks)).toBe(1);
  });

  it("a fresh raise restarts the decay clock", () => {
    const { at } = setup(1);
    at(decayTicks - 10, { sees: true, spotted: true }); // 1 -> 2
    expect(at(decayTicks + 50)).toBe(2);
    expect(at(decayTicks - 10 + decayTicks)).toBe(1);
  });
});
