# 0015 — factoryApi route shapes

Status: DRAFT — not accepted. EB decides.
Date: 2026-08-23
Recommendation added: 2026-08-31

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

## Recommendation

**Option 1 — implement the surface, record the paths here as the contract the
backend must satisfy.** That is what ADR 0003 says this milestone is *for*: the
GUI's output is the backend spec. Option 2 waits for a backend that does not
exist to name routes for a frontend that does; option 3 leaves a constants module
full of placeholders, which is option 1 with the decision hidden.

**First, a correction to the table above.** The `reembedFile` row says Bedrock
ingestion jobs run per data source and that per-file re-embedding may not be
achievable. That was true of the mechanism the spec describes and **it is not true
of app #1.** Gali's KB uses a CUSTOM data source and pushes documents with
`IngestKnowledgeBaseDocuments`, a **per-document upsert keyed on document id**
(`docs/gali-ground-truth.md` §5). Per-file re-embedding is achievable. The
constraint was real; the answer arrived by reading Gali.

Proposed paths, all under the BFF so the browser only ever sees these:

| operation | route |
| --------- | ----- |
| `listApps()` | `GET /api/apps` |
| `createApp(config)` | `POST /api/apps` → `202 { appName }` |
| `getApp(appName)` | `GET /api/apps/{appName}` |
| `deleteApp(appName)` | `DELETE /api/apps/{appName}` |
| `listFiles(appName)` | `GET /api/apps/{appName}/files` |
| `readFile(appName, id)` | `GET /api/apps/{appName}/files/{id}` |
| `writeFile(appName, id, body)` | `PUT /api/apps/{appName}/files/{id}` |
| `deleteFile(appName, id)` | `DELETE /api/apps/{appName}/files/{id}` |
| `reembedFile(appName, id)` | `POST /api/apps/{appName}/files/{id}/ingestions` |
| `getIngestionStatus(appName, jobId)` | `GET /api/apps/{appName}/ingestions/{jobId}` |

Four things in that table are recommendations, not conventions:

1. **`getApp` and `deleteFile` are added.** `getApp` because every Data Center
   screen works on one app and 0014's progress view polls it; `deleteFile` because
   nothing currently removes a knowledge file, and a Data Center that can only
   create is a Data Center that accumulates.
2. **The path segment is `{id}`, not `{path}`.** A document id, not an S3 key. The
   backend derives `kb/<id>.md` (0010), so no client-supplied key ever reaches S3
   and the traversal question disappears instead of being validated against.
3. **`reembedFile` POSTs to a collection and returns a job.** Re-embedding creates
   something that can be polled; it is not an update to the file. This is also what
   keeps save and re-embed two distinct actions, which the spec is firm about.
4. **`deleteApp` must not return `void`.** A teardown can partially fail exactly
   like a create can, so it returns the same provisioning-state shape 0013 defines.
   `void` would make partial teardown unreportable by construction.

**The normalised error shape**, which has prior art worth copying. Gali's
`shared/shared/responses.py` returns `{"error": "<message>"}` with
`Content-Type: application/json; charset=utf-8`, through one helper so no handler
can drift. Recommend the same discipline with one field added:

```json
{ "error": "human-readable message", "code": "APP_NAME_TAKEN" }
```

`code` is a stable machine-readable constant; `error` is the message. The UI
switches on `code` and displays `error`. One module builds it, and a handler that
constructs its own error object is a bug — the same rule 0008 applies to the field
mapper, for the same reason.

Not recommended yet, deliberately: pagination for `listApps` (no evidence of scale),
and an etag/concurrency story for `writeFile`. The second one is a real gap — two
editors, last write wins, silently — and it needs its own decision rather than a
guess buried in a route table.

## Decision

Open — DRAFT. Awaiting EB. Route shapes are a `CLAUDE.md` Hard Rule 4
stop-and-ask, so nothing above is implemented until it is accepted.

## Consequences

Whatever is chosen, route paths are named constants in one module, per
`CLAUDE.md`. Also unresolved and needed with this: the normalised error shape
every route handler returns, since *"normalise errors"* is a stated handler
responsibility with no defined format.

Accepting the recommendation unblocks `services/factoryApi.ts` and every route
handler under `app/api`, which is most of Prompt 1. Coupled to 0013 (the state
vocabulary the routes report) and 0014 (what `createApp` returns); all three should
be accepted together or the surface will be internally inconsistent.
