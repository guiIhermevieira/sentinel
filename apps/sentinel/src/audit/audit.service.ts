import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEventEntity } from '../database/entities/audit-event.entity';

export interface AuditFilter {
  entityType?: string;
  entityId?: string;
  limit: number;
}

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditEventEntity) private readonly events: Repository<AuditEventEntity>) {}

  list(filter: AuditFilter) {
    return this.events.find({
      where: { ...(filter.entityType && { entityType: filter.entityType }), ...(filter.entityId && { entityId: filter.entityId }) },
      order: { id: 'DESC' },
      take: filter.limit,
    });
  }
}
