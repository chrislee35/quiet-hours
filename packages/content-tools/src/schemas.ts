/** JSON Schemas for content files (NFR-5). Each content file holds an array of entities. */
export const ID_PATTERN = "^[a-z][a-z0-9_]*$";

const id = { type: "string", pattern: ID_PATTERN };

export const clueSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "text", "source", "reliability", "tags", "links"],
  properties: {
    id,
    text: { type: "string", minLength: 1 },
    /** "<kind>:<id>", e.g. npc:odd_sam. Referenced kinds are integrity-checked. */
    source: { type: "string", pattern: "^[a-z]+:[a-z][a-z0-9_]*$" },
    reliability: { enum: ["true", "false", "outdated", "planted"] },
    /** Other places the same fact can be learned (same "<kind>:<id>" form): a clue the game needs is learnable at least two ways. */
    alsoFrom: { type: "array", items: { type: "string", pattern: "^[a-z]+:[a-z][a-z0-9_]*$" } },
    /** The way on depends on the player learning this (a route, a companion, the past): the web checks it has two sources. */
    critical: { type: "boolean" },
    /** What it is needed for: route:sneak, route:hack, route:break, past, companion:pallas, side:sq_03, ... */
    for: { type: "array", items: { type: "string", pattern: "^[a-z][a-z0-9]*(:[a-z0-9_]+)?$" } },
    tags: { type: "array", items: { type: "string", pattern: "^[a-z]+:[a-z0-9_]+$" } },
    links: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["to", "kind"],
        properties: { to: id, kind: { enum: ["supports", "contradicts", "updates"] } },
      },
    },
  },
} as const;

export const npcSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "role", "district"],
  properties: {
    id,
    name: { type: "string", minLength: 1 },
    role: { type: "string", minLength: 1 },
    district: { type: "string", minLength: 1 },
  },
} as const;

const tile = { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 };

/**
 * Every puzzle names its kind; the rest of its shape is checked by that kind's own validator in core (the same
 * code the game runs), so the two can never disagree.
 */
export const puzzleSchema = {
  type: "object",
  required: ["id", "kind"],
  properties: {
    id,
    kind: { enum: ["power_routing", "signal_path", "schedule_align", "rule_contradiction", "code_lock", "lights_out", "logic_circuit", "cipher", "magic_square", "arithmetic", "chem_balance", "translation", "melody", "neural_net"] },
  },
} as const;

/** `bypass` conditions and `onSolve` effects use the shared rules language and are validated semantically. */
export const terminalSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "title", "puzzle", "bypass", "onSolve", "solvedText"],
  properties: {
    id,
    title: { type: "string", minLength: 1 },
    puzzle: id,
    bypass: { type: "array" },
    onSolve: { type: "array" },
    solvedText: { type: "string" },
    critical: { type: "boolean" },
  },
} as const;

export const augmentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "description", "slotCost", "power"],
  properties: {
    id,
    name: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    slotCost: { type: "integer", minimum: 1 },
    power: { type: "integer", minimum: 0 },
    modifiers: { type: "object", additionalProperties: { type: "number", exclusiveMinimum: 0 } },
    tags: { type: "array", items: id },
    spoof: {
      type: "object",
      additionalProperties: false,
      required: ["windowSeconds", "rechargeSeconds"],
      properties: { windowSeconds: { type: "number", exclusiveMinimum: 0 }, rechargeSeconds: { type: "number", minimum: 0 } },
    },
    jam: {
      type: "object",
      additionalProperties: false,
      required: ["radiusTiles", "seconds", "cooldownSeconds"],
      properties: {
        radiusTiles: { type: "number", exclusiveMinimum: 0 },
        seconds: { type: "number", exclusiveMinimum: 0 },
        cooldownSeconds: { type: "number", minimum: 0 },
      },
    },
  },
} as const;

export const itemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "type", "stackable", "tags", "description"],
  properties: {
    id,
    name: { type: "string", minLength: 1 },
    type: { enum: ["tool", "key", "consumable", "contraband", "junk"] },
    stackable: { type: "boolean" },
    tags: { type: "array", items: id },
    description: { type: "string" },
    tool: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "rangeTiles", "consumed"],
      properties: {
        kind: { enum: ["stun", "decoy", "cutters", "lethal"] },
        rangeTiles: { type: "number", exclusiveMinimum: 0 },
        seconds: { type: "number", exclusiveMinimum: 0 },
        noiseRadius: { type: "number", exclusiveMinimum: 0 },
        consumed: { type: "boolean" },
      },
    },
  },
} as const;

export const serviceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "description", "price", "legitimate", "once", "requires", "effects", "successText"],
  properties: {
    id,
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    price: { type: "integer", minimum: 0 },
    legitimate: { type: "boolean" },
    once: { type: "boolean" },
    requires: { type: "array" },
    effects: { type: "array" },
    successText: { type: "string" },
    refusals: {
      type: "object",
      additionalProperties: false,
      properties: { null_state: { type: "string" }, requirements: { type: "string" }, funds: { type: "string" }, once: { type: "string" } },
    },
  },
} as const;

export const reactionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "on", "effects"],
  properties: {
    id,
    on: { type: "string", pattern: "^[A-Z][A-Za-z]+$" },
    match: { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } },
    if: { type: "array" },
    effects: { type: "array", minItems: 1 },
    once: { type: "boolean" },
  },
} as const;

export const questSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "title", "summary", "start", "steps", "complete"],
  properties: {
    id,
    title: { type: "string", minLength: 1 },
    summary: { type: "string" },
    start: { type: "array" },
    steps: {
      type: "array",
      minItems: 1,
      items: { type: "object", additionalProperties: false, required: ["id", "text", "done"], properties: { id, text: { type: "string", minLength: 1 }, done: { type: "array" } } },
    },
    complete: { type: "array", minItems: 1 },
    failed: { type: "array" },
  },
} as const;

export const goalSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "map", "require"],
  properties: { id, name: { type: "string", minLength: 1 }, map: { type: "string", minLength: 1 }, require: { type: "array", minItems: 1 } },
} as const;

/** Content kinds: directory name under content/ -> schema for each entity. */
export const kinds = {
  clues: clueSchema,
  npcs: npcSchema,
  puzzles: puzzleSchema,
  terminals: terminalSchema,
  augments: augmentSchema,
  items: itemSchema,
  services: serviceSchema,
  reactions: reactionSchema,
  quests: questSchema,
  goals: goalSchema,
} as const;

export type Kind = keyof typeof kinds;
