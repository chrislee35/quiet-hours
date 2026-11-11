# The notebook

Everything the notebook screen shows is a pure function of the game state and content (`packages/core/src/notebook.ts`), tested without a screen. Press **N**: it pauses the game while open.

## Clues (CLU-2)
- **Search** across a clue's text, source, id and tags (every word must match somewhere); **filter** by status (unverified / verified / disproved) and by tag kind (`place`, `schedule`, `zone`, `person`).
- **Links.** Content can link clues (`supports`, `contradicts`, `updates`); the notebook shows a link only when the player knows both ends. The player can also make their own cross-references: **Link to another clue…**, then **Link to this one** on the second; **Unlink** removes it. These live in `state.notebook.links` as sorted id pairs, and take no game time (`LinkClues`/`UnlinkClues` commands, accepted even while a conversation is open).
- **Conflicts (CLU-4).** Two known clues joined by a `contradicts` link are flagged as disagreeing, and settled when either is verified or disproved (the `verify_clue` / `disprove_clue` effects, from a conversation or terminal). **The notebook never says which one is right (CLU-5):** reliability appears in no view, and a test checks that.

## Quests
Definitions in `content/quests/*.json`: `{id, title, summary, start, steps: [{id, text, done}], complete, failed?}`, where every list is conditions in the shared language. The log is **derived**, not stored: a quest shows once its `start` holds; steps tick from flags and clues; it is complete or failed from `complete` / `failed`. Active quests sort first. `pnpm validate` checks the conditions and that any clue they mention exists.

## Map (CLU-3)
`annotatedMap` draws what the player has learned:
- **Places:** a map object of class `place` (Name = id, `label` property); it appears when the player knows a clue tagged `place:<id>`, with those clues' texts, schedules included.
- **People:** appear once spoken to (`state.met`) or learned about (`person:<npc>` tag), where they are now.
- **Zones:** appear once visited (`state.visited`) or learned (`zone:<id>` tag), tinted by how restricted they are.
- **Schedules** (`schedule:<id>` tags) attach to their place; ones with no place on this map are listed beside it.
Shapes carry meaning (diamond = place, circle = person, triangle = you) and every pin is labelled; a text list below the drawing says the same.

## Typing and the game
Typing in the search box never walks the character or triggers actions (the input controller ignores key presses going into a text field, except Escape).

## Not yet
Dulling by the Lull (CLU-6) and hints (CLU-7) come with their milestones. Clue content (CLU-8, about 60-80 clues) is the M3 information pass.
