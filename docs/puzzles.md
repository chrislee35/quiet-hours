# Puzzles and terminals

A terminal (`content/terminals/*.json`) gates information or controls behind a puzzle (`content/puzzles/*.json`). The world is frozen while one is open. Solving the puzzle, or already meeting the terminal's `bypass` conditions, runs its `onSolve` effects exactly once. There is **no confirm button**: the terminal unlocks itself the moment the puzzle is solved. No puzzle involves chance or timing (PUZ-3).

All four types share one interface (`packages/core/src/puzzles/index.ts`): `init`, `tap` (what tapping control *i* does), `isSolved`, `solve` (the fewest taps that solve it) and `view`. The state is a vector of whole numbers the type understands, so saves, replay and the client treat them alike. The command is `TerminalTap {index}`.

| Kind | You see | Tap does | Solved when |
|---|---|---|---|
| `power_routing` | a grid of pipes, a bolt, rings | turn a piece a quarter turn | power reaches every ring |
| `signal_path` | a grid with walls, mirrors, hazards (✕), beam sources (arrows), rings | flip a flippable mirror | every ring is lit and no beam touches a hazard |
| `schedule_align` | tracks (trains, shifts) repeating over the same cycle | slide a track one slot later (wraps) | no two tracks share a slot (if `exclusive`) and every ★ requirement is met |
| `rule_contradiction` | input switches, MERIDIAN's rules, its decisions | flip an input | two rules that apply at once demand opposite things of the goal output |

Visual language: bright cyan = live/lit, dim = not; rings are targets; every control is a real button with an accessible label that states its state, so colour is never the only signal.

## Authoring
Each file holds an array of puzzles; every puzzle has `id` and `kind`. Fields per kind are validated by that kind's own validator in core (the same code the game runs).
- **signal_path:** `width`, `height`, `cells` (rows of `#` wall, `.` empty, `X` hazard, `/` `\` flippable mirrors with their starting shape, `P` `Q` fixed `/` `\`), `sources: [{x, y, dir: N|E|S|W}]` (on empty cells), `targets: [[x, y]]`.
- **schedule_align:** `slots` (2-24), optional `labels`, `exclusive`, `tracks: [{id, name, pattern: "#..", shift?, locked?}]`, optional `require: [{track, slot}]`.
- **rule_contradiction:** `inputs: [{id, name, value?, locked?}]` (locked = fixed by the world), `outputs: [{id, name}]`, `rules: [{id, text, if: {input: bool}, then: {output: bool}}]`, optional `goal` (the output to contradict).

## What `pnpm validate` proves
For every puzzle of every kind: it is well formed, it does **not** start solved, and the solver **finds a solution** (or it is rejected as unsolvable / too large to prove). Terminals must name a real puzzle; their effects are checked like any others.

## Shipped examples
`content/puzzles/range_puzzles.json` has one of each new kind (a relay needing four flips, a night timetable around a fixed express, a gate policy that contradicts itself during curfew); the three terminals sit along the top of the first room on `?map=range`. The slice's `maint_power` is the power-routing one.

Skip-after-attempts assist (HAK-3) arrives with the settings work (T2.13). Every critical puzzle also needs a second, non-puzzle way in (PUZ-1): that is what a terminal's `bypass` is for, checked by the solvability checker (T2.15).
