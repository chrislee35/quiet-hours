/**
 * District state, city metrics and the reaction table (T2.7, WLD-3/4, ALR-4).
 *
 * District state is a small bag of named values per district (`stacks.power = "off"`, `stacks.patrolSet =
 * "reinforced"`), changed only by effects and read by conditions, robots and cameras. A robot or camera
 * placed with `activeWhen: "district:key=value"` exists only while that holds: that is how a lockdown brings
 * in extra patrols and a power cut blinds the cameras.
 *
 * The city also keeps three metrics, order, power and contentment (0-100). They move with what the player does
 * and slowly recover. MERIDIAN responds to them (reallocating robots and rules) through the same data.
 *
 * A *reaction* is content: `{ on: EventType, match, if, effects, once }`. When a matching event happens and the
 * conditions hold, the effects run. Reactions can chain (a metric change can trigger the next reaction) up to a
 * small depth, so a bad rule can never loop forever.
 */
import { MINUTES_PER_DAY, MINUTES_PER_HOUR, gameTimeAt, inWindow } from "./clock.ts";
import type { Config } from "./config.ts";
import type { Ctx } from "./ctx.ts";
import type { Content } from "./dialogue/types.ts";
import type { GameEvent } from "./events.ts";
import { applyEffects, evalAll, type Condition, type Effect } from "./rules.ts";
import type { SimState } from "./state.ts";

export type MetricName = "order" | "power" | "contentment";
export const METRICS: readonly MetricName[] = ["order", "power", "contentment"];

export interface ReactionDef {
  id: string;
  /** The event type that triggers it (e.g. "RobotStunned", "Custom"). */
  on: string;
  /** Every listed field must equal the event's (e.g. { name: "sabotage_power" } for a Custom event). */
  match?: Record<string, string | number | boolean>;
  if?: Condition[];
  effects: Effect[];
  /** Fires at most once per game. */
  once?: boolean;
}

export type ActiveWhen =
  | { kind: "district"; district: string; key: string; value: string | number | boolean; /** `!=`: active unless it matches (an unset value counts as active). */ not: boolean }
  /** Daily windows [start, end) in minutes of the day (each may wrap midnight); `not` inverts: active only outside all of them. */
  | { kind: "time"; windows: [start: number, end: number][]; not: boolean };

/**
 * Parses an `activeWhen` string:
 *   "district:key=value" / "district:key!=value"   a district value (number or true/false when it looks like one)
 *   "time:02:00-05:00" / "!time:02:00-05:00"       inside / outside a daily window (Quiet Hours rosters); several
 *                                                    windows may be listed, comma separated ("!time:12:00-12:10,18:00-18:10")
 */
export function parseActiveWhen(text: string): ActiveWhen | null {
  const t = text.match(/^(!?)time:(\d{1,2}:\d{2}-\d{1,2}:\d{2}(?:,\d{1,2}:\d{2}-\d{1,2}:\d{2})*)$/);
  if (t) {
    const windows: [number, number][] = [];
    for (const part of t[2]!.split(",")) {
      const m = part.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/)!;
      const start = Number(m[1]) * MINUTES_PER_HOUR + Number(m[2]);
      const end = Number(m[3]) * MINUTES_PER_HOUR + Number(m[4]);
      if (!(start < MINUTES_PER_DAY && end <= MINUTES_PER_DAY && Number(m[2]) < MINUTES_PER_HOUR && Number(m[4]) < MINUTES_PER_HOUR)) return null;
      windows.push([start, end]);
    }
    return { kind: "time", windows, not: t[1] === "!" };
  }
  const m = text.match(/^([a-z][a-z0-9_]*):([A-Za-z][A-Za-z0-9_]*)(!?=)(.+)$/);
  if (!m) return null;
  const raw = m[4]!;
  const value = raw === "true" ? true : raw === "false" ? false : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
  return { kind: "district", district: m[1]!, key: m[2]!, value, not: m[3] === "!=" };
}

export const districtValue = (state: Readonly<SimState>, district: string, key: string): string | number | boolean | undefined =>
  state.district[district]?.[key];

export function isActive(state: Readonly<SimState>, when: ActiveWhen | null, config: Config): boolean {
  if (when === null) return true;
  if (when.kind === "time") {
    const minute = gameTimeAt(state.tick, config).minuteOfDay;
    return when.windows.some(([a, b]) => inWindow(minute, a, b)) !== when.not;
  }
  return (districtValue(state, when.district, when.key) === when.value) !== when.not;
}

function matches(event: GameEvent, r: ReactionDef): boolean {
  if (event.type !== r.on) return false;
  const e = event as unknown as Record<string, unknown>;
  return Object.entries(r.match ?? {}).every(([k, v]) => e[k] === v);
}

/** How many rounds of reactions one tick may chain (a bad rule set must never loop forever). */
const MAX_CHAIN = 4;

/** Runs reactions for the events of this tick, including events the reactions themselves cause. */
export function reactionSystem(ctx: Ctx): void {
  const { state, config, events } = ctx;
  recoverMetrics(ctx);
  const reactions = Object.values(ctx.content.reactions);
  let from = 0;
  for (let round = 0; round < MAX_CHAIN && from < events.length; round++) {
    const batch = events.slice(from);
    from = events.length;
    for (const event of batch) {
      for (const r of reactions) {
        if (!matches(event, r)) continue;
        const done = `reaction_done_${r.id}`;
        if (r.once && state.flags[done]) continue;
        if (!evalAll(r.if, state, config, ctx.content)) continue;
        if (r.once) state.flags[done] = true;
        events.push({ type: "ReactionFired", tick: state.tick, reactionId: r.id });
        applyEffects(r.effects, state, events, config, ctx.content);
      }
    }
  }
  syncActivity(ctx);
}

/** Robots and cameras with an `activeWhen` come and go as district state changes. */
function syncActivity({ state, config, events }: Ctx): void {
  for (const r of state.robots) {
    const dormant = !isActive(state, r.activeWhen, config);
    if (dormant !== r.dormant) {
      r.dormant = dormant;
      if (dormant) {
        r.sees = false;
        r.suspicion = 0;
        r.mode = "patrol";
        r.target = null;
        r.path = [];
        r.pathGoal = null;
      }
      events.push({ type: dormant ? "RobotStoodDown" : "RobotActivated", tick: state.tick, robotId: r.id });
    }
  }
  for (const c of state.cameras) {
    const dormant = !isActive(state, c.activeWhen, config);
    if (dormant !== c.dormant) {
      c.dormant = dormant;
      c.sees = false;
      c.suspicion = 0;
      events.push({ type: dormant ? "CameraPowerLost" : "CameraPowerRestored", tick: state.tick, cameraId: c.id });
    }
  }
}

/** Each in-game hour, order and contentment drift back toward where they started (a city heals). */
function recoverMetrics({ state, config, events }: Ctx): void {
  const hour = Math.floor((state.tick / config.sim.ticksPerSecond) * (config.clock.gameMinutesPerRealSecond / MINUTES_PER_HOUR));
  const m = state.metrics;
  if (hour === m.lastHour) return;
  m.lastHour = hour;
  const step = config.metrics.recoverPerHour;
  for (const [name, base] of [["order", config.metrics.orderStart], ["contentment", config.metrics.contentmentStart]] as const) {
    const from = m[name];
    if (from === base) continue;
    const to = from < base ? Math.min(base, from + step) : Math.max(base, from - step);
    m[name] = to;
    events.push({ type: "MetricChanged", tick: state.tick, metric: name, from, to });
  }
}
