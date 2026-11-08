// covers: DLG-1, DLG-2, DLG-3, DLG-4, CLU-1, CLU-4, CLU-5, CMP-3, CORE-4, CORE-5
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_CONTENT, buildWorld, compileDialogue, importTiled, type ClueDef, type Content } from "@qh/core";
import { Scenario, asciiWorld } from "../src/index.ts";
import { config } from "./helpers.ts";

const read = (rel: string) => readFileSync(new URL(`../../../content/${rel}`, import.meta.url), "utf8");

/** Real shipped content: Odd Sam's conversation and the clue definitions. */
function realContent(): Content {
  const clues = Object.fromEntries((JSON.parse(read("clues/sample.json")) as ClueDef[]).map((c) => [c.id, c]));
  const { dialogue, errors } = compileDialogue(read("dialogue/odd_sam.qdl"), { id: "odd_sam", knownClues: new Set(Object.keys(clues)) });
  if (!dialogue) throw new Error(JSON.stringify(errors));
  return { ...EMPTY_CONTENT, dialogues: { odd_sam: dialogue }, clues };
}

const room = asciiWorld(["#######", "#S....#", "#######"], [], { npcs: [{ id: "odd_sam", x: 2, y: 1, dialogue: "odd_sam" }] });
/** Player stands next to Sam and starts talking. */
const talk = (content = realContent()) => new Scenario(config, 1, room, content).command({ type: "Interact" });

describe("starting a conversation", () => {
  it("Interact next to an NPC opens their dialogue; out of reach does nothing", () => {
    const near = talk();
    near.expectEvent("ConversationStarted", { npc: "odd_sam" });
    expect(near.dialogue?.name).toBe("Odd Sam");
    const far = new Scenario(config, 1, room, realContent()).player(5.5, 1.5).command({ type: "Interact" });
    expect(far.dialogue).toBeNull();
  });

  it("the first meeting differs from later visits (start conditions)", () => {
    const s = talk();
    expect(s.dialogue!.lines[0]!.text).toContain("New face");
    expect(s.sim.state.flags.met_sam).toBe(true);
    s.command({ type: "Choose", index: 1 }); // Never mind -> goodbye (end)
    s.command({ type: "EndConversation" });
    s.command({ type: "Interact" });
    expect(s.dialogue!.lines[0]!.text).toContain("Back again");
  });

  it("the world is frozen while talking: no time, no robot, no player movement", () => {
    const s = talk();
    const before = { tick: s.sim.state.tick, x: s.sim.state.player.x };
    s.command({ type: "SetMove", dx: 1, dy: 0, mode: "run" });
    s.command({ type: "Interact" });
    expect(s.sim.state.tick).toBe(before.tick);
    expect(s.sim.state.player.x).toBe(before.x);
    s.command({ type: "EndConversation" });
    s.advance(1);
    expect(s.sim.state.tick).toBeGreaterThan(before.tick);
    expect(s.sim.state.player.x).toBe(before.x); // the SetMove sent while frozen was ignored
  });

  it("the player stops moving when a conversation starts", () => {
    const s = new Scenario(config, 1, room, realContent()).command({ type: "SetMove", dx: 1, dy: 0, mode: "walk" }).command({ type: "Interact" });
    expect(s.sim.state.player.intent).toMatchObject({ dx: 0, dy: 0 });
  });
});

describe("Odd Sam: clue-gated options and information trading", () => {
  const toReturnVisit = () => {
    const s = talk();
    s.say("What do you sell?");
    return s;
  };

  it("the Pump 4 claim only appears once the player holds that clue (DLG-3)", () => {
    const s = talk();
    s.command({ type: "Choose", index: 0 }); // wares
    s.say("Not now.");
    const claim = "I heard the night shift at Pump 4 leaves the side door unlocked.";
    expect(s.dialogue!.choices.map((c) => c.text)).not.toContain(claim);
    s.command({ type: "ApplyEffects", effects: [{ give_clue: { id: "pump4_shift", from: "somewhere" } }] });
    expect(s.dialogue!.choices.map((c) => c.text)).toContain(claim);
  });

  it("buying the rumour costs credits, adds the clue, and the option disappears after", () => {
    const s = toReturnVisit().command({ type: "ApplyEffects", effects: [{ add_credits: 50 }] });
    const buy = "Buy the Pump 4 rumour. (20 credits)";
    expect(s.dialogue!.choices.map((c) => c.text)).toContain(buy);
    s.say(buy);
    expect(s.sim.state.inventory.credits).toBe(30);
    expect(s.sim.state.clues.pump4_shift).toMatchObject({ from: "odd_sam", status: "unverified" });
    s.say("Understood.").say("What do you sell?");
    expect(s.dialogue!.choices.map((c) => c.text)).not.toContain(buy);
  });

  it("cannot buy without enough credits", () => {
    const s = toReturnVisit();
    expect(s.dialogue!.choices.map((c) => c.text)).not.toContain("Buy the Pump 4 rumour. (20 credits)");
  });

  it("presenting the true clue verifies it and pays once; presenting it again pays nothing", () => {
    const s = toReturnVisit().command({ type: "ApplyEffects", effects: [{ add_credits: 20 }] });
    s.say("Buy the Pump 4 rumour. (20 credits)").say("Understood.");
    s.say("I have something to show you.");
    expect(s.dialogue!.canPresent).toBe(true);
    s.command({ type: "Present", clueId: "pump4_shift" });
    expect(s.sim.state.clues.pump4_shift!.status).toBe("verified");
    expect(s.sim.state.inventory.credits).toBe(15);
    expect(s.dialogue!.lines[0]!.text).toContain("matches what I have");
    s.say("Pleasure doing business.").say("I have something to show you.");
    s.command({ type: "Present", clueId: "pump4_shift" });
    expect(s.sim.state.inventory.credits).toBe(15);
    expect(s.dialogue!.lines[0]!.text).toContain("do not pay twice");
  });

  it("presenting the outdated clue marks it disproved (cross-checking)", () => {
    const s = toReturnVisit().say("Take the free sample.").say("Thanks.").say("I have something to show you.");
    s.command({ type: "Present", clueId: "pump4_shift_old" });
    expect(s.sim.state.clues.pump4_shift_old!.status).toBe("disproved");
    expect(s.dialogue!.lines[0]!.text).toContain("Stale");
  });

  it("an unrelated clue falls through to the '*' reaction", () => {
    const s = talk().say("Never mind.");
    s.command({ type: "EndConversation" }).command({ type: "Interact" });
    s.command({ type: "ApplyEffects", effects: [{ give_clue: { id: "pump4_shift_old", from: "x" } }] });
    s.say("I have something to show you.").command({ type: "Present", clueId: "pump4_shift" }); // not held: ignored
    expect(s.dialogue!.lines[0]!.text).toBe("Let me see it.");
  });

  it("hides reliability from the UI: the view exposes status only, never reliability", () => {
    const s = toReturnVisit().say("Take the free sample.").say("Thanks.").say("I have something to show you.");
    const entry = s.dialogue!.presentable[0]!;
    expect(Object.keys(entry).sort()).toEqual(["clueId", "from", "status", "text"]);
    expect(entry.status).toBe("unverified");
    expect(JSON.stringify(s.dialogue)).not.toContain("outdated");
  });

  it("only offers the clue picker in nodes that have a present: block", () => {
    expect(talk().dialogue!.canPresent).toBe(false);
    expect(talk().dialogue!.presentable).toEqual([]);
  });

  it("ending the conversation by choosing an 'end' route or by leaving both work", () => {
    const s = talk().say("Never mind."); // goodbye node: end
    expect(s.dialogue!.canLeave).toBe(true);
    s.command({ type: "EndConversation" });
    expect(s.dialogue).toBeNull();
    s.expectEvent("ConversationEnded");
  });

  it("invalid choice indexes and clue ids are ignored", () => {
    const s = talk();
    const node = s.sim.state.conversation!.node;
    s.command({ type: "Choose", index: 99 }).command({ type: "Choose", index: -1 }).command({ type: "Present", clueId: "nope" });
    expect(s.sim.state.conversation!.node).toBe(node);
  });

  it("plays the whole conversation to a stable state (state remains serializable)", () => {
    const s = talk().say("What do you sell?").say("Take the free sample.");
    expect(() => JSON.stringify(s.sim.state)).not.toThrow();
    expect(JSON.parse(JSON.stringify(s.sim.state)).conversation).toMatchObject({ dialogueId: "odd_sam" });
  });
});

describe("trust line (CMP-3)", () => {
  const src = `npc: pallas\nname: Pallas\ntrust: yes\nnode: a\n  pallas (curious): "Hm."\n  > "Hello." {trust:pallas+1} -> a\n  > "Insult." {trust:pallas-1} -> a\n`;
  const { dialogue } = compileDialogue(src, { id: "pallas" });
  const content: Content = { ...EMPTY_CONTENT, dialogues: { pallas: dialogue! } };
  const w = asciiWorld(["######", "#S...#", "######"], [], { npcs: [{ id: "pallas", x: 2, y: 1, dialogue: "pallas" }] });

  it("shows exactly one of three sentences and never a number", () => {
    const s = new Scenario(config, 1, w, content).command({ type: "Interact" });
    expect(s.dialogue!.trustLine).toBe("It appears that Pallas is unsure about you.");
    s.say("Hello.");
    expect(s.dialogue!.trustLine).toBe("It appears that Pallas trusts you.");
    s.say("Insult.").say("Insult.");
    expect(s.dialogue!.trustLine).toBe("It appears that Pallas does not trust you.");
    for (const text of ["unsure", "trusts", "does not trust"]) expect(text).not.toMatch(/\d/);
    expect(s.dialogue!.trustLine).not.toMatch(/\d/);
  });

  it("is absent for NPCs that do not track trust", () => {
    expect(talk().dialogue!.trustLine).toBeNull();
  });

  it("trust recovers after being lost (one act = one step)", () => {
    const s = new Scenario(config, 1, w, content).command({ type: "Interact" });
    s.say("Insult.").say("Hello.").say("Hello.");
    expect(s.dialogue!.trustLine).toBe("It appears that Pallas trusts you.");
  });
});

describe("shipped map", () => {
  it("places Odd Sam with an existing dialogue", () => {
    const map = JSON.parse(read("maps/stacks_slice.json"));
    const world = buildWorld(importTiled(map, "stacks_slice"));
    expect(world.npcs).toEqual([{ id: "odd_sam", x: 3, y: 3, dialogue: "odd_sam" }]);
    expect(Object.keys(realContent().dialogues)).toContain(world.npcs[0]!.dialogue);
  });
});
