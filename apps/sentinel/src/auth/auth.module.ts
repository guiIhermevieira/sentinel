import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeysService } from './api-keys.service';
import { AuthGuard } from './auth.guard';

@Global()
@Module({
  providers: [ApiKeysService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [ApiKeysService],
})
export class AuthModule {}
