// covers: SAV-1, SAV-2, SAV-3, FAIL-5
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EMPTY_CONTENT, SAVE_VERSION, SaveError, Sim, autosaveStatus, buildWorld, createSave, importTiled, loadSave, saveStatus, stateHash, stringifySave,
  type AugmentDef, type Command, type Content, type ItemDef, type Migration, type ReactionDef, type ServiceDef, type SimState,
} from "@qh/core";
import { Scenario, asciiWorld } from "../src/index.ts";
import { config } from "./helpers.ts";

const read = (rel: string) => readFileSync(new URL(`../../../content/${rel}`, import.meta.url), "utf8");
const list = <T extends { id: string }>(rel: string) => Object.fromEntries((JSON.parse(read(rel)) as T[]).map((x) => [x.id, x]));
const content: Content = {
  ...EMPTY_CONTENT, augments: list<AugmentDef>("augments/augments.json"), items: list<ItemDef>("items/items.json"),
  services: list<ServiceDef>("services/services.json"), reactions: list<ReactionDef>("reactions/city.json"),
};
const world = buildWorld(importTiled(JSON.parse(read("maps/robot_range.json")), "robot_range"));
const meta = { build: "test", label: "test", savedAt: "2026-01-01T00:00:00.000Z" };
const text = (s: SimState) => stringifySave(createSave(s, "robot_range", meta));
const load = (t: string) => loadSave(t, config, world);

/** A game with something in every corner of the state: moves, items, a debt, a fight, a conversation-free pause. */
function played(): Scenario {
  const s = new Scenario(config, 7, world, content);
  s.command({ type: "ApplyEffects", effects: [{ add_credits: 80 }, { add_item: ["stun_charge", 2] }, { add_item: ["scrap_wire", 3] }, { grant_augment: "quiet_step" }, { take_loan: ["odd_sam", 30] }, { adjust_trust: ["odd_sam", 1, "test"] }, { set_flag: ["met", true] }, { give_clue: { id: "pump4_shift", from: "odd_sam" } }] });
  s.command({ type: "EquipAugment", id: "quiet_step" });
  s.command({ type: "SetMove", dx: 1, dy: 0, mode: "run" }).advance(6);
  return s;
}
const script: Command[][] = Array.from({ length: 200 }, (_, i) => (i === 50 ? [{ type: "SetMove", dx: 0, dy: 1, mode: "walk" }] : i === 120 ? [{ type: "UseItem", id: "stun_charge" }] : []));
const run = (sim: Sim) => {
  for (const cmds of script) sim.tick(cmds);
  return sim.hash;
};

describe("round trip (SAV-2)", () => {
  it("the saved text parses back to a deep-equal state", () => {
    const s = played();
    expect(load(text(s.sim.state)).state).toEqual(s.sim.state);
  });

  it("a loaded game steps identically to the original, tick for tick, including RNG and every system", () => {
    const original = played();
    const copy = new Sim(config, 7, { world, content, initial: load(text(original.sim.state)).state });
    expect(copy.hash).toBe(original.sim.hash);
    expect(run(copy)).toBe(run(original.sim));
  });

  it("saving does not disturb the running game", () => {
    const s = played();
    const before = s.sim.hash;
    text(s.sim.state);
    expect(s.sim.hash).toBe(before);
  });

  it("Sim.load replaces the whole state and tells listeners", () => {
    const a = played();
    const b = new Sim(config, 1, { world, content });
    const seen: string[] = [];
    b.bus.subscribe((e) => seen.push(e.type));
    b.load(load(text(a.sim.state)).state);
    expect(b.hash).toBe(a.sim.hash);
    expect(seen).toEqual(["GameLoaded"]);
  });

  it("is plain JSON: no undefined, NaN or Infinity can be written", () => {
    const s = played();
    s.edit((st) => {
      st.player.x = Number.NaN;
    });
    expect(() => text(s.sim.state)).toThrow(SaveError);
  });

  it("a conversation in progress, a processing hold and a dormant robot all survive", () => {
    const s = played();
    s.edit((st) => {
      st.conversation = { dialogueId: "x", node: "y", notice: "A line." };
      st.processingUntil = st.tick + 100;
      st.robots[0]!.dormant = true;
    });
    expect(load(text(s.sim.state)).state).toEqual(s.sim.state);
  });

  it("does not touch clues, trust or flags (FAIL-5)", () => {
    const s = played();
    const back = load(text(s.sim.state)).state;
    expect(back.clues.pump4_shift).toBeDefined();
    expect(back.trust.odd_sam).toBe(1);
    expect(back.flags.met).toBe(true);
  });
});

describe("bad saves fail safely (SAV-3)", () => {
  const good = () => JSON.parse(text(played().sim.state)) as Record<string, any>;
  const code = (t: string) => {
    try {
      load(t);
    } catch (e) {
      return e instanceof SaveError ? e.code : "threw-other";
    }
    return "loaded";
  };

  it("rejects garbage, other JSON, and truncated files with distinct codes", () => {
    expect(code("{{{")).toBe("corrupt");
    expect(code(text(played().sim.state).slice(0, 200))).toBe("corrupt");
    expect(code("[]")).toBe("unknown_format");
    expect(code(JSON.stringify({ hello: 1 }))).toBe("unknown_format");
    expect(code("")).toBe("corrupt");
  });

  it("rejects a save from a newer version, and never guesses", () => {
    const g = good();
    g.version = SAVE_VERSION + 1;
    expect(code(JSON.stringify(g))).toBe("too_new");
  });

  it("rejects a save for a different map", () => {
    const g = good();
    g.map = "stacks_slice";
    expect(code(JSON.stringify(g))).toBe("wrong_map");
  });

  it("rejects a state with missing or extra fields, wrong types, or robots that do not match the map", () => {
    const missing = good();
    delete missing.state.metrics;
    expect(code(JSON.stringify(missing))).toBe("invalid_state");
    const extra = good();
    extra.state.surprise = 1;
    expect(code(JSON.stringify(extra))).toBe("invalid_state");
    const wrong = good();
    wrong.state.tick = "soon";
    expect(code(JSON.stringify(wrong))).toBe("invalid_state");
    const robots = good();
    robots.state.robots.pop();
    expect(code(JSON.stringify(robots))).toBe("invalid_state");
    const nested = good();
    delete nested.state.alert.level;
    expect(code(JSON.stringify(nested))).toBe("invalid_state");
  });

  it("a failed load leaves the running game untouched (all or nothing)", () => {
    const s = played();
    const before = s.sim.hash;
    const g = good();
    delete g.state.metrics;
    expect(() => load(JSON.stringify(g))).toThrow(SaveError);
    expect(s.sim.hash).toBe(before);
  });
});

describe("migrations (SAV-1)", () => {
  it("runs the chain in order up to the current version, and a missing step is a safe failure", () => {
    const old = JSON.parse(text(played().sim.state)) as Record<string, any>;
    old.version = 1;
    const calls: number[] = [];
    const m1: Migration = (s) => (calls.push(1), { ...s });
    const m2: Migration = (s) => {
      calls.push(2);
      const st = { ...(s.state as Record<string, unknown>) };
      return { ...s, state: st };
    };
    const ok = loadSave(JSON.stringify(old), config, world, { migrations: { 1: m1, 2: m2 }, currentVersion: 3 });
    expect(calls).toEqual([1, 2]);
    expect(ok.version).toBe(3);
    expect(() => loadSave(JSON.stringify(old), config, world, { migrations: { 2: m2 }, currentVersion: 3 })).toThrow(/no migration/);
  });

  it("a migration that fills a new field lets an old save load into a newer shape", () => {
    const old = JSON.parse(text(played().sim.state)) as Record<string, any>;
    delete old.state.metrics; // pretend this field was added in a later version
    expect(() => load(JSON.stringify(old))).toThrow(SaveError);
    const addMetrics: Migration = (s) => ({ ...s, state: { ...(s.state as object), metrics: { order: 70, power: 80, contentment: 60, lastHour: 0 } } });
    expect(loadSave(JSON.stringify(old), config, world, { migrations: { 1: addMetrics }, currentVersion: 2 }).state.metrics.order).toBe(70);
  });
});

describe("committed fixture saves", () => {
  // Every released save version keeps a fixture here; its test must keep passing as the game changes, which forces
  // a migration whenever the state shape changes. Before the first public release the fixture is simply
  // regenerated: UPDATE_FIXTURES=1 pnpm test.
  const path = new URL("./fixtures/save-v1.json", import.meta.url);
  it("version 1 still loads and plays on", () => {
    if (process.env.UPDATE_FIXTURES === "1" || !existsSync(path)) writeFileSync(path, text(played().sim.state) + "\n");
    const loaded = load(readFileSync(path, "utf8"));
    expect(loaded.version).toBe(1);
    const sim = new Sim(config, loaded.seed, { world, content, initial: loaded.state });
    for (let i = 0; i < 100; i++) sim.tick();
    expect(sim.state.tick).toBe(loaded.tick + 100);
  });
});

describe("when may you save?", () => {
  const w = asciiWorld(["#######", "#S....#", "#######"], [{ id: "home", requiredPermission: 0, safe: true, rect: [0, 0, 3, 3] }, { id: "street", requiredPermission: 0, rect: [3, 0, 4, 3] }], {
    robots: [{ id: "r1", kind: "sentry", x: 5.5, y: 1.5, facing: 0, route: null }],
  });
  const at = (x: number) => new Scenario(config, 1, w, content).player(x, 1.5);
  it("in the Safehouse always, even in danger; elsewhere only when calm", () => {
    const home = at(1.5).edit((st) => {
      st.alert.level = 3;
    });
    expect(saveStatus(home.sim.state, w, config)).toEqual({ ok: true, where: "safe" });
    const street = at(4.5).edit((st) => {
      st.alert.level = 1;
    });
    expect(saveStatus(street.sim.state, w, config)).toEqual({ ok: false, reason: "danger" });
    expect(saveStatus(at(4.5).sim.state, w, config)).toEqual({ ok: true, where: "calm" });
  });
  it("can be restricted to the Safehouse by config", () => {
    const strict = { ...config, save: { ...config.save, requireSafeZone: true } };
    expect(saveStatus(at(4.5).sim.state, w, strict)).toEqual({ ok: false, reason: "not_safe" });
    expect(saveStatus(at(1.5).sim.state, w, strict).ok).toBe(true);
  });
  it("never while being processed; and autosave also waits for calm", () => {
    const held = at(1.5).edit((st) => {
      st.processingUntil = st.tick + 50;
    });
    expect(saveStatus(held.sim.state, w, config)).toEqual({ ok: false, reason: "held" });
    expect(autosaveStatus(held.sim.state)).toBe(false);
    const safeButHunted = at(1.5).edit((st) => {
      st.alert.level = 2;
    });
    expect(autosaveStatus(safeButHunted.sim.state)).toBe(false);
    expect(autosaveStatus(at(1.5).sim.state)).toBe(true);
  });
  it("the hash of an unchanged state is stable across save and load", () => {
    const s = at(2.5);
    expect(stateHash(load2(s))).toBe(stateHash(s.sim.state));
    function load2(sc: Scenario) {
      return loadSave(stringifySave(createSave(sc.sim.state, "ascii", meta)), config, w).state;
    }
  });
});
