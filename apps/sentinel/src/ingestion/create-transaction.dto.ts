import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, Length, MaxLength } from 'class-validator';
import type { TransactionType } from '@sentinel-aml/rules-core';

export const TRANSACTION_TYPES: TransactionType[] = ['deposit', 'withdrawal', 'bet', 'payout', 'transfer'];

export class CreateTransactionDto {
  @IsString() @IsNotEmpty() @MaxLength(128)
  externalId!: string;

  @IsString() @IsNotEmpty() @MaxLength(128)
  customerId!: string;

  @IsIn(TRANSACTION_TYPES)
  type!: TransactionType;

  @IsInt() @IsPositive()
  amount!: number;

  @IsString() @Length(3, 3)
  currency!: string;

  @Type(() => Date) @IsDate()
  occurredAt!: Date;

  @IsOptional() @Type(() => Date) @IsDate()
  accountCreatedAt?: Date;
}
