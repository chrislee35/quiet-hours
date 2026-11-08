import type { Sim } from "@qh/core";

/** Present in bundles only when built with QH_DEBUG=1; `pnpm check:no-debug` greps for this marker. */
export const QH_DEBUG_OVERLAY_MARKER = "QH_DEBUG_OVERLAY_MARKER";

export function mountDebugOverlay(sim: Sim): void {
  const el = document.createElement("pre");
  el.dataset.marker = QH_DEBUG_OVERLAY_MARKER;
  el.style.cssText = "position:fixed;right:8px;top:8px;margin:0;padding:6px;background:#000a;color:#8f8;font:11px monospace;pointer-events:none";
  document.body.append(el);
  setInterval(() => {
    const s = sim.state;
    el.textContent = `tick ${s.tick}\npos ${s.player.x.toFixed(2)}, ${s.player.y.toFixed(2)}\nhash ${sim.hash}`;
  }, 250);
}
