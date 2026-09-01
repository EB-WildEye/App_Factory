# 0027 — The per-document KB metadata schema

Status: DRAFT on the key-by-key split. **The model is DECIDED by EB (2026-08-31): a
generic core every app gets, plus a per-app extension.** What is drafted below is
which of Gali's nine keys go on which side.
Date: 2026-08-31
Revised: 2026-08-31, after EB's decision

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

## Decided by EB, 2026-08-31

1. **The schema is a generic core plus a per-app extension.** Not Gali's nine keys
   adopted wholesale, and not a bare `{ id, title, body }`.
2. **`gestational_age_max_weeks` is app-specific, not a factory field.** It is an
   obstetric bound; a knowledge base about anything else has no gestation.

The four options this ADR originally weighed are therefore closed. What follows is a
**proposal for the key-by-key split**, queued for approval as Q26 — proposed, not
applied.

## Proposed split, key by key

The load-bearing distinction turned out not to be "generic key vs app-specific key".
It is **generic key, app-declared vocabulary**: whether *every* knowledge base needs
this axis at all is a separate question from whether the factory gets to decide its
values. `doc_type` is needed by every KB, and its permitted values are Gali's
business.

| # | key | proposed | why | confidence |
| - | --- | -------- | --- | ---------- |
| 1 | `doc_type` | **core**, app-declared values | Every knowledge base needs to know what kind of document something is; retrieval and display both branch on it. Gali's three values are a clinical taxonomy and are not generic. | high |
| 2 | `topic_tags` | **core**, app-declared values | Subject tags are the generic filter axis, and 1–10 clean strings is a generic sanity constraint. The tag set is entirely per app. | high |
| 3 | `language` | **core** | Every document is in a language and a multilingual assistant needs to know which. Gali hard-codes `he`; for the factory this is a per-app value, and it **collides with Q4** — if `AppConfig` gains a top-level `language`, this key should derive from it rather than being typed twice. | high |
| 4 | `source` | **core** | Provenance. In a regulated setting "who authored this" is not optional metadata. Gali's fixed `Wolfson Medical Center` becomes a per-app value. | high |
| 5 | `version` | **core** | An approval date, `YYYY-MM`. Traceability of clinical content is the reason the whole validation apparatus exists; a document with no approval date cannot be audited. | high |
| 6 | `gestational_age_max_weeks` | **app-specific** | Decided by EB. An obstetric bound with no meaning outside obstetrics. | decided |
| 7 | `procedure_type` | **app-specific** | "Procedure" as a classification axis presupposes a procedure-centric domain, and the values (`medication`, `missed_abortion`, `na`) are Gali's clinical taxonomy. An advice-only assistant would carry `na` on every document — which is how you know the axis is not generic. | high |
| 8 | `contains_red_flags` | **core** — closest call | Argued below. | **low, read the argument** |
| 9 | `contains_emotional_support` | **app-specific** | Emotional support as a *retrieval axis* is a property of Gali's care model — the orange flag, the social worker, the ERAN line. Another app may have no emotional pathway at all, and then the key is dead weight on every document. | medium |

### The one to argue about: `contains_red_flags`

Proposed **core**, and it is the weakest row in the table.

**For core:** the factory's own prompt model already assumes escalation. The spec's
`_FORMAT_AND_FLAGS` part names three machine-read flags — `[REFERRAL]`,
`[RED_FLAG]`, `[OUT_OF_SCOPE]` — so "this content is escalation-worthy" is a concept
the *architecture* carries, not one Gali invented. Any app that can refer a user
onward needs to know which documents describe the situations that trigger a referral.

**Against core:** an app with nothing to escalate to — an internal policy assistant,
a scheduling helper — carries a boolean that is `false` on every document forever.
A field that is never anything but `false` is not a schema field, it is a comment.

The honest resolution is probably a third category this ADR does not currently have:
**conditionally core** — core for any app that declares an escalation pathway, absent
for the rest. Worth deciding deliberately rather than by forcing the key into one of
two boxes, which is why the row is marked low confidence.

### Two things the split must fix either way

- **`doc_type` and `procedure_type` are declared as free strings and used as closed
  sets.** `scripts/ingest_kb.py` validates them as "any string" while only three and
  three values exist. Whichever side they land on, they should be per-app
  enumerations validated against the app's own declaration — otherwise the factory
  has reproduced exactly the free-text-with-a-convention state ADR 0010 exists to
  prevent.
- **`version` must not be defaulted.** The `partner_std` document already carries a
  FLAG in its own comment saying the clinical approval date is unconfirmed and the
  value is the *creation* date (`scripts/ingest_kb.py:143-146`). A defaulted approval
  date is a provenance claim nobody made.

## Decided separately by EB, 2026-08-31 — how clinical tags are set and reviewed

Recorded as decided, not proposed:

- **The data-entry person sets the clinical tags, in the Data Center.** They are
  human input on the document, entered where the document is authored — not derived
  and not inferred at ingest time.
- **An agent pass reviews them and surfaces disagreements to a human.** The agent
  does not correct, overwrite or silently normalise a tag. It raises "this document
  describes haemorrhage and `contains_red_flags` is false", and a person decides.

Why this deserves its own section: it resolves the objection this ADR originally
raised — that a creator with a form field labelled "contains red flags" will
eventually set it wrong, and the failure mode is a haemorrhage document that
retrieval de-prioritises. The answer is neither "trust the creator" nor "let the
model decide". It is a review pass whose output is **a disagreement for a human**,
which keeps the clinical claim attached to a person while still catching the typo.

Consequences of that, which are UI work rather than schema work:

- The Data Center needs somewhere to show a disagreement, and a state for "flagged,
  not yet resolved". A document can be ingested and simultaneously disputed.
- The agent pass is a second consumer of the document body, so it runs **after
  save** and is not a save-time validator. It must not block saving.
- A disagreement is not an error state on the app. It is an item of work.
- Overwriting is explicitly out: an agent that silently fixed a tag would destroy the
  evidence that a human's clinical judgement and the model's disagreed, and that
  evidence is the only signal worth having here.
- It composes with the reconciliation step below: an agent that reads indexed
  metadata back can surface *drift* the same way it surfaces disagreement.

## Consequences

- 0010's "defined structure" becomes concrete: structured metadata over free
  markdown, with a core the factory validates and an extension validated against the
  app's own declaration.
- `AppConfig` grows the per-app pieces: the extension's key definitions, the allowed
  `doc_type` values, the `source` string, and whatever `language` becomes after Q4.
  `dataFiles` stays BLOCKED until 0010 and this ADR are both accepted.
- **The extension needs a shape of its own**, and that is new work this decision
  creates: a per-app declaration of extra keys with their types and validation, which
  is a small schema language. The cheap version is a fixed list of typed key
  definitions — `name`, `type`, `required`, and for strings an optional enum. Anything
  richer should be resisted.
- Bedrock's `inlineAttributes` primitives bound the extension's type system to
  `STRING`, `NUMBER`, `BOOLEAN`, `STRING_LIST` (`scripts/ingest_kb.py:201-214`).
- Filtered retrieval becomes possible, which the spec never mentions and the Data
  Center could expose.
- The recorded `contains_emotional_support` drift means adopting any schema needs a
  reconciliation step — read the indexed metadata back and compare — or the factory
  inherits the same silent divergence.
- The full 9-key schema and its validation rules stay copied in
  `lib/gali/constants.ts` as the record of app #1, whichever way the split goes.
