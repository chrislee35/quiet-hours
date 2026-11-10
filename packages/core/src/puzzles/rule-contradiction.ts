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

export interface RuleView {
  inputs: { index: number; name: string; value: boolean; locked: boolean }[];
  rules: { text: string; applies: boolean }[];
  outputs: { name: string; forced: Forced }[];
  goal: string | null;
}

export function view(def: RuleContradictionDef, values: readonly number[]): RuleView {
  const f = forced(def, values);
  return {
    inputs: def.inputs.map((i, index) => ({ index, name: i.name, value: values[index] === 1, locked: i.locked === true })),
    rules: def.rules.map((r) => ({ text: r.text, applies: applies(def, values, r) })),
    outputs: def.outputs.map((o) => ({ name: o.name, forced: f[o.id] ?? "none" })),
    goal: def.goal === undefined ? null : (def.outputs.find((o) => o.id === def.goal)?.name ?? def.goal),
  };
}
