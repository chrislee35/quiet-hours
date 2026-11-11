// covers: ACC-2 (state is never colour alone), HAK-2
import { describe, expect, it } from "vitest";
import { circuitMarkup, esc, ruleMarkup } from "../src/ui/diagrams.ts";
import { logicCircuit as lc, ruleContradiction as rc, type LogicCircuitDef, type RuleContradictionDef } from "@qh/core";

const circuit: LogicCircuitDef = {
  id: "c", kind: "logic_circuit",
  inputs: [{ id: "a", name: "Switch A", value: true }, { id: "k", name: "Switch K (fixed)", value: true, locked: true }],
  gates: [{ id: "g1", op: "AND", in: ["a", "k"] }],
  goals: [{ name: "Door <b>", node: "g1", want: true }],
};
const rules: RuleContradictionDef = {
  id: "r", kind: "rule_contradiction",
  inputs: [{ id: "a", name: "A & B", value: true }, { id: "k", name: "K", locked: true }],
  outputs: [{ id: "x", name: "X" }],
  rules: [{ id: "1", text: "Say \"yes\" <now>", if: { a: true }, then: { x: true } }, { id: "2", text: "No.", if: { k: false }, then: { x: false } }],
};

describe("drawings", () => {
  it("escapes every piece of content text, so a name cannot inject markup", () => {
    expect(esc(`<a href="x">&`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;");
    const svg = circuitMarkup(lc.view(circuit, lc.init(circuit)).diagram, false);
    expect(svg).toContain("Door &lt;b&gt;");
    expect(svg).not.toContain("<b>");
    const r = ruleMarkup(rc.view(rules, rc.init(rules)).diagram, false);
    expect(r).toContain("A &amp; B");
    expect(r).toContain("Say &quot;yes&quot; &lt;now&gt;");
  });

  it("only switches that can be changed carry a tap target, and none once solved", () => {
    const d = lc.view(circuit, lc.init(circuit)).diagram;
    expect(circuitMarkup(d, false).match(/data-tap="\d+"/g)).toEqual(['data-tap="0"']);
    expect(circuitMarkup(d, true)).not.toContain("data-tap");
    const r = rc.view(rules, rc.init(rules)).diagram;
    expect(ruleMarkup(r, false).match(/data-tap="\d+"/g)).toEqual(['data-tap="0"']);
    expect(ruleMarkup(r, true)).not.toContain("data-tap");
  });

  it("state is never colour alone: live wires and dead wires differ in class, and every box says its state in words", () => {
    const svg = circuitMarkup(lc.view(circuit, [1, 1]).diagram, false);
    expect(svg).toContain('class="wire on"');
    expect(circuitMarkup(lc.view(circuit, [0, 1]).diagram, false)).toContain('class="wire off"');
    expect(svg).toContain(">ON<");
    expect(svg).toContain("needs ON ✓");
    expect(circuitMarkup(lc.view(circuit, [0, 1]).diagram, false)).toContain("needs ON ✗");
  });

  it("a contradiction is spelled out in words", () => {
    const clash: RuleContradictionDef = { ...rules, inputs: [{ id: "a", name: "A", value: true }, { id: "k", name: "K", value: false, locked: true }] };
    expect(ruleMarkup(rc.view(clash, rc.init(clash)).diagram, false)).toContain("⚠ CONTRADICTION");
    expect(ruleMarkup(rc.view(rules, rc.init(rules)).diagram, false)).toContain("applies");
  });

  it("is a well-formed svg with a text alternative", () => {
    for (const svg of [circuitMarkup(lc.view(circuit, lc.init(circuit)).diagram, false), ruleMarkup(rc.view(rules, rc.init(rules)).diagram, false)]) {
      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain('role="img"');
      expect(svg).toMatch(/aria-label="[^"]+"/);
      expect((svg.match(/<g /g) ?? []).length).toBe((svg.match(/<\/g>/g) ?? []).length);
    }
  });
});
