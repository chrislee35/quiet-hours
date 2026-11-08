// covers: ACC-1
import { describe, expect, it } from "vitest";
import {
  ACTIONS, DEFAULT_KEYS, DEFAULT_PAD, loadBindings, rebindKey, saveBindings, unboundActions, type Action, type KeyBindings,
} from "../src/input/actions.ts";
import { InputController } from "../src/input/controller.ts";
import { STICK_THRESHOLD, newPresses, noActions, padActions, type PadSnapshot } from "../src/input/gamepad.ts";
import { safeStorage } from "../src/storage.ts";

const memory = () => {
  const data = new Map<string, string>();
  return safeStorage({
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  });
};

const pad = (pressed: number[] = [], axes: [number, number] = [0, 0]): PadSnapshot => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
});

describe("default bindings", () => {
  it("cover every action, and no key is bound twice", () => {
    for (const a of ACTIONS) {
      expect(DEFAULT_KEYS[a].length, a).toBeGreaterThan(0);
      expect(DEFAULT_PAD[a].length, a).toBeGreaterThan(0);
    }
    const keys = ACTIONS.flatMap((a) => DEFAULT_KEYS[a]);
    expect(new Set(keys).size).toBe(keys.length);
    const buttons = ACTIONS.flatMap((a) => DEFAULT_PAD[a]);
    expect(new Set(buttons).size).toBe(buttons.length);
  });
});

describe("rebindKey", () => {
  it("replaces the action's keys and does not mutate the original", () => {
    const before = JSON.stringify(DEFAULT_KEYS);
    const { map, displaced } = rebindKey(DEFAULT_KEYS, "interact", "KeyF");
    expect(map.interact).toEqual(["KeyF"]);
    expect(displaced).toEqual([]);
    expect(JSON.stringify(DEFAULT_KEYS)).toBe(before);
  });

  it("takes a key that another action had and reports it (a key can only do one thing)", () => {
    const { map, displaced } = rebindKey(DEFAULT_KEYS, "interact", "KeyN");
    expect(displaced).toEqual(["notebook"]);
    expect(map.notebook).toEqual([]);
    expect(unboundActions(map)).toEqual(["notebook"]);
  });

  it("partly unbinds multi-key actions", () => {
    const { map } = rebindKey(DEFAULT_KEYS, "sneak", "ArrowUp");
    expect(map.up).toEqual(["KeyW"]);
    expect(map.sneak).toEqual(["ArrowUp"]);
  });
});

describe("saved bindings", () => {
  it("round-trip, and fall back to defaults on missing, corrupt, or partial data", () => {
    const store = memory();
    expect(loadBindings(store)).toEqual(DEFAULT_KEYS);
    const custom = rebindKey(DEFAULT_KEYS, "interact", "KeyF").map;
    expect(saveBindings(store, custom)).toBe(true);
    expect(loadBindings(store)).toEqual(custom);
    store.set("bindings", "{not json");
    expect(loadBindings(store)).toEqual(DEFAULT_KEYS);
    store.set("bindings", JSON.stringify({ up: ["KeyW"] }));
    expect(loadBindings(store)).toEqual(DEFAULT_KEYS);
    store.set("bindings", JSON.stringify({ ...DEFAULT_KEYS, up: [5] }));
    expect(loadBindings(store)).toEqual(DEFAULT_KEYS);
  });

  it("never throws when storage is unavailable", () => {
    expect(loadBindings(safeStorage(undefined))).toEqual(DEFAULT_KEYS);
    expect(saveBindings(safeStorage(undefined), DEFAULT_KEYS)).toBe(false);
  });
});

describe("padActions", () => {
  it("maps buttons and the d-pad", () => {
    const a = padActions(pad([0, 14, 5]), DEFAULT_PAD);
    expect(a).toMatchObject({ interact: true, left: true, run: true, up: false, sneak: false });
  });
  it("treats the left stick as directions only past the threshold", () => {
    expect(padActions(pad([], [STICK_THRESHOLD - 0.01, 0]), DEFAULT_PAD).right).toBe(false);
    expect(padActions(pad([], [STICK_THRESHOLD, 0]), DEFAULT_PAD).right).toBe(true);
    expect(padActions(pad([], [-0.9, 0.9]), DEFAULT_PAD)).toMatchObject({ left: true, down: true, up: false });
  });
  it("handles no pad and missing buttons", () => {
    expect(padActions(null, DEFAULT_PAD)).toEqual(noActions());
    expect(padActions({ axes: [], buttons: [] }, DEFAULT_PAD)).toEqual(noActions());
  });
  it("newPresses reports only fresh edges", () => {
    const a = padActions(pad([0]), DEFAULT_PAD);
    expect(newPresses(noActions(), a)).toEqual(["interact"]);
    expect(newPresses(a, a)).toEqual([]);
  });
});

describe("InputController", () => {
  const key = (type: "keydown" | "keyup", code: string, repeat = false) => Object.assign(new Event(type), { code, repeat });
  const setup = (keys: KeyBindings = DEFAULT_KEYS) => {
    const win = new EventTarget();
    let snapshot: PadSnapshot | null = null;
    const c = new InputController(win, keys, DEFAULT_PAD, () => snapshot);
    const presses: [Action, string][] = [];
    c.onPress((a, s) => presses.push([a, s]));
    return { win, c, presses, setPad: (p: PadSnapshot | null) => (snapshot = p) };
  };

  it("tracks held keys and releases them", () => {
    const { win, c } = setup();
    win.dispatchEvent(key("keydown", "KeyD"));
    win.dispatchEvent(key("keydown", "ShiftLeft"));
    expect(c.held).toMatchObject({ right: true, run: true, left: false });
    win.dispatchEvent(key("keyup", "KeyD"));
    expect(c.held.right).toBe(false);
    expect(c.held.run).toBe(true);
  });

  it("emits press edges once per physical press, ignoring auto-repeat", () => {
    const { win, presses } = setup();
    win.dispatchEvent(key("keydown", "KeyE"));
    win.dispatchEvent(key("keydown", "KeyE", true));
    win.dispatchEvent(key("keydown", "KeyE", true));
    expect(presses).toEqual([["interact", "keyboard"]]);
  });

  it("follows rebinding immediately", () => {
    const { win, c, presses } = setup();
    c.setKeyBindings(rebindKey(DEFAULT_KEYS, "interact", "KeyF").map);
    win.dispatchEvent(key("keydown", "KeyE"));
    expect(presses).toEqual([]);
    win.dispatchEvent(key("keydown", "KeyF"));
    expect(presses).toEqual([["interact", "keyboard"]]);
  });

  it("releases everything when the window loses focus (no stuck keys)", () => {
    const { win, c } = setup();
    win.dispatchEvent(key("keydown", "KeyW"));
    expect(c.held.up).toBe(true);
    win.dispatchEvent(new Event("blur"));
    expect(c.held.up).toBe(false);
  });

  it("merges gamepad movement into held and reports pad presses as such", () => {
    const { c, presses, setPad } = setup();
    expect(c.padConnected).toBe(false);
    setPad(pad([0], [0.9, 0]));
    c.poll();
    expect(c.padConnected).toBe(true);
    expect(c.held.right).toBe(true);
    expect(presses).toEqual([["right", "pad"], ["interact", "pad"]].sort((a, b) => ACTIONS.indexOf(a[0] as Action) - ACTIONS.indexOf(b[0] as Action)));
    c.poll(); // still held: no new edges
    expect(presses).toHaveLength(2);
    setPad(pad());
    c.poll();
    expect(c.held.right).toBe(false);
  });

  it("keyboard and pad can both hold an action; releasing one keeps it held", () => {
    const { win, c, setPad } = setup();
    win.dispatchEvent(key("keydown", "KeyW"));
    setPad(pad([12]));
    c.poll();
    win.dispatchEvent(key("keyup", "KeyW"));
    expect(c.held.up).toBe(true);
    setPad(pad());
    c.poll();
    expect(c.held.up).toBe(false);
  });
});
