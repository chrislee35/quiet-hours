# The Hollow (T4.4, T4.5, WLD-7)

`content/maps/hollow.json` (56x26). Reached by the Underworks service tunnel (the door waits for SQ-05, Quill's token and the trains) and the exit at its east end; back by the tunnel mouth. `?map=hollow` opens it directly. Warm and acoustic: a commons, the gardens, the pump room, the sleeping rooms and Marrow's hearth. No robots, no cameras, every zone `safe` (saving allowed).

## People
- **Marrow** (`marrow.qdl`): elder, protective, wary. Explains the discovery risk (`hollow_discovery_risk`), notices a trail, refuses to discuss June until SQ-07, then gives **consent** (`marrow_consent`, clue `june_consent`).
- **Bede** (`bede.qdl`): gardener. Names the place (`hollow_exists`), starts SQ-07, mentions June's hum (`june_hums`).
- **June** (`juniper.qdl`): about nine, shy, hums. A first meeting only; her arc and trust come with T4.6.

## SQ-07 Tomatoes
The pump behind the garden leaks and the beds are dying. Bede needs a pump gasket the Hollow cannot make: the **Belt scrap yard** (a pickup) or **Wren's stores** (12 credits). Fitting it: a tomato, the flag `hollow_watch` (a lookout at the tunnel mouth; T4.5 uses it) and Marrow's regard, so she consents about June. No failure.

## Discovery risk and the raid (`packages/core/src/hollow.ts`, tuning `hollow`)
**Risk** is points from flags: **+2** `mrs_sold` (the informant sold out, SQ-02), **+1** for each arrival in the Hollow with the city already on alert (`hollow_trails`, at most 3; also `hollow_trail`/`hollow_risk`), **-1** `hollow_watch` (the lookout from SQ-07), **-1** `mrs_safe` (the informant won over, SQ-02). Never below 0.
At `hollow.discoverAt` (3) a **raid is set in motion** (`hollow_doomed`; the HUD says you have been careless) and lands `hollow.raidDelayMinutes` (240, four game hours) later. In that window:
- **Avert it**: anything that brings the risk back under 3 (finishing SQ-07 posts the lookout) calls it off (`hollow_spared`).
- **Warn Marrow**: when she is told (her conversation offers it while a raid is coming; arrive quietly, or the trail makes it worse), `hollow_warned`, and the raid scatters rather than wipes.
- Otherwise it lands: `hollow_discovered`, `hollow_outcome` = `wiped` (or `scattered` if warned), everyone in the Hollow is gone, and a player still inside is spotted (Hunting).
**Leaving by the Gate on the break route** with any risk at all costs the Hollow the same way (`finalizeEscape`); the other routes leave it hidden. `sequel_hollow` is `hidden`, `scattered` or `wiped`. A discovered Hollow ends June's gate (`hollow_discovered`).

## June's arc (T4.6, CMP-5)
- **The tune.** June has never known the end of the song Bede sings to the seedlings. After SQ-07 Bede will tell you how it ends (`tune_known`); telling June earns her trust (`june_tune`, one step to "trusts you"). Telling her to hush costs a step and the tune earns it back, so she is never stuck.
- **The truth** (her awakening): ask whether she wants to know what is outside and be honest about it (`awake_juniper=person`).
- **A way a child can use** (`child_route`): Quill, once Marrow has consented (SQ-07), leaves a vent grille loose behind the Platform 7 signal box and says how low the tunnel scanners sit.
- **Marrow's consent** (`marrow_consent`) comes from SQ-07; if the Hollow is discovered, June cannot leave at all.
- **Asking her** to come sets her as your companion (release if you change your mind); Marrow has a farewell.
- **Her route requirements** are in `content/companions/companions.json`: any alert shuts the sneak and the hack; the break only fails at Hunting. **Being seen with her** (alert while she is your companion) adds one trail to the Hollow's risk, once.
Tests: `packages/sim-harness/test/june.test.ts`.

Tests: `packages/sim-harness/test/hollow.test.ts`, `consequences.test.ts`.
