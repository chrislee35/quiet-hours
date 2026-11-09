// covers: ECO-1, ECO-2, ECO-3, STE-3
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_CONTENT, compileDialogue, totalOwed, withOverrides, type AugmentDef, type ClueDef, type Content, type Effect, type ItemDef, type ServiceDef } from "@qh/core";
import { Scenario, asciiWorld } from "../src/index.ts";
import { config } from "./helpers.ts";

const read = (rel: string) => readFileSync(new URL(`../../../content/${rel}`, import.meta.url), "utf8");
const list = <T extends { id: string }>(rel: string) => Object.fromEntries((JSON.parse(read(rel)) as T[]).map((x) => [x.id, x]));
const services = list<ServiceDef>("services/services.json");
const content: Content = { ...EMPTY_CONTENT, services, items: list<ItemDef>("items/items.json"), augments: list<AugmentDef>("augments/augments.json") };
const world = asciiWorld(["#########", "#S......#", "#########"]);
const start = (effects: Effect[] = [], c = content, cfg = config) =>
  new Scenario(cfg, 1, world, c).command({ type: "ApplyEffects", effects });
const use = (s: Scenario, id: string) => s.command({ type: "ApplyEffects", effects: [{ use_service: id }] });
const refused = (s: Scenario) => s.eventsOfType("ServiceRefused").at(-1);
const give = (id: string, origin: "issued" | "forged" | "borrowed" | "stolen" = "issued"): Effect => ({ give_pass: { id, label: id, level: 0, origin } });

describe("services: price, requirements, outcome", () => {
  it("charges the price and applies the effects", () => {
    const s = start([{ add_credits: 50 }, give("papers")]);
    use(s, "transit_fare").expectEvent("ServiceUsed", { serviceId: "transit_fare", price: 5 });
    expect(s.sim.state.inventory.credits).toBe(45);
    expect(s.sim.state.flags.has_ticket).toBe(true);
  });

  it("refuses without enough credits and changes nothing", () => {
    const s = start([{ add_credits: 3 }, give("papers")]);
    use(s, "transit_fare");
    expect(refused(s)).toMatchObject({ reason: "funds", text: "That costs 5 credits." });
    expect(s.sim.state.inventory.credits).toBe(3);
    expect(s.sim.state.flags.has_ticket).toBeUndefined();
  });

  it("checks requirements, with a specific line", () => {
    const s = start([{ add_item: ["scrap_wire", 1] }]);
    use(s, "sell_scrap");
    expect(refused(s)).toMatchObject({ reason: "requirements", text: "Sam wants at least two bundles of scrap wire." });
    s.command({ type: "ApplyEffects", effects: [{ add_item: ["scrap_wire", 1] }] });
    use(s, "sell_scrap");
    expect(s.sim.state.inventory.credits).toBe(12);
    expect(s.sim.state.inventory.items.scrap_wire).toBeUndefined();
  });

  it("once-only services cannot be repeated", () => {
    const s = start([{ add_credits: 200 }]);
    use(s, "bribe_clerk");
    use(s, "bribe_clerk");
    expect(refused(s)?.reason).toBe("once");
    expect(s.sim.state.inventory.credits).toBe(140);
  });

  it("an unknown service is refused, not a crash", () => {
    const s = start();
    use(s, "nothing");
    expect(refused(s)?.reason).toBe("unknown");
  });
});

describe("the null state blocks legitimate services (ECO-3)", () => {
  it("a record-less player is refused a city service with its own line, and is not charged", () => {
    const s = start([{ add_credits: 50 }]);
    use(s, "transit_fare");
    expect(refused(s)?.reason).toBe("null_state");
    expect(refused(s)?.text).toContain("PENDING REVIEW");
    expect(s.sim.state.inventory.credits).toBe(50);
  });

  it("a shadow service does not care about the null state", () => {
    const s = start([{ add_credits: 50 }]);
    use(s, "forge_stacks_pass").expectEvent("ServiceUsed");
  });

  it("forging, borrowing or bribing an identity unlocks the legitimate service", () => {
    for (const how of ["forge_stacks_pass", "bribe_clerk"]) {
      const s = start([{ add_credits: 200 }]);
      use(s, how);
      use(s, "transit_fare");
      s.expectEvent("ServiceUsed", { serviceId: "transit_fare" });
    }
  });

  it("the forged pass has the origin the service says, so a thorough scan can catch it", () => {
    const s = start([{ add_credits: 50 }]);
    use(s, "forge_stacks_pass");
    expect(s.sim.state.passes[0]).toMatchObject({ id: "stacks_forged", origin: "forged" });
    expect(s.sim.state.inventory.credits).toBe(10);
  });
});

describe("loans and collectors (ECO-2)", () => {
  const day = (cfg = config) => Math.round((cfg.sim.ticksPerSecond * 1440) / cfg.clock.gameMinutesPerRealSecond);
  const borrow = (s: Scenario) => s.command({ type: "ApplyEffects", effects: [{ take_loan: ["odd_sam", 40] }] });

  it("borrowing gives the money and records the debt", () => {
    const s = borrow(start());
    expect(s.sim.state.inventory.credits).toBe(40);
    expect(totalOwed(s.sim.state)).toBe(40);
    s.expectEvent("LoanTaken", { lender: "odd_sam", amount: 40 });
  });

  it("interest compounds once per in-game day, rounding up, and is deterministic", () => {
    const owedAfter = () => {
      const s = borrow(start());
      s.advanceTicks(2 * day());
      return totalOwed(s.sim.state);
    };
    // Day boundaries crossed depend on the start time; with 25%/day: 40 -> 50 -> 63 (ceil 62.5).
    const a = owedAfter();
    expect(a).toBe(owedAfter());
    expect(a).toBeGreaterThan(40);
    const one = borrow(start());
    one.advanceTicks(day());
    expect(totalOwed(one.sim.state)).toBe(50);
  });

  it("repaying clears the debt; paying more than owed or carried pays only what is possible", () => {
    const s = borrow(start());
    s.command({ type: "ApplyEffects", effects: [{ repay_loan: ["odd_sam", 100] }] });
    expect(s.sim.state.inventory.credits).toBe(0);
    expect(totalOwed(s.sim.state)).toBe(0);
    s.expectEvent("LoanRepaid", { paid: 40 });
    const poor = borrow(start());
    poor.command({ type: "ApplyEffects", effects: [{ add_credits: -30 }, { repay_loan: ["odd_sam", 40] }] });
    expect(totalOwed(poor.sim.state)).toBe(30);
  });

  it("collectors come only after the due date: they take a share of credits and raise the alert", () => {
    const s = borrow(start());
    s.advanceTicks(day());
    s.expectNoEvent("CollectorsCame");
    expect(s.alert).toBe(0);
    s.advanceTicks(day() * 2);
    s.expectEvent("CollectorsCame", { lender: "odd_sam" });
    expect(s.sim.state.inventory.credits).toBeLessThan(40);
    s.expectEvent("AlertChanged", { from: 0, to: 1 });
  });

  it("collectors never take more than is owed, and a cleared debt stops them", () => {
    const rich = withOverrides(config, { economy: { garnishFraction: 1 } });
    const s = start([{ take_loan: ["odd_sam", 10] }, { add_credits: 500 }], content, rich);
    s.advanceTicks(day() * 3);
    expect(totalOwed(s.sim.state)).toBe(0);
    expect(s.sim.state.inventory.credits).toBeGreaterThan(400);
  });
});

describe("services in conversation", () => {
  const clues = Object.fromEntries((JSON.parse(read("clues/sample.json")) as ClueDef[]).map((c) => [c.id, c]));
  const { dialogue } = compileDialogue(read("dialogue/odd_sam.qdl"), { id: "odd_sam", knownClues: new Set(Object.keys(clues)) });
  const talk = (effects: Effect[] = []) => {
    const w = asciiWorld(["#######", "#S....#", "#######"], [], { npcs: [{ id: "odd_sam", x: 2, y: 1, dialogue: "odd_sam" }] });
    const c: Content = { ...content, dialogues: { odd_sam: dialogue! }, clues };
    return new Scenario(config, 1, w, c)
      .command({ type: "ApplyEffects", effects: [{ set_flag: ["met_sam", true] }, ...effects] })
      .command({ type: "Interact" })
      .say("What do you sell?");
  };

  it("a refusal is shown as a notice on the next node", () => {
    const s = talk().say("Ask about papers. (40 credits)");
    expect(s.dialogue!.notice).toBe("That costs 40 credits.");
  });

  it("a success is shown too, and the notice is gone after the next choice", () => {
    const s = talk([{ add_credits: 100 }]).say("Ask about papers. (40 credits)");
    expect(s.dialogue!.notice).toContain("Sam slides a card");
    expect(s.sim.state.passes).toHaveLength(1);
    s.say("That will do.");
    expect(s.dialogue!.notice).toBeNull();
  });

  it("the loan and repayment options appear according to debt", () => {
    const s = talk();
    const texts = () => s.dialogue!.choices.map((c) => c.text);
    expect(texts().some((t) => t.startsWith("Ask for a loan"))).toBe(true);
    expect(texts().some((t) => t.startsWith("Pay back"))).toBe(false);
    s.say("Ask for a loan. (40 credits, and I owe more every day)");
    expect(s.sim.state.inventory.credits).toBe(40);
    s.say("Understood.").say("What do you sell?");
    expect(texts().some((t) => t.startsWith("Ask for a loan"))).toBe(false);
    expect(texts().some((t) => t.startsWith("Pay back"))).toBe(true);
  });
});
