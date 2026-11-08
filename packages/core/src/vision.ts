/**
 * Line of sight and view cones (T1.3). Pure geometry over a `blocked(tx, ty)` predicate, so the same
 * code serves robots (vision) and hearing occlusion.
 */
export type BlockedFn = (tx: number, ty: number) => boolean;

/**
 * Grid traversal (Amanatides & Woo) from a to b. The start tile never blocks. When the ray passes
 * exactly through a tile corner it is blocked if either neighbouring tile is, so sight cannot slip
 * diagonally between two walls.
 */
export function lineOfSight(ax: number, ay: number, bx: number, by: number, blocked: BlockedFn): boolean {
  let tx = Math.floor(ax);
  let ty = Math.floor(ay);
  const ex = Math.floor(bx);
  const ey = Math.floor(by);
  const dx = bx - ax;
  const dy = by - ay;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = dx > 0 ? (tx + 1 - ax) / dx : dx < 0 ? (ax - tx) / -dx : Infinity;
  let tMaxY = dy > 0 ? (ty + 1 - ay) / dy : dy < 0 ? (ay - ty) / -dy : Infinity;

  let guard = Math.abs(ex - tx) + Math.abs(ey - ty) + 4;
  while ((tx !== ex || ty !== ey) && guard-- > 0) {
    if (tMaxX < tMaxY) {
      tx += stepX;
      tMaxX += tDeltaX;
    } else if (tMaxY < tMaxX) {
      ty += stepY;
      tMaxY += tDeltaY;
    } else {
      if (blocked(tx + stepX, ty) || blocked(tx, ty + stepY)) return false;
      tx += stepX;
      ty += stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    }
    if (blocked(tx, ty)) return false;
  }
  return true;
}

export interface Viewer {
  x: number;
  y: number;
  /** Radians; 0 faces +x (east), pi/2 faces +y (south). */
  facing: number;
}

/** Smallest absolute difference between two angles, in [0, pi]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

/** True if `target` is inside the viewer's cone, within range, and not occluded. */
export function canSee(
  viewer: Viewer,
  target: { x: number; y: number },
  coneDegrees: number,
  rangeTiles: number,
  blocked: BlockedFn,
): boolean {
  const dist = Math.hypot(target.x - viewer.x, target.y - viewer.y);
  if (dist > rangeTiles) return false;
  if (dist > 1e-6) {
    const bearing = Math.atan2(target.y - viewer.y, target.x - viewer.x);
    if (angleDiff(bearing, viewer.facing) > (coneDegrees * Math.PI) / 360) return false;
  }
  return lineOfSight(viewer.x, viewer.y, target.x, target.y, blocked);
}
