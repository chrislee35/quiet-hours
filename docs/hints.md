# Hints and two ways through (T3.16, CLU-7, PUZ-1, PUZ-3)

## Hints
An optional **Hints** setting (Settings → Assists area: *Off*, *A nudge*, *Direct*) adds a Hints page to the notebook. It is a player setting, like text size: never in a save, off by default.
- **A nudge** says which way to look. **Direct** says what to do.
- A hint appears only while it is **relevant** (`when` holds: the player has heard enough to need it, so nothing is spoiled early) and **unfinished** (`done` does not all hold). The page tells the player when there is nothing to hint at.
- Hints are content: `content/hints/hints.json`, `{ id, topic, for, when, done, nudge, direct }`. `for` says what it is about: `terminal:<id>`, `route:sneak|hack|break`, `act1`, `mentor`, `companion`, `past`.
- **Every critical puzzle, each Gate route and each stage of the main path must have a hint**; `pnpm validate` fails otherwise, as it does if a nudge and a direct hint are identical or a condition names a clue that does not exist.
- Hints never say whether a clue is true: they point at where to look, and the notebook's own cross-checking stays the player's job.

## Two ways through (PUZ-1)
Every critical puzzle must have at least two ways through: its puzzle, an override, or another source of the same result. `pnpm solvable` now prints `critical puzzles: N, N with at least two ways through` and fails if any has fewer. The five are Locker 9 (the dials or the key), the Safehouse wall (the fuses or being told the way), the maintenance panel and Node 4 (the power puzzle or an override or a favour), and the Gate controller (the two code halves or answering as its builder). The Gate itself has three routes, each proven reachable from a fresh start, also without embracing the past.

Where a map's search is cut short (the Stacks, Belt and Civic Core), a way not seen by the search is checked again from the cross-map closure, which is exact about items, clues and flags: this fixed a false "Locker 9 has one way" warning.

## Nothing left to chance (PUZ-3)
All puzzles are deterministic: every critical puzzle has a solution the solver finds, and none depends on a random roll. What a player has to learn is always in the notebook, learnable from two sources (validator rule for critical clues), and the Hints page says where to look.
