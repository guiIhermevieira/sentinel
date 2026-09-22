import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type Role = 'producer' | 'analyst' | 'admin';
export const ROLES: Role[] = ['producer', 'analyst', 'admin'];

@Entity('api_keys')
export class ApiKeyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 20 })
  role!: Role;

  @Column({ name: 'key_hash', length: 64, unique: true })
  keyHash!: string;

  @Column({ name: 'key_prefix', length: 12 })
  keyPrefix!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
