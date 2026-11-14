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
  chooseOption, completeTerminal, createInitialState, dialogueView, endConversation, evalAll, gameTimeAt, pickupAvailable, pickupEffects, presentClue, equipAugment, unequipAugment, equipRefusal,
  puzzleModule, applyEffects, startConversation, spawnPoint,
  type Config, type Content, type Ctx, type SimState, type World,
} from "@qh/core";
import type { GoalDef, StartState } from "./assemble.ts";

export interface CheckOptions {
  /** Most abstract states to explore per map before giving up (default 12,000). */
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
  /** Quests whose completion holds in some reachable state of this map. */
  questsDone: string[];
}

export interface Report {
  maps: MapReport[];
  /** Findings about the whole game rather than one map (a quest no map can complete). */
  findings: Finding[];
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
/**
 * The facts that can matter (a "cone of influence"). A fact is *needed* if a goal, a quest's completion, a terminal or a
 * pickup's guard reads it, or if something that produces a needed fact reads it (a conversation that gives a needed
 * clue needs everything its options and entry points read). Anything else, such as a neighbour's mood or a rumour
 * nobody acts on, cannot change what the player can do, so two situations that differ only in such facts are the
 * same situation. This is what keeps independent conversations from multiplying the search. Facts are written
 * "flag:x", "clue:x", "item:x", "aug:x", "pass:x", "debt:x", "trust:x".
 */
interface Needed { facts: Set<string>; /** Clues whose verified/disproved status some rule reads (for the rest, knowing the clue is enough). */ statusClues: Set<string>; alert: boolean; relevantDialogues: Set<string> }

const REAL_ALERT = /"alert_gte"/;

function readsIn(text: string): Set<string> {
  const out = new Set<string>();
  const grab = (re: RegExp, prefix: string) => { for (const m of text.matchAll(re)) out.add(`${prefix}:${m[1]}`); };
  grab(/"flag":"([^"]+)"/g, "flag"); grab(/"flag_eq":\["([^"]+)"/g, "flag"); grab(/"requires":"flag:([^"]+)"/g, "flag");
  grab(/"has_clue":"([^"]+)"/g, "clue"); grab(/"clue_state":\["([^"]+)"/g, "clue"); grab(/"requires":"clue:([^"]+)"/g, "clue");
  grab(/"clue":"([^"*][^"]*)"/g, "clue");
  grab(/"has_item":"([^"]+)"/g, "item"); grab(/"has_item":\["([^"]+)"/g, "item"); grab(/"requires":"item:([^"]+)"/g, "item");
  grab(/"has_augment":"([^"]+)"/g, "aug"); grab(/"augment_equipped":"([^"]+)"/g, "aug"); grab(/"requires":"augment:([^"]+)"/g, "aug");
  grab(/"has_pass":"([^"]+)"/g, "pass"); grab(/"in_debt":"([^"]+)"/g, "debt"); grab(/"trust_gte":\["([^"]+)"/g, "trust");
  return out;
}

function producesIn(text: string, content: Content): Set<string> {
  const out = new Set<string>();
  const grab = (re: RegExp, prefix: string) => { for (const m of text.matchAll(re)) out.add(`${prefix}:${m[1]}`); };
  grab(/"set_flag":\["([^"]+)"/g, "flag"); grab(/"give_clue":\{"id":"([^"]+)"/g, "clue");
  grab(/"(?:add_item|remove_item)":\["([^"]+)"/g, "item"); grab(/"(?:grant_augment|revoke_augment)":"([^"]+)"/g, "aug");
  grab(/"give_pass":\{"id":"([^"]+)"/g, "pass"); grab(/"revoke_pass":"([^"]+)"/g, "pass");
  grab(/"(?:take_loan|repay_loan)":\["([^"]+)"/g, "debt"); grab(/"adjust_trust":\["([^"]+)"/g, "trust");
  for (const m of text.matchAll(/"use_service":"([^"]+)"/g)) {
    const sv = content.services[m[1]!];
    if (sv) for (const f of producesIn(JSON.stringify(sv.effects), content)) out.add(f);
    out.add(`flag:service_done_${m[1]}`);
  }
  return out;
}

function neededFacts(content: Content, goals: readonly GoalDef[], world: World): Needed {
  const text = JSON.stringify([content.dialogues, content.services, content.terminals, content.quests, content.reactions, goals, world.pickups]);
  const here = new Set(world.npcs.map((n) => n.dialogue));
  const terminalsHere = world.terminals.map((t) => content.terminals[t.id]).filter((t): t is NonNullable<typeof t> => t !== undefined);
  const producers: { name: string; produces: Set<string>; reads: Set<string> }[] = [
    ...Object.values(content.dialogues).filter((d) => here.has(d.id)).map((d) => ({ name: `dialogue:${d.id}`, produces: producesIn(JSON.stringify(d), content), reads: readsIn(JSON.stringify(d)) })),
    ...Object.values(content.services).map((v) => ({ name: `service:${v.id}`, produces: producesIn(JSON.stringify(v.effects), content), reads: readsIn(JSON.stringify(v.requires)) })),
    ...Object.values(content.reactions).map((r) => ({ name: `reaction:${r.id}`, produces: producesIn(JSON.stringify(r.effects), content), reads: readsIn(JSON.stringify(r.if ?? [])) })),
    ...world.pickups.map((p) => ({ name: `pickup:${p.id}`, produces: new Set([...p.grant.split("+")].map((g) => { const [k, id] = g.split(":"); return `${k === "augment" ? "aug" : k}:${id}`; })), reads: readsIn(JSON.stringify({ requires: p.requires ?? "" })) })),
  ];
  const needed = new Set<string>([
    ...readsIn(JSON.stringify(goals)), ...readsIn(JSON.stringify(Object.values(content.quests).map((q) => q.complete))),
    // Terminals unlock doors and so change where the player can go: their guards always matter.
    ...readsIn(JSON.stringify(terminalsHere.map((t) => [t.bypass, t.puzzleRequires ?? []]))),
  ]);
  for (const t of terminalsHere) for (const f of producesIn(JSON.stringify(t.onSolve), content)) needed.add(f);
  for (let grew = true; grew;) {
    grew = false;
    for (const pr of producers) {
      if (![...pr.produces].some((f) => needed.has(f))) continue;
      for (const f of pr.reads) if (!needed.has(f)) { needed.add(f); grew = true; }
    }
  }
  const relevant = new Set(producers.filter((pr) => pr.name.startsWith("dialogue:") && [...pr.produces].some((f) => needed.has(f))).map((pr) => pr.name.slice(9)));
  const statusClues = new Set([...text.matchAll(/"clue_state":\["([^"]+)"/g)].map((m) => m[1]!));
  return { facts: needed, statusClues, alert: REAL_ALERT.test(text), relevantDialogues: relevant };
}

function keyOf(s: SimState, phase: number, withTime: boolean, itemCapacity: number, need: Needed): string {
  const sorted = <T>(o: Record<string, T>) => Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify([
    sorted(s.flags).filter(([k]) => need.facts.has(`flag:${k}`) || k.startsWith("picked_") || k.startsWith("reaction_done_")),
    sorted(s.clues).filter(([id]) => need.facts.has(`clue:${id}`)).map(([id, c]) => [id, need.statusClues.has(id) ? c.status : ""]),
    sorted(s.inventory.items).filter(([id]) => need.facts.has(`item:${id}`)).map(([id, n]) => [id, Math.min(n, itemCapacity)]),
    s.passes.filter((p) => need.facts.has(`pass:${p.id}`)).map((p) => [p.id, p.origin, p.level]).sort(),
    s.augments.owned.filter((a) => need.facts.has(`aug:${a}`)).sort(), s.augments.equipped.filter((a) => need.facts.has(`aug:${a}`)).sort(),
    s.loans.debts.filter((d) => need.facts.has(`debt:${d.lender}`)).map((d) => d.lender).sort(), sorted(s.district).map(([k, v]) => [k, sorted(v)]),
    sorted(s.trust).filter(([npc]) => need.facts.has(`trust:${npc}`)), need.alert ? s.alert.level : 0,
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

/**
 * A fast copy of the parts of the state that rules can change. (A JSON round trip of the whole state is far slower, and
 * the checker copies state millions of times.) Anything not listed here, such as the people's positions, is never
 * changed by what the checker does, so it is shared.
 */
function cloneState(s: SimState): SimState {
  const entries = <T extends object>(o: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { ...v }]));
  return {
    ...s,
    doors: entries(s.doors),
    flags: { ...s.flags },
    clues: entries(s.clues),
    inventory: { credits: s.inventory.credits, items: { ...s.inventory.items } },
    augments: { ...s.augments, owned: [...s.augments.owned], equipped: [...s.augments.equipped] },
    assist: { ...s.assist },
    notebook: { links: s.notebook.links.map((l) => [...l] as [string, string]) },
    visited: [...s.visited],
    met: [...s.met],
    district: Object.fromEntries(Object.entries(s.district).map(([k, v]) => [k, { ...v }])),
    metrics: { ...s.metrics },
    loans: { ...s.loans, debts: s.loans.debts.map((d) => ({ ...d })) },
    passes: s.passes.map((p) => ({ ...p })),
    demerits: { ...s.demerits, last: { ...s.demerits.last } },
    trust: { ...s.trust },
    trustLog: [...s.trustLog],
    locker: { credits: s.locker.credits, items: { ...s.locker.items }, passes: s.locker.passes.map((p) => ({ ...p })) },
    terminals: Object.fromEntries(Object.entries(s.terminals).map(([k, v]) => [k, { ...v, values: [...v.values] }])),
    conversation: s.conversation ? { ...s.conversation } : null,
    alert: { ...s.alert },
    player: { ...s.player, intent: { ...s.player.intent } },
    messages: [...s.messages],
    lastKnown: s.lastKnown ? { ...s.lastKnown } : null,
  };
}

type ConvAction = { kind: "choose"; index: number } | { kind: "present"; id: string } | { kind: "leave" };

function applyConvAction(ctx: Ctx, a: ConvAction): void {
  if (a.kind === "choose") chooseOption(ctx, a.index);
  else if (a.kind === "present") presentClue(ctx, a.id);
  else endConversation(ctx);
}

/**
 * Plays one conversation out completely. The world is frozen while a conversation is open, so nothing else can
 * happen during it, which makes it exact to treat the whole conversation as one step of the game: this explores every
 * path through it (every choice, showing any known clue, leaving) and returns each distinct way it can end, with the
 * words said to get there. `visit` sees every state inside it (to record which nodes and options were ever offered).
 */
function exploreConversation(
  start: SimState, dialogueId: string, content: Content, config: Config, world: World, cap: number, track: ReadonlySet<string>,
  visit?: (s: SimState) => void, limit = 3000,
): { ends: { state: SimState; path: string[]; actions: ConvAction[] }[]; hitLimit: boolean } {
  const ends: { state: SimState; path: string[]; actions: ConvAction[] }[] = [];
  const endIndex = new Map<string, number>();
  // Money never hurts, so of two situations that differ only in credits the richer one is the one to explore.
  const seen = new Map<string, number>();
  // Two situations inside a conversation are the same unless they differ in a fact it reads or the rest of the game needs.
  const localKey = (s: SimState) => JSON.stringify([
    Object.entries(s.flags).filter(([k]) => track.has(`flag:${k}`)).sort(), Object.entries(s.clues).filter(([k]) => track.has(`clue:${k}`)).map(([id, c]) => [id, c.status]).sort(),
    Object.entries(s.inventory.items).filter(([k]) => track.has(`item:${k}`)).sort(), Object.entries(s.trust).filter(([k]) => track.has(`trust:${k}`)).sort(),
    s.conversation, s.passes.filter((x) => track.has(`pass:${x.id}`)).map((x) => x.id), s.augments.owned.filter((a) => track.has(`aug:${a}`)), s.augments.equipped.filter((a) => track.has(`aug:${a}`)),
    s.loans.debts.filter((d) => track.has(`debt:${d.lender}`)).map((d) => d.lender), Object.entries(s.district),
  ]);
  const ctxOf = (st: SimState): Ctx => ({ state: st, config, world, content, events: [], commands: [] });
  const first = cloneState(start);
  if (!startConversation(ctxOf(first), dialogueId)) return { ends, hitLimit: false };
  const queue: { state: SimState; path: string[]; actions: ConvAction[] }[] = [{ state: first, path: [], actions: [] }];
  let hitLimit = false;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const s = cur.state;
    if (!s.conversation) {
      const ek = localKey(s);
      const at = endIndex.get(ek);
      if (at === undefined) { endIndex.set(ek, ends.length); ends.push(cur); }
      else if (s.inventory.credits > ends[at]!.state.inventory.credits) ends[at] = cur;
      continue;
    }
    const key = localKey(s);
    const money = Math.min(s.inventory.credits, cap);
    const before = seen.get(key);
    if (before !== undefined && before >= money) continue;
    if (before === undefined && seen.size >= limit) { hitLimit = true; continue; }
    seen.set(key, money);
    visit?.(s);
    const view = dialogueView(s, content, config);
    if (!view) continue;
    const go = (label: string, action: ConvAction) => {
      const n = cloneState(s);
      applyConvAction(ctxOf(n), action);
      queue.push({ state: n, path: [...cur.path, label], actions: [...cur.actions, action] });
    };
    for (const c of view.choices) go(`say "${c.text}"`, { kind: "choose", index: c.index });
    if (view.canPresent) for (const id of Object.keys(s.clues)) go(`show ${id}`, { kind: "present", id });
    if (view.canLeave) go("leave", { kind: "leave" });
  }
  return { ends, hitLimit };
}

/**
 * Dead-content check for a conversation outside the cone of influence: explore it alone, twice, from a plain start and
 * from a start where the player already holds every clue, item and augment and plenty of money (so an option that
 * needs something from elsewhere still counts as offerable). An option that appears in neither is never offered.
 */
function sandboxDialogue(dialogueId: string, base: SimState, content: Content, config: Config, world: World, cap: number): { nodes: Set<string>; choices: Set<string>; clues: Set<string> } {
  const nodes = new Set<string>();
  const choices = new Set<string>();
  const clues = new Set<string>();
  const rich = cloneState(base);
  for (const id of Object.keys(content.clues)) rich.clues[id] ??= { learnedTick: 0, from: "sandbox", status: "unverified" };
  for (const id of Object.keys(content.items)) rich.inventory.items[id] ??= 1;
  rich.augments.owned = Object.keys(content.augments);
  rich.inventory.credits = cap;
  const visit = (st: SimState) => {
    for (const id of Object.keys(st.clues)) clues.add(id);
    const d = content.dialogues[st.conversation!.dialogueId];
    const node = d?.nodes[st.conversation!.node];
    if (!d || !node) return;
    nodes.add(`${d.id}/${node.id}`);
    node.choices.forEach((c, i) => { if (evalAll(c.if, st, config, content)) choices.add(`${d.id}/${node.id}#${i}`); });
  };
  const track = readsIn(JSON.stringify(content.dialogues[dialogueId] ?? {}));
  for (const start of [base, rich]) {
    // Visit again after each way the last visit could end (an NPC greets a returning visitor differently), up to three visits.
    let frontier: SimState[] = [start];
    for (let visitNo = 0; visitNo < 3 && frontier.length > 0; visitNo++) {
      const next: SimState[] = [];
      for (const from of frontier.slice(0, 40)) next.push(...exploreConversation(from, dialogueId, content, config, world, cap, track, visit, 4000).ends.map((e) => e.state));
      frontier = next;
    }
  }
  return { nodes, choices, clues };
}

export function checkMap(
  mapId: string, world: World, content: Content, config: Config, goals: readonly GoalDef[], start: StartState, options: CheckOptions = {},
): MapReport {
  const maxStates = options.maxStates ?? 12_000;
  const cap = creditCap(content, goals, start);
  const itemMax = itemCap(content, start);
  const need = neededFacts(content, goals, world);
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
  const terminalSeen = new Map(critical.map((t) => [t.id, { puzzle: false, bypass: false, alternative: false }]));

  interface Node { json: string; parent: string | null; via: string; phase: number; credits: number; depth: number }
  const nodes = new Map<string, Node>();
  const edges = new Map<string, string[]>();
  const convPlans = new Map<string, { actions: ConvAction[]; path: string[] }[]>();
  const dialogueReads = new Map<string, Set<string>>();
  const dialogueReadsOf = (id: string): Set<string> => {
    let r = dialogueReads.get(id);
    if (!r) { r = new Set([...readsIn(JSON.stringify(content.dialogues[id] ?? {})), ...serviceReads]); dialogueReads.set(id, r); }
    return r;
  };
  const serviceReads = readsIn(JSON.stringify(Object.values(content.services).map((v) => v.requires)));
  /** Everything that decides how a conversation can go from here: the facts it reads, money, the time of day. */
  const convProjection = (st: SimState, dialogueId: string): string => {
    const r = dialogueReadsOf(dialogueId);
    return JSON.stringify([
      [...r].sort().filter((f) => f.startsWith("flag:")).map((f) => [f, st.flags[f.slice(5)] ?? null]),
      [...r].sort().filter((f) => f.startsWith("clue:")).map((f) => [f, st.clues[f.slice(5)]?.status ?? null]),
      [...r].sort().filter((f) => f.startsWith("item:")).map((f) => [f, Math.min(st.inventory.items[f.slice(5)] ?? 0, itemMax)]),
      [...r].sort().filter((f) => f.startsWith("trust:")).map((f) => [f, st.trust[f.slice(6)] ?? 0]),
      [...r].sort().filter((f) => f.startsWith("aug:")).map((f) => [f, st.augments.owned.includes(f.slice(4)), st.augments.equipped.includes(f.slice(4))]),
      [...r].sort().filter((f) => f.startsWith("pass:")).map((f) => [f, st.passes.some((p) => p.id === f.slice(5))]),
      [...r].sort().filter((f) => f.startsWith("debt:")).map((f) => [f, st.loans.debts.some((d) => d.lender === f.slice(5))]),
      Object.entries(st.flags).filter(([k]) => k.startsWith("service_done_")).sort(), st.inventory.credits > 5000 ? 5000 : st.inventory.credits, st.tick,
      Object.entries(st.district), st.alert.level, st.arrestCount > 0,
    ]);
  };
  const rootKey = keyOf(base, 0, withTime, itemMax, need);
  nodes.set(rootKey, { json: JSON.stringify(base), parent: null, via: "start", phase: 0, credits: rich(base), depth: 0 });
  const queue: string[] = [rootKey];
  let truncated = false;
  /** Situations with a successor the search had no room to keep: what lies beyond them is unknown, not stuck. */
  const dropped = new Set<string>();

  const goalHit = new Map<string, string>(); // goal id -> first state key where it holds
  const goalKeys = new Map<string, Set<string>>(goals.map((g) => [g.id, new Set()]));
  const questDone = new Set<string>();
  const cluesSeen = new Set<string>();
  const seenChoices = new Set<string>();
  const seenNodes = new Set<string>();

  const note = (key: string | null, s: SimState) => {
    if (key !== null) for (const g of goals) if (evalAll(g.require, s, config, content)) { goalKeys.get(g.id)!.add(key); if (!goalHit.has(g.id)) goalHit.set(g.id, key); }
    if (key !== null) for (const q of Object.values(content.quests)) if (q.complete.length > 0 && evalAll(q.complete, s, config, content)) questDone.add(q.id);
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
    for (const id of Object.keys(next.clues)) cluesSeen.add(id);
    const key = keyOf(next, phase, withTime, itemMax, need);
    (edges.get(from) ?? edges.set(from, []).get(from)!).push(key);
    const known = nodes.get(key);
    if (known) {
      // The same situation, but richer: keep that version and look at what it can do again.
      if (rich(next) > known.credits) {
        // Keep the shortest route (a parent is always shallower than its child, so routes cannot loop back on themselves).
        const shorter = nodes.get(from)!.depth + 1 < known.depth;
        nodes.set(key, { ...known, json: JSON.stringify(next), credits: rich(next), ...(shorter ? { parent: from, via, depth: nodes.get(from)!.depth + 1 } : {}) });
        queue.push(key);
        note(key, next); // a richer version may satisfy what the poorer one did not (a goal that needs credits)
      }
      return;
    }
    if (nodes.size >= maxStates) { truncated = true; dropped.add(from); return; }
    nodes.set(key, { json: JSON.stringify(next), parent: from, via, phase, credits: rich(next), depth: nodes.get(from)!.depth + 1 });
    queue.push(key);
    note(key, next);
  };

  for (let head = 0; head < queue.length; head++) {
    const key = queue[head]!;
    const node = nodes.get(key)!;
    const state = JSON.parse(node.json) as SimState;
    const step = (via: string, run: (ctx: Ctx) => boolean | void, phase = node.phase): void => {
      const next = cloneState(state);
      if (run(ctxOf(next)) === false) return;
      add(key, next, via, phase);
    };

    const tiles = reachableTiles(aw, state);
    for (const n of aw.npcs) {
      if (!reachable(tiles, aw, n.x, n.y)) continue;
      // A conversation is one step: every way it can end, with the words said (the world is frozen while it lasts).
      // Plans are cached by everything the conversation can read, so a situation seen before is replayed, not re-explored.
      const pk = `${n.dialogue}|${convProjection(state, n.dialogue)}`;
      let plans = convPlans.get(pk);
      if (!plans) {
        const played = exploreConversation(state, n.dialogue, content, config, aw, cap, new Set([...need.facts, ...(dialogueReadsOf(n.dialogue))]), (st) => note(null, st));
        if (played.hitLimit) truncated = true;
        plans = played.ends.map((e) => ({ actions: e.actions, path: e.path }));
        convPlans.set(pk, plans);
      }
      for (const plan of plans) {
        const next = cloneState(state);
        const c = ctxOf(next);
        startConversation(c, n.dialogue);
        for (const a of plan.actions) applyConvAction(c, a);
        add(key, next, `talk to ${n.id}${plan.path.filter((p) => p !== "leave").map((p) => ` -> ${p}`).join("")}`, node.phase);
      }
    }
    for (const t of aw.terminals) {
      const def = content.terminals[t.id];
      if (!def || state.terminals[t.id]?.solved || !reachable(tiles, aw, t.x, t.y)) continue;
      const bypass = def.bypass.length > 0 && evalAll(def.bypass, state, config, content);
      const seen = terminalSeen.get(t.id);
      if (seen && bypass) seen.bypass = true;
      if (seen && outcomeHolds(def.onSolve, state) === true) seen.alternative = true;
      if (bypass) step(`open ${t.id} with its override`, (ctx) => completeTerminal(ctx, t.id, "bypass"));
      // The puzzle is a way through only when the player knows what it needs (a code lock's code comes from the world).
      const knows = evalAll(def.puzzleRequires ?? [], state, config, content);
      if (seen && puzzleOk.get(t.id) && knows) seen.puzzle = true;
      if (puzzleOk.get(t.id) && knows) step(`solve the ${t.id} puzzle`, (ctx) => completeTerminal(ctx, t.id, "puzzle"));
    }
    for (const p of aw.pickups) {
      const effects = pickupEffects(p.grant);
      if (!effects || !pickupAvailable(p, state) || !reachable(tiles, aw, p.x, p.y)) continue;
      step(`${p.label ? p.label.toLowerCase() : `take ${p.id}`}`, (ctx) => {
        ctx.state.flags[`picked_${p.id}`] = true;
        applyEffects(effects, ctx.state, ctx.events, config, content);
      });
    }
    // Wearing and removing augments (some things can only be done while wearing one).
    for (const id of state.augments.owned) {
      if (state.augments.equipped.includes(id)) step(`take off ${id.replace(/_/g, " ")}`, (ctx) => unequipAugment(ctx, id));
      else if (equipRefusal(state, content, id) === null) step(`wear ${id.replace(/_/g, " ")}`, (ctx) => equipAugment(ctx, id));
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

  // 2. Soft locks: reachable states from which a goal cannot be reached any more. This stays sound when the search was
  // cut short: a situation whose successors were not all kept counts as "might reach the goal", so only situations
  // explored completely, none of whose futures lead to a goal, are reported.
  {
    const reverse = new Map<string, string[]>();
    for (const [from, tos] of edges) for (const to of tos) (reverse.get(to) ?? reverse.set(to, []).get(to)!).push(from);
    for (const g of goals) {
      const can = new Set<string>([...goalKeys.get(g.id)!, ...dropped]);
      const stack = [...can];
      while (stack.length > 0) for (const p of reverse.get(stack.pop()!) ?? []) if (!can.has(p)) { can.add(p); stack.push(p); }
      if (goalKeys.get(g.id)!.size === 0) continue; // unreachable goals are reported above
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
    const puzzle = seen.puzzle;
    const routes = Number(puzzle) + Number(seen.bypass) + Number(seen.alternative);
    if (routes < 2) say(sure(), "single-route", `critical terminal "${t.id}" has ${routes} way(s) through; it needs at least two (a puzzle, a code or pass, another source): ${puzzle ? "puzzle" : "no solvable puzzle"}, ${seen.bypass ? "a bypass" : "no reachable bypass"}, ${seen.alternative ? "another source" : "no other source"}`);
    return { id: t.id, critical: true, puzzle, bypass: seen.bypass, alternative: seen.alternative, routes };
  });

  // 4. Dead content.
  for (const q of Object.values(content.quests)) {
    if (!questDone.has(q.id)) say(truncated ? "warning" : "error", "quest-impossible", `quest "${q.title}" can never be completed${truncated ? " (search cut short)" : ""}`);
  }
  const npcDialogues = new Set(aw.npcs.map((n) => n.dialogue));
  // Conversations outside the cone of influence were not explored in full by the main search; explore them alone.
  for (const dId of npcDialogues) {
    if (!content.dialogues[dId] || need.relevantDialogues.has(dId)) continue;
    const sb = sandboxDialogue(dId, base, content, config, aw, cap);
    for (const n of sb.nodes) seenNodes.add(n);
    for (const c of sb.choices) seenChoices.add(c);
    for (const c of sb.clues) cluesSeen.add(c);
  }
  const usedClues = new Set([...npcDialogues].flatMap((id) => JSON.stringify(content.dialogues[id] ?? {}).match(/"give_clue":\{"id":"([^"]+)"/g) ?? []).map((m) => /"id":"([^"]+)"/.exec(m)![1]!));
  for (const id of usedClues) if (!cluesSeen.has(id)) say("warning", "clue-never-given", `clue "${id}" is given by a conversation that can never be reached on this map`);
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

  return { map: mapId, states: nodes.size, truncated, goals: goalReports, terminals, findings, questsDone: [...questDone] };
}

/** Checks every map that has goals (maps without goals are skipped: there is nothing to prove about them yet). */
export function checkSolvability(
  worlds: Record<string, World>, content: Content, config: Config, goals: readonly GoalDef[], start: StartState, options: CheckOptions = {},
): Report {
  const maps = Object.keys(worlds).sort().filter((id) => goals.some((g) => g.map === id)).map((id) => checkMap(id, worlds[id]!, content, config, goals.filter((g) => g.map === id), start, options));
  // Quests belong to the game, not to a map: one is impossible only if no checked map can complete it.
  for (const m of maps) m.findings = m.findings.filter((f) => f.kind !== "quest-impossible");
  const done = new Set(maps.flatMap((m) => m.questsDone));
  const incomplete = maps.some((m) => m.truncated);
  const findings: Finding[] = Object.values(content.quests).filter((q) => !done.has(q.id)).map((q) => ({
    severity: incomplete ? "warning" : "error", kind: "quest-impossible",
    message: `quest "${q.title}" can never be completed on any map${incomplete ? " (a search was cut short)" : ""}`,
  }));
  const all = [...maps.flatMap((m) => m.findings), ...findings];
  return { maps, findings, errors: all.filter((f) => f.severity === "error").length, warnings: all.filter((f) => f.severity === "warning").length };
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
  for (const f of r.findings) lines.push(`${f.severity.toUpperCase()} [${f.kind}] ${f.message}`);
  lines.push(`${r.errors} error(s), ${r.warnings} warning(s)`);
  return lines.join("\n");
}
