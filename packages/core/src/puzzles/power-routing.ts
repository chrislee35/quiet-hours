/**
 * Power-routing puzzle (T1.9, HAK-2): rotate pipe pieces until power flows from the source to every target.
 * Pure logic with no rendering: `init`, `rotate`, `powered`, `isSolved`, and a solver used at build time to
 * prove every shipped puzzle is solvable (TESTING §7).
 *
 * Pieces (base orientation, sides numbered 0=N 1=E 2=S 3=W; rotating turns pieces clockwise):
 *   I straight (N,S)   L corner (N,E)   T tee (N,E,W)   + cross (all)   E dead end (N)   . empty
 * Two neighbouring cells are connected when both have an open side facing each other.
 */

export interface PuzzleDef {
  id: string;
  kind: "power_routing";
  width: number;
  height: number;
  /** One string per row, one character per cell, from the piece alphabet above. */
  pieces: string[];
  /** Starting rotation (0-3) for every cell, same shape as `pieces`. */
  rotations: string[];
  source: [x: number, y: number];
  targets: [x: number, y: number][];
}

export interface PuzzleState {
  /** Row-major rotation (0-3) per cell. */
  rotations: number[];
}

const BASE: Record<string, readonly number[]> = {
  I: [0, 2],
  L: [0, 1],
  T: [0, 1, 3],
  "+": [0, 1, 2, 3],
  E: [0],
  ".": [],
};
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export function pieceAt(def: PuzzleDef, index: number): string {
  return def.pieces[Math.floor(index / def.width)]?.[index % def.width] ?? ".";
}

/** Open sides (0-3) of the piece at `index` under rotation `rot`. */
export function openSides(piece: string, rot: number): number[] {
  return (BASE[piece] ?? []).map((s) => (s + rot) % 4);
}

/** How many distinct rotations the piece has (a straight pipe looks the same after 2 turns, a cross after 1). */
export function distinctRotations(piece: string): number {
  return piece === "+" ? 1 : piece === "I" ? 2 : piece === "." ? 1 : 4;
}

export function validatePuzzleDef(def: PuzzleDef): string[] {
  const errors: string[] = [];
  const { width, height } = def;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 12 || height > 12) {
    return [`size must be whole numbers from 1 to 12`];
  }
  for (const [name, rows] of [["pieces", def.pieces], ["rotations", def.rotations]] as const) {
    if (rows.length !== height || rows.some((r) => r.length !== width)) errors.push(`${name} must be ${height} rows of ${width} characters`);
  }
  if (errors.length > 0) return errors;
  def.pieces.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (!(ch in BASE)) errors.push(`unknown piece "${ch}" at (${x}, ${y})`);
    }),
  );
  def.rotations.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (!/^[0-3]$/.test(ch)) errors.push(`rotation at (${x}, ${y}) must be 0-3`);
    }),
  );
  const check = (label: string, [x, y]: [number, number]) => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) errors.push(`${label} is outside the grid`);
    else if (def.pieces[y]![x] === ".") errors.push(`${label} at (${x}, ${y}) is an empty cell`);
  };
  check("source", def.source);
  if (def.targets.length === 0) errors.push("needs at least one target");
  def.targets.forEach((t, i) => check(`target ${i + 1}`, t));
  return errors;
}

export function init(def: PuzzleDef): PuzzleState {
  return { rotations: def.rotations.flatMap((row) => [...row].map(Number)) };
}

/** Rotate one cell a quarter turn clockwise. Returns null for an invalid move (outside the grid, or an empty cell). */
export function rotate(def: PuzzleDef, state: PuzzleState, index: number): PuzzleState | null {
  if (!Number.isInteger(index) || index < 0 || index >= def.width * def.height) return null;
  if (pieceAt(def, index) === ".") return null;
  const rotations = state.rotations.slice();
  rotations[index] = ((rotations[index] ?? 0) + 1) % 4;
  return { rotations };
}

/** Cells reached by power, found by flood fill from the source through matching open sides. */
export function powered(def: PuzzleDef, state: PuzzleState): Set<number> {
  const w = def.width;
  const start = def.source[1] * w + def.source[0];
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const i = queue.pop()!;
    const x = i % w;
    const y = Math.floor(i / w);
    for (const side of openSides(pieceAt(def, i), state.rotations[i] ?? 0)) {
      const nx = x + DX[side]!;
      const ny = y + DY[side]!;
      if (nx < 0 || ny < 0 || nx >= w || ny >= def.height) continue;
      const j = ny * w + nx;
      if (seen.has(j)) continue;
      if (openSides(pieceAt(def, j), state.rotations[j] ?? 0).includes((side + 2) % 4)) {
        seen.add(j);
        queue.push(j);
      }
    }
  }
  return seen;
}

export function isSolved(def: PuzzleDef, state: PuzzleState): boolean {
  const p = powered(def, state);
  return def.targets.every(([x, y]) => p.has(y * def.width + x));
}

/**
 * Finds a shortest list of cell rotations (a cell index repeated once per quarter turn) that solves the puzzle,
 * or null if none exists within `maxNodes` search steps (treated as "not proven solvable").
 * Depth-first over distinct rotations per cell, pruned by an optimistic reachability check.
 */
export function solve(def: PuzzleDef, from: PuzzleState = init(def), maxNodes = 2_000_000): number[] | null {
  const n = def.width * def.height;
  const cells = [...Array(n).keys()].filter((i) => pieceAt(def, i) !== ".");
  // Assign cells in order of distance from the source so connections form early and pruning bites.
  const sx = def.source[0];
  const sy = def.source[1];
  cells.sort((a, b) => {
    const da = Math.abs((a % def.width) - sx) + Math.abs(Math.floor(a / def.width) - sy);
    const db = Math.abs((b % def.width) - sx) + Math.abs(Math.floor(b / def.width) - sy);
    return da - db || a - b;
  });

  const assigned = new Map<number, number>(); // cell -> chosen rotation
  let nodes = 0;
  let best: Map<number, number> | null = null;
  let bestCost = Infinity;

  /** Optimistic: unassigned cells may open any side they could ever open; assigned cells are exact. */
  const couldReachAll = (): boolean => {
    const w = def.width;
    const start = sy * w + sx;
    const seen = new Set<number>([start]);
    const stack = [start];
    const sidesOf = (i: number): readonly number[] => {
      const r = assigned.get(i);
      const piece = pieceAt(def, i);
      return r !== undefined ? openSides(piece, r) : [0, 1, 2, 3].filter(() => piece !== ".");
    };
    while (stack.length > 0) {
      const i = stack.pop()!;
      for (const side of sidesOf(i)) {
        const nx = (i % w) + DX[side]!;
        const ny = Math.floor(i / w) + DY[side]!;
        if (nx < 0 || ny < 0 || nx >= w || ny >= def.height) continue;
        const j = ny * w + nx;
        if (seen.has(j) || pieceAt(def, j) === ".") continue;
        if (sidesOf(j).includes((side + 2) % 4)) {
          seen.add(j);
          stack.push(j);
        }
      }
    }
    return def.targets.every(([x, y]) => seen.has(y * w + x));
  };

  const dfs = (k: number, cost: number): void => {
    if (nodes++ > maxNodes || cost >= bestCost) return;
    if (!couldReachAll()) return;
    if (k === cells.length) {
      const state: PuzzleState = { rotations: from.rotations.map((r, i) => assigned.get(i) ?? r) };
      if (isSolved(def, state)) {
        best = new Map(assigned);
        bestCost = cost;
      }
      return;
    }
    const cell = cells[k]!;
    const piece = pieceAt(def, cell);
    const start = from.rotations[cell] ?? 0;
    for (let turns = 0; turns < distinctRotations(piece); turns++) {
      assigned.set(cell, (start + turns) % 4);
      dfs(k + 1, cost + turns);
    }
    assigned.delete(cell);
  };
  dfs(0, 0);

  if (best === null) return null;
  const moves: number[] = [];
  for (const [cell, rot] of best as Map<number, number>) {
    const turns = (rot - (from.rotations[cell] ?? 0) + 4) % 4;
    for (let t = 0; t < turns; t++) moves.push(cell);
  }
  return moves.sort((a, b) => a - b);
}
