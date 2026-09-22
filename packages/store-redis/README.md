# @sentinel-aml/store-redis

A Redis-backed `WindowStore` for [`@sentinel-aml/rules-core`](https://www.npmjs.com/package/@sentinel-aml/rules-core): per-customer rolling windows in sorted sets, recorded atomically with a Lua script.

```bash
npm install @sentinel-aml/rules-core @sentinel-aml/store-redis ioredis
```

```ts
import { createRule, RulesEngine } from '@sentinel-aml/rules-core';
import { RedisWindowStore } from '@sentinel-aml/store-redis';
import Redis from 'ioredis';

const engine = new RulesEngine({
  windows: new RedisWindowStore(new Redis(process.env.REDIS_URL), { retentionMs: 24 * 60 * 60 * 1000 }),
  rules: [createRule('velocity', { windowMs: 300_000, maxCount: 10, weight: 20 })],
});
```

## How it works

Each window is a sorted set scored by event time. A single Lua script adds the entry, trims anything older than `retentionMs`, and refreshes the key's TTL, atomically. Members are keyed by transaction ID, so retries never create duplicates.

Set `retentionMs` to at least the longest window any of your rules uses.

Redis holds derived state. Keep your transactions in a durable store, so windows can be rebuilt if Redis is ever emptied: replay recent transactions through `engine.record(tx)`.

## License

[MPL-2.0](LICENSE). Part of [Sentinel](https://github.com/guiIhermevieira/sentinel).
