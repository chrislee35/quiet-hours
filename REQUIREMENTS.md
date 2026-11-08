# REQUIREMENTS — Quiet Hours

*Source of truth for "what the game must do." Derived from [GAME_CONCEPT.md](GAME_CONCEPT.md) and [STORY_EXPANSION.md](STORY_EXPANSION.md). Each requirement has a stable ID used by [TASKS.md](TASKS.md) and [TESTING.md](TESTING.md). Do not renumber; retire IDs instead.*

**Priority:** **M** = Must (ships in v1), **S** = Should (v1 if time), **C** = Could (post-v1 / cut first).
**Phase:** VS = vertical slice, CS = core systems, CP = content pass, OA = optional areas, PL = polish (matches concept §11).

## 1. Scope
- **In scope:** a single-player, web-based (TypeScript, modern desktop browser), top-down real-time stealth-adventure, 3-5 hour run, three Gate routes, four Mentor choices, four escapee candidates, one fixed closing scene.
- **Out of scope (v1):** mobile/touch as a supported platform (basic on-screen controls exist so playtesters can try the game on tablets and phones; layout, performance and touch-first design are not goals), multiplayer, full voice acting, hardcore/permadeath mode, epilogue vignettes, toppling MERIDIAN (sequel).

## 2. Functional requirements

### 2.1 Core loop and movement (CORE)
| ID | Requirement | Pri | Phase |
|---|---|---|---|
| CORE-1 | Top-down real-time movement with smooth (sub-tile) motion and walk / sneak / run speeds. | M | VS |
| CORE-2 | Player is blocked by collision geometry; doors, gates, and lifts open/close by rule. | M | VS |
| CORE-3 | A single simulation clock (in-game time) drives day/night, curfews, shifts, train timetables, and Quiet Hours (02:00-05:00). | M | VS |
| CORE-4 | Game can pause (menu, notebook, dialogue) without advancing the simulation. | M | VS |
| CORE-5 | Interact action (talk, use, hack, pick up) with a clear in-world prompt. | M | VS |

### 2.2 Stealth, zones, passes (STE)
| ID | Requirement | Pri | Phase |
|---|---|---|---|
| STE-1 | Map is divided into **zones**, each with a required permission level. Being present without a valid pass raises suspicion. | M | VS |
| STE-2 | **Passes/IDs** have attributes: zone(s), expiry, one-time use, origin (issued, forged, borrowed, stolen). | M | CS |
| STE-3 | The player has a **null state** (no record). Scanners return null, which subsystems treat as "pending review", not violation; services that need a record refuse. | M | CS |
| STE-4 | Noise model: hearing radius ≈ 3 tiles walking, 1 sneaking, 8 running (tunable). | M | VS |
| STE-5 | Hiding and appearance changes (disguise) reduce Alert decay time and sighting recognition. | S | CS |
| STE-6 | **Demerits**: minor infractions accumulate; threshold triggers an enforcer or a check. | M | CS |
| STE-7 | Ghost Tag spoofs a single scan; Quiet Step reduces noise; effects are rule-driven, not scripted. | M | CS |

### 2.3 Alert and robots (ALR, ROB)
| ID | Requirement | Pri | Phase |
|---|---|---|---|
| ALR-1 | Four Alert levels: Calm, Suspicious, Hunting, Lockdown. | M | VS |
| ALR-2 | A Warden sighting raises Alert one step; losing pursuers lowers one step per ≈90 s of out-of-sight time (tunable). | M | VS |
| ALR-3 | Alert can also be lowered by bribery, paperwork, or fixing records. | S | CS |
| ALR-4 | Alert drives district rule changes (lockdown, curfew, new checkpoints) and adaptive music. | M | CS |
| ROB-1 | Robots have vision cones (≈90°, 6-tile range; Checker 4), hearing radius, patrol routes, schedules, and memory of recent sightings. | M | VS |
| ROB-2 | Robots share alerts with nearby robots through a communication rule (range/latency). | M | CS |
| ROB-3 | Initial types: Warden, Sentry, Checker, Hound, Auditor, Heavy, each with a distinct behavior profile. | M | CS (Warden in VS) |
| ROB-4 | Robots can be avoided, distracted, disabled, hacked, or fooled; each answer is supported by at least one item/augment. | M | CS |
| ROB-5 | Robots repair broken cameras and re-lock doors after a delay (emergent response). | S | CS |
| ROB-6 | Pallas, Brindle, and the Conductor are non-hostile robots with dialogue, outside the hostile AI. | M | CP |

### 2.4 Combat (CMB)
| ID | Requirement | Pri | Phase |
|---|---|---|---|
| CMB-1 | Non-lethal tools (stun, jam, disable, redirect) exist. | M | CS |
| CMB-2 | Fighting always raises Alert, calls reinforcements, and costs gear/credits. | M | CS |
| CMB-3 | Lethal options are rare, noisy, and have a recorded consequence flag. | S | CS |
| CMB-4 | No critical path requires combat. | M | CP |

### 2.5 Failure (FAIL)
| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FAIL-1 | Capture/knockout leads to a **processing** sequence at a holding facility; the game continues. | M | VS |
| FAIL-2 | Processing confiscates gear/credits and sets an Alert or standing setback. | M | VS |
| FAIL-3 | Confiscated items are recoverable by a small side problem; difficulty setting decides if some are lost permanently. | M | CS |
| FAIL-4 | Repeated arrests escalate processing (stricter, tracking), and enable Halloran-7's deal at ≥ 3 arrests. | S | CP |
| FAIL-5 | Processing never removes notebook clues or story flags. | M | VS |

### 2.6 Dialogue (DLG)
| ID | Requirement | Pri | Phase |
|---|---|---|---|
| DLG-1 | Dedicated dialogue window shows portrait, name, mood, text, and choices. | M | VS |
| DLG-2 | Dialogue is a graph of nodes with conditions (clues, flags, items, trust, time) and effects (clues, flags, items, trust, credits, alert). | M | VS |
| DLG-3 | Options may be gated by a held clue; the player may **present a clue** to pressure, trade, or verify. | M | VS |
| DLG-4 | NPC conversations have recorded consequences (trust, suspicion, favors, costs). | M | CS |
| DLG-5 | Dialogue authors can write in a plain-text format that compiles to the graph; the compiler reports dead ends and unreachable nodes. | M | CS |
| DLG-6 | Text-only with short voice barks (optional audio) and portrait mood changes. | M | CP |
| DLG-7 | Romance is opt-in for the Mentor; it never alters gating or the trust line. | M | CP |

### 2.7 Notebook and clues (CLU)
| ID | Requirement | Pri | Phase |
|---|---|---|---|
| CLU-1 | A clue has ID, text, source, reliability (true / false / outdated / planted), tags, and links to other clues. | M | VS |
| CLU-2 | Notebook UI: list, search/filter, link/unlink clues, and a derived quest log. | M | CS |
| CLU-3 | Auto-annotating map: places, people, zones, and schedules appear as the player learns them. | M | CS |
| CLU-4 | Clues may contradict; resolving requires cross-checking and is recorded (verified / disproved). | M | CS |
| CLU-5 | Reliability is **hidden** until the player verifies or the game reveals it. | M | CS |
| CLU-6 | The Lull dulling greys and blurs the newest N entries; restored by sleeping at the Safehouse; Memory Anchor prevents it; never permanent. | M | OA |
| CLU-7 | Hints come from the Notebook; an optional hint level exists in settings. | M | CP |
| CLU-8 | Information web: ≈60-80 clues, each with source, reliability tag, and links. | M | CP |

### 2.8 Economy and services (ECO)
| ID | Requirement | Pri | Phase |
|---|---|---|---|
| ECO-1 | Credits earned from odd jobs, favors, scavenging, selling information. | M | CS |
| ECO-2 | Services: clinic/repair, loans (interest, collectors), forgery, fences, black market, transit fares, bribes, reintegration office. | M | CS |
| ECO-3 | Null state blocks legitimate services until the player forges/borrows/bribes an identity. | M | CS |
| ECO-4 | Bureaucratic forms/queues/fees are interactable systems whose rules interact (information puzzles). | M | CP |
| ECO-5 | Selling information is a recorded choice with later consequences (informants, Hollow risk). | M | CP |

### 2.9 Hacking and puzzles (HAK, PUZ)
| ID | Requirement | Pri | Phase |
|---|---|---|---|
| HAK-1 | Terminals expose information, door/camera controls, schedules; access requires codes, passes, or hacks. | M | VS (1 terminal) |
| HAK-2 | Logic puzzle types: circuit/power routing, signal paths, schedule alignment, rule contradiction. A few of each, with a consistent visual language. | M | CS |
| HAK-3 | Every logic puzzle has a skip-after-attempts assist toggle. | S | PL |
| PUZ-1 | Every critical puzzle has ≥ 2 solutions (stealth, social, technical). | M | CP |
| PUZ-2 | Exactly **one** inventory puzzle (Pallas's repair/registration parts). | M | CP |
| PUZ-3 | No progress is gated by pixel-hunting or chance. | M | CP |

### 2.10 Augments and gear (AUG)
| ID | Requirement | Pri | Phase |
|---|---|---|---|
| AUG-1 | No XP, levels, or stats. Progression is items, credentials, and augments only. | M | CS |
| AUG-2 | Augments occupy slots and consume a power budget on the wrist band. | M | CS |
| AUG-3 | Initial set: Quiet Step, Ghost Tag, Signal Lens, Slow Tongue, Burst Jammer, Memory Anchor. | M | CS |
| AUG-4 | Augments are found, bought, or crafted; the clinic repairs/maintains them. | M | CS |

### 2.11 World, districts, change (WLD)
| ID | Requirement | Pri | Phase |
|---|---|---|---|
| WLD-1 | Hub (Safehouse) with saving, planning, trading, and recurring allies; visibly improves with player help. | M | CP |
| WLD-2 | Five main districts, each with its signature rule set (concept §5). | M | CP |
| WLD-3 | District state changes after events (lockdown, power outage, new patrols, new dialogue); revisits feel different. | M | CS |
| WLD-4 | City metrics (order, power, contentment) change with player actions; MERIDIAN reallocates robots and rules in response. | M | CS |
| WLD-5 | NPC daily routines; some are informants; some can be bribed or befriended. | M | CS |
| WLD-6 | **The Lull** (optional): safe shops and gossip; dulling mechanic; disruption choice. | S | OA |
| WLD-7 | **The Hollow** (optional): discoverable, with a persistent *discovered* risk state and a wipe-out consequence. | S | OA |
| WLD-8 | Quiet Hours (02:00-05:00) alters patrol composition and opens hacking/forgery windows. | M | CS |
| WLD-9 | Optional Reconciliation Week pacing (see STORY_EXPANSION §7). | C | PL |

### 2.12 Companions and trust (CMP)
| ID | Requirement | Pri | Phase |
|---|---|---|---|
| CMP-1 | Exactly one candidate escapes; no follower AI. | M | CP |
| CMP-2 | Four candidate roles; Mentor is one of Ines, Maren, Tobias, Silas chosen in Act I; the same arc beats are voiced four times. | M | CP |
| CMP-3 | Trust is a hidden three-level state per candidate, shown **only** as one line in their dialogue window. No meter. | M | CS |
| CMP-4 | One meaningful act moves trust a full step either way; it is always recoverable. | M | CS |
| CMP-5 | Each candidate has a gating condition (trust + practical requirement) checked at the Gate; each adds a route-specific complication. | M | CP |
| CMP-6 | Every candidate gets an awakening beat regardless of route. | M | CP |
| CMP-7 | Non-escapee state is recorded as hidden sequel flags (free/hiding/arrested/left; ally/wary/estranged) and never displayed. | M | CP |
| CMP-8 | Mentor specialties apply as small, data-defined perks (cheaper identity, easier transit, Gate insight, extra rumors). | M | CP |

### 2.13 Past self (PST)
| ID | Requirement | Pri | Phase |
|---|---|---|---|
| PST-1 | Six breadcrumbs reachable from ≥ 2 directions each (STORY_EXPANSION §3). | M | CP |
| PST-2 | Three explicit embrace/reject moments set a `past_stance` flag (embraced / rejected / undiscovered). | M | CP |
| PST-3 | Embracing unlocks expert shortcuts at the cost of MERIDIAN visibility and cell trust; rejecting keeps the null edge. | M | CP |

### 2.14 Endings (END)
| ID | Requirement | Pri | Phase |
|---|---|---|---|
| END-1 | Three routes: Sneak out, Hack the gate, Break the Gate. All reachable without combat. | M | CP |
| END-2 | The closing scene (concept §9d) is fixed; only the companion's identity/voice and mentor romantic/platonic tone vary. | M | CP |
| END-3 | Sequel card shows title and tagline, no epilogue vignettes, no choice. | M | CP |
| END-4 | Sequel flags (Hollow, Lull, cell, Pallas, past stance, each non-escapee's state) are written to the final save. | M | CP |
| END-5 | MERIDIAN stays standing in every ending. | M | CP |

### 2.15 Save, settings, accessibility, audio
| ID | Requirement | Pri | Phase |
|---|---|---|---|
| SAV-1 | Versioned JSON saves with migrations; autosave plus manual save at the Safehouse and checkpoint saves in danger zones. | M | CS |
| SAV-2 | Save/load round-trips the full simulation state deterministically. | M | CS |
| SAV-3 | Multiple save slots; corrupt/unknown-version saves fail safely with a message. | M | CS |
| ACC-1 | Rebindable keyboard and gamepad controls. | M | CS |
| ACC-2 | Colorblind palettes; scalable text; reduced-flashing; audio cues for alerts; assist toggles. | M | PL |
| ACC-3 | The game is fully playable at 100% and 200% text scale. | S | PL |
| AUD-1 | Adaptive music layers keyed to Alert level; district themes. | M | PL |
| AUD-2 | Spatial SFX for robots, announcements, PA broadcasts. | S | PL |
| AUD-3 | Dialogue voice barks are optional and skippable. | C | PL |

## 3. Non-functional requirements
| ID | Requirement | Pri |
|---|---|---|
| NFR-1 | **Performance:** 60 FPS on a mid-range 2022 laptop (integrated GPU) at 1080p; sim step ≤ 4 ms average with 40 active robots. | M |
| NFR-2 | **Load:** district load < 3 s from local cache; initial load < 10 s on broadband. | S |
| NFR-3 | **Determinism:** with the same seed and inputs the simulation yields identical state. RNG is injected, never `Math.random()` in logic. | M |
| NFR-4 | **Separation:** game logic has no dependency on rendering, DOM, or audio, and runs headless under Node. | M |
| NFR-5 | **Data-driven:** districts, NPCs, dialogue, clues, items, augments are data files referenced by string IDs; all IDs validated at build time. | M |
| NFR-6 | **Browser support:** latest two versions of Chromium, Firefox, Safari (desktop). | M |
| NFR-7 | **Original content:** all names, art, audio, and text are original to this project. | M |
| NFR-8 | **Tunability:** all numbers in the concept's "build defaults" live in a single config file, editable without code changes. | M |
| NFR-9 | **Offline:** after first load the game runs without a network connection. | S |
| NFR-10 | **Observability:** a debug overlay shows alert, detection state, clock, flags; a deterministic replay file can be exported. | S |

## 4. Acceptance summary per phase
- **VS:** player walks a district, is seen by a Warden, alert rises/decays, one dialogue unlocks via a notebook clue, one terminal puzzle opens a door, getting caught triggers processing and resumes.
- **CS:** all six robot types, passes/demerits, economy, augments, save/load, and trust all work in test scenarios.
- **CP:** all five districts, the Safehouse, the information web, all puzzles, three endings, and four mentors are completable end-to-end; solvability checker passes.
- **OA:** Lull and Hollow function with their branching consequences.
- **PL:** accessibility, audio, and performance budgets pass.

## 5. Assumptions and open items
- Engine/renderer choice is made in DESIGN.md (ADR-1).
- Final art style tools and asset pipeline are decided in the M0 spike.
- Difficulty presets (what is lost permanently) are tuned in playtesting.
- Reconciliation Week (WLD-9) is optional; nothing else depends on it.
