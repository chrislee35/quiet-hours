import { searchNotebook, tagKinds, type ClueStatus, type NotebookItem, type Sim } from "@qh/core";
import { mapMarkup } from "./diagrams.ts";

type Tab = "clues" | "quests" | "map";
const TAB_NAMES: Record<Tab, string> = { clues: "Clues", quests: "Quests", map: "Map" };
const STATUS_WORDS: Record<ClueStatus, string> = { unverified: "unverified", verified: "verified", disproved: "disproved" };
const KIND_WORDS = { supports: "supports", contradicts: "contradicts", updates: "updates" } as const;

/**
 * The notebook (N): clues with search, filters and your own links; a quest log derived from what you know; and a map
 * that annotates itself as you learn. It pauses the game while open. Nothing here ever shows whether a clue is
 * actually true: only what you have verified or disproved (CLU-5).
 */
export class NotebookPanel {
  private readonly sim: Sim;
  private readonly root: HTMLElement;
  private tab: Tab = "clues";
  private query = "";
  private status: ClueStatus | "all" = "all";
  private tag = "";
  /** The clue being linked: the next "Link to this" press completes the link. */
  private linking: string | null = null;

  constructor(sim: Sim, host: HTMLElement) {
    this.sim = sim;
    this.root = document.createElement("aside");
    this.root.className = "qh-panel qh-notebook";
    this.root.setAttribute("aria-label", "Notebook");
    this.root.hidden = true;
    host.append(this.root);
    sim.bus.subscribe((e) => {
      if (["ClueGained", "ClueStatusChanged", "CluesLinked", "CluesUnlinked", "GameLoaded", "FlagSet", "ZoneEntered", "ConversationStarted"].includes(e.type)) this.refresh();
    });
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
    this.linking = null;
    this.refresh();
    if (!this.root.hidden) this.root.querySelector<HTMLButtonElement>(".tabs button")?.focus();
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", cls = ""): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  private button(text: string, on: () => void, cls = "", aria?: string): HTMLButtonElement {
    const b = this.el("button", text, cls);
    b.type = "button";
    if (aria) b.setAttribute("aria-label", aria);
    b.addEventListener("click", on);
    return b;
  }

  refresh(): void {
    if (this.root.hidden) return;
    const root = this.root;
    const keep = document.activeElement instanceof HTMLInputElement && this.root.contains(document.activeElement) ? { id: document.activeElement.id, at: document.activeElement.selectionStart } : null;
    root.replaceChildren(this.el("h2", "Notebook"));
    const tabs = this.el("div", "", "tabs");
    tabs.setAttribute("role", "tablist");
    for (const t of Object.keys(TAB_NAMES) as Tab[]) {
      const b = this.button(TAB_NAMES[t], () => {
        this.tab = t;
        this.refresh();
      }, t === this.tab ? "on" : "");
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(t === this.tab));
      tabs.append(b);
    }
    root.append(tabs);
    if (this.tab === "clues") this.clues(root);
    else if (this.tab === "quests") this.quests(root);
    else this.map(root);
    root.append(this.el("p", "Not every clue is true. Cross-check what you learn. Esc or N closes.", "hint"));
    if (keep) {
      const input = root.querySelector<HTMLInputElement>(`#${keep.id}`);
      input?.focus();
      if (input && keep.at !== null) input.setSelectionRange(keep.at, keep.at);
    }
  }

  // ---- Clues ------------------------------------------------------------------------------

  private clues(root: HTMLElement): void {
    const all = this.sim.notebookItems();
    const bar = this.el("div", "", "bar");
    const search = this.el("input");
    search.type = "search";
    search.id = "nb-search";
    search.placeholder = "Search clues…";
    search.value = this.query;
    search.setAttribute("aria-label", "Search clues");
    search.addEventListener("input", () => {
      this.query = search.value;
      this.refresh();
    });
    const status = this.el("select");
    status.setAttribute("aria-label", "Filter by status");
    for (const s of ["all", "unverified", "verified", "disproved"] as const) {
      const o = this.el("option", s === "all" ? "Any status" : STATUS_WORDS[s]);
      o.value = s;
      o.selected = s === this.status;
      status.append(o);
    }
    status.addEventListener("change", () => {
      this.status = status.value as ClueStatus | "all";
      this.refresh();
    });
    bar.append(search, status);
    root.append(bar);
    const kinds = tagKinds(all);
    if (kinds.length > 0) {
      const chips = this.el("div", "", "chips");
      for (const k of ["", ...kinds]) {
        const b = this.button(k === "" ? "All" : k, () => {
          this.tag = this.tag === k ? "" : k;
          this.refresh();
        }, k === this.tag ? "on" : "");
        b.setAttribute("aria-pressed", String(k === this.tag));
        chips.append(b);
      }
      root.append(chips);
    }

    for (const c of this.sim.conflicts()) {
      const a = all.find((i) => i.clueId === c.a);
      const b = all.find((i) => i.clueId === c.b);
      if (!a || !b) continue;
      root.append(this.el("p", c.resolved ? `Settled: you have checked “${a.text}” against “${b.text}”.` : `⚠ These two disagree: “${a.text}” and “${b.text}”. Find someone who can tell you which.`, `conflict${c.resolved ? " settled" : ""}`));
    }

    if (this.linking) {
      const src = all.find((i) => i.clueId === this.linking);
      const banner = this.el("p", `Linking “${src?.text ?? ""}”: choose another clue to link it to.`, "linking");
      banner.append(this.button("Cancel", () => {
        this.linking = null;
        this.refresh();
      }));
      root.append(banner);
    }

    const shown = searchNotebook(all, { query: this.query, status: this.status, ...(this.tag ? { tag: this.tag } : {}) });
    if (all.length === 0) {
      root.append(this.el("p", "Empty. Facts you learn will be written here.", "hint"));
      return;
    }
    if (shown.length === 0) root.append(this.el("p", "Nothing matches.", "hint"));
    const ul = this.el("ul");
    for (const it of shown) ul.append(this.item(it, all));
    root.append(ul);
  }

  private item(it: NotebookItem, all: readonly NotebookItem[]): HTMLElement {
    const li = this.el("li");
    const text = this.el("span", it.text, it.status === "disproved" ? "disproved" : "");
    const status = this.el("span", it.status === "unverified" ? "" : `(${it.status})`, `status ${it.status}`);
    li.append(text, status);
    li.append(this.el("div", `from ${it.from}${it.tags.length ? ` · ${it.tags.join(", ")}` : ""}`, "from"));
    const name = (id: string) => `“${all.find((i) => i.clueId === id)?.text ?? id}”`;
    for (const r of it.related) li.append(this.el("div", `${r.direction === "to" ? KIND_WORDS[r.kind] : `is ${r.kind === "updates" ? "updated by" : r.kind === "supports" ? "supported by" : "contradicted by"}`} ${name(r.clueId)}`, `rel ${r.kind}`));
    for (const id of it.linked) {
      const row = this.el("div", `↔ you linked it to ${name(id)} `, "rel mine");
      row.append(this.button("Unlink", () => this.sim.tick([{ type: "UnlinkClues", a: it.clueId, b: id }]), "small", `Unlink from ${all.find((i) => i.clueId === id)?.text ?? id}`));
      li.append(row);
    }
    const row = this.el("div", "", "actions");
    if (this.linking === null) {
      row.append(this.button("Link to another clue…", () => {
        this.linking = it.clueId;
        this.refresh();
      }, "small"));
    } else if (this.linking !== it.clueId && !it.linked.includes(this.linking)) {
      const from = this.linking;
      row.append(this.button("Link to this one", () => {
        this.linking = null;
        this.sim.tick([{ type: "LinkClues", a: from, b: it.clueId }]);
        this.refresh();
      }, "small"));
    }
    li.append(row);
    return li;
  }

  // ---- Quests -----------------------------------------------------------------------------

  private quests(root: HTMLElement): void {
    const log = this.sim.questLog();
    if (log.length === 0) {
      root.append(this.el("p", "Nothing to do yet. Things you learn will turn into things to do.", "hint"));
      return;
    }
    const ul = this.el("ul", "", "quests");
    for (const q of log) {
      const li = this.el("li", "", q.state);
      const head = this.el("div", "", "qhead");
      head.append(this.el("strong", q.title), this.el("span", q.state === "active" ? "" : q.state === "complete" ? " (done)" : " (failed)", "status"));
      li.append(head, this.el("div", q.summary, "from"));
      const steps = this.el("ul", "", "steps");
      for (const s of q.steps) steps.append(this.el("li", `${s.done ? "☑" : "☐"} ${s.text}`, s.done ? "done" : ""));
      li.append(steps);
      ul.append(li);
    }
    root.append(ul);
  }

  // ---- Map --------------------------------------------------------------------------------

  private map(root: HTMLElement): void {
    const m = this.sim.annotatedMap();
    const holder = this.el("div", "", "qh-drawing");
    holder.innerHTML = mapMarkup(m); // generated by ui/diagrams.ts, which escapes every label
    root.append(holder);
    const legend = this.el("ul", "", "legend");
    for (const p of m.pins) {
      if (p.kind === "you") continue;
      const li = this.el("li");
      li.append(this.el("strong", `${p.kind === "place" ? "◆" : "●"} ${p.label}`));
      for (const n of p.notes) li.append(this.el("div", `${n.text}${n.status === "unverified" ? "" : ` (${n.status})`}`, "from"));
      legend.append(li);
    }
    for (const z of m.zones) {
      const li = this.el("li");
      li.append(this.el("strong", `▭ ${z.label}`), this.el("div", z.permission > 0 ? `Restricted: needs a pass of level ${z.permission}.` : "Open to everyone.", "from"));
      legend.append(li);
    }
    for (const s of m.schedules) {
      const li = this.el("li");
      li.append(this.el("strong", `⏱ ${s.label}`));
      for (const n of s.notes) li.append(this.el("div", n.text, "from"));
      legend.append(li);
    }
    if (legend.children.length === 0) root.append(this.el("p", "Places, people and zones appear here as you learn of them.", "hint"));
    else root.append(legend);
  }
}
