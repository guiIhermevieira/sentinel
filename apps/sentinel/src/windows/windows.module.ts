import { Module } from '@nestjs/common';
import { RecheckService } from './recheck.service';
import { WindowsService } from './windows.service';

@Module({
  providers: [WindowsService, RecheckService],
  exports: [WindowsService, RecheckService],
})
export class WindowsModule {}
