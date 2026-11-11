import { ACTIONS, HELD_ACTIONS, type Action, type HeldActions, type KeyBindings, type PadBindings } from "./actions.ts";
import { newPresses, noActions, padActions, type ActionState, type PadSnapshot } from "./gamepad.ts";

export type PressSource = "keyboard" | "pad" | "touch";
export type PressListener = (action: Action, source: PressSource) => void;

const ARROWS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/**
 * Turns keyboard and gamepad into one stream of logical actions (ACC-1): `held` for continuous input
 * (movement) and `onPress` for edges (interact, cancel, ...). Call `poll()` once per frame to sample the gamepad.
 */
export class InputController {
  readonly held: HeldActions = { up: false, down: false, left: false, right: false, run: false, sneak: false };
  private keys: KeyBindings;
  private readonly pad: PadBindings;
  private readonly down = new Set<string>();
  private padState: ActionState = noActions();
  private touchState: ActionState = noActions();
  private readonly listeners = new Set<PressListener>();
  private readonly getPad: () => PadSnapshot | null;
  /** True once a gamepad has been seen; lets the HUD show gamepad hints. */
  padConnected = false;
  /** Which device the player used last, so prompts and hints can name the right button. */
  lastSource: PressSource = "keyboard";

  constructor(win: EventTarget, keys: KeyBindings, pad: PadBindings, getPad: () => PadSnapshot | null) {
    this.keys = keys;
    this.pad = pad;
    this.getPad = getPad;
    win.addEventListener("keydown", (e) => this.onKeyDown(e as KeyboardEvent));
    win.addEventListener("keyup", (e) => {
      this.down.delete((e as KeyboardEvent).code);
      this.recompute();
    });
    // Releasing keys while the window is unfocused would otherwise leave them stuck "held".
    win.addEventListener("blur", () => {
      this.down.clear();
      this.recompute();
    });
  }

  setKeyBindings(keys: KeyBindings): void {
    this.keys = keys;
    this.recompute();
  }

  onPress(listener: PressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(action: Action, source: PressSource): void {
    this.lastSource = source;
    for (const l of this.listeners) l(action, source);
  }

  /** On-screen controls (touch): set which held actions (movement, run, sneak) they are holding right now. */
  setTouchHeld(state: Partial<ActionState>): void {
    this.touchState = { ...this.touchState, ...state };
    this.recompute();
  }

  /** On-screen controls: a button tap, delivered like any other press. */
  pressTouch(action: Action): void {
    this.emit(action, "touch");
  }

  private onKeyDown(e: KeyboardEvent): void {
    // Typing in a text field (the notebook search) must not walk the character or trigger actions; Escape still works.
    if (isTyping(e.target) && e.code !== "Escape") return;
    if (ARROWS.has(e.code)) e.preventDefault(); // arrows must not scroll the page
    if (e.repeat) return;
    this.down.add(e.code);
    this.recompute();
    for (const action of ACTIONS) if (this.keys[action].includes(e.code)) this.emit(action, "keyboard");
  }

  private recompute(): void {
    for (const a of HELD_ACTIONS) this.held[a] = this.keys[a].some((c) => this.down.has(c)) || this.padState[a] || this.touchState[a];
  }

  /** Sample the gamepad; fires pad press edges and merges pad movement into `held`. */
  poll(): void {
    const snap = this.getPad();
    if (snap) this.padConnected = true;
    const next = padActions(snap, this.pad);
    const pressed = newPresses(this.padState, next);
    this.padState = next;
    this.recompute();
    for (const a of pressed) this.emit(a, "pad");
  }
}

/** Reads the first connected gamepad from the browser. */
export function browserPad(nav: Navigator): () => PadSnapshot | null {
  return () => {
    const pads = nav.getGamepads?.() ?? [];
    const pad = pads.find((p): p is Gamepad => p !== null && p.connected);
    return pad ? { axes: pad.axes, buttons: pad.buttons } : null;
  };
}

/** True when the key press is going into a text box, a list or a text area. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  const tag = el?.tagName?.toUpperCase();
  return tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && !["button", "checkbox", "radio", "file", "submit"].includes(String((target as HTMLInputElement).type))) || el?.isContentEditable === true;
}
