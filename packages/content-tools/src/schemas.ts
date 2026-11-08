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

/** Content kinds: directory name under content/ -> schema for each entity. */
export const kinds = {
  clues: clueSchema,
  npcs: npcSchema,
} as const;

export type Kind = keyof typeof kinds;
