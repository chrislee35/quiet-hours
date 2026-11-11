import type { AnnotatedMap, PuzzleView } from "@qh/core";

type Circuit = Extract<PuzzleView, { kind: "logic_circuit" }>["diagram"];
type Rules = Extract<PuzzleView, { kind: "rule_contradiction" }>["diagram"];

/**
 * Drawings for the logic puzzles, as SVG markup strings built from the core's layout (no DOM needed, so they can be
 * checked in tests). State is never colour alone: a live wire is thick and solid, a dead one thin and dashed; every
 * box says its state in words. Boxes are dark with light text so the labels stay readable; only outlines and small
 * marks carry colour.
 */
export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const wirePath = (x1: number, y1: number, x2: number, y2: number): string => {
  const dx = Math.max(24, (x2 - x1) / 2);
  return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
};

const text = (x: number, y: number, s: string, cls: string): string => `<text x="${x}" y="${y}" class="${cls}">${esc(s)}</text>`;

export function circuitMarkup(d: Circuit, solved: boolean): string {
  const wires = d.wires.map((w) => `<path d="${wirePath(w.x1, w.y1, w.x2, w.y2)}" class="wire ${w.value ? "on" : "off"}"/>`).join("");
  const nodes = d.nodes
    .map((n) => {
      const cls = `node ${n.kind}${n.value ? " on" : ""}${n.met === false ? " unmet" : ""}${n.locked ? " locked" : ""}${n.index !== null && !solved ? " tappable" : ""}`;
      const tap = n.index !== null && !solved ? ` data-tap="${n.index}"` : "";
      const mid = n.x + n.w / 2;
      let inner: string;
      if (n.kind === "switch") inner = text(mid, n.y + 15, n.label, "label") + text(mid, n.y + 28, `${n.value ? "ON" : "off"}${n.locked ? " (fixed)" : ""}`, "state");
      else if (n.kind === "gate") inner = text(mid, n.y + 16, n.label, "op") + text(mid, n.y + 29, `${n.tag} ${n.value ? "ON" : "off"}`, "state");
      else inner = `<circle cx="${n.x + 17}" cy="${n.y + 17}" r="7" class="bulb"/>` + text(n.x + 32, n.y + 15, n.label, "label left") + text(n.x + 32, n.y + 28, `needs ${n.want ? "ON" : "off"} ${n.met ? "✓" : "✗"}`, "state left");
      return `<g class="${cls}"${tap}><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${d.box.h}" rx="${n.kind === "lamp" ? 17 : 6}"/>${inner}</g>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${d.width} ${d.height}" class="qh-diagram" role="img" aria-label="Circuit diagram: switches, gates and lamps joined by wires. The lists below give the same wiring in words.">${wires}${nodes}</svg>`;
}

export function ruleMarkup(d: Rules, solved: boolean): string {
  const wires = d.wires
    .map((w) => {
      // A condition's label sits just before the rule it feeds; an order's label just after the rule that gives it.
      // Every wire ends at its own height on the rule, so the labels do not land on top of each other.
      const toRule = w.to.startsWith("rule:");
      const lx = toRule ? w.x2 - 6 : w.x1 + 6;
      const ly = (toRule ? w.y2 : w.y1) - 4;
      return `<path d="${wirePath(w.x1, w.y1, w.x2, w.y2)}" class="wire ${w.live ? "on" : "off"}"/>` + text(lx, ly, w.label, `wlabel ${toRule ? "end" : "start"}${w.live ? " on" : ""}`);
    })
    .join("");
  const nodes = d.nodes
    .map((n) => {
      const cls = `node ${n.kind}${n.active ? " on" : ""}${n.clash ? " clash" : ""}${n.locked ? " locked" : ""}${n.index !== null && !solved ? " tappable" : ""}`;
      const tap = n.index !== null && !solved ? ` data-tap="${n.index}"` : "";
      const cx = n.x + n.w / 2;
      let inner: string;
      if (n.kind === "rule") {
        inner = text(n.x + 10, n.y + 15, `${n.label} · ${n.state}`, "label left") + n.lines.map((l, i) => text(n.x + 10, n.y + 31 + i * 14, l, "body left")).join("");
      } else {
        inner = text(cx, n.y + n.h / 2 - 2, n.label + (n.locked ? " (fixed)" : ""), "label") + text(cx, n.y + n.h / 2 + 11, n.clash ? "⚠ CONTRADICTION" : n.state, "state");
      }
      return `<g class="${cls}"${tap}><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.kind === "output" ? 10 : 6}"/>${inner}</g>`;
    })
    .join("");
  const heads = ["Inputs", "MERIDIAN's rules", "Decisions"]
    .map((t, i) => {
      const xs = [d.nodes.find((n) => n.kind === "input")?.x ?? 0, d.nodes.find((n) => n.kind === "rule")?.x ?? 0, d.nodes.find((n) => n.kind === "output")?.x ?? 0];
      const ws = [d.nodes.find((n) => n.kind === "input")?.w ?? 0, d.nodes.find((n) => n.kind === "rule")?.w ?? 0, d.nodes.find((n) => n.kind === "output")?.w ?? 0];
      return text(xs[i]! + ws[i]! / 2, 9, t, "head");
    })
    .join("");
  return `<svg viewBox="0 -4 ${d.width} ${d.height + 8}" class="qh-diagram" role="img" aria-label="Rule diagram: inputs feed MERIDIAN's rules, and rules force decisions. The lists below give the same in words.">${heads}${wires}${nodes}</svg>`;
}

/**
 * The notebook map: walls, the zones you know, and a pin for every place, person and for you. Shapes carry meaning
 * (diamond = place, circle = person, triangle = you) and every pin is labelled, so colour is never the only signal.
 */
export function mapMarkup(m: AnnotatedMap): string {
  const T = 14;
  const walls: string[] = [];
  m.walls.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") walls.push(`<rect x="${x * T}" y="${y * T}" width="${T}" height="${T}" class="mwall"/>`); }));
  const zones = m.zones
    .map((z) => {
      const rects = z.tiles.map(([x, y]) => `<rect x="${x * T}" y="${y * T}" width="${T}" height="${T}"/>`).join("");
      const [fx, fy] = z.tiles[0] ?? [0, 0];
      return `<g class="mzone p${Math.min(3, z.permission)}">${rects}</g>` + text((fx + 0.3) * T, (fy + 1.4) * T, z.label, "mzlabel left");
    })
    .join("");
  const pins = m.pins
    .map((p) => {
      const cx = (p.x + 0.5) * T;
      const cy = (p.y + 0.5) * T;
      const mark = p.kind === "place" ? `<path d="M${cx} ${cy - 7} L${cx + 7} ${cy} L${cx} ${cy + 7} L${cx - 7} ${cy} Z" class="mpin place"/>` : p.kind === "person" ? `<circle cx="${cx}" cy="${cy}" r="5.5" class="mpin person"/>` : `<path d="M${cx} ${cy - 7} L${cx + 6} ${cy + 5} L${cx - 6} ${cy + 5} Z" class="mpin you"/>`;
      return mark + text(cx, cy - 10, p.label, `mlabel ${p.kind}`);
    })
    .join("");
  return `<svg viewBox="0 0 ${m.width * T} ${m.height * T}" class="qh-map" role="img" aria-label="Map of what you know. The list below describes each place, person and zone.">${walls.join("")}${zones}${pins}</svg>`;
}
