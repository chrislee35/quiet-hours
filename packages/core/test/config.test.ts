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
});
