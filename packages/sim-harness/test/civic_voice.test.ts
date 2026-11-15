// covers: FAIL-4 (repeated arrests escalate; Halloran-7's deal at three), T3.15 the Civic Voice's broadcast pool
import { describe, expect, it } from "vitest";
import { Rng, broadcastInterval, eligibleBroadcasts, holdSecondsFor, isTracked, pickBroadcast, recentBroadcasts, trackingFactor, createInitialState, type RobotDef } from "@qh/core";
import { assemble, loadContent } from "../../content-tools/src/index.ts";
import { Scenario, asciiWorld } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const content = a.content;
const pool = Object.values(content.broadcasts);
const game = (map = "stacks", seed = 1) => new Scenario(config, seed, a.worlds, content, map);
const at = (s: Scenario, id: string) => {
  const o = [...s.sim.world.npcs].find((x) => x.id === id)!;
  return s.player(o.x + 0.5, o.y + 0.5);
};
const state = (edit: (st: ReturnType<typeof createInitialState>) => void = () => {}, seed = 1) => {
  const st = createInitialState(seed, config);
  edit(st);
  return st;
};
const minute = (m: number) => (st: ReturnType<typeof createInitialState>) => { st.tick = Math.round((((m - config.clock.startMinuteOfDay) % 1440) + 1440) % 1440 * (config.sim.ticksPerSecond / config.clock.gameMinutesPerRealSecond)); };

describe("the Civic Voice's pool", () => {
  it("has about forty lines, each with a unique id and text", () => {
    expect(pool.length).toBeGreaterThanOrEqual(40);
    expect(new Set(pool.map((b) => b.id)).size).toBe(pool.length);
    expect(new Set(pool.map((b) => b.text)).size).toBe(pool.length);
  });

  it("has routine lines for any state, so something can always be said", () => {
    expect(pool.filter((b) => !b.when).length).toBeGreaterThanOrEqual(10);
    expect(pickBroadcast(state(), config, content)).not.toBeNull();
  });

  it("selects only lines whose conditions hold: arrest lines wait for arrests", () => {
    const ids = (st: ReturnType<typeof state>) => eligibleBroadcasts(st, config, content).map((b) => b.id);
    expect(ids(state())).not.toContain("pa_arrest_one");
    expect(ids(state())).toContain("pa_arrest_none");
    expect(ids(state((s) => { s.arrestCount = 1; }))).toContain("pa_arrest_one");
    expect(ids(state((s) => { s.arrestCount = 1; }))).not.toContain("pa_arrest_two");
    expect(ids(state((s) => { s.arrestCount = 2; }))).toContain("pa_arrest_two");
    expect(ids(state((s) => { s.arrestCount = 3; }))).toEqual(expect.arrayContaining(["pa_arrest_three", "pa_arrest_file"]));
    expect(ids(state((s) => { s.arrestCount = 3; }))).not.toContain("pa_arrest_none");
  });

  it("selects by situation: curfew and Quiet Hours, alert, metrics, progress", () => {
    const ids = (st: ReturnType<typeof state>) => eligibleBroadcasts(st, config, content).map((b) => b.id);
    expect(ids(state(minute(10 * 60)))).not.toContain("pa_curfew");
    expect(ids(state(minute(23 * 60)))).toContain("pa_curfew");
    expect(ids(state(minute(3 * 60)))).toContain("pa_curfew_quiet");
    expect(ids(state(minute(10 * 60)))).not.toContain("pa_curfew_quiet");
    expect(ids(state((s) => { s.alert.level = 2; }))).toContain("pa_alert_hunting");
    expect(ids(state())).toContain("pa_alert_calm");
    expect(ids(state((s) => { s.alert.level = 3; }))).toContain("pa_alert_lockdown");
    expect(ids(state((s) => { s.metrics.contentment = 20; }))).toContain("pa_content_low");
    expect(ids(state((s) => { s.flags.pirate_played = true; }))).toContain("pa_pirate");
    expect(ids(state())).not.toContain("pa_pirate");
    expect(ids(state(minute(19 * 60)))).toContain("pa_shift_change");
    expect(ids(state(minute(9 * 60)))).not.toContain("pa_shift_change");
  });

  it("is a pure function of the seed and the moment: the same pick again, different seeds and ticks differ, and the game's own random stream is untouched", () => {
    const st = state(undefined, 7);
    expect(pickBroadcast(st, config, content, 600)!.id).toBe(pickBroadcast(st, config, content, 600)!.id);
    const picks = (seed: number) => Array.from({ length: 40 }, (_, i) => pickBroadcast(state(undefined, seed), config, content, i * 100)!.id);
    expect(new Set(picks(7)).size).toBeGreaterThan(8);
    expect(picks(7)).not.toEqual(picks(8));
    const before = st.rngState;
    pickBroadcast(st, config, content, 600);
    expect(st.rngState).toBe(before);
    expect(new Rng(1).next()).toBeTypeOf("number");
  });

  it("weights situations: a hunting alert says its line far more often than chance", () => {
    const hunting = state((s) => { s.alert.level = 2; });
    const n = 600;
    const hits = Array.from({ length: n }, (_, i) => pickBroadcast(hunting, config, content, i * 37)!.id).filter((id) => id === "pa_alert_hunting").length;
    expect(hits / n).toBeGreaterThan(2 / eligibleBroadcasts(hunting, config, content).length);
  });

  it("does not repeat a line until noRepeat others have played, and never gets stuck", () => {
    const s = game();
    s.edit((st) => { st.flags.met_wren = true; });
    const played: string[] = [];
    for (let i = 0; i < 60; i++) s.advanceTicks(broadcastInterval(config));
    for (const e of s.events) if (e.type === "Broadcast") played.push(e.id);
    expect(played.length).toBeGreaterThanOrEqual(40);
    for (let i = config.pa.noRepeat; i < played.length; i++) {
      expect(played.slice(i - config.pa.noRepeat, i), `at ${i}`).not.toContain(played[i]);
    }
    expect(recentBroadcasts(s.sim.state).length).toBeLessThanOrEqual(config.pa.noRepeat);
  });
});

describe("the Civic Voice on the air", () => {
  it("speaks once every pa.intervalMinutes of game time and not at tick zero", () => {
    const s = game();
    s.advanceTicks(broadcastInterval(config) - 1);
    s.expectNoEvent("Broadcast");
    s.advanceTicks(1);
    s.expectEvent("Broadcast");
    s.advanceTicks(broadcastInterval(config));
    expect(s.eventsOfType("Broadcast").length).toBe(2);
  });

  it("cannot be heard in the Safehouse", () => {
    const s = game();
    at(s, "pallas"); // Pallas lives in the Safehouse
    s.advanceTicks(broadcastInterval(config) * 2);
    s.expectNoEvent("Broadcast");
  });

  it("hands out the false shift time that contradicts the real one (pa_shift_time), when that line plays", () => {
    const s = game();
    s.edit(minute(19 * 60));
    // Find a tick in the evening where the pick is the shift line, then step to it.
    const every = broadcastInterval(config);
    const base = Math.ceil(s.sim.state.tick / every) * every;
    let found = -1;
    for (let k = 0; k < 200 && found < 0; k++) {
      const t = base + k * every;
      const probe = { ...s.sim.state, tick: t };
      if (pickBroadcast(probe, config, content, t)?.id === "pa_shift_change") found = t;
    }
    expect(found, "the shift line should come up in the evening").toBeGreaterThan(0);
    s.edit((st) => { st.tick = found - 1; });
    s.advanceTicks(1);
    expect(s.sim.state.clues.pa_shift_time).toBeDefined();
    expect(content.clues.pa_shift_time!.source).toBe("broadcast:civic_voice");
  });

  it("the shift line carries the clue as an effect", () => {
    expect(content.broadcasts.pa_shift_change!.effects).toEqual([{ give_clue: { id: "pa_shift_time", from: "broadcast:civic_voice" } }]);
  });
});

describe("repeated arrests escalate (FAIL-4)", () => {
  const guard: RobotDef = { id: "w1", kind: "warden", x: 5.5, y: 1.5, facing: Math.PI, route: null };
  const caught = (arrests: number) => {
    const s = new Scenario(config, 1, asciiWorld(["#################", "#S...........H.K#", "#################"], [], { robots: [guard] }));
    s.edit((st) => { st.arrestCount = arrests; });
    while (s.eventsOfType("PlayerProcessed").length === 0) {
      s.advanceTicks(1);
      if (s.sim.state.tick > 30 * 40) throw new Error("never caught");
    }
    return s;
  };

  it("holds each arrest longer than the last, up to a ceiling", () => {
    const secs = [1, 2, 3, 4, 5, 6, 20].map((n) => holdSecondsFor(config, n));
    expect(secs[0]).toBe(config.failure.holdSeconds);
    for (let i = 1; i < 5; i++) expect(secs[i]!).toBeGreaterThanOrEqual(secs[i - 1]!);
    expect(secs[1]!).toBeGreaterThan(secs[0]!);
    expect(secs[6]).toBe(config.failure.holdMaxSeconds);
  });

  it("the processing really lasts that long", () => {
    for (const before of [0, 1, 2, 5]) {
      const s = caught(before);
      expect((s.sim.state.processingUntil - s.sim.state.tick) / config.sim.ticksPerSecond).toBeCloseTo(holdSecondsFor(config, before + 1), 1);
    }
  });

  it("tracking begins at the configured arrest and not before: the alert after processing is higher and robots notice faster", () => {
    const k = config.failure.trackingAfterArrests;
    expect(isTracked(state((s) => { s.arrestCount = k - 1; }), config)).toBe(false);
    expect(isTracked(state((s) => { s.arrestCount = k; }), config)).toBe(true);
    expect(trackingFactor(state(), config)).toBe(1);
    expect(trackingFactor(state((s) => { s.arrestCount = k; }), config)).toBeGreaterThan(1);
    expect(caught(0).alert).toBe(config.failure.alertAfterProcessing);
    expect(caught(k - 2).alert).toBe(config.failure.alertAfterProcessing);
    expect(caught(k - 1).alert).toBeGreaterThanOrEqual(config.failure.trackedAlert);
  });

  it("a tracked player is noticed sooner by the same guard", () => {
    const suspicionAfter = (arrests: number) => {
      const s = new Scenario(config, 1, asciiWorld(["#################", "#S.............K#", "#################"], [], { robots: [{ ...guard, x: 4.5 }] }));
      s.edit((st) => { st.arrestCount = arrests; });
      s.advanceTicks(Math.round(0.4 * config.sim.ticksPerSecond));
      return s.robot("w1").suspicion;
    };
    const k = config.failure.trackingAfterArrests;
    const calm = suspicionAfter(0);
    expect(calm).toBeGreaterThan(0);
    expect(suspicionAfter(k)).toBeGreaterThan(calm);
  });

  it("never touches flags, clues or trust (FAIL-5), however many times", () => {
    const s = new Scenario(config, 1, asciiWorld(["#################", "#S...........H.K#", "#################"], [], { robots: [guard] }));
    s.edit((st) => { st.arrestCount = 4; st.flags.met_wren = true; st.trust.pallas = 1; st.clues.pump4_shift = { learnedTick: 0, from: "t", status: "unverified" }; });
    while (s.eventsOfType("PlayerProcessed").length === 0 && s.sim.state.tick < 30 * 40) s.advanceTicks(1);
    expect(s.sim.state.arrestCount).toBe(5);
    expect(s.sim.state.flags.met_wren).toBe(true);
    expect(s.sim.state.trust.pallas).toBe(1);
    expect(s.sim.state.clues.pump4_shift).toBeDefined();
  });
});

describe("Halloran-7 (arrest-count dialogue)", () => {
  const talk = (map: string, arrests: number, edit: (s: Scenario) => void = () => {}) => {
    const s = game(map);
    s.edit((st) => { st.arrestCount = arrests; });
    edit(s);
    at(s, "halloran_7").command({ type: "Interact" });
    return s;
  };
  const said = (s: Scenario) => JSON.stringify(s.dialogue!.lines);

  it("stands at the holding cell on the Stacks and the Civic Core", () => {
    for (const map of ["stacks", "civic_core"]) {
      const w = a.worlds[map]!;
      const h = w.npcs.find((n) => n.id === "halloran_7")!;
      expect(h, map).toBeDefined();
      const hold = w.spawns.find((sp) => sp.id === "holding")!;
      expect(Math.hypot(h.x - hold.x, h.y - hold.y)).toBeLessThan(5);
    }
  });

  it("says something different at 0, 1, 2 and 3 arrests", () => {
    const lines = [0, 1, 2, 3].map((n) => said(talk("stacks", n)));
    expect(lines[0]).toMatch(/do not seem to have a file on you/);
    expect(lines[1]).toMatch(/processed\. Once/);
    expect(lines[2]).toMatch(/Twice now/);
    expect(lines[3]).toMatch(/Three\./);
    expect(new Set(lines).size).toBe(4);
    expect(said(talk("stacks", 7))).toMatch(/Three\./);
  });

  it("explains what the third arrest means, and gives the clue about the deal", () => {
    const s = talk("stacks", 0);
    s.say("What do case officers do?").say("What happens at the third time?");
    expect(s.sim.state.clues.halloran_deal).toBeDefined();
    const s2 = talk("stacks", 2);
    s2.say("How do I stay out of it?");
    expect(said(s2)).toMatch(/tracked/);
  });

  it("the deal needs two rules that disagree: one rule is not enough, any other clue is a shrug", () => {
    const s = talk("stacks", 3, (g) => g.edit((st) => { st.clues.permit_rule_4 = { learnedTick: 0, from: "test", status: "unverified" }; }));
    s.say("Show him the rules.").command({ type: "Present", clueId: "permit_rule_4" });
    expect(said(s)).toMatch(/I need two/);
    expect(s.sim.state.arrestCount).toBe(3);
    expect(s.sim.state.flags.halloran_dealt).toBeUndefined();
  });

  it.each(["permit_rule_4", "permit_rule_9"])("showing %s with the other in hand loses the file: the arrest count is wiped and tracking ends", (shown) => {
    const s = talk("civic_core", 3, (g) => g.edit((st) => {
      st.clues.permit_rule_4 = { learnedTick: 0, from: "test", status: "unverified" };
      st.clues.permit_rule_9 = { learnedTick: 0, from: "test", status: "unverified" };
    }));
    expect(isTracked(s.sim.state, config)).toBe(true);
    s.say("Show him the rules.").command({ type: "Present", clueId: shown });
    expect(said(s)).toMatch(/never been processed/);
    expect(s.sim.state.arrestCount).toBe(0);
    expect(s.sim.state.flags.halloran_dealt).toBe(true);
    expect(isTracked(s.sim.state, config)).toBe(false);
    s.say("Thank you.").say("Goodbye.");
    // afterwards he has no file on you; a later arrest starts over, at the gentle end
    s.command({ type: "EndConversation" });
    at(s, "halloran_7").command({ type: "Interact" });
    expect(said(s)).toMatch(/do not seem to have a file on you/);
  });

  it("holds the deal until the third arrest: at two he only hints", () => {
    const s = talk("stacks", 2);
    expect(s.dialogue!.choices.map((c) => c.text)).not.toContain("Show him the rules.");
  });

  it("recites Rule 9 at the first arrest and the cat's file at the second (the clues name him as a source)", () => {
    const s = talk("stacks", 1);
    s.say("Why were you not there?");
    expect(s.sim.state.clues.permit_rule_9).toBeDefined();
    const s2 = talk("stacks", 2);
    s2.say("I heard the cat has a file too.");
    expect(s2.sim.state.clues.cat_halloran).toBeDefined();
  });

  it("after a real catch and three arrests the whole loop works end to end", () => {
    const s = game("stacks");
    for (let i = 0; i < 3; i++) s.edit((st) => { st.arrestCount += 1; });
    expect(s.sim.state.arrestCount).toBe(3);
    s.edit((st) => {
      st.clues.permit_rule_4 = { learnedTick: 0, from: "test", status: "unverified" };
      st.clues.permit_rule_9 = { learnedTick: 0, from: "test", status: "unverified" };
    });
    at(s, "halloran_7").command({ type: "Interact" }).say("Show him the rules.").command({ type: "Present", clueId: "permit_rule_9" });
    expect(s.sim.state.arrestCount).toBe(0);
  });
});
