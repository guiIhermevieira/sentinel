# ADR-002: REST for writes, GraphQL for reads

- **Status:** Accepted
- **Date:** 2026-09-22
- **Deciders:** Guilherme Vieira

## Context

Sentinel has two very different kinds of clients:

- **Producers** (payment systems, wallets, gaming platforms) submit transactions. They are machines, send high volumes, retry on failure, and need a small, stable contract.
- **Analysts** (through a dashboard) investigate cases. They need to explore related data: a case, its alerts, each alert's transaction, and the customer's other activity. Their queries vary with the investigation and change as the UI evolves.

## Decision

- **Writes from producers use REST:** `POST /transactions`, with `Idempotency-Key` semantics (ADR-001). REST maps cleanly onto HTTP status codes (`202`, `400`, `422`), idempotency headers, and standard retry behavior in every HTTP client.
- **Reads and analyst actions use GraphQL** at `/graphql`, code-first with `@nestjs/graphql`. The generated `schema.gql` is committed, so schema changes show up in code review.
- **N+1 queries are prevented with per-request DataLoaders.** Nested fields (case → alerts → transaction) are batched into one query per level. Loaders are created per request, so their cache never leaks data between requests.
- **Analyst actions are GraphQL mutations** (`startReview`, `escalateCase`, `dismissCase`), implemented as compare-and-set state transitions (ADR-007).

## Consequences

### Positive

- Each audience gets the interface that suits it: a minimal, retry-safe contract for producers, flexible queries for the dashboard.
- The dashboard can evolve without new endpoints.
- The committed schema doubles as documentation.

### Negative

- Two API styles to maintain, test, and secure.
- GraphQL needs its own protections. M3 added authentication and roles (ADR-008), a query depth limit of 8, and capped page sizes. Query cost analysis is not implemented yet.
- Amounts are exposed as `Float`, because GraphQL `Int` is 32-bit. Values are exact up to 2^53 minor units, far beyond realistic amounts.

## Alternatives considered

- **REST for everything:** simpler, but the dashboard would need many endpoints or over-fetch.
- **GraphQL for everything:** producers would lose plain HTTP semantics for idempotency and status codes, and gain nothing from flexible queries.
