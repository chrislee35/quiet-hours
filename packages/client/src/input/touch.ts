import type { Action } from "./actions.ts";
import type { ActionState } from "./gamepad.ts";

/** Fraction of the stick radius the thumb must move before it counts as a direction (a dead zone). */
export const STICK_DEADZONE = 0.3;
/** Past this (as a fraction of the radius) each axis counts as pushed; lets diagonals work. */
export const STICK_AXIS = 0.38;

type Dir = Pick<ActionState, "up" | "down" | "left" | "right">;

/**
 * Turns a thumb offset from the stick centre (pixels) into held directions. Pure, so it is unit-tested.
 * Inside the dead zone nothing is held; beyond it each axis is held once it passes STICK_AXIS of the radius,
 * which gives eight directions.
 */
export function stickActions(dx: number, dy: number, radius: number): Dir {
  const none: Dir = { up: false, down: false, left: false, right: false };
  if (radius <= 0) return none;
  const len = Math.hypot(dx, dy);
  if (len / radius < STICK_DEADZONE) return none;
  // Normalise so dragging far past the edge behaves like the edge.
  const nx = dx / Math.max(len, radius);
  const ny = dy / Math.max(len, radius);
  return { up: ny <= -STICK_AXIS, down: ny >= STICK_AXIS, left: nx <= -STICK_AXIS, right: nx >= STICK_AXIS };
}

/** What the page tells us about touch, so the decision to show controls is testable. */
export function wantsTouchControls(opts: { coarsePointer: boolean; touchPoints: number; search: string }): boolean {
  const q = new URLSearchParams(opts.search).get("touch");
  if (q === "1") return true;
  if (q === "0") return false;
  return opts.coarsePointer || opts.touchPoints > 0;
}

interface Sink {
  setTouchHeld(state: Partial<ActionState>): void;
  pressTouch(action: Action): void;
}

const TOUCH_CSS = `
.qh-touch { position: fixed; inset: 0; pointer-events: none; z-index: 20; touch-action: none; user-select: none; -webkit-user-select: none; }
.qh-touch > * { pointer-events: auto; touch-action: none; }
.qh-stick { position: absolute; left: calc(18px + env(safe-area-inset-left, 0px)); bottom: calc(18px + env(safe-area-inset-bottom, 0px));
  width: 150px; height: 150px; border-radius: 50%; background: #10121caa; border: 2px solid #5b6288; }
.qh-stick .knob { position: absolute; left: 50%; top: 50%; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%;
  background: #ffd36bcc; border: 2px solid #10121c; transition: transform 60ms; }
.qh-btns { position: absolute; right: calc(18px + env(safe-area-inset-right, 0px)); bottom: calc(18px + env(safe-area-inset-bottom, 0px));
  display: grid; grid-template-columns: repeat(2, 84px); gap: 12px; }
.qh-btn { height: 84px; border-radius: 50%; background: #10121caa; color: #dfe2f3; font: 600 15px/1.1 system-ui, sans-serif;
  border: 2px solid #5b6288; display: flex; align-items: center; justify-content: center; text-align: center; padding: 0; cursor: pointer; }
.qh-btn.big { grid-column: 1 / 3; width: 100%; height: 84px; border-radius: 42px; background: #ffd36bdd; color: #10121c; border-color: #10121c; font-size: 18px; }
.qh-btn.on { background: #1d8da3dd; border-color: #8ff6ff; color: #fff; }
.qh-btn:active { filter: brightness(1.4); }
.qh-top { position: absolute; right: calc(12px + env(safe-area-inset-right, 0px)); top: calc(12px + env(safe-area-inset-top, 0px)); display: flex; gap: 10px; }
.qh-top .qh-btn { width: 56px; height: 56px; font-size: 13px; }
.qh-rotate { position: fixed; inset: 0; z-index: 30; background: #07070cf2; color: #dfe2f3; display: none; align-items: center; justify-content: center;
  text-align: center; font: 18px/1.4 system-ui, sans-serif; padding: 24px; }
@media (orientation: portrait) { .qh-rotate.show { display: flex; } }
/* Windows get bigger tap targets on touch screens. */
.qh-touch-on .qh-choices button, .qh-touch-on .qh-picker button, .qh-touch-on .qh-terminal .leave { min-height: 48px; }
.qh-touch-on .qh-dialogue { bottom: calc(190px + env(safe-area-inset-bottom, 0px)); max-height: 42vh; }
.qh-touch-on .qh-hud { font-size: .75em; }
.qh-touch-on .qh-notebook { top: 84px; }
`;

/**
 * On-screen controls for touch screens (a thumb stick, a big Use button, Run and Sneak toggles, Notebook and Back).
 * Added for playtesters on tablets and phones. Multi-touch works: the stick tracks its own pointer, so you can
 * hold a direction and tap Use at the same time. Run and Sneak are toggles because a thumb is busy steering.
 */
export class TouchControls {
  private readonly sink: Sink;
  private readonly root: HTMLElement;
  private readonly knob: HTMLElement;
  private stickPointer: number | null = null;
  private center = { x: 0, y: 0 };
  private radius = 75;
  private run = false;
  private sneak = false;
  private runBtn!: HTMLButtonElement;
  private sneakBtn!: HTMLButtonElement;

  constructor(sink: Sink, host: HTMLElement) {
    this.sink = sink;
    const style = document.createElement("style");
    style.textContent = TOUCH_CSS;
    document.head.append(style);
    document.body.classList.add("qh-touch-on");

    this.root = document.createElement("div");
    this.root.className = "qh-touch";
    this.root.setAttribute("aria-label", "On-screen controls");

    const stick = document.createElement("div");
    stick.className = "qh-stick";
    this.knob = document.createElement("div");
    this.knob.className = "knob";
    stick.append(this.knob);
    this.bindStick(stick);

    const buttons = document.createElement("div");
    buttons.className = "qh-btns";
    const use = this.button("Use", "big", () => sink.pressTouch("interact"));
    this.runBtn = this.button("Run", "", () => this.toggle("run"));
    this.sneakBtn = this.button("Sneak", "", () => this.toggle("sneak"));
    buttons.append(use, this.runBtn, this.sneakBtn);

    const top = document.createElement("div");
    top.className = "qh-top";
    top.append(this.button("Gear", "", () => sink.pressTouch("gear")), this.button("Pulse", "", () => sink.pressTouch("pulse")), this.button("Tool", "", () => sink.pressTouch("tool")), this.button("Notes", "", () => sink.pressTouch("notebook")), this.button("Back", "", () => sink.pressTouch("cancel")));

    this.root.append(stick, buttons, top);
    host.append(this.root);

    const rotate = document.createElement("div");
    rotate.className = "qh-rotate show";
    rotate.textContent = "Please rotate your device to landscape to play.";
    host.append(rotate);
  }

  private button(label: string, cls: string, onTap: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = `qh-btn ${cls}`.trim();
    b.textContent = label;
    b.type = "button";
    // pointerdown (not click) so a tap registers instantly, even while the other thumb is on the stick.
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      onTap();
    });
    return b;
  }

  /** Run and Sneak are mutually exclusive toggles. */
  private toggle(which: "run" | "sneak"): void {
    if (which === "run") {
      this.run = !this.run;
      if (this.run) this.sneak = false;
    } else {
      this.sneak = !this.sneak;
      if (this.sneak) this.run = false;
    }
    this.runBtn.classList.toggle("on", this.run);
    this.sneakBtn.classList.toggle("on", this.sneak);
    this.runBtn.setAttribute("aria-pressed", String(this.run));
    this.sneakBtn.setAttribute("aria-pressed", String(this.sneak));
    this.sink.setTouchHeld({ run: this.run, sneak: this.sneak });
  }

  private bindStick(stick: HTMLElement): void {
    const move = (e: PointerEvent) => {
      const dx = e.clientX - this.center.x;
      const dy = e.clientY - this.center.y;
      this.sink.setTouchHeld(stickActions(dx, dy, this.radius));
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(len, this.radius * 0.6) / len; // the knob stays inside the ring
      this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    };
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.knob.style.transform = "translate(0, 0)";
      this.sink.setTouchHeld({ up: false, down: false, left: false, right: false });
    };
    stick.addEventListener("pointerdown", (e) => {
      if (this.stickPointer !== null) return;
      e.preventDefault();
      this.stickPointer = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      const r = stick.getBoundingClientRect();
      this.center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this.radius = r.width / 2;
      move(e);
    });
    stick.addEventListener("pointermove", (e) => {
      if (e.pointerId === this.stickPointer) move(e);
    });
    stick.addEventListener("pointerup", release);
    stick.addEventListener("pointercancel", release);
  }

  /** Hides the "rotate your device" notice once the screen is wide enough (CSS also handles orientation). */
  dispose(): void {
    this.root.remove();
    document.body.classList.remove("qh-touch-on");
  }
}
