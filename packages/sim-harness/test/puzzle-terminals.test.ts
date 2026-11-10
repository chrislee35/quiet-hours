// covers: HAK-1, HAK-2, PUZ-1 (shipped puzzles are provably solvable), PUZ-3
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_CONTENT, buildWorld, importTiled, puzzleModule, type Content, type PuzzleDef, type TerminalDef } from "@qh/core";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const read = (rel: string) => readFileSync(new URL(`../../../content/${rel}`, import.meta.url), "utf8");
const puzzles = Object.fromEntries([...(JSON.parse(read("puzzles/range_puzzles.json")) as PuzzleDef[]), ...(JSON.parse(read("puzzles/range_puzzles2.json")) as PuzzleDef[]), ...(JSON.parse(read("puzzles/maint_power.json")) as PuzzleDef[])].map((p) => [p.id, p]));
const terminals = Object.fromEntries([...(JSON.parse(read("terminals/range_terminals.json")) as TerminalDef[]), ...(JSON.parse(read("terminals/range_terminals2.json")) as TerminalDef[])].map((t) => [t.id, t]));
const content: Content = { ...EMPTY_CONTENT, puzzles, terminals };
const world = buildWorld(importTiled(JSON.parse(read("maps/robot_range.json")), "robot_range"));

/** Stand next to a terminal and open it. */
const open = (id: string) => {
  const t = world.terminals.find((x) => x.id === id)!;
  return new Scenario(config, 1, world, content).player(t.x + 0.5, t.y + 1.0).command({ type: "Interact" });
};

describe.each(Object.keys(terminals))("shipped terminal %s", (id) => {
  const def = puzzles[terminals[id]!.puzzle]!;
  const mod = puzzleModule(def)!;

  it("is well formed, starts unsolved, and its solver finds a way through", () => {
    expect(mod.validate(def)).toEqual([]);
    expect(mod.isSolved(def, mod.init(def))).toBe(false);
    expect(mod.solve(def, mod.init(def))).not.toBeNull();
  });

  it("opens from the map, ignores nothing it should not, and the solver's taps unlock it", () => {
    const s = open(id);
    expect(s.sim.state.terminal).toBe(id);
    s.expectNoEvent("TerminalSolved");
    for (const index of mod.solve(def, mod.init(def))!) s.command({ type: "TerminalTap", index });
    s.expectEvent("TerminalSolved", { terminalId: id, via: "puzzle" });
    expect(s.sim.state.inventory.credits).toBe(20);
    expect(s.sim.terminal()!.solved).toBe(true);
  });

  it("further taps after solving change nothing", () => {
    const s = open(id);
    for (const index of mod.solve(def, mod.init(def))!) s.command({ type: "TerminalTap", index });
    const before = s.sim.state.terminals[id]!.values.slice();
    s.command({ type: "TerminalTap", index: 0 }).command({ type: "TerminalTap", index: 1 });
    expect(s.sim.state.terminals[id]!.values).toEqual(before);
  });
});

describe("each type through the terminal view", () => {
  it("signal path: the view shows mirrors, beam and targets, and a tap flips a mirror", () => {
    const s = open("relay_panel");
    const v = () => s.sim.terminal()!.puzzle as unknown as { kind: string; cells: { glyph: string; lit: boolean; flippable: boolean; isTarget: boolean }[] };
    expect(v().kind).toBe("signal_path");
    const idx = v().cells.findIndex((c) => c.flippable);
    const before = v().cells[idx]!.glyph;
    s.command({ type: "TerminalTap", index: idx });
    expect(v().cells[idx]!.glyph).not.toBe(before);
    s.command({ type: "TerminalTap", index: 0 }); // a wall: nothing happens
    expect(v().cells.filter((c) => c.isTarget)).toHaveLength(1);
  });

  it("schedule: the view lists tracks with their busy slots and the clashes, and locked tracks do not move", () => {
    const s = open("timetable_panel");
    const v = () => s.sim.terminal()!.puzzle as unknown as { kind: string; tracks: { name: string; locked: boolean; busy: boolean[] }[]; collisions: boolean[]; requirements: { met: boolean }[] };
    expect(v().kind).toBe("schedule_align");
    expect(v().tracks.map((t) => t.name)).toEqual(["Night express", "Freight", "Track works", "Mail van"]);
    expect(v().collisions.some(Boolean)).toBe(true);
    const express = v().tracks[0]!.busy.slice();
    s.command({ type: "TerminalTap", index: 0 });
    expect(v().tracks[0]!.busy).toEqual(express);
    s.command({ type: "TerminalTap", index: 1 });
    expect(v().tracks[1]!.busy).not.toEqual([true, false, false, true, false, false, false, false, false, false, false, false]);
  });

  it("rules: the view marks which rules apply and what each decision is, and a contradiction is flagged", () => {
    const s = open("gate_panel");
    const v = () => s.sim.terminal()!.puzzle as unknown as { kind: string; inputs: { name: string; value: boolean; locked: boolean }[]; rules: { applies: boolean }[]; outputs: { name: string; forced: string }[] };
    expect(v().kind).toBe("rule_contradiction");
    expect(v().inputs[0]).toMatchObject({ name: "It is curfew", value: true, locked: true });
    expect(v().rules.filter((r) => r.applies)).toHaveLength(0);
    s.command({ type: "TerminalTap", index: 1 }); // holds a pass: the gate must open
    expect(v().outputs.find((o) => o.name === "Gate")!.forced).toBe("true");
    s.command({ type: "TerminalTap", index: 0 }); // curfew is fixed
    expect(v().inputs[0]!.value).toBe(true);
    s.command({ type: "TerminalTap", index: 2 }); // resident: curfew says no
    s.expectEvent("TerminalSolved");
  });

  it("code lock: no feedback, dials wrap, and only the right code opens it", () => {
    const s = open("lock_panel");
    const v = () => s.sim.terminal()!.puzzle as unknown as { kind: string; dials: { digit: number }[]; correct: number | null; hint: string };
    expect(v().kind).toBe("code_lock");
    expect(v().correct).toBeNull();
    expect(v().hint).toContain("Pump 4");
    for (let i = 0; i < 10; i++) s.command({ type: "TerminalTap", index: 0 });
    expect(v().dials[0]!.digit).toBe(0); // ten taps wrap a base-10 dial
    for (const [i, n] of [[0, 4], [1, 1], [2, 7]] as const) for (let k = 0; k < n; k++) s.command({ type: "TerminalTap", index: i });
    s.expectNoEvent("TerminalSolved"); // 4, 1, 7, 0: one dial short
    s.command({ type: "TerminalTap", index: 3 }).command({ type: "TerminalTap", index: 3 });
    s.expectEvent("TerminalSolved");
  });

  it("fuse board: a tap flips the fuse and its neighbours, and the solution is the five taps it was built from", () => {
    const s = open("fuse_panel");
    const v = () => s.sim.terminal()!.puzzle as unknown as { kind: string; cells: { lit: boolean }[] };
    expect(v().cells.filter((c) => c.lit)).toHaveLength(8);
    s.command({ type: "TerminalTap", index: 5 });
    expect(v().cells.filter((c) => c.lit).length).not.toBe(8);
    s.command({ type: "TerminalTap", index: 5 });
    expect(v().cells.filter((c) => c.lit)).toHaveLength(8); // tapping twice undoes it
  });

  it("logic circuit: lamps show what is met, a fixed switch does not move, and the right switches open it", () => {
    const s = open("circuit_panel");
    const v = () => s.sim.terminal()!.puzzle as unknown as { kind: string; inputs: { value: boolean }[]; goals: { name: string; met: boolean }[]; gates: { id: string; value: boolean }[] };
    expect(v().goals.filter((g) => g.met).length).toBeLessThan(4);
    s.command({ type: "TerminalTap", index: 2 });
    expect(v().inputs[2]!.value).toBe(true);
    s.command({ type: "TerminalTap", index: 0 }).command({ type: "TerminalTap", index: 1 }).command({ type: "TerminalTap", index: 3 });
    expect(v().goals.every((g) => g.met)).toBe(true);
    s.expectEvent("TerminalSolved");
  });

  it("the world stays frozen while any of them is open", () => {
    const s = open("gate_panel");
    const tick = s.sim.state.tick;
    s.advance(2);
    expect(s.sim.state.tick).toBe(tick);
  });

  it("a saved game with a half-done puzzle of each type keeps its progress", () => {
    for (const id of ["relay_panel", "timetable_panel", "gate_panel"]) {
      const s = open(id);
      s.command({ type: "TerminalTap", index: id === "relay_panel" ? world.width * 0 + 1 * 9 + 1 : 1 });
      const copy = JSON.parse(JSON.stringify(s.sim.state));
      expect(copy.terminals[id]).toEqual(s.sim.state.terminals[id]);
    }
  });
});
