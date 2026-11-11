/**
 * Economy (T2.5, ECO-1..3). Credits are earned and spent through effects. A *service* is a content entity: a
 * price, requirements in the shared condition language, and effects. Using one checks, in order: it exists,
 * a legitimate service is not offered to someone with no record (the null state, ECO-3), it has not been used
 * if it is once-only, its requirements hold, and the player can pay. A refusal carries its own line of text, so
 * the null state gets a specific answer instead of a generic "no".
 *
 * Loans are a ledger: interest compounds once per in-game day, and past the due date collectors come each day,
 * take a share of what the player carries, and raise the alert.
 */
import { MINUTES_PER_DAY, gameTimeAt } from "./clock.ts";
import type { Config } from "./config.ts";
import type { Content } from "./dialogue/types.ts";
import type { Ctx } from "./ctx.ts";
import type { GameEvent } from "./events.ts";
import { ticksPerGameMinute } from "./identity.ts";
import { applyEffects, evalAll, type Condition, type Effect } from "./rules.ts";
import type { SimState } from "./state.ts";

export interface ServiceDef {
  id: string;
  name: string;
  description: string;
  /** Credits charged when the service is used (0 for barter and favours). */
  price: number;
  /** A city service that wants a record on file: refused to the null state until the player has some identity. */
  legitimate: boolean;
  /** Can only be used once per game. */
  once: boolean;
  requires: Condition[];
  effects: Effect[];
  successText: string;
  /** Lines for each way it can be refused; sensible defaults apply to any left out. */
  refusals?: { null_state?: string; requirements?: string; funds?: string; once?: string };
}

export interface Loan {
  lender: string;
  principal: number;
  owed: number;
  takenTick: number;
  dueTick: number;
}

export type ServiceRefusal = "unknown" | "null_state" | "requirements" | "funds" | "once";

export type ServiceStatus = { ok: true } | { ok: false; reason: ServiceRefusal; text: string };

const doneFlag = (id: string) => `service_done_${id}`;

export function serviceStatus(state: Readonly<SimState>, content: Content, config: Config, id: string): ServiceStatus {
  const s = content.services[id];
  if (!s) return { ok: false, reason: "unknown", text: "Nothing like that is on offer." };
  const r = s.refusals ?? {};
  if (s.legitimate && state.passes.length === 0) {
    return { ok: false, reason: "null_state", text: r.null_state ?? "There is no record of you. Come back with identification." };
  }
  if (s.once && state.flags[doneFlag(id)]) return { ok: false, reason: "once", text: r.once ?? "That has already been done." };
  if (!evalAll(s.requires, state, config, content)) return { ok: false, reason: "requirements", text: r.requirements ?? "You do not meet the requirements." };
  if (state.inventory.credits < s.price) return { ok: false, reason: "funds", text: r.funds ?? `That costs ${s.price} credits.` };
  return { ok: true };
}

/** Uses a service: charges the price, applies its effects, and reports the outcome (and its line of text). */
export function useService(state: SimState, content: Content, config: Config, events: GameEvent[], id: string): boolean {
  const status = serviceStatus(state, content, config, id);
  const tick = state.tick;
  if (!status.ok) {
    events.push({ type: "ServiceRefused", tick, serviceId: id, reason: status.reason, text: status.text });
    if (state.conversation) state.conversation.notice = status.text;
    return false;
  }
  const s = content.services[id]!;
  if (s.price > 0) applyEffects([{ add_credits: -s.price }], state, events, config, content);
  if (s.once) state.flags[doneFlag(id)] = true;
  applyEffects(s.effects, state, events, config, content);
  events.push({ type: "ServiceUsed", tick, serviceId: id, price: s.price });
  if (state.conversation && s.successText) state.conversation.notice = s.successText;
  return true;
}

export function takeLoan(state: SimState, config: Config, events: GameEvent[], lender: string, amount: number): void {
  const due = state.tick + Math.round(config.economy.loanDueDays * MINUTES_PER_DAY * ticksPerGameMinute(config));
  const existing = state.loans.debts.find((l) => l.lender === lender);
  if (existing) {
    existing.principal += amount;
    existing.owed += amount;
    existing.dueTick = Math.max(existing.dueTick, due);
  } else {
    state.loans.debts.push({ lender, principal: amount, owed: amount, takenTick: state.tick, dueTick: due });
  }
  state.inventory.credits += amount;
  events.push({ type: "LoanTaken", tick: state.tick, lender, amount, owed: (existing ?? state.loans.debts.at(-1)!).owed });
  events.push({ type: "CreditsChanged", tick: state.tick, delta: amount, total: state.inventory.credits });
}

/** Pays up to `amount`, limited by what is owed and what the player has. Returns what was paid. */
export function repayLoan(state: SimState, events: GameEvent[], lender: string, amount: number): number {
  const debt = state.loans.debts.find((l) => l.lender === lender);
  if (!debt) return 0;
  const pay = Math.max(0, Math.min(amount, debt.owed, state.inventory.credits));
  if (pay === 0) return 0;
  debt.owed -= pay;
  state.inventory.credits -= pay;
  events.push({ type: "CreditsChanged", tick: state.tick, delta: -pay, total: state.inventory.credits });
  events.push({ type: "LoanRepaid", tick: state.tick, lender, paid: pay, owed: debt.owed });
  if (debt.owed === 0) state.loans.debts = state.loans.debts.filter((l) => l !== debt);
  return pay;
}

export const totalOwed = (state: Readonly<SimState>, lender?: string): number =>
  state.loans.debts.filter((l) => lender === undefined || l.lender === lender).reduce((n, l) => n + l.owed, 0);

/** Once per new in-game day: interest compounds, and overdue debts are visited by collectors. */
export function economySystem(ctx: Ctx): void {
  const { state, config, events } = ctx;
  const day = gameTimeAt(state.tick, config).day;
  const days = day - state.loans.lastDay;
  if (days <= 0) return;
  state.loans.lastDay = day;
  for (const debt of [...state.loans.debts]) {
    for (let i = 0; i < days; i++) debt.owed = Math.ceil(debt.owed * (1 + config.economy.loanInterestPerDay));
    events.push({ type: "InterestAccrued", tick: state.tick, lender: debt.lender, owed: debt.owed });
    if (state.tick < debt.dueTick) continue;
    const taken = Math.min(debt.owed, Math.ceil(state.inventory.credits * config.economy.garnishFraction));
    if (taken > 0) {
      state.inventory.credits -= taken;
      debt.owed -= taken;
      events.push({ type: "CreditsChanged", tick: state.tick, delta: -taken, total: state.inventory.credits });
    }
    events.push({ type: "CollectorsCame", tick: state.tick, lender: debt.lender, taken, owed: debt.owed });
    applyEffects([{ raise_alert_to: 1 }], state, events, config, ctx.content);
    if (debt.owed === 0) state.loans.debts = state.loans.debts.filter((l) => l !== debt);
  }
}
