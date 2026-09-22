import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { RulesEngine } from '@sentinel-aml/rules-core';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { insertAlerts } from '../cases/alerts';
import { attachAlertsToCase } from '../cases/case-aggregator';
import { EVALUATION_QUEUE } from '../config';
import { TransactionEntity } from '../database/entities/transaction.entity';
import { WindowsService } from '../windows/windows.service';

export interface EvaluationJob {
  transactionId: string;
}

@Processor(EVALUATION_QUEUE)
export class EvaluationProcessor extends WorkerHost {
  private readonly logger = new Logger(EvaluationProcessor.name);

  constructor(
    private readonly engine: RulesEngine,
    private readonly windows: WindowsService,
    @InjectDataSource() private readonly db: DataSource,
  ) {
    super();
  }

  async process(job: Job<EvaluationJob>): Promise<void> {
    const tx = await this.db.getRepository(TransactionEntity).findOneBy({ id: job.data.transactionId });
    if (!tx) {
      this.logger.warn(`Transaction ${job.data.transactionId} not found, skipping`);
      return;
    }
    if (tx.status === 'evaluated') return;

    const ready = await this.windows.isReady();
    const stateful = new Set(this.engine.rules().filter((r) => r.stateful).map((r) => r.id));
    const result = await this.engine.evaluate({
      id: tx.id,
      customerId: tx.customerId,
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      occurredAt: tx.occurredAt,
      accountCreatedAt: tx.accountCreatedAt ?? undefined,
    });

    await this.db.transaction(async (manager) => {
      const inserted = await insertAlerts(manager, tx, result.hits, (hit) => !ready && stateful.has(hit.ruleId));
      await attachAlertsToCase(manager, tx.customerId, inserted);
      await manager.update(TransactionEntity, tx.id, {
        status: 'evaluated',
        riskScore: result.totalScore,
        ruleErrors: result.errors.length > 0 ? result.errors : null,
        evaluatedAt: new Date(),
        needsRecheck: !ready,
      });
    });

    if (result.errors.length > 0) {
      this.logger.error(`Rules failed for ${tx.id}: ${result.errors.map((e) => e.ruleId).join(', ')}`);
    }
  }
}
