import type { Ctx } from "./ctx.ts";
import { init, isSolved, pieceAt, powered, rotate, type PuzzleDef } from "./puzzles/power-routing.ts";
import { applyEffects, evalAll } from "./rules.ts";
import type { SimState } from "./state.ts";
import type { Content } from "./dialogue/types.ts";

/**
 * Terminals (T1.9, HAK-1). Using one opens a puzzle session; the world is frozen while it is open (like a
 * conversation). Solving the puzzle, or already meeting the terminal's bypass conditions, gains access:
 * the terminal's `onSolve` effects run exactly once.
 */

export interface TerminalCell {
  piece: string;
  rotation: number;
  powered: boolean;
  isSource: boolean;
  isTarget: boolean;
}

export interface TerminalView {
  id: string;
  title: string;
  width: number;
  height: number;
  cells: TerminalCell[];
  solved: boolean;
  /** Shown once access has been gained. */
  solvedText: string;
}

export function terminalView(state: Readonly<SimState>, content: Content): TerminalView | null {
  const id = state.terminal;
  const def = id ? content.terminals[id] : undefined;
  const puzzle = def ? content.puzzles[def.puzzle] : undefined;
  const ts = id ? state.terminals[id] : undefined;
  if (!id || !def || !puzzle || !ts) return null;
  const lit = powered(puzzle, { rotations: ts.rotations });
  const w = puzzle.width;
  const cells: TerminalCell[] = ts.rotations.map((rotation, i) => ({
    piece: pieceAt(puzzle, i),
    rotation,
    powered: lit.has(i),
    isSource: puzzle.source[1] * w + puzzle.source[0] === i,
    isTarget: puzzle.targets.some(([x, y]) => y * w + x === i),
  }));
  return { id, title: def.title, width: w, height: puzzle.height, cells, solved: ts.solved, solvedText: def.solvedText };
}

function puzzleFor(ctx: Ctx, terminalId: string): PuzzleDef | undefined {
  const def = ctx.content.terminals[terminalId];
  return def ? ctx.content.puzzles[def.puzzle] : undefined;
}

function grantAccess(ctx: Ctx, terminalId: string, via: "puzzle" | "bypass"): void {
  const { state, events, content } = ctx;
  const ts = state.terminals[terminalId];
  const def = content.terminals[terminalId];
  if (!ts || !def || ts.solved) return;
  ts.solved = true;
  events.push({ type: "TerminalSolved", tick: state.tick, terminalId, via });
  applyEffects(def.onSolve, state, events, ctx.config, ctx.content);
}

export function openTerminal(ctx: Ctx, terminalId: string): boolean {
  const { state, config, content, events } = ctx;
  const def = content.terminals[terminalId];
  const puzzle = puzzleFor(ctx, terminalId);
  if (!def || !puzzle || state.terminal || state.conversation) return false;
  state.terminals[terminalId] ??= { rotations: init(puzzle).rotations, solved: false };
  state.player.intent = { dx: 0, dy: 0, mode: "walk" };
  state.terminal = terminalId;
  events.push({ type: "TerminalOpened", tick: state.tick, terminalId });
  // An alternative way in (a code or pass the player already holds) skips the puzzle entirely.
  if (def.bypass.length > 0 && evalAll(def.bypass, state, config, ctx.content)) grantAccess(ctx, terminalId, "bypass");
  return true;
}

export function closeTerminal(ctx: Ctx): void {
  const { state, events } = ctx;
  if (!state.terminal) return;
  events.push({ type: "TerminalClosed", tick: state.tick, terminalId: state.terminal });
  state.terminal = null;
}

/** Quarter-turn one cell. Invalid cells and already-solved terminals are ignored. */
export function rotateCell(ctx: Ctx, index: number): void {
  const id = ctx.state.terminal;
  const puzzle = id ? puzzleFor(ctx, id) : undefined;
  const ts = id ? ctx.state.terminals[id] : undefined;
  if (!id || !puzzle || !ts || ts.solved) return;
  const next = rotate(puzzle, { rotations: ts.rotations }, index);
  if (!next) return;
  ts.rotations = next.rotations;
  if (isSolved(puzzle, next)) grantAccess(ctx, id, "puzzle");
}
