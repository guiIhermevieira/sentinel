# @sentinel-aml/rules-core

A framework-agnostic rules engine for AML (anti-money-laundering) transaction monitoring, with built-in rules for well-known laundering patterns and rolling-window history.

Plain TypeScript with no runtime dependencies. Use it in any Node.js service, worker or serverless function.

```bash
npm install @sentinel-aml/rules-core
```

## Quick start

```ts
import { createRule, InMemoryWindowStore, RulesEngine } from '@sentinel-aml/rules-core';

const engine = new RulesEngine({
  windows: new InMemoryWindowStore(24 * 60 * 60 * 1000),
  rules: [
    createRule('large-amount', { threshold: 5_000_000, weight: 30 }),
    createRule('velocity', { windowMs: 300_000, maxCount: 10, weight: 20 }),
  ],
});

const result = await engine.evaluate({
  id: 'tx-1',
  customerId: 'cust-42',
  type: 'deposit',
  amount: 7_500_000,
  currency: 'BRL',
  occurredAt: new Date(),
});

result.hits;       // [{ ruleId: 'large-amount', score: 30, reason: '...' }]
result.totalScore; // 30
```

Amounts are integers in minor units (cents), never floats.

## Built-in rules

| Rule | Stateful | Flags |
|---|---|---|
| `large-amount` | No | A single transaction at or above `threshold` |
| `velocity` | Yes | More than `maxCount` transactions within `windowMs` |
| `structuring` | Yes | At least `minCount` transactions just below `reportingThreshold` (within `margin`) inside `windowMs` |
| `rapid-in-out` | Yes | A withdrawal of at least `minRatio` of a deposit made within `windowMs` |
| `new-account-high-value` | No | An amount at or above `threshold` within `accountAgeMs` of account opening |

Build rules from plain JSON with `createRule(id, config)`, or validate a config first with `validateRuleConfig(id, config)`, which reports every problem at once:

```ts
validateRuleConfig('velocity', { windowMs: 1.5, weight: 20, extra: true });
// ['Unknown field "extra"', '"windowMs" must be an integer', '"maxCount" is required']
```

## Guarantees

- **Idempotent history.** Recording the same transaction twice never counts it twice, so evaluations are safe to retry.
- **Event time, bounded on both sides.** Windows use each transaction's own `occurredAt`, and a rule only sees history up to that moment, so results are deterministic regardless of processing order.
- **Isolated failures.** A rule that throws is reported in `result.errors`; the other rules still run.

## Custom rules and storage

Implement `Rule` to add your own rules. Mark them `stateful: true` if they read history through `ctx.windows`.

`InMemoryWindowStore` is for tests and development. For production, use [`@sentinel-aml/store-redis`](https://www.npmjs.com/package/@sentinel-aml/store-redis), or implement the `WindowStore` interface for your own storage.

Rules can also come from a `RuleSource` (`{ current(): Rule[] }`) instead of an array, which lets you change them at runtime.

## License

[MPL-2.0](LICENSE). Part of [Sentinel](https://github.com/guiIhermevieira/sentinel).
