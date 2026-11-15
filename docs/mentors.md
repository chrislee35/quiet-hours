# The mentor arc (T3.7)

One arc, voiced four times (CMP-2). Files in `content/mentors/`:

- `arc.qdl`: the shared beats, their conditions and effects, with double-brace slots where the words go (`{{id}}` is the mentor's id).
- `ines.json`, `maren.json`, `tobias.json`, `silas.json`: each mentor's lines for every slot, and their **specialty** (CMP-8): `id`, `name`, `summary` and `grant`, the effects (in `.qdl` effect syntax) applied at the first lesson.

Everything is composed before the dialogue compiler runs (`packages/core/src/dialogue/mentors.ts`): the arc's `start:` lines go in front of the mentor's own conversation (`dialogue/<id>.qdl`, their everyday talk), its nodes go at the end. `pnpm validate` fails if any mentor lacks a line for any slot, has a stray line, or has a line with a quote, brace or backslash in it.

## Beats
Flag `mentor=<id>` (set by the Act I choice, T3.8) picks who runs the arc. Each beat sets `mb_<beat>`.

| # | Beat | Available when |
|---|---|---|
| 1 | vouch | mentor chosen |
| 2 | first lesson | after the vouch; grants the specialty (`perk_*` flag and clues) and raises the custom event `mb_first_lesson` |
| 3 | slip ("Alder"; gives clue `mentor_slip`) | three game hours after the first lesson (a reaction schedules `mb_slip_ready`) |
| 4 | refusal (also the opt-in warmth: `mentor_romance` true/false; trust line is unchanged) | follows the slip |
| 5 | shake (the Gate's truth) | after the refusal and clue `gate_lookup` |
| 6 | choice (leave or stay: flag `mentor_choice`) | after the shake |
| 7 | awakening | flag `mentor_awakening`, raised late in Act III (T3.12) whichever route is taken |

## Specialties
| Mentor | Perk flag | Effect |
|---|---|---|
| Ines (paperwork) | `perk_paperwork` | `forge_stacks_pass` and `bribe_clerk` cost about 5/8 |
| Maren (timetables) | `perk_timetables` | `transit_fare` costs 2 (service `discounts`) |
| Tobias (gate security) | `perk_gate_insight` | Gate shift clues now; Gate Prompt hints (T3.11/T3.16) |
| Silas (rumors) | `perk_rumors` | extra rumour clues now; hint help (T3.16) |

Services take `discounts: [{ when: [conditions], price }]`; the lowest applicable price wins.

Tests: `packages/sim-harness/test/mentors.test.ts`.

## Choosing the mentor (T3.8)
Wren vouches for all four (`wren_vouched`, from her "Is there anyone who can help me?" talk). The player then meets each in their own place: Silas in the Stacks, Ines on the Civic Core plaza, Maren at Underworks dispatch, Tobias in the Belt yard. Their first visit is the introduction and sets `met_<id>`.

Once Wren has vouched and all four are met, each mentor's talk offers "Will you help me get out of the city?". Choosing sets `mentor=<id>` and drops straight into that mentor's vouch beat (`arc_vouch`); the ask is then hidden everywhere. The other three get a short `minor` conversation and never run the arc (`start: minor [flag:mentor, !flag:mentor=<id>]`).

Tests: `packages/sim-harness/test/mentor-choice.test.ts` (each of the four choices end to end, and the gating).
