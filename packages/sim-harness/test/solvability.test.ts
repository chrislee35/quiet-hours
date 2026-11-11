// covers: ADR-6 (solvability checking), PUZ-1, TESTING §7 (the checker finds dead ends, soft locks and single-route puzzles)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_CONTENT, compileDialogue, type ClueDef, type Content, type PuzzleDef, type QuestDef, type TerminalDef } from "@qh/core";
import { assemble, checkMap, checkSolvability, formatReport, loadContent, validateContent, type GoalDef } from "../../content-tools/src/index.ts";
import { asciiWorld } from "../src/index.ts";
import { config } from "./helpers.ts";

const none = { credits: 0, items: {} };
const goal = (require: GoalDef["require"], over: Partial<GoalDef> = {}): GoalDef => ({ id: "g", name: "the goal", map: "m", require, ...over });
const dialogue = (id: string, src: string) => {
  const { dialogue: d, errors } = compileDialogue(src, { id });
  if (!d) throw new Error(JSON.stringify(errors));
  return d;
};
// A tiny puzzle that is trivially solvable (one cell to turn), and one that cannot be solved at all.
const easy: PuzzleDef = { id: "easy", kind: "power_routing", width: 2, height: 1, pieces: ["EE"], rotations: ["01"], source: [0, 0], targets: [[1, 0]] };
const hopeless: PuzzleDef = { id: "hopeless", kind: "power_routing", width: 3, height: 1, pieces: ["E.E"], rotations: ["000"], source: [0, 0], targets: [[2, 0]] }; // a gap no rotation can bridge
const term = (id: string, over: Partial<TerminalDef> = {}): TerminalDef => ({ id, title: id, puzzle: "easy", bypass: [], onSolve: [{ set_flag: [`${id}_done`, true] }], solvedText: "ok", ...over });
const content = (over: Partial<Content> = {}): Content => ({ ...EMPTY_CONTENT, puzzles: { easy, hopeless }, ...over });
const run = (world: ReturnType<typeof asciiWorld>, c: Content, goals: GoalDef[], opts = {}, start = none) => checkMap("m", world, c, config, goals, start, opts);
const kinds = (r: ReturnType<typeof run>) => r.findings.map((f) => f.kind).sort();
const room = (extras: Parameters<typeof asciiWorld>[2] = {}) => asciiWorld(["#######", "#S....#", "#######"], [], extras);

describe("a goal that can be reached", () => {
  it("is reported with a shortest route, and the route is what the player would do", () => {
    const c = content({ terminals: { t: term("t") } });
    const r = run(room({ terminals: [{ id: "t", x: 3, y: 1 }] }), c, [goal([{ flag: "t_done" }])]);
    expect(r.goals[0]).toEqual({ id: "g", reachable: true, route: ["solve the t puzzle"] });
    expect(r.findings.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("can need a conversation first: the route lists each thing said", () => {
    const d = dialogue("sam", `npc: sam\nnode: hi\n  sam: "Hello."\n  > "Give me the key." {+item:key} -> done\n  > "Bye." -> done\nnode: done\n  end\n`);
    const c = content({ dialogues: { sam: d }, terminals: { t: term("t", { bypass: [{ has_item: "key" }] }) } });
    const r = run(room({ npcs: [{ id: "sam", x: 2, y: 1, dialogue: "sam" }], terminals: [{ id: "t", x: 4, y: 1 }] }), c, [goal([{ flag: "t_done" }])]);
    expect(r.goals[0]!.route!.length).toBeLessThanOrEqual(5);
    expect(r.goals[0]!.reachable).toBe(true);
  });
});

describe("dead ends it must find", () => {
  it("a goal nothing can ever bring about is an error", () => {
    const r = run(room(), content(), [goal([{ flag: "never_set" }])]);
    expect(kinds(r)).toContain("goal-unreachable");
    expect(r.findings.find((f) => f.kind === "goal-unreachable")!.severity).toBe("error");
    expect(r.goals[0]).toMatchObject({ reachable: false, route: null });
  });

  it("a circular dependency is a dead end: the door needs a clue only the person behind the door can give", () => {
    const d = dialogue("sam", `npc: sam\nnode: hi\n  sam: "Here is the code."\n  > "Thanks." {flag:got_code} -> bye\nnode: bye\n  end\n`);
    const c = content({
      dialogues: { sam: d },
      terminals: { t: term("t", { puzzle: "hopeless", bypass: [{ flag: "got_code" }], onSolve: [{ unlock_door: "door_4_1" }, { set_flag: ["t_done", true] }] }) },
    });
    const w = asciiWorld(["#########", "#S..L...#", "#########"], [], { npcs: [{ id: "sam", x: 6, y: 1, dialogue: "sam" }], terminals: [{ id: "t", x: 2, y: 1 }] });
    const r = run(w, c, [goal([{ flag: "t_done" }])]);
    expect(kinds(r)).toContain("goal-unreachable");
  });

  it("the same layout works once the door is not the only way: the person is reachable, so the code is obtainable", () => {
    const d = dialogue("sam", `npc: sam\nnode: hi\n  sam: "Here is the code."\n  > "Thanks." {flag:got_code} -> bye\nnode: bye\n  end\n`);
    const c = content({ dialogues: { sam: d }, terminals: { t: term("t", { puzzle: "hopeless", bypass: [{ flag: "got_code" }] }) } });
    const w = asciiWorld(["#########", "#S......#", "#########"], [], { npcs: [{ id: "sam", x: 6, y: 1, dialogue: "sam" }], terminals: [{ id: "t", x: 2, y: 1 }] });
    expect(run(w, c, [goal([{ flag: "t_done" }])]).goals[0]!.reachable).toBe(true);
  });

  it("a door that is locked from the start blocks what is behind it until something unlocks it", () => {
    const c = content({ terminals: { behind: term("behind") } });
    const w = asciiWorld(["#########", "#S..L...#", "#########"], [], { terminals: [{ id: "behind", x: 6, y: 1 }] });
    expect(run(w, c, [goal([{ flag: "behind_done" }])]).goals[0]!.reachable).toBe(false);
    const open = asciiWorld(["#########", "#S..O...#", "#########"], [], { terminals: [{ id: "behind", x: 6, y: 1 }] });
    expect(run(open, c, [goal([{ flag: "behind_done" }])]).goals[0]!.reachable).toBe(true);
  });
});

describe("soft locks it must find (a reachable situation that can no longer reach the goal)", () => {
  // Sam gives a key once. The terminal opens with the key. But Sam will also *buy* the key, and then it is gone for good.
  const d = dialogue("sam", `npc: sam
node: hi
  sam: "A key, for you."
  > [!flag:given] "Take the key." {flag:given, +item:key} -> hi
  > [item:key] "Sell the key. (10 credits)" {-item:key, +credits:10} -> hi
  > "Bye." -> bye
node: bye
  end
`);
  const trap = content({ dialogues: { sam: d }, terminals: { t: term("t", { puzzle: "hopeless", bypass: [{ has_item: "key" }] }) } });
  const world = room({ npcs: [{ id: "sam", x: 2, y: 1, dialogue: "sam" }], terminals: [{ id: "t", x: 4, y: 1 }] });

  it("finds it, says how many situations are stuck, and shows the shortest way in", () => {
    const r = run(world, trap, [goal([{ flag: "t_done" }])]);
    expect(r.goals[0]!.reachable).toBe(true); // the goal is winnable...
    const lock = r.findings.find((f) => f.kind === "soft-lock")!; // ...and also losable
    expect(lock.severity).toBe("error");
    expect(lock.route!.some((s) => s.includes("Sell the key"))).toBe(true);
  });

  it("is not reported when the content gives a way back (a second key, here)", () => {
    const fixed = dialogue("sam", `npc: sam\nnode: hi\n  sam: "A key."\n  > "Take a key." {+item:key} -> hi\n  > [item:key] "Sell it." {-item:key, +credits:10} -> hi\n  > "Bye." -> bye\nnode: bye\n  end\n`);
    const r = run(world, { ...trap, dialogues: { sam: fixed } }, [goal([{ flag: "t_done" }])]);
    expect(kinds(r)).not.toContain("soft-lock");
  });

  it("does not call an ordinary one-way story step a soft lock, as long as the goal is still reachable from it", () => {
    const plain = dialogue("sam", `npc: sam\nnode: hi\n  sam: "Hello."\n  > "Take the key." {+item:key} -> hi\n  > "Bye." -> bye\nnode: bye\n  end\n`);
    const r = run(world, { ...trap, dialogues: { sam: plain } }, [goal([{ flag: "t_done" }])]);
    expect(kinds(r)).not.toContain("soft-lock");
  });
});

describe("critical terminals need two ways through (PUZ-1)", () => {
  const w = (extras = {}) => room({ terminals: [{ id: "t", x: 3, y: 1 }], ...extras });
  const g = [goal([{ flag: "t_done" }])];

  it("a puzzle alone is one way: flagged as an error", () => {
    const r = run(w(), content({ terminals: { t: term("t", { critical: true }) } }), g);
    expect(r.terminals[0]).toMatchObject({ puzzle: true, bypass: false, alternative: false, routes: 1 });
    expect(r.findings.find((f) => f.kind === "single-route")!.severity).toBe("error");
  });

  it("a bypass the player can actually obtain is the second way", () => {
    const d = dialogue("sam", `npc: sam\nnode: hi\n  sam: "A code."\n  > "Thanks." {+clue:code} -> bye\nnode: bye\n  end\n`);
    const clue: ClueDef = { id: "code", text: "The code.", source: "npc:sam", reliability: "true", tags: [], links: [] };
    const c = content({ dialogues: { sam: d }, clues: { code: clue }, terminals: { t: term("t", { critical: true, bypass: [{ has_clue: "code" }] }) } });
    const r = run(w({ npcs: [{ id: "sam", x: 2, y: 1, dialogue: "sam" }] }), c, g);
    expect(r.terminals[0]).toMatchObject({ puzzle: true, bypass: true, routes: 2 });
    expect(kinds(r)).not.toContain("single-route");
  });

  it("a bypass nobody can obtain does not count", () => {
    const r = run(w(), content({ terminals: { t: term("t", { critical: true, bypass: [{ has_item: "never_given" }] }) } }), g);
    expect(r.terminals[0]).toMatchObject({ bypass: false, routes: 1 });
  });

  it("an unsolvable puzzle is not a way through: with a bypass that is one way, still an error", () => {
    const d = dialogue("sam", `npc: sam\nnode: hi\n  sam: "Key."\n  > "Thanks." {+item:key} -> bye\nnode: bye\n  end\n`);
    const c = content({ dialogues: { sam: d }, terminals: { t: term("t", { critical: true, puzzle: "hopeless", bypass: [{ has_item: "key" }] }) } });
    const r = run(w({ npcs: [{ id: "sam", x: 2, y: 1, dialogue: "sam" }] }), c, g);
    expect(r.terminals[0]).toMatchObject({ puzzle: false, bypass: true, routes: 1 });
    expect(kinds(r)).toContain("single-route");
  });

  it("a terminal that is not critical is not held to it", () => {
    expect(kinds(run(w(), content({ terminals: { t: term("t") } }), g))).toEqual([]);
  });

  it("another source of the same result counts as a way: a second terminal unlocking the same door", () => {
    const c = content({
      terminals: {
        t: term("t", { critical: true, onSolve: [{ unlock_door: "door_5_1" }] }),
        u: term("u", { onSolve: [{ unlock_door: "door_5_1" }] }),
      },
    });
    const world = asciiWorld(["#######", "#S.L..#", "#######"], [], { terminals: [{ id: "t", x: 2, y: 1 }, { id: "u", x: 1, y: 1 }] });
    const r = run(world, c, [goal([{ flag: "t_done" }])]);
    expect(r.terminals.find((t) => t.id === "t")!.alternative).toBe(false); // there is no door_5_1: nothing to unlock
  });
});

describe("dead content", () => {
  it("a quest that can never be completed is an error; one that can is not", () => {
    const quest = (id: string, flag: string): QuestDef => ({ id, title: id, summary: "", start: [], steps: [{ id: "a", text: "a", done: [{ flag }] }], complete: [{ flag }] });
    const c = content({ quests: { ok: quest("ok", "t_done"), bad: quest("bad", "nope") }, terminals: { t: term("t") } });
    const r = run(room({ terminals: [{ id: "t", x: 3, y: 1 }] }), c, []);
    expect(r.findings.filter((f) => f.kind === "quest-impossible").map((f) => f.message)).toEqual([expect.stringContaining("bad")]);
  });

  it("a conversation option that is never offered, and a node nobody reaches, are warnings", () => {
    const d = dialogue("sam", `npc: sam\nnode: hi\n  sam: "Hi."\n  > [flag:impossible] "Secret option." -> secret\n  > "Bye." -> bye\nnode: secret\n  end\nnode: bye\n  end\n`);
    const r = run(room({ npcs: [{ id: "sam", x: 2, y: 1, dialogue: "sam" }] }), content({ dialogues: { sam: d } }), []);
    expect(kinds(r)).toEqual(expect.arrayContaining(["option-never-offered", "node-never-reached"]));
    expect(r.findings.every((f) => f.severity === "warning")).toBe(true);
  });
});

describe("the search itself", () => {
  const loopy = dialogue("bank", `npc: bank
node: hi
  bank: "Money?"
  > [!debt:bank] "Borrow." {loan:bank*40} -> hi
  > [debt:bank, credits>=1] "Repay." {repay:bank*10} -> hi
  > "Bye." -> bye
node: bye
  end
`);
  const c = () => content({ dialogues: { bank: loopy } });
  const w = () => room({ npcs: [{ id: "bank", x: 2, y: 1, dialogue: "bank" }] });

  it("borrowing and repaying in a loop does not explode: credits are tracked as the most you could have", () => {
    const r = run(w(), c(), [goal([{ credits_gte: 40 }])]);
    expect(r.truncated).toBe(false);
    expect(r.states).toBeLessThan(40);
    expect(r.goals[0]!.reachable).toBe(true);
  });

  it("when it runs out of room it says so, and 'never' answers become warnings, not errors", () => {
    const many = dialogue("many", `npc: many\nnode: hi\n  many: "x"\n  > "a" {flag:a} -> hi\n  > "b" {flag:b} -> hi\n  > "c" {flag:c} -> hi\n  > "d" {flag:d} -> hi\n  > "e" {flag:e} -> hi\n  > "Bye." -> bye\nnode: bye\n  end\n`);
    const r = run(room({ npcs: [{ id: "many", x: 2, y: 1, dialogue: "many" }] }), content({ dialogues: { many }, quests: { q: { id: "q", title: "Q", summary: "", start: [], steps: [{ id: "s", text: "s", done: [{ flag: "zzz" }] }], complete: [{ flag: "zzz" }] } } }), [goal([{ flag: "zzz" }])], { maxStates: 20 });
    expect(r.truncated).toBe(true);
    expect(kinds(r)).toContain("truncated");
    expect(r.findings.filter((f) => f.kind === "goal-unreachable" || f.kind === "quest-impossible").every((f) => f.severity === "warning")).toBe(true);
  });

  it("night-only things are reachable by waiting for night, and the route says so", () => {
    const d = dialogue("fence", `npc: fence\nnode: hi\n  fence: "Closed."\n  > [quiet] "The back door." {flag:night_door} -> bye\n  > "Bye." -> bye\nnode: bye\n  end\n`);
    const r = run(room({ npcs: [{ id: "fence", x: 2, y: 1, dialogue: "fence" }] }), content({ dialogues: { fence: d } }), [goal([{ flag: "night_door" }])]);
    expect(r.goals[0]!.reachable).toBe(true);
    expect(r.goals[0]!.route!.some((s) => s.includes("wait until quiet hours"))).toBe(true);
  });

  it("picking up an item on the map counts, and a pickup behind a locked door does not until it is open", () => {
    const pk = (x: number) => ({ pickups: [{ id: "key", x, y: 1, grant: "item:key" }] });
    const c2 = content({ terminals: { t: term("t", { puzzle: "hopeless", bypass: [{ has_item: "key" }] }) } });
    const open = asciiWorld(["#######", "#S....#", "#######"], [], { ...pk(5), terminals: [{ id: "t", x: 2, y: 1 }] });
    expect(run(open, c2, [goal([{ flag: "t_done" }])]).goals[0]!.reachable).toBe(true);
    const shut = asciiWorld(["########", "#S..L..#", "########"], [], { ...pk(6), terminals: [{ id: "t", x: 2, y: 1 }] });
    expect(run(shut, c2, [goal([{ flag: "t_done" }])]).goals[0]!.reachable).toBe(false);
  });

  it("starting credits and items from start.json are really what the search starts with", () => {
    const d = dialogue("shop", `npc: shop\nnode: hi\n  shop: "Hi."\n  > [credits>=50, item:rope] "Buy." {flag:bought} -> bye\n  > "Bye." -> bye\nnode: bye\n  end\n`);
    const world = room({ npcs: [{ id: "shop", x: 2, y: 1, dialogue: "shop" }] });
    const c3 = content({ dialogues: { shop: d } });
    expect(run(world, c3, [goal([{ flag: "bought" }])]).goals[0]!.reachable).toBe(false);
    expect(run(world, c3, [goal([{ flag: "bought" }])], {}, { credits: 50, items: { rope: 1 } }).goals[0]!.reachable).toBe(true);
  });
});

describe("the shipped content", () => {
  const realContent = new URL("../../../content", import.meta.url).pathname;
  const { bundle } = loadContent(realContent);

  it("is valid and passes: every goal reachable, no soft locks, every critical terminal has two ways", () => {
    expect(validateContent(bundle)).toEqual([]);
    const a = assemble(bundle);
    const report = checkSolvability(a.worlds, a.content, a.config, a.goals, a.start);
    expect(formatReport(report)).toContain("0 error(s)");
    const slice = report.maps.find((m) => m.map === "stacks_slice")!;
    expect(slice.truncated).toBe(false);
    expect(slice.goals.every((g) => g.reachable)).toBe(true);
    expect(slice.terminals.find((t) => t.id === "maint_panel")).toMatchObject({ puzzle: true, bypass: true, routes: 2 });
  });

  it("would catch breaking it: remove the second route to the maintenance wing and it is an error", () => {
    const a = assemble(bundle);
    const broken = { ...a.content, terminals: { ...a.content.terminals, maint_panel: { ...a.content.terminals.maint_panel!, bypass: [] } } };
    const report = checkSolvability(a.worlds, broken, a.config, a.goals, a.start);
    expect(report.errors).toBeGreaterThan(0);
    expect(report.maps[0]!.findings.map((f) => f.kind)).toContain("single-route");
  });

  it("would catch the goal becoming impossible: give the puzzle an unsolvable shape and no bypass", () => {
    const a = assemble(bundle);
    const hopelessPuzzle = { ...a.content.puzzles.maint_power!, targets: [[3, 3]] } as PuzzleDef;
    const broken = { ...a.content, puzzles: { ...a.content.puzzles, maint_power: { ...hopelessPuzzle, pieces: ["EEEE", "EEEE", "EEEE", "EEEE"], rotations: ["0000", "0000", "0000", "0000"], width: 4, height: 4, source: [0, 0] } as PuzzleDef }, terminals: { ...a.content.terminals, maint_panel: { ...a.content.terminals.maint_panel!, bypass: [] } } };
    const report = checkSolvability(a.worlds, broken, a.config, a.goals, a.start);
    expect(report.maps[0]!.findings.map((f) => f.kind)).toEqual(expect.arrayContaining(["goal-unreachable"]));
  });
});
