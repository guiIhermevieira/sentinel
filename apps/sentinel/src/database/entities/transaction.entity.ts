import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { TransactionType } from '@sentinel-aml/rules-core';
import { bigintToNumber } from '../bigint.transformer';
import { AlertEntity } from './alert.entity';

export type TransactionStatus = 'received' | 'evaluated';

@Entity('transactions')
@Index(['customerId', 'occurredAt'])
export class TransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'idempotency_key', unique: true })
  idempotencyKey!: string;

  @Column({ name: 'request_hash', length: 64 })
  requestHash!: string;

  @Column({ name: 'external_id' })
  externalId!: string;

  @Column({ name: 'customer_id' })
  customerId!: string;

  @Column({ type: 'varchar', length: 20 })
  type!: TransactionType;

  @Column({ type: 'bigint', transformer: bigintToNumber })
  amount!: number;

  @Column({ length: 3 })
  currency!: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ name: 'account_created_at', type: 'timestamptz', nullable: true })
  accountCreatedAt!: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'received' })
  status!: TransactionStatus;

  @Column({ name: 'needs_recheck', default: false })
  needsRecheck!: boolean;

  @Column({ name: 'risk_score', type: 'int', nullable: true })
  riskScore!: number | null;

  @Column({ name: 'rule_errors', type: 'jsonb', nullable: true })
  ruleErrors!: { ruleId: string; message: string }[] | null;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Column({ name: 'evaluated_at', type: 'timestamptz', nullable: true })
  evaluatedAt!: Date | null;

  @OneToMany(() => AlertEntity, (alert) => alert.transaction)
  alerts?: AlertEntity[];
}
