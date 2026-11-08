// covers: NFR-3
import { describe, expect, it } from "vitest";
import { Rng } from "../src/index.ts";

describe("Rng", () => {
  it("same seed gives the same sequence", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect(Array.from({ length: 50 }, () => a.next())).toEqual(Array.from({ length: 50 }, () => b.next()));
  });

  it("different seeds diverge", () => {
    expect(new Rng(1).next()).not.toEqual(new Rng(2).next());
  });

  it("state round-trips: resuming from state continues the exact sequence", () => {
    const a = new Rng(7);
    for (let i = 0; i < 10; i++) a.next();
    const resumed = new Rng(a.state);
    expect(resumed.next()).toEqual(a.next());
  });

  it("next() stays in [0,1) and int() stays in range, over many draws", () => {
    const r = new Rng(123);
    for (let i = 0; i < 5000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(-3, 4);
      expect(n).toBeGreaterThanOrEqual(-3);
      expect(n).toBeLessThanOrEqual(4);
    }
  });

  it("int() rejects invalid ranges; pick() rejects empty lists", () => {
    const r = new Rng(1);
    expect(() => r.int(5, 1)).toThrow(RangeError);
    expect(() => r.int(0.5, 2)).toThrow(RangeError);
    expect(() => r.pick([])).toThrow(RangeError);
  });

  it("fork() yields an independent deterministic child", () => {
    const a = new Rng(9);
    const b = new Rng(9);
    expect(a.fork().next()).toEqual(b.fork().next());
  });
});
