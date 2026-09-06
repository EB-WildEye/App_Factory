# 0036 — The factory registry row, whole

Status: **accepted** for the five attributes carried unchanged from 0007; **DRAFT** for
every attribute added since. Per-attribute status is in the table.
Date: 2026-09-06
Supersedes: ADR-0007

## What changed, and what caused the change

0007 decided five attributes and a partition key on 2026-08-23. Since then **nine other
ADRs have made a claim on this row**, and one earlier statement in 0007 has become
false. Amending it nine times is how a decision record ends up contradicting itself —
and 0007 already does, which is the immediate cause of this rewrite.

**0007 contradicts itself today.** It contains `## Reasoning` twice and
`## Consequences` twice, from a botched edit. The first Consequences says the
registry-row type and the App list columns are *"unblocked"*; the second says they
*"stay blocked on the two remaining names"*. Both are in an accepted ADR, and neither
is marked. That is not a hypothetical failure mode of amending, it is the observed one.

**One of 0007's decisions is now wrong**, not merely incomplete:

> *"Because `appName` keys the registry **and names the S3 bucket**, S3 bucket naming
> law is the real constraint on `appName` validation."*

ADR 0025 decided that `appName` is a short identifier the creator types and **the bucket
name is derived** from `appfactory-<appName>-<accountId>`. So `appName` is no longer the
bucket name, S3 naming law is no longer its constraint, and the row needs an attribute
for the derived name. That is a change of answer and it is why this is a supersession
rather than an amendment.

**What each ADR added:**

| ADR | what it put on the row |
| --- | ---------------------- |
| 0007 | the five original attributes, and `app_name` as partition key |
| 0013 | provisioning status |
| 0014 / 0015 | the row is written **first**, so its existence no longer means the app exists |
| 0025 | the derived bucket name, stored not re-derived |
| 0026 | delete generated from real state, so teardown reads the row for what to delete |
| 0029 | validation state, and four fields with it |
| 0030 | the data source id, because the factory now creates one |
| 0031 | two terminal failure states, and the stranded-resource list |
| 0032 | six failure fields, including which step failed |
| 0033 | the vector index, because there is now one per app |
| 0035 | one deliberate **absence** — the precedence flag is on `AppConfig` only |

## Context — what the row is for, and what it is not

The registry is the one table that knows which apps exist. Both dashboards read it.
Without a row an app is invisible even if its resources are standing.

Two things follow, and the second is new since 0007:

1. **The row is an index, not a configuration store.** It holds identifiers and
   lifecycle, so a dashboard can list apps and a teardown can find what to delete. It
   does not hold `AppConfig`. Every attribute below has to justify itself against that
   sentence.
2. **The row is written before the app exists.** 0007 put it at step B6 and said *"the
   app becomes real here"*. 0013 and 0014 moved it to step 1, written with status
   `pending`, precisely so a failed create still leaves a record. So the row's existence
   now means *"a create was attempted"*, not *"an app exists"*. Anything reading the
   table must filter on status; a bare scan lists attempts.

## The row, attribute by attribute

Casing per 0008: `snake_case` as stored, `camelCase` in TypeScript, translated once in
`app/api`. Types are DynamoDB types.

**Status column:** `DECIDED` means an accepted ADR names it. `PROPOSED` means the
attribute is required by a decision but its **name** is not settled — the name below
follows 0007's own conventions (descriptive over terse, `snake_case`) and is queued as
Q45. `BLOCKED` means the attribute itself is not yet decided.

### Key

| attribute | type | status | why it exists | source |
| --------- | ---- | ------ | ------------- | ------ |
| `app_name` | S | **DECIDED** | **Partition key.** The one value unique per app by construction, and the name the creator types. | 0007 |

**`app_name` is permanently immutable, and this is the most expensive line in the ADR.**
A DynamoDB partition key cannot be renamed and has no in-place migration: changing it
means a new table, a copy of every row, and repointing every reader — an outage on the
only record of which apps exist. It is also the input to the derived bucket name (0025),
and an S3 bucket cannot be renamed either. So the create form must say so at the field,
which is checklist `U17`.

What changed here since 0007: `app_name` is **no longer the bucket name**. Its
validation is a slug rule (0025, pattern queued as Q37), not S3 naming law.

### Identity and provenance

| attribute | type | status | why it exists | source |
| --------- | ---- | ------ | ------------- | ------ |
| `ui_id` | S | **DECIDED** | The structural template the app renders. An ordinary attribute — a template name, so not unique per app and not a candidate key. Values are ADR 0023's enum. | 0007, 0023 |
| `created_at` | S, ISO 8601 | **DECIDED** | Answers the first question anyone asks of a partial or failed row: when did this appear. | 0007 |
| `updated_at` | S, ISO 8601 | **PROPOSED** | A row stuck in `provisioning` is only detectable as stuck if you know when it last moved. Q35's sweeper needs this; without it "stuck" is unmeasurable. | this ADR, for Q35 |

### Resource identifiers — what teardown deletes

0026 decides that a delete is generated from real state rather than from a fixed list of
four. That makes this group the teardown's input, and it is why an identifier that is
**re-derived** rather than stored is a hazard: if the derivation rule changes, the delete
path computes a name that does not exist while the real resource stays.

| attribute | type | status | why it exists | source |
| --------- | ---- | ------ | ------------- | ------ |
| `bucket_name` | S | **PROPOSED** | The derived bucket name, **stored, never re-derived at delete time.** | 0025, 0026 |
| `dynamo_table_id` | S | **DECIDED** | The chat-history table. | 0007 |
| `knowledge_base_id` | S | **DECIDED** | The Bedrock knowledge base. | 0007 |
| `data_source_id` | S | **PROPOSED** | The factory now creates a data source (0030), and teardown must `DeleteDataSource` before `DeleteKnowledgeBase`. 0007 predates the factory creating one. | 0030, 0026 |
| `vector_index_name` | S | **PROPOSED** | 0033 gives each app its own S3 Vectors index, deleted at teardown. The vector *bucket* is platform-level and is not per app, so it is not here. | 0033 |
| app address | S | **BLOCKED** | Checklist `G8`. 0012 has not chosen a record type, so there is nothing to store yet. "No address" is a normal state (0012), so its absence is not a defect. | 0012, Q13 |

### Provisioning lifecycle

| attribute | type | status | why it exists | source |
| --------- | ---- | ------ | ------------- | ------ |
| `provisioning_status` | S | **PROPOSED** | The row exists from step 1, so a status is what distinguishes an attempt from an app. | 0013, 0031 |

Values, and the last two are 0031's whole point:

| value | meaning | can retry the same name? |
| ----- | ------- | ------------------------ |
| `pending` | row written, no resource created yet | n/a |
| `provisioning` | at least one step has run, none has failed | n/a |
| `complete` | every step succeeded | n/a |
| `partial` | a step failed after an earlier step created something, and **no rollback has run** | retry or delete both available |
| `failed_rolled_back` | failed, and every resource was removed. Ground clean | **yes** |
| `failed_rollback_incomplete` | failed, and the rollback also failed. Resources are stranded | **no** — refused, with the stranded list as the reason |

`failed` as a bare value does not exist. It conflated two situations with opposite
correct actions, which is what 0031 was written to fix.

**Retry is a conditional write.** `PutItem` with a condition that the existing
`provisioning_status` is `failed_rolled_back` gives idempotent, race-free retry and
rejects a retry over a stranded app for free — the guard is the database's, not the
application's.

### Failure detail — 0032's six fields

Only meaningful when the status is one of the failure values. All six exist because
*"failed"* is not an answer and *"step 4, model unavailable in region"* is.

| attribute | type | status | why it exists | source |
| --------- | ---- | ------ | ------------- | ------ |
| `failed_step` | N | **PROPOSED** | Which step. The number from 0037's settled sequence. | 0032 |
| `failed_step_name` | S | **PROPOSED** | Denormalised for display. A number alone is not an answer to a human. | 0032 |
| `error_code` | S | **PROPOSED** | The internal code the UI switches on and metrics count. Stable forever once shipped. | 0032 |
| `error_detail` | M | **PROPOSED** | The raw provider exception — `service`, `operation`, `exception`, `message`, `request_id`. **Never rendered to a screen**: it carries ARNs, account ids and role names. | 0032 |
| `failed_at` | S, ISO 8601 | **PROPOSED** | | 0032 |
| `retryable` | BOOL | **PROPOSED** | Derived from the code, stored so the UI does not re-derive it and drift. | 0032 |

### Stranded resources — 0031

| attribute | type | status | why it exists | source |
| --------- | ---- | ------ | ------------- | ------ |
| `stranded_resources` | L of M | **PROPOSED** | Present only when the status is `failed_rollback_incomplete`. Each entry: `resource_type`, `identifier`, `delete_error`. | 0031 |

**The payload is the point, not the flag.** A status saying "something is stranded"
without saying what sends an operator to the console to guess. And a stranded bucket
blocks its app name until it is removed, so the list is the difference between a
five-minute fix and an afternoon.

### Validation lifecycle — 0029

Orthogonal to provisioning, and that is the substantive claim: a `complete` app can be
`not_validated`, and a `passed` app can go `partial` after a failed edit. **Two
independent axes on one row**, and the App list has to show both without implying one
means the other.

| attribute | type | status | why it exists | source |
| --------- | ---- | ------ | ------------- | ------ |
| `validation_state` | S | **PROPOSED** | `not_validated` \| `run_in_progress` \| `passed` \| `failed`. `not_validated` is the **normal state of a new app**, shown neutrally, not as an error. | 0029 |
| `question_set_version` | S | **PROPOSED** | Which approved question set the run used. A run that does not cite a version is not evidence. | 0029 |
| `validation_artefact_location` | S | **PROPOSED** | Where the run's output lives. | 0029 |
| `validation_commit_sha` | S | **PROPOSED** | Which code state was validated. Gali's own committee dumps are named by commit; an approval that does not name one refers to nothing. | 0029 |
| `validation_signed_by` | S | **PROPOSED** | Who signed it. | 0029 |

## Deliberate absences

Each of these was considered and left off, and the reason is the same in every case: **a
second copy of a value drifts from the first, and the row is not a configuration store.**

| not on the row | why | source |
| -------------- | --- | ------ |
| the precedence flag | It changes the composed prompt, which is built from `AppConfig`. A copy here could disagree with the config that produced the prompt, invisibly. EB decided: `AppConfig` only. | 0035 |
| the colour scheme | Same argument. The row holds `ui_id` because the Admin list shows which template an app uses; it does not need the palette to list an app. | 0023 |
| `digest_recipient_email` | On `AppConfig`. The digest job reads the config, not the index. | 0028 |
| last digest sent date | 0028 recommends a separate `digest-sends` table keyed on app and date, because the question is *"which dates are unsent"* and a single attribute cannot answer it. | 0028 |
| the five prompt parts, `dataFiles`, `disclaimers` | `AppConfig`. Putting them here would make the row a second config store with no mechanism keeping the two equal. | 0008 |

## Reasoning

**Why one ADR describing the whole row, rather than nine amendments.** The row is a
single artefact with a single schema; a reader who needs to know what is on it should
read one document, not nine and a diff. 0007's duplicated, self-contradicting sections
are what nine amendments actually produce.

**Why per-attribute status instead of one status for the ADR.** Because the row accreted
from nine sources at different maturities, and flattening that would be a lie in one
direction or the other: marking the whole thing DRAFT would un-accept the five
attributes 0007 settled and that code already depends on; marking it accepted would
assert names EB has not approved. The cost is a mixed-status ADR, which is unusual and
slightly awkward to read — and it is the honest shape.

**Why `PROPOSED` names rather than blanks.** A table of blanks cannot be reviewed. The
names follow 0007's own two established conventions — `snake_case` as stored, and
descriptive over terse, which is why 0007 chose `dynamo_table_id` over the spec's
`dynamo_id`. Applying a decided convention is not the same as inventing a name, and
every one is queued in a single table (Q45) so they can be approved or changed in one
pass rather than one at a time.

## Consequences

- **0007 is superseded and keeps its text**, including its duplicated sections, which are
  now evidence rather than a defect to hide.
- **Ten attributes need names approving.** Until Q45 is answered, no code should read or
  write them; the five DECIDED attributes are safe to use.
- **`listApps()` must filter on `provisioning_status`,** because the row is written
  first. A bare scan returns attempts, including failures. 0015's route surface should
  say which statuses it returns by default.
- **`getApp(appName)` is a `GetItem`**, unchanged from 0007 — that was and remains the
  reason `app_name` is the key.
- **The row has grown from 5 attributes to 21.** That is not free: every attribute is a
  thing the mapper in `app/api` must translate and a thing the App list may show. It is
  still one item well under DynamoDB's 400 KB limit, and `stranded_resources` is the only
  attribute with unbounded growth — worth a cap, because a rollback that fails on twenty
  resources should not produce an item that cannot be written.
- **Two independent state axes** mean the App list shows two columns, not one, and the UI
  must not imply that `passed` says anything about whether the resources exist.
- `updated_at` is added by this ADR rather than by an earlier one, and it exists only
  because Q35 needs it. If Q35 concludes no sweeper is wanted, the attribute has no
  second justification and should be dropped rather than kept "in case".
