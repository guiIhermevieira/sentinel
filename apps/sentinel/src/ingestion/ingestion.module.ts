import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EVALUATION_QUEUE } from '../config';
import { TransactionEntity } from '../database/entities/transaction.entity';
import { IngestionService } from './ingestion.service';
import { TransactionsController } from './transactions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionEntity]), BullModule.registerQueue({ name: EVALUATION_QUEUE })],
  controllers: [TransactionsController],
  providers: [IngestionService],
})
export class IngestionModule {}
