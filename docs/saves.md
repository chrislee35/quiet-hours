# Saves

## The file
```json
{ "format": "quiet-hours-save", "version": 1, "seed": 7, "tick": 1234, "map": "stacks_slice",
  "state": { ... }, "meta": { "build": "a1b2c3d", "label": "Day 1 07:42, stacks_street", "savedAt": "2026-..." } }
```
`state` is the whole simulation state as plain JSON (the RNG state, every robot, every timer). Loading it and stepping gives exactly what the original would have done (tested tick for tick). The game never writes NaN or Infinity; it refuses to save rather than store them.

## Rejecting bad saves (SAV-3)
`loadSave` parses, migrates and validates the whole file before anything changes, and throws a `SaveError` with a code, so the running game is never touched by a bad load:
| Code | Meaning |
|---|---|
| `corrupt` | not JSON, truncated, or missing its basics |
| `unknown_format` | JSON, but not a Quiet Hours save |
| `too_new` | made by a newer version of the game (after a rollback); never guessed at |
| `wrong_map` | a save for a different map |
| `invalid_state` | the state does not match this version's shape (missing or extra fields, wrong types, robots that are not on this map) |

## Versions and migrations (SAV-1)
`SAVE_VERSION` is the format. When the state's shape changes in a way that would reject old saves, bump it and add `MIGRATIONS[n]` in `packages/core/src/save.ts`, a function that turns a version-n save into version n+1 (fill the new fields). Loading runs the chain in order.
- **Fixtures:** `packages/sim-harness/test/fixtures/save-vN.json` is a committed save from each released version; its test must keep loading it. Because loading checks the state's shape, changing the state without a migration fails this test. *Before the first public release* nothing needs migrating, so just regenerate the fixture: `UPDATE_FIXTURES=1 pnpm test`. After release, never regenerate: add a migration instead.

## When you can save
- **Manual** (menu): in a `safe` zone (a zone with the Tiled property `safe`: the Safehouse) always; elsewhere only when the city is calm (alert 0, nothing sees you). `save.requireSafeZone` in the tuning file turns on "Safehouse only". Never while being processed.
- **Autosave** (slot `autosave`): at most every 60 s (`save.autosaveSeconds`), and soon after a new zone, clue, pickup, augment or release, never mid-danger, never more often than every 10 s.
- Slots: autosave plus three of your own, kept per map in this browser under `quiet-hours:save:<map>:<slot>`.

## Moving saves
**Export** downloads the current game as a `.json` file; **Import** loads one (it must be for the same map). The menu can also ask the browser to keep storage persistent. Saves are per browser and per site address: see DESIGN §16.6 before moving the game to a new domain.

## Using it
Esc (or Back on touch, or B on a pad) opens the menu when nothing else is open; it pauses the game. If an autosave exists the menu opens at start and offers to load it; closing it plays a new game.
