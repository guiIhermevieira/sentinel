# ADR-008: API key authentication and roles

- **Status:** Accepted
- **Date:** 2026-09-22
- **Deciders:** Guilherme Vieira

## Context

Sentinel has machine clients (producers submitting transactions) and people (analysts investigating cases, admins tuning rules). The audit log (ADR-005) needs every action attributed to a specific identity, and sensitive operations, like loosening a rule, must be restricted.

## Decision

### API keys

Every request carries `Authorization: Bearer <key>`. Keys look like `snt_` followed by 32 random bytes (base64url). Only a **SHA-256 hash** is stored, plus the first 12 characters so a key can be identified in listings, so a database leak does not expose working keys. The full key is shown once, at creation, by the CLI (`pnpm --filter @sentinel/app api-key:create <name> <role>`).

SHA-256 without a salt is appropriate here, unlike for passwords: the keys are 256-bit random values, so brute force and precomputed tables are not practical.

### Roles

| Role | Can |
|---|---|
| `producer` | Submit transactions and read their status |
| `analyst` | Query cases, alerts, transactions, audit events and rule configs; review, escalate and dismiss cases |
| `admin` | Everything, including changing rule configs |

### Secure by default

A global guard runs on every REST route and GraphQL operation:

1. Operations marked `@Public()` are allowed (only the health check).
2. Otherwise a valid, unrevoked key is required: `401`, or `UNAUTHENTICATED` in GraphQL.
3. The operation must declare its allowed roles with `@Roles(...)`. **An operation with no roles is denied** (`403` / `FORBIDDEN`), so forgetting to annotate a new endpoint fails closed rather than open.

### Caching and revocation

Verified keys are cached in memory for 30 seconds to avoid a database lookup on every request. Revoking a key clears the cache of the instance that revoked it immediately; other instances stop accepting it within the cache TTL.

## Consequences

### Positive

- Every audited action has an identity.
- A missing annotation can't accidentally expose an operation.
- No external identity provider is needed to run the project.

### Negative

- Revocation takes up to 30 seconds to reach other instances.
- Analysts share the key model with machines. A real deployment would put analysts behind SSO (OIDC), mapping their identity to the same roles; the guard is the only place that would change.
- There is no key rotation workflow yet beyond creating a new key and revoking the old one.

## Alternatives considered

- **JWTs:** stateless, but revocation is hard, and they add a signing-key lifecycle for no benefit at this scale.
- **mTLS for producers:** strong, but heavy to operate for a portfolio project.
- **Bcrypt for key hashes:** designed for low-entropy passwords; unnecessary cost for random keys checked on every request.
