export type MoveMode = "walk" | "sneak" | "run";

/** Everything the core tells the outside world. Clients render these; tests assert on them. */
export type GameEvent =
  | { type: "NoiseEmitted"; tick: number; x: number; y: number; radius: number; source: "player" }
  | { type: "DoorOpened"; tick: number; doorId: string }
  | { type: "DoorClosed"; tick: number; doorId: string }
  /** The player tried to open a locked door. */
  | { type: "DoorLocked"; tick: number; doorId: string }
  /** The player tried to close a door while standing in its doorway. */
  | { type: "DoorBlocked"; tick: number; doorId: string }
  | { type: "ZoneEntered"; tick: number; zone: string }
  | { type: "ZoneExited"; tick: number; zone: string }
  | { type: "DayChanged"; tick: number; day: number }
  | { type: "CurfewStarted"; tick: number }
  | { type: "CurfewEnded"; tick: number }
  | { type: "QuietHoursStarted"; tick: number }
  | { type: "QuietHoursEnded"; tick: number };

export type GameEventType = GameEvent["type"];

export type Listener = (event: GameEvent) => void;

/** Minimal synchronous pub/sub; the sim emits after each step completes. */
export class EventBus {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(events: readonly GameEvent[]): void {
    for (const event of events) for (const l of this.listeners) l(event);
  }
}
