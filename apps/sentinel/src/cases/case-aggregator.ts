import { EntityManager } from 'typeorm';
import { appendAudit, SYSTEM_ACTOR } from '../audit/audit';

export interface NewAlert {
  id: string;
  score: number;
}

export async function attachAlertsToCase(manager: EntityManager, customerId: string, alerts: NewAlert[]): Promise<string | null> {
  if (alerts.length === 0) return null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const [opened]: { id: string }[] = await manager.query(
      `INSERT INTO cases (customer_id, status) VALUES ($1, 'open')
       ON CONFLICT (customer_id) WHERE status IN ('open', 'in_review') DO NOTHING
       RETURNING id`,
      [customerId],
    );
    if (opened) {
      await appendAudit(manager, {
        actor: SYSTEM_ACTOR,
        action: 'case.opened',
        entityType: 'case',
        entityId: opened.id,
        metadata: { customerId },
      });
    }

    const rows: { id: string }[] = await manager.query(
      `SELECT id FROM cases WHERE customer_id = $1 AND status IN ('open', 'in_review') FOR UPDATE`,
      [customerId],
    );
    const caseId = rows[0]?.id;
    if (!caseId) continue;

    const total = alerts.reduce((sum, a) => sum + a.score, 0);
    await manager.query(`UPDATE alerts SET case_id = $1 WHERE id = ANY($2::uuid[])`, [caseId, alerts.map((a) => a.id)]);
    await manager.query(
      `UPDATE cases
          SET risk_score = risk_score + $2, alert_count = alert_count + $3,
              last_alert_at = now(), updated_at = now()
        WHERE id = $1`,
      [caseId, total, alerts.length],
    );
    return caseId;
  }
  throw new Error(`Could not find or create an active case for customer ${customerId}`);
}
