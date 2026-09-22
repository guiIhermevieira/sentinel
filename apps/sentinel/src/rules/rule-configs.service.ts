import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { RULE_CATALOG, validateRuleConfig } from '@sentinel/rules-core';
import { GraphQLError } from 'graphql';
import { DataSource } from 'typeorm';
import { Actor, appendAudit } from '../audit/audit';
import { config } from '../config';
import { RuleConfigEntity } from '../database/entities/rule-config.entity';
import { RuleRegistry } from './rule-registry';

export interface RuleConfigUpdate {
  expectedVersion: number;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

@Injectable()
export class RuleConfigsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly registry: RuleRegistry,
  ) {}

  list() {
    return this.db.getRepository(RuleConfigEntity).find({ order: { ruleId: 'ASC' } });
  }

  isStateful(ruleId: string): boolean {
    return RULE_CATALOG[ruleId]?.stateful ?? false;
  }

  async update(ruleId: string, input: RuleConfigUpdate, actor: Actor): Promise<RuleConfigEntity> {
    const updated = await this.db.transaction(async (manager) => {
      const current = await manager.findOne(RuleConfigEntity, { where: { ruleId }, lock: { mode: 'pessimistic_write' } });
      if (!current) throw new GraphQLError(`Rule ${ruleId} not found`, { extensions: { code: 'NOT_FOUND' } });
      if (current.version !== input.expectedVersion) {
        throw new GraphQLError(`Rule ${ruleId} is at version ${current.version}, not ${input.expectedVersion}`, {
          extensions: { code: 'VERSION_CONFLICT', currentVersion: current.version },
        });
      }

      const next = {
        enabled: input.enabled ?? current.enabled,
        config: input.config ?? current.config,
      };
      const errors = validateRuleConfig(ruleId, next.config, { maxWindowMs: config.windowRetentionMs });
      if (errors.length > 0) {
        throw new GraphQLError(`Invalid config for ${ruleId}: ${errors.join('; ')}`, { extensions: { code: 'BAD_USER_INPUT', errors } });
      }

      const before = { enabled: current.enabled, config: structuredClone(current.config), version: current.version };
      const saved = await manager.save(
        manager.merge(RuleConfigEntity, current, { ...next, version: current.version + 1, updatedAt: new Date(), updatedBy: actor.name }),
      );
      await appendAudit(manager, {
        actor,
        action: 'rule_config.updated',
        entityType: 'rule_config',
        entityId: ruleId,
        changes: {
          before,
          after: { ...next, version: before.version + 1 },
        },
      });
      return saved;
    });

    await this.registry.reload();
    return updated;
  }
}
