// covers: HAK-2, PUZ-1 (solvers prove solvability), PUZ-3 (deducible, never guessed)
import { describe, expect, it } from "vitest";
import {
  arithmetic as ar, chemBalance as ch, cipher as ci, magicSquare as ms, melody as me, neuralNet as nn, translation as tr,
  type ArithmeticDef, type ChemBalanceDef, type CipherDef, type MagicSquareDef, type MelodyDef, type NeuralNetDef, type TranslationDef,
} from "../src/index.ts";

describe("cipher", () => {
  const caesar: CipherDef = { id: "c", kind: "cipher", method: "caesar", plaintext: "Attack at dawn, quietly.", key: "D" };
  const vig: CipherDef = { id: "v", kind: "cipher", method: "vigenere", plaintext: "ATTACK AT DAWN", key: "LEMON" };

  it("enciphers letters only: spaces, punctuation and case are kept sensible", () => {
    expect(ci.ciphertext(caesar)).toBe("DWWDFN DW GDZQ, TXLHWOB.");
  });

  it("matches the textbook Vigenère example", () => {
    expect(ci.ciphertext(vig)).toBe("LXFOPV EF RNHR");
  });

  it("decodes live with the dials and is solved only by the true key", () => {
    expect(ci.isSolved(caesar, [3])).toBe(true);
    expect(ci.isSolved(caesar, [4])).toBe(false);
    expect(ci.decoded(caesar, [3])).toBe("ATTACK AT DAWN, QUIETLY.");
    const key = [..."LEMON"].map((c) => c.charCodeAt(0) - 65);
    expect(ci.isSolved(vig, key)).toBe(true);
    expect(ci.isSolved(vig, [11, 4, 12, 14, 12])).toBe(false);
  });

  it("dials wrap after Z and the solver gives the shortest way up", () => {
    expect(ci.tap(caesar, [25], 0)).toEqual([0]);
    expect(ci.solve(caesar)).toEqual([0, 0, 0]);
    expect(ci.solve(vig, [11, 4, 12, 14, 0])).toEqual(Array(13).fill(4));
    expect(ci.tap(caesar, [0], 1)).toBeNull();
  });

  it("shows a frequency table and refuses weak or malformed ciphers", () => {
    expect(ci.view(caesar, [0]).lines.map((l) => l.text).join("\n")).toMatch(/Commonest letters.*[A-Z]×\d/);
    expect(ci.validate(caesar)).toEqual([]);
    expect(ci.validate({ ...caesar, key: "A" })).not.toEqual([]);
    expect(ci.validate({ ...caesar, key: "DD" })).not.toEqual([]);
    expect(ci.validate({ ...vig, key: "L" })).not.toEqual([]);
    expect(ci.validate({ ...caesar, plaintext: "Hi there" })).not.toEqual([]);
  });
});

describe("magic square", () => {
  const def = (givens: string[]): MagicSquareDef => ({ id: "m", kind: "magic_square", givens });

  it("finds the one classic arrangement and insists on uniqueness", () => {
    expect(ms.solutions(def(["2.6", "...", "4.."]))).toEqual([[2, 7, 6, 9, 5, 1, 4, 3, 8]]);
    expect(ms.validate(def(["2.6", "...", "4.."]))).toEqual([]);
    expect(ms.validate(def(["2..", ".5.", "..8"]))).toEqual([expect.stringContaining("2 solutions")]);
    expect(ms.validate(def(["...", "...", "..."]))).not.toEqual([]);
    expect(ms.validate(def(["22.", "...", "..."]))).not.toEqual([]);
  });

  it("blanks count 1 to 9 and wrap; given digits cannot be changed", () => {
    const d = def(["2.6", "...", "4.."]);
    expect(ms.tap(d, ms.init(d), 1)).toEqual([2, 1, 6, 0, 0, 0, 4, 0, 0]);
    expect(ms.tap(d, [2, 9, 6, 0, 0, 0, 4, 0, 0], 1)![1]).toBe(1);
    expect(ms.tap(d, ms.init(d), 0)).toBeNull();
    expect(ms.tap(d, ms.init(d), 9)).toBeNull();
  });

  it("is solved only when all nine are distinct and every line sums to 15", () => {
    const d = def(["2.6", "...", "4.."]);
    expect(ms.isSolved(d, [2, 7, 6, 9, 5, 1, 4, 3, 8])).toBe(true);
    expect(ms.isSolved(d, [2, 7, 6, 9, 5, 1, 4, 8, 3])).toBe(false);
    expect(ms.isSolved(d, ms.init(d))).toBe(false);
  });

  it("the solver's taps reach the solution exactly", () => {
    const d = def(["2.6", "...", "4.."]);
    let v = ms.init(d);
    for (const i of ms.solve(d)!) v = ms.tap(d, v, i)!;
    expect(ms.isSolved(d, v)).toBe(true);
  });
});

describe("arithmetic", () => {
  const def = (over: Partial<ArithmeticDef> = {}): ArithmeticDef => ({ id: "a", kind: "arithmetic", numbers: [7, 2, 2], ops: "+-*/", target: 7, ...over });

  it("uses ordinary precedence and exact fractions", () => {
    expect(ar.evaluate(def(), [3, 2])).toEqual({ n: 7, d: 1 }); // 7 / 2 * 2 = 7, not 6.99 or 6
    expect(ar.evaluate(def(), [0, 2])).toEqual({ n: 11, d: 1 }); // 7 + 2 * 2: multiplication first
    expect(ar.evaluate(def({ numbers: [1, 2, 3] }), [3, 3])).toEqual({ n: 1, d: 6 });
  });

  it("dividing by zero is invalid, never solved", () => {
    expect(ar.evaluate(def({ numbers: [5, 0, 1] }), [3, 0])).toBeNull();
    expect(ar.isSolved(def({ numbers: [5, 0, 1], target: 0 }), [3, 0])).toBe(false);
  });

  it("a fractional result never counts as the integer target", () => {
    expect(ar.isSolved(def({ numbers: [7, 2, 1], target: 3 }), [3, 2])).toBe(false); // 7/2*1 = 3.5
  });

  it("operators cycle and the solver finds the fewest changes", () => {
    const d = def();
    expect(ar.tap(d, [3, 3], 0)).toEqual([0, 3]);
    expect(ar.tap(d, [0, 0], 2)).toBeNull();
    const taps = ar.solve(d)!;
    let v = ar.init(d);
    for (const i of taps) v = ar.tap(d, v, i)!;
    expect(ar.isSolved(d, v)).toBe(true);
  });

  it("validates sizes and operators", () => {
    expect(ar.validate(def())).toEqual([]);
    expect(ar.validate(def({ numbers: [1, 2] }))).not.toEqual([]);
    expect(ar.validate(def({ ops: "+" }))).not.toEqual([]);
    expect(ar.validate(def({ ops: "+^" }))).not.toEqual([]);
  });
});

describe("chemical equations", () => {
  const def = (reactants: string[], products: string[]): ChemBalanceDef => ({ id: "c", kind: "chem_balance", reactants, products });

  it("reads formulas, including parentheses", () => {
    expect(Object.fromEntries(ch.atoms("H2O")!)).toEqual({ H: 2, O: 1 });
    expect(Object.fromEntries(ch.atoms("Ca(OH)2")!)).toEqual({ Ca: 1, O: 2, H: 2 });
    expect(Object.fromEntries(ch.atoms("Ca3(PO4)2")!)).toEqual({ Ca: 3, P: 2, O: 8 });
    expect(ch.atoms("h2o")).toBeNull();
    expect(ch.atoms("H2(O")).toBeNull();
    expect(ch.atoms("")).toBeNull();
  });

  it("balances water: 2 H2 + O2 -> 2 H2O", () => {
    const d = def(["H2", "O2"], ["H2O"]);
    expect(ch.isSolved(d, [2, 1, 2])).toBe(true);
    expect(ch.isSolved(d, [1, 1, 1])).toBe(false);
    expect(ch.solve(d)).toEqual([0, 2]);
  });

  it("insists on the smallest whole numbers: a doubled balanced equation is not accepted", () => {
    const d = def(["H2", "O2"], ["H2O"]);
    expect(ch.tally(d, [4, 2, 4]).every((r) => r.left === r.right)).toBe(true);
    expect(ch.isSolved(d, [4, 2, 4])).toBe(false);
  });

  it("solves the harder shipped-style equations and the coefficients wrap 9 -> 1", () => {
    const propane = def(["C3H8", "O2"], ["CO2", "H2O"]);
    let v = ch.init(propane);
    for (const i of ch.solve(propane)!) v = ch.tap(propane, v, i)!;
    expect(v).toEqual([1, 5, 3, 4]);
    expect(ch.tap(propane, [9, 1, 1, 1], 0)![0]).toBe(1);
  });

  it("rejects equations whose sides have different elements, or unreadable formulas", () => {
    expect(ch.validate(def(["H2", "O2"], ["H2O"]))).toEqual([]);
    expect(ch.validate(def(["H2", "O2"], ["CO2"]))).not.toEqual([]);
    expect(ch.validate(def(["Zz9("], ["H2O", "O2"]))).not.toEqual([]);
    expect(ch.validate(def(["H2"], ["H2"]))).not.toEqual([]);
  });
});

describe("translation by deduction", () => {
  const base = (): TranslationDef => ({
    id: "t", kind: "translation",
    examples: [
      { foreign: ["ka", "mi"], english: ["fox", "eats"] },
      { foreign: ["ka", "no"], english: ["fox", "sees"] },
      { foreign: ["no", "va"], english: ["sees", "bird"] },
      { foreign: ["mi", "va"], english: ["eats", "bird"] },
    ],
    target: ["va", "mi"], choices: [["bird", "fox"], ["eats", "sees"]],
  });

  it("finds the one dictionary the examples allow and translates the target from it", () => {
    expect(tr.dictionaries(base())).toHaveLength(1);
    expect(tr.answer(base())).toEqual(["bird", "eats"]);
    expect(tr.validate(base())).toEqual([]);
  });

  it("rejects examples that leave a word ambiguous, or that contradict each other", () => {
    const [e0] = base().examples;
    // "ka" and "mi" always appear together, so nothing says which is "fox" and which is "eats".
    const ambiguous: TranslationDef = { ...base(), examples: [e0!, e0!, e0!], target: ["ka", "mi"], choices: [["fox", "eats"], ["eats", "sees"]] };
    expect(tr.validate(ambiguous)).toEqual(expect.arrayContaining([expect.stringContaining("do not pin down")]));
    const clash: TranslationDef = { ...base(), examples: [...base().examples, { foreign: ["ka", "va"], english: ["fox", "eats"] }] };
    expect(tr.validate(clash)).toEqual(expect.arrayContaining([expect.stringContaining("contradict")]));
  });

  it("requires the right answer among the choices, and target words that occur in the examples", () => {
    expect(tr.validate({ ...base(), choices: [["fox", "eats"], ["eats", "sees"]] })).not.toEqual([]);
    expect(tr.validate({ ...base(), target: ["va", "zz"] })).not.toEqual([]);
    expect(tr.validate({ ...base(), choices: [["bird"], ["eats", "sees"]] })).not.toEqual([]);
  });

  it("choices cycle; solved only by the deduced words; the solver reaches them", () => {
    const d = base();
    expect(tr.tap(d, [0, 0], 0)).toEqual([1, 0]);
    expect(tr.tap(d, [1, 0], 0)).toEqual([0, 0]);
    expect(tr.isSolved(d, [0, 0])).toBe(true);
    expect(tr.isSolved(d, [1, 0])).toBe(false);
    expect(tr.solve(d, [1, 1])).toEqual([0, 1]);
  });
});

describe("melody", () => {
  const def = (over: Partial<MelodyDef> = {}): MelodyDef => ({
    id: "m", kind: "melody", root: 60, scale: "major", length: 5, fixed: { "0": 0, "2": 7 },
    rules: { inScale: true, endOnTonic: true, maxLeap: 5, arch: true, noRepeats: true }, ...over,
  });

  it("checks each rule on its own so the player can see which fail", () => {
    const d = def();
    const names = (v: number[]) => ml(d, v).filter((c) => !c.ok).map((c) => c.text.split(" ")[0]);
    expect(ml(d, [0, 4, 7, 4, 0]).every((c) => c.ok)).toBe(true);
    expect(names([0, 3, 7, 4, 0])).toEqual(["Every"]); // D# is not in C major
    expect(names([0, 4, 7, 4, 2])).toContain("The"); // does not end on the tonic
    expect(ml(d, [0, 4, 7, 4, 0]).length).toBe(5);
    function ml(dd: MelodyDef, v: number[]) { return me.check(dd, v); }
  });

  it("notes raise a semitone and wrap after an octave; fixed notes stay", () => {
    const d = def();
    expect(me.tap(d, [0, 12, 7, 0, 0], 1)).toEqual([0, 0, 7, 0, 0]);
    expect(me.tap(d, me.init(d), 0)).toBeNull();
    expect(me.tap(d, me.init(d), 2)).toBeNull();
  });

  it("the solver finds a legal tune, which then satisfies every rule; an impossible rule set has none", () => {
    const d = def();
    let v = me.init(d);
    for (const i of me.solve(d)!) v = me.tap(d, v, i)!;
    expect(me.isSolved(d, v)).toBe(true);
    expect(me.solve(def({ rules: { maxLeap: 1, arch: true }, fixed: { "0": 0, "1": 12 } }))).toBeNull();
  });

  it("names notes and offers them to the client to play", () => {
    expect(me.noteName(60)).toBe("C4");
    expect(me.noteName(61)).toBe("C♯4");
    const view = me.view(def(), me.init(def()));
    expect(view.play).toEqual([60, 60, 67, 60, 60]);
    expect(view.rows[0]!.controls[1]!.midi).toBe(60);
  });

  it("validates ranges", () => {
    expect(me.validate(def())).toEqual([]);
    expect(me.validate(def({ length: 2 }))).not.toEqual([]);
    expect(me.validate(def({ fixed: { "9": 3 } }))).not.toEqual([]);
    expect(me.validate(def({ rules: {} }))).not.toEqual([]);
  });
});

describe("neural network", () => {
  const def: NeuralNetDef = { id: "ring", kind: "neural_net", budget: 7, threshold: 0.87, noise: 0.1, seeds: { train: 11, test: 99, init: 7 } };

  it("is deterministic: the same sizes always score the same, built only from exact arithmetic", () => {
    const a = nn.train({ ...def, id: "a1" }, [4, 3]);
    const b = nn.train({ ...def, id: "a2" }, [4, 3]);
    expect([a.train, a.test]).toEqual([b.train, b.test]);
    expect(a.test).toBe(0.87);
  });

  it("too small a network underfits, and enough neurons pass", () => {
    expect(nn.isSolved(def, [1, 1])).toBe(false);
    expect(nn.train(def, [1, 1]).test).toBeLessThan(0.7);
    expect(nn.isSolved(def, [4, 3])).toBe(true);
  });

  it("the budget is a hard limit: a network that would pass but needs too many neurons does not", () => {
    expect(nn.isSolved({ ...def, budget: 6 }, [4, 3])).toBe(false);
    expect(nn.isSolved(def, [0, 0])).toBe(false);
  });

  it("a one-neuron layer is a bottleneck even in a wide network", () => {
    expect(nn.train(def, [1, 6]).test).toBeLessThan(nn.train(def, [0, 6]).test);
  });

  it("the solver finds a passing configuration within budget, and the tap sequence reaches it", () => {
    const taps = nn.solve(def)!;
    let v = nn.init();
    for (const i of taps) v = nn.tap(def, v, i)!;
    expect(nn.isSolved(def, v)).toBe(true);
    expect(v[0]! + v[1]!).toBeLessThanOrEqual(def.budget);
    expect(nn.passing(def)).toContainEqual([4, 3]);
  });

  it("sizes wrap after 8 and only two controls exist", () => {
    expect(nn.tap(def, [8, 1], 0)).toEqual([0, 1]);
    expect(nn.tap(def, [1, 1], 2)).toBeNull();
  });

  it("the view reports accuracy, the layer shape and a map of decisions, and warns when over budget", () => {
    const v = nn.view(def, [4, 3]);
    expect(v.lines[0]!.text).toBe("2 inputs  →  4 neurons  →  3 neurons  →  1 output");
    expect(v.plot!.cells).toHaveLength(400);
    expect(v.status).toContain("87%");
    expect(nn.view(def, [8, 8]).status).toContain("Over budget");
  });

  it("validates its settings", () => {
    expect(nn.validate(def)).toEqual([]);
    expect(nn.validate({ ...def, threshold: 0.3 })).not.toEqual([]);
    expect(nn.validate({ ...def, budget: 99 })).not.toEqual([]);
    expect(nn.validate({ ...def, noise: 0.9 })).not.toEqual([]);
  });
});
