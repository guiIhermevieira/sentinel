import DataLoader from 'dataloader';
import { DataSource, In } from 'typeorm';
import { AlertEntity } from '../database/entities/alert.entity';
import { AuditEventEntity } from '../database/entities/audit-event.entity';
import { TransactionEntity } from '../database/entities/transaction.entity';

export function createLoaders(db: DataSource) {
  const alerts = db.getRepository(AlertEntity);
  const transactions = db.getRepository(TransactionEntity);
  const audit = db.getRepository(AuditEventEntity);

  return {
    alertsByCase: new DataLoader<string, AlertEntity[]>(async (caseIds) => {
      const rows = await alerts.find({ where: { caseId: In([...caseIds]) }, order: { createdAt: 'ASC' } });
      return caseIds.map((id) => rows.filter((a) => a.caseId === id));
    }),
    alertsByTransaction: new DataLoader<string, AlertEntity[]>(async (txIds) => {
      const rows = await alerts.find({ where: { transactionId: In([...txIds]) }, order: { createdAt: 'ASC' } });
      return txIds.map((id) => rows.filter((a) => a.transactionId === id));
    }),
    caseAuditTrail: new DataLoader<string, AuditEventEntity[]>(async (caseIds) => {
      const rows = await audit.find({ where: { entityType: 'case', entityId: In([...caseIds]) }, order: { id: 'ASC' } });
      return caseIds.map((id) => rows.filter((e) => e.entityId === id));
    }),
    transaction: new DataLoader<string, TransactionEntity | null>(async (ids) => {
      const rows = await transactions.findBy({ id: In([...ids]) });
      return ids.map((id) => rows.find((t) => t.id === id) ?? null);
    }),
  };
}

export type Loaders = ReturnType<typeof createLoaders>;
export interface GraphQLContext {
  req: { headers: Record<string, string | undefined> };
  loaders: Loaders;
}
