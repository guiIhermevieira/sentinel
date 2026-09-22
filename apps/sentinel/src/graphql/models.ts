import { Field, Float, ID, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import GraphQLJSON from 'graphql-type-json';

export enum CaseStatus {
  open = 'open',
  in_review = 'in_review',
  escalated = 'escalated',
  dismissed = 'dismissed',
}
registerEnumType(CaseStatus, { name: 'CaseStatus', description: 'open → in_review → escalated | dismissed' });

@ObjectType('Transaction')
export class TransactionModel {
  @Field(() => ID) id!: string;
  @Field() externalId!: string;
  @Field() customerId!: string;
  @Field() type!: string;
  @Field(() => Float, { description: 'Minor units (e.g. cents). Float because GraphQL Int is 32-bit.' })
  amount!: number;
  @Field() currency!: string;
  @Field() occurredAt!: Date;
  @Field({ nullable: true }) accountCreatedAt?: Date;
  @Field() status!: string;
  @Field(() => Int, { nullable: true }) riskScore?: number;
  @Field({ description: 'Evaluated while rolling windows were being rebuilt; stateful rules will re-run.' })
  needsRecheck!: boolean;
  @Field() receivedAt!: Date;
  @Field({ nullable: true }) evaluatedAt?: Date;
}

@ObjectType('Alert')
export class AlertModel {
  @Field(() => ID) id!: string;
  @Field() ruleId!: string;
  @Field(() => Int) score!: number;
  @Field() reason!: string;
  @Field({ description: 'Raised while rolling windows were incomplete. Cleared once re-checked with full history.' })
  partialContext!: boolean;
  @Field() createdAt!: Date;
  @Field(() => ID) transactionId!: string;
  @Field(() => ID, { nullable: true }) caseId?: string;
}

@ObjectType('AuditEvent')
export class AuditEventModel {
  @Field(() => ID) id!: string;
  @Field() occurredAt!: Date;
  @Field() actorType!: string;
  @Field() actorName!: string;
  @Field() action!: string;
  @Field() entityType!: string;
  @Field() entityId!: string;
  @Field(() => GraphQLJSON, { nullable: true }) changes?: Record<string, unknown>;
  @Field(() => GraphQLJSON, { nullable: true }) metadata?: Record<string, unknown>;
}

@ObjectType('Case')
export class CaseModel {
  @Field(() => ID) id!: string;
  @Field() customerId!: string;
  @Field(() => CaseStatus) status!: CaseStatus;
  @Field(() => Int) riskScore!: number;
  @Field(() => Int) alertCount!: number;
  @Field({ nullable: true }) resolutionNote?: string;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
  @Field({ nullable: true }) lastAlertAt?: Date;
  @Field({ nullable: true }) closedAt?: Date;
}

@ObjectType('RuleConfig')
export class RuleConfigModel {
  @Field() ruleId!: string;
  @Field() enabled!: boolean;
  @Field(() => GraphQLJSON) config!: Record<string, unknown>;
  @Field(() => Int) version!: number;
  @Field() updatedAt!: Date;
  @Field() updatedBy!: string;
}

@InputType()
export class UpdateRuleConfigInput {
  @Field() @IsString() @MaxLength(64)
  ruleId!: string;

  @Field(() => Int, { description: 'The version being edited. Stale versions are rejected with VERSION_CONFLICT.' })
  @IsInt() @Min(1)
  expectedVersion!: number;

  @Field({ nullable: true }) @IsOptional() @IsBoolean()
  enabled?: boolean;

  @Field(() => GraphQLJSON, { nullable: true }) @IsOptional() @IsObject()
  config?: Record<string, unknown>;
}
