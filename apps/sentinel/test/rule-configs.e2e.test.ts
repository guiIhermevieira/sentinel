import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gql, startApp, submitAndWait, TestContext } from './helpers';

let ctx: TestContext;
beforeAll(async () => { ctx = await startApp(); });
afterAll(async () => { await ctx?.app.close(); });

const UPDATE = `mutation ($input: UpdateRuleConfigInput!) { updateRuleConfig(input: $input) { ruleId enabled config version updatedBy } }`;

async function current(ruleId: string) {
  const res = await gql(ctx, '{ ruleConfigs { ruleId enabled config version } }');
  return res.data.ruleConfigs.find((r: { ruleId: string }) => r.ruleId === ruleId);
}

const update = (input: Record<string, unknown>) => gql(ctx, UPDATE, { input }, ctx.keys.admin);

describe('rule configuration', () => {
  it('applies a new threshold without a restart', async () => {
    const rule = await current('large-amount');
    const res = await update({ ruleId: 'large-amount', expectedVersion: rule.version, config: { threshold: 100_000, weight: 30 } });
    expect(res.errors).toBeUndefined();
    expect(res.data.updateRuleConfig).toMatchObject({ version: rule.version + 1, config: { threshold: 100_000 } });
    expect(res.data.updateRuleConfig.updatedBy).toMatch(/^admin-/);

    const tx = await submitAndWait(ctx, { amount: 150_000 });
    expect(tx.alerts.map((a: { ruleId: string }) => a.ruleId)).toEqual(['large-amount']);
  });

  it('stops raising alerts for a disabled rule', async () => {
    const rule = await current('large-amount');
    await update({ ruleId: 'large-amount', expectedVersion: rule.version, enabled: false });
    const tx = await submitAndWait(ctx, { amount: 9_000_000 });
    expect(tx.alerts).toEqual([]);
  });

  it('rejects edits based on a stale version', async () => {
    const rule = await current('velocity');
    await update({ ruleId: 'velocity', expectedVersion: rule.version, config: { ...rule.config, maxCount: 20 } });
    const res = await update({ ruleId: 'velocity', expectedVersion: rule.version, config: { ...rule.config, maxCount: 30 } });
    expect(res.errors?.[0]?.extensions).toMatchObject({ code: 'VERSION_CONFLICT', currentVersion: rule.version + 1 });
  });

  it('validates configs, including windows longer than Redis retains', async () => {
    const rule = await current('velocity');
    const res = await update({ ruleId: 'velocity', expectedVersion: rule.version, config: { windowMs: 172_800_000, maxCount: 0, weight: 20, extra: 1 } });
    expect(res.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    expect(res.errors?.[0]?.extensions?.errors).toEqual([
      'Unknown field "extra"',
      '"maxCount" must be at least 1',
      '"windowMs" must not exceed the window store retention of 86400000ms',
    ]);
    expect((await current('velocity')).version).toBe(rule.version);
  });

  it('audits every change with before and after', async () => {
    const rule = await current('rapid-in-out');
    await update({ ruleId: 'rapid-in-out', expectedVersion: rule.version, config: { ...rule.config, minRatio: 0.8 } });
    const res = await gql(ctx, `{ auditEvents(entityType: "rule_config", entityId: "rapid-in-out", limit: 1) { action changes } }`);
    const [event] = res.data.auditEvents;
    expect(event.action).toBe('rule_config.updated');
    expect(event.changes.before.config.minRatio).toBe(0.9);
    expect(event.changes.after.config.minRatio).toBe(0.8);
  });
});
