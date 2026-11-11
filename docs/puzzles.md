# Puzzles and terminals

A terminal (`content/terminals/*.json`) gates information or controls behind a puzzle (`content/puzzles/*.json`). The world is frozen while one is open. Solving the puzzle, or already meeting the terminal's `bypass` conditions, runs its `onSolve` effects exactly once. There is **no confirm button**: the terminal unlocks itself the moment the puzzle is solved. No puzzle involves chance or timing (PUZ-3).

All fourteen types share one interface (`packages/core/src/puzzles/index.ts`): `init`, `tap` (what tapping control *i* does), `isSolved`, `solve` (the fewest taps that solve it) and `view`. The state is a vector of whole numbers the type understands, so saves, replay and the client treat them alike. The command is `TerminalTap {index}`.

| Kind | You see | Tap does | Solved when |
|---|---|---|---|
| `power_routing` | a grid of pipes, a bolt, rings | turn a piece a quarter turn | power reaches every ring |
| `signal_path` | a grid with walls, mirrors, hazards (✕), beam sources (arrows), rings | flip a flippable mirror | every ring is lit and no beam touches a hazard |
| `schedule_align` | tracks (trains, shifts) repeating over the same cycle | slide a track one slot later (wraps) | no two tracks share a slot (if `exclusive`) and every ★ requirement is met |
| `rule_contradiction` | input switches, MERIDIAN's rules, its decisions | flip an input | two rules that apply at once demand opposite things of the goal output |
| `code_lock` | a row of dials, and a hint line | turn a dial up one (wraps) | the dials match the secret code |
| `lights_out` | a fuse board (● lit, ○ dark) | flip that fuse and its four neighbours | every fuse is dark |
| `logic_circuit` | switches, a list of gates, and lamps that must be on or off | flip a switch | every lamp shows what it needs |

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

## The three "different" ones
- **Code lock** is an *information* puzzle: the lock never helps, so the code has to come from the world (a clue, a note, something said). Set `feedback: "count"` to show how many dials are right, for low-stakes locks only. `hint` is a line of text on the lock. A terminal's `bypass` (a held clue or item) is the second way in.
- **Fuse board** is the classic: tapping flips a fuse and its orthogonal neighbours. Its solver is exact (linear algebra over GF(2)), so an unsolvable board is caught at build time. Build a solvable one by tapping an all-dark board and writing down what is lit. `layout` rows use `#` lit, `o` dark, `.` no fuse; at most 7x7.
- **Logic circuit** is drawn as a diagram: switches on the left, gates in columns by depth, lamps on the right, wires between them (`layout()` in core computes it, so it is tested headlessly). A wire carrying ON is thick and solid, one carrying off is thin and dashed, and every box also says its state in words; clicking a switch flips it. `inputs` (switches, with `value`/`locked`), `gates` listed in order (`AND OR NOT XOR NAND NOR`, each reading switches or *earlier* gates, so no loops), `goals: [{name, node, want}]`. Up to 12 switches.
`content/puzzles/range_puzzles2.json` has one of each, with three more terminals in the first room of `?map=range`.

## The "nerd" set: ciphers, mathematics, chemistry, language, music, machine learning
These share one generic **board** view (rows of buttons, lines of text, an optional plot), so each is pure logic plus a solver. Every one has a solver that `pnpm validate` runs; where deduction is the point the validator also proves the answer is **unique**, so it can be worked out and never guessed (PUZ-3).

| Kind | The puzzle | Tools it gives you | What validate proves |
|---|---|---|---|
| `cipher` | decode a Caesar or Vigenère message by turning key dials | live decoding, a letter-frequency table, a crib hint | key exists; message long enough to be solvable |
| `magic_square` | fill 1-9 so every row, column and diagonal sums to 15 | per-line sums | **exactly one** solution |
| `arithmetic` | choose operators between numbers to hit a target (exact fractions, real precedence) | a live total | a solution exists and it does not start solved |
| `chem_balance` | balance a chemical equation in the smallest whole numbers (parentheses allowed) | an atom-count table per element | both sides have the same elements; a solution exists |
| `translation` | translate a sentence in an unknown language from example sentences glossed as unordered bags of words | the examples | exactly **one** consistent dictionary, and the answer is among the choices |
| `melody` | complete a tune that obeys rules of key, leaps, shape and ending | each rule checked in words, a Play button, tones on tap | a legal tune exists |
| `neural_net` | size two hidden layers within a neuron budget so a tiny network, trained on noisy readings, scores above a threshold on clean held-out ones | train/test accuracy, a map of its decisions | some size within budget passes |

**The neural network** is trained *inside the puzzle*, deterministically: a leaky-ReLU network with seeded initial weights, plain full-batch gradient descent, and nothing but exact arithmetic (+ - x /, comparisons, a square root of a constant), no `exp` or `tanh`, so every browser produces bit-identical numbers and the sim stays deterministic. Results are cached by sizes. The first lesson it teaches: more neurons is not automatically better (budget), and a layer of one neuron is a bottleneck. Tune with `budget`, `threshold`, `noise` and the three seeds; `neuralNet.passing(def)` lists every passing size.

**Sound** (melody): notes are synthesised in the browser with WebAudio on a player gesture and are never required; the rules are always shown as text.

### Authoring notes
- **cipher:** `method`, `plaintext`, `key` (one letter for Caesar, 2-6 for Vigenère), optional `hint` (a crib). The ciphertext is derived, so it cannot disagree.
- **translation:** each example `{foreign: [...], english: [...]}` (the English is a bag); to pin a word down, make sure it appears in sentences whose other words are known. The validator tells you if more than one dictionary fits.
- **chem_balance:** `reactants`, `products` as formula strings (`Ca(OH)2`).
- **melody:** `root` (MIDI, 60 = middle C), `scale` (major/minor), `length` 3-6, `fixed` (`{"0": 0}`), `rules` (`inScale`, `endOnTonic`, `maxLeap`, `arch`, `noRepeats`).
`content/puzzles/nerd_puzzles.json` has one or two of each, and nine terminals along the south wall of the first room on `?map=range`.

### More realms to come
The same interface fits: a **frequency/logic deduction grid**, **unit-conversion** and **circuit** puzzles, **chord and interval** identification, **morphology** (agreement and tense rules), **number-base and modular** locks, a **k-means or decision-tree** "sort the readings" puzzle for machine learning, and **titration/stoichiometry** for chemistry.

Skip-after-attempts assist (HAK-3) arrives with the settings work (T2.13). Every critical puzzle also needs a second, non-puzzle way in (PUZ-1): that is what a terminal's `bypass` is for, checked by the solvability checker (T2.15).
