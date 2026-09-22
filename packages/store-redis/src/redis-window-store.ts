import type { Redis } from 'ioredis';
import type { WindowEntry, WindowStore } from '@sentinel/rules-core';
import { RECORD_SCRIPT } from './scripts';

type RedisWithRecord = Redis & {
  sentinelRecord(key: string, score: number, member: string, cutoff: number, ttl: number): Promise<number>;
};

export interface RedisWindowStoreOptions {
  retentionMs: number;
  now?: () => number;
}

export class RedisWindowStore implements WindowStore {
  private readonly redis: RedisWithRecord;
  private readonly now: () => number;

  constructor(redis: Redis, private readonly options: RedisWindowStoreOptions) {
    redis.defineCommand('sentinelRecord', { numberOfKeys: 1, lua: RECORD_SCRIPT });
    this.redis = redis as RedisWithRecord;
    this.now = options.now ?? Date.now;
  }

  async record(key: string, entry: WindowEntry): Promise<void> {
    const cutoff = this.now() - this.options.retentionMs;
    await this.redis.sentinelRecord(key, entry.at.getTime(), `${entry.txId}:${entry.amount}`, cutoff, this.options.retentionMs);
  }

  async count(key: string, since: Date, until: Date): Promise<number> {
    return this.redis.zcount(key, since.getTime(), until.getTime());
  }

  async entries(key: string, since: Date, until: Date): Promise<WindowEntry[]> {
    const raw = await this.redis.zrangebyscore(key, since.getTime(), until.getTime(), 'WITHSCORES');
    const result: WindowEntry[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      const member = raw[i]!;
      const sep = member.lastIndexOf(':');
      result.push({
        txId: member.slice(0, sep),
        amount: Number(member.slice(sep + 1)),
        at: new Date(Number(raw[i + 1])),
      });
    }
    return result;
  }
}
