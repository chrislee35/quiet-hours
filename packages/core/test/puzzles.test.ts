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
