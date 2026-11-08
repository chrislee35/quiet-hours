import type { Sim } from "@qh/core";

/** Basic notebook panel (toggle with N). Search, linking and the quest log arrive with T2.12. */
export class NotebookPanel {
  private readonly sim: Sim;
  private root: HTMLElement;

  constructor(sim: Sim, host: HTMLElement) {
    this.sim = sim;
    this.root = document.createElement("aside");
    this.root.className = "qh-panel qh-notebook";
    this.root.setAttribute("aria-label", "Notebook");
    this.root.hidden = true;
    host.append(this.root);
    sim.bus.subscribe((e) => {
      if (e.type === "ClueGained" || e.type === "ClueStatusChanged") this.refresh();
    });
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
    this.refresh();
  }

  refresh(): void {
    if (this.root.hidden) return;
    const root = this.root;
    root.replaceChildren();
    const h = document.createElement("h2");
    h.textContent = "Notebook";
    root.append(h);
    const entries = this.sim.notebook();
    if (entries.length === 0) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "Empty. Facts you learn will be written here.";
      root.append(p);
      return;
    }
    const ul = document.createElement("ul");
    for (const e of entries) {
      const li = document.createElement("li");
      const text = document.createElement("span");
      text.textContent = e.text;
      if (e.status === "disproved") text.className = "disproved";
      const status = document.createElement("span");
      status.className = `status ${e.status}`;
      status.textContent = e.status === "unverified" ? "" : `(${e.status})`;
      const from = document.createElement("div");
      from.className = "from";
      from.textContent = `from ${e.from}`;
      li.append(text, status, from);
      ul.append(li);
    }
    root.append(ul);
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Not every clue is true. Cross-check what you learn.";
    root.append(hint);
  }
}
