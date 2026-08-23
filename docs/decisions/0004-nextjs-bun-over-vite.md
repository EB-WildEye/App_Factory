# 0004 — Next.js + Bun over Vite

Status: accepted
Date: 2026-08-23

## Context

The GUI needs a framework and a package manager / runtime. Gali's frontend is a
React SPA. App Factory's GUI is an internal admin surface that must reach a
backend without exposing credentials to the browser.

## Options considered

1. **Vite + React SPA**, matching Gali's frontend, with npm or pnpm.
2. **Next.js App Router + Bun**, TypeScript, Tailwind.
3. **Next.js + npm/pnpm** — the framework change without the runtime change.

## Decision

Next.js (App Router) + React + Bun + TypeScript + Tailwind. Bun is both package
manager and runtime; scripts are Bun scripts and `bun.lockb` is committed.
Server Components by default, with interactive surfaces marked deliberately.

## Reasoning

The BFF requirement (0005) needs a server that can hold secrets and proxy to API
Gateway. A Vite SPA has no server, so choosing Vite would mean adding a separate
backend process anyway — Next route handlers give the same thing inside one
deployment artefact. App Router's Server-Components-by-default posture also
suits an admin tool that is mostly reads.

Bun over npm for install and test speed on a repo that will grow, and because it
collapses package manager, runtime, and test runner into one tool.

## Consequences

- `bun.lockb` is the lockfile of record. Installs run frozen. Dependency changes
  are a stop-and-ask, in their own commit.
- The install cooldown gate lives in `bunfig.toml`, `[install] minimumReleaseAge`,
  in **seconds**, and needs Bun >= 1.3.0. If the installed Bun is older the
  setting is silently inert; that must be reported, not assumed.
- Divergence from Gali's frontend build is accepted. Conventions are inherited,
  tooling is not.
- Interactive surfaces must be marked individually; a reflexive `"use client"`
  near the root of the tree defeats the choice.
