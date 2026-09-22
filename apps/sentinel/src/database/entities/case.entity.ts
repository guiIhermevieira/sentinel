import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AlertEntity } from './alert.entity';

export type CaseStatus = 'open' | 'in_review' | 'escalated' | 'dismissed';
export const ACTIVE_CASE_STATUSES: CaseStatus[] = ['open', 'in_review'];

@Entity('cases')
export class CaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'customer_id' })
  customerId!: string;

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status!: CaseStatus;

  @Column({ name: 'risk_score', type: 'int', default: 0 })
  riskScore!: number;

  @Column({ name: 'alert_count', type: 'int', default: 0 })
  alertCount!: number;

  @Column({ name: 'resolution_note', type: 'text', nullable: true })
  resolutionNote!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'last_alert_at', type: 'timestamptz', nullable: true })
  lastAlertAt!: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt!: Date | null;

  @OneToMany(() => AlertEntity, (alert) => alert.case)
  alerts?: AlertEntity[];
}
