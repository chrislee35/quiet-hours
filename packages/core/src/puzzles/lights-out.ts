/**
 * Fuse-panel puzzle (HAK-2), the classic "lights out": tapping a fuse flips it and its four neighbours; switch
 * every fuse off. `layout` rows use "#" for a lit fuse, "o" for a dark one and "." for no fuse. Solved by linear
 * algebra over GF(2), so the solver is exact: it proves solvability and finds the fewest taps.
 * Values vector: 1 = lit, 0 = dark, per cell (cells without a fuse stay 0).
 */
export interface LightsOutDef {
  id: string;
  kind: "lights_out";
  width: number;
  height: number;
  layout: string[];
}

const has = (d: LightsOutDef, i: number): boolean => d.layout[Math.floor(i / d.width)]?.[i % d.width] !== "." && i >= 0 && i < d.width * d.height;

export function validate(def: LightsOutDef): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(def.width) || !Number.isInteger(def.height) || def.width < 2 || def.height < 2 || def.width > 7 || def.height > 7) return ["size must be whole numbers from 2 to 7"];
  if (def.layout.length !== def.height || def.layout.some((r) => r.length !== def.width)) return [`layout must be ${def.height} rows of ${def.width} characters`];
  if (def.layout.some((r) => /[^#o.]/.test(r))) errors.push('layout may only contain "#" (lit), "o" (dark) and "." (no fuse)');
  return errors;
}

export function init(def: LightsOutDef): number[] {
  return def.layout.flatMap((row) => [...row].map((ch) => (ch === "#" ? 1 : 0)));
}

/** The cells one tap at `i` flips: itself and its orthogonal neighbours that have fuses. */
export function affected(def: LightsOutDef, i: number): number[] {
  const x = i % def.width;
  const y = Math.floor(i / def.width);
  const out = [i];
  if (x > 0) out.push(i - 1);
  if (x < def.width - 1) out.push(i + 1);
  if (y > 0) out.push(i - def.width);
  if (y < def.height - 1) out.push(i + def.width);
  return out.filter((j) => has(def, j));
}

export function tap(def: LightsOutDef, values: readonly number[], index: number): number[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= def.width * def.height || !has(def, index)) return null;
  const next = values.slice();
  for (const j of affected(def, index)) next[j] = (next[j] ?? 0) === 1 ? 0 : 1;
  return next;
}

export function isSolved(def: LightsOutDef, values: readonly number[]): boolean {
  return values.every((v, i) => !has(def, i) || v === 0);
}

/** Fewest taps (each cell at most once) that turn everything off, via Gaussian elimination over GF(2). */
export function solve(def: LightsOutDef, from: readonly number[] = init(def)): number[] | null {
  const cells = [...Array(def.width * def.height).keys()].filter((i) => has(def, i));
  const n = cells.length;
  const col = new Map(cells.map((c, k) => [c, k]));
  // Row r (a cell to switch off) : sum over taps t of A[r][t] * x_t = state[r], where A[r][t] = 1 if tap t flips r.
  const rows: number[][] = cells.map((r) => {
    const row = new Array<number>(n + 1).fill(0);
    for (const t of cells) if (affected(def, t).includes(r)) row[col.get(t)!] = 1;
    row[n] = from[r] ?? 0;
    return row;
  });
  const pivotCol: number[] = [];
  let r = 0;
  for (let c = 0; c < n && r < n; c++) {
    const p = rows.findIndex((row, k) => k >= r && row[c] === 1);
    if (p < 0) continue;
    [rows[r], rows[p]] = [rows[p]!, rows[r]!];
    for (let k = 0; k < n; k++) if (k !== r && rows[k]![c] === 1) for (let j = c; j <= n; j++) rows[k]![j] = rows[k]![j]! ^ rows[r]![j]!;
    pivotCol.push(c);
    r++;
  }
  for (let k = r; k < n; k++) if (rows[k]![n] === 1) return null; // inconsistent: no solution
  const free = [...Array(n).keys()].filter((c) => !pivotCol.includes(c));
  if (free.length > 16) return null;
  let best: number[] | null = null;
  for (let mask = 0; mask < 1 << free.length; mask++) {
    const x = new Array<number>(n).fill(0);
    free.forEach((c, b) => { x[c] = (mask >> b) & 1; });
    pivotCol.forEach((c, k) => {
      let v = rows[k]![n]!;
      for (const f of free) v ^= rows[k]![f]! & x[f]!;
      x[c] = v;
    });
    const taps = cells.filter((_, k) => x[k] === 1);
    if (best === null || taps.length < best.length) best = taps;
  }
  return best;
}

export interface LightsOutView {
  width: number;
  height: number;
  cells: { present: boolean; lit: boolean }[];
}

export function view(def: LightsOutDef, values: readonly number[]): LightsOutView {
  return { width: def.width, height: def.height, cells: values.map((v, i) => ({ present: has(def, i), lit: v === 1 })) };
}
