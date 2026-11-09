# District state, city metrics and reactions

## District state
A bag of named values per district, changed only by effects: `set_district: [district, key, value]` (`stacks.power = "off"`, `stacks.patrolSet = "reinforced"`). Read with the condition `district_is: [district, key, value]`. Every change is a `DistrictChanged` event.

## Robots and cameras that come and go
A robot or camera placed on a map with the string property `activeWhen` exists only while a district value holds: `district:key=value`, or `district:key!=value` (active unless it matches, so an unset value counts as active). This is how a lockdown brings in extra patrols and a power cut blinds cameras.
- A robot whose condition fails is **dormant**: it sees, hears, moves and is alerted by nothing, and is not drawn. When it becomes active it appears at its post (`RobotActivated`); when it stops, it leaves (`RobotStoodDown`).
- A camera that loses power draws as a dark housing (`CameraPowerLost` / `CameraPowerRestored`).

## City metrics
`order`, `power`, `contentment`, each 0-100, hidden from the player as numbers. Start values and recovery are in `tuning.json` under `metrics`. Effects: `adjust_metric: [metric, delta]` (clamped). Conditions: `metric_gte`, `metric_lte`. Each in-game hour order and contentment drift back toward their start by `metrics.recoverPerHour`; power only changes through effects (restoring it is something the player does).

## Reactions (`content/reactions/*.json`)
```json
{ "id": "meridian_reinforces", "on": "MetricChanged",
  "if": [{ "metric_lte": ["order", 45] }, { "not": { "district_is": ["stacks", "patrolSet", "reinforced"] } }],
  "effects": [{ "set_district": ["stacks", "patrolSet", "reinforced"] }] }
```
`on` is an event type; `match` requires listed event fields to equal given values (a `Custom` event is matched by its `name`, so scripted content raises it with the `emit` effect); `if` are conditions; `once` limits it to one firing. Reactions can chain (a metric change can trigger the next reaction) to a depth of 4 per tick, so they cannot loop forever. They run in the *district-reactions* step, and also while a conversation or terminal has the world frozen, so effects from those still count.

## What ships
- Stunning a robot costs order 8, destroying one 15 (and 8 contentment), cutting a camera 3.
- `emit:sabotage_power` cuts power in the Stacks (power -50, order -5, contentment -5); `emit:restore_power` brings it back.
- MERIDIAN reallocates: order at or below 45 sets `stacks.patrolSet` to `reinforced`, bringing in robots marked for it; order back at 60 sends them away.

On `?map=range`, a Heavy waits for the reinforced set in the first room, and a camera in the Hound bay loses power with the Stacks. Fighting enough robots (two stuns and a slug round, or a lot of cut cameras) will summon it.
