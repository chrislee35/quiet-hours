// covers: PST-1 (breadcrumbs reachable two ways), PST-2 (three moments set a stance), PST-3 (embracing costs visibility and cell trust, opens shortcuts)
import { describe, expect, it } from "vitest";
import { pastStance, refreshPast, type FlagValue } from "@qh/core";
import { assemble, loadContent } from "../../content-tools/src/index.ts";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const content = a.content;

describe("deriving the past stance (PST-2)", () => {
  const stance = (f: Record<string, FlagValue>) => pastStance(f);
  it("is undiscovered until a moment is chosen", () => {
    expect(stance({})).toBe("undiscovered");
    expect(stance({ alder_name_known: true })).toBe("undiscovered");
  });
  it("follows the majority of the three moments", () => {
    expect(stance({ past_m1: "embrace" })).toBe("embraced");
    expect(stance({ past_m2: "reject" })).toBe("rejected");
    expect(stance({ past_m1: "embrace", past_m2: "embrace", past_m3: "reject" })).toBe("embraced");
    expect(stance({ past_m1: "reject", past_m2: "embrace", past_m3: "reject" })).toBe("rejected");
  });
  it("with one of each, the latest choice decides", () => {
    const f: Record<string, FlagValue> = {};
    f.past_m1 = "embrace"; refreshPast(f, "past_m1", "embrace");
    f.past_m2 = "reject"; refreshPast(f, "past_m2", "reject");
    expect(f.past_stance).toBe("rejected");
    const g: Record<string, FlagValue> = {};
    g.past_m1 = "reject"; refreshPast(g, "past_m1", "reject");
    g.past_m3 = "embrace"; refreshPast(g, "past_m3", "embrace");
    expect(g.past_stance).toBe("embraced");
  });
  it("any embrace makes the player visible to MERIDIAN; rejecting alone does not", () => {
    const f: Record<string, FlagValue> = { past_m1: "reject" };
    refreshPast(f, "past_m1", "reject");
    expect(f.meridian_sees).toBe(false);
    f.past_m2 = "embrace"; refreshPast(f, "past_m2", "embrace");
    expect(f.meridian_sees).toBe(true);
  });
});

const at = (s: Scenario, map: string, id: string) => {
  const w = a.worlds[map]!;
  const o = [...w.npcs, ...w.pickups, ...w.terminals].find((x) => x.id === id)!;
  return s.player(o.x + 0.5, o.y + 1.0);
};
const civic = () => new Scenario(config, 1, a.worlds, content, "civic_core");
const know = (s: Scenario, ...ids: string[]) => s.command({ type: "ApplyEffects", effects: ids.map((id) => ({ give_clue: { id, from: "test" } })) });

describe("M1, the Checkpoint", () => {
  it("embracing: the old credential works at once, at a cost", () => {
    const s = know(civic(), "checkpoint_credential");
    at(s, "civic_core", "checker_k").command({ type: "Interact" });
    s.say("Present the old credential.");
    const f = s.sim.state.flags;
    expect(f.past_m1).toBe("embrace");
    expect(f.past_stance).toBe("embraced");
    expect(f.meridian_sees).toBe(true);
    expect(s.sim.state.passes.some((p) => p.id === "insider_credential")).toBe(true);
    expect(s.sim.state.alert.level).toBeGreaterThanOrEqual(1);
    expect(s.sim.state.trust.wren).toBe(-1); // the cell trusts you less
    s.command({ type: "EndConversation" });
    s.advance(600); // the city never quite relaxes
    expect(s.sim.state.alert.level).toBeGreaterThanOrEqual(1);
  });

  it("rejecting: stays null, keeps the edge, and the alert can fall to calm", () => {
    const s = know(civic(), "checkpoint_credential");
    at(s, "civic_core", "checker_k").command({ type: "Interact" });
    s.say("Refuse it. Wait in the queue like anyone else.");
    expect(s.sim.state.flags.past_stance).toBe("rejected");
    expect(s.sim.state.flags.meridian_sees).toBe(false);
    expect(s.sim.state.passes.length).toBe(0);
    expect(s.sim.state.trust.wren ?? 0).toBe(0);
  });

  it("without the knowledge there is no choice to make", () => {
    const s = civic();
    at(s, "civic_core", "checker_k").command({ type: "Interact" });
    expect(s.dialogue!.choices.map((c) => c.text)).toEqual(["Walk away."]);
    expect(s.sim.state.flags.past_stance).toBeUndefined();
  });
});

describe("M2, the Recognition", () => {
  it("accepting Pell's help opens the Gate shortcuts and costs the cell's trust", () => {
    const s = civic();
    at(s, "civic_core", "pell").command({ type: "Interact" });
    s.say("Tell me everything.");
    for (const id of ["gate_lookup", "gate_three_ways", "one_companion", "mentor_record_severance", "checkpoint_credential"]) expect(s.sim.state.clues[id]).toBeDefined();
    expect(s.sim.state.flags.past_stance).toBe("embraced");
    expect(s.sim.state.trust.wren).toBe(-1);
  });
  it("refusing him keeps the null advantage and gives nothing", () => {
    const s = civic();
    at(s, "civic_core", "pell").command({ type: "Interact" });
    s.say("I am not that person. I do not want your help.");
    expect(s.sim.state.flags.past_stance).toBe("rejected");
    expect(s.sim.state.clues.gate_lookup).toBeUndefined();
    expect(s.sim.state.clues.pell_recognises).toBeDefined();
  });
  it("the Checkpoint and the Recognition combine: one of each, the latest wins", () => {
    const s = know(civic(), "checkpoint_credential");
    at(s, "civic_core", "checker_k").command({ type: "Interact" }).say("Present the old credential.").command({ type: "EndConversation" });
    at(s, "civic_core", "pell").command({ type: "Interact" }).say("I am not that person. I do not want your help.");
    expect(s.sim.state.flags.past_stance).toBe("rejected");
    expect(s.sim.state.flags.meridian_sees).toBe(true); // what was done stays done
  });
});

describe("the breadcrumbs (PST-1)", () => {
  it("the Ledger is readable in the archive, and Pell gives it too", () => {
    const s = civic();
    at(s, "civic_core", "pk_ledger").command({ type: "Interact" });
    expect(s.sim.state.clues.ledger_gate_line).toBeDefined();
    const t = civic();
    at(t, "civic_core", "pell").command({ type: "Interact" }).say("Tell me everything.");
    expect(t.sim.state.clues.ledger_gate_line).toBeDefined();
  });
  it("the log handle comes from Pallas, and from her log on the console", () => {
    const s = new Scenario(config, 1, a.worlds, content, "stacks");
    at(s, "stacks", "pallas").command({ type: "Interact" }).say("What can you tell me about my band?").say("I will look.").command({ type: "EndConversation" });
    know(s, "band_scratch");
    at(s, "stacks", "pallas").command({ type: "Interact" }).say("The band has an engraving: ALD-0417 and G-PROJ.");
    expect(s.sim.state.clues.pallas_log_handle).toBeDefined();
  });
  it("the voice note is heard of from Wren (and from Quill, see the Underworks tests)", () => {
    const s = new Scenario(config, 1, a.worlds, content, "stacks");
    at(s, "stacks", "wren").command({ type: "Interact" }).say("What am I?").say("Why is that a gift?").say("Is there anyone who can help me?").say("Why would they help me?");
    expect(s.sim.state.clues.hollow_voice_note).toBeDefined();
  });
});
