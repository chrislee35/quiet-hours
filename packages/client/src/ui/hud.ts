import type { InputController } from "../input/controller.ts";
import { ALERT_NAMES, formatTime, gameTimeAt, standing, type Sim } from "@qh/core";

const fmt = (items: Record<string, number>) => Object.entries(items).map(([k, n]) => `${k} x${n}`).join(", ");

/**
 * Heads-up display as page text (not canvas), so it scales with text size and is readable by assistive
 * technology. Alert level is shown as words and filled dots, never colour alone (ACC-2).
 */
export class Hud {
  private readonly sim: Sim;
  private readonly controller: InputController;
  private readonly root: HTMLElement;
  private readonly lines: HTMLElement[] = [];
  private message = "";
  private messageUntil = 0;
  private last: string[] = [];

  constructor(sim: Sim, host: HTMLElement, controller: InputController) {
    this.sim = sim;
    this.controller = controller;
    this.root = document.createElement("div");
    this.root.className = "qh-panel qh-hud";
    this.root.setAttribute("role", "status");
    for (let i = 0; i < 6; i++) {
      const line = document.createElement("div");
      this.lines.push(line);
      this.root.append(line);
    }
    host.append(this.root);
    sim.bus.subscribe((e) => {
      if (e.type === "PlayerCaught") this.say("CAUGHT", 2500);
      else if (e.type === "PlayerProcessed") this.say(`PROCESSED (arrest #${e.arrestCount}): belongings confiscated. Find the locker to recover them.`, 5000);
      else if (e.type === "LockerOpened") this.say("Belongings recovered.", 2500);
      else if (e.type === "TerminalSolved") this.say("Access gained.", 2500);
      else if (e.type === "ClueGained") this.say("Notebook updated.", 2000);
    });
  }

  private say(text: string, ms: number): void {
    this.message = text;
    this.messageUntil = performance.now() + ms;
  }

  update(fps: number, padConnected: boolean): void {
    const s = this.sim.state;
    const t = gameTimeAt(s.tick, this.sim.config);
    const level = s.alert.level;
    const dots = "●".repeat(level + 1) + "○".repeat(3 - level);
    const lk = s.locker;
    const locker = [lk.credits > 0 ? `${lk.credits} credits` : "", fmt(lk.items)].filter(Boolean).join(", ");
    const next = [
      `Alert: ${ALERT_NAMES[level]} ${dots}`,
      `${formatTime(t)}${t.isCurfew ? "  CURFEW" : ""}${t.isQuietHours ? "  QUIET HOURS" : ""}   Zone: ${s.player.zone ?? "none"}`,
      `Credits ${s.inventory.credits}   Items: ${fmt(s.inventory.items) || "none"}${locker ? `   [Locker: ${locker}]` : ""}` +
        (s.passes.length > 0 ? `   Passes: ${s.passes.map((p) => p.label).join(", ")}   Standing: ${standing(s.demerits.points, this.sim.config)}` : "   (no record on file)"),
      performance.now() < this.messageUntil ? `» ${this.message}` : "",
      this.controller.lastSource === "touch"
        ? "Stick moves · Use talks/opens · Sneak is quieter and harder to spot · Notes opens your notebook"
        : "WASD move · Shift run · Ctrl sneak (quieter, harder to spot) · E use/talk · N notebook · Z zones",
      `${padConnected ? "Pad: stick/d-pad move · RB run · LB sneak · A use · B back · Y notebook   " : ""}${Math.round(fps)} fps`,
    ];
    next.forEach((text, i) => {
      if (this.last[i] !== text) this.lines[i]!.textContent = text;
    });
    this.last = next;
  }
}
