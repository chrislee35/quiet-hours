# The Lull (T4.1, WLD-6)

`content/maps/lull.json` (58x28). Reached from the Civic Core plaza by the gilded arch (free, any hour: the Lull never closes; there are no curfew zones). Back up the stairs by the foyer. `?map=lull` opens it directly.

## What it is
A safe place: no robots, no cameras. Bright, kind, and quietly wrong. Zones: the foyer, the main floor (dance floor, listening booths, the window table, the corner booth), the bar, the staff rooms (permission 1, a door that opens 03:00-03:30) and the back room (permission 1, the terminal).

## People
- **The Host** (`host.qdl`): runs the bar. Free perfect drink; a song for 3 credits; clear water for 2 (nobody has asked before). Gossip: the hackers' reunion (`hackers_reunion`), the cat (`cat_host`, false). The planted line `lull_harmless`, the false `odile_content`, then, if asked, the true `odile_signatory` and `odile_lapse`. Hands over Lila's diary to a friend of hers. Tragic or sinister is left to the player.
- **Lila Voss** (`lila_voss.qdl`): SQ-08.
- **Marta Anselm** (`marta_anselm.qdl`): Dov's sister from SQ-01, content, the same card every month.
- **Odile Marchetti** (`odile.qdl`): in the corner booth. A quiet presence for now; her awakening arc is T4.3.

## SQ-08 Table for One
Lila comes every evening and cannot remember why. Her little notebook is lost property. Two ways to it: **ask the Host** (once you have spoken to Lila) or **the staff drawer** behind the door that opens 03:00-03:30. A **glass of clear water** from the bar. Give her both and she wakes (`lila_awake`, `sq_08_done`): the amber drink is what keeps the regulars under, you learn the dulling is real (`lull_dulling`) and who Odile is (`odile_signatory`). The diary alone is not enough. No failure.

## The back room
Terminal `lull_core`, a lights-out puzzle: the mixing desk is playing the contentment index's pattern, giving `lull_machine_code` (machine-origin fingerprints for the sequel; not confirmed).

## Not here yet
The dulling itself and the Memory Anchor (T4.2); Odile's arc and the pull-back rule (T4.3); the disruption branch (T4.5). The clue web is at its 100 cap, so the Lull adds no clues of its own: Lila gives existing ones.

Tests: `packages/sim-harness/test/lull.test.ts`.
