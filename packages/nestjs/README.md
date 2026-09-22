# @sentinel-aml/nestjs

A NestJS module for [`@sentinel-aml/rules-core`](https://www.npmjs.com/package/@sentinel-aml/rules-core). It registers a global `RulesEngine` provider you can inject anywhere.

```bash
npm install @sentinel-aml/rules-core @sentinel-aml/nestjs
```

```ts
import { Module } from '@nestjs/common';
import { SentinelRulesModule } from '@sentinel-aml/nestjs';
import { createRule, InMemoryWindowStore } from '@sentinel-aml/rules-core';

@Module({
  imports: [
    SentinelRulesModule.forRoot({
      windows: new InMemoryWindowStore(24 * 60 * 60 * 1000),
      rules: [createRule('large-amount', { threshold: 5_000_000, weight: 30 })],
    }),
  ],
})
export class AppModule {}
```

Use `forRootAsync({ imports, inject, useFactory })` to build the options from other providers, such as a Redis client or a rule source backed by your database.

```ts
@Injectable()
export class TransactionsService {
  constructor(private readonly engine: RulesEngine) {}
}
```

## License

[MPL-2.0](LICENSE). Part of [Sentinel](https://github.com/guiIhermevieira/sentinel).
