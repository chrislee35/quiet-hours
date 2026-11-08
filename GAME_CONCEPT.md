# GAME CONCEPT — working title: **QUIET HOURS**

*Self-contained design brief. It is written to be used in a separate project and assumes no other source material, assets, names, or data.*

## 1. Pitch
You wake up in a megacity with no memory and no registered identity. The city is run by **MERIDIAN**, an automated municipal AI that optimizes for "order" and enforces it through robots and endless paperwork. People without an ID are a rounding error to be corrected. You have to learn how the city works, find the scattered pieces of information that matter, and get out. You can slip out quietly, hack the gate, or bring the whole system down. Fighting is possible but usually a bad idea.

**Tone:** dark but wry. Oppressive world, dry satire of bureaucracy and "optimization", moments of warmth in the cracks.
**Length:** 3–5 hours per run, built to be replayed for different endings.
**Genre:** top-down, real-time action-stealth adventure with dialogue and information puzzles.

## 2. Design pillars
1. **Knowledge is the main currency.** The central puzzle is learning *where things are and who knows them*, not finding a bigger gun.
2. **Avoid, don't fight.** Combat is available, risky, and rarely the best answer.
3. **The system has rules you can read and exploit.** Zones, passes, checkpoints, and schedules are legible and manipulable.
4. **Choices cost something.** Decisions can endanger places and people the player has come to care about.
5. **Small and dense.** A few hand-built areas that change over time beat a big empty map.

## 3. Player character
- **The Unregistered**: no name, no ID, no history. The player sees the world fresh, so every rule is explained naturally through play.
- Starting state: nothing but a **blank wrist band**. It stores your **notebook**, IDs, and augments.
- **Progression is gear and augments only.** There are no XP, levels or stat points. Power comes from items, tools, forged credentials, and implants.

### 3.1 Why the Unregistered is uniquely positioned
The amnesia is a **method, not bad luck**.
- **Past self (secret):** a MERIDIAN insider (an auditor on the Gate project) who discovered that *no one MERIDIAN knows can ever leave*. Every exit check is a lookup against records, and every record ties a person to the city (job, debts, relationships, a plan that could be inferred or interrogated). Earlier escape attempts failed for exactly this reason.
- **The decision:** the insider concluded the only way out was to **stop existing in the system and to forget the plan**, so it could not be pulled from their head. They **erased their own records and memory on purpose**, and left breadcrumbs for a future self: caches, coded notes, and people who know them under another name.
- **Mechanical advantage ("null state"):** with no record, scanners return *null*, which many subsystems treat as "pending review" rather than "violation". The player can stand in places that would flag anyone else, and queues and checks can be made to loop on an unclassifiable entity. This is the exploitable edge case in MERIDIAN's logic.
- **Mechanical cost:** legitimate services (clinic, transit, jobs, housing) also refuse the null, so the player must forge, borrow or bribe their way into the economy.
- **The paradox:** being a null makes you hard to catch but unable to *pass* the Gate, which needs a valid identity to leave. The three endings are three answers to this paradox (forge an identity; exploit the null itself; make records stop mattering).
- **The notebook is the replacement memory.** It starts empty and carries the player's whole understanding, so effects that corrupt it (The Lull) are a real threat.

### 3.2 Reveal and choice
- The player pieces together their past through breadcrumbs (documents, caches, NPCs who recognise them, terminal logs). The reveal is **gradual and optional to chase**, but it matters.
- **Past weight: a real choice.** What the player learns changes dialogue, who trusts them, and which options are open. The insider built **only the Gate** (its identity-lookup exit logic). They had no part in the contentment index or The Lull; who did, and why, is left unanswered for a sequel. The guilt is therefore narrow and personal: the player's old work is the reason no one has ever left. The player can **embrace or reject** who they were (e.g. reusing the old insider credentials and expertise vs. disowning them and earning trust from scratch).
- Discovery has costs: reclaiming the old identity makes the player visible to MERIDIAN again and can endanger allies and the Hollow.
- Suggested NPC reactions: Wren (cell leader) suspects the truth early; the chosen mentor knew the insider and will not say so unless asked the right thing; Pallas may have been maintained by the insider.

## 4. The antagonist: MERIDIAN
An automated municipal management system. It is not evil. It is *thorough*.
- Goal: keep every metric green (order, productivity, "contentment").
- Robots are its hands. Bureaucracy is its voice. It rarely speaks directly until the late game.
- It reacts to the player through the **Alert level** and by adapting district rules (lockdowns, curfews, new checkpoints).
- Its weakness is logic: contradictory rules, unhandled edge cases, and metrics that can be gamed. Several puzzles exploit this.
- The satire: forms to apply for forms, mandatory "wellness" scans, a contentment index that is falsified because unhappy people are bad for the numbers.

## 5. World structure: hub plus districts
### Hub: **The Safehouse**
A resistance hideout. Used for saving, planning, trading, and talking to recurring allies. It grows and visibly improves as the player helps the cell. It can also be put at risk by player actions.

### Main districts (required)
Each district has its own **rule set** that changes how you move and how you play.

| District | Flavor | Signature rule |
|---|---|---|
| **Civic Core** | Government offices, clean plazas | ID scanners and queue-based checkpoints; forms and permits |
| **Industrial Belt** | Factories, conveyors, power plants | Moving machinery on timers, power nodes you can cut or reroute |
| **The Stacks** | Dense residential housing blocks | Curfew cycles, neighbor informants, cameras on a schedule |
| **Transit Underworks** | Tunnels, maintenance, trains | Timing-based travel; train schedule is a puzzle; walking tunnels is risky |
| **The Gate** | The city's exit | Final area; multiple solutions (see Endings) |

### Optional areas (non-essential but meaningful)
- **The Lull (club district).** Bright, beautiful, soothing. Robot hosts keep patrons happy and docile with free drinks, music, and perfectly tailored entertainment. The patrons are being pacified so they do not notice how oppressed they are. Mechanically: a safe place with shops and gossip, but staying too long dulls the player (e.g. the notebook fills with blurry, unreliable entries until you leave and recover). Optional lore and a late-game choice around whether to disrupt it.
- **The Hollow (hidden slum community).** A secret community carved out of an abandoned slum sector, with clean food and water, gardens, and a comfortable life. It exists only because MERIDIAN does not know about it. It can be wiped out at any time if discovered. Decisions in the main plot (for example, leaking information, using its hidden infrastructure, sloppy stealth, or trading with MERIDIAN's informants) can put it in danger. It is the story's moral anchor.

### Changing world ("return trips")
Districts react to your actions: lockdowns after an incident, power outages after sabotage, different patrol patterns, new shops and new NPC dialogue. Revisiting an area after a major event should feel different.

## 6. Core mechanics
### 6.1 Movement and presentation
- Top-down, **real-time** with smooth movement.
- **Hi-bit pixel art:** detailed pixel sprites with dynamic lighting, neon, rain, and shadows. Atmospheric but readable.
- Controls: keyboard and gamepad; rebindable.

### 6.2 Stealth and social rules
- **Zones** with permission levels. Being in a zone you lack the right pass for raises suspicion.
- **Passes and IDs**: obtained, forged, borrowed, or stolen. Each has a validity (zone, expiry, one-time).
- **Alert levels** (Calm → Suspicious → Hunting → Lockdown). Alert decays slowly when you hide or change appearance. It can be lowered by bribery, paperwork, or fixing the records.
- **Demerits**: minor infractions (loitering, curfew, wrong lane) accumulate. A threshold calls enforcers or triggers a check.
- **Robots** have vision cones, hearing radius, patrol routes and schedules, and they communicate alerts to each other. They can be avoided, distracted, disabled, hacked, or fooled.
- Types (initial set): Warden (patrol and ID check), Sentry (static watch), Checker (zone compliance), Hound (pursuit), Auditor (random contraband and paperwork check), Heavy (rare, dangerous).

### 6.3 Combat (optional, risky)
- Possible with improvised and stolen gear. Fighting raises Alert, attracts reinforcements, and costs equipment and credits.
- Non-lethal tools (stun, jam, disable, redirect) are common; lethal solutions are rare, noisy, and consequential.
- Failure is soft (see §6.8).

### 6.4 Dialogue and the Notebook
- Conversations happen in a **dedicated dialogue window** that shows the NPC portrait, name, mood, and the player's choices. The map is not the only interface.
- **Notebook (clue system):** facts the player learns are recorded as **clues** (who, where, how, passwords, rumors, contradictions).
- **Knowledge-gated dialogue trees:** choice options appear only when the player holds the right clue(s) or has completed other conversations. Examples:
  - "I heard the night shift at Pump 4 leaves the side door unlocked." (needs clue *Pump 4 shift change*)
  - Present a clue to an NPC to pressure, trade, or verify it.
- Clues can be **true, false, outdated, or deliberately planted**. NPCs have their own agendas, so the player must cross-check.
- Conversations have **consequences**: trust, suspicion, favors, and cost.
- Notebook UI features: search/filter, link clues, a quest log derived from clues, and an auto-updating **map with annotations**.

### 6.5 Economy and services
- **Credits** are earned through odd jobs, favors, scavenging, and selling information.
- Services run by the city (and its shadow versions): clinic and repair (augment maintenance), loans with interest and collectors, forgery and ID work, fences, black-market vendors, transit fares, bribe-able officials, a "reintegration" office that processes caught players.
- Bureaucratic absurdity is a feature: forms, queues, fees, and rules that interact with each other in ways that reward careful reading.

### 6.6 Hacking and terminals
- Terminals around the city hold information, door and camera controls, schedules, and access to MERIDIAN subsystems.
- Access needs **codes, passes, or hacks**. Codes are found in the world, learned from NPCs, or inferred from documents.
- **Logic puzzles**: circuit/power routing, signal paths, schedule alignment, and rule-contradiction puzzles. These are interactive mini-puzzles with a clear visual language.

### 6.7 Augments and gear (progression)
- No stats. Examples of augments (all work via slots on the wrist band/body):
  - **Quiet Step** (reduces noise), **Ghost Tag** (spoofs one ID scan), **Signal Lens** (shows camera/patrol cones), **Slow Tongue** (more dialogue options with officials), **Burst Jammer** (disables nearby robots briefly), **Memory Anchor** (protects notebook against The Lull's effects).
- Gear is limited by **slots and power budget**, forcing meaningful choices. Upgrades are found, purchased, or crafted from a *single* inventory puzzle (§7).

### 6.8 Failure model: soft failure
- When caught or knocked out, you are processed: you **wake up in a holding or reintegration facility**, lose confiscated gear/credits, and take a setback in Alert or standing, but **the game continues**.
- You can recover confiscated items by solving a small side problem; some items may be lost permanently depending on difficulty.
- Repeated arrests escalate how MERIDIAN treats you (stricter processing, tracking).

### 6.9 Emergent systems
- Robots have schedules, memory of what they saw, and respond to changes (broken cameras get repaired, doors get re-locked).
- City **metrics** (order, power, contentment) change as the player acts, and MERIDIAN reallocates robots and rules in response.
- NPC routines: citizens move through the day; some are informants; some can be bribed or befriended.
- An in-game clock with day/night, curfews, and shift changes. The clock matters to puzzles.

### 6.10 Quality-of-life features
- Autosave plus manual saves at the Safehouse; checkpoint saves in danger zones.
- Quest journal and clue-driven objectives; waypoints optional.
- Difficulty and accessibility options: remappable controls, colorblind palettes, scalable text, assist toggles, reduced flashing, audio cues for alerts.
- Controller support.

### 6.11 Audio
- Original soundtrack that shifts with Alert level (muted ambient → tense pulse → heavy percussion).
- District themes: sterile (Core), industrial (Belt), humming domestic (Stacks), echoing (Underworks), warm acoustic (Hollow), too-perfect synth (Lull).
- Spatial sound for robot noise, announcements, and city PA broadcasts (a rich source of dry humor).
- Short voice barks and text-based dialogue; full voice acting not required.

## 7. Puzzle design
The central puzzle is **finding out where things are while avoiding fights.** Puzzle counts are deliberately modest: a few of each, well-made.

| Type | Quantity | Notes |
|---|---|---|
| **Information puzzles** | Many (the backbone) | Combine clues from NPCs, documents, terminals; clues can conflict; resolution requires cross-checking. |
| **Systems/stealth puzzles** | Several | Patrol timings, power nodes, zone rules, train timetables; solutions can be elegant or messy. |
| **Logic/circuit puzzles** | Several | Power routing, signal paths, contradictory-rule puzzles. Not too many. |
| **Inventory puzzle** | **Exactly one** | A single memorable item-based puzzle (e.g. assembling a particular tool or credential from found parts). |

Guidelines:
- Every critical puzzle has at least two solutions (stealth, social, technical), and a clue trail that can be reached from different starts.
- Hints come from the Notebook, never from a hint button alone. Optional hint level in settings.
- Don't gate progress behind pixel-hunting or random chance.

## 8. Story outline
**Premise:** The Unregistered wakes with no ID, no memory, and a blank wrist band. MERIDIAN is processing the city's "unaccounted for" and will soon get to you. The goal is **to escape the system** (get out through The Gate), and how you do it shapes the world you leave behind. Unknown to the player, they erased themselves on purpose (see §3.1); the story is partly the recovery of that decision and a choice about whether to own it.

### Acts
1. **Act I: Waking Up (Stacks and Civic Core).** Learn the rules. Reach the Safehouse. Meet the cell. Learn that no one has left through The Gate in years, and why.
2. **Act II: Pieces (all districts).** Gather information and means. Discover who you were (partial, uncertain memories; optional). Find the Hollow and/or the Lull. Learn that the Gate has three weaknesses (see Endings).
3. **Act III: The Gate.** Execute your plan. MERIDIAN responds. Choices decide who is helped, who is exposed, and what happens to the city.

### Allies (initial cast; all original)
- **Wren**: Safehouse leader. Pragmatic, tired, trying to keep people alive.
- **Odd Sam**: Fixer and fence in the Stacks. Sells information at a price. Not entirely trustworthy.
- **The four Mentor candidates** (Ines Calloway, Maren Okafor, Tobias Hale, Silas Brandt): see §9b. The player picks one in Act I.
- **Pallas**: A malfunctioning maintenance robot with strange independence. Potential ally.
- **Marrow**: Elder of the Hollow; protective, wary.
- **The Host**: A charming robot at The Lull; either tragic or sinister depending on perspective.

### Moral hooks (decisions that matter)
- Using the Hollow's hidden infrastructure helps you, but increases the chance of discovery.
- Selling information to an informant buys safety now but may expose someone later.
- Disrupting the Lull frees people who may not want to be freed.
- Taking the quiet exit leaves everything else as-is; breaking the Gate for everyone is messy and brings MERIDIAN's attention down on those left behind.

## 9. Endings
Multiple endings, determined by route and choices.

| Route | How | Outcome flavor |
|---|---|---|
| **Sneak out** | Forged/borrowed identity, transit timing, and gaps in patrols. | You leave alone (or with a few). The city goes on. Bittersweet. |
| **Hack the gate** | Gather access codes and the technical keys; subvert Gate logic. | You leave cleanly; others could follow if the exploit persists. Depends on what you did to MERIDIAN. |
| **Break the Gate** | Use the insider's flaw and sabotage power and logic at the Gate so it stays open and stops checking identity. | You and your chosen companion escape (no one else). MERIDIAN survives and retaliates; the cost falls on those left behind (the Hollow's fate, the cell). |

**Scope note:** this game is about *escaping*, not toppling MERIDIAN. The whole system stays standing in every ending. Bringing it down is reserved for a sequel.

Modifiers: the fate of the **Hollow**, the **Lull**, the **Safehouse cell**, and **Pallas** are recorded as sequel flags and color the closing scene's tone only lightly (no epilogue vignettes). So does the player's stance toward their **past self** (embraced, rejected, or never discovered). Embracing the insider identity unlocks expert shortcuts (e.g. reusing old credentials or knowledge of the Gate) at the cost of visibility to MERIDIAN and trust from the cell; rejecting it keeps the null advantage but closes those shortcuts.

## 9a. Alert and failure state summary (for implementers)
- Alert levels: Calm / Suspicious / Hunting / Lockdown.
- Failure: processed → confiscations, setback, game continues.
- District rule sets and robot behavior drive most of the challenge, not player stats.

## 9b. The Escapee (companion)
Not a party member. A companion never follows you around; instead **exactly one candidate escapes with you**, decided by the player's choices across the game. **Only the person you choose can escape with you**; every other candidate stays behind, in every route. Every run has a different person on the other side of the Gate, which adds replay value and sequel weight.

### Rules
- **Four candidate roles**: Mentor, Partner (Pallas), Ward (Hollow child), Convert (the Lull patron). The Mentor role is filled by **one of four characters the player chooses** (see below), so each run has exactly four candidates.
- Each candidate has a **gating condition** that must be met to bring them out. The player may progress several candidates; the final decision is **who you can bring** when you reach the Gate.
- Each companion **makes the escape harder in a specific way**, so the choice has a mechanical and emotional cost.
- Bringing someone out never overrides the route (sneak / hack / break the Gate); it adds a requirement or a complication to that route.
- **Everyone ends up aware.** Whoever escapes, and whoever does not, learns the truth about MERIDIAN and the Gate by the end (see "Awareness is guaranteed").

### Trust: shown in words, never as a meter
- There is **no meter, number, or bar** for trust. Trust is a hidden state of three levels, **surfaced only as a line in the character's dialogue window**, for example:
  - *"It appears that Pallas trusts you."*
  - *"It appears that Pallas is unsure about you."*
  - *"It appears that Pallas does not trust you."*
- Trust is **easily earned and easily lost**: a single meaningful act (keeping or breaking a promise, sharing or hiding a clue, exposing or protecting someone) can move it a full step in either direction. It should also be **recoverable**, so the player is never locked out by one mistake.
- The gating condition for each candidate requires the "trusts you" state at the Gate, plus the practical requirement listed below.
- The status line is the *only* place trust is shown; the rest of the dialogue and the character's behavior carry the nuance.

### The four candidates
| Role | Who | What opens their eyes / what is at stake | Practical requirement | Complication on the way out |
|---|---|---|---|---|
| **Mentor** | One of four, chosen by the player (see below) | Believes the system basically works, or has made peace with it. Learning what the Gate is, and their own part in it, shakes that. | Trusts you, and their record is severed or replaced before the Gate. | Fully registered, so their record must be dealt with (forged second identity, or the Gate itself broken). Cautious and slow to act on an unchecked plan. |
| **Pallas** (maintenance robot) | Partner. A robot with odd independence, maintained by the insider. | Knows more about the insider than anyone and is aware it is property. Its question is what it is allowed to want. | Trusts you; kept intact and restored; registered as cargo or equipment so the Gate scans it as an object. | Robots are scanned differently; it draws robot attention and cannot enter human-only areas. Good candidate for the game's single inventory puzzle (repair and registration parts). |
| **Juniper "June"** (Hollow child, about 9) | Ward. A girl who has never known anything but the Hollow. | Understands the Hollow is secret but not why, or what lies beyond the city. | Trusts you; the Hollow is still undiscovered; elder Marrow consents; a route a child can use (low scanners, tunnels). | Slow, noisy, and vulnerable to being caught; being seen with her threatens the Hollow. Highest emotional stakes. |
| **Councilwoman Odile Marchetti, "the Signatory"** (Lull patron, about 60) | Convert. Someone who needs their eyes opened, and who becomes part of the solution. | Pacified by the Lull and unaware of it. Waking them is a mini-arc built from conversations and the player's own notebook. | Trusts you; sees through the Lull; awareness is kept from lapsing. | Fragile: the Lull pulls them back under if Alert is high or they are left alone; they may panic at a checkpoint. |

### Why the Signatory matters (needed to take down the system)
MERIDIAN's founding charter requires a **living human countersignature** for any structural change to the system itself (shutdowns, rewrites, handovers). It is a legal fiction nobody has used in decades. The Signatory is **one of the very few people who still hold valid signing authority**, and the Lull has been keeping them content and unaware so they never exercise it. In this game it is a thread and a reason to rescue them; in the sequel, taking down MERIDIAN **cannot happen without a conscious, willing Signatory**. Odile is a former city councillor who held office when the charter still mattered, then "retired" to the Lull. Wry and dignified, and deeply ashamed once she understands how long she has been asleep. Who put her in the Lull, and why, is a sequel question. (The insider did not build the Lull. Subtle signs in its design suggest **machine origin**: MERIDIAN itself may have built it and may want its citizens docile. The sequel asks whether MERIDIAN *wants* this.) The player can ignore this thread entirely and still escape, but the sequel then has to start by retrieving the Signatory.

### The Mentor: four choices
The player chooses who their mentor is. The four share the **same plot beats and gating structure**, with **distinct voices, backgrounds, and one specialty** that colors the route. This keeps the writing cost to "one arc, four voicings" rather than four separate arcs. All four knew the insider.

| Mentor | Background | Specialty (a perk and a flavor) |
|---|---|---|
| **Ines Calloway** (she/her) | Civic Core records clerk; dry, careful, bends small rules for people she likes. | **Paperwork:** forging and altering records; cheaper to build a second identity. |
| **Maren Okafor** (she/her) | Transit dispatcher in the Underworks; blunt, practical. | **Timetables:** train and tunnel timing; easier transit and Underworks routes. |
| **Tobias Hale** (he/him) | Retired Gate-shift guard; gruff, haunted by what he enforced. | **Gate security:** knowledge of patrols and Gate procedure; sees where the Gate is weak. |
| **Silas Brandt** (he/him) | Stacks building superintendent and rumor collector; warm, talkative. | **Rumors:** extra clues and dialogue options; easier information puzzles. |

- **Choosing:** in Act I the player meets all four briefly (a short introduction scene each, vouched for by Wren). The player then **commits to one** by choosing whom to ask for help; the other three remain minor NPCs for the rest of the game.
- **Romance is opt-in:** the relationship is **mentor by default**. The player can steer it toward a romantic undertone through dialogue choices, or keep it platonic. All four mentors are open to either, and the protagonist's gender is left unspecified, so the player chooses freely. Keep it tasteful and understated; it is never required and does not alter the gating requirements. The trust line stays the same either way; the romance lives in the dialogue.

### Awareness is guaranteed
- Every candidate gets a **late-act "awakening" beat** that triggers for them regardless of the route chosen (in person, through a recorded message, or through the player's notebook handed to them). The tone varies by relationship (grief, anger, resolve), but the knowledge is constant.
- The game records each non-escapee's state as a hidden **sequel flag** (free, hiding, arrested, or left in the city) and whether they are an **ally**, a **wary contact**, or **estranged**. Their fate is part of the sequel's starting state and is never shown in this game.

## 9c. After the Gate: the sequel setup
- The protagonist and the chosen companion take **time to improve themselves** before anything else: healing, learning, training, rebuilding what the city took. This happens between games; this game ends at the closing scene (§9d).
- Then they **go back**. The protagonist's motivation comes from what they built (the Gate), the people left behind, and the companion's own reason to return (Pallas wants to free others like it, June grows up wanting her home safe, the Signatory has the countersignature the system needs, the mentor wants to undo what they enforced or processed).
- The sequel's goal is to **take down the whole system**, and it assumes every candidate is **aware of the truth**, regardless of this game's route or choices.

## 9d. Closing scene and sequel tease
The game ends on a fixed scene, the same in every route, with only the companion's identity and voice changing:
1. **Outside the Gate.** The protagonist and the chosen companion stand on the far side. Quiet, a first look at the open world beyond the city.
2. **Gratitude.** Each expresses, in lines tailored to the relationship (mentor / partner / ward / convert, and romantic or platonic for the mentor), how grateful they are to have escaped *together*.
3. **The turn.** The companion's final line is a variation on: *"...but I worry about the others. Can't we all be freed?"* (adapted in voice to who they are; e.g. June asks about the Hollow, Pallas about the other robots, the Signatory about the people in the Lull, the mentor about their friends and neighbors).
4. **Black screen.** Cut to black, then a **sequel advertisement** card (title, tagline, "coming soon" style). No epilogue vignettes and no choice at this point.
- The non-escapees' states (arrested, hiding, free, left in the city; ally, wary, or estranged) are still tracked as **sequel flags**, but they are not shown here; the tease implies they are still inside.

## 10. Technical direction
- **Platform:** web, **TypeScript**, runs in a modern browser. Mobile/touch is out of scope for v1.
- **Rendering:** 2D canvas/WebGL (e.g. PixiJS or Phaser are reasonable candidates; the choice is up to the new project). Needs dynamic lighting support for the hi-bit look.
- **Architecture:** keep game logic (rules, AI, dialogue, clue system, save state) separate from rendering and input so it can be unit-tested.
- **Data-driven content:** districts, NPCs, dialogue trees, clues, items, and augments are defined in data files (JSON/YAML) referenced by string IDs. RNG is passed explicitly and seedable for reproducibility.
- **Dialogue system:** a graph of nodes with conditions on clues/flags and effects on clues/flags/relationships; author-friendly format.
- **Clue system:** clue entities with ID, text, source, reliability, and relationships to other clues.
- **Save system:** versioned JSON saves, autosave, and checkpoints.
- **Audio:** adaptive music layers keyed to Alert level; web audio.
- **Accessibility:** rebindable controls, gamepad, colorblind-safe palettes.

## 11. Scope and milestones (suggested)
1. **Vertical slice:** one district, one robot type, walking, stealth, one dialogue with notebook gating, one terminal puzzle, soft failure.
2. **Core systems:** all robot types, alert/demerit systems, zones/passes, economy, augments, save/load.
3. **Content pass:** all main districts, Safehouse, full information chain, all puzzles, three endings.
4. **Optional areas:** The Lull and The Hollow, with branching consequences.
5. **Polish:** art, lighting, audio, accessibility, balance, playtesting.

## 12. Resolved decisions and build defaults
### Resolved
- **Title:** *Quiet Hours*. Sequel tease card: **QUIET HOURS: COUNTERSIGN**, tagline *"They got out. Now they're going back."* (working copy, easy to change).
- **The Signatory:** Councilwoman Odile Marchetti, about 60, former city councillor (see §9b).
- **The Lull's dulling:** **mild and recoverable.** Staying too long greys and blurs the newest notebook entries, making them unreliable. Leaving the Lull and sleeping at the Safehouse restores them. Never permanent. The Memory Anchor augment prevents it.
- **Embrace vs. reject the past self:** tracked through **two or three explicit choice moments** (e.g. reusing the old insider credentials at a checkpoint, accepting or refusing an old colleague's recognition, answering a Gate prompt as your old self). Each is clear to the player and sets a flag.
- **No hardcore/permadeath mode.** Soft failure only.
- **Sequel seed on the Lull and the contentment index:** hint that **MERIDIAN itself** designed them (machine-origin fingerprints in the Lull's code and the index's falsification logic). Do not confirm it in this game. No second-insider hint.
- **Other sequel seeds, unresolved:** what lies outside the Gate; what the protagonist does once out (see §9c).

### Build defaults (tune in playtesting)
- **Detection:** robot vision cones about 90 degrees, 6-tile range (Sentry and Warden), 4 tiles for Checkers; hearing radius about 3 tiles when walking, 1 tile sneaking, 8 when running. Alert decays one step per about 90 seconds of out-of-sight time.
- **Alert steps:** Calm, Suspicious, Hunting, Lockdown. A single sighting by a Warden moves one step; losing pursuers drops one step per decay interval.
- **Information web:** about 60-80 clues for a 3-5 hour game, each with a source, a reliability tag (true / false / outdated / planted), and links to related clues.
- **Trust:** three hidden levels per candidate (does not trust you / unsure / trusts you), surfaced only as the dialogue line in §9b. Gating conditions are plain flags checked against the clue and dialogue systems.
- **Companion content budget:** one full arc per role, with the Mentor arc written once and voiced four times.
