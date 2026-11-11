import { formatTime, gameTimeAt } from "@qh/core";
import type { Game, Slot } from "../saves.ts";
import { SLOTS } from "../saves.ts";

const NAMES: Record<Slot, string> = { autosave: "Autosave", slot1: "Slot 1", slot2: "Slot 2", slot3: "Slot 3" };

/**
 * The pause menu (Esc, or Back on touch): save and load slots, export and import a save file, ask the browser to
 * keep saves, and start over. It does not freeze the world on its own; opening it is a choice made when calm.
 */
export class MenuPanel {
  private readonly game: Game;
  private readonly root: HTMLElement;
  private message = "";
  private confirmNew = false;
  private persistNote = "";
  private readonly build: string;
  private readonly openSettings: () => void;

  constructor(game: Game, host: HTMLElement, build: string, openSettings: () => void) {
    this.openSettings = openSettings;
    this.game = game;
    this.build = build;
    this.root = document.createElement("aside");
    this.root.className = "qh-panel qh-menu";
    this.root.setAttribute("aria-label", "Menu");
    this.root.hidden = true;
    host.append(this.root);
    game.sim.bus.subscribe((e) => {
      if (e.type === "GameLoaded") this.refresh();
    });
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
    this.message = "";
    this.confirmNew = false;
    this.refresh();
    if (!this.root.hidden) this.root.querySelector<HTMLButtonElement>("button")?.focus();
  }

  /** Opens the menu with a message already showing (e.g. "Autosave found"). */
  show(message: string): void {
    this.root.hidden = false;
    this.message = message;
    this.confirmNew = false;
    this.refresh();
  }

  cancel(): boolean {
    if (this.root.hidden) return false;
    this.toggle();
    return true;
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", cls = ""): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  private button(text: string, on: () => void, disabled = false): HTMLButtonElement {
    const b = this.el("button", text);
    b.type = "button";
    b.disabled = disabled;
    b.addEventListener("click", on);
    return b;
  }

  private say(message: string): void {
    this.message = message;
    this.refresh();
  }

  refresh(): void {
    if (this.root.hidden) return;
    const root = this.root;
    root.replaceChildren(this.el("h2", "Menu"));
    const list = this.el("ul");
    for (const slot of SLOTS) {
      const info = this.game.store.info(slot);
      const li = this.el("li");
      const head = this.el("div", "", "head");
      head.append(this.el("strong", NAMES[slot]));
      head.append(this.el("span", info ? ` ${info.meta.label}` : " empty", "desc"));
      if (slot !== "autosave") head.append(this.button("Save", () => this.say(this.game.save(slot).message)));
      head.append(this.button("Load", () => {
        const r = this.game.load(slot);
        if (r.ok) this.toggle();
        else this.say(r.message);
      }, info === null));
      li.append(head);
      list.append(li);
    }
    root.append(list);
    if (this.message) root.append(this.el("p", this.message, "note"));

    root.append(this.el("h3", "Settings"));
    root.append(this.button("Settings: text size, colours, controls…", () => this.openSettings()));

    root.append(this.el("h3", "Save file"));
    const row = this.el("div", "", "head");
    row.append(this.button("Export", () => this.download()));
    const file = this.el("input");
    file.type = "file";
    file.accept = "application/json,.json";
    file.setAttribute("aria-label", "Import a save file");
    file.addEventListener("change", () => {
      const f = file.files?.[0];
      if (!f) return;
      void f.text().then((t) => {
        const r = this.game.loadText(t);
        if (r.ok) this.toggle();
        else this.say(r.message);
      });
    });
    row.append(file);
    root.append(row);
    root.append(this.el("p", "Saves live in this browser only. Export keeps a copy as a file, and Import loads one.", "hint"));
    if ("storage" in navigator && typeof navigator.storage?.persist === "function") {
      root.append(this.button("Ask the browser to keep my saves", () => {
        void navigator.storage.persist().then((ok) => {
          this.persistNote = ok ? "The browser will keep your saves." : "The browser declined; use Export to keep a copy.";
          this.refresh();
        });
      }));
      if (this.persistNote) root.append(this.el("p", this.persistNote, "hint"));
    }

    root.append(this.el("h3", "New game"));
    root.append(
      this.confirmNew
        ? this.button("Really start over? Saves are kept.", () => {
            this.game.newGame();
            this.toggle();
          })
        : this.button("New game", () => {
            this.confirmNew = true;
            this.refresh();
          }),
    );
    const t = gameTimeAt(this.game.sim.state.tick, this.game.sim.config);
    root.append(this.el("p", `${formatTime(t)} · build ${this.build} · Esc closes`, "hint"));
  }

  private download(): void {
    const blob = new Blob([this.game.exportText()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quiet-hours-save-${this.build}-t${this.game.sim.state.tick}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.say("Exported.");
  }
}
