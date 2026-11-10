/**
 * Neural-network puzzle (HAK-2, machine learning). A controller must tell "inside" from "outside" for points on a
 * map (a ring). Size its two hidden layers: the game trains the network on the labelled readings (some of which are
 * wrong: noisy sensors) and then tests it on clean held-out readings. Every neuron draws power from a fixed budget.
 * Pass by reaching the accuracy threshold on the held-out points within the budget.
 *
 * Fairness and determinism: training uses only exact arithmetic (+ - x /, comparisons, square root of a constant)
 * and a seeded integer generator, never exp or tanh, so every browser computes bit-identical results and the same
 * sizes always give the same score. The network is leaky-ReLU (so no neuron "dies"), trained by plain full-batch
 * gradient descent. A hidden layer of size 0 is skipped; a layer of one neuron is a bottleneck, which is part of
 * the lesson. Results are cached per (puzzle, sizes). Values vector: the size of layer 1 and layer 2 (0-8).
 */
import type { BoardView } from "./board.ts";

export interface NeuralNetDef {
  id: string;
  kind: "neural_net";
  /** Total neurons the controller can power (layer 1 + layer 2). */
  budget: number;
  /** Held-out accuracy needed, 0-1. */
  threshold: number;
  /** Fraction of training labels that are wrong (noisy sensors). */
  noise: number;
  /** Seeds for the training data, the test data and the weight initialisation. */
  seeds: { train: number; test: number; init: number };
  /** Number of training and test points (default 40 and 100). */
  trainPoints?: number;
  testPoints?: number;
  /** Training steps and learning rate (defaults 1000 and 0.05). */
  epochs?: number;
  rate?: number;
  hint?: string;
}

interface Pt { x: number; y: number; t: number }
const MAX = 8;
const LEAK = 0.1;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** The map: points inside the ring (radius^2 < 0.45) are class +1, the rest -1. `noise` flips labels. */
function makeData(seed: number, n: number, noise: number): Pt[] {
  const r = lcg(seed);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const x = r() * 2 - 1;
    const y = r() * 2 - 1;
    let t = x * x + y * y < 0.45 ? 1 : -1;
    if (r() < noise) t = -t;
    pts.push({ x, y, t });
  }
  return pts;
}

export interface Trained {
  train: number;
  test: number;
  predict: (x: number, y: number) => number;
}

const cache = new Map<string, Trained>();

export function train(def: NeuralNetDef, sizes: readonly number[]): Trained {
  const key = `${def.id}|${def.budget}|${def.threshold}|${def.noise}|${JSON.stringify(def.seeds)}|${def.trainPoints}|${def.testPoints}|${def.epochs}|${def.rate}|${sizes.join(",")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const tr = makeData(def.seeds.train, def.trainPoints ?? 40, def.noise);
  const te = makeData(def.seeds.test, def.testPoints ?? 100, 0);
  const dims = [2, ...sizes.filter((s) => s > 0), 1];
  const r = lcg(def.seeds.init);
  const W = dims.slice(1).map((out, l) => Array.from({ length: out }, () => Array.from({ length: dims[l]! }, () => (r() * 2 - 1) * Math.sqrt(2 / dims[l]!))));
  const B = dims.slice(1).map((out, l) => new Array<number>(out).fill(l === dims.length - 2 ? 0 : 0.3));
  const forward = (x: number, y: number): number[][] => {
    const acts: number[][] = [[x, y]];
    for (let l = 0; l < W.length; l++) {
      const prev = acts[l]!;
      const last = l === W.length - 1;
      acts.push(W[l]!.map((w, j) => {
        let s = B[l]![j]!;
        for (let k = 0; k < w.length; k++) s += w[k]! * prev[k]!;
        return last || s > 0 ? s : LEAK * s;
      }));
    }
    return acts;
  };
  const rate = def.rate ?? 0.05;
  for (let e = 0; e < (def.epochs ?? 1000); e++) {
    const gW = W.map((m) => m.map((row) => row.map(() => 0)));
    const gB = B.map((b) => b.map(() => 0));
    for (const p of tr) {
      const acts = forward(p.x, p.y);
      let delta = [(2 * (acts[acts.length - 1]![0]! - p.t)) / tr.length];
      for (let l = W.length - 1; l >= 0; l--) {
        const prev = acts[l]!;
        const back = new Array<number>(prev.length).fill(0);
        for (let j = 0; j < W[l]!.length; j++) {
          gB[l]![j]! += delta[j]!;
          for (let k = 0; k < prev.length; k++) {
            gW[l]![j]![k]! += delta[j]! * prev[k]!;
            back[k]! += delta[j]! * W[l]![j]![k]!;
          }
        }
        if (l > 0) delta = back.map((d, k) => (acts[l]![k]! > 0 ? d : LEAK * d));
      }
    }
    for (let l = 0; l < W.length; l++) {
      for (let j = 0; j < W[l]!.length; j++) {
        B[l]![j]! -= rate * gB[l]![j]!;
        for (let k = 0; k < W[l]![j]!.length; k++) W[l]![j]![k]! -= rate * gW[l]![j]![k]!;
      }
    }
  }
  const predict = (x: number, y: number): number => (forward(x, y).at(-1)![0]! > 0 ? 1 : -1);
  const acc = (set: Pt[]): number => set.filter((p) => predict(p.x, p.y) === p.t).length / set.length;
  const result: Trained = { train: acc(tr), test: acc(te), predict };
  if (cache.size > 400) cache.clear();
  cache.set(key, result);
  return result;
}

const used = (v: readonly number[]): number => (v[0] ?? 0) + (v[1] ?? 0);

export function validate(def: NeuralNetDef): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(def.budget) || def.budget < 2 || def.budget > 2 * MAX) errors.push(`budget must be a whole number from 2 to ${2 * MAX}`);
  if (!(def.threshold > 0.5 && def.threshold <= 1)) errors.push("threshold must be above 0.5 and at most 1");
  if (!(def.noise >= 0 && def.noise < 0.4)) errors.push("noise must be from 0 to below 0.4");
  if (!def.seeds || ![def.seeds.train, def.seeds.test, def.seeds.init].every(Number.isInteger)) errors.push("seeds must be whole numbers");
  return errors;
}

export const init = (): number[] => [1, 1];

export function tap(_: NeuralNetDef, values: readonly number[], index: number): number[] | null {
  if (index !== 0 && index !== 1) return null;
  const next = values.slice();
  next[index] = ((next[index] ?? 0) + 1) % (MAX + 1);
  return next;
}

export function isSolved(def: NeuralNetDef, values: readonly number[]): boolean {
  return used(values) <= def.budget && used(values) > 0 && train(def, values).test >= def.threshold;
}

/** Fewest taps to any passing configuration within budget. */
export function solve(def: NeuralNetDef, from: readonly number[] = init()): number[] | null {
  let best: number[] | null = null;
  for (let a = 0; a <= MAX; a++) {
    for (let b = 0; b <= MAX; b++) {
      if (a + b > def.budget || !isSolved(def, [a, b])) continue;
      const taps = [...Array((a - (from[0] ?? 0) + MAX + 1) % (MAX + 1)).fill(0), ...Array((b - (from[1] ?? 0) + MAX + 1) % (MAX + 1)).fill(1)] as number[];
      if (best === null || taps.length < best.length) best = taps;
    }
  }
  return best;
}

/** Every passing configuration within budget (for validation and tuning). */
export function passing(def: NeuralNetDef): [number, number][] {
  const out: [number, number][] = [];
  for (let a = 0; a <= MAX; a++) for (let b = 0; b <= MAX; b++) if (a + b <= def.budget && isSolved(def, [a, b])) out.push([a, b]);
  return out;
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;

export function view(def: NeuralNetDef, v: readonly number[]): BoardView {
  const over = used(v) > def.budget;
  const t = used(v) > 0 ? train(def, v) : null;
  const cols = 20;
  const cells: number[] = [];
  if (t) for (let j = 0; j < cols; j++) for (let i = 0; i < cols; i++) cells.push(t.predict(((i + 0.5) / cols) * 2 - 1, ((j + 0.5) / cols) * 2 - 1));
  const tr = makeData(def.seeds.train, def.trainPoints ?? 40, def.noise);
  const te = makeData(def.seeds.test, def.testPoints ?? 100, 0);
  const shape = ["2 inputs", ...v.filter((s) => s > 0).map((s) => `${s} neurons`), "1 output"].join("  →  ");
  return {
    kind: "board",
    of: "neural_net",
    hint: `Size the two hidden layers so the controller tells inside from outside on held-out readings with at least ${pct(def.threshold)} accuracy, using no more than ${def.budget} neurons in total. A layer of 0 is skipped. Some training readings are wrong (noisy sensors), and one neuron in a layer is a bottleneck.${def.hint ? ` ${def.hint}` : ""}`,
    status: over ? `Over budget: ${used(v)} of ${def.budget} neurons. It will not power up.` : t ? `Held-out accuracy ${pct(t.test)} (needs ${pct(def.threshold)}). Power ${used(v)} of ${def.budget}.` : "Add some neurons.",
    rows: [
      { label: "Layer 1", controls: [{ index: 0, text: String(v[0] ?? 0), aria: `Layer 1 has ${v[0] ?? 0} neurons. Tap to add one (wraps to 0 after ${MAX}).`, tone: "on" }] },
      { label: "Layer 2", controls: [{ index: 1, text: String(v[1] ?? 0), aria: `Layer 2 has ${v[1] ?? 0} neurons. Tap to add one (wraps to 0 after ${MAX}).`, tone: "on" }] },
    ],
    lines: [
      { text: shape, tone: "mono" },
      ...(t ? [{ text: `Trained on ${tr.length} noisy readings: ${pct(t.train)} right. Tested on ${te.length} clean ones: ${pct(t.test)} right.`, tone: (t.test >= def.threshold && !over ? "good" : "bad") as "good" | "bad" }] : []),
    ],
    ...(t ? { plot: { cols, rows: cols, cells, points: [...tr.map((p) => ({ ...p, test: false })), ...te.slice(0, 30).map((p) => ({ ...p, test: true }))] } } : {}),
  };
}
