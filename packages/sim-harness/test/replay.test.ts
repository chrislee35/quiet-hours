// covers: NFR-3, NFR-10
import { describe, expect, it } from "vitest";
import { ReplayRecorder, parseReplay, runReplay, serializeReplay } from "../src/index.ts";
import { config } from "./helpers.ts";

function recordSession() {
  const rec = new ReplayRecorder(config, 2024);
  const path = [
    { dx: 1, dy: 0, mode: "walk" },
    { dx: 0, dy: 1, mode: "run" },
    { dx: -1, dy: 0, mode: "sneak" },
    { dx: 0, dy: 0, mode: "walk" },
  ] as const;
  for (let i = 0; i < 600; i++) {
    const leg = path[Math.floor(i / 150)];
    rec.tick(i % 150 === 0 && leg ? [{ type: "SetMove", ...leg }] : []);
  }
  return rec.finish();
}

/**
 * Golden hash: if this changes, simulation behavior changed. Intentional changes must update
 * the constant in the same commit and say why in the commit message.
 */
// The hash changes whenever the shape of the saved state does (zones, doors, robots, alert, inventory,
// conversation and terminal state so far); behavior-only changes must not move it.
const GOLDEN_HASH = "1780d86062b2b9";

describe("Replay", () => {
  it("replaying a recording reproduces the final state hash", () => {
    const replay = recordSession();
    expect(runReplay(replay, config).hash).toBe(replay.finalHash);
  });

  it("survives a serialize/parse round trip", () => {
    const replay = recordSession();
    const again = parseReplay(serializeReplay(replay));
    expect(runReplay(again, config).hash).toBe(replay.finalHash);
  });

  it("rejects corrupt replay files", () => {
    expect(() => parseReplay('{"format":2}')).toThrow();
  });

  it("matches the committed golden hash", () => {
    expect(recordSession().finalHash).toBe(GOLDEN_HASH);
  });
});
