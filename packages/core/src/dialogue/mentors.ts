/**
 * The mentor arc (T3.7, CMP-2): one arc, voiced four times. `content/mentors/arc.qdl` holds the shared beats, their
 * conditions and effects, with `{{slots}}` where the words go; `content/mentors/<id>.json` gives each mentor's words
 * and specialty. Composing is plain text work done before the dialogue compiler runs, so the compiler (and every
 * validator that follows it) sees ordinary conversations. A slot missing from any voicing is an error: all four
 * mentors must voice every beat.
 */
export const MENTOR_IDS = ["ines", "maren", "tobias", "silas"] as const;
/** The beats, in order. Each flag `mb_<beat>` is set when the player has been through it. */
export const MENTOR_BEATS = ["vouch", "first_lesson", "slip", "refusal", "shake", "choice", "awakening"] as const;

export interface MentorVoicing {
  id: string;
  name: string;
  /** A small, data-defined perk: the words and the effects (in `.qdl` effect syntax) it grants at the first lesson. */
  specialty: { id: string; name: string; summary: string; grant: string };
  /** The words for every slot in the arc. */
  voice: Record<string, string>;
}

const SLOT = /\{\{\s*([a-z0-9_.]+)\s*\}\}/g;

/** Every slot the template uses (the voicing's `id` is always supplied). */
export function arcSlots(arc: string): string[] {
  return [...new Set([...arc.matchAll(SLOT)].map((m) => m[1]!))].filter((s) => s !== "id").sort();
}

/** What is wrong with the voicings against the template: missing or unused slots, quotes that would break a line. */
export function mentorIssues(arc: string, voicings: readonly MentorVoicing[]): string[] {
  const issues: string[] = [];
  const slots = arcSlots(arc);
  for (const id of MENTOR_IDS) if (!voicings.some((v) => v.id === id)) issues.push(`mentor "${id}" has no voicing file`);
  for (const beat of MENTOR_BEATS) if (!new RegExp(`^node: arc_${beat}\\b`, "m").test(arc)) issues.push(`the arc has no node for the beat "${beat}"`);
  for (const v of voicings) {
    for (const s of slots) {
      if (s === "specialty.grant") continue;
      if (typeof v.voice[s] !== "string" || v.voice[s]!.trim() === "") issues.push(`mentor "${v.id}" has no line for "${s}"`);
    }
    for (const k of Object.keys(v.voice)) if (!slots.includes(k) && k !== "idle") issues.push(`mentor "${v.id}" voices "${k}", which the arc does not use`);
    for (const [k, t] of Object.entries(v.voice)) if (/["{}\\]/.test(t)) issues.push(`mentor "${v.id}" line "${k}" has a character that would break the dialogue (quote, brace or backslash)`);
    if (!v.specialty?.grant) issues.push(`mentor "${v.id}" has no specialty grant`);
  }
  return issues;
}

/** The arc with this mentor's words filled in. */
export function fillArc(arc: string, v: MentorVoicing): string {
  return arc.replace(SLOT, (_, key: string) => (key === "id" ? v.id : key === "specialty.grant" ? v.specialty.grant : (v.voice[key] ?? "")));
}

/**
 * Merges the filled arc into the mentor's own conversation: its `start:` lines go first (so a beat that is due wins
 * over the everyday talk) and its nodes go at the end. A mentor with no file of their own gets a short stub.
 */
export function composeMentorConversation(base: string | undefined, arc: string, v: MentorVoicing): string {
  const filled = fillArc(arc, v);
  const lines = filled.split(/\r?\n/);
  const arcStarts = lines.filter((l) => l.startsWith("start:"));
  const arcBody = lines.filter((l) => !l.startsWith("start:")).join("\n").trim();
  const text = base ?? `npc: ${v.id}\nname: ${v.name}\ntrust: yes\nstart: arc_idle\n\nnode: arc_idle\n  ${v.id}: "${v.voice["idle"] ?? "Hello."}"\n  end\n`;
  const out = text.split(/\r?\n/);
  const i = out.findIndex((l) => l.startsWith("start:"));
  out.splice(i < 0 ? out.length : i, 0, ...arcStarts);
  return `${out.join("\n").trimEnd()}\n\n${arcBody}\n`;
}

/** Replaces each mentor's conversation text (keyed by conversation id) with the composed one. */
export function composeMentors(dialogues: Record<string, string>, arc: string, voicings: readonly MentorVoicing[]): Record<string, string> {
  const out = { ...dialogues };
  for (const v of voicings) out[v.id] = composeMentorConversation(dialogues[v.id], arc, v);
  return out;
}
