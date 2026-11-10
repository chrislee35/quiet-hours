/**
 * The puzzle registry (T2.11). Every puzzle type is a pure module with the same shape, so terminals, the
 * solvability checks and the client treat them alike:
 *   init(def) -> values       the starting state, a vector of whole numbers the type understands
 *   tap(def, values, i)       what tapping cell/switch/track i does (a new vector, or null if nothing happens)
 *   isSolved(def, values)     solved?
 *   solve(def, values)        the fewest taps that solve it, or null if none can (used at build time)
 *   view(def, values)         what the client draws
 */
import * as arithmetic from "./arithmetic.ts";
import * as chemBalance from "./chem-balance.ts";
import * as cipher from "./cipher.ts";
import * as codeLock from "./code-lock.ts";
import * as lightsOut from "./lights-out.ts";
import * as logicCircuit from "./logic-circuit.ts";
import * as magicSquare from "./magic-square.ts";
import * as melody from "./melody.ts";
import * as neuralNet from "./neural-net.ts";
import * as powerRouting from "./power-routing.ts";
import * as ruleContradiction from "./rule-contradiction.ts";
import * as scheduleAlign from "./schedule-align.ts";
import * as signalPath from "./signal-path.ts";
import * as translation from "./translation.ts";
import type { BoardView } from "./board.ts";
import type { ArithmeticDef } from "./arithmetic.ts";
import type { ChemBalanceDef } from "./chem-balance.ts";
import type { CipherDef } from "./cipher.ts";
import type { MagicSquareDef } from "./magic-square.ts";
import type { MelodyDef } from "./melody.ts";
import type { NeuralNetDef } from "./neural-net.ts";
import type { TranslationDef } from "./translation.ts";
import type { CodeLockDef, CodeLockView } from "./code-lock.ts";
import type { LightsOutDef, LightsOutView } from "./lights-out.ts";
import type { LogicCircuitDef, LogicView } from "./logic-circuit.ts";
import type { RuleContradictionDef, RuleView } from "./rule-contradiction.ts";
import type { ScheduleAlignDef, ScheduleView } from "./schedule-align.ts";
import type { SignalCell, SignalPathDef } from "./signal-path.ts";

export type PowerRoutingDef = powerRouting.PuzzleDef;
export type PuzzleDef = PowerRoutingDef | SignalPathDef | ScheduleAlignDef | RuleContradictionDef | CodeLockDef | LightsOutDef | LogicCircuitDef
  | CipherDef | MagicSquareDef | ArithmeticDef | ChemBalanceDef | TranslationDef | MelodyDef | NeuralNetDef;
export type PuzzleKind = PuzzleDef["kind"];
export const PUZZLE_KINDS: readonly PuzzleKind[] = ["power_routing", "signal_path", "schedule_align", "rule_contradiction", "code_lock", "lights_out", "logic_circuit",
  "cipher", "magic_square", "arithmetic", "chem_balance", "translation", "melody", "neural_net",
];

export interface RoutingCell {
  piece: string;
  rotation: number;
  powered: boolean;
  isSource: boolean;
  isTarget: boolean;
}

export type PuzzleView =
  | { kind: "power_routing"; width: number; height: number; cells: RoutingCell[] }
  | ({ kind: "signal_path"; width: number; height: number; cells: SignalCell[] })
  | ({ kind: "schedule_align" } & ScheduleView)
  | ({ kind: "rule_contradiction" } & RuleView)
  | ({ kind: "code_lock" } & CodeLockView)
  | ({ kind: "lights_out" } & LightsOutView)
  | ({ kind: "logic_circuit" } & LogicView)
  | BoardView;

export interface PuzzleModule {
  validate(def: PuzzleDef): string[];
  init(def: PuzzleDef): number[];
  tap(def: PuzzleDef, values: readonly number[], index: number): number[] | null;
  isSolved(def: PuzzleDef, values: readonly number[]): boolean;
  solve(def: PuzzleDef, values: readonly number[]): number[] | null;
  view(def: PuzzleDef, values: readonly number[]): PuzzleView;
}

const routing: PuzzleModule = {
  validate: (d) => powerRouting.validatePuzzleDef(d as PowerRoutingDef),
  init: (d) => powerRouting.init(d as PowerRoutingDef).rotations,
  tap: (d, v, i) => powerRouting.rotate(d as PowerRoutingDef, { rotations: [...v] }, i)?.rotations ?? null,
  isSolved: (d, v) => powerRouting.isSolved(d as PowerRoutingDef, { rotations: [...v] }),
  solve: (d, v) => powerRouting.solve(d as PowerRoutingDef, { rotations: [...v] }),
  view: (d, v) => {
    const def = d as PowerRoutingDef;
    const lit = powerRouting.powered(def, { rotations: [...v] });
    return {
      kind: "power_routing",
      width: def.width,
      height: def.height,
      cells: v.map((rotation, i) => ({
        piece: powerRouting.pieceAt(def, i),
        rotation,
        powered: lit.has(i),
        isSource: def.source[1] * def.width + def.source[0] === i,
        isTarget: def.targets.some(([x, y]) => y * def.width + x === i),
      })),
    };
  },
};

const signal: PuzzleModule = {
  validate: (d) => signalPath.validate(d as SignalPathDef),
  init: (d) => signalPath.init(d as SignalPathDef),
  tap: (d, v, i) => signalPath.tap(d as SignalPathDef, v, i),
  isSolved: (d, v) => signalPath.isSolved(d as SignalPathDef, v),
  solve: (d, v) => signalPath.solve(d as SignalPathDef, v),
  view: (d, v) => ({ kind: "signal_path", width: (d as SignalPathDef).width, height: (d as SignalPathDef).height, ...signalPath.view(d as SignalPathDef, v) }),
};

const schedule: PuzzleModule = {
  validate: (d) => scheduleAlign.validate(d as ScheduleAlignDef),
  init: (d) => scheduleAlign.init(d as ScheduleAlignDef),
  tap: (d, v, i) => scheduleAlign.tap(d as ScheduleAlignDef, v, i),
  isSolved: (d, v) => scheduleAlign.isSolved(d as ScheduleAlignDef, v),
  solve: (d, v) => scheduleAlign.solve(d as ScheduleAlignDef, v),
  view: (d, v) => ({ kind: "schedule_align", ...scheduleAlign.view(d as ScheduleAlignDef, v) }),
};

const rules: PuzzleModule = {
  validate: (d) => ruleContradiction.validate(d as RuleContradictionDef),
  init: (d) => ruleContradiction.init(d as RuleContradictionDef),
  tap: (d, v, i) => ruleContradiction.tap(d as RuleContradictionDef, v, i),
  isSolved: (d, v) => ruleContradiction.isSolved(d as RuleContradictionDef, v),
  solve: (d, v) => ruleContradiction.solve(d as RuleContradictionDef, v),
  view: (d, v) => ({ kind: "rule_contradiction", ...ruleContradiction.view(d as RuleContradictionDef, v) }),
};

const lock: PuzzleModule = {
  validate: (d) => codeLock.validate(d as CodeLockDef),
  init: (d) => codeLock.init(d as CodeLockDef),
  tap: (d, v, i) => codeLock.tap(d as CodeLockDef, v, i),
  isSolved: (d, v) => codeLock.isSolved(d as CodeLockDef, v),
  solve: (d, v) => codeLock.solve(d as CodeLockDef, v),
  view: (d, v) => ({ kind: "code_lock", ...codeLock.view(d as CodeLockDef, v) }),
};

const fuses: PuzzleModule = {
  validate: (d) => lightsOut.validate(d as LightsOutDef),
  init: (d) => lightsOut.init(d as LightsOutDef),
  tap: (d, v, i) => lightsOut.tap(d as LightsOutDef, v, i),
  isSolved: (d, v) => lightsOut.isSolved(d as LightsOutDef, v),
  solve: (d, v) => lightsOut.solve(d as LightsOutDef, v),
  view: (d, v) => ({ kind: "lights_out", ...lightsOut.view(d as LightsOutDef, v) }),
};

const circuit: PuzzleModule = {
  validate: (d) => logicCircuit.validate(d as LogicCircuitDef),
  init: (d) => logicCircuit.init(d as LogicCircuitDef),
  tap: (d, v, i) => logicCircuit.tap(d as LogicCircuitDef, v, i),
  isSolved: (d, v) => logicCircuit.isSolved(d as LogicCircuitDef, v),
  solve: (d, v) => logicCircuit.solve(d as LogicCircuitDef, v),
  view: (d, v) => ({ kind: "logic_circuit", ...logicCircuit.view(d as LogicCircuitDef, v) }),
};

/** Adapts a module whose functions take its own definition type, and whose view is a BoardView. */
function board<D>(m: {
  validate(d: D): string[]; init(d: D): number[]; tap(d: D, v: readonly number[], i: number): number[] | null;
  isSolved(d: D, v: readonly number[]): boolean; solve(d: D, v: readonly number[]): number[] | null; view(d: D, v: readonly number[]): BoardView;
}): PuzzleModule {
  return {
    validate: (d) => m.validate(d as unknown as D),
    init: (d) => m.init(d as unknown as D),
    tap: (d, v, i) => m.tap(d as unknown as D, v, i),
    isSolved: (d, v) => m.isSolved(d as unknown as D, v),
    solve: (d, v) => m.solve(d as unknown as D, v),
    view: (d, v) => m.view(d as unknown as D, v),
  };
}

const MODULES: Record<PuzzleKind, PuzzleModule> = {
  cipher: board<CipherDef>(cipher),
  magic_square: board<MagicSquareDef>(magicSquare),
  arithmetic: board<ArithmeticDef>(arithmetic),
  chem_balance: board<ChemBalanceDef>(chemBalance),
  translation: board<TranslationDef>(translation),
  melody: board<MelodyDef>(melody),
  neural_net: board<NeuralNetDef>(neuralNet),
  power_routing: routing, signal_path: signal, schedule_align: schedule, rule_contradiction: rules,
  code_lock: lock, lights_out: fuses, logic_circuit: circuit,
};

/** The module for a puzzle definition, or undefined for an unknown kind. */
export function puzzleModule(def: { kind: string }): PuzzleModule | undefined {
  return (MODULES as Record<string, PuzzleModule | undefined>)[def.kind];
}

export { powerRouting, signalPath, scheduleAlign, ruleContradiction, codeLock, lightsOut, logicCircuit, cipher, magicSquare, arithmetic, chemBalance, translation, melody, neuralNet };
export type { BoardView, BoardControl, BoardRow, BoardLine, BoardPlot } from "./board.ts";
export type { ArithmeticDef, ChemBalanceDef, CipherDef, MagicSquareDef, MelodyDef, NeuralNetDef, TranslationDef };
export type { RuleContradictionDef, ScheduleAlignDef, SignalPathDef, RuleView, ScheduleView, SignalCell, CodeLockDef, CodeLockView, LightsOutDef, LightsOutView, LogicCircuitDef, LogicView };
