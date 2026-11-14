# The Stacks (Act I opening)

`content/maps/stacks.json` is the game's opening and the default map. (`?map=slice` loads the old vertical slice, `?map=range` the robot test range.) It is a 46 x 24 tile residential block: the **laundry** where you wake, the hidden **Safehouse** above it, the **plaza**, a third-floor **landing**, the superintendent's **office**, a locked **service wing**, and the **reintegration desk** where you wake if you are caught.

## What the Act I opening is
1. **You wake in the laundry** at 07:00 with 50 credits, two scrap wire and a blank band. You are on no record: the null state.
2. **Look in the chute.** A brass key and the first breadcrumb (*laundry_key*).
3. **Locker 9** (laundry, south-east corner) has the first augment, Quiet Step. Two ways in (PUZ-1):
   - the **key** from the chute; or
   - the **code**, 0417, scratched inside your wrist band (*band_scratch*). You read it with a **Signal Lens** (Doc Perrin, 30 credits) by studying your band in the **laundry mirror**. The lock gives no feedback; the number must come from the world.
4. **Find the Safehouse.** The wall panel by the machines (laundry, north) hides a fuse board; turning the fuses until all are dark opens the wall. Two ways in:
   - **solve** the fuse board (a three-by-three lights-out); or
   - **know** where it is (*safehouse_way_in*, from Odd Sam for 15 credits, or free from Silas) and the panel opens with no puzzle.
5. **Meet Wren.** She explains the null state (*null_pending*), says the Gate has not been passed in years, and names the four who might help (Ines, Maren, Tobias, Silas). The mentor choice is T3.8.

Goals for the solvability checker: *reach the Safehouse and meet Wren*, *open Locker 9*. Both critical terminals are proven to have two ways through.

## The Stacks' signature rules
- **Curfew** (22:00 to 06:00) in the plaza and landing. Out in it with a *record*, you are marked down (double in Quiet Hours); the null state earns nothing, which is the point.
- **Cameras on a schedule:** the plaza camera works by day; at 02:00 it is replaced by one that looks from the laundry wall. (`activeWhen: "!time:02:00-05:00"` / `"time:02:00-05:00"`.)
- **Rosters:** a Warden patrols the plaza by day and goes home at night, when an Auditor takes the post. A Checker watches the service door all the time and will stall the null state in "pending review" indefinitely.
- **Informant:** Mrs. Adeyemi-Roth reports neighbours she dislikes. Befriend her (a harmless report), bribe her (15 credits), or threaten her, which gets you reported (the alert rises and the city's order drops) until you apologise. Hidden trust, one step per act, always recoverable. This is the hook for SQ-02 (T3.14).
- **Routines:** Silas keeps his notice board by day and his desk in the evening.
- **Service wing:** a restricted (level 2) maintenance zone whose door opens from a panel in the plaza; a place to take the power puzzle and, later, to cut the Stacks' power.
- **The Safehouse is a safe zone:** manual saving always works there.

## People
Odd Sam (plaza), Mrs. Adeyemi-Roth (landing), Silas Brandt (notice board and office), and in the Safehouse Wren, Doc Perrin and Teeter. Teeter and Odd Sam are also where the optional gossip starts (the cat; the hacker feud). Their conversations are `content/dialogue/*.qdl`.

## Engine additions made for it
- **Pickups** can give several things (`item:locker_key+clue:laundry_key:laundry_chute`), learn a clue by looking (`clue:ID:SOURCE`), carry a prompt `label`, and stay hidden until `requires` (`augment:ID` worn, `item:`, `clue:`, `flag:`).
- **Terminals** can say `puzzleRequires` (what you must already know for the puzzle to be solvable). The game does not enforce it; the solvability checker uses it so a puzzle only counts as a way through if the player can learn what it needs.
- **The solvability checker** got a cone-of-influence reduction, atomic conversations and sound soft-lock detection on a truncated search (see `docs/solvability.md`), because the Stacks is the first map whose state space is too large to exhaust.

## Not yet
The Civic Voice's PA broadcasts (T3.15), the mentor introductions (T3.8), the Pump 4 and Belt links (T3.5), the side-quest SQ-02 itself (T3.14), and any art beyond the placeholder tiles.
