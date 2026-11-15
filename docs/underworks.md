# The Transit Underworks (T3.6)

`content/maps/underworks.json` (66×32). Down the stairs from the Civic Core plaza (free); back up from Platform A.

## The trains (engine: `packages/core/src/machinery.ts`)
Three train doors in the one-tile tunnel use `cycle: "7/5/seed"`: seven seconds open, five shut (a train). The `seed` offset puts each door at its own point in the twelve-second cycle, drawn from the run's seed and the door's id (`seededPhase`): the same all run, different from seed to seed, so the pattern has to be watched. `runsWhen: "underworks:trains!=off"` lets the interlock stop them.

## Three ways to the junction
1. **The tunnel**: time the trains (clue `train_cycle`, from the signal lamps at the junction or the interlock).
2. **The drain** under it: no trains, one warden on a loop (clue from Quill's talk).
3. **The interlock** (terminal `track_interlock`, a rule-contradiction puzzle on Platform A): stops every train.

## Rooms
Platform A (arrival, interlock, the token on the grate), Dispatch (Maren), the junction (Quill, signal lamps, a night auditor), the signal room (the Conductor, `signal_box`), Platform 7 (door unlocked 13:50-14:10, matching the platform window; its exit to the Gate arrives with T3.11) and the Hollow service tunnel (door locked until SQ-05; the exit to the Hollow arrives with M4).

## Side-quests
- **SQ-05 Right on Time** (Quill): bring the token from Platform A and the trains' pattern. Reward: trust, `door_hollow` unlocked (reaction on the custom event `quill_opens_hollow`), clues `quill_shortcut`, `tunnel_scanners_low`.
- **SQ-06 Apology, Express** (the Conductor): slide the corrupted timetable apart at `signal_box` (a schedule-alignment puzzle; Train 7 must run at 13:52). Reward: free rides (`transit_fare` has `freeWhen: [flag conductor_fixed]`), Maren's backstory clue, the corrected Train 7 time.

Maren's mentor voicings come with T3.7/T3.8; her talk here is the timetable and tunnel talk only.

Tests: `packages/sim-harness/test/underworks.test.ts`.
