// covers: CLU-7 (hints from the notebook at a chosen level), PUZ-1 (at least two ways through every critical puzzle), PUZ-3 (no progress gated by chance)
import { describe, expect, it } from "vitest";
import { HINT_LEVELS, activeHints, createInitialState, puzzleModule, type Condition } from "@qh/core";
import { assemble, checkSolvability, formatReport, loadContent, validateContent } from "../../content-tools/src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const { bundle } = loadContent(root);
const a = assemble(bundle);
const content = a.content;
const hints = Object.values(content.hints);

type S = ReturnType<typeof createInitialState>;
/** Edits a fresh state so that the conditions hold (flags, clues, items; `not flag` clears). */
function make(conds: Condition[], base: (s: S) => void = () => {}): S {
  const st = createInitialState(1, config);
  base(st);
  const apply = (c: Condition): void => {
    if ("flag" in c) st.flags[c.flag] = true;
    else if ("flag_eq" in c) st.flags[c.flag_eq[0]] = c.flag_eq[1];
    else if ("has_clue" in c) st.clues[c.has_clue] = { learnedTick: 0, from: "test", status: "unverified" };
    else if ("not" in c && "flag" in c.not) delete st.flags[c.not.flag];
    else if ("all" in c) c.all.forEach(apply);
    else if ("any" in c) apply(c.any[0]!);
  };
  conds.forEach(apply);
  return st;
}
const ids = (st: S, level: (typeof HINT_LEVELS)[number]) => activeHints(st, config, content, level).map((h) => h.id);

describe("hints (CLU-7)", () => {
  it("are off by default and show nothing when off", () => {
    for (const h of hints) expect(ids(make(h.when), "off")).toEqual([]);
  });

  it.each(hints.map((h) => [h.id]))("%s: appears once it is relevant, says a nudge or a direct hint, and goes when done", (id) => {
    const h = content.hints[id!]!;
    // not before the player knows enough to need it (only the very first stage is relevant from the start)
    if (id !== "act1") expect(ids(createInitialState(1, config), "nudge")).not.toContain(id);
    const relevant = make(h.when);
    const nudge = activeHints(relevant, config, content, "nudge").find((x) => x.id === id);
    const direct = activeHints(relevant, config, content, "direct").find((x) => x.id === id);
    expect(nudge?.text, "nudge").toBe(h.nudge);
    expect(direct?.text, "direct").toBe(h.direct);
    expect(h.nudge).not.toBe(h.direct);
    expect(direct!.text.length, "a direct hint says more than a nudge").toBeGreaterThan(nudge!.text.length * 0.6);
    if (h.done.length > 0) expect(ids(make([...h.when, ...h.done]), "direct"), "done").not.toContain(id);
  });

  it("every critical puzzle, Gate route and stage of the main path has one (the validator enforces it)", () => {
    const covered = new Set(hints.flatMap((h) => h.for));
    for (const t of Object.values(content.terminals).filter((t) => t.critical)) expect(covered, t.id).toContain(`terminal:${t.id}`);
    for (const r of ["route:sneak", "route:hack", "route:break", "act1", "mentor", "companion", "past"]) expect(covered, r).toContain(r);
    const broken = { ...bundle, files: { ...bundle.files, hints: bundle.files.hints.map((f) => ({ ...f, data: (f.data as { id: string }[]).filter((h) => h.id !== "locker_9") })) } };
    expect(validateContent(broken).map((i) => i.message).join("\n")).toMatch(/nothing hints at "terminal:locker_9"/);
  });

  it("are written into the notebook only at the level chosen: a fresh game starts with the first stage and nothing spoiled", () => {
    const fresh = createInitialState(1, config);
    expect(ids(fresh, "nudge")).toEqual(["act1"]);
    expect(ids(fresh, "direct")).toEqual(["act1"]);
    // Gate hints wait until the player has heard of the Gate's weaknesses
    expect(ids(fresh, "direct")).not.toContain("route_sneak");
    expect(ids(make([{ has_clue: "gate_three_ways" }]), "nudge")).toEqual(expect.arrayContaining(["route_sneak", "route_hack", "route_break"]));
  });

  it("never reveal a clue's reliability or say a claim is false", () => {
    for (const h of hints) expect(`${h.nudge} ${h.direct}`).not.toMatch(/\bis (a )?lie\b|planted|unreliable/i);
  });
});

describe("two ways through every critical puzzle (PUZ-1) and nothing left to chance (PUZ-3)", () => {
  const report = checkSolvability(a.worlds, a.content, a.config, a.goals, a.start, { maxStates: 2500 });

  it("the checker reports at least two ways through each critical puzzle", () => {
    const critical = Object.values(content.terminals).filter((t) => t.critical);
    expect(critical.length).toBeGreaterThanOrEqual(5);
    expect(report.critical!.map((t) => t.id).sort()).toEqual(critical.map((t) => t.id).sort());
    for (const t of report.critical!) expect(t.routes, t.id).toBeGreaterThanOrEqual(2);
    expect(formatReport(report)).toMatch(/critical puzzles: (\d+), \1 with at least two ways through/);
  });

  it("the Gate has three routes and each can be reached from a fresh start, also without the past", () => {
    expect(report.routes!.map((r) => r.route).sort()).toEqual(["break", "hack", "sneak"]);
    for (const r of report.routes!) { expect(r.reachable, r.route).toBe(true); expect(r.reachableNull, r.route).toBe(true); }
  });

  it("would catch a puzzle with one way: remove Locker 9's key and it is an error, not a warning", () => {
    const t = content.terminals.locker_9!;
    const one = { ...content, terminals: { ...content.terminals, locker_9: { ...t, bypass: [] } } };
    const r = checkSolvability(a.worlds, one, a.config, a.goals, a.start, { maxStates: 2500 });
    expect(r.critical!.find((x) => x.id === "locker_9")!.routes).toBe(1);
    expect([...r.maps.flatMap((m) => m.findings), ...r.findings].some((f) => f.kind === "single-route" && f.message.includes("locker_9"))).toBe(true);
  });

  it("every critical puzzle is deterministic: it has a solution that does not depend on chance", () => {
    for (const t of Object.values(content.terminals).filter((x) => x.critical)) {
      const p = content.puzzles[t.puzzle]!;
      const mod = puzzleModule(p)!;
      expect(mod.solve(p, mod.init(p)), `${t.id} is solvable`).not.toBeNull();
    }
  });
});
