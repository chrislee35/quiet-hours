import { Sim, type Command, type Config, type GameEvent, type World } from "@qh/core";

/** A recorded run (TESTING §12): enough to reproduce a session exactly and compare state hashes. */
export interface Replay {
  format: 1;
  seed: number;
  /** Ticks to run in total. */
  ticks: number;
  /** Commands keyed by the tick on which they were issued. Sparse. */
  frames: { tick: number; commands: Command[] }[];
  /** Hash of the final state when recorded; used by golden tests. */
  finalHash?: string;
}

export class ReplayRecorder {
  private frames: Replay["frames"] = [];
  private readonly seed: number;
  readonly sim: Sim;

  constructor(config: Config, seed: number, world?: World) {
    this.seed = seed;
    this.sim = new Sim(config, seed, world ? { world } : {});
  }

  tick(commands: Command[] = []): GameEvent[] {
    if (commands.length > 0) this.frames.push({ tick: this.sim.state.tick, commands });
    return this.sim.tick(commands);
  }

  finish(): Replay {
    return { format: 1, seed: this.seed, ticks: this.sim.state.tick, frames: this.frames, finalHash: this.sim.hash };
  }
}

export interface ReplayResult {
  hash: string;
  events: GameEvent[];
}

export function runReplay(replay: Replay, config: Config, world?: World): ReplayResult {
  const sim = new Sim(config, replay.seed, world ? { world } : {});
  const byTick = new Map(replay.frames.map((f) => [f.tick, f.commands]));
  const events: GameEvent[] = [];
  for (let i = 0; i < replay.ticks; i++) events.push(...sim.tick(byTick.get(i) ?? []));
  return { hash: sim.hash, events };
}

export function serializeReplay(replay: Replay): string {
  return JSON.stringify(replay);
}

export function parseReplay(text: string): Replay {
  const raw = JSON.parse(text) as Replay;
  if (raw.format !== 1 || typeof raw.seed !== "number" || !Array.isArray(raw.frames)) {
    throw new Error("unsupported or corrupt replay file");
  }
  return raw;
}

