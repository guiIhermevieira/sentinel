# ADR-003: Rule configuration in the database

- **Status:** Accepted
- **Date:** 2026-09-22
- **Deciders:** Guilherme Vieira

## Context

Rule thresholds change often. Compliance teams tune them as fraud patterns shift, regulators update reporting limits, and false-positive rates drift. Until M3, thresholds were hard-coded in `app.module.ts`, so every change needed a code change, a review, and a deploy, and nothing recorded who changed what.

Changing a threshold is also a sensitive action: loosening a rule can hide money laundering. It must be restricted, validated, and audited.

## Decision

### Storage

Each rule has one row in `rule_configs`: `rule_id`, `enabled`, `config` (JSONB), `version`, `updated_at`, `updated_by`. The M3 migration seeds the previous hard-coded defaults.

### Validation lives in the library

`rules-core` exposes a **rule catalog**: for every built-in rule, its field specification, whether it is stateful, and a factory. `validateRuleConfig()` reports every problem at once (unknown fields, missing fields, wrong types, out-of-range values), and `createRule()` builds a rule from plain JSON. Any consumer of the library gets the same validation, not just this app.

One check depends on the deployment: **no rule window may exceed the window store's retention**. Otherwise a rule would silently see less history than it was configured for. The app passes its retention as `maxWindowMs`.

### Updates

`updateRuleConfig` is a GraphQL mutation restricted to admins (ADR-008). It uses **optimistic concurrency**: the caller sends the `expectedVersion` it edited, and a mismatch returns `VERSION_CONFLICT` with the current version. The row is locked while it is checked, validated, saved and audited in one database transaction, so two admins can never overwrite each other's change unknowingly.

### Applying changes without a restart

The engine reads its rules from a `RuleSource` instead of a fixed array. The app's `RuleRegistry` implements it:

- The instance that made the change reloads immediately.
- Every instance polls a cheap signature (`rule_id:version:enabled`) every 10 seconds and reloads when it changes.
- A stored config that fails validation is skipped and logged; the other rules keep running.

## Consequences

### Positive

- Thresholds are tuned in seconds, by the people responsible for them, with a full audit trail (ADR-005).
- Invalid configurations are rejected before they are saved, with every error reported at once.
- The catalog makes the library usable from configuration alone.

### Negative

- Other instances pick up a change within one polling interval, so for up to ~10 seconds instances may evaluate with different thresholds. Acceptable for tuning; a pub/sub notification could remove the delay.
- Rule *logic* still ships as code. Only parameters are configurable, which is deliberate: arbitrary logic in the database would be far harder to review and test.
- Transactions evaluated before a change are not re-evaluated with the new thresholds.

## Alternatives considered

- **Environment variables:** need a restart and leave no audit trail.
- **A config file in the repo:** reviewable, but every change is a deploy, which is too slow for operational tuning.
- **A rules DSL stored in the database:** maximally flexible, but turns configuration into untested code.
