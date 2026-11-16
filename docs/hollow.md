# The Hollow (T4.4, WLD-7)

`content/maps/hollow.json` (56x26). Reached by the Underworks service tunnel (the door waits for SQ-05, Quill's token and the trains) and the exit at its east end; back by the tunnel mouth. `?map=hollow` opens it directly. Warm and acoustic: a commons, the gardens, the pump room, the sleeping rooms and Marrow's hearth. No robots, no cameras, every zone `safe` (saving allowed).

## People
- **Marrow** (`marrow.qdl`): elder, protective, wary. Explains the discovery risk (`hollow_discovery_risk`), notices a trail, refuses to discuss June until SQ-07, then gives **consent** (`marrow_consent`, clue `june_consent`).
- **Bede** (`bede.qdl`): gardener. Names the place (`hollow_exists`), starts SQ-07, mentions June's hum (`june_hums`).
- **June** (`juniper.qdl`): about nine, shy, hums. A first meeting only; her arc and trust come with T4.6.

## SQ-07 Tomatoes
The pump behind the garden leaks and the beds are dying. Bede needs a pump gasket the Hollow cannot make: the **Belt scrap yard** (a pickup) or **Wren's stores** (12 credits). Fitting it: a tomato, the flag `hollow_watch` (a lookout at the tunnel mouth; T4.5 uses it) and Marrow's regard, so she consents about June. No failure.

## Discovery risk (`packages/core/src/hollow.ts`)
Arriving in the Hollow with the city already on alert (Suspicious or worse) leaves a **trail**: `hollow_trail` and `hollow_risk`. `hollow_risk` is also set by selling out Mrs. Adeyemi-Roth (SQ-02). Marrow remarks on a trail. The consequences (a van, the wipe-out, the Lull disruption branch) are T4.5, which reads `hollow_risk`, `hollow_trail`, `hollow_watch` and `mrs_safe`; `hollow_discovered` is set there.

## Not here yet
June's arc, her route requirements and `child_route` (T4.6); `hollow_discovered` and the consequences (T4.5).

Tests: `packages/sim-harness/test/hollow.test.ts`.
