import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SentinelRulesModule } from '@sentinel-aml/nestjs';
import { RedisWindowStore } from '@sentinel-aml/store-redis';
import Redis from 'ioredis';
import { AuthModule } from './auth/auth.module';
import { config } from './config';
import { dataSourceOptions } from './database/data-source-options';
import { AnalystApiModule } from './graphql/analyst-api.module';
import { HealthController } from './health.controller';
import { IngestionModule } from './ingestion/ingestion.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { ProcessingModule } from './processing/processing.module';
import { REDIS, RedisModule } from './redis/redis.module';
import { RuleRegistry } from './rules/rule-registry';
import { RulesConfigModule } from './rules/rules-config.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(dataSourceOptions),
    RedisModule,
    AuthModule,
    BullModule.forRoot({
      connection: { url: config.redisUrl },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    }),
    SentinelRulesModule.forRootAsync({
      imports: [RulesConfigModule],
      inject: [RuleRegistry, REDIS],
      useFactory: (registry: RuleRegistry, redis: Redis) => ({
        rules: registry,
        windows: new RedisWindowStore(redis, { retentionMs: config.windowRetentionMs }),
        keyPrefix: config.windowKeyPrefix,
      }),
    }),
    IngestionModule,
    ProcessingModule,
    MaintenanceModule,
    AnalystApiModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
