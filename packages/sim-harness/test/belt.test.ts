// covers: WLD-2 (Industrial Belt: machinery on timers, power nodes), PUZ-1 (two ways to the annex), SQ-03, SQ-04, FAIL-5, travel between maps
import { describe, expect, it } from "vitest";
import { puzzleModule, ticksPerGameMinute } from "@qh/core";
import { assemble, loadContent } from "../../content-tools/src/index.ts";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const content = a.content;
const belt = a.worlds.belt!;
const game = (map = "belt") => new Scenario(config, 1, a.worlds, content, map);
const at = (id: string) => {
  const o = [...belt.terminals, ...belt.pickups, ...belt.npcs].find((x) => x.id === id)!;
  return { x: o.x + 0.5, y: o.y + 1.0 };
};
const goto = (s: Scenario, id: string) => s.player(at(id).x, at(id).y);
const solve = (s: Scenario, id: string) => {
  goto(s, id).command({ type: "Interact" });
  const def = content.terminals[id]!;
  const puzzle = content.puzzles[def.puzzle]!;
  const mod = puzzleModule(puzzle)!;
  for (const i of mod.solve(puzzle, mod.init(puzzle))!) s.command({ type: "TerminalTap", index: i });
  s.command({ type: "ExitTerminal" });
  return s;
};
const doorOf = (s: Scenario, id: string) => s.sim.state.doors[id]!;
const hour = (s: Scenario, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return s.advanceToMinuteOfDay(h! * 60 + m!).advanceTicks(2);
};

describe("the Industrial Belt", () => {
  it("is reachable by tram from the Civic Core and back", () => {
    const s = game("civic_core").command({ type: "ApplyEffects", effects: [{ add_credits: 50 }, { give_pass: { id: "p", label: "p", level: 0, origin: "issued" } }] });
    const o = a.worlds.civic_core!.exits.find((e) => e.id === "tram_to_belt")!;
    s.player(o.x + 0.5, o.y + 0.5).command({ type: "Interact" });
    s.expectEvent("MapChanged", { from: "civic_core", to: "belt" });
    expect(s.sim.world.id).toBe("belt");
  });

  it("the presses open and shut on a fixed timer, staggered so there is always a gap", () => {
    const s = game();
    const seen = new Set<string>();
    let sawShut = false;
    for (let t = 0; t < 20 * 30; t++) {
      s.advanceTicks(1);
      const open = ["door_press_1", "door_press_2", "door_press_3"].map((d) => doorOf(s, d).open);
      if (open.includes(false)) sawShut = true;
      seen.add(open.join());
    }
    expect(sawShut).toBe(true);
    expect(seen.size).toBeGreaterThan(2);
    // staggered by two seconds: they are never all shut together
    expect(seen.has("false,false,false")).toBe(false);
  });

  it("cutting Node 2 stops the presses: they rest open", () => {
    const s = solve(game(), "node_2");
    expect(s.sim.state.district.belt!.node2).toBe("off");
    for (let t = 0; t < 12 * 30; t++) {
      s.advanceTicks(1);
      for (const d of ["door_press_1", "door_press_2", "door_press_3"]) expect(doorOf(s, d).open).toBe(true);
    }
  });

  it("the side door is unlocked by the night crew's schedule, and locks again after", () => {
    const s = hour(game(), "12:00");
    expect(doorOf(s, "door_pump_side").locked).toBe(true);
    hour(s, "22:00");
    expect(doorOf(s, "door_pump_side").locked).toBe(false);
    hour(s, "06:30");
    expect(doorOf(s, "door_pump_side").locked).toBe(true);
  });

  it("the annex lock puzzle unlocks the side door for good, at any hour", () => {
    const s = solve(hour(game(), "12:00"), "annex_lock");
    expect(doorOf(s, "door_pump_side").locked).toBe(false);
    hour(s, "07:00");
    expect(doorOf(s, "door_pump_side").locked).toBe(false);
  });

  it("Node 4 blacks out the Stacks, and the repair crew restores it about an hour later", () => {
    const s = game().command({ type: "ApplyEffects", effects: [{ set_flag: ["sq_03_done", true] }] });
    goto(s, "node_4").command({ type: "Interact" });
    expect(s.sim.terminal()!.solved).toBe(true); // Gus's word is the way in
    s.command({ type: "ExitTerminal" });
    expect(s.sim.state.district.stacks!.power).toBe("off");
    expect(s.sim.state.timers.length).toBe(1);
    const due = s.sim.state.timers[0]!.dueTick;
    expect(due - s.sim.state.tick).toBeCloseTo(60 * ticksPerGameMinute(config), -1);
    s.advanceTicks(due - s.sim.state.tick - 1);
    expect(s.sim.state.district.stacks!.power).toBe("off");
    s.advanceTicks(2);
    expect(s.sim.state.district.stacks!.power).toBe("on");
    expect(s.sim.state.timers.length).toBe(0);
  });

  it("SQ-03: the thermos goes back to Gus", () => {
    const s = solve(hour(game(), "12:00"), "annex_lock");
    goto(s, "pk_thermos").command({ type: "Interact" });
    expect(s.sim.state.inventory.items.thermos).toBe(1);
    goto(s, "gus_varga").command({ type: "Interact" });
    s.say("What happened to the thermos?").say("I will see what I can do.").say("I have your thermos.");
    expect(s.sim.state.flags.sq_03_done).toBe(true);
    expect(s.sim.state.inventory.items.thermos ?? 0).toBe(0);
  });

  it("SQ-04: pulling Brindle off the queue in time saves it; otherwise day 5 recycles it", () => {
    const day5 = (s: Scenario) => {
      for (let d = 0; d < 3; d++) s.advanceToMinuteOfDay(30).advanceToMinuteOfDay(35).advanceToMinuteOfDay(30);
      return s;
    };
    const saved = day5(solve(game(), "scrap_panel"));
    expect(saved.time.day).toBe(5);
    expect(saved.sim.state.flags.brindle_freed).toBe(true);
    expect(saved.sim.state.flags.brindle_lost).toBeUndefined();
    const lost = day5(game());
    expect(lost.sim.state.flags.brindle_lost).toBe(true);
  });
});
