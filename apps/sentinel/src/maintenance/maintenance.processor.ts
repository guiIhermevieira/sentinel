import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MAINTENANCE_QUEUE } from '../config';
import { RecheckService } from '../windows/recheck.service';
import { WindowsService } from '../windows/windows.service';
import { StaleSweeperService } from './stale-sweeper.service';

export type MaintenanceTask = 'sweep-stale' | 'recheck' | 'windows-check';

@Processor(MAINTENANCE_QUEUE)
export class MaintenanceProcessor extends WorkerHost {
  constructor(
    private readonly sweeper: StaleSweeperService,
    private readonly recheck: RecheckService,
    private readonly windows: WindowsService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name as MaintenanceTask) {
      case 'sweep-stale':
        return this.sweeper.sweep();
      case 'recheck':
        return this.recheck.run();
      case 'windows-check':
        return this.windows.ensureReady();
      default:
        throw new Error(`Unknown maintenance task ${job.name}`);
    }
  }
}
