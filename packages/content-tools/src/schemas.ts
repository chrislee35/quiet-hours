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

export const puzzleSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "kind", "width", "height", "pieces", "rotations", "source", "targets"],
  properties: {
    id,
    kind: { const: "power_routing" },
    width: { type: "integer" },
    height: { type: "integer" },
    pieces: { type: "array", items: { type: "string" } },
    rotations: { type: "array", items: { type: "string" } },
    source: tile,
    targets: { type: "array", items: tile },
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

/** Content kinds: directory name under content/ -> schema for each entity. */
export const kinds = {
  clues: clueSchema,
  npcs: npcSchema,
  puzzles: puzzleSchema,
  terminals: terminalSchema,
  augments: augmentSchema,
  items: itemSchema,
  services: serviceSchema,
} as const;

export type Kind = keyof typeof kinds;
