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
