import type { Ctx } from "./ctx.ts";
import { secondsToTicks } from "./ctx.ts";
import { goTo, passableForRobot } from "./nav.ts";
import { overlapsTile } from "./movement.ts";
import type { RobotState } from "./state.ts";

/**
 * The city fixes what it can see is wrong (T2.2, ROB-5, WLD-3): a disabled camera is repaired, and a door that
 * began locked and was unlocked is locked again, after a delay. Maintenance robots ("menders") do the work:
 * they do not detect the player, they just go where they are sent. The player can use the delay (move fast)
 * or interfere (a mender will not close a door someone is standing in).
 */

function cameraSpot(ctx: Ctx, x: number, y: number): { x: number; y: number } | null {
  // Cameras are often mounted in walls: stand on the nearest walkable tile.
  const passable = passableForRobot(ctx);
  let best: { x: number; y: number; d: number } | null = null;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const tx = Math.floor(x) + dx;
      const ty = Math.floor(y) + dy;
      if (!passable(tx, ty)) continue;
      const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
      if (best === null || d < best.d) best = { x: tx + 0.5, y: ty + 0.5, d };
    }
  }
  return best;
}

function doorSpot(ctx: Ctx, tx: number, ty: number): { x: number; y: number } | null {
  const passable = passableForRobot(ctx);
  const doorTile = (x: number, y: number) => x === tx && y === ty;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    if (passable(tx + dx, ty + dy) && !doorTile(tx + dx, ty + dy)) return { x: tx + dx + 0.5, y: ty + dy + 0.5 };
  }
  return null;
}

/** Hands waiting jobs to the nearest idle maintenance robot. */
export function repairSystem(ctx: Ctx): void {
  const { state, config, world, events } = ctx;
  const idle = state.robots.filter((r) => r.kind === "mender" && r.task === null);
  if (idle.length === 0) return;
  const cameraDelay = secondsToTicks(config.repairs.cameraDelaySeconds, config);
  const relockDelay = secondsToTicks(config.repairs.relockDelaySeconds, config);

  const jobs: { kind: "camera" | "door"; id: string; x: number; y: number }[] = [];
  for (const cam of state.cameras) {
    if (cam.broken && !cam.claimed && state.tick - cam.brokenAt >= cameraDelay) jobs.push({ kind: "camera", id: cam.id, x: cam.x, y: cam.y });
  }
  for (const def of world.doors) {
    const d = state.doors[def.id];
    const claimed = state.robots.some((r) => r.task?.kind === "door" && r.task.targetId === def.id);
    if (def.locked && d && !d.locked && d.unlockedAt !== undefined && !claimed && state.tick - d.unlockedAt >= relockDelay) {
      jobs.push({ kind: "door", id: def.id, x: def.x + 0.5, y: def.y + 0.5 });
    }
  }

  for (const job of jobs) {
    if (idle.length === 0) break;
    let bestIndex = 0;
    let bestD = Infinity;
    idle.forEach((r, i) => {
      const d = Math.hypot(r.x - job.x, r.y - job.y);
      if (d < bestD) {
        bestD = d;
        bestIndex = i;
      }
    });
    const robot = idle.splice(bestIndex, 1)[0]!;
    robot.task = { kind: job.kind, targetId: job.id, workLeft: -1 };
    if (job.kind === "camera") state.cameras.find((c) => c.id === job.id)!.claimed = true;
    events.push({ type: "RepairAssigned", tick: state.tick, robotId: robot.id, task: job.kind, targetId: job.id });
  }
}

/** One tick of a maintenance robot: travel to the job, work on it, then return to its post. */
export function menderStep(ctx: Ctx, robot: RobotState): void {
  const { state, config, world, events } = ctx;
  const speed = config.robots.mender.patrolSpeed;
  const task = robot.task;

  if (!task) {
    if (Math.hypot(robot.x - robot.home.x, robot.y - robot.home.y) > 0.05) {
      if (goTo(ctx, robot, robot.home.x, robot.home.y, speed) !== "moving") {
        robot.x = robot.home.x;
        robot.y = robot.home.y;
        robot.path = [];
        robot.pathGoal = null;
      }
    } else {
      robot.facing = robot.home.facing;
    }
    return;
  }

  // An unreachable job is released and retried after the normal delay, not every tick.
  const giveUp = () => {
    if (task.kind === "camera") {
      const cam = state.cameras.find((c) => c.id === task.targetId);
      if (cam) {
        cam.claimed = false;
        cam.brokenAt = state.tick;
      }
    } else {
      const door = state.doors[task.targetId];
      if (door && door.unlockedAt !== undefined) door.unlockedAt = state.tick;
    }
    robot.task = null;
    robot.path = [];
    robot.pathGoal = null;
  };

  if (task.workLeft < 0) {
    const spot =
      task.kind === "camera"
        ? (() => {
            const cam = state.cameras.find((c) => c.id === task.targetId);
            return cam ? cameraSpot(ctx, cam.x, cam.y) : null;
          })()
        : (() => {
            const def = world.doors.find((d) => d.id === task.targetId);
            return def ? doorSpot(ctx, def.x, def.y) : null;
          })();
    if (!spot) return giveUp();
    const result = goTo(ctx, robot, spot.x, spot.y, speed);
    if (result === "blocked") return giveUp();
    if (result === "arrived") task.workLeft = secondsToTicks(config.repairs.repairSeconds, config);
    return;
  }

  if (task.workLeft > 1) {
    task.workLeft -= 1;
    return;
  }

  // Finish the job.
  if (task.kind === "camera") {
    const cam = state.cameras.find((c) => c.id === task.targetId);
    if (cam) {
      cam.broken = false;
      cam.claimed = false;
      cam.suspicion = 0;
      events.push({ type: "CameraRepaired", tick: state.tick, cameraId: cam.id });
    }
    robot.task = null;
    return;
  }
  const def = world.doors.find((d) => d.id === task.targetId);
  const door = def && state.doors[def.id];
  if (!def || !door) return giveUp();
  // Wait while someone is standing in the doorway.
  if (overlapsTile(state.player, config.player.radius, def.x, def.y)) return;
  door.open = false;
  door.locked = true;
  delete door.unlockedAt;
  events.push({ type: "DoorRelocked", tick: state.tick, doorId: def.id });
  robot.task = null;
}
