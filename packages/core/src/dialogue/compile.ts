/**
 * Compiler for the `.qdl` dialogue format (T1.8, DESIGN §5, DLG-5). One file is one conversation.
 * See docs/dialogue.md for the author-facing reference.
 */
import { validateCondition, validateEffect, type Condition, type Effect } from "../rules.ts";
import type { FlagValue } from "../events.ts";
import type { Choice, Dialogue, DialogueNode, Reaction, Reliability } from "./types.ts";

export interface CompileError {
  line: number;
  message: string;
}

export interface CompileOptions {
  /** The conversation id (the file name without extension). */
  id: string;
  /** When given, every clue id mentioned must be in this set. */
  knownClues?: ReadonlySet<string>;
  /** When given, every NPC id mentioned in a trust effect must be in this set. */
  knownNpcs?: ReadonlySet<string>;
}

const ID = "[a-z][a-z0-9_]*";
const RELIABILITIES: readonly string[] = ["true", "false", "outdated", "planted"];
const TRUST_WORDS: Record<string, number> = { distrusts: -1, unsure: 0, trusts: 1 };

function parseValue(raw: string): FlagValue {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

interface Parsed<T> {
  items: T[];
  reliability?: Reliability;
}

/** Parses the inside of `[ ... ]`. Each comma-separated token becomes one Condition. */
function parseConditions(text: string, allowReliability: boolean, fail: (m: string) => void): Parsed<Condition> {
  const out: Parsed<Condition> = { items: [] };
  for (const token of text.split(",").map((t) => t.trim()).filter(Boolean)) {
    let t = token;
    const negate = t.startsWith("!");
    if (negate) t = t.slice(1);
    let c: Condition | null = null;
    let m: RegExpMatchArray | null;
    if ((m = t.match(new RegExp(`^clue:(${ID})$`)))) c = { has_clue: m[1]! };
    else if ((m = t.match(new RegExp(`^(verified|disproved|unverified):(${ID})$`)))) c = { clue_state: [m[2]!, m[1] as "verified"] };
    else if ((m = t.match(new RegExp(`^flag:(${ID})=(.+)$`)))) c = { flag_eq: [m[1]!, parseValue(m[2]!)] };
    else if ((m = t.match(new RegExp(`^flag:(${ID})$`)))) c = { flag: m[1]! };
    else if ((m = t.match(new RegExp(`^item:(${ID})>=(\\d+)$`)))) c = { has_item: [m[1]!, Number(m[2])] };
    else if ((m = t.match(new RegExp(`^item:(${ID})$`)))) c = { has_item: m[1]! };
    else if ((m = t.match(new RegExp(`^augment:(${ID})$`)))) c = { augment_equipped: m[1]! };
    else if ((m = t.match(new RegExp(`^owns:(${ID})$`)))) c = { has_augment: m[1]! };
    else if ((m = t.match(new RegExp(`^can:(${ID})$`)))) c = { can_service: m[1]! };
    else if (t === "record") c = { has_record: true };
    else if (t === "curfew") c = { is_curfew: true };
    else if (t === "quiet") c = { is_quiet_hours: true };
    else if ((m = t.match(new RegExp(`^debt:(${ID}|\\*)$`)))) c = { in_debt: m[1]! };
    else if ((m = t.match(/^credits>=(\d+)$/))) c = { credits_gte: Number(m[1]) };
    else if ((m = t.match(new RegExp(`^trust:(${ID})>=(-?\\d|distrusts|unsure|trusts)$`)))) {
      const lvl = m[2]! in TRUST_WORDS ? TRUST_WORDS[m[2]!]! : Number(m[2]);
      c = { trust_gte: [m[1]!, lvl as -1 | 0 | 1] };
    } else if ((m = t.match(new RegExp(`^pass:(${ID})$`)))) c = { has_pass: m[1]! };
    else if ((m = t.match(/^alert>=([0-3])$/))) c = { alert_gte: Number(m[1]) as 0 | 1 | 2 | 3 };
    else if ((m = t.match(/^arrests>=(\d+)$/))) c = { arrest_count_gte: Number(m[1]) };
    else if ((m = t.match(/^time:(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/))) {
      c = { time_between: [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])] };
    } else if ((m = t.match(/^reliability:(\w+)$/))) {
      if (!allowReliability) fail(`"${token}": reliability conditions only apply to present: reactions`);
      else if (negate) fail(`"${token}": reliability cannot be negated`);
      else if (!RELIABILITIES.includes(m[1]!)) fail(`"${token}": reliability must be one of ${RELIABILITIES.join(", ")}`);
      else out.reliability = m[1] as Reliability;
      continue;
    } else {
      fail(`unknown condition "${token}"`);
      continue;
    }
    if (negate) c = { not: c };
    const problems = validateCondition(c);
    if (problems.length > 0) fail(`"${token}": ${problems.join("; ")}`);
    else out.items.push(c);
  }
  return out;
}

/** Parses the inside of `{ ... }`. */
function parseEffects(text: string, defaultFrom: string, fail: (m: string) => void): Effect[] {
  const out: Effect[] = [];
  for (const token of text.split(",").map((t) => t.trim()).filter(Boolean)) {
    let e: Effect | null = null;
    let m: RegExpMatchArray | null;
    if ((m = token.match(new RegExp(`^\\+clue:(${ID})(?:\\(([^)]+)\\))?$`)))) e = { give_clue: { id: m[1]!, from: m[2]?.trim() || defaultFrom } };
    else if ((m = token.match(new RegExp(`^verify:(${ID})$`)))) e = { verify_clue: m[1]! };
    else if ((m = token.match(new RegExp(`^disprove:(${ID})$`)))) e = { disprove_clue: m[1]! };
    else if ((m = token.match(new RegExp(`^flag:(${ID})=(.+)$`)))) e = { set_flag: [m[1]!, parseValue(m[2]!)] };
    else if ((m = token.match(new RegExp(`^flag:(${ID})$`)))) e = { set_flag: [m[1]!, true] };
    else if ((m = token.match(new RegExp(`^([+-])item:(${ID})(?:\\*(\\d+))?$`)))) {
      const n = m[3] ? Number(m[3]) : 1;
      e = m[1] === "+" ? { add_item: [m[2]!, n] } : { remove_item: [m[2]!, n] };
    } else if ((m = token.match(/^([+-])credits:(\d+)$/))) e = { add_credits: (m[1] === "-" ? -1 : 1) * Number(m[2]) };
    else if ((m = token.match(new RegExp(`^trust:(${ID})([+-]\\d+)$`)))) e = { adjust_trust: [m[1]!, Number(m[2])] };
    else if ((m = token.match(new RegExp(`^\\+augment:(${ID})$`)))) e = { grant_augment: m[1]! };
    else if ((m = token.match(new RegExp(`^service:(${ID})$`)))) e = { use_service: m[1]! };
    else if ((m = token.match(new RegExp(`^loan:(${ID})\\*(\\d+)$`)))) e = { take_loan: [m[1]!, Number(m[2])] };
    else if ((m = token.match(new RegExp(`^repay:(${ID})\\*(\\d+)$`)))) e = { repay_loan: [m[1]!, Number(m[2])] };
    else if ((m = token.match(new RegExp(`^-pass:(${ID})$`)))) e = { revoke_pass: m[1]! };
    else if ((m = token.match(/^alert:([0-3])$/))) e = { raise_alert_to: Number(m[1]) as 0 | 1 | 2 | 3 };
    else if ((m = token.match(new RegExp(`^emit:(${ID})$`)))) e = { emit: m[1]! };
    if (!e) {
      fail(`unknown effect "${token}"`);
      continue;
    }
    const problems = validateEffect(e);
    if (problems.length > 0) fail(`"${token}": ${problems.join("; ")}`);
    else out.push(e);
  }
  return out;
}

function parseString(raw: string, fail: (m: string) => void): string | null {
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v === "string") return v;
  } catch {
    /* fall through */
  }
  fail(`invalid quoted text ${raw}`);
  return null;
}

interface NodeBuild {
  node: DialogueNode;
  line: number;
  choiceLines: number[];
  reactionLines: number[];
}

export function compileDialogue(source: string, opts: CompileOptions): { dialogue: Dialogue | null; errors: CompileError[] } {
  const errors: CompileError[] = [];
  const err = (line: number, message: string) => errors.push({ line, message });

  let npc = "";
  let name = "";
  let trackTrust = false;
  const start: { if: Condition[]; goto: string; line: number }[] = [];
  const nodes = new Map<string, NodeBuild>();
  let cur: NodeBuild | null = null;
  let inPresent = false;

  const STR = '"(?:[^"\\\\]|\\\\.)*"';
  const speakerRe = new RegExp(`^(${ID})(?:\\s*\\(([a-z_]+)\\))?\\s*:\\s*(${STR})\\s*$`);
  const choiceRe = new RegExp(`^>\\s*(?:\\[([^\\]]*)\\]\\s*)?(${STR})\\s*(?:\\{([^}]*)\\}\\s*)?->\\s*(${ID})\\s*$`);
  const reactionRe = new RegExp(`^(\\*|${ID})\\s*(?:\\[([^\\]]*)\\]\\s*)?(?:\\{([^}]*)\\}\\s*)?->\\s*(${ID})\\s*$`);

  source.split(/\r?\n/).forEach((rawLine, i) => {
    const ln = i + 1;
    const line = rawLine.trim();
    if (line === "" || line.startsWith("//")) return;
    const fail = (m: string) => err(ln, m);
    let m: RegExpMatchArray | null;

    if ((m = line.match(new RegExp(`^node:\\s*(${ID})\\s*$`)))) {
      const id = m[1]!;
      if (nodes.has(id)) fail(`duplicate node "${id}"`);
      cur = { node: { id, onEnter: [], lines: [], choices: [], present: null, end: false }, line: ln, choiceLines: [], reactionLines: [] };
      nodes.set(id, cur);
      inPresent = false;
      return;
    }

    if (cur === null) {
      // Header section
      if ((m = line.match(new RegExp(`^npc:\\s*(${ID})\\s*$`)))) npc = m[1]!;
      else if ((m = line.match(/^name:\s*(.+?)\s*$/))) name = m[1]!;
      else if ((m = line.match(/^trust:\s*(yes|no)\s*$/))) trackTrust = m[1] === "yes";
      else if ((m = line.match(/^start:\s*(.+)$/))) {
        const sm = m[1]!.match(new RegExp(`^(${ID})\\s*(?:\\[([^\\]]*)\\])?\\s*$`));
        if (!sm) fail(`bad start line; expected "start: node [conditions]"`);
        else start.push({ goto: sm[1]!, if: sm[2] ? parseConditions(sm[2], false, fail).items : [], line: ln });
      } else fail(`unexpected line before the first node: "${line}"`);
      return;
    }

    const node = cur.node;
    if (inPresent && (m = line.match(reactionRe)) && !line.startsWith(">")) {
      const parsed = m[2] ? parseConditions(m[2], true, fail) : { items: [] as Condition[], reliability: undefined };
      const reaction: Reaction = {
        clue: m[1]!,
        if: parsed.items,
        effects: m[3] ? parseEffects(m[3], npc, fail) : [],
        goto: m[4]!,
      };
      if (parsed.reliability) reaction.reliability = parsed.reliability;
      node.present!.push(reaction);
      cur.reactionLines.push(ln);
      return;
    }
    inPresent = false;

    if ((m = line.match(/^on_enter:\s*\{([^}]*)\}\s*$/))) node.onEnter.push(...parseEffects(m[1]!, npc, fail));
    else if (line === "end") node.end = true;
    else if (line === "present:") {
      if (node.present) fail("a node can have only one present: block");
      node.present = node.present ?? [];
      inPresent = true;
    } else if ((m = line.match(choiceRe))) {
      const text = parseString(m[2]!, fail);
      if (text === null) return;
      const choice: Choice = {
        text,
        if: m[1] ? parseConditions(m[1], false, fail).items : [],
        effects: m[3] ? parseEffects(m[3], npc, fail) : [],
        goto: m[4]!,
      };
      node.choices.push(choice);
      cur.choiceLines.push(ln);
    } else if ((m = line.match(speakerRe))) {
      const text = parseString(m[3]!, fail);
      if (text !== null) node.lines.push({ speaker: m[1]!, mood: m[2] ?? null, text });
    } else {
      fail(`cannot parse line: "${line}"`);
    }
  });

  // ---- Whole-file checks ----
  if (npc === "") err(1, 'missing header "npc: <id>"');
  if (nodes.size === 0) err(1, "no nodes: add at least one `node: <id>` section");
  if (name === "" && npc !== "") name = npc.charAt(0).toUpperCase() + npc.slice(1).replace(/_/g, " ");
  if (start.length === 0 && nodes.size > 0) {
    const first = [...nodes.keys()][0]!;
    start.push({ if: [], goto: first, line: 1 });
  }
  if (start.length > 0 && !start.some((s) => s.if.length === 0)) {
    err(start[0]!.line, 'at least one "start:" line must have no conditions, so a conversation can always begin');
  }

  const exists = (id: string) => id === "end" || nodes.has(id);
  for (const s of start) if (!nodes.has(s.goto)) err(s.line, `start refers to unknown node "${s.goto}"`);

  for (const b of nodes.values()) {
    const n = b.node;
    n.choices.forEach((c, i) => {
      if (!exists(c.goto)) err(b.choiceLines[i]!, `choice goes to unknown node "${c.goto}"`);
    });
    n.present?.forEach((r, i) => {
      if (!exists(r.goto)) err(b.reactionLines[i]!, `reaction goes to unknown node "${r.goto}"`);
    });
    if (n.choices.length === 0 && !n.end) {
      err(b.line, `dead end: node "${n.id}" has no choices and no "end"`);
    } else if (!n.end && !n.choices.some((c) => c.if.length === 0)) {
      err(b.line, `node "${n.id}" could leave the player with no visible choice: give one choice no conditions, or add "end"`);
    }
    if (n.present && !n.present.some((r) => r.clue === "*" && r.if.length === 0 && r.reliability === undefined)) {
      err(b.line, `node "${n.id}": present: needs an unconditional fallback "* -> node"`);
    }
  }

  // Reachability from the start entries.
  const seen = new Set<string>();
  const queue = start.map((s) => s.goto).filter((g) => nodes.has(g));
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = nodes.get(id)!.node;
    for (const t of [...n.choices.map((c) => c.goto), ...(n.present?.map((r) => r.goto) ?? [])]) {
      if (nodes.has(t) && !seen.has(t)) queue.push(t);
    }
  }
  for (const b of nodes.values()) if (!seen.has(b.node.id)) err(b.line, `unreachable node "${b.node.id}"`);

  // Reference checks against known content.
  const checkClue = (id: string, line: number) => {
    if (opts.knownClues && !opts.knownClues.has(id)) err(line, `unknown clue "${id}"`);
  };
  const scanCond = (c: Condition, line: number): void => {
    if ("all" in c) c.all.forEach((x) => scanCond(x, line));
    else if ("any" in c) c.any.forEach((x) => scanCond(x, line));
    else if ("not" in c) scanCond(c.not, line);
    else if ("has_clue" in c) checkClue(c.has_clue, line);
    else if ("clue_state" in c) checkClue(c.clue_state[0], line);
  };
  const scanEffect = (e: Effect, line: number): void => {
    if ("give_clue" in e) checkClue(e.give_clue.id, line);
    else if ("verify_clue" in e) checkClue(e.verify_clue, line);
    else if ("disprove_clue" in e) checkClue(e.disprove_clue, line);
    else if ("adjust_trust" in e && opts.knownNpcs && !opts.knownNpcs.has(e.adjust_trust[0])) err(line, `unknown NPC "${e.adjust_trust[0]}"`);
  };
  for (const s of start) s.if.forEach((c) => scanCond(c, s.line));
  for (const b of nodes.values()) {
    b.node.onEnter.forEach((e) => scanEffect(e, b.line));
    b.node.choices.forEach((c, i) => {
      c.if.forEach((x) => scanCond(x, b.choiceLines[i]!));
      c.effects.forEach((x) => scanEffect(x, b.choiceLines[i]!));
    });
    b.node.present?.forEach((r, i) => {
      if (r.clue !== "*") checkClue(r.clue, b.reactionLines[i]!);
      r.if.forEach((x) => scanCond(x, b.reactionLines[i]!));
      r.effects.forEach((x) => scanEffect(x, b.reactionLines[i]!));
    });
  }

  errors.sort((a, b) => a.line - b.line);
  if (errors.length > 0) return { dialogue: null, errors };

  const out: Record<string, DialogueNode> = {};
  for (const [id, b] of nodes) out[id] = b.node;
  return {
    dialogue: {
      id: opts.id,
      npc,
      name,
      trackTrust,
      start: start.map(({ if: cond, goto }) => ({ if: cond, goto })),
      nodes: out,
    },
    errors,
  };
}
