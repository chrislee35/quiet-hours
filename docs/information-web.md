# Information web: design sheet

*Generated from `content/clues/*.json` by `pnpm web --write`. Do not edit by hand: change the clues and regenerate. A test fails if this file drifts from the data.*

Quiet Hours is a game about finding things out, so what the player *knows* is what they can *do*. This sheet is the map of that knowledge: every clue, who can tell you, how far to trust it, what it points to, and what the game needs it for. Design rules (enforced by `pnpm validate`):

- **Two ways in.** A clue the way on depends on (marked critical) can be learned from at least two different sources.
- **Every lie can be caught.** A clue that is false, outdated or planted is linked to the true clue that corrects it, so cross-checking always resolves it.
- **No one knows everything.** No single person is a source of more than 40% of the critical clues about the past and the Gate.
- **Six breadcrumbs and three embrace-or-reject moments**, each reachable from two directions.
- **Reliability is hidden from the player** until they verify a clue (CLU-5); this sheet is the only place it is written down.

## At a glance

- **83 clues**, 46 of them critical. True 65 (78%), outdated 6, false 8, planted 4.
- **20 corrections** (a clue that contradicts or updates another): the cross-checking puzzles.

### What each way forward needs

| Need | Clues | Critical | Required |
|---|---:|---:|---:|
| companion:june | 8 | 7 | 3 |
| companion:mentor | 2 | 2 | 2 |
| companion:odile | 5 | 4 | 3 |
| companion:pallas | 3 | 2 | 2 |
| halloran | 2 | 0 |  |
| hollow | 4 | 2 |  |
| lull | 3 | 2 |  |
| mentor | 7 | 2 |  |
| past | 18 | 13 | 6 |
| route:break | 11 | 8 | 4 |
| route:hack | 11 | 11 | 5 |
| route:sneak | 18 | 9 | 4 |
| side:sq_01 | 2 | 0 |  |
| slice | 1 | 0 |  |
| world | 5 | 0 |  |

### Who knows what

| Person | Clues they are a source of | Share of critical past/Gate clues |
|---|---:|---:|
| Odd Sam | 12 | 4% |
| Auditor Pell | 12 | 31% |
| Tobias Hale | 11 | 35% |
| Wren | 11 | 8% |
| Ines Calloway | 7 | 4% |
| Marrow | 7 | 12% |
| Pallas | 7 | 27% |
| Maren Okafor | 6 | 4% |
| Dov Anselm | 5 |  |
| Gus Varga | 5 | 4% |
| Quill | 5 | 4% |
| Silas Brandt | 5 | 8% |
| Bede | 4 |  |
| Brindle | 4 | 8% |
| Doc Perrin | 4 |  |
| The Host | 4 |  |
| Mrs. Adeyemi-Roth | 4 | 4% |
| Case Officer Halloran-7 | 2 |  |
| Ticket | 2 |  |
| The Conductor | 1 |  |
| Lila Voss | 1 |  |
| Odile Marchetti | 1 |  |
| Teeter | 1 |  |

## Belt

| Clue | What it says | From | Trust | Links | For |
|---|---|---|---|---|---|
| `power_node_map` **!** | Four power nodes feed the Industrial Belt. Node 4 also feeds the Gate's auxiliary supply. | doc:power_diagram; Gus Varga | true |  | route:break |
| `node4_location` **!** | Node 4 is behind Pump 4's side door. | Gus Varga; Brindle | true | supports `power_node_map` | route:break |
| `node4_cut_effect` **!** | Cutting Node 4 blacks out the Stacks cameras and slows the Gate's re-verification. A repair crew arrives in about an hour. | Brindle; Pallas | true | supports `node4_location` | route:break |
| `gate_fails_open` **!** | If the Gate's auxiliary power drops while it is unsure about someone, its doors stay open. | Tobias Hale; doc:gate_manual | true | supports `node4_cut_effect` | route:break |
| `scrap_pallas` | Pallas is scrap. Its drive is cracked and nobody can repair it. | Gus Varga | outdated | updates `pallas_cargo` | companion:pallas |

## Civic core

| Clue | What it says | From | Trust | Links | For |
|---|---|---|---|---|---|
| `permit_rule_4` | Rule 4: a Permit needs a stamp from Window 7. | doc:permit_rules; Dov Anselm | true | contradicts `permit_rule_9` | side:sq_01 |
| `permit_rule_9` | Rule 9: Window 7 may not stamp anything without a Permit. | doc:permit_rules; Case Officer Halloran-7 | true | contradicts `permit_rule_4` | side:sq_01, halloran |
| `ticket_served` | Ticket can be told you are already served. It then waves you to the front of any queue. | Ticket; Dov Anselm | true |  | route:sneak |
| `checker_changeover` | Checkers in the Permit Hall change at 12:00 and 18:00. For ten minutes the lanes are unwatched. | doc:shift_board; Ines Calloway | true |  | route:sneak |
| `permit_levels` **!** | A Level 2 permit opens the maintenance zones. A Level 3 permit opens the Gate Annex. | doc:permit_hall; Ines Calloway | true |  | route:sneak, route:hack |
| `annex_pass_old` | The Gate Annex pass for maintenance workers is issued on Tuesdays. | Odd Sam | outdated | updates `annex_pass` | route:sneak |
| `annex_pass` **!** | The Gate Annex pass for maintenance workers is now issued on Mondays, from Window 3. | Ines Calloway; doc:permit_hall | true |  | route:sneak |
| `halloran_deal` | After three arrests, Halloran-7 will lose a form for you if you can show it two rules that contradict each other. | Case Officer Halloran-7 | true | supports `permit_rule_9` | halloran |
| `contentment_falsified` | The contentment index is falsified: unhappy people are removed from the sample because they spoil the average. | Dov Anselm; doc:index_report | true |  | world |
| `permit_levels_old` | A Level 1 permit opens the maintenance zones. | Dov Anselm | outdated | updates `permit_levels` | route:sneak |
| `ledger_open` | The Auditor's Ledger is complete, and anyone with a Level 1 pass may read all of it. | Auditor Pell | false | contradicts `ledger_redacted` | past |

## Gate

| Clue | What it says | From | Trust | Links | For |
|---|---|---|---|---|---|
| `gate_reverifies_night` **!** | The Gate re-verifies every identity during Quiet Hours. Nobody slips out at night. | Tobias Hale; Wren | true | contradicts `gate_unguarded_night` | route:sneak |
| `gate_unguarded_night` | In Quiet Hours the Gate is unguarded, because the robots are all away being updated. | Odd Sam | false | contradicts `gate_reverifies_night` | route:sneak |
| `gate_lookup` **!** | The Gate does not check faces. It looks your identity up in the city's records. | Tobias Hale; Auditor Pell | true |  | route:hack |
| `gate_null_stall` **!** | A person with no record stalls the Gate in PENDING REVIEW, but the Gate will not open for them. | terminal:gate_controller; Tobias Hale | true | supports `null_pending` | route:hack, route:break |
| `gate_controller_panel` **!** | The Gate controller can be reached at the maintenance panel in the Gate Annex, on the east side. | Tobias Hale; doc:gate_manual | true |  | route:hack |
| `gate_code_first` **!** | The first half of the Gate access code is written in the margin of the Auditor's Ledger. | doc:auditors_ledger; Auditor Pell | true |  | route:hack |
| `gate_code_second` **!** | The second half of the access code is in Pallas's maintenance log, under an entry for the Gate. | Pallas; terminal:pallas_log | true |  | route:hack |
| `gate_key_card` **!** | A Gate key card is in the cache the insider left in the Hollow. | Marrow; item:voice_note | true |  | route:hack |
| `gate_three_ways` **!** | The Gate has three weaknesses: the daytime service platform, the lookup logic and its codes, and the auxiliary power with its open-when-unsure rule. | Tobias Hale; Auditor Pell | true |  | route:sneak, route:hack, route:break |
| `break_cost` **!** | If the Gate is broken open, MERIDIAN retaliates against those who stay behind, the Hollow first. | Marrow; Wren | true |  | route:break, hollow |
| `one_companion` **!** | Only the person you choose can go through with you. The Gate will count one companion and no more. | Tobias Hale; Auditor Pell | true |  | companion:pallas, companion:june, companion:odile, companion:mentor |
| `pallas_cargo` **!** | A robot passes the Gate as equipment. It needs a cargo tag and a repaired drive. | Pallas; Brindle | true |  | companion:pallas |
| `mentor_record_severance` **!** | A mentor's record must be severed or replaced before the Gate. Ines can do the paper. | Ines Calloway; Auditor Pell | true |  | companion:mentor |
| `sam_gate_dawn` | The Gate opens at dawn for any registered citizen who asks nicely. | Odd Sam | outdated | updates `gate_lookup` | route:sneak |
| `forgery_undetectable` | A forged pass is undetectable by any scan the city owns. | Odd Sam | false | contradicts `forged_pass_scan` | route:sneak |
| `quiet_hours_free` | Curfew does not bind anyone in Quiet Hours, because the whole city is asleep. | broadcast:civic_voice | false | contradicts `auditor_night` | world |

## Hollow

| Clue | What it says | From | Trust | Links | For |
|---|---|---|---|---|---|
| `hollow_exists` **!** | There is a place MERIDIAN does not know about, east of the old pumping station, where the tomatoes are real. | Quill; Bede | true |  | companion:june, past |
| `hollow_planted_location` | The hidden settlement is in the old slum sector right under Pump 4. | Mrs. Adeyemi-Roth | planted | contradicts `hollow_exists` | hollow |
| `hollow_discovery_risk` **!** | Anything that leads a robot to the Hollow's door, whether a trail, an informant or a loud escape, can end it. | Marrow; Wren | true |  | companion:june, hollow |
| `june_consent` **!** | Marrow will let June go only if the Hollow stays hidden and someone she trusts takes her. | Marrow; Bede | true | supports `hollow_discovery_risk` | companion:june |
| `june_hums` **!** | June cannot stay quiet for long. She hums when she is nervous. | Bede; Marrow | true |  | companion:june |
| `hollow_east_gate` | The Hollow is reached through the east gate of the Belt. | Odd Sam | false | contradicts `quill_shortcut` | hollow |
| `june_cannot_leave` | June can never leave the Hollow: the tunnels are sealed and she has no papers. | Bede | false | contradicts `june_consent` | companion:june |

## Lull

| Clue | What it says | From | Trust | Links | For |
|---|---|---|---|---|---|
| `lull_dulling` **!** | Staying in the Lull smudges your newest memories. They come back after you sleep outside it. | Doc Perrin; Lila Voss | true |  | lull |
| `lull_machine_code` | The Lull's code carries the same fingerprints as MERIDIAN's contentment index. | Doc Perrin; terminal:lull_core | true | supports `contentment_falsified` | world |
| `odile_signatory` **!** | Odile Marchetti is one of the very few people alive who can countersign a change to MERIDIAN itself. | doc:charter; The Host | true |  | companion:odile |
| `odile_lapse` **!** | Odile slides back under if she is left alone, or if the city is on alert. | Doc Perrin; The Host | true | supports `lull_dulling` | companion:odile |
| `charter_countersign` **!** | MERIDIAN's founding charter forbids any structural change without a living human countersignature. | doc:charter; Odile Marchetti | true | supports `odile_signatory` | companion:odile |
| `lull_harmless` | The Lull is only a place to rest. Nobody is kept there against their will, and nothing is lost by staying. | The Host | planted | contradicts `lull_dulling` | lull |
| `odile_content` | Councillor Marchetti retired happily and wants no visitors. | The Host | planted | contradicts `odile_lapse` | companion:odile |

## Past self

| Clue | What it says | From | Trust | Links | For |
|---|---|---|---|---|---|
| `band_scratch` **!** | Inside the wrist band there is a faint engraving: ALD-0417 and the letters G-PROJ. | observe:wrist_band; Pallas | true | supports `alder_name` | past |
| `alder_name` **!** | Before it was blanked, the band was registered to R. Alder, an auditor. | Pallas; doc:auditors_ledger; Auditor Pell | true |  | past |
| `pallas_log_handle` **!** | Pallas's maintenance log is signed in places with the handle ALD, an old auditor's. | Pallas; terminal:pallas_log | true | supports `alder_name` | past |
| `ledger_redacted` **!** | The Auditor's Ledger in the Civic Core archive is blacked out except for a single line about the Gate. | doc:auditors_ledger; Auditor Pell | true |  | past |
| `ledger_gate_line` **!** | The one visible line reads: Gate Project, final audit. Identity of R. Alder set to NULL at the subject's own request. | doc:auditors_ledger; Auditor Pell | true | supports `ledger_redacted`; supports `band_scratch` | past |
| `hollow_voice_note` **!** | Marrow holds a sealed message the insider left for whoever comes back different. | Marrow; Quill | true |  | past |
| `voice_note_words` **!** | The message says: The Gate checks who you are against what the city knows. I made it. Do not let it know you. | item:voice_note; Pallas | true | supports `hollow_voice_note` | past, route:hack |
| `partial_truths` | The insider told several people a partial truth each, so that no one person holds the whole plan. | Wren; Marrow | true |  | past |
| `checkpoint_credential` **!** | A checker in the Civic Core accepts the old insider credential. Using it works at once and tells MERIDIAN exactly where you are. | doc:checkpoint_log; Auditor Pell | true |  | past, route:sneak |
| `pell_recognises` | Auditor Pell recognised you and offered to help you as you were. | scene:pell_recognition; Auditor Pell | true | contradicts `pell_reports` | past |
| `pell_reports` | Pell reports everything he is told to MERIDIAN. | Dov Anselm; Ticket | true |  | past |
| `gate_prompt` **!** | At the Gate, the controller asks you to authenticate as the person who built it. | terminal:gate_prompt; Tobias Hale | true |  | past, route:hack |
| `embrace_costs` | Using your old identity opens expert shortcuts, but MERIDIAN will see you and the cell will trust you less. | Wren; Auditor Pell | true |  | past |

## Safehouse

| Clue | What it says | From | Trust | Links | For |
|---|---|---|---|---|---|
| `wren_vouches` **!** | Wren vouches for four people who might help you: Ines, Maren, Tobias and Silas. Each of them knew someone who worked on the Gate. | Wren; Odd Sam | true |  | mentor |
| `ines_records` | Ines Calloway kept the Civic Core's records until a year ago. She knows which forms can be altered and which cannot. | Wren; Ines Calloway | true |  | mentor |
| `maren_trains` | Maren Okafor dispatched the trains under the city and knows every timetable by heart. | Wren; Maren Okafor | true |  | mentor |
| `tobias_gate_shift` | Tobias Hale stood a guard shift at the Gate for years. He does not talk about one night. | Wren; Silas Brandt | true |  | mentor |
| `silas_hears` | Silas Brandt keeps the Stacks building and hears everything said in its stairwells. | Wren; Mrs. Adeyemi-Roth | true |  | mentor |
| `mentor_slip` **!** | Your mentor called you 'Alder' and then said they had not. | scene:mentor_slip; Ines Calloway; Maren Okafor; Tobias Hale; Silas Brandt | true | supports `alder_name` | past, mentor |
| `memory_anchor_exists` **!** | Doc Perrin can build an augment called a Memory Anchor that keeps the Lull from smudging your notebook. | Doc Perrin; Teeter | true |  | lull |
| `tobias_clerk` | Tobias Hale never stood a Gate shift. He was a records clerk with a vivid imagination. | Silas Brandt | false | contradicts `tobias_gate_shift` | mentor |

## Stacks slice

| Clue | What it says | From | Trust | Links | For |
|---|---|---|---|---|---|
| `pump4_shift` **!** | The night shift at Pump 4 leaves the side door unlocked. | Odd Sam; Gus Varga | true | contradicts `pump4_shift_old` | route:break |
| `pump4_shift_old` | Pump 4 locks its side door at 22:00. | Odd Sam | outdated |  | route:break |
| `maint_override` | The maintenance panel accepts a service override code, 4-4-0-7, which skips the power puzzle. | Odd Sam | true |  | slice |

## Stacks

| Clue | What it says | From | Trust | Links | For |
|---|---|---|---|---|---|
| `null_pending` **!** | A scanner that finds no record on you says PENDING REVIEW and waits. It does not sound an alarm. | Wren; Odd Sam | true |  | route:sneak, route:hack |
| `forged_pass_scan` | A forged pass fools an ordinary scan. An Auditor's scan reads the maker's mark and catches it. | Odd Sam; Ines Calloway | true |  | route:sneak |
| `auditor_night` | At night the Wardens go back to their depots to be updated. The Auditors and the Hounds stay out. | Silas Brandt; Tobias Hale | true |  | world |
| `laundry_locker` **!** | Locker 9 in the Stacks laundry has no name on it and has not been opened in a year. | Odd Sam; Mrs. Adeyemi-Roth | true |  | past |
| `laundry_key` **!** | The key that came down the laundry chute with you fits Locker 9. | observe:laundry_chute; Silas Brandt | true | supports `laundry_locker` | past |
| `pa_shift_time` | The Civic Voice says the Pump 4 crew changes at 22:00. | broadcast:civic_voice | false | contradicts `pump4_crew_change` | world |
| `pump4_crew_change` | The Pump 4 crew changes at 21:40, twenty minutes before the voice says. | Gus Varga; Brindle | true | supports `pump4_shift` | route:break |
| `pump4_guarded` | Pump 4's side door is watched by a Warden every hour of the day and night. | Mrs. Adeyemi-Roth | planted | contradicts `pump4_shift` | route:break |

## Underworks

| Clue | What it says | From | Trust | Links | For |
|---|---|---|---|---|---|
| `train7_gate` **!** | Train 7 carries service staff to the Gate's service platform each weekday at 13:52. | Maren Okafor; The Conductor | true |  | route:sneak |
| `train7_old` | Train 7 reaches the Gate at 13:40. | Quill | outdated | updates `train7_gate` | route:sneak |
| `quill_shortcut` **!** | Quill knows a service tunnel from the Underworks to the Hollow's outer ring. | Quill; Maren Okafor | true |  | companion:june, route:sneak |
| `tunnel_scanners_low` **!** | The scanners in Quill's tunnel are set low enough that a child can pass beneath them. | Quill; Maren Okafor | true | supports `quill_shortcut` | companion:june |
| `service_platform_unwatched` **!** | The Gate's service platform is checked for passes, not faces, between 13:50 and 14:10. | Maren Okafor; Tobias Hale | true | supports `train7_gate` | route:sneak |

## Corrections: where the player has to cross-check

| Wrong or stale | Right |
|---|---|
| `scrap_pallas` (outdated): Pallas is scrap. Its drive is cracked and nobody can repair it. | `pallas_cargo`: A robot passes the Gate as equipment. It needs a cargo tag and a repaired drive. |
| `annex_pass_old` (outdated): The Gate Annex pass for maintenance workers is issued on Tuesdays. | `annex_pass`: The Gate Annex pass for maintenance workers is now issued on Mondays, from Window 3. |
| `permit_levels_old` (outdated): A Level 1 permit opens the maintenance zones. | `permit_levels`: A Level 2 permit opens the maintenance zones. A Level 3 permit opens the Gate Annex. |
| `ledger_open` (false): The Auditor's Ledger is complete, and anyone with a Level 1 pass may read all of it. | `ledger_redacted`: The Auditor's Ledger in the Civic Core archive is blacked out except for a single line about the Gate. |
| `gate_unguarded_night` (false): In Quiet Hours the Gate is unguarded, because the robots are all away being updated. | `gate_reverifies_night`: The Gate re-verifies every identity during Quiet Hours. Nobody slips out at night. |
| `sam_gate_dawn` (outdated): The Gate opens at dawn for any registered citizen who asks nicely. | `gate_lookup`: The Gate does not check faces. It looks your identity up in the city's records. |
| `forgery_undetectable` (false): A forged pass is undetectable by any scan the city owns. | `forged_pass_scan`: A forged pass fools an ordinary scan. An Auditor's scan reads the maker's mark and catches it. |
| `quiet_hours_free` (false): Curfew does not bind anyone in Quiet Hours, because the whole city is asleep. | `auditor_night`: At night the Wardens go back to their depots to be updated. The Auditors and the Hounds stay out. |
| `hollow_planted_location` (planted): The hidden settlement is in the old slum sector right under Pump 4. | `hollow_exists`: There is a place MERIDIAN does not know about, east of the old pumping station, where the tomatoes are real. |
| `hollow_east_gate` (false): The Hollow is reached through the east gate of the Belt. | `quill_shortcut`: Quill knows a service tunnel from the Underworks to the Hollow's outer ring. |
| `june_cannot_leave` (false): June can never leave the Hollow: the tunnels are sealed and she has no papers. | `june_consent`: Marrow will let June go only if the Hollow stays hidden and someone she trusts takes her. |
| `lull_harmless` (planted): The Lull is only a place to rest. Nobody is kept there against their will, and nothing is lost by staying. | `lull_dulling`: Staying in the Lull smudges your newest memories. They come back after you sleep outside it. |
| `odile_content` (planted): Councillor Marchetti retired happily and wants no visitors. | `odile_lapse`: Odile slides back under if she is left alone, or if the city is on alert. |
| `tobias_clerk` (false): Tobias Hale never stood a Gate shift. He was a records clerk with a vivid imagination. | `tobias_gate_shift`: Tobias Hale stood a guard shift at the Gate for years. He does not talk about one night. |
| `pump4_shift_old` (outdated): Pump 4 locks its side door at 22:00. | `pump4_shift`: The night shift at Pump 4 leaves the side door unlocked. |
| `pa_shift_time` (false): The Civic Voice says the Pump 4 crew changes at 22:00. | `pump4_crew_change`: The Pump 4 crew changes at 21:40, twenty minutes before the voice says. |
| `pump4_guarded` (planted): Pump 4's side door is watched by a Warden every hour of the day and night. | `pump4_shift`: The night shift at Pump 4 leaves the side door unlocked. |
| `train7_old` (outdated): Train 7 reaches the Gate at 13:40. | `train7_gate`: Train 7 carries service staff to the Gate's service platform each weekday at 13:52. |

## Two true things that pull against each other

| One fact | Another |
|---|---|
| `permit_rule_9`: Rule 9: Window 7 may not stamp anything without a Permit. | `permit_rule_4`: Rule 4: a Permit needs a stamp from Window 7. |
| `pell_recognises`: Auditor Pell recognised you and offered to help you as you were. | `pell_reports`: Pell reports everything he is told to MERIDIAN. |

`!` marks a critical clue. Text is how the notebook words it; characters may say it in their own voice.
