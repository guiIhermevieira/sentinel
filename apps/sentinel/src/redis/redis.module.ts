import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { config } from '../config';

export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [{ provide: REDIS, useFactory: () => new Redis(config.redisUrl) }],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    await this.redis.quit();
  }
}
