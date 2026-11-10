/**
 * Saves (T2.10, SAV-1/2/3). A save is plain JSON: `{ format, version, seed, tick, map, state, meta }`. The core
 * only produces and consumes the JSON; where it is stored is the client's business.
 *
 *  - Round trip: the state is plain data, so `loadSave(stringifySave(createSave(state)))` is deep-equal to the
 *    original and steps identically afterwards (the RNG state is part of the state).
 *  - Versions: `version` is the save format. Every released version ships a migration to the next one in
 *    `MIGRATIONS` (`MIGRATIONS[n]` upgrades a version-n save to n+1), tested with committed fixture saves. A save
 *    from a *newer* build than this one is refused rather than guessed at.
 *  - Safety: anything that is not a well-formed save of this game for this map is rejected with a `SaveError`
 *    carrying a code the UI turns into a message. A bad save never partly loads: parsing returns a whole state
 *    or throws.
 *  - Where and when: `saveStatus` says whether a manual save is allowed right now (the Safehouse, or calm
 *    anywhere while `save.requireSafeZone` is off); `autosaveStatus` is stricter (never mid-danger).
 */
import type { Config } from "./config.ts";
import { createInitialState, type SimState } from "./state.ts";
import type { World } from "./world.ts";
import { zoneAt } from "./world.ts";

export const SAVE_FORMAT = "quiet-hours-save";
export const SAVE_VERSION = 1;

export interface SaveMeta {
  /** Build id of the game that wrote it (for bug reports). */
  build: string;
  /** A short description for the slot list, e.g. "Day 1 07:42, the Stacks". */
  label: string;
  /** ISO time of writing (the client supplies it; the core never reads a clock). */
  savedAt: string;
}

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  seed: number;
  tick: number;
  /** Id of the map the state belongs to. */
  map: string;
  state: SimState;
  meta: SaveMeta;
}

export type SaveErrorCode = "corrupt" | "unknown_format" | "too_new" | "invalid_state" | "wrong_map";

export class SaveError extends Error {
  readonly code: SaveErrorCode;
  constructor(code: SaveErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** What the player is told for each way a save can be refused. */
export const SAVE_ERROR_TEXT: Record<SaveErrorCode, string> = {
  corrupt: "That save file is damaged and cannot be read.",
  unknown_format: "That is not a Quiet Hours save file.",
  too_new: "That save was made by a newer version of the game. Update the game to load it.",
  invalid_state: "That save does not match this version of the game and cannot be loaded safely.",
  wrong_map: "That save belongs to a different map.",
};

export type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

/** `MIGRATIONS[n]` turns a version-n save into a version-(n+1) save. Empty: version 1 is the first release. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export function createSave(state: Readonly<SimState>, map: string, meta: SaveMeta): SaveFile {
  assertJsonSafe(state); // before copying: JSON would quietly turn NaN into null
  return { format: SAVE_FORMAT, version: SAVE_VERSION, seed: state.seed, tick: state.tick, map, state: structuredCopy(state), meta };
}

const structuredCopy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function assertJsonSafe(value: unknown, path = "state"): void {
  if (typeof value === "number" && !Number.isFinite(value)) throw new SaveError("invalid_state", `${path} is not a finite number`);
  if (value === undefined) throw new SaveError("invalid_state", `${path} is undefined`);
  if (typeof value === "function") throw new SaveError("invalid_state", `${path} is a function`);
  if (Array.isArray(value)) value.forEach((v, i) => assertJsonSafe(v, `${path}[${i}]`));
  else if (typeof value === "object" && value !== null) for (const [k, v] of Object.entries(value)) assertJsonSafe(v, `${path}.${k}`);
}

export function stringifySave(save: SaveFile): string {
  assertJsonSafe(save);
  return JSON.stringify(save);
}

/** Fields whose keys are data (ids), not shape. Their contents are not compared key for key. */
const DYNAMIC = new Set(["flags", "clues", "items", "doors", "terminals", "trust", "npcs", "district", "last", "locker.items"]);

/** Problems where `value` does not have the shape of `template` (missing or extra fields, wrong types). */
function shapeProblems(template: unknown, value: unknown, path: string, out: string[]): void {
  if (Array.isArray(template)) {
    if (!Array.isArray(value)) return void out.push(`${path} should be a list`);
    // Lists of records (robots, cameras) are compared entry by entry with the template (same map, same order).
    // Lists of values, and any extra entries, are not.
    template.forEach((model, i) => {
      if (typeof model === "object" && model !== null && i < value.length) shapeProblems(model, value[i], `${path}[${i}]`, out);
    });
    return;
  }
  if (typeof template === "object" && template !== null) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return void out.push(`${path} should be an object`);
    const key = path.slice(path.lastIndexOf(".") + 1);
    if (DYNAMIC.has(key) || DYNAMIC.has(path.replace(/^state\./, ""))) return;
    const t = template as Record<string, unknown>;
    const v = value as Record<string, unknown>;
    for (const k of Object.keys(t)) {
      if (!(k in v)) out.push(`${path}.${k} is missing`);
      else shapeProblems(t[k], v[k], `${path}.${k}`, out);
    }
    for (const k of Object.keys(v)) if (!(k in t) && !OPTIONAL.has(k)) out.push(`${path}.${k} is not part of this version`);
    return;
  }
  if (template !== null && value !== null && typeof template !== typeof value) out.push(`${path} should be a ${typeof template}`);
}

/** Fields that legitimately appear only sometimes. */
const OPTIONAL = new Set(["notice"]);

/**
 * Parses, migrates and validates a save for this map and returns the whole state, or throws a SaveError.
 * `migrations` is injectable so tests can exercise the chain.
 */
export function loadSave(text: string, config: Config, world: World, options: { migrations?: Readonly<Record<number, Migration>>; currentVersion?: number } = {}): SaveFile {
  const migrations = options.migrations ?? MIGRATIONS;
  const current = options.currentVersion ?? SAVE_VERSION;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SaveError("corrupt", "not valid JSON");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new SaveError("unknown_format", "not an object");
  let save = raw as Record<string, unknown>;
  if (save.format !== SAVE_FORMAT) throw new SaveError("unknown_format", `format is ${JSON.stringify(save.format)}`);
  if (!Number.isInteger(save.version) || (save.version as number) < 1) throw new SaveError("corrupt", "bad version");
  if ((save.version as number) > current) throw new SaveError("too_new", `save version ${String(save.version)} is newer than ${current}`);
  for (let v = save.version as number; v < current; v++) {
    const step = migrations[v];
    if (!step) throw new SaveError("invalid_state", `no migration from version ${v}`);
    try {
      save = { ...step(save), version: v + 1 };
    } catch (e) {
      throw new SaveError("invalid_state", `migration from version ${v} failed: ${(e as Error).message}`);
    }
  }
  if (typeof save.map !== "string" || typeof save.state !== "object" || save.state === null) throw new SaveError("corrupt", "missing map or state");
  if (save.map !== world.id) throw new SaveError("wrong_map", `save is for map "${save.map}", this is "${world.id}"`);
  const state = save.state as SimState;
  const problems: string[] = [];
  try {
    assertJsonSafe(state);
  } catch (e) {
    problems.push((e as Error).message);
  }
  if (problems.length === 0) shapeProblems(createInitialState(0, config, world), state, "state", problems);
  if (problems.length === 0) {
    const ids = (list: readonly { id: string }[]) => list.map((x) => x.id).join(",");
    if (ids(state.robots) !== ids(world.robots.map((r) => ({ id: r.id }))) || ids(state.cameras) !== ids(world.cameras.map((c) => ({ id: c.id })))) {
      problems.push("robots or cameras do not match the map");
    }
  }
  if (problems.length > 0) throw new SaveError("invalid_state", problems.slice(0, 5).join("; "));
  return save as unknown as SaveFile;
}

// ---- When may the player save? ---------------------------------------------------------------

export type SaveRefusal = "held" | "not_safe" | "danger";

export type SaveStatus = { ok: true; where: "safe" | "calm" } | { ok: false; reason: SaveRefusal };

const inDanger = (state: Readonly<SimState>): boolean =>
  state.alert.level > 0 || state.robots.some((r) => r.sees && !r.dormant && !r.destroyed) || state.cameras.some((c) => c.sees && !c.broken && !c.dormant);

/** Manual save: in a `safe` zone (the Safehouse) always; elsewhere only when calm, unless `save.requireSafeZone`. */
export function saveStatus(state: Readonly<SimState>, world: World, config: Config): SaveStatus {
  if (state.tick < state.processingUntil) return { ok: false, reason: "held" };
  const zone = zoneAt(world, Math.floor(state.player.x), Math.floor(state.player.y));
  if (zone?.safe) return { ok: true, where: "safe" };
  if (config.save.requireSafeZone) return { ok: false, reason: "not_safe" };
  return inDanger(state) ? { ok: false, reason: "danger" } : { ok: true, where: "calm" };
}

/** Autosave never writes mid-danger or while held, so a reload never drops the player into a chase. */
export function autosaveStatus(state: Readonly<SimState>): boolean {
  return state.tick >= state.processingUntil && !inDanger(state);
}

export const SAVE_REFUSAL_TEXT: Record<SaveRefusal, string> = {
  held: "You cannot save while being processed.",
  not_safe: "You can only save at the Safehouse.",
  danger: "You cannot save while the city is looking for you.",
};
