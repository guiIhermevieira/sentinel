import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { GraphQLError } from 'graphql';
import { DataSource } from 'typeorm';
import { Actor, appendAudit } from '../audit/audit';
import { CaseEntity, CaseStatus } from '../database/entities/case.entity';

export interface CaseFilter {
  status?: CaseStatus;
  customerId?: string;
  limit: number;
  offset: number;
}

type Action = 'startReview' | 'escalate' | 'dismiss';

const TRANSITIONS: Record<Action, { from: CaseStatus[]; to: CaseStatus; audit: string }> = {
  startReview: { from: ['open'], to: 'in_review', audit: 'case.review_started' },
  escalate: { from: ['open', 'in_review'], to: 'escalated', audit: 'case.escalated' },
  dismiss: { from: ['open', 'in_review'], to: 'dismissed', audit: 'case.dismissed' },
};

@Injectable()
export class CasesService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  list(filter: CaseFilter) {
    return this.db.getRepository(CaseEntity).find({
      where: { ...(filter.status && { status: filter.status }), ...(filter.customerId && { customerId: filter.customerId }) },
      order: { riskScore: 'DESC', lastAlertAt: 'DESC' },
      take: filter.limit,
      skip: filter.offset,
    });
  }

  findOne(id: string) {
    return this.db.getRepository(CaseEntity).findOneBy({ id });
  }

  startReview(id: string, actor: Actor) {
    return this.transition(id, 'startReview', actor);
  }

  escalate(id: string, actor: Actor, note?: string) {
    return this.transition(id, 'escalate', actor, note);
  }

  dismiss(id: string, actor: Actor, note: string) {
    if (!note?.trim()) {
      throw new GraphQLError('A note is required to dismiss a case', { extensions: { code: 'BAD_USER_INPUT' } });
    }
    return this.transition(id, 'dismiss', actor, note);
  }

  private async transition(id: string, action: Action, actor: Actor, note?: string): Promise<CaseEntity> {
    const { from, to, audit } = TRANSITIONS[action];
    const closing = to === 'escalated' || to === 'dismissed';

    const changed = await this.db.transaction(async (manager) => {
      const [rows]: [{ from_status: CaseStatus }[]] = await manager.query(
        `WITH prev AS (SELECT id, status FROM cases WHERE id = $1 FOR UPDATE)
         UPDATE cases c
            SET status = $2, updated_at = now(),
                resolution_note = COALESCE($3, c.resolution_note),
                closed_at = CASE WHEN $4 THEN now() ELSE c.closed_at END
           FROM prev
          WHERE c.id = prev.id AND prev.status = ANY($5::varchar[])
         RETURNING prev.status AS from_status`,
        [id, to, note ?? null, closing, from],
      );
      const previous = rows[0]?.from_status;
      if (!previous) return false;

      await appendAudit(manager, {
        actor,
        action: audit,
        entityType: 'case',
        entityId: id,
        changes: { status: { from: previous, to }, ...(note !== undefined && { resolutionNote: note }) },
      });
      return true;
    });

    const current = await this.findOne(id);
    if (!current) throw new GraphQLError(`Case ${id} not found`, { extensions: { code: 'NOT_FOUND' } });
    if (!changed) {
      throw new GraphQLError(`Cannot ${action} a case that is ${current.status}`, {
        extensions: { code: 'INVALID_TRANSITION', status: current.status },
      });
    }
    return current;
  }
}
