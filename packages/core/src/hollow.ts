import type { Ctx } from "./ctx.ts";
import { ticksPerGameMinute } from "./identity.ts";
import type { SimState } from "./state.ts";

/**
 * The Hollow's discovery risk and its consequences (T4.4, T4.5, WLD-7). Risk is a count of points, derived from flags:
 *  - +2 `mrs_sold`: the informant was sold out, or sold you (SQ-02);
 *  - +1 for each arrival in the Hollow with the city already on alert (`hollow_trails`, at most 3): a trail to its door;
 *  - -1 `hollow_watch`: a lookout at the tunnel mouth (SQ-07);
 *  - -1 `mrs_safe`: the informant is on your side (SQ-02).
 * At `hollow.discoverAt` points a raid is set in motion (`hollow_doomed`, `hollow_raid_tick`, the custom event
 * `hollow_doomed`) and lands `hollow.raidDelayMinutes` later. In that window the risk can fall again (a lookout is posted,
 * the informant won over) and the raid is called off, or Marrow can be warned (`hollow_warned`, in conversation), which
 * changes what the raid does. When it lands: `hollow_discovered`, `hollow_outcome` = `scattered` (warned: the people
 * got away) or `wiped`, the custom event `hollow_raided`, and everyone in the Hollow is gone (`away`). A player inside
 * at that moment is spotted (alert Hunting). Leaving by the Gate on the break route with any risk at all also costs the
 * Hollow (`finalizeEscape`). Being seen with June (alert while she is your chosen companion) counts as one more trail (`hollow_seen_with_june`, once). `hollow_here` remembers that the player is inside, so a visit counts once.
 */
export function hollowRisk(state: Readonly<SimState>): number {
  const f = state.flags;
  const trails = typeof f.hollow_trails === "number" ? Math.min(3, f.hollow_trails) : 0;
  return Math.max(0, (f.mrs_sold === true ? 2 : 0) + trails - (f.hollow_watch === true ? 1 : 0) - (f.mrs_safe === true ? 1 : 0));
}

export const hollowOutcome = (state: Readonly<SimState>): "hidden" | "scattered" | "wiped" | "found" => {
  if (state.flags.hollow_discovered !== true) return "hidden";
  const o = state.flags.hollow_outcome;
  return o === "scattered" || o === "wiped" ? o : "found";
};

export function hollowSystem({ state, config, events }: Ctx): void {
  const f = state.flags;
  const inside = state.map === "hollow";
  if (inside && f.hollow_here !== true) {
    f.hollow_here = true;
    if (state.alert.level >= 1) {
      f.hollow_trail = true;
      f.hollow_risk = true;
      f.hollow_trails = (typeof f.hollow_trails === "number" ? f.hollow_trails : 0) + 1;
    }
  } else if (!inside && f.hollow_here === true) f.hollow_here = false;

  // Being seen with June threatens the Hollow: once, when the city is on alert while she is with you.
  if (f.companion === "juniper" && state.alert.level >= 1 && f.hollow_seen_with_june !== true && f.hollow_discovered !== true) {
    f.hollow_seen_with_june = true;
    f.hollow_trails = (typeof f.hollow_trails === "number" ? f.hollow_trails : 0) + 1;
    f.hollow_risk = true;
  }
  if (f.hollow_discovered === true) {
    if (inside) for (const n of Object.values(state.npcs)) n.away = true;
    return;
  }
  const risky = hollowRisk(state) >= config.hollow.discoverAt;
  if (risky && f.hollow_doomed !== true) {
    f.hollow_doomed = true;
    f.hollow_raid_tick = state.tick + Math.round(config.hollow.raidDelayMinutes * ticksPerGameMinute(config));
    events.push({ type: "Custom", tick: state.tick, name: "hollow_doomed" });
  } else if (!risky && f.hollow_doomed === true) {
    delete f.hollow_doomed; // called off
    delete f.hollow_raid_tick;
    events.push({ type: "Custom", tick: state.tick, name: "hollow_spared" });
  }
  if (f.hollow_doomed === true && state.tick >= Number(f.hollow_raid_tick)) raid(state, events);
}

/** The raid lands. Also used when the player breaks the Gate with the Hollow at risk. */
export function raid(state: SimState, events: Ctx["events"]): void {
  const f = state.flags;
  f.hollow_discovered = true;
  f.hollow_outcome = f.hollow_warned === true ? "scattered" : "wiped";
  delete f.hollow_doomed;
  delete f.hollow_raid_tick;
  if (state.map === "hollow" && state.alert.level < 2) {
    events.push({ type: "AlertChanged", tick: state.tick, from: state.alert.level, to: 2 });
    state.alert.level = 2;
    state.alert.quietSince = state.tick; // just seen, so it does not decay at once
  }
  events.push({ type: "Custom", tick: state.tick, name: "hollow_raided" });
}

