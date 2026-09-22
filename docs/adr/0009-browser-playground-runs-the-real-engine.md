# ADR-009: The developer console's playground runs the real engine in the browser

- **Status:** Accepted
- **Date:** 2026-09-22
- **Deciders:** Guilherme Vieira

## Context

The developer console (`apps/dashboard`) introduces Sentinel through use cases, each with a live example people can edit. The examples need to behave exactly like the product: if the page says a deposit is flagged, the playground has to flag it for the same reason, using the same thresholds.

There are two ways to power it: call a running Sentinel service, or run the rules engine directly in the page.

## Decision

The playground imports `@sentinel-aml/rules-core` and evaluates transactions **in the browser**, with an `InMemoryWindowStore`. Nothing is sent to a server.

- **The same code as production.** Vite aliases the package to its TypeScript source, so the console always runs the engine as it is in the repository, not a copy or a simulation. The rule catalog provides validation, so invalid settings are rejected exactly as the service would reject them.
- **Case grouping mirrors the service.** Alerts are deduplicated per transaction and rule and grouped per customer, reproducing the guarantees of ADR-001 and ADR-007. This part is reimplemented in the console (about 20 lines), since in the service it lives in PostgreSQL.
- **Examples are tested.** Every use case scenario has a test asserting exactly which transactions are flagged, so the docs can't drift from the engine's behavior.
- **Static hosting.** With no backend, the console is deployed to GitHub Pages on every merge to `main`.

## Consequences

### Positive

- Anyone can try Sentinel instantly, with no account, API key, or data leaving their machine.
- Results update on every keystroke, since there is no network round trip.
- It demonstrates the value of a framework-agnostic core (ADR-006): the same engine runs in NestJS, in tests, and in a browser.

### Negative

- The playground doesn't exercise the service's queue, persistence, audit log, or authentication. The "Use the service" page documents those instead.
- The case grouping logic exists twice (the console and the service). The console's scenario tests keep its behavior aligned, but a change to case semantics has to be made in both.
- An analyst dashboard that works on real cases would still need to call the service's GraphQL API. That is a separate, future application.

## Alternatives considered

- **Call a hosted Sentinel instance:** exercises the full system, but needs a public deployment, API keys for visitors, and abuse protection, and adds latency to every edit.
- **Hard-coded example outputs:** simplest, but they would silently go stale as rules change, and visitors couldn't experiment.
