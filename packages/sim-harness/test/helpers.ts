import { readdirSync, readFileSync } from "node:fs";
import { validateConfig } from "@qh/core";
import tuning from "../../../content/config/tuning.json" with { type: "json" };

export const config = validateConfig(tuning);

/** Every shipped clue by id (conversations may give any of them). */
export function allClues(): Record<string, import("@qh/core").ClueDef> {
  const dir = new URL("../../../content/clues/", import.meta.url);
  const out: Record<string, import("@qh/core").ClueDef> = {};
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    for (const c of JSON.parse(readFileSync(new URL(f, dir), "utf8")) as import("@qh/core").ClueDef[]) out[c.id] = c;
  }
  return out;
}
