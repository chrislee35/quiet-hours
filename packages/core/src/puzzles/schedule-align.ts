/**
 * Schedule-alignment puzzle (T2.11, HAK-2): several tracks (trains, shifts, patrols) repeat a pattern over the
 * same cycle. Each unlocked track can be slid later by one slot per tap. Solved when no slot is busy on more than
 * one track (when `exclusive`) and every `require`d slot is busy on its track.
 * Values vector: the current shift of each track, 0..slots-1.
 */
export interface ScheduleTrack {
  id: string;
  name: string;
  /** One character per slot: "#" busy, "." free. Length equals `slots`. */
  pattern: string;
  /** Starting shift (default 0). */
  shift?: number;
  /** Fixed: the player cannot move it. */
  locked?: boolean;
}

export interface ScheduleAlignDef {
  id: string;
  kind: "schedule_align";
  slots: number;
  /** Optional labels for the slots, shown above the grid (e.g. "02:00"). */
  labels?: string[];
  tracks: ScheduleTrack[];
  /** No two tracks may be busy in the same slot. */
  exclusive: boolean;
  /** This track must be busy in this slot (e.g. the express must run at 05:00). */
  require?: { track: string; slot: number }[];
}

const mod = (n: number, m: number): number => ((n % m) + m) % m;

export function busy(def: ScheduleAlignDef, values: readonly number[], track: number, slot: number): boolean {
  const t = def.tracks[track];
  return t !== undefined && t.pattern[mod(slot - (values[track] ?? 0), def.slots)] === "#";
}

export function validate(def: ScheduleAlignDef): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(def.slots) || def.slots < 2 || def.slots > 24) return ["slots must be a whole number from 2 to 24"];
  if (def.tracks.length < 2 || def.tracks.length > 6) errors.push("needs 2 to 6 tracks");
  if (def.labels && def.labels.length !== def.slots) errors.push("labels must have one entry per slot");
  const ids = new Set<string>();
  def.tracks.forEach((t) => {
    if (ids.has(t.id)) errors.push(`duplicate track "${t.id}"`);
    ids.add(t.id);
    if (t.pattern.length !== def.slots || /[^#.]/.test(t.pattern)) errors.push(`track "${t.id}" pattern must be ${def.slots} characters of # and .`);
    if (t.shift !== undefined && (!Number.isInteger(t.shift) || t.shift < 0 || t.shift >= def.slots)) errors.push(`track "${t.id}" shift is out of range`);
  });
  (def.require ?? []).forEach((r, i) => {
    if (!ids.has(r.track)) errors.push(`requirement ${i + 1} names unknown track "${r.track}"`);
    if (!Number.isInteger(r.slot) || r.slot < 0 || r.slot >= def.slots) errors.push(`requirement ${i + 1} has a bad slot`);
  });
  return errors;
}

export function init(def: ScheduleAlignDef): number[] {
  return def.tracks.map((t) => t.shift ?? 0);
}

export function tap(def: ScheduleAlignDef, values: readonly number[], index: number): number[] | null {
  const t = def.tracks[index];
  if (!t || t.locked) return null;
  const next = values.slice();
  next[index] = mod((next[index] ?? 0) + 1, def.slots);
  return next;
}

export function collisions(def: ScheduleAlignDef, values: readonly number[]): boolean[] {
  return Array.from({ length: def.slots }, (_, s) => def.tracks.filter((_, i) => busy(def, values, i, s)).length > 1);
}

export function requirementsMet(def: ScheduleAlignDef, values: readonly number[]): boolean[] {
  return (def.require ?? []).map((r) => busy(def, values, def.tracks.findIndex((t) => t.id === r.track), r.slot));
}

export function isSolved(def: ScheduleAlignDef, values: readonly number[]): boolean {
  return (!def.exclusive || !collisions(def, values).some(Boolean)) && requirementsMet(def, values).every(Boolean);
}

/** The fewest taps (track indexes, repeated per slot of movement) that solve it from `from`, or null. */
export function solve(def: ScheduleAlignDef, from: readonly number[] = init(def)): number[] | null {
  const movable = def.tracks.map((t, i) => (t.locked ? -1 : i)).filter((i) => i >= 0);
  let best: { shifts: number[]; cost: number } | null = null;
  const values = from.slice();
  const go = (k: number, cost: number): void => {
    if (best && cost >= best.cost) return;
    if (k === movable.length) {
      if (isSolved(def, values)) best = { shifts: values.slice(), cost };
      return;
    }
    const i = movable[k]!;
    const start = from[i] ?? 0;
    for (let taps = 0; taps < def.slots; taps++) {
      values[i] = mod(start + taps, def.slots);
      go(k + 1, cost + taps);
    }
    values[i] = start;
  };
  go(0, 0);
  if (best === null) return null;
  const { shifts } = best as { shifts: number[]; cost: number };
  const moves: number[] = [];
  movable.forEach((i) => {
    for (let t = 0; t < mod((shifts[i] ?? 0) - (from[i] ?? 0), def.slots); t++) moves.push(i);
  });
  return moves;
}

export interface ScheduleView {
  slots: number;
  labels: string[];
  tracks: { index: number; name: string; locked: boolean; busy: boolean[] }[];
  collisions: boolean[];
  requirements: { track: string; slot: number; met: boolean }[];
}

export function view(def: ScheduleAlignDef, values: readonly number[]): ScheduleView {
  const met = requirementsMet(def, values);
  return {
    slots: def.slots,
    labels: def.labels ?? Array.from({ length: def.slots }, (_, i) => String(i + 1)),
    tracks: def.tracks.map((t, index) => ({ index, name: t.name, locked: t.locked === true, busy: Array.from({ length: def.slots }, (_, s) => busy(def, values, index, s)) })),
    collisions: collisions(def, values),
    requirements: (def.require ?? []).map((r, i) => ({ track: def.tracks.find((t) => t.id === r.track)?.name ?? r.track, slot: r.slot, met: met[i] ?? false })),
  };
}
