# Settings, accessibility and assists

Open from the menu (Esc, or Back on touch, or B on a pad) → **Settings**. Changes apply at once and are remembered in the browser under `quiet-hours:settings`, `quiet-hours:bindings` and `quiet-hours:padbindings`. They belong to the *player*, not to a save: loading or starting a game never changes them.

## Display (ACC-2, ACC-3)
- **Text size:** 100%, 125%, 150%, 200%. Every window is DOM text sized from one variable (`--qh-font`), and the in-world prompt scales with it. Windows scroll rather than clip. *Manual check:* open each window at 200% on a small screen (TESTING §8; an automated screenshot comparison arrives with M5).
- **Colours:** four palettes. The interface uses four semantic colours (live, good, bad, warn), each a CSS variable, so a palette is just a set of values (`packages/client/src/palette.ts`).
  - *Default.*
  - *Red-green safe* (protanopia and deuteranopia): blue for live/good, vermillion for bad, yellow for warn.
  - *Blue-yellow safe* (tritanopia): teal for live/good, red for bad, orange for warn.
  - *High contrast:* pure, bright colours and white text.
  The canvas (robot view cones, cameras, suspicion bars, restricted zones) uses the same palette. **Colour is never the only signal:** state is also a shape (solid vs dashed wires, diamond/circle/triangle pins) and words ("needs ON ✗").
- **Reduce motion:** the camera follows rigidly instead of easing, and any flashing or pulsing effect must respect it (none exist yet). The first-run default follows the browser's own "reduce motion" preference.

### How the palettes are verified
Automated tests check, for every palette, that every role has contrast of at least 4.5:1 on the dark panels, and that for the colour-blind palettes the roles that must be told apart (good/bad, live/bad, warn/bad) stay clearly different (CIE delta E of at least 25) under a simulation of that vision (Machado et al., 2009). The test also shows it would catch a bad palette (the default's red and green collapse for a deuteranope). This is the "simulation tool" check in TESTING §8; a manual pass with real players is still part of the playtest plan.

## Sound (ACC-2)
**Alert sounds:** a short beep when the city gets more suspicious, one for Suspicious, two for Hunting, three for Lockdown (synthesised, no files). **Test** plays the top one. Sound is never required: the alert level is always also in the HUD as words and dots.

## Assists (HAK-3)
**Puzzle skip:** off by default. When on, a terminal offers **Skip this puzzle (assist)** after `assist.skipAfterTaps` (40) taps that changed it, and says how many are left. Skipping runs the terminal's effects exactly once and is recorded as `via: "assist"`, never as solving it, so the solvability checker (T2.15) can still insist that every critical puzzle has a real second route. The setting is part of the game state (`state.assist`) so a save records it, and the player's own setting is re-applied on every start and load. Nothing in the game requires it.

## Controls (ACC-1)
A table of every action with its keyboard key(s) and gamepad button(s) and a **Rebind** for each. Press the new key (Esc cancels) or button (8 s to press one). A key or button can only do one thing: it is taken from whatever had it, and the screen says what lost it and that it is now unbound. **Back / menu cannot be left unbound** (the rebind is refused with a message), so the player can always get out. **Reset controls to defaults** restores both. Typing in a text box never triggers actions.

## Not yet
Remappable touch controls; per-player difficulty options; a larger scale for the canvas art itself (the world is drawn at a fixed zoom). Audio cues beyond alerts come with the sound pass (M5).
