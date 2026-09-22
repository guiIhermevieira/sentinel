import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { RulesEngine } from '@sentinel/rules-core';
import { DataSource } from 'typeorm';
import { appendAudit, SYSTEM_ACTOR } from '../audit/audit';
import { insertAlerts } from '../cases/alerts';
import { attachAlertsToCase } from '../cases/case-aggregator';
import { TransactionEntity } from '../database/entities/transaction.entity';
import { WindowsService } from './windows.service';

@Injectable()
export class RecheckService {
  private readonly logger = new Logger(RecheckService.name);

  constructor(
    private readonly engine: RulesEngine,
    private readonly windows: WindowsService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async run(limit = 200): Promise<number> {
    if (!(await this.windows.isReady())) return 0;

    const pending: { id: string }[] = await this.db.query(
      `SELECT id FROM transactions WHERE needs_recheck AND status = 'evaluated' ORDER BY occurred_at LIMIT $1`,
      [limit],
    );
    let processed = 0;
    for (const { id } of pending) {
      if (await this.recheck(id)) processed++;
    }
    if (processed > 0) this.logger.log(`Re-checked ${processed} transactions with full window context`);
    return processed;
  }

  private recheck(id: string): Promise<boolean> {
    return this.db.transaction(async (manager) => {
      const tx = await manager.findOne(TransactionEntity, {
        where: { id, needsRecheck: true },
        lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
      });
      if (!tx) return false;

      const result = await this.engine.evaluate(
        {
          id: tx.id,
          customerId: tx.customerId,
          type: tx.type,
          amount: tx.amount,
          currency: tx.currency,
          occurredAt: tx.occurredAt,
          accountCreatedAt: tx.accountCreatedAt ?? undefined,
        },
        { filter: (rule) => Boolean(rule.stateful) },
      );

      const added = await insertAlerts(manager, tx, result.hits, () => false);
      await attachAlertsToCase(manager, tx.customerId, added);
      await manager.query(
        `UPDATE alerts SET partial_context = false WHERE transaction_id = $1 AND rule_id = ANY($2::varchar[]) AND partial_context`,
        [tx.id, result.hits.map((h) => h.ruleId)],
      );
      const addedScore = added.reduce((sum, a) => sum + a.score, 0);
      await manager.update(TransactionEntity, tx.id, { needsRecheck: false, riskScore: (tx.riskScore ?? 0) + addedScore });

      if (added.length > 0) {
        await appendAudit(manager, {
          actor: SYSTEM_ACTOR,
          action: 'transaction.rechecked',
          entityType: 'transaction',
          entityId: tx.id,
          metadata: { addedAlerts: added.length, addedScore },
        });
      }
      return true;
    });
  }
}
