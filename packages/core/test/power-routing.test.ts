// covers: HAK-2, PUZ-1 (solver proves solvability)
import { describe, expect, it } from "vitest";
import { Rng, powerRouting as pr, type PowerRoutingDef as PuzzleDef } from "../src/index.ts";

const def = (over: Partial<PuzzleDef> = {}): PuzzleDef => ({
  id: "t", kind: "power_routing", width: 3, height: 1,
  pieces: ["EIE"], rotations: ["000"], source: [0, 0], targets: [[2, 0]], ...over,
});

describe("pieces", () => {
  it("rotate clockwise: sides 0=N 1=E 2=S 3=W", () => {
    expect(pr.openSides("I", 0)).toEqual([0, 2]);
    expect(pr.openSides("I", 1)).toEqual([1, 3]);
    expect(pr.openSides("L", 1).sort()).toEqual([1, 2]); // N,E -> E,S
    expect(pr.openSides("T", 3).sort()).toEqual([0, 2, 3]); // missing E
    expect(pr.openSides("+", 2)).toHaveLength(4);
    expect(pr.openSides("E", 3)).toEqual([3]);
    expect(pr.openSides(".", 1)).toEqual([]);
  });
  it("reports distinct rotations for symmetric pieces", () => {
    expect([pr.distinctRotations("+"), pr.distinctRotations("I"), pr.distinctRotations("L"), pr.distinctRotations("E")]).toEqual([1, 2, 4, 4]);
  });
});

describe("validatePuzzleDef", () => {
  it("accepts a good definition and reports every kind of mistake", () => {
    expect(pr.validatePuzzleDef(def())).toEqual([]);
    expect(pr.validatePuzzleDef(def({ pieces: ["EI"] }))[0]).toContain("1 rows of 3");
    expect(pr.validatePuzzleDef(def({ pieces: ["EXE"] }))[0]).toContain('unknown piece "X"');
    expect(pr.validatePuzzleDef(def({ rotations: ["049"] })).join()).toContain("must be 0-3");
    expect(pr.validatePuzzleDef(def({ source: [9, 0] }))[0]).toContain("source is outside");
    expect(pr.validatePuzzleDef(def({ pieces: ["E.E"], targets: [[1, 0]] }))[0]).toContain("empty cell");
    expect(pr.validatePuzzleDef(def({ targets: [] }))[0]).toContain("at least one target");
    expect(pr.validatePuzzleDef(def({ width: 99 }))[0]).toContain("1 to 12");
  });
});

describe("play", () => {
  it("starts unsolved, and is solved when the path connects", () => {
    const d = def();
    const s0 = pr.init(d);
    expect(pr.isSolved(d, s0)).toBe(false);
    expect(pr.isSolved(d, { rotations: [1, 1, 3] })).toBe(true);
    expect([...pr.powered(d, { rotations: [1, 1, 3] })].sort()).toEqual([0, 1, 2]);
  });

  it("power does not cross a gap or a mismatched side", () => {
    const d = def();
    expect(pr.isSolved(d, { rotations: [1, 0, 3] })).toBe(false); // straight pipe turned vertical
    expect(pr.isSolved(d, { rotations: [1, 1, 1] })).toBe(false); // last piece faces away
  });

  it("rotate turns a quarter, wraps after four, and rejects invalid moves without mutating", () => {
    const d = def();
    const s = pr.init(d);
    let t = s;
    for (let i = 0; i < 4; i++) t = pr.rotate(d, t, 1)!;
    expect(t.rotations).toEqual(s.rotations);
    expect(pr.rotate(d, s, 1)!.rotations).toEqual([0, 1, 0]);
    expect(s.rotations).toEqual([0, 0, 0]);
    expect(pr.rotate(d, s, -1)).toBeNull();
    expect(pr.rotate(d, s, 3)).toBeNull();
    expect(pr.rotate(d, s, 0.5)).toBeNull();
    expect(pr.rotate(def({ pieces: ["E.E"] }), s, 1)).toBeNull();
  });
});

describe("solve", () => {
  it("finds a minimal solution and applying it solves the puzzle", () => {
    const d = def();
    const moves = pr.solve(d)!;
    expect(moves).toEqual([0, 1, 2, 2, 2]); // cell 0: 1 turn, cell 1: 1 turn, cell 2: 3 turns
    let s = pr.init(d);
    for (const m of moves) s = pr.rotate(d, s, m)!;
    expect(pr.isSolved(d, s)).toBe(true);
  });

  it("returns an empty list when already solved", () => {
    expect(pr.solve(def({ rotations: ["113"] }))).toEqual([]);
  });

  it("returns null when no arrangement can connect source to target", () => {
    expect(pr.solve(def({ pieces: ["EEE"] }))).toBeNull(); // dead ends cannot pass power along
    expect(pr.solve(def({ pieces: ["E.E"], targets: [[2, 0]] }))).toBeNull();
  });

  it("gives up (null) at the node limit rather than hanging", () => {
    const big = def({ width: 6, height: 6, pieces: Array(6).fill("LLLLLL"), rotations: Array(6).fill("000000"), targets: [[5, 5]] });
    expect(pr.solve(big, pr.init(big), 3)).toBeNull();
  });

  it("the shipped maintenance puzzle is solvable, not trivially", () => {
    const shipped: PuzzleDef = {
      id: "maint_power", kind: "power_routing", width: 4, height: 4,
      pieces: ["EITE", "LETL", "TILE", "IL+I"], rotations: ["0000", "1000", "2102", "0110"],
      source: [0, 0], targets: [[3, 0], [1, 1], [3, 2]],
    };
    expect(pr.validatePuzzleDef(shipped)).toEqual([]);
    const moves = pr.solve(shipped)!;
    expect(moves.length).toBeGreaterThan(4);
    let s = pr.init(shipped);
    for (const m of moves) s = pr.rotate(shipped, s, m)!;
    expect(pr.isSolved(shipped, s)).toBe(true);
  });

  it("solves randomly generated puzzles that are solvable by construction, never costing more than the scramble", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = new Rng(seed);
      const w = rng.int(3, 4);
      const h = rng.int(3, 4);
      const pieces = Array.from({ length: h }, () => Array.from({ length: w }, () => rng.pick(["I", "L", "T", "+", "E", "L", "I"])).join(""));
      const solvedRot = Array.from({ length: h * w }, () => rng.int(0, 3));
      const base: PuzzleDef = {
        id: "g", kind: "power_routing", width: w, height: h, pieces,
        rotations: Array.from({ length: h }, (_, y) => solvedRot.slice(y * w, y * w + w).join("")),
        source: [0, 0], targets: [[0, 0]],
      };
      const lit = [...pr.powered(base, { rotations: solvedRot })].filter((i) => i !== 0);
      if (lit.length === 0) continue; // the source happened to be isolated; nothing to route
      const targets = lit.slice(0, 3).map((i): [number, number] => [i % w, Math.floor(i / w)]);
      const puzzle: PuzzleDef = { ...base, targets };
      expect(pr.isSolved(puzzle, { rotations: solvedRot }), `seed ${seed} baseline`).toBe(true);

      // Scramble, then require the solver to find *a* solution no worse than undoing the scramble.
      const scrambled = solvedRot.map((r, i) => (pieces[Math.floor(i / w)]![i % w] === "." ? r : (r + rng.int(0, 3)) % 4));
      const scrambledPuzzle = { ...puzzle, rotations: Array.from({ length: h }, (_, y) => scrambled.slice(y * w, y * w + w).join("")) };
      const undoCost = scrambled.reduce((n, r, i) => n + ((solvedRot[i]! - r + 4) % 4), 0);
      const moves = pr.solve(scrambledPuzzle);
      expect(moves, `seed ${seed}`).not.toBeNull();
      expect(moves!.length).toBeLessThanOrEqual(undoCost);
      let s = pr.init(scrambledPuzzle);
      for (const m of moves!) s = pr.rotate(scrambledPuzzle, s, m)!;
      expect(pr.isSolved(scrambledPuzzle, s), `seed ${seed} applied`).toBe(true);
    }
  });
});
