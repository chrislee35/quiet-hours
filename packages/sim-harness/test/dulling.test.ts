// covers: CLU-6 (the Lull smudges the newest notebook entries; sleep restores them; the Memory Anchor stops it; nothing is ever lost), T4.2
import { describe, expect, it } from "vitest";
import { dulledCount, dulledIds, exposureTicks, smudge, notebookItems, ticksPerGameMinute } from "@qh/core";
import { assemble, loadContent } from "../../content-tools/src/index.ts";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const content = a.content;
const tpm = ticksPerGameMinute(config);
const lullGame = () => {
  const s = new Scenario(config, 1, a.worlds, content, "lull");
  // four clues learned at different times, so there is an order
  s.edit((st) => { ["lull_harmless", "odile_content", "hackers_reunion", "cat_host"].forEach((id, i) => { st.clues[id] = { learnedTick: 10 + i, from: "test", status: "unverified" }; }); });
  return s;
};
const stay = (s: Scenario, minutes: number) => s.advanceTicks(Math.round(minutes * tpm));
const items = (s: Scenario) => notebookItems(s.sim.state, content, config);
const clean = (id: string) => content.clues[id]!.text;

describe("the Lull's dulling", () => {
  it("does nothing during the grace period", () => {
    const s = lullGame();
    stay(s, config.lull.graceMinutes - 2);
    expect(dulledCount(s.sim.state, config)).toBe(0);
    expect(items(s).every((i) => !i.dulled)).toBe(true);
  });
  it("then smudges the newest entries first, and more the longer you stay", () => {
    const s = lullGame();
    stay(s, config.lull.graceMinutes + 1);
    const first = dulledIds(s.sim.state, config);
    expect(first.size).toBe(config.lull.perStep);
    expect(first.has("cat_host")).toBe(true); // the newest
    expect(first.has("lull_harmless")).toBe(false); // the oldest of four, spared
    stay(s, config.lull.stepMinutes);
    expect(dulledCount(s.sim.state, config)).toBe(config.lull.perStep * 2);
    expect(items(s).every((i) => i.dulled)).toBe(true); // only four clues here
  });
  it("blurs the words on screen but never changes or removes the clue", () => {
    const s = lullGame();
    stay(s, config.lull.graceMinutes + 1);
    const it = items(s).find((i) => i.clueId === "cat_host")!;
    expect(it.dulled).toBe(true);
    expect(it.text).not.toBe(clean("cat_host"));
    expect(it.text).toContain("▒");
    expect(it.text.split(" ")[0]).toBe(clean("cat_host").split(" ")[0]);
    expect(s.sim.state.clues.cat_host).toBeDefined();
    expect(Object.keys(s.sim.state.clues)).toHaveLength(4);
    expect(smudge("cat_host", clean("cat_host"))).toBe(it.text); // the same blur every time
  });
  it("never goes past the cap", () => {
    const s = lullGame();
    stay(s, 400);
    expect(dulledCount(s.sim.state, config)).toBeLessThanOrEqual(config.lull.maxDulled);
  });
  it("leaving does not clear it, and the exposure stops building outside", () => {
    const s = lullGame();
    stay(s, config.lull.graceMinutes + 1);
    const exit = s.sim.world.exits.find((e) => e.id === "stairs_to_civic")!;
    s.player(exit.x + 0.5, exit.y + 0.5).command({ type: "Interact" });
    s.expectEvent("MapChanged", { from: "lull", to: "civic_core" });
    s.advanceTicks(2);
    const at = exposureTicks(s.sim.state);
    s.advanceTicks(Math.round(30 * tpm));
    expect(exposureTicks(s.sim.state)).toBe(at);
    expect(items(s).some((i) => i.dulled)).toBe(true);
  });
  it("sleep restores every entry exactly", () => {
    const s = lullGame();
    stay(s, config.lull.graceMinutes + 12);
    expect(items(s).some((i) => i.dulled)).toBe(true);
    s.command({ type: "ApplyEffects", effects: [{ rest: true }] });
    s.expectEvent("NotebookRestored", {});
    expect(dulledCount(s.sim.state, config)).toBe(0);
    for (const i of items(s)) {
      expect(i.dulled).toBe(false);
      expect(i.text).toBe(clean(i.clueId));
    }
  });
  it("a Memory Anchor stops it altogether, and it is inert outside the Lull", () => {
    const s = lullGame();
    s.edit((st) => { st.augments.owned.push("memory_anchor"); st.augments.equipped.push("memory_anchor"); });
    stay(s, 120);
    expect(exposureTicks(s.sim.state)).toBe(0);
    expect(items(s).every((i) => !i.dulled)).toBe(true);
  });
  it("a worn Anchor does not undo what was already smudged without it", () => {
    const s = lullGame();
    stay(s, config.lull.graceMinutes + 1);
    s.edit((st) => { st.augments.owned.push("memory_anchor"); st.augments.equipped.push("memory_anchor"); });
    const at = exposureTicks(s.sim.state);
    stay(s, 30);
    expect(exposureTicks(s.sim.state)).toBe(at);
  });
  it("nowhere else smudges anything", () => {
    for (const map of ["stacks", "civic_core", "belt", "underworks"]) {
      const s = new Scenario(config, 1, a.worlds, content, map);
      s.advanceTicks(Math.round(90 * tpm));
      expect(exposureTicks(s.sim.state), map).toBe(0);
    }
  });
});

describe("the Memory Anchor from Doc Perrin", () => {
  it("is built for 25 credits once you know it exists", () => {
    const s = new Scenario(config, 1, a.worlds, content, "stacks");
    s.edit((st) => { st.inventory.credits = 30; st.clues.memory_anchor_exists = { learnedTick: 0, from: "test", status: "unverified" }; });
    s.command({ type: "ApplyEffects", effects: [{ use_service: "perrin_memory_anchor" }] });
    expect(s.sim.state.augments.owned).toContain("memory_anchor");
    expect(s.sim.state.inventory.credits).toBe(5);
  });
});
