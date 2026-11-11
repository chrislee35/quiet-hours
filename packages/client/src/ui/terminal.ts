import { powerRouting, type BoardView, type PuzzleView, type Sim, type TerminalView } from "@qh/core";
import { playNotes } from "../sound.ts";
import { circuitMarkup, ruleMarkup } from "./diagrams.ts";

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
type Lock = Extract<PuzzleView, { kind: "code_lock" }>;
type Fuses = Extract<PuzzleView, { kind: "lights_out" }>;
type Circuit = Extract<PuzzleView, { kind: "logic_circuit" }>;

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
    // Wide puzzles (a timetable with a column per hour, text-heavy boards) get a wider window than the grid puzzles.
    root.classList.toggle("wide", ["schedule_align", "board", "rule_contradiction", "logic_circuit"].includes(p.kind));
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
    } else if (p.kind === "board") {
      status = p.status;
      hint = p.hint;
      body = this.board(p, view.solved, controls);
    } else if (p.kind === "code_lock") {
      status = p.correct === null ? "The lock gives nothing away." : `Dials right: ${p.correct} of ${p.dials.length}`;
      hint = "Turn each dial (tap) to the right digit. The code is something you have to find out.";
      body = this.lock(p, view.solved, controls);
    } else if (p.kind === "lights_out") {
      status = `Fuses still lit: ${p.cells.filter((c) => c.lit).length}`;
      hint = "Tapping a fuse flips it and the fuses directly above, below and beside it. Switch every fuse off (○).";
      body = this.fuses(p, view.solved, controls);
    } else if (p.kind === "logic_circuit") {
      status = `Lamps right: ${p.goals.filter((g) => g.met).length} of ${p.goals.length}`;
      hint = "Flip the switches so every lamp shows what it needs to. Each lamp is wired to one gate; each gate reads the switches or earlier gates listed in its brackets. The line under each lamp spells out the whole chain with every value filled in.";
      body = this.circuit(p, view.solved, controls);
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

  /** The generic board: rows of buttons, lines of text, an optional plot and an optional Play button. */
  private board(p: BoardView, solved: boolean, controls: HTMLButtonElement[]): HTMLElement {
    const wrap = this.el("div", "", `qh-board of-${p.of}`);
    for (const row of p.rows) {
      const r = this.el("div", "", "brow");
      if (row.label) r.append(this.el("span", row.label, "blabel"));
      for (const c of row.controls) {
        const b = this.el("button", c.text, `bctl${c.tone ? ` ${c.tone}` : ""}${c.index < 0 ? " static" : ""}`);
        b.type = "button";
        b.setAttribute("aria-label", c.aria);
        b.disabled = c.disabled === true || solved;
        if (c.index >= 0) {
          b.addEventListener("click", () => {
            this.tap(c.index);
            if (c.midi !== undefined) playNotes([c.midi]);
          });
          controls[c.index] = b;
        } else b.tabIndex = -1;
        r.append(b);
      }
      wrap.append(r);
    }
    if (p.play && p.play.length > 0) {
      const notes = p.play;
      const play = this.el("button", "▶ Play", "bplay");
      play.type = "button";
      play.setAttribute("aria-label", "Play the melody");
      play.addEventListener("click", () => playNotes(notes));
      wrap.append(play);
    }
    if (p.plot) wrap.append(this.plot(p.plot));
    for (const l of p.lines) wrap.append(this.el("p", l.text, `bline${l.tone ? ` ${l.tone}` : ""}`));
    return wrap;
  }

  /** A small decision map: predicted class as tinted cells, readings as shapes (circle = inside, square = outside; hollow = held-out test). */
  private plot(pl: NonNullable<BoardView["plot"]>): SVGElement {
    const size = 200;
    const root = svg("svg", { viewBox: `0 0 ${size} ${size}`, class: "bplot", role: "img", "aria-label": "Map of the controller's decisions and the readings" });
    const cw = size / pl.cols;
    const ch = size / pl.rows;
    pl.cells.forEach((v, i) => {
      root.append(svg("rect", { x: (i % pl.cols) * cw, y: Math.floor(i / pl.cols) * ch, width: cw, height: ch, class: v > 0 ? "zin" : "zout" }));
    });
    for (const p of pl.points) {
      const x = ((p.x + 1) / 2) * size;
      const y = ((p.y + 1) / 2) * size;
      const cls = `pt ${p.t > 0 ? "in" : "out"}${p.test ? " test" : ""}`;
      root.append(p.t > 0 ? svg("circle", { cx: x, cy: y, r: 3.2, class: cls }) : svg("rect", { x: x - 3, y: y - 3, width: 6, height: 6, class: cls }));
    }
    return root;
  }

  private lock(p: Lock, solved: boolean, controls: HTMLButtonElement[]): HTMLElement {
    const wrap = this.el("div", "", "qh-lock");
    if (p.hint) wrap.append(this.el("p", p.hint, "lockhint"));
    const dials = this.el("div", "", "dials");
    for (const d of p.dials) {
      const b = this.el("button", String(d.digit), "dial");
      b.type = "button";
      b.disabled = solved;
      b.setAttribute("aria-label", `Dial ${d.index + 1} of ${p.dials.length}, showing ${d.digit}. Tap to turn it up one.`);
      b.addEventListener("click", () => this.tap(d.index));
      dials.append(b);
      controls[d.index] = b;
    }
    wrap.append(dials);
    return wrap;
  }

  private fuses(p: Fuses, solved: boolean, controls: HTMLButtonElement[]): HTMLElement {
    const grid = this.el("div", "", "qh-grid");
    grid.dataset.cols = String(p.width);
    grid.style.setProperty("--cols", String(p.width));
    p.cells.forEach((c, i) => {
      const b = this.el("button", c.present ? (c.lit ? "●" : "○") : "", `cell fuse${c.lit ? " on" : ""}`);
      b.type = "button";
      b.disabled = !c.present || solved;
      b.setAttribute("aria-label", c.present ? `Fuse, ${c.lit ? "lit" : "dark"}` : "no fuse");
      b.addEventListener("click", () => this.tap(i));
      grid.append(b);
      controls[i] = b;
    });
    return grid;
  }

  /** Mounts a drawing built from markup; clicking a switch (data-tap) taps it. Keyboard users have the buttons above. */
  private drawing(markup: string): HTMLElement {
    const holder = this.el("div", "", "qh-drawing");
    holder.innerHTML = markup; // markup comes from ui/diagrams.ts, which escapes every piece of content text
    holder.addEventListener("click", (e) => {
      const hit = (e.target as Element).closest("[data-tap]");
      if (hit instanceof Element) this.tap(Number(hit.getAttribute("data-tap")));
    });
    return holder;
  }

  private circuit(p: Circuit, solved: boolean, controls: HTMLButtonElement[]): HTMLElement {
    const wrap = this.el("div", "", "qh-rules");
    wrap.append(this.el("h3", "Switches"));
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
    wrap.append(inputs, this.el("h3", "Circuit"), this.drawing(circuitMarkup(p.diagram, solved)), this.el("h3", "Gates"));
    const gates = this.el("ul", "", "rulelist");
    for (const g of p.gates) {
      gates.append(this.el("li", `${g.id} = ${g.op}(${g.reads.join(", ")}) is ${g.value ? "ON" : "off"}   ⟶ feeds ${g.feeds.length > 0 ? g.feeds.join(", ") : "nothing"}`, g.value ? "applies" : ""));
    }
    wrap.append(gates, this.el("h3", "Lamps (each is wired to one gate)"));
    const goals = this.el("ul", "", "outputs");
    for (const g of p.goals) {
      const li = this.el("li", `${g.met ? "✓" : "✗"} ${g.name} lamp ⟵ ${g.node}: needs ${g.want ? "ON" : "off"}, is ${g.value ? "ON" : "off"}`, g.met ? "" : "bad");
      li.append(this.el("div", g.chain, "chain"));
      goals.append(li);
    }
    wrap.append(goals);
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
    wrap.append(inputs, this.el("h3", "Diagram"), this.drawing(ruleMarkup(p.diagram, solved)), this.el("h3", "Rules"));
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
