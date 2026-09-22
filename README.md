# Sentinel

[![CI](https://github.com/guiIhermevieira/sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/guiIhermevieira/sentinel/actions/workflows/ci.yml)
[![npm](https://img.shields.io/badge/npm-%40sentinel--aml-cb3837?logo=npm)](https://www.npmjs.com/org/sentinel-aml)
[![License: MPL-2.0 / AGPL-3.0](https://img.shields.io/badge/license-MPL--2.0%20%2F%20AGPL--3.0-blue)](#license)

Transaction monitoring for AML compliance: a NestJS service plus a framework-agnostic rules engine you can use on its own.

**[Try it in the developer console](https://guiihermevieira.github.io/sentinel/)**: walk through each laundering pattern and experiment with the real rules engine, live in your browser.

## Architecture

```mermaid
flowchart LR
    C[Client / Producer] -->|POST /transactions| I[Ingestion API<br/>REST · idempotency key]
    I --> DB[(PostgreSQL)]
    I -->|enqueue| Q[[BullMQ · Redis]]
    Q --> W[Rules Worker]
    W -->|rolling windows| R[(Redis)]
    W -->|alerts| A[Alerts]
    A --> CA[Case Aggregator<br/>per customer]
    CA --> DB
    G[GraphQL API<br/>analysts] --> DB
    G -->|review / escalate / dismiss| AU[Audit Log<br/>append-only]
    AU --- DB
```

Key decisions are documented as [Architecture Decision Records](docs/adr/).

## Packages

The rules engine is published to npm and can be used without the rest of Sentinel:

| Package | Version | What it is |
|---|---|---|
| [`@sentinel-aml/rules-core`](https://www.npmjs.com/package/@sentinel-aml/rules-core) | [![npm](https://img.shields.io/npm/v/@sentinel-aml/rules-core?label=)](https://www.npmjs.com/package/@sentinel-aml/rules-core) | The engine, built-in AML rules and rule catalog. No runtime dependencies. |
| [`@sentinel-aml/store-redis`](https://www.npmjs.com/package/@sentinel-aml/store-redis) | [![npm](https://img.shields.io/npm/v/@sentinel-aml/store-redis?label=)](https://www.npmjs.com/package/@sentinel-aml/store-redis) | Redis-backed rolling windows. |
| [`@sentinel-aml/nestjs`](https://www.npmjs.com/package/@sentinel-aml/nestjs) | [![npm](https://img.shields.io/npm/v/@sentinel-aml/nestjs?label=)](https://www.npmjs.com/package/@sentinel-aml/nestjs) | NestJS module. |

```bash
npm install @sentinel-aml/rules-core
```

Each package's README has a quick start: [rules-core](packages/rules-core), [store-redis](packages/store-redis), [nestjs](packages/nestjs).

Releases are versioned with Changesets and published from CI with npm trusted publishing and provenance. See [RELEASING.md](RELEASING.md).

## Repository layout

| Path | What it is |
|---|---|
| `packages/rules-core` | The rules engine: `Rule` interface, runner, built-in AML rules, `WindowStore` abstraction. Plain TypeScript, no framework. |
| `packages/store-redis` | `WindowStore` backed by Redis sorted sets and an atomic Lua script. |
| `packages/nestjs` | Thin NestJS module that wires the engine into a Nest app. |
| `apps/sentinel` | The service itself: ingestion, cases, GraphQL, audit. |
| `apps/dashboard` | The developer console: use cases and a live playground running the rules engine in the browser. |

## Getting started

Requires Node 22+ and pnpm 9.

```bash
pnpm install
docker compose up -d     # PostgreSQL and Redis
pnpm build
pnpm test
pnpm --filter @sentinel-aml/app test:e2e   # end-to-end, against Postgres and Redis
pnpm --filter @sentinel-aml/app start
```

To work on the developer console:

```bash
pnpm --filter @sentinel-aml/dashboard dev   # http://localhost:5173
```

Every request except `GET /health` needs an API key. Create one per client; the key is printed once:

```bash
pnpm --filter @sentinel-aml/app api-key:create payments-service producer
pnpm --filter @sentinel-aml/app api-key:create ana analyst
pnpm --filter @sentinel-aml/app api-key:create compliance-lead admin
```

| Role | Can |
|---|---|
| `producer` | Submit transactions and read their status |
| `analyst` | Investigate and act on cases; read alerts, transactions, audit events and rule configs |
| `admin` | Everything, including changing rule thresholds |

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://sentinel:sentinel@localhost:5432/sentinel` | PostgreSQL |
| `REDIS_URL` | `redis://localhost:6379` | Queue and rolling windows |
| `PORT` | `3000` | HTTP port |
| `SENTINEL_MAINTENANCE` | on | Set to `off` to disable scheduled maintenance jobs |
| `SENTINEL_STALE_AFTER_SECONDS` | `120` | When a still-`received` transaction counts as stale |
| `SENTINEL_SWEEP_EVERY_SECONDS` | `60` | Stale-transaction sweeper interval |
| `SENTINEL_RECHECK_EVERY_SECONDS` | `30` | Re-check job interval |
| `SENTINEL_WINDOWS_CHECK_EVERY_SECONDS` | `15` | How often to verify Redis windows are intact |
| `SENTINEL_RULE_REFRESH_SECONDS` | `10` | How often each instance checks for rule config changes (`0` disables polling) |
| `SENTINEL_API_KEY_CACHE_SECONDS` | `30` | How long a verified key is cached |
| `SENTINEL_GRAPHQL_MAX_DEPTH` | `8` | Maximum GraphQL query depth |

## API

**Submit a transaction.** Amounts are in minor units (cents).

```bash
curl -i -X POST localhost:3000/transactions \
  -H "Authorization: Bearer $PRODUCER_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 7f3c9a1e-2b4d-4e8f-9a6c-1d2e3f4a5b6c' \
  -d '{"externalId":"ext-001","customerId":"cust-42","type":"deposit","amount":150000,"currency":"BRL","occurredAt":"2026-09-22T12:00:00Z"}'
```

Returns `202 Accepted` with `{ "id": "...", "status": "received" }`. Retrying with the same key and body returns the same transaction and an `Idempotent-Replayed: true` header. Reusing a key with a different body returns `422`.

`accountCreatedAt` is optional. When present, it enables the new-account rule.

**Check the result:** `GET /transactions/:id` returns the transaction with its risk score and alerts once evaluated.

### Analyst API (GraphQL)

Available at `POST /graphql` with an analyst or admin key. The full schema is in [`apps/sentinel/schema.gql`](apps/sentinel/schema.gql).

```graphql
# Open cases, highest risk first, with the evidence behind them
query {
  cases(status: open, limit: 10) {
    id customerId riskScore alertCount lastAlertAt
    alerts { ruleId score reason transaction { amount type occurredAt } }
  }
}

# Workflow: open → in_review → escalated | dismissed
mutation { startReview(id: "…") { status } }
mutation { escalateCase(id: "…", note: "Pattern consistent with layering") { status closedAt } }
mutation { dismissCase(id: "…", note: "False positive: payroll deposit") { status } }
```

Invalid transitions return an `INVALID_TRANSITION` error code, and unknown cases return `NOT_FOUND`.

```graphql
# Who did what to a case, oldest first
query { case(id: "…") { status auditTrail { occurredAt actorName action changes } } }

# Tune a rule (admins only). Takes effect on every instance within seconds, no restart.
query { ruleConfigs { ruleId enabled version config } }
mutation {
  updateRuleConfig(input: { ruleId: "velocity", expectedVersion: 3, config: { windowMs: 300000, maxCount: 15, weight: 20 } }) {
    version config updatedBy
  }
}
```

Rule updates use optimistic concurrency: a stale `expectedVersion` returns `VERSION_CONFLICT`. Invalid configs return `BAD_USER_INPUT` with every problem listed.

## Rules

| Rule | Type | Flags |
|---|---|---|
| `large-amount` | Stateless | A single transaction at or above a threshold |
| `velocity` | Stateful | Too many transactions in a short window |
| `structuring` | Stateful | Several transactions just below a reporting threshold within a window |
| `rapid-in-out` | Stateful | A withdrawal closely following a deposit of a similar amount |
| `new-account-high-value` | Stateless | High-value activity shortly after an account is opened |

Each hit adds its weight to the transaction's risk score and becomes an alert. Alerts are grouped into one active case per customer ([ADR-007](docs/adr/0007-one-active-case-per-customer.md)). Thresholds live in the database and can be changed at runtime ([ADR-003](docs/adr/0003-rule-configuration-in-the-database.md)).

## Reliability

Scheduled maintenance jobs, run once across all instances through BullMQ job schedulers, close the gaps documented in the ADRs:

- **Stale-transaction sweeper:** re-enqueues transactions that were saved but never evaluated ([ADR-001](docs/adr/0001-async-ingestion-with-idempotency.md)).
- **Window check and warm-up:** if Redis comes back empty, one instance rebuilds the rolling windows from PostgreSQL while the others wait ([ADR-004](docs/adr/0004-rolling-windows-in-redis.md)).
- **Re-check:** transactions evaluated while windows were incomplete are re-run through the stateful rules with full history, so no detection is permanently missed ([ADR-004](docs/adr/0004-rolling-windows-in-redis.md)).

Every sensitive action is written to an append-only audit log in the same transaction as the change ([ADR-005](docs/adr/0005-append-only-audit-log.md)).

## Milestones

- [x] **M0:** Monorepo, rules engine core, large-amount and velocity rules, Redis window store
- [x] **M1:** Ingestion API with idempotency keys, BullMQ queue, evaluation worker, alerts
- [x] **M2:** Structuring, rapid in-and-out and new-account rules; case aggregation; GraphQL API for analysts
- [x] **M3:** API key authentication and roles, append-only audit log, rule thresholds in the database, Redis warm-up and re-check jobs, stale-transaction sweeper, GraphQL depth limits
- [x] **M4:** Developer console with use cases and a live rules playground ([ADR-009](docs/adr/0009-browser-playground-runs-the-real-engine.md))
- [ ] **M5:** Analyst dashboard for real cases, on the GraphQL API

## License

Sentinel uses a split license, by layer:

| Part | License | In short |
|---|---|---|
| `packages/*` (the rules engine and adapters) | [MPL-2.0](packages/rules-core/LICENSE) | Use it in any project, including proprietary ones. Changes to the library's own files must be shared. |
| `apps/sentinel` (the service) | [AGPL-3.0-or-later](apps/sentinel/LICENSE) | If you run a modified version as a network service, you must publish your changes. |
