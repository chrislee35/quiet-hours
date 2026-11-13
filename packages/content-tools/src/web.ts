/**
 * The information web (T3.1, CLU-8). The clues are the backbone of the game: what the player knows is what they can
 * do. This module checks the web's design rules and renders the design sheet *from the clue data* (one source of
 * truth: `docs/information-web.md` is generated, and a test fails if it drifts).
 *
 * Rules enforced (errors):
 *  - every clue has a source of a known kind, and every `npc:` source exists;
 *  - a *critical* clue (the way on depends on it) can be learned from at least two distinct sources (PUZ-1's "clue
 *    trail reachable from different starts");
 *  - a clue that is not true (false, outdated, planted) is linked to a true clue that corrects it, so cross-checking
 *    can always resolve it (CLU-4);
 *  - "no one person alive knows the whole story": no single person is a source of more than 40% of the critical
 *    clues on the past or the Gate;
 *  - exactly six breadcrumbs and three embrace-or-reject moments (STORY §3), each learnable two ways;
 *  - every clue says what it is for, and every route, companion and the past has enough to be solvable;
 *  - the whole web is the size the concept calls for (60-90 clues), and 15-35% of it is not simply true.
 */
import type { ClueDef } from "@qh/core";
import type { Issue } from "./validate.ts";

export const SOURCE_KINDS = ["npc", "doc", "terminal", "scene", "observe", "broadcast", "item"] as const;

/** Share of critical clues on a topic that one person may be a source of. */
export const MAX_PERSON_SHARE = 0.4;
export const CLUE_COUNT_RANGE = [60, 90] as const;
/** Share of clues that are not simply true (false, outdated, planted): enough that cross-checking is a real skill, not a rare event. */
export const NON_TRUE_RANGE = [0.15, 0.35] as const;
/** Fewest critical clues each route or companion needs to be solvable by information alone. */
export const MIN_CRITICAL: Record<string, number> = { "route:sneak": 4, "route:hack": 5, "route:break": 4, "past": 6, "companion:pallas": 2, "companion:june": 3, "companion:odile": 3, "companion:mentor": 2 };

export const sourcesOf = (c: ClueDef): string[] => [...new Set([c.source, ...(c.alsoFrom ?? [])])];

export interface WebReport {
  total: number;
  byReliability: Record<string, number>;
  critical: number;
  /** Clues needed for each route, companion or topic ("for" values), with how many are critical. */
  needs: Record<string, { clues: number; critical: number }>;
  /** Per person: how many clues they are a source of, and their share of the critical clues about the past and the Gate. */
  people: { id: string; clues: number; criticalShare: number }[];
  /** Pairs of clues that contradict each other, or where one updates the other. */
  conflicts: { a: string; b: string; kind: "contradicts" | "updates" }[];
  issues: Issue[];
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function analyseWeb(clues: readonly ClueDef[], npcIds: ReadonlySet<string>, fileOf: (id: string) => string = () => "clues"): WebReport {
  const issues: Issue[] = [];
  const byId = new Map(clues.map((c) => [c.id, c]));
  const say = (c: ClueDef, message: string) => issues.push({ file: fileOf(c.id), message: `clue "${c.id}": ${message}` });

  for (const c of clues) {
    const all = [c.source, ...(c.alsoFrom ?? [])];
    for (const s of all) {
      const [kind, id] = s.split(":") as [string, string];
      if (!(SOURCE_KINDS as readonly string[]).includes(kind)) say(c, `source "${s}" has an unknown kind (expected ${SOURCE_KINDS.join(", ")})`);
      else if (kind === "npc" && !npcIds.has(id)) say(c, `source "${s}" is not a defined person`);
    }
    if (new Set(all).size !== all.length) say(c, "lists the same source twice");
    if (c.critical && sourcesOf(c).length < 2) say(c, "is critical, so it must be learnable from at least two different sources (add alsoFrom)");
    if ((c.for ?? []).length === 0) say(c, 'says nothing about what it is for ("for": route:sneak, past, side:sq_03, world, ...)');
    if (c.reliability !== "true") {
      const corrects = [...c.links.map((l) => ({ to: l.to, kind: l.kind })), ...clues.flatMap((o) => o.links.filter((l) => l.to === c.id).map((l) => ({ to: o.id, kind: l.kind })))];
      const truth = corrects.some((l) => (l.kind === "contradicts" || l.kind === "updates") && byId.get(l.to)?.reliability === "true");
      if (!truth) say(c, `is ${c.reliability}, so it must be linked (contradicts or updates) to a true clue that corrects it`);
    }
  }

  // Breadcrumbs and embrace-or-reject moments.
  const tagged = (t: string) => clues.filter((c) => c.tags.includes(t));
  if (tagged("topic:breadcrumb").length !== 6) issues.push({ file: "clues", message: `there must be exactly six breadcrumbs (topic:breadcrumb), found ${tagged("topic:breadcrumb").length}` });
  if (tagged("topic:moment").length !== 3) issues.push({ file: "clues", message: `there must be exactly three embrace-or-reject moments (topic:moment), found ${tagged("topic:moment").length}` });
  for (const c of [...tagged("topic:breadcrumb"), ...tagged("topic:moment")]) if (sourcesOf(c).length < 2) say(c, "is a breadcrumb or moment, so it must be reachable from at least two directions");

  // Coverage of every route, companion and the past.
  const needs: WebReport["needs"] = {};
  for (const c of clues) for (const f of c.for ?? []) {
    const n = (needs[f] ??= { clues: 0, critical: 0 });
    n.clues++;
    if (c.critical) n.critical++;
  }
  for (const [need, min] of Object.entries(MIN_CRITICAL)) {
    const have = needs[need]?.critical ?? 0;
    if (have < min) issues.push({ file: "clues", message: `"${need}" needs at least ${min} critical clues to be solvable by information, found ${have}` });
  }

  // No one person knows the whole story.
  const topical = clues.filter((c) => c.critical && (c.tags.includes("topic:past_self") || c.tags.includes("topic:gate")));
  const share = new Map<string, number>();
  for (const c of topical) for (const s of sourcesOf(c)) if (s.startsWith("npc:")) share.set(s.slice(4), (share.get(s.slice(4)) ?? 0) + 1);
  for (const [id, n] of share) {
    if (topical.length > 0 && n / topical.length > MAX_PERSON_SHARE) issues.push({ file: "clues", message: `${id} is a source of ${n} of ${topical.length} critical clues about the past and the Gate (${Math.round((100 * n) / topical.length)}%); no one person may know more than ${MAX_PERSON_SHARE * 100}% of it` });
  }

  const count = clues.length;
  if (count < CLUE_COUNT_RANGE[0] || count > CLUE_COUNT_RANGE[1]) issues.push({ file: "clues", message: `the web has ${count} clues; the design calls for ${CLUE_COUNT_RANGE[0]} to ${CLUE_COUNT_RANGE[1]} (CLU-8)` });

  const nonTrue = clues.filter((c) => c.reliability !== "true").length;
  if (count > 0 && (nonTrue / count < NON_TRUE_RANGE[0] || nonTrue / count > NON_TRUE_RANGE[1])) {
    issues.push({ file: "clues", message: `${nonTrue} of ${count} clues are not simply true (${Math.round((100 * nonTrue) / count)}%); the design calls for ${NON_TRUE_RANGE[0] * 100}% to ${NON_TRUE_RANGE[1] * 100}% so that cross-checking matters` });
  }

  const people = new Map<string, number>();
  for (const c of clues) for (const s of sourcesOf(c)) if (s.startsWith("npc:")) people.set(s.slice(4), (people.get(s.slice(4)) ?? 0) + 1);
  const conflicts = new Map<string, WebReport["conflicts"][number]>();
  for (const c of clues) for (const l of c.links) if (l.kind !== "supports") conflicts.set(pairKey(c.id, l.to) + l.kind, { a: c.id, b: l.to, kind: l.kind });

  const byReliability: Record<string, number> = { true: 0, false: 0, outdated: 0, planted: 0 };
  for (const c of clues) byReliability[c.reliability] = (byReliability[c.reliability] ?? 0) + 1;
  return {
    total: count, byReliability, critical: clues.filter((c) => c.critical).length, needs,
    people: [...people].map(([id, n]) => ({ id, clues: n, criticalShare: topical.length ? (share.get(id) ?? 0) / topical.length : 0 })).sort((a, b) => b.clues - a.clues || (a.id < b.id ? -1 : 1)),
    conflicts: [...conflicts.values()], issues,
  };
}

const pretty = (id: string): string => id.replace(/_/g, " ");
const srcLabel = (s: string): string => (s.startsWith("npc:") ? pretty(s.slice(4)) : s);

/**
 * The design sheet, as Markdown, generated from the clues. `groups` maps a clue id to the file (area) it lives in;
 * `names` maps npc ids to display names.
 */
export function renderSheet(clues: readonly ClueDef[], report: WebReport, groups: (id: string) => string, names: (id: string) => string): string {
  const out: string[] = [];
  const pct = (n: number) => `${Math.round((100 * n) / report.total)}%`;
  out.push("# Information web: design sheet", "");
  out.push("*Generated from `content/clues/*.json` by `pnpm web --write`. Do not edit by hand: change the clues and regenerate. A test fails if this file drifts from the data.*", "");
  out.push("Quiet Hours is a game about finding things out, so what the player *knows* is what they can *do*. This sheet is the map of that knowledge: every clue, who can tell you, how far to trust it, what it points to, and what the game needs it for. Design rules (enforced by `pnpm validate`):", "");
  out.push("- **Two ways in.** A clue the way on depends on (marked critical) can be learned from at least two different sources.", "- **Every lie can be caught.** A clue that is false, outdated or planted is linked to the true clue that corrects it, so cross-checking always resolves it.", "- **No one knows everything.** No single person is a source of more than 40% of the critical clues about the past and the Gate.", "- **Six breadcrumbs and three embrace-or-reject moments**, each reachable from two directions.", "- **Reliability is hidden from the player** until they verify a clue (CLU-5); this sheet is the only place it is written down.", "");
  out.push("## At a glance", "");
  out.push(`- **${report.total} clues**, ${report.critical} of them critical. True ${report.byReliability.true} (${pct(report.byReliability.true ?? 0)}), outdated ${report.byReliability.outdated}, false ${report.byReliability.false}, planted ${report.byReliability.planted}.`);
  out.push(`- **${report.conflicts.length} corrections** (a clue that contradicts or updates another): the cross-checking puzzles.`, "");
  out.push("### What each way forward needs", "", "| Need | Clues | Critical | Required |", "|---|---:|---:|---:|");
  for (const [need, n] of Object.entries(report.needs).sort(([a], [b]) => (a < b ? -1 : 1))) out.push(`| ${need} | ${n.clues} | ${n.critical} | ${MIN_CRITICAL[need] ?? ""} |`);
  out.push("", "### Who knows what", "", "| Person | Clues they are a source of | Share of critical past/Gate clues |", "|---|---:|---:|");
  for (const p of report.people) out.push(`| ${names(p.id)} | ${p.clues} | ${p.criticalShare > 0 ? `${Math.round(p.criticalShare * 100)}%` : ""} |`);
  out.push("");
  const order: string[] = [];
  for (const c of clues) if (!order.includes(groups(c.id))) order.push(groups(c.id));
  for (const g of order) {
    out.push(`## ${pretty(g).replace(/^./, (x) => x.toUpperCase())}`, "", "| Clue | What it says | From | Trust | Links | For |", "|---|---|---|---|---|---|");
    for (const c of clues.filter((x) => groups(x.id) === g)) {
      const from = sourcesOf(c).map((s) => (s.startsWith("npc:") ? names(s.slice(4)) : srcLabel(s)));
      const links = c.links.map((l) => `${l.kind} \`${l.to}\``).join("; ");
      out.push(`| \`${c.id}\`${c.critical ? " **!**" : ""} | ${c.text.replace(/\|/g, "\\|")} | ${from.join("; ")} | ${c.reliability} | ${links} | ${(c.for ?? []).join(", ")} |`);
    }
    out.push("");
  }
  const esc = (t: string) => t.replace(/\|/g, "\\|");
  const pairs = report.conflicts.map((x) => ({ a: clues.find((c) => c.id === x.a)!, b: clues.find((c) => c.id === x.b)! }));
  out.push("## Corrections: where the player has to cross-check", "", "| Wrong or stale | Right |", "|---|---|");
  for (const { a, b } of pairs.filter((p) => p.a.reliability !== "true" || p.b.reliability !== "true")) {
    const [bad, good] = a.reliability === "true" ? [b, a] : [a, b];
    out.push(`| \`${bad.id}\` (${bad.reliability}): ${esc(bad.text)} | \`${good.id}\`: ${esc(good.text)} |`);
  }
  const both = pairs.filter((p) => p.a.reliability === "true" && p.b.reliability === "true");
  if (both.length > 0) {
    out.push("", "## Two true things that pull against each other", "", "| One fact | Another |", "|---|---|");
    for (const { a, b } of both) out.push(`| \`${a.id}\`: ${esc(a.text)} | \`${b.id}\`: ${esc(b.text)} |`);
  }
  out.push("", "`!` marks a critical clue. Text is how the notebook words it; characters may say it in their own voice.", "");
  return out.join("\n");
}
