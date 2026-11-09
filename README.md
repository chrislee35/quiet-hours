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

## Controls
| Action | Keyboard | Gamepad |
|---|---|---|
| Move | WASD / arrows | left stick or d-pad |
| Run / Sneak | Shift / Ctrl or C | right bumper or trigger / left bumper or trigger |
| Use, talk, hack | E | A |
| Back / leave | Esc | B |
| Notebook | N | Y |
| Wrist band and belongings | G | Start |
| Fire Burst Jammer | F | X |
| Use the ready tool | Q | right stick click |
| Zone overlay | Z | Back |

**Touch screens (for playtesters).** On a touch device the game shows on-screen controls: a thumb stick (left) to move, a big **Use** button, **Run** and **Sneak** toggles (tap to turn on, tap again to turn off; they are exclusive), **Notes** for the notebook, **Gear** for the wrist band, **Pulse** for the Burst Jammer and **Back** to close windows. You can steer and tap at the same time. Use landscape orientation. Dialogue options and the terminal puzzle are tapped directly. Append `?touch=1` to the URL to force the controls on (for example to try them with a mouse) or `?touch=0` to hide them.

In dialogue and terminal windows the d-pad or arrow keys move between options, and A (or Enter) selects. Number keys 1-9 pick dialogue choices. Key bindings are stored per browser; the settings screen for rebinding arrives with T2.13.

**Test maps.** Append `?map=range` to open the robot test range: one of every robot type, plus a bench of all six augments in the first room to try on.

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
