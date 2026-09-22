import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { QueryFailedError, Repository } from 'typeorm';
import { EVALUATION_QUEUE } from '../config';
import { TransactionEntity } from '../database/entities/transaction.entity';
import { CreateTransactionDto } from './create-transaction.dto';

export interface IngestResult {
  transaction: TransactionEntity;
  replayed: boolean;
}

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class IngestionService {
  constructor(
    @InjectRepository(TransactionEntity) private readonly transactions: Repository<TransactionEntity>,
    @InjectQueue(EVALUATION_QUEUE) private readonly queue: Queue,
  ) {}

  async ingest(dto: CreateTransactionDto, idempotencyKey: string): Promise<IngestResult> {
    const requestHash = hashRequest(dto);
    let transaction: TransactionEntity;
    let replayed = false;

    try {
      transaction = await this.transactions.save(this.transactions.create({ ...dto, idempotencyKey, requestHash }));
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      transaction = await this.transactions.findOneByOrFail({ idempotencyKey });
      if (transaction.requestHash !== requestHash) {
        throw new UnprocessableEntityException('Idempotency-Key was already used with a different request body');
      }
      replayed = true;
    }

    if (transaction.status === 'received') {
      await this.queue.add('evaluate', { transactionId: transaction.id }, { jobId: transaction.id });
    }

    return { transaction, replayed };
  }

  findOne(id: string) {
    return this.transactions.findOne({ where: { id }, relations: { alerts: true } });
  }
}

function hashRequest(dto: CreateTransactionDto): string {
  const canonical = JSON.stringify({
    externalId: dto.externalId,
    customerId: dto.customerId,
    type: dto.type,
    amount: dto.amount,
    currency: dto.currency,
    occurredAt: new Date(dto.occurredAt).toISOString(),
    accountCreatedAt: dto.accountCreatedAt ? new Date(dto.accountCreatedAt).toISOString() : undefined,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof QueryFailedError && (err.driverError as { code?: string })?.code === UNIQUE_VIOLATION;
}
