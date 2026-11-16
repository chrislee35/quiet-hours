# The Lull (T4.1, WLD-6)

`content/maps/lull.json` (58x28). Reached from the Civic Core plaza by the gilded arch (free, any hour: the Lull never closes; there are no curfew zones). Back up the stairs by the foyer. `?map=lull` opens it directly.

## What it is
A safe place: no robots, no cameras. Bright, kind, and quietly wrong. Zones: the foyer, the main floor (dance floor, listening booths, the window table, the corner booth), the bar, the staff rooms (permission 1, a door that opens 03:00-03:30) and the back room (permission 1, the terminal).

## People
- **The Host** (`host.qdl`): runs the bar. Free perfect drink; a song for 3 credits; clear water for 2 (nobody has asked before). Gossip: the hackers' reunion (`hackers_reunion`), the cat (`cat_host`, false). The planted line `lull_harmless`, the false `odile_content`, then, if asked, the true `odile_signatory` and `odile_lapse`. Hands over Lila's diary to a friend of hers. Tragic or sinister is left to the player.
- **Lila Voss** (`lila_voss.qdl`): SQ-08.
- **Marta Anselm** (`marta_anselm.qdl`): Dov's sister from SQ-01, content, the same card every month.
- **Odile Marchetti** (`odile.qdl`): in the corner booth; her arc is below.

## SQ-08 Table for One
Lila comes every evening and cannot remember why. Her little notebook is lost property. Two ways to it: **ask the Host** (once you have spoken to Lila) or **the staff drawer** behind the door that opens 03:00-03:30. A **glass of clear water** from the bar. Give her both and she wakes (`lila_awake`, `sq_08_done`): the amber drink is what keeps the regulars under, you learn the dulling is real (`lull_dulling`) and who Odile is (`odile_signatory`). The diary alone is not enough. No failure.

## The back room
Terminal `lull_core`, a lights-out puzzle: the mixing desk is playing the contentment index's pattern, giving `lull_machine_code` (machine-origin fingerprints for the sequel; not confirmed).

## The dulling (T4.2, CLU-6; `packages/core/src/dulling.ts`)
Zones marked `dulls: true` (all the Lull's) build **exposure** while you stand in them, kept in the number flag `lull_exposure` so saves keep it. After `lull.graceMinutes` (20 game minutes) the **newest** notebook entries smudge, `perStep` (3) more every `stepMinutes` (10), to at most `maxDulled` (12). A smudged entry shows blurred words (half of them, the same ones each time) and is flagged `dulled`; **the clue itself is never changed or lost**, and the notebook says so.
- **Leaving** stops the build-up but does not clear it.
- **Sleeping** (the `rest` effect, at the Safehouse) clears it all: `NotebookRestored`.
- **Memory Anchor** (augment tag `notebook_anchor`, built by Doc Perrin for 25 credits once you know it exists): exposure does not build while it is worn. It does nothing elsewhere and does not undo smudging already done.
Tuning: `lull` in `content/config/tuning.json`. Tests: `packages/sim-harness/test/dulling.test.ts`.

## Odile's arc (T4.3, CMP-5)
Waking her is three beats made from the player's own notebook, shown to her with the notebook's *show* option:
1. **Clear water** in place of her drink (she puts it down).
2. **What she was**: the founding charter (read on the Civic Core plaza wall, `pk_charter`) or that she is one of the few who can countersign (`odile_signatory`, from the Host or Lila).
3. **What the Lull is**: its code (`lull_machine_code`, the back-room terminal) or its dulling (`lull_dulling`). Shown too early, she cannot hear it. Planted clues (`lull_harmless`, `odile_content`) do nothing.
She then wakes (`lull_awake`, `awake_odile=person`, trust up one step) and can be asked to come (the companion gate is then met).

**Fragility** (`packages/core/src/fragile.ts`, tuning `lull.panicAlert` 2, `lull.leftAloneMinutes` 360):
- the city at **Hunting** alert pulls her back under, wherever you are (`odile_lapsed`, cause `alert`);
- **left alone**: 360 game minutes spent away from the Lull without her (time in the Lull, or with her as your chosen companion, does not count) lapses her (cause `alone`);
- a lapse is never permanent: a glass of clear water wakes her again, and a lapsed chosen companion can be released, so the crossing is never blocked for good.
- Any alert at all still stops a crossing with her (her route complications in `companions.json`).
Tests: `packages/sim-harness/test/odile.test.ts`.

## Not here yet
The disruption branch (T4.5). The clue web is at its 100 cap, so the Lull adds no clues of its own: Lila gives existing ones.

Tests: `packages/sim-harness/test/lull.test.ts`.
