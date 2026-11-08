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
import type { SimState } from "./state.ts";

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
  | { arrest_count_gte: number };

export type Effect =
  | { give_clue: { id: string; from: string } }
  | { verify_clue: string }
  | { disprove_clue: string }
  | { set_flag: [flag: string, value: FlagValue] }
  | { add_item: [itemId: string, count: number] }
  | { remove_item: [itemId: string, count: number] }
  | { add_credits: number }
  /** Moves trust by whole steps, clamped to [-1, 1]. */
  | { adjust_trust: [npc: string, delta: number] }
  /** Raises alert to at least this level (never lowers it). */
  | { raise_alert_to: AlertLevel }
  | { emit: string }
  /** Clears a door's lock (the door stays closed until opened). */
  | { unlock_door: string };

export class RuleError extends Error {}

// ---- Conditions --------------------------------------------------------------------------

export function evalCondition(c: Condition, state: Readonly<SimState>, config: Config): boolean {
  if ("all" in c) return c.all.every((x) => evalCondition(x, state, config));
  if ("any" in c) return c.any.some((x) => evalCondition(x, state, config));
  if ("not" in c) return !evalCondition(c.not, state, config);
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
  throw new RuleError(`unknown condition ${JSON.stringify(c)}`);
}

/** An absent condition means "always"; a list means all of them. */
export function evalAll(conds: Condition | Condition[] | undefined, state: Readonly<SimState>, config: Config): boolean {
  if (conds === undefined) return true;
  return (Array.isArray(conds) ? conds : [conds]).every((c) => evalCondition(c, state, config));
}

// ---- Effects -----------------------------------------------------------------------------

const clampTrust = (n: number): TrustLevel => (n <= -1 ? -1 : n >= 1 ? 1 : 0);

/** Applies one effect to `state` (mutating it) and appends the resulting events. */
export function applyEffect(effect: Effect, state: SimState, events: GameEvent[]): void {
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
    const [npc, delta] = effect.adjust_trust;
    const from = state.trust[npc] ?? 0;
    const to = clampTrust(from + delta);
    if (to !== from) {
      state.trust[npc] = to;
      events.push({ type: "TrustChanged", tick, npc, from, to });
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
  } else if ("unlock_door" in effect) {
    const door = state.doors[effect.unlock_door];
    if (door?.locked) {
      door.locked = false;
      events.push({ type: "DoorUnlocked", tick, doorId: effect.unlock_door });
    }
  } else {
    throw new RuleError(`unknown effect ${JSON.stringify(effect)}`);
  }
}

export function applyEffects(effects: readonly Effect[], state: SimState, events: GameEvent[]): void {
  for (const e of effects) applyEffect(e, state, events);
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
    case "verify_clue":
    case "disprove_clue":
    case "emit":
    case "unlock_door":
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
      if (!isTuple(a, 2) || !isStr(a[0]) || !isInt(a[1], -2, 2)) bad("expected [npcId, delta -2..2]");
      break;
    case "raise_alert_to":
      if (!isInt(a, 0, 3)) bad("expected an alert level 0-3");
      break;
    default:
      errors.push(`${path}: unknown effect "${op}"`);
  }
  return errors;
}
