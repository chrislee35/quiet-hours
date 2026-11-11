import { Sim, buildWorld, importTiled, validateConfig } from "@qh/core";
import tuning from "../../../content/config/tuning.json" with { type: "json" };
import stacksSlice from "../../../content/maps/stacks_slice.json" with { type: "json" };
import robotRange from "../../../content/maps/robot_range.json" with { type: "json" };
import { loadContent } from "./content.ts";
import { PhaserRenderer } from "./render/PhaserRenderer.ts";
import { DialogueWindow } from "./ui/dialogue.ts";
import { DEFAULT_PAD, loadBindings } from "./input/actions.ts";
import { InputController, browserPad } from "./input/controller.ts";
import { TouchControls, wantsTouchControls } from "./input/touch.ts";
import { safeStorage } from "./storage.ts";
import { Hud } from "./ui/hud.ts";
import { bindUi } from "./ui/nav.ts";
import { Autosaver, Game, SaveStore } from "./saves.ts";
import { GearPanel } from "./ui/gear.ts";
import { MenuPanel } from "./ui/menu.ts";
import { NotebookPanel } from "./ui/notebook.ts";
import { TerminalWindow } from "./ui/terminal.ts";
import { OVERLAY_CSS } from "./ui/styles.ts";

const config = validateConfig(tuning);
// `?map=range` loads the robot test range (one of every robot type) instead of the slice.
const useRange = new URLSearchParams(location.search).get("map") === "range";
const world = useRange
  ? buildWorld(importTiled(robotRange, "robot_range"))
  : buildWorld(importTiled(stacksSlice, "stacks_slice"));
const sim = new Sim(config, Date.now() >>> 0, { world, content: loadContent() });
const host = document.getElementById("game");
if (!host) throw new Error("missing #game element");

// Slice scaffolding: give the player something to lose, so soft failure (confiscation) is visible.
// Removed once real pickups and shops exist (T2.4/T2.5). New games start the same way.
const SCAFFOLD: Parameters<typeof sim.tick>[0] = [{ type: "ApplyEffects", effects: [{ add_credits: 50 }, { add_item: ["scrap_wire", 2] }] }];
sim.tick(SCAFFOLD);
const saves = new SaveStore(safeStorage(typeof localStorage === "undefined" ? undefined : localStorage), world.id);
const game = new Game(sim, saves, { build: __QH_BUILD_ID__, newGameEffects: SCAFFOLD });
const autosaver = new Autosaver(game, { everyMs: config.save.autosaveSeconds * 1000 });
setInterval(() => autosaver.poll(), 1000);

const style = document.createElement("style");
style.textContent = OVERLAY_CSS;
document.head.append(style);
const controller = new InputController(
  window,
  loadBindings(safeStorage(typeof localStorage === "undefined" ? undefined : localStorage)),
  DEFAULT_PAD,
  browserPad(navigator),
);
if (wantsTouchControls({ coarsePointer: matchMedia("(pointer: coarse)").matches, touchPoints: navigator.maxTouchPoints, search: location.search })) {
  new TouchControls(controller, document.body);
}
const hud = new Hud(sim, document.body, controller);
const dialogue = new DialogueWindow(sim, document.body);
const notebook = new NotebookPanel(sim, document.body);
const terminal = new TerminalWindow(sim, document.body);
const gear = new GearPanel(sim, document.body);
const menu = new MenuPanel(game, document.body, __QH_BUILD_ID__);
bindUi(controller, sim, { dialogue, terminal, notebook, gear, menu });
if (saves.info("autosave")) menu.show("An autosave was found. Load it to continue, or close this menu to play a new game.");

new PhaserRenderer().start(host, sim, { controller, hud, toolbelt: gear.toolbelt, isPaused: () => menu.visible || notebook.visible });

if (__QH_DEBUG__) {
  void import("./debug/overlay.ts").then((m) => m.mountDebugOverlay(sim));
}
console.info(`Quiet Hours build ${__QH_BUILD_ID__}`);
