// covers: HAK-1, HAK-2, PUZ-1 (bypass route), CORE-4, CORE-5
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EMPTY_CONTENT, buildWorld, importTiled, powerRouting, type Content, type PowerRoutingDef, type PuzzleDef, type TerminalDef,
} from "@qh/core";
import { Scenario, asciiWorld } from "../src/index.ts";
import { config } from "./helpers.ts";

const read = (rel: string) => readFileSync(new URL(`../../../content/${rel}`, import.meta.url), "utf8");

const puzzle: PuzzleDef = {
  id: "p", kind: "power_routing", width: 3, height: 1, pieces: ["EIE"], rotations: ["000"], source: [0, 0], targets: [[2, 0]],
};
const terminal: TerminalDef = {
  id: "panel", title: "Panel", puzzle: "p",
  bypass: [{ has_item: "keycard" }],
  onSolve: [{ unlock_door: "door_7_1" }, { set_flag: ["panel_done", true] }],
  solvedText: "Unlocked.",
};
const content: Content = { ...EMPTY_CONTENT, puzzles: { p: puzzle }, terminals: { panel: terminal } };
const world = () => asciiWorld(["#########", "#S.....L#", "#########"], [], { terminals: [{ id: "panel", x: 2, y: 1 }] });
const start = () => new Scenario(config, 1, world(), content).command({ type: "Interact" });
const solveMoves = () => powerRouting.solve(puzzle)!;
const rotateAll = (s: Scenario, moves: number[]) => moves.forEach((index) => s.command({ type: "TerminalTap", index }));

describe("using a terminal", () => {
  it("Interact opens the puzzle; the view describes the grid and what is powered", () => {
    const s = start();
    s.expectEvent("TerminalOpened", { terminalId: "panel" });
    const v = s.sim.terminal()!;
    expect(v).toMatchObject({ id: "panel", title: "Panel", solved: false });
    const p = v.puzzle as Extract<typeof v.puzzle, { kind: "power_routing" }>;
    expect(p).toMatchObject({ kind: "power_routing", width: 3, height: 1 });
    expect(p.cells.map((c) => c.piece)).toEqual(["E", "I", "E"]);
    expect(p.cells[0]).toMatchObject({ isSource: true, powered: true });
    expect(p.cells[2]).toMatchObject({ isTarget: true, powered: false });
  });

  it("freezes the world while open and resumes after leaving", () => {
    const s = start();
    const tick = s.sim.state.tick;
    s.command({ type: "SetMove", dx: 1, dy: 0, mode: "run" }).command({ type: "Interact" });
    expect(s.sim.state.tick).toBe(tick);
    s.command({ type: "ExitTerminal" });
    s.expectEvent("TerminalClosed");
    s.advance(0.5);
    expect(s.sim.state.tick).toBeGreaterThan(tick);
    expect(s.sim.terminal()).toBeNull();
  });

  it("rotating without solving changes the lit cells but unlocks nothing", () => {
    const s = start();
    s.command({ type: "TerminalTap", index: 0 });
    expect((s.sim.terminal()!.puzzle as { cells: { rotation: number }[] }).cells[0]!.rotation).toBe(1);
    expect(s.sim.state.doors.door_7_1!.locked).toBe(true);
    s.expectNoEvent("TerminalSolved");
  });

  it("solving it applies the effects exactly once and locks the puzzle", () => {
    const s = start();
    rotateAll(s, solveMoves());
    s.expectEvent("TerminalSolved", { via: "puzzle" }).expectEvent("DoorUnlocked", { doorId: "door_7_1" });
    expect(s.sim.state.flags.panel_done).toBe(true);
    expect(s.sim.state.doors.door_7_1!.locked).toBe(false);
    expect(s.sim.terminal()).toMatchObject({ solved: true, solvedText: "Unlocked." });
    const events = s.eventsOfType("TerminalSolved").length;
    s.command({ type: "TerminalTap", index: 0 }); // ignored once solved
    expect(s.sim.state.terminals.panel!.values).toEqual([1, 1, 3]);
    s.command({ type: "ExitTerminal" }).command({ type: "Interact" });
    expect(s.eventsOfType("TerminalSolved")).toHaveLength(events);
  });

  it("progress is kept when leaving and returning", () => {
    const s = start();
    s.command({ type: "TerminalTap", index: 0 }).command({ type: "TerminalTap", index: 1 });
    s.command({ type: "ExitTerminal" }).command({ type: "Interact" });
    expect(s.sim.state.terminals.panel!.values).toEqual([1, 1, 0]);
  });

  it("the unlocked door can then be opened by the player", () => {
    const s = start();
    rotateAll(s, solveMoves());
    s.command({ type: "ExitTerminal" }).player(6.5, 1.5).command({ type: "Interact" });
    s.expectEvent("DoorOpened", { doorId: "door_7_1" });
  });

  it("ignores invalid rotations and terminal commands with no terminal open", () => {
    const s = start();
    s.command({ type: "TerminalTap", index: 9 }).command({ type: "TerminalTap", index: -1 });
    expect(s.sim.state.terminals.panel!.values).toEqual([0, 0, 0]);
    const idle = new Scenario(config, 1, world(), content).command({ type: "TerminalTap", index: 0 });
    expect(idle.events).toEqual([]);
  });

  it("out of reach does nothing; a conversation and a terminal cannot both be open", () => {
    const far = new Scenario(config, 1, world(), content).player(7.5, 1.5).command({ type: "Interact" });
    expect(far.sim.state.terminal).toBeNull();
  });
});

describe("second route in: the bypass (PUZ-1)", () => {
  it("holding the keycard grants access immediately, with no puzzle", () => {
    const s = new Scenario(config, 1, world(), content).command({ type: "ApplyEffects", effects: [{ add_item: ["keycard", 1] }] });
    s.command({ type: "Interact" });
    s.expectEvent("TerminalSolved", { via: "bypass" }).expectEvent("DoorUnlocked");
    expect(s.sim.state.doors.door_7_1!.locked).toBe(false);
  });

  it("without the keycard the puzzle is still required", () => {
    const s = start();
    s.expectNoEvent("TerminalSolved");
  });
});

describe("shipped content", () => {
  it("the maintenance panel unlocks the locked maintenance door", () => {
    const map = buildWorld(importTiled(JSON.parse(read("maps/stacks_slice.json")), "stacks_slice"));
    const puzzles = Object.fromEntries((JSON.parse(read("puzzles/maint_power.json")) as PuzzleDef[]).map((p) => [p.id, p]));
    const terminals = Object.fromEntries((JSON.parse(read("terminals/maint_panel.json")) as TerminalDef[]).map((t) => [t.id, t]));
    const s = new Scenario(config, 1, map, { ...EMPTY_CONTENT, puzzles, terminals }).player(13.5, 3.5).command({ type: "Interact" });
    expect(s.sim.state.terminal).toBe("maint_panel");
    expect(s.sim.state.doors.door_maint_locked!.locked).toBe(true);
    rotateAll(s, powerRouting.solve(puzzles.maint_power! as PowerRoutingDef)!);
    expect(s.sim.state.doors.door_maint_locked!.locked).toBe(false);
    expect(s.sim.state.flags.maint_panel_hacked).toBe(true);
  });
});
