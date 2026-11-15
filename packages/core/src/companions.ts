/**
 * The Escapee (T3.12, CMP-1/5/6/7, END-4). Exactly one candidate leaves with the player, chosen by asking them
 * (`flag companion`). Each candidate is a piece of content: whether they are a candidate in this run, a gate (their trust
 * plus the practical requirement), what each route asks of them in addition, and what becomes of them if they stay.
 * Nothing follows the player: the companion is *with* them only in the sense that the crossing's requirements include
 * theirs. Routes call `route_clear`; a candidate is brought if `can_bring` holds.
 *
 * When the player escapes (`escaped` set), `finalizeEscape` records who came, makes sure every candidate's eyes are
 * open (CMP-6) and writes the sequel flags (CMP-7, END-4), all as ordinary `sequel_*` flags in the final save.
 */
import type { Config } from "./config.ts";
import type { Content } from "./dialogue/types.ts";
import type { GameEvent, FlagValue } from "./events.ts";
import type { CompanionClosing } from "./closing.ts";
import { pastStance } from "./past.ts";
import { evalAll, type Condition } from "./rules.ts";
import type { SimState } from "./state.ts";

export const ROUTES = ["sneak", "hack", "break"] as const;
export type RouteId = (typeof ROUTES)[number];
export type CompanionRole = "mentor" | "partner" | "ward" | "convert";
export type SequelState = "escaped" | "free" | "hiding" | "arrested" | "left";
export type SequelStance = "ally" | "wary" | "estranged";

export interface CompanionDef {
  id: string;
  name: string;
  role: CompanionRole;
  /** The candidate exists in this run (a mentor only when chosen as the mentor). Empty means always. */
  active: Condition[];
  /** Trust plus the practical requirement: what must be true to bring them out. */
  gate: Condition[];
  /** What each route additionally asks when this person is with the player, and why, in plain words. */
  routes: Record<RouteId, { requires: Condition[]; harder: string }>;
  /** What they say at the end, in their voice (closing.ts). */
  closing: CompanionClosing;
  /** What becomes of them if they stay: the first matching rule wins; otherwise "left". */
  fate: { when: Condition[]; state: SequelState }[];
}

const flagKey = {
  awake: (id: string) => `awake_${id}`,
  state: (id: string) => `sequel_${id}_state`,
  stance: (id: string) => `sequel_${id}_stance`,
};

export const companionOf = (state: Readonly<SimState>): string | undefined => {
  const c = state.flags.companion;
  return typeof c === "string" && c !== "" && c !== "none" ? c : undefined;
};

/** Whoever is a candidate in this run: always four (the chosen mentor, Pallas, June, Odile). */
export function candidates(state: Readonly<SimState>, content: Content, config: Config): CompanionDef[] {
  return Object.values(content.companions).filter((c) => evalAll(c.active, state, config, content));
}

/** Can this person be brought out right now: a candidate, trusting you, and every practical requirement met. */
export function canBring(state: Readonly<SimState>, content: Content, config: Config, id: string): boolean {
  const c = content.companions[id];
  return c !== undefined && evalAll(c.active, state, config, content) && evalAll(c.gate, state, config, content);
}

/** Can the chosen companion (if any) make this crossing? With nobody chosen, always. */
export function routeClear(state: Readonly<SimState>, content: Content, config: Config, route: string): boolean {
  const id = companionOf(state);
  if (id === undefined) return true;
  const c = content.companions[id];
  if (!c || !(ROUTES as readonly string[]).includes(route)) return false;
  return canBring(state, content, config, id) && evalAll(c.routes[route as RouteId].requires, state, config, content);
}

/** The words for what makes this crossing harder for the chosen companion, or nothing. */
export function routeComplication(state: Readonly<SimState>, content: Content, route: string): string | undefined {
  const id = companionOf(state);
  const c = id === undefined ? undefined : content.companions[id];
  return c?.routes[route as RouteId]?.harder;
}

const stanceOf = (state: Readonly<SimState>, id: string): SequelStance => {
  const t = state.trust[id] ?? 0;
  return t >= 1 ? "ally" : t <= -1 ? "estranged" : "wary";
};

/**
 * Called once, when the player crosses. Writes `escapee`, makes every candidate aware (in person if the beat happened;
 * otherwise by a recorded message or the notebook handed on), and the sequel flags. Safe to call twice.
 */
export function finalizeEscape(state: SimState, content: Content, config: Config, events: GameEvent[]): void {
  const f = state.flags;
  if (f.sequel_done === true) return;
  const set = (k: string, v: FlagValue) => {
    if (f[k] !== v) { f[k] = v; events.push({ type: "FlagSet", tick: state.tick, flag: k, value: v }); }
  };
  const chosen = companionOf(state);
  const came = chosen !== undefined && canBring(state, content, config, chosen) ? chosen : undefined;
  set("escapee", came ?? "none");
  for (const c of candidates(state, content, config)) {
    if (f[flagKey.awake(c.id)] === undefined || f[flagKey.awake(c.id)] === false) set(flagKey.awake(c.id), "message");
    const fate = c.id === came ? "escaped" : (c.fate.find((r) => evalAll(r.when, state, config, content))?.state ?? "left");
    set(flagKey.state(c.id), fate);
    set(flagKey.stance(c.id), stanceOf(state, c.id));
  }
  set("sequel_companion", came ?? "none");
  set("sequel_route", typeof f.route_taken === "string" ? f.route_taken : "none");
  set("sequel_past", pastStance(f));
  set("sequel_hollow", f.hollow_discovered === true ? "found" : "hidden");
  set("sequel_lull", f.lull_awake === true ? "stirring" : "sleeping");
  set("sequel_cell", f.gate_broken === true ? "retaliated" : f.meridian_sees === true ? "watched" : "safe");
  set("sequel_done", true);
  events.push({ type: "Custom", tick: state.tick, name: "escaped" });
}
