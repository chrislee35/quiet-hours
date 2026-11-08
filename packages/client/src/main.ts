import { Sim, buildWorld, importTiled, validateConfig } from "@qh/core";
import tuning from "../../../content/config/tuning.json" with { type: "json" };
import stacksSlice from "../../../content/maps/stacks_slice.json" with { type: "json" };
import { PhaserRenderer } from "./render/PhaserRenderer.ts";

const config = validateConfig(tuning);
const world = buildWorld(importTiled(stacksSlice, "stacks_slice"));
const sim = new Sim(config, Date.now() >>> 0, { world });
const host = document.getElementById("game");
if (!host) throw new Error("missing #game element");

new PhaserRenderer().start(host, sim);

if (__QH_DEBUG__) {
  void import("./debug/overlay.ts").then((m) => m.mountDebugOverlay(sim));
}
console.info(`Quiet Hours build ${__QH_BUILD_ID__}`);
