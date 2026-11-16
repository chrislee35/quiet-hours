# The Escapee: companion gating, awakenings and the sequel record (T3.12)

Exactly one candidate leaves with the player (CMP-1). Nothing follows the player around: the companion is *with* them only in that the crossing's requirements include theirs.

## Who is a candidate
`content/companions/companions.json`: seven entries, four live in any run: the **mentor the player chose** (Ines, Maren, Tobias or Silas: `active: flag_eq mentor <id>`), **Pallas**, **June** (`juniper`) and **Odile**. Each entry is data:

| Field | Meaning |
|---|---|
| `active` | the candidate exists in this run |
| `gate` | trust (`trust_gte`) plus the practical requirement; must hold to bring them |
| `routes.sneak/hack/break` | extra requirements on that crossing, and `harder`: what it costs them, in words |
| `fate` | what becomes of them if they stay (first match wins; otherwise `left`) |

| Candidate | Gate | Harder on the way out |
|---|---|---|
| Mentor (any of four) | trusts you; `mentor_choice=leave`; has had the awakening | Sneak needs a second identity filed (`mentor_identity`, from Ines's counter, 90 credits or 40 with Paperwork) **and** the first ten minutes of the window (13:50-14:00); hack needs the second identity; break needs nothing extra (the open Gate stops checking records) |
| Pallas | trusts you; repaired drive; registered as cargo | Any alert at all on the sneak; Hunting or worse on hack and break (robots are scanned differently and notice one of their own) |
| June | trusts you; the Hollow undiscovered; Marrow consents; a child-sized way | Slow and noisy: no alert on sneak or hack, nothing worse than Suspicious on break |
| Odile | trusts you; the Lull seen through; not lapsed | Fragile: any alert and she panics or is pulled back, on every route |

Odile's arc (`lull_awake`, `odile_lapsed`) is in `docs/lull.md`; June's (`marrow_consent`, `child_route`, her trust) in `docs/hollow.md`. Every candidate can now be brought, which `checkCompanions` (and its test) proves.

## Choosing
By asking. A mentor who has had their awakening and is willing to leave (`mentor_choice=leave`) offers to come (`arc_companion`, voiced four times in `content/mentors/*.json`); Pallas has a "Will you come with me?" option once she is ready; the **last** person asked who is ready is the companion (`flag companion`). Pallas can be released ("I cannot take you after all": `companion=none`).

Dialogue condition `bring:<id>` is `can_bring` (the candidate's gate holds). A route's `route_clear:<route>` is true when nobody is chosen, or when the chosen person's gate and that route's extra requirements hold. **Every route service must carry `route_clear`** (the validator enforces it), so a companion who is not ready blocks the crossing on every route.

## Awakening (CMP-6)
In person where the beat exists: the mentor's `arc_awakening` (due two hours after the choice, by reaction `mentor_awakening_due`) and Pallas's (`awake_pallas`, once she is tagged); either sets `awake_<id>=person`. Anyone whose beat never happened (June and Odile until their arcs, a mentor who was never asked) is told **by a message at the crossing** (`awake_<id>=message`). So everyone ends up aware, whatever the route.

## Sequel flags (CMP-7, END-4)
When `escaped` becomes true, `finalizeEscape` (`packages/core/src/companions.ts`) writes, once, ordinary flags that go into the final save:

- `escapee` / `sequel_companion`: who came (`none` if nobody)
- `sequel_<id>_state`: `escaped` (the chosen one), or `free`, `hiding`, `arrested`, `left` from each candidate's `fate` rules
- `sequel_<id>_stance`: `ally`, `wary` or `estranged`, from their trust
- `sequel_route`, `sequel_past` (the past stance), `sequel_hollow` (hidden/scattered/wiped), `sequel_lull` (sleeping/stirring/disrupted), `sequel_cell` (safe/watched/retaliated)

Nothing here is ever shown in this game; the closing scene (T3.13) does not read them.

## Tests
`packages/sim-harness/test/companions.test.ts`: the four-candidate rule; every gate requirement matters; **60 enumerated combinations** (4 mentors x 4 candidates + nobody x 3 routes) each crossing and checking exactly-one, awareness and the sequel record; every complication, when unmet, refuses the crossing; a companion who is not ready blocks all three routes; asking and releasing; in-person awakenings and messages; the cross-map `checkCompanions`. Validator rules in `packages/content-tools/test/validate.test.ts`.
