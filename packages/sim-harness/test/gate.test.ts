// covers: END-1 (three routes out, none needing combat), CMP-5 groundwork (route requirements as services), PST-2 M3, WLD-2 (the Gate)
import { describe, expect, it } from "vitest";
import { puzzleModule } from "@qh/core";
import { assemble, checkRoutes, loadContent } from "../../content-tools/src/index.ts";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const content = a.content;
const game = (map = "gate", seed = 1) => new Scenario(config, seed, a.worlds, content, map);
const at = (s: Scenario, id: string) => {
  const w = s.sim.world;
  const o = [...w.npcs, ...w.terminals, ...w.exits, ...w.pickups].find((x) => x.id === id)!;
  return s.player(o.x + 0.5, o.y + 0.5);
};
const give = (s: Scenario, ...effects: object[]) => s.command({ type: "ApplyEffects", effects: effects as never });
const pass = { give_pass: { id: "p", label: "p", level: 1, origin: "issued" } };
const flags = (s: Scenario) => s.sim.state.flags;
const clock = (s: Scenario, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return s.advanceToMinuteOfDay(h! * 60 + m!).advanceTicks(2);
};
const solve = (s: Scenario, id: string) => {
  at(s, id).command({ type: "Interact" });
  const puzzle = content.puzzles[content.terminals[id]!.puzzle]!;
  const mod = puzzleModule(puzzle)!;
  for (const i of mod.solve(puzzle, mod.init(puzzle))!) s.command({ type: "TerminalTap", index: i });
  return s.command({ type: "ExitTerminal" });
};

describe("the Gate map", () => {
  it("has its platform, corridor, hall, annex and threshold, three ways out and the Gate door", () => {
    const w = a.worlds.gate!;
    expect(w.zones.map((z) => z.id).sort()).toEqual(["gate_annex", "gate_corridor", "gate_hall", "gate_platform", "gate_threshold"]);
    expect(w.exits.map((e) => e.id).sort()).toEqual(["gate_out_break", "gate_out_hack", "gate_out_service", "train_back"]);
    expect(w.doors.map((d) => d.id).sort()).toEqual(["door_annex", "door_gate", "door_service_gate"]);
    expect(a.worlds.outside).toBeDefined();
  });

  it("is reached by Train 7, which only boards between 13:50 and 14:10, and goes back", () => {
    const s = clock(game("underworks"), "12:00");
    at(s, "train_7").command({ type: "Interact" });
    expect(s.sim.world.id).toBe("underworks"); // not boarding
    clock(s, "13:52");
    at(s, "train_7").command({ type: "Interact" });
    s.expectEvent("MapChanged", { from: "underworks", to: "gate" });
    at(s, "train_back").command({ type: "Interact" });
    s.expectEvent("MapChanged", { from: "gate", to: "underworks" });
  });
});

describe("route 1: sneak out through the service gate", () => {
  it("works in the window, with a pass in hand, and not otherwise", () => {
    const s = clock(game(), "13:55");
    at(s, "gate_out_service").command({ type: "Interact" });
    expect(s.sim.world.id).toBe("gate"); // no pass: the lamp wants one
    give(s, pass);
    at(s, "gate_out_service").command({ type: "Interact" });
    s.expectEvent("MapChanged", { from: "gate", to: "outside" });
    expect(flags(s).route_taken).toBe("sneak");
    expect(flags(s).escaped).toBe(true);
    const late = give(clock(game(), "15:00"), pass);
    expect(late.sim.state.doors.door_service_gate!.locked).toBe(true);
    at(late, "gate_out_service").command({ type: "Interact" });
    expect(late.sim.world.id).toBe("gate");
  });
  it("the service door is only unlocked in the window", () => {
    const s = clock(game(), "12:00");
    expect(s.sim.state.doors.door_service_gate!.locked).toBe(true);
    clock(s, "13:55");
    expect(s.sim.state.doors.door_service_gate!.locked).toBe(false);
  });
});

describe("route 2: hack the Gate", () => {
  it("by the code: the two halves, one from the Ledger and one from Pallas's log", () => {
    const s = give(game(), { give_clue: { id: "gate_code_first", from: "test" } }, { give_clue: { id: "gate_code_second", from: "test" } });
    at(s, "gate_out_hack").command({ type: "Interact" });
    expect(s.sim.world.id).toBe("gate"); // not cleared yet
    solve(s, "gate_controller");
    expect(flags(s).gate_controller_open).toBe(true);
    at(s, "gate_out_hack").command({ type: "Interact" });
    s.expectEvent("MapChanged", { from: "gate", to: "outside" });
    expect(flags(s).route_taken).toBe("hack");
    expect(flags(s).past_stance).toBeUndefined(); // the null edge kept
  });
  it("by answering the Gate as the one who built it (M3): the terminal opens on its own, at a cost", () => {
    const s = game();
    at(s, "gate_voice").command({ type: "Interact" }).say("Yes. I am R. Alder.");
    expect(flags(s).past_m3).toBe("embrace");
    expect(flags(s).past_stance).toBe("embraced");
    expect(flags(s).meridian_sees).toBe(true);
    expect(s.sim.state.trust.wren).toBe(-1);
    s.command({ type: "EndConversation" });
    at(s, "gate_controller").command({ type: "Interact" });
    expect(s.sim.state.terminals.gate_controller!.solved).toBe(true);
    s.command({ type: "ExitTerminal" });
    at(s, "gate_out_hack").command({ type: "Interact" });
    expect(flags(s).route_taken).toBe("hack");
  });
  it("refusing the Gate's prompt keeps the null edge and does not open the controller", () => {
    const s = game();
    at(s, "gate_voice").command({ type: "Interact" }).say("No. I am nobody, and I intend to stay that way.");
    expect(flags(s).past_stance).toBe("rejected");
    s.command({ type: "EndConversation" });
    at(s, "gate_controller").command({ type: "Interact" });
    expect(s.sim.state.terminals.gate_controller!.solved).toBeFalsy();
  });
});

describe("route 3: break the Gate", () => {
  it("cutting Node 4 holds the Gate open for an hour, and then the crew restore it", () => {
    const s = game();
    expect(s.sim.state.doors.door_gate!.locked).toBe(true);
    give(s, ...content.terminals.node_4!.onSolve);
    s.advanceTicks(2);
    expect(s.sim.state.doors.door_gate!.locked).toBe(false);
    at(s, "gate_out_break").command({ type: "Interact" });
    s.expectEvent("MapChanged", { from: "gate", to: "outside" });
    expect(flags(s).route_taken).toBe("break");
    expect(flags(s).gate_broken).toBe(true);
    const late = game();
    give(late, ...content.terminals.node_4!.onSolve);
    late.advance(60 * 60 + 5 * 60); // an hour of game time at the test's speed is far less; push well past it
    late.advanceTicks(20000);
    expect(late.sim.state.doors.door_gate!.locked).toBe(true);
    at(late, "gate_out_break").command({ type: "Interact" });
    expect(late.sim.world.id).toBe("gate");
  });
});

describe("cross-map route checking (END-1)", () => {
  it("every route is reachable from a fresh start, and each also without embracing the past", () => {
    const routes = checkRoutes(a.worlds, content, a.start);
    expect(routes.map((r) => r.route)).toEqual(["break", "hack", "sneak"]);
    for (const r of routes) {
      expect(r.reachable, r.route).toBe(true);
      expect(r.reachableNull, r.route).toBe(true);
      expect(r.chain.length, r.route).toBeGreaterThan(0);
    }
  });
  it("catches a route nothing can reach", () => {
    const broken = { ...content, services: { ...content.services, gate_hack: { ...content.services.gate_hack!, requires: [{ flag: "nothing_sets_this" }] } } };
    const r = checkRoutes(a.worlds, broken, a.start).find((x) => x.route === "hack")!;
    expect(r.reachable).toBe(false);
    expect(r.missing.join()).toContain("nothing_sets_this");
  });
  it("catches a route that only the embraced past can reach", () => {
    const t = content.terminals.gate_controller!;
    const broken = { ...content, terminals: { ...content.terminals, gate_controller: { ...t, puzzleRequires: [{ has_clue: "no_such_clue_anywhere" }] } } };
    const r = checkRoutes(a.worlds, broken, a.start).find((x) => x.route === "hack")!;
    expect(r.reachable).toBe(true);
    expect(r.reachableNull).toBe(false);
  });
});
