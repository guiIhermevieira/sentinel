# ADR-004: Rolling windows in Redis, with PostgreSQL as the source of truth

- **Status:** Accepted
- **Date:** 2026-09-21
- **Deciders:** Guilherme Vieira

## Context

Several of Sentinel's AML rules are **stateful**: they can only decide whether a transaction is suspicious by looking at the customer's recent history.

| Rule | History it needs |
|---|---|
| Velocity | Number of transactions in the last *N* minutes |
| Structuring | Amounts of transactions in the last *N* hours, to find clusters just below the reporting threshold |
| Rapid in-and-out | Deposits in the last few minutes, to match against a withdrawal |

Every incoming transaction triggers these lookups, so their cost is paid on the hot path. The design must:

1. Keep per-transaction evaluation fast and predictable as volume grows.
2. Stay correct under concurrency: two transactions from the same customer may be processed at the same time by different workers.
3. Stay correct under retries: queue jobs can run more than once.
4. Handle events that arrive late or out of order.
5. Survive the loss of any cache without losing data.

## Decision

We will keep **per-customer rolling windows in Redis sorted sets**, and treat them as **derived state**. PostgreSQL remains the single source of truth for every transaction.

### Data layout

One sorted set per customer and activity type:

- `sentinel:tx:{customerId}` for all transactions
- `sentinel:dep:{customerId}` for deposits
- `sentinel:wd:{customerId}` for withdrawals

Each entry uses the **transaction timestamp as the score** and **`{transactionId}:{amount}` as the member**.

### Write and read path

For each transaction, the rules worker runs a **single Lua script** that atomically:

1. Adds the entry to the relevant sets (`ZADD`).
2. Removes entries older than the longest configured window (`ZREMRANGEBYSCORE`).
3. Refreshes the key's TTL to the longest window (`EXPIRE`).
4. Returns what the rules need, such as the count (`ZCOUNT`) or the entries (`ZRANGEBYSCORE`) within each window.

### Key properties

- **Atomicity:** Because the whole sequence runs as one Lua script, concurrent transactions from the same customer cannot both read a stale count and slip under a threshold.
- **Idempotency:** The transaction ID is part of the member, so a retried job re-adds an identical member and Redis ignores the duplicate. Retries cannot inflate counts.
- **Event time:** Windows are computed from the transaction's own timestamp (`occurredAt`), not from when it was processed. Out-of-order events land in the correct position.
- **Windows are bounded on both sides:** A rule evaluating a transaction only sees entries between the window start and that transaction's own `occurredAt`. Without the upper bound, transactions processed concurrently could see entries that happened *after* them, and every one of them would be flagged. With it, results are deterministic regardless of processing order. (This was caught by an integration test during scaffolding.)
- **Bounded memory:** Trimming on every write plus a TTL on every key means inactive customers cost nothing, and active ones hold at most one window's worth of entries.

### Rules stay decoupled from Redis

Rules depend on a `WindowStore` interface, not on Redis directly. Production uses `RedisWindowStore` (backed by the Lua scripts). Unit tests use `InMemoryWindowStore`, so rules are tested without infrastructure. Integration tests run against real Redis in Docker Compose.

### Recovery

If Redis comes back empty (restarted without persistence, flushed, or replaced), a **warm-up job** reads transactions from PostgreSQL covering the longest window and replays them into Redis.

While warm-up is running, Sentinel uses **run now, re-check later**:

1. **Run now.** Every incoming transaction is still evaluated by all rules, stateless and stateful, against whatever history exists. Stateful hits are marked `partial_context` so analysts know the history may have been incomplete.
2. **Mark for re-check.** Each transaction evaluated during warm-up is flagged `needs_recheck`.
3. **Re-check later.** When warm-up finishes, a job re-runs the **stateful** rules for every `needs_recheck` transaction, now with full history, adds any alerts that were missed, and clears the flag.

This is safe because re-evaluation is idempotent: window recording deduplicates by transaction ID, and alerts are unique per `(transaction_id, rule_id)`. The re-check can only *add* missed alerts, never duplicate existing ones.

Warm-up state is tracked with a marker key in Redis (`sentinel:windows:ready`). Its absence on startup is what signals that Redis came back empty.

#### Why not the alternatives

- **Degraded mode alone:** transactions evaluated during warm-up would never be re-checked, so real risk could be permanently missed (false negatives). In AML, a missed detection is the costly failure.
- **Pausing stateful rules:** avoids misleading results, but transactions arriving during warm-up would never be checked by those rules at all, which is a worse gap.

This covers Redis coming back **empty**. If Redis is **down**, ingestion itself cannot enqueue (ADR-001), so producers receive errors and retry.

## Consequences

### Positive

- Stateful lookups are in-memory operations on small, per-customer sets, so latency stays low and roughly constant as total volume grows.
- Correctness under concurrency and retries is guaranteed by design, not by luck.
- Losing Redis state costs full context for a short time, never data, and never a permanently missed detection: every transaction is eventually evaluated with complete history.
- The `WindowStore` abstraction keeps rules simple to write and fast to test.

### Negative

- **More moving parts:** Redis becomes a required dependency for stateful rules, and the system now has two stores that must stay consistent.
- **Lua scripts are harder to read and debug** than plain queries. They need their own integration tests.
- **Late-event horizon:** An event older than the longest window arrives after its entries have been trimmed, so stateful rules cannot evaluate it in context. Such events are still stored in PostgreSQL and flagged as `late_event` for review.
- **Window changes need care:** Increasing the longest window only takes full effect after a warm-up, since older entries were already trimmed.

## Alternatives considered

### Query PostgreSQL for every evaluation

Run a query such as "count this customer's transactions since *T*" on each transaction, backed by an index on `(customer_id, occurred_at)`.

- **Pros:** One store, simple to reason about, strongly consistent.
- **Cons:** Every transaction adds several reads to the primary database, and latency grows with load. Concurrency safety would require row locks or serializable transactions, which hurt throughput.
- **Why not chosen:** It works at small scale, but it couples rule evaluation to database load, which is exactly where a monitoring system is under the most pressure.

### Fixed counters (`INCR` per time bucket)

Keep a counter per customer per minute or hour.

- **Pros:** Very cheap in memory and CPU.
- **Cons:** Only supports counts, not amounts, so it cannot power structuring or rapid in-and-out rules. Bucket boundaries also make windows approximate.
- **Why not chosen:** Too limited for the rule set.

### Stream processing (Kafka Streams or Flink)

- **Pros:** The industry-standard answer at very large scale, with built-in windowing.
- **Cons:** Heavy operational footprint, far beyond what this system needs.
- **Why not chosen:** Disproportionate for the scope. Noted as the natural evolution if volume ever outgrows Redis.

## Follow-ups

- Write integration tests for the Lua scripts, including concurrent writes for the same customer.
- ~~Implement the warm-up job, the readiness marker, the `partial_context` and `needs_recheck` flags, and the re-check job.~~ Done in M3. Warm-up takes a Redis lock (`SET NX PX`) so only one instance rebuilds while the others wait for the readiness marker, and the re-check job only runs once windows are ready. A scheduled check re-runs warm-up if the marker disappears while the service is running.
- Add metrics for window-store latency, key count, and warm-up duration.
