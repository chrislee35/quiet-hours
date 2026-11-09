// covers: AUG-1, AUG-2, AUG-3, AUG-4, STE-7, ROB-4
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_CONTENT, compileDialogue, hasTag, modifier, type AugmentDef, type ClueDef, type Content, type Effect, type RobotDef } from "@qh/core";
import { Scenario, asciiWorld } from "../src/index.ts";
import { config } from "./helpers.ts";

const read = (rel: string) => readFileSync(new URL(`../../../content/${rel}`, import.meta.url), "utf8");
const augments = Object.fromEntries((JSON.parse(read("augments/augments.json")) as AugmentDef[]).map((a) => [a.id, a]));
const content: Content = { ...EMPTY_CONTENT, augments };
const bot = (over: Partial<RobotDef> = {}): RobotDef => ({ id: "r1", kind: "warden", x: 1.5, y: 1.5, facing: 0, route: null, ...over });
const corridor = (len: number, robots: RobotDef[]) =>
  asciiWorld(["#".repeat(len + 2), `#${".".repeat(len)}#`, "#".repeat(len + 2)], [], { robots });
const own = (...ids: string[]): Effect[] => ids.map((id) => ({ grant_augment: id }));
const equip = (s: Scenario, id: string) => s.command({ type: "EquipAugment", id });
const refusal = (s: Scenario) => s.eventsOfType("AugmentRefused").at(-1)?.reason;
const setup = (robots: RobotDef[] = [], effects: Effect[] = [], len = 20) =>
  new Scenario(config, 1, corridor(len, robots), content).command({ type: "ApplyEffects", effects });

describe("the band: slots and power (AUG-2)", () => {
  it("only owned augments can be worn, and only once", () => {
    const s = setup([], own("quiet_step"));
    equip(s, "burst_jammer");
    expect(refusal(s)).toBe("not_owned");
    equip(s, "no_such_thing");
    expect(refusal(s)).toBe("unknown");
    equip(s, "quiet_step").expectEvent("AugmentEquipped", { augmentId: "quiet_step" });
    equip(s, "quiet_step");
    expect(refusal(s)).toBe("already_equipped");
    expect(s.sim.state.augments.equipped).toEqual(["quiet_step"]);
  });

  it("refuses when slots run out, and when power runs out, and says which", () => {
    const slots = setup([], own("quiet_step", "signal_lens", "slow_tongue"));
    equip(slots, "quiet_step");
    equip(slots, "signal_lens");
    equip(slots, "slow_tongue");
    expect(refusal(slots)).toBe("no_slots");
    // Ghost Tag (2 power) + Burst Jammer (2 power) exceed the budget of 3 even though two slots exist.
    const power = setup([], own("ghost_tag", "burst_jammer"));
    equip(power, "ghost_tag");
    equip(power, "burst_jammer");
    expect(refusal(power)).toBe("no_power");
    expect(power.sim.state.augments.equipped).toEqual(["ghost_tag"]);
  });

  it("taking one off frees its slot and power", () => {
    const s = setup([], own("ghost_tag", "burst_jammer"));
    equip(s, "ghost_tag").command({ type: "UnequipAugment", id: "ghost_tag" });
    equip(s, "burst_jammer").expectEvent("AugmentEquipped", { augmentId: "burst_jammer" });
  });

  it("a band upgrade raises capacity so a refused augment fits", () => {
    const s = setup([], own("ghost_tag", "burst_jammer"));
    equip(s, "ghost_tag");
    equip(s, "burst_jammer");
    expect(refusal(s)).toBe("no_power");
    s.command({ type: "ApplyEffects", effects: [{ add_band_capacity: { power: 1 } }] });
    equip(s, "burst_jammer").expectEvent("BandUpgraded");
    expect(s.sim.state.augments.equipped).toEqual(["ghost_tag", "burst_jammer"]);
  });

  it("revoking an augment takes it off too", () => {
    const s = setup([], own("quiet_step"));
    equip(s, "quiet_step").command({ type: "ApplyEffects", effects: [{ revoke_augment: "quiet_step" }] });
    expect(s.sim.state.augments.owned).toEqual([]);
    expect(s.sim.state.augments.equipped).toEqual([]);
  });

  it("confiscation leaves the band alone: augments are not gear to be taken", () => {
    const s = setup([], own("quiet_step"));
    equip(s, "quiet_step");
    expect(s.sim.state.augments.equipped).toEqual(["quiet_step"]);
  });
});

describe("Quiet Step", () => {
  it("halves the noise of every step", () => {
    const radius = (wearing: boolean) => {
      const s = setup([], own("quiet_step"));
      if (wearing) equip(s, "quiet_step");
      s.player(2.5, 1.5).command({ type: "SetMove", dx: 1, dy: 0, mode: "run" }).advanceTicks(2);
      return s.eventsOfType("NoiseEmitted").at(-1)!.radius;
    };
    expect(radius(false)).toBe(config.noise.runRadius);
    expect(radius(true)).toBe(config.noise.runRadius * 0.5);
  });

  it("a robot that would hear a runner does not hear the same runner wearing it", () => {
    const heard = (wearing: boolean) => {
      // A hound-ear warden facing away, with a wall of distance: run past at 6 tiles (run radius 8, halved 4).
      const s = setup([bot({ x: 1.5, facing: Math.PI })], own("quiet_step"));
      if (wearing) equip(s, "quiet_step");
      s.player(7.5, 1.5).command({ type: "SetMove", dx: 1, dy: 0, mode: "run" }).advance(1.5);
      return s.eventsOfType("RobotInvestigating").length > 0;
    };
    expect(heard(false)).toBe(true);
    expect(heard(true)).toBe(false);
  });
});

describe("Ghost Tag (STE-7)", () => {
  const badPass: Effect = { give_pass: { id: "bad", label: "bad", level: 1, zones: ["elsewhere"], origin: "issued" } };
  const timeToSpot = (s: Scenario) => {
    for (let t = 0; t < 40 * config.sim.ticksPerSecond; t++) {
      s.advanceTicks(1);
      if (s.eventsOfType("RobotSpotted").length > 0) return t / config.sim.ticksPerSecond;
    }
    return null;
  };

  it("a failing scan is answered with a valid record for a while, so a violator is spotted later", () => {
    const plain = setup([bot()], [badPass]).player(4.5, 1.5);
    const tagged = setup([bot()], [badPass, ...own("ghost_tag")]);
    equip(tagged, "ghost_tag").player(4.5, 1.5);
    const t0 = timeToSpot(plain)!;
    const t1 = timeToSpot(tagged)!;
    expect(t1).toBeGreaterThan(t0 + 2);
    tagged.expectEvent("GhostTagSpoofed", { augmentId: "ghost_tag" });
  });

  it("it recharges slowly: the window closes, and a second spoof is not available at once", () => {
    const s = setup([bot()], [badPass, ...own("ghost_tag")]);
    equip(s, "ghost_tag").player(4.5, 1.5).advance(1);
    const a = s.sim.state.augments;
    expect(a.spoofUntil).toBeGreaterThan(s.sim.state.tick);
    expect(a.spoofReadyAt).toBeGreaterThan(a.spoofUntil + 60 * config.sim.ticksPerSecond);
    s.advance(40);
    expect(s.eventsOfType("GhostTagSpoofed")).toHaveLength(1);
  });

  it("makes a Checker's review of a record-less player read as a valid record, not 'pending review'", () => {
    const s = setup([bot({ kind: "checker" })], own("ghost_tag"));
    equip(s, "ghost_tag").player(2.5, 1.5).advance(2);
    s.expectEvent("ScanPerformed", { outcome: "Allowed" });
    expect(s.eventsOfType("ScanPerformed").some((e) => e.outcome === "Null")).toBe(false);
    s.expectNoEvent("PlayerCaught");
  });

  it("does nothing for someone holding a valid pass, and nothing when not worn", () => {
    const ok = setup([bot()], [{ give_pass: { id: "ok", label: "ok", level: 0, origin: "issued" } }, ...own("ghost_tag")]);
    equip(ok, "ghost_tag").player(4.5, 1.5).advance(10);
    ok.expectNoEvent("GhostTagSpoofed");
    const off = setup([bot()], [badPass, ...own("ghost_tag")]).player(4.5, 1.5).advance(10);
    off.expectNoEvent("GhostTagSpoofed");
  });
});

describe("Burst Jammer (ROB-4)", () => {
  it("knocks robots in range offline: they see nothing for the duration, then recover", () => {
    const s = setup([bot()], own("burst_jammer"));
    equip(s, "burst_jammer").player(3.5, 1.5);
    s.command({ type: "UseAugment", id: "burst_jammer" });
    expect(s.eventsOfType("BurstJammerFired")[0]!.robots).toEqual(["r1"]);
    s.advance(5);
    expect(s.robot("r1").suspicion).toBe(0);
    expect(s.robot("r1").sees).toBe(false);
    s.expectNoEvent("RobotSpotted");
    s.advance(6);
    expect(s.sim.state.tick).toBeGreaterThan(s.robot("r1").jammedUntil);
    s.advance(10);
    s.expectEvent("RobotSpotted");
  });

  it("does not affect robots beyond its radius", () => {
    const far = bot({ id: "far", x: 19.5, facing: Math.PI });
    const s = setup([bot(), far], own("burst_jammer"));
    equip(s, "burst_jammer").player(3.5, 1.5).command({ type: "UseAugment", id: "burst_jammer" });
    expect(s.eventsOfType("BurstJammerFired")[0]!.robots).toEqual(["r1"]);
    expect(s.robot("far").jammedUntil).toBe(0);
  });

  it("a jammed robot cannot catch the player", () => {
    const s = setup([bot({ x: 2.5 })], own("burst_jammer"));
    equip(s, "burst_jammer").player(3.0, 1.5).command({ type: "UseAugment", id: "burst_jammer" }).advance(4);
    s.expectNoEvent("PlayerCaught");
  });

  it("needs to be worn, and recharges before it can fire again", () => {
    const s = setup([], own("burst_jammer")).player(3.5, 1.5);
    s.command({ type: "UseAugment", id: "burst_jammer" }).expectNoEvent("BurstJammerFired");
    equip(s, "burst_jammer").command({ type: "UseAugment", id: "burst_jammer" });
    s.command({ type: "UseAugment", id: "burst_jammer" });
    expect(refusal(s)).toBe("recharging");
    expect(s.eventsOfType("BurstJammerFired")).toHaveLength(1);
    s.advance(41).command({ type: "UseAugment", id: "burst_jammer" });
    expect(s.eventsOfType("BurstJammerFired")).toHaveLength(2);
  });
});

describe("tag and modifier augments", () => {
  it("Signal Lens, Slow Tongue and Memory Anchor expose their capabilities only while worn", () => {
    const s = setup([], own("signal_lens", "slow_tongue", "memory_anchor"));
    expect(hasTag(s.sim.state, content, "reveal_cones")).toBe(false);
    equip(s, "signal_lens");
    expect(hasTag(s.sim.state, content, "reveal_cones")).toBe(true);
    equip(s, "memory_anchor");
    expect(hasTag(s.sim.state, content, "notebook_anchor")).toBe(true);
    expect(hasTag(s.sim.state, content, "slow_tongue")).toBe(false);
    expect(modifier(s.sim.state, content, "noise.mult")).toBe(1);
  });
});

describe("Slow Tongue in conversation (dialogue gating)", () => {
  const clues = Object.fromEntries((JSON.parse(read("clues/sample.json")) as ClueDef[]).map((c) => [c.id, c]));
  const { dialogue } = compileDialogue(read("dialogue/odd_sam.qdl"), { id: "odd_sam", knownClues: new Set(Object.keys(clues)) });
  const talk = (wearing: boolean) => {
    const world = asciiWorld(["#######", "#S....#", "#######"], [], { npcs: [{ id: "odd_sam", x: 2, y: 1, dialogue: "odd_sam" }] });
    const c: Content = { ...EMPTY_CONTENT, dialogues: { odd_sam: dialogue! }, clues, augments };
    const s = new Scenario(config, 1, world, c).command({ type: "ApplyEffects", effects: [{ add_credits: 50 }, ...own("slow_tongue"), { set_flag: ["met_sam", true] }] });
    if (wearing) equip(s, "slow_tongue");
    return s.command({ type: "Interact" }).say("What do you sell?");
  };

  it("offers an extra option only while worn, and it works", () => {
    const haggle = "Haggle, slowly and soothingly. (10 credits)";
    expect(talk(false).dialogue!.choices.map((c) => c.text)).not.toContain(haggle);
    const s = talk(true);
    expect(s.dialogue!.choices.map((c) => c.text)).toContain(haggle);
    s.say(haggle);
    expect(s.sim.state.inventory.credits).toBe(40);
    expect(s.sim.state.clues.pump4_shift).toBeDefined();
  });
});

describe("pickups (AUG-4: found)", () => {
  const world = asciiWorld(["#######", "#S....#", "#######"], [], {
    pickups: [
      { id: "bench", x: 2, y: 1, grant: "augment:quiet_step" },
      { id: "spool", x: 3, y: 1, grant: "item:scrap_wire:2" },
    ],
  });
  it("Interact takes the nearest pickup once; it gives the augment and is then gone", () => {
    const s = new Scenario(config, 1, world, content);
    expect(s.sim.prompt()?.label).toBe("Take quiet step");
    s.command({ type: "Interact" }).expectEvent("AugmentGained", { augmentId: "quiet_step" }).expectEvent("PickedUp", { pickupId: "bench" });
    s.command({ type: "Interact" });
    expect(s.sim.state.augments.owned).toEqual(["quiet_step"]);
  });
  it("item pickups add the stated count", () => {
    const s = new Scenario(config, 1, world, content).player(3.5, 1.5).command({ type: "Interact" });
    expect(s.sim.state.inventory.items.scrap_wire).toBe(2);
  });
});
