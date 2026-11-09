/**
 * Augments and the wrist band (T2.4, AUG-1..4). The band has a fixed number of slots and a power budget; each
 * augment costs some of both while worn. There are no stats: an augment is a set of *modifiers* (named
 * multipliers such as `noise.mult`) and *tags* (named capabilities such as `reveal_cones`) that systems query by
 * name, plus optional active behaviour (Ghost Tag's spoof window, Burst Jammer's pulse). Nothing in the systems
 * is special-cased on an augment's id.
 */
import { secondsToTicks, type Ctx } from "./ctx.ts";
import { resolvePass, type ScanOptions, type ScanResult } from "./identity.ts";
import type { Content } from "./dialogue/types.ts";
import type { SimState } from "./state.ts";
import type { ZoneDef } from "./world.ts";

export interface AugmentDef {
  id: string;
  name: string;
  description: string;
  slotCost: number;
  /** Power drawn from the band's budget while worn. */
  power: number;
  /** Named multipliers, e.g. { "noise.mult": 0.5 }. Several augments multiply together. */
  modifiers?: Record<string, number>;
  /** Named capabilities other systems and the UI ask about, e.g. "reveal_cones". */
  tags?: string[];
  /** Ghost Tag style: the first scan that would fail starts a window in which every scan reads valid. */
  spoof?: { windowSeconds: number; rechargeSeconds: number };
  /** Burst Jammer style: a pulse that knocks out robots and cameras within range for a while. */
  jam?: { radiusTiles: number; seconds: number; cooldownSeconds: number };
}

export type ItemType = "tool" | "key" | "consumable" | "contraband" | "junk";

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  stackable: boolean;
  tags: string[];
  description: string;
}

export const ITEM_TYPES: readonly ItemType[] = ["tool", "key", "consumable", "contraband", "junk"];

/** Contraband is anything typed so in content (the legacy `contraband_` id prefix still counts). */
export function isContraband(content: Content, itemId: string): boolean {
  return content.items[itemId]?.type === "contraband" || itemId.startsWith("contraband_");
}

export type EquipRefusal = "unknown" | "not_owned" | "already_equipped" | "no_slots" | "no_power";

const def = (content: Content, id: string): AugmentDef | undefined => content.augments[id];

export function slotsUsed(state: Readonly<SimState>, content: Content): number {
  return state.augments.equipped.reduce((n, id) => n + (def(content, id)?.slotCost ?? 0), 0);
}

export function powerUsed(state: Readonly<SimState>, content: Content): number {
  return state.augments.equipped.reduce((n, id) => n + (def(content, id)?.power ?? 0), 0);
}

/** Product of the named modifier over everything worn (1 when nothing changes it). */
export function modifier(state: Readonly<SimState>, content: Content, key: string): number {
  let m = 1;
  for (const id of state.augments.equipped) m *= def(content, id)?.modifiers?.[key] ?? 1;
  return m;
}

/** True when something worn carries this capability tag. */
export function hasTag(state: Readonly<SimState>, content: Content, tag: string): boolean {
  return state.augments.equipped.some((id) => def(content, id)?.tags?.includes(tag) ?? false);
}

/** Would equipping this augment be allowed right now? Null means yes; otherwise the reason. */
export function equipRefusal(state: Readonly<SimState>, content: Content, id: string): EquipRefusal | null {
  const d = def(content, id);
  if (!d) return "unknown";
  if (!state.augments.owned.includes(id)) return "not_owned";
  if (state.augments.equipped.includes(id)) return "already_equipped";
  if (slotsUsed(state, content) + d.slotCost > state.augments.slots) return "no_slots";
  if (powerUsed(state, content) + d.power > state.augments.powerBudget) return "no_power";
  return null;
}

export function equipAugment(ctx: Ctx, id: string): void {
  const { state, content, events } = ctx;
  const why = equipRefusal(state, content, id);
  if (why) {
    events.push({ type: "AugmentRefused", tick: state.tick, augmentId: id, reason: why });
    return;
  }
  state.augments.equipped.push(id);
  events.push({ type: "AugmentEquipped", tick: state.tick, augmentId: id });
}

export function unequipAugment(ctx: Ctx, id: string): void {
  const { state, events } = ctx;
  const i = state.augments.equipped.indexOf(id);
  if (i < 0) return;
  state.augments.equipped.splice(i, 1);
  events.push({ type: "AugmentUnequipped", tick: state.tick, augmentId: id });
}

/** Fires a worn augment's active ability (Burst Jammer). Does nothing if it is not worn or still recharging. */
export function useAugment(ctx: Ctx, id: string): void {
  const { state, content, config, events } = ctx;
  const d = def(content, id);
  if (!d?.jam || !state.augments.equipped.includes(id)) return;
  if (state.tick < state.augments.jamReadyAt) {
    events.push({ type: "AugmentRefused", tick: state.tick, augmentId: id, reason: "recharging" });
    return;
  }
  const until = state.tick + secondsToTicks(d.jam.seconds, config);
  const p = state.player;
  const robots: string[] = [];
  const cameras: string[] = [];
  for (const r of state.robots) {
    if (Math.hypot(r.x - p.x, r.y - p.y) <= d.jam.radiusTiles) {
      r.jammedUntil = until;
      robots.push(r.id);
    }
  }
  for (const c of state.cameras) {
    if (Math.hypot(c.x - p.x, c.y - p.y) <= d.jam.radiusTiles) {
      c.jammedUntil = until;
      cameras.push(c.id);
    }
  }
  state.augments.jamReadyAt = state.tick + secondsToTicks(d.jam.cooldownSeconds, config);
  events.push({ type: "BurstJammerFired", tick: state.tick, augmentId: id, robots, cameras });
}

/**
 * The ID scan every robot and camera uses. Without a spoofing augment it is just the pass resolver. With one
 * (Ghost Tag), the first scan that would not come back valid opens a short window in which every scan reads as a
 * valid record; the tag then recharges.
 */
export function scanFor(ctx: Ctx, zone: ZoneDef | null, opts: ScanOptions = {}): ScanResult {
  const { state, content, config, events } = ctx;
  const scan = resolvePass(state, zone, opts);
  if (scan.outcome === "Allowed") return scan;
  const spoofer = state.augments.equipped.map((id) => def(content, id)).find((d) => d?.spoof);
  if (!spoofer?.spoof) return scan;
  const a = state.augments;
  if (state.tick >= a.spoofUntil && state.tick >= a.spoofReadyAt) {
    a.spoofUntil = state.tick + secondsToTicks(spoofer.spoof.windowSeconds, config);
    a.spoofReadyAt = a.spoofUntil + secondsToTicks(spoofer.spoof.rechargeSeconds, config);
    events.push({ type: "GhostTagSpoofed", tick: state.tick, augmentId: spoofer.id });
  }
  if (state.tick < a.spoofUntil) return { outcome: "Allowed", passId: null, reason: "spoofed" };
  return scan;
}
