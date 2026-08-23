# App Factory — working rules

## CONTEXT

This repo is "App Factory": a platform that provisions a complete chat
application (S3 bucket, Bedrock Knowledge Base + Data Source, DynamoDB history
table, subdomain) from a config form filled in by a creator. App #1 will be an
existing production chatbot called Gali.

The architecture is specified in `docs/app-factory-architecture.html`. It is the
source of truth for this project. Read it before answering any structural
question. When that file and your own instinct disagree, the file wins and you
raise the conflict with me.

> Filename note: earlier prompts refer to this spec as `docs/architecture.html`.
> The real path is `docs/app-factory-architecture.html`. There is no
> `docs/architecture.html`.

Gali is split across two separate repos, both available READ-ONLY:

| role     | path                                  |
| -------- | ------------------------------------- |
| backend  | `C:\Users\eb300\Desktop\Gali-AWS-backend` |
| frontend | `C:\Users\eb300\Desktop\Gali-frontend`    |

It is a working production system under an ethics-committee validation freeze.

## HARD RULES

1. Never write to, edit, or stage anything under the Gali paths. Read only.
2. Do not copy Gali source files wholesale into this repo. Read Gali to learn
   shapes and conventions, then write new code here.
3. This milestone is the GUI. No AWS SDK calls, no SAM template, no provisioning
   logic. The backend does not exist yet and we are not pretending it does. We
   are defining the contract it will have to satisfy.
4. When a decision is not determined by the prompt or by
   `docs/app-factory-architecture.html`, STOP and ask. Do not pick a default and
   continue. This applies especially to schema field names, route shapes, and
   anything the architecture marks TBD.
5. Hebrew RTL is the primary layout direction, not an afterthought.
6. Next.js App Router. Server Components by default; mark interactive surfaces
   `"use client"` deliberately, not reflexively.

## STACK (fixed for this milestone)

Next.js (App Router) + React + Bun + TypeScript + Tailwind, RTL Hebrew.
API shape is BFF: the browser talks only to Next route handlers under `app/api`,
which proxy to the SAM API Gateway. IaC is SAM, untouched in this milestone.
Consequences of BFF, which are binding:

- `services/factoryApi.ts` runs client-side and fetches RELATIVE paths only.
- No backend endpoint, key, or credential is ever exposed through a
  `NEXT_PUBLIC_` variable.
- Route handlers are thin proxies: validate with the zod schema, call API
  Gateway, normalize errors. No business logic in a handler.
- `output: 'export'` is impossible. The Next server is a deployment artifact.

## DECISION LOG — required reading

`docs/decisions/` is an ADR log, one file per decision,
`NNNN-short-title.md`, each with Context / Options considered / Decision /
Reasoning / Consequences.

**Read `docs/decisions/` before any structural change** — anything that touches
a schema field, a route shape, a resource name, a module boundary, or the
provisioning step sequence. A decision already recorded there is not reopened
without saying so explicitly.

How to use it:

- **Cheap to reverse** (a component name, a file split, a test helper): decide,
  log it, keep going. Do not stop for these.
- **Expensive to reverse** (schema fields, route shapes, resource naming,
  anything the spec marks TBD): STOP. Write the ADR with `Status: open` and the
  options laid out, then ask me. Never pick a default silently.
- An ADR with `Status: open` blocks the code that depends on it. Build
  everything that does not depend on it, and say what is blocked.

## CODE CONVENTIONS

Binding on every task in this repo.

- **One responsibility per module.** No business logic inside React components —
  hooks and services only. A component renders and wires; it does not decide.
- **Explicit types at every module boundary.** Every export is typed. No `any`,
  no implicit `any`, no `as` used to silence the checker.
- **No magic strings or numbers.** Named constants, and they live in one module.
  This includes Hebrew user-facing strings, route paths, storage keys, and
  status values.
- **Functions short enough to read without scrolling.** Prefer pure functions;
  push side effects to the edges.
- **Names say what a thing is, not how it is implemented.** No `utils`, no
  `helpers`, no `data2`, no type names that leak their container.
- **Delete dead code, never comment it out.** Git remembers. Commented-out code
  is a lie about what the module does.
