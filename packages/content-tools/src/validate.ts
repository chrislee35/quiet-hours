import Ajv from "ajv";
import { ConfigError, validateConfig } from "@qh/core";
import { kinds, type Kind } from "./schemas.ts";

export interface Issue {
  file: string;
  message: string;
}

export interface ContentFile {
  /** Path relative to the content root, for messages. */
  file: string;
  data: unknown;
}

export interface ContentBundle {
  config?: ContentFile;
  files: Record<Kind, ContentFile[]>;
}

interface Entity {
  id: string;
  [key: string]: unknown;
}

/** Referenced-entity kinds that a "<kind>:<id>" source string may point at. */
const sourceKinds: Partial<Record<string, Kind>> = { npc: "npcs" };

export function validateContent(bundle: ContentBundle): Issue[] {
  const issues: Issue[] = [];
  const ajv = new Ajv({ allErrors: true });
  const entities: Record<Kind, { file: string; entity: Entity }[]> = { clues: [], npcs: [] };

  if (bundle.config) {
    try {
      validateConfig(bundle.config.data);
    } catch (e) {
      if (!(e instanceof ConfigError)) throw e;
      for (const line of e.message.split("\n")) issues.push({ file: bundle.config.file, message: line });
    }
  }

  // 1. Schema validity
  for (const kind of Object.keys(kinds) as Kind[]) {
    const validate = ajv.compile(kinds[kind]);
    for (const { file, data } of bundle.files[kind]) {
      if (!Array.isArray(data)) {
        issues.push({ file, message: "expected a JSON array of entities" });
        continue;
      }
      data.forEach((item, i) => {
        if (validate(item)) {
          entities[kind].push({ file, entity: item as unknown as Entity });
        } else {
          for (const err of validate.errors ?? []) {
            issues.push({ file, message: `[${i}] ${err.instancePath || "/"} ${err.message}` });
          }
        }
      });
    }
  }

  // 2. Duplicate ids (per kind)
  const ids: Record<Kind, Set<string>> = { clues: new Set(), npcs: new Set() };
  for (const kind of Object.keys(entities) as Kind[]) {
    for (const { file, entity } of entities[kind]) {
      if (ids[kind].has(entity.id)) issues.push({ file, message: `duplicate ${kind} id "${entity.id}"` });
      ids[kind].add(entity.id);
    }
  }

  // 3. Referential integrity
  for (const { file, entity } of entities.clues) {
    const source = String(entity.source);
    const [sourceKind, sourceId] = source.split(":") as [string, string];
    const target = sourceKinds[sourceKind];
    if (target && !ids[target].has(sourceId)) {
      issues.push({ file, message: `clue "${entity.id}": source "${source}" does not exist` });
    }
    for (const link of entity.links as { to: string }[]) {
      if (!ids.clues.has(link.to)) {
        issues.push({ file, message: `clue "${entity.id}": link target "${link.to}" does not exist` });
      }
      if (link.to === entity.id) issues.push({ file, message: `clue "${entity.id}": links to itself` });
    }
  }

  return issues;
}
