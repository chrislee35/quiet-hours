/**
 * Signal-path puzzle (T2.11, HAK-2): a beam leaves each source and bounces off mirrors; flip the flippable mirrors
 * until every target is lit and no beam touches a hazard. Pure logic with a solver, like power routing.
 *
 * Cells (one character each):  #  wall   .  empty   X  hazard (the beam must not reach it)
 *   /  \  a mirror the player can flip (the character is its starting orientation)
 *   P  Q  a fixed mirror shaped like /  and  \   (drawn the same, cannot be flipped)
 * Beams pass straight through empty cells, sources and targets, and stop at walls and the edge of the grid.
 * Values vector: one entry per cell; 0 as drawn, 1 flipped (only flippable cells ever change).
 */
export type Dir = "N" | "E" | "S" | "W";

export interface SignalPathDef {
  id: string;
  kind: "signal_path";
  width: number;
  height: number;
  cells: string[];
  sources: { x: number; y: number; dir: Dir }[];
  targets: [x: number, y: number][];
}

const DX: Record<Dir, number> = { N: 0, E: 1, S: 0, W: -1 };
const DY: Record<Dir, number> = { N: -1, E: 0, S: 1, W: 0 };
const SLASH: Record<Dir, Dir> = { E: "N", N: "E", W: "S", S: "W" };
const BACKSLASH: Record<Dir, Dir> = { E: "S", S: "E", W: "N", N: "W" };

const char = (def: SignalPathDef, i: number): string => def.cells[Math.floor(i / def.width)]?.[i % def.width] ?? "#";
export const isFlippable = (ch: string): boolean => ch === "/" || ch === "\\";

/** The mirror shape ("/" or "\\") at a cell under the current flips, or null if it is not a mirror. */
export function mirrorAt(def: SignalPathDef, values: readonly number[], i: number): "/" | "\\" | null {
  const ch = char(def, i);
  if (ch === "P") return "/";
  if (ch === "Q") return "\\";
  if (!isFlippable(ch)) return null;
  const flipped = (values[i] ?? 0) === 1;
  return (ch === "/") !== flipped ? "/" : "\\";
}

export function validate(def: SignalPathDef): string[] {
  const errors: string[] = [];
  const { width, height } = def;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width > 14 || height > 14) return ["size must be whole numbers from 2 to 14"];
  if (def.cells.length !== height || def.cells.some((r) => r.length !== width)) return [`cells must be ${height} rows of ${width} characters`];
  def.cells.forEach((row, y) => [...row].forEach((ch, x) => { if (!"#.X/\\PQ".includes(ch)) errors.push(`unknown cell "${ch}" at (${x}, ${y})`); }));
  const inside = (x: number, y: number) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height;
  if (def.sources.length === 0) errors.push("needs at least one source");
  def.sources.forEach((s, i) => {
    if (!inside(s.x, s.y)) errors.push(`source ${i + 1} is outside the grid`);
    else if (char(def, s.y * width + s.x) !== ".") errors.push(`source ${i + 1} must sit on an empty cell`);
    if (!(s.dir in DX)) errors.push(`source ${i + 1} has a bad direction`);
  });
  if (def.targets.length === 0) errors.push("needs at least one target");
  def.targets.forEach(([x, y], i) => {
    if (!inside(x, y)) errors.push(`target ${i + 1} is outside the grid`);
    else if (char(def, y * width + x) !== ".") errors.push(`target ${i + 1} must sit on an empty cell`);
  });
  if (!def.cells.some((r) => /[/\\]/.test(r))) errors.push("needs at least one flippable mirror");
  return errors;
}

export function init(def: SignalPathDef): number[] {
  return Array.from({ length: def.width * def.height }, () => 0);
}

export function tap(def: SignalPathDef, values: readonly number[], index: number): number[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= def.width * def.height || !isFlippable(char(def, index))) return null;
  const next = values.slice();
  next[index] = (next[index] ?? 0) === 1 ? 0 : 1;
  return next;
}

export interface Trace {
  /** Every cell any beam passes through (and the source cells). */
  lit: Set<number>;
  hazardHit: boolean;
}

export function trace(def: SignalPathDef, values: readonly number[]): Trace {
  const lit = new Set<number>();
  let hazardHit = false;
  for (const s of def.sources) {
    let x = s.x;
    let y = s.y;
    let dir = s.dir;
    const seen = new Set<string>();
    lit.add(y * def.width + x);
    for (;;) {
      x += DX[dir];
      y += DY[dir];
      if (x < 0 || y < 0 || x >= def.width || y >= def.height) break;
      const i = y * def.width + x;
      const ch = char(def, i);
      if (ch === "#") break;
      lit.add(i);
      if (ch === "X") {
        hazardHit = true;
        break;
      }
      const key = `${i}${dir}`;
      if (seen.has(key)) break; // a closed loop
      seen.add(key);
      const m = mirrorAt(def, values, i);
      if (m === "/") dir = SLASH[dir];
      else if (m === "\\") dir = BACKSLASH[dir];
    }
  }
  return { lit, hazardHit };
}

export function isSolved(def: SignalPathDef, values: readonly number[]): boolean {
  const t = trace(def, values);
  return !t.hazardHit && def.targets.every(([x, y]) => t.lit.has(y * def.width + x));
}

/** The fewest flips (a list of cell indexes) that solve it from `from`, or null if none do. */
export function solve(def: SignalPathDef, from: readonly number[] = init(def)): number[] | null {
  const cells = [...Array(def.width * def.height).keys()].filter((i) => isFlippable(char(def, i)));
  if (cells.length > 18) return null;
  let best: number[] | null = null;
  for (let mask = 0; mask < 1 << cells.length; mask++) {
    const values = from.slice();
    const flips: number[] = [];
    cells.forEach((c, k) => {
      if (mask & (1 << k)) {
        values[c] = (values[c] ?? 0) === 1 ? 0 : 1;
        flips.push(c);
      }
    });
    if ((best === null || flips.length < best.length) && isSolved(def, values)) best = flips;
  }
  return best;
}

export interface SignalCell {
  /** What to draw: "#", ".", "X", "/" or "\\" (the mirror's current shape). */
  glyph: string;
  flippable: boolean;
  lit: boolean;
  isSource: boolean;
  isTarget: boolean;
}

export function view(def: SignalPathDef, values: readonly number[]): { cells: SignalCell[] } {
  const t = trace(def, values);
  return {
    cells: Array.from({ length: def.width * def.height }, (_, i) => {
      const ch = char(def, i);
      const m = mirrorAt(def, values, i);
      const x = i % def.width;
      const y = Math.floor(i / def.width);
      return {
        glyph: m ?? ch,
        flippable: isFlippable(ch),
        lit: t.lit.has(i),
        isSource: def.sources.some((s) => s.x === x && s.y === y),
        isTarget: def.targets.some(([tx, ty]) => tx === x && ty === y),
      };
    }),
  };
}
