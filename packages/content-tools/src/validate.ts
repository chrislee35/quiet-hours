import Ajv from "ajv";
import type { ClueDef } from "@qh/core";
import { validateCondition, validateEffect, ConfigError, TiledImportError, WorldError, buildWorld, compileDialogue, importTiled, validateConfig, type Dialogue, type MapData } from "@qh/core";
import { clueGates, cluesGiven, unrecoverableTrust } from "./dialogue-checks.ts";
import { checkPuzzles, checkTerminals } from "./terminal-checks.ts";
import { analyseWeb } from "./web.ts";
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
  /** What a new game starts with (credits and items): the real game and the solvability checker both read it. */
  start?: ContentFile;
}

interface Entity {
  id: string;
  [key: string]: unknown;
}

/** Referenced-entity kinds that a "<kind>:<id>" source string may point at. */
const sourceKinds: Partial<Record<string, Kind>> = { npc: "npcs" };

export function validateContent(bundle: ContentBundle): Issue[] {
  const issues: Issue[] = [];
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
  const entities: Record<Kind, { file: string; entity: Entity }[]> = { clues: [], npcs: [], puzzles: [], terminals: [], augments: [], items: [], services: [], reactions: [], quests: [], goals: [], growth: [], companions: [], closing: [], broadcasts: [] };

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
  const ids: Record<Kind, Set<string>> = { clues: new Set(), npcs: new Set(), puzzles: new Set(), terminals: new Set(), augments: new Set(), items: new Set(), services: new Set(), reactions: new Set(), quests: new Set(), goals: new Set(), growth: new Set(), companions: new Set(), closing: new Set(), broadcasts: new Set() };
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

  // The information web's design rules (T3.1).
  const clueFile = new Map(entities.clues.map(({ file, entity }) => [entity.id, file] as const));
  issues.push(...analyseWeb(entities.clues.map((c) => c.entity as unknown as ClueDef), new Set(entities.npcs.map((n) => n.entity.id)), (id) => clueFile.get(id) ?? "clues").issues);

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

  // Past-self breadcrumbs (PST-1): each of the six is reachable from at least two independent directions: a
  // conversation, a pickup on a map, or a terminal. Clues carry a `breadcrumb:<name>` tag.
  const providers = new Map<string, Set<string>>();
  const provide = (clue: string, who: string) => providers.set(clue, (providers.get(clue) ?? new Set()).add(who));
  for (const { dialogue } of compiled) for (const c of cluesGiven(dialogue)) provide(c, `conversation ${dialogue.npc}`);
  for (const { map } of mapData) for (const p of map.pickups ?? []) for (const part of p.grant.split("+")) { const [k, id] = part.split(":"); if (k === "clue" && id) provide(id, `pickup ${p.id}`); }
  for (const { entity } of entities.terminals) for (const e of (entity.onSolve as { give_clue?: { id: string } }[] | undefined) ?? []) if (e.give_clue) provide(e.give_clue.id, `terminal ${String(entity.id)}`);
  for (const { file, entity } of entities.clues) {
    const crumb = ((entity.tags as string[] | undefined) ?? []).find((t) => t.startsWith("breadcrumb:"));
    if (crumb && (providers.get(String(entity.id))?.size ?? 0) < 2) {
      issues.push({ file, message: `breadcrumb "${crumb.slice(11)}" (clue "${entity.id}") is reachable from ${providers.get(String(entity.id))?.size ?? 0} direction(s); it needs at least 2 (PST-1)` });
    }
  }

  // The single inventory puzzle (PUZ-2): exactly one puzzle is built from recipes, and every part it asks for can be had.
  const recipes = entities.services.filter(({ entity }) => entity.inventoryPuzzle !== undefined);
  const puzzleIds = new Set(recipes.map(({ entity }) => String(entity.inventoryPuzzle)));
  if (puzzleIds.size !== 1) issues.push({ file: "services", message: `the game has exactly one inventory puzzle (PUZ-2); found ${puzzleIds.size}${puzzleIds.size ? `: ${[...puzzleIds].join(", ")}` : ""}` });
  const itemSources = new Set<string>();
  for (const { text } of bundle.dialogues) for (const m of text.matchAll(/\+item:([a-z][a-z0-9_]*)/g)) itemSources.add(m[1]!);
  for (const { map } of mapData) for (const p of map.pickups ?? []) for (const part of p.grant.split("+")) { const [k, id] = part.split(":"); if (k === "item" && id) itemSources.add(id); }
  for (const { entity } of entities.services) for (const e of entity.effects as { add_item?: [string, number] }[]) if (e.add_item) itemSources.add(e.add_item[0]);
  for (const { file, entity } of recipes) {
    for (const c of entity.requires as { has_item?: string | [string, number] }[]) {
      const id = Array.isArray(c.has_item) ? c.has_item[0] : c.has_item;
      if (id && !itemSources.has(id)) issues.push({ file, message: `inventory puzzle recipe "${entity.id}" needs "${id}", which nothing ever gives the player` });
    }
  }

  // Trust must always be recoverable: anyone whose trust can be lowered must be someone it can be raised with.
  for (const npc of unrecoverableTrust(compiled.map((c) => c.dialogue))) {
    issues.push({ file: `npc ${npc}`, message: `trust in "${npc}" can be lowered but there is no way to raise it from the worst state (CMP-4)` });
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
      for (const part of p.grant.split("+")) {
        const [kind, id, n] = part.split(":");
        if (kind === "augment" && !ids.augments.has(id ?? "")) issues.push({ file, message: `pickup "${p.id}" grants unknown augment "${id}"` });
        if (kind === "item" && !ids.items.has(id ?? "")) issues.push({ file, message: `pickup "${p.id}" grants unknown item "${id}"` });
        if (kind === "clue" && !ids.clues.has(id ?? "")) issues.push({ file, message: `pickup "${p.id}" grants unknown clue "${id}"` });
        if (kind === "item" && n !== undefined) {
          const item = entities.items.find(({ entity }) => entity.id === id)?.entity;
          if (item && item.stackable === false) issues.push({ file, message: `pickup "${p.id}" grants several of non-stackable item "${id}"` });
        }
      }
      const [rk, rid] = (p.requires ?? "").split(":");
      if (rk === "augment" && !ids.augments.has(rid ?? "")) issues.push({ file, message: `pickup "${p.id}" requires unknown augment "${rid}"` });
      if (rk === "item" && !ids.items.has(rid ?? "")) issues.push({ file, message: `pickup "${p.id}" requires unknown item "${rid}"` });
      if (rk === "clue" && !ids.clues.has(rid ?? "")) issues.push({ file, message: `pickup "${p.id}" requires unknown clue "${rid}"` });
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
  for (const { file, entity } of entities.reactions) {
    ((entity.if as unknown[] | undefined) ?? []).forEach((c, i) => {
      for (const m of validateCondition(c, `if[${i}]`)) issues.push({ file, message: `reaction "${entity.id}": ${m}` });
    });
    (entity.effects as unknown[]).forEach((e, i) => {
      for (const m of validateEffect(e, `effects[${i}]`)) issues.push({ file, message: `reaction "${entity.id}": ${m}` });
    });
  }
  // Quests: well-formed conditions, only about clues that exist, unique step ids.
  const clueRefs = (c: unknown): string[] => {
    if (typeof c !== "object" || c === null) return [];
    const o = c as Record<string, unknown>;
    if (typeof o.has_clue === "string") return [o.has_clue];
    if (Array.isArray(o.clue_state)) return [String(o.clue_state[0])];
    if (Array.isArray(o.all)) return o.all.flatMap(clueRefs);
    if (Array.isArray(o.any)) return o.any.flatMap(clueRefs);
    return o.not !== undefined ? clueRefs(o.not) : [];
  };
  for (const { file, entity } of entities.quests) {
    const say = (m: string) => issues.push({ file, message: `quest "${entity.id}": ${m}` });
    const lists: [string, unknown[]][] = [["start", entity.start as unknown[]], ["complete", entity.complete as unknown[]], ["failed", (entity.failed as unknown[] | undefined) ?? []]];
    for (const step of entity.steps as { id: string; done: unknown[] }[]) lists.push([`step "${step.id}"`, step.done]);
    for (const [where, conds] of lists) {
      conds.forEach((c, i) => {
        for (const m of validateCondition(c, `${where}[${i}]`)) say(m);
        for (const id of clueRefs(c)) if (!ids.clues.has(id)) say(`${where}[${i}] refers to unknown clue "${id}"`);
      });
    }
    const stepIds = (entity.steps as { id: string }[]).map((s) => s.id);
    if (new Set(stepIds).size !== stepIds.length) say("has a duplicate step id");
  }
  // Goals: conditions well-formed, on a map that exists, about clues that exist.
  for (const { file, entity } of entities.goals) {
    const say = (m: string) => issues.push({ file, message: `goal "${entity.id}": ${m}` });
    if (!mapIds.has(String(entity.map))) say(`names unknown map "${String(entity.map)}"`);
    (entity.require as unknown[]).forEach((c, i) => {
      for (const m of validateCondition(c, `require[${i}]`)) say(m);
      for (const id of clueRefs(c)) if (!ids.clues.has(id)) say(`require[${i}] refers to unknown clue "${id}"`);
    });
  }
  if (bundle.start) {
    const s = bundle.start.data as { credits?: unknown; items?: unknown };
    if (!Number.isInteger(s.credits) || (s.credits as number) < 0) issues.push({ file: bundle.start.file, message: "credits must be a whole number >= 0" });
    for (const [id, n] of Object.entries((s.items ?? {}) as Record<string, unknown>)) {
      if (!ids.items.has(id)) issues.push({ file: bundle.start.file, message: `starts with unknown item "${id}"` });
      if (!Number.isInteger(n) || (n as number) < 1) issues.push({ file: bundle.start.file, message: `item "${id}" needs a count of at least 1` });
    }
  }
  // Safehouse growth: well-formed conditions; props may only show growths that exist; dialogue may only gate on real ones.
  for (const { file, entity } of entities.growth) {
    (entity.when as unknown[]).forEach((c, i) => {
      for (const m of validateCondition(c, `when[${i}]`)) issues.push({ file, message: `growth "${entity.id}": ${m}` });
      for (const id of clueRefs(c)) if (!ids.clues.has(id)) issues.push({ file, message: `growth "${entity.id}": when[${i}] refers to unknown clue "${id}"` });
    });
  }
  for (const { file, map } of mapData) for (const p of map.props ?? []) {
    if (p.shows !== undefined && !ids.growth.has(p.shows)) issues.push({ file, message: `prop "${p.id}" shows unknown growth "${p.shows}"` });
  }
  for (const { file, dialogue } of compiled) {
    for (const m of JSON.stringify(dialogue).matchAll(/"has_growth":"([^"]+)"/g)) if (!ids.growth.has(m[1]!)) issues.push({ file, message: `gates on unknown growth "${m[1]}"` });
  }
  // Companions (CMP-1/5): well-formed gates and route complications; every route service asks about the companion;
  // dialogue and services may only refer to real candidates and real routes.
  const ROUTE_IDS = ["sneak", "hack", "break"];
  for (const { file, entity } of entities.companions) {
    const lists: [string, unknown[]][] = [["active", entity.active as unknown[]], ["gate", entity.gate as unknown[]]];
    const routes = (entity.routes ?? {}) as Record<string, { requires?: unknown[]; harder?: string }>;
    for (const r of ROUTE_IDS) {
      const rt = routes[r];
      if (!rt || !Array.isArray(rt.requires) || typeof rt.harder !== "string" || rt.harder.trim() === "") issues.push({ file, message: `companion "${entity.id}": route "${r}" needs requires (a list) and harder (what it costs them, in words)` });
      else lists.push([`routes.${r}.requires`, rt.requires]);
    }
    for (const r of Object.keys(routes)) if (!ROUTE_IDS.includes(r)) issues.push({ file, message: `companion "${entity.id}": unknown route "${r}"` });
    ((entity.fate ?? []) as { when: unknown[]; state: string }[]).forEach((f, i) => {
      if (!["escaped", "free", "hiding", "arrested", "left"].includes(f.state) || f.state === "escaped") issues.push({ file, message: `companion "${entity.id}": fate[${i}] state must be free, hiding, arrested or left` });
      lists.push([`fate[${i}].when`, f.when]);
    });
    for (const [where, conds] of lists) (conds ?? []).forEach((c, i) => {
      for (const m of validateCondition(c, `${where}[${i}]`)) issues.push({ file, message: `companion "${entity.id}": ${m}` });
      for (const id of clueRefs(c)) if (!ids.clues.has(id)) issues.push({ file, message: `companion "${entity.id}": ${where}[${i}] refers to unknown clue "${id}"` });
    });
    if (!JSON.stringify(entity.gate).includes('"trust_gte"')) issues.push({ file, message: `companion "${entity.id}": the gate must require trust (trust_gte)` });
  }
  // The Civic Voice (T3.15): well-formed conditions and effects; clues it hands out must exist.
  for (const { file, entity } of entities.broadcasts) {
    ((entity.when ?? []) as unknown[]).forEach((c, i) => {
      for (const m of validateCondition(c, `when[${i}]`)) issues.push({ file, message: `broadcast "${entity.id}": ${m}` });
      for (const id of clueRefs(c)) if (!ids.clues.has(id)) issues.push({ file, message: `broadcast "${entity.id}": when[${i}] refers to unknown clue "${id}"` });
    });
    ((entity.effects ?? []) as unknown[]).forEach((e, i) => {
      for (const m of validateEffect(e, `effects[${i}]`)) issues.push({ file, message: `broadcast "${entity.id}": ${m}` });
    });
    for (const m of JSON.stringify(entity.effects ?? []).matchAll(/"give_clue":\{"id":"([^"]+)"/g)) if (!ids.clues.has(m[1]!)) issues.push({ file, message: `broadcast "${entity.id}" gives unknown clue "${m[1]}"` });
  }
  // The closing scene (END-2): one scene; a mentor must be voiced both ways (romantic or platonic is the player's choice).
  if (entities.closing.length !== 1 || entities.closing[0]!.entity.id !== "scene") issues.push({ file: "closing", message: `there must be exactly one closing scene with the id "scene" (found ${entities.closing.length})` });
  for (const { file, entity } of entities.companions) {
    const c = entity.closing as { gratitude_romantic?: string } | undefined;
    if (entity.role === "mentor" && !c?.gratitude_romantic) issues.push({ file, message: `companion "${entity.id}" is a mentor and needs a romantic gratitude line as well as the platonic one` });
  }
  const refs = (text: string, key: string) => [...text.matchAll(new RegExp(`"${key}":"([^"]+)"`, "g"))].map((m) => m[1]!);
  const companionRefs = (file: string, text: string) => {
    for (const id of refs(text, "can_bring")) if (!ids.companions.has(id)) issues.push({ file, message: `asks whether unknown candidate "${id}" can be brought` });
    for (const r of refs(text, "route_clear")) if (!ROUTE_IDS.includes(r)) issues.push({ file, message: `route_clear names unknown route "${r}"` });
  };
  for (const { file, dialogue } of compiled) companionRefs(file, JSON.stringify(dialogue));
  for (const { file, entity } of entities.services) {
    companionRefs(file, JSON.stringify(entity.requires));
    const setsRoute = (entity.effects as { set_flag?: [string, unknown] }[]).find((e) => e.set_flag?.[0] === "route_taken");
    if (setsRoute) {
      const route = String(setsRoute.set_flag![1]);
      if (!JSON.stringify(entity.requires).includes(`"route_clear":"${route}"`)) issues.push({ file, message: `route service "${entity.id}" must require route_clear "${route}", so the chosen companion's requirements apply (CMP-5)` });
    }
  }
  // Exits: the map they lead to, the spawn there, and the fare (a service) must exist.
  for (const { file, map } of mapData) for (const e of map.exits ?? []) {
    const target = mapData.find((m) => m.map.id === e.to);
    if (!target) issues.push({ file, message: `exit "${e.id}" leads to unknown map "${e.to}"` });
    else if (!target.map.spawns.some((s) => s.id === e.spawn)) issues.push({ file, message: `exit "${e.id}" leads to spawn "${e.spawn}", which map "${e.to}" does not have` });
    if (e.fare !== undefined && !ids.services.has(e.fare)) issues.push({ file, message: `exit "${e.id}" uses unknown fare service "${e.fare}"` });
  }
  // Optional gossip must stay optional: no goal, quest, terminal, service or reaction may require a gossip clue.
  const gossipIds = new Set(entities.clues.filter(({ entity }) => (entity.tags as string[]).includes("topic:gossip")).map(({ entity }) => entity.id));
  const needsGossip = (file: string, what: string, conds: unknown[]) => {
    for (const c of conds) for (const id of clueRefs(c)) if (gossipIds.has(id)) issues.push({ file, message: `${what} depends on the gossip clue "${id}"; gossip is optional and nothing may require it` });
  };
  for (const { file, entity } of entities.goals) needsGossip(file, `goal "${entity.id}"`, entity.require as unknown[]);
  for (const { file, entity } of entities.quests) needsGossip(file, `quest "${entity.id}"`, [...(entity.start as unknown[]), ...(entity.complete as unknown[]), ...((entity.failed as unknown[] | undefined) ?? [])]);
  for (const { file, entity } of entities.terminals) needsGossip(file, `terminal "${entity.id}"`, entity.bypass as unknown[]);
  for (const { file, entity } of entities.services) needsGossip(file, `service "${entity.id}"`, entity.requires as unknown[]);
  for (const { file, entity } of entities.reactions) needsGossip(file, `reaction "${entity.id}"`, (entity.if as unknown[] | undefined) ?? []);
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
