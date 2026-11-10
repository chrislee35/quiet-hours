/**
 * Arithmetic puzzle (HAK-2, mathematics): numbers in a row with an operator slot between each pair; choose the
 * operators so the expression equals the target. Ordinary precedence applies (x and / before + and -), and the
 * arithmetic is exact (fractions), so "7 / 2 x 2" is 7, not 6. A division by zero makes the expression invalid.
 * Values vector: the operator chosen for each gap, as an index into `ops`.
 */
import type { BoardView } from "./board.ts";

export interface ArithmeticDef {
  id: string;
  kind: "arithmetic";
  numbers: number[];
  /** Which operators may be chosen, in the order they cycle: some of the characters + - * and a slash for divide. */
  ops: string;
  target: number;
  hint?: string;
}

interface Frac { n: number; d: number }
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const frac = (n: number, d = 1): Frac => { const g = gcd(n, d) || 1; return d < 0 ? { n: -n / g, d: -d / g } : { n: n / g, d: d / g }; };

const SYMBOL: Record<string, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

/** The value of the expression, or null if it divides by zero. */
export function evaluate(def: ArithmeticDef, values: readonly number[]): Frac | null {
  // First pass: x and / bind tighter. Collect terms joined by + or -.
  const terms: Frac[] = [frac(def.numbers[0]!)];
  const signs: string[] = [];
  for (let i = 1; i < def.numbers.length; i++) {
    const op = def.ops[values[i - 1] ?? 0]!;
    const x = frac(def.numbers[i]!);
    if (op === "*" || op === "/") {
      const last = terms[terms.length - 1]!;
      if (op === "/" && x.n === 0) return null;
      terms[terms.length - 1] = op === "*" ? frac(last.n * x.n, last.d * x.d) : frac(last.n * x.d, last.d * x.n);
    } else {
      signs.push(op);
      terms.push(x);
    }
  }
  let acc = terms[0]!;
  signs.forEach((s, i) => {
    const t = terms[i + 1]!;
    acc = s === "+" ? frac(acc.n * t.d + t.n * acc.d, acc.d * t.d) : frac(acc.n * t.d - t.n * acc.d, acc.d * t.d);
  });
  return acc;
}

export function validate(def: ArithmeticDef): string[] {
  const errors: string[] = [];
  if (def.numbers.length < 3 || def.numbers.length > 6 || def.numbers.some((n) => !Number.isInteger(n) || n < 0 || n > 99)) errors.push("needs 3 to 6 whole numbers from 0 to 99");
  if (def.ops.length < 2 || /[^+\-*/]/.test(def.ops) || new Set(def.ops).size !== def.ops.length) errors.push('ops must be 2 or more different characters from "+-*/"');
  if (!Number.isInteger(def.target)) errors.push("target must be a whole number");
  return errors;
}

export const init = (def: ArithmeticDef): number[] => def.numbers.slice(1).map(() => 0);

export function tap(def: ArithmeticDef, values: readonly number[], index: number): number[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= values.length) return null;
  const next = values.slice();
  next[index] = ((next[index] ?? 0) + 1) % def.ops.length;
  return next;
}

export function isSolved(def: ArithmeticDef, values: readonly number[]): boolean {
  const v = evaluate(def, values);
  return v !== null && v.d === 1 && v.n === def.target;
}

export function solve(def: ArithmeticDef, from: readonly number[] = init(def)): number[] | null {
  const gaps = def.numbers.length - 1;
  const total = def.ops.length ** gaps;
  let best: number[] | null = null;
  for (let code = 0; code < total; code++) {
    const values: number[] = [];
    let c = code;
    for (let g = 0; g < gaps; g++) { values.push(c % def.ops.length); c = Math.floor(c / def.ops.length); }
    if (!isSolved(def, values)) continue;
    const taps: number[] = [];
    values.forEach((v, g) => { for (let t = 0; t < (v - (from[g] ?? 0) + def.ops.length) % def.ops.length; t++) taps.push(g); });
    if (best === null || taps.length < best.length) best = taps;
  }
  return best;
}

const show = (f: Frac | null): string => (f === null ? "undefined (division by zero)" : f.d === 1 ? String(f.n) : `${f.n}/${f.d}`);

export function view(def: ArithmeticDef, values: readonly number[]): BoardView {
  const v = evaluate(def, values);
  const controls = def.numbers.flatMap((n, i) => {
    const num = { index: -1, text: String(n), aria: `Number ${n}`, disabled: true };
    if (i === 0) return [num];
    const op = def.ops[values[i - 1] ?? 0]!;
    return [{ index: i - 1, text: SYMBOL[op]!, aria: `Operator ${i}: ${SYMBOL[op]}. Tap to change it.`, tone: "on" as const }, num];
  });
  return {
    kind: "board",
    of: "arithmetic",
    hint: `Choose the operators so the whole expression equals ${def.target}. × and ÷ are done before + and −, and fractions are exact.${def.hint ? ` ${def.hint}` : ""}`,
    status: `The expression is worth ${show(v)}; you need ${def.target}.`,
    rows: [{ controls }],
    lines: [{ text: `${def.numbers.map((n, i) => (i === 0 ? String(n) : `${SYMBOL[def.ops[values[i - 1] ?? 0]!]} ${n}`)).join(" ")} = ${show(v)}`, tone: "mono" }],
  };
}
