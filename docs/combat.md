# Tools and combat

Combat is optional, risky and never the best answer (CMB-4: no critical path needs it; the solvability checker will verify that). Tools are items with a `tool` spec in `content/items/`; the `UseItem` command uses one.

| Tool | Kind | What it does | Cost |
|---|---|---|---|
| Noise-maker | `decoy` | thrown along your facing; robots near where it lands go to look | consumed; **no fight, no alert** |
| Wire cutters | `cutters` | disable the nearest camera in reach (the city sends a mender) | reusable; quiet |
| Stun charge | `stun` | knocks the nearest robot in reach offline for 8 s | consumed; **a fight** |
| Slug round | `lethal` | destroys a robot for good | consumed; **a fight**, very loud |
| Burst Jammer | augment | knocks everything in 6 tiles offline for 6 s (see `docs/augments.md`) | cooldown only |

A tool with nothing to act on is refused and **not** used up.

## What a fight always costs (CMB-2)
- The alert rises to Hunting (`combat.fightAlert`); lethal force to Lockdown (`combat.lethalAlert`).
- The victim calls for help: robots within comms range are told where you are.
- The tool is used up, and a share of the credits you carry is lost in the scuffle (`combat.creditLossFraction`).
- Anyone with a record gets an *assault* infraction (`demerits.assaultPoints`). The null has none to earn, as with every infraction.

## Lethal force (CMB-3)
Rare (the ammunition is contraband: an Auditor's audit finds it), loud (noise radius 14, heard through the district), and recorded: the flag `lethal_force_used` is set for good and `robots_destroyed` counts them, so the story can react later. A destroyed robot never returns.

## Playing
In the Gear panel (G), press **Ready** on a tool, then **Q** (Tool on touch; right stick click on a pad) uses it. Decoys are thrown the way you last moved. The `?map=range` bench has every tool.
