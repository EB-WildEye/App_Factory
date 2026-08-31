# 0025 — `appName` validation is S3 bucket naming law, and it is permanent

Status: DRAFT — not accepted. EB decides.
Date: 2026-08-31

Checklist row `N8` / `A1`. A gap: `appName` is validated as non-empty and its real
constraints are unstated.

**Coupled to 0007, and the coupling is the point.** ADR 0007 made `app_name` the
DynamoDB **partition key** of the factory registry, and a partition key cannot be
changed without rebuilding the table. This ADR says `appName` is also the S3 bucket
name, and S3 bucket names cannot be renamed at all. Together:

> **The create form's first field is validated by S3 naming law and is permanently
> immutable.** Not "hard to change later" — there is no rename path for either the
> bucket or the partition key.

Nothing else in the config has that property, and nothing in the UI currently says
so.

## Context

The spec uses `appName` as the key tying everything together: the bucket is *"named
after the app"*, the chat table is `<app>-chat`, the registry row is keyed on it,
and the subdomain is `<app>.<factory-domain>`. So one string chosen in the first
field of the first screen determines four resource identifiers in three different
naming systems, each with different rules.

The binding rules, from strictest to loosest:

**S3 bucket names** — the tightest, and therefore the effective rule:
3–63 characters; lowercase letters, digits, hyphens and dots only; must start and
end with a letter or digit; cannot be formatted as an IP address; cannot start with
`xn--`, `sthree-`, or end with `-s3alias` or `--ol-s3`; **globally unique across
every AWS account on earth**. Dots break virtual-hosted-style TLS, so in practice
dots are excluded too.

**DNS labels**, for the subdomain: 1–63 characters, letters digits and hyphens, no
leading or trailing hyphen. Close to the S3 rule, and it is why the S3 rule
mostly satisfies it.

**DynamoDB table names**: 3–255, `[A-Za-z0-9_.-]`. Looser, but `<app>-chat` has to
fit within 255, which the S3 limit already guarantees.

**DynamoDB key values**: almost anything. No constraint of use here.

The consequence the spec does not draw: **global uniqueness means the factory can
fail to create an app for a reason that has nothing to do with the factory.** Some
stranger's bucket named `gali` makes `gali` unavailable forever, and the failure
arrives at B1 — after the form was submitted and validated. Nobody has assigned an
error message to that.

Gali's own bucket does **not** follow the spec's pattern. It is
`gali-documents-${AWS::StackName}-${AWS::AccountId}` (`template.yaml:112`) — a
prefix, a stack name, and the account id, which is exactly the standard defence
against global-uniqueness collisions. App #1 already solved this problem and the
spec describes the unsolved version.

## Options considered

1. **`appName` is the bucket name verbatim**, as the spec says. Validate it against
   the full S3 rule in the zod schema, and handle "already taken" as a create
   failure. Shortest names, permanent collision exposure.
2. **`appName` is a slug; the bucket name is derived** — e.g.
   `<factory-prefix>-<appName>-<accountId>`, following Gali. `appName` is validated
   against a simple slug rule and collisions become impossible within the account.
   The bucket name stops being the app name, so the S3 console no longer reads like
   the app list.
3. **`appName` verbatim, plus an availability check in the form** — a
   pre-flight `head_bucket` before submission. Better error timing; still
   permanently exposed, and the check is racy.

## Recommendation

**Option 2, following what app #1 already does, with a slug rule on `appName`.**

The deciding argument is that option 1 makes an unrelated third party able to
permanently block an app name, and it surfaces that at the first provisioning step
rather than in the form. Option 3 improves the timing and does not remove the
exposure — and a pre-flight check is a TOCTOU race by construction.

Option 2 costs one indirection and buys collision-freedom, and it is not a novel
design: it is the pattern the production system already uses, and the reason it uses
it is presumably this exact problem.

Recommended slug rule for `appName`, tighter than S3 because it also has to be a
DNS label and a readable identifier: `^[a-z][a-z0-9-]{1,30}[a-z0-9]$` — lowercase,
starts with a letter, ends alphanumeric, hyphens allowed inside, no dots, 3–32
characters. Bucket names derive from it and remain inside 63.

**Whatever is chosen, two things follow and both are UI work in this milestone:**

1. The create form must say, at the field, that the name **cannot be changed
   later** — because of the partition key (0007) and the bucket, not because of a
   missing feature. A field that is permanent and does not say so is a trap.
2. The name-taken failure needs an error message and a place to appear. Under
   option 2 it is an internal duplicate check against the registry, which is cheap
   and non-racy; under option 1 it is an S3 error surfaced from B1.

## Consequences

- `AppConfig.appName` narrows from `string` with a `min(1)` to a pattern, in the
  zod schema and in one named constant. Currently marked BLOCKED with a pointer
  here.
- Under option 2 the registry row needs the derived bucket name as an attribute, or
  the delete path has to re-derive it — and re-deriving a name at delete time is how
  you delete the wrong bucket after the derivation rule changes. This is new work
  for 0007.
- The subdomain (0012) uses `appName`, so the slug rule must satisfy a DNS label;
  the recommended pattern does.
- 0021's role scoping keys off the bucket-name prefix, so the derivation rule is
  part of the security boundary, not only a naming convention.
- Under option 2, `appName` verbatim no longer appears in the S3 console, so
  operators need the registry to map an app to its bucket. That is a real
  operational cost and it should be written down rather than discovered.
