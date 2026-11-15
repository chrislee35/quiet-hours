# The Civic Voice and repeated arrests (T3.15)

## The Civic Voice
MERIDIAN's public-address announcer. Every `pa.intervalMinutes` (25) of game time it says one line, as a `Broadcast` event the HUD shows as a message. The Safehouse (any zone marked safe) is out of reach of its speakers.

The pool is content: `content/broadcasts/civic_voice.json`, about forty lines. A line is
```json
{ "id": "pa_arrest_three", "text": "...", "when": [{ "arrest_count_gte": 3 }], "weight": 5, "effects": [] }
```
- **Eligible** when every `when` condition holds (the same conditions as everywhere: arrests, curfew, Quiet Hours, alert, city metrics, flags, clues, time of day). Lines with no `when` are routine and can always play.
- **Chosen** by weight among eligible lines. Situational lines carry more weight, so a hunting alert is announced far more often than chance would give it. The pick depends only on the run's seed and the tick, never on the game's own random stream, so announcing cannot disturb anything else, and the same run says the same things.
- **Not repeated** until `pa.noRepeat` (8) other lines have played. The recent list is the `pa_recent` flag, so saving keeps it. If the pool runs short the rule is relaxed rather than going silent.
- **Effects** run when the line plays. The shift line is the one place the Voice is wrong on purpose: it gives the false clue `pa_shift_time` ("the Pump 4 crew changes at 22:00"), which contradicts the true 21:40 the player can get from Odd Sam.

What the pool covers: routine civic menace (about a dozen), time of day (morning, noon, afternoon, evening, curfew, Quiet Hours), the alert level, city order, power and contentment, the arrest count (none, one, two, three), and a few that notice what the player has done (the pirate song, Statistic, selling out Mrs Adeyemi-Roth).

## FAIL-4: repeated arrests escalate
Tuning in `content/config/tuning.json` (`failure`):
| Arrests | What changes |
|---|---|
| 1 | as before: 4 s hold, alert at least Suspicious |
| each after | the hold is 2 s longer, up to 12 s (`holdPerArrest`, `holdMaxSeconds`) |
| 3 (`trackingAfterArrests`) | **tracked**: after processing the alert is at least Hunting (`trackedAlert`), and robots notice the player 1.3 times faster (`trackedGainFactor`) |
Flags, clues and trust are still never touched (FAIL-5).

## Halloran-7's deal
Case Officer Halloran-7 (Reintegration) stands by the holding cell on the Stacks and the Civic Core. His conversation changes with the arrest count: none (no file; he hints at the deal), once (he reads Rule 9 aloud and warns what a repeat means), twice (he has opened a file, explains tracking, and mentions the cat's file), three or more (the deal).

The deal: show him **two rules that disagree** (Rule 4 and Rule 9, the same pair that opens SQ-01 with Dov). With both in the notebook, presenting either one makes him lose the form: the arrest count goes back to zero, tracking ends, and he sets `halloran_dealt`; afterwards he has no file on you. One rule on its own is not enough. It uses the effect `clear_arrests` (dialogue `lose_form`).
