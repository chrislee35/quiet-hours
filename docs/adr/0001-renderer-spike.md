# ADR-1 spike result: Phaser renderer (T0.4)

**Status: provisional, not yet signed off.**

## What was built
`packages/client/src/render/PhaserRenderer.ts`: a 24x14 procedurally generated tilemap with normal-mapped walls,
a cone light following the player (stand-in for a robot vision cone, sized from `vision` config), two colored
point lights, ambient darkness, and a HUD, driven by the core through the fixed-step loop with interpolation.
Phaser 4 provides `lights.addConeLight`, `GameObject.setLighting`, and texture normal-map data sources, so the
lighting features the design needs exist without a custom pipeline.

## Verified
- Typechecks against Phaser's bundled types; production build succeeds (about 361 KB gzipped).
- The renderer touches the core only through `Sim` commands and state (the `Renderer` seam).

## NOT verified (needs a human on real hardware)
- Visual correctness: a headless Firefox screenshot came back blank, which could be capture timing or a
  WebGL failure in headless mode; we cannot tell. Run `pnpm dev` in a normal browser and check that walls
  show bevel lighting, the cone follows movement, and neon lights tint nearby tiles.
- Performance: no FPS measurement on the target laptop (NFR-1: 60 FPS, integrated GPU, 1080p).

## Decision rule
If lighting looks right and holds 60 FPS, keep Phaser (ADR-1 stands).
Otherwise record the failure here and evaluate PixiJS with a custom lighting pass before T1.10.
