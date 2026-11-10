# Trust

Trust (CMP-3/4) is a hidden three-level state per person: does not trust you (-1), unsure (0), trusts you (+1). Players never see a number or a bar. It appears in exactly one place: a single line in that person's dialogue window, for people whose `.qdl` says `trust: yes`:
- "It appears that Pallas trusts you." / "...is unsure about you." / "...does not trust you."

## Rules
- **One act, one step.** `adjust_trust` accepts only +1 or -1 (the validator rejects anything else) and the runtime moves at most one level, clamped to [-1, +1], even if something bypassed validation.
- **Always recoverable.** `pnpm validate` fails if any dialogue can lower someone's trust but nothing can raise it from the worst state (a raising choice gated on already being trusted does not count).
- **Not touched by failure.** Being arrested never changes trust (FAIL-5).
- **Causes log.** Every change is appended to `state.trustLog` (`{tick, npc, from, to, cause}`, the latest 200) and carried on the `TrustChanged` event. It is for tests and the debug overlay; it is never shown to the player. Give a cause in content with `trust:NPC+1(kept the promise)`; otherwise it is the dialogue and node that did it.

## Tests
`packages/sim-harness/test/trust.test.ts`: the three lines and nothing numeric in the dialogue view; one step per act and clamping; recovery from the worst state; the log. `packages/content-tools/test/validate.test.ts`: recoverability.

Companion gating (trust plus practical requirements at the Gate) is T3.12.
