import { describe, expect, it } from 'vitest';
import { createRule, InMemoryWindowStore, RULE_CATALOG, RulesEngine, Transaction, validateRuleConfig } from '../src';

const velocity = { windowMs: 300_000, maxCount: 10, weight: 20 };

describe('validateRuleConfig', () => {
  it('accepts a valid config', () => {
    expect(validateRuleConfig('velocity', velocity)).toEqual([]);
  });

  it('reports missing, unknown and malformed fields', () => {
    expect(validateRuleConfig('velocity', { windowMs: 1.5, weight: 20, extra: true })).toEqual([
      'Unknown field "extra"',
      '"windowMs" must be an integer',
      '"maxCount" is required',
    ]);
  });

  it('rejects windows longer than the store retention', () => {
    expect(validateRuleConfig('velocity', velocity, { maxWindowMs: 60_000 })).toEqual([
      '"windowMs" must not exceed the window store retention of 60000ms',
    ]);
  });

  it('validates fractions and transaction types', () => {
    const base = { reportingThreshold: 1_000_000, windowMs: 1000, minCount: 3, weight: 40 };
    expect(validateRuleConfig('structuring', { ...base, margin: 1, types: ['deposit'] })).toEqual([
      '"margin" must be greater than 0 and less than 1',
    ]);
    expect(validateRuleConfig('structuring', { ...base, margin: 0.1, types: ['teleport'] })).toEqual([
      '"types" may only contain deposit, withdrawal, bet, payout, transfer',
    ]);
  });

  it('rejects unknown rules and non-object configs', () => {
    expect(validateRuleConfig('nope', {})).toEqual(['Unknown rule "nope"']);
    expect(validateRuleConfig('velocity', [1, 2])).toEqual(['Config must be an object']);
  });
});

describe('createRule', () => {
  it('builds working rules from plain config', async () => {
    const engine = new RulesEngine({
      rules: [createRule('large-amount', { threshold: 100, weight: 5 })],
      windows: new InMemoryWindowStore(60_000),
    });
    const tx: Transaction = { id: 't1', customerId: 'c1', type: 'deposit', amount: 100, currency: 'BRL', occurredAt: new Date() };
    expect((await engine.evaluate(tx)).hits.map((h) => h.ruleId)).toEqual(['large-amount']);
  });

  it('throws on invalid config', () => {
    expect(() => createRule('large-amount', { threshold: 0, weight: 5 })).toThrow('"threshold" must be at least 1');
  });

  it('marks stateful rules consistently with the catalog', () => {
    const configs: Record<string, object> = {
      'large-amount': { threshold: 1, weight: 1 },
      velocity,
      structuring: { reportingThreshold: 10, margin: 0.1, windowMs: 1, minCount: 2, types: ['deposit'], weight: 1 },
      'rapid-in-out': { windowMs: 1, minRatio: 1, minAmount: 0, weight: 1 },
      'new-account-high-value': { accountAgeMs: 1, threshold: 1, weight: 1 },
    };
    for (const [id, entry] of Object.entries(RULE_CATALOG)) {
      expect(Boolean(createRule(id, configs[id]).stateful)).toBe(entry.stateful);
    }
  });
});

describe('RulesEngine', () => {
  it('reads rules from a dynamic source and supports filtering', async () => {
    let rules = [createRule('large-amount', { threshold: 100, weight: 5 })];
    const engine = new RulesEngine({ rules: { current: () => rules }, windows: new InMemoryWindowStore(60_000) });
    const tx = (id: string): Transaction => ({ id, customerId: 'c1', type: 'deposit', amount: 500, currency: 'BRL', occurredAt: new Date() });

    expect((await engine.evaluate(tx('a'))).hits).toHaveLength(1);
    rules = [];
    expect((await engine.evaluate(tx('b'))).hits).toHaveLength(0);
    rules = [createRule('large-amount', { threshold: 100, weight: 5 })];
    expect((await engine.evaluate(tx('c'), { filter: (r) => Boolean(r.stateful) })).hits).toHaveLength(0);
  });
});
