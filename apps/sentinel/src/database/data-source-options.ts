import { DataSourceOptions } from 'typeorm';
import { config } from '../config';
import { AlertEntity } from './entities/alert.entity';
import { ApiKeyEntity } from './entities/api-key.entity';
import { AuditEventEntity } from './entities/audit-event.entity';
import { CaseEntity } from './entities/case.entity';
import { RuleConfigEntity } from './entities/rule-config.entity';
import { TransactionEntity } from './entities/transaction.entity';
import { InitialSchema1758500000000 } from './migrations/1758500000000-InitialSchema';
import { Cases1758600000000 } from './migrations/1758600000000-Cases';
import { AuthAuditRuleConfigs1758700000000 } from './migrations/1758700000000-AuthAuditRuleConfigs';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: config.databaseUrl,
  entities: [TransactionEntity, AlertEntity, CaseEntity, ApiKeyEntity, AuditEventEntity, RuleConfigEntity],
  migrations: [InitialSchema1758500000000, Cases1758600000000, AuthAuditRuleConfigs1758700000000],
  migrationsRun: true,
  synchronize: false,
};
