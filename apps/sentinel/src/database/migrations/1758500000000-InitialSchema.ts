import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1758500000000 implements MigrationInterface {
  name = 'InitialSchema1758500000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await q.query(`
      CREATE TABLE transactions (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        idempotency_key  varchar NOT NULL UNIQUE,
        request_hash     varchar(64) NOT NULL,
        external_id      varchar NOT NULL,
        customer_id      varchar NOT NULL,
        type             varchar(20) NOT NULL,
        amount           bigint NOT NULL CHECK (amount > 0),
        currency         varchar(3) NOT NULL,
        occurred_at      timestamptz NOT NULL,
        status           varchar(20) NOT NULL DEFAULT 'received',
        risk_score       int,
        rule_errors      jsonb,
        received_at      timestamptz NOT NULL DEFAULT now(),
        evaluated_at     timestamptz
      )`);
    await q.query(`CREATE INDEX idx_transactions_customer_occurred ON transactions (customer_id, occurred_at)`);
    await q.query(`
      CREATE TABLE alerts (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id  uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        customer_id     varchar NOT NULL,
        rule_id         varchar(64) NOT NULL,
        score           int NOT NULL,
        reason          text NOT NULL,
        created_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_alert_transaction_rule UNIQUE (transaction_id, rule_id)
      )`);
    await q.query(`CREATE INDEX idx_alerts_customer_created ON alerts (customer_id, created_at)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE alerts`);
    await q.query(`DROP TABLE transactions`);
  }
}
