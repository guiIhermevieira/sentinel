import { DynamicModule, Module } from '@nestjs/common';
import { RulesEngine, RulesEngineOptions } from '@sentinel-aml/rules-core';

export interface SentinelRulesAsyncOptions {
  imports?: DynamicModule['imports'];
  inject?: any[];
  useFactory: (...args: any[]) => RulesEngineOptions | Promise<RulesEngineOptions>;
}

@Module({})
export class SentinelRulesModule {
  static forRoot(options: RulesEngineOptions): DynamicModule {
    return {
      module: SentinelRulesModule,
      global: true,
      providers: [{ provide: RulesEngine, useValue: new RulesEngine(options) }],
      exports: [RulesEngine],
    };
  }

  static forRootAsync(options: SentinelRulesAsyncOptions): DynamicModule {
    return {
      module: SentinelRulesModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        {
          provide: RulesEngine,
          inject: options.inject ?? [],
          useFactory: async (...args: any[]) => new RulesEngine(await options.useFactory(...args)),
        },
      ],
      exports: [RulesEngine],
    };
  }
}
