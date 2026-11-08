import type { Ctx } from "./ctx.ts";
import { secondsToTicks } from "./ctx.ts";
import { findPath } from "./pathfind.ts";
import type { RobotState } from "./state.ts";
import { canSee, lineOfSight } from "./vision.ts";
import { isSolid } from "./world.ts";

/**
 * Warden behaviour (T1.3, T1.4). Two systems run in order each tick:
 *   robotPerception: see/hear, update suspicion, decide to investigate or chase.
 *   robotBehavior:   patrol / investigate / chase / search, with pathfinding and door use.
 * Robots follow A* paths through tile centres (no hitbox collision); closed unlocked doors are
 * opened as they go, locked doors count as walls.
 */

const ARRIVE_EPS = 1e-6;

function passableForRobot(ctx: Ctx) {
  const { world, state } = ctx;
  return (tx: number, ty: number): boolean => {
    if (world.width === 0) return true;
    if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) return false;
    if (world.wall[ty * world.width + tx]) return false;
    const door = world.doorByTile.get(ty * world.width + tx);
    return door === undefined || state.doors[door.id]?.open === true || state.doors[door.id]?.locked === false;
  };
}

// ---- Perception ------------------------------------------------------------------------

export function robotPerception(ctx: Ctx): void {
  const { state, config, world, events } = ctx;
  const blocked = (tx: number, ty: number) => isSolid(world, state.doors, tx, ty);
  const dt = 1 / config.sim.ticksPerSecond;
  const vis = config.vision;
  const player = state.player;
  const noises = events.filter((e) => e.type === "NoiseEmitted" && e.tick === state.tick);

  for (const robot of state.robots) {
    const dist = Math.hypot(player.x - robot.x, player.y - robot.y);
    robot.sees = canSee(robot, player, vis.coneDegrees, vis.rangeTiles, blocked);

    if (robot.sees) {
      const proximity = 1 - vis.proximityFalloff * Math.min(1, dist / vis.rangeTiles);
      robot.suspicion = Math.min(1, robot.suspicion + vis.suspicionGainPerSecond * proximity * dt);
    } else {
      robot.suspicion = Math.max(0, robot.suspicion - vis.suspicionDecayPerSecond * dt);
    }

    if (robot.suspicion >= 1 && robot.mode !== "chase") {
      robot.mode = "chase";
      robot.target = { x: player.x, y: player.y };
      robot.path = [];
      robot.pathGoal = null;
      robot.arrived = false;
      robot.dwell = 0;
      events.push({ type: "RobotSpotted", tick: state.tick, robotId: robot.id });
    }
    if (robot.mode === "chase" && robot.sees) robot.target = { x: player.x, y: player.y };

    // Hearing: footsteps within range draw a non-pursuing robot to investigate. Walls muffle sound.
    if (robot.mode !== "chase") {
      for (const n of noises) {
        if (n.type !== "NoiseEmitted") continue;
        const clear = lineOfSight(robot.x, robot.y, n.x, n.y, blocked);
        const radius = n.radius * (clear ? 1 : config.noise.occludedFactor);
        if (Math.hypot(n.x - robot.x, n.y - robot.y) <= radius) {
          // Announce only when this is news: a new investigation, or the noise moved to a new tile.
          const news =
            robot.mode !== "investigate" ||
            robot.target === null ||
            Math.floor(robot.target.x) !== Math.floor(n.x) ||
            Math.floor(robot.target.y) !== Math.floor(n.y);
          robot.mode = "investigate";
          robot.target = { x: n.x, y: n.y };
          robot.arrived = false;
          robot.dwell = 0;
          if (news) events.push({ type: "RobotInvestigating", tick: state.tick, robotId: robot.id, x: n.x, y: n.y });
        }
      }
    }
  }
}

// ---- Behaviour -------------------------------------------------------------------------

type Progress = "moving" | "arrived" | "blocked";

/** Walk toward (gx, gy), planning an A* path when the goal changes. */
function goTo(ctx: Ctx, robot: RobotState, gx: number, gy: number, speed: number): Progress {
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
      robot.path = tiles.map((t) => ({ x: t.x + 0.5, y: t.y + 0.5 }));
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

function beginLookAround(robot: RobotState, ticks: number): void {
  robot.arrived = true;
  robot.dwellTotal = ticks;
  robot.dwell = ticks;
  robot.lookBase = robot.facing;
}

function resumePatrol(robot: RobotState): void {
  robot.mode = "patrol";
  robot.target = null;
  robot.path = [];
  robot.pathGoal = null;
  robot.arrived = false;
  robot.dwell = 0;
}

/** Sweep the facing slowly left and right around where the robot was looking (about +/-63 degrees). */
function lookAround(ctx: Ctx, robot: RobotState): void {
  const elapsed = (robot.dwellTotal - robot.dwell) / ctx.config.sim.ticksPerSecond;
  robot.facing = robot.lookBase + Math.sin((elapsed * 2 * Math.PI) / 4) * 1.1;
}

export function robotBehavior(ctx: Ctx): void {
  const { state, config, world, events } = ctx;
  const w = config.warden;
  for (const robot of state.robots) {
    switch (robot.mode) {
      case "patrol": {
        const route = robot.route ? world.routeById.get(robot.route) : undefined;
        if (!route || route.points.length === 0) break; // stands guard
        if (robot.dwell > 0) {
          robot.dwell--;
          break;
        }
        const pt = route.points[robot.routeIndex % route.points.length]!;
        const result = goTo(ctx, robot, pt.x, pt.y, w.patrolSpeed);
        if (result !== "moving") {
          // Arrived, or the waypoint is unreachable right now: pause, then move on to the next one.
          robot.routeIndex = (robot.routeIndex + 1) % route.points.length;
          robot.path = [];
          robot.pathGoal = null;
          robot.dwell = secondsToTicks(w.waypointPauseSeconds, config);
        }
        break;
      }
      case "investigate":
      case "search": {
        if (!robot.arrived) {
          const t = robot.target;
          if (!t) {
            resumePatrol(robot);
            break;
          }
          const result = goTo(ctx, robot, t.x, t.y, w.patrolSpeed * 1.4);
          if (result !== "moving") {
            beginLookAround(robot, secondsToTicks(robot.mode === "search" ? w.searchSeconds : w.investigateSeconds, config));
          }
        } else if (robot.dwell > 0) {
          robot.dwell--;
          lookAround(ctx, robot);
        } else {
          resumePatrol(robot);
        }
        break;
      }
      case "chase": {
        const p = state.player;
        const dist = Math.hypot(p.x - robot.x, p.y - robot.y);
        const blocked = (tx: number, ty: number) => isSolid(world, state.doors, tx, ty);
        if (dist <= w.catchRadius && lineOfSight(robot.x, robot.y, p.x, p.y, blocked)) {
          events.push({ type: "PlayerCaught", tick: state.tick, robotId: robot.id });
          robot.suspicion = 0; // the catch is resolved; do not instantly re-identify the same player
          robot.mode = "search";
          robot.path = [];
          robot.pathGoal = null;
          beginLookAround(robot, secondsToTicks(w.searchSeconds, config));
          break;
        }
        const t = robot.target ?? { x: p.x, y: p.y };
        const result = goTo(ctx, robot, t.x, t.y, w.chaseSpeed);
        if (result !== "moving" && !robot.sees) {
          // Reached the last known position (or cannot get there) and the player is not in view.
          events.push({ type: "RobotLostTrack", tick: state.tick, robotId: robot.id });
          robot.mode = "search";
          robot.path = [];
          robot.pathGoal = null;
          beginLookAround(robot, secondsToTicks(w.searchSeconds, config));
        }
        break;
      }
    }
  }
}
