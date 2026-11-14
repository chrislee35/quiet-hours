# The solvability checker

`pnpm solvable` (part of `pnpm check`, and a CI step) answers the question that matters most for a game built from information: **can the player always get through, and can they never get stuck?** It does this by *playing the content*, not the game: no bots, no pathfinding, no stealth.

## What it explores
An abstract state is what the rules can see: knowledge (clues and their status), flags, items, credits, passes, augments, loans, district values, trust, which terminals are solved, which doors are unlocked, the current conversation node, and (only if the content uses times of day) a time phase. Positions become one question: *can the player get to this person, terminal or pickup, given which doors are still locked?* (a flood fill from the start; locked doors block it).

From the start state (`content/start.json`: the credits and items a new game gives you) it explores **every order of everything a player can do**: talk to anyone reachable and take any conversation path (every choice, showing any known clue, leaving), open or solve any reachable terminal (by bypass or by its puzzle, which must be provably solvable), pick up anything reachable, and wait for evening or Quiet Hours. It runs the game's own `chooseOption`, `applyEffects`, condition evaluators and terminal code, so content cannot mean one thing to the game and another to the checker. It never fights, so any route it finds needs no combat.

Credits are tracked as "the most the player could have here" (capped at the most that could ever matter) and item counts are capped likewise, so loops like borrow-repay-borrow or "take another key" do not grow the search. That makes "never reachable" answers *proof*; a soft lock caused purely by running out of money can be missed (a limit of v1).

## Keeping the search small (T3.2)
The Stacks is the first map whose full state space is too large to exhaust, so the search does four things to stay tractable:
- **Cone of influence.** A fact is tracked only if a goal, a quest's completion, a terminal or a pickup guard reads it, or if something that produces a needed fact reads it. A neighbour's mood or an unused rumour cannot change what the player can do, so situations differing only in those are the same situation.
- **Conversations are one step.** The world is frozen while one is open, so each conversation is played out in its own small search and only its distinct *endings* join the main graph (cached by what the conversation reads, and replayed rather than re-explored). Conversations outside the cone are explored alone, from a plain start and from a start holding everything, and again after each way a visit could end, to catch dead options.
- **Richest wins.** Of two situations differing only in credits, the richer is explored; money never hurts.
- **Loose change is collected on sight.** A pickup that gives only credits can never hurt, so the checker takes it automatically instead of branching on it.
- **Soft locks under truncation.** If the search hits its limit, a situation whose successors were not all kept counts as "might reach the goal", so only situations explored completely, none of whose futures lead to a goal, are reported. It stays sound; only "never" claims weaken (they become warnings). The default limit is 8,000 states per map (`--max-states`).
Terminals may also say `puzzleRequires` (knowledge the puzzle needs, such as a code lock's code), and the checker models wearing and removing augments and pickups with a `requires`.

## What it reports
| Finding | Severity | Meaning |
|---|---|---|
| `goal-unreachable` | error | a goal in `content/goals/` can never be reached from a fresh start (a dead end, or a circular dependency: the door needs the code only the person behind the door has) |
| `soft-lock` | error | a *reachable* situation from which a goal can no longer be reached, with the shortest way in. Winnable-but-losable is not good enough |
| `single-route` | error | a terminal marked `critical` has fewer than two distinct ways through: its puzzle, a bypass the player can actually obtain, or another source of the same result (PUZ-1). The skip-after-attempts assist never counts |
| `quest-impossible` | error | a quest whose completion can never hold |
| `clue-never-given`, `node-never-reached`, `option-never-offered` | warning | content that exists but that no reachable player ever meets *on this map* (some are fine: an option for a gadget the slice has no way to get) |
| `truncated` | info | the search hit its limit (`--max-states`, default 40,000 per map); every "never" answer then drops to a warning because it is no longer proof |

It prints, for each goal, the shortest route in the player's terms: `solve the maint_panel puzzle`, or `talk to odd_sam -> say "Ask about the maintenance panel. (30 credits)" -> ... -> open maint_panel with its override`.

## Authoring
- **Goals:** `content/goals/*.json`, `{id, name, map, require: [conditions]}`. A goal is something the game needs to be winnable on a map: later, the ending gates (T3.11). A map with no goals is skipped.
- **Critical terminals:** add `"critical": true` to a terminal. The maintenance panel is one: its second route is Odd Sam's service override code (a clue worth 30 credits), accepted by `bypass`.
- **Start state:** `content/start.json`. The real game reads it too, so a new game and the checker can never disagree.

## What it does not model yet
Stealth and robots (the abstract world has none), district reactions and metrics, companions and the three-way ending matrix (T3.12), the NPCs' schedules (everyone is always available), and money-only soft locks. The ending checks from TESTING §7 (reachable per mentor / companion / route / past stance, "no soft locks from every reachable state" across the full game) extend this same search once those systems exist in content; the tests already pin the hard parts (dead ends, circular dependencies, soft locks, single-route puzzles, truncation).

## Tests
`packages/sim-harness/test/solvability.test.ts` uses hand-built fixtures with known problems, which the checker must flag: a goal nothing can reach, a circular dependency through a locked door, a key that can be sold and never recovered (soft lock), a puzzle with no second route, a bypass nobody can obtain, an unsolvable puzzle, an impossible quest, never-offered options, the search limit, and night-only content. It also runs on the shipped content and shows it would catch breaking it (remove the second route to the maintenance wing and it fails).
