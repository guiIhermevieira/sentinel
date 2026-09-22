import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gql, startApp, submitAndWait, TestContext } from './helpers';

const { WindowsService } = require('../dist/windows/windows.service');
const { RecheckService } = require('../dist/windows/recheck.service');
const { StaleSweeperService } = require('../dist/maintenance/stale-sweeper.service');
const { REDIS } = require('../dist/redis/redis.module');

let ctx: TestContext;
beforeAll(async () => { ctx = await startApp(); });
afterAll(async () => { await ctx?.app.close(); });

async function wipeWindows() {
  const redis = ctx.app.get(REDIS);
  const keys: string[] = await redis.keys('sentinel:*');
  if (keys.length > 0) await redis.del(...keys);
}

const ruleIds = (tx: { alerts: { ruleId: string }[] }) => tx.alerts.map((a) => a.ruleId);

describe('Redis coming back empty (ADR-004: run now, re-check later)', () => {
  it('catches a velocity breach that degraded mode missed', async () => {
    const customerId = `cust-${crypto.randomUUID()}`;
    const start = Date.now() - 60_000;
    for (let i = 0; i < 10; i++) {
      await submitAndWait(ctx, { customerId, occurredAt: new Date(start + i * 1000).toISOString() });
    }

    await wipeWindows();
    const eleventh = await submitAndWait(ctx, { customerId, occurredAt: new Date(start + 10_000).toISOString() });
    expect(ruleIds(eleventh)).toEqual([]);
    expect(eleventh.needsRecheck).toBe(true);

    await ctx.app.get(WindowsService).ensureReady();
    expect(await ctx.app.get(RecheckService).run()).toBeGreaterThanOrEqual(1);

    const res = await gql(ctx, `query ($id: ID!) { transaction(id: $id) { needsRecheck riskScore alerts { ruleId partialContext } } }`, { id: eleventh.id });
    expect(res.data.transaction).toEqual({ needsRecheck: false, riskScore: 20, alerts: [{ ruleId: 'velocity', partialContext: false }] });

    const cases = await gql(ctx, `query ($c: String!) { cases(customerId: $c) { alertCount riskScore } }`, { c: customerId });
    expect(cases.data.cases).toEqual([{ alertCount: 1, riskScore: 20 }]);
  });

  it('marks alerts raised with incomplete history, then clears the mark without duplicating them', async () => {
    const customerId = `cust-${crypto.randomUUID()}`;
    const now = Date.now();
    await wipeWindows();
    await submitAndWait(ctx, { customerId, type: 'deposit', amount: 400_000, occurredAt: new Date(now - 60_000).toISOString() });
    const withdrawal = await submitAndWait(ctx, { customerId, type: 'withdrawal', amount: 390_000, occurredAt: new Date(now).toISOString() });
    expect(withdrawal.alerts).toMatchObject([{ ruleId: 'rapid-in-out', partialContext: true }]);

    await ctx.app.get(WindowsService).ensureReady();
    await ctx.app.get(RecheckService).run();

    const res = await gql(ctx, `query ($id: ID!) { transaction(id: $id) { riskScore alerts { ruleId partialContext } } }`, { id: withdrawal.id });
    expect(res.data.transaction).toEqual({ riskScore: 35, alerts: [{ ruleId: 'rapid-in-out', partialContext: false }] });
  });

  it('lets only one instance warm up while others wait for it', async () => {
    await wipeWindows();
    const windows = ctx.app.get(WindowsService);
    await Promise.all([windows.ensureReady(), windows.ensureReady(), windows.ensureReady()]);
    expect(await windows.isReady()).toBe(true);
  });

  it('does not re-check anything while windows are still missing', async () => {
    await wipeWindows();
    expect(await ctx.app.get(RecheckService).run()).toBe(0);
    await ctx.app.get(WindowsService).ensureReady();
  });
});

describe('stale-transaction sweeper (ADR-001)', () => {
  it('re-enqueues a transaction that was saved but never queued', async () => {
    const [row] = await ctx.db.query(
      `INSERT INTO transactions (idempotency_key, request_hash, external_id, customer_id, type, amount, currency, occurred_at, received_at)
       VALUES ($1, 'x', 'ext', $2, 'deposit', 5000000, 'BRL', now(), now() - interval '10 minutes') RETURNING id`,
      [crypto.randomUUID(), `cust-${crypto.randomUUID()}`],
    );
    expect(await ctx.app.get(StaleSweeperService).sweep()).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < 100; i++) {
      const [tx] = await ctx.db.query(`SELECT status, risk_score FROM transactions WHERE id = $1`, [row.id]);
      if (tx.status === 'evaluated') {
        expect(tx.risk_score).toBe(30);
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('Swept transaction was never evaluated');
  });

  it('leaves recent transactions alone', async () => {
    await ctx.db.query(
      `INSERT INTO transactions (idempotency_key, request_hash, external_id, customer_id, type, amount, currency, occurred_at)
       VALUES ($1, 'x', 'ext', 'cust-recent', 'deposit', 1000, 'BRL', now())`,
      [crypto.randomUUID()],
    );
    const before = await ctx.db.query(`SELECT count(*)::int AS n FROM transactions WHERE status = 'received' AND received_at > now() - interval '1 minute'`);
    await ctx.app.get(StaleSweeperService).sweep();
    const after = await ctx.db.query(`SELECT count(*)::int AS n FROM transactions WHERE status = 'received' AND received_at > now() - interval '1 minute'`);
    expect(after[0].n).toBe(before[0].n);
  });
});
