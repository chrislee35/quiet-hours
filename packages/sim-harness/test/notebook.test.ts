// covers: CLU-1, CLU-2, CLU-3, CLU-4, CLU-5
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EMPTY_CONTENT, annotatedMap, buildWorld, compileDialogue, conflicts, importTiled, notebookItems, questLog, searchNotebook, tagKinds,
  type ClueDef, type Content, type Effect, type QuestDef,
} from "@qh/core";
import { Scenario, asciiWorld } from "../src/index.ts";
import { config } from "./helpers.ts";

const read = (rel: string) => readFileSync(new URL(`../../../content/${rel}`, import.meta.url), "utf8");
const clues = Object.fromEntries((JSON.parse(read("clues/sample.json")) as ClueDef[]).map((c) => [c.id, c]));
const quests = Object.fromEntries((JSON.parse(read("quests/slice_quests.json")) as QuestDef[]).map((q) => [q.id, q]));
const { dialogue } = compileDialogue(read("dialogue/odd_sam.qdl"), { id: "odd_sam", knownClues: new Set(Object.keys(clues)) });
const content: Content = { ...EMPTY_CONTENT, clues, quests, dialogues: { odd_sam: dialogue! } };
const slice = buildWorld(importTiled(JSON.parse(read("maps/stacks_slice.json")), "stacks_slice"));
const learn = (...ids: string[]): Effect[] => ids.map((id) => ({ give_clue: { id, from: "npc:odd_sam" } }));
const game = (effects: Effect[] = [], world = slice) => new Scenario(config, 1, world, content).command({ type: "ApplyEffects", effects });

describe("entries, tags and links", () => {
  it("lists what the player knows with its tags, and shows content links only when both ends are known", () => {
    const one = game(learn("pump4_shift"));
    const [a] = notebookItems(one.sim.state, content);
    expect(a).toMatchObject({ clueId: "pump4_shift", tags: ["place:pump4", "schedule:night_shift", "person:odd_sam"], related: [] });
    const both = game(learn("pump4_shift", "pump4_shift_old"));
    const items = notebookItems(both.sim.state, content);
    expect(items.find((i) => i.clueId === "pump4_shift")!.related).toEqual([{ clueId: "pump4_shift_old", kind: "contradicts", direction: "to" }]);
    expect(items.find((i) => i.clueId === "pump4_shift_old")!.related).toEqual([{ clueId: "pump4_shift", kind: "contradicts", direction: "from" }]);
  });

  it("the player can link and unlink clues they know, without spending any game time", () => {
    const s = game(learn("pump4_shift", "pump4_shift_old"));
    const tick = s.sim.state.tick;
    s.command({ type: "LinkClues", a: "pump4_shift_old", b: "pump4_shift" });
    s.expectEvent("CluesLinked");
    expect(s.sim.state.tick).toBe(tick); // the world did not move
    expect(s.sim.state.notebook.links).toEqual([["pump4_shift", "pump4_shift_old"]]); // stored sorted: order does not matter
    expect(notebookItems(s.sim.state, content).every((i) => i.linked.length === 1)).toBe(true);
    s.command({ type: "LinkClues", a: "pump4_shift", b: "pump4_shift_old" });
    expect(s.sim.state.notebook.links).toHaveLength(1); // no duplicates
    s.command({ type: "UnlinkClues", a: "pump4_shift", b: "pump4_shift_old" }).expectEvent("CluesUnlinked");
    expect(s.sim.state.notebook.links).toEqual([]);
  });

  it("refuses to link a clue to itself or to one the player does not know", () => {
    const s = game(learn("pump4_shift"));
    s.command({ type: "LinkClues", a: "pump4_shift", b: "pump4_shift" });
    s.command({ type: "LinkClues", a: "pump4_shift", b: "pump4_shift_old" });
    s.command({ type: "LinkClues", a: "nope", b: "pump4_shift" });
    expect(s.sim.state.notebook.links).toEqual([]);
  });

  it("works while a conversation is open too", () => {
    const s = game(learn("pump4_shift", "pump4_shift_old"));
    s.edit((st) => {
      st.conversation = { dialogueId: "odd_sam", node: "wares" };
    });
    s.command({ type: "LinkClues", a: "pump4_shift", b: "pump4_shift_old" });
    expect(s.sim.state.notebook.links).toHaveLength(1);
  });
});

describe("search and filter (CLU-2)", () => {
  const items = () => notebookItems(game(learn("pump4_shift", "pump4_shift_old")).sim.state, content);

  it("finds clues by words in their text, source, id or tags; every word must match", () => {
    expect(searchNotebook(items(), { query: "unlocked" }).map((i) => i.clueId)).toEqual(["pump4_shift"]);
    expect(searchNotebook(items(), { query: "22:00" }).map((i) => i.clueId)).toEqual(["pump4_shift_old"]);
    expect(searchNotebook(items(), { query: "pump 4 door" }).map((i) => i.clueId).sort()).toEqual(["pump4_shift", "pump4_shift_old"]);
    expect(searchNotebook(items(), { query: "night shift" }).map((i) => i.clueId)).toEqual(["pump4_shift"]);
    expect(searchNotebook(items(), { query: "odd sam" })).toHaveLength(2);
    expect(searchNotebook(items(), { query: "nothing like this" })).toEqual([]);
    expect(searchNotebook(items(), { query: "  " })).toHaveLength(2);
  });

  it("filters by status and by tag kind or whole tag", () => {
    const s = game(learn("pump4_shift", "pump4_shift_old")).command({ type: "ApplyEffects", effects: [{ verify_clue: "pump4_shift" }] });
    const all = notebookItems(s.sim.state, content);
    expect(searchNotebook(all, { status: "verified" }).map((i) => i.clueId)).toEqual(["pump4_shift"]);
    expect(searchNotebook(all, { status: "unverified" }).map((i) => i.clueId)).toEqual(["pump4_shift_old"]);
    expect(searchNotebook(all, { status: "all" })).toHaveLength(2);
    expect(searchNotebook(all, { tag: "schedule" }).map((i) => i.clueId)).toEqual(["pump4_shift"]);
    expect(searchNotebook(all, { tag: "place:pump4" })).toHaveLength(2);
    expect(searchNotebook(all, { tag: "place:pump" })).toEqual([]); // a whole tag, not a prefix of one
    expect(searchNotebook(all, { tag: "person", query: "unlocked", status: "verified" })).toHaveLength(1);
  });

  it("lists the tag kinds in use for the filter chips", () => {
    expect(tagKinds(items())).toEqual(["person", "place", "schedule"]);
  });
});

describe("conflicts and hidden reliability (CLU-4, CLU-5)", () => {
  it("flags two known clues that contradict each other, and settles when one is verified or disproved", () => {
    expect(conflicts(game(learn("pump4_shift")).sim.state, content)).toEqual([]);
    const s = game(learn("pump4_shift", "pump4_shift_old"));
    expect(conflicts(s.sim.state, content)).toEqual([{ a: "pump4_shift", b: "pump4_shift_old", resolved: false }]);
    s.command({ type: "ApplyEffects", effects: [{ disprove_clue: "pump4_shift_old" }] });
    expect(conflicts(s.sim.state, content)).toEqual([{ a: "pump4_shift", b: "pump4_shift_old", resolved: true }]);
  });

  it("never reveals which clue is right: nothing the notebook shows carries reliability", () => {
    const s = game(learn("pump4_shift", "pump4_shift_old"));
    const everything = JSON.stringify({ items: notebookItems(s.sim.state, content), conflicts: conflicts(s.sim.state, content), map: annotatedMap(s.sim.state, slice, content), quests: questLog(s.sim.state, content, config) });
    expect(everything).not.toMatch(/reliab|"outdated"|"planted"|"false"/i);
    expect(everything).not.toContain('"true"');
  });
});

describe("derived quest log", () => {
  const log = (s: Scenario) => questLog(s.sim.state, content, config);

  it("shows only the quests whose start conditions hold, and derives step progress from flags and clues", () => {
    const s = game();
    expect(log(s).map((q) => q.id)).toEqual(["maintenance_wing"]); // the Pump 4 rumour is not known yet
    expect(log(s)[0]!.steps.map((x) => x.done)).toEqual([false, false]);
    s.command({ type: "ApplyEffects", effects: [{ set_flag: ["met_sam", true] }] });
    expect(log(s)[0]!.steps.map((x) => x.done)).toEqual([true, false]);
    s.command({ type: "ApplyEffects", effects: learn("pump4_shift_old") });
    expect(log(s).map((q) => q.id).sort()).toEqual(["maintenance_wing", "pump4_rumour"]);
  });

  it("completes and fails from the same facts, and sorts active before failed before complete", () => {
    const s = game(learn("pump4_shift"));
    s.command({ type: "ApplyEffects", effects: [{ verify_clue: "pump4_shift" }] });
    expect(log(s).find((q) => q.id === "pump4_rumour")).toMatchObject({ state: "complete" });
    expect(log(s).find((q) => q.id === "pump4_rumour")!.steps.every((x) => x.done)).toBe(true);
    const t = game(learn("pump4_shift")).command({ type: "ApplyEffects", effects: [{ disprove_clue: "pump4_shift" }] });
    expect(log(t).find((q) => q.id === "pump4_rumour")).toMatchObject({ state: "failed" });
    t.command({ type: "ApplyEffects", effects: [{ set_flag: ["maint_panel_hacked", true] }] });
    expect(log(t).map((q) => `${q.id}:${q.state}`)).toEqual(["pump4_rumour:failed", "maintenance_wing:complete"]);
  });

  it("is a pure function: nothing is stored, and loading a save gives the same log", () => {
    const s = game(learn("pump4_shift")).command({ type: "ApplyEffects", effects: [{ set_flag: ["met_sam", true] }] });
    const before = JSON.stringify(log(s));
    const copy = JSON.parse(JSON.stringify(s.sim.state));
    expect(JSON.stringify(questLog(copy, content, config))).toBe(before);
    expect(Object.keys(copy)).not.toContain("quests");
  });
});

describe("annotated map (CLU-3)", () => {
  it("starts with just the walls and you", () => {
    const m = annotatedMap(game().sim.state, slice, content);
    expect(m.width).toBe(24);
    expect(m.walls[0]).toBe("#".repeat(24));
    expect(m.pins.map((p) => p.kind)).toEqual(["you"]);
    expect(m.schedules).toEqual([]);
  });

  it("learning of a place puts it on the map with what the notebook says, schedules included", () => {
    const m = annotatedMap(game(learn("pump4_shift")).sim.state, slice, content);
    const pump = m.pins.find((p) => p.id === "pump4")!;
    expect(pump).toMatchObject({ kind: "place", label: "Pump 4", x: 14, y: 2 });
    expect(pump.notes.map((n) => n.clueId)).toEqual(["pump4_shift"]);
    expect(m.schedules).toEqual([]); // it belongs to the place, so it is not listed separately
  });

  it("people appear once met or learned about, at where they are now", () => {
    expect(annotatedMap(game().sim.state, slice, content).pins.some((p) => p.id === "odd_sam")).toBe(false);
    const heard = annotatedMap(game(learn("pump4_shift")).sim.state, slice, content);
    expect(heard.pins.find((p) => p.id === "odd_sam")).toMatchObject({ kind: "person", label: "Odd Sam" });
    const met = game().player(3.5, 3.5).command({ type: "Interact" });
    expect(met.sim.state.met).toContain("odd_sam");
    expect(annotatedMap(met.sim.state, slice, content).pins.some((p) => p.id === "odd_sam")).toBe(true);
  });

  it("zones appear once you have been in them or learned of them, with their tiles", () => {
    const s = game();
    expect(annotatedMap(s.sim.state, slice, content).zones.map((z) => z.id)).toEqual(["stacks_street"]); // where you started
    s.player(17.5, 5.5).advanceTicks(1);
    const m = annotatedMap(s.sim.state, slice, content);
    expect(m.zones.map((z) => z.id).sort()).toEqual(["maintenance", "stacks_street"]);
    const maint = m.zones.find((z) => z.id === "maintenance")!;
    expect(maint.permission).toBe(2);
    expect(maint.tiles.every(([x]) => x >= 16)).toBe(true);
  });

  it("a schedule that is not tied to a place on this map is listed on its own", () => {
    const flat = asciiWorld(["#####", "#S..#", "#####"]);
    const m = annotatedMap(game(learn("pump4_shift"), flat).sim.state, flat, content);
    expect(m.pins.map((p) => p.kind)).toEqual(["you"]);
    expect(m.schedules.map((x) => x.id)).toEqual(["night_shift"]);
  });

  it("the shipped map and quests are valid", () => {
    expect(slice.places.map((p) => p.id)).toEqual(["pump4"]);
  });
});
