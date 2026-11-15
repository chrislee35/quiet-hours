# Pallas and the inventory puzzle (T3.10)

Pallas is a candidate companion (the Partner). Conversation: `content/dialogue/pallas.qdl`; she stands in the Safehouse.

## Trust (CMP-3/4)
One act moves it a full step, and it is always recoverable: asking "What do you want, Pallas?" and answering honestly raises it; dismissing her lowers it; an apology raises it back from the bottom; repairing her drive raises it. It is shown only as one line in her dialogue window.

## The single inventory puzzle (PUZ-2)
No special engine: recipes are services tagged `inventoryPuzzle: "pallas_repair"` and performed at Doc Perrin's bench (his "I need the bench" talk).

| Product | Made from | Ways to get each part |
|---|---|---|
| repaired drive | drive coupler + memory shard | coupler: the scrap pile in the Belt, or Brindle once freed (SQ-04). Shard: the archive racks in the Civic Core, or Doc Perrin (25 credits) |
| cargo tag | Form 12-C + permit stamp | form: the rack in the Civic Core, or Ines. Stamp: Dov's SQ-01 reward and the permit services |

`pnpm validate` enforces that exactly one inventory puzzle exists and that every part a recipe asks for can be given to the player somewhere.

## Practical requirement (CMP-5, used at the Gate in T3.11/T3.12)
`trust_gte pallas trusts` and flag `pallas_repaired` and flag `registered_as_cargo`. She will not take the tag unless she trusts you, and she is asked first. The complication on the way out (robots are scanned differently; she draws robot attention and cannot enter human-only areas) is added to the routes in T3.11.

Tests: `packages/sim-harness/test/pallas.test.ts`; the validator rules in `packages/content-tools/test/validate.test.ts`.
