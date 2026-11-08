import type { Command, DialogueView, Sim } from "@qh/core";

const STATUS_LABEL = { unverified: "unverified", verified: "verified", disproved: "disproved" } as const;

/**
 * The dialogue window (DLG-1): portrait name and mood, the trust line (when the NPC has one), the NPC's lines,
 * numbered choices, a clue picker, and Leave. It only reads `sim.dialogue()` and sends commands.
 * Built with textContent (never innerHTML) so content text can never inject markup.
 */
export class DialogueWindow {
  private readonly sim: Sim;
  private root: HTMLElement;
  private picking = false;
  private lastNode = "";

  constructor(sim: Sim, host: HTMLElement) {
    this.sim = sim;
    this.root = document.createElement("section");
    this.root.className = "qh-panel qh-dialogue";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-live", "polite");
    this.root.hidden = true;
    host.append(this.root);
    sim.bus.subscribe((e) => {
      if (e.type === "ConversationStarted" || e.type === "ConversationNode" || e.type === "ConversationEnded") this.refresh();
    });
    window.addEventListener("keydown", (e) => this.onKey(e));
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  private send(cmd: Command): void {
    this.sim.tick([cmd]);
    this.refresh();
  }

  private onKey(e: KeyboardEvent): void {
    const view = this.sim.dialogue();
    if (!view || e.repeat) return;
    if (e.key === "Escape") {
      if (this.picking) this.picking = false;
      else this.send({ type: "EndConversation" });
      this.refresh();
      e.preventDefault();
    } else if (!this.picking && /^[1-9]$/.test(e.key)) {
      const choice = view.choices[Number(e.key) - 1];
      if (choice) this.send({ type: "Choose", index: choice.index });
      e.preventDefault();
    }
  }

  refresh(): void {
    const view = this.sim.dialogue();
    if (!view) {
      this.root.hidden = true;
      this.picking = false;
      return;
    }
    const nodeKey = `${view.dialogueId}/${this.sim.state.conversation?.node ?? ""}`;
    if (nodeKey !== this.lastNode) this.picking = false;
    this.lastNode = nodeKey;
    this.root.hidden = false;
    this.render(view);
  }

  private render(view: DialogueView): void {
    const root = this.root;
    root.replaceChildren();

    const title = document.createElement("h2");
    title.textContent = view.name;
    if (view.mood) {
      const mood = document.createElement("span");
      mood.className = "mood";
      mood.textContent = `(${view.mood})`;
      title.append(mood);
    }
    root.append(title);

    if (view.trustLine) {
      const t = document.createElement("p");
      t.className = "trust";
      t.textContent = view.trustLine;
      root.append(t);
    }

    for (const line of view.lines) {
      const p = document.createElement("p");
      if (line.speaker !== view.npc) {
        const who = document.createElement("span");
        who.className = "speaker";
        who.textContent = `${line.speaker}: `;
        p.append(who);
      }
      p.append(line.text);
      root.append(p);
    }

    if (this.picking) {
      this.renderPicker(view);
      return;
    }

    const choices = document.createElement("div");
    choices.className = "qh-choices";
    view.choices.forEach((c, i) => {
      const b = document.createElement("button");
      const key = document.createElement("span");
      key.className = "key";
      key.textContent = `${i + 1}.`;
      b.append(key, c.text);
      b.addEventListener("click", () => this.send({ type: "Choose", index: c.index }));
      choices.append(b);
    });
    if (view.canPresent) {
      const b = document.createElement("button");
      b.textContent = "Show a clue from your notebook...";
      b.addEventListener("click", () => {
        this.picking = true;
        this.refresh();
      });
      choices.append(b);
    }
    if (view.canLeave) {
      const b = document.createElement("button");
      b.textContent = "Leave";
      b.addEventListener("click", () => this.send({ type: "EndConversation" }));
      choices.append(b);
    }
    root.append(choices);
    choices.querySelector("button")?.focus();
  }

  private renderPicker(view: DialogueView): void {
    const picker = document.createElement("div");
    picker.className = "qh-picker";
    const head = document.createElement("p");
    head.textContent = view.presentable.length > 0 ? "Which clue?" : "Your notebook is empty.";
    picker.append(head);
    for (const entry of view.presentable) {
      const b = document.createElement("button");
      b.textContent = `${entry.text}  [${STATUS_LABEL[entry.status]}]`;
      b.addEventListener("click", () => {
        this.picking = false;
        this.send({ type: "Present", clueId: entry.clueId });
      });
      picker.append(b);
    }
    const back = document.createElement("button");
    back.textContent = "Back (Esc)";
    back.addEventListener("click", () => {
      this.picking = false;
      this.refresh();
    });
    picker.append(back);
    this.root.append(picker);
    picker.querySelector("button")?.focus();
  }
}
