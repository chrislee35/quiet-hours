// covers: CMP-2 (Act I: meet all four, then commit to one), the other three staying minor, each choice end to end
import { describe, expect, it } from "vitest";
import { MENTOR_IDS } from "@qh/core";
import { assemble, loadContent } from "../../content-tools/src/index.ts";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const content = a.content;
const home: Record<string, string> = { ines: "civic_core", maren: "underworks", tobias: "belt", silas: "stacks" };
const flags = (...f: string[]) => f.map((x) => ({ set_flag: [x, true] as [string, boolean] }));
const everyone = ["wren_vouched", ...MENTOR_IDS.map((i) => `met_${i}`)];

const visit = (id: string, set: string[] = [], seed = 1) => {
  const map = home[id]!;
  const s = new Scenario(config, seed, a.worlds, content, map).command({ type: "ApplyEffects", effects: flags(...set) });
  const n = a.worlds[map]!.npcs.find((x) => x.id === id)!;
  return s.player(n.x + 0.5, n.y + 1.0).command({ type: "Interact" });
};
const options = (s: Scenario) => s.dialogue!.choices.map((c) => c.text);
const ASK = "Will you help me get out of the city?";

describe("choosing a mentor in Act I", () => {
  it("meeting each of the four marks them met", () => {
    for (const id of MENTOR_IDS) {
      const s = visit(id);
      expect(s.sim.state.flags[`met_${id}`]).toBe(true);
    }
  });

  it("you cannot ask for help before Wren has vouched and you have met all four", () => {
    for (const id of MENTOR_IDS) {
      expect(options(visit(id))).not.toContain(ASK);
      expect(options(visit(id, ["wren_vouched"]))).not.toContain(ASK);
      const others = MENTOR_IDS.filter((x) => x !== id).slice(0, 2).map((x) => `met_${x}`);
      expect(options(visit(id, ["wren_vouched", ...others]))).not.toContain(ASK);
    }
  });

  for (const chosen of MENTOR_IDS) {
    it(`choosing ${chosen}: the arc begins with their vouch, and the other three become minor`, () => {
      const s = visit(chosen, everyone);
      expect(options(s)).toContain(ASK);
      s.say(ASK);
      expect(s.sim.state.flags.mentor).toBe(chosen);
      expect(s.sim.state.flags.mb_vouch).toBe(true);
      s.say(s.dialogue!.choices[0]!.text).say("Thank you.").command({ type: "EndConversation" });
      expect(s.sim.state.trust[chosen]).toBe(1);
      // The first lesson is next time.
      s.command({ type: "Interact" });
      expect(s.sim.state.flags.mb_first_lesson).toBe(true);

      for (const other of MENTOR_IDS.filter((x) => x !== chosen)) {
        const t = visit(other, [...everyone, `__x`]).command({ type: "EndConversation" });
        t.command({ type: "ApplyEffects", effects: [{ set_flag: ["mentor", chosen] }] });
        t.command({ type: "Interact" });
        expect(options(t)).not.toContain(ASK);
        expect(t.sim.state.flags.mb_vouch).toBeUndefined(); // they do not run the arc
      }
    });
  }

  it("the choice cannot be made twice", () => {
    const s = visit("silas", [...everyone, "mentor"]);
    expect(options(s)).not.toContain(ASK);
  });
});
