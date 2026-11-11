import {
  ACTIONS, ACTION_NAMES, keyName, padButtonName, rebindKey, rebindPad, resetBindings, saveBindings, savePadBindings,
  DEFAULT_KEYS, DEFAULT_PAD, loadBindings, loadPadBindings, type Action, type KeyBindings, type PadBindings,
} from "../input/actions.ts";
import type { InputController } from "../input/controller.ts";
import { PALETTES, PALETTE_IDS, type PaletteId } from "../palette.ts";
import type { SettingsStore } from "../settings-store.ts";
import { TEXT_SCALES, type TextScale } from "../settings.ts";
import { playNotes } from "../sound.ts";
import type { safeStorage } from "../storage.ts";

/**
 * Settings (ACC-1/2/3, HAK-3): display (text size, colour palette, reduced motion), alert sounds, the puzzle-skip
 * assist, and rebinding of keyboard and gamepad controls. Changes apply immediately and are remembered.
 */
export class SettingsPanel {
  private readonly root: HTMLElement;
  private readonly store: SettingsStore;
  private readonly controller: InputController;
  private readonly storage: ReturnType<typeof safeStorage>;
  private keys: KeyBindings;
  private pad: PadBindings;
  private listening: { action: Action; device: "key" | "pad" } | null = null;
  private message = "";
  private stopListening: (() => void) | null = null;

  constructor(store: SettingsStore, controller: InputController, storage: ReturnType<typeof safeStorage>, host: HTMLElement) {
    this.store = store;
    this.controller = controller;
    this.storage = storage;
    this.keys = loadBindings(storage);
    this.pad = loadPadBindings(storage);
    this.root = document.createElement("aside");
    this.root.className = "qh-panel qh-settings";
    this.root.setAttribute("aria-label", "Settings");
    this.root.hidden = true;
    host.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /** True while waiting for a key or button: the press must go to rebinding, not to the game. */
  get capturing(): boolean {
    return this.listening !== null;
  }

  toggle(): void {
    this.cancelListening();
    this.root.hidden = !this.root.hidden;
    this.message = "";
    this.refresh();
    if (!this.root.hidden) this.root.querySelector<HTMLElement>("select, button")?.focus();
  }

  /** Esc: stop listening for a key if that is what we were doing, otherwise close. Returns whether anything was open. */
  cancel(): boolean {
    if (this.root.hidden) return false;
    if (this.listening) this.cancelListening();
    else this.toggle();
    this.refresh();
    return true;
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", cls = ""): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  private button(text: string, on: () => void, aria?: string): HTMLButtonElement {
    const b = this.el("button", text);
    b.type = "button";
    if (aria) b.setAttribute("aria-label", aria);
    b.addEventListener("click", on);
    return b;
  }

  private field(label: string, control: HTMLElement, help = ""): HTMLElement {
    const row = this.el("label", "", "field");
    row.append(this.el("span", label, "fname"), control);
    if (help) row.append(this.el("span", help, "fhelp"));
    return row;
  }

  private check(label: string, checked: boolean, on: (v: boolean) => void, help: string): HTMLElement {
    const box = this.el("input");
    box.type = "checkbox";
    box.checked = checked;
    box.addEventListener("change", () => on(box.checked));
    return this.field(label, box, help);
  }

  refresh(): void {
    if (this.root.hidden) return;
    const s = this.store.get();
    const root = this.root;
    root.replaceChildren(this.el("h2", "Settings"));

    root.append(this.el("h3", "Display"));
    const scale = this.el("select");
    for (const t of TEXT_SCALES) {
      const o = this.el("option", `${t}%`);
      o.value = String(t);
      o.selected = t === s.textScale;
      scale.append(o);
    }
    scale.addEventListener("change", () => this.store.update({ textScale: Number(scale.value) as TextScale }));
    root.append(this.field("Text size", scale, "Scales every window. 200% is for low vision."));
    const palette = this.el("select");
    for (const id of PALETTE_IDS) {
      const o = this.el("option", PALETTES[id].name);
      o.value = id;
      o.selected = id === s.palette;
      palette.append(o);
    }
    palette.addEventListener("change", () => this.store.update({ palette: palette.value as PaletteId }));
    root.append(this.field("Colours", palette, "Shapes and words always say the same as colour does; palettes make the colours easier to tell apart."));
    root.append(this.check("Reduce motion", s.reduceMotion, (v) => this.store.update({ reduceMotion: v }), "Steadier camera, and no flashing or pulsing effects."));

    root.append(this.el("h3", "Sound"));
    const cues = this.check("Alert sounds", s.alertCues, (v) => this.store.update({ alertCues: v }), "A short beep when the city gets more suspicious: one, two or three.");
    cues.append(this.button("Test", () => playNotes([83, 83, 83], 160), "Play the highest alert sound"));
    root.append(cues);

    root.append(this.el("h3", "Assists"));
    root.append(this.check("Puzzle skip", s.puzzleSkip, (v) => this.store.update({ puzzleSkip: v }), "After many attempts at a puzzle you can skip it. The game never requires it, and it is kept in your save."));

    root.append(this.el("h3", "Controls"));
    if (this.message) root.append(this.el("p", this.message, "note"));
    const table = this.el("table", "", "keys");
    const head = this.el("tr");
    for (const h of ["Action", "Keyboard", "", "Gamepad", ""]) head.append(this.el("th", h));
    table.append(head);
    for (const a of ACTIONS) {
      const tr = this.el("tr");
      tr.append(this.el("td", ACTION_NAMES[a]));
      const waitingKey = this.listening?.action === a && this.listening.device === "key";
      const waitingPad = this.listening?.action === a && this.listening.device === "pad";
      tr.append(this.el("td", waitingKey ? "Press a key… (Esc cancels)" : this.keys[a].map(keyName).join(" / ") || "unbound", this.keys[a].length === 0 ? "bad" : ""));
      const kb = this.el("td");
      kb.append(this.button("Rebind", () => this.listen(a, "key"), `Rebind keyboard for ${ACTION_NAMES[a]}`));
      tr.append(kb);
      tr.append(this.el("td", waitingPad ? "Press a button… (Esc cancels)" : this.pad[a].map(padButtonName).join(" / ") || "unbound", this.pad[a].length === 0 ? "muted" : ""));
      const pb = this.el("td");
      pb.append(this.button("Rebind", () => this.listen(a, "pad"), `Rebind gamepad for ${ACTION_NAMES[a]}`));
      tr.append(pb);
      table.append(tr);
    }
    const wrap = this.el("div", "", "tablewrap");
    wrap.append(table);
    root.append(wrap);
    root.append(this.button("Reset controls to defaults", () => {
      this.keys = DEFAULT_KEYS;
      this.pad = DEFAULT_PAD;
      resetBindings(this.storage);
      this.controller.setKeyBindings(this.keys);
      this.controller.setPadBindings(this.pad);
      this.message = "Controls reset.";
      this.refresh();
    }));
    root.append(this.el("p", "Esc closes.", "hint"));
  }

  private cancelListening(): void {
    this.stopListening?.();
    this.stopListening = null;
    this.listening = null;
  }

  private listen(action: Action, device: "key" | "pad"): void {
    this.cancelListening();
    this.listening = { action, device };
    this.message = "";
    this.refresh();
    if (device === "key") {
      const onKey = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.code === "Escape") {
          this.cancelListening();
          this.refresh();
          return;
        }
        this.applyKey(action, e.code);
      };
      window.addEventListener("keydown", onKey, true);
      this.stopListening = () => window.removeEventListener("keydown", onKey, true);
    } else {
      this.controller.readPadButton(); // forget buttons already held
      const timer = window.setInterval(() => {
        const b = this.controller.readPadButton();
        if (b !== null) this.applyPad(action, b);
      }, 60);
      const stop = window.setTimeout(() => {
        this.cancelListening();
        this.message = "No button pressed.";
        this.refresh();
      }, 8000);
      this.stopListening = () => {
        window.clearInterval(timer);
        window.clearTimeout(stop);
      };
    }
  }

  private applyKey(action: Action, code: string): void {
    const { map, displaced } = rebindKey(this.keys, action, code);
    this.cancelListening();
    if (displaced.includes("cancel") && map.cancel.length === 0) {
      this.message = `${keyName(code)} is needed to go back and open the menu; choose another key.`;
    } else {
      this.keys = map;
      saveBindings(this.storage, map);
      this.controller.setKeyBindings(map);
      this.message = displaced.length > 0 ? `${keyName(code)} now does “${ACTION_NAMES[action]}”. It no longer does: ${displaced.map((d) => ACTION_NAMES[d]).join(", ")}${displaced.some((d) => map[d].length === 0) ? " (now unbound: rebind it)" : ""}.` : `${ACTION_NAMES[action]} is now ${keyName(code)}.`;
    }
    this.refresh();
  }

  private applyPad(action: Action, button: number): void {
    const { map, displaced } = rebindPad(this.pad, action, button);
    this.cancelListening();
    if (displaced.includes("cancel") && map.cancel.length === 0) {
      this.message = `${padButtonName(button)} is needed to go back and open the menu; choose another button.`;
    } else {
      this.pad = map;
      savePadBindings(this.storage, map);
      this.controller.setPadBindings(map);
      this.message = displaced.length > 0 ? `${padButtonName(button)} now does “${ACTION_NAMES[action]}”. It no longer does: ${displaced.map((d) => ACTION_NAMES[d]).join(", ")}.` : `${ACTION_NAMES[action]} is now ${padButtonName(button)}.`;
    }
    this.refresh();
  }
}
