// covers: CMP-2 (one arc, four voicings), CMP-8 (specialty perks as data), the mentor beats and their pacing
import { describe, expect, it } from "vitest";
import { ticksPerGameMinute, arcSlots, composeMentors, mentorIssues, MENTOR_BEATS, MENTOR_IDS, type MentorVoicing } from "@qh/core";
import { readFileSync, readdirSync } from "node:fs";
import { assemble, loadContent } from "../../content-tools/src/index.ts";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const content = a.content;
const arc = readFileSync(`${root}/mentors/arc.qdl`, "utf8");
const voicings = readdirSync(`${root}/mentors`).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(`${root}/mentors/${f}`, "utf8")) as MentorVoicing);

// The mentors are placed on maps by T3.8; here each is put beside the player on a copy of the Underworks.
const base = a.worlds.underworks!;
const world = { ...base, npcs: [...base.npcs.filter((n) => !(MENTOR_IDS as readonly string[]).includes(n.id)), ...MENTOR_IDS.map((id, i) => ({ id, x: 4 + i * 2, y: 21, dialogue: id }))] };
const game = (mentor: string) => {
  const s = new Scenario(config, 1, { ...a.worlds, underworks: world }, content, "underworks");
  return s.command({ type: "ApplyEffects", effects: [{ set_flag: ["mentor", mentor] }] });
};
const talk = (s: Scenario, id: string) => {
  const n = world.npcs.find((x) => x.id === id)!;
  return s.player(n.x + 0.5, n.y + 1.0).command({ type: "Interact" });
};
const flag = (s: Scenario, f: string) => s.sim.state.flags[f];
const nodeOf = (s: Scenario) => s.dialogue?.lines.at(-1)?.text ?? "";

describe("the mentor arc", () => {
  it("is voiced four times: every beat has every line for every mentor", () => {
    expect(mentorIssues(arc, voicings)).toEqual([]);
    expect(voicings.map((v) => v.id).sort()).toEqual([...MENTOR_IDS].sort());
    for (const beat of MENTOR_BEATS) expect(arc).toContain(`node: arc_${beat}`);
    for (const v of voicings) for (const s of arcSlots(arc).filter((x) => x !== "specialty.grant")) expect(v.voice[s]).toBeTruthy();
  });

  it("the validator catches a missing line, a stray line and a line that would break the dialogue", () => {
    const v = structuredClone(voicings);
    const of = (id: string) => v.find((x) => x.id === id)!;
    delete of("ines").voice["slip.a"];
    of("maren").voice["extra.thing"] = "hello";
    of("tobias").voice["out"] = 'say "no"';
    const issues = mentorIssues(arc, v);
    expect(issues.some((m) => m.includes('"ines"') && m.includes("slip.a"))).toBe(true);
    expect(issues.some((m) => m.includes('"maren"') && m.includes("extra.thing"))).toBe(true);
    expect(issues.some((m) => m.includes('"tobias"') && m.includes("break"))).toBe(true);
    expect(mentorIssues(arc, v.filter((x) => x.id !== "ines")).some((m) => m.includes("no voicing"))).toBe(true);
  });

  it("composing keeps the everyday talk and puts the due beat first", () => {
    const out = composeMentors({ ines: "npc: ines\nname: Ines\nstart: hello\n\nnode: hello\n  ines: \"Hi.\"\n  end\n" }, arc, voicings);
    expect(out.ines!.indexOf("start: arc_awakening")).toBeLessThan(out.ines!.indexOf("start: hello"));
    expect(out.ines).toContain("node: hello");
    expect(out.maren).toContain("start: arc_idle"); // no file of their own: a stub
  });

  for (const id of MENTOR_IDS) {
    it(`${id}: walks all seven beats in order, each once, in their own voice`, () => {
      const v = voicings.find((x) => x.id === id)!;
      const s = game(id);
      // 1 vouch
      talk(s, id);
      expect(s.dialogue!.lines[0]!.text).toBe(v.voice["vouch.a"]);
      s.say(v.voice["vouch.opt"]!).say("Thank you.").command({ type: "EndConversation" });
      expect(flag(s, "mb_vouch")).toBe(true);
      expect(s.sim.state.trust[id]).toBe(1);
      // 2 first lesson: the specialty is granted
      talk(s, id);
      expect(s.dialogue!.lines[0]!.text).toBe(v.voice["first_lesson.a"]);
      expect(flag(s, `perk_${v.specialty.id === "gate_security" ? "gate_insight" : v.specialty.id}`)).toBe(true);
      s.say(v.voice["first_lesson.opt"]!).say("I will remember that.").command({ type: "EndConversation" });
      // the slip waits: three game hours must pass
      talk(s, id);
      expect(s.dialogue!.lines[0]!.text).not.toBe(v.voice["slip.a"]);
      s.command({ type: "EndConversation" });
      expect(flag(s, "mb_slip_ready")).toBeUndefined();
      s.advanceTicks(Math.ceil(181 * ticksPerGameMinute(config)));
      expect(flag(s, "mb_slip_ready")).toBe(true);
      // 3 slip, 4 refusal
      talk(s, id);
      expect(s.dialogue!.lines[0]!.text).toBe(v.voice["slip.a"]);
      expect(s.sim.state.clues.mentor_slip).toBeDefined();
      s.say(v.voice["slip.opt"]!);
      expect(s.dialogue!.lines.map((l) => l.text)).toContain(v.voice["refusal.a"]);
      s.say(v.voice["refusal.warm"]!).command({ type: "EndConversation" });
      expect(flag(s, "mentor_romance")).toBe(true);
      expect(flag(s, "mb_refusal")).toBe(true);
      // 5 shake: waits for the Gate's truth
      talk(s, id);
      expect(s.dialogue!.lines[0]!.text).not.toBe(v.voice["shake.a"]);
      s.command({ type: "EndConversation" });
      s.command({ type: "ApplyEffects", effects: [{ give_clue: { id: "gate_lookup", from: "tobias" } }] });
      talk(s, id);
      expect(s.dialogue!.lines[0]!.text).toBe(v.voice["shake.a"]);
      s.say(v.voice["shake.opt"]!).say("We will find a way.").command({ type: "EndConversation" });
      // 6 choice
      talk(s, id);
      expect(s.dialogue!.lines[0]!.text).toBe(v.voice["choice.a"]);
      s.say(v.voice["choice.stay"]!);
      expect(s.dialogue!.lines[0]!.text).toBe(v.voice["choice.stay_b"]);
      s.say("Then we are agreed.").command({ type: "EndConversation" });
      expect(flag(s, "mentor_choice")).toBe("stay");
      // 7 awakening is raised late, whatever else happened
      talk(s, id);
      expect(s.dialogue!.lines[0]!.text).not.toBe(v.voice["awakening.a"]);
      s.command({ type: "EndConversation" }).command({ type: "ApplyEffects", effects: [{ set_flag: ["mentor_awakening", true] }] });
      talk(s, id);
      expect(s.dialogue!.lines[0]!.text).toBe(v.voice["awakening.a"]);
      s.say(v.voice["awakening.opt"]!).say("I know.").command({ type: "EndConversation" });
      for (const beat of MENTOR_BEATS) if (beat !== "refusal") expect(flag(s, `mb_${beat}`)).toBe(true);
      expect(nodeOf(s)).toBeDefined();
    });
  }

  it("only the chosen mentor runs the arc; the others keep to their everyday talk", () => {
    const s = game("ines");
    talk(s, "silas");
    expect(s.dialogue!.lines[0]!.text).not.toBe(voicings.find((v) => v.id === "silas")!.voice["vouch.a"]);
  });

  it("the other choice at the turn is available too (leave)", () => {
    const v = voicings.find((x) => x.id === "tobias")!;
    const s = game("tobias").command({ type: "ApplyEffects", effects: [{ set_flag: ["mb_shake", true] }] });
    talk(s, "tobias");
    s.say(v.voice["choice.leave"]!);
    expect(s.dialogue!.lines[0]!.text).toBe(v.voice["choice.leave_b"]);
    expect(flag(s, "mentor_choice")).toBe("leave");
  });
});

describe("mentor specialties (CMP-8)", () => {
  const credits = (s: Scenario, svc: string) => {
    const before = s.sim.state.inventory.credits;
    s.command({ type: "ApplyEffects", effects: [{ use_service: svc }] });
    return before - s.sim.state.inventory.credits;
  };
  const rich = (mentor: string, perk?: string) =>
    game(mentor).command({ type: "ApplyEffects", effects: [{ add_credits: 200 }, { give_pass: { id: "p", label: "p", level: 0, origin: "issued" } }, ...(perk ? [{ set_flag: [perk, true] as [string, boolean] }] : [])] });

  it("Maren's timetables make fares cheaper (and the Conductor's fix makes them free)", () => {
    expect(credits(rich("maren"), "transit_fare")).toBe(5);
    expect(credits(rich("maren", "perk_timetables"), "transit_fare")).toBe(2);
    expect(credits(rich("maren", "conductor_fixed"), "transit_fare")).toBe(0);
  });

  it("Ines's paperwork makes forged identity cheaper", () => {
    expect(credits(rich("ines"), "forge_stacks_pass")).toBe(40);
    expect(credits(rich("ines", "perk_paperwork"), "forge_stacks_pass")).toBe(25);
  });

  it("each mentor's first lesson gives their own clues, in their own words", () => {
    const grants: Record<string, string> = { ines: "forged_pass_scan", maren: "train7_gate", tobias: "gate_reverifies_night", silas: "dex_rewrote_it" };
    for (const id of MENTOR_IDS) {
      const s = game(id).command({ type: "ApplyEffects", effects: [{ set_flag: ["mb_vouch", true] }] });
      talk(s, id);
      expect(s.sim.state.clues[grants[id]!]).toBeDefined();
    }
  });
});
