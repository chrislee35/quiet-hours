import { applySettings, loadSettings, saveSettings, type Settings } from "./settings.ts";
import type { safeStorage } from "./storage.ts";

/** Holds the current settings, saves each change, applies the display ones to the page, and tells listeners. */
export class SettingsStore {
  private current: Settings;
  private readonly storage: ReturnType<typeof safeStorage>;
  private readonly listeners = new Set<(s: Settings, changed: (keyof Settings)[]) => void>();

  constructor(storage: ReturnType<typeof safeStorage>, prefersReducedMotion: boolean, apply = true) {
    this.storage = storage;
    this.current = loadSettings(storage, prefersReducedMotion);
    if (apply) applySettings(this.current);
  }

  get(): Settings {
    return this.current;
  }

  update(patch: Partial<Settings>, apply = true): void {
    const changed = (Object.keys(patch) as (keyof Settings)[]).filter((k) => patch[k] !== undefined && patch[k] !== this.current[k]);
    if (changed.length === 0) return;
    this.current = { ...this.current, ...patch };
    saveSettings(this.storage, this.current);
    if (apply) applySettings(this.current);
    for (const l of this.listeners) l(this.current, changed);
  }

  onChange(l: (s: Settings, changed: (keyof Settings)[]) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
