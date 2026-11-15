# The Gate and the three ways out (T3.11)

`content/maps/gate.json` (64x30), reached by **Train 7** from Platform 7 in the Underworks (service `train_7`: boards 13:50-14:10; the Gate's service platform door is on the same window). `content/maps/outside.json` is the far side (a stub the closing scene, T3.13, fills in).

## Rooms
Service platform, service corridor (door unlocked 13:50-14:10), the Gate hall (the Gate's voice, a sentry), the Gate Annex (permission level 3; the controller), and the threshold behind the Gate door.

## Routes (END-1)
Each crossing is a **service** used at an exit, so the requirements are data (CMP-5 will add the companion's requirements to the same services). Setting `route_taken` marks a service as a route.

| Route | Where | Needs |
|---|---|---|
| Sneak | `gate_out_service` | 13:50-14:10 and a pass in hand (the platform checks passes, not faces) |
| Hack | `gate_out_hack`, past the controller in the Annex (Level 3 permit from Ines) | flag `gate_controller_open`: solve the controller's code lock (two halves: the Ledger margin or Pell, and Pallas's log or Pallas) **or** answer the Gate as its builder (M3 embrace) |
| Break | `gate_out_break` | Node 4 cut (Belt): the Gate's door is unlocked while `belt:node4=off`, for the hour before the crew restore it; sets `gate_broken` (the cost for those left behind) |

## M3, the Prompt
`gate_voice` in the hall asks the player to authenticate as R. Alder: embrace sets `past_m3=embrace` (the controller then opens on its own; MERIDIAN sees you; Wren trusts you less), reject sets `past_m3=reject` (the null edge).

## Cross-map checking
`pnpm solvable` now also runs `packages/content-tools/src/routes.ts`: a closure over the whole game (every conversation option, pickup, terminal and fare on every map) that proves each route's crossing service becomes possible from the start state, and that no rule it relied on needed combat (there is none). Each route is also tried **without embracing the past**: a route only the embraced past could reach is an error. It is optimistic about time, money and position; the per-map checker and `packages/sim-harness/test/gate.test.ts` cover those.
