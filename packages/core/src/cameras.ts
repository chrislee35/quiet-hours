import { gameTimeAt } from "./clock.ts";
import { broadcastAlert } from "./comms.ts";
import type { Ctx } from "./ctx.ts";
import { secondsToTicks } from "./ctx.ts";
import { recordInfraction } from "./demerits.ts";
import { scanFor } from "./augments.ts";
import { curfewExempt } from "./identity.ts";
import { canSee, degToRad } from "./vision.ts";
import { isSolid, zoneAt } from "./world.ts";

/**
 * Fixed cameras (T2.2). A camera sweeps its view, runs the same ID check as a robot, builds suspicion the same
 * way, and when it identifies the player it raises the alert and alerts robots in range. It cannot move or be
 * heard. A disabled (broken) camera sees nothing until a maintenance robot repairs it.
 */
export function cameraSystem(ctx: Ctx): void {
  const { state, config, world, events } = ctx;
  if (state.cameras.length === 0) return;
  const cfg = config.cameras;
  const vis = config.vision;
  const dt = 1 / config.sim.ticksPerSecond;
  const t = state.tick / config.sim.ticksPerSecond;
  const player = state.player;
  const blocked = (tx: number, ty: number) => isSolid(world, state.doors, tx, ty);
  const zone = zoneAt(world, Math.floor(player.x), Math.floor(player.y));

  for (const cam of state.cameras) {
    if (cam.broken || cam.dormant) continue;
    if (state.tick < cam.jammedUntil) {
      cam.sees = false;
      cam.suspicion = 0;
      continue;
    }
    const sweep = degToRad(cfg.sweepDegrees);
    cam.heading = cam.facing + (sweep > 0 ? Math.sin((t * 2 * Math.PI) / cfg.sweepSeconds) * sweep : 0);
    cam.sees = canSee({ x: cam.x, y: cam.y, facing: cam.heading }, player, cfg.coneDegrees, cfg.rangeTiles, blocked);
    if (!cam.sees) {
      cam.suspicion = Math.max(0, cam.suspicion - vis.suspicionDecayPerSecond * dt);
      continue;
    }
    const scan = scanFor(ctx, zone);
    // Cameras witness infractions like robots do; only people with a record can earn them.
    if (state.passes.length > 0) {
      if ((scan.outcome === "Violation" || scan.outcome === "Expired") && zone && zone.requiredPermission > 0) {
        recordInfraction(state, config, events, "restricted_zone");
      }
      if (zone?.curfew && gameTimeAt(state.tick, config).isCurfew && !curfewExempt(state)) {
        recordInfraction(state, config, events, "curfew");
      }
    }
    const id = config.identity;
    const idFactor = scan.outcome === "Allowed" ? id.allowedGainFactor : scan.outcome === "Null" ? id.nullGainFactor : id.violationGainFactor;
    const dist = Math.hypot(player.x - cam.x, player.y - cam.y);
    const proximity = 1 - vis.proximityFalloff * Math.min(1, dist / cfg.rangeTiles);
    const stance = player.intent.mode === "sneak" ? vis.sneakGainFactor : 1;
    cam.suspicion = Math.min(1, cam.suspicion + vis.suspicionGainPerSecond * proximity * stance * idFactor * cfg.gainFactor * dt);
    if (cam.suspicion >= 1 && state.tick >= cam.quietUntil) {
      cam.suspicion = 0;
      cam.quietUntil = state.tick + secondsToTicks(cfg.cooldownSeconds, config);
      events.push({ type: "CameraSpotted", tick: state.tick, cameraId: cam.id });
      broadcastAlert(ctx, cam.id, { x: cam.x, y: cam.y }, { x: player.x, y: player.y });
    }
  }
}
