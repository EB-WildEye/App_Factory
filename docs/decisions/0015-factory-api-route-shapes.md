# 0015 — factoryApi route shapes

Status: open
Date: 2026-08-23

## Context

The build plan proposes eight operations for `services/factoryApi.ts` and asks
for them to be checked against the architecture spec before implementing.

Checked. **The spec names exactly one route: `POST /apps → 202`.** Everything
else on the proposed surface is inferred from the spec's prose descriptions of
what the dashboards do, not from any stated route. Route shapes are named in
`CLAUDE.md` Hard Rule 4 as a stop-and-ask.

| proposed | supported by the spec? |
| -------- | ---------------------- |
| `listApps()` | Implied only. *"Both dashboards read from here"* (registry). No route, no pagination story. |
| `createApp(config)` | The one named route, `POST /apps`. But it returns `202`, not ids — see 0014. |
| `deleteApp(appName)` | Implied. The Admin Dashboard *"needs to tear down bucket, KB, table and registry row together"*. No route. Returns `void`, which cannot express a partial teardown failure — the same orphan problem as create, in reverse. |
| `listFiles(appName)` | Implied by the Data Center rendering *"the markdown files stored in the app bucket"*. No route. |
| `readFile(appName, path)` | Implied. No route. `path` is an S3 key fragment arriving from the client — needs traversal constraints defined. |
| `writeFile(appName, path, body)` | Implied by *"edit a file"*. No route. No concurrency story: two editors, last write wins, no etag or version. |
| `reembedFile(appName, path)` | Implied by *"re-embed that file only"*, and the spec is firm that save and re-embed are two distinct user actions. No route. **Bedrock ingestion jobs run per data source, not per file** — whether single-file re-embedding is achievable at all, or is a full re-ingestion the UI presents as per-file, is undetermined and is a real constraint, not a naming question. |
| `getIngestionStatus(appName, jobId)` | Implied by *"show ingestion status including pending"*. No route. Distinct from provisioning status — see 0014. |

Gaps in the proposed surface, beyond naming:

- **No provisioning-status operation.** Required by 0014 option 1, and required
  for the App list to show `complete` / `partial` / `failed` at all.
- **No delete-file operation.** The Data Center creates and edits files; nothing
  removes one. Possibly deliberate, but it is not stated.
- **No `getApp(appName)`.** Every Data Center screen works on a selected app;
  reading one registry row via `listApps()` is a full scan.
- **Monitoring and deploy** (Dev Dashboard) have no operations. Out of Milestone
  1, but they will land on this same module.

## Options considered

1. **Implement the proposed surface as-is**, with route paths chosen by
   convention (`/apps`, `/apps/{appName}`, `/apps/{appName}/files`, …), and
   record those paths here as the contract the backend must satisfy. Fastest;
   makes the GUI the author of the API, which is what 0003 says it is for.
2. **Settle route paths and response shapes first**, then implement. Slower;
   avoids a second rename pass through the route handlers.
3. **Implement against the mock only**, leaving `factoryApi.ts` route paths as a
   single named-constants module to be filled in when the backend is designed.

## Decision

Open. Not resolved here.

## Reasoning

Pending.

## Consequences

Pending. Whatever is chosen, route paths are named constants in one module, per
`CLAUDE.md`. Also unresolved and needed with this: the normalised error shape
every route handler returns, since *"normalise errors"* is a stated handler
responsibility with no defined format.
