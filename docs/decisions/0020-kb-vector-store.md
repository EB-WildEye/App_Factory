# 0020 — The Knowledge Base vector store

Status: DRAFT — not accepted. EB decides.
Date: 2026-08-31
Amended: 2026-08-31, after reading AWS. **The store is S3 Vectors, which is none of
the four options below, and the cost argument in the original recommendation does
not apply to it.** Read the amendment before the options.

## Amendment — what AWS actually says

Read 2026-08-31 from KB `CHAU7BWP4S` (commands and full output in
`docs/gali-ground-truth.md` §9):

| fact | value |
| ---- | ----- |
| `storageConfiguration.type` | **`S3_VECTORS`** |
| index | `arn:aws:s3vectors:eu-west-1:973938718804:bucket/bedrock-knowledge-base-ib3awf/index/bedrock-knowledge-base-default-index` |
| vector bucket | `bedrock-knowledge-base-ib3awf`, created 2026-04-19, `AES256` |
| dimension | `1024` — **confirms** the spec |
| data type | `float32` |
| distance metric | **`euclidean`** — the spec never mentions one |

And the five parameters the spec calls fixed are **all confirmed**: `HIERARCHICAL`,
parent 500, child 150, `cohere.embed-multilingual-v3`, 1024. The context section
below was written when none of them could be checked; that is no longer true.

What this changes about the decision:

1. **The four options below are the wrong four.** S3 Vectors is not OpenSearch
   Serverless, Aurora, or a third party. It is S3-backed vector storage: no
   cluster, no collection, no provisioned capacity.
2. **The recommendation's central argument is void.** It rested on OpenSearch
   Serverless having a minimum billed capacity per collection, which made
   per-app collections scale cost linearly with app count. **S3 Vectors has no
   capacity floor**, so "one store per app" stops being the expensive option and
   the cost case for sharing largely evaporates.
3. **The remaining question is smaller and better.** Not *which store* — app #1
   answered that — but *one index for all apps, or one index per app*. With no
   capacity floor, per-app indexes buy isolation, per-app deletion at teardown, and
   a metadata filter the factory does not have to get right, at close to no extra
   cost. That is a real reversal of the original recommendation.
4. **A new parameter appears that nobody had on the list.** `euclidean`. It is not
   in the spec, the build plan, or any ADR. Creating factory indexes with cosine —
   the more common default for text embeddings — would retrieve differently from
   app #1 on identical vectors, with nothing to notice. Now checklist `N14`.

**Revised recommendation: one S3 Vectors index per app, `dimension: 1024`,
`float32`, `distanceMetric: euclidean`, in the factory's single region.** The
original recommendation (shared collection) is withdrawn — it was correct
reasoning about a store this factory is not using.

What is still not answerable from AWS: whether a single vector *bucket* holding
many indexes hits any per-bucket index quota. That is a limits question for the
AWS console or support, not something the API tells you, and it is the one thing
that could push the decision back toward sharing.

Checklist row `N2` / `P4`. A gap, and the most expensive one in the log.

## Context

A Bedrock Knowledge Base cannot exist without a vector store. The architecture
spec never mentions one. It fixes five KB parameters — chunking `hierarchical`,
parent 500 tokens, child 150 tokens, embeddings
`cohere.embed-multilingual-v3`, dimensions 1024 — and is silent on the store those
vectors go into.

**Gali cannot answer it.** Its KB, `CHAU7BWP4S`, is a SAM *parameter*
(`template.yaml:39-41`), created outside the stack, so nothing about its internals
is in the repo. Reading both repos found **none of the five spec values either** —
no chunking configuration, no embedding model id, no dimension count anywhere
outside `.venv/` (`docs/gali-ground-truth.md`, "What is not in the Gali repos",
items 1–6). `ARCHITECTURE.md:49,88` describes it as one opaque box: *"Bedrock
Knowledge Base (managed embeddings)"*, *"vector store + embeddings"*.

Why this is expensive rather than merely missing:

- **Cost.** OpenSearch Serverless has a minimum billed capacity per collection.
  One collection per app multiplies that by the number of apps; one shared
  collection with per-app indexes does not. This is the single largest recurring
  cost decision in the factory and it is currently unmade.
- **Provisioning time.** An OpenSearch Serverless collection takes minutes to
  become active. If B4 creates one per app, create is minutes long before
  ingestion even starts, which changes 0014's progress view from a nicety to a
  requirement.
- **Rollback.** 0006's table already notes that *"the vector store behind the KB
  may not be deleted with it"*. A shared store makes deletion a per-index
  operation; a per-app store makes it another resource to unwind, and a leaked
  collection is a leaked bill.
- **Quotas.** There are account limits on collections. A per-app store makes the
  number of apps the factory can host a function of a quota nobody has looked up.

## Options considered

1. **One shared OpenSearch Serverless collection, one index per app.** Cheapest,
   fastest to provision, one quota to watch. Blast radius shared: an operation on
   the collection affects every app.
2. **One OpenSearch Serverless collection per app.** Full isolation, per-app cost
   and per-app quota consumption, minutes added to create, one more thing to
   delete.
3. **Aurora PostgreSQL with pgvector**, shared, schema per app. Cheaper at scale
   than serverless collections, and a database to operate.
4. **A managed third-party store** (Pinecone and similar). Removes the operational
   burden, adds a vendor and a data-residency question that a hospital's ethics
   committee will ask about.

## Recommendation

**Option 1 — one shared OpenSearch Serverless collection, one index per app —
and read the real values off `CHAU7BWP4S` before anything is provisioned.**

The recommendation on the store is the easy half: shared is the only option whose
cost does not scale linearly with an app count nobody has forecast, and per-app
isolation is not obviously worth paying for when every app in the factory belongs
to the same operator.

The hard half, and the reason this ADR is worth reading: **the five KB parameters
the spec states as fixed are unverified against app #1.** The spec asserts them;
neither Gali repo contains them; the KB predates the repo. So a factory that
provisions a KB with `hierarchical` 500/150 and `cohere.embed-multilingual-v3` at
1024 dimensions is provisioning a configuration **that has never been tested
against Gali's corpus or its 380-question validation set**. If the real KB differs
in even the embedding model, then "generic-Gali reproduces Gali" is false at the
retrieval layer, and it will show up as subtly worse answers rather than as an
error.

Concretely, before any provisioning code: run
`aws bedrock-agent get-knowledge-base --knowledge-base-id CHAU7BWP4S` and
`get-data-source` for both data source ids in `QUESTIONS.md` Q1, and record the
actual chunking strategy, embedding model, dimensions and vector store in
`docs/gali-ground-truth.md`. That is a five-minute console read that either
confirms the spec or invalidates five "fixed for every app" values.

## Consequences

- Until the console read happens, the KB parameters in the checklist are marked
  `spec` on the spec's authority alone, and `docs/gali-ground-truth.md` lists all
  five as **not found**. No constant for any of them exists in
  `lib/gali/constants.ts`, deliberately.
- A shared collection means B4 creates an index, not a collection, so the factory
  needs the collection to exist as platform infrastructure before app #1 — a
  second thing SAM has to own beyond the API (0002).
- 0006's step count is unaffected either way; 0013's rollback gains an index delete.
- If the console read contradicts the spec, 0018 gets harder: reproducing Gali
  would then include reproducing a KB configuration the spec says is wrong.
