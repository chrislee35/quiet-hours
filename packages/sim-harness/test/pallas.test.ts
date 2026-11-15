// covers: PUZ-2 (the one inventory puzzle), CMP-3/4/5 for Pallas (trust a step at a time, recoverable, practical requirement), SQ-04 link
import { describe, expect, it } from "vitest";
import { assemble, loadContent } from "../../content-tools/src/index.ts";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const content = a.content;
const game = (map: string) => new Scenario(config, 1, a.worlds, content, map);
const at = (s: Scenario, id: string) => {
  const w = s.sim.world;
  const o = [...w.npcs, ...w.pickups, ...w.terminals].find((x) => x.id === id)!;
  return s.player(o.x + 0.5, o.y + (w.pickups.includes(o as never) ? 0.5 : 1.0));
};
const talk = (s: Scenario, id: string) => at(s, id).command({ type: "Interact" });
const give = (s: Scenario, ...effects: object[]) => s.command({ type: "ApplyEffects", effects: effects as never });
const items = (s: Scenario) => s.sim.state.inventory.items;
const trust = (s: Scenario) => s.sim.state.trust.pallas ?? 0;
const end = (s: Scenario) => s.command({ type: "EndConversation" });

describe("the inventory puzzle: Pallas's repair and registration", () => {
  it("the parts come from the world, two ways each", () => {
    // coupler: the scrap pile, or Brindle once freed
    const b = game("belt");
    at(b, "pk_coupler").command({ type: "Interact" });
    expect(items(b).drive_coupler).toBe(1);
    const b2 = give(game("belt"), { set_flag: ["brindle_freed", true] });
    talk(b2, "brindle").say("Pallas needs a coupler. Do you have one?");
    expect(items(b2).drive_coupler).toBe(1);
    // memory shard: the archive racks, or Doc Perrin for 25 credits
    const c = game("civic_core");
    at(c, "pk_memory_shard").command({ type: "Interact" });
    expect(items(c).memory_shard).toBe(1);
    const s = give(game("stacks"), { add_credits: 30 });
    talk(s, "doc_perrin").say("I need the bench.").say("Do you have a memory shard? (25 credits)");
    expect(items(s).memory_shard).toBe(1);
    expect(s.sim.state.inventory.credits).toBe(5);
    // Form 12-C: the rack, or Ines
    at(c, "pk_cargo_form").command({ type: "Interact" });
    expect(items(c).cargo_form).toBe(1);
    const i = game("civic_core");
    talk(i, "ines").say("What do you do here?").say("Could you spare a cargo declaration, Form 12-C?");
    expect(items(i).cargo_form).toBe(1);
  });

  it("the bench builds the drive and the tag from the parts, and not before", () => {
    const s = game("stacks");
    talk(s, "doc_perrin").say("What can you put in mine?");
    expect(s.dialogue!.choices.map((c) => c.text)).not.toContain("Build the drive.");
    end(s);
    give(s, { add_item: ["drive_coupler", 1] }, { add_item: ["memory_shard", 1] }, { add_item: ["cargo_form", 1] }, { add_item: ["permit_stamp", 1] });
    talk(s, "doc_perrin").say("I need the bench.").say("Build the drive.").say("Thank you.");
    end(s);
    expect(items(s).repaired_drive).toBe(1);
    expect(items(s).drive_coupler).toBeUndefined();
    expect(items(s).memory_shard).toBeUndefined();
    talk(s, "doc_perrin").say("I need the bench.").say("Press the tag.");
    expect(items(s).cargo_tag).toBe(1);
    expect(items(s).cargo_form).toBeUndefined();
  });

  it("start to finish: repair her drive, ask her consent, register her as cargo", () => {
    const s = game("stacks");
    talk(s, "pallas").say("Tell me more.").say("What is wrong with your drive?");
    expect(s.sim.state.clues.pallas_cargo).toBeDefined();
    expect(s.sim.state.flags.pallas_arc_started).toBe(true);
    end(s);
    give(s, { add_item: ["repaired_drive", 1] }, { add_item: ["cargo_tag", 1] });
    talk(s, "pallas").say("I have a new drive for you.");
    expect(s.sim.state.flags.pallas_repaired).toBe(true);
    expect(trust(s)).toBe(1);
    s.say("Good.");
    s.say("I have a cargo tag. It would let you pass the Gate as equipment. Only if you say yes.");
    expect(s.sim.state.flags.registered_as_cargo).toBe(true);
    expect(items(s).cargo_tag).toBeUndefined();
  });

  it("she will not be tagged unless she trusts you, and trust is recoverable", () => {
    const s = game("stacks");
    give(s, { set_flag: ["pallas_repaired", true] }, { add_item: ["cargo_tag", 1] });
    talk(s, "pallas").say("Tell me more.").say("What do you want, Pallas?").say("You are a maintenance unit. You want what you are assigned.");
    expect(trust(s)).toBe(-1);
    s.say("Anything else?");
    expect(s.dialogue!.choices.map((c) => c.text)).not.toContain("I have a cargo tag. It would let you pass the Gate as equipment. Only if you say yes.");
    s.say("I have a cargo tag.").say("Fair.");
    expect(s.sim.state.flags.registered_as_cargo).toBeUndefined();
    s.say("I am sorry. I was wrong to say that.");
    expect(trust(s)).toBe(0);
    s.say("Anything else?").say("I have a cargo tag."); // unsure is not enough
    expect(s.dialogue!.lines.at(-1)!.text).toContain("Ask me again");
  });

  it("an honest answer earns her trust", () => {
    const s = game("stacks");
    talk(s, "pallas").say("Tell me more.").say("What do you want, Pallas?").say("You are allowed to want anything.");
    expect(trust(s)).toBe(1);
    expect(s.dialogue!.lines.at(-1)!.text).toContain("Allowed");
  });
});
