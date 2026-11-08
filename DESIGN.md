# DESIGN — Quiet Hours

*Technical design. Implements [REQUIREMENTS.md](REQUIREMENTS.md). Requirement IDs are cited in brackets. Decisions are recorded as ADRs at the end; change an ADR rather than silently diverging.*

## 1. Architecture overview
Three layers with a strict one-way dependency: **content → core → client**.

```
 content/ (JSON/YAML + .qdl dialogue)      validated at build time
        │
        ▼
 packages/core   (pure TypeScript, no DOM/WebGL/audio)  [NFR-4]
   sim · world · stealth · alert · robots · dialogue · clues · economy
   · companions · endings · save
        ▲  commands in / events + state snapshots out
        │
 packages/client (renderer, input, audio, UI)
   rendering · lighting · input mapping · UI panels · audio engine
```

- The client **never mutates** core state. It sends **commands** (`Move`, `Interact`, `Choose`, ...) and renders **snapshots** and **events** (`AlertChanged`, `ClueGained`, ...).
- The core is a deterministic fixed-step simulation [NFR-3]: `state' = step(state, commands, dt, rng)`. All time comes from the sim clock, all randomness from an injected seedable PRNG.
- Tooling packages: `packages/content-tools` (validators, dialogue compiler, solvability checker) and `packages/sim-harness` (headless scenario runner), used by tests and CI.

### 1.1 Repository layout
```
quiet-hours/
  packages/
    core/            src/{sim,world,stealth,robots,dialogue,clues,economy,companions,endings,save,rng}
    client/          src/{render,lighting,input,ui,audio,app}
    content-tools/   validators, compiler (.qdl → JSON), solvability checker
    sim-harness/     scenario DSL, replay runner
  content/
    config/          tuning.json (all numbers) [NFR-8]
    districts/  npcs/  dialogue/  clues/  items/  augments/  puzzles/  quests/  broadcasts/
  assets/            art, audio (original only) [NFR-7]
  docs/              ADRs, authoring guides
```
The project directory is named for Python, but the stack is TypeScript per the concept. No Python is required.

## 2. Technology choices (see ADRs)
- **Language/build:** TypeScript (strict), Vite, pnpm workspaces.
- **Renderer:** Phaser (tilemaps, built-in 2D lighting with normal maps, gamepad, audio) wrapped behind a thin `Renderer` interface, so the core never imports it (ADR-1).
- **Tests:** Vitest (unit/property), Playwright (browser smoke/visual), fast-check (property tests).
- **Data:** JSON for entities, a small plain-text dialogue language (`.qdl`) that compiles to JSON, JSON Schema (generated from TS types) for validation.
- **Audio:** WebAudio via the client's audio layer; adaptive stems.

## 3. Core simulation

### 3.1 Tick model [CORE-3, NFR-3]
- Fixed step of 1/30 s. The client interpolates between steps for smooth rendering [CORE-1].
- Game clock: 1 real minute = N in-game minutes (config), starts day 1 at 07:00. Derived values: `timeOfDay`, `dayIndex`, `isCurfew`, `isQuietHours`.
- Update order per tick (documented, tested): commands → player movement → clock/schedules → NPCs → robots perception → alert → rules/district reactions → effects/events flush.
- Pause: the core simply isn't stepped (CORE-4); dialogue is an `ActiveConversation` state that blocks the stepper by rule.

### 3.2 World model [CORE-2, WLD-3]
- **Map:** tile grid (collision, zone id, light, noise-dampening) + object layer (doors, terminals, cameras, nodes, spawns).
- **Zone:** `{ id, district, requiredPermission, schedule?, tags }`. Zones can be changed by rule effects (lockdown raises requirements).
- **District state:** a bag of flags and numbers (`power`, `lockdown`, `curfewStrict`, `patrolSet`) mutated by *effects* and consulted by AI/rules. A `Reaction` data table maps events → district-state changes (`sabotage_power → belt.power=off, patrolSet=blackout`).
- **Entities:** ECS-lite: plain typed records in maps keyed by id (`Player`, `Robot`, `Npc`, `Door`, `Terminal`, `Camera`, `Pickup`) with systems operating over them. Keeps serialization trivial [SAV-2].

### 3.3 Stealth and detection [STE-*, ROB-1]
- **Vision:** cone test (angle + range) then tile raycast for occlusion; lighting modifies effective range (config). Detection accumulates over time in `0..1` (`suspicion`) instead of an instant yes/no: raises readability and fairness.
- **Hearing:** noise events `{pos, radius, source}` emitted by movement, doors, fights, gadgets; robots within radius (path-aware attenuation via tile dampening) investigate.
- **Zone check:** when scanned or seen, the *pass resolver* evaluates `(identity?, zone, time)` → `Allowed | Null | Violation | Expired`. `Null` (no record) maps to `PendingReview`: slow queue / suspicion creep, not instant alarm [STE-3].
- **Demerits:** an `InfractionLedger` with typed entries and decay; thresholds fire `Enforcer` or `Check` events [STE-6].

### 3.4 Alert [ALR-*]
- A state machine `Calm → Suspicious → Hunting → Lockdown` with `lastSeenAt` and a decay timer. Transition triggers are data (`sighting:warden → +1`, `fight → +1`, `terminal_breach → +1`). Decay one step per `alertDecaySeconds` of out-of-sight time [ALR-2].
- Modifiers: bribery, paperwork, records fix lower alert through *effects* [ALR-3].
- Alert emits events consumed by robots (behavior sets), districts (rule changes) and the client (music/UI).

### 3.5 Robots [ROB-*]
- **Behavior trees** (small, data-parameterized) per type with shared leaves: `Patrol`, `Investigate`, `Chase`, `Check`, `ReturnToPost`, `Report`, `Stunned`. Parameters (speed, cone, range, memory seconds) come from content.
- **Types:** Warden (patrol/ID), Sentry (static watch), Checker (zone compliance, short cone), Hound (pursuit, fast, hearing-heavy), Auditor (random contraband/paperwork checks, Quiet Hours bias), Heavy (rare, high threat, immune to some tools).
- **Comms:** `AlertMessage { origin, subject, lastKnownPos, ttl }` propagates to robots within `commRange`, with latency [ROB-2].
- **Memory:** `SeenRecord` list per robot with expiry; broken cameras/doors enqueue `RepairTask`s for maintenance units [ROB-5].
- **Friendly robots** (Pallas, Brindle, Conductor) are `Npc`s with robot appearance and dialogue, outside the hostile behavior trees [ROB-6].

### 3.6 Failure and processing [FAIL-*]
- On capture/knockout: `Processing` scene state: confiscation list computed from inventory (difficulty-driven), player placed in the holding facility, alert set to a setback value, `arrestCount++`.
- Confiscated items go to a **ConfiscationLocker** entity with a recovery side problem (a small puzzle chosen from a pool) [FAIL-3].
- Halloran-7's dialogue is selected by `arrestCount` [FAIL-4]. Notebook and flags are never touched [FAIL-5].

### 3.7 Inventory, augments, economy [AUG-*, ECO-*]
- **Items:** `{id, type, stackable, tags, usage effects}`. **Passes** are items with a `PassSpec` (zones, expiry, uses, origin).
- **Augments:** `{id, slotCost, power, rules}`; the wrist band has `slots` and `powerBudget`; equipping validates both. Effects are *modifiers* on the stealth/dialogue systems queried by tag (`noise.walk *= 0.5`), never special cases in the code.
- **Economy:** `Service` entities (price, requirements, outputs) evaluated by the same condition language as dialogue. Null state failing a requirement yields a specific refusal line [ECO-3]. Loans are a ledger with interest and collector events.

## 4. Conditions and effects (shared language)
Dialogue, services, quests, reactions, and companion gating all use one small **expression language** so authors learn it once.

```
conditions: all/any/not of
  has_clue(id) | clue_state(id, verified|disproved) | flag(id) | flag_eq(id, v)
  has_item(id) | credits_gte(n) | trust(npc) >= trusts | alert >= level
  time_between(a,b) | district_state(d, key, v) | arrest_count >= n | past_stance(x)
effects: list of
  give_clue/remove_clue | set_flag | add_item/remove_item | add_credits
  set_trust(npc, delta) | set_alert/raise_alert | district_event(id)
  start_quest/advance_quest | set_sequel_flag | emit(event)
```
Conditions are pure; effects are applied by one `EffectRunner` that emits events (so every change is observable and testable). Implemented once in `core/rules`.

## 5. Dialogue [DLG-*]
- **Author format `.qdl`** (readable; compiles to JSON graph):
```
npc: wren
node: intro
  wren (tired): "You're awake. Good. Don't touch the radiator."
  > "Where am I?"                      -> where
  > [clue:pump4_shift] "Pump 4's side door..." -> pump4
  > [present] "Take a look at this."   -> present_hub
```
- **Runtime:** a node has speaker, mood, text, choices `{text, if, effects, goto}`, and `onEnter` effects. Present-a-clue opens a picker filtered by the clue's tags; the NPC's reaction table is keyed on `(clueId, reliability)`.
- **Compiler checks** [DLG-5]: unreachable nodes, missing `goto`, dead ends without `end`, unknown IDs, and any option gated on a clue nobody can give.
- **Trust** [CMP-3/4]: stored as `-1|0|+1` per candidate (does not trust / unsure / trusts). `set_trust` clamps and records the *cause* in a log for tests. The UI reads `trustLine(npc)` and prints exactly one line of the three; no numeric UI anywhere.
- **Mentor variants:** one arc file with `{{voice}}` slots; per-mentor files supply line overrides and specialty effects. A test ensures all four have an override for every required beat [CMP-2].

## 6. Clues and notebook [CLU-*]
- **Clue:** `{ id, text, source, reliability, tags[], links[{to, kind: supports|contradicts|updates}], revealedBy?, expires? }`.
- **Player view:** `NotebookEntry { clueId, learnedAt, from, status: unverified|verified|disproved|dulled }`. Reliability is hidden until a verifying event [CLU-5].
- **Verification** happens through effects (`verify_clue`) when a contradiction is resolved or a terminal/NPC confirms it [CLU-4].
- **Derived data:** the **quest log** is a pure function of clues + flags + quest definitions; the **map annotations** come from clue tags (`place:`, `schedule:`, `zone:`) [CLU-2/3].
- **Lull dulling** [CLU-6]: `lullExposure` accumulates in the Lull; past a threshold, the newest N entries get `dulled` (UI greys/blurs; the text shown is a deterministic corrupted variant). Sleeping at the Safehouse clears `dulled`. Memory Anchor makes the accumulator inert. The underlying data is never lost.

## 7. Puzzles and terminals [HAK-*, PUZ-*]
- Each puzzle is a **pure-logic module** with `init(seed, params) → state`, `apply(state, move) → state`, `isSolved(state)`. The client renders it. Types: `powerRouting`, `signalPath`, `scheduleAlign`, `ruleContradiction`.
- **Solvability:** every puzzle ships with a solver; the generator/author data is checked by the solver at build time.
- **Terminals** are entities exposing a menu of commands gated by access conditions (codes, passes, hack puzzle). Content defines what each controls (doors, cameras, schedules).
- **Multi-solution rule** [PUZ-1]: each critical puzzle in `puzzles/` declares `routes: [stealth, social, technical]` with the conditions each requires; the solvability checker (see §10) verifies ≥ 2 routes are *achievable from a fresh start*.
- **Inventory puzzle** [PUZ-2]: Pallas's recipe is a crafting table: parts with locations/clues, a bench, and a registration form; implemented with the same item/clue machinery (no special engine).

## 8. Companions, past, endings [CMP, PST, END]
- **Companion record:** `{ id, role, trust, awakened, gatingFlags, complication }`. A `CompanionGate` function evaluates `canEscapeWith(id, route)` from flags + trust + route requirements.
- **Route requirements:** each route (`sneak`, `hack`, `break`) is a set of conditions; the chosen companion adds more (e.g. Pallas: `registered_as_cargo`; June: `hollow_undiscovered && marrow_consent && child_route_open`).
- **Past stance:** the three moment effects set `past_m1..m3` flags; `past_stance` is derived (embraced / rejected / undiscovered / mixed → treated as the majority, ties go to the last choice).
- **Endings:** the Gate scene runs the selected route as a scripted sequence of conditions and events. The finale reads `chosenCompanion` and selects line sets from content. All sequel flags are collected by `buildSequelFlags(state)` and written to the final save [END-4].
- **Awakening:** every candidate has an awakening event with three delivery variants (in person, message, handed notebook); the chosen variant is picked from state and always fires before the finale for non-escapees [CMP-6].

## 9. Save system [SAV-*]
- Save = `{ version, seed, tick, state, meta }` as JSON. State is plain data (no class instances, no functions).
- **Migrations:** an ordered list `migrate_vN_to_vN+1`, tested with committed fixture saves from every released version.
- **Autosave:** on district transitions and every N minutes at safe moments; **checkpoints** at flagged danger-zone doors. Manual save only in the Safehouse.
- Storage: IndexedDB via the client; the core only produces/consumes the JSON.
- Unknown/corrupt saves are rejected with a typed error and never partially loaded [SAV-3].

## 10. Client [Rendering, UI, input, audio]
- **Rendering:** tilemap + sprite layers, dynamic lights (point/cone) with normal maps for the hi-bit look, rain/steam particles, post-process for neon bloom. An art-quality toggle disables expensive effects (performance, reduced flashing [ACC-2]).
- **Input:** an action layer (`move, sneak, run, interact, notebook, ...`) with rebindable maps for keyboard and gamepad [ACC-1]; the core sees only actions.
- **UI:** DOM overlay for dialogue/notebook/inventory (accessible, scalable text [ACC-3]) over the canvas; consistent logic-puzzle visual language.
- **Audio:** stems (ambient, pulse, percussion) crossfaded by Alert; district beds; PA broadcasts chosen from a weighted pool by `(district, alert, time)` [AUD-*].
- **Debug overlay** [NFR-10]: alert, suspicion per robot, vision cones, flags, clock, "teleport to scenario".

## 11. Content tooling [NFR-5]
- **Validators** (run in CI and pre-commit): schema validity, ID referential integrity (every clue/item/NPC/flag referenced exists; no orphan clues), dialogue graph checks, clue reachability (each clue has ≥ 1 source obtainable), item sinks and sources, one-inventory-puzzle count, all four mentors complete.
- **Solvability checker** (the key tool): an abstract-state graph search over *knowledge, flags, items, zones* (not positions), checking from a fresh start that each route to each ending, with each mentor and each companion, is achievable without combat, and that every critical puzzle has ≥ 2 reachable solutions [PUZ-1, CMP-5, END-1, CMP-4 recoverability].
- **Hot reload** of content in dev.

## 12. Configuration [NFR-8]
`content/config/tuning.json` holds every default from the concept (cones, ranges, noise radii, alert decay, trust steps, Lull thresholds, demerit thresholds, tick/clock ratio, price tables by service). The core reads config via an injected `Config` object so tests can override.

## 13. Performance plan [NFR-1/2]
- Spatial hash for entities; precomputed tile visibility masks for static occluders; robots perception staggered (1/3 of robots per tick); path caching with invalidation on door/zone changes.
- Budget: sim ≤ 4 ms/tick average with 40 robots; render budget tracked in the debug overlay.
- Districts are loaded/unloaded as chunks; only the active district plus a coarse "off-screen" abstraction (schedules advance analytically) runs full AI.

## 14. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Information web becomes inconsistent | Validators + solvability checker from M2 onward; every new clue must register source/reliability. |
| Stealth feels unfair | Gradual suspicion meter, readable cones (Signal Lens), tunable config, early playtests. |
| Dialogue volume exceeds budget | `.qdl` + shared mentor arc; cut list in STORY_EXPANSION §10. |
| Hi-bit lighting cost | Quality toggle, perf budget in CI smoke test, early spike (M0). |
| Combinatorial endings (4 mentors × 4 companions × 3 routes) | Data-driven gating; the checker enumerates combos; closing scene is line-set selection, not 48 scenes. |
| Determinism drift | A replay test in CI; ban `Math.random`/`Date.now` in core via lint. |

## 15. ADRs
- **ADR-1 Renderer: Phaser behind a `Renderer` interface.** *Why:* it ships tilemaps, lights, gamepad, and audio, which the concept needs; the interface keeps the choice reversible. *Alternative:* PixiJS plus a custom lighting pipeline (more control, more work). Revisit after the M0 spike if lighting or perf fails.
- **ADR-2 Fixed-step deterministic core with commands/events.** *Why:* testability, replays, saves, headless solvability checks.
- **ADR-3 One condition/effect language across systems.** *Why:* authors and tests learn one thing; the solvability checker can analyze it.
- **ADR-4 Trust as a hidden 3-state value surfaced as one text line.** *Why:* the concept forbids a meter; three states keep the gating checkable.
- **ADR-5 Custom `.qdl` dialogue format compiled to JSON.** *Why:* author-friendly (concept §10) and lintable. *Alternative:* Ink/Yarn (existing tools, less control over our condition language).
- **ADR-6 Abstract knowledge-graph solvability checking instead of full-world playtest bots.** *Why:* cheap, catches the main risk (unwinnable states), complemented by manual playtests.
- **ADR-7 Fully static, client-only deployment with relative asset paths, deployed by default through a GitHub Actions workflow to GitHub Pages.** *Why:* anyone can host the game anywhere (any static host, any subfolder, a zip on a file-sharing site) with no backend, and a fork can publish itself with two settings changes. Players keep their own saves. *Consequence:* no cloud saves, accounts, or server telemetry in v1; no custom response headers on Pages; storage keys must be namespaced because Pages origins are shared per account.

## 16. Build and deploy
Audience: the maintainer, and **anyone who wants to build or host their own copy**. The game is a static website: a folder of files that any web server can serve. There is no backend, database, or account system, and the game never needs to contact a server after it has loaded. *(The commands below are the target workflow; they become real in task T0.1 and are verified by T5.8.)*

### 16.1 How it works
- `pnpm build` compiles TypeScript, bundles the code with Vite, validates the content, and writes everything to `dist/`.
- `dist/` contains `index.html`, hashed JS/CSS bundles, the art/audio/content files, and a service worker for offline play. That folder **is** the game.
- The game runs entirely in the player's browser. Game state lives in memory while playing; saves go to the browser's IndexedDB (SAV-1).
- Phaser is bundled into the JS, and TypeScript is compiled away at build time. Neither Node.js nor TypeScript is needed by players or by the web server.

### 16.2 Default: GitHub Actions builds and deploys to GitHub Pages
This is the primary, supported way to publish the game. The repository ships a workflow at `.github/workflows/deploy.yml`. Every push to `main` is validated, built, and published to GitHub Pages with no manual steps, and the workflow uses no secrets or tokens beyond the built-in ones.

**One-time setup (maintainer or anyone who forks the repo):**
1. Fork or clone the repo into your own GitHub account or organization.
2. In the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. If this is a fork, open the **Actions** tab and enable workflows (GitHub disables them on new forks).
4. Push to `main` (or run the workflow manually from the Actions tab). When it finishes, the game is live at `https://<your-user-or-org>.github.io/<repo-name>/`.

Optional: add a custom domain under **Settings → Pages**. HTTPS is provided automatically. Pages availability for private repositories depends on your GitHub plan.

**The workflow** (target form; finalized in T0.1/T5.8, and action versions are checked for newer major releases when it is written):
```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      QH_DEBUG: "0"
      QH_BUILD_ID: ${{ github.sha }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm validate          # content validators + solvability (fast mode)
      - run: pnpm test
      - run: pnpm build
      - run: pnpm check:no-debug    # fails if the debug overlay is in dist/
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```
- A deploy happens only if lint, content validation, tests, and the build all pass, so a broken or unwinnable content change never reaches players.
- A separate `ci.yml` runs the same steps plus the Playwright smoke tests on every pull request **without** deploying.
- A third workflow, `release.yml`, runs when a version tag is pushed. It builds and attaches `quiet-hours-<version>.zip` (the contents of `dist/`) and a SHA-256 checksum to a GitHub Release, for people who want to self-host elsewhere (§16.5).
- The build uses **relative asset paths** (`base: './'` in the Vite config), so it works under the `/<repo-name>/` subpath that Pages uses, and also under a custom domain at the root, without changing any setting.

**Pages-specific notes**
- **Saves share an origin per account.** All project sites under `<user>.github.io` share one browser origin, so IndexedDB and localStorage are shared with any other game or site on that account. All of our storage keys and database names are prefixed `quiet-hours:` to avoid collisions. A custom domain gives the game its own origin.
- **Renaming the repo or adding a custom domain changes the origin**, which orphans existing players' saves (§16.6). Decide on the final URL before the first public release.
- Pages sets sensible default MIME types and compression. It does not let you set custom headers, so the game relies on hashed filenames for caching and on the service worker's own update check for `index.html` (see §16.4, which matters for self-hosters).

### 16.3 Build from source (local development, or hosting elsewhere)
Prerequisites: a current Node.js LTS release and pnpm. Check `package.json` `engines` and `.nvmrc` for the exact versions we support.

```bash
git clone <repo-url> quiet-hours && cd quiet-hours
pnpm install --frozen-lockfile
pnpm validate        # content validators + solvability checker (fast mode)
pnpm test            # unit, property, scenario tests
pnpm build           # produces ./dist
pnpm preview         # serves ./dist locally, to check before uploading
```
For development, `pnpm dev` starts Vite's dev server with hot reload and the debug overlay. **Do not test by double-clicking `index.html`.** Browsers block modules, IndexedDB, and service workers on `file://` pages. Always use `pnpm dev` or `pnpm preview` (or any local web server pointing at `dist/`).

Build options (environment variables read at build time):
| Variable | Default | Purpose |
|---|---|---|
| `QH_BASE` | `./` | URL base path. Leave the default unless you have a reason. |
| `QH_DEBUG` | `0` | `1` includes the debug overlay and scenario teleport. Never ship with it on. |
| `QH_BUILD_ID` | git short hash | Shown in the settings screen and in exported saves for bug reports. |
| `QH_CONFIG` | `content/config/tuning.json` | Alternative tuning file (for difficulty or event builds). |

### 16.4 Server requirements
The server only has to serve files. Minimum requirements:
- **HTTPS** (or `localhost`). Service workers (offline play) and persistent storage require a secure context.
- **Correct MIME types** for `.js` (`text/javascript`), `.json`, `.wasm` if used, `.mp3/.ogg`, `.png`, `.webmanifest`. Almost every host does this by default. A wrong `.js` type is the most common cause of a blank page.
- **No server-side routing** is needed. The game is a single page and uses no URL routes. If your host insists on a fallback rule, point it at `index.html`.
- **Compression** (gzip or brotli) for text files is strongly recommended. Audio and PNGs are already compressed.
- **Cache headers** (recommended):
  - Hashed files under `assets/`: `Cache-Control: public, max-age=31536000, immutable`.
  - `index.html`, `sw.js`, and `manifest.webmanifest`: `Cache-Control: no-cache`, so players get updates promptly.

Example nginx snippet:
```nginx
server {
  listen 443 ssl;
  server_name games.example.com;
  root /var/www/quiet-hours;      # the contents of dist/
  index index.html;
  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;
  location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
  location = /index.html { add_header Cache-Control "no-cache"; }
  location = /sw.js      { add_header Cache-Control "no-cache"; }
}
```

### 16.5 Alternatives to GitHub Pages (all work; pick whatever you already use)
GitHub Pages via the workflow in §16.2 is the default. To host somewhere else, either build from source (§16.3) or download the prebuilt `quiet-hours-<version>.zip` from the project's GitHub Releases, unzip it, and upload the contents to any static host, in the web root or in any subfolder. No tools are needed for the zip route.
- **Other static hosting platforms:** GitLab Pages, Netlify, Cloudflare Pages, Vercel (static), S3 + CloudFront, or any shared web host: upload the contents of `dist/`.
- **Your own server:** nginx, Apache, Caddy, or `python -m http.server` for a quick private LAN test (no HTTPS, so offline mode will not activate).
- **Game-sharing sites** that accept an HTML5 zip (e.g. itch.io): zip the contents of `dist/` with `index.html` at the zip root.
- **Subfolder hosting** works with the default build. If a platform serves the site under a path (for example `https://user.github.io/quiet-hours/`), no setting change is required.

### 16.6 Saves, updates, and moving hosts
- **Saves are per browser *and* per web origin** (scheme + domain + port). Players do not carry saves between browsers, devices, or domains. Moving the game to a new domain **starts everyone with empty saves**, so choose a stable URL.
- The game offers **Export save** / **Import save** (a JSON file) in the settings and pause menus, plus a one-time prompt asking the browser to keep storage persistent. Hosters should tell players about export before any domain move.
- **Updates are safe:** saves carry a version, and each release ships migrations for all earlier versions (SAV-1, tested with fixture saves). Hosters update by replacing the contents of `dist/` with the new release. The service worker picks up the new version on the next load and shows an "update ready" notice instead of swapping mid-session.
- **Rolling back** to an older release can fail to load newer saves; the game rejects them safely with a message (SAV-3) rather than corrupting them.

### 16.7 Troubleshooting for hosters
| Symptom | Likely cause |
|---|---|
| Blank page, console error about a module or MIME type | Wrong `Content-Type` for `.js`, or opened via `file://`. |
| 404s for assets when hosted in a subfolder | Custom build with an absolute `QH_BASE`; rebuild with the default. |
| No sound until clicking | Normal. Browsers require a user gesture before audio starts. |
| "Offline mode unavailable" notice | Site is not HTTPS or the service worker is blocked. The game still works online. |
| Players report lost saves | Domain changed, site data cleared, or private browsing. Point them to Export/Import. |
| Old version still showing after an update | Host is caching `index.html` or `sw.js`; apply the headers in §16.4. |

### 16.8 Continuous integration and releases
- **Workflows** (all in `.github/workflows/`): `ci.yml` (every PR: install, lint, `pnpm validate`, `pnpm test`, `pnpm build`, Playwright smoke against `pnpm preview`; no deploy), `deploy.yml` (push to `main`: the same gates, then publish to Pages, §16.2), `release.yml` (version tag: build, zip, checksum, attach to a GitHub Release), and a scheduled `nightly.yml` (full-mode solvability, visual regression, performance; TESTING §2).
- Everything is built with `QH_DEBUG=0`, and `pnpm check:no-debug` fails the job if the debug overlay is present in the bundle.
- Deploys are serialized by the `pages` concurrency group, so two quick pushes cannot publish out of order.
- **Rollback:** re-run the deploy workflow on an earlier commit from the Actions tab. Note the save-compatibility caveat in §16.6.

### 16.9 Licensing for hosters
The game's code, art, audio, and text are all original to this project (NFR-7). The license for source code and for assets (which may differ) is to be decided before the first public release (task T5.8) and will be stated in `LICENSE` and in the release archive. Until then, do not redistribute builds.
