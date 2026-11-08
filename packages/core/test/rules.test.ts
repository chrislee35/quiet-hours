// covers: ADR-3, DLG-2, CLU-1, ECO-1, CMP-4 (trust steps), FAIL-5
import { describe, expect, it } from "vitest";
import {
  Rng, deepClone, applyEffect, applyEffects, createInitialState, evalAll, evalCondition, validateCondition, validateEffect,
  type Condition, type Effect, type GameEvent, type SimState,
} from "../src/index.ts";
import { config } from "./helpers.ts";

const fresh = (): SimState => createInitialState(1, config);
const run = (state: SimState, ...effects: Effect[]) => {
  const events: GameEvent[] = [];
  applyEffects(effects, state, events);
  return events;
};

/** Recursively freeze, so any attempted mutation throws in strict mode. */
function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object") {
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

describe("conditions", () => {
  const state = fresh();
  run(state,
    { give_clue: { id: "pump4_shift", from: "odd_sam" } },
    { verify_clue: "pump4_shift" },
    { set_flag: ["met_wren", true] },
    { set_flag: ["day_count", 3] },
    { add_item: ["wire", 2] },
    { add_credits: 40 },
    { adjust_trust: ["pallas", 1] },
  );
  state.alert.level = 2;
  state.arrestCount = 2;
  const ev = (c: Condition) => evalCondition(c, state, config);

  it("reads clues, flags, items, credits, trust, alert, arrests", () => {
    expect(ev({ has_clue: "pump4_shift" })).toBe(true);
    expect(ev({ has_clue: "other" })).toBe(false);
    expect(ev({ clue_state: ["pump4_shift", "verified"] })).toBe(true);
    expect(ev({ clue_state: ["pump4_shift", "disproved"] })).toBe(false);
    expect(ev({ flag: "met_wren" })).toBe(true);
    expect(ev({ flag: "unset" })).toBe(false);
    expect(ev({ flag_eq: ["day_count", 3] })).toBe(true);
    expect(ev({ flag_eq: ["day_count", "3"] })).toBe(false);
    expect(ev({ has_item: "wire" })).toBe(true);
    expect(ev({ has_item: ["wire", 2] })).toBe(true);
    expect(ev({ has_item: ["wire", 3] })).toBe(false);
    expect(ev({ credits_gte: 40 })).toBe(true);
    expect(ev({ credits_gte: 41 })).toBe(false);
    expect(ev({ trust_gte: ["pallas", 1] })).toBe(true);
    expect(ev({ trust_gte: ["wren", 0] })).toBe(true); // absent = unsure (0)
    expect(ev({ trust_gte: ["wren", 1] })).toBe(false);
    expect(ev({ alert_gte: 2 })).toBe(true);
    expect(ev({ alert_gte: 3 })).toBe(false);
    expect(ev({ arrest_count_gte: 2 })).toBe(true);
    expect(ev({ arrest_count_gte: 3 })).toBe(false);
  });

  it("combines with all / any / not, and evalAll treats absent as true", () => {
    expect(ev({ all: [{ has_clue: "pump4_shift" }, { flag: "met_wren" }] })).toBe(true);
    expect(ev({ all: [{ has_clue: "pump4_shift" }, { flag: "unset" }] })).toBe(false);
    expect(ev({ any: [{ flag: "unset" }, { flag: "met_wren" }] })).toBe(true);
    expect(ev({ not: { flag: "met_wren" } })).toBe(false);
    expect(evalAll(undefined, state, config)).toBe(true);
    expect(evalAll([{ flag: "met_wren" }, { credits_gte: 999 }], state, config)).toBe(false);
  });

  it("time_between follows the game clock, including windows that wrap midnight", () => {
    const s = fresh(); // 07:00
    expect(evalCondition({ time_between: [360, 480] }, s, config)).toBe(true);
    expect(evalCondition({ time_between: [1320, 360] }, s, config)).toBe(false);
    expect(evalCondition({ time_between: [1320, 480] }, s, config)).toBe(true);
  });

  it("are pure: evaluating against a deeply frozen state never mutates or throws", () => {
    const frozen = deepFreeze(deepClone(state));
    const all: Condition[] = [
      { has_clue: "pump4_shift" }, { flag: "met_wren" }, { has_item: ["wire", 1] },
      { not: { any: [{ alert_gte: 3 }, { credits_gte: 1 }] } }, { time_between: [0, 1440] },
    ];
    for (const c of all) expect(() => evalCondition(c, frozen, config)).not.toThrow();
    expect(JSON.stringify(frozen)).toBe(JSON.stringify(state));
  });
});

describe("effects", () => {
  it("give_clue is idempotent and never downgrades a verified clue", () => {
    const s = fresh();
    expect(run(s, { give_clue: { id: "c", from: "wren" } })).toEqual([{ type: "ClueGained", tick: 0, clueId: "c", from: "wren" }]);
    run(s, { verify_clue: "c" });
    expect(run(s, { give_clue: { id: "c", from: "sam" } })).toEqual([]);
    expect(s.clues.c).toMatchObject({ from: "wren", status: "verified" });
  });

  it("verify/disprove only affect known clues and only emit on change", () => {
    const s = fresh();
    expect(run(s, { verify_clue: "unknown" })).toEqual([]);
    run(s, { give_clue: { id: "c", from: "x" } });
    expect(run(s, { disprove_clue: "c" })).toHaveLength(1);
    expect(run(s, { disprove_clue: "c" })).toEqual([]);
  });

  it("flags emit only when the value changes", () => {
    const s = fresh();
    expect(run(s, { set_flag: ["f", 1] })).toHaveLength(1);
    expect(run(s, { set_flag: ["f", 1] })).toEqual([]);
    expect(run(s, { set_flag: ["f", 2] })).toHaveLength(1);
  });

  it("items: add, remove, and removal never goes below zero", () => {
    const s = fresh();
    run(s, { add_item: ["wire", 3] });
    const ev = run(s, { remove_item: ["wire", 10] });
    expect(ev).toEqual([{ type: "ItemsChanged", tick: 0, itemId: "wire", delta: -3, total: 0 }]);
    expect(s.inventory.items).toEqual({});
    expect(run(s, { remove_item: ["wire", 1] })).toEqual([]);
  });

  it("credits cannot go negative", () => {
    const s = fresh();
    run(s, { add_credits: 20 });
    const ev = run(s, { add_credits: -50 });
    expect(s.inventory.credits).toBe(0);
    expect(ev).toEqual([{ type: "CreditsChanged", tick: 0, delta: -20, total: 0 }]);
  });

  it("trust moves one step per act, clamps at both ends, and can recover (CMP-4)", () => {
    const s = fresh();
    run(s, { adjust_trust: ["pallas", -1] });
    expect(s.trust.pallas).toBe(-1);
    expect(run(s, { adjust_trust: ["pallas", -1] })).toEqual([]); // already at the floor
    run(s, { adjust_trust: ["pallas", 1] }, { adjust_trust: ["pallas", 1] });
    expect(s.trust.pallas).toBe(1);
    run(s, { adjust_trust: ["pallas", 2] });
    expect(s.trust.pallas).toBe(1);
  });

  it("raise_alert_to raises but never lowers", () => {
    const s = fresh();
    expect(run(s, { raise_alert_to: 2 })).toEqual([{ type: "AlertChanged", tick: 0, from: 0, to: 2 }]);
    expect(run(s, { raise_alert_to: 1 })).toEqual([]);
    expect(s.alert.level).toBe(2);
  });

  it("emit raises a Custom event", () => {
    expect(run(fresh(), { emit: "door_alarm" })).toEqual([{ type: "Custom", tick: 0, name: "door_alarm" }]);
  });

  it("random effect sequences keep every invariant", () => {
    const rng = new Rng(77);
    const s = fresh();
    for (let i = 0; i < 3000; i++) {
      const id = rng.pick(["a", "b", "c"]);
      const effect: Effect = rng.pick<Effect>([
        { add_item: [id, rng.int(1, 4)] }, { remove_item: [id, rng.int(1, 6)] },
        { add_credits: rng.int(-30, 30) }, { adjust_trust: [id, rng.int(-2, 2)] },
        { raise_alert_to: rng.int(0, 3) as 0 | 1 | 2 | 3 }, { give_clue: { id, from: "t" } },
        { verify_clue: id }, { disprove_clue: id }, { set_flag: [id, rng.chance(0.5)] },
      ]);
      applyEffect(effect, s, []);
      expect(Object.values(s.inventory.items).every((n) => n > 0)).toBe(true);
      expect(s.inventory.credits).toBeGreaterThanOrEqual(0);
      expect(Object.values(s.trust).every((t) => t === -1 || t === 0 || t === 1)).toBe(true);
      expect(s.alert.level).toBeGreaterThanOrEqual(0);
      expect(s.alert.level).toBeLessThanOrEqual(3);
    }
  });
});

describe("validation mirrors the runtime", () => {
  const goodConds: unknown[] = [
    { has_clue: "a" }, { clue_state: ["a", "verified"] }, { flag: "a" }, { flag_eq: ["a", 1] }, { has_item: "a" },
    { has_item: ["a", 2] }, { credits_gte: 5 }, { trust_gte: ["a", 1] }, { alert_gte: 2 }, { time_between: [0, 120] },
    { arrest_count_gte: 1 }, { all: [{ flag: "a" }, { not: { flag: "b" } }] }, { any: [{ flag: "a" }] },
  ];
  const goodEffects: unknown[] = [
    { give_clue: { id: "a", from: "b" } }, { verify_clue: "a" }, { disprove_clue: "a" }, { set_flag: ["a", true] },
    { add_item: ["a", 1] }, { remove_item: ["a", 1] }, { add_credits: -5 }, { adjust_trust: ["a", -1] },
    { raise_alert_to: 3 }, { emit: "x" },
  ];

  it("accepts every well-formed condition and effect", () => {
    for (const c of goodConds) expect(validateCondition(c), JSON.stringify(c)).toEqual([]);
    for (const e of goodEffects) expect(validateEffect(e), JSON.stringify(e)).toEqual([]);
  });

  it("accepted forms evaluate without throwing", () => {
    const s = fresh();
    for (const c of goodConds) expect(() => evalCondition(c as Condition, s, config)).not.toThrow();
    for (const e of goodEffects) expect(() => applyEffect(e as Effect, s, [])).not.toThrow();
  });

  it("rejects malformed input with a path in the message", () => {
    expect(validateCondition({ has_clue: 5 })[0]).toContain("condition.has_clue");
    expect(validateCondition({ flag: "a", has_clue: "b" })[0]).toContain("exactly one key");
    expect(validateCondition({})[0]).toContain("none");
    expect(validateCondition({ nope: 1 })[0]).toContain('unknown condition "nope"');
    expect(validateCondition({ all: [] })[0]).toContain("non-empty");
    expect(validateCondition({ all: [{ alert_gte: 9 }] })[0]).toContain("condition.all[0].alert_gte");
    expect(validateCondition({ trust_gte: ["a", 2] })).toHaveLength(1);
    expect(validateCondition({ time_between: [0, 2000] })).toHaveLength(1);
    expect(validateCondition("flag")).toHaveLength(1);
    expect(validateEffect({ add_item: ["a", 0] })).toHaveLength(1);
    expect(validateEffect({ give_clue: { id: "a" } })).toHaveLength(1);
    expect(validateEffect({ explode: true })[0]).toContain('unknown effect "explode"');
    expect(validateEffect([1])).toHaveLength(1);
  });
});
