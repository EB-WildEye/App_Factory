# App Factory

A platform that provisions a complete chat application from one configuration
form. A creator fills in the form; the factory creates the S3 bucket, the Bedrock
Knowledge Base and Data Source, the DynamoDB chat-history table and the
subdomain, and registers the app so both dashboards can see it.

App #1 is **Gali**, an existing production chatbot for the Women's Health
Department at Wolfson Medical Center. Gali is live, in Hebrew, and under an
ethics-committee validation freeze.

**The definition of done for Milestone 1 is that generic-Gali, given Gali's own
config, reproduces today's Gali.** That is why `lib/gali/constants.ts` and
`docs/gali-ground-truth.md` exist: they hold what production Gali actually is,
copied out of its two repos with file-and-line provenance, so "reproduces" is a
testable claim and not an intention.

`docs/app-factory-architecture.html` is the source of truth for the
architecture. Where it and anything else disagree, it wins and the conflict gets
raised.

## Milestone 1 scope — the GUI

In scope:

- The Admin Dashboard: create an app, edit its data centre, delete it.
- The Data Center: list the markdown knowledge files, edit them, re-embed one
  file at a time.
- `AppConfig` — the JSON contract the create form produces and the provisioning
  backend will have to consume.
- BFF route handlers under `app/api`, and a local mock backend so the GUI runs
  today.

Explicitly **not** in scope: AWS SDK calls, the SAM template, any provisioning
logic. The backend does not exist yet and this milestone does not pretend it
does. What this milestone produces is the contract the backend will have to
satisfy.

Hebrew RTL is the primary layout direction, not an afterthought.

## Getting started

Bun is both the package manager and the runtime (ADR 0004). Bun 1.3.0 or newer is
required — the install cooldown in `bunfig.toml` is silently inert on older
versions.

```bash
bun install --frozen-lockfile   # installs resolve nothing new
bun run dev                     # http://localhost:3000
```

Installs run frozen. If an install wants to add or move a version, that is a
signal to stop rather than something to work around. Adding or bumping any
dependency is a stop-and-ask, in its own commit, and the 3-day release cooldown
in `bunfig.toml` is never lowered.

## The four gates

All four pass before a branch closes and before anything merges to `main`.

```bash
bun run typecheck   # tsc --noEmit, strict
bun run lint        # eslint, with no-explicit-any and no-non-null-assertion as errors
bun run build       # next build
bun run test        # bun test
```

`bun run test` includes a golden test that pins every Gali constant to the digests
recorded in `docs/gali-ground-truth.md`. If it fails, a value that was copied out
of the Gali repos has been edited — that is the point of it.

## A static export is impossible

`output: 'export'` is absent from `next.config.ts` and has to stay absent.

ADR 0005 puts a BFF between the browser and AWS: the browser talks only to Next
route handlers under `app/api`, which hold the API Gateway endpoint and the
credential server-side and proxy the call. No backend endpoint, key or credential
is ever exposed through a `NEXT_PUBLIC_` variable. That makes **the Next server a
real deployment artefact**, so there is no static build of this application — not
one that is merely unused, one that cannot exist.

Two consequences that follow from the same decision: `services/factoryApi.ts`
runs client-side and fetches relative paths only, and route handlers stay thin —
validate with the zod schema, call API Gateway, normalise the error. No business
logic in a handler.

## Layout

| path | what lives there |
| ---- | ---------------- |
| `app/` | App Router pages and layouts. Server Components by default. |
| `app/api/` | BFF route handlers, and the single camelCase ↔ snake_case mapper. |
| `lib/` | Pure modules: prompt composition, the zod schema, UI strings. |
| `lib/gali/` | Constants copied verbatim from production Gali. |
| `types/` | The contract types, `AppConfig` first among them. |
| `tests/` | Bun test, mirroring the module under test. |
| `docs/` | The architecture spec, the checklist, and the Gali ground truth. |
| `docs/decisions/` | The ADR log. Required reading before any structural change. |
| `QUESTIONS.md` | Decisions that are EB's, queued rather than guessed. |

## Reading order for a new contributor

1. `CLAUDE.md` — the working rules, and they are binding.
2. `docs/app-factory-architecture.html` — the source of truth.
3. `docs/decisions/README.md` — the ADR index. An ADR with status `open` or
   `DRAFT` blocks the code that depends on it and nothing else.
4. `docs/gali-ground-truth.md` — what app #1 actually is, and the list of what
   the Gali repos do not say.
5. `QUESTIONS.md` — what is waiting on a human.
