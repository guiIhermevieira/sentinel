import { describe, expect, it } from 'vitest';
import { InMemoryWindowStore, LargeAmountRule, Rule, RulesEngine, Transaction, VelocityRule } from '../src';

const MINUTE = 60_000;
const base = new Date('2026-01-01T12:00:00Z').getTime();

function tx(i: number, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `tx-${i}`,
    customerId: 'cust-1',
    type: 'deposit',
    amount: 1_000,
    currency: 'BRL',
    occurredAt: new Date(base + i * 1_000),
    ...overrides,
  };
}

function engine(rules: Rule[]) {
  const windows = new InMemoryWindowStore(60 * MINUTE, () => base + 10 * MINUTE);
  return new RulesEngine({ rules, windows });
}

describe('LargeAmountRule', () => {
  it('flags transactions at or above the threshold', async () => {
    const e = engine([new LargeAmountRule({ threshold: 50_000, weight: 30 })]);
    expect((await e.evaluate(tx(1, { amount: 49_999 }))).hits).toHaveLength(0);
    const result = await e.evaluate(tx(2, { amount: 50_000 }));
    expect(result.hits[0]?.ruleId).toBe('large-amount');
    expect(result.totalScore).toBe(30);
  });
});

describe('VelocityRule', () => {
  const velocity = () => new VelocityRule({ windowMs: 5 * MINUTE, maxCount: 3, weight: 20 });

  it('flags when the count in the window exceeds the limit', async () => {
    const e = engine([velocity()]);
    for (let i = 1; i <= 3; i++) {
      expect((await e.evaluate(tx(i))).hits).toHaveLength(0);
    }
    expect((await e.evaluate(tx(4))).hits[0]?.ruleId).toBe('velocity');
  });

  it('does not inflate counts when the same transaction is retried', async () => {
    const e = engine([velocity()]);
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await e.evaluate(tx(1))).hits).toHaveLength(0);
    }
  });

  it('only counts transactions inside the window', async () => {
    const e = engine([velocity()]);
    await e.evaluate(tx(0, { occurredAt: new Date(base - 10 * MINUTE) }));
    for (let i = 1; i <= 3; i++) await e.evaluate(tx(i));
    expect((await e.evaluate(tx(3))).hits).toHaveLength(0);
  });

  it('is deterministic when transactions are evaluated concurrently', async () => {
    const e = engine([velocity()]);
    const results = await Promise.all([1, 2, 3, 4, 5].map((i) => e.evaluate(tx(i))));
    expect(results.map((r) => r.hits.length)).toEqual([0, 0, 0, 1, 1]);
  });

  it('keeps customers isolated', async () => {
    const e = engine([velocity()]);
    for (let i = 1; i <= 3; i++) await e.evaluate(tx(i));
    expect((await e.evaluate(tx(99, { customerId: 'cust-2' }))).hits).toHaveLength(0);
  });
});

describe('RulesEngine', () => {
  it('isolates failing rules so the others still run', async () => {
    const broken: Rule = { id: 'broken', evaluate: async () => { throw new Error('boom'); } };
    const e = engine([broken, new LargeAmountRule({ threshold: 1, weight: 10 })]);
    const result = await e.evaluate(tx(1));
    expect(result.errors).toEqual([{ ruleId: 'broken', message: 'boom' }]);
    expect(result.hits).toHaveLength(1);
  });
});
