// covers: WLD-2 (Transit Underworks: trains on seeded timetables, an interlock, a drain), PUZ-1 (three ways through), SQ-05, SQ-06, ECO (free rides)
import { describe, expect, it } from "vitest";
import { puzzleModule, seededPhase } from "@qh/core";
import { assemble, loadContent } from "../../content-tools/src/index.ts";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const content = a.content;
const uw = a.worlds.underworks!;
const game = (seed = 1, map = "underworks") => new Scenario(config, seed, a.worlds, content, map);
const at = (id: string) => {
  const o = [...uw.terminals, ...uw.pickups, ...uw.npcs].find((x) => x.id === id)!;
  return { x: o.x + 0.5, y: o.y + 1.0 };
};
const goto = (s: Scenario, id: string) => s.player(at(id).x, at(id).y);
const solve = (s: Scenario, id: string) => {
  goto(s, id).command({ type: "Interact" });
  const puzzle = content.puzzles[content.terminals[id]!.puzzle]!;
  const mod = puzzleModule(puzzle)!;
  for (const i of mod.solve(puzzle, mod.init(puzzle))!) s.command({ type: "TerminalTap", index: i });
  return s.command({ type: "ExitTerminal" });
};
/** Which of the three train doors are shut, sampled each second for a minute. */
const timetable = (s: Scenario): string[] => {
  const rows: string[] = [];
  for (let t = 0; t < 24; t++) {
    rows.push(["door_train_1", "door_train_2", "door_train_3"].map((d) => (s.sim.state.doors[d]!.open ? "o" : "X")).join(""));
    s.advance(1);
  }
  return rows;
};

describe("the Transit Underworks", () => {
  it("is reached by the stairs from the Civic Core and back", () => {
    const s = new Scenario(config, 1, a.worlds, content, "civic_core");
    const o = a.worlds.civic_core!.exits.find((e) => e.id === "stairs_to_underworks")!;
    s.player(o.x + 0.5, o.y + 0.5).command({ type: "Interact" });
    s.expectEvent("MapChanged", { from: "civic_core", to: "underworks" });
    const back = uw.exits.find((e) => e.id === "stairs_to_civic")!;
    s.player(back.x + 0.5, back.y + 0.5).command({ type: "Interact" });
    s.expectEvent("MapChanged", { from: "underworks", to: "civic_core" });
  });

  it("runs the trains on a twelve-second cycle that is the same all run but different from seed to seed", () => {
    const run = (seed: number) => timetable(game(seed));
    const one = run(1);
    expect(run(1)).toEqual(one); // deterministic within a seed
    expect(one.slice(0, 12)).toEqual(one.slice(12, 24)); // a twelve-second cycle
    const doors = (rows: string[], i: number) => rows.map((r) => r[i]).join("");
    expect(doors(one, 0).split("X").length - 1).toBe(10); // five of every twelve seconds are a train (two cycles)
    const phases = new Set([1, 2, 3, 4, 5, 6].map((sd) => run(sd).join()));
    expect(phases.size).toBeGreaterThan(1); // a different point each run
    expect(seededPhase(7, "door_train_1", 240)).toBe(seededPhase(7, "door_train_1", 240));
  });

  it("the dispatcher's interlock stops every train and leaves the tunnel open", () => {
    const s = solve(game(), "track_interlock");
    expect(s.sim.state.district.underworks!.trains).toBe("off");
    s.advance(2);
    for (const rows of timetable(s)) expect(rows).toBe("ooo");
    expect(s.sim.state.clues.train_cycle).toBeDefined();
  });

  it("there are three ways to the junction: the tunnel, the drain, and the stopped trains", () => {
    const s = game();
    const west = uw.spawns.find((p) => p.id === "start")!;
    const dr = uw.robots.find((r) => r.id === "drain_warden")!;
    expect(dr.route).toBe("drain_loop");
    expect(west).toBeDefined();
    expect(s.sim.state.doors["door_train_1"]).toBeDefined();
    expect(content.terminals["track_interlock"]).toBeDefined();
  });

  it("opens the Platform 7 door only between 13:50 and 14:10", () => {
    const s = game();
    s.advanceToMinuteOfDay(13 * 60 + 30).advanceTicks(2);
    expect(s.sim.state.doors["door_platform_7"]!.locked).toBe(true);
    s.advanceToMinuteOfDay(13 * 60 + 55).advanceTicks(2);
    expect(s.sim.state.doors["door_platform_7"]!.locked).toBe(false);
    s.advanceToMinuteOfDay(14 * 60 + 20).advanceTicks(2);
    expect(s.sim.state.doors["door_platform_7"]!.locked).toBe(true);
  });

  it("SQ-05: the token and the pattern open the Hollow's service tunnel", () => {
    const s = game();
    expect(s.sim.state.doors["door_hollow"]!.locked).toBe(true);
    goto(s, "quill").command({ type: "Interact" });
    s.say("Can you show me a safe way through?").say("Right.").say("Goodbye.").command({ type: "EndConversation" });
    goto(s, "pk_token").command({ type: "Interact" });
    expect(s.sim.state.inventory.items.quill_token).toBe(1);
    goto(s, "quill").command({ type: "Interact" });
    s.say("I have your token.").say("Right.");
    expect(s.sim.state.flags.sq_05_done).toBeUndefined(); // no pattern yet
    s.say("Goodbye.").command({ type: "EndConversation" });
    goto(s, "pk_lamps").command({ type: "Interact" });
    goto(s, "quill").command({ type: "Interact" });
    s.say("I have your token. And the trains: twelve seconds each, seven open and five a train, and each one starts at a different point.");
    expect(s.sim.state.flags.sq_05_done).toBe(true);
    expect(s.sim.state.doors["door_hollow"]!.locked).toBe(false);
    expect(s.sim.state.clues.quill_shortcut).toBeDefined();
    expect(s.sim.state.trust.quill).toBe(1);
  });

  it("SQ-06: reconciling the timetable earns free rides and Maren's story", () => {
    const s = new Scenario(config, 1, a.worlds, content, "underworks").command({ type: "ApplyEffects", effects: [{ give_pass: { id: "p", label: "p", level: 0, origin: "issued" } }] });
    s.command({ type: "ApplyEffects", effects: [{ add_credits: 20 }] });
    const before = s.sim.state.inventory.credits;
    solve(s, "signal_box");
    expect(s.sim.state.flags.sq_06_done).toBe(true);
    expect(s.sim.state.clues.maren_backstory).toBeDefined();
    s.command({ type: "ApplyEffects", effects: [{ use_service: "transit_fare" }] });
    expect(s.sim.state.inventory.credits).toBe(before); // the fare is free now
    expect(s.sim.state.flags.has_ticket).toBe(true);
  });
});
