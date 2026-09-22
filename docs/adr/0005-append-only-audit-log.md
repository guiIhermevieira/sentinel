# ADR-005: Append-only audit log

- **Status:** Accepted
- **Date:** 2026-09-22
- **Deciders:** Guilherme Vieira

## Context

In AML, being able to prove *who decided what, and when* is a regulatory requirement, not a nice-to-have. Auditors and regulators ask why a case was dismissed, who escalated it, and what the thresholds were at the time. The record must be complete, attributable, and impossible to quietly edit.

## Decision

### What is recorded

| Action | Actor |
|---|---|
| `case.opened` | system |
| `case.review_started`, `case.escalated`, `case.dismissed` | the analyst's API key |
| `rule_config.updated` (with the full before and after) | the admin's API key |
| `transaction.rechecked` (when the re-check adds alerts, ADR-004) | system |
| `api_key.created`, `api_key.revoked` | the creator (or `cli`) |

Each event stores the actor (type, ID and name), action, entity, a `changes` object (for example `status: { from, to }`), and optional metadata.

### Written in the same transaction as the change

An audit event is inserted **inside the same database transaction** as the change it describes. Either both commit or neither does, so there is never a change without its record or a record of a change that didn't happen. A rejected action (such as an invalid case transition) records nothing.

### Append-only, enforced by the database

Triggers reject every `UPDATE`, `DELETE` and `TRUNCATE` on `audit_events`. The guarantee doesn't depend on the application behaving: a bug, a script, or someone at a SQL console gets an error instead of rewriting history.

### Reading it

Analysts query `auditEvents` (filterable by entity) and each case exposes its `auditTrail`, oldest first.

## Consequences

### Positive

- Every sensitive action is attributable to a specific key.
- The audit log and the data it describes can never disagree.
- Tampering through normal database access is blocked.

### Negative

- A database superuser can still disable the triggers. Stronger tamper evidence would need hash-chaining each event to the previous one, or shipping events to write-once storage. Both are noted as future work.
- The table grows forever by design. Partitioning by month would keep it manageable at scale.
- Test databases can't be reset with `TRUNCATE` on this table, so tests use unique IDs instead.

## Alternatives considered

- **Application logs:** easy, but not transactional with the change, and routinely rotated or lost.
- **Writing audit events asynchronously through the queue:** decouples the write, but reintroduces the chance of a change without a record.
- **Temporal tables or CDC:** capture *what* changed, but not *who* or *why*.
