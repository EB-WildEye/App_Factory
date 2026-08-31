# 0010 — Data file structure a creator must supply

Status: DRAFT — not accepted. EB decides.
Date: 2026-08-23
Recommendation added: 2026-08-31

## Context

Marked TBD by the spec, in the Open section: *"The data file — which structure
the creator must supply before an app can be created."*

What the spec does say:

- **F3**: *"Data goes in through the UI in a defined structure, not as free
  text. Each section here becomes one markdown file later — which is what makes
  editing and re-embedding a single file possible."* Shape shown:
  `{ id, title, body_md }`, with example ids `prep`, `aftercare`, `red_flags`,
  23 sections in the illustration.
- **B2**: each section becomes one file under `kb/`, e.g. `kb/prep.md`.
- **Data Center card**: *"Create a new file through a set of structural rules,
  not free text."*
- The build plan, Prompt 3: *"New file — built from a rule-based structure, NOT a
  free-text editor. The structure rules are TBD in the spec. Build screens 1 and
  2, then stop and ask me for the rules before starting screen 3."*

So the question is asked twice — once for the create form (F3, how a creator
supplies the initial knowledge base) and once for the Data Center (adding a file
to an app that already exists). They may or may not be the same rules.

What is undefined:

- The required sections. Is there a fixed list every app must supply (`prep`,
  `aftercare`, `red_flags`, …), a minimum count, or none?
- The structure *within* `body_md`. "Not free text" implies constrained fields
  that render to markdown — but which fields, and are they the same for every
  section type?
- Whether `id` is creator-supplied or derived from `title`, and what it is
  validated against, given it becomes an S3 key.
- Whether `title` survives into the file as a heading or is metadata only.
- What blocks creation: the spec says a structure is required *"before an app can
  be created"*, so this is a validation gate on the create form, not advice.

## Options considered

Not enumerable yet — the rules are content decisions, not technical ones. The
axes that need answers:

1. **Fixed section list** vs **creator-defined sections** vs **fixed core plus
   optional extras**.
2. **Per-section field template** (each section is a form) vs **markdown with a
   validated skeleton** (required headings, checked on save) vs **free markdown
   with only `id` and `title` constrained**.
3. **Same rules for create-form sections and Data-Center new files**, or two
   different structures.

## Recommendation

**The question has an answer in production and nobody has looked at it.** Gali
already enforces "a defined structure, not free text", and it does it with
metadata rather than with body structure. Read on 2026-08-30 and recorded in
`docs/gali-ground-truth.md` §7:

- Every KB document carries a **9-key metadata record**, validated in full before
  any network call: `doc_type`, `procedure_type`,
  `gestational_age_max_weeks` (the only optional key), `topic_tags` (1–10 clean
  strings), `contains_red_flags`, `contains_emotional_support`, `language`,
  `source`, `version` (`YYYY-MM`).
- The **body is ordinary markdown**. There is no field template and no required
  heading skeleton. The only body rule is that the file exists and is at least 50
  characters.
- Documents are keyed on a **creator-chosen `doc_id`** — `induced_abortion`,
  `missed_abortion`, `disclaimers`, `D&C_D&E`, `partner_std`. There is no fixed
  section list; the five documents Gali has are the five it needed.

That is a complete, working answer to all three axes, and it disagrees with the
spec's framing on the axis the spec is most confident about: *structure* in Gali
means **structured metadata over free markdown**, not a constrained body.

So the recommendation, on each axis:

1. **Creator-defined sections, no fixed list.** Gali has no fixed list and app #2
   will not have Gali's sections. A required-sections gate would encode one app's
   information architecture into every app.
2. **Validated metadata, free markdown body.** Adopt the 9-key schema as the
   structure — see 0027, which owns it. `contains_red_flags` and
   `contains_emotional_support` are the two keys worth arguing about, because they
   are clinical claims a non-clinical creator would be asserting.
3. **One structure, two entry points.** The create form and Data Center screen 3
   collect the same thing. Two structures would mean a file added later cannot be
   validated the way the initial batch was.

On the smaller undefined points: `id` creator-supplied and validated as an
S3-safe slug (`^[a-z0-9][a-z0-9_-]*$`), with `path` derived as `kb/<id>.md` **on
the backend**, so the client never constructs an S3 key — that also answers the
`readFile` traversal question in 0015. `title` survives into the file as its H1,
because Gali's markdown files carry their own headings and the KB indexes the body
text only.

One thing this recommendation does **not** resolve: Gali's documents live in a
CUSTOM data source keyed on `doc_id`, not as objects under `kb/`. Whether the
factory's `kb/<id>.md` layout applies to app #1 is 0018, not this ADR.

## Decision

Open — DRAFT. Awaiting EB. The clinical-metadata keys in particular are not an
agent's call.

## Consequences

Per the build plan this blocks **Data Center screen 3 only** — screens
1 (file list) and 2 (edit, save, re-embed one file) are built first and do not
depend on it. It also blocks the data-files step of the create form beyond a
minimal `{ id, title, body }` shape, and it blocks any "app is ready to create"
validation rule.
