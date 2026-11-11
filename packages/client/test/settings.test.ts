// covers: ACC-1, ACC-2, ACC-3, HAK-3
import { describe, expect, it } from "vitest";
import {
  ACTIONS, ACTION_NAMES, DEFAULT_KEYS, DEFAULT_PAD, keyName, loadPadBindings, padButtonName, rebindPad, resetBindings, savePadBindings, saveBindings, loadBindings, unboundActions,
} from "../src/input/actions.ts";
import { PALETTES, PALETTE_IDS, canvasColours, contrast, cssVariables, difference, luminance, simulate } from "../src/palette.ts";
import { DEFAULT_SETTINGS, TEXT_SCALES, applySettings, fontPixels, loadSettings, parseSettings, saveSettings } from "../src/settings.ts";
import { SettingsStore } from "../src/settings-store.ts";
import { safeStorage } from "../src/storage.ts";
import { OVERLAY_CSS } from "../src/ui/styles.ts";

const memory = () => {
  const data = new Map<string, string>();
  return { data, storage: safeStorage({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }) };
};
const fakeRoot = () => {
  const style = new Map<string, string>();
  return { style: { setProperty: (k: string, v: string) => void style.set(k, v) }, dataset: {} as Record<string, string>, vars: style } as unknown as HTMLElement & { vars: Map<string, string> };
};

describe("settings", () => {
  it("start with sensible defaults, seeded from the browser's reduced-motion preference the first time only", () => {
    const { storage } = memory();
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(storage, true).reduceMotion).toBe(true);
    saveSettings(storage, { ...DEFAULT_SETTINGS, reduceMotion: false });
    expect(loadSettings(storage, true).reduceMotion).toBe(false); // the player's own choice wins afterwards
  });

  it("are remembered, per field, under the game's prefix", () => {
    const { data, storage } = memory();
    saveSettings(storage, { ...DEFAULT_SETTINGS, textScale: 200, palette: "red_green", puzzleSkip: true });
    expect([...data.keys()]).toEqual(["quiet-hours:settings"]);
    expect(loadSettings(storage)).toMatchObject({ textScale: 200, palette: "red_green", puzzleSkip: true });
  });

  it("an unreadable or tampered value falls back to the default for that field only", () => {
    expect(parseSettings({ textScale: 175, palette: "neon", reduceMotion: "yes", alertCues: false, puzzleSkip: 1 })).toEqual({ ...DEFAULT_SETTINGS, alertCues: false });
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
    const { data, storage } = memory();
    data.set("quiet-hours:settings", "{{ broken");
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it("text scales are 100, 125, 150 and 200 percent and set the base font accordingly", () => {
    expect([...TEXT_SCALES]).toEqual([100, 125, 150, 200]);
    expect(TEXT_SCALES.map(fontPixels)).toEqual([16, 20, 24, 32]);
    const root = fakeRoot();
    applySettings({ ...DEFAULT_SETTINGS, textScale: 200 }, root);
    expect(root.vars.get("--qh-font")).toBe("32px");
    expect(root.dataset.textScale).toBe("200");
  });

  it("the store saves and applies each change, tells listeners what changed, and ignores no-ops", () => {
    const { storage } = memory();
    const store = new SettingsStore(storage, false, false);
    const seen: string[][] = [];
    store.onChange((_, changed) => seen.push(changed));
    store.update({ palette: "high_contrast" }, false);
    store.update({ palette: "high_contrast" }, false);
    store.update({ puzzleSkip: true, textScale: 150 }, false);
    expect(seen).toEqual([["palette"], ["puzzleSkip", "textScale"]]);
    expect(loadSettings(storage)).toMatchObject({ palette: "high_contrast", puzzleSkip: true, textScale: 150 });
    expect(new SettingsStore(storage, false, false).get().textScale).toBe(150);
  });
});

describe("palettes (ACC-2)", () => {
  const PANEL = "#10121c";
  const roles = ["live", "good", "bad", "warn", "text", "muted", "liveSoft", "goodSoft", "badSoft", "warnSoft"] as const;

  it("every palette defines every role as a real colour, and sets every CSS variable the stylesheet uses", () => {
    for (const id of PALETTE_IDS) {
      for (const r of roles) expect(PALETTES[id][r], `${id}.${r}`).toMatch(/^#[0-9a-f]{6}$/);
      const vars = Object.keys(cssVariables(PALETTES[id]));
      expect(vars).toHaveLength(10);
      for (const v of vars) expect(OVERLAY_CSS, `${v} is defined in the stylesheet`).toContain(`${v}:`);
    }
  });

  it("the stylesheet's own defaults match the default palette", () => {
    for (const [k, v] of Object.entries(cssVariables(PALETTES.default))) expect(OVERLAY_CSS).toContain(`${k}: ${v}`);
  });

  it("every role is readable on the dark panels: contrast of at least 4.5 to 1 in every palette", () => {
    for (const id of PALETTE_IDS) for (const r of roles) expect(contrast(PALETTES[id][r], PANEL), `${id}.${r}`).toBeGreaterThanOrEqual(4.5);
  });

  it("colour-blind palettes keep the roles that matter clearly different under a simulation of that vision", () => {
    const pairs: ["good" | "live" | "warn", "bad"][] = [["good", "bad"], ["live", "bad"], ["warn", "bad"]];
    for (const id of ["red_green", "blue_yellow"] as const) {
      const p = PALETTES[id];
      for (const [a, b] of pairs) expect(difference(p[a], p[b], p.for as "deutan" | "tritan"), `${id}: ${a} vs ${b}`).toBeGreaterThanOrEqual(25);
    }
    // The red-green palette also holds for the other red-green deficiency.
    for (const [a, b] of pairs) expect(difference(PALETTES.red_green[a], PALETTES.red_green[b], "protan")).toBeGreaterThanOrEqual(25);
  });

  it("that the test would catch a bad palette: the default's red and green collapse for a deuteranope, the safe palette's do not", () => {
    expect(difference(PALETTES.default.good, PALETTES.default.bad, "deutan")).toBeLessThan(difference(PALETTES.red_green.good, PALETTES.red_green.bad, "deutan"));
    expect(difference("#ff0000", "#00aa00", "deutan")).toBeLessThan(30);
  });

  it("the colour maths is sound: contrast of black and white is 21, simulation leaves greys alone, delta of a colour with itself is 0", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(luminance("#000000")).toBe(0);
    const [r, g, b] = simulate("#808080", "deutan");
    expect(Math.abs(r - g)).toBeLessThan(0.02);
    expect(Math.abs(g - b)).toBeLessThan(0.02);
    expect(difference("#123456", "#123456", "protan")).toBe(0);
  });

  it("provides the colours the canvas needs as numbers", () => {
    expect(canvasColours(PALETTES.default)).toEqual({ live: 0x5fd6ee, good: 0x7fe08a, bad: 0xff7a8a, warn: 0xffd36b });
  });

  it("applying a palette sets its variables on the page", () => {
    const root = fakeRoot();
    applySettings({ ...DEFAULT_SETTINGS, palette: "blue_yellow" }, root);
    expect(root.vars.get("--qh-bad")).toBe(PALETTES.blue_yellow.bad);
    expect(root.dataset.palette).toBe("blue_yellow");
  });
});

describe("rebinding gamepad buttons and the controls screen (ACC-1)", () => {
  it("binding a button takes it from the action that had it, and reports that", () => {
    const { map, displaced } = rebindPad(DEFAULT_PAD, "interact", 1); // B was "cancel"
    expect(map.interact).toEqual([1]);
    expect(map.cancel).toEqual([]);
    expect(displaced).toEqual(["cancel"]);
    expect(DEFAULT_PAD.cancel).toEqual([1]); // the original is not mutated
  });

  it("a free button is just assigned, and the old one is dropped", () => {
    const { map, displaced } = rebindPad(DEFAULT_PAD, "gear", 11);
    expect(map.gear).toEqual([11]);
    expect(displaced).toEqual([]);
  });

  it("pad bindings are remembered, validated, and reset along with the keys", () => {
    const { data, storage } = memory();
    expect(loadPadBindings(storage)).toBe(DEFAULT_PAD);
    savePadBindings(storage, rebindPad(DEFAULT_PAD, "gear", 11).map);
    expect(loadPadBindings(storage).gear).toEqual([11]);
    data.set("quiet-hours:padbindings", JSON.stringify({ ...DEFAULT_PAD, gear: [99] }));
    expect(loadPadBindings(storage)).toBe(DEFAULT_PAD); // a button that cannot exist is rejected
    saveBindings(storage, DEFAULT_KEYS);
    resetBindings(storage);
    expect(loadBindings(storage)).toBe(DEFAULT_KEYS);
    expect(loadPadBindings(storage)).toBe(DEFAULT_PAD);
    expect([...data.keys()]).toEqual([]);
  });

  it("every action has a human name, and default controls leave nothing unbound", () => {
    for (const a of ACTIONS) expect(ACTION_NAMES[a].length).toBeGreaterThan(2);
    expect(unboundActions(DEFAULT_KEYS)).toEqual([]);
  });

  it("names keys and buttons the way a player says them", () => {
    expect([keyName("KeyE"), keyName("ArrowUp"), keyName("ShiftLeft"), keyName("Escape"), keyName("Digit4"), keyName("ControlRight")]).toEqual(["E", "Up", "Shift Left", "Escape", "4", "Control Right"]);
    expect([padButtonName(0), padButtonName(5), padButtonName(9), padButtonName(20)]).toEqual(["A", "Right bumper", "Start", "Button 20"]);
  });
});
