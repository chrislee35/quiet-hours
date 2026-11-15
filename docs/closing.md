# The closing scene and the sequel card (T3.13)

Concept §9d. The game ends on one fixed scene, the same in every route; only the companion's identity and voice change.

| Beat | What it is |
|---|---|
| outside (x2) | Fixed narration: the Gate is behind you; quiet; the open horizon |
| gratitude | The companion thanks the player in their own voice. A mentor has a platonic and a romantic line, chosen by `mentor_romance` (mentor by default) |
| the turn | Always a variation on "...but I worry about the others. Can't we all be freed?" (June asks about the Hollow, Pallas about the other robots, Odile about the Lull, each mentor about their own people) |
| black | A held breath of black (about 2.6 s, shorter with reduced motion; Enter skips) |
| card | `QUIET HOURS: COUNTERSIGN`, *They got out. Now they're going back.*, "Coming soon". It stays; there is no choice and nothing after it |

If nobody came, the same five beats play with the protagonist speaking.

## Where it lives
- `content/closing/scene.json`: the fixed words and the card (working copy of title and tagline, easy to change).
- Each candidate's `closing` in `content/companions/companions.json`: `gratitude`, `gratitude_romantic` (required for mentors, validated) and `turn`.
- `packages/core/src/closing.ts`: `closingScene(flags, content)`, pure. It reads only `escapee`, `mentor_romance` and the companion's role: **never the sequel flags**, so what became of everyone else is not shown (END-4/5).
- `packages/client/src/ui/closing.ts`: plays it when the `escaped` event fires (or when a save made after crossing is loaded); Enter, Space or a click goes on; it takes the keys and pauses the game while it is up. Debug builds only: `?map=outside&closing=<who>&beat=<n>[&romance=1]` shows a beat for screenshots.

## Tests (`packages/sim-harness/test/closing.test.ts`)
For nobody and each of the seven candidates: the same five kinds of beat in the same order; the fixed parts are identical across variants and the voiced parts are all distinct; every turn ends "Can't we all be freed?"; romance changes only the gratitude and only for a mentor; the card is exactly title, tagline and "coming soon"; no variant contains epilogue wording (years later, meanwhile, what became of...); the fates of the others, the route and the past stance never change the scene; no variant says MERIDIAN falls or is shut down (END-5); and a real crossing yields the scene.
