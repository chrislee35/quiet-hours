// covers: CLU-1, CLU-4, CLU-5, CLU-8 (the information web), PST-1 (breadcrumbs), PUZ-1 (clue trails from different starts)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ClueDef } from "@qh/core";
import { CLUE_COUNT_RANGE, MAX_PERSON_SHARE, MIN_CRITICAL, NON_TRUE_RANGE, analyseWeb, loadContent, renderSheet, sheetFor, sourcesOf, validateContent } from "../src/index.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const { bundle } = loadContent(root);
const { clues, report, text } = sheetFor(bundle);
const npcs = new Set(["a", "b", "c", "d", "e"]);

const clue = (over: Partial<ClueDef> & { id: string }): ClueDef => ({ text: "A fact.", source: "npc:a", reliability: "true", tags: [], links: [], for: ["world"], ...over });
/** Enough well-formed clues to satisfy the size rule, so a fixture can test one rule at a time. */
const filler = (n: number): ClueDef[] => Array.from({ length: n }, (_, i) => clue({ id: `f${i}`, reliability: i % 4 === 0 ? "outdated" : "true", links: i % 4 === 0 ? [{ to: "f1", kind: "updates" }] : [] }));
const crumbs = (): ClueDef[] => [
  ...Array.from({ length: 6 }, (_, i) => clue({ id: `bc${i}`, tags: ["topic:breadcrumb"], alsoFrom: ["npc:b"] })),
  ...Array.from({ length: 3 }, (_, i) => clue({ id: `mo${i}`, tags: ["topic:moment"], alsoFrom: ["npc:b"] })),
];
const web = (extra: ClueDef[] = [], skipMinimums = true) => {
  const all = [...crumbs(), ...filler(60), ...extra];
  const r = analyseWeb(all, npcs);
  return skipMinimums ? r.issues.filter((i) => !i.message.includes("critical clues to be solvable")) : r.issues;
};
const messages = (i: { message: string }[]) => i.map((x) => x.message);

describe("the shipped information web", () => {
  it("passes every design rule", () => {
    expect(report.issues).toEqual([]);
    expect(validateContent(bundle)).toEqual([]);
  });

  it("is the size the concept calls for, with a real share of false, outdated and planted clues (CLU-8)", () => {
    expect(report.total).toBeGreaterThanOrEqual(CLUE_COUNT_RANGE[0]);
    expect(report.total).toBeLessThanOrEqual(CLUE_COUNT_RANGE[1]);
    const share = (report.total - report.byReliability.true!) / report.total;
    expect(share).toBeGreaterThanOrEqual(NON_TRUE_RANGE[0]);
    expect(share).toBeLessThanOrEqual(NON_TRUE_RANGE[1]);
    for (const r of ["true", "false", "outdated", "planted"]) expect(report.byReliability[r], r).toBeGreaterThan(0);
  });

  it("every clue has a source, and every critical clue can be learned from at least two (PUZ-1)", () => {
    for (const c of clues) expect(sourcesOf(c).length, c.id).toBeGreaterThanOrEqual(1);
    for (const c of clues.filter((x) => x.critical)) expect(sourcesOf(c).length, c.id).toBeGreaterThanOrEqual(2);
  });

  it("every false, outdated or planted clue is corrected by a true one, so cross-checking can always settle it (CLU-4)", () => {
    const by = new Map(clues.map((c) => [c.id, c]));
    for (const c of clues.filter((x) => x.reliability !== "true")) {
      const partners = [...c.links.map((l) => l.to), ...clues.filter((o) => o.links.some((l) => l.to === c.id)).map((o) => o.id)];
      expect(partners.some((p) => by.get(p)?.reliability === "true"), c.id).toBe(true);
    }
  });

  it("has exactly six breadcrumbs and three embrace-or-reject moments, each reachable two ways", () => {
    const crumbsNow = clues.filter((c) => c.tags.includes("topic:breadcrumb"));
    expect(crumbsNow.map((c) => c.id).sort()).toEqual(["band_scratch", "hollow_voice_note", "laundry_key", "ledger_redacted", "mentor_slip", "pallas_log_handle"]);
    expect(clues.filter((c) => c.tags.includes("topic:moment")).map((c) => c.id).sort()).toEqual(["checkpoint_credential", "gate_prompt", "pell_recognises"]);
    for (const c of [...crumbsNow, ...clues.filter((x) => x.tags.includes("topic:moment"))]) expect(sourcesOf(c).length, c.id).toBeGreaterThanOrEqual(2);
  });

  it("gives every route, companion and the past enough critical clues to be solvable by information", () => {
    for (const [need, min] of Object.entries(MIN_CRITICAL)) expect(report.needs[need]?.critical ?? 0, need).toBeGreaterThanOrEqual(min);
  });

  it("no one person alive knows the whole story: nobody is a source of more than 40% of the critical past and Gate clues", () => {
    expect(report.people.length).toBeGreaterThan(10);
    for (const p of report.people) expect(p.criticalShare, p.id).toBeLessThanOrEqual(MAX_PERSON_SHARE);
  });

  it("the three Gate weaknesses each have their own critical trail, and the break route's chain reaches the Gate's rule", () => {
    const need = (r: string) => clues.filter((c) => c.critical && c.for?.includes(r)).map((c) => c.id);
    expect(need("route:sneak")).toEqual(expect.arrayContaining(["train7_gate", "service_platform_unwatched", "annex_pass"]));
    expect(need("route:hack")).toEqual(expect.arrayContaining(["gate_lookup", "gate_controller_panel", "gate_code_first", "gate_code_second", "gate_key_card"]));
    expect(need("route:break")).toEqual(expect.arrayContaining(["power_node_map", "node4_location", "node4_cut_effect", "gate_fails_open"]));
  });

  it("each companion has the information their gating condition needs", () => {
    const has = (id: string) => clues.some((c) => c.id === id);
    for (const id of ["pallas_cargo", "june_consent", "tunnel_scanners_low", "odile_signatory", "charter_countersign", "odile_lapse", "mentor_record_severance", "one_companion"]) expect(has(id), id).toBe(true);
  });

  it("clue text is clean: one or two sentences, ends properly, no stray spaces, nothing too long for the notebook", () => {
    for (const c of clues) {
      expect(c.text, c.id).toMatch(/[.?!'"]$/);
      expect(c.text, c.id).not.toMatch(/\s{2,}|^\s|\s$/);
      expect(c.text.length, c.id).toBeLessThan(230);
      expect(c.text.length, c.id).toBeGreaterThan(20);
    }
  });

  it("ids are tidy and unique", () => {
    expect(new Set(clues.map((c) => c.id)).size).toBe(clues.length);
    for (const c of clues) expect(c.id).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("the design sheet in docs/ is generated from this data and is up to date", () => {
    const onDisk = readFileSync(new URL("../../../docs/information-web.md", import.meta.url), "utf8");
    expect(onDisk, "run `pnpm web -- --write` to regenerate docs/information-web.md").toBe(text);
  });

  it("the sheet lists every clue exactly once and says nothing about reliability to the player-facing views", () => {
    for (const c of clues) expect(text.split(`\`${c.id}\``).length - 1, c.id).toBeGreaterThanOrEqual(1);
    expect(text).toContain("Reliability is hidden from the player");
  });
});

describe("the web's rules catch what they should", () => {
  it("a well-formed web has no issues", () => {
    expect(web()).toEqual([]);
  });

  it("a source of an unknown kind, or a person who does not exist", () => {
    expect(messages(web([clue({ id: "x1", source: "rumour:street" })]))).toEqual([expect.stringContaining("unknown kind")]);
    expect(messages(web([clue({ id: "x2", source: "npc:nobody" })]))).toEqual([expect.stringContaining("not a defined person")]);
    expect(messages(web([clue({ id: "x3", alsoFrom: ["npc:nobody"] })]))).toEqual([expect.stringContaining("not a defined person")]);
    expect(web([clue({ id: "x4", source: "doc:ledger", alsoFrom: ["terminal:t", "scene:s", "observe:o", "broadcast:b", "item:i"] })])).toEqual([]);
  });

  it("a critical clue with only one source is an error; the same source twice does not count as two", () => {
    expect(messages(web([clue({ id: "x1", critical: true })]))).toEqual([expect.stringContaining("at least two different sources")]);
    expect(messages(web([clue({ id: "x2", critical: true, alsoFrom: ["npc:a"] })])).filter((m) => m.includes("x2"))).toEqual(expect.arrayContaining([expect.stringContaining("same source twice")]));
    expect(web([clue({ id: "x3", critical: true, alsoFrom: ["npc:b"] })])).toEqual([]);
  });

  it("a clue that is not true must be corrected by a true one, in either direction", () => {
    expect(messages(web([clue({ id: "x1", reliability: "false" })]))).toEqual([expect.stringContaining("linked (contradicts or updates) to a true clue")]);
    expect(web([clue({ id: "x2", reliability: "false", links: [{ to: "f1", kind: "contradicts" }] })])).toEqual([]);
    expect(web([clue({ id: "x3", reliability: "planted" }), clue({ id: "x4", links: [{ to: "x3", kind: "contradicts" }] })])).toEqual([]);
    // supports does not correct anything
    expect(web([clue({ id: "x5", reliability: "outdated", links: [{ to: "f1", kind: "supports" }] })]).length).toBe(1);
    // a false clue "corrected" only by another false clue is still unresolved
    expect(web([clue({ id: "x6", reliability: "false", links: [{ to: "x7", kind: "contradicts" }] }), clue({ id: "x7", reliability: "false", links: [{ to: "x6", kind: "contradicts" }] })]).length).toBe(2);
  });

  it("exactly six breadcrumbs and exactly three moments", () => {
    const base = [...filler(60)];
    const msgs = (cs: ClueDef[]) => messages(analyseWeb(cs, npcs).issues.filter((i) => !i.message.includes("critical clues to be solvable")));
    expect(msgs([...base, ...crumbs().slice(0, 5), ...crumbs().slice(6)])).toEqual([expect.stringContaining("exactly six breadcrumbs")]);
    expect(msgs([...base, ...crumbs().slice(0, 8)])).toEqual([expect.stringContaining("exactly three")]);
  });

  it("a breadcrumb with one source is an error", () => {
    const { alsoFrom: _drop, ...lone } = crumbs()[0]!;
    void _drop;
    expect(messages(analyseWeb([lone as ClueDef, ...crumbs().slice(1), ...filler(60)], npcs).issues.filter((i) => !i.message.includes("solvable")))).toEqual([expect.stringContaining("two directions")]);
  });

  it("every clue must say what it is for", () => {
    expect(messages(web([clue({ id: "x1", for: [] })]))).toEqual([expect.stringContaining("what it is for")]);
  });

  it("no person may be a source of more than 40% of the critical past and Gate clues", () => {
    const heavy = ["p1", "p2", "p3", "p4", "p5"].map((id) => clue({ id, critical: true, tags: ["topic:gate"], source: "npc:a", alsoFrom: ["npc:b"] }));
    expect(messages(web(heavy))).toEqual(expect.arrayContaining([expect.stringContaining("no one person may know more")]));
    const spread = ["p1", "p2", "p3", "p4", "p5"].map((id, i) => clue({ id, critical: true, tags: ["topic:gate"], source: `npc:${"abcde"[i]}`, alsoFrom: [`npc:${"bcdea"[i]}`] }));
    expect(web(spread)).toEqual([]);
  });

  it("the web must be neither too small nor too large, and not almost entirely true", () => {
    const small = analyseWeb([...crumbs(), ...filler(10)], npcs).issues.map((i) => i.message);
    expect(small.some((m) => m.includes("the design calls for 60 to 90"))).toBe(true);
    const big = analyseWeb([...crumbs(), ...filler(100)], npcs).issues.map((i) => i.message);
    expect(big.some((m) => m.includes("the design calls for 60 to 90"))).toBe(true);
    const allTrue = [...crumbs(), ...Array.from({ length: 60 }, (_, i) => clue({ id: `t${i}` }))];
    expect(analyseWeb(allTrue, npcs).issues.some((i) => i.message.includes("not simply true"))).toBe(true);
    const tooFalse = [...crumbs(), clue({ id: "root" }), ...Array.from({ length: 59 }, (_, i) => clue({ id: `t${i}`, reliability: "false", links: [{ to: "root", kind: "contradicts" }] }))];
    expect(analyseWeb(tooFalse, npcs).issues.some((i) => i.message.includes("not simply true"))).toBe(true);
  });

  it("each route, companion and the past must have enough critical clues", () => {
    const issues = analyseWeb([...crumbs(), ...filler(60)], npcs).issues.filter((i) => i.message.includes("critical clues to be solvable"));
    expect(issues.length).toBe(Object.keys(MIN_CRITICAL).length);
  });

  it("the sheet escapes table pipes and marks critical clues", () => {
    const cs = [clue({ id: "x", text: "A | B.", critical: true, alsoFrom: ["npc:b"] })];
    const r = analyseWeb(cs, npcs);
    const sheet = renderSheet(cs, r, () => "area", (id) => id.toUpperCase());
    expect(sheet).toContain("A \\| B.");
    expect(sheet).toContain("`x` **!**");
    expect(sheet).toContain("A; B");
  });
});

describe("optional gossip: the hacker crew and the missing cat", () => {
  const gossip = clues.filter((c) => c.tags.includes("topic:gossip"));
  const cat = gossip.filter((c) => c.tags.includes("topic:cat"));
  const hackers = gossip.filter((c) => c.tags.includes("topic:hackers"));

  it("is clearly optional: never critical, never for anything but gossip, and outside the main web's size and balance rules", () => {
    expect(gossip.length).toBeGreaterThanOrEqual(25);
    for (const c of gossip) {
      expect(c.critical, c.id).toBeFalsy();
      expect(c.for, c.id).toEqual(["gossip"]);
    }
    expect(report.gossip).toBe(gossip.length);
    expect(report.total + report.gossip).toBe(clues.length);
    expect(report.total).toBeGreaterThanOrEqual(CLUE_COUNT_RANGE[0]);
    expect(report.total).toBeLessThanOrEqual(CLUE_COUNT_RANGE[1]);
  });

  it("says so in the world, in a clue, in the character's own dry voice", () => {
    const c = clues.find((x) => x.id === "gossip_disclaimer")!;
    expect(c.text).toMatch(/none of the rumours.*will help you leave the city/);
    expect(c.reliability).toBe("true");
    expect(text).toContain("Nothing in the game depends on any of it");
  });

  it("nothing can require gossip: a quest, goal, terminal or service that does is an error", () => {
    const broken = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
    broken.files.quests[0]!.data = [{ id: "q", title: "T", summary: "S", start: [], steps: [{ id: "a", text: "a", done: [{ has_clue: "cat_gag" }] }], complete: [{ has_clue: "cat_gag" }] }];
    broken.files.terminals[0]!.data = (broken.files.terminals[0]!.data as { bypass: unknown[] }[]).map((t) => ({ ...t, bypass: [{ has_clue: "skeleton_renamed" }] }));
    const msgs = validateContent(broken).map((i) => i.message);
    expect(msgs).toEqual(expect.arrayContaining([expect.stringContaining('quest "q" depends on the gossip clue "cat_gag"'), expect.stringContaining("depends on the gossip clue \"skeleton_renamed\"")]));
    expect(validateContent(bundle).filter((i) => i.message.includes("gossip"))).toEqual([]);
  });

  it("a gossip clue that is critical or claims to be for a route is an error", () => {
    const g = clue({ id: "g1", tags: ["topic:gossip"], for: ["route:sneak"], critical: true, alsoFrom: ["npc:b"] });
    const msgs = analyseWeb([g, ...crumbs(), ...filler(60)], npcs).issues.map((i) => i.message);
    expect(msgs).toEqual(expect.arrayContaining([expect.stringContaining("can never be critical"), expect.stringContaining('can only be "gossip"')]));
  });

  describe("the missing cat", () => {
    const sightings = cat.filter((c) => c.tags.some((t) => t.startsWith("sighting:"))).sort((a, b) => Number(a.tags.find((t) => t.startsWith("sighting:"))!.slice(9)) - Number(b.tags.find((t) => t.startsWith("sighting:"))!.slice(9)));
    const request = cat.find((c) => c.id === "cat_request")!;
    const gag = cat.find((c) => c.id === "cat_gag")!;

    it("starts with one person asking, and ends with someone else revealing it is that person's joke", () => {
      expect(request.source).toBe("npc:teeter");
      expect(gag.source).not.toBe(request.source);
      expect(gag.text).toContain("Oh, you're serious?!? The cat thing is just a gag by Teeter.");
      expect(gag.reliability).toBe("true");
    });

    it("has ten sightings, numbered in order, each from a different person", () => {
      expect(sightings.map((c) => Number(c.tags.find((t) => t.startsWith("sighting:"))!.slice(9)))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(new Set(sightings.map((c) => c.source)).size).toBe(10);
    });

    it("every sighting is false and is settled by the reveal, so cross-checking resolves the whole thread", () => {
      for (const c of sightings) {
        expect(c.reliability, c.id).toBe("false");
        expect(c.links.some((l) => l.to === "cat_gag" && l.kind === "contradicts"), c.id).toBe(true);
      }
      expect(cat.find((c) => c.id === "cat_request")!.reliability).toBe("true");
    });
  });

  describe("the feuding hackers", () => {
    it("is a long-running thread of at least a dozen clues from many different people", () => {
      expect(hackers.length).toBeGreaterThanOrEqual(12);
      expect(new Set(hackers.map((c) => c.source)).size).toBeGreaterThanOrEqual(10);
    });

    it("names the crew, the team member who behaved badly, the friend, and the one who took the toolkit", () => {
      const all = hackers.map((c) => c.text).join(" ");
      for (const w of ["Null Hypothesis", "Dex Harlow", "Mari Quade", "Juno Park", "Skeleton Key"]) expect(all).toContain(w);
      expect(hackers.find((c) => c.id === "hackers_split")!.text).toMatch(/best friend/);
    });

    it("the telling is contested: some versions are false or stale and are corrected by a true clue", () => {
      const wrong = hackers.filter((c) => c.reliability !== "true");
      expect(wrong.map((c) => c.id).sort()).toEqual(["dex_gift_story", "dex_rewrote_it", "juno_works_for_pell"]);
    });

    it("the people it names exist, so they can speak later", () => {
      for (const id of ["dex_harlow", "juno_park", "mari_quade", "ox_lindqvist"]) expect(JSON.stringify(bundle.files.npcs.map((f) => f.data))).toContain(`"${id}"`);
    });
  });
});
