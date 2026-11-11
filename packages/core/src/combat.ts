/**
 * Non-lethal tools and optional combat (T2.6, CMB-1..3). Everything here is an *item with a tool spec*; the
 * `UseItem` command does it. Avoiding is always cheaper than fighting:
 *   decoy    throw a noise-maker: robots near the landing spot go to look. No fight, no alert. Consumed.
 *   cutters  disable a camera in reach (the city will send a mender). Quiet. Reusable.
 *   stun     knock the nearest robot in reach offline for a while. A fight (below). Consumed.
 *   lethal   destroy a robot. Rare, very loud, and recorded in the flag `lethal_force_used`. A fight. Consumed.
 * A fight always: raises the alert (Hunting; Lockdown for lethal force), makes the victim call for help, costs the
 * tool itself and a share of the credits carried (lost in the scuffle), and puts an assault on the record of
 * anyone who has one. No critical path ever needs one (CMB-4, checked by the solvability checker later).
 */
import { broadcastAlert } from "./comms.ts";
import { secondsToTicks, type Ctx } from "./ctx.ts";
import type { AlertLevel } from "./events.ts";
import { recordInfraction } from "./demerits.ts";
import { applyEffects } from "./rules.ts";
import type { RobotState } from "./state.ts";
import { lineOfSight } from "./vision.ts";
import { isSolid } from "./world.ts";

/** How far a thrown object advances per step when finding where it lands (a quarter tile). */
const THROW_STEP = 0.25;

export type ToolKind = "stun" | "decoy" | "cutters" | "lethal";

export interface ToolSpec {
  kind: ToolKind;
  /** How far the tool reaches, in tiles (for a decoy: how far it is thrown). */
  rangeTiles: number;
  /** Stun: seconds the target stays offline. */
  seconds?: number;
  /** Decoy and lethal: the noise it makes where it lands / is fired. */
  noiseRadius?: number;
  /** Used up when used. */
  consumed: boolean;
}

export const TOOL_KINDS: readonly ToolKind[] = ["stun", "decoy", "cutters", "lethal"];

/** A robot destroyed by lethal force is out for good. */
export const isOut = (r: RobotState, tick: number): boolean => r.destroyed || tick < r.jammedUntil;

function nearestRobot(ctx: Ctx, range: number): RobotState | null {
  const { state, world } = ctx;
  const p = state.player;
  const blocked = (tx: number, ty: number) => isSolid(world, state.doors, tx, ty);
  let best: RobotState | null = null;
  let bestD = Infinity;
  for (const r of state.robots) {
    if (r.destroyed || r.dormant) continue;
    const d = Math.hypot(r.x - p.x, r.y - p.y);
    if (d <= range && d < bestD && lineOfSight(p.x, p.y, r.x, r.y, blocked)) {
      best = r;
      bestD = d;
    }
  }
  return best;
}

/** The point a thrown object lands: out along the aim direction, stopping short of a wall. */
function landingPoint(ctx: Ctx, dx: number, dy: number, range: number): { x: number; y: number } {
  const { state, world } = ctx;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx === 0 && dy === 0 ? 1 : dx / len;
  const uy = dx === 0 && dy === 0 ? 0 : dy / len;
  let x = state.player.x;
  let y = state.player.y;
  for (let d = THROW_STEP; d <= range; d += THROW_STEP) {
    const nx = state.player.x + ux * d;
    const ny = state.player.y + uy * d;
    if (isSolid(world, state.doors, Math.floor(nx), Math.floor(ny))) break;
    x = nx;
    y = ny;
  }
  return { x, y };
}

/** What a fight costs, whatever the weapon. */
function fightConsequences(ctx: Ctx, victim: RobotState, level: number): void {
  const { state, config, events } = ctx;
  const before = state.alert.level;
  if (before < level) {
    state.alert.level = level as AlertLevel;
    events.push({ type: "AlertChanged", tick: state.tick, from: before, to: level as AlertLevel });
  }
  state.alert.quietSince = state.tick;
  state.alert.lastRaise = state.tick;
  const lost = Math.floor(state.inventory.credits * config.combat.creditLossFraction);
  if (lost > 0) applyEffects([{ add_credits: -lost }], state, events, config);
  if (state.passes.length > 0) recordInfraction(state, config, events, "assault");
  // The victim cries out before it goes quiet: the robots near it are told where the player is.
  broadcastAlert(ctx, victim.id, { x: victim.x, y: victim.y }, { x: state.player.x, y: state.player.y });
  events.push({ type: "FightConsequences", tick: state.tick, creditsLost: lost, alert: state.alert.level });
}

export function useItem(ctx: Ctx, itemId: string, dx: number, dy: number): void {
  const { state, content, config, events } = ctx;
  const tick = state.tick;
  const spec = content.items[itemId]?.tool;
  const refuse = (reason: "not_a_tool" | "none_left" | "no_target"): void => {
    events.push({ type: "ToolRefused", tick, itemId, reason });
  };
  if (!spec) return refuse("not_a_tool");
  if ((state.inventory.items[itemId] ?? 0) < 1) return refuse("none_left");
  const p = state.player;

  // Work out the target first, so a tool with nothing to act on is never wasted.
  let robot: RobotState | null = null;
  let camera = null as (typeof state.cameras)[number] | null;
  let landing = { x: p.x, y: p.y };
  if (spec.kind === "stun" || spec.kind === "lethal") {
    robot = nearestRobot(ctx, spec.rangeTiles);
    if (!robot) return refuse("no_target");
  } else if (spec.kind === "cutters") {
    camera = state.cameras.filter((c) => !c.broken && Math.hypot(c.x - p.x, c.y - p.y) <= spec.rangeTiles).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0] ?? null;
    if (!camera) return refuse("no_target");
  } else {
    landing = landingPoint(ctx, dx, dy, spec.rangeTiles);
  }

  if (spec.consumed) applyEffects([{ remove_item: [itemId, 1] }], state, events, config);
  events.push({ type: "ToolUsed", tick, itemId, kind: spec.kind });

  switch (spec.kind) {
    case "decoy":
      events.push({ type: "NoiseEmitted", tick, x: landing.x, y: landing.y, radius: spec.noiseRadius ?? config.combat.defaultDecoyNoise, source: "decoy" });
      break;
    case "cutters":
      applyEffects([{ disable_camera: camera!.id }], state, events, config);
      break;
    case "stun":
      robot!.jammedUntil = tick + secondsToTicks(spec.seconds ?? config.combat.defaultStunSeconds, config);
      robot!.suspicion = 0;
      robot!.sees = false;
      events.push({ type: "RobotStunned", tick, robotId: robot!.id });
      fightConsequences(ctx, robot!, config.combat.fightAlert);
      break;
    case "lethal":
      robot!.destroyed = true;
      robot!.sees = false;
      robot!.suspicion = 0;
      state.flags.lethal_force_used = true;
      state.flags.robots_destroyed = (typeof state.flags.robots_destroyed === "number" ? state.flags.robots_destroyed : 0) + 1;
      events.push({ type: "NoiseEmitted", tick, x: p.x, y: p.y, radius: spec.noiseRadius ?? config.combat.defaultLethalNoise, source: "weapon" });
      events.push({ type: "RobotDestroyed", tick, robotId: robot!.id });
      events.push({ type: "FlagSet", tick, flag: "lethal_force_used", value: true });
      fightConsequences(ctx, robot!, config.combat.lethalAlert);
      break;
  }
}
