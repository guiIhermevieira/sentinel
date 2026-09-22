import { MigrationInterface, QueryRunner } from 'typeorm';

export class Cases1758600000000 implements MigrationInterface {
  name = 'Cases1758600000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE transactions ADD COLUMN account_created_at timestamptz`);
    await q.query(`
      CREATE TABLE cases (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id      varchar NOT NULL,
        status           varchar(20) NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'in_review', 'escalated', 'dismissed')),
        risk_score       int NOT NULL DEFAULT 0,
        alert_count      int NOT NULL DEFAULT 0,
        resolution_note  text,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now(),
        last_alert_at    timestamptz,
        closed_at        timestamptz
      )`);
    await q.query(`CREATE UNIQUE INDEX uq_cases_one_active_per_customer ON cases (customer_id) WHERE status IN ('open', 'in_review')`);
    await q.query(`CREATE INDEX idx_cases_status_risk ON cases (status, risk_score DESC, last_alert_at DESC)`);
    await q.query(`ALTER TABLE alerts ADD COLUMN case_id uuid REFERENCES cases(id)`);
    await q.query(`CREATE INDEX idx_alerts_case ON alerts (case_id)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE alerts DROP COLUMN case_id`);
    await q.query(`DROP TABLE cases`);
    await q.query(`ALTER TABLE transactions DROP COLUMN account_created_at`);
  }
}
