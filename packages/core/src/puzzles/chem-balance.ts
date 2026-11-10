/**
 * Chemistry puzzle (HAK-2): balance a chemical equation by choosing the whole-number coefficient in front of every
 * substance, so each element has the same number of atoms on both sides, in the smallest whole numbers. Formulas
 * may use parentheses ("Ca(OH)2"). Values vector: the coefficient (1-9) of each substance, reactants then products.
 */
import { subscript, type BoardView } from "./board.ts";

export interface ChemBalanceDef {
  id: string;
  kind: "chem_balance";
  reactants: string[];
  products: string[];
}

/** Atom counts of a formula, e.g. "Ca(OH)2" -> { Ca: 1, O: 2, H: 2 }. Null if it does not parse. */
export function atoms(formula: string): Map<string, number> | null {
  let i = 0;
  const parseGroup = (): Map<string, number> | null => {
    const out = new Map<string, number>();
    const add = (m: Map<string, number>, k: number) => m.forEach((n, e) => out.set(e, (out.get(e) ?? 0) + n * k));
    while (i < formula.length && formula[i] !== ")") {
      if (formula[i] === "(") {
        i++;
        const inner = parseGroup();
        if (!inner || formula[i] !== ")") return null;
        i++;
        add(inner, number());
      } else {
        const m = formula.slice(i).match(/^[A-Z][a-z]?/);
        if (!m) return null;
        i += m[0].length;
        out.set(m[0], (out.get(m[0]) ?? 0) + number());
      }
    }
    return out;
  };
  const number = (): number => {
    const m = formula.slice(i).match(/^\d+/);
    if (!m) return 1;
    i += m[0].length;
    return Number(m[0]);
  };
  const result = parseGroup();
  return result && i === formula.length && result.size > 0 ? result : null;
}

const species = (d: ChemBalanceDef): string[] => [...d.reactants, ...d.products];

/** Per element: atoms on the left, atoms on the right, under these coefficients. */
export function tally(def: ChemBalanceDef, values: readonly number[]): { element: string; left: number; right: number }[] {
  const rows = new Map<string, { left: number; right: number }>();
  species(def).forEach((f, i) => {
    const side = i < def.reactants.length ? "left" : "right";
    atoms(f)?.forEach((n, e) => {
      const r = rows.get(e) ?? { left: 0, right: 0 };
      r[side] += n * (values[i] ?? 1);
      rows.set(e, r);
    });
  });
  return [...rows].map(([element, r]) => ({ element, ...r })).sort((a, b) => (a.element < b.element ? -1 : 1));
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export function validate(def: ChemBalanceDef): string[] {
  const errors: string[] = [];
  const all = species(def);
  if (def.reactants.length < 1 || def.products.length < 1 || all.length < 3 || all.length > 6) return ["needs at least one reactant and one product, 3 to 6 substances in all"];
  const parsed = all.map((f) => atoms(f));
  parsed.forEach((p, i) => { if (!p) errors.push(`cannot read the formula "${all[i]}"`); });
  if (errors.length > 0) return errors;
  const left = new Set(def.reactants.flatMap((f) => [...atoms(f)!.keys()]));
  const right = new Set(def.products.flatMap((f) => [...atoms(f)!.keys()]));
  if ([...left].some((e) => !right.has(e)) || [...right].some((e) => !left.has(e))) errors.push("the two sides must contain the same elements");
  return errors;
}

export const init = (def: ChemBalanceDef): number[] => species(def).map(() => 1);

export function tap(def: ChemBalanceDef, values: readonly number[], index: number): number[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= species(def).length) return null;
  const next = values.slice();
  next[index] = ((next[index] ?? 1) % 9) + 1;
  return next;
}

export function isSolved(def: ChemBalanceDef, values: readonly number[]): boolean {
  return tally(def, values).every((r) => r.left === r.right) && values.reduce(gcd, 0) === 1;
}

export function solve(def: ChemBalanceDef, from: readonly number[] = init(def)): number[] | null {
  const n = species(def).length;
  let best: number[] | null = null;
  const cur = new Array<number>(n).fill(1);
  const go = (i: number): void => {
    if (i === n) {
      if (!isSolved(def, cur)) return;
      const taps: number[] = [];
      cur.forEach((c, k) => { for (let t = 0; t < (c - (from[k] ?? 1) + 9) % 9; t++) taps.push(k); });
      if (best === null || taps.length < best.length) best = taps;
      return;
    }
    for (let c = 1; c <= 9; c++) { cur[i] = c; go(i + 1); }
  };
  go(0);
  return best;
}

const pretty = (f: string): string => f.replace(/\d+/g, (d) => subscript(Number(d)));

export function view(def: ChemBalanceDef, values: readonly number[]): BoardView {
  const t = tally(def, values);
  const all = species(def);
  const controls = all.flatMap((f, i) => {
    const sep = i === 0 ? [] : [{ index: -1, text: i === def.reactants.length ? "→" : "+", aria: i === def.reactants.length ? "yields" : "plus", disabled: true }];
    return [...sep, { index: i, text: String(values[i] ?? 1), aria: `Coefficient of ${f}: ${values[i] ?? 1}. Tap to raise it.`, tone: "on" as const }, { index: -1, text: pretty(f), aria: f, disabled: true }];
  });
  return {
    kind: "board",
    of: "chem_balance",
    hint: "Balance the equation: choose the number in front of each substance so every element has the same number of atoms on both sides, in the smallest whole numbers.",
    status: `Elements balanced: ${t.filter((r) => r.left === r.right).length} of ${t.length}`,
    rows: [{ controls }],
    lines: t.map((r) => ({ text: `${r.element}: ${r.left} → ${r.right} ${r.left === r.right ? "✓" : "✗"}`, tone: r.left === r.right ? ("good" as const) : ("bad" as const) })),
  };
}
