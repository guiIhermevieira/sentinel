import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { TypeOrmModule } from '@nestjs/typeorm';
import depthLimit from 'graphql-depth-limit';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CasesService } from '../cases/cases.service';
import { config } from '../config';
import { AuditEventEntity } from '../database/entities/audit-event.entity';
import { RulesConfigModule } from '../rules/rules-config.module';
import { createLoaders, GraphQLContext } from './loaders';
import { AlertResolver, AuditResolver, CaseResolver, RuleConfigResolver, TransactionResolver } from './resolvers';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditEventEntity]),
    RulesConfigModule,
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [DataSource],
      useFactory: (db: DataSource) => ({
        autoSchemaFile: join(__dirname, '..', '..', 'schema.gql'),
        sortSchema: true,
        playground: false,
        validationRules: [depthLimit(config.graphqlMaxDepth)],
        context: ({ req }: { req: GraphQLContext['req'] }): GraphQLContext => ({ req, loaders: createLoaders(db) }),
      }),
    }),
  ],
  providers: [CasesService, AuditService, CaseResolver, AlertResolver, TransactionResolver, AuditResolver, RuleConfigResolver],
})
export class AnalystApiModule {}
