import { powerRouting, type Sim, type TerminalView } from "@qh/core";

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

/**
 * Terminal window for the power-routing puzzle (HAK-2). Cells are real buttons, so the keyboard works
 * (Tab to move, Enter or Space to turn, Esc to leave). Powered cells are bright cyan and unpowered ones dim, but
 * state is also in each button's accessible label, so colour is never the only signal (ACC-2).
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
      if (e.type === "TerminalOpened" || e.type === "TerminalClosed" || e.type === "TerminalSolved") this.refresh();
    });
  }

  /** Leave the terminal. Returns whether one was open. */
  cancel(): boolean {
    if (!this.sim.terminal()) return false;
    this.sim.tick([{ type: "ExitTerminal" }]);
    this.refresh();
    return true;
  }

  private rotate(index: number): void {
    this.focusIndex = index;
    this.sim.tick([{ type: "TerminalRotate", index }]);
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

  private render(view: TerminalView): void {
    const root = this.root;
    root.replaceChildren();
    const h = document.createElement("h2");
    h.textContent = view.title;
    root.append(h);

    const targets = view.cells.filter((c) => c.isTarget);
    const lit = targets.filter((c) => c.powered).length;

    if (view.solved) {
      const banner = document.createElement("p");
      banner.className = "granted";
      banner.textContent = `ACCESS GRANTED. ${view.solvedText}`;
      root.append(banner);
    } else {
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent =
        "Turn pieces to run power from the bolt (⚡) to every ring (◎). There is no confirm button: the terminal unlocks by itself the moment all rings are powered.";
      root.append(hint);
      const status = document.createElement("p");
      status.className = "status";
      status.setAttribute("aria-live", "polite");
      status.textContent = `Powered targets: ${lit} of ${targets.length}`;
      root.append(status);
    }

    const grid = document.createElement("div");
    grid.className = "qh-grid";
    grid.dataset.cols = String(view.width);
    grid.style.setProperty("--cols", String(view.width));
    view.cells.forEach((cell, i) => {
      const b = document.createElement("button");
      const sides = powerRouting.openSides(cell.piece, cell.rotation);
      const names = sides.map((s) => SIDE_NAMES[s]!).sort((a, c) => "NESW".indexOf(a) - "NESW".indexOf(c));
      b.className = `cell${cell.powered ? " on" : ""}${cell.isSource ? " source" : ""}${cell.isTarget ? " target" : ""}`;
      b.append(cellSvg(sides, cell.powered, cell.isSource, cell.isTarget));
      b.disabled = cell.piece === "." || view.solved;
      const role = cell.isSource ? ", power source" : cell.isTarget ? ", target" : "";
      b.setAttribute(
        "aria-label",
        `${PIECE_NAMES[cell.piece] ?? cell.piece}${role}, open ${names.join("") || "nowhere"}, ${cell.powered ? "powered" : "unpowered"}`,
      );
      b.addEventListener("click", () => this.rotate(i));
      grid.append(b);
    });
    root.append(grid);

    const leave = document.createElement("button");
    leave.className = "leave";
    leave.textContent = view.solved ? "Done (Esc)" : "Leave terminal (Esc)";
    leave.addEventListener("click", () => this.cancel());
    root.append(leave);

    // Keep the player's place in the grid; after solving there is nothing to turn, so focus the exit.
    if (view.solved) leave.focus();
    else (grid.children[this.focusIndex] as HTMLButtonElement | undefined)?.focus();
  }
}
