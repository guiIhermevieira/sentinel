import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createRule, Rule, RuleSource } from '@sentinel-aml/rules-core';
import { DataSource } from 'typeorm';
import { config } from '../config';
import { RuleConfigEntity } from '../database/entities/rule-config.entity';

@Injectable()
export class RuleRegistry implements RuleSource, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RuleRegistry.name);
  private rules: Rule[] = [];
  private signature = '';
  private timer?: NodeJS.Timeout;

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async onModuleInit() {
    await this.reload();
    if (config.ruleRefreshEveryMs > 0) {
      this.timer = setInterval(() => {
        this.refreshIfChanged().catch((err) => this.logger.error(`Rule refresh failed: ${err}`));
      }, config.ruleRefreshEveryMs);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  current(): Rule[] {
    return this.rules;
  }

  async reload(): Promise<void> {
    const rows = await this.db.getRepository(RuleConfigEntity).find({ order: { ruleId: 'ASC' } });
    const rules: Rule[] = [];
    for (const row of rows.filter((r) => r.enabled)) {
      try {
        rules.push(createRule(row.ruleId, row.config, { maxWindowMs: config.windowRetentionMs }));
      } catch (err) {
        this.logger.error(`Skipping rule ${row.ruleId} v${row.version}: ${(err as Error).message}`);
      }
    }
    this.rules = rules;
    this.signature = signatureOf(rows);
  }

  private async refreshIfChanged(): Promise<void> {
    const rows = await this.db.getRepository(RuleConfigEntity).find({ select: { ruleId: true, version: true, enabled: true } });
    if (signatureOf(rows) !== this.signature) await this.reload();
  }
}

function signatureOf(rows: Pick<RuleConfigEntity, 'ruleId' | 'version' | 'enabled'>[]): string {
  return rows
    .map((r) => `${r.ruleId}:${r.version}:${r.enabled}`)
    .sort()
    .join(',');
}
