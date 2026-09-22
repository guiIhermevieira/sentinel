import { RuleHit } from '@sentinel-aml/rules-core';
import { EntityManager } from 'typeorm';
import { AlertEntity } from '../database/entities/alert.entity';
import { NewAlert } from './case-aggregator';

export async function insertAlerts(
  manager: EntityManager,
  tx: { id: string; customerId: string },
  hits: RuleHit[],
  partialContext: (hit: RuleHit) => boolean,
): Promise<NewAlert[]> {
  if (hits.length === 0) return [];
  const result = await manager
    .createQueryBuilder()
    .insert()
    .into(AlertEntity)
    .values(hits.map((hit) => ({ transactionId: tx.id, customerId: tx.customerId, ...hit, partialContext: partialContext(hit) })))
    .orIgnore()
    .returning(['id', 'score'])
    .execute();
  return (result.raw as NewAlert[]) ?? [];
}
