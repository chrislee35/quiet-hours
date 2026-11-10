/**
 * Language puzzle (HAK-2): translate a sentence in an unknown language by deduction. You are given example
 * sentences with their English glosses, but the glosses are *bags* of words with no alignment, so each foreign word
 * is pinned down by which sentences it appears in (as a detective would: "ka" is in all three of the ones that
 * mention rain). A definition is accepted only if the examples fix every word's meaning *uniquely* (exactly one
 * consistent one-to-one dictionary exists), so the answer can always be deduced and never guessed (PUZ-3).
 * Values vector: for each word of the target sentence, which of its candidate English words is chosen.
 */
import type { BoardView } from "./board.ts";

export interface TranslationDef {
  id: string;
  kind: "translation";
  /** Each example: the foreign words, and the English words they mean (an unordered bag). */
  examples: { foreign: string[]; english: string[] }[];
  /** The sentence to translate: foreign words, all of which occur in the examples. */
  target: string[];
  /** For each target word, the English words offered (the correct one is among them). */
  choices: string[][];
  hint?: string;
}

/** Every one-to-one dictionary (foreign -> English) consistent with all the examples. */
export function dictionaries(def: TranslationDef): Map<string, string>[] {
  const foreign = [...new Set(def.examples.flatMap((e) => e.foreign))];
  const english = [...new Set(def.examples.flatMap((e) => e.english))];
  const out: Map<string, string>[] = [];
  const map = new Map<string, string>();
  const used = new Set<string>();
  const consistent = (): boolean =>
    def.examples.every((ex) => {
      const mapped = ex.foreign.map((f) => map.get(f));
      if (mapped.some((m) => m === undefined)) return true; // not decided yet
      return mapped.length === ex.english.length && [...mapped].sort().join("|") === [...ex.english].sort().join("|");
    });
  const go = (i: number): void => {
    if (out.length > 1) return; // we only need to know "none, one, or several"
    if (i === foreign.length) {
      out.push(new Map(map));
      return;
    }
    for (const e of english) {
      if (used.has(e)) continue;
      map.set(foreign[i]!, e);
      used.add(e);
      if (consistent()) go(i + 1);
      used.delete(e);
      map.delete(foreign[i]!);
    }
  };
  go(0);
  return out;
}

/** The deduced English for each target word, or null if the examples do not fix a single dictionary. */
export function answer(def: TranslationDef): string[] | null {
  const d = dictionaries(def);
  if (d.length !== 1) return null;
  const words = def.target.map((w) => d[0]!.get(w));
  return words.every((w): w is string => w !== undefined) ? words : null;
}

export function validate(def: TranslationDef): string[] {
  const errors: string[] = [];
  if (def.examples.length < 3 || def.examples.length > 8) errors.push("needs 3 to 8 examples");
  if (def.target.length < 2 || def.target.length > 6) errors.push("the target needs 2 to 6 words");
  if (def.choices.length !== def.target.length) errors.push("choices needs one list per target word");
  if (errors.length > 0) return errors;
  const foreign = new Set(def.examples.flatMap((e) => e.foreign));
  def.target.forEach((w) => { if (!foreign.has(w)) errors.push(`"${w}" never appears in the examples`); });
  def.examples.forEach((e, i) => {
    if (e.foreign.length !== e.english.length) errors.push(`example ${i + 1} must gloss each foreign word with one English word`);
    if (new Set(e.foreign).size !== e.foreign.length || new Set(e.english).size !== e.english.length) errors.push(`example ${i + 1} repeats a word`);
  });
  if (errors.length > 0) return errors;
  const dicts = dictionaries(def);
  if (dicts.length === 0) return [...errors, "the examples contradict each other"];
  if (dicts.length > 1) return [...errors, "the examples do not pin down every word: more than one dictionary fits"];
  const ans = answer(def);
  if (!ans) return [...errors, "cannot translate the target"];
  ans.forEach((w, i) => { if (!def.choices[i]!.includes(w)) errors.push(`choices for word ${i + 1} must include the right answer`); });
  def.choices.forEach((c, i) => { if (c.length < 2 || c.length > 6 || new Set(c).size !== c.length) errors.push(`choices for word ${i + 1} must be 2 to 6 different words`); });
  return errors;
}

export const init = (def: TranslationDef): number[] => def.target.map(() => 0);

export function tap(def: TranslationDef, values: readonly number[], index: number): number[] | null {
  const c = def.choices[index];
  if (!c) return null;
  const next = values.slice();
  next[index] = ((next[index] ?? 0) + 1) % c.length;
  return next;
}

export function isSolved(def: TranslationDef, values: readonly number[]): boolean {
  const ans = answer(def);
  return ans !== null && ans.every((w, i) => def.choices[i]![values[i] ?? 0] === w);
}

export function solve(def: TranslationDef, from: readonly number[] = init(def)): number[] | null {
  const ans = answer(def);
  if (!ans) return null;
  const taps: number[] = [];
  ans.forEach((w, i) => {
    const c = def.choices[i]!;
    const want = c.indexOf(w);
    for (let t = 0; t < (want - (from[i] ?? 0) + c.length) % c.length; t++) taps.push(i);
  });
  return taps;
}

export function view(def: TranslationDef, values: readonly number[]): BoardView {
  const mine = def.target.map((_, i) => def.choices[i]![values[i] ?? 0]!);
  return {
    kind: "board",
    of: "translation",
    hint: `Work out what each foreign word means from the examples (the English is just a bag of words: use which sentences share which words), then translate the last sentence.${def.hint ? ` ${def.hint}` : ""}`,
    status: isSolved(def, values) ? "That is right." : "Not yet.",
    rows: [
      { label: "Translate", controls: def.target.flatMap((w, i) => [
        { index: -1, text: w, aria: `Foreign word ${w}`, disabled: true },
        { index: i, text: mine[i]!, aria: `Translation of ${w}: ${mine[i]}. Tap for the next option.`, tone: "on" as const },
      ]) },
    ],
    lines: [
      ...def.examples.map((e) => ({ text: `${e.foreign.join(" ")}   =   {${[...e.english].sort().join(", ")}}`, tone: "mono" as const })),
      { text: `${def.target.join(" ")}   →   ${mine.join(" ")}`, tone: "mono" as const },
    ],
  };
}
