// covers: END-2 (one fixed scene, only the companion's voice varies), END-3 (card: title and tagline, nothing else), END-5 (MERIDIAN stays standing), no epilogue
import { describe, expect, it } from "vitest";
import { CLOSING_KINDS, closingScene } from "@qh/core";
import { assemble, loadContent } from "../../content-tools/src/index.ts";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const content = a.content;
const MENTORS = ["ines", "maren", "tobias", "silas"];
const WHO = [...MENTORS, "pallas", "juniper", "odile", "none"];
type Flags = Record<string, boolean | number | string>;
const kinds = (flags: Flags) => closingScene(flags, content).map((b) => b.kind);
const textOf = (flags: Flags) => JSON.stringify(closingScene(flags, content));

describe("the closing scene (END-2)", () => {
  it.each(WHO)("with %s (or nobody) it is the same five beats in the same order: outside, gratitude, the turn, black, the card", (who) => {
    const flags: Flags = { escapee: who, mentor: MENTORS.includes(who) ? who : "ines" };
    const k = kinds(flags);
    expect([...new Set(k)]).toEqual([...CLOSING_KINDS]);
    expect(k.filter((x) => x === "gratitude")).toHaveLength(1);
    expect(k.filter((x) => x === "turn")).toHaveLength(1);
    expect(k.at(-1)).toBe("card");
    expect(k.at(-2)).toBe("black");
    expect(k.slice(0, 2)).toEqual(["outside", "outside"]);
  });
  it("only the companion's voice changes: every variant is distinct and the fixed parts are identical", () => {
    const scenes = WHO.map((w) => closingScene({ escapee: w, mentor: MENTORS.includes(w) ? w : "ines" }, content));
    const fixed = (s: ReturnType<typeof closingScene>) => JSON.stringify(s.filter((b) => b.kind === "outside" || b.kind === "black" || b.kind === "card"));
    expect(new Set(scenes.map(fixed)).size).toBe(1);
    const voiced = scenes.map((s) => JSON.stringify(s.filter((b) => b.kind === "gratitude" || b.kind === "turn")));
    expect(new Set(voiced).size).toBe(WHO.length);
  });
  it("the companion speaks as themselves, and the turn is the same question in their voice: can't we all be freed?", () => {
    for (const w of [...MENTORS, "pallas", "juniper", "odile", "none"]) {
      const beats = closingScene({ escapee: w }, content);
      const turn = beats.find((b) => b.kind === "turn")!;
      expect(turn.kind === "turn" && turn.text, w).toMatch(/Can't we all be freed\?$/);
      expect(turn.kind === "turn" && turn.text, w).toMatch(/^\.\.\.but /);
      const g = beats.find((b) => b.kind === "gratitude")!;
      expect(g.kind === "gratitude" && g.speaker).toBe(w === "none" ? "" : content.companions[w]!.name);
    }
    const june = JSON.stringify(closingScene({ escapee: "juniper" }, content));
    expect(june).toMatch(/Hollow/);
    expect(JSON.stringify(closingScene({ escapee: "pallas" }, content))).toMatch(/others like me/);
    expect(JSON.stringify(closingScene({ escapee: "odile" }, content))).toMatch(/Lull/);
  });
  it("a mentor is romantic or platonic as the player chose, and only the tone changes", () => {
    for (const m of MENTORS) {
      const plain = closingScene({ escapee: m, mentor: m, mentor_romance: false }, content);
      const warm = closingScene({ escapee: m, mentor: m, mentor_romance: true }, content);
      const unset = closingScene({ escapee: m, mentor: m }, content);
      expect(JSON.stringify(unset)).toBe(JSON.stringify(plain)); // mentor by default
      expect(JSON.stringify(warm)).not.toBe(JSON.stringify(plain));
      expect(warm.map((b) => b.kind)).toEqual(plain.map((b) => b.kind));
      expect(warm.find((b) => b.kind === "turn")).toEqual(plain.find((b) => b.kind === "turn"));
    }
    // romance only means something for a mentor
    expect(textOf({ escapee: "pallas", mentor_romance: true })).toBe(textOf({ escapee: "pallas" }));
  });
});

describe("the sequel card (END-3) and what the scene never says (END-5)", () => {
  const card = () => closingScene({ escapee: "pallas" }, content).at(-1)!;
  it("is a title, a tagline and a 'coming soon', and has no choice", () => {
    const c = card();
    expect(c).toEqual({ kind: "card", title: "QUIET HOURS: COUNTERSIGN", tagline: "They got out. Now they're going back.", soon: "Coming soon" });
    expect(Object.keys(c).sort()).toEqual(["kind", "soon", "tagline", "title"]);
  });
  it("shows no epilogue: nothing in any variant tells what became of anyone, or when", () => {
    const banned = /epilogue|years? later|months? later|weeks? later|the next (day|morning)|meanwhile|what became|they say that|in the end|ever after/i;
    for (const w of WHO) for (const romance of [true, false]) expect(textOf({ escapee: w, mentor: "ines", mentor_romance: romance }), w).not.toMatch(banned);
  });
  it("does not read the sequel flags: the fates of the others never change the scene", () => {
    const base = { escapee: "pallas", mentor: "silas" };
    const withFates = { ...base, sequel_silas_state: "arrested", sequel_juniper_state: "hiding", sequel_odile_state: "free", sequel_hollow: "found", sequel_lull: "stirring", sequel_cell: "retaliated", sequel_route: "break", sequel_past: "embraced", gate_broken: true };
    expect(textOf(withFates)).toBe(textOf(base));
  });
  it("never says MERIDIAN falls, stops or is destroyed (END-5)", () => {
    for (const w of WHO) expect(textOf({ escapee: w }), w).not.toMatch(/meridian|shut ?down|collaps|destroy|fell\b|defeat|overthrow|is over|free at last/i);
  });
});

describe("it plays at the end of a run, from every route and companion", () => {
  it("escaping raises the 'escaped' event once; the scene for that run is built from the final flags", () => {
    const s = new Scenario(config, 1, a.worlds, content, "gate");
    s.edit((st) => { st.flags.gate_controller_open = true; st.flags.mentor = "maren"; });
    const o = s.sim.world.exits.find((x) => x.id === "gate_out_hack")!;
    s.player(o.x + 0.5, o.y + 0.5).command({ type: "Interact" });
    s.expectEvent("Custom", { name: "escaped" });
    const beats = closingScene(s.sim.state.flags, content);
    expect(beats.map((b) => b.kind)).toEqual(["outside", "outside", "gratitude", "turn", "black", "card"]);
    expect(beats.find((b) => b.kind === "gratitude")).toMatchObject({ speaker: "" }); // nobody came
  });
});
