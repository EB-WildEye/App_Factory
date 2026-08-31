# Decision log

One file per decision, `NNNN-short-title.md`, numbered in the order the decision
was taken (not the order it was written down). Every file has the same five
headings:

```
Status: accepted | open | DRAFT | superseded by NNNN
Date: YYYY-MM-DD

## Context
## Options considered
## Decision
## Reasoning
## Consequences
```

A **DRAFT** carries a `## Recommendation` in place of `## Reasoning`: the analysis
is written up and a pick is argued for, but `## Decision` stays open until EB
accepts it. A draft is not a soft accept — the recommendation is worth exactly as
much as the argument in it, and nothing depends on it in code.

## Rules

- **Cheap to reverse** — decide, log it, keep going. Do not stop.
- **Expensive to reverse** — schema fields, route shapes, resource naming,
  anything the architecture spec marks TBD: STOP. Log it with `Status: open`,
  lay out the options, then ask. Never pick a default silently.
- An `open` or `DRAFT` ADR blocks the code that depends on it and nothing else.
- Read this directory before any structural change.
- A question waiting on EB is also queued in `QUESTIONS.md` at the repo root, with
  the ADR number named. The ADR carries the analysis; that file carries the ask.

## Index

| # | Title | Status |
| - | ----- | ------ |
| [0001](0001-fresh-repo-gali-read-only.md) | Fresh repo, Gali read-only | accepted |
| [0002](0002-sam-as-iac.md) | SAM as IaC | accepted |
| [0003](0003-gui-first.md) | GUI built first, its output is the backend spec | accepted |
| [0004](0004-nextjs-bun-over-vite.md) | Next.js + Bun over Vite | accepted |
| [0005](0005-bff-over-browser-to-api-gateway.md) | BFF over browser-to-API-Gateway | accepted |
| [0006](0006-backend-step-count-7-vs-6.md) | Backend step count: 7 vs 6 | DRAFT |
| [0007](0007-registry-row-field-names.md) | Registry row field names | accepted |
| [0008](0008-appconfig-field-names.md) | AppConfig field names and casing | accepted |
| [0009](0009-rules-placement.md) | Where `rules` live | accepted |
| [0010](0010-data-file-structure.md) | Data file structure a creator must supply | DRAFT |
| [0011](0011-disclaimer-format-and-storage.md) | Disclaimer format and storage | DRAFT |
| [0012](0012-subdomain-record-and-certificate.md) | Subdomain record type and certificate | DRAFT |
| [0013](0013-rollback-ownership.md) | Rollback ownership on partial create | DRAFT |
| [0014](0014-create-app-async-vs-sync.md) | createApp: 202 async vs synchronous ids | DRAFT |
| [0015](0015-factory-api-route-shapes.md) | factoryApi route shapes | DRAFT |
| [0016](0016-composed-prompt-length-cap.md) | Composed prompt has a hard 4096-character cap | accepted |
| [0017](0017-bun-test-as-test-runner.md) | Bun test as the test runner | accepted |
| [0018](0018-gali-as-exception-or-migration.md) | Gali: exception, or migration to what the factory produces | DRAFT |
| [0019](0019-factory-region.md) | The factory's AWS region | DRAFT |
| [0020](0020-kb-vector-store.md) | The Knowledge Base vector store | DRAFT |
| [0021](0021-kb-data-access-role.md) | The IAM role the KB uses to read an app's bucket | DRAFT |
| [0022](0022-prompt-version-policy.md) | Who increments the prompt version, and when | DRAFT |
| [0023](0023-ui-template-values.md) | The set of valid `uiTemplate` values | DRAFT |
| [0024](0024-admin-authentication-model.md) | The admin authentication model | DRAFT |
| [0025](0025-app-name-and-bucket-naming-law.md) | `appName` is S3 naming law, and it is permanent | DRAFT |
| [0026](0026-partial-app-delete-semantics.md) | Deleting a partial app | DRAFT |
| [0027](0027-kb-document-metadata-schema.md) | The per-document KB metadata schema | DRAFT |

## Coupled decisions

Accepting one of these without the others leaves the set inconsistent.

| group | ADRs | why |
| ----- | ---- | --- |
| provisioning lifecycle | 0006, 0013, 0014, 0015, 0026 | the step count, the state vocabulary, what `createApp` returns, the routes that report it, and what delete does with a partial app are one design |
| the app's name | 0007, 0019, 0025 | `appName` is the partition key, the bucket name and a DNS label, in one region |
| the knowledge base | 0010, 0020, 0021, 0027 | document structure, vector store, data-access role and metadata schema |
| app #1 | 0009, 0016, 0018, 0022 | whether Gali is composed or imported decides what the cap and the version policy apply to |
