# 0014 — createApp: 202 async vs synchronous resource ids

Status: DRAFT — not accepted. EB decides.
Date: 2026-08-23
Recommendation added: 2026-08-31

## Context

The two sources describe the create call incompatibly.

The spec, at **F4**, is the only place a route is named, and it is asynchronous:

```
POST /apps → 202 accepted
```

The accompanying text: *"Everything is packed into one JSON and sent. From here
the frontend is out of it — it only waits for the resource ids to come back."*

The build plan states the signature as synchronous:

> `createApp(config: AppConfig)` → created resource ids

`202 Accepted` means the resource ids do not come back in the response. They
cannot: B4 alone is described as *"the longest step"* and ends in an
asynchronous ingestion job, and the KB id is only known after B4. A response
that returns `kb_id` has to have waited for all seven steps, which is not what
`202` means.

So `createApp` cannot both return `202` and return the ids, and this decides
more than a type signature — it decides whether the create flow's final screen
is a result or a progress view, and whether the App list polls.

## Options considered

1. **202 plus a job handle, and the GUI polls.** `createApp` returns something
   like `{ jobId, appName }`; a separate call reports per-step progress; the ids
   arrive when the job completes. Matches the spec. Requires a
   `getProvisioningStatus` operation that the build plan's proposed
   `factoryApi` surface does not contain — the surface has
   `getIngestionStatus(appName, jobId)`, which is about re-embedding one file,
   not about provisioning an app.
2. **202 with no polling; the App list is the progress view.** The registry row
   appears when B6 runs, and until then the app is not visible at all — which is
   exactly the invisible-orphan problem in 0013. Only workable if the registry
   row is written first.
3. **Synchronous, blocking until complete**, returning the ids as the build plan
   states. Simplest client. Means a request held open across the longest step in
   the system, and an API Gateway integration timeout ceiling (29s) that B4 will
   exceed.

Option 1 and the resolution of 0013 are coupled: if a `pending` registry row is
written first, the polling target is the registry row rather than a job handle,
and no new operation is needed.

## Recommendation

**Option 1, with the registry row as the polling target rather than a job handle
— which only works if 0013 is accepted, so decide the two together.**

Option 3 is not really available. API Gateway's integration timeout is 29
seconds and B4 is described as the longest step in the system, ending in an
asynchronous ingestion job. A synchronous `createApp` returning resource ids would
time out on a normal successful create, not on a slow one. The build plan's
signature was written before that constraint was on the table.

Between the two asynchronous options, the difference is whether a second concept
exists. A job handle means a `jobId`, a job store, a `getProvisioningStatus`
operation, and a rule for what happens when the handle is lost — and a lost handle
leaves exactly the invisible half-created app that 0013 is trying to eliminate.
A `pending` registry row is a concept the system already needs, and polling it
needs no new operation beyond `getApp(appName)`, which 0015 already lists as a gap
worth filling for other reasons.

So: `createApp(config)` returns **`202` with `{ appName }`** — nothing that has to
be stored client-side to be recoverable, because `appName` is chosen by the creator
and is already the key to everything. The create form's last screen is a **progress
view** driven by `getApp(appName)`, and it can be closed and reopened without
losing anything.

One consequence worth naming: `complete` is not final. A late ingestion failure
lands after every provisioning step has succeeded, so either `getApp` reports
ingestion state as part of provisioning state, or the App list can show `complete`
for an app whose knowledge base is empty. Recommend the former, and note it makes
`E9` (`getIngestionStatus`) part of the create flow and not only of re-embedding.

## Decision

Open — DRAFT. Awaiting EB. Coupled to 0013 and 0015; deciding this one alone would
leave two of the three inconsistent.

## Consequences

This blocks the return type of `createApp`, the last step of the create
form, and whether the mock's discrete-state model is polled or pushed. It is
tightly coupled to 0013 and 0015 and should be decided together with them.
