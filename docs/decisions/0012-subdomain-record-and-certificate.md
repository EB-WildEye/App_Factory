# 0012 — Subdomain record type and certificate

Status: open
Date: 2026-08-23

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

## Decision

Open. Not resolved here.

## Reasoning

Pending.

## Consequences

Pending. For Milestone 1 the GUI impact is narrow but real: whether the App list
shows an address column, whether "no address yet" is a normal state or a partial
failure, and whether the delete confirmation names a DNS record as a fifth
resource alongside the four the build plan lists (bucket, KB + data source,
table, registry row).
