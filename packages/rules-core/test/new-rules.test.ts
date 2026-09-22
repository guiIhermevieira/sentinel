import { describe, expect, it } from 'vitest';
import {
  InMemoryWindowStore,
  NewAccountHighValueRule,
  RapidInOutRule,
  Rule,
  RulesEngine,
  StructuringRule,
  Transaction,
} from '../src';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const base = new Date('2026-01-01T12:00:00Z').getTime();

let seq = 0;
function tx(overrides: Partial<Transaction> & { at?: number } = {}): Transaction {
  const { at = 0, ...rest } = overrides;
  seq += 1;
  return {
    id: `tx-${seq}`,
    customerId: 'cust-1',
    type: 'deposit',
    amount: 1_000,
    currency: 'BRL',
    occurredAt: new Date(base + at),
    ...rest,
  };
}

function engine(rules: Rule[]) {
  return new RulesEngine({ rules, windows: new InMemoryWindowStore(48 * HOUR, () => base) });
}

const ruleIds = (r: { hits: { ruleId: string }[] }) => r.hits.map((h) => h.ruleId);

describe('StructuringRule', () => {
  const rule = () =>
    new StructuringRule({ reportingThreshold: 1_000_000, margin: 0.1, windowMs: 24 * HOUR, minCount: 3, types: ['deposit'], weight: 40 });

  it('flags the transaction that completes the pattern', async () => {
    const e = engine([rule()]);
    expect(ruleIds(await e.evaluate(tx({ amount: 950_000 })))).toEqual([]);
    expect(ruleIds(await e.evaluate(tx({ amount: 990_000, at: HOUR })))).toEqual([]);
    expect(ruleIds(await e.evaluate(tx({ amount: 920_000, at: 2 * HOUR })))).toEqual(['structuring']);
  });

  it('ignores amounts outside the just-below band', async () => {
    const e = engine([rule()]);
    await e.evaluate(tx({ amount: 950_000 }));
    await e.evaluate(tx({ amount: 1_000_000, at: HOUR }));
    await e.evaluate(tx({ amount: 500_000, at: 2 * HOUR }));
    expect(ruleIds(await e.evaluate(tx({ amount: 960_000, at: 3 * HOUR })))).toEqual([]);
  });

  it('only counts transactions inside the window', async () => {
    const e = engine([rule()]);
    await e.evaluate(tx({ amount: 950_000, at: -30 * HOUR }));
    await e.evaluate(tx({ amount: 950_000 }));
    expect(ruleIds(await e.evaluate(tx({ amount: 950_000, at: HOUR })))).toEqual([]);
  });

  it('does not count a retried transaction twice', async () => {
    const e = engine([rule()]);
    const first = tx({ amount: 950_000 });
    await e.evaluate(first);
    await e.evaluate(first);
    expect(ruleIds(await e.evaluate(tx({ amount: 950_000, at: HOUR })))).toEqual([]);
  });

  it('ignores transaction types it is not configured for', async () => {
    const e = engine([rule()]);
    for (let i = 0; i < 3; i++) {
      expect(ruleIds(await e.evaluate(tx({ type: 'bet', amount: 950_000, at: i * HOUR })))).toEqual([]);
    }
  });
});

describe('RapidInOutRule', () => {
  const rule = () => new RapidInOutRule({ windowMs: 30 * MINUTE, minRatio: 0.9, minAmount: 100_000, weight: 35 });

  it('flags a similar withdrawal shortly after a deposit', async () => {
    const e = engine([rule()]);
    await e.evaluate(tx({ type: 'deposit', amount: 500_000 }));
    const result = await e.evaluate(tx({ type: 'withdrawal', amount: 480_000, at: 10 * MINUTE }));
    expect(ruleIds(result)).toEqual(['rapid-in-out']);
  });

  it('ignores withdrawals much smaller than the deposit', async () => {
    const e = engine([rule()]);
    await e.evaluate(tx({ type: 'deposit', amount: 500_000 }));
    expect(ruleIds(await e.evaluate(tx({ type: 'withdrawal', amount: 200_000, at: 10 * MINUTE })))).toEqual([]);
  });

  it('ignores withdrawals outside the window', async () => {
    const e = engine([rule()]);
    await e.evaluate(tx({ type: 'deposit', amount: 500_000 }));
    expect(ruleIds(await e.evaluate(tx({ type: 'withdrawal', amount: 500_000, at: 45 * MINUTE })))).toEqual([]);
  });

  it('ignores small amounts', async () => {
    const e = engine([rule()]);
    await e.evaluate(tx({ type: 'deposit', amount: 50_000 }));
    expect(ruleIds(await e.evaluate(tx({ type: 'withdrawal', amount: 50_000, at: MINUTE })))).toEqual([]);
  });

  it('does not match deposits that happen after the withdrawal', async () => {
    const e = engine([rule()]);
    const withdrawal = tx({ type: 'withdrawal', amount: 500_000 });
    await e.evaluate(tx({ type: 'deposit', amount: 500_000, at: MINUTE }));
    expect(ruleIds(await e.evaluate(withdrawal))).toEqual([]);
  });
});

describe('NewAccountHighValueRule', () => {
  const rule = () => new NewAccountHighValueRule({ accountAgeMs: 7 * 24 * HOUR, threshold: 1_000_000, weight: 25 });

  it('flags high-value activity on a new account', async () => {
    const e = engine([rule()]);
    const result = await e.evaluate(tx({ amount: 2_000_000, accountCreatedAt: new Date(base - 2 * HOUR) }));
    expect(ruleIds(result)).toEqual(['new-account-high-value']);
  });

  it('ignores older accounts, small amounts and missing account dates', async () => {
    const e = engine([rule()]);
    expect(ruleIds(await e.evaluate(tx({ amount: 2_000_000, accountCreatedAt: new Date(base - 30 * 24 * HOUR) })))).toEqual([]);
    expect(ruleIds(await e.evaluate(tx({ amount: 500_000, accountCreatedAt: new Date(base - HOUR) })))).toEqual([]);
    expect(ruleIds(await e.evaluate(tx({ amount: 2_000_000 })))).toEqual([]);
  });
});
