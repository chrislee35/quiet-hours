import type { Ctx } from "./ctx.ts";
import { findPath } from "./pathfind.ts";
import { HALF_TILE } from "./world.ts";
/** Anything that walks paths: robots, maintenance units, people. */
export interface Walker {
  x: number;
  y: number;
  facing: number;
  path: { x: number; y: number }[];
  pathGoal: { x: number; y: number } | null;
}

/** Path following shared by every robot that walks (patrols, hunters, maintenance units). */
const ARRIVE_EPS = 1e-6;
/** A robot within this many tiles of its post counts as being at it. */
export const AT_POST_DISTANCE = 0.05;

export type Progress = "moving" | "arrived" | "blocked";

export function passableForRobot(ctx: Ctx) {
  const { world, state } = ctx;
  return (tx: number, ty: number): boolean => {
    if (world.width === 0) return true;
    if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) return false;
    if (world.wall[ty * world.width + tx]) return false;
    const door = world.doorByTile.get(ty * world.width + tx);
    return door === undefined || state.doors[door.id]?.open === true || state.doors[door.id]?.locked === false;
  };
}

/** Walk toward (gx, gy), planning an A* path when the goal changes. */
export function goTo(ctx: Ctx, robot: Walker, gx: number, gy: number, speed: number): Progress {
  const { world, state, config, events } = ctx;
  const passable = passableForRobot(ctx);
  const goal = { x: Math.floor(gx), y: Math.floor(gy) };

  // Re-plan if the goal moved, or the next step has been blocked since planning (door locked).
  const next0 = robot.path[0];
  const stale =
    robot.pathGoal === null ||
    robot.pathGoal.x !== goal.x ||
    robot.pathGoal.y !== goal.y ||
    (next0 !== undefined && !passable(Math.floor(next0.x), Math.floor(next0.y)));
  if (stale) {
    robot.pathGoal = goal;
    if (world.width === 0) {
      robot.path = [{ x: gx, y: gy }];
    } else {
      const tiles = findPath(world.width, world.height, { x: Math.floor(robot.x), y: Math.floor(robot.y) }, goal, passable);
      if (tiles === null) {
        robot.path = [];
        return "blocked";
      }
      robot.path = tiles.map((t) => ({ x: t.x + HALF_TILE, y: t.y + HALF_TILE }));
      // Finish at the exact target rather than the centre of its tile.
      robot.path.push({ x: gx, y: gy });
    }
  }

  const dt = 1 / config.sim.ticksPerSecond;
  const next = robot.path[0];
  if (next === undefined) return "arrived";

  // Open a closed (unlocked) door that the next step enters.
  if (world.width > 0) {
    const door = world.doorByTile.get(Math.floor(next.y) * world.width + Math.floor(next.x));
    const ds = door && state.doors[door.id];
    if (door && ds && !ds.open && !ds.locked) {
      ds.open = true;
      events.push({ type: "DoorOpened", tick: state.tick, doorId: door.id });
    }
  }

  const dx = next.x - robot.x;
  const dy = next.y - robot.y;
  const d = Math.hypot(dx, dy);
  const step = speed * dt;
  if (d > ARRIVE_EPS) robot.facing = Math.atan2(dy, dx);
  if (d <= step) {
    robot.x = next.x;
    robot.y = next.y;
    robot.path.shift();
  } else {
    robot.x += (dx / d) * step;
    robot.y += (dy / d) * step;
  }
  return robot.path.length === 0 ? "arrived" : "moving";
}

