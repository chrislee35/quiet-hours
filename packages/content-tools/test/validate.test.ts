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
