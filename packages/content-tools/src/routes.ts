/**
 * Cross-map route checking (T3.11, END-1). The per-map checker proves what can happen on one map; the three ways out of
 * the city need things from all of them. This is a monotone closure over the whole game: starting with nothing but
 * the start state, repeatedly apply every thing the player could do anywhere (a conversation option, a pickup, a
 * terminal, a fare) whose requirements are already obtainable, and see whether a route's crossing service becomes
 * possible. It is optimistic about time, money and position (the per-map checker and the scenario tests cover those)
 * and nothing in it is combat: there is no rule that needs a fight, so a route it reaches is a route without one.
 * Each route is also tried while "keeping the null edge" (no embracing of the past), because a route that only
 * the embraced past can reach would be a forced choice.
 */
import { pickupEffects, type Condition, type Content, type Effect, type FlagValue, type World } from "@qh/core";

export interface RouteReport {
  route: string;
  service: string;
  /** Reachable using anything. */
  reachable: boolean;
  /** Reachable without ever embracing the past. */
  reachableNull: boolean;
  /** One way there: the providers, in the order they were needed. */
  chain: string[];
  missing: string[];
}

interface Rule { id: string; map: string | null; conds: Condition[]; effects: Effect[]; embraces: boolean }

class Facts {
  flags = new Map<string, Set<string>>();
  clues = new Set<string>();
  items = new Set<string>();
  passes = new Set<string>();
  trust = new Map<string, number>();
  districts = new Set<string>();
  maps = new Set<string>();
  why = new Map<string, string>();
  size() { return this.clues.size + this.items.size + this.passes.size + this.districts.size + this.maps.size + [...this.flags.values()].reduce((n, s) => n + s.size, 0) + [...this.trust.values()].reduce((n, t) => n + t, 0); }
}

const val = (v: FlagValue): string => String(v);

function holds(c: Condition, f: Facts): boolean {
  if ("all" in c) return c.all.every((x) => holds(x, f));
  if ("any" in c) return c.any.some((x) => holds(x, f));
  if ("not" in c) return true; // optimistic: a thing the player lacks is not something they must acquire
  if ("has_clue" in c) return f.clues.has(c.has_clue);
  if ("clue_state" in c) return f.clues.has(c.clue_state[0]);
  if ("flag" in c) return [...(f.flags.get(c.flag) ?? [])].some((v) => v !== "false" && v !== "0");
  if ("flag_eq" in c) return f.flags.get(c.flag_eq[0])?.has(val(c.flag_eq[1])) ?? false;
  if ("has_item" in c) return f.items.has(Array.isArray(c.has_item) ? c.has_item[0] : c.has_item);
  if ("trust_gte" in c) return (f.trust.get(c.trust_gte[0]) ?? 0) >= c.trust_gte[1];
  if ("district_is" in c) return f.districts.has(`${c.district_is[0]}.${c.district_is[1]}=${val(c.district_is[2])}`);
  if ("has_pass" in c) return f.passes.has(c.has_pass);
  if ("has_record" in c) return c.has_record ? f.passes.size > 0 : true;
  return true; // time, credits, alert, metrics, curfew: the per-map checker and the scenarios cover these
}

/** Applies effects, expanding services; returns whether anything new became true. */
function apply(effects: Effect[], f: Facts, why: string, content: Content, depth = 0): boolean {
  let grew = false;
  const note = (key: string) => { if (!f.why.has(key)) f.why.set(key, why); };
  for (const e of effects) {
    if ("give_clue" in e) { if (!f.clues.has(e.give_clue.id)) { f.clues.add(e.give_clue.id); note(`clue:${e.give_clue.id}`); grew = true; } }
    else if ("set_flag" in e) {
      const set = f.flags.get(e.set_flag[0]) ?? new Set<string>();
      if (!set.has(val(e.set_flag[1]))) { set.add(val(e.set_flag[1])); f.flags.set(e.set_flag[0], set); note(`flag:${e.set_flag[0]}=${val(e.set_flag[1])}`); grew = true; }
    } else if ("add_item" in e) { if (!f.items.has(e.add_item[0])) { f.items.add(e.add_item[0]); note(`item:${e.add_item[0]}`); grew = true; } }
    else if ("give_pass" in e) { if (!f.passes.has(e.give_pass.id)) { f.passes.add(e.give_pass.id); note(`pass:${e.give_pass.id}`); grew = true; } }
    else if ("adjust_trust" in e) { if (e.adjust_trust[1] > 0 && (f.trust.get(e.adjust_trust[0]) ?? 0) < 1) { f.trust.set(e.adjust_trust[0], 1); grew = true; } }
    else if ("set_district" in e) { const k = `${e.set_district[0]}.${e.set_district[1]}=${val(e.set_district[2])}`; if (!f.districts.has(k)) { f.districts.add(k); note(`district:${k}`); grew = true; } }
    else if ("use_service" in e && depth < 3) {
      const s = content.services[e.use_service];
      if (s && s.requires.every((c) => holds(c, f))) grew = apply(s.effects, f, why, content, depth + 1) || grew;
    }
  }
  return grew;
}

/** A conversation effect that uses a service is only possible when the service's own requirements hold. */
const condsOf = (effects: Effect[], content: Content): Condition[] => effects.flatMap((e) => ("use_service" in e ? content.services[e.use_service]?.requires ?? [] : []));

const embraces = (effects: Effect[]): boolean => effects.some((e) => ("set_flag" in e && /^past_m\d$/.test(e.set_flag[0]) && e.set_flag[1] === "embrace"));

function rulesOf(worlds: Record<string, World>, content: Content): Rule[] {
  const rules: Rule[] = [];
  const mapOfNpc = new Map<string, string[]>();
  for (const [mid, w] of Object.entries(worlds)) for (const n of w.npcs) mapOfNpc.set(n.dialogue, [...(mapOfNpc.get(n.dialogue) ?? []), mid]);
  for (const [did, d] of Object.entries(content.dialogues)) {
    for (const map of mapOfNpc.get(did) ?? []) {
      const add = (id: string, conds: Condition[], effects: Effect[]) => rules.push({ id: `${d.name}: ${id}`, map, conds: [...conds, ...condsOf(effects, content)], effects, embraces: embraces(effects) });
      for (const st of d.start) add(`opening (${st.goto})`, st.if, d.nodes[st.goto]?.onEnter ?? []);
      for (const n of Object.values(d.nodes)) {
        for (const ch of n.choices) add(`"${ch.text.slice(0, 48)}"`, ch.if, [...ch.effects, ...(d.nodes[ch.goto]?.onEnter ?? [])]);
        for (const r of n.present ?? []) add(`showing ${r.clue}`, [{ has_clue: r.clue }, ...r.if], [...r.effects, ...(d.nodes[r.goto]?.onEnter ?? [])]);
      }
    }
  }
  for (const [map, w] of Object.entries(worlds)) {
    for (const p of w.pickups) {
      const eff = pickupEffects(p.grant) ?? [];
      const conds: Condition[] = [];
      const [k, id] = (p.requires ?? "").split(":");
      if (k === "item" && id) conds.push({ has_item: id }); else if (k === "clue" && id) conds.push({ has_clue: id });
      rules.push({ id: `pickup ${p.id}`, map, conds, effects: eff, embraces: false });
    }
    for (const t of w.terminals) {
      const def = content.terminals[t.id];
      if (!def) continue;
      rules.push({ id: `terminal ${t.id} (puzzle)`, map, conds: def.puzzleRequires ?? [], effects: def.onSolve, embraces: embraces(def.onSolve) });
      rules.push({ id: `terminal ${t.id} (bypass)`, map, conds: def.bypass, effects: def.onSolve, embraces: embraces(def.onSolve) });
    }
    for (const x of w.exits) {
      const fare = x.fare ? content.services[x.fare] : undefined;
      rules.push({ id: `exit ${x.id} to ${x.to}`, map, conds: fare?.requires ?? [], effects: [{ set_flag: [`__map_${x.to}`, true] }, ...(fare?.effects ?? [])], embraces: false });
    }
  }
  // Reactions to a flag being set (and what they schedule) follow the flag: the mentor's awakening comes after their choice.
  const flatten = (effects: Effect[]): Effect[] => effects.flatMap((e) => ("schedule" in e ? flatten(e.schedule.effects) : [e]));
  for (const r of Object.values(content.reactions)) {
    if (r.on !== "FlagSet" || typeof r.match?.flag !== "string") continue;
    const effects = flatten(r.effects);
    rules.push({ id: `reaction ${r.id}`, map: null, conds: [{ flag: r.match.flag }, ...(r.if ?? [])], effects, embraces: embraces(effects) });
  }
  return rules;
}

function closure(rules: Rule[], content: Content, start: { items: Record<string, number> }, startMap: string, noEmbrace: boolean): Facts {
  const f = new Facts();
  for (const id of Object.keys(start.items)) { f.items.add(id); }
  f.flags.set(`__map_${startMap}`, new Set(["true"]));
  for (let guard = 0; guard < 200; guard++) {
    let grew = false;
    for (const r of rules) {
      if (noEmbrace && r.embraces) continue;
      if (r.map && !holds({ flag: `__map_${r.map}` }, f)) continue;
      if (!r.conds.every((c) => holds(c, f))) continue;
      if (apply(r.effects, f, r.id, content)) grew = true;
    }
    if (!grew) break;
  }
  return f;
}

/** Every route out of the city: each service whose effects set `route_taken`. */
export function checkRoutes(worlds: Record<string, World>, content: Content, start: { items: Record<string, number> }, startMap = "stacks"): RouteReport[] {
  const rules = rulesOf(worlds, content);
  const full = closure(rules, content, start, startMap, false);
  const nul = closure(rules, content, start, startMap, true);
  const out: RouteReport[] = [];
  for (const s of Object.values(content.services)) {
    const eff = s.effects.find((e): e is Extract<Effect, { set_flag: [string, FlagValue] }> => "set_flag" in e && e.set_flag[0] === "route_taken");
    if (!eff) continue;
    const exitMap = Object.entries(worlds).find(([, w]) => w.exits.some((x) => x.fare === s.id))?.[0];
    const ok = (f: Facts) => s.requires.every((c) => holds(c, f)) && (exitMap === undefined || holds({ flag: `__map_${exitMap}` }, f));
    const missing = s.requires.filter((c) => !holds(c, full)).map((c) => JSON.stringify(c));
    // The way there: walk back from what the service needs through who provided it.
    const src = ok(nul) ? nul : full;
    const chain: string[] = [];
    const seen = new Set<string>();
    const trace = (c: Condition) => {
      const keys: string[] = [];
      if ("has_clue" in c) keys.push(`clue:${c.has_clue}`);
      if ("has_item" in c) keys.push(`item:${Array.isArray(c.has_item) ? c.has_item[0] : c.has_item}`);
      if ("has_pass" in c) keys.push(`pass:${c.has_pass}`);
      if ("flag" in c) for (const v of src.flags.get(c.flag) ?? []) keys.push(`flag:${c.flag}=${v}`);
      if ("flag_eq" in c) keys.push(`flag:${c.flag_eq[0]}=${val(c.flag_eq[1])}`);
      if ("district_is" in c) keys.push(`district:${c.district_is[0]}.${c.district_is[1]}=${val(c.district_is[2])}`);
      if ("has_record" in c && c.has_record) { const k = [...src.why.keys()].find((x) => x.startsWith("pass:")); if (k) keys.push(k); }
      if ("any" in c) c.any.forEach(trace);
      if ("all" in c) c.all.forEach(trace);
      for (const k of keys) {
        const why = src.why.get(k);
        if (!why || seen.has(why)) continue;
        seen.add(why);
        const rule = rules.find((r) => r.id === why);
        if (rule?.map) trace({ flag: `__map_${rule.map}` });
        rule?.conds.forEach(trace);
        chain.push(why);
      }
    };
    s.requires.forEach(trace);
    if (exitMap) trace({ flag: `__map_${exitMap}` });
    out.push({ route: String(eff.set_flag[1]), service: s.id, reachable: ok(full), reachableNull: ok(nul), chain, missing });
  }
  return out.sort((a, b) => (a.route < b.route ? -1 : 1));
}

export interface CompanionReport {
  id: string;
  /** The gate (trust plus the practical requirement) can be met from the start state, optimistically. */
  gate: boolean;
  /** Each route's extra requirements for this person can be met too. */
  routes: Record<string, boolean>;
  /** The gate conditions nothing in the content can yet make true. */
  missing: string[];
}

/**
 * Can each candidate be brought out, by each route (CMP-5)? Uses the same closure as `checkRoutes`: optimistic about time,
 * money, position and alert, exact about the flags, items, clues and trust that the gate and the complications read.
 * Candidates whose arcs are not written yet (June and Odile arrive with the optional areas) report missing conditions.
 */
export function checkCompanions(worlds: Record<string, World>, content: Content, start: { items: Record<string, number> }, startMap = "stacks"): CompanionReport[] {
  const f = closure(rulesOf(worlds, content), content, start, startMap, false);
  return Object.values(content.companions).map((c) => {
    const missing = c.gate.filter((x) => !holds(x, f)).map((x) => JSON.stringify(x));
    const routes: Record<string, boolean> = {};
    for (const [r, rt] of Object.entries(c.routes)) routes[r] = rt.requires.every((x) => holds(x, f));
    return { id: c.id, gate: missing.length === 0, routes, missing };
  });
}
