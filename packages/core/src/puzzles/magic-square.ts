/**
 * Magic-square puzzle (HAK-2, mathematics): fill the 3x3 square with the digits 1-9, each once, so every row,
 * column and both diagonals add up to 15. Some digits are given; the rest are found by reasoning. A definition is
 * accepted only if it has exactly one solution, so it can be deduced and never needs guessing (PUZ-3).
 * Values vector: nine cells, 0 = blank, 1-9 otherwise.
 */
import type { BoardView } from "./board.ts";

export interface MagicSquareDef {
  id: string;
  kind: "magic_square";
  /** Three rows of three characters: a digit 1-9 (given) or "." (blank). */
  givens: string[];
}

const LINES: readonly (readonly number[])[] = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const LINE_NAMES = ["Row 1", "Row 2", "Row 3", "Column 1", "Column 2", "Column 3", "Diagonal ↘", "Diagonal ↙"];
const givenAt = (d: MagicSquareDef, i: number): number => (d.givens[Math.floor(i / 3)]?.[i % 3] ?? ".") === "." ? 0 : Number(d.givens[Math.floor(i / 3)]![i % 3]);

/** Every full filling that respects the givens. */
export function solutions(def: MagicSquareDef): number[][] {
  const out: number[][] = [];
  const cur = new Array<number>(9).fill(0);
  const used = new Set<number>();
  const go = (i: number): void => {
    if (i === 9) {
      if (LINES.every((l) => l.reduce((s, k) => s + cur[k]!, 0) === 15)) out.push(cur.slice());
      return;
    }
    const g = givenAt(def, i);
    for (const d of g ? [g] : [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      if (used.has(d)) continue;
      cur[i] = d;
      used.add(d);
      go(i + 1);
      used.delete(d);
    }
    cur[i] = 0;
  };
  go(0);
  return out;
}

export function validate(def: MagicSquareDef): string[] {
  if (def.givens.length !== 3 || def.givens.some((r) => r.length !== 3 || /[^1-9.]/.test(r))) return ["givens must be 3 rows of 3 characters, each 1-9 or ."];
  const digits = def.givens.join("").replace(/\./g, "");
  if (new Set(digits).size !== digits.length) return ["a digit is given twice"];
  if (digits.length < 2) return ["give at least two digits"];
  const n = solutions(def).length;
  return n === 1 ? [] : [n === 0 ? "has no solution" : `has ${n} solutions; it must have exactly one so it can be deduced`];
}

export const init = (def: MagicSquareDef): number[] => Array.from({ length: 9 }, (_, i) => givenAt(def, i));

export function tap(def: MagicSquareDef, values: readonly number[], index: number): number[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= 9 || givenAt(def, index) !== 0) return null;
  const next = values.slice();
  next[index] = ((next[index] ?? 0) % 9) + 1;
  return next;
}

export function isSolved(_: MagicSquareDef, v: readonly number[]): boolean {
  return new Set(v).size === 9 && !v.includes(0) && LINES.every((l) => l.reduce((s, k) => s + v[k]!, 0) === 15);
}

export function solve(def: MagicSquareDef, from: readonly number[] = init(def)): number[] | null {
  const sol = solutions(def)[0];
  if (!sol) return null;
  const taps: number[] = [];
  sol.forEach((want, i) => {
    if (givenAt(def, i) !== 0) return;
    const cur = from[i] ?? 0;
    const needed = cur === 0 ? want : (want - cur + 9) % 9; // 0 -> 1 -> ... -> 9 -> 1
    for (let t = 0; t < needed; t++) taps.push(i);
  });
  return taps;
}

export function view(def: MagicSquareDef, v: readonly number[]): BoardView {
  const sums = LINES.map((l) => l.reduce((s, k) => s + v[k]!, 0));
  return {
    kind: "board",
    of: "magic_square",
    hint: "Use each digit 1 to 9 exactly once so every row, column and diagonal adds up to 15. Tap a blank to count up through the digits. Some are fixed.",
    status: `Lines that add to 15: ${sums.filter((s, i) => s === 15 && LINES[i]!.every((k) => v[k] !== 0)).length} of 8`,
    rows: [0, 1, 2].map((r) => ({
      controls: [0, 1, 2].map((c) => {
        const index = r * 3 + c;
        const locked = givenAt(def, index) !== 0;
        return { index, text: v[index] ? String(v[index]) : "·", aria: `Row ${r + 1}, column ${c + 1}: ${v[index] ? v[index] : "blank"}${locked ? ", fixed" : ""}`, disabled: locked, ...(locked ? { tone: "on" as const } : {}) };
      }),
    })),
    lines: [
      ...LINES.map((l, i) => {
        const full = l.every((k) => v[k] !== 0);
        return { text: `${LINE_NAMES[i]}: ${full ? sums[i] : "…"}${full ? (sums[i] === 15 ? " ✓" : " ✗") : ""}`, ...(full ? { tone: sums[i] === 15 ? ("good" as const) : ("bad" as const) } : {}) };
      }),
      ...(new Set(v.filter((x) => x)).size < v.filter((x) => x).length ? [{ text: "A digit appears more than once.", tone: "bad" as const }] : []),
    ],
  };
}
