import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { CaseEntity } from './case.entity';
import { TransactionEntity } from './transaction.entity';

@Entity('alerts')
@Unique('uq_alert_transaction_rule', ['transactionId', 'ruleId'])
@Index(['customerId', 'createdAt'])
export class AlertEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @ManyToOne(() => TransactionEntity, (tx) => tx.alerts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transaction_id' })
  transaction?: TransactionEntity;

  @Column({ name: 'case_id', type: 'uuid', nullable: true })
  caseId!: string | null;

  @ManyToOne(() => CaseEntity, (c) => c.alerts)
  @JoinColumn({ name: 'case_id' })
  case?: CaseEntity;

  @Column({ name: 'customer_id' })
  customerId!: string;

  @Column({ name: 'rule_id', length: 64 })
  ruleId!: string;

  @Column({ type: 'int' })
  score!: number;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ name: 'partial_context', default: false })
  partialContext!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
