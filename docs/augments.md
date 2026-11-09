# Augments, items and the wrist band

Progression is gear only (AUG-1): no XP, levels or stats. Everything below is data in `content/augments/` and `content/items/`, validated by `pnpm validate`.

## The band
The band has **slots** and a **power budget** (start: 2 slots, 3 power, in `content/config/tuning.json` under `band`). Each worn augment uses some of both. Wearing something that does not fit is refused with a reason: no free slot, or not enough power. Removing something frees both. `add_band_capacity: {slots, power}` is an effect, for upgrades (for example the SQ-09 reward).

Augments are **not** confiscated when you are caught; they are part of you, not your pockets. Items and credits still are.

## An augment definition
```json
{ "id": "quiet_step", "name": "Quiet Step", "description": "...", "slotCost": 1, "power": 1,
  "modifiers": { "noise.mult": 0.5 } }
```
- `modifiers`: named multipliers. Systems ask `modifier(state, content, "noise.mult")`; several augments multiply. Nothing in the systems mentions an augment by id.
- `tags`: named capabilities, asked with `hasTag(state, content, "reveal_cones")`.
- `spoof` (`windowSeconds`, `rechargeSeconds`): the Ghost Tag mechanism. Every robot and camera scan goes through `scanFor`; the first scan that would not come back valid opens a window in which every scan reads as a valid record, then the tag recharges.
- `jam` (`radiusTiles`, `seconds`, `cooldownSeconds`): the Burst Jammer mechanism, fired with the `UseAugment` command.

## The six
| Augment | Slot | Power | Effect |
|---|---|---|---|
| Quiet Step | 1 | 1 | all noise radii halved |
| Ghost Tag | 1 | 2 | spoofs a valid record for 8 s when a scan would fail; 90 s recharge |
| Signal Lens | 1 | 1 | tag `reveal_cones`: draws every robot and camera view cone, through walls, from any distance |
| Slow Tongue | 1 | 1 | gates extra dialogue options (`augment:slow_tongue`); Odd Sam has one |
| Burst Jammer | 1 | 2 | knocks robots and cameras within 6 tiles offline for 6 s; 40 s recharge |
| Memory Anchor | 1 | 2 | tag `notebook_anchor`; has no effect until the Lull exists (T4.2) |

## Getting them
- **Found:** map object class `pickup` with `grant` = `augment:ID`, `item:ID[:COUNT]` or `credits:N`. Interact takes it once (flag `picked_<id>`).
- **Given:** effects `grant_augment: ID` / `revoke_augment: ID`; in `.qdl`: `{+augment:ID}`.
- **Bought / crafted / repaired:** arrive with the economy (T2.5) and the clinic.

## Dialogue and rules
Conditions: `augment:ID` (worn), `owns:ID` (owned) in `.qdl`; `augment_equipped` and `has_augment` in JSON.

## Items
`{id, name, type, stackable, tags, description}`; `type` is one of tool, key, consumable, contraband, junk. Auditors audit for `contraband` items. Pickups that grant several of a non-stackable item fail validation.

## Playing with them
`G` opens the band panel (Wear/Remove, slot and power meters, what you carry); `F` fires the Burst Jammer; on a pad, Start and X; on touch, the Gear and Pulse buttons. Open `?map=range` to find all six on a bench in the first room.
