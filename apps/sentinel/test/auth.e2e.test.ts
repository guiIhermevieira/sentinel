import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, gql, startApp, TestContext, txBody } from './helpers';

const { ApiKeysService } = require('../dist/auth/api-keys.service');

let ctx: TestContext;
beforeAll(async () => { ctx = await startApp(); });
afterAll(async () => { await ctx?.app.close(); });

const post = (headers: Record<string, string>) =>
  ctx.http.post('/transactions').set(headers).set('Idempotency-Key', crypto.randomUUID()).send(txBody());

describe('authentication', () => {
  it('keeps the health check public', async () => {
    await ctx.http.get('/health').expect(200);
  });

  it('rejects missing, malformed and unknown keys', async () => {
    await post({}).expect(401);
    await post({ Authorization: 'Basic abc' }).expect(401);
    await post(bearer('snt_not-a-real-key')).expect(401);
  });

  it('rejects a key immediately after it is revoked', async () => {
    const { id, key } = await ctx.createKey('producer');
    await post(bearer(key)).expect(202);
    await ctx.app.get(ApiKeysService).revoke(id, { type: 'system', id: null, name: 'test' });
    await post(bearer(key)).expect(401);
  });

  it('never stores keys in plain text', async () => {
    const { key } = await ctx.createKey('analyst');
    const rows = await ctx.db.query('SELECT count(*)::int AS n FROM api_keys WHERE key_hash = $1 OR key_prefix = $1', [key]);
    expect(rows[0].n).toBe(0);
  });
});

describe('authorization', () => {
  it('lets only producers (and admins) submit transactions', async () => {
    await post(bearer(ctx.keys.analyst)).expect(403);
    await post(bearer(ctx.keys.producer)).expect(202);
    await post(bearer(ctx.keys.admin)).expect(202);
  });

  it('keeps the analyst API away from producers', async () => {
    const res = await gql(ctx, '{ cases { id } }', {}, ctx.keys.producer);
    expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
  });

  it('requires a key for GraphQL', async () => {
    const res = await ctx.http.post('/graphql').send({ query: '{ cases { id } }' });
    expect(res.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
  });

  it('reserves rule changes for admins', async () => {
    const mutation = `mutation { updateRuleConfig(input: { ruleId: "velocity", expectedVersion: 1, enabled: false }) { version } }`;
    const res = await gql(ctx, mutation, {}, ctx.keys.analyst);
    expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
  });
});

describe('GraphQL limits', () => {
  it('rejects queries nested beyond the depth limit', async () => {
    const atLimit = `{ cases { alerts { transaction { alerts { transaction { alerts { transaction { alerts { id } } } } } } } } }`;
    const beyond = `{ cases { alerts { transaction { alerts { transaction { alerts { transaction { alerts { transaction { id } } } } } } } } } }`;
    expect((await ctx.http.post('/graphql').set(bearer(ctx.keys.analyst)).send({ query: atLimit })).body.errors).toBeUndefined();
    const deep = beyond;
    const res = await ctx.http.post('/graphql').set(bearer(ctx.keys.analyst)).send({ query: deep });
    expect(res.status).toBe(400);
    expect(res.body.errors?.[0]?.message).toMatch(/exceeds maximum operation depth/);
  });
});
