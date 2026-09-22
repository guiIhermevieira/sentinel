import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { config, EVALUATION_QUEUE } from '../config';

@Injectable()
export class StaleSweeperService {
  private readonly logger = new Logger(StaleSweeperService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectQueue(EVALUATION_QUEUE) private readonly queue: Queue,
  ) {}

  async sweep(limit = 500): Promise<number> {
    const stale: { id: string }[] = await this.db.query(
      `SELECT id FROM transactions
        WHERE status = 'received' AND received_at < now() - make_interval(secs => $1)
        ORDER BY received_at LIMIT $2`,
      [config.staleAfterMs / 1000, limit],
    );

    let requeued = 0;
    for (const { id } of stale) {
      if (await this.requeue(id)) requeued++;
    }
    if (requeued > 0) this.logger.warn(`Re-enqueued ${requeued} stale transactions`);
    return requeued;
  }

  private async requeue(id: string): Promise<boolean> {
    const job = await this.queue.getJob(id);
    if (!job) {
      await this.queue.add('evaluate', { transactionId: id }, { jobId: id });
      return true;
    }
    const state = await job.getState();
    if (state === 'failed') {
      await job.retry();
      return true;
    }
    if (state === 'completed') {
      await job.remove();
      await this.queue.add('evaluate', { transactionId: id }, { jobId: id });
      return true;
    }
    return false;
  }
}
