import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, postTx, startApp, TestContext, txBody, waitForEvaluation } from './helpers';

let ctx: TestContext;
beforeAll(async () => { ctx = await startApp(); });
afterAll(async () => { await ctx?.app.close(); });

describe('POST /transactions', () => {
  it('accepts a transaction and evaluates it asynchronously', async () => {
    const res = await postTx(ctx, txBody()).expect(202);
    expect(res.body.status).toBe('received');

    const tx = await waitForEvaluation(ctx, res.body.id);
    expect(tx.riskScore).toBe(0);
    expect(tx.alerts).toEqual([]);
  });

  it('raises an alert for a large amount', async () => {
    const res = await postTx(ctx, txBody({ amount: 5_000_000 })).expect(202);
    const tx = await waitForEvaluation(ctx, res.body.id);
    expect(tx.riskScore).toBe(30);
    expect(tx.alerts.map((a: { ruleId: string }) => a.ruleId)).toEqual(['large-amount']);
  });

  it('raises a velocity alert once a customer exceeds the limit', async () => {
    const customerId = `cust-${randomUUID()}`;
    const start = Date.now();
    const ids: string[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await postTx(ctx, txBody({ customerId, occurredAt: new Date(start + i * 1000).toISOString() })).expect(202);
      ids.push(res.body.id);
    }
    const results = await Promise.all(ids.map((id) => waitForEvaluation(ctx, id)));
    const flagged = results.filter((tx) => tx.alerts.some((a: { ruleId: string }) => a.ruleId === 'velocity'));
    expect(flagged.map((tx) => tx.id)).toEqual([ids[10]]);
  });
});

describe('idempotency', () => {
  it('replays the original response for the same key and body', async () => {
    const key = randomUUID();
    const payload = txBody();
    const first = await postTx(ctx, payload, key).expect(202);
    const second = await postTx(ctx, payload, key).expect(202);
    expect(second.body.id).toBe(first.body.id);
    expect(second.headers['idempotent-replayed']).toBe('true');
  });

  it('rejects the same key reused with a different body', async () => {
    const key = randomUUID();
    await postTx(ctx, txBody(), key).expect(202);
    await postTx(ctx, txBody(), key).expect(422);
  });

  it('stores exactly one transaction under concurrent retries', async () => {
    const key = randomUUID();
    const payload = txBody();
    const responses = await Promise.all(Array.from({ length: 5 }, () => postTx(ctx, payload, key)));
    expect(responses.every((r) => r.status === 202)).toBe(true);
    expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);

    const rows = await ctx.db.query('SELECT count(*)::int AS n FROM transactions WHERE idempotency_key = $1', [key]);
    expect(rows[0].n).toBe(1);
  });
});

describe('validation', () => {
  it('requires an Idempotency-Key header', async () => {
    await ctx.http.post('/transactions').set(bearer(ctx.keys.producer)).send(txBody()).expect(400);
  });

  it('rejects invalid payloads', async () => {
    await postTx(ctx, txBody({ amount: -5 })).expect(400);
    await postTx(ctx, txBody({ type: 'teleport' })).expect(400);
    await postTx(ctx, txBody({ unexpected: 'field' })).expect(400);
  });
});
