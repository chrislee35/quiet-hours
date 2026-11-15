# The Industrial Belt (T3.5)

`content/maps/belt.json` (52×28). Reached by the tram from the Civic Core plaza (5 credits, a record is needed); back from the yard.

## Machinery (engine: `packages/core/src/machinery.ts`)
Door properties in Tiled:

| property | meaning |
| --- | --- |
| `cycle` | `"open/closed[/offset]"` seconds. The door opens and shuts from the tick count alone, so a press is the same every run and can be learned and timed. |
| `runsWhen` | an `activeWhen` string (`"belt:node2!=off"`). While it fails the machine rests open. |
| `unlockedWhen` | `"time:21:40-06:00"`. The door is unlocked while it holds and locks again afterwards; unlocking by hand (`unlock_door`) is permanent. |

A press never shuts on someone standing in the doorway. Bad strings are errors at import.

`schedule` effect: `{ "schedule": { "inMinutes": 60, "effects": [...] } }` queues effects in `state.timers`; the timer system runs them when due. Timers are saved.

## The map
- **Press hall**: three presses (6 s open, 3 s shut, staggered 2 s so there is always a gap) between the yard and the scrap yard. Node 2 stops them.
- **Power nodes** (terminals): Node 1 (yard warden), Node 2 (presses), Node 3 (scrap sentry), Node 4 (behind Pump 4's side door: cuts the Stacks' power and cameras for an hour via `sabotage_power`, and a `schedule` restores it). Node 4 is a critical terminal: puzzle, or Gus's word (flag `sq_03_done`).
- **Pump 4 annex**: side door unlocked by the night crew 21:40-06:00 (clue `pump4_shift`), or the annex lock puzzle by day. Gus's thermos is in the locker.

## Side-quests
- **SQ-03 Pump 4 Thermos** (Gus Varga): fetch the thermos from the annex. Reward: trust, the Node 4 and Pallas clues.
- **SQ-04 Brindle's Hum**: pull Brindle off the scrap queue at the scrap controller before day 5, or it is recycled (`brindle_lost`).

Tests: `packages/sim-harness/test/belt.test.ts`, door-property parsing in `packages/core/test/tiled.test.ts`.
