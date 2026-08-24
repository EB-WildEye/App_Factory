# Decision log

One file per decision, `NNNN-short-title.md`, numbered in the order the decision
was taken (not the order it was written down). Every file has the same five
headings:

```
Status: accepted | open | superseded by NNNN
Date: YYYY-MM-DD

## Context
## Options considered
## Decision
## Reasoning
## Consequences
```

## Rules

- **Cheap to reverse** — decide, log it, keep going. Do not stop.
- **Expensive to reverse** — schema fields, route shapes, resource naming,
  anything the architecture spec marks TBD: STOP. Log it with `Status: open`,
  lay out the options, then ask. Never pick a default silently.
- An `open` ADR blocks the code that depends on it and nothing else.
- Read this directory before any structural change.

## Index

| # | Title | Status |
| - | ----- | ------ |
| [0001](0001-fresh-repo-gali-read-only.md) | Fresh repo, Gali read-only | accepted |
| [0002](0002-sam-as-iac.md) | SAM as IaC | accepted |
| [0003](0003-gui-first.md) | GUI built first, its output is the backend spec | accepted |
| [0004](0004-nextjs-bun-over-vite.md) | Next.js + Bun over Vite | accepted |
| [0005](0005-bff-over-browser-to-api-gateway.md) | BFF over browser-to-API-Gateway | accepted |
| [0006](0006-backend-step-count-7-vs-6.md) | Backend step count: 7 vs 6 | open |
| [0007](0007-registry-row-field-names.md) | Registry row field names | open |
| [0008](0008-appconfig-field-names.md) | AppConfig field names and casing | accepted |
| [0009](0009-rules-placement.md) | Where `rules` live | accepted |
| [0010](0010-data-file-structure.md) | Data file structure a creator must supply | open |
| [0011](0011-disclaimer-format-and-storage.md) | Disclaimer format and storage | open |
| [0012](0012-subdomain-record-and-certificate.md) | Subdomain record type and certificate | open |
| [0013](0013-rollback-ownership.md) | Rollback ownership on partial create | open |
| [0014](0014-create-app-async-vs-sync.md) | createApp: 202 async vs synchronous ids | open |
| [0015](0015-factory-api-route-shapes.md) | factoryApi route shapes | open |
| [0016](0016-composed-prompt-length-cap.md) | Composed prompt has a hard 4096-character cap | accepted |
