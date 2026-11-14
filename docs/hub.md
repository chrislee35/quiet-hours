# The Safehouse hub (WLD-1)

The Safehouse is behind the laundry wall in the Stacks (see `docs/stacks.md`). It is where you save, shop, rest and watch the cell improve as you help it.

## Growth
`content/growth/*.json` lists **growths**: `{id, name, description, when: [conditions]}`. Each exists while its conditions hold, written in the shared rules language, so the hub is a pure function of what you have done (flags, clues, donations). Once a growth appears it stays: the game records it in `state.hub.grown` and announces it once ("The Safehouse has grown: A tea corner."). The `hub` system runs after the district reactions, including while a conversation freezes the world, so a growth appears the moment its flag is set.

| Growth | Appears when |
|---|---|
| The radio | you have met Teeter |
| A tea corner | Wren has vouched for the four who can help |
| Perrin's workbench | you have met Doc Perrin |
| A row of cots | you have opened Locker 9 |
| A stocked shelf / A tool rack / Warm lamps | you chip in 20 / 40 / 80 credits (`cell_fund_1..3`) |
| A tomato box | the Tomatoes side-quest is done (`sq_07_done`; T3.14) |

**On the map**, scenery of class `prop` (`kind`, optional `shows` = a growth id) is drawn while its growth exists; a bunk is always there. **In dialogue**, `grown:ID` gates options and `start:` lines: Wren greets you differently once the lamps are up, and the stores only stock what the cell has funded.

## Helping the cell
Wren: **Is there anything I can do for the cell?** Chip in credits in three steps (20, 40, 80), in order, one each. There is loose change around the Stacks (washers, the notice rail, the plaza drain, the notice board, the tea tin) and scrap wire to sell to Odd Sam, enough to afford all three; the solvability checker confirms the top tier is reachable.

## The stores
Stock grows with the shelf: a **noise-maker** (10) once the shelf is funded; **wire cutters** (25, one per customer) and a **stun charge** (40) once the tool rack is. They are ordinary services (`content/services`), so a refusal has its own line.

## Resting and saving
**I would like to rest for a bit** drops the alert to Calm, says so, and counts as a checkpoint: the client autosaves on the `Rested` event. The Safehouse is a safe zone (`safe`), so manual saving always works there, even in danger, and autosave is allowed because resting has just calmed the city. The growth state is part of every save.

## Authoring
- Add a growth in `content/growth/`, a `prop` on the map with `shows`, and (optionally) a conversation option gated on `grown:ID`. `pnpm validate` rejects a prop that shows a growth that does not exist, a growth that depends on a clue that does not exist, and dialogue that gates on a growth that does not exist.
- The solvability checker reads a growth's conditions as facts the conversation depends on.
