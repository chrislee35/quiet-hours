# Quiet Hours

Top-down stealth-adventure for the browser (TypeScript + Phaser). Design docs:
[GAME_CONCEPT](GAME_CONCEPT.md) · [STORY_EXPANSION](STORY_EXPANSION.md) · [REQUIREMENTS](REQUIREMENTS.md) ·
[DESIGN](DESIGN.md) · [TASKS](TASKS.md) · [TESTING](TESTING.md)

## Quick start
Requires Node 24+ and pnpm (`corepack enable` provides the pinned version).

```bash
pnpm install
pnpm dev          # dev server with hot reload
pnpm check        # lint (typecheck + core purity), content validation, tests
pnpm build        # static site in packages/client/dist
pnpm preview      # serve the built site locally
```
Do not open `index.html` from disk; browsers block modules on `file://`.

## Layout
| Path | What |
|---|---|
| `packages/core` | Deterministic game simulation. No DOM, no rendering, no `Math.random`/`Date.now`. |
| `packages/client` | Vite + Phaser app: renderer, input, UI. Sends commands to the core, renders its state. |
| `packages/sim-harness` | Headless scenario DSL and replay recorder/runner for tests. |
| `packages/content-tools` | Content loader/validators (`pnpm validate`). |
| `content/` | Data files: `config/tuning.json` (all tunable numbers), `clues/`, `npcs/`, ... |
| `scripts/` | Repo checks (core purity, no debug code in builds). |

## Hosting
Pushes to `main` deploy to GitHub Pages via `.github/workflows/deploy.yml`.
To host your own copy: fork, set **Settings → Pages → Source = GitHub Actions**, enable Actions, push.
See DESIGN.md §16 for other hosts.

Build variables: `QH_BASE` (default `./`), `QH_DEBUG` (`1` adds the debug overlay; never deploy it), `QH_BUILD_ID`.
