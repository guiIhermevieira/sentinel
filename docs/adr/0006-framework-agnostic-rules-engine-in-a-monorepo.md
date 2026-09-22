# ADR-006: Framework-agnostic rules engine in a monorepo

- **Status:** Accepted
- **Date:** 2026-09-21
- **Deciders:** Guilherme Vieira

## Context

The rules engine (the `Rule` interface, the runner, the built-in AML rules and rolling windows) is useful beyond this service: in a different framework, in a serverless function, or in a batch job over historical data. If it is written inside the NestJS app, it inherits the framework's decorators, dependency injection and infrastructure, and extracting it later means a rewrite.

## Decision

- **A pnpm + Turborepo monorepo from the start**, with the engine and its adapters as separate packages and the service as an app that consumes them:
  - `packages/rules-core`: plain TypeScript, no framework, no infrastructure.
  - `packages/store-redis`: the Redis `WindowStore`, including the Lua script.
  - `packages/nestjs`: a thin module that wires the engine into Nest.
  - `apps/sentinel`: ingestion, cases, GraphQL, audit.
- **Ports and adapters.** Infrastructure enters the core only through interfaces: `WindowStore` for history and `RuleSource` for rules. The core has in-memory implementations for tests.
- **Separate licenses by layer.** The packages are MPL-2.0 so they can be used in any product, while the app is AGPL-3.0-or-later.

## Consequences

### Positive

- The engine is tested in milliseconds, with no Docker, and those tests describe its behavior independently of any framework.
- The app proves the packages work as libraries, because it uses them exactly as an external consumer would.
- Publishing to npm needs versioning and a changelog, not a refactor.

### Negative

- More configuration (workspaces, build order, per-package `tsconfig`) than a single app.
- Changing a package's public API means updating the app in the same change. The monorepo makes that atomic, but it still has to be deliberate.

## Alternatives considered

- **A single NestJS app with clean module boundaries:** simpler at first, but boundaries without enforcement erode, and extraction is costly.
- **Separate repositories:** strongest isolation, but slow to iterate on while the API is still evolving.
