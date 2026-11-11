/**
 * Logic-circuit puzzle (HAK-2): switches feed a small network of gates, and some lamps must end up on (or off).
 * Set the switches so every goal is met. Gates are listed in order and may read switches or earlier gates, so the
 * circuit has no loops. Values vector: the switches, in order (0/1).
 */
export type GateOp = "AND" | "OR" | "NOT" | "XOR" | "NAND" | "NOR";

export interface LogicCircuitDef {
  id: string;
  kind: "logic_circuit";
  inputs: { id: string; name: string; value?: boolean; locked?: boolean }[];
  /** Each gate reads two inputs (one for NOT), each the id of a switch or an earlier gate. */
  gates: { id: string; op: GateOp; in: string[] }[];
  /** Each goal wants a gate (or switch) to have a value. */
  goals: { name: string; node: string; want: boolean }[];
}

const OPS: readonly GateOp[] = ["AND", "OR", "NOT", "XOR", "NAND", "NOR"];

export function validate(def: LogicCircuitDef): string[] {
  const errors: string[] = [];
  if (def.inputs.length < 1 || def.inputs.length > 12) errors.push("needs 1 to 12 switches");
  const known = new Set<string>();
  for (const i of def.inputs) {
    if (known.has(i.id)) errors.push(`duplicate id "${i.id}"`);
    known.add(i.id);
  }
  for (const g of def.gates) {
    if (!OPS.includes(g.op)) errors.push(`gate "${g.id}" has unknown operation "${g.op}"`);
    if (g.in.length !== (g.op === "NOT" ? 1 : 2)) errors.push(`gate "${g.id}" (${g.op}) needs ${g.op === "NOT" ? 1 : 2} input(s)`);
    for (const r of g.in) if (!known.has(r)) errors.push(`gate "${g.id}" reads "${r}", which is not a switch or an earlier gate`);
    if (known.has(g.id)) errors.push(`duplicate id "${g.id}"`);
    known.add(g.id);
  }
  if (def.goals.length === 0) errors.push("needs at least one goal");
  for (const goal of def.goals) if (!known.has(goal.node)) errors.push(`goal "${goal.name}" reads unknown node "${goal.node}"`);
  return errors;
}

export function init(def: LogicCircuitDef): number[] {
  return def.inputs.map((i) => (i.value ? 1 : 0));
}

export function tap(def: LogicCircuitDef, values: readonly number[], index: number): number[] | null {
  const i = def.inputs[index];
  if (!i || i.locked) return null;
  const next = values.slice();
  next[index] = (next[index] ?? 0) === 1 ? 0 : 1;
  return next;
}

/** Every node's value (switches and gates) under these switch settings. */
export function evaluate(def: LogicCircuitDef, values: readonly number[]): Record<string, boolean> {
  const v: Record<string, boolean> = {};
  def.inputs.forEach((i, k) => { v[i.id] = values[k] === 1; });
  for (const g of def.gates) {
    const a = v[g.in[0]!] ?? false;
    const b = v[g.in[1] ?? g.in[0]!] ?? false;
    v[g.id] = { AND: a && b, OR: a || b, NOT: !a, XOR: a !== b, NAND: !(a && b), NOR: !(a || b) }[g.op];
  }
  return v;
}

export function isSolved(def: LogicCircuitDef, values: readonly number[]): boolean {
  const v = evaluate(def, values);
  return def.goals.every((g) => v[g.node] === g.want);
}

export function solve(def: LogicCircuitDef, from: readonly number[] = init(def)): number[] | null {
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

export interface LogicView {
  inputs: { index: number; name: string; value: boolean; locked: boolean }[];
  /** `reads` are the switches or gates it takes in; `feeds` are the gates and lamps it sends its value to. */
  gates: { id: string; op: GateOp; reads: string[]; feeds: string[]; value: boolean }[];
  /** `node` is the gate (or switch) the lamp is wired to; `chain` writes out how its value is made, with every value filled in. */
  goals: { name: string; node: string; want: boolean; value: boolean; met: boolean; chain: string }[];
}

export function view(def: LogicCircuitDef, values: readonly number[]): LogicView {
  const v = evaluate(def, values);
  const short = (id: string) => def.inputs.find((i) => i.id === id)?.name.replace(/^Switch /, "").replace(/ \(fixed\)$/, "") ?? id;
  const word = (on: boolean) => (on ? "ON" : "off");
  /** "AND(XOR(A=ON, B=off)=ON, NOT(...)=off)=off": the whole tree under a node, with each value. */
  const expand = (id: string): string => {
    const g = def.gates.find((x) => x.id === id);
    if (!g) return `${short(id)}=${word(v[id] ?? false)}`;
    return `${g.op}(${g.in.map(expand).join(", ")})=${word(v[id] ?? false)}`;
  };
  const feeds = (id: string): string[] => [
    ...def.gates.filter((g) => g.in.includes(id)).map((g) => g.id),
    ...def.goals.filter((g) => g.node === id).map((g) => `${g.name} lamp`),
  ];
  return {
    inputs: def.inputs.map((i, index) => ({ index, name: i.name, value: values[index] === 1, locked: i.locked === true })),
    gates: def.gates.map((g) => ({ id: g.id, op: g.op, reads: g.in.map(short), feeds: feeds(g.id), value: v[g.id] ?? false })),
    goals: def.goals.map((g) => ({ name: g.name, node: g.node, want: g.want, value: v[g.node] ?? false, met: v[g.node] === g.want, chain: expand(g.node) })),
  };
}
