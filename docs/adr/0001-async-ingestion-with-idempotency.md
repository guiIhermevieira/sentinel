# ADR-001: Asynchronous ingestion with a queue and idempotency keys

- **Status:** Accepted
- **Date:** 2026-09-22
- **Deciders:** Guilherme Vieira

## Context

Producers send transactions to Sentinel over HTTP. Rule evaluation can be slow (stateful lookups, many rules) and its load is bursty: traffic spikes are exactly when monitoring matters most. Producers also retry on timeouts and network errors, so the same transaction can arrive more than once.

The ingestion path must:

1. Respond quickly and predictably, independent of rule evaluation cost.
2. Never lose an accepted transaction.
3. Never store or evaluate the same transaction twice, even under concurrent retries.
4. Recover automatically from transient failures during evaluation.

## Decision

### Accept, persist, enqueue, respond

`POST /transactions` validates the payload, persists it to PostgreSQL with status `received`, enqueues an evaluation job in **BullMQ** (Redis), and responds **202 Accepted**. A worker evaluates the transaction, writes alerts, and marks it `evaluated`.

### Idempotency-Key header

Every request must carry an `Idempotency-Key` header. It is stored in a **unique column**, together with a **SHA-256 hash of the canonicalized request body**.

- **New key:** insert, enqueue, return 202.
- **Same key, same body:** return the original transaction with `Idempotent-Replayed: true`.
- **Same key, different body:** reject with 422. This is almost always a client bug, and silently accepting it would hide data loss.

Uniqueness is enforced by the database, not by a read-then-write check, so concurrent retries race safely: exactly one insert wins, and the others fall through to the replay path.

### Exactly-once effects from at-least-once delivery

BullMQ delivers jobs at least once. Every step is made idempotent so the *effects* happen once:

- **Enqueue:** the job ID is the transaction ID, so BullMQ ignores duplicate enqueues.
- **Enqueue repair:** replays re-enqueue if the transaction is still `received`. If a crash happened between the insert and the enqueue, the client's retry repairs it.
- **Windows:** recording in Redis is idempotent by transaction ID (ADR-004).
- **Alerts:** unique on `(transaction_id, rule_id)`, inserted with `ON CONFLICT DO NOTHING`.
- **Status:** alerts and the status update commit in one database transaction; an already `evaluated` transaction is skipped.

Failed jobs retry 5 times with exponential backoff and are kept for inspection afterwards.

## Consequences

### Positive

- Ingestion latency is one insert plus one enqueue, regardless of rule complexity.
- Bursts queue up instead of overloading the database or timing out producers.
- Client retries are always safe.

### Negative

- Results are eventually consistent: a client cannot know a transaction's risk at submission time. Producers that need a synchronous decision (e.g. blocking a withdrawal) would need a separate, synchronous API.
- **The insert and the enqueue are not atomic.** If the process crashes between them and the client never retries, the transaction would stay `received`. A **stale-transaction sweeper** (M3) closes this gap: every minute, it finds transactions still `received` after two minutes and makes sure they get evaluated. Because the job ID equals the transaction ID, it checks the existing job's state first: a missing job is added, a failed job is retried, a completed job (whose effects were somehow lost) is removed and re-added, and a waiting or active job is left alone. A transactional outbox remains the option if stronger guarantees are ever needed.
- Redis becomes a critical dependency for ingestion, not only for stateful rules.

## Alternatives considered

- **Synchronous evaluation in the request:** simplest, but couples producer latency to rule cost and fails exactly under load.
- **Transactional outbox now:** removes the insert/enqueue gap entirely, at the cost of a relay process. Deferred until the sweeper proves insufficient.
- **Kafka instead of BullMQ:** better for very high throughput and replay, but heavy for this scope. BullMQ reuses the Redis we already run for windows.
