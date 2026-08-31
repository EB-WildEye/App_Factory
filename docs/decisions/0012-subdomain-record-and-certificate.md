# 0012 — Subdomain record type and certificate

Status: DRAFT — not accepted. EB decides.
Date: 2026-08-23
Recommendation added: 2026-08-31

## Context

Marked TBD by the spec twice — a dedicated TBD service card, and the Open
section: *"CNAME or something else, and where certificates come from."*

What the spec commits to:

- The subdomain is **step B7, the last step of creation**, deliberately: *"an
  app can exist and work before it has an address."*
- Shape, from the B7 code sample:

```
gali-ivf.<factory-domain>
    CNAME → <app endpoint>

# record type: TBD
# certificate: TBD
```

- Marked TBD in the flow itself, the only step that is.

What is undecided: the record type (CNAME as the spec guesses, or A/ALIAS to a
CloudFront or ALB target), the factory domain itself, who issues and renews the
certificate (ACM with DNS validation, a pre-issued wildcard, per-app cert), and
where DNS is hosted.

The wildcard question is the one that changes the shape of the step: a
pre-issued `*.<factory-domain>` certificate turns B7 into a single DNS record
write with no per-app certificate work at all, while per-app certificates make
B7 a multi-step, slow, validation-dependent operation that can sit pending for
minutes.

This is also the step whose **rollback is undefined** — see 0013 — and the step
that the 7-vs-6 count discrepancy turns on, see 0006.

## Options considered

1. **Wildcard certificate plus CNAME per app.** One ACM wildcard for
   `*.<factory-domain>`, issued once; each app gets a CNAME to the shared
   endpoint. B7 becomes one DNS write, and rollback is one DNS delete.
2. **Per-app certificate plus A/ALIAS record.** Each app gets its own ACM cert
   with DNS validation and its own alias record. B7 becomes slow and
   asynchronous, and rollback has to revoke a certificate as well as delete two
   records.
3. **Defer the subdomain out of provisioning entirely.** Apps are reachable on a
   path (`/app/<appName>`) and the subdomain becomes a separate later operation.
   The spec already allows an app to work without an address, so this is the
   option closest to what B7 currently guarantees.

## Recommendation

**Option 1 — one wildcard certificate for `*.<factory-domain>`, one CNAME per
app.**

It is the only option that keeps B7 a single reversible write. Rollback becomes
one DNS delete, which matters because B7 is the step 0013 currently cannot
describe a compensating action for at all. Option 2 makes the last step of
creation slow, asynchronous and validation-dependent, and gives 0013 a
certificate to revoke — a new failure mode at the exact point in the sequence
where everything else has already succeeded.

Option 3 (paths instead of subdomains) is the fallback if a factory domain does
not exist yet, and it is worth saying out loud that **it costs nothing in
Milestone 1**: the spec already guarantees an app works before it has an address,
so the GUI has to render an addressless app either way.

What still has to come from EB, because none of it is inferable: the factory
domain itself, where its DNS is hosted, and whether an ACM wildcard in the right
region already exists. A wildcard certificate for a domain nobody has registered
is not a decision, it is a purchase.

For Milestone 1, whichever way this goes: **"no address yet" is a normal state,
not a partial failure.** The App list shows an address column that can be empty,
and an empty one is not an error badge. This follows from the spec's own
statement, not from the certificate choice, so the UI can be built now.

## Decision

Open — DRAFT. Awaiting EB.

## Consequences

For Milestone 1 the GUI impact is narrow but real: whether the App list
shows an address column, whether "no address yet" is a normal state or a partial
failure, and whether the delete confirmation names a DNS record as a fifth
resource alongside the four the build plan lists (bucket, KB + data source,
table, registry row).
