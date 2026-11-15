// covers: STORY §5 side-quests SQ-01..SQ-10: each quest can start, can complete, and (where the story gives it a failure) can fail; SQ-02, SQ-09 and SQ-10 played end to end
import { describe, expect, it } from "vitest";
import { alertSystem, createInitialState, puzzleModule, questLog, type Condition } from "@qh/core";
import { assemble, loadContent, reachableFacts } from "../../content-tools/src/index.ts";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const content = a.content;
const game = (map = "stacks") => new Scenario(config, 1, a.worlds, content, map);
const at = (s: Scenario, id: string) => {
  const o = [...s.sim.world.npcs, ...s.sim.world.terminals, ...s.sim.world.exits, ...s.sim.world.pickups].find((x) => x.id === id)!;
  return s.player(o.x + 0.5, o.y + 0.5);
};
const flags = (s: Scenario) => s.sim.state.flags;
const stateOf = (s: Scenario, id: string) => questLog(s.sim.state, content, config).find((q) => q.id === id)?.state;
const solve = (s: Scenario, id: string) => {
  at(s, id).command({ type: "Interact" });
  const puzzle = content.puzzles[content.terminals[id]!.puzzle]!;
  const mod = puzzleModule(puzzle)!;
  for (const i of mod.solve(puzzle, mod.init(puzzle))!) s.command({ type: "TerminalTap", index: i });
  return s.command({ type: "ExitTerminal" });
};

/** Edits state so that a list of conditions holds: flags, flag values, clues, items, trust, "any" (the first), "not" flag. */
function satisfy(s: Scenario, conds: Condition[]): void {
  const apply = (c: Condition): void => {
    s.edit((st) => {
      if ("flag" in c) st.flags[c.flag] = true;
      else if ("flag_eq" in c) st.flags[c.flag_eq[0]] = c.flag_eq[1];
      else if ("clue_state" in c) st.clues[c.clue_state[0]] = { learnedTick: 0, from: "test", status: c.clue_state[1] };
      else if ("has_clue" in c) st.clues[c.has_clue] = { learnedTick: 0, from: "test", status: "unverified" };
      else if ("has_item" in c) st.inventory.items[Array.isArray(c.has_item) ? c.has_item[0] : c.has_item] = Array.isArray(c.has_item) ? c.has_item[1] : 1;
      else if ("trust_gte" in c) st.trust[c.trust_gte[0]] = c.trust_gte[1];
      else if ("not" in c && "flag" in c.not) delete st.flags[c.not.flag];
    });
    if ("any" in c) apply(c.any[0]!);
    if ("all" in c) c.all.forEach(apply);
  };
  conds.forEach(apply);
}

const quests = Object.values(content.quests);

describe("every quest has a start, a complete and, where the story gives it one, a fail path (STORY §5)", () => {
  it("there are quests for SQ-01 to SQ-06 and SQ-09, SQ-10 (SQ-07 and SQ-08 arrive with the Hollow and the Lull, T4.4 and T4.1)", () => {
    expect(Object.keys(content.quests).sort()).toEqual([
      "act1_safehouse", "apology_express", "brindles_hum", "first_cache", "lost_in_processing", "maintenance_wing", "pirate_hour", "pump4_rumour", "pump4_thermos", "right_on_time", "statistic", "stitch_in_time",
    ]);
  });
  it.each(quests.map((q) => [q.id]))("%s: not in the log before it starts, active when it starts, complete when it completes", (id) => {
    const q = content.quests[id!]!;
    const fresh = game();
    if (q.start.length > 0) expect(stateOf(fresh, q.id), "before").toBeUndefined();
    const started = game();
    satisfy(started, q.start);
    expect(stateOf(started, q.id), "started").toBe("active");
    const done = game();
    satisfy(done, [...q.start, ...q.complete]);
    expect(stateOf(done, q.id), "complete").toBe("complete");
    expect(questLog(done.sim.state, content, config).find((x) => x.id === q.id)!.steps.every((s) => s.done)).toBe(true);
  });
  const failing = quests.filter((q) => (q.failed?.length ?? 0) > 0);
  it("the quests that can fail: SQ-01 (Dov is arrested), SQ-02 (she reports you), SQ-04 (Brindle is recycled), and the slice rumour", () => {
    expect(failing.map((q) => q.id).sort()).toEqual(["brindles_hum", "lost_in_processing", "pump4_rumour", "stitch_in_time"]);
  });
  it.each(failing.map((q) => [q.id]))("%s: fails when its failure holds, unless it was already completed", (id) => {
    const q = content.quests[id!]!;
    const s = game();
    satisfy(s, [...q.start, ...q.failed!]);
    expect(stateOf(s, q.id)).toBe("failed");
    satisfy(s, q.complete);
    expect(stateOf(s, q.id)).toBe("complete");
  });
  it("no quest is required by the main route: every route out of the Gate works with none of them done", () => {
    for (const q of quests) expect(q.id.length).toBeGreaterThan(0);
    const gates = JSON.stringify(Object.values(content.services).filter((s) => s.effects.some((e) => "set_flag" in e && e.set_flag[0] === "route_taken")).map((s) => s.requires));
    expect(gates).not.toMatch(/"sq_\d\d_done"/);
  });
});

describe("SQ-02 A Stitch in Time (Mrs. Adeyemi-Roth)", () => {
  const talk = () => game().edit((st) => { st.flags.met_mrs = true; st.clues.neighbor_wellness = { learnedTick: 0, from: "test", status: "unverified" }; });
  it("win her over: a harmless report earns her trust, then her landing is a hiding spot and she stops reporting", () => {
    const s = talk();
    expect(stateOf(s, "stitch_in_time")).toBe("active");
    at(s, "mrs_adeyemi_roth").command({ type: "Interact" }).say("I wanted to ask about being on it.").say("A harmless report. Something true and dull.").say("Anything for a quiet life.");
    expect(flags(s).mrs_fed).toBe(true);
    expect(s.sim.state.trust.mrs_adeyemi_roth).toBe(1);
    s.say("If I ever had to hide, would you let me use your landing?");
    expect(flags(s).mrs_safe).toBe(true);
    expect(flags(s).sq_02_outcome).toBe("won");
    expect(stateOf(s, "stitch_in_time")).toBe("complete");
    expect(flags(s).hollow_risk).toBeUndefined();
  });
  it("sell her out: forty credits, the Hollow's risk goes up, and she is gone", () => {
    const s = talk();
    const before = s.sim.state.inventory.credits;
    at(s, "mrs_adeyemi_roth").command({ type: "Interact" }).say("I wanted to ask about being on it.").say("I will be sure to be good.").say("There is a reward for Neighbor Wellness informants who are found out. I could find you out.").say("Forty credits is forty credits.");
    expect(s.sim.state.inventory.credits).toBe(before + 40);
    expect(flags(s).mrs_sold).toBe(true);
    expect(flags(s).hollow_risk).toBe(true);
    expect(flags(s).sq_02_outcome).toBe("sold");
    expect(stateOf(s, "stitch_in_time")).toBe("complete");
    s.say("Goodbye.").command({ type: "EndConversation" });
    at(s, "mrs_adeyemi_roth").command({ type: "Interact" });
    expect(JSON.stringify(s.sim.dialogue()!.lines)).toMatch(/van came/);
  });
  it("threaten her and the quest fails; an apology brings it back to active", () => {
    const s = talk();
    at(s, "mrs_adeyemi_roth").command({ type: "Interact" }).say("I wanted to ask about being on it.").say("I will be sure to be good.").say("I will report you before you report me.");
    expect(stateOf(s, "stitch_in_time")).toBe("failed");
    s.say("Goodbye.").command({ type: "EndConversation" });
    at(s, "mrs_adeyemi_roth").command({ type: "Interact" }).say("I wanted to ask about being on it.").say("I will be sure to be good.").say("I am sorry about what I said.");
    expect(stateOf(s, "stitch_in_time")).toBe("active");
  });
  it("her reports stop once she is on your side or gone", () => {
    const raised = (setup: (s: Scenario) => void) => { const s = game(); setup(s); s.command({ type: "ApplyEffects", effects: [{ emit: "mrs_report" }] }).advanceTicks(2); return s.sim.state.alert.level; };
    expect(raised(() => {})).toBe(1);
    expect(raised((s) => s.edit((st) => { st.flags.mrs_safe = true; }))).toBe(0);
    expect(raised((s) => s.edit((st) => { st.flags.mrs_sold = true; }))).toBe(0);
  });
});

describe("SQ-09 Statistic (Doc Perrin)", () => {
  const perrin = () => game().edit((st) => { st.flags.met_perrin = true; });
  it("start, fetch by the puzzle or by cutting the hasp, bring Anecdote home for a band slot", () => {
    for (const how of ["puzzle", "cutters"]) {
      const s = perrin();
      expect(stateOf(s, "statistic")).toBeUndefined();
      at(s, "doc_perrin").command({ type: "Interact" }).say("Is Statistic all right? It seems low.");
      expect(flags(s).sq_09_started).toBe(true);
      expect(stateOf(s, "statistic")).toBe("active");
      s.say("I will see what I can do.").command({ type: "EndConversation" });
      if (how === "puzzle") solve(s, "evidence_locker");
      else { s.edit((st) => { st.inventory.items.wire_cutters = 1; }); at(s, "evidence_locker").command({ type: "Interact" }); expect(s.sim.state.terminals.evidence_locker!.solved).toBe(true); s.command({ type: "ExitTerminal" }); }
      expect(s.sim.state.inventory.items.anecdote).toBe(1);
      expect(s.sim.state.alert.level).toBeGreaterThanOrEqual(1); // the cabinet is noticed
      expect(steps(s)).toEqual([true, true, false]);
      const slots = s.sim.state.augments.slots;
      at(s, "doc_perrin").command({ type: "Interact" }).say("I found Anecdote.");
      expect(flags(s).sq_09_done).toBe(true);
      expect(s.sim.state.inventory.items.anecdote).toBeUndefined();
      expect(s.sim.state.augments.slots).toBe(slots + 1);
      expect(stateOf(s, "statistic")).toBe("complete");
    }
  });
  const steps = (s: Scenario) => questLog(s.sim.state, content, config).find((q) => q.id === "statistic")!.steps.map((x) => x.done);
  it("the cabinet is no use to anyone who is not on the quest: nothing changes without Perrin, and the reward is paid once", () => {
    const s = perrin();
    s.edit((st) => { st.flags.sq_09_started = true; st.inventory.items.anecdote = 1; });
    at(s, "doc_perrin").command({ type: "Interact" }).say("I found Anecdote.");
    s.say("Glad to help.").command({ type: "EndConversation" });
    const slots = s.sim.state.augments.slots;
    s.edit((st) => { st.inventory.items.anecdote = 1; });
    at(s, "doc_perrin").command({ type: "Interact" });
    expect(s.sim.state.augments.slots).toBe(slots);
  });
});

describe("SQ-10 Pirate Hour (Teeter)", () => {
  const teeter = () => game().edit((st) => { st.flags.met_teeter = true; });
  it("start, boost the rig, play the song between 21:00 and 21:30: alert drops to Calm, and for a day nobody is looked at harder than Suspicious", () => {
    const s = teeter();
    at(s, "teeter").command({ type: "Interact" }).say("What is the dial set to?");
    expect(flags(s).sq_10_started).toBe(true);
    s.say("I will try the rig.").command({ type: "EndConversation" });
    solve(s, "radio_rig");
    expect(flags(s).radio_boosted).toBe(true);
    s.edit((st) => { st.alert.level = 2; });
    // the wrong hour
    s.advanceToMinuteOfDay(12 * 60).advanceTicks(2);
    at(s, "teeter").command({ type: "Interact" }).say("Play it now.");
    expect(flags(s).pirate_played).toBeUndefined();
    expect(s.sim.state.conversation?.notice).toMatch(/nine and half past nine/);
    s.command({ type: "EndConversation" });
    s.advanceToMinuteOfDay(21 * 60 + 10).advanceTicks(2);
    at(s, "teeter").command({ type: "Interact" }).say("Play it now.");
    expect(flags(s).pirate_played).toBe(true);
    expect(flags(s).sq_10_done).toBe(true);
    expect(s.sim.state.alert.level).toBe(0);
    expect(flags(s).pirate_calm).toBe(true);
    expect(stateOf(s, "pirate_hour")).toBe("complete");
    s.command({ type: "EndConversation" });
    // once only
    at(s, "teeter").command({ type: "Interact" });
    expect(s.sim.dialogue()!.choices.map((c) => c.text)).not.toContain("Play it now.");
  });
  it("the calm lasts a day, then ends", () => {
    const s = teeter().edit((st) => { st.flags.radio_boosted = true; });
    s.advanceToMinuteOfDay(21 * 60 + 10).advanceTicks(2);
    at(s, "teeter").command({ type: "Interact" }).say("Play it now.");
    expect(flags(s).pirate_calm).toBe(true);
    s.command({ type: "EndConversation" });
    for (let i = 0; i < 400 && flags(s).pirate_calm === true; i++) s.advanceTicks(500);
    expect(flags(s).pirate_calm).toBe(false);
  });
  it("while the calm lasts, being spotted does not raise a level that is already Suspicious or worse; without it, it does", () => {
    const spotted = (calm: boolean, level: 0 | 1 | 2) => {
      const st = createInitialState(1, config, a.worlds.stacks!);
      st.tick = 100000;
      st.alert.level = level;
      st.alert.quietSince = st.tick; // just seen, so it does not decay in the same tick
      st.flags.pirate_calm = calm;
      alertSystem({ state: st, config, events: [{ type: "RobotSpotted", tick: st.tick, robotId: "r" }] } as never);
      return st.alert.level;
    };
    expect(spotted(false, 1)).toBe(2);
    expect(spotted(true, 1)).toBe(1);
    expect(spotted(true, 2)).toBe(2);
    expect(spotted(true, 0)).toBe(1); // a first sighting still counts
  });
});

describe("every side-quest can be finished from a fresh start (cross-map closure)", () => {
  const facts = reachableFacts(a.worlds, content, a.start);
  it.each([["sq_01_done"], ["sq_02_done"], ["sq_03_done"], ["sq_05_done"], ["sq_06_done"], ["sq_09_done"], ["sq_10_done"]])("%s can be set", (flag) => {
    expect(facts.flag(flag!), flag).toBe(true);
  });
  it("both of SQ-02's endings are possible, and the item for SQ-09 can be had", () => {
    expect(facts.flag("sq_02_outcome", "won")).toBe(true);
    expect(facts.flag("sq_02_outcome", "sold")).toBe(true);
    expect(facts.item("anecdote")).toBe(true);
  });
});
