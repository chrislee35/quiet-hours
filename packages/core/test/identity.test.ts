// covers: STE-1, STE-2, STE-3
import { describe, expect, it } from "vitest";
import {
  RuleError, applyEffect, consumePass, createInitialState, curfewExempt, evalCondition, resolvePass, validateEffect,
  type GameEvent, type Pass, type SimState, type ZoneDef,
} from "../src/index.ts";
import { config } from "./helpers.ts";

const zone = (id: string, requiredPermission: number): ZoneDef => ({ id, requiredPermission });
const pass = (over: Partial<Pass> = {}): Pass => ({
  id: "p", label: "Pass", level: 2, zones: null, expiresTick: null, usesLeft: null, origin: "issued", curfewExempt: false, ...over,
});
const withPasses = (passes: Pass[], tick = 0): SimState => {
  const s = createInitialState(1, config);
  s.passes = passes;
  s.tick = tick;
  return s;
};
const outcome = (s: SimState, z: ZoneDef | null, thorough = false) => resolvePass(s, z, { thorough }).outcome;

describe("resolvePass: the null state", () => {
  it("someone with no record is Null (pending review), everywhere, never a violation", () => {
    const s = withPasses([]);
    expect(resolvePass(s, zone("vault", 3))).toEqual({ outcome: "Null", passId: null, reason: "no record" });
    expect(outcome(s, zone("street", 0))).toBe("Null");
    expect(outcome(s, null)).toBe("Null");
  });
});

describe("resolvePass: a record", () => {
  it("a valid pass is Allowed and names the pass used", () => {
    expect(resolvePass(withPasses([pass()]), zone("lab", 2))).toMatchObject({ outcome: "Allowed", passId: "p" });
    expect(outcome(withPasses([pass({ level: 0 })]), zone("street", 0))).toBe("Allowed");
  });

  it("insufficient level is a Violation", () => {
    const r = resolvePass(withPasses([pass({ level: 1 })]), zone("lab", 2));
    expect(r).toMatchObject({ outcome: "Violation", reason: "insufficient level" });
  });

  it("zone-limited passes only work in their zones", () => {
    const s = withPasses([pass({ zones: ["lab"] })]);
    expect(outcome(s, zone("lab", 2))).toBe("Allowed");
    expect(outcome(s, zone("vault", 2))).toBe("Violation");
    expect(outcome(s, null)).toBe("Violation");
  });

  it("expiry is exact: valid on the last tick, Expired from the expiry tick on", () => {
    const p = pass({ expiresTick: 100 });
    expect(outcome(withPasses([p], 99), zone("lab", 2))).toBe("Allowed");
    expect(outcome(withPasses([p], 100), zone("lab", 2))).toBe("Expired");
  });

  it("an expired pass that would not have worked anyway is a plain Violation", () => {
    expect(outcome(withPasses([pass({ expiresTick: 1, level: 1 })], 50), zone("lab", 2))).toBe("Violation");
  });

  it("a spent one-time pass is a Violation; an unspent one works", () => {
    expect(outcome(withPasses([pass({ usesLeft: 0 })]), zone("lab", 2))).toBe("Violation");
    expect(outcome(withPasses([pass({ usesLeft: 1 })]), zone("lab", 2))).toBe("Allowed");
  });

  it("forged passes fool a basic scan but not a thorough one (an Auditor)", () => {
    const s = withPasses([pass({ origin: "forged" })]);
    expect(outcome(s, zone("lab", 2), false)).toBe("Allowed");
    expect(outcome(s, zone("lab", 2), true)).toBe("Violation");
    const both = withPasses([pass({ origin: "forged", id: "fake" }), pass({ id: "real", level: 3 })]);
    expect(resolvePass(both, zone("lab", 2), { thorough: true })).toMatchObject({ outcome: "Allowed", passId: "real" });
  });

  it("borrowed and stolen passes work like any other until something else says they do not", () => {
    for (const origin of ["borrowed", "stolen"] as const) expect(outcome(withPasses([pass({ origin })]), zone("lab", 2))).toBe("Allowed");
  });

  it("with several passes, the lowest-level valid one is used (do not burn the powerful pass)", () => {
    const s = withPasses([pass({ id: "high", level: 5 }), pass({ id: "low", level: 2 }), pass({ id: "tiny", level: 1 })]);
    expect(resolvePass(s, zone("lab", 2)).passId).toBe("low");
  });
});

describe("pass bookkeeping", () => {
  it("consumePass uses up limited passes, never below zero, and leaves unlimited ones alone", () => {
    const s = withPasses([pass({ id: "once", usesLeft: 1 }), pass({ id: "free" })]);
    consumePass(s, "once");
    consumePass(s, "once");
    consumePass(s, "free");
    consumePass(s, "ghost");
    expect(s.passes.map((p) => p.usesLeft)).toEqual([0, null]);
  });

  it("curfew exemption needs an exempt pass that has not expired", () => {
    expect(curfewExempt(withPasses([pass()]))).toBe(false);
    expect(curfewExempt(withPasses([pass({ curfewExempt: true })]))).toBe(true);
    expect(curfewExempt(withPasses([pass({ curfewExempt: true, expiresTick: 5 })], 6))).toBe(false);
    expect(curfewExempt(withPasses([]))).toBe(false);
  });
});

describe("pass effects and conditions", () => {
  const give = (s: SimState, extra: object = {}) => {
    const events: GameEvent[] = [];
    applyEffect({ give_pass: { id: "work", label: "Work permit", level: 1, origin: "issued", ...extra } }, s, events, config);
    return events;
  };

  it("give_pass creates the pass, converting in-game minutes to a tick expiry", () => {
    const s = createInitialState(1, config);
    const events = give(s, { expiresInMinutes: 10, uses: 3, zones: ["lab"], curfewExempt: true });
    expect(events).toEqual([{ type: "PassGained", tick: 0, passId: "work" }]);
    expect(s.passes[0]).toEqual({
      id: "work", label: "Work permit", level: 1, zones: ["lab"], usesLeft: 3, origin: "issued", curfewExempt: true,
      expiresTick: 10 * (config.sim.ticksPerSecond / config.clock.gameMinutesPerRealSecond),
    });
  });

  it("giving a pass with an existing id replaces it; revoke removes it and reports once", () => {
    const s = createInitialState(1, config);
    give(s);
    give(s, { level: 4 });
    expect(s.passes).toHaveLength(1);
    expect(s.passes[0]!.level).toBe(4);
    const ev: GameEvent[] = [];
    applyEffect({ revoke_pass: "work" }, s, ev);
    applyEffect({ revoke_pass: "work" }, s, ev);
    expect(ev).toEqual([{ type: "PassLost", tick: 0, passId: "work" }]);
  });

  it("an expiring pass needs the config; without it the effect refuses rather than guessing", () => {
    expect(() => applyEffect({ give_pass: { id: "x", label: "x", level: 0, origin: "issued", expiresInMinutes: 5 } }, createInitialState(1, config), [])).toThrow(RuleError);
  });

  it("has_pass reads whether the pass is held", () => {
    const s = createInitialState(1, config);
    expect(evalCondition({ has_pass: "work" }, s, config)).toBe(false);
    give(s);
    expect(evalCondition({ has_pass: "work" }, s, config)).toBe(true);
  });

  it("validation accepts good give_pass effects and explains bad ones", () => {
    expect(validateEffect({ give_pass: { id: "a", label: "A", level: 2, origin: "forged", zones: ["z"], expiresInMinutes: 30, uses: 1, curfewExempt: false } })).toEqual([]);
    expect(validateEffect({ revoke_pass: "a" })).toEqual([]);
    expect(validateEffect({ give_pass: { id: "a", label: "A", level: 99, origin: "issued" } })[0]).toContain("level");
    expect(validateEffect({ give_pass: { id: "a", label: "A", level: 1, origin: "magic" } })[0]).toContain("origin");
    expect(validateEffect({ give_pass: { id: "a", label: "A", level: 1, origin: "issued", expiresInMinutes: 0 } })[0]).toContain("expiresInMinutes");
    expect(validateEffect({ give_pass: "x" })[0]).toContain("object");
  });
});
