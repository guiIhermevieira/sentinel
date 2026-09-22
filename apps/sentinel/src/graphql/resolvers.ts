import { Args, Context, ID, Int, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { AuditService } from '../audit/audit.service';
import { CurrentPrincipal, Roles } from '../auth/decorators';
import { actorOf, Principal } from '../auth/principal';
import { CasesService } from '../cases/cases.service';
import { AlertEntity } from '../database/entities/alert.entity';
import { CaseEntity } from '../database/entities/case.entity';
import { TransactionEntity } from '../database/entities/transaction.entity';
import { RuleConfigsService } from '../rules/rule-configs.service';
import { GraphQLContext } from './loaders';
import { AlertModel, AuditEventModel, CaseModel, CaseStatus, RuleConfigModel, TransactionModel, UpdateRuleConfigInput } from './models';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

@Resolver(() => CaseModel)
export class CaseResolver {
  constructor(private readonly casesService: CasesService) {}

  @Roles('analyst')
  @Query(() => [CaseModel], { description: 'Cases ordered by risk, highest first.' })
  cases(
    @Args('status', { type: () => CaseStatus, nullable: true }) status?: CaseStatus,
    @Args('customerId', { nullable: true }) customerId?: string,
    @Args('limit', { type: () => Int, defaultValue: 20 }) limit = 20,
    @Args('offset', { type: () => Int, defaultValue: 0 }) offset = 0,
  ) {
    return this.casesService.list({ status, customerId, limit: clamp(limit, 1, 100), offset: Math.max(offset, 0) });
  }

  @Roles('analyst')
  @Query(() => CaseModel, { nullable: true })
  case(@Args('id', { type: () => ID }) id: string) {
    return this.casesService.findOne(id);
  }

  @Roles('analyst')
  @Mutation(() => CaseModel)
  startReview(@Args('id', { type: () => ID }) id: string, @CurrentPrincipal() principal: Principal) {
    return this.casesService.startReview(id, actorOf(principal));
  }

  @Roles('analyst')
  @Mutation(() => CaseModel)
  escalateCase(
    @Args('id', { type: () => ID }) id: string,
    @CurrentPrincipal() principal: Principal,
    @Args('note', { nullable: true }) note?: string,
  ) {
    return this.casesService.escalate(id, actorOf(principal), note);
  }

  @Roles('analyst')
  @Mutation(() => CaseModel)
  dismissCase(@Args('id', { type: () => ID }) id: string, @Args('note') note: string, @CurrentPrincipal() principal: Principal) {
    return this.casesService.dismiss(id, actorOf(principal), note);
  }

  @ResolveField(() => [AlertModel])
  alerts(@Parent() c: CaseEntity, @Context() ctx: GraphQLContext) {
    return ctx.loaders.alertsByCase.load(c.id);
  }

  @ResolveField(() => [AuditEventModel], { description: 'Every recorded action on this case, oldest first.' })
  auditTrail(@Parent() c: CaseEntity, @Context() ctx: GraphQLContext) {
    return ctx.loaders.caseAuditTrail.load(c.id);
  }
}

@Resolver(() => AlertModel)
export class AlertResolver {
  @ResolveField(() => TransactionModel)
  transaction(@Parent() alert: AlertEntity, @Context() ctx: GraphQLContext) {
    return ctx.loaders.transaction.load(alert.transactionId);
  }
}

@Resolver(() => TransactionModel)
export class TransactionResolver {
  @Roles('analyst')
  @Query(() => TransactionModel, { nullable: true })
  transaction(@Args('id', { type: () => ID }) id: string, @Context() ctx: GraphQLContext) {
    return ctx.loaders.transaction.load(id);
  }

  @ResolveField(() => [AlertModel])
  alerts(@Parent() tx: TransactionEntity, @Context() ctx: GraphQLContext) {
    return ctx.loaders.alertsByTransaction.load(tx.id);
  }
}

@Resolver(() => AuditEventModel)
export class AuditResolver {
  constructor(private readonly audit: AuditService) {}

  @Roles('analyst')
  @Query(() => [AuditEventModel], { description: 'Most recent first.' })
  auditEvents(
    @Args('entityType', { nullable: true }) entityType?: string,
    @Args('entityId', { nullable: true }) entityId?: string,
    @Args('limit', { type: () => Int, defaultValue: 50 }) limit = 50,
  ) {
    return this.audit.list({ entityType, entityId, limit: clamp(limit, 1, 200) });
  }
}

@Resolver(() => RuleConfigModel)
export class RuleConfigResolver {
  constructor(private readonly ruleConfigsService: RuleConfigsService) {}

  @Roles('analyst')
  @Query(() => [RuleConfigModel])
  ruleConfigs() {
    return this.ruleConfigsService.list();
  }

  @Roles('admin')
  @Mutation(() => RuleConfigModel)
  updateRuleConfig(@Args('input') input: UpdateRuleConfigInput, @CurrentPrincipal() principal: Principal) {
    const { ruleId, ...update } = input;
    return this.ruleConfigsService.update(ruleId, update, actorOf(principal));
  }
}
