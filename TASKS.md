# TASKS — Quiet Hours

*Work breakdown by milestone (concept §11). Each task lists the requirements it satisfies (`Reqs`), dependencies (`Dep`), and a **done** condition tied to tests in [TESTING.md](TESTING.md). Status: `[ ]` todo, `[~]` in progress, `[x]` done. Sizes: S ≤ 1 day, M ≈ 2-3 days, L ≈ 1 week. Assume one primary developer plus Claude; adjust to taste.*

**Working rules**
- A task is done only when its tests exist and pass, validators are green, and the docs it touches are updated.
- Core logic first, then client. Never put logic in the client.
- New content must come with validator-clean data and a test or solvability entry.

---

## M0 — Foundations (spike and scaffolding)
**Status (2026-11-08):** T0.1–T0.6 all done and green (`pnpm check`: typecheck, core-purity lint, content validation, 51 tests; production build and no-debug check pass). **T0.4 is done:** the maintainer confirmed in a real browser that the lighting looks right (bevel-lit walls, cone light, neon tint), input works, and the HUD shows 60 FPS; ADR-1 (Phaser) stands (see `docs/adr/0001-renderer-spike.md`). T0.1 is fully verified: the Pages deploy ran and the game loads at the Pages URL (confirmed by the maintainer, 2026-11-08).
| ID | Task | Reqs | Dep | Size | Done when |
|---|---|---|---|---|---|
| T0.1 | Repo scaffold: pnpm workspace, TS strict, Vite (`base: './'`), Vitest, ESLint (ban `Math.random`/`Date.now`/DOM in core), `.nvmrc`, and GitHub workflows `ci.yml` and `deploy.yml` (DESIGN §16.2) publishing a placeholder page to GitHub Pages. | NFR-3, NFR-4, ADR-7 | | S | `pnpm test` and lint run in CI on an empty core; a push to `main` publishes the placeholder to the Pages URL. |
| T0.2 | Seedable PRNG module + injected `Clock`/`Config` types. | NFR-3, NFR-8 | T0.1 | S | Unit tests: same seed → same sequence; no global state. |
| T0.3 | Core sim skeleton: fixed-step `step()`, command queue, event bus, snapshot. | CORE-3, CORE-4 | T0.2 | M | Headless test steps 1000 ticks deterministically (hash equality across runs). |
| T0.4 | Renderer spike: Phaser tilemap, player sprite, one cone light, one normal-mapped wall, 60 FPS on target hardware. | NFR-1, ADR-1 | T0.1 | M | Spike report in `docs/adr/`: keep Phaser or switch; perf numbers recorded. |
| T0.5 | Content pipeline skeleton: schemas from TS types, loader, ID-integrity validator. | NFR-5 | T0.1 | M | Validator fails on a deliberately broken fixture; passes on the sample. |
| T0.6 | `sim-harness`: scenario DSL (place entities, script commands, assert events). | NFR-10 | T0.3 | M | One example scenario runs in CI. |

## M1 — Vertical slice (one district) — COMPLETE (2026-11-08)
**Status:** T1.1–T1.13 done; signed off by the maintainer after a browser walkthrough of every REQUIREMENTS §4 slice acceptance item. First playtest (P1) found the slice impossible as built; fixed by sneak-aware detection, retuning, a new spawn/patrol and a second route (`docs/playtests/P1-slice-notes.md`, guarded by `slice-fairness.test.ts`). Terminal UI redrawn after the maintainer could not tell the puzzle auto-accepts. Known slice gaps, all scheduled in M2: restricted-zone enforcement and curfew effects (T2.3), portraits (art, M5), the other robot types (T2.1). Author references: `docs/maps.md`, `docs/dialogue.md`.
Goal: concept §11.1. Uses a trimmed Stacks block.
| ID | Task | Reqs | Dep | Size | Done when |
|---|---|---|---|---|---|
| T1.1 | Tile world model: collision, zones, doors; map import from the editor format (Tiled JSON). | CORE-2, STE-1 | T0.3 | M | Unit tests for collision and door rules; a sample map loads. |
| T1.2 | Player movement (walk/sneak/run), noise emission. | CORE-1, STE-4 | T1.1 | S | Tests: speeds, noise radii read from config. |
| T1.3 | Vision cone + raycast occlusion + suspicion accumulator. | ROB-1 | T1.1 | M | Scenario tests: seen/not-seen cases, occlusion, accumulation timing. |
| T1.4 | Warden behavior tree (patrol, investigate, chase). | ROB-1, ROB-3 | T1.3 | M | Scenario: patrol loop; investigate noise; chase on sighting. |
| T1.5 | Alert state machine + decay. | ALR-1, ALR-2 | T1.4 | S | Table-driven tests for transitions and decay timing. |
| T1.6 | Soft failure: capture → processing → holding room → resume; confiscation. | FAIL-1/2/5 | T1.5 | M | Scenario: caught → items confiscated, flags and clues intact. |
| T1.7 | Condition/effect language + `EffectRunner`. | ADR-3 | T0.3 | M | Property tests: conditions pure; effects emit expected events. |
| T1.8 | Clue model + notebook state + `.qdl` compiler (MVP syntax) + dialogue runtime. | CLU-1, DLG-1/2/3/5 | T1.7 | L | One conversation with a clue-gated option works headless; compiler flags a dead end. |
| T1.9 | Terminal entity + one `powerRouting` puzzle + solver; door opens on solve. | HAK-1/2 | T1.7 | M | Solver proves solvable; the puzzle rejects invalid moves. |
| T1.10 | Client: render world, lighting, robots, cones (debug), HUD alert indicator. | CORE-1, ALR-1 | T0.4, T1.5 | L | Manual: slice playable in browser at 60 FPS. |
| T1.11 | Client: dialogue window and basic notebook list. | DLG-1, CLU-2 | T1.8 | M | Manual + Playwright smoke: open conversation, pick clue-gated option. |
| T1.12 | Input action layer + keyboard + gamepad default maps. | ACC-1 | T1.10 | S | Playwright: actions fire from key events; unit tests for mapping. |
| T1.13 | Slice integration + playtest + decision record. | all VS | T1.1-T1.12 | M | Slice acceptance criteria in REQUIREMENTS §4 all demonstrated; playtest notes filed. |

## M2 — Core systems
**Status:** T2.9 done (trust is exactly one step per act and clamped, a bounded causes log, a validator check that lowered trust can always be recovered, tests that the UI exposes only the one line; `docs/trust.md`). T2.8 done (time-window rosters for robots and cameras, Quiet Hours curfew strictness and forgery window, NPC routines with spots and walking; `docs/schedules.md`). T2.7 done (district state, hidden city metrics with recovery, data-driven reactions, `activeWhen` robots and cameras, MERIDIAN reinforcements; `docs/districts.md`). T2.6 done (tool items: decoy, cutters, stun, lethal; fights always raise the alert, call help and cost gear and credits; lethal force is recorded; `docs/combat.md`). T2.5 done (services as data with specific refusals incl. the null state, loans with daily interest and collectors; `docs/economy.md`). T2.4 done (wrist band with slots and power, six augments from data, pickups, items, Gear panel; `docs/augments.md`). T2.2 done (robot-to-robot alerts with range, latency, one hop; shared memory of the last report with expiry that hunters are sent to; fixed cameras with sweep, ID checks, witnessing and disabling; maintenance robots that repair cameras and re-lock doors after a delay; `docs/robots.md`). T2.1 done (all six robot types as config profiles with per-type behaviour, `docs/robots.md`). T2.3 done (identity/pass system, resolver with null state, demerit ledger with thresholds, forged-pass detection by thorough scans, processing confiscates and returns passes; `docs/identity.md`). Remaining: T2.10–T2.15.
| ID | Task | Reqs | Dep | Size | Done when |
|---|---|---|---|---|---|
| T2.1 | Remaining robot types: Sentry, Checker, Hound, Auditor, Heavy. | ROB-3 | T1.4 | L | A scenario per type validating its signature behavior. |
| T2.2 | Robot comms, memory, repair tasks. | ROB-2, ROB-5 | T2.1 | M | Scenarios: alert propagation range/latency; camera repair. |
| T2.3 | Identity/pass system, pass resolver, null state, demerit ledger. | STE-2/3/6 | T1.7 | L | Table tests of resolver outcomes; null → PendingReview. |
| T2.4 | Inventory, items, augment slots/power, six augments. | AUG-1..4, STE-7 | T1.7 | L | Equip validation tests; each augment's modifier verified in a scenario. |
| T2.5 | Economy: credits, services, loans/collectors, null-state refusals. | ECO-1/2/3 | T2.3 | M | Service tests; loan interest ledger deterministic. |
| T2.6 | Non-lethal tools and optional combat consequences. | CMB-1/2/3 | T2.4 | M | Scenarios: fight raises alert and costs gear. |
| T2.7 | District state, Reaction table, city metrics, MERIDIAN reallocation. | WLD-3/4, ALR-4 | T1.5 | M | Sabotage scenario changes patrols; metrics respond. |
| T2.8 | In-game clock, schedules, NPC routines, Quiet Hours rules. | WLD-5/8, CORE-3 | T1.3 | M | Time-driven scenarios (curfew, shift change, Quiet Hours). |
| T2.9 | Trust model (3 states), trust line, causes log. | CMP-3/4 | T1.8 | M | Tests: one act = one step both ways; recoverable; UI shows only a line. |
| T2.10 | Save/load, migrations, autosave/checkpoints, slots; **Export/Import save file** and persistent-storage request (DESIGN §16.6). | SAV-1/2/3 | T1.x | L | Round-trip determinism test; fixture migration tests; corrupt save rejected; exported file re-imports to an identical state hash. |
| T2.11 | Remaining puzzle types: signalPath, scheduleAlign, ruleContradiction + solvers. | HAK-2 | T1.9 | L | Solver tests per type. |
| T2.12 | Notebook UI full: search, link, quest log, annotated map. | CLU-2/3/4/5 | T1.11 | L | Playwright flows; derived-quest-log unit tests. |
| T2.13 | Settings, rebinding UI, colorblind palettes, text scale. | ACC-1/2/3 | T1.12 | M | Playwright: rebind persists; palettes applied; 200% text layout test. |
| T2.14 | Tuning config consolidation. | NFR-8 | any | S | Lint: no magic numbers in systems listed in DESIGN §12. |
| T2.15 | **Solvability checker v1** (knowledge/flag/item graph search). | ADR-6 | T1.7, T1.8 | L | Checker finds an intentional dead end in a fixture; CI step added. |

## M3 — Content pass
Content order is chosen to unblock the solvability checker early: build the full information backbone before polish assets.
| ID | Task | Reqs | Dep | Size | Done when |
|---|---|---|---|---|---|
| T3.1 | Information web design sheet: ≈60-80 clues, sources, reliability, links. | CLU-8 | | L | Sheet reviewed; validator passes; every clue has ≥ 1 source. |
| T3.2 | Stacks: map, NPCs, curfew/informants/cameras, first breadcrumbs. | WLD-2 | T2.8 | L | Playable end-to-end Act I opening. |
| T3.3 | Safehouse hub (saving, shops, growth). | WLD-1 | T2.10 | M | Growth states driven by flags; saving works. |
| T3.4 | Civic Core: map, queues/forms, permits, checkers. | WLD-2, ECO-4 | T2.3 | L | Playable; SQ-01 complete. |
| T3.5 | Industrial Belt: machinery timers, power nodes. | WLD-2 | T2.7 | L | Playable; SQ-03, SQ-04 complete. |
| T3.6 | Transit Underworks: train timetable puzzle. | WLD-2 | T2.11 | L | Playable; SQ-05, SQ-06 complete. |
| T3.7 | Mentor arc (once) + four voicings + specialties. | CMP-2/8 | T2.9, T1.8 | L | Validator: every beat has four overrides; specialty effects tested. |
| T3.8 | Mentor introductions and choice in Act I. | CMP-2 | T3.7 | M | Scenario for each of the four choices. |
| T3.9 | Past-self breadcrumbs and the M1/M2/M3 choice moments. | PST-1/2/3 | T3.4 | M | Each breadcrumb reachable from ≥ 2 sources (checker); stance derivation tests. |
| T3.10 | Candidates: Pallas arc and inventory puzzle. | PUZ-2, CMP-5 | T2.4 | L | Puzzle solvable; one-inventory-puzzle validator green. |
| T3.11 | Gate area, three routes, route requirements. | END-1 | T3.2-T3.6 | L | Checker proves each route reachable without combat. |
| T3.12 | Companion gating, awakenings, sequel flags. | CMP-1/5/6/7, END-4 | T3.7, T3.10 | L | Enumerated-combo test over mentors × companions × routes. |
| T3.13 | Closing scene and sequel card. | END-2/3/5 | T3.12 | M | Scene test for all companion variants; no epilogue content present. |
| T3.14 | Side-quests SQ-01..SQ-10 (cut order: SQ-06, SQ-09 first). | STORY §5 | T3.2-T3.6 | L | Each quest has start/complete/fail paths tested. |
| T3.15 | Civic Voice broadcast pool (~40 lines) and Halloran-7 arc. | FAIL-4 | T2.8 | M | Pool selection tests; arrest-count dialogue tests. |
| T3.16 | Hint system and multi-solution verification for all critical puzzles. | CLU-7, PUZ-1/3 | T3.x | M | Checker reports ≥ 2 routes per critical puzzle. |
| T3.17 | Full-run playtest 1 (internal) and fix list. | — | all | L | Notes filed; blockers fixed. |

## M4 — Optional areas
| ID | Task | Reqs | Dep | Size | Done when |
|---|---|---|---|---|---|
| T4.1 | Lull district: shops, gossip, Host, Lila Voss. | WLD-6 | T3.x | L | Playable; SQ-08 complete. |
| T4.2 | Notebook dulling + Memory Anchor + restoration. | CLU-6 | T2.12 | M | Tests: exposure → dulled; sleep → restored; anchor → inert; never lost. |
| T4.3 | Signatory arc (Odile): awaken mini-arc, fragility rules. | CMP-5 | T4.1 | L | Gating tests incl. Lull pull-back when Alert is high. |
| T4.4 | Hollow district: discovery risk, Marrow, Bede, June. | WLD-7 | T3.x | L | Playable; SQ-07 complete. |
| T4.5 | Hollow risk/wipe-out consequences; Lull disruption branch. | WLD-7, WLD-6 | T4.1, T4.4 | M | Scenarios for discovery paths and outcome flags. |
| T4.6 | June arc and her route requirements. | CMP-5 | T4.4 | M | Gating tests. |
| T4.7 | Convert the checker: add optional areas + re-run all combos. | ADR-6 | T4.x | M | All combos green. |

## M5 — Polish
| ID | Task | Reqs | Dep | Size | Done when |
|---|---|---|---|---|---|
| T5.1 | Art pass: tilesets, sprites, portraits (hi-bit), final lighting. | | | L | Style guide followed; review sign-off. |
| T5.2 | Adaptive music and district themes, SFX, spatial PA. | AUD-1/2 | T2.5 | L | Alert-switch test; stems crossfade without clicks. |
| T5.3 | Accessibility pass: reduced flashing, audio cues, assist toggles, skip-after-attempts. | ACC-2, HAK-3 | T2.13 | M | Checklist in TESTING §8 all green. |
| T5.4 | Performance pass: staggering, caching, load times, offline support. | NFR-1/2/9 | | M | Perf CI budgets met. |
| T5.5 | Balance pass: detection, economy, alert decay, difficulty presets. | NFR-8 | | M | Playtest data summarized; tunings committed. |
| T5.6 | Playtests 2-3 (external), bug bash, release candidate. | | | L | No open S1/S2 bugs; exit criteria in TESTING §10. |
| T5.7 | Reconciliation Week (proposal approved). | WLD-9 | | M | 7-day soft deadline: after day 7 the Gate re-keys and Act III adds one checkpoint; no progress lost; scenario tests cover day 6/7/8. |
| T5.8 | Build, deploy, and release: finalize DESIGN §16 (service worker, `QH_*` build variables, `check:no-debug`, `release.yml` zip + checksum, `nightly.yml`), pin and update workflow action versions, namespace all storage keys (`quiet-hours:`), choose the final Pages URL/custom domain, test a fresh fork following §16.2 and the release zip on a second host (subfolder), decide source/asset licenses. | NFR-6, NFR-9, ADR-7 | T5.4 | M | A fresh fork with only the two Pages settings changes publishes a working game; a fresh clone follows §16.3 to a working `dist/`; the release zip runs from a subfolder on a plain static host; CI fails if debug code is in the bundle. |

## Critical path
T0.3 → T1.7 → T1.8 → T2.15 (checker) → T3.1 (information web) → T3.11 (Gate) → T3.12 → T3.13.
The solvability checker and the information web are the highest-risk items; do them as early as their dependencies allow.

## Suggested first week
T0.1, T0.2, T0.3 (core skeleton), T0.5 (validators), then T0.4 (renderer spike) in parallel; end of week: spike decision and a headless sim running in CI.

## Backlog / parking lot
- Sequel hooks beyond flags (nothing in v1).
- Mobile/touch.
- Localization (strings are already in data; defer tooling).
