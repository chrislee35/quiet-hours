import Ajv from "ajv";
import { validateCondition, validateEffect, ConfigError, TiledImportError, WorldError, buildWorld, compileDialogue, importTiled, validateConfig, type Dialogue, type MapData } from "@qh/core";
import { clueGates, cluesGiven } from "./dialogue-checks.ts";
import { checkPuzzles, checkTerminals } from "./terminal-checks.ts";
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
  /** `.qdl` dialogue sources; the conversation id is the file name without extension. */
  dialogues: { file: string; text: string }[];
  /** Tiled JSON exports; the map id is the file name without extension. */
  maps: ContentFile[];
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
  const entities: Record<Kind, { file: string; entity: Entity }[]> = { clues: [], npcs: [], puzzles: [], terminals: [], augments: [], items: [], services: [] };

  if (bundle.config) {
    try {
      validateConfig(bundle.config.data);
    } catch (e) {
      if (!(e instanceof ConfigError)) throw e;
      for (const line of e.message.split("\n")) issues.push({ file: bundle.config.file, message: line });
    }
  }

  // Maps: import (Tiled conventions) then build (geometry rules). Both report every problem at once.
  const mapIds = new Set<string>();
  const mapData: { file: string; map: MapData }[] = [];
  for (const { file, data } of bundle.maps) {
    const id = file.replace(/^maps\//, "").replace(/\.json$/, "");
    if (mapIds.has(id)) issues.push({ file, message: `duplicate map id "${id}"` });
    mapIds.add(id);
    try {
      const map = importTiled(data, id);
      buildWorld(map);
      mapData.push({ file, map });
    } catch (e) {
      if (!(e instanceof TiledImportError || e instanceof WorldError)) throw e;
      for (const part of e.message.replace(/^map "[^"]*": /, "").split("; ")) issues.push({ file, message: part });
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
  const ids: Record<Kind, Set<string>> = { clues: new Set(), npcs: new Set(), puzzles: new Set(), terminals: new Set(), augments: new Set(), items: new Set(), services: new Set() };
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

  // 4. Dialogues: compile (syntax, dead ends, unreachable nodes, known ids), then cross-file checks.
  const clueIds = ids.clues;
  const npcIds = ids.npcs;
  const compiled: { file: string; dialogue: Dialogue }[] = [];
  for (const { file, text } of bundle.dialogues) {
    const id = file.replace(/^dialogue\//, "").replace(/\.qdl$/, "");
    const { dialogue, errors } = compileDialogue(text, { id, knownClues: clueIds, knownNpcs: npcIds });
    for (const e of errors) issues.push({ file, message: `line ${e.line}: ${e.message}` });
    if (dialogue) {
      compiled.push({ file, dialogue });
      if (!npcIds.has(dialogue.npc)) issues.push({ file, message: `npc "${dialogue.npc}" is not defined in content/npcs` });
    }
  }

  // Every clue a conversation is gated on must be obtainable somewhere: given by some dialogue, or
  // sourced from something other than an NPC (a terminal, a document, a pickup).
  const given = new Set<string>();
  for (const { dialogue } of compiled) for (const c of cluesGiven(dialogue)) given.add(c);
  const clueSource = new Map(entities.clues.map(({ entity }) => [entity.id, String(entity.source)]));
  for (const { file, dialogue } of compiled) {
    for (const { clue, where } of clueGates(dialogue)) {
      const source = clueSource.get(clue);
      if (source === undefined) continue; // unknown clue: already reported by the compiler
      if (!given.has(clue) && source.startsWith("npc:")) {
        issues.push({ file, message: `${where} needs clue "${clue}", but no conversation ever gives it (source ${source})` });
      }
    }
  }

  // Map NPCs must point at a real conversation and a real npc.
  const dialogueIds = new Set(compiled.map((c) => c.dialogue.id));
  for (const { file, map } of mapData) {
    for (const n of map.npcs) {
      if (!npcIds.has(n.id)) issues.push({ file, message: `npc "${n.id}" is not defined in content/npcs` });
      if (!dialogueIds.has(n.dialogue)) issues.push({ file, message: `npc "${n.id}" uses unknown dialogue "${n.dialogue}"` });
    }
  }

  // Augments and items: a non-stackable item holds at most one; pickups must grant things that exist.
  for (const { file, map } of mapData) {
    for (const p of map.pickups ?? []) {
      const [kind, id] = p.grant.split(":");
      if (kind === "augment" && !ids.augments.has(id ?? "")) issues.push({ file, message: `pickup "${p.id}" grants unknown augment "${id}"` });
      if (kind === "item" && !ids.items.has(id ?? "")) issues.push({ file, message: `pickup "${p.id}" grants unknown item "${id}"` });
      if (kind === "item" && p.grant.split(":")[2] !== undefined) {
        const item = entities.items.find(({ entity }) => entity.id === id)?.entity;
        if (item && item.stackable === false) issues.push({ file, message: `pickup "${p.id}" grants several of non-stackable item "${id}"` });
      }
    }
  }

  // Services: conditions and effects must be well formed and refer to things that exist.
  for (const { file, entity } of entities.services) {
    (entity.requires as unknown[]).forEach((c, i) => {
      for (const m of validateCondition(c, `requires[${i}]`)) issues.push({ file, message: `service "${entity.id}": ${m}` });
    });
    (entity.effects as unknown[]).forEach((e, i) => {
      for (const m of validateEffect(e, `effects[${i}]`)) issues.push({ file, message: `service "${entity.id}": ${m}` });
      const eff = e as Record<string, unknown>;
      if (typeof eff.grant_augment === "string" && !ids.augments.has(eff.grant_augment)) issues.push({ file, message: `service "${entity.id}" grants unknown augment "${eff.grant_augment}"` });
      const item = (eff.add_item ?? eff.remove_item) as unknown[] | undefined;
      if (Array.isArray(item) && !ids.items.has(String(item[0]))) issues.push({ file, message: `service "${entity.id}" uses unknown item "${String(item[0])}"` });
      if (eff.use_service !== undefined) issues.push({ file, message: `service "${entity.id}" cannot use another service` });
    });
  }
  // Dialogue may only use services that exist.
  for (const { file, dialogue } of compiled) {
    for (const m of JSON.stringify(dialogue).matchAll(/"(?:use_service|can_service)":"([^"]+)"/g)) {
      if (!ids.services.has(m[1]!)) issues.push({ file, message: `uses unknown service "${m[1]}"` });
    }
  }

  // 5. Puzzles and terminals.
  issues.push(...checkPuzzles(entities.puzzles));
  issues.push(...checkTerminals(entities.terminals, ids.puzzles, ids.clues, mapData.map((m) => m.map)));
  const terminalIds = ids.terminals;
  for (const { file, map } of mapData) {
    for (const t of map.terminals) {
      if (!terminalIds.has(t.id)) issues.push({ file, message: `terminal "${t.id}" is not defined in content/terminals` });
    }
  }

  return issues;
}
