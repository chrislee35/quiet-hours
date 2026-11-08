// covers: FAIL-1, FAIL-2, FAIL-3, FAIL-5, ALR-2
import { describe, expect, it } from "vitest";
import { Rng, type Effect, type RobotDef, type RouteDef } from "@qh/core";
import { Scenario, asciiWorld } from "../src/index.ts";
import { config } from "./helpers.ts";

const guard: RobotDef = { id: "w1", kind: "warden", x: 5.5, y: 1.5, facing: Math.PI, route: null };
// Player starts at S; the holding cell H and the locker K are at the far end of the corridor.
const world = () => asciiWorld(["#################", "#S...........H.K#", "#################"], [], { robots: [guard] });

const loot: Effect[] = [
  { add_item: ["wire", 2] }, { add_item: ["keycard", 1] }, { add_credits: 75 },
  { set_flag: ["met_wren", true] }, { give_clue: { id: "pump4_shift", from: "odd_sam" } }, { adjust_trust: ["pallas", 1] },
];

function caughtScenario() {
  const s = new Scenario(config, 1, world()).command({ type: "ApplyEffects", effects: loot });
  while (s.eventsOfType("PlayerProcessed").length === 0) {
    s.advanceTicks(1);
    if (s.sim.state.tick > 30 * 30) throw new Error("never caught");
  }
  return s;
}

describe("processing (soft failure)", () => {
  it("catching the player processes them: holding cell, confiscation, setback, arrest count", () => {
    const s = caughtScenario();
    s.expectEvent("PlayerCaught").expectEvent("PlayerProcessed", { arrestCount: 1 });
    const st = s.sim.state;
    expect(st.player.x).toBeCloseTo(13.5, 5); // the holding spawn
    expect(st.inventory).toEqual({ credits: 0, items: {} });
    expect(st.locker).toEqual({ credits: 75, items: { wire: 2, keycard: 1 }, passes: [] });
    expect(st.arrestCount).toBe(1);
    expect(s.alert).toBeGreaterThanOrEqual(config.failure.alertAfterProcessing);
  });

  it("never touches clues, flags, or trust (FAIL-5)", () => {
    const st = caughtScenario().sim.state;
    expect(st.flags.met_wren).toBe(true);
    expect(st.clues.pump4_shift).toBeDefined();
    expect(st.trust.pallas).toBe(1);
  });

  it("robots stand down so the player is not instantly re-caught", () => {
    const s = caughtScenario();
    const r = s.robot("w1");
    expect(r.mode).toBe("patrol");
    expect(r.suspicion).toBe(0);
    expect(r.path).toEqual([]);
  });

  it("holds the player for the configured time, then releases them", () => {
    const s = caughtScenario();
    const x = s.sim.state.player.x;
    s.command({ type: "SetMove", dx: -1, dy: 0, mode: "run" }).command({ type: "Interact" });
    s.advance(config.failure.holdSeconds - 1);
    expect(s.sim.state.player.x).toBe(x); // frozen
    s.expectNoEvent("PlayerReleased");
    s.advance(2);
    s.expectEvent("PlayerReleased");
    s.command({ type: "SetMove", dx: -1, dy: 0, mode: "walk" }).advance(1);
    expect(s.sim.state.player.x).toBeLessThan(x); // free to move again
  });

  it("items can be recovered from the locker by interacting with it", () => {
    const s = caughtScenario();
    s.advance(config.failure.holdSeconds + 1);
    s.player(14.5, 1.5).command({ type: "Interact" });
    s.expectEvent("LockerOpened", { credits: 75 });
    expect(s.sim.state.inventory).toEqual({ credits: 75, items: { wire: 2, keycard: 1 } });
    expect(s.sim.state.locker).toEqual({ credits: 0, items: {}, passes: [] });
    s.clearEvents().command({ type: "Interact" }); // now empty: nothing happens
    expect(s.events).toEqual([]);
  });

  it("repeat arrests increment the count and add to the locker without losing earlier loot", () => {
    const s = caughtScenario();
    s.advance(config.failure.holdSeconds + 1);
    s.command({ type: "ApplyEffects", effects: [{ add_item: ["wire", 1] }, { add_credits: 5 }] });
    // Walk back toward the guard and get caught again.
    s.player(1.5, 1.5);
    s.clearEvents();
    for (let t = 0; s.eventsOfType("PlayerProcessed").length === 0; t++) {
      s.advanceTicks(1);
      if (t > 40 * 30) throw new Error("never caught again");
    }
    expect(s.sim.state.arrestCount).toBe(2);
    expect(s.sim.state.locker).toEqual({ credits: 80, items: { wire: 3, keycard: 1 }, passes: [] });
  });

  it("without a holding spawn the player stays put but is still processed and frozen", () => {
    const w = asciiWorld(["##########", "#S.......#", "##########"], [], { robots: [{ ...guard, x: 5.5 }] });
    const s = new Scenario(config, 1, w).command({ type: "ApplyEffects", effects: [{ add_credits: 10 }] });
    while (s.eventsOfType("PlayerProcessed").length === 0) s.advanceTicks(1);
    expect(s.sim.state.processingUntil).toBeGreaterThan(s.sim.state.tick);
  });
});

describe("invariants over many arrests", () => {
  const routes: RouteDef[] = [{ id: "loop", points: [{ x: 3.5, y: 1.5 }, { x: 11.5, y: 1.5 }] }];
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`clues, flags and trust survive any number of arrests; items are conserved (seed ${seed})`, () => {
      const w = asciiWorld(["#################", "#S...........H.K#", "#################"], [], {
        robots: [{ ...guard, route: "loop", x: 3.5 }], routes,
      });
      const s = new Scenario(config, seed, w).command({ type: "ApplyEffects", effects: loot });
      const rng = new Rng(seed);
      const total = () => {
        const st = s.sim.state;
        const sum = (a: Record<string, number>) => Object.values(a).reduce((x, y) => x + y, 0);
        return sum(st.inventory.items) + sum(st.locker.items);
      };
      const credits = () => s.sim.state.inventory.credits + s.sim.state.locker.credits;
      for (let i = 0; i < 2400; i++) {
        if (i % 30 === 0) {
          s.command({ type: "SetMove", dx: rng.int(-1, 1), dy: 0, mode: rng.pick(["walk", "run", "sneak"] as const) });
          if (rng.chance(0.2)) s.command({ type: "Interact" });
        } else s.advanceTicks(1);
        const st = s.sim.state;
        expect(st.flags.met_wren).toBe(true);
        expect(st.clues.pump4_shift?.status).toBe("unverified");
        expect(st.trust.pallas).toBe(1);
        expect(total()).toBe(3); // 2 wire + 1 keycard, wherever they are
        expect(credits()).toBe(75);
      }
      expect(s.sim.state.arrestCount).toBeGreaterThan(0);
    });
  }
});
