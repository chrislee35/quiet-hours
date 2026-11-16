// covers: CMP-5 (Odile, the Signatory: waking her from the player's notebook, her fragility), T4.3
import { describe, expect, it } from "vitest";
import { canBring, routeClear, ticksPerGameMinute } from "@qh/core";
import { assemble, loadContent } from "../../content-tools/src/index.ts";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const content = a.content;
const tpm = ticksPerGameMinute(config);
const flags = (s: Scenario) => s.sim.state.flags;
const met = (s: Scenario) => s.edit((st) => { st.flags.met_odile = true; });
const learn = (s: Scenario, ...ids: string[]) => s.edit((st) => { for (const id of ids) st.clues[id] = { learnedTick: 5, from: "test", status: "unverified" }; });
const game = (map = "lull") => new Scenario(config, 1, a.worlds, content, map);
const toOdile = (s: Scenario) => {
  const o = s.sim.world.npcs.find((n) => n.id === "odile")!;
  return s.player(o.x + 0.5, o.y + 0.5).command({ type: "Interact" });
};
const show = (s: Scenario, id: string) => s.command({ type: "Present", clueId: id });
const water = (s: Scenario) => s.edit((st) => { st.inventory.items.clear_water = 1; });
const beats = (s: Scenario, second: string, third: string) => {
  s.say("Try this instead of the drink.").say("Yes.");
  show(s, second).say("Keep going.");
  show(s, third);
  return s;
};
const bring = (s: Scenario) => canBring(s.sim.state, content, config, "odile");

describe("waking Odile", () => {
  it("she starts pacified and cannot be brought", () => {
    const s = game();
    expect(flags(s).lull_awake).toBeUndefined();
    expect(bring(s)).toBe(false);
  });
  it("three beats wake her: water, the charter, what the Lull is", () => {
    const s = game();
    learn(s, "charter_countersign", "lull_machine_code");
    water(s);
    met(s);
    toOdile(s);
    beats(s, "charter_countersign", "lull_machine_code");
    expect(flags(s).odile_s1).toBe(true);
    expect(flags(s).odile_s2).toBe(true);
    expect(flags(s).lull_awake).toBe(true);
    expect(flags(s).awake_odile).toBe("person");
    expect(s.sim.state.trust.odile).toBe(1);
    expect(bring(s)).toBe(true);
    expect(s.sim.state.inventory.items.clear_water).toBeUndefined();
  });
  it("other clues work for the same beats: the signatory line and the Lull's dulling", () => {
    const s = game();
    learn(s, "odile_signatory", "lull_dulling");
    water(s);
    met(s);
    toOdile(s);
    beats(s, "odile_signatory", "lull_dulling");
    expect(flags(s).lull_awake).toBe(true);
  });
  it("showing the Lull's secret too soon does not wake her", () => {
    const s = game();
    learn(s, "lull_machine_code");
    water(s);
    met(s);
    toOdile(s).say("Try this instead of the drink.").say("Yes.");
    show(s, "lull_machine_code");
    expect(flags(s).lull_awake).toBeUndefined();
    expect(JSON.stringify(s.sim.dialogue()!.lines)).toMatch(/do not think I can hear it yet/);
  });
  it("planted clues do nothing", () => {
    const s = game();
    learn(s, "lull_harmless", "odile_content");
    water(s);
    met(s);
    toOdile(s).say("Try this instead of the drink.").say("Yes.");
    show(s, "lull_harmless");
    expect(flags(s).odile_s2).toBeUndefined();
    s.say("Never mind.");
    show(s, "odile_content");
    expect(flags(s).lull_awake).toBeUndefined();
  });
  it("the charter can be read on the plaza wall, so every beat can be had", () => {
    const s = game("civic_core");
    const pk = s.sim.world.pickups.find((p) => p.id === "pk_charter")!;
    s.player(pk.x + 0.5, pk.y + 0.5).command({ type: "Interact" });
    expect(s.sim.state.clues.charter_countersign).toBeDefined();
  });
  it("once awake she can be asked to come and released", () => {
    const s = game();
    s.edit((st) => { st.flags.lull_awake = true; st.flags.awake_odile = "person"; st.flags.met_odile = true; st.trust.odile = 1; });
    toOdile(s);
    s.say("Will you come with me? Out through the Gate.");
    expect(flags(s).companion).toBe("odile");
    s.say("Understood.").say("I cannot take you after all.");
    expect(flags(s).companion).toBe("none");
  });
});

const awake = (map = "lull") => {
  const s = game(map);
  s.edit((st) => { st.flags.lull_awake = true; st.trust.odile = 1; });
  return s;
};

describe("Odile is fragile", () => {
  it("a Hunting alert pulls her back under, wherever the player is", () => {
    for (const map of ["lull", "stacks"]) {
      const s = awake(map);
      s.edit((st) => { st.alert.level = 2; });
      s.advanceTicks(2);
      expect(flags(s).odile_lapsed, map).toBe(true);
      expect(flags(s).odile_lapse_cause).toBe("alert");
      expect(bring(s)).toBe(false);
    }
  });
  it("a mere Suspicious alert does not lapse her (it only stops the crossing)", () => {
    const s = awake();
    s.edit((st) => { st.alert.level = 1; });
    s.advanceTicks(2);
    expect(flags(s).odile_lapsed).toBeUndefined();
    s.edit((st) => { st.flags.companion = "odile"; });
    expect(routeClear(s.sim.state, content, config, "sneak")).toBe(false);
  });
  it("left alone too long she slides back; time in the Lull does not count", () => {
    const away = awake("civic_core");
    away.advanceTicks(Math.round((config.lull.leftAloneMinutes - 10) * tpm));
    expect(flags(away).odile_lapsed).toBeUndefined();
    away.advanceTicks(Math.round(20 * tpm));
    expect(flags(away).odile_lapsed).toBe(true);
    expect(flags(away).odile_lapse_cause).toBe("alone");
    const here = awake("lull");
    here.advanceTicks(Math.round((config.lull.leftAloneMinutes + 60) * tpm));
    expect(flags(here).odile_lapsed).toBeUndefined();
  });
  it("a visit resets the time away", () => {
    const s = awake("civic_core");
    s.advanceTicks(Math.round((config.lull.leftAloneMinutes - 30) * tpm));
    expect(Number(flags(s).odile_away)).toBeGreaterThan(0);
    const lull = new Scenario(config, 1, a.worlds, content, "lull");
    lull.edit((st) => { Object.assign(st.flags, s.sim.state.flags); });
    lull.advanceTicks(2);
    expect(flags(lull).odile_away).toBeUndefined();
  });
  it("as the chosen companion she is not 'alone' while you are away", () => {
    const s = awake("civic_core");
    s.edit((st) => { st.flags.companion = "odile"; });
    s.advanceTicks(Math.round((config.lull.leftAloneMinutes + 60) * tpm));
    expect(flags(s).odile_lapsed).toBeUndefined();
  });
  it("a lapse never lasts: clear water brings her round again", () => {
    const s = awake();
    s.edit((st) => { st.alert.level = 2; });
    s.advanceTicks(2);
    s.edit((st) => { st.alert.level = 0; });
    water(s);
    toOdile(s);
    expect(JSON.stringify(s.sim.dialogue()!.lines)).toMatch(/forgotten to say something/);
    s.say("Try this instead of the drink.");
    expect(flags(s).odile_lapsed).toBe(false);
    expect(bring(s)).toBe(true);
  });
  it("a lapsed companion can be released so the crossing is never blocked for good", () => {
    const s = awake();
    s.edit((st) => { st.flags.companion = "odile"; st.alert.level = 2; });
    s.advanceTicks(2);
    s.edit((st) => { st.alert.level = 0; });
    expect(routeClear(s.sim.state, content, config, "break")).toBe(false);
    toOdile(s).say("I cannot take you after all.");
    expect(flags(s).companion).toBe("none");
    expect(routeClear(s.sim.state, content, config, "break")).toBe(true);
  });
  it("she is not lapsed once the player has escaped", () => {
    const s = awake("stacks");
    s.edit((st) => { st.flags.escaped = true; st.alert.level = 3; });
    s.advanceTicks(2);
    expect(flags(s).odile_lapsed).toBeUndefined();
  });
});
