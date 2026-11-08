// covers: DLG-2, DLG-3, DLG-5, CLU-1
import { describe, expect, it } from "vitest";
import { compileDialogue } from "../src/index.ts";

const compile = (src: string, extra: Partial<Parameters<typeof compileDialogue>[1]> = {}) =>
  compileDialogue(src, { id: "t", ...extra });
const messages = (src: string, extra = {}) => compile(src, extra).errors.map((e) => `${e.line}: ${e.message}`);

const minimal = `npc: wren
node: a
  wren: "Hello."
  end
`;

describe("compileDialogue: valid input", () => {
  it("compiles a minimal conversation with defaults", () => {
    const { dialogue, errors } = compile(minimal);
    expect(errors).toEqual([]);
    expect(dialogue).toMatchObject({ id: "t", npc: "wren", name: "Wren", trackTrust: false });
    expect(dialogue!.start).toEqual([{ if: [], goto: "a" }]);
    expect(dialogue!.nodes.a).toMatchObject({ end: true, lines: [{ speaker: "wren", mood: null, text: "Hello." }] });
  });

  it("parses moods, quoted text with escapes, comments and blank lines", () => {
    const { dialogue } = compile(`// comment\nnpc: wren\nname: Wren Okoye\ntrust: yes\n\nnode: a\n  wren (tired): "Say \\"hi\\"."\n  end\n`);
    expect(dialogue!.name).toBe("Wren Okoye");
    expect(dialogue!.trackTrust).toBe(true);
    expect(dialogue!.nodes.a!.lines[0]).toEqual({ speaker: "wren", mood: "tired", text: 'Say "hi".' });
  });

  it("translates every condition shorthand into the shared rules language", () => {
    const cases: [string, unknown][] = [
      ["clue:a", { has_clue: "a" }],
      ["!clue:a", { not: { has_clue: "a" } }],
      ["verified:a", { clue_state: ["a", "verified"] }],
      ["disproved:a", { clue_state: ["a", "disproved"] }],
      ["flag:f", { flag: "f" }],
      ["flag:f=3", { flag_eq: ["f", 3] }],
      ["flag:f=true", { flag_eq: ["f", true] }],
      ["flag:f=open", { flag_eq: ["f", "open"] }],
      ["item:wire", { has_item: "wire" }],
      ["item:wire>=2", { has_item: ["wire", 2] }],
      ["credits>=20", { credits_gte: 20 }],
      ["trust:pallas>=trusts", { trust_gte: ["pallas", 1] }],
      ["trust:pallas>=unsure", { trust_gte: ["pallas", 0] }],
      ["alert>=2", { alert_gte: 2 }],
      ["arrests>=3", { arrest_count_gte: 3 }],
      ["time:22:00-06:00", { time_between: [1320, 360] }],
    ];
    for (const [token, expected] of cases) {
      const { dialogue, errors } = compile(`npc: x\nnode: a\n  > [${token}] "t" -> a\n  > "u" -> a\n`);
      expect(errors, token).toEqual([]);
      expect(dialogue!.nodes.a!.choices[0]!.if, token).toEqual([expected]);
    }
  });

  it("translates every effect shorthand", () => {
    const cases: [string, unknown][] = [
      ["+clue:c(wren)", { give_clue: { id: "c", from: "wren" } }],
      ["+clue:c", { give_clue: { id: "c", from: "x" } }], // defaults to the speaking npc
      ["verify:c", { verify_clue: "c" }],
      ["disprove:c", { disprove_clue: "c" }],
      ["flag:f", { set_flag: ["f", true] }],
      ["flag:f=7", { set_flag: ["f", 7] }],
      ["+item:wire", { add_item: ["wire", 1] }],
      ["+item:wire*3", { add_item: ["wire", 3] }],
      ["-item:wire*2", { remove_item: ["wire", 2] }],
      ["+credits:20", { add_credits: 20 }],
      ["-credits:5", { add_credits: -5 }],
      ["trust:pallas+1", { adjust_trust: ["pallas", 1] }],
      ["trust:pallas-1", { adjust_trust: ["pallas", -1] }],
      ["alert:2", { raise_alert_to: 2 }],
      ["emit:alarm", { emit: "alarm" }],
    ];
    for (const [token, expected] of cases) {
      const { dialogue, errors } = compile(`npc: x\nnode: a\n  > "t" {${token}} -> a\n`.replace('-> a\n', '-> a\n  end\n'));
      expect(errors, token).toEqual([]);
      expect(dialogue!.nodes.a!.choices[0]!.effects, token).toEqual([expected]);
    }
  });

  it("compiles present: blocks with reliability, conditions and effects", () => {
    const { dialogue, errors } = compile(`npc: sam
node: show
  present:
    c1 [reliability:outdated] {disprove:c1} -> done
    * -> done
  > "Back." -> done
node: done
  end
`);
    expect(errors).toEqual([]);
    expect(dialogue!.nodes.show!.present).toEqual([
      { clue: "c1", if: [], reliability: "outdated", effects: [{ disprove_clue: "c1" }], goto: "done" },
      { clue: "*", if: [], effects: [], goto: "done" },
    ]);
  });

  it("supports several start lines, first match wins at runtime", () => {
    const { dialogue } = compile(`npc: x\nstart: b [flag:seen]\nstart: a\nnode: a\n  end\nnode: b\n  end\n`);
    expect(dialogue!.start).toEqual([{ if: [{ flag: "seen" }], goto: "b" }, { if: [], goto: "a" }]);
  });
});

describe("compileDialogue: errors name the line", () => {
  it("flags a dead end, an unknown target, and an unreachable node", () => {
    const m = messages(`npc: x
node: a
  > "go" -> nowhere
node: dead
  x: "hi"
node: b
  end
`);
    expect(m).toContain('3: choice goes to unknown node "nowhere"');
    expect(m).toContain('4: dead end: node "dead" has no choices and no "end"');
    expect(m).toContain('4: unreachable node "dead"');
    expect(m).toContain('6: unreachable node "b"');
  });

  it("flags a node whose every choice is conditional (a possible soft lock)", () => {
    const m = messages(`npc: x\nnode: a\n  > [flag:f] "only" -> a\n`);
    expect(m.join("\n")).toContain("no visible choice");
    expect(messages(`npc: x\nnode: a\n  > [flag:f] "only" -> a\n  end\n`)).toEqual([]);
  });

  it("flags missing header, duplicate nodes, no nodes, and no unconditional start", () => {
    expect(messages(`node: a\n  end\n`)).toContain('1: missing header "npc: <id>"');
    expect(messages(`npc: x\nnode: a\n  end\nnode: a\n  end\n`).join("\n")).toContain('duplicate node "a"');
    expect(messages(`npc: x\n`).join("\n")).toContain("no nodes");
    expect(messages(`npc: x\nstart: a [flag:f]\nnode: a\n  end\n`).join("\n")).toContain("no conditions");
  });

  it("flags bad conditions, effects, quoting and stray lines", () => {
    const m = messages(`npc: x
oops
node: a
  > [wat:1] "t" -> a
  > "t" {explode} -> a
  x: unquoted
  > [reliability:true] "r" -> a
  end
`);
    expect(m).toContain('2: unexpected line before the first node: "oops"');
    expect(m).toContain('4: unknown condition "wat:1"');
    expect(m).toContain('5: unknown effect "explode"');
    expect(m).toContain('6: cannot parse line: "x: unquoted"');
    expect(m.join("\n")).toContain("reliability conditions only apply to present");
  });

  it("requires an unconditional '*' fallback in present: blocks", () => {
    const m = messages(`npc: x\nnode: a\n  present:\n    c1 -> a\n  > "b" -> a\n`);
    expect(m.join("\n")).toContain('present: needs an unconditional fallback');
    const m2 = messages(`npc: x\nnode: a\n  present:\n    * [flag:f] -> a\n  > "b" -> a\n`);
    expect(m2.join("\n")).toContain("fallback");
  });

  it("checks clue and npc references against known content", () => {
    const src = `npc: x\nnode: a\n  > [clue:ghost] "t" {+clue:phantom, trust:nobody+1} -> a\n  > "u" -> a\n`;
    const m = messages(src, { knownClues: new Set(["real"]), knownNpcs: new Set(["x"]) });
    expect(m).toContain('3: unknown clue "ghost"');
    expect(m).toContain('3: unknown clue "phantom"');
    expect(m).toContain('3: unknown NPC "nobody"');
    expect(messages(src)).toEqual([]); // without known sets, no reference checks
  });
});
