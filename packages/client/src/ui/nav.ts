import type { Sim } from "@qh/core";
import type { InputController } from "../input/controller.ts";

interface Closable {
  cancel(): boolean;
}
interface Toggleable {
  readonly visible: boolean;
  toggle(): void;
}

/** Buttons the player can currently move between: the open window's enabled buttons, in order. */
function focusables(): HTMLButtonElement[] {
  const panel = document.querySelector<HTMLElement>(".qh-dialogue:not([hidden]), .qh-terminal:not([hidden])");
  return panel ? [...panel.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")] : [];
}

/** Move keyboard focus: sequentially in lists; by row and column in the terminal's grid. */
function moveFocus(dx: number, dy: number): void {
  const items = focusables();
  if (items.length === 0) return;
  const active = document.activeElement as HTMLElement | null;
  const grid = active?.closest<HTMLElement>(".qh-grid");
  if (grid && active) {
    const cols = Number(grid.dataset.cols ?? 1);
    const cells = [...grid.children] as HTMLButtonElement[];
    const at = cells.indexOf(active as HTMLButtonElement);
    const target = cells[at + dx + dy * cols];
    // Stay in the grid at its edges; the leave button below is reached by moving down from the bottom row.
    if (target && !target.disabled && !(dx !== 0 && Math.floor((at + dx) / cols) !== Math.floor(at / cols))) {
      target.focus();
      return;
    }
    if (dy > 0 && at + cols >= cells.length) items.at(-1)?.focus();
    return;
  }
  const i = active ? items.indexOf(active as HTMLButtonElement) : -1;
  const step = dx + dy; // left/up = -1, right/down = +1
  items[Math.max(0, Math.min(items.length - 1, (i < 0 ? 0 : i) + step))]?.focus();
}

/**
 * Connects logical actions to the windows (keyboard and gamepad alike): cancel closes the topmost window,
 * notebook toggles the panel, and while a window is open the d-pad/arrows move focus and the pad's A button presses it.
 */
export function bindUi(
  controller: InputController,
  sim: Sim,
  ui: { dialogue: Closable; terminal: Closable; notebook: Toggleable },
): void {
  controller.onPress((action, source) => {
    const windowOpen = sim.state.conversation !== null || sim.state.terminal !== null;
    if (action === "notebook") {
      ui.notebook.toggle();
    } else if (action === "cancel") {
      if (!ui.terminal.cancel() && !ui.dialogue.cancel() && ui.notebook.visible) ui.notebook.toggle();
    } else if (windowOpen) {
      if (action === "up") moveFocus(0, -1);
      else if (action === "down") moveFocus(0, 1);
      else if (action === "left") moveFocus(-1, 0);
      else if (action === "right") moveFocus(1, 0);
      else if (action === "interact" && source === "pad") (document.activeElement as HTMLElement | null)?.click();
    }
  });
}
