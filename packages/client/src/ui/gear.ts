import { powerUsed, slotsUsed, type EquipRefusal, type Sim } from "@qh/core";

const REFUSAL: Record<EquipRefusal | "recharging", string> = {
  unknown: "Unknown augment.",
  not_owned: "You do not own that.",
  already_equipped: "Already worn.",
  no_slots: "No free slot: take something off first.",
  no_power: "Not enough power: take something off first.",
  recharging: "Still recharging.",
};

/**
 * The wrist band panel (G): slots and power, every augment owned with a Wear/Remove button, and what you carry.
 * It does not freeze the world: swapping augments mid-chase is a real choice with a real cost.
 */
export class GearPanel {
  private readonly sim: Sim;
  private readonly root: HTMLElement;
  private note = "";

  constructor(sim: Sim, host: HTMLElement) {
    this.sim = sim;
    this.root = document.createElement("aside");
    this.root.className = "qh-panel qh-gear";
    this.root.setAttribute("aria-label", "Wrist band and belongings");
    this.root.hidden = true;
    host.append(this.root);
    sim.bus.subscribe((e) => {
      if (e.type === "AugmentRefused") this.note = REFUSAL[e.reason];
      else if (e.type === "AugmentEquipped" || e.type === "AugmentUnequipped") this.note = "";
      if (e.type.startsWith("Augment") || e.type === "BandUpgraded" || e.type === "ItemsChanged" || e.type === "CreditsChanged" || e.type === "PassGained" || e.type === "PassLost") this.refresh();
    });
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
    this.refresh();
    if (!this.root.hidden) this.root.querySelector<HTMLButtonElement>("button")?.focus();
  }

  /** Closes the panel if open; returns whether it was. */
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

  refresh(): void {
    if (this.root.hidden) return;
    const { state, content } = this.sim;
    const a = state.augments;
    const root = this.root;
    root.replaceChildren(this.el("h2", "Wrist band"));
    root.append(this.el("p", `Slots ${slotsUsed(state, content)}/${a.slots}   Power ${powerUsed(state, content)}/${a.powerBudget}`, "meters"));
    if (a.owned.length === 0) root.append(this.el("p", "No augments yet. They can be found, bought or built.", "hint"));
    const ul = this.el("ul");
    for (const id of a.owned) {
      const d = content.augments[id];
      if (!d) continue;
      const worn = a.equipped.includes(id);
      const li = this.el("li");
      const head = this.el("div", "", "head");
      head.append(this.el("strong", d.name), this.el("span", ` slot ${d.slotCost} · power ${d.power}`, "cost"));
      const btn = this.el("button", worn ? "Remove" : "Wear");
      btn.type = "button";
      btn.addEventListener("click", () => {
        this.sim.tick([{ type: worn ? "UnequipAugment" : "EquipAugment", id }]);
        this.refresh();
        this.root.querySelector<HTMLButtonElement>("button")?.focus();
      });
      head.append(btn);
      li.append(head, this.el("div", d.description, "desc"));
      const wait = (until: number) => Math.max(0, Math.ceil((until - state.tick) / this.sim.config.sim.ticksPerSecond));
      if (worn && d.jam && state.tick < a.jamReadyAt) li.append(this.el("div", `Recharging: ${wait(a.jamReadyAt)}s`, "desc"));
      if (worn && d.spoof && state.tick < a.spoofReadyAt) li.append(this.el("div", state.tick < a.spoofUntil ? "Active" : `Recharging: ${wait(a.spoofReadyAt)}s`, "desc"));
      ul.append(li);
    }
    root.append(ul);
    if (this.note) root.append(this.el("p", this.note, "note"));
    root.append(this.el("h3", "Carrying"));
    const items = Object.entries(state.inventory.items).map(([id, n]) => `${content.items[id]?.name ?? id.replace(/_/g, " ")}${n > 1 ? ` x${n}` : ""}`);
    root.append(this.el("p", `Credits ${state.inventory.credits}`));
    root.append(this.el("p", items.length > 0 ? items.join(", ") : "Nothing else.", "hint"));
    if (state.passes.length > 0) root.append(this.el("p", `Passes: ${state.passes.map((p) => p.label).join(", ")}`, "hint"));
    root.append(this.el("p", "G or Esc closes. Burst Jammer fires with F.", "hint"));
  }
}
