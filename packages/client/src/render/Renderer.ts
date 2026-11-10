import type { Sim } from "@qh/core";
import type { InputController } from "../input/controller.ts";
import type { Hud } from "../ui/hud.ts";

export interface RenderDeps {
  controller: InputController;
  hud: Hud;
  /** Which tool item is ready to use with the Tool action (chosen in the Gear panel). */
  toolbelt: { ready: string | null };
  /** True while a menu has paused the game (the world stands still, like a conversation). */
  isPaused: () => boolean;
}

/**
 * The seam between the core and any renderer (ADR-1). Implementations read snapshots and
 * send commands through `sim`; they never import core internals or mutate state directly.
 */
export interface Renderer {
  start(host: HTMLElement, sim: Sim, deps: RenderDeps): void;
  destroy(): void;
}
