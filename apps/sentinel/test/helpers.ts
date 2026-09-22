import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';

process.env.SENTINEL_MAINTENANCE = 'off';
process.env.SENTINEL_RULE_REFRESH_SECONDS = '0';

const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/setup');
const { ApiKeysService } = require('../dist/auth/api-keys.service');
const { WindowsService } = require('../dist/windows/windows.service');
const { RuleRegistry } = require('../dist/rules/rule-registry');
const { DEFAULT_RULES } = require('../dist/database/migrations/1758700000000-AuthAuditRuleConfigs');

export type Role = 'producer' | 'analyst' | 'admin';

export interface TestContext {
  app: INestApplication;
  http: ReturnType<typeof request>;
  db: DataSource;
  keys: Record<Role, string>;
  createKey(role: Role): Promise<{ id: string; key: string }>;
}

export async function startApp(): Promise<TestContext> {
  const app: INestApplication = configureApp(await NestFactory.create(AppModule, { logger: ['error'] }));
  await app.listen(0);
  const db = app.get(DataSource);
  await db.query('TRUNCATE alerts, cases, transactions CASCADE');
  for (const [ruleId, config] of DEFAULT_RULES) {
    await db.query(`UPDATE rule_configs SET enabled = true, config = $2, version = version + 1 WHERE rule_id = $1`, [ruleId, JSON.stringify(config)]);
  }
  await app.get(RuleRegistry).reload();
  await app.get(WindowsService).ensureReady();

  const apiKeys = app.get(ApiKeysService);
  const createKey = async (role: Role) => {
    const created = await apiKeys.create(`${role}-${randomUUID()}`, role, { type: 'system', id: null, name: 'test' });
    return { id: created.id as string, key: created.key as string };
  };
  const keys = {
    producer: (await createKey('producer')).key,
    analyst: (await createKey('analyst')).key,
    admin: (await createKey('admin')).key,
  };

  const { port } = app.getHttpServer().address() as { port: number };
  return { app, db, keys, createKey, http: request(`http://127.0.0.1:${port}`) };
}

export const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });

export function txBody(overrides: Record<string, unknown> = {}) {
  return {
    externalId: randomUUID(),
    customerId: `cust-${randomUUID()}`,
    type: 'deposit',
    amount: 10_000,
    currency: 'BRL',
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

export function postTx(ctx: TestContext, payload: object, key: string = randomUUID()) {
  return ctx.http.post('/transactions').set(bearer(ctx.keys.producer)).set('Idempotency-Key', key).send(payload);
}

export async function waitForEvaluation(ctx: TestContext, id: string) {
  for (let i = 0; i < 100; i++) {
    const res = await ctx.http.get(`/transactions/${id}`).set(bearer(ctx.keys.producer));
    if (res.body.status === 'evaluated') return res.body;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Transaction ${id} was not evaluated in time`);
}

export async function submitAndWait(ctx: TestContext, overrides: Record<string, unknown> = {}) {
  const res = await postTx(ctx, txBody(overrides)).expect(202);
  return waitForEvaluation(ctx, res.body.id);
}

export interface GqlResponse<T> {
  data?: T;
  errors?: { message: string; extensions?: { code?: string; [key: string]: unknown } }[];
}

export async function gql<T = any>(ctx: TestContext, query: string, variables: Record<string, unknown> = {}, key = ctx.keys.analyst) {
  const res = await ctx.http.post('/graphql').set(bearer(key)).send({ query, variables });
  return res.body as GqlResponse<T>;
}
