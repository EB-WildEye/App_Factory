# 0038 — The create form remembers its own draft

Status: DRAFT — the **policy** is decided by EB (2026-09-06): the form collects
everything, provisions nothing until create is pressed, and a creator who leaves
mid-form returns to where they left off. The design below is drafted.
Date: 2026-09-06

No UI is built by this ADR.

## Context

The create form is long: an app name, a template, a colour scheme, five prompt parts, a
digest recipient, and a set of knowledge files. Filling it is not a two-minute task, and
the people filling it work in a hospital, on shift, on shared machines. A form that
loses everything because a browser was closed is a form people avoid.

Two constraints shape every answer below, and they pull against each other:

- **The work must survive leaving.** That is the requirement.
- **The workstation is shared and the content is clinical.** Anything persisted on that
  machine is readable by the next person who sits down and opens devtools.

The design is mostly a negotiation between those two.

## 1. What persists, and what deliberately does not

**Persisted:** `appName`, `uiTemplate`, the colour scheme (preset id, or the nineteen
custom hex values), `renderPrecedenceText`, `digestRecipientEmail`, and all five prompt
parts including the rule list.

Not persisted, and not because it is hard:

### Knowledge files are not persisted

Three reasons, in increasing order of weight.

**It is not expressible.** A `File` from `<input type="file">` has no JSON
representation. Persisting one means reading it into memory and base64-encoding it, which
inflates it by about a third before anything is stored. There is no cheap version of this.

**It does not fit.** `localStorage` is a few megabytes per origin, shared by everything on
it. Gali's knowledge base is five markdown documents; a department with a real protocol
library could bring dozens. Base64 in a synchronous, main-thread, few-megabyte store is
the wrong container, and the failure mode is a `QuotaExceededError` thrown mid-typing that
loses the *text* fields too.

**It is the wrong place for a clinical document, and this is the reason that would stand
alone.** `localStorage` is unencrypted, origin-scoped, persists indefinitely, and survives
signing out of anything. A protocol document about abortion care, left in browser storage
on a shared clinical workstation, is readable by the next person to open that browser. The
factory would have taken a clinical document out of a controlled system and left it on a
desktop.

**The form must say so, at the file field, permanently.** Not a toast, which disappears
before it is read, and not silence. A line beside the file input, in
`lib/uiStrings.ts` with the other Hebrew copy, saying that files are not saved with the
draft and must be re-selected. And on restoring a draft that had reached the files step,
the same message is repeated in the restore banner (§5) — because the creator's mental
model is "it remembered everything", and this is the one place it did not.

**Derived values are not persisted either:** the composed prompt preview, its character
count, and contrast-check results are all computed from the fields above. Storing a
derived value is storing something that can disagree with its inputs.

## 2. Where it is stored

**Recommended: `localStorage`.** The comparison that matters is short, and it turns on
exactly the case that motivates this ADR.

| | `sessionStorage` | `localStorage` |
| - | ---------------- | -------------- |
| survives closing the tab | **no** | yes |
| survives closing the browser | no | yes |
| scope | one tab | the origin, all tabs |
| lifetime | until the tab closes | until deleted |

**`sessionStorage` fails the requirement outright.** It is cleared when the tab closes, and
"a creator who leaves mid-form must return to where they left off" is, in practice, a
creator who closed the tab or the browser. `sessionStorage` would satisfy "survives a
navigation within the tab" and nothing more — which is not the problem being solved.

Its one advantage is real and worth naming: being per-tab and short-lived, it leaks far
less on a shared workstation. That advantage is what §4's expiry is trying to buy back.

Also considered:

- **IndexedDB** — asynchronous, much larger, and could hold the files. Rejected because
  §1 decided *not* to hold the files, which removes its only real advantage, and it is
  considerably more machinery for a bag of strings.
- **Cookies** — sent to the server on every request and size-limited. Wrong tool.
- **A server-side draft**, a `drafts` record keyed to the creator. **This is probably the
  better long-term answer**: it survives a machine change, leaves nothing on the
  workstation, and can hold the files properly. It is **BLOCKED by ADR 0024** — there is
  no authentication, so there is no creator identity to key a draft to, and a draft keyed
  to nothing is worse than a local one. Recorded as the intended successor, queued as Q49.

## 3. Draft state and React state

**React state is the single source of truth. Storage is a write-only projection of it,
read exactly once.**

- On mount, one read, in a lazy `useState` initialiser. The stored value seeds React
  state and is then irrelevant for the rest of the session.
- On change, a debounced write — about 500 ms. `localStorage` is synchronous and blocks
  the main thread, so a write per keystroke is a stutter in a textarea holding a prompt
  part.
- **Storage is never read again while the form is open**, and `storage` events from other
  tabs are ignored.

The failure mode being designed out is bidirectional sync. Two states that write to each
other drift, and the drift shows up as the worst possible bug in this form: a field that
reverts while someone is typing in it. Ignoring `storage` events means last-writer-wins
between tabs, which is a real limitation — mitigated, not solved, by §6 giving each tab
its own draft.

One consequence worth stating because it is easy to get wrong: **the draft is written
from validated-or-not raw field values, not from a parsed `AppConfig`.** A half-filled
form does not satisfy `appConfigSchema` — that is the point of a draft — so the stored
shape is "whatever the fields hold", and it is validated on restore (§4), not on save. A
draft that could only be saved once valid would be useless.

## 4. Expiry, clearing, and stale references

### Expiry

Each draft carries `savedAt`. On restore, a draft older than the limit is **discarded
without offering it**.

**Proposed: 7 days.** The motivating case is hours to days — a shift ended, a meeting
interrupted. Thirty days would leave clinical prose on a shared workstation for a month
to serve a case that almost never happens. Seven is a judgement, not a derivation, and
it is queued as Q47 because it trades convenience against exposure on a machine the
factory does not control.

Expiry also needs to actually run: a draft is only checked when the form opens, so an
abandoned draft can sit past its limit indefinitely. So the sweep is **on every form
open, across all drafts**, not just the one being restored — cheap, and it means opening
the form ever again cleans up everything stale.

### Clearing on create — and not when you would think

The obvious rule is "clear the draft when create is pressed". **That is wrong**, and the
reason is worth spelling out.

`createApp` returns `202` (0014). Provisioning then runs for minutes and **can fail**
(0031). If the draft was cleared at `202`, a create that fails at step 5 leaves the
creator with nothing: the configuration they spent an hour on is gone from the browser,
and it was never stored on the server, because the registry row holds identifiers and
lifecycle, not the config (0036).

So:

1. On `202`, the draft is **marked submitted**, with the `appName` it was submitted as.
   It is not deleted, and the form stops writing to it.
2. When that app reaches **`complete`**, the draft is deleted.
3. If it reaches **`failed_rolled_back`**, the draft is **restored for retry** — which is
   exactly the state 0031 says the same app name may be retried from.
4. If it reaches **`failed_rollback_incomplete`**, the draft is kept and the banner says
   the app name is blocked, so a retry needs a different name (0031 refuses the retry).

The cost: the draft outlives the form, so deleting it depends on someone polling the app's
status — which the create form's progress view already does (0014). If the creator closes
the browser during provisioning, the draft is cleaned up on the next form open instead.
That is acceptable; the alternative loses work.

### A restored draft that references something gone

A draft can name a `uiTemplate` or a preset scheme id that no longer exists — the enums
ship with the app (0023), so a rename between saving and restoring produces exactly this.
A custom scheme can also stop passing the contrast gate if the pair list changes (Q39).

**Field-wise restore, never a blind parse and never a silent substitution:**

- The payload carries a `schemaVersion`. On mismatch, do not discard the draft — attempt
  each field independently.
- A field whose value is no longer valid is **reset to unset**, and the creator is told
  which fields were reset and why.
- **Never substitute a default.** Silently swapping an unknown template for the only
  available one means the app renders as something the creator did not choose, and it
  looks like it worked. Resetting the field forces a deliberate choice.
- A custom colour scheme that now fails contrast keeps its colours and shows the failures,
  so the creator can adjust rather than start over. Save stays blocked until it passes.

## 5. The creator is told, not surprised

**Restoration is announced.** A persistent, dismissible banner at the top of the form:
what was restored, when it was saved, and a "discard and start fresh" action.

Silent restoration is wrong here for two reasons, and the second is specific to this
setting:

1. **A half-filled form with no explanation reads as a bug.** Someone opens "create app",
   sees prose they do not remember writing, and cannot tell whether it is their draft,
   stale state, or something broken. The most likely response is to delete it all by hand.
2. **On a shared workstation it may not be their draft at all.** Without authentication
   (0024) the factory cannot tell one creator from another, so the banner's "saved 3 days
   ago" is the only signal that this is someone else's unfinished work — and "discard and
   start fresh" is the action they need.

A banner, not a toast: a toast disappears before it has been read, and this one carries
information the creator may need ten minutes later — particularly the note that knowledge
files were not restored (§1).

## 6. Several drafts, not one

**A single fixed storage key is wrong**, because two creators — or one creator with two
apps — silently overwrite each other. On a shared clinical workstation that is likely
rather than hypothetical.

Keying on `appName` is also wrong, and more subtly: `appName` is the first field, it is
empty when the form opens, and it changes while being typed. A key derived from it either
does not exist yet or multiplies a draft per keystroke.

**Recommended: a minted draft id, carried in the URL.**

- On first edit, mint a `draftId` and put it in the URL — `/apps/new?draft=<id>`.
- Storage holds `appfactory.draft.<id>` per draft, plus an index listing
  `{ id, appName, savedAt, submittedAs }`.
- The URL is what makes the behaviour deterministic: a reload restores *that* draft; a
  second tab opened fresh gets a *different* draft, which also defuses §3's cross-tab
  write contention.
- With an index, the form can offer a choice when more than one live draft exists, instead
  of guessing.

Costs, stated: an index to keep consistent with the drafts it lists — and it can drift, so
the sweep in §4 must treat the drafts as the truth and the index as a cache to be rebuilt,
not the reverse. And the URL becomes stateful, so a shared link carries a draft reference
that means nothing in someone else's browser, which the form must handle as "draft not
found" rather than as an error.

## Consequences

- `lib/uiStrings.ts` gains the restore banner, the reset-fields notice, the
  files-not-saved line, and the discard action.
- **A persistence module of its own**, so the form does not contain storage logic: read
  once, write debounced, sweep, and the index. One responsibility, and testable without a
  browser if the storage interface is injected — which it should be, because the failure
  cases are `QuotaExceededError`, storage disabled in private browsing, and a corrupt
  payload, and none of those are reachable in a normal test otherwise.
- **`QuotaExceededError` must be handled, not thrown.** If the write fails, the form keeps
  working and the banner says the draft is not being saved. Losing the draft is bad;
  breaking the form because the draft could not be saved is worse.
- **Storage disabled entirely** — private browsing, or a locked-down workstation — must
  degrade to a form with no draft, announced once, not a crash.
- The draft's shape is **not** `AppConfig`; it is a partial, unvalidated field bag with a
  `schemaVersion`. It is deliberately a separate type, because letting `AppConfig` become
  partial to serve the draft would weaken the contract every other consumer relies on.
- **This is a stopgap, and should be recorded as one.** A server-side draft keyed to an
  authenticated creator is better on every axis except that it does not exist yet
  (blocked by 0024). Q49.
- Nothing here provisions anything, which is the decided policy: the form collects, and
  create is the only thing that acts.
