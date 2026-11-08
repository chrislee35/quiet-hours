import { powerRouting, validateCondition, validateEffect, type Effect, type MapData, type PuzzleDef } from "@qh/core";
import type { Issue } from "./validate.ts";

interface Found {
  file: string;
  entity: { id: string; [key: string]: unknown };
}

/** Each puzzle must be well-formed, not already solved, and *proven solvable* by the solver. */
export function checkPuzzles(puzzles: Found[]): Issue[] {
  const issues: Issue[] = [];
  for (const { file, entity } of puzzles) {
    const def = entity as unknown as PuzzleDef;
    const problems = powerRouting.validatePuzzleDef(def);
    for (const p of problems) issues.push({ file, message: `puzzle "${def.id}": ${p}` });
    if (problems.length > 0) continue;
    const start = powerRouting.init(def);
    if (powerRouting.isSolved(def, start)) issues.push({ file, message: `puzzle "${def.id}" starts already solved` });
    else if (powerRouting.solve(def, start) === null) issues.push({ file, message: `puzzle "${def.id}" is not solvable (or too large for the solver to prove)` });
  }
  return issues;
}

export function checkTerminals(terminals: Found[], puzzleIds: ReadonlySet<string>, clueIds: ReadonlySet<string>, maps: MapData[]): Issue[] {
  const issues: Issue[] = [];
  const doorIds = new Set(maps.flatMap((m) => m.doors.map((d) => d.id)));
  for (const { file, entity } of terminals) {
    const id = entity.id;
    const say = (m: string) => issues.push({ file, message: `terminal "${id}": ${m}` });
    if (!puzzleIds.has(String(entity.puzzle))) say(`uses unknown puzzle "${String(entity.puzzle)}"`);
    (entity.bypass as unknown[]).forEach((c, i) => {
      for (const p of validateCondition(c, `bypass[${i}]`)) say(p);
    });
    (entity.onSolve as unknown[]).forEach((e, i) => {
      const problems = validateEffect(e, `onSolve[${i}]`);
      for (const p of problems) say(p);
      if (problems.length > 0) return;
      const eff = e as Effect;
      if ("unlock_door" in eff && !doorIds.has(eff.unlock_door)) say(`onSolve[${i}] unlocks unknown door "${eff.unlock_door}"`);
      if ("give_clue" in eff && !clueIds.has(eff.give_clue.id)) say(`onSolve[${i}] gives unknown clue "${eff.give_clue.id}"`);
    });
  }
  return issues;
}
