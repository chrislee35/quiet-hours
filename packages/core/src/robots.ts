import type { Config, RobotProfile } from "./config.ts";
import type { Ctx } from "./ctx.ts";
import { secondsToTicks } from "./ctx.ts";
import { recordInfraction } from "./demerits.ts";
import { gameTimeAt } from "./clock.ts";
import type { GameEvent } from "./events.ts";
import { consumePass, curfewExempt, resolvePass, type ScanResult } from "./identity.ts";
import { findPath } from "./pathfind.ts";
import { Rng } from "./rng.ts";
import type { RobotState, SimState } from "./state.ts";
import { canSee, lineOfSight } from "./vision.ts";
import { isSolid, zoneAt, type ZoneDef } from "./world.ts";

/**
 * Robot behaviour (T1.3, T1.4, T2.1). Two systems run in order each tick:
 *   robotPerception: see/hear, ID checks, suspicion, and the per-type specials (Checker review, Auditor audit,
 *                    Hound dispatch); decides to investigate, chase or raise the alarm.
 *   robotBehavior:   patrol / investigate / chase / search / alert, with pathfinding and door use.
 * Each type is a *profile* in config (`robots.<kind>`) plus a few special cases below:
 *   warden   patrols, checks IDs, chases.        sentry   fixed post, sweeping view, cannot chase.
 *   checker  short range zone compliance: stalls on a null (pending review), cannot chase.
 *   hound    dispatched at high alert, fast, hears well.   auditor  thorough scans and random audits.
 *   heavy    wide view, slow, hard to escape on foot, catches from further away.
 * Robots follow A* paths through tile centres; closed unlocked doors are opened as they go; locked doors are walls.
 */

const ARRIVE_EPS = 1e-6;

const profile = (config: Config, robot: RobotState): RobotProfile => config.robots[robot.kind];

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

/** Infractions any robot can witness: only people with a record can earn them (the null has none). */
function witnessInfractions(state: SimState, config: Config, events: GameEvent[], zone: ZoneDef | null, scan: ScanResult): void {
  if (state.passes.length === 0) return;
  if ((scan.outcome === "Violation" || scan.outcome === "Expired") && zone && zone.requiredPermission > 0) {
    recordInfraction(state, config, events, "restricted_zone");
  }
  if (zone?.curfew && gameTimeAt(state.tick, config).isCurfew && !curfewExempt(state)) {
    recordInfraction(state, config, events, "curfew");
  }
}

function idFactor(config: Config, outcome: ScanResult["outcome"]): number {
  const id = config.identity;
  return outcome === "Allowed" ? id.allowedGainFactor : outcome === "Null" ? id.nullGainFactor : id.violationGainFactor;
}

export function robotPerception(ctx: Ctx): void {
  const { state, config, world, events } = ctx;
  const blocked = (tx: number, ty: number) => isSolid(world, state.doors, tx, ty);
  const dt = 1 / config.sim.ticksPerSecond;
  const vis = config.vision;
  const player = state.player;
  const noises = events.filter((e) => e.type === "NoiseEmitted" && e.tick === state.tick);
  const rng = new Rng(state.rngState);
  const quiet = gameTimeAt(state.tick, config).isQuietHours;
  const zone = zoneAt(world, Math.floor(player.x), Math.floor(player.y));

  for (const robot of state.robots) {
    const prof = profile(config, robot);
    const dist = Math.hypot(player.x - robot.x, player.y - robot.y);
    if (robot.busy > 0) robot.busy -= 1;
    robot.sees = canSee(robot, player, prof.coneDegrees, prof.rangeTiles, blocked);
    robot.unseenTicks = robot.sees ? 0 : robot.unseenTicks + 1;
    if (robot.unseenTicks > secondsToTicks(3, config)) robot.checked = false;

    // Hounds are sent by the alert: once it reaches their dispatch level they hunt to where the player is.
    if (prof.dispatchAlert > 0) {
      if (state.alert.level < prof.dispatchAlert) robot.dispatched = false;
      else if (!robot.dispatched && robot.mode === "patrol") {
        robot.dispatched = true;
        robot.mode = "chase";
        robot.target = { x: player.x, y: player.y };
        robot.path = [];
        robot.pathGoal = null;
        robot.arrived = false;
        events.push({ type: "HoundDispatched", tick: state.tick, robotId: robot.id });
      }
    }

    if (robot.sees) {
      const scan = resolvePass(state, zone, { thorough: prof.thorough });
      witnessInfractions(state, config, events, zone, scan);

      if (robot.kind === "checker") {
        // Zone compliance: a null is "pending review" and stalls the checker, again and again for as long as it
        // stays in view; a record is checked once per stay (and a limited pass is used up).
        if (robot.busy === 0) {
          if (scan.outcome === "Null") {
            robot.busy = secondsToTicks(prof.reviewSeconds, config);
            events.push({ type: "ScanPerformed", tick: state.tick, robotId: robot.id, outcome: "Null" });
          } else if (!robot.checked) {
            robot.checked = true;
            events.push({ type: "ScanPerformed", tick: state.tick, robotId: robot.id, outcome: scan.outcome });
            if (scan.outcome === "Allowed" && scan.passId) consumePass(state, scan.passId);
            else robot.suspicion = 1;
          }
        }
      } else {
        const proximity = 1 - vis.proximityFalloff * Math.min(1, dist / prof.rangeTiles);
        const stance = player.intent.mode === "sneak" ? vis.sneakGainFactor : 1;
        robot.suspicion = Math.min(
          1,
          robot.suspicion + vis.suspicionGainPerSecond * proximity * stance * idFactor(config, scan.outcome) * prof.gainFactor * dt,
        );
      }

      // Auditors: now and then, at close range, a full audit of papers and pockets.
      if (robot.kind === "auditor" && robot.busy === 0 && dist <= prof.checkRangeTiles) {
        const perTick = prof.checkChancePerSecond * (quiet ? prof.quietHoursCheckFactor : 1) * dt;
        if (rng.chance(perTick)) {
          const thorough = resolvePass(state, zone, { thorough: true });
          const contraband = Object.keys(state.inventory.items).some((id) => id.startsWith("contraband_"));
          const failed = contraband || thorough.outcome === "Violation" || thorough.outcome === "Expired";
          robot.busy = secondsToTicks(prof.auditSeconds, config);
          if (failed) {
            robot.suspicion = 1;
            events.push({ type: "AuditFailed", tick: state.tick, robotId: robot.id, reason: contraband ? "contraband" : thorough.reason });
          } else {
            events.push({ type: "AuditPassed", tick: state.tick, robotId: robot.id });
          }
        }
      }
    } else {
      robot.suspicion = Math.max(0, robot.suspicion - vis.suspicionDecayPerSecond * dt);
    }

    if (robot.suspicion >= 1 && robot.mode !== "chase" && robot.mode !== "alert") {
      robot.mode = prof.canChase ? "chase" : "alert";
      robot.target = { x: player.x, y: player.y };
      robot.path = [];
      robot.pathGoal = null;
      robot.arrived = false;
      robot.dwell = secondsToTicks(prof.searchSeconds, config);
      events.push({ type: "RobotSpotted", tick: state.tick, robotId: robot.id });
    }
    if ((robot.mode === "chase" || robot.mode === "alert") && robot.sees) robot.target = { x: player.x, y: player.y };

    // A pursuing robot that tracks sound keeps re-targeting the footsteps it can hear (a Hound follows a runner).
    if (robot.mode === "chase" && prof.tracksNoise) {
      for (const n of noises) {
        if (n.type !== "NoiseEmitted") continue;
        const clear = lineOfSight(robot.x, robot.y, n.x, n.y, blocked);
        const radius = n.radius * prof.hearingFactor * (clear ? 1 : config.noise.occludedFactor);
        if (Math.hypot(n.x - robot.x, n.y - robot.y) <= radius) robot.target = { x: n.x, y: n.y };
      }
    }

    // Hearing: footsteps within range draw a non-pursuing robot to investigate. Walls muffle sound.
    if (robot.mode !== "chase" && robot.mode !== "alert") {
      for (const n of noises) {
        if (n.type !== "NoiseEmitted") continue;
        const clear = lineOfSight(robot.x, robot.y, n.x, n.y, blocked);
        const radius = n.radius * prof.hearingFactor * (clear ? 1 : config.noise.occludedFactor);
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
  state.rngState = rng.state;
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

/** A robot with no route stands at its post, sweeping its view if its type does (Sentry). */
function idleAtPost(ctx: Ctx, robot: RobotState, prof: RobotProfile): void {
  const { state, config } = ctx;
  const home = robot.home;
  if (prof.patrolSpeed > 0 && Math.hypot(robot.x - home.x, robot.y - home.y) > 0.05) {
    if (goTo(ctx, robot, home.x, home.y, prof.patrolSpeed) !== "moving") {
      robot.x = home.x;
      robot.y = home.y;
      robot.path = [];
      robot.pathGoal = null;
    }
    return;
  }
  const sweep = (prof.sweepDegrees * Math.PI) / 180;
  const t = state.tick / config.sim.ticksPerSecond;
  robot.facing = home.facing + (sweep > 0 ? Math.sin((t * 2 * Math.PI) / 8) * sweep : 0);
}

export function robotBehavior(ctx: Ctx): void {
  const { state, config, world, events } = ctx;
  for (const robot of state.robots) {
    const prof = profile(config, robot);
    switch (robot.mode) {
      case "patrol": {
        const route = robot.route ? world.routeById.get(robot.route) : undefined;
        if (!route || route.points.length === 0 || prof.patrolSpeed === 0) {
          idleAtPost(ctx, robot, prof);
          break;
        }
        if (robot.dwell > 0) {
          robot.dwell--;
          break;
        }
        const pt = route.points[robot.routeIndex % route.points.length]!;
        const result = goTo(ctx, robot, pt.x, pt.y, prof.patrolSpeed);
        if (result !== "moving") {
          // Arrived, or the waypoint is unreachable right now: pause, then move on to the next one.
          robot.routeIndex = (robot.routeIndex + 1) % route.points.length;
          robot.path = [];
          robot.pathGoal = null;
          robot.dwell = secondsToTicks(prof.pauseSeconds, config);
        }
        break;
      }
      case "investigate":
      case "search": {
        const ticks = secondsToTicks(robot.mode === "search" ? prof.searchSeconds : prof.investigateSeconds, config);
        if (!robot.arrived) {
          const t = robot.target;
          if (!t) {
            resumePatrol(robot);
            break;
          }
          if (prof.patrolSpeed === 0) {
            // A post-bound robot cannot walk over: it turns to face the disturbance and watches it.
            robot.facing = Math.atan2(t.y - robot.y, t.x - robot.x);
            beginLookAround(robot, ticks);
            break;
          }
          const result = goTo(ctx, robot, t.x, t.y, prof.patrolSpeed * 1.4);
          if (result !== "moving") beginLookAround(robot, ticks);
        } else if (robot.dwell > 0) {
          robot.dwell--;
          lookAround(ctx, robot);
        } else {
          resumePatrol(robot);
        }
        break;
      }
      case "alert": {
        // Cannot chase: face the player while they are in view, keep watching a while after they leave.
        const t = robot.target;
        if (robot.sees && t) robot.facing = Math.atan2(t.y - robot.y, t.x - robot.x);
        if (robot.sees) robot.dwell = secondsToTicks(prof.searchSeconds, config);
        else if (robot.dwell > 0) robot.dwell--;
        else {
          robot.suspicion = 0;
          resumePatrol(robot);
        }
        break;
      }
      case "chase": {
        const p = state.player;
        const dist = Math.hypot(p.x - robot.x, p.y - robot.y);
        const blocked = (tx: number, ty: number) => isSolid(world, state.doors, tx, ty);
        if (dist <= prof.catchRadius && lineOfSight(robot.x, robot.y, p.x, p.y, blocked)) {
          events.push({ type: "PlayerCaught", tick: state.tick, robotId: robot.id });
          robot.suspicion = 0; // the catch is resolved; do not instantly re-identify the same player
          robot.mode = "search";
          robot.path = [];
          robot.pathGoal = null;
          beginLookAround(robot, secondsToTicks(prof.searchSeconds, config));
          break;
        }
        const t = robot.target ?? { x: p.x, y: p.y };
        const result = goTo(ctx, robot, t.x, t.y, prof.chaseSpeed);
        if (result !== "moving" && !robot.sees) {
          // Reached the last known position (or cannot get there) and the player is not in view.
          events.push({ type: "RobotLostTrack", tick: state.tick, robotId: robot.id });
          robot.mode = "search";
          robot.path = [];
          robot.pathGoal = null;
          beginLookAround(robot, secondsToTicks(prof.searchSeconds, config));
        }
        break;
      }
    }
  }
}

