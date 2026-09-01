# Gali production system — read-only investigation

**Date:** 2026-09-01
**Account:** 973938718804 · **Region:** eu-west-1 · **Caller:** `iam::973938718804:user/enbar.gali`
**Scope:** read-only. No file in either Gali repo was created or edited, no AWS resource modified, no ingestion job started, no configuration changed.
**Repos inspected:** `C:\Users\eb300\Desktop\Gali-AWS-backend`, `C:\Users\eb300\Desktop\Gali-frontend`

---

## Headline findings

1. **The premise of this investigation is factually wrong.** There is no second data source. `FDN4IETFFW` does not exist — it was deleted. Only `PPIUPPCKNN` exists. Double-ingestion is therefore not possible and is not happening.
2. **There is zero duplication in the index.** 370 retrieval results across 15 questions plus 7 broad sweeps: every single result carries `data-source-id = PPIUPPCKNN`, and no chunk text appears under more than one document id.
3. **The S3 → sync → KB path is dead three times over,** and the deployed Lambda holds the literal string `REPLACE_ME` as its data source id.
4. **A retired document's content is unrecoverable.** `pregnant_info` (24 chunks) existed in the April data source, is absent from the KB and from `data/`, and the backup file that was supposed to preserve it contains the literal word `True` in place of every chunk body.
5. **`/history` has no authorizer and `/chat` does not validate `session_id` at all** — the two combine into a worse exposure than the repo's own "Known Limitations" describes.
6. **The 4096 prompt limit in the code is not corroborated by AWS.** The API model says 4000. The live template is 4064. Nobody has established the real number.
7. **A live production crash** occurs 5×/90 days at `functions/chat/app.py:201`, before the persistence block, returning 502 and logging nothing about the turn.

---

## TASK 1 — What AWS reports

### Knowledge base

`aws bedrock-agent get-knowledge-base --knowledge-base-id CHAU7BWP4S`

| Field | Value |
|---|---|
| Name | `gali-KB-19-04-26` |
| ARN | `arn:aws:bedrock:eu-west-1:973938718804:knowledge-base/CHAU7BWP4S` |
| Type | `VECTOR` |
| Embedding model | `cohere.embed-multilingual-v3`, `FLOAT32` |
| Storage | `S3_VECTORS` → `arn:aws:s3vectors:eu-west-1:973938718804:bucket/bedrock-knowledge-base-ib3awf/index/bedrock-knowledge-base-default-index` |
| Status | `ACTIVE` |
| Created / updated | `2026-04-19T19:11:51Z` (both — never updated since creation) |

`aws bedrock-agent list-knowledge-bases` returns **exactly one** KB in eu-west-1: `CHAU7BWP4S`.

### Data sources

`aws bedrock-agent list-data-sources --knowledge-base-id CHAU7BWP4S` returns **one** summary:

| dataSourceId | Name | Status | updatedAt |
|---|---|---|---|
| `PPIUPPCKNN` | `md-files-22-06-26` | `AVAILABLE` | `2026-06-28T17:05:33Z` |

`aws bedrock-agent get-data-source --data-source-id PPIUPPCKNN`

| Field | Value |
|---|---|
| Type | **`CUSTOM`** |
| Status | `AVAILABLE` |
| Chunking strategy | `HIERARCHICAL` |
| Level configurations | parent `maxTokens: 500`, child `maxTokens: 150` |
| Overlap | `overlapTokens: 30` |
| Data deletion policy | `DELETE` |
| Created | `2026-06-22T16:36:08Z` |
| Updated | `2026-06-28T17:05:33Z` |

`aws bedrock-agent get-data-source --data-source-id FDN4IETFFW`

```
ResourceNotFoundException: DataSource with id FDN4IETFFW is not found.
```

### Ingestion jobs

| Data source | Result |
|---|---|
| `PPIUPPCKNN` | `{"ingestionJobSummaries": []}` — **empty** |
| `FDN4IETFFW` | `ResourceNotFoundException` |

**The empty list is expected, not a failure.** A `CUSTOM` data source is populated through `IngestKnowledgeBaseDocuments`, a direct per-document upsert API that does not create ingestion-job records. `StartIngestionJob` — the API that produces the records `list-ingestion-jobs` returns — only applies to crawled sources (S3, SharePoint, web, …). So for `PPIUPPCKNN` there will never be an ingestion job to list, regardless of how much content flows through it. Confidence: high (the API contract, plus corroboration below).

### Documents actually in the index

`aws bedrock-agent list-knowledge-base-documents --data-source-id PPIUPPCKNN` — 5 documents, all `INDEXED`:

| Document id | Status | updatedAt |
|---|---|---|
| `induced_abortion` | `INDEXED` | `2026-07-04T11:03:12.132582Z` |
| `disclaimers` | `INDEXED` | `2026-07-04T11:03:12.140794Z` |
| `D&C_D&E` | `INDEXED` | `2026-07-04T11:03:12.148552Z` |
| `missed_abortion` | `INDEXED` | `2026-07-04T11:03:12.155098Z` |
| `partner_std` | `INDEXED` | `2026-07-12T12:27:59.223945Z` |

These 5 correspond exactly 1:1 to the 5 markdown files in `data/`. No orphans in either direction.

### Which is the dead path, and how confident

The question as posed assumes two live doors. There is one. **The dead path is the S3 route, whose data source `FDN4IETFFW` was deleted outright.** I am as close to certain as read-only evidence permits — five independent lines converge:

| # | Evidence | Source |
|---|---|---|
| 1 | `FDN4IETFFW` returns `ResourceNotFoundException` — the resource is gone, not merely idle | `get-data-source`, `list-ingestion-jobs` |
| 2 | It is described in the repo as retired | `backups/FDN4IETFFW_backup_2026-06-25.md:1` — `# FDN4IETFFW (April, retired) — retrieval backup 2026-06-25` |
| 3 | The documents bucket is **empty** — no object was ever left in it | `aws s3 ls s3://gali-documents-gali-backend-test-973938718804/ --recursive` → no output |
| 4 | The sync Lambda has **never been invoked** — its CloudWatch log group does not exist (Lambda creates it on first invocation) | `describe-log-streams --log-group-name /aws/lambda/gali-sync-dev` → `ResourceNotFoundException: The specified log group does not exist` |
| 5 | The deployed sync Lambda's target data source is the placeholder `REPLACE_ME` | `aws lambda get-function-configuration --function-name gali-sync-dev` |

Log groups that *do* exist, for contrast — note the absence of `gali-sync-dev`:

```
/aws/lambda/gali-backup-dev     99,208 bytes
/aws/lambda/gali-chat-dev    8,631,867 bytes
/aws/lambda/gali-history-dev   561,489 bytes
```

**The live path is `ingest_kb.py` → `IngestKnowledgeBaseDocuments` → `PPIUPPCKNN`.** The document `updatedAt` timestamps date it precisely: 4 documents at `2026-07-04T11:03:12` (a single batch, 23 ms apart) and `partner_std` at `2026-07-12T12:27:59`. Those match commits `742852c` (2026-07-04, *"feat(kb): reusable CUSTOM-doc ingest + content-integrity verifier"*) and `141d216` (2026-07-12, *"…add partner-STD KB doc (Q142/Q143)"*).

> **Naming caveat worth flagging:** the data source is named `md-files-22-06-26` and was created 2026-06-22, but the KB is named `gali-KB-19-04-26`. The `CUSTOM` source postdates the KB by two months — consistent with the April S3 source having been the original door and `PPIUPPCKNN` its June replacement.

---

## TASK 2 — Duplication in the index

### Method

The 380-question validation set is in the repo at `validations/ground_truth.csv` (380 rows; columns `qnum, question, rule, expected_behavior, auto_tier, tier, hand_corrected, correction_reason`). I drew a **stratified sample: one question from each `rule` group**, taking the deterministic mid-element of each group. The corpus contains rules 1–13 and 15 (there is no rule 14), giving 14 questions; I added **Q143** (`לבן זוגי שלי יש מחלת מין, מה לעשות?`) to cover the `partner_std` document, which the stratified draw would otherwise have missed. **15 questions total.**

Each was sent through `bedrock-agent-runtime Retrieve` at `numberOfResults=5` — the production top-k (`config.RETRIEVAL_TOP_K`, default `5`). Retrieve only; no generation, no writes.

Duplicate test per question: SHA-256 of whitespace-normalised chunk text for exact matches, plus `difflib.SequenceMatcher` on every pair (`≥0.85` = near-identical, `≥0.60` = partial overlap), plus comparison of `location.customDocumentLocation.id` and full metadata.

### Results

| Q | rule | tier | results | documents returned | verdict |
|---|---|---|---|---|---|
| 348 | 1 | EXPLAIN | 4 | D&C_D&E ×3, missed_abortion | clean |
| 256 | 2 | SOFT | **3** | missed_abortion, induced_abortion ×2 | clean |
| 224 | 3 | CLARIFY_ER | 4 | induced_abortion, missed_abortion, D&C_D&E ×2 | clean |
| 127 | 4 | ER | 4 | induced_abortion ×2, missed_abortion, D&C_D&E | clean |
| 140 | 5 | ER | 4 | missed_abortion, induced_abortion ×3 | clean |
| 231 | 6 | SOFT | 4 | induced_abortion ×3, missed_abortion | clean |
| 279 | 7 | EXPLAIN | 5 | induced_abortion ×3, D&C_D&E, missed_abortion | clean |
| 252 | 8 | SOFT | 5 | induced_abortion ×4, D&C_D&E | clean |
| 14 | 9 | EXPLAIN | 5 | missed_abortion ×3, partner_std, induced_abortion | clean |
| 88 | 10 | ER | 5 | induced_abortion ×2, missed_abortion, D&C_D&E, disclaimers | clean |
| 189 | 11 | EXPLAIN | 5 | missed_abortion ×5 | clean |
| 79 | 12 | SOFT | 5 | missed_abortion, induced_abortion ×3, D&C_D&E | clean |
| 45 | 13 | ER | 5 | induced_abortion ×3, disclaimers, D&C_D&E | **partial overlap** |
| 61 | 15 | ER | 5 | induced_abortion ×2, missed_abortion ×2, D&C_D&E | clean |
| 143 | 5 | ER | **2** | partner_std, missed_abortion | clean |

### The count you asked for

- **Questions returning an identical or near-identical duplicate: 0 of 15.**
- **Questions returning any partial overlap at all: 1 of 15** (Q45).

**What distinguishes the two copies in the single Q45 case:** they are not two copies. Similarity ratio **0.737** — below the near-identical threshold — between result 1 (`induced_abortion`, 1461 chars, SHA `54f237a63e`) and result 4 (`D&C_D&E`, 1491 chars, SHA `837460b411`). Two **different documents** with **different text and different hashes**, sharing clinical boilerplate (aftercare/red-flag phrasing that legitimately appears in both procedure guides). This is content redundancy authored into the corpus, not index duplication. It has no relationship to ingestion paths.

### Corroborating wide sweep

Seven broad Hebrew queries spanning the whole corpus at `numberOfResults=100`:

```
total results returned .............. 370
data-source-ids present ............. {'PPIUPPCKNN': 370}     ← 100%, no other door
distinct chunk hashes ................ 99
identical chunk text under >1 doc id .. 0
per-document result counts ........... induced_abortion 151, missed_abortion 124,
                                       D&C_D&E 87, disclaimers 5, partner_std 3
```

**Every one of 370 results came from `PPIUPPCKNN`.** Not a single result from any other data source — the most direct possible disproof of the two-door hypothesis.

### Why duplication is structurally prevented here

`ingest_kb.py:5-8` states it and the API confirms it: `CUSTOM` ingest is an **upsert keyed on `customDocumentIdentifier.id`**. Re-pushing `induced_abortion` replaces that document rather than adding a second copy. Combined with `dataDeletionPolicy: DELETE` on the data source (so deleting `FDN4IETFFW` removed its vectors with it), there is no mechanism by which the current configuration could produce a doubled document.

### Limits of this finding

The 99 distinct chunks observed is a **floor, not a census**. Retrieval surfaces only what ranks against a query, and Bedrock exposes no API to enumerate the vectors of a `CUSTOM` data source (`kb_verify_reconstruct.py:5-9` documents the same constraint). A duplicate chunk that never ranks in the top 100 for any of my 22 queries would be invisible to this method. Given the upsert semantics and the 100% single-source result, I judge that risk very low — but it is not zero, and no read-only method can close it.

Also worth noting independently of duplication: **Retrieve frequently returns fewer results than the requested top-k** — 2 for Q143, 3 for Q256, 4 for five more questions. Only 7 of 15 questions got the full 5. Whatever the intended retrieval budget, roughly half of production turns are seeing less context than configured.

---

## TASK 3 — Which code path writes through which door

### `scripts/ingest_kb.py` — the live door

| Property | Value |
|---|---|
| Target | `KB_ID = "CHAU7BWP4S"` (line 32), `DATA_SOURCE_ID = "PPIUPPCKNN"` (line 33), `REGION = "eu-west-1"` (line 34) |
| API | `client.ingest_knowledge_base_documents(...)` (line 248) via boto3 |
| Mechanism | `sourceType: IN_LINE`, `inlineContent.textContent.data` = raw markdown; `customDocumentIdentifier.id` = doc id |
| Metadata | `IN_LINE_ATTRIBUTE`, 9-key schema, validated locally before any network call |
| Metadata keys | `doc_type`, `procedure_type`, `gestational_age_max_weeks` (optional), `topic_tags` (1–10 strings), `contains_red_flags`, `contains_emotional_support`, `language` (`he`), `source` (`Wolfson Medical Center`), `version` (`YYYY-MM`) |
| Safety | `--dry-run` mode; `validate()` aborts the whole run on one bad doc |
| Last run | **2026-07-12** for `partner_std`, **2026-07-04** for the other four — from KB document `updatedAt`, matching commits `141d216` and `742852c`. The script itself records no run log. |

All 9 metadata keys were confirmed present on live retrieval results (Task 2 metadata census returned `contains_emotional_support, contains_red_flags, doc_type, gestational_age_max_weeks, language, procedure_type, source, topic_tags, version`, plus Bedrock's own `x-amz-bedrock-kb-data-source-id` and `x-amz-bedrock-kb-source-file-modality`). Ingest metadata and index metadata agree.

> One in-repo caveat already flagged by its author: `ingest_kb.py:118` notes `disclaimers` has `contains_emotional_support=False` in the schema while *"stored value 'true' is the drift"*. And lines 148-152 flag that `partner_std`'s `version="2026-07"` is a **creation** date, with the clinician's **approval** date unconfirmed.

### `scripts/kb_verify_reconstruct.py` — read-only

Same target (`CHAU7BWP4S` / `PPIUPPCKNN`, lines 25-26). Performs **no writes** — only `aws bedrock-agent-runtime retrieve` via `subprocess`, stitching chunks and diffing against `data/`. Its docstring states this explicitly. Writes only to a local `--dump-dir` (default `/tmp/kb_recon`). Last modified 2026-07-12; no run record.

### The sync Lambda — the dead door

`templates/sync.yaml` (merged into `template.yaml`), handler `functions/sync/app.py`:

| Property | Value |
|---|---|
| Trigger | `Type: S3`, `Events: s3:ObjectCreated:*` |
| Bucket | `gali-documents-gali-backend-test-973938718804` |
| Prefix filter | `documents/` |
| Target data source | `config.DATA_SOURCE_ID` ← env var `DATA_SOURCE_ID` ← `!Ref DataSourceId` |
| API called | `bedrock_agent_client.start_ingestion_job(knowledgeBaseId=…, dataSourceId=…)` (`app.py:45`) |
| IAM | `bedrock:StartIngestionJob`, `bedrock:GetIngestionJob` on the KB ARN |
| S3 invoke permission | present — `gali-backend-test-SyncFunctionS3UploadPermission-R1NlKccNURON` |
| **Invocations in last 90 days** | **zero — the log group `/aws/lambda/gali-sync-dev` does not exist at all** |

**Three independent defects stack here:**

**(a) The deployed target is a placeholder.** `aws lambda get-function-configuration --function-name gali-sync-dev`:

```json
"DATA_SOURCE_ID": "REPLACE_ME",
"KNOWLEDGE_BASE_ID": "CHAU7BWP4S",
"DOCUMENTS_BUCKET": "gali-documents-gali-backend-test-973938718804"
```

**(b) The guard does not catch it.** `functions/sync/app.py:25`:

```python
if not config.KNOWLEDGE_BASE_ID or not config.DATA_SOURCE_ID:
```

`"REPLACE_ME"` is a non-empty string, therefore truthy, therefore the guard passes. Execution proceeds to `start_ingestion_job(dataSourceId="REPLACE_ME")`, which throws, is caught by the bare `except Exception` at line 60, and returns **HTTP 500**. The function is designed to degrade gracefully when unconfigured, but only detects the *empty* form of unconfigured, not the *placeholder* form.

**(c) Config drift between the repo and the deployment.** `samconfig.toml:10` still carries the deleted id:

```
parameter_overrides = "... DataSourceId=FDN4IETFFW ..."
```

So `samconfig.toml` says `FDN4IETFFW` (deleted) while the live Lambda says `REPLACE_ME` (placeholder). **Both are wrong, and they are wrong differently.** The cause is visible in `scripts/deploy_*.ps1`: they call `aws lambda update-function-code` and, optionally, `update-function-configuration --layers`. **They never set environment variables.** So the deployed env is a fossil of the last full `sam deploy`, and `samconfig.toml` edits have not reached the running function. `deploy_all.ps1` deploys chat, history, backup and sync via these code-only scripts.

Even if both were corrected, the path would still not work: `start_ingestion_job` is meaningless against a `CUSTOM` data source. **The sync Lambda's entire design targets a crawled S3 source that no longer exists.** It is not one bad value away from working; it is architecturally orphaned.

### The corrupt backup, and lost content

`backups/FDN4IETFFW_backup_2026-06-25.md` was written to preserve the April data source before deletion. It is unusable:

```
# FDN4IETFFW (April, retired) — retrieval backup 2026-06-25
# Captured via vector-store retrieval before document deletion. Best-effort (may not be 100% of chunks).

## DOCUMENT: missed_abortion  (29 chunks)
--- chunk 1 ---
True
--- chunk 2 ---
True
```

**Every one of the 95 chunk bodies is the literal string `True`.** The script that produced it evidently wrote the return value of a truthiness check or a `.write()`/`in` expression where the chunk text belonged. The chunk *counts* and document *names* survived; **no chunk content did.**

Two consequences:

1. It documents a document that no longer exists anywhere: **`pregnant_info` (24 chunks)**. It is not among the 5 documents in the KB, and there is no corresponding file in `data/` (`data/` holds `D&C_D&E.md`, `Disclaimers 210626.md`, `INDUCED ABORTION 210626.md`, `Missed Abortion 210626.md`, `Partner STD.md`, plus `markdown.py`). Whatever clinical content `pregnant_info` held — 24 chunks, comparable in size to `Disclaimers` at 1 chunk and `missed_abortion` at 29 — **is gone, and this backup cannot restore it.**
2. The document-name mapping differs from today's: the April source used `Disclaimers` (capitalised) where the current KB uses `disclaimers`.

The script that generated this file is **not in the repo** — neither `ingest_kb.py` nor `kb_verify_reconstruct.py` produces this format, and both postdate it (2026-07-04) while the backup is 2026-06-25. It was an ad-hoc run, since lost. `ingest_kb.py:11` alludes to it: *"This is the guard that the earlier ad-hoc batch lacked."*

### Everything else that touches the KB

Exhaustive grep for `ingest_knowledge_base_documents`, `start_ingestion_job`, `delete_knowledge_base_documents`, `StartIngestionJob`, `IngestKnowledgeBaseDocuments`, `bedrock-agent` across both repos:

| Site | Operation | Door |
|---|---|---|
| `scripts/ingest_kb.py:248` | `ingest_knowledge_base_documents` | **write** → `PPIUPPCKNN` |
| `functions/sync/app.py:45` | `start_ingestion_job` | **write** → `REPLACE_ME` (dead) |
| `functions/chat/app.py:43` | `bedrock-agent-runtime` client → `retrieve_and_generate` | read |
| `scripts/kb_verify_reconstruct.py:55` | `bedrock-agent-runtime retrieve` | read |
| `templates/sync.yaml:22`, `template.yaml:248` | IAM grant for `StartIngestionJob` | — |

**Nothing in `Gali-frontend` touches Bedrock, the KB, or AWS at all.** Its only network call is `POST {API_BASE}/chat` (`src/services/apiService.ts`). No deletion path for KB documents exists anywhere in either repo.

---

## TASK 4 — Session identity

### The hashing scheme

**There is none.** Exhaustive grep for `hashlib`, `hmac`, `sha256`, `sha1`, `md5`, `hash(` across `shared/` and `functions/` returns **zero matches**. Session identifiers are stored and transmitted in cleartext, used verbatim as the DynamoDB partition key, and echoed back in the `X-Session-ID` response header. Nothing is hashed, signed, salted, or derived at any point.

### Generation

`functions/chat/app.py:201`:

```python
session_id = (body.get("session_id") or str(uuid.uuid4())).strip()
```

The server mints a **UUIDv4** only when the client omits one. The frontend (`src/services/apiService.ts`) never generates an id — it holds `sessionId: string | null = null`, omits the field on the first request, and adopts whatever `/chat` returns:

```ts
const body: Record<string, string> = { message: text };
if (this.sessionId) body.session_id = this.sessionId;
...
if (data.session_id) this.sessionId = data.session_id;
```

Stored **in memory only** — no `localStorage`, no `sessionStorage`, no cookie. It dies on page reload, which is why the frontend never calls `/history` at all.

### How `/history` obtains the id

**Caller-supplied, entirely forgeable.** `functions/history/app.py`:

```python
session_id = event.get("pathParameters", {}).get("session_id", "")
...
try:
    uuid.UUID(session_id)
except ValueError:
    return {"statusCode": 400, ...}
messages = history_store.get_messages(session_id)
```

The id arrives as a URL path segment. The **only** check is that it parses as a UUID — a *format* check, not an authorisation check. There is nothing the caller cannot forge: no signature to verify, no server-side session record to consult, no binding to a cookie, IP, or token. Anyone who can construct a URL can request any session.

### Authorizers

**Neither endpoint has one.**

- `templates/api.yaml`: both `Events` entries (`ChatApi` → `POST /chat`, `HistoryApi` → `GET /history/{session_id}`) declare only `Path` and `Method`. No `Auth` property.
- `template.build.yaml` `Globals.Api`: only `Cors` (`AllowMethods`, `AllowHeaders`, `AllowOrigin`). No `Auth`, no `ApiKeyRequired`.
- Grep for `authoriz|apikey|cognito|jwt` across the templates: the sole hit is the string `Authorization` inside the CORS `AllowHeaders` list — a header the API permits but never reads.

I could **not** verify this against the live API Gateway: `apigateway:GET` is denied to this IAM user (`AccessDeniedException` on `get-rest-apis`). The template evidence is unambiguous, but it is template evidence.

CORS is *not* a control here. It is a browser-enforced convention; `curl`, Postman, or any server-side client ignores it entirely.

### Could an id be guessed or enumerated?

Three separate answers, and the third is the problem.

**A server-minted id: no.** UUIDv4 carries 122 bits of entropy. Not enumerable, not predictable.

**The keyspace as a whole: no.** Brute-forcing `/history/{uuid}` against 2¹²² is infeasible, and the 24-hour DynamoDB TTL means only sessions from the current day exist to be found.

**A client-supplied id: yes, trivially — and this is a real gap.** `/chat` applies **no validation whatsoever** to `session_id`. It is not checked for UUID format, not length-limited, not sanitised (`sanitize_user_input` is applied to `message` only, at line 216). Consequences:

- A client can post `session_id: "00000000-0000-0000-0000-000000000001"`. `/chat` accepts it and writes the turn under that partition key. `/history` then serves it, because it parses cleanly as a UUID. **A malicious or merely careless client can create sessions whose ids are guessable in a handful of attempts.** The 122-bit entropy is a property of the *default*, not a property the system enforces.
- `uuid.UUID()` also accepts non-canonical spellings — no hyphens, `{braces}`, `urn:uuid:` prefixes. Those are *different strings*, so they become *different DynamoDB partition keys* while parsing as the same logical UUID. Not an exposure, but a correctness trap: the same session referenced two ways returns two different histories.
- With no length cap, arbitrary strings become partition keys via `/chat`.

The repo's "Known Limitations" says *"session IDs are client-generated UUIDs. Anyone with a session ID can access history."* That is accurate as far as it goes but **understates the position twice over**: ids are server-generated by default (better than stated), yet the client may override them with anything at all and `/history` will honour it (worse than stated).

Mitigating context, stated fairly: history auto-expires within 24 hours via TTL; PII (Israeli IDs, phone numbers, emails) is scrubbed by `history._remove_pii` *before* the DynamoDB write; and the production frontend never calls `/history`, so there is no first-party traffic pattern to observe or hijack. The exposure is real but bounded, and the contents are partially redacted.

### A live production crash on this exact line

`functions/chat/app.py:201` is also an active fault. CloudWatch, `/aws/lambda/gali-chat-dev`, **5 occurrences in the last 90 days**, most recently ~2026-08-26:

```
[ERROR] AttributeError: 'dict' object has no attribute 'strip'
  File "/var/task/app.py", line 201, in lambda_handler
    session_id = (body.get("session_id") or str(uuid.uuid4())).strip()
```

When a caller sends `session_id` as a JSON **object** rather than a string, `body.get()` returns a `dict` and `.strip()` raises. This happens **before** the `try/except/finally` block that owns persistence (which begins at line 217), so:

- the exception escapes the handler entirely → API Gateway returns **502**, not the handler's own 400/500;
- **nothing is persisted** — the `finally: history_store.save_turn(...)` guarantee never engages;
- the surrounding logs carry no record of what the user asked.

`message` has the identical shape one line earlier (`(body.get("message") or "").strip()`) and the same vulnerability. Whether these 5 events are a probing client or a buggy one, I cannot tell from the logs.

---

## TASK 5 — The prompt budget in production

### The measurement

Measured by importing the live module (`shared/shared/prompt.py`), post-`_REPLACEMENTS` substitution, exactly as the Lambda sees it:

| Quantity | Value |
|---|---|
| `len(RAG_PROMPT_TEMPLATE)` | **4064 characters** |
| UTF-8 byte length | **7003 bytes** |
| Placeholders present | `$search_results$` — exactly one |
| Length with placeholder removed | 4048 characters |
| Limit asserted in code | 4096 (`_BEDROCK_RAG_PROMPT_LIMIT`, `shared/shared/prompt.py:409`) |
| Headroom against that assertion | **32 characters (99.2 % consumed)** |

The template is overwhelmingly Hebrew, so characters and bytes diverge by 1.72×. This matters — see below.

### Does the limit apply to the system prompt alone, or the full request?

**To the prompt template alone, as authored. Retrieved chunks are not counted against it.**

`RAG_PROMPT_TEMPLATE` is passed as `retrieveAndGenerateConfiguration.knowledgeBaseConfiguration.generationConfiguration.promptTemplate.textPromptTemplate` (`functions/chat/app.py:126-128`). Bedrock validates that string on receipt, then substitutes `$search_results$` with the retrieved passages **server-side, after validation**. The interpolated result is never subject to the template's length constraint.

**Empirical proof from this system, which settles it independently of any documentation:** I measured actual retrieved content at production top-k=5 across the 15 Task 2 questions:

```
chunk size .................... min 1149, max 1491, mean 1337 chars
total retrieved per turn ...... min 3795, max 6919 chars
```

The retrieved passages **alone** reach 6919 characters — already 1.7× the entire 4096 figure. If chunks counted toward the template limit, **every single production turn would exceed it and `/chat` would be 100 % broken.** It is not: `/aws/lambda/gali-chat-dev` shows successful `"Chat completed"` events and **zero `ValidationException` in the last 14 days**.

### Where I established the number — and why it is not established

Three sources, and they disagree. This is the finding.

| Source | Says | Nature |
|---|---|---|
| `shared/shared/prompt.py:406-409` | `4096` — *"Bedrock RetrieveAndGenerate hard-caps the prompt template at 4096 chars"* | The repo's own claim. **No citation.** Repeated at `prompt.py:8`, `prompt.py:296-299`, `ARCHITECTURE.md:479`, `functions/chat/app.py:286`, `tests/unit/test_prompt_tone_guard.py:4` — all restating the same uncited assertion. |
| **botocore 1.42.97** service model — `botocore/data/bedrock-agent-runtime/2023-07-26/service-2.json.gz`, shape `TextPromptTemplate` | `{"type": "string", "max": 4000, "min": 1, "sensitive": true}` → **4000** | AWS's own machine-readable API contract, shipped in the SDK the Lambda runs. |
| Production behaviour | 4064 characters is **accepted** | Direct observation, 14 days of clean logs. |

So: **the live template is 4064 characters — 64 characters ABOVE the maximum AWS's own API model declares — and the service accepts it anyway.** Meanwhile the guard in the code sits at 4096, which is 96 above the declared maximum.

Botocore does not enforce string-length constraints client-side, which is why the oversized template reaches the service at all; the service evidently applies a looser limit than its published model. That is the only reading consistent with all three observations.

**The honest conclusion: nobody has established the real limit.** The 4096 in the code is not traceable to any AWS source I could find; the one authoritative machine-readable source says 4000; and the true server-side threshold is somewhere above 4064, unknown. The template therefore has **32 characters of headroom against a number that is very likely wrong** — and the direction of the error is unknown, which is the dangerous part. If the effective limit is character-based and near 4096, the next clinician edit that adds one Hebrew sentence breaks `/chat`. If it were ever byte-based, the template is already at 7003 bytes and would fail outright — it does not, which is useful evidence that the constraint is characters, not bytes, but that inference is mine, not AWS's.

There is a safety net: the `assert` at `prompt.py:410-413` runs **at import time**, so an over-long template fails the Lambda cold-start rather than corrupting answers. But it asserts the *wrong* threshold, so it would not catch a template between 4001 and 4096 characters — precisely the band the current one occupies.

### Worst-case turn, for completeness

The 4096 figure is not the binding constraint on a turn. The actual assembled request:

| Component | Worst case | Source |
|---|---|---|
| Template, placeholder removed | 4048 chars | measured |
| Retrieved chunks at top-k=5 | ~7455 chars (5 × largest observed 1491) | measured; 6919 actually observed |
| **Template + chunks** | **~11,503 chars** | |
| User message | 2000 chars (hard cap, `app.py:205`) | `if len(message) > 2000: return 400` |
| Appended per-turn directives | up to 436 chars | measured below |
| **Query total** | **2436 chars** | |
| **Grand total** | **~13.9 k chars** | ≈ 4–7 k tokens for Hebrew |
| Plus session history | Bedrock-managed, up to `HISTORY_LIMIT=50` messages | not client-visible |

Directive sizes, measured from `functions/chat/app.py` (appended to the **query**, deliberately not to the template — the code comment at line 286 explains this is precisely *because* the template is near its cap):

```
_CLARIFY_ER_DIRECTIVE       287 chars
_CYTOTEC_TRACK_DIRECTIVE    223 chars
_ORANGE_DIRECTIVE           189 chars
_CONTAINMENT_DIRECTIVE      184 chars
_ANTILEAK_DIRECTIVE         122 chars   (every turn)
[SHOW_DEFAULT_DISCLAIMER]    27 chars   (turn 2 only)
```

At most one state directive applies per turn, plus the always-on anti-leak, plus the turn-2 disclaimer → 287 + 122 + 27 = **436 chars** maximum.

Against Claude Sonnet 4.5's 200 k-token context window, ~14 k characters is **under 4 % utilisation**. There is no budget pressure anywhere in the request. The only tight number in this system is the 4064-of-4096 template — and that ceiling is the one nobody has verified.

Separately: `MAX_TOKENS = 4096` (`shared/shared/config.py:34`) is a *third* distinct 4096 in this system, and it is unrelated to both. It is `inferenceConfig.textInferenceConfig.maxTokens` — a cap on **output** tokens. The numerical coincidence between the output cap and the alleged prompt cap is an easy source of confusion and appears to have contributed to it.

---

## TASK 6 — The visual palette

Extracted from every colour-bearing surface in `Gali-frontend`: `tailwind.config.js`, `src/index.css`, all 7 components + `App.tsx`, `index.html`, and all SVG markup.

### Defined tokens

**Sage scale** — the brand anchor. Defined **twice**: `tailwind.config.js` `theme.extend.colors.sage` **and** `src/index.css:9-21` `:root` custom properties. Identical values in both.

| Token | Value | Used for | Uses |
|---|---|---|---|
| `sage-25` | `#f4f7f5` | rail surface gradient terminus | 1 |
| `sage-50` | `#eef5f1` | info-card gradient start; chip/pill backgrounds | 3 |
| `sage-100` | `#e4efe8` | **borders** (pill, bubble-user, composer-shell) **and text** on dark plate | 10 |
| `sage-200` | `#d5e5db` | info-card border, scrollbar thumb, dividers | 4 |
| `sage-300` | `#b9d6cb` | ornament rule colour, pill hover border | 3 |
| `sage-400` | `#94c2b3` | composer focus-within border, scrollbar thumb hover | 2 |
| `sage-500` | `#6ba393` | composer placeholder/hint text | 2 |
| `sage-600` | `#4a8b7a` | eyebrow & ornament label text, focus-visible outline, bubble avatar bg, send-jewel gradient start | 8 |
| `sage-700` | `#3a6b5c` | body/heading text, identity-plate gradient end, send-jewel gradient | 8 |
| `sage-800` | `#2d5a4c` | **primary brand** (so commented) — bot bubble, identity plate, hero mark | 5 |
| `sage-900` | `#244c3f` | headings, bot-bubble gradient end, identity-plate gradient start | 8 |
| `sage-950` | `#1a3d32` | selection text colour, scrim `bg-sage-950/40`; **origin of every shadow tint** | 2 |

**Bone scale** — warm neutral canvas.

| Token | Value | Used for | Uses |
|---|---|---|---|
| `bone-50` | `#faf8f5` | app background, canvas base, composer deck gradient | 5 |
| `bone-100` | `#f4f1eb` | — | **0** |
| `bone-200` | `#e8e2d7` | — | **0** |
| `bone-300` | `#d6cbb8` | — | **0** — and **Tailwind-only**, has no CSS variable |

**Ink scale** — text. **CSS-variable-only; absent from `tailwind.config.js`**, so unusable as a Tailwind class.

| Token | Value | Used for | Uses |
|---|---|---|---|
| `--ink` | `#1f2a26` | `body` colour, `.bubble-user` text | 2 |
| `--ink-soft` | `#4a5a54` | — | **0** |
| `--ink-mute` | `#7d8a83` | — | **0** |

**Literals**

| Value | Used for |
|---|---|
| `#ffffff` | `.rail-surface` gradient start, `.pill-suggest` bg, `.bubble-user` bg, `.composer-shell` bg, `.bubble-bot` **text**; Tailwind `text-white`, `bg-white/60`, `bg-white/40`, `bg-white/70` |
| `rgba(255,255,255, .06–.9)` | inset top-edge highlights throughout (the "carved" effect) |
| `rgba(0,0,0, .12–.2)` | inset bottom-edge shadows on dark surfaces |
| `currentColor` | `.ornament-rule` gradient rule; all `WelcomeHero.tsx` SVG strokes/fills |

**SVG** carries **no hard-coded colour at all** — `WelcomeHero.tsx` uses only `fill="none"`, `stroke="currentColor"`, `fill="currentColor"`, inheriting from Tailwind text classes. Cleanest part of the system.

### Semantic roles

| Role | Tokens |
|---|---|
| **Background (canvas)** | `bone-50` `#faf8f5`; `.canvas-paper` = bone-50 + 1.8 %-alpha sage diagonal etching + 5 %-alpha sage radial wash |
| **Surface / raised** | `#ffffff` (bubbles, pills, composer); `sage-25`→white (rail); `sage-50`→`sage-100` (info card) |
| **Surface / inverted** | `sage-900`→`sage-800`→`sage-700` (identity plate); `sage-800`→`sage-900` (bot bubble); `sage-600`→`sage-800`→`sage-900` (hero mark) |
| **Primary / brand** | `sage-800` `#2d5a4c` — explicitly commented `// primary brand`; also `index.html` `theme-color` |
| **Text / primary** | `--ink` `#1f2a26`; `sage-900`, `sage-800` for headings |
| **Text / secondary** | `sage-700`, `sage-600` |
| **Text / muted** | `sage-500`, `sage-500/70`, `sage-100/80` (on dark) |
| **Text / inverted** | `#ffffff` |
| **Border** | `sage-100` (default), `sage-200` (card), `sage-300` (hover), `sage-400` (focus) |
| **Accent / interactive** | `sage-600`→`sage-900` send-jewel gradient; `sage-600` focus ring |
| **Focus** | `sage-600` outline; `rgba(45,90,76,.12)` and `rgba(45,90,76,.15)` rings |
| **Selection** | bg `rgba(45,90,76,.22)`, text `sage-950` |
| **Shadow** | all tinted `rgba(26,61,50,·)` = sage-950, alpha .03–.5 |
| **Error / danger** | **none — no colour is assigned to this role anywhere** |
| **Warning** | **none** |
| **Success** | **none** |

### Colours in more than one role, or defined in more than one place

This is the part that bears on porting the palette.

**1. Two parallel definition sources for every sage and bone token.** `tailwind.config.js` `colors` and `index.css` `:root` both define the full scales. Values currently agree, but nothing enforces that — they are hand-synchronised. A theming system must pick one as authoritative.

**2. `sage-800` `#2d5a4c` is hard-coded in three forms across three files** rather than referenced from one:
- `index.css:9-21` — as `--sage-800`
- `index.css` — as **`rgba(45, 90, 76, …)`** at 6 sites (`.canvas-paper` ×3, `.rail-surface`, `.composer-shell:focus-within`, `::selection`)
- `tailwind.config.js` — as `rgba(45,90,76,0.15)` in `boxShadow.ring-sage`
- `index.html:7` — as `#2d5a4c` in `<meta name="theme-color">`

**3. `sage-950` `#1a3d32` is hard-coded as `rgba(26, 61, 50, …)` roughly 40 times** across `index.css` and `tailwind.config.js`'s 7 `boxShadow` entries. **It is never once referenced as `var(--sage-950)`.** Every shadow in the system is tinted with a literal restatement of this token. Change the brand hue and all ~40 shadows silently keep the old tint — the single largest porting hazard in this palette.

**4. `#ffffff` spans two roles** — surface (`.bubble-user`, `.pill-suggest`, `.composer-shell` backgrounds) and text (`.bubble-bot` colour, `text-white` in 3 components). A theming system needs these separated: `--surface-raised` and `--text-inverted` will not stay equal in a dark theme.

**5. `sage-100` spans two roles** — border on light surfaces (`.pill-suggest`, `.bubble-user`, `.composer-shell`) and *text* on the dark identity plate (`text-sage-100/80`, `text-sage-100/90`). Same token, opposite ends of the contrast relationship.

**6. `sage-600` spans three roles** — muted accent text (`.label-eyebrow`, `.ornament-rule span`), focus-visible outline, and a filled surface (`bg-sage-600` bubble avatar).

**7. Orphan tokens: 5 defined, never used** — `bone-100`, `bone-200`, `bone-300`, `--ink-soft`, `--ink-mute`. Dead weight to carry forward, or a hint that a fuller neutral ramp was planned.

**8. Asymmetric coverage** — `bone-300` exists only in Tailwind (no CSS var); the entire `ink` family exists only as CSS vars (no Tailwind classes). Neither scale is reachable from both consumption paths.

**9. No semantic layer at all.** Every token is a raw hue-and-step name (`sage-800`), never a role (`--color-primary`). Roles live implicitly in ~60 component class strings. Porting to a themable system means introducing that layer, and the `text-sage-100/80`-style opacity modifiers (12 distinct alpha variants across the components) will not survive a naive token swap.

**10. No error colour, in a clinical triage product.** Gali's core function includes escalating patients to the ER. The `ORANGE` / `ER` / `CLARIFY_ER` states are fully modelled in the backend and carry no visual encoding whatsoever on the frontend — an escalation renders in the same sage as everything else. Flagging it as a palette gap, not a bug: it may well be a deliberate calm-by-design choice for a distressed audience. Worth a decision rather than an inheritance.

---

## Could not determine

| # | Open item | Why | Who or what can answer |
|---|---|---|---|
| 1 | **What `pregnant_info` contained** (24 chunks, in the April source) | The only backup holds `True` in place of every chunk body; the source markdown is not in `data/`; the S3 bucket is empty; `dataDeletionPolicy: DELETE` removed the vectors with the data source | Whoever ran the June 2026 migration; personal/local copies of the April markdown; S3 versioning or a bucket that predates `gali-documents-…` if either exists. **Time-sensitive if any backup has its own retention clock.** |
| 2 | **Whether `pregnant_info`'s content is clinically still required** | Read-only inspection cannot judge coverage | The clinician reviewer. If it covered general pregnancy information, the current 5 documents may have no equivalent. |
| 3 | **The real Bedrock `textPromptTemplate` limit** | Code says 4096 (uncited), botocore says 4000, production accepts 4064. All three cannot be right | AWS Support, or a deliberate binary-search probe against the live API in a throwaway session. Until then, 4096 is an unverified number guarding a 4064-char template. |
| 4 | **Whether `FDN4IETFFW` was deleted deliberately or by accident** | No CloudTrail access from this IAM user | CloudTrail (if retention covers ~June 2026); the operator who performed the migration. |
| 5 | **The exact CloudFormation stack parameter for `DataSourceId`** | `cloudformation:ListStacks` / `DescribeStacks` denied to `user/enbar.gali` | An IAM principal with CloudFormation read. The Lambda env var (`REPLACE_ME`) is the operative value regardless. |
| 6 | **Live confirmation that no API Gateway authorizer exists** | `apigateway:GET` denied | An IAM principal with `apigateway:GET` on `/restapis`. The SAM templates show no `Auth` anywhere, which I consider near-conclusive. |
| 7 | **Whether the S3 → sync path is still wanted at all** | It has never run once, its target is deleted, and `start_ingestion_job` cannot drive a `CUSTOM` source | Product owner. It is not a bug to fix so much as a decision to make. |
| 8 | **Who sent the 5 malformed `session_id` payloads** | Logs capture the traceback, not the request body or source IP | API Gateway access logs, if enabled; CloudTrail; WAF logs. Cannot distinguish a probe from a buggy client. |
| 9 | **Whether the index holds chunks that never rank** | No API enumerates vectors in a `CUSTOM` data source | Direct query of the S3 Vectors index `bedrock-knowledge-base-ib3awf`, if `s3vectors` read access can be granted. My 99-chunk observation is a floor. |
| 10 | **Whether `disclaimers`' stored `contains_emotional_support` is `true` or `false`** | `ingest_kb.py:118` flags known drift between schema (`False`) and stored value (`true`); I did not retrieve a `disclaimers` chunk with that attribute expanded to confirm | A targeted retrieval on `disclaimers`, or a re-run of `ingest_kb.py --dry-run` compared against live metadata. |
| 11 | **`partner_std`'s clinical approval date** | `ingest_kb.py:148-152` flags `version="2026-07"` as a *creation* date, approval date unconfirmed | The authoring clinician. Already tracked as an open item in-repo. |
| 12 | **Whether the frontend palette's missing error colour is intentional** | Design intent is not recoverable from code | Whoever designed the sage system. Bears directly on the theming port. |

### One naming note

Everything in this account is suffixed `-dev`: `gali-chat-dev`, `gali-sessions-dev`, layer `gali-shared-dev:35`, `STAGE=dev`. The API Gateway stage is `Prod` (`…execute-api.eu-west-1.amazonaws.com/Prod`), and `ALLOWED_ORIGINS` is locked to the live Amplify domain. **There is one environment; it is named `dev` and serves patients.** No separate production stack exists in this account or region. Every read above therefore describes the system real patients are using — which is also why nothing in this investigation touched a write.

---

## Recommendations

Proposed only. **Nothing here has been performed.** Ordered by patient-safety and data-loss risk.

### P0 — Data loss, still open

**R1. Hunt for `pregnant_info` before any remaining copy expires.**
Check local machines, S3 versioning on any pre-migration bucket, and personal archives for the April markdown. Then have the clinician decide whether the current 5 documents cover the ground it held. This is the only finding in this report where the window to act may still be closing.
*Do not* treat `backups/FDN4IETFFW_backup_2026-06-25.md` as a fallback — it preserves counts and names only.

**R2. Fix the backup script, or delete the file that pretends to be a backup.**
The generating script is not in the repo, so the bug cannot be fixed where it lives. At minimum, annotate the file as content-free so nobody mistakes it for a recovery option. Any future KB backup should assert non-empty chunk text before writing, and should round-trip at least one chunk.

### P1 — Correctness and safety

**R3. Validate `session_id` on the way in.**
`/chat` should enforce the same `uuid.UUID()` check `/history` already applies, and reject anything else with a 400. That single change closes the guessable-id gap (finding: Task 4) and eliminates the `'dict' has no attribute 'strip'` crash class in one stroke. Consider canonicalising to `str(uuid.UUID(x))` so non-hyphenated and braced spellings map to one partition key.

**R4. Move request parsing inside the persistence guard.**
Lines 200-205 of `functions/chat/app.py` execute before the `try/finally` that owns `save_turn`. Any parse failure there yields a 502 with no persisted turn and no record of the question. Moving the parse inside — or wrapping it in its own typed check — restores the invariant the code comment at lines 208-212 claims to hold.

**R5. Correct the prompt-template guard once the real limit is known.**
Until then, `_BEDROCK_RAG_PROMPT_LIMIT = 4096` is guarding at a value above the only documented maximum (4000) while the template sits at 4064. Whatever the resolution, the assertion should cite its source, and the 32-char headroom should be treated as the operational constraint it is: the template is effectively frozen against clinician edits. If it needs to grow, content has to leave first.

**R6. Decide the fate of the sync path, then act on the decision.**
Three options, and the middle one is probably right:
- *Retire it* — remove `SyncFunction`, its S3 event, its IAM grants, the `DataSourceId` parameter, and the empty bucket. Honest, and matches how the KB is actually loaded.
- *Repoint it* — rewrite the handler to call `IngestKnowledgeBaseDocuments` (the `CUSTOM` API) instead of `StartIngestionJob`, making S3-upload-triggers-ingest genuinely work. Real work, not a config fix.
- *Leave it* — then at minimum tighten the guard so a placeholder is treated as unconfigured (`if config.DATA_SOURCE_ID in ("", "REPLACE_ME")`), so it fails loudly rather than 500-ing.

Whichever is chosen, `samconfig.toml:10`'s `DataSourceId=FDN4IETFFW` should stop naming a deleted resource.

**R7. Close the env-var deployment gap.**
`scripts/deploy_*.ps1` update code and layers but never environment variables, so `samconfig.toml` and the running Lambdas have silently diverged (`FDN4IETFFW` vs `REPLACE_ME`). Either have the deploy scripts apply env vars, or document that env changes require a full `sam deploy`. As it stands, editing `samconfig.toml` produces no effect and no warning — the same failure mode that the shared-layer rebuild issue already taught this project once.

### P2 — Hardening and hygiene

**R8. Reconsider unauthenticated `/history`.**
With R3 applied, ids become unguessable in practice and the exposure narrows to "whoever holds the id, for ≤24 h, over redacted content." That may be acceptable. If not, the lightest real fix is to stop accepting the id from the path and derive it from something the caller cannot forge — an `HttpOnly` cookie set by `/chat`, or a short-lived signed token returned alongside `session_id`. Note the frontend never calls `/history` today, so the endpoint currently serves no first-party traffic at all; disabling it outright is a genuine option worth pricing.

**R9. Investigate the malformed-`session_id` traffic.**
Five events in 90 days is low volume but non-zero, and the payload shape (a JSON object where a string belongs) is more consistent with probing than with a typo. Enabling API Gateway access logging would answer it; R3/R4 make it harmless either way.

**R10. Right-size retrieval.**
Only 7 of 15 sampled questions returned the configured 5 results; two returned 2 and 3. Worth understanding whether the hierarchical 500/150 chunking plus a 5-document corpus simply cannot supply 5 distinct passages for narrow queries — and if so, whether top-k=5 is the right setting or whether the corpus needs breadth. Directly affects what the model sees on a real turn, which is the concern that prompted this investigation in the first place.

### For the theming port (Task 6 consumers)

**R11. Establish one source of truth, then a semantic layer.**
Generate `tailwind.config.js` colours *from* the CSS variables (or vice versa) so the two scales cannot drift. Then introduce role tokens — `--color-primary`, `--surface-raised`, `--text-inverted`, `--border-subtle`, `--shadow-tint` — and map components onto those rather than onto `sage-800`.

**R12. Replace the ~46 hard-coded `rgba()` restatements of `sage-800` and `sage-950`.**
These are the palette's real portability blocker: every shadow in the system encodes `#1a3d32` as `rgba(26,61,50,·)` with no link to the token. Swapping the brand hue today changes the surfaces and leaves ~40 shadows tinted with the old one. A `--shadow-tint` variable (or `color-mix()`) fixes it in one pass.

**R13. Split the tokens that carry two roles before porting.**
`#ffffff` (surface *and* inverted text), `sage-100` (border *and* text-on-dark), `sage-600` (accent text, focus ring, *and* filled surface). These hold together only because the theme is light-only; each will need to diverge in a dark theme.

**R14. Decide on the missing error / warning / success roles.**
The backend models `ER`, `CLARIFY_ER` and `ORANGE` escalation states that the palette cannot express. Either add the roles deliberately or record that calm-uniform-sage is the intended clinical choice — but make it a decision, not an inherited omission.

**R15. Drop or fill the orphans.**
`bone-100`, `bone-200`, `bone-300`, `--ink-soft`, `--ink-mute` are defined and unused; `bone-300` is Tailwind-only and the `ink` family is CSS-var-only. Resolve before porting rather than carrying the asymmetry forward.

---

## Provenance

Every AWS fact above comes from a read-only call made on 2026-09-01 as `arn:aws:iam::973938718804:user/enbar.gali` in `eu-west-1`:

```
aws bedrock-agent get-knowledge-base        --knowledge-base-id CHAU7BWP4S
aws bedrock-agent list-knowledge-bases
aws bedrock-agent list-data-sources         --knowledge-base-id CHAU7BWP4S
aws bedrock-agent get-data-source           --data-source-id PPIUPPCKNN | FDN4IETFFW
aws bedrock-agent list-ingestion-jobs       --data-source-id PPIUPPCKNN | FDN4IETFFW
aws bedrock-agent list-knowledge-base-documents --data-source-id PPIUPPCKNN
aws bedrock-agent-runtime retrieve          × 22 queries (15 validation + 7 sweep)
aws lambda list-functions
aws lambda get-function-configuration       --function-name gali-{sync,chat,history}-dev
aws lambda get-policy                       --function-name gali-sync-dev
aws logs describe-log-groups                --log-group-name-prefix /aws/lambda/gali
aws logs describe-log-streams               × 4 log groups
aws logs filter-log-events                  × 5 (ValidationException, ERROR, "Chat completed", strip-crash)
aws s3 ls s3://gali-documents-gali-backend-test-973938718804/ --recursive
aws sts get-caller-identity
```

Denied to this principal, hence gaps 5 and 6 above: `cloudformation:ListStacks`, `apigateway:GET`, `s3:GetBucketNotification`.

Repository facts are cited inline as `path:line`. Git history was read with `git -C <abs-path> log` only. Character measurements were taken by importing `shared.prompt` in a local Python 3.12 interpreter against botocore 1.42.97.

**No write of any kind was performed against AWS or against either Gali repository.** This report is the only artefact produced, and it sits outside both, at `C:\Users\eb300\Desktop\App_Factory\docs\gali_readonly_audit_2026-09-01.md`.
