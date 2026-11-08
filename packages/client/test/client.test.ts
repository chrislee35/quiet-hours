// covers: CORE-1, ACC-1, NFR-9 (storage namespacing, DESIGN §16.2)
import { describe, expect, it } from "vitest";
import { FixedStepper } from "../src/loop.ts";
import { intentFromActions, type HeldActions } from "../src/input/actions.ts";
import { STORAGE_PREFIX, safeStorage, storageKey } from "../src/storage.ts";

const none: HeldActions = { up: false, down: false, left: false, right: false, run: false, sneak: false };

describe("FixedStepper", () => {
  it("runs the right number of ticks and carries the remainder", () => {
    const s = new FixedStepper(30);
    expect(s.advance(16.7)).toBe(0);
    expect(s.advance(16.7)).toBe(1); // 33.4 ms >= 33.33
    expect(s.alpha).toBeGreaterThanOrEqual(0);
    expect(s.alpha).toBeLessThan(1);
  });

  it("is exact over a long run: 10 s of 60 fps frames is 300 ticks at 30 tps", () => {
    const s = new FixedStepper(30);
    let ticks = 0;
    for (let i = 0; i < 600; i++) ticks += s.advance(1000 / 60);
    expect(ticks).toBe(300);
  });

  it("caps catch-up after a stall and drops the backlog", () => {
    const s = new FixedStepper(30, 5);
    expect(s.advance(10_000)).toBe(5);
    expect(s.advance(0)).toBe(0);
  });

  it("ignores negative deltas", () => {
    expect(new FixedStepper(30).advance(-50)).toBe(0);
  });
});

describe("intentFromActions", () => {
  it("combines opposite keys to zero", () => {
    expect(intentFromActions({ ...none, left: true, right: true })).toMatchObject({ dx: 0 });
  });
  it("maps directions and modes; sneak beats run", () => {
    expect(intentFromActions({ ...none, up: true, right: true })).toEqual({ dx: 1, dy: -1, mode: "walk" });
    expect(intentFromActions({ ...none, run: true })).toMatchObject({ mode: "run" });
    expect(intentFromActions({ ...none, run: true, sneak: true })).toMatchObject({ mode: "sneak" });
  });
});

describe("storage namespacing", () => {
  it("prefixes every key exactly once", () => {
    expect(storageKey("save1")).toBe(`${STORAGE_PREFIX}save1`);
    expect(storageKey(`${STORAGE_PREFIX}save1`)).toBe(`${STORAGE_PREFIX}save1`);
    expect(() => storageKey("")).toThrow();
  });

  it("only touches namespaced keys and never throws", () => {
    const data = new Map<string, string>();
    const backend = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
    const store = safeStorage(backend);
    expect(store.set("a", "1")).toBe(true);
    expect([...data.keys()]).toEqual(["quiet-hours:a"]);
    expect(store.get("a")).toBe("1");
    store.remove("a");
    expect(store.get("a")).toBeNull();

    const throwing = safeStorage({
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    });
    expect(throwing.get("a")).toBeNull();
    expect(throwing.set("a", "1")).toBe(false);
    expect(safeStorage(undefined).set("a", "1")).toBe(false);
  });
});
