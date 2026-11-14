// covers: WLD-1 (the Safehouse hub: saving, shops, visible growth driven by flags)
import { describe, expect, it } from "vitest";
import { autosaveStatus, compileDialogue, createSave, hubGrowth, isGrown, loadSave, saveStatus, stringifySave } from "@qh/core";
import { assemble, loadContent } from "../../content-tools/src/index.ts";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const world = a.worlds.stacks!;
const content = a.content;
const start = (credits = 50) => new Scenario(config, 1, world, content).command({ type: "ApplyEffects", effects: [{ add_credits: credits }] });
const wren = (s: Scenario) => s.player(4.5, 9.0).command({ type: "Interact" });
const grown = (s: Scenario) => hubGrowth(s.sim.state, content, config).filter((g) => g.active).map((g) => g.id);
const flag = (...ids: string[]) => ids.map((id) => ({ set_flag: [id, true] as [string, boolean] }));
/** Wren's hub, from her first greeting, ready to talk about the cell. */
const hub = (s: Scenario) => wren(s).command({ type: "EndConversation" }).command({ type: "Interact" }).say("Is there anything I can do for the cell?");

describe("the Safehouse grows as the player helps (WLD-1)", () => {
  it("starts bare, and each growth appears when its condition does", () => {
    const s = start();
    expect(grown(s)).toEqual([]);
    s.command({ type: "ApplyEffects", effects: flag("met_teeter") });
    expect(grown(s)).toEqual(["radio_on"]);
    s.command({ type: "ApplyEffects", effects: flag("wren_vouched", "met_perrin", "quiet_step_found") });
    expect(grown(s)).toEqual(["radio_on", "tea_corner", "workbench", "cot_row"]);
  });

  it("is announced once, when it first appears, and never taken back", () => {
    const s = start().command({ type: "ApplyEffects", effects: flag("met_teeter") });
    expect(s.eventsOfType("HubGrew").map((e) => e.growthId)).toEqual(["radio_on"]);
    s.advance(2);
    expect(s.eventsOfType("HubGrew")).toHaveLength(1);
    s.command({ type: "ApplyEffects", effects: [{ set_flag: ["met_teeter", false] }] });
    expect(s.sim.state.hub.grown).toEqual(["radio_on"]); // kept for good
  });

  it("real play drives it: talking to Teeter, Perrin and Wren grows the hub", () => {
    const s = start();
    s.player(6.5, 10.9).command({ type: "Interact" });
    s.command({ type: "EndConversation" });
    expect(s.sim.state.hub.grown).toContain("radio_on");
    s.player(9.5, 6.9).command({ type: "Interact" }).command({ type: "EndConversation" });
    expect(s.sim.state.hub.grown).toContain("workbench");
    wren(s).say("What am I?").say("Why is that a gift?").say("Is there anyone who can help me?");
    expect(s.sim.state.hub.grown).toContain("tea_corner");
  });

  it("every growth has a prop to show it on the Stacks map, and every prop shows a real growth", () => {
    for (const g of Object.keys(content.growth)) expect(world.props.some((p) => p.shows === g), g).toBe(true);
    for (const p of world.props) if (p.shows) expect(content.growth[p.shows], p.id).toBeDefined();
    expect(world.props.filter((p) => p.shows === undefined).map((p) => p.kind)).toEqual(["bunk"]);
  });

  it("props sit inside the Safehouse, on floor", () => {
    for (const p of world.props) {
      expect(p.x).toBeGreaterThanOrEqual(2);
      expect(p.x).toBeLessThanOrEqual(11);
      expect(p.y).toBeGreaterThanOrEqual(4);
      expect(p.y).toBeLessThanOrEqual(11);
      expect(world.wall[p.y * world.width + p.x], p.id).toBe(0);
    }
  });

  it("the grown state is part of the save and survives a round trip", () => {
    const s = start().command({ type: "ApplyEffects", effects: flag("met_teeter", "cell_fund_1") });
    const back = loadSave(stringifySave(createSave(s.sim.state, "stacks", { build: "t", label: "t", savedAt: "x" })), config, world).state;
    expect(back.hub.grown).toEqual(["radio_on", "stores_shelf"]);
  });
});

describe("helping the cell with credits", () => {
  it("each donation is a step, in order, and the player cannot skip ahead or give twice", () => {
    const s = hub(start(200));
    const options = () => s.dialogue!.choices.map((c) => c.text);
    expect(options()).toContain("Chip in for the cell. (20 credits)");
    expect(options()).not.toContain("Chip in more. (40 credits)");
    s.say("Chip in for the cell. (20 credits)");
    expect(s.sim.state.inventory.credits).toBe(180);
    expect(s.sim.state.flags.cell_fund_1).toBe(true);
    expect(isGrown(s.sim.state, content, config, "stores_shelf")).toBe(true);
    s.say("Anything else?");
    expect(options()).not.toContain("Chip in for the cell. (20 credits)");
    s.say("Chip in more. (40 credits)").say("Anything else?").say("Chip in properly. (80 credits)");
    expect(s.sim.state.inventory.credits).toBe(60);
    expect(grown(s)).toEqual(expect.arrayContaining(["stores_shelf", "tool_rack", "warm_lamps"]));
  });

  it("the option is hidden when you cannot afford it", () => {
    const s = hub(start(10));
    expect(s.dialogue!.choices.map((c) => c.text)).not.toContain("Chip in for the cell. (20 credits)");
  });

  it("Wren notices: a warmer greeting once the lamps are up", () => {
    const s = start().command({ type: "ApplyEffects", effects: flag("met_wren", "cell_fund_3") });
    wren(s);
    expect(s.dialogue!.lines[0]!.text).toContain("Look at this place");
  });
});

describe("the stores", () => {
  const stores = (s: Scenario) => s.say("What is in the stores?");

  it("do not exist until the cell has funded a shelf, then stock grows with it", () => {
    const bare = hub(start());
    expect(bare.dialogue!.choices.map((c) => c.text)).not.toContain("What is in the stores?");
    const s = hub(start(300).command({ type: "ApplyEffects", effects: flag("cell_fund_1") }));
    stores(s);
    expect(s.dialogue!.choices.map((c) => c.text)).toEqual(["A noise-maker. (10 credits)", "Not now."]);
    s.command({ type: "ApplyEffects", effects: flag("cell_fund_2") });
    s.say("Not now.");
    stores(s);
    expect(s.dialogue!.choices.map((c) => c.text)).toEqual(["A noise-maker. (10 credits)", "Wire cutters. (25 credits)", "A stun charge. (40 credits)", "Not now."]);
  });

  it("selling charges the price and hands over the item; cutters are one per customer", () => {
    const s = hub(start(300).command({ type: "ApplyEffects", effects: flag("cell_fund_1", "cell_fund_2") }));
    stores(s).say("A noise-maker. (10 credits)").say("Anything else?");
    expect(s.sim.state.inventory.items.noise_maker).toBe(1);
    expect(s.sim.state.inventory.credits).toBe(290);
    s.say("Wire cutters. (25 credits)").say("Anything else?").say("Wire cutters. (25 credits)");
    expect(s.sim.state.inventory.items.wire_cutters).toBe(1);
    expect(s.dialogue!.notice).toBe("You have those already. They do not wear out.");
  });

  it("refuses when you cannot pay, with a line, and takes nothing", () => {
    const s = hub(start(5).command({ type: "ApplyEffects", effects: flag("cell_fund_1") }));
    stores(s).say("A noise-maker. (10 credits)");
    expect(s.dialogue!.notice).toContain("10 credits");
    expect(s.sim.state.inventory.items.noise_maker).toBeUndefined();
  });
});

describe("rest and saving", () => {
  it("resting drops the alert to Calm, says so, and is a safe moment to save", () => {
    const s = hub(start()).edit((st) => { st.alert.level = 3; });
    expect(autosaveStatus(s.sim.state)).toBe(false); // hunted: no autosave
    s.say("I would like to rest for a bit.");
    s.expectEvent("Rested");
    expect(s.alert).toBe(0);
    expect(autosaveStatus(s.sim.state)).toBe(true);
    expect(saveStatus(s.sim.state, world, config)).toEqual({ ok: true, where: "safe" });
  });

  it("resting when already Calm still counts as a checkpoint", () => {
    const s = hub(start()).say("I would like to rest for a bit.");
    s.expectEvent("Rested").expectNoEvent("AlertChanged");
  });

  it("the conditions and effects are in the shared language and compile", () => {
    const { dialogue, errors } = compileDialogue(`npc: wren\nnode: a\n  > [grown:warm_lamps] "x" {rest} -> a\n  > "y" -> a\n  end\n`, { id: "t" });
    expect(errors).toEqual([]);
    expect(dialogue!.nodes.a!.choices[0]).toMatchObject({ if: [{ has_growth: "warm_lamps" }], effects: [{ rest: true }] });
  });
});
