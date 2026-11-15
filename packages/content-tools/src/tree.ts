/**
 * The decision and achievement tree: a Mermaid rendering of what the player decides and what comes of it.
 * The spine is hand-written (content/design/decisions.json); the side-quests are derived from quests and goals,
 * so they stay current by themselves. Every implemented node that names a flag is checked against the content:
 * a flag nothing sets is an issue, so the picture cannot quietly drift from the game.
 */
import type { ContentBundle, Issue } from "./validate.ts";

export interface TreeNode {
  id: string;
  label: string;
  kind: "decision" | "outcome" | "achievement" | "state";
  status: "implemented" | "planned";
  /** The flag (or, with `district` / `emitted`, the district key / custom event) that records it. */
  flag?: string;
  /** Set by the engine rather than by content: not checked. */
  engine?: boolean;
  district?: boolean;
  emitted?: boolean;
}
export interface TreeEdge { from: string; to: string; label?: string }
export interface TreeSection { id: string; title: string; intro: string; nodes: TreeNode[]; edges: TreeEdge[] }
export interface Manifest {
  about: string;
  sections: TreeSection[];
  achievements: { name: string; flag?: string; status: "implemented" | "planned"; engine?: boolean }[];
}

interface QuestLite { id: string; title: string; summary?: string; start: Record<string, unknown>[]; complete: Record<string, unknown>[]; failed?: Record<string, unknown>[] }
interface GoalLite { id: string; name: string; map: string }

const esc = (s: string) => s.replace(/"/g, "'").replace(/[<>]/g, "");

/** Everything the content can set, found by reading the text of the dialogue and the data. */
export function settableThings(bundle: ContentBundle): { flags: Set<string>; districtKeys: Set<string>; events: Set<string> } {
  const flags = new Set<string>();
  const districtKeys = new Set<string>();
  const events = new Set<string>();
  for (const { text } of bundle.dialogues) {
    for (const group of text.matchAll(/\{([^}]*)\}/g)) {
      for (const m of group[1]!.matchAll(/(?:^|,)\s*flag:([a-z][a-z0-9_]*)/g)) flags.add(m[1]!);
      for (const m of group[1]!.matchAll(/(?:^|,)\s*emit:([a-z][a-z0-9_]*)/g)) events.add(m[1]!);
    }
  }
  const json = [...Object.values(bundle.files).flat(), ...bundle.maps].map((f) => JSON.stringify(f.data)).join("\n");
  for (const m of json.matchAll(/"set_flag":\["([a-z][a-z0-9_]*)"/g)) flags.add(m[1]!);
  for (const m of json.matchAll(/"set_district":\["[^"]*","([a-z][a-z0-9_]*)"/g)) districtKeys.add(m[1]!);
  for (const m of json.matchAll(/"emit":"([a-z][a-z0-9_]*)"/g)) events.add(m[1]!);
  return { flags, districtKeys, events };
}

const dataOf = <T,>(bundle: ContentBundle, kind: "quests" | "goals"): T[] => bundle.files[kind].flatMap((f) => (Array.isArray(f.data) ? (f.data as T[]) : []));

function describeCondition(c: Record<string, unknown>): string {
  if ("flag" in c) return `flag ${String(c.flag)}`;
  if ("has_clue" in c) return `learn "${String(c.has_clue)}"`;
  if ("has_item" in c) return `hold ${JSON.stringify(c.has_item)}`;
  return Object.keys(c)[0] ?? "start";
}

function renderSection(s: TreeSection): { lines: string[]; issues: string[] } {
  const issues: string[] = [];
  const ids = new Set(s.nodes.map((n) => n.id));
  const out = ["```mermaid", "flowchart TD"];
  for (const n of s.nodes) out.push(`  n_${n.id}["${esc(n.label)}"]`);
  const planned = (id: string) => s.nodes.find((n) => n.id === id)?.status === "planned";
  for (const e of s.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) { issues.push(`section "${s.id}": edge ${e.from} -> ${e.to} names an unknown node`); continue; }
    const arrow = planned(e.from) || planned(e.to) ? "-.->" : "-->";
    out.push(`  n_${e.from} ${arrow}${e.label ? `|${esc(e.label)}|` : ""} n_${e.to}`);
  }
  for (const kind of ["decision", "outcome", "achievement", "state"] as const) {
    const of = s.nodes.filter((n) => n.kind === kind).map((n) => `n_${n.id}`);
    if (of.length) out.push(`  class ${of.join(",")} ${kind}`);
  }
  const pl = s.nodes.filter((n) => n.status === "planned").map((n) => `n_${n.id}`);
  if (pl.length) out.push(`  class ${pl.join(",")} planned`);
  out.push(
    "  classDef decision fill:#fff3c4,stroke:#b58900,color:#222",
    "  classDef outcome fill:#d8ecff,stroke:#2d6fb5,color:#222",
    "  classDef achievement fill:#d9f2d9,stroke:#2e8b3d,color:#222",
    "  classDef state fill:#eeeeee,stroke:#777,color:#222",
    "  classDef planned stroke-dasharray:5 4,fill-opacity:0.5",
    "```",
  );
  return { lines: out, issues };
}

export function buildTree(bundle: ContentBundle, manifest: Manifest): { text: string; issues: Issue[] } {
  const issues: Issue[] = [];
  const things = settableThings(bundle);
  const check = (what: string, n: { flag?: string; engine?: boolean; district?: boolean; emitted?: boolean; status: string }) => {
    if (n.status !== "implemented" || n.engine || !n.flag) return;
    const set = n.district ? things.districtKeys : n.emitted ? things.events : things.flags;
    if (!set.has(n.flag)) issues.push({ file: "content/design/decisions.json", message: `${what} is marked implemented but nothing in the content sets "${n.flag}"` });
  };
  const seen = new Set<string>();
  for (const s of manifest.sections) {
    for (const n of s.nodes) {
      if (seen.has(`${s.id}.${n.id}`)) issues.push({ file: "content/design/decisions.json", message: `duplicate node "${n.id}" in section "${s.id}"` });
      seen.add(`${s.id}.${n.id}`);
      check(`node "${s.id}.${n.id}"`, n);
    }
  }
  for (const a of manifest.achievements) check(`achievement "${a.name}"`, a);

  const L: string[] = [
    "# Decision and achievement tree",
    "",
    "*Generated by `pnpm tree -- --write` from `content/design/decisions.json` (the spine), `content/quests` and `content/goals` (the side-quests). Do not edit by hand; a test fails when this file is stale.*",
    "",
    "**To update:** change the manifest (add a node, flip `planned` to `implemented` and name its `flag`, add an edge) or the quest data, then run `pnpm tree -- --write`. Implemented nodes that name a flag are checked against the content, so the tree cannot drift from the game. Solid boxes exist today; dashed ones are planned.",
    "",
    "Legend: yellow = a decision the player makes; blue = an outcome; green = an achievement or reward; grey = a state or step.",
    "",
  ];
  for (const s of manifest.sections) {
    L.push(`## ${s.title}`, "", s.intro, "");
    const r = renderSection(s);
    for (const m of r.issues) issues.push({ file: "content/design/decisions.json", message: m });
    L.push(...r.lines, "");
  }

  // Side-quests, derived.
  const quests = dataOf<QuestLite>(bundle, "quests");
  const goals = dataOf<GoalLite>(bundle, "goals");
  const mapOf = new Map<string, string>();
  for (const g of goals) {
    const q = quests.find((x) => JSON.stringify(x.complete) === JSON.stringify((g as unknown as { require: unknown[] }).require));
    if (q) mapOf.set(q.id, g.map);
  }
  const byMap = new Map<string, QuestLite[]>();
  for (const q of quests) byMap.set(mapOf.get(q.id) ?? "other", [...(byMap.get(mapOf.get(q.id) ?? "other") ?? []), q]);
  L.push("## Side-quests and their outcomes", "", "Derived from the quest data: how each begins, how it is completed, and whether it can fail.", "", "```mermaid", "flowchart LR");
  const cls = { quest: [] as string[], done: [] as string[], fail: [] as string[] };
  for (const [map, list] of [...byMap.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    L.push(`  subgraph ${map}_map["${esc(map.replace(/_/g, " "))}"]`);
    for (const q of list) {
      L.push(`    q_${q.id}["${esc(q.title)}"]`);
      cls.quest.push(`q_${q.id}`);
      const start = q.start[0] ? describeCondition(q.start[0]) : "available";
      L.push(`    q_${q.id}_start(["begins: ${esc(start)}"]) --> q_${q.id}`);
      L.push(`    q_${q.id} -->|done| q_${q.id}_ok["${esc(describeCondition(q.complete[0] ?? {}))}"]`);
      cls.done.push(`q_${q.id}_ok`);
      if (q.failed?.length) {
        L.push(`    q_${q.id} -.->|missed| q_${q.id}_bad["${esc(describeCondition(q.failed[0]!))}"]`);
        cls.fail.push(`q_${q.id}_bad`);
      }
    }
    L.push("  end");
  }
  if (cls.quest.length) L.push(`  class ${cls.quest.join(",")} decision`);
  if (cls.done.length) L.push(`  class ${cls.done.join(",")} achievement`);
  if (cls.fail.length) L.push(`  class ${cls.fail.join(",")} outcome`);
  L.push("  classDef decision fill:#fff3c4,stroke:#b58900,color:#222", "  classDef outcome fill:#f8d7da,stroke:#b03a48,color:#222", "  classDef achievement fill:#d9f2d9,stroke:#2e8b3d,color:#222", "```", "");

  L.push("## Achievements", "", "| Achievement | Where it comes from | Status |", "|---|---|---|");
  for (const g of goals.filter((x) => x.id.startsWith("sq_")).sort((a, b) => (a.id < b.id ? -1 : 1))) L.push(`| ${g.name} | side-quest \`${g.id}\` (${g.map.replace(/_/g, " ")}) | implemented |`);
  for (const a of manifest.achievements) L.push(`| ${a.name} | ${a.flag ? `flag \`${a.flag}\`` : "to be designed"} | ${a.status} |`);
  L.push("");
  return { text: L.join("\n"), issues };
}
