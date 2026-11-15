import { Sim, buildWorld, importTiled, validateConfig } from "@qh/core";
import tuning from "../../../content/config/tuning.json" with { type: "json" };
import stacksSlice from "../../../content/maps/stacks_slice.json" with { type: "json" };
import stacks from "../../../content/maps/stacks.json" with { type: "json" };
import civicCore from "../../../content/maps/civic_core.json" with { type: "json" };
import belt from "../../../content/maps/belt.json" with { type: "json" };
import underworks from "../../../content/maps/underworks.json" with { type: "json" };
import gate from "../../../content/maps/gate.json" with { type: "json" };
import outside from "../../../content/maps/outside.json" with { type: "json" };
import robotRange from "../../../content/maps/robot_range.json" with { type: "json" };
import startState from "../../../content/start.json" with { type: "json" };
import { loadContent } from "./content.ts";
import { PhaserRenderer } from "./render/PhaserRenderer.ts";
import { DialogueWindow } from "./ui/dialogue.ts";
import { loadBindings, loadPadBindings } from "./input/actions.ts";
import { SettingsStore } from "./settings-store.ts";
import { playNotes } from "./sound.ts";
import { SettingsPanel } from "./ui/settings.ts";
import { InputController, browserPad } from "./input/controller.ts";
import { TouchControls, wantsTouchControls } from "./input/touch.ts";
import { safeStorage } from "./storage.ts";
import { Hud } from "./ui/hud.ts";
import { bindUi } from "./ui/nav.ts";
import { Autosaver, Game, SaveStore } from "./saves.ts";
import { GearPanel } from "./ui/gear.ts";
import { MenuPanel } from "./ui/menu.ts";
import { NotebookPanel } from "./ui/notebook.ts";
import { ClosingScene } from "./ui/closing.ts";
import { TerminalWindow } from "./ui/terminal.ts";
import { OVERLAY_CSS } from "./ui/styles.ts";

const config = validateConfig(tuning);
// Every map is built up front so the player can travel between them. The Stacks is the opening; `?map=slice`, `?map=range`
// or `?map=civic_core` start somewhere else (each start map keeps its own saves).
const worlds = Object.fromEntries(
  Object.entries({ stacks, stacks_slice: stacksSlice, robot_range: robotRange, civic_core: civicCore, belt, underworks, gate, outside }).map(([id, raw]) => [id, buildWorld(importTiled(raw, id))]),
);
const mapParam = new URLSearchParams(location.search).get("map");
const startMap = mapParam === "range" ? "robot_range" : mapParam === "slice" ? "stacks_slice" : mapParam === "civic" ? "civic_core" : mapParam === "belt" ? "belt" : mapParam === "underworks" ? "underworks" : mapParam === "gate" ? "gate" : mapParam === "outside" ? "outside" : "stacks";
const sim = new Sim(config, Date.now() >>> 0, { worlds, startMap, content: loadContent() });
const host = document.getElementById("game");
if (!host) throw new Error("missing #game element");

// Slice scaffolding: give the player something to lose, so soft failure (confiscation) is visible.
// Removed once real pickups and shops exist (T2.4/T2.5). New games start the same way.
// What a new game starts with comes from content/start.json, the same file the solvability checker starts from.
const SCAFFOLD: Parameters<typeof sim.tick>[0] = [
  { type: "ApplyEffects", effects: [{ add_credits: startState.credits }, ...Object.entries(startState.items).map(([id, n]) => ({ add_item: [id, n] as [string, number] }))] },
];
sim.tick(SCAFFOLD);
const storage = safeStorage(typeof localStorage === "undefined" ? undefined : localStorage);
const saves = new SaveStore(storage, startMap);
const game = new Game(sim, saves, { build: __QH_BUILD_ID__, startMap, newGameEffects: SCAFFOLD });
const autosaver = new Autosaver(game, { everyMs: config.save.autosaveSeconds * 1000 });
setInterval(() => autosaver.poll(), 1000);

const style = document.createElement("style");
style.textContent = OVERLAY_CSS;
document.head.append(style);
// Player settings (text size, palette, controls, assists) belong to the player, not to a save; apply them first.
const settings = new SettingsStore(storage, matchMedia("(prefers-reduced-motion: reduce)").matches);
const controller = new InputController(window, loadBindings(storage), loadPadBindings(storage), browserPad(navigator));
// The puzzle-skip assist lives in the game state so a save records it; the player's setting wins on every start and load.
const pushAssist = () => sim.tick([{ type: "SetAssist", puzzleSkip: settings.get().puzzleSkip }]);
pushAssist();
settings.onChange((_, changed) => {
  if (changed.includes("puzzleSkip")) pushAssist();
});
sim.bus.subscribe((e) => {
  if (e.type === "GameLoaded") pushAssist();
  // Resting in the Safehouse is a checkpoint: the alert is back to Calm, so the autosave is allowed.
  if (e.type === "Rested") game.autosave();
  // An audible cue when the city gets more suspicious: one, two or three beeps (ACC-2).
  if (e.type === "AlertChanged" && e.to > e.from && settings.get().alertCues) playNotes(Array.from({ length: e.to }, () => 71 + 4 * e.to), 170);
});
if (wantsTouchControls({ coarsePointer: matchMedia("(pointer: coarse)").matches, touchPoints: navigator.maxTouchPoints, search: location.search })) {
  new TouchControls(controller, document.body);
}
const hud = new Hud(sim, document.body, controller);
const dialogue = new DialogueWindow(sim, document.body);
const notebook = new NotebookPanel(sim, document.body);
const terminal = new TerminalWindow(sim, document.body);
const gear = new GearPanel(sim, document.body);
const settingsPanel = new SettingsPanel(settings, controller, storage, document.body);
const closing = new ClosingScene(sim, document.body, () => settings.get().reduceMotion);
const menu = new MenuPanel(game, document.body, __QH_BUILD_ID__, () => settingsPanel.toggle());
bindUi(controller, sim, { dialogue, terminal, notebook, gear, menu, settings: settingsPanel });
if (saves.info("autosave")) menu.show("An autosave was found. Load it to continue, or close this menu to play a new game.");

new PhaserRenderer().start(host, sim, { controller, hud, toolbelt: gear.toolbelt, isPaused: () => closing.visible || menu.visible || notebook.visible || settingsPanel.visible, settings: () => settings.get() });

if (__QH_DEBUG__ && new URLSearchParams(location.search).has("closing")) {
  const q = new URLSearchParams(location.search);
  const who = q.get("closing") || "none";
  sim.tick([{ type: "ApplyEffects", effects: [{ set_flag: ["escapee", who] }, { set_flag: ["mentor", "ines"] }, { set_flag: ["mentor_romance", q.has("romance")] }] }]);
  closing.debugAt(Number(q.get("beat") ?? 0));
}
if (__QH_DEBUG__ && new URLSearchParams(location.search).has("npcs")) void import("./debug/npcGallery.ts").then((m) => m.mountNpcGallery());
if (__QH_DEBUG__) {
  void import("./debug/overlay.ts").then((m) => m.mountDebugOverlay(sim));
}
console.info(`Quiet Hours build ${__QH_BUILD_ID__}`);
