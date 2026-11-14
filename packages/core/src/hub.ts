/**
 * The Safehouse hub and its growth (T3.3, WLD-1). The cell visibly improves as the player helps it. Each *growth* is a
 * piece of content: a name, a description and the conditions (in the shared language) under which it exists, so the
 * hub is a pure function of what the player has done (flags, clues, services, credits given). Nothing is stored but a
 * record of which ones have appeared, so the game can announce each new one once. Map `prop` objects with a `shows`
 * growth id are drawn when that growth is active; conversations gate on `grown:ID` (more stock on the shelf, warmer
 * greetings).
 */
import type { Config } from "./config.ts";
import type { Ctx } from "./ctx.ts";
import type { Content } from "./dialogue/types.ts";
import { evalAll, type Condition } from "./rules.ts";
import type { SimState } from "./state.ts";

export interface GrowthDef {
  id: string;
  name: string;
  description: string;
  when: Condition[];
}

export interface GrowthView {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

export function isGrown(state: Readonly<SimState>, content: Content, config: Config, id: string): boolean {
  const g = content.growth[id];
  return g !== undefined && evalAll(g.when, state, config, content);
}

/** Every growth, in definition order, with whether it exists right now. */
export function hubGrowth(state: Readonly<SimState>, content: Content, config: Config): GrowthView[] {
  return Object.values(content.growth).map((g) => ({ id: g.id, name: g.name, description: g.description, active: evalAll(g.when, state, config, content) }));
}

/** Announces each growth the first time it appears. Growth never goes away: once the cell has it, it keeps it. */
export function hubSystem(ctx: Ctx): void {
  const { state, config, content, events } = ctx;
  for (const g of hubGrowth(state, content, config)) {
    if (g.active && !state.hub.grown.includes(g.id)) {
      state.hub.grown.push(g.id);
      events.push({ type: "HubGrew", tick: state.tick, growthId: g.id });
    }
  }
}
