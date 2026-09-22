import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('rule_configs')
export class RuleConfigEntity {
  @PrimaryColumn({ name: 'rule_id', length: 64 })
  ruleId!: string;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ type: 'jsonb' })
  config!: Record<string, unknown>;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ name: 'updated_by', length: 100, default: 'system' })
  updatedBy!: string;
}
