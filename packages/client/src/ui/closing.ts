import { closingScene, type ClosingBeat, type Sim } from "@qh/core";

/**
 * The closing scene and the sequel card (T3.13, END-2/3). When the player crosses (the `escaped` event), or loads a save
 * made after crossing, the scene plays over the far side of the Gate: narration, the companion's gratitude and turn
 * (Enter, Space or a click goes on), black, then the card. There is no choice and no epilogue; the card stays up.
 * The words come from `closingScene` (pure, tested); this only shows them, with textContent so content cannot inject markup.
 */
export class ClosingScene {
  private readonly root: HTMLElement;
  private beats: ClosingBeat[] = [];
  private at = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly sim: Sim;
  private readonly reduceMotion: () => boolean;

  constructor(sim: Sim, host: HTMLElement, reduceMotion: () => boolean = () => false) {
    this.sim = sim;
    this.reduceMotion = reduceMotion;
    this.root = document.createElement("section");
    this.root.className = "qh-closing";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-live", "polite");
    this.root.hidden = true;
    host.append(this.root);
    sim.bus.subscribe((e) => {
      if (e.type === "Custom" && e.name === "escaped") this.start();
      if (e.type === "GameLoaded" && this.sim.state.flags.sequel_done === true) this.start();
    });
    window.addEventListener("keydown", (e) => {
      if (this.root.hidden) return;
      // Nothing else gets the keys while the scene is up.
      e.stopImmediatePropagation();
      e.preventDefault();
      if (!e.repeat && (e.key === "Enter" || e.key === " ")) this.next();
    }, true);
    this.root.addEventListener("click", () => this.next());
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  start(): void {
    this.beats = closingScene(this.sim.state.flags, this.sim.content);
    if (this.beats.length === 0) return;
    this.at = 0;
    this.root.hidden = false;
    document.body.classList.add("qh-closing-on");
    this.render();
  }

  /** Debug builds only: show the scene at a given beat (for screenshots). */
  debugAt(beat: number): void {
    this.start();
    this.at = Math.min(Math.max(0, beat), this.beats.length - 1);
    this.render();
  }

  private next(): void {
    const beat = this.beats[this.at];
    if (!beat || beat.kind === "card") return; // the card stays; there is nothing after it
    this.at++;
    this.render();
  }

  private render(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    const beat = this.beats[this.at]!;
    this.root.replaceChildren();
    this.root.dataset.beat = beat.kind;
    const el = (tag: string, cls: string, text: string) => {
      const n = document.createElement(tag);
      n.className = cls;
      n.textContent = text;
      return n;
    };
    if (beat.kind === "black") {
      // A held breath of black, then the card (sooner if the player goes on).
      this.timer = setTimeout(() => this.next(), this.reduceMotion() ? 600 : 2600);
    } else if (beat.kind === "card") {
      this.root.append(el("h1", "title", beat.title), el("p", "tagline", beat.tagline), el("p", "soon", beat.soon));
    } else {
      const box = document.createElement("div");
      box.className = "box";
      if (beat.kind !== "outside" && beat.speaker) box.append(el("div", "who", beat.speaker));
      box.append(el("p", beat.kind, beat.text), el("div", "go", "Enter to go on"));
      this.root.append(box);
    }
  }
}
