import { BadRequestException, Body, Controller, Get, Headers, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/decorators';
import { CreateTransactionDto } from './create-transaction.dto';
import { IngestionService } from './ingestion.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly ingestion: IngestionService) {}

  @Roles('producer')
  @Post()
  @HttpCode(202)
  async create(
    @Body() dto: CreateTransactionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 255) {
      throw new BadRequestException('A valid Idempotency-Key header is required');
    }
    const { transaction, replayed } = await this.ingestion.ingest(dto, idempotencyKey);
    if (replayed) res.setHeader('Idempotent-Replayed', 'true');
    return { id: transaction.id, status: transaction.status };
  }

  @Roles('producer', 'analyst')
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const tx = await this.ingestion.findOne(id);
    if (!tx) throw new NotFoundException();
    return tx;
  }
}
