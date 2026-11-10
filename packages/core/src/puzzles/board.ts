/**
 * The generic "board" view (T2.11 extension): a puzzle presented as rows of buttons plus lines of text, and
 * optionally a small plot. Most "nerd" puzzles (ciphers, number puzzles, chemistry, languages, music, a tiny neural
 * network) are exactly that, so they share one client renderer and only supply logic. Every control is a real
 * button with an accessible label; colour tones are never the only signal because the lines say the same in words.
 */
export type Tone = "on" | "good" | "bad";

export interface BoardControl {
  /** What a tap sends (the puzzle's own control index). */
  index: number;
  text: string;
  aria: string;
  disabled?: boolean;
  tone?: Tone;
  /** If set, the client may sound this note (MIDI number) when the control is tapped. */
  midi?: number;
}

export interface BoardRow {
  label?: string;
  controls: BoardControl[];
}

export interface BoardLine {
  text: string;
  tone?: "good" | "bad" | "hint" | "mono";
}

export interface BoardPlot {
  cols: number;
  rows: number;
  /** Predicted class per cell, row-major: 1, -1 or 0. */
  cells: number[];
  /** Data points in [-1, 1] x [-1, 1]; `t` is the true class, `test` marks held-out points. */
  points: { x: number; y: number; t: number; test: boolean }[];
}

export interface BoardView {
  kind: "board";
  /** Which puzzle kind drew it (for styling and tests). */
  of: string;
  hint: string;
  status: string;
  rows: BoardRow[];
  lines: BoardLine[];
  plot?: BoardPlot;
  /** Notes (MIDI) the client can play in order with a Play button. */
  play?: number[];
}

export const subscript = (n: number): string => String(n).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]!);
