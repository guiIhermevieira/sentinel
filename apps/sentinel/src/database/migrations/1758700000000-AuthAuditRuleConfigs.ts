import { MigrationInterface, QueryRunner } from 'typeorm';

export const DEFAULT_RULES: [string, object][] = [
  ['large-amount', { threshold: 5_000_000, weight: 30 }],
  ['velocity', { windowMs: 300_000, maxCount: 10, weight: 20 }],
  ['structuring', { reportingThreshold: 1_000_000, margin: 0.1, windowMs: 86_400_000, minCount: 3, types: ['deposit', 'transfer'], weight: 40 }],
  ['rapid-in-out', { windowMs: 1_800_000, minRatio: 0.9, minAmount: 100_000, weight: 35 }],
  ['new-account-high-value', { accountAgeMs: 604_800_000, threshold: 1_000_000, weight: 25 }],
];

export class AuthAuditRuleConfigs1758700000000 implements MigrationInterface {
  name = 'AuthAuditRuleConfigs1758700000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE api_keys (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name        varchar(100) NOT NULL UNIQUE,
        role        varchar(20) NOT NULL CHECK (role IN ('producer', 'analyst', 'admin')),
        key_hash    varchar(64) NOT NULL UNIQUE,
        key_prefix  varchar(12) NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        revoked_at  timestamptz
      )`);

    await q.query(`
      CREATE TABLE audit_events (
        id           bigserial PRIMARY KEY,
        occurred_at  timestamptz NOT NULL DEFAULT now(),
        actor_type   varchar(20) NOT NULL CHECK (actor_type IN ('api_key', 'system')),
        actor_id     uuid,
        actor_name   varchar(100) NOT NULL,
        action       varchar(64) NOT NULL,
        entity_type  varchar(32) NOT NULL,
        entity_id    varchar(64) NOT NULL,
        changes      jsonb,
        metadata     jsonb
      )`);
    await q.query(`CREATE INDEX idx_audit_entity ON audit_events (entity_type, entity_id, id)`);
    await q.query(`
      CREATE FUNCTION audit_events_append_only() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'audit_events is append-only: % is not allowed', TG_OP;
      END;
      $$ LANGUAGE plpgsql`);
    await q.query(`
      CREATE TRIGGER audit_events_no_update_delete
        BEFORE UPDATE OR DELETE ON audit_events
        FOR EACH ROW EXECUTE FUNCTION audit_events_append_only()`);
    await q.query(`
      CREATE TRIGGER audit_events_no_truncate
        BEFORE TRUNCATE ON audit_events
        FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only()`);

    await q.query(`
      CREATE TABLE rule_configs (
        rule_id     varchar(64) PRIMARY KEY,
        enabled     boolean NOT NULL DEFAULT true,
        config      jsonb NOT NULL,
        version     int NOT NULL DEFAULT 1,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        updated_by  varchar(100) NOT NULL DEFAULT 'system'
      )`);
    for (const [ruleId, config] of DEFAULT_RULES) {
      await q.query(`INSERT INTO rule_configs (rule_id, config) VALUES ($1, $2)`, [ruleId, JSON.stringify(config)]);
    }

    await q.query(`ALTER TABLE transactions ADD COLUMN needs_recheck boolean NOT NULL DEFAULT false`);
    await q.query(`CREATE INDEX idx_transactions_needs_recheck ON transactions (id) WHERE needs_recheck`);
    await q.query(`CREATE INDEX idx_transactions_stale ON transactions (received_at) WHERE status = 'received'`);
    await q.query(`ALTER TABLE alerts ADD COLUMN partial_context boolean NOT NULL DEFAULT false`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE alerts DROP COLUMN partial_context`);
    await q.query(`DROP INDEX idx_transactions_stale`);
    await q.query(`ALTER TABLE transactions DROP COLUMN needs_recheck`);
    await q.query(`DROP TABLE rule_configs`);
    await q.query(`DROP TABLE audit_events`);
    await q.query(`DROP FUNCTION audit_events_append_only`);
    await q.query(`DROP TABLE api_keys`);
  }
}
