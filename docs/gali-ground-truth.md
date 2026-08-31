# Gali ground truth

What production Gali actually is. Every value here is a **constant to be copied,
never a value to be chosen**. Where a source is silent, this document says so
instead of filling the gap — see
[What is not in the Gali repos](#what-is-not-in-the-gali-repos).

Two sources, because one was not enough. Sections 1-8 and 10 are read out of the
two read-only repos (2026-08-30 and 2026-08-31). **Section 9 is read out of AWS
(2026-08-31)**, and it exists because Gali's Knowledge Base was created by hand in
the console, so its configuration is in no repo at all.

| repo | path | commit |
| ---- | ---- | ------ |
| backend | `C:\Users\eb300\Desktop\Gali-AWS-backend` | `ab6a325` (2026-08-02) |
| frontend | `C:\Users\eb300\Desktop\Gali-frontend` | `e950553` (2026-08-02) |

Both are read-only. Nothing in this repo writes to either path.

The machine-readable copy of everything below is `lib/gali/constants.ts`. The
digest table at the end of this file is what `tests/gali/constants.golden.test.ts`
reads: the test hashes each constant in that module and compares it against the
digest recorded here, so a constant cannot drift without this document failing
with it.

All line numbers are in the backend repo unless the path says otherwise.

---

## 1. The live prompt

The spec's central claim is that the system prompt is assembled from five parts.
**It is not, for app #1.** Production sends one hand-written condensed string,
`RAG_PROMPT_TEMPLATE`, as Bedrock's `textPromptTemplate`. The five-part
`SYSTEM_PROMPT` in the same module is documentation and is never sent — see
§3 and draft ADR 0018.

| fact | value | provenance |
| ---- | ----- | ---------- |
| definition | `RAG_PROMPT_TEMPLATE` | `shared/shared/prompt.py:300-380` |
| sent as | `generationConfiguration.promptTemplate.textPromptTemplate` | `functions/chat/app.py:125-128` |
| length | **4064 characters** | computed from source |
| Bedrock cap | **4096 characters** | asserted `shared/shared/prompt.py:409,413-416` |
| headroom | **32 characters** | 4096 − 4064 |
| required placeholder | `$search_results$`, on its own line at the end | `shared/shared/prompt.py:378-379`, asserted at `:410` |
| enforcement | `assert` at **import time**, so a bad edit cannot reach Lambda | `shared/shared/prompt.py:406-416` |

Two of those numbers matter to the factory. 4096 is the cap ADR 0016 records.
**32 is how much room app #1 has left** — the factory cannot add a single
sentence to Gali's prompt without breaking it, which is why the ADR 0009
precedence text is off for Gali.

### 1.1 Phone links are substituted at import

The literals in `prompt.py` carry readable phone numbers; at import those are
replaced with the pre-built markdown links from `shared/shared/constants.py`
(`shared/shared/prompt.py:386-404`). The verbatim text below and every string in
`lib/gali/constants.ts` is the value **after** substitution — what production
sends. For Gali's own numbers the substitution is a no-op on the visible text,
which is why the block below still reads with literal numbers; the mechanism
still matters, because it means `prompt.py` alone is not the final value.

### 1.2 `RAG_PROMPT_TEMPLATE`, verbatim

<!-- BEGIN GENERATED: rag-prompt-template -->
```text
[redacted:rag-prompt-template]```
<!-- END GENERATED: rag-prompt-template -->

---

## 2. How the live prompt is invoked

One `RetrieveAndGenerate` call per turn (`functions/chat/app.py:98-141`):

| parameter | value | provenance |
| --------- | ----- | ---------- |
| `type` | `KNOWLEDGE_BASE` | `functions/chat/app.py:108` |
| `knowledgeBaseId` | `[redacted:kb-id]` | `config.py:10` from `samconfig.toml:10` |
| `modelArn` | `[redacted:model-id-primary]` | `samconfig.toml:10` |
| fallback `modelArn` | `[redacted:model-id-fallback]` | `samconfig.toml:10`, tried in order at `functions/chat/app.py:144-164` |
| `numberOfResults` | `5` | `config.py:27` default, not overridden |
| `queryTransformationConfiguration.type` | `QUERY_DECOMPOSITION` | `functions/chat/app.py:122-124` |
| `maxTokens` | `4096` | `config.py:34` default |
| `temperature` | `0.3` | `config.py:35` default |
| `sessionId` | Bedrock-generated, stored in DynamoDB at sort key `timestamp = 0` | `functions/chat/app.py:139-140`, `shared/shared/history.py:204-231` |

`QUERY_DECOMPOSITION` is not a tuning preference. The comment at
`functions/chat/app.py:117-121` records that Bedrock's default query rewriter
combined prior turns into the retrieval query and poisoned follow-ups into an
English refusal. The factory choosing the default would reproduce that bug.

### 2.1 The prompt template is not the whole story

The per-turn behaviour is steered by **directives appended to the RAG query**,
not by the template — precisely because the template is at 4064/4096 and
clinician-vetted (`functions/chat/app.py:286-289`). Composition order for the
query, at `functions/chat/app.py:429-441`:

1. the patient's raw message
2. exactly one state directive: `_ORANGE_DIRECTIVE` (`:314-318`),
   `_CLARIFY_ER_DIRECTIVE` (`:303-308`), or `_soft_directive_for(message)`
   (`:437`, which may add `_CONTAINMENT_DIRECTIVE` `:332-335` or
   `_CYTOTEC_TRACK_DIRECTIVE` `:342-346`)
3. `_ANTILEAK_DIRECTIVE` (`:325-328`), on **every** turn
4. `[SHOW_DEFAULT_DISCLAIMER]`, only when `prior_assistants == 1` (`:440-441`)

These directive strings are deliberately **not** copied into
`lib/gali/constants.ts`: they are runtime behaviour of the chat Lambda, not part
of the config contract a creator fills in. They are recorded here because any
claim that the factory reproduces Gali has to account for them. The
`[SHOW_DEFAULT_DISCLAIMER]` marker is also the closest thing Gali has to the
spec's flags — it is an *inbound* marker injected into the query, not an
*outbound* flag the model emits.

---

## 3. The five-part prompt: join order and separator

| fact | value | provenance |
| ---- | ----- | ---------- |
| join order | `identity` → `language` → `voice` → `rules` → `formatAndFlags` | `shared/shared/prompt.py:293` |
| separator | **the empty string** | `shared/shared/prompt.py:293` — `+` between the five names, nothing between them |
| why it reads correctly | each part ends with its own newlines | see the trailing-newline column below |
| composed length | **11,492 characters** | sum of the five parts, verified equal to `SYSTEM_PROMPT` |
| vs the 4096 cap | **2.81x over** | 11492 / 4096 |
| role in production | none — reference/documentation only | `shared/shared/prompt.py:6` |

<!-- BEGIN GENERATED: prompt-part-table -->
| part | Python name | source lines | chars | trailing newlines |
| ---- | ----------- | ------------ | ----- | ----------------- |
| `identity` | `_IDENTITY` | `shared/shared/prompt.py:21-30` | 417 | 2 |
| `language` | `_LANGUAGE` | `shared/shared/prompt.py:35-50` | 503 | 2 |
| `voice` | `_VOICE` | `shared/shared/prompt.py:55-98` | 1777 | 2 |
| `rules` | `_RULES` | `shared/shared/prompt.py:103-214` | 5356 | 2 |
| `formatAndFlags` | `_FORMAT_AND_FLAGS` | `shared/shared/prompt.py:219-288` | 3439 | 1 |
<!-- END GENERATED: prompt-part-table -->

The last part is the only one ending in a single newline; the other four end in
two. That asymmetry is load-bearing for an empty separator, and it is the reason
`composeSystemPrompt` must not "helpfully" insert `\n\n` between parts.

The five parts themselves are copied verbatim into
`GALI_SYSTEM_PROMPT_PARTS` in `lib/gali/constants.ts` and pinned by digest
below, rather than reproduced here, so there is exactly one copy of 11,492
characters of clinical text in this repo.

---

## 4. The triage classifier

Locked at commit **`a635c2e`** (2026-07-05, *feat(triage): iteration 5 — 3
CLARIFY_ER few-shots for gate-blocking misses*). That commit touched exactly one
file, `shared/shared/redflag_classifier.py`, and is the most recent commit to
touch it; `docs/VALIDATION_CHANGELOG_2026-05-25_to_date.md:113` names the same
hash as the locked prompt for the final validation run.

| fact | value | provenance |
| ---- | ----- | ---------- |
| prompt | `_SYSTEM_PROMPT`, 5242 chars | `shared/shared/redflag_classifier.py:84-186` |
| API | `bedrock-runtime` `converse` | `:220-226` |
| model | `config.MODEL_ARN` — the **same primary model** as generation | `:221` |
| `system` | the prompt, as a single system block | `:222` |
| `messages` | one user block: the raw patient message, no history | `:223` |
| `temperature` | `0.0` | `:71`, passed at `:224` |
| `maxTokens` | `8` | `:70`, passed at `:224` |
| tiers | `ER`, `CLARIFY_ER`, `SOFT`, `EXPLAIN` | `:58-62` |
| fail-safe | **`ER`** on any API error, empty output, or unparseable label | `:66`, `:236-243` |
| parsing | split on runs of non-`[A-Z_]`, first exact tier token wins, so `CLARIFY_ER` never degrades to `ER` | `:194`, `:197-210` |
| when | **before** retrieval, once per turn | `functions/chat/app.py:416` |
| what it drives | `derive_state(tier, message)` then directive selection | `functions/chat/app.py:423-437` |
| region | `config.BEDROCK_REGION` = `eu-west-1` | `:188` |

The tier is not used directly: `derive_state` can de-escalate a raw `ER` to
`IN_SCOPE`/`EMOTIONAL` via the 2026-07-12 safe-direction overrides, and the
directive is chosen from the derived state, not the tier
(`functions/chat/app.py:417-427`).

### 4.1 The classifier prompt, verbatim

<!-- BEGIN GENERATED: classifier-system-prompt -->
```text
[redacted:classifier-system-prompt]
```
<!-- END GENERATED: classifier-system-prompt -->

---

## 5. Knowledge Base, data sources, region

| fact | value | provenance |
| ---- | ----- | ---------- |
| KB id | `[redacted:kb-id]` | `scripts/ingest_kb.py:32`, `scripts/kb_verify_reconstruct.py:25`, `samconfig.toml:10` |
| data source id (ingest) | `[redacted:data-source-id-custom]` | `scripts/ingest_kb.py:33`, `scripts/kb_verify_reconstruct.py:26` |
| data source id (sync Lambda) | `[redacted:data-source-id-sync]` | `samconfig.toml:10` → `template.yaml:238` |
| data source type | `CUSTOM` | `scripts/ingest_kb.py:2,5,222` |
| ingest API | `IngestKnowledgeBaseDocuments`, per-document upsert keyed on `customDocumentIdentifier.id` | `scripts/ingest_kb.py:217-252` |
| region | `eu-west-1` | `shared/shared/config.py:14`, `scripts/ingest_kb.py:34`, `functions/backup/app.py:33`, and the frontend's fallback API URL, `Gali-frontend/src/services/apiService.ts:1` |

**The two data source ids are a genuine discrepancy, not a typo I resolved.**
`ingest_kb.py` and `kb_verify_reconstruct.py` both hard-code `[redacted:data-source-id-custom]` and
call the CUSTOM document API. `samconfig.toml` passes `[redacted:data-source-id-sync]` as
`DataSourceId`, which reaches only the sync Lambda, which calls
`StartIngestionJob` on S3 uploads under `documents/` (`template.yaml:228-270`).
The repo nowhere states whether these are two data sources on one KB, or one
stale value. Both are recorded; neither is presumed correct. This is queued as a
question, not decided here.

The consequence for the factory is the one the checklist already flagged at `R5`
and `E8`: per-file re-embedding is achievable **because** the live path is a
CUSTOM per-document upsert, not the S3 data-source-wide ingestion job the
architecture spec describes.

---

## 6. Chat-history table

| fact | value | provenance |
| ---- | ----- | ---------- |
| name | `[redacted:chat-table-pattern]` | `template.yaml:87` |
| `Stage` | `dev` \| `prod`, default `dev`; `samconfig.toml` overrides it nowhere | `template.yaml:34-37`, `samconfig.toml:10` |
| code-side default | `[redacted:chat-table]` | `shared/shared/config.py:17` |
| partition key | `session_id`, type `S` | `template.yaml:90-96` |
| **sort key** | `timestamp`, type `N` — epoch **milliseconds** | `template.yaml:92-98`, written at `shared/shared/history.py:117` |
| TTL attribute | **`ttl`** | `template.yaml:103-105` |
| TTL value | Unix seconds of the **next midnight Asia/Jerusalem** | `shared/shared/history.py:87-91`, `shared/shared/time_utils.py:10` |
| billing | `PAY_PER_REQUEST` | `template.yaml:88` |
| encryption / PITR | `SSEEnabled: true`, PITR enabled | `template.yaml:99-102` |
| deletion policy | `Retain` on both delete and replace | `template.yaml:84-85` |
| reserved sort key | `timestamp = 0` holds the Bedrock session id, `role = "_bedrock_session"` | `shared/shared/history.py:204-231` |
| history limits | `HISTORY_LIMIT` 50, `HISTORY_HARD_CAP` 100 | `shared/shared/config.py:30-31` |

Three of these contradict the architecture spec's `R7` directly: the spec says
key `session_id` alone, TTL attribute `expires_at`, and a rolling 24 hours. Gali
has a **composite** key, the attribute is **`ttl`**, and expiry is **next
midnight Israel time** — so a turn saved at 23:50 is gone in ten minutes, not in
a day. The nightly backup at 23:00 Asia/Jerusalem exists precisely because of
that (`template.yaml:329-346`).

`timestamp = 0` being reserved also means the factory cannot treat the sort key
as "just a timestamp": a generic runtime that writes a turn at epoch 0 would
overwrite the session pointer.

---

## 7. The 9-key KB metadata schema

`SCHEMA_KEYS` at `scripts/ingest_kb.py:41-44`. Every document is validated in
full **before any network call** (`scripts/ingest_kb.py:155-198`), so an invalid
document fails locally rather than deep inside Bedrock.

| # | key | inline type | required | rule | provenance |
| - | --- | ----------- | -------- | ---- | ---------- |
| 1 | `doc_type` | `STRING` | yes | free string; observed values `procedure_guide`, `disclaimer_policy`, `info_guide` | `:41`, `:85-147` |
| 2 | `procedure_type` | `STRING` | yes | free string; observed `medication`, `missed_abortion`, `na` | `:41`, `:85-147` |
| 3 | `gestational_age_max_weeks` | `NUMBER` | **no** | `int` when present; **omitted entirely** when not applicable | `:61`, `:78-79`, `:190-191` |
| 4 | `topic_tags` | `STRING_LIST` | yes | list of **1-10** strings, each non-empty, trimmed, no `"` | `:166-174` |
| 5 | `contains_red_flags` | `BOOLEAN` | yes | must be `bool` | `:187-189` |
| 6 | `contains_emotional_support` | `BOOLEAN` | yes | must be `bool` | `:187-189` |
| 7 | `language` | `STRING` | yes | must equal `he` | `:37`, `:177-178` |
| 8 | `source` | `STRING` | yes | must equal `Wolfson Medical Center` | `:39`, `:185-186` |
| 9 | `version` | `STRING` | yes | must match `^\d{4}-\d{2}$`; batch default `2026-06`, per-doc override allowed | `:38`, `:179-184` |

Also enforced, and not metadata: the local file must exist and its stripped
content must be at least 50 characters (`:193-198`).

Type mapping to Bedrock `inlineAttributes` is at `scripts/ingest_kb.py:201-214`:
`bool` → `BOOLEAN`, `int` → `NUMBER`, `list` → `STRING_LIST`, everything else →
`STRING`. Note the ordering of that check — `bool` is tested before `int`,
because in Python a `bool` *is* an `int`.

One recorded drift, from the source itself: `disclaimers` sets
`contains_emotional_support=False` with the comment *"per schema (stored value
'true' is the drift)"* (`scripts/ingest_kb.py:115`). The indexed KB and this
script disagree on that one value, and the script is the stated intent.

---

## 8. Digest table — the golden values

`tests/gali/constants.golden.test.ts` parses this table. Each row is
`| constant | chars | sha256 of the UTF-8 bytes |`. A constant that changes in
`lib/gali/constants.ts` without a matching change here fails the test, and vice
versa.

<!-- BEGIN GENERATED: digest-table -->
| constant | chars | sha256 |
| -------- | ----- | ------ |
| `GALI_RAG_PROMPT_TEMPLATE` | 4064 | `000aabf0166d346e64a6e343bc976dcc7467df3b5600cdf36deff8cf2faaeacd` |
| `GALI_SYSTEM_PROMPT_PARTS.identity` | 417 | `c6c0eeed335734e7e29daab27b09df85dfb7029c67012c9b918e597acf5a649e` |
| `GALI_SYSTEM_PROMPT_PARTS.language` | 503 | `3cb07d380e424081cdfc5ce6da3804fe912722a82696f1f51a0fe91945e5d8b2` |
| `GALI_SYSTEM_PROMPT_PARTS.voice` | 1777 | `cbd5c105f1310318aef38615fd90af9ae7135c910f8c0b29de43a3eb9d9867c9` |
| `GALI_SYSTEM_PROMPT_PARTS.rules` | 5356 | `a02ad739713d519bd2a94fb66581f10217ba665c54f16bf9b9372ba1bc01cd61` |
| `GALI_SYSTEM_PROMPT_PARTS.formatAndFlags` | 3439 | `ec1efc786bdc8f6469a68e975d3dc5b42624a514982e79e533c57185ae327101` |
| `GALI_SYSTEM_PROMPT` | 11492 | `3dfa21944aeea8f5816d5737b0a5fc60bb9cfea75cdfbeb7d0b5b5c9aae60e1f` |
| `GALI_CLASSIFIER_SYSTEM_PROMPT` | 5242 | `ac7362bc02a4d7a2eff10f610ba28827925dc7f6a1e3b1f0c42fbfee2894a095` |
<!-- END GENERATED: digest-table -->

---

## 9. Read from AWS, not from the repos

Gali's Knowledge Base was created by hand in the console, so none of its
configuration is in either repo. It is all readable from the API. Read
**2026-08-31**, account `[redacted:account-id]`, region `eu-west-1`, identity
`arn:aws:iam::[redacted:account-id]:user/[redacted:iam-user]`.

Commands, so any of this can be re-checked:

```bash
aws bedrock-agent get-knowledge-base  --knowledge-base-id [redacted:kb-id] --region eu-west-1
aws bedrock-agent list-data-sources   --knowledge-base-id [redacted:kb-id] --region eu-west-1
aws bedrock-agent get-data-source     --knowledge-base-id [redacted:kb-id] --data-source-id [redacted:data-source-id-custom] --region eu-west-1
aws s3vectors get-index --vector-bucket-name [redacted:vector-bucket] \
                        --index-name [redacted:vector-index] --region eu-west-1
aws iam get-role --role-name AmazonBedrockExecutionRoleForKnowledgeBase_dvica
```

### 9.1 The five values the spec calls fixed — all five confirmed

The architecture spec states five KB parameters as fixed for every app. Every one
of them is what production actually runs.

| # | spec says | AWS says | verdict |
| - | --------- | -------- | ------- |
| 1 | chunking `hierarchical` | `chunkingStrategy: HIERARCHICAL` | **confirms** |
| 2 | parent `500` tokens | `levelConfigurations[0].maxTokens: 500` | **confirms** |
| 3 | child `150` tokens | `levelConfigurations[1].maxTokens: 150` | **confirms** |
| 4 | embeddings `cohere.embed-multilingual-v3` | `arn:aws:bedrock:eu-west-1::foundation-model/cohere.embed-multilingual-v3` | **confirms** |
| 5 | dimensions `1024` | S3 Vectors index `dimension: 1024` | **confirms** |

One qualification on #5, because it changes where the value lives rather than
whether it is right. `get-knowledge-base` returns **no** dimension field: the
`embeddingModelConfiguration` carries only `embeddingDataType: FLOAT32`. The 1024
is a property of the **vector index**, not of the KB. So the spec's number is
correct and its placement is not — for this embedding model the factory does not
set a dimension on the KB, it creates an index of that dimension and the KB
inherits it. A factory that tries to pass `dimensions: 1024` to
`CreateKnowledgeBase` is passing it to the wrong call.

### 9.2 What the spec got wrong, and what it never mentioned

| # | item | AWS says | verdict |
| - | ---- | -------- | ------- |
| 6 | data source type — spec: S3 at `s3://<app>/kb/` | `dataSourceConfiguration.type: CUSTOM` | **contradicts** |
| 7 | vector store — spec: silent | `storageConfiguration.type: S3_VECTORS` | **spec silent, and no ADR guessed it** |
| 8 | chunk overlap — spec: silent | `overlapTokens: 30` | **spec silent** |
| 9 | distance metric — spec: silent | `distanceMetric: euclidean` | **spec silent** |
| 10 | embedding data type — spec: silent | `FLOAT32` / index `float32` | **spec silent** |
| 11 | data deletion policy — spec: silent | `dataDeletionPolicy: DELETE` | **spec silent** |

Rows 7 and 9 are the two that matter.

**S3 Vectors.** The vector store is `S3_VECTORS` — index
`arn:aws:s3vectors:eu-west-1:[redacted:account-id]:bucket/[redacted:vector-bucket]/index/[redacted:vector-index]`,
in vector bucket `[redacted:vector-bucket]`, both created 2026-04-19,
`AES256`. Draft ADR 0020 offered four options — shared OpenSearch Serverless,
per-app OpenSearch Serverless, Aurora pgvector, a managed third party — and the
real answer is none of them. That matters beyond being wrong: 0020's whole cost
argument was built on OpenSearch Serverless having a minimum billed capacity per
collection, and S3 Vectors has no such floor. The recommendation in 0020 has been
amended accordingly.

**Euclidean, not cosine.** `distanceMetric: euclidean`. Nothing in the spec, the
build plan or any ADR mentions a distance metric, and cosine is the more common
default for text embeddings. A factory that creates its indexes with cosine
would be retrieving differently from app #1 on identical vectors — a silent
answer-quality difference, not an error. This is now checklist row `N14`.

### 9.3 The KB service role, as it actually is

`AmazonBedrockExecutionRoleForKnowledgeBase_dvica`, created 2026-04-19, last used
2026-08-31 in `eu-west-1`. No inline policies; two attached customer policies.

Trust policy — `bedrock.amazonaws.com`, with both confused-deputy conditions
present:

```json
{ "Condition": {
    "StringEquals": { "aws:SourceAccount": "[redacted:account-id]" },
    "ArnLike": { "aws:SourceArn": "arn:aws:bedrock:eu-west-1:[redacted:account-id]:knowledge-base/*" } } }
```

`AmazonBedrockS3VectorStorePolicyForKnowledgeBase_dvica` — five actions, scoped to
the one index ARN, conditioned on `aws:ResourceAccount`:

```
s3vectors:GetIndex  QueryVectors  PutVectors  GetVectors  DeleteVectors
```

`AmazonBedrockFoundationModelPolicyForKnowledgeBase_dvica` —
`bedrock:InvokeModel` on the cohere model ARN only, plus
`aws-marketplace:Subscribe|ViewSubscriptions|Unsubscribe` conditioned on
`aws:CalledViaLast = bedrock.amazonaws.com`.

**There is no `s3:GetObject` and no `s3:ListBucket` anywhere in this role.** That
is not an omission — a CUSTOM data source is pushed to, so the KB never reads S3.
An S3 data source, which is what the spec describes and what draft ADR 0021 was
written about, needs both. So 0021's question is real for the factory and simply
does not arise for app #1.

### 9.4 The second data source id does not exist

Recorded as a read, not acted on — which door Gali production uses is being
investigated elsewhere.

- `list-data-sources` on `[redacted:kb-id]` returns **exactly one**: `[redacted:data-source-id-custom]`, name
  `md-files-22-06-26`, `AVAILABLE`, created 2026-06-22, updated 2026-06-28.
- `get-data-source` for `[redacted:data-source-id-sync]` returns
  `ResourceNotFoundException: DataSource with id [redacted:data-source-id-sync] is not found`.
- `list-knowledge-bases` in `eu-west-1` returns **exactly one** KB, so
  `[redacted:data-source-id-sync]` is not a data source on some other knowledge base either.

`[redacted:data-source-id-sync]` is the value `samconfig.toml:10` passes as `DataSourceId` to the sync
Lambda. See `QUESTIONS.md` Q1; no change has been made anywhere on the strength of
this read.

---

## 10. Session identity — the mechanism generic Gali will copy

Read from both repos on 2026-08-31. Described, not redesigned.

### 10.1 How a session id comes into being

| fact | value | provenance |
| ---- | ----- | ---------- |
| generated by | `str(uuid.uuid4())` — the **chat Lambda**, server-side | `functions/chat/app.py:201` |
| generated when | **only when the caller sends none** | `functions/chat/app.py:201` |
| the exact line | `session_id = (body.get("session_id") or str(uuid.uuid4())).strip()` | `functions/chat/app.py:201` |
| entropy | 122 bits, `uuid4` over `os.urandom` | CPython |
| returned to the client | in the JSON body as `session_id`, **and** in an `X-Session-ID` response header | `functions/chat/app.py:543,546` |
| stored client-side | an in-memory class field only — **not** localStorage, not a cookie | `Gali-frontend/src/services/apiService.ts:7,23` |
| resent by the client | on every subsequent `/chat` call, in the request body | `Gali-frontend/src/services/apiService.ts:12` |
| hashed | **nowhere.** There is no `hashlib`, `sha256` or `hmac` anywhere in `shared/` or `functions/` | grep, 2026-08-31 |

Because the client keeps it in memory only, a page reload loses the session and
the next message starts a new one. That is a privacy property, not a bug: nothing
about a conversation survives in the browser.

### 10.2 Caller-supplied or unforgeable — the answer is caller-supplied

**The id is caller-supplied.** It is not derived from anything the caller cannot
forge, and there is nothing to forge *against*:

- `/chat` takes `session_id` straight from the request body and uses it verbatim,
  with only `.strip()` applied. **No format check, no signature, no HMAC, no
  binding to an IP, a cookie, a header or an account** — there are no accounts
  (`H1`), and the API has no authorizer at all (`template.yaml`, no
  `Auth` block on either route).
- The server mints a uuid4 **only** when the field is absent. Send `"x"` and the
  session id is `"x"`.
- So the id is a **bearer token with no issuer check**: whoever presents it is
  treated as the owner of that conversation.

### 10.3 Validation, and the asymmetry between the two endpoints

| endpoint | validation | provenance |
| -------- | ---------- | ---------- |
| `POST /chat` | **none whatsoever** | `functions/chat/app.py:201` — no check between `.strip()` and use |
| `GET /history/{session_id}` | `uuid.UUID(session_id)`, `ValueError` → `400 invalid session_id format` | `functions/history/app.py:48-55` |

Three things follow, and all three are properties of Gali as it stands rather
than criticisms of it:

1. **The two endpoints disagree.** `/chat` accepts any string; `/history` accepts
   only a well-formed UUID. A session created with a non-UUID id — which `/chat`
   permits — can therefore **never be read back** through `/history`. The data is
   in the table and the read path rejects the key.
2. **`/history` checks format, not ownership.** There is no authorization step of
   any kind. Knowing a session id is sufficient to read the entire conversation,
   including everything the PII scrubber left in place.
3. **Writes are equally open.** Because `/chat` accepts a supplied id, a caller who
   learns another session's id can also **append turns to it** — `save_turn` writes
   under that partition key unconditionally (`functions/chat/app.py:229-236`).
   Exposure is not read-only.

### 10.4 Is it enumerable

**Not by brute force, and that is not the exposure.**

- A uuid4 is 122 random bits. Guessing a live one is not feasible, and the table
  has no index that lists session ids — `get_messages` is a `Query` on an exact
  partition key (`shared/shared/history.py:177-181`), so there is no cheap way to
  ask "what sessions exist".
- The TTL shortens the window further: every item expires at the next midnight
  Israel time, so a session id is only useful until then (§6).

The realistic paths to a session id are all disclosure, not enumeration:

- **It is logged.** `logger.append_keys(session_id=session_id)`
  (`functions/chat/app.py:208`) puts it on every structured log line for the turn,
  so it is in CloudWatch for the log group's retention, and `/history` needs
  nothing else.
- **It is in a response header** (`X-Session-ID`), which CORS explicitly exposes
  (`template.yaml:30`), so anything sitting in the response path can read it.
- **`/history` is unauthenticated and, as far as this repo shows, unused.** The
  production frontend never calls it — `apiService` has exactly two methods,
  `sendMessage` and `resetSession`, and neither touches `/history`. So the endpoint
  that turns a leaked id into a full transcript has no known consumer.

### 10.5 What generic Gali has to copy, and what it must decide

Copy, because app #1 depends on it:

- Server-side generation with `uuid4` when the caller supplies nothing.
- The id echoed in the body and in `X-Session-ID`.
- Client keeps it in memory only.
- The composite key (`session_id` HASH + `timestamp` RANGE) and the reserved
  `timestamp = 0` row holding the Bedrock session pointer (§6).

Not settled by copying, and each is a decision rather than a value:

- Whether the factory's `/history` equivalent authorizes, or keeps
  format-only validation.
- Whether a supplied `session_id` is accepted at all, or whether the server always
  mints one.
- Whether the two endpoints are made consistent about the UUID format.

These are recorded here as observations. They are queued as Q28 and belong with
0024 (auth) rather than being decided in a ground-truth document.

---

## What is not in the Gali repos

Listed as **not found** rather than inferred. Each is a real gap for the
factory, and the ones with an ADR number are queued in `QUESTIONS.md`.

**Items 1-8 were closed on 2026-08-31 by reading AWS — see §9.** They were never
in the repos and never will be; the KB was built in the console. They are kept
here, marked, so the record shows what was unknown and how it stopped being
unknown.

| # | asked for | status | what the repos do say |
| - | --------- | ------ | --------------------- |
| 1 | KB chunking strategy (`hierarchical`) | **closed — §9, confirms spec** | no chunking configuration anywhere in the repo. `ARCHITECTURE.md:49` says only "Bedrock Knowledge Base (managed embeddings)". |
| 2 | parent chunk size `500` tokens | **closed — §9, confirms spec** | same |
| 3 | child chunk size `150` tokens | **closed — §9, confirms spec** | same |
| 4 | embedding model (`cohere.embed-multilingual-v3`) | **closed — §9, confirms spec** | no embedding model id appears in any file outside `.venv/`. The spec's values are the spec's, not Gali's. |
| 5 | embedding dimensions (`1024`) | **closed — §9, confirms spec** | same |
| 6 | KB vector store (OpenSearch / Aurora / Pinecone) | **closed — §9, `S3_VECTORS`** | `ARCHITECTURE.md:88` names "vector store + embeddings" as one opaque box. The KB is a SAM **parameter**, created outside the stack, so none of its internals are in the repo. |
| 7 | the KB's own data-access IAM role | **closed — §9.3** | the template grants the *sync Lambda* `StartIngestionJob` + bucket read (`template.yaml:243-259`). The role the KB itself assumes is outside the stack. |
| 8 | which of the two data source ids is current | **closed — §9.4** | both are used, by different code paths; see §5. |
| 9 | prompt version increment policy | **not found** | there is no versioned prompt artefact at all. The prompt is a Python literal in the shared Lambda layer, versioned by git. |
| 10 | the S3 `kb/` and `prompt/v1.txt` layout the spec describes | **not found** | the bucket is `[redacted:documents-bucket-pattern]` (`template.yaml:112`) and the watched prefix is `documents/`, not `kb/` (`template.yaml:270`). No `prompt/` prefix exists. |

Items 1-5 were the sharpest finding here while they were open: the spec stated
five values as fixed for every app and not one could be confirmed against app #1.
They are now confirmed, all five, by reading the KB itself — see §9.1. The residue
is smaller and different: the spec is right about the five values it names and
silent about four more that production also sets (overlap 30, distance metric
euclidean, `FLOAT32`, deletion policy `DELETE`), and wrong about the data source
type. A factory built from the spec alone would get the chunking and the
embeddings right and the retrieval geometry wrong.

Items 9 and 10 remain genuinely open. Neither is answerable from AWS: item 9 is a
policy question (0022) and item 10 describes a bucket layout app #1 does not use.
