// covers: WLD-6 (the Lull: arrival, no patrols, shops, the Host's gossip), SQ-08 Table for One (Lila Voss), the machine-origin terminal
import { describe, expect, it } from "vitest";
import { puzzleModule, questLog } from "@qh/core";
import { assemble, loadContent, reachableFacts } from "../../content-tools/src/index.ts";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const content = a.content;
const lull = a.worlds.lull!;
const game = (map = "lull") => new Scenario(config, 1, a.worlds, content, map);
const at = (s: Scenario, id: string) => {
  const o = [...s.sim.world.npcs, ...s.sim.world.terminals, ...s.sim.world.exits, ...s.sim.world.pickups].find((x) => x.id === id)!;
  return s.player(o.x + 0.5, o.y + 0.5);
};
const flags = (s: Scenario) => s.sim.state.flags;
const has = (s: Scenario, clue: string) => s.sim.state.clues[clue] !== undefined;
const quest = (s: Scenario) => questLog(s.sim.state, content, config).find((q) => q.id === "table_for_one")?.state;
const talk = (s: Scenario, npc: string, ...lines: string[]) => {
  at(s, npc).command({ type: "Interact" });
  for (const l of lines) s.say(l);
  return s;
};
const leave = (s: Scenario) => s.say("Goodbye.").command({ type: "EndConversation" });

describe("the Lull", () => {
  it("is reached by the gilded arch from the Civic Core and back up the stairs", () => {
    const s = game("civic_core");
    at(s, "gilded_arch_to_lull").command({ type: "Interact" });
    s.expectEvent("MapChanged", { from: "civic_core", to: "lull" });
    at(s, "stairs_to_civic").command({ type: "Interact" });
    s.expectEvent("MapChanged", { from: "lull", to: "civic_core" });
  });
  it("is a safe place: no robots and no cameras, and no curfew zone", () => {
    expect(lull.robots).toHaveLength(0);
    expect(lull.cameras).toHaveLength(0);
    expect(lull.zones.every((z) => !z.curfew)).toBe(true);
  });
  it("has the Host, Lila, Marta and Odile, and a terminal in the back room", () => {
    expect(lull.npcs.map((n) => n.id).sort()).toEqual(["host", "lila_voss", "marta_anselm", "odile"]);
    expect(lull.terminals.map((t) => t.id)).toEqual(["lull_core"]);
  });
});

describe("the Host and the shops", () => {
  it("the first talk gives the planted line that the Lull is harmless; asking about the crew and the cat gives the gossip", () => {
    const s = talk(game(), "host", "What is this place?");
    expect(has(s, "lull_harmless")).toBe(true);
    s.say("Thank you.").say("Anything happening here tonight?");
    expect(has(s, "hackers_reunion")).toBe(true);
    s.say("That sounds like them.").say("Has a cat been in? Grey, unimpressed.");
    expect(has(s, "cat_host")).toBe(true);
  });
  it("the Host's two things about Odile: the false 'retired happily' line, then the true ones", () => {
    const s = talk(game(), "host", "Something else.", "Who is the woman in the corner booth?");
    expect(has(s, "odile_content")).toBe(true);
    expect(has(s, "odile_signatory")).toBe(false);
    s.say("Is she somebody important?");
    expect(has(s, "odile_signatory")).toBe(true);
    expect(has(s, "odile_lapse")).toBe(true);
  });
  it("the perfect drink is free; a song costs three; water costs two and cannot be bought twice", () => {
    const s = game();
    s.edit((st) => { st.inventory.credits = 10; });
    talk(s, "host", "A drink, perhaps.");
    s.say("The perfect drink.");
    expect(flags(s).had_perfect_drink).toBe(true);
    expect(s.sim.state.inventory.credits).toBe(10);
    s.say("Yes.").say("A drink.").say("A song for me. (3 credits)");
    expect(s.sim.state.inventory.credits).toBe(7);
    s.say("Thank you.").say("A drink.").say("Just a glass of water. (2 credits)").say("Quite well. Water, please.");
    expect(s.sim.state.inventory.items.clear_water).toBe(1);
    expect(s.sim.state.inventory.credits).toBe(5);
    s.say("Thank you.").say("A drink.");
    expect(JSON.stringify(s.sim.dialogue()!.choices)).not.toMatch(/glass of water/);
  });
  it("without the credits there is no water", () => {
    const s = game();
    s.edit((st) => { st.inventory.credits = 1; });
    talk(s, "host", "A drink, perhaps.");
    expect(JSON.stringify(s.sim.dialogue()!.choices)).not.toMatch(/glass of water/);
  });
});

describe("SQ-08 Table for One", () => {
  it("is not in the log until Lila has been spoken to; then it is active", () => {
    const s = game();
    expect(quest(s)).toBeUndefined();
    talk(s, "lila_voss");
    expect(flags(s).sq_08_started).toBe(true);
    expect(quest(s)).toBe("active");
  });
  it("the diary is had from the Host, and the water from the bar: Lila wakes", () => {
    const s = game();
    s.edit((st) => { st.inventory.credits = 10; });
    talk(s, "lila_voss", "What did you come for?");
    leave(s);
    s.command({ type: "EndConversation" });
    talk(s, "host", "Something else.", "A guest has lost a little notebook with a green ribbon. Ms Voss.");
    expect(s.sim.state.inventory.items.lila_diary).toBe(1);
    s.say("Thank you.").say("A drink.").say("Just a glass of water. (2 credits)").say("Quite well. Water, please.").say("Thank you.");
    leave(s);
    talk(s, "lila_voss", "Drink this first. Not the amber. Then read.");
    expect(flags(s).sq_08_done).toBe(true);
    expect(flags(s).lila_awake).toBe(true);
    expect(quest(s)).toBe("complete");
    expect(has(s, "lull_dulling")).toBe(true);
    expect(has(s, "odile_signatory")).toBe(true);
    expect(s.sim.state.inventory.items.lila_diary).toBeUndefined();
    expect(s.sim.state.inventory.items.clear_water).toBeUndefined();
  });
  it("the diary alone is not enough: she cannot hold it with the amber in the way", () => {
    const s = game();
    talk(s, "lila_voss");
    leave(s);
    s.edit((st) => { st.inventory.items.lila_diary = 1; });
    talk(s, "lila_voss", "Read it.");
    expect(flags(s).sq_08_done).toBeUndefined();
    expect(quest(s)).toBe("active");
  });
  it("the Host will not hand it over before Lila has been spoken to", () => {
    const s = talk(game(), "host");
    expect(JSON.stringify(s.sim.dialogue()!.choices)).not.toMatch(/notebook/);
  });
  it("the other way to the diary: the staff door opens only between 03:00 and 03:30 and the drawer is behind it", () => {
    const s = game();
    s.advanceToMinuteOfDay(12 * 60).advanceTicks(2);
    expect(s.sim.state.doors["door_staff"]!.locked).toBe(true);
    s.advanceToMinuteOfDay(3 * 60 + 10).advanceTicks(2);
    expect(s.sim.state.doors["door_staff"]!.locked).toBe(false);
    at(s, "pk_drawer").command({ type: "Interact" }).expectEvent("PickedUp", { pickupId: "pk_drawer" });
    expect(s.sim.state.inventory.items.lila_diary).toBe(1);
  });
  it("can be completed from a fresh start (cross-map closure)", () => {
    expect(reachableFacts(a.worlds, content, a.start).flag("sq_08_done")).toBe(true);
  });
});

describe("Marta and the back room", () => {
  it("Marta writes the same card each month; Dov's name is answered", () => {
    const s = talk(game(), "marta_anselm");
    expect(JSON.stringify(s.sim.dialogue()!.lines)).toMatch(/lovely time/);
    s.edit((st) => { st.clues.dov_sister_lull = { learnedTick: 0, from: "test", status: "unverified" }; });
    s.say("Another time.");
  });
  it("the mixing desk shows the machine's fingerprints", () => {
    const s = game();
    at(s, "lull_core").command({ type: "Interact" });
    const puzzle = content.puzzles[content.terminals.lull_core!.puzzle]!;
    const mod = puzzleModule(puzzle)!;
    for (const i of mod.solve(puzzle, mod.init(puzzle))!) s.command({ type: "TerminalTap", index: i });
    s.command({ type: "ExitTerminal" });
    expect(has(s, "lull_machine_code")).toBe(true);
    expect(flags(s).lull_core_read).toBe(true);
  });
});
