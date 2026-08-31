# 0021 — The IAM role the Knowledge Base uses to read an app's bucket

Status: DRAFT — not accepted. EB decides.
Date: 2026-08-31

Checklist row `N3` / `P5`. A gap, and the candidate eighth provisioning step in
0006.

## Context

A Bedrock Knowledge Base assumes a service role to read its data source and to
call the embedding model. The architecture spec never mentions it. Without it,
ingestion fails — so this is not a hardening detail, it is a step B4 cannot
succeed without.

What Gali shows, and what it does not:

- The template grants the **sync Lambda** `bedrock:StartIngestionJob`,
  `bedrock:GetIngestionJob`, and `s3:GetObject`/`s3:ListBucket` on the documents
  bucket (`template.yaml:243-259`). That is the *caller's* permission to trigger
  ingestion.
- The **KB's own** data-access role is nowhere in the repo, because the KB was
  created outside the stack (`docs/gali-ground-truth.md`, not-found item 7).

So the repo demonstrates that the two are different things and supplies only the
first. The second is invisible.

The factory's problem is sharper than Gali's, because Gali has one bucket and the
factory creates one per app. Every new bucket has to become readable by the KB
role at create time, which is a mutation of a **platform-level** resource during a
**per-app** provisioning sequence — the only step in the whole sequence that
writes outside the app's own resources.

That has consequences the spec's model does not cover:

- **The compensating action mutates shared state.** Rolling back a failed create
  means removing that app's statement from a policy other apps depend on. A
  concurrent create doing the same thing is a lost-update race on a policy
  document.
- **IAM policy documents have a size limit.** A per-app statement in one role
  policy has a ceiling, so the number of apps the factory can host becomes a
  function of policy size — the same class of hidden limit as 0020's quota.
- **IAM is eventually consistent.** A policy written at B1 may not be effective
  when B4 runs seconds later, which produces an intermittent create failure that
  looks like a Bedrock problem.

## Options considered

1. **One shared KB service role, one statement appended per app bucket.** Minimal
   resources; mutates shared state per create; hits the policy size limit; races.
2. **One shared KB service role with a wildcard resource** — e.g. every bucket
   matching the factory's naming prefix. No per-app IAM write at all: the role is
   platform infrastructure, created once, and B4 creates nothing IAM-shaped. Broad
   by construction.
3. **One role per app**, created as part of provisioning. Tight scoping, an eighth
   step, an eighth rollback action, and an IAM resource quota to watch.
4. **Bucket policy instead of role policy** — the KB role stays fixed and each new
   bucket grants it access in its own bucket policy. The per-app write moves to a
   per-app resource, which removes the shared-state mutation entirely.

## Recommendation

**Option 4, with option 2's naming prefix as the guard.**

Option 4 is the one that keeps the invariant every other step in the sequence
already has: **a provisioning step should only write resources belonging to the app
it is provisioning.** A bucket policy is part of the bucket, so granting access
becomes part of B1 rather than a new step, the compensating action is
`delete_bucket` (which takes the policy with it), and the concurrency race
disappears because no two creates touch the same document.

Combining it with a naming prefix on the role's own resource scope means the role
is not literally `s3:*`: it is limited to buckets whose names match the factory's
prefix, and the bucket policy on each individual bucket is what actually admits
it. Two conditions, both narrow, neither mutated per create.

Option 1 is the default anyone would reach for and it is the worst of the four:
shared-state mutation, a size ceiling, a lost-update race, and a rollback that can
break other apps.

**This settles 0006.** Under option 4 there is no eighth step — the IAM work folds
into B1 — so seven stands. Under option 1 or 3 there is an eighth step, and both
0006 and 0013 have to be reopened. That is why this ADR should be decided before
0006 is accepted, not after.

## Consequences

- Accepting this keeps the backend at seven steps and gives B1 a second
  responsibility: create the bucket **and** attach its policy. That should be
  stated in 0006's table, or the policy becomes an orphan the moment B1's rollback
  is optimised.
- The KB service role becomes platform infrastructure that SAM owns, alongside
  0020's shared collection — a second thing the factory needs standing before app
  #1.
- The bucket-name prefix in the role's scope makes the prefix part of the security
  boundary, which means 0025's naming rule is no longer only a validation rule.
- Nothing here can be confirmed against Gali. If the console read recommended in
  0020 happens, it should also record the KB's actual role ARN and policy, since
  that is the only evidence of what app #1 really uses.
