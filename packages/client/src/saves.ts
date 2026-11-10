import {
  SAVE_ERROR_TEXT, SAVE_FORMAT, SAVE_REFUSAL_TEXT, SaveError, autosaveStatus, createInitialState, createSave, formatTime, gameTimeAt, loadSave, saveStatus, stringifySave,
  type Sim, type SaveMeta,
} from "@qh/core";
import { safeStorage } from "./storage.ts";

/** Slots: one autosave the game writes, and three the player writes. */
export const SLOTS = ["autosave", "slot1", "slot2", "slot3"] as const;
export type Slot = (typeof SLOTS)[number];

export interface SlotInfo {
  slot: Slot;
  meta: SaveMeta;
  tick: number;
}

type Store = ReturnType<typeof safeStorage>;

/** Reads and writes save text under namespaced keys. It never throws; a full or blocked disk just reports false. */
export class SaveStore {
  private readonly storage: Store;
  private readonly namespace: string;
  /** Saves are kept per map, so the test range and the slice never see each other's saves. */
  constructor(storage: Store, namespace: string) {
    this.storage = storage;
    this.namespace = namespace;
  }
  private key(slot: Slot): string {
    return `save:${this.namespace}:${slot}`;
  }
  write(slot: Slot, text: string): boolean {
    return this.storage.set(this.key(slot), text);
  }
  read(slot: Slot): string | null {
    return this.storage.get(this.key(slot));
  }
  /** What the slot list shows: cheap, and null for an empty or unreadable slot (never an exception). */
  info(slot: Slot): SlotInfo | null {
    const text = this.read(slot);
    if (text === null) return null;
    try {
      const raw = JSON.parse(text) as { format?: string; meta?: SaveMeta; tick?: number };
      if (raw.format !== SAVE_FORMAT || !raw.meta || typeof raw.meta.label !== "string" || typeof raw.tick !== "number") return null;
      return { slot, meta: raw.meta, tick: raw.tick };
    } catch {
      return null;
    }
  }
  remove(slot: Slot): void {
    this.storage.remove(this.key(slot));
  }
}

export type Outcome = { ok: true; message: string } | { ok: false; message: string };

/**
 * Saving, loading, exporting and starting over, wired to one running Sim. Every operation returns a message
 * fit to show the player; a failed load never changes the running game (loadSave validates first).
 */
export class Game {
  readonly sim: Sim;
  readonly store: SaveStore;
  private readonly build: string;
  private readonly now: () => Date;
  private readonly newGameEffects: Parameters<Sim["tick"]>[0];
  private readonly seed: () => number;

  constructor(sim: Sim, store: SaveStore, options: { build: string; now?: () => Date; newGameEffects?: Parameters<Sim["tick"]>[0]; seed?: () => number }) {
    this.sim = sim;
    this.store = store;
    this.build = options.build;
    this.now = options.now ?? (() => new Date());
    this.newGameEffects = options.newGameEffects ?? [];
    this.seed = options.seed ?? (() => Date.now() >>> 0);
  }

  private label(): string {
    const s = this.sim.state;
    return `${formatTime(gameTimeAt(s.tick, this.sim.config))}, ${s.player.zone ?? "outside"}`;
  }

  private text(): string {
    const meta: SaveMeta = { build: this.build, label: this.label(), savedAt: this.now().toISOString() };
    return stringifySave(createSave(this.sim.state, this.sim.world.id, meta));
  }

  /** The player saves: only where and when the rules allow (the Safehouse, or calm). */
  save(slot: Exclude<Slot, "autosave">): Outcome {
    const status = saveStatus(this.sim.state, this.sim.world, this.sim.config);
    if (!status.ok) return { ok: false, message: SAVE_REFUSAL_TEXT[status.reason] };
    return this.write(slot, "Saved.");
  }

  /** The game saves itself, only when calm. Silent on refusal. */
  autosave(): boolean {
    if (!autosaveStatus(this.sim.state)) return false;
    return this.write("autosave", "").ok;
  }

  private write(slot: Slot, message: string): Outcome {
    try {
      return this.store.write(slot, this.text()) ? { ok: true, message } : { ok: false, message: "The browser would not store the save (storage is full or blocked). Use Export to keep it as a file." };
    } catch (e) {
      return { ok: false, message: e instanceof SaveError ? SAVE_ERROR_TEXT[e.code] : "Could not write the save." };
    }
  }

  /** The current game as a file's text, for Export. Allowed any time. */
  exportText(): string {
    return this.text();
  }

  /** Loads from text (a slot or an imported file). Nothing changes unless the whole save is valid. */
  loadText(text: string): Outcome {
    try {
      const save = loadSave(text, this.sim.config, this.sim.world);
      this.sim.load(save.state);
      return { ok: true, message: "Loaded." };
    } catch (e) {
      if (e instanceof SaveError) return { ok: false, message: SAVE_ERROR_TEXT[e.code] };
      throw e;
    }
  }

  load(slot: Slot): Outcome {
    const text = this.store.read(slot);
    return text === null ? { ok: false, message: "That slot is empty." } : this.loadText(text);
  }

  /** A fresh game. Does not touch any saves. */
  newGame(): void {
    this.sim.load(createInitialState(this.seed(), this.sim.config, this.sim.world));
    if (this.newGameEffects && this.newGameEffects.length > 0) this.sim.tick(this.newGameEffects);
  }
}

/**
 * Autosave policy: write when something worth keeping happened (a new zone, a clue, being released) and enough
 * time has passed, or when a long while has passed anyway; never mid-danger (Game.autosave refuses then and we try
 * again later). `poll` is called about once a second.
 */
export class Autosaver {
  private readonly game: Game;
  private readonly now: () => number;
  private readonly everyMs: number;
  private readonly minGapMs: number;
  private last: number;
  private dirty = false;

  constructor(game: Game, options: { everyMs: number; minGapMs?: number; now?: () => number }) {
    this.game = game;
    this.everyMs = options.everyMs;
    this.minGapMs = options.minGapMs ?? Math.min(10_000, options.everyMs);
    this.now = options.now ?? (() => performance.now());
    this.last = this.now();
    game.sim.bus.subscribe((e) => {
      if (e.type === "ZoneEntered" || e.type === "ClueGained" || e.type === "PlayerReleased" || e.type === "AugmentGained" || e.type === "PickedUp") this.dirty = true;
      if (e.type === "GameLoaded") {
        this.dirty = false;
        this.last = this.now();
      }
    });
  }

  poll(): void {
    const since = this.now() - this.last;
    if (since < this.minGapMs) return;
    if (!this.dirty && since < this.everyMs) return;
    if (this.game.autosave()) {
      this.last = this.now();
      this.dirty = false;
    }
  }
}
