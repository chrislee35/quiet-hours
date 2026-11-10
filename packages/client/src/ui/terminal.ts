import { powerRouting, type PuzzleView, type Sim, type TerminalView } from "@qh/core";

const SIDE_NAMES = ["N", "E", "S", "W"] as const;
const PIECE_NAMES: Record<string, string> = { I: "straight pipe", L: "corner", T: "tee junction", "+": "cross junction", E: "dead end", ".": "empty" };
// Where each side's pipe reaches the cell edge, in a 100x100 viewBox.
const EDGE: Record<number, [number, number]> = { 0: [50, 0], 1: [100, 50], 2: [50, 100], 3: [0, 50] };
const SVG_NS = "http://www.w3.org/2000/svg";

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/**
 * One cell's picture: a pipe from the centre to each open edge, so neighbouring pieces visibly join; a ring on
 * targets (filled once powered); and a bolt on the source. Colour is never the only signal: powered pipes are
 * also thicker with a bright core, and the cell's accessible label says "powered".
 */
function cellSvg(sides: number[], powered: boolean, isSource: boolean, isTarget: boolean): SVGElement {
  const root = svg("svg", { viewBox: "0 0 100 100", "aria-hidden": "true" });
  for (const side of sides) {
    const [x, y] = EDGE[side]!;
    root.append(svg("line", { x1: 50, y1: 50, x2: x, y2: y, class: "pipe", "stroke-linecap": "butt" }));
    if (powered) root.append(svg("line", { x1: 50, y1: 50, x2: x, y2: y, class: "core", "stroke-linecap": "butt" }));
  }
  if (sides.length > 0) root.append(svg("circle", { cx: 50, cy: 50, r: 11, class: "hub" }));
  if (isTarget) root.append(svg("circle", { cx: 50, cy: 50, r: 22, class: powered ? "target on" : "target" }));
  if (isSource) {
    const bolt = svg("path", { d: "M56 14 L36 54 H50 L44 86 L66 42 H52 Z", class: "bolt" });
    root.append(bolt);
  }
  return root;
}

type Routing = Extract<PuzzleView, { kind: "power_routing" }>;
type Signal = Extract<PuzzleView, { kind: "signal_path" }>;
type Schedule = Extract<PuzzleView, { kind: "schedule_align" }>;
type Rules = Extract<PuzzleView, { kind: "rule_contradiction" }>;

/** A signal-path cell: wall block, hazard cross, mirror stroke, with a beam glow when lit. Shape, not colour, carries meaning. */
function signalSvg(glyph: string, lit: boolean, isSource: boolean, isTarget: boolean): SVGElement {
  const root = svg("svg", { viewBox: "0 0 100 100", "aria-hidden": "true" });
  if (glyph === "#") {
    root.append(svg("rect", { x: 8, y: 8, width: 84, height: 84, class: "wall" }));
    return root;
  }
  if (lit) root.append(svg("circle", { cx: 50, cy: 50, r: 16, class: "beam" }));
  if (glyph === "X") {
    root.append(svg("line", { x1: 22, y1: 22, x2: 78, y2: 78, class: lit ? "hazard hot" : "hazard" }));
    root.append(svg("line", { x1: 78, y1: 22, x2: 22, y2: 78, class: lit ? "hazard hot" : "hazard" }));
  } else if (glyph === "/") root.append(svg("line", { x1: 20, y1: 80, x2: 80, y2: 20, class: "mirror" }));
  else if (glyph === "\\") root.append(svg("line", { x1: 20, y1: 20, x2: 80, y2: 80, class: "mirror" }));
  if (isTarget) root.append(svg("circle", { cx: 50, cy: 50, r: 30, class: lit ? "target on" : "target" }));
  if (isSource) root.append(svg("path", { d: "M30 50 L70 50 M56 36 L70 50 L56 64", class: "bolt" }));
  return root;
}

/**
 * Terminal window (HAK-2). Four puzzle types share one frame and one visual language: every control is a real
 * button (Tab/arrows to move, Enter or Space to act, Esc to leave); the terminal unlocks by itself the moment the
 * puzzle is solved (there is no confirm button). State is always in the button's accessible label and in text, so
 * colour is never the only signal (ACC-2).
 */
export class TerminalWindow {
  private readonly sim: Sim;
  private root: HTMLElement;
  private focusIndex = 0;

  constructor(sim: Sim, host: HTMLElement) {
    this.sim = sim;
    this.root = document.createElement("section");
    this.root.className = "qh-panel qh-terminal";
    this.root.setAttribute("role", "dialog");
    this.root.hidden = true;
    host.append(this.root);
    sim.bus.subscribe((e) => {
      if (e.type === "TerminalOpened") this.focusIndex = 0;
      if (e.type === "TerminalOpened" || e.type === "TerminalClosed" || e.type === "TerminalSolved" || e.type === "GameLoaded") this.refresh();
    });
  }

  /** Leave the terminal. Returns whether one was open. */
  cancel(): boolean {
    if (!this.sim.terminal()) return false;
    this.sim.tick([{ type: "ExitTerminal" }]);
    this.refresh();
    return true;
  }

  private tap(index: number): void {
    this.focusIndex = index;
    this.sim.tick([{ type: "TerminalTap", index }]);
    this.refresh();
  }

  refresh(): void {
    const view = this.sim.terminal();
    if (!view) {
      this.root.hidden = true;
      return;
    }
    this.root.hidden = false;
    this.render(view);
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", cls = ""): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  private render(view: TerminalView): void {
    const root = this.root;
    root.replaceChildren(this.el("h2", view.title));
    const p = view.puzzle;
    const controls: HTMLButtonElement[] = [];
    let status = "";
    let hint = "";
    let body: HTMLElement;
    if (p.kind === "power_routing") {
      const targets = p.cells.filter((c) => c.isTarget);
      status = `Powered targets: ${targets.filter((c) => c.powered).length} of ${targets.length}`;
      hint = "Turn pieces to run power from the bolt (⚡) to every ring (◎).";
      body = this.routing(p, view.solved, controls);
    } else if (p.kind === "signal_path") {
      const targets = p.cells.filter((c) => c.isTarget);
      status = `Lit targets: ${targets.filter((c) => c.lit).length} of ${targets.length}${p.cells.some((c) => c.glyph === "X" && c.lit) ? ". A beam is hitting a hazard (✕)." : ""}`;
      hint = "Flip mirrors (tap a stroke) to steer each beam from its arrow to every ring (◎), and away from hazards (✕).";
      body = this.signal(p, view.solved, controls);
    } else if (p.kind === "schedule_align") {
      const clashes = p.collisions.filter(Boolean).length;
      const unmet = p.requirements.filter((r) => !r.met).length;
      status = `Clashing slots: ${clashes}. Unmet requirements: ${unmet}.`;
      hint = "Each tap slides a track one slot later (it wraps around). Make sure no two tracks are busy in the same slot, and every requirement (★) is met.";
      body = this.schedule(p, view.solved, controls);
    } else {
      const bad = p.outputs.filter((o) => o.forced === "contradiction").length;
      status = bad > 0 ? "The rules now contradict each other." : "The rules agree with themselves. Find an input that makes two of them demand opposite things.";
      hint = p.goal ? `Flip the inputs so two rules that apply at once disagree about: ${p.goal}.` : "Flip the inputs so two rules that apply at once disagree.";
      body = this.rules(p, view.solved, controls);
    }

    if (view.solved) {
      root.append(this.el("p", `ACCESS GRANTED. ${view.solvedText}`, "granted"));
    } else {
      root.append(this.el("p", `${hint} There is no confirm button: the terminal unlocks by itself the moment it is solved.`, "hint"));
      const st = this.el("p", status, "status");
      st.setAttribute("aria-live", "polite");
      root.append(st);
    }
    root.append(body);

    const leave = this.el("button", view.solved ? "Done (Esc)" : "Leave terminal (Esc)", "leave");
    leave.addEventListener("click", () => this.cancel());
    root.append(leave);
    if (view.solved) leave.focus();
    else (controls[Math.min(this.focusIndex, controls.length - 1)] ?? controls[0])?.focus();
  }

  private routing(p: Routing, solved: boolean, controls: HTMLButtonElement[]): HTMLElement {
    const grid = this.el("div", "", "qh-grid");
    grid.dataset.cols = String(p.width);
    grid.style.setProperty("--cols", String(p.width));
    p.cells.forEach((cell, i) => {
      const b = document.createElement("button");
      const sides = powerRouting.openSides(cell.piece, cell.rotation);
      const names = sides.map((s) => SIDE_NAMES[s]!).sort((a, c) => "NESW".indexOf(a) - "NESW".indexOf(c));
      b.className = `cell${cell.powered ? " on" : ""}${cell.isSource ? " source" : ""}${cell.isTarget ? " target" : ""}`;
      b.append(cellSvg(sides, cell.powered, cell.isSource, cell.isTarget));
      b.disabled = cell.piece === "." || solved;
      const role = cell.isSource ? ", power source" : cell.isTarget ? ", target" : "";
      b.setAttribute("aria-label", `${PIECE_NAMES[cell.piece] ?? cell.piece}${role}, open ${names.join("") || "nowhere"}, ${cell.powered ? "powered" : "unpowered"}`);
      b.addEventListener("click", () => this.tap(i));
      grid.append(b);
      controls[i] = b;
    });
    return grid;
  }

  private signal(p: Signal, solved: boolean, controls: HTMLButtonElement[]): HTMLElement {
    const grid = this.el("div", "", "qh-grid");
    grid.dataset.cols = String(p.width);
    grid.style.setProperty("--cols", String(p.width));
    p.cells.forEach((cell, i) => {
      const b = document.createElement("button");
      b.className = `cell sig${cell.lit ? " on" : ""}${cell.flippable ? " flip" : ""}`;
      b.append(signalSvg(cell.glyph, cell.lit, cell.isSource, cell.isTarget));
      b.disabled = !cell.flippable || solved;
      const what = cell.glyph === "#" ? "wall" : cell.glyph === "X" ? "hazard" : cell.glyph === "." ? "empty" : `${cell.flippable ? "flippable" : "fixed"} mirror ${cell.glyph === "/" ? "slash" : "backslash"}`;
      b.setAttribute("aria-label", `${what}${cell.isSource ? ", beam source" : ""}${cell.isTarget ? ", target" : ""}, ${cell.lit ? "beam passes" : "dark"}`);
      b.addEventListener("click", () => this.tap(i));
      grid.append(b);
      controls[i] = b;
    });
    return grid;
  }

  private schedule(p: Schedule, solved: boolean, controls: HTMLButtonElement[]): HTMLElement {
    const wrap = this.el("div", "", "qh-sched");
    wrap.style.setProperty("--slots", String(p.slots));
    const header = this.el("div", "", "row head");
    header.append(this.el("span", "", "name"));
    p.labels.forEach((l, s) => header.append(this.el("span", l, `slot${p.collisions[s] ? " clash" : ""}`)));
    wrap.append(header);
    for (const t of p.tracks) {
      const row = this.el("div", "", "row");
      const b = this.el("button", t.locked ? `${t.name} (fixed)` : `${t.name} ▸`, "name");
      b.type = "button";
      b.disabled = t.locked || solved;
      b.setAttribute("aria-label", t.locked ? `${t.name}, fixed` : `Slide ${t.name} one slot later`);
      b.addEventListener("click", () => this.tap(t.index));
      row.append(b);
      controls[t.index] = b;
      t.busy.forEach((on, s) => {
        const clash = on && p.collisions[s];
        row.append(this.el("span", on ? (clash ? "✕" : "■") : "·", `slot${on ? " busy" : ""}${clash ? " clash" : ""}`));
        row.lastElementChild?.setAttribute("aria-label", `${p.labels[s]}: ${on ? (clash ? "busy, clash" : "busy") : "free"}`);
      });
      wrap.append(row);
    }
    if (p.requirements.length > 0) {
      const req = this.el("ul", "", "reqs");
      for (const r of p.requirements) req.append(this.el("li", `★ ${r.track} must run at ${p.labels[r.slot]}: ${r.met ? "met" : "not yet"}`, r.met ? "met" : ""));
      wrap.append(req);
    }
    return wrap;
  }

  private rules(p: Rules, solved: boolean, controls: HTMLButtonElement[]): HTMLElement {
    const wrap = this.el("div", "", "qh-rules");
    wrap.append(this.el("h3", "Inputs"));
    const inputs = this.el("div", "", "inputs");
    for (const i of p.inputs) {
      const b = this.el("button", `${i.value ? "☑" : "☐"} ${i.name}${i.locked ? " (fixed)" : ""}`, `input${i.value ? " on" : ""}`);
      b.type = "button";
      b.disabled = i.locked || solved;
      b.setAttribute("aria-pressed", String(i.value));
      b.addEventListener("click", () => this.tap(i.index));
      inputs.append(b);
      controls[i.index] = b;
    }
    wrap.append(inputs, this.el("h3", "Rules"));
    const rules = this.el("ul", "", "rulelist");
    for (const r of p.rules) rules.append(this.el("li", `${r.applies ? "▶ " : "· "}${r.text}${r.applies ? " (applies)" : ""}`, r.applies ? "applies" : ""));
    wrap.append(rules, this.el("h3", "Decisions"));
    const out = this.el("ul", "", "outputs");
    for (const o of p.outputs) {
      const word = { none: "undecided", true: "yes", false: "no", contradiction: "CONTRADICTION" }[o.forced];
      out.append(this.el("li", `${o.name}: ${word}`, o.forced === "contradiction" ? "bad" : ""));
    }
    wrap.append(out);
    return wrap;
  }
}
