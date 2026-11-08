# TESTING — Quiet Hours

*How we know the game works. Complements [REQUIREMENTS.md](REQUIREMENTS.md) (what), [DESIGN.md](DESIGN.md) (how) and [TASKS.md](TASKS.md) (when). Because the core is a deterministic headless simulation (ADR-2), almost everything except look-and-feel can be tested automatically.*

## 1. Principles
1. **Test the core headless.** Logic has no DOM/GL/audio dependency (NFR-4); tests run under Node in milliseconds.
2. **Determinism is a feature.** Same seed + same commands = same state hash (NFR-3). A flaky test is a determinism bug.
3. **Content is code.** Data files are validated and tested like code, in CI.
4. **The biggest risk is an unwinnable or inconsistent game**, so the solvability checker gets first-class treatment.
5. **Humans test feel.** Stealth fairness, writing tone, and puzzle clarity need playtests; automation guards against regressions only.

## 2. Test pyramid
| Layer | Tool | Scope | Runs |
|---|---|---|---|
| Unit | Vitest | Pure functions: conditions, resolver, alert machine, trust, PRNG, puzzle solvers | every commit |
| Property | fast-check | Invariants (see §4) | every commit |
| Scenario | `sim-harness` | Scripted multi-tick situations in a small map | every commit |
| Content validation | `content-tools` | Schemas, IDs, dialogue graphs, clue web | every commit |
| Solvability | `content-tools` | Route/ending reachability from a fresh start | every commit (fast mode), nightly (full) |
| Replay / golden | `sim-harness` | Recorded input logs → expected state hashes | every commit |
| Browser smoke | Playwright | App boots, input, UI flows, no console errors | every PR |
| Visual regression | Playwright screenshots | UI panels and fixed lighting scenes (tolerance-based) | nightly |
| Performance | Playwright + core benchmarks | Frame time, sim step cost, load time | nightly + before release |
| Manual playtest | Humans | Feel, clarity, tone, accessibility | per milestone |

Coverage targets: ≥ 90% line/branch on `packages/core`; no target on the client (guard it with smoke and visual tests).

## 3. Scenario testing (the main workhorse)
A scenario places entities on a tiny map, scripts commands, and asserts events/state. Example:

```ts
scenario("Warden raises alert one step on sighting", (s) => {
  s.map("corridor_a").player(2, 5).warden({ at: [10, 5], facing: "W" });
  s.advance(seconds(2));
  s.expectEvent("AlertChanged", { to: "Suspicious" });
  s.advance(seconds(config.alertDecaySeconds + 1), { playerHidden: true });
  s.expectAlert("Calm");
});
```
Standard scenarios per system are listed in §5. Every bug fix adds a scenario that failed first.

## 4. Property and invariant tests
- **Conditions are pure:** evaluating twice yields the same value and does not change state.
- **Effects are the only mutators:** state hash changes only through `EffectRunner`/step.
- **Save round-trip:** `load(save(state))` is deep-equal and subsequently steps identically for N ticks.
- **Alert bounds:** alert never leaves `Calm..Lockdown`; decay never skips a level.
- **Trust bounds:** always one of three states; a single act changes it by at most one step; for any reachable state there exists a sequence of acts raising it to "trusts you" (recoverability, CMP-4).
- **Clues never vanish:** processing, Lull dulling, and saves never delete a learned clue (FAIL-5, CLU-6).
- **Inventory conservation:** items are created/destroyed only by named effects; confiscation moves items to the locker.
- **No numeric trust leak:** UI/text snapshot tests assert no digits or bar elements in the companion panel.
- **Detection monotonicity:** with no change in geometry, being closer and in the cone never *decreases* suspicion gain.
- **Puzzle solvers:** for generated seeds, `solve(init)` yields a sequence that reaches `isSolved`; invalid moves are rejected without changing state.

## 5. Requirement-by-requirement test map
| Area | Tests (minimum) | Reqs |
|---|---|---|
| Movement | speeds per mode; collision; sub-tile determinism | CORE-1/2 |
| Clock | curfew/shift/Quiet Hours boundaries; pause freezes sim | CORE-3/4, WLD-8 |
| Zones/passes | resolver table: (identity, zone, time, expiry, uses) → outcome; null → PendingReview; forged/borrowed/stolen origin effects | STE-1/2/3 |
| Noise | radii by movement mode; wall dampening; door noise | STE-4 |
| Demerits | accumulation, decay, threshold → enforcer/check | STE-6 |
| Vision | cone angle edges, range edges, occlusion, light modifier; Checker short range | ROB-1 |
| Robot types | one signature behavior each (patrol/ID, static watch, compliance check, pursuit, random audit, heavy resilience) | ROB-3 |
| Robot comms | propagation range + latency; memory expiry; repair tasks | ROB-2/5 |
| Alert | transition table; decay; effects of bribery/paperwork | ALR-* |
| Combat | non-lethal tools; fight raises alert + costs; lethal flag set | CMB-* |
| Failure | processing confiscation; recovery side problem; escalation at arrests; Halloran-7 deal ≥ 3 | FAIL-* |
| Dialogue | clue-gated options appear/disappear; present-clue reactions by reliability; effects applied; compiler rejects dead ends/unreachable | DLG-* |
| Notebook | add/search/link; contradiction resolution; hidden reliability until verified; derived quest log; map annotations | CLU-* |
| Lull | exposure threshold; dulled entries deterministic; restore on sleep; anchor inert | CLU-6 |
| Economy | service gating; null refusal; loan interest; sell-info consequence flag | ECO-* |
| Puzzles/terminals | solver per type; terminal access conditions; ≥ 2 routes per critical puzzle | HAK-*, PUZ-* |
| Augments | slot/power validation; each modifier effect | AUG-* |
| World | district reaction table; metrics response; NPC routines | WLD-* |
| Companions | trust steps; gating per candidate; complications present; awakening always fires; sequel flags written | CMP-* |
| Past self | each breadcrumb reachable via ≥ 2 sources; stance derivation incl. ties/never discovered; embrace/reject effects | PST-* |
| Endings | three routes × four mentors × four companions enumerated; closing scene selects correct lines; no epilogue assets; MERIDIAN standing flag | END-* |
| Save | round-trip, migration fixtures from every past version, corrupt/unknown version rejected, autosave triggers | SAV-* |

## 6. Content validation (CI gate)
Fails the build when any is true:
- Schema violation; duplicate or unknown IDs; dangling reference (clue/item/NPC/flag/zone/quest).
- Clue with no obtainable source, or with no consumer *and* no `flavor` tag (orphan).
- Dialogue: unreachable node, missing target, dead end without `end`, option gated on an unobtainable clue.
- Mentor arc: any beat missing an override for any of the four mentors (CMP-2).
- Exactly-one-inventory-puzzle rule violated (PUZ-2).
- A numeric literal in system code that should be config (lint rule, NFR-8).
- Any digit-bearing or bar-like UI element in the companion status panel (CMP-3).
- Use of `Math.random`, `Date.now`, DOM or WebGL in `packages/core` (lint).

## 7. Solvability checker
The checker abstracts the game to **(knowledge, flags, items, credits-band, zones-accessible, time-phase)** and searches for routes to each ending from a fresh start.

It must report, for every combination of `{mentor ×4, companion ×4 (+ none), route ×3, past stance ×3}` with and without optional areas:
1. **Reachability:** the ending is reachable without any combat action.
2. **Critical-puzzle redundancy:** every critical puzzle has ≥ 2 distinct achievable solutions (PUZ-1).
3. **No soft locks:** from every reachable state, some route to an ending remains (the soft-failure model means arrests must not remove progress).
4. **Clue provenance:** every clue needed on a route has a source reachable from at least one *different* starting direction (supports the "clue trail reachable from different starts" guideline).
5. **Trust recoverability:** gating "trusts you" is reachable from the worst state.
6. **Companion exclusivity:** only the chosen companion can be escapee; others never satisfy the final gate (CMP-1).
- **Fast mode** (per commit): a representative sample of combinations. **Full mode** (nightly): all.
- The checker's own tests use hand-built fixtures with known dead ends, soft locks, and single-solution puzzles that it must flag.

## 8. Accessibility checklist (manual + partly automated)
- [ ] Every action rebindable; keyboard and gamepad parity (ACC-1).
- [ ] Colorblind palettes verified with a simulation tool on cones, alert HUD, puzzle states.
- [ ] No information conveyed by color alone (shape/label as well).
- [ ] Text scale 100% and 200% — no overflow/clipping in dialogue, notebook, inventory (automated screenshot at both scales).
- [ ] Reduced-flashing mode removes strobes; flashing frequency below threshold otherwise.
- [ ] Alert changes have an audio cue and a visual cue.
- [ ] Puzzle skip/assist toggles function and are recorded in saves without breaking progression.
- [ ] Dialogue is fully readable without audio; voice barks optional.

## 9. Performance and platform
- **Core benchmark:** 40 robots, full district, 10,000 ticks, average step ≤ 4 ms (NFR-1) — fail the build if +25% over the recorded baseline.
- **Frame time:** Playwright run of a scripted route on the reference laptop profile; p95 frame ≤ 16.7 ms at 1080p; quality toggle verified to improve it.
- **Load:** district load < 3 s cached; first load < 10 s on broadband profile (NFR-2).
- **Offline:** after first load, kill the network and complete a district transition (NFR-9).
- **Browsers:** smoke suite on latest two Chromium, Firefox, Safari (NFR-6).
- **GitHub Pages deploy (DESIGN §16.2):** the deploy workflow must not publish when lint, validation, tests, or the build fail (verify once with a deliberately broken branch); after a deploy, a Playwright smoke run against the live Pages URL confirms the game boots under the `/<repo>/` subpath with no 404s; storage keys are all `quiet-hours:`-prefixed (unit test over the storage layer).
- **Deployment (DESIGN §16):** serve the release zip from the web root and from a subfolder with a plain static server and confirm the game loads with no 404s; confirm the bundle contains no debug overlay; confirm update flow (old save loads after a new build) and that export/import round-trips.
- **Memory:** a 4-hour soak (scripted loop) shows no growth > 10% after warm-up.

## 10. Playtesting
| Round | When | Who | Focus |
|---|---|---|---|
| P1 | End of M1 | Dev + 2-3 friends | Is stealth readable and fair? Is the dialogue/notebook loop fun? |
| P2 | After T3.17 | 5+ testers, fresh eyes | Can they find the information trail? Where do they get lost/stuck? |
| P3 | M5 | 8+ incl. accessibility needs | Balance, pacing, endings, tone of the story and humor. |

Collect: session recordings (replay logs), time-to-complete per district, number of arrests, where they used hints, which route/mentor/companion they chose, and a short survey (stuck points, confusing rules, favorite moment).
**Stuck-point rule:** if ≥ 30% of testers stall > 10 minutes at the same place, fix it (clue placement, signposting), then re-test.

## 11. Bug policy
- **S1** crash, data loss, soft lock, unwinnable → blocks release. **S2** major system broken with workaround → blocks release candidate. **S3** minor/visual → fix when practical. **S4** polish.
- Every S1/S2 fix adds an automated scenario, property test, or checker fixture.

## 12. Debug and test tooling
- **Replay recorder/runner:** every session can export `{seed, version, commands[]}`; the runner replays and compares state hashes (golden tests keep a library of recorded runs for regression).
- **Scenario teleport:** debug overlay lets a tester jump to a scenario state (flags/inventory/time) to test a late-game moment fast.
- **State inspector:** shows flags, clues, trust causes log, alert timers, and the district state.
- **Seeded runs:** all random-dependent tests print the seed on failure.

## 13. Exit criteria
**Vertical slice (M1):** all §4 invariants implemented for the slice; slice scenarios pass; P1 held.
**Core systems (M2):** all robot-type scenarios, save round-trip, migrations, checker v1 green; coverage ≥ 90% on core.
**Content (M3):** validators clean; solvability full-mode green for all required combinations; P2 stuck-points fixed.
**Optional areas (M4):** checker green with optional areas; Lull/Hollow consequence scenarios pass.
**Release (M5):** no open S1/S2; perf, accessibility, and browser matrices pass; P3 findings triaged; full-run replay of each route/ending passes in CI.

## 14. Traceability
Each test file header lists the requirement IDs it covers (`// covers: ALR-1, ALR-2`). A script generates a coverage matrix (requirement → tests) and the CI fails on any **Must** requirement with no covering test once its phase is reached.
