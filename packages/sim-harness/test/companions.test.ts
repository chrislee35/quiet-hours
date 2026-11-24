// covers: CMP-1 (exactly one escapes), CMP-5 (gate and route complications), CMP-6 (awakening for every candidate), CMP-7 and END-4 (sequel flags), CMP-2 (four mentors)
import { describe, expect, it } from "vitest";
import { candidates, canBring, createSave, hollowOutcome, hollowRisk, routeClear, ROUTES, type Condition, type CompanionDef } from "@qh/core";
import { assemble, checkAreas, checkCompanions, loadContent } from "../../content-tools/src/index.ts";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const content = a.content;
const MENTORS = ["ines", "maren", "tobias", "silas"];
const OTHERS = ["pallas", "juniper", "odile"];
const exitOf: Record<string, string> = { sneak: "gate_out_service", hack: "gate_out_hack", break: "gate_out_break" };

const game = (seed = 1, map = "gate") => new Scenario(config, seed, a.worlds, content, map);
const at = (s: Scenario, id: string) => {
  const o = [...s.sim.world.npcs, ...s.sim.world.terminals, ...s.sim.world.exits, ...s.sim.world.pickups].find((x) => x.id === id)!;
  return s.player(o.x + 0.5, o.y + 0.5);
};
const flags = (s: Scenario) => s.sim.state.flags;

/** Makes a list of conditions true by editing state: flags, trust and "not" flags. Skips flags named in `skip`. */
function satisfy(s: Scenario, conds: Condition[], skip: string[] = []): void {
  s.edit((st) => {
    for (const c of conds) {
      if ("flag" in c) { if (!skip.includes(c.flag)) st.flags[c.flag] = true; }
      else if ("flag_eq" in c) { if (!skip.includes(c.flag_eq[0])) st.flags[c.flag_eq[0]] = c.flag_eq[1]; }
      else if ("trust_gte" in c) st.trust[c.trust_gte[0]] = c.trust_gte[1];
      else if ("not" in c && "flag" in c.not) delete st.flags[c.not.flag];
    }
  });
}

/** Sets up a run in which `mentor` was chosen and `companion` has been asked, with their gate met. */
function prepare(mentor: string, companion: string | "none", route: string, opts: { gate?: boolean; complication?: boolean } = {}): Scenario {
  const { gate = true, complication = true } = opts;
  const s = game();
  s.edit((st) => { st.flags.mentor = mentor; });
  if (companion !== "none") {
    const def = content.companions[companion]!;
    if (gate) satisfy(s, def.gate);
    if (complication) satisfy(s, def.routes[route as "sneak"].requires);
    s.edit((st) => { st.flags.companion = companion; });
  }
  // the route's own requirement
  s.command({ type: "ApplyEffects", effects: route === "break" ? [{ set_district: ["belt", "node4", "off"] }] : route === "hack" ? [{ set_flag: ["gate_controller_open", true] }] : [{ give_pass: { id: "p", label: "p", level: 1, origin: "issued" } }] });
  return s.advanceToMinuteOfDay(835).advanceTicks(2);
}
const cross = (s: Scenario, route: string) => at(s, exitOf[route]!).command({ type: "Interact" });

describe("who the candidates are (CMP-2)", () => {
  it("is always four: the chosen mentor, Pallas, June and Odile", () => {
    for (const m of MENTORS) {
      const s = game().edit((st) => { st.flags.mentor = m; });
      expect(candidates(s.sim.state, content, config).map((c) => c.id).sort()).toEqual([m, ...OTHERS].sort());
    }
    expect(candidates(game().sim.state, content, config).map((c) => c.id).sort()).toEqual([...OTHERS].sort()); // no mentor chosen yet
  });
});

describe("the gate: trust plus the practical requirement (CMP-5)", () => {
  const everyone: [string, string][] = [...MENTORS.map((m) => [m, m] as [string, string]), ...OTHERS.map((c) => ["ines", c] as [string, string])];
  it.each(everyone)("%s: %s cannot be brought until every requirement of the gate holds, and each one matters", (mentor, id) => {
    const def = content.companions[id]!;
    const make = (skipIndex: number) => {
      const s = game().edit((st) => { st.flags.mentor = mentor; });
      satisfy(s, def.gate.filter((_, i) => i !== skipIndex));
      return s;
    };
    expect(canBring(game().edit((st) => { st.flags.mentor = mentor; }).sim.state, content, config, id)).toBe(false);
    const full = game().edit((st) => { st.flags.mentor = mentor; });
    satisfy(full, def.gate);
    expect(canBring(full.sim.state, content, config, id)).toBe(true);
    def.gate.forEach((c, i) => {
      if ("not" in c) return; // a thing that must not have happened is true by default; the full case covers it
      expect(canBring(make(i).sim.state, content, config, id), `without gate[${i}] ${JSON.stringify(c)}`).toBe(false);
    });
  });
  it("only the mentor the player chose is a candidate; a mentor who stays cannot be brought", () => {
    const s = game().edit((st) => { st.flags.mentor = "ines"; });
    satisfy(s, content.companions.maren!.gate);
    expect(canBring(s.sim.state, content, config, "maren")).toBe(false); // not the chosen mentor
    const t = game().edit((st) => { st.flags.mentor = "maren"; });
    satisfy(t, content.companions.maren!.gate);
    t.edit((st) => { st.flags.mentor_choice = "stay"; });
    expect(canBring(t.sim.state, content, config, "maren")).toBe(false);
  });
});

describe("every mentor x companion x route (CMP-1, CMP-5, CMP-6, CMP-7, END-4)", () => {
  const combos: [string, string, string][] = [];
  for (const m of MENTORS) for (const c of [m, ...OTHERS, "none"]) for (const r of ROUTES) combos.push([m, c, r]);
  it("has 60 combinations", () => expect(combos.length).toBe(60));

  it.each(combos)("mentor %s, companion %s, route %s: they cross, exactly the chosen one escapes, everyone is aware, the sequel is written", (mentor, companion, route) => {
    const s = prepare(mentor, companion, route);
    cross(s, route);
    s.expectEvent("MapChanged", { from: "gate", to: "outside" });
    expect(flags(s).route_taken).toBe(route);
    expect(flags(s).escapee).toBe(companion); // CMP-1: exactly one (or nobody), never two
    const cands = candidates(s.sim.state, content, config).map((c) => c.id);
    expect(cands.length).toBe(4);
    for (const id of cands) {
      // CMP-6: everyone is aware, whatever the route and whoever came
      expect(["person", "message"], `awake_${id}`).toContain(flags(s)[`awake_${id}`]);
      // CMP-7: a state and a stance for everybody, "escaped" for exactly the chosen one
      const state = flags(s)[`sequel_${id}_state`];
      expect(["escaped", "free", "hiding", "arrested", "left"], `${id} state`).toContain(state);
      expect(state === "escaped", `${id} escaped`).toBe(id === companion);
      expect(["ally", "wary", "estranged"]).toContain(flags(s)[`sequel_${id}_stance`]);
    }
    // END-4: the rest of the sequel record
    for (const k of ["sequel_companion", "sequel_route", "sequel_past", "sequel_hollow", "sequel_lull", "sequel_cell"]) expect(flags(s)[k], k).toBeDefined();
    expect(flags(s).sequel_companion).toBe(companion);
    expect(flags(s).sequel_route).toBe(route);
    expect(flags(s).sequel_cell).toBe(route === "break" ? "retaliated" : "safe");
    // and it is in the save
    const save = createSave(s.sim.state, "outside", { label: "final", savedAt: "x" } as never);
    expect(JSON.stringify(save)).toContain("sequel_done");
  });

  const hard = combos.filter(([, c, r]) => c !== "none" && content.companions[c]!.routes[r as "sneak"].requires.length > 0);
  it("has combinations where the companion makes the crossing harder", () => expect(hard.length).toBeGreaterThan(8));
  it.each(hard)("mentor %s, companion %s, route %s: with the complication unmet the crossing is refused", (mentor, companion, route) => {
    const s = prepare(mentor, companion, route, { complication: false });
    // break only what this route asks of them
    const reqs = content.companions[companion]!.routes[route as "sneak"].requires;
    if (reqs.some((c) => "not" in c)) s.command({ type: "ApplyEffects", effects: [{ raise_alert_to: 3 }] });
    else if (reqs.some((c) => "time_between" in c)) s.advanceToMinuteOfDay(845).advanceTicks(2);
    satisfy(s, reqs, reqs.filter((c) => "flag" in c).map((c) => (c as { flag: string }).flag)); // a flag requirement is left unmet
    if (reqs.some((c) => "time_between" in c)) satisfy(s, reqs.filter((c) => "flag" in c), ["mentor_identity"]);
    expect(routeClear(s.sim.state, content, config, route)).toBe(false);
    cross(s, route);
    expect(s.sim.world.id).toBe("gate");
    expect(flags(s).escaped).toBeUndefined();
  });

  it("a companion who is not ready cannot cross at all, on any route (only the person you choose, and only when they can come)", () => {
    for (const route of ROUTES) {
      const s = prepare("ines", "pallas", route, { gate: false });
      expect(routeClear(s.sim.state, content, config, route)).toBe(false);
      cross(s, route);
      expect(s.sim.world.id).toBe("gate");
    }
  });
});

describe("the cross-map checker covers the optional areas (T4.7)", () => {
  it("every Hollow and Lull branch can happen from a fresh start", () => {
    const report = checkAreas(a.worlds, content, a.start);
    expect(report.length).toBeGreaterThan(10);
    expect(report.filter((r) => !r.reachable).map((r) => `${r.area}: ${r.what}`)).toEqual([]);
  });
});

describe("every companion x route x the optional areas (T4.7, ADR-6)", () => {
  /** What the Hollow and the Lull are like when the player leaves: the optional areas and their branches. */
  const HOLLOW: Record<string, Record<string, unknown>> = {
    hidden: {},
    "at risk": { mrs_sold: true },
    wiped: { hollow_discovered: true, hollow_outcome: "wiped" },
    scattered: { hollow_discovered: true, hollow_outcome: "scattered", hollow_warned: true },
  };
  const LULL: Record<string, Record<string, unknown>> = { sleeping: {}, "seen through": { lull_awake: true }, disrupted: { lull_disrupted: true } };
  const rows: [string, string, string, string, string][] = [];
  for (const h of Object.keys(HOLLOW)) for (const l of Object.keys(LULL)) for (const c of ["ines", ...OTHERS, "none"]) for (const r of ROUTES) rows.push([h, l, c, r, `${h}/${l}`]);
  it("has 180 combinations", () => expect(rows.length).toBe(180));

  it.each(rows)("Hollow %s, Lull %s, companion %s, route %s", (hollow, lull, companion, route) => {
    const s = prepare("ines", companion, route);
    s.edit((st) => { Object.assign(st.flags, HOLLOW[hollow], LULL[lull]); });
    const shut = companion === "juniper" && HOLLOW[hollow]!.hollow_discovered === true; // a found Hollow ends June's way out
    expect(canBring(s.sim.state, content, config, companion === "none" ? "ines" : companion) || companion === "none").toBe(companion === "none" ? true : !shut);
    cross(s, route);
    if (shut) {
      expect(s.sim.world.id).toBe("gate"); // refused: she cannot come
      expect(flags(s).escaped).toBeUndefined();
      return;
    }
    s.expectEvent("MapChanged", { from: "gate", to: "outside" });
    expect(flags(s).escapee).toBe(companion);
    // the Hollow: what was found stays found; the break route costs it if it was at any risk; otherwise it stays hidden
    const found = HOLLOW[hollow]!.hollow_discovered === true;
    const expectHollow = found ? HOLLOW[hollow]!.hollow_outcome : route === "break" && hollow === "at risk" ? "wiped" : "hidden";
    expect(flags(s).sequel_hollow).toBe(expectHollow);
    expect(hollowOutcome(s.sim.state)).toBe(expectHollow);
    // the Lull
    const awake = flags(s).lull_awake === true;
    expect(flags(s).sequel_lull).toBe(LULL[lull]!.lull_disrupted === true ? "disrupted" : awake ? "stirring" : "sleeping");
    // those left behind: June is arrested when the Hollow was wiped, hides when it was scattered or the Gate broke, and Odile hides once awake
    if (companion !== "juniper") {
      const june = flags(s).sequel_juniper_state;
      if (expectHollow === "wiped") expect(june).toBe("arrested");
      else if (expectHollow === "scattered") expect(june).toBe("hiding");
      else if (route === "break") expect(june).toBe("hiding");
    }
    // everyone still aware, and only one escaped
    for (const c of candidates(s.sim.state, content, config)) {
      expect(["person", "message"]).toContain(flags(s)[`awake_${c.id}`]);
      expect(flags(s)[`sequel_${c.id}_state`] === "escaped").toBe(c.id === companion);
    }
  });

  it("the break route with no risk to the Hollow, and every other route, never raids it", () => {
    for (const route of ROUTES) {
      const s = prepare("ines", "none", route);
      cross(s, route);
      expect(hollowRisk(s.sim.state)).toBe(0);
      expect(flags(s).sequel_hollow).toBe("hidden");
    }
  });
  it("a lapsed Odile cannot be brought, in any state of the Lull", () => {
    for (const l of Object.keys(LULL)) {
      const s = prepare("ines", "odile", "sneak");
      s.edit((st) => { Object.assign(st.flags, LULL[l], { odile_lapsed: true }); });
      expect(routeClear(s.sim.state, content, config, "sneak"), l).toBe(false);
    }
  });
});

describe("what the sequel remembers", () => {
  it("records how the others fared: ally, wary or estranged from trust; hiding when the Gate broke; arrested when the Hollow was found", () => {
    const s = prepare("silas", "pallas", "break");
    s.edit((st) => { st.trust.silas = -1; st.trust.odile = 1; st.flags.hollow_discovered = true; st.flags.lull_awake = true; });
    cross(s, "break");
    expect(flags(s).sequel_pallas_state).toBe("escaped");
    expect(flags(s).sequel_silas_state).toBe("hiding"); // the Gate fell and he went to ground
    expect(flags(s).sequel_silas_stance).toBe("estranged");
    expect(flags(s).sequel_juniper_state).toBe("arrested");
    expect(flags(s).sequel_odile_state).toBe("hiding");
    expect(flags(s).sequel_odile_stance).toBe("ally");
    expect(flags(s).sequel_hollow).toBe("found");
    expect(flags(s).sequel_lull).toBe("stirring");
  });
  it("is written once", () => {
    const s = prepare("ines", "none", "sneak");
    cross(s, "sneak");
    s.edit((st) => { st.flags.hollow_discovered = true; });
    s.command({ type: "ApplyEffects", effects: [{ set_flag: ["escaped", true] }] });
    expect(flags(s).sequel_hollow).toBe("hidden");
  });
});

describe("asking someone to come (CMP-1)", () => {
  it("a mentor who is asked becomes the companion", () => {
    const s = game(1, "civic_core").edit((st) => { st.flags.mentor = "ines"; st.flags.met_ines = true; });
    satisfy(s, content.companions.ines!.gate);
    at(s, "ines").command({ type: "Interact" });
    s.say("I want you with me.");
    expect(flags(s).companion).toBe("ines");
  });
  it("asking Pallas instead moves it, and she can be released", () => {
    const s = game(1, "stacks").edit((st) => { st.flags.mentor = "ines"; st.flags.companion = "ines"; st.flags.met_pallas = true; });
    satisfy(s, content.companions.pallas!.gate);
    at(s, "pallas").command({ type: "Interact" }).say("Yes. I think so too."); // her awakening comes first
    s.say("Will you come with me, Pallas? Out through the Gate?");
    expect(flags(s).companion).toBe("pallas");
    s.say("Thank you.");
    s.command({ type: "EndConversation" });
    at(s, "pallas").command({ type: "Interact" }).say("I cannot take you after all.");
    expect(flags(s).companion).toBe("none");
    expect(routeClear(s.sim.state, content, config, "sneak")).toBe(true);
  });
});

describe("awakenings in person (CMP-6)", () => {
  it("Pallas wakes up in person once she is tagged", () => {
    const s = game(1, "stacks").edit((st) => { st.flags.registered_as_cargo = true; st.flags.met_pallas = true; });
    at(s, "pallas").command({ type: "Interact" });
    expect(flags(s).awake_pallas).toBe("person");
  });
  it("the mentor's awakening is due two hours after the choice, and sets awake_<mentor> when it is heard", () => {
    const m = game().edit((st) => { st.flags.mentor = "maren"; });
    m.command({ type: "ApplyEffects", effects: [{ set_flag: ["mb_choice", true] }] }).advanceTicks(2);
    expect(flags(m).mentor_awakening).toBeUndefined();
    m.advanceTicks(20000);
    expect(flags(m).mentor_awakening).toBe(true);
    const t = game(1, "underworks").edit((st) => { st.flags.mentor = "maren"; st.flags.met_maren = true; st.flags.mentor_awakening = true; });
    at(t, "maren").command({ type: "Interact" });
    expect(flags(t).awake_maren).toBe("person");
  });
  it("a candidate whose beat never happened is told by a message at the crossing", () => {
    const s = prepare("tobias", "none", "sneak");
    cross(s, "sneak");
    for (const id of ["juniper", "odile", "tobias", "pallas"]) expect(flags(s)[`awake_${id}`]).toBe("message");
  });
  it("a mentor who has had the beat in person keeps it", () => {
    const s = prepare("tobias", "none", "sneak");
    s.edit((st) => { st.flags.awake_tobias = "person"; });
    cross(s, "sneak");
    expect(flags(s).awake_tobias).toBe("person");
  });
});

it("the content lists a route complication in words for every candidate and route (CMP-5)", () => {
  for (const c of Object.values(content.companions) as CompanionDef[]) for (const r of ROUTES) expect(c.routes[r].harder.length, `${c.id} ${r}`).toBeGreaterThan(20);
});

describe("cross-map check of the companions (CMP-5)", () => {
  it("the mentors and Pallas can be brought, on every route, from a fresh start; Odile and June can be too (T4.3, T4.6)", () => {
    const reports = checkCompanions(a.worlds, content, a.start);
    const by = Object.fromEntries(reports.map((r) => [r.id, r]));
    for (const id of [...MENTORS, "pallas"]) {
      expect(by[id]!.missing, id).toEqual([]);
      expect(by[id]!.gate, id).toBe(true);
      for (const r of ROUTES) expect(by[id]!.routes[r], `${id} ${r}`).toBe(true);
    }
    // Every candidate is reachable now: a candidate that cannot be brought would be listed here.
    expect(reports.filter((r) => !r.gate).map((r) => r.id).sort()).toEqual([]);
  });
});
