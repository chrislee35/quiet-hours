import type { Sim } from "@qh/core";

/**
 * The seam between the core and any renderer (ADR-1). Implementations read snapshots and
 * send commands through `sim`; they never import core internals or mutate state directly.
 */
export interface Renderer {
  start(host: HTMLElement, sim: Sim): void;
  destroy(): void;
}
