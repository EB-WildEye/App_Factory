# 0022 — Who increments the prompt version, and when

Status: DRAFT — not accepted. EB decides.
Date: 2026-08-31

Checklist row `N5` / `S8`. A gap: the spec implies a policy and never states one.

## Context

The spec's B3 step writes `prompt/v1.txt` and says the prompt is *"saved as a
version, so you can tell which prompt produced a given answer"*. `v1` implies `v2`.
Nothing anywhere says who increments it, on what event, or how the answer that
cites it finds it.

Gali has **no versioned prompt artefact at all** (`docs/gali-ground-truth.md`,
not-found item 9). The prompt is a Python literal in a shared Lambda layer,
versioned by git. What Gali does have, and it is the interesting part, is a
*validation* notion of version: the changelog names the classifier prompt as
**locked at `a635c2e`**, and the committee dumps are hash-bound to specific
commits. So app #1's answer to "which prompt produced this answer" is a git commit,
and its unit of change is a validation run.

Two things are undecided and they pull in different directions:

**The trigger.** Every save? Every prompt-part edit? Only when an operator says
"publish"? Gali's answer is "when a clinician signs off", which is neither of the
first two.

**The link.** A stored version is only useful if an answer can be traced to it.
That requires the version to be recorded on the *conversation*, and nothing in the
spec, the registry row, or the chat-history table has a field for it. Gali's chat
table has `session_id`, `timestamp`, `role`, `content`, `status`, `ttl` — no prompt
version. And its history expires at the next midnight Israel time, so the answer is
gone within a day anyway.

That last point is worth stating plainly: **a prompt version is traceability
infrastructure, and app #1's answers do not survive long enough to be traced.**

## Options considered

1. **Increment on every write of the composed prompt.** Simple, mechanical, no
   human judgment. Produces a new version for a typo fix and a new version for a
   clinical change, indistinguishable from each other.
2. **Increment on publish, as an explicit operator action.** A prompt is edited as
   a draft and published deliberately; the version number counts publishes. Matches
   how Gali actually behaves, with the sign-off as the publish event.
3. **Content-addressed instead of sequential** — `prompt/<sha256>.txt`, with a
   pointer object naming the current one. No counter to own, no race between two
   editors, and an identical prompt never produces a second artefact.
4. **No versioning.** Overwrite one `prompt.txt` and rely on S3 object versioning,
   which the bucket has anyway.

## Recommendation

**Option 3 for the artefact, option 2 for the event, and record the version on the
turn.**

Content addressing removes the only genuinely hard part of a sequential counter:
who owns it. `v1`/`v2` in a bucket is a counter with no lock, and two operators
publishing simultaneously produce either a collision or a silent overwrite —
exactly the concurrency gap 0015 already notes for `writeFile`. A digest cannot
collide by accident, an unchanged prompt does not create a new artefact, and the
digest *is* the identifier an answer can cite.

Publish rather than save, because Gali's real unit of prompt change is a clinician
sign-off, not a keystroke. Auto-versioning on save would produce dozens of
versions per editing session and make "which prompt was validated" unanswerable —
the opposite of the goal.

And the part that is missing from the spec entirely: **the version has to be stored
on the conversation turn**, or none of this achieves the stated purpose. That means
a field in the chat-history item. For Gali that is a change to a frozen table's
item shape, which is cheap technically and expensive procedurally — and it is worth
knowing that it buys traceability of at most 24 hours, until the TTL fires.

Option 4 deserves a fair hearing: S3 object versioning already exists on Gali's
bucket (`template.yaml:113-114`), it costs nothing, and it makes every prompt
recoverable. It fails only on the citation requirement — an S3 version id is not
something an answer can carry meaningfully — so it is the right answer if
traceability is dropped as a goal, and the wrong one if it is kept.

## Consequences

- Accepting this replaces `prompt/v1.txt` with `prompt/<sha256>.txt` plus a
  pointer, which contradicts the spec's literal filename. B3's compensating action
  changes from "delete the object and its version" to "delete the digest object and
  restore the previous pointer".
- The chat-history item shape grows a prompt-version field, which the spec never
  describes (`H3` is already marked a gap) and which for app #1 touches a frozen
  table.
- A publish action means the create form is not the only place a prompt changes,
  so the Admin Dashboard needs an edit-and-publish path — new UI beyond the
  Milestone-1 list.
- Gali needs a decision either way: it has no artefact today, so accepting this
  makes app #1 the first thing that would have to change, which routes straight
  back into 0018.
