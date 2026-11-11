/**
 * Solvability checker v1 (T2.15, ADR-6). Instead of playing the game with bots, it plays the *content*: an
 * abstract state is what the rules can see (knowledge, flags, items, credits, passes, augments, loans, district
 * values, trust, which terminals are solved, which doors are unlocked, the time of day phase) and positions are
 * reduced to "can the player get to this person/terminal/pickup, given which doors are still locked?". It then
 * explores *every* order of everything a player can do with the real rules code: the dialogue runtime, the
 * terminals' bypass and solve routes, pickups, and waiting for night. Because it runs the same `chooseOption`,
 * `applyEffects` and condition evaluators as the game, content cannot mean one thing to the game and another to
 * the checker.
 *
 * It reports (TESTING §7):
 *   - goals reachable from a fresh start (the thing the game needs to be winnable), with a shortest route;
 *   - soft locks: a reachable state from which a goal can no longer be reached;
 *   - critical terminals with fewer than two distinct ways through (the puzzle, a bypass, or another source);
 *   - quests that can never be completed, clues nobody can ever give, dialogue options that are never offered;
 * and says plainly when it ran out of room and its answers are incomplete.
 *
 * Not modelled yet (later milestones): combat avoidance (it never fights, so no route needs combat), robot
 * stealth, district reactions, companions and the three-way ending matrix. Every action here is something a
 * player does without any of those, which is exactly what "no route needs combat" asks.
 */
import {
  chooseOption, completeTerminal, createInitialState, deepClone, dialogueView, endConversation, evalAll, gameTimeAt, pickupEffect, presentClue,
  puzzleModule, applyEffects, startConversation, spawnPoint,
  type Config, type Content, type Ctx, type SimState, type World,
} from "@qh/core";
import type { GoalDef, StartState } from "./assemble.ts";

export interface CheckOptions {
  /** Most abstract states to explore per map before giving up (default 40,000). */
  maxStates?: number;
}

export interface Route {
  /** What the player does, in order, to get there. */
  steps: string[];
}

export interface TerminalReport {
  id: string;
  critical: boolean;
  /** The puzzle can be solved. */
  puzzle: boolean;
  /** Some reachable state satisfies the bypass conditions before the terminal is solved. */
  bypass: boolean;
  /** Some reachable state has the terminal's outcome without it being solved (another source of the same result). */
  alternative: boolean;
  /** How many distinct ways through it there are. */
  routes: number;
}

export interface Finding {
  severity: "error" | "warning" | "info";
  kind: string;
  message: string;
  route?: string[];
}

export interface MapReport {
  map: string;
  states: number;
  /** True if the search hit its limit, so "never happens" answers are not proof. */
  truncated: boolean;
  goals: { id: string; reachable: boolean; route: string[] | null }[];
  terminals: TerminalReport[];
  findings: Finding[];
}

export interface Report {
  maps: MapReport[];
  errors: number;
  warnings: number;
}

const PHASES = [
  { name: "day", day: 1, minute: 720 },
  { name: "curfew evening", day: 1, minute: 1380 },
  { name: "quiet hours", day: 2, minute: 180 },
] as const;

/** The tick at which the clock reads this day and minute. */
function tickAt(config: Config, day: number, minute: number): number {
  const minutes = (day - config.clock.startDay) * 1440 + minute - config.clock.startMinuteOfDay; // tuning-ok: minutes in a day
  return Math.ceil((minutes * config.sim.ticksPerSecond) / config.clock.gameMinutesPerRealSecond) + 1;
}

/**
 * The most credits that could ever matter: the sum of every price, cost and threshold in the content (plus the
 * start and one more). Having more than that can buy everything at once, so richer than this is the same as this.
 * It is what keeps "borrow, repay, borrow again" from growing the search forever.
 */
function creditCap(content: Content, goals: readonly GoalDef[], start: StartState): number {
  const text = JSON.stringify([content.dialogues, content.services, content.terminals, content.quests, goals]);
  let sum = start.credits + 1;
  for (const m of text.matchAll(/"(?:credits_gte|price)":(\d+)|"add_credits":-(\d+)/g)) sum += Number(m[1] ?? m[2]);
  return sum;
}

/**
 * How many of one item can matter: one more than everything the content ever asks for or removes (and starts with).
 * Beyond that, another copy changes nothing, so "take a key" can be done again and again without making new situations.
 */
function itemCap(content: Content, start: StartState): number {
  const text = JSON.stringify([content.dialogues, content.services, content.terminals, content.quests]);
  let sum = 1 + Object.values(start.items).reduce((a, b) => a + b, 0);
  for (const m of text.matchAll(/"(?:has_item|remove_item)":\["[^"]+",(\d+)\]/g)) sum += Number(m[1]);
  return sum;
}

const TIME_KEYS = /"(time_between|is_curfew|is_quiet_hours)"/;

/** Does anything in the content depend on the time of day? (If not, the checker skips the phase dimension.) */
function usesTime(content: Content): boolean {
  return TIME_KEYS.test(JSON.stringify([content.dialogues, content.services, content.terminals, content.quests]));
}

/**
 * What a state is, for deduplication: everything the rules can read, nothing they cannot (no tick, rng, position).
 * Credits and the size of a debt are left out of the key (that would make every spent coin a new situation) and
 * tracked instead as "the most credits the player could have here": more money never makes anything impossible, so
 * keeping the richest version of a situation can only make the search more generous. A "never" answer is therefore
 * still proof, while a soft lock caused purely by running out of money can be missed (documented in docs/solvability.md).
 */
function keyOf(s: SimState, phase: number, withTime: boolean, itemCapacity: number): string {
  const sorted = <T>(o: Record<string, T>) => Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify([
    sorted(s.flags), sorted(s.clues).map(([id, c]) => [id, c.status]), sorted(s.inventory.items).map(([id, n]) => [id, Math.min(n, itemCapacity)]),
    s.passes.map((p) => [p.id, p.origin, p.level]).sort(), [...s.augments.owned].sort(), [...s.augments.equipped].sort(),
    s.loans.debts.map((d) => d.lender).sort(), sorted(s.district).map(([k, v]) => [k, sorted(v)]), sorted(s.trust), s.alert.level,
    s.conversation ? [s.conversation.dialogueId, s.conversation.node] : null,
    sorted(s.terminals).map(([id, t]) => [id, t.solved]), sorted(s.doors).filter(([, d]) => !d.locked).map(([id]) => id), s.arrestCount > 0 ? 1 : 0,
    withTime ? phase : 0,
  ]);
}

/** Tiles the player can stand on (or beside) given which doors are unlocked: a flood fill from the start. */
function reachableTiles(world: World, state: SimState): Set<number> {
  const start = spawnPoint(world, "start");
  const seen = new Set<number>();
  if (!start || world.width === 0) return seen;
  const stack = [Math.floor(start.y) * world.width + Math.floor(start.x)];
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (seen.has(i)) continue;
    const x = i % world.width;
    const y = Math.floor(i / world.width);
    if (x < 0 || y < 0 || x >= world.width || y >= world.height || world.wall[i]) continue;
    const door = world.doorByTile.get(i);
    if (door && state.doors[door.id]?.locked) continue;
    seen.add(i);
    stack.push(i + 1, i - 1, i + world.width, i - world.width);
  }
  return seen;
}

/** Can the player stand next to this tile? (Interaction reaches about one tile.) */
function reachable(tiles: Set<number>, world: World, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (tiles.has((y + dy) * world.width + x + dx)) return true;
  return false;
}

/** The facts a terminal's effects establish, as checks on a state (only effects the checker can recognise). */
function outcomeHolds(effects: readonly unknown[], s: SimState): boolean | null {
  const checks: ((s: SimState) => boolean)[] = [];
  for (const e of effects as Record<string, unknown>[]) {
    if (typeof e.unlock_door === "string") checks.push((st) => st.doors[e.unlock_door as string]?.locked === false);
    else if (Array.isArray(e.set_flag)) {
      const [flag, value] = e.set_flag as [string, unknown];
      checks.push((st) => st.flags[flag] === value);
    }
    else if (typeof e.give_clue === "object" && e.give_clue !== null) checks.push((st) => st.clues[(e.give_clue as { id: string }).id] !== undefined);
    else if (typeof e.grant_augment === "string") checks.push((st) => st.augments.owned.includes(e.grant_augment as string));
    else if (Array.isArray(e.add_item)) {
      const item = (e.add_item as [string, number])[0];
      checks.push((st) => (st.inventory.items[item] ?? 0) > 0);
    }
  }
  return checks.length === 0 ? null : checks.every((c) => c(s));
}

export function checkMap(
  mapId: string, world: World, content: Content, config: Config, goals: readonly GoalDef[], start: StartState, options: CheckOptions = {},
): MapReport {
  const maxStates = options.maxStates ?? 40_000;
  const cap = creditCap(content, goals, start);
  const itemMax = itemCap(content, start);
  const rich = (s: SimState): number => Math.min(s.inventory.credits, cap);
  // The abstract world has no robots or cameras (the checker is about information, not stealth), which also keeps states small.
  const aw: World = { ...world, robots: [], cameras: [] };
  const withTime = usesTime(content);

  const base = createInitialState(1, config, aw);
  applyEffects([{ add_credits: start.credits }, ...Object.entries(start.items).map(([id, n]) => ({ add_item: [id, n] as [string, number] }))], base, [], config, content);
  base.tick = tickAt(config, PHASES[0].day, PHASES[0].minute);
  const ctxOf = (state: SimState): Ctx => ({ state, config, world: aw, content, events: [], commands: [] });

  // Puzzles are provably solvable or not on their own; the checker takes that as a fact about each terminal.
  const puzzleOk = new Map<string, boolean>();
  for (const t of aw.terminals) {
    const def = content.terminals[t.id];
    const puzzle = def ? content.puzzles[def.puzzle] : undefined;
    const mod = puzzle ? puzzleModule(puzzle) : undefined;
    puzzleOk.set(t.id, !!puzzle && !!mod && mod.solve(puzzle, mod.init(puzzle)) !== null);
  }
  const critical = aw.terminals.filter((t) => content.terminals[t.id]?.critical);
  const terminalSeen = new Map(critical.map((t) => [t.id, { bypass: false, alternative: false }]));

  interface Node { json: string; parent: string | null; via: string; phase: number; credits: number; depth: number }
  const nodes = new Map<string, Node>();
  const edges = new Map<string, string[]>();
  const rootKey = keyOf(base, 0, withTime, itemMax);
  nodes.set(rootKey, { json: JSON.stringify(base), parent: null, via: "start", phase: 0, credits: rich(base), depth: 0 });
  const queue: string[] = [rootKey];
  let truncated = false;

  const goalHit = new Map<string, string>(); // goal id -> first state key where it holds
  const goalKeys = new Map<string, Set<string>>(goals.map((g) => [g.id, new Set()]));
  const questDone = new Set<string>();
  const cluesSeen = new Set<string>();
  const seenChoices = new Set<string>();
  const seenNodes = new Set<string>();

  const note = (key: string, s: SimState) => {
    for (const g of goals) if (evalAll(g.require, s, config, content)) { goalKeys.get(g.id)!.add(key); if (!goalHit.has(g.id)) goalHit.set(g.id, key); }
    for (const q of Object.values(content.quests)) if (q.complete.length > 0 && evalAll(q.complete, s, config, content)) questDone.add(q.id);
    for (const id of Object.keys(s.clues)) cluesSeen.add(id);
    if (s.conversation) {
      const d = content.dialogues[s.conversation.dialogueId];
      const node = d?.nodes[s.conversation.node];
      if (d && node) {
        seenNodes.add(`${d.id}/${node.id}`);
        node.choices.forEach((c, i) => { if (evalAll(c.if, s, config, content)) seenChoices.add(`${d.id}/${node.id}#${i}`); });
      }
    }
  };
  note(rootKey, base);

  const add = (from: string, next: SimState, via: string, phase: number): void => {
    const key = keyOf(next, phase, withTime, itemMax);
    (edges.get(from) ?? edges.set(from, []).get(from)!).push(key);
    const known = nodes.get(key);
    if (known) {
      // The same situation, but richer: keep that version and look at what it can do again.
      if (rich(next) > known.credits) {
        // Keep the shortest route (a parent is always shallower than its child, so routes cannot loop back on themselves).
        const shorter = nodes.get(from)!.depth + 1 < known.depth;
        nodes.set(key, { ...known, json: JSON.stringify(next), credits: rich(next), ...(shorter ? { parent: from, via, depth: nodes.get(from)!.depth + 1 } : {}) });
        queue.push(key);
      }
      return;
    }
    if (nodes.size >= maxStates) { truncated = true; return; }
    nodes.set(key, { json: JSON.stringify(next), parent: from, via, phase, credits: rich(next), depth: nodes.get(from)!.depth + 1 });
    queue.push(key);
    note(key, next);
  };

  for (let head = 0; head < queue.length; head++) {
    const key = queue[head]!;
    const node = nodes.get(key)!;
    const state = JSON.parse(node.json) as SimState;
    const step = (via: string, run: (ctx: Ctx) => boolean | void, phase = node.phase): void => {
      const next = deepClone(state);
      if (run(ctxOf(next)) === false) return;
      add(key, next, via, phase);
    };

    if (state.conversation) {
      const view = dialogueView(state, content, config);
      if (!view) continue;
      for (const c of view.choices) step(`say "${c.text}"`, (ctx) => chooseOption(ctx, c.index));
      if (view.canPresent) for (const id of Object.keys(state.clues)) step(`show ${id}`, (ctx) => presentClue(ctx, id));
      if (view.canLeave) step("leave the conversation", (ctx) => endConversation(ctx));
      continue;
    }

    const tiles = reachableTiles(aw, state);
    for (const n of aw.npcs) {
      if (!reachable(tiles, aw, n.x, n.y)) continue;
      step(`talk to ${n.id}`, (ctx) => startConversation(ctx, n.dialogue));
    }
    for (const t of aw.terminals) {
      const def = content.terminals[t.id];
      if (!def || state.terminals[t.id]?.solved || !reachable(tiles, aw, t.x, t.y)) continue;
      const bypass = def.bypass.length > 0 && evalAll(def.bypass, state, config, content);
      const seen = terminalSeen.get(t.id);
      if (seen && bypass) seen.bypass = true;
      if (seen && outcomeHolds(def.onSolve, state) === true) seen.alternative = true;
      if (bypass) step(`open ${t.id} with its override`, (ctx) => completeTerminal(ctx, t.id, "bypass"));
      if (puzzleOk.get(t.id)) step(`solve the ${t.id} puzzle`, (ctx) => completeTerminal(ctx, t.id, "puzzle"));
    }
    for (const p of aw.pickups) {
      const effect = pickupEffect(p.grant);
      if (!effect || state.flags[`picked_${p.id}`] || !reachable(tiles, aw, p.x, p.y)) continue;
      step(`take ${p.id}`, (ctx) => {
        ctx.state.flags[`picked_${p.id}`] = true;
        applyEffects([effect], ctx.state, ctx.events, config, content);
      });
    }
    if (withTime) {
      PHASES.forEach((ph, i) => {
        if (i !== node.phase) step(`wait until ${ph.name}`, (ctx) => { ctx.state.tick = tickAt(config, ph.day, ph.minute); }, i);
      });
    }
  }

  const pathTo = (key: string): string[] => {
    const out: string[] = [];
    for (let k: string | null = key; k !== null; k = nodes.get(k)!.parent) {
      const n = nodes.get(k)!;
      if (n.parent !== null) out.push(n.via);
    }
    return out.reverse();
  };

  const findings: Finding[] = [];
  const say = (severity: Finding["severity"], kind: string, message: string, route?: string[]) => findings.push({ severity, kind, message, ...(route ? { route } : {}) });
  /** A "never" answer is an error only if the search was complete; otherwise it is just a warning. */
  const sure = (): Finding["severity"] => (truncated ? "warning" : "error");

  // 1. Goals.
  const goalReports = goals.map((g) => {
    const hit = goalHit.get(g.id);
    if (!hit) say(sure(), "goal-unreachable", `goal "${g.name}" can never be reached from a fresh start${truncated ? " (the search was cut short, so this is not proof)" : ""}`);
    return { id: g.id, reachable: hit !== undefined, route: hit ? pathTo(hit) : null };
  });

  // 2. Soft locks: reachable states from which a goal cannot be reached any more.
  if (!truncated) {
    const reverse = new Map<string, string[]>();
    for (const [from, tos] of edges) for (const to of tos) (reverse.get(to) ?? reverse.set(to, []).get(to)!).push(from);
    for (const g of goals) {
      const can = new Set<string>(goalKeys.get(g.id));
      const stack = [...can];
      while (stack.length > 0) for (const p of reverse.get(stack.pop()!) ?? []) if (!can.has(p)) { can.add(p); stack.push(p); }
      if (can.size === 0) continue; // unreachable goals are reported above
      const stuck = [...nodes.keys()].filter((k) => !can.has(k));
      if (stuck.length > 0) {
        const shortest = stuck.map((k) => pathTo(k)).sort((a, b) => a.length - b.length)[0]!;
        say("error", "soft-lock", `${stuck.length} reachable situation(s) can never reach "${g.name}" again: a soft lock. Shortest way in:`, shortest);
      }
    }
  }

  // 3. Critical terminals: at least two distinct ways through (PUZ-1).
  const terminals: TerminalReport[] = critical.map((t) => {
    const seen = terminalSeen.get(t.id)!;
    const puzzle = puzzleOk.get(t.id) ?? false;
    const routes = Number(puzzle) + Number(seen.bypass) + Number(seen.alternative);
    if (routes < 2) say(sure(), "single-route", `critical terminal "${t.id}" has ${routes} way(s) through; it needs at least two (a puzzle, a code or pass, another source): ${puzzle ? "puzzle" : "no solvable puzzle"}, ${seen.bypass ? "a bypass" : "no reachable bypass"}, ${seen.alternative ? "another source" : "no other source"}`);
    return { id: t.id, critical: true, puzzle, bypass: seen.bypass, alternative: seen.alternative, routes };
  });

  // 4. Dead content.
  for (const q of Object.values(content.quests)) {
    if (!questDone.has(q.id)) say(truncated ? "warning" : "error", "quest-impossible", `quest "${q.title}" can never be completed${truncated ? " (search cut short)" : ""}`);
  }
  const usedClues = new Set(Object.values(content.dialogues).flatMap((d) => JSON.stringify(d).match(/"give_clue":\{"id":"([^"]+)"/g) ?? []).map((m) => /"id":"([^"]+)"/.exec(m)![1]!));
  for (const id of usedClues) if (!cluesSeen.has(id)) say("warning", "clue-never-given", `clue "${id}" is given by a conversation that can never be reached on this map`);
  const npcDialogues = new Set(aw.npcs.map((n) => n.dialogue));
  for (const dId of npcDialogues) {
    const d = content.dialogues[dId];
    if (!d) continue;
    for (const node of Object.values(d.nodes)) {
      if (!seenNodes.has(`${d.id}/${node.id}`)) { say("warning", "node-never-reached", `${d.id}: the node "${node.id}" is never reached by any player on this map`); continue; }
      node.choices.forEach((c, i) => {
        if (!seenChoices.has(`${d.id}/${node.id}#${i}`)) say("warning", "option-never-offered", `${d.id}: option “${c.text}” (in "${node.id}") is never offered in any reachable situation`);
      });
    }
  }
  if (truncated) say("info", "truncated", `stopped after ${maxStates} abstract states: raise the limit or simplify; "never" answers are not proof`);

  return { map: mapId, states: nodes.size, truncated, goals: goalReports, terminals, findings };
}

/** Checks every map that has goals (maps without goals are skipped: there is nothing to prove about them yet). */
export function checkSolvability(
  worlds: Record<string, World>, content: Content, config: Config, goals: readonly GoalDef[], start: StartState, options: CheckOptions = {},
): Report {
  const maps = Object.keys(worlds).sort().filter((id) => goals.some((g) => g.map === id)).map((id) => checkMap(id, worlds[id]!, content, config, goals.filter((g) => g.map === id), start, options));
  const all = maps.flatMap((m) => m.findings);
  return { maps, errors: all.filter((f) => f.severity === "error").length, warnings: all.filter((f) => f.severity === "warning").length };
}

export function formatReport(r: Report): string {
  const lines: string[] = [];
  for (const m of r.maps) {
    lines.push(`map ${m.map}: ${m.states} abstract states${m.truncated ? " (search cut short)" : ""}`);
    for (const g of m.goals) lines.push(`  goal ${g.id}: ${g.reachable ? `reachable in ${g.route!.length} steps` : "NOT reachable"}`);
    for (const g of m.goals) if (g.route) lines.push(`    ${g.route.join(" -> ")}`);
    for (const t of m.terminals) lines.push(`  critical terminal ${t.id}: ${t.routes} way(s) (puzzle ${t.puzzle ? "yes" : "no"}, bypass ${t.bypass ? "yes" : "no"}, other source ${t.alternative ? "yes" : "no"})`);
    for (const f of m.findings) {
      lines.push(`  ${f.severity.toUpperCase()} [${f.kind}] ${f.message}`);
      if (f.route) lines.push(`    ${f.route.join(" -> ")}`);
    }
  }
  lines.push(`${r.errors} error(s), ${r.warnings} warning(s)`);
  return lines.join("\n");
}
