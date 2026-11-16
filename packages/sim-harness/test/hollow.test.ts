// covers: WLD-7 (the Hollow: the way in, safe and hidden, the trail rule), SQ-07 Tomatoes (Bede, Marrow's consent for June)
import { describe, expect, it } from "vitest";
import { questLog } from "@qh/core";
import { assemble, loadContent, reachableFacts } from "../../content-tools/src/index.ts";
import { Scenario } from "../src/index.ts";
import { config } from "./helpers.ts";

const root = new URL("../../../content", import.meta.url).pathname;
const a = assemble(loadContent(root).bundle);
const content = a.content;
const hollow = a.worlds.hollow!;
const game = (map = "hollow") => new Scenario(config, 1, a.worlds, content, map);
const at = (s: Scenario, id: string) => {
  const o = [...s.sim.world.npcs, ...s.sim.world.exits, ...s.sim.world.pickups].find((x) => x.id === id)!;
  return s.player(o.x + 0.5, o.y + 0.5);
};
const flags = (s: Scenario) => s.sim.state.flags;
const has = (s: Scenario, c: string) => s.sim.state.clues[c] !== undefined;
const quest = (s: Scenario) => questLog(s.sim.state, content, config).find((q) => q.id === "tomatoes")?.state;
const talk = (s: Scenario, npc: string, ...lines: string[]) => {
  at(s, npc).command({ type: "Interact" });
  for (const l of lines) s.say(l);
  return s;
};

describe("the Hollow", () => {
  it("is reached from the Underworks service tunnel and back; the door waits for Quill", () => {
    const u = game("underworks");
    expect(u.sim.state.doors.door_hollow!.locked).toBe(true);
    u.command({ type: "ApplyEffects", effects: [{ unlock_door: "door_hollow" }] });
    at(u, "tunnel_to_hollow").command({ type: "Interact" });
    u.expectEvent("MapChanged", { from: "underworks", to: "hollow" });
    at(u, "tunnel_to_underworks").command({ type: "Interact" });
    u.expectEvent("MapChanged", { from: "hollow", to: "underworks" });
  });
  it("is hidden and safe: no robots, no cameras, every zone a place to save", () => {
    expect(hollow.robots).toHaveLength(0);
    expect(hollow.cameras).toHaveLength(0);
    expect(hollow.zones.every((z) => z.safe === true)).toBe(true);
    expect(hollow.npcs.map((n) => n.id).sort()).toEqual(["bede", "juniper", "marrow"]);
  });
});

describe("how the Hollow can be found: the trail", () => {
  const enter = (alert: number) => {
    const s = game("underworks");
    s.edit((st) => { st.alert.level = alert as 0 | 1 | 2 | 3; });
    s.command({ type: "ApplyEffects", effects: [{ unlock_door: "door_hollow" }] });
    at(s, "tunnel_to_hollow").command({ type: "Interact" }).advanceTicks(2);
    return s;
  };
  it("arriving with the city on alert leaves a trail and raises the risk", () => {
    const s = enter(1);
    expect(flags(s).hollow_trail).toBe(true);
    expect(flags(s).hollow_risk).toBe(true);
  });
  it("arriving quietly does not", () => {
    const s = enter(0);
    expect(flags(s).hollow_trail).toBeUndefined();
    expect(flags(s).hollow_risk).toBeUndefined();
  });
  it("Marrow notices a trail", () => {
    const s = game();
    s.edit((st) => { st.flags.met_marrow = true; st.flags.hollow_trail = true; });
    talk(s, "marrow", "Is something wrong?");
    expect(JSON.stringify(s.sim.dialogue()!.lines)).toMatch(/walked behind you/);
  });
});

describe("the elder, the gardener and the girl", () => {
  it("Marrow's first talk and her warning about discovery", () => {
    const s = talk(game(), "marrow", "I only want to see that it is real.", "How could it be found?");
    expect(has(s, "hollow_discovery_risk")).toBe(true);
  });
  it("Bede names the place and starts SQ-07; later he mentions June's hum", () => {
    const s = talk(game(), "bede");
    expect(has(s, "hollow_exists")).toBe(true);
    expect(flags(s).sq_07_started).toBe(true);
    expect(quest(s)).toBe("active");
    s.say("I will see what I can do.").command({ type: "EndConversation" });
    talk(s, "bede", "Who is the girl humming in the commons?");
    expect(has(s, "june_hums")).toBe(true);
  });
  it("June is shy and hums", () => {
    const s = talk(game(), "juniper");
    expect(JSON.stringify(s.sim.dialogue()!.lines)).toMatch(/Hm hm/);
  });
});

describe("SQ-07 Tomatoes", () => {
  const started = () => { const s = game(); s.edit((st) => { st.flags.sq_07_started = true; st.flags.met_marrow = true; }); return s; };
  it("the gasket is in the Belt's scrap yard", () => {
    const s = game("belt");
    at(s, "pk_gasket").command({ type: "Interact" });
    expect(s.sim.state.inventory.items.pump_gasket).toBe(1);
  });
  it("or Wren's stores will find one for twelve credits", () => {
    const s = game("stacks");
    s.edit((st) => { st.inventory.credits = 20; });
    s.command({ type: "ApplyEffects", effects: [{ use_service: "store_pump_gasket" }] });
    expect(s.sim.state.inventory.items.pump_gasket).toBe(1);
    expect(s.sim.state.inventory.credits).toBe(8);
  });
  it("fitting it ends the quest: a tomato, the watcher at the tunnel mouth", () => {
    const s = started();
    s.edit((st) => { st.inventory.items.pump_gasket = 1; });
    talk(s, "bede", "Here you are.");
    expect(flags(s).sq_07_done).toBe(true);
    expect(flags(s).hollow_watch).toBe(true);
    expect(s.sim.state.inventory.items.tomato).toBe(1);
    expect(s.sim.state.inventory.items.pump_gasket).toBeUndefined();
    expect(quest(s)).toBe("complete");
  });
  it("Marrow will not discuss June before it, and consents after it", () => {
    const before = started();
    talk(before, "marrow");
    expect(JSON.stringify(before.sim.dialogue()!.choices)).toMatch(/About the girl/);
    before.say("About the girl. June.");
    expect(flags(before).marrow_consent).toBeUndefined();
    const after = started();
    after.edit((st) => { st.flags.sq_07_done = true; });
    talk(after, "marrow", "About the girl. June.");
    expect(flags(after).marrow_consent).toBe(true);
    expect(has(after, "june_consent")).toBe(true);
  });
  it("can be completed from a fresh start, and Marrow's consent can be had (cross-map closure)", () => {
    const f = reachableFacts(a.worlds, content, a.start);
    expect(f.flag("sq_07_done")).toBe(true);
    expect(f.flag("marrow_consent")).toBe(true);
  });
});
