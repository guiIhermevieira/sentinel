import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import { config, EVALUATION_QUEUE, MAINTENANCE_QUEUE } from '../config';
import { WindowsModule } from '../windows/windows.module';
import { MaintenanceProcessor, MaintenanceTask } from './maintenance.processor';
import { StaleSweeperService } from './stale-sweeper.service';

const SCHEDULES: Record<MaintenanceTask, number> = {
  'sweep-stale': config.sweepEveryMs,
  recheck: config.recheckEveryMs,
  'windows-check': config.windowsCheckEveryMs,
};

@Module({
  imports: [
    BullModule.registerQueue({ name: EVALUATION_QUEUE }),
    BullModule.registerQueue({ name: MAINTENANCE_QUEUE, defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 } }),
    WindowsModule,
  ],
  providers: [StaleSweeperService, MaintenanceProcessor],
  exports: [StaleSweeperService],
})
export class MaintenanceModule implements OnApplicationBootstrap {
  constructor(@InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap() {
    for (const [task, every] of Object.entries(SCHEDULES)) {
      if (config.maintenanceEnabled) {
        await this.queue.upsertJobScheduler(task, { every }, { name: task });
      } else {
        await this.queue.removeJobScheduler(task);
      }
    }
  }
}
