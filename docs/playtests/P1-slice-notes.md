# P1 playtest notes: vertical slice (first pass)

## Finding 1: "It's impossible to get past the robot in time" (maintainer, 2026-11-08)
Measured by simulation (a scripted player walking a fixed route after waiting N seconds, for N = 0..40; "success" means never identified):

| Route (old map and tuning) | Success |
|---|---|
| Stand still at spawn | spotted after 5.4 s (spawn was on the patrol line) |
| East along the corridor (the obvious route), running or sneaking | **0 of 41** start times |
| North route to the first door | 12% running, 7% sneaking |

Causes: (1) the only way east was a 2-tile corridor patrolled by a robot with a 6-tile cone, so no timing could succeed; (2) the spawn sat on the patrol line; (3) sneaking did nothing against being *seen* (it only reduced noise), so the one tool a stealth player reaches for had no effect on the main threat; (4) suspicion built in about 1.4 s at 4 tiles, with 1.5 s pauses at the ends of the patrol giving almost no windows.

## Changes
- Core: `vision.sneakGainFactor` (new): sneaking slows suspicion build-up.
- Tuning: suspicion gain 1.2 to 0.9 per second; decay 0.6 to 0.8; sneak factor 0.6; patrol waypoint pause 1.5 to 3 s.
- Map: spawn moved off the patrol line; the patrol turns around at the west room's wall instead of entering the room; the terminal room now connects to the east room through the locked door (so there are two routes to the east room: hack the terminal, or sneak the corridor).

## Result (same measurement, new map and tuning)
| Route | Sneaking | Walking | Running |
|---|---|---|---|
| Stand still at spawn | safe indefinitely | | |
| North door to terminal room (careful route) | 88% | | 60% |
| East along the corridor (bold route) | 50% | 25% | 0% |

The shape is intentional: patient and quiet is rewarded, running through the guarded corridor is hopeless, and there are two different ways to reach the east room (PUZ-1). The regression test `packages/sim-harness/test/slice-fairness.test.ts` keeps these properties true.

## Open questions for the next playtest
- Is 50% for the sneaking corridor route the right amount of risk, or should it be lower?
- Does the player discover that sneaking helps? (The HUD lists Ctrl to sneak but does not say why.)
- Larger maps should add cover (doors, alcoves, props) and more than one robot; re-run the route-fairness tests on each.
