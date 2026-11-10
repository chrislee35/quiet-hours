/**
 * Code-lock puzzle (HAK-2): a row of dials, each turned one step per tap (wrapping), that must match a secret
 * code. The code is *information from the world*: a clue, a document, something an NPC says. Nothing in the lock
 * itself reveals it unless `feedback` is "count", which lights one lamp per correct dial (use that only for low
 * stakes locks). Values vector: the current digit of each dial.
 */
export interface CodeLockDef {
  id: string;
  kind: "code_lock";
  /** The code, one digit character per dial; digits are 0..base-1 (base 10 by default). */
  code: string;
  base?: number;
  /** "none": no feedback until it opens. "count": shows how many dials are right. */
  feedback: "none" | "count";
  /** Starting digits, same length as the code (default all zeros). */
  start?: string;
  /** A line shown on the lock, e.g. where to look. */
  hint?: string;
}

const baseOf = (d: CodeLockDef): number => d.base ?? 10;

export function validate(def: CodeLockDef): string[] {
  const errors: string[] = [];
  const base = baseOf(def);
  if (!Number.isInteger(base) || base < 2 || base > 10) errors.push("base must be a whole number from 2 to 10");
  if (def.code.length < 2 || def.code.length > 8) errors.push("the code needs 2 to 8 digits");
  if (!["none", "count"].includes(def.feedback)) errors.push('feedback must be "none" or "count"');
  const ok = (s: string) => [...s].every((ch) => /\d/.test(ch) && Number(ch) < base);
  if (!ok(def.code)) errors.push(`the code must use digits below ${base}`);
  if (def.start !== undefined && (def.start.length !== def.code.length || !ok(def.start))) errors.push("start must match the code's length and digits");
  return errors;
}

export function init(def: CodeLockDef): number[] {
  return [...(def.start ?? "0".repeat(def.code.length))].map(Number);
}

export function tap(def: CodeLockDef, values: readonly number[], index: number): number[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= def.code.length) return null;
  const next = values.slice();
  next[index] = ((next[index] ?? 0) + 1) % baseOf(def);
  return next;
}

const correct = (def: CodeLockDef, values: readonly number[]): number => [...def.code].filter((ch, i) => Number(ch) === values[i]).length;

export function isSolved(def: CodeLockDef, values: readonly number[]): boolean {
  return correct(def, values) === def.code.length;
}

export function solve(def: CodeLockDef, from: readonly number[] = init(def)): number[] | null {
  const base = baseOf(def);
  const taps: number[] = [];
  [...def.code].forEach((ch, i) => {
    for (let t = 0; t < (((Number(ch) - (from[i] ?? 0)) % base) + base) % base; t++) taps.push(i);
  });
  return taps;
}

export interface CodeLockView {
  dials: { index: number; digit: number }[];
  /** Dials that are right, or null when the lock gives no feedback. */
  correct: number | null;
  hint: string | null;
}

export function view(def: CodeLockDef, values: readonly number[]): CodeLockView {
  return {
    dials: values.map((digit, index) => ({ index, digit })),
    correct: def.feedback === "count" ? correct(def, values) : null,
    hint: def.hint ?? null,
  };
}
