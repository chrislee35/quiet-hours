/**
 * Colour palettes (ACC-2). The interface uses a few *semantic* colours: live (powered, on), good (done, verified),
 * bad (wrong, danger, unmet) and warn (attention, you, restricted). Each is a CSS variable, so a palette is just four
 * pairs of colours (a main shade and a soft, lighter one for text) plus the two text colours. The colour-blind
 * palettes are checked by tests that simulate each kind of colour vision and require every pair of roles that must
 * be told apart to stay clearly different (the interface also never relies on colour alone: shapes and words carry
 * the same meaning).
 */
export type PaletteId = "default" | "red_green" | "blue_yellow" | "high_contrast";

export interface Palette {
  id: PaletteId;
  name: string;
  /** Which vision the palette is built for, for the simulation tests; null means ordinary vision. */
  for: "protan" | "deutan" | "tritan" | null;
  live: string;
  liveSoft: string;
  good: string;
  goodSoft: string;
  bad: string;
  badSoft: string;
  warn: string;
  warnSoft: string;
  text: string;
  muted: string;
}

export const PALETTES: Record<PaletteId, Palette> = {
  default: {
    id: "default", name: "Default", for: null,
    live: "#5fd6ee", liveSoft: "#a6ecff", good: "#7fe08a", goodSoft: "#c8f5d2", bad: "#ff7a8a", badSoft: "#ffb0bd", warn: "#ffd36b", warnSoft: "#ffe9a8", text: "#dfe2f3", muted: "#9aa0c4",
  },
  red_green: {
    id: "red_green", name: "Red-green safe (protanopia, deuteranopia)", for: "deutan",
    live: "#56b4e9", liveSoft: "#b6dcf5", good: "#56b4e9", goodSoft: "#b6dcf5", bad: "#e8743b", badSoft: "#ffb48a", warn: "#f0e442", warnSoft: "#faf3a0", text: "#dfe2f3", muted: "#a3a9c8",
  },
  blue_yellow: {
    id: "blue_yellow", name: "Blue-yellow safe (tritanopia)", for: "tritan",
    live: "#2ec4b6", liveSoft: "#9ee8df", good: "#2ec4b6", goodSoft: "#9ee8df", bad: "#ff4d6d", badSoft: "#ffa3b3", warn: "#ffb347", warnSoft: "#ffd9a3", text: "#dfe2f3", muted: "#a3a9c8",
  },
  high_contrast: {
    id: "high_contrast", name: "High contrast", for: null,
    live: "#00ffff", liveSoft: "#a0ffff", good: "#3dff8a", goodSoft: "#b5ffd2", bad: "#ff5c5c", badSoft: "#ffb0b0", warn: "#ffff00", warnSoft: "#ffffa0", text: "#ffffff", muted: "#d8dcf0",
  },
};

export const PALETTE_IDS = Object.keys(PALETTES) as PaletteId[];

/** The CSS variables a palette sets (the stylesheet reads only these for semantic colours). */
export function cssVariables(p: Palette): Record<string, string> {
  return {
    "--qh-live": p.live, "--qh-live-soft": p.liveSoft, "--qh-good": p.good, "--qh-good-soft": p.goodSoft,
    "--qh-bad": p.bad, "--qh-bad-soft": p.badSoft, "--qh-warn": p.warn, "--qh-warn-soft": p.warnSoft,
    "--qh-text": p.text, "--qh-muted": p.muted,
  };
}

const num = (hex: string): number => Number.parseInt(hex.slice(1), 16);

/** The same palette as numbers for the canvas (Phaser takes 0xRRGGBB). */
export function canvasColours(p: Palette): { live: number; good: number; bad: number; warn: number } {
  return { live: num(p.live), good: num(p.good), bad: num(p.bad), warn: num(p.warn) };
}

// ---- Colour maths, for the tests ---------------------------------------------------------------

type Rgb = [number, number, number];
const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number): number => Math.min(1, Math.max(0, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));

export function parseHex(hex: string): Rgb {
  const n = num(hex);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as Rgb;
}

/** Relative luminance (WCAG). */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(toLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// Machado, Oliveira & Fernandes (2009), full severity, applied in linear RGB.
const CVD: Record<"protan" | "deutan" | "tritan", number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

/** What a colour looks like to someone with this kind of colour blindness, as linear RGB. */
export function simulate(hex: string, kind: "protan" | "deutan" | "tritan" | null): Rgb {
  const lin = parseHex(hex).map(toLinear) as Rgb;
  if (kind === null) return lin;
  const m = CVD[kind];
  return m.map((row) => Math.min(1, Math.max(0, row[0]! * lin[0] + row[1]! * lin[1] + row[2]! * lin[2]))) as Rgb;
}

function lab(lin: Rgb): [number, number, number] {
  const [r, g, b] = lin;
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** How different two colours look (CIE76 delta E) to someone with this kind of vision. Above about 25 is clearly different. */
export function difference(a: string, b: string, kind: "protan" | "deutan" | "tritan" | null): number {
  const [l1, a1, b1] = lab(simulate(a, kind));
  const [l2, a2, b2] = lab(simulate(b, kind));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

void fromLinear;
