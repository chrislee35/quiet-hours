# Authoring maps in Tiled

Maps are authored in [Tiled](https://www.mapeditor.org/), exported as JSON into `content/maps/<map_id>.json`, and checked by `pnpm validate`. The file name (without `.json`) is the map id. The importer is `packages/core/src/tiled.ts`; geometry rules are in `packages/core/src/world.ts`.

Settings: orthogonal, **fixed-size** (not infinite), 32x32 pixel tiles. Positions are pixels; the importer divides by the tile size.

| Layer (exact name) | Type | Contents |
|---|---|---|
| `collision` | Tile layer | Any non-zero tile is a wall. Everything else is floor. |
| `zones` | Object layer | Rectangles with custom properties `zone` (string id, required) and `permission` (int, default 0: the pass level needed to be there legitimately). Later rectangles overwrite earlier ones, so paint a large public zone first and restricted rooms on top. The same `zone` id may appear many times but must always have the same `permission`. |
| `objects` | Object layer | Points (or rectangles; the top-left tile is used) whose **Class** is `door` or `spawn` and whose **Name** is the unique id. |

Objects:
- `spawn`: stands at the centre of its tile. The player starts at the spawn named `start`.
- `door`: must be on a floor tile. Bool properties `open` (default false) and `locked` (default false). A closed door blocks movement; the player opens it with the Interact key (E). Locked doors refuse until a later system (passes, terminals) unlocks them.

Validation (`pnpm validate`) reports: unsupported orientation or infinite maps, a missing `collision` layer, zones without an id, conflicting zone permissions, objects without a name or with an unknown class, doors inside walls or overlapping, duplicate ids, and spawns inside walls or out of bounds.

The sample map `content/maps/stacks_slice.json` shows every feature. Map data lives in the core as `MapData` (plain JSON); the importer is the only code that knows about Tiled, so another editor could be supported by writing a different importer.
