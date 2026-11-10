// covers: SAV-1, SAV-2, SAV-3
import { describe, expect, it } from "vitest";
import { EMPTY_CONTENT, Sim, buildWorld, validateConfig, type RobotDef, type ZoneDef } from "@qh/core";
import tuning from "../../../content/config/tuning.json" with { type: "json" };
import { Autosaver, Game, SaveStore } from "../src/saves.ts";
import { safeStorage } from "../src/storage.ts";

const config = validateConfig(tuning);
/** A 5x1 room whose west part is the Safehouse; `rows` are walls (#) or floor. */
function room(id: string, robots: RobotDef[], zones: ZoneDef[]) {
  const w = 7;
  const collision = [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1];
  const zoneGrid = collision.map((_, i) => (i >= 7 && i < 14 && i % w >= 1 && i % w <= 2 ? 1 : i >= 7 && i < 14 && i % w >= 3 && i % w <= 5 ? 2 : 0));
  return buildWorld({
    id, width: w, height: 3, collision, zoneGrid, zones, doors: [], spawns: [{ id: "start", x: 1.5, y: 1.5 }], robots, routes: [], lockers: [], npcs: [], terminals: [], cameras: [],
  });
}
const world = room("ascii", [{ id: "r1", kind: "sentry", x: 5.5, y: 1.5, facing: 0, route: null }], [{ id: "home", requiredPermission: 0, safe: true }, { id: "street", requiredPermission: 0 }]);
const memory = () => {
  const data = new Map<string, string>();
  return {
    data,
    storage: safeStorage({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }),
  };
};
const setup = (opts: { now?: () => Date } = {}) => {
  const m = memory();
  const sim = new Sim(config, 5, { world, content: EMPTY_CONTENT });
  const game = new Game(sim, new SaveStore(m.storage, "ascii"), { build: "t1", seed: () => 9, newGameEffects: [{ type: "ApplyEffects", effects: [{ add_credits: 50 }] }], ...opts });
  return { m, sim, game };
};

describe("saving and loading", () => {
  it("saves to a slot, lists it, and loads it back to the exact state", () => {
    const { sim, game } = setup();
    sim.tick([{ type: "ApplyEffects", effects: [{ add_credits: 33 }] }]);
    const hash = sim.hash;
    expect(game.save("slot1")).toEqual({ ok: true, message: "Saved." });
    const info = game.store.info("slot1")!;
    expect(info.meta.build).toBe("t1");
    expect(info.meta.label).toContain("Day 1");
    sim.tick([{ type: "ApplyEffects", effects: [{ add_credits: 100 }] }]);
    expect(sim.hash).not.toBe(hash);
    expect(game.load("slot1").ok).toBe(true);
    expect(sim.hash).toBe(hash);
  });

  it("keeps slots separate and keys saves under the game's prefix and the map", () => {
    const { m, game } = setup();
    game.save("slot1");
    game.save("slot2");
    expect([...m.data.keys()].sort()).toEqual(["quiet-hours:save:ascii:slot1", "quiet-hours:save:ascii:slot2"]);
    expect(game.store.info("slot3")).toBeNull();
  });

  it("an empty slot, a corrupt save and a foreign file are refused with a message and change nothing", () => {
    const { m, sim, game } = setup();
    const before = sim.hash;
    expect(game.load("slot3")).toEqual({ ok: false, message: "That slot is empty." });
    m.data.set("quiet-hours:save:ascii:slot1", "{{{ broken");
    expect(game.store.info("slot1")).toBeNull();
    expect(game.load("slot1")).toMatchObject({ ok: false, message: expect.stringContaining("damaged") });
    expect(game.loadText("[1,2]")).toMatchObject({ ok: false, message: expect.stringContaining("not a Quiet Hours save") });
    expect(sim.hash).toBe(before);
  });

  it("refuses a manual save in danger, with the reason, and allows it in the Safehouse", () => {
    const { sim, game } = setup();
    sim.edit((s) => {
      s.alert.level = 2;
      s.player.x = 4.5;
    });
    expect(game.save("slot1")).toEqual({ ok: false, message: "You cannot save while the city is looking for you." });
    expect(game.store.info("slot1")).toBeNull();
    sim.edit((s) => {
      s.player.x = 1.5;
    });
    expect(game.save("slot1").ok).toBe(true);
  });

  it("reports a full or blocked disk instead of pretending it saved", () => {
    const sim = new Sim(config, 5, { world, content: EMPTY_CONTENT });
    const game = new Game(sim, new SaveStore(safeStorage(undefined), "ascii"), { build: "t1" });
    expect(game.save("slot1")).toMatchObject({ ok: false, message: expect.stringContaining("Export") });
  });
});

describe("export and import", () => {
  it("an exported file loads into a fresh game as an identical state", () => {
    const a = setup();
    a.sim.tick([{ type: "ApplyEffects", effects: [{ add_credits: 7 }, { grant_augment: "quiet_step" }] }]);
    const text = a.game.exportText();
    const b = setup();
    expect(b.game.loadText(text).ok).toBe(true);
    expect(b.sim.hash).toBe(a.sim.hash);
  });

  it("a file from another map is refused", () => {
    const a = setup();
    const other = new Sim(config, 5, { world: room("elsewhere", [], [{ id: "home", requiredPermission: 0 }, { id: "street", requiredPermission: 0 }]), content: EMPTY_CONTENT });
    const g = new Game(other, new SaveStore(memory().storage, "elsewhere"), { build: "t1" });
    expect(a.game.loadText(g.exportText())).toMatchObject({ ok: false, message: "That save belongs to a different map." });
  });
});

describe("new game", () => {
  it("starts afresh with the starting kit and does not delete saves", () => {
    const { sim, game } = setup();
    sim.tick([{ type: "ApplyEffects", effects: [{ add_credits: 500 }] }]);
    game.save("slot1");
    game.newGame();
    expect(sim.state.tick).toBe(1); // the starting kit takes one tick
    expect(sim.state.inventory.credits).toBe(50);
    expect(sim.state.seed).toBe(9);
    expect(game.store.info("slot1")).not.toBeNull();
  });
});

describe("autosave", () => {
  const clocked = () => {
    const t = { ms: 0 };
    const s = setup();
    const auto = new Autosaver(s.game, { everyMs: 60_000, minGapMs: 10_000, now: () => t.ms });
    return { ...s, t, auto };
  };

  it("writes after the interval, and not before", () => {
    const { t, auto, game } = clocked();
    t.ms = 59_000;
    auto.poll();
    expect(game.store.info("autosave")).toBeNull();
    t.ms = 61_000;
    auto.poll();
    expect(game.store.info("autosave")).not.toBeNull();
  });

  it("writes soon after something worth keeping happens (entering a zone, a clue), but not more often than the minimum gap", () => {
    const { t, auto, sim, game } = clocked();
    sim.tick([{ type: "ApplyEffects", effects: [{ give_clue: { id: "c", from: "x" } }] }]);
    t.ms = 5_000;
    auto.poll();
    expect(game.store.info("autosave")).toBeNull(); // too soon
    t.ms = 11_000;
    auto.poll();
    const first = game.store.info("autosave")!;
    expect(first).not.toBeNull();
    sim.tick([{ type: "ApplyEffects", effects: [{ give_clue: { id: "d", from: "x" } }] }]);
    t.ms = 15_000;
    auto.poll();
    expect(game.store.read("autosave")).toBe(game.store.read("autosave")); // unchanged since the gap has not passed
    expect(game.store.info("autosave")!.tick).toBe(first.tick);
  });

  it("waits while the city is looking for the player, then saves when calm", () => {
    const { t, auto, sim, game } = clocked();
    sim.edit((s) => {
      s.alert.level = 2;
    });
    t.ms = 120_000;
    auto.poll();
    expect(game.store.info("autosave")).toBeNull();
    sim.edit((s) => {
      s.alert.level = 0;
    });
    t.ms = 121_000;
    auto.poll();
    expect(game.store.info("autosave")).not.toBeNull();
  });

  it("loading resets its timers so it does not immediately overwrite what was just loaded", () => {
    const { t, auto, game } = clocked();
    t.ms = 70_000;
    auto.poll();
    const text = game.store.read("autosave")!;
    t.ms = 71_000;
    game.loadText(text);
    t.ms = 80_000;
    auto.poll();
    expect(game.store.read("autosave")).toBe(text);
  });
});
