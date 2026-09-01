# 0030 — One door: the factory provisions an S3 data source

Status: DRAFT — not accepted. EB decides.
Date: 2026-08-31

Closes `QUESTIONS.md` Q1 **for the factory**. It does not touch the separate
question of which door Gali production actually uses, which is being investigated
elsewhere and is deliberately not acted on here.

## Context

A Bedrock Knowledge Base can be fed two ways, and the repo has been carrying both:

| | S3 data source | CUSTOM data source |
| - | -------------- | ------------------ |
| how documents arrive | written to a bucket prefix, then Bedrock crawls it | pushed with `IngestKnowledgeBaseDocuments`, inline |
| what the spec says | **this one** — *"`source = s3://<app>/kb/`"*, one markdown file per section under `kb/` | not mentioned at all |
| what app #1 uses | — | **this one**, `dataSourceConfiguration.type: CUSTOM`, confirmed against AWS 2026-08-31 |
| unit of ingestion | the **whole data source** — `StartIngestionJob` takes a `dataSourceId` and nothing narrower | **one document**, upsert keyed on `customDocumentIdentifier.id` |

That difference in the last row is the whole content of this ADR. It is visible in
the API surface itself: `StartIngestionJob` takes `knowledgeBaseId`, `dataSourceId`,
`clientToken` and `description` — **there is no document, file, key or prefix
parameter** (botocore `bedrock-agent` `2023-06-05`). You cannot ask an S3 data source
to re-ingest one file, because the API has nowhere to put the file's name.

## Decision

**Generic Gali follows the HTML spec: an S3 data source, provisioned by the factory,
and no second path.**

- `dataSourceConfiguration.type: S3`, `s3Configuration.bucketArn` pointing at the
  app's own bucket, `inclusionPrefixes: ["kb/"]`.
- The factory creates it as part of provisioning (`docs/kb-provisioning-recipe.md`,
  step K-6). No app is ever wired to a CUSTOM source by the factory.
- One door. Not "S3 by default with CUSTOM available" — two ingestion paths into one
  KB means two code paths, two failure modes, and a Data Center whose behaviour
  depends on which door its app happens to use.

## Reasoning

Three reasons, in order of weight.

**The spec is the source of truth and it says S3.** The architecture document
describes `kb/` as the bucket prefix, one markdown file per data section, and the
data source pointing at it. Choosing CUSTOM would mean the factory's central
storage story disagrees with the document that defines the factory.

**The bucket is already the source of truth, and CUSTOM makes that a lie.** The
spec's stated principle is that the markdown files in the bucket *are* the knowledge
base, and that a content fix is made in the file and re-ingested — never patched into
a prompt. With an S3 data source that is literally true: the bucket is the input and
Bedrock reads it. With CUSTOM, the bucket is a copy and the real input is whatever
was last pushed through the API, so the two can silently diverge — and Gali has
already demonstrated exactly that divergence in a different field
(`contains_emotional_support`, `scripts/ingest_kb.py:115`).

**CUSTOM has no reconciliation story.** Bedrock stores only chunked, embedded text
for a CUSTOM document; there is no "get original document" API. App #1 needs a
whole verification harness to answer "does the index still match the files"
(`scripts/kb_verify_reconstruct.py`, which pulls chunks back and stitches them to
approximate the original). An S3 data source makes that question mostly moot,
because the crawl target is the file.

The cost is real and it is the next section.

## The consequence: per-file re-embedding is not available

**With an S3 data source, ingestion runs per data source. The Data Center therefore
cannot offer per-file re-embedding.** There is no API for it.

This reverses a correction made earlier in the log, and the reversal should be
traceable:

- ADR 0015 originally said per-file re-embedding might be impossible, because Bedrock
  ingestion runs per data source.
- That was then corrected — *"false for app #1, whose CUSTOM data source upserts per
  document"* — which was true, and true **only because of CUSTOM**.
- This ADR chooses S3. So the original objection is restored: the constraint is real
  for the factory, and it was never about Bedrock in general. It is about which door.

What that does to the UI, concretely:

- **`E8` `reembedFile(appName, path)` cannot exist as specified.** It has to become
  `reingestKnowledgeBase(appName)` — an operation on the data source.
- **The control moves off the file row.** A per-file button that triggers a
  whole-corpus re-ingestion is a lie about scope, and the kind of lie that gets
  clicked twenty times.
- **Save and re-embed remain two distinct actions**, which the spec is firm about and
  this ADR does not change. What changes is only the *scope* of the second one: save
  is per file, re-ingest is per app.
- **The ingestion-status UI gets simpler**, not harder. One job per app at a time
  instead of one per file, so `getIngestionStatus` has a single subject and the
  "pending" state the spec asks for is a property of the app.

The label and placement of that control are Prompt 3's business and are **queued as
Q32**, not decided here — a wording choice that appears in the UI is not a structural
decision, but it is also not mine to invent.

## Options considered

1. **S3 only.** This decision.
2. **CUSTOM only**, matching app #1. Keeps per-document ingestion and per-file
   re-embedding; contradicts the spec, makes the bucket a copy, and needs the
   reconstruct-and-compare harness to stay honest.
3. **Both, chosen per app.** Per-file re-embedding where it is wanted; two ingestion
   paths, two rollbacks, a Data Center that behaves differently per app, and a new
   `AppConfig` field whose value changes what the UI can do.
4. **S3 plus a CUSTOM source on the same KB** for single-document updates. Bedrock
   permits multiple data sources, so this is technically available — and it means two
   sources of the same document, with nothing to reconcile them. Rejected as the worst
   of both.

## Consequences

- The provisioning recipe's K-6 is S3, with `inclusionPrefixes: ["kb/"]` —
  already written that way in `docs/kb-provisioning-recipe.md`.
- **The KB service role needs `s3:GetObject` and `s3:ListBucket`** on the app bucket.
  App #1's role has neither, because a CUSTOM source is pushed to rather than read
  from. That is draft ADR 0021's question, and this decision is what makes it
  unavoidable.
- Checklist `R5`, `R6`, `E8`, `U10` and `U11` all move: the spec's description becomes
  correct for the factory, and the per-file re-embedding row becomes a per-data-source
  row.
- `services/factoryApi.ts` loses `reembedFile(appName, path)` and gains
  `reingestKnowledgeBase(appName)`. That is a change to the surface draft ADR 0015
  proposes, so 0015 should be accepted after this one, not before.
- **Deleting a file becomes meaningful in a new way.** With S3, removing an object
  and re-ingesting is how a document leaves the knowledge base; `dataDeletionPolicy`
  on the data source governs what happens to its vectors. With CUSTOM it was a
  per-document delete call. So 0015's `deleteFile` gains a second step.
- Q1 is closed for the factory. The production question stays open and untouched: if
  the investigation concludes that app #1 keeps its CUSTOM source, then app #1 and the
  factory use different doors and that is 0018's problem, not this ADR's.
