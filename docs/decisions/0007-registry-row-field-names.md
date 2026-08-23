# 0007 — Registry row field names

Status: open
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

Still **open** overall. Three of the four sub-questions are settled; the fourth,
which is the one this ADR is titled after, is not.

**Settled — casing.** Answered by 0008: `snake_case` on the wire and in the
stored DynamoDB attributes, `camelCase` in TypeScript, one mapper inside the
route handlers.

**Settled — partition key: `app_name`.** `ui_id` is an ordinary attribute holding
the UI template name. It is not a key, and it is not unique per app — the value
`clinic-rtl` is a template identifier, and two apps built from the same template
would collide.

**Settled — `created_at` is in the row.** The spec's services card, which lists
four fields, is an abbreviation, not a contradiction.

**Still open — the two attribute names** that differ by more than casing:
`dynamo_id` vs `dynamoTableId`, and `kb_id` vs `knowledgeBaseId`. 0008 fixes the
*form* of a name, not the *choice* of name.

Also still open, and both are `gap` rather than `conflict`: the attribute
carrying provisioning state (`complete` / `partial` / `failed`, checklist `G7`,
see 0013) and the attribute carrying the app address (`G8`, see 0012).

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
