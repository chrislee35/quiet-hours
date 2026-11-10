/**
 * Cipher puzzle (HAK-2, crypto): a message is enciphered with a Caesar shift or a Vigenère keyword; turn the key
 * dials until it reads as plain text. The ciphertext is derived from the plaintext and key in the definition, so
 * the two can never disagree. Tools the player has: live decoding, a letter-frequency table, and a hint line (a
 * "crib": a word you know is in the message). Values vector: the shift (0-25) of each key letter.
 */
import type { BoardView } from "./board.ts";

export interface CipherDef {
  id: string;
  kind: "cipher";
  method: "caesar" | "vigenere";
  /** The secret message. Letters are enciphered; spaces and punctuation are left alone. */
  plaintext: string;
  /** Caesar: one letter (the shift). Vigenère: the keyword. */
  key: string;
  hint?: string;
}

const A = 65;
const isLetter = (ch: string): boolean => /[A-Za-z]/.test(ch);
const shiftOf = (ch: string): number => ch.toUpperCase().charCodeAt(0) - A;

/** Shifts every letter by the key letter for its position (cycling the key), forwards or back. */
function shiftText(text: string, shifts: readonly number[], dir: 1 | -1): string {
  let n = 0;
  return [...text.toUpperCase()]
    .map((ch) => {
      if (!isLetter(ch)) return ch;
      const s = shifts[n++ % shifts.length] ?? 0;
      return String.fromCharCode(A + ((((ch.charCodeAt(0) - A + dir * s) % 26) + 26) % 26));
    })
    .join("");
}

const keyShifts = (d: CipherDef): number[] => [...d.key].map(shiftOf);
export const ciphertext = (d: CipherDef): string => shiftText(d.plaintext, keyShifts(d), 1);
export const decoded = (d: CipherDef, values: readonly number[]): string => shiftText(ciphertext(d), values, -1);

export function validate(def: CipherDef): string[] {
  const errors: string[] = [];
  if (!["caesar", "vigenere"].includes(def.method)) errors.push('method must be "caesar" or "vigenere"');
  if (!/^[A-Za-z]+$/.test(def.key)) errors.push("key must be letters only");
  else {
    if (def.method === "caesar" && def.key.length !== 1) errors.push("a Caesar key is a single letter");
    if (def.method === "vigenere" && (def.key.length < 2 || def.key.length > 6)) errors.push("a Vigenère key is 2 to 6 letters");
    if (/^[Aa]+$/.test(def.key)) errors.push("an all-A key leaves the message unchanged");
  }
  if (def.plaintext.replace(/[^A-Za-z]/g, "").length < 12) errors.push("the message needs at least 12 letters (shorter ones cannot be solved by frequency)");
  return errors;
}

export const init = (def: CipherDef): number[] => def.key.length > 0 ? [...def.key].map(() => 0) : [0];

export function tap(def: CipherDef, values: readonly number[], index: number): number[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= values.length) return null;
  const next = values.slice();
  next[index] = ((next[index] ?? 0) + 1) % 26;
  return next;
}

export const isSolved = (def: CipherDef, values: readonly number[]): boolean => decoded(def, values) === def.plaintext.toUpperCase();

export function solve(def: CipherDef, from: readonly number[] = init(def)): number[] | null {
  const taps: number[] = [];
  keyShifts(def).forEach((want, i) => {
    for (let t = 0; t < (((want - (from[i] ?? 0)) % 26) + 26) % 26; t++) taps.push(i);
  });
  return taps;
}

/** The three commonest letters of the ciphertext, e.g. "Q×7, X×5, B×4": the classic first move. */
function frequencies(text: string): string {
  const counts = new Map<string, number>();
  for (const ch of text) if (isLetter(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3).map(([c, n]) => `${c}×${n}`).join(", ");
}

export function view(def: CipherDef, values: readonly number[]): BoardView {
  const cipher = ciphertext(def);
  return {
    kind: "board",
    of: "cipher",
    hint: `Turn the key letters until the message reads as plain English. ${def.method === "caesar" ? "Every letter was moved the same number of places." : "Each key letter moves its own letters, in turn."}${def.hint ? ` Clue: ${def.hint}` : ""}`,
    status: isSolved(def, values) ? "It reads cleanly." : "Still gibberish.",
    rows: [{
      label: "Key",
      controls: values.map((v, index) => ({ index, text: String.fromCharCode(A + v), aria: `Key letter ${index + 1} of ${values.length}, currently ${String.fromCharCode(A + v)}. Tap for the next letter.` })),
    }],
    lines: [
      { text: `Cipher: ${cipher}`, tone: "mono" },
      { text: `Reads:  ${decoded(def, values)}`, tone: "mono" },
      { text: `Commonest letters in the cipher: ${frequencies(cipher)}. In English, E and T are the commonest.`, tone: "hint" },
    ],
  };
}
