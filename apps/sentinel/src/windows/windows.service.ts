import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { RulesEngine } from '@sentinel/rules-core';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { config } from '../config';
import { REDIS } from '../redis/redis.module';

const BATCH_SIZE = 1000;
const LOCK_TTL_MS = 5 * 60 * 1000;
const RELEASE_LOCK = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;

interface WarmupRow {
  id: string;
  customer_id: string;
  type: 'deposit' | 'withdrawal' | 'bet' | 'payout' | 'transfer';
  amount: string;
  currency: string;
  occurred_at: Date;
}

@Injectable()
export class WindowsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WindowsService.name);
  readonly readyKey = `${config.windowKeyPrefix}:windows:ready`;
  readonly lockKey = `${config.windowKeyPrefix}:windows:warmup-lock`;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly engine: RulesEngine,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  onApplicationBootstrap() {
    this.ensureReady().catch((err) => this.logger.error(`Window warm-up failed: ${err}`));
  }

  async isReady(): Promise<boolean> {
    return (await this.redis.exists(this.readyKey)) === 1;
  }

  async ensureReady(timeoutMs = LOCK_TTL_MS): Promise<void> {
    if (await this.isReady()) return;

    const token = randomUUID();
    const acquired = await this.redis.set(this.lockKey, token, 'PX', LOCK_TTL_MS, 'NX');
    if (!acquired) return this.waitUntilReady(timeoutMs);

    try {
      const count = await this.warmUp();
      await this.redis.set(this.readyKey, new Date().toISOString());
      this.logger.log(`Windows warmed up from ${count} transactions`);
    } finally {
      await this.redis.eval(RELEASE_LOCK, 1, this.lockKey, token);
    }
  }

  private async warmUp(): Promise<number> {
    const since = new Date(Date.now() - config.windowRetentionMs);
    let cursor: { at: Date; id: string } | null = null;
    let total = 0;

    for (;;) {
      const rows: WarmupRow[] = cursor
        ? await this.db.query(
            `SELECT id, customer_id, type, amount, currency, occurred_at FROM transactions
              WHERE occurred_at >= $1 AND (occurred_at, id) > ($2, $3)
              ORDER BY occurred_at, id LIMIT $4`,
            [since, cursor.at, cursor.id, BATCH_SIZE],
          )
        : await this.db.query(
            `SELECT id, customer_id, type, amount, currency, occurred_at FROM transactions
              WHERE occurred_at >= $1 ORDER BY occurred_at, id LIMIT $2`,
            [since, BATCH_SIZE],
          );
      if (rows.length === 0) return total;

      await Promise.all(
        rows.map((r) =>
          this.engine.record({
            id: r.id,
            customerId: r.customer_id,
            type: r.type,
            amount: Number(r.amount),
            currency: r.currency,
            occurredAt: r.occurred_at,
          }),
        ),
      );
      total += rows.length;
      const last = rows[rows.length - 1]!;
      cursor = { at: last.occurred_at, id: last.id };
    }
  }

  private async waitUntilReady(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.isReady()) return;
      if (!(await this.redis.exists(this.lockKey))) return this.ensureReady(Math.max(deadline - Date.now(), 0));
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('Timed out waiting for window warm-up');
  }
}
