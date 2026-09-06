# 0037 — Provisioning runs on a Lambda orchestrator

Status: DRAFT — the **choice** is decided by EB (2026-09-02): option (b), a Lambda
orchestrator with its state in DynamoDB and a resume mechanism. The design below is
drafted.
Date: 2026-09-06

Answers Q33. Settles the step count and so answers Q34 and Q10.

## The decision, and what it gives up

`docs/provisioning-architecture-comparison.md` recommended Step Functions. **EB chose the
Lambda orchestrator.** This ADR is written for the decision, not for the recommendation —
but the comparison's reasons for preferring Step Functions do not evaporate because the
decision went the other way, so they become this design's requirements list:

| the comparison's argument for Step Functions | what this design must therefore do |
| -------------------------------------------- | ---------------------------------- |
| `RedriveExecution` restarts a failed execution from the failed state | make the resume path a first-class mechanism, not an error handler — §5 |
| most of the workflow is waiting, and `Wait`/`Choice` express it | never block a Lambda on a wait — §2 |
| in-flight state is the artefact you inspect | make the state item complete enough to answer "where is it and why" without logs — §3 |
| a failure inside the rollback is just another catchable state | make the rollback itself stepped and resumable — §5 |
| failure paths are code nobody has exercised | make every failure path unit-testable without AWS — §6 |

What the decision genuinely buys, and it is not nothing: **one language**, no ASL to
review, and an orchestrator that can be run end to end on a laptop — which the
comparison listed as Step Functions' worst weakness. §7 states the losses plainly.

---

## 1. The step list, settled

The spec has B1–B7. Two steps have surfaced since, and one spec step has to split. The
sequence is **eleven steps, S0–S10**. This supersedes the informal "seven steps" wherever
it appears.

| # | step | what it creates | sync? | where it comes from |
| - | ---- | --------------- | ----- | ------------------- |
| **S0** | registry row, `pending` | one DynamoDB item | sync | **new** — 0013 (row first, so a failed create leaves a record) and 0014 (the row is the polling target) |
| **S1** | create the app bucket | S3 bucket | sync | spec **B1** |
| **S2** | upload `kb/` objects × N | S3 objects | sync | spec **B2** — **this is the step the "seven" lost**; it answers Q34 |
| **S3** | write the prompt artefact | one S3 object under `prompt/` | sync | spec **B3**, shape per 0022 |
| **S4** | create the vector index | S3 Vectors index | sync | **new** — 0033. `CreateKnowledgeBase` needs the `indexArn` |
| **S5** | create the knowledge base | Bedrock KB | **async** → `CREATING` | spec **B4**, first half |
| **S6** | create the data source | Bedrock data source, type `S3` | sync | 0030 |
| **S7** | start ingestion, then poll | vectors in the index | **async, the long one** | spec **B4**, second half |
| **S8** | create the chat table | DynamoDB table | **async** → `CREATING` | spec **B5** |
| **S9** | finalise the row → `complete` | — | sync | spec **B6**, repurposed: the row already exists, so this is an update, not an insert |
| **S10** | subdomain | DNS record | **async** | spec **B7**. Shape BLOCKED by 0012 |

**Q34 is answered: the `kb/` upload is a step of its own.** It creates real resources with
their own compensating action, and under 0030 it must complete before ingestion reads the
prefix. A create that fails at S5 therefore strands **objects**, not just a bucket — a
rollback item the seven-step framing lost. ADR 0006's 7-vs-6 question is settled the same
way: the count is eleven, and neither of its candidate answers was right because both
were counting the wrong thing.

Three orderings are forced rather than chosen:

- **S4 before S5** — the KB needs the index ARN (0033).
- **S2 before S7** — an S3 data source ingests what is in the prefix when the job runs
  (0030). Objects written after `StartIngestionJob` are not in that job.
- **S6 after S5** — a data source belongs to a knowledge base.

And one ordering is a deliberate choice: **S8, the chat table, is late.** It could run
any time after S0, and putting it last-but-two means a failure in the expensive,
failure-prone KB work never has to delete it. The chat table is the one resource whose
deletion is destructive in a way no other step's is — it holds patient conversations — so
the fewer failure paths that reach it, the better.

---

## 2. The wait problem: the orchestrator must never wait

Lambda is capped at 15 minutes and billed for every second, including seconds spent
waiting. S5, S7, S8 and S10 are asynchronous, and S7 can take longer than the cap. So a
`while not done: sleep` orchestrator is wrong twice over — it can time out mid-create,
and it pays to do nothing.

**The shape: one invocation does one unit of work.**

```
invoke(appName)
  acquire lease on the row        (conditional write; if held and unexpired, exit)
  read next_step
  do exactly one thing:
      a sync step   -> perform it
      an async step -> start it, or check whether it finished
  record the outcome atomically  (see §3)
  if more work remains -> schedule the next wake
  release lease, return
```

No invocation ever waits for AWS to finish something. A "check whether it finished" is a
single `GetKnowledgeBase` or `GetIngestionJob` call, and if the answer is "still going"
the invocation ends. Billed milliseconds, not minutes.

### What wakes it, and why

**Recommended: an SQS queue with per-message `DelaySeconds`, plus a low-frequency
EventBridge sweeper as a backstop.** The orchestrator enqueues its own next tick.

| mechanism | why not chosen |
| --------- | -------------- |
| **Fixed-rate EventBridge rule that scans for in-flight rows** | Simplest, and it bills continuously whether or not anything is provisioning — the one cost floor the comparison identified for this option. It also scans the whole registry to find work, and it gives every step the same interval, so a 2-second table check and a 10-minute ingestion poll are forced to share a cadence. |
| **Lambda invoking itself asynchronously** | No delay primitive. Either it invokes immediately, which is a hot loop billing continuously, or it sleeps first, which is what §2 exists to avoid. |
| **DynamoDB TTL as a timer** | TTL deletion is not prompt — it can lag by many minutes to hours. Unusable as a scheduler. |
| **EventBridge Scheduler one-shot per wake** | Workable, and it creates and destroys a schedule per tick: N schedules to name, clean up, and reason about when a create fails between creating a schedule and recording it. |
| **SQS with `DelaySeconds`** | **Chosen.** |

Why SQS wins on the specifics of this workflow:

1. **Per-step delay.** `DelaySeconds` is set per message, so S8's table check can wake in
   5 seconds and S7's ingestion poll in 60 — and the interval can back off as a poll
   count rises. A shared rate cannot do that.
2. **Retries are the queue's, not ours.** A handler that throws leaves the message
   unacknowledged; the visibility timeout returns it, and the redrive policy bounds the
   attempts. That recovers part of what §7 lists as lost.
3. **A dead-letter queue makes "this app is stuck" a fact rather than an inference.** It
   is queryable, alarmable, and it names the app.
4. **No floor.** An idle factory costs nothing; there is no rule firing into an empty
   table.
5. **Work is addressed, not searched.** The message carries `appName`, so no scan.

Its two costs, stated: `DelaySeconds` caps at **900 seconds**, so a longer wait is a
re-enqueue — which is wanted anyway, since a re-check is the point. And SQS is
**at-least-once**, so a step may be delivered twice; every step must be idempotent, which
§3's lease and conditional writes provide.

**The EventBridge sweeper is not redundant.** At a low frequency — every few minutes — it
looks for rows whose `updated_at` is older than a threshold and whose status is
`pending` or `provisioning`, and re-enqueues them. That covers a lost SQS message, and
more importantly it covers **the orchestrator dying between the failure and the
rollback** — the hole ADR 0031 records and Q35 asks about. With no sweeper, such a row
sits in `provisioning` forever and no operator is told.

---

## 3. State: one item, and no separate state table

**Recommended: the state lives on the registry row (ADR 0036). There is no separate
provisioning-state table.** A separate table was the first design and it was rejected.

### Why not a separate table

The attraction is clean separation: the registry row is an index for dashboards, the
state table is the orchestrator's private bookkeeping, and 0036 itself says the row is
"an index, not a configuration store".

**Atomicity kills it.** Every step must record two things together — *"step N is done"*
and *"the identifier it produced is X"*. If the counter lives in one item and the
identifier in another, a crash between the two writes leaves them disagreeing, and both
disagreements are bad in different ways: a counter ahead of the identifier means the next
step reads a missing id; an identifier ahead of the counter means the step runs twice.
DynamoDB gives single-item atomicity for free and cross-item atomicity only through
transactions, which cost more and still have to be got right. **One item, one conditional
`UpdateItem` per step, is the only shape where "advance and record" cannot half-happen.**

That argument beats the tidiness argument, so the row grows.

### The attributes the orchestrator adds

On top of 0036's twenty-one. All are **internal** — never rendered, unlike
`provisioning_status`, which the UI polls per 0014.

| attribute | type | why |
| --------- | ---- | --- |
| `next_step` | N | Which of S0–S10 runs next. The resume point. |
| `step_attempts` | M | Step number → attempt count. Bounds per-step retries and feeds the backoff. |
| `poll_count` | M | Step number → checks performed, for backing off an async poll. |
| `lease_owner` | S | The invocation holding the row. Prevents two concurrent workers. |
| `lease_expires_at` | S ISO 8601 | So a dead worker's lease is reclaimable. |
| `rollback_next_step` | N | The resume point **of the rollback**, absent unless rolling back. §5. |
| `rollback_attempts` | M | Per-compensation attempt counts. |

Names are **PROPOSED**, following 0036's conventions, and queued with 0036's ten in Q45.

### The lease, and why a lock is unavoidable here

SQS is at-least-once and a step can be slow, so two invocations for the same app can
overlap. Without a lease, both read `next_step = 4` and both create a vector index — one
of which becomes an orphan nobody records.

The lease is a conditional write: take it if `lease_owner` is absent or
`lease_expires_at` is in the past; otherwise exit without work. It is short — a few times
the longest single AWS call — because its only job is to serialise overlapping
invocations, not to guard a long operation.

This is a hand-rolled lock, and hand-rolled locks are where subtle bugs live. It is on
the list of things §6 requires tests for.

---

## 4. Rollback, written by hand

Each step declares its compensating action. The order is **not** simply the reverse of
creation.

| step | compensating action | constraint |
| ---- | ------------------- | ---------- |
| S10 | delete the DNS record | BLOCKED by 0012 |
| S9 | — | nothing created |
| S8 | `DeleteTable` | must be `ACTIVE` first; `ResourceInUseException` while `CREATING` |
| S7 | `StopIngestionJob` if running | **must happen before S6's compensation** |
| S6 | `DeleteDataSource` | **before** the KB. With `dataDeletionPolicy: DELETE` this removes its vectors |
| S5 | `DeleteKnowledgeBase` | `DELETE_UNSUCCESSFUL` is a real terminal status |
| S4 | `DeleteIndex` | the vector **bucket** is platform-level and must survive |
| S3, S2 | — | covered by S1, and only if S1 empties correctly |
| S1 | empty the bucket, then `DeleteBucket` | see below |
| S0 | **mark, do not delete** | the row is the record; deleting it makes the failure invisible |

Two rules that are not obvious from the table:

**The registry row is never deleted by a rollback.** It is the only thing that makes the
app visible; removing it first turns a failed rollback into an invisible orphan, which is
the exact failure 0013 and 0031 exist to prevent. The rollback's *last* act is to set the
terminal status.

**Empty the whole bucket, not the keys you remember.**

### The prompt-artefact orphan

S3 writes an object under `prompt/`. It appears in **no registry attribute** — the row
holds `bucket_name`, not a list of keys. So a rollback that builds its delete list from
*named resources* deletes the bucket, the KB, the index, the table and the row, and never
mentions the artefact.

It is covered **only** if S1's compensation is "empty the bucket" rather than "delete the
keys S2 recorded". So:

- The bucket compensation is `ListObjectVersions` → `DeleteObjects` in pages → `DeleteBucket`.
- **Versions, not just objects.** Gali's own document bucket has versioning enabled, and
  a versioned bucket with delete markers is not empty. A `DeleteBucket` against it fails
  with `BucketNotEmpty` and the app name stays blocked.
- The general lesson, and it applies beyond this step: **a rollback list derived from the
  registry row is wrong by construction**, because the row records *identifiers* and
  rollback needs *everything created*. Deriving it from the step list — every step knows
  what it made — is what makes S3 unexceptional.

---

## 5. Rollback-of-rollback

This is what Step Functions gave for free. Hand-rolled, it is the following.

**The rollback is itself a stepped, resumable process.** It runs on the same SQS loop,
the same lease, and the same one-unit-of-work-per-invocation rule, with its own counter
`rollback_next_step` counting *down* from the last completed create step.

**A failing compensation does not abort the rollback.** Each compensation gets bounded
retries with backoff via `rollback_attempts`. When one exhausts them:

1. Append `{ resource_type, identifier, delete_error }` to `stranded_resources`.
2. **Continue to the next compensation.** A bucket that will not empty must not prevent
   the chat table from being deleted — stopping on the first failure maximises what is
   left standing, which is exactly backwards.

**The terminal state is decided by the list, not by the last error:**

- `stranded_resources` empty → **`failed_rolled_back`**. Ground clean, the same app name
  can be retried, and retry is a conditional write against that status (0036).
- otherwise → **`failed_rollback_incomplete`**, with the list as the payload.

**What re-runs it, and from where.** Three mechanisms, in increasing order of human
involvement:

1. **SQS redrive.** A handler that throws leaves the message unacknowledged; the queue
   redelivers it and the lease-plus-counter design means it resumes at
   `rollback_next_step`. This is the closest thing to `RedriveExecution` and it is
   automatic.
2. **The sweeper.** A row in `provisioning` or mid-rollback whose `updated_at` has gone
   stale is re-enqueued. This covers the orchestrator dying, which SQS redelivery does
   not, because a message that was acknowledged before the crash is gone.
3. **An operator, via `deleteApp`.** 0026 already decides that delete is generated from
   the app's real state, which makes `deleteApp` on a `failed_rollback_incomplete` app
   *the same compensation, retried by a human's decision*. That is the manual redrive,
   and it needs no new operation.

**What makes an operator aware.** Silence is the failure mode 0031 was written against,
so awareness is three things, not one:

- The row carries the status **and the stranded list**. A status without the list sends
  someone to the console to guess.
- The Admin list renders `failed_rollback_incomplete` distinctly — it is the one state
  that requires action outside the UI.
- Two alarms: messages arriving on the **DLQ**, and a non-zero count of
  `failed_rollback_incomplete` rows. The first says orchestration is broken; the second
  says resources are stranded. They are different problems.

---

## 6. Testing — the part that makes or breaks this option

The comparison's stated cost of a Lambda orchestrator was that **failure paths are code
nobody has exercised.** Answering that is not a testing strategy bolted on afterwards; it
is a constraint on the structure:

> **The orchestrator is a pure reducer plus a thin effects layer.**
> `decide(state, observation) -> { nextState, action }` contains no AWS calls, no clock
> and no randomness. A separate executor performs `action` and reports back.

Without that split none of the following is possible, and the comparison's objection
stands. With it:

**The step machine — no AWS at all.** `decide` is a pure function, so every path is a
table-driven test: for each of S0–S10, assert the action chosen on success, on each
modelled failure, on retry-not-yet-exhausted and on retry-exhausted. Eleven steps times
four cases is a loop over a table, not forty-four hand-written tests.

**The resume path.** Construct a state item at each step and assert `decide` returns
exactly the next action. That is one test per step and it is the whole of "resume works",
because resume *is* reading the state and deciding — there is no other code path.

**Each compensating action.** The executor takes an injected client. A stubbed client
records calls, so each compensation asserts the calls **and their order** — and order is
the thing that matters here: `StopIngestionJob` before `DeleteDataSource`,
`DeleteDataSource` before `DeleteKnowledgeBase`, empty before `DeleteBucket`.

**Every rollback path, cheaply.** A stub that fails the *N*th call, parameterised over N,
generates "create fails at every step" coverage from one test body: eleven creates,
eleven rollbacks, asserted against the expected compensation sequence. The same stub
failing a *compensation* covers §5 — and that is how `failed_rollback_incomplete` and the
stranded list get exercised, which is otherwise the least-tested code in the system.

**Idempotency.** Deliver the same step twice and assert one resource and one identifier.
This is the SQS at-least-once contract, and it is a test rather than a hope.

**The lease.** Two overlapping invocations, one lease: assert exactly one does work.
Then an expired lease: assert the second one takes over. Hand-rolled locks earn their own
tests.

**What tests cannot cover, and must be a real run.** Whether AWS accepts the calls at
all, real durations, IAM propagation, and the prefix-wildcard question in 0034. One
end-to-end run in a scratch account, plus **one deliberately failed run** — a bad
`embeddingModelArn` is the cheapest way to make S5 fail for real — to prove the rollback
works against AWS and not only against a stub.

---

## 7. What is lost, and the mitigation for each

Stated plainly, because the decision was made with the comparison in front of it.

| lost | mitigation | is the mitigation as good? |
| ---- | ---------- | -------------------------- |
| **Execution history in a console.** No graph, no per-state input and output, no `GetExecutionHistory`. | The state item is complete enough to answer "where is it and why" — `next_step`, `step_attempts`, `poll_count`, `failed_step`, `error_code`, `error_detail`. Plus structured logs correlated by `appName` and attempt. | **No.** The state item says where it is now; it does not say how it got there. Recovering the path means reading logs, and you get only what someone logged. This is the real cost of the decision. |
| **A built-in retry policy** with per-error-type backoff. | SQS visibility timeout and redrive policy for delivery failures; `step_attempts` plus an explicit per-step backoff table for AWS errors. 0032's `retryable` flag says which codes are worth retrying. | **Roughly.** The mechanism exists; it is code that has to be written and tested rather than four lines of ASL. |
| **`RedriveExecution`** — restart from the failed state, keeping history. | SQS redelivery resumes from `rollback_next_step` automatically; the sweeper covers a dead orchestrator; `deleteApp` is the manual path. | **Partly.** Resumption is genuinely recovered — durable state is what makes it work. The *history* is not, and there is no `redriveCount`, so "this has been retried nine times" has to be a counter we keep. |
| **`TestState`** — run one state against real AWS with your input. | The pure reducer is better for unit testing than `TestState` is. | **Different, not worse.** Worse for "does AWS accept this shape", better for "is the logic right". The scratch-account run covers the first. |
| **A visual graph for onlookers.** | §1's table is the graph, and the Admin UI can render "step 7 of 11". | **Adequate.** A static list is not a live diagram, but it is reviewable in a diff, which ASL in a console is not. |

And what is gained, since it belongs in the same table honestly: **the whole thing runs
locally.** The comparison called that Step Functions' worst weakness, and it is this
option's best strength — it is also what makes §6's coverage achievable at all.

---

## Consequences

- **Eleven steps, S0–S10**, settled here. Q34 answered (the `kb/` upload is its own
  step), ADR 0006's count question settled, and the informal "seven" retired wherever it
  appears. `docs/provisioning-architecture-comparison.md` §1 and
  `docs/kb-provisioning-recipe.md` should be read against this list, not against their
  own.
- **Seven more attributes on the registry row**, all internal. 0036 grows again; names
  queued with Q45.
- **New platform resources the spec never mentions:** an SQS queue, its DLQ, an
  EventBridge sweeper rule, and two alarms — alongside 0033's shared vector bucket and
  0034's KB role. The factory's platform surface is now six things.
- **The orchestrator's structure is constrained by its tests**, not merely accompanied by
  them: pure reducer plus effects layer, or §6 is not achievable.
- **The sweeper closes Q35's hole** as a side effect of being the SQS backstop.
- **`deleteApp` is load-bearing for recovery**, not only a user action. 0026 should say
  so.
- **BLOCKED:** S10's compensation, pending 0012. Every other step has one.
- **Two costs that will be felt and should not be a surprise:** the failure paths are
  ordinary code and will contain ordinary bugs, which is why §6 is long; and reconstructing
  "what happened" after the fact depends on logs someone chose to write.
