// covers: HAK-2, PUZ-1 (solvers prove solvability), PUZ-3 (no chance involved)
import { describe, expect, it } from "vitest";
import {
  puzzleModule, ruleContradiction as rc, scheduleAlign as sa, signalPath as sp,
  type RuleContradictionDef, type ScheduleAlignDef, type SignalPathDef,
} from "../src/index.ts";

describe("signal path", () => {
  const def = (over: Partial<SignalPathDef> = {}): SignalPathDef => ({
    id: "t", kind: "signal_path", width: 7, height: 5,
    cells: ["#######", "#.../.X#", "#.....#", "#.../.#", "#######"].map((r) => r.padEnd(7, "#").slice(0, 7)),
    sources: [{ x: 1, y: 1, dir: "E" }], targets: [[5, 3]], ...over,
  });

  it("a beam travels straight through empty cells and stops at walls", () => {
    const d = def({ cells: ["#####", "#...#", "#...\\#".slice(0, 5), "#####"], height: 4, width: 5, sources: [{ x: 1, y: 1, dir: "E" }], targets: [[3, 1]] });
    expect(sp.isSolved(d, sp.init(d))).toBe(true);
    expect([...sp.trace(d, sp.init(d)).lit].sort()).toEqual([6, 7, 8]);
  });

  it("mirrors reflect: / turns east to north and south to west; \\ turns east to south and north to east", () => {
    const d = def();
    expect(sp.mirrorAt(d, sp.init(d), 1 * 7 + 4)).toBe("/");
    const flipped = sp.tap(d, sp.init(d), 1 * 7 + 4)!;
    expect(sp.mirrorAt(d, flipped, 1 * 7 + 4)).toBe("\\");
    const lit = sp.trace(d, flipped).lit;
    expect(lit.has(2 * 7 + 4)).toBe(true); // the beam went south through (4,2)
  });

  it("is solved only with every target lit and no hazard hit", () => {
    const d = def();
    expect(sp.isSolved(d, sp.init(d))).toBe(false);
    const s = sp.solve(d)!;
    expect(s).toHaveLength(2);
    let v = sp.init(d);
    for (const i of s) v = sp.tap(d, v, i)!;
    expect(sp.isSolved(d, v)).toBe(true);
    // Hazard: leave the first mirror alone so the beam runs into X.
    expect(sp.trace(d, sp.init(d)).hazardHit).toBe(false);
  });

  it("a beam that hits a hazard fails even if it also lights the target", () => {
    const d = def({ cells: ["#####", "#.X.#", "#####"], height: 3, width: 5, sources: [{ x: 1, y: 1, dir: "E" }], targets: [[3, 1]] });
    expect(sp.trace(d, sp.init(d)).hazardHit).toBe(true);
    expect(sp.isSolved(d, sp.init(d))).toBe(false);
  });

  it("fixed mirrors cannot be flipped; walls and empty cells ignore taps; out-of-range taps are ignored", () => {
    const d = def({ cells: ["#####", "#.P.#", "#####"], height: 3, width: 5 });
    expect(sp.tap(d, sp.init(d), 1 * 5 + 2)).toBeNull();
    expect(sp.tap(d, sp.init(d), 0)).toBeNull();
    expect(sp.tap(d, sp.init(d), 999)).toBeNull();
    expect(sp.tap(d, sp.init(d), -1)).toBeNull();
  });

  it("a closed loop of beams terminates", () => {
    const d: SignalPathDef = { id: "loop", kind: "signal_path", width: 4, height: 4, cells: ["####", "#/\\#", "#\\/#", "####"].map((r) => r), sources: [{ x: 1, y: 1, dir: "E" }], targets: [[2, 2]] };
    expect(() => sp.trace(d, sp.init(d))).not.toThrow();
  });

  it("says when there is no solution, and rejects malformed definitions", () => {
    expect(sp.solve(def({ targets: [[1, 3]], cells: ["#######", "#.../.X#", "#.....#", "#.....#", "#######"] }))).toBeNull();
    expect(sp.validate(def({ cells: ["###"] }))).not.toEqual([]);
    expect(sp.validate(def({ sources: [{ x: 4, y: 1, dir: "E" }] }))).toEqual(expect.arrayContaining([expect.stringContaining("empty cell")]));
    expect(sp.validate(def({ cells: ["#######", "#.....#", "#.....#", "#.....#", "#######"] }))).toEqual(expect.arrayContaining([expect.stringContaining("flippable")]));
  });
});

describe("schedule align", () => {
  const def = (over: Partial<ScheduleAlignDef> = {}): ScheduleAlignDef => ({
    id: "s", kind: "schedule_align", slots: 6, exclusive: true,
    tracks: [{ id: "a", name: "A", pattern: "##....", locked: true }, { id: "b", name: "B", pattern: "##...." }],
    ...over,
  });

  it("a tap slides a track one slot later and wraps around; locked tracks do not move", () => {
    const d = def();
    expect(sa.tap(d, sa.init(d), 1)).toEqual([0, 1]);
    expect(sa.tap(d, [0, 5], 1)).toEqual([0, 0]);
    expect(sa.tap(d, sa.init(d), 0)).toBeNull();
    expect(sa.tap(d, sa.init(d), 7)).toBeNull();
  });

  it("detects clashes slot by slot, and is solved once there are none", () => {
    const d = def();
    expect(sa.collisions(d, [0, 0])).toEqual([true, true, false, false, false, false]);
    expect(sa.collisions(d, [0, 1])).toEqual([false, true, false, false, false, false]);
    expect(sa.isSolved(d, [0, 1])).toBe(false);
    expect(sa.isSolved(d, [0, 2])).toBe(true);
  });

  it("requirements: a track must be busy in a given slot", () => {
    const d = def({ require: [{ track: "b", slot: 5 }] });
    expect(sa.isSolved(d, [0, 2])).toBe(false);
    expect(sa.isSolved(d, [0, 4])).toBe(true); // busy at slots 4 and 5
    expect(sa.solve(d)).toEqual([1, 1, 1, 1]);
  });

  it("the solver returns the fewest taps, and null when impossible", () => {
    expect(sa.solve(def())).toEqual([1, 1]);
    const crowded = def({ tracks: [{ id: "a", name: "A", pattern: "######", locked: true }, { id: "b", name: "B", pattern: "#....." }] });
    expect(sa.solve(crowded)).toBeNull();
  });

  it("non-exclusive schedules only need their requirements", () => {
    expect(sa.isSolved(def({ exclusive: false }), [0, 0])).toBe(true);
  });

  it("validates patterns, shifts and requirements", () => {
    expect(sa.validate(def())).toEqual([]);
    expect(sa.validate(def({ tracks: [{ id: "a", name: "A", pattern: "##" }, { id: "b", name: "B", pattern: "##...." }] }))).not.toEqual([]);
    expect(sa.validate(def({ require: [{ track: "zzz", slot: 1 }] }))).not.toEqual([]);
    expect(sa.validate(def({ slots: 99 }))).not.toEqual([]);
  });
});

describe("rule contradiction", () => {
  const def = (over: Partial<RuleContradictionDef> = {}): RuleContradictionDef => ({
    id: "r", kind: "rule_contradiction",
    inputs: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C", locked: true, value: true }],
    outputs: [{ id: "x", name: "X" }],
    rules: [
      { id: "1", text: "A means yes", if: { a: true }, then: { x: true } },
      { id: "2", text: "B and C mean no", if: { b: true, c: true }, then: { x: false } },
    ],
    ...over,
  });

  it("a rule applies only when all its conditions hold; one applying rule is a decision, not a contradiction", () => {
    const d = def();
    expect(rc.forced(d, [1, 0, 1])).toEqual({ x: "true" });
    expect(rc.forced(d, [0, 1, 1])).toEqual({ x: "false" });
    expect(rc.forced(d, [0, 0, 1])).toEqual({ x: "none" });
  });

  it("two applying rules that disagree make a contradiction, which solves the puzzle", () => {
    const d = def();
    expect(rc.forced(d, [1, 1, 1])).toEqual({ x: "contradiction" });
    expect(rc.isSolved(d, [1, 1, 1])).toBe(true);
    expect(rc.isSolved(d, rc.init(d))).toBe(false);
  });

  it("two rules that agree are not a contradiction", () => {
    const d = def({ rules: [{ id: "1", text: "", if: { a: true }, then: { x: true } }, { id: "2", text: "", if: { b: true }, then: { x: true } }] });
    expect(rc.isSolved(d, [1, 1, 1])).toBe(false);
    expect(rc.solve(d)).toBeNull();
  });

  it("locked inputs cannot be flipped; the solver never tries to", () => {
    const d = def();
    expect(rc.tap(d, rc.init(d), 2)).toBeNull();
    expect(rc.tap(d, rc.init(d), 0)).toEqual([1, 0, 1]);
    expect(rc.solve(d)).toEqual([0, 1]);
  });

  it("the goal restricts which output must be contradicted", () => {
    const d = def({ outputs: [{ id: "x", name: "X" }, { id: "y", name: "Y" }], goal: "y" });
    expect(rc.isSolved(d, [1, 1, 1])).toBe(false);
  });

  it("validates references", () => {
    expect(rc.validate(def())).toEqual([]);
    expect(rc.validate(def({ rules: [{ id: "1", text: "", if: { zz: true }, then: { x: true } }, { id: "2", text: "", if: {}, then: { x: false } }] }))).not.toEqual([]);
    expect(rc.validate(def({ goal: "nope" }))).not.toEqual([]);
  });
});

describe("the registry", () => {
  it("knows every kind and nothing else", () => {
    for (const kind of ["power_routing", "signal_path", "schedule_align", "rule_contradiction"]) expect(puzzleModule({ kind })).toBeDefined();
    expect(puzzleModule({ kind: "slider" })).toBeUndefined();
  });
});

import { codeLock as cl, lightsOut as lo, logicCircuit as lc, type CodeLockDef, type LightsOutDef, type LogicCircuitDef } from "../src/index.ts";

describe("code lock", () => {
  const def = (over: Partial<CodeLockDef> = {}): CodeLockDef => ({ id: "c", kind: "code_lock", code: "729", feedback: "none", ...over });

  it("dials count up one per tap and wrap at the base", () => {
    const d = def();
    expect(cl.tap(d, [0, 0, 0], 1)).toEqual([0, 1, 0]);
    expect(cl.tap(d, [0, 9, 0], 1)).toEqual([0, 0, 0]);
    expect(cl.tap(def({ base: 3, code: "21" }), [0, 2], 1)).toEqual([0, 0]);
    expect(cl.tap(d, [0, 0, 0], 3)).toBeNull();
    expect(cl.tap(d, [0, 0, 0], -1)).toBeNull();
  });

  it("opens only on the exact code; the solver turns each dial the shortest way up", () => {
    const d = def();
    expect(cl.isSolved(d, [7, 2, 9])).toBe(true);
    expect(cl.isSolved(d, [7, 2, 8])).toBe(false);
    expect(cl.solve(d)).toHaveLength(7 + 2 + 9);
    expect(cl.solve(d, [7, 2, 8])).toEqual([2]);
  });

  it("gives feedback only when asked to", () => {
    expect(cl.view(def(), [7, 0, 0]).correct).toBeNull();
    expect(cl.view(def({ feedback: "count" }), [7, 0, 9]).correct).toBe(2);
    expect(cl.view(def({ hint: "look up" }), [0, 0, 0]).hint).toBe("look up");
  });

  it("validates the code, the base and the start", () => {
    expect(cl.validate(def())).toEqual([]);
    expect(cl.validate(def({ code: "7" }))).not.toEqual([]);
    expect(cl.validate(def({ code: "78", base: 5 }))).not.toEqual([]);
    expect(cl.validate(def({ start: "12" }))).not.toEqual([]);
    expect(cl.validate(def({ feedback: "maybe" as never }))).not.toEqual([]);
  });
});

describe("fuse board (lights out)", () => {
  const def = (layout: string[]): LightsOutDef => ({ id: "l", kind: "lights_out", width: layout[0]!.length, height: layout.length, layout });

  it("a tap flips the fuse and its orthogonal neighbours, and tapping twice undoes it", () => {
    const d = def(["ooo", "ooo", "ooo"]);
    const once = lo.tap(d, lo.init(d), 4)!;
    expect(once).toEqual([0, 1, 0, 1, 1, 1, 0, 1, 0]);
    expect(lo.tap(d, once, 4)).toEqual(lo.init(d));
    expect(lo.tap(d, lo.init(d), 0)).toEqual([1, 1, 0, 1, 0, 0, 0, 0, 0]); // a corner has two neighbours
  });

  it("cells with no fuse cannot be tapped and are never flipped", () => {
    const d = def(["o.o", "ooo"]);
    expect(lo.tap(d, lo.init(d), 1)).toBeNull();
    expect(lo.tap(d, lo.init(d), 4)).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it("the solver is exact: it finds the taps a board was built from, and proves unsolvable boards unsolvable", () => {
    const d = def(["ooo", "ooo", "ooo"]);
    let v = lo.init(d);
    for (const t of [0, 4, 8]) v = lo.tap(d, v, t)!;
    const board = def([0, 1, 2].map((y) => v.slice(y * 3, y * 3 + 3).map((x) => (x ? "#" : "o")).join("")));
    const taps = lo.solve(board)!;
    expect(taps.length).toBeLessThanOrEqual(3);
    let w = lo.init(board);
    for (const t of taps) w = lo.tap(board, w, t)!;
    expect(lo.isSolved(board, w)).toBe(true);
    // Two fuses side by side with nothing else: a single tap flips both, so one lit fuse can never go dark.
    expect(lo.solve(def(["#o", ".."]))).toBeNull();
  });

  it("an all-dark board is already solved and needs no taps", () => {
    const d = def(["oo", "oo"]);
    expect(lo.isSolved(d, lo.init(d))).toBe(true);
    expect(lo.solve(d)).toEqual([]);
  });

  it("validates the layout", () => {
    expect(lo.validate(def(["oo", "oo"]))).toEqual([]);
    expect(lo.validate({ ...def(["oo", "oo"]), width: 9 })).not.toEqual([]);
    expect(lo.validate(def(["ox", "oo"]))).not.toEqual([]);
  });
});

describe("logic circuit", () => {
  const def = (over: Partial<LogicCircuitDef> = {}): LogicCircuitDef => ({
    id: "g", kind: "logic_circuit",
    inputs: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "k", name: "K", value: true, locked: true }],
    gates: [{ id: "x", op: "XOR", in: ["a", "b"] }, { id: "n", op: "NOT", in: ["x"] }, { id: "y", op: "AND", in: ["n", "k"] }],
    goals: [{ name: "lamp", node: "y", want: true }, { name: "other", node: "x", want: false }],
    ...over,
  });

  it("every gate computes its truth table", () => {
    const ops = (op: LogicCircuitDef["gates"][number]["op"], a: number, b: number) =>
      lc.evaluate({ id: "t", kind: "logic_circuit", inputs: [{ id: "a", name: "a" }, { id: "b", name: "b" }], gates: [{ id: "o", op, in: op === "NOT" ? ["a"] : ["a", "b"] }], goals: [{ name: "o", node: "o", want: true }] }, [a, b]).o;
    expect([[0, 0], [0, 1], [1, 0], [1, 1]].map(([a, b]) => ops("AND", a!, b!))).toEqual([false, false, false, true]);
    expect([[0, 0], [0, 1], [1, 0], [1, 1]].map(([a, b]) => ops("OR", a!, b!))).toEqual([false, true, true, true]);
    expect([[0, 0], [0, 1], [1, 0], [1, 1]].map(([a, b]) => ops("XOR", a!, b!))).toEqual([false, true, true, false]);
    expect([[0, 0], [0, 1], [1, 0], [1, 1]].map(([a, b]) => ops("NAND", a!, b!))).toEqual([true, true, true, false]);
    expect([[0, 0], [0, 1], [1, 0], [1, 1]].map(([a, b]) => ops("NOR", a!, b!))).toEqual([true, false, false, false]);
    expect([0, 1].map((a) => ops("NOT", a, 0))).toEqual([true, false]);
  });

  it("solved only when every goal is met; the solver flips the fewest switches and never the fixed one", () => {
    const d = def();
    expect(lc.isSolved(d, lc.init(d))).toBe(true); // A=B=0: XOR 0, NOT 1, AND with K = 1
    const harder = def({ inputs: [{ id: "a", name: "A", value: true }, { id: "b", name: "B" }, { id: "k", name: "K", value: true, locked: true }] });
    expect(lc.isSolved(harder, lc.init(harder))).toBe(false);
    expect(lc.solve(harder)).toHaveLength(1);
    expect(lc.tap(harder, lc.init(harder), 2)).toBeNull();
  });

  it("reports an impossible circuit as unsolvable", () => {
    expect(lc.solve(def({ goals: [{ name: "x", node: "x", want: true }, { name: "n", node: "n", want: true }] }))).toBeNull();
  });

  it("rejects gates that read something that does not exist yet, wrong arities and unknown operations", () => {
    expect(lc.validate(def())).toEqual([]);
    expect(lc.validate(def({ gates: [{ id: "x", op: "AND", in: ["a", "later"] }, { id: "later", op: "NOT", in: ["a"] }] }))).not.toEqual([]);
    expect(lc.validate(def({ gates: [{ id: "x", op: "NOT", in: ["a", "b"] }] }))).not.toEqual([]);
    expect(lc.validate(def({ gates: [{ id: "x", op: "MAYBE" as never, in: ["a", "b"] }] }))).not.toEqual([]);
    expect(lc.validate(def({ goals: [] }))).not.toEqual([]);
  });

  it("the view shows each gate's reading and each lamp's state", () => {
    const v = lc.view(def(), [0, 0, 1]);
    expect(v.gates.find((g) => g.id === "n")).toMatchObject({ op: "NOT", reads: ["x"], value: true });
    expect(v.goals.map((g) => g.met)).toEqual([true, true]);
  });
});

describe("the registry knows the new kinds", () => {
  it("includes them", () => {
    for (const kind of ["code_lock", "lights_out", "logic_circuit"]) expect(puzzleModule({ kind })).toBeDefined();
  });
});

describe("logic circuit view explains the wiring", () => {
  const d: LogicCircuitDef = {
    id: "w", kind: "logic_circuit",
    inputs: [{ id: "a", name: "Switch A", value: true }, { id: "b", name: "Switch B" }, { id: "c", name: "Switch C (fixed)", value: true, locked: true }],
    gates: [{ id: "g1", op: "XOR", in: ["a", "b"] }, { id: "g2", op: "AND", in: ["c", "g1"] }, { id: "g3", op: "NOT", in: ["g2"] }],
    goals: [{ name: "Door", node: "g2", want: true }, { name: "Alarm", node: "g3", want: false }],
  };
  it("each gate says what it reads and what it feeds, and each lamp says which gate it is wired to", () => {
    const v = lc.view(d, lc.init(d));
    expect(v.gates.find((g) => g.id === "g1")).toMatchObject({ reads: ["A", "B"], feeds: ["g2"] });
    expect(v.gates.find((g) => g.id === "g2")).toMatchObject({ reads: ["C", "g1"], feeds: ["g3", "Door lamp"] });
    expect(v.gates.find((g) => g.id === "g3")!.feeds).toEqual(["Alarm lamp"]);
    expect(v.goals.map((g) => [g.name, g.node])).toEqual([["Door", "g2"], ["Alarm", "g3"]]);
  });
  it("each lamp spells out the whole chain with every value", () => {
    const v = lc.view(d, lc.init(d));
    expect(v.goals[0]!.chain).toBe("AND(C=ON, XOR(A=ON, B=off)=ON)=ON");
    expect(v.goals[1]!.chain).toBe("NOT(AND(C=ON, XOR(A=ON, B=off)=ON)=ON)=off");
  });
});

describe("logic circuit diagram layout", () => {
  const d: LogicCircuitDef = {
    id: "w", kind: "logic_circuit",
    inputs: [{ id: "a", name: "Switch A", value: true }, { id: "b", name: "Switch B" }, { id: "c", name: "Switch C (fixed)", value: true, locked: true }],
    gates: [{ id: "g1", op: "XOR", in: ["a", "b"] }, { id: "g2", op: "AND", in: ["c", "g1"] }, { id: "g3", op: "NOT", in: ["g2"] }],
    goals: [{ name: "Door", node: "g2", want: true }, { name: "Alarm", node: "g3", want: false }],
  };
  const dia = () => lc.view(d, lc.init(d)).diagram;

  it("puts switches in the first column, each gate one column past its deepest input, and lamps last", () => {
    const x = Object.fromEntries(dia().nodes.map((n) => [n.id, n.x]));
    expect(x.a).toBe(x.b);
    expect(x.g1!).toBeGreaterThan(x.a!);
    expect(x.g2!).toBeGreaterThan(x.g1!);
    expect(x.g3!).toBeGreaterThan(x.g2!);
    expect(x.lamp0).toBe(x.lamp1);
    expect(x.lamp0!).toBeGreaterThan(x.g3!);
  });

  it("draws one wire per gate input and one per lamp, each carrying its source's value and ending at its target's left edge", () => {
    const g = dia();
    expect(g.wires).toHaveLength(2 + 2 + 1 + 2);
    const node = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
    for (const w of g.wires) {
      expect(w.value).toBe(node[w.from]!.value);
      expect(w.x1).toBe(node[w.from]!.x + g.box.w);
      expect(w.x2).toBe(node[w.to]!.x);
      expect(w.y2).toBeGreaterThanOrEqual(node[w.to]!.y);
      expect(w.y2).toBeLessThanOrEqual(node[w.to]!.y + g.box.h);
    }
  });

  it("no two boxes overlap, and everything fits inside the drawing", () => {
    const g = dia();
    for (const [i, a] of g.nodes.entries()) {
      expect(a.x + g.box.w).toBeLessThanOrEqual(g.width);
      expect(a.y + g.box.h).toBeLessThanOrEqual(g.height);
      for (const b of g.nodes.slice(i + 1)) {
        const apart = a.x + g.box.w <= b.x || b.x + g.box.w <= a.x || a.y + g.box.h <= b.y || b.y + g.box.h <= a.y;
        expect(apart, `${a.id} overlaps ${b.id}`).toBe(true);
      }
    }
  });

  it("marks fixed switches as not tappable and gives tappable ones their control index; lamps know if they are met", () => {
    const g = dia();
    expect(g.nodes.find((n) => n.id === "c")).toMatchObject({ locked: true, index: null });
    expect(g.nodes.find((n) => n.id === "b")).toMatchObject({ locked: false, index: 1 });
    expect(g.nodes.find((n) => n.id === "lamp0")).toMatchObject({ kind: "lamp", label: "Door", tag: "g2", want: true });
  });

  it("is deterministic and updates values, not positions, when a switch flips", () => {
    const before = lc.view(d, [1, 0, 1]).diagram;
    const after = lc.view(d, [1, 1, 1]).diagram;
    expect(after.nodes.map((n) => [n.x, n.y])).toEqual(before.nodes.map((n) => [n.x, n.y]));
    expect(after.nodes.find((n) => n.id === "b")!.value).toBe(true);
    expect(lc.view(d, [1, 0, 1]).diagram).toEqual(before);
  });

  it("lays out the shipped door circuit with nothing overlapping", () => {
    const shipped: LogicCircuitDef = {
      id: "door", kind: "logic_circuit",
      inputs: [{ id: "a", name: "Switch A", value: true }, { id: "b", name: "Switch B" }, { id: "c", name: "Switch C (fixed)", value: true, locked: true }, { id: "d", name: "Switch D", value: true }],
      gates: [
        { id: "g1", op: "XOR", in: ["a", "b"] }, { id: "g2", op: "AND", in: ["c", "d"] }, { id: "g3", op: "NOT", in: ["g2"] },
        { id: "g4", op: "AND", in: ["g1", "g3"] }, { id: "g5", op: "NOR", in: ["a", "d"] }, { id: "g6", op: "XOR", in: ["b", "d"] },
      ],
      goals: [{ name: "Door", node: "g4", want: true }, { name: "Alarm", node: "g2", want: false }, { name: "Hall light", node: "g5", want: true }, { name: "Siren", node: "g6", want: true }],
    };
    const g = lc.view(shipped, lc.init(shipped)).diagram;
    const keys = g.nodes.map((n) => `${n.x},${n.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(g.nodes).toHaveLength(4 + 6 + 4);
    expect(g.wires).toHaveLength(11 + 4); // gate inputs 2+2+1+2+2+2, plus one wire per lamp
  });
});
