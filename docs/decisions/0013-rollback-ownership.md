# 0013 — Rollback ownership on partial create

Status: DRAFT — not accepted. EB decides.
Date: 2026-08-23
Recommendation added: 2026-08-31

## Context

Marked TBD by the spec: *"Rollback on failure — step 4 fails after the bucket
exists, what cleans up."*

The spec is explicit that this is real, not hypothetical:

- *"Runs seven steps in a fixed order; a failure halfway leaves orphans, so each
  step needs to be reversible."*
- The bucket is created first *"because everything else points at it"* — so the
  first step is also the one guaranteed to have already succeeded whenever
  anything later fails.
- The registry row is written at **B6**, second to last. Without the row *"the
  dashboards will not see it, even if every resource is already standing."*

Those two facts together are the whole problem. Any failure between B1 and B5
leaves real AWS resources with **no registry row pointing at them**, so the
resources exist and the dashboards cannot see them — the orphan case, and it is
the default outcome of any mid-sequence failure, not an edge case.

B4 is the likeliest place to fail: it is the longest step, it creates three
things (KB, Data Source, ingestion job), and the ingestion job is asynchronous,
so it can fail *after* B4 has returned successfully and B5 and B6 have already
run.

Per-app resources are created by runtime SDK calls, not IaC (see 0002), so
nothing rolls them back for free.

The compensating action for each step is tabulated in 0006. What is undecided is
**who runs them, and when**.

## Options considered

1. **Provisioning service unwinds synchronously.** On failure it walks the
   completed steps backwards and deletes. Simple to reason about; fails badly if
   the service itself dies mid-unwind, and cannot handle a late asynchronous
   ingestion failure.
2. **Registry row written first, as a `pending` record.** Inverts the order so
   the row exists before the resources, making every partial state visible in
   the dashboards by construction. Contradicts the spec's stated B6 position and
   changes what "the registry knows which apps exist" means, but it is the only
   option that makes an orphan impossible rather than merely cleanable.
3. **A sweeper**, scheduled, that finds resources with no registry row and
   deletes or reports them. Survives a dead provisioner; needs a reliable way to
   tell an orphan from a resource mid-creation, which means a marker or a tag.
4. **No automatic rollback.** Partial state is surfaced in the Admin Dashboard
   and an operator chooses retry or delete. Slowest to converge, and the least
   likely to delete something it should not have.
5. **Step functions / saga** with explicit compensation per step, owned by the
   orchestrator rather than the service.

## Recommendation

**Option 2 for visibility, option 4 for action: write the registry row first as
`pending`, and let an operator choose what happens to a partial app.** No
automatic unwind, no sweeper, at least not first.

The reasoning is that options 1, 3 and 5 all answer *"how do we clean up an
invisible orphan"*, and option 2 answers *"why is it invisible"*. Only one of
those is the actual defect. The bucket is created first because everything points
at it; the registry row is written second to last; therefore **every**
mid-sequence failure produces resources no dashboard can see. That is not an edge
case to be swept, it is the default outcome, and the cheapest fix is to stop
creating it.

With the row written first, every option's job gets easier: a synchronous unwind
has somewhere to record that it ran, a sweeper has a list to walk instead of a
tag convention to invent, and the Admin Dashboard can show a half-created app
without any new operation — which is also what 0014 needs for polling.

Against automatic rollback, first: deleting AWS resources on a failure path that
has never been exercised is how a bug in the provisioner becomes data loss. An
operator choosing *retry* or *delete* on a visible partial app converges more
slowly and destroys less. A sweeper can be added later, once there is operational
evidence about what actually goes wrong; adding it first means guessing.

The cost, stated plainly: **this contradicts the spec.** The spec puts the
registry row at B6 and says an app becomes real there. Under this recommendation
the row exists before the app is real, so *"the registry knows which apps exist"*
becomes *"the registry knows which apps have been attempted"*. That is a genuine
change in meaning and it is the reason this is EB's call.

**Settle the status vocabulary in the same decision**, because it is a set of
named constants that outlives the milestone and the mock will otherwise invent it:

| state | meaning |
| ----- | ------- |
| `pending` | the row exists, no resource created yet |
| `provisioning` | at least one step has run, none has failed |
| `complete` | every step succeeded |
| `partial` | a step failed after an earlier step created a resource |
| `failed` | the first step failed; nothing exists to clean up |

`partial` and `failed` are worth separating precisely because only one of them has
orphans. Note that a late asynchronous ingestion failure lands on an app that has
already reached `complete`, so `complete` is not final unless ingestion status is
part of it — which couples this to 0014 and to `E9`.

## Decision

Open — DRAFT. Awaiting EB.

## Consequences

Note this is **not fully blocking for Milestone 1**, and should
not be treated as such. The build plan already requires the mock's `createApp`
to model the backend steps as discrete states including partial failure, and
requires the App list to show `complete` / `partial` / `failed`. So the GUI must
render half-created apps regardless of which option is chosen; what this ADR
decides is what actions the GUI *offers* on a partial app (retry, delete,
nothing) and whether a `pending` state exists before any resource is created.

The status vocabulary itself — `complete` / `partial` / `failed`, plus any
`pending` — is a set of named constants that outlives this milestone, so it
should be settled with this ADR rather than invented in the mock.
