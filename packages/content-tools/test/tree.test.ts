// covers: the decision and achievement tree stays current and honest
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTree, loadContent, type Manifest } from "../src/index.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const { bundle } = loadContent(root);
const manifest = JSON.parse(readFileSync(`${root}/design/decisions.json`, "utf8")) as Manifest;
const built = buildTree(bundle, manifest);

describe("the decision tree", () => {
  it("every implemented node's flag is set somewhere in the content", () => {
    expect(built.issues).toEqual([]);
  });

  it("docs/decision-tree.md is generated from the data and is up to date", () => {
    const onDisk = readFileSync(new URL("../../../docs/decision-tree.md", import.meta.url), "utf8");
    expect(onDisk, "run `pnpm tree -- --write` to regenerate docs/decision-tree.md").toBe(built.text);
  });

  it("draws every section and every quest as Mermaid", () => {
    expect(built.text.match(/```mermaid/g)!.length).toBe(manifest.sections.length + 1);
    for (const f of bundle.files.quests) for (const q of f.data as { id: string }[]) expect(built.text).toContain(`q_${q.id}[`);
  });

  it("catches an implemented node whose flag nothing sets, and an edge to nowhere", () => {
    const bad = structuredClone(manifest);
    bad.sections[0]!.nodes[0] = { id: "ghost", label: "Ghost", kind: "decision", status: "implemented", flag: "no_such_flag" };
    bad.sections[0]!.edges.push({ from: "ghost", to: "nowhere" });
    const messages = buildTree(bundle, bad).issues.map((i) => i.message);
    expect(messages.some((m) => m.includes("no_such_flag"))).toBe(true);
    expect(messages.some((m) => m.includes("unknown node"))).toBe(true);
  });

  it("a planned node need not be built yet", () => {
    const ok = structuredClone(manifest);
    ok.sections[0]!.nodes[0] = { id: "later", label: "Later", kind: "decision", status: "planned", flag: "not_yet" };
    ok.sections[0]!.edges = [];
    expect(buildTree(bundle, ok).issues).toEqual([]);
  });
});
