export type FlagValue = boolean | number | string;
/** Hidden trust state per NPC: -1 does not trust you, 0 unsure, 1 trusts you (CMP-3). Never shown as a number. */
export type TrustLevel = -1 | 0 | 1;
export type ClueStatus = "unverified" | "verified" | "disproved";

export type MoveMode = "walk" | "sneak" | "run";

/** 0 Calm, 1 Suspicious, 2 Hunting, 3 Lockdown (ALR-1). */
export type AlertLevel = 0 | 1 | 2 | 3;
export const ALERT_NAMES = ["Calm", "Suspicious", "Hunting", "Lockdown"] as const;

/** Everything the core tells the outside world. Clients render these; tests assert on them. */
export type GameEvent =
  | { type: "NoiseEmitted"; tick: number; x: number; y: number; radius: number; source: "player" | "decoy" | "weapon" }
  | { type: "DoorOpened"; tick: number; doorId: string }
  | { type: "DoorClosed"; tick: number; doorId: string }
  /** The player tried to open a locked door. */
  | { type: "DoorLocked"; tick: number; doorId: string }
  | { type: "DoorUnlocked"; tick: number; doorId: string }
  /** The player tried to close a door while standing in its doorway. */
  | { type: "DoorBlocked"; tick: number; doorId: string }
  | { type: "ZoneEntered"; tick: number; zone: string }
  | { type: "ZoneExited"; tick: number; zone: string }
  | { type: "RobotSpotted"; tick: number; robotId: string }
  /** A pursuing robot reached the last known position without seeing the player. */
  | { type: "RobotLostTrack"; tick: number; robotId: string }
  | { type: "RobotInvestigating"; tick: number; robotId: string; x: number; y: number }
  /** A robot reached the player. Processing (soft failure) is handled by a later system. */
  /** An ID check completed. `Null` means "pending review"; see identity.ts. */
  | { type: "ScanPerformed"; tick: number; robotId: string; outcome: "Allowed" | "Null" | "Violation" | "Expired" }
  | { type: "AuditPassed"; tick: number; robotId: string }
  | { type: "AuditFailed"; tick: number; robotId: string; reason: string }
  /** A Hound was sent to hunt because the alert reached its dispatch level. */
  | { type: "HoundDispatched"; tick: number; robotId: string }
  /** A fixed camera identified the player. */
  | { type: "CameraSpotted"; tick: number; cameraId: string }
  | { type: "CameraDisabled"; tick: number; cameraId: string }
  | { type: "CameraRepaired"; tick: number; cameraId: string }
  | { type: "DoorRelocked"; tick: number; doorId: string }
  /** A maintenance robot was sent to fix something. */
  | { type: "RepairAssigned"; tick: number; robotId: string; task: "camera" | "door"; targetId: string }
  /** A robot or camera that identified the player alerted the robots within comms range. */
  | { type: "AlertBroadcast"; tick: number; originId: string; recipients: string[] }
  | { type: "AlertReceived"; tick: number; robotId: string; originId: string }
  | { type: "PlayerCaught"; tick: number; robotId: string }
  | { type: "AlertChanged"; tick: number; from: AlertLevel; to: AlertLevel }
  | { type: "ClueGained"; tick: number; clueId: string; from: string }
  | { type: "ClueStatusChanged"; tick: number; clueId: string; status: ClueStatus }
  | { type: "FlagSet"; tick: number; flag: string; value: FlagValue }
  | { type: "ItemsChanged"; tick: number; itemId: string; delta: number; total: number }
  | { type: "CreditsChanged"; tick: number; delta: number; total: number }
  | { type: "TrustChanged"; tick: number; npc: string; from: TrustLevel; to: TrustLevel; cause: string }
  /** Free-form hook raised by an effect, for scripted content to react to. */
  | { type: "Custom"; tick: number; name: string }
  /** The player was processed after being caught: confiscation, holding, setback (FAIL-1/2). */
  | { type: "PlayerProcessed"; tick: number; arrestCount: number; items: Record<string, number>; credits: number }
  | { type: "PlayerReleased"; tick: number }
  | { type: "LockerOpened"; tick: number; lockerId: string; items: Record<string, number>; credits: number }
  | { type: "InfractionRecorded"; tick: number; kind: "restricted_zone" | "curfew" | "assault"; points: number; total: number }
  | { type: "DemeritThreshold"; tick: number; level: "check" | "enforcer" }
  | { type: "ServiceUsed"; tick: number; serviceId: string; price: number }
  | { type: "ServiceRefused"; tick: number; serviceId: string; reason: "unknown" | "null_state" | "requirements" | "funds" | "once"; text: string }
  | { type: "LoanTaken"; tick: number; lender: string; amount: number; owed: number }
  | { type: "LoanRepaid"; tick: number; lender: string; paid: number; owed: number }
  | { type: "InterestAccrued"; tick: number; lender: string; owed: number }
  /** Collectors visited an overdue debtor, took a share of their credits and raised the alert. */
  | { type: "CollectorsCame"; tick: number; lender: string; taken: number; owed: number }
  /** The state was replaced by a saved or new game; views should redraw from scratch. */
  | { type: "AssistChanged"; tick: number; puzzleSkip: boolean }
  | { type: "CluesLinked"; tick: number; a: string; b: string }
  | { type: "CluesUnlinked"; tick: number; a: string; b: string }
  | { type: "GameLoaded"; tick: number }
  | { type: "DistrictChanged"; tick: number; district: string; key: string; value: FlagValue }
  | { type: "MetricChanged"; tick: number; metric: "order" | "power" | "contentment"; from: number; to: number }
  | { type: "ReactionFired"; tick: number; reactionId: string }
  /** Robots placed with `activeWhen` arrive and leave as district state changes. */
  | { type: "RobotActivated"; tick: number; robotId: string }
  | { type: "RobotStoodDown"; tick: number; robotId: string }
  | { type: "CameraPowerLost"; tick: number; cameraId: string }
  | { type: "CameraPowerRestored"; tick: number; cameraId: string }
  | { type: "ToolUsed"; tick: number; itemId: string; kind: "stun" | "decoy" | "cutters" | "lethal" }
  | { type: "ToolRefused"; tick: number; itemId: string; reason: "not_a_tool" | "none_left" | "no_target" }
  | { type: "RobotStunned"; tick: number; robotId: string }
  /** Lethal force: rare, loud, and recorded in the flag `lethal_force_used` (CMB-3). */
  | { type: "RobotDestroyed"; tick: number; robotId: string }
  /** A fight happened: the alert rose, the victim called for help, credits were lost (CMB-2). */
  | { type: "FightConsequences"; tick: number; creditsLost: number; alert: number }
  | { type: "AugmentGained"; tick: number; augmentId: string }
  | { type: "AugmentEquipped"; tick: number; augmentId: string }
  | { type: "AugmentUnequipped"; tick: number; augmentId: string }
  | { type: "AugmentRefused"; tick: number; augmentId: string; reason: "unknown" | "not_owned" | "already_equipped" | "no_slots" | "no_power" | "recharging" }
  | { type: "BandUpgraded"; tick: number; slots: number; powerBudget: number }
  /** Ghost Tag opened a window in which ID scans read as valid. */
  | { type: "GhostTagSpoofed"; tick: number; augmentId: string }
  | { type: "BurstJammerFired"; tick: number; augmentId: string; robots: string[]; cameras: string[] }
  /** The player picked something up from the world. */
  | { type: "PickedUp"; tick: number; pickupId: string }
  | { type: "PassGained"; tick: number; passId: string }
  | { type: "PassLost"; tick: number; passId: string }
  | { type: "ConversationStarted"; tick: number; dialogueId: string; npc: string }
  | { type: "ConversationNode"; tick: number; dialogueId: string; node: string }
  | { type: "ConversationEnded"; tick: number; dialogueId: string }
  | { type: "CluePresented"; tick: number; clueId: string; npc: string }
  | { type: "TerminalOpened"; tick: number; terminalId: string }
  | { type: "TerminalClosed"; tick: number; terminalId: string }
  | { type: "TerminalSolved"; tick: number; terminalId: string; via: "puzzle" | "bypass" | "assist" }
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
