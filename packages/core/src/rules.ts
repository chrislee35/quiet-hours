/**
 * The shared condition/effect language (T1.7, DESIGN §4, ADR-3). Dialogue options, services, quests,
 * district reactions and companion gating are all written in it, so authors learn one thing and the
 * solvability checker can analyse it.
 *
 * Both are plain JSON. A condition or effect is an object with exactly one key naming the operation.
 *   conditions are pure: they read state and never change it.
 *   effects are the only way content changes state, and every change emits an event.
 */
import { gameTimeAt, inWindow } from "./clock.ts";
import type { Config } from "./config.ts";
import type { AlertLevel, ClueStatus, FlagValue, GameEvent, TrustLevel } from "./events.ts";
import type { Content } from "./dialogue/types.ts";
import { repayLoan, serviceStatus, takeLoan, totalOwed, useService } from "./economy.ts";
import type { SimState } from "./state.ts";
import { ticksPerGameMinute, type PassOrigin } from "./identity.ts";

// ---- Types -------------------------------------------------------------------------------

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { has_clue: string }
  | { clue_state: [clueId: string, status: ClueStatus] }
  /** Flag is set to a truthy value. */
  | { flag: string }
  | { flag_eq: [flag: string, value: FlagValue] }
  /** An item id (at least 1), or [id, minimum count]. */
  | { has_item: string | [itemId: string, min: number] }
  | { credits_gte: number }
  | { trust_gte: [npc: string, level: TrustLevel] }
  | { alert_gte: AlertLevel }
  /** Minute-of-day window [start, end), which may wrap past midnight. */
  | { time_between: [startMinute: number, endMinute: number] }
  | { arrest_count_gte: number }
  /** The player holds a pass with this id (valid or not: validity is the resolver's business). */
  | { has_pass: string }
  /** The augment is owned. */
  | { has_augment: string }
  /** The augment is owned and currently worn (e.g. Slow Tongue unlocking dialogue options). */
  | { augment_equipped: string }
  /** The service can be used right now (it exists, requirements hold, a record is on file if it needs one, and the player can pay). */
  | { can_service: string }
  /** The player has any identity on file (true) or is in the null state (false). */
  | { has_record: boolean }
  /** The player owes this lender, or "*" for any lender. */
  | { in_debt: string }
  /** Curfew is in force / it is Quiet Hours (02:00-05:00 by default). */
  | { is_curfew: boolean }
  | { is_quiet_hours: boolean }
  /** A district value equals this. */
  | { district_is: [district: string, key: string, value: FlagValue] }
  | { metric_gte: [metric: "order" | "power" | "contentment", value: number] }
  | { metric_lte: [metric: "order" | "power" | "contentment", value: number] };

export type Effect =
  | { give_clue: { id: string; from: string } }
  | { verify_clue: string }
  | { disprove_clue: string }
  | { set_flag: [flag: string, value: FlagValue] }
  | { add_item: [itemId: string, count: number] }
  | { remove_item: [itemId: string, count: number] }
  | { add_credits: number }
  /** Moves trust by whole steps, clamped to [-1, 1]. */
  /** One act moves trust one whole step, either way (-1 or +1); `cause` goes in the trust log (CMP-4). */
  | { adjust_trust: [npc: string, delta: number, cause?: string] }
  /** Raises alert to at least this level (never lowers it). */
  | { raise_alert_to: AlertLevel }
  | { emit: string }
  /** Gives (or replaces) a pass. Expiry is in in-game minutes from now. */
  | {
      give_pass: {
        id: string;
        label: string;
        level: number;
        zones?: string[];
        expiresInMinutes?: number;
        uses?: number;
        origin: PassOrigin;
        curfewExempt?: boolean;
      };
    }
  | { revoke_pass: string }
  /** Takes a camera offline; the city notices and sends a maintenance robot after a delay. */
  | { disable_camera: string }
  | { enable_camera: string }
  /** Clears a door's lock (the door stays closed until opened). */
  | { unlock_door: string }
  /** The player now owns this augment (found, bought or crafted). Wearing it is a separate choice. */
  | { grant_augment: string }
  | { revoke_augment: string }
  /** Upgrades the wrist band's capacity. */
  | { add_band_capacity: { slots?: number; power?: number } }
  /** Uses a service: charge, apply its effects, and say what happened (needs content). */
  | { use_service: string }
  | { take_loan: [lender: string, amount: number] }
  /** Pays up to this much of what is owed, limited by the credits held. */
  | { repay_loan: [lender: string, amount: number] }
  | { set_district: [district: string, key: string, value: FlagValue] }
  /** Moves a city metric, clamped to 0-100. */
  | { adjust_metric: [metric: "order" | "power" | "contentment", delta: number] };

export class RuleError extends Error {}

// ---- Conditions --------------------------------------------------------------------------

export function evalCondition(c: Condition, state: Readonly<SimState>, config: Config, content?: Content): boolean {
  if ("all" in c) return c.all.every((x) => evalCondition(x, state, config, content));
  if ("any" in c) return c.any.some((x) => evalCondition(x, state, config, content));
  if ("not" in c) return !evalCondition(c.not, state, config, content);
  if ("can_service" in c) return content !== undefined && serviceStatus(state, content, config, c.can_service).ok;
  if ("has_record" in c) return (state.passes.length > 0) === c.has_record;
  if ("district_is" in c) return state.district[c.district_is[0]]?.[c.district_is[1]] === c.district_is[2];
  if ("metric_gte" in c) return state.metrics[c.metric_gte[0]] >= c.metric_gte[1];
  if ("metric_lte" in c) return state.metrics[c.metric_lte[0]] <= c.metric_lte[1];
  if ("is_curfew" in c) return gameTimeAt(state.tick, config).isCurfew === c.is_curfew;
  if ("is_quiet_hours" in c) return gameTimeAt(state.tick, config).isQuietHours === c.is_quiet_hours;
  if ("in_debt" in c) return totalOwed(state, c.in_debt === "*" ? undefined : c.in_debt) > 0;
  if ("has_clue" in c) return state.clues[c.has_clue] !== undefined;
  if ("clue_state" in c) return state.clues[c.clue_state[0]]?.status === c.clue_state[1];
  if ("flag" in c) return Boolean(state.flags[c.flag]);
  if ("flag_eq" in c) return state.flags[c.flag_eq[0]] === c.flag_eq[1];
  if ("has_item" in c) {
    const [id, min] = typeof c.has_item === "string" ? [c.has_item, 1] : c.has_item;
    return (state.inventory.items[id] ?? 0) >= min;
  }
  if ("credits_gte" in c) return state.inventory.credits >= c.credits_gte;
  if ("trust_gte" in c) return (state.trust[c.trust_gte[0]] ?? 0) >= c.trust_gte[1];
  if ("alert_gte" in c) return state.alert.level >= c.alert_gte;
  if ("time_between" in c) {
    return inWindow(gameTimeAt(state.tick, config).minuteOfDay, c.time_between[0], c.time_between[1]);
  }
  if ("arrest_count_gte" in c) return state.arrestCount >= c.arrest_count_gte;
  if ("has_augment" in c) return state.augments.owned.includes(c.has_augment);
  if ("augment_equipped" in c) return state.augments.equipped.includes(c.augment_equipped);
  if ("has_pass" in c) return state.passes.some((p) => p.id === c.has_pass);
  throw new RuleError(`unknown condition ${JSON.stringify(c)}`);
}

/** An absent condition means "always"; a list means all of them. */
export function evalAll(conds: Condition | Condition[] | undefined, state: Readonly<SimState>, config: Config, content?: Content): boolean {
  if (conds === undefined) return true;
  return (Array.isArray(conds) ? conds : [conds]).every((c) => evalCondition(c, state, config, content));
}

// ---- Effects -----------------------------------------------------------------------------

/** The trust log keeps the most recent causes (for the debug inspector and tests; never shown to the player). */
export const TRUST_LOG_LIMIT = 200;

const clampTrust = (n: number): TrustLevel => (n <= -1 ? -1 : n >= 1 ? 1 : 0);

/** Applies one effect to `state` (mutating it) and appends the resulting events. */
export function applyEffect(effect: Effect, state: SimState, events: GameEvent[], config?: Config, content?: Content): void {
  const tick = state.tick;
  if ("give_clue" in effect) {
    const { id, from } = effect.give_clue;
    if (state.clues[id] === undefined) {
      state.clues[id] = { learnedTick: tick, from, status: "unverified" };
      events.push({ type: "ClueGained", tick, clueId: id, from });
    }
  } else if ("verify_clue" in effect || "disprove_clue" in effect) {
    const id = "verify_clue" in effect ? effect.verify_clue : effect.disprove_clue;
    const status: ClueStatus = "verify_clue" in effect ? "verified" : "disproved";
    const entry = state.clues[id];
    if (entry && entry.status !== status) {
      entry.status = status;
      events.push({ type: "ClueStatusChanged", tick, clueId: id, status });
    }
  } else if ("set_flag" in effect) {
    const [flag, value] = effect.set_flag;
    if (state.flags[flag] !== value) {
      state.flags[flag] = value;
      events.push({ type: "FlagSet", tick, flag, value });
    }
  } else if ("add_item" in effect || "remove_item" in effect) {
    const [itemId, count] = "add_item" in effect ? effect.add_item : effect.remove_item;
    const have = state.inventory.items[itemId] ?? 0;
    // Removal takes at most what is held: effects never create negative counts.
    const delta = "add_item" in effect ? count : -Math.min(count, have);
    if (delta === 0) return;
    const total = have + delta;
    if (total === 0) delete state.inventory.items[itemId];
    else state.inventory.items[itemId] = total;
    events.push({ type: "ItemsChanged", tick, itemId, delta, total });
  } else if ("add_credits" in effect) {
    const total = Math.max(0, state.inventory.credits + effect.add_credits);
    const delta = total - state.inventory.credits;
    if (delta === 0) return;
    state.inventory.credits = total;
    events.push({ type: "CreditsChanged", tick, delta, total });
  } else if ("adjust_trust" in effect) {
    const [npc, delta, cause = "unspecified"] = effect.adjust_trust;
    const from = state.trust[npc] ?? 0;
    // One act is at most one step, whatever the number says.
    const to = clampTrust(from + Math.sign(delta));
    if (to !== from) {
      state.trust[npc] = to;
      state.trustLog.push({ tick, npc, from, to, cause });
      if (state.trustLog.length > TRUST_LOG_LIMIT) state.trustLog.shift();
      events.push({ type: "TrustChanged", tick, npc, from, to, cause });
    }
  } else if ("raise_alert_to" in effect) {
    const from = state.alert.level;
    if (effect.raise_alert_to > from) {
      state.alert.level = effect.raise_alert_to;
      state.alert.quietSince = tick;
      events.push({ type: "AlertChanged", tick, from, to: effect.raise_alert_to });
    }
  } else if ("emit" in effect) {
    events.push({ type: "Custom", tick, name: effect.emit });
  } else if ("give_pass" in effect) {
    const g = effect.give_pass;
    if (g.expiresInMinutes !== undefined && !config) throw new RuleError("give_pass with an expiry needs the game config");
    const expiresTick = g.expiresInMinutes === undefined || !config ? null : tick + Math.round(g.expiresInMinutes * ticksPerGameMinute(config));
    state.passes = state.passes.filter((p) => p.id !== g.id);
    state.passes.push({
      id: g.id, label: g.label, level: g.level, zones: g.zones ?? null, expiresTick,
      usesLeft: g.uses ?? null, origin: g.origin, curfewExempt: g.curfewExempt ?? false,
    });
    events.push({ type: "PassGained", tick, passId: g.id });
  } else if ("revoke_pass" in effect) {
    if (state.passes.some((p) => p.id === effect.revoke_pass)) {
      state.passes = state.passes.filter((p) => p.id !== effect.revoke_pass);
      events.push({ type: "PassLost", tick, passId: effect.revoke_pass });
    }
  } else if ("disable_camera" in effect || "enable_camera" in effect) {
    const id = "disable_camera" in effect ? effect.disable_camera : effect.enable_camera;
    const cam = state.cameras.find((c) => c.id === id);
    const off = "disable_camera" in effect;
    if (cam && cam.broken !== off) {
      cam.broken = off;
      cam.brokenAt = tick;
      cam.claimed = false;
      cam.sees = false;
      cam.suspicion = 0;
      events.push({ type: off ? "CameraDisabled" : "CameraRepaired", tick, cameraId: id });
    }
  } else if ("unlock_door" in effect) {
    const door = state.doors[effect.unlock_door];
    if (door?.locked) {
      door.locked = false;
      door.unlockedAt = tick;
      events.push({ type: "DoorUnlocked", tick, doorId: effect.unlock_door });
    }
  } else if ("set_district" in effect) {
    const [district, key, value] = effect.set_district;
    const bag = (state.district[district] ??= {});
    if (bag[key] !== value) {
      bag[key] = value;
      events.push({ type: "DistrictChanged", tick, district, key, value });
    }
  } else if ("adjust_metric" in effect) {
    const [metric, delta] = effect.adjust_metric;
    const from = state.metrics[metric];
    const to = Math.max(0, Math.min(100, from + delta));
    if (to !== from) {
      state.metrics[metric] = to;
      events.push({ type: "MetricChanged", tick, metric, from, to });
    }
  } else if ("use_service" in effect) {
    if (!config || !content) throw new RuleError("use_service needs the game config and content");
    useService(state, content, config, events, effect.use_service);
  } else if ("take_loan" in effect) {
    if (!config) throw new RuleError("take_loan needs the game config");
    takeLoan(state, config, events, effect.take_loan[0], effect.take_loan[1]);
  } else if ("repay_loan" in effect) {
    repayLoan(state, events, effect.repay_loan[0], effect.repay_loan[1]);
  } else if ("grant_augment" in effect) {
    if (!state.augments.owned.includes(effect.grant_augment)) {
      state.augments.owned.push(effect.grant_augment);
      events.push({ type: "AugmentGained", tick, augmentId: effect.grant_augment });
    }
  } else if ("revoke_augment" in effect) {
    const id = effect.revoke_augment;
    const was = state.augments.equipped.indexOf(id);
    if (was >= 0) {
      state.augments.equipped.splice(was, 1);
      events.push({ type: "AugmentUnequipped", tick, augmentId: id });
    }
    state.augments.owned = state.augments.owned.filter((a) => a !== id);
  } else if ("add_band_capacity" in effect) {
    state.augments.slots += effect.add_band_capacity.slots ?? 0;
    state.augments.powerBudget += effect.add_band_capacity.power ?? 0;
    events.push({ type: "BandUpgraded", tick, slots: state.augments.slots, powerBudget: state.augments.powerBudget });
  } else {
    throw new RuleError(`unknown effect ${JSON.stringify(effect)}`);
  }
}

export function applyEffects(effects: readonly Effect[], state: SimState, events: GameEvent[], config?: Config, content?: Content): void {
  for (const e of effects) applyEffect(e, state, events, config, content);
}

// ---- Validation (for content tools; mirrors the runtime exactly) ---------------------------

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isInt = (v: unknown, min: number, max = Infinity): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isFlagValue = (v: unknown): v is FlagValue => ["boolean", "number", "string"].includes(typeof v);
const isTuple = (v: unknown, n: number): v is unknown[] => Array.isArray(v) && v.length === n;

function single(raw: unknown, path: string, errors: string[]): [string, unknown] | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    errors.push(`${path}: expected an object with one key`);
    return null;
  }
  const keys = Object.keys(raw);
  if (keys.length !== 1) {
    errors.push(`${path}: expected exactly one key, found ${keys.length === 0 ? "none" : keys.join(", ")}`);
    return null;
  }
  return [keys[0]!, (raw as Record<string, unknown>)[keys[0]!]];
}

export function validateCondition(raw: unknown, path = "condition"): string[] {
  const errors: string[] = [];
  const kv = single(raw, path, errors);
  if (!kv) return errors;
  const [op, a] = kv;
  const bad = (what: string) => errors.push(`${path}.${op}: ${what}`);
  switch (op) {
    case "all":
    case "any":
      if (!Array.isArray(a) || a.length === 0) bad("expected a non-empty list of conditions");
      else a.forEach((x, i) => errors.push(...validateCondition(x, `${path}.${op}[${i}]`)));
      break;
    case "not":
      errors.push(...validateCondition(a, `${path}.not`));
      break;
    case "has_clue":
    case "flag":
    case "has_pass":
    case "has_augment":
    case "augment_equipped":
    case "can_service":
    case "in_debt":
      if (!isStr(a)) bad("expected a string id");
      break;
    case "clue_state":
      if (!isTuple(a, 2) || !isStr(a[0]) || !["unverified", "verified", "disproved"].includes(a[1] as string)) bad("expected [clueId, unverified|verified|disproved]");
      break;
    case "flag_eq":
      if (!isTuple(a, 2) || !isStr(a[0]) || !isFlagValue(a[1])) bad("expected [flag, boolean|number|string]");
      break;
    case "has_item":
      if (!(isStr(a) || (isTuple(a, 2) && isStr(a[0]) && isInt(a[1], 1)))) bad("expected an item id or [itemId, minimum >= 1]");
      break;
    case "district_is":
      if (!isTuple(a, 3) || !isStr(a[0]) || !isStr(a[1]) || !isFlagValue(a[2])) bad("expected [district, key, boolean|number|string]");
      break;
    case "metric_gte":
    case "metric_lte":
      if (!isTuple(a, 2) || !["order", "power", "contentment"].includes(a[0] as string) || !isInt(a[1], 0, 100)) bad("expected [order|power|contentment, 0-100]");
      break;
    case "is_curfew":
    case "is_quiet_hours":
    case "has_record":
      if (typeof a !== "boolean") bad("expected true or false");
      break;
    case "credits_gte":
    case "arrest_count_gte":
      if (!isInt(a, 0)) bad("expected a whole number >= 0");
      break;
    case "trust_gte":
      if (!isTuple(a, 2) || !isStr(a[0]) || ![-1, 0, 1].includes(a[1] as number)) bad("expected [npcId, -1|0|1]");
      break;
    case "alert_gte":
      if (!isInt(a, 0, 3)) bad("expected an alert level 0-3");
      break;
    case "time_between":
      if (!isTuple(a, 2) || !isInt(a[0], 0, 1439) || !isInt(a[1], 0, 1440)) bad("expected [startMinute, endMinute] within the day");
      break;
    default:
      errors.push(`${path}: unknown condition "${op}"`);
  }
  return errors;
}

export function validateEffect(raw: unknown, path = "effect"): string[] {
  const errors: string[] = [];
  const kv = single(raw, path, errors);
  if (!kv) return errors;
  const [op, a] = kv;
  const bad = (what: string) => errors.push(`${path}.${op}: ${what}`);
  switch (op) {
    case "give_clue": {
      const o = a as { id?: unknown; from?: unknown } | null;
      if (typeof o !== "object" || o === null || !isStr(o.id) || !isStr(o.from)) bad("expected { id, from } strings");
      break;
    }
    case "give_pass": {
      const o = a as Record<string, unknown> | null;
      if (typeof o !== "object" || o === null) {
        bad("expected an object");
        break;
      }
      if (!isStr(o.id) || !isStr(o.label)) bad("needs string id and label");
      if (!isInt(o.level, 0, 9)) bad("level must be a whole number 0-9");
      if (!["issued", "forged", "borrowed", "stolen"].includes(o.origin as string)) bad("origin must be issued, forged, borrowed or stolen");
      if (o.zones !== undefined && !(Array.isArray(o.zones) && o.zones.every(isStr))) bad("zones must be a list of zone ids");
      if (o.expiresInMinutes !== undefined && !isInt(o.expiresInMinutes, 1)) bad("expiresInMinutes must be a whole number >= 1");
      if (o.uses !== undefined && !isInt(o.uses, 1)) bad("uses must be a whole number >= 1");
      if (o.curfewExempt !== undefined && typeof o.curfewExempt !== "boolean") bad("curfewExempt must be true or false");
      break;
    }
    case "disable_camera":
    case "enable_camera":
    case "revoke_pass":
    case "verify_clue":
    case "disprove_clue":
    case "emit":
    case "unlock_door":
    case "grant_augment":
    case "revoke_augment":
    case "use_service":
      if (!isStr(a)) bad("expected a string");
      break;
    case "set_flag":
      if (!isTuple(a, 2) || !isStr(a[0]) || !isFlagValue(a[1])) bad("expected [flag, boolean|number|string]");
      break;
    case "add_item":
    case "remove_item":
      if (!isTuple(a, 2) || !isStr(a[0]) || !isInt(a[1], 1)) bad("expected [itemId, count >= 1]");
      break;
    case "add_credits":
      if (!isInt(a, -1_000_000, 1_000_000)) bad("expected a whole number of credits");
      break;
    case "adjust_trust":
      if (!(isTuple(a, 2) || isTuple(a, 3)) || !isStr(a[0]) || !(a[1] === 1 || a[1] === -1) || (a.length === 3 && !isStr(a[2]))) bad("expected [npcId, +1 or -1, cause?]: one act is one step");
      break;
    case "raise_alert_to":
      if (!isInt(a, 0, 3)) bad("expected an alert level 0-3");
      break;
    case "set_district":
      if (!isTuple(a, 3) || !isStr(a[0]) || !isStr(a[1]) || !isFlagValue(a[2])) bad("expected [district, key, boolean|number|string]");
      break;
    case "adjust_metric":
      if (!isTuple(a, 2) || !["order", "power", "contentment"].includes(a[0] as string) || !isInt(a[1], -100, 100)) bad("expected [order|power|contentment, delta -100..100]");
      break;
    case "take_loan":
    case "repay_loan":
      if (!isTuple(a, 2) || !isStr(a[0]) || !isInt(a[1], 1)) bad("expected [lender, amount >= 1]");
      break;
    case "add_band_capacity": {
      const o = a as Record<string, unknown> | null;
      if (typeof o !== "object" || o === null || (o.slots === undefined && o.power === undefined)) bad("expected { slots?, power? }");
      else if ((o.slots !== undefined && !isInt(o.slots, 0)) || (o.power !== undefined && !isInt(o.power, 0))) bad("slots and power must be whole numbers >= 0");
      break;
    }
    default:
      errors.push(`${path}: unknown effect "${op}"`);
  }
  return errors;
}
