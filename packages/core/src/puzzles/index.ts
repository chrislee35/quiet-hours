/**
 * The puzzle registry (T2.11). Every puzzle type is a pure module with the same shape, so terminals, the
 * solvability checks and the client treat them alike:
 *   init(def) -> values       the starting state, a vector of whole numbers the type understands
 *   tap(def, values, i)       what tapping cell/switch/track i does (a new vector, or null if nothing happens)
 *   isSolved(def, values)     solved?
 *   solve(def, values)        the fewest taps that solve it, or null if none can (used at build time)
 *   view(def, values)         what the client draws
 */
import * as powerRouting from "./power-routing.ts";
import * as ruleContradiction from "./rule-contradiction.ts";
import * as scheduleAlign from "./schedule-align.ts";
import * as signalPath from "./signal-path.ts";
import type { RuleContradictionDef, RuleView } from "./rule-contradiction.ts";
import type { ScheduleAlignDef, ScheduleView } from "./schedule-align.ts";
import type { SignalCell, SignalPathDef } from "./signal-path.ts";

export type PowerRoutingDef = powerRouting.PuzzleDef;
export type PuzzleDef = PowerRoutingDef | SignalPathDef | ScheduleAlignDef | RuleContradictionDef;
export type PuzzleKind = PuzzleDef["kind"];
export const PUZZLE_KINDS: readonly PuzzleKind[] = ["power_routing", "signal_path", "schedule_align", "rule_contradiction"];

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
  | ({ kind: "rule_contradiction" } & RuleView);

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

const MODULES: Record<PuzzleKind, PuzzleModule> = { power_routing: routing, signal_path: signal, schedule_align: schedule, rule_contradiction: rules };

/** The module for a puzzle definition, or undefined for an unknown kind. */
export function puzzleModule(def: { kind: string }): PuzzleModule | undefined {
  return (MODULES as Record<string, PuzzleModule | undefined>)[def.kind];
}

export { powerRouting, signalPath, scheduleAlign, ruleContradiction };
export type { RuleContradictionDef, ScheduleAlignDef, SignalPathDef, RuleView, ScheduleView, SignalCell };
