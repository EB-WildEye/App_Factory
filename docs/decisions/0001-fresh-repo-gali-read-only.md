# 0001 — Fresh repo, Gali read-only

Status: accepted
Date: 2026-08-23

## Context

App Factory generalises an existing production chatbot, Gali, which lives in two
repos: `Gali-AWS-backend` and `Gali-frontend`. Gali is live and under an
ethics-committee validation freeze. App Factory needs Gali's conventions — RTL
setup, dependency versions, API shapes, the hard-coded KB id / table name /
system prompt that become `AppConfig` — but must not disturb it.

## Options considered

1. **Fork Gali** and generify in place.
2. **Monorepo**: absorb both Gali repos alongside App Factory.
3. **Fresh repo, Gali read-only** as a reference to learn from.

## Decision

Fresh repo at `C:\Users\eb300\Desktop\App_Factory`, remote
`https://github.com/EB-WildEye/App_Factory.git`. Both Gali repos are read-only
reference. Nothing under a Gali path is written, edited, or staged. Gali source
files are not copied wholesale — they are read for shape and convention, and new
code is written here.

## Reasoning

A fork or a monorepo puts a frozen production system inside the blast radius of
every App Factory commit. The freeze makes that unacceptable regardless of care
taken. Reading for shape keeps the benefit — conventions, exact dependency
versions, known-good RTL config — without the coupling: App Factory is one
application generalised, and inheriting Gali's file layout would bake Gali's
specifics into the platform.

## Consequences

- Gali paths are read-only in every task. This is Hard Rule 1 in `CLAUDE.md`.
- Divergence is expected: App Factory may end up with a different file layout.
- Anything App Factory needs from Gali must be re-derived and reported, not
  assumed — dependency versions in particular.
- Gali becomes App #1, provisioned *by* the factory, not the factory itself.
