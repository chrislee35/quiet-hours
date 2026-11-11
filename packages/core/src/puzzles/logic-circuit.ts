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

export interface DiagramNode {
  id: string;
  kind: "switch" | "gate" | "lamp";
  /** Text drawn in the box: a switch's short name, a gate's operation, a lamp's name. */
  label: string;
  /** A gate's id shown as a small tag (g1...), also its lamp's wired-to gate. */
  tag: string;
  x: number;
  y: number;
  value: boolean;
  /** Switches: the control index a tap sends; fixed ones are null. */
  index: number | null;
  locked: boolean;
  /** Lamps: what it needs, and whether that is met. */
  want?: boolean;
  met?: boolean;
}

export interface DiagramWire {
  from: string;
  to: string;
  /** Which input slot of the target this wire plugs into (0 or 1). */
  slot: number;
  /** Whether the wire carries ON. */
  value: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A drawn circuit: switches on the left, gates in columns by depth, lamps on the right, wires between them. */
export interface Diagram {
  width: number;
  height: number;
  /** Box size, so the renderer and tests agree. */
  box: { w: number; h: number };
  nodes: DiagramNode[];
  wires: DiagramWire[];
}

export interface LogicView {
  diagram: Diagram;
  inputs: { index: number; name: string; value: boolean; locked: boolean }[];
  /** `reads` are the switches or gates it takes in; `feeds` are the gates and lamps it sends its value to. */
  gates: { id: string; op: GateOp; reads: string[]; feeds: string[]; value: boolean }[];
  /** `node` is the gate (or switch) the lamp is wired to; `chain` writes out how its value is made, with every value filled in. */
  goals: { name: string; node: string; want: boolean; value: boolean; met: boolean; chain: string }[];
}

const BOX = { w: 84, h: 34 };
const COL = 150;
const ROW = 56;
const PAD = 14;

/**
 * Lays the circuit out for drawing. A node's column is its depth (switches 0, a gate one more than its deepest
 * input, lamps one past the deepest gate); inside a column nodes are ordered by the average row of what feeds them
 * (the barycentre rule), which keeps most wires from crossing. Pure and deterministic.
 */
export function layout(def: LogicCircuitDef, values: readonly number[]): Diagram {
  const v = evaluate(def, values);
  const short = (id: string) => def.inputs.find((i) => i.id === id)?.name.replace(/^Switch /, "").replace(/ \(fixed\)$/, "") ?? id;
  const depth = new Map<string, number>();
  def.inputs.forEach((i) => depth.set(i.id, 0));
  def.gates.forEach((g) => depth.set(g.id, 1 + Math.max(...g.in.map((r) => depth.get(r) ?? 0))));
  const lampCol = 1 + Math.max(0, ...def.gates.map((g) => depth.get(g.id)!));
  type Raw = { id: string; kind: DiagramNode["kind"]; col: number; sources: string[] };
  const raws: Raw[] = [
    ...def.inputs.map((i) => ({ id: i.id, kind: "switch" as const, col: 0, sources: [] as string[] })),
    ...def.gates.map((g) => ({ id: g.id, kind: "gate" as const, col: depth.get(g.id)!, sources: g.in })),
    ...def.goals.map((g, k) => ({ id: `lamp${k}`, kind: "lamp" as const, col: lampCol, sources: [g.node] })),
  ];
  const row = new Map<string, number>();
  const columns = new Map<number, Raw[]>();
  for (const r of raws) columns.set(r.col, [...(columns.get(r.col) ?? []), r]);
  const tallest = Math.max(...[...columns.values()].map((c) => c.length));
  for (const col of [...columns.keys()].sort((a, b) => a - b)) {
    const list = columns.get(col)!;
    if (col > 0) {
      const bary = (r: Raw) => r.sources.reduce((s, id) => s + (row.get(id) ?? 0), 0) / Math.max(1, r.sources.length);
      list.sort((a, b) => bary(a) - bary(b));
    }
    // Centre the column vertically within the tallest one.
    const offset = (tallest - list.length) / 2;
    list.forEach((r, k) => row.set(r.id, offset + k));
  }
  const nodes: DiagramNode[] = raws.map((r) => {
    const p = { x: PAD + r.col * COL, y: PAD + (row.get(r.id) ?? 0) * ROW };
    if (r.kind === "switch") {
      const i = def.inputs.findIndex((x) => x.id === r.id);
      const sw = def.inputs[i]!;
      return { id: r.id, kind: "switch", label: short(r.id), tag: "", ...p, value: values[i] === 1, index: sw.locked ? null : i, locked: sw.locked === true };
    }
    if (r.kind === "gate") {
      const g = def.gates.find((x) => x.id === r.id)!;
      return { id: r.id, kind: "gate", label: g.op, tag: g.id, ...p, value: v[g.id] ?? false, index: null, locked: false };
    }
    const k = Number(r.id.slice(4));
    const goal = def.goals[k]!;
    return { id: r.id, kind: "lamp", label: goal.name, tag: goal.node, ...p, value: v[goal.node] ?? false, index: null, locked: false, want: goal.want, met: v[goal.node] === goal.want };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const wires: DiagramWire[] = [];
  for (const r of raws) {
    r.sources.forEach((src, slot) => {
      const from = byId.get(src)!;
      const to = byId.get(r.id)!;
      const n = r.sources.length;
      wires.push({
        from: src, to: r.id, slot, value: from.value,
        x1: from.x + BOX.w, y1: from.y + BOX.h / 2,
        x2: to.x, y2: to.y + (BOX.h * (slot + 1)) / (n + 1),
      });
    });
  }
  return { width: PAD * 2 + lampCol * COL + BOX.w, height: PAD * 2 + (tallest - 1) * ROW + BOX.h, box: BOX, nodes, wires };
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
    diagram: layout(def, values),
    inputs: def.inputs.map((i, index) => ({ index, name: i.name, value: values[index] === 1, locked: i.locked === true })),
    gates: def.gates.map((g) => ({ id: g.id, op: g.op, reads: g.in.map(short), feeds: feeds(g.id), value: v[g.id] ?? false })),
    goals: def.goals.map((g) => ({ name: g.name, node: g.node, want: g.want, value: v[g.node] ?? false, met: v[g.node] === g.want, chain: expand(g.node) })),
  };
}
