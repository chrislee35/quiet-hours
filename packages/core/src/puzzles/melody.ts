/**
 * Music puzzle (HAK-2): complete a short melody so it obeys a few rules of the key and shape. Each note is a
 * semitone offset above the root (0 = the root, 12 = the octave above); tapping raises a note one semitone and wraps.
 * The rules are checked and shown one by one, and the client can play the notes, but nothing depends on timing or
 * on a good ear. Values vector: the offset (0-12) of each note.
 */
import type { BoardView } from "./board.ts";

export interface MelodyRules {
  /** Every note belongs to the scale. */
  inScale?: boolean;
  /** The last note is the tonic (the root or its octave). */
  endOnTonic?: boolean;
  /** No jump bigger than this many semitones between neighbouring notes. */
  maxLeap?: number;
  /** The highest note is neither the first nor the last (the tune rises and falls). */
  arch?: boolean;
  /** No two neighbouring notes are the same. */
  noRepeats?: boolean;
}

export interface MelodyDef {
  id: string;
  kind: "melody";
  /** MIDI number of the root (60 = middle C). */
  root: number;
  scale: "major" | "minor";
  length: number;
  /** Notes that are given and cannot be changed: slot -> offset. */
  fixed: Record<string, number>;
  rules: MelodyRules;
}

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11, 12], minor: [0, 2, 3, 5, 7, 8, 10, 12] } as const;
const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
export const noteName = (midi: number): string => `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

export interface RuleCheck { text: string; ok: boolean }

export function check(def: MelodyDef, v: readonly number[]): RuleCheck[] {
  const r = def.rules;
  const scale: readonly number[] = SCALES[def.scale];
  const out: RuleCheck[] = [];
  if (r.inScale) out.push({ text: `Every note is in ${noteName(def.root).replace(/\d/g, "")} ${def.scale}`, ok: v.every((o) => scale.includes(o)) });
  if (r.endOnTonic) out.push({ text: "The last note is the tonic (home note)", ok: v[v.length - 1] === 0 || v[v.length - 1] === 12 });
  if (r.maxLeap !== undefined) out.push({ text: `No jump bigger than ${r.maxLeap} semitones`, ok: v.every((o, i) => i === 0 || Math.abs(o - v[i - 1]!) <= r.maxLeap!) });
  if (r.arch) {
    const top = Math.max(...v);
    const at = v.indexOf(top);
    out.push({ text: "The highest note is in the middle (it rises, then falls)", ok: at > 0 && at < v.length - 1 && v.filter((o) => o === top).length === 1 });
  }
  if (r.noRepeats) out.push({ text: "No note repeats right after itself", ok: v.every((o, i) => i === 0 || o !== v[i - 1]) });
  return out;
}

export function validate(def: MelodyDef): string[] {
  const errors: string[] = [];
  if (!["major", "minor"].includes(def.scale)) errors.push('scale must be "major" or "minor"');
  if (!Number.isInteger(def.length) || def.length < 3 || def.length > 6) errors.push("length must be 3 to 6 notes");
  if (!Number.isInteger(def.root) || def.root < 36 || def.root > 84) errors.push("root must be a MIDI note from 36 to 84");
  if (errors.length > 0) return errors;
  for (const [k, o] of Object.entries(def.fixed)) {
    if (!Number.isInteger(Number(k)) || Number(k) < 0 || Number(k) >= def.length) errors.push(`fixed note ${k} is outside the melody`);
    if (!Number.isInteger(o) || o < 0 || o > 12) errors.push(`fixed note ${k} must be an offset from 0 to 12`);
  }
  if (Object.keys(def.rules).length === 0) errors.push("needs at least one rule");
  return errors;
}

export function init(def: MelodyDef): number[] {
  return Array.from({ length: def.length }, (_, i) => def.fixed[String(i)] ?? 0);
}

export function tap(def: MelodyDef, values: readonly number[], index: number): number[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= def.length || def.fixed[String(index)] !== undefined) return null;
  const next = values.slice();
  next[index] = ((next[index] ?? 0) + 1) % 13;
  return next;
}

export const isSolved = (def: MelodyDef, v: readonly number[]): boolean => check(def, v).every((c) => c.ok);

export function solve(def: MelodyDef, from: readonly number[] = init(def)): number[] | null {
  const free = [...Array(def.length).keys()].filter((i) => def.fixed[String(i)] === undefined);
  const cur = init(def);
  let best: number[] | null = null;
  let nodes = 0;
  const go = (k: number): void => {
    if (nodes++ > 3_000_000) return;
    if (k === free.length) {
      if (!isSolved(def, cur)) return;
      const taps: number[] = [];
      free.forEach((i) => { for (let t = 0; t < (cur[i]! - (from[i] ?? 0) + 13) % 13; t++) taps.push(i); });
      if (best === null || taps.length < best.length) best = taps;
      return;
    }
    const i = free[k]!;
    for (let o = 0; o <= 12; o++) {
      cur[i] = o;
      // Prune on a leap that is already too big between two decided neighbours.
      const prev = i > 0 && (free.indexOf(i - 1) < k || def.fixed[String(i - 1)] !== undefined) ? cur[i - 1]! : null;
      if (def.rules.maxLeap !== undefined && prev !== null && Math.abs(o - prev) > def.rules.maxLeap) continue;
      go(k + 1);
    }
    cur[i] = from[i] ?? 0;
  };
  go(0);
  return best;
}

export function view(def: MelodyDef, v: readonly number[]): BoardView {
  const checks = check(def, v);
  return {
    kind: "board",
    of: "melody",
    hint: "Complete the melody so every rule below is met. Tap a note to raise it a semitone (it wraps after an octave). Use Play to hear it; the rules say the same in words.",
    status: `Rules met: ${checks.filter((c) => c.ok).length} of ${checks.length}`,
    rows: [{
      label: "Melody",
      controls: v.map((o, index) => ({
        index,
        text: noteName(def.root + o),
        aria: `Note ${index + 1} of ${v.length}: ${noteName(def.root + o)}${def.fixed[String(index)] !== undefined ? ", fixed" : ". Tap to raise a semitone"}`,
        disabled: def.fixed[String(index)] !== undefined,
        midi: def.root + o,
        ...(def.fixed[String(index)] !== undefined ? { tone: "on" as const } : {}),
      })),
    }],
    lines: checks.map((c) => ({ text: `${c.ok ? "✓" : "✗"} ${c.text}`, tone: c.ok ? ("good" as const) : ("bad" as const) })),
    play: v.map((o) => def.root + o),
  };
}
