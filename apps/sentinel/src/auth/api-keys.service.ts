import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, IsNull } from 'typeorm';
import { Actor, appendAudit } from '../audit/audit';
import { config } from '../config';
import { ApiKeyEntity, Role } from '../database/entities/api-key.entity';
import { Principal } from './principal';

const KEY_PREFIX = 'snt_';

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

export interface CreatedApiKey {
  id: string;
  name: string;
  role: Role;
  key: string;
}

@Injectable()
export class ApiKeysService {
  private readonly cache = new Map<string, { principal: Principal | null; expiresAt: number }>();

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async create(name: string, role: Role, actor: Actor): Promise<CreatedApiKey> {
    const key = KEY_PREFIX + randomBytes(32).toString('base64url');
    return this.db.transaction(async (manager) => {
      const saved = await manager.save(ApiKeyEntity, manager.create(ApiKeyEntity, {
        name,
        role,
        keyHash: hashKey(key),
        keyPrefix: key.slice(0, 12),
      }));
      await appendAudit(manager, {
        actor,
        action: 'api_key.created',
        entityType: 'api_key',
        entityId: saved.id,
        metadata: { name, role, keyPrefix: saved.keyPrefix },
      });
      return { id: saved.id, name, role, key };
    });
  }

  async revoke(id: string, actor: Actor): Promise<void> {
    await this.db.transaction(async (manager) => {
      const result = await manager.update(ApiKeyEntity, { id, revokedAt: IsNull() }, { revokedAt: new Date() });
      if (result.affected) {
        await appendAudit(manager, { actor, action: 'api_key.revoked', entityType: 'api_key', entityId: id });
      }
    });
    this.cache.clear();
  }

  async verify(key: string): Promise<Principal | null> {
    if (!key.startsWith(KEY_PREFIX)) return null;
    const hash = hashKey(key);
    const cached = this.cache.get(hash);
    if (cached && cached.expiresAt > Date.now()) return cached.principal;

    const row = await this.db.getRepository(ApiKeyEntity).findOneBy({ keyHash: hash, revokedAt: IsNull() });
    const principal = row ? { id: row.id, name: row.name, role: row.role } : null;
    this.cache.set(hash, { principal, expiresAt: Date.now() + config.apiKeyCacheMs });
    return principal;
  }
}
