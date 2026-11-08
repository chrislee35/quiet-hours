// covers: CORE-3, WLD-8
import { describe, expect, it } from "vitest";
import { gameTimeAt, inWindow, withOverrides } from "../src/index.ts";
import { config } from "./helpers.ts";

const tps = config.sim.ticksPerSecond;
/** Tick at which `minutes` game minutes have elapsed since start. */
const afterMinutes = (m: number) => Math.round((m / config.clock.gameMinutesPerRealSecond) * tps);

describe("gameTimeAt", () => {
  it("starts on day 1 at 07:00, no curfew", () => {
    const t = gameTimeAt(0, config);
    expect(t).toMatchObject({ day: 1, hour: 7, minute: 0, isCurfew: false, isQuietHours: false });
  });

  it("rolls over to the next day at midnight", () => {
    const t = gameTimeAt(afterMinutes(17 * 60), config); // 07:00 + 17h = 00:00
    expect(t).toMatchObject({ day: 2, hour: 0, minute: 0 });
  });

  it("curfew spans midnight: on at 22:00, off at 06:00", () => {
    expect(gameTimeAt(afterMinutes(15 * 60 - 1), config).isCurfew).toBe(false); // 21:59
    expect(gameTimeAt(afterMinutes(15 * 60), config).isCurfew).toBe(true); // 22:00
    expect(gameTimeAt(afterMinutes(23 * 60 - 1), config).isCurfew).toBe(true); // 05:59 next day
    expect(gameTimeAt(afterMinutes(23 * 60), config).isCurfew).toBe(false); // 06:00
  });

  it("Quiet Hours are 02:00-05:00 and sit inside curfew", () => {
    const at = (h: number) => gameTimeAt(afterMinutes((h + 24 - 7) * 60), config);
    expect(at(1).isQuietHours).toBe(false);
    expect(at(2).isQuietHours).toBe(true);
    expect(at(4).isQuietHours).toBe(true);
    expect(at(5).isQuietHours).toBe(false);
    expect(at(3).isCurfew).toBe(true);
  });

  it("respects a different clock rate from config", () => {
    const slow = withOverrides(config, { clock: { gameMinutesPerRealSecond: 0.5 } });
    expect(gameTimeAt(tps * 120, slow).minuteOfDay).toBe(7 * 60 + 60);
  });
});

describe("inWindow", () => {
  it("handles plain and wrapping windows with half-open ends", () => {
    expect(inWindow(120, 120, 300)).toBe(true);
    expect(inWindow(300, 120, 300)).toBe(false);
    expect(inWindow(0, 1320, 360)).toBe(true);
    expect(inWindow(720, 1320, 360)).toBe(false);
  });
});
