import type { Config } from "../config.ts";
import type { Ctx } from "../ctx.ts";
import type { TrustLevel } from "../events.ts";
import { applyEffects, evalAll } from "../rules.ts";
import type { SimState } from "../state.ts";
import type { Content, Dialogue, DialogueLine, DialogueNode } from "./types.ts";

/**
 * Dialogue runtime (T1.8). A conversation is state (`state.conversation`) plus commands; while one is
 * active the world is frozen (CORE-4). The UI reads `dialogueView` and sends Choose / Present / EndConversation.
 */

export interface NotebookEntryView {
  clueId: string;
  text: string;
  from: string;
  status: "unverified" | "verified" | "disproved";
}

/** What the dialogue window shows. Hidden information (clue reliability) never appears here. */
export interface DialogueView {
  dialogueId: string;
  npc: string;
  name: string;
  /** Mood of the NPC's latest line, for the portrait. */
  mood: string | null;
  lines: DialogueLine[];
  /** Only options whose conditions hold; `index` is what Choose expects. */
  choices: { index: number; text: string }[];
  canPresent: boolean;
  /** Clues the player can present (the whole notebook). */
  presentable: NotebookEntryView[];
  canLeave: boolean;
  /** The single trust status line, or null when this NPC does not show one (CMP-3). */
  trustLine: string | null;
}

export function trustLine(name: string, level: TrustLevel): string {
  if (level >= 1) return `It appears that ${name} trusts you.`;
  if (level <= -1) return `It appears that ${name} does not trust you.`;
  return `It appears that ${name} is unsure about you.`;
}

export function notebookEntries(state: Readonly<SimState>, content: Content): NotebookEntryView[] {
  return Object.entries(state.clues)
    .sort(([, a], [, b]) => a.learnedTick - b.learnedTick)
    .map(([clueId, e]) => ({ clueId, text: content.clues[clueId]?.text ?? `(unknown clue ${clueId})`, from: e.from, status: e.status }));
}

function visibleChoices(node: DialogueNode, state: Readonly<SimState>, config: Config) {
  return node.choices
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => evalAll(c.if, state, config))
    .map(({ c }, index) => ({ index, choice: c }));
}

export function dialogueView(state: Readonly<SimState>, content: Content, config: Config): DialogueView | null {
  const conv = state.conversation;
  if (!conv) return null;
  const d = content.dialogues[conv.dialogueId];
  const node = d?.nodes[conv.node];
  if (!d || !node) return null;
  const npcLines = node.lines.filter((l) => l.speaker === d.npc);
  return {
    dialogueId: d.id,
    npc: d.npc,
    name: d.name,
    mood: npcLines.at(-1)?.mood ?? null,
    lines: node.lines,
    choices: visibleChoices(node, state, config).map(({ index, choice }) => ({ index, text: choice.text })),
    canPresent: node.present !== null,
    presentable: node.present !== null ? notebookEntries(state, content) : [],
    canLeave: node.end,
    trustLine: d.trackTrust ? trustLine(d.name, state.trust[d.npc] ?? 0) : null,
  };
}

function enterNode(ctx: Ctx, d: Dialogue, nodeId: string): void {
  const { state, events } = ctx;
  const node = d.nodes[nodeId];
  if (!node) {
    // Compiled dialogue never refers to a missing node; fail safe by ending rather than wedging the game.
    endConversation(ctx);
    return;
  }
  state.conversation = { dialogueId: d.id, node: nodeId };
  events.push({ type: "ConversationNode", tick: state.tick, dialogueId: d.id, node: nodeId });
  applyEffects(node.onEnter, state, events, ctx.config);
}

export function startConversation(ctx: Ctx, dialogueId: string): boolean {
  const { state, config, content, events } = ctx;
  const d = content.dialogues[dialogueId];
  if (!d || state.conversation) return false;
  const entry = d.start.find((s) => evalAll(s.if, state, config));
  if (!entry) return false;
  state.player.intent = { dx: 0, dy: 0, mode: "walk" };
  events.push({ type: "ConversationStarted", tick: state.tick, dialogueId: d.id, npc: d.npc });
  enterNode(ctx, d, entry.goto);
  return true;
}

export function endConversation(ctx: Ctx): void {
  const { state, events } = ctx;
  if (!state.conversation) return;
  events.push({ type: "ConversationEnded", tick: state.tick, dialogueId: state.conversation.dialogueId });
  state.conversation = null;
}

function currentNode(ctx: Ctx): { d: Dialogue; node: DialogueNode } | null {
  const conv = ctx.state.conversation;
  const d = conv && ctx.content.dialogues[conv.dialogueId];
  const node = d && conv ? d.nodes[conv.node] : undefined;
  return d && node ? { d, node } : null;
}

function follow(ctx: Ctx, d: Dialogue, goto: string): void {
  if (goto === "end") endConversation(ctx);
  else enterNode(ctx, d, goto);
}

/** Pick a visible option by its index in the view's list. Invalid indexes are ignored. */
export function chooseOption(ctx: Ctx, index: number): void {
  const cur = currentNode(ctx);
  if (!cur) return;
  const picked = visibleChoices(cur.node, ctx.state, ctx.config).find((v) => v.index === index);
  if (!picked) return;
  applyEffects(picked.choice.effects, ctx.state, ctx.events, ctx.config);
  follow(ctx, cur.d, picked.choice.goto);
}

/** Show the NPC a clue from the notebook. The first matching reaction in the node wins. */
export function presentClue(ctx: Ctx, clueId: string): void {
  const cur = currentNode(ctx);
  if (!cur || cur.node.present === null || ctx.state.clues[clueId] === undefined) return;
  const reliability = ctx.content.clues[clueId]?.reliability;
  const reaction = cur.node.present.find(
    (r) =>
      (r.clue === "*" || r.clue === clueId) &&
      (r.reliability === undefined || r.reliability === reliability) &&
      evalAll(r.if, ctx.state, ctx.config),
  );
  if (!reaction) return;
  ctx.events.push({ type: "CluePresented", tick: ctx.state.tick, clueId, npc: cur.d.npc });
  applyEffects(reaction.effects, ctx.state, ctx.events, ctx.config);
  follow(ctx, cur.d, reaction.goto);
}
