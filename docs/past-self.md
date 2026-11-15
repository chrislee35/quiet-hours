# The past self (T3.9)

## Stance (PST-2, `packages/core/src/past.ts`)
Three explicit moments each set a flag to `embrace` or `reject`:

| Moment | Where | Flag |
|---|---|---|
| M1, the Checkpoint | Civic Core plaza: Checker K-9 still accepts the old insider credential (needs clue `checkpoint_credential`, from the checkpoint log or Pell) | `past_m1` |
| M2, the Recognition | Civic Core back office: Auditor Pell recognises you and offers help as the old self | `past_m2` |
| M3, the Prompt | the Gate (T3.11): the controller asks you to authenticate as the person who built it | `past_m3` |

Setting any of them refreshes the derived flags: `past_stance` (`embraced`, `rejected`; absent until a moment is chosen, which reads as undiscovered), `past_last` and `meridian_sees`. Majority wins; one of each is decided by the latest choice.

## Costs and shortcuts (PST-3)
- **Embrace:** the old credential (service `old_credential`: a level 2 auditor pass, so a record is on file and the null stall is gone), Pell's Gate knowledge (`gate_lookup`, `gate_three_ways`, `one_companion`, `mentor_record_severance`), and later the Gate prompt. The costs: `meridian_sees` keeps the alert from falling below Suspicious, Wren's trust drops (recoverable: "I am still the same person you took in"), and Pell reports what he is told.
- **Reject:** the player stays null, keeps the checker stall and null edge, and gets none of the shortcuts.

## Breadcrumbs (PST-1)
Six, each reachable from at least two directions (a conversation, a pickup, or a terminal). Clues carry a `breadcrumb:<name>` tag and `pnpm validate` counts the providers:

| Breadcrumb | Clue | Ways |
|---|---|---|
| band scratch | `band_scratch` | the wrist band (a pickup in the laundry), Pallas |
| cache key | `laundry_key` | the laundry chute, Silas |
| Pallas's log | `pallas_log_handle` | her console (cipher terminal `pallas_log`), Pallas herself |
| mentor slip | `mentor_slip` | any of the four mentors |
| Auditor's Ledger | `ledger_gate_line` | the archive (pickup in the back office), Pell |
| voice note | `hollow_voice_note` | Wren, Quill (Marrow joins with the Hollow) |

Tests: `packages/sim-harness/test/past.test.ts`; the one-direction error in `packages/content-tools/test/validate.test.ts`.
