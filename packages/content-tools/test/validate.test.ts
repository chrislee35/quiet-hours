// covers: NFR-5
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileDialogue } from "@qh/core";
import { loadContent, validateContent } from "../src/index.ts";
import { unrecoverableTrust } from "../src/dialogue-checks.ts";

const realContent = new URL("../../../content", import.meta.url).pathname;

/** Copy the real content to a temp dir so each test can break one thing. */
function fixture(mutate: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "qh-content-"));
  cpSync(realContent, dir, { recursive: true });
  mutate(dir);
  const { bundle, issues } = loadContent(dir);
  return [...issues, ...validateContent(bundle)];
}

const clue = (over: object) => ({
  id: "c1",
  text: "x",
  source: "npc:wren",
  reliability: "true",
  tags: [],
  links: [],
  ...over,
});

describe("content validation", () => {
  it("passes on the shipped content", () => {
    expect(fixture(() => {})).toEqual([]);
  });

  it("flags a clue with a bad reliability and extra property", () => {
    const issues = fixture((d) =>
      writeFileSync(join(d, "clues", "bad.json"), JSON.stringify([clue({ reliability: "maybe", bogus: 1 })])),
    );
    expect(issues.some((i) => i.file === "clues/bad.json")).toBe(true);
  });

  it("flags duplicate ids", () => {
    const issues = fixture((d) => writeFileSync(join(d, "clues", "dup.json"), JSON.stringify([clue({ id: "pump4_shift" })])));
    expect(issues.map((i) => i.message)).toContain('duplicate clues id "pump4_shift"');
  });

  it("flags a dangling clue source", () => {
    const issues = fixture((d) =>
      writeFileSync(join(d, "clues", "dangling.json"), JSON.stringify([clue({ source: "npc:nobody" })])),
    );
    expect(issues.some((i) => i.message.includes('source "npc:nobody" does not exist'))).toBe(true);
  });

  it("flags a dangling or self link", () => {
    const issues = fixture((d) =>
      writeFileSync(
        join(d, "clues", "links.json"),
        JSON.stringify([clue({ links: [{ to: "ghost", kind: "supports" }, { to: "c1", kind: "supports" }] })]),
      ),
    );
    const msgs = issues.map((i) => i.message).join("\n");
    expect(msgs).toContain('link target "ghost" does not exist');
    expect(msgs).toContain("links to itself");
  });

  it("reports unparseable JSON and a missing config instead of crashing", () => {
    const issues = fixture((d) => writeFileSync(join(d, "npcs", "broken.json"), "{ not json"));
    expect(issues.some((i) => i.message.startsWith("cannot parse JSON"))).toBe(true);
    const noConfig = fixture((d) => writeFileSync(join(d, "config", "tuning.json"), "{}"));
    expect(noConfig.some((i) => i.file === "config/tuning.json")).toBe(true);
  });

  it("validates maps: ships a good one, flags a door inside a wall and a map missing its collision layer", () => {
    const good = fixture(() => {});
    expect(good.filter((i) => i.file.startsWith("maps/"))).toEqual([]);

    const walled = fixture((d) => {
      const path = join(d, "maps", "stacks_slice.json");
      const m = JSON.parse(readFileSync(path, "utf8"));
      m.layers[2].objects[1].x = 0; // door at tile (0,3): a wall
      m.layers[2].objects[1].y = 96;
      writeFileSync(path, JSON.stringify(m));
    });
    expect(walled.some((i) => i.file === "maps/stacks_slice.json" && i.message.includes("inside a wall"))).toBe(true);

    const missing = fixture((d) =>
      writeFileSync(join(d, "maps", "empty.json"), JSON.stringify({ width: 1, height: 1, tilewidth: 32, tileheight: 32, layers: [] })),
    );
    expect(missing.some((i) => i.file === "maps/empty.json" && i.message.includes('"collision"'))).toBe(true);
  });

  it("validates dialogues: compile errors carry file and line; unknown references are caught", () => {
    expect(fixture(() => {}).filter((i) => i.file.startsWith("dialogue/"))).toEqual([]);

    const dead = fixture((d) => writeFileSync(join(d, "dialogue", "wren.qdl"), "npc: wren\nnode: a\n  wren: \"hi\"\n"));
    expect(dead).toContainEqual({ file: "dialogue/wren.qdl", message: 'line 2: dead end: node "a" has no choices and no "end"' });

    const unknownClue = fixture((d) =>
      writeFileSync(join(d, "dialogue", "wren.qdl"), 'npc: wren\nnode: a\n  > [clue:ghost] "x" -> a\n  > "y" -> a\n'),
    );
    expect(unknownClue.map((i) => i.message)).toContain('line 3: unknown clue "ghost"');

    const strangerNpc = fixture((d) => writeFileSync(join(d, "dialogue", "x.qdl"), 'npc: stranger\nnode: a\n  end\n'));
    expect(strangerNpc.map((i) => i.message)).toContain('npc "stranger" is not defined in content/npcs');
  });

  it("flags a conversation gated on a clue that no conversation ever gives", () => {
    const issues = fixture((d) => {
      // wren's clue pump4_shift_old is sourced from odd_sam; remove the only conversation that gives it.
      const path = join(d, "dialogue", "odd_sam.qdl");
      const text = readFileSync(path, "utf8").replace('{+clue:pump4_shift_old(odd_sam)}', "{flag:took_sample}");
      writeFileSync(path, text);
    });
    expect(issues.some((i) => i.message.includes('needs clue "pump4_shift_old", but no conversation ever gives it'))).toBe(true);
  });

  it("flags map NPCs that reference a missing dialogue or npc", () => {
    const issues = fixture((d) => {
      const path = join(d, "maps", "stacks_slice.json");
      const m = JSON.parse(readFileSync(path, "utf8"));
      const npc = m.layers[2].objects.find((o: { class: string }) => o.class === "npc");
      npc.name = "nobody";
      npc.properties[0].value = "missing_talk";
      writeFileSync(path, JSON.stringify(m));
    });
    const msgs = issues.map((i) => i.message);
    expect(msgs).toContain('npc "nobody" is not defined in content/npcs');
    expect(msgs).toContain('npc "nobody" uses unknown dialogue "missing_talk"');
  });
});

describe("trust recoverability (CMP-4)", () => {
  const compileOk = (src: string) => compileDialogue(src, { id: "t" }).dialogue!;
  it("flags an NPC whose trust can fall but never rise, and accepts one that can recover", () => {
    const down = compileOk(`npc: pallas\nnode: a\n  > "Betray." {trust:pallas-1} -> a\n  > "Bye." -> b\nnode: b\n  end\n`);
    expect(unrecoverableTrust([down])).toEqual(["pallas"]);
    const up = compileOk(`npc: pallas\nnode: a\n  > "Betray." {trust:pallas-1} -> a\n  > "Apologise." {trust:pallas+1} -> a\n  > "Bye." -> b\nnode: b\n  end\n`);
    expect(unrecoverableTrust([up])).toEqual([]);
  });
  it("does not count a recovery that is itself gated on already being trusted", () => {
    const gated = compileOk(`npc: pallas\nnode: a\n  > "Betray." {trust:pallas-1} -> a\n  > [trust:pallas>=trusts] "Reinforce." {trust:pallas+1} -> a\n  > "Bye." -> b\nnode: b\n  end\n`);
    expect(unrecoverableTrust([gated])).toEqual(["pallas"]);
    const open = compileOk(`npc: pallas\nnode: a\n  > "Betray." {trust:pallas-1} -> a\n  > [trust:pallas>=distrusts] "Apologise." {trust:pallas+1} -> a\n  > "Bye." -> b\nnode: b\n  end\n`);
    expect(unrecoverableTrust([open])).toEqual([]);
  });
  it("shipped dialogue passes", () => {
    expect(validateContent(loadContent(realContent).bundle).filter((i) => i.message.includes("CMP-4"))).toEqual([]);
  });
});

describe("puzzle kinds", () => {
  const messages = (puzzle: object) =>
    fixture((dir) => writeFileSync(join(dir, "puzzles", "extra.json"), JSON.stringify([puzzle]))).map((i) => i.message);

  it("rejects an unknown kind", () => {
    expect(messages({ id: "bad", kind: "slider" })).toEqual(expect.arrayContaining([expect.stringContaining("kind")]));
  });

  it("proves every kind solvable: an unsolvable or already-solved puzzle is an error", () => {
    const signal = { id: "sig", kind: "signal_path", width: 5, height: 3, cells: ["#####", "#./.#", "#####"], sources: [{ x: 1, y: 1, dir: "E" }], targets: [[3, 1]] };
    // The mirror can only deflect into a wall: the target can never be lit.
    expect(messages(signal)).toEqual(expect.arrayContaining([expect.stringContaining('puzzle "sig"')]));
    const schedule = { id: "sch", kind: "schedule_align", slots: 4, exclusive: true, tracks: [{ id: "a", name: "A", pattern: "####", locked: true }, { id: "b", name: "B", pattern: "#..." }] };
    expect(messages(schedule)).toEqual(expect.arrayContaining([expect.stringContaining("not solvable")]));
    const rules = { id: "ru", kind: "rule_contradiction", inputs: [{ id: "a", name: "A", value: true }], outputs: [{ id: "x", name: "X" }], rules: [{ id: "1", text: "", if: { a: true }, then: { x: true } }, { id: "2", text: "", if: { a: true }, then: { x: false } }] };
    expect(messages(rules)).toEqual(expect.arrayContaining([expect.stringContaining("already solved")]));
  });

  it("catches bad puzzles of the other kinds too", () => {
    const stuck = { id: "stuck", kind: "lights_out", width: 2, height: 2, layout: ["#o", ".."] };
    expect(messages(stuck)).toEqual(expect.arrayContaining([expect.stringContaining("not solvable")]));
    const open = { id: "open", kind: "code_lock", code: "00", feedback: "none" };
    expect(messages(open)).toEqual(expect.arrayContaining([expect.stringContaining("already solved")]));
    const loop = { id: "loopy", kind: "logic_circuit", inputs: [{ id: "a", name: "A" }], gates: [{ id: "g", op: "NOT", in: ["h"] }, { id: "h", op: "NOT", in: ["g"] }], goals: [{ name: "x", node: "g", want: true }] };
    expect(messages(loop)).toEqual(expect.arrayContaining([expect.stringContaining("earlier gate")]));
  });

  it("proves the nerdy kinds too: an ambiguous language puzzle, an impossible network and an unbalanceable equation are errors", () => {
    const e = { foreign: ["ka", "mi"], english: ["fox", "eats"] };
    const lang = { id: "lang", kind: "translation", examples: [e, e, e], target: ["ka", "mi"], choices: [["fox", "eats"], ["eats", "fox"]] };
    expect(messages(lang)).toEqual(expect.arrayContaining([expect.stringContaining("pin down")]));
    const net = { id: "net", kind: "neural_net", budget: 2, threshold: 0.99, noise: 0.1, seeds: { train: 1, test: 2, init: 3 } };
    expect(messages(net)).toEqual(expect.arrayContaining([expect.stringContaining("not solvable")]));
    const chem = { id: "chem", kind: "chem_balance", reactants: ["H2", "O2"], products: ["H2O"] };
    expect(messages(chem).filter((m) => m.includes('"chem"'))).toEqual([]);
    expect(messages({ ...chem, id: "chem2", products: ["CO2"] })).toEqual(expect.arrayContaining([expect.stringContaining("same elements")]));
    const cipher = { id: "ci", kind: "cipher", method: "caesar", plaintext: "short", key: "C" };
    expect(messages(cipher)).toEqual(expect.arrayContaining([expect.stringContaining("12 letters")]));
  });

  it("accepts a good puzzle of a new kind", () => {
    const good = { id: "ok", kind: "schedule_align", slots: 4, exclusive: true, tracks: [{ id: "a", name: "A", pattern: "#...", locked: true }, { id: "b", name: "B", pattern: "#..." }] };
    expect(messages(good).filter((m) => m.includes('"ok"'))).toEqual([]);
  });
});

describe("quests", () => {
  const messages = (quest: object) => fixture((dir) => writeFileSync(join(dir, "quests", "extra.json"), JSON.stringify([quest]))).map((i) => i.message);
  const good = { id: "q", title: "T", summary: "S", start: [], steps: [{ id: "a", text: "Do it", done: [{ flag: "x" }] }], complete: [{ flag: "x" }] };

  it("accepts a well-formed quest", () => {
    expect(messages(good).filter((m) => m.includes('quest "q"'))).toEqual([]);
  });

  it("rejects bad conditions, unknown clues and duplicate step ids", () => {
    expect(messages({ ...good, complete: [{ nonsense: 1 }] })).toEqual(expect.arrayContaining([expect.stringContaining('quest "q"')]));
    expect(messages({ ...good, start: [{ has_clue: "no_such_clue" }] })).toEqual(expect.arrayContaining([expect.stringContaining("unknown clue")]));
    expect(messages({ ...good, failed: [{ clue_state: ["ghost", "verified"] }] })).toEqual(expect.arrayContaining([expect.stringContaining("unknown clue")]));
    expect(messages({ ...good, steps: [good.steps[0], good.steps[0]] })).toEqual(expect.arrayContaining([expect.stringContaining("duplicate step")]));
  });

  it("a quest needs a way to finish and at least one step", () => {
    expect(messages({ ...good, complete: [] }).length).toBeGreaterThan(0);
    expect(messages({ ...good, steps: [] }).length).toBeGreaterThan(0);
  });
});
