import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { EVALUATION_QUEUE } from '../config';
import { WindowsModule } from '../windows/windows.module';
import { EvaluationProcessor } from './evaluation.processor';

@Module({
  imports: [BullModule.registerQueue({ name: EVALUATION_QUEUE }), WindowsModule],
  providers: [EvaluationProcessor],
})
export class ProcessingModule {}
