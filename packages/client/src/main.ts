import { Sim, buildWorld, importTiled, validateConfig } from "@qh/core";
import tuning from "../../../content/config/tuning.json" with { type: "json" };
import stacksSlice from "../../../content/maps/stacks_slice.json" with { type: "json" };
import { loadContent } from "./content.ts";
import { PhaserRenderer } from "./render/PhaserRenderer.ts";
import { DialogueWindow } from "./ui/dialogue.ts";
import { DEFAULT_PAD, loadBindings } from "./input/actions.ts";
import { InputController, browserPad } from "./input/controller.ts";
import { safeStorage } from "./storage.ts";
import { Hud } from "./ui/hud.ts";
import { bindUi } from "./ui/nav.ts";
import { NotebookPanel } from "./ui/notebook.ts";
import { TerminalWindow } from "./ui/terminal.ts";
import { OVERLAY_CSS } from "./ui/styles.ts";

const config = validateConfig(tuning);
const world = buildWorld(importTiled(stacksSlice, "stacks_slice"));
const sim = new Sim(config, Date.now() >>> 0, { world, content: loadContent() });
const host = document.getElementById("game");
if (!host) throw new Error("missing #game element");

// Slice scaffolding: give the player something to lose, so soft failure (confiscation) is visible.
// Removed once real pickups and shops exist (T2.4/T2.5).
sim.tick([{ type: "ApplyEffects", effects: [{ add_credits: 50 }, { add_item: ["scrap_wire", 2] }] }]);

const style = document.createElement("style");
style.textContent = OVERLAY_CSS;
document.head.append(style);
const controller = new InputController(
  window,
  loadBindings(safeStorage(typeof localStorage === "undefined" ? undefined : localStorage)),
  DEFAULT_PAD,
  browserPad(navigator),
);
const hud = new Hud(sim, document.body);
const dialogue = new DialogueWindow(sim, document.body);
const notebook = new NotebookPanel(sim, document.body);
const terminal = new TerminalWindow(sim, document.body);
bindUi(controller, sim, { dialogue, terminal, notebook });

new PhaserRenderer().start(host, sim, { controller, hud });

if (__QH_DEBUG__) {
  void import("./debug/overlay.ts").then((m) => m.mountDebugOverlay(sim));
}
console.info(`Quiet Hours build ${__QH_BUILD_ID__}`);
