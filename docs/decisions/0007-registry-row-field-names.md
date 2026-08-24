# 0007 — Registry row field names

Status: accepted
Date: 2026-08-23

## Context

Two sources describe the factory-registry row and they do not agree.

The architecture spec, step B6, shows the row as written:

```json
{
  "ui_id":      "clinic-rtl",
  "app_name":   "gali-ivf",
  "dynamo_id":  "gali-ivf-chat",
  "kb_id":      "CHAU7BWP4S",
  "created_at": "2026-08-06T09:14:02Z"
}
```

The build plan states: *"A registry row per the spec is: uiId, appName,
dynamoTableId, knowledgeBaseId."*

Three separate conflicts:

1. **Casing** — `snake_case` in the spec, `camelCase` in the build plan.
2. **Names** — `dynamo_id` vs `dynamoTableId`, `kb_id` vs `knowledgeBaseId`.
   These are not casing variants of each other.
3. **Cardinality** — the spec has five fields, the build plan four. `created_at`
   is absent from the build plan. The spec's services card lists only four
   ("ui id, app name, Dynamo id, KB id"), so `created_at` appears in the flow
   data and nowhere else.

This is a DynamoDB row, so it is expensive to reverse: the field names are the
persisted attribute names, and renaming them later means migrating live rows for
every app already provisioned.

Related but separate: nothing in the spec says which attribute is the table's
partition key. `app_name` is described as "the key that ties bucket, table and
registry row together", and `ui_id` appears first in the row, which is the
position a key conventionally occupies. That needs settling with the names.

## Options considered

1. **snake_case as the spec shows it**, five fields including `created_at`. The
   wire format and the stored format match; the TypeScript type is
   `snake_case`, or a serializer maps at the boundary.
2. **camelCase as the build plan states**, with the serializer converting to
   `snake_case` on the way to the backend. TypeScript stays idiomatic, one
   mapping layer exists.
3. **camelCase end to end**, treating the spec's `snake_case` as illustrative
   Python-flavoured pseudocode rather than the contract.

Orthogonal, and needed either way:

- Is `created_at` in the row? (spec flow: yes. spec services card: no. build
  plan: no.)
- Which attribute is the partition key — `app_name` or `ui_id`?
- Is `ui_id` the UI *template* identifier, as its value `clinic-rtl` suggests
  and as `ui_template` in `app.config.json` implies, or a unique row id? If it
  is the template name it is not unique per app and cannot be the key.

## Decision

The registry row is exactly these five attributes, `snake_case` as stored, per
0008:

| attribute | role |
| --------- | ---- |
| `app_name` | **partition key** |
| `ui_id` | ordinary attribute, holds the UI template name |
| `dynamo_table_id` | the chat-history table |
| `knowledge_base_id` | the Bedrock KB |
| `created_at` | ISO 8601 |

Casing follows 0008: `snake_case` on the wire and in the stored DynamoDB
attributes, `camelCase` in TypeScript, translated once inside the route handlers.
So the TypeScript type is `appName`, `uiId`, `dynamoTableId`, `knowledgeBaseId`,
`createdAt`.

The two names that differed by more than casing are resolved toward the
descriptive form: **`dynamo_table_id`** and **`knowledge_base_id`**, not the
spec's `dynamo_id` / `kb_id`.

Two attributes are deliberately **not** in the row yet, and neither is blocked by
this ADR: provisioning state (checklist `G7`, decided with 0013) and the app
address (`G8`, decided with 0012). Both are additive — a new attribute on a
DynamoDB row costs nothing, unlike the key.

## Reasoning

`app_name` is the only viable key. The spec already calls it *"the key that ties
bucket, table and registry row together"*, and it is unique per app by
construction: it is the S3 bucket name, and S3 bucket names are globally unique.
`ui_id`'s position first in the spec's JSON sample is formatting, not a key
declaration — and its value `clinic-rtl` is a template name, so two apps from the
same template would collide on it immediately.

`dynamo_table_id` and `knowledge_base_id` over `dynamo_id` and `kb_id` because
`dynamo_id` does not say *which* Dynamo thing it identifies — the factory has two
DynamoDB tables in play per app, the chat-history table and the registry itself,
and an attribute called `dynamo_id` sitting inside the registry is ambiguous about
which one it means. `kb_id` is merely terse; expanding it keeps the row readable
without abbreviation rules.

`created_at` costs one attribute and answers the first question anyone asks of a
partial or failed row: when did this appear.

## Consequences

- **A partition key cannot be changed without rebuilding the table.** There is no
  rename and no in-place migration: it means creating a new table, copying every
  row, and repointing every reader. For the only record of which apps exist, that
  is a migration with an outage in it. This is the most expensive line in this ADR
  and it is why the key was settled before any code reads the table.
- `appName` is the lookup key, so `getApp(appName)` (checklist `E12`) is a
  `GetItem`, not a scan. `listApps()` remains a scan and will need a pagination
  story eventually.
- Because `appName` keys the registry *and* names the S3 bucket, S3 bucket naming
  law is the real constraint on `appName` validation in the zod schema — lowercase,
  DNS-safe, globally unique (checklist `N8`). A name collision is a create failure
  that still needs an error message.
- The registry-row type, `listApps()`'s return type, and the App list columns are
  unblocked.
- The mapper in `app/api` now has a concrete first table to encode, and
  `dynamo_table_id` ↔ `dynamoTableId` is a pure casing transform, which keeps the
  mapper mechanical rather than a lookup table of special cases.

## Reasoning

`app_name` is the only candidate. The spec already calls it *"the key that ties
bucket, table and registry row together"*, and it is the one value that is unique
per app by construction — it is the S3 bucket name, and S3 bucket names are
globally unique. `ui_id`'s position first in the spec's JSON sample is
conventional formatting, not a key declaration.

`created_at` costs one attribute and answers "when did this app appear", which is
the first question asked of any partial or failed row.

## Consequences

- **A partition key cannot be changed without rebuilding the table.** There is no
  rename and no in-place migration: it means creating a new table, copying every
  row, and repointing every reader. For a table that is the only record of which
  apps exist, that is a migration with an outage in it. This is the most
  expensive single line in this ADR and it is why the key is settled before any
  code reads the table.
- `appName` is the lookup key for `getApp(appName)` (checklist `E12`), so reading
  one app is a `GetItem`, not a scan.
- Because `appName` keys the registry *and* names the S3 bucket, S3 bucket naming
  law is the real constraint on `appName` validation in the zod schema — lowercase,
  DNS-safe, globally unique (checklist `N8`). A name collision is a create failure
  that still needs an error message.
- The registry-row type, `listApps()`'s return type, and the App list columns stay
  blocked on the two remaining names.
