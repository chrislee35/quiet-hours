import { PALETTES, PALETTE_IDS, cssVariables, type PaletteId } from "./palette.ts";
import { safeStorage } from "./storage.ts";

/**
 * Player settings (ACC-1/2/3, HAK-3). They belong to the player, not to a save game: stored under `quiet-hours:settings`
 * and never touched by loading or starting a game. Anything unreadable falls back to the default for that field.
 */
export const TEXT_SCALES = [100, 125, 150, 200] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

export interface Settings {
  /** Text size as a percentage of the default (ACC-3). */
  textScale: TextScale;
  palette: PaletteId;
  /** Less camera movement and no flashing or pulsing effects (ACC-2). */
  reduceMotion: boolean;
  /** A short sound when the alert level rises: one beep, two, three (ACC-2). */
  alertCues: boolean;
  /** The puzzle-skip assist: after enough attempts a puzzle can be skipped (HAK-3). Never needed for progress. */
  puzzleSkip: boolean;
}

export const DEFAULT_SETTINGS: Settings = { textScale: 100, palette: "default", reduceMotion: false, alertCues: true, puzzleSkip: false };

const KEY = "settings";

export function parseSettings(raw: unknown, fallback: Settings = DEFAULT_SETTINGS): Settings {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    textScale: (TEXT_SCALES as readonly unknown[]).includes(r.textScale) ? (r.textScale as TextScale) : fallback.textScale,
    palette: PALETTE_IDS.includes(r.palette as PaletteId) ? (r.palette as PaletteId) : fallback.palette,
    reduceMotion: typeof r.reduceMotion === "boolean" ? r.reduceMotion : fallback.reduceMotion,
    alertCues: typeof r.alertCues === "boolean" ? r.alertCues : fallback.alertCues,
    puzzleSkip: typeof r.puzzleSkip === "boolean" ? r.puzzleSkip : fallback.puzzleSkip,
  };
}

/** `prefersReducedMotion` seeds the default the first time only, from the browser's own setting. */
export function loadSettings(storage: ReturnType<typeof safeStorage>, prefersReducedMotion = false): Settings {
  const base: Settings = { ...DEFAULT_SETTINGS, reduceMotion: prefersReducedMotion };
  const raw = storage.get(KEY);
  if (raw === null) return base;
  try {
    return parseSettings(JSON.parse(raw), base);
  } catch {
    return base;
  }
}

export function saveSettings(storage: ReturnType<typeof safeStorage>, s: Settings): boolean {
  return storage.set(KEY, JSON.stringify(s));
}

/** Pixel size of the base font for a text scale. */
export const fontPixels = (scale: TextScale): number => (16 * scale) / 100;

/** Applies the display settings to the page: text size, palette colours, and a flag the stylesheet can read. */
export function applySettings(s: Settings, root: HTMLElement = document.documentElement): void {
  root.style.setProperty("--qh-font", `${fontPixels(s.textScale)}px`);
  for (const [k, v] of Object.entries(cssVariables(PALETTES[s.palette]))) root.style.setProperty(k, v);
  root.dataset.palette = s.palette;
  root.dataset.reduceMotion = String(s.reduceMotion);
  root.dataset.textScale = String(s.textScale);
}
