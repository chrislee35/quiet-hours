/**
 * The full notebook (T2.12, CLU-2..5): everything the notebook screen shows is a pure function of the game state
 * and content, so it is tested without a screen.
 *
 *  - Entries and search: every clue the player knows, with its tags and links, filtered by text, status and tag.
 *  - Links: the player can link and unlink clues they know (their own cross-referencing, kept in the state);
 *    clues also carry links defined by the content ("contradicts", "updates", "supports"), shown only when the
 *    player knows both ends.
 *  - Conflicts (CLU-4): two known clues joined by a `contradicts` link are flagged as disagreeing, resolved when one of
 *    them is verified or disproved. The notebook never says *which* is right (CLU-5): reliability is not in any view.
 *  - Quest log: derived from quest definitions, clues and flags; nothing is stored.
 *  - Annotated map (CLU-3): places, people, zones and schedules appear as the player learns them.
 */
import type { Config } from "./config.ts";
import type { ClueDef, Content } from "./dialogue/types.ts";
import type { ClueStatus } from "./events.ts";
import { evalAll, type Condition } from "./rules.ts";
import type { SimState } from "./state.ts";
import type { World } from "./world.ts";

// ---- Entries, links, search -------------------------------------------------------------------

export type LinkKind = "supports" | "contradicts" | "updates";

export interface NotebookItem {
  clueId: string;
  text: string;
  from: string;
  status: ClueStatus;
  learnedTick: number;
  tags: string[];
  /** Links the content defines, where the player knows the other clue too. `from` says which way it points. */
  related: { clueId: string; kind: LinkKind; direction: "to" | "from" }[];
  /** Links the player made, as the other clue's id. */
  linked: string[];
}

export function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

const known = (state: Readonly<SimState>, id: string): boolean => state.clues[id] !== undefined;

export function notebookItems(state: Readonly<SimState>, content: Content): NotebookItem[] {
  return Object.entries(state.clues)
    .sort(([ai, a], [bi, b]) => a.learnedTick - b.learnedTick || (ai < bi ? -1 : 1))
    .map(([clueId, entry]) => {
      const def: ClueDef | undefined = content.clues[clueId];
      const out = (def?.links ?? []).filter((l) => known(state, l.to)).map((l) => ({ clueId: l.to, kind: l.kind, direction: "to" as const }));
      const back = Object.values(content.clues)
        .filter((c) => known(state, c.id) && c.links.some((l) => l.to === clueId))
        .flatMap((c) => c.links.filter((l) => l.to === clueId).map((l) => ({ clueId: c.id, kind: l.kind, direction: "from" as const })));
      return {
        clueId,
        text: def?.text ?? `(unknown clue ${clueId})`,
        from: entry.from,
        status: entry.status,
        learnedTick: entry.learnedTick,
        tags: def?.tags ?? [],
        related: [...out, ...back],
        linked: state.notebook.links.filter(([a, b]) => a === clueId || b === clueId).map(([a, b]) => (a === clueId ? b : a)),
      };
    });
}

export interface NotebookFilter {
  /** Matches the text, the source, the tags and the id; every word must match somewhere. */
  query?: string;
  status?: ClueStatus | "all";
  /** A tag kind ("place", "schedule", "zone", "person") or a whole tag ("place:pump4"). */
  tag?: string;
}

export function searchNotebook(items: readonly NotebookItem[], filter: NotebookFilter): NotebookItem[] {
  const words = (filter.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((it) => {
    if (filter.status && filter.status !== "all" && it.status !== filter.status) return false;
    if (filter.tag && !it.tags.some((t) => t === filter.tag || t.startsWith(`${filter.tag}:`))) return false;
    const hay = [it.text, it.from, it.clueId.replace(/_/g, " "), ...it.tags.map((t) => t.replace(/[:_]/g, " "))].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Tags in use among the clues the player knows, grouped by kind, for the filter chips. */
export function tagKinds(items: readonly NotebookItem[]): string[] {
  return [...new Set(items.flatMap((i) => i.tags.map((t) => t.split(":")[0]!)))].sort();
}

// ---- Conflicts --------------------------------------------------------------------------------

export interface Conflict {
  a: string;
  b: string;
  /** One of the two has been verified or disproved: the disagreement is settled. */
  resolved: boolean;
}

/** Pairs of known clues the content says contradict each other. Never says which is right. */
export function conflicts(state: Readonly<SimState>, content: Content): Conflict[] {
  const out = new Map<string, Conflict>();
  for (const c of Object.values(content.clues)) {
    if (!known(state, c.id)) continue;
    for (const l of c.links) {
      if (l.kind !== "contradicts" || !known(state, l.to)) continue;
      const [a, b] = pairKey(c.id, l.to);
      const settled = [a, b].some((id) => state.clues[id]!.status !== "unverified");
      out.set(`${a}|${b}`, { a, b, resolved: settled });
    }
  }
  return [...out.values()].sort((x, y) => (x.a + x.b < y.a + y.b ? -1 : 1));
}

/** Link two clues the player knows (their own cross-reference). Returns whether anything changed. */
export function linkClues(state: SimState, a: string, b: string): boolean {
  if (a === b || !known(state, a) || !known(state, b)) return false;
  const [x, y] = pairKey(a, b);
  if (state.notebook.links.some(([p, q]) => p === x && q === y)) return false;
  state.notebook.links.push([x, y]);
  return true;
}

export function unlinkClues(state: SimState, a: string, b: string): boolean {
  const [x, y] = pairKey(a, b);
  const before = state.notebook.links.length;
  state.notebook.links = state.notebook.links.filter(([p, q]) => !(p === x && q === y));
  return state.notebook.links.length !== before;
}

// ---- Quest log --------------------------------------------------------------------------------

export interface QuestStep {
  id: string;
  text: string;
  done: Condition[];
}

export interface QuestDef {
  id: string;
  title: string;
  summary: string;
  /** The quest appears in the log once these hold (empty: always). */
  start: Condition[];
  steps: QuestStep[];
  complete: Condition[];
  failed?: Condition[];
}

export type QuestState = "active" | "complete" | "failed";

export interface QuestView {
  id: string;
  title: string;
  summary: string;
  state: QuestState;
  steps: { text: string; done: boolean }[];
}

/** The quests the player knows about, derived from clues and flags. Nothing is stored. */
export function questLog(state: Readonly<SimState>, content: Content, config: Config): QuestView[] {
  const order: Record<QuestState, number> = { active: 0, failed: 1, complete: 2 };
  return Object.values(content.quests)
    .filter((q) => evalAll(q.start, state, config, content))
    .map((q): QuestView => {
      const complete = q.complete.length > 0 && evalAll(q.complete, state, config, content);
      const failed = !complete && (q.failed?.length ?? 0) > 0 && evalAll(q.failed, state, config, content);
      return {
        id: q.id,
        title: q.title,
        summary: q.summary,
        state: complete ? "complete" : failed ? "failed" : "active",
        steps: q.steps.map((s) => ({ text: s.text, done: complete || evalAll(s.done, state, config, content) })),
      };
    })
    .sort((a, b) => order[a.state] - order[b.state] || (a.id < b.id ? -1 : 1));
}

// ---- Annotated map ----------------------------------------------------------------------------

export interface MapNote {
  clueId: string;
  text: string;
  status: ClueStatus;
}

export interface MapPin {
  kind: "place" | "person" | "you";
  id: string;
  label: string;
  x: number;
  y: number;
  /** What the notebook says about it: the clues tagged with it (including schedules). */
  notes: MapNote[];
}

export interface AnnotatedMap {
  width: number;
  height: number;
  /** One string per row: "#" wall, "." floor. */
  walls: string[];
  /** Zones the player has been in or learned about, with the tiles they cover. */
  zones: { id: string; label: string; permission: number; tiles: [number, number][] }[];
  pins: MapPin[];
  /** Schedules the player knows that are not tied to a place on this map. */
  schedules: { id: string; label: string; notes: MapNote[] }[];
}

const pretty = (id: string): string => id.replace(/_/g, " ").replace(/\b./g, (c) => c.toUpperCase());

/** Clues the player holds that carry this tag. */
function notesFor(state: Readonly<SimState>, content: Content, tag: string): MapNote[] {
  return Object.values(content.clues)
    .filter((c) => known(state, c.id) && c.tags.includes(tag))
    .map((c) => ({ clueId: c.id, text: c.text, status: state.clues[c.id]!.status }));
}

const tagIds = (state: Readonly<SimState>, content: Content, kind: string): Set<string> =>
  new Set(Object.values(content.clues).filter((c) => known(state, c.id)).flatMap((c) => c.tags.filter((t) => t.startsWith(`${kind}:`)).map((t) => t.slice(kind.length + 1))));

export function annotatedMap(state: Readonly<SimState>, world: World, content: Content): AnnotatedMap {
  const walls = Array.from({ length: world.height }, (_, y) => Array.from({ length: world.width }, (_, x) => (world.wall[y * world.width + x] ? "#" : ".")).join(""));
  const learnedZones = tagIds(state, content, "zone");
  const zones = world.zones
    .filter((z) => state.visited.includes(z.id) || learnedZones.has(z.id))
    .map((z) => {
      const idx = world.zones.indexOf(z) + 1;
      const tiles: [number, number][] = [];
      for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) if (world.zoneGrid[y * world.width + x] === idx) tiles.push([x, y]);
      return { id: z.id, label: pretty(z.id), permission: z.requiredPermission, tiles };
    });
  const pins: MapPin[] = [];
  const places = tagIds(state, content, "place");
  for (const p of world.places) if (places.has(p.id)) pins.push({ kind: "place", id: p.id, label: p.label, x: p.x, y: p.y, notes: notesFor(state, content, `place:${p.id}`) });
  const people = tagIds(state, content, "person");
  for (const n of world.npcs) {
    if (!state.met.includes(n.id) && !people.has(n.id)) continue;
    const at = state.npcs[n.id];
    if (at?.away) continue;
    pins.push({ kind: "person", id: n.id, label: pretty(n.id), x: Math.floor(at?.x ?? n.x + 0.5), y: Math.floor(at?.y ?? n.y + 0.5), notes: notesFor(state, content, `person:${n.id}`) });
  }
  pins.push({ kind: "you", id: "you", label: "You", x: Math.floor(state.player.x), y: Math.floor(state.player.y), notes: [] });
  // Schedules that belong to a place on the map appear on its pin; the rest are listed.
  const placed = new Set(pins.flatMap((p) => p.notes.map((n) => n.clueId)));
  const schedules = [...tagIds(state, content, "schedule")].sort().map((id) => ({ id, label: pretty(id), notes: notesFor(state, content, `schedule:${id}`) }));
  for (const pin of pins) {
    if (pin.kind !== "place") continue;
    for (const s of schedules) for (const n of s.notes) if (!placed.has(n.clueId) && content.clues[n.clueId]?.tags.includes(`place:${pin.id}`)) pin.notes.push(n);
  }
  return { width: world.width, height: world.height, walls, zones, pins, schedules: schedules.filter((s) => s.notes.some((n) => !pins.some((p) => p.notes.some((m) => m.clueId === n.clueId)))) };
}
