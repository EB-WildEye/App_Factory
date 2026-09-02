# 0020 — The Knowledge Base vector store

Status: DRAFT — not accepted. EB decides.
Date: 2026-08-31
**Rewritten 2026-09-01** on the S3 Vectors basis. The original version weighed four
stores, recommended a shared OpenSearch Serverless collection, and built its argument
on a minimum billed capacity per collection. Reading AWS showed the store is neither
OpenSearch nor any of the other three, and that the cost premise does not apply. The
recommendation reverses. The superseded reasoning is summarised at the end rather than
deleted, because how a wrong recommendation was reached is worth keeping.

Checklist rows `N2` / `P4`.

## Context — what AWS actually reports

Read 2026-08-31 from KB `CHAU7BWP4S`, commands and full output in
`docs/gali-ground-truth.md` §9.

| fact | value |
| ---- | ----- |
| `storageConfiguration.type` | **`S3_VECTORS`** |
| index | `arn:aws:s3vectors:eu-west-1:973938718804:bucket/bedrock-knowledge-base-ib3awf/index/bedrock-knowledge-base-default-index` |
| vector bucket | `bedrock-knowledge-base-ib3awf`, created 2026-04-19, `AES256` |
| `dimension` | `1024` — confirms the spec |
| `dataType` | `float32` — the `s3vectors` model's enum has exactly one member |
| `distanceMetric` | **`euclidean`** — the spec never mentions a metric |
| non-filterable metadata keys | `AMAZON_BEDROCK_TEXT`, `AMAZON_BEDROCK_METADATA` |

Both names look console-generated, which fits: `CreateKnowledgeBase`'s
`storageConfiguration` is **optional** in the API model, and omitting it appears to be
what left app #1 with a bucket and index nobody named.

The five parameters the spec calls fixed are **all confirmed**: `HIERARCHICAL`, parent
500, child 150, `cohere.embed-multilingual-v3`, dimension 1024. The original version of
this ADR was written when none of them could be checked, and its alarm on that point is
now withdrawn.

## What S3 Vectors changes about the decision

**The question is no longer *which store*.** App #1 answered that, and a factory that
chose differently would be provisioning a configuration app #1 has never run on. The
question left is *one index for all apps, or one index per app*.

And the original argument for sharing is void. It rested on OpenSearch Serverless
billing a minimum capacity per collection, which made per-app collections scale cost
linearly with app count. **S3 Vectors has no capacity floor** — it is S3-backed
storage, with no cluster and nothing provisioned. So the thing that made isolation
expensive is not present.

## Options considered

1. **One shared index for every app**, with app identity in each vector's metadata and
   every query carrying a metadata filter.
2. **One index per app**, in a shared vector bucket.
3. **One vector bucket per app**, each with one index.

## Recommendation

**Option 2 — one S3 Vectors index per app, in a shared vector bucket** — with
`dimension: 1024`, `dataType: float32`, `distanceMetric: euclidean`, in the factory's
single region (0019).

Four reasons, in order of weight:

1. **A missing filter in option 1 is a cross-app data leak, and it fails silently.**
   With one shared index, correctness depends on every query carrying the right
   metadata filter. Forget it once and an app answers from another app's knowledge
   base — with no error, and plausible-looking output. In a medical setting that is
   one department's protocol answering for another's. Per-app indexes make that
   failure impossible by construction rather than by discipline.
2. **Teardown becomes one call.** `DeleteIndex` removes an app's vectors completely.
   Under option 1, deleting an app means deleting its vectors *out of* a shared index
   — a filtered delete, on a store whose delete API works per vector key, and any
   miss leaves a fragment that can still be retrieved.
3. **The cost argument that favoured sharing is gone**, so isolation is close to free.
   Storage is proportional to vectors either way; the per-collection floor that made
   option 2 look expensive does not exist here.
4. **Option 3 buys nothing over option 2** and adds a bucket per app to create, name
   and delete. Bucket-level isolation would only matter for per-tenant encryption keys
   or separate access policies, and the factory is single-tenant.

**What would change the recommendation, and it is unresolved:** a per-vector-bucket
**index quota**. If a shared bucket caps the number of indexes below the number of apps
the factory expects, option 2 needs option 3's bucket-per-app after all, or a bucket per
N apps. Quotas are not in the service model and no API reports them — it is a Service
Quotas console visit or a support ticket, routed as Group A in
`docs/kb-provisioning-recipe.md` §8. **This is the one thing to check before accepting
this ADR.**

## Consequences

Rewritten to reflect what holds now, not what the original version assumed.

- **`euclidean` becomes a factory constant, and it is the sharpest consequence here.**
  `CreateIndex` requires `distanceMetric` and offers no default; the enum is
  `euclidean | cosine`. App #1 is `euclidean`. Nothing in the spec, the build plan or
  any other ADR mentions a distance metric, and **cosine is the more common default for
  text embeddings** — so a factory built from the spec alone would create indexes that
  retrieve differently from app #1 on identical vectors, with no error to notice.
  Checklist `N14`.
- **`dimension` belongs to the index, not to the knowledge base.**
  `get-knowledge-base` returns no dimension at all; `embeddingModelConfiguration`
  carries only `embeddingDataType: FLOAT32`. A factory passing `dimensions: 1024` to
  `CreateKnowledgeBase` is passing it to the wrong call. The number is right and its
  home is not.
- **A shared vector bucket is platform infrastructure**, created once before app #1,
  alongside the KB service role (0021). Two platform prerequisites the spec never
  mentions.
- **The create sequence gains an index step before the KB step**, because
  `CreateKnowledgeBase` needs the `indexArn`. That is step K-2 in the provisioning
  recipe, and its compensating action is `DeleteIndex`.
- **Rollback is cleaner than the original version feared.** It worried that "the vector
  store may survive the KB". With an index per app, the index is the app's, so the
  rollback is `DeleteKnowledgeBase` then `DeleteIndex`, and the shared bucket is
  untouched.
- **`VECTOR_INDEX_QUOTA_EXCEEDED` is a real error code** in 0032's dictionary precisely
  because the quota is unknown. If Group A comes back with a low number, that code will
  be the one that fires.
- **`AES256` is what app #1 uses** on both the vector bucket and the index. Whether a
  customer-managed key is required is a data-classification question for EB and the
  committee, not a technical one — Group D.
- **Cost is no longer a differentiator between the options**, so it should not be used
  to reopen this. The recurring cost of an app is dominated by storage and by the
  chat table, and both are identical under all three options.

## What the superseded version argued, and why it was wrong

Kept because the failure mode is instructive.

The original weighed **shared OpenSearch Serverless, per-app OpenSearch Serverless,
Aurora with pgvector, and a managed third party**, and recommended the first. The
reasoning was sound given its premise: OpenSearch Serverless bills a minimum capacity
per collection, so a collection per app multiplies a fixed floor by the app count, and
sharing was the only option whose cost did not scale with an app count nobody had
forecast.

The premise was the problem. **None of the four options was the store app #1 actually
uses**, and the ADR said so itself — it recorded that Gali's KB was created outside the
repo and that the store was therefore invisible. It then reasoned about the store anyway
rather than treating "I cannot see it" as a blocker. One `get-knowledge-base` call, which
needed no permission the account did not already have, would have replaced four options
with a fact.

The lesson is narrow and worth stating: **when an ADR records that it cannot see
something, the next step is to look, not to weigh options about it.**
