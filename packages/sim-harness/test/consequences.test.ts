// covers: WLD-7/WLD-6 consequences (T4.5): the Hollow's discovery risk, the raid, warning and averting it, what the break route costs it; disrupting the Lull
import { describe, expect, it } from "vitest";
import { canBring, dulledCount, exposureTicks, finalizeEscape, hollowOutcome, hollowRisk, puzzleModule, ticksPerGameMinute } from "@qh/core";
import { assemble, loadContent } from "../../content-tools/src/index.ts";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const content = a.content;
const tpm = ticksPerGameMinute(config);
const game = (map: string) => new Scenario(config, 1, a.worlds, content, map);
const flags = (s: Scenario) => s.sim.state.flags;
const at = (s: Scenario, id: string) => {
  const o = [...s.sim.world.npcs, ...s.sim.world.terminals, ...s.sim.world.exits, ...s.sim.world.pickups].find((x) => x.id === id)!;
  return s.player(o.x + 0.5, o.y + 0.5);
};
const hours = (s: Scenario, h: number) => s.advanceTicks(Math.round(h * 60 * tpm));
const events = (s: Scenario, name: string) => s.eventsOfType("Custom").filter((e) => e.name === name);

describe("the Hollow's discovery risk", () => {
  it("counts points: the informant sold +2, each trail +1 (to 3), a lookout -1, the informant won over -1", () => {
    const s = game("stacks");
    expect(hollowRisk(s.sim.state)).toBe(0);
    s.edit((st) => { st.flags.mrs_sold = true; });
    expect(hollowRisk(s.sim.state)).toBe(2);
    s.edit((st) => { st.flags.hollow_trails = 9; });
    expect(hollowRisk(s.sim.state)).toBe(5);
    s.edit((st) => { st.flags.hollow_watch = true; });
    expect(hollowRisk(s.sim.state)).toBe(4);
    s.edit((st) => { st.flags.mrs_sold = false; st.flags.mrs_safe = true; st.flags.hollow_trails = 0; });
    expect(hollowRisk(s.sim.state)).toBe(0); // never below nothing
  });
  it("selling out the informant alone is not enough to bring a raid", () => {
    const s = game("stacks");
    s.edit((st) => { st.flags.mrs_sold = true; });
    hours(s, 12);
    expect(flags(s).hollow_doomed).toBeUndefined();
    expect(flags(s).hollow_discovered).toBeUndefined();
  });
  it("a sold informant and one trail set a raid in motion, which lands after the delay: the Hollow is wiped", () => {
    const s = game("stacks");
    s.edit((st) => { st.flags.mrs_sold = true; st.flags.hollow_trails = 1; });
    s.advanceTicks(2);
    expect(flags(s).hollow_doomed).toBe(true);
    expect(events(s, "hollow_doomed")).toHaveLength(1);
    hours(s, config.hollow.raidDelayMinutes / 60 - 1);
    expect(flags(s).hollow_discovered).toBeUndefined();
    hours(s, 2);
    expect(flags(s).hollow_discovered).toBe(true);
    expect(flags(s).hollow_outcome).toBe("wiped");
    expect(events(s, "hollow_raided")).toHaveLength(1);
    expect(hollowOutcome(s.sim.state)).toBe("wiped");
  });
  it("three trails do it without any informant", () => {
    const s = game("stacks");
    s.edit((st) => { st.flags.hollow_trails = 3; });
    s.advanceTicks(2);
    expect(flags(s).hollow_doomed).toBe(true);
  });
  it("a lookout posted in time calls the raid off", () => {
    const s = game("stacks");
    s.edit((st) => { st.flags.mrs_sold = true; st.flags.hollow_trails = 1; });
    s.advanceTicks(2);
    s.edit((st) => { st.flags.hollow_watch = true; }); // SQ-07 done
    s.advanceTicks(2);
    expect(flags(s).hollow_doomed).toBeUndefined();
    expect(events(s, "hollow_spared")).toHaveLength(1);
    hours(s, 8);
    expect(flags(s).hollow_discovered).toBeUndefined();
  });
  it("arriving on alert adds a trail each time, arriving quietly never does", () => {
    const go = (alert: number) => {
      const s = game("underworks");
      s.edit((st) => { st.alert.level = alert as 0 | 1 | 2 | 3; });
      s.command({ type: "ApplyEffects", effects: [{ unlock_door: "door_hollow" }] });
      at(s, "tunnel_to_hollow").command({ type: "Interact" }).advanceTicks(2);
      return s;
    };
    expect(flags(go(1)).hollow_trails).toBe(1);
    expect(flags(go(0)).hollow_trails).toBeUndefined();
  });
});

describe("warning Marrow, and the raid itself", () => {
  const doomed = () => {
    const s = game("hollow");
    s.edit((st) => { st.flags.met_marrow = true; st.flags.mrs_sold = true; st.flags.hollow_trails = 1; });
    s.advanceTicks(2);
    return s;
  };
  it("a warning turns a wipe-out into a scattering", () => {
    const s = doomed();
    at(s, "marrow").command({ type: "Interact" }).say("A raid is coming. The city has a trail to your door. You have a few hours.");
    expect(flags(s).hollow_warned).toBe(true);
    s.command({ type: "EndConversation" });
    hours(s, config.hollow.raidDelayMinutes / 60 + 1);
    expect(flags(s).hollow_outcome).toBe("scattered");
  });
  it("without the warning Marrow has nothing to say about it", () => {
    const s = game("hollow");
    s.edit((st) => { st.flags.met_marrow = true; });
    at(s, "marrow").command({ type: "Interact" });
    expect(JSON.stringify(s.sim.dialogue()!.lines)).not.toMatch(/Say it/);
  });
  it("when the raid lands everyone in the Hollow is gone, and a player still inside is spotted", () => {
    const s = doomed();
    for (let i = 0; i < 400 && flags(s).hollow_discovered !== true; i++) s.advanceTicks(Math.round(tpm)); // a game minute at a time, to catch the moment
    expect(flags(s).hollow_discovered).toBe(true);
    s.advanceTicks(2);
    expect(Object.values(s.sim.state.npcs).every((n) => n.away)).toBe(true);
    expect(s.sim.state.alert.level).toBe(2);
  });
  it("June can no longer leave with you", () => {
    const s = game("hollow");
    s.edit((st) => { st.flags.hollow_discovered = true; st.flags.marrow_consent = true; st.flags.child_route = true; st.trust.juniper = 1; });
    expect(canBring(s.sim.state, content, config, "juniper")).toBe(false);
  });
});

describe("leaving by the Gate: what falls on the Hollow", () => {
  const leave = (route: string, set: (f: Record<string, unknown>) => void) => {
    const s = game("stacks");
    s.edit((st) => { st.flags.route_taken = route; set(st.flags); });
    s.edit((st) => { finalizeEscape(st, content, config, []); });
    return flags(s).sequel_hollow;
  };
  it("the break route with any risk costs it: wiped, or scattered if it was warned", () => {
    expect(leave("break", (f) => { f.mrs_sold = true; })).toBe("wiped");
    expect(leave("break", (f) => { f.hollow_risk = true; f.hollow_warned = true; })).toBe("scattered");
  });
  it("the break route with no risk, or any other route, leaves it hidden", () => {
    expect(leave("break", () => {})).toBe("hidden");
    expect(leave("sneak", (f) => { f.mrs_sold = true; })).toBe("hidden");
    expect(leave("hack", (f) => { f.hollow_trails = 2; })).toBe("hidden");
  });
});

describe("disrupting the Lull", () => {
  const solve = (s: Scenario, id: string) => {
    at(s, id).command({ type: "Interact" });
    const puzzle = content.puzzles[content.terminals[id]!.puzzle]!;
    const mod = puzzleModule(puzzle)!;
    for (const i of mod.solve(puzzle, mod.init(puzzle))!) s.command({ type: "TerminalTap", index: i });
    return s.command({ type: "ExitTerminal" });
  };
  it("the governor in the back room switches it off: the city feels it", () => {
    const s = game("lull");
    const m = { ...s.sim.state.metrics };
    solve(s, "lull_governor");
    expect(flags(s).lull_disrupted).toBe(true);
    expect(s.sim.state.metrics.contentment).toBeLessThan(m.contentment);
    expect(s.sim.state.metrics.order).toBeLessThan(m.order);
    expect(s.sim.state.alert.level).toBeGreaterThanOrEqual(1);
    expect(events(s, "lull_disrupted")).toHaveLength(1);
  });
  it("it stops dulling the notebook", () => {
    const s = game("lull");
    s.edit((st) => { st.flags.lull_disrupted = true; });
    hours(s, 3);
    expect(exposureTicks(s.sim.state)).toBe(0);
    expect(dulledCount(s.sim.state, config)).toBe(0);
  });
  it("it no longer pulls Odile back when she is left alone, but her fear of an alert remains", () => {
    const lone = game("civic_core");
    lone.edit((st) => { st.flags.lull_awake = true; st.flags.lull_disrupted = true; st.trust.odile = 1; });
    hours(lone, config.lull.leftAloneMinutes / 60 + 2);
    expect(flags(lone).odile_lapsed).toBeUndefined();
    const scared = game("civic_core");
    scared.edit((st) => { st.flags.lull_awake = true; st.flags.lull_disrupted = true; st.alert.level = 2; });
    scared.advanceTicks(2);
    expect(flags(scared).odile_lapsed).toBe(true);
  });
  it("the patrons are not all glad of it: the Host and Marta answer", () => {
    const s = game("lull");
    s.edit((st) => { st.flags.lull_disrupted = true; });
    at(s, "host").command({ type: "Interact" });
    expect(JSON.stringify(s.sim.dialogue()!.lines)).toMatch(/Nobody here was asked/);
    s.say("Goodbye.").command({ type: "EndConversation" });
    at(s, "marta_anselm").command({ type: "Interact" });
    expect(JSON.stringify(s.sim.dialogue()!.lines)).toMatch(/Why did you wake me/);
  });
  it("it is recorded for the sequel", () => {
    const s = game("stacks");
    s.edit((st) => { st.flags.lull_disrupted = true; });
    s.edit((st) => { finalizeEscape(st, content, config, []); });
    expect(flags(s).sequel_lull).toBe("disrupted");
  });
});
