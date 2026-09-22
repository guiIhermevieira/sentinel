# ADR-007: One active case per customer, maintained under concurrency

- **Status:** Accepted
- **Date:** 2026-09-22
- **Deciders:** Guilherme Vieira

## Context

Alerts are too granular for analysts: one suspicious customer can produce dozens. Analysts work on **cases**, which group a customer's alerts so they can be reviewed together.

Alerts are created by workers running in parallel, so several alerts for the same customer can be written at the same moment. Analysts also act on cases concurrently. The design must guarantee:

1. A customer never has two active cases.
2. Every alert lands in exactly one case, and the case totals (risk score, alert count) are always exact.
3. Job retries never double-count an alert.
4. Two analysts acting on the same case at the same time cannot both succeed.

## Decision

### Lifecycle

`open → in_review → escalated | dismissed`. A case can also be escalated or dismissed directly from `open`. **Escalated and dismissed are final.** An alert arriving after a case is closed opens a new case, so closed investigations are never silently modified. Dismissing requires a note.

### One active case, enforced by the database

A **partial unique index** allows at most one case per customer in `open` or `in_review`:

```sql
CREATE UNIQUE INDEX uq_cases_one_active_per_customer
  ON cases (customer_id) WHERE status IN ('open', 'in_review');
```

### Attaching alerts

Inside the same database transaction that inserts the alerts:

1. Insert the alerts with `ON CONFLICT DO NOTHING ... RETURNING`. Only alerts that were actually inserted come back, so on a retry nothing is returned and nothing is counted again.
2. `INSERT INTO cases ... ON CONFLICT DO NOTHING` to open a case if none is active. If another transaction is inserting one for the same customer, Postgres makes this one wait for it, then skip.
3. `SELECT ... FOR UPDATE` the active case, which serializes concurrent updates to its totals.
4. Link the alerts and increment the totals.

If the case is closed between steps 2 and 3, the sequence retries once.

### Analyst actions: compare-and-set

Each transition is a single `UPDATE ... WHERE id = $1 AND status = ANY($allowed) RETURNING id`. If no row matches, the case either doesn't exist (`NOT_FOUND`) or is no longer in an allowed state (`INVALID_TRANSITION`). There is no read-then-write window, so of two concurrent actions exactly one wins.

## Consequences

### Positive

- The invariants hold under any interleaving of workers and analysts, and each is covered by a concurrent end-to-end test.
- Case totals can be read directly, with no aggregation at query time.
- No application-level locks or distributed coordination: Postgres does the work.

### Negative

- Alerts for the same customer are serialized on the case row lock. This is fine at realistic per-customer rates, but a single extremely active customer would become a contention point.
- Totals are denormalized. They are only ever changed in the same transaction as the alerts, but a future bug outside this path could make them drift; a periodic reconciliation check would catch it.
- A customer's risk is split across cases over time. Customer-level risk views (planned) will need to aggregate across cases.

## Alternatives considered

- **Application-level check (find, then create):** has a race window where two workers both see no case and both create one.
- **Advisory locks per customer:** works, but moves an invariant the database can enforce declaratively into application code.
- **Computing totals at read time:** always consistent, but makes the most frequent analyst query (cases sorted by risk) expensive.
