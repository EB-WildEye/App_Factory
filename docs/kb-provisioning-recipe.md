# Knowledge Base provisioning recipe

**Draft. Nothing here has been executed.** No resource was created, updated or
deleted in producing it — `.claude/settings.json` denies every mutating AWS verb,
so it could not have been.

App #1's Knowledge Base was **clicked together in the console** on 2026-04-19.
Nobody has created one by API, and the factory has to do it by API for every app.
This is the sequence, written from two sources and no memory:

1. **The botocore service models** shipped in the Gali venv —
   `bedrock-agent` `2023-06-05` and `s3vectors` `2025-07-15`. These are
   authoritative for which parameters exist and which are required.
2. **The live reads of 2026-08-31** recorded in `docs/gali-ground-truth.md` §9,
   which say what app #1's values actually are.

Anything neither source answers is marked **CANNOT DETERMINE** and listed in §8.

---

## 1. What must exist before any app is created

Platform-level, created once, not per app. Both are new work: the spec assumes
they exist and never says who makes them.

| # | thing | why it cannot wait |
| - | ----- | ------------------ |
| P-1 | A vector bucket (`s3vectors:CreateVectorBucket`) | An index lives in a bucket. App #1's is `bedrock-knowledge-base-ib3awf`, a console-generated name. |
| P-2 | The KB service role, with its trust policy | `CreateKnowledgeBase` takes `roleArn` as a **required** parameter, so the role must exist and be assumable *before* the first KB call. |

The role's trust policy, copied from app #1's — both confused-deputy conditions
are present and both should stay:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "TrustPolicyStatement",
    "Effect": "Allow",
    "Principal": { "Service": "bedrock.amazonaws.com" },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": { "aws:SourceAccount": "<account-id>" },
      "ArnLike": { "aws:SourceArn": "arn:aws:bedrock:<region>:<account-id>:knowledge-base/*" }
    }
  }]
}
```

There is a chicken-and-egg wrinkle worth naming: the role's *permission* policies
reference the index ARN, and the index does not exist until K-2. Either the
policy is written with a wildcard over the factory's index-name prefix, or it is
attached narrowly and updated per app — and updating it per app is the shared-state
mutation draft ADR 0021 argues against. **Recommend the prefix wildcard**, decided
in 0021.

---

## 2. The call sequence

In order. Steps are numbered `K-n` so the rollback table in §7 can refer to them.
The order is forced: each step needs an identifier the previous one returns.

> **Annotation, 2026-09-01.** K-1 below pairs `CreateBucket` with a bucket-policy
> write. That was written against ADR 0021's original recommendation (d). ADR 0025's
> derived bucket pattern has since moved 0021 toward (b) — one shared role with a
> naming-prefix wildcard, written once at platform setup — under which **the policy
> write disappears from the create path entirely**. The step is left as written because
> 0021 is still a draft; if (b) is accepted, K-1 is `CreateBucket` alone and the
> rollback in §7 loses nothing, since a bucket policy dies with its bucket.

| # | API call | service | returns | blocking? |
| - | -------- | ------- | ------- | --------- |
| K-1 | `CreateBucket` (+ bucket policy — see the annotation above) | `s3` | bucket name | synchronous |
| K-2 | `CreateIndex` | `s3vectors` | `indexArn` | synchronous — see §5 |
| K-3 | `CreateKnowledgeBase` | `bedrock-agent` | `knowledgeBaseId`, `status: CREATING` | **asynchronous** |
| K-4 | `GetKnowledgeBase` until `ACTIVE` | `bedrock-agent` | `status` | poll |
| K-5 | `PutObject` × N → `kb/` | `s3` | — | synchronous |
| K-6 | `CreateDataSource` | `bedrock-agent` | `dataSourceId` | synchronous, `status: AVAILABLE` |
| K-7 | `StartIngestionJob` | `bedrock-agent` | `ingestionJobId`, `status: STARTING` | **asynchronous** |
| K-8 | `GetIngestionJob` until `COMPLETE` | `bedrock-agent` | `status`, `statistics` | poll |

Two orderings are not free choices:

- **K-2 before K-3.** `CreateKnowledgeBase` needs `storageConfiguration`, and for
  `S3_VECTORS` that means an `indexArn` (or a bucket plus an index name to create).
- **K-5 before K-7, and after K-6.** An S3 data source ingests what is in the
  prefix when the job runs. Objects written after `StartIngestionJob` are not in
  that job.

Note K-1 is the spec's B1 and K-5 is B2, so this recipe is the inside of the
spec's B4 plus the two steps that must bracket it.

---

## 3. Every required parameter, and where it comes from

`REQ` = required by the API model. Absent means the call fails, not that a default
applies.

### K-2 `s3vectors:CreateIndex`

| parameter | REQ | value | source |
| --------- | --- | ----- | ------ |
| `indexName` | ✅ | derived from `appName` | **AppConfig** |
| `vectorBucketName` \| `vectorBucketArn` | one of | the platform bucket | factory constant (P-1) |
| `dimension` | ✅ | `1024` | factory constant — matches app #1 |
| `dataType` | ✅ | `float32` | factory constant — the enum has exactly one member |
| `distanceMetric` | ✅ | `euclidean` | factory constant — **see the warning below** |
| `metadataConfiguration.nonFilterableMetadataKeys` | optional | `AMAZON_BEDROCK_TEXT`, `AMAZON_BEDROCK_METADATA` | copy app #1 |
| `encryptionConfiguration.sseType` | optional | `AES256` | copy app #1 |

> **`distanceMetric` is required and has no default.** The enum is
> `['euclidean', 'cosine']`. App #1 uses **`euclidean`**. Nothing in the
> architecture spec, the build plan or any ADR mentions a distance metric, and
> cosine is the more common default for text embeddings — so this is a parameter
> the factory is *forced* to choose, with no guidance, where the wrong choice
> retrieves differently from app #1 on identical vectors and raises no error.
> Checklist `N14`.

### K-3 `bedrock-agent:CreateKnowledgeBase`

| parameter | REQ | value | source |
| --------- | --- | ----- | ------ |
| `name` | ✅ | derived from `appName` | **AppConfig** |
| `roleArn` | ✅ | the platform KB role | factory constant (P-2) |
| `knowledgeBaseConfiguration.type` | ✅ | `VECTOR` | factory constant |
| `…vectorKnowledgeBaseConfiguration.embeddingModelArn` | ✅ | `arn:aws:bedrock:<region>::foundation-model/cohere.embed-multilingual-v3` | factory constant — confirmed against app #1 |
| `…embeddingModelConfiguration.bedrockEmbeddingModelConfiguration.embeddingDataType` | optional | `FLOAT32` | copy app #1 |
| `storageConfiguration.type` | ✅ *(within the block)* | `S3_VECTORS` | factory constant |
| `storageConfiguration.s3VectorsConfiguration.indexArn` | optional | from K-2 | AWS-generated |
| `clientToken` | optional | per-attempt idempotency token | factory — **use it**, see §7 |
| `description`, `tags` | optional | — | factory |

Two model details that matter and are easy to get wrong:

- `dimensions` **does exist** on `bedrockEmbeddingModelConfiguration`, and it is
  optional. App #1 does not set it — `get-knowledge-base` returns no dimension at
  all. The 1024 lives on the **index** (K-2). Setting it in both places is at best
  redundant and at worst a mismatch nobody checks.
- `storageConfiguration` is **optional** in the model. Omitting it appears to be
  what the console did for app #1: the bucket `bedrock-knowledge-base-ib3awf` and
  index `bedrock-knowledge-base-default-index` both carry generated names. The
  factory should pass it explicitly rather than accept a generated store it cannot
  then find by name.

### K-6 `bedrock-agent:CreateDataSource`

Per draft ADR (TASK 9) the factory uses an **S3** data source, following the HTML
spec — not the CUSTOM source app #1 uses.

| parameter | REQ | value | source |
| --------- | --- | ----- | ------ |
| `knowledgeBaseId` | ✅ | from K-3 | AWS-generated |
| `name` | ✅ | derived from `appName` | **AppConfig** |
| `dataSourceConfiguration.type` | ✅ | `S3` | factory constant |
| `…s3Configuration.bucketArn` | ✅ | the app bucket from K-1 | derived from **AppConfig** |
| `…s3Configuration.inclusionPrefixes` | optional | `["kb/"]` | factory constant — the spec's layout |
| `dataDeletionPolicy` | optional | `DELETE` | copy app #1 (enum: `RETAIN`, `DELETE`) |
| `vectorIngestionConfiguration.chunkingConfiguration.chunkingStrategy` | ✅ | `HIERARCHICAL` | factory constant — confirmed |
| `…hierarchicalChunkingConfiguration.levelConfigurations` | ✅ | `[{maxTokens: 500}, {maxTokens: 150}]` | factory constants — confirmed |
| `…hierarchicalChunkingConfiguration.overlapTokens` | ✅ | `30` | factory constant — **see below** |

> **`overlapTokens` is REQUIRED by the API.** The spec names three chunking
> numbers — hierarchical, 500, 150 — and not this one. So a factory built from the
> spec alone does not merely chunk differently from app #1; the
> `CreateDataSource` call **fails to validate**. Checklist `N13`.

### K-7 `bedrock-agent:StartIngestionJob`

`knowledgeBaseId` ✅, `dataSourceId` ✅, `clientToken` optional, `description`
optional. Nothing from `AppConfig`.

---

## 4. What comes from AppConfig, in total

Strikingly little. The whole KB step consumes **one** creator-supplied value:

| AppConfig field | used for |
| --------------- | -------- |
| `appName` | the index name (K-2), the KB name (K-3), the data source name (K-6), and the bucket the data source points at (K-1/K-6) |

`dataFiles` feeds K-5 (the objects), not the KB configuration. `uiTemplate`,
`systemPrompt` and `disclaimers` are not involved at any step.

That is the strongest argument in the repo for ADR 0025 and the reason `appName`
has to be validated hard: one creator-typed string becomes four resource
identifiers across three services, and none of them can be renamed afterwards.

**BLOCKED BY ADR-0025** — whether `appName` is used verbatim or a bucket name is
derived from it decides what K-1 and K-6 are actually given. The recipe deliberately
says "derived from `appName`" rather than picking.

---

## 5. Which steps are asynchronous

| step | async? | how you know it finished | terminal states |
| ---- | ------ | ----------------------- | --------------- |
| K-2 `CreateIndex` | **no** | `GetIndex` on app #1 returns no `status` field at all — the index is either there or the call failed | — |
| K-3 `CreateKnowledgeBase` | **yes** | poll `GetKnowledgeBase` | `ACTIVE`, `FAILED`, `DELETE_UNSUCCESSFUL` (full enum: `CREATING`, `ACTIVE`, `DELETING`, `UPDATING`, `FAILED`, `DELETE_UNSUCCESSFUL`) |
| K-6 `CreateDataSource` | effectively no | returns `status: AVAILABLE`; app #1 reads `AVAILABLE` | `AVAILABLE`, `DELETING`, `DELETE_UNSUCCESSFUL` |
| K-7 `StartIngestionJob` | **yes, and it is the long one** | poll `GetIngestionJob` | `COMPLETE`, `FAILED`, `STOPPED` (full enum: `STARTING`, `IN_PROGRESS`, `COMPLETE`, `FAILED`, `STOPPING`, `STOPPED`) |

Two consequences for the GUI, and they are the whole reason draft ADR 0014
recommends `202` plus polling:

- **K-3 and K-7 both need polling**, so a synchronous `createApp` returning
  resource ids cannot work. K-7 in particular is what the spec calls "the longest
  step".
- **An ingestion job can fail after every provisioning step succeeded.** K-7 is
  started last; the app already has a bucket, a KB, a data source, a table and a
  registry row when the job fails. So `complete` is not a terminal state unless
  ingestion status is part of it — which is exactly what draft ADR 0013's status
  vocabulary and 0014's progress view have to account for.

---

## 6. What the IAM role must allow

Read from app #1's role on 2026-08-31, then extended for the S3 data source the
factory will use. **Marked, because the extension is from documentation and not
from a working example.**

Confirmed from app #1 — `AmazonBedrockS3VectorStorePolicyForKnowledgeBase_dvica`:

```
s3vectors:GetIndex   s3vectors:QueryVectors   s3vectors:PutVectors
s3vectors:GetVectors s3vectors:DeleteVectors
```
scoped to the index ARN, with `Condition: aws:ResourceAccount = <account>`.

Confirmed from app #1 — `AmazonBedrockFoundationModelPolicyForKnowledgeBase_dvica`:

```
bedrock:InvokeModel  on  arn:aws:bedrock:<region>::foundation-model/cohere.embed-multilingual-v3
aws-marketplace:Subscribe | ViewSubscriptions | Unsubscribe   (Condition: aws:CalledViaLast = bedrock.amazonaws.com)
```

**Required in addition, and absent from app #1's role:**

```
s3:GetObject    on  arn:aws:s3:::<app-bucket>/kb/*
s3:ListBucket   on  arn:aws:s3:::<app-bucket>
```

App #1's role has neither, and that is not an oversight — a **CUSTOM** data source
is *pushed to* via `IngestKnowledgeBaseDocuments`, so the KB never reads S3. The
moment the factory uses an **S3** data source, the role must read the bucket. This
is the point draft ADR 0021 exists for, and app #1 cannot validate the answer
because app #1 never needed it.

---

## 7. Rollback, per step

Feeds draft ADRs 0006 and 0013. The compensating action must exist for every step
or the step is an orphan nobody deletes.

| step | compensating action | catch |
| ---- | ------------------- | ----- |
| K-1 | `DeleteBucket` after emptying | must empty **the whole bucket**, not only the keys K-5 wrote, or `prompt/` survives |
| K-2 | `s3vectors:DeleteIndex` | the vector *bucket* is platform-level and must survive |
| K-3 | `DeleteKnowledgeBase` | `DELETE_UNSUCCESSFUL` is a real terminal state — deletion can itself fail |
| K-5 | `DeleteObjects` | covered by K-1's rollback if that empties the bucket |
| K-6 | `DeleteDataSource`, before the KB | `dataDeletionPolicy: DELETE` means deleting the data source also deletes its vectors |
| K-7 | `StopIngestionJob` if `IN_PROGRESS`, then let K-6's deletion clear the vectors | a job that has already written vectors cannot be un-written except via K-6/K-2 |

**Use `clientToken` on K-3 and K-7.** Both take one, and both are the steps where
a retry after a timeout could otherwise create a second KB or a second job — the
duplicate being invisible until someone reads the console.

---

## 8. Open items, routed and grouped

Revised 2026-09-01. Each item now says **how** it gets answered, and they are grouped
so one action clears a whole group.

**One is closed.** Item 6, what `GetIngestionJob` returns in `statistics`, needed no
live run — it is in the service model. Seven counters:
`numberOfDocumentsScanned`, `numberOfMetadataDocumentsScanned`,
`numberOfNewDocumentsIndexed`, `numberOfModifiedDocumentsIndexed`,
`numberOfMetadataDocumentsModified`, `numberOfDocumentsDeleted`,
`numberOfDocumentsFailed` — all optional `long`. The job itself also carries
`failureReasons`, `startedAt` and `updatedAt`. That is enough to build the Data Center's
ingestion-status view (`E9`): documents scanned versus indexed versus failed, and a
reason when it failed.

### Group A — one AWS Service Quotas visit, or one support ticket

Same page, same conversation. Clearing this group unblocks ADR 0020's remaining
question.

| # | item | why it decides something |
| - | ---- | ------------------------ |
| 1 | Per-vector-bucket index quota for S3 Vectors | decides shared index versus index-per-app |
| 7 | One vector bucket per app, or one shared | the same question, seen from the other side |
| — | DynamoDB table count limit for the account | step 5 fails at the ceiling, and the ceiling is per account |

### Group B — one documentation read

All four are in the Bedrock and S3 user guides. One sitting.

| # | item | what to look for |
| - | ---- | ---------------- |
| 2 | Whether `CreateIndex` can be slow enough to need polling | app #1's `GetIndex` returns no `status` field, which is evidence but not a guarantee under load |
| 5 | Whether `s3:GetObject` alone suffices, or `s3:GetObjectVersion` is also needed on a versioned bucket | app #1 has no S3 data source to copy, and its document bucket *is* versioned |
| — | CloudFormation resource coverage for `AWS::Bedrock::KnowledgeBase`, `AWS::Bedrock::DataSource`, and S3 Vectors buckets and indexes | decides whether option C in `docs/provisioning-architecture-comparison.md` is viable at all. `cloudformation:DescribeType` returned **AccessDenied** for this IAM user, and no local resource spec, `sam` or `cfn-lint` is installed |
| — | Step Functions and Lambda unit prices for `eu-west-1` | the comparison gives transition counts and deliberately no prices |

### Group C — one live run in a scratch account

These need something created, so they need a place where creating is safe. One
end-to-end provision answers all three.

| # | item | what the run measures |
| - | ---- | --------------------- |
| 3 | Typical and worst-case duration of the ingestion job | sizes the poll interval and any timeout — and it is the number that decides whether a Lambda orchestrator is viable at all |
| 4 | Whether a prefix wildcard on `s3vectors` index ARNs is accepted as ADR 0021 (b) assumes | if it is not, the KB role has to be amended per app and 0021 reverts to (d) |
| — | Whether the real `textPromptTemplate` limit is 4000, 4096, or higher | send templates of 4000, 4064 and 4097 characters and see which are refused. See Q43 — the three authorities disagree |

### Group D — EB and the ethics committee, not a lookup

| # | item | why it is not technical |
| - | ---- | ---------------------- |
| 8 | Whether `AES256` suffices for the vector store and the bucket, or a customer-managed key is required | a hospital's data-classification rules are not in any API |

**Suggested order:** B first, because it is free and it may collapse option C in the
orchestration comparison before any effort goes into it. Then A, because it is a
five-minute console visit that settles 0020. Then C, which is the only group that costs
real work. D can run in parallel with all of them.

## 9. What this recipe does not cover

Deliberately out of scope, and each has its own home:

- The chat-history table (spec B5) and the registry row (B6) — not KB work.
- The subdomain (B7) — draft ADR 0012.
- `prompt/vN.txt` — draft ADR 0022.
- Whether app #1 is migrated onto this path at all — draft ADR 0018. If it is not,
  this recipe describes apps #2 onward and app #1 keeps its console-built KB.
