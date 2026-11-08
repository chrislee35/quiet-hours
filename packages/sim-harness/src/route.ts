import { Sim, type Command, type Config, type Content, type MoveMode, type World } from "@qh/core";

/** One leg of a scripted route: walk to a point (tile coordinates), or press Interact. */
export type RouteStep = [x: number, y: number] | "use";

export interface RouteResult {
  /** Reached the end of the route without any robot identifying the player. */
  ok: boolean;
  spotted: boolean;
  seconds: number;
}

/**
 * Plays a scripted route against a world: wait `delaySeconds`, then follow `steps` in `mode`.
 * Used for fairness checks (is a level passable, and how does difficulty scale with stance and timing).
 */
export function walkRoute(
  config: Config,
  world: World,
  steps: RouteStep[],
  mode: MoveMode,
  delaySeconds = 0,
  options: { maxSeconds?: number; content?: Content } = {},
): RouteResult {
  const sim = new Sim(config, 1, { world, ...(options.content ? { content: options.content } : {}) });
  const tps = config.sim.ticksPerSecond;
  const limit = Math.round((delaySeconds + (options.maxSeconds ?? 90)) * tps);
  let next = 0;
  for (let t = 0; t < limit; t++) {
    const cmds: Command[] = [];
    if (t < delaySeconds * tps) {
      cmds.push({ type: "SetMove", dx: 0, dy: 0, mode });
    } else if (next < steps.length) {
      const step = steps[next]!;
      if (step === "use") {
        cmds.push({ type: "SetMove", dx: 0, dy: 0, mode }, { type: "Interact" });
        next++;
      } else {
        const p = sim.state.player;
        if (Math.hypot(step[0] - p.x, step[1] - p.y) < 0.2) next++;
        else cmds.push({ type: "SetMove", dx: step[0] - p.x, dy: step[1] - p.y, mode });
      }
    }
    const events = sim.tick(cmds);
    if (events.some((e) => e.type === "RobotSpotted")) return { ok: false, spotted: true, seconds: t / tps };
    if (next >= steps.length) return { ok: true, spotted: false, seconds: t / tps };
  }
  return { ok: false, spotted: false, seconds: limit / tps };
}

/** Percentage of integer start delays in [0, maxDelay) for which the route succeeds unseen. */
export function successRate(config: Config, world: World, steps: RouteStep[], mode: MoveMode, maxDelay = 60): number {
  let ok = 0;
  for (let d = 0; d < maxDelay; d++) if (walkRoute(config, world, steps, mode, d).ok) ok++;
  return Math.round((100 * ok) / maxDelay);
}
