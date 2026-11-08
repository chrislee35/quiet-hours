import { powerRouting, type Sim, type TerminalView } from "@qh/core";

const GLYPH: Record<string, string> = {
  "": " ", N: "╵", E: "╶", S: "╷", W: "╴", NS: "│", EW: "─", NE: "└", ES: "┌", SW: "┐", NW: "┘",
  NES: "├", ESW: "┬", NSW: "┤", NEW: "┴", NESW: "┼",
};
const SIDE_NAMES = ["N", "E", "S", "W"] as const;
const PIECE_NAMES: Record<string, string> = { I: "straight pipe", L: "corner", T: "tee junction", "+": "cross junction", E: "dead end", ".": "empty" };

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
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.sim.terminal() && !e.repeat) {
        this.sim.tick([{ type: "ExitTerminal" }]);
        this.refresh();
        e.preventDefault();
      }
    });
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

    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = view.solved
      ? view.solvedText
      : "Turn the pipes until power (bright) reaches every target (◎). Click or press Enter to turn a piece.";
    root.append(hint);

    const grid = document.createElement("div");
    grid.className = "qh-grid";
    grid.style.gridTemplateColumns = `repeat(${view.width}, 3.2em)`;
    view.cells.forEach((cell, i) => {
      const b = document.createElement("button");
      const sides = powerRouting.openSides(cell.piece, cell.rotation).map((s) => SIDE_NAMES[s]!).sort((a, c) => "NESW".indexOf(a) - "NESW".indexOf(c));
      b.className = `cell${cell.powered ? " on" : ""}${cell.isSource ? " source" : ""}${cell.isTarget ? " target" : ""}`;
      b.textContent = GLYPH[sides.join("")] ?? "?";
      b.disabled = cell.piece === "." || view.solved;
      const role = cell.isSource ? ", power source" : cell.isTarget ? ", target" : "";
      b.setAttribute(
        "aria-label",
        `${PIECE_NAMES[cell.piece] ?? cell.piece}${role}, open ${sides.join("") || "nowhere"}, ${cell.powered ? "powered" : "unpowered"}`,
      );
      if (cell.isSource) b.dataset.mark = "⚡";
      if (cell.isTarget) b.dataset.mark = cell.powered ? "◉" : "◎";
      b.addEventListener("click", () => this.rotate(i));
      grid.append(b);
    });
    root.append(grid);

    const leave = document.createElement("button");
    leave.className = "leave";
    leave.textContent = "Leave terminal (Esc)";
    leave.addEventListener("click", () => {
      this.sim.tick([{ type: "ExitTerminal" }]);
      this.refresh();
    });
    root.append(leave);

    const buttons = grid.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    (grid.children[this.focusIndex] as HTMLButtonElement | undefined)?.focus();
    if (document.activeElement === document.body) buttons[0]?.focus();
  }
}
