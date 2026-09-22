import { EntityManager } from 'typeorm';
import { ActorType, AuditEventEntity } from '../database/entities/audit-event.entity';

export interface Actor {
  type: ActorType;
  id: string | null;
  name: string;
}

export const SYSTEM_ACTOR: Actor = { type: 'system', id: null, name: 'system' };

export interface AuditEntry {
  actor: Actor;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function appendAudit(manager: EntityManager, entry: AuditEntry): Promise<void> {
  await manager.save(manager.create(AuditEventEntity, {
    actorType: entry.actor.type,
    actorId: entry.actor.id,
    actorName: entry.actor.name,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    changes: entry.changes ?? null,
    metadata: entry.metadata ?? null,
  }));
}
