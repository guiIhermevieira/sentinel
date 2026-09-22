import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gql, postTx, startApp, submitAndWait, TestContext, txBody, waitForEvaluation } from './helpers';

const { EvaluationProcessor } = require('../dist/processing/evaluation.processor');

let ctx: TestContext;
beforeAll(async () => { ctx = await startApp(); });
afterAll(async () => { await ctx?.app.close(); });

const newCustomer = () => `cust-${randomUUID()}`;
const LARGE = 5_000_000;

const CASES_FOR_CUSTOMER = `
  query ($customerId: String!) {
    cases(customerId: $customerId) {
      id status riskScore alertCount closedAt resolutionNote
      alerts { ruleId score transaction { id amount customerId } }
    }
  }`;

async function casesFor(customerId: string) {
  const res = await gql(ctx, CASES_FOR_CUSTOMER, { customerId });
  expect(res.errors).toBeUndefined();
  return res.data.cases as any[];
}

async function mutate(name: 'startReview' | 'escalateCase' | 'dismissCase', id: string, note?: string) {
  const args = name === 'startReview' ? '$id: ID!' : name === 'dismissCase' ? '$id: ID!, $note: String!' : '$id: ID!, $note: String';
  const call = name === 'startReview' ? 'startReview(id: $id)' : `${name}(id: $id, note: $note)`;
  return gql(ctx, `mutation (${args}) { ${call} { id status closedAt resolutionNote } }`, { id, note });
}

describe('case aggregation', () => {
  it('opens a case for the first alert, with alerts and transactions resolvable', async () => {
    const customerId = newCustomer();
    const tx = await submitAndWait(ctx, { customerId, amount: LARGE });

    const [c, ...rest] = await casesFor(customerId);
    expect(rest).toHaveLength(0);
    expect(c).toMatchObject({ status: 'open', riskScore: 30, alertCount: 1 });
    expect(c.alerts[0]).toMatchObject({ ruleId: 'large-amount', transaction: { id: tx.id, amount: LARGE, customerId } });
  });

  it('adds later alerts for the same customer to the same case', async () => {
    const customerId = newCustomer();
    await submitAndWait(ctx, { customerId, amount: LARGE });
    await submitAndWait(ctx, { customerId, amount: LARGE });

    const cases = await casesFor(customerId);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ riskScore: 60, alertCount: 2 });
  });

  it('creates exactly one case when alerts for a customer are processed concurrently', async () => {
    const customerId = newCustomer();
    const responses = await Promise.all(Array.from({ length: 6 }, () => postTx(ctx, txBody({ customerId, amount: LARGE }))));
    await Promise.all(responses.map((r) => waitForEvaluation(ctx, r.body.id)));

    const cases = await casesFor(customerId);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ alertCount: 6, riskScore: 180 });
  });

  it('does not double-count when a transaction is evaluated again after a crash', async () => {
    const customerId = newCustomer();
    const tx = await submitAndWait(ctx, { customerId, amount: LARGE });

    await ctx.db.query(`UPDATE transactions SET status = 'received' WHERE id = $1`, [tx.id]);
    await ctx.app.get(EvaluationProcessor).process({ data: { transactionId: tx.id } });

    const [c] = await casesFor(customerId);
    expect(c).toMatchObject({ alertCount: 1, riskScore: 30 });
  });

  it('opens a new case once the previous one is closed', async () => {
    const customerId = newCustomer();
    await submitAndWait(ctx, { customerId, amount: LARGE });
    const [first] = await casesFor(customerId);
    expect((await mutate('escalateCase', first.id, 'Reported to compliance')).errors).toBeUndefined();

    await submitAndWait(ctx, { customerId, amount: LARGE });
    const cases = await casesFor(customerId);
    expect(cases.map((c) => c.status).sort()).toEqual(['escalated', 'open']);
  });
});

describe('case workflow', () => {
  async function openCase() {
    const customerId = newCustomer();
    await submitAndWait(ctx, { customerId, amount: LARGE });
    return (await casesFor(customerId))[0];
  }

  it('moves a case through review to escalation', async () => {
    const c = await openCase();
    const review = await mutate('startReview', c.id);
    expect(review.data.startReview).toMatchObject({ status: 'in_review', closedAt: null });

    const escalated = await mutate('escalateCase', c.id, 'Pattern consistent with layering');
    expect(escalated.data.escalateCase).toMatchObject({ status: 'escalated', resolutionNote: 'Pattern consistent with layering' });
    expect(escalated.data.escalateCase.closedAt).not.toBeNull();
  });

  it('requires a note to dismiss', async () => {
    const c = await openCase();
    const res = await mutate('dismissCase', c.id, '   ');
    expect(res.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
  });

  it('rejects invalid transitions', async () => {
    const c = await openCase();
    await mutate('dismissCase', c.id, 'False positive: payroll deposit');

    const res = await mutate('startReview', c.id);
    expect(res.errors?.[0]?.extensions?.code).toBe('INVALID_TRANSITION');
    expect(res.errors?.[0]?.message).toContain('dismissed');
  });

  it('returns NOT_FOUND for unknown cases', async () => {
    const res = await mutate('startReview', randomUUID());
    expect(res.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
  });

  it('lets only one of two concurrent analyst actions win', async () => {
    const c = await openCase();
    const [a, b] = await Promise.all([mutate('escalateCase', c.id, 'Escalating'), mutate('dismissCase', c.id, 'Dismissing')]);
    const winners = [a, b].filter((r) => !r.errors);
    const losers = [a, b].filter((r) => r.errors);
    expect(winners).toHaveLength(1);
    expect(losers[0]?.errors?.[0]?.extensions?.code).toBe('INVALID_TRANSITION');
  });
});

describe('rules through the full pipeline', () => {
  const ruleIds = (tx: { alerts: { ruleId: string }[] }) => tx.alerts.map((a) => a.ruleId).sort();

  it('detects structuring', async () => {
    const customerId = newCustomer();
    const start = Date.now();
    const results = [];
    for (let i = 0; i < 3; i++) {
      results.push(await submitAndWait(ctx, { customerId, amount: 950_000, occurredAt: new Date(start + i * 60_000).toISOString() }));
    }
    expect(results.map(ruleIds)).toEqual([[], [], ['structuring']]);
  });

  it('detects rapid in-and-out', async () => {
    const customerId = newCustomer();
    const start = Date.now();
    await submitAndWait(ctx, { customerId, type: 'deposit', amount: 400_000, occurredAt: new Date(start).toISOString() });
    const withdrawal = await submitAndWait(ctx, {
      customerId, type: 'withdrawal', amount: 390_000, occurredAt: new Date(start + 5 * 60_000).toISOString(),
    });
    expect(ruleIds(withdrawal)).toEqual(['rapid-in-out']);
  });

  it('detects high-value activity on a new account', async () => {
    const now = Date.now();
    const tx = await submitAndWait(ctx, {
      amount: 2_000_000, occurredAt: new Date(now).toISOString(), accountCreatedAt: new Date(now - 3_600_000).toISOString(),
    });
    expect(ruleIds(tx)).toEqual(['new-account-high-value']);
  });

  it('exposes a transaction and its alerts over GraphQL', async () => {
    const tx = await submitAndWait(ctx, { amount: LARGE });
    const res = await gql(ctx, `query ($id: ID!) { transaction(id: $id) { id riskScore alerts { ruleId } } }`, { id: tx.id });
    expect(res.data.transaction).toEqual({ id: tx.id, riskScore: 30, alerts: [{ ruleId: 'large-amount' }] });
  });
});
