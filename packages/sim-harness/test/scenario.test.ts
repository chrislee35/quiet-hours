// covers: NFR-10, STE-4, WLD-8, CORE-3
import { describe, expect, it } from "vitest";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

describe("Scenario harness", () => {
  it("running player makes loud noise and travels the expected distance", () => {
    const s = new Scenario(config)
      .player(2, 5)
      .command({ type: "SetMove", dx: 1, dy: 0, mode: "run" })
      .advance(2);
    s.expectEvent("NoiseEmitted", { radius: config.noise.runRadius });
    // One tick elapsed in command(); total moving ticks = 1 + 2s of ticks.
    const movedTicks = 1 + 2 * config.sim.ticksPerSecond;
    s.expectPlayerNear(2 + (config.player.runSpeed * movedTicks) / config.sim.ticksPerSecond, 5);
  });

  it("sneaking stays quiet compared with walking", () => {
    const sneak = new Scenario(config).command({ type: "SetMove", dx: 0, dy: 1, mode: "sneak" }).advance(1);
    const walk = new Scenario(config).command({ type: "SetMove", dx: 0, dy: 1, mode: "walk" }).advance(1);
    const max = (s: Scenario) => Math.max(...s.eventsOfType("NoiseEmitted").map((e) => e.radius));
    expect(max(sneak)).toBeLessThan(max(walk));
  });

  it("Quiet Hours begin at 02:00 on day 2", () => {
    const s = new Scenario(config);
    s.advanceToMinuteOfDay(120);
    s.expectEvent("QuietHoursStarted").expectEvent("CurfewStarted");
    s.expectTime({ day: 2, hour: 2, isQuietHours: true, isCurfew: true });
  });

  it("assertions fail loudly", () => {
    const s = new Scenario(config).advance(1);
    expect(() => s.expectEvent("NoiseEmitted")).toThrow();
    expect(() => s.expectNoEvent("DayChanged")).not.toThrow();
  });
});
