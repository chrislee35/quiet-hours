import { strict as assert } from "node:assert";
import { Sim, gameTimeAt, type AlertLevel, type Command, type Config, type GameEvent, type GameTime, type RobotState, type World, type Content, type DialogueView } from "@qh/core";

type Matcher<T> = Partial<T>;

/**
 * Scripted headless scenario (T0.6, TESTING §3). Runner-agnostic: failures throw AssertionError,
 * so it works inside vitest, node:test, or a CLI. Every bug fix should add a scenario that failed first.
 */
export class Scenario {
  readonly sim: Sim;
  readonly config: Config;
  /** Every event emitted since construction (or the last clearEvents()). */
  events: GameEvent[] = [];

  constructor(config: Config, seed = 1, world?: World, content?: Content) {
    this.config = config;
    this.sim = new Sim(config, seed, { ...(world ? { world } : {}), ...(content ? { content } : {}) });
  }

  // ---- setup ----------------------------------------------------------------------------
  player(x: number, y: number): this {
    return this.command({ type: "Teleport", x, y });
  }

  /** Queue a command for the next tick (applied immediately by running one tick). */
  command(cmd: Command): this {
    this.events.push(...this.sim.tick([cmd]));
    return this;
  }

  /** Directly edit state (test setup only), e.g. put a robot into chase mode. */
  edit(fn: Parameters<Sim["edit"]>[0]): this {
    this.sim.edit(fn);
    return this;
  }

  robot(id: string): RobotState {
    const r = this.sim.state.robots.find((x) => x.id === id);
    if (!r) throw new Error(`no robot "${id}"`);
    return r;
  }

  get alert(): AlertLevel {
    return this.sim.state.alert.level;
  }

  /** The open dialogue window, or null. */
  get dialogue(): DialogueView | null {
    return this.sim.dialogue();
  }

  /** Choose the visible option whose text matches exactly (more readable than indexes in tests). */
  say(text: string): this {
    const view = this.dialogue;
    const choice = view?.choices.find((c) => c.text === text);
    if (!choice) throw new Error(`no visible choice "${text}"; visible: ${JSON.stringify(view?.choices.map((c) => c.text))}`);
    return this.command({ type: "Choose", index: choice.index });
  }

  // ---- time -----------------------------------------------------------------------------
  advanceTicks(ticks: number): this {
    for (let i = 0; i < ticks; i++) this.events.push(...this.sim.tick());
    return this;
  }

  advance(seconds: number): this {
    return this.advanceTicks(Math.round(seconds * this.config.sim.ticksPerSecond));
  }

  /** Jump the sim clock forward to a game time by stepping (no shortcuts, so all events fire). */
  advanceToMinuteOfDay(minuteOfDay: number): this {
    const guard = this.config.sim.ticksPerSecond * 60 * 60 * 48;
    let steps = 0;
    while (this.time.minuteOfDay !== minuteOfDay) {
      this.advanceTicks(1);
      if (++steps > guard) throw new Error(`never reached minute ${minuteOfDay}`);
    }
    return this;
  }

  clearEvents(): this {
    this.events = [];
    return this;
  }

  // ---- queries --------------------------------------------------------------------------
  get time(): GameTime {
    return gameTimeAt(this.sim.state.tick, this.config);
  }

  eventsOfType<T extends GameEvent["type"]>(type: T): Extract<GameEvent, { type: T }>[] {
    return this.events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
  }

  // ---- assertions -----------------------------------------------------------------------
  expectEvent<T extends GameEvent["type"]>(type: T, match: Matcher<Extract<GameEvent, { type: T }>> = {}): this {
    const found = this.eventsOfType(type).some((e) =>
      Object.entries(match).every(([k, v]) => (e as Record<string, unknown>)[k] === v),
    );
    assert.ok(
      found,
      `expected event ${type} ${JSON.stringify(match)}; saw: ${JSON.stringify(this.events.map((e) => e.type))}`,
    );
    return this;
  }

  expectNoEvent(type: GameEvent["type"]): this {
    assert.equal(this.eventsOfType(type).length, 0, `unexpected event ${type}`);
    return this;
  }

  expectAlert(level: AlertLevel): this {
    assert.equal(this.alert, level, `alert level ${this.alert}, expected ${level}`);
    return this;
  }

  expectPlayerNear(x: number, y: number, tolerance = 0.01): this {
    const p = this.sim.state.player;
    assert.ok(Math.hypot(p.x - x, p.y - y) <= tolerance, `player at (${p.x}, ${p.y}), expected (${x}, ${y})`);
    return this;
  }

  expectTime(match: Partial<GameTime>): this {
    assert.deepEqual({ ...this.time, ...match }, this.time, `game time ${JSON.stringify(this.time)}`);
    return this;
  }
}
