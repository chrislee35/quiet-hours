import type { Ctx } from "./ctx.ts";
import { puzzleModule, type PuzzleDef, type PuzzleView } from "./puzzles/index.ts";
import { applyEffects, evalAll } from "./rules.ts";
import type { SimState } from "./state.ts";
import type { Content } from "./dialogue/types.ts";

/**
 * Terminals (T1.9, HAK-1). Using one opens a puzzle session; the world is frozen while it is open (like a
 * conversation). Solving the puzzle, or already meeting the terminal's bypass conditions, gains access:
 * the terminal's `onSolve` effects run exactly once.
 */

export interface TerminalView {
  id: string;
  title: string;
  solved: boolean;
  /** Shown once access has been gained. */
  solvedText: string;
  /** What to draw: depends on the puzzle type (power routing, signal path, schedule, rules). */
  puzzle: PuzzleView;
}

export function terminalView(state: Readonly<SimState>, content: Content): TerminalView | null {
  const id = state.terminal;
  const def = id ? content.terminals[id] : undefined;
  const puzzle = def ? content.puzzles[def.puzzle] : undefined;
  const ts = id ? state.terminals[id] : undefined;
  const mod = puzzle ? puzzleModule(puzzle) : undefined;
  if (!id || !def || !puzzle || !ts || !mod) return null;
  return { id, title: def.title, solved: ts.solved, solvedText: def.solvedText, puzzle: mod.view(puzzle, ts.values) };
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
  const mod = puzzle ? puzzleModule(puzzle) : undefined;
  if (!def || !puzzle || !mod || state.terminal || state.conversation) return false;
  state.terminals[terminalId] ??= { values: mod.init(puzzle), solved: false };
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

/** Tap one cell, switch or track of the open puzzle. Invalid taps and already-solved terminals are ignored. */
export function tapCell(ctx: Ctx, index: number): void {
  const id = ctx.state.terminal;
  const puzzle = id ? puzzleFor(ctx, id) : undefined;
  const mod = puzzle ? puzzleModule(puzzle) : undefined;
  const ts = id ? ctx.state.terminals[id] : undefined;
  if (!id || !puzzle || !mod || !ts || ts.solved) return;
  const next = mod.tap(puzzle, ts.values, index);
  if (!next) return;
  ts.values = next;
  if (mod.isSolved(puzzle, next)) grantAccess(ctx, id, "puzzle");
}
