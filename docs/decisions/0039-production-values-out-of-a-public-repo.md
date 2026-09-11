# 0039 — Production values do not live in a public repository

Status: accepted
Date: 2026-09-09
Decided by: EB

## Context

This repository is public on GitHub, and had been since `b4a100e` on 2026-08-30. A
read-only audit on 2026-09-09 found that its working tree and every clone of its
history carried:

| class | example of what was there |
| ----- | ------------------------- |
| clinical prompt text | the live 4,064-character `textPromptTemplate`; the five documentation parts, 11,492 characters; the triage classifier prompt with its escalation thresholds |
| Bedrock resource ids | the knowledge base id, both data source ids |
| inference profile ids | the primary and fallback model ids |
| AWS account | the 12-digit account id, in five places, and ARNs built from it |
| IAM principal | a named person's live IAM user ARN |
| resource names | the chat-history table, the documents bucket, four Lambda functions, a layer version |
| a vulnerability | a written description of app #1's endpoint authentication posture, detailed enough to act on |

None of it was a credential, and no rule in `CLAUDE.md` had been broken: the Gali
repos were only ever read, and the values were recorded with provenance because the
architecture required them to be copied rather than chosen. The exposure came from the
composition. One clone gave a reader the resource ids, the account, the prompt they
would need to defeat, and a finding about which endpoint to try.

Two of those classes are worse than "an identifier leaked":

- **The prompt is a validated clinical artefact belonging to Wolfson Medical Center**,
  under an ethics-committee freeze. Publishing it is a disclosure about the hospital's
  clinical protocols, not only about a system.
- **The endpoint finding concerns a live, patient-facing system.** Publishing an
  unfixed finding is worse than not having looked.

EB decided, 2026-09-09: **the repository stays public, and these values never live in
it — including in its history.**

## Options considered

### A — Make the repository private

Cheapest by far: one setting, nothing to rewrite, nothing to restructure.

- Rejected by EB. Also: it does not undo the disclosure. The values had been public
  for ten days, and forks, the GitHub Events API and third-party mirrors are not
  retracted by a visibility flip.

### B — Remove the values from the working tree only

Delete them going forward, leave the history alone.

- Rejected. `git log -p` is one command. A value removed from `HEAD` and left in
  history is not removed; it is filed.

### C — Remove from the working tree and rewrite the history (chosen)

Values move to a gitignored local file, every commit that carried them is rewritten,
and a gate stops them coming back.

- Cost: a history rewrite, which contradicts this repository's own standing rule that
  pushed history is never rewritten. EB authorised the exception for this task alone.
- Cost: every commit hash before the rewrite changes. Any clone anyone else holds is
  now divergent, and the twenty remote branches have to be rewritten with `main` or
  abandoned.
- Cost: `docs/gali-ground-truth.md` becomes a document with holes in it, and the
  factory loses the ability to assert "this constant equals what production sends"
  from a clean clone.

## Decision

1. **Values live in one gitignored file**,
   `lib/gali/gali-production-source.local.json`, written by
   `scripts/generate_gali_constants.py` from the read-only Gali checkout. The ignore
   rule is the pattern `*.local.json`, not that one path, so the next private file is
   safe by default rather than safe if someone remembers.

2. **`lib/gali/constants.ts` keeps its structure and its generator, and loses every
   value.** What stays is what the factory has to reproduce and what is not a secret:
   the part order, the empty separator, the service cap, the composite key schema, the
   TTL attribute and timezone, the nine-key metadata schema, the triage tiers. What
   goes is every identifier and every character of prompt text. A part order is not a
   resource id.

3. **The loader is typed and tolerant of absence.** `lib/gali/productionSource.ts`
   returns `null` when the local file is missing, which is what every clone and any CI
   runner looks like, and throws when the file is present but malformed. Absent is
   normal; present-but-wrong means something is about to reason about values nobody
   generated.

4. **The golden test's job changes.** It no longer asserts that a committed constant
   equals a production string — that assertion required the production string to be
   committed. It now asserts three different things:
   - the loader contract, against a committed fixture with obviously fake values;
   - that the local file is internally consistent, by recomputing every digest from
     the value beside it, which catches a hand-edit;
   - that the generator reproduces the local file, by re-running it against the Gali
     checkout, which is what ties the file to Gali rather than to somebody's memory.

   The third check skips on a machine without the local file. Skipping is correct
   there: there is nothing to verify, and a test that faked it would be asserting
   against its own fixture while claiming to check Gali.

5. **The digests moved out with the values.** A SHA-256 committed next to a redacted
   value is still a pin against a production string. They now live in the local file's
   `manifest.digests`, which is where the integrity check reads them.

6. **Tests read fixtures.** Three test files had been using Gali's real prompt parts
   as fixture data, which committed the clinical text a second time. Nothing they
   asserted needed the real bytes — they check ordering, mapping and the length cap —
   so they now use `tests/fixtures/systemPromptParts.ts`, which is deliberately obvious
   nonsense.

7. **Two documents leave git and stay on disk.**
   `docs/gali_readonly_audit_2026-09-01.md` and `docs/gali-five-parts-draft.md` are
   gitignored and untracked, not deleted. The audit is saturated with live AWS facts
   and with the endpoint finding; the five-parts draft is Gali's clinical content
   rewritten, which is the same disclosure with different authorship. Redacting either
   one line by line would leave a husk. EB keeps both.

8. **Everything else is redacted in place, with a named token.** Where a value used to
   be, the text now reads `«redacted:kb-id»`, `«redacted:account-id»`,
   `«redacted:chat-table»` and so on. A reader learns what was removed and where it
   went. Provenance stays — `file:line` into a private repo is not a secret and it is
   the audit trail. Lengths stay: 4064 is why app #1 has 32 characters of headroom and
   11,492 is why the five parts cannot be what production sends, and neither number
   says anything about the text.

9. **The guard is a test in the gates, not a hook.** `tests/repository/secretScan.test.ts`
   scans every tracked file on every `bun test`. A pre-commit hook lives in
   `.git/hooks`, is not committed, and is therefore absent on exactly the machines
   where an accidental commit is least likely to be noticed.

10. **The guard is pattern-based.** No rule names a value that was removed. Each rule
    describes a shape — twelve consecutive digits, ten uppercase alphanumerics, an ARN
    with a filled-in account field, a region-prefixed model id, a hyphenated name
    ending in a deployment stage, a dialable number, a long Hebrew-dominant run — so a
    *different* knowledge base id or a second account is caught the first time it
    appears. A blocklist of the twelve strings purged today would have caught exactly
    those twelve.

    One rule needs an allowlist: ten uppercase alphanumerics is also the shape of
    `SUPERSEDED` and `GITIGNORED`. Both entries were found by running the scan, not
    imagined in advance, and an allowlist entry is a reviewable claim that a token is
    an English word rather than an identifier.

## Reasoning

The rule that generalises: **a value that a service will answer to, and text that
belongs to someone else, are not documentation.** Everything else about Gali — shapes,
orders, limits, provenance, lengths, the reasoning — is what this repository is
actually for, and none of it needed to go.

The reason the history had to be rewritten and not merely amended is that the decision
log's own principle cuts the other way here. An ADR is evidence and is never rewritten
to agree with the present. A leaked credential is the opposite: its only value to an
attacker is that it is still readable, and the record of *what* leaked is preserved
here, in this ADR, without preserving the values themselves. This document is the
audit trail the rewrite would otherwise have destroyed.

Redaction tokens rather than silent deletion, for the same reason: a document that
quietly lost a table cell tells a later reader nothing. `«redacted:kb-id»` tells them
what was there, that its removal was deliberate, and where the value lives now.

## Consequences

- **Every commit hash in this repository changed.** Any clone taken before
  2026-09-09 is divergent and should be re-cloned rather than merged. The twenty
  remote branches were rewritten by the same pass.
- **The rewrite contradicts `CLAUDE.md` GIT rule 5** ("never rewrite history that has
  been pushed"). EB authorised the exception for this task only. The rule stands; this
  is the exception it now has a precedent for, and the precedent is "a secret was
  published", not "the history was untidy".
- **A clean clone cannot verify Gali.** `bun test` passes, and the checks that need the
  values skip with a clear reason. That is a real reduction in what CI can prove, and
  it is the price of not publishing the values. Anyone who needs the full check needs
  the Gali checkout, which is the same condition under which the values could be
  regenerated anyway.
- **`docs/gali-ground-truth.md` now has redaction notices where two verbatim blocks
  were.** Its §10 lost the read of app #1's authorization behaviour, keeping the
  requirement that came out of it.
- **Three ADRs point at a file that is no longer committed.** 0009 §amendment, 0016 and
  0035 cite `docs/gali-five-parts-draft.md` for the 4047-character measurement. Those
  citations were true when written and are left alone, per the supersession rule — this
  entry is the amendment that records the path is now local-only.
- **What could not be removed is listed in the final report and in Q50.** A public
  repository cannot un-publish; the rewrite removes the values from this repository's
  history, not from anywhere a copy was already taken.
- **The prompt text is now single-sourced.** It exists in the Gali repo and in one
  gitignored file regenerated from it. That is strictly better than the previous state,
  where a fourth and fifth copy lived in a test fixture and a markdown code block.
