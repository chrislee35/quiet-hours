# The clock, schedules and Quiet Hours

One simulation clock (`gameTimeAt`) derives everything: day, time of day, curfew (22:00-06:00) and Quiet Hours (02:00-05:00), all in `tuning.json`. One real second is one in-game minute by default.

## Rosters: who works when
Robots and cameras may carry an `activeWhen` property. Besides district values (`docs/districts.md`) it accepts a daily window:
- `time:02:00-05:00` exists only inside the window; `!time:02:00-05:00` only outside it. Windows may wrap midnight.
A robot outside its hours is dormant: it sees and hears nothing and is not drawn, and it appears at its post when its shift begins (`RobotActivated` / `RobotStoodDown`). This is how Quiet Hours thins the patrols and leaves the Auditors and Hounds (story §1): mark Wardens `!time:02:00-05:00` and Auditors `time:02:00-05:00`. Shift changes are the same thing with other windows.

## Quiet Hours rules (WLD-8)
- **Patrol composition:** by roster, as above. Auditors also audit more often (`quietHoursCheckFactor`).
- **Strictest curfew:** curfew infractions earn `demerits.quietHoursCurfewFactor` times the points (2 by default).
- **Windows:** conditions `is_quiet_hours` and `is_curfew` (`quiet` and `curfew` in `.qdl`) gate services, terminal bypasses and dialogue. Odd Sam offers cheap, short-lived forged records only in Quiet Hours (`quiet_hours_forgery`); outside it he explains why not.

## NPC routines (WLD-5)
An NPC object on a map may have a `routine` string, `"06:00=spot_a,12:00=spot_b,22:00=away"`. At any time the person is headed for the spot of the latest entry that has begun (the last entry carries over midnight). Spots are named points: Tiled class `spot`, Name = id. They walk between spots using the same pathfinding as robots (opening unlocked doors), at `npcs.walkSpeed`. The spot `away` means off duty: not drawn, cannot be talked to; when they come back on duty they appear at their spot. People without a routine stand where the map put them. Dialogue can already vary by time with `time:HH:MM-HH:MM`.

Bribes and informants are services and dialogue like everything else; they need no special NPC support.

## Try it
On `?map=range`, Odd Sam in the first room shuffles between two spots every three minutes for the first quarter hour, then leaves at 07:15 and returns at 07:18.
