# 0034 — The KB reads app buckets through one shared role with a prefix wildcard

Status: DRAFT — not accepted. EB decides.
Date: 2026-09-03
Supersedes: ADR-0021

Checklist rows `N3` / `P5`.

## What changed, and what caused the change

**The cause was ADR 0025**, in which EB decided that `appName` is a short identifier the
creator types and **the bucket name is derived from a fixed factory pattern** —
`appfactory-<appName>-<accountId>`.

ADR 0021 was written before that. It had to assume bucket names were arbitrary, and
every option it weighed was shaped by that assumption.

| | ADR 0021 | this ADR |
| - | -------- | -------- |
| recommendation | **(d)** — a bucket policy on each new bucket, role fixed | **(b)** — one shared role whose policy carries a naming-prefix wildcard |
| the argument | avoid mutating shared state on every create: option (a)'s per-app statement in a shared policy has a size ceiling, a lost-update race between concurrent creates, and a rollback that can break other apps | with a fixed prefix, (b) has the same shared-state property — **none** — and needs no per-app write at all |
| per-app writes in the create path | one, the bucket policy | **zero** |

What a fixed prefix makes possible, and did not before:

```json
{ "Effect": "Allow", "Action": ["s3:GetObject"],
  "Resource": "arn:aws:s3:::appfactory-*-<accountId>/kb/*" },
{ "Effect": "Allow", "Action": ["s3:ListBucket"],
  "Resource": "arn:aws:s3:::appfactory-*-<accountId>" }
```

Written once at platform setup, never touched by a create. The wildcard sits **between
two fixed segments** — the factory prefix and the account id — so it can match neither
another account's bucket nor a bucket the factory did not name. Without a naming
pattern, that resource string does not exist and (b) is not available.

**0021 was not wrong.** Its reasoning was correct on the information it had, and (d)
still works. It is now simply the more expensive of two options that give the same
guarantee: (d) writes to the app's own resource, so it never had (a)'s shared-state
problem, but it is one more thing a create can half-do and one more compensating action
to write and test.

The remaining argument for a bucket policy **as well** is defence in depth, and it
should be decided on that basis rather than on the shared-state grounds 0021 used —
those no longer apply.

## Context

A Bedrock Knowledge Base assumes a service role to read its data source and to call the
embedding model. The architecture spec never mentions it. Without it, ingestion fails —
so this is not hardening, it is a step the knowledge base cannot succeed without.

What app #1's role actually is, read from AWS on 2026-08-31 and recorded in
`docs/gali-ground-truth.md` §9.3:

- `AmazonBedrockExecutionRoleForKnowledgeBase_dvica`, trusted by
  `bedrock.amazonaws.com` with **both** confused-deputy conditions present —
  `aws:SourceAccount` equal to the account, and `aws:SourceArn` matching
  `arn:aws:bedrock:<region>:<account>:knowledge-base/*`.
- Two attached policies: five `s3vectors` actions scoped to the one index ARN, and
  `bedrock:InvokeModel` on the `cohere.embed-multilingual-v3` ARN.
- **No `s3:GetObject` and no `s3:ListBucket` anywhere.**

That absence is not an oversight. App #1 uses a **CUSTOM** data source, which is *pushed
to* via `IngestKnowledgeBaseDocuments`, so its KB never reads S3. ADR 0030 chooses an
**S3** data source for the factory, and that is what makes this question unavoidable:
the factory's KB must read the bucket, and app #1 cannot validate how, because app #1
never needed to.

The factory's problem is also sharper than a single app's. The factory creates one
bucket per app, so every new bucket has to become readable by the KB role — which, done
naively, is a mutation of a **platform-level** resource during a **per-app** sequence,
and the only step in the whole sequence that writes outside the app's own resources.

## Options considered

1. **One shared role, one statement appended per app bucket.** Minimal resources;
   mutates shared state per create; hits the IAM policy size limit; races between
   concurrent creates.
2. **One shared role with a naming-prefix wildcard.** No per-app IAM write at all. The
   role is platform infrastructure, created once. Requires a naming pattern to point the
   wildcard at.
3. **One role per app**, created during provisioning. Tightest scoping, an extra
   provisioning step, an extra rollback action, and an IAM resource quota to watch.
4. **A bucket policy per bucket**, role fixed. Moves the per-app write onto a per-app
   resource, which removes the shared-state problem but not the write.

## Decision

Open — DRAFT. Awaiting EB.

**Recommended: option 2**, with option 4 available as an added layer if defence in depth
is wanted.

## Reasoning

**No write in the create path is better than a cheap write in the create path.** Every
per-app write is a thing that can half-succeed, a thing that needs a compensating
action, and a thing that appears in the rollback ordering. Option 2 removes the category
rather than making it cheaper.

**The wildcard is narrow because it is bounded on both sides.** `appfactory-*-<accountId>`
cannot reach another account (the account id is fixed and is the suffix) and cannot reach
a bucket the factory did not create (the prefix is fixed and the factory owns the
naming). The scope granted is exactly the scope intended: read `kb/` in factory buckets
in this account.

**The role is already narrow in the two ways that matter most**, and those come from app
#1 rather than from design: it is assumable only by `bedrock.amazonaws.com`, and only for
knowledge bases in this account and region. A wildcard on the S3 resource does not widen
either of those.

**Option 3 buys tightness nobody needs.** Per-app roles would matter if apps belonged to
different principals; they belong to one operator.

## Consequences

- **The create path has no IAM and no bucket-policy write.** That resolves the
  eighth-step question 0021 raised against ADR 0006 more cleanly than (d) did: there is
  no IAM step to count, so the sequence does not grow.
- **The KB service role becomes platform infrastructure**, created once before app #1,
  alongside the shared vector bucket (0033). Two platform prerequisites the spec never
  mentions.
- **The bucket-name prefix becomes part of the security boundary**, not just a naming
  convention. Changing the pattern later changes what the role can read — so the pattern
  and this policy have to move together, and neither can be edited alone.
- `docs/kb-provisioning-recipe.md` step K-1 loses its bucket-policy write. The annotation
  already there says so; it should be updated to state it rather than flag it, once this
  ADR is accepted.
- **BLOCKED, and it is the one thing that could sink option 2:** whether IAM accepts a
  wildcard in that position on an S3 ARN *and* whether Bedrock's own validation is
  satisfied by it. The ARN syntax is standard, but this is the kind of thing that is
  cheap to verify and expensive to assume. Routed as Group C in the provisioning recipe
  — one live run in a scratch account. If it fails, this ADR reverts to 0021's (d) and
  0021's reasoning becomes correct again.
- If a second per-app bucket is ever added (Q37), it needs its own statement or its own
  prefix, because `kb/*` is written into the resource path.
