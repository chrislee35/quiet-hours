# Identity, passes, and demerits

The player starts with **no record**: the *null state*. Everything here follows from that.

## The ID check
When a robot sees the player it checks them against the zone they are standing in. The result (`resolvePass`):

| Outcome | When | Effect on the robot |
|---|---|---|
| **Null** | the player holds no passes at all | "pending review": suspicion builds at the baseline rate (`identity.nullGainFactor`). **No demerits.** |
| **Allowed** | a held pass is valid here | the robot has no reason to care: no suspicion (`identity.allowedGainFactor`, 0) |
| **Violation** | passes held, but none covers this zone or level, or a limited one is spent, or (thorough scan) it is forged | suspicion builds faster (`identity.violationGainFactor`) and a restricted-zone infraction is recorded |
| **Expired** | a pass would have worked but has expired | treated like Violation |

So the null can stand where it would flag anyone else (no demerits, the scanner shrugs), but cannot *pass* a check; a forged or borrowed identity makes robots ignore you where it is valid, at the price of real demerits if it is not.

## Passes
A pass has a `level` (the highest zone permission it satisfies), optional `zones` (limit it to named zones), an optional expiry, optional `uses` (one-time or limited; checkpoints consume them), an `origin` (`issued`, `forged`, `borrowed`, `stolen`; a thorough scan such as an Auditor's rejects `forged`), and `curfewExempt`. Grant one with the `give_pass` effect (in a terminal's `onSolve`, a service, or `ApplyEffects`):

```json
{ "give_pass": { "id": "work_permit", "label": "Work permit", "level": 1, "zones": ["industrial"],
                 "expiresInMinutes": 240, "origin": "forged", "curfewExempt": false } }
```
With several valid passes the lowest-level one is used, so a powerful pass is not spent on a trivial check.

## Demerits
Infractions seen by a robot add points: `restricted_zone` (an Expired/Violation scan in a zone with permission above 0) and `curfew` (out during curfew in a zone marked `curfew`, without a curfew-exempt pass). Each kind has a cooldown (`demerits.cooldownSeconds`) so one sighting is not counted every frame. Points drain at `demerits.decayPerSecond`. At `checkThreshold` the alert rises to Suspicious (a check is triggered); at `enforcerThreshold` it rises to Hunting (enforcers called; Hounds and Auditors will be dispatched when they exist). The UI shows standing as a word (clean, noted, flagged, wanted), never a number.

Being caught and processed confiscates all passes into the locker and wipes the demerits; recovering the locker returns the passes.

## Authoring
- Tiled zone rectangles take `permission` (int) and `curfew` (bool): see `docs/maps.md`.
- Dialogue can test `pass:ID` and remove a pass with `-pass:ID`: see `docs/dialogue.md`.
