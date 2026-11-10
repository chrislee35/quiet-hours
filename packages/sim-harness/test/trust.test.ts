// covers: CMP-3, CMP-4
import { describe, expect, it } from "vitest";
import { EMPTY_CONTENT, compileDialogue, validateEffect, type Content, type Effect } from "@qh/core";
import { Scenario, asciiWorld } from "../src/index.ts";
import { config } from "./helpers.ts";

const src = `npc: pallas
name: Pallas
trust: yes
node: hub
  pallas: "Well?"
  > "I kept my promise." {trust:pallas+1(kept the promise)} -> hub
  > "I told someone your secret." {trust:pallas-1(broke a confidence)} -> hub
  > "Never mind." -> bye
node: bye
  end
`;
const { dialogue, errors } = compileDialogue(src, { id: "pallas" });
const content: Content = { ...EMPTY_CONTENT, dialogues: { pallas: dialogue! } };
const world = asciiWorld(["#####", "#S..#", "#####"], [], { npcs: [{ id: "pallas", x: 2, y: 1, dialogue: "pallas" }] });
const talk = () => new Scenario(config, 1, world, content).command({ type: "Interact" });
const trust = (s: Scenario) => s.sim.state.trust.pallas ?? 0;
const adjust = (s: Scenario, delta: number, cause?: string) =>
  s.command({ type: "ApplyEffects", effects: [{ adjust_trust: cause ? ["pallas", delta, cause] : ["pallas", delta] } as Effect] });

describe("trust is a three-level state (CMP-3)", () => {
  it("the dialogue compiled", () => expect(errors).toEqual([]));

  it("starts unsure and is shown only as one line of words", () => {
    const view = talk().dialogue!;
    expect(view.trustLine).toBe("It appears that Pallas is unsure about you.");
  });

  it("the three lines are the only expression of it: no digits, no meter, no numeric field anywhere in the view", () => {
    const s = talk();
    const seen = new Set<string>();
    for (const step of [0, 1, 1, -1, -1, -1]) {
      if (step === 1) s.say("I kept my promise.");
      if (step === -1) s.say("I told someone your secret.");
      const view = s.dialogue!;
      seen.add(view.trustLine!);
      expect(view.trustLine).not.toMatch(/\d/);
      const json = JSON.stringify(view);
      expect(json).not.toMatch(/"trust"\s*:\s*-?\d/);
      expect(Object.keys(view).filter((k) => /trust/i.test(k))).toEqual(["trustLine"]);
    }
    expect([...seen].sort()).toEqual([
      "It appears that Pallas does not trust you.",
      "It appears that Pallas is unsure about you.",
      "It appears that Pallas trusts you.",
    ]);
  });

  it("an NPC that does not track trust shows no line at all", () => {
    const plain = compileDialogue("npc: pallas\nnode: a\n  pallas: \"Hi.\"\n  end\n", { id: "pallas" }).dialogue!;
    const s = new Scenario(config, 1, world, { ...EMPTY_CONTENT, dialogues: { pallas: plain } }).command({ type: "Interact" });
    expect(s.dialogue!.trustLine).toBeNull();
  });
});

describe("one act is one step, both ways (CMP-4)", () => {
  it("moves a whole step per act and stops at the ends", () => {
    const s = talk().command({ type: "EndConversation" });
    adjust(s, 1);
    expect(trust(s)).toBe(1);
    adjust(s, 1);
    expect(trust(s)).toBe(1); // already at the top
    adjust(s, -1);
    expect(trust(s)).toBe(0);
    adjust(s, -1);
    adjust(s, -1);
    expect(trust(s)).toBe(-1);
  });

  it("never moves more than one step even if content asks for more", () => {
    const s = talk().command({ type: "EndConversation" });
    adjust(s, -5);
    expect(trust(s)).toBe(-1);
    adjust(s, 3);
    expect(trust(s)).toBe(0);
  });

  it("content cannot ask for a bigger move: the validator rejects it", () => {
    expect(validateEffect({ adjust_trust: ["pallas", 2] })).not.toEqual([]);
    expect(validateEffect({ adjust_trust: ["pallas", 0] })).not.toEqual([]);
    expect(validateEffect({ adjust_trust: ["pallas", 1] })).toEqual([]);
    expect(validateEffect({ adjust_trust: ["pallas", -1, "a reason"] })).toEqual([]);
  });

  it("is always recoverable: from the worst state, repeated good acts reach 'trusts you'", () => {
    const s = talk();
    s.say("I told someone your secret.").say("I told someone your secret.");
    expect(trust(s)).toBe(-1);
    s.say("I kept my promise.").say("I kept my promise.");
    expect(trust(s)).toBe(1);
    expect(s.dialogue!.trustLine).toBe("It appears that Pallas trusts you.");
  });

  it("an arrest does not touch trust (FAIL-5)", () => {
    const s = talk().command({ type: "EndConversation" });
    adjust(s, 1);
    s.edit((st) => {
      st.arrestCount = 3;
    });
    expect(trust(s)).toBe(1);
  });
});

describe("the causes log (for tests and the inspector, never the player)", () => {
  it("records why each change happened, in order, with the event carrying the same cause", () => {
    const s = talk();
    s.say("I kept my promise.").say("I told someone your secret.");
    adjust(s, 1, "returned the thermos");
    expect(s.sim.state.trustLog.map((e) => [e.from, e.to, e.cause])).toEqual([
      [0, 1, "kept the promise"],
      [1, 0, "broke a confidence"],
      [0, 1, "returned the thermos"],
    ]);
    expect(s.eventsOfType("TrustChanged").map((e) => e.cause)).toEqual(["kept the promise", "broke a confidence", "returned the thermos"]);
  });

  it("an act that changes nothing (already at the end) logs nothing", () => {
    const s = talk().command({ type: "EndConversation" });
    adjust(s, 1);
    adjust(s, 1);
    expect(s.sim.state.trustLog).toHaveLength(1);
  });

  it("without an explicit cause it names the dialogue node that did it", () => {
    const d = compileDialogue(`npc: pallas\ntrust: yes\nnode: a\n  > "Do it." {trust:pallas+1} -> a\n  > "Bye." -> b\nnode: b\n  end\n`, { id: "pallas" }).dialogue!;
    const s = new Scenario(config, 1, world, { ...EMPTY_CONTENT, dialogues: { pallas: d } }).command({ type: "Interact" }).say("Do it.");
    expect(s.sim.state.trustLog[0]!.cause).toBe("pallas.a");
  });

  it("is bounded so a long game cannot grow it without limit", () => {
    const s = talk().command({ type: "EndConversation" });
    for (let i = 0; i < 450; i++) adjust(s, i % 2 === 0 ? 1 : -1);
    expect(s.sim.state.trustLog.length).toBe(200);
  });
});
