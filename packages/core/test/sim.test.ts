// covers: CORE-1, CORE-3, CORE-4, STE-4, NFR-3
import { describe, expect, it } from "vitest";
import { SYSTEM_ORDER, Sim, createInitialState, stateHash, step, type Command } from "../src/index.ts";
import { config } from "./helpers.ts";

const tps = config.sim.ticksPerSecond;

function run(sim: Sim, ticks: number, cmds: Command[] = []) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...sim.tick(i === 0 ? cmds : []));
  return events;
}

describe("sim step", () => {
  it("documents and keeps the update order", () => {
    expect(SYSTEM_ORDER.map((s) => s.name)).toEqual([
      "commands",
      "player",
      "zones",
      "clock",
      "npcs",
      "robot-perception",
      "robot-behavior",
      "alert",
      "demerits",
      "processing",
      "district-reactions",
    ]);
  });

  it("is pure: input state is not mutated", () => {
    const s0 = createInitialState(1, config);
    const before = stateHash(s0);
    step(s0, [{ type: "SetMove", dx: 1, dy: 0, mode: "walk" }], config);
    expect(stateHash(s0)).toBe(before);
  });

  it("increments tick by one per step", () => {
    const sim = new Sim(config, 1);
    run(sim, 10);
    expect(sim.state.tick).toBe(10);
  });

  it("same seed and commands give identical hashes over 1000 ticks", () => {
    const script = (sim: Sim) => {
      for (let i = 0; i < 1000; i++) {
        const cmds: Command[] =
          i % 100 === 0 ? [{ type: "SetMove", dx: Math.cos(i), dy: Math.sin(i), mode: i % 200 ? "run" : "walk" }] : [];
        sim.tick(cmds);
      }
      return sim.hash;
    };
    expect(script(new Sim(config, 99))).toBe(script(new Sim(config, 99)));
  });

  it("moves at config speed per mode and normalizes diagonals", () => {
    for (const [mode, speed] of [
      ["walk", config.player.walkSpeed],
      ["sneak", config.player.sneakSpeed],
      ["run", config.player.runSpeed],
    ] as const) {
      const sim = new Sim(config, 1);
      run(sim, tps, [{ type: "SetMove", dx: 1, dy: 1, mode }]); // one second, diagonal
      expect(Math.hypot(sim.state.player.x, sim.state.player.y)).toBeCloseTo(speed, 5);
    }
  });

  it("emits noise with the radius for the movement mode, and none when standing still", () => {
    const radii = { sneak: config.noise.sneakRadius, walk: config.noise.walkRadius, run: config.noise.runRadius };
    for (const mode of ["sneak", "walk", "run"] as const) {
      const sim = new Sim(config, 1);
      const events = run(sim, 3, [{ type: "SetMove", dx: 1, dy: 0, mode }]);
      const noises = events.filter((e) => e.type === "NoiseEmitted");
      expect(noises).toHaveLength(3);
      expect(noises.every((n) => n.type === "NoiseEmitted" && n.radius === radii[mode])).toBe(true);
    }
    const idle = new Sim(config, 1);
    expect(run(idle, 30).some((e) => e.type === "NoiseEmitted")).toBe(false);
  });

  it("emits curfew and Quiet Hours transitions as the clock advances", () => {
    const sim = new Sim(config, 1);
    // 07:00 -> 22:00 is 15 game hours = 900 game minutes = 900 real seconds at 1 min/s.
    const events = run(sim, 900 * tps + 1);
    expect(events.filter((e) => e.type === "CurfewStarted")).toHaveLength(1);
    expect(events.some((e) => e.type === "QuietHoursStarted")).toBe(false);
    const later = run(sim, 5 * 60 * tps); // to ~03:00
    expect(later.some((e) => e.type === "DayChanged")).toBe(true);
    expect(later.some((e) => e.type === "QuietHoursStarted")).toBe(true);
  });

  it("notifies subscribers via the bus", () => {
    const sim = new Sim(config, 1);
    const seen: string[] = [];
    const off = sim.bus.subscribe((e) => seen.push(e.type));
    run(sim, 2, [{ type: "SetMove", dx: 1, dy: 0, mode: "walk" }]);
    off();
    run(sim, 2);
    expect(seen).toEqual(["NoiseEmitted", "NoiseEmitted"]);
  });

  it("snapshots are copies", () => {
    const sim = new Sim(config, 1);
    const snap = sim.snapshot();
    snap.player.x = 999;
    expect(sim.state.player.x).toBe(0);
  });

  it("state is JSON-serializable (save groundwork)", () => {
    const sim = new Sim(config, 5);
    run(sim, 50, [{ type: "SetMove", dx: 1, dy: 0, mode: "walk" }]);
    const restored = new Sim(config, 5, { initial: JSON.parse(JSON.stringify(sim.state)) });
    run(sim, 100);
    run(restored, 100);
    expect(restored.hash).toBe(sim.hash);
  });
});
