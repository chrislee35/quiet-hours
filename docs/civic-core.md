# The Civic Core (T3.4)

Government offices and clean plazas. Its signature rules (WLD-2) are **ID scanners and queue-based checkpoints, forms and permits** (ECO-4): systems whose rules interact, which is where the information puzzles live.

## Getting there: travel between maps
The game now spans several maps. A map object of class `exit` (`to`, `spawn`, `label`, optional `fare`) is a way to another map.
- **The tram** (Stacks plaza, and back from the Civic plaza) costs a fare, 5 credits. The fare is a **service**, so the null state is refused with "PENDING REVIEW" and stays where it is (ECO-3).
- **The service tunnel** (in the Stacks' maintenance wing, behind the panel in the plaza) needs no ticket and emerges behind the Permit Hall's counters. Two ways, again.
Maps you leave are remembered as they stand (doors, robots, cameras, people) and restored when you return; flags, clues, items and everything else are the one game. Saves record which map you are on and the maps you have left. `?map=civic` starts the client in the Civic Core.

## The Permit Hall
- **Civic plaza** (public, curfew): a Warden patrols by day; an Auditor takes the hall at night. Two **Checkers** guard the hall's door and **step away for ten minutes at 12:00 and 18:00** (`activeWhen: "!time:12:00-12:10,18:00-18:10"`, which the roster syntax now allows: several windows, comma separated). The shift board in the plaza says so.
- **Permit Hall:** the queue, Windows 1, 4 and 7 (hatches in the counter), notice boards, form racks and a permit chart. Behind the counters is a staff strip (restricted, level 1).
- **Ticket** hands out numbers, always off by one in your favour. Tell him you have already been served and he gives a slip every window honours once, and none can say why.

## The rules, as data
All in `content/services/civic.json`, so a refusal always says which rule you broke:
| Window | What | Needs |
|---|---|---|
| 1, Forms | Form 12-B, the Application for Application (2 credits) | a number, a record, 08:00-17:00 |
| 4, Appeals | Form 12-B(i), the appeal | a Form 12-B, a number, a record, 09:00-12:00 or 13:00-16:00, *before* the form is stamped |
| 7, Dov | stamp under protest | the form and the appeal receipt, a number, 10:00-15:00 |
| 7 | level 1 permit | the stamp. It **opens a file on you**: the end of the null state |
| 7 | level 2 permit (40 credits) | a level 1 permit; opens the maintenance zones |
A number or the already-served slip is used up by every window. Hours are real clock time (one minute a second).

## SQ-01 Lost in Processing
Dov Anselm's sister Marta was moved to the Lull four years ago, and bringing her file home needs a permit that needs his stamp that he may not give. **Rule 4** says a permit needs a stamp from Window 7. **Rule 9** says Window 7 may not stamp without a permit. A form stamped *under protest* counts as stamped and not stamped, so it satisfies both. Two ways through (PUZ-1):
1. **Paperwork, in order:** Form 12-B at Window 1, the appeal at Window 4 before it is stamped, both to Dov. Needs a record and the hours.
2. **Show him the contradiction:** read Rule 4 and Rule 9 off the two notice boards and present either to Dov. He is delighted, trusts you (one step, with its cause logged), and will stamp under protest. This works for someone with no record at all.
Reward: a Window 7 stamp, the clue that Dov's sister is in the Lull (the link to the Lull arc), and Dov's gratitude. **If you skip it**, on the morning of day 3 Dov is arrested for kindness: his window shows a note, the quest fails, and the city's contentment dips.

## For authors
- `exit` objects, multi-window `activeWhen`, and `any: [time_between, has_item]` conditions are all you need to build another queue.
- The solvability checker found a real soft lock while this was being written (leaving Dov's first conversation without asking about his sister made the quest unstartable); it is fixed and the checker proves the goal reachable. The checker still treats each map on its own, starting each at its spawn with the starting kit; whole-game reachability across maps arrives with the Gate (T3.11).
