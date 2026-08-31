# 0017 — Bun test as the test runner

Status: accepted
Date: 2026-08-31

## Context

Prompt 0 step 4 asks for tests and leaves the runner open: *"Bun test (or Vitest,
tell me which you picked and why)"*. Nothing had been picked, so step 4 was
unstarted while step 3 waited on it, and the repo had three gates — typecheck,
lint, build — with no fourth.

The repo already runs on Bun as package manager and runtime (ADR 0004), so the
question is only whether to add a second tool for tests.

## Options considered

1. **Bun test.** Built into the runtime already installed. No dependency, no
   config file. Runs TypeScript directly, resolves the `@/*` paths from
   `tsconfig.json`.
2. **Vitest.** The Vite-ecosystem default, richer watch UI, larger matcher and
   mocking surface, and the runner most React testing guides assume. Costs a
   dependency tree of its own plus a config file.
3. **Node's built-in `node:test`.** No dependency either, but it does not run
   TypeScript without a loader, which puts the cost back.

## Decision

Option 1, **Bun test**. Pre-authorized by EB in the 2026-08-31 handoff: *"Test
runner is Bun test. No new dependency, no extra config."*

- Tests live under `tests/`, mirroring the module they cover.
- `bun test` is wired as `bun run test` and is a gate alongside typecheck, lint
  and build.
- No test config file. `tsconfig.json` already supplies the path aliases.

## Reasoning

Every dependency in this repo is a stop-and-ask and a supply-chain surface, and
the cooldown rule means a security fix in a test runner cannot be taken for three
days. A runner that ships with the runtime removes that surface entirely, and the
milestone's tests are pure-function tests — prompt composition, schema validation,
a field mapper — which need no browser environment, no component rendering and no
mocking framework.

Vitest earns its cost when there are React components to render. There are none
yet. When the Admin Dashboard arrives and component tests are actually needed,
that is the moment to revisit this, and revisiting it is cheap: the test files
would need an import line changed, because the matcher surface used here is the
common subset.

## Consequences

- Four gates now: `bun run typecheck`, `bun run lint`, `bun run build`,
  `bun run test`. All four must pass before a branch closes.
- **`bun:test` has no types without `bun-types`, and no dependency was added, so
  the module is declared locally** in `types/bunTest.d.ts`. It declares only the
  matchers the tests use. Without it `tsc --noEmit` fails on every test file, so
  this file is what keeps the typecheck gate honest about test code rather than
  excluding it.
- The matcher surface is deliberately the common subset of Bun test and Vitest,
  so a later move costs an import rewrite and not a test rewrite.
- No component or DOM testing is possible yet. When it is needed it is a new
  decision, not an extension of this one.
