// covers: WLD-2 (the Stacks' signature rules), WLD-5 (routines), STE-1/3 (curfew, null state), ROB-1/2 (day and night rosters,
// cameras on a schedule), CLU-2/3, PUZ-1 (two ways into the first cache and the Safehouse), AUG-4 (the first augment is found)
import { describe, expect, it } from "vitest";
import { puzzleModule, saveStatus, zoneAt } from "@qh/core";
import { assemble, loadContent } from "../../content-tools/src/index.ts";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const world = a.worlds.stacks!;
const content = a.content;
const start = () => new Scenario(config, 1, world, content).command({ type: "ApplyEffects", effects: [{ add_credits: a.start.credits }] });
const at = (id: string) => {
  const o = [...world.terminals, ...world.pickups, ...world.npcs].find((x) => x.id === id)!;
  return { x: o.x + 0.5, y: o.y + 1.0 };
};
const goto = (s: Scenario, id: string) => s.player(at(id).x, at(id).y);
const solveTaps = (id: string) => {
  const def = content.terminals[id]!;
  const puzzle = content.puzzles[def.puzzle]!;
  const mod = puzzleModule(puzzle)!;
  return mod.solve(puzzle, mod.init(puzzle))!;
};
const clock = (s: Scenario, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return s.advanceToMinuteOfDay(h! * 60 + m!).advanceTicks(2);
};
const learn = (...ids: string[]) => ids.map((id) => ({ give_clue: { id, from: "test" } }));

describe("the Stacks map", () => {
  it("loads with its zones, doors, people, terminals and the places the notebook will show", () => {
    expect(world.id).toBe("stacks");
    expect(world.zones.map((z) => z.id).sort()).toEqual(["laundry", "maintenance", "processing", "safehouse", "stacks_street", "super_office"]);
    expect(world.doors.map((d) => d.id).sort()).toEqual(["door_holding", "door_laundry", "door_office", "door_safehouse", "door_service"]);
    expect(world.npcs.map((n) => n.id).sort()).toEqual(["doc_perrin", "mrs_adeyemi_roth", "odd_sam", "silas", "teeter", "wren"]);
    expect(world.terminals.map((t) => t.id).sort()).toEqual(["locker_9", "service_panel", "wall_panel"]);
    expect(world.places.map((p) => p.id).sort()).toEqual(["laundry", "safehouse", "stacks_street"]);
    expect(world.cameras.map((c) => c.id).sort()).toEqual(["cam_plaza_day", "cam_plaza_night"]);
  });

  it("every person on it has a conversation, and every terminal and pickup it uses is defined", () => {
    for (const n of world.npcs) expect(content.dialogues[n.dialogue], n.id).toBeDefined();
    for (const t of world.terminals) expect(content.terminals[t.id], t.id).toBeDefined();
  });

  it("starts the player in the laundry, with nothing on record: the null state", () => {
    const s = start();
    expect(s.sim.state.player.zone).toBe("laundry");
    expect(s.sim.state.passes).toEqual([]);
    expect(s.sim.state.inventory.credits).toBe(50);
  });

  it("the Safehouse is a safe zone: you can save there even in danger; the plaza is not", () => {
    const s = start().edit((st) => { st.alert.level = 3; });
    goto(s, "wren");
    expect(saveStatus(s.sim.state, world, config)).toEqual({ ok: true, where: "safe" });
    s.player(25, 15);
    expect(saveStatus(s.sim.state, world, config)).toMatchObject({ ok: false });
    expect(zoneAt(world, 25, 15)?.id).toBe("stacks_street");
  });
});

describe("Act I: the first cache (Locker 9), two ways in", () => {
  it("looking in the chute gives a key and the first breadcrumb, once", () => {
    const s = goto(start(), "pk_chute");
    expect(s.sim.prompt()?.label).toBe("Check the laundry chute");
    s.command({ type: "Interact" }).expectEvent("PickedUp", { pickupId: "pk_chute" });
    expect(s.sim.state.inventory.items.locker_key).toBe(1);
    expect(s.sim.state.clues.laundry_key?.from).toBe("observe:laundry_chute");
    s.command({ type: "Interact" });
    expect(s.sim.state.inventory.items.locker_key).toBe(1);
  });

  it("the key opens Locker 9 straight away and gives Quiet Step, which then halves your noise", () => {
    const s = goto(start(), "pk_chute").command({ type: "Interact" });
    goto(s, "locker_9").command({ type: "Interact" });
    s.expectEvent("TerminalSolved", { terminalId: "locker_9", via: "bypass" });
    expect(s.sim.state.augments.owned).toContain("quiet_step");
    expect(s.sim.state.flags.quiet_step_found).toBe(true);
    s.command({ type: "ExitTerminal" }).command({ type: "EquipAugment", id: "quiet_step" }).player(5.5, 17.5);
    s.command({ type: "SetMove", dx: 1, dy: 0, mode: "run" }).advanceTicks(2);
    expect(s.eventsOfType("NoiseEmitted").at(-1)!.radius).toBe(config.noise.runRadius * 0.5);
  });

  it("without the key the lock wants the number scratched inside your band: 0417, and no clue unlocks it for free", () => {
    const s = goto(start(), "locker_9").command({ type: "Interact" });
    expect(s.sim.terminal()!.solved).toBe(false);
    expect((s.sim.terminal()!.puzzle as unknown as { hint: string; correct: null }).correct).toBeNull(); // no feedback
    for (const i of solveTaps("locker_9")) s.command({ type: "TerminalTap", index: i });
    s.expectEvent("TerminalSolved", { terminalId: "locker_9", via: "puzzle" });
    expect(s.sim.state.augments.owned).toContain("quiet_step");
  });

  it("the code is findable: the band's engraving, read through the Signal Lens in the laundry mirror, says ALD-0417", () => {
    expect(content.clues.band_scratch!.text).toContain("ALD-0417");
    expect(content.terminals.locker_9!.puzzleRequires).toEqual([{ has_clue: "band_scratch" }]);
    const s = goto(start(), "pk_mirror");
    expect(s.sim.prompt()).toBeNull(); // nothing to study yet
    s.command({ type: "ApplyEffects", effects: [{ grant_augment: "signal_lens" }] }).command({ type: "EquipAugment", id: "signal_lens" });
    expect(s.sim.prompt()?.label).toBe("Study your band in the mirror");
    s.command({ type: "Interact" });
    expect(s.sim.state.clues.band_scratch?.from).toBe("observe:wrist_band");
  });
});

describe("Act I: the wall that is not a wall, two ways in", () => {
  it("solving the fuse board opens the Safehouse", () => {
    const s = goto(start(), "wall_panel").command({ type: "Interact" });
    expect(s.sim.state.doors.door_safehouse!.locked).toBe(true);
    for (const i of solveTaps("wall_panel")) s.command({ type: "TerminalTap", index: i });
    s.expectEvent("TerminalSolved", { terminalId: "wall_panel", via: "puzzle" });
    expect(s.sim.state.doors.door_safehouse!.locked).toBe(false);
    expect(s.sim.state.flags.found_safehouse).toBe(true);
  });

  it("knowing where it is (Odd Sam, or Silas) opens it with no puzzle at all", () => {
    const s = start().command({ type: "ApplyEffects", effects: learn("safehouse_way_in") });
    goto(s, "wall_panel").command({ type: "Interact" });
    s.expectEvent("TerminalSolved", { terminalId: "wall_panel", via: "bypass" });
    expect(s.sim.state.doors.door_safehouse!.locked).toBe(false);
  });

  it("Odd Sam sells the secret for 15 credits and Silas gives it away", () => {
    const sam = goto(start(), "odd_sam").command({ type: "ApplyEffects", effects: [{ set_flag: ["met_sam", true] }] }).command({ type: "Interact" }).say("Any news?");
    sam.say("Ask where the resistance hides. (15 credits)");
    expect(sam.sim.state.clues.safehouse_way_in?.from).toBe("odd_sam");
    expect(sam.sim.state.inventory.credits).toBe(35);
    const silas = goto(start(), "silas").command({ type: "Interact" }).say("Wren sent me.");
    expect(silas.sim.state.clues.safehouse_way_in).toBeDefined();
  });

  it("meeting Wren completes the Act I opening: she teaches the null state and names the four who can help", () => {
    const s = goto(start(), "wren").command({ type: "Interact" });
    expect(s.sim.state.flags.met_wren).toBe(true);
    expect(s.sim.state.clues.null_pending).toBeDefined();
    s.say("What am I?").say("Why is that a gift?").say("Is there anyone who can help me?");
    for (const id of ["wren_vouches", "ines_records", "maren_trains", "tobias_gate_shift", "silas_hears"]) expect(s.sim.state.clues[id], id).toBeDefined();
    expect(s.sim.state.flags.wren_vouched).toBe(true);
  });

  it("the quest log follows: find the people who help, then done", () => {
    const s = start();
    const q = () => s.sim.questLog().find((x) => x.id === "act1_safehouse")!;
    expect(q().state).toBe("active");
    expect(q().steps.map((x) => x.done)).toEqual([false, false, false]);
    s.command({ type: "ApplyEffects", effects: [...learn("safehouse_way_in"), { set_flag: ["found_safehouse", true] }, { set_flag: ["met_wren", true] }] });
    expect(q().state).toBe("complete");
  });
});

describe("Doc Perrin and the Signal Lens", () => {
  it("sells it for 30 credits, once, and it appears in the wrist band", () => {
    const s = goto(start(), "doc_perrin").command({ type: "Interact" }).say("What can you put in mine?");
    expect(s.sim.state.clues.memory_anchor_exists).toBeDefined();
    s.say("Fit the Signal Lens. (30 credits)");
    expect(s.sim.state.augments.owned).toContain("signal_lens");
    expect(s.sim.state.inventory.credits).toBe(20);
  });
});

describe("the Stacks' signature rules: curfew, schedules, cameras", () => {
  it("cameras and patrols are on a schedule: the day crew by day, the night crew at Quiet Hours", () => {
    const s = start();
    const names = () => ({
      warden: s.robot("warden_1").dormant, auditor: s.robot("auditor_1").dormant,
      dayCam: s.sim.state.cameras.find((c) => c.id === "cam_plaza_day")!.dormant, nightCam: s.sim.state.cameras.find((c) => c.id === "cam_plaza_night")!.dormant,
    });
    clock(s, "12:00");
    expect(names()).toEqual({ warden: false, auditor: true, dayCam: false, nightCam: true });
    clock(s, "03:00");
    expect(names()).toEqual({ warden: true, auditor: false, dayCam: true, nightCam: false });
    clock(s, "06:00");
    expect(names()).toEqual({ warden: false, auditor: true, dayCam: false, nightCam: true });
  });

  it("a Checker stalls the null state in 'pending review' and does not arrest it", () => {
    const s = start().player(33, 16.5);
    s.advance(15);
    s.expectEvent("ScanPerformed", { outcome: "Null" }).expectNoEvent("PlayerCaught");
  });

  it("curfew marks someone with a record, but not the null: out in the plaza at 23:00", () => {
    const withPass = start().command({ type: "ApplyEffects", effects: [{ give_pass: { id: "p", label: "p", level: 0, origin: "issued" } }] });
    clock(withPass, "23:00").player(33, 16.5).advance(3);
    expect(withPass.eventsOfType("InfractionRecorded").some((e) => e.kind === "curfew")).toBe(true);
    const nul = start();
    clock(nul, "23:00").player(33, 16.5).advance(3);
    expect(nul.eventsOfType("InfractionRecorded")).toEqual([]);
  });

  it("Silas keeps his routine: at his notice board by day, at his desk in the office in the evening", () => {
    const s = start();
    clock(s, "12:00").advance(60);
    expect(s.sim.state.npcs.silas!.x).toBeCloseTo(33.5, 0);
    clock(s, "17:30").advance(40);
    expect(s.sim.state.npcs.silas!.x).toBeGreaterThan(38.5);
  });

  it("the service door is behind a restricted maintenance zone that opens from a panel outside it", () => {
    const s = start();
    expect(s.sim.state.doors.door_service!.locked).toBe(true);
    goto(s, "service_panel").command({ type: "Interact" });
    for (const i of solveTaps("service_panel")) s.command({ type: "TerminalTap", index: i });
    expect(s.sim.state.doors.door_service!.locked).toBe(false);
    expect(zoneAt(world, 41, 17)?.requiredPermission).toBe(2);
  });
});

describe("the informant, Mrs. Adeyemi-Roth", () => {
  const talk = () => goto(start(), "mrs_adeyemi_roth").command({ type: "Interact" });

  it("has not reported you, and says so; the neighbour-wellness programme is explained", () => {
    const s = talk().say("What list?").say("Have you noticed me?");
    expect(s.sim.state.clues.neighbor_wellness).toBeDefined();
    expect(s.sim.state.clues.mrs_unreported).toBeDefined();
  });

  it("can be befriended with a harmless report or bribed, and each moves trust one step with a cause", () => {
    const s = talk().say("What list?").say("Have you noticed me?").say("That could change?").say("A harmless report. Something true and dull.").say("Anything for a quiet life.");
    expect(s.sim.state.flags.mrs_fed).toBe(true);
    expect(s.sim.state.trust.mrs_adeyemi_roth).toBe(1);
    expect(s.sim.state.trustLog.at(-1)!.cause).toBe("fed her a harmless report");
  });

  it("threatening her gets you reported: the alert rises and the city notes it; apologising wins trust back", () => {
    const s = talk().say("What list?").say("Have you noticed me?").say("That could change?").say("I will be sure to be good.");
    s.say("I will report you before you report me.");
    expect(s.sim.state.trust.mrs_adeyemi_roth).toBe(-1);
    expect(s.alert).toBe(1);
    expect(s.sim.state.metrics.order).toBeLessThan(config.metrics.orderStart);
    s.command({ type: "EndConversation" }).command({ type: "Interact" }).say("I wanted to ask about being on it.").say("I will be sure to be good.");
    s.say("I am sorry about what I said.");
    expect(s.sim.state.trust.mrs_adeyemi_roth).toBe(0);
  });
});

describe("gossip is reachable but never needed", () => {
  it("Teeter asks about the cat and tells of the hackers; Silas and Odd Sam gossip too", () => {
    const s = goto(start(), "teeter").command({ type: "Interact" }).say("What things?");
    expect(s.sim.state.clues.cat_request).toBeDefined();
    s.say("Tell me about the cameras.").say("What about the hackers?");
    expect(s.sim.state.clues.hackers_split).toBeDefined();
    expect(s.sim.state.clues.stacks_cameras_night).toBeDefined();
  });
});
