/**
 * Rule-contradiction puzzle (T2.11, HAK-2): MERIDIAN's rules each say "when these inputs hold, this output must be
 * so". Set the inputs so two rules that apply at once demand opposite things of the same output: the system cannot
 * decide, and the terminal opens. This is the game's recurring joke and weakness: contradictory rules and
 * unhandled edge cases. Values vector: the input switches, in order (0/1); `locked` inputs cannot be changed.
 */
export interface RuleInput {
  id: string;
  name: string;
  /** Starting value (default false). */
  value?: boolean;
  /** Fixed by the world, not the player (it is curfew; you are a robot). */
  locked?: boolean;
}

export interface RuleDef {
  id: string;
  /** The rule as MERIDIAN words it. */
  text: string;
  /** Every listed input must have this value for the rule to apply. */
  if: Record<string, boolean>;
  /** The outputs it forces. */
  then: Record<string, boolean>;
}

export interface RuleContradictionDef {
  id: string;
  kind: "rule_contradiction";
  inputs: RuleInput[];
  outputs: { id: string; name: string }[];
  rules: RuleDef[];
  /** The output that must be driven into contradiction; leave out for any output. */
  goal?: string;
}

export function validate(def: RuleContradictionDef): string[] {
  const errors: string[] = [];
  const inputs = new Set(def.inputs.map((i) => i.id));
  const outputs = new Set(def.outputs.map((o) => o.id));
  if (def.inputs.length < 1 || def.inputs.length > 12) errors.push("needs 1 to 12 inputs");
  if (inputs.size !== def.inputs.length) errors.push("duplicate input id");
  if (outputs.size !== def.outputs.length) errors.push("duplicate output id");
  if (def.rules.length < 2) errors.push("needs at least 2 rules");
  def.rules.forEach((r) => {
    for (const k of Object.keys(r.if)) if (!inputs.has(k)) errors.push(`rule "${r.id}" conditions on unknown input "${k}"`);
    for (const k of Object.keys(r.then)) if (!outputs.has(k)) errors.push(`rule "${r.id}" forces unknown output "${k}"`);
    if (Object.keys(r.then).length === 0) errors.push(`rule "${r.id}" forces nothing`);
  });
  if (def.goal !== undefined && !outputs.has(def.goal)) errors.push(`goal names unknown output "${def.goal}"`);
  return errors;
}

export function init(def: RuleContradictionDef): number[] {
  return def.inputs.map((i) => (i.value ? 1 : 0));
}

export function tap(def: RuleContradictionDef, values: readonly number[], index: number): number[] | null {
  const i = def.inputs[index];
  if (!i || i.locked) return null;
  const next = values.slice();
  next[index] = (next[index] ?? 0) === 1 ? 0 : 1;
  return next;
}

const applies = (def: RuleContradictionDef, values: readonly number[], r: RuleDef): boolean =>
  Object.entries(r.if).every(([id, want]) => (values[def.inputs.findIndex((i) => i.id === id)] === 1) === want);

export type Forced = "none" | "true" | "false" | "contradiction";

export function forced(def: RuleContradictionDef, values: readonly number[]): Record<string, Forced> {
  const out: Record<string, Forced> = Object.fromEntries(def.outputs.map((o) => [o.id, "none" as Forced]));
  for (const r of def.rules) {
    if (!applies(def, values, r)) continue;
    for (const [o, v] of Object.entries(r.then)) {
      const here: Forced = v ? "true" : "false";
      const was = out[o];
      out[o] = was === "none" || was === here ? here : "contradiction";
    }
  }
  return out;
}

export function isSolved(def: RuleContradictionDef, values: readonly number[]): boolean {
  const f = forced(def, values);
  return def.goal !== undefined ? f[def.goal] === "contradiction" : Object.values(f).includes("contradiction");
}

export function solve(def: RuleContradictionDef, from: readonly number[] = init(def)): number[] | null {
  const free = def.inputs.map((i, k) => (i.locked ? -1 : k)).filter((k) => k >= 0);
  if (free.length > 16) return null;
  let best: number[] | null = null;
  for (let mask = 0; mask < 1 << free.length; mask++) {
    const values = from.slice();
    const flips: number[] = [];
    free.forEach((k, b) => {
      if (mask & (1 << b)) {
        values[k] = (values[k] ?? 0) === 1 ? 0 : 1;
        flips.push(k);
      }
    });
    if ((best === null || flips.length < best.length) && isSolved(def, values)) best = flips;
  }
  return best;
}

export interface RuleNode {
  id: string;
  kind: "input" | "rule" | "output";
  /** Input and output: its name. Rule: its number ("Rule 1"). */
  label: string;
  /** Rules: the rule's wording, wrapped into short lines. */
  lines: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  /** The state in words: ON/off, applies/waiting, undecided/yes/no/CONTRADICTION. */
  state: string;
  /** Inputs that are on, rules that apply, outputs that have been decided. */
  active: boolean;
  /** Outputs in contradiction. */
  clash: boolean;
  /** Inputs: the control index a tap sends (null when fixed). */
  index: number | null;
  locked: boolean;
}

export interface RuleWire {
  from: string;
  to: string;
  /** What the wire says: an input wire "needs ON/off", an output wire "forces yes/no". */
  label: string;
  /** Input wires: the condition currently holds. Output wires: the rule applies, so the order is in force. */
  live: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** The drawing: inputs on the left, MERIDIAN's rules in the middle, its decisions on the right. */
export interface RuleDiagram {
  width: number;
  height: number;
  nodes: RuleNode[];
  wires: RuleWire[];
}

export interface RuleView {
  diagram: RuleDiagram;
  inputs: { index: number; name: string; value: boolean; locked: boolean }[];
  rules: { text: string; applies: boolean }[];
  outputs: { name: string; forced: Forced }[];
  goal: string | null;
}

/** Splits text into lines of at most `max` characters at word boundaries. */
export function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

const IN = { w: 132, h: 34 };
const RULE = { w: 236 };
const OUT = { w: 132, h: 40 };
const GAP_X = 70;
const PAD = 14;
const LINE_H = 14;

/**
 * Lays the rules out for drawing: inputs, rules, decisions in three columns, wires from each input to the rules
 * that test it, and from each rule to the output it forces. Pure and deterministic.
 */
export function layout(def: RuleContradictionDef, values: readonly number[]): RuleDiagram {
  const f = forced(def, values);
  const ruleLines = def.rules.map((r) => wrap(r.text, 34).slice(0, 4));
  const ruleH = ruleLines.map((l) => 28 + l.length * LINE_H);
  const ruleCol = PAD + IN.w + GAP_X;
  const outCol = ruleCol + RULE.w + GAP_X;
  const SP = 14;
  const rulesTotal = ruleH.reduce((s, h) => s + h, 0) + SP * (def.rules.length - 1);
  const colTotal = (n: number, h: number) => n * h + SP * (n - 1);
  const height = PAD * 2 + Math.max(rulesTotal, colTotal(def.inputs.length, IN.h + 12), colTotal(def.outputs.length, OUT.h + 12));
  const spread = (n: number, h: number, i: number) => {
    const gap = n > 1 ? (height - PAD * 2 - n * h) / (n - 1) : 0;
    return n > 1 ? PAD + i * (h + gap) : (height - h) / 2;
  };
  const nodes: RuleNode[] = [];
  def.inputs.forEach((inp, index) => {
    const on = values[index] === 1;
    nodes.push({ id: inp.id, kind: "input", label: inp.name, lines: [], x: PAD, y: spread(def.inputs.length, IN.h, index), w: IN.w, h: IN.h, state: on ? "ON" : "off", active: on, clash: false, index: inp.locked ? null : index, locked: inp.locked === true });
  });
  let y = PAD + (height - PAD * 2 - rulesTotal) / 2;
  def.rules.forEach((r, k) => {
    const applies = Object.entries(r.if).every(([id, want]) => (values[def.inputs.findIndex((i) => i.id === id)] === 1) === want);
    nodes.push({ id: `rule:${r.id}`, kind: "rule", label: `Rule ${k + 1}`, lines: ruleLines[k]!, x: ruleCol, y, w: RULE.w, h: ruleH[k]!, state: applies ? "applies" : "waiting", active: applies, clash: false, index: null, locked: false });
    y += ruleH[k]! + SP;
  });
  def.outputs.forEach((o, k) => {
    const s = f[o.id] ?? "none";
    nodes.push({ id: `out:${o.id}`, kind: "output", label: o.name, lines: [], x: outCol, y: spread(def.outputs.length, OUT.h, k), w: OUT.w, h: OUT.h, state: { none: "undecided", true: "yes", false: "no", contradiction: "CONTRADICTION" }[s], active: s !== "none", clash: s === "contradiction", index: null, locked: false });
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const wires: RuleWire[] = [];
  def.rules.forEach((r) => {
    const rule = byId.get(`rule:${r.id}`)!;
    const conds = Object.entries(r.if);
    conds.forEach(([id, want], k) => {
      const inp = byId.get(id)!;
      const holds = (values[def.inputs.findIndex((i) => i.id === id)] === 1) === want;
      wires.push({ from: id, to: rule.id, label: `needs ${want ? "ON" : "off"}`, live: holds, x1: inp.x + inp.w, y1: inp.y + inp.h / 2, x2: rule.x, y2: rule.y + (rule.h * (k + 1)) / (conds.length + 1) });
    });
    const thens = Object.entries(r.then);
    thens.forEach(([id, v], k) => {
      const out = byId.get(`out:${id}`)!;
      wires.push({ from: rule.id, to: out.id, label: v ? "forces yes" : "forces no", live: rule.active, x1: rule.x + rule.w, y1: rule.y + (rule.h * (k + 1)) / (thens.length + 1), x2: out.x, y2: out.y + out.h / 2 });
    });
  });
  return { width: outCol + OUT.w + PAD, height, nodes, wires };
}

export function view(def: RuleContradictionDef, values: readonly number[]): RuleView {
  const f = forced(def, values);
  return {
    diagram: layout(def, values),
    inputs: def.inputs.map((i, index) => ({ index, name: i.name, value: values[index] === 1, locked: i.locked === true })),
    rules: def.rules.map((r) => ({ text: r.text, applies: applies(def, values, r) })),
    outputs: def.outputs.map((o) => ({ name: o.name, forced: f[o.id] ?? "none" })),
    goal: def.goal === undefined ? null : (def.outputs.find((o) => o.id === def.goal)?.name ?? def.goal),
  };
}
