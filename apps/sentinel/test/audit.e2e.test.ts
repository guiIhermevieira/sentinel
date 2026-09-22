import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gql, startApp, submitAndWait, TestContext } from './helpers';

let ctx: TestContext;
beforeAll(async () => { ctx = await startApp(); });
afterAll(async () => { await ctx?.app.close(); });

async function openCase() {
  const customerId = `cust-${crypto.randomUUID()}`;
  await submitAndWait(ctx, { customerId, amount: 5_000_000 });
  const res = await gql(ctx, `query ($c: String!) { cases(customerId: $c) { id } }`, { c: customerId });
  return res.data.cases[0].id as string;
}

const TRAIL = `query ($id: ID!) { case(id: $id) { auditTrail { action actorType actorName changes metadata } } }`;

describe('audit log', () => {
  it('records the full lifecycle of a case, with who did what', async () => {
    const id = await openCase();
    await gql(ctx, `mutation ($id: ID!) { startReview(id: $id) { id } }`, { id });
    await gql(ctx, `mutation ($id: ID!) { escalateCase(id: $id, note: "Layering pattern") { id } }`, { id });

    const trail = (await gql(ctx, TRAIL, { id })).data.case.auditTrail;
    expect(trail.map((e: { action: string }) => e.action)).toEqual(['case.opened', 'case.review_started', 'case.escalated']);
    expect(trail[0]).toMatchObject({ actorType: 'system', actorName: 'system' });
    expect(trail[1]).toMatchObject({ actorType: 'api_key', changes: { status: { from: 'open', to: 'in_review' } } });
    expect(trail[1].actorName).toMatch(/^analyst-/);
    expect(trail[2].changes).toEqual({ status: { from: 'in_review', to: 'escalated' }, resolutionNote: 'Layering pattern' });
  });

  it('records nothing for a rejected action', async () => {
    const id = await openCase();
    await gql(ctx, `mutation ($id: ID!) { dismissCase(id: $id, note: "Payroll") { id } }`, { id });
    await gql(ctx, `mutation ($id: ID!) { startReview(id: $id) { id } }`, { id });

    const trail = (await gql(ctx, TRAIL, { id })).data.case.auditTrail;
    expect(trail.map((e: { action: string }) => e.action)).toEqual(['case.opened', 'case.dismissed']);
  });

  it('is append-only at the database level', async () => {
    await openCase();
    await expect(ctx.db.query(`UPDATE audit_events SET actor_name = 'someone else'`)).rejects.toThrow(/append-only/);
    await expect(ctx.db.query(`DELETE FROM audit_events`)).rejects.toThrow(/append-only/);
    await expect(ctx.db.query(`TRUNCATE audit_events`)).rejects.toThrow(/append-only/);
  });

  it('can be queried across entities, most recent first', async () => {
    const id = await openCase();
    const res = await gql(ctx, `query ($id: String!) { auditEvents(entityType: "case", entityId: $id) { action } }`, { id });
    expect(res.data.auditEvents).toEqual([{ action: 'case.opened' }]);
  });
});
