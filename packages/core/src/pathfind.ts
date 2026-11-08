/**
 * Grid A* (T1.4): 8-directional, no corner cutting, deterministic tie-breaking.
 * Returns tile coordinates from the step after `start` through `goal`, or null if unreachable.
 */
export interface Tile {
  x: number;
  y: number;
}

export function findPath(
  width: number,
  height: number,
  start: Tile,
  goal: Tile,
  passable: (x: number, y: number) => boolean,
  maxNodes = 6000,
): Tile[] | null {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  if (!inside(start.x, start.y) || !inside(goal.x, goal.y) || !passable(goal.x, goal.y)) return null;
  if (start.x === goal.x && start.y === goal.y) return [];

  const idx = (x: number, y: number) => y * width + x;
  const octile = (x: number, y: number) => {
    const dx = Math.abs(x - goal.x);
    const dy = Math.abs(y - goal.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };

  const g = new Map<number, number>();
  const parent = new Map<number, number>();
  const closed = new Set<number>();
  // Open list as a plain array scanned for the minimum: maps are small and this keeps ordering exact.
  const open: { i: number; x: number; y: number; f: number; h: number }[] = [];
  g.set(idx(start.x, start.y), 0);
  open.push({ i: idx(start.x, start.y), x: start.x, y: start.y, f: octile(start.x, start.y), h: octile(start.x, start.y) });

  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ] as const;

  let expanded = 0;
  while (open.length > 0 && expanded++ < maxNodes) {
    let best = 0;
    for (let k = 1; k < open.length; k++) {
      const a = open[k]!;
      const b = open[best]!;
      if (a.f < b.f || (a.f === b.f && (a.h < b.h || (a.h === b.h && a.i < b.i)))) best = k;
    }
    const cur = open.splice(best, 1)[0]!;
    if (closed.has(cur.i)) continue;
    closed.add(cur.i);

    if (cur.x === goal.x && cur.y === goal.y) {
      const out: Tile[] = [];
      let i: number | undefined = cur.i;
      while (i !== undefined && i !== idx(start.x, start.y)) {
        out.push({ x: i % width, y: Math.floor(i / width) });
        i = parent.get(i);
      }
      return out.reverse();
    }

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!inside(nx, ny) || !passable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!passable(cur.x + dx, cur.y) || !passable(cur.x, cur.y + dy))) continue;
      const ni = idx(nx, ny);
      if (closed.has(ni)) continue;
      const ng = (g.get(cur.i) ?? 0) + (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1);
      if (ng < (g.get(ni) ?? Infinity)) {
        g.set(ni, ng);
        parent.set(ni, cur.i);
        const h = octile(nx, ny);
        open.push({ i: ni, x: nx, y: ny, f: ng + h, h });
      }
    }
  }
  return null;
}
