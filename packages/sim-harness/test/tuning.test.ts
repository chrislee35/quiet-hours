// covers: NFR-8 (tunability): the lint that finds magic numbers, and a check that the config has no dead knobs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SYSTEM_FILES, codeOnly, scan } from "../../../scripts/check-tuning.ts";
import { config } from "./helpers.ts";

const coreSrc = new URL("../../core/src/", import.meta.url).pathname;
const tuningPath = new URL("../../../content/config/tuning.json", import.meta.url);

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (p.endsWith(".ts")) yield p;
  }
}

describe("the magic-number lint", () => {
  it("flags a number buried in logic, but not zero, one, two or minus one", () => {
    expect(scan("x.ts", "const a = b * 7;").map((f) => f.literal)).toEqual(["7"]);
    expect(scan("x.ts", "const a = b * 1 + 0 - 2 + (-1);")).toEqual([]);
    expect(scan("x.ts", "if (d > 0.05) go(3.5, 12);").map((f) => f.literal)).toEqual(["0.05", "3.5", "12"]);
  });

  it("ignores comments, strings, template text, identifiers with digits, hex and array indexes", () => {
    expect(scan("x.ts", "// 42 is fine here\nconst s = 'room 101 and 7';")).toEqual([]);
    expect(scan("x.ts", "/* a 99 */ const t = `${a} 55`;\n/**\n * 77\n */\nconst u = x2 + y_3 + p[4];")).toEqual([]);
    expect(codeOnly('a("17"); // 18').join("")).not.toMatch(/1[78]/);
  });

  it("accepts a named structural constant, and a line explained with tuning-ok, but not an empty excuse", () => {
    expect(scan("x.ts", "const GEOMETRY_EPS = 1e-6;")).toEqual([]);
    expect(scan("x.ts", "export const MAX_CHAIN = 4;")).toEqual([]);
    expect(scan("x.ts", "const a = b * 7; // tuning-ok: the 24-hour format")).toEqual([]);
    expect(scan("x.ts", "const a = b * 7; // tuning-ok:")).toHaveLength(1);
    expect(scan("x.ts", "const lowercase = 7;")).toHaveLength(1);
  });

  it("reports where: file, line and the text", () => {
    expect(scan("robots.ts", "a;\n  speed = base * 1.4;")).toEqual([{ file: "robots.ts", line: 2, literal: "1.4", text: "speed = base * 1.4;" }]);
  });

  it("every system file is clean: its tunable numbers are in the config", () => {
    const found = SYSTEM_FILES.flatMap((f) => scan(f, readFileSync(coreSrc + f, "utf8")));
    expect(found.map((f) => `${f.file}:${f.line} ${f.literal}`)).toEqual([]);
  });

  it("the list of systems names real files", () => {
    for (const f of SYSTEM_FILES) expect(() => readFileSync(coreSrc + f, "utf8"), f).not.toThrow();
  });
});

describe("the config file", () => {
  /** Every leaf of tuning.json as a dotted path. */
  const leaves = (o: unknown, path = ""): string[] =>
    typeof o === "object" && o !== null && !Array.isArray(o) ? Object.entries(o).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k)) : [path];

  it("has no dead knobs: every setting is read by some code", () => {
    const sources = [...files(coreSrc), ...files(new URL("../../client/src/", import.meta.url).pathname)].map((f) => readFileSync(f, "utf8")).join("\n");
    const raw = JSON.parse(readFileSync(tuningPath, "utf8"));
    const dead = leaves(raw).filter((p) => !new RegExp(`\\b${p.split(".").at(-1)}\\b`).test(sources.replace(/\/\/.*$/gm, "")));
    expect(dead).toEqual([]);
  });

  it("every robot kind has a complete profile, so a new knob cannot be missing for one type", () => {
    const keys = Object.keys(config.robots.warden).sort();
    for (const kind of Object.keys(config.robots) as (keyof typeof config.robots)[]) expect(Object.keys(config.robots[kind]).sort()).toEqual(keys);
  });

  it("overrides work for the new knobs, so tests and difficulty presets can change them", () => {
    expect(config.ai.investigateSpeedFactor).toBe(1.4);
    expect(config.combat.defaultStunSeconds).toBe(8);
  });
});
