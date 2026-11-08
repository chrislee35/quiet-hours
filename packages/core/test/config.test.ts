// covers: NFR-8
import { describe, expect, it } from "vitest";
import { ConfigError, deepClone, validateConfig, withOverrides } from "../src/index.ts";
import { config } from "./helpers.ts";

describe("config", () => {
  it("accepts the shipped tuning file", () => {
    expect(config.noise.walkRadius).toBe(3);
  });

  it("reports every missing or invalid field", () => {
    const bad = deepClone(config) as any;
    delete bad.alert;
    bad.player.walkSpeed = "fast";
    expect(() => validateConfig(bad)).toThrow(ConfigError);
    try {
      validateConfig(bad);
    } catch (e) {
      expect((e as Error).message).toContain("alert");
      expect((e as Error).message).toContain("player.walkSpeed");
    }
  });

  it("rejects non-positive ticksPerSecond", () => {
    expect(() => withOverrides(config, { sim: { ticksPerSecond: 0 } })).toThrow(ConfigError);
  });

  it("overrides are applied to a copy, not the base", () => {
    const tweaked = withOverrides(config, { noise: { runRadius: 20 } });
    expect(tweaked.noise.runRadius).toBe(20);
    expect(config.noise.runRadius).toBe(8);
  });

  it("requires a complete profile for every robot type, with the right kinds of value", () => {
    const bad = deepClone(config) as any;
    delete bad.robots.hound.chaseSpeed;
    bad.robots.sentry.canChase = "no";
    delete bad.robots.heavy;
    try {
      validateConfig(bad);
      throw new Error("should have thrown");
    } catch (e) {
      const m = (e as Error).message;
      expect(m).toContain("robots.hound.chaseSpeed: expected a finite number");
      expect(m).toContain("robots.sentry.canChase: expected true or false");
      expect(m).toContain("robots.heavy");
    }
  });

  it("ships a profile for every robot type (six hostile, one maintenance)", () => {
    expect(Object.keys(config.robots).sort()).toEqual(["auditor", "checker", "heavy", "hound", "mender", "sentry", "warden"]);
    expect(config.robots.hound.chaseSpeed).toBeGreaterThan(config.player.runSpeed); // a Hound outruns a runner
    expect(config.robots.heavy.chaseSpeed).toBeLessThan(config.player.runSpeed);
    expect(config.robots.warden.chaseSpeed).toBeLessThan(config.player.runSpeed);
    expect(config.robots.sentry.canChase).toBe(false);
    expect(config.robots.auditor.thorough).toBe(true);
  });
});
