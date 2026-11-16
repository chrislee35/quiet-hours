# Side-quests (T3.14, STORY §5)

Every side-quest is optional: no route out of the Gate asks for any (tested). Each is a quest entry (`content/quests/`), a goal for the tree (`content/goals/`) and some conversations, items, terminals or services. `packages/sim-harness/test/sidequests.test.ts` proves, for **every** quest: it is absent from the log before it starts, active when it starts and complete when it completes, with all its steps done; and for the ones that can fail, that failure shows and completion wins over it. The cross-map closure (`reachableFacts`) proves each completion flag can be set from a fresh start, because the per-map search is cut short on the big maps.

| SQ | Quest | Where | Status | How it ends |
|---|---|---|---|---|
| 01 | Lost in Processing | Civic Core, Dov | built (T3.4) | Free permit stamp, the Lull link; **fails** if Dov is arrested on day 3 |
| 02 | A Stitch in Time | Stacks, Mrs. Adeyemi-Roth | **built (T3.14)** | **Win her over** (a dull true report or a gift, then ask for her landing): `mrs_safe`, her reports stop. **Sell her out**: 40 credits, `mrs_sold`, `hollow_risk` (read by T4.5), she is gone. **Fails** if you threaten her (`mrs_threatened`); an apology revives it |
| 03 | Pump 4 Thermos | Belt, Gus | built (T3.5) | Power-node access, the shift-change clue |
| 04 | Brindle's Hum | Belt, Pallas | built (T3.5) | Pallas trust up, Brindle's distraction; **fails** on day 5 |
| 05 | Right on Time | Underworks, Quill | built (T3.6) | Permanent shortcut |
| 06 | Apology, Express | Underworks, the Conductor | built (T3.6) | Free train rides |
| 07 | Tomatoes | Hollow, Bede | **T4.4** (needs the Hollow) | Hollow safety, Marrow's consent for June |
| 08 | Table for One | Lull, Lila Voss | **built (T4.1)** | Bring Lila her lost diary (the Host gives it to a friend, or the staff drawer behind the door that opens 03:00-03:30) and a glass of clear water: she wakes (`lila_awake`), you learn the dulling is real and who Odile is. No failure |
| 09 | Statistic | Stacks, Doc Perrin | **built (T3.14)** | Perrin says Statistic is low: its partner **Anecdote** is in the Auditors' evidence cabinet in the Reintegration office (a lights-out hasp, or wire cutters). The cabinet is noticed (alert to Suspicious). Bring it home: **one more augment slot**. No failure |
| 10 | Pirate Hour | Stacks, Teeter | **built (T3.14)** | Route power through the radio rig (a power-routing puzzle), then play the song on the Civic Voice between 21:00 and 21:30 (a service with a time window, once): alert drops to Calm and, for a day (`pirate_calm`), a sighting cannot raise it above Suspicious. No failure |

## Engine added
- Effect `lower_alert_to` (never raises); `pirate_calm` caps alert escalation at Suspicious (`alert.ts`), cleared by a scheduled effect a day later.
- `reachableFacts` in the route checker, and reactions to a flag being set (and what they schedule) now count in the closure.
