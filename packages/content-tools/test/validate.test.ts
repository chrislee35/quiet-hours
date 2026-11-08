// covers: NFR-5
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadContent, validateContent } from "../src/index.ts";

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
});
