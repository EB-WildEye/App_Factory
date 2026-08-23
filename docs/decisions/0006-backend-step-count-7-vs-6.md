# 0006 — Backend step count: seven or six

Status: open
Date: 2026-08-23

## Context

The spec counts the backend steps two different ways.

- Services section, "Provisioning service" card: *"Runs seven steps in a fixed
  order; a failure halfway leaves orphans, so each step needs to be
  reversible."*
- Live flow lede: *"Eleven steps: four in the frontend, one handoff, six in the
  backend."*

The spec's own `FLOW` data is unambiguous: **F1, F2, F3, F4** in the frontend
lane and **B1, B2, B3, B4, B5, B6, B7** in the backend lane. Eleven stations,
seven of them backend. F4 (`POST /apps`) is *the handoff*, and it sits in the
frontend lane.

So the lede's arithmetic reaches eleven by counting F4 twice: four frontend
stations *plus* a handoff that is one of those four, which forces the backend
down to six to keep the total right.

Every backend step that creates or mutates a real AWS resource, with the
compensating action that would undo it:

| # | Step | Creates / mutates | Compensating action |
| - | ---- | ----------------- | ------------------- |
| B1 | `create_bucket` | S3 bucket named after the app | `delete_bucket`, only after the bucket is emptied |
| B2 | `put_object` × N to `kb/` | the markdown knowledge files | `delete_objects` for every key written |
| B3 | assemble prompt, write `prompt/v1.txt` | a versioned S3 object | `delete_object` — but versioning means the *version* is what must go |
| B4 | `create_knowledge_base`, `create_data_source`, `start_ingestion_job` | Bedrock KB, Data Source, vector index, embeddings | `delete_data_source` then `delete_knowledge_base`; an in-flight job needs stopping first, and the vector store behind the KB may not be deleted with it |
| B5 | `create_table` | DynamoDB chat-history table `<app>-chat` | `delete_table` |
| B6 | `put_item` | one factory-registry row | `delete_item` |
| B7 | subdomain record | DNS record, and a certificate | TBD — see 0012. Nothing can be written about undoing this until the record type is chosen |

**Assessment, for confirmation not decision:** the discrepancy looks like a
prose miscount in the lede, not a missing step. Every one of B1–B7 is present in
the spec's own flow data, so there is no resource-creating step that no count
knows about. But two things follow from it that are not miscounts:

- B7 is both the TBD step *and* the difference between seven and six. If any
  reader resolves the discrepancy by treating the backend as six steps, the
  subdomain step drops out of the sequence — and the one step whose rollback is
  undefined is the one that stops being counted.
- **B3 is the step most at risk of being orphaned**, not B7. It is the only
  backend step that neither creates a named resource nor appears in the registry
  row, so it is the easiest to omit from any "resources to delete" list — while
  still leaving a real object, `prompt/v1.txt`, in the bucket. It happens to be
  covered by emptying the bucket at B1's rollback, but only if that rollback
  empties the whole bucket rather than just the keys B2 wrote.

## Options considered

1. **Seven backend steps is correct**; the live-flow lede is wrong and should
   read "three in the frontend, one handoff, seven in the backend".
2. **Six backend steps is correct**; B7 (subdomain) is deliberately outside the
   provisioning sequence because it is TBD, and the "seven" in the services card
   counts it prematurely.
3. **There is a real eighth step** not drawn in the flow — for example the IAM
   role the Bedrock KB needs to read the bucket, or the vector-store index
   creation implied by B4.

## Decision

Open. Not resolved here.

## Reasoning

Pending.

## Consequences

Pending. Whatever is chosen, the count must be stated in exactly one place and
the rollback table above must cover every step in it — a resource-creating step
that no count knows about is an orphan nobody deletes.
