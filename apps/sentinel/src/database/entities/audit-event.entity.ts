import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type ActorType = 'api_key' | 'system';

@Entity('audit_events')
export class AuditEventEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' })
  occurredAt!: Date;

  @Column({ name: 'actor_type', type: 'varchar', length: 20 })
  actorType!: ActorType;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ name: 'actor_name', length: 100 })
  actorName!: string;

  @Column({ length: 64 })
  action!: string;

  @Column({ name: 'entity_type', length: 32 })
  entityType!: string;

  @Column({ name: 'entity_id', length: 64 })
  entityId!: string;

  @Column({ type: 'jsonb', nullable: true })
  changes!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;
}
