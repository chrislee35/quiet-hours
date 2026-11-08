# Authoring maps in Tiled

Maps are authored in [Tiled](https://www.mapeditor.org/), exported as JSON into `content/maps/<map_id>.json`, and checked by `pnpm validate`. The file name (without `.json`) is the map id. The importer is `packages/core/src/tiled.ts`; geometry rules are in `packages/core/src/world.ts`.

Settings: orthogonal, **fixed-size** (not infinite), 32x32 pixel tiles. Positions are pixels; the importer divides by the tile size.

| Layer (exact name) | Type | Contents |
|---|---|---|
| `collision` | Tile layer | Any non-zero tile is a wall. Everything else is floor. |
| `zones` | Object layer | Rectangles with custom properties `zone` (string id, required) and `permission` (int, default 0: the pass level needed to be there legitimately). Later rectangles overwrite earlier ones, so paint a large public zone first and restricted rooms on top. The same `zone` id may appear many times but must always have the same `permission`. |
| `objects` | Object layer | Points (or rectangles; the top-left tile is used) whose **Class** is `door` or `spawn` and whose **Name** is the unique id. |

Objects:
- `spawn`: stands at the centre of its tile. The player starts at the spawn named `start`; after being caught they wake at the spawn named `holding` (if there is none they stay where they are).
- `npc`: a person to talk to. Name is the npc id (it must exist in `content/npcs`); string property `dialogue` is the conversation id (`content/dialogue/<id>.qdl`, see `docs/dialogue.md`). E starts the conversation.
- `terminal`: Name is a terminal id defined in `content/terminals/*.json` (see below). E opens it.
- `locker`: where items and credits confiscated by processing are recovered; the player presses Interact (E) next to it. A map should place its locker somewhere the player must sneak back to.
- `door`: must be on a floor tile. Bool properties `open` (default false) and `locked` (default false). A closed door blocks movement; the player opens it with the Interact key (E). Locked doors refuse until a later system (passes, terminals) unlocks them.

- `robot`: Name is the robot id. Properties: `kind` (string, default `warden`; one of `warden`, `sentry`, `checker`, `hound`, `auditor`, `heavy`, `mender`: see `docs/robots.md`), `facing` (number, **degrees**, 0 = east, 90 = south, default 0), and optional `route` (string). A robot without a route stands guard.
- `camera`: a fixed camera. Name is its id; number property `facing` is in degrees (0 = east, 90 = south). It sees from its tile's centre and may sit in a wall tile.
- `waypoint`: a patrol route point. Properties: `route` (string, required) and `order` (int; points are visited in ascending order, then looped). Waypoints snap to tile centres; every route needs at least two, all on floor tiles. Waypoints need no name.

Validation (`pnpm validate`) reports: unsupported orientation or infinite maps, a missing `collision` layer, zones without an id, conflicting zone permissions, objects without a name or with an unknown class, doors inside walls or overlapping, duplicate ids, spawns and lockers inside walls or out of bounds, robots inside walls or using an unknown kind or route, and routes with fewer than two waypoints.

The sample map `content/maps/stacks_slice.json` shows every feature. Map data lives in the core as `MapData` (plain JSON); the importer is the only code that knows about Tiled, so another editor could be supported by writing a different importer.

## Terminals and puzzles

A terminal is placed on the map by name, and defined in `content/terminals/*.json`:

```json
{ "id": "maint_panel", "title": "Maintenance door controller", "puzzle": "maint_power",
  "bypass": [],
  "onSolve": [{ "unlock_door": "door_maint_locked" }, { "set_flag": ["maint_panel_hacked", true] }],
  "solvedText": "Relay restored. The maintenance door unlocks." }
```
- `puzzle`: a puzzle id from `content/puzzles/*.json`.
- `bypass`: conditions in the shared rules language (see DESIGN §4). If they all hold when the terminal is opened, access is granted without the puzzle (a second route in, e.g. `[{ "has_item": "maint_keycard" }]`). Critical terminals should have one.
- `onSolve`: effects run once on access (`unlock_door`, `give_clue`, `set_flag`, ...).

A puzzle is a grid of pipe pieces (`I` straight, `L` corner, `T` tee, `+` cross, `E` dead end, `.` empty) with starting rotations 0-3 (clockwise quarter turns), one `source` cell and one or more `targets`. Rotate pieces until power flows from the source to every target. `pnpm validate` runs a solver on every puzzle and fails the build if one is unsolvable, already solved at the start, or too large to prove.
