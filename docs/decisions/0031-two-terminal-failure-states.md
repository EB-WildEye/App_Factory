# 0031 — Two terminal failure states: rolled back, and rollback incomplete

Status: DRAFT — not accepted. EB decides.
Date: 2026-09-01

Extends 0013's status vocabulary. Depends on nothing being implemented yet.

## Context

0013 proposes `pending`, `provisioning`, `complete`, `partial`, `failed`. That
vocabulary has a hole in it: **`failed` conflates two situations that call for
opposite actions.**

- A create failed and the rollback cleaned up. Nothing exists. The operator should
  fix the input and retry, using the same app name.
- A create failed and **the rollback also failed**. Some resources are still
  standing. The operator must not retry, because the retry will collide with what is
  stranded — and must know exactly what to remove first.

Telling an operator `failed` in the second case invites the retry that cannot work.
Worse, the second case is the one that will not announce itself: a rollback that
throws leaves the same row status as a rollback that succeeded, unless the design
makes the difference explicit.

`docs/provisioning-architecture-comparison.md` §6.2 establishes that rollback failure
is a first-class path in all three orchestration options, not an edge case — and that
in one of them (a CloudFormation stack per app) the *normal* outcome of a failed
rollback is a stack that is stuck until a human strands resources deliberately.

## Decision

**Two distinct terminal states, and `failed` alone is retired as a status.**

### `failed_rolled_back`

Every resource the create made has been removed. Ground clean.

- The **registry row survives**, carrying this status. That is deliberate and it is
  0013's whole point: a failed create must still leave a record, so the row is the
  record and it is not deleted by the rollback.
- **The same app name can be retried.** Retry is a create that overwrites this row,
  permitted by a conditional expression on exactly this status.
- The row keeps the failure fields from 0032 — the step that failed, the internal
  code, the provider exception — so the record of *why* survives the cleanup.

### `failed_rollback_incomplete`

At least one compensating action failed. Resources are stranded.

- **It must never be silent.** The row records this status, and a list: for each
  stranded resource, its type, its identifier, and the error the delete attempt
  returned.
- **Retry with the same app name is refused**, by the factory, with the stranded list
  as the reason. Not "try again later" — "this name has a stranded bucket, remove it
  or choose another name".
- The Admin list shows it differently from every other state. This is the one status
  that means *a human must do something outside the UI*.

The stranded list is the payload, not a flag. A status that says "something is
stranded" without saying what is a status that sends someone to the console to guess.

## Reasoning

### The bucket is why this matters, and the reason needs stating precisely

S3 bucket names are **globally unique across all AWS accounts** and cannot be
renamed. A stranded bucket therefore blocks its name. But there are two cases and they
have different remedies, and collapsing them is how an operator wastes an hour:

| case | what happened | retry behaviour | remedy |
| ---- | ------------- | --------------- | ------ |
| **we own it** | our create made the bucket; our rollback failed to delete it (usually: not empty, or a permissions change mid-flight) | `CreateBucket` returns `BucketAlreadyOwnedByYou` | empty and delete the bucket, then retry the same name. Recoverable, by us |
| **someone else owns it** | the create failed at step 1 because the name was already taken globally | `CreateBucket` returns `BucketAlreadyExists` | **not recoverable at all.** That app name can never be used by this factory |

Only the first case is `failed_rollback_incomplete`. The second is a create that never
got off the ground, so it is `failed_rolled_back` with an internal code of
`BUCKET_NAME_TAKEN` — nothing was created, so nothing is stranded, and the honest
message is "choose a different name" rather than "clean something up".

ADR 0025's derived bucket pattern narrows the second case considerably: a name like
`appfactory-<appName>-<accountId>` is far less likely to be taken by a stranger than a
bare app name, and the account id makes cross-account collision essentially
impossible. It does not eliminate the first case, which is entirely self-inflicted and
is what this ADR is for.

### Why the row survives rather than being deleted

The tempting simplification is: rollback succeeded, so delete the row and leave no
trace. It is wrong for two reasons. The record of a failed attempt is operationally
valuable — 0032 makes failures countable across attempts, which needs the attempts to
exist. And a deleted row means the next create of that name starts with no knowledge
that the previous one failed, so a systematically-failing configuration looks new
every time.

### Why retry is refused rather than warned

A warning that can be clicked through is a warning that will be. The stranded state is
precisely the state where a retry produces a *second* confusing failure on top of the
first, and the second one is harder to read than the first. Refusing costs the
operator one extra step — remove the stranded resource — and that step had to happen
anyway.

## Consequences

- **0013's vocabulary changes.** The full set becomes `pending`, `provisioning`,
  `complete`, `partial`, `failed_rolled_back`, `failed_rollback_incomplete`. `failed`
  as a bare value is gone. 0013 is a draft, so this is a revision to a draft rather
  than an amendment to an accepted decision.
- **`partial` and `failed_rollback_incomplete` must be distinguished in words**,
  because both mean "resources exist that should not". The difference is intent:
  `partial` is a create that stopped and has *not* been rolled back — retry or
  delete are both still available. `failed_rollback_incomplete` is a create that
  tried to clean up and could not. If the design ever rolls back automatically on
  every failure, `partial` becomes unreachable and should be removed rather than left
  as a status nothing sets.
- **The registry row needs a stranded-resources attribute**, which is a list of
  structures rather than a scalar. That is new work for 0007, and 0007 is accepted, so
  it is an amendment.
- **Retry needs a conditional write.** `PutItem` with a condition that the existing
  row's status is `failed_rolled_back` gives idempotent, race-free retry and rejects a
  retry over a stranded app for free.
- **The Admin list gains a state that is not self-service.** Every other status is
  something the UI can act on; this one requires console or CLI work. The UI should
  say so rather than offering a button that cannot help.
- **`deleteApp` on a `failed_rollback_incomplete` app is the natural remedy** and
  should be allowed — it is the same compensation, retried by a human's decision.
  0026 already recommends that delete be generated from real state, which is exactly
  what this needs.
- **Something has to detect the third case: rollback never ran at all.** If the
  orchestrator dies between the failure and the rollback, the row is left in
  `provisioning` forever and neither terminal state is reached. That is not solved by
  this ADR — it needs a timeout or a sweeper, and it is the one hole left. Recorded
  here rather than hidden: see Q35.
