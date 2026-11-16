// covers: CMP-5 (June, the Ward: the tune, the truth about outside, Marrow's consent, a child-sized way, her route requirements), T4.6
import { describe, expect, it } from "vitest";
import { canBring, routeClear } from "@qh/core";
import { assemble, checkCompanions, loadContent, reachableFacts } from "../../content-tools/src/index.ts";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const content = a.content;
const game = (map = "hollow") => new Scenario(config, 1, a.worlds, content, map);
const flags = (s: Scenario) => s.sim.state.flags;
const at = (s: Scenario, id: string) => {
  const o = [...s.sim.world.npcs].find((x) => x.id === id)!;
  return s.player(o.x + 0.5, o.y + 0.5);
};
const talk = (s: Scenario, npc: string, ...lines: string[]) => {
  at(s, npc).command({ type: "Interact" });
  for (const l of lines) s.say(l);
  return s;
};
const bring = (s: Scenario) => canBring(s.sim.state, content, config, "juniper");
/** The whole arc's state, each piece separately removable. */
const ready = (s: Scenario, without: string[] = []) =>
  s.edit((st) => {
    const set: Record<string, () => void> = {
      trust: () => { st.trust.juniper = 1; },
      consent: () => { st.flags.marrow_consent = true; },
      route: () => { st.flags.child_route = true; },
    };
    for (const [k, f] of Object.entries(set)) if (!without.includes(k)) f();
    st.flags.met_june = true;
  });

describe("June's arc", () => {
  it("Bede teaches the end of his song once the pump is mended; telling June earns her trust", () => {
    const s = game();
    s.edit((st) => { st.flags.sq_07_started = true; st.flags.sq_07_done = true; });
    talk(s, "bede", "Do you know the end of the song you sing to the seedlings?");
    expect(flags(s).tune_known).toBe(true);
    s.say("I will find her.").command({ type: "EndConversation" });
    s.edit((st) => { st.flags.met_june = true; });
    talk(s, "juniper", "Bede taught me the end of your song.");
    expect(flags(s).june_tune).toBe(true);
    expect(s.sim.state.trust.juniper).toBe(1);
  });
  it("she does not offer that before Bede has taught it", () => {
    const s = game();
    s.edit((st) => { st.flags.met_june = true; });
    talk(s, "juniper");
    expect(JSON.stringify(s.sim.dialogue()!.choices)).not.toMatch(/end of your song/);
  });
  it("telling her the truth about outside is her awakening", () => {
    const s = game();
    s.edit((st) => { st.flags.met_june = true; });
    talk(s, "juniper", "Do you want to know what is outside?", "Loud, and large, and dangerous. Nothing has a roof. There is a thing called the sky and it goes all the way up.");
    expect(flags(s).awake_juniper).toBe("person");
  });
  it("hushing her costs trust and the tune earns it back: never stuck", () => {
    const s = game();
    s.edit((st) => { st.flags.met_june = true; st.flags.tune_known = true; });
    talk(s, "juniper", "Hush, please. You are very loud.");
    expect(s.sim.state.trust.juniper).toBe(-1);
    s.say("It is all right.");
    s.say("Bede taught me the end of your song.");
    expect(s.sim.state.trust.juniper).toBe(0);
  });
  it("Quill lays out a child-sized way, but only once Marrow has consented", () => {
    const s = game("underworks");
    s.edit((st) => { st.flags.sq_05_done = true; st.flags.met_quill = true; });
    talk(s, "quill");
    expect(JSON.stringify(s.sim.dialogue()!.choices)).not.toMatch(/child/);
    s.say("Goodbye.").command({ type: "EndConversation" });
    s.edit((st) => { st.flags.marrow_consent = true; });
    talk(s, "quill", "Is there a way a child could get out? Quietly?");
    expect(flags(s).child_route).toBe(true);
  });
  it("Marrow's consent comes from SQ-07 and the whole arc can be done from a fresh start", () => {
    const f = reachableFacts(a.worlds, content, a.start);
    for (const k of ["marrow_consent", "child_route", "tune_known", "june_tune"]) expect(f.flag(k), k).toBe(true);
    const june = checkCompanions(a.worlds, content, a.start).find((r) => r.id === "juniper")!;
    expect(june.gate).toBe(true);
    expect(june.missing).toEqual([]);
  });
});

describe("what it takes to bring her", () => {
  it("needs all of her trust, Marrow's consent, a child-sized way and a Hollow that is still hidden", () => {
    expect(bring(ready(game()))).toBe(true);
    for (const missing of ["trust", "consent", "route"]) expect(bring(ready(game(), [missing])), missing).toBe(false);
    const found = ready(game());
    found.edit((st) => { st.flags.hollow_discovered = true; });
    expect(bring(found)).toBe(false);
  });
  it("she can be asked to come, and released", () => {
    const s = ready(game());
    talk(s, "juniper", "Will you come with me? Out through the tunnel, to the other side.");
    expect(flags(s).companion).toBe("juniper");
    s.say("Thank you, June.").say("I cannot take you after all.");
    expect(flags(s).companion).toBe("none");
  });
  it("she is slow and noisy: any alert shuts the sneak and the hack; the break only fails at Hunting", () => {
    const s = ready(game("stacks"));
    s.edit((st) => { st.flags.companion = "juniper"; });
    const clear = (r: string) => routeClear(s.sim.state, content, config, r);
    expect([clear("sneak"), clear("hack"), clear("break")]).toEqual([true, true, true]);
    s.edit((st) => { st.alert.level = 1; });
    expect([clear("sneak"), clear("hack"), clear("break")]).toEqual([false, false, true]);
    s.edit((st) => { st.alert.level = 2; });
    expect(clear("break")).toBe(false);
  });
  it("being seen with her threatens the Hollow: one more trail, once", () => {
    const s = ready(game("stacks"));
    s.edit((st) => { st.flags.companion = "juniper"; st.alert.level = 1; });
    s.advanceTicks(2);
    expect(flags(s).hollow_trails).toBe(1);
    expect(flags(s).hollow_risk).toBe(true);
    s.edit((st) => { st.alert.level = 0; });
    s.advanceTicks(2);
    s.edit((st) => { st.alert.level = 1; });
    s.advanceTicks(2);
    expect(flags(s).hollow_trails).toBe(1);
  });
  it("with nobody chosen it costs nothing", () => {
    const s = ready(game("stacks"));
    s.edit((st) => { st.alert.level = 1; });
    s.advanceTicks(2);
    expect(flags(s).hollow_trails).toBeUndefined();
  });
});
