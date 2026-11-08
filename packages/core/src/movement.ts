/**
 * Axis-separated AABB movement with sliding (T1.2). The player is a square hitbox of half-size
 * `r`. Per-tick displacement is always far below one tile (max speed 5 tiles/s at 30 ticks/s),
 * so checking only the destination tiles per axis cannot tunnel through a wall.
 */
const EPS = 1e-6;

export type SolidFn = (tx: number, ty: number) => boolean;

export interface Pos {
  x: number;
  y: number;
}

function boxHitsSolid(x: number, y: number, r: number, solid: SolidFn): boolean {
  const x0 = Math.floor(x - r);
  const x1 = Math.floor(x + r - EPS);
  const y0 = Math.floor(y - r);
  const y1 = Math.floor(y + r - EPS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solid(tx, ty)) return true;
  return false;
}

export function moveWithCollision(pos: Pos, dx: number, dy: number, r: number, solid: SolidFn): Pos {
  let { x, y } = pos;

  if (dx !== 0) {
    const nx = x + dx;
    if (!boxHitsSolid(nx, y, r, solid)) {
      x = nx;
    } else {
      // Snap flush against the first blocking tile edge in the direction of travel.
      x = dx > 0 ? Math.floor(nx + r - EPS) - r - EPS : Math.floor(nx - r) + 1 + r + EPS;
      if (boxHitsSolid(x, y, r, solid) || Math.sign(x - pos.x) !== Math.sign(dx)) x = pos.x;
    }
  }
  if (dy !== 0) {
    const ny = y + dy;
    if (!boxHitsSolid(x, ny, r, solid)) {
      y = ny;
    } else {
      y = dy > 0 ? Math.floor(ny + r - EPS) - r - EPS : Math.floor(ny - r) + 1 + r + EPS;
      if (boxHitsSolid(x, y, r, solid) || Math.sign(y - pos.y) !== Math.sign(dy)) y = pos.y;
    }
  }
  return { x, y };
}

/** True if the player's hitbox overlaps the given tile (used to stop doors closing on the player). */
export function overlapsTile(pos: Pos, r: number, tx: number, ty: number): boolean {
  return pos.x + r > tx && pos.x - r < tx + 1 && pos.y + r > ty && pos.y - r < ty + 1;
}
