# 0032 — The provisioning error dictionary

Status: DRAFT — the **shape** is decided by EB (2026-09-01): two fields on the row,
an internal code and the raw provider exception. The dictionary below is drafted and
queued as Q36.
Date: 2026-09-01

## Decided by EB

A failed create stores **two** things on the registry row:

1. **An internal code** — `KB_MODEL_UNAVAILABLE_IN_REGION`, `BUCKET_NAME_TAKEN`,
   `EMAIL_INVALID` and so on. The UI switches on it. It can be counted across
   attempts.
2. **The raw provider exception** — stored for debugging, **never rendered to a
   screen**.

And: the row records **which step failed and why**. *"Step 4, model unavailable in
region"* is an answer. *"Failed"* is not.

## Why two fields and not one

They have different audiences and opposite requirements, and every system that tries
to serve both with one string ends up rendering a stack trace to a user.

| | internal code | raw provider exception |
| - | ------------- | ---------------------- |
| audience | the UI, and metrics | a human debugging at 2am |
| stability | **must never change** — the UI switches on it and counts are compared across months | changes whenever AWS changes a message |
| cardinality | small, closed, reviewable | unbounded |
| rendered? | yes, mapped to Hebrew copy in `lib/uiStrings.ts` | **never** |
| why never rendered | — | it carries ARNs, account ids, role names, internal bucket names and request ids. In a medical setting, shown to a non-technical creator, that is both meaningless and a disclosure |

Two rules follow, and both are the kind of thing that is obvious until someone
violates it:

- **The code is never derived from the provider string at runtime.** No
  `code = exception.__class__.__name__`. A mapping table, reviewed, in one module —
  otherwise an AWS rename silently changes the factory's contract and every
  historical count becomes incomparable.
- **An unmapped provider exception gets a code too.** `PROVIDER_UNMAPPED`, with the
  raw exception stored as always. A create that fails in a way nobody anticipated must
  still produce a countable row — and a rising `PROVIDER_UNMAPPED` count is the signal
  that the dictionary needs an entry.

## The row fields

| field | example | notes |
| ----- | ------- | ----- |
| `failedStep` | `4` | the step number from `docs/provisioning-architecture-comparison.md` §1, including `1b` |
| `failedStepName` | `data source + ingestion` | denormalised for display; the number alone is not an answer to a human |
| `errorCode` | `INGESTION_DENIED_BUCKET_READ` | from the dictionary below |
| `errorDetail` | `{ service, operation, exception, message, requestId }` | the raw exception, structured so it is greppable. Never rendered |
| `failedAt` | ISO 8601 | |
| `retryable` | `false` | derived from the code, stored so the UI does not re-derive it |

`failedStep` and `errorCode` are separate on purpose. The step is *where*, the code is
*why*, and the same code can occur at different steps — `PROVIDER_THROTTLED` at step 3
and at step 5 are the same cause in different places. Encoding the step into the code
name would double the dictionary for no gain.

## Naming rule

So that the next twenty codes are consistent with these:

- **Name the cause, not the symptom.** `INGESTION_DENIED_BUCKET_READ`, not
  `STEP_4_ACCESS_DENIED`.
- **Prefix with the subsystem only when the cause is subsystem-specific.**
  `KB_MODEL_UNAVAILABLE_IN_REGION` earns its prefix because it is about the knowledge
  base's model. `PROVIDER_THROTTLED` does not, because the step field already says
  where.
- `SCREAMING_SNAKE_CASE`. Stable forever once shipped; a code is retired by ceasing to
  emit it, never by renaming it.

## One dictionary, two carriers

EB's examples mix two layers, and the distinction matters:

- `EMAIL_INVALID` is a **validation** failure. It is caught by the zod schema at the
  route handler, and **no registry row is ever written** — the request never became a
  create attempt. It travels in the API error envelope (0015's `{ error, code }`).
- `KB_MODEL_UNAVAILABLE_IN_REGION` is a **provisioning** failure. A row exists, and
  the code lands on it.

**One dictionary, two carriers.** The same code space serves both so the UI has one
switch and metrics have one vocabulary; what differs is whether a row exists to carry
it. Codes that can only ever be validation failures are marked `V` below.

## The dictionary

Provider exception names below are **verified against the botocore service models**
shipped in the Gali venv — the `errors` list declared for each operation — not
recalled. Where a real failure has no modelled exception (S3 `DeleteBucket` declares
none), that is noted.

### Pre-flight — validation, no row written

| code | trigger | retryable |
| ---- | ------- | --------- |
| `APP_NAME_INVALID` `V` | fails the ADR 0025 pattern | no — fix the input |
| `EMAIL_INVALID` `V` | `digestRecipientEmail` fails `z.email()` | no |
| `UI_TEMPLATE_UNKNOWN` `V` | not a member of the ADR 0023 enum | no |
| `COLOUR_SCHEME_INCOMPLETE` `V` | a scheme missing a required variable (ADR 0023) | no |
| `COLOUR_CONTRAST_INSUFFICIENT` `V` | fails the WCAG AA guard (ADR 0023) | no |
| `PROMPT_TOO_LONG` `V` | composed prompt over 4096 (ADR 0016) | no |
| `SCHEMA_INVALID` `V` | any other zod failure | no |

### Step 0 — registry row, `pending`

| code | provider exception | retryable |
| ---- | ------------------ | --------- |
| `APP_NAME_ALREADY_EXISTS` | `ConditionalCheckFailedException` | no — the name is in use, or stranded (0031) |
| `PROVIDER_THROTTLED` | `ProvisionedThroughputExceededException`, `RequestLimitExceeded`, `ThrottlingException` | yes |
| `PROVIDER_SERVICE_ERROR` | `InternalServerError` | yes |

### Step 1 — S3 bucket

| code | provider exception | retryable |
| ---- | ------------------ | --------- |
| `BUCKET_NAME_TAKEN` | `BucketAlreadyExists` | **no, ever** — another account owns the name. See 0031 |
| `BUCKET_ALREADY_OWNED` | `BucketAlreadyOwnedByYou` | no as-is — it means a previous attempt stranded it; remove and retry |
| `BUCKET_NAME_INVALID` | `InvalidBucketName` (not modelled; S3 returns it) | no — a bug in the derivation, not a user error |
| `BUCKET_CREATE_DENIED` | `AccessDenied` (not modelled on `CreateBucket`) | no |
| `BUCKET_CONCURRENT_CREATE` | `OperationAborted` (not modelled) | yes, once |

`CreateBucket` declares **only** `BucketAlreadyExists` and `BucketAlreadyOwnedByYou`
in the model. The other three are real and unmodelled, which is precisely why
`PROVIDER_UNMAPPED` has to exist.

### Step 1b — `kb/` markdown objects

| code | provider exception | retryable |
| ---- | ------------------ | --------- |
| `KB_OBJECT_UPLOAD_FAILED` | `InvalidRequest`, `EncryptionTypeMismatch` | yes |
| `KB_OBJECT_UPLOAD_PARTIAL` | derived — some keys written, some not | yes, idempotently |

### Step 2 — prompt artefact

| code | provider exception | retryable |
| ---- | ------------------ | --------- |
| `PROMPT_ARTEFACT_WRITE_FAILED` | as step 1b | yes |

The pre-flight `PROMPT_TOO_LONG` should make this step's content failures unreachable.
If `PROMPT_TOO_LONG` is ever seen *here* rather than in validation, the create form
and the provisioner are composing differently — which is a bug worth alarming on.

### Step 3 — knowledge base (index, then KB)

| code | provider exception | retryable |
| ---- | ------------------ | --------- |
| `KB_MODEL_UNAVAILABLE_IN_REGION` | `ValidationException` naming the embedding model | no — a region/model decision (0019) |
| `KB_INVALID_CONFIGURATION` | `ValidationException`, any other | no |
| `KB_ROLE_NOT_ASSUMABLE` | `AccessDeniedException` | **yes, briefly** — IAM is eventually consistent and the role may be newly created |
| `KB_NAME_CONFLICT` | `ConflictException` | no |
| `KB_QUOTA_EXCEEDED` | `ServiceQuotaExceededException` | no — a support ticket |
| `VECTOR_INDEX_CONFLICT` | `s3vectors` `ConflictException` | no — likely stranded from a previous attempt |
| `VECTOR_INDEX_QUOTA_EXCEEDED` | `s3vectors` `ServiceQuotaExceededException` | no. **This is the per-bucket index quota nobody has looked up** |
| `VECTOR_INDEX_INVALID` | `s3vectors` `ValidationException` | no |
| `KB_CREATE_FAILED` | status reached `FAILED` | no |
| `KB_CREATE_TIMED_OUT` | never reached `ACTIVE` within the budget | yes |
| `PROVIDER_THROTTLED` | `ThrottlingException`, `TooManyRequestsException` | yes |
| `PROVIDER_SERVICE_ERROR` | `InternalServerException`, `ServiceUnavailableException`, `RequestTimeoutException` | yes |

**`ValidationException` is doing too much work here, and message parsing is how that
gets papered over.** Bedrock returns it for a bad model ARN, a malformed storage
configuration and a bad name alike. Distinguishing `KB_MODEL_UNAVAILABLE_IN_REGION`
from `KB_INVALID_CONFIGURATION` therefore requires inspecting the message string,
which is fragile by construction. Recommended handling: match narrowly and
conservatively — if the message does not clearly name the model, emit
`KB_INVALID_CONFIGURATION`. A wrong specific code is worse than a right vague one,
because the UI acts on it. Queued in Q36.

### Step 4 — data source and ingestion

| code | provider exception | retryable |
| ---- | ------------------ | --------- |
| `DATA_SOURCE_INVALID_CHUNKING` | `ValidationException` — e.g. missing `overlapTokens`, which is **required** | no — a factory bug |
| `DATA_SOURCE_INVALID_CONFIGURATION` | `ValidationException`, other | no |
| `DATA_SOURCE_NOT_FOUND` | `ResourceNotFoundException` | no — the KB id is wrong or the KB is gone |
| `DATA_SOURCE_QUOTA_EXCEEDED` | `ServiceQuotaExceededException` | no |
| `INGESTION_DENIED_BUCKET_READ` | `AccessDeniedException` | no — **the ADR 0021 failure**, the role cannot read the bucket |
| `INGESTION_ALREADY_RUNNING` | `ConflictException` | yes, after waiting |
| `INGESTION_FAILED` | job status `FAILED` | sometimes — depends on why, and the job's own statistics say |
| `INGESTION_STOPPED` | job status `STOPPED` | yes — someone or something stopped it |
| `INGESTION_TIMED_OUT` | never terminal within the budget | yes |

This step is the one that can fail **after steps 5 and 6 have succeeded**, so its
codes have to be settable on a row that already reads `complete`. That is a
requirement on the writer, not on the dictionary, and it is why 0029's separate
validation axis and 0013's provisioning axis both matter.

### Step 5 — chat table

| code | provider exception | retryable |
| ---- | ------------------ | --------- |
| `CHAT_TABLE_ALREADY_EXISTS` | `ResourceInUseException` | no — stranded from a previous attempt |
| `CHAT_TABLE_QUOTA_EXCEEDED` | `LimitExceededException` | no — account table limit |
| `CHAT_TABLE_CREATE_TIMED_OUT` | never reached `ACTIVE` | yes |
| `PROVIDER_SERVICE_ERROR` | `InternalServerError` | yes |

### Step 6 — registry row finalised

| code | provider exception | retryable |
| ---- | ------------------ | --------- |
| `REGISTRY_FINALISE_FAILED` | `ThrottlingException`, `InternalServerError`, `ConditionalCheckFailedException` | yes |

The nastiest state in the whole sequence: every resource exists and the row still says
`provisioning`. A **lying row**, not a missing one. It should be retried hard before
being allowed to fail, because the compensation for it is deleting a perfectly good
app.

### Step 7 — subdomain

| code | provider exception | retryable |
| ---- | ------------------ | --------- |
| `DNS_ZONE_NOT_FOUND` | `NoSuchHostedZone` | no — configuration |
| `DNS_RECORD_CONFLICT` | `InvalidChangeBatch` | no — the record exists |
| `DNS_CHANGE_INVALID` | `InvalidInput` | no |
| `DNS_CHANGE_IN_PROGRESS` | `PriorRequestNotComplete` | yes |
| `CERTIFICATE_NOT_READY` | — | yes. **BLOCKED BY ADR-0012**: this step's shape is not fixed, so its codes are provisional |

### Rollback — the compensating actions

0031 needs these, because a rollback failure has to name what is stranded.

| code | trigger | notes |
| ---- | ------- | ----- |
| `ROLLBACK_BUCKET_NOT_EMPTY` | `DeleteBucket` failed | the most likely stranding, and the one that blocks the app name |
| `ROLLBACK_KB_DELETE_UNSUCCESSFUL` | KB status `DELETE_UNSUCCESSFUL` | a real modelled status |
| `ROLLBACK_DATA_SOURCE_DELETE_UNSUCCESSFUL` | data source status `DELETE_UNSUCCESSFUL` | |
| `ROLLBACK_TABLE_IN_USE` | `DeleteTable` → `ResourceInUseException` | still `CREATING`; retry after `ACTIVE` |
| `ROLLBACK_DENIED` | `AccessDenied` on any compensation | permissions changed mid-flight |
| `PROVIDER_UNMAPPED` | anything unrecognised | must still be countable |

S3's `DeleteBucket` and `DeleteObjects` declare **no** errors in the model, so every
rollback code on the S3 side is derived from behaviour rather than from a modelled
exception. Worth knowing before writing the handler.

## Consequences

- **The registry row grows six fields.** New work for 0007, which is accepted — so an
  amendment, alongside 0031's stranded-resources list and 0029's validation fields.
  0007 is accumulating changes and should be re-read as a whole before any of them
  land.
- **Hebrew copy is needed per code**, in `lib/uiStrings.ts`, and a code with no copy
  must render as a generic message plus the code itself rather than as a blank.
- **The mapping lives in one module** and is unit-testable without AWS: given a
  service, an operation and an exception name, assert the code. That is a pure
  function and it can be written before any provisioning exists.
- **`retryable` drives the UI**, so it is part of the contract, not a hint.
- **Counting requires the code to be stable**, which makes this dictionary an
  append-only artefact once accepted.
- Nothing here is implemented. The codes are a contract, the ADR is a draft, and
  writing the enum before EB accepts the names would be exactly the guess the
  standing rules forbid.
