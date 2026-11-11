# Tuning (NFR-8)

Every number that decides how the game *feels* (ranges, speeds, delays, prices, thresholds) lives in `content/config/tuning.json`, validated at startup, injected into the core as `Config`, and overridable in tests (`withOverrides`) and by future difficulty presets. Changing it needs no code change.

## The lint
`pnpm check` runs `scripts/check-tuning.ts` over the **19 simulation systems** (robots, cameras, alert, comms, demerits, economy, identity, combat, districts, npcs, repairs, processing, movement, nav, vision, sim, augments, terminal, dialogue runtime). It fails on any numeric literal other than 0, 1, 2 and -1 that is not explained. Three ways to satisfy it:
1. **Move it into the config** (add it to the `Config` type, the shape table in `config.ts`, and `tuning.json`). This is the answer for anything a designer might want to change.
2. **Name it** as a module-level `SCREAMING_CASE` constant with a comment saying why it is structural: `const GEOMETRY_EPS = 1e-6;`, `const MAX_CHAIN = 4;`, `HALF_TILE`, `MINUTES_PER_DAY`, `MAX_ALERT_LEVEL`. Use this for mathematics, formats and limits that are not game feel.
3. **Explain the line:** `// tuning-ok: the 24-hour HH:MM format`. The reason after the colon is required.
Comments, strings, templates and array indexes are ignored. The list of systems is `SYSTEM_FILES` in the script; add a file when you add a system.

## What the first run found
Numbers that had been hiding in code, now configurable under `ai` and `combat`: how long a robot must lose sight before it treats you as new (`forgetSeconds`), how a looking-around robot sweeps (`lookAroundSeconds`, `lookAroundRadians`), a post's sweep period (`postSweepSeconds`), how fast robots hurry to a noise (`investigateSpeedFactor`), and the defaults for a tool that does not say how loud or how long (`defaultDecoyNoise`, `defaultStunSeconds`, `defaultLethalNoise`). The rest were mathematics and are now named (degrees per half turn, tile centre, minutes per hour and day, floating-point epsilons).

## No dead knobs
A test reads every leaf of `tuning.json` and fails if no source file mentions its name, so the file never fills up with settings that do nothing. Another checks that every robot kind has a complete profile.

## Not covered
The lint reads systems, not content: prices, durations and radii in `content/*.json` (services, items, puzzles) are already data. Rendering constants in the client (zoom, light radii) are art, not simulation.
