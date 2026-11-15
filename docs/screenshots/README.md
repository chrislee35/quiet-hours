# Map screenshots (for review)

Whole-map views rendered by the real Phaser client in headless Ungoogled Chromium (software WebGL), 1600x900, game start state (day 1, 07:00), robots and the player at their spawn points. Taken with a debug-build-only `?overview` URL parameter that fits the whole map to the screen and lifts the ambient light; it is compiled out of production builds.

| File | Map |
|---|---|
| `stacks.png` | the Stacks (Act I opening, Safehouse top-left) |
| `civic_core.png` | the Civic Core: plaza (left), Permit Hall and back office (right) |
| `belt.png` | the Industrial Belt: yard, press hall corridor, scrap yard, pump hall |
| `underworks.png` | the Transit Underworks: platform, tunnel and drain, junction, signal room, Platform 7 |
| `gate.png` | the Gate: service platform, corridor, hall, Annex, threshold |
| `outside.png` | the far side (a stub until the closing scene) |
| `npc-gallery.png` | every named figure on one sheet (debug build, `?npcs=1`) |
| `stacks_slice.png`, `robot_range.png` | the older vertical-slice and robot-range test maps |

To regenerate: `QH_DEBUG=1 pnpm --filter @qh/client exec vite build --outDir /tmp/dist-debug`, serve that folder, and open `?map=<stacks|civic|belt|underworks|gate|outside|slice|range>&overview=1`.

## Found and fixed while taking these
- **Lights were hard-coded to the Stacks.** Three coloured point lights sat at fixed coordinates on every map, so the Belt, Underworks, Gate and the outside all had a pink neon glow in the wrong place. Lights now come from each map's named places, tinted by district (warm and neon for the Stacks, sterile blue-white for the Core, hot orange for the Belt, teal for the Underworks, cold white and red for the Gate).
- **Civic Core back office was cluttered.** Four pickups, Pell and an exit shared one row and their labels overlapped. Spread out and the labels shortened.
- `?map=outside` was missing.

## NPC look (done)
Every named person now has their own figure, drawn in code from `packages/client/src/render/npcLooks.ts` (a table: add a line to add a face; anyone not listed gets stable colours from their id). Mentors have a gold ring and name tag, people who might come with you teal, officials red, machines cyan. Idle life: a gentle sway, machines pulse, Brindle hums floating notes. Reduce-motion turns the movement off. See `npc-gallery.png`.

## Seen and not fixed (decisions for you)
- The Gate hall is a large empty grey room; nothing marks the Gate itself except the door and the exit marker.
- Doors that open and shut on timers (the presses, the Underworks trains) look like thin marks in a still frame; I could not judge their animation from a screenshot.
- The HUD panel covers the top-left of every map, and labels are tiny at overview zoom (they are fine at play zoom).
- The older Civic Core form-rack row still has long labels that touch.
