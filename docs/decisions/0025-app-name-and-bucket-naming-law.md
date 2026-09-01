# 0025 — `appName`, and the derived bucket name

Status: DRAFT on the exact pattern. **The model is DECIDED by EB (2026-09-01):
`appName` is a short identifier the creator types, and the bucket name is derived
from a fixed factory pattern.** The pattern, its length budget and the `appName`
rule are drafted below and queued as Q37.
Date: 2026-08-31
Revised: 2026-09-01, after EB's decision

Checklist rows `N8` / `A1`. **Coupled to 0007** — and to 0021, which this revision
changes.

## Decided by EB

- **`appName` is a short identifier the creator types.** It is not the bucket name.
- **The bucket name is derived from a fixed factory pattern** that makes every
  factory-created bucket identifiable as such — for example
  `appfactory-<appName>-<accountId>`.

This closes the option this ADR originally opened: `appName` used verbatim as the
bucket name is off the table, and with it the failure mode where an unrelated AWS
account permanently owns an app name.

## The one thing that has not changed, and it is binding

> **`appName` can never be changed.** It is the registry partition key (0007) and it
> determines a bucket name. Neither can be renamed.

**This is a binding UI requirement, not advice.** The create form must state it at the
field — not in a tooltip, not in a help page, and not only in an error after the fact.
A field that is permanent and does not say so is a trap, and this one is the first
field a creator ever fills in.

Recorded for the checklist as `U17`:

- The `appName` field carries permanent, visible copy saying the name cannot be
  changed later, and why in one clause: it names the app's storage and its registry
  record.
- The copy lives in `lib/uiStrings.ts` like every other user-facing string.
- Editing an existing app must not present the field as editable at all. Not disabled
  with a tooltip — absent, replaced by the value as text.

## The pattern, verified

Proposed: **`appfactory-<appName>-<accountId>`**.

### Against S3 naming law

| rule | pattern's compliance |
| ---- | -------------------- |
| 3–63 characters | fixed overhead is **24** — `appfactory-` is 11, the joining hyphen 1, an AWS account id 12. So the bucket is `24 + len(appName)`, and `appName` ≤ **39** hits the 63 limit exactly. Computed, not estimated |
| lowercase letters, digits, hyphens, dots only | the prefix and account id are compliant; the `appName` rule below forbids everything else |
| must begin and end with a letter or digit | the prefix begins with `a`; the account id ends with a digit. **True regardless of what `appName` is**, which is the quiet benefit of surrounding it |
| must not be formatted as an IP address | impossible — it begins with letters |
| must not start with `xn--`, `sthree-`, `sthree-configurator`, `amzn-s3-demo-` | checked: `appfactory-` starts with none of them |
| must not end with `-s3alias`, `--ol-s3`, `--x-s3` | ends with 12 digits |
| no consecutive periods | contains no periods at all |
| dots break virtual-hosted-style TLS | **no dots by construction**, so HTTPS to the bucket endpoint works without the wildcard-certificate problem |

### Against Gali's own pattern

Gali uses `gali-documents-${AWS::StackName}-${AWS::AccountId}`
(`Gali-AWS-backend/template.yaml:112`). Read directly, not recalled.

Three things follow from comparing them:

1. **The shape is the same idea, independently arrived at** — a fixed prefix, a
   discriminator, and the account id as the global-uniqueness escape. That is
   corroboration that the account-id suffix is the right tool, not an invention.
2. **Gali carries a purpose segment (`documents`) and the proposal does not.** That is
   the one substantive difference and it is a real gap: if an app ever needs a second
   bucket, `appfactory-<appName>-<accountId>` has nowhere to say which bucket it is,
   and the pattern would have to change — which, for buckets, means new buckets.
   Options are to add a segment now (`appfactory-<appName>-app-<accountId>`) at a cost
   of 4 characters of `appName` budget, or to accept that a second per-app bucket
   needs its own pattern. **Queued inside Q37.**
3. **Gali's discriminator is the stack name, the proposal's is the app name.** Correct
   for the factory: per-app resources are not per-stack, and the app name is what the
   registry is keyed on.

### The `appName` rule

Proposed: **`^[a-z][a-z0-9-]{1,30}[a-z0-9]$`** — lowercase, starts with a letter, ends
alphanumeric, hyphens allowed inside, no dots, **3 to 32 characters**.

The hard ceiling is 39. Recommending 32 leaves **7 characters of deliberate headroom**
for a future purpose segment, and that is a judgement with a cost: a creator who wants
a 35-character app name will be refused for a reason that is not visible to them.
That is the right trade — a name that long is a description, not an identifier, and
raising a limit later is safe while lowering one is not.

It also satisfies two constraints that are not S3's:

- **DNS label**, for the subdomain `<appName>.<factory-domain>` (0012): ≤ 63, letters,
  digits and inner hyphens. Satisfied.
- **DynamoDB table name** for `<appName>-chat`: ≤ 255. Satisfied trivially.

## What this changes about ADR 0021 — it reverses its recommendation

This is the consequence EB asked to have recorded, and it goes further than expected.

A **fixed prefix means the KB's read permission can be written once, with a
wildcard**, and never amended per app:

```json
{
  "Effect": "Allow",
  "Action": ["s3:GetObject"],
  "Resource": "arn:aws:s3:::appfactory-*-<accountId>/kb/*"
},
{
  "Effect": "Allow",
  "Action": ["s3:ListBucket"],
  "Resource": "arn:aws:s3:::appfactory-*-<accountId>"
}
```

0021 weighed four options and **recommended (d)** — a bucket policy on each new
bucket, with the role fixed — specifically to avoid mutating shared state on every
create. Its objection to (a) was the shared policy document: a size ceiling, a
lost-update race between concurrent creates, and a rollback that could break other
apps.

**With a fixed prefix, option (b) — one shared role with a naming-prefix wildcard —
becomes strictly better than (d), and 0021's recommendation should change.** The
reasoning:

- (b) has the same shared-state property as (d): **none.** The policy is written once
  at platform setup and is never touched by a create. There is no per-app IAM write at
  all, so there is no size ceiling, no race, and no rollback action.
- (d) still requires a **per-app write** — the bucket policy — which is one more thing
  a create can half-do and one more compensating action. It writes to the app's own
  resource, so it is not the shared-state problem (a) had, but it is not free either.
- The scope (b) grants is exactly the scope intended: the KB service role can read
  `kb/` in factory-created buckets in this account, and nothing else. The role is
  assumable only by `bedrock.amazonaws.com`, and only for knowledge bases in this
  account and region — both conditions are already present on app #1's trust policy
  (`docs/gali-ground-truth.md` §9.3).
- The wildcard sits **between** two fixed segments, `appfactory-` and the account id,
  so it cannot match a bucket in another account and cannot match a bucket that the
  factory did not name.

So: **0021 should move from (d) to (b).** A note to that effect has been added to
0021, which remains a draft. The remaining argument for also having a bucket policy is
defence in depth, and it should be decided on that basis rather than on the
shared-state grounds 0021 originally used — those no longer apply.

Knock-on: step K-1 of `docs/kb-provisioning-recipe.md` currently pairs `CreateBucket`
with `PutBucketPolicy`. Under (b) the policy write disappears from the create path.
The recipe has been annotated rather than rewritten, because 0021 is still a draft.

## Consequences

- `AppConfig.appName` narrows from `z.string().min(1)` to the pattern above, with the
  pattern as a **named constant in one module** — it is referenced by the schema, the
  create form's copy, and the bucket-name derivation.
- **The derivation is a pure function and belongs in one place.** `appName` in, bucket
  name out. Two implementations of it is how you eventually delete the wrong bucket.
- **The registry row must store the derived bucket name**, not re-derive it at delete
  time. Re-deriving is fine until the pattern changes, and then the delete path
  computes a name that does not exist while the real bucket stays. New work for 0007,
  which is now accumulating amendments from 0029, 0031, 0032 and this ADR.
- **`appName` no longer appears in the S3 console as a bucket name a human recognises
  at a glance** — it appears inside one. That is a real operational cost of the
  derived pattern, and the mitigation is that the prefix makes every factory bucket
  greppable, which is the property EB asked for.
- The `BUCKET_NAME_TAKEN` failure (0032) becomes very unlikely rather than impossible:
  a cross-account collision on `appfactory-<name>-<our account id>` would require
  someone to have guessed the account id.
- `BUCKET_ALREADY_OWNED` becomes the realistic bucket failure, and it means exactly
  one thing: a previous create of this app name stranded its bucket (0031).
- **A second per-app bucket is not expressible** in this pattern. See Q37.
