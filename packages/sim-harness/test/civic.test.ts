// covers: WLD-2 (Civic Core: ID scanners, queues, forms and permits), ECO-4 (rules that interact), ECO-3 (null state refused),
// STE-1 (checkers' schedule), PUZ-1 (two ways through SQ-01), CLU-4 (contradicting rules), FAIL-5, travel between maps
import { describe, expect, it } from "vitest";
import { createSave, loadSave, stringifySave, zoneAt } from "@qh/core";
import { assemble, loadContent } from "../../content-tools/src/index.ts";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const content = a.content;
const civic = a.worlds.civic_core!;
const stacks = a.worlds.stacks!;
const game = (map = "civic_core") => new Scenario(config, 1, a.worlds, content, map).command({ type: "ApplyEffects", effects: [{ add_credits: 50 }] });
/** Waits for a time of day somewhere the patrols will not find you (the staff strip behind the counters). */
const hour = (s: Scenario, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  s.player(44.5, 14.5);
  return s.advanceToMinuteOfDay(h! * 60 + m!).advanceTicks(2);
};
const near = (s: Scenario, id: string) => {
  const o = [...civic.npcs, ...civic.pickups].find((x) => x.id === id)!;
  return s.player(o.x + 0.5, o.y + 1.0);
};
const record = { give_pass: { id: "p", label: "p", level: 0, origin: "issued" as const } };
const has = (s: Scenario, id: string) => s.sim.state.inventory.items[id] ?? 0;
const use = (s: Scenario, id: string) => s.command({ type: "ApplyEffects", effects: [{ use_service: id }] });
const refusal = (s: Scenario) => s.eventsOfType("ServiceRefused").at(-1);
const give = (...items: string[]) => items.map((i) => ({ add_item: [i, 1] as [string, number] }));

describe("travel between maps", () => {
  it("a ticket is a service: the null state is refused at the tram with its own line, and stays put", () => {
    const s = game("stacks").player(28.5, 20.5);
    expect(s.sim.prompt()?.label).toBe("Tram to the Civic Core (5 credits)");
    s.command({ type: "Interact" });
    expect(refusal(s)).toMatchObject({ serviceId: "transit_fare", reason: "null_state" });
    expect(s.sim.state.map).toBe("stacks");
    s.expectNoEvent("MapChanged");
  });

  it("with a record and five credits the tram takes you to the Civic Core's arrival, and charges the fare", () => {
    const s = game("stacks").command({ type: "ApplyEffects", effects: [record] }).player(28.5, 20.5).command({ type: "Interact" });
    s.expectEvent("MapChanged", { from: "stacks", to: "civic_core" });
    expect(s.sim.state.map).toBe("civic_core");
    expect(s.sim.state.inventory.credits).toBe(45);
    expect(s.sim.world.id).toBe("civic_core");
    expect(s.sim.state.player.zone).toBe("civic_plaza");
    expect(s.sim.state.visited).toContain("civic_plaza");
  });

  it("the service tunnel needs no ticket, only getting into the maintenance wing; it arrives behind the counters", () => {
    const s = game("stacks").command({ type: "ApplyEffects", effects: [{ unlock_door: "door_service" }] }).player(41.5, 20.0).command({ type: "Interact" });
    expect(s.sim.state.map).toBe("civic_core");
    expect(zoneAt(civic, Math.floor(s.sim.state.player.x), Math.floor(s.sim.state.player.y))?.id).toBe("back_office");
  });

  it("what you changed is still changed when you come back: doors, people, what you picked up", () => {
    const s = game("stacks").command({ type: "ApplyEffects", effects: [record, { unlock_door: "door_safehouse" }] });
    s.player(4.5, 14.0).command({ type: "Interact" }); // the chute
    s.player(28.5, 20.5).command({ type: "Interact" }); // tram to the Civic Core
    expect(s.sim.state.map).toBe("civic_core");
    expect(s.sim.state.mapStates.stacks!.doors.door_safehouse!.locked).toBe(false);
    s.command({ type: "ApplyEffects", effects: [{ add_credits: 10 }] });
    s.player(3.5, 23.5).command({ type: "Interact" }); // tram home
    expect(s.sim.state.map).toBe("stacks");
    expect(s.sim.state.doors.door_safehouse!.locked).toBe(false);
    expect(s.sim.state.flags.picked_pk_chute).toBe(true);
    expect(s.sim.state.mapStates.civic_core).toBeDefined();
    expect(s.sim.state.mapStates.stacks).toBeUndefined(); // the map you are on is not also "left"
  });

  it("a conversation or terminal never follows you across a map", () => {
    const s = game("stacks").command({ type: "ApplyEffects", effects: [record] }).player(28.5, 20.5).command({ type: "Interact" });
    expect(s.sim.state.conversation).toBeNull();
    expect(s.sim.state.terminal).toBeNull();
    expect(s.sim.state.player.intent).toEqual({ dx: 0, dy: 0, mode: "walk" });
  });

  it("saves span maps: a game saved in the Civic Core loads back there, with the Stacks as it was left", () => {
    const s = game("stacks").command({ type: "ApplyEffects", effects: [record, { unlock_door: "door_safehouse" }] }).player(28.5, 20.5).command({ type: "Interact" });
    const text = stringifySave(createSave(s.sim.state, s.sim.state.map, { build: "t", label: "t", savedAt: "x" }));
    const back = loadSave(text, config, a.worlds);
    expect(back.map).toBe("civic_core");
    expect(back.state.mapStates.stacks!.doors.door_safehouse!.locked).toBe(false);
    expect(() => loadSave(text, config, { stacks })).toThrow(/does not have/);
  });

  it("the Civic Core's exits lead somewhere real: every exit's map and spawn exist", () => {
    for (const w of Object.values(a.worlds)) for (const e of w.exits) {
      expect(a.worlds[e.to], e.id).toBeDefined();
      expect(a.worlds[e.to]!.spawns.some((sp) => sp.id === e.spawn), e.id).toBe(true);
    }
  });
});

describe("the Civic Core map", () => {
  it("has its zones, windows, people and notices", () => {
    expect(civic.zones.map((z) => z.id).sort()).toEqual(["back_office", "civic_plaza", "permit_hall"]);
    expect(civic.npcs.map((n) => n.id).sort()).toEqual(["dov_anselm", "ticket", "window_1", "window_4"]);
    expect(civic.exits.map((e) => e.id).sort()).toEqual(["tram_to_stacks", "tunnel_to_stacks"]);
    expect(civic.pickups.filter((p) => p.grant.startsWith("clue:")).map((p) => p.id).sort()).toEqual(["pk_form12b", "pk_form12bi", "pk_levels", "pk_rule4", "pk_rule9", "pk_shifts"]);
  });

  it("reading the notices is how you learn the rules: Rule 4 and Rule 9, which contradict each other", () => {
    const s = game();
    near(s, "pk_rule4").command({ type: "Interact" });
    near(s, "pk_rule9").command({ type: "Interact" });
    expect(s.sim.state.clues.permit_rule_4?.from).toBe("observe:permit_rules");
    expect(s.sim.state.clues.permit_rule_9).toBeDefined();
    expect(s.sim.conflicts()).toEqual([{ a: "permit_rule_4", b: "permit_rule_9", resolved: false }]);
  });

  it("checkers step away for ten minutes at 12:00 and 18:00, and are on watch at every other time", () => {
    const s = game();
    const watching = () => !s.robot("checker_1").dormant && !s.robot("checker_2").dormant;
    hour(s, "09:00");
    expect(watching()).toBe(true);
    hour(s, "12:05");
    expect([s.robot("checker_1").dormant, s.robot("checker_2").dormant]).toEqual([true, true]);
    hour(s, "12:15");
    expect(watching()).toBe(true);
    hour(s, "18:05");
    expect(s.robot("checker_1").dormant).toBe(true);
    hour(s, "18:15");
    expect(watching()).toBe(true);
  });

  it("a warden patrols the plaza by day and an auditor takes the hall at night", () => {
    const s = game();
    hour(s, "12:00");
    expect([s.robot("warden_c").dormant, s.robot("auditor_c").dormant]).toEqual([false, true]);
    hour(s, "03:00");
    expect([s.robot("warden_c").dormant, s.robot("auditor_c").dormant]).toEqual([true, false]);
  });

  it("a checker stalls the null state at the Permit Hall door in 'pending review'", () => {
    const s = game().player(19.5, 18.5);
    hour(s, "09:00").player(19.5, 18.5).advance(12);
    s.expectEvent("ScanPerformed", { outcome: "Null" }).expectNoEvent("PlayerCaught");
  });
});

describe("the queue, the hours and the forms (ECO-4)", () => {
  it("Ticket hands out one number at a time, and tells you the secret: tell him you have already been served", () => {
    const s = near(game(), "ticket").command({ type: "Interact" }).say("Take a number.");
    expect(has(s, "queue_number")).toBe(1);
    s.say("How long is the wait?");
    expect(s.sim.state.clues.ticket_served).toBeDefined();
    expect(s.dialogue!.choices.map((c) => c.text)).not.toContain("Take a number."); // you already hold one
    s.say("I have already been served.");
    expect(has(s, "priority_number")).toBe(1);
  });

  it("Window 1 needs a number, a record and the hours, and each refusal says which", () => {
    const s = game().command({ type: "ApplyEffects", effects: [record] });
    hour(s, "09:00");
    use(s, "file_12b");
    expect(refusal(s)).toMatchObject({ reason: "requirements", text: expect.stringContaining("08:00 to 17:00") });
    s.command({ type: "ApplyEffects", effects: give("queue_number") });
    hour(s, "20:00");
    use(s, "file_12b");
    expect(refusal(s)!.reason).toBe("requirements"); // closed at night
    hour(s, "10:00");
    use(s, "file_12b").expectEvent("ServiceUsed", { serviceId: "file_12b" });
    expect(has(s, "form_12b")).toBe(1);
    expect(has(s, "queue_number")).toBe(0);
    expect(s.sim.state.inventory.credits).toBe(48);
  });

  it("the null state is refused at every window with PENDING REVIEW: nobody off the record may file for anything", () => {
    const s = game().command({ type: "ApplyEffects", effects: give("queue_number", "form_12b") });
    hour(s, "10:00");
    for (const id of ["file_12b", "file_12bi", "stamp_protest", "permit_level_2"]) {
      use(s, id);
      expect(refusal(s), id).toMatchObject({ reason: "null_state", text: expect.stringContaining("PENDING REVIEW") });
    }
  });

  it("the already-served slip gets you served outside opening hours, once", () => {
    const s = game().command({ type: "ApplyEffects", effects: [record, ...give("queue_number", "priority_number")] });
    hour(s, "22:00");
    use(s, "file_12b").expectEvent("ServiceUsed");
    expect(has(s, "priority_number")).toBe(0);
  });

  it("the appeal only counts if you hold a Form 12-B, and only in Window 4's hours (09:00-12:00, 13:00-16:00)", () => {
    const s = game().command({ type: "ApplyEffects", effects: [record, ...give("queue_number")] });
    hour(s, "10:00");
    use(s, "file_12bi");
    expect(refusal(s)!.reason).toBe("requirements"); // no form to appeal
    s.command({ type: "ApplyEffects", effects: give("form_12b") });
    hour(s, "12:30");
    use(s, "file_12bi");
    expect(refusal(s)!.reason).toBe("requirements"); // the clerks are at lunch
    hour(s, "13:30");
    use(s, "file_12bi").expectEvent("ServiceUsed");
    expect(has(s, "form_12bi_receipt")).toBe(1);
  });

  it("Window 7 will not stamp without the appeal: it quotes Rule 9 and Rule 4 back at you", () => {
    const s = game().command({ type: "ApplyEffects", effects: [record, ...give("queue_number", "form_12b")] });
    hour(s, "11:00");
    use(s, "stamp_protest");
    expect(refusal(s)!.text).toContain("Rule 9");
    expect(refusal(s)!.text).toContain("Rule 4");
    expect(s.sim.state.flags.sq_01_done).toBeUndefined();
  });
});

describe("SQ-01 Lost in Processing: two ways through (PUZ-1)", () => {
  it("the paperwork route, in the right order, with a record: Window 1, Window 4, Window 7", () => {
    const s = game().command({ type: "ApplyEffects", effects: [record] });
    const number = () => s.command({ type: "ApplyEffects", effects: give("queue_number") });
    hour(s, "09:30");
    number();
    use(s, "file_12b");
    hour(s, "10:30");
    number();
    use(s, "file_12bi");
    number();
    use(s, "stamp_protest").expectEvent("ServiceUsed", { serviceId: "stamp_protest" });
    expect(s.sim.state.flags.sq_01_done).toBe(true);
    expect(has(s, "permit_stamp")).toBe(1);
    expect([has(s, "form_12b"), has(s, "form_12bi_receipt")]).toEqual([0, 0]);
    expect(s.sim.state.clues.dov_sister_lull).toBeDefined(); // the Lull link
  });

  it("the social route, for someone with no record at all: show Dov where the rules disagree and he stamps it anyway", () => {
    const s = near(game(), "pk_rule4").command({ type: "Interact" });
    near(s, "pk_rule9").command({ type: "Interact" });
    near(s, "dov_anselm").command({ type: "Interact" }).say("You look tired.").say("I will see what I can do.");
    expect(s.dialogue!.choices.map((c) => c.text)).not.toContain("Would you stamp my form under protest, anyway?"); // not yet
    s.say("Show him the rules.");
    s.command({ type: "Present", clueId: "permit_rule_4" });
    expect(s.sim.state.trust.dov_anselm).toBe(1);
    expect(s.sim.state.trustLog.at(-1)!.cause).toBe("saw the rules disagree");
    expect(s.sim.state.clues.window_7_protest).toBeDefined();
    s.say("So will you help?").say("Would you stamp my form under protest, anyway?");
    expect(s.sim.state.flags.sq_01_done).toBe(true);
    expect(has(s, "permit_stamp")).toBe(1);
    expect(s.sim.state.passes).toEqual([]); // still no record: the stamp is just a stamp
  });

  it("showing him only one rule, or something else, does not convince him", () => {
    const s = near(game(), "pk_rule4").command({ type: "Interact" });
    near(s, "dov_anselm").command({ type: "Interact" }).say("You look tired.").say("I will see what I can do.").say("Show him the rules.");
    s.command({ type: "Present", clueId: "permit_rule_4" });
    expect(s.sim.state.trust.dov_anselm).toBeUndefined();
    expect(s.dialogue!.lines.at(-1)!.text).toContain("not what is wrong with my window");
  });

  it("the stamp turns into a level 1 permit, which puts a person on a list (the end of the null state), and level 2 costs more", () => {
    const s = game().command({ type: "ApplyEffects", effects: give("permit_stamp") });
    hour(s, "11:00");
    use(s, "permit_level_1").expectEvent("PassGained", { passId: "civic_permit_1" });
    expect(s.sim.state.passes.map((p) => p.id)).toEqual(["civic_permit_1"]);
    expect(has(s, "permit_stamp")).toBe(0);
    use(s, "permit_level_2");
    expect(s.sim.state.passes.map((p) => p.id)).toContain("civic_permit_2");
    expect(s.sim.state.inventory.credits).toBe(10);
  });

  it("explains itself in the notebook: the quest log tracks it step by step", () => {
    const s = game();
    const q = () => s.sim.questLog().find((x) => x.id === "lost_in_processing");
    expect(q()).toBeUndefined();
    near(s, "dov_anselm").command({ type: "Interact" }).say("You look tired.");
    expect(q()!.state).toBe("active");
    expect(q()!.steps.map((x) => x.done)).toEqual([false, false, false]);
    s.command({ type: "ApplyEffects", effects: [{ set_flag: ["dov_saw_rules", true] }, { give_clue: { id: "permit_rule_4", from: "t" } }] });
    expect(q()!.steps.map((x) => x.done)).toEqual([true, true, false]);
    s.command({ type: "ApplyEffects", effects: [{ set_flag: ["sq_01_done", true] }] });
    expect(q()!.state).toBe("complete");
  });
});

describe("if you skip it, Dov is arrested on the third day", () => {
  it("on day 3 an unfinished quest ends with the window closed and a note", () => {
    const s = game();
    s.advanceToMinuteOfDay(30).advanceToMinuteOfDay(35).advanceToMinuteOfDay(30); // roll over to day 3
    expect(s.time.day).toBe(3);
    expect(s.sim.state.flags.dov_arrested).toBe(true);
    near(s, "dov_anselm").command({ type: "Interact" });
    expect(s.dialogue!.lines[0]!.text).toContain("CLERK REASSIGNED FOR KINDNESS");
    s.command({ type: "EndConversation" });
    s.command({ type: "ApplyEffects", effects: [{ set_flag: ["sq_01_started", true] }] });
    expect(s.sim.questLog().find((x) => x.id === "lost_in_processing")!.state).toBe("failed");
  });

  it("a quest that was finished in time is not affected", () => {
    const s = game().command({ type: "ApplyEffects", effects: [{ set_flag: ["sq_01_done", true] }] });
    s.advanceToMinuteOfDay(30).advanceToMinuteOfDay(35).advanceToMinuteOfDay(30);
    expect(s.time.day).toBe(3);
    expect(s.sim.state.flags.dov_arrested).toBeUndefined();
    near(s, "dov_anselm").command({ type: "Interact" });
    expect(s.dialogue!.lines[0]!.text).not.toContain("REASSIGNED");
  });
});
