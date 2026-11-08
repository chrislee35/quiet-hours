# Writing dialogue (`.qdl`)

One file per conversation in `content/dialogue/<id>.qdl`. `pnpm validate` compiles every file and reports errors with line numbers; the game compiles the same files at startup. A full example: `content/dialogue/odd_sam.qdl`.

```
// Full-line comments start with //
npc: odd_sam                 // required: the npc id (must exist in content/npcs)
name: Odd Sam                // optional display name (default: the id, capitalised)
trust: yes                   // optional: show the trust status line (only for escape candidates)
start: return_visit [flag:met_sam]   // first start whose conditions hold is used
start: first_meeting                 // the last start must have no conditions

node: first_meeting
  on_enter: {flag:met_sam}                       // effects applied when the node is entered
  odd_sam (wry): "Spoken text, with an optional (mood) for the portrait."
  you: "Other speakers are allowed too; the npc's own lines drive the portrait mood."
  > "A player choice." -> next_node
  > [clue:pump4_shift] "Only shown if the player has this clue." -> pump4
  > [credits>=20] "Buy it." {-credits:20, +clue:pump4_shift(odd_sam)} -> sold
  > "Leave it." -> end                           // `-> end` finishes the conversation

node: show
  odd_sam: "Let me see it."
  present:                                       // lets the player show a notebook clue
    pump4_shift [reliability:true, !verified:pump4_shift] {verify:pump4_shift, +credits:15} -> confirmed
    pump4_shift_old [reliability:outdated] {disprove:pump4_shift_old} -> stale
    * -> shrug                                   // required unconditional fallback
  > "Never mind." -> return_visit

node: goodbye
  odd_sam: "Bye."
  end                                            // a plain "Leave" button; a node needs choices or `end`
```

## Conditions `[a, b, ...]` (all must hold)
Prefix any with `!` to negate.

| Written | Meaning |
|---|---|
| `clue:ID` | the player has the clue |
| `verified:ID` / `disproved:ID` / `unverified:ID` | the clue's status |
| `flag:ID` / `flag:ID=VALUE` | flag set / equals (`true`, `false`, a number, or a word) |
| `item:ID` / `item:ID>=N` | holds the item (at least N) |
| `credits>=N` | at least N credits |
| `trust:NPC>=trusts` | trust at least `distrusts`, `unsure` or `trusts` |
| `pass:ID` | the player holds a pass with this id (whether it is valid is the resolver's business) |
| `alert>=N` | alert level 0 Calm, 1 Suspicious, 2 Hunting, 3 Lockdown |
| `arrests>=N` | arrested at least N times |
| `time:HH:MM-HH:MM` | game time in the window (may wrap midnight) |
| `reliability:true\|false\|outdated\|planted` | **only in `present:` reactions**: the presented clue's true reliability, which the player cannot see |

## Effects `{a, b, ...}`
| Written | Meaning |
|---|---|
| `+clue:ID` / `+clue:ID(source)` | give a clue (source defaults to this npc) |
| `verify:ID` / `disprove:ID` | mark a known clue verified / disproved |
| `flag:ID` / `flag:ID=VALUE` | set a flag |
| `+item:ID` / `+item:ID*N` / `-item:ID*N` | add or remove items |
| `+credits:N` / `-credits:N` | add or remove credits (never below 0) |
| `trust:NPC+1` / `trust:NPC-1` | move trust one step (clamped; always recoverable) |
| `-pass:ID` | take a pass away (granting passes is done in terminal `onSolve` or service definitions, which can set levels, zones, expiry and origin) |
| `alert:N` | raise the alert to at least N |
| `emit:NAME` | raise a custom event for scripted content |

## Rules the compiler enforces
- No dead ends: every node has a choice or `end`.
- No possible soft locks: a node must have a choice with no conditions, or `end`, so something is always visible.
- Every `goto`/`start` target exists, and every node is reachable.
- Every `present:` block has an unconditional `* -> node` fallback.
- Clue and NPC ids must exist in `content/`.
- Across all files (`pnpm validate`): a conversation gated on a clue that no conversation gives, and that is not sourced from a terminal or document, is an error.

## Notes for writers
- While a conversation is open the world is frozen.
- Choices whose conditions fail are **hidden**, not greyed out; that is how the player learns what a clue unlocks.
- Reliability is hidden from the player. Use `reliability:` reactions to have an NPC judge a clue, and `verify:`/`disprove:` to record the verdict in the notebook.
- Trust is never shown as a number. NPCs with `trust: yes` show one of three sentences.
- The text must be in double quotes (escape quotes as `\"`).
