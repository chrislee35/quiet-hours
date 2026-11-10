import type { Condition, Dialogue, Effect } from "@qh/core";

/** Every clue id an effect list can hand to the player. */
export function cluesGiven(d: Dialogue): Set<string> {
  const out = new Set<string>();
  const scan = (effects: Effect[]) => {
    for (const e of effects) if ("give_clue" in e) out.add(e.give_clue.id);
  };
  for (const n of Object.values(d.nodes)) {
    scan(n.onEnter);
    n.choices.forEach((c) => scan(c.effects));
    n.present?.forEach((r) => scan(r.effects));
  }
  return out;
}

/** Every clue id that something in this dialogue is *gated* on, with a human-readable place. */
export function clueGates(d: Dialogue): { clue: string; where: string }[] {
  const out: { clue: string; where: string }[] = [];
  const scan = (c: Condition, where: string): void => {
    if ("all" in c) c.all.forEach((x) => scan(x, where));
    else if ("any" in c) c.any.forEach((x) => scan(x, where));
    else if ("not" in c) return; // negations do not need the clue to be obtainable
    else if ("has_clue" in c) out.push({ clue: c.has_clue, where });
    else if ("clue_state" in c) out.push({ clue: c.clue_state[0], where });
  };
  d.start.forEach((s) => s.if.forEach((c) => scan(c, `start -> ${s.goto}`)));
  for (const n of Object.values(d.nodes)) {
    n.choices.forEach((ch) => ch.if.forEach((c) => scan(c, `node "${n.id}" option "${ch.text}"`)));
    n.present?.forEach((r) => {
      if (r.clue !== "*") out.push({ clue: r.clue, where: `node "${n.id}" reaction to ${r.clue}` });
      r.if.forEach((c) => scan(c, `node "${n.id}" reaction`));
    });
  }
  return out;
}

/** True if the condition can only hold when trust in `npc` is above the worst state (so it is unavailable to a distrusted player). */
function needsTrustAbove(c: Condition, npc: string): boolean {
  if ("all" in c) return c.all.some((x) => needsTrustAbove(x, npc));
  if ("any" in c) return c.any.every((x) => needsTrustAbove(x, npc));
  if ("trust_gte" in c) return c.trust_gte[0] === npc && c.trust_gte[1] > -1;
  return false;
}

/**
 * Trust must be recoverable (CMP-4): for every NPC that some dialogue can lower trust with, some dialogue must
 * be able to raise it that a player at the worst state can still reach (its choice is not itself gated on
 * trust above the worst). Returns the NPCs that can be lowered but not recovered.
 */
export function unrecoverableTrust(dialogues: Dialogue[]): string[] {
  const lowers = new Set<string>();
  const raisers = new Map<string, boolean>(); // npc -> some raiser available at the worst state
  const scan = (effects: Effect[], gates: Condition[]) => {
    for (const e of effects) {
      if (!("adjust_trust" in e)) continue;
      const [npc, delta] = e.adjust_trust;
      if (delta < 0) lowers.add(npc);
      else if (!gates.some((c) => needsTrustAbove(c, npc))) raisers.set(npc, true);
    }
  };
  for (const d of dialogues) {
    for (const n of Object.values(d.nodes)) {
      scan(n.onEnter, []);
      n.choices.forEach((c) => scan(c.effects, c.if));
      n.present?.forEach((r) => scan(r.effects, r.if));
    }
  }
  return [...lowers].filter((npc) => !raisers.get(npc)).sort();
}
