# 0027 — The per-document KB metadata schema

Status: DRAFT — not accepted. EB decides.
Date: 2026-08-31

Checklist row `N10`. A gap: absent from the spec and from `AppConfig`, and already
enforced in production.

**Feeds 0010.** 0010 asks what structure a creator must supply; this ADR is the
concrete answer app #1 already uses.

## Context

The spec says data goes in *"in a defined structure, not as free text"* and defines
the structure as `{ id, title, body_md }`. Production Gali defines it differently
and enforces it harder: every KB document carries a **9-key metadata record**,
validated in full before any network call (`scripts/ingest_kb.py:41-44`, `:155-198`;
recorded with provenance in `docs/gali-ground-truth.md` §7).

| # | key | type | required | rule |
| - | --- | ---- | -------- | ---- |
| 1 | `doc_type` | STRING | yes | observed: `procedure_guide`, `disclaimer_policy`, `info_guide` |
| 2 | `procedure_type` | STRING | yes | observed: `medication`, `missed_abortion`, `na` |
| 3 | `gestational_age_max_weeks` | NUMBER | **no** | integer; omitted entirely when not applicable |
| 4 | `topic_tags` | STRING_LIST | yes | 1–10 non-empty trimmed strings, no quotes |
| 5 | `contains_red_flags` | BOOLEAN | yes | |
| 6 | `contains_emotional_support` | BOOLEAN | yes | |
| 7 | `language` | STRING | yes | must equal `he` |
| 8 | `source` | STRING | yes | must equal `Wolfson Medical Center` |
| 9 | `version` | STRING | yes | `^\d{4}-\d{2}$`; batch default `2026-06` |

Three observations that make this more than a schema to copy:

**It is clinical metadata, not technical metadata.** `contains_red_flags`,
`contains_emotional_support`, `procedure_type` and `gestational_age_max_weeks` are
clinical claims about a document's content. A creator setting them is making a
medical assertion, and setting `contains_red_flags: false` on a document that
describes haemorrhage is a safety-relevant error that no schema can catch.

**Two of the nine values are Gali-specific, not factory-wide.** `language` must
equal `he` and `source` must equal `Wolfson Medical Center` — hard-coded equality
checks. For a generic factory both have to become per-app configuration, and
`language` collides directly with `QUESTIONS.md` Q4.

**The vocabularies are open in code and closed in practice.** `doc_type` and
`procedure_type` are validated as "any string", but only three and three values
exist. So today they are free text with a convention, which is the state 0010 says
the factory must not be in.

One drift is recorded in the source itself: the `disclaimers` document sets
`contains_emotional_support=False` with the comment *"per schema (stored value
'true' is the drift)"* (`scripts/ingest_kb.py:115`). The indexed KB and the script
disagree on one value, and the script is the stated intent. That is evidence that
metadata drifts silently once ingested — there is no reconciliation step.

## Options considered

1. **Adopt the 9 keys as the factory's schema**, with `language` and `source`
   becoming per-app values instead of constants, and `doc_type` / `procedure_type`
   promoted from free strings to per-app enumerations declared in the app's config.
2. **Adopt a minimal generic core** — `doc_type`, `topic_tags`, `language`,
   `source`, `version` — and let each app declare additional keys. Gali's four
   clinical keys become Gali's extension, not everyone's.
3. **Copy the 9 keys verbatim**, including the two hard-coded values, and accept
   that the factory is a gynaecology-department factory.
4. **No metadata schema.** Documents are markdown with an id and a title, as the
   spec says. Retrieval filtering is lost.

## Recommendation

**Option 2 — a small generic core plus a per-app extension — and treat the four
clinical keys as Gali's extension rather than the factory's contract.**

The argument against option 1 or 3 is that `gestational_age_max_weeks` is not a
property of documents in general; it is a property of documents in an obstetrics
knowledge base. A factory whose universal document schema has a gestational-age
field is a factory that has decided what kind of app it hosts. Option 3 makes that
explicit and is defensible if the honest answer is "this factory exists to clone
Gali for other departments of the same hospital" — which it might be, and that is
EB's call, not an inference.

The core worth making universal is the five keys that are about *documents*:
`doc_type`, `topic_tags`, `language`, `source`, `version`. Every knowledge base needs
to know what kind of document something is, what it is about, what language it is
in, where it came from, and when it was approved.

Two things to fix while adopting anything:

- **`doc_type` and `procedure_type` should be closed sets per app**, declared in
  the app's config and validated against it. Today they are free strings with a
  three-value convention, which is exactly the free-text-with-a-promise state 0010
  set out to prevent.
- **`version` is an approval date, and it should be checked against the document's
  actual approval**, not defaulted. The `partner_std` document already carries a
  FLAG in its own comment saying the clinical approval date is unconfirmed and the
  value is the *creation* date (`scripts/ingest_kb.py:143-146`). A defaulted
  approval date on clinical content is a provenance claim nobody made.

The genuinely hard question, and the reason this is a draft: **who is allowed to set
the clinical booleans.** Recommend they are not free creator input in the general
case — either derived, or set by a reviewer role (0024's role split), or gated behind
a warning. A creator with a form field labelled "contains red flags" will set it
wrong eventually, and the failure mode is a document about haemorrhage that
retrieval de-prioritises.

## Consequences

- 0010's "defined structure" becomes concrete: structured metadata over free
  markdown, with the core validated by the factory and the extension validated
  against the app's own declaration.
- `AppConfig` grows the per-app pieces: the allowed `doc_type` values, the `source`
  string, and whatever `language` becomes after Q4. `dataFiles` stays BLOCKED until
  0010 and this ADR are both accepted.
- The full 9-key schema is already copied into `lib/gali/constants.ts` with its
  validation rules, so app #1's real schema is available for a golden test whichever
  option is chosen.
- Filtered retrieval becomes possible (and is presumably why the keys exist), which
  is a capability the spec never mentions and which the Data Center could expose.
- The recorded `contains_emotional_support` drift means adopting any schema needs a
  reconciliation step — read the indexed metadata back and compare — or the factory
  will inherit the same silent divergence.
