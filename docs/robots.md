# Robot types

Each type is a profile in `content/config/tuning.json` under `robots.<kind>` plus a few special behaviours. Place them on a map with a Tiled object of class `robot` (see `docs/maps.md`): `kind` picks the type.

| Type | Role | What makes it different |
|---|---|---|
| **warden** | patrol and ID check | Walks a route, checks IDs, investigates noise, chases and catches. The baseline. |
| **sentry** | static watch | Never leaves its post. Its view sweeps back and forth. It cannot chase: when it identifies you it raises the alarm (the city alert rises) and keeps watching. Hears noise and turns to face it. |
| **checker** | zone compliance | Short range (4 tiles). A *null* (no record) is "pending review": the checker stalls for `reviewSeconds`, then reviews again, for as long as you stay in view, and never escalates. A valid pass is checked once per stay and a limited pass is used up. A pass that does not cover the zone is caught immediately. Cannot chase. |
| **hound** | pursuit | Waits at its post until the alert reaches `dispatchAlert` (Hunting), then hunts to your position. Faster than a running player, hears footsteps 1.6 times as far, and follows them while chasing. Returns to its post afterwards and can be dispatched again. |
| **auditor** | papers and pockets | Patrols and does *thorough* scans (they reject forged passes). Occasionally, at close range, audits you: forged pass, expired pass, or any item whose id starts `contraband_` fails the audit and is spotted at once. A null or a genuine pass passes. Audits are three times as likely during Quiet Hours. |
| **heavy** | rare, dangerous | 120 degree view out to 7 tiles, builds suspicion faster, catches from 1.2 tiles away. Slower than a running player but faster than a walking one. |

## Profile fields
`coneDegrees`, `rangeTiles`: the view. `gainFactor`: how fast it builds suspicion. `hearingFactor`: how far it hears footsteps. `patrolSpeed` (0 = never moves), `chaseSpeed`, `catchRadius`. `pauseSeconds`: wait at each waypoint. `investigateSeconds`, `searchSeconds`: how long it looks around. `sweepDegrees`: idle scan arc. `canChase`, `thorough`, `tracksNoise`: behaviour switches. `reviewSeconds` (Checker), `checkRangeTiles`, `checkChancePerSecond`, `quietHoursCheckFactor`, `auditSeconds` (Auditor), `dispatchAlert` (Hound; 0 = never dispatched).

A robot without a route stands at its post (its start position and facing) and returns there after any investigation or search.

## Tuning notes
- A Hound's speed beats running, so against a dispatched Hound the answers are to break line of sight with doors, hide, or not raise the alert: sneaking is quiet.
- Everything in the table is checked by `packages/sim-harness/test/robot-types.test.ts`, one scenario per type.

## Cameras, alerts and repairs (T2.2)
- **Alerts between robots.** A robot that identifies you tells every robot within `comms.rangeTiles` (14 tiles); each hears after `comms.latencySeconds` (1 s). A robot that is not already pursuing goes to investigate the reported spot, starting primed (suspicion `comms.primedSuspicion`), so it identifies you quickly if it sees you. Alerts are one hop (no relays), and maintenance robots are never alerted. A post-bound Sentry or Checker turns to face the report instead.
- **Shared memory.** The last report is kept with its time (`lastKnown`). Hunters (Hounds) are sent to it while it is fresh (`comms.memorySeconds`, 20 s), otherwise to where the infraction is. Being processed clears pending alerts.
- **Cameras** (Tiled class `camera`, `facing` in degrees): a sweeping view (`cameras.*`) that runs the same ID check, builds suspicion the same way (sneaking helps), witnesses infractions, and when it identifies you raises the alert and alerts robots in range. May be mounted in a wall tile but cannot see along the wall it is in. Cut one with the `disable_camera` effect (a terminal's `onSolve`, for example); `enable_camera` restores it.
- **Repairs.** A maintenance robot (`kind` `mender`, no vision) is sent to a disabled camera after `repairs.cameraDelaySeconds`, and to a door that began locked and was unlocked after `repairs.relockDelaySeconds`; it works for `repairs.repairSeconds`, then returns to its post. It will not close a door someone is standing in. A job it cannot reach is retried after the normal delay. Without a maintenance robot on the map, nothing is repaired: place one wherever the city should be able to fix things.
