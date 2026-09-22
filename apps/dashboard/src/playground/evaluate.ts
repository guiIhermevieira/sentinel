import { createRule, InMemoryWindowStore, Rule, RuleError, RuleHit, RulesEngine, validateRuleConfig } from '@sentinel-aml/rules-core';
import { formatDuration } from '../format';
import { PlaygroundTx, RULE_META, RuleState } from './model';

export const BASE_TIME = Date.UTC(2026, 8, 22, 12, 0);
export const RETENTION_MS = 24 * 60 * 60 * 1000;

export interface LedgerRow {
  tx: PlaygroundTx;
  hits: RuleHit[];
  newHits: RuleHit[];
  score: number;
  retry: boolean;
  errors: RuleError[];
}

export interface CaseSummary {
  customerId: string;
  alertCount: number;
  riskScore: number;
  rules: string[];
}

export interface PlaygroundResult {
  rows: LedgerRow[];
  cases: CaseSummary[];
  ruleErrors: Record<string, string[]>;
  activeRules: number;
  alertCount: number;
}

export async function evaluatePlayground(transactions: PlaygroundTx[], rules: RuleState[]): Promise<PlaygroundResult> {
  const ruleErrors: Record<string, string[]> = {};
  const active: Rule[] = [];
  for (const rule of rules) {
    const errors = validateRuleConfig(rule.ruleId, rule.config, { maxWindowMs: RETENTION_MS });
    if (errors.length > 0) ruleErrors[rule.ruleId] = errors.map((e) => humanizeError(rule.ruleId, e));
    else if (rule.enabled) active.push(createRule(rule.ruleId, rule.config));
  }

  const latestMinute = transactions.reduce((max, tx) => Math.max(max, tx.minute), 0);
  const windows = new InMemoryWindowStore(RETENTION_MS, () => BASE_TIME + latestMinute * 60_000);
  const engine = new RulesEngine({ rules: active, windows });

  const seen = new Set<string>();
  const recorded = new Set<string>();
  const cases = new Map<string, CaseSummary>();
  const rows: LedgerRow[] = [];

  for (const tx of transactions) {
    const retry = seen.has(tx.id);
    seen.add(tx.id);
    const occurredAt = new Date(BASE_TIME + tx.minute * 60_000);
    const result = await engine.evaluate({
      id: tx.id,
      customerId: tx.customerId,
      type: tx.type,
      amount: tx.amountCents,
      currency: 'BRL',
      occurredAt,
      accountCreatedAt: tx.accountAgeHours === undefined ? undefined : new Date(occurredAt.getTime() - tx.accountAgeHours * 3_600_000),
    });

    const newHits = result.hits.filter((hit) => !recorded.has(`${tx.id}:${hit.ruleId}`));
    newHits.forEach((hit) => recorded.add(`${tx.id}:${hit.ruleId}`));
    if (newHits.length > 0) {
      const summary = cases.get(tx.customerId) ?? { customerId: tx.customerId, alertCount: 0, riskScore: 0, rules: [] };
      summary.alertCount += newHits.length;
      summary.riskScore += newHits.reduce((sum, h) => sum + h.score, 0);
      newHits.forEach((h) => summary.rules.includes(h.ruleId) || summary.rules.push(h.ruleId));
      cases.set(tx.customerId, summary);
    }

    rows.push({ tx, hits: result.hits, newHits, score: result.totalScore, retry, errors: result.errors });
  }

  return {
    rows,
    cases: [...cases.values()].sort((a, b) => b.riskScore - a.riskScore),
    ruleErrors,
    activeRules: active.length,
    alertCount: [...cases.values()].reduce((n, c) => n + c.alertCount, 0),
  };
}

export function humanizeError(ruleId: string, message: string): string {
  const fields = RULE_META[ruleId]?.fields ?? {};
  return message
    .replace(/"(\w+)"/g, (_, name: string) => fields[name]?.label ?? name)
    .replace(/(\d+)ms/g, (_, ms: string) => formatDuration(Number(ms)))
    .replace(/^./, (c) => c.toUpperCase());
}
