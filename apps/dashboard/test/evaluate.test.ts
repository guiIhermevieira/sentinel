import { describe, expect, it } from 'vitest';
import { evaluatePlayground, humanizeError } from '../src/playground/evaluate';
import { cloneRules, DEFAULT_RULES } from '../src/playground/model';
import { buildScenario } from '../src/playground/scenarios';

const run = (id: string, rules = cloneRules(DEFAULT_RULES)) => evaluatePlayground(buildScenario(id).transactions, rules);
const flagged = (result: Awaited<ReturnType<typeof run>>) =>
  result.rows.filter((r) => r.newHits.length > 0).map((r) => `${r.tx.id}:${r.newHits.map((h) => h.ruleId).join('+')}`);

describe('use case scenarios', () => {
  it('flags only the large deposit', async () => {
    expect(flagged(await run('large-amount'))).toEqual(['tx-2002:large-amount']);
  });

  it('flags the 11th and 12th bets of a burst', async () => {
    expect(flagged(await run('velocity'))).toEqual(['tx-3011:velocity', 'tx-3012:velocity']);
  });

  it('completes the pattern on the third just-below amount, not counting the one at the threshold', async () => {
    expect(flagged(await run('structuring'))).toEqual(['tx-4004:structuring']);
  });

  it('flags a withdrawal of most of a recent deposit only', async () => {
    expect(flagged(await run('rapid-in-out'))).toEqual(['tx-5002:rapid-in-out']);
  });

  it('flags the new account but not the established one', async () => {
    expect(flagged(await run('new-account'))).toEqual(['tx-6001:new-account-high-value']);
  });

  it('raises nothing on ordinary activity', async () => {
    const result = await run('clean');
    expect(result.alertCount).toBe(0);
    expect(result.cases).toEqual([]);
  });

  it('groups every alert for a customer into one case', async () => {
    const result = await run('cases');
    expect(result.cases.map((c) => c.customerId)).toEqual(['kaique', 'lara']);
    expect(result.cases[0]!.rules.sort()).toEqual(['new-account-high-value', 'rapid-in-out', 'structuring']);
  });

  it('never double-counts a retried transaction', async () => {
    const result = await run('retries');
    expect(result.rows[1]!.retry).toBe(true);
    expect(result.rows[1]!.newHits).toEqual([]);
    expect(result.cases).toEqual([{ customerId: 'marina', alertCount: 1, riskScore: 30, rules: ['large-amount'] }]);
  });
});

describe('rule configuration', () => {
  it('skips disabled rules', async () => {
    const rules = cloneRules(DEFAULT_RULES).map((r) => (r.ruleId === 'large-amount' ? { ...r, enabled: false } : r));
    expect((await run('large-amount', rules)).alertCount).toBe(0);
  });

  it('reports invalid configs in plain language and leaves that rule out', async () => {
    const rules = cloneRules(DEFAULT_RULES).map((r) => (r.ruleId === 'velocity' ? { ...r, config: { ...r.config, windowMs: 172_800_000 } } : r));
    const result = await run('velocity', rules);
    expect(result.ruleErrors.velocity).toEqual(['Time window must not exceed the window store retention of 24 hours']);
    expect(result.alertCount).toBe(0);
  });

  it('humanizes field names and durations', () => {
    expect(humanizeError('velocity', '"maxCount" must be at least 1')).toBe('Maximum transactions must be at least 1');
  });
});
